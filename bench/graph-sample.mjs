import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

function usage() {
  throw new Error('usage: node bench/graph-sample.mjs REPOSITORY_ROOT wide|chain SIZE CAPACITY');
}

const [repositoryRootInput, graphKind, sizeInput, capacityInput] = process.argv.slice(2);
if (!repositoryRootInput || !['wide', 'chain'].includes(graphKind)) usage();
const size = Number(sizeInput);
const capacity = Number(capacityInput);
if (!Number.isSafeInteger(size) || size < 1 || !Number.isSafeInteger(capacity) || capacity < 1) usage();

const repositoryRoot = path.resolve(repositoryRootInput);
const api = await import(pathToFileURL(path.join(repositoryRoot, 'src/index.mjs')).href);

function taskId(index) {
  return `task-${String(index).padStart(6, '0')}`;
}

function graphPlanInput(kind, count) {
  const tasks = Array.from({ length: count }, (_, index) => ({
    id: taskId(index),
    kind: 'work',
    dependencies: kind === 'chain' && index > 0 ? [taskId(index - 1)] : [],
    claims: [],
    input: {},
    execution: {
      operation: 'repo.observe',
      resultKind: 'observation',
      effectClass: 'result-only',
    },
  }));
  return {
    revisionId: `benchmark-${kind}-${count}`,
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
  };
}

if (global.gc) global.gc();
const memoryBefore = process.memoryUsage();
const compileStart = performance.now();
const plan = api.definePlan(graphPlanInput(graphKind, size));
const planCompileAndValidationMs = performance.now() - compileStart;
const constructionStart = performance.now();
const engine = new api.CaseEngine({
  caseId: `benchmark-${graphKind}-${size}-capacity-${capacity}`,
  plan,
});
const caseConstructionMs = performance.now() - constructionStart;
const runStart = performance.now();
const result = await api.runCase(
  engine,
  async ({ task }) => ({ kind: 'observation', subject: task.id, value: { ok: true } }),
  { capacity },
);
const runMs = performance.now() - runStart;
if (global.gc) global.gc();
const memoryAfter = process.memoryUsage();

console.log(JSON.stringify({
  repository: path.basename(repositoryRoot),
  graphKind,
  size,
  capacity,
  planCompileAndValidationMs,
  caseConstructionMs,
  runMs,
  caseRevision: result.snapshot.caseRevision,
  canonicalDigest: result.snapshot.canonicalDigest,
  retainedHeapDeltaBytesAfterGc: memoryAfter.heapUsed - memoryBefore.heapUsed,
  rssDeltaBytesAfterGc: memoryAfter.rss - memoryBefore.rss,
}));
