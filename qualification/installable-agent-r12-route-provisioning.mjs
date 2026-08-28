import {
  ContractError,
  assertDigest,
  assertIdentifier,
  assertRecordShape,
  assertSafeInteger,
  publicJsonClone,
  typedDigest,
} from '../src/canonical.mjs';

export const QUALIFICATION_ROUTE_PROVISIONING_PROFILE = 'tdev.installable-agent-qualification-route-provisioning.v1';
export const QUALIFICATION_ROUTE_PROVISIONING_REQUEST_PROFILE = 'tdev.installable-agent-route-provisioning-request.v1';
export const QUALIFICATION_ROUTE_PROVISIONING_OPERATIONS = Object.freeze([
  'initialize',
  'migrate_installable_agent_route',
]);
const ROUTE_PROVISIONING_OPERATION_SET = new Set(QUALIFICATION_ROUTE_PROVISIONING_OPERATIONS);

const RUNTIME_BINDING_FIELDS = Object.freeze([
  'sourceSha',
  'artifactDigest',
  'artifactManifestDigest',
  'workerVersionId',
  'accountId',
  'serviceName',
  'deployment',
  'environment',
  'deploymentEpoch',
  'qualificationEndpointOrigin',
  'workersDevAccountSubdomain',
  'workersDevHostname',
  'workerScript',
  'namespaceId',
  'namespace',
  'className',
  'jurisdiction',
  'durableObjectId',
]);

function fail(code, message, details = undefined) {
  throw new ContractError(code, message, details);
}

function boundedString(value, label, max = 2048) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || value.includes('\0')) {
    fail('invalid_qualification_provider', `${label} is invalid`);
  }
  return value;
}

function assertSha40(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/.test(value)) {
    fail('invalid_qualification_provider', `${label} must be a lowercase 40-hex Git SHA`);
  }
  return value;
}

function assertOperation(operation) {
  if (!ROUTE_PROVISIONING_OPERATION_SET.has(operation)) {
    fail('qualification_route_provisioning_operation_invalid', 'Unsupported D0039 R12 route-provisioning operation');
  }
  return operation;
}

function assertRuntimeBinding(value) {
  assertRecordShape(value, RUNTIME_BINDING_FIELDS, [], 'D0039 R12 route-provisioning runtime binding');
  assertSha40(value.sourceSha, 'sourceSha');
  assertDigest(value.artifactDigest, 'artifactDigest');
  assertDigest(value.artifactManifestDigest, 'artifactManifestDigest');
  for (const field of RUNTIME_BINDING_FIELDS) {
    if (['sourceSha', 'artifactDigest', 'artifactManifestDigest'].includes(field)) continue;
    boundedString(value[field], field);
  }
  return value;
}

function assertEqual(actual, expected, field) {
  if (actual !== expected) {
    fail('qualification_route_provisioning_binding_mismatch', `${field} does not match the authoritative runtime binding`, { field });
  }
}

export function qualificationRouteProvisioningRequestDigest({ operation, transactionId, routeBinding, payload }) {
  assertOperation(operation);
  assertIdentifier(transactionId, 'routeProvisioningTransactionId');
  assertRecordShape(routeBinding, ['agentId', 'routeGeneration'], ['deployment', 'environment', 'workerScript', 'className', 'namespace', 'jurisdiction', 'durableObjectId'], 'route provisioning request route binding');
  assertIdentifier(routeBinding.agentId, 'route provisioning request agentId');
  assertSafeInteger(routeBinding.routeGeneration, 'route provisioning request routeGeneration', { min: 1 });
  return typedDigest(QUALIFICATION_ROUTE_PROVISIONING_REQUEST_PROFILE, {
    operation,
    transactionId,
    agentId: routeBinding.agentId,
    routeGeneration: routeBinding.routeGeneration,
    payload: publicJsonClone(payload ?? {}),
  });
}

export function qualificationLegacyRouteAuthoritativeReadbackDigest({ routeBinding, routeRead }) {
  assertRecordShape(routeBinding, ['agentId', 'routeGeneration'], ['deployment', 'environment', 'workerScript', 'className', 'namespace', 'jurisdiction', 'durableObjectId'], 'route provisioning legacy route binding');
  assertIdentifier(routeBinding.agentId, 'route provisioning agentId');
  assertSafeInteger(routeBinding.routeGeneration, 'route provisioning routeGeneration', { min: 1 });
  assertRecordShape(routeRead, ['installableAgent', 'predecessorDigest', 'currentTuple', 'currentTupleDigest'], [], 'D0039 R12 legacy route readback');
  assertDigest(routeRead.predecessorDigest, 'route provisioning predecessorDigest');
  if (routeRead.currentTuple !== null || routeRead.currentTupleDigest !== null) {
    fail('qualification_route_provisioning_predecessor_invalid', 'Legacy route provisioning requires a current-less predecessor');
  }
  assertRecordShape(routeRead.installableAgent, ['profile', 'state'], [], 'D0039 R12 legacy installable-Agent readback');
  if (routeRead.installableAgent.state !== 'LEGACY_D0020_ONLY') {
    fail('qualification_route_provisioning_predecessor_invalid', 'Route migration requires an authoritative LEGACY_D0020_ONLY predecessor');
  }
  return typedDigest('tdev.installable-agent-route-provisioning-legacy-readback.v1', {
    agentId: routeBinding.agentId,
    routeGeneration: routeBinding.routeGeneration,
    profile: routeRead.installableAgent.profile,
    state: routeRead.installableAgent.state,
    predecessorDigest: routeRead.predecessorDigest,
    currentTupleDigest: null,
  });
}

export function normalizeQualificationRouteProvisioningTarget(value) {
  assertRecordShape(value, [
    'profile', 'operation', ...RUNTIME_BINDING_FIELDS, 'evidenceAttestorKeyId', 'agentId', 'routeGeneration',
    'predecessorState', 'predecessorDigest', 'routeAuthoritativeRereadDigest', 'provisioningTransactionId',
    'provisioningRequestDigest',
  ], [], 'D0039 R12 route-provisioning target');
  if (value.profile !== QUALIFICATION_ROUTE_PROVISIONING_PROFILE) {
    fail('invalid_qualification_identity', 'Unsupported D0039 R12 route-provisioning profile');
  }
  assertOperation(value.operation);
  assertRuntimeBinding(Object.fromEntries(RUNTIME_BINDING_FIELDS.map((field) => [field, value[field]])));
  assertDigest(value.evidenceAttestorKeyId, 'evidenceAttestorKeyId');
  assertIdentifier(value.agentId, 'route provisioning agentId');
  assertSafeInteger(value.routeGeneration, 'route provisioning routeGeneration', { min: 1 });
  assertIdentifier(value.provisioningTransactionId, 'provisioningTransactionId');
  assertDigest(value.provisioningRequestDigest, 'provisioningRequestDigest');
  if (value.operation === 'initialize') {
    if (value.predecessorState !== 'ABSENT' || value.predecessorDigest !== null || value.routeAuthoritativeRereadDigest !== null) {
      fail('qualification_route_provisioning_predecessor_invalid', 'Route initialization must bind an ABSENT predecessor without invented readback');
    }
  } else {
    if (value.predecessorState !== 'LEGACY_D0020_ONLY') {
      fail('qualification_route_provisioning_predecessor_invalid', 'Route migration must bind a LEGACY_D0020_ONLY predecessor');
    }
    assertDigest(value.predecessorDigest, 'route provisioning predecessorDigest');
    assertDigest(value.routeAuthoritativeRereadDigest, 'routeAuthoritativeRereadDigest');
  }
  return Object.freeze(publicJsonClone(value));
}

export function qualificationRouteProvisioningTargetDigest(value) {
  return typedDigest(QUALIFICATION_ROUTE_PROVISIONING_PROFILE, normalizeQualificationRouteProvisioningTarget(value));
}

export function admitQualificationRouteProvisioning({
  operation,
  routeBinding,
  runtimeBinding,
  evidenceAttestorKeyId,
  routeRead = null,
  routeProvisioningTarget,
  routeProvisioningTargetDigest,
  routeProvisioningTransactionId,
  routeProvisioningRequestDigest,
  payload,
}) {
  assertOperation(operation);
  assertRuntimeBinding(runtimeBinding);
  assertDigest(evidenceAttestorKeyId, 'evidenceAttestorKeyId');
  assertRecordShape(routeBinding, ['agentId', 'routeGeneration'], ['deployment', 'environment', 'workerScript', 'className', 'namespace', 'jurisdiction', 'durableObjectId'], 'D0039 R12 route-provisioning route binding');
  const target = normalizeQualificationRouteProvisioningTarget(routeProvisioningTarget);
  const actualTargetDigest = qualificationRouteProvisioningTargetDigest(target);
  assertDigest(routeProvisioningTargetDigest, 'routeProvisioningTargetDigest');
  if (routeProvisioningTargetDigest !== actualTargetDigest) {
    fail('qualification_route_provisioning_target_mismatch', 'Route-provisioning target digest does not match its canonical target');
  }
  if (target.operation !== operation) {
    fail('qualification_route_provisioning_operation_mismatch', 'Route-provisioning operation does not match the target');
  }
  assertIdentifier(routeProvisioningTransactionId, 'routeProvisioningTransactionId');
  assertDigest(routeProvisioningRequestDigest, 'routeProvisioningRequestDigest');
  if (target.provisioningTransactionId !== routeProvisioningTransactionId || target.provisioningRequestDigest !== routeProvisioningRequestDigest) {
    fail('qualification_route_provisioning_request_mismatch', 'Route-provisioning transaction identity is not bound to the target');
  }
  const expectedRequestDigest = qualificationRouteProvisioningRequestDigest({
    operation,
    transactionId: routeProvisioningTransactionId,
    routeBinding,
    payload,
  });
  if (routeProvisioningRequestDigest !== expectedRequestDigest) {
    fail('qualification_route_provisioning_request_mismatch', 'Route-provisioning request digest is not the exact operation payload');
  }
  assertEqual(target.agentId, routeBinding.agentId, 'agentId');
  assertEqual(target.routeGeneration, routeBinding.routeGeneration, 'routeGeneration');
  for (const field of RUNTIME_BINDING_FIELDS) assertEqual(target[field], runtimeBinding[field], field);
  assertEqual(target.evidenceAttestorKeyId, evidenceAttestorKeyId, 'evidenceAttestorKeyId');

  let routeAuthoritativeRereadDigest = null;
  if (operation === 'initialize') {
    if (routeRead !== null) {
      fail('qualification_route_provisioning_predecessor_invalid', 'Route initialization must not invent an authoritative predecessor read');
    }
  } else {
    routeAuthoritativeRereadDigest = qualificationLegacyRouteAuthoritativeReadbackDigest({ routeBinding, routeRead });
    if (target.predecessorDigest !== routeRead.predecessorDigest) {
      fail('qualification_route_provisioning_predecessor_mismatch', 'Route migration target does not bind the authoritative predecessor digest');
    }
    if (target.routeAuthoritativeRereadDigest !== routeAuthoritativeRereadDigest) {
      fail('qualification_route_provisioning_readback_mismatch', 'Route migration target does not bind the authoritative legacy readback');
    }
  }
  return Object.freeze({ target, targetDigest: actualTargetDigest, routeAuthoritativeRereadDigest });
}
