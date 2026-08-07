import test from 'node:test';
import assert from 'node:assert/strict';
import { ContractError, digest } from '../src/canonical.mjs';
import { promote } from '../src/promotion.mjs';

const baseTree = { 'base.txt': 'base' };
const baseDigest = digest(baseTree);

function change(taskId, path, content) {
  return {
    taskId,
    result: { kind: 'changeset', baseDigest, writes: [{ path, content }] },
  };
}

test('Promotion is independent of accepted-result order', () => {
  const left = promote(baseTree, [change('b', 'b.txt', 'B'), change('a', 'a.txt', 'A')], baseDigest);
  const right = promote(baseTree, [change('a', 'a.txt', 'A'), change('b', 'b.txt', 'B')], baseDigest);
  assert.deepEqual(left, right);
});

test('Promotion uses stable code-unit ordering rather than locale collation', () => {
  const result = promote(
    baseTree,
    [change('a', 'a.txt', 'lower'), change('A', 'A.txt', 'upper')],
    baseDigest,
  );
  assert.deepEqual(result.acceptedTaskIds, ['A', 'a']);
  assert.deepEqual(Object.keys(result.tree).sort(), ['A.txt', 'a.txt', 'base.txt']);
});

test('identical overlapping writes coalesce', () => {
  const result = promote(baseTree, [change('a', 'same.txt', 'same'), change('b', 'same.txt', 'same')], baseDigest);
  assert.equal(result.tree['same.txt'], 'same');
});

test('conflicts are deterministic and path traversal is rejected', () => {
  assert.throws(
    () => promote(baseTree, [change('b', 'same.txt', 'B'), change('a', 'same.txt', 'A')], baseDigest),
    (error) => {
      assert.equal(error instanceof ContractError, true);
      assert.equal(error.code, 'promotion_conflict');
      assert.deepEqual(error.details.conflicts, [{ path: 'same.txt', firstTaskId: 'a', secondTaskId: 'b' }]);
      return true;
    },
  );
  assert.throws(
    () => promote(baseTree, [change('a', '../escape', 'x')], baseDigest),
    (error) => error instanceof ContractError && error.code === 'invalid_path',
  );
});

test('Promotion rejects ambiguous entry shapes and mismatched Task identity', () => {
  const task = {
    id: 'a',
    kind: 'work',
    execution: {
      operation: 'legacy.work',
      resultKind: 'changeset',
      effectClass: 'result-only',
      requirePassed: false,
    },
  };
  const result = change('a', 'a.txt', 'A').result;

  assert.throws(
    () => promote(baseTree, [{ task, taskId: 'b', result }], baseDigest),
    (error) => error?.code === 'promotion_task_mismatch',
  );
  assert.throws(
    () => promote(baseTree, [{ taskId: 'a', result, ignored: true }], baseDigest),
    (error) => error?.code === 'unexpected_keys',
  );
});
