import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  CaseEngine,
  FileSnapshotStore,
  canonicalJson,
  definePlan,
  digest,
  validateTree,
} from '../src/index.mjs';

const DEFAULT_SIZES = [1_000, 5_000, 20_000, 100_000];
const DEFAULT_TOUCHES = [1, 8, 128, 'broad'];
const DEFAULT_SHAPES = ['wide-flat', 'deep-path'];
const MAX_SAMPLE_MS = parsePositiveInteger(process.env.TDEV_AUTHORITY_MAX_SAMPLE_MS, 30_000);
const MAX_RSS_MIB = parsePositiveInteger(process.env.TDEV_AUTHORITY_MAX_RSS_MIB, 768);
const MAX_RSS_BYTES = MAX_RSS_MIB * 1024 * 1024;
const SIZES = parseSizes(process.env.TDEV_AUTHORITY_SIZES);
const TOUCHES = parseTouches(process.env.TDEV_AUTHORITY_TOUCHES);
const SHAPES = parseShapes(process.env.TDEV_AUTHORITY_SHAPES);

function parsePositiveInteger(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`invalid positive integer: ${value}`);
  return parsed;
}

function parseSizes(value) {
  if (value === undefined) return DEFAULT_SIZES;
  const sizes = value.split(',').filter(Boolean).map((item) => parsePositiveInteger(item));
  if (sizes.length === 0) throw new Error('TDEV_AUTHORITY_SIZES must not be empty');
  if (sizes.some((size) => size > 100_000)) throw new Error('authority harness cannot exceed the 100000-entry contract ceiling');
  return sizes;
}

function parseTouches(value) {
  if (value === undefined) return DEFAULT_TOUCHES;
  const touches = value.split(',').filter(Boolean).map((item) => item === 'broad' ? item : parsePositiveInteger(item));
  if (touches.length === 0) throw new Error('TDEV_AUTHORITY_TOUCHES must not be empty');
  return touches;
}

function parseShapes(value) {
  if (value === undefined) return DEFAULT_SHAPES;
  const shapes = value.split(',').filter(Boolean);
  if (shapes.length === 0 || shapes.some((shape) => !DEFAULT_SHAPES.includes(shape))) {
    throw new Error('TDEV_AUTHORITY_SHAPES must contain only wide-flat or deep-path');
  }
  return shapes;
}

function elapsedMs(start) {
  return Number((performance.now() - start).toFixed(3));
}

function measured(operation) {
  const start = performance.now();
  const value = operation();
  return { value, elapsedMs: elapsedMs(start) };
}

async function measuredAsync(operation) {
  const start = performance.now();
  const value = await operation();
  return { value, elapsedMs: elapsedMs(start) };
}

function pathFor(shape, index) {
  const suffix = `file-${String(index).padStart(6, '0')}.txt`;
  if (shape === 'wide-flat') return suffix;
  return `a/b/c/d/e/f/g/h/${suffix}`;
}

function buildBaseTree(shape, fileCount) {
  const tree = {};
  for (let index = 0; index < fileCount; index += 1) tree[pathFor(shape, index)] = 'base\n';
  return tree;
}

function makePlan(shape, fileCount, baseTree) {
  return definePlan({
    revisionId: `authority-${shape}-${fileCount}`,
    baseTree,
    tasks: [
      {
        id: 'change',
        kind: 'work',
        dependencies: [],
        claims: [],
        input: {},
        execution: { operation: 'repo.change', resultKind: 'changeset', effectClass: 'result-only' },
      },
      {
        id: 'promote',
        kind: 'promotion',
        dependencies: ['change'],
        claims: [{ mode: 'write', resource: 'canonical:tree' }],
        input: {},
      },
    ],
  });
}

function touchCountFor(fileCount, touchSpec) {
  if (touchSpec === 'broad') return Math.min(10_000, fileCount, Math.max(1, Math.ceil(fileCount / 4)));
  return Math.min(fileCount, touchSpec);
}

function touchedIndexes(fileCount, touchCount) {
  if (touchCount === 1) return [0];
  const indexes = [];
  for (let index = 0; index < touchCount; index += 1) {
    indexes.push(Math.floor((index * (fileCount - 1)) / (touchCount - 1)));
  }
  return indexes;
}

function makeChangeSet(plan, shape, fileCount, touchCount) {
  const writes = touchedIndexes(fileCount, touchCount).map((index) => ({
    path: pathFor(shape, index),
    content: `changed-${String(index).padStart(6, '0')}\n`,
  }));
  return { kind: 'changeset', baseDigest: plan.baseDigest, writes };
}

function currentStopReason(sampleStart) {
  const runtimeMs = performance.now() - sampleStart;
  const rssBytes = process.memoryUsage().rss;
  if (runtimeMs > MAX_SAMPLE_MS) return { code: 'sample_time_limit', runtimeMs: Number(runtimeMs.toFixed(3)), limitMs: MAX_SAMPLE_MS };
  if (rssBytes > MAX_RSS_BYTES) return { code: 'rss_limit', rssBytes, limitBytes: MAX_RSS_BYTES };
  return null;
}

class StoppedSample extends Error {
  constructor(stage, reason) {
    super(`sample stopped after ${stage}: ${reason.code}`);
    this.stage = stage;
    this.reason = reason;
  }
}

function enforceStopGate(sampleStart, stage) {
  const reason = currentStopReason(sampleStart);
  if (reason) throw new StoppedSample(stage, reason);
}

function snapshotCounts(snapshot) {
  return {
    events: snapshot.events.length,
    taskStates: Object.keys(snapshot.taskStates).length,
    attempts: Object.keys(snapshot.attempts).length,
    receipts: Object.keys(snapshot.receipts).length,
    canonicalTreeEntries: Object.keys(snapshot.canonicalTree).length,
  };
}

async function runSample({ shape, fileCount, touchSpec }) {
  const sampleStart = performance.now();
  const root = await mkdtemp(path.join(tmpdir(), 'tdev-authority-boundary-'));
  const touchCount = touchCountFor(fileCount, touchSpec);
  const stages = {};
  try {
    const baseStage = measured(() => buildBaseTree(shape, fileCount));
    const baseTree = baseStage.value;
    stages.baseTreeConstructionMs = baseStage.elapsedMs;
    enforceStopGate(sampleStart, 'base_tree_construction');

    const planStage = measured(() => makePlan(shape, fileCount, baseTree));
    const plan = planStage.value;
    stages.planConstructionMs = planStage.elapsedMs;
    const engine = new CaseEngine({ caseId: `authority-${shape}-${fileCount}-${touchSpec}`, plan });
    const initialSnapshot = engine.snapshot();
    const store = new FileSnapshotStore(root);
    const initialStore = await measuredAsync(() => store.create(initialSnapshot));
    stages.initialStoreCreateSetupMs = initialStore.elapsedMs;
    enforceStopGate(sampleStart, 'plan_construction');

    const result = makeChangeSet(plan, shape, fileCount, touchCount);
    const workAttempt = engine.startAttempt('change', 'authority-work-executor');
    const resultAccept = measured(() => engine.acceptResult(engine.resultEnvelope(workAttempt.id, result)));
    stages.ordinaryResultAcceptanceMs = resultAccept.elapsedMs;
    enforceStopGate(sampleStart, 'ordinary_result_acceptance');

    const candidateBuild = measured(() => {
      const candidate = { ...plan.baseTree };
      for (const write of result.writes) {
        if (write.content === null) delete candidate[write.path];
        else candidate[write.path] = write.content;
      }
      return candidate;
    });
    stages.promotionCandidateConstructionMs = candidateBuild.elapsedMs;
    enforceStopGate(sampleStart, 'promotion_candidate_construction');

    const candidateValidation = measured(() => validateTree(candidateBuild.value, engine.caseContract));
    stages.fullCandidateValidationMs = candidateValidation.elapsedMs;
    const candidateDigest = measured(() => digest(candidateValidation.value));
    stages.semanticDigestMs = candidateDigest.elapsedMs;
    enforceStopGate(sampleStart, 'candidate_validation_and_digest');

    const oraclePromotion = measured(() => engine.createPromotionResult('promote'));
    stages.promotionOracleConstructionMs = oraclePromotion.elapsedMs;
    const promotionResult = oraclePromotion.value;
    const candidateCanonical = canonicalJson(candidateValidation.value);
    const promotionCanonical = canonicalJson(promotionResult.tree);
    if (candidateDigest.value !== promotionResult.treeDigest || candidateCanonical !== promotionCanonical) {
      throw new Error('manual candidate path diverged from current Promotion oracle');
    }
    enforceStopGate(sampleStart, 'promotion_oracle');

    const promotionAttempt = engine.startAttempt('promote', 'authority-promotion-executor');
    const promotionAccept = measured(() => engine.acceptResult(engine.resultEnvelope(promotionAttempt.id, promotionResult)));
    stages.promotionResultAcceptanceMs = promotionAccept.elapsedMs;
    enforceStopGate(sampleStart, 'promotion_result_acceptance');

    const snapshotStage = measured(() => engine.snapshot());
    const finalSnapshot = snapshotStage.value;
    stages.completeSnapshotConstructionMs = snapshotStage.elapsedMs;
    const snapshotSerialization = measured(() => canonicalJson(finalSnapshot));
    stages.completeSnapshotSerializationMs = snapshotSerialization.elapsedMs;
    enforceStopGate(sampleStart, 'complete_snapshot');

    const storePreparation = measured(() => Buffer.from(snapshotSerialization.value, 'utf8'));
    stages.storeFullFilePreparationMs = storePreparation.elapsedMs;
    const storeCas = await measuredAsync(() => store.compareAndSwap(
      finalSnapshot.caseId,
      initialSnapshot.caseRevision,
      finalSnapshot,
    ));
    stages.durableCasPublicationMs = storeCas.elapsedMs;
    enforceStopGate(sampleStart, 'durable_cas_publication');

    const storedFile = await stat(path.join(root, `${finalSnapshot.caseId}.json`));
    const coldStore = new FileSnapshotStore(root);
    const coldLoad = await measuredAsync(() => coldStore.load(finalSnapshot.caseId));
    stages.coldStoreLoadMs = coldLoad.elapsedMs;
    const coldRestore = measured(() => CaseEngine.restore(coldLoad.value, { reopen: false }));
    stages.coldEngineRestoreMs = coldRestore.elapsedMs;
    const coldSnapshot = coldRestore.value.snapshot();
    if (coldSnapshot.snapshotDigest !== finalSnapshot.snapshotDigest ||
        coldSnapshot.canonicalDigest !== finalSnapshot.canonicalDigest ||
        finalSnapshot.canonicalDigest !== promotionResult.treeDigest) {
      throw new Error('cold restore diverged from final semantic authority');
    }
    enforceStopGate(sampleStart, 'cold_restore');

    const baseCanonicalBytes = Buffer.byteLength(canonicalJson(plan.baseTree), 'utf8');
    const resultCanonicalBytes = Buffer.byteLength(canonicalJson(result), 'utf8');
    const candidateCanonicalBytes = Buffer.byteLength(candidateCanonical, 'utf8');
    const promotionResultCanonicalBytes = Buffer.byteLength(canonicalJson(promotionResult), 'utf8');
    const snapshotCanonicalBytes = Buffer.byteLength(snapshotSerialization.value, 'utf8');
    return {
      status: 'completed',
      shape,
      fileCount,
      touchSpec,
      touchedPaths: touchCount,
      stages,
      counts: {
        baseEntries: fileCount,
        candidateCloneEntries: fileCount,
        touchedWrites: touchCount,
        candidateValidationEntries: fileCount,
        semanticDigestEntries: fileCount,
        storeFullFilesPublished: 1,
        coldStoreFilesRead: 1,
        ...snapshotCounts(finalSnapshot),
      },
      bytes: {
        baseCanonicalBytes,
        serializedPlanBytes: Buffer.byteLength(canonicalJson(finalSnapshot.plan), 'utf8'),
        ordinaryResultCanonicalBytes: resultCanonicalBytes,
        candidateCanonicalBytes,
        promotionResultCanonicalBytes,
        finalSnapshotCanonicalBytes: snapshotCanonicalBytes,
        storePreparedBytes: storePreparation.value.byteLength,
        storePublishedBytes: storedFile.size,
        coldLoadedCanonicalBytes: Buffer.byteLength(canonicalJson(coldLoad.value), 'utf8'),
      },
      semanticEquality: {
        manualCandidateMatchesPromotion: true,
        finalDigestMatchesPromotion: true,
        coldRestoreMatchesFinal: true,
      },
      totalElapsedMs: elapsedMs(sampleStart),
      rssBytes: process.memoryUsage().rss,
    };
  } catch (error) {
    if (error instanceof StoppedSample) {
      return {
        status: 'stopped',
        shape,
        fileCount,
        touchSpec,
        touchedPaths: touchCount,
        stages,
        stop: { stage: error.stage, ...error.reason },
        totalElapsedMs: elapsedMs(sampleStart),
        rssBytes: process.memoryUsage().rss,
      };
    }
    throw error;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const output = {
  schemaVersion: 1,
  benchmarkKind: 'D0008 complete authority-boundary evidence; FileSnapshotStore local-compatible-filesystem path',
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  configuredMatrix: { sizes: SIZES, touches: TOUCHES, shapes: SHAPES },
  stopGates: {
    maxSampleMs: MAX_SAMPLE_MS,
    maxRssBytes: MAX_RSS_BYTES,
    maxTreeEntries: 100_000,
    maxWritesPerChangeSet: 10_000,
    stoppedSamplesAreNotExtrapolated: true,
  },
  stageContract: [
    'base/Plan construction',
    'ordinary accepted result',
    'Promotion candidate construction',
    'full candidate validation + semantic digest',
    'Promotion-result acceptance',
    'complete Case snapshot construction + serialization',
    'store full-file preparation',
    'durable CAS/publication',
    'cold store load + Case restore',
  ],
  primaryEvidence: 'operation counts and canonical/published bytes',
  secondaryEvidence: 'wall-clock milliseconds and process RSS',
  gitProjection: 'not measured; Git identity remains a derived external projection and is not required for this local authority-path gate',
  samples: [],
};

for (const shape of SHAPES) {
  for (const fileCount of SIZES) {
    for (const touchSpec of TOUCHES) {
      output.samples.push(await runSample({ shape, fileCount, touchSpec }));
    }
  }
}

output.completedSamples = output.samples.filter((sample) => sample.status === 'completed').length;
output.stoppedSamples = output.samples.filter((sample) => sample.status === 'stopped').length;
output.allCompletedSamplesSemanticallyEqual = output.samples
  .filter((sample) => sample.status === 'completed')
  .every((sample) => Object.values(sample.semanticEquality).every(Boolean));
console.log(JSON.stringify(output, null, 2));
