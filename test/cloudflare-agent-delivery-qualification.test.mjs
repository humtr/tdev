import test from 'node:test';
import assert from 'node:assert/strict';

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
} from '../qualification/installable-agent-qualification-r3.mjs';
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
    TDEV_D0039_QUALIFICATION_ENDPOINT_ORIGIN: 'https://qualification.example',
    TDEV_D0039_ROUTE_ID: 'route-one',
    TDEV_D0039_ROUTE_PATTERN: 'qualification.example/*',
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
} = {}) {
  return {
    installableAgent: { state, managementKeyId, releaseRootKeyId, currentCredentialKeyId },
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
    routeId: env.TDEV_D0039_ROUTE_ID,
    routePattern: env.TDEV_D0039_ROUTE_PATTERN,
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
    ['migrate_installable_agent_route', 'migrateInstallableAgentRoute'],
    ['register_installable_agent', 'registerInstallableAgent'],
    ['record_installable_agent_genesis_evidence', 'recordInstallableAgentGenesisEvidence'],
    ['accept_legacy_predecessor_quiescence', 'acceptLegacyPredecessorQuiescence'],
    ['initial_activate_installable_agent', 'initialActivateInstallableAgent'],
    ['fail_installable_agent_genesis', 'failInstallableAgentGenesis'],
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
  assert.deepEqual(calls.find((call) => call.method === 'registerInstallableAgent').input.request, request);
  assert.equal(calls.find((call) => call.method === 'issueInstallableAgentConnectChallenge').input.nowMs, 1234);

  const injected = await qualification.qualificationInvoke({
    profile: QUALIFICATION_RPC_PROFILE,
    operation: 'register_installable_agent',
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
    operation: 'register_installable_agent',
    agentId: 'agent-one',
    routeGeneration: 7,
    expectedDeploymentIdentityDigest: 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    request,
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.error.code, 'qualification_runtime_identity_mismatch');
  assert.equal(calls.length, callCountBeforeMismatch);
});
