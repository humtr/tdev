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

export const AGENT_DELIVERY_PROFILE = 'tdev.agent-delivery-authority.v1';
export const AGENT_DELIVERY_SNAPSHOT_SCHEMA_VERSION = 1;

const textEncoder = new TextEncoder();

const DEFAULT_LIMITS = deepFreeze({
  maxAgentCapacity: 64,
  maxReservations: 256,
  maxDeliveries: 1024,
  maxSlotsPerReservation: 64,
  maxConnectReceipts: 32,
  maxDispatchOrdinalsPerDelivery: 8,
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
  return {
    agentId: input.agentId,
    routeGeneration: input.routeGeneration,
    expectedConnectionEpoch: input.expectedConnectionEpoch,
    connectRequestId: input.connectRequestId,
    connectionId: input.connectionId,
    executorId: input.executorId,
    executorEpoch: input.executorEpoch,
    protocolMetadataDigest: input.protocolMetadataDigest,
  };
}

export function computeAgentConnectRequestDigest(input) {
  exactRecord(input, [
    'agentId', 'routeGeneration', 'expectedConnectionEpoch', 'connectRequestId', 'connectionId',
    'executorId', 'executorEpoch', 'protocolMetadataDigest',
  ], [], 'connect request content');
  return typedDigest('tdev.agent-connect-request.v1', input);
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
  exactRecord(snapshot, [
    'schemaVersion', 'profile', 'routeBinding', 'routeBindingDigest', 'revision', 'lastConnectionEpoch',
    'connection', 'executor', 'capacityRevisionFloor', 'capacity', 'reservationWindowGeneration',
    'minimumAcceptedReservationWindow', 'nextSlotGeneration', 'connectReceipts', 'reservations', 'deliveries', 'limits',
  ], [], 'agent delivery snapshot');
  if (snapshot.schemaVersion !== AGENT_DELIVERY_SNAPSHOT_SCHEMA_VERSION || snapshot.profile !== AGENT_DELIVERY_PROFILE) {
    fail('unsupported_agent_delivery_snapshot', 'Unsupported Agent delivery snapshot profile/schema');
  }
  const limits = normalizeLimits(snapshot.limits);
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
  if (snapshot.minimumAcceptedReservationWindow !== snapshot.reservationWindowGeneration) {
    fail('invalid_agent_delivery_snapshot', 'Revision 1 requires minimumAcceptedReservationWindow == reservationWindowGeneration');
  }
  if (snapshot.connection !== null) {
    exactRecord(snapshot.connection, [
      'id', 'epoch', 'connectRequestId', 'requestDigest', 'executorId', 'executorEpoch', 'protocolMetadataDigest',
    ], [], 'snapshot.connection');
    assertBoundedText(snapshot.connection.id, 'snapshot.connection.id', limits.maxIdentifierBytes, { identifier: true });
    assertSafeInteger(snapshot.connection.epoch, 'snapshot.connection.epoch', { min: 1 });
    if (snapshot.connection.epoch !== snapshot.lastConnectionEpoch) fail('invalid_agent_delivery_snapshot', 'Current connection epoch must equal lastConnectionEpoch');
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
      ], [], `delivery ${deliveryId} dispatch ${ordinal}`);
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
    limits,
  };
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
  constructor({ store, routeBinding }) {
    if (!store || typeof store.load !== 'function' || typeof store.compareAndSwap !== 'function') {
      fail('invalid_agent_delivery_store', 'Agent delivery store must expose load() and compareAndSwap()');
    }
    if (!isPlainRecord(routeBinding)) fail('invalid_agent_route_binding', 'AgentDeliveryAuthority requires an exact routeBinding');
    this.store = store;
    this.routeBinding = canonicalClone(routeBinding);
    this.agentId = routeBinding.agentId;
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

  connect(input) {
    exactRecord(input, [
      'agentId', 'routeGeneration', 'expectedConnectionEpoch', 'connectRequestId', 'requestDigest', 'connectionId',
      'executorId', 'executorEpoch', 'protocolMetadataDigest',
    ], [], 'connect');
    return this.#mutate((state) => {
      assertRouteInput(state, input);
      assertSafeInteger(input.expectedConnectionEpoch, 'expectedConnectionEpoch', { min: 0 });
      for (const field of ['connectRequestId', 'connectionId', 'executorId']) {
        assertBoundedText(input[field], field, state.limits.maxIdentifierBytes, { identifier: true });
      }
      assertSafeInteger(input.executorEpoch, 'executorEpoch', { min: 1 });
      assertDigest(input.protocolMetadataDigest, 'protocolMetadataDigest');
      assertDigest(input.requestDigest, 'requestDigest');
      const expectedDigest = computeAgentConnectRequestDigest(connectRequestContent(input));
      if (input.requestDigest !== expectedDigest) fail('connect_digest_mismatch', 'Connect request digest does not match canonical content');

      const retained = state.connectReceipts[input.connectRequestId];
      if (retained) {
        if (retained.requestDigest !== input.requestDigest) fail('connect_request_conflict', 'Connect request identity was reused with different content');
        if (retained.connectionEpoch !== state.lastConnectionEpoch) return { changed: false, result: { classification: 'stale', lastConnectionEpoch: state.lastConnectionEpoch } };
        return { changed: false, result: { classification: 'exact_replay', receipt: retained.receipt } };
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
        connectRequestId: input.connectRequestId,
        requestDigest: input.requestDigest,
        executorId: input.executorId,
        executorEpoch: input.executorEpoch,
        protocolMetadataDigest: input.protocolMetadataDigest,
      };
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
      return { changed: true, result: { classification: 'accepted', receipt } };
    });
  }

  reattachConnection(input) {
    exactRecord(input, ['agentId', 'routeGeneration', 'connectionId', 'connectionEpoch'], [], 'connection reattachment');
    const state = this.read();
    assertCurrentConnection(state, input);
    return deepFreeze({
      classification: 'exact_replay',
      connectionId: state.connection.id,
      connectionEpoch: state.connection.epoch,
      executorId: state.executor.id,
      executorEpoch: state.executor.epoch,
      syntheticEpochChange: false,
    });
  }

  disconnect(input) {
    exactRecord(input, ['agentId', 'routeGeneration', 'connectionId', 'connectionEpoch'], [], 'disconnect');
    return this.#mutate((state) => {
      assertCurrentConnection(state, input);
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
      const existingDelivery = state.deliveries[input.deliveryId];
      if (existingDelivery) {
        if (existingDelivery.activationRequestDigest === input.activationRequestDigest && existingDelivery.activationRequestId === input.activationRequestId) {
          return { changed: false, result: { classification: 'exact_replay', delivery: existingDelivery } };
        }
        fail('delivery_conflict', 'Delivery identity was reused with different activation content');
      }
      for (const delivery of Object.values(state.deliveries)) {
        if (delivery.activationRequestId === input.activationRequestId) {
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
      };
      state.deliveries[input.deliveryId] = delivery;
      return { changed: true, result: { classification: 'accepted', delivery } };
    });
  }

  grantCommand(deliveryId, dispatchOrdinal = 1) {
    assertDigest(deliveryId, 'deliveryId');
    const state = this.read();
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
      if (delivery.closedUndispatched) fail('delivery_closed', 'Delivery was closed before dispatch');
      if (delivery.evidenceConflict !== null) fail('delivery_evidence_conflict', 'Conflicted delivery cannot authorize executable initiation');
      assertSafeInteger(command.dispatchOrdinal, 'dispatchOrdinal', { min: 1, max: state.limits.maxDispatchOrdinalsPerDelivery });
      const expectedCommand = this.grantCommand(command.deliveryId, command.dispatchOrdinal);
      if (canonicalJson(command) !== canonicalJson(expectedCommand)) fail('dispatch_grant_binding_mismatch', 'Case grant does not bind the exact activated delivery');
      if (state.connection === null || state.executor === null || state.executor.id !== delivery.executorId || state.executor.epoch !== delivery.executorEpoch) {
        fail('stale_executor_fence', 'Delivery executor is no longer current');
      }
      const ordinalKey = String(command.dispatchOrdinal);
      const existing = delivery.dispatches[ordinalKey];
      if (existing) {
        if (existing.dispatchGrantId === input.dispatchGrantId && existing.grantRequestId === input.grantRequestId) {
          return { changed: false, result: { classification: 'exact_replay', authorization: existing } };
        }
        fail('dispatch_authorization_conflict', 'Delivery ordinal already has a different dispatch authorization');
      }
      const authorizationId = typedDigest('tdev.agent-dispatch-authorization.v1', {
        ...routeIdentity(state),
        deliveryId: delivery.deliveryId,
        dispatchOrdinal: command.dispatchOrdinal,
        dispatchGrantId: input.dispatchGrantId,
        connectionId: state.connection.id,
        connectionEpoch: state.connection.epoch,
        executorId: state.executor.id,
        executorEpoch: state.executor.epoch,
      });
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
      delivery.dispatches[ordinalKey] = dispatch;
      return { changed: true, result: { classification: 'accepted', authorization: dispatch } };
    });
  }

  claimFirstSend(input) {
    exactRecord(input, ['deliveryId', 'authorizationId', 'dispatchOrdinal', 'dispatchGrantId'], [], 'first send claim');
    return this.#mutate((state) => {
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

  closeUndispatchedDelivery(deliveryId) {
    assertDigest(deliveryId, 'deliveryId');
    return this.#mutate((state) => {
      const delivery = state.deliveries[deliveryId];
      if (!delivery) fail('unknown_delivery', 'Delivery does not exist');
      if (Object.keys(delivery.dispatches).length !== 0) fail('possible_execution', 'Dispatch authorization exists; absence must come from exact ordinal evidence');
      if (delivery.closedUndispatched) return { changed: false, result: { classification: 'exact_replay', slotReleased: false } };
      delivery.closedUndispatched = true;
      const slotReleased = delivery.slotHeld;
      delivery.slotHeld = false;
      delivery.slotKind = 'none';
      if (delivery.effect === 'unknown') delivery.effect = 'not_applied';
      return { changed: true, result: {
        classification: 'monotonic_refinement',
        dispatchAuthorized: false,
        positivelyNotSent: true,
        executionNotStarted: true,
        noHandle: true,
        effect: delivery.effect,
        slotReleased,
      } };
    });
  }

  reacquireDeliveryAdmission(input) {
    exactRecord(input, ['deliveryId', 'expectedNextOrdinal'], [], 'delivery admission reacquisition');
    return this.#mutate((state) => {
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
    if (!Object.values(delivery.dispatches).some((dispatch) => dispatch.firstSendClaim !== null)) {
      fail('result_before_dispatch', 'Result cannot cross before one executable dispatch acquired first-send authority');
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
