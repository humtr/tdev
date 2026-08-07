import test from 'node:test';
import assert from 'node:assert/strict';
import { CaseEngine } from '../src/engine.mjs';
import { runDurableCase } from '../src/durable-runner.mjs';
import { CaseRepository } from '../src/repository.mjs';
import { MemorySnapshotStore } from '../src/store.mjs';
import { planWithWork, resultFor } from './helpers.mjs';

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
