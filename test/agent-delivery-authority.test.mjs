import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AgentDeliveryAuthority,
  CaseEngine,
  MemoryAgentDeliveryStore,
  computeAgentActivationRequestDigest,
  computeAgentCapacityRequestDigest,
  computeAgentConnectRequestDigest,
  computeAgentDeliveryId,
  computeAgentReservationRequestDigest,
  digest,
} from '../src/index.mjs';
import { planWithWork, resultFor } from './helpers.mjs';

const NOW = 1_000_000;

function expectCode(fn, code) {
  assert.throws(fn, (error) => error?.code === code);
}

function routeBinding(agentId = 'agent-one', routeGeneration = 1) {
  return {
    agentId,
    routeGeneration,
    deployment: 'test-deployment',
    environment: 'test',
    workerScript: 'tdev-agent-test',
    className: 'AgentDeliveryAuthorityDO',
    namespace: 'test-namespace',
    jurisdiction: 'test-jurisdiction',
    durableObjectId: `do-${agentId}`,
  };
}

function connect(authority, {
  expectedConnectionEpoch = authority.read().lastConnectionEpoch,
  connectRequestId = `connect-${expectedConnectionEpoch + 1}`,
  connectionId = `connection-${expectedConnectionEpoch + 1}`,
  executorId = 'executor-one',
  executorEpoch = 1,
  protocolMetadataDigest = digest({ protocol: 'test-v1' }),
} = {}) {
  const binding = authority.read().routeBinding;
  const content = {
    agentId: binding.agentId,
    routeGeneration: binding.routeGeneration,
    expectedConnectionEpoch,
    connectRequestId,
    connectionId,
    executorId,
    executorEpoch,
    protocolMetadataDigest,
  };
  return authority.connect({ ...content, requestDigest: computeAgentConnectRequestDigest(content) });
}

function capacity(authority, {
  connectionId = authority.read().connection?.id,
  connectionEpoch = authority.read().connection?.epoch,
  executorId = authority.read().executor?.id,
  executorEpoch = authority.read().executor?.epoch,
  capacityRevision,
  reportedCapacity,
} = {}) {
  const binding = authority.read().routeBinding;
  const content = {
    agentId: binding.agentId,
    routeGeneration: binding.routeGeneration,
    connectionId,
    connectionEpoch,
    executorId,
    executorEpoch,
    capacityRevision,
    reportedCapacity,
  };
  return authority.observeCapacity({ ...content, requestDigest: computeAgentCapacityRequestDigest(content) });
}

function setupAgent({
  reportedCapacity = 2,
  capacityRevision = 7,
  agentId = 'agent-one',
  executorId = 'executor-one',
  executorEpoch = 1,
  limits = {},
} = {}) {
  const store = new MemoryAgentDeliveryStore();
  const binding = routeBinding(agentId);
  const authority = new AgentDeliveryAuthority({ store, routeBinding: binding });
  authority.initialize({ limits: { reservationReplayGraceMs: 5, ...limits } });
  const connected = connect(authority, { executorId, executorEpoch });
  capacity(authority, {
    connectionId: connected.receipt.connectionId,
    connectionEpoch: connected.receipt.connectionEpoch,
    executorId,
    executorEpoch,
    capacityRevision,
    reportedCapacity,
  });
  return { store, binding, authority };
}

function preflight(tag, {
  bodyBytes = 128,
  maxEnvelopeBytes = 512,
  resourceDimensions = { processSlots: 1 },
  profileId = 'local-agent-test',
  protocolVersion = 'v1',
} = {}) {
  return {
    profileId,
    protocolVersion,
    executableBodyDigest: digest({ body: tag }),
    executableBodyBytes: bodyBytes,
    resourceDimensions,
    maxEnvelopeBytes,
  };
}

function reservationInput(authority, {
  caseId,
  taskId = 'task',
  requestId,
  expectedCaseRevision = 0,
  predictedAttemptOrdinal = 1,
  generation = authority.read().reservationWindowGeneration,
  requestedSlots = 1,
  expiresAtMs = NOW + 100,
  descriptor = preflight(requestId),
  executorId = authority.read().executor?.id,
  executorEpoch = authority.read().executor?.epoch,
  capacityRevision = authority.read().capacity?.revision,
} = {}) {
  const binding = authority.read().routeBinding;
  const content = {
    agentId: binding.agentId,
    routeGeneration: binding.routeGeneration,
    reservationWindowGeneration: generation,
    reservationRequestId: requestId,
    executorId,
    executorEpoch,
    capacityRevision,
    caseId,
    taskId,
    expectedCaseRevision,
    predictedAttemptOrdinal,
    requestedSlots,
    expiresAtMs,
    preflightDescriptor: descriptor,
  };
  return {
    ...content,
    reservationRequestDigest: computeAgentReservationRequestDigest(content, authority.read().limits),
  };
}

function reserve(authority, input, nowMs = NOW) {
  return authority.reserve(input, { nowMs });
}

function makeCase(caseId, taskId = 'task') {
  const plan = planWithWork([{ id: taskId }]);
  const engine = new CaseEngine({ caseId, plan });
  return { engine, plan, taskId };
}

function activationInput(authority, reservation, attempt, engine, label = attempt.id, overrides = {}) {
  const binding = authority.read().routeBinding;
  const deliveryIdentity = {
    agentId: binding.agentId,
    routeGeneration: binding.routeGeneration,
    caseId: reservation.caseId,
    taskId: reservation.taskId,
    attemptId: attempt.id,
    executorId: attempt.executorId,
    executorEpoch: attempt.executorEpoch,
    fencingToken: attempt.fencingToken,
  };
  const descriptor = reservation.preflightDescriptor;
  const base = {
    agentId: binding.agentId,
    routeGeneration: binding.routeGeneration,
    activationRequestId: `activate-${label}`,
    reservationWindowGeneration: reservation.windowGeneration,
    reservationRequestId: reservation.reservationRequestId,
    reservationRequestDigest: reservation.reservationRequestDigest,
    slotToken: reservation.slotToken,
    slotGeneration: reservation.slotGeneration,
    deliveryId: computeAgentDeliveryId(deliveryIdentity),
    caseId: reservation.caseId,
    taskId: reservation.taskId,
    attemptId: attempt.id,
    attemptOrdinal: attempt.ordinal,
    executorId: attempt.executorId,
    executorEpoch: attempt.executorEpoch,
    fencingToken: attempt.fencingToken,
    sourceCaseRevision: engine.caseRevision,
    executableBodyDigest: descriptor.executableBodyDigest,
    executableBodyBytes: descriptor.executableBodyBytes,
    envelopeBytes: Math.min(descriptor.maxEnvelopeBytes, descriptor.executableBodyBytes + 64),
    protocolVersion: descriptor.protocolVersion,
    effectKey: attempt.effectKey,
    ...overrides,
  };
  return { ...base, activationRequestDigest: computeAgentActivationRequestDigest(base) };
}

function activateForAttempt(authority, reservation, attempt, engine, label = attempt.id, overrides = {}, nowMs = NOW + 1) {
  return authority.activateDelivery(
    activationInput(authority, reservation, attempt, engine, label, overrides),
    { nowMs },
  ).delivery;
}

function reserveStartActivate({ authority, caseId, taskId = 'task', requestId, requestedSlots = 1 }) {
  const { engine } = makeCase(caseId, taskId);
  const input = reservationInput(authority, {
    caseId,
    taskId,
    requestId,
    requestedSlots,
    expectedCaseRevision: engine.caseRevision,
    predictedAttemptOrdinal: engine.taskStates[taskId].attemptIds.length + 1,
  });
  const reserved = reserve(authority, input).reservation;
  assert.equal(engine.taskStates[taskId].attemptIds.length, 0, 'reservation must precede Attempt creation');
  const attempt = engine.startAttempt(taskId, {
    id: authority.read().executor.id,
    epoch: authority.read().executor.epoch,
    capabilities: [],
  });
  assert.equal(engine.attempts[attempt.id].state, 'running');
  const delivery = activateForAttempt(authority, reserved, attempt, engine, requestId);
  return { engine, attempt, reservation: reserved, delivery };
}

function caseGrant(authority, engine, deliveryId, dispatchOrdinal = 1, requestId = null) {
  const command = authority.grantCommand(deliveryId, dispatchOrdinal);
  const envelope = {
    requestId: requestId ?? `grant-${dispatchOrdinal}-${deliveryId.slice(-10)}`,
    expectedCaseRevision: engine.caseRevision,
    command,
  };
  const receipt = engine.applyCommand(envelope);
  return { command, envelope, receipt, response: receipt.response };
}

function authorize(authority, grant) {
  return authority.authorizeDispatch({
    grantRequestId: grant.envelope.requestId,
    command: grant.command,
    dispatchGrantId: grant.response.dispatchGrantId,
    committedCaseRevision: grant.response.committedCaseRevision,
    event: grant.response.event,
  });
}

function evidenceInput(authority, delivery, authorization, localEvidenceRevision, observation, overrides = {}) {
  const binding = authority.read().routeBinding;
  return {
    agentId: binding.agentId,
    routeGeneration: binding.routeGeneration,
    connectionId: authority.read().connection.id,
    connectionEpoch: authority.read().connection.epoch,
    deliveryId: delivery.deliveryId,
    dispatchOrdinal: authorization.dispatchOrdinal,
    attemptId: delivery.attemptId,
    executorId: delivery.executorId,
    executorEpoch: delivery.executorEpoch,
    fencingToken: delivery.fencingToken,
    localEvidenceRevision,
    observation,
    ...overrides,
  };
}

test('immutable AgentRouteBinding survives reconstruction and route migration fails closed', () => {
  const { store, binding, authority } = setupAgent();
  assert.deepEqual({ ...authority.read().routeBinding }, binding);
  const reconstructed = new AgentDeliveryAuthority({ store, routeBinding: binding });
  assert.deepEqual({ ...reconstructed.read().routeBinding }, binding);
  expectCode(
    () => new AgentDeliveryAuthority({ store, routeBinding: { ...binding, namespace: 'other' } }).read(),
    'agent_route_binding_conflict',
  );
  expectCode(() => authority.unsupportedRouteMove(), 'route_migration_unsupported');
});

test('connect is idempotent, hibernation reattachment preserves epoch, and stale predecessor cannot reconnect', () => {
  const { authority } = setupAgent();
  const first = authority.read().connection;
  const reattached = authority.reattachConnection({
    agentId: authority.read().routeBinding.agentId,
    routeGeneration: authority.read().routeBinding.routeGeneration,
    connectionId: first.id,
    connectionEpoch: first.epoch,
  });
  assert.equal(reattached.syntheticEpochChange, false);
  assert.equal(authority.read().lastConnectionEpoch, 1);

  const content = {
    agentId: authority.read().routeBinding.agentId,
    routeGeneration: 1,
    expectedConnectionEpoch: 1,
    connectRequestId: 'connect-two',
    connectionId: 'connection-two',
    executorId: 'executor-one',
    executorEpoch: 1,
    protocolMetadataDigest: digest({ protocol: 'test-v1' }),
  };
  const request = { ...content, requestDigest: computeAgentConnectRequestDigest(content) };
  const accepted = authority.connect(request);
  assert.equal(accepted.receipt.connectionEpoch, 2);
  assert.equal(authority.connect(request).classification, 'exact_replay');
  const stale = connect(authority, {
    expectedConnectionEpoch: 0,
    connectRequestId: 'ancient-connect',
    connectionId: 'ancient-socket',
  });
  assert.equal(stale.classification, 'stale');
});

test('aggregate physical capacity is shared across Cases under one Agent authority', () => {
  const { authority } = setupAgent({ reportedCapacity: 1 });
  reserve(authority, reservationInput(authority, { caseId: 'case-a', requestId: 'reservation-a' }));
  const admission = authority.admission();
  assert.equal(admission.capacityKnown, true);
  assert.equal(admission.effectiveCapacity, 1);
  assert.equal(admission.occupiedSlots, 1);
  assert.equal(admission.availableSlots, 0);
  expectCode(
    () => reserve(authority, reservationInput(authority, { caseId: 'case-b', requestId: 'reservation-b' })),
    'capacity_saturated',
  );
});

test('capacity 4@7 -> 1@8 -> delayed 4@7 stays 1 and same-revision conflict does not mutate', () => {
  const { authority } = setupAgent({ reportedCapacity: 4, capacityRevision: 7 });
  assert.equal(capacity(authority, { capacityRevision: 8, reportedCapacity: 1 }).classification, 'monotonic_refinement');
  assert.equal(capacity(authority, { capacityRevision: 7, reportedCapacity: 4 }).classification, 'stale');
  assert.equal(authority.admission().effectiveCapacity, 1);
  assert.equal(capacity(authority, { capacityRevision: 8, reportedCapacity: 2 }).classification, 'conflict');
  assert.equal(authority.admission().effectiveCapacity, 1);
});

test('same-executor reconnect fences old socket and requires strictly fresher capacity revision', () => {
  const { authority } = setupAgent({ reportedCapacity: 2, capacityRevision: 8 });
  const old = authority.read().connection;
  const second = connect(authority, {
    expectedConnectionEpoch: 1,
    connectRequestId: 'reconnect-two',
    connectionId: 'connection-two',
    executorId: 'executor-one',
    executorEpoch: 1,
  });
  assert.equal(second.receipt.connectionEpoch, 2);
  assert.equal(authority.admission().capacityKnown, false);
  expectCode(() => capacity(authority, {
    connectionId: old.id,
    connectionEpoch: old.epoch,
    executorId: 'executor-one',
    executorEpoch: 1,
    capacityRevision: 9,
    reportedCapacity: 2,
  }), 'stale_connection_fence');
  assert.equal(capacity(authority, { capacityRevision: 8, reportedCapacity: 2 }).classification, 'stale');
  assert.equal(capacity(authority, { capacityRevision: 9, reportedCapacity: 2 }).classification, 'monotonic_refinement');
});

test('executor replacement starts capacity unknown and cannot issue ordinary evidence for predecessor execution', () => {
  const { authority } = setupAgent({ reportedCapacity: 1 });
  const old = reserveStartActivate({
    authority,
    caseId: 'case-old',
    requestId: 'reservation-old',
  });
  const oldGrant = caseGrant(authority, old.engine, old.delivery.deliveryId);
  const oldAuthorization = authorize(authority, oldGrant).authorization;
  connect(authority, {
    expectedConnectionEpoch: 1,
    connectRequestId: 'replace-executor',
    connectionId: 'connection-two',
    executorId: 'executor-two',
    executorEpoch: 2,
  });
  assert.equal(authority.admission().capacityKnown, false);
  capacity(authority, { capacityRevision: 1, reportedCapacity: 1 });
  assert.equal(authority.admission().occupiedSlots, 1);
  assert.equal(authority.admission().availableSlots, 0);
  expectCode(() => authority.assimilateEvidence(evidenceInput(
    authority,
    old.delivery,
    oldAuthorization,
    1,
    { cleanup: 'cleanup_complete' },
  )), 'stale_executor_fence');
  assert.equal(authority.admission().occupiedSlots, 1);
});

test('known oversized work and preflight byte overflow reject before semantic Attempt creation', () => {
  const { authority } = setupAgent({ reportedCapacity: 1, limits: { maxExecutableBodyBytes: 256, maxEnvelopeBytes: 512 } });
  const { engine } = makeCase('case-oversized');
  const before = engine.caseRevision;
  expectCode(() => reserve(authority, reservationInput(authority, {
    caseId: 'case-oversized',
    requestId: 'reservation-oversized',
    requestedSlots: 2,
    expectedCaseRevision: before,
  })), 'reservation_oversized');
  expectCode(() => reservationInput(authority, {
    caseId: 'case-bytes',
    requestId: 'reservation-bytes',
    descriptor: preflight('too-big', { bodyBytes: 257, maxEnvelopeBytes: 512 }),
  }), 'invalid_integer');
  assert.equal(engine.taskStates.task.attemptIds.length, 0);
  assert.equal(engine.caseRevision, before);
});

test('reservation replay is exact and same identity with changed digest/content conflicts', () => {
  const { authority } = setupAgent();
  const input = reservationInput(authority, { caseId: 'case-replay', requestId: 'reservation-replay' });
  const first = reserve(authority, input);
  assert.equal(first.classification, 'accepted');
  assert.equal(reserve(authority, input).classification, 'exact_replay');
  expectCode(() => reserve(authority, { ...input, reservationRequestDigest: digest('different') }), 'reservation_digest_mismatch');
  const changed = { ...input, preflightDescriptor: preflight('different-body') };
  changed.reservationRequestDigest = computeAgentReservationRequestDigest(changed, authority.read().limits);
  expectCode(() => reserve(authority, changed), 'reservation_conflict');
});

test('activation binds reserved predicted Attempt ordinal and an advanced Case revision', () => {
  const { authority } = setupAgent({ reportedCapacity: 2 });
  const { engine } = makeCase('case-binding');
  const input = reservationInput(authority, {
    caseId: 'case-binding',
    requestId: 'reservation-binding',
    expectedCaseRevision: engine.caseRevision,
    predictedAttemptOrdinal: 1,
  });
  const reserved = reserve(authority, input).reservation;
  const attempt = engine.startAttempt('task', { id: 'executor-one', epoch: 1, capabilities: [] });
  const wrongOrdinal = activationInput(authority, reserved, attempt, engine, 'wrong-ordinal', { attemptOrdinal: 2 });
  wrongOrdinal.activationRequestDigest = computeAgentActivationRequestDigest(wrongOrdinal);
  expectCode(() => authority.activateDelivery(wrongOrdinal, { nowMs: NOW + 1 }), 'activation_attempt_ordinal_mismatch');
  const wrongRevision = activationInput(authority, reserved, attempt, engine, 'wrong-revision', { sourceCaseRevision: input.expectedCaseRevision });
  wrongRevision.activationRequestDigest = computeAgentActivationRequestDigest(wrongRevision);
  expectCode(() => authority.activateDelivery(wrongRevision, { nowMs: NOW + 1 }), 'activation_case_revision_mismatch');
  assert.equal(activateForAttempt(authority, reserved, attempt, engine, 'correct').attemptOrdinal, 1);
});

test('expired reservation cannot activate and rollover permanently fences ancient identity', () => {
  const { store, binding, authority } = setupAgent({ reportedCapacity: 1 });
  const { engine } = makeCase('case-window');
  const input = reservationInput(authority, {
    caseId: 'case-window',
    requestId: 'reservation-ancient',
    expectedCaseRevision: engine.caseRevision,
    expiresAtMs: NOW + 10,
  });
  const reserved = reserve(authority, input).reservation;
  const attempt = engine.startAttempt('task', { id: 'executor-one', epoch: 1, capabilities: [] });
  authority.expireReservation({
    reservationWindowGeneration: 1,
    reservationRequestId: input.reservationRequestId,
    reservationRequestDigest: input.reservationRequestDigest,
  }, { nowMs: NOW + 10 });
  expectCode(() => authority.activateDelivery(
    activationInput(authority, reserved, attempt, engine, 'expired'),
    { nowMs: NOW + 11 },
  ), 'reservation_expired');
  expectCode(() => authority.rollReservationWindow({ expectedGeneration: 1 }, { nowMs: NOW + 14 }), 'reservation_replay_grace');
  assert.equal(authority.rollReservationWindow({ expectedGeneration: 1 }, { nowMs: NOW + 15 }).generation, 2);
  const reconstructed = new AgentDeliveryAuthority({ store, routeBinding: binding });
  expectCode(() => reserve(reconstructed, input, NOW + 20), 'reservation_stale');
  expectCode(() => reserve(reconstructed, { ...input, reservationRequestDigest: digest('changed') }, NOW + 20), 'reservation_stale');
  assert.equal(reconstructed.read().minimumAcceptedReservationWindow, 2);
});

test('activation rejects executable body/protocol/envelope substitution', () => {
  const { authority } = setupAgent({ reportedCapacity: 2 });
  const { engine } = makeCase('case-substitution');
  const reserved = reserve(authority, reservationInput(authority, {
    caseId: 'case-substitution',
    requestId: 'reservation-substitution',
    expectedCaseRevision: engine.caseRevision,
  })).reservation;
  const attempt = engine.startAttempt('task', { id: 'executor-one', epoch: 1, capabilities: [] });
  const badBody = activationInput(authority, reserved, attempt, engine, 'bad-body', { executableBodyDigest: digest('other') });
  badBody.activationRequestDigest = computeAgentActivationRequestDigest(badBody);
  expectCode(() => authority.activateDelivery(badBody, { nowMs: NOW + 1 }), 'activation_substitution');
  const badProtocol = activationInput(authority, reserved, attempt, engine, 'bad-protocol', { protocolVersion: 'v2' });
  badProtocol.activationRequestDigest = computeAgentActivationRequestDigest(badProtocol);
  expectCode(() => authority.activateDelivery(badProtocol, { nowMs: NOW + 1 }), 'activation_substitution');
  const badEnvelope = activationInput(authority, reserved, attempt, engine, 'bad-envelope', { envelopeBytes: reserved.preflightDescriptor.maxEnvelopeBytes + 1 });
  badEnvelope.activationRequestDigest = computeAgentActivationRequestDigest(badEnvelope);
  expectCode(() => authority.activateDelivery(badEnvelope, { nowMs: NOW + 1 }), 'activation_envelope_limit');
});

test('running Attempt/fence is durable before Case grant, Agent authorization, and first-send claim', () => {
  const { authority } = setupAgent({ reportedCapacity: 1 });
  const flow = reserveStartActivate({ authority, caseId: 'case-order', requestId: 'reservation-order' });
  expectCode(() => authority.claimFirstSend({
    deliveryId: flow.delivery.deliveryId,
    authorizationId: digest('not-authorized'),
    dispatchOrdinal: 1,
    dispatchGrantId: digest('no-grant'),
  }), 'dispatch_not_authorized');
  const grant = caseGrant(authority, flow.engine, flow.delivery.deliveryId);
  const events = flow.engine.snapshot().events;
  assert.ok(events.findIndex((event) => event.type === 'attempt_started') < events.findIndex((event) => event.type === 'attempt_dispatch_granted'));
  assert.equal(events.filter((event) => event.type === 'attempt_dispatch_granted').length, 1);
  const authorization = authorize(authority, grant).authorization;
  assert.equal(authority.claimFirstSend({
    deliveryId: flow.delivery.deliveryId,
    authorizationId: authorization.authorizationId,
    dispatchOrdinal: 1,
    dispatchGrantId: authorization.dispatchGrantId,
  }).maySend, true);
});

test('cancel-first forbids grant and activated-but-ungranted close releases admission without semantic retry', () => {
  const { authority } = setupAgent({ reportedCapacity: 1 });
  const flow = reserveStartActivate({ authority, caseId: 'case-cancel-first', requestId: 'reservation-cancel-first' });
  flow.engine.applyCommand({
    requestId: 'cancel-first',
    expectedCaseRevision: flow.engine.caseRevision,
    command: { type: 'cancel_task', taskId: 'task', reason: 'operator' },
  });
  const command = authority.grantCommand(flow.delivery.deliveryId);
  expectCode(() => flow.engine.applyCommand({
    requestId: 'grant-after-cancel',
    expectedCaseRevision: flow.engine.caseRevision,
    command,
  }), 'dispatch_grant_not_running');
  assert.equal(flow.engine.snapshot().events.filter((event) => event.type === 'attempt_dispatch_granted').length, 0);
  const closed = authority.closeUndispatchedDelivery(flow.delivery.deliveryId);
  assert.equal(closed.dispatchAuthorized, false);
  assert.equal(closed.positivelyNotSent, true);
  assert.equal(closed.executionNotStarted, true);
  assert.equal(closed.noHandle, true);
  assert.equal(closed.slotReleased, true);
  assert.equal(flow.engine.taskStates.task.attemptIds.length, 1);
});

test('grant-first remains durable linearization when cancellation commits before Agent authorization', () => {
  const { authority } = setupAgent({ reportedCapacity: 1 });
  const flow = reserveStartActivate({ authority, caseId: 'case-grant-first', requestId: 'reservation-grant-first' });
  const grant = caseGrant(authority, flow.engine, flow.delivery.deliveryId);
  flow.engine.applyCommand({
    requestId: 'cancel-after-grant',
    expectedCaseRevision: flow.engine.caseRevision,
    command: { type: 'cancel_task', taskId: 'task', reason: 'operator' },
  });
  assert.equal(authorize(authority, grant).classification, 'accepted');
  assert.equal(flow.engine.snapshot().events.filter((event) => event.type === 'attempt_dispatch_granted').length, 1);
});

test('Case grant response loss replays exact receipt without second grant or revision advance', () => {
  const { authority } = setupAgent({ reportedCapacity: 1 });
  const flow = reserveStartActivate({ authority, caseId: 'case-grant-replay', requestId: 'reservation-grant-replay' });
  const grant = caseGrant(authority, flow.engine, flow.delivery.deliveryId, 1, 'grant-stable-request');
  const revision = flow.engine.caseRevision;
  const replay = flow.engine.applyCommand(grant.envelope);
  assert.equal(replay.deduplicated, true);
  assert.deepEqual(replay.response, grant.response);
  assert.equal(flow.engine.caseRevision, revision);
  assert.equal(flow.engine.snapshot().events.filter((event) => event.type === 'attempt_dispatch_granted').length, 1);
  expectCode(() => flow.engine.applyCommand({
    requestId: 'different-grant-request',
    expectedCaseRevision: flow.engine.caseRevision,
    command: grant.command,
  }), 'dispatch_already_granted');
});

test('Agent authorization and first-send response loss never create duplicate send authority', () => {
  const { authority } = setupAgent({ reportedCapacity: 1 });
  const flow = reserveStartActivate({ authority, caseId: 'case-agent-replay', requestId: 'reservation-agent-replay' });
  const grant = caseGrant(authority, flow.engine, flow.delivery.deliveryId);
  const firstAuthorization = authorize(authority, grant);
  const replayAuthorization = authorize(authority, grant);
  assert.equal(firstAuthorization.classification, 'accepted');
  assert.equal(replayAuthorization.classification, 'exact_replay');
  assert.deepEqual(replayAuthorization.authorization, firstAuthorization.authorization);
  const input = {
    deliveryId: flow.delivery.deliveryId,
    authorizationId: firstAuthorization.authorization.authorizationId,
    dispatchOrdinal: 1,
    dispatchGrantId: grant.response.dispatchGrantId,
  };
  const first = authority.claimFirstSend(input);
  const replay = authority.claimFirstSend(input);
  assert.equal(first.maySend, true);
  assert.equal(replay.maySend, false);
  assert.equal(replay.possibleExecution, true);
  assert.equal(replay.claimId, first.claimId);
});

test('stale predecessor authorization cannot send after reconnect', () => {
  const { authority } = setupAgent({ reportedCapacity: 2 });
  const flow = reserveStartActivate({ authority, caseId: 'case-stale', requestId: 'reservation-stale' });
  const grant = caseGrant(authority, flow.engine, flow.delivery.deliveryId);
  const authorization = authorize(authority, grant).authorization;
  connect(authority, {
    expectedConnectionEpoch: 1,
    connectRequestId: 'reconnect-stale',
    connectionId: 'connection-two',
    executorId: 'executor-one',
    executorEpoch: 1,
  });
  capacity(authority, { capacityRevision: 8, reportedCapacity: 2 });
  expectCode(() => authority.claimFirstSend({
    deliveryId: flow.delivery.deliveryId,
    authorizationId: authorization.authorizationId,
    dispatchOrdinal: 1,
    dispatchGrantId: authorization.dispatchGrantId,
  }), 'stale_connection_fence');
});

test('contradictory cross-axis evidence quarantines atomically and blocks executable initiation', () => {
  const { authority } = setupAgent({ reportedCapacity: 1 });
  const flow = reserveStartActivate({ authority, caseId: 'case-conflict', requestId: 'reservation-conflict' });
  const grant = caseGrant(authority, flow.engine, flow.delivery.deliveryId);
  const authorization = authorize(authority, grant).authorization;
  assert.equal(authority.assimilateEvidence(evidenceInput(
    authority, flow.delivery, authorization, 1, { dispatch: 'positively_not_sent' },
  )).classification, 'monotonic_refinement');
  const conflict = authority.assimilateEvidence(evidenceInput(
    authority, flow.delivery, authorization, 2, { transportReceipt: 'received' },
  ));
  assert.equal(conflict.classification, 'conflict');
  assert.equal(conflict.evidence.transportReceipt, 'none');
  expectCode(() => authority.claimFirstSend({
    deliveryId: flow.delivery.deliveryId,
    authorizationId: authorization.authorizationId,
    dispatchOrdinal: 1,
    dispatchGrantId: authorization.dispatchGrantId,
  }), 'delivery_evidence_conflict');
});

test('higher evidence revision cannot legalize not_started -> started or no_handle -> execution history', () => {
  const { authority } = setupAgent({ reportedCapacity: 2 });
  const flow = reserveStartActivate({ authority, caseId: 'case-not-started', requestId: 'reservation-not-started' });
  const grant = caseGrant(authority, flow.engine, flow.delivery.deliveryId);
  const authorization = authorize(authority, grant).authorization;
  assert.equal(authority.assimilateEvidence(evidenceInput(
    authority, flow.delivery, authorization, 1, { execution: 'not_started' },
  )).classification, 'monotonic_refinement');
  assert.equal(authority.assimilateEvidence(evidenceInput(
    authority, flow.delivery, authorization, 2, { execution: 'started' },
  )).classification, 'conflict');

  const other = reserveStartActivate({ authority, caseId: 'case-no-handle', requestId: 'reservation-no-handle' });
  const otherGrant = caseGrant(authority, other.engine, other.delivery.deliveryId);
  const otherAuthorization = authorize(authority, otherGrant).authorization;
  assert.equal(authority.assimilateEvidence(evidenceInput(
    authority, other.delivery, otherAuthorization, 1, { cleanup: 'no_handle' },
  )).classification, 'monotonic_refinement');
  assert.equal(authority.assimilateEvidence(evidenceInput(
    authority, other.delivery, otherAuthorization, 2, { execution: 'started' },
  )).classification, 'conflict');
});

test('legal partial evidence supports started + cleanup_complete while effect remains unknown', () => {
  const { authority } = setupAgent({ reportedCapacity: 1 });
  const flow = reserveStartActivate({ authority, caseId: 'case-partial', requestId: 'reservation-partial' });
  const grant = caseGrant(authority, flow.engine, flow.delivery.deliveryId);
  const authorization = authorize(authority, grant).authorization;
  const started = evidenceInput(authority, flow.delivery, authorization, 1, { execution: 'started' });
  assert.equal(authority.assimilateEvidence(started).classification, 'monotonic_refinement');
  assert.equal(authority.assimilateEvidence(started).classification, 'exact_replay');
  const cleanup = authority.assimilateEvidence(evidenceInput(
    authority, flow.delivery, authorization, 2, { cleanup: 'cleanup_complete' },
  ));
  assert.equal(cleanup.classification, 'monotonic_refinement');
  assert.equal(cleanup.evidence.execution, 'started');
  assert.equal(cleanup.evidence.cleanup, 'cleanup_complete');
  assert.equal(cleanup.evidence.transportReceipt, 'none');
  assert.equal(cleanup.effect, 'unknown');
  assert.equal(cleanup.slotReleased, true);
  assert.equal(authority.assimilateEvidence(started).classification, 'stale');
});

test('positive physical cleanup releases capacity while effect uncertainty remains durable', () => {
  const { authority } = setupAgent({ reportedCapacity: 1 });
  const flow = reserveStartActivate({ authority, caseId: 'case-cleanup', requestId: 'reservation-cleanup' });
  const grant = caseGrant(authority, flow.engine, flow.delivery.deliveryId);
  const authorization = authorize(authority, grant).authorization;
  authority.assimilateEvidence(evidenceInput(
    authority, flow.delivery, authorization, 1, { dispatch: 'sent_observed', execution: 'started', cleanup: 'held' },
  ));
  const cleanup = authority.assimilateEvidence(evidenceInput(
    authority, flow.delivery, authorization, 2, { cleanup: 'cleanup_complete' },
  ));
  assert.equal(cleanup.slotReleased, true);
  assert.equal(cleanup.effect, 'unknown');
  assert.equal(authority.admission().availableSlots, 1);
  assert.equal(reserve(authority, reservationInput(authority, {
    caseId: 'case-next', requestId: 'reservation-next',
  })).classification, 'accepted');
});

test('disconnect alone never releases a live delivery slot or authorizes new admission', () => {
  const { authority } = setupAgent({ reportedCapacity: 1 });
  reserveStartActivate({ authority, caseId: 'case-disconnect', requestId: 'reservation-disconnect' });
  const current = authority.read().connection;
  const result = authority.disconnect({
    agentId: authority.read().routeBinding.agentId,
    routeGeneration: 1,
    connectionId: current.id,
    connectionEpoch: current.epoch,
  });
  assert.equal(result.slotsReleased, 0);
  assert.equal(authority.admission().occupiedSlots, 1);
  assert.equal(authority.admission().capacityKnown, false);
  expectCode(() => reserve(authority, reservationInput(authority, {
    caseId: 'case-after-disconnect',
    requestId: 'reservation-after-disconnect',
    capacityRevision: 7,
  })), 'capacity_unavailable');
});

test('capacity shrink is non-preemptive and later growth only permits fresh admission', () => {
  const { authority } = setupAgent({ reportedCapacity: 2, capacityRevision: 7 });
  const first = reservationInput(authority, { caseId: 'case-shrink-a', requestId: 'reservation-shrink-a' });
  const second = reservationInput(authority, { caseId: 'case-shrink-b', requestId: 'reservation-shrink-b' });
  reserve(authority, first);
  reserve(authority, second);
  capacity(authority, { capacityRevision: 8, reportedCapacity: 1 });
  assert.equal(authority.admission().occupiedSlots, 2);
  assert.equal(authority.admission().availableSlots, 0);
  expectCode(() => reserve(authority, reservationInput(authority, {
    caseId: 'case-shrink-c', requestId: 'reservation-shrink-c', capacityRevision: 8,
  })), 'capacity_saturated');
  authority.releaseReservation({
    reservationWindowGeneration: 1,
    reservationRequestId: first.reservationRequestId,
    reservationRequestDigest: first.reservationRequestDigest,
  }, { nowMs: NOW + 1 });
  capacity(authority, { capacityRevision: 9, reportedCapacity: 3 });
  assert.equal(reserve(authority, reservationInput(authority, {
    caseId: 'case-growth', requestId: 'reservation-growth', capacityRevision: 9,
  })).classification, 'accepted');
});

test('later dispatch ordinal requires positive unsent/not-started/no-handle proof, capacity reacquisition, and a fresh Case grant', () => {
  const { authority } = setupAgent({ reportedCapacity: 1 });
  const flow = reserveStartActivate({ authority, caseId: 'case-replay-ordinal', requestId: 'reservation-replay-ordinal' });
  const grant1 = caseGrant(authority, flow.engine, flow.delivery.deliveryId, 1);
  const authorization1 = authorize(authority, grant1).authorization;
  expectCode(() => authority.grantCommand(flow.delivery.deliveryId, 2), 'dispatch_replay_unsafe');
  const absent = authority.assimilateEvidence(evidenceInput(
    authority,
    flow.delivery,
    authorization1,
    1,
    { dispatch: 'positively_not_sent', execution: 'not_started', cleanup: 'no_handle' },
  ));
  assert.equal(absent.slotReleased, true);
  assert.equal(authority.reacquireDeliveryAdmission({
    deliveryId: flow.delivery.deliveryId,
    expectedNextOrdinal: 2,
  }).classification, 'accepted');
  const grant2 = caseGrant(authority, flow.engine, flow.delivery.deliveryId, 2);
  assert.notEqual(grant2.response.dispatchGrantId, grant1.response.dispatchGrantId);
  const authorization2 = authorize(authority, grant2).authorization;
  assert.equal(authorization2.dispatchOrdinal, 2);
});

test('bounded reservation detail fails closed instead of opening an unbounded second accepting window', () => {
  const { authority } = setupAgent({ reportedCapacity: 4, limits: { maxReservations: 2, maxAgentCapacity: 4, maxSlotsPerReservation: 4 } });
  reserve(authority, reservationInput(authority, { caseId: 'case-limit-a', requestId: 'reservation-limit-a' }));
  reserve(authority, reservationInput(authority, { caseId: 'case-limit-b', requestId: 'reservation-limit-b' }));
  expectCode(() => reserve(authority, reservationInput(authority, {
    caseId: 'case-limit-c', requestId: 'reservation-limit-c',
  })), 'reservation_window_detail_limit');
  assert.equal(authority.read().reservationWindowGeneration, 1);
});

test('bounded connect-receipt GC cannot resurrect an ancient connect request', () => {
  const { authority } = setupAgent({ limits: { maxConnectReceipts: 1 } });
  const firstRequest = {
    agentId: authority.read().routeBinding.agentId,
    routeGeneration: 1,
    expectedConnectionEpoch: 1,
    connectRequestId: 'connect-gc-two',
    connectionId: 'connection-gc-two',
    executorId: 'executor-one',
    executorEpoch: 1,
    protocolMetadataDigest: digest({ protocol: 'test-v1' }),
  };
  const first = { ...firstRequest, requestDigest: computeAgentConnectRequestDigest(firstRequest) };
  authority.connect(first);
  connect(authority, {
    expectedConnectionEpoch: 2,
    connectRequestId: 'connect-gc-three',
    connectionId: 'connection-gc-three',
  });
  assert.equal(Object.keys(authority.read().connectReceipts).length, 1);
  const ancient = authority.connect(first);
  assert.equal(ancient.classification, 'stale');
  assert.equal(authority.read().lastConnectionEpoch, 3);
});

test('result handoff validates current connection/delivery fence and reuses one stable Case command receipt', () => {
  const { authority } = setupAgent({ reportedCapacity: 1 });
  const flow = reserveStartActivate({ authority, caseId: 'case-result', requestId: 'reservation-result' });
  const grant = caseGrant(authority, flow.engine, flow.delivery.deliveryId);
  const authorization = authorize(authority, grant).authorization;
  authority.claimFirstSend({
    deliveryId: flow.delivery.deliveryId,
    authorizationId: authorization.authorizationId,
    dispatchOrdinal: 1,
    dispatchGrantId: authorization.dispatchGrantId,
  });
  const result = resultFor(flow.engine.plan.baseDigest, flow.engine.plan.tasksById.task, 'result-body');
  const resultEnvelope = flow.engine.resultEnvelope(flow.attempt.id, result);
  const current = authority.read();
  const handoff = authority.resultHandoff({
    agentId: current.routeBinding.agentId,
    routeGeneration: current.routeBinding.routeGeneration,
    connectionId: current.connection.id,
    connectionEpoch: current.connection.epoch,
    deliveryId: flow.delivery.deliveryId,
    resultEnvelope,
  });
  assert.match(handoff.requestId, /^delivery-result-[a-f0-9]{64}$/);
  assert.equal(handoff.resultDigest, digest(result));
  const commandEnvelope = {
    requestId: handoff.requestId,
    expectedCaseRevision: flow.engine.caseRevision,
    command: handoff.command,
  };
  const accepted = flow.engine.applyCommand(commandEnvelope);
  assert.equal(accepted.deduplicated, false);
  const revision = flow.engine.caseRevision;
  const replay = flow.engine.applyCommand(commandEnvelope);
  assert.equal(replay.deduplicated, true);
  assert.equal(flow.engine.caseRevision, revision);
  assert.equal(flow.engine.attempts[flow.attempt.id].state, 'succeeded');
});

test('result handoff rejects pre-send, stale executor, and oversized result envelopes before Case authority', () => {
  const { authority } = setupAgent({
    reportedCapacity: 2,
    limits: { maxExecutableBodyBytes: 512, maxEnvelopeBytes: 1024, maxAggregateLiveBodyBytes: 4096 },
  });
  const flow = reserveStartActivate({ authority, caseId: 'case-result-fence', requestId: 'reservation-result-fence' });
  const result = resultFor(flow.engine.plan.baseDigest, flow.engine.plan.tasksById.task, 'small');
  const resultEnvelope = flow.engine.resultEnvelope(flow.attempt.id, result);
  let current = authority.read();
  const handoffInput = () => ({
    agentId: current.routeBinding.agentId,
    routeGeneration: current.routeBinding.routeGeneration,
    connectionId: current.connection.id,
    connectionEpoch: current.connection.epoch,
    deliveryId: flow.delivery.deliveryId,
    resultEnvelope,
  });
  expectCode(() => authority.resultHandoff(handoffInput()), 'result_before_dispatch');
  const grant = caseGrant(authority, flow.engine, flow.delivery.deliveryId);
  const authorization = authorize(authority, grant).authorization;
  authority.claimFirstSend({
    deliveryId: flow.delivery.deliveryId,
    authorizationId: authorization.authorizationId,
    dispatchOrdinal: 1,
    dispatchGrantId: authorization.dispatchGrantId,
  });
  connect(authority, {
    expectedConnectionEpoch: 1,
    connectRequestId: 'result-executor-replacement',
    connectionId: 'result-connection-two',
    executorId: 'executor-two',
    executorEpoch: 2,
  });
  current = authority.read();
  expectCode(() => authority.resultHandoff(handoffInput()), 'stale_executor_fence');

  const { authority: bounded } = setupAgent({
    reportedCapacity: 1,
    limits: { maxExecutableBodyBytes: 512, maxEnvelopeBytes: 1024, maxAggregateLiveBodyBytes: 4096 },
  });
  const boundedFlow = reserveStartActivate({ bounded: undefined, authority: bounded, caseId: 'case-result-bound', requestId: 'reservation-result-bound' });
  const boundedGrant = caseGrant(bounded, boundedFlow.engine, boundedFlow.delivery.deliveryId);
  const boundedAuthorization = authorize(bounded, boundedGrant).authorization;
  bounded.claimFirstSend({
    deliveryId: boundedFlow.delivery.deliveryId,
    authorizationId: boundedAuthorization.authorizationId,
    dispatchOrdinal: 1,
    dispatchGrantId: boundedAuthorization.dispatchGrantId,
  });
  const largeResult = resultFor(boundedFlow.engine.plan.baseDigest, boundedFlow.engine.plan.tasksById.task, 'x'.repeat(2048));
  const largeEnvelope = boundedFlow.engine.resultEnvelope(boundedFlow.attempt.id, largeResult);
  const boundedState = bounded.read();
  expectCode(() => bounded.resultHandoff({
    agentId: boundedState.routeBinding.agentId,
    routeGeneration: boundedState.routeBinding.routeGeneration,
    connectionId: boundedState.connection.id,
    connectionEpoch: boundedState.connection.epoch,
    deliveryId: boundedFlow.delivery.deliveryId,
    resultEnvelope: largeEnvelope,
  }), 'agent_delivery_limit');
});

test('durable snapshot validation rejects corrupted delivery Attempt ordinal and dispatch receipt identity', () => {
  const { store, binding, authority } = setupAgent({ reportedCapacity: 1 });
  const flow = reserveStartActivate({ authority, caseId: 'case-corrupt', requestId: 'reservation-corrupt' });
  const grant = caseGrant(authority, flow.engine, flow.delivery.deliveryId);
  authorize(authority, grant);
  const corruptAttempt = store.load(binding.agentId);
  corruptAttempt.deliveries[flow.delivery.deliveryId].attemptOrdinal = 2;
  store.snapshots.set(binding.agentId, corruptAttempt);
  expectCode(() => authority.read(), 'invalid_agent_delivery_snapshot');

  const cleanStore = new MemoryAgentDeliveryStore();
  const cleanAuthority = new AgentDeliveryAuthority({ store: cleanStore, routeBinding: binding });
  cleanAuthority.initialize();
  connect(cleanAuthority);
  capacity(cleanAuthority, { capacityRevision: 1, reportedCapacity: 1 });
  const cleanFlow = reserveStartActivate({ authority: cleanAuthority, caseId: 'case-corrupt-dispatch', requestId: 'reservation-corrupt-dispatch' });
  const cleanGrant = caseGrant(cleanAuthority, cleanFlow.engine, cleanFlow.delivery.deliveryId);
  authorize(cleanAuthority, cleanGrant);
  const corruptDispatch = cleanStore.load(binding.agentId);
  corruptDispatch.deliveries[cleanFlow.delivery.deliveryId].dispatches['1'].event.caseRevision += 1;
  cleanStore.snapshots.set(binding.agentId, corruptDispatch);
  expectCode(() => cleanAuthority.read(), 'invalid_agent_delivery_snapshot');
});
