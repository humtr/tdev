import {
  ContractError,
  assertDigest,
  assertIdentifier,
  assertRecordShape,
  assertSafeInteger,
  publicJsonClone,
  typedDigest,
} from '../src/canonical.mjs';

export const QUALIFICATION_ROUTE_BOOTSTRAP_V2_PROFILE = 'tdev.installable-agent-qualification-route-bootstrap.v2';
export const QUALIFICATION_ROUTE_BOOTSTRAP_V2_REQUEST_PROFILE = 'tdev.installable-agent-route-bootstrap-request.v2';
export const QUALIFICATION_ROUTE_BOOTSTRAP_V2_PHASE = 'GENESIS_PENDING_CONTINUATION';
export const QUALIFICATION_ROUTE_BOOTSTRAP_V2_OPERATIONS = Object.freeze([
  'register_installable_agent',
  'record_installable_agent_genesis_evidence',
  'accept_legacy_predecessor_quiescence',
  'initial_activate_installable_agent',
  'fail_installable_agent_genesis',
]);

const OPERATION_SET = new Set(QUALIFICATION_ROUTE_BOOTSTRAP_V2_OPERATIONS);
const TARGET_FIELDS = Object.freeze([
  'profile',
  'sourceSha',
  'artifactDigest',
  'artifactManifestDigest',
  'accountId',
  'serviceName',
  'deploymentEpoch',
  'qualificationEndpointOrigin',
  'workersDevAccountSubdomain',
  'workersDevHostname',
  'workerScript',
  'workerVersionId',
  'activeDeploymentId',
  'activeTrafficPercentage',
  'providerConfigurationDigest',
  'providerWriterObservationDigest',
  'namespaceId',
  'namespace',
  'className',
  'jurisdiction',
  'agentId',
  'routeGeneration',
  'routePredecessorState',
  'routePredecessorStateDigest',
  'managementRequestSequenceHighWater',
  'routeBootstrapPhase',
  'routeBootstrapOperation',
  'routeBootstrapTransactionId',
  'routeBootstrapRequestDigest',
  'genesisPredecessorDigest',
  'pendingDigest',
  'genesisGeneration',
  'pendingManagementRequestId',
  'pendingIntentDigest',
  'pendingReadbackDigest',
]);

function fail(code, message, details = undefined) {
  throw new ContractError(code, message, details);
}

function boundedString(value, label, max = 512) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || value.includes('\0')) {
    fail('invalid_qualification_identity', `${label} is invalid`);
  }
  return value;
}

function assertSha40(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/.test(value)) {
    fail('invalid_qualification_identity', `${label} must be a lowercase 40-hex Git SHA`);
  }
  return value;
}

function assertDnsLabel(value, label) {
  boundedString(value, label, 63);
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value)) {
    fail('invalid_qualification_identity', `${label} must be one lowercase DNS label`);
  }
  return value;
}

function expectedWorkersDevHostname(workerScript, accountSubdomain) {
  assertDnsLabel(workerScript, 'r9 workerScript');
  assertDnsLabel(accountSubdomain, 'r9 workersDevAccountSubdomain');
  const hostname = `${workerScript}.${accountSubdomain}.workers.dev`;
  if (hostname.length > 253) fail('invalid_qualification_identity', 'r9 workersDevHostname is too long');
  return hostname;
}

function assertExactWorkersDevOrigin(value, expectedHostname) {
  let endpoint;
  try { endpoint = new URL(value); }
  catch { fail('invalid_qualification_identity', 'r9 qualificationEndpointOrigin is invalid'); }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash ||
      endpoint.hostname !== expectedHostname || endpoint.origin !== value) {
    fail('invalid_qualification_identity', 'r9 qualificationEndpointOrigin must be the exact credential-free workers.dev origin');
  }
}

function assertRouteBinding(routeBinding) {
  assertRecordShape(routeBinding, ['agentId', 'routeGeneration'], ['deployment', 'environment', 'workerScript', 'className', 'namespace', 'jurisdiction', 'durableObjectId'], 'D0039 r9 route binding');
  assertIdentifier(routeBinding.agentId, 'r9 route agentId');
  assertSafeInteger(routeBinding.routeGeneration, 'r9 route routeGeneration', { min: 1 });
  return routeBinding;
}

function assertPendingIdentity(pending, label = 'D0039 r9 pending identity') {
  if (pending === null || typeof pending !== 'object' || Array.isArray(pending)) {
    fail('qualification_route_bootstrap_pending_invalid', `${label} is unavailable`);
  }
  for (const field of ['genesisGeneration', 'managementRequestId', 'intentDigest', 'unregisteredPredecessorDigest', 'pendingDigest']) {
    if (!Object.hasOwn(pending, field)) fail('qualification_route_bootstrap_pending_invalid', `${label} is missing ${field}`);
  }
  assertSafeInteger(pending.genesisGeneration, `${label}.genesisGeneration`, { min: 1 });
  boundedString(pending.managementRequestId, `${label}.managementRequestId`);
  assertDigest(pending.intentDigest, `${label}.intentDigest`);
  assertDigest(pending.unregisteredPredecessorDigest, `${label}.unregisteredPredecessorDigest`);
  assertDigest(pending.pendingDigest, `${label}.pendingDigest`);
  return Object.freeze({
    genesisGeneration: pending.genesisGeneration,
    managementRequestId: pending.managementRequestId,
    intentDigest: pending.intentDigest,
    unregisteredPredecessorDigest: pending.unregisteredPredecessorDigest,
    pendingDigest: pending.pendingDigest,
  });
}

export function assertPendingRouteRead(routeRead) {
  assertRecordShape(routeRead, ['installableAgent', 'predecessorDigest', 'currentTuple', 'currentTupleDigest'], [], 'D0039 r9 pending route readback');
  assertDigest(routeRead.predecessorDigest, 'r9 routePredecessorStateDigest');
  if (routeRead.currentTuple !== null || routeRead.currentTupleDigest !== null) {
    fail('qualification_route_bootstrap_predecessor_invalid', 'GENESIS_PENDING continuation requires a current-less route');
  }
  const security = routeRead.installableAgent;
  if (security === null || typeof security !== 'object' || Array.isArray(security)) {
    fail('invalid_qualification_provider', 'D0039 r9 pending security readback is invalid');
  }
  if (security.state !== 'GENESIS_PENDING') {
    fail('qualification_route_bootstrap_predecessor_invalid', 'GENESIS_PENDING continuation requires the authoritative pending state');
  }
  if (!Object.hasOwn(security, 'managementRequestSequenceHighWater')) {
    fail('invalid_qualification_provider', 'D0039 r9 pending readback is missing management high-water');
  }
  assertSafeInteger(security.managementRequestSequenceHighWater, 'r9 managementRequestSequenceHighWater', { min: 0 });
  for (const name of ['managementKeyId', 'releaseRootKeyId', 'currentCredentialKeyId']) {
    const value = security[name] ?? null;
    if (value !== null) boundedString(value, `r9 ${name}`);
  }
  const pending = assertPendingIdentity(security.pending);
  return Object.freeze({ security, pending });
}

export function qualificationRoutePendingReadbackDigest({ routeBinding, routeRead }) {
  assertRouteBinding(routeBinding);
  const { security, pending } = assertPendingRouteRead(routeRead);
  return typedDigest('tdev.installable-agent-route-bootstrap-pending-readback.v2', {
    agentId: routeBinding.agentId,
    routeGeneration: routeBinding.routeGeneration,
    state: security.state,
    routePredecessorStateDigest: routeRead.predecessorDigest,
    currentTupleDigest: null,
    managementKeyId: security.managementKeyId ?? null,
    releaseRootKeyId: security.releaseRootKeyId ?? null,
    currentCredentialKeyId: security.currentCredentialKeyId ?? null,
    managementRequestSequenceHighWater: security.managementRequestSequenceHighWater,
    genesisPredecessorDigest: pending.unregisteredPredecessorDigest,
    pendingDigest: pending.pendingDigest,
    genesisGeneration: pending.genesisGeneration,
    pendingManagementRequestId: pending.managementRequestId,
    pendingIntentDigest: pending.intentDigest,
  });
}

export function qualificationRouteBootstrapV2RequestDigest({ operation, transactionId, routeBinding, request }) {
  if (!OPERATION_SET.has(operation)) {
    fail('qualification_route_bootstrap_operation_forbidden', 'Operation is outside the bounded GENESIS_PENDING continuation');
  }
  assertIdentifier(transactionId, 'r9 routeBootstrapTransactionId');
  assertRouteBinding(routeBinding);
  if (request === null || typeof request !== 'object' || Array.isArray(request)) {
    fail('invalid_qualification_request', 'r9 routeBootstrap request must be a plain record');
  }
  return typedDigest(QUALIFICATION_ROUTE_BOOTSTRAP_V2_REQUEST_PROFILE, {
    operation,
    transactionId,
    routeBinding: {
      agentId: routeBinding.agentId,
      routeGeneration: routeBinding.routeGeneration,
    },
    request: publicJsonClone(request),
  });
}

export function normalizeQualificationRouteBootstrapV2(value) {
  assertRecordShape(value, TARGET_FIELDS, [], 'D0039 Revision-9 route bootstrap target');
  if (value.profile !== QUALIFICATION_ROUTE_BOOTSTRAP_V2_PROFILE) {
    fail('invalid_qualification_identity', 'Unsupported Revision-9 route bootstrap profile');
  }
  assertSha40(value.sourceSha, 'r9 sourceSha');
  for (const field of ['artifactDigest', 'artifactManifestDigest', 'providerConfigurationDigest', 'providerWriterObservationDigest', 'routePredecessorStateDigest', 'routeBootstrapRequestDigest', 'genesisPredecessorDigest', 'pendingDigest', 'pendingIntentDigest', 'pendingReadbackDigest']) {
    assertDigest(value[field], `r9 ${field}`);
  }
  for (const field of ['accountId', 'serviceName', 'deploymentEpoch', 'qualificationEndpointOrigin', 'workersDevAccountSubdomain', 'workersDevHostname', 'workerScript', 'workerVersionId', 'activeDeploymentId', 'namespaceId', 'namespace', 'className', 'jurisdiction']) {
    boundedString(value[field], `r9 ${field}`);
  }
  if (value.serviceName !== value.workerScript) fail('invalid_qualification_identity', 'r9 serviceName must equal workerScript');
  const expectedHostname = expectedWorkersDevHostname(value.workerScript, value.workersDevAccountSubdomain);
  if (value.workersDevHostname !== expectedHostname) fail('invalid_qualification_identity', 'r9 workersDevHostname does not match the exact Worker/account identity');
  assertExactWorkersDevOrigin(value.qualificationEndpointOrigin, expectedHostname);
  if (value.activeTrafficPercentage !== 100) fail('invalid_qualification_identity', 'r9 route bootstrap requires one 100-percent provider writer');
  assertIdentifier(value.agentId, 'r9 agentId');
  assertSafeInteger(value.routeGeneration, 'r9 routeGeneration', { min: 1 });
  if (value.routePredecessorState !== 'GENESIS_PENDING') fail('qualification_route_bootstrap_predecessor_invalid', 'r9 target requires GENESIS_PENDING state');
  if (value.routeBootstrapPhase !== QUALIFICATION_ROUTE_BOOTSTRAP_V2_PHASE) fail('invalid_qualification_identity', 'r9 target phase is invalid');
  if (!OPERATION_SET.has(value.routeBootstrapOperation)) fail('qualification_route_bootstrap_operation_forbidden', 'r9 operation is outside the pending continuation');
  assertIdentifier(value.routeBootstrapTransactionId, 'r9 routeBootstrapTransactionId');
  boundedString(value.pendingManagementRequestId, 'r9 pendingManagementRequestId');
  assertSafeInteger(value.managementRequestSequenceHighWater, 'r9 managementRequestSequenceHighWater', { min: 0 });
  assertSafeInteger(value.genesisGeneration, 'r9 genesisGeneration', { min: 1 });
  return Object.freeze(publicJsonClone(value));
}

export function qualificationRouteBootstrapV2Digest(value) {
  return typedDigest(QUALIFICATION_ROUTE_BOOTSTRAP_V2_PROFILE, normalizeQualificationRouteBootstrapV2(value));
}
