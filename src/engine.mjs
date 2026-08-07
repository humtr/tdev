import {
  ContractError,
  assertDigest,
  assertIdentifier,
  assertRecordShape,
  assertSafeInteger,
  assertScalarString,
  canonicalClone,
  canonicalJson,
  compareText,
  createRecord,
  deepFreeze,
  digest,
  exactKeys,
  isPlainRecord,
  publicJsonClone,
  typedDigest,
} from './canonical.mjs';
import {
  assertClaimLeaseScope,
  claimLeaseToken,
  claimSetDigest,
  claimSetsConflict,
  normalizeClaims,
} from './claims.mjs';
import { authorityDecision, normalizeCaseContract } from './policy.mjs';
import { definePlan, isCompiledPlan, serializePlan } from './plan.mjs';
import { normalizeTaskResult } from './results.mjs';
import { promote, validateTree } from './promotion.mjs';
import {
  ATTEMPT_STATES,
  CASE_STATES,
  NONTERMINAL_ATTEMPT_STATES,
  TASK_STATES,
  TERMINAL_ATTEMPT_STATES,
  TERMINAL_CASE_STATES,
  TERMINAL_TASK_STATES,
  assertAttemptTransition,
} from './state.mjs';

export { definePlan } from './plan.mjs';

const SNAPSHOT_SCHEMA_VERSION = 2;
const RESULT_ACCEPTING_STATES = new Set(['running']);
const RECONCILIATION_RESULT_STATES = new Set(['reconciling', 'cancel_requested']);

function normalizeError(error, defaults = {}, limits = null) {
  const code = typeof error?.code === 'string' && error.code.length > 0 ? error.code : (defaults.code ?? 'executor_error');
  const message = typeof error?.message === 'string' && error.message.length > 0 ? error.message : String(error ?? defaults.message ?? 'Unknown error');
  assertIdentifier(code, 'error.code');
  assertScalarString(message, 'error.message');
  if (limits && Buffer.byteLength(message, 'utf8') > limits.maxErrorMessageBytes) {
    throw new ContractError('error_message_limit_exceeded', 'Error message exceeds the configured byte limit', {
      size: Buffer.byteLength(message, 'utf8'),
      limit: limits.maxErrorMessageBytes,
    });
  }
  const certainty = error?.certainty === 'not_applied' || error?.certainty === 'unknown'
    ? error.certainty
    : (defaults.certainty ?? 'not_applied');
  const retryable = typeof error?.retryable === 'boolean' ? error.retryable : (defaults.retryable ?? false);
  return deepFreeze({ code, message, certainty, retryable });
}

function normalizeExecutorIdentity(input) {
  const identity = typeof input === 'string' ? { id: input, epoch: 1, capabilities: [] } : input;
  if (!isPlainRecord(identity)) throw new ContractError('invalid_executor', 'Executor identity must be a string or record');
  assertRecordShape(identity, ['id'], ['epoch', 'capabilities'], 'executor');
  assertIdentifier(identity.id, 'executor.id');
  const epoch = identity.epoch ?? 1;
  assertSafeInteger(epoch, 'executor.epoch', { min: 1 });
  const capabilities = identity.capabilities ?? [];
  if (!Array.isArray(capabilities)) throw new ContractError('invalid_executor', 'executor.capabilities must be an array');
  if (capabilities.length > 1_000) {
    throw new ContractError('authority_limit_exceeded', 'executor.capabilities exceeds 1000 entries');
  }
  const normalizedCapabilities = capabilities.map((capability) => assertIdentifier(capability, 'executor capability')).sort(compareText);
  for (let index = 1; index < normalizedCapabilities.length; index += 1) {
    if (normalizedCapabilities[index] === normalizedCapabilities[index - 1]) {
      throw new ContractError('duplicate_executor_capability', `Duplicate executor capability: ${normalizedCapabilities[index]}`);
    }
  }
  return deepFreeze({ id: identity.id, epoch, capabilities: normalizedCapabilities });
}

function assertIdentifierArray(values, label, { sorted = false, unique = true } = {}) {
  if (!Array.isArray(values)) throw new ContractError('invalid_array', `${label} must be an array`);
  const normalized = values.map((value, index) => assertIdentifier(value, `${label}[${index}]`));
  if (unique && new Set(normalized).size !== normalized.length) {
    throw new ContractError('duplicate_array_item', `${label} contains duplicate identifiers`);
  }
  if (sorted && normalized.some((value, index) => index > 0 && compareText(normalized[index - 1], value) >= 0)) {
    throw new ContractError('invalid_order', `${label} must be strictly sorted`);
  }
  return normalized;
}

function validateStoredError(error, label, limits = null) {
  if (error === null) return;
  assertRecordShape(error, ['code', 'message', 'certainty', 'retryable'], [], label);
  assertIdentifier(error.code, `${label}.code`);
  assertScalarString(error.message, `${label}.message`);
  if (limits && Buffer.byteLength(error.message, 'utf8') > limits.maxErrorMessageBytes) {
    throw new ContractError('error_message_limit_exceeded', `${label}.message exceeds the configured byte limit`);
  }
  if (!['not_applied', 'unknown'].includes(error.certainty)) {
    throw new ContractError('invalid_error', `${label}.certainty is invalid`);
  }
  if (typeof error.retryable !== 'boolean') {
    throw new ContractError('invalid_error', `${label}.retryable must be boolean`);
  }
}

function validateReconciliationRecord(reconciliation, label, limits) {
  if (reconciliation === null) return;
  assertRecordShape(reconciliation, ['outcome', 'evidence'], [], label);
  if (!['succeeded', 'not_applied', 'failed', 'cancelled', 'unverified'].includes(reconciliation.outcome)) {
    throw new ContractError('invalid_reconciliation', `${label}.outcome is invalid`);
  }
  const evidence = canonicalClone(reconciliation.evidence);
  if (canonicalSize(evidence) > limits.maxEvidenceBytes) {
    throw new ContractError('evidence_limit_exceeded', `${label}.evidence exceeds the configured byte limit`);
  }
}

function validateReconciliationDecision(decision) {
  if (!isPlainRecord(decision) || !['succeeded', 'not_applied', 'failed', 'cancelled', 'unverified'].includes(decision.outcome)) {
    throw new ContractError('invalid_reconciliation', 'Invalid reconciliation decision');
  }
  switch (decision.outcome) {
    case 'succeeded':
      assertRecordShape(decision, ['outcome', 'result'], ['evidence'], 'reconciliation decision');
      break;
    case 'not_applied':
    case 'cancelled':
      assertRecordShape(decision, ['outcome'], ['evidence'], 'reconciliation decision');
      break;
    case 'failed':
      assertRecordShape(decision, ['outcome'], ['evidence', 'error', 'retry'], 'reconciliation decision');
      if (Object.hasOwn(decision, 'retry') && typeof decision.retry !== 'boolean') {
        throw new ContractError('invalid_reconciliation', 'reconciliation decision.retry must be boolean');
      }
      break;
    case 'unverified':
      assertRecordShape(decision, ['outcome'], ['evidence', 'reason'], 'reconciliation decision');
      if (Object.hasOwn(decision, 'reason')) assertScalarString(decision.reason, 'reconciliation decision.reason');
      break;
    default:
      throw new ContractError('invalid_reconciliation', 'Invalid reconciliation decision');
  }
}

function validateCommand(command) {
  if (!isPlainRecord(command) || typeof command.type !== 'string') {
    throw new ContractError('invalid_command', 'Command must be a record with a type');
  }
  assertIdentifier(command.type, 'command.type');
  switch (command.type) {
    case 'start_attempt':
      assertRecordShape(command, ['type', 'taskId', 'executor'], ['initialState', 'claimLease'], 'command');
      break;
    case 'mark_attempt_queued':
    case 'mark_attempt_running':
      assertRecordShape(command, ['type', 'attemptId'], [], 'command');
      break;
    case 'mark_attempt_reconciling':
      assertRecordShape(command, ['type', 'attemptId'], ['reason'], 'command');
      break;
    case 'accept_result':
      assertRecordShape(command, ['type', 'envelope'], [], 'command');
      break;
    case 'fail_attempt':
      assertRecordShape(command, ['type', 'attemptId', 'error'], ['retryable'], 'command');
      if (Object.hasOwn(command, 'retryable') && typeof command.retryable !== 'boolean') {
        throw new ContractError('invalid_command', 'command.retryable must be boolean');
      }
      break;
    case 'cancel_task':
      assertRecordShape(command, ['type', 'taskId'], ['reason'], 'command');
      break;
    case 'deny_task':
      assertRecordShape(command, ['type', 'taskId', 'missingCapabilities'], [], 'command');
      break;
    case 'resolve_reconciliation':
      assertRecordShape(command, ['type', 'attemptId', 'decision'], [], 'command');
      validateReconciliationDecision(command.decision);
      break;
    default:
      throw new ContractError('unknown_command', `Unknown command type: ${command.type}`);
  }
  return command;
}

function normalizeClaimLease(input, expected, task, maxClaims) {
  if (input === undefined || input === null) return null;
  if (!isPlainRecord(input)) throw new ContractError('invalid_claim_lease', 'Claim lease must be a record');
  const requiredKeys = ['token', 'generation', 'caseId', 'taskId', 'attemptId', 'claims', 'claimsDigest'];
  exactKeys(input, requiredKeys, 'claimLease');
  assertDigest(input.token, 'claimLease.token');
  assertSafeInteger(input.generation, 'claimLease.generation', { min: 1 });
  for (const key of ['caseId', 'taskId', 'attemptId']) assertIdentifier(input[key], `claimLease.${key}`);
  if (input.caseId !== expected.caseId || input.taskId !== expected.taskId || input.attemptId !== expected.attemptId) {
    throw new ContractError('claim_lease_identity', 'Claim lease holder does not match the Attempt', {
      expected,
      actual: { caseId: input.caseId, taskId: input.taskId, attemptId: input.attemptId },
    });
  }
  const claimOptions = { maxClaims };
  const claims = normalizeClaims(input.claims, claimOptions);
  const claimsDigest = claimSetDigest(claims, claimOptions);
  if (input.claimsDigest !== claimsDigest) {
    throw new ContractError('claim_lease_digest_mismatch', 'Claim lease claimsDigest does not match its claims');
  }
  const expectedToken = claimLeaseToken({
    generation: input.generation,
    caseId: input.caseId,
    taskId: input.taskId,
    attemptId: input.attemptId,
    claimsDigest,
  });
  if (input.token !== expectedToken) {
    throw new ContractError('claim_lease_token_mismatch', 'Claim lease token does not match its identity and scope');
  }
  assertClaimLeaseScope(claims, task.claims, claimOptions);
  return deepFreeze({
    token: input.token,
    generation: input.generation,
    caseId: input.caseId,
    taskId: input.taskId,
    attemptId: input.attemptId,
    claims,
    claimsDigest,
  });
}

function assertClaimValidator(validator, label = 'claimValidator') {
  if (validator === undefined || validator === null) return null;
  if (typeof validator === 'function') return validator;
  if (isPlainRecord(validator) || typeof validator === 'object') {
    if (typeof validator.validate === 'function') return validator;
  }
  throw new ContractError('invalid_claim_validator', `${label} must be a function or expose validate()`);
}

function assertCurrentClaimLease(lease, validator) {
  if (lease === null) return;
  const checked = assertClaimValidator(validator);
  if (checked === null) {
    throw new ContractError('claim_validation_required', 'A cross-Case claim lease requires current-owner validation');
  }
  const valid = typeof checked === 'function' ? checked(lease) : checked.validate(lease);
  if (valid !== true) {
    if (valid !== false) {
      throw new ContractError('invalid_claim_validator_result', 'Claim validator must return a synchronous boolean');
    }
    throw new ContractError('stale_claim_lease', `Claim lease ${lease.token} is no longer current`);
  }
}

function taskEffectKey(caseId, planDigest, taskId) {
  return typedDigest('tdev.task-effect.v1', { caseId, planDigest, taskId });
}

function attemptFence(input) {
  return typedDigest('tdev.attempt-fence.v1', input);
}

function receiptDigest(command) {
  return typedDigest('tdev.case-command.v1', command);
}

function snapshotDigest(snapshotWithoutDigest) {
  return typedDigest('tdev.case-snapshot.v2', snapshotWithoutDigest);
}

function eventDigest(eventWithoutDigest) {
  return typedDigest('tdev.case-event.v2', eventWithoutDigest);
}

function canonicalSize(value) {
  return Buffer.byteLength(canonicalJson(value), 'utf8');
}

function assertState(value, allowed, label) {
  if (!allowed.includes(value)) throw new ContractError('invalid_state', `${label} has invalid state ${String(value)}`);
}

function nextAttemptId(taskId, taskState) {
  return `${taskId}.${taskState.attemptIds.length + 1}`;
}

function activeAttemptFor(taskState, attempts) {
  return taskState.attemptIds
    .map((attemptId) => attempts[attemptId])
    .find((attempt) => attempt && NONTERMINAL_ATTEMPT_STATES.has(attempt.state));
}

function terminalDependencyReason(state) {
  switch (state) {
    case 'failed': return 'dependency_failed';
    case 'cancelled': return 'dependency_cancelled';
    case 'denied': return 'dependency_denied';
    case 'unverified': return 'dependency_unverified';
    case 'blocked': return 'dependency_blocked';
    default: return null;
  }
}

function deriveCaseState(plan, taskStates) {
  const states = plan.taskOrder.map((taskId) => taskStates[taskId].state);
  if (states.includes('reconciling')) return 'reconciling';
  const hasReadyTask = plan.taskOrder.some((taskId) =>
    taskStates[taskId].state === 'pending' &&
    plan.tasksById[taskId].dependencies.every((dependency) => taskStates[dependency].state === 'succeeded'));
  if (states.includes('running') || hasReadyTask) return 'active';
  if (states.includes('unverified')) return 'unverified';
  if (states.some((state) => state === 'failed' || state === 'denied')) return 'failed';
  if (states.includes('cancelled')) return 'cancelled';
  if (states.includes('blocked')) return 'failed';
  if (taskStates[plan.promotionTaskId].state === 'succeeded') return 'succeeded';
  if (states.includes('pending')) return 'failed';
  throw new ContractError('invariant_case_state', 'Task states do not derive a valid Case state');
}

export class CaseEngine {
  constructor({ caseId, plan, caseContract = {} }) {
    assertIdentifier(caseId, 'caseId');
    this.caseId = caseId;
    this._eventReservation = null;
    this.caseContract = normalizeCaseContract(caseContract.contractDigest ? {
      caseGrant: caseContract.caseGrant,
      workspacePolicy: caseContract.workspacePolicy,
      pathPolicy: caseContract.pathPolicy,
      limits: caseContract.limits,
    } : caseContract);
    const sourcePlan = isCompiledPlan(plan) ? serializePlan(plan) : plan;
    this.plan = definePlan(sourcePlan, { caseContract: this.caseContract });
    this.caseState = 'active';
    this.caseRevision = 0;
    this.eventSequence = 0;
    this.events = [];
    this.canonicalTree = validateTree(canonicalClone(this.plan.baseTree), this.caseContract);
    this.taskStates = createRecord();
    this.attempts = createRecord();
    this.receipts = createRecord();
    for (const taskId of this.plan.taskOrder) {
      this.taskStates[taskId] = {
        state: 'pending',
        attemptIds: [],
        acceptedResult: null,
        acceptedResultDigest: null,
        error: null,
        blockedBy: [],
      };
    }
    this._event('case_created', {
      planRevisionId: this.plan.revisionId,
      planDigest: this.plan.planDigest,
      baseDigest: this.plan.baseDigest,
      caseContractDigest: this.caseContract.contractDigest,
    });
    this._assertInvariants();
  }

  static restore(inputSnapshot, options = {}) {
    if (!isPlainRecord(inputSnapshot)) throw new ContractError('invalid_snapshot', 'Snapshot must be a record');
    assertRecordShape(options, [], ['reopen'], 'restore options');
    if (Object.hasOwn(options, 'reopen') && typeof options.reopen !== 'boolean') {
      throw new ContractError('invalid_restore_option', 'restore.reopen must be boolean');
    }
    const snapshot = Object.hasOwn(inputSnapshot, 'schemaVersion')
      ? canonicalClone(inputSnapshot)
      : migrateV1Snapshot(inputSnapshot);
    return restoreV2Snapshot(snapshot, options);
  }

  nextAttemptId(taskId) {
    const taskState = this.taskStates[taskId];
    if (!taskState) throw new ContractError('unknown_task', `Unknown Task: ${taskId}`);
    return nextAttemptId(taskId, taskState);
  }

  effectKey(taskId) {
    if (!this.plan.tasksById[taskId]) throw new ContractError('unknown_task', `Unknown Task: ${taskId}`);
    return taskEffectKey(this.caseId, this.plan.planDigest, taskId);
  }

  snapshot() {
    this._assertInvariants();
    verifyRestoredResults(this);
    const base = this.#snapshotWithoutDigest();
    return publicJsonClone({ ...base, snapshotDigest: snapshotDigest(base) });
  }

  #snapshotWithoutDigest() {
    return canonicalClone({
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      caseId: this.caseId,
      caseState: this.caseState,
      caseRevision: this.caseRevision,
      eventSequence: this.eventSequence,
      plan: this.plan,
      caseContract: this.caseContract,
      events: this.events,
      canonicalTree: this.canonicalTree,
      canonicalDigest: digest(this.canonicalTree),
      taskStates: this.taskStates,
      attempts: this.attempts,
      receipts: this.receipts,
    });
  }

  readyTaskIds() {
    if (this.caseState !== 'active') return [];
    return this.plan.taskOrder.filter((taskId) => {
      const taskState = this.taskStates[taskId];
      if (taskState.state !== 'pending') return false;
      return this.plan.tasksById[taskId].dependencies.every(
        (dependency) => this.taskStates[dependency].state === 'succeeded',
      );
    });
  }

  runningTaskIds() {
    return this.plan.taskOrder.filter((taskId) => this.taskStates[taskId].state === 'running');
  }

  claimHoldingTaskIds() {
    return this.plan.taskOrder.filter((taskId) => {
      const state = this.taskStates[taskId].state;
      return state === 'running' || state === 'reconciling';
    });
  }

  admissionDecision(taskId, executorCapabilities = []) {
    const task = this.plan.tasksById[taskId];
    const taskState = this.taskStates[taskId];
    if (!task || !taskState) return deepFreeze({ admissible: false, reason: 'unknown_task' });
    if (this.caseState !== 'active') return deepFreeze({ admissible: false, reason: `case_${this.caseState}` });
    if (taskState.state !== 'pending') return deepFreeze({ admissible: false, reason: `task_${taskState.state}` });
    const unsatisfied = task.dependencies.filter((dependency) => this.taskStates[dependency].state !== 'succeeded');
    if (unsatisfied.length > 0) return deepFreeze({ admissible: false, reason: 'dependencies', unsatisfied });
    if (taskState.attemptIds.length >= task.execution.retry.maxAttempts) {
      return deepFreeze({ admissible: false, reason: 'attempt_limit' });
    }
    if (task.kind === 'work') {
      const authority = authorityDecision(task.requiredCapabilities, this.caseContract, executorCapabilities);
      if (!authority.allowed) {
        return deepFreeze({ admissible: false, reason: 'authority', missingCapabilities: authority.missing });
      }
    }
    const conflictingTaskIds = this.claimHoldingTaskIds().filter((runningTaskId) =>
      claimSetsConflict(task.claims, this.plan.tasksById[runningTaskId].claims));
    if (conflictingTaskIds.length > 0) {
      return deepFreeze({ admissible: false, reason: 'claims', conflictingTaskIds });
    }
    return deepFreeze({ admissible: true, reason: 'admissible' });
  }

  canAdmit(taskId, executorCapabilities = []) {
    return this.admissionDecision(taskId, executorCapabilities).admissible;
  }

  startAttempt(taskId, executorInput, options = {}) {
    if (this._eventReservation === null) {
      return this.#withEventReservation(1, () => this.startAttempt(taskId, executorInput, options));
    }
    assertRecordShape(options, [], ['initialState', 'claimLease', 'claimValidator'], 'startAttempt options');
    const executor = normalizeExecutorIdentity(executorInput);
    const decision = this.admissionDecision(taskId, executor.capabilities);
    if (!decision.admissible) {
      const code = decision.reason === 'authority' ? 'not_authorized' : 'not_admissible';
      throw new ContractError(code, `Task ${taskId} is not admissible: ${decision.reason}`, decision);
    }
    const task = this.plan.tasksById[taskId];
    const taskState = this.taskStates[taskId];
    const ordinal = taskState.attemptIds.length + 1;
    const attemptId = `${taskId}.${ordinal}`;
    const initialState = options.initialState ?? 'running';
    if (!['dispatch_pending', 'queued', 'running'].includes(initialState)) {
      throw new ContractError('invalid_attempt_state', `Attempt cannot start in ${initialState}`);
    }
    const claimLease = normalizeClaimLease(options.claimLease, {
      caseId: this.caseId,
      taskId,
      attemptId,
    }, task, this.caseContract.limits.maxClaimsPerTask);
    assertCurrentClaimLease(claimLease, options.claimValidator);
    const effectKey = this.effectKey(taskId);
    const fencingToken = attemptFence({
      caseId: this.caseId,
      planDigest: this.plan.planDigest,
      taskId,
      attemptId,
      executorId: executor.id,
      executorEpoch: executor.epoch,
      claimLeaseToken: claimLease?.token ?? null,
      claimLeaseGeneration: claimLease?.generation ?? null,
      claimLeaseClaimsDigest: claimLease?.claimsDigest ?? null,
    });
    const attempt = {
      id: attemptId,
      taskId,
      ordinal,
      executorId: executor.id,
      executorEpoch: executor.epoch,
      executorCapabilities: executor.capabilities,
      state: initialState,
      effectKey,
      fencingToken,
      claimLease,
      resultDigest: null,
      error: null,
      reconciliation: null,
    };
    this.attempts[attemptId] = attempt;
    taskState.attemptIds.push(attemptId);
    taskState.state = 'running';
    taskState.error = null;
    taskState.blockedBy = [];
    this._event('attempt_started', {
      attemptId,
      taskId,
      ordinal,
      executorId: executor.id,
      executorEpoch: executor.epoch,
      state: initialState,
      fencingToken,
      claimLeaseToken: claimLease?.token ?? null,
      claimLeaseClaimsDigest: claimLease?.claimsDigest ?? null,
    });
    this._assertInvariants();
    return deepFreeze(canonicalClone(attempt));
  }

  markAttemptQueued(attemptId) {
    if (this._eventReservation === null) {
      return this.#withEventReservation(2, () => this.markAttemptQueued(attemptId));
    }
    return this.#transitionAttemptExecution(attemptId, 'queued', 'attempt_queued');
  }

  markAttemptRunning(attemptId) {
    if (this._eventReservation === null) {
      return this.#withEventReservation(2, () => this.markAttemptRunning(attemptId));
    }
    return this.#transitionAttemptExecution(attemptId, 'running', 'attempt_running');
  }

  markAttemptReconciling(attemptId, reason = 'delivery_uncertain') {
    if (this._eventReservation === null) {
      return this.#withEventReservation(2, () => this.markAttemptReconciling(attemptId, reason));
    }
    assertScalarString(reason, 'reconciliation reason');
    const attempt = this.#requireAttempt(attemptId);
    const task = this.plan.tasksById[attempt.taskId];
    if (task.execution.effectClass === 'result-only') {
      throw new ContractError('reconciliation_forbidden', 'Result-only Attempts cannot enter reconciliation');
    }
    if (attempt.state === 'cancel_requested') {
      return deepFreeze(canonicalClone(attempt));
    }
    if (attempt.state !== 'reconciling') assertAttemptTransition(attempt.state, 'reconciling');
    const reconciliationError = normalizeError(
      { code: 'reconciling', message: reason, certainty: 'unknown', retryable: false },
      {},
      this.caseContract.limits,
    );
    attempt.state = 'reconciling';
    attempt.error = reconciliationError;
    const taskState = this.taskStates[attempt.taskId];
    taskState.state = 'reconciling';
    taskState.error = attempt.error;
    this._event('attempt_reconciling', { attemptId, taskId: attempt.taskId, reason });
    this.reconcile();
    this._assertInvariants();
    return deepFreeze(canonicalClone(attempt));
  }

  #transitionAttemptExecution(attemptId, target, eventType) {
    const attempt = this.#requireAttempt(attemptId);
    if (attempt.state === target) return deepFreeze(canonicalClone(attempt));
    assertAttemptTransition(attempt.state, target);
    attempt.state = target;
    this.taskStates[attempt.taskId].state = target === 'reconciling' ? 'reconciling' : 'running';
    this._event(eventType, { attemptId, taskId: attempt.taskId });
    this.reconcile();
    this._assertInvariants();
    return deepFreeze(canonicalClone(attempt));
  }

  resultEnvelope(attemptId, result) {
    const attempt = this.#requireAttempt(attemptId);
    return deepFreeze(canonicalClone({
      caseId: this.caseId,
      planRevisionId: this.plan.revisionId,
      planDigest: this.plan.planDigest,
      taskId: attempt.taskId,
      attemptId: attempt.id,
      executorId: attempt.executorId,
      executorEpoch: attempt.executorEpoch,
      fencingToken: attempt.fencingToken,
      claimLeaseToken: attempt.claimLease?.token ?? null,
      claimLeaseGeneration: attempt.claimLease?.generation ?? null,
      claimLeaseClaimsDigest: attempt.claimLease?.claimsDigest ?? null,
      result,
    }));
  }

  createPromotionResult(taskId = this.plan.promotionTaskId) {
    const task = this.plan.tasksById[taskId];
    if (!task || task.kind !== 'promotion') {
      throw new ContractError('not_promotion', `Task ${taskId} is not the Promotion Task`);
    }
    const acceptedResults = task.dependencies.map((dependency) => {
      const dependencyTask = this.plan.tasksById[dependency];
      const taskState = this.taskStates[dependency];
      if (taskState.state !== 'succeeded' || taskState.acceptedResult === null) {
        throw new ContractError('promotion_not_ready', `Dependency ${dependency} has no accepted result`);
      }
      return {
        task: dependencyTask,
        taskId: dependency,
        result: taskState.acceptedResult,
        effectKey: this.effectKey(dependency),
      };
    });
    return promote(this.plan.baseTree, acceptedResults, this.plan.baseDigest, this.caseContract);
  }

  acceptResult(envelope, options = {}) {
    if (this._eventReservation === null) {
      return this.#withEventReservation(2, () => this.acceptResult(envelope, options));
    }
    assertRecordShape(options, [], ['claimValidator'], 'acceptResult options');
    assertClaimValidator(options.claimValidator);
    if (!isPlainRecord(envelope)) throw new ContractError('invalid_result_envelope', 'Result envelope must be a record');
    const attempt = this.#requireAttempt(envelope.attemptId);
    const task = this.plan.tasksById[attempt.taskId];
    this.#assertResultEnvelopeIdentity(envelope, attempt);

    let acceptedResult;
    if (task.kind === 'work') {
      acceptedResult = normalizeTaskResult(task, envelope.result, {
        baseDigest: this.plan.baseDigest,
        effectKey: attempt.effectKey,
        pathPolicy: this.caseContract.pathPolicy,
        limits: this.caseContract.limits,
      });
    } else {
      if (!isPlainRecord(envelope.result) || envelope.result.kind !== 'promotion' || envelope.result.baseDigest !== this.plan.baseDigest) {
        throw new ContractError('invalid_promotion_result', 'Promotion returned an invalid result');
      }
      const expected = this.createPromotionResult(task.id);
      if (digest(expected) !== digest(envelope.result)) {
        throw new ContractError('promotion_result_mismatch', 'Promotion result does not match deterministic recomputation');
      }
      acceptedResult = canonicalClone(envelope.result);
    }
    const acceptedDigest = digest(acceptedResult);
    const promotedTree = task.kind === 'promotion'
      ? validateTree(canonicalClone(acceptedResult.tree), this.caseContract)
      : null;

    if (attempt.state === 'succeeded') {
      if (attempt.resultDigest === acceptedDigest) {
        return deepFreeze({ deduplicated: true, resultDigest: acceptedDigest });
      }
      throw new ContractError('duplicate_result_conflict', `Attempt ${attempt.id} already accepted a different result`);
    }

    // A lease must be current for the first state-changing commit. An exact replay of an
    // already accepted result is handled above and is safe after lease release.
    assertCurrentClaimLease(attempt.claimLease, options.claimValidator);

    const allowsReconciliationResult = task.execution.effectClass !== 'result-only' &&
      RECONCILIATION_RESULT_STATES.has(attempt.state);
    if (!RESULT_ACCEPTING_STATES.has(attempt.state) && !allowsReconciliationResult) {
      throw new ContractError('stale_attempt', `Attempt ${attempt.id} is ${attempt.state}, not result-accepting`);
    }

    assertAttemptTransition(attempt.state, 'succeeded');
    attempt.state = 'succeeded';
    attempt.resultDigest = acceptedDigest;
    attempt.error = null;
    const taskState = this.taskStates[attempt.taskId];
    taskState.state = 'succeeded';
    taskState.acceptedResult = acceptedResult;
    taskState.acceptedResultDigest = acceptedDigest;
    taskState.error = null;
    taskState.blockedBy = [];
    if (task.kind === 'promotion') {
      this.canonicalTree = promotedTree;
      this.caseState = 'succeeded';
    }
    this._event('attempt_succeeded', {
      attemptId: attempt.id,
      taskId: task.id,
      resultKind: acceptedResult.kind,
      resultDigest: acceptedDigest,
    });
    this.reconcile();
    this._assertInvariants();
    return deepFreeze({ deduplicated: false, resultDigest: acceptedDigest });
  }

  completeAttempt(attemptId, result, options = {}) {
    return this.acceptResult(this.resultEnvelope(attemptId, result), options);
  }

  recordExecutorFailure(attemptId, error) {
    if (this._eventReservation === null) {
      const taskId = this.attempts[attemptId]?.taskId;
      return this.#withEventReservation(3 + this.#descendantCount(taskId), () =>
        this.recordExecutorFailure(attemptId, error));
    }
    const attempt = this.#requireAttempt(attemptId);
    const task = this.plan.tasksById[attempt.taskId];
    const normalized = normalizeError(error, {
      certainty: task.execution.effectClass === 'result-only' ? 'not_applied' : 'unknown',
      retryable: task.execution.effectClass !== 'reconcilable-external',
    }, this.caseContract.limits);
    if (attempt.state === 'cancel_requested' && task.execution.effectClass !== 'result-only') {
      this.reconcile();
      this._assertInvariants();
      return deepFreeze({ reconciling: true, cancellationRequested: true });
    }
    const safeIdempotentRetry = task.execution.effectClass === 'idempotent-external' &&
      normalized.certainty === 'unknown' &&
      normalized.retryable &&
      attempt.ordinal < task.execution.retry.maxAttempts;
    if (task.execution.effectClass !== 'result-only' &&
        normalized.certainty === 'unknown' &&
        !safeIdempotentRetry) {
      if (attempt.state !== 'reconciling') assertAttemptTransition(attempt.state, 'reconciling');
      attempt.state = 'reconciling';
      attempt.error = normalized;
      const taskState = this.taskStates[attempt.taskId];
      taskState.state = 'reconciling';
      taskState.error = normalized;
      this._event('attempt_reconciling', {
        attemptId,
        taskId: attempt.taskId,
        reason: normalized.code,
      });
      this.reconcile();
      this._assertInvariants();
      return deepFreeze({ reconciling: true, cancellationRequested: false });
    }
    this.failAttempt(attemptId, normalized, { retryable: normalized.retryable });
    return deepFreeze({ reconciling: false, cancellationRequested: false });
  }

  failAttempt(attemptId, error, options = {}) {
    if (this._eventReservation === null) {
      const taskId = this.attempts[attemptId]?.taskId;
      return this.#withEventReservation(3 + this.#descendantCount(taskId), () =>
        this.failAttempt(attemptId, error, options));
    }
    assertRecordShape(options, [], ['retryable'], 'failAttempt options');
    if (Object.hasOwn(options, 'retryable') && typeof options.retryable !== 'boolean') {
      throw new ContractError('invalid_failure_option', 'failAttempt.retryable must be boolean');
    }
    const attempt = this.#requireAttempt(attemptId);
    if (!NONTERMINAL_ATTEMPT_STATES.has(attempt.state)) {
      throw new ContractError('stale_attempt', `Attempt ${attemptId} is ${attempt.state}, not nonterminal`);
    }
    const normalizedError = normalizeError(error, { retryable: options.retryable ?? false }, this.caseContract.limits);
    const task = this.plan.tasksById[attempt.taskId];
    const safeUnknownRetry = task.execution.effectClass === 'idempotent-external' &&
      normalizedError.certainty === 'unknown' &&
      options.retryable === true &&
      attempt.ordinal < task.execution.retry.maxAttempts &&
      attempt.state !== 'cancel_requested';
    if (attempt.state === 'cancel_requested' && task.execution.effectClass !== 'result-only') {
      throw new ContractError('reconciliation_required', 'A cancelled external Attempt must be reconciled');
    }
    if (task.execution.effectClass !== 'result-only' &&
        normalizedError.certainty === 'unknown' &&
        !safeUnknownRetry) {
      throw new ContractError('reconciliation_required', 'An ambiguous external effect cannot be converted to failure');
    }
    assertAttemptTransition(attempt.state, 'failed');
    attempt.state = 'failed';
    attempt.error = normalizedError;
    const taskState = this.taskStates[attempt.taskId];
    const retryable = Boolean(options.retryable) &&
      task.kind === 'work' &&
      attempt.ordinal < task.execution.retry.maxAttempts &&
      !TERMINAL_CASE_STATES.has(this.caseState);
    taskState.state = retryable ? 'pending' : 'failed';
    taskState.error = normalizedError;
    taskState.blockedBy = [];
    this._event('attempt_failed', {
      attemptId,
      taskId: attempt.taskId,
      error: normalizedError,
      retryScheduled: retryable,
    });
    if (retryable) {
      this._event('task_retry_scheduled', {
        taskId: attempt.taskId,
        nextOrdinal: attempt.ordinal + 1,
        effectKey: attempt.effectKey,
      });
    }
    this.reconcile();
    this._assertInvariants();
  }

  denyTask(taskId, missingCapabilities) {
    if (this._eventReservation === null) {
      return this.#withEventReservation(2 + this.#descendantCount(taskId), () =>
        this.denyTask(taskId, missingCapabilities));
    }
    const taskState = this.taskStates[taskId];
    if (!taskState) throw new ContractError('unknown_task', `Unknown Task: ${taskId}`);
    if (taskState.state !== 'pending') return false;
    const unsatisfied = this.plan.tasksById[taskId].dependencies
      .filter((dependency) => this.taskStates[dependency].state !== 'succeeded');
    if (unsatisfied.length > 0) {
      throw new ContractError('not_admissible', `Task ${taskId} cannot be denied before its dependencies succeed`, { unsatisfied });
    }
    if (!Array.isArray(missingCapabilities)) {
      throw new ContractError('invalid_authority', 'missingCapabilities must be an array');
    }
    missingCapabilities.forEach((capability, index) => assertIdentifier(capability, `missingCapabilities[${index}]`));
    const missing = [...new Set(missingCapabilities ?? [])].sort(compareText);
    const authorityError = normalizeError({
      code: 'authority_denied',
      message: `Missing required capabilities: ${missing.join(', ')}`,
      certainty: 'not_applied',
      retryable: false,
    }, {}, this.caseContract.limits);
    taskState.state = 'denied';
    taskState.error = authorityError;
    this._event('task_denied', { taskId, missingCapabilities: missing });
    this.reconcile();
    this._assertInvariants();
    return true;
  }

  cancelTask(taskId, reason = 'cancelled') {
    if (this._eventReservation === null) {
      return this.#withEventReservation(2 + this.#descendantCount(taskId), () =>
        this.cancelTask(taskId, reason));
    }
    assertScalarString(reason, 'cancellation reason');
    const taskState = this.taskStates[taskId];
    if (!taskState) throw new ContractError('unknown_task', `Unknown Task: ${taskId}`);
    if (TERMINAL_TASK_STATES.has(taskState.state)) return false;
    const task = this.plan.tasksById[taskId];
    const attempt = activeAttemptFor(taskState, this.attempts);
    if (attempt && task.execution.effectClass !== 'result-only') {
      if (attempt.state !== 'cancel_requested') assertAttemptTransition(attempt.state, 'cancel_requested');
      const cancellationError = normalizeError(
        { code: 'cancel_requested', message: reason, certainty: 'unknown' },
        {},
        this.caseContract.limits,
      );
      attempt.state = 'cancel_requested';
      attempt.error = cancellationError;
      taskState.state = 'reconciling';
      taskState.error = cancellationError;
      this._event('task_cancellation_requested', { taskId, attemptId: attempt.id, reason });
      this.reconcile();
      this._assertInvariants();
      return true;
    }
    if (attempt) assertAttemptTransition(attempt.state, 'cancelled');
    const cancellationError = normalizeError(
      { code: 'cancelled', message: reason, certainty: 'not_applied' },
      {},
      this.caseContract.limits,
    );
    if (attempt) {
      attempt.state = 'cancelled';
      attempt.error = cancellationError;
    }
    taskState.state = 'cancelled';
    taskState.error = cancellationError;
    taskState.blockedBy = [];
    this._event('task_cancelled', { taskId, attemptId: attempt?.id ?? null, reason });
    this.reconcile();
    this._assertInvariants();
    return true;
  }

  resolveReconciliation(attemptId, decision, options = {}) {
    if (this._eventReservation === null) {
      const taskId = this.attempts[attemptId]?.taskId;
      return this.#withEventReservation(3 + this.#descendantCount(taskId), () =>
        this.resolveReconciliation(attemptId, decision, options));
    }
    assertRecordShape(options, [], ['claimValidator'], 'resolveReconciliation options');
    const attempt = this.#requireAttempt(attemptId);
    if (!RECONCILIATION_RESULT_STATES.has(attempt.state)) {
      throw new ContractError('not_reconciling', `Attempt ${attemptId} is ${attempt.state}, not reconciling`);
    }
    validateReconciliationDecision(decision);
    const evidence = decision.evidence === undefined ? null : canonicalClone(decision.evidence);
    if (canonicalSize(evidence) > this.caseContract.limits.maxEvidenceBytes) {
      throw new ContractError('evidence_limit_exceeded', 'Reconciliation evidence exceeds the configured limit');
    }
    const reconciliation = deepFreeze({ outcome: decision.outcome, evidence });
    const taskState = this.taskStates[attempt.taskId];
    const task = this.plan.tasksById[attempt.taskId];
    if (task.execution.effectClass === 'result-only') {
      throw new ContractError('reconciliation_forbidden', 'Result-only Attempts cannot be reconciled');
    }
    const cancellationRequested = attempt.state === 'cancel_requested' ||
      taskState.error?.code === 'cancel_requested';

    if (decision.outcome === 'succeeded') {
      const accepted = this.acceptResult(this.resultEnvelope(attemptId, decision.result), options);
      attempt.reconciliation = reconciliation;
      this._event('attempt_reconciled', {
        attemptId,
        taskId: attempt.taskId,
        outcome: decision.outcome,
        evidenceDigest: evidence === null ? null : digest(evidence),
      });
      this.reconcile();
      this._assertInvariants();
      return deepFreeze({
        outcome: decision.outcome,
        taskState: taskState.state,
        resultDigest: accepted.resultDigest,
      });
    }

    let targetAttemptState;
    let targetTaskState;
    let reconciliationError;
    if (decision.outcome === 'not_applied') {
      targetAttemptState = 'interrupted';
      assertAttemptTransition(attempt.state, targetAttemptState);
      reconciliationError = normalizeError(
        { code: 'effect_not_applied', message: 'Reconciliation proved the effect was not applied' },
        {},
        this.caseContract.limits,
      );
      if (cancellationRequested) targetTaskState = 'cancelled';
      else if (attempt.ordinal < task.execution.retry.maxAttempts) targetTaskState = 'pending';
      else targetTaskState = 'failed';
    } else if (decision.outcome === 'failed') {
      targetAttemptState = 'failed';
      assertAttemptTransition(attempt.state, targetAttemptState);
      reconciliationError = normalizeError(
        decision.error ?? { code: 'reconciled_failure', message: 'Reconciliation proved failure' },
        {},
        this.caseContract.limits,
      );
      if (decision.retry === true &&
          task.execution.effectClass === 'reconcilable-external' &&
          reconciliationError.certainty === 'unknown') {
        throw new ContractError('unsafe_reconciliation_retry', 'Reconcilable effects require not-applied certainty before retry');
      }
      const retry = decision.retry === true &&
        !cancellationRequested &&
        attempt.ordinal < task.execution.retry.maxAttempts;
      targetTaskState = retry ? 'pending' : 'failed';
    } else if (decision.outcome === 'cancelled') {
      targetAttemptState = 'cancelled';
      assertAttemptTransition(attempt.state, targetAttemptState);
      reconciliationError = normalizeError(
        { code: 'reconciled_cancelled', message: 'Reconciliation proved cancellation' },
        {},
        this.caseContract.limits,
      );
      targetTaskState = 'cancelled';
    } else {
      targetAttemptState = 'unverified';
      assertAttemptTransition(attempt.state, targetAttemptState);
      reconciliationError = normalizeError({
        code: 'effect_unverified',
        message: typeof decision.reason === 'string' ? decision.reason : 'External effect could not be verified',
        certainty: 'unknown',
      }, {}, this.caseContract.limits);
      targetTaskState = 'unverified';
    }

    attempt.reconciliation = reconciliation;
    attempt.state = targetAttemptState;
    attempt.error = reconciliationError;
    taskState.state = targetTaskState;
    taskState.error = reconciliationError;
    this._event('attempt_reconciled', {
      attemptId,
      taskId: attempt.taskId,
      outcome: decision.outcome,
      evidenceDigest: evidence === null ? null : digest(evidence),
    });
    this.reconcile();
    this._assertInvariants();
    return deepFreeze({ outcome: decision.outcome, taskState: taskState.state });
  }

  reconcile() {
    if (this._eventReservation === null) {
      return this.#withEventReservation(this.plan.taskOrder.length + 1, () => this.reconcile());
    }
    if (this.caseState === 'succeeded') return this.caseState;

    let changed = true;
    while (changed) {
      changed = false;
      for (const taskId of this.plan.taskOrder) {
        const taskState = this.taskStates[taskId];
        if (taskState.state !== 'pending' && taskState.state !== 'blocked') continue;
        const blockers = this.plan.tasksById[taskId].dependencies
          .filter((dependency) => terminalDependencyReason(this.taskStates[dependency].state) !== null)
          .sort(compareText);
        if (taskState.state === 'pending' && blockers.length > 0) {
          const blockerError = normalizeError({
            code: 'dependency_blocked',
            message: `Task is blocked by terminal dependencies: ${blockers.join(', ')}`,
            certainty: 'not_applied',
            retryable: false,
          }, {}, this.caseContract.limits);
          taskState.state = 'blocked';
          taskState.blockedBy = blockers;
          taskState.error = blockerError;
          this._event('task_blocked', { taskId, blockedBy: blockers });
          changed = true;
        } else if (taskState.state === 'blocked' && taskState.blockedBy.join('\0') !== blockers.join('\0')) {
          const blockerError = normalizeError({
            code: 'dependency_blocked',
            message: `Task is blocked by terminal dependencies: ${blockers.join(', ')}`,
            certainty: 'not_applied',
            retryable: false,
          }, {}, this.caseContract.limits);
          taskState.blockedBy = blockers;
          taskState.error = blockerError;
          this._event('task_blockers_updated', { taskId, blockedBy: blockers });
          changed = true;
        }
      }
    }

    const states = Object.values(this.taskStates).map((taskState) => taskState.state);
    if (states.includes('reconciling')) {
      this.#setCaseState('reconciling', 'attempt_reconciling');
      return this.caseState;
    }
    if (states.includes('running') || this.readyTaskIdsIgnoringCase().length > 0) {
      this.#setCaseState('active', 'work_available');
      return this.caseState;
    }
    if (states.includes('unverified')) {
      this.#setCaseState('unverified', 'task_unverified');
      return this.caseState;
    }
    if (states.some((state) => state === 'failed' || state === 'denied')) {
      this.#setCaseState('failed', 'task_failed_or_denied');
      return this.caseState;
    }
    if (states.includes('cancelled')) {
      this.#setCaseState('cancelled', 'task_cancelled');
      return this.caseState;
    }
    if (states.includes('blocked')) {
      this.#setCaseState('failed', 'blocked_graph');
      return this.caseState;
    }
    const promotionState = this.taskStates[this.plan.promotionTaskId];
    if (promotionState.state === 'succeeded') {
      this.#setCaseState('succeeded', 'promotion_succeeded');
      return this.caseState;
    }
    if (states.some((state) => state === 'pending')) {
      this.#setCaseState('failed', 'blocked_graph');
      return this.caseState;
    }
    return this.caseState;
  }

  readyTaskIdsIgnoringCase() {
    return this.plan.taskOrder.filter((taskId) => {
      const state = this.taskStates[taskId];
      return state.state === 'pending' && this.plan.tasksById[taskId].dependencies.every(
        (dependency) => this.taskStates[dependency].state === 'succeeded');
    });
  }

  applyCommand(envelope, options = {}) {
    if (this._eventReservation === null) {
      return this.#withEventReservation(this.plan.taskOrder.length + 4, () => this.applyCommand(envelope, options));
    }
    assertRecordShape(options, [], ['claimValidator'], 'applyCommand options');
    assertClaimValidator(options.claimValidator);
    assertRecordShape(envelope, ['requestId', 'command'], ['expectedCaseRevision'], 'command envelope');
    const { requestId, expectedCaseRevision = undefined, command } = envelope;
    assertIdentifier(requestId, 'requestId');
    if (expectedCaseRevision !== undefined) {
      assertSafeInteger(expectedCaseRevision, 'expectedCaseRevision', { min: 0 });
    }
    validateCommand(command);
    const normalizedCommand = canonicalClone(command);
    const commandDigest = receiptDigest(normalizedCommand);
    const existing = this.receipts[requestId];
    if (existing) {
      if (existing.commandDigest !== commandDigest) {
        throw new ContractError('request_conflict', `Request ${requestId} was already used for a different command`);
      }
      return deepFreeze({ deduplicated: true, response: canonicalClone(existing.response) });
    }
    if (expectedCaseRevision !== undefined) {
      if (expectedCaseRevision !== this.caseRevision) {
        throw new ContractError('revision_conflict', `Expected Case revision ${expectedCaseRevision}, found ${this.caseRevision}`, {
          expectedCaseRevision,
          actualCaseRevision: this.caseRevision,
        });
      }
    }
    if (Object.keys(this.receipts).length >= this.caseContract.limits.maxReceipts) {
      throw new ContractError('receipt_limit_exceeded', 'Case mutation receipt limit exceeded');
    }

    const response = this.#dispatchCommand(normalizedCommand, options);
    const canonicalResponse = canonicalClone(response);
    const responseDigest = digest(canonicalResponse);
    this._event('command_committed', { requestId, commandDigest, responseDigest });
    this.receipts[requestId] = deepFreeze({
      requestId,
      commandDigest,
      response: canonicalResponse,
      responseDigest,
      committedRevision: this.caseRevision,
    });
    this._assertInvariants();
    return deepFreeze({ deduplicated: false, response: canonicalClone(canonicalResponse) });
  }

  #withEventReservation(count, operation) {
    assertSafeInteger(count, 'event reservation', { min: 0 });
    const before = canonicalClone({
      caseState: this.caseState,
      caseRevision: this.caseRevision,
      eventSequence: this.eventSequence,
      events: this.events,
      canonicalTree: this.canonicalTree,
      taskStates: this.taskStates,
      attempts: this.attempts,
      receipts: this.receipts,
    });
    this._eventReservation = count;
    try {
      return operation();
    } catch (error) {
      this.caseState = before.caseState;
      this.caseRevision = before.caseRevision;
      this.eventSequence = before.eventSequence;
      this.events = before.events;
      this.canonicalTree = before.canonicalTree;
      this.taskStates = before.taskStates;
      this.attempts = before.attempts;
      this.receipts = before.receipts;
      throw error;
    } finally {
      this._eventReservation = null;
    }
  }

  #descendantCount(taskId) {
    if (!taskId || !this.plan.tasksById[taskId]) return 0;
    const seen = new Set();
    const pending = [...this.plan.reverseDependenciesById[taskId]];
    while (pending.length > 0) {
      const current = pending.pop();
      if (seen.has(current)) continue;
      seen.add(current);
      pending.push(...this.plan.reverseDependenciesById[current]);
    }
    return seen.size;
  }

  #dispatchCommand(command, options) {
    switch (command.type) {
      case 'start_attempt':
        return this.startAttempt(command.taskId, command.executor, {
          initialState: command.initialState,
          claimLease: command.claimLease,
          claimValidator: options.claimValidator,
        });
      case 'mark_attempt_queued': return this.markAttemptQueued(command.attemptId);
      case 'mark_attempt_running': return this.markAttemptRunning(command.attemptId);
      case 'mark_attempt_reconciling': return this.markAttemptReconciling(command.attemptId, command.reason);
      case 'accept_result': return this.acceptResult(command.envelope, { claimValidator: options.claimValidator });
      case 'fail_attempt':
        this.failAttempt(command.attemptId, command.error, { retryable: command.retryable === true });
        return { accepted: true };
      case 'cancel_task': return { changed: this.cancelTask(command.taskId, command.reason) };
      case 'deny_task': return { changed: this.denyTask(command.taskId, command.missingCapabilities) };
      case 'resolve_reconciliation':
        return this.resolveReconciliation(command.attemptId, command.decision, {
          claimValidator: options.claimValidator,
        });
      default: throw new ContractError('unknown_command', `Unknown command type: ${command.type}`);
    }
  }

  #setCaseState(target, reason) {
    if (!CASE_STATES.includes(target)) throw new ContractError('invalid_case_state', `Invalid Case state: ${target}`);
    if (this.caseState === target) return;
    if (TERMINAL_CASE_STATES.has(this.caseState)) return;
    const previous = this.caseState;
    this.caseState = target;
    this._event('case_state_changed', { from: previous, to: target, reason });
  }

  _event(type, detail) {
    if (this.events.length >= this.caseContract.limits.maxEvents) {
      throw new ContractError('event_limit_exceeded', 'Case Event limit exceeded');
    }
    if (this._eventReservation !== null) {
      if (this._eventReservation < 1) {
        throw new ContractError('event_reservation_exhausted', 'Mutation emitted more Events than reserved');
      }
      this._eventReservation -= 1;
    }
    assertIdentifier(type, 'event.type');
    const normalizedDetail = canonicalClone(detail);
    const sequence = this.eventSequence + 1;
    const caseRevision = this.caseRevision + 1;
    const previousDigest = this.events.length === 0 ? null : this.events[this.events.length - 1].eventDigest;
    const base = { sequence, caseRevision, type, detail: normalizedDetail, previousDigest };
    const event = deepFreeze({ ...base, eventDigest: eventDigest(base) });
    this.events.push(event);
    this.eventSequence = sequence;
    this.caseRevision = caseRevision;
  }

  #requireAttempt(attemptId) {
    const attempt = this.attempts[attemptId];
    if (!attempt) throw new ContractError('unknown_attempt', `Unknown Attempt: ${attemptId}`);
    return attempt;
  }

  #assertResultEnvelopeIdentity(envelope, attempt) {
    const expected = {
      caseId: this.caseId,
      planRevisionId: this.plan.revisionId,
      planDigest: this.plan.planDigest,
      taskId: attempt.taskId,
      attemptId: attempt.id,
      executorId: attempt.executorId,
      executorEpoch: attempt.executorEpoch,
      fencingToken: attempt.fencingToken,
      claimLeaseToken: attempt.claimLease?.token ?? null,
      claimLeaseGeneration: attempt.claimLease?.generation ?? null,
      claimLeaseClaimsDigest: attempt.claimLease?.claimsDigest ?? null,
    };
    assertRecordShape(envelope, [...Object.keys(expected), 'result'], [], 'result envelope');
    for (const [key, value] of Object.entries(expected)) {
      if (envelope[key] !== value) {
        throw new ContractError('stale_result', `Result envelope ${key} does not match Attempt ${attempt.id}`, {
          field: key,
          expected: value,
          actual: envelope[key] ?? null,
        });
      }
    }
  }

  #replaceFrom(other) {
    this.caseId = other.caseId;
    this.caseContract = other.caseContract;
    this.plan = other.plan;
    this.caseState = other.caseState;
    this.caseRevision = other.caseRevision;
    this.eventSequence = other.eventSequence;
    this.events = canonicalClone(other.events);
    this.canonicalTree = canonicalClone(other.canonicalTree);
    this.taskStates = canonicalClone(other.taskStates);
    this.attempts = canonicalClone(other.attempts);
    this.receipts = canonicalClone(other.receipts);
  }

  _assertInvariants() {
    assertIdentifier(this.caseId, 'caseId');
    if (!CASE_STATES.includes(this.caseState)) {
      throw new ContractError('invariant_case_state', `Invalid Case state ${this.caseState}`);
    }
    if (!Array.isArray(this.events) || !isPlainRecord(this.taskStates) || !isPlainRecord(this.attempts) || !isPlainRecord(this.receipts)) {
      throw new ContractError('invariant_state_shape', 'Task, Attempt, and receipt collections must be records');
    }
    if (this.events.length > this.caseContract.limits.maxEvents) {
      throw new ContractError('event_limit_exceeded', 'Case Event limit exceeded');
    }
    if (this.caseRevision !== this.eventSequence || this.events.length !== this.eventSequence) {
      throw new ContractError('invariant_event_revision', 'Case revision, Event sequence, and Event count must match');
    }

    let previousDigest = null;
    for (let index = 0; index < this.events.length; index += 1) {
      const event = this.events[index];
      const expectedSequence = index + 1;
      assertRecordShape(event, ['sequence', 'caseRevision', 'type', 'detail', 'previousDigest', 'eventDigest'], [], `Event ${expectedSequence}`);
      assertSafeInteger(event.sequence, `Event ${expectedSequence}.sequence`, { min: 1 });
      assertSafeInteger(event.caseRevision, `Event ${expectedSequence}.caseRevision`, { min: 1 });
      assertIdentifier(event.type, `Event ${expectedSequence}.type`);
      if (event.previousDigest !== null) assertDigest(event.previousDigest, `Event ${expectedSequence}.previousDigest`);
      assertDigest(event.eventDigest, `Event ${expectedSequence}.eventDigest`);
      canonicalClone(event.detail);
      if (event.sequence !== expectedSequence || event.caseRevision !== expectedSequence || event.previousDigest !== previousDigest) {
        throw new ContractError('invariant_event_chain', `Event chain is invalid at sequence ${expectedSequence}`);
      }
      const base = {
        sequence: event.sequence,
        caseRevision: event.caseRevision,
        type: event.type,
        detail: event.detail,
        previousDigest: event.previousDigest,
      };
      if (event.eventDigest !== eventDigest(base)) {
        throw new ContractError('invariant_event_digest', `Event digest is invalid at sequence ${expectedSequence}`);
      }
      previousDigest = event.eventDigest;
    }

    const dependencyBoundStates = new Set(['running', 'reconciling', 'succeeded', 'failed', 'denied', 'unverified']);
    for (const taskId of this.plan.taskOrder) {
      const task = this.plan.tasksById[taskId];
      const taskState = this.taskStates[taskId];
      if (!taskState) throw new ContractError('invariant_task_missing', `Missing state for Task ${taskId}`);
      assertRecordShape(
        taskState,
        ['state', 'attemptIds', 'acceptedResult', 'acceptedResultDigest', 'error', 'blockedBy'],
        [],
        `Task state ${taskId}`,
      );
      assertState(taskState.state, TASK_STATES, `Task ${taskId}`);
      assertIdentifierArray(taskState.attemptIds, `Task ${taskId}.attemptIds`);
      assertIdentifierArray(taskState.blockedBy, `Task ${taskId}.blockedBy`, { sorted: true });
      validateStoredError(taskState.error, `Task ${taskId}.error`, this.caseContract.limits);
      if (taskState.acceptedResultDigest !== null) {
        assertDigest(taskState.acceptedResultDigest, `Task ${taskId}.acceptedResultDigest`);
      }

      const linkedAttempts = taskState.attemptIds.map((attemptId) => {
        const attempt = this.attempts[attemptId];
        if (!attempt) throw new ContractError('invariant_attempt_missing', `Task ${taskId} links missing Attempt ${attemptId}`);
        if (attempt.taskId !== taskId) {
          throw new ContractError('invariant_attempt_link', `Task ${taskId} links Attempt ${attemptId} owned by ${attempt.taskId}`);
        }
        return attempt;
      });
      const nonterminal = linkedAttempts.filter((attempt) => NONTERMINAL_ATTEMPT_STATES.has(attempt.state));
      if (nonterminal.length > 1) {
        throw new ContractError('invariant_attempt_count', `Task ${taskId} has multiple nonterminal Attempts`);
      }
      if (taskState.state === 'running' &&
          (nonterminal.length !== 1 || RECONCILIATION_RESULT_STATES.has(nonterminal[0].state))) {
        throw new ContractError('invariant_task_attempt', `Task ${taskId} running state does not match its Attempt`);
      }
      if (taskState.state === 'reconciling' &&
          (nonterminal.length !== 1 || !RECONCILIATION_RESULT_STATES.has(nonterminal[0].state))) {
        throw new ContractError('invariant_task_attempt', `Task ${taskId} reconciling state does not match its Attempt`);
      }
      if (!['running', 'reconciling'].includes(taskState.state) && nonterminal.length !== 0) {
        throw new ContractError('invariant_task_attempt', `Task ${taskId} has a nonterminal Attempt while ${taskState.state}`);
      }
      if (taskState.attemptIds.length > task.execution.retry.maxAttempts) {
        throw new ContractError('invariant_attempt_limit', `Task ${taskId} exceeds its Attempt limit`);
      }
      if (taskState.state === 'pending' && taskState.attemptIds.length >= task.execution.retry.maxAttempts) {
        throw new ContractError('invariant_attempt_limit', `Pending Task ${taskId} has exhausted its Attempt limit`);
      }
      if (task.execution.effectClass === 'result-only' && taskState.state === 'reconciling') {
        throw new ContractError('invariant_reconciliation', `Result-only Task ${taskId} cannot be reconciling`);
      }

      if (taskState.state === 'succeeded') {
        if (taskState.acceptedResult === null || taskState.acceptedResultDigest !== digest(taskState.acceptedResult)) {
          throw new ContractError('invariant_result', `Succeeded Task ${taskId} has invalid accepted result`);
        }
        const succeededAttempts = linkedAttempts.filter((attempt) => attempt.state === 'succeeded');
        if (succeededAttempts.length !== 1 || linkedAttempts.at(-1)?.state !== 'succeeded') {
          throw new ContractError('invariant_result', `Succeeded Task ${taskId} must have one final succeeded Attempt`);
        }
      } else if (taskState.acceptedResult !== null || taskState.acceptedResultDigest !== null) {
        throw new ContractError('invariant_result', `Non-succeeded Task ${taskId} has an accepted result`);
      }

      if (['running', 'succeeded'].includes(taskState.state) && taskState.error !== null) {
        throw new ContractError('invariant_task_error', `Task ${taskId} cannot retain an error while ${taskState.state}`);
      }
      if (['reconciling', 'failed', 'cancelled', 'denied', 'unverified', 'blocked'].includes(taskState.state) && taskState.error === null) {
        throw new ContractError('invariant_task_error', `Task ${taskId} requires an error while ${taskState.state}`);
      }

      const unsatisfiedDependencies = task.dependencies
        .filter((dependency) => this.taskStates[dependency]?.state !== 'succeeded');
      if (dependencyBoundStates.has(taskState.state) && unsatisfiedDependencies.length > 0) {
        throw new ContractError('invariant_dependency', `Task ${taskId} entered ${taskState.state} before its dependencies succeeded`, {
          unsatisfiedDependencies,
        });
      }
      const terminalBlockers = task.dependencies
        .filter((dependency) => terminalDependencyReason(this.taskStates[dependency]?.state) !== null)
        .sort(compareText);
      if (taskState.state === 'pending' && terminalBlockers.length > 0) {
        throw new ContractError('invariant_dependency', `Pending Task ${taskId} has terminal dependency blockers`);
      }
      if (taskState.state === 'blocked') {
        if (taskState.blockedBy.join('\0') !== terminalBlockers.join('\0')) {
          throw new ContractError('invariant_dependency', `Blocked Task ${taskId} has invalid blocker evidence`);
        }
      } else if (taskState.blockedBy.length !== 0) {
        throw new ContractError('invariant_dependency', `Non-blocked Task ${taskId} retains blocker evidence`);
      }
    }
    if (Object.keys(this.taskStates).sort(compareText).join('\0') !== this.plan.taskOrder.join('\0')) {
      throw new ContractError('invariant_task_set', 'Task state set does not match the Plan');
    }

    for (const [attemptId, attempt] of Object.entries(this.attempts)) {
      assertRecordShape(attempt, [
        'id', 'taskId', 'ordinal', 'executorId', 'executorEpoch', 'executorCapabilities', 'state',
        'effectKey', 'fencingToken', 'claimLease', 'resultDigest', 'error', 'reconciliation',
      ], [], `Attempt ${attemptId}`);
      assertIdentifier(attemptId, `Attempt key ${attemptId}`);
      assertIdentifier(attempt.id, `Attempt ${attemptId}.id`);
      assertIdentifier(attempt.taskId, `Attempt ${attemptId}.taskId`);
      if (attempt.id !== attemptId) throw new ContractError('invariant_attempt_identity', `Attempt ${attemptId} has a mismatched ID`);
      if (!this.taskStates[attempt.taskId]) throw new ContractError('invariant_attempt_task', `Attempt ${attemptId} references an unknown Task`);
      assertSafeInteger(attempt.ordinal, `Attempt ${attemptId}.ordinal`, { min: 1 });
      assertIdentifier(attempt.executorId, `Attempt ${attemptId}.executorId`);
      assertSafeInteger(attempt.executorEpoch, `Attempt ${attemptId}.executorEpoch`, { min: 1 });
      assertIdentifierArray(attempt.executorCapabilities, `Attempt ${attemptId}.executorCapabilities`, { sorted: true });
      if (attempt.executorCapabilities.length > 1_000) {
        throw new ContractError('authority_limit_exceeded', `Attempt ${attemptId} has too many executor capabilities`);
      }
      assertState(attempt.state, ATTEMPT_STATES, `Attempt ${attemptId}`);
      assertDigest(attempt.effectKey, `Attempt ${attemptId}.effectKey`);
      assertDigest(attempt.fencingToken, `Attempt ${attemptId}.fencingToken`);
      if (attempt.resultDigest !== null) assertDigest(attempt.resultDigest, `Attempt ${attemptId}.resultDigest`);
      validateStoredError(attempt.error, `Attempt ${attemptId}.error`, this.caseContract.limits);
      validateReconciliationRecord(
        attempt.reconciliation,
        `Attempt ${attemptId}.reconciliation`,
        this.caseContract.limits,
      );

      const taskState = this.taskStates[attempt.taskId];
      const task = this.plan.tasksById[attempt.taskId];
      if (!taskState.attemptIds.includes(attemptId)) {
        throw new ContractError('invariant_attempt_link', `Attempt ${attemptId} is not linked by its Task`);
      }
      const expectedOrdinal = taskState.attemptIds.indexOf(attemptId) + 1;
      if (attempt.ordinal !== expectedOrdinal || attempt.id !== `${attempt.taskId}.${expectedOrdinal}`) {
        throw new ContractError('invariant_attempt_ordinal', `Attempt ${attemptId} has invalid ordinal`);
      }
      if (attempt.claimLease !== null) {
        const normalizedLease = normalizeClaimLease(attempt.claimLease, {
          caseId: this.caseId,
          taskId: attempt.taskId,
          attemptId,
        }, this.plan.tasksById[attempt.taskId], this.caseContract.limits.maxClaimsPerTask);
        if (canonicalJson(normalizedLease) !== canonicalJson(attempt.claimLease)) {
          throw new ContractError('invariant_claim_lease', `Attempt ${attemptId} has a noncanonical claim lease`);
        }
      }
      const expectedEffectKey = this.effectKey(attempt.taskId);
      if (attempt.effectKey !== expectedEffectKey) {
        throw new ContractError('invariant_effect_key', `Attempt ${attemptId} has invalid effect key`);
      }
      const expectedFence = attemptFence({
        caseId: this.caseId,
        planDigest: this.plan.planDigest,
        taskId: attempt.taskId,
        attemptId: attempt.id,
        executorId: attempt.executorId,
        executorEpoch: attempt.executorEpoch,
        claimLeaseToken: attempt.claimLease?.token ?? null,
        claimLeaseGeneration: attempt.claimLease?.generation ?? null,
        claimLeaseClaimsDigest: attempt.claimLease?.claimsDigest ?? null,
      });
      if (attempt.fencingToken !== expectedFence) {
        throw new ContractError('invariant_fencing', `Attempt ${attemptId} has invalid fencing token`);
      }
      if (attempt.state === 'succeeded' && attempt.resultDigest !== taskState.acceptedResultDigest) {
        throw new ContractError('invariant_result', `Attempt ${attemptId} result digest does not match its Task`);
      }
      if (attempt.state === 'succeeded' &&
          (taskState.state !== 'succeeded' || attempt.resultDigest === null)) {
        throw new ContractError('invariant_result', `Succeeded Attempt ${attemptId} requires a succeeded Task and result digest`);
      }
      if (attempt.state !== 'succeeded' && attempt.resultDigest !== null) {
        throw new ContractError('invariant_result', `Non-succeeded Attempt ${attemptId} has a result digest`);
      }
      if (['dispatch_pending', 'queued', 'running', 'succeeded'].includes(attempt.state) && attempt.error !== null) {
        throw new ContractError('invariant_attempt_error', `Attempt ${attemptId} cannot retain an error while ${attempt.state}`);
      }
      if (['reconciling', 'cancel_requested', 'failed', 'cancelled', 'interrupted', 'rejected', 'unverified'].includes(attempt.state) && attempt.error === null) {
        throw new ContractError('invariant_attempt_error', `Attempt ${attemptId} requires an error while ${attempt.state}`);
      }
      if (attempt.reconciliation !== null) {
        if (task.execution.effectClass === 'result-only') {
          throw new ContractError('invariant_reconciliation', `Result-only Attempt ${attemptId} cannot retain reconciliation evidence`);
        }
        const expectedStateByOutcome = {
          succeeded: 'succeeded',
          not_applied: 'interrupted',
          failed: 'failed',
          cancelled: 'cancelled',
          unverified: 'unverified',
        };
        if (attempt.state !== expectedStateByOutcome[attempt.reconciliation.outcome]) {
          throw new ContractError('invariant_reconciliation', `Attempt ${attemptId} reconciliation outcome does not match its state`);
        }
      }
      if (task.execution.effectClass === 'result-only' && RECONCILIATION_RESULT_STATES.has(attempt.state)) {
        throw new ContractError('invariant_reconciliation', `Result-only Attempt ${attemptId} cannot be ${attempt.state}`);
      }
      if (!TERMINAL_ATTEMPT_STATES.has(attempt.state) && !NONTERMINAL_ATTEMPT_STATES.has(attempt.state)) {
        throw new ContractError('invariant_attempt_state', `Attempt ${attemptId} has unknown state`);
      }
    }

    const claimHolders = this.claimHoldingTaskIds();
    for (let leftIndex = 0; leftIndex < claimHolders.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < claimHolders.length; rightIndex += 1) {
        const left = claimHolders[leftIndex];
        const right = claimHolders[rightIndex];
        if (claimSetsConflict(this.plan.tasksById[left].claims, this.plan.tasksById[right].claims)) {
          throw new ContractError('invariant_claim_conflict', `Concurrent Tasks ${left} and ${right} have conflicting claims`);
        }
      }
    }

    const expectedCaseState = deriveCaseState(this.plan, this.taskStates);
    if (this.caseState !== expectedCaseState) {
      throw new ContractError('invariant_case_state', `Case state ${this.caseState} does not match derived state ${expectedCaseState}`);
    }

    const canonicalDigest = digest(this.canonicalTree);
    if (this.caseState === 'succeeded') {
      const promotionState = this.taskStates[this.plan.promotionTaskId];
      if (promotionState.state !== 'succeeded' || promotionState.acceptedResult.treeDigest !== canonicalDigest) {
        throw new ContractError('invariant_promotion', 'Succeeded Case requires canonical tree from succeeded Promotion');
      }
    } else if (canonicalDigest !== this.plan.baseDigest) {
      throw new ContractError('invariant_canonical_tree', 'Canonical tree changed before successful Promotion');
    }

    if (Object.keys(this.receipts).length > this.caseContract.limits.maxReceipts) {
      throw new ContractError('receipt_limit_exceeded', 'Case mutation receipt limit exceeded');
    }
    const committedRevisions = new Set();
    for (const [requestId, receipt] of Object.entries(this.receipts)) {
      assertIdentifier(requestId, `receipt key ${requestId}`);
      assertRecordShape(
        receipt,
        ['requestId', 'commandDigest', 'response', 'responseDigest', 'committedRevision'],
        [],
        `Mutation receipt ${requestId}`,
      );
      if (receipt.requestId !== requestId) {
        throw new ContractError('invariant_receipt', `Mutation receipt ${requestId} has a mismatched request ID`);
      }
      assertDigest(receipt.commandDigest, `Mutation receipt ${requestId}.commandDigest`);
      assertDigest(receipt.responseDigest, `Mutation receipt ${requestId}.responseDigest`);
      assertSafeInteger(receipt.committedRevision, `Mutation receipt ${requestId}.committedRevision`, { min: 1 });
      if (receipt.responseDigest !== digest(receipt.response) || receipt.committedRevision > this.caseRevision) {
        throw new ContractError('invariant_receipt', `Mutation receipt ${requestId} is invalid`);
      }
      if (committedRevisions.has(receipt.committedRevision)) {
        throw new ContractError('invariant_receipt', `Multiple mutation receipts claim revision ${receipt.committedRevision}`);
      }
      committedRevisions.add(receipt.committedRevision);
      const commitEvent = this.events[receipt.committedRevision - 1];
      if (!commitEvent || commitEvent.type !== 'command_committed') {
        throw new ContractError('invariant_receipt', `Mutation receipt ${requestId} has no matching commit Event`);
      }
      assertRecordShape(commitEvent.detail, ['requestId', 'commandDigest', 'responseDigest'], [], `command_committed Event ${receipt.committedRevision}`);
      if (commitEvent.detail.requestId !== requestId ||
          commitEvent.detail.commandDigest !== receipt.commandDigest ||
          commitEvent.detail.responseDigest !== receipt.responseDigest) {
        throw new ContractError('invariant_receipt', `Mutation receipt ${requestId} does not match its commit Event`);
      }
    }
  }
  _reopenNonterminalAttempts() {
    for (const attempt of Object.values(this.attempts)) {
      if (!NONTERMINAL_ATTEMPT_STATES.has(attempt.state)) continue;
      const task = this.plan.tasksById[attempt.taskId];
      const taskState = this.taskStates[attempt.taskId];
      const external = task.execution.effectClass !== 'result-only';
      if (external && attempt.state === 'cancel_requested') {
        taskState.state = 'reconciling';
        taskState.error = attempt.error;
        this._event('attempt_reconciling', {
          attemptId: attempt.id,
          taskId: attempt.taskId,
          reason: 'process_reopen_cancellation',
        });
        continue;
      }
      const requiresReconciliation = external && (
        task.execution.effectClass === 'reconcilable-external' ||
        attempt.state === 'reconciling' ||
        attempt.ordinal >= task.execution.retry.maxAttempts
      );
      if (requiresReconciliation) {
        if (attempt.state !== 'reconciling') {
          assertAttemptTransition(attempt.state, 'reconciling');
          attempt.state = 'reconciling';
        }
        attempt.error = normalizeError({
          code: 'process_reopen_uncertain',
          message: 'External effect may have been running when the snapshot was reopened',
          certainty: 'unknown',
        }, {}, this.caseContract.limits);
        taskState.state = 'reconciling';
        taskState.error = attempt.error;
        this._event('attempt_reconciling', {
          attemptId: attempt.id,
          taskId: attempt.taskId,
          reason: 'process_reopen',
        });
        continue;
      }
      assertAttemptTransition(attempt.state, 'interrupted');
      attempt.state = 'interrupted';
      attempt.error = normalizeError({
        code: 'process_reopen',
        message: 'Attempt was nonterminal when the snapshot was reopened',
        certainty: 'unknown',
        retryable: true,
      }, {}, this.caseContract.limits);
      if (attempt.ordinal < task.execution.retry.maxAttempts) {
        taskState.state = 'pending';
        taskState.error = null;
      } else {
        taskState.state = 'failed';
        taskState.error = normalizeError({
          code: 'attempt_limit_exhausted',
          message: 'Attempt limit exhausted during reopen',
        }, {}, this.caseContract.limits);
      }
      this._event('attempt_interrupted', { attemptId: attempt.id, taskId: attempt.taskId });
    }
  }
}


function migrateV1Snapshot(input) {
  if (!isPlainRecord(input) || !isPlainRecord(input.plan)) {
    throw new ContractError('invalid_snapshot', 'Legacy snapshot is invalid');
  }
  const requiredTopLevel = [
    'caseId', 'plan', 'caseState', 'caseRevision', 'eventSequence', 'events',
    'canonicalTree', 'canonicalDigest', 'taskStates', 'attempts',
  ];
  exactKeys(input, requiredTopLevel, 'legacy snapshot');
  assertIdentifier(input.caseId, 'legacy snapshot caseId');
  assertState(input.caseState, CASE_STATES, 'Legacy Case');
  assertSafeInteger(input.caseRevision, 'legacy caseRevision', { min: 1 });
  assertSafeInteger(input.eventSequence, 'legacy eventSequence', { min: 1 });
  if (!Array.isArray(input.events) || input.events.length !== input.eventSequence || input.caseRevision !== input.eventSequence) {
    throw new ContractError('legacy_event_sequence', 'Legacy snapshot revision and Event sequence are inconsistent');
  }
  for (let index = 0; index < input.events.length; index += 1) {
    const event = input.events[index];
    exactKeys(event, ['sequence', 'type', 'detail'], `legacy event ${index + 1}`);
    if (event.sequence !== index + 1) throw new ContractError('legacy_event_sequence', `Legacy Event ${index + 1} has invalid sequence`);
    assertIdentifier(event.type, `legacy event ${index + 1} type`);
    canonicalClone(event.detail);
  }
  if (input.plan.baseDigest !== digest(input.plan.baseTree)) {
    throw new ContractError('legacy_plan_digest', 'Legacy Plan base digest is invalid');
  }
  if (input.canonicalDigest !== digest(input.canonicalTree)) {
    throw new ContractError('legacy_canonical_digest', 'Legacy canonical tree digest is invalid');
  }

  const caseContract = normalizeCaseContract();
  const plan = definePlan({
    revisionId: input.plan.revisionId,
    baseTree: input.plan.baseTree,
    tasks: input.plan.taskOrder.map((taskId) => input.plan.tasksById[taskId]),
  }, { caseContract });
  if (input.plan.promotionTaskId !== plan.promotionTaskId ||
      input.plan.taskOrder.join('\0') !== plan.taskOrder.join('\0')) {
    throw new ContractError('legacy_plan_shape', 'Legacy Plan task identity is invalid');
  }
  const engine = new CaseEngine({ caseId: input.caseId, plan, caseContract });

  engine.events = [];
  engine.eventSequence = 0;
  engine.caseRevision = 0;
  for (const legacyEvent of input.events) engine._event(legacyEvent.type, legacyEvent.detail);

  engine.taskStates = createRecord();
  for (const taskId of plan.taskOrder) {
    const legacy = input.taskStates[taskId];
    if (!isPlainRecord(legacy)) throw new ContractError('legacy_task_state', `Legacy Task ${taskId} state is missing`);
    exactKeys(legacy, ['state', 'attemptIds', 'acceptedResult', 'acceptedResultDigest', 'error'], `legacy Task ${taskId}`);
    assertState(legacy.state, TASK_STATES, `Legacy Task ${taskId}`);
    if (!Array.isArray(legacy.attemptIds)) throw new ContractError('legacy_task_state', `Legacy Task ${taskId} attemptIds must be an array`);
    const task = plan.tasksById[taskId];
    let acceptedResult = null;
    let acceptedResultDigest = null;
    if (legacy.state === 'succeeded' && task.kind === 'work') {
      acceptedResult = normalizeTaskResult(task, legacy.acceptedResult, {
        baseDigest: plan.baseDigest,
        effectKey: engine.effectKey(taskId),
        pathPolicy: caseContract.pathPolicy,
        limits: caseContract.limits,
      });
      acceptedResultDigest = digest(acceptedResult);
    } else if (legacy.state !== 'succeeded' && (legacy.acceptedResult !== null || legacy.acceptedResultDigest !== null)) {
      throw new ContractError('legacy_task_result', `Non-succeeded Legacy Task ${taskId} has an accepted result`);
    }
    engine.taskStates[taskId] = {
      state: legacy.state,
      attemptIds: [...legacy.attemptIds],
      acceptedResult,
      acceptedResultDigest,
      error: legacy.error === null ? null : normalizeError(legacy.error, {}, caseContract.limits),
      blockedBy: [],
    };
  }
  if (Object.keys(input.taskStates).sort(compareText).join('\0') !== plan.taskOrder.join('\0')) {
    throw new ContractError('legacy_task_set', 'Legacy Task state set does not match the Plan');
  }

  engine.attempts = createRecord();
  for (const [attemptId, legacy] of Object.entries(input.attempts)) {
    if (!isPlainRecord(legacy)) throw new ContractError('legacy_attempt', `Legacy Attempt ${attemptId} must be a record`);
    exactKeys(legacy, ['id', 'taskId', 'ordinal', 'executorId', 'state', 'resultDigest', 'error'], `legacy Attempt ${attemptId}`);
    if (legacy.id !== attemptId || !plan.tasksById[legacy.taskId]) {
      throw new ContractError('legacy_attempt', `Legacy Attempt ${attemptId} identity is invalid`);
    }
    assertSafeInteger(legacy.ordinal, `Legacy Attempt ${attemptId} ordinal`, { min: 1 });
    assertState(legacy.state, ATTEMPT_STATES, `Legacy Attempt ${attemptId}`);
    const executor = normalizeExecutorIdentity(legacy.executorId);
    const effectKey = taskEffectKey(engine.caseId, plan.planDigest, legacy.taskId);
    const fencingToken = attemptFence({
      caseId: engine.caseId,
      planDigest: plan.planDigest,
      taskId: legacy.taskId,
      attemptId,
      executorId: executor.id,
      executorEpoch: executor.epoch,
      claimLeaseToken: null,
      claimLeaseGeneration: null,
      claimLeaseClaimsDigest: null,
    });
    const taskState = engine.taskStates[legacy.taskId];
    const resultDigest = legacy.state === 'succeeded' ? taskState.acceptedResultDigest : null;
    engine.attempts[attemptId] = {
      id: attemptId,
      taskId: legacy.taskId,
      ordinal: legacy.ordinal,
      executorId: executor.id,
      executorEpoch: executor.epoch,
      executorCapabilities: [],
      state: legacy.state,
      effectKey,
      fencingToken,
      claimLease: null,
      resultDigest,
      error: legacy.error === null ? null : normalizeError(legacy.error, {}, caseContract.limits),
      reconciliation: null,
    };
  }

  const promotionTaskId = plan.promotionTaskId;
  const promotionState = engine.taskStates[promotionTaskId];
  if (promotionState.state === 'succeeded') {
    const promotionResult = engine.createPromotionResult(promotionTaskId);
    promotionState.acceptedResult = promotionResult;
    promotionState.acceptedResultDigest = digest(promotionResult);
    for (const attemptId of promotionState.attemptIds) {
      if (engine.attempts[attemptId]?.state === 'succeeded') {
        engine.attempts[attemptId].resultDigest = promotionState.acceptedResultDigest;
      }
    }
  }

  engine.receipts = createRecord();
  engine.caseState = input.caseState;
  const legacyCanonical = validateTree(canonicalClone(input.canonicalTree), caseContract);
  if (engine.caseState === 'succeeded') {
    if (promotionState.state !== 'succeeded' || promotionState.acceptedResult.treeDigest !== digest(legacyCanonical)) {
      throw new ContractError('legacy_promotion_result', 'Legacy succeeded Case does not match deterministic Promotion');
    }
    engine.canonicalTree = validateTree(canonicalClone(promotionState.acceptedResult.tree), caseContract);
  } else {
    if (digest(legacyCanonical) !== plan.baseDigest) {
      throw new ContractError('legacy_canonical_mutation', 'Legacy non-succeeded Case changed the canonical tree');
    }
    engine.canonicalTree = legacyCanonical;
  }
  engine._event('snapshot_migrated', { fromSchemaVersion: 1, toSchemaVersion: 2 });
  engine._assertInvariants();
  return engine.snapshot();
}

function restoreV2Snapshot(snapshot, options) {
  exactKeys(snapshot, [
    'schemaVersion', 'caseId', 'caseState', 'caseRevision', 'eventSequence', 'plan', 'caseContract',
    'events', 'canonicalTree', 'canonicalDigest', 'taskStates', 'attempts', 'receipts', 'snapshotDigest',
  ], 'snapshot');
  if (snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    throw new ContractError('snapshot_version_unsupported', `Unsupported snapshot schema version: ${snapshot.schemaVersion}`);
  }
  assertIdentifier(snapshot.caseId, 'snapshot.caseId');
  assertDigest(snapshot.snapshotDigest, 'snapshot.snapshotDigest');
  const withoutDigest = canonicalClone(snapshot);
  delete withoutDigest.snapshotDigest;
  if (snapshot.snapshotDigest !== snapshotDigest(withoutDigest)) {
    throw new ContractError('snapshot_digest_mismatch', 'Snapshot digest is invalid');
  }

  assertRecordShape(
    snapshot.caseContract,
    ['caseGrant', 'workspacePolicy', 'pathPolicy', 'limits', 'contractDigest'],
    [],
    'snapshot.caseContract',
  );
  assertDigest(snapshot.caseContract.contractDigest, 'snapshot.caseContract.contractDigest');
  const caseContract = normalizeCaseContract({
    caseGrant: snapshot.caseContract.caseGrant,
    workspacePolicy: snapshot.caseContract.workspacePolicy,
    pathPolicy: snapshot.caseContract.pathPolicy,
    limits: snapshot.caseContract.limits,
  });
  if (caseContract.contractDigest !== snapshot.caseContract.contractDigest) {
    throw new ContractError('case_contract_digest_mismatch', 'Case contract digest is invalid');
  }
  if (canonicalJson(caseContract) !== canonicalJson(snapshot.caseContract)) {
    throw new ContractError('snapshot_case_contract', 'Snapshot Case contract is not the canonical derived contract');
  }

  assertRecordShape(snapshot.plan, [
    'revisionId', 'baseTree', 'baseDigest', 'taskOrder', 'tasksById', 'promotionTaskId',
    'reverseDependenciesById', 'planDigest',
  ], [], 'snapshot.plan');
  assertIdentifier(snapshot.plan.revisionId, 'snapshot.plan.revisionId');
  assertDigest(snapshot.plan.baseDigest, 'snapshot.plan.baseDigest');
  assertDigest(snapshot.plan.planDigest, 'snapshot.plan.planDigest');
  assertIdentifier(snapshot.plan.promotionTaskId, 'snapshot.plan.promotionTaskId');
  assertIdentifierArray(snapshot.plan.taskOrder, 'snapshot.plan.taskOrder', { sorted: true });
  if (!isPlainRecord(snapshot.plan.tasksById) || !isPlainRecord(snapshot.plan.reverseDependenciesById)) {
    throw new ContractError('invalid_snapshot', 'Snapshot Plan indexes must be records');
  }
  for (const taskId of snapshot.plan.taskOrder) {
    if (!Object.hasOwn(snapshot.plan.tasksById, taskId)) {
      throw new ContractError('snapshot_plan_shape', `Snapshot Plan is missing Task ${taskId}`);
    }
  }
  const plan = definePlan({
    revisionId: snapshot.plan.revisionId,
    baseTree: snapshot.plan.baseTree,
    tasks: snapshot.plan.taskOrder.map((taskId) => snapshot.plan.tasksById[taskId]),
  }, { caseContract });
  if (plan.planDigest !== snapshot.plan.planDigest || plan.baseDigest !== snapshot.plan.baseDigest) {
    throw new ContractError('snapshot_plan_digest', 'Snapshot Plan digest is invalid');
  }
  if (canonicalJson(plan) !== canonicalJson(snapshot.plan)) {
    throw new ContractError('snapshot_plan_shape', 'Snapshot Plan does not match its canonical derived representation');
  }

  const engine = new CaseEngine({ caseId: snapshot.caseId, plan, caseContract });
  assertState(snapshot.caseState, CASE_STATES, 'Case');
  assertSafeInteger(snapshot.caseRevision, 'caseRevision', { min: 1 });
  assertSafeInteger(snapshot.eventSequence, 'eventSequence', { min: 1 });
  if (!Array.isArray(snapshot.events)) throw new ContractError('invalid_snapshot', 'Snapshot events must be an array');
  if (!isPlainRecord(snapshot.taskStates) || !isPlainRecord(snapshot.attempts) || !isPlainRecord(snapshot.receipts)) {
    throw new ContractError('invalid_snapshot', 'Snapshot state collections must be records');
  }
  assertDigest(snapshot.canonicalDigest, 'snapshot.canonicalDigest');
  engine.caseState = snapshot.caseState;
  engine.caseRevision = snapshot.caseRevision;
  engine.eventSequence = snapshot.eventSequence;
  engine.events = canonicalClone(snapshot.events);
  engine.canonicalTree = validateTree(canonicalClone(snapshot.canonicalTree), caseContract);
  if (snapshot.canonicalDigest !== digest(engine.canonicalTree)) {
    throw new ContractError('snapshot_canonical_digest', 'Snapshot canonical tree digest is invalid');
  }
  engine.taskStates = canonicalClone(snapshot.taskStates);
  engine.attempts = canonicalClone(snapshot.attempts);
  engine.receipts = canonicalClone(snapshot.receipts);

  verifyRestoredResults(engine);
  engine._assertInvariants();

  if (options.reopen !== false && !TERMINAL_CASE_STATES.has(engine.caseState)) {
    engine._reopenNonterminalAttempts();
    engine.reconcile();
    engine._assertInvariants();
  }
  return engine;
}

function verifyRestoredResults(engine) {
  for (const taskId of engine.plan.taskOrder) {
    const task = engine.plan.tasksById[taskId];
    const taskState = engine.taskStates[taskId];
    if (!taskState || taskState.state !== 'succeeded') continue;
    if (task.kind === 'work') {
      const normalized = normalizeTaskResult(task, taskState.acceptedResult, {
        baseDigest: engine.plan.baseDigest,
        effectKey: engine.effectKey(taskId),
        pathPolicy: engine.caseContract.pathPolicy,
        limits: engine.caseContract.limits,
      });
      if (digest(normalized) !== taskState.acceptedResultDigest) {
        throw new ContractError('snapshot_result_digest', `Snapshot result for Task ${taskId} is invalid`);
      }
    } else {
      const expected = engine.createPromotionResult(taskId);
      if (digest(expected) !== taskState.acceptedResultDigest || digest(expected) !== digest(taskState.acceptedResult)) {
        throw new ContractError('snapshot_promotion_digest', 'Snapshot Promotion result is invalid');
      }
    }
  }
}
