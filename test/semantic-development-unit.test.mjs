import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { digest } from '../src/canonical.mjs';
import {
  DEVELOPMENT_CHANGESET_COMPOSE_OPERATION,
  DEVELOPMENT_CHANGE_GENERATE_OPERATION,
  developmentOperationDescriptor,
  normalizeDevelopmentOperationCatalog,
  requiredDevelopmentValidation,
} from '../src/development-operation-catalog.mjs';
import {
  DEVELOPMENT_UNIT_CHANGE_TASK_ID,
  DEVELOPMENT_UNIT_CONTEXT_TASK_ID,
  DEVELOPMENT_UNIT_MODEL_TASK_ID,
  DEVELOPMENT_UNIT_PROMOTION_TASK_ID,
  DEVELOPMENT_UNIT_VALIDATION_TASK_ID,
  defineDevelopmentUnitPlan,
  defineSemanticDevelopmentUnitPlan,
  DevelopmentUnitRunner,
} from '../src/development-unit.mjs';
import {
  SemanticDevelopmentOperationRuntime,
  createLocalSemanticDevelopmentAgent,
} from '../src/development-runtime.mjs';
import {
  CaseAgentDriveAuthority,
  MemoryCaseAgentDriveStore,
  CaseRepository,
  MemorySnapshotStore,
} from '../src/index.mjs';

const catalog = normalizeDevelopmentOperationCatalog(JSON.parse(await readFile(
  new URL('../config/development-operation-catalog.json', import.meta.url),
  'utf8',
)));

function semanticPlan({ content = 'export const value = 1;\n', contractDigest = null, writePaths = ['src/value.mjs'] } = {}) {
  const baseTree = { 'README.md': '# semantic base\n' };
  const baseDigest = digest(baseTree);
  const descriptor = developmentOperationDescriptor(catalog, DEVELOPMENT_CHANGESET_COMPOSE_OPERATION, 1);
  return defineSemanticDevelopmentUnitPlan({
    revisionId: 'semantic-development-v1',
    baseTree,
    repositoryCommitOid: 'a'.repeat(40),
    contextReferenceId: 'context-semantic-v1',
    operationCatalog: catalog,
    operation: {
      id: DEVELOPMENT_CHANGESET_COMPOSE_OPERATION,
      version: 1,
      contractDigest: contractDigest ?? descriptor.contractDigest,
      input: { baseDigest, writes: [{ path: 'src/value.mjs', content }] },
    },
    writePaths,
  });
}

test('semantic development Plan is change -> owner-required validate -> Promotion with no model Task', () => {
  const plan = semanticPlan();
  assert.deepEqual(plan.taskOrder, [
    DEVELOPMENT_UNIT_CHANGE_TASK_ID,
    DEVELOPMENT_UNIT_PROMOTION_TASK_ID,
    DEVELOPMENT_UNIT_VALIDATION_TASK_ID,
  ]);
  assert.equal(plan.tasksById[DEVELOPMENT_UNIT_CONTEXT_TASK_ID], undefined);
  assert.equal(plan.tasksById[DEVELOPMENT_UNIT_MODEL_TASK_ID], undefined);
  const change = plan.tasksById[DEVELOPMENT_UNIT_CHANGE_TASK_ID];
  const requiredValidation = requiredDevelopmentValidation(catalog);
  assert.equal(change.execution.operation, DEVELOPMENT_CHANGESET_COMPOSE_OPERATION);
  assert.equal(change.input.operation.id, DEVELOPMENT_CHANGESET_COMPOSE_OPERATION);
  assert.equal(change.input.operation.version, 1);
  assert.equal(change.input.operation.contractDigest, developmentOperationDescriptor(catalog, DEVELOPMENT_CHANGESET_COMPOSE_OPERATION, 1).contractDigest);
  assert.equal(plan.tasksById[DEVELOPMENT_UNIT_VALIDATION_TASK_ID].execution.operation, requiredValidation.operationId);
  assert.equal(plan.tasksById[DEVELOPMENT_UNIT_VALIDATION_TASK_ID].execution.requirePassed, true);
  assert.equal(plan.tasksById[DEVELOPMENT_UNIT_VALIDATION_TASK_ID].input.policyId, requiredValidation.policyId);
  assert.equal(plan.tasksById[DEVELOPMENT_UNIT_PROMOTION_TASK_ID].kind, 'promotion');
});

test('semantic Plan digest commits operation input and owner validation while stale contract or scope fails closed', () => {
  const first = semanticPlan({ content: 'export const value = 1;\n' });
  const second = semanticPlan({ content: 'export const value = 2;\n' });
  assert.notEqual(first.planDigest, second.planDigest);
  assert.throws(() => semanticPlan({ contractDigest: digest({ stale: true }) }), (error) => error?.code === 'development_operation_contract_mismatch');
  assert.throws(() => semanticPlan({ writePaths: ['src/other.mjs'] }), (error) => error?.code === 'development_operation_scope_denied');
});

test('no-Codex semantic runtime drives Case -> Agent -> validation -> Promotion with zero model process starts', async (t) => {
  const repositoryPath = await mkdtemp(path.join(os.tmpdir(), 'tdev-semantic-no-codex-'));
  t.after(() => rm(repositoryPath, { recursive: true, force: true }));
  const git = (args) => {
    const result = spawnSync('git', args, { cwd: repositoryPath, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git(['init', '-q']);
  await writeFile(path.join(repositoryPath, 'README.md'), '# semantic base\n');
  git(['add', 'README.md']);
  git(['-c', 'user.name=tdev-test', '-c', 'user.email=tdev@example.invalid', 'commit', '-qm', 'semantic base']);
  const repositoryCommitOid = git(['rev-parse', 'HEAD']);

  const validationCalls = [];
  const operationRuntime = new SemanticDevelopmentOperationRuntime({
    catalog,
    repositoryPath,
    validationExecutor: {
      async execute({ candidateRoot, candidateTreeDigest, validationProfile }) {
        validationCalls.push({ candidateTreeDigest, validationProfile });
        assert.equal(await readFile(path.join(candidateRoot, 'src', 'value.mjs'), 'utf8'), 'export const value = 1;\n');
        return {
          kind: 'validation',
          passed: true,
          checks: [{ id: 'owner-required-semantic-check', passed: true }],
          evidence: { candidateTreeDigest, validationProfile },
        };
      },
    },
  });
  t.after(() => operationRuntime.dispose());
  assert.equal(operationRuntime.availability()[DEVELOPMENT_CHANGE_GENERATE_OPERATION].available, false);

  const agent = createLocalSemanticDevelopmentAgent({ operationRuntime });
  const caseContract = {
    caseGrant: [...agent.identity.capabilities],
    workspacePolicy: [...agent.identity.capabilities],
  };
  const baseTree = { 'README.md': '# semantic base\n' };
  const baseDigest = digest(baseTree);
  const descriptor = developmentOperationDescriptor(catalog, DEVELOPMENT_CHANGESET_COMPOSE_OPERATION, 1);
  const plan = defineSemanticDevelopmentUnitPlan({
    revisionId: 'semantic-no-codex-v1',
    baseTree,
    repositoryCommitOid,
    contextReferenceId: 'context-semantic-no-codex',
    operationCatalog: catalog,
    operation: {
      id: DEVELOPMENT_CHANGESET_COMPOSE_OPERATION,
      version: 1,
      contractDigest: descriptor.contractDigest,
      input: { baseDigest, writes: [{ path: 'src/value.mjs', content: 'export const value = 1;\n' }] },
    },
    writePaths: ['src/value.mjs'],
    caseContract,
  });
  const caseRepository = new CaseRepository(new MemorySnapshotStore());
  const driveAuthority = new CaseAgentDriveAuthority({ store: new MemoryCaseAgentDriveStore() });
  const runner = new DevelopmentUnitRunner({
    repository: caseRepository,
    driveAuthority,
    agent,
    operationCatalog: catalog,
    caseContract,
  });
  await runner.create({
    caseId: 'case-semantic-no-codex',
    plan,
    driveRequestId: 'drive-semantic-no-codex',
    payload: { source: 'chatgpt-authored-changeset' },
  });
  const driven = await runner.drive({
    caseId: 'case-semantic-no-codex',
    driveRequestId: 'drive-semantic-no-codex',
    payload: { source: 'chatgpt-authored-changeset' },
  });
  assert.equal(driven.classification, 'accepted');
  assert.equal(agent.calls.dispatch.length, 2);
  assert.deepEqual(agent.calls.dispatch.map((call) => call.taskId), [DEVELOPMENT_UNIT_CHANGE_TASK_ID, DEVELOPMENT_UNIT_VALIDATION_TASK_ID]);
  assert.equal(validationCalls.length, 1);

  const candidate = await runner.candidate('case-semantic-no-codex');
  assert.equal(candidate.caseState, 'succeeded');
  assert.equal(candidate.canonicalTree['src/value.mjs'], 'export const value = 1;\n');
  assert.equal(candidate.modelProcessStarts, 0);
  assert.equal(candidate.candidateCleanup?.cleanupComplete, true);
  assert.equal(candidate.candidateCleanup?.positiveAbsence, true);
  assert.equal(candidate.taskOutcomes[DEVELOPMENT_UNIT_CHANGE_TASK_ID].state, 'succeeded');
  assert.equal(candidate.taskOutcomes[DEVELOPMENT_UNIT_VALIDATION_TASK_ID].state, 'succeeded');
  assert.equal(candidate.taskOutcomes[DEVELOPMENT_UNIT_PROMOTION_TASK_ID].state, 'succeeded');
  assert.equal(candidate.taskOutcomes[DEVELOPMENT_UNIT_MODEL_TASK_ID], undefined);

  const quiesced = await runner.drive({
    caseId: 'case-semantic-no-codex',
    driveRequestId: 'drive-semantic-no-codex',
    payload: { source: 'chatgpt-authored-changeset' },
  });
  assert.equal(quiesced.classification, 'quiesced');
  assert.equal(agent.calls.dispatch.length, 2);
});

test('semantic ChangeSet Plan rejects empty changes while legacy profile-bound Plan keeps historical shape', () => {
  const baseTree = { 'README.md': '# semantic base\n' };
  const baseDigest = digest(baseTree);
  const descriptor = developmentOperationDescriptor(catalog, DEVELOPMENT_CHANGESET_COMPOSE_OPERATION, 1);
  assert.throws(() => defineSemanticDevelopmentUnitPlan({
    revisionId: 'semantic-empty-v1',
    baseTree,
    repositoryCommitOid: 'a'.repeat(40),
    contextReferenceId: 'context-semantic-empty',
    operationCatalog: catalog,
    operation: {
      id: DEVELOPMENT_CHANGESET_COMPOSE_OPERATION,
      version: 1,
      contractDigest: descriptor.contractDigest,
      input: { baseDigest, writes: [] },
    },
  }), (error) => error?.code === 'development_operation_empty_changeset');

  const legacy = defineDevelopmentUnitPlan({
    revisionId: 'legacy-development-v1',
    baseTree,
    repositoryCommitOid: 'a'.repeat(40),
    instruction: 'legacy instruction',
  });
  assert.deepEqual(legacy.taskOrder, [
    DEVELOPMENT_UNIT_CONTEXT_TASK_ID,
    DEVELOPMENT_UNIT_MODEL_TASK_ID,
    DEVELOPMENT_UNIT_PROMOTION_TASK_ID,
    DEVELOPMENT_UNIT_VALIDATION_TASK_ID,
  ]);
});
