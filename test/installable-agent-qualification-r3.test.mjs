import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  QUALIFICATION_DEPLOYMENT_PROFILE,
  QUALIFICATION_EVIDENCE_PROFILE,
  QUALIFICATION_GLOBAL_MUTATION_RESOURCE,
  QUALIFICATION_GLOBAL_MUTATION_RESOURCE_TYPE,
  assertExpectedDeploymentIdentity,
  createQualificationDeploymentBindingPlan,
  qualificationDeploymentIdentityDigest,
  validateTerminalQualificationEvidence,
} from '../qualification/installable-agent-qualification-r3.mjs';
import {
  FileQualificationJournal,
  qualificationRunRecordDigest,
} from '../qualification/installable-agent-qualification-journal.mjs';

const digest = (character) => `sha256:${character.repeat(64)}`;
const CONTROLLER_A = digest('a');
const CONTROLLER_B = digest('b');
const GENESIS = digest('c');
const MUTATION = digest('d');
const REREAD = digest('e');
const CLEANUP = digest('f');
const EXCLUSION = digest('1');
const ARTIFACT = digest('2');

function target(overrides = {}) {
  return {
    profile: QUALIFICATION_DEPLOYMENT_PROFILE,
    sourceSha: '1234567890abcdef1234567890abcdef12345678',
    artifactDigest: ARTIFACT,
    artifactManifestDigest: digest('0'),
    workerVersionId: 'worker-v1',
    accountId: 'account-one',
    serviceName: 'tdev-d0020-qualification',
    deployment: 'qualification',
    environment: 'nonproduction',
    deploymentEpoch: 'epoch-one',
    stateChangingTrafficPercentage: 100,
    qualificationEndpointOrigin: 'https://qualification.example',
    routeId: 'route-one',
    routePattern: 'qualification.example/*',
    workerScript: 'tdev-d0020-qualification',
    namespaceId: 'namespace-one',
    namespace: 'tdev-d0020-qualification_AgentDeliveryRuntimeDO',
    className: 'AgentDeliveryRuntimeDO',
    jurisdiction: 'global',
    agentId: 'agent-one',
    routeGeneration: 7,
    durableObjectId: 'do-agent-one',
    routeCurrentTupleDigest: digest('a'),
    routeVerifierDigest: digest('b'),
    ...overrides,
  };
}

function routeBindingFor(exact, overrides = {}) {
  return {
    agentId: exact.agentId,
    routeGeneration: exact.routeGeneration,
    deployment: exact.deployment,
    environment: exact.environment,
    workerScript: exact.workerScript,
    className: exact.className,
    namespace: exact.namespace,
    jurisdiction: exact.jurisdiction,
    durableObjectId: exact.durableObjectId,
    ...overrides,
  };
}

function runtimeFactsFor(exact, overrides = {}) {
  return {
    sourceSha: exact.sourceSha,
    artifactDigest: exact.artifactDigest,
    artifactManifestDigest: exact.artifactManifestDigest,
    workerVersionId: exact.workerVersionId,
    accountId: exact.accountId,
    serviceName: exact.serviceName,
    deployment: exact.deployment,
    environment: exact.environment,
    deploymentEpoch: exact.deploymentEpoch,
    stateChangingTrafficPercentage: exact.stateChangingTrafficPercentage,
    qualificationEndpointOrigin: exact.qualificationEndpointOrigin,
    routeId: exact.routeId,
    routePattern: exact.routePattern,
    workerScript: exact.workerScript,
    namespaceId: exact.namespaceId,
    namespace: exact.namespace,
    className: exact.className,
    jurisdiction: exact.jurisdiction,
    durableObjectId: exact.durableObjectId,
    routeCurrentTupleDigest: exact.routeCurrentTupleDigest,
    routeVerifierDigest: exact.routeVerifierDigest,
    ...overrides,
  };
}

async function journalFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdev-d0039-r3-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const journal = new FileQualificationJournal(root);
  await journal.createGenesis({ genesisEvidenceDigest: GENESIS });
  return { journal, root };
}

function mutationClaims(resource = 'agent-one:7') {
  return [
    { resourceType: QUALIFICATION_GLOBAL_MUTATION_RESOURCE_TYPE, resourceIdentity: QUALIFICATION_GLOBAL_MUTATION_RESOURCE, mode: 'exclusive_mutation' },
    { resourceType: 'agent_route', resourceIdentity: resource, mode: 'exclusive_mutation' },
  ];
}

async function transition(journal, runId, generation, controller, nextState, extra = {}) {
  const before = await journal.read();
  const run = before.runs[`${runId}:${generation}`];
  return journal.transitionRun({
    expectedStoreRevision: before.revision,
    qualificationRunId: runId,
    runGeneration: generation,
    controllerIdentityDigest: controller,
    expectedRunRecordDigest: qualificationRunRecordDigest(run),
    nextState,
    ...extra,
  });
}

test('Revision-3 deployment binding plan is deterministic and secret-free', () => {
  const exact = target();
  const plan = createQualificationDeploymentBindingPlan({
    sourceSha: exact.sourceSha,
    artifactDigest: exact.artifactDigest,
    artifactManifestDigest: exact.artifactManifestDigest,
    accountId: exact.accountId,
    serviceName: exact.serviceName,
    deploymentEpoch: exact.deploymentEpoch,
    qualificationEndpointOrigin: exact.qualificationEndpointOrigin,
    routeId: exact.routeId,
    routePattern: exact.routePattern,
    namespaceId: exact.namespaceId,
  });
  assert.equal(plan.values.TDEV_D0039_STATE_CHANGING_TRAFFIC_PERCENTAGE, '100');
  assert.equal(plan.values.TDEV_SOURCE_SHA, exact.sourceSha);
  assert.deepEqual(plan.cloudflarePlainTextBindings.map((binding) => binding.name), [...plan.cloudflarePlainTextBindings.map((binding) => binding.name)].sort());
  assert.equal(plan.cloudflarePlainTextBindings.some((binding) => /TOKEN|SECRET|KEY/.test(binding.name)), false);
});

test('Revision-3 deployment identity binds exact S/A/V/R and terminal evidence requires independent principals', () => {
  const exact = target();
  const deploymentIdentityDigest = qualificationDeploymentIdentityDigest(exact);
  const checked = assertExpectedDeploymentIdentity({
    expectedDeploymentIdentityDigest: deploymentIdentityDigest,
    runtimeFacts: runtimeFactsFor(exact),
    routeBinding: routeBindingFor(exact),
  });
  assert.equal(checked.digest, deploymentIdentityDigest);
  assert.throws(
    () => assertExpectedDeploymentIdentity({
      expectedDeploymentIdentityDigest: deploymentIdentityDigest,
      runtimeFacts: runtimeFactsFor(exact, { workerVersionId: 'worker-v2' }),
      routeBinding: routeBindingFor(exact),
    }),
    (error) => error?.code === 'qualification_runtime_identity_mismatch',
  );

  const observation = (principal) => ({ principal, identityDigest: digest('3'), freshnessDigest: digest('4'), evidenceDigest: digest('5') });
  const evidence = {
    schemaVersion: 2,
    profile: QUALIFICATION_EVIDENCE_PROFILE,
    qualificationRunId: 'run-q2',
    runGeneration: 1,
    gate: 'q2_workers_crypto',
    target: exact,
    targetDigest: deploymentIdentityDigest,
    deploymentIdentityDigest,
    principalObservations: [observation('provider_control_plane'), observation('route_owner_runtime')],
    readSet: ['provider-version', 'route-runtime'],
    writeSet: [],
    invalidationSet: [],
    secretValues: 'excluded',
  };
  assert.equal(validateTerminalQualificationEvidence(evidence).profile, QUALIFICATION_EVIDENCE_PROFILE);
  assert.throws(
    () => validateTerminalQualificationEvidence({ ...evidence, principalObservations: [observation('route_owner_runtime')] }),
    (error) => error?.code === 'qualification_evidence_authenticator_missing',
  );
  assert.throws(
    () => validateTerminalQualificationEvidence({ ...evidence, target: target({ routeGeneration: 8 }) }),
    (error) => error?.code === 'qualification_evidence_target_mismatch',
  );
});

test('qualification journal admits concurrent shared reads but exclusive claims are all-or-none and preserve high-water', async (t) => {
  const { journal } = await journalFixture(t);
  let state = await journal.read();
  state = await journal.prepareRun({
    expectedStoreRevision: state.revision,
    qualificationRunId: 'read-one',
    runGeneration: 1,
    controllerIdentityDigest: CONTROLLER_A,
    target: target(),
    stableMutationIdentityDigest: digest('6'),
    intendedOperation: 'read',
    authoritativeRereadDigest: REREAD,
    claims: [{ resourceType: 'agent_route', resourceIdentity: 'agent-one:7', mode: 'shared_read' }],
  });
  state = await journal.prepareRun({
    expectedStoreRevision: state.revision,
    qualificationRunId: 'read-two',
    runGeneration: 1,
    controllerIdentityDigest: CONTROLLER_B,
    target: target(),
    stableMutationIdentityDigest: digest('7'),
    intendedOperation: 'read',
    authoritativeRereadDigest: REREAD,
    claims: [{ resourceType: 'agent_route', resourceIdentity: 'agent-one:7', mode: 'shared_read' }],
  });
  const routeBucket = Object.values(state.claims).find((bucket) => bucket.holders.some((holder) => holder.resourceType === 'agent_route'));
  assert.deepEqual(routeBucket.holders.map((holder) => holder.claimGeneration), [1, 2]);

  state = await journal.acquireMutationController({ controllerIdentityDigest: CONTROLLER_A, expectedStoreRevision: state.revision });
  const beforeConflict = state;
  await assert.rejects(
    journal.prepareRun({
      expectedStoreRevision: state.revision,
      qualificationRunId: 'mutation-conflict',
      runGeneration: 1,
      controllerIdentityDigest: CONTROLLER_A,
      target: target(),
      stableMutationIdentityDigest: MUTATION,
      intendedOperation: 'register_installable_agent',
      authoritativeRereadDigest: REREAD,
      claims: mutationClaims(),
    }),
    (error) => error?.code === 'qualification_claim_conflict',
  );
  state = await journal.read();
  assert.equal(state.revision, beforeConflict.revision);
  assert.equal(state.runs['mutation-conflict:1'], undefined);
  assert.equal(Object.values(state.claims).some((bucket) => bucket.holders.some((holder) => holder.qualificationRunId === 'mutation-conflict')), false);
});

test('mutation run requires durable PREPARED, exact CAS, reconciliation and CLEAN before claim reuse', async (t) => {
  const { journal } = await journalFixture(t);
  let state = await journal.read();
  state = await journal.acquireMutationController({ controllerIdentityDigest: CONTROLLER_A, expectedStoreRevision: state.revision });
  state = await journal.prepareRun({
    expectedStoreRevision: state.revision,
    qualificationRunId: 'mutation-one',
    runGeneration: 1,
    controllerIdentityDigest: CONTROLLER_A,
    target: target(),
    stableMutationIdentityDigest: MUTATION,
    intendedOperation: 'register_installable_agent',
    authoritativeRereadDigest: REREAD,
    claims: mutationClaims(),
  });
  const prepared = state.runs['mutation-one:1'];
  assert.equal(prepared.state, 'PREPARED');
  assert.equal(prepared.targetDigest, qualificationDeploymentIdentityDigest(target()));

  await assert.rejects(
    journal.transitionRun({
      expectedStoreRevision: state.revision - 1,
      qualificationRunId: 'mutation-one',
      runGeneration: 1,
      controllerIdentityDigest: CONTROLLER_A,
      expectedRunRecordDigest: qualificationRunRecordDigest(prepared),
      nextState: 'DISPATCHED',
    }),
    (error) => error?.code === 'qualification_store_conflict',
  );
  await assert.rejects(
    journal.transitionRun({
      expectedStoreRevision: state.revision,
      qualificationRunId: 'mutation-one',
      runGeneration: 1,
      controllerIdentityDigest: CONTROLLER_A,
      expectedRunRecordDigest: digest('8'),
      nextState: 'DISPATCHED',
    }),
    (error) => error?.code === 'qualification_run_conflict',
  );

  state = await transition(journal, 'mutation-one', 1, CONTROLLER_A, 'DISPATCHED');
  await assert.rejects(
    transition(journal, 'mutation-one', 1, CONTROLLER_A, 'TERMINAL_APPLIED', { reconciliationOutcome: 'POSITIVE_APPLIED' }),
    (error) => error?.code === 'qualification_transition_invalid',
  );
  state = await transition(journal, 'mutation-one', 1, CONTROLLER_A, 'RECONCILING', { reconciliationOutcome: 'STILL_AMBIGUOUS' });
  assert.equal(state.runs['mutation-one:1'].state, 'RECONCILING');
  state = await transition(journal, 'mutation-one', 1, CONTROLLER_A, 'RECONCILING', { reconciliationOutcome: 'ADMITTED_IN_PROGRESS' });
  state = await transition(journal, 'mutation-one', 1, CONTROLLER_A, 'TERMINAL_APPLIED', { reconciliationOutcome: 'POSITIVE_APPLIED' });
  state = await transition(journal, 'mutation-one', 1, CONTROLLER_A, 'CLEANUP_PENDING');
  await assert.rejects(
    transition(journal, 'mutation-one', 1, CONTROLLER_A, 'CLEAN'),
    (error) => error?.code === 'qualification_cleanup_unproven',
  );
  state = await transition(journal, 'mutation-one', 1, CONTROLLER_A, 'CLEAN', { cleanupEvidenceDigest: CLEANUP });
  assert.equal(state.runs['mutation-one:1'], undefined);
  assert.ok(state.tombstones['mutation-one:1']);
  const firstHighWater = { ...state.claimHighWater };
  state = await journal.releaseMutationController({ controllerIdentityDigest: CONTROLLER_A, expectedStoreRevision: state.revision });
  state = await journal.acquireMutationController({ controllerIdentityDigest: CONTROLLER_A, expectedStoreRevision: state.revision });
  state = await journal.prepareRun({
    expectedStoreRevision: state.revision,
    qualificationRunId: 'mutation-two',
    runGeneration: 1,
    controllerIdentityDigest: CONTROLLER_A,
    target: target(),
    stableMutationIdentityDigest: digest('9'),
    intendedOperation: 'register_installable_agent',
    authoritativeRereadDigest: REREAD,
    claims: mutationClaims(),
  });
  for (const claim of state.runs['mutation-two:1'].claims) assert.equal(claim.claimGeneration, firstHighWater[claim.resourceKey] + 1);
});

test('mutation controller has no automatic live takeover and positive exclusion rebinds exact predecessor obligations', async (t) => {
  const { journal } = await journalFixture(t);
  let state = await journal.read();
  state = await journal.acquireMutationController({ controllerIdentityDigest: CONTROLLER_A, expectedStoreRevision: state.revision });
  state = await journal.prepareRun({
    expectedStoreRevision: state.revision,
    qualificationRunId: 'takeover-run',
    runGeneration: 1,
    controllerIdentityDigest: CONTROLLER_A,
    target: target(),
    stableMutationIdentityDigest: MUTATION,
    intendedOperation: 'register_installable_agent',
    authoritativeRereadDigest: REREAD,
    claims: mutationClaims(),
  });
  await assert.rejects(
    journal.acquireMutationController({ controllerIdentityDigest: CONTROLLER_B, expectedStoreRevision: state.revision }),
    (error) => error?.code === 'qualification_controller_busy',
  );
  await assert.rejects(
    journal.admitSuccessorMutationController({
      expectedStoreRevision: state.revision,
      expectedControllerIdentityDigest: CONTROLLER_A,
      successorControllerIdentityDigest: CONTROLLER_B,
      predecessorExclusionEvidenceDigest: EXCLUSION,
      predecessorRuns: [],
    }),
    (error) => error?.code === 'qualification_predecessor_exclusion_incomplete',
  );
  state = await journal.read();
  const predecessorDigest = qualificationRunRecordDigest(state.runs['takeover-run:1']);
  state = await journal.admitSuccessorMutationController({
    expectedStoreRevision: state.revision,
    expectedControllerIdentityDigest: CONTROLLER_A,
    successorControllerIdentityDigest: CONTROLLER_B,
    predecessorExclusionEvidenceDigest: EXCLUSION,
    predecessorRuns: [{ runKey: 'takeover-run:1', runRecordDigest: predecessorDigest }],
  });
  assert.equal(state.mutationController.controllerIdentityDigest, CONTROLLER_B);
  assert.equal(state.runs['takeover-run:1'].controllerIdentityDigest, CONTROLLER_B);
  await assert.rejects(
    journal.transitionRun({
      expectedStoreRevision: state.revision,
      qualificationRunId: 'takeover-run',
      runGeneration: 1,
      controllerIdentityDigest: CONTROLLER_A,
      expectedRunRecordDigest: qualificationRunRecordDigest(state.runs['takeover-run:1']),
      nextState: 'DISPATCHED',
    }),
    (error) => error?.code === 'qualification_controller_conflict',
  );
  state = await transition(journal, 'takeover-run', 1, CONTROLLER_B, 'DISPATCHED');
  assert.equal(state.runs['takeover-run:1'].state, 'DISPATCHED');
});

test('journal fails closed on missing/corrupt state and retained mutation lock', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdev-d0039-r3-corrupt-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const journal = new FileQualificationJournal(root);
  await assert.rejects(journal.read(), (error) => error?.code === 'qualification_store_unavailable');
  await journal.createGenesis({ genesisEvidenceDigest: GENESIS });
  await fs.writeFile(path.join(root, 'state.json'), '{"not":"canonical"}\n');
  await assert.rejects(journal.read(), (error) => error?.code === 'unexpected_keys' || error?.code === 'corrupt_qualification_store');

  const lockedRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tdev-d0039-r3-lock-'));
  t.after(() => fs.rm(lockedRoot, { recursive: true, force: true }));
  const locked = new FileQualificationJournal(lockedRoot);
  await locked.createGenesis({ genesisEvidenceDigest: GENESIS });
  await fs.writeFile(path.join(lockedRoot, 'mutation.lock'), 'retained');
  await assert.rejects(
    locked.acquireMutationController({ controllerIdentityDigest: CONTROLLER_A, expectedStoreRevision: 1 }),
    (error) => error?.code === 'qualification_controller_busy',
  );
  const recovered = await locked.clearRetainedWriterLock({ expectedStoreRevision: 1, predecessorExclusionEvidenceDigest: EXCLUSION });
  assert.equal(recovered.classification, 'retained_writer_lock_cleared_after_positive_exclusion');
  const acquired = await locked.acquireMutationController({ controllerIdentityDigest: CONTROLLER_A, expectedStoreRevision: 1 });
  assert.equal(acquired.mutationController.controllerIdentityDigest, CONTROLLER_A);
});
