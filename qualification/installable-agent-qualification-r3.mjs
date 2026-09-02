import {
  ContractError,
  assertDigest,
  assertIdentifier,
  assertRecordShape,
  assertSafeInteger,
  compareText,
  publicJsonClone,
  typedDigest,
} from '../src/canonical.mjs';

export const QUALIFICATION_DEPLOYMENT_PROFILE = 'tdev.installable-agent-qualification-deployment.v1';
export const QUALIFICATION_EVIDENCE_PROFILE = 'tdev.installable-agent-qualification-evidence.v2';
export const QUALIFICATION_RPC_PROFILE = 'tdev.installable-agent-qualification-rpc.v2';
export const QUALIFICATION_RUN_PROFILE = 'tdev.installable-agent-qualification-run.v1';
export const QUALIFICATION_CLAIM_PROFILE = 'tdev.installable-agent-qualification-claim.v1';
export const QUALIFICATION_GLOBAL_MUTATION_RESOURCE = 'qualification-mutation-lane';
export const QUALIFICATION_GLOBAL_MUTATION_RESOURCE_TYPE = 'qualification_lane';
export const QUALIFICATION_ROUTE_VERIFIER_PROFILE = 'tdev.installable-agent-qualification-route-verifier.v1';

export const READ_ONLY_QUALIFICATION_OPERATIONS = Object.freeze(new Set([
  'runtime_probe',
  'd0040_evidence_attestor_readback',
  'd0039_workers_crypto_probe',
  'd0039_security_readback',
  'read_installable_agent',
  'read_route_generation',
  'read',
]));

const REQUIRED_GATE_PRINCIPALS = Object.freeze({
  q2_workers_crypto: Object.freeze(['provider_control_plane', 'route_owner_runtime']),
  q3_physical_android_termux: Object.freeze(['physical_device_observer', 'application_source_lineage', 'route_current_credential']),
  q4_fresh_bootstrap: Object.freeze(['operator_digest_channel', 'executor_runtime_observer']),
  q5_live_provider_iam: Object.freeze(['iam_control_plane', 'provider_control_plane', 'route_owner_runtime']),
  q6_live_migration: Object.freeze(['management_signer', 'provider_control_plane', 'route_owner_runtime']),
  q7_management_loss_compromise: Object.freeze(['management_signer', 'provider_control_plane', 'route_owner_runtime']),
  q8_release_lifecycle: Object.freeze(['provider_control_plane', 'release_signer', 'route_owner_runtime']),
  q9_rollback_provider_loss_retention: Object.freeze(['provider_control_plane', 'route_owner_runtime']),
  q10_deployed_composition: Object.freeze(['physical_device_observer', 'provider_control_plane', 'qualification_controller', 'route_owner_runtime']),
});

function boundedString(value, label, max = 256) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || value.includes('\0')) {
    throw new ContractError('invalid_qualification_identity', `${label} is invalid`);
  }
  return value;
}

function assertSha40(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/.test(value)) {
    throw new ContractError('invalid_qualification_identity', `${label} must be a lowercase 40-hex Git SHA`);
  }
  return value;
}

function sortedUniqueStrings(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length === 0 || item.includes('\0'))) {
    throw new ContractError('invalid_qualification_evidence', `${label} must be an array of non-empty strings`);
  }
  const sorted = [...value].sort(compareText);
  if (sorted.some((item, index) => item !== value[index]) || new Set(value).size !== value.length) {
    throw new ContractError('invalid_qualification_evidence', `${label} must be sorted and unique`);
  }
  return value;
}

export function normalizeQualificationDeploymentIdentity(value) {
  assertRecordShape(value, [
    'profile',
    'sourceSha',
    'artifactDigest',
    'artifactManifestDigest',
    'workerVersionId',
    'accountId',
    'serviceName',
    'deployment',
    'environment',
    'deploymentEpoch',
    'stateChangingTrafficPercentage',
    'qualificationEndpointOrigin',
    'routeId',
    'routePattern',
    'workerScript',
    'namespaceId',
    'namespace',
    'className',
    'jurisdiction',
    'agentId',
    'routeGeneration',
    'durableObjectId',
    'routeCurrentTupleDigest',
    'routeVerifierDigest',
  ], [], 'Revision-3 qualification deployment identity');
  if (value.profile !== QUALIFICATION_DEPLOYMENT_PROFILE) {
    throw new ContractError('invalid_qualification_identity', 'Unsupported Revision-3 deployment identity profile');
  }
  assertSha40(value.sourceSha, 'sourceSha');
  assertDigest(value.artifactDigest, 'artifactDigest');
  assertDigest(value.artifactManifestDigest, 'artifactManifestDigest');
  boundedString(value.workerVersionId, 'workerVersionId');
  boundedString(value.accountId, 'accountId');
  boundedString(value.serviceName, 'serviceName');
  boundedString(value.deployment, 'deployment');
  boundedString(value.environment, 'environment');
  boundedString(value.deploymentEpoch, 'deploymentEpoch');
  if (value.stateChangingTrafficPercentage !== 100) {
    throw new ContractError('invalid_qualification_identity', 'stateChangingTrafficPercentage must be exactly 100');
  }
  let endpoint;
  try { endpoint = new URL(value.qualificationEndpointOrigin); }
  catch (cause) { throw new ContractError('invalid_qualification_identity', 'qualificationEndpointOrigin is invalid', {}, { cause }); }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash || endpoint.origin !== value.qualificationEndpointOrigin) {
    throw new ContractError('invalid_qualification_identity', 'qualificationEndpointOrigin must be a credential-free HTTPS origin');
  }
  boundedString(value.routeId, 'routeId');
  boundedString(value.routePattern, 'routePattern', 2048);
  boundedString(value.workerScript, 'workerScript');
  boundedString(value.namespaceId, 'namespaceId');
  boundedString(value.namespace, 'namespace');
  boundedString(value.className, 'className');
  boundedString(value.jurisdiction, 'jurisdiction');
  assertIdentifier(value.agentId, 'agentId');
  assertSafeInteger(value.routeGeneration, 'routeGeneration', { min: 1 });
  boundedString(value.durableObjectId, 'durableObjectId', 2048);
  assertDigest(value.routeCurrentTupleDigest, 'routeCurrentTupleDigest');
  assertDigest(value.routeVerifierDigest, 'routeVerifierDigest');
  return Object.freeze(publicJsonClone(value));
}

export function qualificationDeploymentIdentityDigest(value) {
  return typedDigest(QUALIFICATION_DEPLOYMENT_PROFILE, normalizeQualificationDeploymentIdentity(value));
}

export function createQualificationDeploymentIdentity({ runtimeFacts, routeBinding }) {
  assertRecordShape(runtimeFacts, [
    'sourceSha', 'artifactDigest', 'artifactManifestDigest', 'workerVersionId', 'accountId', 'serviceName',
    'deployment', 'environment', 'deploymentEpoch', 'stateChangingTrafficPercentage', 'qualificationEndpointOrigin',
    'routeId', 'routePattern', 'workerScript', 'namespaceId', 'namespace', 'className', 'jurisdiction',
    'durableObjectId', 'routeCurrentTupleDigest', 'routeVerifierDigest',
  ], ['routeBinding'], 'Revision-3 runtime facts');
  const routeBindingKeys = [
    'agentId', 'routeGeneration', 'deployment', 'environment', 'workerScript', 'className', 'namespace', 'jurisdiction', 'durableObjectId',
  ];
  assertRecordShape(routeBinding, routeBindingKeys, [], 'Revision-3 route binding');
  for (const key of ['deployment', 'environment', 'workerScript', 'className', 'namespace', 'jurisdiction', 'durableObjectId']) {
    if (runtimeFacts[key] !== routeBinding[key]) {
      throw new ContractError('qualification_runtime_identity_mismatch', `Runtime and route binding disagree on ${key}`);
    }
  }
  if (runtimeFacts.routeBinding !== undefined) {
    assertRecordShape(runtimeFacts.routeBinding, routeBindingKeys, [], 'runtimeFacts.routeBinding');
    for (const key of routeBindingKeys) {
      if (runtimeFacts.routeBinding[key] !== routeBinding[key]) {
        throw new ContractError('qualification_runtime_identity_mismatch', `Runtime route binding disagrees with admitted route binding on ${key}`);
      }
    }
  }
  return normalizeQualificationDeploymentIdentity({
    profile: QUALIFICATION_DEPLOYMENT_PROFILE,
    sourceSha: runtimeFacts.sourceSha,
    artifactDigest: runtimeFacts.artifactDigest,
    artifactManifestDigest: runtimeFacts.artifactManifestDigest,
    workerVersionId: runtimeFacts.workerVersionId,
    accountId: runtimeFacts.accountId,
    serviceName: runtimeFacts.serviceName,
    deployment: runtimeFacts.deployment,
    environment: runtimeFacts.environment,
    deploymentEpoch: runtimeFacts.deploymentEpoch,
    stateChangingTrafficPercentage: runtimeFacts.stateChangingTrafficPercentage,
    qualificationEndpointOrigin: runtimeFacts.qualificationEndpointOrigin,
    routeId: runtimeFacts.routeId,
    routePattern: runtimeFacts.routePattern,
    workerScript: runtimeFacts.workerScript,
    namespaceId: runtimeFacts.namespaceId,
    namespace: runtimeFacts.namespace,
    className: runtimeFacts.className,
    jurisdiction: runtimeFacts.jurisdiction,
    agentId: routeBinding.agentId,
    routeGeneration: routeBinding.routeGeneration,
    durableObjectId: routeBinding.durableObjectId,
    routeCurrentTupleDigest: runtimeFacts.routeCurrentTupleDigest,
    routeVerifierDigest: runtimeFacts.routeVerifierDigest,
  });
}

export function assertExpectedDeploymentIdentity({ expectedDeploymentIdentityDigest, runtimeFacts, routeBinding }) {
  assertDigest(expectedDeploymentIdentityDigest, 'expectedDeploymentIdentityDigest');
  const identity = createQualificationDeploymentIdentity({ runtimeFacts, routeBinding });
  const actualDeploymentIdentityDigest = qualificationDeploymentIdentityDigest(identity);
  if (actualDeploymentIdentityDigest !== expectedDeploymentIdentityDigest) {
    throw new ContractError('qualification_runtime_identity_mismatch', 'Revision-3 runtime identity does not match the admitted S/A/V/R target', {
      expectedDeploymentIdentityDigest,
      actualDeploymentIdentityDigest,
    });
  }
  return Object.freeze({ identity, digest: actualDeploymentIdentityDigest });
}

export function createQualificationDeploymentBindingPlan({
  sourceSha,
  artifactDigest,
  artifactManifestDigest,
  accountId,
  serviceName,
  deploymentEpoch,
  qualificationEndpointOrigin,
  routeId,
  routePattern,
  namespaceId,
}) {
  assertSha40(sourceSha, 'sourceSha');
  assertDigest(artifactDigest, 'artifactDigest');
  assertDigest(artifactManifestDigest, 'artifactManifestDigest');
  boundedString(accountId, 'accountId');
  boundedString(serviceName, 'serviceName');
  boundedString(deploymentEpoch, 'deploymentEpoch');
  let endpoint;
  try { endpoint = new URL(qualificationEndpointOrigin); }
  catch (cause) { throw new ContractError('invalid_qualification_identity', 'qualificationEndpointOrigin is invalid', {}, { cause }); }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash || endpoint.origin !== qualificationEndpointOrigin) {
    throw new ContractError('invalid_qualification_identity', 'qualificationEndpointOrigin must be a credential-free HTTPS origin');
  }
  boundedString(routeId, 'routeId');
  boundedString(routePattern, 'routePattern', 2048);
  boundedString(namespaceId, 'namespaceId');
  const values = {
    TDEV_D0039_ACCOUNT_ID: accountId,
    TDEV_D0039_ARTIFACT_DIGEST: artifactDigest,
    TDEV_D0039_ARTIFACT_MANIFEST_DIGEST: artifactManifestDigest,
    TDEV_D0039_DEPLOYMENT_EPOCH: deploymentEpoch,
    TDEV_D0039_NAMESPACE_ID: namespaceId,
    TDEV_D0039_QUALIFICATION_ENDPOINT_ORIGIN: qualificationEndpointOrigin,
    TDEV_D0039_ROUTE_ID: routeId,
    TDEV_D0039_ROUTE_PATTERN: routePattern,
    TDEV_D0039_SERVICE_NAME: serviceName,
    TDEV_D0039_STATE_CHANGING_TRAFFIC_PERCENTAGE: '100',
    TDEV_SOURCE_SHA: sourceSha,
  };
  return Object.freeze({
    values: Object.freeze({ ...values }),
    cloudflarePlainTextBindings: Object.freeze(Object.entries(values)
      .sort(([left], [right]) => compareText(left, right))
      .map(([name, text]) => Object.freeze({ name, type: 'plain_text', text }))),
  });
}

export function qualificationRouteVerifierDigest({ currentTupleDigest, managementKeyId, releaseRootKeyId, currentCredentialKeyId }) {
  assertDigest(currentTupleDigest, 'currentTupleDigest');
  for (const [label, value] of Object.entries({ managementKeyId, releaseRootKeyId, currentCredentialKeyId })) {
    if (value !== null) boundedString(value, label, 512);
  }
  return typedDigest(QUALIFICATION_ROUTE_VERIFIER_PROFILE, {
    currentCredentialKeyId,
    currentTupleDigest,
    managementKeyId,
    releaseRootKeyId,
  });
}
export function resourceClaimKey(resourceType, resourceIdentity) {
  boundedString(resourceType, 'resourceType', 128);
  boundedString(resourceIdentity, 'resourceIdentity', 2048);
  return typedDigest(QUALIFICATION_CLAIM_PROFILE, { resourceIdentity, resourceType });
}

export function validateTerminalQualificationEvidence(value, { expectedGate, expectedDeploymentIdentityDigest } = {}) {
  assertRecordShape(value, [
    'schemaVersion', 'profile', 'qualificationRunId', 'runGeneration', 'gate', 'target',
    'targetDigest', 'deploymentIdentityDigest', 'principalObservations', 'readSet', 'writeSet',
    'invalidationSet', 'secretValues',
  ], [], 'Revision-3 qualification evidence');
  if (value.schemaVersion !== 2 || value.profile !== QUALIFICATION_EVIDENCE_PROFILE || value.secretValues !== 'excluded') {
    throw new ContractError('invalid_qualification_evidence', 'Revision-3 terminal evidence identity is invalid');
  }
  assertIdentifier(value.qualificationRunId, 'qualificationRunId');
  assertSafeInteger(value.runGeneration, 'runGeneration', { min: 1 });
  const requiredPrincipals = REQUIRED_GATE_PRINCIPALS[value.gate];
  if (requiredPrincipals === undefined) {
    throw new ContractError('qualification_gate_unknown', 'Unknown Revision-3 qualification gate', { gate: value.gate });
  }
  if (expectedGate !== undefined && value.gate !== expectedGate) {
    throw new ContractError('qualification_evidence_target_mismatch', 'Qualification gate mismatch');
  }
  const target = normalizeQualificationDeploymentIdentity(value.target);
  const actualDeploymentIdentityDigest = qualificationDeploymentIdentityDigest(target);
  assertDigest(value.targetDigest, 'targetDigest');
  assertDigest(value.deploymentIdentityDigest, 'deploymentIdentityDigest');
  if (value.targetDigest !== actualDeploymentIdentityDigest || value.deploymentIdentityDigest !== actualDeploymentIdentityDigest) {
    throw new ContractError('qualification_evidence_target_mismatch', 'Evidence target digest is not the exact S/A/V/R deployment identity');
  }
  if (expectedDeploymentIdentityDigest !== undefined && actualDeploymentIdentityDigest !== expectedDeploymentIdentityDigest) {
    throw new ContractError('qualification_evidence_target_mismatch', 'Evidence does not bind the expected deployment identity');
  }
  if (!Array.isArray(value.principalObservations) || value.principalObservations.length < 2) {
    throw new ContractError('qualification_evidence_authenticator_missing', 'Terminal evidence requires independent direct principal observations');
  }
  const seen = new Set();
  for (const [index, observation] of value.principalObservations.entries()) {
    assertRecordShape(observation, ['principal', 'identityDigest', 'freshnessDigest', 'evidenceDigest'], [], `principalObservations[${index}]`);
    boundedString(observation.principal, `principalObservations[${index}].principal`, 128);
    assertDigest(observation.identityDigest, `principalObservations[${index}].identityDigest`);
    assertDigest(observation.freshnessDigest, `principalObservations[${index}].freshnessDigest`);
    assertDigest(observation.evidenceDigest, `principalObservations[${index}].evidenceDigest`);
    if (seen.has(observation.principal)) {
      throw new ContractError('invalid_qualification_evidence', 'Duplicate qualification principal observation');
    }
    seen.add(observation.principal);
  }
  for (const principal of requiredPrincipals) {
    if (!seen.has(principal)) {
      throw new ContractError('qualification_evidence_authenticator_missing', `Missing required ${principal} observation`, { gate: value.gate, principal });
    }
  }
  sortedUniqueStrings(value.readSet, 'readSet');
  sortedUniqueStrings(value.writeSet, 'writeSet');
  sortedUniqueStrings(value.invalidationSet, 'invalidationSet');
  return Object.freeze(publicJsonClone(value));
}

export function qualificationGateRequiredPrincipals(gate) {
  const principals = REQUIRED_GATE_PRINCIPALS[gate];
  if (principals === undefined) throw new ContractError('qualification_gate_unknown', 'Unknown Revision-3 qualification gate', { gate });
  return principals;
}
