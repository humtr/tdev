import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson } from '../src/canonical.mjs';
import { ClaimLedger } from '../src/claim-ledger.mjs';
import { CaseEngine, definePlan } from '../src/engine.mjs';
import { runDurableCase } from '../src/durable-runner.mjs';
import { CaseRepository } from '../src/repository.mjs';
import { MemorySnapshotStore } from '../src/store.mjs';
import { planWithWork, resultFor } from './helpers.mjs';

function effectPlan(effectClass = 'reconcilable-external', maxAttempts = 3) {
  return definePlan({
    revisionId: `${effectClass}-durable-v1`,
    baseTree: {},
    tasks: [
      {
        id: 'effect',
        kind: 'work',
        dependencies: [],
        claims: [{ mode: 'execute', resource: 'remote:origin/main' }],
        input: {},
        execution: {
          operation: 'remote.apply',
          resultKind: 'effect-receipt',
          effectClass,
          retry: { maxAttempts },
        },
      },
      {
        id: 'promote',
        kind: 'promotion',
        dependencies: ['effect'],
        claims: [{ mode: 'write', resource: 'canonical:tree' }],
        input: {},
      },
    ],
  });
}

const SMALL_EFFECT_CONTRACT = {
  limits: { maxEvidenceBytes: 4_096, maxErrorMessageBytes: 4_096 },
};

function effectReceipt({ effectKey, task }, receipt = { applied: true }) {
  return {
    kind: 'effect-receipt',
    effectKey,
    operation: task.execution.operation,
    outcome: 'applied',
    receipt,
  };
}

class BoundedMemorySnapshotStore extends MemorySnapshotStore {
  constructor(maxBytes) {
    super();
    this.maxBytes = maxBytes;
  }

  assertSnapshotCapacity(snapshot) {
    const size = Buffer.byteLength(canonicalJson(snapshot), 'utf8');
    if (size > this.maxBytes) {
      const error = new Error(`snapshot ${size} exceeds ${this.maxBytes}`);
      error.code = 'store_snapshot_too_large';
      error.details = { size, limit: this.maxBytes };
      throw error;
    }
    return { size, limit: this.maxBytes };
  }
}

class CapacityUnknownStore {
  constructor() {
    this.inner = new MemorySnapshotStore();
  }

  create(snapshot) { return this.inner.create(snapshot); }
  load(caseId) { return this.inner.load(caseId); }
  compareAndSwap(caseId, expectedRevision, snapshot) {
    return this.inner.compareAndSwap(caseId, expectedRevision, snapshot);
  }
}

test('durable runner checkpoints a running Attempt before invoking its executor', async () => {
  const store = new MemorySnapshotStore();
  const repository = new CaseRepository(store);
  const plan = planWithWork([{ id: 'a' }]);
  await repository.create({ caseId: 'durable-dispatch-case', plan });

  let observedRevision = null;
  const result = await runDurableCase(
    repository,
    'durable-dispatch-case',
    async ({ baseDigest, task, attempt }) => {
      const stored = await store.load('durable-dispatch-case');
      observedRevision = stored.caseRevision;
      assert.equal(stored.taskStates.a.state, 'running');
      assert.equal(stored.attempts[attempt.id].state, 'running');
      assert.equal(stored.attempts[attempt.id].fencingToken, attempt.fencingToken);
      return resultFor(baseDigest, task);
    },
  );

  assert.equal(result.caseState, 'succeeded');
  assert.ok(observedRevision < result.persistedRevision);
  const stored = await store.load('durable-dispatch-case');
  assert.equal(stored.caseState, 'succeeded');
  assert.equal(stored.caseRevision, result.persistedRevision);
  assert.equal(stored.snapshotDigest, result.snapshot.snapshotDigest);
});

test('checkpoint CAS conflict prevents executor dispatch', async () => {
  const store = new MemorySnapshotStore();
  const repository = new CaseRepository(store);
  const plan = planWithWork([{ id: 'a' }]);
  await repository.create({ caseId: 'durable-conflict-case', plan });

  const compareAndSwap = store.compareAndSwap.bind(store);
  let blockNextCheckpoint = true;
  store.compareAndSwap = async (...args) => {
    if (blockNextCheckpoint) {
      blockNextCheckpoint = false;
      const error = new Error('simulated competing owner');
      error.code = 'store_revision_conflict';
      throw error;
    }
    return compareAndSwap(...args);
  };

  let executorCalls = 0;
  await assert.rejects(
    runDurableCase(repository, 'durable-conflict-case', async () => {
      executorCalls += 1;
      throw new Error('must not run');
    }),
    (error) => error?.code === 'store_revision_conflict',
  );
  assert.equal(executorCalls, 0);
  const stored = await store.load('durable-conflict-case');
  assert.equal(stored.taskStates.a.state, 'pending');
  assert.deepEqual(stored.attempts, {});
});

test('durable runner reopens interrupted result-only work and persists its replacement Attempt', async () => {
  const store = new MemorySnapshotStore();
  const repository = new CaseRepository(store);
  const plan = planWithWork([{ id: 'a' }]);
  const initial = new CaseEngine({ caseId: 'durable-reopen-case', plan });
  initial.startAttempt('a', { id: 'lost-executor', epoch: 3 });
  await store.create(initial.snapshot());

  const result = await runDurableCase(
    repository,
    'durable-reopen-case',
    async ({ baseDigest, task, attempt }) => {
      assert.equal(attempt.id, 'a.2');
      return resultFor(baseDigest, task, 'recovered');
    },
  );

  assert.equal(result.caseState, 'succeeded');
  assert.equal(result.snapshot.attempts['a.1'].state, 'interrupted');
  assert.equal(result.snapshot.attempts['a.2'].state, 'succeeded');
  const stored = await store.load('durable-reopen-case');
  assert.equal(stored.caseState, 'succeeded');
  assert.equal(stored.attempts['a.1'].state, 'interrupted');
});

test('durable runner rejects unknown options and missing Cases before dispatch', async () => {
  const store = new MemorySnapshotStore();
  const repository = new CaseRepository(store);
  let executorCalls = 0;
  await assert.rejects(
    runDurableCase(repository, 'missing-case', async () => { executorCalls += 1; }),
    (error) => error?.code === 'case_not_found',
  );
  await assert.rejects(
    runDurableCase(repository, 'missing-case', async () => {}, { checkpoint: async () => {} }),
    (error) => error?.code === 'unexpected_keys',
  );
  assert.equal(executorCalls, 0);
});

test('external-effect capacity admission rejects before dispatch and releases its Claim', async () => {
  const caseId = 'durable-capacity-effect';
  const plan = effectPlan('reconcilable-external', 1);
  const sizingLedger = new ClaimLedger();
  const sizingEngine = new CaseEngine({ caseId, plan, caseContract: SMALL_EFFECT_CONTRACT });
  const sizingLease = sizingLedger.tryAcquire({
    caseId,
    taskId: 'effect',
    attemptId: 'effect.1',
    claims: plan.tasksById.effect.claims,
  }).lease;
  sizingEngine.startAttempt('effect', 'executor', {
    claimLease: sizingLease,
    claimValidator: sizingLedger,
  });
  const runningBytes = Buffer.byteLength(canonicalJson(sizingEngine.snapshot()), 'utf8');
  sizingLedger.release(sizingLease);

  const store = new BoundedMemorySnapshotStore(runningBytes + 1024);
  const repository = new CaseRepository(store);
  await repository.create({ caseId, plan, caseContract: SMALL_EFFECT_CONTRACT });
  const ledger = new ClaimLedger();
  let executorCalls = 0;

  await assert.rejects(
    runDurableCase(repository, caseId, async () => {
      executorCalls += 1;
      throw new Error('external executor must not run');
    }, { claimLedger: ledger }),
    (error) => error?.code === 'store_snapshot_too_large',
  );

  assert.equal(executorCalls, 0);
  assert.equal(ledger.activeLeases().length, 0);
  const stored = await store.load(caseId);
  assert.equal(stored.taskStates.effect.state, 'pending');
  assert.deepEqual(stored.attempts, {});
});

test('external-effect dispatch fails closed when store capacity is unknown', async () => {
  const caseId = 'durable-capacity-unknown';
  const plan = effectPlan('idempotent-external', 2);
  const store = new CapacityUnknownStore();
  const repository = new CaseRepository(store);
  await repository.create({ caseId, plan, caseContract: SMALL_EFFECT_CONTRACT });
  let executorCalls = 0;

  await assert.rejects(
    runDurableCase(repository, caseId, async () => {
      executorCalls += 1;
      throw new Error('external executor must not run');
    }),
    (error) => error?.code === 'store_capacity_unknown',
  );
  assert.equal(executorCalls, 0);
  const stored = await store.load(caseId);
  assert.equal(stored.taskStates.effect.state, 'pending');
  assert.deepEqual(stored.attempts, {});
});

test('failed external settlement checkpoint keeps lease until durable reopen can retry', async () => {
  const caseId = 'durable-settlement-reopen';
  const plan = effectPlan('idempotent-external', 2);
  const store = new MemorySnapshotStore();
  const repository = new CaseRepository(store);
  await repository.create({ caseId, plan, caseContract: SMALL_EFFECT_CONTRACT });
  const ledger = new ClaimLedger();
  const compareAndSwap = store.compareAndSwap.bind(store);
  let injectSettlementFailure = true;
  store.compareAndSwap = async (storedCaseId, expectedRevision, snapshot) => {
    if (injectSettlementFailure && snapshot.attempts['effect.1']?.state === 'succeeded') {
      injectSettlementFailure = false;
      const error = new Error('injected settlement checkpoint failure');
      error.code = 'settlement_checkpoint_failed';
      throw error;
    }
    return compareAndSwap(storedCaseId, expectedRevision, snapshot);
  };

  await assert.rejects(
    runDurableCase(repository, caseId, async (input) => effectReceipt(input), { claimLedger: ledger }),
    (error) => error?.code === 'settlement_checkpoint_failed',
  );
  assert.equal(ledger.activeLeases().length, 1);
  const predecessor = await store.load(caseId);
  assert.equal(predecessor.attempts['effect.1'].state, 'running');

  store.compareAndSwap = compareAndSwap;
  let retryCalls = 0;
  const recovered = await runDurableCase(repository, caseId, async (input) => {
    retryCalls += 1;
    assert.equal(input.attempt.id, 'effect.2');
    return effectReceipt(input, { recovered: true });
  }, { claimLedger: ledger });

  assert.equal(retryCalls, 1);
  assert.equal(recovered.caseState, 'succeeded');
  assert.equal(recovered.snapshot.attempts['effect.1'].state, 'interrupted');
  assert.equal(recovered.snapshot.attempts['effect.2'].state, 'succeeded');
  assert.equal(ledger.activeLeases().length, 0);
});

test('failed reconcilable settlement checkpoint preserves lease through durable reopen', async () => {
  const caseId = 'durable-settlement-reconciling';
  const plan = effectPlan('reconcilable-external', 1);
  const store = new MemorySnapshotStore();
  const repository = new CaseRepository(store);
  await repository.create({ caseId, plan, caseContract: SMALL_EFFECT_CONTRACT });
  const ledger = new ClaimLedger();
  const compareAndSwap = store.compareAndSwap.bind(store);
  let injectSettlementFailure = true;
  store.compareAndSwap = async (storedCaseId, expectedRevision, snapshot) => {
    if (injectSettlementFailure && snapshot.attempts['effect.1']?.state === 'succeeded') {
      injectSettlementFailure = false;
      const error = new Error('injected settlement checkpoint failure');
      error.code = 'settlement_checkpoint_failed';
      throw error;
    }
    return compareAndSwap(storedCaseId, expectedRevision, snapshot);
  };

  await assert.rejects(
    runDurableCase(repository, caseId, async (input) => effectReceipt(input), { claimLedger: ledger }),
    (error) => error?.code === 'settlement_checkpoint_failed',
  );
  assert.equal(ledger.activeLeases().length, 1);
  const predecessor = await store.load(caseId);
  assert.equal(predecessor.attempts['effect.1'].state, 'running');

  store.compareAndSwap = compareAndSwap;
  let executorCalls = 0;
  const reopened = await runDurableCase(repository, caseId, async () => {
    executorCalls += 1;
    throw new Error('reconciling Case must not redispatch');
  }, { claimLedger: ledger });

  assert.equal(executorCalls, 0);
  assert.equal(reopened.status, 'reconciliation_required');
  assert.equal(reopened.snapshot.attempts['effect.1'].state, 'reconciling');
  assert.equal(ledger.activeLeases().length, 1);
});
