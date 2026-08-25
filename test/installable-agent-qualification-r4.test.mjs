import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUALIFICATION_DEPLOYMENT_PROFILE,
  createQualificationDeploymentBindingPlan,
  createQualificationDeploymentIdentity,
  normalizeQualificationDeploymentIdentity,
  qualificationDeploymentIdentityDigest,
  qualificationRouteVerifierDigest,
} from '../qualification/installable-agent-qualification-r4.mjs';

const digest = (character) => `sha256:${character.repeat(64)}`;

function fixture() {
  const routeBinding = {
    agentId: 'agent-one',
    routeGeneration: 7,
    deployment: 'qualification',
    environment: 'nonproduction',
    workerScript: 'tdev-d0039-r4-qualification',
    className: 'AgentDeliveryRuntimeDO',
    namespace: 'tdev-d0039-r4-qualification_AgentDeliveryRuntimeDO',
    jurisdiction: 'global',
    durableObjectId: 'do-agent-one',
  };
  const routeCurrentTupleDigest = digest('c');
  const runtimeFacts = {
    sourceSha: '1234567890abcdef1234567890abcdef12345678',
    artifactDigest: digest('a'),
    artifactManifestDigest: digest('b'),
    workerVersionId: 'worker-v1',
    accountId: 'account-one',
    serviceName: routeBinding.workerScript,
    deployment: routeBinding.deployment,
    environment: routeBinding.environment,
    deploymentEpoch: 'epoch-one',
    stateChangingTrafficPercentage: 100,
    qualificationEndpointOrigin: 'https://tdev-d0039-r4-qualification.humtr.workers.dev',
    ingressKind: 'workers_dev',
    workersDevAccountSubdomain: 'humtr',
    workersDevHostname: 'tdev-d0039-r4-qualification.humtr.workers.dev',
    workersDevEnabled: true,
    workersDevPreviewsEnabled: false,
    workerScript: routeBinding.workerScript,
    namespaceId: 'namespace-one',
    namespace: routeBinding.namespace,
    className: routeBinding.className,
    jurisdiction: routeBinding.jurisdiction,
    durableObjectId: routeBinding.durableObjectId,
    routeCurrentTupleDigest,
    routeVerifierDigest: qualificationRouteVerifierDigest({
      currentTupleDigest: routeCurrentTupleDigest,
      managementKeyId: 'management-key',
      releaseRootKeyId: 'release-key',
      currentCredentialKeyId: 'credential-key',
    }),
  };
  return { routeBinding, runtimeFacts };
}

test('Revision-4 deployment identity binds exact workers.dev ingress and uses deployment profile v2', () => {
  const { routeBinding, runtimeFacts } = fixture();
  const identity = createQualificationDeploymentIdentity({ runtimeFacts, routeBinding });
  assert.equal(identity.profile, QUALIFICATION_DEPLOYMENT_PROFILE);
  assert.equal(identity.ingressKind, 'workers_dev');
  assert.equal(identity.workersDevHostname, 'tdev-d0039-r4-qualification.humtr.workers.dev');
  assert.equal(identity.workersDevPreviewsEnabled, false);
  assert.match(qualificationDeploymentIdentityDigest(identity), /^sha256:[0-9a-f]{64}$/);
});

test('Revision-4 deployment binding plan derives exact hostname and disables preview ingress', () => {
  const { runtimeFacts } = fixture();
  const plan = createQualificationDeploymentBindingPlan({
    sourceSha: runtimeFacts.sourceSha,
    artifactDigest: runtimeFacts.artifactDigest,
    artifactManifestDigest: runtimeFacts.artifactManifestDigest,
    accountId: runtimeFacts.accountId,
    serviceName: runtimeFacts.serviceName,
    deploymentEpoch: runtimeFacts.deploymentEpoch,
    qualificationEndpointOrigin: runtimeFacts.qualificationEndpointOrigin,
    workersDevAccountSubdomain: runtimeFacts.workersDevAccountSubdomain,
    namespaceId: runtimeFacts.namespaceId,
  });
  assert.equal(plan.workersDevHostname, runtimeFacts.workersDevHostname);
  assert.equal(plan.values.TDEV_D0039_INGRESS_KIND, 'workers_dev');
  assert.equal(plan.values.TDEV_D0039_WORKERS_DEV_ENABLED, 'true');
  assert.equal(plan.values.TDEV_D0039_WORKERS_DEV_PREVIEWS_ENABLED, 'false');
  assert.equal(Object.hasOwn(plan.values, 'TDEV_D0039_ROUTE_ID'), false);
  assert.equal(Object.hasOwn(plan.values, 'TDEV_D0039_ROUTE_PATTERN'), false);
});

test('Revision-4 identity rejects alternate hostname, workers.dev disabled, or preview URLs enabled', () => {
  const { routeBinding, runtimeFacts } = fixture();
  for (const drift of [
    { workersDevHostname: 'other.humtr.workers.dev' },
    { workersDevEnabled: false },
    { workersDevPreviewsEnabled: true },
    { qualificationEndpointOrigin: 'https://other.humtr.workers.dev' },
  ]) {
    assert.throws(
      () => createQualificationDeploymentIdentity({ runtimeFacts: { ...runtimeFacts, ...drift }, routeBinding }),
      (error) => error?.code === 'invalid_qualification_identity',
    );
  }
});

test('Revision-4 normalization rejects unknown legacy Zone route fields', () => {
  const { routeBinding, runtimeFacts } = fixture();
  const identity = createQualificationDeploymentIdentity({ runtimeFacts, routeBinding });
  assert.throws(
    () => normalizeQualificationDeploymentIdentity({ ...identity, routeId: 'legacy-route' }),
    (error) => error?.code === 'unexpected_keys',
  );
});


test('Revision-4 binding rejects workers.dev-incompatible Worker DNS labels', () => {
  const { runtimeFacts } = fixture();
  for (const serviceName of ['-bad-worker', 'bad-worker-', 'a'.repeat(64)]) {
    assert.throws(() => createQualificationDeploymentBindingPlan({
      sourceSha: runtimeFacts.sourceSha, artifactDigest: runtimeFacts.artifactDigest,
      artifactManifestDigest: runtimeFacts.artifactManifestDigest, accountId: runtimeFacts.accountId,
      serviceName, deploymentEpoch: runtimeFacts.deploymentEpoch,
      qualificationEndpointOrigin: `https://${serviceName}.humtr.workers.dev`,
      workersDevAccountSubdomain: 'humtr', namespaceId: runtimeFacts.namespaceId,
    }), (error) => error?.code === 'invalid_qualification_identity');
  }
});
