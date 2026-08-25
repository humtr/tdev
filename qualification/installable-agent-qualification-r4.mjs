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
import {
  QUALIFICATION_CLAIM_PROFILE,
  QUALIFICATION_EVIDENCE_PROFILE,
  QUALIFICATION_GLOBAL_MUTATION_RESOURCE,
  QUALIFICATION_GLOBAL_MUTATION_RESOURCE_TYPE,
  QUALIFICATION_ROUTE_VERIFIER_PROFILE,
  QUALIFICATION_RPC_PROFILE,
  QUALIFICATION_RUN_PROFILE,
  READ_ONLY_QUALIFICATION_OPERATIONS,
  qualificationGateRequiredPrincipals,
  qualificationRouteVerifierDigest,
  resourceClaimKey,
} from './installable-agent-qualification-r3.mjs';

export {
  QUALIFICATION_CLAIM_PROFILE,
  QUALIFICATION_EVIDENCE_PROFILE,
  QUALIFICATION_GLOBAL_MUTATION_RESOURCE,
  QUALIFICATION_GLOBAL_MUTATION_RESOURCE_TYPE,
  QUALIFICATION_ROUTE_VERIFIER_PROFILE,
  QUALIFICATION_RPC_PROFILE,
  QUALIFICATION_RUN_PROFILE,
  READ_ONLY_QUALIFICATION_OPERATIONS,
  qualificationGateRequiredPrincipals,
  qualificationRouteVerifierDigest,
  resourceClaimKey,
};

export const QUALIFICATION_DEPLOYMENT_PROFILE = 'tdev.installable-agent-qualification-deployment.v2';
export const QUALIFICATION_INGRESS_KIND = 'workers_dev';

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

function assertWorkersDevAccountSubdomain(value) {
  boundedString(value, 'workersDevAccountSubdomain', 63);
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value)) {
    throw new ContractError('invalid_qualification_identity', 'workersDevAccountSubdomain must be one lowercase DNS label');
  }
  return value;
}

function expectedWorkersDevHostname(workerScript, accountSubdomain) {
  boundedString(workerScript, 'workerScript', 63);
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(workerScript)) {
    throw new ContractError('invalid_qualification_identity', 'workerScript must be one workers.dev-compatible DNS label');
  }
  assertWorkersDevAccountSubdomain(accountSubdomain);
  const hostname = `${workerScript}.${accountSubdomain}.workers.dev`;
  if (hostname.length > 253 || !/^[a-z0-9.-]+$/.test(hostname)) {
    throw new ContractError('invalid_qualification_identity', 'workersDevHostname is not a bounded lowercase DNS hostname');
  }
  return hostname;
}

function assertExactWorkersDevOrigin(value, expectedHostname) {
  let endpoint;
  try { endpoint = new URL(value); }
  catch (cause) { throw new ContractError('invalid_qualification_identity', 'qualificationEndpointOrigin is invalid', {}, { cause }); }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash ||
      endpoint.hostname !== expectedHostname || endpoint.origin !== value) {
    throw new ContractError('invalid_qualification_identity', 'qualificationEndpointOrigin must be the exact credential-free workers.dev HTTPS origin');
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
    'profile', 'sourceSha', 'artifactDigest', 'artifactManifestDigest', 'workerVersionId', 'accountId', 'serviceName',
    'deployment', 'environment', 'deploymentEpoch', 'stateChangingTrafficPercentage', 'qualificationEndpointOrigin',
    'ingressKind', 'workersDevAccountSubdomain', 'workersDevHostname', 'workersDevEnabled', 'workersDevPreviewsEnabled',
    'workerScript', 'namespaceId', 'namespace', 'className', 'jurisdiction', 'agentId', 'routeGeneration', 'durableObjectId',
    'routeCurrentTupleDigest', 'routeVerifierDigest',
  ], [], 'Revision-4 qualification deployment identity');
  if (value.profile !== QUALIFICATION_DEPLOYMENT_PROFILE) {
    throw new ContractError('invalid_qualification_identity', 'Unsupported Revision-4 deployment identity profile');
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
  if (value.ingressKind !== QUALIFICATION_INGRESS_KIND) {
    throw new ContractError('invalid_qualification_identity', 'Revision-4 ingressKind must be workers_dev');
  }
  const accountSubdomain = assertWorkersDevAccountSubdomain(value.workersDevAccountSubdomain);
  boundedString(value.workerScript, 'workerScript');
  if (value.serviceName !== value.workerScript) {
    throw new ContractError('invalid_qualification_identity', 'serviceName must equal workerScript');
  }
  const hostname = expectedWorkersDevHostname(value.workerScript, accountSubdomain);
  if (value.workersDevHostname !== hostname) {
    throw new ContractError('invalid_qualification_identity', 'workersDevHostname does not match the exact Worker/account subdomain identity');
  }
  if (value.workersDevEnabled !== true || value.workersDevPreviewsEnabled !== false) {
    throw new ContractError('invalid_qualification_identity', 'Revision-4 requires workers.dev enabled and preview URLs disabled');
  }
  assertExactWorkersDevOrigin(value.qualificationEndpointOrigin, hostname);
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
    'ingressKind', 'workersDevAccountSubdomain', 'workersDevHostname', 'workersDevEnabled', 'workersDevPreviewsEnabled',
    'workerScript', 'namespaceId', 'namespace', 'className', 'jurisdiction', 'durableObjectId',
    'routeCurrentTupleDigest', 'routeVerifierDigest',
  ], ['routeBinding'], 'Revision-4 runtime facts');
  const routeBindingKeys = [
    'agentId', 'routeGeneration', 'deployment', 'environment', 'workerScript', 'className', 'namespace', 'jurisdiction', 'durableObjectId',
  ];
  assertRecordShape(routeBinding, routeBindingKeys, [], 'Revision-4 route binding');
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
    ingressKind: runtimeFacts.ingressKind,
    workersDevAccountSubdomain: runtimeFacts.workersDevAccountSubdomain,
    workersDevHostname: runtimeFacts.workersDevHostname,
    workersDevEnabled: runtimeFacts.workersDevEnabled,
    workersDevPreviewsEnabled: runtimeFacts.workersDevPreviewsEnabled,
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
    throw new ContractError('qualification_runtime_identity_mismatch', 'Revision-4 runtime identity does not match the admitted S/A/V/R target', {
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
  workersDevAccountSubdomain,
  namespaceId,
}) {
  assertSha40(sourceSha, 'sourceSha');
  assertDigest(artifactDigest, 'artifactDigest');
  assertDigest(artifactManifestDigest, 'artifactManifestDigest');
  boundedString(accountId, 'accountId');
  boundedString(serviceName, 'serviceName');
  boundedString(deploymentEpoch, 'deploymentEpoch');
  const accountSubdomain = assertWorkersDevAccountSubdomain(workersDevAccountSubdomain);
  const workersDevHostname = expectedWorkersDevHostname(serviceName, accountSubdomain);
  assertExactWorkersDevOrigin(qualificationEndpointOrigin, workersDevHostname);
  boundedString(namespaceId, 'namespaceId');
  const values = {
    TDEV_D0039_ACCOUNT_ID: accountId,
    TDEV_D0039_ARTIFACT_DIGEST: artifactDigest,
    TDEV_D0039_ARTIFACT_MANIFEST_DIGEST: artifactManifestDigest,
    TDEV_D0039_DEPLOYMENT_EPOCH: deploymentEpoch,
    TDEV_D0039_INGRESS_KIND: QUALIFICATION_INGRESS_KIND,
    TDEV_D0039_NAMESPACE_ID: namespaceId,
    TDEV_D0039_QUALIFICATION_ENDPOINT_ORIGIN: qualificationEndpointOrigin,
    TDEV_D0039_SERVICE_NAME: serviceName,
    TDEV_D0039_STATE_CHANGING_TRAFFIC_PERCENTAGE: '100',
    TDEV_D0039_WORKERS_DEV_ACCOUNT_SUBDOMAIN: accountSubdomain,
    TDEV_D0039_WORKERS_DEV_ENABLED: 'true',
    TDEV_D0039_WORKERS_DEV_HOSTNAME: workersDevHostname,
    TDEV_D0039_WORKERS_DEV_PREVIEWS_ENABLED: 'false',
    TDEV_SOURCE_SHA: sourceSha,
  };
  return Object.freeze({
    workersDevHostname,
    values: Object.freeze({ ...values }),
    cloudflarePlainTextBindings: Object.freeze(Object.entries(values)
      .sort(([left], [right]) => compareText(left, right))
      .map(([name, text]) => Object.freeze({ name, type: 'plain_text', text }))),
  });
}

export function validateTerminalQualificationEvidence(value, { expectedGate, expectedDeploymentIdentityDigest } = {}) {
  assertRecordShape(value, [
    'schemaVersion', 'profile', 'qualificationRunId', 'runGeneration', 'gate', 'target',
    'targetDigest', 'deploymentIdentityDigest', 'principalObservations', 'readSet', 'writeSet',
    'invalidationSet', 'secretValues',
  ], [], 'Revision-4 qualification evidence');
  if (value.schemaVersion !== 2 || value.profile !== QUALIFICATION_EVIDENCE_PROFILE || value.secretValues !== 'excluded') {
    throw new ContractError('invalid_qualification_evidence', 'Revision-4 terminal evidence identity is invalid');
  }
  assertIdentifier(value.qualificationRunId, 'qualificationRunId');
  assertSafeInteger(value.runGeneration, 'runGeneration', { min: 1 });
  const requiredPrincipals = qualificationGateRequiredPrincipals(value.gate);
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
    if (seen.has(observation.principal)) throw new ContractError('invalid_qualification_evidence', 'Duplicate qualification principal observation');
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
