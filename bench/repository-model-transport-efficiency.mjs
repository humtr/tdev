#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const fatalDecoder = new TextDecoder('utf-8', { fatal: true });

const ALL_SCENARIOS = Object.freeze([
  'same-base-1',
  'same-base-2',
  'same-base-4',
  'same-base-8',
  'multi-base-2',
  'multi-base-4',
  'multi-base-8',
  'retry-0',
  'retry-1',
  'retry-2',
  'retry-3',
  'real-process-10',
  'scale-1mb',
  'scale-10mb',
  'scale-many-small',
  'scale-few-large',
  'scale-deep',
  'scale-wide',
  'duplicate-blob',
  'oversize-rejection',
  'cancellation-waste',
  'scale-100mb-contract',
]);

function parseArguments(argv) {
  const result = {
    sourceRoot: process.cwd(),
    repository: process.cwd(),
    commit: 'HEAD',
    label: 'candidate',
    scenario: 'all',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key.startsWith('--') || value === undefined) throw new Error(`Invalid argument: ${key}`);
    if (key === '--source-root') result.sourceRoot = path.resolve(value);
    else if (key === '--repository') result.repository = path.resolve(value);
    else if (key === '--commit') result.commit = value;
    else if (key === '--label') result.label = value;
    else if (key === '--scenario') result.scenario = value;
    else throw new Error(`Unknown argument: ${key}`);
    index += 1;
  }
  return result;
}

function run(repositoryPath, args, input = null, maxBuffer = 256 * 1024 * 1024) {
  const result = spawnSync('git', ['-C', repositoryPath, ...args], {
    input,
    encoding: null,
    maxBuffer,
    env: process.env,
  });
  if (result.status !== 0) throw new Error(result.stderr.toString('utf8'));
  return result.stdout;
}

function sourceSha(sourceRoot) {
  return run(sourceRoot, ['rev-parse', 'HEAD']).toString('utf8').trim();
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function summary(values) {
  return {
    count: values.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
    max: values.length === 0 ? 0 : Math.max(...values),
  };
}

function gitOperation(args) {
  if (args[0] === 'cat-file') return `${args[0]} ${args[1]}`;
  if (args[0] === 'rev-parse' && args[1] === '--show-object-format') return 'rev-parse object-format';
  return args[0];
}

function makeRepository(specification) {
  const repositoryPath = mkdtempSync(path.join(tmpdir(), 'tdev-d0014-bench-'));
  run(repositoryPath, ['init', '-q']);
  run(repositoryPath, ['config', 'user.name', 'tdev']);
  run(repositoryPath, ['config', 'user.email', 'tdev@example.invalid']);
  const commits = [];
  for (let revision = 0; revision < specification.revisions; revision += 1) {
    const tree = Object.create(null);
    const files = specification.files(revision);
    for (const [filePath, content] of Object.entries(files)) {
      const absolute = path.join(repositoryPath, filePath);
      mkdirSync(path.dirname(absolute), { recursive: true });
      writeFileSync(absolute, content);
      tree[filePath] = content;
    }
    run(repositoryPath, ['add', '-A']);
    run(repositoryPath, ['commit', '-qm', `revision-${revision}`]);
    commits.push({
      commitOid: run(repositoryPath, ['rev-parse', 'HEAD']).toString('utf8').trim(),
      baseTree: tree,
    });
  }
  return {
    repositoryPath,
    commits,
    cleanup: () => rmSync(repositoryPath, { recursive: true, force: true }),
  };
}

async function loadSource(sourceRoot) {
  const rootUrl = pathToFileURL(`${sourceRoot}${path.sep}`).href;
  const transport = await import(new URL('src/repository-model-transport.mjs', rootUrl));
  const gitProjection = await import(new URL('src/git-projection.mjs', rootUrl));
  const planModule = await import(new URL('src/plan.mjs', rootUrl));
  const engineModule = await import(new URL('src/engine.mjs', rootUrl));
  const runnerModule = await import(new URL('src/runner.mjs', rootUrl));
  const canonical = await import(new URL('src/canonical.mjs', rootUrl));
  const policy = await import(new URL('src/policy.mjs', rootUrl));
  return { transport, gitProjection, planModule, engineModule, runnerModule, canonical, policy };
}

function createMetrics() {
  return {
    gitCalls: 0,
    gitInputBytes: 0,
    gitStdoutBytes: 0,
    gitDurationMs: 0,
    gitByOperation: Object.create(null),
    modelCalls: 0,
    modelInputBytes: 0,
    modelParseDurationMs: 0,
    observations: [],
  };
}

function instrumentedGit(source, metrics, hook = null) {
  return async (input) => {
    const started = performance.now();
    metrics.gitCalls += 1;
    metrics.gitInputBytes += input.input?.length ?? 0;
    const operation = gitOperation(input.args);
    const bucket = metrics.gitByOperation[operation] ??= { calls: 0, stdoutBytes: 0, durationMs: 0 };
    bucket.calls += 1;
    if (hook !== null) await hook(input);
    try {
      const result = await source.gitProjection.runGitCommand(input);
      metrics.gitStdoutBytes += result.stdout.length;
      bucket.stdoutBytes += result.stdout.length;
      return result;
    } finally {
      const elapsed = performance.now() - started;
      metrics.gitDurationMs += elapsed;
      bucket.durationMs += elapsed;
    }
  };
}

function modelRunner(source, metrics, failCount = 0) {
  let call = 0;
  return async ({ input }) => {
    call += 1;
    metrics.modelCalls += 1;
    metrics.modelInputBytes += input.length;
    if (call <= failCount) {
      return {
        code: 7,
        signal: null,
        stdout: Buffer.alloc(0),
        stdoutBytes: 0,
        stderrBytes: 0,
        durationMs: 0,
      };
    }
    const parseStarted = performance.now();
    const request = source.canonical.strictJsonParse(input, {
      maxBytes: 64 * 1024 * 1024,
      maxStringCodePoints: 64 * 1024 * 1024,
    });
    metrics.modelParseDurationMs += performance.now() - parseStarted;
    const stdout = Buffer.from(source.canonical.canonicalJson({
      schemaVersion: 1,
      profile: source.transport.MODEL_TRANSPORT_PROFILE,
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

function makePlan(source, commit, revisionId, maxAttempts = 1) {
  return source.planModule.definePlan({
    revisionId,
    baseTree: commit.baseTree,
    tasks: [
      {
        id: 'model',
        kind: 'work',
        dependencies: [],
        claims: [],
        input: { repositoryCommitOid: commit.commitOid, instruction: revisionId },
        execution: {
          operation: source.transport.MODEL_REPOSITORY_OPERATION,
          resultKind: 'changeset',
          effectClass: 'result-only',
          retry: { maxAttempts },
          requirePassed: false,
        },
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

function invocation(source, plan, index) {
  const engine = new source.engineModule.CaseEngine({ caseId: `bench-${plan.revisionId}-${index}`, plan });
  const attempt = engine.startAttempt('model', `executor-${index}`);
  return {
    engine,
    invocation: {
      caseId: engine.caseId,
      planRevisionId: plan.revisionId,
      planDigest: plan.planDigest,
      baseDigest: plan.baseDigest,
      effectKey: attempt.effectKey,
      fencingToken: attempt.fencingToken,
      claimLease: attempt.claimLease,
      signal: new AbortController().signal,
      task: plan.tasksById.model,
      attempt,
      acceptedResults: [],
    },
  };
}

function actualCommit(repositoryPath, commitish) {
  const commitOid = run(repositoryPath, ['rev-parse', `${commitish}^{commit}`]).toString('utf8').trim();
  const objectFormat = run(repositoryPath, ['rev-parse', '--show-object-format']).toString('utf8').trim();
  const oidPattern = objectFormat === 'sha1' ? /^[0-9a-f]{40}$/u : /^[0-9a-f]{64}$/u;
  if (!oidPattern.test(commitOid)) throw new Error('Benchmark commit OID is invalid');
  const listing = fatalDecoder.decode(run(repositoryPath, ['ls-tree', '-r', '-z', '-l', commitOid]));
  const rawRows = listing.split('\0');
  if (rawRows.at(-1) === '') rawRows.pop();
  let contentBytes = 0;
  const rows = rawRows.map((row) => {
    const tab = row.indexOf('\t');
    if (tab < 1) throw new Error('Benchmark tree row is malformed');
    const [mode, type, blobOid, sizeText] = row.slice(0, tab).trim().split(/ +/u);
    if (!['100644', '100755'].includes(mode) || type !== 'blob' || !oidPattern.test(blobOid)) {
      throw new Error('Benchmark repository contains an unsupported entry');
    }
    const byteLength = Number(sizeText);
    if (!Number.isSafeInteger(byteLength) || byteLength < 0) throw new Error('Benchmark blob size is invalid');
    contentBytes += byteLength;
    return { path: row.slice(tab + 1), blobOid, byteLength };
  });
  const uniqueOids = [...new Set(rows.map((row) => row.blobOid))];
  const batch = uniqueOids.length === 0
    ? Buffer.alloc(0)
    : run(repositoryPath, ['cat-file', '--batch'], Buffer.from(`${uniqueOids.join('\n')}\n`, 'ascii'));
  let offset = 0;
  const contentByOid = new Map();
  for (const expectedOid of uniqueOids) {
    const newline = batch.indexOf(0x0a, offset);
    if (newline < 0) throw new Error('Benchmark batch response is truncated');
    const [oid, type, sizeText] = batch.subarray(offset, newline).toString('ascii').split(' ');
    const size = Number(sizeText);
    if (oid !== expectedOid || type !== 'blob' || !Number.isSafeInteger(size)) {
      throw new Error('Benchmark batch response is not bound to the requested blob');
    }
    const start = newline + 1;
    const end = start + size;
    if (end >= batch.length || batch[end] !== 0x0a) throw new Error('Benchmark batch content is truncated');
    contentByOid.set(oid, fatalDecoder.decode(batch.subarray(start, end)));
    offset = end + 1;
  }
  if (offset !== batch.length) throw new Error('Benchmark batch response has trailing data');
  const baseTree = Object.create(null);
  for (const row of rows) baseTree[row.path] = contentByOid.get(row.blobOid);
  return {
    commitOid,
    baseTree,
    descriptor: { objectFormat, commitOid, fileCount: rows.length, contentBytes },
  };
}

async function measuredWorkload(work) {
  global.gc?.();
  const beforeMemory = process.memoryUsage();
  const beforeResource = process.resourceUsage();
  const beforeCpu = process.cpuUsage();
  let peakRss = beforeMemory.rss;
  let peakHeap = beforeMemory.heapUsed;
  let peakExternal = beforeMemory.external;
  const sampler = setInterval(() => {
    const memory = process.memoryUsage();
    peakRss = Math.max(peakRss, memory.rss);
    peakHeap = Math.max(peakHeap, memory.heapUsed);
    peakExternal = Math.max(peakExternal, memory.external);
  }, 1);
  const started = performance.now();
  try {
    const value = await work();
    const wallMs = performance.now() - started;
    const cpu = process.cpuUsage(beforeCpu);
    const afterMemory = process.memoryUsage();
    peakRss = Math.max(peakRss, afterMemory.rss);
    peakHeap = Math.max(peakHeap, afterMemory.heapUsed);
    peakExternal = Math.max(peakExternal, afterMemory.external);
    const afterResource = process.resourceUsage();
    return {
      value,
      wallMs,
      cpuUserMs: cpu.user / 1_000,
      cpuSystemMs: cpu.system / 1_000,
      memory: {
        beforeRss: beforeMemory.rss,
        afterRss: afterMemory.rss,
        beforeHeap: beforeMemory.heapUsed,
        afterHeap: afterMemory.heapUsed,
        beforeExternal: beforeMemory.external,
        afterExternal: afterMemory.external,
        sampledPeakRss: peakRss,
        sampledPeakHeap: peakHeap,
        sampledPeakExternal: peakExternal,
        sampledRssDelta: Math.max(0, peakRss - beforeMemory.rss),
        sampledHeapDelta: Math.max(0, peakHeap - beforeMemory.heapUsed),
        sampledExternalDelta: Math.max(0, peakExternal - beforeMemory.external),
        maxRssBeforeKiB: beforeResource.maxRSS,
        maxRssAfterKiB: afterResource.maxRSS,
        maxRssDeltaKiB: Math.max(0, afterResource.maxRSS - beforeResource.maxRSS),
      },
    };
  } finally {
    clearInterval(sampler);
  }
}

function aggregateObservations(observations) {
  const sum = (field) => observations.reduce((total, entry) => total + (Number(entry[field]) || 0), 0);
  return {
    count: observations.length,
    cacheStatuses: observations.reduce((result, entry) => {
      const key = entry.cacheStatus ?? 'baseline-unreported';
      result[key] = (result[key] ?? 0) + 1;
      return result;
    }, Object.create(null)),
    contextMaterializations: observations.some((entry) => entry.contextMaterializations !== undefined)
      ? sum('contextMaterializations')
      : null,
    contextBytes: sum('contextBytes'),
    uniqueBlobBytes: sum('uniqueBlobBytes'),
    gitCommandCount: sum('gitCommandCount'),
    gitStdoutBytes: sum('gitStdoutBytes'),
    requestBytes: sum('requestBytes'),
    processStarts: sum('processStarts'),
    processReuses: sum('processReuses'),
    scanDurationMs: sum('scanDurationMs'),
    requestBuildDurationMs: sum('requestBuildDurationMs'),
    processDurationMs: sum('processDurationMs'),
    responseParseDurationMs: sum('responseParseDurationMs'),
    totalDurations: summary(observations.map((entry) => entry.totalDurationMs)),
  };
}

async function sameBaseScenario(source, options, taskCount) {
  const commit = actualCommit(options.repository, options.commit);
  const plan = makePlan(source, commit, `same-base-${taskCount}`);
  const metrics = createMetrics();
  const executor = new source.transport.GitRepositoryModelExecutor({
    repositoryPath: options.repository,
    modelExecutable: process.execPath,
    timeoutMs: 30_000,
    gitRunner: instrumentedGit(source, metrics),
    modelRunner: modelRunner(source, metrics),
    observation: (entry) => metrics.observations.push(entry),
    limits: { maxRequestBytes: 32 * 1024 * 1024 },
  });
  const invocations = Array.from({ length: taskCount }, (_, index) => invocation(source, plan, index).invocation);
  const measured = await measuredWorkload(async () => {
    const starts = invocations.map(() => performance.now());
    const latencies = await Promise.all(invocations.map((item, index) => (
      executor.execute(item).then(() => performance.now() - starts[index])
    )));
    return { latencies };
  });
  return {
    workload: { tasks: taskCount, bases: 1, cacheState: 'cold executor' },
    context: commit.descriptor,
    wallMs: measured.wallMs,
    throughputPerSecond: taskCount / (measured.wallMs / 1_000),
    latency: summary(measured.value.latencies),
    cpuUserMs: measured.cpuUserMs,
    cpuSystemMs: measured.cpuSystemMs,
    memory: measured.memory,
    metrics: { ...metrics, observations: aggregateObservations(metrics.observations) },
  };
}

async function retryScenario(source, options, retryCount) {
  const commit = actualCommit(options.repository, options.commit);
  const plan = makePlan(source, commit, `retry-${retryCount}`, retryCount + 1);
  const engine = new source.engineModule.CaseEngine({ caseId: `bench-retry-${retryCount}`, plan });
  const metrics = createMetrics();
  const executor = new source.transport.GitRepositoryModelExecutor({
    repositoryPath: options.repository,
    modelExecutable: process.execPath,
    timeoutMs: 30_000,
    gitRunner: instrumentedGit(source, metrics),
    modelRunner: modelRunner(source, metrics, retryCount),
    observation: (entry) => metrics.observations.push(entry),
    limits: { maxRequestBytes: 32 * 1024 * 1024 },
  });
  const measured = await measuredWorkload(() => source.runnerModule.runCase(
    engine,
    (item) => executor.execute(item),
    { capacity: 1 },
  ));
  return {
    workload: { retries: retryCount, attempts: retryCount + 1, cacheState: 'cold executor' },
    context: commit.descriptor,
    wallMs: measured.wallMs,
    throughputPerSecond: 1 / (measured.wallMs / 1_000),
    cpuUserMs: measured.cpuUserMs,
    cpuSystemMs: measured.cpuSystemMs,
    memory: measured.memory,
    caseState: measured.value.caseState,
    metrics: { ...metrics, observations: aggregateObservations(metrics.observations) },
  };
}

async function realProcessScenario(source, options, count) {
  const commit = actualCommit(options.repository, options.commit);
  const plan = makePlan(source, commit, `real-process-${count}`);
  const metrics = createMetrics();
  const fixture = path.join(options.sourceRoot, 'test', 'model-subprocess-fixture.mjs');
  const executor = new source.transport.GitRepositoryModelExecutor({
    repositoryPath: options.repository,
    modelExecutable: process.execPath,
    modelArgs: [fixture, 'changeset'],
    timeoutMs: 30_000,
    gitRunner: instrumentedGit(source, metrics),
    observation: (entry) => metrics.observations.push(entry),
    limits: { maxRequestBytes: 32 * 1024 * 1024 },
  });
  const invocations = Array.from({ length: count }, (_, index) => invocation(source, plan, index).invocation);
  const measured = await measuredWorkload(async () => {
    const latencies = [];
    for (const item of invocations) {
      const started = performance.now();
      await executor.execute(item);
      latencies.push(performance.now() - started);
    }
    return { latencies };
  });
  return {
    workload: { tasks: count, bases: 1, processMode: 'real Node subprocess', cacheState: 'cold then warm' },
    context: commit.descriptor,
    wallMs: measured.wallMs,
    throughputPerSecond: count / (measured.wallMs / 1_000),
    latency: summary(measured.value.latencies),
    cpuUserMs: measured.cpuUserMs,
    cpuSystemMs: measured.cpuSystemMs,
    memory: measured.memory,
    metrics: { ...metrics, observations: aggregateObservations(metrics.observations) },
  };
}

async function multiBaseScenario(source, options, baseCount) {
  const fixture = makeRepository({
    revisions: 8,
    files: (revision) => Object.fromEntries(Array.from({ length: 32 }, (_, index) => [
      `files/f-${String(index).padStart(3, '0')}.txt`,
      index === 0 ? `base-${revision}\n` : indexedContent(index, 2_048, 'x'),
    ])),
  });
  try {
    const plans = fixture.commits.slice(0, baseCount).map((commit, index) => (
      makePlan(source, commit, `multi-base-${baseCount}-${index}`)
    ));
    const metrics = createMetrics();
    const executor = new source.transport.GitRepositoryModelExecutor({
      repositoryPath: fixture.repositoryPath,
      modelExecutable: process.execPath,
      timeoutMs: 30_000,
      gitRunner: instrumentedGit(source, metrics),
      modelRunner: modelRunner(source, metrics),
      observation: (entry) => metrics.observations.push(entry),
      limits: { maxRequestBytes: 32 * 1024 * 1024 },
    });
    const invocations = Array.from({ length: 8 }, (_, index) => (
      invocation(source, plans[index % baseCount], index).invocation
    ));
    const measured = await measuredWorkload(async () => {
      const starts = invocations.map(() => performance.now());
      const latencies = await Promise.all(invocations.map((item, index) => (
        executor.execute(item).then(() => performance.now() - starts[index])
      )));
      return { latencies };
    });
    return {
      workload: { tasks: 8, bases: baseCount, cacheState: 'cold executor' },
      wallMs: measured.wallMs,
      throughputPerSecond: 8 / (measured.wallMs / 1_000),
      latency: summary(measured.value.latencies),
      cpuUserMs: measured.cpuUserMs,
      cpuSystemMs: measured.cpuSystemMs,
      memory: measured.memory,
      metrics: { ...metrics, observations: aggregateObservations(metrics.observations) },
    };
  } finally {
    fixture.cleanup();
  }
}

function indexedContent(index, bytes, fill) {
  const prefix = `${index}:`;
  if (prefix.length > bytes) throw new Error('Synthetic content prefix exceeds requested size');
  return `${prefix}${fill.repeat(bytes - prefix.length)}`;
}

function scaleSpecification(kind) {
  if (kind === 'scale-1mb') {
    return { files: 128, bytes: 8_192, pathFor: (index) => `files/f-${index}.txt`, contentFor: (index) => indexedContent(index, 8_192, 'a') };
  }
  if (kind === 'scale-10mb') {
    return { files: 160, bytes: 65_536, pathFor: (index) => `files/f-${index}.txt`, contentFor: (index) => indexedContent(index, 65_536, 'b') };
  }
  if (kind === 'scale-many-small' || kind === 'scale-wide') {
    return { files: 5_000, bytes: 200, pathFor: (index) => `wide/f-${String(index).padStart(5, '0')}.txt`, contentFor: (index) => indexedContent(index, 200, 'c') };
  }
  if (kind === 'scale-few-large') {
    return { files: 8, bytes: 1024 * 1024, pathFor: (index) => `large/f-${index}.txt`, contentFor: (index) => indexedContent(index, 1024 * 1024, 'd') };
  }
  if (kind === 'scale-deep') {
    const prefix = Array.from({ length: 48 }, (_, index) => `d${index}`).join('/');
    return { files: 128, bytes: 8_192, pathFor: (index) => `${prefix}/f-${index}.txt`, contentFor: (index) => indexedContent(index, 8_192, 'e') };
  }
  if (kind === 'duplicate-blob') {
    return { files: 1_000, bytes: 10_000, pathFor: (index) => `copies/f-${index}.txt`, contentFor: () => 'same'.repeat(2_500) };
  }
  if (kind === 'oversize-rejection') {
    return { files: 2, bytes: 800 * 1024, pathFor: (index) => `oversize/f-${index}.txt`, contentFor: (index) => String(index).repeat(800 * 1024) };
  }
  throw new Error(`Unknown scale kind: ${kind}`);
}

async function scaleScenario(source, options, kind) {
  const specification = scaleSpecification(kind);
  const fixture = makeRepository({
    revisions: 1,
    files: () => Object.fromEntries(Array.from({ length: specification.files }, (_, index) => [
      specification.pathFor(index),
      specification.contentFor(index),
    ])),
  });
  try {
    const commit = fixture.commits[0];
    const plan = makePlan(source, commit, kind);
    const metrics = createMetrics();
    const limits = kind === 'oversize-rejection'
      ? { maxTreeBytes: 1024 * 1024, maxRequestBytes: 32 * 1024 * 1024 }
      : { maxRequestBytes: 32 * 1024 * 1024 };
    const executor = new source.transport.GitRepositoryModelExecutor({
      repositoryPath: fixture.repositoryPath,
      modelExecutable: process.execPath,
      timeoutMs: 30_000,
      contextCache: false,
      gitRunner: instrumentedGit(source, metrics),
      modelRunner: modelRunner(source, metrics),
      observation: (entry) => metrics.observations.push(entry),
      limits,
    });
    const direct = invocation(source, plan, 0).invocation;
    const measured = await measuredWorkload(async () => {
      if (kind === 'oversize-rejection') {
        try {
          await executor.materializeContext(commit.commitOid, plan.baseDigest);
          return { outcome: 'unexpected-success' };
        } catch (error) {
          return { outcome: error.code };
        }
      }
      const started = performance.now();
      await executor.execute(direct);
      return { outcome: 'success', latencyMs: performance.now() - started };
    });
    return {
      workload: {
        kind,
        fileCount: specification.files,
        nominalContentBytes: specification.files * specification.bytes,
        cacheState: 'disabled cold',
      },
      outcome: measured.value.outcome,
      context: {
        commitOid: commit.commitOid,
        fileCount: specification.files,
        contentBytes: specification.files * specification.bytes,
      },
      wallMs: measured.wallMs,
      latency: measured.value.latencyMs === undefined ? null : summary([measured.value.latencyMs]),
      cpuUserMs: measured.cpuUserMs,
      cpuSystemMs: measured.cpuSystemMs,
      memory: measured.memory,
      metrics: { ...metrics, observations: aggregateObservations(metrics.observations) },
    };
  } finally {
    fixture.cleanup();
  }
}

async function cancellationScenario(source, options) {
  const commit = actualCommit(options.repository, options.commit);
  const plan = makePlan(source, commit, 'cancellation-waste');
  const direct = invocation(source, plan, 0).invocation;
  const controller = new AbortController();
  direct.signal = controller.signal;
  const metrics = createMetrics();
  let modelCalls = 0;
  const gitRunner = instrumentedGit(source, metrics, async (input) => {
    if (input.args[0] !== 'cat-file' || input.args[1] !== '--batch') return;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 250);
      const signal = input.signal;
      if (!signal || typeof signal.addEventListener !== 'function') return;
      const onAbort = () => {
        clearTimeout(timer);
        reject(new source.canonical.ContractError('git_process_aborted', 'benchmark abort'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
  });
  const executor = new source.transport.GitRepositoryModelExecutor({
    repositoryPath: options.repository,
    modelExecutable: process.execPath,
    timeoutMs: 30_000,
    contextCache: false,
    gitRunner,
    modelRunner: async ({ signal }) => {
      modelCalls += 1;
      if (signal.aborted) throw new source.canonical.ContractError('model_transport_aborted', 'benchmark abort');
      throw new Error('model should not complete');
    },
    limits: { maxRequestBytes: 32 * 1024 * 1024 },
  });
  const measured = await measuredWorkload(async () => {
    const pending = executor.execute(direct);
    setTimeout(() => controller.abort(), 20);
    try {
      await pending;
      return { outcome: 'unexpected-success' };
    } catch (error) {
      return { outcome: error.code };
    }
  });
  return {
    workload: { kind: 'abort during delayed blob preparation' },
    outcome: measured.value.outcome,
    wallMs: measured.wallMs,
    cpuUserMs: measured.cpuUserMs,
    cpuSystemMs: measured.cpuSystemMs,
    memory: measured.memory,
    modelCalls,
    metrics: { ...metrics, observations: aggregateObservations(metrics.observations) },
  };
}

async function runScenario(source, options) {
  if (options.scenario.startsWith('same-base-')) {
    return sameBaseScenario(source, options, Number(options.scenario.slice('same-base-'.length)));
  }
  if (options.scenario.startsWith('multi-base-')) {
    return multiBaseScenario(source, options, Number(options.scenario.slice('multi-base-'.length)));
  }
  if (options.scenario.startsWith('retry-')) {
    return retryScenario(source, options, Number(options.scenario.slice('retry-'.length)));
  }
  if (options.scenario === 'real-process-10') return realProcessScenario(source, options, 10);
  if (options.scenario === 'cancellation-waste') return cancellationScenario(source, options);
  if (options.scenario === 'scale-100mb-contract') {
    return {
      workload: { kind: '100 MiB class' },
      outcome: 'not-executed-contractually-rejected',
      configuredMaxTreeBytes: source.policy.DEFAULT_LIMITS.maxTreeBytes,
      configuredGitOutputCeilingBytes: 64 * 1024 * 1024,
      classification: 'extrapolation-and-contract-analysis',
    };
  }
  return scaleScenario(source, options, options.scenario);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.scenario === 'all') {
    const results = [];
    for (const scenario of ALL_SCENARIOS) {
      const child = spawnSync(process.execPath, [
        '--expose-gc',
        fileURLToPath(import.meta.url),
        '--source-root', options.sourceRoot,
        '--repository', options.repository,
        '--commit', options.commit,
        '--label', options.label,
        '--scenario', scenario,
      ], {
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        env: process.env,
      });
      if (child.status !== 0) {
        throw new Error(`Scenario ${scenario} failed:\n${child.stdout}\n${child.stderr}`);
      }
      results.push(JSON.parse(child.stdout));
    }
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      profile: 'tdev.repository-model-efficiency-benchmark.v1',
      label: options.label,
      sourceSha: sourceSha(options.sourceRoot),
      repository: options.repository,
      commit: run(options.repository, ['rev-parse', options.commit]).toString('utf8').trim(),
      results,
    }, null, 2)}\n`);
    return;
  }

  const source = await loadSource(options.sourceRoot);
  const result = await runScenario(source, options);
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    profile: 'tdev.repository-model-efficiency-scenario.v1',
    label: options.label,
    sourceSha: sourceSha(options.sourceRoot),
    scenario: options.scenario,
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    result,
  })}\n`);
}

await main();
