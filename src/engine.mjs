import { ContractError, clone, deepFreeze, digest } from './canonical.mjs';
import { claimSetsConflict, normalizeClaim } from './claims.mjs';
import { normalizeChangeSet, promote, validateTree } from './promotion.mjs';

const TERMINAL_CASE_STATES = new Set(['succeeded', 'failed', 'cancelled']);
const TERMINAL_ATTEMPT_STATES = new Set(['succeeded', 'failed', 'cancelled', 'interrupted']);

function assertIdentifier(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    throw new ContractError('invalid_identifier', `${label} is invalid: ${String(value)}`);
  }
}

function assertAcyclic(tasksById) {
  const visiting = new Set();
  const visited = new Set();
  function visit(taskId) {
    if (visiting.has(taskId)) {
      throw new ContractError('cycle', `Task graph contains a cycle at ${taskId}`);
    }
    if (visited.has(taskId)) {
      return;
    }
    visiting.add(taskId);
    for (const dependency of tasksById[taskId].dependencies) {
      visit(dependency);
    }
    visiting.delete(taskId);
    visited.add(taskId);
  }
  for (const taskId of Object.keys(tasksById)) {
    visit(taskId);
  }
}

export function definePlan(input) {
  if (!input || typeof input !== 'object') {
    throw new ContractError('invalid_plan', 'Plan must be an object');
  }
  assertIdentifier(input.revisionId, 'revisionId');
  const baseTree = validateTree(clone(input.baseTree ?? {}));
  if (!Array.isArray(input.tasks) || input.tasks.length === 0) {
    throw new ContractError('invalid_plan', 'Plan must contain tasks');
  }

  const tasksById = {};
  for (const rawTask of input.tasks) {
    if (!rawTask || typeof rawTask !== 'object') {
      throw new ContractError('invalid_task', 'Task must be an object');
    }
    assertIdentifier(rawTask.id, 'task.id');
    if (tasksById[rawTask.id]) {
      throw new ContractError('duplicate_task', `Duplicate task ID: ${rawTask.id}`);
    }
    const kind = rawTask.kind ?? 'work';
    if (kind !== 'work' && kind !== 'promotion') {
      throw new ContractError('invalid_task_kind', `Unsupported task kind: ${kind}`);
    }
    const dependencies = [...new Set(rawTask.dependencies ?? [])];
    for (const dependency of dependencies) {
      assertIdentifier(dependency, 'dependency');
      if (dependency === rawTask.id) {
        throw new ContractError('self_dependency', `Task ${rawTask.id} depends on itself`);
      }
    }
    const claims = (rawTask.claims ?? []).map(normalizeClaim);
    if (kind === 'work') {
      const forbidden = claims.find((claim) => claim.resource.startsWith('canonical:') || claim.resource.startsWith('remote:'));
      if (forbidden) {
        throw new ContractError('forbidden_claim', `Work task ${rawTask.id} cannot claim ${forbidden.resource}`);
      }
    }
    tasksById[rawTask.id] = {
      id: rawTask.id,
      kind,
      dependencies,
      claims,
      input: clone(rawTask.input ?? {}),
    };
  }

  for (const task of Object.values(tasksById)) {
    for (const dependency of task.dependencies) {
      if (!tasksById[dependency]) {
        throw new ContractError('unknown_dependency', `Task ${task.id} depends on unknown task ${dependency}`);
      }
    }
  }
  assertAcyclic(tasksById);

  const promotionTasks = Object.values(tasksById).filter((task) => task.kind === 'promotion');
  if (promotionTasks.length !== 1) {
    throw new ContractError('promotion_count', 'Plan must contain exactly one promotion task');
  }
  const promotionTask = promotionTasks[0];
  const workTaskIds = Object.values(tasksById)
    .filter((task) => task.kind === 'work')
    .map((task) => task.id)
    .sort();
  const promotionDependencies = [...promotionTask.dependencies].sort();
  if (JSON.stringify(workTaskIds) !== JSON.stringify(promotionDependencies)) {
    throw new ContractError('promotion_dependencies', 'Promotion must depend on every work task exactly once');
  }
  const canonicalClaim = promotionTask.claims.some(
    (claim) => claim.mode === 'write' && claim.resource === 'canonical:tree',
  );
  if (!canonicalClaim) {
    throw new ContractError('promotion_claim', 'Promotion must claim write canonical:tree');
  }

  const plan = {
    revisionId: input.revisionId,
    baseTree,
    baseDigest: digest(baseTree),
    taskOrder: Object.keys(tasksById).sort(),
    tasksById,
    promotionTaskId: promotionTask.id,
  };
  return deepFreeze(plan);
}

export class CaseEngine {
  constructor({ caseId, plan }) {
    assertIdentifier(caseId, 'caseId');
    this.caseId = caseId;
    this.plan = plan;
    this.caseState = 'active';
    this.caseRevision = 0;
    this.eventSequence = 0;
    this.events = [];
    this.canonicalTree = clone(plan.baseTree);
    this.taskStates = {};
    this.attempts = {};
    for (const taskId of plan.taskOrder) {
      this.taskStates[taskId] = {
        state: 'pending',
        attemptIds: [],
        acceptedResult: null,
        acceptedResultDigest: null,
        error: null,
      };
    }
    this.#event('case_created', { planRevisionId: plan.revisionId, baseDigest: plan.baseDigest });
  }

  static restore(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      throw new ContractError('invalid_snapshot', 'Snapshot must be an object');
    }
    const restoredPlan = definePlan({
      revisionId: snapshot.plan.revisionId,
      baseTree: snapshot.plan.baseTree,
      tasks: snapshot.plan.taskOrder.map((taskId) => snapshot.plan.tasksById[taskId]),
    });
    const engine = new CaseEngine({ caseId: snapshot.caseId, plan: restoredPlan });
    if (engine.plan.baseDigest !== snapshot.plan.baseDigest) {
      throw new ContractError('snapshot_plan_digest', 'Snapshot plan digest is invalid');
    }
    engine.caseState = snapshot.caseState;
    engine.caseRevision = snapshot.caseRevision;
    engine.eventSequence = snapshot.eventSequence;
    engine.events = clone(snapshot.events);
    engine.canonicalTree = validateTree(clone(snapshot.canonicalTree));
    engine.taskStates = clone(snapshot.taskStates);
    engine.attempts = clone(snapshot.attempts);

    if (!TERMINAL_CASE_STATES.has(engine.caseState)) {
      for (const attempt of Object.values(engine.attempts)) {
        if (attempt.state === 'running') {
          attempt.state = 'interrupted';
          attempt.error = { code: 'process_reopen', message: 'Attempt was running when the snapshot was reopened' };
          const taskState = engine.taskStates[attempt.taskId];
          taskState.state = 'pending';
          taskState.error = null;
          engine.#event('attempt_interrupted', { attemptId: attempt.id, taskId: attempt.taskId });
        }
      }
      engine.reconcile();
    }
    engine.#assertInvariants();
    return engine;
  }

  snapshot() {
    return clone({
      caseId: this.caseId,
      plan: this.plan,
      caseState: this.caseState,
      caseRevision: this.caseRevision,
      eventSequence: this.eventSequence,
      events: this.events,
      canonicalTree: this.canonicalTree,
      canonicalDigest: digest(this.canonicalTree),
      taskStates: this.taskStates,
      attempts: this.attempts,
    });
  }

  readyTaskIds() {
    if (this.caseState !== 'active') {
      return [];
    }
    return this.plan.taskOrder.filter((taskId) => {
      const taskState = this.taskStates[taskId];
      if (taskState.state !== 'pending') {
        return false;
      }
      return this.plan.tasksById[taskId].dependencies.every(
        (dependency) => this.taskStates[dependency].state === 'succeeded',
      );
    });
  }

  runningTaskIds() {
    return this.plan.taskOrder.filter((taskId) => this.taskStates[taskId].state === 'running');
  }

  canAdmit(taskId) {
    if (!this.readyTaskIds().includes(taskId)) {
      return false;
    }
    const candidate = this.plan.tasksById[taskId];
    return this.runningTaskIds().every((runningTaskId) => {
      const runningTask = this.plan.tasksById[runningTaskId];
      return !claimSetsConflict(candidate.claims, runningTask.claims);
    });
  }

  startAttempt(taskId, executorId) {
    if (!this.canAdmit(taskId)) {
      throw new ContractError('not_admissible', `Task ${taskId} is not ready or its claims conflict`);
    }
    assertIdentifier(executorId, 'executorId');
    const taskState = this.taskStates[taskId];
    const runningAttempt = taskState.attemptIds
      .map((attemptId) => this.attempts[attemptId])
      .find((attempt) => attempt.state === 'running');
    if (runningAttempt) {
      throw new ContractError('attempt_exists', `Task ${taskId} already has a running Attempt`);
    }
    const ordinal = taskState.attemptIds.length + 1;
    const attemptId = `${taskId}.${ordinal}`;
    const attempt = {
      id: attemptId,
      taskId,
      ordinal,
      executorId,
      state: 'running',
      resultDigest: null,
      error: null,
    };
    this.attempts[attemptId] = attempt;
    taskState.attemptIds.push(attemptId);
    taskState.state = 'running';
    this.#event('attempt_started', { attemptId, taskId, executorId });
    this.#assertInvariants();
    return deepFreeze(clone(attempt));
  }

  createPromotionResult(taskId) {
    const task = this.plan.tasksById[taskId];
    if (!task || task.kind !== 'promotion') {
      throw new ContractError('not_promotion', `Task ${taskId} is not the Promotion task`);
    }
    const acceptedResults = task.dependencies.map((dependency) => {
      const taskState = this.taskStates[dependency];
      if (taskState.state !== 'succeeded' || !taskState.acceptedResult) {
        throw new ContractError('promotion_not_ready', `Dependency ${dependency} has no accepted result`);
      }
      return { taskId: dependency, result: taskState.acceptedResult };
    });
    return promote(this.plan.baseTree, acceptedResults, this.plan.baseDigest);
  }

  completeAttempt(attemptId, result) {
    const attempt = this.attempts[attemptId];
    if (!attempt) {
      throw new ContractError('unknown_attempt', `Unknown Attempt: ${attemptId}`);
    }
    if (attempt.state !== 'running' && attempt.state !== 'succeeded') {
      throw new ContractError('stale_attempt', `Attempt ${attemptId} is ${attempt.state}, not running`);
    }

    const task = this.plan.tasksById[attempt.taskId];
    let acceptedResult;
    if (task.kind === 'work') {
      acceptedResult = normalizeChangeSet(task.id, result, this.plan.baseDigest);
    } else {
      if (!result || result.kind !== 'promotion' || result.baseDigest !== this.plan.baseDigest) {
        throw new ContractError('invalid_promotion_result', 'Promotion returned an invalid result');
      }
      const expected = this.createPromotionResult(task.id);
      if (digest(expected) !== digest(result)) {
        throw new ContractError('promotion_result_mismatch', 'Promotion result does not match deterministic recomputation');
      }
      acceptedResult = clone(result);
    }
    const acceptedDigest = digest(acceptedResult);

    if (attempt.state === 'succeeded') {
      if (attempt.resultDigest === acceptedDigest) {
        return { deduplicated: true, resultDigest: acceptedDigest };
      }
      throw new ContractError('duplicate_result_conflict', `Attempt ${attemptId} already accepted a different result`);
    }

    const taskState = this.taskStates[attempt.taskId];
    attempt.state = 'succeeded';
    attempt.resultDigest = acceptedDigest;
    taskState.state = 'succeeded';
    taskState.acceptedResult = acceptedResult;
    taskState.acceptedResultDigest = acceptedDigest;
    taskState.error = null;
    if (task.kind === 'promotion') {
      this.canonicalTree = clone(acceptedResult.tree);
      this.caseState = 'succeeded';
    }
    this.#event('attempt_succeeded', { attemptId, taskId: task.id, resultDigest: acceptedDigest });
    this.#assertInvariants();
    return { deduplicated: false, resultDigest: acceptedDigest };
  }

  failAttempt(attemptId, error) {
    const attempt = this.attempts[attemptId];
    if (!attempt) {
      throw new ContractError('unknown_attempt', `Unknown Attempt: ${attemptId}`);
    }
    if (attempt.state !== 'running') {
      throw new ContractError('stale_attempt', `Attempt ${attemptId} is ${attempt.state}, not running`);
    }
    const normalizedError = {
      code: typeof error?.code === 'string' ? error.code : 'executor_error',
      message: typeof error?.message === 'string' ? error.message : String(error),
    };
    attempt.state = 'failed';
    attempt.error = normalizedError;
    const taskState = this.taskStates[attempt.taskId];
    taskState.state = 'failed';
    taskState.error = normalizedError;
    this.#event('attempt_failed', { attemptId, taskId: attempt.taskId, error: normalizedError });
    this.reconcile();
    this.#assertInvariants();
  }

  cancelTask(taskId, reason = 'cancelled') {
    const taskState = this.taskStates[taskId];
    if (!taskState) {
      throw new ContractError('unknown_task', `Unknown Task: ${taskId}`);
    }
    if (taskState.state === 'succeeded' || taskState.state === 'failed' || taskState.state === 'cancelled') {
      return false;
    }
    for (const attemptId of taskState.attemptIds) {
      const attempt = this.attempts[attemptId];
      if (attempt.state === 'running') {
        attempt.state = 'cancelled';
        attempt.error = { code: 'cancelled', message: reason };
      }
    }
    taskState.state = 'cancelled';
    taskState.error = { code: 'cancelled', message: reason };
    this.#event('task_cancelled', { taskId, reason });
    this.reconcile();
    this.#assertInvariants();
    return true;
  }

  reconcile() {
    if (TERMINAL_CASE_STATES.has(this.caseState)) {
      return this.caseState;
    }
    const states = Object.values(this.taskStates).map((taskState) => taskState.state);
    if (states.includes('running') || this.readyTaskIds().length > 0) {
      this.caseState = 'active';
      return this.caseState;
    }
    if (states.includes('failed')) {
      this.caseState = 'failed';
      this.#event('case_failed', { reason: 'task_failed' });
      return this.caseState;
    }
    if (states.includes('cancelled')) {
      this.caseState = 'cancelled';
      this.#event('case_cancelled', { reason: 'task_cancelled' });
      return this.caseState;
    }
    if (states.some((state) => state === 'pending')) {
      this.caseState = 'failed';
      this.#event('case_failed', { reason: 'blocked_graph' });
      return this.caseState;
    }
    return this.caseState;
  }

  #event(type, detail) {
    this.caseRevision += 1;
    this.eventSequence += 1;
    this.events.push({ sequence: this.eventSequence, type, detail: clone(detail) });
  }

  #assertInvariants() {
    for (const [taskId, taskState] of Object.entries(this.taskStates)) {
      const running = taskState.attemptIds
        .map((attemptId) => this.attempts[attemptId])
        .filter((attempt) => attempt.state === 'running');
      if (running.length > 1) {
        throw new ContractError('invariant_attempt_count', `Task ${taskId} has multiple running Attempts`);
      }
      if (taskState.state === 'running' && running.length !== 1) {
        throw new ContractError('invariant_task_attempt', `Task ${taskId} running state does not match its Attempt`);
      }
      if (taskState.state !== 'running' && running.length !== 0) {
        throw new ContractError('invariant_task_attempt', `Task ${taskId} has a running Attempt while ${taskState.state}`);
      }
    }
    if (this.caseState === 'succeeded') {
      const promotionState = this.taskStates[this.plan.promotionTaskId];
      if (promotionState.state !== 'succeeded') {
        throw new ContractError('invariant_promotion', 'Succeeded Case requires succeeded Promotion');
      }
    }
    for (const attempt of Object.values(this.attempts)) {
      if (!this.taskStates[attempt.taskId]) {
        throw new ContractError('invariant_attempt_task', `Attempt ${attempt.id} references an unknown Task`);
      }
      if (!TERMINAL_ATTEMPT_STATES.has(attempt.state) && attempt.state !== 'running') {
        throw new ContractError('invariant_attempt_state', `Attempt ${attempt.id} has invalid state ${attempt.state}`);
      }
    }
  }
}
