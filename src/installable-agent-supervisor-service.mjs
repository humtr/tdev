#!/usr/bin/env node
import { createServer, createConnection } from 'node:net';
import { chmod, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, strictJsonParse, typedDigest } from './canonical.mjs';
import { createInstallableAgentSupervisor } from './installable-agent-supervisor.mjs';

export const INSTALLABLE_AGENT_SUPERVISOR_SERVICE_PROTOCOL = 'tdev.installable-agent-supervisor-service.v1';
const MAX_FRAME_BYTES = 32 * 1024 * 1024;
const DEFAULT_POLL_INTERVAL_MS = 25;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function plainRecord(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('invalid_installable_agent_supervisor_service_request', `${label} must be an object`);
  return value;
}

function boundedText(value, label) {
  if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value) > 4096 || value.includes('\0')) {
    fail('invalid_installable_agent_supervisor_service_request', `${label} is invalid`);
  }
  return value;
}

function startRequestDigest(envelope, launch) {
  return typedDigest('tdev.installable-agent-supervisor-service-start.v1', { envelope, launch });
}

function normalizeLaunchWire(input) {
  plainRecord(input, 'launch');
  const keys = Object.keys(input).sort();
  const expected = ['args', 'command', 'cwd', 'env', 'stdinBase64'];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    fail('invalid_installable_agent_supervisor_service_request', 'launch has an unexpected shape');
  }
  boundedText(input.command, 'launch.command');
  if (!Array.isArray(input.args) || input.args.some((arg) => typeof arg !== 'string' || Buffer.byteLength(arg) > 64 * 1024)) {
    fail('invalid_installable_agent_supervisor_service_request', 'launch.args is invalid');
  }
  if (input.cwd !== null && (typeof input.cwd !== 'string' || input.cwd.length === 0 || input.cwd.includes('\0'))) {
    fail('invalid_installable_agent_supervisor_service_request', 'launch.cwd is invalid');
  }
  plainRecord(input.env, 'launch.env');
  for (const [key, value] of Object.entries(input.env)) {
    if (typeof key !== 'string' || key.length === 0 || key.includes('\0') || typeof value !== 'string' || value.includes('\0')) {
      fail('invalid_installable_agent_supervisor_service_request', 'launch.env is invalid');
    }
  }
  if (typeof input.stdinBase64 !== 'string') fail('invalid_installable_agent_supervisor_service_request', 'launch.stdinBase64 is invalid');
  const stdin = Buffer.from(input.stdinBase64, 'base64');
  if (stdin.toString('base64') !== input.stdinBase64) fail('invalid_installable_agent_supervisor_service_request', 'launch.stdinBase64 is not canonical base64');
  return Object.freeze({
    wire: Object.freeze({
      command: input.command,
      args: [...input.args],
      cwd: input.cwd,
      env: { ...input.env },
      stdinBase64: input.stdinBase64,
    }),
    launch: Object.freeze({
      command: input.command,
      args: [...input.args],
      cwd: input.cwd,
      env: { ...input.env },
      stdin,
    }),
  });
}

function toLaunchWire(input) {
  plainRecord(input, 'launch');
  const stdin = input.stdin === undefined || input.stdin === null
    ? Buffer.alloc(0)
    : Buffer.isBuffer(input.stdin)
      ? Buffer.from(input.stdin)
      : Buffer.from(typeof input.stdin === 'string' ? input.stdin : canonicalJson(input.stdin));
  return normalizeLaunchWire({
    command: input.command,
    args: input.args ?? [],
    cwd: input.cwd ?? null,
    env: input.env ?? {},
    stdinBase64: stdin.toString('base64'),
  }).wire;
}

function serviceSocketPath(stateDirectory) {
  const socketPath = path.join(path.resolve(stateDirectory), 'supervisor.sock');
  if (Buffer.byteLength(socketPath) > 100) fail('installable_agent_supervisor_socket_path_too_long', 'Supervisor socket path exceeds the supported Unix-domain bound');
  return socketPath;
}

function sanitizeExit(exit) {
  if (exit === null || typeof exit !== 'object' || Array.isArray(exit)) fail('installable_agent_supervisor_service_corrupt', 'Supervisor completion is malformed');
  return {
    code: exit.code ?? null,
    signal: exit.signal ?? null,
    stdout: typeof exit.stdout === 'string' ? exit.stdout : '',
    stderr: typeof exit.stderr === 'string' ? exit.stderr : '',
    stdoutOverflow: exit.stdoutOverflow === true,
    stderrOverflow: exit.stderrOverflow === true,
  };
}

export function createInstallableAgentSupervisorServiceHandler({ supervisor }) {
  if (!supervisor || typeof supervisor.status !== 'function' || typeof supervisor.start !== 'function') {
    fail('invalid_installable_agent_supervisor_service', 'Supervisor service requires an initialized supervisor');
  }
  const starts = new Map();
  const operations = new Map();
  const drains = new Map();

  return async function handle(input) {
    plainRecord(input, 'request');
    boundedText(input.requestId, 'requestId');
    boundedText(input.operation, 'operation');

    if (input.operation === 'status') {
      return { protocol: INSTALLABLE_AGENT_SUPERVISOR_SERVICE_PROTOCOL, classification: 'ok', supervisor: supervisor.status() };
    }

    if (input.operation === 'drain') {
      const existingDrain = drains.get(input.requestId);
      if (existingDrain !== undefined) {
        const replay = await existingDrain;
        return { ...replay, classification: 'exact_replay' };
      }
      const drain = (async () => {
        const before = supervisor.status();
        if (!Array.isArray(before.heldPredecessors) || before.heldPredecessors.length !== 0) {
          fail('installable_agent_supervisor_drain_held', 'Supervisor has a nonterminal predecessor without a current destructive handle');
        }
        for (const record of operations.values()) {
          if (record.cleanup?.cleanupComplete === true) continue;
          if (record.phase === 'running') await record.operation.cancel();
          record.cleanup = await record.operation.cleanup();
          if (record.cleanup?.cleanupComplete !== true) {
            fail('installable_agent_supervisor_drain_incomplete', 'Supervisor could not positively prove cleanup of a current live operation');
          }
        }
        const after = supervisor.status();
        if (after.liveOperations !== 0 || !Array.isArray(after.heldPredecessors) || after.heldPredecessors.length !== 0) {
          fail('installable_agent_supervisor_drain_incomplete', 'Supervisor is not positively quiescent after drain');
        }
        return {
          protocol: INSTALLABLE_AGENT_SUPERVISOR_SERVICE_PROTOCOL,
          classification: 'quiesced',
          supervisor: after,
        };
      })();
      drains.set(input.requestId, drain);
      try { return await drain; }
      catch (cause) { drains.delete(input.requestId); throw cause; }
    }

    if (input.operation === 'start') {
      plainRecord(input.envelope, 'envelope');
      const normalizedLaunch = normalizeLaunchWire(input.launch);
      const requestDigest = startRequestDigest(input.envelope, normalizedLaunch.wire);
      const existing = starts.get(input.requestId);
      if (existing) {
        if (existing.requestDigest !== requestDigest) fail('installable_agent_supervisor_service_request_conflict', 'Stable start request changed intent');
        return { protocol: INSTALLABLE_AGENT_SUPERVISOR_SERVICE_PROTOCOL, classification: 'exact_replay', operation: existing.descriptor };
      }
      const operation = await supervisor.start({ envelope: input.envelope, launch: normalizedLaunch.launch });
      const descriptor = {
        operationId: operation.operationId,
        operationGeneration: operation.operationGeneration,
        supervisorGeneration: operation.supervisorGeneration,
      };
      const record = { descriptor, requestDigest, operation, phase: 'running', exit: null, cleanup: null };
      starts.set(input.requestId, record);
      operations.set(operation.operationId, record);
      void Promise.resolve(operation.completion).then(
        (exit) => { record.phase = 'completed'; record.exit = sanitizeExit(exit); },
        (cause) => { record.phase = 'failed'; record.exit = { error: cause?.code ?? 'installable_agent_operation_failed', message: cause?.message ?? 'operation failed' }; },
      );
      return { protocol: INSTALLABLE_AGENT_SUPERVISOR_SERVICE_PROTOCOL, classification: 'accepted', operation: descriptor };
    }

    const operationId = boundedText(input.operationId, 'operationId');
    const record = operations.get(operationId);
    if (!record) fail('installable_agent_supervisor_operation_unknown', 'Operation is not owned by the current supervisor service generation');

    if (input.operation === 'operation_status') {
      return {
        protocol: INSTALLABLE_AGENT_SUPERVISOR_SERVICE_PROTOCOL,
        classification: 'ok',
        operation: record.descriptor,
        phase: record.phase,
        exit: record.exit,
        cleanup: record.cleanup,
      };
    }
    if (input.operation === 'cancel') {
      const result = await record.operation.cancel();
      return { protocol: INSTALLABLE_AGENT_SUPERVISOR_SERVICE_PROTOCOL, classification: 'accepted', operation: record.descriptor, result };
    }
    if (input.operation === 'cleanup') {
      record.cleanup = await record.operation.cleanup();
      return { protocol: INSTALLABLE_AGENT_SUPERVISOR_SERVICE_PROTOCOL, classification: 'accepted', operation: record.descriptor, result: record.cleanup };
    }
    fail('invalid_installable_agent_supervisor_service_request', `Unsupported supervisor service operation: ${input.operation}`);
  };
}

function encodeResponse(requestId, body) {
  return `${canonicalJson({ requestId, ...body })}\n`;
}

function encodeError(requestId, cause) {
  return `${canonicalJson({
    requestId,
    protocol: INSTALLABLE_AGENT_SUPERVISOR_SERVICE_PROTOCOL,
    error: cause?.code ?? 'installable_agent_supervisor_service_failed',
    message: cause?.message ?? 'Supervisor service request failed',
  })}\n`;
}

export async function runInstallableAgentSupervisorService({
  stateDirectory,
  socketPath = undefined,
  supervisorFactory = undefined,
} = {}) {
  if (typeof stateDirectory !== 'string' || stateDirectory.length === 0) fail('invalid_installable_agent_supervisor_service', 'stateDirectory is required');
  const resolvedStateDirectory = path.resolve(stateDirectory);
  await mkdir(resolvedStateDirectory, { recursive: true, mode: 0o700 });
  await chmod(resolvedStateDirectory, 0o700);
  const resolvedSocketPath = socketPath === undefined ? serviceSocketPath(resolvedStateDirectory) : path.resolve(socketPath);
  const factory = supervisorFactory ?? (async () => createInstallableAgentSupervisor({
    journalPath: path.join(resolvedStateDirectory, 'supervisor-journal.jsonl'),
    serviceReadyProbe: async () => process.env.TDEV_INSTALLABLE_AGENT_SERVICE === '1',
  }));
  const supervisor = await factory();
  if (!supervisor || typeof supervisor.status !== 'function' || supervisor.status().initialized !== true) {
    fail('installable_agent_supervisor_service_not_ready', 'Supervisor did not positively initialize');
  }
  const handle = createInstallableAgentSupervisorServiceHandler({ supervisor });
  await rm(resolvedSocketPath, { force: true });

  const server = createServer((socket) => {
    socket.setEncoding('utf8');
    let buffered = '';
    let handled = false;
    socket.on('data', (chunk) => {
      if (handled) return;
      buffered += chunk;
      if (Buffer.byteLength(buffered) > MAX_FRAME_BYTES) {
        handled = true;
        socket.end(encodeError(null, Object.assign(new Error('Supervisor service request exceeds package bound'), { code: 'installable_agent_supervisor_service_frame_too_large' })));
        return;
      }
      const newline = buffered.indexOf('\n');
      if (newline === -1) return;
      handled = true;
      const line = buffered.slice(0, newline);
      const trailing = buffered.slice(newline + 1);
      let request = null;
      void (async () => {
        try {
          if (trailing.trim().length !== 0) fail('invalid_installable_agent_supervisor_service_request', 'Exactly one request frame is allowed per connection');
          request = strictJsonParse(line, { maxBytes: MAX_FRAME_BYTES });
          const body = await handle(request);
          socket.end(encodeResponse(request.requestId, body));
        } catch (cause) {
          socket.end(encodeError(request?.requestId ?? null, cause));
        }
      })();
    });
  });

  await new Promise((resolve, reject) => {
    const onError = (cause) => { server.off('listening', onListening); reject(cause); };
    const onListening = () => { server.off('error', onError); resolve(); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(resolvedSocketPath);
  });
  await chmod(resolvedSocketPath, 0o600);
  return Object.freeze({
    socketPath: resolvedSocketPath,
    supervisor,
    async close() {
      await new Promise((resolve, reject) => server.close((cause) => cause ? reject(cause) : resolve()));
      await rm(resolvedSocketPath, { force: true });
    },
  });
}

export class InstallableAgentSupervisorServiceClient {
  constructor({ socketPath, pollIntervalMs = DEFAULT_POLL_INTERVAL_MS, requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS } = {}) {
    boundedText(socketPath, 'socketPath');
    if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1 || pollIntervalMs > 1000) fail('invalid_installable_agent_supervisor_service_client', 'pollIntervalMs is invalid');
    if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 100 || requestTimeoutMs > 120_000) fail('invalid_installable_agent_supervisor_service_client', 'requestTimeoutMs is invalid');
    this.socketPath = socketPath;
    this.pollIntervalMs = pollIntervalMs;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  async invoke(request) {
    plainRecord(request, 'request');
    boundedText(request.requestId, 'requestId');
    return new Promise((resolve, reject) => {
      const socket = createConnection(this.socketPath);
      socket.setEncoding('utf8');
      let buffered = '';
      let settled = false;
      const timer = setTimeout(() => {
        failOnce(Object.assign(new Error('Supervisor service request timed out'), { code: 'installable_agent_supervisor_service_timeout' }));
      }, this.requestTimeoutMs);
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        callback(value);
      };
      const failOnce = (cause) => finish(reject, cause);
      socket.once('error', failOnce);
      socket.once('connect', () => {
        try {
          socket.write(`${canonicalJson(request)}\n`);
        } catch (cause) {
          failOnce(cause);
        }
      });
      socket.once('end', () => {
        if (!settled) failOnce(Object.assign(new Error('Supervisor service ended before a complete response'), { code: 'installable_agent_supervisor_service_incomplete_response' }));
      });
      socket.once('close', () => {
        if (!settled) failOnce(Object.assign(new Error('Supervisor service closed before a complete response'), { code: 'installable_agent_supervisor_service_incomplete_response' }));
      });
      socket.on('data', (chunk) => {
        if (settled) return;
        buffered += chunk;
        if (Buffer.byteLength(buffered) > MAX_FRAME_BYTES) return failOnce(Object.assign(new Error('Supervisor service response exceeds package bound'), { code: 'installable_agent_supervisor_service_frame_too_large' }));
        const newline = buffered.indexOf('\n');
        if (newline === -1) return;
        try {
          if (buffered.slice(newline + 1).trim().length !== 0) fail('installable_agent_supervisor_service_response_mismatch', 'Supervisor service returned more than one response frame');
          const response = strictJsonParse(buffered.slice(0, newline), { maxBytes: MAX_FRAME_BYTES });
          if (response.requestId !== request.requestId) fail('installable_agent_supervisor_service_response_mismatch', 'Supervisor service response request identity mismatches');
          if (response.error) fail(response.error, response.message ?? 'Supervisor service request failed');
          if (response.protocol !== INSTALLABLE_AGENT_SUPERVISOR_SERVICE_PROTOCOL) fail('installable_agent_supervisor_service_protocol_mismatch', 'Supervisor service protocol mismatches');
          finish(resolve, response);
        } catch (cause) { failOnce(cause); }
      });
    });
  }

  status() {
    return this.invoke({ requestId: typedDigest('tdev.installable-agent-supervisor-service-status.v1', { protocol: INSTALLABLE_AGENT_SUPERVISOR_SERVICE_PROTOCOL }), operation: 'status' });
  }

  drain({ requestId } = {}) {
    boundedText(requestId, 'requestId');
    return this.invoke({ requestId, operation: 'drain' });
  }

  async start({ envelope, launch, requestId = undefined }) {
    const wireLaunch = toLaunchWire(launch);
    const stableRequestId = requestId ?? startRequestDigest(envelope, wireLaunch);
    const response = await this.invoke({ requestId: stableRequestId, operation: 'start', envelope, launch: wireLaunch });
    const descriptor = response.operation;
    const poll = async () => {
      for (;;) {
        const status = await this.invoke({
          requestId: typedDigest('tdev.installable-agent-supervisor-operation-status.v1', { operationId: descriptor.operationId, nonce: 'current' }),
          operation: 'operation_status',
          operationId: descriptor.operationId,
        });
        if (status.phase === 'completed') return status.exit;
        if (status.phase === 'failed') fail(status.exit?.error ?? 'installable_agent_operation_failed', status.exit?.message ?? 'Supervisor operation failed');
        await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
      }
    };
    return Object.freeze({
      ...descriptor,
      completion: poll(),
      cancel: async () => (await this.invoke({
        requestId: typedDigest('tdev.installable-agent-supervisor-cancel.v1', { operationId: descriptor.operationId }),
        operation: 'cancel', operationId: descriptor.operationId,
      })).result,
      cleanup: async () => (await this.invoke({
        requestId: typedDigest('tdev.installable-agent-supervisor-cleanup.v1', { operationId: descriptor.operationId }),
        operation: 'cleanup', operationId: descriptor.operationId,
      })).result,
    });
  }
}

export function createInstallableAgentSupervisorServiceExecutionAdapter({ client, resolveExecution } = {}) {
  if (!(client instanceof InstallableAgentSupervisorServiceClient) || typeof resolveExecution !== 'function') {
    fail('invalid_installable_agent_supervisor_service_adapter', 'Service execution adapter requires client and resolveExecution');
  }
  return Object.freeze({
    async start({ envelope, signalContext }) {
      const launch = await resolveExecution(envelope.executableBody, Object.freeze({ envelope, signalContext }));
      plainRecord(launch, 'resolved launch');
      const operation = await client.start({ envelope, launch: {
        command: launch.command,
        args: launch.args ?? [],
        cwd: launch.cwd ?? null,
        env: launch.env ?? {},
        stdin: launch.stdin ?? null,
      } });
      const completion = operation.completion.then(async (exit) => {
        const effect = typeof launch.effectFromExit === 'function' ? await launch.effectFromExit(exit) : undefined;
        const resultEnvelope = typeof launch.resultEnvelopeFactory === 'function' ? await launch.resultEnvelopeFactory(exit) : undefined;
        return Object.freeze({ ...exit, effect: effect === 'applied' || effect === 'not_applied' ? effect : undefined, resultEnvelope });
      });
      return Object.freeze({ ...operation, completion });
    },
  });
}

function parseServiceArgs(argv) {
  let stateDirectory = null;
  let socketPath = undefined;
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (value === undefined || !['--state-directory', '--socket-path'].includes(flag)) {
      fail('installable_agent_supervisor_service_usage', 'usage: installable-agent-supervisor-service --state-directory <path> [--socket-path <path>]');
    }
    if (flag === '--state-directory') {
      if (stateDirectory !== null) fail('installable_agent_supervisor_service_usage', 'duplicate --state-directory');
      stateDirectory = value;
    } else {
      if (socketPath !== undefined) fail('installable_agent_supervisor_service_usage', 'duplicate --socket-path');
      socketPath = value;
    }
  }
  if (stateDirectory === null) fail('installable_agent_supervisor_service_usage', '--state-directory is required');
  return { stateDirectory, socketPath };
}

const isDirect = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  try {
    const options = parseServiceArgs(process.argv.slice(2));
    await runInstallableAgentSupervisorService(options);
  } catch (cause) {
    process.stderr.write(`${canonicalJson({ error: cause?.code ?? 'installable_agent_supervisor_service_failed', message: cause?.message ?? 'Supervisor service failed' })}\n`);
    process.exitCode = 1;
  }
}
