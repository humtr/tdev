import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson, digest } from '../src/canonical.mjs';
import {
  RESEARCH_DIGEST_DOMAINS,
  RESEARCH_MODEL_NAMES,
  buildResearchModel,
  hypotheticalHeadBytes,
  materializeResearchModel,
  updateResearchModel,
} from '../bench/semantic-authority-models.mjs';

function orderedTree(entries) {
  const tree = Object.create(null);
  for (const [path, content] of entries) tree[path] = content;
  return tree;
}

function wideTree(count) {
  const tree = Object.create(null);
  for (let index = 0; index < count; index += 1) {
    tree[`file-${String(index).padStart(6, '0')}.txt`] = 'base\n';
  }
  return tree;
}

function balancedTree(count) {
  const tree = Object.create(null);
  for (let index = 0; index < count; index += 1) {
    const group = String(Math.floor(index / 64)).padStart(4, '0');
    const slot = String(index % 64).padStart(4, '0');
    tree[`group-${group}/slot-${slot}.txt`] = 'base\n';
  }
  return tree;
}

function assertSameTree(actual, expected) {
  assert.equal(canonicalJson(actual), canonicalJson(expected));
  assert.equal(digest(actual), digest(expected));
}

test('research models materialize the current complete text-tree semantics', () => {
  const base = orderedTree([
    ['a.txt', 'A\n'],
    ['dir/b.txt', 'B\n'],
    ['dir/c.txt', 'C\n'],
    ['z/last.txt', 'Z\n'],
  ]);

  const roots = new Set();
  for (const name of RESEARCH_MODEL_NAMES) {
    const built = buildResearchModel(name, base);
    const materialized = materializeResearchModel(name, built.model);
    assertSameTree(materialized.tree, base);
    assert.match(built.model.rootDigest, /^sha256:[0-9a-f]{64}$/u);
    roots.add(built.model.rootDigest);
  }

  assert.equal(roots.size, RESEARCH_MODEL_NAMES.length, 'typed research roots must be domain-separated');
  assert.equal(RESEARCH_DIGEST_DOMAINS.value, 'tdev.research.semantic-value.v1');
});

test('research models preserve create update delete semantics without changing the oracle shape', () => {
  const base = orderedTree([
    ['a.txt', 'A\n'],
    ['dir/b.txt', 'B\n'],
    ['dir/c.txt', 'C\n'],
  ]);
  const writes = [
    { path: 'a.txt', content: 'A2\n' },
    { path: 'dir/b.txt', content: null },
    { path: 'new/path.txt', content: 'N\n' },
  ];
  const expected = orderedTree([
    ['a.txt', 'A2\n'],
    ['dir/c.txt', 'C\n'],
    ['new/path.txt', 'N\n'],
  ]);

  for (const name of RESEARCH_MODEL_NAMES) {
    const built = buildResearchModel(name, base);
    const updated = updateResearchModel(name, built.model, writes);
    const materialized = materializeResearchModel(name, updated.model);
    const rebuilt = buildResearchModel(name, expected);
    assertSameTree(materialized.tree, expected);
    assert.equal(updated.model.rootDigest, rebuilt.model.rootDigest, `${name} final root must not depend on update history`);
    assert.ok(updated.metrics.nodesWritten > 0);
    assert.ok(updated.metrics.hashOperations > 0);
    assert.ok(updated.metrics.bytesHashed > 0);
  }
});

test('research roots are deterministic across input and write order permutations', () => {
  const entries = [
    ['a.txt', 'A\n'],
    ['dir/b.txt', 'B\n'],
    ['dir/c.txt', 'C\n'],
    ['x/y/z.txt', 'Z\n'],
  ];
  const leftBase = orderedTree(entries);
  const rightBase = orderedTree([...entries].reverse());
  const writes = [
    { path: 'a.txt', content: 'A2\n' },
    { path: 'dir/c.txt', content: 'C2\n' },
    { path: 'x/y/z.txt', content: null },
  ];

  for (const name of RESEARCH_MODEL_NAMES) {
    const left = buildResearchModel(name, leftBase);
    const right = buildResearchModel(name, rightBase);
    assert.equal(left.model.rootDigest, right.model.rootDigest, `${name} initial root must ignore object insertion order`);

    const leftUpdated = updateResearchModel(name, left.model, writes);
    const rightUpdated = updateResearchModel(name, right.model, [...writes].reverse());
    assert.equal(leftUpdated.model.rootDigest, rightUpdated.model.rootDigest, `${name} batch root must ignore write order`);
    assertSameTree(
      materializeResearchModel(name, leftUpdated.model).tree,
      materializeResearchModel(name, rightUpdated.model).tree,
    );
  }
});

test('hash-trie collision buckets preserve complete paths and remain deterministic', () => {
  const collisionKey = () => '0'.repeat(64);
  const first = orderedTree([
    ['alpha.txt', 'A\n'],
    ['beta.txt', 'B\n'],
  ]);
  const second = orderedTree([
    ['beta.txt', 'B\n'],
    ['alpha.txt', 'A\n'],
  ]);

  const builtA = buildResearchModel('hash-trie', first, { keyFn: collisionKey });
  const builtB = buildResearchModel('hash-trie', second, { keyFn: collisionKey });
  assert.equal(builtA.model.rootDigest, builtB.model.rootDigest);
  assertSameTree(materializeResearchModel('hash-trie', builtA.model).tree, first);

  const updated = updateResearchModel('hash-trie', builtA.model, [
    { path: 'alpha.txt', content: 'A2\n' },
    { path: 'beta.txt', content: null },
    { path: 'gamma.txt', content: 'G\n' },
  ], { keyFn: collisionKey });
  const materialized = materializeResearchModel('hash-trie', updated.model);
  assertSameTree(materialized.tree, orderedTree([
    ['alpha.txt', 'A2\n'],
    ['gamma.txt', 'G\n'],
  ]));
  assert.equal(materialized.metrics.maxBucket, 2);
  assert.ok(updated.metrics.bucketEntriesHashed >= 2);
});

test('directory Merkle reference exposes wide-directory sparse-update amplification', () => {
  const count = 1_024;
  const wide = buildResearchModel('directory-merkle', wideTree(count));
  const balanced = buildResearchModel('directory-merkle', balancedTree(count));

  const wideUpdated = updateResearchModel('directory-merkle', wide.model, [
    { path: 'file-000000.txt', content: 'changed\n' },
  ]);
  const balancedUpdated = updateResearchModel('directory-merkle', balanced.model, [
    { path: 'group-0000/slot-0000.txt', content: 'changed\n' },
  ]);

  assert.ok(wideUpdated.metrics.childRefsHashed >= count, 'wide root must hash every sibling reference');
  assert.ok(
    wideUpdated.metrics.childRefsHashed > balancedUpdated.metrics.childRefsHashed * 8,
    'balanced directories should bound ancestor fanout far below one wide directory',
  );
});

test('bounded candidates keep sparse structural writes far below total tree size', () => {
  for (const name of ['byte-radix', 'hash-trie']) {
    const small = buildResearchModel(name, wideTree(1_000));
    const large = buildResearchModel(name, wideTree(5_000));
    const smallUpdate = updateResearchModel(name, small.model, [
      { path: 'file-000000.txt', content: 'changed\n' },
    ]);
    const largeUpdate = updateResearchModel(name, large.model, [
      { path: 'file-000000.txt', content: 'changed\n' },
    ]);

    assert.ok(smallUpdate.metrics.nodesWritten < 128, `${name} sparse update should not rewrite the tree`);
    assert.ok(largeUpdate.metrics.nodesWritten < 128, `${name} sparse update should remain bounded at 5k`);
    assert.ok(largeUpdate.metrics.nodesWritten <= smallUpdate.metrics.nodesWritten * 4 + 8, `${name} sparse node work should not scale with N`);
  }
});

test('bounded candidates hash shared ancestors once per broad batch', () => {
  const base = wideTree(512);
  const writes = Array.from({ length: 128 }, (_, index) => ({
    path: `file-${String(index * 4).padStart(6, '0')}.txt`,
    content: `changed-${index}\n`,
  }));

  for (const name of ['byte-radix', 'hash-trie']) {
    const built = buildResearchModel(name, base);
    const batch = updateResearchModel(name, built.model, writes);
    let sequentialModel = built.model;
    let sequentialNodesWritten = 0;
    let sequentialHashes = 0;
    for (const write of writes) {
      const updated = updateResearchModel(name, sequentialModel, [write]);
      sequentialModel = updated.model;
      sequentialNodesWritten += updated.metrics.nodesWritten;
      sequentialHashes += updated.metrics.hashOperations;
    }

    assert.equal(batch.model.rootDigest, sequentialModel.rootDigest, `${name} batch and sequential semantics must agree`);
    assert.ok(batch.metrics.nodesWritten < sequentialNodesWritten, `${name} batch should rewrite fewer nodes than sequential replay`);
    assert.ok(batch.metrics.hashOperations < sequentialHashes, `${name} batch should hash shared ancestors once`);
  }
});

test('hypothetical transactional head stays small and separate from model authority', () => {
  const base = wideTree(64);
  for (const name of RESEARCH_MODEL_NAMES) {
    const built = buildResearchModel(name, base);
    const updated = updateResearchModel(name, built.model, [
      { path: 'file-000000.txt', content: 'changed\n' },
    ]);
    const bytes = hypotheticalHeadBytes(name, built.model.rootDigest, updated.model.rootDigest);
    assert.ok(bytes > 0 && bytes < 1_024, `${name} research head should remain a small metadata record`);
  }
});
