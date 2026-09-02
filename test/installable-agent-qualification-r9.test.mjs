import test from 'node:test';
import assert from 'node:assert/strict';

import {
  D0020QualificationAgentDeliveryDOHost,
} from '../qualification/cloudflare-agent-delivery-runtime.mjs';
import {
  QUALIFICATION_RPC_PROFILE,
} from '../qualification/installable-agent-qualification-r4.mjs';
import {
  QUALIFICATION_TARGET_KIND_ROUTE_BOOTSTRAP,
  normalizeQualificationRunTarget,
  qualificationRunTargetDigest,
} from '../qualification/installable-agent-qualification-r6.mjs';
import {
  QUALIFICATION_ROUTE_BOOTSTRAP_V2_PHASE,
  QUALIFICATION_ROUTE_BOOTSTRAP_V2_PROFILE,
  qualificationRouteBootstrapV2Digest,
  qualificationRouteBootstrapV2RequestDigest,
  qualificationRoutePendingReadbackDigest,
} from '../qualification/installable-agent-qualification-r9.mjs';

const ARTIFACT_DIGEST = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ARTIFACT_MANIFEST_DIGEST = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const PREDECESSOR_DIGEST = 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';
const GENESIS_PREDECESSOR_DIGEST = 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const PENDING_DIGEST = 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
const INTENT_DIGEST = 'sha256:1111111111111111111111111111111111111111111111111111111111111111';
const EVIDENCE_DIGEST = 'sha256:2222222222222222222222222222222222222222222222222222222222222222';

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
    TDEV_D0020_QUALIFICATION_TOKEN: 'qualification-token-0123456789abcdef0123456789abcdef',
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

function pendingRouteRead(overrides = {}) {
  return {
    installableAgent: {
      state: 'GENESIS_PENDING',
      managementKeyId: 'management-key-one',
      releaseRootKeyId: 'release-root-key-one',
      currentCredentialKeyId: null,
      managementRequestSequenceHighWater: 1,
      pending: {
        genesisGeneration: 3,
        managementRequestId: 'm2:7',
        intentDigest: INTENT_DIGEST,
        unregisteredPredecessorDigest: GENESIS_PREDECESSOR_DIGEST,
        pendingDigest: PENDING_DIGEST,
        candidate: { ignored: 'authority-owned' },
      },
      ...overrides.installableAgent,
    },
    predecessorDigest: PREDECESSOR_DIGEST,
    currentTuple: null,
    currentTupleDigest: null,
    ...overrides,
  };
}

function runtimeBinding(env) {
  return {
    sourceSha: env.TDEV_SOURCE_SHA,
    artifactDigest: env.TDEV_D0039_ARTIFACT_DIGEST,
    artifactManifestDigest: env.TDEV_D0039_ARTIFACT_MANIFEST_DIGEST,
    accountId: env.TDEV_D0039_ACCOUNT_ID,
    serviceName: env.TDEV_D0039_SERVICE_NAME,
    deploymentEpoch: env.TDEV_D0039_DEPLOYMENT_EPOCH,
    qualificationEndpointOrigin: env.TDEV_D0039_QUALIFICATION_ENDPOINT_ORIGIN,
    workersDevAccountSubdomain: env.TDEV_D0039_WORKERS_DEV_ACCOUNT_SUBDOMAIN,
    workersDevHostname: env.TDEV_D0039_WORKERS_DEV_HOSTNAME,
    workerScript: env.TDEV_WORKER_SCRIPT,
    workerVersionId: env.TDEV_WORKER_VERSION.id,
    namespaceId: env.TDEV_D0039_NAMESPACE_ID,
    namespace: env.TDEV_AGENT_DELIVERY_NAMESPACE,
    className: 'AgentDeliveryRuntimeDO',
    jurisdiction: 'global',
  };
}

function targetFor({ env, routeBinding, routeRead, operation, transactionId, request }) {
  return {
    profile: QUALIFICATION_ROUTE_BOOTSTRAP_V2_PROFILE,
    ...runtimeBinding(env),
    activeDeploymentId: 'deployment-one',
    activeTrafficPercentage: 100,
    providerConfigurationDigest: 'sha256:3333333333333333333333333333333333333333333333333333333333333333',
    providerWriterObservationDigest: 'sha256:4444444444444444444444444444444444444444444444444444444444444444',
    agentId: routeBinding.agentId,
    routeGeneration: routeBinding.routeGeneration,
    routePredecessorState: 'GENESIS_PENDING',
    routePredecessorStateDigest: routeRead.predecessorDigest,
    managementRequestSequenceHighWater: routeRead.installableAgent.managementRequestSequenceHighWater,
    routeBootstrapPhase: QUALIFICATION_ROUTE_BOOTSTRAP_V2_PHASE,
    routeBootstrapOperation: operation,
    routeBootstrapTransactionId: transactionId,
    routeBootstrapRequestDigest: qualificationRouteBootstrapV2RequestDigest({ operation, transactionId, routeBinding, request }),
    genesisPredecessorDigest: routeRead.installableAgent.pending.unregisteredPredecessorDigest,
    pendingDigest: routeRead.installableAgent.pending.pendingDigest,
    genesisGeneration: routeRead.installableAgent.pending.genesisGeneration,
    pendingManagementRequestId: routeRead.installableAgent.pending.managementRequestId,
    pendingIntentDigest: routeRead.installableAgent.pending.intentDigest,
    pendingReadbackDigest: qualificationRoutePendingReadbackDigest({ routeBinding, routeRead }),
  };
}

function makeQualification({ env, routeRead, calls }) {
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
    readInstallableAgent() { return structuredClone(routeRead); },
    registerInstallableAgent(input) { calls.push({ operation: 'register', input }); return { operation: 'register' }; },
    recordInstallableAgentGenesisEvidence(input) { calls.push({ operation: 'evidence', input }); return { operation: 'evidence' }; },
    acceptLegacyPredecessorQuiescence(input) { calls.push({ operation: 'quiescence', input }); return { operation: 'quiescence' }; },
    initialActivateInstallableAgent(input) { calls.push({ operation: 'activate', input }); return { operation: 'activate' }; },
    failInstallableAgentGenesis(input) { calls.push({ operation: 'fail', input }); return { operation: 'fail' }; },
  };
  return new D0020QualificationAgentDeliveryDOHost(
    { abort() { throw new Error('unexpected abort'); } },
    env,
    { host },
  );
}

test('r9 admits exact pending evidence and rejects stale pending identity before host dispatch', async () => {
  const env = baseEnv();
  const routeBinding = { agentId: 'agent-one', routeGeneration: 7 };
  const routeRead = pendingRouteRead();
  const request = {
    pendingDigest: PENDING_DIGEST,
    genesisGeneration: 3,
    type: 'bootstrap_trust',
    evidenceDigest: EVIDENCE_DIGEST,
    evidenceProof: { profile: 'fixture-proof', signature: 'fixture' },
  };
  const transactionId = 'r9-pending-evidence-one';
  const target = targetFor({ env, routeBinding, routeRead, operation: 'record_installable_agent_genesis_evidence', transactionId, request });
  const calls = [];
  const qualification = makeQualification({ env, routeRead, calls });
  const accepted = await qualification.qualificationInvoke({
    profile: QUALIFICATION_RPC_PROFILE,
    operation: 'record_installable_agent_genesis_evidence',
    agentId: routeBinding.agentId,
    routeGeneration: routeBinding.routeGeneration,
    routeBootstrapTarget: target,
    routeBootstrapTargetDigest: qualificationRouteBootstrapV2Digest(target),
    routeBootstrapTransactionId: transactionId,
    routeBootstrapRequestDigest: target.routeBootstrapRequestDigest,
    request,
  });
  assert.equal(accepted.ok, true);
  assert.equal(calls.length, 1);

  const stale = await qualification.qualificationInvoke({
    profile: QUALIFICATION_RPC_PROFILE,
    operation: 'record_installable_agent_genesis_evidence',
    agentId: routeBinding.agentId,
    routeGeneration: routeBinding.routeGeneration,
    routeBootstrapTarget: target,
    routeBootstrapTargetDigest: qualificationRouteBootstrapV2Digest(target),
    routeBootstrapTransactionId: transactionId,
    routeBootstrapRequestDigest: target.routeBootstrapRequestDigest,
    request: { ...request, pendingDigest: 'sha256:6666666666666666666666666666666666666666666666666666666666666666' },
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.error.code, 'qualification_route_bootstrap_pending_mismatch');
  assert.equal(calls.length, 1);
});

test('r9 admits exact original register replay from GENESIS_PENDING and rejects changed intent', async () => {
  const env = baseEnv();
  const routeBinding = { agentId: 'agent-one', routeGeneration: 7 };
  const routeRead = pendingRouteRead();
  const request = {
    managementRequestId: 'm2:7',
    intentDigest: INTENT_DIGEST,
    expectedPredecessorDigest: GENESIS_PREDECESSOR_DIGEST,
    managementProof: { profile: 'fixture-management-proof', signature: 'fixture' },
    credentialProvisioningId: 'credential-one',
    packageManifestDigest: 'sha256:7777777777777777777777777777777777777777777777777777777777777777',
    packageTrustSubjectDigest: 'sha256:8888888888888888888888888888888888888888888888888888888888888888',
    trustStateDigest: 'sha256:9999999999999999999999999999999999999999999999999999999999999999',
    trustSubjects: { active: 'active' },
  };
  const transactionId = 'r9-register-replay-one';
  const target = targetFor({ env, routeBinding, routeRead, operation: 'register_installable_agent', transactionId, request });
  const calls = [];
  const qualification = makeQualification({ env, routeRead, calls });
  const replay = await qualification.qualificationInvoke({
    profile: QUALIFICATION_RPC_PROFILE,
    operation: 'register_installable_agent',
    agentId: routeBinding.agentId,
    routeGeneration: routeBinding.routeGeneration,
    routeBootstrapTarget: target,
    routeBootstrapTargetDigest: qualificationRouteBootstrapV2Digest(target),
    routeBootstrapTransactionId: transactionId,
    routeBootstrapRequestDigest: target.routeBootstrapRequestDigest,
    request,
  });
  assert.equal(replay.ok, true);
  assert.equal(calls.length, 1);

  const changed = await qualification.qualificationInvoke({
    profile: QUALIFICATION_RPC_PROFILE,
    operation: 'register_installable_agent',
    agentId: routeBinding.agentId,
    routeGeneration: routeBinding.routeGeneration,
    routeBootstrapTarget: target,
    routeBootstrapTargetDigest: qualificationRouteBootstrapV2Digest(target),
    routeBootstrapTransactionId: transactionId,
    routeBootstrapRequestDigest: target.routeBootstrapRequestDigest,
    request: { ...request, intentDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
  });
  assert.equal(changed.ok, false);
  assert.equal(changed.error.code, 'qualification_route_bootstrap_pending_mismatch');
  assert.equal(calls.length, 1);
});

test('r9 rejects authoritative pending drift, current tuple and an out-of-phase operation before host dispatch', async () => {
  const env = baseEnv();
  const routeBinding = { agentId: 'agent-one', routeGeneration: 7 };
  const originalRead = pendingRouteRead();
  const request = {
    pendingDigest: PENDING_DIGEST,
    genesisGeneration: 3,
    type: 'bootstrap_trust',
    evidenceDigest: EVIDENCE_DIGEST,
    evidenceProof: { profile: 'fixture-proof', signature: 'fixture' },
  };
  const transactionId = 'r9-authority-fence-one';
  const target = targetFor({ env, routeBinding, routeRead: originalRead, operation: 'record_installable_agent_genesis_evidence', transactionId, request });

  const driftedRead = pendingRouteRead();
  driftedRead.installableAgent.pending.pendingDigest = 'sha256:6666666666666666666666666666666666666666666666666666666666666666';
  const driftCalls = [];
  const driftQualification = makeQualification({ env, routeRead: driftedRead, calls: driftCalls });
  const drifted = await driftQualification.qualificationInvoke({
    profile: QUALIFICATION_RPC_PROFILE,
    operation: 'record_installable_agent_genesis_evidence',
    agentId: routeBinding.agentId,
    routeGeneration: routeBinding.routeGeneration,
    routeBootstrapTarget: target,
    routeBootstrapTargetDigest: qualificationRouteBootstrapV2Digest(target),
    routeBootstrapTransactionId: transactionId,
    routeBootstrapRequestDigest: target.routeBootstrapRequestDigest,
    request,
  });
  assert.equal(drifted.ok, false);
  assert.equal(drifted.error.code, 'qualification_route_bootstrap_pending_mismatch');
  assert.equal(driftCalls.length, 0);

  const currentRead = pendingRouteRead();
  currentRead.currentTuple = { installationGeneration: 1 };
  currentRead.currentTupleDigest = 'sha256:7777777777777777777777777777777777777777777777777777777777777777';
  const currentCalls = [];
  const currentQualification = makeQualification({ env, routeRead: currentRead, calls: currentCalls });
  const current = await currentQualification.qualificationInvoke({
    profile: QUALIFICATION_RPC_PROFILE,
    operation: 'record_installable_agent_genesis_evidence',
    agentId: routeBinding.agentId,
    routeGeneration: routeBinding.routeGeneration,
    routeBootstrapTarget: target,
    routeBootstrapTargetDigest: qualificationRouteBootstrapV2Digest(target),
    routeBootstrapTransactionId: transactionId,
    routeBootstrapRequestDigest: target.routeBootstrapRequestDigest,
    request,
  });
  assert.equal(current.ok, false);
  assert.equal(current.error.code, 'qualification_route_bootstrap_predecessor_invalid');
  assert.equal(currentCalls.length, 0);

  const forbiddenCalls = [];
  const forbiddenQualification = makeQualification({ env, routeRead: originalRead, calls: forbiddenCalls });
  const forbidden = await forbiddenQualification.qualificationInvoke({
    profile: QUALIFICATION_RPC_PROFILE,
    operation: 'migrate_installable_agent_route',
    agentId: routeBinding.agentId,
    routeGeneration: routeBinding.routeGeneration,
    routeBootstrapTarget: target,
    routeBootstrapTargetDigest: qualificationRouteBootstrapV2Digest(target),
    routeBootstrapTransactionId: transactionId,
    routeBootstrapRequestDigest: target.routeBootstrapRequestDigest,
    request: { migrationProfile: 'not-used' },
  });
  assert.equal(forbidden.ok, false);
  assert.equal(forbidden.error.code, 'qualification_route_bootstrap_operation_forbidden');
  assert.equal(forbiddenCalls.length, 0);
});

test('r9 target participates in the maintained qualification journal target union', () => {
  const env = baseEnv();
  const routeBinding = { agentId: 'agent-one', routeGeneration: 7 };
  const routeRead = pendingRouteRead();
  const request = {
    pendingDigest: PENDING_DIGEST,
    genesisGeneration: 3,
    type: 'bootstrap_trust',
    evidenceDigest: EVIDENCE_DIGEST,
    evidenceProof: { profile: 'fixture-proof', signature: 'fixture' },
  };
  const target = targetFor({ env, routeBinding, routeRead, operation: 'record_installable_agent_genesis_evidence', transactionId: 'r9-journal-one', request });
  const normalized = normalizeQualificationRunTarget(QUALIFICATION_TARGET_KIND_ROUTE_BOOTSTRAP, target);
  assert.equal(normalized.profile, QUALIFICATION_ROUTE_BOOTSTRAP_V2_PROFILE);
  assert.equal(qualificationRunTargetDigest(QUALIFICATION_TARGET_KIND_ROUTE_BOOTSTRAP, normalized), qualificationRouteBootstrapV2Digest(target));
});
