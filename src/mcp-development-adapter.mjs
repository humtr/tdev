import {
  ContractError,
  assertIdentifier,
  assertRecordShape,
  canonicalClone,
  deepFreeze,
  isPlainRecord,
} from './canonical.mjs';
import { defineDevelopmentUnitPlan } from './development-unit.mjs';

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
    'validationCapabilityId', 'caseContract', 'payload',
  ], 'development context');
  assertIdentifier(value.revisionId, 'development context.revisionId');
  if (!isPlainRecord(value.baseTree)) fail('mcp_context_invalid', 'Context baseTree must be a record');
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
  return deepFreeze({ ...canonicalClone(value), objectFormat, contextReferenceId: contextReference });
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
      contextCapabilityId: context.contextCapabilityId ?? null,
      instruction,
      validationProfile,
      modelCapabilityId: context.modelCapabilityId ?? null,
      validationCapabilityId: context.validationCapabilityId ?? null,
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
