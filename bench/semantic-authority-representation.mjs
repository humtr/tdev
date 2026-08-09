import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { Buffer } from 'node:buffer';
import { canonicalJson, digest } from '../src/canonical.mjs';
import { promote, validateTree } from '../src/promotion.mjs';
import {
  RESEARCH_MODEL_NAMES,
  buildResearchModel,
  hypotheticalHeadBytes,
  materializeResearchModel,
  updateResearchModel,
} from './semantic-authority-models.mjs';

const DEFAULT_SIZES = [1_000, 5_000, 20_000, 100_000];
const DEFAULT_TOUCHES = [1, 8, 128, 'broad'];
const DEFAULT_SHAPES = ['wide-flat', 'deep-path', 'balanced-directory'];
const MAX_SAMPLE_MS = parsePositiveInteger(process.env.TDEV_SEMANTIC_MAX_SAMPLE_MS, 30_000);
const MAX_RSS_MIB = parsePositiveInteger(process.env.TDEV_SEMANTIC_MAX_RSS_MIB, 768);
const MAX_RSS_BYTES = MAX_RSS_MIB * 1024 * 1024;
const SIZES = parseSizes(process.env.TDEV_SEMANTIC_SIZES);
const TOUCHES = parseTouches(process.env.TDEV_SEMANTIC_TOUCHES);
const SHAPES = parseShapes(process.env.TDEV_SEMANTIC_SHAPES);
const EVIDENCE_PATH = process.env.TDEV_SEMANTIC_EVIDENCE_PATH ?? null;

function parsePositiveInteger(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`invalid positive integer: ${value}`);
  return parsed;
}

function parseSizes(value) {
  if (value === undefined) return DEFAULT_SIZES;
  const sizes = value.split(',').filter(Boolean).map((item) => parsePositiveInteger(item));
  if (sizes.length === 0 || sizes.some((size) => size > 100_000)) {
    throw new Error('TDEV_SEMANTIC_SIZES must contain 1..100000');
  }
  return sizes;
}

function parseTouches(value) {
  if (value === undefined) return DEFAULT_TOUCHES;
  const touches = value.split(',').filter(Boolean).map((item) => item === 'broad' ? item : parsePositiveInteger(item));
  if (touches.length === 0) throw new Error('TDEV_SEMANTIC_TOUCHES must not be empty');
  return touches;
}

function parseShapes(value) {
  if (value === undefined) return DEFAULT_SHAPES;
  const shapes = value.split(',').filter(Boolean);
  if (shapes.length === 0 || shapes.some((shape) => !DEFAULT_SHAPES.includes(shape))) {
    throw new Error(`TDEV_SEMANTIC_SHAPES must contain only ${DEFAULT_SHAPES.join(', ')}`);
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

function stopReason(start) {
  const runtimeMs = performance.now() - start;
  const rssBytes = process.memoryUsage().rss;
  if (runtimeMs > MAX_SAMPLE_MS) return { code: 'sample_time_limit', runtimeMs: Number(runtimeMs.toFixed(3)), limitMs: MAX_SAMPLE_MS };
  if (rssBytes > MAX_RSS_BYTES) return { code: 'rss_limit', rssBytes, limitBytes: MAX_RSS_BYTES };
  return null;
}

function pathFor(shape, index) {
  const suffix = `file-${String(index).padStart(6, '0')}.txt`;
  if (shape === 'wide-flat') return suffix;
  if (shape === 'deep-path') return `a/b/c/d/e/f/g/h/${suffix}`;
  const group = String(Math.floor(index / 4096)).padStart(4, '0');
  const slot = String(Math.floor(index / 64) % 64).padStart(4, '0');
  return `group-${group}/slot-${slot}/${suffix}`;
}

function buildBaseTree(shape, fileCount) {
  const tree = Object.create(null);
  for (let index = 0; index < fileCount; index += 1) tree[pathFor(shape, index)] = 'base\n';
  return validateTree(tree);
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

function writesFor(shape, fileCount, touchSpec) {
  const count = touchCountFor(fileCount, touchSpec);
  return touchedIndexes(fileCount, count).map((index) => ({
    path: pathFor(shape, index),
    content: `changed-${String(index).padStart(6, '0')}\n`,
  }));
}

function canonicalBytes(value) {
  return Buffer.byteLength(canonicalJson(value), 'utf8');
}

function currentOracle(baseTree, baseDigest, writes) {
  const start = performance.now();
  const promotion = promote(baseTree, [{
    taskId: 'change',
    result: { kind: 'changeset', baseDigest, writes },
  }], baseDigest);
  return {
    promotion,
    elapsedMs: elapsedMs(start),
    stop: stopReason(start),
  };
}

function flatBaseline(fileCount, promotion) {
  return {
    candidateCloneEntries: fileCount,
    candidateValidationEntries: fileCount,
    legacyDigestEntries: fileCount,
    candidateCanonicalBytes: canonicalBytes(promotion.tree),
    treeDigest: promotion.treeDigest,
  };
}

function compareModel(name, baseModel, oracle, writes) {
  const start = performance.now();
  const update = measured(() => updateResearchModel(name, baseModel, writes));
  const afterUpdateStop = stopReason(start);
  if (afterUpdateStop) {
    return {
      status: 'stopped',
      name,
      stage: 'candidate_root_update',
      stop: afterUpdateStop,
      updateMs: update.elapsedMs,
      updateMetrics: update.value.metrics,
      rootDigest: update.value.model.rootDigest,
      rssBytes: process.memoryUsage().rss,
    };
  }

  const materialized = measured(() => materializeResearchModel(name, update.value.model));
  const compatibilityCanonical = measured(() => canonicalJson(materialized.value.tree));
  const compatibilityDigest = measured(() => digest(materialized.value.tree));
  const oracleCanonical = canonicalJson(oracle.tree);
  const equalTree = compatibilityCanonical.value === oracleCanonical;
  const equalLegacyDigest = compatibilityDigest.value === oracle.treeDigest;
  if (!equalTree || !equalLegacyDigest) {
    throw new Error(`${name} diverged from current Promotion oracle`);
  }

  const finalStop = stopReason(start);
  const result = {
    status: finalStop ? 'stopped' : 'completed',
    name,
    rootDigest: update.value.model.rootDigest,
    updateMs: update.elapsedMs,
    materializationMs: materialized.elapsedMs,
    legacyCanonicalizationMs: compatibilityCanonical.elapsedMs,
    legacyDigestMs: compatibilityDigest.elapsedMs,
    totalMs: elapsedMs(start),
    updateMetrics: update.value.metrics,
    materializationMetrics: materialized.value.metrics,
    legacyCompatibility: {
      entries: Object.keys(materialized.value.tree).length,
      canonicalBytes: Buffer.byteLength(compatibilityCanonical.value, 'utf8'),
      currentTreeDigest: compatibilityDigest.value,
    },
    semanticEquality: {
      materializedTreeMatchesPromotion: equalTree,
      legacyDigestMatchesPromotion: equalLegacyDigest,
    },
    hypotheticalHead: {
      writes: 1,
      bytes: hypotheticalHeadBytes(name, baseModel.rootDigest, update.value.model.rootDigest),
      authoritative: false,
    },
    rssBytes: process.memoryUsage().rss,
  };
  if (finalStop) {
    result.stage = 'compatibility_materialization_and_digest';
    result.stop = finalStop;
  }
  return result;
}

function buildSingleModel(name, baseTree) {
  const start = performance.now();
  const built = buildResearchModel(name, baseTree);
  const reason = stopReason(start);
  return {
    model: built.model,
    record: {
      status: reason ? 'stopped' : 'completed',
      elapsedMs: elapsedMs(start),
      rootDigest: built.model.rootDigest,
      nodeCount: built.model.nodeCount,
      valueCount: built.model.valueCount,
      metrics: built.metrics,
      rssBytes: process.memoryUsage().rss,
      ...(reason ? { stop: reason } : {}),
    },
  };
}

const output = {
  schemaVersion: 1,
  benchmarkKind: 'D0009 non-authoritative semantic-authority representation comparison under current Promotion oracle',
  authorityStatus: {
    currentProductionAuthorityUnchanged: true,
    currentTreeDigest: 'digest(full normalized text tree)',
    modelRootsAreResearchOnly: true,
    hypotheticalHeadIsResearchOnly: true,
  },
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  configuredMatrix: { sizes: SIZES, touches: TOUCHES, shapes: SHAPES, models: RESEARCH_MODEL_NAMES },
  stopGates: {
    maxSampleMs: MAX_SAMPLE_MS,
    maxRssBytes: MAX_RSS_BYTES,
    maxTreeEntries: 100_000,
    maxWritesPerChangeSet: 10_000,
    stoppedSamplesAreNotExtrapolated: true,
  },
  primaryEvidence: [
    'candidate nodes/values written and reused',
    'node/value hashes and canonical bytes hashed',
    'child references copied/hashed and collision bucket entries',
    'complete materialization node/value reads',
    'legacy compatibility entries and canonical bytes',
    'hypothetical transactional head bytes/writes',
  ],
  secondaryEvidence: ['wall-clock milliseconds', 'process RSS'],
  cases: [],
};

function runComparisonCase(shape, fileCount) {
  const caseStart = performance.now();
  const baseStage = measured(() => buildBaseTree(shape, fileCount));
  const baseTree = baseStage.value;
  const baseDigestStage = measured(() => digest(baseTree));
  const oracleSamples = TOUCHES.map((touchSpec) => {
    const writes = writesFor(shape, fileCount, touchSpec);
    const oracle = currentOracle(baseTree, baseDigestStage.value, writes);
    return { touchSpec, writes, oracle };
  });
  const caseRecord = {
    shape,
    fileCount,
    setup: {
      baseTreeMs: baseStage.elapsedMs,
      baseDigestMs: baseDigestStage.elapsedMs,
      baseCanonicalBytes: canonicalBytes(baseTree),
      modelBuilds: Object.create(null),
    },
    samples: oracleSamples.map(({ touchSpec, writes, oracle }) => ({
      touchSpec,
      touchedPaths: writes.length,
      currentOracle: {
        status: oracle.stop ? 'stopped' : 'completed',
        elapsedMs: oracle.elapsedMs,
        treeDigest: oracle.promotion.treeDigest,
        flatBaseline: flatBaseline(fileCount, oracle.promotion),
        ...(oracle.stop ? { stop: oracle.stop } : {}),
      },
      models: Object.create(null),
    })),
  };

  const buildStart = performance.now();
  for (const name of RESEARCH_MODEL_NAMES) {
    let built = buildSingleModel(name, baseTree);
    caseRecord.setup.modelBuilds[name] = built.record;
    for (let index = 0; index < oracleSamples.length; index += 1) {
      const { writes, oracle } = oracleSamples[index];
      if (built.record.status === 'stopped') {
        caseRecord.samples[index].models[name] = {
          status: 'stopped',
          name,
          stage: 'base_model_build',
          stop: built.record.stop,
        };
      } else {
        caseRecord.samples[index].models[name] = compareModel(name, built.model, oracle.promotion, writes);
      }
    }
    built = null;
    globalThis.gc?.();
  }
  caseRecord.setup.modelBuildTotalMs = elapsedMs(buildStart);
  caseRecord.totalCaseMs = elapsedMs(caseStart);
  caseRecord.rssBytes = process.memoryUsage().rss;
  return caseRecord;
}

for (const shape of SHAPES) {
  for (const fileCount of SIZES) {
    output.cases.push(runComparisonCase(shape, fileCount));
    globalThis.gc?.();
  }
}

const modelSamples = output.cases.flatMap((entry) => entry.samples.flatMap((sample) => Object.values(sample.models)));
const completedModels = modelSamples.filter((sample) => sample.status === 'completed');
output.summary = {
  configuredCases: output.cases.length,
  configuredOracleSamples: output.cases.reduce((total, entry) => total + entry.samples.length, 0),
  configuredModelSamples: modelSamples.length,
  completedModelSamples: completedModels.length,
  stoppedModelSamples: modelSamples.length - completedModels.length,
  allCompletedModelsSemanticallyEqual: completedModels.every((sample) =>
    Object.values(sample.semanticEquality ?? {}).every(Boolean)),
  directoryMerkleWideSparseRejectedByLinearSiblingMetadata: output.cases
    .filter((entry) => entry.shape === 'wide-flat')
    .flatMap((entry) => entry.samples.map((sample) => ({ fileCount: entry.fileCount, sample })))
    .filter(({ sample }) => sample.touchSpec === 1 && sample.models['directory-merkle']?.updateMetrics)
    .every(({ fileCount, sample }) => sample.models['directory-merkle'].updateMetrics.childRefsHashed >= fileCount),
  compatibilityDigestStillRequiresCompleteMaterialization: completedModels.every((sample) =>
    sample.legacyCompatibility.entries === sample.materializationMetrics.outputEntries),
};

const serialized = `${JSON.stringify(output, null, 2)}\n`;
if (EVIDENCE_PATH) await writeFile(EVIDENCE_PATH, serialized, 'utf8');
else process.stdout.write(serialized);
