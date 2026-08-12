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

test('invalid external-effect result preserves uncertainty instead of claiming no effect', async () => {
  const plan = planWithWork([{
    id: 'effect',
    claims: [{ mode: 'execute', resource: 'remote:origin/main' }],
    execution: {
      operation: 'remote.apply',
      resultKind: 'effect-receipt',
      effectClass: 'idempotent-external',
      retry: { maxAttempts: 2 },
    },
  }]);
  const result = await runCase(
    new CaseEngine({ caseId: 'invalid-effect-result', plan }),
    async () => ({ kind: 'effect-receipt' }),
  );

  assert.equal(result.caseState, 'reconciling');
  assert.equal(result.status, 'reconciliation_required');
  assert.equal(result.snapshot.taskStates.effect.state, 'reconciling');
  assert.equal(result.snapshot.attempts['effect.1'].error.certainty, 'unknown');
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


test('runner rebuilds a discarded local ready candidate set before declaring deadlock', async () => {
  const engine = new CaseEngine({ caseId: 'ready-candidate-rebuild', plan: planWithWork([{ id: 'a' }]) });
  const authoritativeReadyTaskIds = engine.readyTaskIds.bind(engine);
  let calls = 0;
  engine.readyTaskIds = () => {
    calls += 1;
    return calls === 1 ? [] : authoritativeReadyTaskIds();
  };

  const result = await runCase(
    engine,
    async ({ baseDigest, task }) => ({
      kind: 'changeset',
      baseDigest,
      writes: [{ path: `${task.id}.txt`, content: task.id }],
    }),
  );

  assert.ok(calls >= 2);
  assert.equal(result.caseState, 'succeeded');
});

test('executor identity changes evidence but not the canonical result', async () => {
  const plan = planWithWork([
    { id: 'a', input: { path: 'a.txt' } },
    { id: 'b', input: { path: 'b.txt' } },
  ]);
  const execute = async ({ baseDigest, task }) => ({
    kind: 'changeset',
    baseDigest,
    writes: [{ path: task.input.path, content: task.id }],
  });

  const left = await runCase(
    new CaseEngine({ caseId: 'executor-identity-left', plan }),
    execute,
    { capacity: 2, executorIdentity: ({ ordinal }) => ({ id: `left-${ordinal}`, epoch: 1, capabilities: [] }) },
  );
  const right = await runCase(
    new CaseEngine({ caseId: 'executor-identity-right', plan }),
    execute,
    { capacity: 2, executorIdentity: ({ ordinal }) => ({ id: `right-${ordinal}`, epoch: 99, capabilities: [] }) },
  );

  assert.notEqual(left.snapshot.attempts['a.1'].executorId, right.snapshot.attempts['a.1'].executorId);
  assert.equal(left.snapshot.canonicalDigest, right.snapshot.canonicalDigest);
  assert.deepEqual(left.snapshot.canonicalTree, right.snapshot.canonicalTree);
});

test('retry interleaving does not change the canonical result', async () => {
  const plan = planWithWork([
    { id: 'a', input: { path: 'a.txt' } },
    { id: 'b', input: { path: 'b.txt' } },
  ]);

  function executor(delayedTaskId) {
    return async ({ baseDigest, task, attempt }) => {
      if (task.id === delayedTaskId) await new Promise((resolve) => setImmediate(resolve));
      if (task.id === 'a' && attempt.ordinal === 1) {
        const error = new Error('retry once');
        error.code = 'transient';
        error.certainty = 'not_applied';
        error.retryable = true;
        throw error;
      }
      return {
        kind: 'changeset',
        baseDigest,
        writes: [{ path: task.input.path, content: task.id }],
      };
    };
  }

  const aDelayed = await runCase(
    new CaseEngine({ caseId: 'retry-a-delayed', plan }),
    executor('a'),
    { capacity: 2 },
  );
  const bDelayed = await runCase(
    new CaseEngine({ caseId: 'retry-b-delayed', plan }),
    executor('b'),
    { capacity: 2 },
  );

  assert.equal(aDelayed.snapshot.taskStates.a.attemptIds.length, 2);
  assert.equal(bDelayed.snapshot.taskStates.a.attemptIds.length, 2);
  assert.equal(aDelayed.snapshot.canonicalDigest, bDelayed.snapshot.canonicalDigest);
  assert.deepEqual(aDelayed.snapshot.canonicalTree, bDelayed.snapshot.canonicalTree);
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function resolvesBeforeGuard(promise, guardMs = 250) {
  let timer;
  try {
    return await Promise.race([
      promise.then(() => true),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(false), guardMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

test('D0018 C1 active semantic cancellation promptly aborts the exact live invocation', async () => {
  const engine = new CaseEngine({ caseId: 'd0018-c1-active-cancel', plan: planWithWork([{ id: 'a' }]) });
  const entered = deferred();
  const release = deferred();
  const abortSeen = deferred();
  let executorCalls = 0;

  const running = runCase(engine, async ({ baseDigest, task, signal }) => {
    executorCalls += 1;
    signal.addEventListener('abort', () => abortSeen.resolve(), { once: true });
    entered.resolve();
    await release.promise;
    return {
      kind: 'changeset',
      baseDigest,
      writes: [{ path: `${task.id}.txt`, content: 'late' }],
    };
  });

  await entered.promise;
  engine.cancelTask('a', 'D0018 C1');
  const abortedBeforeRelease = await resolvesBeforeGuard(abortSeen.promise);
  release.resolve();
  const result = await running;

  assert.equal(abortedBeforeRelease, true, 'semantic cancellation must wake and abort the live invocation before executor settlement');
  assert.equal(executorCalls, 1);
  assert.equal(result.snapshot.attempts['a.1'].state, 'cancelled');
  assert.deepEqual(result.snapshot.canonicalTree, {});
});

test('D0018 C2 cancellation during attempt_started checkpoint prevents executor invocation', async () => {
  const engine = new CaseEngine({ caseId: 'd0018-c2-checkpoint-cancel', plan: planWithWork([{ id: 'a' }]) });
  const checkpointEntered = deferred();
  const releaseCheckpoint = deferred();
  let blocked = false;
  let executorCalls = 0;

  const running = runCase(
    engine,
    async ({ baseDigest, task }) => {
      executorCalls += 1;
      return {
        kind: 'changeset',
        baseDigest,
        writes: [{ path: `${task.id}.txt`, content: task.id }],
      };
    },
    {
      checkpoint: async (snapshot, metadata) => {
        if (!blocked && metadata.reason === 'attempt_started') {
          blocked = true;
          checkpointEntered.resolve(snapshot.caseRevision);
          await releaseCheckpoint.promise;
        }
      },
    },
  );

  await checkpointEntered.promise;
  engine.cancelTask('a', 'D0018 C2');
  releaseCheckpoint.resolve();
  const result = await running;

  assert.equal(executorCalls, 0, 'runner must re-read Attempt authority after the awaited attempt_started checkpoint');
  assert.equal(result.snapshot.attempts['a.1'].state, 'cancelled');
});

test('D0018 C3 checkpoint acknowledgement drains the exact newer semantic revision', async () => {
  const engine = new CaseEngine({ caseId: 'd0018-c3-exact-checkpoint', plan: planWithWork([{ id: 'a' }]) });
  const checkpointEntered = deferred();
  const releaseCheckpoint = deferred();
  const persisted = [];
  let blocked = false;

  const running = runCase(
    engine,
    async ({ baseDigest, task }) => ({
      kind: 'changeset',
      baseDigest,
      writes: [{ path: `${task.id}.txt`, content: task.id }],
    }),
    {
      checkpoint: async (snapshot, metadata) => {
        assert.equal(metadata.caseRevision, snapshot.caseRevision, 'checkpoint metadata must describe the exact captured snapshot');
        if (!blocked && metadata.reason === 'attempt_started') {
          blocked = true;
          checkpointEntered.resolve(snapshot.caseRevision);
          await releaseCheckpoint.promise;
        }
        persisted.push(snapshot.caseRevision);
      },
    },
  );

  const oldRevision = await checkpointEntered.promise;
  engine.cancelTask('a', 'D0018 C3');
  const cancellationRevision = engine.caseRevision;
  assert.ok(cancellationRevision > oldRevision);
  releaseCheckpoint.resolve();
  await running;

  assert.equal(persisted[0], oldRevision);
  assert.equal(persisted.at(-1), cancellationRevision, 'the newer cancellation revision must actually be persisted, not merely acknowledged');
  assert.ok(persisted.length >= 2, 'checkpoint drain must persist a newer snapshot after stale I/O completes');
});

test('D0018 C4 runtime accounting releases an execution handle only after settlement', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/runner.mjs', import.meta.url), 'utf8');
  const settleIndex = source.indexOf('await settle(outcome);');
  const releaseIndex = source.indexOf('running.delete(outcome.attemptId);');
  assert.ok(settleIndex >= 0 && releaseIndex >= 0);
  assert.ok(settleIndex < releaseIndex, 'capacity accounting must retain the predecessor slot through settlement');
});

test('D0018 C4 capacity one does not start eligible work while predecessor cleanup is held', async () => {
  const engine = new CaseEngine({
    caseId: 'd0018-c4-capacity-cleanup',
    plan: planWithWork([{ id: 'a' }, { id: 'b' }]),
  });
  const aEntered = deferred();
  const releaseCleanup = deferred();
  let bStarted = false;

  const running = runCase(
    engine,
    async ({ baseDigest, task }) => {
      if (task.id === 'a') {
        aEntered.resolve();
        await releaseCleanup.promise;
      } else if (task.id === 'b') {
        bStarted = true;
      }
      return {
        kind: 'changeset',
        baseDigest,
        writes: [{ path: `${task.id}.txt`, content: task.id }],
      };
    },
    { capacity: 1 },
  );

  await aEntered.promise;
  engine.cancelTask('a', 'D0018 C4');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(bStarted, false, 'B must remain out of the runtime slot until A cleanup settles');
  releaseCleanup.resolve();
  const result = await running;

  assert.equal(bStarted, true);
  assert.equal(result.maxConcurrent, 1);
});
