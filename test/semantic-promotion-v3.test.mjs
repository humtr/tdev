import assert from 'node:assert/strict';
import test from 'node:test';

import { digest } from '../src/canonical.mjs';
import { buildSemanticTree } from '../src/semantic-authority.mjs';
import { promoteSemantic } from '../src/semantic-promotion.mjs';
import { promote } from '../src/promotion.mjs';

function task(id) {
  return {
    id,
    kind: 'work',
    dependencies: [],
    claims: [],
    execution: {
      resultKind: 'changeset',
      effectClass: 'result-only',
      operation: 'test.change',
      requirePassed: false,
      retry: { maxAttempts: 1 },
    },
  };
}

function accepted(taskId, writes, baseDigest) {
  return {
    task: task(taskId),
    taskId,
    effectKey: `effect:${taskId}`,
    result: { kind: 'changeset', baseDigest, writes },
  };
}

test('v3 semantic Promotion materializes exactly the current v2 Promotion oracle without full tree in result', () => {
  const base = { 'a.txt': 'a', 'dir/b.txt': 'b', 'z.txt': 'z' };
  const baseDigest = digest(base);
  const entries = [
    accepted('t2', [{ path: 'dir/c.txt', content: 'c' }], baseDigest),
    accepted('t1', [{ path: 'a.txt', content: 'changed' }, { path: 'z.txt', content: null }], baseDigest),
  ];
  const legacy = promote(base, entries, baseDigest);
  const semantic = promoteSemantic(buildSemanticTree(base), entries, baseDigest);
  assert.deepEqual(JSON.parse(JSON.stringify(semantic.semanticTree.materialize())), JSON.parse(JSON.stringify(legacy.tree)));
  assert.equal(semantic.result.baseDigest, legacy.baseDigest);
  assert.deepEqual(semantic.result.accepted, legacy.accepted);
  assert.deepEqual(semantic.result.acceptedTaskIds, legacy.acceptedTaskIds);
  assert.deepEqual(semantic.result.appliedTaskIds, legacy.appliedTaskIds);
  assert.equal(Object.hasOwn(semantic.result, 'tree'), false);
  assert.equal(Object.hasOwn(semantic.result, 'treeDigest'), false);
  assert.equal(semantic.result.semanticRoot.rootDigest, semantic.semanticTree.rootDescriptor.rootDigest);
});

test('v3 semantic Promotion preserves deterministic conflict ordering', () => {
  const base = { 'a.txt': 'a' };
  const baseDigest = digest(base);
  const entries = [
    accepted('z', [{ path: 'same.txt', content: 'z' }], baseDigest),
    accepted('a', [{ path: 'same.txt', content: 'a' }], baseDigest),
  ];
  assert.throws(
    () => promoteSemantic(buildSemanticTree(base), entries, baseDigest),
    (error) => error?.code === 'promotion_conflict' && error.details.conflicts[0].firstTaskId === 'a' && error.details.conflicts[0].secondTaskId === 'z',
  );
});

test('v3 semantic Promotion rejects topology conflicts without materializing the complete tree', () => {
  const base = { 'a/b.txt': 'b', 'other.txt': 'o' };
  const baseDigest = digest(base);
  assert.throws(
    () => promoteSemantic(buildSemanticTree(base), [accepted('t', [{ path: 'a', content: 'file' }], baseDigest)], baseDigest),
    (error) => error?.code === 'promotion_topology_conflict',
  );
});

test('v3 semantic Promotion emits only sparse object deltas for sparse writes', () => {
  const base = {};
  for (let index = 0; index < 5000; index += 1) base[`dir/${String(index).padStart(5, '0')}.txt`] = `v${index}`;
  const baseDigest = digest(base);
  const result = promoteSemantic(
    buildSemanticTree(base),
    [accepted('t', [{ path: 'dir/02500.txt', content: 'changed' }], baseDigest)],
    baseDigest,
  );
  assert.ok(result.semanticTree.stats.nodeReads < 100, `nodeReads=${result.semanticTree.stats.nodeReads}`);
  assert.ok(result.semanticTree.stats.nodeWrites < 100, `nodeWrites=${result.semanticTree.stats.nodeWrites}`);
  assert.ok(result.semanticTree.objectRecords().length < 100, `objects=${result.semanticTree.objectRecords().length}`);
});
