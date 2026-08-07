import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const sampleScript = path.join(scriptDirectory, 'graph-sample.mjs');

function parseArguments(argv) {
  const options = {
    states: [],
    samples: 3,
    warmups: 0,
    timeoutMs: 20_000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--state') {
      const value = argv[++index];
      const separator = value?.indexOf('=') ?? -1;
      if (separator < 1) throw new Error('--state requires IDENTITY=REPOSITORY_ROOT');
      options.states.push({ identity: value.slice(0, separator), root: path.resolve(value.slice(separator + 1)) });
    } else if (argument === '--samples') {
      options.samples = Number(argv[++index]);
    } else if (argument === '--warmups') {
      options.warmups = Number(argv[++index]);
    } else if (argument === '--timeout-ms') {
      options.timeoutMs = Number(argv[++index]);
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  if (options.states.length === 0) {
    throw new Error('at least one --state IDENTITY=REPOSITORY_ROOT is required');
  }
  for (const [label, value, minimum] of [
    ['samples', options.samples, 1],
    ['warmups', options.warmups, 0],
    ['timeout-ms', options.timeoutMs, 1],
  ]) {
    if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`--${label} must be an integer >= ${minimum}`);
  }
  return options;
}

function summarize(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const p50 = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
  const p95Index = Math.max(0, Math.ceil(0.95 * sorted.length) - 1);
  return {
    sampleCount: sorted.length,
    p50,
    p95NearestRank: sorted[p95Index],
    min: sorted[0],
    max: sorted.at(-1),
    samples: values,
  };
}

async function runChild(root, graphKind, size, capacity, timeoutMs) {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ['--expose-gc', sampleScript, root, graphKind, String(size), String(capacity)],
      { timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 },
    );
    if (stderr.trim().length > 0) throw new Error(`benchmark child wrote stderr: ${stderr.trim()}`);
    return { status: 'ok', value: JSON.parse(stdout) };
  } catch (error) {
    if (error?.killed || error?.signal === 'SIGKILL' || error?.code === 'ETIMEDOUT') {
      return { status: 'timeout', timeoutMs };
    }
    return {
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
      exitCode: error?.code ?? null,
      signal: error?.signal ?? null,
    };
  }
}

async function measureScenario(state, scenario, options) {
  for (let index = 0; index < options.warmups; index += 1) {
    const warmup = await runChild(state.root, scenario.graphKind, scenario.size, scenario.capacity, options.timeoutMs);
    if (warmup.status !== 'ok') return { status: warmup.status, warmup, measured: [] };
  }
  const measured = [];
  for (let index = 0; index < options.samples; index += 1) {
    const sample = await runChild(state.root, scenario.graphKind, scenario.size, scenario.capacity, options.timeoutMs);
    if (sample.status !== 'ok') return { status: sample.status, failure: sample, measured };
    measured.push(sample.value);
  }
  const canonicalDigests = [...new Set(measured.map((sample) => sample.canonicalDigest))];
  return {
    status: 'ok',
    canonicalDigests,
    planCompileAndValidationMs: summarize(measured.map((sample) => sample.planCompileAndValidationMs)),
    caseConstructionMs: summarize(measured.map((sample) => sample.caseConstructionMs)),
    runMs: summarize(measured.map((sample) => sample.runMs)),
    retainedHeapDeltaBytesAfterGc: summarize(measured.map((sample) => sample.retainedHeapDeltaBytesAfterGc)),
    rssDeltaBytesAfterGc: summarize(measured.map((sample) => sample.rssDeltaBytesAfterGc)),
  };
}

const options = parseArguments(process.argv.slice(2));
for (const state of options.states) await access(path.join(state.root, 'src/index.mjs'));
const scenarios = [
  { id: 'wide-128-capacity-1', graphKind: 'wide', size: 128, capacity: 1 },
  { id: 'wide-128-capacity-16', graphKind: 'wide', size: 128, capacity: 16 },
  { id: 'chain-128-capacity-16', graphKind: 'chain', size: 128, capacity: 16 },
  { id: 'wide-256-capacity-16', graphKind: 'wide', size: 256, capacity: 16 },
  { id: 'wide-512-capacity-16', graphKind: 'wide', size: 512, capacity: 16 },
  { id: 'chain-512-capacity-16', graphKind: 'chain', size: 512, capacity: 16 },
  { id: 'wide-1024-capacity-16', graphKind: 'wide', size: 1024, capacity: 16 },
  { id: 'chain-1024-capacity-16', graphKind: 'chain', size: 1024, capacity: 16 },
  { id: 'wide-2048-capacity-16', graphKind: 'wide', size: 2048, capacity: 16 },
  { id: 'chain-2048-capacity-16', graphKind: 'chain', size: 2048, capacity: 16 },
];

const output = {
  generatedAt: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  methodology: {
    freshChildPerSample: true,
    nodeExposeGc: true,
    warmups: options.warmups,
    measuredSamples: options.samples,
    timeoutMsPerChild: options.timeoutMs,
    p95: 'nearest-rank',
    executor: 'immediate deterministic observation result',
  },
  states: {},
};
for (const state of options.states) {
  const stateOutput = { repositoryRoot: state.root, scenarios: {} };
  for (const scenario of scenarios) {
    stateOutput.scenarios[scenario.id] = await measureScenario(state, scenario, options);
  }
  output.states[state.identity] = stateOutput;
}
console.log(JSON.stringify(output, null, 2));
