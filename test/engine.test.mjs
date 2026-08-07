import test from 'node:test';
import assert from 'node:assert/strict';
import { ContractError } from '../src/canonical.mjs';
import { CaseEngine, definePlan } from '../src/engine.mjs';
import { planWithWork, resultFor } from './helpers.mjs';

test('plan is immutable and requires a single full-join Promotion', () => {
  const plan = planWithWork([{ id: 'a' }, { id: 'b' }]);
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.tasksById.a), true);
  assert.throws(
    () => definePlan({
      revisionId: 'bad',
      baseTree: {},
      tasks: [
        { id: 'a', kind: 'work', dependencies: [], claims: [] },
        { id: 'promote', kind: 'promotion', dependencies: [], claims: [{ mode: 'write', resource: 'canonical:tree' }] },
      ],
    }),
    (error) => error instanceof ContractError && error.code === 'promotion_dependencies',
  );
});

test('ordinary Task cannot claim canonical or remote mutation', () => {
  assert.throws(
    () => planWithWork([{ id: 'bad', claims: [{ mode: 'write', resource: 'canonical:tree' }] }]),
    (error) => error instanceof ContractError && error.code === 'forbidden_claim',
  );
});

test('one Task has at most one running Attempt', () => {
  const engine = new CaseEngine({ caseId: 'case-a', plan: planWithWork([{ id: 'a' }]) });
  engine.startAttempt('a', 'executor-a');
  assert.throws(
    () => engine.startAttempt('a', 'executor-b'),
    (error) => error instanceof ContractError && error.code === 'not_admissible',
  );
});

test('duplicate identical result is idempotent and contradictory duplicate is rejected', () => {
  const engine = new CaseEngine({ caseId: 'case-a', plan: planWithWork([{ id: 'a' }]) });
  const attempt = engine.startAttempt('a', 'executor-a');
  const result = resultFor(engine.plan.baseDigest, { id: 'a' });
  assert.deepEqual(engine.completeAttempt(attempt.id, result).deduplicated, false);
  assert.deepEqual(engine.completeAttempt(attempt.id, result).deduplicated, true);
  assert.throws(
    () => engine.completeAttempt(attempt.id, resultFor(engine.plan.baseDigest, { id: 'a' }, 'different')),
    (error) => error instanceof ContractError && error.code === 'duplicate_result_conflict',
  );
});

test('cancelled Attempt rejects a late success result', () => {
  const engine = new CaseEngine({ caseId: 'case-a', plan: planWithWork([{ id: 'a' }]) });
  const attempt = engine.startAttempt('a', 'executor-a');
  engine.cancelTask('a', 'operator cancellation');
  assert.throws(
    () => engine.completeAttempt(attempt.id, resultFor(engine.plan.baseDigest, { id: 'a' })),
    (error) => error instanceof ContractError && error.code === 'stale_attempt',
  );
});

test('snapshot reopen preserves interrupted evidence and permits a new result-only Attempt', () => {
  const engine = new CaseEngine({ caseId: 'case-a', plan: planWithWork([{ id: 'a' }]) });
  const first = engine.startAttempt('a', 'executor-a');
  const reopened = CaseEngine.restore(engine.snapshot());
  assert.equal(reopened.attempts[first.id].state, 'interrupted');
  assert.equal(reopened.taskStates.a.state, 'pending');
  const second = reopened.startAttempt('a', 'executor-b');
  assert.equal(second.ordinal, 2);
});

test('cycle and stale base digest are rejected', () => {
  assert.throws(
    () => definePlan({
      revisionId: 'cycle',
      baseTree: {},
      tasks: [
        { id: 'a', kind: 'work', dependencies: ['b'], claims: [] },
        { id: 'b', kind: 'work', dependencies: ['a'], claims: [] },
        { id: 'promote', kind: 'promotion', dependencies: ['a', 'b'], claims: [{ mode: 'write', resource: 'canonical:tree' }] },
      ],
    }),
    (error) => error instanceof ContractError && error.code === 'cycle',
  );

  const engine = new CaseEngine({ caseId: 'case-base', plan: planWithWork([{ id: 'a' }]) });
  const attempt = engine.startAttempt('a', 'executor-a');
  assert.throws(
    () => engine.completeAttempt(attempt.id, {
      kind: 'changeset',
      baseDigest: 'sha256:stale',
      writes: [{ path: 'a.txt', content: 'a' }],
    }),
    (error) => error instanceof ContractError && error.code === 'base_digest_mismatch',
  );
});

test('event semantics contain no wall-clock timestamp', () => {
  const engine = new CaseEngine({ caseId: 'case-events', plan: planWithWork([{ id: 'a' }]) });
  engine.startAttempt('a', 'executor-a');
  assert.equal(engine.snapshot().events.every((event) => !Object.hasOwn(event, 'timestamp')), true);
});

test('committed records stay frozen behind stable read-only collection views', () => {
  const engine = new CaseEngine({ caseId: 'case-frozen-frontier', plan: planWithWork([{ id: 'a' }]) });
  const taskStatesView = engine.taskStates;
  const attemptsView = engine.attempts;
  const eventsView = engine.events;
  assert.equal(Object.isFrozen(engine.taskStates.a), true);

  const attempt = engine.startAttempt('a', 'executor-a');
  assert.equal(engine.taskStates, taskStatesView);
  assert.equal(engine.attempts, attemptsView);
  assert.equal(engine.events, eventsView);
  assert.equal(Object.isFrozen(engine.taskStates.a), true);
  assert.equal(Object.isFrozen(engine.attempts[attempt.id]), true);
  assert.throws(() => {
    engine.taskStates.a.state = 'succeeded';
  }, TypeError);
  assert.throws(() => {
    engine.taskStates.a = { state: 'succeeded' };
  }, TypeError);
  assert.throws(() => {
    engine.events.push({ type: 'forged' });
  }, TypeError);
});

test('incrementally validated live state round-trips through a full restore validation', () => {
  const engine = new CaseEngine({ caseId: 'case-frontier-roundtrip', plan: planWithWork([{ id: 'a' }, { id: 'b' }]) });
  const a = engine.startAttempt('a', 'executor-a');
  engine.completeAttempt(a.id, resultFor(engine.plan.baseDigest, { id: 'a' }, 'A'));
  const b = engine.startAttempt('b', 'executor-b');
  engine.completeAttempt(b.id, resultFor(engine.plan.baseDigest, { id: 'b' }, 'B'));

  const liveSnapshot = engine.snapshot();
  const restored = CaseEngine.restore(liveSnapshot, { reopen: false });
  assert.deepEqual(restored.snapshot(), liveSnapshot);
});


test('discarded acceleration indexes rebuild without changing authoritative Case state', () => {
  const engine = new CaseEngine({
    caseId: 'case-index-rebuild',
    plan: planWithWork([
      { id: 'a' },
      { id: 'b', dependencies: ['a'] },
      { id: 'c' },
    ]),
  });
  engine.startAttempt('a', 'executor-a');
  const authoritativeSnapshot = engine.snapshot();
  const expectedReady = engine.readyTaskIds();
  const expectedClaimHolders = engine.claimHoldingTaskIds();

  engine._readyTaskIdSet = new Set(['b']);
  engine._claimHoldingTaskIdSet = new Set();
  engine._taskStateCounts = Object.assign(Object.create(null), {
    pending: 0,
    running: 0,
    reconciling: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0,
    denied: 0,
    blocked: 0,
    unverified: 0,
  });
  engine._unsatisfiedDependencyCounts = Object.assign(Object.create(null), {
    a: 99,
    b: 0,
    c: 99,
    promote: 0,
  });

  // Admission remains authoritative even while the disposable candidate index is wrong.
  assert.equal(engine.admissionDecision('b').reason, 'dependencies');
  engine.reconcile();

  assert.deepEqual(engine.snapshot(), authoritativeSnapshot);
  assert.deepEqual(engine.readyTaskIds(), expectedReady);
  assert.deepEqual(engine.claimHoldingTaskIds(), expectedClaimHolders);
  assert.equal(engine.isTaskReady('b'), false);
});


test('blocked propagation follows graph topology rather than lexical Task order', () => {
  const engine = new CaseEngine({
    caseId: 'case-nontopological-ids',
    plan: planWithWork([
      { id: 'z-root' },
      { id: 'y-middle', dependencies: ['z-root'] },
      { id: 'a-leaf', dependencies: ['y-middle'] },
    ]),
  });

  assert.equal(engine.cancelTask('z-root', 'stop root'), true);
  assert.equal(engine.taskStates['z-root'].state, 'cancelled');
  assert.equal(engine.taskStates['y-middle'].state, 'blocked');
  assert.deepEqual(engine.taskStates['y-middle'].blockedBy, ['z-root']);
  assert.equal(engine.taskStates['a-leaf'].state, 'blocked');
  assert.deepEqual(engine.taskStates['a-leaf'].blockedBy, ['y-middle']);
  assert.equal(engine.taskStates.promote.state, 'blocked');
  assert.equal(engine.caseState, 'cancelled');
  assert.deepEqual(CaseEngine.restore(engine.snapshot(), { reopen: false }).snapshot(), engine.snapshot());
});
