import test from 'node:test';
import assert from 'node:assert/strict';
import { CaseEngine } from '../src/engine.mjs';
import { runDurableCase } from '../src/durable-runner.mjs';
import { CaseRepository } from '../src/repository.mjs';
import { MemorySnapshotStore } from '../src/store.mjs';
import { planWithWork, resultFor } from './helpers.mjs';

function modelError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

class SerializedCaseDoAuthorityModel {
  constructor(store) {
    this.store = store;
    this.repository = new CaseRepository(store);
    this.tail = Promise.resolve();
  }

  #serialize(operation) {
    const result = this.tail.then(operation);
    this.tail = result.catch(() => {});
    return result;
  }

  command(caseId, envelope, options = {}) {
    return this.#serialize(async () => {
      if (options.failBeforeCommit === true) throw modelError('model_precommit_failure');
      const committed = await this.repository.command(caseId, envelope);
      if (options.loseResponseAfterCommit === true) throw modelError('model_response_lost');
      return committed;
    });
  }

  reconstruct(caseId) {
    return this.#serialize(() => this.repository.load(caseId));
  }

  recoverAfterExecutionOwnerLoss(caseId) {
    return this.#serialize(() => this.repository.load(caseId, { reopen: true }));
  }
}

function placementIdentity(placement) {
  return JSON.stringify([
    placement.environment,
    placement.scriptName,
    placement.className,
    placement.namespace,
    placement.jurisdiction,
    placement.durableObjectId,
  ]);
}

class CasePlacementAuthorityModel {
  constructor() {
    this.records = new Map();
  }

  elect(caseId, placement) {
    const identity = placementIdentity(placement);
    const existing = this.records.get(caseId);
    if (existing) {
      if (existing.identity !== identity) throw modelError('placement_conflict');
      return structuredClone(existing.record);
    }
    const record = { caseId, placementGeneration: 1, placement: structuredClone(placement) };
    this.records.set(caseId, { identity, record: structuredClone(record) });
    return structuredClone(record);
  }
}

async function createCase(caseId, tasks = [{ id: 'a' }]) {
  const store = new MemorySnapshotStore();
  const repository = new CaseRepository(store);
  const plan = planWithWork(tasks);
  await repository.create({ caseId, plan });
  return { store, repository, plan };
}

test('D0019 model: response loss after commit reconciles by durable receipt replay after eviction', async () => {
  const caseId = 'd0019-response-loss';
  const { store } = await createCase(caseId);
  const before = await store.load(caseId);
  const command = {
    requestId: 'request-1',
    expectedCaseRevision: before.caseRevision,
    command: { type: 'start_attempt', taskId: 'a', executor: 'agent' },
  };
  const firstInstance = new SerializedCaseDoAuthorityModel(store);

  await assert.rejects(
    firstInstance.command(caseId, command, { loseResponseAfterCommit: true }),
    (error) => error?.code === 'model_response_lost',
  );

  const committed = await store.load(caseId);
  assert.ok(committed.caseRevision > before.caseRevision);
  assert.equal(committed.receipts['request-1'].requestId, 'request-1');

  const reconstructedInstance = new SerializedCaseDoAuthorityModel(store);
  const replay = await reconstructedInstance.command(caseId, command);
  assert.equal(replay.persisted, false);
  assert.equal(replay.result.deduplicated, true);
  assert.deepEqual(replay.result.response, committed.receipts['request-1'].response);
  assert.equal((await store.load(caseId)).caseRevision, committed.caseRevision);
});

test('D0019 model: receipt identity excludes expected revision and replays the exact semantic response', async () => {
  const caseId = 'd0019-receipt-envelope';
  const { store } = await createCase(caseId);
  const initial = await store.load(caseId);
  const authority = new SerializedCaseDoAuthorityModel(store);
  const command = { type: 'start_attempt', taskId: 'a', executor: 'agent' };

  const first = await authority.command(caseId, {
    requestId: 'receipt-envelope-1',
    expectedCaseRevision: initial.caseRevision,
    command,
  });
  const committed = await store.load(caseId);
  assert.ok(committed.caseRevision > initial.caseRevision);

  const replay = await authority.command(caseId, {
    requestId: 'receipt-envelope-1',
    expectedCaseRevision: committed.caseRevision,
    command,
  });
  assert.equal(replay.persisted, false);
  assert.equal(replay.result.deduplicated, true);
  assert.deepEqual(replay.result.response, first.result.response);
  assert.deepEqual(replay.result.response, committed.receipts['receipt-envelope-1'].response);
  assert.equal((await store.load(caseId)).caseRevision, committed.caseRevision);
});

test('D0019 model: same expected revision under concurrent admission has exactly one winner', async () => {
  const caseId = 'd0019-concurrent';
  const { store } = await createCase(caseId);
  const initial = await store.load(caseId);
  const authority = new SerializedCaseDoAuthorityModel(store);

  const [first, second] = await Promise.allSettled([
    authority.command(caseId, {
      requestId: 'concurrent-1',
      expectedCaseRevision: initial.caseRevision,
      command: { type: 'start_attempt', taskId: 'a', executor: 'agent' },
    }),
    authority.command(caseId, {
      requestId: 'concurrent-2',
      expectedCaseRevision: initial.caseRevision,
      command: { type: 'cancel_task', taskId: 'a', reason: 'racing command' },
    }),
  ]);

  assert.equal(first.status, 'fulfilled');
  assert.equal(second.status, 'rejected');
  assert.equal(second.reason?.code, 'revision_conflict');
  const stored = await store.load(caseId);
  assert.equal(stored.receipts['concurrent-1'].requestId, 'concurrent-1');
  assert.equal(stored.receipts['concurrent-2'], undefined);
});

test('D0019 model: failure before commit leaves no receipt and a same-id retry may commit', async () => {
  const caseId = 'd0019-precommit';
  const { store } = await createCase(caseId);
  const before = await store.load(caseId);
  const command = {
    requestId: 'precommit-1',
    expectedCaseRevision: before.caseRevision,
    command: { type: 'start_attempt', taskId: 'a', executor: 'agent' },
  };
  const authority = new SerializedCaseDoAuthorityModel(store);

  await assert.rejects(
    authority.command(caseId, command, { failBeforeCommit: true }),
    (error) => error?.code === 'model_precommit_failure',
  );
  const untouched = await store.load(caseId);
  assert.equal(untouched.caseRevision, before.caseRevision);
  assert.equal(untouched.receipts['precommit-1'], undefined);

  const retry = await authority.command(caseId, command);
  assert.equal(retry.result.deduplicated, false);
  assert.ok((await store.load(caseId)).caseRevision > before.caseRevision);
});

test('D0019 model: ordinary CaseDO reconstruction does not semantically reopen a live Attempt', async () => {
  const caseId = 'd0019-eviction-no-reopen';
  const { store, plan } = await createCase(caseId);
  const engine = new CaseEngine({ caseId, plan });
  const attempt = engine.startAttempt('a', { id: 'live-agent', epoch: 4 });
  store.snapshots.set(caseId, structuredClone(engine.snapshot()));
  const before = await store.load(caseId);

  const reconstructedInstance = new SerializedCaseDoAuthorityModel(store);
  const reconstructed = await reconstructedInstance.reconstruct(caseId);
  assert.equal(reconstructed.attempts[attempt.id].state, 'running');
  assert.equal(reconstructed.taskStates.a.state, 'running');
  assert.equal(reconstructed.caseRevision, before.caseRevision);
  assert.equal((await store.load(caseId)).caseRevision, before.caseRevision);
});

test('D0019 model: semantic reopen requires explicit execution-owner-loss recovery and persists once', async () => {
  const caseId = 'd0019-explicit-recovery';
  const { store, plan } = await createCase(caseId);
  const engine = new CaseEngine({ caseId, plan });
  const attempt = engine.startAttempt('a', { id: 'lost-agent', epoch: 4 });
  store.snapshots.set(caseId, structuredClone(engine.snapshot()));

  const recovery = new SerializedCaseDoAuthorityModel(store);
  const reopened = await recovery.recoverAfterExecutionOwnerLoss(caseId);
  assert.equal(reopened.attempts[attempt.id].state, 'interrupted');
  assert.equal(reopened.taskStates.a.state, 'pending');
  const persisted = await store.load(caseId);
  assert.equal(persisted.attempts[attempt.id].state, 'interrupted');
  assert.equal(persisted.caseRevision, reopened.caseRevision);

  const replay = await new SerializedCaseDoAuthorityModel(store).recoverAfterExecutionOwnerLoss(caseId);
  assert.equal(replay.attempts[attempt.id].state, 'interrupted');
  assert.equal(replay.caseRevision, persisted.caseRevision);
});

test('D0019 model: corrupted durable state fails closed on reconstruction', async () => {
  const caseId = 'd0019-corrupt';
  const { store } = await createCase(caseId);
  const corrupt = await store.load(caseId);
  corrupt.caseState = 'succeeded';
  store.snapshots.set(caseId, corrupt);

  const reconstructedInstance = new SerializedCaseDoAuthorityModel(store);
  await assert.rejects(
    reconstructedInstance.reconstruct(caseId),
    (error) => error?.code === 'snapshot_digest_mismatch',
  );
});

test('D0019 model: running state is durable before executor dispatch', async () => {
  const caseId = 'd0019-running-before-dispatch';
  const { store, repository, plan } = await createCase(caseId);
  let executorCalls = 0;

  const result = await runDurableCase(repository, caseId, async ({ baseDigest, task, attempt }) => {
    executorCalls += 1;
    const stored = await store.load(caseId);
    assert.equal(stored.taskStates.a.state, 'running');
    assert.equal(stored.attempts[attempt.id].state, 'running');
    assert.equal(stored.attempts[attempt.id].fencingToken, attempt.fencingToken);
    return resultFor(baseDigest, task);
  });

  assert.equal(executorCalls, 1);
  assert.equal(result.caseState, 'succeeded');
  assert.equal((await store.load(caseId)).caseState, 'succeeded');
  assert.equal(plan.planDigest, result.snapshot.plan.planDigest);
});

test('D0019 placement falsifier: one CaseId cannot be initialized in two provider placement contexts', () => {
  const placements = new CasePlacementAuthorityModel();
  const first = {
    environment: 'production',
    scriptName: 'tdev-runtime',
    className: 'CaseDO',
    namespace: 'CASE_AUTHORITY',
    jurisdiction: 'eu',
    durableObjectId: 'do-id-elected',
  };

  const elected = placements.elect('d0019-placement', first);
  assert.equal(elected.placementGeneration, 1);
  assert.deepEqual(placements.elect('d0019-placement', first), elected);

  assert.throws(
    () => placements.elect('d0019-placement', {
      ...first,
      environment: 'staging',
      jurisdiction: 'fedramp',
      durableObjectId: 'do-id-competing',
    }),
    (error) => error?.code === 'placement_conflict',
  );
});

test('D0019 migration falsifier: copy-then-switch without an old-writer fence creates two authorities', async () => {
  const caseId = 'd0019-dual-writer';
  const plan = planWithWork([{ id: 'a' }]);
  const seed = new CaseEngine({ caseId, plan }).snapshot();
  const sourceStore = new MemorySnapshotStore();
  const destinationStore = new MemorySnapshotStore();
  await sourceStore.create(seed);
  await destinationStore.create(seed);
  const source = new CaseRepository(sourceStore);
  const destination = new CaseRepository(destinationStore);

  await source.command(caseId, {
    requestId: 'source-command',
    expectedCaseRevision: seed.caseRevision,
    command: { type: 'start_attempt', taskId: 'a', executor: 'source-agent' },
  });
  await destination.command(caseId, {
    requestId: 'destination-command',
    expectedCaseRevision: seed.caseRevision,
    command: { type: 'cancel_task', taskId: 'a', reason: 'destination writer' },
  });

  const sourceState = await sourceStore.load(caseId);
  const destinationState = await destinationStore.load(caseId);
  assert.ok(sourceState.caseRevision > seed.caseRevision);
  assert.ok(destinationState.caseRevision > seed.caseRevision);
  assert.notEqual(sourceState.snapshotDigest, destinationState.snapshotDigest);
  assert.equal(sourceState.receipts['source-command'].requestId, 'source-command');
  assert.equal(destinationState.receipts['destination-command'].requestId, 'destination-command');
});
