import {
  ContractError,
  assertDigest,
  assertIdentifier,
  assertRecordShape,
  assertSafeInteger,
  canonicalClone,
  canonicalJson,
  createRecord,
  deepFreeze,
  digest,
  isPlainRecord,
  typedDigest,
} from './canonical.mjs';
import {
  assertInstallableAgentDataPlaneTuple,
  compactManagementReceipts,
  computeInstallableAgentManagementIntentDigest,
  createLegacyInstallableAgentState,
  createUnregisteredInstallableAgentState,
  currentTupleDigest,
  evidenceProofContext,
  installableAgentCurrentTuple,
  installableAgentPendingDigest,
  installableAgentPredecessorDigest,
  installableAgentSecurityStateDigest,
  managementProofContext,
  managementRequestReplay,
  normalizeGenesisEvidenceType,
  normalizeInstallableAgentDataPlaneTuple,
  normalizeInstallableAgentState,
  normalizePositiveQuiescenceProofClass,
  recordManagementResult,
  updateManagementResult,
} from './installable-agent-admission.mjs';

export const AGENT_DELIVERY_PROFILE = 'tdev.agent-delivery-authority.v1';
export const AGENT_DELIVERY_SNAPSHOT_SCHEMA_VERSION = 3;

const textEncoder = new TextEncoder();

const DEFAULT_LIMITS = deepFreeze({
  maxAgentCapacity: 64,
  maxReservations: 256,
  maxDeliveries: 1024,
  maxDeliveryTombstones: 1024,
  maxSlotsPerReservation: 64,
  maxConnectReceipts: 32,
  maxDispatchOrdinalsPerDelivery: 8,
  maxManagementReceipts: 64,
  maxManagementTombstones: 256,
  maxTrustSubjects: 64,
  maxPredecessorQuiescenceReceipts: 256,
  maxIdentifierBytes: 256,
  maxProtocolMetadataBytes: 4096,
  maxExecutableBodyBytes: 4 * 1024 * 1024,
  maxEnvelopeBytes: 5 * 1024 * 1024,
  maxAggregateLiveBodyBytes: 16 * 1024 * 1024,
  maxResourceDimensions: 32,
  maxResourceDimensionValue: 0x7fffffff,
  maxEvidenceBytes: 16 * 1024,
  maxReservationLifetimeMs: 60 * 1000,
  reservationReplayGraceMs: 60 * 1000,
  deliveryReplayGraceMs: 60 * 1000,
});

const ROUTE_BINDING_FIELDS = [
  'agentId',
  'routeGeneration',
  'deployment',
  'environment',
  'workerScript',
  'className',
  'namespace',
  'jurisdiction',
  'durableObjectId',
];

const EXECUTION_VALUES = new Set(['unknown', 'not_started', 'started', 'completed']);
const CLEANUP_VALUES = new Set(['unknown', 'no_handle', 'held', 'cleanup_complete']);
const EFFECT_VALUES = new Set(['not_applicable', 'unknown', 'not_applied', 'applied']);
const DISPATCH_VALUES = new Set(['authorized', 'sent_observed', 'positively_not_sent']);
const RECEIPT_VALUES = new Set(['none', 'received']);

function fail(code, message, details = undefined) {
  throw new ContractError(code, message, details);
}

function exactRecord(value, required, optional, label) {
  assertRecordShape(value, required, optional, label);
  return value;
}

function assertBoundedText(value, label, maxBytes, { identifier = false } = {}) {
  if (identifier) assertIdentifier(value, label);
  else if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    fail('invalid_agent_delivery_text', `${label} must be non-empty text without NUL`);
  }
  const bytes = textEncoder.encode(value).byteLength;
  if (bytes > maxBytes) fail('agent_delivery_limit', `${label} exceeds its byte limit`, { maxBytes, bytes });
  return value;
}

function normalizeLimits(input = {}) {
  if (!isPlainRecord(input)) fail('invalid_agent_delivery_limits', 'Agent delivery limits must be a record');
  exactRecord(input, [], Object.keys(DEFAULT_LIMITS), 'agent delivery limits');
  const limits = { ...DEFAULT_LIMITS, ...input };
  for (const [key, value] of Object.entries(limits)) {
    assertSafeInteger(value, `limits.${key}`, { min: 1 });
  }
  if (limits.maxSlotsPerReservation > limits.maxAgentCapacity) {
    fail('invalid_agent_delivery_limits', 'maxSlotsPerReservation cannot exceed maxAgentCapacity');
  }
  if (limits.maxExecutableBodyBytes > limits.maxEnvelopeBytes) {
    fail('invalid_agent_delivery_limits', 'maxExecutableBodyBytes cannot exceed maxEnvelopeBytes');
  }
  if (limits.maxEnvelopeBytes > limits.maxAggregateLiveBodyBytes) {
    fail('invalid_agent_delivery_limits', 'maxEnvelopeBytes cannot exceed maxAggregateLiveBodyBytes');
  }
  return deepFreeze(limits);
}

export function defaultAgentDeliveryLimits(overrides = {}) {
  return normalizeLimits(overrides);
}

export function normalizeAgentRouteBinding(input, limits = DEFAULT_LIMITS) {
  const normalizedLimits = normalizeLimits(limits);
  exactRecord(input, ROUTE_BINDING_FIELDS, [], 'AgentRouteBinding');
  assertBoundedText(input.agentId, 'AgentRouteBinding.agentId', normalizedLimits.maxIdentifierBytes, { identifier: true });
  assertSafeInteger(input.routeGeneration, 'AgentRouteBinding.routeGeneration', { min: 1 });
  for (const field of ROUTE_BINDING_FIELDS.slice(2)) {
    assertBoundedText(input[field], `AgentRouteBinding.${field}`, normalizedLimits.maxIdentifierBytes);
  }
  return deepFreeze(canonicalClone(input));
}

export function agentRouteBindingDigest(binding, limits = DEFAULT_LIMITS) {
  return typedDigest('tdev.agent-route-binding.v1', normalizeAgentRouteBinding(binding, limits));
}

function normalizeResourceDimensions(input, limits) {
  if (!isPlainRecord(input)) fail('invalid_preflight_descriptor', 'resourceDimensions must be a record');
  const entries = Object.entries(input);
  if (entries.length > limits.maxResourceDimensions) {
    fail('preflight_resource_limit', 'resourceDimensions exceeds the configured dimension count', {
      maxResourceDimensions: limits.maxResourceDimensions,
    });
  }
  const result = createRecord();
  for (const [name, value] of entries) {
    assertBoundedText(name, `resourceDimensions.${name}`, limits.maxIdentifierBytes, { identifier: true });
    assertSafeInteger(value, `resourceDimensions.${name}`, { min: 0, max: limits.maxResourceDimensionValue });
    result[name] = value;
  }
  return result;
}

export function normalizeAgentPreflightDescriptor(input, limits = DEFAULT_LIMITS) {
  const normalizedLimits = normalizeLimits(limits);
  exactRecord(input, [
    'profileId',
    'protocolVersion',
    'executableBodyDigest',
    'executableBodyBytes',
    'resourceDimensions',
    'maxEnvelopeBytes',
  ], [], 'preflight descriptor');
  assertBoundedText(input.profileId, 'preflight.profileId', normalizedLimits.maxIdentifierBytes, { identifier: true });
  assertBoundedText(input.protocolVersion, 'preflight.protocolVersion', normalizedLimits.maxProtocolMetadataBytes, { identifier: true });
  assertDigest(input.executableBodyDigest, 'preflight.executableBodyDigest');
  assertSafeInteger(input.executableBodyBytes, 'preflight.executableBodyBytes', {
    min: 0,
    max: normalizedLimits.maxExecutableBodyBytes,
  });
  assertSafeInteger(input.maxEnvelopeBytes, 'preflight.maxEnvelopeBytes', {
    min: input.executableBodyBytes,
    max: normalizedLimits.maxEnvelopeBytes,
  });
  return deepFreeze({
    profileId: input.profileId,
    protocolVersion: input.protocolVersion,
    executableBodyDigest: input.executableBodyDigest,
    executableBodyBytes: input.executableBodyBytes,
    resourceDimensions: normalizeResourceDimensions(input.resourceDimensions, normalizedLimits),
    maxEnvelopeBytes: input.maxEnvelopeBytes,
  });
}

export function agentPreflightDescriptorDigest(descriptor, limits = DEFAULT_LIMITS) {
  return typedDigest('tdev.agent-preflight-descriptor.v1', normalizeAgentPreflightDescriptor(descriptor, limits));
}

function routeIdentity(state) {
  return {
    agentId: state.routeBinding.agentId,
    routeGeneration: state.routeBinding.routeGeneration,
  };
}

function assertRouteInput(state, input) {
  assertBoundedText(input.agentId, 'agentId', state.limits.maxIdentifierBytes, { identifier: true });
  assertSafeInteger(input.routeGeneration, 'routeGeneration', { min: 1 });
  if (input.agentId !== state.routeBinding.agentId) fail('agent_route_mismatch', 'Agent identity does not match the durable route binding');
  if (input.routeGeneration < state.routeBinding.routeGeneration) fail('stale_route_generation', 'Agent route generation is stale');
  if (input.routeGeneration !== state.routeBinding.routeGeneration) fail('route_generation_mismatch', 'Agent route generation is unsupported for this immutable route binding');
}

function emptyDispatchEvidence() {
  return {
    dispatch: 'authorized',
    transportReceipt: 'none',
    execution: 'unknown',
    cleanup: 'unknown',
  };
}

function assertDispatchEvidence(tuple, label = 'dispatch evidence') {
  exactRecord(tuple, ['dispatch', 'transportReceipt', 'execution', 'cleanup'], [], label);
  if (!DISPATCH_VALUES.has(tuple.dispatch)) fail('invalid_delivery_evidence', `${label}.dispatch is invalid`);
  if (!RECEIPT_VALUES.has(tuple.transportReceipt)) fail('invalid_delivery_evidence', `${label}.transportReceipt is invalid`);
  if (!EXECUTION_VALUES.has(tuple.execution)) fail('invalid_delivery_evidence', `${label}.execution is invalid`);
  if (!CLEANUP_VALUES.has(tuple.cleanup)) fail('invalid_delivery_evidence', `${label}.cleanup is invalid`);
  return tuple;
}

function evidenceLegality(tuple, effect) {
  if (tuple.dispatch === 'positively_not_sent' && tuple.transportReceipt === 'received') {
    return 'positively_not_sent_conflicts_with_transport_receipt';
  }
  if (tuple.dispatch === 'positively_not_sent' && ['started', 'completed'].includes(tuple.execution)) {
    return 'positively_not_sent_conflicts_with_execution';
  }
  if (tuple.execution === 'not_started' && ['started', 'completed'].includes(tuple.execution)) {
    return 'not_started_conflicts_with_execution';
  }
  if (effect === 'applied' && tuple.dispatch === 'positively_not_sent') {
    return 'positively_not_sent_conflicts_with_applied_effect';
  }
  if (effect === 'applied' && tuple.execution === 'not_started') {
    return 'not_started_conflicts_with_applied_effect';
  }
  if (tuple.cleanup === 'no_handle' && ['started', 'completed'].includes(tuple.execution)) {
    return 'no_handle_conflicts_with_execution_history';
  }
  return null;
}

function refineAxis(axis, before, after) {
  if (before === after) return true;
  if (axis === 'dispatch') return before === 'authorized' && ['sent_observed', 'positively_not_sent'].includes(after);
  if (axis === 'transportReceipt') return before === 'none' && after === 'received';
  if (axis === 'execution') {
    if (before === 'unknown') return ['not_started', 'started', 'completed'].includes(after);
    return before === 'started' && after === 'completed';
  }
  if (axis === 'cleanup') {
    if (before === 'unknown') return ['no_handle', 'held', 'cleanup_complete'].includes(after);
    return before === 'held' && after === 'cleanup_complete';
  }
  if (axis === 'effect') return before === 'unknown' && ['not_applied', 'applied'].includes(after);
  return false;
}

function normalizeEvidenceObservation(input, limits) {
  if (!isPlainRecord(input)) fail('invalid_delivery_evidence', 'Evidence observation must be a record');
  exactRecord(input, [], ['dispatch', 'transportReceipt', 'execution', 'cleanup', 'effect'], 'evidence observation');
  const result = {};
  if (Object.hasOwn(input, 'dispatch')) {
    if (!['sent_observed', 'positively_not_sent'].includes(input.dispatch)) fail('invalid_delivery_evidence', 'Invalid dispatch observation');
    result.dispatch = input.dispatch;
  }
  if (Object.hasOwn(input, 'transportReceipt')) {
    if (input.transportReceipt !== 'received') fail('invalid_delivery_evidence', 'Invalid transport receipt observation');
    result.transportReceipt = input.transportReceipt;
  }
  if (Object.hasOwn(input, 'execution')) {
    if (!EXECUTION_VALUES.has(input.execution) || input.execution === 'unknown') fail('invalid_delivery_evidence', 'Invalid execution observation');
    result.execution = input.execution;
  }
  if (Object.hasOwn(input, 'cleanup')) {
    if (!CLEANUP_VALUES.has(input.cleanup) || input.cleanup === 'unknown') fail('invalid_delivery_evidence', 'Invalid cleanup observation');
    result.cleanup = input.cleanup;
  }
  if (Object.hasOwn(input, 'effect')) {
    if (!EFFECT_VALUES.has(input.effect) || ['unknown', 'not_applicable'].includes(input.effect)) fail('invalid_delivery_evidence', 'Invalid effect observation');
    result.effect = input.effect;
  }
  if (Object.keys(result).length === 0) fail('invalid_delivery_evidence', 'Evidence observation must refine at least one axis');
  const bytes = textEncoder.encode(canonicalJson(result)).byteLength;
  if (bytes > limits.maxEvidenceBytes) fail('delivery_evidence_limit', 'Evidence observation exceeds the configured byte limit');
  return result;
}

function connectRequestContent(input) {
  const content = {
    agentId: input.agentId,
    routeGeneration: input.routeGeneration,
    expectedConnectionEpoch: input.expectedConnectionEpoch,
    connectRequestId: input.connectRequestId,
    connectionId: input.connectionId,
    executorId: input.executorId,
    executorEpoch: input.executorEpoch,
    protocolMetadataDigest: input.protocolMetadataDigest,
  };
  if (input.installableAgentTuple !== undefined && input.installableAgentTuple !== null) {
    content.installableAgentTuple = normalizeInstallableAgentDataPlaneTuple(input.installableAgentTuple);
  }
  return content;
}

export function computeAgentConnectRequestDigest(input) {
  exactRecord(input, [
    'agentId', 'routeGeneration', 'expectedConnectionEpoch', 'connectRequestId', 'connectionId',
    'executorId', 'executorEpoch', 'protocolMetadataDigest',
  ], ['installableAgentTuple'], 'connect request content');
  if (input.installableAgentTuple !== undefined && input.installableAgentTuple !== null) {
    normalizeInstallableAgentDataPlaneTuple(input.installableAgentTuple);
  }
  const content = connectRequestContent(input);
  return typedDigest(
    content.installableAgentTuple === undefined
      ? 'tdev.agent-connect-request.v1'
      : 'tdev.agent-connect-request.v2',
    content,
  );
}

function capacityRequestContent(input) {
  return {
    agentId: input.agentId,
    routeGeneration: input.routeGeneration,
    connectionId: input.connectionId,
    connectionEpoch: input.connectionEpoch,
    executorId: input.executorId,
    executorEpoch: input.executorEpoch,
    capacityRevision: input.capacityRevision,
    reportedCapacity: input.reportedCapacity,
  };
}

export function computeAgentCapacityRequestDigest(input) {
  exactRecord(input, [
    'agentId', 'routeGeneration', 'connectionId', 'connectionEpoch', 'executorId', 'executorEpoch',
    'capacityRevision', 'reportedCapacity',
  ], [], 'capacity request content');
  return typedDigest('tdev.agent-capacity-request.v1', input);
}

function reservationRequestContent(input, limits) {
  return {
    agentId: input.agentId,
    routeGeneration: input.routeGeneration,
    reservationWindowGeneration: input.reservationWindowGeneration,
    reservationRequestId: input.reservationRequestId,
    executorId: input.executorId,
    executorEpoch: input.executorEpoch,
    capacityRevision: input.capacityRevision,
    caseId: input.caseId,
    taskId: input.taskId,
    expectedCaseRevision: input.expectedCaseRevision,
    predictedAttemptOrdinal: input.predictedAttemptOrdinal,
    requestedSlots: input.requestedSlots,
    expiresAtMs: input.expiresAtMs,
    preflightDescriptor: normalizeAgentPreflightDescriptor(input.preflightDescriptor, limits),
  };
}

export function computeAgentReservationRequestDigest(input, limits = DEFAULT_LIMITS) {
  const normalizedLimits = normalizeLimits(limits);
  return typedDigest('tdev.agent-reservation-request.v1', reservationRequestContent(input, normalizedLimits));
}

function activationRequestContent(input) {
  return {
    agentId: input.agentId,
    routeGeneration: input.routeGeneration,
    activationRequestId: input.activationRequestId,
    reservationWindowGeneration: input.reservationWindowGeneration,
    reservationRequestId: input.reservationRequestId,
    reservationRequestDigest: input.reservationRequestDigest,
    slotToken: input.slotToken,
    slotGeneration: input.slotGeneration,
    deliveryId: input.deliveryId,
    caseId: input.caseId,
    taskId: input.taskId,
    attemptId: input.attemptId,
    attemptOrdinal: input.attemptOrdinal,
    executorId: input.executorId,
    executorEpoch: input.executorEpoch,
    fencingToken: input.fencingToken,
    sourceCaseRevision: input.sourceCaseRevision,
    executableBodyDigest: input.executableBodyDigest,
    executableBodyBytes: input.executableBodyBytes,
    envelopeBytes: input.envelopeBytes,
    protocolVersion: input.protocolVersion,
    effectKey: input.effectKey,
  };
}

export function computeAgentActivationRequestDigest(input) {
  return typedDigest('tdev.agent-delivery-activation-request.v1', activationRequestContent(input));
}

export function computeAgentDeliveryId(input) {
  exactRecord(input, [
    'agentId', 'routeGeneration', 'caseId', 'taskId', 'attemptId', 'executorId', 'executorEpoch', 'fencingToken',
  ], [], 'delivery identity');
  return typedDigest('tdev.agent-delivery-id.v1', input);
}

function computeDispatchGrantId(caseId, requestId, command) {
  return typedDigest('tdev.attempt-dispatch-grant.v1', { caseId, requestId, command });
}

function effectiveCapacity(state) {
  return state.capacity === null ? 0 : state.capacity.effectiveCapacity;
}

function occupiedSlots(state) {
  let total = 0;
  for (const reservation of Object.values(state.reservations)) {
    if (reservation.status === 'reserved') total += reservation.requestedSlots;
  }
  for (const delivery of Object.values(state.deliveries)) {
    if (delivery.slotHeld) total += delivery.requestedSlots;
  }
  return total;
}

function liveBodyBytes(state) {
  let total = 0;
  for (const reservation of Object.values(state.reservations)) {
    if (reservation.status === 'reserved') total += reservation.preflightDescriptor.executableBodyBytes;
  }
  for (const delivery of Object.values(state.deliveries)) {
    if (delivery.slotHeld) total += delivery.executableBodyBytes;
  }
  return total;
}

function assertCurrentConnection(state, input) {
  assertRouteInput(state, input);
  if (state.connection === null) fail('connection_unavailable', 'No current Agent connection');
  assertBoundedText(input.connectionId, 'connectionId', state.limits.maxIdentifierBytes, { identifier: true });
  assertSafeInteger(input.connectionEpoch, 'connectionEpoch', { min: 1 });
  if (input.connectionEpoch < state.lastConnectionEpoch) fail('stale_connection_fence', 'Connection epoch is stale');
  if (input.connectionEpoch !== state.connection.epoch || input.connectionId !== state.connection.id) {
    fail('stale_connection_fence', 'Connection identity is not current');
  }
  if (input.socketIncarnationId !== undefined && input.socketIncarnationId !== null) {
    assertBoundedText(input.socketIncarnationId, 'socketIncarnationId', state.limits.maxIdentifierBytes, { identifier: true });
    if (input.socketIncarnationId !== state.connection.socketIncarnationId) {
      fail('stale_connection_fence', 'Physical socket incarnation is stale');
    }
  }
}

function assertInstallableConnectionCurrent(state) {
  if (state.installableAgent.state === 'LEGACY_D0020_ONLY') return null;
  if (state.connection === null) fail('connection_unavailable', 'No current Agent connection');
  const currentTuple = installableAgentCurrentTuple(state.installableAgent, { executable: true });
  if (state.connection.installableAgentTuple === undefined || state.connection.installableAgentTuple === null ||
      canonicalJson(state.connection.installableAgentTuple) !== canonicalJson(currentTuple)) {
    fail('stale_installable_agent_fence', 'Connection is fenced to a predecessor D0027 tuple');
  }
  return currentTuple;
}

function assertCurrentExecutor(state, input) {
  if (state.executor === null) fail('executor_unavailable', 'No accepted executor tuple');
  assertBoundedText(input.executorId, 'executorId', state.limits.maxIdentifierBytes, { identifier: true });
  assertSafeInteger(input.executorEpoch, 'executorEpoch', { min: 1 });
  if (input.executorId !== state.executor.id || input.executorEpoch !== state.executor.epoch) {
    fail('stale_executor_fence', 'Executor tuple is stale');
  }
}

function normalizeSnapshot(snapshot, expectedBinding = null) {
  if (!isPlainRecord(snapshot)) fail('invalid_agent_delivery_snapshot', 'Agent delivery snapshot must be a record');
  if (snapshot.schemaVersion === 1) {
    snapshot.schemaVersion = 2;
    snapshot.deliveryTombstones = snapshot.deliveryTombstones ?? createRecord();
    if (snapshot.connection !== null && snapshot.connection.socketIncarnationId === undefined) {
      snapshot.connection.socketIncarnationId = null;
    }
    for (const delivery of Object.values(snapshot.deliveries ?? {})) {
      if (delivery.terminalCaseReceipt === undefined) delivery.terminalCaseReceipt = null;
      if (delivery.terminalAtMs === undefined) delivery.terminalAtMs = null;
    }
  }
  if (snapshot.schemaVersion === 2) {
    snapshot.schemaVersion = 3;
    snapshot.installableAgent = createLegacyInstallableAgentState();
    if (snapshot.connection !== null && snapshot.connection.installableAgentTuple === undefined) {
      snapshot.connection.installableAgentTuple = null;
    }
    for (const delivery of Object.values(snapshot.deliveries ?? {})) {
      for (const dispatch of Object.values(delivery.dispatches ?? {})) {
        if (dispatch.socketIncarnationId === undefined) dispatch.socketIncarnationId = null;
        if (dispatch.installableAgentTuple === undefined) dispatch.installableAgentTuple = null;
        if (dispatch.firstEmissionAdmission === undefined) dispatch.firstEmissionAdmission = null;
      }
    }
  }
  exactRecord(snapshot, [
    'schemaVersion', 'profile', 'routeBinding', 'routeBindingDigest', 'revision', 'lastConnectionEpoch',
    'connection', 'executor', 'capacityRevisionFloor', 'capacity', 'reservationWindowGeneration',
    'minimumAcceptedReservationWindow', 'nextSlotGeneration', 'connectReceipts', 'reservations', 'deliveries',
    'deliveryTombstones', 'installableAgent', 'limits',
  ], [], 'agent delivery snapshot');
  if (snapshot.schemaVersion !== AGENT_DELIVERY_SNAPSHOT_SCHEMA_VERSION || snapshot.profile !== AGENT_DELIVERY_PROFILE) {
    fail('unsupported_agent_delivery_snapshot', 'Unsupported Agent delivery snapshot profile/schema');
  }
  const limits = normalizeLimits(snapshot.limits);
  snapshot.limits = canonicalClone(limits);
  normalizeInstallableAgentState(snapshot.installableAgent, limits);
  const binding = normalizeAgentRouteBinding(snapshot.routeBinding, limits);
  const bindingDigest = agentRouteBindingDigest(binding, limits);
  if (snapshot.routeBindingDigest !== bindingDigest) fail('agent_route_binding_corrupt', 'Durable Agent route binding digest does not match its content');
  if (expectedBinding !== null && canonicalJson(binding) !== canonicalJson(normalizeAgentRouteBinding(expectedBinding, limits))) {
    fail('agent_route_binding_conflict', 'Runtime Agent route binding differs from the immutable durable binding');
  }
  assertSafeInteger(snapshot.revision, 'snapshot.revision', { min: 0 });
  assertSafeInteger(snapshot.lastConnectionEpoch, 'snapshot.lastConnectionEpoch', { min: 0 });
  assertSafeInteger(snapshot.capacityRevisionFloor, 'snapshot.capacityRevisionFloor', { min: 0 });
  assertSafeInteger(snapshot.reservationWindowGeneration, 'snapshot.reservationWindowGeneration', { min: 1 });
  assertSafeInteger(snapshot.minimumAcceptedReservationWindow, 'snapshot.minimumAcceptedReservationWindow', { min: 1 });
  assertSafeInteger(snapshot.nextSlotGeneration, 'snapshot.nextSlotGeneration', { min: 1 });
  if (snapshot.minimumAcceptedReservationWindow > snapshot.reservationWindowGeneration) {
    fail('invalid_agent_delivery_snapshot', 'minimumAcceptedReservationWindow cannot exceed reservationWindowGeneration');
  }
  if (snapshot.connection !== null) {
    exactRecord(snapshot.connection, [
      'id', 'epoch', 'socketIncarnationId', 'connectRequestId', 'requestDigest', 'executorId', 'executorEpoch', 'protocolMetadataDigest',
    ], ['installableAgentTuple'], 'snapshot.connection');
    if (snapshot.connection.installableAgentTuple !== undefined && snapshot.connection.installableAgentTuple !== null) {
      normalizeInstallableAgentDataPlaneTuple(snapshot.connection.installableAgentTuple);
    }
    assertBoundedText(snapshot.connection.id, 'snapshot.connection.id', limits.maxIdentifierBytes, { identifier: true });
    assertSafeInteger(snapshot.connection.epoch, 'snapshot.connection.epoch', { min: 1 });
    if (snapshot.connection.epoch !== snapshot.lastConnectionEpoch) fail('invalid_agent_delivery_snapshot', 'Current connection epoch must equal lastConnectionEpoch');
    if (snapshot.connection.socketIncarnationId !== null) {
      assertBoundedText(snapshot.connection.socketIncarnationId, 'snapshot.connection.socketIncarnationId', limits.maxIdentifierBytes, { identifier: true });
    }
    assertDigest(snapshot.connection.requestDigest, 'snapshot.connection.requestDigest');
    assertDigest(snapshot.connection.protocolMetadataDigest, 'snapshot.connection.protocolMetadataDigest');
  }
  if (snapshot.executor !== null) {
    exactRecord(snapshot.executor, ['id', 'epoch'], [], 'snapshot.executor');
    assertBoundedText(snapshot.executor.id, 'snapshot.executor.id', limits.maxIdentifierBytes, { identifier: true });
    assertSafeInteger(snapshot.executor.epoch, 'snapshot.executor.epoch', { min: 1 });
  }
  if (snapshot.connection !== null) {
    if (snapshot.executor === null || snapshot.connection.executorId !== snapshot.executor.id || snapshot.connection.executorEpoch !== snapshot.executor.epoch) {
      fail('invalid_agent_delivery_snapshot', 'Current connection and executor tuple disagree');
    }
  }
  if (snapshot.capacity !== null) {
    exactRecord(snapshot.capacity, [
      'revision', 'requestDigest', 'reportedCapacity', 'effectiveCapacity', 'connectionEpoch', 'executorId', 'executorEpoch',
    ], [], 'snapshot.capacity');
    assertSafeInteger(snapshot.capacity.revision, 'snapshot.capacity.revision', { min: 1 });
    assertDigest(snapshot.capacity.requestDigest, 'snapshot.capacity.requestDigest');
    assertSafeInteger(snapshot.capacity.reportedCapacity, 'snapshot.capacity.reportedCapacity', { min: 0 });
    assertSafeInteger(snapshot.capacity.effectiveCapacity, 'snapshot.capacity.effectiveCapacity', { min: 0, max: limits.maxAgentCapacity });
    if (snapshot.capacity.revision !== snapshot.capacityRevisionFloor) fail('invalid_agent_delivery_snapshot', 'Capacity revision/floor mismatch');
    if (snapshot.capacity.effectiveCapacity !== Math.min(snapshot.capacity.reportedCapacity, limits.maxAgentCapacity)) {
      fail('invalid_agent_delivery_snapshot', 'Effective capacity does not match the configured deployment ceiling');
    }
  }
  if (!isPlainRecord(snapshot.connectReceipts) || Object.keys(snapshot.connectReceipts).length > limits.maxConnectReceipts) {
    fail('invalid_agent_delivery_snapshot', 'Connect receipt state is invalid or unbounded');
  }
  if (!isPlainRecord(snapshot.reservations) || Object.keys(snapshot.reservations).length > limits.maxReservations) {
    fail('invalid_agent_delivery_snapshot', 'Reservation state is invalid or unbounded');
  }
  if (!isPlainRecord(snapshot.deliveries) || Object.keys(snapshot.deliveries).length > limits.maxDeliveries) {
    fail('invalid_agent_delivery_snapshot', 'Delivery state is invalid or unbounded');
  }
  if (!isPlainRecord(snapshot.deliveryTombstones) || Object.keys(snapshot.deliveryTombstones).length > limits.maxDeliveryTombstones) {
    fail('invalid_agent_delivery_snapshot', 'Delivery tombstone state is invalid or unbounded');
  }
  for (const [requestId, reservation] of Object.entries(snapshot.reservations)) {
    assertBoundedText(requestId, 'reservation request id', limits.maxIdentifierBytes, { identifier: true });
    exactRecord(reservation, [
      'reservationRequestId', 'reservationRequestDigest', 'windowGeneration', 'executorId', 'executorEpoch',
      'capacityRevision', 'caseId', 'taskId', 'expectedCaseRevision', 'predictedAttemptOrdinal', 'requestedSlots',
      'expiresAtMs', 'preflightDescriptor', 'preflightDescriptorDigest', 'slotToken', 'slotGeneration', 'status', 'terminalAtMs',
    ], [], `reservation ${requestId}`);
    if (reservation.reservationRequestId !== requestId || reservation.windowGeneration !== snapshot.reservationWindowGeneration) {
      fail('invalid_agent_delivery_snapshot', 'Reservation identity/window mismatch');
    }
    assertDigest(reservation.reservationRequestDigest, 'reservation.reservationRequestDigest');
    assertDigest(reservation.preflightDescriptorDigest, 'reservation.preflightDescriptorDigest');
    assertDigest(reservation.slotToken, 'reservation.slotToken');
    const normalizedPreflight = normalizeAgentPreflightDescriptor(reservation.preflightDescriptor, limits);
    if (reservation.preflightDescriptorDigest !== agentPreflightDescriptorDigest(normalizedPreflight, limits)) {
      fail('invalid_agent_delivery_snapshot', 'Reservation preflight descriptor digest mismatch');
    }
    for (const field of ['executorId', 'caseId', 'taskId']) {
      assertBoundedText(reservation[field], `reservation.${field}`, limits.maxIdentifierBytes, { identifier: true });
    }
    assertSafeInteger(reservation.executorEpoch, 'reservation.executorEpoch', { min: 1 });
    assertSafeInteger(reservation.capacityRevision, 'reservation.capacityRevision', { min: 1 });
    assertSafeInteger(reservation.expectedCaseRevision, 'reservation.expectedCaseRevision', { min: 0 });
    assertSafeInteger(reservation.predictedAttemptOrdinal, 'reservation.predictedAttemptOrdinal', { min: 1 });
    assertSafeInteger(reservation.requestedSlots, 'reservation.requestedSlots', { min: 1, max: limits.maxSlotsPerReservation });
    assertSafeInteger(reservation.expiresAtMs, 'reservation.expiresAtMs', { min: 1 });
    assertSafeInteger(reservation.slotGeneration, 'reservation.slotGeneration', { min: 1 });
    if (!['reserved', 'activated', 'released', 'expired'].includes(reservation.status)) fail('invalid_agent_delivery_snapshot', 'Invalid reservation status');
    if (reservation.terminalAtMs !== null) assertSafeInteger(reservation.terminalAtMs, 'reservation.terminalAtMs', { min: 0 });
  }
  for (const [deliveryId, delivery] of Object.entries(snapshot.deliveries)) {
    assertDigest(deliveryId, 'delivery id');
    exactRecord(delivery, [
      'deliveryId', 'activationRequestId', 'activationRequestDigest', 'activationReceiptId', 'activationDigest',
      'routeGeneration', 'reservationWindowGeneration', 'reservationRequestId', 'reservationRequestDigest',
      'slotToken', 'slotGeneration', 'preflightDescriptorDigest', 'executableBodyDigest', 'executableBodyBytes',
      'envelopeBytes', 'protocolVersion', 'requestedSlots', 'caseId', 'taskId', 'attemptId', 'attemptOrdinal',
      'reservationExpectedCaseRevision', 'sourceCaseRevision', 'executorId', 'executorEpoch', 'fencingToken',
      'effectKey', 'effect', 'dispatches', 'localEvidenceRevision',
      'lastEvidenceDigest', 'lastEvidenceOrdinal', 'evidenceConflict', 'slotHeld', 'slotKind', 'closedUndispatched',
      'terminalCaseReceipt', 'terminalAtMs',
    ], [], `delivery ${deliveryId}`);
    if (delivery.deliveryId !== deliveryId) fail('invalid_agent_delivery_snapshot', 'Delivery map identity mismatch');
    for (const field of ['activationRequestDigest', 'activationReceiptId', 'activationDigest', 'reservationRequestDigest', 'slotToken', 'preflightDescriptorDigest', 'executableBodyDigest', 'fencingToken']) {
      assertDigest(delivery[field], `delivery.${field}`);
    }
    if (delivery.effectKey !== null) assertDigest(delivery.effectKey, 'delivery.effectKey');
    for (const field of ['activationRequestId', 'reservationRequestId', 'caseId', 'taskId', 'attemptId', 'executorId']) {
      assertBoundedText(delivery[field], `delivery.${field}`, limits.maxIdentifierBytes, { identifier: true });
    }
    assertBoundedText(delivery.protocolVersion, 'delivery.protocolVersion', limits.maxProtocolMetadataBytes, { identifier: true });
    for (const field of ['routeGeneration', 'reservationWindowGeneration', 'slotGeneration', 'attemptOrdinal', 'executorEpoch']) {
      assertSafeInteger(delivery[field], `delivery.${field}`, { min: 1 });
    }
    assertSafeInteger(delivery.reservationExpectedCaseRevision, 'delivery.reservationExpectedCaseRevision', { min: 0 });
    assertSafeInteger(delivery.sourceCaseRevision, 'delivery.sourceCaseRevision', { min: 0 });
    if (delivery.sourceCaseRevision <= delivery.reservationExpectedCaseRevision) {
      fail('invalid_agent_delivery_snapshot', 'Delivery Case revision did not advance beyond its reservation predecessor');
    }
    if (delivery.attemptId !== `${delivery.taskId}.${delivery.attemptOrdinal}`) {
      fail('invalid_agent_delivery_snapshot', 'Delivery Attempt identity/ordinal mismatch');
    }
    if (delivery.routeGeneration !== binding.routeGeneration) fail('invalid_agent_delivery_snapshot', 'Delivery route generation mismatch');
    assertSafeInteger(delivery.executableBodyBytes, 'delivery.executableBodyBytes', { min: 0, max: limits.maxExecutableBodyBytes });
    assertSafeInteger(delivery.envelopeBytes, 'delivery.envelopeBytes', { min: delivery.executableBodyBytes, max: limits.maxEnvelopeBytes });
    assertSafeInteger(delivery.requestedSlots, 'delivery.requestedSlots', { min: 1, max: limits.maxSlotsPerReservation });
    if (!EFFECT_VALUES.has(delivery.effect)) fail('invalid_agent_delivery_snapshot', 'Invalid delivery effect disposition');
    if (!isPlainRecord(delivery.dispatches) || Object.keys(delivery.dispatches).length > limits.maxDispatchOrdinalsPerDelivery) {
      fail('invalid_agent_delivery_snapshot', 'Delivery dispatch ordinal state is invalid or unbounded');
    }
    for (const [ordinalKey, dispatch] of Object.entries(delivery.dispatches)) {
      const ordinal = Number(ordinalKey);
      assertSafeInteger(ordinal, 'dispatch ordinal key', { min: 1, max: limits.maxDispatchOrdinalsPerDelivery });
      exactRecord(dispatch, [
        'dispatchOrdinal', 'dispatchGrantId', 'grantRequestId', 'authorizationId', 'committedCaseRevision', 'event',
        'connectionId', 'connectionEpoch', 'executorId', 'executorEpoch', 'firstSendClaim', 'evidence',
      ], ['socketIncarnationId', 'installableAgentTuple', 'firstEmissionAdmission'], `delivery ${deliveryId} dispatch ${ordinal}`);
      if (dispatch.socketIncarnationId !== undefined && dispatch.socketIncarnationId !== null) {
        assertBoundedText(dispatch.socketIncarnationId, 'dispatch.socketIncarnationId', limits.maxIdentifierBytes, { identifier: true });
      }
      if (dispatch.installableAgentTuple !== undefined && dispatch.installableAgentTuple !== null) {
        normalizeInstallableAgentDataPlaneTuple(dispatch.installableAgentTuple);
      }
      if (dispatch.firstEmissionAdmission !== undefined && dispatch.firstEmissionAdmission !== null) {
        exactRecord(dispatch.firstEmissionAdmission, ['admissionId', 'authorizationId', 'tupleDigest'], [], 'dispatch.firstEmissionAdmission');
        assertDigest(dispatch.firstEmissionAdmission.admissionId, 'dispatch.firstEmissionAdmission.admissionId');
        assertDigest(dispatch.firstEmissionAdmission.authorizationId, 'dispatch.firstEmissionAdmission.authorizationId');
        assertDigest(dispatch.firstEmissionAdmission.tupleDigest, 'dispatch.firstEmissionAdmission.tupleDigest');
        if (dispatch.firstEmissionAdmission.authorizationId !== dispatch.authorizationId) fail('invalid_agent_delivery_snapshot', 'First-emission admission authorization mismatch');
      }
      if (dispatch.dispatchOrdinal !== ordinal) fail('invalid_agent_delivery_snapshot', 'Dispatch ordinal map identity mismatch');
      for (const field of ['dispatchGrantId', 'authorizationId']) assertDigest(dispatch[field], `dispatch.${field}`);
      for (const field of ['grantRequestId', 'connectionId', 'executorId']) {
        assertBoundedText(dispatch[field], `dispatch.${field}`, limits.maxIdentifierBytes, { identifier: true });
      }
      for (const field of ['committedCaseRevision', 'connectionEpoch', 'executorEpoch']) {
        assertSafeInteger(dispatch[field], `dispatch.${field}`, { min: 1 });
      }
      exactRecord(dispatch.event, ['sequence', 'caseRevision', 'eventDigest'], [], 'dispatch.event');
      assertSafeInteger(dispatch.event.sequence, 'dispatch.event.sequence', { min: 1 });
      assertSafeInteger(dispatch.event.caseRevision, 'dispatch.event.caseRevision', { min: 1 });
      assertDigest(dispatch.event.eventDigest, 'dispatch.event.eventDigest');
      if (dispatch.event.caseRevision !== dispatch.committedCaseRevision) fail('invalid_agent_delivery_snapshot', 'Dispatch event/Case revision mismatch');
      if (dispatch.firstSendClaim !== null) {
        exactRecord(dispatch.firstSendClaim, ['claimId', 'authorizationId'], [], 'dispatch.firstSendClaim');
        assertDigest(dispatch.firstSendClaim.claimId, 'dispatch.firstSendClaim.claimId');
        assertDigest(dispatch.firstSendClaim.authorizationId, 'dispatch.firstSendClaim.authorizationId');
        if (dispatch.firstSendClaim.authorizationId !== dispatch.authorizationId) fail('invalid_agent_delivery_snapshot', 'First-send claim authorization mismatch');
      }
      assertDispatchEvidence(dispatch.evidence, `delivery ${deliveryId} dispatch ${ordinal}.evidence`);
    }
    assertSafeInteger(delivery.localEvidenceRevision, 'delivery.localEvidenceRevision', { min: 0 });
    if (delivery.lastEvidenceDigest !== null) assertDigest(delivery.lastEvidenceDigest, 'delivery.lastEvidenceDigest');
    if (delivery.lastEvidenceOrdinal !== null) assertSafeInteger(delivery.lastEvidenceOrdinal, 'delivery.lastEvidenceOrdinal', { min: 1 });
    if (typeof delivery.slotHeld !== 'boolean' || typeof delivery.closedUndispatched !== 'boolean') fail('invalid_agent_delivery_snapshot', 'Delivery booleans are invalid');
    if (!['none', 'admission', 'physical'].includes(delivery.slotKind)) fail('invalid_agent_delivery_snapshot', 'Invalid slot kind');
    if (delivery.slotHeld !== (delivery.slotKind !== 'none')) fail('invalid_agent_delivery_snapshot', 'slotHeld and slotKind disagree');
    if (delivery.terminalCaseReceipt !== null && delivery.terminalCaseReceipt !== undefined) {
      exactRecord(delivery.terminalCaseReceipt, [
        'caseId', 'taskId', 'attemptId', 'fencingToken', 'requestId', 'commandDigest', 'responseDigest',
        'committedCaseRevision', 'terminalStatus',
      ], [], 'delivery.terminalCaseReceipt');
      for (const field of ['caseId', 'taskId', 'attemptId', 'requestId']) {
        assertBoundedText(delivery.terminalCaseReceipt[field], `delivery.terminalCaseReceipt.${field}`, limits.maxIdentifierBytes, { identifier: true });
      }
      for (const field of ['fencingToken', 'commandDigest', 'responseDigest']) {
        assertDigest(delivery.terminalCaseReceipt[field], `delivery.terminalCaseReceipt.${field}`);
      }
      assertSafeInteger(delivery.terminalCaseReceipt.committedCaseRevision, 'delivery.terminalCaseReceipt.committedCaseRevision', { min: 1 });
      if (delivery.terminalCaseReceipt.committedCaseRevision <= delivery.sourceCaseRevision) {
        fail('invalid_agent_delivery_snapshot', 'Terminal Case receipt must postdate delivery activation');
      }
      if (!['succeeded', 'not_applied', 'cancelled', 'failed', 'unverified'].includes(delivery.terminalCaseReceipt.terminalStatus)) {
        fail('invalid_agent_delivery_snapshot', 'Invalid terminal Case receipt status');
      }
    }
    if (delivery.terminalAtMs !== null && delivery.terminalAtMs !== undefined) {
      assertSafeInteger(delivery.terminalAtMs, 'delivery.terminalAtMs', { min: 0 });
    }
  }
  for (const [deliveryId, tombstone] of Object.entries(snapshot.deliveryTombstones)) {
    assertDigest(deliveryId, 'delivery tombstone id');
    exactRecord(tombstone, [
      'deliveryId', 'activationRequestId', 'activationRequestDigest', 'activationReceiptId', 'activationDigest',
      'routeGeneration', 'reservationWindowGeneration', 'reservationRequestId', 'reservationRequestDigest',
      'slotToken', 'slotGeneration', 'preflightDescriptorDigest', 'caseId', 'taskId', 'attemptId', 'attemptOrdinal',
      'sourceCaseRevision', 'executorId', 'executorEpoch', 'fencingToken', 'retirementReason', 'terminalCaseReceipt', 'terminalAtMs',
      'finalLocalEvidenceRevision', 'finalEvidenceDigest', 'finalDispatchesCount', 'receipt',
    ], [], `delivery tombstone ${deliveryId}`);
    if (tombstone.deliveryId !== deliveryId) fail('invalid_agent_delivery_snapshot', 'Delivery tombstone map identity mismatch');
    for (const field of ['activationRequestDigest', 'activationReceiptId', 'activationDigest', 'reservationRequestDigest', 'slotToken', 'preflightDescriptorDigest', 'fencingToken']) {
      assertDigest(tombstone[field], `tombstone.${field}`);
    }
    for (const field of ['activationRequestId', 'reservationRequestId', 'caseId', 'taskId', 'attemptId', 'executorId']) {
      assertBoundedText(tombstone[field], `tombstone.${field}`, limits.maxIdentifierBytes, { identifier: true });
    }
    for (const field of ['routeGeneration', 'reservationWindowGeneration', 'slotGeneration', 'attemptOrdinal', 'executorEpoch']) {
      assertSafeInteger(tombstone[field], `tombstone.${field}`, { min: 1 });
    }
    assertSafeInteger(tombstone.sourceCaseRevision, 'tombstone.sourceCaseRevision', { min: 0 });
    if (!['closed_undispatched', 'case_terminal_receipt'].includes(tombstone.retirementReason)) {
      fail('invalid_agent_delivery_snapshot', 'Invalid delivery tombstone retirement reason');
    }
    if (tombstone.terminalCaseReceipt !== null) {
      exactRecord(tombstone.terminalCaseReceipt, [
        'caseId', 'taskId', 'attemptId', 'fencingToken', 'requestId', 'commandDigest', 'responseDigest',
        'committedCaseRevision', 'terminalStatus',
      ], [], 'tombstone.terminalCaseReceipt');
      for (const field of ['caseId', 'taskId', 'attemptId', 'requestId']) {
        assertBoundedText(tombstone.terminalCaseReceipt[field], `tombstone.terminalCaseReceipt.${field}`, limits.maxIdentifierBytes, { identifier: true });
      }
      for (const field of ['fencingToken', 'commandDigest', 'responseDigest']) {
        assertDigest(tombstone.terminalCaseReceipt[field], `tombstone.terminalCaseReceipt.${field}`);
      }
      assertSafeInteger(tombstone.terminalCaseReceipt.committedCaseRevision, 'tombstone.terminalCaseReceipt.committedCaseRevision', { min: 1 });
      if (tombstone.terminalCaseReceipt.committedCaseRevision <= tombstone.sourceCaseRevision) {
        fail('invalid_agent_delivery_snapshot', 'Terminal Case receipt must postdate delivery activation');
      }
      if (!['succeeded', 'not_applied', 'cancelled', 'failed', 'unverified'].includes(tombstone.terminalCaseReceipt.terminalStatus)) {
        fail('invalid_agent_delivery_snapshot', 'Invalid terminal Case receipt status');
      }
    }
    assertSafeInteger(tombstone.terminalAtMs, 'tombstone.terminalAtMs', { min: 0 });
    assertSafeInteger(tombstone.finalLocalEvidenceRevision, 'tombstone.finalLocalEvidenceRevision', { min: 0 });
    if (tombstone.finalEvidenceDigest !== null) assertDigest(tombstone.finalEvidenceDigest, 'tombstone.finalEvidenceDigest');
    assertSafeInteger(tombstone.finalDispatchesCount, 'tombstone.finalDispatchesCount', { min: 0 });
    exactRecord(tombstone.receipt, ['deliveryId', 'activationReceiptId', 'activationDigest', 'status', 'retirementReason'], [], 'tombstone.receipt');
  }
  return snapshot;
}

function initialSnapshot(binding, input = {}) {
  if (!isPlainRecord(input)) fail('invalid_agent_delivery_initialization', 'Initialization input must be a record');
  exactRecord(input, [], ['reservationWindowGeneration', 'limits'], 'agent delivery initialization');
  const limits = normalizeLimits(input.limits);
  const routeBinding = normalizeAgentRouteBinding(binding, limits);
  const reservationWindowGeneration = input.reservationWindowGeneration ?? 1;
  assertSafeInteger(reservationWindowGeneration, 'reservationWindowGeneration', { min: 1 });
  return {
    schemaVersion: AGENT_DELIVERY_SNAPSHOT_SCHEMA_VERSION,
    profile: AGENT_DELIVERY_PROFILE,
    routeBinding,
    routeBindingDigest: agentRouteBindingDigest(routeBinding, limits),
    revision: 0,
    lastConnectionEpoch: 0,
    connection: null,
    executor: null,
    capacityRevisionFloor: 0,
    capacity: null,
    reservationWindowGeneration,
    minimumAcceptedReservationWindow: reservationWindowGeneration,
    nextSlotGeneration: 1,
    connectReceipts: createRecord(),
    reservations: createRecord(),
    deliveries: createRecord(),
    deliveryTombstones: createRecord(),
    installableAgent: createLegacyInstallableAgentState(),
    limits,
  };
}

function normalizeTerminalCaseReceipt(delivery, command, caseReceipt, limits) {
  if (!isPlainRecord(command)) fail('invalid_case_terminal_receipt', 'Terminal Case command must be a record');
  if (!isPlainRecord(caseReceipt)) fail('invalid_case_terminal_receipt', 'Terminal Case receipt must be a record');
  exactRecord(caseReceipt, ['requestId', 'commandDigest', 'response', 'responseDigest', 'committedRevision'], [], 'Case terminal receipt');
  assertBoundedText(caseReceipt.requestId, 'caseReceipt.requestId', limits.maxIdentifierBytes, { identifier: true });
  assertDigest(caseReceipt.commandDigest, 'caseReceipt.commandDigest');
  assertDigest(caseReceipt.responseDigest, 'caseReceipt.responseDigest');
  assertSafeInteger(caseReceipt.committedRevision, 'caseReceipt.committedRevision', { min: 1 });
  const expectedCommandDigest = typedDigest('tdev.case-command.v1', canonicalClone(command));
  if (caseReceipt.commandDigest !== expectedCommandDigest) {
    fail('case_terminal_receipt_mismatch', 'Case terminal receipt does not bind the supplied command');
  }
  if (caseReceipt.responseDigest !== digest(caseReceipt.response)) {
    fail('case_terminal_receipt_mismatch', 'Case terminal receipt response digest is invalid');
  }
  if (caseReceipt.committedRevision <= delivery.sourceCaseRevision) {
    fail('case_terminal_receipt_stale', 'Case terminal receipt does not postdate delivery activation');
  }

  let terminalStatus;
  if (command.type === 'accept_result') {
    exactRecord(command, ['type', 'envelope'], [], 'terminal accept_result command');
    const envelope = command.envelope;
    exactRecord(envelope, [
      'caseId', 'planRevisionId', 'planDigest', 'taskId', 'attemptId', 'executorId', 'executorEpoch', 'fencingToken',
      'claimLeaseToken', 'claimLeaseGeneration', 'claimLeaseClaimsDigest', 'result',
    ], [], 'terminal accept_result envelope');
    if (envelope.caseId !== delivery.caseId || envelope.taskId !== delivery.taskId || envelope.attemptId !== delivery.attemptId ||
        envelope.executorId !== delivery.executorId || envelope.executorEpoch !== delivery.executorEpoch ||
        envelope.fencingToken !== delivery.fencingToken) {
      fail('case_terminal_receipt_mismatch', 'Case terminal result does not bind the exact delivery Attempt fence');
    }
    terminalStatus = 'succeeded';
  } else if (command.type === 'resolve_reconciliation') {
    exactRecord(command, ['type', 'attemptId', 'decision'], [], 'terminal reconciliation command');
    if (command.attemptId !== delivery.attemptId) {
      fail('case_terminal_receipt_mismatch', 'Case reconciliation does not bind the exact delivery Attempt');
    }
    if (!isPlainRecord(command.decision) || !['succeeded', 'not_applied', 'cancelled', 'failed', 'unverified'].includes(command.decision.outcome)) {
      fail('case_terminal_receipt_not_terminal', 'Case reconciliation outcome is not a supported terminal disposition');
    }
    terminalStatus = command.decision.outcome;
  } else {
    fail('case_terminal_receipt_not_terminal', 'Only terminal Case result/reconciliation receipts may retire a dispatched delivery');
  }

  return {
    caseId: delivery.caseId,
    taskId: delivery.taskId,
    attemptId: delivery.attemptId,
    fencingToken: delivery.fencingToken,
    requestId: caseReceipt.requestId,
    commandDigest: caseReceipt.commandDigest,
    responseDigest: caseReceipt.responseDigest,
    committedCaseRevision: caseReceipt.committedRevision,
    terminalStatus,
  };
}

function compactState(state, nowMs) {
  if (nowMs !== undefined && nowMs !== null) {
    for (const [deliveryId, tombstone] of Object.entries(state.deliveryTombstones)) {
      if (tombstone.reservationWindowGeneration < state.minimumAcceptedReservationWindow &&
          tombstone.terminalAtMs !== null &&
          nowMs - tombstone.terminalAtMs >= state.limits.deliveryReplayGraceMs) {
        delete state.deliveryTombstones[deliveryId];
      }
    }
  }
  for (const [deliveryId, delivery] of Object.entries(state.deliveries)) {
    if (delivery.slotHeld) continue;
    const isUndispatched = delivery.closedUndispatched;
    const hasTerminalReceipt = delivery.terminalCaseReceipt !== null && delivery.terminalCaseReceipt !== undefined;
    if (!isUndispatched && !hasTerminalReceipt) continue;

    if (Object.keys(state.deliveryTombstones).length >= state.limits.maxDeliveryTombstones) {
      break;
    }

    const terminalAtMs = delivery.terminalAtMs ?? (nowMs ?? Date.now());
    const retirementReason = isUndispatched ? 'closed_undispatched' : 'case_terminal_receipt';
    const tombstone = {
      deliveryId: delivery.deliveryId,
      activationRequestId: delivery.activationRequestId,
      activationRequestDigest: delivery.activationRequestDigest,
      activationReceiptId: delivery.activationReceiptId,
      activationDigest: delivery.activationDigest,
      routeGeneration: delivery.routeGeneration,
      reservationWindowGeneration: delivery.reservationWindowGeneration,
      reservationRequestId: delivery.reservationRequestId,
      reservationRequestDigest: delivery.reservationRequestDigest,
      slotToken: delivery.slotToken,
      slotGeneration: delivery.slotGeneration,
      preflightDescriptorDigest: delivery.preflightDescriptorDigest,
      caseId: delivery.caseId,
      taskId: delivery.taskId,
      attemptId: delivery.attemptId,
      attemptOrdinal: delivery.attemptOrdinal,
      sourceCaseRevision: delivery.sourceCaseRevision,
      executorId: delivery.executorId,
      executorEpoch: delivery.executorEpoch,
      fencingToken: delivery.fencingToken,
      retirementReason,
      terminalCaseReceipt: delivery.terminalCaseReceipt ?? null,
      terminalAtMs,
      finalLocalEvidenceRevision: delivery.localEvidenceRevision,
      finalEvidenceDigest: delivery.lastEvidenceDigest,
      finalDispatchesCount: Object.keys(delivery.dispatches).length,
      receipt: {
        deliveryId: delivery.deliveryId,
        activationReceiptId: delivery.activationReceiptId,
        activationDigest: delivery.activationDigest,
        status: 'retired',
        retirementReason,
      },
    };
    state.deliveryTombstones[deliveryId] = tombstone;
    delete state.deliveries[deliveryId];
  }
}

function pruneConnectReceipts(state) {
  const entries = Object.entries(state.connectReceipts);
  if (entries.length <= state.limits.maxConnectReceipts) return;
  entries.sort((a, b) => a[1].connectionEpoch - b[1].connectionEpoch);
  for (const [requestId, receipt] of entries) {
    if (Object.keys(state.connectReceipts).length <= state.limits.maxConnectReceipts) break;
    if (receipt.connectionEpoch === state.lastConnectionEpoch) continue;
    delete state.connectReceipts[requestId];
  }
}

function lastDispatch(delivery) {
  const ordinals = Object.keys(delivery.dispatches).map(Number).sort((a, b) => a - b);
  return ordinals.length === 0 ? null : delivery.dispatches[String(ordinals[ordinals.length - 1])];
}

function safeNegativeReplay(dispatch) {
  return dispatch !== null &&
    dispatch.evidence.dispatch === 'positively_not_sent' &&
    dispatch.evidence.execution === 'not_started' &&
    dispatch.evidence.cleanup === 'no_handle';
}

function nextInstallableGeneration(installableAgent, highWaterField, label) {
  const current = installableAgent[highWaterField];
  assertSafeInteger(current, highWaterField, { min: 0 });
  if (current === Number.MAX_SAFE_INTEGER) fail('installable_agent_generation_overflow', `${label} cannot advance safely`);
  const next = current + 1;
  installableAgent[highWaterField] = next;
  return next;
}

function requireInstallableCurrent(state, { executable = false } = {}) {
  if (state.installableAgent.state !== 'CURRENT' || state.installableAgent.current === null) {
    fail('installable_agent_not_current', 'D0027 current authority is required');
  }
  if (executable) installableAgentCurrentTuple(state.installableAgent, { executable: true });
  return state.installableAgent.current;
}

function requireNoManagementTransaction(current) {
  if (current.managementTransaction !== null) {
    fail('management_transaction_in_progress', 'A D0027 management transaction is already nonterminal');
  }
}

function d0027TransitionReceipt(operation, state, fields) {
  return typedDigest('tdev.installable-agent-transition-receipt.v1', {
    operation,
    agentId: state.routeBinding.agentId,
    routeGeneration: state.routeBinding.routeGeneration,
    ...canonicalClone(fields),
  });
}

function legacyHeldPredecessors(state) {
  const locators = [];
  for (const delivery of Object.values(state.deliveries)) {
    if (!delivery.slotHeld) continue;
    locators.push({
      deliveryId: delivery.deliveryId,
      executorId: delivery.executorId,
      executorEpoch: delivery.executorEpoch,
      evidenceRevision: delivery.localEvidenceRevision,
      evidenceDigest: delivery.lastEvidenceDigest,
      resolved: false,
    });
  }
  locators.sort((left, right) => left.deliveryId.localeCompare(right.deliveryId));
  return locators;
}

function managementResult(classification, result) {
  return deepFreeze({ classification, ...canonicalClone(result) });
}

function transactionReadinessKey(type) {
  const keys = {
    verifier_ready: 'verifierReady',
    local_ready: 'localReady',
    package_verified: 'packageVerified',
    local_service_ready: 'localServiceReady',
    positive_quiescence: 'positiveQuiescence',
    service_stopped: 'serviceStopped',
    clone_safe_activation: 'cloneSafeActivation',
  };
  return keys[type] ?? null;
}

export class MemoryAgentDeliveryStore {
  constructor() {
    this.snapshots = new Map();
  }

  load(agentId) {
    const value = this.snapshots.get(agentId);
    return value === undefined ? null : canonicalClone(value);
  }

  compareAndSwap(agentId, expectedRevision, nextSnapshot) {
    const current = this.snapshots.get(agentId);
    const actualRevision = current === undefined ? null : current.revision;
    if (actualRevision !== expectedRevision) {
      fail('agent_delivery_revision_conflict', 'Agent delivery store revision changed', { expectedRevision, actualRevision });
    }
    this.snapshots.set(agentId, canonicalClone(nextSnapshot));
    return true;
  }
}

export class AgentDeliveryAuthority {
  constructor({ store, routeBinding, verifyManagementProof = null, verifyInstallableAgentEvidence = null }) {
    if (!store || typeof store.load !== 'function' || typeof store.compareAndSwap !== 'function') {
      fail('invalid_agent_delivery_store', 'Agent delivery store must expose load() and compareAndSwap()');
    }
    if (!isPlainRecord(routeBinding)) fail('invalid_agent_route_binding', 'AgentDeliveryAuthority requires an exact routeBinding');
    this.store = store;
    this.routeBinding = canonicalClone(routeBinding);
    this.agentId = routeBinding.agentId;
    this.verifyManagementProof = verifyManagementProof;
    this.verifyInstallableAgentEvidence = verifyInstallableAgentEvidence;
    if (verifyManagementProof !== null && typeof verifyManagementProof !== 'function') fail('invalid_management_verifier', 'verifyManagementProof must be a function');
    if (verifyInstallableAgentEvidence !== null && typeof verifyInstallableAgentEvidence !== 'function') fail('invalid_installable_agent_evidence_verifier', 'verifyInstallableAgentEvidence must be a function');
    assertIdentifier(this.agentId, 'routeBinding.agentId');
  }

  initialize(input = {}) {
    const existing = this.store.load(this.agentId);
    if (existing !== null) {
      normalizeSnapshot(existing, this.routeBinding);
      return deepFreeze({ deduplicated: true, snapshot: canonicalClone(existing) });
    }
    const snapshot = initialSnapshot(this.routeBinding, input);
    this.store.compareAndSwap(this.agentId, null, snapshot);
    return deepFreeze({ deduplicated: false, snapshot: canonicalClone(snapshot) });
  }

  read() {
    const snapshot = this.store.load(this.agentId);
    if (snapshot === null) fail('agent_delivery_not_initialized', 'Agent delivery authority is not initialized');
    normalizeSnapshot(snapshot, this.routeBinding);
    return deepFreeze(canonicalClone(snapshot));
  }

  #mutate(mutator) {
    const current = this.read();
    const mutable = canonicalClone(current);
    const outcome = mutator(mutable);
    if (!isPlainRecord(outcome) || typeof outcome.changed !== 'boolean') fail('invalid_agent_delivery_mutation', 'Mutation must return changed/result');
    if (!outcome.changed) return deepFreeze(canonicalClone(outcome.result));
    mutable.revision = current.revision + 1;
    normalizeSnapshot(mutable, this.routeBinding);
    this.store.compareAndSwap(this.agentId, current.revision, mutable);
    return deepFreeze(canonicalClone(outcome.result));
  }

  #verifyManagement(operation, state, input, intentContent = null) {
    if (this.verifyManagementProof === null) {
      fail('management_authentication_unavailable', 'D0027 management verifier is not configured');
    }
    assertBoundedText(input.managementRequestId, 'managementRequestId', state.limits.maxIdentifierBytes);
    assertDigest(input.intentDigest, 'intentDigest');
    assertDigest(input.expectedPredecessorDigest, 'expectedPredecessorDigest');
    if (!Object.hasOwn(input, 'managementProof')) fail('management_authentication_failed', 'Management proof is required');
    if (intentContent !== null) {
      const expectedIntentDigest = computeInstallableAgentManagementIntentDigest(operation, state.routeBinding, intentContent);
      if (input.intentDigest !== expectedIntentDigest) fail('management_intent_digest_mismatch', 'Management intent digest does not match canonical content');
    }
    const context = managementProofContext(operation, state.routeBinding, input, input.expectedPredecessorDigest);
    let accepted = false;
    try {
      accepted = this.verifyManagementProof(input.managementProof, context) === true;
    } catch {
      accepted = false;
    }
    if (!accepted) fail('management_authentication_failed', 'Independent D0027 management proof was denied');
  }

  #verifyInstallableEvidence(type, state, input, details) {
    if (this.verifyInstallableAgentEvidence === null) {
      fail('installable_agent_evidence_authentication_unavailable', 'D0027 evidence verifier is not configured');
    }
    assertDigest(input.evidenceDigest, 'evidenceDigest');
    if (!Object.hasOwn(input, 'evidenceProof')) fail('installable_agent_evidence_authentication_failed', 'Installable Agent evidence proof is required');
    const context = evidenceProofContext(type, state.routeBinding, { ...details, evidenceDigest: input.evidenceDigest });
    let accepted = false;
    try {
      accepted = this.verifyInstallableAgentEvidence(input.evidenceProof, context) === true;
    } catch {
      accepted = false;
    }
    if (!accepted) fail('installable_agent_evidence_authentication_failed', 'Installable Agent evidence proof was denied');
  }

  #existingManagementReceipt(state, input, operation) {
    const receipt = state.installableAgent.managementReceipts[input.managementRequestId];
    if (!receipt) fail('unknown_management_request', 'Management request receipt does not exist');
    if (receipt.operation !== operation || receipt.intentDigest !== input.intentDigest || receipt.predecessorDigest !== input.expectedPredecessorDigest) {
      fail('management_request_conflict', 'Management request identity was reused with changed operation, intent or predecessor');
    }
    return receipt;
  }

  readInstallableAgent() {
    const state = this.read();
    return deepFreeze({
      installableAgent: canonicalClone(state.installableAgent),
      predecessorDigest: installableAgentPredecessorDigest(state.installableAgent),
      currentTuple: installableAgentCurrentTuple(state.installableAgent, { executable: false }),
      currentTupleDigest: currentTupleDigest(state.installableAgent),
    });
  }

  migrateInstallableAgentRoute(input) {
    exactRecord(input, ['migrationProfile'], [], 'D0027 legacy route migration');
    if (input.migrationProfile !== 'tdev.d0020-only-to-d0027-unregistered.v1') {
      fail('unsupported_installable_agent_migration', 'Unsupported D0027 route migration profile');
    }
    return this.#mutate((state) => {
      if (state.installableAgent.state !== 'LEGACY_D0020_ONLY') {
        fail('installable_agent_migration_conflict', 'Only an explicit D0020-only predecessor can migrate to D0027 UNREGISTERED');
      }
      state.installableAgent = createUnregisteredInstallableAgentState();
      return { changed: true, result: {
        classification: 'accepted',
        state: 'UNREGISTERED',
        predecessorDigest: installableAgentPredecessorDigest(state.installableAgent),
      } };
    });
  }

  registerInstallableAgent(input) {
    exactRecord(input, [
      'managementRequestId', 'intentDigest', 'expectedPredecessorDigest', 'managementProof',
      'credentialProvisioningId', 'packageManifestDigest', 'packageTrustSubjectDigest', 'trustStateDigest', 'trustSubjects',
    ], [], 'D0027 register');
    const intentContent = {
      credentialProvisioningId: input.credentialProvisioningId,
      packageManifestDigest: input.packageManifestDigest,
      packageTrustSubjectDigest: input.packageTrustSubjectDigest,
      trustStateDigest: input.trustStateDigest,
      trustSubjects: canonicalClone(input.trustSubjects),
    };
    return this.#mutate((state) => {
      if (state.installableAgent.state === 'LEGACY_D0020_ONLY') {
        fail('installable_agent_migration_required', 'D0020-only route requires the explicit D0027 migration before registration');
      }
      this.#verifyManagement('register', state, input, intentContent);
      const replay = managementRequestReplay(state.installableAgent, input, 'register', state.limits);
      if (replay !== null) return { changed: false, result: managementResult('exact_replay', replay.result) };
      if (state.installableAgent.state !== 'UNREGISTERED' || state.installableAgent.everCurrent) {
        fail('genesis_predecessor_conflict', 'First registration requires exact never-current UNREGISTERED state');
      }
      assertBoundedText(input.credentialProvisioningId, 'credentialProvisioningId', state.limits.maxIdentifierBytes, { identifier: true });
      assertDigest(input.packageManifestDigest, 'packageManifestDigest');
      assertDigest(input.packageTrustSubjectDigest, 'packageTrustSubjectDigest');
      assertDigest(input.trustStateDigest, 'trustStateDigest');
      if (!isPlainRecord(input.trustSubjects) || input.trustSubjects[input.packageTrustSubjectDigest] !== 'active') {
        fail('genesis_trust_conflict', 'Initial package trust subject must be explicitly active in the candidate trust state');
      }
      const unregisteredPredecessorDigest = input.expectedPredecessorDigest;
      const genesisGeneration = nextInstallableGeneration(state.installableAgent, 'genesisGenerationHighWater', 'genesisGeneration');
      const candidate = {
        installationGeneration: nextInstallableGeneration(state.installableAgent, 'installationGenerationHighWater', 'installationGeneration'),
        credentialGeneration: nextInstallableGeneration(state.installableAgent, 'credentialGenerationHighWater', 'credentialGeneration'),
        credentialProvisioningId: input.credentialProvisioningId,
        packageActivationGeneration: nextInstallableGeneration(state.installableAgent, 'packageActivationGenerationHighWater', 'packageActivationGeneration'),
        packageManifestDigest: input.packageManifestDigest,
        packageTrustSubjectDigest: input.packageTrustSubjectDigest,
        trustPolicyGeneration: nextInstallableGeneration(state.installableAgent, 'trustPolicyGenerationHighWater', 'trustPolicyGeneration'),
        trustStateDigest: input.trustStateDigest,
        trustSubjects: canonicalClone(input.trustSubjects),
        lifecycleGeneration: nextInstallableGeneration(state.installableAgent, 'lifecycleGenerationHighWater', 'lifecycleGeneration'),
      };
      const legacyPredecessors = legacyHeldPredecessors(state);
      const pendingDigest = installableAgentPendingDigest({
        routeBinding: state.routeBinding,
        managementRequestId: input.managementRequestId,
        intentDigest: input.intentDigest,
        candidate,
        legacyPredecessors,
      });
      state.installableAgent.state = 'GENESIS_PENDING';
      state.installableAgent.pending = {
        genesisGeneration,
        managementRequestId: input.managementRequestId,
        intentDigest: input.intentDigest,
        unregisteredPredecessorDigest,
        pendingDigest,
        candidate,
        readiness: {
          bootstrapTrust: null,
          packageVerified: null,
          verifierReady: null,
          localReady: null,
          localServiceReady: null,
          predecessorQuiescence: legacyPredecessors.length === 0,
        },
        legacyPredecessors,
      };
      const result = {
        state: 'GENESIS_PENDING',
        genesisGeneration,
        pendingDigest,
        candidate: canonicalClone(candidate),
        predecessorQuiescenceRequired: legacyPredecessors.length !== 0,
      };
      recordManagementResult(state.installableAgent, input, 'register', result);
      return { changed: true, result: managementResult('accepted', result) };
    });
  }

  recordInstallableAgentGenesisEvidence(input) {
    exactRecord(input, ['pendingDigest', 'genesisGeneration', 'type', 'evidenceDigest', 'evidenceProof'], [], 'D0027 genesis evidence');
    normalizeGenesisEvidenceType(input.type);
    const readinessKey = {
      bootstrap_trust: 'bootstrapTrust',
      package_verified: 'packageVerified',
      verifier_ready: 'verifierReady',
      local_ready: 'localReady',
      local_service_ready: 'localServiceReady',
    }[input.type];
    if (readinessKey === undefined) fail('invalid_genesis_evidence', 'Evidence type is not a genesis staging receipt');
    return this.#mutate((state) => {
      if (state.installableAgent.state !== 'GENESIS_PENDING' || state.installableAgent.pending === null) {
        fail('genesis_not_pending', 'Genesis evidence requires GENESIS_PENDING state');
      }
      const pending = state.installableAgent.pending;
      assertSafeInteger(input.genesisGeneration, 'genesisGeneration', { min: 1 });
      assertDigest(input.pendingDigest, 'pendingDigest');
      if (input.genesisGeneration !== pending.genesisGeneration || input.pendingDigest !== pending.pendingDigest) {
        fail('stale_genesis_fence', 'Genesis evidence targets a stale pending identity');
      }
      const existing = pending.readiness[readinessKey];
      if (existing !== null) {
        if (existing !== input.evidenceDigest) fail('genesis_evidence_conflict', 'Genesis readiness identity changed after first acceptance');
        return { changed: false, result: { classification: 'exact_replay', type: input.type, evidenceDigest: existing } };
      }
      this.#verifyInstallableEvidence(input.type, state, input, {
        pendingDigest: pending.pendingDigest,
        genesisGeneration: pending.genesisGeneration,
        candidate: pending.candidate,
      });
      pending.readiness[readinessKey] = input.evidenceDigest;
      return { changed: true, result: { classification: 'accepted', type: input.type, evidenceDigest: input.evidenceDigest } };
    });
  }

  acceptLegacyPredecessorQuiescence(input) {
    exactRecord(input, [
      'pendingDigest', 'genesisGeneration', 'deliveryId', 'executorId', 'executorEpoch', 'evidenceRevision',
      'evidenceDigest', 'proofClass', 'receiptDigest', 'proofEvidenceDigest', 'evidenceProof',
    ], [], 'legacy D0020 predecessor quiescence');
    normalizePositiveQuiescenceProofClass(input.proofClass);
    return this.#mutate((state) => {
      if (state.installableAgent.state !== 'GENESIS_PENDING' || state.installableAgent.pending === null) {
        fail('genesis_not_pending', 'Legacy predecessor quiescence requires GENESIS_PENDING state');
      }
      const pending = state.installableAgent.pending;
      assertDigest(input.pendingDigest, 'pendingDigest');
      assertSafeInteger(input.genesisGeneration, 'genesisGeneration', { min: 1 });
      if (input.pendingDigest !== pending.pendingDigest || input.genesisGeneration !== pending.genesisGeneration) {
        fail('stale_genesis_fence', 'Predecessor quiescence targets a stale genesis identity');
      }
      assertDigest(input.deliveryId, 'deliveryId');
      assertBoundedText(input.executorId, 'executorId', state.limits.maxIdentifierBytes, { identifier: true });
      assertSafeInteger(input.executorEpoch, 'executorEpoch', { min: 1 });
      assertSafeInteger(input.evidenceRevision, 'evidenceRevision', { min: 0 });
      if (input.evidenceDigest !== null) assertDigest(input.evidenceDigest, 'evidenceDigest');
      assertDigest(input.receiptDigest, 'receiptDigest');
      assertDigest(input.proofEvidenceDigest, 'proofEvidenceDigest');
      const locator = pending.legacyPredecessors.find((candidate) => candidate.deliveryId === input.deliveryId);
      if (!locator || locator.executorId !== input.executorId || locator.executorEpoch !== input.executorEpoch ||
          locator.evidenceRevision !== input.evidenceRevision || locator.evidenceDigest !== input.evidenceDigest) {
        fail('predecessor_quiescence_scope_mismatch', 'Positive quiescence proof does not match the retained D0020 cleanup-domain identity');
      }
      const expectedReceiptDigest = typedDigest('tdev.installable-agent-predecessor-quiescence.v1', {
        agentId: state.routeBinding.agentId,
        routeGeneration: state.routeBinding.routeGeneration,
        pendingDigest: pending.pendingDigest,
        deliveryId: input.deliveryId,
        executorId: input.executorId,
        executorEpoch: input.executorEpoch,
        evidenceRevision: input.evidenceRevision,
        evidenceDigest: input.evidenceDigest,
        proofClass: input.proofClass,
      });
      if (input.receiptDigest !== expectedReceiptDigest) fail('predecessor_quiescence_receipt_mismatch', 'Predecessor quiescence receipt digest is invalid');
      const existing = state.installableAgent.predecessorQuiescenceReceipts[input.deliveryId];
      if (existing !== undefined) {
        if (existing.receiptDigest !== input.receiptDigest) fail('predecessor_quiescence_conflict', 'Predecessor slot already has a different quiescence receipt');
        return { changed: false, result: { classification: 'exact_replay', receipt: existing } };
      }
      const delivery = state.deliveries[input.deliveryId];
      if (!delivery || delivery.executorId !== input.executorId || delivery.executorEpoch !== input.executorEpoch ||
          delivery.localEvidenceRevision !== input.evidenceRevision || delivery.lastEvidenceDigest !== input.evidenceDigest) {
        fail('stale_predecessor_quiescence_evidence', 'D0020 predecessor slot/evidence changed before quiescence acceptance');
      }
      this.#verifyInstallableEvidence('positive_quiescence', state, { ...input, evidenceDigest: input.proofEvidenceDigest }, {
        pendingDigest: pending.pendingDigest,
        deliveryId: input.deliveryId,
        executorId: input.executorId,
        executorEpoch: input.executorEpoch,
        evidenceRevision: input.evidenceRevision,
        priorEvidenceDigest: input.evidenceDigest,
        proofClass: input.proofClass,
        receiptDigest: input.receiptDigest,
      });
      const receipt = {
        deliveryId: input.deliveryId,
        executorId: input.executorId,
        executorEpoch: input.executorEpoch,
        evidenceRevision: input.evidenceRevision,
        evidenceDigest: input.evidenceDigest,
        proofClass: input.proofClass,
        receiptDigest: input.receiptDigest,
      };
      state.installableAgent.predecessorQuiescenceReceipts[input.deliveryId] = receipt;
      locator.resolved = true;
      delivery.slotHeld = false;
      delivery.slotKind = 'none';
      pending.readiness.predecessorQuiescence = pending.legacyPredecessors.every((candidate) => candidate.resolved);
      return { changed: true, result: { classification: 'accepted', receipt, slotReleased: true } };
    });
  }

  initialActivateInstallableAgent(input) {
    exactRecord(input, [
      'managementRequestId', 'intentDigest', 'expectedPredecessorDigest', 'managementProof', 'pendingDigest', 'genesisGeneration',
    ], [], 'D0027 initial_activate');
    return this.#mutate((state) => {
      if (state.installableAgent.state === 'LEGACY_D0020_ONLY') fail('installable_agent_migration_required', 'D0027 migration is required');
      this.#verifyManagement('register', state, input, null);
      const receipt = this.#existingManagementReceipt(state, input, 'register');
      if (receipt.result?.state === 'CURRENT') return { changed: false, result: managementResult('exact_replay', receipt.result) };
      if (state.installableAgent.state !== 'GENESIS_PENDING' || state.installableAgent.pending === null) {
        fail('genesis_not_pending', 'initial_activate requires the exact GENESIS_PENDING transaction');
      }
      const pending = state.installableAgent.pending;
      assertDigest(input.pendingDigest, 'pendingDigest');
      assertSafeInteger(input.genesisGeneration, 'genesisGeneration', { min: 1 });
      if (input.pendingDigest !== pending.pendingDigest || input.genesisGeneration !== pending.genesisGeneration ||
          pending.managementRequestId !== input.managementRequestId || pending.intentDigest !== input.intentDigest) {
        fail('stale_genesis_fence', 'initial_activate does not match the fixed pending genesis identity');
      }
      for (const locator of pending.legacyPredecessors) {
        if (locator.resolved) continue;
        const delivery = state.deliveries[locator.deliveryId];
        if (delivery && !delivery.slotHeld && delivery.executorId === locator.executorId && delivery.executorEpoch === locator.executorEpoch &&
            delivery.localEvidenceRevision >= locator.evidenceRevision) locator.resolved = true;
      }
      pending.readiness.predecessorQuiescence = pending.legacyPredecessors.every((candidate) => candidate.resolved);
      for (const field of ['bootstrapTrust', 'packageVerified', 'verifierReady', 'localReady', 'localServiceReady']) {
        if (pending.readiness[field] === null) fail('genesis_not_ready', `Genesis readiness ${field} is incomplete`);
      }
      if (!pending.readiness.predecessorQuiescence) fail('predecessor_quiescence_required', 'Legacy D0020 held predecessor remains ambiguous');
      if (pending.candidate.trustSubjects[pending.candidate.packageTrustSubjectDigest] !== 'active') {
        fail('genesis_trust_conflict', 'Candidate package is not active under the fixed candidate trust state');
      }
      const transitionReceiptDigest = d0027TransitionReceipt('initial_activate', state, {
        managementRequestId: input.managementRequestId,
        pendingDigest: pending.pendingDigest,
        genesisGeneration: pending.genesisGeneration,
        candidate: pending.candidate,
      });
      const candidate = canonicalClone(pending.candidate);
      state.installableAgent.current = {
        installationGeneration: candidate.installationGeneration,
        installationDisposition: 'active',
        credentialGeneration: candidate.credentialGeneration,
        credentialDisposition: 'active',
        packageActivationGeneration: candidate.packageActivationGeneration,
        packageDisposition: 'active',
        packageManifestDigest: candidate.packageManifestDigest,
        packageTrustSubjectDigest: candidate.packageTrustSubjectDigest,
        trustPolicyGeneration: candidate.trustPolicyGeneration,
        trustStateDigest: candidate.trustStateDigest,
        trustSubjects: canonicalClone(candidate.trustSubjects),
        trustContinuesCurrentPackage: false,
        lifecycleGeneration: candidate.lifecycleGeneration,
        lifecycleDisposition: 'active',
        lifecycleCause: 'initial_activate',
        restartEligible: false,
        restartEligibleStopRequestId: null,
        transitionReceiptDigest,
        managementTransaction: null,
      };
      state.installableAgent.state = 'CURRENT';
      state.installableAgent.everCurrent = true;
      state.installableAgent.pending = null;
      const result = {
        state: 'CURRENT',
        cause: 'initial_activate',
        genesisGeneration: input.genesisGeneration,
        transitionReceiptDigest,
        currentTuple: installableAgentCurrentTuple(state.installableAgent, { executable: true }),
      };
      updateManagementResult(state.installableAgent, input.managementRequestId, result);
      return { changed: true, result: managementResult('accepted', result) };
    });
  }

  failInstallableAgentGenesis(input) {
    exactRecord(input, [
      'managementRequestId', 'intentDigest', 'expectedPredecessorDigest', 'managementProof', 'pendingDigest', 'genesisGeneration', 'failureDigest',
    ], [], 'D0027 failed genesis');
    return this.#mutate((state) => {
      this.#verifyManagement('register', state, input, null);
      const receipt = this.#existingManagementReceipt(state, input, 'register');
      if (receipt.result?.terminal === 'failed') return { changed: false, result: managementResult('exact_replay', receipt.result) };
      if (state.installableAgent.state !== 'GENESIS_PENDING' || state.installableAgent.pending === null) fail('genesis_not_pending', 'Failed genesis transition requires GENESIS_PENDING');
      const pending = state.installableAgent.pending;
      assertDigest(input.pendingDigest, 'pendingDigest');
      assertDigest(input.failureDigest, 'failureDigest');
      assertSafeInteger(input.genesisGeneration, 'genesisGeneration', { min: 1 });
      if (pending.pendingDigest !== input.pendingDigest || pending.genesisGeneration !== input.genesisGeneration || pending.managementRequestId !== input.managementRequestId) {
        fail('stale_genesis_fence', 'Failed genesis transition targets a stale pending identity');
      }
      state.installableAgent.state = 'UNREGISTERED';
      state.installableAgent.pending = null;
      const result = {
        state: 'UNREGISTERED',
        terminal: 'failed',
        genesisGeneration: input.genesisGeneration,
        failureDigest: input.failureDigest,
        predecessorDigest: installableAgentPredecessorDigest(state.installableAgent),
      };
      updateManagementResult(state.installableAgent, input.managementRequestId, result);
      return { changed: true, result: managementResult('accepted', result) };
    });
  }

  compactInstallableAgentManagementReceipts(input) {
    exactRecord(input, ['requestIds'], [], 'D0027 management receipt compaction');
    return this.#mutate((state) => {
      if (state.installableAgent.state === 'LEGACY_D0020_ONLY') fail('installable_agent_migration_required', 'D0027 management state is unavailable on a legacy route');
      if (!Array.isArray(input.requestIds) || input.requestIds.length === 0) fail('invalid_management_compaction', 'requestIds must be non-empty');
      const inFlight = state.installableAgent.pending?.managementRequestId ?? state.installableAgent.current?.managementTransaction?.managementRequestId ?? null;
      if (inFlight !== null && input.requestIds.includes(inFlight)) fail('management_compaction_unsafe', 'Cannot compact the nonterminal management transaction');
      compactManagementReceipts(state.installableAgent, input.requestIds, state.limits);
      return { changed: true, result: { classification: 'accepted', compacted: [...new Set(input.requestIds)] } };
    });
  }

  recordInstallableAgentTransactionEvidence(input) {
    exactRecord(input, ['managementRequestId', 'type', 'evidenceDigest', 'evidenceProof'], [], 'D0027 management transaction evidence');
    normalizeGenesisEvidenceType(input.type);
    const readinessKey = transactionReadinessKey(input.type);
    if (readinessKey === null) fail('invalid_installable_agent_transaction_evidence', 'Unsupported management transaction evidence type');
    return this.#mutate((state) => {
      const current = requireInstallableCurrent(state, { executable: false });
      const transaction = current.managementTransaction;
      if (transaction === null || transaction.managementRequestId !== input.managementRequestId) {
        fail('stale_management_transaction', 'Evidence targets no current D0027 management transaction');
      }
      if (!Object.hasOwn(transaction.readiness, readinessKey)) {
        fail('invalid_installable_agent_transaction_evidence', 'Evidence type is not required by this management transaction');
      }
      const existing = transaction.readiness[readinessKey];
      if (existing !== null) {
        if (existing !== input.evidenceDigest) fail('management_transaction_evidence_conflict', 'Readiness evidence changed after first acceptance');
        return { changed: false, result: { classification: 'exact_replay', type: input.type, evidenceDigest: existing } };
      }
      this.#verifyInstallableEvidence(input.type, state, input, {
        managementRequestId: transaction.managementRequestId,
        transactionType: transaction.type,
        phase: transaction.phase,
        candidate: transaction.candidate,
        currentSecurityDigest: installableAgentSecurityStateDigest(state.installableAgent),
      });
      transaction.readiness[readinessKey] = input.evidenceDigest;
      return { changed: true, result: { classification: 'accepted', type: input.type, evidenceDigest: input.evidenceDigest } };
    });
  }

  mutateInstallableAgentTrust(input) {
    exactRecord(input, [
      'managementRequestId', 'intentDigest', 'expectedPredecessorDigest', 'managementProof',
      'trustStateDigest', 'trustSubjects', 'trustContinuesCurrentPackage',
    ], [], 'D0027 trust mutation');
    const intentContent = {
      trustStateDigest: input.trustStateDigest,
      trustSubjects: canonicalClone(input.trustSubjects),
      trustContinuesCurrentPackage: input.trustContinuesCurrentPackage,
    };
    return this.#mutate((state) => {
      const current = requireInstallableCurrent(state, { executable: false });
      const known = state.installableAgent.managementReceipts[input.managementRequestId];
      this.#verifyManagement('trust', state, input, known ? null : intentContent);
      const replay = managementRequestReplay(state.installableAgent, input, 'trust', state.limits);
      if (replay !== null) return { changed: false, result: managementResult('exact_replay', replay.result) };
      requireNoManagementTransaction(current);
      assertDigest(input.trustStateDigest, 'trustStateDigest');
      if (!isPlainRecord(input.trustSubjects)) fail('invalid_installable_agent_trust', 'trustSubjects must be a record');
      if (typeof input.trustContinuesCurrentPackage !== 'boolean') fail('invalid_installable_agent_trust', 'trustContinuesCurrentPackage must be boolean');
      const trustPolicyGeneration = nextInstallableGeneration(state.installableAgent, 'trustPolicyGenerationHighWater', 'trustPolicyGeneration');
      current.trustPolicyGeneration = trustPolicyGeneration;
      current.trustStateDigest = input.trustStateDigest;
      current.trustSubjects = canonicalClone(input.trustSubjects);
      current.trustContinuesCurrentPackage = input.trustContinuesCurrentPackage;
      current.transitionReceiptDigest = d0027TransitionReceipt('trust', state, {
        managementRequestId: input.managementRequestId,
        trustPolicyGeneration,
        trustStateDigest: input.trustStateDigest,
      });
      const result = {
        operation: 'trust',
        phase: 'committed',
        trustPolicyGeneration,
        trustStateDigest: input.trustStateDigest,
        currentTuple: installableAgentCurrentTuple(state.installableAgent, { executable: false }),
      };
      recordManagementResult(state.installableAgent, input, 'trust', result);
      return { changed: true, result: managementResult('accepted', result) };
    });
  }

  beginCredentialRotation(input) {
    exactRecord(input, [
      'managementRequestId', 'intentDigest', 'expectedPredecessorDigest', 'managementProof', 'credentialProvisioningId',
    ], [], 'D0027 credential rotation begin');
    const intentContent = { credentialProvisioningId: input.credentialProvisioningId };
    return this.#mutate((state) => {
      const current = requireInstallableCurrent(state, { executable: false });
      const known = state.installableAgent.managementReceipts[input.managementRequestId];
      this.#verifyManagement('credential_rotate', state, input, known ? null : intentContent);
      const replay = managementRequestReplay(state.installableAgent, input, 'credential_rotate', state.limits);
      if (replay !== null) return { changed: false, result: managementResult('exact_replay', replay.result) };
      requireNoManagementTransaction(current);
      assertBoundedText(input.credentialProvisioningId, 'credentialProvisioningId', state.limits.maxIdentifierBytes, { identifier: true });
      const credentialGeneration = nextInstallableGeneration(state.installableAgent, 'credentialGenerationHighWater', 'credentialGeneration');
      current.managementTransaction = {
        type: 'credential_rotation',
        managementRequestId: input.managementRequestId,
        intentDigest: input.intentDigest,
        predecessorDigest: input.expectedPredecessorDigest,
        phase: 'preparing',
        candidate: {
          credentialGeneration,
          credentialProvisioningId: input.credentialProvisioningId,
          baseSecurityDigest: installableAgentSecurityStateDigest(state.installableAgent),
        },
        readiness: { verifierReady: null, localReady: null },
      };
      current.managementTransaction.candidate.baseSecurityDigest = installableAgentSecurityStateDigest(state.installableAgent);
      const result = { operation: 'credential_rotation', phase: 'pending', credentialGeneration };
      recordManagementResult(state.installableAgent, input, 'credential_rotate', result);
      return { changed: true, result: managementResult('accepted', result) };
    });
  }

  commitCredentialRotation(input) {
    exactRecord(input, ['managementRequestId', 'intentDigest', 'expectedPredecessorDigest', 'managementProof'], [], 'D0027 credential rotation commit');
    return this.#mutate((state) => {
      const current = requireInstallableCurrent(state, { executable: false });
      const receipt = this.#existingManagementReceipt(state, input, 'credential_rotate');
      this.#verifyManagement('credential_rotate', state, input, null);
      if (receipt.result?.phase === 'committed') return { changed: false, result: managementResult('exact_replay', receipt.result) };
      const transaction = current.managementTransaction;
      if (transaction?.type !== 'credential_rotation' || transaction.managementRequestId !== input.managementRequestId) {
        fail('stale_management_transaction', 'Credential rotation transaction is not current');
      }
      if (transaction.readiness.verifierReady === null || transaction.readiness.localReady === null) {
        fail('credential_rotation_not_ready', 'Credential verifier/local readiness is incomplete');
      }
      if (installableAgentSecurityStateDigest(state.installableAgent) !== transaction.candidate.baseSecurityDigest) {
        fail('management_final_revalidation_failed', 'Credential rotation predecessor security tuple changed');
      }
      current.credentialGeneration = transaction.candidate.credentialGeneration;
      current.credentialDisposition = 'active';
      current.managementTransaction = null;
      current.transitionReceiptDigest = d0027TransitionReceipt('credential_rotate', state, {
        managementRequestId: input.managementRequestId,
        credentialGeneration: current.credentialGeneration,
      });
      const result = {
        operation: 'credential_rotation',
        phase: 'committed',
        credentialGeneration: current.credentialGeneration,
        currentTuple: installableAgentCurrentTuple(state.installableAgent, { executable: false }),
      };
      updateManagementResult(state.installableAgent, input.managementRequestId, result);
      return { changed: true, result: managementResult('accepted', result) };
    });
  }

  revokeInstallableAgentCredential(input) {
    exactRecord(input, ['managementRequestId', 'intentDigest', 'expectedPredecessorDigest', 'managementProof'], [], 'D0027 credential revocation');
    const intentContent = { cause: 'credential_revoke' };
    return this.#mutate((state) => {
      const current = requireInstallableCurrent(state, { executable: false });
      const known = state.installableAgent.managementReceipts[input.managementRequestId];
      this.#verifyManagement('credential_revoke', state, input, known ? null : intentContent);
      const replay = managementRequestReplay(state.installableAgent, input, 'credential_revoke', state.limits);
      if (replay !== null) return { changed: false, result: managementResult('exact_replay', replay.result) };
      requireNoManagementTransaction(current);
      const credentialGeneration = nextInstallableGeneration(state.installableAgent, 'credentialGenerationHighWater', 'credentialGeneration');
      current.credentialGeneration = credentialGeneration;
      current.credentialDisposition = 'revoked';
      current.transitionReceiptDigest = d0027TransitionReceipt('credential_revoke', state, {
        managementRequestId: input.managementRequestId,
        credentialGeneration,
      });
      const result = { operation: 'credential_revoke', phase: 'committed', credentialGeneration };
      recordManagementResult(state.installableAgent, input, 'credential_revoke', result);
      return { changed: true, result: managementResult('accepted', result) };
    });
  }

  beginBaseStop(input) {
    exactRecord(input, ['managementRequestId', 'intentDigest', 'expectedPredecessorDigest', 'managementProof'], [], 'D0027 base stop begin');
    const intentContent = { cause: 'base_stop' };
    return this.#mutate((state) => {
      const current = requireInstallableCurrent(state, { executable: false });
      const known = state.installableAgent.managementReceipts[input.managementRequestId];
      this.#verifyManagement('stop', state, input, known ? null : intentContent);
      const replay = managementRequestReplay(state.installableAgent, input, 'stop', state.limits);
      if (replay !== null) return { changed: false, result: managementResult('exact_replay', replay.result) };
      requireNoManagementTransaction(current);
      if (current.lifecycleDisposition !== 'active') fail('lifecycle_predecessor_conflict', 'base stop requires exact active lifecycle predecessor');
      const lifecycleGeneration = nextInstallableGeneration(state.installableAgent, 'lifecycleGenerationHighWater', 'lifecycleGeneration');
      current.lifecycleGeneration = lifecycleGeneration;
      current.lifecycleDisposition = 'draining';
      current.lifecycleCause = 'base_stop';
      current.restartEligible = false;
      current.restartEligibleStopRequestId = null;
      current.transitionReceiptDigest = d0027TransitionReceipt('base_stop_drain', state, {
        managementRequestId: input.managementRequestId,
        lifecycleGeneration,
      });
      current.managementTransaction = {
        type: 'base_stop',
        managementRequestId: input.managementRequestId,
        intentDigest: input.intentDigest,
        predecessorDigest: input.expectedPredecessorDigest,
        phase: 'draining',
        candidate: { lifecycleGeneration, drainingSecurityDigest: null },
        readiness: { positiveQuiescence: null, serviceStopped: null },
      };
      current.managementTransaction.candidate.drainingSecurityDigest = installableAgentSecurityStateDigest(state.installableAgent);
      const result = { operation: 'base_stop', phase: 'draining', lifecycleGeneration };
      recordManagementResult(state.installableAgent, input, 'stop', result);
      return { changed: true, result: managementResult('accepted', result) };
    });
  }

  completeBaseStop(input) {
    exactRecord(input, ['managementRequestId', 'intentDigest', 'expectedPredecessorDigest', 'managementProof'], [], 'D0027 base stop complete');
    return this.#mutate((state) => {
      const current = requireInstallableCurrent(state, { executable: false });
      const receipt = this.#existingManagementReceipt(state, input, 'stop');
      this.#verifyManagement('stop', state, input, null);
      if (receipt.result?.phase === 'completed') return { changed: false, result: managementResult('exact_replay', receipt.result) };
      const transaction = current.managementTransaction;
      if (transaction?.type !== 'base_stop' || transaction.managementRequestId !== input.managementRequestId) fail('stale_management_transaction', 'base stop transaction is not current');
      if (transaction.readiness.positiveQuiescence === null || transaction.readiness.serviceStopped === null) {
        fail('stop_not_quiesced', 'base stop requires positive physical quiescence and service/supervisor stop evidence');
      }
      if (installableAgentSecurityStateDigest(state.installableAgent) !== transaction.candidate.drainingSecurityDigest) {
        fail('management_final_revalidation_failed', 'base stop draining tuple changed');
      }
      current.restartEligible = true;
      current.restartEligibleStopRequestId = input.managementRequestId;
      current.managementTransaction = null;
      current.transitionReceiptDigest = d0027TransitionReceipt('base_stop_complete', state, {
        managementRequestId: input.managementRequestId,
        lifecycleGeneration: current.lifecycleGeneration,
        quiescenceEvidenceDigest: transaction.readiness.positiveQuiescence,
        serviceStoppedEvidenceDigest: transaction.readiness.serviceStopped,
      });
      const result = {
        operation: 'base_stop',
        phase: 'completed',
        lifecycleGeneration: current.lifecycleGeneration,
        restartEligible: true,
        transitionReceiptDigest: current.transitionReceiptDigest,
      };
      updateManagementResult(state.installableAgent, input.managementRequestId, result);
      return { changed: true, result: managementResult('accepted', result) };
    });
  }

  prepareBaseStart(input) {
    exactRecord(input, ['managementRequestId', 'intentDigest', 'expectedPredecessorDigest', 'managementProof'], [], 'D0027 base start prepare');
    return this.#mutate((state) => {
      const current = requireInstallableCurrent(state, { executable: false });
      const intentContent = { cause: 'base_start', restartEligibleStopRequestId: current.restartEligibleStopRequestId };
      const known = state.installableAgent.managementReceipts[input.managementRequestId];
      this.#verifyManagement('start', state, input, known ? null : intentContent);
      const replay = managementRequestReplay(state.installableAgent, input, 'start', state.limits);
      if (replay !== null) return { changed: false, result: managementResult('exact_replay', replay.result) };
      requireNoManagementTransaction(current);
      if (current.lifecycleDisposition !== 'draining' || current.lifecycleCause !== 'base_stop' || !current.restartEligible || current.restartEligibleStopRequestId === null) {
        fail('start_not_restart_eligible', 'base start is restart-only from an exact completed base_stop drain');
      }
      const lifecycleGeneration = nextInstallableGeneration(state.installableAgent, 'lifecycleGenerationHighWater', 'lifecycleGeneration');
      current.managementTransaction = {
        type: 'base_start',
        managementRequestId: input.managementRequestId,
        intentDigest: input.intentDigest,
        predecessorDigest: input.expectedPredecessorDigest,
        phase: 'preparing',
        candidate: {
          lifecycleGeneration,
          restartEligibleStopRequestId: current.restartEligibleStopRequestId,
          baseSecurityDigest: installableAgentSecurityStateDigest(state.installableAgent),
        },
        readiness: { localServiceReady: null },
      };
      current.managementTransaction.candidate.baseSecurityDigest = installableAgentSecurityStateDigest(state.installableAgent);
      const result = { operation: 'base_start', phase: 'preparing', lifecycleGeneration };
      recordManagementResult(state.installableAgent, input, 'start', result);
      return { changed: true, result: managementResult('accepted', result) };
    });
  }

  commitBaseStart(input) {
    exactRecord(input, ['managementRequestId', 'intentDigest', 'expectedPredecessorDigest', 'managementProof'], [], 'D0027 base start commit');
    return this.#mutate((state) => {
      const current = requireInstallableCurrent(state, { executable: false });
      const receipt = this.#existingManagementReceipt(state, input, 'start');
      this.#verifyManagement('start', state, input, null);
      if (receipt.result?.phase === 'committed') return { changed: false, result: managementResult('exact_replay', receipt.result) };
      const transaction = current.managementTransaction;
      if (transaction?.type !== 'base_start' || transaction.managementRequestId !== input.managementRequestId) fail('stale_management_transaction', 'base start transaction is not current');
      if (transaction.readiness.localServiceReady === null) fail('start_not_ready', 'base start local preparation is incomplete');
      if (installableAgentSecurityStateDigest(state.installableAgent) !== transaction.candidate.baseSecurityDigest ||
          current.restartEligibleStopRequestId !== transaction.candidate.restartEligibleStopRequestId) {
        fail('management_final_revalidation_failed', 'base start final current tuple revalidation failed');
      }
      current.lifecycleGeneration = transaction.candidate.lifecycleGeneration;
      current.lifecycleDisposition = 'active';
      current.lifecycleCause = 'base_start';
      current.restartEligible = false;
      current.restartEligibleStopRequestId = null;
      current.managementTransaction = null;
      current.transitionReceiptDigest = d0027TransitionReceipt('base_start', state, {
        managementRequestId: input.managementRequestId,
        lifecycleGeneration: current.lifecycleGeneration,
      });
      const result = {
        operation: 'base_start',
        phase: 'committed',
        lifecycleGeneration: current.lifecycleGeneration,
        currentTuple: installableAgentCurrentTuple(state.installableAgent, { executable: true }),
      };
      updateManagementResult(state.installableAgent, input.managementRequestId, result);
      return { changed: true, result: managementResult('accepted', result) };
    });
  }

  beginPackageActivation(input) {
    exactRecord(input, [
      'managementRequestId', 'intentDigest', 'expectedPredecessorDigest', 'managementProof',
      'transitionCause', 'packageManifestDigest', 'packageTrustSubjectDigest',
    ], [], 'D0027 package activation begin');
    if (!['package_update', 'package_rollback'].includes(input.transitionCause)) fail('invalid_package_transition', 'Package transition must be update or forward rollback');
    const intentContent = {
      transitionCause: input.transitionCause,
      packageManifestDigest: input.packageManifestDigest,
      packageTrustSubjectDigest: input.packageTrustSubjectDigest,
    };
    return this.#mutate((state) => {
      const current = requireInstallableCurrent(state, { executable: false });
      const known = state.installableAgent.managementReceipts[input.managementRequestId];
      this.#verifyManagement('package', state, input, known ? null : intentContent);
      const replay = managementRequestReplay(state.installableAgent, input, 'package', state.limits);
      if (replay !== null) return { changed: false, result: managementResult('exact_replay', replay.result) };
      requireNoManagementTransaction(current);
      if (current.lifecycleDisposition !== 'active') fail('lifecycle_predecessor_conflict', 'Package activation requires active predecessor before draining');
      assertDigest(input.packageManifestDigest, 'packageManifestDigest');
      assertDigest(input.packageTrustSubjectDigest, 'packageTrustSubjectDigest');
      if (current.trustSubjects[input.packageTrustSubjectDigest] !== 'active') fail('package_trust_denied', 'New package activation requires an active trust subject');
      const drainingLifecycleGeneration = nextInstallableGeneration(state.installableAgent, 'lifecycleGenerationHighWater', 'lifecycleGeneration');
      const finalLifecycleGeneration = nextInstallableGeneration(state.installableAgent, 'lifecycleGenerationHighWater', 'lifecycleGeneration');
      const packageActivationGeneration = nextInstallableGeneration(state.installableAgent, 'packageActivationGenerationHighWater', 'packageActivationGeneration');
      current.lifecycleGeneration = drainingLifecycleGeneration;
      current.lifecycleDisposition = 'draining';
      current.lifecycleCause = input.transitionCause;
      current.restartEligible = false;
      current.restartEligibleStopRequestId = null;
      current.transitionReceiptDigest = d0027TransitionReceipt(`${input.transitionCause}_drain`, state, {
        managementRequestId: input.managementRequestId,
        lifecycleGeneration: drainingLifecycleGeneration,
      });
      current.managementTransaction = {
        type: input.transitionCause,
        managementRequestId: input.managementRequestId,
        intentDigest: input.intentDigest,
        predecessorDigest: input.expectedPredecessorDigest,
        phase: 'draining',
        candidate: {
          packageActivationGeneration,
          packageManifestDigest: input.packageManifestDigest,
          packageTrustSubjectDigest: input.packageTrustSubjectDigest,
          finalLifecycleGeneration,
          drainingSecurityDigest: null,
        },
        readiness: { packageVerified: null, localServiceReady: null, positiveQuiescence: null },
      };
      current.managementTransaction.candidate.drainingSecurityDigest = installableAgentSecurityStateDigest(state.installableAgent);
      const result = {
        operation: input.transitionCause,
        phase: 'draining',
        packageActivationGeneration,
        drainingLifecycleGeneration,
        finalLifecycleGeneration,
      };
      recordManagementResult(state.installableAgent, input, 'package', result);
      return { changed: true, result: managementResult('accepted', result) };
    });
  }

  commitPackageActivation(input) {
    exactRecord(input, ['managementRequestId', 'intentDigest', 'expectedPredecessorDigest', 'managementProof'], [], 'D0027 package activation commit');
    return this.#mutate((state) => {
      const current = requireInstallableCurrent(state, { executable: false });
      const receipt = this.#existingManagementReceipt(state, input, 'package');
      this.#verifyManagement('package', state, input, null);
      if (receipt.result?.phase === 'committed') return { changed: false, result: managementResult('exact_replay', receipt.result) };
      const transaction = current.managementTransaction;
      if (!['package_update', 'package_rollback'].includes(transaction?.type) || transaction.managementRequestId !== input.managementRequestId) {
        fail('stale_management_transaction', 'Package activation transaction is not current');
      }
      for (const field of ['packageVerified', 'localServiceReady', 'positiveQuiescence']) {
        if (transaction.readiness[field] === null) fail('package_activation_not_ready', `Package activation readiness ${field} is incomplete`);
      }
      if (installableAgentSecurityStateDigest(state.installableAgent) !== transaction.candidate.drainingSecurityDigest) {
        fail('management_final_revalidation_failed', 'Package activation draining tuple changed');
      }
      if (current.trustSubjects[transaction.candidate.packageTrustSubjectDigest] !== 'active') {
        fail('package_trust_denied', 'Package trust subject is no longer active at final election');
      }
      current.packageActivationGeneration = transaction.candidate.packageActivationGeneration;
      current.packageManifestDigest = transaction.candidate.packageManifestDigest;
      current.packageTrustSubjectDigest = transaction.candidate.packageTrustSubjectDigest;
      current.packageDisposition = 'active';
      current.lifecycleGeneration = transaction.candidate.finalLifecycleGeneration;
      current.lifecycleDisposition = 'active';
      current.lifecycleCause = transaction.type;
      current.restartEligible = false;
      current.restartEligibleStopRequestId = null;
      const operation = transaction.type;
      current.managementTransaction = null;
      current.transitionReceiptDigest = d0027TransitionReceipt(operation, state, {
        managementRequestId: input.managementRequestId,
        packageActivationGeneration: current.packageActivationGeneration,
        lifecycleGeneration: current.lifecycleGeneration,
      });
      const result = {
        operation,
        phase: 'committed',
        packageActivationGeneration: current.packageActivationGeneration,
        lifecycleGeneration: current.lifecycleGeneration,
        currentTuple: installableAgentCurrentTuple(state.installableAgent, { executable: true }),
      };
      updateManagementResult(state.installableAgent, input.managementRequestId, result);
      return { changed: true, result: managementResult('accepted', result) };
    });
  }

  beginInstallableAgentReplacement(input) {
    exactRecord(input, [
      'managementRequestId', 'intentDigest', 'expectedPredecessorDigest', 'managementProof',
      'credentialProvisioningId', 'packageManifestDigest', 'packageTrustSubjectDigest',
    ], [], 'D0027 replacement begin');
    const intentContent = {
      credentialProvisioningId: input.credentialProvisioningId,
      packageManifestDigest: input.packageManifestDigest,
      packageTrustSubjectDigest: input.packageTrustSubjectDigest,
    };
    return this.#mutate((state) => {
      const current = requireInstallableCurrent(state, { executable: false });
      const known = state.installableAgent.managementReceipts[input.managementRequestId];
      this.#verifyManagement('replace', state, input, known ? null : intentContent);
      const replay = managementRequestReplay(state.installableAgent, input, 'replace', state.limits);
      if (replay !== null) return { changed: false, result: managementResult('exact_replay', replay.result) };
      requireNoManagementTransaction(current);
      assertBoundedText(input.credentialProvisioningId, 'credentialProvisioningId', state.limits.maxIdentifierBytes, { identifier: true });
      assertDigest(input.packageManifestDigest, 'packageManifestDigest');
      assertDigest(input.packageTrustSubjectDigest, 'packageTrustSubjectDigest');
      if (current.trustSubjects[input.packageTrustSubjectDigest] !== 'active') fail('package_trust_denied', 'Replacement package requires an active trust subject');
      const drainingLifecycleGeneration = nextInstallableGeneration(state.installableAgent, 'lifecycleGenerationHighWater', 'lifecycleGeneration');
      const finalLifecycleGeneration = nextInstallableGeneration(state.installableAgent, 'lifecycleGenerationHighWater', 'lifecycleGeneration');
      const installationGeneration = nextInstallableGeneration(state.installableAgent, 'installationGenerationHighWater', 'installationGeneration');
      const credentialGeneration = nextInstallableGeneration(state.installableAgent, 'credentialGenerationHighWater', 'credentialGeneration');
      const packageActivationGeneration = nextInstallableGeneration(state.installableAgent, 'packageActivationGenerationHighWater', 'packageActivationGeneration');
      current.lifecycleGeneration = drainingLifecycleGeneration;
      current.lifecycleDisposition = 'draining';
      current.lifecycleCause = 'replacement';
      current.restartEligible = false;
      current.restartEligibleStopRequestId = null;
      current.transitionReceiptDigest = d0027TransitionReceipt('replacement_drain', state, {
        managementRequestId: input.managementRequestId,
        lifecycleGeneration: drainingLifecycleGeneration,
      });
      current.managementTransaction = {
        type: 'replacement',
        managementRequestId: input.managementRequestId,
        intentDigest: input.intentDigest,
        predecessorDigest: input.expectedPredecessorDigest,
        phase: 'draining',
        candidate: {
          installationGeneration,
          credentialGeneration,
          credentialProvisioningId: input.credentialProvisioningId,
          packageActivationGeneration,
          packageManifestDigest: input.packageManifestDigest,
          packageTrustSubjectDigest: input.packageTrustSubjectDigest,
          finalLifecycleGeneration,
          drainingSecurityDigest: null,
        },
        readiness: {
          packageVerified: null,
          verifierReady: null,
          localReady: null,
          localServiceReady: null,
          positiveQuiescence: null,
          cloneSafeActivation: null,
        },
      };
      current.managementTransaction.candidate.drainingSecurityDigest = installableAgentSecurityStateDigest(state.installableAgent);
      const result = {
        operation: 'replacement',
        phase: 'draining',
        installationGeneration,
        credentialGeneration,
        packageActivationGeneration,
        drainingLifecycleGeneration,
        finalLifecycleGeneration,
      };
      recordManagementResult(state.installableAgent, input, 'replace', result);
      return { changed: true, result: managementResult('accepted', result) };
    });
  }

  commitInstallableAgentReplacement(input) {
    exactRecord(input, ['managementRequestId', 'intentDigest', 'expectedPredecessorDigest', 'managementProof'], [], 'D0027 replacement commit');
    return this.#mutate((state) => {
      const current = requireInstallableCurrent(state, { executable: false });
      const receipt = this.#existingManagementReceipt(state, input, 'replace');
      this.#verifyManagement('replace', state, input, null);
      if (receipt.result?.phase === 'committed') return { changed: false, result: managementResult('exact_replay', receipt.result) };
      const transaction = current.managementTransaction;
      if (transaction?.type !== 'replacement' || transaction.managementRequestId !== input.managementRequestId) fail('stale_management_transaction', 'Replacement transaction is not current');
      for (const field of ['packageVerified', 'verifierReady', 'localReady', 'localServiceReady', 'positiveQuiescence', 'cloneSafeActivation']) {
        if (transaction.readiness[field] === null) fail('replacement_not_ready', `Replacement readiness ${field} is incomplete`);
      }
      if (installableAgentSecurityStateDigest(state.installableAgent) !== transaction.candidate.drainingSecurityDigest) {
        fail('management_final_revalidation_failed', 'Replacement draining tuple changed');
      }
      if (current.trustSubjects[transaction.candidate.packageTrustSubjectDigest] !== 'active') fail('package_trust_denied', 'Replacement package trust subject is no longer active');
      current.installationGeneration = transaction.candidate.installationGeneration;
      current.installationDisposition = 'active';
      current.credentialGeneration = transaction.candidate.credentialGeneration;
      current.credentialDisposition = 'active';
      current.packageActivationGeneration = transaction.candidate.packageActivationGeneration;
      current.packageDisposition = 'active';
      current.packageManifestDigest = transaction.candidate.packageManifestDigest;
      current.packageTrustSubjectDigest = transaction.candidate.packageTrustSubjectDigest;
      current.lifecycleGeneration = transaction.candidate.finalLifecycleGeneration;
      current.lifecycleDisposition = 'active';
      current.lifecycleCause = 'replacement';
      current.restartEligible = false;
      current.restartEligibleStopRequestId = null;
      current.managementTransaction = null;
      current.transitionReceiptDigest = d0027TransitionReceipt('replacement', state, {
        managementRequestId: input.managementRequestId,
        installationGeneration: current.installationGeneration,
        credentialGeneration: current.credentialGeneration,
        packageActivationGeneration: current.packageActivationGeneration,
        lifecycleGeneration: current.lifecycleGeneration,
      });
      const result = {
        operation: 'replacement',
        phase: 'committed',
        currentTuple: installableAgentCurrentTuple(state.installableAgent, { executable: true }),
      };
      updateManagementResult(state.installableAgent, input.managementRequestId, result);
      return { changed: true, result: managementResult('accepted', result) };
    });
  }

  beginInstallableAgentUninstall(input) {
    exactRecord(input, ['managementRequestId', 'intentDigest', 'expectedPredecessorDigest', 'managementProof'], [], 'D0027 uninstall begin');
    const intentContent = { cause: 'uninstall' };
    return this.#mutate((state) => {
      const current = requireInstallableCurrent(state, { executable: false });
      const known = state.installableAgent.managementReceipts[input.managementRequestId];
      this.#verifyManagement('uninstall', state, input, known ? null : intentContent);
      const replay = managementRequestReplay(state.installableAgent, input, 'uninstall', state.limits);
      if (replay !== null) return { changed: false, result: managementResult('exact_replay', replay.result) };
      requireNoManagementTransaction(current);
      const lifecycleGeneration = nextInstallableGeneration(state.installableAgent, 'lifecycleGenerationHighWater', 'lifecycleGeneration');
      current.lifecycleGeneration = lifecycleGeneration;
      current.lifecycleDisposition = 'draining';
      current.lifecycleCause = 'uninstall';
      current.restartEligible = false;
      current.restartEligibleStopRequestId = null;
      current.transitionReceiptDigest = d0027TransitionReceipt('uninstall_drain', state, {
        managementRequestId: input.managementRequestId,
        lifecycleGeneration,
      });
      current.managementTransaction = {
        type: 'uninstall',
        managementRequestId: input.managementRequestId,
        intentDigest: input.intentDigest,
        predecessorDigest: input.expectedPredecessorDigest,
        phase: 'draining',
        candidate: { lifecycleGeneration, drainingSecurityDigest: null },
        readiness: { positiveQuiescence: null, serviceStopped: null },
      };
      current.managementTransaction.candidate.drainingSecurityDigest = installableAgentSecurityStateDigest(state.installableAgent);
      const result = { operation: 'uninstall', phase: 'draining', lifecycleGeneration };
      recordManagementResult(state.installableAgent, input, 'uninstall', result);
      return { changed: true, result: managementResult('accepted', result) };
    });
  }

  completeInstallableAgentUninstall(input) {
    exactRecord(input, ['managementRequestId', 'intentDigest', 'expectedPredecessorDigest', 'managementProof'], [], 'D0027 uninstall complete');
    return this.#mutate((state) => {
      const current = requireInstallableCurrent(state, { executable: false });
      const receipt = this.#existingManagementReceipt(state, input, 'uninstall');
      this.#verifyManagement('uninstall', state, input, null);
      if (receipt.result?.phase === 'revoked') return { changed: false, result: managementResult('exact_replay', receipt.result) };
      const transaction = current.managementTransaction;
      if (transaction?.type !== 'uninstall' || transaction.managementRequestId !== input.managementRequestId) fail('stale_management_transaction', 'Uninstall transaction is not current');
      if (transaction.readiness.positiveQuiescence === null || transaction.readiness.serviceStopped === null) {
        fail('uninstall_not_quiesced', 'Uninstall requires positive quiescence and stopped service/supervisor evidence');
      }
      if (installableAgentSecurityStateDigest(state.installableAgent) !== transaction.candidate.drainingSecurityDigest) {
        fail('management_final_revalidation_failed', 'Uninstall draining tuple changed');
      }
      const finalLifecycleGeneration = nextInstallableGeneration(state.installableAgent, 'lifecycleGenerationHighWater', 'lifecycleGeneration');
      current.installationDisposition = 'revoked';
      current.credentialDisposition = 'revoked';
      current.packageDisposition = 'revoked';
      current.lifecycleGeneration = finalLifecycleGeneration;
      current.lifecycleDisposition = 'revoked';
      current.lifecycleCause = 'uninstall';
      current.restartEligible = false;
      current.restartEligibleStopRequestId = null;
      current.managementTransaction = null;
      current.transitionReceiptDigest = d0027TransitionReceipt('uninstall_revoked', state, {
        managementRequestId: input.managementRequestId,
        lifecycleGeneration: finalLifecycleGeneration,
      });
      const result = {
        operation: 'uninstall',
        phase: 'revoked',
        lifecycleGeneration: finalLifecycleGeneration,
        deletionBarrier: 'authority_revoked_replay_fences_retained',
        transitionReceiptDigest: current.transitionReceiptDigest,
      };
      updateManagementResult(state.installableAgent, input.managementRequestId, result);
      return { changed: true, result: managementResult('accepted', result) };
    });
  }

  connect(input) {
    exactRecord(input, [
      'agentId', 'routeGeneration', 'expectedConnectionEpoch', 'connectRequestId', 'requestDigest', 'connectionId',
      'executorId', 'executorEpoch', 'protocolMetadataDigest',
    ], ['socketIncarnationId', 'installableAgentTuple'], 'connect');
    return this.#mutate((state) => {
      assertRouteInput(state, input);
      const installableAgentTuple = assertInstallableAgentDataPlaneTuple(
        state.installableAgent,
        input.installableAgentTuple,
        { allowLegacy: true },
      );
      assertSafeInteger(input.expectedConnectionEpoch, 'expectedConnectionEpoch', { min: 0 });
      for (const field of ['connectRequestId', 'connectionId', 'executorId']) {
        assertBoundedText(input[field], field, state.limits.maxIdentifierBytes, { identifier: true });
      }
      assertSafeInteger(input.executorEpoch, 'executorEpoch', { min: 1 });
      assertDigest(input.protocolMetadataDigest, 'protocolMetadataDigest');
      assertDigest(input.requestDigest, 'requestDigest');
      const expectedDigest = computeAgentConnectRequestDigest(connectRequestContent(input));
      if (input.requestDigest !== expectedDigest) fail('connect_digest_mismatch', 'Connect request digest does not match canonical content');

      let socketIncarnationId = input.socketIncarnationId;
      if (socketIncarnationId !== undefined && socketIncarnationId !== null) {
        assertBoundedText(socketIncarnationId, 'socketIncarnationId', state.limits.maxIdentifierBytes, { identifier: true });
      } else {
        socketIncarnationId = `socket-incarnation-${state.revision + 1}`;
      }

      const retained = state.connectReceipts[input.connectRequestId];
      if (retained) {
        if (retained.requestDigest !== input.requestDigest) fail('connect_request_conflict', 'Connect request identity was reused with different content');
        if (retained.connectionEpoch !== state.lastConnectionEpoch || state.connection === null ||
            state.connection.connectRequestId !== input.connectRequestId || state.connection.id !== retained.receipt.connectionId ||
            state.connection.epoch !== retained.connectionEpoch) {
          return { changed: false, result: { classification: 'stale', lastConnectionEpoch: state.lastConnectionEpoch } };
        }
        state.connection.socketIncarnationId = socketIncarnationId;
        return { changed: true, result: { classification: 'exact_replay', receipt: retained.receipt, socketIncarnationId } };
      }
      if (input.expectedConnectionEpoch < state.lastConnectionEpoch) return { changed: false, result: { classification: 'stale', lastConnectionEpoch: state.lastConnectionEpoch } };
      if (input.expectedConnectionEpoch !== state.lastConnectionEpoch) fail('connection_predecessor_conflict', 'Connect expectedConnectionEpoch is not the durable predecessor');
      if (state.lastConnectionEpoch === Number.MAX_SAFE_INTEGER) fail('connection_epoch_overflow', 'Connection epoch cannot advance safely');

      const previousExecutor = state.executor;
      const sameExecutor = previousExecutor !== null && previousExecutor.id === input.executorId && previousExecutor.epoch === input.executorEpoch;
      if (!sameExecutor) state.capacityRevisionFloor = 0;
      const connectionEpoch = state.lastConnectionEpoch + 1;
      state.lastConnectionEpoch = connectionEpoch;
      state.connection = {
        id: input.connectionId,
        epoch: connectionEpoch,
        socketIncarnationId,
        connectRequestId: input.connectRequestId,
        requestDigest: input.requestDigest,
        executorId: input.executorId,
        executorEpoch: input.executorEpoch,
        protocolMetadataDigest: input.protocolMetadataDigest,
      };
      if (installableAgentTuple !== null) state.connection.installableAgentTuple = canonicalClone(installableAgentTuple);
      state.executor = { id: input.executorId, epoch: input.executorEpoch };
      state.capacity = null;
      const receipt = {
        connectReceiptId: typedDigest('tdev.agent-connect-receipt.v1', {
          ...routeIdentity(state),
          connectRequestId: input.connectRequestId,
          requestDigest: input.requestDigest,
          connectionId: input.connectionId,
          connectionEpoch,
          executorId: input.executorId,
          executorEpoch: input.executorEpoch,
        }),
        connectionId: input.connectionId,
        connectionEpoch,
        executorId: input.executorId,
        executorEpoch: input.executorEpoch,
        freshCapacityRequired: true,
      };
      state.connectReceipts[input.connectRequestId] = {
        requestDigest: input.requestDigest,
        expectedConnectionEpoch: input.expectedConnectionEpoch,
        connectionEpoch,
        receipt,
      };
      pruneConnectReceipts(state);
      return { changed: true, result: { classification: 'accepted', receipt, socketIncarnationId } };
    });
  }

  adoptLegacySocketIncarnation(input) {
    exactRecord(input, ['agentId', 'routeGeneration', 'connectionId', 'connectionEpoch'], ['socketIncarnationId'], 'legacy socket incarnation adoption');
    return this.#mutate((state) => {
      assertRouteInput(state, input);
      assertCurrentConnection(state, input);
      let socketIncarnationId = input.socketIncarnationId;
      if (socketIncarnationId !== undefined && socketIncarnationId !== null) {
        assertBoundedText(socketIncarnationId, 'socketIncarnationId', state.limits.maxIdentifierBytes, { identifier: true });
      } else {
        socketIncarnationId = `socket-incarnation-${state.revision + 1}`;
      }
      if (state.connection.socketIncarnationId !== null) {
        if (state.connection.socketIncarnationId !== socketIncarnationId && input.socketIncarnationId !== undefined) {
          fail('stale_connection_fence', 'Legacy socket cannot replace an already-bound physical incarnation');
        }
        return { changed: false, result: {
          classification: 'exact_replay',
          socketIncarnationId: state.connection.socketIncarnationId,
        } };
      }
      state.connection.socketIncarnationId = socketIncarnationId;
      return { changed: true, result: { classification: 'accepted', socketIncarnationId } };
    });
  }

  reattachConnection(input) {
    exactRecord(input, ['agentId', 'routeGeneration', 'connectionId', 'connectionEpoch', 'socketIncarnationId'], ['installableAgentTuple'], 'connection reattachment');
    const state = this.read();
    assertBoundedText(input.socketIncarnationId, 'socketIncarnationId', state.limits.maxIdentifierBytes, { identifier: true });
    assertCurrentConnection(state, input);
    if (state.connection.socketIncarnationId === null) fail('stale_connection_fence', 'Legacy physical socket incarnation is not yet bound');
    if (state.installableAgent.state === 'LEGACY_D0020_ONLY') {
      if (input.installableAgentTuple !== undefined && input.installableAgentTuple !== null) fail('installable_agent_tuple_conflict', 'Legacy D0020 connection cannot reattach with a D0027 tuple');
    } else {
      const supplied = normalizeInstallableAgentDataPlaneTuple(input.installableAgentTuple);
      if (state.connection.installableAgentTuple === undefined || state.connection.installableAgentTuple === null ||
          canonicalJson(supplied) !== canonicalJson(state.connection.installableAgentTuple)) {
        fail('stale_installable_agent_fence', 'Reattachment tuple does not match the durable physical connection');
      }
      assertInstallableConnectionCurrent(state);
    }
    return deepFreeze({
      classification: 'exact_replay',
      connectionId: state.connection.id,
      connectionEpoch: state.connection.epoch,
      socketIncarnationId: state.connection.socketIncarnationId,
      executorId: state.executor.id,
      executorEpoch: state.executor.epoch,
      syntheticEpochChange: false,
    });
  }

  disconnect(input) {
    exactRecord(input, ['agentId', 'routeGeneration', 'connectionId', 'connectionEpoch', 'socketIncarnationId'], ['installableAgentTuple'], 'disconnect');
    return this.#mutate((state) => {
      assertBoundedText(input.socketIncarnationId, 'socketIncarnationId', state.limits.maxIdentifierBytes, { identifier: true });
      assertCurrentConnection(state, input);
      if (state.installableAgent.state === 'LEGACY_D0020_ONLY') {
        if (input.installableAgentTuple !== undefined && input.installableAgentTuple !== null) fail('installable_agent_tuple_conflict', 'Legacy D0020 disconnect cannot carry a D0027 tuple');
      } else {
        const supplied = normalizeInstallableAgentDataPlaneTuple(input.installableAgentTuple);
        if (state.connection.installableAgentTuple === undefined || state.connection.installableAgentTuple === null ||
            canonicalJson(supplied) !== canonicalJson(state.connection.installableAgentTuple)) {
          fail('stale_installable_agent_fence', 'Disconnect tuple does not match the durable physical connection');
        }
      }
      state.connection = null;
      state.capacity = null;
      return { changed: true, result: {
        classification: 'accepted',
        connectionEpoch: state.lastConnectionEpoch,
        slotsReleased: 0,
        semanticRetryAuthorized: false,
      } };
    });
  }

  disconnectLegacyConnection(input) {
    exactRecord(input, ['agentId', 'routeGeneration', 'connectionId', 'connectionEpoch'], [], 'legacy connection disconnect');
    return this.#mutate((state) => {
      assertRouteInput(state, input);
      assertCurrentConnection(state, input);
      if (state.connection.socketIncarnationId !== null) {
        fail('stale_connection_fence', 'Legacy logical disconnect cannot clear an incarnation-bound connection');
      }
      state.connection = null;
      state.capacity = null;
      return { changed: true, result: {
        classification: 'accepted',
        connectionEpoch: state.lastConnectionEpoch,
        slotsReleased: 0,
        semanticRetryAuthorized: false,
      } };
    });
  }

  observeCapacity(input) {
    exactRecord(input, [
      'agentId', 'routeGeneration', 'connectionId', 'connectionEpoch', 'executorId', 'executorEpoch',
      'capacityRevision', 'reportedCapacity', 'requestDigest',
    ], [], 'capacity evidence');
    return this.#mutate((state) => {
      assertCurrentConnection(state, input);
      assertCurrentExecutor(state, input);
      assertSafeInteger(input.capacityRevision, 'capacityRevision', { min: 1 });
      assertSafeInteger(input.reportedCapacity, 'reportedCapacity', { min: 0 });
      assertDigest(input.requestDigest, 'requestDigest');
      const expectedDigest = computeAgentCapacityRequestDigest(capacityRequestContent(input));
      if (input.requestDigest !== expectedDigest) fail('capacity_digest_mismatch', 'Capacity request digest does not match canonical content');
      if (input.capacityRevision < state.capacityRevisionFloor) {
        return { changed: false, result: { classification: 'stale', effectiveCapacity: effectiveCapacity(state) } };
      }
      if (input.capacityRevision === state.capacityRevisionFloor) {
        if (state.capacity !== null && state.capacity.requestDigest === input.requestDigest && state.capacity.reportedCapacity === input.reportedCapacity) {
          return { changed: false, result: { classification: 'exact_replay', effectiveCapacity: state.capacity.effectiveCapacity } };
        }
        if (state.capacity === null) return { changed: false, result: { classification: 'stale', effectiveCapacity: 0 } };
        return { changed: false, result: { classification: 'conflict', effectiveCapacity: state.capacity.effectiveCapacity } };
      }
      state.capacityRevisionFloor = input.capacityRevision;
      state.capacity = {
        revision: input.capacityRevision,
        requestDigest: input.requestDigest,
        reportedCapacity: input.reportedCapacity,
        effectiveCapacity: Math.min(input.reportedCapacity, state.limits.maxAgentCapacity),
        connectionEpoch: input.connectionEpoch,
        executorId: input.executorId,
        executorEpoch: input.executorEpoch,
      };
      return { changed: true, result: {
        classification: 'monotonic_refinement',
        reportedCapacity: input.reportedCapacity,
        effectiveCapacity: state.capacity.effectiveCapacity,
      } };
    });
  }

  admission() {
    const state = this.read();
    assertInstallableConnectionCurrent(state);
    const capacity = effectiveCapacity(state);
    const occupied = occupiedSlots(state);
    return deepFreeze({
      capacityKnown: state.connection !== null && state.capacity !== null,
      reportedCapacity: state.capacity?.reportedCapacity ?? null,
      effectiveCapacity: capacity,
      occupiedSlots: occupied,
      availableSlots: Math.max(0, capacity - occupied),
      capacityRevision: state.capacity?.revision ?? null,
      liveBodyBytes: liveBodyBytes(state),
    });
  }

  reserve(input, { nowMs } = {}) {
    exactRecord(input, [
      'agentId', 'routeGeneration', 'reservationWindowGeneration', 'reservationRequestId', 'reservationRequestDigest',
      'executorId', 'executorEpoch', 'capacityRevision', 'caseId', 'taskId', 'expectedCaseRevision',
      'predictedAttemptOrdinal', 'requestedSlots', 'expiresAtMs', 'preflightDescriptor',
    ], [], 'reservation request');
    assertSafeInteger(nowMs, 'reservation nowMs', { min: 0 });
    return this.#mutate((state) => {
      assertRouteInput(state, input);
      assertInstallableConnectionCurrent(state);
      assertSafeInteger(input.reservationWindowGeneration, 'reservationWindowGeneration', { min: 1 });
      assertBoundedText(input.reservationRequestId, 'reservationRequestId', state.limits.maxIdentifierBytes, { identifier: true });
      assertDigest(input.reservationRequestDigest, 'reservationRequestDigest');
      if (input.reservationWindowGeneration < state.minimumAcceptedReservationWindow) fail('reservation_stale', 'Reservation generation is permanently closed');
      if (input.reservationWindowGeneration > state.reservationWindowGeneration) fail('reservation_future_generation', 'Reservation generation is unsupported future input');
      const expectedDigest = computeAgentReservationRequestDigest(input, state.limits);
      if (input.reservationRequestDigest !== expectedDigest) fail('reservation_digest_mismatch', 'Reservation request digest does not match canonical content');
      const existing = state.reservations[input.reservationRequestId];
      if (existing) {
        if (existing.reservationRequestDigest !== input.reservationRequestDigest) fail('reservation_conflict', 'Reservation request identity was reused with a different digest');
        return { changed: false, result: { classification: 'exact_replay', reservation: existing } };
      }
      if (input.reservationWindowGeneration !== state.reservationWindowGeneration) fail('reservation_stale', 'Reservation generation is no longer open');
      compactState(state, nowMs);
      if (Object.keys(state.reservations).length >= state.limits.maxReservations) {
        fail('reservation_window_detail_limit', 'Open reservation window detail budget is exhausted and must drain before rollover');
      }
      if (state.connection === null || state.capacity === null) fail('capacity_unavailable', 'Fresh current-connection capacity evidence is required before reservation admission');
      assertCurrentExecutor(state, input);
      assertSafeInteger(input.capacityRevision, 'capacityRevision', { min: 1 });
      if (input.capacityRevision !== state.capacity.revision) fail('stale_capacity_revision', 'Reservation does not bind the exact accepted capacity revision');
      for (const field of ['caseId', 'taskId']) assertBoundedText(input[field], field, state.limits.maxIdentifierBytes, { identifier: true });
      assertSafeInteger(input.expectedCaseRevision, 'expectedCaseRevision', { min: 0 });
      assertSafeInteger(input.predictedAttemptOrdinal, 'predictedAttemptOrdinal', { min: 1 });
      assertSafeInteger(input.requestedSlots, 'requestedSlots', { min: 1, max: state.limits.maxSlotsPerReservation });
      assertSafeInteger(input.expiresAtMs, 'expiresAtMs', { min: 1 });
      if (input.expiresAtMs <= nowMs) fail('reservation_expired', 'Reservation expiry must be in the future');
      if (input.expiresAtMs - nowMs > state.limits.maxReservationLifetimeMs) fail('reservation_lifetime_limit', 'Reservation lifetime exceeds the configured bound');
      const descriptor = normalizeAgentPreflightDescriptor(input.preflightDescriptor, state.limits);
      if (input.requestedSlots > state.capacity.effectiveCapacity) fail('reservation_oversized', 'Requested physical capacity exceeds current aggregate capacity');
      if (input.requestedSlots > Math.max(0, state.capacity.effectiveCapacity - occupiedSlots(state))) fail('capacity_saturated', 'Aggregate Agent physical capacity is saturated');
      if (liveBodyBytes(state) + descriptor.executableBodyBytes > state.limits.maxAggregateLiveBodyBytes) {
        fail('aggregate_live_body_limit', 'Aggregate live executable-body budget is exhausted');
      }
      if (Object.keys(state.deliveries).length >= state.limits.maxDeliveries) fail('delivery_state_limit', 'Retained delivery/effect state budget is exhausted');
      if (state.nextSlotGeneration === Number.MAX_SAFE_INTEGER) fail('slot_generation_overflow', 'Slot generation cannot advance safely');
      const slotGeneration = state.nextSlotGeneration;
      state.nextSlotGeneration += 1;
      const preflightDescriptorDigest = agentPreflightDescriptorDigest(descriptor, state.limits);
      const slotToken = typedDigest('tdev.agent-slot.v1', {
        ...routeIdentity(state),
        reservationWindowGeneration: state.reservationWindowGeneration,
        reservationRequestId: input.reservationRequestId,
        reservationRequestDigest: input.reservationRequestDigest,
        slotGeneration,
      });
      const reservation = {
        reservationRequestId: input.reservationRequestId,
        reservationRequestDigest: input.reservationRequestDigest,
        windowGeneration: state.reservationWindowGeneration,
        executorId: input.executorId,
        executorEpoch: input.executorEpoch,
        capacityRevision: input.capacityRevision,
        caseId: input.caseId,
        taskId: input.taskId,
        expectedCaseRevision: input.expectedCaseRevision,
        predictedAttemptOrdinal: input.predictedAttemptOrdinal,
        requestedSlots: input.requestedSlots,
        expiresAtMs: input.expiresAtMs,
        preflightDescriptor: descriptor,
        preflightDescriptorDigest,
        slotToken,
        slotGeneration,
        status: 'reserved',
        terminalAtMs: null,
      };
      state.reservations[input.reservationRequestId] = reservation;
      return { changed: true, result: { classification: 'accepted', reservation } };
    });
  }

  releaseReservation(input, { nowMs } = {}) {
    exactRecord(input, ['reservationWindowGeneration', 'reservationRequestId', 'reservationRequestDigest'], [], 'reservation release');
    assertSafeInteger(nowMs, 'reservation release nowMs', { min: 0 });
    return this.#mutate((state) => {
      if (input.reservationWindowGeneration < state.minimumAcceptedReservationWindow) return { changed: false, result: { classification: 'stale' } };
      if (input.reservationWindowGeneration !== state.reservationWindowGeneration) fail('reservation_window_mismatch', 'Reservation generation is not open');
      const reservation = state.reservations[input.reservationRequestId];
      if (!reservation) fail('unknown_reservation', 'Reservation does not exist in the open window');
      if (reservation.reservationRequestDigest !== input.reservationRequestDigest) fail('reservation_conflict', 'Reservation release digest conflicts');
      if (['released', 'expired'].includes(reservation.status)) return { changed: false, result: { classification: 'exact_replay', reservation } };
      if (reservation.status === 'activated') fail('reservation_activated', 'Activated reservation is owned by its delivery');
      reservation.status = 'released';
      reservation.terminalAtMs = nowMs;
      return { changed: true, result: { classification: 'accepted', reservation } };
    });
  }

  expireReservation(input, { nowMs } = {}) {
    exactRecord(input, ['reservationWindowGeneration', 'reservationRequestId', 'reservationRequestDigest'], [], 'reservation expiry');
    assertSafeInteger(nowMs, 'reservation expiry nowMs', { min: 0 });
    return this.#mutate((state) => {
      if (input.reservationWindowGeneration < state.minimumAcceptedReservationWindow) return { changed: false, result: { classification: 'stale' } };
      if (input.reservationWindowGeneration !== state.reservationWindowGeneration) fail('reservation_window_mismatch', 'Reservation generation is not open');
      const reservation = state.reservations[input.reservationRequestId];
      if (!reservation) fail('unknown_reservation', 'Reservation does not exist in the open window');
      if (reservation.reservationRequestDigest !== input.reservationRequestDigest) fail('reservation_conflict', 'Reservation expiry digest conflicts');
      if (reservation.status === 'expired') return { changed: false, result: { classification: 'exact_replay', reservation } };
      if (reservation.status !== 'reserved') fail('reservation_not_expirable', 'Only a live reservation may expire');
      if (nowMs < reservation.expiresAtMs) fail('reservation_not_due', 'Reservation has not reached its bounded expiry');
      reservation.status = 'expired';
      reservation.terminalAtMs = nowMs;
      return { changed: true, result: {
        classification: 'accepted',
        reservation,
        deliveryActivated: false,
        executableSendAuthorized: false,
      } };
    });
  }

  rollReservationWindow(input, { nowMs } = {}) {
    exactRecord(input, ['expectedGeneration'], [], 'reservation window rollover');
    assertSafeInteger(nowMs, 'reservation rollover nowMs', { min: 0 });
    return this.#mutate((state) => {
      assertSafeInteger(input.expectedGeneration, 'expectedGeneration', { min: 1 });
      if (input.expectedGeneration < state.reservationWindowGeneration) return { changed: false, result: { classification: 'stale', generation: state.reservationWindowGeneration } };
      if (input.expectedGeneration !== state.reservationWindowGeneration) fail('reservation_window_mismatch', 'Reservation window rollover target is not current');
      if (state.reservationWindowGeneration === Number.MAX_SAFE_INTEGER) fail('reservation_window_overflow', 'Reservation window cannot advance safely');
      for (const reservation of Object.values(state.reservations)) {
        if (reservation.status === 'reserved') fail('reservation_window_busy', 'Open reservation window still contains a live reservation');
        const terminalAtMs = reservation.terminalAtMs;
        if (terminalAtMs === null || nowMs - terminalAtMs < state.limits.reservationReplayGraceMs) {
          fail('reservation_replay_grace', 'Open reservation window replay grace has not elapsed');
        }
      }
      for (const delivery of Object.values(state.deliveries)) {
        if (delivery.reservationWindowGeneration === state.reservationWindowGeneration && delivery.slotHeld) {
          fail('reservation_window_busy', 'A delivery from the open reservation window still consumes admission/physical capacity');
        }
      }
      state.reservationWindowGeneration += 1;
      state.minimumAcceptedReservationWindow = state.reservationWindowGeneration;
      state.reservations = createRecord();
      compactState(state, nowMs);
      return { changed: true, result: { classification: 'accepted', generation: state.reservationWindowGeneration } };
    });
  }

  activateDelivery(input, { nowMs } = {}) {
    exactRecord(input, [
      'agentId', 'routeGeneration', 'activationRequestId', 'activationRequestDigest',
      'reservationWindowGeneration', 'reservationRequestId', 'reservationRequestDigest', 'slotToken', 'slotGeneration',
      'deliveryId', 'caseId', 'taskId', 'attemptId', 'attemptOrdinal', 'executorId', 'executorEpoch', 'fencingToken',
      'sourceCaseRevision', 'executableBodyDigest', 'executableBodyBytes', 'envelopeBytes', 'protocolVersion', 'effectKey',
    ], [], 'delivery activation');
    assertSafeInteger(nowMs, 'activation nowMs', { min: 0 });
    return this.#mutate((state) => {
      assertRouteInput(state, input);
      assertInstallableConnectionCurrent(state);
      for (const field of ['activationRequestId', 'reservationRequestId', 'caseId', 'taskId', 'attemptId', 'executorId']) {
        assertBoundedText(input[field], field, state.limits.maxIdentifierBytes, { identifier: true });
      }
      assertDigest(input.activationRequestDigest, 'activationRequestDigest');
      assertDigest(input.reservationRequestDigest, 'reservationRequestDigest');
      assertDigest(input.slotToken, 'slotToken');
      assertDigest(input.deliveryId, 'deliveryId');
      assertDigest(input.fencingToken, 'fencingToken');
      assertDigest(input.executableBodyDigest, 'executableBodyDigest');
      if (input.effectKey !== null) assertDigest(input.effectKey, 'effectKey');
      for (const field of ['reservationWindowGeneration', 'slotGeneration', 'attemptOrdinal', 'executorEpoch', 'sourceCaseRevision', 'executableBodyBytes', 'envelopeBytes']) {
        assertSafeInteger(input[field], field, { min: field === 'sourceCaseRevision' || field.endsWith('Bytes') ? 0 : 1 });
      }
      assertBoundedText(input.protocolVersion, 'protocolVersion', state.limits.maxProtocolMetadataBytes, { identifier: true });
      const expectedActivationDigest = computeAgentActivationRequestDigest(input);
      if (input.activationRequestDigest !== expectedActivationDigest) fail('activation_digest_mismatch', 'Activation request digest does not match canonical content');
      const expectedDeliveryId = computeAgentDeliveryId({
        agentId: input.agentId,
        routeGeneration: input.routeGeneration,
        caseId: input.caseId,
        taskId: input.taskId,
        attemptId: input.attemptId,
        executorId: input.executorId,
        executorEpoch: input.executorEpoch,
        fencingToken: input.fencingToken,
      });
      if (input.deliveryId !== expectedDeliveryId) fail('delivery_identity_mismatch', 'deliveryId does not bind the exact Agent/Attempt/executor identity');
      compactState(state, nowMs);
      const existingDelivery = state.deliveries[input.deliveryId];
      if (existingDelivery) {
        if (existingDelivery.activationRequestDigest === input.activationRequestDigest && existingDelivery.activationRequestId === input.activationRequestId) {
          return { changed: false, result: { classification: 'exact_replay', delivery: existingDelivery } };
        }
        fail('delivery_conflict', 'Delivery identity was reused with different activation content');
      }
      const existingTombstone = state.deliveryTombstones[input.deliveryId];
      if (existingTombstone) {
        if (existingTombstone.activationRequestDigest === input.activationRequestDigest && existingTombstone.activationRequestId === input.activationRequestId) {
          return { changed: false, result: { classification: 'exact_replay', delivery: existingTombstone.receipt } };
        }
        fail('delivery_conflict', 'Delivery identity was reused with different activation content');
      }
      for (const delivery of Object.values(state.deliveries)) {
        if (delivery.activationRequestId === input.activationRequestId) {
          fail('activation_request_conflict', 'Activation request identity was reused for a different delivery');
        }
      }
      for (const tombstone of Object.values(state.deliveryTombstones)) {
        if (tombstone.activationRequestId === input.activationRequestId) {
          fail('activation_request_conflict', 'Activation request identity was reused for a different delivery');
        }
      }
      if (Object.keys(state.deliveries).length >= state.limits.maxDeliveries) fail('delivery_state_limit', 'Retained delivery/effect state budget is exhausted');
      if (input.reservationWindowGeneration < state.minimumAcceptedReservationWindow) fail('reservation_stale', 'Activation references a permanently closed reservation generation');
      if (input.reservationWindowGeneration !== state.reservationWindowGeneration) fail('reservation_window_mismatch', 'Activation reservation generation is not open');
      const reservation = state.reservations[input.reservationRequestId];
      if (!reservation) fail('unknown_reservation', 'Activation reservation does not exist');
      if (reservation.status === 'expired' || nowMs >= reservation.expiresAtMs) fail('reservation_expired', 'Activation cannot consume an expired reservation');
      if (reservation.status !== 'reserved') fail('reservation_not_activatable', 'Reservation is not available for activation');
      assertCurrentExecutor(state, input);
      const immutableChecks = [
        ['reservationRequestDigest', input.reservationRequestDigest],
        ['slotToken', input.slotToken],
        ['slotGeneration', input.slotGeneration],
        ['caseId', input.caseId],
        ['taskId', input.taskId],
        ['executorId', input.executorId],
        ['executorEpoch', input.executorEpoch],
      ];
      for (const [field, value] of immutableChecks) {
        if (reservation[field] !== value) fail('activation_substitution', `Activation changed reserved ${field}`);
      }
      if (reservation.predictedAttemptOrdinal !== input.attemptOrdinal) {
        fail('activation_attempt_ordinal_mismatch', 'Activation Attempt ordinal does not match the pre-Attempt reservation');
      }
      if (input.sourceCaseRevision <= reservation.expectedCaseRevision) {
        fail('activation_case_revision_mismatch', 'Activation Case revision did not advance beyond the reservation predecessor');
      }
      const expectedAttemptId = `${input.taskId}.${input.attemptOrdinal}`;
      if (input.attemptId !== expectedAttemptId) {
        fail('activation_attempt_identity_mismatch', 'Activation Attempt identity does not match the reserved predicted Attempt ordinal');
      }
      const descriptor = reservation.preflightDescriptor;
      if (descriptor.executableBodyDigest !== input.executableBodyDigest || descriptor.executableBodyBytes !== input.executableBodyBytes) {
        fail('activation_substitution', 'Activation executable body does not match its immutable preflight descriptor');
      }
      if (descriptor.protocolVersion !== input.protocolVersion) fail('activation_substitution', 'Activation protocol version does not match its immutable preflight descriptor');
      if (input.envelopeBytes > descriptor.maxEnvelopeBytes || input.envelopeBytes > state.limits.maxEnvelopeBytes) {
        fail('activation_envelope_limit', 'Activated envelope exceeds the reserved/configured bound');
      }
      reservation.status = 'activated';
      reservation.terminalAtMs = nowMs;
      const activationDigest = typedDigest('tdev.agent-delivery-activation.v1', activationRequestContent(input));
      const activationReceiptId = typedDigest('tdev.agent-activation-receipt.v1', {
        ...routeIdentity(state),
        deliveryId: input.deliveryId,
        activationRequestId: input.activationRequestId,
        activationRequestDigest: input.activationRequestDigest,
      });
      const delivery = {
        deliveryId: input.deliveryId,
        activationRequestId: input.activationRequestId,
        activationRequestDigest: input.activationRequestDigest,
        activationReceiptId,
        activationDigest,
        routeGeneration: state.routeBinding.routeGeneration,
        reservationWindowGeneration: input.reservationWindowGeneration,
        reservationRequestId: input.reservationRequestId,
        reservationRequestDigest: input.reservationRequestDigest,
        slotToken: input.slotToken,
        slotGeneration: input.slotGeneration,
        preflightDescriptorDigest: reservation.preflightDescriptorDigest,
        executableBodyDigest: input.executableBodyDigest,
        executableBodyBytes: input.executableBodyBytes,
        envelopeBytes: input.envelopeBytes,
        protocolVersion: input.protocolVersion,
        requestedSlots: reservation.requestedSlots,
        caseId: input.caseId,
        taskId: input.taskId,
        attemptId: input.attemptId,
        attemptOrdinal: input.attemptOrdinal,
        reservationExpectedCaseRevision: reservation.expectedCaseRevision,
        sourceCaseRevision: input.sourceCaseRevision,
        executorId: input.executorId,
        executorEpoch: input.executorEpoch,
        fencingToken: input.fencingToken,
        effectKey: input.effectKey,
        effect: input.effectKey === null ? 'not_applicable' : 'unknown',
        dispatches: createRecord(),
        localEvidenceRevision: 0,
        lastEvidenceDigest: null,
        lastEvidenceOrdinal: null,
        evidenceConflict: null,
        slotHeld: true,
        slotKind: 'admission',
        closedUndispatched: false,
        terminalCaseReceipt: null,
        terminalAtMs: null,
      };
      state.deliveries[input.deliveryId] = delivery;
      return { changed: true, result: { classification: 'accepted', delivery } };
    });
  }

  grantCommand(deliveryId, dispatchOrdinal = 1) {
    assertDigest(deliveryId, 'deliveryId');
    const state = this.read();
    assertInstallableConnectionCurrent(state);
    assertSafeInteger(dispatchOrdinal, 'dispatchOrdinal', { min: 1, max: state.limits.maxDispatchOrdinalsPerDelivery });
    const delivery = state.deliveries[deliveryId];
    if (!delivery) fail('unknown_delivery', 'Delivery does not exist');
    if (delivery.closedUndispatched) fail('delivery_closed', 'Delivery was closed before dispatch');
    if (delivery.evidenceConflict !== null) fail('delivery_evidence_conflict', 'Conflicted delivery cannot request a new executable grant');
    if (dispatchOrdinal > 1) {
      const previous = delivery.dispatches[String(dispatchOrdinal - 1)];
      if (!safeNegativeReplay(previous)) fail('dispatch_replay_unsafe', 'A later dispatch ordinal requires positive predecessor not-sent/not-started/no-handle proof');
      if (!delivery.slotHeld || delivery.slotKind !== 'admission') fail('delivery_admission_required', 'A later dispatch ordinal requires a reacquired admission-capacity unit');
    }
    return deepFreeze({
      type: 'grant_attempt_dispatch',
      caseId: delivery.caseId,
      taskId: delivery.taskId,
      attemptId: delivery.attemptId,
      executorId: delivery.executorId,
      executorEpoch: delivery.executorEpoch,
      fencingToken: delivery.fencingToken,
      agentId: state.routeBinding.agentId,
      routeGeneration: delivery.routeGeneration,
      deliveryId: delivery.deliveryId,
      activationReceiptId: delivery.activationReceiptId,
      activationDigest: delivery.activationDigest,
      reservationWindowGeneration: delivery.reservationWindowGeneration,
      reservationRequestId: delivery.reservationRequestId,
      reservationRequestDigest: delivery.reservationRequestDigest,
      slotToken: delivery.slotToken,
      slotGeneration: delivery.slotGeneration,
      preflightDescriptorDigest: delivery.preflightDescriptorDigest,
      dispatchOrdinal,
    });
  }

  authorizeDispatch(input) {
    exactRecord(input, ['grantRequestId', 'command', 'dispatchGrantId', 'committedCaseRevision', 'event'], [], 'dispatch authorization');
    return this.#mutate((state) => {
      assertBoundedText(input.grantRequestId, 'grantRequestId', state.limits.maxIdentifierBytes, { identifier: true });
      assertDigest(input.dispatchGrantId, 'dispatchGrantId');
      assertSafeInteger(input.committedCaseRevision, 'committedCaseRevision', { min: 1 });
      exactRecord(input.event, ['sequence', 'caseRevision', 'eventDigest'], [], 'grant event');
      assertSafeInteger(input.event.sequence, 'grant event sequence', { min: 1 });
      assertSafeInteger(input.event.caseRevision, 'grant event caseRevision', { min: 1 });
      assertDigest(input.event.eventDigest, 'grant event digest');
      if (input.event.caseRevision !== input.committedCaseRevision) fail('dispatch_grant_receipt_mismatch', 'Grant event revision does not match committed Case revision');
      const command = canonicalClone(input.command);
      const expectedGrantId = computeDispatchGrantId(command.caseId, input.grantRequestId, command);
      if (input.dispatchGrantId !== expectedGrantId) fail('dispatch_grant_digest_mismatch', 'Case dispatch grant digest is invalid');
      if (command.type !== 'grant_attempt_dispatch') fail('dispatch_grant_command_mismatch', 'Case grant command type is invalid');
      assertRouteInput(state, command);
      const delivery = state.deliveries[command.deliveryId];
      if (!delivery) fail('unknown_delivery', 'Case grant targets an unknown delivery');
      assertSafeInteger(command.dispatchOrdinal, 'dispatchOrdinal', { min: 1, max: state.limits.maxDispatchOrdinalsPerDelivery });
      const ordinalKey = String(command.dispatchOrdinal);
      const existing = delivery.dispatches[ordinalKey];
      if (existing) {
        if (existing.dispatchGrantId === input.dispatchGrantId && existing.grantRequestId === input.grantRequestId) {
          return { changed: false, result: { classification: 'exact_replay', authorization: existing } };
        }
        fail('dispatch_authorization_conflict', 'Delivery ordinal already has a different dispatch authorization');
      }
      if (delivery.closedUndispatched) fail('delivery_closed', 'Delivery was closed before dispatch');
      if (delivery.evidenceConflict !== null) fail('delivery_evidence_conflict', 'Conflicted delivery cannot authorize executable initiation');
      const expectedCommand = this.grantCommand(command.deliveryId, command.dispatchOrdinal);
      if (canonicalJson(command) !== canonicalJson(expectedCommand)) fail('dispatch_grant_binding_mismatch', 'Case grant does not bind the exact activated delivery');
      if (state.connection === null || state.executor === null || state.executor.id !== delivery.executorId || state.executor.epoch !== delivery.executorEpoch) {
        fail('stale_executor_fence', 'Delivery executor is no longer current');
      }
      assertInstallableConnectionCurrent(state);
      const installableAgentTuple = state.installableAgent.state === 'LEGACY_D0020_ONLY'
        ? null
        : installableAgentCurrentTuple(state.installableAgent, { executable: true });
      const socketIncarnationId = state.connection.socketIncarnationId;
      if (installableAgentTuple !== null && socketIncarnationId === null) {
        fail('physical_socket_incarnation_required', 'D0027 dispatch authorization requires the current physical socket incarnation');
      }
      const authorizationIdentity = {
        ...routeIdentity(state),
        deliveryId: delivery.deliveryId,
        dispatchOrdinal: command.dispatchOrdinal,
        dispatchGrantId: input.dispatchGrantId,
        connectionId: state.connection.id,
        connectionEpoch: state.connection.epoch,
        executorId: state.executor.id,
        executorEpoch: state.executor.epoch,
      };
      if (installableAgentTuple !== null) {
        authorizationIdentity.socketIncarnationId = socketIncarnationId;
        authorizationIdentity.installableAgentTuple = canonicalClone(installableAgentTuple);
      }
      const authorizationId = typedDigest(
        installableAgentTuple === null ? 'tdev.agent-dispatch-authorization.v1' : 'tdev.agent-dispatch-authorization.v2',
        authorizationIdentity,
      );
      const dispatch = {
        dispatchOrdinal: command.dispatchOrdinal,
        dispatchGrantId: input.dispatchGrantId,
        grantRequestId: input.grantRequestId,
        authorizationId,
        committedCaseRevision: input.committedCaseRevision,
        event: canonicalClone(input.event),
        connectionId: state.connection.id,
        connectionEpoch: state.connection.epoch,
        executorId: state.executor.id,
        executorEpoch: state.executor.epoch,
        firstSendClaim: null,
        evidence: emptyDispatchEvidence(),
      };
      if (installableAgentTuple !== null) {
        dispatch.socketIncarnationId = socketIncarnationId;
        dispatch.installableAgentTuple = canonicalClone(installableAgentTuple);
        dispatch.firstEmissionAdmission = null;
      }
      delivery.dispatches[ordinalKey] = dispatch;
      return { changed: true, result: { classification: 'accepted', authorization: dispatch } };
    });
  }

  claimFirstSend(input) {
    exactRecord(input, ['deliveryId', 'authorizationId', 'dispatchOrdinal', 'dispatchGrantId'], [], 'first send claim');
    return this.#mutate((state) => {
      if (state.installableAgent.state !== 'LEGACY_D0020_ONLY') {
        fail('installable_agent_first_emission_required', 'D0027 dispatch cannot use the transferable D0020 first-send claim');
      }
      assertDigest(input.deliveryId, 'deliveryId');
      assertDigest(input.authorizationId, 'authorizationId');
      assertDigest(input.dispatchGrantId, 'dispatchGrantId');
      assertSafeInteger(input.dispatchOrdinal, 'dispatchOrdinal', { min: 1, max: state.limits.maxDispatchOrdinalsPerDelivery });
      const delivery = state.deliveries[input.deliveryId];
      if (!delivery) fail('dispatch_not_authorized', 'Delivery does not exist');
      if (delivery.evidenceConflict !== null) fail('delivery_evidence_conflict', 'Conflicted delivery cannot initiate a new send');
      const dispatch = delivery.dispatches[String(input.dispatchOrdinal)];
      if (!dispatch) fail('dispatch_not_authorized', 'Delivery ordinal has no durable dispatch authorization');
      if (dispatch.authorizationId !== input.authorizationId || dispatch.dispatchGrantId !== input.dispatchGrantId) {
        fail('dispatch_authorization_mismatch', 'First-send claim does not match durable authorization');
      }
      if (state.connection === null || state.executor === null ||
          state.connection.id !== dispatch.connectionId || state.connection.epoch !== dispatch.connectionEpoch ||
          state.executor.id !== dispatch.executorId || state.executor.epoch !== dispatch.executorEpoch) {
        fail('stale_connection_fence', 'Authorization is fenced to a predecessor connection/executor');
      }
      if (dispatch.firstSendClaim !== null) {
        return { changed: false, result: {
          classification: 'exact_replay',
          maySend: false,
          possibleExecution: true,
          claimId: dispatch.firstSendClaim.claimId,
        } };
      }
      const claimId = typedDigest('tdev.agent-first-send-claim.v1', {
        authorizationId: dispatch.authorizationId,
        connectionId: dispatch.connectionId,
        connectionEpoch: dispatch.connectionEpoch,
      });
      dispatch.firstSendClaim = { claimId, authorizationId: dispatch.authorizationId };
      return { changed: true, result: { classification: 'accepted', maySend: true, possibleExecution: true, claimId } };
    });
  }

  initiateFirstEmission(input, initiatePhysicalSend) {
    exactRecord(input, ['deliveryId', 'authorizationId', 'dispatchOrdinal', 'dispatchGrantId'], [], 'D0027 first-emission admission');
    if (typeof initiatePhysicalSend !== 'function') fail('invalid_first_emission_initiator', 'D0027 first-emission admission requires an immediate physical-send initiator');
    const admission = this.#mutate((state) => {
      if (state.installableAgent.state === 'LEGACY_D0020_ONLY') {
        fail('installable_agent_first_emission_not_applicable', 'Legacy D0020 route uses its existing first-send claim path');
      }
      assertDigest(input.deliveryId, 'deliveryId');
      assertDigest(input.authorizationId, 'authorizationId');
      assertDigest(input.dispatchGrantId, 'dispatchGrantId');
      assertSafeInteger(input.dispatchOrdinal, 'dispatchOrdinal', { min: 1, max: state.limits.maxDispatchOrdinalsPerDelivery });
      const delivery = state.deliveries[input.deliveryId];
      if (!delivery) fail('dispatch_not_authorized', 'Delivery does not exist');
      if (delivery.evidenceConflict !== null) fail('delivery_evidence_conflict', 'Conflicted delivery cannot initiate a new send');
      const dispatch = delivery.dispatches[String(input.dispatchOrdinal)];
      if (!dispatch) fail('dispatch_not_authorized', 'Delivery ordinal has no durable dispatch authorization');
      if (dispatch.authorizationId !== input.authorizationId || dispatch.dispatchGrantId !== input.dispatchGrantId) {
        fail('dispatch_authorization_mismatch', 'First-emission admission does not match durable authorization');
      }
      if (dispatch.firstEmissionAdmission !== null) {
        return { changed: false, result: {
          classification: 'exact_replay',
          maySend: false,
          possibleExecution: true,
          admissionId: dispatch.firstEmissionAdmission.admissionId,
          tupleDigest: dispatch.firstEmissionAdmission.tupleDigest,
        } };
      }
      const currentTuple = installableAgentCurrentTuple(state.installableAgent, { executable: true });
      if (dispatch.installableAgentTuple === undefined || dispatch.installableAgentTuple === null ||
          dispatch.socketIncarnationId === undefined || dispatch.socketIncarnationId === null) {
        fail('stale_installable_agent_fence', 'Dispatch authorization predates the D0027 current tuple');
      }
      if (canonicalJson(dispatch.installableAgentTuple) !== canonicalJson(currentTuple)) {
        fail('stale_installable_agent_fence', 'Dispatch authorization is fenced to a predecessor D0027 tuple');
      }
      if (state.connection === null || state.executor === null || state.connection.socketIncarnationId === null ||
          state.connection.id !== dispatch.connectionId || state.connection.epoch !== dispatch.connectionEpoch ||
          state.connection.socketIncarnationId !== dispatch.socketIncarnationId ||
          state.executor.id !== dispatch.executorId || state.executor.epoch !== dispatch.executorEpoch) {
        fail('stale_connection_fence', 'First-emission admission is fenced to a predecessor connection/socket/executor');
      }
      const tupleDigest = currentTupleDigest(state.installableAgent);
      const admissionId = typedDigest('tdev.agent-first-emission-admission.v1', {
        ...routeIdentity(state),
        installableAgentTuple: currentTuple,
        connectionId: dispatch.connectionId,
        connectionEpoch: dispatch.connectionEpoch,
        socketIncarnationId: dispatch.socketIncarnationId,
        executorId: dispatch.executorId,
        executorEpoch: dispatch.executorEpoch,
        deliveryId: delivery.deliveryId,
        dispatchOrdinal: dispatch.dispatchOrdinal,
        dispatchGrantId: dispatch.dispatchGrantId,
        authorizationId: dispatch.authorizationId,
      });
      dispatch.firstEmissionAdmission = { admissionId, authorizationId: dispatch.authorizationId, tupleDigest };
      return { changed: true, result: {
        classification: 'accepted',
        maySend: true,
        possibleExecution: true,
        admissionId,
        tupleDigest,
        installableAgentTuple: canonicalClone(currentTuple),
        socketIncarnationId: dispatch.socketIncarnationId,
      } };
    });
    if (!admission.maySend) return admission;
    try {
      const initiated = initiatePhysicalSend(admission);
      if (initiated !== null && (typeof initiated === 'object' || typeof initiated === 'function') && typeof initiated.then === 'function') {
        return deepFreeze({
          ...canonicalClone(admission),
          classification: 'send_outcome_unknown',
          maySend: false,
          physicalSendInitiated: false,
          errorCode: 'async_first_emission_initiator_forbidden',
        });
      }
      return deepFreeze({
        ...canonicalClone(admission),
        classification: 'send_initiated',
        maySend: false,
        physicalSendInitiated: true,
      });
    } catch (cause) {
      return deepFreeze({
        ...canonicalClone(admission),
        classification: 'send_outcome_unknown',
        maySend: false,
        physicalSendInitiated: false,
        errorCode: cause?.code ?? 'physical_send_initiation_failed',
      });
    }
  }

  closeUndispatchedDelivery(deliveryId, { nowMs = null } = {}) {
    assertDigest(deliveryId, 'deliveryId');
    if (nowMs !== null) assertSafeInteger(nowMs, 'close undispatched nowMs', { min: 0 });
    return this.#mutate((state) => {
      const delivery = state.deliveries[deliveryId];
      if (!delivery) {
        if (state.deliveryTombstones[deliveryId]) return { changed: false, result: { classification: 'stale', reason: 'retired_delivery' } };
        fail('unknown_delivery', 'Delivery does not exist');
      }
      if (Object.keys(delivery.dispatches).length !== 0) fail('possible_execution', 'Dispatch authorization exists; absence must come from exact ordinal evidence');
      if (delivery.closedUndispatched) return { changed: false, result: { classification: 'exact_replay', slotReleased: false } };
      delivery.closedUndispatched = true;
      const slotReleased = delivery.slotHeld;
      delivery.slotHeld = false;
      delivery.slotKind = 'none';
      if (delivery.effect === 'unknown') delivery.effect = 'not_applied';
      if (nowMs !== null) delivery.terminalAtMs = nowMs;
      const result = {
        classification: 'monotonic_refinement',
        dispatchAuthorized: false,
        positivelyNotSent: true,
        executionNotStarted: true,
        noHandle: true,
        effect: delivery.effect,
        slotReleased,
      };
      if (nowMs !== null) compactState(state, nowMs);
      return { changed: true, result: { ...result, retired: state.deliveryTombstones[deliveryId] !== undefined } };
    });
  }

  bindTerminalCaseReceipt(input, { nowMs } = {}) {
    exactRecord(input, ['deliveryId', 'command', 'caseReceipt'], [], 'terminal Case receipt binding');
    assertSafeInteger(nowMs, 'terminal Case receipt nowMs', { min: 0 });
    return this.#mutate((state) => {
      assertDigest(input.deliveryId, 'deliveryId');
      const delivery = state.deliveries[input.deliveryId];
      if (!delivery) {
        const tombstone = state.deliveryTombstones[input.deliveryId];
        if (tombstone !== undefined) {
          return { changed: false, result: { classification: 'stale', reason: 'retired_delivery', receipt: tombstone.receipt } };
        }
        return { changed: false, result: { classification: 'stale', reason: 'unknown_or_gc_delivery' } };
      }
      if (delivery.slotHeld) {
        fail('delivery_slot_held', 'Terminal Case receipt cannot retire a delivery while admission/physical capacity is still held');
      }
      const terminalCaseReceipt = normalizeTerminalCaseReceipt(delivery, input.command, input.caseReceipt, state.limits);
      if (delivery.terminalCaseReceipt !== null) {
        if (canonicalJson(delivery.terminalCaseReceipt) === canonicalJson(terminalCaseReceipt)) {
          return { changed: false, result: { classification: 'exact_replay', terminalCaseReceipt } };
        }
        fail('case_terminal_receipt_conflict', 'Delivery already binds a different terminal Case receipt');
      }
      delivery.terminalCaseReceipt = terminalCaseReceipt;
      delivery.terminalAtMs = nowMs;
      compactState(state, nowMs);
      const tombstone = state.deliveryTombstones[input.deliveryId];
      return { changed: true, result: {
        classification: 'accepted',
        retired: tombstone !== undefined,
        terminalCaseReceipt,
        receipt: tombstone?.receipt ?? null,
      } };
    });
  }

  reacquireDeliveryAdmission(input) {
    exactRecord(input, ['deliveryId', 'expectedNextOrdinal'], [], 'delivery admission reacquisition');
    return this.#mutate((state) => {
      assertInstallableConnectionCurrent(state);
      assertDigest(input.deliveryId, 'deliveryId');
      assertSafeInteger(input.expectedNextOrdinal, 'expectedNextOrdinal', { min: 2, max: state.limits.maxDispatchOrdinalsPerDelivery });
      const delivery = state.deliveries[input.deliveryId];
      if (!delivery) fail('unknown_delivery', 'Delivery does not exist');
      if (delivery.evidenceConflict !== null) fail('delivery_evidence_conflict', 'Conflicted delivery cannot reacquire executable admission');
      if (delivery.slotHeld) return { changed: false, result: { classification: 'exact_replay', slotHeld: true } };
      const previous = delivery.dispatches[String(input.expectedNextOrdinal - 1)];
      if (!safeNegativeReplay(previous)) fail('dispatch_replay_unsafe', 'Admission reacquisition requires positive predecessor not-sent/not-started/no-handle proof');
      if (state.connection === null || state.capacity === null) fail('capacity_unavailable', 'Fresh current-connection capacity is required for admission reacquisition');
      if (state.executor === null || state.executor.id !== delivery.executorId || state.executor.epoch !== delivery.executorEpoch) fail('stale_executor_fence', 'Delivery executor is not current');
      if (delivery.requestedSlots > Math.max(0, state.capacity.effectiveCapacity - occupiedSlots(state))) fail('capacity_saturated', 'Aggregate Agent physical capacity is saturated');
      delivery.slotHeld = true;
      delivery.slotKind = 'admission';
      return { changed: true, result: { classification: 'accepted', slotHeld: true } };
    });
  }

  assimilateEvidence(input) {
    exactRecord(input, [
      'agentId', 'routeGeneration', 'connectionId', 'connectionEpoch', 'deliveryId', 'dispatchOrdinal',
      'attemptId', 'executorId', 'executorEpoch', 'fencingToken', 'localEvidenceRevision', 'observation',
    ], [], 'delivery evidence');
    return this.#mutate((state) => {
      assertCurrentConnection(state, input);
      assertDigest(input.deliveryId, 'deliveryId');
      assertSafeInteger(input.dispatchOrdinal, 'dispatchOrdinal', { min: 1, max: state.limits.maxDispatchOrdinalsPerDelivery });
      assertBoundedText(input.attemptId, 'attemptId', state.limits.maxIdentifierBytes, { identifier: true });
      assertBoundedText(input.executorId, 'executorId', state.limits.maxIdentifierBytes, { identifier: true });
      assertSafeInteger(input.executorEpoch, 'executorEpoch', { min: 1 });
      assertDigest(input.fencingToken, 'fencingToken');
      assertSafeInteger(input.localEvidenceRevision, 'localEvidenceRevision', { min: 1 });
      const observation = normalizeEvidenceObservation(input.observation, state.limits);
      const observationDigest = typedDigest('tdev.agent-local-evidence.v1', {
        deliveryId: input.deliveryId,
        dispatchOrdinal: input.dispatchOrdinal,
        executorId: input.executorId,
        executorEpoch: input.executorEpoch,
        localEvidenceRevision: input.localEvidenceRevision,
        observation,
      });
      const delivery = state.deliveries[input.deliveryId];
      if (!delivery) return { changed: false, result: { classification: 'stale', reason: 'unknown_or_gc_delivery' } };
      if (delivery.routeGeneration !== input.routeGeneration || delivery.attemptId !== input.attemptId ||
          delivery.executorId !== input.executorId || delivery.executorEpoch !== input.executorEpoch || delivery.fencingToken !== input.fencingToken) {
        fail('stale_delivery_fence', 'Evidence identity does not match activated delivery/Attempt fence');
      }
      assertCurrentExecutor(state, input);
      const dispatch = delivery.dispatches[String(input.dispatchOrdinal)];
      if (!dispatch) return { changed: false, result: { classification: 'stale', reason: 'unknown_dispatch_ordinal' } };
      if (input.localEvidenceRevision < delivery.localEvidenceRevision) {
        return { changed: false, result: { classification: 'stale', evidence: dispatch.evidence, effect: delivery.effect } };
      }
      if (input.localEvidenceRevision === delivery.localEvidenceRevision) {
        if (delivery.lastEvidenceDigest === observationDigest && delivery.lastEvidenceOrdinal === input.dispatchOrdinal) {
          return { changed: false, result: { classification: 'exact_replay', evidence: dispatch.evidence, effect: delivery.effect } };
        }
        const conflict = {
          dispatchOrdinal: input.dispatchOrdinal,
          localEvidenceRevision: input.localEvidenceRevision,
          incomingEvidenceDigest: observationDigest,
          currentDispositionDigest: digest({ evidence: dispatch.evidence, effect: delivery.effect }),
          reason: 'same_revision_conflict',
        };
        delivery.evidenceConflict = conflict;
        return { changed: true, result: { classification: 'conflict', evidence: dispatch.evidence, effect: delivery.effect } };
      }
      const candidateEvidence = { ...dispatch.evidence };
      let candidateEffect = delivery.effect;
      for (const axis of ['dispatch', 'transportReceipt', 'execution', 'cleanup']) {
        if (!Object.hasOwn(observation, axis)) continue;
        if (!refineAxis(axis, dispatch.evidence[axis], observation[axis])) {
          delivery.evidenceConflict = {
            dispatchOrdinal: input.dispatchOrdinal,
            localEvidenceRevision: input.localEvidenceRevision,
            incomingEvidenceDigest: observationDigest,
            currentDispositionDigest: digest({ evidence: dispatch.evidence, effect: delivery.effect }),
            reason: `non_monotonic_${axis}`,
          };
          return { changed: true, result: { classification: 'conflict', evidence: dispatch.evidence, effect: delivery.effect } };
        }
        candidateEvidence[axis] = observation[axis];
      }
      if (Object.hasOwn(observation, 'effect')) {
        if (!refineAxis('effect', delivery.effect, observation.effect)) {
          delivery.evidenceConflict = {
            dispatchOrdinal: input.dispatchOrdinal,
            localEvidenceRevision: input.localEvidenceRevision,
            incomingEvidenceDigest: observationDigest,
            currentDispositionDigest: digest({ evidence: dispatch.evidence, effect: delivery.effect }),
            reason: 'non_monotonic_effect',
          };
          return { changed: true, result: { classification: 'conflict', evidence: dispatch.evidence, effect: delivery.effect } };
        }
        candidateEffect = observation.effect;
      }
      const illegal = evidenceLegality(candidateEvidence, candidateEffect);
      if (illegal !== null) {
        delivery.evidenceConflict = {
          dispatchOrdinal: input.dispatchOrdinal,
          localEvidenceRevision: input.localEvidenceRevision,
          incomingEvidenceDigest: observationDigest,
          currentDispositionDigest: digest({ evidence: dispatch.evidence, effect: delivery.effect }),
          reason: illegal,
        };
        return { changed: true, result: { classification: 'conflict', evidence: dispatch.evidence, effect: delivery.effect } };
      }
      const slotWasHeld = delivery.slotHeld;
      dispatch.evidence = candidateEvidence;
      delivery.effect = candidateEffect;
      delivery.localEvidenceRevision = input.localEvidenceRevision;
      delivery.lastEvidenceDigest = observationDigest;
      delivery.lastEvidenceOrdinal = input.dispatchOrdinal;
      if (['started', 'completed'].includes(candidateEvidence.execution) || candidateEvidence.cleanup === 'held') {
        if (delivery.slotHeld) delivery.slotKind = 'physical';
      }
      if (['no_handle', 'cleanup_complete'].includes(candidateEvidence.cleanup)) {
        delivery.slotHeld = false;
        delivery.slotKind = 'none';
      }
      return { changed: true, result: {
        classification: 'monotonic_refinement',
        evidence: candidateEvidence,
        effect: candidateEffect,
        conflictQuarantined: delivery.evidenceConflict !== null,
        slotReleased: slotWasHeld && !delivery.slotHeld,
        slotKind: delivery.slotKind,
      } };
    });
  }

  resultHandoff(input) {
    exactRecord(input, [
      'agentId', 'routeGeneration', 'connectionId', 'connectionEpoch', 'deliveryId', 'resultEnvelope',
    ], [], 'result handoff');
    const state = this.read();
    assertCurrentConnection(state, input);
    assertDigest(input.deliveryId, 'deliveryId');
    const delivery = state.deliveries[input.deliveryId];
    if (!delivery || delivery.closedUndispatched) fail('stale_delivery_fence', 'Result targets an unknown or undispatched delivery');
    const envelope = canonicalClone(input.resultEnvelope);
    exactRecord(envelope, [
      'caseId', 'planRevisionId', 'planDigest', 'taskId', 'attemptId', 'executorId', 'executorEpoch', 'fencingToken',
      'claimLeaseToken', 'claimLeaseGeneration', 'claimLeaseClaimsDigest', 'result',
    ], [], 'Case result envelope');
    for (const field of ['caseId', 'planRevisionId', 'taskId', 'attemptId', 'executorId']) {
      assertBoundedText(envelope[field], `resultEnvelope.${field}`, state.limits.maxIdentifierBytes, { identifier: true });
    }
    assertDigest(envelope.planDigest, 'resultEnvelope.planDigest');
    assertSafeInteger(envelope.executorEpoch, 'resultEnvelope.executorEpoch', { min: 1 });
    assertDigest(envelope.fencingToken, 'resultEnvelope.fencingToken');
    if (envelope.claimLeaseToken !== null) assertDigest(envelope.claimLeaseToken, 'resultEnvelope.claimLeaseToken');
    if (envelope.claimLeaseGeneration !== null) assertSafeInteger(envelope.claimLeaseGeneration, 'resultEnvelope.claimLeaseGeneration', { min: 1 });
    if (envelope.claimLeaseClaimsDigest !== null) assertDigest(envelope.claimLeaseClaimsDigest, 'resultEnvelope.claimLeaseClaimsDigest');
    if ((envelope.claimLeaseToken === null) !== (envelope.claimLeaseGeneration === null) ||
        (envelope.claimLeaseToken === null) !== (envelope.claimLeaseClaimsDigest === null)) {
      fail('invalid_result_handoff', 'Result claim-lease identity must be wholly present or wholly absent');
    }
    if (envelope.caseId !== delivery.caseId || envelope.taskId !== delivery.taskId || envelope.attemptId !== delivery.attemptId ||
        envelope.executorId !== delivery.executorId || envelope.executorEpoch !== delivery.executorEpoch ||
        envelope.fencingToken !== delivery.fencingToken) {
      fail('stale_delivery_fence', 'Result identity does not match the activated delivery/Attempt fence');
    }
    assertCurrentExecutor(state, envelope);
    if (!Object.values(delivery.dispatches).some((dispatch) => dispatch.firstSendClaim !== null || dispatch.firstEmissionAdmission !== null)) {
      fail('result_before_dispatch', 'Result cannot cross before one executable dispatch acquired first-emission authority');
    }
    const envelopeBytes = textEncoder.encode(canonicalJson(envelope)).byteLength;
    if (envelopeBytes > state.limits.maxEnvelopeBytes) {
      fail('agent_delivery_limit', 'Result envelope exceeds the deployment envelope limit', { envelopeBytes, maxEnvelopeBytes: state.limits.maxEnvelopeBytes });
    }
    const resultDigest = digest(envelope.result);
    const requestId = computeAgentResultHandoffRequestId({ deliveryId: delivery.deliveryId, resultDigest });
    return deepFreeze({
      requestId,
      resultDigest,
      envelopeBytes,
      command: { type: 'accept_result', envelope },
    });
  }

  unsupportedRouteMove() {
    fail('route_migration_unsupported', 'Revision 1 does not support live Agent route migration or writable-owner cutover');
  }
}

export function computeAgentResultHandoffRequestId({ deliveryId, resultDigest }) {
  assertDigest(deliveryId, 'deliveryId');
  assertDigest(resultDigest, 'resultDigest');
  const handoffDigest = typedDigest('tdev.agent-result-handoff.v1', { deliveryId, resultDigest });
  return `delivery-result-${handoffDigest.slice('sha256:'.length)}`;
}

export function computeAttemptDispatchGrantId({ caseId, requestId, command }) {
  assertIdentifier(caseId, 'caseId');
  assertIdentifier(requestId, 'requestId');
  return computeDispatchGrantId(caseId, requestId, canonicalClone(command));
}

export function agentDeliverySnapshotDigest(snapshot) {
  normalizeSnapshot(snapshot);
  return typedDigest('tdev.agent-delivery-snapshot.v1', snapshot);
}
