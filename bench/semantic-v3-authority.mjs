import { performance } from 'node:perf_hooks';

import { canonicalJson, digest } from '../src/canonical.mjs';
import { CaseEngine } from '../src/engine.mjs';
import { definePlan } from '../src/plan.mjs';
import { buildSemanticTree } from '../src/semantic-authority.mjs';
import { promoteSemantic } from '../src/semantic-promotion.mjs';

const sizes = (process.env.TDEV_V3_SIZES ?? '1000,5000,20000')
  .split(',').map((value) => Number.parseInt(value, 10)).filter(Number.isSafeInteger);
const touches = (process.env.TDEV_V3_TOUCHES ?? '1,8,128')
  .split(',').map((value) => Number.parseInt(value, 10)).filter(Number.isSafeInteger);
const sourceRevision = process.env.TDEV_V3_SOURCE_REVISION ?? 'working-tree';

function makeTree(size) {
  const tree = Object.create(null);
  for (let index = 0; index < size; index += 1) {
    tree[`dir/${String(index).padStart(6, '0')}.txt`] = `value-${index}`;
  }
  return tree;
}

function makePlan(baseTree) {
  return definePlan({
    revisionId: 'semantic-v3-bench',
    baseTree,
    tasks: [
      {
        id: 'work', kind: 'work', dependencies: [], claims: [],
        execution: { resultKind: 'changeset', effectClass: 'result-only', operation: 'bench.work', requirePassed: false, retry: { maxAttempts: 1 } },
      },
      {
        id: 'promote', kind: 'promotion', dependencies: ['work'], claims: [{ mode: 'write', resource: 'canonical:tree' }],
        execution: { resultKind: 'promotion', effectClass: 'result-only', operation: 'tdev.promotion', requirePassed: false, retry: { maxAttempts: 1 } },
      },
    ],
  });
}

function writesFor(size, count) {
  const output = [];
  for (let index = 0; index < count; index += 1) {
    const slot = Math.floor((index + 1) * size / (count + 1));
    output.push({ path: `dir/${String(slot).padStart(6, '0')}.txt`, content: `changed-${index}` });
  }
  return output;
}

const evidence = {
  schemaVersion: 1,
  kind: 'tdev-semantic-v3-authority-evidence',
  sourceRevision,
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  configuration: { sizes, touches },
  samples: [],
};

for (const size of sizes) {
  const baseTree = makeTree(size);
  const plan = makePlan(baseTree);
  const baseDigest = plan.baseDigest;
  const buildStart = performance.now();
  const semanticBase = buildSemanticTree(baseTree);
  const buildMs = performance.now() - buildStart;

  const v2 = new CaseEngine({ caseId: `v2-${size}`, plan });
  const v3 = new CaseEngine({ caseId: `v3-${size}`, plan, semanticAuthority: { profile: semanticBase.rootDescriptor.profile, baseTree: semanticBase } });
  const v2SnapshotBytes = Buffer.byteLength(canonicalJson(v2.snapshot()), 'utf8');
  const v3SnapshotBytes = Buffer.byteLength(canonicalJson(v3.snapshot()), 'utf8');

  for (const touchCount of touches) {
    if (touchCount > size) continue;
    const writes = writesFor(size, touchCount);
    const entry = {
      task: plan.tasksById.work,
      taskId: 'work',
      effectKey: 'bench-effect',
      result: { kind: 'changeset', baseDigest, writes },
    };
    const start = performance.now();
    const promoted = promoteSemantic(semanticBase, [entry], baseDigest);
    const promotionMs = performance.now() - start;
    const expected = { ...baseTree };
    for (const write of writes) expected[write.path] = write.content;
    const expectedDigest = digest(expected);
    const compatibilityStart = performance.now();
    const materialized = promoted.semanticTree.materialize();
    const compatibilityDigest = digest(materialized);
    const compatibilityMs = performance.now() - compatibilityStart;
    evidence.samples.push({
      size,
      touchCount,
      baseBuildMs: buildMs,
      baseRootDigest: semanticBase.rootDescriptor.rootDigest,
      v2SnapshotBytes,
      v3SnapshotBytes,
      snapshotByteRatio: v3SnapshotBytes / v2SnapshotBytes,
      promotionMs,
      nodeReads: promoted.semanticTree.stats.nodeReads,
      nodeWrites: promoted.semanticTree.stats.nodeWrites,
      objectDeltaCount: promoted.semanticTree.objectRecords().length,
      finalRootDigest: promoted.semanticTree.rootDescriptor.rootDigest,
      compatibilityDigest,
      compatibilityMs,
      materializedEntryCount: Object.keys(materialized).length,
      semanticEquality: materializedEntryCount(materialized) === size && compatibilityDigest === expectedDigest,
    });
  }
}

function materializedEntryCount(tree) { return Object.keys(tree).length; }

process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
