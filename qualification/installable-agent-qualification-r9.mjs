import {
  ContractError,
  assertDigest,
  assertRecordShape,
  publicJsonClone,
} from '../src/canonical.mjs';
import {
  QUALIFICATION_ROUTE_BOOTSTRAP_ADMISSION_PROFILE as R8_ADMISSION_PROFILE,
  admitQualificationRouteBootstrap as admitR8RouteBootstrap,
} from './installable-agent-qualification-r8.mjs';
import { QUALIFICATION_ROUTE_BOOTSTRAP_PROFILE as R8_TARGET_PROFILE } from './installable-agent-qualification-r6.mjs';
import {
  QUALIFICATION_ROUTE_BOOTSTRAP_V2_OPERATIONS,
  QUALIFICATION_ROUTE_BOOTSTRAP_V2_PHASE,
  QUALIFICATION_ROUTE_BOOTSTRAP_V2_PROFILE,
  assertPendingRouteRead,
  normalizeQualificationRouteBootstrapV2,
  qualificationRouteBootstrapV2Digest,
  qualificationRouteBootstrapV2RequestDigest,
  qualificationRoutePendingReadbackDigest,
} from './installable-agent-qualification-r9-target.mjs';

export {
  QUALIFICATION_ROUTE_BOOTSTRAP_V2_OPERATIONS,
  QUALIFICATION_ROUTE_BOOTSTRAP_V2_PHASE,
  QUALIFICATION_ROUTE_BOOTSTRAP_V2_PROFILE,
  normalizeQualificationRouteBootstrapV2,
  qualificationRouteBootstrapV2Digest,
  qualificationRouteBootstrapV2RequestDigest,
  qualificationRoutePendingReadbackDigest,
};

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

const PENDING_OPERATION_SET = new Set(QUALIFICATION_ROUTE_BOOTSTRAP_V2_OPERATIONS);

function fail(code, message, details = undefined) {
  throw new ContractError(code, message, details);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    fail('qualification_route_bootstrap_binding_mismatch', `${label} does not match the authoritative route/provider binding`, { field: label });
  }
}

function assertRuntimeBinding(value) {
  assertRecordShape(value, RUNTIME_BINDING_FIELDS, [], 'D0039 r9 runtime binding');
  for (const field of RUNTIME_BINDING_FIELDS) {
    if (typeof value[field] !== 'string' || value[field].length === 0 || value[field].includes('\0')) {
      fail('invalid_qualification_provider', `D0039 r9 runtime binding ${field} is invalid`);
    }
  }
  return value;
}

function assertRouteBinding(value) {
  assertRecordShape(value, ['agentId', 'routeGeneration'], ['deployment', 'environment', 'workerScript', 'className', 'namespace', 'jurisdiction', 'durableObjectId'], 'D0039 r9 route binding');
  if (typeof value.agentId !== 'string' || value.agentId.length === 0) fail('invalid_qualification_identity', 'r9 agentId is invalid');
  if (!Number.isSafeInteger(value.routeGeneration) || value.routeGeneration < 1) fail('invalid_qualification_identity', 'r9 routeGeneration is invalid');
  return value;
}

function assertPendingRequest({ operation, target, routeBootstrapRequest }) {
  if (routeBootstrapRequest === null || typeof routeBootstrapRequest !== 'object' || Array.isArray(routeBootstrapRequest)) {
    fail('invalid_qualification_request', 'D0039 r9 route-bootstrap request is invalid');
  }
  const registerReplay = operation === 'register_installable_agent';
  if (!registerReplay && (routeBootstrapRequest.pendingDigest !== target.pendingDigest || routeBootstrapRequest.genesisGeneration !== target.genesisGeneration)) {
    fail('qualification_route_bootstrap_pending_mismatch', 'Request does not bind the exact D0027 pending digest/generation');
  }
  const requiresManagementIdentity = operation === 'register_installable_agent' ||
    operation === 'initial_activate_installable_agent' || operation === 'fail_installable_agent_genesis';
  if (requiresManagementIdentity) {
    if (routeBootstrapRequest.managementRequestId !== target.pendingManagementRequestId ||
        routeBootstrapRequest.intentDigest !== target.pendingIntentDigest ||
        routeBootstrapRequest.expectedPredecessorDigest !== target.genesisPredecessorDigest) {
      fail('qualification_route_bootstrap_pending_mismatch', 'Request does not bind the exact D0027 management/predecessor identity');
    }
  }
  const requestDigest = qualificationRouteBootstrapV2RequestDigest({
    operation,
    transactionId: target.routeBootstrapTransactionId,
    routeBinding: {
      agentId: target.agentId,
      routeGeneration: target.routeGeneration,
    },
    request: routeBootstrapRequest,
  });
  if (requestDigest !== target.routeBootstrapRequestDigest) {
    fail('qualification_route_bootstrap_request_mismatch', 'Request body is not the exact target-bound pending request');
  }
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
  routeBootstrapRequest,
}) {
  if (routeBootstrapTarget?.profile === R8_TARGET_PROFILE) {
    return admitR8RouteBootstrap({
      operation,
      routeBinding,
      runtimeBinding,
      routeRead,
      routeBootstrapTarget,
      routeBootstrapTargetDigest,
      routeBootstrapTransactionId,
      routeBootstrapRequestDigest,
    });
  }

  if (!PENDING_OPERATION_SET.has(operation)) {
    fail('qualification_route_bootstrap_operation_forbidden', 'R9 target is limited to D0027 pending continuation operations');
  }
  assertRuntimeBinding(runtimeBinding);
  assertRouteBinding(routeBinding);
  const target = normalizeQualificationRouteBootstrapV2(routeBootstrapTarget);
  const actualTargetDigest = qualificationRouteBootstrapV2Digest(target);
  assertDigest(routeBootstrapTargetDigest, 'r9 routeBootstrapTargetDigest');
  if (actualTargetDigest !== routeBootstrapTargetDigest) {
    fail('qualification_route_bootstrap_target_mismatch', 'R9 target digest does not match its canonical target');
  }
  if (target.routeBootstrapTransactionId !== routeBootstrapTransactionId || target.routeBootstrapRequestDigest !== routeBootstrapRequestDigest) {
    fail('qualification_route_bootstrap_request_mismatch', 'R9 outer transaction/request identity does not match the target');
  }
  if (target.routeBootstrapOperation !== operation || target.routeBootstrapPhase !== QUALIFICATION_ROUTE_BOOTSTRAP_V2_PHASE) {
    fail('qualification_route_bootstrap_operation_mismatch', 'R9 target operation or phase does not match the requested operation');
  }
  if (target.agentId !== routeBinding.agentId || target.routeGeneration !== routeBinding.routeGeneration) {
    fail('qualification_route_bootstrap_binding_mismatch', 'R9 target route does not match the requested route');
  }
  for (const field of RUNTIME_BINDING_FIELDS) assertEqual(target[field], runtimeBinding[field], field);

  const { security, pending } = assertPendingRouteRead(routeRead);
  if (target.routePredecessorStateDigest !== routeRead.predecessorDigest) {
    fail('qualification_route_bootstrap_predecessor_mismatch', 'R9 target does not bind the current pending route predecessor digest');
  }
  if (target.managementRequestSequenceHighWater !== security.managementRequestSequenceHighWater) {
    fail('qualification_route_bootstrap_predecessor_mismatch', 'R9 target does not bind the current management high-water');
  }
  if (target.genesisPredecessorDigest !== pending.unregisteredPredecessorDigest ||
      target.pendingDigest !== pending.pendingDigest ||
      target.genesisGeneration !== pending.genesisGeneration ||
      target.pendingManagementRequestId !== pending.managementRequestId ||
      target.pendingIntentDigest !== pending.intentDigest) {
    fail('qualification_route_bootstrap_pending_mismatch', 'R9 target does not bind the exact authoritative pending identity');
  }
  const pendingReadbackDigest = qualificationRoutePendingReadbackDigest({ routeBinding, routeRead });
  if (target.pendingReadbackDigest !== pendingReadbackDigest) {
    fail('qualification_route_bootstrap_readback_mismatch', 'R9 target does not bind the fresh authoritative pending readback');
  }
  assertPendingRequest({ operation, target, routeBootstrapRequest });
  return Object.freeze({
    profile: `${R8_ADMISSION_PROFILE.replace(/\.v1$/, '')}.v2`,
    operation,
    phase: QUALIFICATION_ROUTE_BOOTSTRAP_V2_PHASE,
    target: publicJsonClone(target),
    targetDigest: routeBootstrapTargetDigest,
    pendingReadbackDigest,
  });
}
