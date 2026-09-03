import {
  ContractError,
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
import { normalizeCaseContract } from './policy.mjs';
import { executeDevelopmentOperation } from './development-operation-profile.mjs';

export const DEVELOPMENT_UNIT_PROFILE = 'tdev.development-unit.v1';
export const DEVELOPMENT_UNIT_CONTEXT_TASK_ID = 'context';
export const DEVELOPMENT_UNIT_MODEL_TASK_ID = 'model';
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

export function defineDevelopmentUnitPlan({
  revisionId,
  baseTree,
  repositoryCommitOid,
  objectFormat = 'sha1',
  contextCapabilityId = null,
  instruction,
  validationProfile = 'tdev.validation.npm-check.v1',
  modelCapabilityId = null,
  validationCapabilityId = null,
  caseContract = undefined,
} = {}) {
  assertIdentifier(revisionId, 'development unit revisionId');
  if (!isPlainRecord(baseTree)) fail('development_unit_plan_invalid', 'Development unit baseTree must be a record');
  if (typeof repositoryCommitOid !== 'string' || repositoryCommitOid.length === 0) fail('development_unit_plan_invalid', 'repositoryCommitOid is required');
  if (!["sha1", "sha256"].includes(objectFormat)) fail("development_unit_plan_invalid", "objectFormat is unsupported");
  if (contextCapabilityId !== null) assertCapabilityIdentifier(contextCapabilityId, "contextCapabilityId");
  if (typeof instruction !== 'string' || instruction.length === 0) fail('development_unit_plan_invalid', 'instruction is required');
  assertIdentifier(validationProfile, 'validationProfile');
  if (modelCapabilityId !== null) assertCapabilityIdentifier(modelCapabilityId, 'modelCapabilityId');
  if (validationCapabilityId !== null) assertCapabilityIdentifier(validationCapabilityId, 'validationCapabilityId');
  const normalizedCaseContract = normalizeCaseContract(caseContract ?? {});
  const normalizedBaseTree = validateTree(canonicalClone(baseTree), normalizedCaseContract);
  const baseDigest = digest(normalizedBaseTree);
  const planInput = {
    revisionId,
    baseTree: normalizedBaseTree,
    tasks: [
      {
        id: DEVELOPMENT_UNIT_CONTEXT_TASK_ID,
        kind: "work",
        dependencies: [],
        claims: [],
        input: {
          profile: "tdev.repository.context.prepare.v1",
          repositoryCommitOid,
          baseDigest,
          objectFormat,
        },
        execution: {
          operation: "tdev.repository.context.prepare.v1",
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
  constructor({ repository, driveAuthority, agent, operationManifest, caseContract = {}, claimLedger = null, capacity = 1 } = {}) {
    this.repository = assertCaseRepository(repository);
    if (!(driveAuthority instanceof CaseAgentDriveAuthority)) fail('development_unit_drive_unconfigured', 'Development unit requires CaseAgentDriveAuthority');
    this.driveAuthority = driveAuthority;
    this.agent = assertAgent(agent);
    if (!isPlainRecord(operationManifest)) fail('development_unit_operation_manifest_missing', 'Development unit requires a D0043 operation manifest');
    this.operationManifest = canonicalClone(operationManifest);
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
    const baseTree = canonicalClone(caseEngine.plan.baseTree);
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
      if (task.id === DEVELOPMENT_UNIT_CONTEXT_TASK_ID) {
        operationRequest = {
          profile: task.input.profile,
          input: {
            repositoryCommitOid: task.input.repositoryCommitOid,
            baseDigest: task.input.baseDigest,
            objectFormat: task.input.objectFormat,
          },
        };
      } else if (task.id === DEVELOPMENT_UNIT_MODEL_TASK_ID) {
        const contextResult = invocation.acceptedResults.find((entry) => entry.taskId === DEVELOPMENT_UNIT_CONTEXT_TASK_ID)?.result;
        const contextReferenceId = contextResult?.value?.referenceId;
        assertIdentifier(contextReferenceId, "contextReferenceId");
        operationRequest = {
          profile: task.input.profile,
          input: {
            repositoryCommitOid: task.input.repositoryCommitOid,
            baseDigest: task.input.baseDigest,
            instruction: task.input.instruction,
            contextReferenceId,
          },
        };
      } else if (task.id === DEVELOPMENT_UNIT_VALIDATION_TASK_ID) {
        const engine = { plan: { baseTree, baseDigest }, caseContract };
        const candidateTree = candidateTreeFromModel(engine, invocation.acceptedResults);
        operationRequest = {
          profile: task.input.profile,
          input: {
            candidateTreeDigest: digest(candidateTree),
            validationProfile: task.input.validationProfile,
          },
        };
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
    return deepFreeze({
      caseId,
      caseState: snapshot.caseState,
      caseRevision: snapshot.caseRevision,
      canonicalTree: canonicalClone(snapshot.canonicalTree),
      canonicalDigest: snapshot.canonicalDigest,
      planDigest: snapshot.plan.planDigest,
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
