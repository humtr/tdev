import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  CaseEngine,
  CaseRepository,
  ClaimLedger,
  FileSnapshotStore,
  JournalSnapshotStore,
  canonicalJson,
  definePlan,
  digest,
  promote,
  runCase,
  runDurableCase,
} from '../src/index.mjs';

function ms(start) {
  return Number((performance.now() - start).toFixed(3));
}

function widePlan(width, { resultKind = 'changeset' } = {}) {
  const tasks = Array.from({ length: width }, (_, index) => {
    const id = `task-${String(index).padStart(5, '0')}`;
    return {
      id,
      kind: 'work',
      dependencies: [],
      claims: resultKind === 'changeset' ? [{ mode: 'write', resource: `candidate:out/${id}.txt` }] : [],
      input: resultKind === 'changeset' ? { path: `out/${id}.txt`, content: `${id}\n` } : {},
      execution: resultKind === 'changeset'
        ? { operation: 'repo.change', resultKind: 'changeset', effectClass: 'result-only' }
        : { operation: 'repo.observe', resultKind: 'observation', effectClass: 'result-only' },
    };
  });
  return definePlan({
    revisionId: `bench-wide-${width}-${resultKind}`,
    baseTree: { 'base.txt': 'base\n' },
    tasks: [
      ...tasks,
      {
        id: 'promote',
        kind: 'promotion',
        dependencies: tasks.map((task) => task.id),
        claims: [{ mode: 'write', resource: 'canonical:tree' }],
        input: {},
      },
    ],
  });
}

function chainPlan(length) {
  const tasks = Array.from({ length }, (_, index) => {
    const id = `task-${String(index).padStart(5, '0')}`;
    return {
      id,
      kind: 'work',
      dependencies: index === 0 ? [] : [`task-${String(index - 1).padStart(5, '0')}`],
      claims: [],
      input: {},
      execution: { operation: 'repo.observe', resultKind: 'observation', effectClass: 'result-only' },
    };
  });
  return definePlan({
    revisionId: `bench-chain-${length}`,
    baseTree: {},
    tasks: [
      ...tasks,
      {
        id: 'promote',
        kind: 'promotion',
        dependencies: tasks.map((task) => task.id),
        claims: [{ mode: 'write', resource: 'canonical:tree' }],
        input: {},
      },
    ],
  });
}

async function runGraph(plan, capacity, caseId) {
  const engine = new CaseEngine({ caseId, plan });
  const start = performance.now();
  const result = await runCase(engine, async ({ baseDigest, task }) => {
    if (task.execution.resultKind === 'changeset') {
      return {
        kind: 'changeset',
        baseDigest,
        writes: [{ path: task.input.path, content: task.input.content }],
        evidence: { taskId: task.id },
      };
    }
    return { kind: 'observation', subject: task.id, value: { ok: true } };
  }, { capacity });
  return { elapsedMs: ms(start), result };
}

async function schedulerBench() {
  const plan = widePlan(128, { resultKind: 'observation' });
  const serial = await runGraph(plan, 1, 'bench-wide-serial');
  const parallel = await runGraph(plan, 16, 'bench-wide-parallel');
  const chain = await runGraph(chainPlan(128), 16, 'bench-chain');
  const wide512 = await runGraph(widePlan(512, { resultKind: 'observation' }), 16, 'bench-wide-512');
  const readyEngine = new CaseEngine({ caseId: 'bench-ready-scan', plan: widePlan(2_000, { resultKind: 'observation' }) });
  const readyStart = performance.now();
  const ready = readyEngine.readyTaskIds();
  return {
    wide128: {
      capacity1Ms: serial.elapsedMs,
      capacity16Ms: parallel.elapsedMs,
      canonicalEquivalent: serial.result.snapshot.canonicalDigest === parallel.result.snapshot.canonicalDigest,
    },
    chain128Capacity16Ms: chain.elapsedMs,
    wide512Capacity16Ms: wide512.elapsedMs,
    readyScan2000Ms: ms(readyStart),
    readyCount: ready.length,
  };
}

function acquireDisjointClaims(count) {
  const ledger = new ClaimLedger({ maxLeases: count + 10 });
  const acquireStart = performance.now();
  for (let index = 0; index < count; index += 1) {
    const outcome = ledger.tryAcquire({
      caseId: `case-${index}`,
      taskId: 'work',
      attemptId: 'work.1',
      claims: [{ mode: 'write', resource: `workspace:path/${String(index).padStart(8, '0')}` }],
    });
    if (!outcome.acquired) throw new Error(`unexpected claim conflict at ${index}`);
  }
  return { ledger, acquireMs: ms(acquireStart) };
}

function claimBench() {
  const twoThousand = acquireDisjointClaims(2_000);
  const tenThousand = acquireDisjointClaims(10_000);
  const queryStart = performance.now();
  const probe = tenThousand.ledger.tryAcquire({
    caseId: 'probe-case',
    taskId: 'work',
    attemptId: 'work.1',
    claims: [{ mode: 'write', resource: 'workspace:path/not-present' }],
  });
  const disjointQueryMs = ms(queryStart);
  if (!probe.acquired) throw new Error('unexpected disjoint probe conflict');
  tenThousand.ledger.release(probe.lease);
  return {
    disjointAcquisitions2000Ms: twoThousand.acquireMs,
    disjointAcquisitions10000Ms: tenThousand.acquireMs,
    disjointQueryAt10000Ms: disjointQueryMs,
  };
}

function promotionBench(fileCount = 20_000) {
  const baseTree = {};
  for (let index = 0; index < fileCount; index += 1) {
    baseTree[`src/file-${String(index).padStart(6, '0')}.txt`] = 'base\n';
  }
  const baseDigest = digest(baseTree);
  const acceptedResults = [{
    taskId: 'change',
    result: {
      kind: 'changeset',
      baseDigest,
      writes: [{ path: 'src/file-000000.txt', content: 'changed\n' }],
    },
  }];
  const start = performance.now();
  const result = promote(baseTree, acceptedResults, baseDigest);
  return { baseFiles: fileCount, touchedPaths: 1, elapsedMs: ms(start), outputDigest: result.treeDigest };
}

async function directoryBytes(directory) {
  let total = 0;
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile()) total += (await stat(target)).size;
    }
  }
  await visit(directory);
  return total;
}

async function persistenceBench(taskCount = 32, payloadBytes = 4096) {
  const root = await mkdtemp(path.join(tmpdir(), 'tdev-bench-'));
  const value = 'x'.repeat(payloadBytes);
  const plan = widePlan(taskCount, { resultKind: 'observation' });

  async function runStore(kind) {
    const directory = path.join(root, kind);
    const rawStore = kind === 'file'
      ? new FileSnapshotStore(directory)
      : new JournalSnapshotStore(directory, { compactAfterDeltas: 1_000_000 });
    let writes = 1;
    let logicalBytes = 0;
    const repository = new CaseRepository(rawStore);
    const caseId = `bench-persistence-${kind}`;
    const start = performance.now();
    const initialEngine = await repository.create({ caseId, plan });
    if (kind === 'file') logicalBytes += Buffer.byteLength(canonicalJson(initialEngine.snapshot()));
    const originalCas = rawStore.compareAndSwap.bind(rawStore);
    rawStore.compareAndSwap = async (caseIdArg, expectedRevision, snapshot) => {
      const result = await originalCas(caseIdArg, expectedRevision, snapshot);
      writes += 1;
      if (kind === 'file') logicalBytes += Buffer.byteLength(canonicalJson(snapshot));
      return result;
    };
    const result = await runDurableCase(repository, caseId, async ({ task }) => ({
      kind: 'observation',
      subject: task.id,
      value: { payload: value },
    }), { capacity: 8 });
    const elapsedMs = ms(start);
    const finalSnapshotBytes = Buffer.byteLength(canonicalJson(result.snapshot));
    if (kind === 'journal') logicalBytes = await directoryBytes(directory);
    return { elapsedMs, writes, logicalBytes, finalSnapshotBytes };
  }

  try {
    return {
      tasks: taskCount,
      observationPayloadBytes: payloadBytes,
      fileSnapshotStore: await runStore('file'),
      journalSnapshotStore: await runStore('journal'),
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const start = performance.now();
const output = {
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  scheduler: await schedulerBench(),
  claimLedger: claimBench(),
  promotion: promotionBench(),
  persistence: await persistenceBench(),
  unavailableInThisSourceSlice: {
    contextDuplicateBytes: 'no repository/context transport adapter exists',
    executorColdVsWarmStart: 'no process/toolchain executor lifecycle exists in this kernel',
    tokenDuplication: 'no model transport exists in this kernel',
  },
};
output.totalElapsedMs = ms(start);
console.log(JSON.stringify(output, null, 2));
