#!/usr/bin/env node
import { spawn } from 'node:child_process';
import {
  assertDigest,
  assertIdentifier,
  assertRecordShape,
  assertSafeInteger,
  canonicalJson,
  strictJsonParse,
  typedDigest,
} from './canonical.mjs';

const MAX_GO_BYTES = 1024 * 1024;
let goAccepted = false;
let buffered = '';
let child = null;

function emit(value, callback = undefined) {
  process.stdout.write(`${canonicalJson(value)}\n`, callback);
}

function killOwnedGroup() {
  try {
    process.kill(-process.pid, 'SIGKILL');
  } catch {
    process.exit(137);
  }
}

function fail(code, message) {
  emit({ type: 'warden_error', code, message }, () => killOwnedGroup());
}

function boundedCollector(maxBytes) {
  let size = 0;
  let overflow = false;
  const chunks = [];
  return {
    push(chunk) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = maxBytes - size;
      if (remaining > 0) {
        const kept = bytes.subarray(0, remaining);
        chunks.push(kept);
        size += kept.byteLength;
      }
      if (bytes.byteLength > remaining) overflow = true;
    },
    result() {
      return { text: Buffer.concat(chunks).toString('utf8'), overflow };
    },
  };
}

function validateGo(frame) {
  assertRecordShape(frame, ['type', 'operationId', 'operationGeneration', 'launchDigest', 'goAllowedDigest', 'goToken', 'launch'], [], 'warden GO frame');
  if (frame.type !== 'GO') throw Object.assign(new Error('unsupported warden frame'), { code: 'warden_invalid_go' });
  assertDigest(frame.operationId, 'operationId');
  assertSafeInteger(frame.operationGeneration, 'operationGeneration', { min: 1 });
  assertDigest(frame.launchDigest, 'launchDigest');
  assertDigest(frame.goAllowedDigest, 'goAllowedDigest');
  assertDigest(frame.goToken, 'goToken');
  const expectedToken = typedDigest('tdev.installable-agent-warden-go.v1', {
    operationId: frame.operationId,
    operationGeneration: frame.operationGeneration,
    launchDigest: frame.launchDigest,
    goAllowedDigest: frame.goAllowedDigest,
  });
  if (frame.goToken !== expectedToken) throw Object.assign(new Error('GO token digest mismatch'), { code: 'warden_go_token_mismatch' });
  assertRecordShape(frame.launch, ['command', 'args', 'cwd', 'env', 'stdinBase64', 'maxOutputBytes'], [], 'warden launch');
  if (typeof frame.launch.command !== 'string' || frame.launch.command.length === 0 || frame.launch.command.includes('\0') || Buffer.byteLength(frame.launch.command) > 4096) throw Object.assign(new Error('launch command invalid'), { code: 'warden_invalid_launch' });
  if (!Array.isArray(frame.launch.args) || frame.launch.args.some((arg) => typeof arg !== 'string')) throw Object.assign(new Error('launch args invalid'), { code: 'warden_invalid_launch' });
  if (frame.launch.cwd !== null && (typeof frame.launch.cwd !== 'string' || frame.launch.cwd.length === 0)) throw Object.assign(new Error('launch cwd invalid'), { code: 'warden_invalid_launch' });
  if (frame.launch.env === null || typeof frame.launch.env !== 'object' || Array.isArray(frame.launch.env)) throw Object.assign(new Error('launch env invalid'), { code: 'warden_invalid_launch' });
  if (typeof frame.launch.stdinBase64 !== 'string') throw Object.assign(new Error('launch stdin invalid'), { code: 'warden_invalid_launch' });
  assertSafeInteger(frame.launch.maxOutputBytes, 'launch.maxOutputBytes', { min: 1, max: 64 * 1024 * 1024 });
  return frame;
}

async function run(frame) {
  const launch = frame.launch;
  const stdout = boundedCollector(launch.maxOutputBytes);
  const stderr = boundedCollector(launch.maxOutputBytes);
  let stdin;
  try {
    stdin = Buffer.from(launch.stdinBase64, 'base64');
  } catch {
    throw Object.assign(new Error('launch stdin is invalid base64'), { code: 'warden_invalid_launch' });
  }
  child = spawn(launch.command, launch.args, {
    cwd: launch.cwd ?? undefined,
    env: launch.env,
    detached: false,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (!child || !Number.isSafeInteger(child.pid) || child.pid <= 0 || !child.stdin || !child.stdout || !child.stderr) {
    throw Object.assign(new Error('tool process handle is incomplete'), { code: 'warden_tool_spawn_ambiguous' });
  }
  child.stdout.on('data', (chunk) => stdout.push(chunk));
  child.stderr.on('data', (chunk) => stderr.push(chunk));
  child.stdin.end(stdin);
  emit({
    type: 'tool_started',
    operationId: frame.operationId,
    operationGeneration: frame.operationGeneration,
    childPid: child.pid,
  });
  const exit = await new Promise((resolve, reject) => {
    child.once('error', (cause) => reject(Object.assign(new Error('tool process error'), { code: cause?.code ?? 'warden_tool_error', cause })));
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  const out = stdout.result();
  const err = stderr.result();
  emit({
    type: 'tool_completed',
    operationId: frame.operationId,
    operationGeneration: frame.operationGeneration,
    exit: { code: exit.code, signal: exit.signal, stdout: out.text, stderr: err.text, stdoutOverflow: out.overflow, stderrOverflow: err.overflow },
  }, () => killOwnedGroup());
}

function acceptLine(line) {
  if (goAccepted) return fail('warden_duplicate_go', 'warden accepts exactly one GO frame');
  if (Buffer.byteLength(line) > MAX_GO_BYTES) return fail('warden_go_too_large', 'GO frame exceeds package bound');
  let frame;
  try {
    frame = validateGo(strictJsonParse(line, { maxBytes: MAX_GO_BYTES }));
  } catch (cause) {
    return fail(cause?.code ?? 'warden_invalid_go', cause?.message ?? 'invalid GO frame');
  }
  goAccepted = true;
  void run(frame).catch((cause) => fail(cause?.code ?? 'warden_execution_failed', cause?.message ?? 'warden execution failed'));
}

process.on('SIGTERM', killOwnedGroup);
process.on('SIGINT', killOwnedGroup);
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffered += chunk;
  if (Buffer.byteLength(buffered) > MAX_GO_BYTES) return fail('warden_go_too_large', 'GO frame exceeds package bound');
  const newline = buffered.indexOf('\n');
  if (newline === -1) return;
  const line = buffered.slice(0, newline);
  buffered = buffered.slice(newline + 1);
  if (buffered.trim().length !== 0) return fail('warden_duplicate_go', 'warden accepts exactly one GO frame');
  acceptLine(line);
});
process.stdin.on('end', () => {
  if (!goAccepted) process.exit(0);
});
