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
  QUALIFICATION_TARGET_KIND_ROUTE_BOOTSTRAP,
  assertQualificationRouteBootstrapSuboperation,
  normalizeQualificationRouteBootstrap,
  qualificationRouteBootstrapDigest,
} from './installable-agent-qualification-r6.mjs';

export {
  QUALIFICATION_TARGET_KIND_ROUTE_BOOTSTRAP,
  assertQualificationRouteBootstrapSuboperation,
  normalizeQualificationRouteBootstrap,
  qualificationRouteBootstrapDigest,
};

export const QUALIFICATION_ROUTE_BOOTSTRAP_ADMISSION_PROFILE = 'tdev.installable-agent-qualification-route-bootstrap-admission.v1';
export const QUALIFICATION_ROUTE_BOOTSTRAP_REQUEST_PROFILE = 'tdev.installable-agent-route-bootstrap-request.v1';

const RUNTIME_BINDING_FIELDS = Object.freeze([
  'sourceSha',
  'artifactDigest',
  'artifactManifestDigest',
  'workerVersionId',
  'accountId',
  'serviceName',
  'deploymentEpoch',
  'qualificationEndpointOrigin',
  'workersDevAccountSubdomain',
  'workersDevHostname',
  'workerScript',
  'namespaceId',
  'namespace',
  'className',
  'jurisdiction',
]);

function fail(code, message, details = undefined) {
  throw new ContractError(code, message, details);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    fail('qualification_route_bootstrap_binding_mismatch', `${label} does not match the authoritative route/provider binding`, {
      field: label,
    });
  }
}

function assertRuntimeBinding(value) {
  assertRecordShape(value, RUNTIME_BINDING_FIELDS, [], 'D0039 route bootstrap runtime binding');
  for (const field of RUNTIME_BINDING_FIELDS) {
    if (typeof value[field] !== 'string' || value[field].length === 0 || value[field].includes('\0')) {
      fail('invalid_qualification_provider', `D0039 route bootstrap runtime binding ${field} is invalid`);
    }
  }
  return value;
}

function assertRouteRead(value, routeBinding) {
  assertRecordShape(value, ['installableAgent', 'predecessorDigest', 'currentTuple', 'currentTupleDigest'], [], 'D0039 route bootstrap readback');
  assertDigest(value.predecessorDigest, 'route bootstrap predecessorDigest');
  if (value.currentTuple !== null || value.currentTupleDigest !== null) {
    fail('qualification_route_bootstrap_predecessor_invalid', 'Route bootstrap requires a current-less UNREGISTERED predecessor');
  }
  const security = value.installableAgent;
  if (security === null || typeof security !== 'object' || Array.isArray(security)) {
    fail('invalid_qualification_provider', 'D0039 route bootstrap security readback is invalid');
  }
  for (const field of ['state', 'managementRequestSequenceHighWater']) {
    if (!Object.hasOwn(security, field)) fail('invalid_qualification_provider', 'D0039 route bootstrap security readback is missing ' + field);
  }
  if (security.state !== 'UNREGISTERED') {
    fail('qualification_route_bootstrap_predecessor_invalid', 'Route bootstrap requires an authoritative UNREGISTERED predecessor');
  }
  assertSafeInteger(security.managementRequestSequenceHighWater, 'route bootstrap managementRequestSequenceHighWater', { min: 0 });
  for (const name of ['managementKeyId', 'releaseRootKeyId', 'currentCredentialKeyId']) {
    const item = security[name] ?? null;
    if (item !== null && (typeof item !== 'string' || item.length === 0 || item.includes('\0'))) {
      fail('invalid_qualification_provider', `D0039 route bootstrap ${name} is invalid`);
    }
  }
  return security;
}

export function qualificationRouteBootstrapRequestDigest({ transactionId, routeBinding }) {
  assertIdentifier(transactionId, 'routeBootstrapTransactionId');
  assertRecordShape(routeBinding, ['agentId', 'routeGeneration'], ['deployment', 'environment', 'workerScript', 'className', 'namespace', 'jurisdiction', 'durableObjectId'], 'route bootstrap request route binding');
  assertIdentifier(routeBinding.agentId, 'route bootstrap request agentId');
  assertSafeInteger(routeBinding.routeGeneration, 'route bootstrap request routeGeneration', { min: 1 });
  return typedDigest(QUALIFICATION_ROUTE_BOOTSTRAP_REQUEST_PROFILE, {
    transactionId,
    routeBinding: {
      agentId: routeBinding.agentId,
      routeGeneration: routeBinding.routeGeneration,
    },
  });
}

export function qualificationRouteAuthoritativeReadbackDigest({ routeBinding, routeRead }) {
  assertRecordShape(routeBinding, ['agentId', 'routeGeneration'], ['deployment', 'environment', 'workerScript', 'className', 'namespace', 'jurisdiction', 'durableObjectId'], 'route bootstrap route binding');
  assertIdentifier(routeBinding.agentId, 'route bootstrap agentId');
  assertSafeInteger(routeBinding.routeGeneration, 'route bootstrap routeGeneration', { min: 1 });
  const security = assertRouteRead(routeRead, routeBinding);
  return typedDigest('tdev.installable-agent-route-bootstrap-readback.v1', {
    agentId: routeBinding.agentId,
    routeGeneration: routeBinding.routeGeneration,
    state: security.state,
    predecessorDigest: routeRead.predecessorDigest,
    currentTupleDigest: null,
    managementKeyId: security.managementKeyId ?? null,
    releaseRootKeyId: security.releaseRootKeyId ?? null,
    currentCredentialKeyId: security.currentCredentialKeyId ?? null,
    managementRequestSequenceHighWater: security.managementRequestSequenceHighWater,
  });
}

export function admitQualificationRouteBootstrap({
  operation,
  routeBinding,
  runtimeBinding,
  routeRead,
  routeBootstrapTarget,
  routeBootstrapTargetDigest,
  routeBootstrapTransactionId,
  routeBootstrapRequestDigest,
}) {
  assertQualificationRouteBootstrapSuboperation(operation);
  assertRuntimeBinding(runtimeBinding);
  assertRecordShape(routeBinding, ['agentId', 'routeGeneration'], ['deployment', 'environment', 'workerScript', 'className', 'namespace', 'jurisdiction', 'durableObjectId'], 'D0039 route bootstrap route binding');
  const target = normalizeQualificationRouteBootstrap(routeBootstrapTarget);
  const actualTargetDigest = qualificationRouteBootstrapDigest(target);
  assertDigest(routeBootstrapTargetDigest, 'routeBootstrapTargetDigest');
  if (routeBootstrapTargetDigest !== actualTargetDigest) {
    fail('qualification_route_bootstrap_target_mismatch', 'Route bootstrap target digest does not match its canonical target');
  }
  assertIdentifier(routeBootstrapTransactionId, 'routeBootstrapTransactionId');
  assertDigest(routeBootstrapRequestDigest, 'routeBootstrapRequestDigest');
  if (target.routeBootstrapTransactionId !== routeBootstrapTransactionId || target.routeBootstrapRequestDigest !== routeBootstrapRequestDigest) {
    fail('qualification_route_bootstrap_request_mismatch', 'Route bootstrap transaction identity is not bound to the target');
  }
  const expectedRequestDigest = qualificationRouteBootstrapRequestDigest({
    transactionId: routeBootstrapTransactionId,
    routeBinding,
  });
  if (routeBootstrapRequestDigest !== expectedRequestDigest) {
    fail('qualification_route_bootstrap_request_mismatch', 'Route bootstrap request digest is not the exact target-bound request identity');
  }
  assertEqual(target.agentId, routeBinding.agentId, 'agentId');
  assertEqual(target.routeGeneration, routeBinding.routeGeneration, 'routeGeneration');
  for (const field of RUNTIME_BINDING_FIELDS) assertEqual(target[field], runtimeBinding[field], field);
  const security = assertRouteRead(routeRead, routeBinding);
  if (target.routePredecessorStateDigest !== routeRead.predecessorDigest) {
    fail('qualification_route_bootstrap_predecessor_mismatch', 'Route bootstrap target does not bind the authoritative predecessor digest');
  }
  if (target.managementRequestSequenceHighWater !== security.managementRequestSequenceHighWater) {
    fail('qualification_route_bootstrap_predecessor_mismatch', 'Route bootstrap target does not bind the route management high-water');
  }
  const routeAuthoritativeRereadDigest = qualificationRouteAuthoritativeReadbackDigest({ routeBinding, routeRead });
  if (target.routeAuthoritativeRereadDigest !== routeAuthoritativeRereadDigest) {
    fail('qualification_route_bootstrap_readback_mismatch', 'Route bootstrap target does not bind the fresh authoritative route readback');
  }
  return Object.freeze({
    profile: QUALIFICATION_ROUTE_BOOTSTRAP_ADMISSION_PROFILE,
    operation,
    target: publicJsonClone(target),
    targetDigest: routeBootstrapTargetDigest,
    routeAuthoritativeRereadDigest,
  });
}
