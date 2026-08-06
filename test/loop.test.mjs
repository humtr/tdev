import test from 'node:test';
import assert from 'node:assert/strict';
import { CaseEngine } from '../src/engine.mjs';
import { runCase } from '../src/runner.mjs';
import { planWithWork } from './helpers.mjs';

function controlledExecutor(metrics) {
  return async ({ baseDigest, task }) => {
    metrics.active += 1;
    metrics.max = Math.max(metrics.max, metrics.active);
    await new Promise((resolve) => queueMicrotask(resolve));
    metrics.active -= 1;
    return {
      kind: 'changeset',
      baseDigest,
      writes: [{ path: task.input.path ?? `${task.id}.txt`, content: task.id }],
    };
  };
}

test('capacity one and capacity N share graph semantics and canonical digest', async () => {
  const plan = planWithWork([
    { id: 'a', claims: [{ mode: 'write', resource: 'candidate:a/**' }], input: { path: 'a.txt' } },
    { id: 'b', claims: [{ mode: 'write', resource: 'candidate:b/**' }], input: { path: 'b.txt' } },
  ], { 'base.txt': 'base' });

  const serialMetrics = { active: 0, max: 0 };
  const parallelMetrics = { active: 0, max: 0 };
  const serial = await runCase(
    new CaseEngine({ caseId: 'serial-case', plan }),
    controlledExecutor(serialMetrics),
    { capacity: 1 },
  );
  const parallel = await runCase(
    new CaseEngine({ caseId: 'parallel-case', plan }),
    controlledExecutor(parallelMetrics),
    { capacity: 2 },
  );

  assert.equal(serial.caseState, 'succeeded');
  assert.equal(parallel.caseState, 'succeeded');
  assert.equal(serialMetrics.max, 1);
  assert.equal(parallelMetrics.max, 2);
  assert.equal(serial.snapshot.canonicalDigest, parallel.snapshot.canonicalDigest);
  assert.deepEqual(serial.snapshot.canonicalTree, parallel.snapshot.canonicalTree);
});

test('overlapping write claims serialize while disjoint writes overlap', async () => {
  const conflictingPlan = planWithWork([
    { id: 'a', claims: [{ mode: 'write', resource: 'candidate:shared/**' }] },
    { id: 'b', claims: [{ mode: 'write', resource: 'candidate:shared/file' }] },
  ]);
  const disjointPlan = planWithWork([
    { id: 'a', claims: [{ mode: 'write', resource: 'candidate:a/**' }] },
    { id: 'b', claims: [{ mode: 'write', resource: 'candidate:b/**' }] },
  ]);

  const conflictingMetrics = { active: 0, max: 0 };
  const disjointMetrics = { active: 0, max: 0 };
  await runCase(
    new CaseEngine({ caseId: 'conflicting-case', plan: conflictingPlan }),
    controlledExecutor(conflictingMetrics),
    { capacity: 2 },
  );
  await runCase(
    new CaseEngine({ caseId: 'disjoint-case', plan: disjointPlan }),
    controlledExecutor(disjointMetrics),
    { capacity: 2 },
  );

  assert.equal(conflictingMetrics.max, 1);
  assert.equal(disjointMetrics.max, 2);
});

test('dependency readiness pipelines work before Promotion', async () => {
  const plan = planWithWork([
    { id: 'a', input: { path: 'a.txt' } },
    { id: 'b', dependencies: ['a'], input: { path: 'b.txt' } },
  ]);
  const order = [];
  const result = await runCase(
    new CaseEngine({ caseId: 'dependency-case', plan }),
    async ({ baseDigest, task }) => {
      order.push(task.id);
      return { kind: 'changeset', baseDigest, writes: [{ path: task.input.path, content: task.id }] };
    },
    { capacity: 2 },
  );
  assert.deepEqual(order, ['a', 'b']);
  assert.equal(result.caseState, 'succeeded');
  assert.equal(result.snapshot.taskStates.promote.state, 'succeeded');
});

test('Promotion conflict fails without changing the previous canonical tree', async () => {
  const baseTree = { 'same.txt': 'base' };
  const plan = planWithWork([{ id: 'a' }, { id: 'b' }], baseTree);
  const engine = new CaseEngine({ caseId: 'conflict-case', plan });
  const result = await runCase(
    engine,
    async ({ baseDigest, task }) => ({
      kind: 'changeset',
      baseDigest,
      writes: [{ path: 'same.txt', content: task.id }],
    }),
    { capacity: 2 },
  );
  assert.equal(result.caseState, 'failed');
  assert.deepEqual(result.snapshot.canonicalTree, baseTree);
  assert.equal(result.snapshot.taskStates.promote.error.code, 'promotion_conflict');
});

test('overlapping read claims can execute concurrently', async () => {
  const plan = planWithWork([
    { id: 'a', claims: [{ mode: 'read', resource: 'repository:protocol/**' }] },
    { id: 'b', claims: [{ mode: 'read', resource: 'repository:protocol/schema.json' }] },
  ]);
  const metrics = { active: 0, max: 0 };
  await runCase(
    new CaseEngine({ caseId: 'read-case', plan }),
    controlledExecutor(metrics),
    { capacity: 2 },
  );
  assert.equal(metrics.max, 2);
});

test('different executor completion orders produce the same promoted tree', async () => {
  const plan = planWithWork([
    { id: 'a', claims: [{ mode: 'write', resource: 'candidate:a/**' }] },
    { id: 'b', claims: [{ mode: 'write', resource: 'candidate:b/**' }] },
  ]);

  function completionOrderedExecutor(delayedTaskId) {
    return async ({ baseDigest, task }) => {
      if (task.id === delayedTaskId) {
        await new Promise((resolve) => setImmediate(resolve));
      } else {
        await Promise.resolve();
      }
      return { kind: 'changeset', baseDigest, writes: [{ path: `${task.id}.txt`, content: task.id }] };
    };
  }

  const aLast = await runCase(
    new CaseEngine({ caseId: 'a-last', plan }),
    completionOrderedExecutor('a'),
    { capacity: 2 },
  );
  const bLast = await runCase(
    new CaseEngine({ caseId: 'b-last', plan }),
    completionOrderedExecutor('b'),
    { capacity: 2 },
  );
  assert.equal(aLast.snapshot.canonicalDigest, bLast.snapshot.canonicalDigest);
  assert.deepEqual(aLast.snapshot.canonicalTree, bLast.snapshot.canonicalTree);
});

test('invalid executor result fails the Task without escaping the runner', async () => {
  const baseTree = { 'base.txt': 'base' };
  const plan = planWithWork([{ id: 'a' }], baseTree);
  const result = await runCase(
    new CaseEngine({ caseId: 'invalid-result-case', plan }),
    async () => ({
      kind: 'changeset',
      baseDigest: 'sha256:stale',
      writes: [{ path: 'a.txt', content: 'invalid' }],
    }),
  );

  assert.equal(result.caseState, 'failed');
  assert.equal(result.snapshot.taskStates.a.state, 'failed');
  assert.equal(result.snapshot.taskStates.a.error.code, 'base_digest_mismatch');
  assert.deepEqual(result.snapshot.canonicalTree, baseTree);
});

test('cancellation wins a success race and the late result is rejected', async () => {
  const plan = planWithWork([{ id: 'a' }]);
  const engine = new CaseEngine({ caseId: 'cancel-race-case', plan });
  let release;
  let markStarted;
  const started = new Promise((resolve) => {
    markStarted = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });

  const running = runCase(engine, async ({ baseDigest, task }) => {
    markStarted();
    await gate;
    return {
      kind: 'changeset',
      baseDigest,
      writes: [{ path: `${task.id}.txt`, content: task.id }],
    };
  });

  await started;
  engine.cancelTask('a', 'race winner');
  release();
  const result = await running;

  assert.equal(result.caseState, 'cancelled');
  assert.equal(result.snapshot.taskStates.a.state, 'cancelled');
  assert.equal(result.snapshot.attempts['a.1'].state, 'cancelled');
  assert.deepEqual(result.snapshot.canonicalTree, {});
});
