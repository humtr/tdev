#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

import { canonicalJson, digest } from '../src/canonical.mjs';
import { CaseEngine, definePlan } from '../src/engine.mjs';
import {
  GitRepositoryModelExecutor,
  MODEL_REPOSITORY_OPERATION,
} from '../src/repository-model-transport.mjs';
import { runCase } from '../src/runner.mjs';

const EXPECTATIONS_PATH = 'docs/evidence/group-e-d0018-warm-runtime-expectations-2026-08-12.json';
const WORKER_PATH = 'bench/d0018-warm-runtime-worker.mjs';
const CONVERGENCE_PATH = 'bench/d0018-adversarial-convergence-falsifier.mjs';
const GUARD_MS = 10_000;
const CONFIGURED_ENV = 'qualified-host-environment';
const CALLER_SECRET_KEY = 'TDEV_D0018_CALLER_SECRET';
const EXPECTED_SEEDS = [11, 29, 47, 83];
const EXPECTED_BENCH_ORDER = ['F', 'WH', 'WH', 'F', 'WH', 'F', 'F', 'WH'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sourceRootFromArgs() {
  const index = process.argv.indexOf('--source-root');
  if (index >= 0 && process.argv[index + 1]) return path.resolve(process.argv[index + 1]);
  return process.cwd();
}

function git(root, args, { input = null, allowFailure = false } = {}) {
  const result = spawnSync('git', ['-C', root, ...args], {
    input,
    encoding: null,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.toString('utf8')}`);
  }
  return result;
}

async function withGuard(promise, label, ms = GUARD_MS) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} did not settle`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function parseHeadTree(root, commitOid) {
  const listing = git(root, ['ls-tree', '-r', '-z', '-l', commitOid]).stdout;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const tree = Object.create(null);
  let fileCount = 0;
  let contentBytes = 0;
  for (const raw of listing.toString('utf8').split('\0')) {
    if (raw.length === 0) continue;
    const tab = raw.indexOf('\t');
    assert.ok(tab > 0, `invalid ls-tree row: ${raw}`);
    const metadata = raw.slice(0, tab).trim().split(/\s+/);
    assert.equal(metadata.length, 4);
    const [mode, type, oid, sizeText] = metadata;
    const filePath = raw.slice(tab + 1);
    assert.ok(mode === '100644' || mode === '100755', `unsupported HEAD mode ${mode} at ${filePath}`);
    assert.equal(type, 'blob');
    const content = git(root, ['cat-file', 'blob', oid]).stdout;
    assert.equal(content.length, Number(sizeText));
    tree[filePath] = decoder.decode(content);
    fileCount += 1;
    contentBytes += content.length;
  }
  return { tree, fileCount, contentBytes };
}

function execution(maxAttempts = 1) {
  return {
    operation: MODEL_REPOSITORY_OPERATION,
    resultKind: 'observation',
    effectClass: 'result-only',
    retry: { maxAttempts },
    requirePassed: false,
  };
}

function planFor({ commitOid, baseTree, instruction = 'success', maxAttempts = 1, revisionId = 'd0018-warm-runtime' }) {
  return definePlan({
    revisionId,
    baseTree,
    tasks: [
      {
        id: 'model',
        kind: 'work',
        dependencies: [],
        claims: [],
        input: { repositoryCommitOid: commitOid, instruction },
        execution: execution(maxAttempts),
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

function directInvocation(plan, caseId, signal = new AbortController().signal) {
  const engine = new CaseEngine({ caseId, plan });
  const attempt = engine.startAttempt('model', 'executor-d0018');
  return {
    engine,
    attempt,
    invocation: {
      caseId: engine.caseId,
      planRevisionId: engine.plan.revisionId,
      planDigest: engine.plan.planDigest,
      caseContractDigest: engine.caseContract.contractDigest,
      baseDigest: engine.plan.baseDigest,

      effectKey: attempt.effectKey,
      fencingToken: attempt.fencingToken,
      claimLease: attempt.claimLease,
      signal,
      task: engine.plan.tasksById.model,
      attempt,
      acceptedResults: [],
    },
  };
}

function makeExecutor(root, workerPath, options = {}) {
  const observations = options.observations ?? [];
  return {
    observations,
    executor: new GitRepositoryModelExecutor({
      repositoryPath: options.repositoryPath ?? root,
      modelExecutable: process.execPath,
      modelArgs: options.modelArgs ?? [workerPath],
      modelEnvironment: options.modelEnvironment ?? { TDEV_D0018_CONFIGURED: CONFIGURED_ENV },
      modelWorkingDirectory: root,
      timeoutMs: options.timeoutMs ?? 10_000,
      contextCache: options.contextCache,
      modelRunner: options.modelRunner,
      observation: options.observation ?? ((entry) => observations.push(entry)),
    }),
  };
}

async function runCaseOnce({ caseId, plan, executor, capacity = 1, cancelDelayMs = null }) {
  const engine = new CaseEngine({ caseId, plan });
  const running = runCase(engine, (invocation) => executor.execute(invocation), { capacity });
  if (cancelDelayMs !== null) {
    const timer = setTimeout(() => engine.cancelTask('model', `scheduled-cancel-${cancelDelayMs}`), cancelDelayMs);
    timer.unref?.();
  }
  const report = await withGuard(running, `runCase ${caseId}`, 20_000);
  return {
    report,
    acceptedResult: report.snapshot.taskStates.model.acceptedResult,
    attempts: report.snapshot.taskStates.model.attemptIds,
  };
}

function stableWorkerValue(result) {
  if (!result || result.kind !== 'observation') return null;
  const value = structuredClone(result.value);
  if (value?.before) delete value.before.pid;
  return value;
}

function assertFreshChild(result, expectedCwd) {
  assert.equal(result.kind, 'observation');
  const before = result.value.before;
  assert.equal(before.globalSentinel, null);
  assert.equal(before.moduleCount, 0);
  assert.deepEqual(before.moduleCases, []);
  assert.equal(before.prototypeSentinel, null);
  assert.equal(before.environmentSentinel, null);
  assert.equal(before.cwd, expectedCwd);
  assert.equal(before.signalListenerCount, 0);
  assert.equal(before.timerFired, false);
  assert.equal(before.asyncAfterReturnFired, false);
  assert.equal(before.callerSecret, null);
  assert.equal(before.configuredEnvironment, CONFIGURED_ENV);
  return before.pid;
}

async function persistentWpProbe(root, workerPath) {
  const env = { ...process.env };
  delete env.TDEV_D0018_ATTEMPT_SENTINEL;
  delete env[CALLER_SECRET_KEY];
  const child = spawn(process.execPath, [workerPath, '--persistent'], {
    cwd: root,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  const queue = [];
  const waiters = [];
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  rl.on('line', (line) => {
    const value = JSON.parse(line);
    const waiter = waiters.shift();
    if (waiter) waiter.resolve(value);
    else queue.push(value);
  });
  const nextMessage = (label) => withGuard(new Promise((resolve, reject) => {
    if (queue.length > 0) resolve(queue.shift());
    else waiters.push({ resolve, reject });
  }), label, 2_000);
  const send = async (command) => {
    child.stdin.write(`${JSON.stringify(command)}\n`);
    while (true) {
      const message = await nextMessage(`persistent ${command.requestId}`);
      if (message.type === 'response' && message.requestId === command.requestId) return message;
      queue.push(message);
      await sleep(0);
    }
  };
  try {
    const a = await send({ requestId: 'A', caseId: 'wp-case-a' });
    await sleep(25);
    const b = await send({ requestId: 'B', caseId: 'wp-case-b' });
    const c = await send({ requestId: 'C', caseId: 'wp-case-c', lateFrame: true });
    const d = await send({ requestId: 'D', caseId: 'wp-case-d' });
    let late = await nextMessage('persistent stale frame');
    if (late.type !== 'late') {
      queue.push(late);
      late = await nextMessage('persistent stale frame retry');
    }
    assert.equal(late.type, 'late');
    assert.equal(late.requestId, 'C');
    return {
      processPid: child.pid,
      first: a.before,
      second: b.before,
      third: c.before,
      fourth: d.before,
      lateFrameAfterReassignment: late,
      stderrBytes: Buffer.byteLength(stderr),
    };
  } finally {
    child.stdin.end();
    rl.close();
    try { child.kill('SIGKILL'); } catch {}
    await Promise.race([
      new Promise((resolve) => child.once('close', resolve)),

      sleep(500),
    ]);
  }
}

function runConvergence(root) {
  const result = spawnSync(process.execPath, [path.join(root, CONVERGENCE_PATH), '--source-root', root], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 120_000,
  });
  if (result.status !== 0) throw new Error(`convergence falsifier failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function refCase(convergence, id) {
  const found = convergence.referenceProtocol.cases.find((entry) => entry.id === id);
  assert.ok(found, `missing convergence case ${id}`);
  return found;
}

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function shuffle(values, random) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function summarizeObservations(entries) {
  return {
    count: entries.length,
    processStarts: entries.reduce((sum, entry) => sum + entry.processStarts, 0),
    processReuses: entries.reduce((sum, entry) => sum + entry.processReuses, 0),
    contextMaterializations: entries.reduce((sum, entry) => sum + entry.contextMaterializations, 0),
    cacheStatuses: entries.map((entry) => entry.cacheStatus),
    requestBytes: entries.map((entry) => entry.requestBytes),
    referenceIds: entries.map((entry) => entry.contextReferenceId),
    authorizationScopeDigests: entries.map((entry) => entry.authorizationScopeDigest),
    contextDigests: entries.map((entry) => entry.contextDigest),
  };
}

async function modelTransportError(executor, plan, caseId, { abortAfterMs = null } = {}) {
  const controller = new AbortController();
  const direct = directInvocation(plan, caseId, controller.signal);
  const running = executor.execute(direct.invocation);
  if (abortAfterMs !== null) setTimeout(() => controller.abort(), abortAfterMs).unref?.();
  try {
    await withGuard(running, `transport error ${caseId}`, 10_000);
    return { code: null, unexpectedlySucceeded: true };
  } catch (error) {
    return { code: error?.code ?? 'unknown_error', unexpectedlySucceeded: false };
  }
}

async function scheduleSeed({ seed, root, commitOid, baseTree, executor, observations }) {
  const random = mulberry32(seed);
  const specs = shuffle([
    { type: 'success', instruction: 'success', maxAttempts: 1 },
    { type: 'retry', instruction: 'fail-first', maxAttempts: 2 },
    { type: 'cancel', instruction: 'sleep-short', maxAttempts: 1 },
    { type: 'success', instruction: 'success', maxAttempts: 1 },
    { type: 'retry', instruction: 'fail-first', maxAttempts: 2 },
    { type: 'cancel', instruction: 'sleep-short', maxAttempts: 1 },
  ], random);
  const beforeCount = observations.length;
  const jobs = specs.map((spec, index) => (async () => {
    await sleep(Math.floor(random() * 12));
    const caseId = `w42-${seed}-${index}-${spec.type}`;
    const plan = planFor({
      commitOid,
      baseTree,
      instruction: spec.instruction,
      maxAttempts: spec.maxAttempts,
      revisionId: `d0018-w42-${spec.type}`,
    });
    if (spec.type === 'cancel') {
      const cancelDelayMs = 8 + Math.floor(random() * 18);
      const result = await runCaseOnce({ caseId, plan, executor, cancelDelayMs });
      assert.equal(result.report.caseState, 'cancelled');
      assert.equal(result.acceptedResult, null);
      return { type: spec.type, state: result.report.caseState, attempts: result.attempts.length, cancelDelayMs };
    }
    const result = await runCaseOnce({ caseId, plan, executor });
    assert.equal(result.report.caseState, 'succeeded');
    assertFreshChild(result.acceptedResult, root);
    if (spec.type === 'retry') assert.equal(result.attempts.length, 2);
    return { type: spec.type, state: result.report.caseState, attempts: result.attempts.length };
  })());
  const cases = await Promise.all(jobs);
  const emitted = observations.slice(beforeCount);
  assert.equal(emitted.every((entry) => entry.processReuses === 0), true);
  return { seed, cases, observations: summarizeObservations(emitted) };
}

async function performanceComparison({ root, workerPath, commitOid, baseTree, order }) {
  const whObservations = [];
  const wh = makeExecutor(root, workerPath, { observations: whObservations });
  const plan = planFor({ commitOid, baseTree, instruction: 'success', revisionId: 'd0018-performance' });
  const samples = [];
  for (let index = 0; index < order.length; index += 1) {
    const candidate = order[index];
    const observations = candidate === 'WH' ? whObservations : [];
    const executor = candidate === 'WH'
      ? wh.executor
      : makeExecutor(root, workerPath, { observations, contextCache: false }).executor;
    const observationStart = observations.length;
    const started = performance.now();
    const result = await runCaseOnce({
      caseId: 'd0018-performance-case',
      plan,
      executor,
    });
    const endToEndMs = performance.now() - started;
    assert.equal(result.report.caseState, 'succeeded');
    assertFreshChild(result.acceptedResult, root);
    const entry = observations.at(-1);

    assert.ok(entry);
    samples.push({
      index,
      candidate,
      endToEndMs,
      processStarts: entry.processStarts,
      processReuses: entry.processReuses,
      contextMaterializations: entry.contextMaterializations,
      cacheStatus: entry.cacheStatus,
      contextReferenceId: entry.contextReferenceId,
      authorizationScopeDigest: entry.authorizationScopeDigest,
      contextDigest: entry.contextDigest,
      requestBytes: entry.requestBytes,
      contextResolutionDurationMs: entry.contextResolutionDurationMs,
      processDurationMs: entry.processDurationMs,
      totalDurationMs: entry.totalDurationMs,
      observationDelta: observations.length - observationStart,
    });
  }
  const f = samples.filter((sample) => sample.candidate === 'F');
  const whSamples = samples.filter((sample) => sample.candidate === 'WH');
  assert.equal(samples.every((sample) => sample.processStarts === 1 && sample.processReuses === 0), true);
  assert.equal(new Set(samples.map((sample) => sample.requestBytes)).size, 1);
  assert.equal(new Set(samples.map((sample) => sample.contextReferenceId)).size, 1);
  assert.equal(new Set(samples.map((sample) => sample.authorizationScopeDigest)).size, 1);
  assert.equal(new Set(samples.map((sample) => sample.contextDigest)).size, 1);
  return {
    order,
    samples,
    structural: {
      fProcessStarts: f.reduce((sum, sample) => sum + sample.processStarts, 0),
      whProcessStarts: whSamples.reduce((sum, sample) => sum + sample.processStarts, 0),
      fProcessReuses: f.reduce((sum, sample) => sum + sample.processReuses, 0),
      whProcessReuses: whSamples.reduce((sum, sample) => sum + sample.processReuses, 0),
      fContextMaterializations: f.reduce((sum, sample) => sum + sample.contextMaterializations, 0),
      whContextMaterializations: whSamples.reduce((sum, sample) => sum + sample.contextMaterializations, 0),
      requestBytesStable: new Set(samples.map((sample) => sample.requestBytes)).size === 1,
      referenceStable: new Set(samples.map((sample) => sample.contextReferenceId)).size === 1,
    },
    timingInterpretation: 'wall-clock observation only; trivial deterministic local Node worker, no real model inference/provider, no production SLO',
  };
}

async function main() {
  const root = sourceRootFromArgs();
  const expectations = JSON.parse(await fs.readFile(path.join(root, EXPECTATIONS_PATH), 'utf8'));
  assert.equal(expectations.profile, 'tdev.d0018.warm-runtime-qualification.v1');
  assert.equal(expectations.declarationTiming.includes('before execution'), true);
  assert.equal(expectations.cases.length, 43);
  assert.deepEqual(expectations.cases.map((entry) => entry.id), Array.from({ length: 43 }, (_, i) => `W${String(i + 1).padStart(2, '0')}`));
  assert.deepEqual(expectations.cases.find((entry) => entry.id === 'W42') !== undefined, true);
  assert.deepEqual(expectations.benchmarkPlan.order, EXPECTED_BENCH_ORDER);
  assert.equal(expectations.benchmarkPlan.samples, 8);

  const head = git(root, ['rev-parse', 'HEAD']).stdout.toString('utf8').trim();
  const expectationAncestor = git(root, ['merge-base', '--is-ancestor', expectations.sourceSha, head], { allowFailure: true });
  assert.equal(expectationAncestor.status, 0, 'requalification source must descend from the predeclared expectation source');
  const branch = git(root, ['branch', '--show-current']).stdout.toString('utf8').trim();
  const workerPath = path.join(root, WORKER_PATH);
  const { tree: baseTree, fileCount, contentBytes } = parseHeadTree(root, head);
  const baseDigest = digest(baseTree);
  const lightweightCommit = git(root, ['rev-list', '--max-parents=0', head]).stdout.toString('utf8').trim().split('\n').at(-1);
  assert.ok(lightweightCommit);
  const { tree: lightweightTree, fileCount: lightweightFileCount, contentBytes: lightweightContentBytes } = parseHeadTree(root, lightweightCommit);
  const lightweightPlan = planFor({ commitOid: lightweightCommit, baseTree: lightweightTree, instruction: 'success', revisionId: 'd0018-lightweight-isolation' });
  const convergence = runConvergence(root);
  assert.equal(convergence.source.head, head);
  assert.equal(convergence.referenceProtocol.passed, true);

  const wp = await persistentWpProbe(root, workerPath);
  assert.equal(wp.second.globalSentinel, 'wp-case-a');
  assert.equal(wp.second.moduleCount, 1);
  assert.deepEqual(wp.second.moduleCases, ['wp-case-a']);
  assert.equal(wp.second.prototypeSentinel, 'wp-case-a');
  assert.equal(wp.second.environmentSentinel, 'wp-case-a');
  assert.equal(wp.second.cwd, '/');
  assert.ok(wp.second.signalListenerCount >= 1);
  assert.equal(wp.second.timerFired, true);
  assert.equal(wp.second.asyncAfterReturnFired, true);

  const previousCallerSecret = process.env[CALLER_SECRET_KEY];
  process.env[CALLER_SECRET_KEY] = 'must-not-enter-model-environment';
  const whObservations = [];
  const wh = makeExecutor(root, workerPath, { observations: whObservations });
  const successPlan = planFor({ commitOid: head, baseTree, instruction: 'success' });
  const whA = await runCaseOnce({ caseId: 'wh-case-a', plan: successPlan, executor: wh.executor });
  const whB = await runCaseOnce({ caseId: 'wh-case-b', plan: successPlan, executor: wh.executor });
  const whPidA = assertFreshChild(whA.acceptedResult, root);
  const whPidB = assertFreshChild(whB.acceptedResult, root);
  const whAObservation = whObservations.find((entry) => entry.caseId === 'wh-case-a');
  const whBObservation = whObservations.find((entry) => entry.caseId === 'wh-case-b');
  assert.ok(whAObservation && whBObservation);
  assert.equal(whAObservation.contextDigest, whBObservation.contextDigest);
  assert.notEqual(whAObservation.contextReferenceId, whBObservation.contextReferenceId);
  assert.notEqual(whAObservation.authorizationScopeDigest, whBObservation.authorizationScopeDigest);
  assert.equal(whAObservation.processStarts + whBObservation.processStarts, 2);
  assert.equal(whAObservation.processReuses + whBObservation.processReuses, 0);
  assert.equal(whAObservation.contextMaterializations + whBObservation.contextMaterializations, 1);

  const fObservations = [];
  const f = makeExecutor(root, workerPath, { observations: fObservations, contextCache: false });
  const diffWhObservations = [];
  const diffWh = makeExecutor(root, workerPath, { observations: diffWhObservations });
  await runCaseOnce({ caseId: 'diff-prime', plan: successPlan, executor: diffWh.executor });
  const fDiff = await runCaseOnce({ caseId: 'diff-case', plan: successPlan, executor: f.executor });
  const whDiff = await runCaseOnce({ caseId: 'diff-case', plan: successPlan, executor: diffWh.executor });
  assertFreshChild(fDiff.acceptedResult, root);
  assertFreshChild(whDiff.acceptedResult, root);
  assert.deepEqual(stableWorkerValue(fDiff.acceptedResult), stableWorkerValue(whDiff.acceptedResult));
  assert.equal(fDiff.report.snapshot.canonicalDigest, whDiff.report.snapshot.canonicalDigest);
  const fDiffObs = fObservations.at(-1);
  const whDiffObs = diffWhObservations.at(-1);
  assert.equal(fDiffObs.contextReferenceId, whDiffObs.contextReferenceId);
  assert.equal(fDiffObs.authorizationScopeDigest, whDiffObs.authorizationScopeDigest);
  assert.equal(fDiffObs.contextDigest, whDiffObs.contextDigest);
  assert.equal(fDiffObs.requestBytes, whDiffObs.requestBytes);
  assert.equal(fDiffObs.processStarts, 1);
  assert.equal(whDiffObs.processStarts, 1);
  assert.equal(fDiffObs.processReuses, 0);
  assert.equal(whDiffObs.processReuses, 0);
  assert.equal(fDiffObs.contextMaterializations, 1);
  assert.equal(whDiffObs.contextMaterializations, 0);

  const parallelStart = whObservations.length;
  const parallelCases = await Promise.all([0, 1, 2].map((index) => runCaseOnce({
    caseId: `wh-parallel-${index}`,
    plan: successPlan,
    executor: wh.executor,
  })));
  for (const entry of parallelCases) {
    if (entry.acceptedResult === null) {
      throw new Error(`W23 parallel diagnostic ${JSON.stringify({ caseState: entry.report.caseState, modelState: entry.report.snapshot.taskStates.model, attempts: entry.report.snapshot.attempts })}`);
    }
    assertFreshChild(entry.acceptedResult, root);
  }
  const parallelObs = whObservations.slice(parallelStart);
  assert.equal(parallelObs.length, 3);
  assert.equal(new Set(parallelObs.map((entry) => entry.caseId)).size, 3);
  assert.equal(new Set(parallelObs.map((entry) => entry.contextReferenceId)).size, 3);
  assert.equal(parallelObs.reduce((sum, entry) => sum + entry.processStarts, 0), 3);

  assert.equal(parallelObs.every((entry) => entry.processReuses === 0), true);

  let sourceUnavailableModelCalls = 0;
  const sourceUnavailable = makeExecutor(root, workerPath, {
    repositoryPath: path.join(root, '__d0018_authoritative_source_missing__'),
    contextCache: false,
    modelRunner: async () => { sourceUnavailableModelCalls += 1; throw new Error('must not run'); },
    observations: [],
  });
  const sourceUnavailableResult = await modelTransportError(
    sourceUnavailable.executor,
    successPlan,
    'wh-source-unavailable',
  );
  assert.notEqual(sourceUnavailableResult.code, null);
  assert.equal(sourceUnavailableModelCalls, 0);

  const restartObs = [];
  const restarted = makeExecutor(root, workerPath, { observations: restartObs });
  const restartResult = await runCaseOnce({ caseId: 'wh-case-a', plan: successPlan, executor: restarted.executor });
  const restartPid = assertFreshChild(restartResult.acceptedResult, root);
  assert.equal(restartObs[0].contextReferenceId, whAObservation.contextReferenceId);
  assert.equal(restartObs[0].contextDigest, whAObservation.contextDigest);

  const activePlan = planFor({ commitOid: head, baseTree, instruction: 'sleep', revisionId: 'd0018-active-cancel' });
  const activeCancel = await modelTransportError(wh.executor, activePlan, 'wh-active-cancel', { abortAfterMs: 60 });
  assert.equal(activeCancel.code, 'model_transport_aborted');
  const timeoutObservations = [];
  const timeoutExecutor = makeExecutor(root, workerPath, { observations: timeoutObservations, timeoutMs: 50 });
  const timeoutResult = await modelTransportError(timeoutExecutor.executor, activePlan, 'wh-timeout');
  assert.equal(timeoutResult.code, 'model_transport_timeout');
  const crashPlan = planFor({ commitOid: head, baseTree, instruction: 'crash', revisionId: 'd0018-crash' });
  const crashResult = await modelTransportError(wh.executor, crashPlan, 'wh-crash');
  assert.equal(crashResult.code, 'model_process_failed');
  const afterFailure = await runCaseOnce({ caseId: 'wh-after-failure', plan: successPlan, executor: wh.executor });
  assertFreshChild(afterFailure.acceptedResult, root);

  const retryPlan = planFor({ commitOid: head, baseTree, instruction: 'fail-first', maxAttempts: 2, revisionId: 'd0018-retry' });
  const retryObservationStart = whObservations.length;
  const retryResult = await runCaseOnce({ caseId: 'wh-retry', plan: retryPlan, executor: wh.executor });
  assert.equal(retryResult.report.caseState, 'succeeded');
  assert.equal(retryResult.attempts.length, 2);
  assertFreshChild(retryResult.acceptedResult, root);
  const retryObs = whObservations.slice(retryObservationStart);
  assert.equal(retryObs.length, 2);
  assert.equal(retryObs.every((entry) => entry.processStarts === 1 && entry.processReuses === 0), true);
  assert.equal(retryObs[0].contextReferenceId, retryObs[1].contextReferenceId);

  const observationCases = [];
  for (const [kind, callback] of [
    ['throw', () => { throw new Error('observation throw'); }],
    ['reject', () => Promise.reject(new Error('observation reject'))],
    ['hang', () => new Promise(() => {})],
  ]) {
    const observed = makeExecutor(root, workerPath, { observation: callback });
    const result = await runCaseOnce({ caseId: `wh-observation-${kind}`, plan: lightweightPlan, executor: observed.executor });
    assert.equal(result.report.caseState, 'succeeded');
    assertFreshChild(result.acceptedResult, root);
    observationCases.push(kind);
  }

  const longSequence = [];
  for (const caseId of ['w41-success-1', 'w41-success-2']) {
    const result = await runCaseOnce({ caseId, plan: lightweightPlan, executor: wh.executor });
    assertFreshChild(result.acceptedResult, root);
    longSequence.push({ caseId, outcome: 'succeeded' });
  }
  longSequence.push({ caseId: 'w41-cancel', outcome: activeCancel.code });
  const afterCancel = await runCaseOnce({ caseId: 'w41-after-cancel', plan: lightweightPlan, executor: wh.executor });
  assertFreshChild(afterCancel.acceptedResult, root);
  longSequence.push({ caseId: 'w41-after-cancel', outcome: 'succeeded' });
  longSequence.push({ caseId: 'w41-timeout', outcome: timeoutResult.code });
  const afterTimeout = await runCaseOnce({ caseId: 'w41-after-timeout', plan: lightweightPlan, executor: wh.executor });
  assertFreshChild(afterTimeout.acceptedResult, root);
  longSequence.push({ caseId: 'w41-after-timeout', outcome: 'succeeded' });
  longSequence.push({ caseId: 'w41-crash', outcome: crashResult.code });
  const replacement = makeExecutor(root, workerPath, { observations: [] });
  const replacementSuccess = await runCaseOnce({ caseId: 'w41-fresh-replacement', plan: lightweightPlan, executor: replacement.executor });
  assertFreshChild(replacementSuccess.acceptedResult, root);
  longSequence.push({ caseId: 'w41-fresh-replacement', outcome: 'succeeded' });
  longSequence.push({ caseId: 'w41-retry', outcome: retryResult.report.caseState, attempts: retryResult.attempts.length });
  const differentCase = await runCaseOnce({ caseId: 'w41-different-case', plan: lightweightPlan, executor: wh.executor });
  assertFreshChild(differentCase.acceptedResult, root);
  longSequence.push({ caseId: 'w41-different-case', outcome: 'succeeded' });

  const scheduleObservations = [];
  const scheduleExecutor = makeExecutor(root, workerPath, { observations: scheduleObservations });
  const randomizedSchedules = [];
  for (const seed of EXPECTED_SEEDS) {
    randomizedSchedules.push(await scheduleSeed({
      seed,
      root,
      commitOid: lightweightCommit,
      baseTree: lightweightTree,
      executor: scheduleExecutor.executor,
      observations: scheduleObservations,
    }));
  }

  const resourceObservations = [];
  const resourceExecutor = makeExecutor(root, workerPath, { observations: resourceObservations });
  const beforeMemory = process.memoryUsage();
  const resourcePids = [];
  for (let index = 0; index < 12; index += 1) {
    const result = await runCaseOnce({ caseId: `w43-${index}`, plan: lightweightPlan, executor: resourceExecutor.executor });
    resourcePids.push(assertFreshChild(result.acceptedResult, root));
  }
  const afterMemory = process.memoryUsage();
  assert.equal(resourceObservations.reduce((sum, entry) => sum + entry.processStarts, 0), 12);
  assert.equal(resourceObservations.every((entry) => entry.processReuses === 0), true);

  const performanceEvidence = await performanceComparison({
    root,
    workerPath,
    commitOid: head,
    baseTree,
    order: expectations.benchmarkPlan.order,
  });

  if (previousCallerSecret === undefined) delete process.env[CALLER_SECRET_KEY];
  else process.env[CALLER_SECRET_KEY] = previousCallerSecret;

  const cases = new Map();
  const record = (id, status, observed, note = null) => {
    assert.equal(cases.has(id), false, `duplicate ${id}`);
    cases.set(id, { id, status, observed, note });
  };

  record('W01', 'wp_falsified_wh_passed', { wpLeaked: wp.second.globalSentinel, whA: whA.acceptedResult.value.before.globalSentinel, whB: whB.acceptedResult.value.before.globalSentinel });
  record('W02', 'wp_falsified_wh_passed', { wpModuleCount: wp.second.moduleCount, whModuleCounts: [whA.acceptedResult.value.before.moduleCount, whB.acceptedResult.value.before.moduleCount] });

  record('W03', 'wp_falsified_wh_passed', { wpPrototype: wp.second.prototypeSentinel, whPrototype: whB.acceptedResult.value.before.prototypeSentinel });
  record('W04', 'wp_falsified_wh_passed', { wpEnvironment: wp.second.environmentSentinel, wpCwd: wp.second.cwd, whEnvironment: whB.acceptedResult.value.before.environmentSentinel, whCwd: whB.acceptedResult.value.before.cwd });
  record('W05', 'wp_falsified_wh_passed', { wpListeners: wp.second.signalListenerCount, whListeners: whB.acceptedResult.value.before.signalListenerCount });
  record('W06', 'wp_falsified_wh_passed', { wpTimerFired: wp.second.timerFired, whTimerFired: whB.acceptedResult.value.before.timerFired });
  record('W07', 'wp_falsified_wh_passed', { wpAsyncAfterReturn: wp.second.asyncAfterReturnFired, whAsyncAfterReturn: whB.acceptedResult.value.before.asyncAfterReturnFired });
  record('W08', 'wp_falsified_wh_not_reassigned', { wpLateFrame: wp.lateFrameAfterReassignment, whProcessReuses: whBObservation.processReuses }, 'WH starts a fresh child and has no model-worker reassignment boundary');
  record('W09', refCase(convergence, 22).passed ? 'passed' : 'failed', refCase(convergence, 22).observed);
  record('W10', refCase(convergence, 1).passed ? 'passed_reference_protocol' : 'failed', refCase(convergence, 1).observed, 'current repaired C2 source behavior is tracked separately at W33');
  record('W11', refCase(convergence, 2).passed ? 'passed_reference_protocol' : 'failed', refCase(convergence, 2).observed);
  record('W12', refCase(convergence, 4).passed && refCase(convergence, 6).passed ? 'passed_reference_protocol' : 'failed', { materialization: refCase(convergence, 4).observed, resolution: refCase(convergence, 6).observed });
  record('W13', convergence.currentSource.inFlightCancellation.currentSourceQualified ? 'passed_repaired_source_and_transport' : 'failed', { currentSource: convergence.currentSource.inFlightCancellation, directTransportAbort: activeCancel }, 'C1 repaired source aborts the exact live invocation; transport cleanup remains finite');
  record('W14', 'not_applicable_WH_WP_unqualified', { whResetStage: false, wpResetQualified: false });
  record('W15', timeoutResult.code === 'model_transport_timeout' ? 'passed_transport_fresh_child' : 'failed', { timeout: timeoutResult, afterTimeoutClean: true });
  record('W16', crashResult.code === 'model_process_failed' ? 'passed_transport_no_hidden_retry' : 'failed', { crash: crashResult, afterFailureClean: true });
  record('W17', 'not_applicable_WH_WP_unqualified', { whResetStage: false, wpResetQualified: false });
  record('W18', 'not_applicable_WH_WP_unqualified', { whResetStage: false, wpResetQualified: false });
  record('W19', refCase(convergence, 8).passed && refCase(convergence, 9).passed ? 'passed_reference_and_actual_retry' : 'failed', { reference: [refCase(convergence, 8).observed, refCase(convergence, 9).observed], actualAttempts: retryResult.attempts, actualTransport: summarizeObservations(retryObs) });
  record('W20', refCase(convergence, 11).passed ? 'passed_reference_protocol' : 'failed', refCase(convergence, 11).observed);
  record('W21', refCase(convergence, 10).passed ? 'passed_reference_protocol' : 'failed', refCase(convergence, 10).observed);
  record('W22', refCase(convergence, 12).passed ? 'passed_reference_protocol_production_regression_verified_separately' : 'failed', refCase(convergence, 12).observed, 'C4 contract remains frozen; production loop regression independently verifies slot retention through cleanup/settlement');
  record('W23', 'passed_actual_WH', summarizeObservations(parallelObs));
  record('W24', 'passed_structural_actual_WH', { attempts: parallelObs.length, processStarts: parallelObs.reduce((sum, entry) => sum + entry.processStarts, 0), processReuses: parallelObs.reduce((sum, entry) => sum + entry.processReuses, 0) }, 'actual executor maps each admitted invocation to one fresh model operation and exposes no internal semantic queue');
  record('W25', refCase(convergence, 13).passed ? 'passed_reference_and_actual_WH' : 'failed', { reference: refCase(convergence, 13).observed, actualSameContext: whAObservation.contextDigest === whBObservation.contextDigest, actualReferenceEqual: whAObservation.contextReferenceId === whBObservation.contextReferenceId, actualScopesEqual: whAObservation.authorizationScopeDigest === whBObservation.authorizationScopeDigest });
  record('W26', refCase(convergence, 14).passed ? 'passed_reference_protocol' : 'failed', refCase(convergence, 14).observed);
  record('W27', refCase(convergence, 15).passed ? 'passed_reference_protocol' : 'failed', refCase(convergence, 15).observed);
  record('W28', refCase(convergence, 16).passed ? 'passed_reference_protocol' : 'failed', refCase(convergence, 16).observed);
  record('W29', refCase(convergence, 17).passed ? 'passed_reference_and_actual_restart' : 'failed', { reference: refCase(convergence, 17).observed, restartReferenceStable: restartObs[0].contextReferenceId === whAObservation.contextReferenceId });
  record('W30', sourceUnavailableModelCalls === 0 ? 'passed_typed_fail_closed_zero_model' : 'failed', { errorCode: sourceUnavailableResult.code, modelCalls: sourceUnavailableModelCalls, hiddenInlineFallback: false });
  record('W31', refCase(convergence, 18).passed ? 'passed_reference_and_actual_restart' : 'failed', { reference: refCase(convergence, 18).observed, freshProcessReported: restartObs[0].processStarts === 1 && restartObs[0].processReuses === 0, referenceStable: restartObs[0].contextReferenceId === whAObservation.contextReferenceId });
  record('W32', convergence.currentSource.cancelBeforeControllerRegistration.currentSourceQualified ? 'passed_reference_and_repaired_current_source' : 'failed', { exactPersistedRevision: refCase(convergence, 25).observed, drain: refCase(convergence, 26).observed, currentSource: convergence.currentSource.cancelBeforeControllerRegistration }, 'production checkpoint implementation now persists the exact captured revision and drains newer semantic revision before continuation');
  record('W33', convergence.currentSource.cancelBeforeControllerRegistration.currentSourceQualified ? 'passed_repaired_source_C2_C3' : 'failed', convergence.currentSource.cancelBeforeControllerRegistration, 'blocked attempt_started checkpoint cancellation now produces zero executor invocation and persists cancellation before continuation');
  record('W34', convergence.currentSource.inFlightCancellation.currentSourceQualified ? 'passed_repaired_source_liveness_and_fencing' : 'failed', convergence.currentSource.inFlightCancellation, 'committed cancellation wakes the runner, aborts the exact live control and preserves late-result fencing');
  record('W35', convergence.currentSource.inFlightCancellation.currentSourceQualified ? 'passed_repaired_lifecycle_wake_boundary' : 'failed', { runtimeSlotRule: refCase(convergence, 12).observed, currentSourceWake: convergence.currentSource.inFlightCancellation }, 'production runner now has a transient committed-Event wake and exact live-control registry; wake remains non-authoritative');
  record('W36', refCase(convergence, 21).passed ? 'passed_reference_protocol' : 'failed', refCase(convergence, 21).observed);
  record('W37', 'passed_actual_transport', { callbacks: observationCases });
  record('W38', whA.acceptedResult.value.before.callerSecret === null ? 'passed_actual_WH_no_caller_env_leak' : 'failed', { callerSecretObserved: whA.acceptedResult.value.before.callerSecret, configuredEnvironment: whA.acceptedResult.value.before.configuredEnvironment }, 'no external-provider secret substrate is claimed');
  record('W39', 'unavailable', { actualModelSessionSubstrateSelected: false }, 'deterministic Node fixture is not real model/session qualification');
  record('W40', 'unavailable', { externalProviderSelected: false }, 'no provider SDK/session is selected or authorized');
  record('W41', 'passed_actual_WH', { sequence: longSequence });
  record('W42', 'passed_repaired_source_no_cross_attempt_warm_leakage', { seeds: randomizedSchedules.map((entry) => entry.seed), schedules: randomizedSchedules }, 'WH has no reset stage; repaired cancellation/checkpoint/capacity behavior does not introduce cross-Attempt model-process reuse or warm leakage');
  record('W43', 'passed_diagnostic', { iterations: resourcePids.length, distinctObservedPids: new Set(resourcePids).size, observations: summarizeObservations(resourceObservations), memory: { before: beforeMemory, after: afterMemory, rssDelta: afterMemory.rss - beforeMemory.rss, heapUsedDelta: afterMemory.heapUsed - beforeMemory.heapUsed } }, 'RSS/heap are diagnostic only and not correctness authority');

  assert.equal(cases.size, 43);
  const orderedCases = Array.from({ length: 43 }, (_, i) => cases.get(`W${String(i + 1).padStart(2, '0')}`));
  assert.equal(orderedCases.every(Boolean), true);

  const whBlockingStatuses = new Set(['failed']);
  const whSemanticCasesGreen = orderedCases.every((entry) => !whBlockingStatuses.has(entry.status));
  assert.equal(whSemanticCasesGreen, true);

  const result = {
    schemaVersion: 1,
    profile: 'tdev.d0018.warm-runtime-qualification.v1',
    date: '2026-08-12',
    source: {
      root,
      branch,
      head,
      baseDigest,
      fileCount,
      contentBytes,
      lightweightScheduleCommit: lightweightCommit,
      lightweightFileCount,
      lightweightContentBytes,
      expectationsPath: EXPECTATIONS_PATH,
      workerPath: WORKER_PATH,
      convergencePath: CONVERGENCE_PATH,
    },
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    candidates: {
      F: 'fresh model process per Attempt; no host preparation reuse required',
      WH: 'long-lived GitRepositoryModelExecutor host with bounded immutable D0014 preparation reuse; per-invocation D0017 authorization/carrier; fresh model process per Attempt',
      WI: 'unavailable-no-current-disposable-isolate-substrate',
      WP: 'falsified-tested-same-process-worker',
      PS: 'unavailable-no-provider-selected',
    },
    differentialOracle: {
      canonicalDigestEqual: fDiff.report.snapshot.canonicalDigest === whDiff.report.snapshot.canonicalDigest,
      stableModelObservationEqualIgnoringDiagnosticPid: JSON.stringify(stableWorkerValue(fDiff.acceptedResult)) === JSON.stringify(stableWorkerValue(whDiff.acceptedResult)),
      contextReferenceIdEqual: fDiffObs.contextReferenceId === whDiffObs.contextReferenceId,
      authorizationScopeDigestEqual: fDiffObs.authorizationScopeDigest === whDiffObs.authorizationScopeDigest,
      contextDigestEqual: fDiffObs.contextDigest === whDiffObs.contextDigest,
      requestBytesEqual: fDiffObs.requestBytes === whDiffObs.requestBytes,
      f: summarizeObservations(fObservations),
      wh: summarizeObservations(diffWhObservations),
    },
    wpFalsifier: wp,
    whActualRepositoryPath: {
      crossCase: summarizeObservations([whAObservation, whBObservation]),
      freshChildPids: [whPidA, whPidB],
      parallel: summarizeObservations(parallelObs),
      restart: summarizeObservations(restartObs),
      retry: summarizeObservations(retryObs),
      directTransport: { activeCancel, timeout: timeoutResult, crash: crashResult },
    },
    convergenceReplay: {
      currentSource: convergence.currentSource,
      referenceProtocolCount: convergence.referenceProtocol.count,
      referenceProtocolPassed: convergence.referenceProtocol.passed,
    },
    cases: orderedCases,
    performanceEvidence,
    verdict: {
      primary: 'warm-host-qualified-model-attempt-fresh',
      qualifiedReusedState: ['GitRepositoryModelExecutor host object', 'bounded immutable exact-key D0014 repository preparation/cache'],
      recreatedPerAttempt: ['D0017 authorization-scoped logical reference', 'D0017 packed/hybrid carrier and resolution', 'canonical model request', 'AbortSignal/controller supplied by runner', 'model OS process group', 'model module/global/session state', 'transport deadline and I/O buffers'],
      sameProcessWarmModel: 'unqualified-falsified-tested-WP-profile',
      disposableIsolate: 'unavailable-no-current-substrate',
      providerSession: 'unavailable-no-provider-selected',
      productionC1C4QualifiedByWarmHarness: true,
      productionD0018Ready: false,
      productionBlockers: ['full source/environment verification and owner synchronization are outside this warm qualification'],
      securityScope: 'trusted-local Node host and configured local model executable; semantic isolation qualified for WH child boundary, no physical memory zeroization/tenant sandbox/provider claim',
    },
    limitations: [
      'WP falsification applies to the tested same-process worker and unproved reset domains; it is not a universal impossibility theorem.',
      'WH qualification reuses only host/preparation state; actual model process/session remains fresh per Attempt.',
      'The deterministic worker is not real model inference and no external provider round-trip/tokenizer/billing behavior is measured.',
      'C1-C4 repaired-source behavior is qualified here only for the exercised warm/runtime boundaries; repository-wide source/environment verification remains a separate gate.',
      'RSS/heap observations are diagnostics, not correctness or zeroization proof.',
    ],
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
});

