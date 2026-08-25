import {
  ContractError,
  assertDigest,
  assertIdentifier,
  assertRecordShape,
  assertSafeInteger,
  publicJsonClone,
  typedDigest,
} from '../src/canonical.mjs';
import {
  QUALIFICATION_CLAIM_PROFILE,
  QUALIFICATION_DEPLOYMENT_INTENT_PROFILE,
  QUALIFICATION_DEPLOYMENT_PROFILE,
  QUALIFICATION_EVIDENCE_PROFILE,
  QUALIFICATION_GLOBAL_MUTATION_RESOURCE,
  QUALIFICATION_GLOBAL_MUTATION_RESOURCE_TYPE,
  QUALIFICATION_INGRESS_KIND,
  QUALIFICATION_PROVIDER_DEPLOY_OPERATION,
  QUALIFICATION_ROUTE_VERIFIER_PROFILE,
  QUALIFICATION_RPC_PROFILE,
  QUALIFICATION_RUN_PROFILE as R5_QUALIFICATION_RUN_PROFILE,
  QUALIFICATION_TARGET_KIND_ADMITTED_DEPLOYMENT,
  QUALIFICATION_TARGET_KIND_PROVIDER_DEPLOYMENT_INTENT,
  READ_ONLY_QUALIFICATION_OPERATIONS,
  assertExpectedDeploymentIdentity,
  createQualificationDeploymentBindingPlan,
  createQualificationDeploymentIdentity,
  createQualificationDeploymentIntent,
  normalizeQualificationDeploymentIdentity,
  normalizeQualificationDeploymentIntent,
  qualificationDeploymentIdentityDigest,
  qualificationDeploymentIntentDigest,
  qualificationGateRequiredPrincipals,
  qualificationRouteVerifierDigest,
  resourceClaimKey,
  validateTerminalQualificationEvidence,
} from './installable-agent-qualification-r5.mjs';

export {
  QUALIFICATION_CLAIM_PROFILE,
  QUALIFICATION_DEPLOYMENT_INTENT_PROFILE,
  QUALIFICATION_DEPLOYMENT_PROFILE,
  QUALIFICATION_EVIDENCE_PROFILE,
  QUALIFICATION_GLOBAL_MUTATION_RESOURCE,
  QUALIFICATION_GLOBAL_MUTATION_RESOURCE_TYPE,
  QUALIFICATION_INGRESS_KIND,
  QUALIFICATION_PROVIDER_DEPLOY_OPERATION,
  QUALIFICATION_ROUTE_VERIFIER_PROFILE,
  QUALIFICATION_RPC_PROFILE,
  QUALIFICATION_TARGET_KIND_ADMITTED_DEPLOYMENT,
  QUALIFICATION_TARGET_KIND_PROVIDER_DEPLOYMENT_INTENT,
  READ_ONLY_QUALIFICATION_OPERATIONS,
  R5_QUALIFICATION_RUN_PROFILE,
  assertExpectedDeploymentIdentity,
  createQualificationDeploymentBindingPlan,
  createQualificationDeploymentIdentity,
  createQualificationDeploymentIntent,
  normalizeQualificationDeploymentIdentity,
  normalizeQualificationDeploymentIntent,
  qualificationDeploymentIdentityDigest,
  qualificationDeploymentIntentDigest,
  qualificationGateRequiredPrincipals,
  qualificationRouteVerifierDigest,
  resourceClaimKey,
  validateTerminalQualificationEvidence,
};

export const QUALIFICATION_RUN_PROFILE = 'tdev.installable-agent-qualification-run.v3';
export const QUALIFICATION_ROUTE_BOOTSTRAP_PROFILE = 'tdev.installable-agent-qualification-route-bootstrap.v1';
export const QUALIFICATION_TARGET_KIND_ROUTE_BOOTSTRAP = 'route_bootstrap';
export const QUALIFICATION_ROUTE_BOOTSTRAP_OPERATION = 'route_bootstrap';
export const QUALIFICATION_ROUTE_BOOTSTRAP_SUBOPERATIONS = Object.freeze([
  'migrate_installable_agent_route',
  'register_installable_agent',
  'record_installable_agent_genesis_evidence',
  'accept_legacy_predecessor_quiescence',
  'initial_activate_installable_agent',
  'fail_installable_agent_genesis',
]);
const ROUTE_BOOTSTRAP_SUBOPERATION_SET = new Set(QUALIFICATION_ROUTE_BOOTSTRAP_SUBOPERATIONS);

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

export function normalizeQualificationRouteBootstrap(value) {
  assertRecordShape(value, [
    'profile', 'sourceSha', 'artifactDigest', 'artifactManifestDigest', 'accountId', 'serviceName', 'deploymentEpoch',
    'qualificationEndpointOrigin', 'workersDevAccountSubdomain', 'workersDevHostname', 'workerScript', 'workerVersionId',
    'activeDeploymentId', 'activeTrafficPercentage', 'providerConfigurationDigest', 'providerWriterObservationDigest',
    'namespaceId', 'namespace', 'className', 'jurisdiction', 'agentId', 'routeGeneration', 'routePredecessorState',
    'routePredecessorStateDigest', 'managementRequestSequenceHighWater', 'routeBootstrapTransactionId',
    'routeBootstrapRequestDigest', 'providerAuthoritativeRereadDigest', 'routeAuthoritativeRereadDigest',
  ], [], 'Revision-6 qualification route bootstrap');
  if (value.profile !== QUALIFICATION_ROUTE_BOOTSTRAP_PROFILE) {
    throw new ContractError('invalid_qualification_identity', 'Unsupported Revision-6 route bootstrap profile');
  }
  assertSha40(value.sourceSha, 'sourceSha');
  assertDigest(value.artifactDigest, 'artifactDigest');
  assertDigest(value.artifactManifestDigest, 'artifactManifestDigest');
  boundedString(value.accountId, 'accountId');
  boundedString(value.serviceName, 'serviceName');
  boundedString(value.deploymentEpoch, 'deploymentEpoch');
  if (value.serviceName !== value.workerScript) {
    throw new ContractError('invalid_qualification_identity', 'serviceName must equal workerScript');
  }
  const hostname = expectedWorkersDevHostname(value.workerScript, value.workersDevAccountSubdomain);
  if (value.workersDevHostname !== hostname) {
    throw new ContractError('invalid_qualification_identity', 'workersDevHostname does not match the exact Worker/account subdomain identity');
  }
  assertExactWorkersDevOrigin(value.qualificationEndpointOrigin, hostname);
  boundedString(value.workerVersionId, 'workerVersionId');
  boundedString(value.activeDeploymentId, 'activeDeploymentId');
  if (value.activeTrafficPercentage !== 100) {
    throw new ContractError('invalid_qualification_identity', 'route bootstrap requires exactly one 100-percent provider writer');
  }
  assertDigest(value.providerConfigurationDigest, 'providerConfigurationDigest');
  assertDigest(value.providerWriterObservationDigest, 'providerWriterObservationDigest');
  boundedString(value.namespaceId, 'namespaceId');
  boundedString(value.namespace, 'namespace');
  boundedString(value.className, 'className');
  boundedString(value.jurisdiction, 'jurisdiction');
  assertIdentifier(value.agentId, 'agentId');
  assertSafeInteger(value.routeGeneration, 'routeGeneration', { min: 1 });
  if (value.routePredecessorState !== 'UNREGISTERED') {
    throw new ContractError('qualification_route_bootstrap_predecessor_invalid', 'Route bootstrap requires an authoritative UNREGISTERED predecessor');
  }
  assertDigest(value.routePredecessorStateDigest, 'routePredecessorStateDigest');
  assertSafeInteger(value.managementRequestSequenceHighWater, 'managementRequestSequenceHighWater', { min: 0 });
  assertIdentifier(value.routeBootstrapTransactionId, 'routeBootstrapTransactionId');
  assertDigest(value.routeBootstrapRequestDigest, 'routeBootstrapRequestDigest');
  assertDigest(value.providerAuthoritativeRereadDigest, 'providerAuthoritativeRereadDigest');
  assertDigest(value.routeAuthoritativeRereadDigest, 'routeAuthoritativeRereadDigest');
  return Object.freeze(publicJsonClone(value));
}

export function createQualificationRouteBootstrap(value) {
  return normalizeQualificationRouteBootstrap({ profile: QUALIFICATION_ROUTE_BOOTSTRAP_PROFILE, ...value });
}

export function qualificationRouteBootstrapDigest(value) {
  return typedDigest(QUALIFICATION_ROUTE_BOOTSTRAP_PROFILE, normalizeQualificationRouteBootstrap(value));
}

export function assertQualificationRouteBootstrapSuboperation(operation) {
  boundedString(operation, 'routeBootstrapSuboperation', 256);
  if (!ROUTE_BOOTSTRAP_SUBOPERATION_SET.has(operation)) {
    throw new ContractError('qualification_route_bootstrap_operation_forbidden', 'Operation is outside the bounded fresh-route D0027 bootstrap transaction');
  }
  return operation;
}

export function normalizeQualificationRunTarget(targetKind, target) {
  if (targetKind === QUALIFICATION_TARGET_KIND_PROVIDER_DEPLOYMENT_INTENT) return normalizeQualificationDeploymentIntent(target);
  if (targetKind === QUALIFICATION_TARGET_KIND_ROUTE_BOOTSTRAP) return normalizeQualificationRouteBootstrap(target);
  if (targetKind === QUALIFICATION_TARGET_KIND_ADMITTED_DEPLOYMENT) return normalizeQualificationDeploymentIdentity(target);
  throw new ContractError('invalid_qualification_target_kind', 'Unknown Revision-6 qualification target kind');
}

export function qualificationRunTargetDigest(targetKind, target) {
  if (targetKind === QUALIFICATION_TARGET_KIND_PROVIDER_DEPLOYMENT_INTENT) return qualificationDeploymentIntentDigest(target);
  if (targetKind === QUALIFICATION_TARGET_KIND_ROUTE_BOOTSTRAP) return qualificationRouteBootstrapDigest(target);
  if (targetKind === QUALIFICATION_TARGET_KIND_ADMITTED_DEPLOYMENT) return qualificationDeploymentIdentityDigest(target);
  throw new ContractError('invalid_qualification_target_kind', 'Unknown Revision-6 qualification target kind');
}

export function assertQualificationTargetForOperation({ targetKind, intendedOperation }) {
  boundedString(intendedOperation, 'intendedOperation', 256);
  if (intendedOperation === QUALIFICATION_PROVIDER_DEPLOY_OPERATION) {
    if (targetKind !== QUALIFICATION_TARGET_KIND_PROVIDER_DEPLOYMENT_INTENT) {
      throw new ContractError('qualification_target_kind_operation_mismatch', 'provider_deploy requires a provider_deployment_intent target');
    }
    return targetKind;
  }
  if (intendedOperation === QUALIFICATION_ROUTE_BOOTSTRAP_OPERATION) {
    if (targetKind !== QUALIFICATION_TARGET_KIND_ROUTE_BOOTSTRAP) {
      throw new ContractError('qualification_target_kind_operation_mismatch', 'route_bootstrap requires a route_bootstrap target');
    }
    return targetKind;
  }
  if (targetKind !== QUALIFICATION_TARGET_KIND_ADMITTED_DEPLOYMENT) {
    throw new ContractError('qualification_target_kind_operation_mismatch', 'Only provider_deploy or route_bootstrap may use a pre-admission target');
  }
  return targetKind;
}

export function assertQualificationAdmissionCurrent({ admittedDeployment, observedDeployment }) {
  const admitted = normalizeQualificationDeploymentIdentity(admittedDeployment);
  const observed = normalizeQualificationDeploymentIdentity(observedDeployment);
  const admittedDigest = qualificationDeploymentIdentityDigest(admitted);
  const observedDigest = qualificationDeploymentIdentityDigest(observed);
  if (admittedDigest !== observedDigest) {
    throw new ContractError('qualification_admission_stale', 'Admitted deployment epoch is stale after an identity-changing mutation', {
      admittedDeploymentIdentityDigest: admittedDigest,
      observedDeploymentIdentityDigest: observedDigest,
    });
  }
  return Object.freeze({ identity: observed, digest: observedDigest });
}

export function assertQualificationCompositionCompatible({ canonicalDeployment, evidenceBindings }) {
  const canonical = normalizeQualificationDeploymentIdentity(canonicalDeployment);
  const canonicalDigest = qualificationDeploymentIdentityDigest(canonical);
  if (!Array.isArray(evidenceBindings) || evidenceBindings.length === 0) {
    throw new ContractError('invalid_qualification_evidence', 'evidenceBindings must be a non-empty array');
  }
  const normalized = evidenceBindings.map((item, index) => {
    assertRecordShape(item, ['deploymentIdentityDigest', 'scenarioOnly'], [], `evidenceBindings[${index}]`);
    assertDigest(item.deploymentIdentityDigest, `evidenceBindings[${index}].deploymentIdentityDigest`);
    if (typeof item.scenarioOnly !== 'boolean') throw new ContractError('invalid_qualification_evidence', `evidenceBindings[${index}].scenarioOnly must be boolean`);
    if (!item.scenarioOnly && item.deploymentIdentityDigest !== canonicalDigest) {
      throw new ContractError('qualification_composition_incompatible', 'Canonical Q10 evidence is bound to a stale or divergent deployment identity', {
        canonicalDeploymentIdentityDigest: canonicalDigest,
        evidenceDeploymentIdentityDigest: item.deploymentIdentityDigest,
        evidenceIndex: index,
      });
    }
    return publicJsonClone(item);
  });
  return Object.freeze({ canonicalDeploymentIdentityDigest: canonicalDigest, evidenceBindings: Object.freeze(normalized) });
}
