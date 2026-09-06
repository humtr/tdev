import { createHash } from 'node:crypto';
import { lstat, mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  ContractError,
  assertDigest,
  assertIdentifier,
  assertRecordShape,
  assertSafeInteger,
  assertScalarString,
  canonicalClone,
  canonicalJson,
  deepFreeze,
  digest,
  isPlainRecord,
  strictJsonParse,
  typedDigest,
} from './canonical.mjs';
import { DEFAULT_LIMITS, DEFAULT_PATH_POLICY, validateRelativePath } from './policy.mjs';
import { normalizeChangeSet } from './results.mjs';
import { runGitCommand } from './git-projection.mjs';
import {
  runModelSubprocess,
  GitRepositoryModelExecutor,
  REPOSITORY_CONTEXT_PROFILE,
  LAZY_REPOSITORY_CONTEXT_PROFILE,
} from './repository-model-transport.mjs';
import {
  CODEX_MODEL_BINDING_PROFILE,
  CODEX_EXECUTION_BOUNDARY,
  CODEX_OPERATION_ARGUMENTS,
  developmentOperationCapabilityId,
  executeDevelopmentOperation,
  normalizeDevelopmentOperationRequest,
  normalizeDevelopmentOperationManifest,
} from './development-operation-profile.mjs';
import { LocalAgentRuntime, createLocalExecutionStartError } from './local-agent-runtime.mjs';
import { normalizeRepositoryBaseIdentity } from './lazy-plan-reference.mjs';

export const CODEX_EXEC_MODEL_PROFILE = CODEX_MODEL_BINDING_PROFILE;
export const CODEX_DISCLOSURE_PROFILE = 'tdev.openai-codex-full-context.trusted-local.v1';
export const NPM_CHECK_VALIDATION_PROFILE = 'tdev.validation.npm-check.v1';
export const DEVELOPMENT_OPERATION_RESULT_PROFILE = 'tdev.development-operation-result.v1';

export const CODEX_ARGUMENTS = CODEX_OPERATION_ARGUMENTS;
const CODEX_MAX_PROMPT_BYTES = 16 * 1024 * 1024;
const CODEX_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const CODEX_MAX_STDERR_BYTES = 64 * 1024;
const DEFAULT_OPERATION_TIMEOUT_MS = 300_000;
const DEFAULT_CANCEL_GRACE_MS = 2_000;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
const TERMUX_PREFIX = '/data/data/com.termux/files/usr';
const CANDIDATE_DIGEST_DOMAIN = 'tdev.disposable-candidate.v1';

function fail(code, message, details = undefined, options = undefined) {
  throw new ContractError(code, message, details, options);
}

function validateCaseResultEnvelopeTemplate(template) {
  if (!isPlainRecord(template)) fail('development_runtime_result_template_invalid', 'Result envelope template must be a record');
  assertRecordShape(template, [
    'caseId', 'planRevisionId', 'planDigest', 'taskId', 'attemptId', 'executorId', 'executorEpoch',
    'claimLeaseToken', 'claimLeaseGeneration', 'claimLeaseClaimsDigest',
  ], [], 'result envelope template');
  for (const field of ['caseId', 'planRevisionId', 'taskId', 'attemptId', 'executorId']) assertIdentifier(template[field], `result envelope template.${field}`);
  assertDigest(template.planDigest, 'result envelope template.planDigest');
  assertSafeInteger(template.executorEpoch, 'result envelope template.executorEpoch', { min: 1 });
  if (template.claimLeaseToken !== null) assertDigest(template.claimLeaseToken, 'result envelope template.claimLeaseToken');
  if (template.claimLeaseGeneration !== null) assertSafeInteger(template.claimLeaseGeneration, 'result envelope template.claimLeaseGeneration', { min: 1 });
  if (template.claimLeaseClaimsDigest !== null) assertDigest(template.claimLeaseClaimsDigest, 'result envelope template.claimLeaseClaimsDigest');
  if ((template.claimLeaseToken === null) !== (template.claimLeaseGeneration === null) ||
      (template.claimLeaseToken === null) !== (template.claimLeaseClaimsDigest === null)) {
    fail('development_runtime_result_template_invalid', 'Result claim-lease identity must be wholly present or wholly absent');
  }
  return template;
}

export function caseResultEnvelopeFromDispatch({ template, envelope, result } = {}) {
  validateCaseResultEnvelopeTemplate(template);
  if (!isPlainRecord(envelope)) fail('development_runtime_dispatch_invalid', 'Dispatch envelope must be a record');
  for (const field of ['caseId', 'taskId', 'attemptId', 'executorId']) {
    if (envelope[field] !== template[field]) fail('development_runtime_result_identity_mismatch', `Dispatch ${field} does not match the release-bound result template`);
  }
  if (envelope.executorEpoch !== template.executorEpoch) fail('development_runtime_result_identity_mismatch', 'Dispatch executor epoch does not match the result template');
  assertDigest(envelope.fencingToken, 'dispatch fencingToken');
  return deepFreeze({
    ...template,
    fencingToken: envelope.fencingToken,
    result: canonicalClone(result),
  });
}

function boundedText(value, label, maxBytes = 8 * 1024) {
  assertScalarString(value, label);
  if (value.length === 0 || value.includes('\0') || Buffer.byteLength(value, 'utf8') > maxBytes) {
    fail('development_runtime_text_invalid', `${label} is outside its bound`);
  }
  return value;
}

function absolutePath(value, label) {
  boundedText(value, label, 4_096);
  if (!path.isAbsolute(value)) fail('development_runtime_path_invalid', `${label} must be absolute`);
  return path.resolve(value);
}

function positiveBound(value, label, max = Number.MAX_SAFE_INTEGER) {
  return assertSafeInteger(value, label, { min: 1, max });
}

export function codexLauncherHome(codexHome) {
  const profileParent = path.dirname(codexHome);
  return path.basename(profileParent) === '.codex-profiles'
    ? path.dirname(profileParent)
    : profileParent;
}

function runtimeEnvironment({ executable, codexHome = null, temporaryDirectory = null, extra = {} } = {}) {
  const directories = [path.dirname(executable), path.dirname(process.execPath), '/system/bin', '/system/xbin'];
  const environment = {
    PATH: [...new Set(directories)].join(':'),
    LANG: 'C.UTF-8',
    LC_ALL: 'C',
    NO_COLOR: '1',
    CODEX_NON_INTERACTIVE: '1',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    ...extra,
  };
  if (codexHome !== null) {
    environment.CODEX_HOME = codexHome;
    environment.HOME = codexLauncherHome(codexHome);
  }
  if (path.resolve(executable).startsWith(`${TERMUX_PREFIX}/`)) {
    environment.PREFIX = TERMUX_PREFIX;
    if (temporaryDirectory !== null) environment.TMPDIR = path.resolve(temporaryDirectory);
  }
  return Object.freeze(environment);
}

function safeObservation(callback, value) {
  if (typeof callback !== 'function') return;
  try { Promise.resolve(callback(deepFreeze(canonicalClone(value)))).catch(() => {}); }
  catch { /* observations are non-authoritative */ }
}

function processStillExists(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    if (cause?.code === 'EPERM') return true;
    return false;
  }
}

function processGroupStillExists(processGroupId) {
  if (!Number.isSafeInteger(processGroupId) || processGroupId <= 0 || process.platform === 'win32') return false;
  try {
    process.kill(-processGroupId, 0);
    return true;
  } catch (cause) {
    if (cause?.code === 'EPERM') return true;
    return false;
  }
}

/**
 * Owns the disposable process and candidate lifecycle for a trusted-local run.
 * The warden never infers cleanup from a promise result: it records a launch,
 * observes process close, removes the candidate, and verifies its absence.
 */
export class DevelopmentWarden {
  constructor({ workspaceRoot = null } = {}) {
    this.workspaceRoot = absolutePath(workspaceRoot === null ? os.tmpdir() : workspaceRoot, 'workspaceRoot');
    this.processes = new Map();
    this.workspaces = new Map();
    this.candidates = new Map();
    this.evidence = [];
  }

  #assertOwnedRoot(root, label) {
    if (this.workspaceRoot === null) return;
    const relative = path.relative(this.workspaceRoot, root);
    if (relative === '' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      fail('development_warden_workspace_invalid', `${label} is outside the warden workspace root`);
    }
  }

  registerProcess({ operationId, pid, processGroupId = pid } = {}) {
    if (typeof operationId !== 'string' || operationId.length === 0 || !Number.isSafeInteger(pid) || pid <= 0 ||
        (processGroupId !== null && (!Number.isSafeInteger(processGroupId) || processGroupId <= 0))) {
      fail('development_warden_process_invalid', 'Warden process registration is invalid');
    }
    const key = `${operationId}\0${pid}`;
    if (this.processes.has(key)) fail('development_warden_process_duplicate', 'Warden process identity was already registered');
    const entry = { operationId, pid, processGroupId, started: true, closed: false };
    this.processes.set(key, entry);
    return deepFreeze({ operationId, pid, processGroupId });
  }

  observeProcessExit({ operationId, pid, code = null, signal = null } = {}) {
    const key = `${operationId}\0${pid}`;
    const entry = this.processes.get(key);
    if (!entry) return;
    entry.closed = true;
    entry.code = code;
    entry.signal = signal;
  }

  async cleanupOperation(operationId) {
    const entries = [...this.processes.values()].filter((entry) => entry.operationId === operationId);
    const unresolved = entries.filter((entry) => !entry.closed || processStillExists(entry.pid) || processGroupStillExists(entry.processGroupId));
    if (unresolved.length > 0) {
      return deepFreeze({ cleanupComplete: false, operationId, livePids: unresolved.filter((entry) => processStillExists(entry.pid)).map((entry) => entry.pid).sort((a, b) => a - b), liveProcessGroups: unresolved.filter((entry) => processGroupStillExists(entry.processGroupId)).map((entry) => entry.processGroupId).sort((a, b) => a - b), unresolvedPids: unresolved.filter((entry) => !entry.closed).map((entry) => entry.pid).sort((a, b) => a - b) });
    }
    for (const entry of entries) this.processes.delete(`${entry.operationId}\0${entry.pid}`);
    const receipt = { cleanupComplete: true, operationId, processCount: entries.length, observedExit: entries.every((entry) => entry.closed) };
    this.evidence.push(receipt);
    return deepFreeze(receipt);
  }

  registerWorkspace({ workspaceId, root, operationId = null, kind = 'disposable' } = {}) {
    if (typeof workspaceId !== 'string' || workspaceId.length === 0 || typeof root !== 'string' || root.length === 0) {
      fail('development_warden_workspace_invalid', 'Warden workspace registration is invalid');
    }
    const normalizedRoot = absolutePath(root, 'workspace root');
    this.#assertOwnedRoot(normalizedRoot, 'Workspace root');
    if (operationId !== null && (typeof operationId !== 'string' || operationId.length === 0)) {
      fail('development_warden_workspace_invalid', 'Warden workspace operation identity is invalid');
    }
    if (this.workspaces.has(workspaceId)) fail('development_warden_workspace_duplicate', 'Warden workspace identity was already registered');
    this.workspaces.set(workspaceId, { workspaceId, root: normalizedRoot, operationId, kind });
    return deepFreeze({ workspaceId, operationId, kind });
  }

  async cleanupWorkspace(workspaceId) {
    const entry = this.workspaces.get(workspaceId);
    if (!entry) return deepFreeze({ cleanupComplete: true, workspaceId, absent: true });
    await rm(entry.root, { recursive: true, force: true });
    let absent = false;
    try { await stat(entry.root); }
    catch (cause) { if (cause?.code === 'ENOENT') absent = true; else throw cause; }
    if (!absent) fail('development_warden_workspace_cleanup_failed', 'Warden could not prove disposable workspace cleanup');
    this.workspaces.delete(workspaceId);
    const receipt = { cleanupComplete: true, workspaceId, absent: true, operationId: entry.operationId, kind: entry.kind };
    this.evidence.push(receipt);
    return deepFreeze(receipt);
  }

  registerCandidate({ candidateTreeDigest, candidateRoot, baseDigest, repositoryCommitOid } = {}) {
    assertDigest(candidateTreeDigest, 'candidateTreeDigest');
    const key = candidateTreeDigest;
    if (typeof candidateRoot !== 'string' || candidateRoot.length === 0) fail('development_warden_candidate_invalid', 'Candidate root is invalid');
    const normalizedRoot = absolutePath(candidateRoot, 'candidateRoot');
    this.#assertOwnedRoot(normalizedRoot, 'Candidate root');
    if (this.candidates.has(key)) fail('development_warden_candidate_duplicate', 'Warden candidate identity was already registered');
    this.candidates.set(key, { candidateTreeDigest, candidateRoot: normalizedRoot, baseDigest, repositoryCommitOid });
    return key;
  }

  async cleanupCandidate(candidateTreeDigest) {
    const entry = this.candidates.get(candidateTreeDigest);
    if (!entry) return deepFreeze({ cleanupComplete: true, candidateTreeDigest, absent: true });
    await rm(entry.candidateRoot, { recursive: true, force: true });
    let absent = false;
    try { await stat(entry.candidateRoot); }
    catch (cause) { if (cause?.code === 'ENOENT') absent = true; else throw cause; }
    if (!absent) fail('development_warden_candidate_cleanup_failed', 'Candidate workspace remained after warden cleanup');
    this.candidates.delete(candidateTreeDigest);
    const receipt = { cleanupComplete: true, candidateTreeDigest, absent: true };
    this.evidence.push(receipt);
    return deepFreeze(receipt);
  }

  async cleanupAll() {
    const receipts = [];
    for (const operationId of [...new Set([...this.processes.values()].map((entry) => entry.operationId))]) {
      receipts.push(await this.cleanupOperation(operationId));
    }
    for (const workspaceId of [...this.workspaces.keys()]) receipts.push(await this.cleanupWorkspace(workspaceId));
    for (const candidateTreeDigest of [...this.candidates.keys()]) receipts.push(await this.cleanupCandidate(candidateTreeDigest));
    return deepFreeze({ cleanupComplete: receipts.every((receipt) => receipt.cleanupComplete === true), receipts });
  }
}

function contextReferenceId(descriptor) {
  return `ctx-${descriptor.contextDigest.slice('sha256:'.length, 'sha256:'.length + 48)}`;
}

function assertContextReference(descriptor, value) {
  const expected = contextReferenceId(descriptor);
  if (value !== undefined && value !== null && value !== expected) {
    fail('development_runtime_context_reference_mismatch', 'Model input does not name the prepared immutable context');
  }
  return expected;
}

function assertPreparedContextIdentity(context, {
  repositoryCommitOid,
  baseDigest,
  objectFormat = null,
  baseIdentity = null,
  repositoryBaseIdentity = null,
} = {}) {
  if (!isPlainRecord(context) || !isPlainRecord(context.descriptor)) {
    fail('development_runtime_context_invalid', 'Prepared context is not an immutable descriptor');
  }
  const descriptor = context.descriptor;
  if (descriptor.commitOid !== undefined && descriptor.commitOid !== repositoryCommitOid) {
    fail('development_runtime_commit_identity_mismatch', 'Prepared context is bound to a different repository commit');
  }
  if (descriptor.baseDigest !== undefined && descriptor.baseDigest !== baseDigest) {
    fail('development_runtime_base_identity_mismatch', 'Prepared context is bound to a different full base digest');
  }
  if (objectFormat !== null && descriptor.objectFormat !== undefined && descriptor.objectFormat !== objectFormat) {
    fail('development_runtime_object_format_mismatch', 'Prepared context is bound to a different Git object format');
  }
  if (baseIdentity !== null && baseIdentity !== undefined) {
    const observed = descriptor.baseIdentity;
    if (!isPlainRecord(observed) || observed.schemaVersion !== 1 || observed.profile !== 'tdev.repository-base-identity.v1' ||
        observed.objectFormat !== baseIdentity.objectFormat || observed.commitOid !== baseIdentity.commitOid ||
        observed.treeOid !== baseIdentity.treeOid || observed.baseDigest !== baseIdentity.baseDigest ||
        observed.manifestDigest !== baseIdentity.manifestDigest) {
      fail('development_runtime_base_identity_mismatch', 'Prepared context does not attest the owner-issued full-base identity');
    }
  }
  if (descriptor.baseIdentity !== undefined && (!isPlainRecord(descriptor.baseIdentity) ||
      descriptor.baseIdentity.schemaVersion !== 1 || descriptor.baseIdentity.profile !== 'tdev.repository-base-identity.v1' ||
      !['sha1', 'sha256'].includes(descriptor.baseIdentity.objectFormat) ||
      descriptor.baseIdentity.commitOid !== repositoryCommitOid || descriptor.baseIdentity.baseDigest !== baseDigest ||
      typeof descriptor.baseIdentity.treeOid !== 'string' || !/^([0-9a-f]{40}|[0-9a-f]{64})$/u.test(descriptor.baseIdentity.treeOid))) {
    fail('development_runtime_base_identity_mismatch', 'Prepared context full-base identity is inconsistent');
  }
  if (descriptor.baseIdentity !== undefined) assertDigest(descriptor.baseIdentity.manifestDigest, 'prepared context manifestDigest');
  if (descriptor.manifestDigest !== undefined && descriptor.baseIdentity?.manifestDigest !== undefined && descriptor.manifestDigest !== descriptor.baseIdentity.manifestDigest) {
    fail('development_runtime_manifest_identity_mismatch', 'Prepared context manifest identity disagrees with its full-base identity');
  }
  if (repositoryBaseIdentity !== null && repositoryBaseIdentity !== undefined) {
    const expected = normalizeRepositoryBaseIdentity(repositoryBaseIdentity, {
      objectFormat: objectFormat ?? repositoryBaseIdentity.objectFormat,
      commitOid: repositoryCommitOid,
    });
    const observed = descriptor.repositoryBaseIdentity;
    if (!isPlainRecord(observed) || observed.profile !== expected.profile || observed.objectFormat !== expected.objectFormat ||
        observed.commitOid !== expected.commitOid || observed.treeOid !== expected.treeOid ||
        observed.baseDigest !== expected.baseDigest || observed.manifestDigest !== expected.manifestDigest) {
      fail('development_runtime_repository_identity_mismatch', 'Prepared context does not attest the complete repository base identity');
    }
  }
  if (descriptor.repositoryBaseIdentity !== undefined) {
    normalizeRepositoryBaseIdentity(descriptor.repositoryBaseIdentity, {
      commitOid: repositoryCommitOid,
      objectFormat: descriptor.repositoryBaseIdentity.objectFormat,
    });
  }
  return context;
}

export function buildCodexPrompt({ repositoryCommitOid, baseDigest, contextReferenceId: referenceId, contextDigest, contextFileCount, instruction, writePaths = null } = {}) {
  return [
    'You are the release-bound tdev development worker.',
    'Inspect the exact Git repository in the current working directory using read-only commands only.',
    'The workspace may be an owner-issued sparse context. Treat files outside the supplied context as unavailable and do not run broad tests, installs, or builds that require them.',
    'The provider does not supply a kernel sandbox; treat this disposable clone as the only workspace and do not rely on bwrap.',
    'Do not mutate files directly, create commits, access network tools, read files outside the working directory, or reveal credentials.',
    'Read-only applies to shell commands only. The JSON ChangeSet is the implementation channel and must contain the actual edits.',
    'The clone must remain clean because the caller applies your result. You MUST implement the requested source change in the returned ChangeSet; never substitute an empty ChangeSet when the instruction is feasible. The returned writes array MUST be non-empty for an implementation instruction: inspect the named files, construct complete replacements, and put those replacements in the JSON result. A no-op is invalid even when the existing tests pass. Do not report that you changed files unless the writes array contains the changes.',
    'Return exactly one JSON object matching the supplied output schema and no Markdown or commentary.',
    'The object must be a result-only ChangeSet against the supplied base digest. Include only relative paths and complete replacement text (or null for deletion).',
    `repositoryCommitOid=${repositoryCommitOid}`,
    `baseDigest=${baseDigest}`,
    `contextReferenceId=${referenceId}`,
    `contextDigest=${contextDigest}`,
    `contextFileCount=${contextFileCount}`,
    `writePaths=${writePaths === null ? 'owner scope not supplied' : writePaths.join(',')}`,
    `instruction=${instruction}`,
  ].join('\n');
}

async function checkedGit({ repositoryPath, args, input = null, signal }) {
  const result = await runGitCommand({ repositoryPath, args, input, signal });
  if (result.code !== 0) fail('development_runtime_git_failed', `Git command failed: ${args[0]}`, { exitCode: result.code, signal: result.signal });
  return result.stdout;
}

async function assertCleanClone({ repositoryPath, signal }) {
  const status = (await checkedGit({ repositoryPath, signal, args: ['status', '--porcelain=v1', '--untracked-files=all', '--ignored=matching'] })).toString('utf8');
  if (status.length !== 0) fail('development_runtime_clone_mutated', 'Codex modified the disposable exact-base repository', { status: status.slice(0, 8192) });
}

async function cloneExactRepository({ repositoryPath, commitOid, workspaceRoot, signal, sparsePaths = null }) {
  const parent = workspaceRoot === undefined || workspaceRoot === null ? os.tmpdir() : absolutePath(workspaceRoot, 'workspaceRoot');
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const clonePath = await mkdtemp(path.join(parent, 'tdev-development-'));
  try {
    await checkedGit({ repositoryPath, signal, args: ['clone', '--no-local', '--no-hardlinks', '--no-checkout', repositoryPath, clonePath] });
    if (sparsePaths !== null) {
      if (!Array.isArray(sparsePaths) || sparsePaths.length === 0) fail('development_runtime_scoped_clone_invalid', 'A scoped model clone requires at least one admitted path');
      await checkedGit({ repositoryPath: clonePath, signal, args: ['sparse-checkout', 'init', '--no-cone'] });
      await checkedGit({
        repositoryPath: clonePath,
        signal,
        args: ['sparse-checkout', 'set', '--no-cone', '--stdin'],
        input: Buffer.from(`${sparsePaths.join('\n')}\n`, 'utf8'),
      });
    }
    // Configure the sparse worktree before checkout. A checkout-first sequence
    // materializes every repository file and defeats the lazy context contract.
    await checkedGit({ repositoryPath: clonePath, signal, args: ['checkout', '--detach', commitOid] });
    const head = (await checkedGit({ repositoryPath: clonePath, signal, args: ['rev-parse', 'HEAD'] })).toString('utf8').trim();
    if (head !== commitOid) fail('development_runtime_clone_identity_mismatch', 'Disposable repository did not bind the requested commit');
    const status = (await checkedGit({ repositoryPath: clonePath, signal, args: ['status', '--porcelain=v1'] })).toString('utf8');
    if (status.length !== 0) fail('development_runtime_clone_dirty', 'Disposable exact-base repository is not clean');
    return clonePath;
  } catch (cause) {
    await rm(clonePath, { recursive: true, force: true });
    throw cause;
  }
}

function safeUsage(value) {
  if (!isPlainRecord(value)) return null;
  const usage = {};
  for (const key of ['input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_output_tokens']) {
    if (value[key] === undefined) continue;
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) return null;
    usage[key] = value[key];
  }
  return Object.keys(usage).length === 0 ? null : usage;
}

export function parseCodexJsonl(bytes, maxBytes = CODEX_MAX_RESPONSE_BYTES) {
  if (!Buffer.isBuffer(bytes)) fail('codex_response_invalid', 'Codex output must be bytes');
  if (bytes.byteLength > maxBytes) fail('codex_response_limit_exceeded', 'Codex JSONL output exceeds its bound');
  let text;
  try { text = UTF8_DECODER.decode(bytes); }
  catch (cause) { fail('codex_response_invalid_utf8', 'Codex JSONL output is not UTF-8', {}, { cause }); }
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.length === 0) fail('codex_terminal_output_missing', 'Codex returned no JSONL events');
  const terminal = [];
  let usage = null;
  for (const [index, line] of lines.entries()) {
    if (line.length === 0) fail('codex_jsonl_malformed', `Codex JSONL event ${index} is empty`);
    let event;
    try { event = strictJsonParse(line, { maxBytes }); }
    catch (cause) { fail('codex_jsonl_malformed', `Codex JSONL event ${index} is invalid`, {}, { cause }); }
    if (!isPlainRecord(event) || typeof event.type !== 'string') fail('codex_jsonl_malformed', `Codex JSONL event ${index} has no type`);
    if (event.type === 'item.completed' && event.item?.type === 'command_execution' && event.item.status === 'failed') {
      fail('codex_command_execution_failed', 'Codex could not execute a required repository inspection command', {
        exitCode: Number.isSafeInteger(event.item.exit_code) ? event.item.exit_code : null,
      });
    }
    if (event.type === 'error' || event.type === 'turn.failed') {
      const message = typeof event.message === 'string'
        ? event.message
        : typeof event.error?.message === 'string' ? event.error.message : '';
      const error = new ContractError('codex_provider_failed', 'Codex reported a failed turn', {
        eventType: event.type,
        providerFailureClass: /credit|quota|billing/iu.test(message) ? 'credits_or_quota' : 'unknown',
        certainty: 'unknown',
      });
      error.certainty = 'unknown';
      error.retryable = true;
      throw error;
    }
    if (event.type === 'turn.completed') usage = safeUsage(event.usage);
    if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
      if (typeof event.item.text !== 'string' || event.item.text.length === 0) fail('codex_terminal_output_invalid', 'Codex terminal agent message is empty');
      terminal.push(event.item.text);
    }
  }
  if (terminal.length === 0) fail('codex_terminal_output_missing', 'Codex returned no terminal agent message');
  const structured = [];
  for (const text of terminal) {
    try { structured.push(strictJsonParse(text, { maxBytes })); }
    catch { /* Codex may emit bounded progress text before its structured result. */ }
  }
  if (structured.length === 0) fail('codex_terminal_output_invalid', 'Codex returned no strict JSON terminal result');
  if (structured.length !== 1) fail('codex_terminal_output_duplicate', 'Codex returned multiple structured terminal results', { count: structured.length });
  return { result: structured[0], usage, terminalMessageCount: terminal.length, auxiliaryTerminalMessages: terminal.length - structured.length };
}

function classifyCodexProcessFailure(processResult) {
  let providerEvent = null;
  let providerMessage = '';
  try {
    const text = UTF8_DECODER.decode(processResult.stdout);
    for (const line of text.split('\n')) {
      if (line.length === 0) continue;
      const event = strictJsonParse(line, { maxBytes: CODEX_MAX_RESPONSE_BYTES });
      if (event?.type === 'error' || event?.type === 'turn.failed') {
        providerEvent = event.type;
        providerMessage = typeof event.message === 'string'
          ? event.message
          : typeof event.error?.message === 'string' ? event.error.message : '';
        break;
      }
    }
  } catch { /* retain the bounded process failure when provider output is not JSONL */ }
  if (providerEvent !== null) {
    const error = new ContractError('codex_provider_failed', 'Codex provider reported a failed turn', {
      exitCode: processResult.code,
      signal: processResult.signal,
      stdoutBytes: processResult.stdoutBytes,
      stderrBytes: processResult.stderrBytes,
      eventType: providerEvent,
      providerFailureClass: /credit|quota|billing/iu.test(providerMessage) ? 'credits_or_quota' : 'provider_error',
      certainty: 'unknown',
    });
    error.certainty = 'unknown';
    error.retryable = true;
    return error;
  }
  const error = new ContractError('codex_process_failed', 'Codex process exited unsuccessfully', {
    exitCode: processResult.code,
    signal: processResult.signal,
    stdoutBytes: processResult.stdoutBytes,
    stderrBytes: processResult.stderrBytes,
    certainty: 'unknown',
  });
  error.certainty = 'unknown';
  return error;
}

function normalizedChangeSet(result, baseDigest, evidence) {
  if (!isPlainRecord(result)) fail('codex_changeset_invalid', 'Codex terminal output must be a ChangeSet record');
  try {
    return normalizeChangeSet('codex', { ...canonicalClone(result), evidence: canonicalClone(evidence) }, { baseDigest, pathPolicy: DEFAULT_PATH_POLICY, limits: DEFAULT_LIMITS });
  } catch (cause) {
    fail(cause?.code ?? 'codex_changeset_invalid', cause?.message ?? 'Codex ChangeSet is invalid', cause?.details, { cause });
  }
}

function assertWriteScope(result, writePaths) {
  if (result.writes.length === 0) fail('development_runtime_empty_changeset', 'Implementation operation returned an empty ChangeSet');
  if (writePaths === undefined || writePaths === null) return;
  if (!Array.isArray(writePaths) || writePaths.length === 0) fail('development_runtime_write_scope_invalid', 'writePaths must be a non-empty owner-issued list');
  const allowed = new Set(writePaths);
  for (const write of result.writes) {
    if (!allowed.has(write.path)) fail('development_runtime_write_scope_denied', `ChangeSet path is outside the owner-issued write scope: ${write.path}`);
  }
}

export class CodexExecRepositoryModelExecutor {
  constructor({ repositoryPath, codexExecutable, codexHome, outputSchemaPath, outputSchemaSha256 = null, contextExcludedPaths = [], model = null, reasoningEffort = null, codexArguments = CODEX_ARGUMENTS, timeoutMs = DEFAULT_OPERATION_TIMEOUT_MS, cancelGraceMs = DEFAULT_CANCEL_GRACE_MS, workspaceRoot = null, observation = null, modelRunner = runModelSubprocess, contextAdapter = null, warden = null } = {}) {
    this.repositoryPath = absolutePath(repositoryPath, 'repositoryPath');
    this.codexExecutable = absolutePath(codexExecutable, 'codexExecutable');
    this.codexHome = absolutePath(codexHome, 'codexHome');
    this.outputSchemaPath = absolutePath(outputSchemaPath, 'outputSchemaPath');
    this.outputSchemaSha256 = outputSchemaSha256 === null ? null : assertDigest(outputSchemaSha256, 'outputSchemaSha256');
    this.model = model === null ? null : boundedText(model, 'model', 256);
    this.reasoningEffort = reasoningEffort === null ? null : boundedText(reasoningEffort, 'reasoningEffort', 64);
    if (!Array.isArray(codexArguments) || canonicalJson(codexArguments) !== canonicalJson(CODEX_OPERATION_ARGUMENTS)) fail('development_runtime_arguments_invalid', 'Codex arguments do not match the release-bound no-bwrap template');
    this.codexArguments = Object.freeze([...codexArguments]);
    this.timeoutMs = positiveBound(timeoutMs, 'timeoutMs', 600_000);
    this.cancelGraceMs = assertSafeInteger(cancelGraceMs, 'cancelGraceMs', { min: 0, max: 60_000 });
    this.workspaceRoot = workspaceRoot === null ? null : absolutePath(workspaceRoot, 'workspaceRoot');
    if (observation !== null && typeof observation !== 'function') fail('development_runtime_observation_invalid', 'observation must be a function or null');
    if (typeof modelRunner !== 'function') fail('development_runtime_model_runner_invalid', 'modelRunner must be a function');
    this.observation = observation;
    this.modelRunner = modelRunner;
    this.warden = warden;
    this.contextAdapter = contextAdapter ?? new GitRepositoryModelExecutor({ repositoryPath: this.repositoryPath, modelExecutable: this.codexExecutable, timeoutMs: this.timeoutMs, excludedPaths: contextExcludedPaths, limits: { maxResponseBytes: CODEX_MAX_RESPONSE_BYTES, maxStderrBytes: CODEX_MAX_STDERR_BYTES } });
    if (!this.contextAdapter || typeof this.contextAdapter.materializeContext !== 'function') fail('development_runtime_context_adapter_invalid', 'contextAdapter must materialize immutable context');
    Object.freeze(this);
  }

  async materializeContext(repositoryCommitOid, baseDigest, { signal, scope = null, objectFormat = null, baseIdentity = null, repositoryBaseIdentity = null } = {}) {
    const context = scope !== null && typeof this.contextAdapter.materializeScopedContext === 'function'
      ? await this.contextAdapter.materializeScopedContext(repositoryCommitOid, baseDigest, { signal, scope, repositoryBaseIdentity })
      : await this.contextAdapter.materializeContext(repositoryCommitOid, baseDigest, { signal, scope, repositoryBaseIdentity });
    return assertPreparedContextIdentity(context, { repositoryCommitOid, baseDigest, objectFormat, baseIdentity, repositoryBaseIdentity });
  }

  async execute({ repositoryCommitOid, baseDigest, instruction, contextReferenceId = undefined, writePaths = undefined, objectFormat = null, contextProfile = null, contextScope = null, contextScopeDigest = null, baseIdentity = null, repositoryBaseIdentity = null, preparedContext = null, operationId = null, signal = new AbortController().signal } = {}) {
    assertScalarString(repositoryCommitOid, 'repositoryCommitOid');
    assertDigest(baseDigest, 'baseDigest');
    boundedText(instruction, 'instruction', 64 * 1024);
    if (!signal || typeof signal.aborted !== 'boolean') fail('development_runtime_signal_invalid', 'signal must be an AbortSignal');
    if (contextProfile === 'tdev.repository.context.prepare.lazy.v1' && (!isPlainRecord(contextScope) || typeof contextScopeDigest !== 'string')) {
      fail('development_runtime_context_scope_missing', 'Lazy model execution requires the owner-issued context scope and scope digest');
    }
    if (contextScopeDigest !== null && contextScopeDigest !== undefined) assertDigest(contextScopeDigest, 'contextScopeDigest');
    const context = preparedContext === null
      ? await this.materializeContext(repositoryCommitOid, baseDigest, { signal, scope: contextProfile === 'tdev.repository.context.prepare.lazy.v1' ? contextScope : null, objectFormat, baseIdentity, repositoryBaseIdentity })
      : assertPreparedContextIdentity(preparedContext, { repositoryCommitOid, baseDigest, objectFormat, baseIdentity, repositoryBaseIdentity });
    const expectedDescriptorProfile = contextProfile === 'tdev.repository.context.prepare.lazy.v1'
      ? LAZY_REPOSITORY_CONTEXT_PROFILE
      : contextProfile === 'tdev.repository.context.prepare.v1' ? REPOSITORY_CONTEXT_PROFILE : null;
    if (expectedDescriptorProfile !== null && context.descriptor.profile !== expectedDescriptorProfile) {
      fail('development_runtime_context_profile_mismatch', 'Prepared context profile does not match the model operation profile');
    }
    if (contextProfile === 'tdev.repository.context.prepare.lazy.v1' && context.descriptor.scopeDigest !== contextScopeDigest) {
      fail('development_runtime_context_scope_mismatch', 'Prepared context scope does not match the model operation scope');
    }
    const referenceId = assertContextReference(context.descriptor, contextReferenceId);
    const sparsePaths = context.descriptor.profile === 'tdev.repository-context.git-scoped-lazy.v1'
      ? context.files?.map((file) => file.path).filter((filePath) => typeof filePath === 'string') ?? null
      : null;
    const clonePath = await cloneExactRepository({ repositoryPath: this.repositoryPath, commitOid: repositoryCommitOid, workspaceRoot: this.workspaceRoot, signal, sparsePaths });
    const workspaceId = typedDigest('tdev.model-workspace.v1', {
      schemaVersion: 1,
      operationId: operationId ?? null,
      repositoryCommitOid,
      contextReferenceId: referenceId,
      clonePathDigest: digest(clonePath),
    });
    if (this.warden !== null) {
      try {
        this.warden.registerWorkspace({ workspaceId, root: clonePath, operationId, kind: 'model-clone' });
      } catch (cause) {
        await rm(clonePath, { recursive: true, force: true });
        throw cause;
      }
    }
    let workspaceCleanup = null;
    const processOperationId = operationId ?? `codex:${repositoryCommitOid}`;
    let processCleanup = null;
    const cleanupProcess = async () => {
      if (processCleanup !== null) return processCleanup;
      if (this.warden === null) {
        processCleanup = { cleanupComplete: true, operationId: processOperationId, processCount: 0, observedExit: true };
        return processCleanup;
      }
      processCleanup = await this.warden.cleanupOperation(processOperationId);
      if (processCleanup.cleanupComplete !== true) fail('development_runtime_process_cleanup_incomplete', 'Warden could not prove model process-group cleanup');
      return processCleanup;
    };
    const cleanupWorkspace = async () => {
      if (workspaceCleanup !== null) return workspaceCleanup;
      if (this.warden !== null) workspaceCleanup = await this.warden.cleanupWorkspace(workspaceId);
      else {
        await rm(clonePath, { recursive: true, force: true });
        try { await stat(clonePath); fail('development_runtime_clone_cleanup_failed', 'Codex exact-base clone remained after execution'); }
        catch (cleanupError) { if (cleanupError?.code !== 'ENOENT') throw cleanupError; }
        workspaceCleanup = { cleanupComplete: true, workspaceId, absent: true, kind: 'model-clone' };
      }
      return workspaceCleanup;
    };
    const started = performance.now();
    try {
      const schemaBytes = await readFile(this.outputSchemaPath);
      const schemaDigest = `sha256:${createHash('sha256').update(schemaBytes).digest('hex')}`;
      if (this.outputSchemaSha256 !== null && schemaDigest !== this.outputSchemaSha256) {
        fail('codex_output_schema_mismatch', 'Codex output schema digest does not match the release binding', { expected: this.outputSchemaSha256, observed: schemaDigest });
      }
      const prompt = buildCodexPrompt({
        repositoryCommitOid,
        baseDigest,
        contextReferenceId: referenceId,
        contextDigest: context.descriptor.contextDigest,
        contextFileCount: context.descriptor.fileCount,
        instruction,
        writePaths,
      });
      const input = Buffer.from(prompt, 'utf8');
      if (input.byteLength > CODEX_MAX_PROMPT_BYTES) fail('codex_prompt_limit_exceeded', 'Codex prompt exceeds its bound');
      const args = [...this.codexArguments, '--output-schema', this.outputSchemaPath];
      if (this.model !== null) args.push('--model', this.model);
      if (this.reasoningEffort !== null) args.push('-c', `model_reasoning_effort=${this.reasoningEffort}`);
      const processResult = await this.modelRunner({ executable: this.codexExecutable, args, input, environment: runtimeEnvironment({ executable: this.codexExecutable, codexHome: this.codexHome, temporaryDirectory: clonePath }), workingDirectory: clonePath, timeoutMs: this.timeoutMs, signal, maxStdoutBytes: CODEX_MAX_RESPONSE_BYTES, maxStderrBytes: CODEX_MAX_STDERR_BYTES, warden: this.warden, operationId: processOperationId });
      const processCleanupReceipt = await cleanupProcess();
      if (processResult.code !== 0) throw classifyCodexProcessFailure(processResult);
      await assertCleanClone({ repositoryPath: clonePath, signal });
      const parsed = parseCodexJsonl(processResult.stdout, CODEX_MAX_RESPONSE_BYTES);
      const evidence = { runtimeProfile: CODEX_EXEC_MODEL_PROFILE, executionBoundary: CODEX_EXECUTION_BOUNDARY, sandboxMode: 'none', workspaceMutation: 'clean', disclosureProfile: CODEX_DISCLOSURE_PROFILE, repositoryCommitOid, contextDigest: context.descriptor.contextDigest, outputSchemaPath: this.outputSchemaPath, outputSchemaSha256: schemaDigest, processStarts: 1, processReuses: 0, stdoutBytes: processResult.stdoutBytes, stderrBytes: processResult.stderrBytes, durationMs: processResult.durationMs, usage: parsed.usage, terminalMessageCount: parsed.terminalMessageCount, auxiliaryTerminalMessages: parsed.auxiliaryTerminalMessages, processCleanup: processCleanupReceipt };
      const result = normalizedChangeSet(parsed.result, baseDigest, evidence);
      assertWriteScope(result, writePaths);
      const cleanup = await cleanupWorkspace();
      const returned = deepFreeze({ ...result, evidence: { ...result.evidence, workspaceCleanup: cleanup } });
      safeObservation(this.observation, { ...evidence, workspaceCleanup: cleanup, outcome: 'returned', totalDurationMs: Math.max(0, Math.round(performance.now() - started)) });
      return returned;
    } catch (cause) {
      safeObservation(this.observation, { runtimeProfile: CODEX_EXEC_MODEL_PROFILE, executionBoundary: CODEX_EXECUTION_BOUNDARY, sandboxMode: 'none', repositoryCommitOid, contextDigest: context.descriptor.contextDigest, processStarts: cause?.details?.processStarts === 0 ? 0 : 1, outcome: cause?.code ?? 'codex_failed', failureClass: cause?.details?.providerFailureClass ?? 'unknown', certainty: cause?.certainty === 'not_applied' || cause?.certainty === 'unknown' ? cause.certainty : 'unknown' });
      throw cause;
    } finally {
      let cleanupFailure = null;
      try { await cleanupProcess(); } catch (cause) { cleanupFailure = cause; }
      try { await cleanupWorkspace(); } catch (cause) { cleanupFailure ??= cause; }
      if (cleanupFailure !== null) throw cleanupFailure;
    }
  }
}

export class NpmCheckValidationExecutor {
  constructor({ npmExecutable, timeoutMs = DEFAULT_OPERATION_TIMEOUT_MS, cancelGraceMs = DEFAULT_CANCEL_GRACE_MS, warden = null } = {}) {
    this.npmExecutable = absolutePath(npmExecutable, 'npmExecutable');
    this.timeoutMs = positiveBound(timeoutMs, 'timeoutMs', 600_000);
    this.cancelGraceMs = assertSafeInteger(cancelGraceMs, 'cancelGraceMs', { min: 0, max: 60_000 });
    this.warden = warden;
    Object.freeze(this);
  }

  async execute({ candidateRoot, candidateTreeDigest, validationProfile, operationId = null, signal = new AbortController().signal } = {}) {
    const root = absolutePath(candidateRoot, 'candidateRoot');
    assertDigest(candidateTreeDigest, 'candidateTreeDigest');
    assertIdentifier(validationProfile, 'validationProfile');
    if (validationProfile !== NPM_CHECK_VALIDATION_PROFILE) fail('development_validation_profile_unknown', `Unsupported validation profile: ${validationProfile}`);
    const processOperationId = operationId ?? `validation:${candidateTreeDigest}`;
    const processResult = await runModelSubprocess({ executable: this.npmExecutable, args: ['run', 'check'], input: Buffer.alloc(0), environment: runtimeEnvironment({ executable: this.npmExecutable, temporaryDirectory: root, extra: { npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false', npm_config_offline: 'true' } }), workingDirectory: root, timeoutMs: this.timeoutMs, signal, maxStdoutBytes: CODEX_MAX_RESPONSE_BYTES, maxStderrBytes: CODEX_MAX_STDERR_BYTES, warden: this.warden, operationId: processOperationId });
    const processCleanup = this.warden === null
      ? { cleanupComplete: true, operationId: processOperationId, processCount: 0, observedExit: true }
      : await this.warden.cleanupOperation(processOperationId);
    if (processCleanup.cleanupComplete !== true) fail('development_runtime_process_cleanup_incomplete', 'Warden could not prove validation process-group cleanup');
    const passed = processResult.code === 0 && processResult.signal === null;
    return deepFreeze({ kind: 'validation', passed, checks: [{ id: NPM_CHECK_VALIDATION_PROFILE, passed, message: passed ? null : `npm run check exited ${String(processResult.code ?? processResult.signal ?? 'unknown')}` }], evidence: { validationProfile, candidateTreeDigest, executable: this.npmExecutable, args: ['run', 'check'], network: 'none', stdoutBytes: processResult.stdoutBytes, stderrBytes: processResult.stderrBytes, durationMs: processResult.durationMs, processCleanup } });
  }
}

function candidateTreeDigest({ repositoryCommitOid, baseDigest, repositoryBaseIdentity = null, contextDigest = null, manifestDigest = null, scopeDigest = null, operationId = null, result } = {}) {
  return typedDigest(CANDIDATE_DIGEST_DOMAIN, {
    schemaVersion: 1,
    operationId,
    repositoryCommitOid,
    baseDigest,
    repositoryBaseIdentity,
    contextDigest,
    manifestDigest,
    scopeDigest,
    changeSetDigest: digest(result),
    writes: result.writes.map(({ path: filePath, content }) => ({ path: filePath, content })),
  });
}

async function assertCandidatePathSafe(candidateRoot, filePath) {
  const segments = filePath.split('/');
  let current = candidateRoot;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const entry = await lstat(current);
      if (entry.isSymbolicLink()) fail('development_runtime_candidate_symlink', `Candidate path is a symlink: ${filePath}`);
    } catch (cause) {
      if (cause?.code === 'ENOENT') break;
      throw cause;
    }
  }
}

async function writeCandidateChangeSet({ repositoryPath, commitOid, result, candidateTreeDigest, baseDigest, workspaceRoot, signal, warden = null }) {
  const candidateRoot = await cloneExactRepository({ repositoryPath, commitOid, workspaceRoot, signal });
  let registered = false;
  try {
    if (warden !== null) {
      warden.registerCandidate({ candidateTreeDigest, candidateRoot, baseDigest, repositoryCommitOid: commitOid });
      registered = true;
    }
    for (const write of result.writes) {
      const filePath = validateRelativePath(write.path);
      await assertCandidatePathSafe(candidateRoot, filePath);
      const fullPath = path.join(candidateRoot, ...filePath.split('/'));
      if (write.content === null) {
        await rm(fullPath, { force: true });
        continue;
      }
      await mkdir(path.dirname(fullPath), { recursive: true, mode: 0o700 });
      await writeFile(fullPath, write.content, { mode: 0o600 });
    }
    return candidateRoot;
  } catch (cause) {
    if (registered) {
      try { await warden.cleanupCandidate(candidateTreeDigest); } catch { /* preserve the original write failure; dispose reconciles the residue */ }
    } else {
      await rm(candidateRoot, { recursive: true, force: true });
    }
    throw cause;
  }
}

export class LocalDevelopmentOperationRuntime {
  constructor({ manifest, repositoryPath, codexExecutable, codexHome, outputSchemaPath, npmExecutable, model = null, reasoningEffort = null, workspaceRoot = null, contextAdapter = null, observation = null, warden = null, modelRunner = runModelSubprocess } = {}) {
    this.manifest = normalizeDevelopmentOperationManifest(manifest);
    this.repositoryPath = absolutePath(repositoryPath, 'repositoryPath');
    this.workspaceRoot = workspaceRoot === null ? null : absolutePath(workspaceRoot, 'workspaceRoot');
    const modelProfile = this.manifest.profiles['tdev.model.repository.execute.v1'];
    const validationProfile = this.manifest.profiles['tdev.repository.validate.v1'];
    if (!modelProfile || modelProfile.binding?.profile !== CODEX_EXEC_MODEL_PROFILE || modelProfile.binding?.executionBoundary !== CODEX_EXECUTION_BOUNDARY || !validationProfile || validationProfile.binding?.profile !== NPM_CHECK_VALIDATION_PROFILE) {
      fail('development_runtime_manifest_invalid', 'The runtime requires the release-bound D0043 model and validation profiles');
    }
    this.warden = warden ?? new DevelopmentWarden({ workspaceRoot: this.workspaceRoot });
    if (!this.warden || typeof this.warden.registerProcess !== 'function' || typeof this.warden.observeProcessExit !== 'function' ||
        typeof this.warden.cleanupOperation !== 'function' || typeof this.warden.registerWorkspace !== 'function' ||
        typeof this.warden.cleanupWorkspace !== 'function' || typeof this.warden.cleanupCandidate !== 'function') {
      fail('development_runtime_warden_invalid', 'A DevelopmentWarden is required for process, workspace and candidate ownership');
    }
    this.codex = new CodexExecRepositoryModelExecutor({ repositoryPath: this.repositoryPath, codexExecutable, codexHome, outputSchemaPath, outputSchemaSha256: modelProfile.binding.outputSchemaSha256 ?? null, contextExcludedPaths: modelProfile.binding.contextExcludedPaths ?? [], model: model ?? modelProfile.binding.model ?? null, reasoningEffort: reasoningEffort ?? modelProfile.binding.reasoningEffort ?? null, timeoutMs: modelProfile.limits.timeoutMs, cancelGraceMs: modelProfile.limits.cancelGraceMs, workspaceRoot: this.workspaceRoot, codexArguments: modelProfile.argv, contextAdapter, observation, warden: this.warden, modelRunner });
    this.npm = new NpmCheckValidationExecutor({ npmExecutable, timeoutMs: validationProfile.limits.timeoutMs, cancelGraceMs: validationProfile.limits.cancelGraceMs, warden: this.warden });
    this.contexts = new Map();
    this.candidates = new Map();
    this.disposed = false;
  }

  #assertLive() { if (this.disposed) fail('development_runtime_disposed', 'Development runtime has already been disposed'); }

  async contextExecutor({ input, signal }) {
    this.#assertLive();
    const context = await this.codex.materializeContext(input.repositoryCommitOid, input.baseDigest, {
      signal,
      scope: input.scope ?? null,
      objectFormat: input.objectFormat ?? null,
      baseIdentity: input.baseIdentity ?? null,
      repositoryBaseIdentity: input.repositoryBaseIdentity ?? null,
    });
    const referenceId = contextReferenceId(context.descriptor);
    this.contexts.set(referenceId, context);
    return { kind: 'observation', subject: 'repository-context', value: { referenceId, repositoryCommitOid: input.repositoryCommitOid, baseDigest: input.baseDigest, objectFormat: input.objectFormat, contextDigest: context.descriptor.contextDigest, manifestDigest: context.descriptor.manifestDigest ?? context.descriptor.baseIdentity?.manifestDigest ?? null, scopeDigest: context.descriptor.scopeDigest ?? null, baseIdentity: context.descriptor.baseIdentity ?? null, repositoryBaseIdentity: context.descriptor.repositoryBaseIdentity ?? null, fileCount: context.descriptor.fileCount ?? context.descriptor.selectedEntryCount ?? null }, evidence: { contextDigest: context.descriptor.contextDigest, repositoryCommitOid: input.repositoryCommitOid, manifestDigest: context.descriptor.manifestDigest ?? context.descriptor.baseIdentity?.manifestDigest ?? null, scopeDigest: context.descriptor.scopeDigest ?? null, baseIdentity: context.descriptor.baseIdentity ?? null, repositoryBaseIdentity: context.descriptor.repositoryBaseIdentity ?? null, fileCount: context.descriptor.fileCount ?? context.descriptor.selectedEntryCount ?? null } };
  }

  async modelExecutor({ input, operationId = null, signal }) {
    this.#assertLive();
    const context = input.contextReferenceId !== undefined && this.contexts.has(input.contextReferenceId)
      ? this.contexts.get(input.contextReferenceId)
      : await this.codex.materializeContext(input.repositoryCommitOid, input.baseDigest, {
        signal,
        scope: input.contextProfile === 'tdev.repository.context.prepare.lazy.v1' ? input.contextScope : null,
        objectFormat: input.objectFormat ?? null,
        baseIdentity: input.baseIdentity ?? null,
        repositoryBaseIdentity: input.repositoryBaseIdentity ?? null,
      });
    const referenceId = assertContextReference(context.descriptor, input.contextReferenceId);
    try {
      const result = await this.codex.execute({ ...input, contextReferenceId: referenceId, preparedContext: context, operationId, signal });
      const manifestDigest = context.descriptor.manifestDigest ?? context.descriptor.baseIdentity?.manifestDigest ?? null;
      const scopeDigest = context.descriptor.scopeDigest ?? null;
      const repositoryIdentity = context.descriptor.repositoryBaseIdentity ?? input.repositoryBaseIdentity ?? null;
      const candidateDigest = candidateTreeDigest({ repositoryCommitOid: input.repositoryCommitOid, baseDigest: input.baseDigest, repositoryBaseIdentity: repositoryIdentity, contextDigest: context.descriptor.contextDigest, manifestDigest, scopeDigest, operationId, result });
      const candidateRoot = await writeCandidateChangeSet({ repositoryPath: this.repositoryPath, commitOid: input.repositoryCommitOid, result, candidateTreeDigest: candidateDigest, baseDigest: input.baseDigest, workspaceRoot: this.workspaceRoot, signal, warden: this.warden });
      const evidence = { ...(isPlainRecord(result.evidence) ? result.evidence : {}), candidateTreeDigest: candidateDigest, candidateBaseDigest: input.baseDigest, candidateCommitOid: input.repositoryCommitOid, candidateContextDigest: context.descriptor.contextDigest, candidateManifestDigest: manifestDigest, candidateScopeDigest: scopeDigest, candidateBaseIdentity: context.descriptor.baseIdentity ?? null, repositoryBaseIdentity: repositoryIdentity };
      this.candidates.set(candidateDigest, { candidateRoot, result, repositoryCommitOid: input.repositoryCommitOid, baseDigest: input.baseDigest, contextDigest: context.descriptor.contextDigest, manifestDigest, scopeDigest, baseIdentity: context.descriptor.baseIdentity ?? null, repositoryBaseIdentity: repositoryIdentity });
      return deepFreeze({ ...result, evidence });
    } finally {
      this.contexts.delete(referenceId);
    }
  }

  async validationExecutor({ input, operationId = null, signal }) {
    this.#assertLive();
    const candidate = this.candidates.get(input.candidateTreeDigest);
    if (!candidate) fail('development_candidate_not_found', 'Validation requested an unknown candidate tree');
    let validation;
    try {
      validation = await this.npm.execute({ candidateRoot: candidate.candidateRoot, candidateTreeDigest: input.candidateTreeDigest, validationProfile: input.validationProfile, operationId, signal });
    } finally {
      const cleanup = await this.warden.cleanupCandidate(input.candidateTreeDigest);
      if (cleanup.cleanupComplete !== true) fail('development_runtime_candidate_cleanup_incomplete', 'Warden could not prove candidate cleanup after validation');
      this.candidates.delete(input.candidateTreeDigest);
    }
    return deepFreeze({ ...validation, evidence: { ...(isPlainRecord(validation.evidence) ? validation.evidence : {}), candidateCleanup: { cleanupComplete: true, candidateTreeDigest: input.candidateTreeDigest, positiveAbsence: true } } });
  }

  async execute(request, capabilities, signal, { operationId = null } = {}) {
    this.#assertLive();
    return executeDevelopmentOperation({ manifest: this.manifest, request, capabilities, signal, contextExecutor: (input) => this.contextExecutor(input), modelExecutor: (input) => this.modelExecutor({ ...input, operationId }), validationExecutor: (input) => this.validationExecutor({ ...input, operationId }) });
  }

  candidate(candidateTreeDigest) {
    const candidate = this.candidates.get(candidateTreeDigest);
    return candidate === undefined ? null : deepFreeze({ candidateTreeDigest, candidateRoot: candidate.candidateRoot, repositoryCommitOid: candidate.repositoryCommitOid, baseDigest: candidate.baseDigest, contextDigest: candidate.contextDigest, manifestDigest: candidate.manifestDigest, scopeDigest: candidate.scopeDigest, baseIdentity: candidate.baseIdentity, repositoryBaseIdentity: candidate.repositoryBaseIdentity ?? null, writes: canonicalClone(candidate.result.writes) });
  }

  async cleanupOperation(operationId) {
    this.#assertLive();
    return this.warden.cleanupOperation(operationId);
  }

  async dispose() {
    if (this.disposed) return;
    const entries = [...this.candidates.entries()];
    for (const [candidateDigest] of entries) await this.warden.cleanupCandidate(candidateDigest);
    const result = await this.warden.cleanupAll();
    if (result.cleanupComplete !== true) fail('development_runtime_cleanup_incomplete', 'Warden could not prove process cleanup');
    this.contexts.clear();
    this.candidates.clear();
    this.disposed = true;
    return result;
  }
}

export function createLocalDevelopmentOperationExecutionAdapter({ operationRuntime, capabilities = undefined } = {}) {
  if (!(operationRuntime instanceof LocalDevelopmentOperationRuntime)) fail('development_runtime_agent_invalid', 'operationRuntime is required');
  const normalizedManifest = normalizeDevelopmentOperationManifest(operationRuntime.manifest);
  const effectiveCapabilities = capabilities === undefined
    ? Object.keys(normalizedManifest.profiles).map((profile) => developmentOperationCapabilityId(normalizedManifest, profile)).sort()
    : [...capabilities];
  if (!Array.isArray(effectiveCapabilities)) fail('development_runtime_agent_invalid', 'Development capabilities must be an array');
  return Object.freeze({
    async start({ envelope }) {
      const body = envelope?.executableBody;
      try {
        if (!isPlainRecord(body)) fail('development_runtime_executable_invalid', 'Development dispatch body must be a record');
        assertRecordShape(body, ['profile', 'operationRequest', 'resultEnvelopeTemplate'], [], 'development dispatch body');
        if (body.profile !== 'tdev.development-operation-profiles.v2') fail('development_runtime_executable_invalid', 'Development dispatch body profile is not the release-bound profile');
        normalizeDevelopmentOperationRequest(normalizedManifest, body.operationRequest);
        validateCaseResultEnvelopeTemplate(body.resultEnvelopeTemplate);
      } catch (cause) {
        throw createLocalExecutionStartError(cause?.code ?? 'development_runtime_executable_invalid', cause?.message ?? 'Development dispatch body validation failed', { phase: 'pre_handle', cause });
      }
      const controller = new AbortController();
      const operationId = `${envelope.caseId}/${envelope.taskId}/${envelope.attemptId}`;
      const completion = operationRuntime.execute(body.operationRequest, effectiveCapabilities, controller.signal, { operationId }).then((output) => ({
        code: 0,
        signal: null,
        effect: 'not_applied',
        resultEnvelope: caseResultEnvelopeFromDispatch({ template: body.resultEnvelopeTemplate, envelope, result: output.result }),
      }));
      return Object.freeze({
        completion,
        async cancel() { controller.abort(); return { signalled: true }; },
        async cleanup() { await completion.catch(() => {}); return operationRuntime.cleanupOperation(operationId); },
      });
    },
  });
}

export function createLocalDevelopmentAgent({ operationRuntime, manifest = operationRuntime?.manifest, agentId = 'agent-tdev-m0', executorId = 'executor-tdev-m0', executorEpoch = 1, routeGeneration = 1 } = {}) {
  if (!(operationRuntime instanceof LocalDevelopmentOperationRuntime)) fail('development_runtime_agent_invalid', 'operationRuntime is required');
  const normalizedManifest = normalizeDevelopmentOperationManifest(manifest);
  const capabilities = Object.keys(normalizedManifest.profiles).map((profile) => developmentOperationCapabilityId(normalizedManifest, profile)).sort();
  const emitted = [];
  const executionAdapter = createLocalDevelopmentOperationExecutionAdapter({ operationRuntime, capabilities });
  const localRuntime = new LocalAgentRuntime({ agentId, routeGeneration, executor: { id: executorId, epoch: executorEpoch }, capabilities, emit: async (frame) => { emitted.push(canonicalClone(frame)); }, executionAdapter });
  localRuntime.bindConnection({ id: 'connection-tdev-m0', epoch: 1 });
  const identity = Object.freeze({ id: agentId, epoch: executorEpoch, capabilities: Object.freeze([...capabilities]) });
  const calls = { authorize: [], dispatch: [] };
  return Object.freeze({
    identity,
    runtime: localRuntime,
    calls,
    emitted,
    authorize: async (request) => { calls.authorize.push(canonicalClone(request)); return true; },
    observe: async () => ({ available: true }),
    dispatch: async (request) => {
      const { signal: _signal, ...observableRequest } = request;
      calls.dispatch.push(canonicalClone(observableRequest));
      const invocation = request.invocation;
      const started = await localRuntime.handleDispatch({ type: 'dispatch', deliveryId: digest({ caseId: request.caseId, taskId: request.taskId, attemptId: request.attemptId, lane: 'tdev-m0' }), dispatchOrdinal: 1, authorizationId: digest({ authorization: request.attemptId }), dispatchGrantId: digest({ grant: request.attemptId }), caseId: request.caseId, taskId: request.taskId, attemptId: request.attemptId, executorId, executorEpoch, fencingToken: invocation.fencingToken, protocolVersion: 'tdev-agent-v1', executableBody: {
        profile: 'tdev.development-operation-profiles.v2',
        operationRequest: request.operationRequest,
        resultEnvelopeTemplate: {
          caseId: request.caseId,
          planRevisionId: invocation.planRevisionId,
          planDigest: invocation.planDigest,
          taskId: request.taskId,
          attemptId: request.attemptId,
          executorId,
          executorEpoch,
          claimLeaseToken: invocation.claimLease?.token ?? null,
          claimLeaseGeneration: invocation.claimLease?.generation ?? null,
          claimLeaseClaimsDigest: invocation.claimLease?.claimsDigest ?? null,
        },
      } });
      if (started.classification !== 'started') fail('development_runtime_agent_dispatch_failed', 'Local Agent did not start the operation', started);
      const completed = await started.completion;
      const resultEnvelope = completed?.completion?.resultEnvelope;
      if (!isPlainRecord(resultEnvelope) || resultEnvelope.caseId !== request.caseId ||
          resultEnvelope.taskId !== request.taskId || resultEnvelope.attemptId !== request.attemptId ||
          resultEnvelope.executorId !== executorId || resultEnvelope.executorEpoch !== invocation.attempt.executorEpoch ||
          resultEnvelope.fencingToken !== invocation.fencingToken || !isPlainRecord(resultEnvelope.result)) {
        const completion = completed?.completion;
        const error = new ContractError(completion?.causeCode ?? 'development_runtime_agent_result_invalid', 'Local Agent returned no typed operation result', completion?.causeDetails ?? {});
        error.certainty = completion?.certainty ?? 'unknown';
        error.retryable = completion?.retryable === true;
        throw error;
      }
      return resultEnvelope.result;
    },
  });
}
