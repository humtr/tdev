import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AgentDeliveryAuthority,
  CaseEngine,
  INSTALLABLE_AGENT_ADMISSION_PROFILE,
  MemoryAgentDeliveryStore,
  computeAgentActivationRequestDigest,
  computeAgentCapacityRequestDigest,
  computeAgentConnectRequestDigest,
  computeAgentDeliveryId,
  computeAgentReservationRequestDigest,
  computeInstallableAgentManagementIntentDigest,
  digest,
  managementRequestReplay,
  normalizeInstallableAgentState,
  typedDigest,
} from '../src/index.mjs';
import { planWithWork } from './helpers.mjs';

const NOW = 2_000_000;
const MGMT_PROOF = 'management-proof';
const EVIDENCE_PROOF = 'evidence-proof';

function expectCode(fn, code) {
  assert.throws(fn, (error) => error?.code === code);
}

function binding() {
  return {
    agentId: 'd0027-agent',
    routeGeneration: 1,
    deployment: 'qualification',
    environment: 'test',
    workerScript: 'tdev-d0027-test',
    className: 'AgentDeliveryRuntimeDO',
    namespace: 'd0027-test-namespace',
    jurisdiction: 'global',
    durableObjectId: 'd0027-test-do',
  };
}

function createAuthority({ managementVerifier, evidenceVerifier, limits = {} } = {}) {
  const store = new MemoryAgentDeliveryStore();
  const routeBinding = binding();
  const authority = new AgentDeliveryAuthority({
    store,
    routeBinding,
    verifyManagementProof: managementVerifier ?? ((proof) => proof === MGMT_PROOF),
    verifyInstallableAgentEvidence: evidenceVerifier ?? ((proof) => proof === EVIDENCE_PROOF),
  });
  authority.initialize({ limits });
  return { authority, store, routeBinding };
}

const MANAGEMENT_REQUEST_ALIASES = new WeakMap();

function canonicalManagementRequestId(authority, requestedId) {
  if (requestedId.startsWith('m2:')) return requestedId;
  let aliases = MANAGEMENT_REQUEST_ALIASES.get(authority);
  if (aliases === undefined) {
    aliases = new Map();
    MANAGEMENT_REQUEST_ALIASES.set(authority, aliases);
  }
  const existing = aliases.get(requestedId);
  if (existing !== undefined) return existing;
  const installableAgent = authority.readInstallableAgent().installableAgent;
  const highWater = installableAgent.state === 'LEGACY_D0020_ONLY'
    ? 0
    : installableAgent.managementRequestSequenceHighWater;
  const managementRequestId = `m2:${highWater + 1}`;
  aliases.set(requestedId, managementRequestId);
  return managementRequestId;
}

function managementRequest(authority, operation, requestedId, content, { predecessorDigest, proof = MGMT_PROOF } = {}) {
  const routeBinding = authority.read().routeBinding;
  const expectedPredecessorDigest = predecessorDigest ?? authority.readInstallableAgent().predecessorDigest;
  const managementRequestId = canonicalManagementRequestId(authority, requestedId);
  return {
    managementRequestId,
    intentDigest: computeInstallableAgentManagementIntentDigest(operation, routeBinding, content),
    expectedPredecessorDigest,
    managementProof: proof,
    ...content,
  };
}

function managementEnvelope(request) {
  return {
    managementRequestId: request.managementRequestId,
    intentDigest: request.intentDigest,
    expectedPredecessorDigest: request.expectedPredecessorDigest,
    managementProof: request.managementProof,
  };
}

function registrationContent(tag = 'one') {
  const packageTrustSubjectDigest = digest({ releaseKey: `key-${tag}` });
  const trustSubjects = { [packageTrustSubjectDigest]: 'active' };
  return {
    credentialProvisioningId: `credential-provisioning-${tag}`,
    packageManifestDigest: digest({ package: tag }),
    packageTrustSubjectDigest,
    trustStateDigest: digest({ trustSubjects }),
    trustSubjects,
  };
}

function migrate(authority) {
  return authority.migrateInstallableAgentRoute({ migrationProfile: 'tdev.d0020-only-to-d0027-unregistered.v1' });
}

function stageGenesis(authority, pending, types = ['bootstrap_trust', 'package_verified', 'verifier_ready', 'local_ready', 'local_service_ready']) {
  for (const type of types) {
    authority.recordInstallableAgentGenesisEvidence({
      pendingDigest: pending.pendingDigest,
      genesisGeneration: pending.genesisGeneration,
      type,
      evidenceDigest: digest({ type, pendingDigest: pending.pendingDigest }),
      evidenceProof: EVIDENCE_PROOF,
    });
  }
}

function registerAndActivate(authority, tag = 'one') {
  migrate(authority);
  const content = registrationContent(tag);
  const request = managementRequest(authority, 'register', `register-${tag}`, content);
  const registered = authority.registerInstallableAgent(request);
  stageGenesis(authority, registered);
  const activated = authority.initialActivateInstallableAgent({
    managementRequestId: request.managementRequestId,
    intentDigest: request.intentDigest,
    expectedPredecessorDigest: request.expectedPredecessorDigest,
    managementProof: request.managementProof,
    pendingDigest: registered.pendingDigest,
    genesisGeneration: registered.genesisGeneration,
  });
  return { request, registered, activated };
}

function connectCurrent(authority, suffix = 'one') {
  const tuple = authority.readInstallableAgent().currentTuple;
  const state = authority.read();
  const content = {
    agentId: state.routeBinding.agentId,
    routeGeneration: state.routeBinding.routeGeneration,
    expectedConnectionEpoch: state.lastConnectionEpoch,
    connectRequestId: `connect-${suffix}`,
    connectionId: `connection-${suffix}`,
    executorId: 'executor-one',
    executorEpoch: 1,
    protocolMetadataDigest: digest({ protocol: 'd0027-test-v1' }),
    installableAgentTuple: tuple,
  };
  const connected = authority.connect({ ...content, requestDigest: computeAgentConnectRequestDigest(content) });
  const capacityContent = {
    agentId: state.routeBinding.agentId,
    routeGeneration: state.routeBinding.routeGeneration,
    connectionId: connected.receipt.connectionId,
    connectionEpoch: connected.receipt.connectionEpoch,
    executorId: connected.receipt.executorId,
    executorEpoch: connected.receipt.executorEpoch,
    capacityRevision: 1,
    reportedCapacity: 2,
  };
  authority.observeCapacity({ ...capacityContent, requestDigest: computeAgentCapacityRequestDigest(capacityContent) });
  return connected;
}

function makeDelivery(authority, tag = 'one') {
  const plan = planWithWork([{ id: `task-${tag}` }]);
  const engine = new CaseEngine({ caseId: `case-${tag}`, plan });
  const state = authority.read();
  const preflightDescriptor = {
    profileId: 'd0027-local-test',
    protocolVersion: 'v1',
    executableBodyDigest: digest({ body: tag }),
    executableBodyBytes: 32,
    resourceDimensions: { processSlots: 1 },
    maxEnvelopeBytes: 16 * 1024,
  };
  const reservationContent = {
    agentId: state.routeBinding.agentId,
    routeGeneration: state.routeBinding.routeGeneration,
    reservationWindowGeneration: state.reservationWindowGeneration,
    reservationRequestId: `reserve-${tag}`,
    executorId: state.executor.id,
    executorEpoch: state.executor.epoch,
    capacityRevision: state.capacity.revision,
    caseId: engine.caseId,
    taskId: `task-${tag}`,
    expectedCaseRevision: engine.caseRevision,
    predictedAttemptOrdinal: 1,
    requestedSlots: 1,
    expiresAtMs: NOW + 100,
    preflightDescriptor,
  };
  const reservation = authority.reserve({
    ...reservationContent,
    reservationRequestDigest: computeAgentReservationRequestDigest(reservationContent, state.limits),
  }, { nowMs: NOW }).reservation;
  const attempt = engine.startAttempt(`task-${tag}`, {
    id: state.executor.id,
    epoch: state.executor.epoch,
    capabilities: [],
  });
  const identity = {
    agentId: state.routeBinding.agentId,
    routeGeneration: state.routeBinding.routeGeneration,
    caseId: reservation.caseId,
    taskId: reservation.taskId,
    attemptId: attempt.id,
    executorId: attempt.executorId,
    executorEpoch: attempt.executorEpoch,
    fencingToken: attempt.fencingToken,
  };
  const activation = {
    agentId: state.routeBinding.agentId,
    routeGeneration: state.routeBinding.routeGeneration,
    activationRequestId: `activate-${tag}`,
    reservationWindowGeneration: reservation.windowGeneration,
    reservationRequestId: reservation.reservationRequestId,
    reservationRequestDigest: reservation.reservationRequestDigest,
    slotToken: reservation.slotToken,
    slotGeneration: reservation.slotGeneration,
    deliveryId: computeAgentDeliveryId(identity),
    caseId: reservation.caseId,
    taskId: reservation.taskId,
    attemptId: attempt.id,
    attemptOrdinal: attempt.ordinal,
    executorId: attempt.executorId,
    executorEpoch: attempt.executorEpoch,
    fencingToken: attempt.fencingToken,
    sourceCaseRevision: engine.caseRevision,
    executableBodyDigest: preflightDescriptor.executableBodyDigest,
    executableBodyBytes: preflightDescriptor.executableBodyBytes,
    envelopeBytes: preflightDescriptor.maxEnvelopeBytes,
    protocolVersion: preflightDescriptor.protocolVersion,
    effectKey: attempt.effectKey,
  };
  const delivery = authority.activateDelivery({
    ...activation,
    activationRequestDigest: computeAgentActivationRequestDigest(activation),
  }, { nowMs: NOW + 1 }).delivery;
  const command = authority.grantCommand(delivery.deliveryId, 1);
  const grantEnvelope = {
    requestId: `grant-${tag}`,
    expectedCaseRevision: engine.caseRevision,
    command,
  };
  const grantReceipt = engine.applyCommand(grantEnvelope);
  const authorization = authority.authorizeDispatch({
    grantRequestId: grantEnvelope.requestId,
    command,
    dispatchGrantId: grantReceipt.response.dispatchGrantId,
    committedCaseRevision: grantReceipt.response.committedCaseRevision,
    event: grantReceipt.response.event,
  }).authorization;
  return { engine, attempt, delivery, authorization };
}

function evidence(authority, managementRequestId, type, tag = type) {
  return authority.recordInstallableAgentTransactionEvidence({
    managementRequestId,
    type,
    evidenceDigest: digest({ managementRequestId, type, tag }),
    evidenceProof: EVIDENCE_PROOF,
  });
}

test('management auth denial mutates nothing and stable register replay conflicts on changed intent or predecessor', () => {
  const { authority } = createAuthority();
  migrate(authority);
  const content = registrationContent('auth');
  const denied = managementRequest(authority, 'register', 'register-auth', content, { proof: 'denied' });
  const before = authority.read();
  expectCode(() => authority.registerInstallableAgent(denied), 'management_authentication_failed');
  assert.deepEqual(authority.read(), before);

  const request = managementRequest(authority, 'register', 'register-auth', content);
  const accepted = authority.registerInstallableAgent(request);
  assert.equal(accepted.state, 'GENESIS_PENDING');
  assert.equal(authority.registerInstallableAgent(request).classification, 'exact_replay');

  const changedContent = { ...content, trustStateDigest: digest({ changed: true }) };
  const changedIntent = {
    ...request,
    ...changedContent,
    intentDigest: computeInstallableAgentManagementIntentDigest('register', authority.read().routeBinding, changedContent),
  };
  expectCode(() => authority.registerInstallableAgent(changedIntent), 'management_request_conflict');
  expectCode(() => authority.registerInstallableAgent({ ...request, expectedPredecessorDigest: digest({ stale: true }) }), 'management_request_conflict');
});

test('genesis remains non-executable, failed candidates never reuse generations, and exact initial_activate wins once', () => {
  const { authority } = createAuthority();
  migrate(authority);
  const firstContent = registrationContent('failed');
  const firstRequest = managementRequest(authority, 'register', 'register-failed', firstContent);
  const first = authority.registerInstallableAgent(firstRequest);
  const pendingTuple = {
    installationGeneration: first.candidate.installationGeneration,
    credentialGeneration: first.candidate.credentialGeneration,
    packageActivationGeneration: first.candidate.packageActivationGeneration,
    packageManifestDigest: first.candidate.packageManifestDigest,
    trustPolicyGeneration: first.candidate.trustPolicyGeneration,
    trustStateDigest: first.candidate.trustStateDigest,
    lifecycleGeneration: first.candidate.lifecycleGeneration,
  };
  const state = authority.read();
  const connectContent = {
    agentId: state.routeBinding.agentId,
    routeGeneration: state.routeBinding.routeGeneration,
    expectedConnectionEpoch: 0,
    connectRequestId: 'pending-connect',
    connectionId: 'pending-connection',
    executorId: 'executor-one',
    executorEpoch: 1,
    protocolMetadataDigest: digest({ protocol: 'pending' }),
    installableAgentTuple: pendingTuple,
  };
  expectCode(() => authority.connect({ ...connectContent, requestDigest: computeAgentConnectRequestDigest(connectContent) }), 'installable_agent_not_current');
  expectCode(() => authority.prepareBaseStart(managementEnvelope(managementRequest(authority, 'start', 'genesis-start', { cause: 'base_start', restartEligibleStopRequestId: null }))), 'installable_agent_not_current');

  authority.failInstallableAgentGenesis({
    managementRequestId: firstRequest.managementRequestId,
    intentDigest: firstRequest.intentDigest,
    expectedPredecessorDigest: firstRequest.expectedPredecessorDigest,
    managementProof: firstRequest.managementProof,
    pendingDigest: first.pendingDigest,
    genesisGeneration: first.genesisGeneration,
    failureDigest: digest({ failed: 'bootstrap' }),
  });
  const secondContent = registrationContent('winner');
  const secondRequest = managementRequest(authority, 'register', 'register-winner', secondContent);
  const second = authority.registerInstallableAgent(secondRequest);
  assert.ok(second.genesisGeneration > first.genesisGeneration);
  assert.ok(second.candidate.installationGeneration > first.candidate.installationGeneration);
  assert.ok(second.candidate.credentialGeneration > first.candidate.credentialGeneration);
  assert.ok(second.candidate.packageActivationGeneration > first.candidate.packageActivationGeneration);
  assert.ok(second.candidate.trustPolicyGeneration > first.candidate.trustPolicyGeneration);
  assert.ok(second.candidate.lifecycleGeneration > first.candidate.lifecycleGeneration);
  stageGenesis(authority, second);
  const activationInput = {
    managementRequestId: secondRequest.managementRequestId,
    intentDigest: secondRequest.intentDigest,
    expectedPredecessorDigest: secondRequest.expectedPredecessorDigest,
    managementProof: secondRequest.managementProof,
    pendingDigest: second.pendingDigest,
    genesisGeneration: second.genesisGeneration,
  };
  assert.equal(authority.initialActivateInstallableAgent(activationInput).classification, 'accepted');
  assert.equal(authority.initialActivateInstallableAgent(activationInput).classification, 'exact_replay');
  assert.equal(authority.readInstallableAgent().installableAgent.state, 'CURRENT');
});

test('bounded management receipt GC preserves non-resurrection after detail retirement', () => {
  const { authority } = createAuthority({ limits: { maxManagementReceipts: 4, maxManagementTombstones: 4 } });
  const { request } = registerAndActivate(authority, 'gc');
  authority.compactInstallableAgentManagementReceipts({ requestIds: [request.managementRequestId] });
  expectCode(() => authority.registerInstallableAgent(request), 'management_request_retired');
  const installable = authority.readInstallableAgent().installableAgent;
  assert.equal(installable.managementReceipts[request.managementRequestId], undefined);
  assert.ok(installable.managementTombstones[request.managementRequestId]);
  assert.equal(installable.managementRequestSequenceHighWater, 1);

  const floorOnly = JSON.parse(JSON.stringify(installable));
  floorOnly.managementReceipts = {};
  floorOnly.managementTombstones = {};
  expectCode(() => managementRequestReplay(floorOnly, {
    managementRequestId: 'm2:1',
    intentDigest: digest({ ancient: 'intent' }),
    expectedPredecessorDigest: digest({ ancient: 'predecessor' }),
  }, 'register', authority.read().limits), 'management_request_retired');
});

test('m2 sequencing is canonical, gap-safe, and failed mutations do not burn the durable request floor', () => {
  const { authority } = createAuthority();
  migrate(authority);
  assert.equal(authority.readInstallableAgent().installableAgent.managementRequestSequenceHighWater, 0);

  const content = registrationContent('m2-sequence');
  const first = managementRequest(authority, 'register', 'm2:1', content);
  expectCode(() => authority.registerInstallableAgent({ ...first, managementRequestId: 'legacy-register-id' }), 'invalid_management_request_id');
  expectCode(() => authority.registerInstallableAgent({ ...first, managementRequestId: 'm2:01' }), 'invalid_management_request_id');
  assert.equal(authority.readInstallableAgent().installableAgent.managementRequestSequenceHighWater, 0);

  const gap = managementRequest(authority, 'register', 'm2:2', content);
  expectCode(() => authority.registerInstallableAgent(gap), 'management_request_gap');
  assert.equal(authority.readInstallableAgent().installableAgent.managementRequestSequenceHighWater, 0);

  const pending = authority.registerInstallableAgent(first);
  assert.equal(authority.readInstallableAgent().installableAgent.managementRequestSequenceHighWater, 1);
  assert.equal(authority.registerInstallableAgent(first).classification, 'exact_replay');
  assert.equal(authority.readInstallableAgent().installableAgent.managementRequestSequenceHighWater, 1);
  stageGenesis(authority, pending);
  authority.initialActivateInstallableAgent({
    ...managementEnvelope(first),
    pendingDigest: pending.pendingDigest,
    genesisGeneration: pending.genesisGeneration,
  });

  const invalidStart = managementRequest(authority, 'start', 'm2:2', {
    cause: 'base_start',
    restartEligibleStopRequestId: null,
  });
  expectCode(() => authority.prepareBaseStart(managementEnvelope(invalidStart)), 'start_not_restart_eligible');
  assert.equal(authority.readInstallableAgent().installableAgent.managementRequestSequenceHighWater, 1);

  const stop = managementRequest(authority, 'stop', 'm2:2', { cause: 'base_stop' });
  authority.beginBaseStop(managementEnvelope(stop));
  assert.equal(authority.readInstallableAgent().installableAgent.managementRequestSequenceHighWater, 2);
});

function strictAdmissionV1Snapshot(current) {
  const predecessor = JSON.parse(JSON.stringify(current));
  predecessor.profile = 'tdev.installable-agent-admission.v1';
  for (const field of [
    'managementRequestSequenceHighWater',
    'managementKeyId',
    'managementPublicKey',
    'releaseRootKeyId',
    'releaseRootPublicKey',
    'currentCredentialKeyId',
    'currentCredentialPublicKey',
    'pendingCredentialKeyId',
    'pendingCredentialPublicKey',
    'connectRequestSequenceHighWater',
    'possessionChallengeGenerationHighWater',
    'possessionChallenge',
  ]) delete predecessor[field];
  return predecessor;
}

test('m2 numeric overflow and management receipt storage pressure fail closed without burning the request floor', () => {
  const { authority } = createAuthority({ limits: { maxManagementReceipts: 1, maxManagementTombstones: 4 } });
  migrate(authority);
  const content = registrationContent('q1-overflow-capacity');
  const overflow = managementRequest(authority, 'register', 'm2:9007199254740992', content);
  expectCode(() => authority.registerInstallableAgent(overflow), 'invalid_management_request_id');
  assert.equal(authority.readInstallableAgent().installableAgent.managementRequestSequenceHighWater, 0);

  const first = managementRequest(authority, 'register', 'm2:1', content);
  const pending = authority.registerInstallableAgent(first);
  stageGenesis(authority, pending);
  authority.initialActivateInstallableAgent({
    ...managementEnvelope(first),
    pendingDigest: pending.pendingDigest,
    genesisGeneration: pending.genesisGeneration,
  });
  assert.equal(authority.readInstallableAgent().installableAgent.managementRequestSequenceHighWater, 1);

  const current = authority.readInstallableAgent().installableAgent.current;
  const trustContent = {
    trustStateDigest: digest({ trust: 'q1-storage-pressure' }),
    trustSubjects: { [current.packageTrustSubjectDigest]: 'active' },
    trustContinuesCurrentPackage: false,
  };
  const second = managementRequest(authority, 'trust', 'm2:2', trustContent);
  expectCode(() => authority.mutateInstallableAgentTrust(second), 'management_replay_capacity');
  assert.equal(authority.readInstallableAgent().installableAgent.managementRequestSequenceHighWater, 1);
});

test('nested admission v1 migrates explicitly to v2 and imports only canonical surviving m2 sequence state', () => {
  const { authority } = createAuthority();
  const { request } = registerAndActivate(authority, 'nested-v2-migration');
  const current = authority.readInstallableAgent().installableAgent;
  assert.equal(authority.read().schemaVersion, 3);
  assert.equal(current.profile, INSTALLABLE_AGENT_ADMISSION_PROFILE);
  assert.equal(current.managementRequestSequenceHighWater, 1);
  assert.equal(request.managementRequestId, 'm2:1');

  const predecessorV1 = strictAdmissionV1Snapshot(current);
  const migrated = normalizeInstallableAgentState(predecessorV1, authority.read().limits);
  assert.equal(migrated.profile, INSTALLABLE_AGENT_ADMISSION_PROFILE);
  assert.equal(migrated.managementRequestSequenceHighWater, 1);
  assert.ok(migrated.managementReceipts['m2:1']);

  const legacyOnly = strictAdmissionV1Snapshot(current);
  const legacyReceipt = legacyOnly.managementReceipts['m2:1'];
  delete legacyOnly.managementReceipts['m2:1'];
  legacyOnly.managementReceipts['legacy-register'] = { ...legacyReceipt, managementRequestId: 'legacy-register' };
  const migratedLegacy = normalizeInstallableAgentState(legacyOnly, authority.read().limits);
  assert.equal(migratedLegacy.managementRequestSequenceHighWater, 0);
  assert.ok(migratedLegacy.managementReceipts['legacy-register']);

  const noncanonical = strictAdmissionV1Snapshot(current);
  const badReceipt = noncanonical.managementReceipts['m2:1'];
  delete noncanonical.managementReceipts['m2:1'];
  noncanonical.managementReceipts['m2:01'] = { ...badReceipt, managementRequestId: 'm2:01' };
  expectCode(() => normalizeInstallableAgentState(noncanonical, authority.read().limits), 'invalid_installable_agent_state');

  const missingFloorV2 = JSON.parse(JSON.stringify(current));
  delete missingFloorV2.managementRequestSequenceHighWater;
  assert.throws(() => normalizeInstallableAgentState(missingFloorV2, authority.read().limits));

  const trustSubject = current.current.packageTrustSubjectDigest;
  const packageRequest = managementRequest(authority, 'package', 'm2:2', {
    transitionCause: 'package_update',
    packageManifestDigest: digest({ package: 'migration-nonterminal' }),
    packageTrustSubjectDigest: trustSubject,
  });
  authority.beginPackageActivation(packageRequest);
  const nonterminalV1 = strictAdmissionV1Snapshot(authority.readInstallableAgent().installableAgent);
  expectCode(() => normalizeInstallableAgentState(nonterminalV1, authority.read().limits), 'unsupported_installable_agent_migration');
});

test('trust, credential, package and lifecycle generations advance independently without ABA', () => {
  const { authority } = createAuthority();
  registerAndActivate(authority, 'generations');
  const initial = authority.readInstallableAgent().installableAgent.current;

  const trustSubject = initial.packageTrustSubjectDigest;
  const trustContent = {
    trustStateDigest: digest({ trust: 'v2' }),
    trustSubjects: { [trustSubject]: 'active' },
    trustContinuesCurrentPackage: false,
  };
  assert.equal(authority.readInstallableAgent().installableAgent.managementRequestSequenceHighWater, 1);
  const trustRequest = managementRequest(authority, 'trust', 'trust-v2', trustContent);
  authority.mutateInstallableAgentTrust(trustRequest);
  assert.equal(trustRequest.managementRequestId, 'm2:2');
  assert.equal(authority.readInstallableAgent().installableAgent.managementRequestSequenceHighWater, 2);
  const afterTrust = authority.readInstallableAgent().installableAgent.current;
  assert.equal(afterTrust.trustPolicyGeneration, initial.trustPolicyGeneration + 1);
  assert.equal(afterTrust.credentialGeneration, initial.credentialGeneration);
  assert.equal(afterTrust.packageActivationGeneration, initial.packageActivationGeneration);

  const credentialRequest = managementRequest(authority, 'credential_rotate', 'credential-v2', { credentialProvisioningId: 'credential-provisioning-v2' });
  const credentialPending = authority.beginCredentialRotation(credentialRequest);
  assert.equal(credentialRequest.managementRequestId, 'm2:3');
  assert.equal(authority.readInstallableAgent().installableAgent.managementRequestSequenceHighWater, 3);
  assert.equal(credentialPending.credentialGeneration, initial.credentialGeneration + 1);
  evidence(authority, credentialRequest.managementRequestId, 'verifier_ready');
  evidence(authority, credentialRequest.managementRequestId, 'local_ready');
  authority.commitCredentialRotation(managementEnvelope(credentialRequest));
  assert.equal(authority.readInstallableAgent().installableAgent.managementRequestSequenceHighWater, 3);
  const afterCredential = authority.readInstallableAgent().installableAgent.current;
  assert.equal(afterCredential.credentialGeneration, initial.credentialGeneration + 1);
  assert.equal(afterCredential.packageActivationGeneration, initial.packageActivationGeneration);

  const packageContent = {
    transitionCause: 'package_rollback',
    packageManifestDigest: digest({ package: 'previous-bytes-forward-generation' }),
    packageTrustSubjectDigest: trustSubject,
  };
  const packageRequest = managementRequest(authority, 'package', 'package-forward-rollback', packageContent);
  const packagePending = authority.beginPackageActivation(packageRequest);
  assert.equal(packageRequest.managementRequestId, 'm2:4');
  assert.equal(authority.readInstallableAgent().installableAgent.managementRequestSequenceHighWater, 4);
  assert.equal(packagePending.packageActivationGeneration, initial.packageActivationGeneration + 1);
  evidence(authority, packageRequest.managementRequestId, 'package_verified');
  evidence(authority, packageRequest.managementRequestId, 'local_service_ready');
  evidence(authority, packageRequest.managementRequestId, 'positive_quiescence');
  authority.commitPackageActivation(managementEnvelope(packageRequest));
  assert.equal(authority.readInstallableAgent().installableAgent.managementRequestSequenceHighWater, 4);
  const afterPackage = authority.readInstallableAgent().installableAgent.current;
  assert.equal(afterPackage.packageActivationGeneration, initial.packageActivationGeneration + 1);
  assert.equal(afterPackage.trustPolicyGeneration, afterTrust.trustPolicyGeneration);
  assert.ok(afterPackage.lifecycleGeneration > initial.lifecycleGeneration);
});

test('base stop fences before quiescence, start is restart-only, and uninstall from stopped owns newer drain and final revoke', () => {
  const { authority } = createAuthority();
  registerAndActivate(authority, 'lifecycle');
  const initialGeneration = authority.readInstallableAgent().installableAgent.current.lifecycleGeneration;

  const stopRequest = managementRequest(authority, 'stop', 'base-stop', { cause: 'base_stop' });
  const stopEnvelope = managementEnvelope(stopRequest);
  const stopPending = authority.beginBaseStop(stopEnvelope);
  assert.equal(stopRequest.managementRequestId, 'm2:2');
  assert.equal(authority.readInstallableAgent().installableAgent.managementRequestSequenceHighWater, 2);
  const draining = authority.readInstallableAgent().installableAgent.current;
  assert.equal(draining.lifecycleDisposition, 'draining');
  assert.equal(draining.lifecycleCause, 'base_stop');
  assert.ok(stopPending.lifecycleGeneration > initialGeneration);
  expectCode(() => authority.completeBaseStop(stopEnvelope), 'stop_not_quiesced');
  evidence(authority, stopRequest.managementRequestId, 'positive_quiescence');
  evidence(authority, stopRequest.managementRequestId, 'service_stopped');
  const stopped = authority.completeBaseStop(stopEnvelope);
  assert.equal(authority.readInstallableAgent().installableAgent.managementRequestSequenceHighWater, 2);
  assert.equal(stopped.restartEligible, true);
  assert.equal(authority.completeBaseStop(stopEnvelope).classification, 'exact_replay');

  const uninstallRequest = managementRequest(authority, 'uninstall', 'uninstall-stopped', { cause: 'uninstall' });
  const uninstallEnvelope = managementEnvelope(uninstallRequest);
  const uninstallDrain = authority.beginInstallableAgentUninstall(uninstallEnvelope);
  assert.equal(uninstallRequest.managementRequestId, 'm2:3');
  assert.equal(authority.readInstallableAgent().installableAgent.managementRequestSequenceHighWater, 3);
  assert.ok(uninstallDrain.lifecycleGeneration > stopped.lifecycleGeneration);
  evidence(authority, uninstallRequest.managementRequestId, 'positive_quiescence');
  evidence(authority, uninstallRequest.managementRequestId, 'service_stopped');
  const revoked = authority.completeInstallableAgentUninstall(uninstallEnvelope);
  assert.equal(authority.readInstallableAgent().installableAgent.managementRequestSequenceHighWater, 3);
  assert.ok(revoked.lifecycleGeneration > uninstallDrain.lifecycleGeneration);
  const final = authority.readInstallableAgent().installableAgent.current;
  assert.equal(final.lifecycleDisposition, 'revoked');
  assert.equal(final.credentialDisposition, 'revoked');
  assert.equal(final.packageDisposition, 'revoked');
  assert.equal(revoked.deletionBarrier, 'authority_revoked_replay_fences_retained');
});

test('one stable m2 base-stop transaction survives authority restart between phases and exact replay stays bound to the same request', () => {
  const { authority, store, routeBinding } = createAuthority();
  registerAndActivate(authority, 'same-id-restart');
  const stopRequest = managementRequest(authority, 'stop', 'same-id-stop', { cause: 'base_stop' });
  const stopEnvelope = managementEnvelope(stopRequest);
  const draining = authority.beginBaseStop(stopEnvelope);
  assert.equal(stopRequest.managementRequestId, 'm2:2');
  assert.equal(draining.phase, 'draining');

  const restarted = new AgentDeliveryAuthority({
    store,
    routeBinding,
    verifyManagementProof: (proof) => proof === MGMT_PROOF,
    verifyInstallableAgentEvidence: (proof) => proof === EVIDENCE_PROOF,
  });
  const replayedDrain = restarted.beginBaseStop(stopEnvelope);
  assert.equal(replayedDrain.classification, 'exact_replay');
  assert.equal(restarted.readInstallableAgent().installableAgent.current.managementTransaction.managementRequestId, stopRequest.managementRequestId);
  evidence(restarted, stopRequest.managementRequestId, 'positive_quiescence', 'same-id-restart-quiescence');
  evidence(restarted, stopRequest.managementRequestId, 'service_stopped', 'same-id-restart-stopped');
  const stopped = restarted.completeBaseStop(stopEnvelope);
  assert.equal(stopped.phase, 'completed');
  assert.equal(restarted.readInstallableAgent().installableAgent.managementRequestSequenceHighWater, 2);

  const restartedAgain = new AgentDeliveryAuthority({
    store,
    routeBinding,
    verifyManagementProof: (proof) => proof === MGMT_PROOF,
    verifyInstallableAgentEvidence: (proof) => proof === EVIDENCE_PROOF,
  });
  const replayedCommit = restartedAgain.completeBaseStop(stopEnvelope);
  assert.equal(replayedCommit.classification, 'exact_replay');
  assert.equal(restartedAgain.readInstallableAgent().installableAgent.managementRequestSequenceHighWater, 2);
});

test('completed base_stop is the only restart predecessor and start elects a new active lifecycle generation', () => {
  const { authority } = createAuthority();
  registerAndActivate(authority, 'restart');
  const directStartContent = { cause: 'base_start', restartEligibleStopRequestId: null };
  const directStart = managementRequest(authority, 'start', 'direct-start', directStartContent);
  expectCode(() => authority.prepareBaseStart(managementEnvelope(directStart)), 'start_not_restart_eligible');

  const stopRequest = managementRequest(authority, 'stop', 'restart-stop', { cause: 'base_stop' });
  const stopEnvelope = managementEnvelope(stopRequest);
  authority.beginBaseStop(stopEnvelope);
  evidence(authority, stopRequest.managementRequestId, 'positive_quiescence');
  evidence(authority, stopRequest.managementRequestId, 'service_stopped');
  const stopped = authority.completeBaseStop(stopEnvelope);
  const startContent = { cause: 'base_start', restartEligibleStopRequestId: stopRequest.managementRequestId };
  const startRequest = managementRequest(authority, 'start', 'restart-start', startContent);
  const startEnvelope = managementEnvelope(startRequest);
  const prepared = authority.prepareBaseStart(startEnvelope);
  assert.ok(prepared.lifecycleGeneration > stopped.lifecycleGeneration);
  evidence(authority, startRequest.managementRequestId, 'local_service_ready');
  const started = authority.commitBaseStart(startEnvelope);
  assert.equal(started.phase, 'committed');
  assert.equal(authority.readInstallableAgent().installableAgent.current.lifecycleDisposition, 'active');
  assert.equal(authority.readInstallableAgent().installableAgent.current.restartEligible, false);
});

test('J3 fence-first prevents emission; admission-first is one-shot and remains replayable after a later fence', () => {
  const first = createAuthority().authority;
  registerAndActivate(first, 'j3-fence-first');
  connectCurrent(first, 'j3-fence-first');
  const old = makeDelivery(first, 'j3-fence-first');
  expectCode(() => first.claimFirstSend({
    deliveryId: old.delivery.deliveryId,
    authorizationId: old.authorization.authorizationId,
    dispatchOrdinal: 1,
    dispatchGrantId: old.authorization.dispatchGrantId,
  }), 'installable_agent_first_emission_required');
  const current = first.readInstallableAgent().installableAgent.current;
  const trustContent = {
    trustStateDigest: digest({ trust: 'fenced' }),
    trustSubjects: { [current.packageTrustSubjectDigest]: 'active' },
    trustContinuesCurrentPackage: false,
  };
  first.mutateInstallableAgentTrust(managementRequest(first, 'trust', 'j3-fence', trustContent));
  let firstSends = 0;
  expectCode(() => first.initiateFirstEmission({
    deliveryId: old.delivery.deliveryId,
    authorizationId: old.authorization.authorizationId,
    dispatchOrdinal: 1,
    dispatchGrantId: old.authorization.dispatchGrantId,
  }, () => { firstSends += 1; }), 'stale_installable_agent_fence');
  assert.equal(firstSends, 0);

  const second = createAuthority().authority;
  registerAndActivate(second, 'j3-admission-first');
  connectCurrent(second, 'j3-admission-first');
  const admitted = makeDelivery(second, 'j3-admission-first');
  let sends = 0;
  const admissionInput = {
    deliveryId: admitted.delivery.deliveryId,
    authorizationId: admitted.authorization.authorizationId,
    dispatchOrdinal: 1,
    dispatchGrantId: admitted.authorization.dispatchGrantId,
  };
  const sent = second.initiateFirstEmission(admissionInput, () => { sends += 1; });
  assert.equal(sent.classification, 'send_initiated');
  assert.equal(sends, 1);
  const secondCurrent = second.readInstallableAgent().installableAgent.current;
  second.mutateInstallableAgentTrust(managementRequest(second, 'trust', 'j3-after-admission', {
    trustStateDigest: digest({ trust: 'after-admission' }),
    trustSubjects: { [secondCurrent.packageTrustSubjectDigest]: 'active' },
    trustContinuesCurrentPackage: false,
  }));
  const replay = second.initiateFirstEmission(admissionInput, () => { sends += 1; });
  assert.equal(replay.classification, 'exact_replay');
  assert.equal(replay.possibleExecution, true);
  assert.equal(sends, 1);
});

test('J3 ambiguous first send never produces a second maySend and reconnect cannot revive predecessor authorization', () => {
  const { authority } = createAuthority();
  registerAndActivate(authority, 'j3-ambiguous');
  connectCurrent(authority, 'j3-ambiguous-1');
  const admitted = makeDelivery(authority, 'j3-ambiguous');
  const admissionInput = {
    deliveryId: admitted.delivery.deliveryId,
    authorizationId: admitted.authorization.authorizationId,
    dispatchOrdinal: 1,
    dispatchGrantId: admitted.authorization.dispatchGrantId,
  };
  let calls = 0;
  const unknown = authority.initiateFirstEmission(admissionInput, () => {
    calls += 1;
    throw Object.assign(new Error('ambiguous socket send'), { code: 'socket_send_ambiguous' });
  });
  assert.equal(unknown.classification, 'send_outcome_unknown');
  assert.equal(calls, 1);
  const replay = authority.initiateFirstEmission(admissionInput, () => { calls += 1; });
  assert.equal(replay.classification, 'exact_replay');
  assert.equal(calls, 1);

  authority.disconnect({
    agentId: authority.read().routeBinding.agentId,
    routeGeneration: authority.read().routeBinding.routeGeneration,
    connectionId: authority.read().connection.id,
    connectionEpoch: authority.read().connection.epoch,
    socketIncarnationId: authority.read().connection.socketIncarnationId,
    installableAgentTuple: authority.read().connection.installableAgentTuple,
  });
  connectCurrent(authority, 'j3-ambiguous-2');
  const afterReconnect = authority.initiateFirstEmission(admissionInput, () => { calls += 1; });
  assert.equal(afterReconnect.classification, 'exact_replay');
  assert.equal(calls, 1);
  expectCode(() => authority.grantCommand(admitted.delivery.deliveryId, 2), 'dispatch_replay_unsafe');
});

test('legacy D0020 held slot blocks initial activation until exact positive quiescence proof releases only that slot', () => {
  const { authority } = createAuthority();
  connectCurrent(authority, 'legacy-held');
  const legacy = makeDelivery(authority, 'legacy-held');
  assert.equal(authority.read().deliveries[legacy.delivery.deliveryId].slotHeld, true);

  migrate(authority);
  const content = registrationContent('legacy-successor');
  const request = managementRequest(authority, 'register', 'register-legacy-successor', content);
  const pending = authority.registerInstallableAgent(request);
  assert.equal(pending.predecessorQuiescenceRequired, true);
  assert.equal(authority.readInstallableAgent().installableAgent.pending.legacyPredecessors.length, 1);
  stageGenesis(authority, pending);
  const activateInput = {
    managementRequestId: request.managementRequestId,
    intentDigest: request.intentDigest,
    expectedPredecessorDigest: request.expectedPredecessorDigest,
    managementProof: request.managementProof,
    pendingDigest: pending.pendingDigest,
    genesisGeneration: pending.genesisGeneration,
  };
  expectCode(() => authority.initialActivateInstallableAgent(activateInput), 'predecessor_quiescence_required');

  const locator = authority.readInstallableAgent().installableAgent.pending.legacyPredecessors[0];
  const stale = {
    pendingDigest: pending.pendingDigest,
    genesisGeneration: pending.genesisGeneration,
    deliveryId: locator.deliveryId,
    executorId: locator.executorId,
    executorEpoch: locator.executorEpoch,
    evidenceRevision: locator.evidenceRevision + 1,
    evidenceDigest: locator.evidenceDigest,
    proofClass: 'original_live_owner',
    receiptDigest: digest({ stale: true }),
    proofEvidenceDigest: digest({ proof: 'stale' }),
    evidenceProof: EVIDENCE_PROOF,
  };
  expectCode(() => authority.acceptLegacyPredecessorQuiescence(stale), 'predecessor_quiescence_scope_mismatch');
  assert.equal(authority.read().deliveries[legacy.delivery.deliveryId].slotHeld, true);

  const receiptDigest = typedDigest('tdev.installable-agent-predecessor-quiescence.v1', {
    agentId: authority.read().routeBinding.agentId,
    routeGeneration: authority.read().routeBinding.routeGeneration,
    pendingDigest: pending.pendingDigest,
    deliveryId: locator.deliveryId,
    executorId: locator.executorId,
    executorEpoch: locator.executorEpoch,
    evidenceRevision: locator.evidenceRevision,
    evidenceDigest: locator.evidenceDigest,
    proofClass: 'original_live_owner',
  });
  const exact = {
    pendingDigest: pending.pendingDigest,
    genesisGeneration: pending.genesisGeneration,
    deliveryId: locator.deliveryId,
    executorId: locator.executorId,
    executorEpoch: locator.executorEpoch,
    evidenceRevision: locator.evidenceRevision,
    evidenceDigest: locator.evidenceDigest,
    proofClass: 'original_live_owner',
    receiptDigest,
    proofEvidenceDigest: digest({ proof: 'positive-quiescence', receiptDigest }),
    evidenceProof: EVIDENCE_PROOF,
  };
  const accepted = authority.acceptLegacyPredecessorQuiescence(exact);
  assert.equal(accepted.slotReleased, true);
  assert.equal(authority.read().deliveries[legacy.delivery.deliveryId].slotHeld, false);
  assert.equal(authority.acceptLegacyPredecessorQuiescence(exact).classification, 'exact_replay');
  assert.equal(authority.initialActivateInstallableAgent(activateInput).state, 'CURRENT');
});

test('replacement requires fresh clone-safe evidence and stale copied current tuple cannot self-elect after replacement', () => {
  const { authority } = createAuthority();
  registerAndActivate(authority, 'replace-source');
  connectCurrent(authority, 'replace-source');
  const oldTuple = authority.readInstallableAgent().currentTuple;
  const oldConnectionEpoch = authority.read().lastConnectionEpoch;
  const trustSubject = authority.readInstallableAgent().installableAgent.current.packageTrustSubjectDigest;
  const content = {
    credentialProvisioningId: 'credential-provisioning-replacement',
    packageManifestDigest: digest({ package: 'replacement' }),
    packageTrustSubjectDigest: trustSubject,
  };
  const request = managementRequest(authority, 'replace', 'replace-current-installation', content);
  authority.beginInstallableAgentReplacement(request);
  for (const type of ['package_verified', 'verifier_ready', 'local_ready', 'local_service_ready', 'positive_quiescence', 'clone_safe_activation']) {
    evidence(authority, request.managementRequestId, type);
  }
  const committed = authority.commitInstallableAgentReplacement(managementEnvelope(request));
  const newTuple = committed.currentTuple;
  assert.ok(newTuple.installationGeneration > oldTuple.installationGeneration);
  assert.ok(newTuple.credentialGeneration > oldTuple.credentialGeneration);
  assert.ok(newTuple.packageActivationGeneration > oldTuple.packageActivationGeneration);
  assert.ok(newTuple.lifecycleGeneration > oldTuple.lifecycleGeneration);

  const staleContent = {
    agentId: authority.read().routeBinding.agentId,
    routeGeneration: authority.read().routeBinding.routeGeneration,
    expectedConnectionEpoch: oldConnectionEpoch,
    connectRequestId: 'stale-clone-connect',
    connectionId: 'stale-clone-connection',
    executorId: 'executor-one',
    executorEpoch: 1,
    protocolMetadataDigest: digest({ protocol: 'stale-clone' }),
    installableAgentTuple: oldTuple,
  };
  expectCode(() => authority.connect({ ...staleContent, requestDigest: computeAgentConnectRequestDigest(staleContent) }), 'stale_installable_agent_fence');
  const connected = connectCurrent(authority, 'replacement-current');
  assert.equal(connected.classification, 'accepted');
});

test('secret/proof values never enter durable D0027 semantic state', () => {
  const { authority } = createAuthority();
  const { request } = registerAndActivate(authority, 'secret-exclusion');
  const snapshotText = JSON.stringify(authority.read());
  assert.equal(snapshotText.includes(MGMT_PROOF), false);
  assert.equal(snapshotText.includes(EVIDENCE_PROOF), false);
  assert.equal(snapshotText.includes(request.managementProof), false);
  assert.equal(snapshotText.includes('Bearer '), false);
  assert.equal(snapshotText.includes('privateKey'), false);
  assert.equal(snapshotText.includes('secretBytes'), false);
});
