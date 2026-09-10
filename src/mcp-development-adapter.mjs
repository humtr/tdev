import {
  ContractError,
  assertIdentifier,
  assertRecordShape,
  canonicalClone,
  deepFreeze,
  digest,
  isPlainRecord,
} from './canonical.mjs';
import { defineDevelopmentUnitPlan, defineSemanticDevelopmentUnitPlan } from './development-unit.mjs';
import { normalizeDevelopmentOperationCatalog } from './development-operation-catalog.mjs';
import { normalizeLazyPlanScope, scopeDigest } from './lazy-plan-reference.mjs';

function fail(code, message, details = undefined, options = undefined) {
  throw new ContractError(code, message, details, options);
}

function assertRunner(runner) {
  if (!runner || typeof runner.create !== 'function' || typeof runner.drive !== 'function') {
    fail('mcp_owner_unavailable', 'Development unit runner must expose create() and drive()');
  }
  return runner;
}

function normalizeContext(value, contextReference) {
  if (!isPlainRecord(value)) fail('mcp_context_invalid', 'Context owner returned an invalid context reference');
  assertRecordShape(value, ['revisionId', 'baseTree', 'repositoryCommitOid'], [
    'objectFormat', 'contextReferenceId', 'contextCapabilityId', 'modelCapabilityId',
    'validationCapabilityId', 'writePaths', 'caseContract', 'payload', 'contextProfile',
    'contextScope', 'scopeDigest', 'baseDigest', 'baseIdentity',
    'repositoryBaseIdentity',
  ], 'development context');
  assertIdentifier(value.revisionId, 'development context.revisionId');
  if (!isPlainRecord(value.baseTree)) fail('mcp_context_invalid', 'Context baseTree must be a record');
  const materializedBaseDigest = digest(value.baseTree);
  if (value.baseDigest !== undefined) {
    if (typeof value.baseDigest !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value.baseDigest)) {
      fail('mcp_context_invalid', 'development context.baseDigest is invalid');
    }
    if (value.baseDigest !== materializedBaseDigest) {
      fail('mcp_context_base_mismatch', 'development context baseDigest does not match baseTree');
    }
  }
  if (typeof value.repositoryCommitOid !== 'string' || !/^[0-9a-f]{40,64}$/.test(value.repositoryCommitOid)) {
    fail('mcp_context_invalid', 'Context repositoryCommitOid must be a hexadecimal Git object ID');
  }
  const objectFormat = value.objectFormat ?? 'sha1';
  if (objectFormat !== 'sha1' && objectFormat !== 'sha256') fail('mcp_context_invalid', 'Context objectFormat is unsupported');
  if (value.contextReferenceId !== undefined && value.contextReferenceId !== contextReference) {
    fail('mcp_context_reference_mismatch', 'Context owner returned a different context reference');
  }
  for (const field of ['contextCapabilityId', 'modelCapabilityId', 'validationCapabilityId']) {
    if (value[field] !== undefined && value[field] !== null && typeof value[field] !== 'string') {
      fail('mcp_context_invalid', `${field} must be a capability identifier`);
    }
  }
  if (value.scopeDigest !== undefined) {
    if (typeof value.scopeDigest !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value.scopeDigest)) {
      fail('mcp_context_invalid', 'development context.scopeDigest is invalid');
    }
  }
  if (value.contextScope !== undefined) {
    const normalizedScope = normalizeLazyPlanScope(value.contextScope);
    if (value.scopeDigest !== undefined && value.scopeDigest !== scopeDigest(normalizedScope)) {
      fail('mcp_context_scope_mismatch', 'development context scopeDigest does not match the owner-issued scope');
    }
  } else if (value.scopeDigest !== undefined) {
    fail('mcp_context_scope_mismatch', 'development context scopeDigest requires contextScope');
  }
  return deepFreeze({ ...canonicalClone(value), objectFormat, contextReferenceId: contextReference });
}

export function createDevelopmentStartAdapter({ runner, resolveContext, operationCatalog } = {}) {
  const developmentRunner = assertRunner(runner);
  if (typeof resolveContext !== 'function') fail('mcp_owner_unavailable', 'A context owner resolver is required');
  const catalog = normalizeDevelopmentOperationCatalog(operationCatalog);
  return async ({ caseId, driveRequestId, contextReference, operation, identity, requestId } = {}) => {
    assertIdentifier(caseId, 'development caseId');
    assertIdentifier(driveRequestId, 'development driveRequestId');
    assertIdentifier(contextReference, 'development contextReference');
    if (!isPlainRecord(operation)) fail('mcp_tool_invalid_arguments', 'development operation selection must be an object');
    const context = normalizeContext(await resolveContext({ contextReference, identity }), contextReference);
    const plan = defineSemanticDevelopmentUnitPlan({
      revisionId: context.revisionId,
      baseTree: context.baseTree,
      repositoryCommitOid: context.repositoryCommitOid,
      objectFormat: context.objectFormat,
      contextReferenceId: contextReference,
      contextScope: context.contextScope ?? null,
      baseIdentity: context.baseIdentity ?? null,
      repositoryBaseIdentity: context.repositoryBaseIdentity ?? null,
      operation,
      operationCatalog: catalog,
      writePaths: context.writePaths ?? null,
      caseContract: context.caseContract,
    });
    const selectedTask = plan.tasksById.change;
    if (!isPlainRecord(selectedTask)) fail('mcp_owner_invalid_projection', 'Semantic development Plan is missing its change Task');
    const payload = {
      contextReference,
      operation: {
        id: selectedTask.input.operation.id,
        version: selectedTask.input.operation.version,
        contractDigest: selectedTask.input.operation.contractDigest,
      },
      ...(isPlainRecord(context.payload) ? context.payload : {}),
    };
    const created = await developmentRunner.create({ caseId, plan, driveRequestId, payload });
    const driven = await developmentRunner.drive({ caseId, driveRequestId, payload });
    return deepFreeze({
      requestId: requestId ?? null,
      contextReference,
      operation: canonicalClone(payload.operation),
      planDigest: plan.planDigest,
      created: canonicalClone(created),
      drive: canonicalClone(driven),
    });
  };
}

export function createDevelopmentUnitStartAdapter({ runner, resolveContext } = {}) {
  const developmentUnitRunner = assertRunner(runner);
  if (typeof resolveContext !== 'function') fail('mcp_owner_unavailable', 'A context owner resolver is required');
  return async ({ caseId, driveRequestId, contextReference, instruction, validationProfile, identity, requestId } = {}) => {
    assertIdentifier(caseId, 'development unit caseId');
    assertIdentifier(driveRequestId, 'development unit driveRequestId');
    assertIdentifier(contextReference, 'development unit contextReference');
    if (typeof instruction !== 'string' || instruction.length === 0 || instruction.length > 64 * 1024) {
      fail('mcp_tool_invalid_arguments', 'development unit instruction is out of bounds');
    }
    assertIdentifier(validationProfile, 'development unit validationProfile');
    const context = normalizeContext(await resolveContext({ contextReference, identity }), contextReference);
    const plan = defineDevelopmentUnitPlan({
      revisionId: context.revisionId,
      baseTree: context.baseTree,
      repositoryCommitOid: context.repositoryCommitOid,
      objectFormat: context.objectFormat,
      contextProfile: context.contextProfile ?? 'tdev.repository.context.prepare.v1',
      contextScope: context.contextScope ?? null,
      baseIdentity: context.baseIdentity ?? null,
      repositoryBaseIdentity: context.repositoryBaseIdentity ?? null,
      contextCapabilityId: context.contextCapabilityId ?? null,
      instruction,
      validationProfile,
      modelCapabilityId: context.modelCapabilityId ?? null,
      validationCapabilityId: context.validationCapabilityId ?? null,
      writePaths: context.writePaths ?? null,
      caseContract: context.caseContract,
    });
    const payload = {
      contextReference,
      instruction,
      validationProfile,
      ...(isPlainRecord(context.payload) ? context.payload : {}),
    };
    const created = await developmentUnitRunner.create({ caseId, plan, driveRequestId, payload });
    const driven = await developmentUnitRunner.drive({ caseId, driveRequestId, payload });
    return deepFreeze({
      requestId: requestId ?? null,
      contextReference,
      planDigest: plan.planDigest,
      created: canonicalClone(created),
      drive: canonicalClone(driven),
    });
  };
}
