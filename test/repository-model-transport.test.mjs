import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ContractError, canonicalJson, digest, strictJsonParse } from '../src/canonical.mjs';
import { CaseEngine, definePlan } from '../src/engine.mjs';
import {
  MODEL_REPOSITORY_OPERATION,
  MODEL_TRANSPORT_PROFILE,
  GitRepositoryModelExecutor,
} from '../src/repository-model-transport.mjs';
import { runGitCommand } from '../src/git-projection.mjs';
import { runCase } from '../src/runner.mjs';

const FIXTURE = fileURLToPath(new URL('./model-subprocess-fixture.mjs', import.meta.url));

function git(repositoryPath, args, input = null, env = process.env) {
  const result = spawnSync('git', ['-C', repositoryPath, ...args], {
    input,
    encoding: null,
    env,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.toString('utf8')}`);
  }
  return result.stdout;
}

function makeRepo(t, files = {
  'a.txt': { content: 'alpha\n' },
  'script.sh': { content: '#!/bin/sh\necho hi\n', executable: true },
}) {
  const repositoryPath = mkdtempSync(path.join(tmpdir(), 'tdev-d0013-'));
  t.after(() => rmSync(repositoryPath, { recursive: true, force: true }));
  git(repositoryPath, ['init', '-q']);
  git(repositoryPath, ['config', 'user.name', 'tdev']);
  git(repositoryPath, ['config', 'user.email', 'tdev@example.invalid']);
  const baseTree = Object.create(null);
  for (const [filePath, spec] of Object.entries(files)) {
    const absolute = path.join(repositoryPath, filePath);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, spec.content);
    if (spec.executable) chmodSync(absolute, 0o755);
    if (typeof spec.content === 'string') baseTree[filePath] = spec.content;
  }
  git(repositoryPath, ['add', '-A']);
  git(repositoryPath, ['commit', '-qm', 'base']);
  return {
    repositoryPath,
    commitOid: git(repositoryPath, ['rev-parse', 'HEAD']).toString('utf8').trim(),
    baseTree,
  };
}

function execution(maxAttempts = 1) {
  return {
    operation: MODEL_REPOSITORY_OPERATION,
    resultKind: 'changeset',
    effectClass: 'result-only',
    retry: { maxAttempts },
    requirePassed: false,
  };
}

function planFor({ commitOid, baseTree, instruction = 'model-content', maxAttempts = 1, operation = MODEL_REPOSITORY_OPERATION }) {
  return definePlan({
    revisionId: 'plan-d0013',
    baseTree,
    tasks: [
      {
        id: 'model',
        kind: 'work',
        dependencies: [],
        claims: [],
        input: { repositoryCommitOid: commitOid, instruction },
        execution: { ...execution(maxAttempts), operation },
      },
      {
        id: 'promote',
        kind: 'promotion',
        dependencies: ['model'],
        claims: [{ mode: 'write', resource: 'canonical:tree' }],
        input: {},
      },
    ],
  });
}

function adapterFor(repositoryPath, behavior = 'changeset', options = {}) {
  return new GitRepositoryModelExecutor({
    repositoryPath,
    modelExecutable: process.execPath,
    modelArgs: [FIXTURE, behavior],
    timeoutMs: 2_000,
    ...options,
  });
}

function directInvocation(plan, taskId = 'model') {
  const engine = new CaseEngine({ caseId: 'case-d0013', plan });
  const attempt = engine.startAttempt(taskId, 'executor-d0013');
  return {
    engine,
    attempt,
    invocation: {
      caseId: engine.caseId,
      planRevisionId: engine.plan.revisionId,
      planDigest: engine.plan.planDigest,
      baseDigest: engine.plan.baseDigest,
      effectKey: attempt.effectKey,
      fencingToken: attempt.fencingToken,
      claimLease: attempt.claimLease,
      signal: new AbortController().signal,
      task: engine.plan.tasksById[taskId],
      attempt,
      acceptedResults: [],
    },
  };
}

function successfulModelRunner(capture = null) {
  return async ({ input }) => {
    if (capture !== null) capture.push(Buffer.from(input));
    const request = strictJsonParse(input, {
      maxBytes: 32 * 1024 * 1024,
      maxStringCodePoints: 32 * 1024 * 1024,
    });
    const stdout = Buffer.from(canonicalJson({
      schemaVersion: 1,
      profile: MODEL_TRANSPORT_PROFILE,
      requestDigest: request.requestDigest,
      result: {
        kind: 'changeset',
        baseDigest: request.invocation.baseDigest,
        writes: [],
      },
    }), 'utf8');
    return {
      code: 0,
      signal: null,
      stdout,
      stdoutBytes: stdout.length,
      stderrBytes: 0,
      durationMs: 0,
    };
  };
}

function countingGitRunner(options = {}) {
  const metrics = {
    calls: [],
    stdoutBytes: 0,
    inputBytes: 0,
  };
  return {
    metrics,
    runner: async (input) => {
      metrics.calls.push([...input.args]);
      metrics.inputBytes += input.input?.length ?? 0;
      if (options.before !== undefined) await options.before(input, metrics);
      const result = await runGitCommand(input);
      metrics.stdoutBytes += result.stdout.length;
      return result;
    },
  };
}

function cleanState(repositoryPath) {
  return {
    head: git(repositoryPath, ['rev-parse', 'HEAD']).toString('utf8').trim(),
    status: git(repositoryPath, ['status', '--porcelain=v1']).toString('utf8'),
    index: git(repositoryPath, ['write-tree']).toString('utf8').trim(),
  };
}

test('real Git context and real subprocess complete through the existing runner without repository mutation', async (t) => {
  const repo = makeRepo(t);
  const plan = planFor(repo);
  const engine = new CaseEngine({ caseId: 'case-real-model', plan });
  const observations = [];
  const adapter = adapterFor(repo.repositoryPath, 'changeset', { observation: (entry) => observations.push(entry) });
  const before = cleanState(repo.repositoryPath);

  const report = await runCase(engine, (invocation) => adapter.execute(invocation), { capacity: 1 });

  assert.equal(report.status, 'terminal');
  assert.equal(report.caseState, 'succeeded');
  assert.equal(report.snapshot.taskStates.model.state, 'succeeded');
  assert.equal(report.snapshot.taskStates.model.acceptedResult.writes[0].path, 'model-output.txt');
  assert.equal(report.snapshot.taskStates.model.acceptedResult.writes[0].content, 'model-content');
  assert.deepEqual(cleanState(repo.repositoryPath), before);
  assert.equal(observations.length, 1);
  assert.equal(observations[0].processStarts, 1);
  assert.equal(observations[0].processReuses, 0);
  assert.equal(observations[0].outcome, 'returned');
});

test('context materialization is deterministic and preserves executable mode outside semantic digest', async (t) => {
  const repo = makeRepo(t);
  const plan = planFor(repo);
  const adapter = adapterFor(repo.repositoryPath);
  const first = await adapter.materializeContext(repo.commitOid, plan.baseDigest);
  const second = await adapter.materializeContext(repo.commitOid, plan.baseDigest);

  assert.equal(first.descriptor.contextDigest, second.descriptor.contextDigest);
  assert.equal(first.descriptor.semanticBaseDigest, plan.baseDigest);
  assert.equal(first.descriptor.fileCount, 2);
  assert.deepEqual(first.files.map(({ path: filePath, mode }) => [filePath, mode]), [
    ['a.txt', '100644'],
    ['script.sh', '100755'],
  ]);
  assert.equal(digest(Object.fromEntries(first.files.map((entry) => [entry.path, entry.content]))), plan.baseDigest);
});

test('context reads the immutable commit rather than a mutated worktree', async (t) => {
  const repo = makeRepo(t);
  const plan = planFor(repo);
  writeFileSync(path.join(repo.repositoryPath, 'a.txt'), 'worktree-only-change\n');
  writeFileSync(path.join(repo.repositoryPath, 'untracked.txt'), 'ignored\n');
  const adapter = adapterFor(repo.repositoryPath);
  const context = await adapter.materializeContext(repo.commitOid, plan.baseDigest);
  const a = context.files.find((entry) => entry.path === 'a.txt');
  assert.equal(a.content, 'alpha\n');
  assert.equal(context.files.some((entry) => entry.path === 'untracked.txt'), false);
});

test('base mismatch fails before model process admission', async (t) => {
  const repo = makeRepo(t);
  const plan = planFor(repo);
  const direct = directInvocation(plan);
  let modelStarts = 0;
  const adapter = adapterFor(repo.repositoryPath, 'changeset', {
    modelRunner: async () => { modelStarts += 1; throw new Error('must not run'); },
  });
  direct.invocation.baseDigest = 'sha256:' + '0'.repeat(64);
  await assert.rejects(
    adapter.execute(direct.invocation),
    (error) => error instanceof ContractError && error.code === 'repository_context_base_mismatch',
  );
  assert.equal(modelStarts, 0);
});

test('unsupported symlink repository entry fails closed before model process', async (t) => {
  const repo = makeRepo(t, { 'a.txt': { content: 'alpha\n' } });
  symlinkSync('a.txt', path.join(repo.repositoryPath, 'link.txt'));
  git(repo.repositoryPath, ['add', 'link.txt']);
  git(repo.repositoryPath, ['commit', '-qm', 'symlink']);
  const commitOid = git(repo.repositoryPath, ['rev-parse', 'HEAD']).toString('utf8').trim();
  let starts = 0;
  const adapter = adapterFor(repo.repositoryPath, 'changeset', {
    modelRunner: async () => { starts += 1; throw new Error('must not run'); },
  });
  await assert.rejects(
    adapter.materializeContext(commitOid, digest({ 'a.txt': 'alpha\n' })),
    (error) => error instanceof ContractError && error.code === 'unsupported_repository_entry',
  );
  assert.equal(starts, 0);
});

test('invalid UTF-8 repository blob fails closed', async (t) => {
  const repo = makeRepo(t, { 'bad.bin': { content: Buffer.from([0xff, 0xfe, 0xfd]) } });
  const adapter = adapterFor(repo.repositoryPath);
  await assert.rejects(
    adapter.materializeContext(repo.commitOid, 'sha256:' + '0'.repeat(64)),
    (error) => error instanceof ContractError && error.code === 'repository_context_invalid_utf8',
  );
});

test('subprocess response is bound to the exact request digest', async (t) => {
  const repo = makeRepo(t);
  const plan = planFor(repo);
  const direct = directInvocation(plan);
  const adapter = adapterFor(repo.repositoryPath, 'wrong-digest');
  await assert.rejects(
    adapter.execute(direct.invocation),
    (error) => error instanceof ContractError && error.code === 'model_response_request_mismatch',
  );
});

test('invalid subprocess response emits bounded failed observation', async (t) => {
  const repo = makeRepo(t);
  const plan = planFor(repo);
  const direct = directInvocation(plan);
  const observations = [];
  const adapter = adapterFor(repo.repositoryPath, 'invalid-json', {
    observation: (entry) => observations.push(entry),
  });
  await assert.rejects(adapter.execute(direct.invocation), ContractError);
  assert.equal(observations.length, 1);
  assert.notEqual(observations[0].outcome, 'returned');
  assert.equal(observations[0].processStarts, 1);
  assert.equal(observations[0].responseBytes > 0, true);
  assert.equal(Object.hasOwn(observations[0], 'stderr'), false);
});

test('task operation and result-only class are admitted explicitly', async (t) => {
  const repo = makeRepo(t);
  const plan = planFor({ ...repo, operation: 'other.operation' });
  const direct = directInvocation(plan);
  let starts = 0;
  const adapter = adapterFor(repo.repositoryPath, 'changeset', {
    modelRunner: async () => { starts += 1; throw new Error('must not run'); },
  });
  await assert.rejects(
    adapter.execute(direct.invocation),
    (error) => error instanceof ContractError && error.code === 'unsupported_model_task',
  );
  assert.equal(starts, 0);
});

test('spawn failure records zero process starts and no accepted result', async (t) => {
  const repo = makeRepo(t);
  const plan = planFor(repo);
  const direct = directInvocation(plan);
  const observations = [];
  const adapter = new GitRepositoryModelExecutor({
    repositoryPath: repo.repositoryPath,
    modelExecutable: path.join(repo.repositoryPath, 'does-not-exist'),
    timeoutMs: 2_000,
    observation: (entry) => observations.push(entry),
  });
  await assert.rejects(
    adapter.execute(direct.invocation),
    (error) => error instanceof ContractError && error.code === 'model_process_spawn_failed',
  );
  assert.equal(observations.length, 1);
  assert.equal(observations[0].processStarts, 0);
  assert.equal(observations[0].outcome, 'model_process_spawn_failed');
});

test('process failure exposes bounded facts without raw stderr', async (t) => {
  const repo = makeRepo(t);
  const plan = planFor(repo);
  const direct = directInvocation(plan);
  const adapter = adapterFor(repo.repositoryPath, 'nonzero');
  await assert.rejects(
    adapter.execute(direct.invocation),
    (error) => {
      assert.equal(error instanceof ContractError, true);
      assert.equal(error.code, 'model_process_failed');
      assert.equal(error.details.exitCode, 7);
      assert.equal(JSON.stringify(error.details).includes('fixture-secret-diagnostic'), false);
      return true;
    },
  );
});

test('timeout and stdout overflow terminate the subprocess with bounded failure', async (t) => {
  const repo = makeRepo(t);
  const plan = planFor(repo);
  const directTimeout = directInvocation(plan);
  const timeoutAdapter = adapterFor(repo.repositoryPath, 'sleep', { timeoutMs: 30 });
  await assert.rejects(
    timeoutAdapter.execute(directTimeout.invocation),
    (error) => error instanceof ContractError && error.code === 'model_transport_timeout',
  );

  const directOutput = directInvocation(plan);
  const outputAdapter = adapterFor(repo.repositoryPath, 'oversize', { limits: { maxResponseBytes: 512 } });
  await assert.rejects(
    outputAdapter.execute(directOutput.invocation),
    (error) => error instanceof ContractError && error.code === 'model_output_limit_exceeded',
  );
});

test('AbortSignal terminates an in-flight sleeping subprocess without an accepted result', async (t) => {
  const repo = makeRepo(t);
  const plan = planFor(repo);
  const direct = directInvocation(plan);
  const controller = new AbortController();
  direct.invocation.signal = controller.signal;
  const observations = [];
  const adapter = adapterFor(repo.repositoryPath, 'sleep', {
    timeoutMs: 5_000,
    observation: (entry) => observations.push(entry),
  });
  const pending = adapter.execute(direct.invocation);
  const timer = setTimeout(() => controller.abort(), 1_500);
  try {
    await assert.rejects(
      pending,
      (error) => error instanceof ContractError && error.code === 'model_transport_aborted',
    );
  } finally {
    clearTimeout(timer);
  }
  assert.equal(observations.length, 1);
  assert.equal(observations[0].outcome, 'model_transport_aborted');
  assert.equal(observations[0].processStarts, 1);
});

test('inherited Git routing and caller environment do not redirect or leak into model subprocess', async (t) => {
  const repo = makeRepo(t);
  const other = makeRepo(t, { 'other.txt': { content: 'other\n' } });
  const plan = planFor({ ...repo, instruction: 'unused' });
  const direct = directInvocation(plan);
  const previousGitDir = process.env.GIT_DIR;
  const previousSecret = process.env.TDEV_SHOULD_NOT_LEAK;
  process.env.GIT_DIR = path.join(other.repositoryPath, '.git');
  process.env.TDEV_SHOULD_NOT_LEAK = 'secret';
  try {
    const adapter = adapterFor(repo.repositoryPath, 'envcheck');
    const result = await adapter.execute(direct.invocation);
    assert.equal(result.writes[0].content, 'absent');
    const context = await adapter.materializeContext(repo.commitOid, plan.baseDigest);
    assert.equal(context.files.some((entry) => entry.path === 'other.txt'), false);
  } finally {
    if (previousGitDir === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = previousGitDir;
    if (previousSecret === undefined) delete process.env.TDEV_SHOULD_NOT_LEAK; else process.env.TDEV_SHOULD_NOT_LEAK = previousSecret;
  }
});

test('pre-aborted invocation performs no Git or model work', async (t) => {
  const repo = makeRepo(t);
  const plan = planFor(repo);
  const direct = directInvocation(plan);
  const controller = new AbortController();
  controller.abort();
  direct.invocation.signal = controller.signal;
  const counted = countingGitRunner();
  let modelCalls = 0;
  const adapter = adapterFor(repo.repositoryPath, 'changeset', {
    gitRunner: counted.runner,
    modelRunner: async () => { modelCalls += 1; throw new Error('must not run'); },
  });
  await assert.rejects(
    adapter.execute(direct.invocation),
    (error) => error instanceof ContractError && error.code === 'model_transport_aborted',
  );
  assert.equal(counted.metrics.calls.length, 0);
  assert.equal(modelCalls, 0);
});

test('same-base concurrent Attempts single-flight one immutable context preparation', async (t) => {
  const repo = makeRepo(t, Object.fromEntries(
    Array.from({ length: 32 }, (_, index) => [`file-${index}.txt`, { content: `value-${index}\n` }]),
  ));
  const plan = planFor(repo);
  const observations = [];
  let batchCalls = 0;
  const counted = countingGitRunner({
    before: async ({ args }) => {
      if (args[0] === 'cat-file' && args[1] === '--batch') {
        batchCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
    },
  });
  let modelCalls = 0;
  const modelRunner = successfulModelRunner();
  const adapter = adapterFor(repo.repositoryPath, 'changeset', {
    gitRunner: counted.runner,
    modelRunner: async (input) => {
      modelCalls += 1;
      return modelRunner(input);
    },
    observation: (entry) => observations.push(entry),
  });
  const invocations = Array.from({ length: 8 }, () => directInvocation(plan).invocation);
  await Promise.all(invocations.map((invocation) => adapter.execute(invocation)));

  assert.equal(batchCalls, 1);
  assert.equal(counted.metrics.calls.filter((args) => args[0] === 'ls-tree').length, 1);
  assert.equal(modelCalls, 8);
  assert.equal(observations.reduce((sum, entry) => sum + entry.contextMaterializations, 0), 1);
  assert.equal(observations.reduce((sum, entry) => sum + entry.gitCommandCount, 0), 5);
  assert.equal(observations.filter((entry) => entry.cacheStatus === 'shared').length >= 1, true);
});

test('different immutable bases prepare concurrently without a global cache lock', async (t) => {
  const repo = makeRepo(t, { 'a.txt': { content: 'base-one\n' } });
  const firstPlan = planFor(repo);
  writeFileSync(path.join(repo.repositoryPath, 'a.txt'), 'base-two\n');
  git(repo.repositoryPath, ['add', 'a.txt']);
  git(repo.repositoryPath, ['commit', '-qm', 'second']);
  const second = {
    repositoryPath: repo.repositoryPath,
    commitOid: git(repo.repositoryPath, ['rev-parse', 'HEAD']).toString('utf8').trim(),
    baseTree: { 'a.txt': 'base-two\n' },
  };
  const secondPlan = planFor(second);
  let active = 0;
  let maxActive = 0;
  let batchCalls = 0;
  const counted = countingGitRunner({
    before: async ({ args }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      if (args[0] === 'cat-file' && args[1] === '--batch') batchCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
    },
  });
  const adapter = adapterFor(repo.repositoryPath, 'changeset', {
    gitRunner: counted.runner,
    modelRunner: successfulModelRunner(),
  });
  await Promise.all([
    adapter.execute(directInvocation(firstPlan).invocation),
    adapter.execute(directInvocation(secondPlan).invocation),
  ]);
  assert.equal(batchCalls, 2);
  assert.equal(maxActive >= 2, true);
});

test('producer failure is not cached and the next Attempt rebuilds', async (t) => {
  const repo = makeRepo(t);
  const plan = planFor(repo);
  let failed = false;
  let treeCalls = 0;
  const runner = async (input) => {
    if (input.args[0] === 'ls-tree') {
      treeCalls += 1;
      if (!failed) {
        failed = true;
        return { code: 1, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.from('injected') };
      }
    }
    return runGitCommand(input);
  };
  const adapter = adapterFor(repo.repositoryPath, 'changeset', {
    gitRunner: runner,
    modelRunner: successfulModelRunner(),
  });
  await assert.rejects(
    adapter.execute(directInvocation(plan).invocation),
    (error) => error instanceof ContractError && error.code === 'repository_git_command_failed',
  );
  await adapter.execute(directInvocation(plan).invocation);
  assert.equal(treeCalls, 2);
});

test('one cancelled reader does not poison another same-base reader', async (t) => {
  const repo = makeRepo(t, { 'a.txt': { content: 'alpha\n' } });
  const plan = planFor(repo);
  let releaseBatch;
  const batchStarted = new Promise((resolve) => { releaseBatch = resolve; });
  let producerSignal = null;
  let batchGateResolve;
  const batchGate = new Promise((resolve) => { batchGateResolve = resolve; });
  const runner = async (input) => {
    if (input.args[0] === 'cat-file' && input.args[1] === '--batch') {
      producerSignal = input.signal;
      releaseBatch();
      await batchGate;
    }
    return runGitCommand(input);
  };
  const adapter = adapterFor(repo.repositoryPath, 'changeset', {
    gitRunner: runner,
    modelRunner: successfulModelRunner(),
  });
  const first = directInvocation(plan);
  const second = directInvocation(plan);
  const controller = new AbortController();
  first.invocation.signal = controller.signal;
  const firstPending = adapter.execute(first.invocation);
  await batchStarted;
  const secondPending = adapter.execute(second.invocation);
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  batchGateResolve();
  await assert.rejects(
    firstPending,
    (error) => error instanceof ContractError && error.code === 'model_transport_aborted',
  );
  await secondPending;
  assert.equal(producerSignal.aborted, false);
});

test('all cancelled readers abort the shared Git producer', async (t) => {
  const repo = makeRepo(t);
  const plan = planFor(repo);
  let producerSignal = null;
  let startedResolve;
  const started = new Promise((resolve) => { startedResolve = resolve; });
  const runner = async (input) => {
    producerSignal = input.signal;
    startedResolve();
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(new ContractError('git_process_aborted', 'injected abort'));
      input.signal.addEventListener('abort', onAbort, { once: true });
      if (input.signal.aborted) onAbort();
    });
  };
  let modelCalls = 0;
  const adapter = adapterFor(repo.repositoryPath, 'changeset', {
    gitRunner: runner,
    modelRunner: async () => { modelCalls += 1; throw new Error('must not run'); },
  });
  const first = directInvocation(plan);
  const second = directInvocation(plan);
  const firstController = new AbortController();
  const secondController = new AbortController();
  first.invocation.signal = firstController.signal;
  second.invocation.signal = secondController.signal;
  const firstPending = adapter.execute(first.invocation);
  const secondPending = adapter.execute(second.invocation);
  await started;
  firstController.abort();
  secondController.abort();
  await assert.rejects(firstPending, (error) => error?.code === 'model_transport_aborted');
  await assert.rejects(secondPending, (error) => error?.code === 'model_transport_aborted');
  assert.equal(producerSignal.aborted, true);
  assert.equal(modelCalls, 0);
});

test('cache-disabled cold path and cache-hit path produce identical canonical request bytes', async (t) => {
  const repo = makeRepo(t);
  const plan = planFor(repo);
  const invocation = directInvocation(plan).invocation;
  const coldInputs = [];
  const warmInputs = [];
  const cold = adapterFor(repo.repositoryPath, 'changeset', {
    contextCache: false,
    modelRunner: successfulModelRunner(coldInputs),
  });
  const warm = adapterFor(repo.repositoryPath, 'changeset', {
    modelRunner: successfulModelRunner(warmInputs),
  });
  await cold.execute(invocation);
  await warm.execute(invocation);
  await warm.execute(invocation);
  assert.equal(coldInputs.length, 1);
  assert.equal(warmInputs.length, 2);
  assert.deepEqual(warmInputs[0], coldInputs[0]);
  assert.deepEqual(warmInputs[1], coldInputs[0]);
  assert.equal(canonicalJson(strictJsonParse(coldInputs[0])), coldInputs[0].toString('utf8'));
});

test('a different immutable commit with the same semantic base cannot reuse stale cached context', async (t) => {
  const repo = makeRepo(t, { 'a.txt': { content: 'same\n' } });
  const firstPlan = planFor(repo);
  git(repo.repositoryPath, ['commit', '--allow-empty', '-qm', 'same-tree-new-commit']);
  const second = {
    repositoryPath: repo.repositoryPath,
    commitOid: git(repo.repositoryPath, ['rev-parse', 'HEAD']).toString('utf8').trim(),
    baseTree: repo.baseTree,
  };
  const secondPlan = planFor(second);
  assert.equal(firstPlan.baseDigest, secondPlan.baseDigest);
  assert.notEqual(repo.commitOid, second.commitOid);
  let batchCalls = 0;
  const counted = countingGitRunner({
    before: ({ args }) => {
      if (args[0] === 'cat-file' && args[1] === '--batch') batchCalls += 1;
    },
  });
  const adapter = adapterFor(repo.repositoryPath, 'changeset', {
    gitRunner: counted.runner,
    modelRunner: successfulModelRunner(),
  });
  await adapter.execute(directInvocation(firstPlan).invocation);
  await adapter.execute(directInvocation(secondPlan).invocation);
  assert.equal(batchCalls, 2);
});

test('bounded LRU eviction rebuilds evicted context without changing semantics', async (t) => {
  const repo = makeRepo(t, { 'a.txt': { content: 'one\n' } });
  const firstPlan = planFor(repo);
  writeFileSync(path.join(repo.repositoryPath, 'a.txt'), 'two\n');
  git(repo.repositoryPath, ['add', 'a.txt']);
  git(repo.repositoryPath, ['commit', '-qm', 'two']);
  const second = {
    repositoryPath: repo.repositoryPath,
    commitOid: git(repo.repositoryPath, ['rev-parse', 'HEAD']).toString('utf8').trim(),
    baseTree: { 'a.txt': 'two\n' },
  };
  const secondPlan = planFor(second);
  let batchCalls = 0;
  const counted = countingGitRunner({
    before: ({ args }) => {
      if (args[0] === 'cat-file' && args[1] === '--batch') batchCalls += 1;
    },
  });
  const adapter = adapterFor(repo.repositoryPath, 'changeset', {
    contextCache: { maxEntries: 1, maxBytes: 1024 * 1024 },
    gitRunner: counted.runner,
    modelRunner: successfulModelRunner(),
  });
  await adapter.execute(directInvocation(firstPlan).invocation);
  await adapter.execute(directInvocation(secondPlan).invocation);
  await adapter.execute(directInvocation(firstPlan).invocation);
  assert.equal(batchCalls, 3);
});

test('oversized preparations single-flight in flight but are not retained across later calls or restart', async (t) => {
  const repo = makeRepo(t, {
    'large.txt': { content: 'x'.repeat(64 * 1024) },
  });
  const plan = planFor(repo);
  let batchCalls = 0;
  const observations = [];
  const counted = countingGitRunner({
    before: async ({ args }) => {
      if (args[0] === 'cat-file' && args[1] === '--batch') {
        batchCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
    },
  });
  const options = {
    contextCache: { maxEntries: 4, maxBytes: 1 },
    gitRunner: counted.runner,
    modelRunner: successfulModelRunner(),
    observation: (entry) => observations.push(entry),
  };
  const firstExecutor = adapterFor(repo.repositoryPath, 'changeset', options);
  await Promise.all([
    firstExecutor.execute(directInvocation(plan).invocation),
    firstExecutor.execute(directInvocation(plan).invocation),
  ]);
  assert.equal(batchCalls, 1);
  assert.equal(observations.every((entry) => entry.contextRetained === false), true);
  assert.equal(observations.some((entry) => entry.cacheStatus === 'shared'), true);

  await firstExecutor.execute(directInvocation(plan).invocation);
  assert.equal(batchCalls, 2);

  const restartedExecutor = adapterFor(repo.repositoryPath, 'changeset', options);
  await restartedExecutor.execute(directInvocation(plan).invocation);
  assert.equal(batchCalls, 3);
});

test('tree and request size limits fail before blob-body reads', async (t) => {
  const repo = makeRepo(t, {
    'a.txt': { content: 'a'.repeat(800) },
    'b.txt': { content: 'b'.repeat(800) },
  });
  let batchCalls = 0;
  const counted = countingGitRunner({
    before: ({ args }) => {
      if (args[0] === 'cat-file' && args[1] === '--batch') batchCalls += 1;
    },
  });
  const treeLimited = adapterFor(repo.repositoryPath, 'changeset', {
    limits: { maxTreeBytes: 1024 },
    gitRunner: counted.runner,
  });
  await assert.rejects(
    treeLimited.materializeContext(repo.commitOid, 'sha256:' + '0'.repeat(64)),
    (error) => error?.code === 'repository_context_tree_limit_exceeded',
  );
  assert.equal(batchCalls, 0);

  const plan = planFor(repo);
  const requestLimited = adapterFor(repo.repositoryPath, 'changeset', {
    limits: { maxRequestBytes: 1024 },
    gitRunner: counted.runner,
  });
  await assert.rejects(
    requestLimited.execute(directInvocation(plan).invocation),
    (error) => error?.code === 'model_request_limit_exceeded',
  );
  assert.equal(batchCalls, 0);
});

test('duplicate blob OIDs are loaded and decoded once per cold preparation', async (t) => {
  const content = 'same-content\n';
  const repo = makeRepo(t, Object.fromEntries(
    Array.from({ length: 20 }, (_, index) => [`copy-${index}.txt`, { content }]),
  ));
  const plan = planFor(repo);
  let requestedOids = [];
  const counted = countingGitRunner({
    before: ({ args, input }) => {
      if (args[0] === 'cat-file' && args[1] === '--batch') {
        requestedOids = input.toString('ascii').trim().split('\n');
      }
    },
  });
  const observations = [];
  const adapter = adapterFor(repo.repositoryPath, 'changeset', {
    contextCache: false,
    gitRunner: counted.runner,
    modelRunner: successfulModelRunner(),
    observation: (entry) => observations.push(entry),
  });
  await adapter.execute(directInvocation(plan).invocation);
  assert.equal(requestedOids.length, 1);
  assert.equal(observations[0].logicalBlobCount, 20);
  assert.equal(observations[0].uniqueBlobCount, 1);
  assert.equal(observations[0].uniqueBlobBytes, Buffer.byteLength(content));
});

test('POSIX timeout and successful return clean up model descendants', { skip: process.platform === 'win32' }, async (t) => {
  const repo = makeRepo(t);
  const plan = planFor(repo);
  const timeoutMarker = path.join(repo.repositoryPath, 'timeout-grandchild');
  const returnMarker = path.join(repo.repositoryPath, 'return-grandchild');
  const directTimeout = directInvocation(plan);
  const timeoutAdapter = new GitRepositoryModelExecutor({
    repositoryPath: repo.repositoryPath,
    modelExecutable: process.execPath,
    modelArgs: [FIXTURE, 'spawn-grandchild-timeout', timeoutMarker],
    timeoutMs: 50,
  });
  await assert.rejects(
    timeoutAdapter.execute(directTimeout.invocation),
    (error) => error?.code === 'model_transport_timeout',
  );
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(existsSync(timeoutMarker), false);

  const returnAdapter = new GitRepositoryModelExecutor({
    repositoryPath: repo.repositoryPath,
    modelExecutable: process.execPath,
    modelArgs: [FIXTURE, 'spawn-grandchild-return', returnMarker],
    timeoutMs: 2_000,
  });
  await returnAdapter.execute(directInvocation(plan).invocation);
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(existsSync(returnMarker), false);
});

test('POSIX successful child exit closes inherited descendant pipes without a false timeout', { skip: process.platform === 'win32' }, async (t) => {
  const repo = makeRepo(t);
  const plan = planFor(repo);
  const marker = path.join(repo.repositoryPath, 'inherited-pipe-grandchild');
  const adapter = new GitRepositoryModelExecutor({
    repositoryPath: repo.repositoryPath,
    modelExecutable: process.execPath,
    modelArgs: [FIXTURE, 'spawn-grandchild-inherit-return', marker],
    timeoutMs: 200,
  });
  const result = await adapter.execute(directInvocation(plan).invocation);
  assert.equal(result.kind, 'changeset');
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(existsSync(marker), false);
});

test('existing retry budget reuses verified context but still owns each process/request retry', async (t) => {
  const repo = makeRepo(t);
  const plan = planFor({ ...repo, maxAttempts: 2, instruction: 'after-retry' });
  const engine = new CaseEngine({ caseId: 'case-retry-model', plan });
  const observations = [];
  let calls = 0;
  const adapter = adapterFor(repo.repositoryPath, 'changeset', {
    observation: (entry) => observations.push(entry),
    modelRunner: async ({ input }) => {
      calls += 1;
      if (calls === 1) {
        return { code: 7, signal: null, stdout: Buffer.alloc(0), stdoutBytes: 0, stderrBytes: 0, durationMs: 1 };
      }
      const request = strictJsonParse(input);
      const response = {
        schemaVersion: 1,
        profile: MODEL_TRANSPORT_PROFILE,
        requestDigest: request.requestDigest,
        result: {
          kind: 'changeset',
          baseDigest: request.invocation.baseDigest,
          writes: [{ path: 'model-output.txt', content: 'after-retry' }],
        },
      };
      const stdout = Buffer.from(canonicalJson(response), 'utf8');
      return { code: 0, signal: null, stdout, stdoutBytes: stdout.length, stderrBytes: 0, durationMs: 1 };
    },
  });

  const report = await runCase(engine, (invocation) => adapter.execute(invocation), { capacity: 1 });
  assert.equal(report.caseState, 'succeeded');
  assert.equal(calls, 2);
  assert.equal(observations.length, 2);
  assert.equal(observations[0].contextDigest, observations[1].contextDigest);
  assert.equal(observations.reduce((sum, entry) => sum + entry.processStarts, 0), 2);
  assert.equal(observations.reduce((sum, entry) => sum + entry.contextBytes, 0), 2 * observations[0].contextBytes);
  assert.equal(observations.reduce((sum, entry) => sum + entry.contextMaterializations, 0), 1);
  assert.equal(observations.reduce((sum, entry) => sum + entry.gitCommandCount, 0), 5);
  assert.deepEqual(observations.map((entry) => entry.cacheStatus), ['miss', 'hit']);
});

test('observation callback failure cannot change a successful result', async (t) => {
  const repo = makeRepo(t);
  const plan = planFor(repo);
  const direct = directInvocation(plan);
  const adapter = adapterFor(repo.repositoryPath, 'changeset', {
    observation: () => { throw new Error('metrics sink down'); },
  });
  const result = await adapter.execute(direct.invocation);
  assert.equal(result.kind, 'changeset');
  assert.equal(result.writes[0].content, 'model-content');
});

test('an unresolved asynchronous observation callback cannot block a successful result', async (t) => {
  const repo = makeRepo(t);
  const plan = planFor(repo);
  const direct = directInvocation(plan);
  let observed = false;
  const adapter = adapterFor(repo.repositoryPath, 'changeset', {
    observation: () => {
      observed = true;
      return new Promise(() => {});
    },
  });
  const result = await Promise.race([
    adapter.execute(direct.invocation),
    new Promise((_, reject) => setTimeout(() => reject(new Error('observation blocked execution')), 500)),
  ]);
  assert.equal(observed, true);
  assert.equal(result.kind, 'changeset');
  assert.equal(result.writes[0].content, 'model-content');
});
