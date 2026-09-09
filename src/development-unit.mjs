import {
  ContractError,
  assertDigest,
  assertIdentifier,
  assertCapabilityIdentifier,
  canonicalClone,
  deepFreeze,
  digest,
  isPlainRecord,
} from './canonical.mjs';
import { CaseAgentDriveAuthority } from './case-agent-drive.mjs';
import { CaseRepository } from './repository.mjs';
import { definePlan } from './plan.mjs';
import { promote, validateTree } from './promotion.mjs';
import { runDurableCase } from './durable-runner.mjs';
import { normalizeCaseContract, validateRelativePath } from './policy.mjs';
import { executeDevelopmentOperation } from './development-operation-profile.mjs';
import {
  developmentOperationCapabilityId as semanticOperationCapabilityId,
  developmentOperationDescriptor,
  normalizeDevelopmentOperationCatalog,
  normalizeDevelopmentOperationSelection,
  requiredDevelopmentValidation,
} from './development-operation-catalog.mjs';
import {
  createLazyPlanReference,
  normalizeRepositoryBaseIdentity,
} from './lazy-plan-reference.mjs';

export const DEVELOPMENT_UNIT_PROFILE = 'tdev.development-unit.v1';
export const DEVELOPMENT_UNIT_CONTEXT_TASK_ID = 'context';
export const DEVELOPMENT_UNIT_MODEL_TASK_ID = 'model';
export const DEVELOPMENT_UNIT_CHANGE_TASK_ID = 'change';
export const DEVELOPMENT_UNIT_VALIDATION_TASK_ID = 'validate';
export const DEVELOPMENT_UNIT_PROMOTION_TASK_ID = 'promote';

function fail(code, message, details = undefined) {
  throw new ContractError(code, message, details);
}

function assertAgent(agent) {
  if (!isPlainRecord(agent) || !isPlainRecord(agent.identity) || typeof agent.dispatch !== 'function' ||
      typeof agent.observe !== 'function' || typeof agent.authorize !== 'function') {
    fail('development_unit_agent_unconfigured', 'Development unit requires an authenticated Agent bridge');
  }
  assertIdentifier(agent.identity.id, 'agent.identity.id');
  if (!Number.isSafeInteger(agent.identity.epoch) || agent.identity.epoch < 1) {
    fail('development_unit_agent_unconfigured', 'Agent identity epoch is invalid');
  }
  if (!Array.isArray(agent.identity.capabilities)) fail('development_unit_agent_unconfigured', 'Agent identity capabilities are invalid');
  return agent;
}

function assertCaseRepository(repository) {
  if (!(repository instanceof CaseRepository)) fail('development_unit_repository_unconfigured', 'Development unit requires a CaseRepository');
  return repository;
}

export function defineSemanticDevelopmentUnitPlan({
  revisionId,
  baseTree,
  repositoryCommitOid,
  objectFormat = 'sha1',
  contextReferenceId,
  contextScope = null,
  baseIdentity = null,
  repositoryBaseIdentity = null,
  operation,
  operationCatalog,
  writePaths = null,
  caseContract = undefined,
} = {}) {
  assertIdentifier(revisionId, 'development revisionId');
  assertIdentifier(contextReferenceId, 'development contextReferenceId');
  if (!isPlainRecord(baseTree)) fail('development_unit_plan_invalid', 'Development baseTree must be a record');
  if (typeof repositoryCommitOid !== 'string' || !/^[0-9a-f]{40,64}$/u.test(repositoryCommitOid)) {
    fail('development_unit_plan_invalid', 'repositoryCommitOid must be a hexadecimal Git object ID');
  }
  if (!['sha1', 'sha256'].includes(objectFormat)) fail('development_unit_plan_invalid', 'objectFormat is unsupported');
  const normalizedCaseContract = normalizeCaseContract(caseContract ?? {});
  const normalizedBaseTree = validateTree(canonicalClone(baseTree), normalizedCaseContract);
  const baseDigest = digest(normalizedBaseTree);
  if (contextScope !== null && !isPlainRecord(contextScope)) fail('development_unit_plan_invalid', 'contextScope must be an owner-issued scope record');
  if (baseIdentity !== null) {
    if (!isPlainRecord(baseIdentity)) fail('development_unit_plan_invalid', 'baseIdentity must be a record');
    for (const field of ['profile', 'objectFormat', 'commitOid', 'treeOid', 'baseDigest', 'manifestDigest']) {
      if (typeof baseIdentity[field] !== 'string' || baseIdentity[field].length === 0) fail('development_unit_plan_invalid', `baseIdentity.${field} is required`);
    }
    if (baseIdentity.schemaVersion !== 1 || baseIdentity.profile !== 'tdev.repository-base-identity.v1' ||
        baseIdentity.objectFormat !== objectFormat || baseIdentity.commitOid !== repositoryCommitOid || baseIdentity.baseDigest !== baseDigest) {
      fail('development_unit_plan_base_identity_mismatch', 'baseIdentity does not bind the Plan base');
    }
    assertDigest(baseIdentity.manifestDigest, 'baseIdentity.manifestDigest');
  }
  let normalizedRepositoryBaseIdentity = null;
  if (repositoryBaseIdentity !== null) {
    normalizedRepositoryBaseIdentity = normalizeRepositoryBaseIdentity(repositoryBaseIdentity, { objectFormat, commitOid: repositoryCommitOid });
    if (baseIdentity !== null && baseIdentity.manifestDigest !== normalizedRepositoryBaseIdentity.manifestDigest) {
      fail('development_unit_plan_base_identity_mismatch', 'baseIdentity and repositoryBaseIdentity do not bind the same complete manifest');
    }
  }
  if (contextScope !== null && baseIdentity !== null && baseIdentity.baseDigest !== baseDigest && normalizedRepositoryBaseIdentity === null) {
    fail('development_unit_plan_repository_identity_missing', 'A scoped semantic Plan requires repositoryBaseIdentity for the full repository base');
  }
  if (writePaths !== null) {
    if (!Array.isArray(writePaths) || writePaths.length === 0 || writePaths.length > normalizedCaseContract.limits.maxWritesPerChangeSet) {
      fail('development_unit_plan_invalid', 'writePaths must be a bounded non-empty owner-issued array');
    }
    const normalizedWritePaths = writePaths.map((value) => validateRelativePath(value, normalizedCaseContract.pathPolicy)).sort();
    if (new Set(normalizedWritePaths).size !== normalizedWritePaths.length) fail('development_unit_plan_invalid', 'writePaths contains a duplicate path');
    writePaths = normalizedWritePaths;
  }
  const catalog = normalizeDevelopmentOperationCatalog(operationCatalog);
  const selected = normalizeDevelopmentOperationSelection(catalog, operation, {
    baseDigest,
    caseContract: normalizedCaseContract,
    writePaths,
  });
  const descriptor = developmentOperationDescriptor(catalog, selected.id, selected.version);
  if (descriptor.resultKind !== 'changeset' || descriptor.effectClass !== 'result-only') {
    fail('development_unit_operation_invalid', 'Selected development operation must return a result-only ChangeSet');
  }
  const requiredValidation = requiredDevelopmentValidation(catalog);
  const validationDescriptor = developmentOperationDescriptor(catalog, requiredValidation.operationId, requiredValidation.operationVersion);
  const changeCapabilityId = semanticOperationCapabilityId(catalog, selected.id, selected.version);
  const validationCapabilityId = semanticOperationCapabilityId(catalog, requiredValidation.operationId, requiredValidation.operationVersion);
  const planInput = {
    revisionId,
    baseTree: normalizedBaseTree,
    ...(normalizedRepositoryBaseIdentity === null ? {} : {
      baseReference: createLazyPlanReference({
        repositoryBaseIdentity: normalizedRepositoryBaseIdentity,
        scope: contextScope,
        semanticBaseDigest: baseDigest,
      }),
    }),
    tasks: [
      {
        id: DEVELOPMENT_UNIT_CHANGE_TASK_ID,
        kind: 'work',
        dependencies: [],
        claims: [],
        input: {
          operation: canonicalClone(selected),
          repositoryCommitOid,
          baseDigest,
          objectFormat,
          contextReferenceId,
          ...(contextScope === null ? {} : { contextScope: canonicalClone(contextScope) }),
          ...(baseIdentity === null ? {} : { baseIdentity: canonicalClone(baseIdentity) }),
          ...(normalizedRepositoryBaseIdentity === null ? {} : { repositoryBaseIdentity: canonicalClone(normalizedRepositoryBaseIdentity) }),
          ...(writePaths === null ? {} : { writePaths: canonicalClone(writePaths) }),
        },
        execution: {
          operation: selected.id,
          resultKind: 'changeset',
          effectClass: 'result-only',
          retry: { maxAttempts: 1 },
        },
        requiredCapabilities: [changeCapabilityId],
      },
      {
        id: DEVELOPMENT_UNIT_VALIDATION_TASK_ID,
        kind: 'work',
        dependencies: [DEVELOPMENT_UNIT_CHANGE_TASK_ID],
        claims: [],
        input: {
          operation: {
            id: requiredValidation.operationId,
            version: requiredValidation.operationVersion,
            contractDigest: requiredValidation.contractDigest,
          },
          policyId: requiredValidation.policyId,
          bindingId: requiredValidation.bindingId,
        },
        execution: {
          operation: requiredValidation.operationId,
          resultKind: validationDescriptor.resultKind,
          effectClass: validationDescriptor.effectClass,
          retry: { maxAttempts: 1 },
          requirePassed: true,
        },
        requiredCapabilities: [validationCapabilityId],
      },
      {
        id: DEVELOPMENT_UNIT_PROMOTION_TASK_ID,
        kind: 'promotion',
        dependencies: [DEVELOPMENT_UNIT_CHANGE_TASK_ID, DEVELOPMENT_UNIT_VALIDATION_TASK_ID],
        claims: [{ mode: 'write', resource: 'canonical:tree' }],
        input: {},
      },
    ],
  };
  return definePlan(planInput, { caseContract: normalizedCaseContract });
}

export function defineDevelopmentUnitPlan({
  revisionId,
  baseTree,
  repositoryCommitOid,
  objectFormat = 'sha1',
  contextProfile = 'tdev.repository.context.prepare.v1',
  contextScope = null,
  baseIdentity = null,
  repositoryBaseIdentity = null,
  contextCapabilityId = null,
  instruction,
  validationProfile = 'tdev.validation.npm-check.v1',
  modelCapabilityId = null,
  validationCapabilityId = null,
  writePaths = null,
  caseContract = undefined,
} = {}) {
  assertIdentifier(revisionId, 'development unit revisionId');
  if (!isPlainRecord(baseTree)) fail('development_unit_plan_invalid', 'Development unit baseTree must be a record');
  if (typeof repositoryCommitOid !== 'string' || repositoryCommitOid.length === 0) fail('development_unit_plan_invalid', 'repositoryCommitOid is required');
  if (!["sha1", "sha256"].includes(objectFormat)) fail("development_unit_plan_invalid", "objectFormat is unsupported");
  assertIdentifier(contextProfile, 'contextProfile');
  if (contextProfile === 'tdev.repository.context.prepare.lazy.v1') {
    if (!isPlainRecord(contextScope)) fail('development_unit_plan_invalid', 'Lazy context plans require an owner-issued context scope');
  } else if (contextScope !== null) {
    fail('development_unit_plan_invalid', 'A context scope is only valid with the lazy context profile');
  }
  const normalizedCaseContract = normalizeCaseContract(caseContract ?? {});
  const normalizedBaseTree = validateTree(canonicalClone(baseTree), normalizedCaseContract);
  const baseDigest = digest(normalizedBaseTree);
  if (contextProfile === 'tdev.repository.context.prepare.lazy.v1' && baseIdentity === null) {
    fail('development_unit_plan_base_identity_missing', 'Lazy context plans require the owner-issued full-base identity');
  }
  if (baseIdentity !== null) {
    if (!isPlainRecord(baseIdentity)) fail('development_unit_plan_invalid', 'baseIdentity must be a record');
    for (const field of ['profile', 'objectFormat', 'commitOid', 'treeOid', 'baseDigest', 'manifestDigest']) {
      if (typeof baseIdentity[field] !== 'string' || baseIdentity[field].length === 0) fail('development_unit_plan_invalid', `baseIdentity.${field} is required`);
    }
    if (baseIdentity.schemaVersion !== 1 || baseIdentity.profile !== 'tdev.repository-base-identity.v1' || baseIdentity.objectFormat !== objectFormat || baseIdentity.commitOid !== repositoryCommitOid || baseIdentity.baseDigest !== baseDigest) {
      fail('development_unit_plan_base_identity_mismatch', 'baseIdentity does not bind the Plan base');
    }
    assertDigest(baseIdentity.manifestDigest, 'baseIdentity.manifestDigest');
  }
  let normalizedRepositoryBaseIdentity = null;
  if (repositoryBaseIdentity !== null) {
    normalizedRepositoryBaseIdentity = normalizeRepositoryBaseIdentity(repositoryBaseIdentity, {
      objectFormat,
      commitOid: repositoryCommitOid,
    });
    if (baseIdentity !== null && baseIdentity.manifestDigest !== normalizedRepositoryBaseIdentity.manifestDigest) {
      fail('development_unit_plan_base_identity_mismatch', 'baseIdentity and repositoryBaseIdentity do not bind the same complete manifest');
    }
  }
  if (contextProfile === 'tdev.repository.context.prepare.lazy.v1' && baseIdentity !== null &&
      baseIdentity.baseDigest !== baseDigest && normalizedRepositoryBaseIdentity === null) {
    fail('development_unit_plan_repository_identity_missing', 'A scoped lazy Plan whose semantic tree is smaller than the full base requires repositoryBaseIdentity');
  }
  if (contextCapabilityId !== null) assertCapabilityIdentifier(contextCapabilityId, "contextCapabilityId");
  if (typeof instruction !== 'string' || instruction.length === 0) fail('development_unit_plan_invalid', 'instruction is required');
  assertIdentifier(validationProfile, 'validationProfile');
  if (modelCapabilityId !== null) assertCapabilityIdentifier(modelCapabilityId, 'modelCapabilityId');
  if (validationCapabilityId !== null) assertCapabilityIdentifier(validationCapabilityId, 'validationCapabilityId');
  if (writePaths !== null) {
    if (!Array.isArray(writePaths) || writePaths.length === 0 || writePaths.length > 256) fail('development_unit_plan_invalid', 'writePaths must be a bounded non-empty array');
    const normalizedWritePaths = writePaths.map((value) => validateRelativePath(value)).sort();
    if (new Set(normalizedWritePaths).size !== normalizedWritePaths.length) fail('development_unit_plan_invalid', 'writePaths contains a duplicate path');
    writePaths = normalizedWritePaths;
  }
  const planInput = {
    revisionId,
    baseTree: normalizedBaseTree,
    ...(normalizedRepositoryBaseIdentity === null ? {} : {
      baseReference: createLazyPlanReference({
        repositoryBaseIdentity: normalizedRepositoryBaseIdentity,
        scope: contextScope,
        semanticBaseDigest: baseDigest,
      }),
    }),
    tasks: [
      {
        id: DEVELOPMENT_UNIT_CONTEXT_TASK_ID,
        kind: "work",
        dependencies: [],
        claims: [],
        input: {
          profile: contextProfile,
          repositoryCommitOid,
          baseDigest,
          objectFormat,
          ...(contextProfile === 'tdev.repository.context.prepare.lazy.v1' ? { scope: canonicalClone(contextScope) } : {}),
          ...(baseIdentity === null ? {} : { baseIdentity: canonicalClone(baseIdentity) }),
          ...(normalizedRepositoryBaseIdentity === null ? {} : { repositoryBaseIdentity: canonicalClone(normalizedRepositoryBaseIdentity) }),
        },
        execution: {
          operation: contextProfile,
          resultKind: "observation",
          effectClass: "result-only",
          retry: { maxAttempts: 1 },
        },
        requiredCapabilities: contextCapabilityId === null ? [] : [contextCapabilityId],
      },
      {
        id: DEVELOPMENT_UNIT_MODEL_TASK_ID,
        kind: 'work',
        dependencies: [DEVELOPMENT_UNIT_CONTEXT_TASK_ID],
        claims: [],
        input: {
          profile: 'tdev.model.repository.execute.v1',
          repositoryCommitOid,
          baseDigest,
          instruction,
          objectFormat,
          ...(contextProfile === 'tdev.repository.context.prepare.lazy.v1' ? { contextProfile, contextScope: canonicalClone(contextScope) } : {}),
          ...(baseIdentity === null ? {} : { baseIdentity: canonicalClone(baseIdentity) }),
          ...(normalizedRepositoryBaseIdentity === null ? {} : { repositoryBaseIdentity: canonicalClone(normalizedRepositoryBaseIdentity) }),
          ...(writePaths === null ? {} : { writePaths }),
        },
        execution: {
          operation: 'tdev.model.repository.execute.v1',
          resultKind: 'changeset',
          effectClass: 'result-only',
          retry: { maxAttempts: 1 },
        },
        requiredCapabilities: modelCapabilityId === null ? [] : [modelCapabilityId],
      },
      {
        id: DEVELOPMENT_UNIT_VALIDATION_TASK_ID,
        kind: 'work',
        dependencies: [DEVELOPMENT_UNIT_MODEL_TASK_ID],
        claims: [],
        input: {
          profile: 'tdev.repository.validate.v1',
          validationProfile,
        },
        execution: {
          operation: 'tdev.repository.validate.v1',
          resultKind: 'validation',
          effectClass: 'result-only',
          retry: { maxAttempts: 1 },
          requirePassed: true,
        },
        requiredCapabilities: validationCapabilityId === null ? [] : [validationCapabilityId],
      },
      {
        id: DEVELOPMENT_UNIT_PROMOTION_TASK_ID,
        kind: 'promotion',
        dependencies: [DEVELOPMENT_UNIT_CONTEXT_TASK_ID, DEVELOPMENT_UNIT_MODEL_TASK_ID, DEVELOPMENT_UNIT_VALIDATION_TASK_ID],
        claims: [{ mode: 'write', resource: 'canonical:tree' }],
        input: {},
      },
    ],
  };
  return definePlan(planInput, { caseContract: normalizedCaseContract });
}

function caseObservation(engine) {
  const state = engine.snapshot();
  const terminal = ['succeeded', 'failed', 'cancelled'].includes(state.caseState);
  return {
    caseRevision: state.caseRevision,
    terminal,
    ready: !terminal && engine.readyTaskIds().length > 0,
    terminalReceiptDigest: terminal ? digest({ caseId: state.caseId, caseRevision: state.caseRevision, caseState: state.caseState }) : null,
  };
}

function candidateTreeFromModel(engine, acceptedResults) {
  const model = acceptedResults.find((entry) => entry.taskId === DEVELOPMENT_UNIT_MODEL_TASK_ID)?.result;
  if (model === undefined) fail('development_unit_model_result_missing', 'Validation requires the accepted model result');
  return promote(engine.plan.baseTree, [{ taskId: DEVELOPMENT_UNIT_MODEL_TASK_ID, result: model }], engine.plan.baseDigest, {
    caseContract: engine.caseContract,
  }).tree;
}

export class DevelopmentUnitRunner {
  constructor({ repository, driveAuthority, agent, operationManifest = null, operationCatalog = null, caseContract = {}, claimLedger = null, capacity = 1 } = {}) {
    this.repository = assertCaseRepository(repository);
    if (!(driveAuthority instanceof CaseAgentDriveAuthority)) fail('development_unit_drive_unconfigured', 'Development unit requires CaseAgentDriveAuthority');
    this.driveAuthority = driveAuthority;
    this.agent = assertAgent(agent);
    if (operationManifest !== null && !isPlainRecord(operationManifest)) fail('development_unit_operation_manifest_invalid', 'Legacy development operation manifest must be a record when present');
    if (operationCatalog !== null && !isPlainRecord(operationCatalog)) fail('development_unit_operation_catalog_invalid', 'Semantic development operation catalog must be a record when present');
    if (operationManifest === null && operationCatalog === null) fail('development_unit_operation_contract_missing', 'Development unit requires a legacy manifest or semantic operation catalog');
    this.operationManifest = operationManifest === null ? null : canonicalClone(operationManifest);
    this.operationCatalog = operationCatalog === null ? null : normalizeDevelopmentOperationCatalog(operationCatalog);
    this.caseContract = caseContract?.contractDigest ? canonicalClone(caseContract) : normalizeCaseContract(caseContract);
    this.claimLedger = claimLedger;
    if (!Number.isSafeInteger(capacity) || capacity < 1) fail('development_unit_capacity_invalid', 'Development unit capacity must be positive');
    this.capacity = capacity;
  }

  async create({ caseId, plan, driveRequestId, payload = {} } = {}) {
    assertIdentifier(caseId, 'caseId');
    assertIdentifier(driveRequestId, 'driveRequestId');
    if (!plan || typeof plan !== 'object') fail('development_unit_plan_invalid', 'Development unit create requires a compiled plan');
    const engine = await this.repository.create({ caseId, plan, caseContract: this.caseContract });
    const drive = this.driveAuthority.initialize({ caseId, driveRequestId, payload });
    return deepFreeze({ caseId, planDigest: engine.plan.planDigest, drive });
  }

  async #loadCase(caseId) {
    const engine = await this.repository.load(caseId, { reopen: true });
    if (engine === null) fail('case_not_found', `Case ${caseId} does not exist`);
    return engine;
  }

  async #dispatchCase(caseId, driveRequestId, payload) {
    const caseEngine = await this.repository.load(caseId, { reopen: false });
    if (caseEngine === null) fail('case_not_found', `Case ${caseId} does not exist`);
    const baseDigest = caseEngine.plan.baseDigest;
    const caseContract = canonicalClone(caseEngine.caseContract);
    return runDurableCase(this.repository, caseId, async (invocation) => {
      const task = invocation.task;
      if (task.kind === 'promotion') return null;
      const authorized = await this.agent.authorize(deepFreeze({
        caseId,
        driveRequestId,
        taskId: task.id,
        attemptId: invocation.attempt.id,
        executor: this.agent.identity,
      }));
      if (authorized !== true) fail('development_unit_agent_denied', 'Authenticated Agent bridge denied the Task');

      let operationRequest;
      if (task.id === DEVELOPMENT_UNIT_CHANGE_TASK_ID) {
        operationRequest = {
          operation: canonicalClone(task.input.operation),
          repositoryCommitOid: task.input.repositoryCommitOid,
          baseDigest: task.input.baseDigest,
          contextReferenceId: task.input.contextReferenceId,
          caseContract,
          ...(task.input.writePaths === undefined ? {} : { writePaths: canonicalClone(task.input.writePaths) }),
          ...(task.input.baseIdentity === undefined ? {} : { baseIdentity: canonicalClone(task.input.baseIdentity) }),
          ...(task.input.repositoryBaseIdentity === undefined ? {} : { repositoryBaseIdentity: canonicalClone(task.input.repositoryBaseIdentity) }),
        };
      } else if (task.id === DEVELOPMENT_UNIT_CONTEXT_TASK_ID) {
        operationRequest = {
          profile: task.input.profile,
          input: {
            repositoryCommitOid: task.input.repositoryCommitOid,
            baseDigest: task.input.baseDigest,
            objectFormat: task.input.objectFormat,
            ...(task.input.scope === undefined ? {} : { scope: task.input.scope }),
            ...(task.input.baseIdentity === undefined ? {} : { baseIdentity: task.input.baseIdentity }),
            ...(task.input.repositoryBaseIdentity === undefined ? {} : { repositoryBaseIdentity: task.input.repositoryBaseIdentity }),
          },
        };
      } else if (task.id === DEVELOPMENT_UNIT_MODEL_TASK_ID) {
        const contextResult = invocation.acceptedResults.find((entry) => entry.taskId === DEVELOPMENT_UNIT_CONTEXT_TASK_ID)?.result;
        const contextReferenceId = contextResult?.value?.referenceId;
        assertIdentifier(contextReferenceId, "contextReferenceId");
        const contextScopeDigest = contextResult?.value?.scopeDigest ?? null;
        if (task.input.contextProfile === 'tdev.repository.context.prepare.lazy.v1') assertDigest(contextScopeDigest, 'contextScopeDigest');
        operationRequest = {
          profile: task.input.profile,
          input: {
            repositoryCommitOid: task.input.repositoryCommitOid,
            baseDigest: task.input.baseDigest,
            instruction: task.input.instruction,
            ...(task.input.objectFormat === undefined ? {} : { objectFormat: task.input.objectFormat }),
            ...(task.input.contextProfile === undefined ? {} : { contextProfile: task.input.contextProfile, contextScope: task.input.contextScope }),
            ...(contextScopeDigest === null ? {} : { contextScopeDigest }),
            ...(task.input.baseIdentity === undefined ? {} : { baseIdentity: task.input.baseIdentity }),
            ...(task.input.repositoryBaseIdentity === undefined ? {} : { repositoryBaseIdentity: task.input.repositoryBaseIdentity }),
            ...(task.input.writePaths === undefined ? {} : { writePaths: task.input.writePaths }),
            contextReferenceId,
          },
        };
      } else if (task.id === DEVELOPMENT_UNIT_VALIDATION_TASK_ID) {
        if (isPlainRecord(task.input.operation)) {
          const change = invocation.acceptedResults.find((entry) => entry.taskId === DEVELOPMENT_UNIT_CHANGE_TASK_ID)?.result;
          const candidateTreeDigest = change?.evidence?.candidateTreeDigest;
          assertDigest(candidateTreeDigest, 'candidateTreeDigest');
          operationRequest = {
            operation: canonicalClone(task.input.operation),
            policyId: task.input.policyId,
            bindingId: task.input.bindingId,
            candidateTreeDigest,
          };
        } else {
          const model = invocation.acceptedResults.find((entry) => entry.taskId === DEVELOPMENT_UNIT_MODEL_TASK_ID)?.result;
          const candidateTreeDigest = model?.evidence?.candidateTreeDigest;
          if (candidateTreeDigest !== undefined) assertDigest(candidateTreeDigest, 'candidateTreeDigest');
          const fallbackDigest = candidateTreeDigest === undefined
            ? digest(candidateTreeFromModel({ plan: { baseTree: caseEngine.plan.baseTree, baseDigest }, caseContract }, invocation.acceptedResults))
            : candidateTreeDigest;
          operationRequest = {
            profile: task.input.profile,
            input: {
              candidateTreeDigest: fallbackDigest,
              validationProfile: task.input.validationProfile,
            },
          };
        }
      } else {
        fail("development_unit_task_unsupported", "Unsupported development unit Task");
      }
      const dispatchEnvelope = deepFreeze({
        caseId,
        driveRequestId,
        taskId: task.id,
        attemptId: invocation.attempt.id,
        payload: canonicalClone(payload),
        operationRequest,
        invocation: {
          caseId: invocation.caseId,
          planRevisionId: invocation.planRevisionId,
          planDigest: invocation.planDigest,
          caseContractDigest: invocation.caseContractDigest,
          baseDigest: invocation.baseDigest,
          effectKey: invocation.effectKey,
          fencingToken: invocation.fencingToken,
          claimLease: invocation.claimLease,
          task: invocation.task,
          attempt: invocation.attempt,
          acceptedResults: invocation.acceptedResults,
        },
      });
      return this.agent.dispatch({ ...dispatchEnvelope, signal: invocation.signal });
    }, {
      capacity: this.capacity,
      claimLedger: this.claimLedger,
      executorIdentity: this.agent.identity,
      executorCapabilities: this.agent.identity.capabilities,
    });
  }

  async drive({ caseId, driveRequestId, payload = {} } = {}) {
    assertIdentifier(caseId, 'caseId');
    assertIdentifier(driveRequestId, 'driveRequestId');
    const readCase = async () => caseObservation(await this.#loadCase(caseId));
    const readAgent = async () => {
      const observation = await this.agent.observe({ caseId, driveRequestId });
      if (!isPlainRecord(observation)) fail('development_unit_agent_observation_invalid', 'Agent observation must be a record');
      return observation;
    };
    const dispatch = async () => {
      const report = await this.#dispatchCase(caseId, driveRequestId, payload);
      const snapshot = report.snapshot;
      return {
        classification: report.caseState === 'succeeded' ? 'accepted' : 'reconciling',
        caseRevision: snapshot.caseRevision,
        receiptDigest: report.caseState === 'succeeded' ? digest({ caseId, caseRevision: snapshot.caseRevision, status: report.status }) : null,
        deliveryDigest: digest({ caseId, caseRevision: snapshot.caseRevision, status: report.status, agent: this.agent.identity.id }),
      };
    };
    return this.driveAuthority.drive(caseId, {
      driveRequestId,
      payload,
      readCase,
      readAgent,
      dispatch,
    });
  }

  async candidate(caseId) {
    const engine = await this.#loadCase(caseId);
    const snapshot = engine.snapshot();
    const contextResult = snapshot.taskStates[DEVELOPMENT_UNIT_CONTEXT_TASK_ID]?.acceptedResult;
    const changeResult = snapshot.taskStates[DEVELOPMENT_UNIT_CHANGE_TASK_ID]?.acceptedResult;
    const modelResult = snapshot.taskStates[DEVELOPMENT_UNIT_MODEL_TASK_ID]?.acceptedResult;
    const validationResult = snapshot.taskStates[DEVELOPMENT_UNIT_VALIDATION_TASK_ID]?.acceptedResult;
    const changeEvidence = isPlainRecord(changeResult?.evidence) ? changeResult.evidence : {};
    const modelEvidence = isPlainRecord(modelResult?.evidence) ? modelResult.evidence : {};
    const validationEvidence = isPlainRecord(validationResult?.evidence) ? validationResult.evidence : {};
    const semanticTaskInput = snapshot.plan.tasksById[DEVELOPMENT_UNIT_CHANGE_TASK_ID]?.input ?? null;
    const effectiveChangeResult = changeResult ?? modelResult;
    const taskOutcomes = Object.fromEntries(snapshot.plan.taskOrder.map((taskId) => {
      const state = snapshot.taskStates[taskId];
      return [taskId, {
        state: state?.state ?? null,
        error: state?.error ?? null,
        acceptedResultDigest: state?.acceptedResultDigest ?? null,
      }];
    }));
    return deepFreeze({
      caseId,
      caseState: snapshot.caseState,
      caseRevision: snapshot.caseRevision,
      canonicalTree: canonicalClone(snapshot.canonicalTree),
      canonicalDigest: snapshot.canonicalDigest,
      planDigest: snapshot.plan.planDigest,
      baseReference: snapshot.plan.baseReference ?? null,
      baseIdentity: contextResult?.value?.baseIdentity ?? semanticTaskInput?.baseIdentity ?? null,
      repositoryBaseIdentity: contextResult?.value?.repositoryBaseIdentity ?? semanticTaskInput?.repositoryBaseIdentity ?? snapshot.plan.baseReference?.repositoryBaseIdentity ?? null,
      contextReferenceId: semanticTaskInput?.contextReferenceId ?? contextResult?.value?.referenceId ?? null,
      contextDigest: contextResult?.value?.contextDigest ?? null,
      manifestDigest: contextResult?.value?.manifestDigest ?? semanticTaskInput?.baseIdentity?.manifestDigest ?? semanticTaskInput?.repositoryBaseIdentity?.manifestDigest ?? null,
      scopeDigest: contextResult?.value?.scopeDigest ?? null,
      candidateTreeDigest: effectiveChangeResult?.evidence?.candidateTreeDigest ?? null,
      modelProcessStarts: changeEvidence.modelProcessStarts ?? modelEvidence.processStarts ?? null,
      modelProcessCleanup: modelEvidence.processCleanup ?? null,
      modelWorkspaceCleanup: modelEvidence.workspaceCleanup ?? null,
      validationProcessCleanup: validationEvidence.processCleanup ?? null,
      candidateCleanup: validationEvidence.candidateCleanup ?? null,
      taskOutcomes,
    });
  }
}

export function createDevelopmentUnitOperationExecutor({ manifest, capabilities, contextExecutor, modelExecutor, validationExecutor } = {}) {
  return async ({ operationRequest, signal }) => {
    const output = await executeDevelopmentOperation({
      manifest,
      request: operationRequest,
      capabilities,
      signal,
      contextExecutor,
      modelExecutor,
      validationExecutor,
    });
    return output.result;
  };
}
