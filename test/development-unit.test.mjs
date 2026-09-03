import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CaseAgentDriveAuthority,
  DEVELOPMENT_UNIT_CONTEXT_TASK_ID,
  DEVELOPMENT_UNIT_MODEL_TASK_ID,
  DEVELOPMENT_UNIT_PROMOTION_TASK_ID,
  DEVELOPMENT_UNIT_VALIDATION_TASK_ID,
  DevelopmentUnitRunner,
  MemoryCaseAgentDriveStore,
  MemorySnapshotStore,
  CaseRepository,
  defineDevelopmentUnitPlan,
  developmentOperationCapabilityId,
  createDevelopmentUnitOperationExecutor,
} from '../src/index.mjs';
import { digest } from '../src/canonical.mjs';

const operationManifest = JSON.parse(await readFile(
  new URL('../config/development-operation-profiles.json', import.meta.url),
  'utf8',
));

function capabilityContract(capabilities) {
  return {
    caseGrant: capabilities,
    workspacePolicy: capabilities,
  };
}

function createAgent({ manifest = operationManifest, validationPassed = true } = {}) {
  const profiles = {
    context: 'tdev.repository.context.prepare.v1',
    model: 'tdev.model.repository.execute.v1',
    validation: 'tdev.repository.validate.v1',
  };
  const capabilityByProfile = Object.fromEntries(
    Object.entries(profiles).map(([name, profile]) => [
      name,
      developmentOperationCapabilityId(manifest, profile),
    ]),
  );
  const capabilities = Object.values(capabilityByProfile).sort();
  const calls = { authorize: [], dispatch: [], context: [], model: [], validation: [] };
  const operationExecutor = createDevelopmentUnitOperationExecutor({
    manifest,
    capabilities,
    contextExecutor: async ({ input }) => {
      calls.context.push(input);
      return {
        kind: 'observation',
        subject: 'repository-context',
        value: {
          referenceId: 'context-p1',
          repositoryCommitOid: input.repositoryCommitOid,
          baseDigest: input.baseDigest,
          objectFormat: input.objectFormat,
        },
      };
    },
    modelExecutor: async ({ input }) => {
      calls.model.push(input);
      return {
        kind: 'changeset',
        baseDigest: input.baseDigest,
        writes: [{ path: 'src/p1-feature.txt', content: `${input.instruction}\n` }],
      };
    },
    validationExecutor: async ({ input }) => {
      calls.validation.push(input);
      return {
        kind: 'validation',
        passed: validationPassed,
        checks: [{ id: 'bounded-source-check', passed: validationPassed }],
      };
    },
  });
  return {
    calls,
    capabilityByProfile,
    identity: { id: 'agent-p1', epoch: 1, capabilities },
    authorize: async (request) => {
      calls.authorize.push(request);
      return true;
    },
    observe: async () => ({ available: true, deliveryDigest: digest({ agent: 'agent-p1', calls: calls.dispatch.length }) }),
    dispatch: async (request) => {
      calls.dispatch.push(request);
      return operationExecutor(request);
    },
  };
}

function createRunner({ validationPassed = true } = {}) {
  const repository = new CaseRepository(new MemorySnapshotStore());
  const driveAuthority = new CaseAgentDriveAuthority({ store: new MemoryCaseAgentDriveStore() });
  const agent = createAgent({ validationPassed });
  const capabilities = agent.identity.capabilities;
  const caseContract = capabilityContract(capabilities);
  const runner = new DevelopmentUnitRunner({
    repository,
    driveAuthority,
    agent,
    operationManifest,
    caseContract,
  });
  const plan = defineDevelopmentUnitPlan({
    revisionId: 'p1-development-unit-v1',
    baseTree: { 'README.md': '# P1 base\n' },
    repositoryCommitOid: 'a'.repeat(40),
    instruction: 'add the bounded P1 source feature',
    contextCapabilityId: agent.capabilityByProfile.context,
    modelCapabilityId: agent.capabilityByProfile.model,
    validationCapabilityId: agent.capabilityByProfile.validation,
    caseContract,
  });
  return { repository, driveAuthority, agent, runner, plan };
}

test('P1 source checkpoint drives context, model, validation, and Promotion through Case and Agent', async () => {
  const { repository, agent, runner, plan } = createRunner();
  await runner.create({
    caseId: 'case-p1-source',
    plan,
    driveRequestId: 'drive-p1-source',
    payload: { objective: 'bounded-source-change' },
  });

  const driven = await runner.drive({
    caseId: 'case-p1-source',
    driveRequestId: 'drive-p1-source',
    payload: { objective: 'bounded-source-change' },
  });
  assert.equal(driven.classification, 'accepted');
  assert.equal(agent.calls.authorize.length, 3);
  assert.equal(agent.calls.dispatch.length, 3);
  assert.equal(agent.calls.context.length, 1);
  assert.equal(agent.calls.model.length, 1);
  assert.equal(agent.calls.model[0].contextReferenceId, 'context-p1');
  assert.equal(agent.calls.validation.length, 1);

  const candidate = await runner.candidate('case-p1-source');
  assert.equal(candidate.caseState, 'succeeded');
  assert.equal(candidate.canonicalTree['src/p1-feature.txt'], 'add the bounded P1 source feature\n');
  assert.equal(candidate.canonicalDigest, digest(candidate.canonicalTree));
  assert.equal(candidate.planDigest, plan.planDigest);

  const snapshot = await repository.store.load('case-p1-source');
  assert.equal(snapshot.taskStates[DEVELOPMENT_UNIT_CONTEXT_TASK_ID].state, 'succeeded');
  assert.equal(snapshot.taskStates[DEVELOPMENT_UNIT_MODEL_TASK_ID].state, 'succeeded');
  assert.equal(snapshot.taskStates[DEVELOPMENT_UNIT_VALIDATION_TASK_ID].state, 'succeeded');
  assert.equal(snapshot.taskStates[DEVELOPMENT_UNIT_PROMOTION_TASK_ID].state, 'succeeded');
  assert.equal(snapshot.caseState, 'succeeded');

  const quiesced = await runner.drive({
    caseId: 'case-p1-source',
    driveRequestId: 'drive-p1-source',
    payload: { objective: 'bounded-source-change' },
  });
  assert.equal(quiesced.classification, 'quiesced');
});

test('P1 validation failure leaves the canonical tree at the base and never promotes', async () => {
  const { runner, plan } = createRunner({ validationPassed: false });
  await runner.create({
    caseId: 'case-p1-validation-failure',
    plan,
    driveRequestId: 'drive-p1-validation-failure',
    payload: { objective: 'reject-invalid-source-change' },
  });
  const driven = await runner.drive({
    caseId: 'case-p1-validation-failure',
    driveRequestId: 'drive-p1-validation-failure',
    payload: { objective: 'reject-invalid-source-change' },
  });
  assert.equal(driven.classification, 'reconciling');
  const candidate = await runner.candidate('case-p1-validation-failure');
  assert.equal(candidate.caseState, 'failed');
  assert.deepEqual(candidate.canonicalTree, plan.baseTree);
  const snapshot = await runner.repository.store.load('case-p1-validation-failure');
  assert.equal(snapshot.taskStates[DEVELOPMENT_UNIT_CONTEXT_TASK_ID].state, 'succeeded');
  assert.equal(snapshot.taskStates[DEVELOPMENT_UNIT_MODEL_TASK_ID].state, 'succeeded');
  assert.equal(snapshot.taskStates[DEVELOPMENT_UNIT_VALIDATION_TASK_ID].state, 'failed');
  assert.equal(snapshot.taskStates[DEVELOPMENT_UNIT_PROMOTION_TASK_ID].state, 'blocked');
});
