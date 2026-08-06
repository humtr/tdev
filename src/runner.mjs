import { ContractError, clone } from './canonical.mjs';

export async function runCase(engine, executor, options = {}) {
  const capacity = options.capacity ?? 1;
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new ContractError('invalid_capacity', 'Executor capacity must be a positive integer');
  }
  if (typeof executor !== 'function') {
    throw new ContractError('invalid_executor', 'Executor must be a function');
  }

  const running = new Map();
  let executorOrdinal = 0;
  let maxConcurrent = 0;

  function start(taskId) {
    executorOrdinal += 1;
    const attempt = engine.startAttempt(taskId, `executor-${executorOrdinal}`);
    const task = engine.plan.tasksById[taskId];
    const acceptedResults = task.dependencies
      .map((dependency) => ({
        taskId: dependency,
        result: clone(engine.taskStates[dependency].acceptedResult),
      }))
      .filter((entry) => entry.result !== null);

    const execution = Promise.resolve()
      .then(() => {
        if (task.kind === 'promotion') {
          return engine.createPromotionResult(taskId);
        }
        return executor({
          caseId: engine.caseId,
          planRevisionId: engine.plan.revisionId,
          baseDigest: engine.plan.baseDigest,
          task: clone(task),
          attempt: clone(attempt),
          acceptedResults,
        });
      })
      .then(
        (result) => ({ attemptId: attempt.id, ok: true, result }),
        (error) => ({ attemptId: attempt.id, ok: false, error }),
      );

    running.set(attempt.id, execution);
    maxConcurrent = Math.max(maxConcurrent, running.size);
  }

  function settle(outcome) {
    const attempt = engine.attempts[outcome.attemptId];
    if (!attempt) {
      throw new ContractError('unknown_attempt', `Executor returned an unknown Attempt: ${outcome.attemptId}`);
    }

    if (attempt.state !== 'running') {
      return;
    }

    if (!outcome.ok) {
      engine.failAttempt(outcome.attemptId, outcome.error);
      return;
    }

    try {
      engine.completeAttempt(outcome.attemptId, outcome.result);
    } catch (error) {
      if (engine.attempts[outcome.attemptId]?.state === 'running') {
        engine.failAttempt(outcome.attemptId, error);
        return;
      }
      throw error;
    }
  }

  while (engine.caseState === 'active' || running.size > 0) {
    let admitted = true;
    while (admitted && running.size < capacity && engine.caseState === 'active') {
      admitted = false;
      for (const taskId of engine.readyTaskIds()) {
        if (running.size >= capacity) {
          break;
        }
        if (engine.canAdmit(taskId)) {
          start(taskId);
          admitted = true;
        }
      }
    }

    if (running.size === 0) {
      engine.reconcile();
      if (engine.caseState !== 'active') {
        break;
      }
      throw new ContractError('scheduler_deadlock', 'Active Case has no running or admissible Task');
    }

    const outcome = await Promise.race(running.values());
    running.delete(outcome.attemptId);
    settle(outcome);
    engine.reconcile();
  }

  return {
    caseState: engine.caseState,
    maxConcurrent,
    snapshot: engine.snapshot(),
  };
}
