import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
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
  isPlainRecord,
  strictJsonParse,
  typedDigest,
} from './canonical.mjs';
import { runGitCommand } from './git-projection.mjs';
import { DEFAULT_LIMITS, validateRelativePath } from './policy.mjs';
import { validateTree } from './promotion.mjs';
import {
  prepareSelectedContextDelivery,
  resolveSelectedContextDelivery,
} from './selected-context-delivery.mjs';

export const REPOSITORY_CONTEXT_PROFILE = 'tdev.repository-context.git-full-text.v1';
export const MODEL_TRANSPORT_PROFILE = 'tdev.model.subprocess-json.v1';
export const MODEL_REPOSITORY_OPERATION = 'tdev.model.repository';
export const MODEL_REQUEST_DOMAIN = 'tdev.model.repository-request.v1';

const SUPPORTED_MODES = new Set(['100644', '100755']);
const fatalDecoder = new TextDecoder('utf-8', { fatal: true });
const NEVER_ABORTED_SIGNAL = new AbortController().signal;
const DEFAULT_CONTEXT_CACHE = Object.freeze({
  maxEntries: 4,
  maxBytes: 32 * 1024 * 1024,
});
const MAX_CONTEXT_CACHE_ENTRIES = 64;
const MAX_CONTEXT_CACHE_BYTES = 256 * 1024 * 1024;
const REQUEST_PREFIX = Buffer.from('{"invocation":', 'utf8');
const REQUEST_PROFILE_AND_CONTEXT = Buffer.from(
  `,"profile":${JSON.stringify(MODEL_TRANSPORT_PROFILE)},"repositoryContext":`,
  'utf8',
);
const REQUEST_FILES = Buffer.from(',"repositoryFiles":', 'utf8');
const REQUEST_IDENTITY_SUFFIX = Buffer.from(',"schemaVersion":1}', 'utf8');
const REQUEST_DIGEST_FIELD = Buffer.from(',"requestDigest":', 'utf8');
const REQUEST_SUFFIX = Buffer.from(',"schemaVersion":1}', 'utf8');
const DIGEST_SEPARATOR = Buffer.from([0]);

function freeze(value) {
  return deepFreeze(canonicalClone(value));
}

function abortError(message = 'Model transport was aborted') {
  return new ContractError('model_transport_aborted', message);
}

function assertAbortSignal(signal, label = 'signal') {
  if (!signal || typeof signal.aborted !== 'boolean' || typeof signal.addEventListener !== 'function') {
    throw new ContractError('invalid_model_signal', `${label} must implement AbortSignal`);
  }
  return signal;
}

function throwIfAborted(signal, message) {
  if (signal.aborted) throw abortError(message);
}

function inferObjectFormat(value, label = 'Git OID') {
  assertScalarString(value, label);
  if (/^[0-9a-f]{40}$/.test(value)) return 'sha1';
  if (/^[0-9a-f]{64}$/.test(value)) return 'sha256';
  throw new ContractError('invalid_git_oid', `${label} must be a full lowercase SHA-1 or SHA-256 OID`);
}

function normalizeContextCache(input) {
  if (input === false) return null;
  const value = input === undefined ? {} : input;
  assertRecordShape(value, [], ['maxEntries', 'maxBytes'], 'contextCache');
  return freeze({
    maxEntries: value.maxEntries === undefined
      ? DEFAULT_CONTEXT_CACHE.maxEntries
      : assertSafeInteger(value.maxEntries, 'contextCache.maxEntries', {
        min: 1,
        max: MAX_CONTEXT_CACHE_ENTRIES,
      }),
    maxBytes: value.maxBytes === undefined
      ? DEFAULT_CONTEXT_CACHE.maxBytes
      : assertSafeInteger(value.maxBytes, 'contextCache.maxBytes', {
        min: 1,
        max: MAX_CONTEXT_CACHE_BYTES,
      }),
  });
}

function zeroGitMetrics() {
  return {
    commandCount: 0,
    inputBytes: 0,
    stdoutBytes: 0,
    durationMs: 0,
  };
}

function estimatePreparationBytes(files, descriptorBytes, filesBytes) {
  let utf16Bytes = 0;
  for (const file of files) {
    utf16Bytes += 2 * (
      file.path.length + file.mode.length + file.blobOid.length + file.content.length
    );
    utf16Bytes += 128;
  }
  return descriptorBytes.length + filesBytes.length + utf16Bytes + 2_048;
}

function digestCanonicalJson(encoded) {
  return `sha256:${createHash('sha256').update(encoded).digest('hex')}`;
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

function normalizeExcludedPaths(input) {
  if (input === undefined) return Object.freeze([]);
  if (!Array.isArray(input) || input.length > 128) {
    throw new ContractError('invalid_repository_excluded_paths', 'excludedPaths must be a bounded array');
  }
  const paths = input.map((value, index) => validateRelativePath(value, {
    requireNfc: true,
    deniedPrefixes: ['.git', '.tdev'],
    maxPathBytes: DEFAULT_LIMITS.maxPathBytes,
  })).sort(compareText);
  for (let index = 1; index < paths.length; index += 1) {
    if (paths[index] === paths[index - 1]) throw new ContractError('duplicate_repository_excluded_path', `excludedPaths repeats ${paths[index]}`);
  }
  return Object.freeze(paths);
}

class ContextPreparationCache {
  #entries = new Map();
  #retainedBytes = 0;

  constructor(configuration) {
    this.configuration = configuration;
    Object.freeze(this);
  }

  async acquire(key, signal, producer) {
    throwIfAborted(signal, 'Model transport was aborted before context preparation');
    const existing = this.#entries.get(key);
    if (existing?.state === 'complete') {
      this.#touch(existing);
      return {
        preparation: existing.value,
        cacheStatus: 'hit',
        contextMaterializations: 0,
        contextRetained: true,
        waitDurationMs: 0,
      };
    }
    if (existing?.state === 'pending') {
      return this.#wait(existing, signal, 'shared');
    }

    const entry = {
      key,
      state: 'pending',
      controller: new AbortController(),
      waiters: 0,
      value: null,
      retainedBytes: 0,
      retained: false,
      metricsClaimed: false,
      promise: null,
    };
    this.#entries.set(key, entry);
    entry.promise = Promise.resolve()
      .then(() => producer(entry.controller.signal))
      .then((value) => {
        entry.value = value;
        entry.retainedBytes = value.retainedBytes;
        const current = this.#entries.get(key);
        if (current !== entry) return value;
        if (value.retainedBytes <= this.configuration.maxBytes) {
          entry.state = 'complete';
          entry.retained = true;
          this.#retainedBytes += value.retainedBytes;
          this.#touch(entry);
          this.#evict();
        } else {
          this.#entries.delete(key);
        }
        return value;
      }, (error) => {
        if (this.#entries.get(key) === entry) this.#entries.delete(key);
        throw error;
      });
    entry.promise.catch(() => {});
    return this.#wait(entry, signal, 'miss');
  }

  #touch(entry) {
    if (this.#entries.get(entry.key) !== entry) return;
    this.#entries.delete(entry.key);
    this.#entries.set(entry.key, entry);
  }

  #evict() {
    const completeCount = () => {
      let count = 0;
      for (const entry of this.#entries.values()) {
        if (entry.state === 'complete') count += 1;
      }
      return count;
    };
    while (
      this.#retainedBytes > this.configuration.maxBytes ||
      completeCount() > this.configuration.maxEntries
    ) {
      let victim = null;
      for (const entry of this.#entries.values()) {
        if (entry.state === 'complete') {
          victim = entry;
          break;
        }
      }
      if (victim === null) return;
      this.#entries.delete(victim.key);
      this.#retainedBytes -= victim.retainedBytes;
    }
  }

  #wait(entry, signal, cacheStatus) {
    const started = performance.now();
    entry.waiters += 1;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        entry.waiters -= 1;
        if (entry.state === 'pending' && entry.waiters === 0) {
          if (this.#entries.get(entry.key) === entry) this.#entries.delete(entry.key);
          entry.state = 'aborting';
          entry.controller.abort(abortError('All context preparation readers were aborted'));
        }
        callback(value);
      };
      const onAbort = () => finish(
        reject,
        abortError('Model transport was aborted while waiting for context preparation'),
      );
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) {
        onAbort();
        return;
      }
      entry.promise.then(
        (preparation) => {
          if (settled) return;
          let contextMaterializations = 0;
          if (!entry.metricsClaimed) {
            entry.metricsClaimed = true;
            contextMaterializations = 1;
          }
          finish(resolve, {
            preparation,
            cacheStatus,
            contextMaterializations,
            contextRetained: entry.retained,
            waitDurationMs: durationMs(started),
          });
        },
        (error) => finish(reject, error),
      );
    });
  }
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

async function runCheckedGit({ gitExecutable, repositoryPath, args, input = null, signal, runner }) {
  const result = await runner({ gitExecutable, repositoryPath, args, input, signal });
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
  let contentBytes = 0;
  const rows = rawRows.map((row) => {
    const tab = row.indexOf('\t');
    if (tab < 1) throw new ContractError('invalid_repository_tree', 'Git tree entry is malformed');
    const metadata = row.slice(0, tab).trim().split(/ +/u);
    if (metadata.length !== 4) throw new ContractError('invalid_repository_tree', 'Git tree entry metadata is malformed');
    const [mode, type, oid, sizeText] = metadata;
    if (!SUPPORTED_MODES.has(mode) || type !== 'blob') {
      throw new ContractError('unsupported_repository_entry', 'Repository context supports only regular text blobs', {
        mode,
        type,
      });
    }
    assertOid(oid, objectFormat, 'blob OID');
    if (!/^(0|[1-9][0-9]*)$/u.test(sizeText)) {
      throw new ContractError('invalid_repository_tree', 'Git tree entry size is malformed');
    }
    const byteLength = Number(sizeText);
    if (!Number.isSafeInteger(byteLength) || byteLength > limits.maxFileBytes) {
      throw new ContractError('repository_context_file_limit_exceeded', `Repository file exceeds ${limits.maxFileBytes} bytes`, {
        path: row.slice(tab + 1),
        size: Number.isSafeInteger(byteLength) ? byteLength : null,
      });
    }
    contentBytes += byteLength;
    if (contentBytes > limits.maxTreeBytes) {
      throw new ContractError('repository_context_tree_limit_exceeded', `Repository context exceeds ${limits.maxTreeBytes} bytes`, {
        size: contentBytes,
      });
    }
    const filePath = validateRelativePath(row.slice(tab + 1));
    if (seen.has(filePath)) throw new ContractError('duplicate_repository_path', `Duplicate repository path: ${filePath}`);
    seen.add(filePath);
    return { path: filePath, mode, blobOid: oid, byteLength };
  }).sort((left, right) => compareText(left.path, right.path));
  return { rows, contentBytes };
}

function parseBatchBlobs(bytes, rows, objectFormat) {
  let offset = 0;
  let uniqueContentBytes = 0;
  const contentsByOid = new Map();
  const uniqueRows = [];
  const seenOids = new Set();

  for (const row of rows) {
    if (seenOids.has(row.blobOid)) continue;
    seenOids.add(row.blobOid);
    uniqueRows.push(row);
  }

  for (const row of uniqueRows) {
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
    if (!Number.isSafeInteger(size) || size !== row.byteLength) {
      throw new ContractError('repository_blob_binding_mismatch', 'Git blob batch size does not match tree metadata', {
        path: row.path,
        expectedSize: row.byteLength,
        observedSize: Number.isSafeInteger(size) ? size : null,
      });
    }
    const start = newline + 1;
    const end = start + size;
    if (end >= bytes.length || bytes[end] !== 0x0a) {
      throw new ContractError('invalid_repository_blob_batch', 'Git blob batch content is truncated');
    }
    const contentBytes = bytes.subarray(start, end);
    const content = decodeUtf8(contentBytes, `Repository file ${row.path}`);
    uniqueContentBytes += size;
    contentsByOid.set(row.blobOid, content);
    offset = end + 1;
  }
  if (offset !== bytes.length) {
    throw new ContractError('invalid_repository_blob_batch', 'Git blob batch response has trailing bytes');
  }
  const files = [];
  const tree = Object.create(null);
  for (const row of rows) {
    const content = contentsByOid.get(row.blobOid);
    if (content === undefined) {
      throw new ContractError('invalid_repository_blob_batch', 'Git blob batch omitted an expected object');
    }
    tree[row.path] = content;
    files.push({ ...row, content });
  }
  return {
    files,
    tree,
    uniqueBlobCount: uniqueRows.length,
    uniqueContentBytes,
  };
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
    excludedPaths: input.excludedPaths,
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

function validateInvocation(invocation) {
  assertRecordShape(invocation, [
    'caseId', 'planRevisionId', 'planDigest', 'caseContractDigest', 'baseDigest', 'effectKey', 'fencingToken', 'claimLease',
    'signal', 'task', 'attempt', 'acceptedResults',
  ], [], 'repository model invocation');
  assertScalarString(invocation.caseContractDigest, 'caseContractDigest');
  assertAbortSignal(invocation.signal, 'Invocation signal');
  const task = invocation.task;
  if (!isPlainRecord(task) || task.kind !== 'work' || task.execution?.operation !== MODEL_REPOSITORY_OPERATION ||
      task.execution?.effectClass !== 'result-only') {
    throw new ContractError('unsupported_model_task', 'D0013 supports only result-only tdev.model.repository work Tasks');
  }
  assertRecordShape(task.input, ['repositoryCommitOid', 'instruction'], [], 'model Task input');
  const objectFormat = inferObjectFormat(task.input.repositoryCommitOid, 'repositoryCommitOid');
  assertOid(task.input.repositoryCommitOid, objectFormat, 'repositoryCommitOid');
  assertScalarString(task.input.instruction, 'model Task instruction');
  return { task, objectFormat };
}

function buildRequest(preparation, invocation, maxRequestBytes) {
  const started = performance.now();
  throwIfAborted(invocation.signal, 'Model transport was aborted before request construction');
  const invocationBytes = Buffer.from(canonicalJson(requestInvocation(invocation)), 'utf8');
  throwIfAborted(invocation.signal, 'Model transport was aborted during request construction');
  const identityChunks = [
    REQUEST_PREFIX,
    invocationBytes,
    REQUEST_PROFILE_AND_CONTEXT,
    preparation.descriptorBytes,
    REQUEST_FILES,
    preparation.filesBytes,
    REQUEST_IDENTITY_SUFFIX,
  ];
  const requestHash = createHash('sha256')
    .update(MODEL_REQUEST_DOMAIN, 'utf8')
    .update(DIGEST_SEPARATOR);
  for (const chunk of identityChunks) requestHash.update(chunk);
  const requestDigest = `sha256:${requestHash.digest('hex')}`;
  const requestDigestBytes = Buffer.from(JSON.stringify(requestDigest), 'utf8');
  const inputChunks = [
    REQUEST_PREFIX,
    invocationBytes,
    REQUEST_PROFILE_AND_CONTEXT,
    preparation.descriptorBytes,
    REQUEST_FILES,
    preparation.filesBytes,
    REQUEST_DIGEST_FIELD,
    requestDigestBytes,
    REQUEST_SUFFIX,
  ];
  const requestBytes = inputChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  if (requestBytes > maxRequestBytes) {
    throw new ContractError('model_request_limit_exceeded', `Model request exceeds ${maxRequestBytes} bytes`, {
      requestBytes,
    });
  }
  throwIfAborted(invocation.signal, 'Model transport was aborted before request allocation');
  return {
    input: Buffer.concat(inputChunks, requestBytes),
    requestDigest,
    requestBytes,
    requestBuildDurationMs: durationMs(started),
  };
}

function emitObservation(callback, value) {
  if (callback === null) return;
  try {
    Promise.resolve(callback(freeze(value))).catch(() => {});
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
    return Promise.reject(new ContractError(
      'model_transport_aborted',
      'Model transport was aborted before process start',
      { processStarts: 0 },
    ));
  }
  return new Promise((resolve, reject) => {
    let child;
    const useProcessGroup = process.platform !== 'win32';
    try {
      child = spawn(executable, args, {
        cwd: workingDirectory,
        env: environment,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        detached: useProcessGroup,
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

    const killProcessGroup = () => {
      if (useProcessGroup && Number.isSafeInteger(child.pid) && child.pid > 0) {
        try {
          process.kill(-child.pid, 'SIGKILL');
          return true;
        } catch {}
      }
      return false;
    };
    const stop = (reason) => {
      if (terminalReason === null) terminalReason = reason;
      if (killProcessGroup()) return;
      try { child.kill('SIGKILL'); } catch {}
    };
    const onAbort = () => stop('aborted');
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
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
    child.once('exit', () => {
      // `close` waits for inherited stdio handles. Kill remaining group members as soon as
      // the direct child exits so a successful response cannot be misclassified as timeout.
      killProcessGroup();
    });
    child.once('close', (code, processSignal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      killProcessGroup();
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
  #contextCache;

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
    excludedPaths = undefined,
    contextCache = undefined,
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
    this.excludedPaths = normalizeExcludedPaths(excludedPaths);
    const cacheConfiguration = normalizeContextCache(contextCache);
    this.#contextCache = cacheConfiguration === null
      ? null
      : new ContextPreparationCache(cacheConfiguration);
    Object.freeze(this);
  }

  async #git(args, input, signal, metrics) {
    const started = performance.now();
    metrics.commandCount += 1;
    metrics.inputBytes += input?.length ?? 0;
    try {
      const stdout = await runCheckedGit({
        gitExecutable: this.gitExecutable,
        repositoryPath: this.repositoryPath,
        args,
        input,
        signal,
        runner: this.#gitRunner,
      });
      metrics.stdoutBytes += stdout.length;
      return stdout;
    } finally {
      metrics.durationMs += durationMs(started);
    }
  }

  async #produceContext(commitOid, expectedBaseDigest, objectFormat, signal, requestLimit = null) {
    const scanStarted = performance.now();
    const gitMetrics = zeroGitMetrics();
    throwIfAborted(signal, 'Model transport was aborted before repository scan');
    const observedObjectFormat = (
      await this.#git(['rev-parse', '--show-object-format'], null, signal, gitMetrics)
    ).toString('utf8').trim();
    if (observedObjectFormat !== objectFormat) {
      throw new ContractError('repository_object_format_mismatch', 'Repository object format does not match the commit OID', {
        expectedObjectFormat: objectFormat,
        observedObjectFormat,
      });
    }
    assertOid(commitOid, objectFormat, 'repositoryCommitOid');
    const type = (
      await this.#git(['cat-file', '-t', commitOid], null, signal, gitMetrics)
    ).toString('utf8').trim();
    if (type !== 'commit') throw new ContractError('repository_context_not_commit', 'repositoryCommitOid must name a Git commit');
    const treeOid = (
      await this.#git(['rev-parse', `${commitOid}^{tree}`], null, signal, gitMetrics)
    ).toString('utf8').trim();
    assertOid(treeOid, objectFormat, 'tree OID');
    const listing = parseTreeRows(
      await this.#git(['ls-tree', '-r', '-z', '-l', commitOid], null, signal, gitMetrics),
      objectFormat,
      this.#limits,
    );
    const excludedSet = new Set(this.excludedPaths);
    const listedPaths = new Set(listing.rows.map((row) => row.path));
    for (const excludedPath of this.excludedPaths) {
      if (!listedPaths.has(excludedPath)) {
        throw new ContractError('repository_excluded_path_missing', `Configured excluded path is absent from the bound commit: ${excludedPath}`);
      }
    }
    const rows = listing.rows.filter((row) => !excludedSet.has(row.path));
    const contentBytes = rows.reduce((sum, row) => sum + row.byteLength, 0);
    if (requestLimit !== null && contentBytes >= requestLimit) {
      throw new ContractError('model_request_limit_exceeded', `Model request exceeds ${requestLimit} bytes`, {
        requestBytesLowerBound: contentBytes,
      });
    }
    const uniqueBlobOids = [...new Set(rows.map((row) => row.blobOid))];
    const batchInput = uniqueBlobOids.length === 0
      ? Buffer.alloc(0)
      : Buffer.from(`${uniqueBlobOids.join('\n')}\n`, 'ascii');
    const blobs = rows.length === 0
      ? {
        files: [],
        tree: Object.create(null),
        uniqueBlobCount: 0,
        uniqueContentBytes: 0,
      }
      : parseBatchBlobs(
        await this.#git(['cat-file', '--batch'], batchInput, signal, gitMetrics),
        rows,
        objectFormat,
      );
    throwIfAborted(signal, 'Model transport was aborted after repository blob loading');
    const normalizedTree = validateTree(blobs.tree, {
      limits: {
        maxTreeEntries: this.#limits.maxTreeEntries,
        maxFileBytes: this.#limits.maxFileBytes,
        maxTreeBytes: this.#limits.maxTreeBytes,
      },
    });
    const semanticJson = canonicalJson(normalizedTree);
    const semanticBaseDigest = digestCanonicalJson(semanticJson);
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
      contentBytes,
      excludedPaths: this.excludedPaths,
      files: blobs.files,
    });
    const descriptor = deepFreeze({
      ...identity,
      contextDigest: typedDigest(REPOSITORY_CONTEXT_PROFILE, identity),
    });
    const files = deepFreeze(blobs.files);
    throwIfAborted(signal, 'Model transport was aborted before context encoding');
    const descriptorBytes = Buffer.from(canonicalJson(descriptor), 'utf8');
    const filesBytes = Buffer.from(canonicalJson(files), 'utf8');
    throwIfAborted(signal, 'Model transport was aborted after context encoding');
    const scanDurationMs = durationMs(scanStarted);
    return {
      descriptor,
      files,
      descriptorBytes,
      filesBytes,
      retainedBytes: estimatePreparationBytes(files, descriptorBytes, filesBytes),
      contextEncodingBytes: descriptorBytes.length + filesBytes.length,
      excludedPaths: this.excludedPaths,
      logicalBlobCount: rows.length,
      logicalContentBytes: contentBytes,
      uniqueBlobCount: blobs.uniqueBlobCount,
      uniqueContentBytes: blobs.uniqueContentBytes,
      validationOperations: rows.length,
      hashBytes: Buffer.byteLength(semanticJson, 'utf8'),
      scanDurationMs,
      gitMetrics,
    };
  }

  async #acquireContext(commitOid, expectedBaseDigest, objectFormat, signal, requestLimit = null) {
    const started = performance.now();
    if (this.#contextCache === null) {
      const preparation = await this.#produceContext(
        commitOid,
        expectedBaseDigest,
        objectFormat,
        signal,
        requestLimit,
      );
      return {
        preparation,
        cacheStatus: 'disabled',
        contextMaterializations: 1,
        contextRetained: false,
        waitDurationMs: durationMs(started),
      };
    }
    const key = `${objectFormat}\0${commitOid}\0${expectedBaseDigest}`;
    return this.#contextCache.acquire(
      key,
      signal,
      (producerSignal) => this.#produceContext(
        commitOid,
        expectedBaseDigest,
        objectFormat,
        producerSignal,
        requestLimit,
      ),
    );
  }

  async materializeContext(commitOid, expectedBaseDigest, options = {}) {
    assertRecordShape(options, [], ['signal'], 'materializeContext options');
    const signal = options.signal === undefined
      ? NEVER_ABORTED_SIGNAL
      : assertAbortSignal(options.signal, 'materializeContext signal');
    throwIfAborted(signal, 'Model transport was aborted before context construction');
    const objectFormat = inferObjectFormat(commitOid, 'repositoryCommitOid');
    const acquired = await this.#acquireContext(
      commitOid,
      expectedBaseDigest,
      objectFormat,
      signal,
    );
    const metrics = acquired.contextMaterializations === 1
      ? acquired.preparation.gitMetrics
      : zeroGitMetrics();
    return {
      descriptor: acquired.preparation.descriptor,
      files: acquired.preparation.files,
      excludedPaths: acquired.preparation.excludedPaths,
      scanDurationMs: acquired.contextMaterializations === 1
        ? acquired.preparation.scanDurationMs
        : 0,
      preparationDurationMs: acquired.waitDurationMs,
      cacheStatus: acquired.cacheStatus,
      contextMaterializations: acquired.contextMaterializations,
      contextRetained: acquired.contextRetained,
      gitCommandCount: metrics.commandCount,
      gitInputBytes: metrics.inputBytes,
      gitStdoutBytes: metrics.stdoutBytes,
    };
  }

  async execute(invocation) {
    const totalStarted = performance.now();
    const { task, objectFormat } = validateInvocation(invocation);
    throwIfAborted(invocation.signal, 'Model transport was aborted before context construction');
    const acquired = await this.#acquireContext(
      task.input.repositoryCommitOid,
      invocation.baseDigest,
      objectFormat,
      invocation.signal,
      this.#limits.maxRequestBytes,
    );
    const preparation = acquired.preparation;
    const resolutionStarted = performance.now();
    const delivery = await prepareSelectedContextDelivery({
      descriptor: preparation.descriptor,
      files: preparation.files,
    }, invocation);
    const resolved = await resolveSelectedContextDelivery(delivery, invocation);
    const resolvedDescriptorBytes = Buffer.from(canonicalJson(resolved.descriptor), 'utf8');
    const resolvedFilesBytes = Buffer.from(canonicalJson(resolved.files), 'utf8');
    if (!resolvedDescriptorBytes.equals(preparation.descriptorBytes) ||
        !resolvedFilesBytes.equals(preparation.filesBytes)) {
      throw new ContractError(
        'context_reference_corrupt',
        'Resolved selected context differs from authoritative full repository context',
      );
    }
    const resolvedPreparation = {
      ...preparation,
      descriptor: resolved.descriptor,
      files: resolved.files,
      descriptorBytes: resolvedDescriptorBytes,
      filesBytes: resolvedFilesBytes,
    };
    const resolutionDurationMs = durationMs(resolutionStarted);
    const request = buildRequest(resolvedPreparation, invocation, this.#limits.maxRequestBytes);
    const producerGitMetrics = acquired.contextMaterializations === 1
      ? preparation.gitMetrics
      : zeroGitMetrics();

    const processStarted = performance.now();
    const observe = (
      outcome,
      responseBytes = 0,
      processDurationMs = durationMs(processStarted),
      processStarts = 1,
      responseParseDurationMs = 0,
    ) => emitObservation(this.#observation, {
      schemaVersion: 1,
      profile: MODEL_TRANSPORT_PROFILE,
      caseId: invocation.caseId,
      taskId: task.id,
      attemptId: invocation.attempt.id,
      repositoryCommitOid: task.input.repositoryCommitOid,
      contextDigest: preparation.descriptor.contextDigest,
      contextReferenceId: resolved.reference.referenceId,
      authorizationScopeDigest: resolved.reference.authorizationScopeDigest,
      contextPackCount: resolved.packCount,
      contextManifestBytes: resolved.manifestBytes,
      contextPackedStoredBytes: resolved.storedBytes,
      contextResolutionDurationMs: resolutionDurationMs,
      fileCount: preparation.descriptor.fileCount,
      contextBytes: preparation.descriptor.contentBytes,
      logicalBlobCount: preparation.logicalBlobCount,
      uniqueBlobCount: preparation.uniqueBlobCount,
      uniqueBlobBytes: preparation.uniqueContentBytes,
      contextEncodingBytes: preparation.contextEncodingBytes,
      cacheStatus: acquired.cacheStatus,
      contextRetained: acquired.contextRetained,
      contextMaterializations: acquired.contextMaterializations,
      contextWaitDurationMs: acquired.waitDurationMs,
      gitCommandCount: producerGitMetrics.commandCount,
      gitInputBytes: producerGitMetrics.inputBytes,
      gitStdoutBytes: producerGitMetrics.stdoutBytes,
      gitDurationMs: producerGitMetrics.durationMs,
      validationOperations: acquired.contextMaterializations === 1
        ? preparation.validationOperations
        : 0,
      hashBytes: acquired.contextMaterializations === 1 ? preparation.hashBytes : 0,
      requestBytes: request.requestBytes,
      requestBuildDurationMs: request.requestBuildDurationMs,
      responseBytes,
      responseParseDurationMs,
      processStarts,
      processReuses: 0,
      scanDurationMs: acquired.contextMaterializations === 1
        ? preparation.scanDurationMs
        : 0,
      processDurationMs,
      totalDurationMs: durationMs(totalStarted),
      outcome,
    });
    let processResult;
    try {
      processResult = await this.#modelRunner({
        executable: this.modelExecutable,
        args: this.modelArgs,
        input: request.input,
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
    const responseParseStarted = performance.now();
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
      await observe(
        error?.code ?? 'invalid_model_response',
        responseBytes,
        processDurationMs,
        1,
        durationMs(responseParseStarted),
      );
      throw error;
    }
    await observe('returned', responseBytes, processDurationMs, 1, durationMs(responseParseStarted));
    return response.result;
  }
}
