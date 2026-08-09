import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/canonical.mjs';
import {
  SEMANTIC_PROFILE,
  buildSemanticTree,
  semanticPlanBinding,
} from '../src/semantic-authority.mjs';
import { definePlan } from '../src/plan.mjs';
import { createSemanticSnapshot } from '../src/semantic-snapshot.mjs';
import { openSemanticSqliteStore } from '../src/semantic-store.mjs';

function promotionPlan(baseTree) {
  return definePlan({
    revisionId: 'r1',
    baseTree,
    tasks: [{
      id: 'promotion',
      kind: 'promotion',
      dependencies: [],
      claims: [{ mode: 'write', resource: 'canonical:tree' }],
      execution: {
        resultKind: 'promotion',
        effectClass: 'result-only',
        operation: 'tdev.promotion',
        requirePassed: false,
        retry: { maxAttempts: 1 },
      },
    }],
  });
}

function fixture({ caseId = 'case-v3', revision = 0, baseTree = { 'a.txt': 'a' }, canonicalTree = null, migrationSource = null } = {}) {
  const plan = promotionPlan(baseTree);
  const baseSemantic = buildSemanticTree(baseTree);
  const canonicalSemantic = canonicalTree === null
    ? baseSemantic
    : buildSemanticTree(canonicalTree);
  const snapshot = createSemanticSnapshot({
    schemaVersion: 3,
    caseId,
    caseState: 'active',
    caseRevision: revision,
    eventSequence: revision,
    plan: semanticPlanBinding(plan, baseSemantic.rootDescriptor),
    caseContract: {},
    events: [],
    semanticAuthority: {
      profile: SEMANTIC_PROFILE,
      authorityEpoch: 1,
      migrationSource,
      baseRoot: baseSemantic.rootDescriptor,
      canonicalRoot: canonicalSemantic.rootDescriptor,
    },
    taskStates: {},
    attempts: {},
    receipts: {},
  });
  const objects = new Map();
  for (const record of [...baseSemantic.objectRecords(), ...canonicalSemantic.objectRecords()]) objects.set(record.digest, record);
  return { plan, baseSemantic, canonicalSemantic, snapshot, objects: [...objects.values()] };
}

async function withDatabase(fn) {
  const root = await mkdtemp(join(tmpdir(), 'tdev-semantic-store-'));
  const path = join(root, 'semantic.sqlite');
  try {
    await fn(path);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('v3 SQLite commit atomically publishes semantic objects, snapshot, and head across restart', async () => {
  await withDatabase(async (path) => {
    const initial = fixture();
    const store = await openSemanticSqliteStore(path);
    const head = store.commit({ snapshot: initial.snapshot, semanticObjects: initial.objects });
    assert.equal(head.generation, 1);
    assert.equal(head.caseRevision, 0);
    store.close();

    const reopened = await openSemanticSqliteStore(path);
    const loaded = reopened.load('case-v3');
    assert.equal(loaded.head.headDigest, head.headDigest);
    assert.equal(loaded.snapshot.snapshotDigest, initial.snapshot.snapshotDigest);
    assert.deepEqual(JSON.parse(canonicalJson(loaded.baseTree.materialize())), { 'a.txt': 'a' });
    reopened.close();
  });
});

test('v3 SQLite stale independent instances have exactly one expected-head winner', async () => {
  await withDatabase(async (path) => {
    const initial = fixture();
    const first = await openSemanticSqliteStore(path);
    const initialHead = first.commit({ snapshot: initial.snapshot, semanticObjects: initial.objects });
    const second = await openSemanticSqliteStore(path);

    const left = fixture({ revision: 1, canonicalTree: { 'a.txt': 'left' } });
    const right = fixture({ revision: 1, canonicalTree: { 'a.txt': 'right' } });
    const winner = first.commit({
      snapshot: left.snapshot,
      semanticObjects: left.objects,
      expectedHeadDigest: initialHead.headDigest,
      expectedCaseRevision: 0,
    });
    assert.equal(winner.generation, 2);
    assert.throws(
      () => second.commit({
        snapshot: right.snapshot,
        semanticObjects: right.objects,
        expectedHeadDigest: initialHead.headDigest,
        expectedCaseRevision: 0,
      }),
      (error) => error?.code === 'store_cas_mismatch',
    );
    assert.equal(second.loadHead('case-v3').headDigest, winner.headDigest);
    first.close();
    second.close();
  });
});

test('v3 SQLite pre-commit fault rolls back objects snapshot and head', async () => {
  await withDatabase(async (path) => {
    const initial = fixture();
    const base = await openSemanticSqliteStore(path);
    const initialHead = base.commit({ snapshot: initial.snapshot, semanticObjects: initial.objects });
    base.close();

    const next = fixture({ revision: 1, canonicalTree: { 'a.txt': 'next', 'b.txt': 'b' } });
    const store = await openSemanticSqliteStore(path, {
      faultInjector(stage) {
        if (stage === 'before_commit') throw new Error('injected-before-commit');
      },
    });
    assert.throws(
      () => store.commit({
        snapshot: next.snapshot,
        semanticObjects: next.objects,
        expectedHeadDigest: initialHead.headDigest,
        expectedCaseRevision: 0,
      }),
      /injected-before-commit/,
    );
    assert.equal(store.loadHead('case-v3').headDigest, initialHead.headDigest);
    assert.equal(store.getSnapshot(next.snapshot.snapshotDigest), null);
    for (const record of next.objects) {
      if (!initial.objects.some((entry) => entry.digest === record.digest)) assert.equal(store.getObject(record.digest), null);
    }
    store.close();
  });
});

test('v3 SQLite post-commit ambiguity is reconciled from durable head without blind retry', async () => {
  await withDatabase(async (path) => {
    const initial = fixture();
    const base = await openSemanticSqliteStore(path);
    const predecessor = base.commit({ snapshot: initial.snapshot, semanticObjects: initial.objects });
    base.close();

    const next = fixture({ revision: 1, canonicalTree: { 'a.txt': 'next' } });
    let ambiguous;
    const writer = await openSemanticSqliteStore(path, {
      faultInjector(stage) {
        if (stage === 'after_commit') throw new Error('lost-commit-ack');
      },
    });
    try {
      writer.commit({
        snapshot: next.snapshot,
        semanticObjects: next.objects,
        expectedHeadDigest: predecessor.headDigest,
        expectedCaseRevision: 0,
      });
      assert.fail('expected ambiguous commit');
    } catch (error) {
      ambiguous = error;
      assert.equal(error.code, 'store_commit_ambiguous');
    }
    writer.close();

    const reopened = await openSemanticSqliteStore(path);
    assert.equal(reopened.reconcileCommit({
      caseId: 'case-v3',
      predecessorHeadDigest: predecessor.headDigest,
      successorHeadDigest: ambiguous.details.successorHeadDigest,
    }), 'committed');
    assert.equal(reopened.loadHead('case-v3').headDigest, ambiguous.details.successorHeadDigest);
    reopened.close();
  });
});

test('v3 SQLite scrub fails closed on reachable object corruption and exact repair never moves the head', async () => {
  await withDatabase(async (path) => {
    const initial = fixture({ baseTree: { 'a.txt': 'a', 'dir/b.txt': 'b' } });
    const store = await openSemanticSqliteStore(path);
    const head = store.commit({ snapshot: initial.snapshot, semanticObjects: initial.objects });
    const record = initial.objects.find((entry) => entry.kind === 'value');
    assert.ok(record);
    store.close();

    const { DatabaseSync } = await import('node:sqlite');
    const raw = new DatabaseSync(path);
    raw.prepare('UPDATE semantic_objects SET payload = ? WHERE digest = ?').run('{}', record.digest);
    raw.close();

    const corrupted = await openSemanticSqliteStore(path);
    assert.throws(() => corrupted.scrub('case-v3'));
    assert.equal(corrupted.loadHead('case-v3').headDigest, head.headDigest);
    corrupted.repairObject(record);
    assert.equal(corrupted.scrub('case-v3').headDigest, head.headDigest);
    corrupted.close();
  });
});
