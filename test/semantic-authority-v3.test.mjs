import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalJson } from '../src/canonical.mjs';
import {
  SemanticRadixTree,
  buildSemanticTree,
  hydrateSemanticTree,
  semanticPlanBinding,
  validateSemanticPlanBinding,
} from '../src/semantic-authority.mjs';
import { definePlan } from '../src/plan.mjs';

function asPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function record(entries) {
  return Object.assign(Object.create(null), entries);
}

function objectResolver(tree, mutate = null) {
  const records = new Map(tree.objectRecords().map((entry) => [entry.digest, entry]));
  if (mutate) mutate(records);
  return (digest) => records.get(digest) ?? null;
}

test('v3 radix materializes exact text-tree semantics and exact canonical byte accounting', () => {
  const source = record({
    'src/a.txt': 'alpha',
    'src/b.txt': 'βeta',
    'README.md': 'line 1\nline 2',
  });
  const tree = buildSemanticTree(source);
  assert.deepEqual(asPlain(tree.materialize()), asPlain(source));
  assert.equal(tree.entryCount, 3);
  assert.equal(tree.treeBytes, Buffer.byteLength(canonicalJson(source), 'utf8'));

  const changed = tree.applyWrites([
    { path: 'src/a.txt', content: 'changed' },
    { path: 'src/b.txt', content: null },
    { path: 'docs/new.json', content: '{"x":1}' },
  ]);
  const expected = record({
    'src/a.txt': 'changed',
    'README.md': 'line 1\nline 2',
    'docs/new.json': '{"x":1}',
  });
  assert.deepEqual(asPlain(changed.materialize()), asPlain(expected));
  assert.equal(changed.entryCount, 3);
  assert.equal(changed.treeBytes, Buffer.byteLength(canonicalJson(expected), 'utf8'));
});

test('v3 radix root is independent of build and write history', () => {
  const entries = [
    ['z.txt', 'z'],
    ['a/b/c.txt', 'c'],
    ['a/b/d.txt', 'd'],
    ['m/n.txt', 'n'],
  ];
  const direct = buildSemanticTree(record(Object.fromEntries(entries)));
  const reverse = new SemanticRadixTree().applyWrites(
    [...entries].reverse().map(([path, content]) => ({ path, content })),
  );
  const batched = new SemanticRadixTree()
    .applyWrites(entries.slice(0, 2).map(([path, content]) => ({ path, content })))
    .applyWrites(entries.slice(2).map(([path, content]) => ({ path, content })));
  assert.equal(reverse.rootDescriptor.rootDigest, direct.rootDescriptor.rootDigest);
  assert.equal(batched.rootDescriptor.rootDigest, direct.rootDescriptor.rootDigest);

  const mutated = direct.applyWrites([
    { path: 'a/b/c.txt', content: 'new' },
    { path: 'm/n.txt', content: null },
    { path: 'q/r.txt', content: 'r' },
  ]);
  const rebuilt = buildSemanticTree(mutated.materialize());
  assert.equal(mutated.rootDescriptor.rootDigest, rebuilt.rootDescriptor.rootDigest);
});

test('v3 radix rejects file ancestor and descendant topology directly from prefix traversal', () => {
  assert.throws(
    () => new SemanticRadixTree()
      .applyWrites([{ path: 'a', content: 'file' }])
      .applyWrites([{ path: 'a/b', content: 'child' }]),
    (error) => error?.code === 'promotion_topology_conflict',
  );
  assert.throws(
    () => new SemanticRadixTree()
      .applyWrites([{ path: 'a/b', content: 'child' }])
      .applyWrites([{ path: 'a', content: 'file' }]),
    (error) => error?.code === 'promotion_topology_conflict',
  );
});

test('v3 radix limit failures are atomic and keep the predecessor root reusable', () => {
  const base = buildSemanticTree(record({ 'a.txt': 'a' }));
  const before = base.rootDescriptor.rootDigest;
  assert.throws(
    () => base.applyWrites([{ path: 'b.txt', content: '0123456789' }], {
      limits: { maxTreeEntries: 10, maxTreeBytes: 15 },
    }),
    (error) => error?.code === 'tree_limit_exceeded',
  );
  assert.equal(base.rootDescriptor.rootDigest, before);
  assert.deepEqual(asPlain(base.materialize()), { 'a.txt': 'a' });
});

test('v3 radix sparse update work stays bounded below total tree entries', () => {
  const source = record({});
  for (let index = 0; index < 5000; index += 1) {
    source[`dir/${String(index).padStart(5, '0')}.txt`] = `v${index}`;
  }
  const tree = buildSemanticTree(source);
  const changed = tree.applyWrites([{ path: 'dir/02500.txt', content: 'changed' }]);
  assert.equal(changed.get('dir/02500.txt'), 'changed');
  assert.ok(changed.stats.nodeReads < 100, `nodeReads=${changed.stats.nodeReads}`);
  assert.ok(changed.stats.nodeWrites < 100, `nodeWrites=${changed.stats.nodeWrites}`);
  assert.equal(changed.entryCount, 5000);
});

test('v3 radix object hydration is deterministic and fails closed on missing or corrupt reachable objects', () => {
  const tree = buildSemanticTree(record({
    'a.txt': 'a',
    'dir/b.txt': 'b',
    'dir/c.txt': 'c',
  }));
  const hydrated = hydrateSemanticTree(tree.rootDescriptor, objectResolver(tree));
  assert.equal(hydrated.rootDescriptor.rootDigest, tree.rootDescriptor.rootDigest);
  assert.deepEqual(asPlain(hydrated.materialize()), asPlain(tree.materialize()));

  const missingDigest = tree.rootDescriptor.nodeDigest;
  assert.throws(
    () => hydrateSemanticTree(tree.rootDescriptor, objectResolver(tree, (records) => records.delete(missingDigest))),
    (error) => error?.code === 'semantic_object_missing',
  );

  const valueRecord = tree.objectRecords().find((entry) => entry.kind === 'value');
  assert.ok(valueRecord);
  assert.throws(
    () => hydrateSemanticTree(tree.rootDescriptor, objectResolver(tree, (records) => {
      records.set(valueRecord.digest, { ...valueRecord, payload: { ...valueRecord.payload, content: 'forged' } });
    })),
    (error) => error?.code === 'semantic_object_digest_mismatch',
  );
});

test('v3 compact Plan binding retains legacy baseDigest and planDigest without baseTree', () => {
  const plan = definePlan({
    revisionId: 'r1',
    baseTree: { 'a.txt': 'a' },
    tasks: [{
      id: 'promotion',
      kind: 'promotion',
      dependencies: [],
      claims: [{ mode: 'write', resource: 'canonical:tree' }],
      execution: { resultKind: 'promotion', effectClass: 'result-only', operation: 'tdev.promotion', requirePassed: false, retry: { maxAttempts: 1 } },
    }],
  });
  const semantic = buildSemanticTree(plan.baseTree);
  const binding = semanticPlanBinding(plan, semantic.rootDescriptor);
  assert.equal(binding.baseDigest, plan.baseDigest);
  assert.equal(binding.planDigest, plan.planDigest);
  assert.ok(!Object.hasOwn(binding, 'baseTree'));
  assert.deepEqual(asPlain(validateSemanticPlanBinding(binding)), asPlain(binding));
});
