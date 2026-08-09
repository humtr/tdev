import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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

test('existing retry budget reconstructs full context and process instead of hidden transport retry', async (t) => {
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
