import {
  ContractError,
  assertDigest,
  assertRecordShape,
  typedDigest,
  publicJsonClone,
} from '../src/canonical.mjs';
import {
  QUALIFICATION_CLAIM_PROFILE,
  QUALIFICATION_DEPLOYMENT_PROFILE,
  QUALIFICATION_EVIDENCE_PROFILE,
  QUALIFICATION_GLOBAL_MUTATION_RESOURCE,
  QUALIFICATION_GLOBAL_MUTATION_RESOURCE_TYPE,
  QUALIFICATION_INGRESS_KIND,
  QUALIFICATION_ROUTE_VERIFIER_PROFILE,
  QUALIFICATION_RPC_PROFILE,
  READ_ONLY_QUALIFICATION_OPERATIONS,
  assertExpectedDeploymentIdentity,
  createQualificationDeploymentBindingPlan,
  createQualificationDeploymentIdentity,
  normalizeQualificationDeploymentIdentity,
  qualificationDeploymentIdentityDigest,
  qualificationGateRequiredPrincipals,
  qualificationRouteVerifierDigest,
  resourceClaimKey,
  validateTerminalQualificationEvidence,
} from './installable-agent-qualification-r4.mjs';

export {
  QUALIFICATION_CLAIM_PROFILE,
  QUALIFICATION_DEPLOYMENT_PROFILE,
  QUALIFICATION_EVIDENCE_PROFILE,
  QUALIFICATION_GLOBAL_MUTATION_RESOURCE,
  QUALIFICATION_GLOBAL_MUTATION_RESOURCE_TYPE,
  QUALIFICATION_INGRESS_KIND,
  QUALIFICATION_ROUTE_VERIFIER_PROFILE,
  QUALIFICATION_RPC_PROFILE,
  READ_ONLY_QUALIFICATION_OPERATIONS,
  assertExpectedDeploymentIdentity,
  createQualificationDeploymentBindingPlan,
  createQualificationDeploymentIdentity,
  normalizeQualificationDeploymentIdentity,
  qualificationDeploymentIdentityDigest,
  qualificationGateRequiredPrincipals,
  qualificationRouteVerifierDigest,
  resourceClaimKey,
  validateTerminalQualificationEvidence,
};

export const QUALIFICATION_RUN_PROFILE = 'tdev.installable-agent-qualification-run.v2';
export const QUALIFICATION_DEPLOYMENT_INTENT_PROFILE = 'tdev.installable-agent-qualification-deployment-intent.v1';
export const QUALIFICATION_TARGET_KIND_PROVIDER_DEPLOYMENT_INTENT = 'provider_deployment_intent';
export const QUALIFICATION_TARGET_KIND_ADMITTED_DEPLOYMENT = 'admitted_deployment';
export const QUALIFICATION_PROVIDER_DEPLOY_OPERATION = 'provider_deploy';

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

function assertDnsLabel(value, label) {
  boundedString(value, label, 63);
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value)) {
    throw new ContractError('invalid_qualification_identity', `${label} must be one lowercase DNS label`);
  }
  return value;
}

function expectedWorkersDevHostname(workerScript, accountSubdomain) {
  assertDnsLabel(workerScript, 'workerScript');
  assertDnsLabel(accountSubdomain, 'workersDevAccountSubdomain');
  const hostname = `${workerScript}.${accountSubdomain}.workers.dev`;
  if (hostname.length > 253) throw new ContractError('invalid_qualification_identity', 'workersDevHostname is too long');
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

export function normalizeQualificationDeploymentIntent(value) {
  assertRecordShape(value, [
    'profile', 'sourceSha', 'artifactDigest', 'artifactManifestDigest', 'accountId', 'serviceName',
    'deployment', 'environment', 'deploymentEpoch', 'qualificationEndpointOrigin', 'ingressKind',
    'workersDevAccountSubdomain', 'workersDevHostname', 'workersDevEnabled', 'workersDevPreviewsEnabled',
    'workerScript', 'namespaceId', 'namespace', 'className', 'jurisdiction', 'deploymentBindingDigest',
    'predecessorProviderStateDigest', 'authoritativeRereadDigest',
  ], [], 'Revision-5 qualification deployment intent');
  if (value.profile !== QUALIFICATION_DEPLOYMENT_INTENT_PROFILE) {
    throw new ContractError('invalid_qualification_identity', 'Unsupported Revision-5 deployment intent profile');
  }
  assertSha40(value.sourceSha, 'sourceSha');
  assertDigest(value.artifactDigest, 'artifactDigest');
  assertDigest(value.artifactManifestDigest, 'artifactManifestDigest');
  boundedString(value.accountId, 'accountId');
  boundedString(value.serviceName, 'serviceName');
  boundedString(value.deployment, 'deployment');
  boundedString(value.environment, 'environment');
  boundedString(value.deploymentEpoch, 'deploymentEpoch');
  if (value.ingressKind !== QUALIFICATION_INGRESS_KIND) {
    throw new ContractError('invalid_qualification_identity', 'Revision-5 deployment intent ingressKind must be workers_dev');
  }
  if (value.workersDevEnabled !== true || value.workersDevPreviewsEnabled !== false) {
    throw new ContractError('invalid_qualification_identity', 'Revision-5 deployment intent requires workers.dev enabled and preview URLs disabled');
  }
  if (value.serviceName !== value.workerScript) {
    throw new ContractError('invalid_qualification_identity', 'serviceName must equal workerScript');
  }
  const hostname = expectedWorkersDevHostname(value.workerScript, value.workersDevAccountSubdomain);
  if (value.workersDevHostname !== hostname) {
    throw new ContractError('invalid_qualification_identity', 'workersDevHostname does not match the exact Worker/account subdomain identity');
  }
  assertExactWorkersDevOrigin(value.qualificationEndpointOrigin, hostname);
  boundedString(value.namespaceId, 'namespaceId');
  boundedString(value.namespace, 'namespace');
  boundedString(value.className, 'className');
  boundedString(value.jurisdiction, 'jurisdiction');
  assertDigest(value.deploymentBindingDigest, 'deploymentBindingDigest');
  assertDigest(value.predecessorProviderStateDigest, 'predecessorProviderStateDigest');
  assertDigest(value.authoritativeRereadDigest, 'authoritativeRereadDigest');
  return Object.freeze(publicJsonClone(value));
}

export function qualificationDeploymentIntentDigest(value) {
  return typedDigest(QUALIFICATION_DEPLOYMENT_INTENT_PROFILE, normalizeQualificationDeploymentIntent(value));
}

export function createQualificationDeploymentIntent(value) {
  return normalizeQualificationDeploymentIntent({ profile: QUALIFICATION_DEPLOYMENT_INTENT_PROFILE, ...value });
}

export function normalizeQualificationRunTarget(targetKind, target) {
  if (targetKind === QUALIFICATION_TARGET_KIND_PROVIDER_DEPLOYMENT_INTENT) {
    return normalizeQualificationDeploymentIntent(target);
  }
  if (targetKind === QUALIFICATION_TARGET_KIND_ADMITTED_DEPLOYMENT) {
    return normalizeQualificationDeploymentIdentity(target);
  }
  throw new ContractError('invalid_qualification_target_kind', 'Unknown Revision-5 qualification target kind');
}

export function qualificationRunTargetDigest(targetKind, target) {
  if (targetKind === QUALIFICATION_TARGET_KIND_PROVIDER_DEPLOYMENT_INTENT) {
    return qualificationDeploymentIntentDigest(target);
  }
  if (targetKind === QUALIFICATION_TARGET_KIND_ADMITTED_DEPLOYMENT) {
    return qualificationDeploymentIdentityDigest(target);
  }
  throw new ContractError('invalid_qualification_target_kind', 'Unknown Revision-5 qualification target kind');
}

export function assertQualificationTargetForOperation({ targetKind, intendedOperation }) {
  boundedString(intendedOperation, 'intendedOperation', 256);
  if (intendedOperation === QUALIFICATION_PROVIDER_DEPLOY_OPERATION) {
    if (targetKind !== QUALIFICATION_TARGET_KIND_PROVIDER_DEPLOYMENT_INTENT) {
      throw new ContractError('qualification_target_kind_operation_mismatch', 'provider_deploy requires a provider_deployment_intent target');
    }
    return targetKind;
  }
  if (targetKind !== QUALIFICATION_TARGET_KIND_ADMITTED_DEPLOYMENT) {
    throw new ContractError('qualification_target_kind_operation_mismatch', 'Only provider_deploy may use a provider_deployment_intent target');
  }
  return targetKind;
}
