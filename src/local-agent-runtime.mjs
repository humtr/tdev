import { spawn as nodeSpawn } from 'node:child_process';
import {
  ContractError,
  assertScalarString,
  assertDigest,
  assertIdentifier,
  assertRecordShape,
  assertSafeInteger,
  canonicalClone,
  canonicalJson,
  digest,
  strictJsonParse,
} from './canonical.mjs';
import {
  AGENT_DELIVERY_AUTH_PROTOCOL_PREFIX,
  AGENT_DELIVERY_POSSESSION_PROTOCOL_PREFIX,
  AGENT_DELIVERY_WEBSOCKET_PROTOCOL,
  deriveAgentPrincipalToken,
} from './cloudflare-agent-delivery-runtime.mjs';
import { normalizeInstallableAgentDataPlaneTuple } from './installable-agent-admission.mjs';
import { encodeBase64Url } from './installable-agent-security.mjs';

export const LOCAL_AGENT_RUNTIME_PROFILE = 'tdev.local-agent-runtime.v1';
export const LOCAL_AGENT_WEBSOCKET_PROTOCOL = AGENT_DELIVERY_WEBSOCKET_PROTOCOL;
export const LOCAL_AGENT_AUTH_PROTOCOL_PREFIX = AGENT_DELIVERY_AUTH_PROTOCOL_PREFIX;
export const LOCAL_AGENT_POSSESSION_PROTOCOL_PREFIX = AGENT_DELIVERY_POSSESSION_PROTOCOL_PREFIX;

const DEFAULT_MAX_TRACKED_DELIVERIES = 1024;
const DEFAULT_MAX_DISPATCH_ORDINALS = 8;
const DEFAULT_MAX_FRAME_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const DEFAULT_CANCEL_GRACE_MS = 2_000;
const MAX_IDENTIFIER_BYTES = 256;
const textEncoder = new TextEncoder();

function fail(code, message, details = undefined, options = undefined) {
  throw new ContractError(code, message, details, options);
}

const LOCAL_EXECUTION_START_FAILURE = Symbol('tdev.local-execution-start-failure.v1');

export function createLocalExecutionStartError(code, message, {
  phase,
  cleanupComplete = false,
  pid = null,
  cause = undefined,
} = {}) {
  if (phase !== 'pre_handle' && phase !== 'post_create') {
    fail('invalid_local_execution_start_failure', 'Local execution start failure phase must be pre_handle or post_create');
  }
  if (phase === 'pre_handle' && cleanupComplete) {
    fail('invalid_local_execution_start_failure', 'Pre-handle failure cannot claim cleanup_complete');
  }
  if (pid !== null && (!Number.isSafeInteger(pid) || pid <= 0)) {
    fail('invalid_local_execution_start_failure', 'Local execution start failure pid must be null or a positive safe integer');
  }
  const error = new ContractError(code, message, {
    phase,
    cleanupComplete: phase === 'post_create' && cleanupComplete,
    pid,
  }, cause === undefined ? undefined : { cause });
  Object.defineProperties(error, {
    [LOCAL_EXECUTION_START_FAILURE]: { value: true },
    startFailurePhase: { value: phase, enumerable: true },
    noHandle: { value: phase === 'pre_handle', enumerable: true },
    resourceCreated: { value: phase === 'post_create', enumerable: true },
    cleanupComplete: { value: phase === 'post_create' && cleanupComplete, enumerable: true },
    pid: { value: pid, enumerable: true },
  });
  return error;
}

function isLocalExecutionStartError(error) {
  return error?.[LOCAL_EXECUTION_START_FAILURE] === true;
}

function byteLength(value) {
  return textEncoder.encode(value).byteLength;
}

function assertBoundedText(value, label, maxBytes, { identifier = false } = {}) {
  assertScalarString(value, label);
  if (value.length === 0 || value.includes('\0') || byteLength(value) > maxBytes) {
    fail('invalid_local_agent_text', `${label} is outside supported text bounds`, { maxBytes });
  }
  if (identifier) assertIdentifier(value, label);
  return value;
}

function assertPositiveBound(value, label, max = Number.MAX_SAFE_INTEGER) {
  assertSafeInteger(value, label, { min: 1, max });
  return value;
}

function assertExecutorTuple(tuple, label = 'executor') {
  assertRecordShape(tuple, ['id', 'epoch'], [], label);
  assertBoundedText(tuple.id, `${label}.id`, MAX_IDENTIFIER_BYTES, { identifier: true });
  assertSafeInteger(tuple.epoch, `${label}.epoch`, { min: 1 });
  return Object.freeze({ id: tuple.id, epoch: tuple.epoch });
}

function assertConnectionTuple(tuple, label = 'connection') {
  assertRecordShape(tuple, ['id', 'epoch'], [], label);
  assertBoundedText(tuple.id, `${label}.id`, MAX_IDENTIFIER_BYTES, { identifier: true });
  assertSafeInteger(tuple.epoch, `${label}.epoch`, { min: 1 });
  return Object.freeze({ id: tuple.id, epoch: tuple.epoch });
}

function normalizeDispatchEnvelope(input, { maxFrameBytes, maxDispatchOrdinals }) {
  assertRecordShape(input, [
    'type', 'deliveryId', 'dispatchOrdinal', 'authorizationId', 'dispatchGrantId', 'caseId', 'taskId', 'attemptId',
    'executorId', 'executorEpoch', 'fencingToken', 'protocolVersion', 'executableBody',
  ], ['installableAgentTuple', 'socketIncarnationId', 'firstEmissionAdmissionId'], 'local Agent dispatch envelope');
  if (input.type !== 'dispatch') fail('invalid_local_agent_dispatch', 'Local Agent only accepts dispatch envelopes on the executable path');
  assertDigest(input.deliveryId, 'deliveryId');
  assertSafeInteger(input.dispatchOrdinal, 'dispatchOrdinal', { min: 1, max: maxDispatchOrdinals });
  assertDigest(input.authorizationId, 'authorizationId');
  assertDigest(input.dispatchGrantId, 'dispatchGrantId');
  for (const field of ['caseId', 'taskId', 'attemptId', 'executorId', 'protocolVersion']) {
    assertBoundedText(input[field], field, MAX_IDENTIFIER_BYTES, { identifier: true });
  }
  assertSafeInteger(input.executorEpoch, 'executorEpoch', { min: 1 });
  assertDigest(input.fencingToken, 'fencingToken');
  const d0027Fields = ['installableAgentTuple', 'socketIncarnationId', 'firstEmissionAdmissionId'];
  const d0027Count = d0027Fields.filter((field) => input[field] !== undefined && input[field] !== null).length;
  if (d0027Count !== 0 && d0027Count !== d0027Fields.length) fail('invalid_local_agent_dispatch', 'D0027 dispatch tuple must be wholly present or absent');
  if (d0027Count === d0027Fields.length) {
    normalizeInstallableAgentDataPlaneTuple(input.installableAgentTuple);
    assertBoundedText(input.socketIncarnationId, 'socketIncarnationId', MAX_IDENTIFIER_BYTES, { identifier: true });
    assertDigest(input.firstEmissionAdmissionId, 'firstEmissionAdmissionId');
  }
  const envelope = canonicalClone(input);
  if (byteLength(canonicalJson(envelope)) > maxFrameBytes) {
    fail('local_agent_frame_too_large', 'Local Agent dispatch envelope exceeds the configured frame budget', { maxFrameBytes });
  }
  return envelope;
}

function evidencePayload(envelope, localEvidenceRevision, observation) {
  return Object.freeze({
    deliveryId: envelope.deliveryId,
    dispatchOrdinal: envelope.dispatchOrdinal,
    attemptId: envelope.attemptId,
    fencingToken: envelope.fencingToken,
    localEvidenceRevision,
    observation: Object.freeze({ ...observation }),
  });
}

function deliveryKey(envelope) {
  return `${envelope.deliveryId}:${envelope.executorId}:${envelope.executorEpoch}`;
}

function ordinalKey(ordinal) {
  return String(ordinal);
}

function activeEntry(entry) {
  return entry && entry.operation !== null && entry.cleanupState !== 'cleanup_complete';
}

export class LocalAgentRuntime {
  constructor({
    agentId,
    routeGeneration,
    executor,
    emit,
    executionAdapter,
    installableAgentTuple = null,
    maxTrackedDeliveries = DEFAULT_MAX_TRACKED_DELIVERIES,
    maxDispatchOrdinals = DEFAULT_MAX_DISPATCH_ORDINALS,
    maxFrameBytes = DEFAULT_MAX_FRAME_BYTES,
  }) {
    assertBoundedText(agentId, 'agentId', MAX_IDENTIFIER_BYTES, { identifier: true });
    assertSafeInteger(routeGeneration, 'routeGeneration', { min: 1 });
    this.agentId = agentId;
    this.routeGeneration = routeGeneration;
    this.executor = assertExecutorTuple(executor);
    this.installableAgentTuple = installableAgentTuple === null ? null : normalizeInstallableAgentDataPlaneTuple(installableAgentTuple);
    this.socketIncarnationId = null;
    if (typeof emit !== 'function') fail('invalid_local_agent_runtime', 'Local Agent runtime requires an evidence transport emitter');
    if (!executionAdapter || typeof executionAdapter.start !== 'function') {
      fail('invalid_local_agent_runtime', 'Local Agent runtime requires an execution adapter exposing start()');
    }
    this.emit = emit;
    this.executionAdapter = executionAdapter;
    this.maxTrackedDeliveries = assertPositiveBound(maxTrackedDeliveries, 'maxTrackedDeliveries');
    this.maxDispatchOrdinals = assertPositiveBound(maxDispatchOrdinals, 'maxDispatchOrdinals', 1024);
    this.maxFrameBytes = assertPositiveBound(maxFrameBytes, 'maxFrameBytes');
    this.connection = null;
    this.capacityRevision = 0;
    this.deliveries = new Map();
    this.attempts = new Map();
  }

  bindConnection(tuple) {
    const next = assertConnectionTuple(tuple);
    if (this.connection !== null && next.epoch <= this.connection.epoch) {
      fail('stale_local_connection', 'Local Agent connection epoch must advance on a real reconnect');
    }
    this.connection = next;
    this.socketIncarnationId = null;
    return this.identity();
  }

  identity() {
    const identity = {
      profile: LOCAL_AGENT_RUNTIME_PROFILE,
      agentId: this.agentId,
      routeGeneration: this.routeGeneration,
      connectionId: this.connection?.id ?? null,
      connectionEpoch: this.connection?.epoch ?? null,
      executorId: this.executor.id,
      executorEpoch: this.executor.epoch,
      capacityRevision: this.capacityRevision,
    };
    if (this.installableAgentTuple !== null) identity.installableAgentTuple = canonicalClone(this.installableAgentTuple);
    if (this.socketIncarnationId !== null) identity.socketIncarnationId = this.socketIncarnationId;
    return Object.freeze(identity);
  }

  replaceExecutor(tuple) {
    const next = assertExecutorTuple(tuple, 'replacement executor');
    if (next.id === this.executor.id && next.epoch === this.executor.epoch) return this.identity();
    if (next.epoch <= this.executor.epoch) fail('stale_local_executor', 'Executor replacement epoch must advance');
    for (const delivery of this.deliveries.values()) {
      for (const entry of delivery.ordinals.values()) {
        if (activeEntry(entry)) fail('local_executor_busy', 'Executor replacement cannot abandon a locally held execution handle');
      }
    }
    this.executor = next;
    this.capacityRevision = 0;
    this.connection = null;
    return this.identity();
  }

  async reportCapacity(reportedCapacity) {
    if (this.connection === null) fail('local_connection_unavailable', 'Local Agent cannot report capacity without a current connection');
    assertSafeInteger(reportedCapacity, 'reportedCapacity', { min: 0 });
    this.capacityRevision += 1;
    await this.emit(Object.freeze({
      type: 'capacity',
      payload: Object.freeze({ capacityRevision: this.capacityRevision, reportedCapacity }),
    }));
    return Object.freeze({ capacityRevision: this.capacityRevision, reportedCapacity });
  }

  #delivery(envelope) {
    const key = deliveryKey(envelope);
    let state = this.deliveries.get(key);
    if (state !== undefined) return state;
    if (this.deliveries.size >= this.maxTrackedDeliveries) {
      fail('local_delivery_tracking_capacity', 'Local Agent duplicate-fence table is full; refusing untracked executable work');
    }
    state = {
      deliveryId: envelope.deliveryId,
      attemptId: envelope.attemptId,
      executorId: envelope.executorId,
      executorEpoch: envelope.executorEpoch,
      fencingToken: envelope.fencingToken,
      highestOrdinal: 0,
      localEvidenceRevision: 0,
      ordinals: new Map(),
      startedEver: false,
    };
    this.deliveries.set(key, state);
    return state;
  }

  async #emitEvidence(delivery, entry, observation) {
    delivery.localEvidenceRevision += 1;
    entry.localEvidenceRevision = delivery.localEvidenceRevision;
    entry.lastObservation = Object.freeze({ ...observation });
    const payload = evidencePayload(entry.envelope, delivery.localEvidenceRevision, observation);
    await this.emit(Object.freeze({ type: 'evidence', payload }));
    return payload;
  }

  async handleTransportMessage(message) {
    let frame = message;
    if (typeof message === 'string') {
      if (byteLength(message) > this.maxFrameBytes) fail('local_agent_frame_too_large', 'Local Agent frame exceeds the configured byte budget');
      try {
        frame = strictJsonParse(message, { maxBytes: this.maxFrameBytes });
      } catch (cause) {
        fail('invalid_local_agent_frame', 'Local Agent transport message is invalid JSON', {}, { cause });
      }
    }
    if (frame?.type === 'dispatch') return this.handleDispatch(frame);
    if (frame?.type === 'control') return this.handleControl(frame);
    fail('invalid_local_agent_frame', 'Local Agent transport message type is unsupported');
  }

  async handleDispatch(input) {
    if (this.connection === null) fail('local_connection_unavailable', 'Local Agent cannot execute without a current connection');
    const envelope = normalizeDispatchEnvelope(input, {
      maxFrameBytes: this.maxFrameBytes,
      maxDispatchOrdinals: this.maxDispatchOrdinals,
    });
    if (envelope.executorId !== this.executor.id || envelope.executorEpoch !== this.executor.epoch) {
      fail('stale_local_executor', 'Dispatch targets a different executor generation');
    }
    const envelopeHasD0027 = envelope.installableAgentTuple !== undefined && envelope.installableAgentTuple !== null;
    if (this.installableAgentTuple === null) {
      if (envelopeHasD0027) fail('local_installable_agent_tuple_conflict', 'Legacy local runtime cannot execute a D0027 dispatch tuple');
    } else {
      if (!envelopeHasD0027 || canonicalJson(envelope.installableAgentTuple) !== canonicalJson(this.installableAgentTuple)) {
        fail('stale_local_installable_agent_fence', 'Dispatch does not match the installed local D0027 tuple');
      }
      if (this.socketIncarnationId === null) this.socketIncarnationId = envelope.socketIncarnationId;
      else if (this.socketIncarnationId !== envelope.socketIncarnationId) fail('stale_local_socket_incarnation', 'Dispatch arrived for a different physical socket incarnation');
    }
    const attemptOwner = this.attempts.get(envelope.attemptId);
    if (attemptOwner && attemptOwner !== envelope.deliveryId) {
      fail('local_attempt_conflict', 'One semantic Attempt cannot create multiple local delivery owners');
    }
    const delivery = this.#delivery(envelope);
    if (delivery.attemptId !== envelope.attemptId || delivery.fencingToken !== envelope.fencingToken) {
      fail('stale_local_delivery', 'Dispatch reuses a delivery identity with a different Attempt fence');
    }
    const key = ordinalKey(envelope.dispatchOrdinal);
    const envelopeDigest = digest(envelope);
    const existing = delivery.ordinals.get(key);
    if (existing) {
      if (existing.envelopeDigest !== envelopeDigest) {
        fail('local_dispatch_conflict', 'Same delivery/ordinal arrived with different executable content');
      }
      return Object.freeze({
        classification: 'exact_replay',
        executed: false,
        localEvidenceRevision: existing.localEvidenceRevision,
        observation: existing.lastObservation,
      });
    }
    if (envelope.dispatchOrdinal !== delivery.highestOrdinal + 1) {
      fail('local_dispatch_out_of_order', 'Dispatch ordinal must advance exactly one step');
    }
    if (delivery.highestOrdinal > 0) {
      const previous = delivery.ordinals.get(ordinalKey(delivery.highestOrdinal));
      if (delivery.startedEver || previous.executionState !== 'not_started' || previous.cleanupState !== 'no_handle') {
        fail('local_dispatch_replay_unsafe', 'Later dispatch ordinal requires positive predecessor not-started/no-handle evidence');
      }
    }
    this.attempts.set(envelope.attemptId, delivery.deliveryId);
    const entry = {
      envelope,
      envelopeDigest,
      localEvidenceRevision: 0,
      lastObservation: null,
      executionState: 'unknown',
      cleanupState: 'unknown',
      operation: null,
      completion: null,
    };
    delivery.ordinals.set(key, entry);
    delivery.highestOrdinal = envelope.dispatchOrdinal;

    await this.#emitEvidence(delivery, entry, { dispatch: 'sent_observed', transportReceipt: 'received' });

    let operation;
    try {
      operation = await this.executionAdapter.start({
        envelope: canonicalClone(envelope),
        signalContext: Object.freeze({
          agentId: this.agentId,
          routeGeneration: this.routeGeneration,
          connection: this.connection,
          executor: this.executor,
        }),
      });
    } catch (cause) {
      if (isLocalExecutionStartError(cause) && cause.startFailurePhase === 'pre_handle') {
        entry.executionState = 'not_started';
        entry.cleanupState = 'no_handle';
        await this.#emitEvidence(delivery, entry, { execution: 'not_started', cleanup: 'no_handle' });
        return Object.freeze({
          classification: 'not_started',
          executed: false,
          noHandle: true,
          causeCode: cause.code,
        });
      }
      delivery.startedEver = true;
      entry.executionState = 'started';
      if (isLocalExecutionStartError(cause) && cause.startFailurePhase === 'post_create' && cause.cleanupComplete === true) {
        entry.cleanupState = 'cleanup_complete';
        await this.#emitEvidence(delivery, entry, { execution: 'started', cleanup: 'cleanup_complete' });
        return Object.freeze({
          classification: 'start_failed_cleaned_up',
          executed: false,
          noHandle: false,
          cleanupComplete: true,
          causeCode: cause?.code ?? 'execution_start_failed',
        });
      }
      entry.cleanupState = 'held';
      await this.#emitEvidence(delivery, entry, { execution: 'started', cleanup: 'held' });
      return Object.freeze({
        classification: 'start_failed_cleanup_held',
        executed: false,
        noHandle: false,
        cleanupComplete: false,
        causeCode: cause?.code ?? 'execution_start_failed',
      });
    }
    if (!operation || typeof operation.cancel !== 'function' || typeof operation.cleanup !== 'function' ||
        !(operation.completion instanceof Promise)) {
      fail('invalid_local_execution_adapter', 'Execution adapter returned an invalid operation contract');
    }
    entry.operation = operation;
    entry.executionState = 'started';
    entry.cleanupState = 'held';
    delivery.startedEver = true;
    await this.#emitEvidence(delivery, entry, { execution: 'started', cleanup: 'held' });

    entry.completion = this.#complete(delivery, entry, operation);
    return Object.freeze({ classification: 'started', executed: true, completion: entry.completion });
  }

  async #complete(delivery, entry, operation) {
    let completion;
    try {
      completion = await operation.completion;
      entry.executionState = 'completed';
      const observation = { execution: 'completed' };
      if (completion?.effect === 'applied' || completion?.effect === 'not_applied') observation.effect = completion.effect;
      await this.#emitEvidence(delivery, entry, observation);
      if (completion?.resultEnvelope !== undefined) {
        await this.emit(Object.freeze({
          type: 'result',
          payload: Object.freeze({ deliveryId: entry.envelope.deliveryId, resultEnvelope: canonicalClone(completion.resultEnvelope) }),
        }));
      }
    } catch (cause) {
      completion = Object.freeze({ classification: 'completion_unknown', causeCode: cause?.code ?? 'local_completion_unknown' });
    }

    let cleanup;
    try {
      cleanup = await operation.cleanup();
      if (cleanup?.cleanupComplete === true) {
        entry.cleanupState = 'cleanup_complete';
        await this.#emitEvidence(delivery, entry, { cleanup: 'cleanup_complete' });
      }
    } catch (cause) {
      cleanup = Object.freeze({ cleanupComplete: false, causeCode: cause?.code ?? 'local_cleanup_unknown' });
    } finally {
      if (entry.cleanupState === 'cleanup_complete') entry.operation = null;
    }
    return Object.freeze({ completion, cleanup });
  }

  async handleControl(input) {
    assertRecordShape(input, ['type', 'action', 'deliveryId', 'dispatchOrdinal'], [], 'local Agent control frame');
    if (input.type !== 'control' || input.action !== 'cancel') fail('invalid_local_agent_control', 'Only explicit cancel control is supported');
    assertDigest(input.deliveryId, 'deliveryId');
    assertSafeInteger(input.dispatchOrdinal, 'dispatchOrdinal', { min: 1, max: this.maxDispatchOrdinals });
    let found = null;
    for (const delivery of this.deliveries.values()) {
      if (delivery.deliveryId !== input.deliveryId) continue;
      found = { delivery, entry: delivery.ordinals.get(ordinalKey(input.dispatchOrdinal)) ?? null };
      break;
    }
    if (found === null || found.entry === null) {
      return Object.freeze({ classification: 'unknown', cancelled: false, noHandleProved: false });
    }
    const { delivery, entry } = found;
    if (entry.operation === null) {
      return Object.freeze({ classification: 'already_clean', cancelled: false, noHandleProved: entry.cleanupState === 'no_handle' });
    }
    await entry.operation.cancel();
    let cleanup;
    try {
      cleanup = await entry.operation.cleanup();
    } catch (cause) {
      return Object.freeze({ classification: 'cleanup_unknown', cancelled: true, cleanupComplete: false, causeCode: cause?.code ?? 'local_cleanup_unknown' });
    }
    if (cleanup?.cleanupComplete === true && entry.cleanupState !== 'cleanup_complete') {
      entry.cleanupState = 'cleanup_complete';
      await this.#emitEvidence(delivery, entry, { cleanup: 'cleanup_complete' });
      entry.operation = null;
    }
    return Object.freeze({ classification: 'cancelled', cancelled: true, cleanupComplete: entry.cleanupState === 'cleanup_complete' });
  }

  snapshotVolatileState() {
    return Object.freeze({
      profile: LOCAL_AGENT_RUNTIME_PROFILE,
      identity: this.identity(),
      trackedDeliveries: this.deliveries.size,
      semanticRetryQueueLength: 0,
      durableLocalJournal: false,
    });
  }
}

function boundedBufferCollector(maxBytes) {
  let chunks = [];
  let total = 0;
  let overflow = false;
  return Object.freeze({
    push(chunk) {
      if (overflow) return;
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += bytes.length;
      if (total > maxBytes) {
        overflow = true;
        chunks = [];
        return;
      }
      chunks.push(bytes);
    },
    result() {
      return Object.freeze({
        overflow,
        bytes: overflow ? null : Buffer.concat(chunks),
      });
    },
  });
}

function killProcessGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    throw error;
  }
}

function processGroupExists(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    throw error;
  }
}

async function waitForProcessGroupExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (processGroupExists(pid)) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return true;
}

export function createNodeProcessExecutionAdapter({
  resolveExecution,
  spawnImpl = nodeSpawn,
  maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
  cancelGraceMs = DEFAULT_CANCEL_GRACE_MS,
} = {}) {
  if (typeof resolveExecution !== 'function') fail('invalid_local_execution_adapter', 'Node process adapter requires resolveExecution(executableBody, envelope)');
  assertPositiveBound(maxOutputBytes, 'maxOutputBytes');
  assertSafeInteger(cancelGraceMs, 'cancelGraceMs', { min: 0, max: 60_000 });
  return Object.freeze({
    async start({ envelope, signalContext }) {
      let launch;
      try {
        launch = await resolveExecution(canonicalClone(envelope.executableBody), Object.freeze({ envelope, signalContext }));
        assertRecordShape(launch, ['command'], ['args', 'cwd', 'env', 'stdin', 'resultEnvelopeFactory', 'effectFromExit'], 'local process launch');
        assertBoundedText(launch.command, 'launch.command', 4096);
        const args = launch.args ?? [];
        if (!Array.isArray(args) || args.length > 256 || args.some((arg) => typeof arg !== 'string' || byteLength(arg) > 4096)) {
          fail('invalid_local_process_launch', 'Process arguments are outside supported bounds');
        }
        if (launch.cwd !== undefined && launch.cwd !== null && (typeof launch.cwd !== 'string' || launch.cwd.length === 0)) {
          fail('invalid_local_process_launch', 'Process cwd must be null or non-empty text');
        }
        if (launch.env !== undefined && (launch.env === null || typeof launch.env !== 'object' || Array.isArray(launch.env))) {
          fail('invalid_local_process_launch', 'Process env must be a record when provided');
        }
      } catch (preLaunchCause) {
        throw createLocalExecutionStartError(
          preLaunchCause?.code ?? 'invalid_local_process_launch',
          preLaunchCause?.message ?? 'Pre-launch validation failed',
          { phase: 'pre_handle', cause: preLaunchCause },
        );
      }

      let preparedStdin = null;
      if (launch.stdin !== undefined && launch.stdin !== null) {
        try {
          const stdinPayload = typeof launch.stdin === 'string' || Buffer.isBuffer(launch.stdin) ? launch.stdin : canonicalJson(launch.stdin);
          preparedStdin = Buffer.isBuffer(stdinPayload) ? stdinPayload : Buffer.from(stdinPayload);
          if (preparedStdin.byteLength > maxOutputBytes) {
            fail('local_process_input_too_large', 'Process stdin exceeds the configured byte bound');
          }
        } catch (stdinCause) {
          throw createLocalExecutionStartError(
            stdinCause?.code ?? 'local_process_input_too_large',
            stdinCause?.message ?? 'Stdin preparation failed',
            { phase: 'pre_handle', cause: stdinCause },
          );
        }
      }

      let child;
      try {
        child = spawnImpl(launch.command, launch.args ?? [], {
          cwd: launch.cwd ?? undefined,
          env: launch.env ?? process.env,
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: true,
          shell: false,
        });
      } catch (spawnCause) {
        throw createLocalExecutionStartError(
          'local_process_spawn_failed',
          'Process spawn failed before a child handle was returned',
          { phase: 'pre_handle', cause: spawnCause },
        );
      }

      if (!child || !Number.isSafeInteger(child.pid) || child.pid <= 0) {
        try { child?.kill?.('SIGKILL'); } catch {}
        throw createLocalExecutionStartError(
          'invalid_local_process_handle',
          'Process launcher returned an ambiguous/invalid child handle after the create call',
          { phase: 'post_create', cleanupComplete: false },
        );
      }

      let cleanupError = null;
      const forceKillGroup = () => {
        try {
          return killProcessGroup(child.pid, 'SIGKILL');
        } catch (cause) {
          cleanupError ??= cause;
          return false;
        }
      };

      if (!child.stdout || !child.stderr || !child.stdin) {
        forceKillGroup();
        let groupGone = false;
        try {
          groupGone = await waitForProcessGroupExit(child.pid, cancelGraceMs);
        } catch (cause) {
          cleanupError ??= cause;
        }
        throw createLocalExecutionStartError(
          'invalid_local_process_handle',
          'Process launcher did not return complete child streams after creating the process',
          {
            phase: 'post_create',
            cleanupComplete: groupGone && cleanupError === null,
            pid: child.pid,
            cause: cleanupError ?? undefined,
          },
        );
      }

      const stdout = boundedBufferCollector(maxOutputBytes);
      const stderr = boundedBufferCollector(maxOutputBytes);
      child.stdout.on('data', (chunk) => stdout.push(chunk));
      child.stderr.on('data', (chunk) => stderr.push(chunk));
      if (preparedStdin === null) child.stdin.end();
      else child.stdin.end(preparedStdin);

      let exited = false;
      let closed = false;
      let exitRecord = null;
      const completion = new Promise((resolve, reject) => {
        child.once('error', (cause) => {
          if (!closed) reject(Object.assign(new Error('local child process error'), { code: cause?.code ?? 'local_child_error', cause }));
        });
        child.once('exit', () => {
          exited = true;
          forceKillGroup();
        });
        child.once('close', async (code, signal) => {
          closed = true;
          forceKillGroup();
          const out = stdout.result();
          const err = stderr.result();
          exitRecord = Object.freeze({ code, signal, stdout: out, stderr: err });
          try {
            let effect;
            if (typeof launch.effectFromExit === 'function') effect = await launch.effectFromExit(exitRecord);
            let resultEnvelope;
            if (typeof launch.resultEnvelopeFactory === 'function') resultEnvelope = await launch.resultEnvelopeFactory(exitRecord);
            resolve(Object.freeze({
              code,
              signal,
              effect: effect === 'applied' || effect === 'not_applied' ? effect : undefined,
              resultEnvelope,
              stdoutOverflow: out.overflow,
              stderrOverflow: err.overflow,
            }));
          } catch (cause) {
            reject(Object.assign(new Error('local child result processing failed'), { code: cause?.code ?? 'local_child_result_failed', cause }));
          }
        });
      });
      return Object.freeze({
        pid: child.pid,
        completion,
        async cancel() {
          const alreadyExited = exited;
          if (closed && !processGroupExists(child.pid)) return Object.freeze({ signalled: false, alreadyExited: true });
          const signalled = killProcessGroup(child.pid, 'SIGTERM');
          if (cancelGraceMs > 0) {
            await Promise.race([
              completion.catch(() => undefined),
              new Promise((resolve) => setTimeout(resolve, cancelGraceMs)),
            ]);
          }
          if (processGroupExists(child.pid)) forceKillGroup();
          return Object.freeze({ signalled, alreadyExited });
        },
        async cleanup() {
          try { await completion; } catch {}
          if (processGroupExists(child.pid)) forceKillGroup();
          let groupGone = false;
          try {
            groupGone = await waitForProcessGroupExit(child.pid, cancelGraceMs);
          } catch (cause) {
            cleanupError ??= cause;
          }
          return Object.freeze({
            cleanupComplete: closed && groupGone && cleanupError === null,
            pid: child.pid,
            exit: exitRecord,
            ...(cleanupError === null ? {} : { cleanupErrorCode: cleanupError?.code ?? 'local_process_cleanup_failed' }),
          });
        },
      });
    },
  });
}

function webSocketDataToText(data, maxBytes) {
  if (typeof data === 'string') {
    if (byteLength(data) > maxBytes) fail('local_agent_frame_too_large', 'Received WebSocket frame exceeds the local byte budget');
    return Promise.resolve(data);
  }
  if (data instanceof ArrayBuffer) {
    if (data.byteLength > maxBytes) fail('local_agent_frame_too_large', 'Received WebSocket frame exceeds the local byte budget');
    return Promise.resolve(new TextDecoder('utf-8', { fatal: true }).decode(data));
  }
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    if (data.size > maxBytes) fail('local_agent_frame_too_large', 'Received WebSocket frame exceeds the local byte budget');
    return data.text();
  }
  fail('invalid_local_agent_frame', 'Unsupported WebSocket message payload type');
}

export class LocalAgentWebSocketTransport {
  constructor({
    runtime,
    endpoint,
    authKey,
    webSocketFactory = (url, protocols) => new WebSocket(url, protocols),
    onServerFrame = async () => {},
  }) {
    if (!(runtime instanceof LocalAgentRuntime)) fail('invalid_local_agent_transport', 'WebSocket transport requires LocalAgentRuntime');
    const url = new URL(endpoint);
    if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.hash) {
      fail('invalid_local_agent_transport', 'Agent WebSocket endpoint must be ws/wss without embedded credentials or fragment');
    }
    if (authKey !== null && (typeof authKey !== 'string' || authKey.length < 32)) fail('invalid_local_agent_transport', 'Agent WebSocket auth key is invalid or undersized');
    if (typeof webSocketFactory !== 'function') fail('invalid_local_agent_transport', 'Agent WebSocket factory must be callable');
    if (typeof onServerFrame !== 'function') fail('invalid_local_agent_transport', 'Agent WebSocket server-frame handler must be callable');
    this.runtime = runtime;
    this.endpoint = url;
    this.authKey = authKey;
    this.webSocketFactory = webSocketFactory;
    this.onServerFrame = onServerFrame;
    this.socket = null;
    this.closePromise = null;
  }

  async connect({ expectedConnectionEpoch, connectRequestId, connectionId, protocolMetadataDigest, possessionEnvelope = null }) {
    assertSafeInteger(expectedConnectionEpoch, 'expectedConnectionEpoch', { min: 0 });
    assertIdentifier(connectRequestId, 'connectRequestId');
    assertIdentifier(connectionId, 'connectionId');
    assertDigest(protocolMetadataDigest, 'protocolMetadataDigest');
    if (this.socket !== null) fail('local_transport_already_connected', 'Local Agent transport already owns a socket');
    const url = new URL(this.endpoint);
    const query = {
      agentId: this.runtime.agentId,
      routeGeneration: this.runtime.routeGeneration,
      expectedConnectionEpoch,
      connectRequestId,
      connectionId,
      executorId: this.runtime.executor.id,
      executorEpoch: this.runtime.executor.epoch,
      protocolMetadataDigest,
    };
    if (this.runtime.installableAgentTuple !== null) Object.assign(query, this.runtime.installableAgentTuple);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    let authorityProtocol;
    if (possessionEnvelope !== null) {
      if (this.authKey !== null) fail('invalid_local_agent_transport', 'D0039 possession transport must not carry legacy HMAC authority');
      const encoded = encodeBase64Url(new TextEncoder().encode(canonicalJson(possessionEnvelope)));
      authorityProtocol = `${LOCAL_AGENT_POSSESSION_PROTOCOL_PREFIX}${encoded}`;
    } else {
      if (this.authKey === null) fail('local_agent_possession_required', 'Agent transport has neither D0039 possession proof nor legacy auth key');
      const token = await deriveAgentPrincipalToken(this.authKey, {
        agentId: this.runtime.agentId,
        routeGeneration: this.runtime.routeGeneration,
      });
      authorityProtocol = `${LOCAL_AGENT_AUTH_PROTOCOL_PREFIX}${token}`;
    }
    const socket = this.webSocketFactory(url.toString(), [LOCAL_AGENT_WEBSOCKET_PROTOCOL, authorityProtocol]);
    if (!socket || typeof socket.addEventListener !== 'function' || typeof socket.send !== 'function') {
      fail('invalid_local_agent_transport', 'WebSocket factory returned an invalid socket');
    }
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        socket.removeEventListener?.('open', onOpen);
        socket.removeEventListener?.('error', onError);
      };
      const onOpen = () => { cleanup(); resolve(); };
      const onError = (event) => { cleanup(); reject(Object.assign(new Error('Agent WebSocket connection failed'), { code: 'local_transport_connect_failed', cause: event })); };
      socket.addEventListener('open', onOpen, { once: true });
      socket.addEventListener('error', onError, { once: true });
    });
    this.socket = socket;
    this.runtime.bindConnection({ id: connectionId, epoch: expectedConnectionEpoch + 1 });
    let resolveClose;
    this.closePromise = new Promise((resolve) => { resolveClose = resolve; });
    socket.addEventListener('message', (event) => {
      void webSocketDataToText(event.data, this.runtime.maxFrameBytes)
        .then((text) => strictJsonParse(text, { maxBytes: this.runtime.maxFrameBytes }))
        .then((frame) => {
          if (frame?.type === 'dispatch' || frame?.type === 'control') {
            return this.runtime.handleTransportMessage(frame);
          }
          if (['capacity_ack', 'evidence_ack', 'result_handoff'].includes(frame?.type)) {
            return this.onServerFrame(canonicalClone(frame));
          }
          fail('invalid_local_agent_frame', 'Local Agent server frame type is unsupported');
        })
        .catch(() => { try { socket.close(1008, 'local_agent_frame_rejected'); } catch {} });
    });
    socket.addEventListener('close', (event) => {
      if (this.socket === socket) this.socket = null;
      resolveClose(Object.freeze({ code: event?.code ?? null, reason: event?.reason ?? null }));
    }, { once: true });
    return this.runtime.identity();
  }

  waitForClose() {
    if (this.closePromise === null) fail('local_connection_unavailable', 'Local Agent transport has not established a close-observable socket');
    return this.closePromise;
  }

  async emit(frame) {
    if (this.socket === null) fail('local_connection_unavailable', 'Local Agent cannot emit without a connected WebSocket');
    const text = canonicalJson(frame);
    if (byteLength(text) > this.runtime.maxFrameBytes) fail('local_agent_frame_too_large', 'Outgoing Agent frame exceeds the local byte budget');
    this.socket.send(text);
  }

  close(code = 1000, reason = 'normal') {
    const socket = this.socket;
    this.socket = null;
    if (socket !== null) socket.close(code, reason);
  }
}
