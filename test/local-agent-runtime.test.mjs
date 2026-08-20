import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { digest } from '../src/index.mjs';
import {
  LOCAL_AGENT_AUTH_PROTOCOL_PREFIX,
  LOCAL_AGENT_WEBSOCKET_PROTOCOL,
  LocalAgentRuntime,
  LocalAgentWebSocketTransport,
  createNodeProcessExecutionAdapter,
} from '../src/local-agent-runtime.mjs';

function expectCode(fn, code) {
  assert.throws(fn, (error) => error?.code === code);
}

async function expectCodeAsync(fn, code) {
  await assert.rejects(fn, (error) => error?.code === code);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function dispatch(overrides = {}) {
  return {
    type: 'dispatch',
    deliveryId: digest({ delivery: 'one' }),
    dispatchOrdinal: 1,
    authorizationId: digest({ authorization: 'one' }),
    dispatchGrantId: digest({ grant: 'one' }),
    caseId: 'case-one',
    taskId: 'task-one',
    attemptId: 'task-one.1',
    executorId: 'executor-one',
    executorEpoch: 1,
    fencingToken: digest({ fence: 'one' }),
    protocolVersion: 'agent-v1',
    executableBody: { kind: 'test', value: 1 },
    ...overrides,
  };
}

function runtime({ adapter, maxTrackedDeliveries = 1024 } = {}) {
  const emitted = [];
  const executionAdapter = adapter ?? {
    async start() {
      const completion = deferred();
      return {
        completion: completion.promise,
        async cancel() {},
        async cleanup() { return { cleanupComplete: true }; },
        completionGate: completion,
      };
    },
  };
  const agent = new LocalAgentRuntime({
    agentId: 'agent-one',
    routeGeneration: 1,
    executor: { id: 'executor-one', epoch: 1 },
    emit: async (frame) => emitted.push(structuredClone(frame)),
    executionAdapter,
    maxTrackedDeliveries,
  });
  agent.bindConnection({ id: 'connection-one', epoch: 1 });
  return { agent, emitted, executionAdapter };
}

function controlledAdapter() {
  const gates = [];
  let starts = 0;
  return {
    get starts() { return starts; },
    gates,
    async start() {
      starts += 1;
      const gate = deferred();
      gates.push(gate);
      return {
        completion: gate.promise,
        async cancel() { gate.resolve({ effect: 'not_applied' }); },
        async cleanup() { return { cleanupComplete: true }; },
      };
    },
  };
}

function evidenceRevisions(emitted) {
  return emitted
    .filter((frame) => frame.type === 'evidence')
    .map((frame) => frame.payload.localEvidenceRevision);
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    throw error;
  }
}

async function waitForFile(path, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      if (Date.now() >= deadline) throw new Error(`timed out waiting for ${path}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

test('capacity revision survives reconnect and resets only for a replacement executor', async () => {
  const { agent, emitted } = runtime({ adapter: { async start() { throw new Error('unused'); } } });
  assert.deepEqual(await agent.reportCapacity(4), { capacityRevision: 1, reportedCapacity: 4 });
  agent.bindConnection({ id: 'connection-two', epoch: 2 });
  assert.deepEqual(await agent.reportCapacity(2), { capacityRevision: 2, reportedCapacity: 2 });
  assert.equal(emitted.filter((frame) => frame.type === 'capacity').length, 2);

  agent.replaceExecutor({ id: 'executor-two', epoch: 2 });
  assert.equal(agent.identity().capacityRevision, 0);
  assert.equal(agent.identity().connectionId, null);
  agent.bindConnection({ id: 'connection-three', epoch: 3 });
  assert.deepEqual(await agent.reportCapacity(1), { capacityRevision: 1, reportedCapacity: 1 });
  await expectCodeAsync(() => agent.handleDispatch(dispatch()), 'stale_local_executor');
});

test('exact dispatch replay never starts a second local operation and conflicting replay fails closed', async () => {
  const adapter = controlledAdapter();
  const { agent, emitted } = runtime({ adapter });
  const envelope = dispatch();
  const first = await agent.handleDispatch(envelope);
  assert.equal(first.classification, 'started');
  assert.equal(adapter.starts, 1);

  const replay = await agent.handleDispatch(structuredClone(envelope));
  assert.equal(replay.classification, 'exact_replay');
  assert.equal(replay.executed, false);
  assert.equal(adapter.starts, 1);
  await expectCodeAsync(
    () => agent.handleDispatch({ ...envelope, executableBody: { kind: 'test', value: 2 } }),
    'local_dispatch_conflict',
  );
  assert.equal(adapter.starts, 1);

  adapter.gates[0].resolve({ effect: 'applied', resultEnvelope: { value: 'ok' } });
  await first.completion;
  assert.deepEqual(evidenceRevisions(emitted), [1, 2, 3, 4]);
  assert.equal(emitted.find((frame) => frame.type === 'result')?.payload.resultEnvelope.value, 'ok');
});

test('positive not-started/no-handle permits the next ordinal but a started predecessor never does', async () => {
  let starts = 0;
  const failingAdapter = {
    async start() {
      starts += 1;
      throw Object.assign(new Error('did not start'), { code: 'fixture_start_failed' });
    },
  };
  const { agent, emitted } = runtime({ adapter: failingAdapter });
  const firstEnvelope = dispatch();
  const first = await agent.handleDispatch(firstEnvelope);
  assert.equal(first.classification, 'not_started');
  assert.equal(first.noHandle, true);
  const secondEnvelope = {
    ...firstEnvelope,
    dispatchOrdinal: 2,
    authorizationId: digest({ authorization: 'two' }),
    dispatchGrantId: digest({ grant: 'two' }),
  };
  const second = await agent.handleDispatch(secondEnvelope);
  assert.equal(second.classification, 'not_started');
  assert.equal(starts, 2);
  assert.deepEqual(evidenceRevisions(emitted), [1, 2, 3, 4]);

  const startedAdapter = controlledAdapter();
  const started = runtime({ adapter: startedAdapter });
  const live = await started.agent.handleDispatch(firstEnvelope);
  startedAdapter.gates[0].resolve({ effect: 'not_applied' });
  await live.completion;
  await expectCodeAsync(() => started.agent.handleDispatch(secondEnvelope), 'local_dispatch_replay_unsafe');
  assert.equal(startedAdapter.starts, 1);
});

test('local evidence revision is monotonic across a network reconnect on the same executor', async () => {
  const adapter = controlledAdapter();
  const { agent, emitted } = runtime({ adapter });
  const first = await agent.handleDispatch(dispatch());
  agent.bindConnection({ id: 'connection-two', epoch: 2 });
  adapter.gates[0].resolve({ effect: 'applied' });
  await first.completion;
  assert.deepEqual(evidenceRevisions(emitted), [1, 2, 3, 4]);
  assert.equal(agent.identity().connectionEpoch, 2);
});

test('one semantic Attempt cannot allocate a second delivery owner or poison the bounded tracking table', async () => {
  const adapter = controlledAdapter();
  const { agent } = runtime({ adapter, maxTrackedDeliveries: 2 });
  const first = await agent.handleDispatch(dispatch());
  adapter.gates[0].resolve({ effect: 'not_applied' });
  await first.completion;

  await expectCodeAsync(
    () => agent.handleDispatch(dispatch({ deliveryId: digest({ delivery: 'conflict' }) })),
    'local_attempt_conflict',
  );

  const other = dispatch({
    deliveryId: digest({ delivery: 'other' }),
    authorizationId: digest({ authorization: 'other' }),
    dispatchGrantId: digest({ grant: 'other' }),
    caseId: 'case-two',
    taskId: 'task-two',
    attemptId: 'task-two.1',
    fencingToken: digest({ fence: 'other' }),
  });
  const admitted = await agent.handleDispatch(other);
  assert.equal(admitted.classification, 'started');
  adapter.gates[1].resolve({ effect: 'not_applied' });
  await admitted.completion;
});

test('unknown cancellation and fresh runtime restart never invent historical no-handle evidence', async () => {
  const { agent } = runtime({ adapter: { async start() { throw new Error('unused'); } } });
  const unknown = await agent.handleControl({
    type: 'control',
    action: 'cancel',
    deliveryId: digest({ delivery: 'unknown' }),
    dispatchOrdinal: 1,
  });
  assert.deepEqual(unknown, { classification: 'unknown', cancelled: false, noHandleProved: false });
  const snapshot = agent.snapshotVolatileState();
  assert.equal(snapshot.semanticRetryQueueLength, 0);
  assert.equal(snapshot.durableLocalJournal, false);
  assert.equal(snapshot.trackedDeliveries, 0);

  const restarted = runtime({ adapter: { async start() { throw new Error('unused'); } } }).agent;
  const afterRestart = await restarted.handleControl({
    type: 'control',
    action: 'cancel',
    deliveryId: digest({ delivery: 'old' }),
    dispatchOrdinal: 1,
  });
  assert.equal(afterRestart.noHandleProved, false);
  assert.equal(restarted.snapshotVolatileState().semanticRetryQueueLength, 0);
});

test('executor replacement is fenced while a local handle is held and stale executor dispatch stays rejected', async () => {
  const adapter = controlledAdapter();
  const { agent } = runtime({ adapter });
  const live = await agent.handleDispatch(dispatch());
  expectCode(() => agent.replaceExecutor({ id: 'executor-two', epoch: 2 }), 'local_executor_busy');
  adapter.gates[0].resolve({ effect: 'not_applied' });
  await live.completion;
  agent.replaceExecutor({ id: 'executor-two', epoch: 2 });
  agent.bindConnection({ id: 'connection-two', epoch: 2 });
  await expectCodeAsync(() => agent.handleDispatch(dispatch()), 'stale_local_executor');
});

test('Node process adapter executes one fresh child and emits completed/effect/result/cleanup evidence', async () => {
  const adapter = createNodeProcessExecutionAdapter({
    resolveExecution: async () => ({
      command: process.execPath,
      args: ['-e', 'process.stdout.write("child-ok")'],
      effectFromExit: ({ code }) => code === 0 ? 'applied' : 'not_applied',
      resultEnvelopeFactory: ({ code, stdout }) => ({
        exitCode: code,
        stdout: stdout.overflow ? null : stdout.bytes.toString('utf8'),
      }),
    }),
  });
  const { agent, emitted } = runtime({ adapter });
  const started = await agent.handleDispatch(dispatch());
  assert.equal(started.classification, 'started');
  const settled = await started.completion;
  assert.equal(settled.completion.code, 0);
  assert.equal(settled.cleanup.cleanupComplete, true);
  assert.equal(emitted.find((frame) => frame.type === 'result')?.payload.resultEnvelope.stdout, 'child-ok');
  assert.deepEqual(evidenceRevisions(emitted), [1, 2, 3, 4]);
  assert.equal(emitted.at(-1).payload.observation.cleanup, 'cleanup_complete');
});

class FakeWebSocket {
  constructor() {
    this.listeners = new Map();
    this.sent = [];
    this.closed = null;
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type, payload = {}) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(payload);
  }

  send(value) { this.sent.push(value); }
  close(code, reason) { this.closed = { code, reason }; }
}

test('Node process adapter cancellation kills SIGTERM-resistant descendants before reporting cleanup complete', { skip: process.platform === 'win32' }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tdev-d0020-agent-'));
  const pidFile = join(directory, 'descendant.pid');
  let operation = null;
  let descendantPid = null;
  try {
    const descendantSource = "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);";
    const parentSource = [
      "const { spawn } = require('node:child_process');",
      "const { writeFileSync } = require('node:fs');",
      `const child = spawn(process.execPath, ['-e', ${JSON.stringify(descendantSource)}], { stdio: 'ignore' });`,
      `writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));`,
      'setInterval(() => {}, 1000);',
    ].join('\n');
    const adapter = createNodeProcessExecutionAdapter({
      cancelGraceMs: 100,
      resolveExecution: async () => ({ command: process.execPath, args: ['-e', parentSource] }),
    });
    operation = await adapter.start({ envelope: dispatch(), signalContext: {} });
    descendantPid = Number((await waitForFile(pidFile)).trim());
    assert.equal(Number.isSafeInteger(descendantPid) && descendantPid > 0, true);
    assert.equal(processExists(descendantPid), true);

    const cancelled = await operation.cancel();
    assert.equal(cancelled.signalled, true);
    const cleanup = await operation.cleanup();
    assert.equal(cleanup.cleanupComplete, true);
    assert.equal(processExists(descendantPid), false);
  } finally {
    if (operation?.pid) {
      try { process.kill(-operation.pid, 'SIGKILL'); } catch {}
    }
    if (descendantPid) {
      try { process.kill(descendantPid, 'SIGKILL'); } catch {}
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test('WebSocket transport keeps authentication out of the URL and binds it to a route-scoped subprotocol', async () => {
  const { agent } = runtime({ adapter: { async start() { throw new Error('unused'); } } });
  agent.connection = null;
  let capturedUrl;
  let capturedProtocols;
  const socket = new FakeWebSocket();
  const transport = new LocalAgentWebSocketTransport({
    runtime: agent,
    endpoint: 'wss://qualification.example/agent-delivery/v1/connect',
    authKey: '0123456789abcdef0123456789abcdef0123456789abcdef',
    webSocketFactory(url, protocols) {
      capturedUrl = url;
      capturedProtocols = [...protocols];
      queueMicrotask(() => socket.dispatch('open'));
      return socket;
    },
  });
  const identity = await transport.connect({
    expectedConnectionEpoch: 0,
    connectRequestId: 'connect-one',
    connectionId: 'connection-one',
    protocolMetadataDigest: digest({ protocol: 'agent-v1' }),
  });
  const parsed = new URL(capturedUrl);
  assert.equal(parsed.username, '');
  assert.equal(parsed.password, '');
  assert.equal(parsed.searchParams.has('token'), false);
  assert.equal(parsed.search.includes('tdev-auth'), false);
  assert.equal(capturedProtocols[0], LOCAL_AGENT_WEBSOCKET_PROTOCOL);
  assert.match(capturedProtocols[1], new RegExp(`^${LOCAL_AGENT_AUTH_PROTOCOL_PREFIX}[A-Za-z0-9_-]{43}$`));
  assert.equal(identity.connectionEpoch, 1);
  assert.equal(identity.executorEpoch, 1);
  transport.close();
});
