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
