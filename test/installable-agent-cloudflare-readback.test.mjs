import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createQualificationDeploymentBindingPlan,
  QUALIFICATION_DEPLOYMENT_PROFILE,
  qualificationDeploymentIdentityDigest,
  qualificationRouteVerifierDigest,
} from '../qualification/installable-agent-qualification-r4.mjs';
import {
  normalizeD0039WorkersDevIngress,
  validateD0039CloudflareIdentityJoin,
  validateD0039CloudflareRouteBootstrapJoin,
} from '../qualification/installable-agent-cloudflare-readback.mjs';
import { qualificationRouteAuthoritativeReadbackDigest } from '../qualification/installable-agent-qualification-r8.mjs';

const digest = (character) => `sha256:${character.repeat(64)}`;

function fixture() {
  const options = {
    account_id: 'account-one',
    script_name: 'tdev-d0039-r4-qualification',
    namespace_name: 'tdev-d0039-r4-qualification_AgentDeliveryRuntimeDO',
    class_name: 'AgentDeliveryRuntimeDO',
    agent_id: 'agent-one',
    route_generation: 7,
    expected_source_sha: '1234567890abcdef1234567890abcdef12345678',
    expected_artifact_digest: digest('a'),
    expected_artifact_manifest_digest: digest('b'),
    expected_deployment_epoch: 'epoch-one',
    expected_deployment: 'qualification',
    expected_environment: 'nonproduction',
    expected_jurisdiction: 'global',
  };
  const activeVersionId = 'worker-v1';
  const namespace = { id: 'namespace-one', name: options.namespace_name, class: options.class_name, script: options.script_name };
  const workersDev = normalizeD0039WorkersDevIngress({
    scriptName: options.script_name,
    accountSubdomainResult: { subdomain: 'humtr' },
    workerSubdomainResult: { enabled: true, previews_enabled: false },
  });
  const routeCurrentTupleDigest = digest('c');
  const routeVerifierDigest = qualificationRouteVerifierDigest({
    currentTupleDigest: routeCurrentTupleDigest,
    managementKeyId: 'management-key',
    releaseRootKeyId: 'release-key',
    currentCredentialKeyId: 'credential-key',
  });
  const identity = {
    profile: QUALIFICATION_DEPLOYMENT_PROFILE,
    sourceSha: options.expected_source_sha,
    artifactDigest: options.expected_artifact_digest,
    artifactManifestDigest: options.expected_artifact_manifest_digest,
    workerVersionId: activeVersionId,
    accountId: options.account_id,
    serviceName: options.script_name,
    deployment: options.expected_deployment,
    environment: options.expected_environment,
    deploymentEpoch: options.expected_deployment_epoch,
    stateChangingTrafficPercentage: 100,
    qualificationEndpointOrigin: workersDev.origin,
    ingressKind: 'workers_dev',
    workersDevAccountSubdomain: workersDev.accountSubdomain,
    workersDevHostname: workersDev.hostname,
    workersDevEnabled: true,
    workersDevPreviewsEnabled: false,
    workerScript: options.script_name,
    namespaceId: namespace.id,
    namespace: options.namespace_name,
    className: options.class_name,
    jurisdiction: options.expected_jurisdiction,
    agentId: options.agent_id,
    routeGeneration: options.route_generation,
    durableObjectId: 'do-agent-one',
    routeCurrentTupleDigest,
    routeVerifierDigest,
  };
  const owner = {
    deploymentIdentity: identity,
    deploymentIdentityDigest: qualificationDeploymentIdentityDigest(identity),
    runtime: {
      sourceSha: identity.sourceSha,
      workerVersionId: identity.workerVersionId,
      qualificationEndpointOrigin: identity.qualificationEndpointOrigin,
      workersDevHostname: identity.workersDevHostname,
      routeCurrentTupleDigest,
      routeVerifierDigest,
      routeBinding: {
        agentId: identity.agentId,
        routeGeneration: identity.routeGeneration,
        deployment: identity.deployment,
        environment: identity.environment,
        workerScript: identity.workerScript,
        className: identity.className,
        namespace: identity.namespace,
        jurisdiction: identity.jurisdiction,
        durableObjectId: identity.durableObjectId,
      },
    },
  };
  const plan = createQualificationDeploymentBindingPlan({
    sourceSha: options.expected_source_sha,
    artifactDigest: options.expected_artifact_digest,
    artifactManifestDigest: options.expected_artifact_manifest_digest,
    accountId: options.account_id,
    serviceName: options.script_name,
    deploymentEpoch: options.expected_deployment_epoch,
    qualificationEndpointOrigin: workersDev.origin,
    workersDevAccountSubdomain: workersDev.accountSubdomain,
    namespaceId: namespace.id,
  });
  const providerBindings = [
    ...plan.cloudflarePlainTextBindings,
    { name: 'TDEV_AGENT_DELIVERY', type: 'durable_object_namespace', namespace_id: namespace.id, class_name: options.class_name, script_name: options.script_name },
  ];
  return { options, activeVersionId, namespace, workersDev, owner, providerBindings };
}

function unregisteredFixture() {
  const value = fixture();
  const routeRead = {
    installableAgent: {
      state: 'UNREGISTERED',
      managementKeyId: 'management-key',
      releaseRootKeyId: 'release-key',
      currentCredentialKeyId: null,
      managementRequestSequenceHighWater: 1,
    },
    predecessorDigest: digest('d'),
    currentTuple: null,
    currentTupleDigest: null,
  };
  const routeBinding = { agentId: value.options.agent_id, routeGeneration: value.options.route_generation };
  const routeAuthoritativeRereadDigest = qualificationRouteAuthoritativeReadbackDigest({ routeBinding, routeRead });
  return {
    ...value,
    owner: {
      first: routeRead,
      second: structuredClone(routeRead),
      routeAuthoritativeRereadDigest,
    },
  };
}

test('R8 pre-CURRENT cross-read joins exact provider bindings with a stable UNREGISTERED route-owner reread', () => {
  const value = unregisteredFixture();
  const joined = validateD0039CloudflareRouteBootstrapJoin(value);
  assert.equal(joined.twoReadsStable, true);
  assert.equal(joined.routeRead.currentTuple, null);
  assert.equal(joined.routeRead.currentTupleDigest, null);
  assert.equal(joined.routeAuthoritativeRereadDigest, value.owner.routeAuthoritativeRereadDigest);
});

test('R8 pre-CURRENT cross-read rejects route-owner drift and non-null CURRENT identity', () => {
  const drift = unregisteredFixture();
  drift.owner.second.installableAgent.managementRequestSequenceHighWater = 2;
  assert.throws(
    () => validateD0039CloudflareRouteBootstrapJoin(drift),
    (error) => error?.code === 'cloudflare_route_owner_readback_unstable',
  );

  const current = unregisteredFixture();
  current.owner.first.currentTuple = { profile: 'unexpected-current' };
  current.owner.first.currentTupleDigest = digest('e');
  assert.throws(
    () => validateD0039CloudflareRouteBootstrapJoin(current),
    (error) => error?.code === 'qualification_route_bootstrap_predecessor_invalid',
  );
});

test('Q5 cross-read joins exact provider bindings, Worker version, workers.dev ingress and route-owner S/A/V/R identity', () => {
  const value = fixture();
  const joined = validateD0039CloudflareIdentityJoin(value);
  assert.equal(joined.digest, value.owner.deploymentIdentityDigest);
});

test('Q5 cross-read rejects provider version or immutable binding drift', () => {
  const versionDrift = fixture();
  assert.throws(
    () => validateD0039CloudflareIdentityJoin({ ...versionDrift, activeVersionId: 'worker-v2' }),
    (error) => error?.code === 'cloudflare_readback_route_owner_mismatch',
  );

  const bindingDrift = fixture();
  bindingDrift.providerBindings = bindingDrift.providerBindings.map((binding) =>
    binding.name === 'TDEV_D0039_DEPLOYMENT_EPOCH' ? { ...binding, text: 'epoch-two' } : binding);
  assert.throws(
    () => validateD0039CloudflareIdentityJoin(bindingDrift),
    (error) => error?.code === 'cloudflare_readback_runtime_binding_invalid',
  );
});

test('Q5 workers.dev ingress rejects preview URLs or disabled ingress', () => {
  assert.throws(
    () => normalizeD0039WorkersDevIngress({
      scriptName: 'tdev-d0039-r4-qualification',
      accountSubdomainResult: { subdomain: 'humtr' },
      workerSubdomainResult: { enabled: true, previews_enabled: true },
    }),
    (error) => error?.code === 'cloudflare_readback_workers_dev_invalid',
  );
  assert.throws(
    () => normalizeD0039WorkersDevIngress({
      scriptName: 'tdev-d0039-r4-qualification',
      accountSubdomainResult: { subdomain: 'humtr' },
      workerSubdomainResult: { enabled: false, previews_enabled: false },
    }),
    (error) => error?.code === 'cloudflare_readback_workers_dev_invalid',
  );
});


test('Q5 workers.dev ingress rejects invalid Worker DNS labels', () => {
  for (const scriptName of ['-bad-worker', 'bad-worker-', 'a'.repeat(64)]) {
    assert.throws(() => normalizeD0039WorkersDevIngress({
      scriptName, accountSubdomainResult: { subdomain: 'humtr' },
      workerSubdomainResult: { enabled: true, previews_enabled: false },
    }), (error) => error?.code === 'cloudflare_readback_workers_dev_invalid');
  }
});
