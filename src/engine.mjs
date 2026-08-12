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
  normalizedClaimSetsConflict,
  normalizeClaims,
} from './claims.mjs';
import { authorityDecision, normalizeCaseContract } from './policy.mjs';
import { definePlan, isCompiledPlan, serializePlan } from './plan.mjs';
import { normalizeTaskResult } from './results.mjs';
import { promote, validateTree } from './promotion.mjs';
import {
  SEMANTIC_PROFILE,
  SemanticRadixTree,
  buildSemanticTree,
  hydrateSemanticTree,
  semanticPlanBinding,
  validateSemanticPlanBinding,
} from './semantic-authority.mjs';
import { promoteSemantic } from './semantic-promotion.mjs';
import {
  SEMANTIC_SNAPSHOT_SCHEMA_VERSION,
  createSemanticSnapshot,
  validateSemanticSnapshot,
} from './semantic-snapshot.mjs';
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

function buildTopologicalTaskOrder(plan) {
  const indegree = createRecord();
  for (const taskId of plan.taskOrder) indegree[taskId] = plan.tasksById[taskId].dependencies.length;
  const ready = plan.taskOrder.filter((taskId) => indegree[taskId] === 0);
  const order = [];
  while (ready.length > 0) {
    const taskId = ready.pop();
    order.push(taskId);
    for (const dependent of plan.reverseDependenciesById[taskId]) {
      indegree[dependent] -= 1;
      if (indegree[dependent] === 0) ready.push(dependent);
    }
  }
  if (order.length !== plan.taskOrder.length) {
    throw new ContractError('cycle', 'Task graph contains a cycle');
  }
  return deepFreeze(order);
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

const DEPENDENCY_BOUND_TASK_STATES = new Set([
  'running', 'reconciling', 'succeeded', 'failed', 'denied', 'unverified',
]);

function assertEventSuffix(engine) {
  if (engine._validatedEventSequence > engine._events.length) {
    throw new ContractError('invariant_event_frontier', 'Validated Event frontier exceeds Event count');
  }
  let previousDigest = engine._validatedEventSequence === 0
    ? null
    : engine._events[engine._validatedEventSequence - 1]?.eventDigest ?? null;
  for (let index = engine._validatedEventSequence; index < engine._events.length; index += 1) {
    const event = engine._events[index];
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
}

function assertTaskStateInvariant(engine, taskId) {
  const task = engine.plan.tasksById[taskId];
  const taskState = engine._taskStates[taskId];
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
  validateStoredError(taskState.error, `Task ${taskId}.error`, engine.caseContract.limits);
  if (taskState.acceptedResultDigest !== null) {
    assertDigest(taskState.acceptedResultDigest, `Task ${taskId}.acceptedResultDigest`);
  }

  const linkedAttempts = taskState.attemptIds.map((attemptId) => {
    const attempt = engine._attempts[attemptId];
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
    .filter((dependency) => engine._taskStates[dependency]?.state !== 'succeeded');
  if (DEPENDENCY_BOUND_TASK_STATES.has(taskState.state) && unsatisfiedDependencies.length > 0) {
    throw new ContractError('invariant_dependency', `Task ${taskId} entered ${taskState.state} before its dependencies succeeded`, {
      unsatisfiedDependencies,
    });
  }
  const terminalBlockers = task.dependencies
    .filter((dependency) => terminalDependencyReason(engine._taskStates[dependency]?.state) !== null)
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
  deepFreeze(taskState);
}

function assertAttemptInvariant(engine, attemptId) {
  const attempt = engine._attempts[attemptId];
  if (!attempt) throw new ContractError('invariant_attempt_missing', `Missing Attempt ${attemptId}`);
  assertRecordShape(attempt, [
    'id', 'taskId', 'ordinal', 'executorId', 'executorEpoch', 'executorCapabilities', 'state',
    'effectKey', 'fencingToken', 'claimLease', 'resultDigest', 'error', 'reconciliation',
  ], [], `Attempt ${attemptId}`);
  assertIdentifier(attemptId, `Attempt key ${attemptId}`);
  assertIdentifier(attempt.id, `Attempt ${attemptId}.id`);
  assertIdentifier(attempt.taskId, `Attempt ${attemptId}.taskId`);
  if (attempt.id !== attemptId) throw new ContractError('invariant_attempt_identity', `Attempt ${attemptId} has a mismatched ID`);
  if (!engine._taskStates[attempt.taskId]) throw new ContractError('invariant_attempt_task', `Attempt ${attemptId} references an unknown Task`);
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
  validateStoredError(attempt.error, `Attempt ${attemptId}.error`, engine.caseContract.limits);
  validateReconciliationRecord(attempt.reconciliation, `Attempt ${attemptId}.reconciliation`, engine.caseContract.limits);

  const taskState = engine._taskStates[attempt.taskId];
  const task = engine.plan.tasksById[attempt.taskId];
  if (!taskState.attemptIds.includes(attemptId)) {
    throw new ContractError('invariant_attempt_link', `Attempt ${attemptId} is not linked by its Task`);
  }
  const expectedOrdinal = taskState.attemptIds.indexOf(attemptId) + 1;
  if (attempt.ordinal !== expectedOrdinal || attempt.id !== `${attempt.taskId}.${expectedOrdinal}`) {
    throw new ContractError('invariant_attempt_ordinal', `Attempt ${attemptId} has invalid ordinal`);
  }
  if (attempt.claimLease !== null) {
    const normalizedLease = normalizeClaimLease(attempt.claimLease, {
      caseId: engine.caseId,
      taskId: attempt.taskId,
      attemptId,
    }, task, engine.caseContract.limits.maxClaimsPerTask);
    if (canonicalJson(normalizedLease) !== canonicalJson(attempt.claimLease)) {
      throw new ContractError('invariant_claim_lease', `Attempt ${attemptId} has a noncanonical claim lease`);
    }
  }
  const expectedEffectKey = engine.effectKey(attempt.taskId);
  if (attempt.effectKey !== expectedEffectKey) {
    throw new ContractError('invariant_effect_key', `Attempt ${attemptId} has invalid effect key`);
  }
  const expectedFence = attemptFence({
    caseId: engine.caseId,
    planDigest: engine.plan.planDigest,
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
  if (attempt.state === 'succeeded' && (taskState.state !== 'succeeded' || attempt.resultDigest === null)) {
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
  deepFreeze(attempt);
}

function readOnlyCollection(target, label) {
  return new Proxy(target, {
    set() {
      throw new TypeError(`${label} is read-only`);
    },
    deleteProperty() {
      throw new TypeError(`${label} is read-only`);
    },
    defineProperty() {
      throw new TypeError(`${label} is read-only`);
    },
    setPrototypeOf() {
      throw new TypeError(`${label} is read-only`);
    },
  });
}

const ABSENT_ENTRY = Symbol('absent entry');

function installCollections(engine, {
  events = [],
  taskStates = createRecord(),
  attempts = createRecord(),
  receipts = createRecord(),
} = {}) {
  engine._events = events;
  engine._taskStates = taskStates;
  engine._attempts = attempts;
  engine._receipts = receipts;
  engine._eventsView = readOnlyCollection(events, 'Case Events');
  engine._taskStatesView = readOnlyCollection(taskStates, 'Case Task states');
  engine._attemptsView = readOnlyCollection(attempts, 'Case Attempts');
  engine._receiptsView = readOnlyCollection(receipts, 'Case receipts');
}

export class CaseEngine {
  get events() { return this._eventsView; }
  get taskStates() { return this._taskStatesView; }
  get attempts() { return this._attemptsView; }
  get receipts() { return this._receiptsView; }
  get canonicalTree() {
    if (this._semanticMode === true) {
      if (this._canonicalTreeCache === null) {
        this._canonicalTreeCache = validateTree(this._semanticCanonicalTree.materialize(), this.caseContract);
      }
      return this._canonicalTreeCache;
    }
    return this._canonicalTreeCache;
  }
  set canonicalTree(value) { this._canonicalTreeCache = value; }
  get semanticAuthority() {
    return this._semanticMode === true ? deepFreeze(canonicalClone(this._semanticAuthority)) : null;
  }
  get semanticRootDigest() { return this._semanticMode === true ? this._semanticCanonicalTree.rootDescriptor.rootDigest : null; }
  get isSemanticV3() { return this._semanticMode === true; }

  constructor({ caseId, plan, caseContract = {}, semanticAuthority = null }) {
    assertIdentifier(caseId, 'caseId');
    this.caseId = caseId;
    this._eventReservation = null;
    this._mutationFrame = null;
    this._committedEventObservers = new Set();
    this._validatedEventSequence = 0;
    this._canonicalDigest = null;
    this._canonicalTreeCache = null;
    this._semanticMode = false;
    this._semanticBaseTree = null;
    this._semanticCanonicalTree = null;
    this._semanticPlanBinding = null;
    this._semanticAuthority = null;
    this._claimHoldingTaskIdSet = new Set();
    this.caseContract = normalizeCaseContract(caseContract.contractDigest ? {
      caseGrant: caseContract.caseGrant,
      workspacePolicy: caseContract.workspacePolicy,
      pathPolicy: caseContract.pathPolicy,
      limits: caseContract.limits,
    } : caseContract);
    const sourcePlan = isCompiledPlan(plan) ? serializePlan(plan) : plan;
    this.plan = definePlan(sourcePlan, { caseContract: this.caseContract });
    this._topologicalTaskOrder = buildTopologicalTaskOrder(this.plan);
    this.caseState = 'active';
    this.caseRevision = 0;
    this.eventSequence = 0;
    installCollections(this);
    if (semanticAuthority === null) {
      this.canonicalTree = validateTree(canonicalClone(this.plan.baseTree), this.caseContract);
      this._canonicalDigest = this.plan.baseDigest;
    } else {
      assertRecordShape(semanticAuthority, ['profile'], ['authorityEpoch', 'migrationSource', 'baseTree'], 'semanticAuthority');
      if (semanticAuthority.profile !== SEMANTIC_PROFILE) {
        throw new ContractError('unsupported_semantic_profile', `Unsupported semantic profile ${semanticAuthority.profile}`);
      }
      const authorityEpoch = semanticAuthority.authorityEpoch ?? 1;
      assertSafeInteger(authorityEpoch, 'semanticAuthority.authorityEpoch', { min: 1 });
      const baseSemantic = semanticAuthority.baseTree instanceof SemanticRadixTree
        ? semanticAuthority.baseTree
        : buildSemanticTree(this.plan.baseTree, this.caseContract);
      const materializedBase = baseSemantic.materialize();
      if (digest(materializedBase) !== this.plan.baseDigest) {
        throw new ContractError('semantic_plan_base_mismatch', 'Semantic base root does not match the Plan baseDigest');
      }
      this._semanticMode = true;
      this._semanticBaseTree = baseSemantic;
      this._semanticCanonicalTree = baseSemantic;
      this._semanticPlanBinding = semanticPlanBinding(this.plan, baseSemantic.rootDescriptor);
      this._semanticAuthority = deepFreeze({
        profile: SEMANTIC_PROFILE,
        authorityEpoch,
        migrationSource: semanticAuthority.migrationSource ?? null,
        baseRoot: baseSemantic.rootDescriptor,
        canonicalRoot: baseSemantic.rootDescriptor,
      });
      this._canonicalTreeCache = null;
      this._canonicalDigest = baseSemantic.rootDescriptor.rootDigest;
    }
    for (const taskId of this.plan.taskOrder) {
      this._taskStates[taskId] = {
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
    this._rebuildPerformanceIndexes();
  }

  static restore(inputSnapshot, options = {}) {
    if (!isPlainRecord(inputSnapshot)) throw new ContractError('invalid_snapshot', 'Snapshot must be a record');
    assertRecordShape(options, [], ['reopen', 'semanticResolver'], 'restore options');
    if (Object.hasOwn(options, 'reopen') && typeof options.reopen !== 'boolean') {
      throw new ContractError('invalid_restore_option', 'restore.reopen must be boolean');
    }
    if (Object.hasOwn(options, 'semanticResolver') && options.semanticResolver !== null && typeof options.semanticResolver !== 'function') {
      throw new ContractError('invalid_restore_option', 'restore.semanticResolver must be a function or null');
    }
    const snapshot = Object.hasOwn(inputSnapshot, 'schemaVersion')
      ? canonicalClone(inputSnapshot)
      : migrateV1Snapshot(inputSnapshot);
    if (snapshot.schemaVersion === SEMANTIC_SNAPSHOT_SCHEMA_VERSION) return restoreV3Snapshot(snapshot, options);
    return restoreV2Snapshot(snapshot, options);
  }

  nextAttemptId(taskId) {
    const taskState = this._taskStates[taskId];
    if (!taskState) throw new ContractError('unknown_task', `Unknown Task: ${taskId}`);
    return nextAttemptId(taskId, taskState);
  }

  effectKey(taskId) {
    if (!this.plan.tasksById[taskId]) throw new ContractError('unknown_task', `Unknown Task: ${taskId}`);
    return taskEffectKey(this.caseId, this.plan.planDigest, taskId);
  }

  snapshot() {
    this.#assertCommittedInvariants();
    if (this._semanticMode === true) {
      return publicJsonClone(createSemanticSnapshot({
        schemaVersion: SEMANTIC_SNAPSHOT_SCHEMA_VERSION,
        caseId: this.caseId,
        caseState: this.caseState,
        caseRevision: this.caseRevision,
        eventSequence: this.eventSequence,
        plan: this._semanticPlanBinding,
        caseContract: this.caseContract,
        events: this._events,
        semanticAuthority: this._semanticAuthority,
        taskStates: this._taskStates,
        attempts: this._attempts,
        receipts: this._receipts,
      }));
    }
    const base = this.#snapshotWithoutDigest();
    return publicJsonClone({ ...base, snapshotDigest: snapshotDigest(base) });
  }

  semanticObjectRecords() {
    if (this._semanticMode !== true) return [];
    const records = new Map();
    for (const record of [...this._semanticBaseTree.objectRecords(), ...this._semanticCanonicalTree.objectRecords()]) {
      records.set(record.digest, record);
    }
    return [...records.values()].sort((left, right) => compareText(left.digest, right.digest)).map((record) => canonicalClone(record));
  }

  markSemanticObjectsPersisted() {
    if (this._semanticMode !== true) return;
    const sameRoot = this._semanticBaseTree.rootDescriptor.rootDigest === this._semanticCanonicalTree.rootDescriptor.rootDigest;
    this._semanticBaseTree = this._semanticBaseTree.withoutPendingRecords();
    this._semanticCanonicalTree = sameRoot
      ? this._semanticBaseTree
      : this._semanticCanonicalTree.withoutPendingRecords();
  }

  #snapshotWithoutDigest() {
    return {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      caseId: this.caseId,
      caseState: this.caseState,
      caseRevision: this.caseRevision,
      eventSequence: this.eventSequence,
      plan: this.plan,
      caseContract: this.caseContract,
      events: this._events,
      canonicalTree: this.canonicalTree,
      canonicalDigest: this._canonicalDigest,
      taskStates: this._taskStates,
      attempts: this._attempts,
      receipts: this._receipts,
    };
  }

  readyTaskIds() {
    if (this.caseState !== 'active') return [];
    return [...this._readyTaskIdSet].sort(compareText);
  }

  isTaskReady(taskId) {
    if (!this.plan.tasksById[taskId]) return false;
    return this.caseState === 'active' && this._taskStates[taskId].state === 'pending' &&
      this._unsatisfiedDependencyCounts[taskId] === 0;
  }

  runningTaskIds() {
    return this.plan.taskOrder.filter((taskId) => this._taskStates[taskId].state === 'running');
  }

  #scanClaimHoldingTaskIds() {
    return this.plan.taskOrder.filter((taskId) => {
      const state = this._taskStates[taskId].state;
      return state === 'running' || state === 'reconciling';
    });
  }

  claimHoldingTaskIds() {
    if (this._mutationFrame === null) return [...this._claimHoldingTaskIdSet].sort(compareText);
    const live = new Set(this._claimHoldingTaskIdSet);
    for (const taskId of this._mutationFrame.taskIds) {
      const state = this._taskStates[taskId]?.state;
      if (state === 'running' || state === 'reconciling') live.add(taskId);
      else live.delete(taskId);
    }
    return [...live].sort(compareText);
  }

  _rebuildPerformanceIndexes() {
    this._claimHoldingTaskIdSet = new Set(this.#scanClaimHoldingTaskIds());
    this._taskStateCounts = createRecord(TASK_STATES.map((state) => [state, 0]));
    this._unsatisfiedDependencyCounts = createRecord();
    this._readyTaskIdSet = new Set();
    for (const taskId of this.plan.taskOrder) {
      this._taskStateCounts[this._taskStates[taskId].state] += 1;
      const unsatisfied = this.plan.tasksById[taskId].dependencies.reduce(
        (count, dependency) => count + (this._taskStates[dependency].state === 'succeeded' ? 0 : 1),
        0,
      );
      this._unsatisfiedDependencyCounts[taskId] = unsatisfied;
      if (this._taskStates[taskId].state === 'pending' && unsatisfied === 0) this._readyTaskIdSet.add(taskId);
    }
  }

  #dependencyCountDeltas(frame) {
    if (frame.dependencyCountDeltas) return frame.dependencyCountDeltas;
    const deltas = new Map();
    for (const [taskId, before] of frame.taskBefore) {
      const after = this._taskStates[taskId];
      const wasSucceeded = before.state === 'succeeded';
      const isSucceeded = after.state === 'succeeded';
      if (wasSucceeded === isSucceeded) continue;
      const delta = isSucceeded ? -1 : 1;
      for (const dependent of this.plan.reverseDependenciesById[taskId] ?? []) {
        deltas.set(dependent, (deltas.get(dependent) ?? 0) + delta);
      }
    }
    frame.dependencyCountDeltas = deltas;
    return deltas;
  }

  #isTaskReady(taskId, frame = null) {
    const taskState = this._taskStates[taskId];
    const unsatisfied = (this._unsatisfiedDependencyCounts[taskId] ?? 0) +
      (frame === null ? 0 : (this.#dependencyCountDeltas(frame).get(taskId) ?? 0));
    return taskState?.state === 'pending' && unsatisfied === 0;
  }

  #effectiveTaskStateCounts(frame) {
    const counts = createRecord(TASK_STATES.map((state) => [state, this._taskStateCounts[state] ?? 0]));
    for (const [taskId, before] of frame.taskBefore) {
      const after = this._taskStates[taskId];
      if (before.state === after.state) continue;
      counts[before.state] -= 1;
      counts[after.state] += 1;
    }
    return counts;
  }

  #affectedReadyTaskIds(frame) {
    const affected = new Set(frame.taskIds);
    for (const taskId of frame.taskIds) {
      for (const dependent of this.plan.reverseDependenciesById[taskId] ?? []) affected.add(dependent);
    }
    return affected;
  }

  #effectiveReadyCount(frame) {
    let count = this._readyTaskIdSet.size;
    const affected = this.#affectedReadyTaskIds(frame);
    for (const taskId of affected) {
      const before = this._readyTaskIdSet.has(taskId);
      const after = this.#isTaskReady(taskId, frame);
      if (before !== after) count += after ? 1 : -1;
    }
    return count;
  }

  #deriveCaseStateFromFrame(frame) {
    const counts = this.#effectiveTaskStateCounts(frame);
    const readyCount = this.#effectiveReadyCount(frame);
    let candidateState;
    if (counts.reconciling > 0) candidateState = 'reconciling';
    else if (counts.running > 0 || readyCount > 0) candidateState = 'active';
    else if (counts.unverified > 0) candidateState = 'unverified';
    else if (counts.failed > 0 || counts.denied > 0) candidateState = 'failed';
    else if (counts.cancelled > 0) candidateState = 'cancelled';
    else if (counts.blocked > 0) candidateState = 'failed';
    else if (this._taskStates[this.plan.promotionTaskId].state === 'succeeded') candidateState = 'succeeded';
    else if (counts.pending > 0) candidateState = 'failed';
    else throw new ContractError('invariant_case_state', 'Task states do not derive a valid Case state');

    // Acceleration state may keep a Case conservatively active, but it may never
    // author a terminal/reconciliation outcome. Terminal candidates are checked
    // against the authoritative Task records before becoming semantic state.
    const state = candidateState === 'active'
      ? candidateState
      : deriveCaseState(this.plan, this._taskStates);
    return { state, counts, readyCount };
  }

  #refreshPerformanceIndexes(frame) {
    const nextClaimHolders = new Set(this._claimHoldingTaskIdSet);
    for (const taskId of frame.taskIds) {
      const state = this._taskStates[taskId]?.state;
      if (state === 'running' || state === 'reconciling') nextClaimHolders.add(taskId);
      else nextClaimHolders.delete(taskId);
    }
    this._claimHoldingTaskIdSet = nextClaimHolders;
    this._taskStateCounts = frame.derivedCounts ?? this.#effectiveTaskStateCounts(frame);
    for (const [taskId, delta] of this.#dependencyCountDeltas(frame)) {
      this._unsatisfiedDependencyCounts[taskId] += delta;
    }
    for (const taskId of this.#affectedReadyTaskIds(frame)) {
      if (this.#isTaskReady(taskId)) this._readyTaskIdSet.add(taskId);
      else this._readyTaskIdSet.delete(taskId);
    }
  }

  admissionDecision(taskId, executorCapabilities = []) {
    const task = this.plan.tasksById[taskId];
    const taskState = this._taskStates[taskId];
    if (!task || !taskState) return deepFreeze({ admissible: false, reason: 'unknown_task' });
    if (this.caseState !== 'active') return deepFreeze({ admissible: false, reason: `case_${this.caseState}` });
    if (taskState.state !== 'pending') return deepFreeze({ admissible: false, reason: `task_${taskState.state}` });
    const unsatisfied = task.dependencies.filter((dependency) => this._taskStates[dependency].state !== 'succeeded');
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
      normalizedClaimSetsConflict(task.claims, this.plan.tasksById[runningTaskId].claims));
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
    const taskState = this.#mutableTaskState(taskId);
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
    this.#setAttempt(attemptId, attempt);
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
    const attempt = this.#mutableAttempt(attemptId);
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
    const taskState = this.#mutableTaskState(attempt.taskId);
    taskState.state = 'reconciling';
    taskState.error = attempt.error;
    this._event('attempt_reconciling', { attemptId, taskId: attempt.taskId, reason });
    this.reconcile();
    this._assertInvariants();
    return deepFreeze(canonicalClone(attempt));
  }

  #transitionAttemptExecution(attemptId, target, eventType) {
    const attempt = this.#mutableAttempt(attemptId);
    if (attempt.state === target) return deepFreeze(canonicalClone(attempt));
    assertAttemptTransition(attempt.state, target);
    attempt.state = target;
    this.#mutableTaskState(attempt.taskId).state = target === 'reconciling' ? 'reconciling' : 'running';
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

  #promotionInputs(task) {
    return task.dependencies.map((dependency) => {
      const dependencyTask = this.plan.tasksById[dependency];
      const taskState = this._taskStates[dependency];
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
  }

  #semanticPromotionCandidate(task) {
    return promoteSemantic(
      this._semanticBaseTree,
      this.#promotionInputs(task),
      this.plan.baseDigest,
      this.caseContract,
    );
  }

  createPromotionResult(taskId = this.plan.promotionTaskId) {
    const task = this.plan.tasksById[taskId];
    if (!task || task.kind !== 'promotion') {
      throw new ContractError('not_promotion', `Task ${taskId} is not the Promotion Task`);
    }
    if (this._semanticMode === true) return this.#semanticPromotionCandidate(task).result;
    return promote(this.plan.baseTree, this.#promotionInputs(task), this.plan.baseDigest, this.caseContract);
  }

  acceptResult(envelope, options = {}) {
    if (this._eventReservation === null) {
      return this.#withEventReservation(2, () => this.acceptResult(envelope, options));
    }
    assertRecordShape(options, [], ['claimValidator'], 'acceptResult options');
    assertClaimValidator(options.claimValidator);
    if (!isPlainRecord(envelope)) throw new ContractError('invalid_result_envelope', 'Result envelope must be a record');
    const attempt = this.#mutableAttempt(envelope.attemptId);
    const task = this.plan.tasksById[attempt.taskId];
    this.#assertResultEnvelopeIdentity(envelope, attempt);

    let acceptedResult;
    let promotedTree = null;
    let promotedSemanticTree = null;
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
      if (this._semanticMode === true) {
        const candidate = this.#semanticPromotionCandidate(task);
        if (digest(candidate.result) !== digest(envelope.result)) {
          throw new ContractError('promotion_result_mismatch', 'Promotion result does not match deterministic semantic recomputation');
        }
        acceptedResult = canonicalClone(envelope.result);
        promotedSemanticTree = candidate.semanticTree;
      } else {
        const expected = this.createPromotionResult(task.id);
        if (digest(expected) !== digest(envelope.result)) {
          throw new ContractError('promotion_result_mismatch', 'Promotion result does not match deterministic recomputation');
        }
        acceptedResult = canonicalClone(envelope.result);
        promotedTree = validateTree(canonicalClone(acceptedResult.tree), this.caseContract);
      }
    }
    const acceptedDigest = digest(acceptedResult);

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
    const taskState = this.#mutableTaskState(attempt.taskId);
    taskState.state = 'succeeded';
    taskState.acceptedResult = acceptedResult;
    taskState.acceptedResultDigest = acceptedDigest;
    taskState.error = null;
    taskState.blockedBy = [];
    if (task.kind === 'promotion') {
      if (this._semanticMode === true) {
        this._semanticCanonicalTree = promotedSemanticTree;
        this._semanticAuthority = deepFreeze({
          ...this._semanticAuthority,
          canonicalRoot: promotedSemanticTree.rootDescriptor,
        });
        this._canonicalTreeCache = null;
        this._canonicalDigest = promotedSemanticTree.rootDescriptor.rootDigest;
      } else {
        this.canonicalTree = promotedTree;
        this._canonicalDigest = acceptedResult.treeDigest;
      }
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
      const taskId = this._attempts[attemptId]?.taskId;
      return this.#withEventReservation(3 + this.#descendantCount(taskId), () =>
        this.recordExecutorFailure(attemptId, error));
    }
    const attempt = this.#mutableAttempt(attemptId);
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
      const taskState = this.#mutableTaskState(attempt.taskId);
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
      const taskId = this._attempts[attemptId]?.taskId;
      return this.#withEventReservation(3 + this.#descendantCount(taskId), () =>
        this.failAttempt(attemptId, error, options));
    }
    assertRecordShape(options, [], ['retryable'], 'failAttempt options');
    if (Object.hasOwn(options, 'retryable') && typeof options.retryable !== 'boolean') {
      throw new ContractError('invalid_failure_option', 'failAttempt.retryable must be boolean');
    }
    const attempt = this.#mutableAttempt(attemptId);
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
    const taskState = this.#mutableTaskState(attempt.taskId);
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
    const taskState = this.#mutableTaskState(taskId);
    if (!taskState) throw new ContractError('unknown_task', `Unknown Task: ${taskId}`);
    if (taskState.state !== 'pending') return false;
    const unsatisfied = this.plan.tasksById[taskId].dependencies
      .filter((dependency) => this._taskStates[dependency].state !== 'succeeded');
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
    const taskState = this.#mutableTaskState(taskId);
    if (!taskState) throw new ContractError('unknown_task', `Unknown Task: ${taskId}`);
    if (TERMINAL_TASK_STATES.has(taskState.state)) return false;
    const task = this.plan.tasksById[taskId];
    const activeAttempt = activeAttemptFor(taskState, this._attempts);
    const attempt = activeAttempt ? this.#mutableAttempt(activeAttempt.id) : null;
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
      const taskId = this._attempts[attemptId]?.taskId;
      return this.#withEventReservation(3 + this.#descendantCount(taskId), () =>
        this.resolveReconciliation(attemptId, decision, options));
    }
    assertRecordShape(options, [], ['claimValidator'], 'resolveReconciliation options');
    const attempt = this.#mutableAttempt(attemptId);
    if (!RECONCILIATION_RESULT_STATES.has(attempt.state)) {
      throw new ContractError('not_reconciling', `Attempt ${attemptId} is ${attempt.state}, not reconciling`);
    }
    validateReconciliationDecision(decision);
    const evidence = decision.evidence === undefined ? null : canonicalClone(decision.evidence);
    if (canonicalSize(evidence) > this.caseContract.limits.maxEvidenceBytes) {
      throw new ContractError('evidence_limit_exceeded', 'Reconciliation evidence exceeds the configured limit');
    }
    const reconciliation = deepFreeze({ outcome: decision.outcome, evidence });
    const taskState = this.#mutableTaskState(attempt.taskId);
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

    // A top-level reconcile is the deterministic repair boundary for all
    // disposable scheduler/index state. Nested reconciles retain O(changed-edge)
    // maintenance and avoid a global traversal on every transition.
    if (this._mutationFrame.taskIds.size === 0) this._rebuildPerformanceIndexes();

    const affectedTaskIds = new Set();
    if (this._mutationFrame.taskIds.size === 0) {
      for (const taskId of this.plan.taskOrder) affectedTaskIds.add(taskId);
    } else {
      for (const changedTaskId of [...this._mutationFrame.taskIds].sort(compareText)) {
        const before = this._mutationFrame.taskBefore.get(changedTaskId);
        const after = this._taskStates[changedTaskId];
        if (after.state === 'pending' || after.state === 'blocked') affectedTaskIds.add(changedTaskId);
        if (terminalDependencyReason(after.state) !== null &&
            terminalDependencyReason(before?.state) === null) {
          const pending = [...(this.plan.reverseDependenciesById[changedTaskId] ?? [])];
          while (pending.length > 0) {
            const dependent = pending.pop();
            if (affectedTaskIds.has(dependent)) continue;
            affectedTaskIds.add(dependent);
            pending.push(...(this.plan.reverseDependenciesById[dependent] ?? []));
          }
        }
      }
    }

    // Plan order is topological. Processing the affected closure once in that
    // order lets every join observe all upstream terminal blockers at once,
    // avoiding duplicate blocker-update Events and preserving reservation bounds.
    for (const taskId of this._topologicalTaskOrder) {
      if (!affectedTaskIds.has(taskId)) continue;
      const currentTaskState = this._taskStates[taskId];
      if (currentTaskState.state !== 'pending' && currentTaskState.state !== 'blocked') continue;
      const blockers = this.plan.tasksById[taskId].dependencies
        .filter((dependency) => terminalDependencyReason(this._taskStates[dependency].state) !== null)
        .sort(compareText);
      if (currentTaskState.state === 'pending' && blockers.length > 0) {
        const taskState = this.#mutableTaskState(taskId);
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
      } else if (currentTaskState.state === 'blocked' && currentTaskState.blockedBy.join('\0') !== blockers.join('\0')) {
        const taskState = this.#mutableTaskState(taskId);
        const blockerError = normalizeError({
          code: 'dependency_blocked',
          message: `Task is blocked by terminal dependencies: ${blockers.join(', ')}`,
          certainty: 'not_applied',
          retryable: false,
        }, {}, this.caseContract.limits);
        taskState.blockedBy = blockers;
        taskState.error = blockerError;
        this._event('task_blockers_updated', { taskId, blockedBy: blockers });
      }
    }

    const derived = this.#deriveCaseStateFromFrame(this._mutationFrame);
    const reasonByState = {
      reconciling: 'attempt_reconciling',
      active: 'work_available',
      unverified: 'task_unverified',
      failed: derived.counts.failed > 0 || derived.counts.denied > 0
        ? 'task_failed_or_denied'
        : 'blocked_graph',
      cancelled: 'task_cancelled',
      succeeded: 'promotion_succeeded',
    };
    this.#setCaseState(derived.state, reasonByState[derived.state]);
    return this.caseState;
  }

  readyTaskIdsIgnoringCase() {
    if (this._mutationFrame === null) return [...this._readyTaskIdSet].sort(compareText);
    return this.plan.taskOrder.filter((taskId) => this.#isTaskReady(taskId, this._mutationFrame));
  }

  observeCommittedEvents(observer) {
    if (typeof observer !== 'function') {
      throw new ContractError('invalid_event_observer', 'Committed Event observer must be a function');
    }
    this._committedEventObservers.add(observer);
    let active = true;
    return () => {
      if (!active) return false;
      active = false;
      return this._committedEventObservers.delete(observer);
    };
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
    const existing = this._receipts[requestId];
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
    if (Object.keys(this._receipts).length >= this.caseContract.limits.maxReceipts) {
      throw new ContractError('receipt_limit_exceeded', 'Case mutation receipt limit exceeded');
    }

    const response = this.#dispatchCommand(normalizedCommand, options);
    const canonicalResponse = canonicalClone(response);
    const responseDigest = digest(canonicalResponse);
    this._event('command_committed', { requestId, commandDigest, responseDigest });
    this.#setReceipt(requestId, {
      requestId,
      commandDigest,
      response: canonicalResponse,
      responseDigest,
      committedRevision: this.caseRevision,
    });
    this._assertInvariants();
    return deepFreeze({ deduplicated: false, response: canonicalClone(canonicalResponse) });
  }

  #mutableTaskState(taskId) {
    const state = this._taskStates[taskId];
    if (!state) throw new ContractError('unknown_task', `Unknown Task: ${taskId}`);
    if (this._mutationFrame === null || !Object.isFrozen(state)) return state;
    if (!this._mutationFrame.taskBefore.has(taskId)) {
      this._mutationFrame.taskBefore.set(taskId, state);
    }
    const copy = {
      ...state,
      attemptIds: [...state.attemptIds],
      blockedBy: [...state.blockedBy],
    };
    this._taskStates[taskId] = copy;
    this._mutationFrame.taskIds.add(taskId);
    return copy;
  }

  #mutableAttempt(attemptId) {
    const attempt = this._attempts[attemptId];
    if (!attempt) throw new ContractError('unknown_attempt', `Unknown Attempt: ${attemptId}`);
    if (this._mutationFrame === null || !Object.isFrozen(attempt)) return attempt;
    if (!this._mutationFrame.attemptBefore.has(attemptId)) {
      this._mutationFrame.attemptBefore.set(attemptId, attempt);
    }
    const copy = { ...attempt };
    this._attempts[attemptId] = copy;
    this._mutationFrame.attemptIds.add(attemptId);
    return copy;
  }

  #setAttempt(attemptId, attempt) {
    if (this._mutationFrame !== null && !this._mutationFrame.attemptBefore.has(attemptId)) {
      this._mutationFrame.attemptBefore.set(
        attemptId,
        Object.hasOwn(this._attempts, attemptId) ? this._attempts[attemptId] : ABSENT_ENTRY,
      );
      this._mutationFrame.attemptIds.add(attemptId);
    }
    this._attempts[attemptId] = attempt;
  }

  #setReceipt(requestId, receipt) {
    if (this._mutationFrame !== null && !this._mutationFrame.receiptBefore.has(requestId)) {
      this._mutationFrame.receiptBefore.set(
        requestId,
        Object.hasOwn(this._receipts, requestId) ? this._receipts[requestId] : ABSENT_ENTRY,
      );
      this._mutationFrame.receiptIds.add(requestId);
    }
    this._receipts[requestId] = receipt;
  }

  #withEventReservation(count, operation) {
    assertSafeInteger(count, 'event reservation', { min: 0 });
    const before = {
      caseState: this.caseState,
      caseRevision: this.caseRevision,
      eventSequence: this.eventSequence,
      eventLength: this._events.length,
      canonicalTreeCache: this._canonicalTreeCache,
      canonicalDigest: this._canonicalDigest,
      semanticCanonicalTree: this._semanticCanonicalTree,
      semanticAuthority: this._semanticAuthority,
      validatedEventSequence: this._validatedEventSequence,
    };
    const frame = {
      taskIds: new Set(),
      attemptIds: new Set(),
      receiptIds: new Set(),
      taskBefore: new Map(),
      attemptBefore: new Map(),
      receiptBefore: new Map(),
    };
    this._eventReservation = count;
    this._mutationFrame = frame;
    try {
      const result = operation();
      this._mutationFrame = null;
      this.#assertIncrementalInvariants(frame);
      this.#refreshPerformanceIndexes(frame);
      this.#publishCommittedEvents(this._events.slice(before.eventLength));
      return result;
    } catch (error) {
      this.caseState = before.caseState;
      this.caseRevision = before.caseRevision;
      this.eventSequence = before.eventSequence;
      this._events.length = before.eventLength;
      this._canonicalTreeCache = before.canonicalTreeCache;
      this._canonicalDigest = before.canonicalDigest;
      this._semanticCanonicalTree = before.semanticCanonicalTree;
      this._semanticAuthority = before.semanticAuthority;
      for (const [taskId, value] of frame.taskBefore) this._taskStates[taskId] = value;
      for (const [attemptId, value] of frame.attemptBefore) {
        if (value === ABSENT_ENTRY) delete this._attempts[attemptId];
        else this._attempts[attemptId] = value;
      }
      for (const [requestId, value] of frame.receiptBefore) {
        if (value === ABSENT_ENTRY) delete this._receipts[requestId];
        else this._receipts[requestId] = value;
      }
      this._validatedEventSequence = before.validatedEventSequence;
      throw error;
    } finally {
      this._mutationFrame = null;
      this._eventReservation = null;
    }
  }

  #publishCommittedEvents(events) {
    if (events.length === 0 || this._committedEventObservers.size === 0) return;
    const observers = [...this._committedEventObservers];
    for (const event of events) {
      for (const observer of observers) {
        queueMicrotask(() => {
          try {
            const result = observer(event);
            if (result && typeof result.then === 'function') {
              Promise.resolve(result).catch(() => {});
            }
          } catch {
            // Observers are transient liveness hints only and cannot affect committed semantics.
          }
        });
      }
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
    if (this._events.length >= this.caseContract.limits.maxEvents) {
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
    const previousDigest = this._events.length === 0 ? null : this._events[this._events.length - 1].eventDigest;
    const base = { sequence, caseRevision, type, detail: normalizedDetail, previousDigest };
    const event = deepFreeze({ ...base, eventDigest: eventDigest(base) });
    this._events.push(event);
    this.eventSequence = sequence;
    this.caseRevision = caseRevision;
  }

  #requireAttempt(attemptId) {
    const attempt = this._attempts[attemptId];
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

  #canonicalAuthorityDigest() {
    if (this._semanticMode === true) {
      if (!(this._semanticBaseTree instanceof SemanticRadixTree) || !(this._semanticCanonicalTree instanceof SemanticRadixTree)) {
        throw new ContractError('invariant_semantic_authority', 'Semantic authority requires radix base and canonical roots');
      }
      const binding = validateSemanticPlanBinding(this._semanticPlanBinding);
      if (binding.baseDigest !== this.plan.baseDigest || binding.planDigest !== this.plan.planDigest) {
        throw new ContractError('invariant_semantic_plan', 'Semantic Plan binding does not match the compiled Plan identity');
      }
      const baseRoot = this._semanticBaseTree.rootDescriptor;
      const canonicalRoot = this._semanticCanonicalTree.rootDescriptor;
      if (canonicalJson(binding.baseRoot) !== canonicalJson(baseRoot)) {
        throw new ContractError('invariant_semantic_plan', 'Semantic Plan binding base root is inconsistent');
      }
      const authority = this._semanticAuthority;
      if (!isPlainRecord(authority) || authority.profile !== SEMANTIC_PROFILE ||
          canonicalJson(authority.baseRoot) !== canonicalJson(baseRoot) ||
          canonicalJson(authority.canonicalRoot) !== canonicalJson(canonicalRoot)) {
        throw new ContractError('invariant_semantic_authority', 'Semantic authority record is inconsistent with runtime roots');
      }
      const canonicalDigest = canonicalRoot.rootDigest;
      if (this._canonicalDigest !== null && this._canonicalDigest !== canonicalDigest) {
        throw new ContractError('invariant_semantic_authority', 'Cached semantic root digest is inconsistent');
      }
      if (this.caseState === 'succeeded') {
        const promotionState = this._taskStates[this.plan.promotionTaskId];
        const accepted = promotionState?.acceptedResult;
        if (promotionState?.state !== 'succeeded' || !isPlainRecord(accepted) ||
            accepted.kind !== 'promotion' || accepted.semanticProfile !== SEMANTIC_PROFILE ||
            canonicalJson(accepted.semanticRoot) !== canonicalJson(canonicalRoot)) {
          throw new ContractError('invariant_promotion', 'Succeeded semantic Case requires canonical root from succeeded Promotion');
        }
      } else if (canonicalRoot.rootDigest !== baseRoot.rootDigest) {
        throw new ContractError('invariant_semantic_authority', 'Semantic canonical root changed before successful Promotion');
      }
      return canonicalDigest;
    }

    let canonicalDigest = this._canonicalDigest;
    if (!Object.isFrozen(this.canonicalTree) || canonicalDigest === null) {
      const computedCanonicalDigest = digest(this.canonicalTree);
      if (canonicalDigest !== null && canonicalDigest !== computedCanonicalDigest) {
        throw new ContractError('invariant_canonical_tree', 'Cached canonical digest does not match the canonical tree');
      }
      canonicalDigest = computedCanonicalDigest;
    }
    if (this.caseState === 'succeeded') {
      const promotionState = this._taskStates[this.plan.promotionTaskId];
      if (promotionState.state !== 'succeeded' || promotionState.acceptedResult.treeDigest !== canonicalDigest) {
        throw new ContractError('invariant_promotion', 'Succeeded Case requires canonical tree from succeeded Promotion');
      }
    } else if (canonicalDigest !== this.plan.baseDigest) {
      throw new ContractError('invariant_canonical_tree', 'Canonical tree changed before successful Promotion');
    }
    return canonicalDigest;
  }

  #assertCommittedInvariants() {
    if (this._mutationFrame !== null || this._eventReservation !== null) {
      throw new ContractError('invariant_mutation_boundary', 'Cannot snapshot a Case during a mutation');
    }
    if (!CASE_STATES.includes(this.caseState)) {
      throw new ContractError('invariant_case_state', `Invalid Case state ${this.caseState}`);
    }
    if (!Array.isArray(this._events) || !isPlainRecord(this._taskStates) ||
        !isPlainRecord(this._attempts) || !isPlainRecord(this._receipts)) {
      throw new ContractError('invariant_state_shape', 'Task, Attempt, and receipt collections must be records');
    }
    if (this.caseRevision !== this.eventSequence || this._events.length !== this.eventSequence ||
        this._validatedEventSequence !== this.eventSequence) {
      throw new ContractError('invariant_event_revision', 'Committed Event frontier and Case revision must match');
    }
    const canonicalDigest = this.#canonicalAuthorityDigest();
    if (this._canonicalDigest === null || this._canonicalDigest !== canonicalDigest ||
        (this._semanticMode !== true && !Object.isFrozen(this.canonicalTree))) {
      throw new ContractError('invariant_canonical_tree', 'Committed canonical authority must be frozen/rooted and digested');
    }
  }

  #assertIncrementalInvariants(frame) {
    assertIdentifier(this.caseId, 'caseId');
    if (!CASE_STATES.includes(this.caseState)) {
      throw new ContractError('invariant_case_state', `Invalid Case state ${this.caseState}`);
    }
    if (!Array.isArray(this._events) || !isPlainRecord(this._taskStates) ||
        !isPlainRecord(this._attempts) || !isPlainRecord(this._receipts)) {
      throw new ContractError('invariant_state_shape', 'Task, Attempt, and receipt collections must be records');
    }
    if (this._events.length > this.caseContract.limits.maxEvents) {
      throw new ContractError('event_limit_exceeded', 'Case Event limit exceeded');
    }
    if (this.caseRevision !== this.eventSequence || this._events.length !== this.eventSequence) {
      throw new ContractError('invariant_event_revision', 'Case revision, Event sequence, and Event count must match');
    }
    assertEventSuffix(this);

    for (const taskId of frame.taskIds) assertTaskStateInvariant(this, taskId);
    for (const attemptId of frame.attemptIds) assertAttemptInvariant(this, attemptId);

    const liveClaimHolders = new Set(this._claimHoldingTaskIdSet);
    for (const taskId of frame.taskIds) {
      const state = this._taskStates[taskId]?.state;
      if (state === 'running' || state === 'reconciling') liveClaimHolders.add(taskId);
      else liveClaimHolders.delete(taskId);
    }
    for (const taskId of frame.taskIds) {
      if (!liveClaimHolders.has(taskId)) continue;
      for (const otherTaskId of liveClaimHolders) {
        if (taskId === otherTaskId) continue;
        if (normalizedClaimSetsConflict(
          this.plan.tasksById[taskId].claims,
          this.plan.tasksById[otherTaskId].claims,
        )) {
          throw new ContractError('invariant_claim_conflict', `Concurrent Tasks ${taskId} and ${otherTaskId} have conflicting claims`);
        }
      }
    }

    const derived = this.#deriveCaseStateFromFrame(frame);
    frame.derivedCounts = derived.counts;
    const expectedCaseState = derived.state;
    if (this.caseState !== expectedCaseState) {
      throw new ContractError('invariant_case_state', `Case state ${this.caseState} does not match derived state ${expectedCaseState}`);
    }

    const canonicalDigest = this.#canonicalAuthorityDigest();

    if (Object.keys(this._receipts).length > this.caseContract.limits.maxReceipts) {
      throw new ContractError('receipt_limit_exceeded', 'Case mutation receipt limit exceeded');
    }
    for (const requestId of frame.receiptIds) {
      const receipt = this._receipts[requestId];
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
      for (const [otherRequestId, otherReceipt] of Object.entries(this._receipts)) {
        if (otherRequestId !== requestId && otherReceipt.committedRevision === receipt.committedRevision) {
          throw new ContractError('invariant_receipt', `Multiple mutation receipts claim revision ${receipt.committedRevision}`);
        }
      }
      const commitEvent = this._events[receipt.committedRevision - 1];
      if (!commitEvent || commitEvent.type !== 'command_committed') {
        throw new ContractError('invariant_receipt', `Mutation receipt ${requestId} has no matching commit Event`);
      }
      assertRecordShape(commitEvent.detail, ['requestId', 'commandDigest', 'responseDigest'], [], `command_committed Event ${receipt.committedRevision}`);
      if (commitEvent.detail.requestId !== requestId ||
          commitEvent.detail.commandDigest !== receipt.commandDigest ||
          commitEvent.detail.responseDigest !== receipt.responseDigest) {
        throw new ContractError('invariant_receipt', `Mutation receipt ${requestId} does not match its commit Event`);
      }
      deepFreeze(receipt);
    }

    this._validatedEventSequence = this._events.length;
    this._canonicalDigest = canonicalDigest;
    deepFreeze(this.canonicalTree);
  }


  _assertInvariants() {
    if (this._mutationFrame !== null) return;
    assertIdentifier(this.caseId, 'caseId');
    if (!CASE_STATES.includes(this.caseState)) {
      throw new ContractError('invariant_case_state', `Invalid Case state ${this.caseState}`);
    }
    if (!Array.isArray(this._events) || !isPlainRecord(this._taskStates) || !isPlainRecord(this._attempts) || !isPlainRecord(this._receipts)) {
      throw new ContractError('invariant_state_shape', 'Task, Attempt, and receipt collections must be records');
    }
    if (this._events.length > this.caseContract.limits.maxEvents) {
      throw new ContractError('event_limit_exceeded', 'Case Event limit exceeded');
    }
    if (this.caseRevision !== this.eventSequence || this._events.length !== this.eventSequence) {
      throw new ContractError('invariant_event_revision', 'Case revision, Event sequence, and Event count must match');
    }

    if (this._validatedEventSequence > this._events.length) {
      throw new ContractError('invariant_event_frontier', 'Validated Event frontier exceeds Event count');
    }
    let previousDigest = this._validatedEventSequence === 0
      ? null
      : this._events[this._validatedEventSequence - 1]?.eventDigest ?? null;
    for (let index = this._validatedEventSequence; index < this._events.length; index += 1) {
      const event = this._events[index];
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
      const taskState = this._taskStates[taskId];
      if (!taskState) throw new ContractError('invariant_task_missing', `Missing state for Task ${taskId}`);
      if (Object.isFrozen(taskState)) {
        for (const attemptId of taskState.attemptIds) {
          const attempt = this._attempts[attemptId];
          if (!attempt) throw new ContractError('invariant_attempt_missing', `Task ${taskId} links missing Attempt ${attemptId}`);
          if (attempt.taskId !== taskId) {
            throw new ContractError('invariant_attempt_link', `Task ${taskId} links Attempt ${attemptId} owned by ${attempt.taskId}`);
          }
        }
        continue;
      }
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
        const attempt = this._attempts[attemptId];
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
        .filter((dependency) => this._taskStates[dependency]?.state !== 'succeeded');
      if (dependencyBoundStates.has(taskState.state) && unsatisfiedDependencies.length > 0) {
        throw new ContractError('invariant_dependency', `Task ${taskId} entered ${taskState.state} before its dependencies succeeded`, {
          unsatisfiedDependencies,
        });
      }
      const terminalBlockers = task.dependencies
        .filter((dependency) => terminalDependencyReason(this._taskStates[dependency]?.state) !== null)
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
      deepFreeze(taskState);
    }
    if (Object.keys(this._taskStates).sort(compareText).join('\0') !== this.plan.taskOrder.join('\0')) {
      throw new ContractError('invariant_task_set', 'Task state set does not match the Plan');
    }

    for (const [attemptId, attempt] of Object.entries(this._attempts)) {
      if (Object.isFrozen(attempt)) continue;
      assertRecordShape(attempt, [
        'id', 'taskId', 'ordinal', 'executorId', 'executorEpoch', 'executorCapabilities', 'state',
        'effectKey', 'fencingToken', 'claimLease', 'resultDigest', 'error', 'reconciliation',
      ], [], `Attempt ${attemptId}`);
      assertIdentifier(attemptId, `Attempt key ${attemptId}`);
      assertIdentifier(attempt.id, `Attempt ${attemptId}.id`);
      assertIdentifier(attempt.taskId, `Attempt ${attemptId}.taskId`);
      if (attempt.id !== attemptId) throw new ContractError('invariant_attempt_identity', `Attempt ${attemptId} has a mismatched ID`);
      if (!this._taskStates[attempt.taskId]) throw new ContractError('invariant_attempt_task', `Attempt ${attemptId} references an unknown Task`);
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

      const taskState = this._taskStates[attempt.taskId];
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
      deepFreeze(attempt);
    }

    const claimHolders = this.#scanClaimHoldingTaskIds();
    for (let leftIndex = 0; leftIndex < claimHolders.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < claimHolders.length; rightIndex += 1) {
        const left = claimHolders[leftIndex];
        const right = claimHolders[rightIndex];
        if (normalizedClaimSetsConflict(this.plan.tasksById[left].claims, this.plan.tasksById[right].claims)) {
          throw new ContractError('invariant_claim_conflict', `Concurrent Tasks ${left} and ${right} have conflicting claims`);
        }
      }
    }

    const expectedCaseState = deriveCaseState(this.plan, this._taskStates);
    if (this.caseState !== expectedCaseState) {
      throw new ContractError('invariant_case_state', `Case state ${this.caseState} does not match derived state ${expectedCaseState}`);
    }

    const canonicalDigest = this.#canonicalAuthorityDigest();

    if (Object.keys(this._receipts).length > this.caseContract.limits.maxReceipts) {
      throw new ContractError('receipt_limit_exceeded', 'Case mutation receipt limit exceeded');
    }
    const committedRevisions = new Set();
    for (const [requestId, receipt] of Object.entries(this._receipts)) {
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
      const commitEvent = this._events[receipt.committedRevision - 1];
      if (!commitEvent || commitEvent.type !== 'command_committed') {
        throw new ContractError('invariant_receipt', `Mutation receipt ${requestId} has no matching commit Event`);
      }
      assertRecordShape(commitEvent.detail, ['requestId', 'commandDigest', 'responseDigest'], [], `command_committed Event ${receipt.committedRevision}`);
      if (commitEvent.detail.requestId !== requestId ||
          commitEvent.detail.commandDigest !== receipt.commandDigest ||
          commitEvent.detail.responseDigest !== receipt.responseDigest) {
        throw new ContractError('invariant_receipt', `Mutation receipt ${requestId} does not match its commit Event`);
      }
      deepFreeze(receipt);
    }

    this._validatedEventSequence = this._events.length;
    this._canonicalDigest = canonicalDigest;
    if (this._semanticMode !== true) deepFreeze(this.canonicalTree);
  }
  _reopenNonterminalAttempts() {
    if (this._eventReservation === null) {
      return this.#withEventReservation((2 * this.plan.taskOrder.length) + 1, () => {
        this._reopenNonterminalAttempts();
        return this.reconcile();
      });
    }
    for (const currentAttempt of Object.values(this._attempts)) {
      if (!NONTERMINAL_ATTEMPT_STATES.has(currentAttempt.state)) continue;
      const attempt = this.#mutableAttempt(currentAttempt.id);
      const task = this.plan.tasksById[attempt.taskId];
      const taskState = this.#mutableTaskState(attempt.taskId);
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

  installCollections(engine);
  engine.eventSequence = 0;
  engine.caseRevision = 0;
  engine._validatedEventSequence = 0;
  for (const legacyEvent of input.events) engine._event(legacyEvent.type, legacyEvent.detail);

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
    engine._taskStates[taskId] = {
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
    const taskState = engine._taskStates[legacy.taskId];
    const resultDigest = legacy.state === 'succeeded' ? taskState.acceptedResultDigest : null;
    engine._attempts[attemptId] = {
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
  const promotionState = engine._taskStates[promotionTaskId];
  if (promotionState.state === 'succeeded') {
    const promotionResult = engine.createPromotionResult(promotionTaskId);
    promotionState.acceptedResult = promotionResult;
    promotionState.acceptedResultDigest = digest(promotionResult);
    for (const attemptId of promotionState.attemptIds) {
      if (engine._attempts[attemptId]?.state === 'succeeded') {
        engine._attempts[attemptId].resultDigest = promotionState.acceptedResultDigest;
      }
    }
  }

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
  engine._canonicalDigest = null;
  engine._event('snapshot_migrated', { fromSchemaVersion: 1, toSchemaVersion: 2 });
  engine._assertInvariants();
  engine._rebuildPerformanceIndexes();
  return engine.snapshot();
}

function restoreV3Snapshot(snapshot, options) {
  const validated = validateSemanticSnapshot(snapshot);
  assertIdentifier(validated.caseId, 'snapshot.caseId');
  if (typeof options.semanticResolver !== 'function') {
    throw new ContractError('semantic_resolver_required', 'Restoring snapshot v3 requires a semantic object resolver');
  }

  assertRecordShape(
    validated.caseContract,
    ['caseGrant', 'workspacePolicy', 'pathPolicy', 'limits', 'contractDigest'],
    [],
    'snapshot.caseContract',
  );
  assertDigest(validated.caseContract.contractDigest, 'snapshot.caseContract.contractDigest');
  const caseContract = normalizeCaseContract({
    caseGrant: validated.caseContract.caseGrant,
    workspacePolicy: validated.caseContract.workspacePolicy,
    pathPolicy: validated.caseContract.pathPolicy,
    limits: validated.caseContract.limits,
  });
  if (caseContract.contractDigest !== validated.caseContract.contractDigest ||
      canonicalJson(caseContract) !== canonicalJson(validated.caseContract)) {
    throw new ContractError('snapshot_case_contract', 'Semantic snapshot Case contract is invalid');
  }

  const binding = validateSemanticPlanBinding(validated.plan);
  const baseSemantic = hydrateSemanticTree(validated.semanticAuthority.baseRoot, options.semanticResolver, caseContract);
  const baseTree = baseSemantic.materialize();
  const plan = definePlan({
    revisionId: binding.revisionId,
    baseTree,
    tasks: binding.tasks,
  }, { caseContract });
  if (plan.planDigest !== binding.planDigest || plan.baseDigest !== binding.baseDigest) {
    throw new ContractError('snapshot_plan_digest', 'Semantic snapshot Plan identity does not match the reconstructed Plan');
  }
  const rebuiltBinding = semanticPlanBinding(plan, baseSemantic.rootDescriptor);
  if (rebuiltBinding.planBindingDigest !== binding.planBindingDigest || canonicalJson(rebuiltBinding) !== canonicalJson(binding)) {
    throw new ContractError('snapshot_plan_shape', 'Semantic snapshot Plan binding is not canonical');
  }

  const canonicalSemantic = validated.semanticAuthority.canonicalRoot.rootDigest === validated.semanticAuthority.baseRoot.rootDigest
    ? baseSemantic
    : hydrateSemanticTree(validated.semanticAuthority.canonicalRoot, options.semanticResolver, caseContract);
  const engine = new CaseEngine({
    caseId: validated.caseId,
    plan,
    caseContract,
    semanticAuthority: {
      profile: validated.semanticAuthority.profile,
      authorityEpoch: validated.semanticAuthority.authorityEpoch,
      migrationSource: validated.semanticAuthority.migrationSource,
      baseTree: baseSemantic,
    },
  });
  assertState(validated.caseState, CASE_STATES, 'Case');
  assertSafeInteger(validated.caseRevision, 'caseRevision', { min: 1 });
  assertSafeInteger(validated.eventSequence, 'eventSequence', { min: 1 });
  engine.caseState = validated.caseState;
  engine.caseRevision = validated.caseRevision;
  engine.eventSequence = validated.eventSequence;
  installCollections(engine, {
    events: canonicalClone(validated.events),
    taskStates: canonicalClone(validated.taskStates),
    attempts: canonicalClone(validated.attempts),
    receipts: canonicalClone(validated.receipts),
  });
  engine._validatedEventSequence = 0;
  engine._semanticBaseTree = baseSemantic;
  engine._semanticCanonicalTree = canonicalSemantic;
  engine._semanticPlanBinding = binding;
  engine._semanticAuthority = validated.semanticAuthority;
  engine._canonicalTreeCache = null;
  engine._canonicalDigest = canonicalSemantic.rootDescriptor.rootDigest;
  verifyRestoredResults(engine);
  engine._assertInvariants();
  engine._rebuildPerformanceIndexes();

  if (options.reopen !== false && !TERMINAL_CASE_STATES.has(engine.caseState)) {
    engine._reopenNonterminalAttempts();
    engine.reconcile();
    engine._assertInvariants();
  }
  return engine;
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
  installCollections(engine, {
    events: canonicalClone(snapshot.events),
    taskStates: canonicalClone(snapshot.taskStates),
    attempts: canonicalClone(snapshot.attempts),
    receipts: canonicalClone(snapshot.receipts),
  });
  engine._validatedEventSequence = 0;
  engine.canonicalTree = validateTree(canonicalClone(snapshot.canonicalTree), caseContract);
  if (snapshot.canonicalDigest !== digest(engine.canonicalTree)) {
    throw new ContractError('snapshot_canonical_digest', 'Snapshot canonical tree digest is invalid');
  }
  engine._canonicalDigest = snapshot.canonicalDigest;
  verifyRestoredResults(engine);
  engine._assertInvariants();
  engine._rebuildPerformanceIndexes();

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
    const taskState = engine._taskStates[taskId];
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
