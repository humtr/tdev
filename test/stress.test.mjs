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

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 0x100000000;
  };
}

function randomizedObservationPlan(seed, count = 8) {
  const random = seededRandom(seed * 2654435761);
  const ids = Array.from({ length: count }, (_, index) =>
    `task-${String((count - index) * 17 + (seed % 13)).padStart(4, '0')}`);
  const work = ids.map((id, index) => {
    const dependencies = [];
    for (let earlier = 0; earlier < index; earlier += 1) {
      if (random() < 0.24) dependencies.push(ids[earlier]);
    }
    return {
      id,
      kind: 'work',
      dependencies,
      claims: [],
      input: {},
      execution: {
        operation: 'repo.observe',
        resultKind: 'observation',
        effectClass: 'result-only',
        retry: { maxAttempts: 3 },
      },
    };
  });
  return definePlan({
    revisionId: `randomized-${seed}`,
    baseTree: {},
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

function assertFullRestoreOracle(engine) {
  const snapshot = engine.snapshot();
  const restored = CaseEngine.restore(snapshot, { reopen: false });
  assert.deepEqual(restored.snapshot(), snapshot);
  assert.deepEqual(restored.readyTaskIds(), engine.readyTaskIds());
  assert.deepEqual(restored.claimHoldingTaskIds(), engine.claimHoldingTaskIds());
}

test('100 randomized transition histories match the full restore oracle after every step', () => {
  const terminal = new Set(['succeeded', 'failed', 'cancelled', 'unverified']);
  let transitions = 0;
  for (let seed = 1; seed <= 100; seed += 1) {
    const random = seededRandom(seed ^ 0x9e3779b9);
    const engine = new CaseEngine({ caseId: `randomized-case-${seed}`, plan: randomizedObservationPlan(seed) });
    assertFullRestoreOracle(engine);

    let steps = 0;
    while (!terminal.has(engine.caseState) && steps < 200) {
      steps += 1;
      const running = engine.runningTaskIds();
      const ready = engine.readyTaskIds();
      if (running.length > 0 && (ready.length === 0 || random() < 0.65)) {
        const taskId = running[Math.floor(random() * running.length)];
        const taskState = engine.taskStates[taskId];
        const attemptId = taskState.attemptIds.at(-1);
        const action = random();
        if (engine.plan.tasksById[taskId].kind === 'promotion' || action < 0.65) {
          const result = engine.plan.tasksById[taskId].kind === 'promotion'
            ? engine.createPromotionResult(taskId)
            : { kind: 'observation', subject: taskId, value: { seed, steps } };
          engine.acceptResult(engine.resultEnvelope(attemptId, result));
        } else if (action < 0.85) {
          engine.failAttempt(
            attemptId,
            { code: 'random_failure', message: 'random failure', certainty: 'not_applied' },
            { retryable: random() < 0.6 },
          );
        } else {
          engine.cancelTask(taskId, 'random cancellation');
        }
      } else if (ready.length > 0) {
        const taskId = ready[Math.floor(random() * ready.length)];
        engine.startAttempt(taskId, { id: `executor-${seed}-${steps}`, epoch: 1, capabilities: [] });
      } else {
        engine.reconcile();
      }
      transitions += 1;
      assertFullRestoreOracle(engine);
    }
    assert.ok(steps < 200, `seed ${seed} did not terminate`);
  }
  assert.ok(transitions > 500);
});
