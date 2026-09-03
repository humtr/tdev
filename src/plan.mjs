import {
  ContractError,
  assertIdentifier,
  assertCapabilityIdentifier,
  assertRecordShape,
  canonicalClone,
  canonicalJson,
  compareText,
  createRecord,
  deepFreeze,
  digest,
  isPlainRecord,
  typedDigest,
} from './canonical.mjs';
import { normalizeClaims } from './claims.mjs';
import { WORK_RESULT_KINDS } from './results.mjs';
import { normalizeCaseContract } from './policy.mjs';
import { validateTree } from './promotion.mjs';

const EFFECT_CLASSES = new Set(['result-only', 'idempotent-external', 'reconcilable-external']);
const RESULT_KINDS = new Set(WORK_RESULT_KINDS);

function normalizeStringArray(values, label, { max, identifier = true, capability = false } = {}) {
  if (!Array.isArray(values)) throw new ContractError('invalid_array', `${label} must be an array`);
  if (max !== undefined && values.length > max) {
    throw new ContractError('array_limit_exceeded', `${label} exceeds ${max} entries`);
  }
  const normalized = values.map((value) => {
    if (identifier) (capability ? assertCapabilityIdentifier : assertIdentifier)(value, label);
    else if (typeof value !== 'string' || value.length === 0) throw new ContractError('invalid_string', `${label} must contain non-empty strings`);
    return value;
  });
  const seen = new Set();
  for (const value of normalized) {
    if (seen.has(value)) throw new ContractError('duplicate_array_item', `${label} contains duplicate ${value}`);
    seen.add(value);
  }
  return normalized.sort(compareText);
}

function normalizeExecution(rawExecution, kind, limits) {
  const promotionExecution = {
    operation: 'tdev.promotion',
    resultKind: 'promotion',
    effectClass: 'result-only',
    retry: deepFreeze({ maxAttempts: 1 }),
    requirePassed: false,
  };
  if (kind === 'promotion') {
    if (rawExecution !== undefined) {
      assertRecordShape(rawExecution, ['operation', 'resultKind', 'effectClass', 'retry', 'requirePassed'], [], 'promotion execution');
      assertRecordShape(rawExecution.retry, ['maxAttempts'], [], 'promotion execution.retry');
      if (rawExecution.operation !== promotionExecution.operation ||
          rawExecution.resultKind !== promotionExecution.resultKind ||
          rawExecution.effectClass !== promotionExecution.effectClass ||
          rawExecution.retry.maxAttempts !== 1 ||
          rawExecution.requirePassed !== false) {
        throw new ContractError('invalid_execution', 'Promotion execution contract is fixed and internal');
      }
    }
    return deepFreeze(promotionExecution);
  }
  const input = rawExecution ?? {};
  assertRecordShape(input, [], ['operation', 'resultKind', 'effectClass', 'retry', 'requirePassed'], 'work execution');
  const operation = input.operation ?? 'tdev.work.changeset';
  assertIdentifier(operation, 'execution.operation');
  const resultKind = input.resultKind ?? 'changeset';
  if (!RESULT_KINDS.has(resultKind)) {
    throw new ContractError('invalid_result_kind', `Unsupported result kind: ${String(resultKind)}`);
  }
  const effectClass = input.effectClass ?? 'result-only';
  if (!EFFECT_CLASSES.has(effectClass)) {
    throw new ContractError('invalid_effect_class', `Unsupported effect class: ${String(effectClass)}`);
  }
  if (resultKind === 'effect-receipt' && effectClass === 'result-only') {
    throw new ContractError('invalid_execution', 'effect-receipt requires an external effect class');
  }
  if (resultKind !== 'effect-receipt' && effectClass !== 'result-only') {
    throw new ContractError('invalid_execution', 'External effect Tasks must return effect-receipt in this source slice');
  }
  const retryInput = input.retry ?? {};
  assertRecordShape(retryInput, [], ['maxAttempts'], 'work execution.retry');
  const maxAttempts = retryInput.maxAttempts ?? 3;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > limits.maxAttemptsPerTask) {
    throw new ContractError(
      'invalid_retry',
      `retry.maxAttempts must be an integer from 1 to ${limits.maxAttemptsPerTask}`,
    );
  }
  const requirePassed = input.requirePassed ?? false;
  if (typeof requirePassed !== 'boolean') throw new ContractError('invalid_execution', 'requirePassed must be boolean');
  if (requirePassed && resultKind !== 'validation') {
    throw new ContractError('invalid_execution', 'requirePassed is only valid for validation results');
  }
  return deepFreeze({
    operation,
    resultKind,
    effectClass,
    retry: deepFreeze({ maxAttempts }),
    requirePassed,
  });
}

function assertAcyclic(tasksById, taskOrder, reverseDependenciesById) {
  const indegree = createRecord();
  for (const taskId of taskOrder) indegree[taskId] = tasksById[taskId].dependencies.length;
  const ready = taskOrder.filter((taskId) => indegree[taskId] === 0);
  let visited = 0;
  while (ready.length > 0) {
    // Kahn traversal order does not affect acyclicity or the deterministic cycle report,
    // which is derived from sorted taskOrder below. A stack avoids repeated sort/shift.
    const taskId = ready.pop();
    visited += 1;
    for (const dependent of reverseDependenciesById[taskId]) {
      indegree[dependent] -= 1;
      if (indegree[dependent] === 0) ready.push(dependent);
    }
  }
  if (visited !== taskOrder.length) {
    const cyclic = taskOrder.filter((taskId) => indegree[taskId] > 0);
    throw new ContractError('cycle', 'Task graph contains a cycle', { taskIds: cyclic });
  }
}

export function isCompiledPlan(value) {
  if (!isPlainRecord(value)) return false;
  const expected = [
    'revisionId', 'baseTree', 'baseDigest', 'taskOrder', 'tasksById',
    'promotionTaskId', 'reverseDependenciesById', 'planDigest',
  ].sort(compareText);
  const actual = Object.keys(value).sort(compareText);
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]) &&
    Array.isArray(value.taskOrder) &&
    isPlainRecord(value.tasksById) &&
    isPlainRecord(value.reverseDependenciesById) &&
    value.taskOrder.every((taskId) => typeof taskId === 'string' && Object.hasOwn(value.tasksById, taskId));
}

export function definePlan(input, options = {}) {
  assertRecordShape(input, ['revisionId', 'tasks'], ['baseTree'], 'Plan');
  const caseContract = options.caseContract?.contractDigest
    ? options.caseContract
    : normalizeCaseContract(options.caseContract ?? {});
  assertIdentifier(input.revisionId, 'revisionId');
  const baseTree = validateTree(canonicalClone(input.baseTree ?? {}), caseContract);
  if (!Array.isArray(input.tasks) || input.tasks.length === 0) {
    throw new ContractError('invalid_plan', 'Plan must contain tasks');
  }
  if (input.tasks.length > caseContract.limits.maxTasks) {
    throw new ContractError('task_limit_exceeded', `Plan exceeds ${caseContract.limits.maxTasks} Tasks`);
  }

  const tasksById = createRecord();
  for (const rawTask of input.tasks) {
    assertRecordShape(rawTask, ['id'], ['kind', 'dependencies', 'claims', 'input', 'execution', 'requiredCapabilities'], 'Task');
    assertIdentifier(rawTask.id, 'task.id');
    if (Object.hasOwn(tasksById, rawTask.id)) {
      throw new ContractError('duplicate_task', `Duplicate Task ID: ${rawTask.id}`);
    }
    const kind = rawTask.kind ?? 'work';
    if (kind !== 'work' && kind !== 'promotion') {
      throw new ContractError('invalid_task_kind', `Unsupported Task kind: ${kind}`);
    }
    const dependencies = normalizeStringArray(rawTask.dependencies ?? [], `dependencies:${rawTask.id}`, {
      max: caseContract.limits.maxDependenciesPerTask,
    });
    if (dependencies.includes(rawTask.id)) {
      throw new ContractError('self_dependency', `Task ${rawTask.id} depends on itself`);
    }
    const claims = normalizeClaims(rawTask.claims ?? [], { maxClaims: caseContract.limits.maxClaimsPerTask });
    const execution = normalizeExecution(rawTask.execution, kind, caseContract.limits);
    const requiredCapabilities = normalizeStringArray(rawTask.requiredCapabilities ?? [], `requiredCapabilities:${rawTask.id}`, {
      max: 1_000,
      capability: true,
    });

    if (kind === 'work') {
      const canonical = claims.find((claim) => claim.resource.startsWith('canonical:'));
      if (canonical) {
        throw new ContractError('forbidden_claim', `Work Task ${rawTask.id} cannot claim ${canonical.resource}`);
      }
      const remote = claims.find((claim) => claim.resource.startsWith('remote:'));
      if (remote && execution.effectClass === 'result-only') {
        throw new ContractError('forbidden_claim', `Result-only Task ${rawTask.id} cannot claim ${remote.resource}`);
      }
    }

    const taskInput = canonicalClone(rawTask.input ?? {});
    const taskInputBytes = Buffer.byteLength(canonicalJson(taskInput), 'utf8');
    if (taskInputBytes > caseContract.limits.maxTaskInputBytes) {
      throw new ContractError('task_input_limit_exceeded', `Task ${rawTask.id} input exceeds ${caseContract.limits.maxTaskInputBytes} bytes`, {
        size: taskInputBytes,
      });
    }

    tasksById[rawTask.id] = deepFreeze({
      id: rawTask.id,
      kind,
      dependencies,
      claims,
      input: deepFreeze(taskInput),
      requiredCapabilities,
      execution,
    });
  }

  const taskOrder = Object.keys(tasksById).sort(compareText);
  const reverseDependenciesById = createRecord(taskOrder.map((taskId) => [taskId, []]));
  for (const task of Object.values(tasksById)) {
    for (const dependency of task.dependencies) {
      if (!Object.hasOwn(tasksById, dependency)) {
        throw new ContractError('unknown_dependency', `Task ${task.id} depends on unknown Task ${dependency}`);
      }
      reverseDependenciesById[dependency].push(task.id);
    }
  }
  for (const taskId of taskOrder) reverseDependenciesById[taskId].sort(compareText);
  assertAcyclic(tasksById, taskOrder, reverseDependenciesById);

  const promotionTasks = Object.values(tasksById).filter((task) => task.kind === 'promotion');
  if (promotionTasks.length !== 1) {
    throw new ContractError('promotion_count', 'Plan must contain exactly one Promotion Task');
  }
  const promotionTask = promotionTasks[0];
  const workTaskIds = taskOrder.filter((taskId) => tasksById[taskId].kind === 'work');
  if (JSON.stringify(workTaskIds) !== JSON.stringify(promotionTask.dependencies)) {
    throw new ContractError('promotion_dependencies', 'Promotion must depend on every work Task exactly once');
  }
  if (promotionTask.claims.length !== 1 ||
      promotionTask.claims[0].mode !== 'write' ||
      promotionTask.claims[0].resource !== 'canonical:tree') {
    throw new ContractError('promotion_claim', 'Promotion must have exactly one write canonical:tree claim');
  }
  if (promotionTask.requiredCapabilities.length !== 0) {
    throw new ContractError('promotion_authority', 'Internal Promotion cannot require executor capabilities');
  }

  const baseDigest = digest(baseTree);
  const planIdentity = {
    revisionId: input.revisionId,
    baseTree,
    baseDigest,
    taskOrder,
    tasksById,
    promotionTaskId: promotionTask.id,
  };
  const planDigest = typedDigest('tdev.plan-revision.v2', planIdentity);
  const compiled = {
    ...planIdentity,
    reverseDependenciesById: deepFreeze(reverseDependenciesById),
    planDigest,
  };
  const planBytes = Buffer.byteLength(canonicalJson(compiled), 'utf8');
  if (planBytes > caseContract.limits.maxPlanBytes) {
    throw new ContractError('plan_limit_exceeded', `Compiled Plan exceeds ${caseContract.limits.maxPlanBytes} bytes`, {
      size: planBytes,
    });
  }
  return deepFreeze(compiled);
}

export function serializePlan(plan) {
  if (!isCompiledPlan(plan)) throw new ContractError('invalid_compiled_plan', 'serializePlan requires a compiled Plan');
  return canonicalClone({
    revisionId: plan.revisionId,
    baseTree: plan.baseTree,
    tasks: plan.taskOrder.map((taskId) => plan.tasksById[taskId]),
  });
}
