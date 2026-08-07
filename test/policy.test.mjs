import test from 'node:test';
import assert from 'node:assert/strict';
import { CaseEngine, definePlan } from '../src/engine.mjs';
import { runCase } from '../src/runner.mjs';
import { planWithWork } from './helpers.mjs';

test('authority is the intersection of Case grant, Workspace policy, and executor capability', async () => {
  const plan = planWithWork([{ id: 'write', requiredCapabilities: ['repository.write'] }]);
  let called = false;
  const denied = await runCase(new CaseEngine({
    caseId: 'authority-denied', plan,
    caseContract: { caseGrant: ['repository.write'], workspacePolicy: ['repository.write'] },
  }), async () => {
    called = true;
    throw new Error('must not execute');
  }, { executorCapabilities: [] });
  assert.equal(called, false);
  assert.equal(denied.caseState, 'failed');
  assert.equal(denied.snapshot.taskStates.write.state, 'denied');

  const allowed = await runCase(new CaseEngine({
    caseId: 'authority-allowed', plan,
    caseContract: { caseGrant: ['repository.write'], workspacePolicy: ['repository.write'] },
  }), async ({ baseDigest }) => ({ kind: 'changeset', baseDigest, writes: [] }), {
    executorCapabilities: ['repository.write'],
  });
  assert.equal(allowed.caseState, 'succeeded');
});

test('path policy rejects reserved, non-normal, and file/descendant tree collisions', () => {
  assert.throws(() => planWithWork([], { '.git/config': 'x' }), (error) => error?.code === 'reserved_path');
  assert.throws(() => planWithWork([], { 'a': 'file', 'a/b': 'descendant' }), (error) => error?.code === 'tree_path_collision');
  assert.throws(() => planWithWork([], { 'dir/../file': 'x' }), (error) => error?.code === 'invalid_path');
});

test('Promotion rejects topology conflicts without mutating the base tree', async () => {
  const baseTree = { base: 'file' };
  const plan = planWithWork([{ id: 'a' }], baseTree);
  const result = await runCase(new CaseEngine({ caseId: 'topology-conflict', plan }), async ({ baseDigest }) => ({
    kind: 'changeset', baseDigest, writes: [{ path: 'base/child', content: 'child' }],
  }));
  assert.equal(result.caseState, 'failed');
  assert.equal(result.snapshot.taskStates.promote.error.code, 'promotion_topology_conflict');
  assert.deepEqual(result.snapshot.canonicalTree, baseTree);
});

test('Plan input and canonical tree bounds are enforced before Case creation', () => {
  const rawPlan = {
    revisionId: 'bounded-plan',
    baseTree: {},
    tasks: [
      { id: 'a', kind: 'work', dependencies: [], claims: [], input: { payload: 'oversized' } },
      {
        id: 'promote', kind: 'promotion', dependencies: ['a'],
        claims: [{ mode: 'write', resource: 'canonical:tree' }], input: {},
      },
    ],
  };
  assert.throws(() => new CaseEngine({
    caseId: 'input-bound',
    plan: rawPlan,
    caseContract: { limits: { maxTaskInputBytes: 8 } },
  }), (error) => error?.code === 'task_input_limit_exceeded');

  assert.throws(() => new CaseEngine({
    caseId: 'tree-entry-bound',
    plan: { ...rawPlan, baseTree: { 'a.txt': 'a', 'b.txt': 'b' }, tasks: rawPlan.tasks.map((task) => ({ ...task, input: {} })) },
    caseContract: { limits: { maxTreeEntries: 1 } },
  }), (error) => error?.code === 'tree_entry_limit_exceeded');
});

test('retry policy is bounded by the Case contract rather than a disconnected constant', () => {
  const plan = planWithWork([{
    id: 'a',
    execution: { retry: { maxAttempts: 3 } },
  }]);
  assert.throws(
    () => new CaseEngine({
      caseId: 'retry-contract-bound',
      plan,
      caseContract: { limits: { maxAttemptsPerTask: 2 } },
    }),
    (error) => error?.code === 'invalid_retry',
  );
});
