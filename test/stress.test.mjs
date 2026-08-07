import test from 'node:test';
import assert from 'node:assert/strict';
import { CaseEngine, definePlan, runCase } from '../src/index.mjs';

function widePlan(width) {
  const work = Array.from({ length: width }, (_, index) => {
    const id = `task-${String(index).padStart(3, '0')}`;
    return {
      id,
      kind: 'work',
      dependencies: [],
      claims: [{ mode: 'write', resource: `candidate:out/${id}.txt` }],
      input: { path: `out/${id}.txt`, content: `${id}\n` },
    };
  });
  return definePlan({
    revisionId: `wide-${width}`,
    baseTree: { 'base.txt': 'base\n' },
    tasks: [
      ...work,
      {
        id: 'promote',
        kind: 'promotion',
        dependencies: work.map((task) => task.id),
        claims: [{ mode: 'write', resource: 'canonical:tree' }],
        input: {},
      },
    ],
  });
}

function yieldingExecutor(metrics) {
  return async ({ baseDigest, task }) => {
    metrics.active += 1;
    metrics.max = Math.max(metrics.max, metrics.active);
    await new Promise((resolve) => setImmediate(resolve));
    metrics.active -= 1;
    return {
      kind: 'changeset',
      baseDigest,
      writes: [{ path: task.input.path, content: task.input.content }],
      evidence: { taskId: task.id },
    };
  };
}

test('a 64-wide graph has identical canonical output at capacity 1 and 16', async () => {
  const plan = widePlan(64);
  const serialMetrics = { active: 0, max: 0 };
  const parallelMetrics = { active: 0, max: 0 };

  const serial = await runCase(
    new CaseEngine({ caseId: 'wide-serial', plan }),
    yieldingExecutor(serialMetrics),
    { capacity: 1 },
  );
  const parallel = await runCase(
    new CaseEngine({ caseId: 'wide-parallel', plan }),
    yieldingExecutor(parallelMetrics),
    { capacity: 16 },
  );

  assert.equal(serial.caseState, 'succeeded');
  assert.equal(parallel.caseState, 'succeeded');
  assert.equal(serialMetrics.max, 1);
  assert.equal(parallelMetrics.max, 16);
  assert.equal(Object.keys(parallel.snapshot.canonicalTree).length, 65);
  assert.equal(serial.snapshot.canonicalDigest, parallel.snapshot.canonicalDigest);
  assert.deepEqual(serial.snapshot.canonicalTree, parallel.snapshot.canonicalTree);
  assert.deepEqual(serial.snapshot.promotionManifest, parallel.snapshot.promotionManifest);
});
