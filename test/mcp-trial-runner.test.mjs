import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  MCP_AUTH_PROFILE,
  MCP_TRIAL_AGENT_CLASS_NAME,
  MCP_TRIAL_CASE_CLASS_NAME,
  MCP_TRIAL_COMPOSITION_PROFILE,
  MCP_TRIAL_COMPOSITION_RESOURCE,
  MCP_TRIAL_DRIVE_CLASS_NAME,
  createMcpTrialDevelopmentUnitRunner,
  defineDevelopmentUnitPlan,
  digest,
  normalizeDevelopmentOperationManifest,
  resolveValidationOperationProfile,
} from '../src/index.mjs';

const COMMIT = 'a'.repeat(40);
const BASE_TREE = { 'src/base.mjs': 'export const base = 1;\n' };

test('D0046 resolves the public validation capability to one fixed operation profile', () => {
  const operationManifest = normalizeDevelopmentOperationManifest(JSON.parse(
    readFileSync(new URL('../config/development-operation-profiles.json', import.meta.url), 'utf8'),
  ));
  assert.equal(resolveValidationOperationProfile(operationManifest, 'tdev.validation.npm-check.v1'), 'tdev.repository.validate.v1');
  assert.equal(resolveValidationOperationProfile(operationManifest, 'tdev.repository.validate.v1'), 'tdev.repository.validate.v1');
  assert.throws(() => resolveValidationOperationProfile(operationManifest, 'tdev.validation.unknown.v1'), { code: 'mcp_trial_validation_profile_invalid' });
});

function placement(workerScript, className, namespace) {
  return {
    deployment: 'qualification',
    environment: 'nonproduction',
    workerScript,
    className,
    namespace,
    jurisdiction: 'global',
  };
}

function buildManifest(operationManifest) {
  const operation = {
    manifestDigest: digest(operationManifest),
    contextProfile: 'tdev.repository.context.prepare.v1',
    modelProfile: 'tdev.model.repository.execute.v1',
    validationProfile: 'tdev.repository.validate.v1',
  };
  return {
    schemaVersion: 1,
    profile: MCP_TRIAL_COMPOSITION_PROFILE,
    resource: MCP_TRIAL_COMPOSITION_RESOURCE,
    workerScript: 'tdev-mcp-trial',
    environment: 'nonproduction',
    jurisdiction: 'global',
    caseOwner: { placement: placement('case-worker', MCP_TRIAL_CASE_CLASS_NAME, 'case-ns') },
    driveOwner: { placement: placement('drive-worker', MCP_TRIAL_DRIVE_CLASS_NAME, 'drive-ns') },
    agentOwner: { placement: placement('agent-worker', MCP_TRIAL_AGENT_CLASS_NAME, 'agent-ns'), agentId: 'agent-trial', routeGeneration: 1 },
    repository: {
      commitOid: COMMIT,
      baseDigest: digest(BASE_TREE),
      objectFormat: 'sha1',
      contextReference: 'ctx-trial-1',
      context: {
        revisionId: 'revision-trial-1',
        baseTree: BASE_TREE,
        repositoryCommitOid: COMMIT,
        objectFormat: 'sha1',
        contextReferenceId: 'ctx-trial-1',
      },
    },
    operation,
    identity: { principalId: 'principal-trial', tenantId: 'tenant-trial' },
    authProfile: MCP_AUTH_PROFILE,
    casePrefix: 'trial-',
    canonicalWriterEnabled: false,
    previewWritersEnabled: false,
  };
}

test('D0046 candidate projection returns a bounded diff instead of the complete base tree', async () => {
  const operationManifest = normalizeDevelopmentOperationManifest(JSON.parse(
    readFileSync(new URL('../config/development-operation-profiles.json', import.meta.url), 'utf8'),
  ));
  const plan = defineDevelopmentUnitPlan({
    revisionId: 'revision-trial-1',
    baseTree: BASE_TREE,
    repositoryCommitOid: COMMIT,
    instruction: 'write one file',
    validationProfile: 'tdev.validation.npm-check.v1',
  });
  const serializedPlan = {
    revisionId: plan.revisionId,
    baseTree: plan.baseTree,
    baseDigest: plan.baseDigest,
    tasks: plan.taskOrder.map((taskId) => plan.tasksById[taskId]),
    planDigest: plan.planDigest,
  };
  const snapshot = {
    schemaVersion: 2,
    caseId: 'trial-case-1',
    caseState: 'active',
    caseRevision: 3,
    eventSequence: 3,
    plan: serializedPlan,
    events: [],
    canonicalTree: BASE_TREE,
    canonicalDigest: digest(BASE_TREE),
    taskStates: {
      context: { state: 'succeeded', acceptedResult: { kind: 'observation', subject: 'context', value: { referenceId: 'ctx-trial-1' } } },
      model: { state: 'succeeded', acceptedResult: { kind: 'changeset', baseDigest: digest(BASE_TREE), writes: [{ path: 'src/changed.mjs', content: 'export const changed = true;\n' }] } },
      validate: { state: 'succeeded', acceptedResult: { kind: 'validation', passed: true, checks: [] } },
      promote: { state: 'pending', acceptedResult: null },
    },
    attempts: {},
    receipts: {},
  };
  const runner = createMcpTrialDevelopmentUnitRunner({
    repository: { create: async () => null, load: async () => ({ snapshot: () => snapshot }), command: async () => null },
    driveOwner: { initialize: async () => null, advance: async () => null },
    agentOwner: { invoke: async () => null, readRoute: async () => null, readResultHandoff: async () => null, routeBinding: () => ({}) },
    manifest: buildManifest(operationManifest),
    operationManifest,
  });
  const candidate = await runner.candidate('trial-case-1');
  assert.equal(Object.hasOwn(candidate, 'canonicalTree'), false);
  assert.equal(candidate.baseDigest, digest(BASE_TREE));
  assert.equal(candidate.changeCount, 1);
  assert.deepEqual(candidate.changedPaths, ['src/changed.mjs']);
  assert.deepEqual(candidate.changes, [{ taskId: 'model', path: 'src/changed.mjs', content: 'export const changed = true;\n' }]);
  assert.equal(candidate.candidateDigest, digest({ ...BASE_TREE, 'src/changed.mjs': 'export const changed = true;\n' }));
});
