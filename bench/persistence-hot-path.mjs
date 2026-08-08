import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

function parseArgs(argv) {
  const args = {
    source: '.',
    label: 'current',
    tasks: 32,
    payloadBytes: 4096,
    repeats: 3,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--source') args.source = argv[++index];
    else if (arg === '--label') args.label = argv[++index];
    else if (arg === '--tasks') args.tasks = Number(argv[++index]);
    else if (arg === '--payload-bytes') args.payloadBytes = Number(argv[++index]);
    else if (arg === '--repeats') args.repeats = Number(argv[++index]);
    else throw new Error(`unknown argument ${arg}`);
  }
  if (typeof args.source !== 'string' || args.source.length === 0) throw new Error('source must be non-empty');
  if (typeof args.label !== 'string' || args.label.length === 0) throw new Error('label must be non-empty');
  for (const [value, label] of [[args.tasks, 'tasks'], [args.payloadBytes, 'payload-bytes'], [args.repeats, 'repeats']]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive safe integer`);
  }
  return args;
}

function p50(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
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

const args = parseArgs(process.argv.slice(2));
const source = path.resolve(args.source);
const target = await import(pathToFileURL(path.join(source, 'src/index.mjs')).href);
const {
  CaseRepository,
  FileSnapshotStore,
  ImmutableJournalSnapshotStore,
  JournalSnapshotStore,
  canonicalJson,
  definePlan,
  runDurableCase,
} = target;

function wideObservationPlan(width) {
  const tasks = Array.from({ length: width }, (_, index) => {
    const id = `task-${String(index).padStart(5, '0')}`;
    return {
      id,
      kind: 'work',
      dependencies: [],
      claims: [],
      input: {},
      execution: { operation: 'repo.observe', resultKind: 'observation', effectClass: 'result-only' },
    };
  });
  return definePlan({
    revisionId: `persistence-hot-path-${width}`,
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

async function runStore(kind, repeat) {
  const root = await mkdtemp(path.join(tmpdir(), 'tdev-persistence-hot-path-'));
  const directory = path.join(root, kind);
  const Store = kind === 'file'
    ? FileSnapshotStore
    : kind === 'journal'
      ? JournalSnapshotStore
      : ImmutableJournalSnapshotStore;
  const options = kind === 'journal' ? { compactAfterDeltas: 1_000_000 } : undefined;
  const rawStore = options ? new Store(directory, options) : new Store(directory);
  const repository = new CaseRepository(rawStore);
  const plan = wideObservationPlan(args.tasks);
  const caseId = `persistence-hot-path-${repeat}`;
  const payload = 'x'.repeat(args.payloadBytes);
  const casDurations = [];
  let successfulCasWrites = 0;
  const originalCas = rawStore.compareAndSwap.bind(rawStore);
  rawStore.compareAndSwap = async (...callArgs) => {
    const start = performance.now();
    const result = await originalCas(...callArgs);
    casDurations.push(performance.now() - start);
    successfulCasWrites += 1;
    return result;
  };

  try {
    const start = performance.now();
    await repository.create({ caseId, plan });
    const result = await runDurableCase(repository, caseId, async ({ task }) => ({
      kind: 'observation',
      subject: task.id,
      value: { payload },
    }), { capacity: 8 });
    const elapsedMs = performance.now() - start;
    const retainedFilesystemBytes = await directoryBytes(directory);
    const finalSnapshotBytes = Buffer.byteLength(canonicalJson(result.snapshot), 'utf8');
    const freshStore = options ? new Store(directory, options) : new Store(directory);
    const coldStart = performance.now();
    const cold = await freshStore.load(caseId);
    const coldLoadMs = performance.now() - coldStart;
    if (cold?.snapshotDigest !== result.snapshot.snapshotDigest) throw new Error(`${kind} cold-load digest mismatch`);
    return {
      elapsedMs,
      coldLoadMs,
      lastCasMs: casDurations.at(-1),
      successfulCasWrites,
      retainedFilesystemBytes,
      finalSnapshotBytes,
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const orders = [
  ['file', 'journal', 'immutable'],
  ['immutable', 'journal', 'file'],
  ['journal', 'file', 'immutable'],
];
const samples = [];
for (let repeat = 0; repeat < args.repeats; repeat += 1) {
  const order = orders[repeat % orders.length];
  const row = { repeat, order, results: {} };
  for (const kind of order) row.results[kind] = await runStore(kind, repeat);
  samples.push(row);
}

const summary = {};
for (const kind of ['file', 'journal', 'immutable']) {
  const values = samples.map((sample) => sample.results[kind]);
  summary[kind] = {
    elapsedMsP50: p50(values.map((value) => value.elapsedMs)),
    coldLoadMsP50: p50(values.map((value) => value.coldLoadMs)),
    lastCasMsP50: p50(values.map((value) => value.lastCasMs)),
    retainedFilesystemBytes: values[0].retainedFilesystemBytes,
    finalSnapshotBytes: values[0].finalSnapshotBytes,
    successfulCasWrites: values[0].successfulCasWrites,
  };
}

console.log(JSON.stringify({
  benchmarkKind: 'persistence hot-path observation; compare exact source roots with the same arguments',
  label: args.label,
  source,
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  workload: { tasks: args.tasks, observationPayloadBytes: args.payloadBytes, capacity: 8, repeats: args.repeats },
  summary,
  samples,
}, null, 2));
