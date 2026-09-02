import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';

import {
  AGENT_ROUTE_CUTOVER_PROFILE,
  AGENT_ROUTE_ELECTION_ATTACHMENT_PROFILE,
  AGENT_ROUTE_ELECTION_GENESIS_PROFILE,
  AGENT_ROUTE_ELECTION_IMPORT_PROFILE,
  AGENT_ROUTE_GENERATION_HOST_PROFILE,
  AGENT_ROUTE_LEGACY_HOST_PROFILE,
  AGENT_ROUTE_PREDECESSOR_EXCLUSION_PROFILE,
  AgentRouteGenerationAuthority,
  AgentRouteElectionAuthority,
  DurableAgentRouteElectionAuthority,
  MemoryAgentRouteElectionStore,
  agentRouteElectionDigest,
  agentRouteHostKey,
  agentRouteRecoveryKeyId,
  canonicalJson,
  digest,
  encodeBase64Url,
  normalizeAgentRouteCutoverIntent,
  normalizeAgentRouteElectionAttachment,
  parseAgentRouteCutoverRequestId,
  signedRecordBytes,
  verifyAgentRouteElectionImportSignatures,
} from '../src/index.mjs';

function ed25519Pair() {
  const pair = generateKeyPairSync('ed25519');
  return { ...pair, publicJwk: pair.publicKey.export({ format: 'jwk' }) };
}

function signRecord(privateKey, record) {
  return encodeBase64Url(sign(null, signedRecordBytes(record.profile, record), privateKey));
}

function expectCode(code) {
  return (error) => error?.code === code;
}

function generationHost(agentId, routeGeneration) {
  return {
    routeHostProfile: AGENT_ROUTE_GENERATION_HOST_PROFILE,
    routeHostKey: agentRouteHostKey({ agentId, routeGeneration }),
  };
}

function genesisRecord({ recovery, agentId = 'agent-route-election-one', routeBindingDigest = digest({ route: 1 }) } = {}) {
  return {
    profile: AGENT_ROUTE_ELECTION_GENESIS_PROFILE,
    agentId,
    routeGeneration: 1,
    routeBindingDigest,
    ...generationHost(agentId, 1),
    electionAuthorityIdentity: digest({ electionAuthority: agentId }),
    recoveryKeyId: agentRouteRecoveryKeyId(recovery.publicJwk),
    recoveryPublicKey: recovery.publicJwk,
    standbyRouteDigest: digest({ standby: agentId, routeGeneration: 1 }),
    genesisNonce: digest({ nonce: agentId }),
  };
}

function legacyImportRecord({ recovery, agentId = 'agent-route-election-legacy' } = {}) {
  return {
    profile: AGENT_ROUTE_ELECTION_IMPORT_PROFILE,
    agentId,
    routeGeneration: 1,
    routeBindingDigest: digest({ legacyRoute: agentId }),
    routeHostProfile: AGENT_ROUTE_LEGACY_HOST_PROFILE,
    routeHostKey: agentId,
    currentRouteStateDigest: digest({ state: 'legacy-current', agentId }),
    electionAuthorityIdentity: digest({ electionAuthority: agentId }),
    recoveryKeyId: agentRouteRecoveryKeyId(recovery.publicJwk),
    recoveryPublicKey: recovery.publicJwk,
  };
}

function cutoverIntent(authority, { requestId = 'rc1:1', reason = 'management_key_compromise', bindingSeed = 'next' } = {}) {
  const state = authority.read();
  const agentId = state.agentId;
  const successorRouteGeneration = state.routeGenerationHighWater + 1;
  return {
    profile: AGENT_ROUTE_CUTOVER_PROFILE,
    agentId,
    cutoverRequestId: requestId,
    expectedElectionDigest: agentRouteElectionDigest(state),
    predecessorRouteGeneration: state.currentRoute.routeGeneration,
    predecessorRouteBindingDigest: state.currentRoute.routeBindingDigest,
    predecessorRouteHostProfile: state.currentRoute.routeHostProfile,
    predecessorRouteHostKey: state.currentRoute.routeHostKey,
    successorRouteGeneration,
    successorRouteBindingDigest: digest({ bindingSeed, successorRouteGeneration }),
    successorRouteHostProfile: AGENT_ROUTE_GENERATION_HOST_PROFILE,
    successorRouteHostKey: agentRouteHostKey({ agentId, routeGeneration: successorRouteGeneration }),
    reason,
    recoveryKeyId: state.recoveryKeyId,
  };
}

test('D0044 route host and recovery identities are deterministic, strict, and generation-bound', () => {
  const recovery = ed25519Pair();
  const agentId = 'agent-route-identity';
  const first = agentRouteHostKey({ agentId, routeGeneration: 1 });
  const second = agentRouteHostKey({ agentId, routeGeneration: 2 });
  assert.match(first, /^rh1\.[0-9a-f]{64}$/);
  assert.notEqual(first, second);
  assert.match(agentRouteRecoveryKeyId(recovery.publicJwk), /^sha256:[0-9a-f]{64}$/);

  const attachment = normalizeAgentRouteElectionAttachment({
    profile: AGENT_ROUTE_ELECTION_ATTACHMENT_PROFILE,
    agentId,
    routeGeneration: 2,
    routeBindingDigest: digest({ route: 2 }),
    routeHostProfile: AGENT_ROUTE_GENERATION_HOST_PROFILE,
    routeHostKey: second,
    electionAuthorityIdentity: digest({ election: agentId }),
    recoveryKeyId: agentRouteRecoveryKeyId(recovery.publicJwk),
    recoveryPublicKey: recovery.publicJwk,
  });
  assert.equal(attachment.routeHostKey, second);
  assert.throws(
    () => normalizeAgentRouteElectionAttachment({ ...attachment, routeHostKey: first }),
    expectCode('agent_route_generation_host_mismatch'),
  );
  assert.throws(
    () => normalizeAgentRouteElectionAttachment({ ...attachment, recoveryKeyId: digest({ wrong: true }) }),
    expectCode('agent_route_recovery_key_mismatch'),
  );
  assert.equal(parseAgentRouteCutoverRequestId('rc1:9'), 9);
  assert.throws(() => parseAgentRouteCutoverRequestId('rc1:09'), expectCode('invalid_agent_route_cutover_request_id'));
});

test('D0044 fresh elected genesis is create-once, recovery-signed, replay-safe, and reconstructable', async () => {
  const recovery = ed25519Pair();
  const authority = new AgentRouteElectionAuthority();
  const genesis = genesisRecord({ recovery });
  const signature = signRecord(recovery.privateKey, genesis);
  const applied = await authority.createGenesis({ genesis, signature });
  assert.equal(applied.classification, 'applied');
  assert.equal(applied.currentRoute.routeGeneration, 1);
  assert.equal(applied.currentRoute.routeHostKey, genesis.routeHostKey);
  assert.equal(authority.read().routeGenerationHighWater, 1);
  assert.equal(authority.read().cutoverRequestSequenceHighWater, 0);

  const replay = await authority.createGenesis({ genesis, signature });
  assert.equal(replay.classification, 'exact_replay');
  assert.deepEqual(replay.result, applied);

  const reconstructed = new AgentRouteElectionAuthority({ state: authority.read() });
  assert.equal(agentRouteElectionDigest(reconstructed.read()), agentRouteElectionDigest(authority.read()));

  const other = genesisRecord({ recovery, routeBindingDigest: digest({ route: 'other' }) });
  await assert.rejects(
    authority.createGenesis({ genesis: other, signature: signRecord(recovery.privateKey, other) }),
    expectCode('agent_route_election_already_exists'),
  );

  const wrong = ed25519Pair();
  const fresh = new AgentRouteElectionAuthority();
  await assert.rejects(
    fresh.createGenesis({ genesis, signature: signRecord(wrong.privateKey, genesis) }),
    expectCode('signature_verification_failed'),
  );
});

test('D0044 legacy import requires independent management and recovery signatures and cannot infer a route from absence', async () => {
  const recovery = ed25519Pair();
  const management = ed25519Pair();
  const record = legacyImportRecord({ recovery });
  const recoverySignature = signRecord(recovery.privateKey, record);
  const managementSignature = signRecord(management.privateKey, record);
  const normalized = await verifyAgentRouteElectionImportSignatures({
    record,
    recoverySignature,
    managementSignature,
    managementPublicJwk: management.publicJwk,
  });
  assert.equal(normalized.routeHostKey, record.agentId);

  const authority = new AgentRouteElectionAuthority();
  const applied = await authority.importLegacy({ record, recoverySignature, managementSignature, managementPublicJwk: management.publicJwk });
  assert.equal(applied.currentRoute.routeHostProfile, AGENT_ROUTE_LEGACY_HOST_PROFILE);
  assert.equal(applied.currentRoute.routeHostKey, record.agentId);
  const replay = await authority.importLegacy({ record, recoverySignature, managementSignature, managementPublicJwk: management.publicJwk });
  assert.equal(replay.classification, 'exact_replay');

  await assert.rejects(
    verifyAgentRouteElectionImportSignatures({
      record,
      recoverySignature,
      managementSignature: recoverySignature,
      managementPublicJwk: recovery.publicJwk,
    }),
    expectCode('agent_route_recovery_key_not_independent'),
  );
  const changed = { ...record, currentRouteStateDigest: digest({ changed: true }) };
  await assert.rejects(
    authority.importLegacy({
      record: changed,
      recoverySignature: signRecord(recovery.privateKey, changed),
      managementSignature: signRecord(management.privateKey, changed),
      managementPublicJwk: management.publicJwk,
    }),
    expectCode('agent_route_election_already_exists'),
  );
});

test('D0044 cutover burns exactly one next generation after both predecessor exclusion and successor standby evidence', async () => {
  const recovery = ed25519Pair();
  const authority = new AgentRouteElectionAuthority();
  const genesis = genesisRecord({ recovery, agentId: 'agent-route-cutover' });
  await authority.createGenesis({ genesis, signature: signRecord(recovery.privateKey, genesis) });

  const intent = cutoverIntent(authority);
  const normalized = normalizeAgentRouteCutoverIntent(intent);
  assert.equal(normalized.successorRouteGeneration, 2);
  const prepared = await authority.prepareCutover({ intent, signature: signRecord(recovery.privateKey, intent) });
  assert.equal(prepared.classification, 'prepared');
  assert.equal(prepared.activeCutover.phase, 'PREPARED');

  const replay = await authority.prepareCutover({ intent, signature: signRecord(recovery.privateKey, intent) });
  assert.equal(replay.classification, 'exact_replay');
  const altered = { ...intent, reason: 'management_key_loss' };
  await assert.rejects(
    authority.prepareCutover({ intent: altered, signature: signRecord(recovery.privateKey, altered) }),
    expectCode('agent_route_cutover_request_conflict'),
  );
  const other = { ...intent, cutoverRequestId: 'rc1:2' };
  await assert.rejects(
    authority.prepareCutover({ intent: other, signature: signRecord(recovery.privateKey, other) }),
    expectCode('agent_route_cutover_in_progress'),
  );
  assert.throws(() => authority.commitCutover({ cutoverRequestId: 'rc1:1' }), expectCode('agent_route_cutover_not_ready'));

  const predecessorExclusionDigest = digest({ quiescent: true, providerExcluded: true });
  const successorStandbyDigest = digest({ standby: true, routeGeneration: 2 });
  assert.equal(authority.recordSuccessorStandby({ cutoverRequestId: 'rc1:1', successorStandbyDigest }).activeCutover.phase, 'SUCCESSOR_STANDBY');
  assert.equal(authority.recordPredecessorExclusion({ cutoverRequestId: 'rc1:1', predecessorExclusionDigest }).activeCutover.phase, 'READY_TO_COMMIT');
  assert.equal(
    authority.recordPredecessorExclusion({ cutoverRequestId: 'rc1:1', predecessorExclusionDigest }).classification,
    'exact_replay',
  );
  assert.throws(
    () => authority.recordSuccessorStandby({ cutoverRequestId: 'rc1:1', successorStandbyDigest: digest({ changed: true }) }),
    expectCode('agent_route_cutover_evidence_conflict'),
  );

  const applied = authority.commitCutover({ cutoverRequestId: 'rc1:1' });
  assert.equal(applied.classification, 'applied');
  assert.equal(applied.currentRoute.routeGeneration, 2);
  assert.equal(authority.read().routeGenerationHighWater, 2);
  assert.equal(authority.read().cutoverRequestSequenceHighWater, 1);
  assert.equal(authority.read().activeCutover, null);
  assert.equal(authority.read().currentRoute.routeHostKey, intent.successorRouteHostKey);

  const committedReplay = authority.commitCutover({ cutoverRequestId: 'rc1:1' });
  assert.equal(committedReplay.classification, 'exact_replay');
  assert.deepEqual(committedReplay.result, applied);

  const wrongReplaySigner = ed25519Pair();
  await assert.rejects(
    authority.prepareCutover({ intent, signature: signRecord(wrongReplaySigner.privateKey, intent) }),
    expectCode('signature_verification_failed'),
  );
  const completedReplay = await authority.prepareCutover({ intent, signature: signRecord(recovery.privateKey, intent) });
  assert.equal(completedReplay.classification, 'exact_replay');
  assert.deepEqual(completedReplay.result, applied);
});

test('D0044 cutover rejects stale/gap/substituted election state and compacted requests remain non-creating', async () => {
  const recovery = ed25519Pair();
  const authority = new AgentRouteElectionAuthority({ maxRecentReceipts: 1 });
  const genesis = genesisRecord({ recovery, agentId: 'agent-route-fences' });
  await authority.createGenesis({ genesis, signature: signRecord(recovery.privateKey, genesis) });

  const first = cutoverIntent(authority, { requestId: 'rc1:1', bindingSeed: 'two' });
  await authority.prepareCutover({ intent: first, signature: signRecord(recovery.privateKey, first) });
  authority.recordPredecessorExclusion({ cutoverRequestId: 'rc1:1', predecessorExclusionDigest: digest({ predecessor: 1 }) });
  authority.recordSuccessorStandby({ cutoverRequestId: 'rc1:1', successorStandbyDigest: digest({ successor: 2 }) });
  authority.commitCutover({ cutoverRequestId: 'rc1:1' });

  const gap = cutoverIntent(authority, { requestId: 'rc1:3', bindingSeed: 'gap' });
  await assert.rejects(authority.prepareCutover({ intent: gap, signature: signRecord(recovery.privateKey, gap) }), expectCode('agent_route_cutover_request_gap'));

  const staleElection = cutoverIntent(authority, { requestId: 'rc1:2', bindingSeed: 'stale-election' });
  const staleDigest = { ...staleElection, expectedElectionDigest: digest({ stale: true }) };
  await assert.rejects(
    authority.prepareCutover({ intent: staleDigest, signature: signRecord(recovery.privateKey, staleDigest) }),
    expectCode('agent_route_cutover_election_mismatch'),
  );

  const wrongRecovery = ed25519Pair();
  const second = cutoverIntent(authority, { requestId: 'rc1:2', bindingSeed: 'three' });
  await assert.rejects(
    authority.prepareCutover({ intent: second, signature: signRecord(wrongRecovery.privateKey, second) }),
    expectCode('signature_verification_failed'),
  );
  await authority.prepareCutover({ intent: second, signature: signRecord(recovery.privateKey, second) });
  authority.recordPredecessorExclusion({ cutoverRequestId: 'rc1:2', predecessorExclusionDigest: digest({ predecessor: 2 }) });
  authority.recordSuccessorStandby({ cutoverRequestId: 'rc1:2', successorStandbyDigest: digest({ successor: 3 }) });
  authority.commitCutover({ cutoverRequestId: 'rc1:2' });
  assert.equal(authority.read().recentReceipts.length, 1);
  assert.equal(authority.read().recentReceipts[0].requestId, 'rc1:2');

  await assert.rejects(
    authority.prepareCutover({ intent: first, signature: signRecord(recovery.privateKey, first) }),
    expectCode('agent_route_cutover_request_stale'),
  );
  assert.equal(authority.read().routeGenerationHighWater, 3);
  assert.equal(authority.read().cutoverRequestSequenceHighWater, 2);
  assert.equal(canonicalJson(authority.read()), canonicalJson(new AgentRouteElectionAuthority({ state: authority.read(), maxRecentReceipts: 1 }).read()));

  const badFloor = structuredClone(authority.read());
  badFloor.cutoverRequestSequenceHighWater = 1;
  assert.throws(() => new AgentRouteElectionAuthority({ state: badFloor, maxRecentReceipts: 1 }), expectCode('invalid_agent_route_election_state'));

  const badEvidence = structuredClone(authority.read());
  badEvidence.recentReceipts[0].predecessorExclusionDigest = digest({ corrupted: true });
  assert.throws(() => new AgentRouteElectionAuthority({ state: badEvidence, maxRecentReceipts: 1 }), expectCode('invalid_agent_route_election_receipt'));

  const badHost = structuredClone(authority.read());
  badHost.recentReceipts[0].result.currentRoute.routeHostKey = agentRouteHostKey({ agentId: badHost.agentId, routeGeneration: 2 });
  assert.throws(() => new AgentRouteElectionAuthority({ state: badHost, maxRecentReceipts: 1 }), expectCode('agent_route_generation_host_mismatch'));
});

test('D0044 durable election owner survives reconstruction and CAS-conflicting writers fail closed', async () => {
  const recovery = ed25519Pair();
  const store = new MemoryAgentRouteElectionStore();
  const agentId = 'agent-route-durable';
  const genesis = genesisRecord({ recovery, agentId });
  const first = new DurableAgentRouteElectionAuthority({ agentId, store });
  await first.createGenesis({ genesis, signature: signRecord(recovery.privateKey, genesis) });
  const reconstructed = new DurableAgentRouteElectionAuthority({ agentId, store });
  assert.equal(agentRouteElectionDigest(reconstructed.read()), agentRouteElectionDigest(first.read()));

  const stale = store.load(agentId);
  const intent = cutoverIntent({ read: () => reconstructed.read() });
  await reconstructed.prepareCutover({ intent, signature: signRecord(recovery.privateKey, intent) });
  assert.throws(() => store.compareAndSwap(agentId, stale.revision, stale.state), expectCode('agent_route_election_revision_conflict'));
});

test('D0044 legacy import, draining, retirement, election and successor activation are one-way', async () => {
  const recovery = ed25519Pair();
  const management = ed25519Pair();
  const record = legacyImportRecord({ recovery, agentId: 'agent-route-generation-flow' });
  const predecessor = AgentRouteGenerationAuthority.legacy({
    routeBinding: { agentId: record.agentId, routeGeneration: 1 },
    routeBindingDigest: record.routeBindingDigest,
    routeStateDigest: record.currentRouteStateDigest,
  });
  await predecessor.prepareLegacyImport({
    record,
    recoverySignature: signRecord(recovery.privateKey, record),
    managementSignature: signRecord(management.privateKey, record),
    managementPublicJwk: management.publicJwk,
  });
  const election = new AgentRouteElectionAuthority();
  await election.importLegacy({
    record,
    recoverySignature: signRecord(recovery.privateKey, record),
    managementSignature: signRecord(management.privateKey, record),
    managementPublicJwk: management.publicJwk,
  });
  predecessor.sealLegacyImport({ electionState: election.read() });

  const intent = cutoverIntent(election);
  await election.prepareCutover({ intent, signature: signRecord(recovery.privateKey, intent) });
  await predecessor.beginDraining({ intent, signature: signRecord(recovery.privateKey, intent) });
  assert.throws(() => predecessor.assertExecutable(), expectCode('agent_route_not_active'));
  const exclusion = {
    profile: AGENT_ROUTE_PREDECESSOR_EXCLUSION_PROFILE,
    kind: 'retired_owner',
    agentId: record.agentId,
    routeGeneration: 1,
    routeBindingDigest: record.routeBindingDigest,
    routeHostProfile: record.routeHostProfile,
    routeHostKey: record.routeHostKey,
    cutoverRequestId: intent.cutoverRequestId,
    cutoverIntentDigest: digest(intent),
    positiveQuiescenceDigest: digest({ quiescent: true }),
    providerExclusionDigest: null,
    providerDeploymentEpochDigest: digest({ epoch: 1 }),
  };
  const retired = predecessor.retire({ exclusion });
  election.recordPredecessorExclusion({ cutoverRequestId: intent.cutoverRequestId, predecessorExclusionDigest: retired.predecessorExclusionDigest });

  const attachment = normalizeAgentRouteElectionAttachment({
    profile: AGENT_ROUTE_ELECTION_ATTACHMENT_PROFILE,
    agentId: record.agentId,
    routeGeneration: 2,
    routeBindingDigest: intent.successorRouteBindingDigest,
    routeHostProfile: intent.successorRouteHostProfile,
    routeHostKey: intent.successorRouteHostKey,
    electionAuthorityIdentity: record.electionAuthorityIdentity,
    recoveryKeyId: record.recoveryKeyId,
    recoveryPublicKey: record.recoveryPublicKey,
  });
  const successor = AgentRouteGenerationAuthority.electedStandby({
    routeBinding: { agentId: record.agentId, routeGeneration: 2 },
    routeBindingDigest: intent.successorRouteBindingDigest,
    routeStateDigest: digest({ fresh: true }),
    attachment,
  });
  assert.throws(() => successor.assertExecutable(), expectCode('agent_route_not_active'));
  const standbyDigest = digest(successor.read());
  election.recordSuccessorStandby({ cutoverRequestId: intent.cutoverRequestId, successorStandbyDigest: standbyDigest });
  election.commitCutover({ cutoverRequestId: intent.cutoverRequestId });
  successor.activate({ electionState: election.read() });
  successor.assertExecutable();
  assert.throws(() => predecessor.assertExecutable(), expectCode('agent_route_not_active'));
  await assert.rejects(predecessor.beginDraining({ intent, signature: signRecord(recovery.privateKey, intent) }), expectCode('agent_route_retired'));
});
