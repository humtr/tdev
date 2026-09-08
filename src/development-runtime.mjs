import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
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
} from './canonical.mjs';
import { DEFAULT_LIMITS, DEFAULT_PATH_POLICY, validateRelativePath } from './policy.mjs';
import { normalizeChangeSet } from './results.mjs';
import { validateTree } from './promotion.mjs';
import { runGitCommand } from './git-projection.mjs';
import { runModelSubprocess, GitRepositoryModelExecutor } from './repository-model-transport.mjs';
import {
  CODEX_MODEL_BINDING_PROFILE,
  CODEX_EXECUTION_BOUNDARY,
  CODEX_OPERATION_ARGUMENTS,
  developmentOperationCapabilityId,
  executeDevelopmentOperation,
  normalizeDevelopmentOperationRequest,
  normalizeDevelopmentOperationManifest,
} from './development-operation-profile.mjs';
import { LocalAgentRuntime } from './local-agent-runtime.mjs';

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

/**
 * Build the Case result envelope emitted by a release-bound development Agent.
 *
 * The operation adapter only returns a typed operation result.  The surrounding
 * Agent delivery is the authority that knows the activated Attempt fence, so
 * the result identity is completed from the dispatch envelope here.  The
 * template is release/Plan-bound and may not be selected by the caller.
 */
function validateCaseResultEnvelopeTemplate(template) {
  if (!isPlainRecord(template)) fail('development_runtime_result_template_invalid', 'Result envelope template must be a record');
  assertRecordShape(template, [
    'caseId', 'planRevisionId', 'planDigest', 'taskId', 'attemptId', 'executorId', 'executorEpoch',
    'claimLeaseToken', 'claimLeaseGeneration', 'claimLeaseClaimsDigest',
  ], [], 'result envelope template');
  for (const field of ['caseId', 'planRevisionId', 'taskId', 'attemptId', 'executorId']) {
    assertIdentifier(template[field], `result envelope template.${field}`);
  }
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
    caseId: template.caseId,
    planRevisionId: template.planRevisionId,
    planDigest: template.planDigest,
    taskId: template.taskId,
    attemptId: template.attemptId,
    executorId: template.executorId,
    executorEpoch: template.executorEpoch,
    fencingToken: envelope.fencingToken,
    claimLeaseToken: template.claimLeaseToken,
    claimLeaseGeneration: template.claimLeaseGeneration,
    claimLeaseClaimsDigest: template.claimLeaseClaimsDigest,
    result: canonicalClone(result),
  });
}

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
  // Termux launchers require these two platform variables, but inheriting the
  // ambient process environment would re-open an unbounded caller-controlled
  // environment.  Derive them only for the release-bound Termux executable
  // family and point temporary files at the disposable operation root.
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

export function buildCodexPrompt({ repositoryCommitOid, baseDigest, contextReferenceId: referenceId, contextDigest, contextFileCount, instruction } = {}) {
  return [
    "You are the release-bound tdev development worker.",
    "Inspect the exact Git repository in the current working directory using read-only commands only.",
    "The provider does not supply a kernel sandbox; treat this disposable clone as the only workspace and do not rely on bwrap.",
    "Do not mutate files directly, create commits, access network tools, read files outside the working directory, or reveal credentials.",
    "Read-only applies to shell commands only. The JSON ChangeSet is the implementation channel and must contain the actual edits.",
    "The clone must remain clean because the caller applies your result. You MUST implement the requested source change in the returned ChangeSet; never substitute an empty ChangeSet when the instruction is feasible. The returned writes array MUST be non-empty for an implementation instruction: inspect the named files, construct complete replacements, and put those replacements in the JSON result. A no-op is invalid even when the existing tests pass. Do not report that you changed files unless the writes array contains the changes.",
    "Return exactly one JSON object matching the supplied output schema and no Markdown or commentary.",
    "The object must be a result-only ChangeSet against the supplied base digest. Include only relative paths and complete replacement text (or null for deletion).",
    "repositoryCommitOid=" + repositoryCommitOid,
    "baseDigest=" + baseDigest,
    "contextReferenceId=" + referenceId,
    "contextDigest=" + contextDigest,
    "contextFileCount=" + contextFileCount,
    "instruction=" + instruction,
  ].join("\n");
}

async function checkedGit({ repositoryPath, args, signal }) {
  const result = await runGitCommand({ repositoryPath, args, signal });
  if (result.code !== 0) fail('development_runtime_git_failed', `Git command failed: ${args[0]}`, { exitCode: result.code, signal: result.signal });
  return result.stdout;
}

async function assertCleanClone({ repositoryPath, signal }) {
  const status = (await checkedGit({ repositoryPath, signal, args: ['status', '--porcelain=v1', '--untracked-files=all', '--ignored=matching'] })).toString('utf8');
  if (status.length !== 0) fail('development_runtime_clone_mutated', 'Codex modified the disposable exact-base repository', { status: status.slice(0, 8192) });
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
    if (event.type === 'item.completed' && event.item?.type === 'command_execution' && event.item.status === 'failed') {
      fail('codex_command_execution_failed', 'Codex could not execute a required repository inspection command', {
        exitCode: Number.isSafeInteger(event.item.exit_code) ? event.item.exit_code : null,
      });
    }
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

function sanitizeDiagnosticText(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  return value.slice(0, 256)
    .replace(/(?:https?|wss?):\/\/\S+/giu, "<url>")
    .replace(/(?:bearer|token|secret|password|authorization|api.?key)[=: ]+\S+/giu, "<credential>")
    .replace(/\/data\/data\/\S+/gu, "<path>")
    .replace(/[A-Za-z0-9+_=-]{24,}/gu, "<opaque>");
}

function classifyDiagnosticText(value) {
  if (typeof value !== "string" || value.length === 0) return "empty";
  const text = value.toLowerCase();
  if (/bwrap|sandbox|namespace/u.test(text)) return "sandbox";
  if (/approval|permission|confirm/u.test(text)) return "approval";
  if (/401|403|unauthorized|authentication|login|token/u.test(text)) return "authentication";
  if (/404|not found|unknown endpoint|endpoint/u.test(text)) return "endpoint";
  if (/rate.?limit|quota|limit exceeded/u.test(text)) return "rate_limit";
  if (/model.{0,32}(not found|unsupported|unavailable)|unsupported.{0,32}model/u.test(text)) return "model";
  if (/schema|json|structured output/u.test(text)) return "schema";
  if (/trust|trusted|untrusted|project directory|working directory|repository root/u.test(text)) return "trust";
  if (/network|connect|socket|websocket|http|dns|tls/u.test(text)) return "network";
  if (/invalid|malformed|bad request|request failed/u.test(text)) return "request";
  return "other";
}

function summarizeCodexProcessOutput(bytes) {
  const summary = { eventTypes: [], itemTypes: [], eventCount: 0, truncated: false, malformedEvents: 0, terminalAgentMessages: 0, turnCompleted: false, turnFailed: false, errorEvents: 0, errorCodes: [], errorKeys: [], errorDetailClasses: [], errorMessageLengths: [], errorMessagePreviews: [], failedCommandExecutions: 0, failedCommandExitCodes: [] };
  if (!Buffer.isBuffer(bytes)) return summary;
  let text;
  try { text = UTF8_DECODER.decode(bytes); }
  catch { summary.malformedEvents = 1; return summary; }
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const boundedLines = lines.slice(0, 64);
  summary.eventCount = boundedLines.length;
  summary.truncated = lines.length > boundedLines.length;
  for (const line of boundedLines) {
    let event;
    try { event = strictJsonParse(line, { maxBytes: CODEX_MAX_RESPONSE_BYTES }); }
    catch { summary.malformedEvents += 1; continue; }
    if (!isPlainRecord(event) || typeof event.type !== "string") { summary.malformedEvents += 1; continue; }
    if (summary.eventTypes.length < 16) summary.eventTypes.push(event.type);
    const item = event.item;
    if (isPlainRecord(item) && typeof item.type === "string") {
      if (summary.itemTypes.length < 16) summary.itemTypes.push(item.type);
      if (event.type === "item.completed" && item.type === "agent_message") summary.terminalAgentMessages += 1;
    }
    if (event.type === "item.completed" && item?.type === "command_execution" && item.status === "failed") {
      summary.failedCommandExecutions += 1;
      if (summary.failedCommandExitCodes.length < 8 && Number.isSafeInteger(item.exit_code)) summary.failedCommandExitCodes.push(item.exit_code);
    }
    if (event.type === "turn.completed") summary.turnCompleted = true;
    if (event.type === "turn.failed") summary.turnFailed = true;
    if (event.type === "error" || event.type === "turn.failed") summary.errorEvents += 1;
    if (isPlainRecord(event.error)) {
      for (const key of Object.keys(event.error).sort()) if (summary.errorKeys.length < 16) summary.errorKeys.push(key);
      for (const key of ["code", "type", "message", "detail"]) {
        if (typeof event.error[key] !== "string") continue;
        if (summary.errorDetailClasses.length < 8) summary.errorDetailClasses.push(classifyDiagnosticText(event.error[key]));
        if (summary.errorMessageLengths.length < 8 && key === "message") summary.errorMessageLengths.push(event.error[key].length);
        if (summary.errorMessagePreviews.length < 4 && key === "message") summary.errorMessagePreviews.push(sanitizeDiagnosticText(event.error[key]));
        if (key === "code" && summary.errorCodes.length < 8) summary.errorCodes.push(event.error[key]);
      }
    } else if (typeof event.error === "string") {
      if (summary.errorDetailClasses.length < 8) summary.errorDetailClasses.push(classifyDiagnosticText(event.error));
      if (summary.errorMessageLengths.length < 8) summary.errorMessageLengths.push(event.error.length);
      if (summary.errorMessagePreviews.length < 4) summary.errorMessagePreviews.push(sanitizeDiagnosticText(event.error));
    }
    if (typeof event.message === "string") {
      if (summary.errorDetailClasses.length < 8) summary.errorDetailClasses.push(classifyDiagnosticText(event.message));
      if (summary.errorMessageLengths.length < 8) summary.errorMessageLengths.push(event.message.length);
      if (summary.errorMessagePreviews.length < 4) summary.errorMessagePreviews.push(sanitizeDiagnosticText(event.message));
    }
  }
  return summary;
}

function summarizeValidationOutput(bytes) {
  const summary = { failureLineCount: 0, failureClasses: [], failurePreviews: [] };
  if (!Buffer.isBuffer(bytes)) return summary;
  let text;
  try { text = UTF8_DECODER.decode(bytes); }
  catch { summary.failureLineCount = 1; summary.failureClasses.push('non_utf8'); return summary; }
  for (const line of text.split("\n")) {
    const cleanLine = line.replace(/\u001b\[[0-?]*[ -\/]*[@-~]/gu, '');
    // Match runner/error records, not ordinary test names such as
    // "fails closed" that happen to contain the word "fail".
    if (!/(?:^\s*not ok\b|^\s*✖\b|^\s*npm ERR!\b|^\s*(?:AssertionError|(?:Type|Range|Reference|Syntax)?Error)(?:\s*\[[^\]]+\])?:)/u.test(cleanLine)) continue;
    summary.failureLineCount += 1;
    if (summary.failureClasses.length < 8) summary.failureClasses.push(classifyDiagnosticText(cleanLine));
    if (summary.failurePreviews.length < 8) summary.failurePreviews.push(sanitizeDiagnosticText(cleanLine));
  }
  return summary;
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
  constructor({ repositoryPath, codexExecutable, codexHome, outputSchemaPath, outputSchemaSha256 = null, contextExcludedPaths = [], contextIncludedPathPrefixes = [], model = null, reasoningEffort = null, codexArguments = CODEX_ARGUMENTS, timeoutMs = DEFAULT_OPERATION_TIMEOUT_MS, cancelGraceMs = DEFAULT_CANCEL_GRACE_MS, workspaceRoot = null, observation = null, modelRunner = runModelSubprocess, contextAdapter = null } = {}) {
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
    this.contextAdapter = contextAdapter ?? new GitRepositoryModelExecutor({ repositoryPath: this.repositoryPath, modelExecutable: this.codexExecutable, timeoutMs: this.timeoutMs, excludedPaths: contextExcludedPaths, includedPathPrefixes: contextIncludedPathPrefixes, limits: { maxResponseBytes: CODEX_MAX_RESPONSE_BYTES, maxStderrBytes: CODEX_MAX_STDERR_BYTES } });
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
    let processResult = null;
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
      });
      const input = Buffer.from(prompt, 'utf8');
      if (input.byteLength > CODEX_MAX_PROMPT_BYTES) fail('codex_prompt_limit_exceeded', 'Codex prompt exceeds its bound');
      const args = [...this.codexArguments, '--output-schema', this.outputSchemaPath];
      if (this.model !== null) args.push('--model', this.model);
      if (this.reasoningEffort !== null) args.push('-c', `model_reasoning_effort=${this.reasoningEffort}`);
      processResult = await this.modelRunner({ executable: this.codexExecutable, args, input, environment: runtimeEnvironment({ executable: this.codexExecutable, codexHome: this.codexHome, temporaryDirectory: clonePath }), workingDirectory: clonePath, timeoutMs: this.timeoutMs, signal, maxStdoutBytes: CODEX_MAX_RESPONSE_BYTES, maxStderrBytes: CODEX_MAX_STDERR_BYTES });
      if (processResult.code !== 0) {
        const outputSummary = summarizeCodexProcessOutput(processResult.stdout);
        fail("codex_process_failed", "Codex process exited unsuccessfully", { exitCode: processResult.code, signal: processResult.signal, stdoutBytes: processResult.stdoutBytes, stderrBytes: processResult.stderrBytes, stderrClass: processResult.stderrClass ?? "unknown", ...outputSummary, stdoutEventTypes: outputSummary.eventTypes, stdoutItemTypes: outputSummary.itemTypes, stdoutErrorCodes: outputSummary.errorCodes });
      }
      await assertCleanClone({ repositoryPath: clonePath, signal });
      const parsed = parseCodexJsonl(processResult.stdout, CODEX_MAX_RESPONSE_BYTES);
      const evidence = { runtimeProfile: CODEX_EXEC_MODEL_PROFILE, executionBoundary: CODEX_EXECUTION_BOUNDARY, sandboxMode: 'none', workspaceMutation: 'clean', disclosureProfile: CODEX_DISCLOSURE_PROFILE, repositoryCommitOid, contextDigest: context.descriptor.contextDigest, outputSchemaPath: this.outputSchemaPath, outputSchemaSha256: schemaDigest, processStarts: 1, processReuses: 0, stdoutBytes: processResult.stdoutBytes, stderrBytes: processResult.stderrBytes, durationMs: processResult.durationMs, usage: parsed.usage };
      const result = normalizedChangeSet(parsed.result, baseDigest, evidence);
      safeObservation(this.observation, { ...evidence, outcome: 'returned', totalDurationMs: Math.max(0, Math.round(performance.now() - started)) });
      return result;
    } catch (cause) {
      const details = cause?.details ?? {};
      const outputSummary = processResult === null ? {} : summarizeCodexProcessOutput(processResult.stdout);
      safeObservation(this.observation, {
        runtimeProfile: CODEX_EXEC_MODEL_PROFILE,
        executionBoundary: CODEX_EXECUTION_BOUNDARY,
        sandboxMode: 'none',
        repositoryCommitOid,
        contextDigest: context.descriptor.contextDigest,
        processStarts: details.processStarts === 0 ? 0 : (processResult === null ? null : 1),
        exitCode: Number.isSafeInteger(details.exitCode) ? details.exitCode : (Number.isSafeInteger(processResult?.code) ? processResult.code : null),
        signal: typeof details.signal === 'string' ? details.signal : null,
        stdoutBytes: Number.isSafeInteger(details.stdoutBytes) ? details.stdoutBytes : (Number.isSafeInteger(processResult?.stdoutBytes) ? processResult.stdoutBytes : null),
        stderrBytes: Number.isSafeInteger(details.stderrBytes) ? details.stderrBytes : (Number.isSafeInteger(processResult?.stderrBytes) ? processResult.stderrBytes : null),
        stderrClass: typeof details.stderrClass === "string" ? details.stderrClass : (typeof processResult?.stderrClass === "string" ? processResult.stderrClass : null),
        stdoutEventTypes: Array.isArray(details.stdoutEventTypes) ? details.stdoutEventTypes.slice(0, 16) : (Array.isArray(outputSummary.eventTypes) ? outputSummary.eventTypes.slice(0, 16) : []),
        stdoutItemTypes: Array.isArray(details.stdoutItemTypes) ? details.stdoutItemTypes.slice(0, 16) : (Array.isArray(outputSummary.itemTypes) ? outputSummary.itemTypes.slice(0, 16) : []),
        stdoutErrorCodes: Array.isArray(details.stdoutErrorCodes) ? details.stdoutErrorCodes.slice(0, 8) : (Array.isArray(outputSummary.errorCodes) ? outputSummary.errorCodes.slice(0, 8) : []),
        stdoutErrorKeys: Array.isArray(details.errorKeys) ? details.errorKeys.slice(0, 16) : (Array.isArray(outputSummary.errorKeys) ? outputSummary.errorKeys.slice(0, 16) : []),
        stdoutErrorDetailClasses: Array.isArray(details.errorDetailClasses) ? details.errorDetailClasses.slice(0, 8) : (Array.isArray(outputSummary.errorDetailClasses) ? outputSummary.errorDetailClasses.slice(0, 8) : []),
        stdoutErrorMessageLengths: Array.isArray(details.errorMessageLengths) ? details.errorMessageLengths.slice(0, 8) : (Array.isArray(outputSummary.errorMessageLengths) ? outputSummary.errorMessageLengths.slice(0, 8) : []),
        stdoutErrorMessagePreviews: Array.isArray(details.errorMessagePreviews) ? details.errorMessagePreviews.slice(0, 4) : (Array.isArray(outputSummary.errorMessagePreviews) ? outputSummary.errorMessagePreviews.slice(0, 4) : []),
        stdoutEventCount: Number.isSafeInteger(details.eventCount) ? details.eventCount : (Number.isSafeInteger(outputSummary.eventCount) ? outputSummary.eventCount : null),
        stdoutTruncated: details.truncated === true || outputSummary.truncated === true,
        stdoutMalformedEvents: Number.isSafeInteger(details.malformedEvents) ? details.malformedEvents : (Number.isSafeInteger(outputSummary.malformedEvents) ? outputSummary.malformedEvents : null),
        stdoutTerminalAgentMessages: Number.isSafeInteger(details.terminalAgentMessages) ? details.terminalAgentMessages : (Number.isSafeInteger(outputSummary.terminalAgentMessages) ? outputSummary.terminalAgentMessages : null),
        stdoutTurnCompleted: details.turnCompleted === true || outputSummary.turnCompleted === true,
        stdoutTurnFailed: details.turnFailed === true || outputSummary.turnFailed === true,
        stdoutErrorEvents: Number.isSafeInteger(details.errorEvents) ? details.errorEvents : (Number.isSafeInteger(outputSummary.errorEvents) ? outputSummary.errorEvents : null),
        stdoutFailedCommandExecutions: Number.isSafeInteger(outputSummary.failedCommandExecutions) ? outputSummary.failedCommandExecutions : null,
        stdoutFailedCommandExitCodes: Array.isArray(outputSummary.failedCommandExitCodes) ? outputSummary.failedCommandExitCodes.slice(0, 8) : [],
        outcome: cause?.code ?? 'codex_failed',
      });
      throw cause;
    } finally {
      await rm(clonePath, { recursive: true, force: true });
      try { await stat(clonePath); fail('development_runtime_clone_cleanup_failed', 'Codex exact-base clone remained after execution'); }
      catch (cleanupError) { if (cleanupError?.code !== 'ENOENT') throw cleanupError; }
    }
  }
}

export class NpmCheckValidationExecutor {
  constructor({ npmExecutable, timeoutMs = DEFAULT_OPERATION_TIMEOUT_MS, cancelGraceMs = DEFAULT_CANCEL_GRACE_MS, observation = null } = {}) {
    this.npmExecutable = absolutePath(npmExecutable, 'npmExecutable');
    this.timeoutMs = positiveBound(timeoutMs, 'timeoutMs', 600_000);
    this.cancelGraceMs = assertSafeInteger(cancelGraceMs, 'cancelGraceMs', { min: 0, max: 60_000 });
    if (observation !== null && typeof observation !== 'function') fail('development_runtime_observation_invalid', 'observation must be a function or null');
    this.observation = observation;
    Object.freeze(this);
  }

  async execute({ candidateRoot, candidateTreeDigest, validationProfile, signal = new AbortController().signal } = {}) {
    const root = absolutePath(candidateRoot, 'candidateRoot');
    assertDigest(candidateTreeDigest, 'candidateTreeDigest');
    assertIdentifier(validationProfile, 'validationProfile');
    if (validationProfile !== NPM_CHECK_VALIDATION_PROFILE) fail('development_validation_profile_unknown', `Unsupported validation profile: ${validationProfile}`);
    const processResult = await runModelSubprocess({ executable: this.npmExecutable, args: ['run', 'check'], input: Buffer.alloc(0), environment: runtimeEnvironment({ executable: this.npmExecutable, temporaryDirectory: root, extra: { npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false', npm_config_offline: 'true' } }), workingDirectory: root, timeoutMs: this.timeoutMs, signal, maxStdoutBytes: CODEX_MAX_RESPONSE_BYTES, maxStderrBytes: CODEX_MAX_STDERR_BYTES });
    const passed = processResult.code === 0 && processResult.signal === null;
    const outputSummary = summarizeValidationOutput(processResult.stdout);
    safeObservation(this.observation, {
      runtimeProfile: NPM_CHECK_VALIDATION_PROFILE,
      executionBoundary: CODEX_EXECUTION_BOUNDARY,
      sandboxMode: "none",
      candidateTreeDigest,
      validationProfile,
      outcome: passed ? "passed" : "failed",
      exitCode: Number.isSafeInteger(processResult.code) ? processResult.code : null,
      signal: typeof processResult.signal === "string" ? processResult.signal : null,
      stdoutBytes: processResult.stdoutBytes,
      stderrBytes: processResult.stderrBytes,
      stderrClass: typeof processResult.stderrClass === "string" ? processResult.stderrClass : null,
      durationMs: processResult.durationMs,
      stdoutFailureLineCount: outputSummary.failureLineCount,
      stdoutFailureClasses: outputSummary.failureClasses,
      stdoutFailurePreviews: outputSummary.failurePreviews,
    });
    return deepFreeze({ kind: 'validation', passed, checks: [{ id: NPM_CHECK_VALIDATION_PROFILE, passed, message: passed ? null : `npm run check exited ${String(processResult.code ?? processResult.signal ?? 'unknown')}` }], evidence: { validationProfile, candidateTreeDigest, executable: this.npmExecutable, args: ['run', 'check'], network: 'none', stdoutBytes: processResult.stdoutBytes, stderrBytes: processResult.stderrBytes, durationMs: processResult.durationMs, stdoutFailureLineCount: outputSummary.failureLineCount, stdoutFailureClasses: outputSummary.failureClasses, stdoutFailurePreviews: outputSummary.failurePreviews } });
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
  constructor({ manifest, repositoryPath, codexExecutable, codexHome, outputSchemaPath, npmExecutable, model = null, reasoningEffort = null, workspaceRoot = null, observation = null } = {}) {
    this.manifest = normalizeDevelopmentOperationManifest(manifest);
    this.repositoryPath = absolutePath(repositoryPath, 'repositoryPath');
    this.workspaceRoot = workspaceRoot === null ? null : absolutePath(workspaceRoot, 'workspaceRoot');
    const modelProfile = this.manifest.profiles['tdev.model.repository.execute.v1'];
    const validationProfile = this.manifest.profiles['tdev.repository.validate.v1'];
    if (!modelProfile || modelProfile.binding?.profile !== CODEX_EXEC_MODEL_PROFILE || modelProfile.binding?.executionBoundary !== CODEX_EXECUTION_BOUNDARY || !validationProfile || validationProfile.binding?.profile !== NPM_CHECK_VALIDATION_PROFILE) {
      fail('development_runtime_manifest_invalid', 'The runtime requires the release-bound D0043 model and validation profiles');
    }
    this.codex = new CodexExecRepositoryModelExecutor({ repositoryPath: this.repositoryPath, codexExecutable, codexHome, outputSchemaPath, outputSchemaSha256: modelProfile.binding.outputSchemaSha256 ?? null, contextExcludedPaths: modelProfile.binding.contextExcludedPaths ?? [], contextIncludedPathPrefixes: modelProfile.binding.contextIncludedPathPrefixes ?? [], model: model ?? modelProfile.binding.model ?? null, reasoningEffort: reasoningEffort ?? modelProfile.binding.reasoningEffort ?? null, timeoutMs: modelProfile.limits.timeoutMs, cancelGraceMs: modelProfile.limits.cancelGraceMs, workspaceRoot: this.workspaceRoot, observation, codexArguments: modelProfile.argv });
    this.npm = new NpmCheckValidationExecutor({ npmExecutable, timeoutMs: validationProfile.limits.timeoutMs, cancelGraceMs: validationProfile.limits.cancelGraceMs, observation });
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

/**
 * Execution adapter used by an installable Agent control process.  Development
 * operations are deliberately handled in-process by the release-bound runtime:
 * the Codex/npm children still run under the runtime's disposable clone and
 * process-group cleanup boundary, while diagnostic package profiles continue
 * to use the supervisor service below/alongside this path.
 */
export function createLocalDevelopmentOperationExecutionAdapter({ operationRuntime, capabilities = undefined } = {}) {
  if (!(operationRuntime instanceof LocalDevelopmentOperationRuntime)) {
    fail('development_runtime_agent_invalid', 'operationRuntime is required');
  }
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
        if (body.profile !== 'tdev.development-operation-profiles.v2') {
          fail('development_runtime_executable_invalid', 'Development dispatch body profile is not the release-bound profile');
        }
        normalizeDevelopmentOperationRequest(normalizedManifest, body.operationRequest);
        validateCaseResultEnvelopeTemplate(body.resultEnvelopeTemplate);
      } catch (cause) {
        throw createLocalExecutionStartError(
          cause?.code ?? 'development_runtime_executable_invalid',
          cause?.message ?? 'Development dispatch body validation failed',
          { phase: 'pre_handle', cause },
        );
      }
      const controller = new AbortController();
      const completion = operationRuntime.execute(body.operationRequest, effectiveCapabilities, controller.signal).then((output) => ({
        code: 0,
        signal: null,
        effect: 'not_applied',
        resultEnvelope: caseResultEnvelopeFromDispatch({
          template: body.resultEnvelopeTemplate,
          envelope,
          result: output.result,
        }),
      }));
      return Object.freeze({
        completion,
        async cancel() { controller.abort(); return { signalled: true }; },
        async cleanup() { await completion.catch(() => {}); return { cleanupComplete: true }; },
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
        fail('development_runtime_agent_result_invalid', 'Local Agent returned no fenced Case result envelope');
      }
      return resultEnvelope.result;
    },
  });
}
