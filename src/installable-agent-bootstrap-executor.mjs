import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import {
  chmod,
  mkdir,
  mkdtemp,
  open,
  readdir,
  rm,
  stat,
} from 'node:fs/promises';

import {
  ContractError,
  assertRecordShape,
  assertSafeInteger,
  canonicalClone,
  canonicalJson,
} from './canonical.mjs';
import {
  INSTALLABLE_AGENT_BOOTSTRAP_OPERATOR_DIGEST_SOURCE,
  INSTALLABLE_AGENT_BOOTSTRAP_RUNTIME_ARCHITECTURE,
  INSTALLABLE_AGENT_BOOTSTRAP_RUNTIME_PLATFORM,
  INSTALLABLE_AGENT_BOOTSTRAP_WORKING_DIRECTORY_PROFILE,
  bootstrapTrustCapsuleSha256,
  inspectBootstrapVerifierBuiltinClosure,
  normalizeBootstrapTrustCapsule,
  rawSha256Hex,
  verifyBootstrapExecutionClosure,
} from './installable-agent-security.mjs';

export const INSTALLABLE_AGENT_BOOTSTRAP_EXECUTOR_PROFILE = 'tdev.agent-bootstrap-executor.v1';
export const INSTALLABLE_AGENT_BOOTSTRAP_DEFAULT_TIMEOUT_MS = 30_000;
export const INSTALLABLE_AGENT_BOOTSTRAP_DEFAULT_MAX_STDOUT_BYTES = 64 * 1024;
export const INSTALLABLE_AGENT_BOOTSTRAP_DEFAULT_MAX_STDERR_BYTES = 64 * 1024;

function fail(code, message, details = undefined, options = undefined) {
  throw new ContractError(code, message, details, options);
}

function normalizeAbsolutePath(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || !path.isAbsolute(value)) {
    fail('invalid_bootstrap_executor_path', label + ' must be an absolute path');
  }
  const resolved = path.resolve(value);
  if (resolved !== value) fail('invalid_bootstrap_executor_path', label + ' must be canonical and contain no path aliases');
  return value;
}

function normalizeArguments(input) {
  if (input === undefined) return [];
  if (!Array.isArray(input)) fail('invalid_bootstrap_executor_arguments', 'Bootstrap verifier arguments must be an array');
  return input.map((value, index) => {
    if (typeof value !== 'string' || value.includes('\0')) fail('invalid_bootstrap_executor_arguments', 'Bootstrap verifier argument ' + index + ' is invalid');
    return value;
  });
}

function normalizeExecutorOptions(input = {}) {
  assertRecordShape(input, [], [
    'runtimePath', 'verifierPath', 'verifierArguments', 'timeoutMs', 'maxStdoutBytes', 'maxStderrBytes',
    'capsuleDigestSource',
  ], 'bootstrap executor options');
  return Object.freeze({
    runtimePath: normalizeAbsolutePath(input.runtimePath, 'runtimePath'),
    verifierPath: normalizeAbsolutePath(input.verifierPath, 'verifierPath'),
    verifierArguments: normalizeArguments(input.verifierArguments),
    timeoutMs: input.timeoutMs === undefined
      ? INSTALLABLE_AGENT_BOOTSTRAP_DEFAULT_TIMEOUT_MS
      : assertSafeInteger(input.timeoutMs, 'bootstrap timeoutMs', { min: 1, max: 300_000 }),
    maxStdoutBytes: input.maxStdoutBytes === undefined
      ? INSTALLABLE_AGENT_BOOTSTRAP_DEFAULT_MAX_STDOUT_BYTES
      : assertSafeInteger(input.maxStdoutBytes, 'bootstrap maxStdoutBytes', { min: 1, max: 16 * 1024 * 1024 }),
    maxStderrBytes: input.maxStderrBytes === undefined
      ? INSTALLABLE_AGENT_BOOTSTRAP_DEFAULT_MAX_STDERR_BYTES
      : assertSafeInteger(input.maxStderrBytes, 'bootstrap maxStderrBytes', { min: 1, max: 16 * 1024 * 1024 }),
    capsuleDigestSource: input.capsuleDigestSource,
  });
}

async function openStableRegularFile(filePath, label) {
  const noFollow = fsConstants.O_NOFOLLOW;
  if (!Number.isInteger(noFollow)) fail('bootstrap_executor_unsupported', 'The executor requires O_NOFOLLOW support');
  let handle;
  try {
    handle = await open(filePath, fsConstants.O_RDONLY | noFollow);
    const fileStat = await handle.stat();
    if (!fileStat.isFile()) fail('bootstrap_executor_input_not_regular', label + ' is not a regular file');
    const bytes = await handle.readFile();
    if (bytes.byteLength !== fileStat.size) fail('bootstrap_executor_input_changed', label + ' changed while it was read');
    return { handle, bytes };
  } catch (cause) {
    if (handle) await handle.close().catch(() => {});
    if (cause instanceof ContractError) throw cause;
    fail('bootstrap_executor_input_unreadable', label + ' could not be opened through a stable handle', {}, { cause });
  }
}

async function stageImmutableFile(root, name, bytes, mode) {
  const target = path.join(root, name);
  let handle;
  try {
    handle = await open(target, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL, mode);
    await handle.writeFile(bytes);
    await handle.sync();
    const fileStat = await handle.stat();
    if (!fileStat.isFile() || fileStat.size !== bytes.byteLength) {
      fail('bootstrap_executor_stage_mismatch', 'Immutable staging for ' + name + ' is not the admitted regular file');
    }
  } catch (cause) {
    if (cause instanceof ContractError) throw cause;
    fail('bootstrap_executor_stage_failed', 'Immutable staging for ' + name + ' failed', {}, { cause });
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
  await chmod(target, mode);
  return target;
}

async function createPrivateExecutionRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tdev-bootstrap-executor-'));
  try {
    await chmod(root, 0o700);
    const entries = await readdir(root);
    if (entries.length !== 0) fail('bootstrap_executor_cwd_not_empty', 'Fresh executor root is not empty');
    const cwd = path.join(root, 'cwd');
    await mkdir(cwd, { mode: 0o700 });
    const cwdEntries = await readdir(cwd);
    if (cwdEntries.length !== 0) fail('bootstrap_executor_cwd_not_empty', 'Private executor cwd is not empty');
    return { root, cwd };
  } catch (cause) {
    await rm(root, { recursive: true, force: true }).catch(() => {});
    if (cause instanceof ContractError) throw cause;
    fail('bootstrap_executor_cwd_failed', 'Private executor cwd could not be created', {}, { cause });
  }
}

function killProcessGroup(child) {
  if (!Number.isSafeInteger(child?.pid) || child.pid < 1) return false;
  try {
    process.kill(-child.pid, 'SIGKILL');
    return true;
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {}
    return false;
  }
}

function runStagedVerifier({ runtimeFd, verifierFd, verifierPath, cwd, args, timeoutMs, maxStdoutBytes, maxStderrBytes }) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn('/proc/self/fd/4', [verifierPath, ...args], {
        cwd,
        env: Object.create(null),
        shell: false,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe', verifierFd, runtimeFd],
      });
    } catch (cause) {
      reject(new ContractError('bootstrap_executor_spawn_failed', 'Bootstrap runtime could not be started', {}, { cause }));
      return;
    }
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let terminalReason = null;
    let settled = false;
    const stop = (reason) => {
      if (terminalReason === null) terminalReason = reason;
      killProcessGroup(child);
    };
    const timer = setTimeout(() => stop('timeout'), timeoutMs);
    const settle = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
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
      else stderr.push(Buffer.from(chunk));
    });
    child.once('error', (cause) => settle(() => reject(new ContractError('bootstrap_executor_spawn_failed', 'Bootstrap runtime failed to start', {}, { cause }))));
    child.once('exit', () => { killProcessGroup(child); });
    child.once('close', (code, signal) => settle(() => {
      const result = {
        code,
        signal,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
        stdoutBytes,
        stderrBytes,
      };
      if (terminalReason === 'timeout') {
        reject(new ContractError('bootstrap_executor_timeout', 'Bootstrap verifier exceeded its bounded timeout', result));
      } else if (terminalReason === 'stdout_limit' || terminalReason === 'stderr_limit') {
        reject(new ContractError('bootstrap_executor_output_limit', 'Bootstrap verifier exceeded its bounded output limit', {
          ...result,
          stream: terminalReason === 'stdout_limit' ? 'stdout' : 'stderr',
        }));
      } else {
        resolve(result);
      }
    }));
  });
}

export async function executeBootstrapVerifier({
  capsule,
  expectedCapsuleSha256,
  runtimePath,
  verifierPath,
  verifierArguments,
  timeoutMs,
  maxStdoutBytes,
  maxStderrBytes,
  capsuleDigestSource,
}) {
  const options = normalizeExecutorOptions({
    runtimePath,
    verifierPath,
    verifierArguments,
    timeoutMs,
    maxStdoutBytes,
    maxStderrBytes,
    capsuleDigestSource,
  });
  if (options.capsuleDigestSource !== INSTALLABLE_AGENT_BOOTSTRAP_OPERATOR_DIGEST_SOURCE) {
    fail('bootstrap_operator_digest_unverified', 'Terminal bootstrap execution requires an independently authenticated operator-channel capsule digest');
  }
  if (process.platform !== INSTALLABLE_AGENT_BOOTSTRAP_RUNTIME_PLATFORM || process.arch !== INSTALLABLE_AGENT_BOOTSTRAP_RUNTIME_ARCHITECTURE) {
    fail('bootstrap_executor_platform_mismatch', 'Bootstrap executor platform and architecture do not match the capsule target');
  }
  const normalized = normalizeBootstrapTrustCapsule(capsule);
  const runtimeInput = await openStableRegularFile(options.runtimePath, 'bootstrap runtime');
  const verifierInput = await openStableRegularFile(options.verifierPath, 'bootstrap verifier');
  let executionRoot;
  try {
    const runtimeDigest = await rawSha256Hex(runtimeInput.bytes, 'bootstrap runtime');
    const verifierDigest = await rawSha256Hex(verifierInput.bytes, 'bootstrap verifier');
    if (runtimeDigest !== normalized.execution.runtimeSha256) fail('bootstrap_runtime_mismatch', 'Runtime bytes do not match the capsule');
    if (verifierDigest !== normalized.execution.verifierSha256) fail('bootstrap_verifier_mismatch', 'Verifier bytes do not match the capsule');
    const builtinClosure = inspectBootstrapVerifierBuiltinClosure(verifierInput.bytes, normalized.execution.allowedBuiltinModules);
    if (canonicalJson(builtinClosure) !== canonicalJson(normalized.execution.allowedBuiltinModules)) {
      fail('bootstrap_builtin_closure_mismatch', 'Verifier imports do not match the capsule builtin closure');
    }
    executionRoot = await createPrivateExecutionRoot();
    const stagedVerifierPath = await stageImmutableFile(executionRoot.root, 'verifier.mjs', verifierInput.bytes, 0o400);
    const executionObservation = {
      ...normalized.execution,
      runtimePlatform: INSTALLABLE_AGENT_BOOTSTRAP_RUNTIME_PLATFORM,
      runtimeArchitecture: INSTALLABLE_AGENT_BOOTSTRAP_RUNTIME_ARCHITECTURE,
      networkAllowed: false,
      environmentInheritance: false,
      workingDirectoryProfile: INSTALLABLE_AGENT_BOOTSTRAP_WORKING_DIRECTORY_PROFILE,
    };
    await verifyBootstrapExecutionClosure({
      capsule: normalized,
      expectedCapsuleSha256,
      runtimeBytes: runtimeInput.bytes,
      verifierBytes: verifierInput.bytes,
      executedRuntimeBytes: runtimeInput.bytes,
      executedVerifierBytes: verifierInput.bytes,
      executionObservation,
    });
    const processResult = await runStagedVerifier({
      runtimeFd: runtimeInput.handle.fd,
      verifierFd: verifierInput.handle.fd,
      verifierPath: stagedVerifierPath,
      cwd: executionRoot.cwd,
      args: options.verifierArguments,
      timeoutMs: options.timeoutMs,
      maxStdoutBytes: options.maxStdoutBytes,
      maxStderrBytes: options.maxStderrBytes,
    });
    return Object.freeze(canonicalClone({
      profile: INSTALLABLE_AGENT_BOOTSTRAP_EXECUTOR_PROFILE,
      capsuleSha256: await bootstrapTrustCapsuleSha256(normalized),
      execution: normalized.execution,
      runtimeSha256: runtimeDigest,
      verifierSha256: verifierDigest,
      environment: { inherited: false, variableCount: 0 },
      workingDirectory: { profile: INSTALLABLE_AGENT_BOOTSTRAP_WORKING_DIRECTORY_PROFILE, empty: true },
      process: {
        code: processResult.code,
        signal: processResult.signal,
        stdout: processResult.stdout.toString('utf8'),
        stderr: processResult.stderr.toString('utf8'),
        stdoutBytes: processResult.stdoutBytes,
        stderrBytes: processResult.stderrBytes,
      },
    }));
  } finally {
    await verifierInput.handle.close().catch(() => {});
    await runtimeInput.handle.close().catch(() => {});
    if (executionRoot) {
      await rm(executionRoot.root, { recursive: true, force: true }).catch((cause) => {
        throw new ContractError('bootstrap_executor_cleanup_ambiguous', 'Bootstrap executor private staging cleanup is ambiguous', {}, { cause });
      });
      try {
        await stat(executionRoot.root);
        fail('bootstrap_executor_cleanup_ambiguous', 'Bootstrap executor private staging still exists after cleanup');
      } catch (cause) {
        if (cause instanceof ContractError) throw cause;
        if (cause?.code !== 'ENOENT') {
          throw new ContractError('bootstrap_executor_cleanup_ambiguous', 'Bootstrap executor private staging could not be reconciled', {}, { cause });
        }
      }
    }
  }
}
