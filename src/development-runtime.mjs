import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  ContractError,
  assertDigest,
  assertIdentifier,
  assertSafeInteger,
  assertScalarString,
  canonicalClone,
  deepFreeze,
  digest,
  isPlainRecord,
  strictJsonParse,
} from './canonical.mjs';
import { DEFAULT_LIMITS, DEFAULT_PATH_POLICY, validateRelativePath } from './policy.mjs';
import { normalizeChangeSet } from './results.mjs';
import { validateTree } from './promotion.mjs';
import { runGitCommand } from './git-projection.mjs';
import { runModelSubprocess, GitRepositoryModelExecutor } from './repository-model-transport.mjs';
import {
  developmentOperationCapabilityId,
  executeDevelopmentOperation,
  normalizeDevelopmentOperationManifest,
} from './development-operation-profile.mjs';
import { LocalAgentRuntime } from './local-agent-runtime.mjs';

export const CODEX_EXEC_MODEL_PROFILE = 'tdev.model.codex-exec.v1';
export const CODEX_DISCLOSURE_PROFILE = 'tdev.openai-codex-full-context.trusted-local.v1';
export const NPM_CHECK_VALIDATION_PROFILE = 'tdev.validation.npm-check.v1';
export const DEVELOPMENT_OPERATION_RESULT_PROFILE = 'tdev.development-operation-result.v1';

export const CODEX_ARGUMENTS = Object.freeze(['exec', '--ephemeral', '--json', '--sandbox', 'read-only', '--ignore-user-config']);
const CODEX_MAX_PROMPT_BYTES = 16 * 1024 * 1024;
const CODEX_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const CODEX_MAX_STDERR_BYTES = 64 * 1024;
const DEFAULT_OPERATION_TIMEOUT_MS = 300_000;
const DEFAULT_CANCEL_GRACE_MS = 2_000;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

function fail(code, message, details = undefined, options = undefined) {
  throw new ContractError(code, message, details, options);
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

function runtimeEnvironment({ executable, codexHome = null, extra = {} } = {}) {
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
    environment.HOME = path.dirname(codexHome);
  }
  return Object.freeze(environment);
}

function safeObservation(callback, value) {
  if (typeof callback !== 'function') return;
  try { Promise.resolve(callback(deepFreeze(canonicalClone(value)))).catch(() => {}); }
  catch { /* observations are non-authoritative */ }
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

async function checkedGit({ repositoryPath, args, signal }) {
  const result = await runGitCommand({ repositoryPath, args, signal });
  if (result.code !== 0) fail('development_runtime_git_failed', `Git command failed: ${args[0]}`, { exitCode: result.code, signal: result.signal });
  return result.stdout;
}

async function cloneExactRepository({ repositoryPath, commitOid, workspaceRoot, signal }) {
  const parent = workspaceRoot === undefined || workspaceRoot === null ? os.tmpdir() : absolutePath(workspaceRoot, 'workspaceRoot');
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const clonePath = await mkdtemp(path.join(parent, 'tdev-development-'));
  try {
    await checkedGit({ repositoryPath, signal, args: ['clone', '--no-local', '--no-hardlinks', '--no-checkout', repositoryPath, clonePath] });
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
    if (event.type === 'error' || event.type === 'turn.failed') fail('codex_provider_failed', 'Codex reported a failed turn', { eventType: event.type });
    if (event.type === 'turn.completed') usage = safeUsage(event.usage);
    if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
      if (typeof event.item.text !== 'string' || event.item.text.length === 0) fail('codex_terminal_output_invalid', 'Codex terminal agent message is empty');
      terminal.push(event.item.text);
    }
  }
  if (terminal.length === 0) fail('codex_terminal_output_missing', 'Codex returned no terminal agent message');
  if (terminal.length !== 1) fail('codex_terminal_output_duplicate', 'Codex returned multiple terminal agent messages', { count: terminal.length });
  let result;
  try { result = strictJsonParse(terminal[0], { maxBytes }); }
  catch (cause) { fail('codex_terminal_output_invalid', 'Codex terminal agent message is not strict JSON', {}, { cause }); }
  return { result, usage };
}

function normalizedChangeSet(result, baseDigest, evidence) {
  if (!isPlainRecord(result)) fail('codex_changeset_invalid', 'Codex terminal output must be a ChangeSet record');
  try {
    return normalizeChangeSet('codex', { ...canonicalClone(result), evidence: canonicalClone(evidence) }, { baseDigest, pathPolicy: DEFAULT_PATH_POLICY, limits: DEFAULT_LIMITS });
  } catch (cause) {
    fail(cause?.code ?? 'codex_changeset_invalid', cause?.message ?? 'Codex ChangeSet is invalid', cause?.details, { cause });
  }
}

export class CodexExecRepositoryModelExecutor {
  constructor({ repositoryPath, codexExecutable, codexHome, outputSchemaPath, outputSchemaSha256 = null, contextExcludedPaths = [], model = null, reasoningEffort = null, timeoutMs = DEFAULT_OPERATION_TIMEOUT_MS, cancelGraceMs = DEFAULT_CANCEL_GRACE_MS, workspaceRoot = null, observation = null, modelRunner = runModelSubprocess, contextAdapter = null } = {}) {
    this.repositoryPath = absolutePath(repositoryPath, 'repositoryPath');
    this.codexExecutable = absolutePath(codexExecutable, 'codexExecutable');
    this.codexHome = absolutePath(codexHome, 'codexHome');
    this.outputSchemaPath = absolutePath(outputSchemaPath, 'outputSchemaPath');
    this.outputSchemaSha256 = outputSchemaSha256 === null ? null : assertDigest(outputSchemaSha256, 'outputSchemaSha256');
    this.model = model === null ? null : boundedText(model, 'model', 256);
    this.reasoningEffort = reasoningEffort === null ? null : boundedText(reasoningEffort, 'reasoningEffort', 64);
    this.timeoutMs = positiveBound(timeoutMs, 'timeoutMs', 600_000);
    this.cancelGraceMs = assertSafeInteger(cancelGraceMs, 'cancelGraceMs', { min: 0, max: 60_000 });
    this.workspaceRoot = workspaceRoot === null ? null : absolutePath(workspaceRoot, 'workspaceRoot');
    if (observation !== null && typeof observation !== 'function') fail('development_runtime_observation_invalid', 'observation must be a function or null');
    if (typeof modelRunner !== 'function') fail('development_runtime_model_runner_invalid', 'modelRunner must be a function');
    this.observation = observation;
    this.modelRunner = modelRunner;
    this.contextAdapter = contextAdapter ?? new GitRepositoryModelExecutor({ repositoryPath: this.repositoryPath, modelExecutable: this.codexExecutable, timeoutMs: this.timeoutMs, excludedPaths: contextExcludedPaths, limits: { maxResponseBytes: CODEX_MAX_RESPONSE_BYTES, maxStderrBytes: CODEX_MAX_STDERR_BYTES } });
    if (!this.contextAdapter || typeof this.contextAdapter.materializeContext !== 'function') fail('development_runtime_context_adapter_invalid', 'contextAdapter must materialize immutable context');
    Object.freeze(this);
  }

  async materializeContext(repositoryCommitOid, baseDigest, { signal } = {}) {
    return this.contextAdapter.materializeContext(repositoryCommitOid, baseDigest, { signal });
  }

  async execute({ repositoryCommitOid, baseDigest, instruction, contextReferenceId = undefined, signal = new AbortController().signal } = {}) {
    assertScalarString(repositoryCommitOid, 'repositoryCommitOid');
    assertDigest(baseDigest, 'baseDigest');
    boundedText(instruction, 'instruction', 64 * 1024);
    if (!signal || typeof signal.aborted !== 'boolean') fail('development_runtime_signal_invalid', 'signal must be an AbortSignal');
    const context = await this.materializeContext(repositoryCommitOid, baseDigest, { signal });
    const referenceId = assertContextReference(context.descriptor, contextReferenceId);
    const clonePath = await cloneExactRepository({ repositoryPath: this.repositoryPath, commitOid: repositoryCommitOid, workspaceRoot: this.workspaceRoot, signal });
    const started = performance.now();
    try {
      const schemaBytes = await readFile(this.outputSchemaPath);
      const schemaDigest = `sha256:${createHash('sha256').update(schemaBytes).digest('hex')}`;
      if (this.outputSchemaSha256 !== null && schemaDigest !== this.outputSchemaSha256) {
        fail('codex_output_schema_mismatch', 'Codex output schema digest does not match the release binding', { expected: this.outputSchemaSha256, observed: schemaDigest });
      }
      const prompt = [
        'You are the release-bound tdev development worker.',
        'Inspect the exact Git repository in the current working directory using read-only commands only.',
        'Do not edit files, create commits, access network tools, read files outside the working directory, or reveal credentials.',
        'Return exactly one JSON object matching the supplied output schema and no Markdown or commentary.',
        'The object must be a result-only ChangeSet against the supplied base digest. Include only relative paths and complete replacement text (or null for deletion).',
        `repositoryCommitOid=${repositoryCommitOid}`,
        `baseDigest=${baseDigest}`,
        `contextReferenceId=${referenceId}`,
        `contextDigest=${context.descriptor.contextDigest}`,
        `contextFileCount=${context.descriptor.fileCount}`,
        `instruction=${instruction}`,
      ].join('\n');
      const input = Buffer.from(prompt, 'utf8');
      if (input.byteLength > CODEX_MAX_PROMPT_BYTES) fail('codex_prompt_limit_exceeded', 'Codex prompt exceeds its bound');
      const args = [...CODEX_ARGUMENTS, '--output-schema', this.outputSchemaPath];
      if (this.model !== null) args.push('--model', this.model);
      if (this.reasoningEffort !== null) args.push('-c', `model_reasoning_effort=${this.reasoningEffort}`);
      const processResult = await this.modelRunner({ executable: this.codexExecutable, args, input, environment: runtimeEnvironment({ executable: this.codexExecutable, codexHome: this.codexHome }), workingDirectory: clonePath, timeoutMs: this.timeoutMs, signal, maxStdoutBytes: CODEX_MAX_RESPONSE_BYTES, maxStderrBytes: CODEX_MAX_STDERR_BYTES });
      if (processResult.code !== 0) fail('codex_process_failed', 'Codex process exited unsuccessfully', { exitCode: processResult.code, signal: processResult.signal, stdoutBytes: processResult.stdoutBytes, stderrBytes: processResult.stderrBytes });
      const parsed = parseCodexJsonl(processResult.stdout, CODEX_MAX_RESPONSE_BYTES);
      const evidence = { runtimeProfile: CODEX_EXEC_MODEL_PROFILE, disclosureProfile: CODEX_DISCLOSURE_PROFILE, repositoryCommitOid, contextDigest: context.descriptor.contextDigest, outputSchemaPath: this.outputSchemaPath, outputSchemaSha256: schemaDigest, processStarts: 1, processReuses: 0, stdoutBytes: processResult.stdoutBytes, stderrBytes: processResult.stderrBytes, durationMs: processResult.durationMs, usage: parsed.usage };
      const result = normalizedChangeSet(parsed.result, baseDigest, evidence);
      safeObservation(this.observation, { ...evidence, outcome: 'returned', totalDurationMs: Math.max(0, Math.round(performance.now() - started)) });
      return result;
    } catch (cause) {
      safeObservation(this.observation, { runtimeProfile: CODEX_EXEC_MODEL_PROFILE, repositoryCommitOid, contextDigest: context.descriptor.contextDigest, processStarts: cause?.details?.processStarts === 0 ? 0 : 1, outcome: cause?.code ?? 'codex_failed' });
      throw cause;
    } finally {
      await rm(clonePath, { recursive: true, force: true });
      try { await stat(clonePath); fail('development_runtime_clone_cleanup_failed', 'Codex exact-base clone remained after execution'); }
      catch (cleanupError) { if (cleanupError?.code !== 'ENOENT') throw cleanupError; }
    }
  }
}

export class NpmCheckValidationExecutor {
  constructor({ npmExecutable, timeoutMs = DEFAULT_OPERATION_TIMEOUT_MS, cancelGraceMs = DEFAULT_CANCEL_GRACE_MS } = {}) {
    this.npmExecutable = absolutePath(npmExecutable, 'npmExecutable');
    this.timeoutMs = positiveBound(timeoutMs, 'timeoutMs', 600_000);
    this.cancelGraceMs = assertSafeInteger(cancelGraceMs, 'cancelGraceMs', { min: 0, max: 60_000 });
    Object.freeze(this);
  }

  async execute({ candidateRoot, candidateTreeDigest, validationProfile, signal = new AbortController().signal } = {}) {
    const root = absolutePath(candidateRoot, 'candidateRoot');
    assertDigest(candidateTreeDigest, 'candidateTreeDigest');
    assertIdentifier(validationProfile, 'validationProfile');
    if (validationProfile !== NPM_CHECK_VALIDATION_PROFILE) fail('development_validation_profile_unknown', `Unsupported validation profile: ${validationProfile}`);
    const processResult = await runModelSubprocess({ executable: this.npmExecutable, args: ['run', 'check'], input: Buffer.alloc(0), environment: runtimeEnvironment({ executable: this.npmExecutable, extra: { npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false', npm_config_offline: 'true' } }), workingDirectory: root, timeoutMs: this.timeoutMs, signal, maxStdoutBytes: CODEX_MAX_RESPONSE_BYTES, maxStderrBytes: CODEX_MAX_STDERR_BYTES });
    const passed = processResult.code === 0 && processResult.signal === null;
    return deepFreeze({ kind: 'validation', passed, checks: [{ id: NPM_CHECK_VALIDATION_PROFILE, passed, message: passed ? null : `npm run check exited ${String(processResult.code ?? processResult.signal ?? 'unknown')}` }], evidence: { validationProfile, candidateTreeDigest, executable: this.npmExecutable, args: ['run', 'check'], network: 'none', stdoutBytes: processResult.stdoutBytes, stderrBytes: processResult.stderrBytes, durationMs: processResult.durationMs } });
  }
}

function applyChangeSet(baseTree, result, baseDigest) {
  const tree = validateTree(canonicalClone(baseTree));
  if (digest(tree) !== baseDigest) fail('development_runtime_base_mismatch', 'Candidate base tree does not match the plan digest');
  for (const write of result.writes) {
    const filePath = validateRelativePath(write.path);
    if (write.content === null) delete tree[filePath];
    else tree[filePath] = write.content;
  }
  return validateTree(tree);
}

async function writeCandidateWorkspace({ repositoryPath, commitOid, tree, baseTree, workspaceRoot, signal }) {
  const candidateRoot = await cloneExactRepository({ repositoryPath, commitOid, workspaceRoot, signal });
  try {
    for (const [filePath, content] of Object.entries(tree)) {
      if (baseTree[filePath] === content) continue;
      const fullPath = path.join(candidateRoot, ...filePath.split('/'));
      await mkdir(path.dirname(fullPath), { recursive: true, mode: 0o700 });
      await writeFile(fullPath, content, { mode: 0o600 });
    }
    for (const filePath of Object.keys(baseTree)) {
      if (Object.hasOwn(tree, filePath)) continue;
      await rm(path.join(candidateRoot, ...filePath.split('/')), { force: true });
    }
    return candidateRoot;
  } catch (cause) {
    await rm(candidateRoot, { recursive: true, force: true });
    throw cause;
  }
}

export class LocalDevelopmentOperationRuntime {
  constructor({ manifest, repositoryPath, codexExecutable, codexHome, outputSchemaPath, npmExecutable, model = null, reasoningEffort = null, workspaceRoot = null } = {}) {
    this.manifest = normalizeDevelopmentOperationManifest(manifest);
    this.repositoryPath = absolutePath(repositoryPath, 'repositoryPath');
    this.workspaceRoot = workspaceRoot === null ? null : absolutePath(workspaceRoot, 'workspaceRoot');
    const modelProfile = this.manifest.profiles['tdev.model.repository.execute.v1'];
    const validationProfile = this.manifest.profiles['tdev.repository.validate.v1'];
    if (!modelProfile || modelProfile.binding?.profile !== CODEX_EXEC_MODEL_PROFILE || !validationProfile || validationProfile.binding?.profile !== NPM_CHECK_VALIDATION_PROFILE) {
      fail('development_runtime_manifest_invalid', 'The runtime requires the release-bound D0043 model and validation profiles');
    }
    this.codex = new CodexExecRepositoryModelExecutor({ repositoryPath: this.repositoryPath, codexExecutable, codexHome, outputSchemaPath, outputSchemaSha256: modelProfile.binding.outputSchemaSha256 ?? null, contextExcludedPaths: modelProfile.binding.contextExcludedPaths ?? [], model: model ?? modelProfile.binding.model ?? null, reasoningEffort: reasoningEffort ?? modelProfile.binding.reasoningEffort ?? null, timeoutMs: modelProfile.limits.timeoutMs, cancelGraceMs: modelProfile.limits.cancelGraceMs, workspaceRoot: this.workspaceRoot });
    this.npm = new NpmCheckValidationExecutor({ npmExecutable, timeoutMs: validationProfile.limits.timeoutMs, cancelGraceMs: validationProfile.limits.cancelGraceMs });
    this.candidates = new Map();
    this.disposed = false;
  }

  #assertLive() { if (this.disposed) fail('development_runtime_disposed', 'Development runtime has already been disposed'); }

  async contextExecutor({ input, signal }) {
    this.#assertLive();
    const context = await this.codex.materializeContext(input.repositoryCommitOid, input.baseDigest, { signal });
    const referenceId = contextReferenceId(context.descriptor);
    return { kind: 'observation', subject: 'repository-context', value: { referenceId, repositoryCommitOid: input.repositoryCommitOid, baseDigest: input.baseDigest, objectFormat: input.objectFormat, contextDigest: context.descriptor.contextDigest, fileCount: context.descriptor.fileCount }, evidence: { contextDigest: context.descriptor.contextDigest, repositoryCommitOid: input.repositoryCommitOid, fileCount: context.descriptor.fileCount } };
  }

  async modelExecutor({ input, signal }) {
    this.#assertLive();
    const context = await this.codex.materializeContext(input.repositoryCommitOid, input.baseDigest, { signal });
    const referenceId = assertContextReference(context.descriptor, input.contextReferenceId);
    const result = await this.codex.execute({ ...input, contextReferenceId: referenceId, signal });
    const baseTree = Object.fromEntries(context.files.map((entry) => [entry.path, entry.content]));
    const tree = applyChangeSet(baseTree, result, input.baseDigest);
    const candidateRoot = await writeCandidateWorkspace({ repositoryPath: this.repositoryPath, commitOid: input.repositoryCommitOid, tree, baseTree, workspaceRoot: this.workspaceRoot, signal });
    this.candidates.set(digest(tree), { candidateRoot, tree, baseTree, repositoryCommitOid: input.repositoryCommitOid });
    return result;
  }

  async validationExecutor({ input, signal }) {
    this.#assertLive();
    const candidate = this.candidates.get(input.candidateTreeDigest);
    if (!candidate) fail('development_candidate_not_found', 'Validation requested an unknown candidate tree');
    return this.npm.execute({ candidateRoot: candidate.candidateRoot, candidateTreeDigest: input.candidateTreeDigest, validationProfile: input.validationProfile, signal });
  }

  async execute(request, capabilities, signal) {
    this.#assertLive();
    return executeDevelopmentOperation({ manifest: this.manifest, request, capabilities, signal, contextExecutor: (input) => this.contextExecutor(input), modelExecutor: (input) => this.modelExecutor(input), validationExecutor: (input) => this.validationExecutor(input) });
  }

  candidate(candidateTreeDigest) {
    const candidate = this.candidates.get(candidateTreeDigest);
    return candidate === undefined ? null : deepFreeze({ candidateTreeDigest, candidateRoot: candidate.candidateRoot, tree: canonicalClone(candidate.tree) });
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const entries = [...this.candidates.values()];
    this.candidates.clear();
    for (const entry of entries) {
      await rm(entry.candidateRoot, { recursive: true, force: true });
      try { await stat(entry.candidateRoot); }
      catch (cause) { if (cause?.code === 'ENOENT') continue; throw cause; }
      fail('development_runtime_candidate_cleanup_failed', 'Candidate workspace remained after disposal');
    }
  }
}

export function createLocalDevelopmentAgent({ operationRuntime, manifest = operationRuntime?.manifest, agentId = 'agent-tdev-m0', executorId = 'executor-tdev-m0', executorEpoch = 1, routeGeneration = 1 } = {}) {
  if (!(operationRuntime instanceof LocalDevelopmentOperationRuntime)) fail('development_runtime_agent_invalid', 'operationRuntime is required');
  const normalizedManifest = normalizeDevelopmentOperationManifest(manifest);
  const capabilities = Object.keys(normalizedManifest.profiles).map((profile) => developmentOperationCapabilityId(normalizedManifest, profile)).sort();
  const emitted = [];
  const executionAdapter = Object.freeze({
    async start({ envelope }) {
      const controller = new AbortController();
      const completion = operationRuntime.execute(envelope.executableBody?.operationRequest, capabilities, controller.signal).then((output) => ({ code: 0, signal: null, effect: 'not_applied', resultEnvelope: { schemaVersion: 1, profile: DEVELOPMENT_OPERATION_RESULT_PROFILE, result: output.result } }));
      return Object.freeze({ completion, async cancel() { controller.abort(); return { signalled: true }; }, async cleanup() { await completion.catch(() => {}); return { cleanupComplete: true }; } });
    },
  });
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
    observe: async () => ({ available: true, runtime: localRuntime.identity(), emittedFrames: emitted.length }),
    dispatch: async (request) => {
      const { signal: _signal, ...observableRequest } = request;
      calls.dispatch.push(canonicalClone(observableRequest));
      const invocation = request.invocation;
      const started = await localRuntime.handleDispatch({ type: 'dispatch', deliveryId: digest({ caseId: request.caseId, taskId: request.taskId, attemptId: request.attemptId, lane: 'tdev-m0' }), dispatchOrdinal: 1, authorizationId: digest({ authorization: request.attemptId }), dispatchGrantId: digest({ grant: request.attemptId }), caseId: request.caseId, taskId: request.taskId, attemptId: request.attemptId, executorId, executorEpoch, fencingToken: invocation.fencingToken, protocolVersion: 'tdev-agent-v1', executableBody: { profile: 'tdev.development-operation-profiles.v2', operationRequest: request.operationRequest } });
      if (started.classification !== 'started') fail('development_runtime_agent_dispatch_failed', 'Local Agent did not start the operation', started);
      const completed = await started.completion;
      const resultEnvelope = completed?.completion?.resultEnvelope;
      if (!isPlainRecord(resultEnvelope) || resultEnvelope.profile !== DEVELOPMENT_OPERATION_RESULT_PROFILE) fail('development_runtime_agent_result_invalid', 'Local Agent returned no typed operation result');
      return resultEnvelope.result;
    },
  });
}
