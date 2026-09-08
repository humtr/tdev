import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createMcpTrialOperationRequest } from '../src/mcp-trial-runner.mjs';

import {
  CaseEngine,
  MCP_AUTH_PROFILE,
  MCP_TRIAL_AGENT_CLASS_NAME,
  MCP_TRIAL_CASE_CLASS_NAME,
  MCP_TRIAL_COMPOSITION_PROFILE,
  MCP_TRIAL_COMPOSITION_RESOURCE,
  MCP_TRIAL_DRIVE_CLASS_NAME,
  createMcpTrialDevelopmentUnitRunner,
  createRepositoryBaseIdentity,
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

test('D0047 Trial operation requests preserve owner-issued lazy context bindings', () => {
  const baseDigest = digest(BASE_TREE);
  const manifestDigest = digest({ repository: 'lazy-trial-request' });
  const treeOid = 'b'.repeat(40);
  const scope = { paths: ['src/base.mjs'], maxFiles: 4, maxBytes: 4096, maxSearchResults: 4 };
  const baseIdentity = {
    schemaVersion: 1,
    profile: 'tdev.repository-base-identity.v1',
    objectFormat: 'sha1',
    commitOid: COMMIT,
    treeOid,
    baseDigest,
    manifestDigest,
  };
  const repositoryBaseIdentity = createRepositoryBaseIdentity({
    objectFormat: 'sha1',
    commitOid: COMMIT,
    treeOid,
    manifestDigest,
  });
  const plan = defineDevelopmentUnitPlan({
    revisionId: 'revision-lazy-trial-request',
    baseTree: BASE_TREE,
    repositoryCommitOid: COMMIT,
    contextProfile: 'tdev.repository.context.prepare.lazy.v1',
    contextScope: scope,
    baseIdentity,
    repositoryBaseIdentity,
    instruction: 'write one file',
    writePaths: ['src/base.mjs'],
  });
  const scopeDigest = digest(scope);
  const view = {
    plan,
    snapshot: {
      taskStates: {
        context: {
          acceptedResult: {
            kind: 'observation',
            subject: 'repository-context',
            value: { referenceId: 'ctx-lazy-trial', scopeDigest },
          },
        },
      },
    },
  };

  assert.deepEqual(JSON.parse(JSON.stringify(createMcpTrialOperationRequest(view, 'context', {}, null))), {
    profile: 'tdev.repository.context.prepare.lazy.v1',
    input: {
      repositoryCommitOid: COMMIT,
      baseDigest,
      objectFormat: 'sha1',
      scope,
      baseIdentity,
      repositoryBaseIdentity: JSON.parse(JSON.stringify(repositoryBaseIdentity)),
    },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(createMcpTrialOperationRequest(view, 'model', {}, null))), {
    profile: 'tdev.model.repository.execute.v1',
    input: {
      repositoryCommitOid: COMMIT,
      baseDigest,
      instruction: 'write one file',
      contextReferenceId: 'ctx-lazy-trial',
      objectFormat: 'sha1',
      contextProfile: 'tdev.repository.context.prepare.lazy.v1',
      contextScope: scope,
      contextScopeDigest: scopeDigest,
      baseIdentity,
      repositoryBaseIdentity: JSON.parse(JSON.stringify(repositoryBaseIdentity)),
      writePaths: ['src/base.mjs'],
    },
  });
});

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

test('D0046 candidate projection reads terminal historical bases but rejects active stale bases', async () => {
  const operationManifest = normalizeDevelopmentOperationManifest(JSON.parse(
    readFileSync(new URL('../config/development-operation-profiles.json', import.meta.url), 'utf8'),
  ));
  const historicalBaseTree = { 'src/old.mjs': 'export const old = 1;\n' };
  const historicalPlan = defineDevelopmentUnitPlan({
    revisionId: 'revision-historical-1',
    baseTree: historicalBaseTree,
    repositoryCommitOid: 'b'.repeat(40),
    instruction: 'write one historical file',
    validationProfile: 'tdev.validation.npm-check.v1',
  });
  const serializedPlan = {
    revisionId: historicalPlan.revisionId,
    baseTree: historicalPlan.baseTree,
    baseDigest: historicalPlan.baseDigest,
    tasks: historicalPlan.taskOrder.map((taskId) => historicalPlan.tasksById[taskId]),
    planDigest: historicalPlan.planDigest,
  };
  const snapshot = {
    schemaVersion: 2,
    caseId: 'trial-historical-case-1',
    caseState: 'succeeded',
    caseRevision: 20,
    eventSequence: 20,
    plan: serializedPlan,
    events: [],
    canonicalTree: {},
    canonicalDigest: null,
    taskStates: {
      context: { state: 'succeeded', acceptedResult: { kind: 'observation', subject: 'context', value: { referenceId: 'ctx-old-1' } } },
      model: { state: 'succeeded', acceptedResult: { kind: 'changeset', baseDigest: digest(historicalBaseTree), writes: [{ path: 'src/changed.mjs', content: 'export const changed = true;\n' }] } },
      validate: { state: 'succeeded', acceptedResult: { kind: 'validation', passed: true, checks: [] } },
      promote: { state: 'succeeded', acceptedResult: null },
    },
    attempts: {},
    receipts: {},
  };
  const historicalTree = { ...historicalBaseTree, 'src/changed.mjs': 'export const changed = true;\n' };
  let materializedReads = 0;
  const runner = createMcpTrialDevelopmentUnitRunner({
    repository: {
      create: async () => null,
      load: async () => ({ snapshot: () => snapshot }),
      materializedProjection: async () => {
        materializedReads += 1;
        return {
          caseId: snapshot.caseId,
          caseState: snapshot.caseState,
          caseRevision: snapshot.caseRevision,
          baseDigest: snapshot.plan.baseDigest,
          planDigest: snapshot.plan.planDigest,
          candidateDigest: digest(historicalTree),
          candidateTreeBytes: 123,
          canonicalDigest: null,
        };
      },
      command: async () => null,
    },
    driveOwner: { initialize: async () => null, advance: async () => null },
    agentOwner: { invoke: async () => null, readRoute: async () => null, readResultHandoff: async () => null, routeBinding: () => ({}) },
    manifest: buildManifest(operationManifest),
    operationManifest,
  });
  const candidate = await runner.candidate('trial-historical-case-1');
  assert.equal(candidate.baseDigest, digest(historicalBaseTree));
  assert.equal(candidate.candidateDigest, digest(historicalTree));
  assert.equal(candidate.candidateTreeBytes, 123);
  assert.equal(materializedReads, 1);
  snapshot.caseState = 'active';
  await assert.rejects(() => runner.candidate('trial-historical-case-1'), { code: 'mcp_trial_context_mismatch' });
  assert.equal(materializedReads, 1);
});

test('D0046 drive expires due Agent reservations before availability gating', async () => {
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
  const caseId = 'trial-expired-reservation';
  const engine = new CaseEngine({ caseId, plan });
  const reservationRequestDigest = digest({ reservation: 'expired' });
  let expired = false;
  const agentState = () => ({
    routeBinding: { agentId: 'agent-trial', routeGeneration: 1 },
    installableAgent: { state: 'CURRENT' },
    connection: expired ? null : { id: 'connection-1', epoch: 1 },
    executor: { id: 'executor-1', epoch: 1 },
    capacity: { revision: 1, effectiveCapacity: 1 },
    reservationWindowGeneration: 1,
    limits: { maxEnvelopeBytes: 16384, maxReservationLifetimeMs: 30000 },
    reservations: {
      stale: {
        reservationWindowGeneration: 1,
        windowGeneration: 1,
        reservationRequestId: 'reservation-stale',
        reservationRequestDigest,
        caseId,
        taskId: 'context',
        predictedAttemptOrdinal: 1,
        slotGeneration: 1,
        requestedSlots: 1,
        expiresAtMs: 999,
        status: expired ? 'expired' : 'reserved',
      },
    },
    deliveries: {},
  });
  const calls = [];
  const runner = createMcpTrialDevelopmentUnitRunner({
    repository: { create: async () => null, load: async () => engine, command: async () => { throw new Error('unexpected Case command'); } },
    driveOwner: { initialize: async () => null, advance: async (input) => ({ classification: 'accepted', input }) },
    agentOwner: {
      async invoke(operation, input) {
        calls.push({ operation, input });
        assert.equal(operation, 'expire_reservation');
        expired = true;
        return { classification: 'accepted' };
      },
      readRoute: async () => agentState(),
      readResultHandoff: async () => null,
      routeBinding: () => ({ agentId: 'agent-trial', routeGeneration: 1 }),
    },
    manifest: buildManifest(operationManifest),
    operationManifest,
    now: () => 1000,
  });
  const result = await runner.drive({ caseId, driveRequestId: 'drive-expiry', payload: {} });
  assert.equal(result.status, 'not_ready');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    operation: 'expire_reservation',
    input: {
      request: {
        reservationWindowGeneration: 1,
        reservationRequestId: 'reservation-stale',
        reservationRequestDigest,
      },
      nowMs: 1000,
    },
  });
});
