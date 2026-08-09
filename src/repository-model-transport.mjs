import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  ContractError,
  DEFAULT_JSON_LIMITS,
  assertRecordShape,
  assertSafeInteger,
  assertScalarString,
  canonicalClone,
  canonicalJson,
  compareText,
  deepFreeze,
  digest,
  isPlainRecord,
  strictJsonParse,
  typedDigest,
} from './canonical.mjs';
import { runGitCommand } from './git-projection.mjs';
import { DEFAULT_LIMITS, validateRelativePath } from './policy.mjs';
import { validateTree } from './promotion.mjs';

export const REPOSITORY_CONTEXT_PROFILE = 'tdev.repository-context.git-full-text.v1';
export const MODEL_TRANSPORT_PROFILE = 'tdev.model.subprocess-json.v1';
export const MODEL_REPOSITORY_OPERATION = 'tdev.model.repository';
export const MODEL_REQUEST_DOMAIN = 'tdev.model.repository-request.v1';

const SUPPORTED_MODES = new Set(['100644', '100755']);
const fatalDecoder = new TextDecoder('utf-8', { fatal: true });

function freeze(value) {
  return deepFreeze(canonicalClone(value));
}

function normalizeRepositoryPath(value) {
  assertScalarString(value, 'repositoryPath');
  if (value.length === 0 || value.includes('\0')) {
    throw new ContractError('invalid_repository_path', 'repositoryPath must be a non-empty path');
  }
  return path.resolve(value);
}

function normalizeExecutable(value) {
  assertScalarString(value, 'modelExecutable');
  if (value.length === 0 || value.includes('\0')) {
    throw new ContractError('invalid_model_executable', 'modelExecutable must be a non-empty executable');
  }
  return value;
}

function normalizeArguments(input) {
  if (input === undefined) return [];
  if (!Array.isArray(input)) throw new ContractError('invalid_model_arguments', 'modelArgs must be an array');
  return input.map((value, index) => {
    assertScalarString(value, `modelArgs[${index}]`);
    if (value.includes('\0')) throw new ContractError('invalid_model_arguments', 'modelArgs cannot contain NUL');
    return value;
  });
}

function normalizeEnvironment(input) {
  if (input === undefined) return Object.create(null);
  if (!isPlainRecord(input)) throw new ContractError('invalid_model_environment', 'modelEnvironment must be a record');
  const result = Object.create(null);
  for (const key of Object.keys(input).sort(compareText)) {
    assertScalarString(key, 'model environment key');
    if (key.length === 0 || key.includes('=') || key.includes('\0')) {
      throw new ContractError('invalid_model_environment', `Invalid environment key: ${key}`);
    }
    const value = input[key];
    assertScalarString(value, `modelEnvironment.${key}`);
    if (value.includes('\0')) throw new ContractError('invalid_model_environment', `Invalid environment value: ${key}`);
    result[key] = value;
  }
  return result;
}

function normalizeWorkingDirectory(value) {
  if (value === undefined || value === null) return undefined;
  assertScalarString(value, 'modelWorkingDirectory');
  if (value.length === 0 || value.includes('\0')) {
    throw new ContractError('invalid_model_working_directory', 'modelWorkingDirectory must be a non-empty path');
  }
  return path.resolve(value);
}

function tighten(value, fallback, label) {
  if (value === undefined) return fallback;
  const normalized = assertSafeInteger(value, label, { min: 1, max: fallback });
  return normalized;
}

function normalizeLimits(input = {}) {
  assertRecordShape(input, [], [
    'maxTreeEntries', 'maxFileBytes', 'maxTreeBytes', 'maxRequestBytes', 'maxResponseBytes', 'maxStderrBytes',
  ], 'repository model limits');
  return freeze({
    maxTreeEntries: tighten(input.maxTreeEntries, DEFAULT_LIMITS.maxTreeEntries, 'maxTreeEntries'),
    maxFileBytes: tighten(input.maxFileBytes, DEFAULT_LIMITS.maxFileBytes, 'maxFileBytes'),
    maxTreeBytes: tighten(input.maxTreeBytes, DEFAULT_LIMITS.maxTreeBytes, 'maxTreeBytes'),
    maxRequestBytes: tighten(input.maxRequestBytes, DEFAULT_LIMITS.maxPlanBytes, 'maxRequestBytes'),
    maxResponseBytes: tighten(input.maxResponseBytes, DEFAULT_JSON_LIMITS.maxBytes, 'maxResponseBytes'),
    maxStderrBytes: tighten(input.maxStderrBytes, DEFAULT_LIMITS.maxErrorMessageBytes, 'maxStderrBytes'),
  });
}

function oidLength(objectFormat) {
  if (objectFormat === 'sha1') return 40;
  if (objectFormat === 'sha256') return 64;
  throw new ContractError('unsupported_git_object_format', `Unsupported Git object format: ${objectFormat}`);
}

function assertOid(value, objectFormat, label = 'Git OID') {
  assertScalarString(value, label);
  const length = oidLength(objectFormat);
  if (value.length !== length || !/^[0-9a-f]+$/.test(value)) {
    throw new ContractError('invalid_git_oid', `${label} must be a full lowercase ${objectFormat} OID`);
  }
  return value;
}

function gitFailure(args, result) {
  return new ContractError('repository_git_command_failed', `Repository Git command failed: ${args[0]}`, {
    operation: args[0],
    exitCode: result?.code ?? null,
    signal: result?.signal ?? null,
  });
}

async function runCheckedGit({ gitExecutable, repositoryPath, args, input = null, runner }) {
  const result = await runner({ gitExecutable, repositoryPath, args, input });
  if (!result || !Number.isInteger(result.code) || !Buffer.isBuffer(result.stdout) || !Buffer.isBuffer(result.stderr)) {
    throw new ContractError('invalid_git_runner_result', 'Repository Git runner returned an invalid result');
  }
  if (result.code !== 0) throw gitFailure(args, result);
  return result.stdout;
}

function decodeUtf8(bytes, label) {
  try {
    return fatalDecoder.decode(bytes);
  } catch (cause) {
    throw new ContractError('repository_context_invalid_utf8', `${label} is not valid UTF-8`, {}, { cause });
  }
}

function parseTreeRows(bytes, objectFormat, limits) {
  const text = decodeUtf8(bytes, 'Git tree listing');
  const rawRows = text.split('\0');
  if (rawRows.at(-1) === '') rawRows.pop();
  if (rawRows.length > limits.maxTreeEntries) {
    throw new ContractError('repository_context_entry_limit_exceeded', `Repository context exceeds ${limits.maxTreeEntries} files`);
  }
  const seen = new Set();
  return rawRows.map((row) => {
    const tab = row.indexOf('\t');
    if (tab < 1) throw new ContractError('invalid_repository_tree', 'Git tree entry is malformed');
    const metadata = row.slice(0, tab).split(' ');
    if (metadata.length !== 3) throw new ContractError('invalid_repository_tree', 'Git tree entry metadata is malformed');
    const [mode, type, oid] = metadata;
    if (!SUPPORTED_MODES.has(mode) || type !== 'blob') {
      throw new ContractError('unsupported_repository_entry', 'Repository context supports only regular text blobs', {
        mode,
        type,
      });
    }
    assertOid(oid, objectFormat, 'blob OID');
    const filePath = validateRelativePath(row.slice(tab + 1));
    if (seen.has(filePath)) throw new ContractError('duplicate_repository_path', `Duplicate repository path: ${filePath}`);
    seen.add(filePath);
    return { path: filePath, mode, blobOid: oid };
  }).sort((left, right) => compareText(left.path, right.path));
}

function parseBatchBlobs(bytes, rows, objectFormat, limits) {
  let offset = 0;
  let totalBytes = 0;
  const files = [];
  const tree = Object.create(null);

  for (const row of rows) {
    const newline = bytes.indexOf(0x0a, offset);
    if (newline < 0) throw new ContractError('invalid_repository_blob_batch', 'Git blob batch response is truncated');
    const header = bytes.subarray(offset, newline).toString('ascii');
    const parts = header.split(' ');
    if (parts.length !== 3) throw new ContractError('invalid_repository_blob_batch', 'Git blob batch header is malformed');
    const [oid, type, sizeText] = parts;
    assertOid(oid, objectFormat, 'batch blob OID');
    if (oid !== row.blobOid || type !== 'blob' || !/^(0|[1-9][0-9]*)$/.test(sizeText)) {
      throw new ContractError('repository_blob_binding_mismatch', 'Git blob batch response does not match tree metadata');
    }
    const size = Number(sizeText);
    if (!Number.isSafeInteger(size) || size > limits.maxFileBytes) {
      throw new ContractError('repository_context_file_limit_exceeded', `Repository file exceeds ${limits.maxFileBytes} bytes`, {
        path: row.path,
        size: Number.isSafeInteger(size) ? size : null,
      });
    }
    const start = newline + 1;
    const end = start + size;
    if (end >= bytes.length || bytes[end] !== 0x0a) {
      throw new ContractError('invalid_repository_blob_batch', 'Git blob batch content is truncated');
    }
    const contentBytes = bytes.subarray(start, end);
    const content = decodeUtf8(contentBytes, `Repository file ${row.path}`);
    totalBytes += size;
    if (totalBytes > limits.maxTreeBytes) {
      throw new ContractError('repository_context_tree_limit_exceeded', `Repository context exceeds ${limits.maxTreeBytes} bytes`, {
        size: totalBytes,
      });
    }
    tree[row.path] = content;
    files.push({ ...row, byteLength: size, content });
    offset = end + 1;
  }
  if (offset !== bytes.length) {
    throw new ContractError('invalid_repository_blob_batch', 'Git blob batch response has trailing bytes');
  }
  return { files, tree, contentBytes: totalBytes };
}

function contextIdentity(input) {
  return {
    schemaVersion: 1,
    profile: REPOSITORY_CONTEXT_PROFILE,
    objectFormat: input.objectFormat,
    commitOid: input.commitOid,
    treeOid: input.treeOid,
    semanticBaseDigest: input.semanticBaseDigest,
    fileCount: input.fileCount,
    contentBytes: input.contentBytes,
    files: input.files.map(({ path: filePath, mode, blobOid, byteLength }) => ({
      path: filePath,
      mode,
      blobOid,
      byteLength,
    })),
  };
}

function requestInvocation(invocation) {
  return {
    caseId: invocation.caseId,
    planRevisionId: invocation.planRevisionId,
    planDigest: invocation.planDigest,
    baseDigest: invocation.baseDigest,
    effectKey: invocation.effectKey,
    fencingToken: invocation.fencingToken,
    claimLease: invocation.claimLease,
    task: invocation.task,
    attempt: invocation.attempt,
    acceptedResults: invocation.acceptedResults,
  };
}

function validateInvocation(invocation, objectFormat) {
  assertRecordShape(invocation, [
    'caseId', 'planRevisionId', 'planDigest', 'baseDigest', 'effectKey', 'fencingToken', 'claimLease',
    'signal', 'task', 'attempt', 'acceptedResults',
  ], [], 'repository model invocation');
  if (!invocation.signal || typeof invocation.signal.aborted !== 'boolean' || typeof invocation.signal.addEventListener !== 'function') {
    throw new ContractError('invalid_model_signal', 'Invocation signal must implement AbortSignal');
  }
  const task = invocation.task;
  if (!isPlainRecord(task) || task.kind !== 'work' || task.execution?.operation !== MODEL_REPOSITORY_OPERATION ||
      task.execution?.effectClass !== 'result-only') {
    throw new ContractError('unsupported_model_task', 'D0013 supports only result-only tdev.model.repository work Tasks');
  }
  assertRecordShape(task.input, ['repositoryCommitOid', 'instruction'], [], 'model Task input');
  assertOid(task.input.repositoryCommitOid, objectFormat, 'repositoryCommitOid');
  assertScalarString(task.input.instruction, 'model Task instruction');
  return task;
}

async function emitObservation(callback, value) {
  if (callback === null) return;
  try {
    await callback(freeze(value));
  } catch {
    // Observations are explicitly non-authoritative and cannot change transport success/failure.
  }
}

function durationMs(start) {
  return Math.max(0, Math.round(performance.now() - start));
}

export function runModelSubprocess({
  executable,
  args,
  input,
  environment,
  workingDirectory,
  timeoutMs,
  signal,
  maxStdoutBytes,
  maxStderrBytes,
}) {
  if (signal.aborted) {
    return Promise.reject(new ContractError('model_transport_aborted', 'Model transport was aborted before process start'));
  }
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(executable, args, {
        cwd: workingDirectory,
        env: environment,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      });
    } catch (cause) {
      reject(new ContractError('model_process_spawn_failed', 'Failed to start model subprocess', { processStarts: 0 }, { cause }));
      return;
    }

    const started = performance.now();
    const stdout = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let terminalReason = null;
    let settled = false;

    const stop = (reason) => {
      if (terminalReason === null) terminalReason = reason;
      try { child.kill('SIGKILL'); } catch {}
    };
    const onAbort = () => stop('aborted');
    signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => stop('timeout'), timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxStdoutBytes) {
        stop('stdout_limit');
        return;
      }
      stdout.push(Buffer.from(chunk));
    });
    child.stderr.on('data', (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes > maxStderrBytes) stop('stderr_limit');
    });
    child.stdin.on('error', () => {});
    child.once('error', (cause) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(new ContractError('model_process_spawn_failed', 'Model subprocess failed to start', { processStarts: 0 }, { cause }));
    });
    child.once('close', (code, processSignal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      const result = {
        code,
        signal: processSignal,
        stdout: Buffer.concat(stdout),
        stdoutBytes,
        stderrBytes,
        durationMs: durationMs(started),
      };
      if (terminalReason === 'aborted') {
        reject(new ContractError('model_transport_aborted', 'Model transport was aborted', {
          stdoutBytes,
          stderrBytes,
        }));
        return;
      }
      if (terminalReason === 'timeout') {
        reject(new ContractError('model_transport_timeout', 'Model subprocess exceeded its configured timeout', {
          timeoutMs,
          stdoutBytes,
          stderrBytes,
        }));
        return;
      }
      if (terminalReason === 'stdout_limit' || terminalReason === 'stderr_limit') {
        reject(new ContractError('model_output_limit_exceeded', 'Model subprocess output exceeded its configured limit', {
          stream: terminalReason === 'stdout_limit' ? 'stdout' : 'stderr',
          stdoutBytes,
          stderrBytes,
        }));
        return;
      }
      resolve(result);
    });
    child.stdin.end(input);
  });
}

export class GitRepositoryModelExecutor {
  #gitRunner;
  #modelRunner;
  #observation;
  #environment;
  #limits;

  constructor({
    repositoryPath,
    modelExecutable,
    modelArgs = [],
    modelEnvironment = {},
    modelWorkingDirectory = null,
    timeoutMs,
    gitExecutable = 'git',
    gitRunner = runGitCommand,
    modelRunner = runModelSubprocess,
    observation = null,
    limits = {},
  }) {
    this.repositoryPath = normalizeRepositoryPath(repositoryPath);
    this.modelExecutable = normalizeExecutable(modelExecutable);
    this.modelArgs = freeze(normalizeArguments(modelArgs));
    this.modelWorkingDirectory = normalizeWorkingDirectory(modelWorkingDirectory);
    this.timeoutMs = assertSafeInteger(timeoutMs, 'timeoutMs', { min: 1, max: Number.MAX_SAFE_INTEGER });
    this.gitExecutable = normalizeExecutable(gitExecutable);
    if (typeof gitRunner !== 'function') throw new ContractError('invalid_git_runner', 'gitRunner must be a function');
    if (typeof modelRunner !== 'function') throw new ContractError('invalid_model_runner', 'modelRunner must be a function');
    if (observation !== null && typeof observation !== 'function') {
      throw new ContractError('invalid_model_observation', 'observation must be a function or null');
    }
    this.#gitRunner = gitRunner;
    this.#modelRunner = modelRunner;
    this.#observation = observation;
    this.#environment = freeze(normalizeEnvironment(modelEnvironment));
    this.#limits = normalizeLimits(limits);
    Object.freeze(this);
  }

  async #git(args, input = null) {
    return runCheckedGit({
      gitExecutable: this.gitExecutable,
      repositoryPath: this.repositoryPath,
      args,
      input,
      runner: this.#gitRunner,
    });
  }

  async materializeContext(commitOid, expectedBaseDigest) {
    const scanStarted = performance.now();
    const objectFormat = (await this.#git(['rev-parse', '--show-object-format'])).toString('utf8').trim();
    assertOid(commitOid, objectFormat, 'repositoryCommitOid');
    const type = (await this.#git(['cat-file', '-t', commitOid])).toString('utf8').trim();
    if (type !== 'commit') throw new ContractError('repository_context_not_commit', 'repositoryCommitOid must name a Git commit');
    const treeOid = (await this.#git(['rev-parse', `${commitOid}^{tree}`])).toString('utf8').trim();
    assertOid(treeOid, objectFormat, 'tree OID');
    const rows = parseTreeRows(await this.#git(['ls-tree', '-r', '-z', commitOid]), objectFormat, this.#limits);
    const batchInput = rows.length === 0 ? Buffer.alloc(0) : Buffer.from(`${rows.map((row) => row.blobOid).join('\n')}\n`, 'ascii');
    const blobs = rows.length === 0
      ? { files: [], tree: Object.create(null), contentBytes: 0 }
      : parseBatchBlobs(await this.#git(['cat-file', '--batch'], batchInput), rows, objectFormat, this.#limits);
    const normalizedTree = validateTree(blobs.tree, {
      limits: {
        maxTreeEntries: this.#limits.maxTreeEntries,
        maxFileBytes: this.#limits.maxFileBytes,
        maxTreeBytes: this.#limits.maxTreeBytes,
      },
    });
    const semanticBaseDigest = digest(normalizedTree);
    if (semanticBaseDigest !== expectedBaseDigest) {
      throw new ContractError('repository_context_base_mismatch', 'Repository context does not match the Plan base digest', {
        expectedBaseDigest,
        observedBaseDigest: semanticBaseDigest,
      });
    }
    const identity = contextIdentity({
      objectFormat,
      commitOid,
      treeOid,
      semanticBaseDigest,
      fileCount: blobs.files.length,
      contentBytes: blobs.contentBytes,
      files: blobs.files,
    });
    const descriptor = freeze({
      ...identity,
      contextDigest: typedDigest(REPOSITORY_CONTEXT_PROFILE, identity),
    });
    return {
      descriptor,
      files: freeze(blobs.files),
      scanDurationMs: durationMs(scanStarted),
    };
  }

  async execute(invocation) {
    const totalStarted = performance.now();
    const objectFormat = (await this.#git(['rev-parse', '--show-object-format'])).toString('utf8').trim();
    const task = validateInvocation(invocation, objectFormat);
    if (invocation.signal.aborted) {
      throw new ContractError('model_transport_aborted', 'Model transport was aborted before context construction');
    }
    const context = await this.materializeContext(task.input.repositoryCommitOid, invocation.baseDigest);
    const requestIdentity = freeze({
      schemaVersion: 1,
      profile: MODEL_TRANSPORT_PROFILE,
      repositoryContext: context.descriptor,
      repositoryFiles: context.files,
      invocation: requestInvocation(invocation),
    });
    const request = freeze({
      ...requestIdentity,
      requestDigest: typedDigest(MODEL_REQUEST_DOMAIN, requestIdentity),
    });
    const input = Buffer.from(canonicalJson(request), 'utf8');
    if (input.length > this.#limits.maxRequestBytes) {
      throw new ContractError('model_request_limit_exceeded', `Model request exceeds ${this.#limits.maxRequestBytes} bytes`, {
        requestBytes: input.length,
      });
    }

    const processStarted = performance.now();
    const observe = (outcome, responseBytes = 0, processDurationMs = durationMs(processStarted), processStarts = 1) => emitObservation(this.#observation, {
      schemaVersion: 1,
      profile: MODEL_TRANSPORT_PROFILE,
      caseId: invocation.caseId,
      taskId: task.id,
      attemptId: invocation.attempt.id,
      repositoryCommitOid: task.input.repositoryCommitOid,
      contextDigest: context.descriptor.contextDigest,
      fileCount: context.descriptor.fileCount,
      contextBytes: context.descriptor.contentBytes,
      requestBytes: input.length,
      responseBytes,
      processStarts,
      processReuses: 0,
      scanDurationMs: context.scanDurationMs,
      processDurationMs,
      totalDurationMs: durationMs(totalStarted),
      outcome,
    });
    let processResult;
    try {
      processResult = await this.#modelRunner({
        executable: this.modelExecutable,
        args: this.modelArgs,
        input,
        environment: Object.assign(Object.create(null), this.#environment),
        workingDirectory: this.modelWorkingDirectory,
        timeoutMs: this.timeoutMs,
        signal: invocation.signal,
        maxStdoutBytes: this.#limits.maxResponseBytes,
        maxStderrBytes: this.#limits.maxStderrBytes,
      });
    } catch (error) {
      await observe(
        error?.code ?? 'model_transport_failed',
        Number.isSafeInteger(error?.details?.stdoutBytes) ? error.details.stdoutBytes : 0,
        durationMs(processStarted),
        error?.details?.processStarts === 0 ? 0 : 1,
      );
      throw error;
    }
    if (!processResult || !Number.isInteger(processResult.code) || !Buffer.isBuffer(processResult.stdout)) {
      const error = new ContractError('invalid_model_runner_result', 'Model runner returned an invalid result');
      await observe(error.code);
      throw error;
    }
    if (processResult.code !== 0) {
      const error = new ContractError('model_process_failed', 'Model subprocess exited unsuccessfully', {
        exitCode: processResult.code,
        signal: processResult.signal ?? null,
        stdoutBytes: processResult.stdoutBytes ?? processResult.stdout.length,
        stderrBytes: processResult.stderrBytes ?? 0,
      });
      await observe(
        'model_process_failed',
        processResult.stdoutBytes ?? processResult.stdout.length,
        processResult.durationMs ?? durationMs(processStarted),
      );
      throw error;
    }

    const responseBytes = processResult.stdoutBytes ?? processResult.stdout.length;
    const processDurationMs = processResult.durationMs ?? durationMs(processStarted);
    let response;
    try {
      response = strictJsonParse(processResult.stdout, { maxBytes: this.#limits.maxResponseBytes });
      assertRecordShape(response, ['schemaVersion', 'profile', 'requestDigest', 'result'], [], 'model response');
      if (response.schemaVersion !== 1 || response.profile !== MODEL_TRANSPORT_PROFILE) {
        throw new ContractError('unsupported_model_response', 'Model response version/profile is unsupported');
      }
      if (response.requestDigest !== request.requestDigest) {
        throw new ContractError('model_response_request_mismatch', 'Model response is bound to another request');
      }
    } catch (error) {
      await observe(error?.code ?? 'invalid_model_response', responseBytes, processDurationMs);
      throw error;
    }
    await observe('returned', responseBytes, processDurationMs);
    return response.result;
  }
}
