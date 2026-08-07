import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { canonicalJson, typedDigest } from '../src/canonical.mjs';
import { CaseEngine } from '../src/engine.mjs';
import { ImmutableJournalSnapshotStore } from '../src/index.mjs';
import { JournalSnapshotStore, MemorySnapshotStore } from '../src/store.mjs';
import { planWithWork } from './helpers.mjs';

async function temporaryDirectory(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tdev-immutable-journal-'));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function waitForFiles(paths) {
  while (true) {
    try {
      await Promise.all(paths.map((filePath) => access(filePath)));
      return;
    } catch {
      await delay(2);
    }
  }
}

function launchWriter(args) {
  const script = fileURLToPath(new URL('./fixtures/immutable-journal-cas-writer.mjs', import.meta.url));
  const child = spawn(process.execPath, [script, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const completed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0) {
        reject(new Error(`immutable journal writer exited ${code}: ${stderr}`));
        return;
      }
      resolve(JSON.parse(stdout));
    });
  });
  return { child, completed };
}

function redigestV2(delta) {
  delete delta.deltaDigest;
  delta.deltaDigest = typedDigest('tdev.snapshot-journal-delta.v2', delta);
  return delta;
}

function sequence(caseId) {
  const plan = planWithWork([{ id: 'a' }]);
  const engine = new CaseEngine({ caseId, plan });
  const initial = engine.snapshot();
  engine.startAttempt('a', 'executor', { initialState: 'dispatch_pending' });
  const dispatchPending = engine.snapshot();
  engine.markAttemptQueued('a.1');
  const queued = engine.snapshot();
  engine.markAttemptRunning('a.1');
  const running = engine.snapshot();
  return { plan, initial, dispatchPending, queued, running };
}

async function writeLegacySequence(directory, caseId, states) {
  const store = new JournalSnapshotStore(directory, { compactAfterDeltas: 64 });
  await store.create(states.initial);
  await store.compareAndSwap(caseId, states.initial.caseRevision, states.dispatchPending);
  await store.compareAndSwap(caseId, states.dispatchPending.caseRevision, states.queued);
  await store.compareAndSwap(caseId, states.queued.caseRevision, states.running);
}

function legacyDeltaName(snapshot) {
  return `delta-${String(snapshot.caseRevision).padStart(16, '0')}.json`;
}

function immutableDeltaName(fromRevision) {
  return `delta-from-${String(fromRevision).padStart(16, '0')}.json`;
}

test('ImmutableJournalSnapshotStore replays multi-Event revision jumps exactly', async (t) => {
  const directory = await temporaryDirectory(t);
  const caseId = 'immutable-jump';
  const plan = planWithWork([{ id: 'a' }]);
  const engine = new CaseEngine({ caseId, plan });
  const initial = engine.snapshot();
  await new ImmutableJournalSnapshotStore(directory).create(initial);

  engine.startAttempt('a', 'executor', { initialState: 'dispatch_pending' });
  engine.markAttemptQueued('a.1');
  const next = engine.snapshot();
  assert.equal(next.caseRevision - initial.caseRevision, 2);

  const store = new ImmutableJournalSnapshotStore(directory);
  await store.compareAndSwap(caseId, initial.caseRevision, next);
  assert.deepEqual(await new ImmutableJournalSnapshotStore(directory).load(caseId), next);
});

test('independent ImmutableJournalSnapshotStore instances elect one winner for different successor revisions', async (t) => {
  const directory = await temporaryDirectory(t);
  const caseId = 'immutable-instance-race';
  const plan = planWithWork([{ id: 'a' }]);
  const initialEngine = new CaseEngine({ caseId, plan });
  const initial = initialEngine.snapshot();
  const leftStore = new ImmutableJournalSnapshotStore(directory);
  const rightStore = new ImmutableJournalSnapshotStore(directory);
  await leftStore.create(initial);

  const left = CaseEngine.restore(initial, { reopen: false });
  left.startAttempt('a', 'left');
  const right = CaseEngine.restore(initial, { reopen: false });
  right.startAttempt('a', 'right', { initialState: 'dispatch_pending' });
  right.markAttemptQueued('a.1');
  assert.notEqual(left.caseRevision, right.caseRevision);

  const outcomes = await Promise.allSettled([
    leftStore.compareAndSwap(caseId, initial.caseRevision, left.snapshot()),
    rightStore.compareAndSwap(caseId, initial.caseRevision, right.snapshot()),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
  const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
  assert.equal(rejected.reason.code, 'store_revision_conflict');
  const files = await readdir(path.join(directory, caseId));
  assert.equal(files.filter((name) => name.startsWith('delta-from-')).length, 1);
  assert.ok([left.caseRevision, right.caseRevision].includes((await leftStore.load(caseId)).caseRevision));
});


test('ImmutableJournalSnapshotStore elects one base creator across independent Node processes', async (t) => {
  const directory = await temporaryDirectory(t);
  const caseId = 'immutable-create-race';
  const { initial } = sequence(caseId);
  const leftSnapshotPath = path.join(directory, 'left-create.json');
  const rightSnapshotPath = path.join(directory, 'right-create.json');
  const leftReady = path.join(directory, 'left-create.ready');
  const rightReady = path.join(directory, 'right-create.ready');
  const gate = path.join(directory, 'create-go');
  await writeFile(leftSnapshotPath, canonicalJson(initial));
  await writeFile(rightSnapshotPath, canonicalJson(initial));

  const left = launchWriter([directory, caseId, 'null', leftSnapshotPath, leftReady, gate]);
  const right = launchWriter([directory, caseId, 'null', rightSnapshotPath, rightReady, gate]);
  t.after(() => { left.child.kill(); right.child.kill(); });
  await waitForFiles([leftReady, rightReady]);
  await writeFile(gate, 'go');
  const outcomes = await Promise.all([left.completed, right.completed]);
  assert.equal(outcomes.filter((outcome) => outcome.ok).length, 1);
  assert.deepEqual(outcomes.filter((outcome) => !outcome.ok).map((outcome) => outcome.code), ['store_revision_conflict']);
  assert.deepEqual(await new ImmutableJournalSnapshotStore(directory).load(caseId), initial);
});

test('ImmutableJournalSnapshotStore elects one winner across independent Node processes', async (t) => {
  const directory = await temporaryDirectory(t);
  const caseId = 'immutable-process-race';
  const { initial, dispatchPending, queued } = sequence(caseId);
  await new ImmutableJournalSnapshotStore(directory).create(initial);

  const leftSnapshotPath = path.join(directory, 'left.json');
  const rightSnapshotPath = path.join(directory, 'right.json');
  const leftReady = path.join(directory, 'left.ready');
  const rightReady = path.join(directory, 'right.ready');
  const gate = path.join(directory, 'go');
  await writeFile(leftSnapshotPath, canonicalJson(dispatchPending));
  await writeFile(rightSnapshotPath, canonicalJson(queued));

  const left = launchWriter([directory, caseId, String(initial.caseRevision), leftSnapshotPath, leftReady, gate]);
  const right = launchWriter([directory, caseId, String(initial.caseRevision), rightSnapshotPath, rightReady, gate]);
  t.after(() => { left.child.kill(); right.child.kill(); });
  await waitForFiles([leftReady, rightReady]);
  await writeFile(gate, 'go');
  const outcomes = await Promise.all([left.completed, right.completed]);
  assert.equal(outcomes.filter((outcome) => outcome.ok).length, 1);
  assert.deepEqual(outcomes.filter((outcome) => !outcome.ok).map((outcome) => outcome.code), ['store_revision_conflict']);
  assert.equal((await readdir(path.join(directory, caseId))).filter((name) => name.startsWith('delta-from-')).length, 1);
});

test('ImmutableJournalSnapshotStore stale writer cannot append after a winner', async (t) => {
  const directory = await temporaryDirectory(t);
  const caseId = 'immutable-stale';
  const { initial, dispatchPending, queued } = sequence(caseId);
  const first = new ImmutableJournalSnapshotStore(directory);
  const stale = new ImmutableJournalSnapshotStore(directory);
  await first.create(initial);
  await first.compareAndSwap(caseId, initial.caseRevision, dispatchPending);
  await assert.rejects(
    stale.compareAndSwap(caseId, initial.caseRevision, queued),
    (error) => error?.code === 'store_revision_conflict' && error?.details?.actualRevision === dispatchPending.caseRevision,
  );
});

test('ImmutableJournalSnapshotStore reads a legacy prefix then writes v2 and old adapter fails closed', async (t) => {
  const directory = await temporaryDirectory(t);
  const caseId = 'immutable-migrate';
  const states = sequence(caseId);
  const legacy = new JournalSnapshotStore(directory, { compactAfterDeltas: 64 });
  await legacy.create(states.initial);
  await legacy.compareAndSwap(caseId, states.initial.caseRevision, states.dispatchPending);

  const store = new ImmutableJournalSnapshotStore(directory);
  assert.deepEqual(await store.load(caseId), states.dispatchPending);
  await store.compareAndSwap(caseId, states.dispatchPending.caseRevision, states.queued);
  assert.deepEqual(await new ImmutableJournalSnapshotStore(directory).load(caseId), states.queued);

  const files = await readdir(path.join(directory, caseId));
  assert.ok(files.includes(legacyDeltaName(states.dispatchPending)));
  assert.ok(files.includes(immutableDeltaName(states.dispatchPending.caseRevision)));
  await assert.rejects(
    new JournalSnapshotStore(directory).load(caseId),
    (error) => error?.code === 'store_journal_format_upgrade_required',
  );
});

test('ImmutableJournalSnapshotStore rejects legacy records after the v2 migration boundary', async (t) => {
  const directory = await temporaryDirectory(t);
  const template = await temporaryDirectory(t);
  const caseId = 'immutable-reverse-format';
  const states = sequence(caseId);
  await writeLegacySequence(template, caseId, states);

  const legacy = new JournalSnapshotStore(directory, { compactAfterDeltas: 64 });
  await legacy.create(states.initial);
  await legacy.compareAndSwap(caseId, states.initial.caseRevision, states.dispatchPending);
  const store = new ImmutableJournalSnapshotStore(directory);
  await store.compareAndSwap(caseId, states.dispatchPending.caseRevision, states.queued);

  await copyFile(
    path.join(template, caseId, legacyDeltaName(states.running)),
    path.join(directory, caseId, legacyDeltaName(states.running)),
  );
  await assert.rejects(store.load(caseId), (error) => error?.code === 'store_journal_format_order');
});

test('ImmutableJournalSnapshotStore rejects duplicate representations for one predecessor', async (t) => {
  const directory = await temporaryDirectory(t);
  const template = await temporaryDirectory(t);
  const caseId = 'immutable-duplicate-format';
  const states = sequence(caseId);
  await writeLegacySequence(template, caseId, states);

  const legacy = new JournalSnapshotStore(directory, { compactAfterDeltas: 64 });
  await legacy.create(states.initial);
  await legacy.compareAndSwap(caseId, states.initial.caseRevision, states.dispatchPending);
  const store = new ImmutableJournalSnapshotStore(directory);
  await store.compareAndSwap(caseId, states.dispatchPending.caseRevision, states.queued);

  await copyFile(
    path.join(template, caseId, legacyDeltaName(states.queued)),
    path.join(directory, caseId, legacyDeltaName(states.queued)),
  );
  await assert.rejects(store.load(caseId), (error) => error?.code === 'store_journal_fork');
});

test('ImmutableJournalSnapshotStore full replay exposes historical semantic corruption to warm CAS and cold load', async (t) => {
  const directory = await temporaryDirectory(t);
  const caseId = 'immutable-historical-corruption';
  const states = sequence(caseId);
  const store = new ImmutableJournalSnapshotStore(directory);
  await store.create(states.initial);
  await store.compareAndSwap(caseId, states.initial.caseRevision, states.dispatchPending);
  await store.compareAndSwap(caseId, states.dispatchPending.caseRevision, states.queued);
  await store.load(caseId);

  const firstDeltaPath = path.join(directory, caseId, immutableDeltaName(states.initial.caseRevision));
  const delta = JSON.parse(await readFile(firstDeltaPath, 'utf8'));
  delta.attempts['a.1'].executorId = 'tampered-executor';
  redigestV2(delta);
  await writeFile(firstDeltaPath, canonicalJson(delta));

  await assert.rejects(
    store.compareAndSwap(caseId, states.queued.caseRevision, states.running),
    (error) => error?.code === 'store_journal_snapshot_digest',
  );
  await assert.rejects(
    new ImmutableJournalSnapshotStore(directory).load(caseId),
    (error) => error?.code === 'store_journal_snapshot_digest',
  );
});

test('ImmutableJournalSnapshotStore rejects source digest mismatch and unknown v2 schema', async (t) => {
  const sourceDirectory = await temporaryDirectory(t);
  const schemaDirectory = await temporaryDirectory(t);
  for (const [directory, caseId, mutate, expectedCode] of [
    [sourceDirectory, 'immutable-source-digest', (delta) => {
      delta.sourceSnapshotDigest = `sha256:${'0'.repeat(64)}`;
      redigestV2(delta);
    }, 'store_journal_source_digest'],
    [schemaDirectory, 'immutable-schema', (delta) => {
      delta.schemaVersion = 999;
    }, 'store_journal_delta_version'],
  ]) {
    const states = sequence(caseId);
    const store = new ImmutableJournalSnapshotStore(directory);
    await store.create(states.initial);
    await store.compareAndSwap(caseId, states.initial.caseRevision, states.dispatchPending);
    const deltaPath = path.join(directory, caseId, immutableDeltaName(states.initial.caseRevision));
    const delta = JSON.parse(await readFile(deltaPath, 'utf8'));
    mutate(delta);
    await writeFile(deltaPath, canonicalJson(delta));
    await assert.rejects(store.load(caseId), (error) => error?.code === expectedCode);
  }
});

test('ImmutableJournalSnapshotStore fails closed on malformed, unsafe, noncanonical, and unreachable committed records', async (t) => {
  const cases = [
    ['malformed', 'delta-garbage.json', '{}', 'store_journal_filename'],
    ['unsafe', 'delta-from-9007199254740992.json', '{}', 'store_journal_filename'],
  ];
  for (const [suffix, name, bytes, expectedCode] of cases) {
    const directory = await temporaryDirectory(t);
    const caseId = `immutable-${suffix}`;
    const states = sequence(caseId);
    const store = new ImmutableJournalSnapshotStore(directory);
    await store.create(states.initial);
    await writeFile(path.join(directory, caseId, name), bytes);
    await assert.rejects(store.load(caseId), (error) => error?.code === expectedCode);
  }

  const noncanonicalDirectory = await temporaryDirectory(t);
  const noncanonicalCase = 'immutable-noncanonical';
  const noncanonicalStates = sequence(noncanonicalCase);
  const noncanonicalStore = new ImmutableJournalSnapshotStore(noncanonicalDirectory);
  await noncanonicalStore.create(noncanonicalStates.initial);
  await noncanonicalStore.compareAndSwap(noncanonicalCase, noncanonicalStates.initial.caseRevision, noncanonicalStates.dispatchPending);
  const noncanonicalPath = path.join(noncanonicalDirectory, noncanonicalCase, immutableDeltaName(noncanonicalStates.initial.caseRevision));
  const validDelta = JSON.parse(await readFile(noncanonicalPath, 'utf8'));
  await writeFile(noncanonicalPath, JSON.stringify(validDelta, null, 2));
  await assert.rejects(noncanonicalStore.load(noncanonicalCase), (error) => error?.code === 'store_noncanonical');

  const unreachableDirectory = await temporaryDirectory(t);
  const unreachableCase = 'immutable-unreachable';
  const unreachableStates = sequence(unreachableCase);
  const unreachableStore = new ImmutableJournalSnapshotStore(unreachableDirectory);
  await unreachableStore.create(unreachableStates.initial);
  await unreachableStore.compareAndSwap(unreachableCase, unreachableStates.initial.caseRevision, unreachableStates.dispatchPending);
  const sourcePath = path.join(unreachableDirectory, unreachableCase, immutableDeltaName(unreachableStates.initial.caseRevision));
  const unreachable = JSON.parse(await readFile(sourcePath, 'utf8'));
  unreachable.fromRevision = unreachableStates.dispatchPending.caseRevision + 10;
  unreachable.toRevision = unreachable.fromRevision + 1;
  unreachable.eventSequence = unreachable.toRevision;
  redigestV2(unreachable);
  await writeFile(
    path.join(unreachableDirectory, unreachableCase, immutableDeltaName(unreachable.fromRevision)),
    canonicalJson(unreachable),
  );
  await assert.rejects(unreachableStore.load(unreachableCase), (error) => error?.code === 'store_journal_gap');
});

test('ImmutableJournalSnapshotStore ignores orphan dot-temp files without poisoning CAS', async (t) => {
  const directory = await temporaryDirectory(t);
  const caseId = 'immutable-orphan-temp';
  const states = sequence(caseId);
  const store = new ImmutableJournalSnapshotStore(directory);
  await store.create(states.initial);
  await writeFile(
    path.join(directory, caseId, `.${immutableDeltaName(states.initial.caseRevision)}.stale.tmp`),
    'stale-uncommitted-bytes',
  );
  await store.compareAndSwap(caseId, states.initial.caseRevision, states.dispatchPending);
  assert.deepEqual(await new ImmutableJournalSnapshotStore(directory).load(caseId), states.dispatchPending);
});

test('ImmutableJournalSnapshotStore rejects committed records when base is missing', async (t) => {
  const directory = await temporaryDirectory(t);
  const caseId = 'immutable-missing-base';
  const states = sequence(caseId);
  const store = new ImmutableJournalSnapshotStore(directory);
  await store.create(states.initial);
  await store.compareAndSwap(caseId, states.initial.caseRevision, states.dispatchPending);
  await rm(path.join(directory, caseId, 'base.json'));
  await assert.rejects(store.load(caseId), (error) => error?.code === 'store_journal_missing_base');
});

test('ImmutableJournalSnapshotStore and MemorySnapshotStore materialize identical semantic snapshots', async (t) => {
  const directory = await temporaryDirectory(t);
  const caseId = 'immutable-oracle';
  const states = sequence(caseId);
  const immutable = new ImmutableJournalSnapshotStore(directory);
  const memory = new MemorySnapshotStore();
  await immutable.create(states.initial);
  await memory.create(states.initial);
  let prior = states.initial;
  for (const next of [states.dispatchPending, states.queued, states.running]) {
    await immutable.compareAndSwap(caseId, prior.caseRevision, next);
    await memory.compareAndSwap(caseId, prior.caseRevision, next);
    prior = next;
  }
  assert.deepEqual(await new ImmutableJournalSnapshotStore(directory).load(caseId), await memory.load(caseId));
});

test('ImmutableJournalSnapshotStore preserves the legacy compaction cleanup crash shape', async (t) => {
  const directory = await temporaryDirectory(t);
  const caseId = 'immutable-legacy-compaction-crash';
  const plan = planWithWork([{ id: 'a' }]);
  const engine = new CaseEngine({ caseId, plan });
  const legacy = new JournalSnapshotStore(directory, { compactAfterDeltas: 2 });
  let previous = engine.snapshot();
  await legacy.create(previous);

  engine.startAttempt('a', 'executor', { initialState: 'dispatch_pending' });
  let current = engine.snapshot();
  await legacy.compareAndSwap(caseId, previous.caseRevision, current);
  const coveredDeltaName = legacyDeltaName(current);
  const coveredDelta = await readFile(path.join(directory, caseId, coveredDeltaName));
  previous = current;

  engine.markAttemptQueued('a.1');
  current = engine.snapshot();
  await legacy.compareAndSwap(caseId, previous.caseRevision, current);
  await writeFile(path.join(directory, caseId, coveredDeltaName), coveredDelta);

  const immutable = new ImmutableJournalSnapshotStore(directory);
  assert.deepEqual(await immutable.load(caseId), current);
  engine.markAttemptRunning('a.1');
  const next = engine.snapshot();
  await immutable.compareAndSwap(caseId, current.caseRevision, next);
  assert.deepEqual(await new ImmutableJournalSnapshotStore(directory).load(caseId), next);
});

test('ImmutableJournalSnapshotStore enforces materialized snapshot bounds before commit', async (t) => {
  const directory = await temporaryDirectory(t);
  const caseId = 'immutable-size-bound';
  const states = sequence(caseId);
  const initialBytes = Buffer.byteLength(canonicalJson(states.initial), 'utf8');
  const nextBytes = Buffer.byteLength(canonicalJson(states.dispatchPending), 'utf8');
  assert.ok(nextBytes > initialBytes);

  const store = new ImmutableJournalSnapshotStore(directory, { maxBytes: initialBytes });
  await store.create(states.initial);
  await assert.rejects(
    store.compareAndSwap(caseId, states.initial.caseRevision, states.dispatchPending),
    (error) => error?.code === 'store_snapshot_too_large',
  );
  assert.deepEqual(await new ImmutableJournalSnapshotStore(directory).load(caseId), states.initial);
});

test('legacy and immutable journal adapters share one same-process migration serialization domain', async (t) => {
  const directory = await temporaryDirectory(t);
  const caseId = 'immutable-same-process-cutover';
  const states = sequence(caseId);
  const legacy = new JournalSnapshotStore(directory, { compactAfterDeltas: 64 });
  const immutable = new ImmutableJournalSnapshotStore(directory);
  await legacy.create(states.initial);

  const outcomes = await Promise.allSettled([
    legacy.compareAndSwap(caseId, states.initial.caseRevision, states.dispatchPending),
    immutable.compareAndSwap(caseId, states.initial.caseRevision, states.queued),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
  const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
  assert.ok(['store_revision_conflict', 'store_journal_format_upgrade_required'].includes(rejected.reason.code));

  const immutableRead = await new ImmutableJournalSnapshotStore(directory).load(caseId);
  assert.ok([states.dispatchPending.caseRevision, states.queued.caseRevision].includes(immutableRead.caseRevision));
  const files = await readdir(path.join(directory, caseId));
  const committedFromInitial = files.filter((name) =>
    name === legacyDeltaName(states.dispatchPending) || name === immutableDeltaName(states.initial.caseRevision));
  assert.equal(committedFromInitial.length, 1);
});


test('ImmutableJournalSnapshotStore rejects a non-regular authoritative commit slot', async (t) => {
  const directory = await temporaryDirectory(t);
  const caseId = 'immutable-nonregular-slot';
  const states = sequence(caseId);
  const store = new ImmutableJournalSnapshotStore(directory);
  await store.create(states.initial);
  await mkdir(path.join(directory, caseId, immutableDeltaName(states.initial.caseRevision)));
  await assert.rejects(store.load(caseId), (error) => error?.code === 'store_journal_file_type');
  await assert.rejects(
    new JournalSnapshotStore(directory).load(caseId),
    (error) => error?.code === 'store_journal_format_upgrade_required',
  );
});
