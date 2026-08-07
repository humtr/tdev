import test from 'node:test';
import assert from 'node:assert/strict';
import { ClaimLedger } from '../src/claim-ledger.mjs';
import { typedDigest } from '../src/canonical.mjs';
import { CaseEngine } from '../src/engine.mjs';
import { CaseRepository } from '../src/repository.mjs';
import { runCase } from '../src/runner.mjs';
import { MemorySnapshotStore } from '../src/store.mjs';
import { planWithWork } from './helpers.mjs';

function claimPlan(resource, path) {
  return planWithWork([{
    id: 'work',
    claims: [{ mode: 'write', resource }],
    input: { path },
  }]);
}

test('ClaimLedger generations fence released and replaced holders', () => {
  const ledger = new ClaimLedger();
  const first = ledger.tryAcquire({
    caseId: 'case-a', taskId: 'task', attemptId: 'task.1',
    claims: [{ mode: 'write', resource: 'repository:shared/**' }],
  });
  assert.equal(first.acquired, true);
  assert.equal(ledger.validate(first.lease), true);
  assert.equal(ledger.release({ ...first.lease, generation: first.lease.generation + 1 }), false);
  assert.equal(ledger.validate(first.lease), true);
  assert.equal(ledger.release(first.lease), true);
  assert.equal(ledger.release(first.lease), false);
  assert.equal(ledger.validate(first.lease), false);

  const second = ledger.tryAcquire({
    caseId: 'case-b', taskId: 'task', attemptId: 'task.1',
    claims: [{ mode: 'write', resource: 'repository:shared/file' }],
  });
  assert.equal(second.acquired, true);
  assert.ok(second.lease.generation > first.lease.generation);
  assert.notEqual(second.lease.token, first.lease.token);
  assert.equal(ledger.validate(first.lease), false);

  const restored = ClaimLedger.restore(ledger.snapshot());
  assert.equal(restored.validate(second.lease), true);
});

test('cross-Case conflicting claims serialize while disjoint targets overlap', async () => {
  async function measure(resources) {
    const ledger = new ClaimLedger();
    const metrics = { active: 0, max: 0 };
    const execute = async ({ baseDigest, task, caseId }) => {
      metrics.active += 1;
      metrics.max = Math.max(metrics.max, metrics.active);
      await new Promise((resolve) => setImmediate(resolve));
      metrics.active -= 1;
      return { kind: 'changeset', baseDigest, writes: [{ path: task.input.path, content: caseId }] };
    };
    const runs = resources.map((resource, index) => runCase(
      new CaseEngine({ caseId: `case-${index}`, plan: claimPlan(resource, `case-${index}.txt`) }),
      execute,
      { capacity: 1, claimLedger: ledger },
    ));
    const results = await Promise.all(runs);
    assert.ok(results.every((result) => result.caseState === 'succeeded'));
    assert.equal(ledger.activeLeases().length, 0);
    return metrics.max;
  }

  assert.equal(await measure(['repository:shared/**', 'repository:shared/file']), 1);
  assert.equal(await measure(['repository:left/**', 'repository:right/**']), 2);
});

test('released claim lease prevents a stale result from committing', () => {
  const ledger = new ClaimLedger();
  const plan = claimPlan('repository:shared/**', 'a.txt');
  const engine = new CaseEngine({ caseId: 'stale-lease-case', plan });
  const acquired = ledger.tryAcquire({
    caseId: engine.caseId, taskId: 'work', attemptId: 'work.1',
    claims: plan.tasksById.work.claims,
  });
  assert.throws(
    () => engine.startAttempt('work', 'executor', { claimLease: acquired.lease }),
    (error) => error?.code === 'claim_validation_required',
  );
  assert.equal(engine.taskStates.work.state, 'pending');
  const attempt = engine.startAttempt('work', 'executor', {
    claimLease: acquired.lease,
    claimValidator: ledger,
  });
  assert.throws(() => engine.completeAttempt(attempt.id, {
    kind: 'changeset', baseDigest: plan.baseDigest, writes: [{ path: 'a.txt', content: 'x' }],
  }), (error) => error?.code === 'claim_validation_required');
  assert.equal(engine.attempts[attempt.id].state, 'running');
  ledger.release(acquired.lease);
  assert.throws(() => engine.completeAttempt(attempt.id, {
    kind: 'changeset', baseDigest: plan.baseDigest, writes: [{ path: 'a.txt', content: 'x' }],
  }, { claimValidator: ledger }), (error) => error?.code === 'stale_claim_lease');
  assert.equal(engine.attempts[attempt.id].state, 'running');
});


test('ClaimLedger restore rejects re-digested semantic corruption', () => {
  const ledger = new ClaimLedger();
  ledger.tryAcquire({
    caseId: 'case-a', taskId: 'task', attemptId: 'task.1',
    claims: [{ mode: 'write', resource: 'repository:left/**' }],
  });
  ledger.tryAcquire({
    caseId: 'case-b', taskId: 'task', attemptId: 'task.1',
    claims: [{ mode: 'write', resource: 'repository:right/**' }],
  });

  const outOfOrder = structuredClone(ledger.snapshot());
  outOfOrder.leases.reverse();
  delete outOfOrder.snapshotDigest;
  outOfOrder.snapshotDigest = typedDigest('tdev.claim-ledger-snapshot.v1', outOfOrder);
  assert.throws(
    () => ClaimLedger.restore(outOfOrder),
    (error) => error?.code === 'claim_ledger_order',
  );

  const invalidRevision = structuredClone(ledger.snapshot());
  invalidRevision.revision = 1;
  delete invalidRevision.snapshotDigest;
  invalidRevision.snapshotDigest = typedDigest('tdev.claim-ledger-snapshot.v1', invalidRevision);
  assert.throws(
    () => ClaimLedger.restore(invalidRevision),
    (error) => error?.code === 'claim_ledger_revision',
  );
});

test('ClaimLedger waiters resolve on revision change and abort without leaking', async () => {
  const ledger = new ClaimLedger();
  const changed = ledger.waitForChange(0);
  ledger.tryAcquire({
    caseId: 'wait-case', taskId: 'task', attemptId: 'task.1',
    claims: [{ mode: 'read', resource: 'repository:wait' }],
  });
  assert.equal(await changed, 1);

  const controller = new AbortController();
  const aborted = ledger.waitForChange(ledger.revision, { signal: controller.signal });
  controller.abort(new Error('stop waiting'));
  await assert.rejects(aborted, /stop waiting/);
  assert.equal(ledger.waiters.size, 0);
});

test('repository commands require live ClaimLedger validation at start and result commit', async () => {
  const ledger = new ClaimLedger();
  const plan = claimPlan('repository:shared/**', 'a.txt');
  const repository = new CaseRepository(new MemorySnapshotStore());
  const created = await repository.create({ caseId: 'command-lease-case', plan });
  const acquired = ledger.tryAcquire({
    caseId: created.caseId, taskId: 'work', attemptId: 'work.1',
    claims: plan.tasksById.work.claims,
  });
  const startCommand = {
    requestId: 'lease-start',
    command: {
      type: 'start_attempt', taskId: 'work', executor: 'executor', claimLease: acquired.lease,
    },
  };

  await assert.rejects(
    repository.command(created.caseId, startCommand),
    (error) => error?.code === 'claim_validation_required',
  );
  assert.equal((await repository.load(created.caseId)).taskStates.work.state, 'pending');

  const started = await repository.command(created.caseId, startCommand, { claimValidator: ledger });
  const attempt = started.result.response;
  const envelope = started.engine.resultEnvelope(attempt.id, {
    kind: 'changeset', baseDigest: plan.baseDigest, writes: [{ path: 'a.txt', content: 'x' }],
  });
  const resultCommand = {
    requestId: 'lease-result',
    command: { type: 'accept_result', envelope },
  };
  await assert.rejects(
    repository.command(created.caseId, resultCommand),
    (error) => error?.code === 'claim_validation_required',
  );
  const completed = await repository.command(created.caseId, resultCommand, { claimValidator: ledger });
  assert.equal(completed.engine.taskStates.work.state, 'succeeded');
});

test('an accepted leased result remains idempotent after lease release', () => {
  const ledger = new ClaimLedger();
  const plan = claimPlan('repository:shared/**', 'a.txt');
  const engine = new CaseEngine({ caseId: 'lease-replay-case', plan });
  const acquired = ledger.tryAcquire({
    caseId: engine.caseId,
    taskId: 'work',
    attemptId: 'work.1',
    claims: plan.tasksById.work.claims,
  });
  const attempt = engine.startAttempt('work', 'executor', {
    claimLease: acquired.lease,
    claimValidator: ledger,
  });
  const result = {
    kind: 'changeset',
    baseDigest: plan.baseDigest,
    writes: [{ path: 'a.txt', content: 'accepted' }],
  };
  const envelope = engine.resultEnvelope(attempt.id, result);

  assert.equal(engine.acceptResult(envelope, { claimValidator: ledger }).deduplicated, false);
  assert.equal(ledger.release(acquired.lease), true);
  const revision = engine.caseRevision;
  assert.equal(engine.acceptResult(envelope).deduplicated, true);
  assert.equal(engine.caseRevision, revision);

  const contradictory = structuredClone(envelope);
  contradictory.result.writes[0].content = 'different';
  assert.throws(
    () => engine.acceptResult(contradictory),
    (error) => error?.code === 'duplicate_result_conflict',
  );
  assert.equal(engine.caseRevision, revision);
});

test('a current lease cannot substitute a weaker or unrelated claim scope', () => {
  const ledger = new ClaimLedger();
  const plan = claimPlan('repository:shared/**', 'a.txt');
  const engine = new CaseEngine({ caseId: 'lease-scope-case', plan });
  const weak = ledger.tryAcquire({
    caseId: engine.caseId,
    taskId: 'work',
    attemptId: 'work.1',
    claims: [],
  });
  const initialRevision = engine.caseRevision;

  assert.equal(ledger.validate(weak.lease), true);
  assert.throws(
    () => engine.startAttempt('work', 'executor', {
      claimLease: weak.lease,
      claimValidator: ledger,
    }),
    (error) => error?.code === 'claim_lease_scope' && error?.details?.missing?.length === 1,
  );
  assert.equal(engine.taskStates.work.state, 'pending');
  assert.equal(engine.caseRevision, initialRevision);

  assert.equal(ledger.release(weak.lease), true);
  const exact = ledger.tryAcquire({
    caseId: engine.caseId,
    taskId: 'work',
    attemptId: 'work.1',
    claims: plan.tasksById.work.claims,
  });
  const attempt = engine.startAttempt('work', 'executor', {
    claimLease: exact.lease,
    claimValidator: ledger,
  });
  assert.deepEqual(
    attempt.claimLease.claims.map(({ mode, resource }) => ({ mode, resource })),
    plan.tasksById.work.claims,
  );
  assert.equal(attempt.claimLease.claimsDigest, exact.lease.claimsDigest);
});

test('runner claim customization can add coordination but cannot suppress mandatory global claims', async () => {
  const ledger = new ClaimLedger();
  const plan = planWithWork([{
    id: 'work',
    claims: [
      { mode: 'write', resource: 'candidate:local/**' },
      { mode: 'read', resource: 'repository:shared/**' },
    ],
    input: { path: 'a.txt' },
  }]);
  let observedLease;
  const result = await runCase(
    new CaseEngine({ caseId: 'additive-claim-policy', plan }),
    async ({ baseDigest, claimLease }) => {
      observedLease = claimLease;
      return {
        kind: 'changeset',
        baseDigest,
        writes: [{ path: 'a.txt', content: 'x' }],
      };
    },
    {
      claimLedger: ledger,
      globalClaimPredicate: (claim) => claim.resource.startsWith('candidate:'),
    },
  );

  assert.equal(result.caseState, 'succeeded');
  assert.deepEqual(observedLease.claims, plan.tasksById.work.claims);
  assert.equal(ledger.activeLeases().length, 0);
});

test('claim validation is synchronous and cannot be bypassed with a Promise', () => {
  const ledger = new ClaimLedger();
  const plan = claimPlan('repository:shared/**', 'a.txt');
  const engine = new CaseEngine({ caseId: 'async-validator-case', plan });
  const acquired = ledger.tryAcquire({
    caseId: engine.caseId,
    taskId: 'work',
    attemptId: 'work.1',
    claims: plan.tasksById.work.claims,
  });
  const revision = engine.caseRevision;

  assert.throws(
    () => engine.startAttempt('work', 'executor', {
      claimLease: acquired.lease,
      claimValidator: async () => false,
    }),
    (error) => error?.code === 'invalid_claim_validator_result',
  );
  assert.equal(engine.caseRevision, revision);
  assert.equal(engine.taskStates.work.state, 'pending');
});

test('Case and ClaimLedger claim bounds remain aligned above the default limit', async () => {
  const claims = Array.from({ length: 129 }, (_, index) => ({
    mode: 'read',
    resource: `repository:scope-${String(index).padStart(3, '0')}`,
  }));
  const engine = new CaseEngine({
    caseId: 'extended-claim-bound',
    plan: {
      revisionId: 'extended-claim-bound-v1',
      baseTree: {},
      tasks: [
        { id: 'work', kind: 'work', dependencies: [], claims, input: { path: 'a.txt' } },
        {
          id: 'promote',
          kind: 'promotion',
          dependencies: ['work'],
          claims: [{ mode: 'write', resource: 'canonical:tree' }],
          input: {},
        },
      ],
    },
    caseContract: { limits: { maxClaimsPerTask: 129 } },
  });
  const ledger = new ClaimLedger({ maxClaimsPerLease: 129 });
  let observedCount = 0;
  const result = await runCase(engine, async ({ baseDigest, claimLease }) => {
    observedCount = claimLease.claims.length;
    return {
      kind: 'changeset',
      baseDigest,
      writes: [{ path: 'a.txt', content: 'x' }],
    };
  }, { claimLedger: ledger });

  assert.equal(result.caseState, 'succeeded');
  assert.equal(observedCount, 129);
});
