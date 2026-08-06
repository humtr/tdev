import test from 'node:test';
import assert from 'node:assert/strict';
import { claimSetsConflict, resourcesOverlap } from '../src/claims.mjs';

test('resource overlap supports exact and subtree claims', () => {
  assert.equal(resourcesOverlap('repository:protocol/**', 'repository:protocol/schema.json'), true);
  assert.equal(resourcesOverlap('repository:protocol/**', 'repository:worker/index.js'), false);
  assert.equal(resourcesOverlap('candidate:a/**', 'candidate:a/nested/**'), true);
});

test('read/read is compatible while overlapping write or execute conflicts', () => {
  assert.equal(
    claimSetsConflict(
      [{ mode: 'read', resource: 'repository:protocol/**' }],
      [{ mode: 'read', resource: 'repository:protocol/schema.json' }],
    ),
    false,
  );
  assert.equal(
    claimSetsConflict(
      [{ mode: 'read', resource: 'repository:protocol/**' }],
      [{ mode: 'write', resource: 'repository:protocol/schema.json' }],
    ),
    true,
  );
  assert.equal(
    claimSetsConflict(
      [{ mode: 'execute', resource: 'cpu:test' }],
      [{ mode: 'execute', resource: 'cpu:test' }],
    ),
    true,
  );
});

test('disjoint writes are compatible', () => {
  assert.equal(
    claimSetsConflict(
      [{ mode: 'write', resource: 'candidate:worker/**' }],
      [{ mode: 'write', resource: 'candidate:agent/**' }],
    ),
    false,
  );
});
