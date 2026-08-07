import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { digest, typedDigest } from '../src/canonical.mjs';
import { CaseEngine, definePlan } from '../src/engine.mjs';
import { planWithWork, resultFor } from './helpers.mjs';

function redigestSnapshot(snapshot) {
  const copy = structuredClone(snapshot);
  delete copy.snapshotDigest;
  copy.snapshotDigest = typedDigest('tdev.case-snapshot.v2', copy);
  return copy;
}

function withContractLimit(snapshot, key, value) {
  const copy = structuredClone(snapshot);
  copy.caseContract.limits[key] = value;
  const contract = structuredClone(copy.caseContract);
  delete contract.contractDigest;
  copy.caseContract.contractDigest = typedDigest('tdev.case-contract.v1', contract);
  return redigestSnapshot(copy);
}

function effectPlan(effectClass = 'reconcilable-external', maxAttempts = 3) {
  return definePlan({
    revisionId: `${effectClass}-v1`, baseTree: {}, tasks: [
      {
        id: 'effect', kind: 'work', dependencies: [],
        claims: [{ mode: 'execute', resource: 'remote:origin/main' }], input: {},
        execution: {
          operation: 'remote.apply', resultKind: 'effect-receipt', effectClass,
          retry: { maxAttempts },
        },
      },
      {
        id: 'promote', kind: 'promotion', dependencies: ['effect'],
        claims: [{ mode: 'write', resource: 'canonical:tree' }], input: {},
      },
    ],
  });
}

test('result envelope rejects stale epoch, token, and identity without state change', () => {
  const plan = planWithWork([{ id: 'a' }]);
  const engine = new CaseEngine({ caseId: 'fence-case', plan });
  const attempt = engine.startAttempt('a', { id: 'agent', epoch: 7, capabilities: [] });
  const result = resultFor(plan.baseDigest, plan.tasksById.a);
  const envelope = engine.resultEnvelope(attempt.id, result);

  for (const [field, replacement] of [
    ['executorEpoch', 6], ['fencingToken', digest('wrong')], ['taskId', 'promote'], ['planDigest', digest('wrong-plan')],
  ]) {
    const stale = structuredClone(envelope);
    stale[field] = replacement;
    assert.throws(() => engine.acceptResult(stale), (error) => error?.code === 'stale_result');
    assert.equal(engine.attempts[attempt.id].state, 'running');
  }

  const accepted = engine.acceptResult(envelope);
  assert.equal(accepted.deduplicated, false);
  assert.equal(engine.acceptResult(envelope).deduplicated, true);
  const contradictory = structuredClone(envelope);
  contradictory.result.writes[0].content = 'different';
  assert.throws(() => engine.acceptResult(contradictory), (error) => error?.code === 'duplicate_result_conflict');
});

test('reconcilable external reopen never converts uncertainty into a retry', () => {
  const plan = effectPlan('reconcilable-external');
  const engine = new CaseEngine({ caseId: 'reconcilable-reopen', plan });
  const attempt = engine.startAttempt('effect', 'agent');
  const reopened = CaseEngine.restore(engine.snapshot());
  assert.equal(reopened.caseState, 'reconciling');
  assert.equal(reopened.taskStates.effect.state, 'reconciling');
  assert.equal(reopened.attempts[attempt.id].state, 'reconciling');
  assert.equal(reopened.attempts[attempt.id].error.certainty, 'unknown');
  assert.equal(reopened.readyTaskIds().length, 0);

  reopened.resolveReconciliation(attempt.id, { outcome: 'not_applied', evidence: { checked: true } });
  assert.equal(reopened.caseState, 'active');
  assert.equal(reopened.taskStates.effect.state, 'pending');
  const retry = reopened.startAttempt('effect', 'agent');
  assert.equal(retry.effectKey, attempt.effectKey);
});

test('idempotent external retry reuses the Task-level effect key', () => {
  const plan = effectPlan('idempotent-external');
  const engine = new CaseEngine({ caseId: 'idempotent-retry', plan });
  const first = engine.startAttempt('effect', 'agent');
  engine.recordExecutorFailure(first.id, { code: 'transport', message: 'lost before acknowledgement' });
  assert.equal(engine.taskStates.effect.state, 'pending');
  const second = engine.startAttempt('effect', 'agent');
  assert.notEqual(first.fencingToken, second.fencingToken);
  assert.equal(first.effectKey, second.effectKey);
});

test('cancellation of a reconcilable effect remains intent until reconciliation', () => {
  const plan = effectPlan('reconcilable-external');
  const engine = new CaseEngine({ caseId: 'effect-cancel', plan });
  const attempt = engine.startAttempt('effect', 'agent');
  engine.cancelTask('effect', 'operator request');
  assert.equal(engine.caseState, 'reconciling');
  assert.equal(engine.attempts[attempt.id].state, 'cancel_requested');
  engine.resolveReconciliation(attempt.id, { outcome: 'not_applied' });
  assert.equal(engine.caseState, 'cancelled');
  assert.equal(engine.taskStates.effect.state, 'cancelled');
});

test('snapshot v2 detects whole-snapshot, event-chain, and accepted-result corruption', () => {
  const plan = planWithWork([{ id: 'a' }]);
  const engine = new CaseEngine({ caseId: 'integrity-case', plan });
  const attempt = engine.startAttempt('a', 'executor');
  engine.completeAttempt(attempt.id, resultFor(plan.baseDigest, plan.tasksById.a));
  const snapshot = engine.snapshot();

  const whole = structuredClone(snapshot);
  whole.caseState = 'succeeded';
  assert.throws(() => CaseEngine.restore(whole, { reopen: false }), (error) => error?.code === 'snapshot_digest_mismatch');

  const event = structuredClone(snapshot);
  event.events[1].detail.executorId = 'tampered';
  assert.throws(() => CaseEngine.restore(redigestSnapshot(event), { reopen: false }), (error) => error?.code === 'invariant_event_digest');

  const accepted = structuredClone(snapshot);
  accepted.taskStates.a.acceptedResult.writes[0].content = 'corrupt';
  assert.throws(() => CaseEngine.restore(redigestSnapshot(accepted), { reopen: false }), (error) => error?.code === 'snapshot_result_digest');
});

test('v1 snapshot migrates by recomputing v2 results and Promotion', () => {
  const legacy = JSON.parse(readFileSync(new URL('./fixtures/v1-succeeded.json', import.meta.url), 'utf8'));
  const restored = CaseEngine.restore(legacy, { reopen: false });
  const snapshot = restored.snapshot();
  assert.equal(snapshot.schemaVersion, 2);
  assert.equal(snapshot.caseState, 'succeeded');
  assert.deepEqual(snapshot.taskStates.promote.acceptedResult.appliedTaskIds, ['a']);
  assert.equal(snapshot.events.at(-1).type, 'snapshot_migrated');
});

test('idempotent mutation receipts replay exactly and revision conflict has no effect', () => {
  const plan = planWithWork([{ id: 'a' }]);
  const engine = new CaseEngine({ caseId: 'receipt-case', plan });
  const command = {
    requestId: 'request-1',
    expectedCaseRevision: engine.caseRevision,
    command: { type: 'start_attempt', taskId: 'a', executor: 'executor' },
  };
  const first = engine.applyCommand(command);
  const revisionAfterFirst = engine.caseRevision;
  const replay = engine.applyCommand(command);
  assert.equal(first.deduplicated, false);
  assert.equal(replay.deduplicated, true);
  assert.deepEqual(replay.response, first.response);
  assert.equal(engine.caseRevision, revisionAfterFirst);

  assert.throws(() => engine.applyCommand({
    ...command,
    expectedCaseRevision: 'not-an-integer',
  }), (error) => error?.code === 'invalid_integer');
  assert.equal(engine.caseRevision, revisionAfterFirst);

  assert.throws(() => engine.applyCommand({
    requestId: 'request-1',
    command: { type: 'cancel_task', taskId: 'a', reason: 'different' },
  }), (error) => error?.code === 'request_conflict');
  assert.equal(engine.caseRevision, revisionAfterFirst);

  assert.throws(() => engine.applyCommand({
    requestId: 'request-2', expectedCaseRevision: 1,
    command: { type: 'cancel_task', taskId: 'a', reason: 'stale' },
  }), (error) => error?.code === 'revision_conflict');
  assert.equal(engine.caseRevision, revisionAfterFirst);
});

test('snapshot restore rejects ignored nested fields and non-derived indexes', () => {
  const plan = planWithWork([{ id: 'a' }]);
  const engine = new CaseEngine({ caseId: 'snapshot-shape', plan });
  const snapshot = engine.snapshot();

  const nested = structuredClone(snapshot);
  nested.taskStates.a.untrusted = true;
  assert.throws(
    () => CaseEngine.restore(redigestSnapshot(nested), { reopen: false }),
    (error) => error?.code === 'unexpected_keys',
  );

  const derived = structuredClone(snapshot);
  derived.plan.reverseDependenciesById.a.push('ghost');
  assert.throws(
    () => CaseEngine.restore(redigestSnapshot(derived), { reopen: false }),
    (error) => error?.code === 'snapshot_plan_shape',
  );
});

test('snapshot restore rejects a recomputed digest when semantic Case state is inconsistent', () => {
  const plan = planWithWork([{ id: 'a' }]);
  const engine = new CaseEngine({ caseId: 'snapshot-semantics', plan });
  const snapshot = engine.snapshot();
  snapshot.caseState = 'failed';
  assert.throws(
    () => CaseEngine.restore(redigestSnapshot(snapshot), { reopen: false }),
    (error) => error?.code === 'invariant_case_state',
  );
});

test('public mutation boundaries reject unknown fields without state change', () => {
  const plan = planWithWork([{ id: 'a' }]);
  const engine = new CaseEngine({ caseId: 'exact-boundary', plan });
  const initialRevision = engine.caseRevision;

  assert.throws(
    () => engine.startAttempt('a', { id: 'executor', capabilities: [], ignored: true }),
    (error) => error?.code === 'unexpected_keys',
  );
  assert.equal(engine.caseRevision, initialRevision);

  assert.throws(() => engine.applyCommand({
    requestId: 'bad-command',
    command: { type: 'start_attempt', taskId: 'a', executor: 'executor', ignored: true },
  }), (error) => error?.code === 'unexpected_keys');
  assert.equal(engine.caseRevision, initialRevision);

  const attempt = engine.startAttempt('a', 'executor');
  const envelope = structuredClone(engine.resultEnvelope(attempt.id, resultFor(plan.baseDigest, plan.tasksById.a)));
  envelope.ignored = true;
  assert.throws(() => engine.acceptResult(envelope), (error) => error?.code === 'unexpected_keys');
  assert.equal(engine.attempts[attempt.id].state, 'running');
});

test('idempotent external cancellation remains intent until reconciliation', () => {
  const plan = effectPlan('idempotent-external');
  const engine = new CaseEngine({ caseId: 'idempotent-cancel', plan });
  const attempt = engine.startAttempt('effect', 'agent');

  engine.cancelTask('effect', 'operator request');
  assert.equal(engine.caseState, 'reconciling');
  assert.equal(engine.attempts[attempt.id].state, 'cancel_requested');
  assert.equal(engine.attempts[attempt.id].error.certainty, 'unknown');

  engine.resolveReconciliation(attempt.id, { outcome: 'not_applied', evidence: { checked: true } });
  assert.equal(engine.caseState, 'cancelled');
  assert.equal(engine.taskStates.effect.state, 'cancelled');
});

test('invalid reconciliation success is rejected without partial state', () => {
  const plan = effectPlan('reconcilable-external');
  const engine = new CaseEngine({ caseId: 'reconciliation-no-effect', plan });
  const attempt = engine.startAttempt('effect', 'agent');
  engine.markAttemptReconciling(attempt.id, 'result response lost');
  const revision = engine.caseRevision;

  assert.throws(() => engine.resolveReconciliation(attempt.id, {
    outcome: 'succeeded',
    result: {
      kind: 'effect-receipt',
      effectKey: digest('wrong-effect'),
      operation: 'remote.apply',
      outcome: 'applied',
      receipt: { remoteId: 'x' },
    },
  }), (error) => error?.code === 'effect_receipt_mismatch');

  assert.equal(engine.caseRevision, revision);
  assert.equal(engine.attempts[attempt.id].state, 'reconciling');
  assert.equal(engine.attempts[attempt.id].reconciliation, null);
  assert.equal(engine.taskStates.effect.state, 'reconciling');
});

test('successful reconciliation records evidence only after accepting the result', () => {
  const plan = effectPlan('reconcilable-external');
  const engine = new CaseEngine({ caseId: 'reconciliation-success', plan });
  const attempt = engine.startAttempt('effect', 'agent');
  engine.markAttemptReconciling(attempt.id, 'acknowledgement lost');

  const resolved = engine.resolveReconciliation(attempt.id, {
    outcome: 'succeeded',
    evidence: { lookup: 'remote-id' },
    result: {
      kind: 'effect-receipt',
      effectKey: attempt.effectKey,
      operation: 'remote.apply',
      outcome: 'applied',
      receipt: { remoteId: 'r-1' },
    },
  });

  assert.equal(resolved.outcome, 'succeeded');
  assert.equal(engine.taskStates.effect.state, 'succeeded');
  assert.equal(engine.attempts[attempt.id].state, 'succeeded');
  assert.equal(engine.attempts[attempt.id].reconciliation.outcome, 'succeeded');
  assert.equal(engine.attempts[attempt.id].reconciliation.evidence.lookup, 'remote-id');
});

test('reconciliation outcomes preserve retry, cancellation, failure, and uncertainty semantics', () => {
  function reconciling(caseId, maxAttempts = 2) {
    const plan = effectPlan('reconcilable-external', maxAttempts);
    const engine = new CaseEngine({ caseId, plan });
    const attempt = engine.startAttempt('effect', 'agent');
    engine.markAttemptReconciling(attempt.id, 'delivery uncertain');
    return { engine, attempt };
  }

  const retry = reconciling('reconcile-retry');
  retry.engine.resolveReconciliation(retry.attempt.id, {
    outcome: 'failed', retry: true,
    error: { code: 'remote_rejected', message: 'proved failed', certainty: 'not_applied', retryable: true },
  });
  assert.equal(retry.engine.taskStates.effect.state, 'pending');
  assert.equal(retry.engine.caseState, 'active');

  const failed = reconciling('reconcile-failed');
  failed.engine.resolveReconciliation(failed.attempt.id, { outcome: 'failed' });
  assert.equal(failed.engine.taskStates.effect.state, 'failed');
  assert.equal(failed.engine.caseState, 'failed');

  const cancelled = reconciling('reconcile-cancelled');
  cancelled.engine.resolveReconciliation(cancelled.attempt.id, { outcome: 'cancelled' });
  assert.equal(cancelled.engine.taskStates.effect.state, 'cancelled');
  assert.equal(cancelled.engine.caseState, 'cancelled');

  const unverified = reconciling('reconcile-unverified');
  unverified.engine.resolveReconciliation(unverified.attempt.id, {
    outcome: 'unverified', reason: 'remote history unavailable', evidence: { checked: true },
  });
  assert.equal(unverified.engine.taskStates.effect.state, 'unverified');
  assert.equal(unverified.engine.caseState, 'unverified');
  assert.equal(unverified.engine.attempts[unverified.attempt.id].error.certainty, 'unknown');
});

test('event and error bounds reject mutations before changing state', () => {
  const plan = planWithWork([{ id: 'a' }]);
  const eventBound = new CaseEngine({
    caseId: 'event-bound',
    plan,
    caseContract: { limits: { maxEvents: 1 } },
  });
  assert.throws(
    () => eventBound.startAttempt('a', 'executor'),
    (error) => error?.code === 'event_limit_exceeded',
  );
  assert.equal(eventBound.caseRevision, 1);
  assert.equal(eventBound.taskStates.a.state, 'pending');
  assert.equal(Object.keys(eventBound.attempts).length, 0);

  const errorBound = new CaseEngine({
    caseId: 'error-bound',
    plan,
    caseContract: { limits: { maxErrorMessageBytes: 8 } },
  });
  const attempt = errorBound.startAttempt('a', 'executor');
  const revision = errorBound.caseRevision;
  assert.throws(
    () => errorBound.failAttempt(attempt.id, { code: 'failure', message: 'message too long' }),
    (error) => error?.code === 'error_message_limit_exceeded',
  );
  assert.equal(errorBound.caseRevision, revision);
  assert.equal(errorBound.attempts[attempt.id].state, 'running');
  assert.equal(errorBound.taskStates.a.state, 'running');
});

test('a failure after the first emitted Event rolls the entire direct mutation back', () => {
  const plan = planWithWork([{ id: 'a', execution: { retry: { maxAttempts: 2 } } }]);
  const engine = new CaseEngine({
    caseId: 'multi-event-rollback',
    plan,
    caseContract: { limits: { maxEvents: 3 } },
  });
  const attempt = engine.startAttempt('a', 'executor');
  const before = engine.snapshot();

  assert.throws(
    () => engine.failAttempt(attempt.id, { code: 'failure', message: 'retry me' }, { retryable: true }),
    (error) => error?.code === 'event_limit_exceeded',
  );
  assert.deepEqual(engine.snapshot(), before);
});

test('result-only work cannot be routed through reconciliation', () => {
  const plan = planWithWork([{ id: 'a' }]);
  const engine = new CaseEngine({ caseId: 'result-only-reconciliation', plan });
  const attempt = engine.startAttempt('a', 'executor');
  const revision = engine.caseRevision;

  assert.throws(
    () => engine.markAttemptReconciling(attempt.id),
    (error) => error?.code === 'reconciliation_forbidden',
  );
  assert.equal(engine.caseRevision, revision);
  assert.equal(engine.attempts[attempt.id].state, 'running');
});

test('ambiguous external failure cannot be guessed into terminal failure', () => {
  const plan = effectPlan('reconcilable-external', 3);
  const engine = new CaseEngine({ caseId: 'unknown-effect-failure', plan });
  const attempt = engine.startAttempt('effect', 'agent');
  const revision = engine.caseRevision;
  const unknown = {
    code: 'transport_unknown',
    message: 'response was lost',
    certainty: 'unknown',
    retryable: true,
  };

  assert.throws(
    () => engine.failAttempt(attempt.id, unknown, { retryable: true }),
    (error) => error?.code === 'reconciliation_required',
  );
  assert.equal(engine.caseRevision, revision);
  assert.equal(engine.attempts[attempt.id].state, 'running');

  const recorded = engine.recordExecutorFailure(attempt.id, unknown);
  assert.equal(recorded.reconciling, true);
  assert.equal(engine.attempts[attempt.id].state, 'reconciling');
  assert.equal(engine.caseState, 'reconciling');
});

test('idempotent ambiguity retries only within budget and then requires reconciliation', () => {
  const oneAttempt = effectPlan('idempotent-external', 1);
  const exhausted = new CaseEngine({ caseId: 'idempotent-exhausted', plan: oneAttempt });
  const attempt = exhausted.startAttempt('effect', 'agent');
  exhausted.recordExecutorFailure(attempt.id, {
    code: 'transport_unknown', message: 'lost response', certainty: 'unknown', retryable: true,
  });
  assert.equal(exhausted.attempts[attempt.id].state, 'reconciling');
  assert.equal(exhausted.taskStates.effect.state, 'reconciling');
  assert.equal(exhausted.caseState, 'reconciling');

  const twoAttempts = effectPlan('idempotent-external', 2);
  const retrying = new CaseEngine({ caseId: 'idempotent-retry-budget', plan: twoAttempts });
  const first = retrying.startAttempt('effect', 'agent');
  retrying.recordExecutorFailure(first.id, {
    code: 'transport_unknown', message: 'lost response', certainty: 'unknown', retryable: true,
  });
  assert.equal(retrying.attempts[first.id].state, 'failed');
  assert.equal(retrying.taskStates.effect.state, 'pending');
});

test('external cancellation intent survives reopen and cannot be turned into retry', () => {
  for (const effectClass of ['idempotent-external', 'reconcilable-external']) {
    const plan = effectPlan(effectClass, 3);
    const engine = new CaseEngine({ caseId: `cancel-reopen-${effectClass}`, plan });
    const attempt = engine.startAttempt('effect', 'agent');
    engine.cancelTask('effect', 'operator cancellation');

    const reopened = CaseEngine.restore(engine.snapshot());
    assert.equal(reopened.attempts[attempt.id].state, 'cancel_requested');
    assert.equal(reopened.taskStates.effect.state, 'reconciling');
    assert.equal(reopened.taskStates.effect.error.code, 'cancel_requested');

    reopened.resolveReconciliation(attempt.id, {
      outcome: 'failed',
      retry: true,
      error: {
        code: 'effect_failed',
        message: 'provider confirmed failure',
        certainty: 'not_applied',
        retryable: true,
      },
    });
    assert.equal(reopened.taskStates.effect.state, 'failed');
    assert.equal(reopened.caseState, 'failed');
  }
});

test('unsafe reconciled retry is rejected atomically', () => {
  const plan = effectPlan('reconcilable-external', 3);
  const engine = new CaseEngine({ caseId: 'unsafe-reconciled-retry', plan });
  const attempt = engine.startAttempt('effect', 'agent');
  engine.markAttemptReconciling(attempt.id);
  const revision = engine.caseRevision;

  assert.throws(
    () => engine.resolveReconciliation(attempt.id, {
      outcome: 'failed',
      retry: true,
      error: {
        code: 'still_unknown',
        message: 'provider state is still ambiguous',
        certainty: 'unknown',
        retryable: true,
      },
    }),
    (error) => error?.code === 'unsafe_reconciliation_retry',
  );
  assert.equal(engine.caseRevision, revision);
  assert.equal(engine.attempts[attempt.id].state, 'reconciling');
});

test('snapshot invariants reject cross-linked and orphan succeeded Attempts', () => {
  const crossPlan = planWithWork([{ id: 'a' }, { id: 'b' }]);
  const cross = new CaseEngine({ caseId: 'cross-linked-attempt', plan: crossPlan });
  const failed = cross.startAttempt('a', 'executor');
  cross.failAttempt(failed.id, { code: 'failed', message: 'failed' });
  const crossSnapshot = structuredClone(cross.snapshot());
  crossSnapshot.taskStates.b.attemptIds.push(failed.id);
  assert.throws(
    () => CaseEngine.restore(redigestSnapshot(crossSnapshot), { reopen: false }),
    (error) => error?.code === 'invariant_attempt_link',
  );

  const terminalPlan = planWithWork([{
    id: 'a',
    execution: { retry: { maxAttempts: 1 } },
  }]);
  const terminal = new CaseEngine({ caseId: 'orphan-succeeded-attempt', plan: terminalPlan });
  const terminalAttempt = terminal.startAttempt('a', 'executor');
  terminal.failAttempt(terminalAttempt.id, { code: 'failed', message: 'failed' });
  const orphan = structuredClone(terminal.snapshot());
  orphan.attempts[terminalAttempt.id].state = 'succeeded';
  orphan.attempts[terminalAttempt.id].error = null;
  orphan.attempts[terminalAttempt.id].resultDigest = null;
  assert.throws(
    () => CaseEngine.restore(redigestSnapshot(orphan), { reopen: false }),
    (error) => error?.code === 'invariant_result',
  );
});

test('snapshot restore enforces reconciliation evidence bounds after re-digesting', () => {
  const plan = effectPlan('reconcilable-external');
  const engine = new CaseEngine({
    caseId: 'reconciliation-evidence-bound',
    plan,
    caseContract: { limits: { maxEvidenceBytes: 64 } },
  });
  const attempt = engine.startAttempt('effect', 'agent');
  engine.markAttemptReconciling(attempt.id);
  engine.resolveReconciliation(attempt.id, {
    outcome: 'unverified',
    evidence: { provider: 'unknown' },
  });

  const oversized = structuredClone(engine.snapshot());
  oversized.attempts[attempt.id].reconciliation.evidence = { provider: 'x'.repeat(128) };
  assert.throws(
    () => CaseEngine.restore(redigestSnapshot(oversized), { reopen: false }),
    (error) => error?.code === 'evidence_limit_exceeded',
  );
});

test('snapshot restore enforces Event and receipt count limits', () => {
  const plan = planWithWork([{ id: 'a' }]);
  const eventEngine = new CaseEngine({ caseId: 'restore-event-limit', plan });
  eventEngine.startAttempt('a', 'executor');
  assert.throws(
    () => CaseEngine.restore(withContractLimit(eventEngine.snapshot(), 'maxEvents', 1), { reopen: false }),
    (error) => error?.code === 'event_limit_exceeded',
  );

  const receiptEngine = new CaseEngine({ caseId: 'restore-receipt-limit', plan });
  receiptEngine.applyCommand({
    requestId: 'start',
    command: { type: 'start_attempt', taskId: 'a', executor: 'executor' },
  });
  receiptEngine.applyCommand({
    requestId: 'running',
    command: { type: 'mark_attempt_running', attemptId: 'a.1' },
  });
  assert.throws(
    () => CaseEngine.restore(withContractLimit(receiptEngine.snapshot(), 'maxReceipts', 1), { reopen: false }),
    (error) => error?.code === 'receipt_limit_exceeded',
  );
});

test('blocked dependency evidence is complete and remains derived as more blockers appear', () => {
  const plan = planWithWork([
    { id: 'a', execution: { retry: { maxAttempts: 1 } } },
    { id: 'b', execution: { retry: { maxAttempts: 1 } } },
    { id: 'c', dependencies: ['a', 'b'] },
  ]);
  const engine = new CaseEngine({ caseId: 'complete-blockers', plan });
  const a = engine.startAttempt('a', 'executor');
  engine.failAttempt(a.id, { code: 'a_failed', message: 'a failed' });
  assert.deepEqual(engine.taskStates.c.blockedBy, ['a']);

  const b = engine.startAttempt('b', 'executor');
  engine.failAttempt(b.id, { code: 'b_failed', message: 'b failed' });
  assert.deepEqual(engine.taskStates.c.blockedBy, ['a', 'b']);

  const incomplete = structuredClone(engine.snapshot());
  incomplete.taskStates.c.blockedBy = ['a'];
  assert.throws(
    () => CaseEngine.restore(redigestSnapshot(incomplete), { reopen: false }),
    (error) => error?.code === 'invariant_dependency',
  );
});
