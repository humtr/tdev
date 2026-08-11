import {
  ContractError,
  assertIdentifier,
  assertRecordShape,
  canonicalClone,
  clone,
  compareText,
  deepFreeze,
  isPlainRecord,
} from './canonical.mjs';
import { globalClaimsForTask } from './claims.mjs';
import { NONTERMINAL_ATTEMPT_STATES, TERMINAL_ATTEMPT_STATES } from './state.mjs';

function normalizeCapacity(value) {
  const capacity = value ?? 1;
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    throw new ContractError('invalid_capacity', 'Executor capacity must be a positive safe integer');
  }
  return capacity;
}

function normalizeCapabilities(input) {
  if (input === undefined) return [];
  if (!Array.isArray(input)) {
    throw new ContractError('invalid_executor_capabilities', 'Executor capabilities must be an array');
  }
  const capabilities = input.map((value, index) => assertIdentifier(value, `executorCapabilities[${index}]`)).sort(compareText);
  for (let index = 1; index < capabilities.length; index += 1) {
    if (capabilities[index] === capabilities[index - 1]) {
      throw new ContractError('duplicate_executor_capability', `Duplicate executor capability: ${capabilities[index]}`);
    }
  }
  return capabilities;
}

function publicExecutorIdentity(input, fallbackOrdinal, defaultCapabilities) {
  const value = input ?? {
    id: `executor-${fallbackOrdinal}`,
    epoch: 1,
    capabilities: defaultCapabilities,
  };
  if (typeof value === 'string') {
    return { id: value, epoch: 1, capabilities: defaultCapabilities };
  }
  if (!isPlainRecord(value)) {
    throw new ContractError('invalid_executor', 'Executor identity factory must return a string or record');
  }
  return {
    id: value.id,
    epoch: value.epoch ?? 1,
    capabilities: value.capabilities ?? defaultCapabilities,
  };
}

function terminalAttempt(attempt) {
  return Boolean(attempt && TERMINAL_ATTEMPT_STATES.has(attempt.state));
}

function releaseTerminalLeases(engine, claimLedger) {
  if (!claimLedger) return;
  for (const attempt of Object.values(engine.attempts)) {
    if (terminalAttempt(attempt) && attempt.claimLease) claimLedger.release(attempt.claimLease);
  }
}

export async function runCase(engine, executor, options = {}) {
  return runCaseWithHooks(engine, executor, options);
}

export async function runCaseWithHooks(engine, executor, options = {}, internalHooks = {}) {
  assertRecordShape(options, [], [
    'capacity', 'claimLedger', 'waitForClaims', 'globalClaimPredicate', 'executorCapabilities',
    'executorIdentity', 'signal', 'checkpoint',
  ], 'runner options');
  assertRecordShape(internalHooks, [], ['beforeAttemptStart'], 'runner internal hooks');
  const beforeAttemptStart = internalHooks.beforeAttemptStart;
  if (beforeAttemptStart !== undefined && typeof beforeAttemptStart !== 'function') {
    throw new ContractError('invalid_runner_hook', 'beforeAttemptStart must be a function');
  }
  const capacity = normalizeCapacity(options.capacity);
  if (typeof executor !== 'function') {
    throw new ContractError('invalid_executor', 'Executor must be a function');
  }
  const claimLedger = options.claimLedger ?? null;
  if (claimLedger !== null &&
      (typeof claimLedger.tryAcquire !== 'function' ||
       typeof claimLedger.validate !== 'function' ||
       typeof claimLedger.release !== 'function')) {
    throw new ContractError('invalid_claim_ledger', 'Claim ledger does not implement the required contract');
  }
  const waitForClaims = options.waitForClaims ?? true;
  if (typeof waitForClaims !== 'boolean') throw new ContractError('invalid_runner_option', 'waitForClaims must be boolean');
  const globalClaimPredicate = options.globalClaimPredicate ?? null;
  if (globalClaimPredicate !== null && typeof globalClaimPredicate !== 'function') {
    throw new ContractError('invalid_runner_option', 'globalClaimPredicate must be a function');
  }
  const defaultCapabilities = normalizeCapabilities(options.executorCapabilities);
  const executorIdentityFactory = options.executorIdentity;
  if (executorIdentityFactory !== undefined &&
      typeof executorIdentityFactory !== 'function' &&
      typeof executorIdentityFactory !== 'string' &&
      !isPlainRecord(executorIdentityFactory)) {
    throw new ContractError('invalid_executor', 'executorIdentity must be a string, record, or function');
  }
  const checkpoint = options.checkpoint;
  if (checkpoint !== undefined && typeof checkpoint !== 'function') {
    throw new ContractError('invalid_runner_option', 'checkpoint must be a function');
  }
  if (options.signal !== undefined &&
      (!options.signal || typeof options.signal.aborted !== 'boolean' || typeof options.signal.addEventListener !== 'function')) {
    throw new ContractError('invalid_runner_option', 'signal must implement AbortSignal');
  }

  const running = new Map();
  const readyTaskIds = new Set();
  let executorOrdinal = 0;
  let maxConcurrent = 0;
  let lastClaimBlock = null;
  let checkpointedRevision = engine.caseRevision;

  async function checkpointState(reason, detail = {}) {
    if (!checkpoint || checkpointedRevision === engine.caseRevision) return;
    const snapshot = engine.snapshot();
    const metadata = deepFreeze(canonicalClone({
      reason,
      caseId: engine.caseId,
      caseRevision: engine.caseRevision,
      ...detail,
    }));
    await checkpoint(snapshot, metadata);
    checkpointedRevision = engine.caseRevision;
  }

  releaseTerminalLeases(engine, claimLedger);
  engine.reconcile();
  for (const taskId of engine.readyTaskIds()) readyTaskIds.add(taskId);
  await checkpointState('initial_reconcile');

  function refreshReadyTask(taskId) {
    const task = engine.plan.tasksById[taskId];
    if (!task || !engine.isTaskReady(taskId)) {
      readyTaskIds.delete(taskId);
      return;
    }
    readyTaskIds.add(taskId);
  }

  function refreshReadyAfter(taskId) {
    refreshReadyTask(taskId);
    for (const dependent of engine.plan.reverseDependenciesById[taskId] ?? []) refreshReadyTask(dependent);
  }

  function makeExecutorIdentity(taskId) {
    executorOrdinal += 1;
    const context = {
      caseId: engine.caseId,
      taskId,
      attemptId: engine.nextAttemptId(taskId),
      ordinal: executorOrdinal,
    };
    const configured = typeof executorIdentityFactory === 'function'
      ? executorIdentityFactory(deepFreeze(canonicalClone(context)))
      : executorIdentityFactory;
    return publicExecutorIdentity(configured, executorOrdinal, defaultCapabilities);
  }

  function globalClaimsFor(task) {
    // The extension predicate may add local claims to global coordination, but it may
    // never suppress namespaces that the core contract classifies as cross-Case.
    return globalClaimsForTask(task, globalClaimPredicate, {
      maxClaims: engine.caseContract.limits.maxClaimsPerTask,
    });
  }

  function acquireClaims(taskId) {
    if (!claimLedger) return { acquired: true, lease: null, revision: null };
    const task = engine.plan.tasksById[taskId];
    const claims = globalClaimsFor(task);
    if (claims.length === 0) return { acquired: true, lease: null, revision: claimLedger.revision ?? null };
    return claimLedger.tryAcquire({
      caseId: engine.caseId,
      taskId,
      attemptId: engine.nextAttemptId(taskId),
      claims,
    });
  }

  function releaseAttemptLease(attempt) {
    if (claimLedger && attempt?.claimLease && TERMINAL_ATTEMPT_STATES.has(attempt.state)) {
      claimLedger.release(attempt.claimLease);
    }
  }

  async function start(taskId, executorIdentity, claimLease) {
    if (beforeAttemptStart) {
      await beforeAttemptStart({
        engine,
        taskId,
        executorIdentity: deepFreeze(canonicalClone(executorIdentity)),
        claimLease: clone(claimLease),
      });
    }
    const attempt = engine.startAttempt(taskId, executorIdentity, {
      claimLease,
      claimValidator: claimLedger,
    });

    function launch() {
      const task = engine.plan.tasksById[taskId];
      const acceptedResults = task.dependencies
        .map((dependency) => ({
          taskId: dependency,
          result: clone(engine.taskStates[dependency].acceptedResult),
        }))
        .filter((entry) => entry.result !== null);
      const abortController = new AbortController();

      const execution = Promise.resolve()
        .then(() => {
          if (task.kind === 'promotion') return engine.createPromotionResult(taskId);
          return executor({
            caseId: engine.caseId,
            planRevisionId: engine.plan.revisionId,
            planDigest: engine.plan.planDigest,
            caseContractDigest: engine.caseContract.contractDigest,
            baseDigest: engine.plan.baseDigest,
            effectKey: attempt.effectKey,
            fencingToken: attempt.fencingToken,
            claimLease: clone(attempt.claimLease),
            signal: abortController.signal,
            task: clone(task),
            attempt: clone(attempt),
            acceptedResults,
          });
        })
        .then(
          (result) => ({ attemptId: attempt.id, ok: true, result }),
          (error) => ({ attemptId: attempt.id, ok: false, error }),
        );

      running.set(attempt.id, { execution, abortController });
      maxConcurrent = Math.max(maxConcurrent, running.size);
    }

    if (checkpoint) {
      await checkpointState('attempt_started', { taskId, attemptId: attempt.id });
    }
    launch();
  }

  async function settle(outcome) {
    const attempt = engine.attempts[outcome.attemptId];
    if (!attempt) {
      throw new ContractError('unknown_attempt', `Executor returned an unknown Attempt: ${outcome.attemptId}`);
    }
    if (!NONTERMINAL_ATTEMPT_STATES.has(attempt.state)) {
      releaseAttemptLease(attempt);
      return;
    }

    if (!outcome.ok) {
      engine.recordExecutorFailure(outcome.attemptId, outcome.error);
      await checkpointState('attempt_failed', { taskId: attempt.taskId, attemptId: outcome.attemptId });
      releaseAttemptLease(engine.attempts[outcome.attemptId]);
      return;
    }

    try {
      engine.acceptResult(engine.resultEnvelope(outcome.attemptId, outcome.result), {
        claimValidator: claimLedger,
      });
    } catch (error) {
      const current = engine.attempts[outcome.attemptId];
      if (!current || !NONTERMINAL_ATTEMPT_STATES.has(current.state)) {
        releaseAttemptLease(current);
        return;
      }
      const task = engine.plan.tasksById[current.taskId];
      if (task.execution.effectClass !== 'result-only') {
        engine.recordExecutorFailure(outcome.attemptId, {
          code: error?.code ?? 'invalid_effect_result',
          message: error?.message ?? String(error),
          certainty: 'unknown',
          retryable: false,
        });
      } else {
        engine.failAttempt(outcome.attemptId, error, { retryable: false });
      }
    }
    await checkpointState('attempt_settled', { taskId: attempt.taskId, attemptId: outcome.attemptId });
    releaseAttemptLease(engine.attempts[outcome.attemptId]);
  }

  while (engine.caseState === 'active' || running.size > 0) {
    let madeProgress = false;
    lastClaimBlock = null;

    while (running.size < capacity && engine.caseState === 'active') {
      let admittedThisPass = false;
      for (const taskId of readyTaskIds) {
        if (running.size >= capacity || engine.caseState !== 'active') break;
        const identity = makeExecutorIdentity(taskId);
        const decision = engine.admissionDecision(taskId, identity.capabilities);
        if (!decision.admissible) {
          if (decision.reason === 'authority') {
            engine.denyTask(taskId, decision.missingCapabilities);
            readyTaskIds.delete(taskId);
            await checkpointState('task_denied', { taskId });
            madeProgress = true;
            admittedThisPass = true;
          }
          continue;
        }
        const claimDecision = acquireClaims(taskId);
        if (!claimDecision.acquired) {
          lastClaimBlock = claimDecision;
          continue;
        }
        try {
          await start(taskId, identity, claimDecision.lease);
          readyTaskIds.delete(taskId);
        } catch (error) {
          if (claimDecision.lease) claimLedger.release(claimDecision.lease);
          throw error;
        }
        madeProgress = true;
        admittedThisPass = true;
      }
      if (!admittedThisPass) break;
    }

    if (running.size === 0) {
      releaseTerminalLeases(engine, claimLedger);
      if (engine.caseState !== 'active') break;
      if (lastClaimBlock) {
        if (!waitForClaims) {
          return {
            caseState: engine.caseState,
            status: 'waiting_for_claims',
            claimBlock: canonicalClone(lastClaimBlock),
            maxConcurrent,
            snapshot: engine.snapshot(),
          };
        }
        if (typeof claimLedger.waitForChange !== 'function') {
          throw new ContractError('claim_wait_unsupported', 'Claim ledger cannot wait for a revision change');
        }
        await claimLedger.waitForChange(lastClaimBlock.revision, { signal: options.signal });
        continue;
      }
      if (madeProgress) continue;
      // Local ready candidates and engine acceleration state are both disposable.
      // Reconcile performs an authoritative rebuild before declaring deadlock.
      engine.reconcile();
      if (engine.caseState !== 'active') continue;
      readyTaskIds.clear();
      for (const taskId of engine.readyTaskIds()) readyTaskIds.add(taskId);
      if (readyTaskIds.size > 0) continue;
      throw new ContractError('scheduler_deadlock', 'Active Case has no running or admissible Task');
    }

    const outcome = await Promise.race([...running.values()].map((entry) => entry.execution));
    const entry = running.get(outcome.attemptId);
    running.delete(outcome.attemptId);
    await settle(outcome);
    const settledTaskId = engine.attempts[outcome.attemptId]?.taskId;
    if (settledTaskId) refreshReadyAfter(settledTaskId);
    if (entry && engine.attempts[outcome.attemptId]?.state === 'cancelled') {
      entry.abortController.abort(new ContractError('attempt_cancelled', `Attempt ${outcome.attemptId} was cancelled`));
    }
    await checkpointState('post_settlement', { attemptId: outcome.attemptId });
  }

  for (const [attemptId, entry] of running) {
    const attempt = engine.attempts[attemptId];
    if (attempt && !NONTERMINAL_ATTEMPT_STATES.has(attempt.state)) {
      entry.abortController.abort(new ContractError('attempt_terminal', `Attempt ${attemptId} is terminal`));
    }
  }
  releaseTerminalLeases(engine, claimLedger);
  await checkpointState('runner_terminal');
  return {
    caseState: engine.caseState,
    status: engine.caseState === 'reconciling' ? 'reconciliation_required' : 'terminal',
    maxConcurrent,
    snapshot: engine.snapshot(),
  };
}
