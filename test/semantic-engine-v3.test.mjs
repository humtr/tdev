import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { CaseEngine } from '../src/engine.mjs';
import { SEMANTIC_PROFILE } from '../src/semantic-authority.mjs';
import { openSemanticSqliteStore } from '../src/semantic-store.mjs';
import { planWithWork, resultFor } from './helpers.mjs';

function createEngine() {
  const plan = planWithWork([{ id: 'a' }], { 'base.txt': 'base' });
  return new CaseEngine({
    caseId: 'semantic-case',
    plan,
    semanticAuthority: { profile: SEMANTIC_PROFILE },
  });
}

function finishCase(engine) {
  const work = engine.startAttempt('a', 'worker');
  engine.completeAttempt(work.id, resultFor(engine.plan.baseDigest, { id: 'a' }, 'A'));
  const promotion = engine.startAttempt('promote', 'promoter');
  const result = engine.createPromotionResult();
  engine.completeAttempt(promotion.id, result);
  return result;
}

async function withStore(fn) {
  const root = await mkdtemp(join(tmpdir(), 'tdev-semantic-engine-'));
  const path = join(root, 'semantic.sqlite');
  try { await fn(path); } finally { await rm(root, { recursive: true, force: true }); }
}

test('CaseEngine v3 runs work and Promotion with radix authority and no full tree in snapshot authority', () => {
  const engine = createEngine();
  assert.equal(engine.isSemanticV3, true);
  const result = finishCase(engine);
  assert.equal(engine.caseState, 'succeeded');
  assert.equal(result.semanticProfile, SEMANTIC_PROFILE);
  assert.equal(Object.hasOwn(result, 'tree'), false);
  assert.equal(Object.hasOwn(result, 'treeDigest'), false);

  const snapshot = engine.snapshot();
  assert.equal(snapshot.schemaVersion, 3);
  assert.equal(Object.hasOwn(snapshot, 'canonicalTree'), false);
  assert.equal(Object.hasOwn(snapshot, 'canonicalDigest'), false);
  assert.equal(Object.hasOwn(snapshot.plan, 'baseTree'), false);
  assert.equal(Object.hasOwn(snapshot.taskStates.promote.acceptedResult, 'tree'), false);
  assert.equal(snapshot.semanticAuthority.canonicalRoot.rootDigest, engine.semanticRootDigest);
  assert.deepEqual(JSON.parse(JSON.stringify(engine.canonicalTree)), {
    'a.txt': 'A',
    'base.txt': 'base',
  });
});

test('CaseEngine v3 snapshot requires semantic object resolver and round-trips through SQLite after restart', async () => {
  await withStore(async (path) => {
    const engine = createEngine();
    finishCase(engine);
    const snapshot = engine.snapshot();
    assert.throws(
      () => CaseEngine.restore(snapshot, { reopen: false }),
      (error) => error?.code === 'semantic_resolver_required',
    );

    const store = await openSemanticSqliteStore(path);
    const head = store.commit({
      snapshot,
      semanticObjects: engine.semanticObjectRecords(),
    });
    store.close();

    const reopenedStore = await openSemanticSqliteStore(path);
    const restored = CaseEngine.restore(reopenedStore.getSnapshot(head.snapshotDigest), {
      reopen: false,
      semanticResolver: (digest) => reopenedStore.getObject(digest),
    });
    assert.equal(restored.isSemanticV3, true);
    assert.equal(restored.caseState, 'succeeded');
    assert.equal(restored.semanticRootDigest, engine.semanticRootDigest);
    assert.deepEqual(restored.snapshot(), snapshot);
    assert.deepEqual(JSON.parse(JSON.stringify(restored.canonicalTree)), JSON.parse(JSON.stringify(engine.canonicalTree)));
    reopenedStore.close();
  });
});

test('CaseEngine v2 remains schema-v2 and full-tree authoritative by default', () => {
  const plan = planWithWork([{ id: 'a' }], { 'base.txt': 'base' });
  const engine = new CaseEngine({ caseId: 'legacy-case', plan });
  assert.equal(engine.isSemanticV3, false);
  const snapshot = engine.snapshot();
  assert.equal(snapshot.schemaVersion, 2);
  assert.ok(Object.hasOwn(snapshot, 'canonicalTree'));
  assert.ok(Object.hasOwn(snapshot.plan, 'baseTree'));
});
