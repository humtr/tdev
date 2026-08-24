import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createQualificationDeploymentBindingPlan,
  QUALIFICATION_DEPLOYMENT_PROFILE,
  qualificationDeploymentIdentityDigest,
  qualificationRouteVerifierDigest,
} from '../qualification/installable-agent-qualification-r3.mjs';
import { validateD0039CloudflareIdentityJoin } from '../qualification/installable-agent-cloudflare-readback.mjs';

const digest = (character) => `sha256:${character.repeat(64)}`;

function fixture() {
  const options = {
    account_id: 'account-one',
    script_name: 'tdev-d0020-qualification',
    namespace_name: 'tdev-d0020-qualification_AgentDeliveryRuntimeDO',
    class_name: 'AgentDeliveryRuntimeDO',
    route_id: 'route-one',
    qualification_endpoint: new URL('https://qualification.example'),
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
  const route = { id: options.route_id, pattern: 'qualification.example/*', script: options.script_name };
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
    qualificationEndpointOrigin: options.qualification_endpoint.origin,
    routeId: options.route_id,
    routePattern: route.pattern,
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
    qualificationEndpointOrigin: options.qualification_endpoint.origin,
    routeId: options.route_id,
    routePattern: route.pattern,
    namespaceId: namespace.id,
  });
  const providerBindings = [
    ...plan.cloudflarePlainTextBindings,
    { name: 'TDEV_AGENT_DELIVERY', type: 'durable_object_namespace', namespace_id: namespace.id, class_name: options.class_name, script_name: options.script_name },
  ];
  return { options, activeVersionId, namespace, route, owner, providerBindings };
}

test('Q5 cross-read joins exact provider bindings, Worker version, route and route-owner S/A/V/R identity', () => {
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
