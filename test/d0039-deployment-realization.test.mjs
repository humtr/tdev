import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';

import {
  AgentDeliveryAuthority,
  INSTALLABLE_AGENT_CONNECT_POSSESSION_ENVELOPE_PROFILE,
  INSTALLABLE_AGENT_CONNECT_POSSESSION_PROFILE,
  INSTALLABLE_AGENT_MANAGEMENT_ENVELOPE_PROFILE,
  INSTALLABLE_AGENT_ROUTE_SECURITY_PROFILE,
  MemoryAgentDeliveryStore,
  computeAgentConnectRequestDigest,
  computeInstallableAgentManagementIntentDigest,
  digest,
  encodeBase64Url,
  installableAgentCredentialKeyId,
  installableAgentManagementKeyId,
  managementProofContext,
  signedRecordBytes,
} from '../src/index.mjs';

const EVIDENCE_PROOF = 'd0039-evidence-proof';

function binding() {
  return {
    agentId: 'd0039-agent',
    routeGeneration: 7,
    deployment: 'qualification',
    environment: 'test',
    workerScript: 'tdev-d0039-test',
    className: 'AgentDeliveryRuntimeDO',
    namespace: 'd0039-test-namespace',
    jurisdiction: 'global',
    durableObjectId: 'd0039-test-do',
  };
}

function edPair() {
  const pair = generateKeyPairSync('ed25519');
  return { ...pair, publicJwk: pair.publicKey.export({ format: 'jwk' }) };
}

function rsaPair() {
  const pair = generateKeyPairSync('rsa', { modulusLength: 3072, publicExponent: 0x10001 });
  return { ...pair, publicJwk: pair.publicKey.export({ format: 'jwk' }) };
}

function signEd(privateKey, domain, record) {
  return encodeBase64Url(sign(null, signedRecordBytes(domain, record), privateKey));
}

function signRsa(privateKey, domain, record) {
  return encodeBase64Url(sign('sha256', signedRecordBytes(domain, record), privateKey));
}

function managementEnvelope(authority, operation, request, management) {
  const context = managementProofContext(operation, authority.read().routeBinding, request, request.expectedPredecessorDigest);
  return {
    profile: INSTALLABLE_AGENT_MANAGEMENT_ENVELOPE_PROFILE,
    keyId: installableAgentManagementKeyId(management.publicJwk),
    context,
    signature: signEd(management.privateKey, 'tdev.agent-management.v1', context),
  };
}

async function concreteRequest(authority, operation, request, management) {
  const envelope = managementEnvelope(authority, operation, request, management);
  const ticket = await authority.verifyInstallableAgentManagementRequest({
    operation,
    request: { ...request, managementProof: envelope },
  });
  return { ...request, managementProof: ticket };
}

function stageGenesis(authority, pending) {
  for (const type of ['bootstrap_trust', 'package_verified', 'verifier_ready', 'local_ready', 'local_service_ready']) {
    authority.recordInstallableAgentGenesisEvidence({
      pendingDigest: pending.pendingDigest,
      genesisGeneration: pending.genesisGeneration,
      type,
      evidenceDigest: digest({ type, pendingDigest: pending.pendingDigest }),
      evidenceProof: EVIDENCE_PROOF,
    });
  }
}

async function createConcreteCurrent() {
  const store = new MemoryAgentDeliveryStore();
  const routeBinding = binding();
  const authority = new AgentDeliveryAuthority({
    store,
    routeBinding,
    verifyInstallableAgentEvidence: (proof) => proof === EVIDENCE_PROOF,
  });
  authority.initialize();
  const management = edPair();
  const releaseRoot = edPair();
  const credential = rsaPair();
  authority.migrateInstallableAgentRoute({
    migrationProfile: 'tdev.d0020-only-to-d0027-unregistered.v1',
    routeSecurity: {
      profile: INSTALLABLE_AGENT_ROUTE_SECURITY_PROFILE,
      managementPublicKey: management.publicJwk,
      releaseRootPublicKey: releaseRoot.publicJwk,
    },
  });
  const packageTrustSubjectDigest = digest({ releaseKey: 'd0039-release' });
  const trustSubjects = { [packageTrustSubjectDigest]: 'active' };
  const content = {
    credentialProvisioningId: 'd0039-credential-provisioning-one',
    credentialPublicKey: credential.publicJwk,
    packageManifestDigest: digest({ package: 'd0039-one' }),
    packageTrustSubjectDigest,
    trustStateDigest: digest({ trustSubjects }),
    trustSubjects,
  };
  const register = {
    managementRequestId: 'm2:1',
    intentDigest: computeInstallableAgentManagementIntentDigest('register', routeBinding, content),
    expectedPredecessorDigest: authority.readInstallableAgent().predecessorDigest,
    ...content,
  };
  const registered = authority.registerInstallableAgent(await concreteRequest(authority, 'register', register, management));
  stageGenesis(authority, registered);
  authority.initialActivateInstallableAgent(await concreteRequest(authority, 'register', {
    managementRequestId: register.managementRequestId,
    intentDigest: register.intentDigest,
    expectedPredecessorDigest: register.expectedPredecessorDigest,
    pendingDigest: registered.pendingDigest,
    genesisGeneration: registered.genesisGeneration,
  }, management));
  return { authority, store, routeBinding, management, releaseRoot, credential };
}

function connectRequest(authority, id = 'c1:1') {
  const state = authority.read();
  const content = {
    agentId: state.routeBinding.agentId,
    routeGeneration: state.routeBinding.routeGeneration,
    expectedConnectionEpoch: state.lastConnectionEpoch,
    connectRequestId: id,
    connectionId: `connection-${id.replace(':', '-')}`,
    executorId: 'executor-d0039-one',
    executorEpoch: 1,
    protocolMetadataDigest: digest({ protocol: 'd0039-v1' }),
    installableAgentTuple: authority.readInstallableAgent().currentTuple,
  };
  return { ...content, requestDigest: computeAgentConnectRequestDigest(content) };
}

test('D0039 route pins Ed25519 management/release identities and requires one-use management tickets', async () => {
  const { authority, management } = await createConcreteCurrent();
  const installed = authority.readInstallableAgent().installableAgent;
  assert.equal(installed.managementKeyId, installableAgentManagementKeyId(management.publicJwk));
  assert.match(installed.releaseRootKeyId, /^sha256:[0-9a-f]{64}$/);
  assert.match(installed.currentCredentialKeyId, /^sha256:[0-9a-f]{64}$/);

  const content = { cause: 'base_stop' };
  const stop = {
    managementRequestId: 'm2:2',
    intentDigest: computeInstallableAgentManagementIntentDigest('stop', authority.read().routeBinding, content),
    expectedPredecessorDigest: authority.readInstallableAgent().predecessorDigest,
  };
  const rawEnvelope = managementEnvelope(authority, 'stop', stop, management);
  assert.throws(
    () => authority.beginBaseStop({ ...stop, managementProof: rawEnvelope }),
    (error) => error?.code === 'management_authentication_failed',
  );
  const accepted = authority.beginBaseStop(await concreteRequest(authority, 'stop', stop, management));
  assert.equal(accepted.phase, 'draining');
});

test('D0039 c1 challenge burns durable floor, survives restart, rejects invalid proof, and consumes valid RSA possession once', async () => {
  const { authority, store, routeBinding, credential } = await createConcreteCurrent();
  const request = connectRequest(authority, 'c1:1');
  const challenge = authority.issueInstallableAgentConnectChallenge(request, {
    nowMs: 1000,
    nonce: encodeBase64Url(Buffer.alloc(32, 5)),
  });
  assert.equal(challenge.classification, 'accepted');
  assert.equal(challenge.challenge.expiresAtMs, 121000);
  assert.equal(authority.readInstallableAgent().installableAgent.connectRequestSequenceHighWater, 1);
  const replay = authority.issueInstallableAgentConnectChallenge(request, {
    nowMs: 2000,
    nonce: encodeBase64Url(Buffer.alloc(32, 6)),
  });
  assert.equal(replay.classification, 'exact_replay');
  assert.deepEqual(replay.challenge, challenge.challenge);

  const badEnvelope = {
    profile: INSTALLABLE_AGENT_CONNECT_POSSESSION_ENVELOPE_PROFILE,
    keyId: installableAgentCredentialKeyId(credential.publicJwk),
    context: challenge.challenge,
    signature: encodeBase64Url(Buffer.alloc(384)),
  };
  await assert.rejects(
    authority.verifyInstallableAgentConnectPossession({ connectRequest: request, envelope: badEnvelope, nowMs: 2000 }),
    (error) => error?.code === 'signature_verification_failed',
  );
  assert.notEqual(authority.readInstallableAgent().installableAgent.possessionChallenge, null);

  const restarted = new AgentDeliveryAuthority({ store, routeBinding, verifyInstallableAgentEvidence: (proof) => proof === EVIDENCE_PROOF });
  const validEnvelope = {
    profile: INSTALLABLE_AGENT_CONNECT_POSSESSION_ENVELOPE_PROFILE,
    keyId: installableAgentCredentialKeyId(credential.publicJwk),
    context: challenge.challenge,
    signature: signRsa(credential.privateKey, INSTALLABLE_AGENT_CONNECT_POSSESSION_PROFILE, challenge.challenge),
  };
  const ticket = await restarted.verifyInstallableAgentConnectPossession({ connectRequest: request, envelope: validEnvelope, nowMs: 2000 });
  const connected = restarted.connect(request, { possessionTicket: ticket, nowMs: 2000 });
  assert.equal(connected.classification, 'accepted');
  assert.equal(restarted.readInstallableAgent().installableAgent.possessionChallenge, null);
  assert.equal(restarted.readInstallableAgent().installableAgent.connectRequestSequenceHighWater, 1);
  assert.throws(
    () => restarted.issueInstallableAgentConnectChallenge(connectRequest(restarted, 'c1:3'), { nowMs: 3000, nonce: encodeBase64Url(Buffer.alloc(32, 7)) }),
    (error) => error?.code === 'connect_request_sequence_gap',
  );
});

test('expired challenge never revives and its c1 sequence remains permanently retired', async () => {
  const { authority, credential } = await createConcreteCurrent();
  const first = connectRequest(authority, 'c1:1');
  const challenge = authority.issueInstallableAgentConnectChallenge(first, {
    nowMs: 10,
    nonce: encodeBase64Url(Buffer.alloc(32, 8)),
  }).challenge;
  const envelope = {
    profile: INSTALLABLE_AGENT_CONNECT_POSSESSION_ENVELOPE_PROFILE,
    keyId: installableAgentCredentialKeyId(credential.publicJwk),
    context: challenge,
    signature: signRsa(credential.privateKey, INSTALLABLE_AGENT_CONNECT_POSSESSION_PROFILE, challenge),
  };
  await assert.rejects(
    authority.verifyInstallableAgentConnectPossession({ connectRequest: first, envelope, nowMs: 120010 }),
    (error) => error?.code === 'agent_possession_challenge_expired',
  );
  assert.throws(
    () => authority.issueInstallableAgentConnectChallenge(first, { nowMs: 120011, nonce: encodeBase64Url(Buffer.alloc(32, 9)) }),
    (error) => error?.code === 'stale_connect_request',
  );
  const next = authority.issueInstallableAgentConnectChallenge(connectRequest(authority, 'c1:2'), {
    nowMs: 120011,
    nonce: encodeBase64Url(Buffer.alloc(32, 10)),
  });
  assert.equal(next.classification, 'accepted');
  assert.equal(next.challenge.challengeGeneration, 2);
});
