import test from 'node:test';
import assert from 'node:assert/strict';
import { digest } from '../src/canonical.mjs';

import {
  D0020QualificationAgentDeliveryDOHost,
  D0020QualificationService,
  D0020_QUALIFICATION_PATH,
} from '../qualification/cloudflare-agent-delivery-runtime.mjs';
import {
  QUALIFICATION_DEPLOYMENT_PROFILE,
  QUALIFICATION_RPC_PROFILE,
  qualificationDeploymentIdentityDigest,
  qualificationRouteVerifierDigest,
} from '../qualification/installable-agent-qualification-r4.mjs';
import {
  QUALIFICATION_ROUTE_BOOTSTRAP_PROFILE,
} from '../qualification/installable-agent-qualification-r6.mjs';
import {
  qualificationRouteAuthoritativeReadbackDigest,
  qualificationRouteBootstrapDigest,
  qualificationRouteBootstrapRequestDigest,
} from '../qualification/installable-agent-qualification-r8.mjs';
import {
  QUALIFICATION_ROUTE_PROVISIONING_PROFILE,
  qualificationLegacyRouteAuthoritativeReadbackDigest,
  qualificationRouteProvisioningRequestDigest,
  qualificationRouteProvisioningTargetDigest,
} from '../qualification/installable-agent-r12-route-provisioning.mjs';
import {
  AGENT_DELIVERY_WEBSOCKET_PATH,
  AGENT_DELIVERY_WEBSOCKET_PROTOCOL,
} from '../src/cloudflare-agent-delivery-runtime.mjs';

const QUALIFICATION_TOKEN = 'qualification-token-0123456789abcdef0123456789abcdef';
const ARTIFACT_DIGEST = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ARTIFACT_MANIFEST_DIGEST = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const CURRENT_TUPLE_DIGEST = 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

function baseEnv(overrides = {}) {
  return {
    TDEV_AGENT_DELIVERY_MAX_SNAPSHOT_BYTES: String(1024 * 1024),
    TDEV_AGENT_DELIVERY_MAX_FRAME_BYTES: String(8 * 1024),
    TDEV_DEPLOYMENT: 'qualification',
    TDEV_ENVIRONMENT: 'nonproduction',
    TDEV_WORKER_SCRIPT: 'tdev-d0020-qualification',
    TDEV_AGENT_DELIVERY_NAMESPACE: 'tdev-d0020-qualification_AgentDeliveryRuntimeDO',
    TDEV_AGENT_DELIVERY_JURISDICTION: 'global',
    TDEV_AGENT_ROUTE_MODE: 'legacy_v1',
    TDEV_AGENT_DELIVERY_AUTH_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef',
    TDEV_D0020_QUALIFICATION_MODE: 'enabled',
    TDEV_D0020_QUALIFICATION_TOKEN: QUALIFICATION_TOKEN,
    TDEV_SOURCE_SHA: '1234567890abcdef1234567890abcdef12345678',
    TDEV_WORKER_VERSION: { id: 'worker-version-one' },
    TDEV_D0039_ARTIFACT_DIGEST: ARTIFACT_DIGEST,
    TDEV_D0039_ARTIFACT_MANIFEST_DIGEST: ARTIFACT_MANIFEST_DIGEST,
    TDEV_D0039_ACCOUNT_ID: 'account-one',
    TDEV_D0039_SERVICE_NAME: 'tdev-d0020-qualification',
    TDEV_D0039_DEPLOYMENT_EPOCH: 'epoch-one',
    TDEV_D0039_STATE_CHANGING_TRAFFIC_PERCENTAGE: '100',
    TDEV_D0039_QUALIFICATION_ENDPOINT_ORIGIN: 'https://tdev-d0020-qualification.humtr.workers.dev',
    TDEV_D0039_INGRESS_KIND: 'workers_dev',
    TDEV_D0039_WORKERS_DEV_ACCOUNT_SUBDOMAIN: 'humtr',
    TDEV_D0039_WORKERS_DEV_HOSTNAME: 'tdev-d0020-qualification.humtr.workers.dev',
    TDEV_D0039_WORKERS_DEV_ENABLED: 'true',
    TDEV_D0039_WORKERS_DEV_PREVIEWS_ENABLED: 'false',
    TDEV_D0039_NAMESPACE_ID: 'namespace-one',
    ...overrides,
  };
}

function routeRead({
  currentTupleDigest = CURRENT_TUPLE_DIGEST,
  state = 'UNREGISTERED',
  managementKeyId = null,
  releaseRootKeyId = null,
  currentCredentialKeyId = null,
  managementRequestSequenceHighWater = 0,
} = {}) {
  return {
    installableAgent: { state, managementKeyId, releaseRootKeyId, currentCredentialKeyId, managementRequestSequenceHighWater },
    predecessorDigest: 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    currentTuple: null,
    currentTupleDigest,
  };
}

function expectedDeploymentDigest({
  agentId = 'agent-one',
  routeGeneration = 1,
  durableObjectId = 'do-agent-one',
  currentTupleDigest = CURRENT_TUPLE_DIGEST,
  managementKeyId = null,
  releaseRootKeyId = null,
  currentCredentialKeyId = null,
} = {}) {
  const env = baseEnv();
  return qualificationDeploymentIdentityDigest({
    profile: QUALIFICATION_DEPLOYMENT_PROFILE,
    sourceSha: env.TDEV_SOURCE_SHA,
    artifactDigest: env.TDEV_D0039_ARTIFACT_DIGEST,
    artifactManifestDigest: env.TDEV_D0039_ARTIFACT_MANIFEST_DIGEST,
    workerVersionId: env.TDEV_WORKER_VERSION.id,
    accountId: env.TDEV_D0039_ACCOUNT_ID,
    serviceName: env.TDEV_D0039_SERVICE_NAME,
    deployment: env.TDEV_DEPLOYMENT,
    environment: env.TDEV_ENVIRONMENT,
    deploymentEpoch: env.TDEV_D0039_DEPLOYMENT_EPOCH,
    stateChangingTrafficPercentage: 100,
    qualificationEndpointOrigin: env.TDEV_D0039_QUALIFICATION_ENDPOINT_ORIGIN,
    ingressKind: env.TDEV_D0039_INGRESS_KIND,
    workersDevAccountSubdomain: env.TDEV_D0039_WORKERS_DEV_ACCOUNT_SUBDOMAIN,
    workersDevHostname: env.TDEV_D0039_WORKERS_DEV_HOSTNAME,
    workersDevEnabled: true,
    workersDevPreviewsEnabled: false,
    workerScript: env.TDEV_WORKER_SCRIPT,
    namespaceId: env.TDEV_D0039_NAMESPACE_ID,
    namespace: env.TDEV_AGENT_DELIVERY_NAMESPACE,
    className: 'AgentDeliveryRuntimeDO',
    jurisdiction: env.TDEV_AGENT_DELIVERY_JURISDICTION,
    agentId,
    routeGeneration,
    durableObjectId,
    routeCurrentTupleDigest: currentTupleDigest,
    routeVerifierDigest: qualificationRouteVerifierDigest({
      currentTupleDigest,
      managementKeyId,
      releaseRootKeyId,
      currentCredentialKeyId,
    }),
  });
}

function namespaceFor(stub, routedAgents = []) {
  return {
    idFromName(agentId) {
      routedAgents.push(agentId);
      return {
        jurisdiction: 'global',
        toString() { return `do-${agentId}`; },
      };
    },
    get() { return stub; },
  };
}

function adminRequest(body, { token = QUALIFICATION_TOKEN } = {}) {
  return new Request(`https://qualification.example${D0020_QUALIFICATION_PATH}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ profile: QUALIFICATION_RPC_PROFILE, ...body }),
  });
}

test('qualification admin ingress authenticates before routing and maps one Agent to one named object', async () => {
  const invocations = [];
  const routedAgents = [];
  const stub = {
    async fetch() { throw new Error('unexpected websocket fetch'); },
    async qualificationInvoke(input) {
      invocations.push(structuredClone(input));
      return { profile: QUALIFICATION_RPC_PROFILE, schemaVersion: 2, ok: true, result: { observed: input.operation, agentId: input.agentId } };
    },
  };
  const env = baseEnv({ TDEV_AGENT_DELIVERY: namespaceFor(stub, routedAgents) });
  const service = new D0020QualificationService(env);

  const denied = await service.fetch(adminRequest({ operation: 'read', agentId: 'agent-one', routeGeneration: 1 }, { token: 'wrong-token-0123456789abcdef0123456789abcdef' }));
  assert.equal(denied.status, 401);
  assert.equal(invocations.length, 0);
  assert.deepEqual(routedAgents, []);

  const accepted = await service.fetch(adminRequest({ operation: 'read', agentId: 'agent-one', routeGeneration: 1 }));
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { ok: true, result: { observed: 'read', agentId: 'agent-one' } });
  assert.deepEqual(routedAgents, ['agent-one']);
  assert.deepEqual(invocations, [{ profile: QUALIFICATION_RPC_PROFILE, operation: 'read', agentId: 'agent-one', routeGeneration: 1 }]);
});

test('WebSocket ingress requires the application protocol and routes by Agent identity without qualification bearer auth', async () => {
  const routedAgents = [];
  const fetched = [];
  const stub = {
    async fetch(request) {
      fetched.push(request.url);
      return new Response('routed', { status: 200 });
    },
    async qualificationInvoke() { throw new Error('unexpected admin RPC'); },
  };
  const service = new D0020QualificationService(baseEnv({ TDEV_AGENT_DELIVERY: namespaceFor(stub, routedAgents) }));
  const url = new URL(`https://qualification.example${AGENT_DELIVERY_WEBSOCKET_PATH}`);
  url.searchParams.set('agentId', 'agent-one');
  url.searchParams.set('routeGeneration', '1');

  const missingProtocol = await service.fetch(new Request(url, {
    method: 'GET',
    headers: { upgrade: 'websocket' },
  }));
  assert.equal(missingProtocol.status, 400);
  assert.deepEqual(routedAgents, []);

  const routed = await service.fetch(new Request(url, {
    method: 'GET',
    headers: {
      upgrade: 'websocket',
      'sec-websocket-protocol': `${AGENT_DELIVERY_WEBSOCKET_PROTOCOL}, tdev-auth.route-token`,
    },
  }));
  assert.equal(routed.status, 200);
  assert.equal(await routed.text(), 'routed');
  assert.deepEqual(routedAgents, ['agent-one']);
  assert.equal(fetched.length, 1);
});

test('qualification DO host derives route binding from the actual Durable Object identity, not caller input', async () => {
  const reads = [];
  const host = {
    durableObjectId: 'do-agent-one',
    config: {
      placement: {
        deployment: 'qualification',
        environment: 'nonproduction',
        workerScript: 'tdev-d0020-qualification',
        className: 'AgentDeliveryRuntimeDO',
        namespace: 'tdev-d0020-qualification_AgentDeliveryRuntimeDO',
        jurisdiction: 'global',
      },
    },
    readRoute(input) {
      reads.push(structuredClone(input));
      return { revision: 1 };
    },
    readInstallableAgent() { return routeRead(); },
  };
  const ctx = { abort() { throw new Error('unexpected abort'); } };
  const qualification = new D0020QualificationAgentDeliveryDOHost(ctx, baseEnv(), { host });
  const response = await qualification.qualificationInvoke({ profile: QUALIFICATION_RPC_PROFILE, operation: 'runtime_probe', agentId: 'agent-one', routeGeneration: 1 });
  assert.equal(response.ok, true);
  assert.equal(response.result.durableObjectId, 'do-agent-one');
  assert.equal(response.result.routeBinding.durableObjectId, 'do-agent-one');
  assert.equal(response.result.routeBinding.agentId, 'agent-one');
  assert.equal(response.result.routeBinding.routeGeneration, 1);
  assert.equal(reads[0].routeBinding.durableObjectId, 'do-agent-one');

  const injected = await qualification.qualificationInvoke({
    profile: QUALIFICATION_RPC_PROFILE,
    operation: 'runtime_probe',
    agentId: 'agent-one',
    routeGeneration: 1,
    routeBinding: { durableObjectId: 'attacker-chosen' },
  });
  assert.equal(injected.ok, false);
  assert.equal(reads.length, 1);
});

test('D0040 public attestor readback remains available pre-CURRENT without weakening CURRENT-bound probes', async () => {
  const publicJwk = { crv: 'Ed25519', kty: 'OKP', x: 'A5T3RIA4mBzLDInNiSTjhHc1TxgGZ8TDJkUGlpnyAYE' };
  const keyId = 'sha256:c9108b2999e786291ca0aead3a6f99972ba9e4061ba0da623e427576d7267cc1';
  let routeReads = 0;
  let currentRouteReads = 0;
  const host = {
    durableObjectId: 'do-agent-one',
    evidenceAttestor: { keyId, publicJwk },
    config: {
      placement: {
        deployment: 'qualification',
        environment: 'nonproduction',
        workerScript: 'tdev-d0020-qualification',
        className: 'AgentDeliveryRuntimeDO',
        namespace: 'tdev-d0020-qualification_AgentDeliveryRuntimeDO',
        jurisdiction: 'global',
      },
    },
    readRoute() { currentRouteReads += 1; return { revision: 1 }; },
    readInstallableAgent() {
      routeReads += 1;
      return routeRead({ currentTupleDigest: null, state: 'UNREGISTERED' });
    },
  };
  const ctx = { abort() { throw new Error('unexpected abort'); } };
  const qualification = new D0020QualificationAgentDeliveryDOHost(ctx, baseEnv(), { host });

  const readback = await qualification.qualificationInvoke({
    profile: QUALIFICATION_RPC_PROFILE,
    operation: 'd0040_evidence_attestor_readback',
    agentId: 'agent-one',
    routeGeneration: 1,
  });
  assert.equal(readback.ok, true);
  assert.deepEqual(readback.result, {
    sourceSha: baseEnv().TDEV_SOURCE_SHA,
    workerVersionId: baseEnv().TDEV_WORKER_VERSION.id,
    deployment: 'qualification',
    environment: 'nonproduction',
    workerScript: 'tdev-d0020-qualification',
    namespace: 'tdev-d0020-qualification_AgentDeliveryRuntimeDO',
    className: 'AgentDeliveryRuntimeDO',
    jurisdiction: 'global',
    durableObjectId: 'do-agent-one',
    evidenceAttestationVerifier: {
      profile: 'tdev.installable-agent-evidence-attestor-runtime.v1',
      configured: true,
      keyId,
      publicJwk,
    },
  });
  assert.equal(routeReads, 0);
  assert.equal(currentRouteReads, 0);

  const runtimeProbe = await qualification.qualificationInvoke({
    profile: QUALIFICATION_RPC_PROFILE,
    operation: 'runtime_probe',
    agentId: 'agent-one',
    routeGeneration: 1,
  });
  assert.equal(runtimeProbe.ok, false);
  assert.equal(runtimeProbe.error.code, 'invalid_digest');

  const securityReadback = await qualification.qualificationInvoke({
    profile: QUALIFICATION_RPC_PROFILE,
    operation: 'd0039_security_readback',
    agentId: 'agent-one',
    routeGeneration: 1,
  });
  assert.equal(securityReadback.ok, false);
  assert.equal(securityReadback.error.code, 'invalid_digest');
  assert.equal(routeReads, 2);
  assert.equal(currentRouteReads, 1);
});

test('qualification DO host exposes bounded Revision-2 terminal-delivery transitions without caller-chosen route authority', async () => {
  const calls = [];
  const host = {
    durableObjectId: 'do-agent-one',
    config: {
      placement: {
        deployment: 'qualification',
        environment: 'nonproduction',
        workerScript: 'tdev-d0020-qualification',
        className: 'AgentDeliveryRuntimeDO',
        namespace: 'tdev-d0020-qualification_AgentDeliveryRuntimeDO',
        jurisdiction: 'global',
      },
    },
    closeUndispatchedDelivery(input) {
      calls.push({ type: 'close', input: structuredClone(input) });
      return { classification: 'monotonic_refinement', retired: true };
    },
    bindTerminalCaseReceipt(input) {
      calls.push({ type: 'terminal', input: structuredClone(input) });
      return { classification: 'accepted', retired: true };
    },
    readInstallableAgent() { return routeRead(); },
  };
  const ctx = { abort() { throw new Error('unexpected abort'); } };
  const qualification = new D0020QualificationAgentDeliveryDOHost(ctx, baseEnv(), { host });

  const closed = await qualification.qualificationInvoke({
    profile: QUALIFICATION_RPC_PROFILE,
    operation: 'close_undispatched_delivery',
    agentId: 'agent-one',
    routeGeneration: 1,
    expectedDeploymentIdentityDigest: expectedDeploymentDigest(),
    deliveryId: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    nowMs: 1234,
  });
  assert.equal(closed.ok, true);
  assert.equal(closed.result.retired, true);
  assert.equal(calls[0].input.routeBinding.agentId, 'agent-one');
  assert.equal(calls[0].input.routeBinding.durableObjectId, 'do-agent-one');
  assert.equal(calls[0].input.nowMs, 1234);

  const terminalRequest = {
    deliveryId: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    command: { type: 'accept_result', envelope: { fixture: true } },
    caseReceipt: { fixture: true },
  };
  const terminal = await qualification.qualificationInvoke({
    profile: QUALIFICATION_RPC_PROFILE,
    operation: 'bind_terminal_case_receipt',
    agentId: 'agent-one',
    routeGeneration: 1,
    expectedDeploymentIdentityDigest: expectedDeploymentDigest(),
    request: terminalRequest,
    nowMs: 5678,
  });
  assert.equal(terminal.ok, true);
  assert.equal(terminal.result.retired, true);
  assert.deepEqual(calls[1].input.request, terminalRequest);
  assert.equal(calls[1].input.nowMs, 5678);
  assert.equal(calls[1].input.routeBinding.durableObjectId, 'do-agent-one');

  const missingNow = await qualification.qualificationInvoke({
    profile: QUALIFICATION_RPC_PROFILE,
    operation: 'bind_terminal_case_receipt',
    agentId: 'agent-one',
    routeGeneration: 1,
    expectedDeploymentIdentityDigest: expectedDeploymentDigest(),
    request: terminalRequest,
  });
  assert.equal(missingNow.ok, false);
  assert.equal(calls.length, 2);
});

test('qualification mode and secret bindings fail closed before a service becomes externally reachable', () => {
  const stub = { fetch() {}, qualificationInvoke() {} };
  const namespace = namespaceFor(stub);
  assert.throws(
    () => new D0020QualificationService(baseEnv({ TDEV_AGENT_DELIVERY: namespace, TDEV_D0020_QUALIFICATION_MODE: 'disabled' })),
    (error) => error?.code === 'qualification_mode_disabled',
  );
  assert.throws(
    () => new D0020QualificationService(baseEnv({ TDEV_AGENT_DELIVERY: namespace, TDEV_D0020_QUALIFICATION_TOKEN: 'short' })),
    (error) => error?.code === 'invalid_qualification_config',
  );
});


test('qualification DO host exposes D0039 installable-Agent operations only through the actual route-bound production host', async () => {
  const calls = [];
  const record = (method) => (input) => {
    calls.push({ method, input: structuredClone(input) });
    return { method };
  };
  const host = {
    durableObjectId: 'do-agent-d0039',
    config: {
      placement: {
        deployment: 'qualification',
        environment: 'nonproduction',
        workerScript: 'tdev-d0020-qualification',
        className: 'AgentDeliveryRuntimeDO',
        namespace: 'tdev-d0020-qualification_AgentDeliveryRuntimeDO',
        jurisdiction: 'global',
      },
    },
    readInstallableAgent() { return routeRead(); },
    issueInstallableAgentConnectChallenge: record('issueInstallableAgentConnectChallenge'),
    migrateInstallableAgentRoute: record('migrateInstallableAgentRoute'),
    registerInstallableAgent: record('registerInstallableAgent'),
    recordInstallableAgentGenesisEvidence: record('recordInstallableAgentGenesisEvidence'),
    acceptLegacyPredecessorQuiescence: record('acceptLegacyPredecessorQuiescence'),
    initialActivateInstallableAgent: record('initialActivateInstallableAgent'),
    failInstallableAgentGenesis: record('failInstallableAgentGenesis'),
    recordInstallableAgentTransactionEvidence: record('recordInstallableAgentTransactionEvidence'),
    mutateInstallableAgentTrust: record('mutateInstallableAgentTrust'),
    beginCredentialRotation: record('beginCredentialRotation'),
    commitCredentialRotation: record('commitCredentialRotation'),
    revokeInstallableAgentCredential: record('revokeInstallableAgentCredential'),
    beginBaseStop: record('beginBaseStop'),
    completeBaseStop: record('completeBaseStop'),
    prepareBaseStart: record('prepareBaseStart'),
    commitBaseStart: record('commitBaseStart'),
    beginPackageActivation: record('beginPackageActivation'),
    commitPackageActivation: record('commitPackageActivation'),
    beginInstallableAgentReplacement: record('beginInstallableAgentReplacement'),
    commitInstallableAgentReplacement: record('commitInstallableAgentReplacement'),
    beginInstallableAgentUninstall: record('beginInstallableAgentUninstall'),
    completeInstallableAgentUninstall: record('completeInstallableAgentUninstall'),
    compactInstallableAgentManagementReceipts: record('compactInstallableAgentManagementReceipts'),
  };
  const qualification = new D0020QualificationAgentDeliveryDOHost(
    { abort() { throw new Error('unexpected abort'); } },
    baseEnv(),
    { host },
  );
  const request = { fixture: true, managementProof: { profile: 'opaque-production-proof' } };
  const operations = [
    ['record_installable_agent_transaction_evidence', 'recordInstallableAgentTransactionEvidence'],
    ['mutate_installable_agent_trust', 'mutateInstallableAgentTrust'],
    ['begin_credential_rotation', 'beginCredentialRotation'],
    ['commit_credential_rotation', 'commitCredentialRotation'],
    ['revoke_installable_agent_credential', 'revokeInstallableAgentCredential'],
    ['begin_base_stop', 'beginBaseStop'],
    ['complete_base_stop', 'completeBaseStop'],
    ['prepare_base_start', 'prepareBaseStart'],
    ['commit_base_start', 'commitBaseStart'],
    ['begin_package_activation', 'beginPackageActivation'],
    ['commit_package_activation', 'commitPackageActivation'],
    ['begin_installable_agent_replacement', 'beginInstallableAgentReplacement'],
    ['commit_installable_agent_replacement', 'commitInstallableAgentReplacement'],
    ['begin_installable_agent_uninstall', 'beginInstallableAgentUninstall'],
    ['complete_installable_agent_uninstall', 'completeInstallableAgentUninstall'],
    ['compact_installable_agent_management_receipts', 'compactInstallableAgentManagementReceipts'],
  ];
  for (const [operation, method] of operations) {
    const response = await qualification.qualificationInvoke({ profile: QUALIFICATION_RPC_PROFILE, operation, agentId: 'agent-one', routeGeneration: 7, expectedDeploymentIdentityDigest: expectedDeploymentDigest({ routeGeneration: 7, durableObjectId: 'do-agent-d0039' }), request });
    assert.equal(response.ok, true, operation);
    assert.equal(response.result.method, method, operation);
  }
  const read = await qualification.qualificationInvoke({ profile: QUALIFICATION_RPC_PROFILE, operation: 'read_installable_agent', agentId: 'agent-one', routeGeneration: 7 });
  assert.equal(read.ok, true);
  const challenge = await qualification.qualificationInvoke({
    profile: QUALIFICATION_RPC_PROFILE,
    operation: 'issue_installable_agent_connect_challenge', agentId: 'agent-one', routeGeneration: 7, expectedDeploymentIdentityDigest: expectedDeploymentDigest({ routeGeneration: 7, durableObjectId: 'do-agent-d0039' }), request, nowMs: 1234,
  });
  assert.equal(challenge.ok, true);

  for (const call of calls) {
    assert.equal(call.input.routeBinding.agentId, 'agent-one');
    assert.equal(call.input.routeBinding.routeGeneration, 7);
    assert.equal(call.input.routeBinding.durableObjectId, 'do-agent-d0039');
  }
  assert.equal(calls.find((call) => call.method === 'issueInstallableAgentConnectChallenge').input.nowMs, 1234);

  const injected = await qualification.qualificationInvoke({
    profile: QUALIFICATION_RPC_PROFILE,
    operation: 'begin_base_stop',
    agentId: 'agent-one',
    routeGeneration: 7,
    expectedDeploymentIdentityDigest: expectedDeploymentDigest({ routeGeneration: 7, durableObjectId: 'do-agent-d0039' }),
    routeBinding: { durableObjectId: 'caller-chosen' },
    request,
  });
  assert.equal(injected.ok, false);

  const callCountBeforeMismatch = calls.length;
  const mismatch = await qualification.qualificationInvoke({
    profile: QUALIFICATION_RPC_PROFILE,
    operation: 'begin_base_stop',
    agentId: 'agent-one',
    routeGeneration: 7,
    expectedDeploymentIdentityDigest: 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    request,
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.error.code, 'qualification_runtime_identity_mismatch');
  assert.equal(calls.length, callCountBeforeMismatch);
});


test('R12 route provisioning fences ABSENT initialization and LEGACY_D0020_ONLY migration before UNREGISTERED bootstrap', async () => {
  const env = baseEnv();
  const keyId = 'sha256:c9108b2999e786291ca0aead3a6f99972ba9e4061ba0da623e427576d7267cc1';
  const publicJwk = { crv: 'Ed25519', kty: 'OKP', x: 'A5T3RIA4mBzLDInNiSTjhHc1TxgGZ8TDJkUGlpnyAYE' };
  const routeBinding = { agentId: 'agent-r12', routeGeneration: 1 };
  const durableObjectId = 'do-agent-r12';
  const runtimeFields = {
    sourceSha: env.TDEV_SOURCE_SHA,
    artifactDigest: ARTIFACT_DIGEST,
    artifactManifestDigest: ARTIFACT_MANIFEST_DIGEST,
    workerVersionId: env.TDEV_WORKER_VERSION.id,
    accountId: env.TDEV_D0039_ACCOUNT_ID,
    serviceName: env.TDEV_D0039_SERVICE_NAME,
    deployment: 'qualification',
    environment: 'nonproduction',
    deploymentEpoch: env.TDEV_D0039_DEPLOYMENT_EPOCH,
    qualificationEndpointOrigin: env.TDEV_D0039_QUALIFICATION_ENDPOINT_ORIGIN,
    workersDevAccountSubdomain: env.TDEV_D0039_WORKERS_DEV_ACCOUNT_SUBDOMAIN,
    workersDevHostname: env.TDEV_D0039_WORKERS_DEV_HOSTNAME,
    workerScript: env.TDEV_WORKER_SCRIPT,
    namespaceId: env.TDEV_D0039_NAMESPACE_ID,
    namespace: env.TDEV_AGENT_DELIVERY_NAMESPACE,
    className: 'AgentDeliveryRuntimeDO',
    jurisdiction: 'global',
    durableObjectId,
  };
  const hostConfig = {
    placement: {
      deployment: 'qualification',
      environment: 'nonproduction',
      workerScript: env.TDEV_WORKER_SCRIPT,
      className: 'AgentDeliveryRuntimeDO',
      namespace: env.TDEV_AGENT_DELIVERY_NAMESPACE,
      jurisdiction: 'global',
    },
  };

  let initializeCalls = 0;
  const initializeHost = {
    durableObjectId,
    evidenceAttestor: { keyId, publicJwk },
    config: hostConfig,
    initializeRoute() {
      initializeCalls += 1;
      return { deduplicated: initializeCalls > 1, snapshot: { revision: 0 } };
    },
  };
  const initializeTransactionId = 'r12-route-provisioning-initialize-1';
  const initializeRequestDigest = qualificationRouteProvisioningRequestDigest({
    operation: 'initialize', transactionId: initializeTransactionId, routeBinding, payload: {},
  });
  const initializeTarget = {
    profile: QUALIFICATION_ROUTE_PROVISIONING_PROFILE,
    operation: 'initialize',
    ...runtimeFields,
    evidenceAttestorKeyId: keyId,
    ...routeBinding,
    predecessorState: 'ABSENT',
    predecessorDigest: null,
    routeAuthoritativeRereadDigest: null,
    provisioningTransactionId: initializeTransactionId,
    provisioningRequestDigest: initializeRequestDigest,
  };
  const initializeQualification = new D0020QualificationAgentDeliveryDOHost(
    { abort() { throw new Error('unexpected abort'); } }, env, { host: initializeHost },
  );
  const initializeInput = {
    profile: QUALIFICATION_RPC_PROFILE,
    operation: 'initialize',
    ...routeBinding,
    routeProvisioningTarget: initializeTarget,
    routeProvisioningTargetDigest: qualificationRouteProvisioningTargetDigest(initializeTarget),
    routeProvisioningTransactionId: initializeTransactionId,
    routeProvisioningRequestDigest: initializeRequestDigest,
  };
  const initialized = await initializeQualification.qualificationInvoke(initializeInput);
  assert.equal(initialized.ok, true);
  assert.equal(initialized.result.deduplicated, false);
  const repeatedInitialize = await initializeQualification.qualificationInvoke(initializeInput);
  assert.equal(repeatedInitialize.ok, false);
  assert.equal(repeatedInitialize.error.code, 'qualification_route_provisioning_predecessor_invalid');
  assert.equal(initializeCalls, 2);

  const legacyRead = {
    installableAgent: { profile: 'tdev.installable-agent-admission.v1', state: 'LEGACY_D0020_ONLY' },
    predecessorDigest: 'sha256:3434343434343434343434343434343434343434343434343434343434343434',
    currentTuple: null,
    currentTupleDigest: null,
  };
  const migrationRequest = { migrationProfile: 'tdev.installable-agent-admission-migration.v2' };
  const migrationTransactionId = 'r12-route-provisioning-migrate-1';
  const migrationRequestDigest = qualificationRouteProvisioningRequestDigest({
    operation: 'migrate_installable_agent_route', transactionId: migrationTransactionId, routeBinding, payload: migrationRequest,
  });
  const migrationTarget = {
    profile: QUALIFICATION_ROUTE_PROVISIONING_PROFILE,
    operation: 'migrate_installable_agent_route',
    ...runtimeFields,
    evidenceAttestorKeyId: keyId,
    ...routeBinding,
    predecessorState: 'LEGACY_D0020_ONLY',
    predecessorDigest: legacyRead.predecessorDigest,
    routeAuthoritativeRereadDigest: qualificationLegacyRouteAuthoritativeReadbackDigest({ routeBinding, routeRead: legacyRead }),
    provisioningTransactionId: migrationTransactionId,
    provisioningRequestDigest: migrationRequestDigest,
  };
  let migrationCalls = 0;
  const migrationHost = {
    durableObjectId,
    evidenceAttestor: { keyId, publicJwk },
    config: hostConfig,
    readInstallableAgent() { return legacyRead; },
    migrateInstallableAgentRoute() { migrationCalls += 1; return { state: 'UNREGISTERED' }; },
  };
  const migrationQualification = new D0020QualificationAgentDeliveryDOHost(
    { abort() { throw new Error('unexpected abort'); } }, env, { host: migrationHost },
  );
  const migrationInput = {
    profile: QUALIFICATION_RPC_PROFILE,
    operation: 'migrate_installable_agent_route',
    ...routeBinding,
    routeProvisioningTarget: migrationTarget,
    routeProvisioningTargetDigest: qualificationRouteProvisioningTargetDigest(migrationTarget),
    routeProvisioningTransactionId: migrationTransactionId,
    routeProvisioningRequestDigest: migrationRequestDigest,
    request: migrationRequest,
  };
  const migrated = await migrationQualification.qualificationInvoke(migrationInput);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.result.state, 'UNREGISTERED');
  assert.equal(migrationCalls, 1);

  const staleHost = {
    ...migrationHost,
    readInstallableAgent() {
      return { ...legacyRead, installableAgent: { profile: 'tdev.installable-agent-admission.v2', state: 'UNREGISTERED' } };
    },
  };
  const staleQualification = new D0020QualificationAgentDeliveryDOHost(
    { abort() { throw new Error('unexpected abort'); } }, env, { host: staleHost },
  );
  const stale = await staleQualification.qualificationInvoke(migrationInput);
  assert.equal(stale.ok, false);
  assert.equal(stale.error.code, 'qualification_route_provisioning_predecessor_invalid');
  assert.equal(migrationCalls, 1);
});


test('route-bootstrap operations admit an UNREGISTERED predecessor without a CURRENT tuple', async () => {
  const calls = [];
  const record = (method) => (input) => {
    calls.push({ method, input: structuredClone(input) });
    return { method };
  };
  const env = baseEnv();
  const predecessor = routeRead({ currentTupleDigest: null });
  const host = {
    durableObjectId: 'do-agent-one',
    config: {
      placement: {
        deployment: 'qualification',
        environment: 'nonproduction',
        workerScript: 'tdev-d0020-qualification',
        className: 'AgentDeliveryRuntimeDO',
        namespace: 'tdev-d0020-qualification_AgentDeliveryRuntimeDO',
        jurisdiction: 'global',
      },
    },
    readInstallableAgent() { return predecessor; },
    migrateInstallableAgentRoute: record('migrateInstallableAgentRoute'),
    registerInstallableAgent: record('registerInstallableAgent'),
    recordInstallableAgentGenesisEvidence: record('recordInstallableAgentGenesisEvidence'),
    acceptLegacyPredecessorQuiescence: record('acceptLegacyPredecessorQuiescence'),
    initialActivateInstallableAgent: record('initialActivateInstallableAgent'),
    failInstallableAgentGenesis: record('failInstallableAgentGenesis'),
  };
  const routeBinding = { agentId: 'agent-one', routeGeneration: 7 };
  const transactionId = 'd0039-route-bootstrap-one';
  const requestDigest = qualificationRouteBootstrapRequestDigest({ transactionId, routeBinding });
  const target = {
    profile: QUALIFICATION_ROUTE_BOOTSTRAP_PROFILE,
    sourceSha: env.TDEV_SOURCE_SHA,
    artifactDigest: ARTIFACT_DIGEST,
    artifactManifestDigest: ARTIFACT_MANIFEST_DIGEST,
    accountId: env.TDEV_D0039_ACCOUNT_ID,
    serviceName: env.TDEV_D0039_SERVICE_NAME,
    deploymentEpoch: env.TDEV_D0039_DEPLOYMENT_EPOCH,
    qualificationEndpointOrigin: env.TDEV_D0039_QUALIFICATION_ENDPOINT_ORIGIN,
    workersDevAccountSubdomain: env.TDEV_D0039_WORKERS_DEV_ACCOUNT_SUBDOMAIN,
    workersDevHostname: env.TDEV_D0039_WORKERS_DEV_HOSTNAME,
    workerScript: env.TDEV_WORKER_SCRIPT,
    workerVersionId: env.TDEV_WORKER_VERSION.id,
    activeDeploymentId: 'deployment-one',
    activeTrafficPercentage: 100,
    providerConfigurationDigest: 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    providerWriterObservationDigest: 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    namespaceId: env.TDEV_D0039_NAMESPACE_ID,
    namespace: env.TDEV_AGENT_DELIVERY_NAMESPACE,
    className: 'AgentDeliveryRuntimeDO',
    jurisdiction: 'global',
    agentId: routeBinding.agentId,
    routeGeneration: routeBinding.routeGeneration,
    routePredecessorState: 'UNREGISTERED',
    routePredecessorStateDigest: predecessor.predecessorDigest,
    managementRequestSequenceHighWater: predecessor.installableAgent.managementRequestSequenceHighWater,
    routeBootstrapTransactionId: transactionId,
    routeBootstrapRequestDigest: requestDigest,
    providerAuthoritativeRereadDigest: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
    routeAuthoritativeRereadDigest: qualificationRouteAuthoritativeReadbackDigest({ routeBinding, routeRead: predecessor }),
  };
  const targetDigest = qualificationRouteBootstrapDigest(target);
  const qualification = new D0020QualificationAgentDeliveryDOHost(
    { abort() { throw new Error('unexpected abort'); } },
    env,
    { host },
  );
  const response = await qualification.qualificationInvoke({
    profile: QUALIFICATION_RPC_PROFILE,
    operation: 'register_installable_agent',
    agentId: routeBinding.agentId,
    routeGeneration: routeBinding.routeGeneration,
    routeBootstrapTarget: target,
    routeBootstrapTargetDigest: targetDigest,
    routeBootstrapTransactionId: transactionId,
    routeBootstrapRequestDigest: requestDigest,
    request: { fixture: true },
  });
  assert.equal(response.ok, true);
  assert.equal(response.result.method, 'registerInstallableAgent');
  assert.equal(calls.length, 1);

  const currentPredecessor = routeRead();
  const blockedHost = { ...host, readInstallableAgent() { return currentPredecessor; } };
  const blocked = new D0020QualificationAgentDeliveryDOHost(
    { abort() { throw new Error('unexpected abort'); } },
    env,
    { host: blockedHost },
  );
  const blockedResponse = await blocked.qualificationInvoke({
    profile: QUALIFICATION_RPC_PROFILE,
    operation: 'register_installable_agent',
    agentId: routeBinding.agentId,
    routeGeneration: routeBinding.routeGeneration,
    routeBootstrapTarget: target,
    routeBootstrapTargetDigest: targetDigest,
    routeBootstrapTransactionId: transactionId,
    routeBootstrapRequestDigest: requestDigest,
    request: { fixture: true },
  });
  assert.equal(blockedResponse.ok, false);
  assert.equal(blockedResponse.error.code, 'qualification_route_bootstrap_predecessor_invalid');

  const changedPredecessor = { ...predecessor, predecessorDigest: 'sha256:9999999999999999999999999999999999999999999999999999999999999999' };
  const staleHost = { ...host, readInstallableAgent() { return changedPredecessor; } };
  const stale = new D0020QualificationAgentDeliveryDOHost(
    { abort() { throw new Error('unexpected abort'); } },
    env,
    { host: staleHost },
  );
  const staleResponse = await stale.qualificationInvoke({
    profile: QUALIFICATION_RPC_PROFILE,
    operation: 'register_installable_agent',
    agentId: routeBinding.agentId,
    routeGeneration: routeBinding.routeGeneration,
    routeBootstrapTarget: target,
    routeBootstrapTargetDigest: targetDigest,
    routeBootstrapTransactionId: transactionId,
    routeBootstrapRequestDigest: requestDigest,
    request: { fixture: true },
  });
  assert.equal(staleResponse.ok, false);
  assert.equal(staleResponse.error.code, 'qualification_route_bootstrap_predecessor_mismatch');

  const wrongRequest = qualificationRouteBootstrapRequestDigest({ transactionId: 'd0039-route-bootstrap-two', routeBinding });
  const requestMismatch = await qualification.qualificationInvoke({
    profile: QUALIFICATION_RPC_PROFILE,
    operation: 'register_installable_agent',
    agentId: routeBinding.agentId,
    routeGeneration: routeBinding.routeGeneration,
    routeBootstrapTarget: target,
    routeBootstrapTargetDigest: targetDigest,
    routeBootstrapTransactionId: 'd0039-route-bootstrap-two',
    routeBootstrapRequestDigest: wrongRequest,
    request: { fixture: true },
  });
  assert.equal(requestMismatch.ok, false);
  assert.equal(requestMismatch.error.code, 'qualification_route_bootstrap_request_mismatch');
});

test('D0044 qualification PITR controls require provider APIs, clear only this object and schedule a restart restore', async () => {
  const calls = [];
  let bookmark = 'bookmark-current';
  const ctx = {
    storage: {
      async getCurrentBookmark() { calls.push('getCurrentBookmark'); return bookmark; },
      async deleteAll() { calls.push('deleteAll'); bookmark = 'bookmark-after-clear'; },
      async onNextSessionRestoreBookmark(value) { calls.push(['restore', value]); return 'bookmark-undo'; },
      transactionSync(callback) { calls.push('transactionSync'); return callback(); },
      sql: { exec(statement, agentId) { calls.push(['sql', statement, agentId]); } },
    },
    abort(reason) { calls.push(['abort', reason]); throw new Error('injected abort'); },
  };
  const host = {
    durableObjectId: 'do-agent-one',
    config: { placement: { deployment: 'qualification', environment: 'nonproduction', workerScript: 'tdev-d0020-qualification', className: 'AgentDeliveryRuntimeDO', namespace: 'qualification', jurisdiction: 'global' } },
    readRouteGeneration() { calls.push('readRouteGeneration'); return { profile: 'tdev.agent-route-generation.v1', disposition: 'RETIRED' }; },
    initializeRouteGeneration({ state }) { calls.push(['reinitialize', state]); return { classification: 'generation_state_reinitialized' }; },
  };
  const qualification = new D0020QualificationAgentDeliveryDOHost(ctx, baseEnv(), { host });
  const current = await qualification.qualificationInvoke({ profile: QUALIFICATION_RPC_PROFILE, operation: 'd0044_pitr_get_current_bookmark', agentId: 'agent-one', routeGeneration: 1 });
  assert.deepEqual(current, { profile: QUALIFICATION_RPC_PROFILE, schemaVersion: 2, ok: true, result: { classification: 'current_bookmark', bookmark: 'bookmark-current' } });
  const cleared = await qualification.qualificationInvoke({ profile: QUALIFICATION_RPC_PROFILE, operation: 'd0044_pitr_clear_storage', agentId: 'agent-one', routeGeneration: 1 });
  assert.deepEqual(cleared, { profile: QUALIFICATION_RPC_PROFILE, schemaVersion: 2, ok: true, result: { classification: 'storage_cleared', beforeBookmark: 'bookmark-current', afterBookmark: 'bookmark-after-clear' } });
  const generationCleared = await qualification.qualificationInvoke({ profile: QUALIFICATION_RPC_PROFILE, operation: 'd0044_pitr_clear_generation_state', agentId: 'agent-one', routeGeneration: 1 });
  assert.deepEqual(generationCleared.result, { classification: 'generation_state_cleared', beforeStateDigest: digest({ profile: 'tdev.agent-route-generation.v1', disposition: 'RETIRED' }), routeGeneration: 1 });
  const generationReinitialized = await qualification.qualificationInvoke({ profile: QUALIFICATION_RPC_PROFILE, operation: 'd0044_pitr_reinitialize_generation_state', agentId: 'agent-one', routeGeneration: 1, state: { state: 'recreated' } });
  assert.deepEqual(generationReinitialized.result, { classification: 'generation_state_reinitialized' });
  await assert.rejects(
    () => qualification.qualificationInvoke({ profile: QUALIFICATION_RPC_PROFILE, operation: 'd0044_pitr_restore_next_session', agentId: 'agent-one', routeGeneration: 1, bookmark: 'bookmark-after-clear' }),
    (error) => error?.message === 'injected abort',
  );
  assert.deepEqual(calls, ['getCurrentBookmark', 'getCurrentBookmark', 'deleteAll', 'getCurrentBookmark', 'readRouteGeneration', 'transactionSync', ['sql', 'DELETE FROM agent_route_generation_state WHERE agent_id = ?', 'agent-one'], ['reinitialize', { state: 'recreated' }], ['restore', 'bookmark-after-clear'], ['abort', 'tdev_d0044_qualification_pitr_restore']]);
  const invalid = await qualification.qualificationInvoke({ profile: QUALIFICATION_RPC_PROFILE, operation: 'd0044_pitr_restore_next_session', agentId: 'agent-one', routeGeneration: 1, bookmark: '' });
  assert.deepEqual(invalid, { profile: QUALIFICATION_RPC_PROFILE, schemaVersion: 2, ok: false, error: { code: 'd0044_pitr_invalid_bookmark' } });
});
