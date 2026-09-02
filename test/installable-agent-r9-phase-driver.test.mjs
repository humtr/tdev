import test from 'node:test';
import assert from 'node:assert/strict';

import {
  R9_QUALIFICATION_RPC_PATH,
  createR9QualificationRpc,
  createOpaqueEd25519Signer,
  runR9PhaseP,
  runR9PhaseU,
} from '../qualification/installable-agent-r9-phase-driver.mjs';
import { qualificationRouteBootstrapV2RequestDigest } from '../qualification/installable-agent-qualification-r9-target.mjs';
import { QUALIFICATION_RPC_PROFILE } from '../qualification/installable-agent-qualification-r4.mjs';

const digest = (hex) => `sha256:${hex.repeat(64)}`;
const MANAGEMENT_KEY_ID = digest('a');
const RELEASE_ROOT_KEY_ID = digest('b');
const EVIDENCE_PROOF = Object.freeze({ profile: 'fixture.external-evidence.v1', proofDigest: digest('b') });
const PREDECESSOR = digest('c');
const PENDING = digest('d');
const INTENT = digest('e');
const ROUTE_PREDECESSOR = digest('f');
const SIGNATURE = Buffer.alloc(64).toString('base64url');
const RELEASE_PUBLIC_JWK = { crv: 'Ed25519', kty: 'OKP', x: 'A'.repeat(43) };

function routeBinding() {
  return { agentId: 'd0039-q6-bounded-final-20260824', routeGeneration: 1 };
}

function runtimeBinding() {
  return {
    sourceSha: '0123456789abcdef0123456789abcdef01234567',
    artifactDigest: digest('1'),
    artifactManifestDigest: digest('2'),
    workerVersionId: 'version-one',
    accountId: 'account-one',
    serviceName: 'tdev-d0020-qualification',
    deploymentEpoch: 'epoch-one',
    qualificationEndpointOrigin: 'https://tdev-d0020-qualification.humtr.workers.dev',
    workersDevAccountSubdomain: 'humtr',
    workersDevHostname: 'tdev-d0020-qualification.humtr.workers.dev',
    workerScript: 'tdev-d0020-qualification',
    namespaceId: 'namespace-one',
    namespace: 'tdev-d0020-qualification_AgentDeliveryRuntimeDO',
    className: 'AgentDeliveryRuntimeDO',
    jurisdiction: 'global',
  };
}

function providerBinding() {
  return {
    activeDeploymentId: 'deployment-one',
    activeTrafficPercentage: 100,
    providerConfigurationDigest: digest('3'),
    providerWriterObservationDigest: digest('4'),
    providerAuthoritativeRereadDigest: digest('5'),
  };
}

function unregisteredRead() {
  return {
    installableAgent: {
      state: 'UNREGISTERED',
      managementKeyId: MANAGEMENT_KEY_ID,
      releaseRootKeyId: RELEASE_ROOT_KEY_ID,
      currentCredentialKeyId: null,
      managementRequestSequenceHighWater: 0,
    },
    predecessorDigest: PREDECESSOR,
    currentTuple: null,
    currentTupleDigest: null,
  };
}

function pendingRead() {
  return {
    installableAgent: {
      state: 'GENESIS_PENDING',
      managementKeyId: MANAGEMENT_KEY_ID,
      managementPublicKey: RELEASE_PUBLIC_JWK,
      releaseRootKeyId: RELEASE_ROOT_KEY_ID,
      releaseRootPublicKey: RELEASE_PUBLIC_JWK,
      currentCredentialKeyId: null,
      managementRequestSequenceHighWater: 1,
      pending: {
        genesisGeneration: 1,
        managementRequestId: 'm2:1',
        intentDigest: INTENT,
        unregisteredPredecessorDigest: PREDECESSOR,
        pendingDigest: PENDING,
        candidate: { packageManifestDigest: digest('6') },
      },
    },
    predecessorDigest: ROUTE_PREDECESSOR,
    currentTuple: null,
    currentTupleDigest: null,
  };
}

function currentRead() {
  return {
    installableAgent: { state: 'CURRENT' },
    predecessorDigest: digest('7'),
    currentTuple: { installationGeneration: 1 },
    currentTupleDigest: digest('8'),
  };
}

function registerContent() {
  return {
    credentialProvisioningId: 'credential-one',
    packageManifestDigest: digest('9'),
    packageTrustSubjectDigest: digest('1'),
    trustStateDigest: digest('2'),
    trustSubjects: { [digest('1')]: 'active' },
  };
}

function originalRegisterRequest() {
  const binding = routeBinding();
  const request = {
    managementRequestId: 'm2:1',
    intentDigest: INTENT,
    expectedPredecessorDigest: PREDECESSOR,
    ...registerContent(),
  };
  request.managementProof = {
    profile: 'tdev.agent-management-envelope.v1',
    keyId: MANAGEMENT_KEY_ID,
    context: {
      domain: 'tdev.agent-management.v1',
      operation: 'register',
      agentId: binding.agentId,
      routeGeneration: binding.routeGeneration,
      managementRequestId: request.managementRequestId,
      intentDigest: request.intentDigest,
      expectedPredecessorDigest: request.expectedPredecessorDigest,
    },
    signature: SIGNATURE,
  };
  return request;
}

function signer(keyId, calls) {
  return createOpaqueEd25519Signer({
    keyId,
    sign(request) {
      calls.push(request);
      return SIGNATURE;
    },
  });
}

test('R9 phase-U builds an exact management envelope after stable UNREGISTERED reads', async () => {
  const calls = [];
  let registered = false;
  const rpcCalls = [];
  const rpc = async (input) => {
    rpcCalls.push(input);
    if (input.operation === 'read_installable_agent') return registered ? pendingRead() : unregisteredRead();
    if (input.operation === 'register_installable_agent') {
      registered = true;
      return { classification: 'accepted', state: 'GENESIS_PENDING', pendingDigest: PENDING, genesisGeneration: 1 };
    }
    throw new Error(`unexpected operation ${input.operation}`);
  };

  const result = await runR9PhaseU({
    rpc,
    routeBinding: routeBinding(),
    runtimeBinding: runtimeBinding(),
    providerBinding: providerBinding(),
    transactionId: 'r9-driver-one',
    register: registerContent(),
    managementSigner: signer(MANAGEMENT_KEY_ID, calls),
  });

  assert.equal(result.phase, 'U');
  assert.equal(rpcCalls.length, 3);
  assert.equal(rpcCalls[2].operation, 'register_installable_agent');
  assert.equal(rpcCalls[2].routeBootstrapTarget.profile, 'tdev.installable-agent-qualification-route-bootstrap.v1');
  assert.equal(rpcCalls[2].request.managementRequestId, 'm2:1');
  assert.equal(rpcCalls[2].request.managementProof.keyId, MANAGEMENT_KEY_ID);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].domain, 'tdev.agent-management.v1');
  assert.equal(Object.hasOwn(calls[0], 'privateKey'), false);
});

test('R9 phase-P forwards externally supplied evidence proof only after fresh pending reads and reaches stable CURRENT', async () => {
  const managementCalls = [];
  let state = 'pending';
  const rpcCalls = [];
  const rpc = async (input) => {
    rpcCalls.push(input);
    if (input.operation === 'read_installable_agent') return state === 'pending' ? pendingRead() : currentRead();
    if (input.operation === 'record_installable_agent_genesis_evidence') return { classification: 'accepted', type: input.request.type };
    if (input.operation === 'initial_activate_installable_agent') {
      state = 'current';
      return { classification: 'accepted', state: 'CURRENT' };
    }
    throw new Error(`unexpected operation ${input.operation}`);
  };

  const result = await runR9PhaseP({
    rpc,
    routeBinding: routeBinding(),
    runtimeBinding: runtimeBinding(),
    providerBinding: providerBinding(),
    transactionId: 'r9-driver-one',
    registerRequest: originalRegisterRequest(),
    managementSigner: signer(MANAGEMENT_KEY_ID, managementCalls),
    evidence: [{ type: 'bootstrap_trust', evidenceDigest: digest('a'), evidenceProof: EVIDENCE_PROOF }],
  });

  assert.equal(result.phase, 'P');
  assert.equal(result.finalState, 'CURRENT');
  assert.equal(rpcCalls.filter((input) => input.operation === 'record_installable_agent_genesis_evidence').length, 1);
  assert.equal(rpcCalls.filter((input) => input.operation === 'initial_activate_installable_agent').length, 1);
  const evidenceCall = rpcCalls.find((input) => input.operation === 'record_installable_agent_genesis_evidence');
  assert.equal(evidenceCall.routeBootstrapTarget.profile, 'tdev.installable-agent-qualification-route-bootstrap.v2');
  assert.deepEqual(evidenceCall.request.evidenceProof, EVIDENCE_PROOF);
  assert.equal(result.events.find((event) => event.operation === 'record_installable_agent_genesis_evidence').proofKind, 'external-evidence');
  assert.equal(managementCalls.length, 1);
  assert.equal(managementCalls[0].domain, 'tdev.agent-management.v1');
});

test('R9 phase-P performs only an exact original register replay when explicitly requested', async () => {
  const request = originalRegisterRequest();
  const calls = [];
  const rpc = async (input) => {
    calls.push(input);
    if (input.operation === 'read_installable_agent') return pendingRead();
    if (input.operation === 'register_installable_agent') return { classification: 'exact_replay', state: 'GENESIS_PENDING' };
    throw new Error(`unexpected operation ${input.operation}`);
  };
  const result = await runR9PhaseP({
    rpc,
    routeBinding: routeBinding(),
    runtimeBinding: runtimeBinding(),
    providerBinding: providerBinding(),
    transactionId: 'r9-driver-replay',
    registerRequest: request,
    registerRequestDigest: qualificationRouteBootstrapV2RequestDigest({
      operation: 'register_installable_agent',
      transactionId: 'r9-driver-replay',
      routeBinding: routeBinding(),
      request,
    }),
    managementSigner: signer(MANAGEMENT_KEY_ID, []),
    replayRegister: true,
    activate: false,
  });
  assert.equal(result.finalState, 'GENESIS_PENDING');
  assert.equal(calls.filter((input) => input.operation === 'register_installable_agent').length, 1);
  assert.equal(result.events[0].proofKind, 'management-replay');
});

test('R9 phase-P rejects a changed replay digest or secret-bearing envelope before RPC', async () => {
  const request = originalRegisterRequest();
  const rpcCalls = [];
  const rpc = async (input) => {
    rpcCalls.push(input);
    return pendingRead();
  };
  await assert.rejects(
    runR9PhaseP({
      rpc,
      routeBinding: routeBinding(),
      runtimeBinding: runtimeBinding(),
      providerBinding: providerBinding(),
      transactionId: 'r9-driver-replay-reject',
      registerRequest: { ...request, managementProof: { ...request.managementProof, privateKey: 'fixture-redacted' } },
      registerRequestDigest: qualificationRouteBootstrapV2RequestDigest({
        operation: 'register_installable_agent',
        transactionId: 'r9-driver-replay-reject',
        routeBinding: routeBinding(),
        request,
      }),
      managementSigner: signer(MANAGEMENT_KEY_ID, []),
      replayRegister: true,
      activate: false,
    }),
    (error) => error?.code === 'unexpected_keys',
  );
  assert.equal(rpcCalls.length, 0);
});

test('R9 phase-P rejects evidence descriptors without an externally produced proof before RPC', async () => {
  const rpcCalls = [];
  await assert.rejects(
    runR9PhaseP({
      rpc: async (input) => {
        rpcCalls.push(input);
        return pendingRead();
      },
      routeBinding: routeBinding(),
      runtimeBinding: runtimeBinding(),
      providerBinding: providerBinding(),
      transactionId: 'r9-driver-missing-proof',
      registerRequest: originalRegisterRequest(),
      managementSigner: signer(MANAGEMENT_KEY_ID, []),
      evidence: [{ type: 'bootstrap_trust', evidenceDigest: digest('a') }],
      activate: false,
    }),
    (error) => error?.code === 'unexpected_keys' || error?.code === 'r9_phase_driver_evidence_proof_invalid',
  );
  assert.equal(rpcCalls.length, 0);
});

test('R9 qualification RPC binds the exact workers.dev endpoint and keeps the token inside the request closure', async () => {
  const token = 't'.repeat(32);
  let tokenCalls = 0;
  let fetchCalls = 0;
  const rpc = createR9QualificationRpc({
    qualificationEndpointOrigin: 'https://tdev-d0020-qualification.humtr.workers.dev',
    workersDevHostname: 'tdev-d0020-qualification.humtr.workers.dev',
    tokenProvider: () => {
      tokenCalls += 1;
      return token;
    },
    fetchImpl: async (url, options) => {
      fetchCalls += 1;
      assert.equal(url.pathname, R9_QUALIFICATION_RPC_PATH);
      assert.equal(options.headers.authorization, `Bearer ${token}`);
      assert.equal(options.headers['content-type'], 'application/json');
      return new Response(JSON.stringify({
        ok: true,
        result: unregisteredRead(),
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const result = await rpc({
    profile: QUALIFICATION_RPC_PROFILE,
    operation: 'read_installable_agent',
    agentId: routeBinding().agentId,
    routeGeneration: routeBinding().routeGeneration,
  });
  assert.equal(result.installableAgent.state, 'UNREGISTERED');
  assert.equal(tokenCalls, 1);
  assert.equal(fetchCalls, 1);
});

test('R9 qualification RPC rejects the internal Durable Object envelope at the public HTTP boundary', async () => {
  const rpc = createR9QualificationRpc({
    qualificationEndpointOrigin: 'https://tdev-d0020-qualification.humtr.workers.dev',
    workersDevHostname: 'tdev-d0020-qualification.humtr.workers.dev',
    tokenProvider: () => 't'.repeat(32),
    fetchImpl: async () => new Response(JSON.stringify({
      profile: QUALIFICATION_RPC_PROFILE,
      schemaVersion: 2,
      ok: true,
      result: unregisteredRead(),
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
  });
  await assert.rejects(
    rpc({
      profile: QUALIFICATION_RPC_PROFILE,
      operation: 'read_installable_agent',
      agentId: routeBinding().agentId,
      routeGeneration: routeBinding().routeGeneration,
    }),
    (error) => error?.code === 'r9_phase_driver_rpc_failed',
  );
});

test('R9 qualification RPC rejects non-phase operations and non-exact origins before network use', async () => {
  let fetchCalls = 0;
  const rpc = createR9QualificationRpc({
    qualificationEndpointOrigin: 'https://tdev-d0020-qualification.humtr.workers.dev',
    workersDevHostname: 'tdev-d0020-qualification.humtr.workers.dev',
    tokenProvider: () => 't'.repeat(32),
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error('must not fetch');
    },
  });
  await assert.rejects(
    rpc({ profile: QUALIFICATION_RPC_PROFILE, operation: 'runtime_probe', agentId: 'agent-one', routeGeneration: 1 }),
    (error) => error?.code === 'r9_phase_driver_operation_forbidden',
  );
  assert.equal(fetchCalls, 0);
  assert.throws(
    () => createR9QualificationRpc({
      qualificationEndpointOrigin: 'https://evil.example',
      workersDevHostname: 'tdev-d0020-qualification.humtr.workers.dev',
      tokenProvider: () => 't'.repeat(32),
      fetchImpl: async () => new Response(),
    }),
    (error) => error?.code === 'r9_phase_driver_endpoint_invalid',
  );
});

test('R9 phase-U never retries a state-changing call after transport failure', async () => {
  const rpcCalls = [];
  const rpc = async (input) => {
    rpcCalls.push(input);
    if (input.operation === 'read_installable_agent') return unregisteredRead();
    throw new Error('transport unavailable');
  };
  await assert.rejects(
    runR9PhaseU({
      rpc,
      routeBinding: routeBinding(),
      runtimeBinding: runtimeBinding(),
      providerBinding: providerBinding(),
      transactionId: 'r9-driver-ambiguous',
      register: registerContent(),
      managementSigner: signer(MANAGEMENT_KEY_ID, []),
    }),
    /transport unavailable/,
  );
  assert.equal(rpcCalls.filter((input) => input.operation === 'register_installable_agent').length, 1);
});
