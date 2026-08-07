import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { canonicalJson } from '../src/canonical.mjs';
import { CaseEngine } from '../src/engine.mjs';
import { CaseRepository } from '../src/repository.mjs';
import { FileSnapshotStore, MemorySnapshotStore } from '../src/store.mjs';
import { planWithWork } from './helpers.mjs';

async function temporaryDirectory(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tdev-store-'));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('MemorySnapshotStore compare-and-swap admits one winner and rejects regression', async () => {
  const store = new MemorySnapshotStore();
  const plan = planWithWork([{ id: 'a' }]);
  const initial = new CaseEngine({ caseId: 'memory-case', plan });
  await store.create(initial.snapshot());
  const base = await store.load('memory-case');

  const left = CaseEngine.restore(base, { reopen: false });
  left.startAttempt('a', 'left');
  const right = CaseEngine.restore(base, { reopen: false });
  right.startAttempt('a', 'right');

  await store.compareAndSwap('memory-case', base.caseRevision, left.snapshot());
  await assert.rejects(
    store.compareAndSwap('memory-case', base.caseRevision, right.snapshot()),
    (error) => error?.code === 'store_revision_conflict',
  );
  await assert.rejects(
    store.compareAndSwap('memory-case', left.caseRevision, base),
    (error) => error?.code === 'store_revision_regression',
  );
  const winner = await store.load('memory-case');
  assert.equal(winner.attempts['a.1'].executorId, 'left');
});

test('FileSnapshotStore writes canonical JSON atomically and fails closed on noncanonical data', async (t) => {
  const directory = await temporaryDirectory(t);
  const store = new FileSnapshotStore(directory);
  const plan = planWithWork([{ id: 'a' }]);
  const engine = new CaseEngine({ caseId: 'file-case', plan });
  const snapshot = engine.snapshot();
  await store.create(snapshot);

  const filePath = path.join(directory, 'file-case.json');
  const bytes = await readFile(filePath, 'utf8');
  assert.equal(bytes, canonicalJson(snapshot));
  assert.deepEqual(await readdir(directory), ['file-case.json']);
  assert.equal((await store.load('file-case')).snapshotDigest, snapshot.snapshotDigest);

  await writeFile(filePath, JSON.stringify(snapshot, null, 2));
  await assert.rejects(store.load('file-case'), (error) => error?.code === 'store_noncanonical');
});

test('FileSnapshotStore rejects malformed and duplicate-member JSON before repository restore', async (t) => {
  const directory = await temporaryDirectory(t);
  const store = new FileSnapshotStore(directory);
  await writeFile(path.join(directory, 'corrupt-case.json'), '{"caseId":"corrupt-case","caseId":"other"}');
  await assert.rejects(store.load('corrupt-case'), (error) =>
    error?.code === 'store_corrupt' && error?.details?.causeCode === 'duplicate_json_member');
});

test('FileSnapshotStore rejects an oversized file before allocating its payload', async (t) => {
  const directory = await temporaryDirectory(t);
  const store = new FileSnapshotStore(directory, { maxBytes: 64 });
  await writeFile(path.join(directory, 'oversized-case.json'), 'x'.repeat(65));
  await assert.rejects(
    store.load('oversized-case'),
    (error) => error?.code === 'store_snapshot_too_large' && error?.details?.size === 65,
  );
});

test('CaseRepository persists commands, exact receipt replay, and reopen recovery', async () => {
  const store = new MemorySnapshotStore();
  const repository = new CaseRepository(store);
  const plan = planWithWork([{ id: 'a' }]);
  const created = await repository.create({ caseId: 'repository-case', plan });
  const initialRevision = created.caseRevision;

  const first = await repository.command('repository-case', {
    requestId: 'request-1', expectedCaseRevision: initialRevision,
    command: { type: 'start_attempt', taskId: 'a', executor: 'executor' },
  });
  assert.equal(first.persisted, true);
  const startedRevision = first.engine.caseRevision;

  const replay = await repository.command('repository-case', {
    requestId: 'request-1', expectedCaseRevision: initialRevision,
    command: { type: 'start_attempt', taskId: 'a', executor: 'executor' },
  });
  assert.equal(replay.persisted, false);
  assert.equal(replay.result.deduplicated, true);
  assert.equal(replay.engine.caseRevision, startedRevision);

  const reopened = await repository.load('repository-case', { reopen: true });
  assert.equal(reopened.taskStates.a.state, 'pending');
  assert.equal(reopened.attempts['a.1'].state, 'interrupted');
  assert.ok(reopened.caseRevision > startedRevision);
  const stored = await store.load('repository-case');
  assert.equal(stored.caseRevision, reopened.caseRevision);
});

test('CaseRepository migrates a legacy v1 snapshot and persists v2 with CAS', async () => {
  const legacy = JSON.parse(await readFile(new URL('./fixtures/v1-succeeded.json', import.meta.url), 'utf8'));
  const store = new MemorySnapshotStore();
  await store.create(legacy);
  const repository = new CaseRepository(store);

  const migrated = await repository.load(legacy.caseId);
  assert.equal(migrated.caseState, 'succeeded');
  assert.ok(migrated.caseRevision > legacy.caseRevision);

  const persisted = await store.load(legacy.caseId);
  assert.equal(persisted.schemaVersion, 2);
  assert.equal(persisted.caseRevision, migrated.caseRevision);
  assert.match(persisted.snapshotDigest, /^sha256:[0-9a-f]{64}$/);
});

test('CaseRepository transaction does not retry a callback after a CAS conflict', async () => {
  const store = new MemorySnapshotStore();
  const repository = new CaseRepository(store);
  const plan = planWithWork([{ id: 'a' }]);
  await repository.create({ caseId: 'transaction-case', plan });
  let leftEntered;
  const leftBarrier = new Promise((resolve) => { leftEntered = resolve; });
  let releaseLeft;
  const leftGate = new Promise((resolve) => { releaseLeft = resolve; });
  let leftCalls = 0;

  const left = repository.transact('transaction-case', async (engine) => {
    leftCalls += 1;
    engine.startAttempt('a', 'left');
    leftEntered();
    await leftGate;
  });
  await leftBarrier;
  await repository.transact('transaction-case', (engine) => engine.startAttempt('a', 'right'));
  releaseLeft();
  await assert.rejects(left, (error) => error?.code === 'store_revision_conflict');
  assert.equal(leftCalls, 1);
});

test('CaseRepository validates transaction output before committing its snapshot', async () => {
  const store = new MemorySnapshotStore();
  const repository = new CaseRepository(store);
  const plan = planWithWork([{ id: 'a' }]);
  await repository.create({ caseId: 'transaction-output-case', plan });
  const before = await store.load('transaction-output-case');

  await assert.rejects(
    repository.transact('transaction-output-case', (engine) => {
      engine.startAttempt('a', 'executor');
      return 1n;
    }),
    (error) => error?.code === 'unsupported_value',
  );

  const after = await store.load('transaction-output-case');
  assert.deepEqual(after, before);
});

test('store and repository option boundaries fail closed', async (t) => {
  const directory = await temporaryDirectory(t);
  assert.throws(
    () => new FileSnapshotStore(directory, { ignored: true }),
    (error) => error?.code === 'unexpected_keys',
  );

  const repository = new CaseRepository(new MemorySnapshotStore());
  const plan = planWithWork([{ id: 'a' }]);
  await assert.rejects(
    repository.create({ caseId: 'bad-create', plan, ignored: true }),
    (error) => error?.code === 'unexpected_keys',
  );
  await repository.create({ caseId: 'option-case', plan });
  await assert.rejects(
    repository.load('option-case', { reopen: 'yes' }),
    (error) => error?.code === 'invalid_repository_option',
  );
  await assert.rejects(
    repository.transact('option-case', () => {}, { ignored: true }),
    (error) => error?.code === 'unexpected_keys',
  );
});

test('JournalSnapshotStore replays deltas with the same compare-and-swap contract', async (t) => {
  const directory = await temporaryDirectory(t);
  const { JournalSnapshotStore } = await import('../src/store.mjs');
  const store = new JournalSnapshotStore(directory, { compactAfterDeltas: 16 });
  const plan = planWithWork([{ id: 'a' }]);
  const engine = new CaseEngine({ caseId: 'journal-case', plan });
  const initial = engine.snapshot();
  await store.create(initial);

  engine.startAttempt('a', 'executor');
  const running = engine.snapshot();
  await store.compareAndSwap('journal-case', initial.caseRevision, running);

  const loaded = await store.load('journal-case');
  assert.deepEqual(loaded, running);
  const restartedStore = new JournalSnapshotStore(directory, { compactAfterDeltas: 16 });
  assert.deepEqual(await restartedStore.load('journal-case'), running);
  assert.deepEqual(
    await readdir(path.join(directory, 'journal-case')),
    ['base.json', `delta-${String(running.caseRevision).padStart(16, '0')}.json`],
  );
});

test('JournalSnapshotStore admits one CAS winner and ignores orphan temp files', async (t) => {
  const directory = await temporaryDirectory(t);
  const { JournalSnapshotStore } = await import('../src/store.mjs');
  const store = new JournalSnapshotStore(directory, { compactAfterDeltas: 16 });
  const plan = planWithWork([{ id: 'a' }]);
  const initialEngine = new CaseEngine({ caseId: 'journal-race', plan });
  const initial = initialEngine.snapshot();
  await store.create(initial);
  await writeFile(path.join(directory, 'journal-race', '.orphan.tmp'), 'incomplete');

  const left = CaseEngine.restore(await store.load('journal-race'), { reopen: false });
  const right = CaseEngine.restore(await store.load('journal-race'), { reopen: false });
  left.startAttempt('a', 'left');
  right.startAttempt('a', 'right');
  const results = await Promise.allSettled([
    store.compareAndSwap('journal-race', initial.caseRevision, left.snapshot()),
    store.compareAndSwap('journal-race', initial.caseRevision, right.snapshot()),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.equal(rejected.reason.code, 'store_revision_conflict');
  assert.ok(['left', 'right'].includes((await store.load('journal-race')).attempts['a.1'].executorId));
});

test('JournalSnapshotStore compaction preserves the exact materialized snapshot', async (t) => {
  const directory = await temporaryDirectory(t);
  const { JournalSnapshotStore } = await import('../src/store.mjs');
  const store = new JournalSnapshotStore(directory, { compactAfterDeltas: 2 });
  const plan = planWithWork([{ id: 'a' }]);
  const engine = new CaseEngine({ caseId: 'journal-compact', plan });
  let prior = engine.snapshot();
  await store.create(prior);

  engine.startAttempt('a', 'executor', { initialState: 'dispatch_pending' });
  let current = engine.snapshot();
  await store.compareAndSwap('journal-compact', prior.caseRevision, current);
  prior = current;
  engine.markAttemptQueued('a.1');
  current = engine.snapshot();
  await store.compareAndSwap('journal-compact', prior.caseRevision, current);

  assert.deepEqual(await readdir(path.join(directory, 'journal-compact')), ['base.json']);
  assert.deepEqual(await store.load('journal-compact'), current);
});

test('JournalSnapshotStore rejects an oversized materialized CAS before committing it', async (t) => {
  const directory = await temporaryDirectory(t);
  const { JournalSnapshotStore } = await import('../src/store.mjs');
  const plan = planWithWork([{ id: 'a' }]);
  const engine = new CaseEngine({ caseId: 'journal-size-bound', plan });
  const initial = engine.snapshot();
  engine.startAttempt('a', 'executor');
  const running = engine.snapshot();
  const initialBytes = Buffer.byteLength(canonicalJson(initial));
  const runningBytes = Buffer.byteLength(canonicalJson(running));
  assert.ok(runningBytes > initialBytes);

  const store = new JournalSnapshotStore(directory, {
    compactAfterDeltas: 16,
    maxBytes: initialBytes,
  });
  await store.create(initial);
  await assert.rejects(
    store.compareAndSwap('journal-size-bound', initial.caseRevision, running),
    (error) => error?.code === 'store_snapshot_too_large' && error?.details?.size === runningBytes,
  );
  assert.deepEqual(await new JournalSnapshotStore(directory, { maxBytes: initialBytes }).load('journal-size-bound'), initial);
});

test('JournalSnapshotStore fails closed on a noncanonical committed delta', async (t) => {
  const directory = await temporaryDirectory(t);
  const { JournalSnapshotStore } = await import('../src/store.mjs');
  const store = new JournalSnapshotStore(directory, { compactAfterDeltas: 16 });
  const plan = planWithWork([{ id: 'a' }]);
  const engine = new CaseEngine({ caseId: 'journal-corrupt', plan });
  const initial = engine.snapshot();
  await store.create(initial);
  engine.startAttempt('a', 'executor');
  const current = engine.snapshot();
  await store.compareAndSwap('journal-corrupt', initial.caseRevision, current);

  const deltaPath = path.join(
    directory,
    'journal-corrupt',
    `delta-${String(current.caseRevision).padStart(16, '0')}.json`,
  );
  const delta = JSON.parse(await readFile(deltaPath, 'utf8'));
  await writeFile(deltaPath, JSON.stringify(delta, null, 2));
  await assert.rejects(store.load('journal-corrupt'), (error) => error?.code === 'store_noncanonical');
});
