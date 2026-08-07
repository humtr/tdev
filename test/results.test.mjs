import test from 'node:test';
import assert from 'node:assert/strict';
import { digest } from '../src/canonical.mjs';
import { CaseEngine, definePlan } from '../src/engine.mjs';
import { runCase } from '../src/runner.mjs';

function mixedPlan() {
  const work = [
    {
      id: 'change', kind: 'work', dependencies: [], claims: [], input: {},
      execution: { resultKind: 'changeset', effectClass: 'result-only' },
    },
    {
      id: 'observe', kind: 'work', dependencies: [], claims: [], input: {},
      execution: { operation: 'repo.observe', resultKind: 'observation', effectClass: 'result-only' },
    },
    {
      id: 'validate', kind: 'work', dependencies: [], claims: [], input: {},
      execution: { operation: 'repo.validate', resultKind: 'validation', effectClass: 'result-only' },
    },
    {
      id: 'artifacts', kind: 'work', dependencies: [], claims: [], input: {},
      execution: { operation: 'artifact.collect', resultKind: 'artifact-set', effectClass: 'result-only' },
    },
  ];
  return definePlan({
    revisionId: 'mixed-results-v1',
    baseTree: { 'base.txt': 'base' },
    tasks: [
      ...work,
      {
        id: 'promote', kind: 'promotion', dependencies: work.map((task) => task.id).sort(),
        claims: [{ mode: 'write', resource: 'canonical:tree' }], input: {},
      },
    ],
  });
}

test('closed result algebra records all evidence while only ChangeSets mutate the tree', async () => {
  const engine = new CaseEngine({ caseId: 'mixed-results-case', plan: mixedPlan() });
  const result = await runCase(engine, async ({ baseDigest, task }) => {
    switch (task.id) {
      case 'change':
        return { kind: 'changeset', baseDigest, writes: [{ path: 'change.txt', content: 'changed' }] };
      case 'observe':
        return { kind: 'observation', subject: 'repository', value: { files: 2 } };
      case 'validate':
        return { kind: 'validation', passed: true, checks: [{ id: 'unit', passed: true }] };
      case 'artifacts':
        return {
          kind: 'artifact-set',
          artifacts: [{ id: 'report', digest: digest('report-bytes'), mediaType: 'text/plain', size: 12 }],
        };
      default: throw new Error(`Unexpected task ${task.id}`);
    }
  }, { capacity: 4 });

  assert.equal(result.caseState, 'succeeded');
  assert.deepEqual(result.snapshot.canonicalTree, { 'base.txt': 'base', 'change.txt': 'changed' });
  const promotion = result.snapshot.taskStates.promote.acceptedResult;
  assert.deepEqual(promotion.acceptedTaskIds, ['artifacts', 'change', 'observe', 'validate']);
  assert.deepEqual(promotion.appliedTaskIds, ['change']);
  assert.deepEqual(promotion.accepted.map((entry) => entry.resultKind), [
    'artifact-set', 'changeset', 'observation', 'validation',
  ]);
});

test('required validation rejection is a deterministic no-promotion failure', async () => {
  const plan = definePlan({
    revisionId: 'required-validation-v1', baseTree: {}, tasks: [
      {
        id: 'validate', kind: 'work', dependencies: [], claims: [], input: {},
        execution: {
          operation: 'repo.validate', resultKind: 'validation', effectClass: 'result-only', requirePassed: true,
        },
      },
      {
        id: 'promote', kind: 'promotion', dependencies: ['validate'],
        claims: [{ mode: 'write', resource: 'canonical:tree' }], input: {},
      },
    ],
  });
  const result = await runCase(new CaseEngine({ caseId: 'validation-failure-case', plan }), async () => ({
    kind: 'validation', passed: false, checks: [{ id: 'unit', passed: false, message: 'failed' }],
  }));
  assert.equal(result.caseState, 'failed');
  assert.equal(result.snapshot.taskStates.validate.error.code, 'validation_failed');
  assert.deepEqual(result.snapshot.canonicalTree, {});
});

test('effect receipt binds operation and stable Task effect key', async () => {
  const plan = definePlan({
    revisionId: 'effect-receipt-v1', baseTree: {}, tasks: [
      {
        id: 'publish', kind: 'work', dependencies: [],
        claims: [{ mode: 'execute', resource: 'remote:origin/main' }], input: {},
        execution: {
          operation: 'git.publish', resultKind: 'effect-receipt', effectClass: 'idempotent-external',
        },
      },
      {
        id: 'promote', kind: 'promotion', dependencies: ['publish'],
        claims: [{ mode: 'write', resource: 'canonical:tree' }], input: {},
      },
    ],
  });
  let observedEffectKey;
  const result = await runCase(new CaseEngine({ caseId: 'effect-receipt-case', plan }), async ({ effectKey }) => {
    observedEffectKey = effectKey;
    return {
      kind: 'effect-receipt', effectKey, operation: 'git.publish', outcome: 'applied', receipt: { oid: 'abc' },
    };
  });
  assert.equal(result.caseState, 'succeeded');
  assert.equal(result.snapshot.taskStates.publish.acceptedResult.effectKey, observedEffectKey);
  assert.deepEqual(result.snapshot.canonicalTree, {});
});

test('validation and Artifact results enforce a total canonical byte bound', async () => {
  function oneResultPlan(id, execution) {
    return definePlan({
      revisionId: `${id}-bound-v1`,
      baseTree: {},
      tasks: [
        { id, kind: 'work', dependencies: [], claims: [], input: {}, execution },
        {
          id: 'promote', kind: 'promotion', dependencies: [id],
          claims: [{ mode: 'write', resource: 'canonical:tree' }], input: {},
        },
      ],
    });
  }

  const validation = await runCase(new CaseEngine({
    caseId: 'validation-size-case',
    plan: oneResultPlan('validate', {
      operation: 'repo.validate', resultKind: 'validation', effectClass: 'result-only',
    }),
    caseContract: { limits: { maxEvidenceBytes: 128 } },
  }), async () => ({
    kind: 'validation',
    passed: true,
    checks: [{ id: 'large', passed: true, message: 'x'.repeat(256) }],
  }));
  assert.equal(validation.caseState, 'failed');
  assert.equal(validation.snapshot.taskStates.validate.error.code, 'validation_limit_exceeded');

  const artifacts = await runCase(new CaseEngine({
    caseId: 'artifact-size-case',
    plan: oneResultPlan('artifacts', {
      operation: 'artifact.collect', resultKind: 'artifact-set', effectClass: 'result-only',
    }),
    caseContract: { limits: { maxEvidenceBytes: 128 } },
  }), async () => ({
    kind: 'artifact-set',
    artifacts: [{
      id: 'large', digest: digest('large'), mediaType: 'text/plain', size: 1, locator: `r2://${'x'.repeat(256)}`,
    }],
  }));
  assert.equal(artifacts.caseState, 'failed');
  assert.equal(artifacts.snapshot.taskStates.artifacts.error.code, 'artifact_set_limit_exceeded');
});
