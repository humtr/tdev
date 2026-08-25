import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { canonicalJson } from '../src/canonical.mjs';
import {
  FileQualificationJournal as FileQualificationJournalV2,
  qualificationRunRecordDigest as qualificationRunRecordDigestV2,
} from '../qualification/installable-agent-qualification-journal.mjs';
import {
  LEGACY_QUALIFICATION_STORE_PROFILE,
  QUALIFICATION_STORE_PROFILE,
  FileQualificationJournal as FileQualificationJournalV3,
  qualificationRunRecordDigest as qualificationRunRecordDigestV3,
} from '../qualification/installable-agent-qualification-journal-v3.mjs';
import {
  QUALIFICATION_DEPLOYMENT_PROFILE,
  QUALIFICATION_GLOBAL_MUTATION_RESOURCE,
  QUALIFICATION_GLOBAL_MUTATION_RESOURCE_TYPE,
  QUALIFICATION_PROVIDER_DEPLOY_OPERATION,
  QUALIFICATION_ROUTE_BOOTSTRAP_OPERATION,
  QUALIFICATION_ROUTE_BOOTSTRAP_PROFILE,
  QUALIFICATION_RUN_PROFILE,
  QUALIFICATION_TARGET_KIND_ADMITTED_DEPLOYMENT,
  QUALIFICATION_TARGET_KIND_PROVIDER_DEPLOYMENT_INTENT,
  QUALIFICATION_TARGET_KIND_ROUTE_BOOTSTRAP,
  assertQualificationAdmissionCurrent,
  assertQualificationCompositionCompatible,
  assertQualificationRouteBootstrapSuboperation,
  assertQualificationTargetForOperation,
  createQualificationDeploymentIntent,
  createQualificationRouteBootstrap,
  qualificationDeploymentIdentityDigest,
  qualificationRouteBootstrapDigest,
  resourceClaimKey,
} from '../qualification/installable-agent-qualification-r6.mjs';

const digest = (character) => `sha256:${character.repeat(64)}`;
const CONTROLLER = digest('a');
const GENESIS = digest('b');
const REREAD = digest('c');

function finalTarget(overrides = {}) {
  return {
    profile: QUALIFICATION_DEPLOYMENT_PROFILE,
    sourceSha: '1234567890abcdef1234567890abcdef12345678',
    artifactDigest: digest('1'),
    artifactManifestDigest: digest('2'),
    workerVersionId: 'worker-v6',
    accountId: 'account-one',
    serviceName: 'tdev-d0039-r6-qualification',
    deployment: 'qualification',
    environment: 'nonproduction',
    deploymentEpoch: 'epoch-r6',
    stateChangingTrafficPercentage: 100,
    qualificationEndpointOrigin: 'https://tdev-d0039-r6-qualification.humtr.workers.dev',
    ingressKind: 'workers_dev',
    workersDevAccountSubdomain: 'humtr',
    workersDevHostname: 'tdev-d0039-r6-qualification.humtr.workers.dev',
    workersDevEnabled: true,
    workersDevPreviewsEnabled: false,
    workerScript: 'tdev-d0039-r6-qualification',
    namespaceId: 'namespace-one',
    namespace: 'tdev-d0039-r6-qualification_AgentDeliveryRuntimeDO',
    className: 'AgentDeliveryRuntimeDO',
    jurisdiction: 'global',
    agentId: 'agent-one',
    routeGeneration: 7,
    durableObjectId: 'do-agent-one',
    routeCurrentTupleDigest: digest('3'),
    routeVerifierDigest: digest('4'),
    ...overrides,
  };
}

function deploymentIntent(overrides = {}) {
  return createQualificationDeploymentIntent({
    sourceSha: '1234567890abcdef1234567890abcdef12345678',
    artifactDigest: digest('1'),
    artifactManifestDigest: digest('2'),
    accountId: 'account-one',
    serviceName: 'tdev-d0039-r6-qualification',
    deployment: 'qualification',
    environment: 'nonproduction',
    deploymentEpoch: 'epoch-r6',
    qualificationEndpointOrigin: 'https://tdev-d0039-r6-qualification.humtr.workers.dev',
    ingressKind: 'workers_dev',
    workersDevAccountSubdomain: 'humtr',
    workersDevHostname: 'tdev-d0039-r6-qualification.humtr.workers.dev',
    workersDevEnabled: true,
    workersDevPreviewsEnabled: false,
    workerScript: 'tdev-d0039-r6-qualification',
    namespaceId: 'namespace-one',
    namespace: 'tdev-d0039-r6-qualification_AgentDeliveryRuntimeDO',
    className: 'AgentDeliveryRuntimeDO',
    jurisdiction: 'global',
    deploymentBindingDigest: digest('5'),
    predecessorProviderStateDigest: digest('6'),
    authoritativeRereadDigest: REREAD,
    ...overrides,
  });
}

function routeBootstrap(overrides = {}) {
  return createQualificationRouteBootstrap({
    sourceSha: '1234567890abcdef1234567890abcdef12345678',
    artifactDigest: digest('1'),
    artifactManifestDigest: digest('2'),
    accountId: 'account-one',
    serviceName: 'tdev-d0039-r6-qualification',
    deploymentEpoch: 'epoch-r6',
    qualificationEndpointOrigin: 'https://tdev-d0039-r6-qualification.humtr.workers.dev',
    workersDevAccountSubdomain: 'humtr',
    workersDevHostname: 'tdev-d0039-r6-qualification.humtr.workers.dev',
    workerScript: 'tdev-d0039-r6-qualification',
    workerVersionId: 'worker-v6',
    activeDeploymentId: 'deployment-v6',
    activeTrafficPercentage: 100,
    providerConfigurationDigest: digest('7'),
    providerWriterObservationDigest: digest('8'),
    namespaceId: 'namespace-one',
    namespace: 'tdev-d0039-r6-qualification_AgentDeliveryRuntimeDO',
    className: 'AgentDeliveryRuntimeDO',
    jurisdiction: 'global',
    agentId: 'agent-one',
    routeGeneration: 7,
    routePredecessorState: 'UNREGISTERED',
    routePredecessorStateDigest: digest('9'),
    managementRequestSequenceHighWater: 1,
    routeBootstrapTransactionId: 'bootstrap-transaction-one',
    routeBootstrapRequestDigest: digest('d'),
    providerAuthoritativeRereadDigest: digest('e'),
    routeAuthoritativeRereadDigest: digest('f'),
    ...overrides,
  });
}

function mutationClaims(resourceType = 'agent_route', resourceIdentity = 'agent-one:7') {
  return [
    { resourceType: QUALIFICATION_GLOBAL_MUTATION_RESOURCE_TYPE, resourceIdentity: QUALIFICATION_GLOBAL_MUTATION_RESOURCE, mode: 'exclusive_mutation' },
    { resourceType, resourceIdentity, mode: 'exclusive_mutation' },
  ];
}

async function transitionV2(journal, runId, nextState, extra = {}) {
  const state = await journal.read();
  const run = state.runs[`${runId}:1`];
  return journal.transitionRun({
    expectedStoreRevision: state.revision,
    qualificationRunId: runId,
    runGeneration: 1,
    controllerIdentityDigest: CONTROLLER,
    expectedRunRecordDigest: qualificationRunRecordDigestV2(run),
    nextState,
    ...extra,
  });
}

async function transitionV3(journal, runId, nextState, extra = {}) {
  const state = await journal.read();
  const run = state.runs[`${runId}:1`];
  return journal.transitionRun({
    expectedStoreRevision: state.revision,
    qualificationRunId: runId,
    runGeneration: 1,
    controllerIdentityDigest: CONTROLLER,
    expectedRunRecordDigest: qualificationRunRecordDigestV3(run),
    nextState,
    ...extra,
  });
}

test('Revision-6 route bootstrap is strict, provider-applied, and UNREGISTERED-only', () => {
  const target = routeBootstrap();
  assert.equal(target.profile, QUALIFICATION_ROUTE_BOOTSTRAP_PROFILE);
  assert.match(qualificationRouteBootstrapDigest(target), /^sha256:[0-9a-f]{64}$/);
  assert.equal(Object.hasOwn(target, 'routeCurrentTupleDigest'), false);
  assert.throws(() => routeBootstrap({ routePredecessorState: 'CURRENT' }), (error) => error?.code === 'qualification_route_bootstrap_predecessor_invalid');
  assert.throws(() => routeBootstrap({ activeTrafficPercentage: 99 }), (error) => error?.code === 'invalid_qualification_identity');
  assert.throws(() => routeBootstrap({ routeCurrentTupleDigest: digest('0') }), (error) => error?.code === 'unexpected_keys');
});

test('Revision-6 operation/target matrix rejects provider/bootstrap/final substitution', () => {
  assert.equal(assertQualificationTargetForOperation({ targetKind: QUALIFICATION_TARGET_KIND_PROVIDER_DEPLOYMENT_INTENT, intendedOperation: QUALIFICATION_PROVIDER_DEPLOY_OPERATION }), QUALIFICATION_TARGET_KIND_PROVIDER_DEPLOYMENT_INTENT);
  assert.equal(assertQualificationTargetForOperation({ targetKind: QUALIFICATION_TARGET_KIND_ROUTE_BOOTSTRAP, intendedOperation: QUALIFICATION_ROUTE_BOOTSTRAP_OPERATION }), QUALIFICATION_TARGET_KIND_ROUTE_BOOTSTRAP);
  assert.equal(assertQualificationTargetForOperation({ targetKind: QUALIFICATION_TARGET_KIND_ADMITTED_DEPLOYMENT, intendedOperation: 'begin_credential_rotation' }), QUALIFICATION_TARGET_KIND_ADMITTED_DEPLOYMENT);
  assert.throws(() => assertQualificationTargetForOperation({ targetKind: QUALIFICATION_TARGET_KIND_ROUTE_BOOTSTRAP, intendedOperation: QUALIFICATION_PROVIDER_DEPLOY_OPERATION }), (error) => error?.code === 'qualification_target_kind_operation_mismatch');
  assert.throws(() => assertQualificationTargetForOperation({ targetKind: QUALIFICATION_TARGET_KIND_PROVIDER_DEPLOYMENT_INTENT, intendedOperation: QUALIFICATION_ROUTE_BOOTSTRAP_OPERATION }), (error) => error?.code === 'qualification_target_kind_operation_mismatch');
  assert.throws(() => assertQualificationTargetForOperation({ targetKind: QUALIFICATION_TARGET_KIND_ROUTE_BOOTSTRAP, intendedOperation: 'begin_credential_rotation' }), (error) => error?.code === 'qualification_target_kind_operation_mismatch');
  assert.equal(assertQualificationRouteBootstrapSuboperation('initial_activate_installable_agent'), 'initial_activate_installable_agent');
  assert.throws(() => assertQualificationRouteBootstrapSuboperation('begin_credential_rotation'), (error) => error?.code === 'qualification_route_bootstrap_operation_forbidden');
});

test('Revision-6 v3 journal stores route bootstrap with run-v3 and preserves operation-level terminality without creating final admission', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdev-d0039-r6-v3-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const journal = new FileQualificationJournalV3(root);
  let state = await journal.createGenesis({ genesisEvidenceDigest: GENESIS });
  assert.equal(state.profile, QUALIFICATION_STORE_PROFILE);
  assert.equal(state.schemaVersion, 3);
  state = await journal.acquireMutationController({ controllerIdentityDigest: CONTROLLER, expectedStoreRevision: state.revision });
  state = await journal.prepareRun({
    expectedStoreRevision: state.revision,
    qualificationRunId: 'route-bootstrap-run',
    runGeneration: 1,
    controllerIdentityDigest: CONTROLLER,
    targetKind: QUALIFICATION_TARGET_KIND_ROUTE_BOOTSTRAP,
    target: routeBootstrap(),
    stableMutationIdentityDigest: digest('0'),
    intendedOperation: QUALIFICATION_ROUTE_BOOTSTRAP_OPERATION,
    authoritativeRereadDigest: REREAD,
    claims: mutationClaims(),
  });
  assert.equal(state.runs['route-bootstrap-run:1'].profile, QUALIFICATION_RUN_PROFILE);
  state = await transitionV3(journal, 'route-bootstrap-run', 'DISPATCHED');
  state = await transitionV3(journal, 'route-bootstrap-run', 'RECONCILING', { reconciliationOutcome: 'ADMITTED_IN_PROGRESS' });
  state = await transitionV3(journal, 'route-bootstrap-run', 'TERMINAL_APPLIED', { reconciliationOutcome: 'POSITIVE_APPLIED' });
  assert.equal(state.runs['route-bootstrap-run:1'].targetKind, QUALIFICATION_TARGET_KIND_ROUTE_BOOTSTRAP);
  assert.equal(state.runs['route-bootstrap-run:1'].state, 'TERMINAL_APPLIED');
  assert.equal(state.runs['route-bootstrap-run:1'].target.profile, QUALIFICATION_ROUTE_BOOTSTRAP_PROFILE);
});

test('Revision-6 migration blocks live v2 state and preserves quiescent v2 replay/high-water fences', async (t) => {
  const blockedRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tdev-d0039-r6-v2-blocked-'));
  t.after(() => fs.rm(blockedRoot, { recursive: true, force: true }));
  const v2Blocked = new FileQualificationJournalV2(blockedRoot);
  let blocked = await v2Blocked.createGenesis({ genesisEvidenceDigest: GENESIS });
  blocked = await v2Blocked.acquireMutationController({ controllerIdentityDigest: CONTROLLER, expectedStoreRevision: blocked.revision });
  blocked = await v2Blocked.prepareRun({
    expectedStoreRevision: blocked.revision,
    qualificationRunId: 'live-v2',
    runGeneration: 1,
    controllerIdentityDigest: CONTROLLER,
    targetKind: QUALIFICATION_TARGET_KIND_PROVIDER_DEPLOYMENT_INTENT,
    target: deploymentIntent(),
    stableMutationIdentityDigest: digest('4'),
    intendedOperation: QUALIFICATION_PROVIDER_DEPLOY_OPERATION,
    authoritativeRereadDigest: REREAD,
    claims: mutationClaims('cloudflare_worker', 'account-one:tdev-d0039-r6-qualification'),
  });
  const v3Blocked = new FileQualificationJournalV3(blockedRoot);
  await assert.rejects(v3Blocked.read(), (error) => error?.code === 'qualification_store_migration_required');
  await assert.rejects(v3Blocked.migrateQuiescentV2({ expectedStoreRevision: blocked.revision }), (error) => error?.code === 'qualification_store_migration_blocked');

  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdev-d0039-r6-v2-clean-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const v2 = new FileQualificationJournalV2(root);
  let state = await v2.createGenesis({ genesisEvidenceDigest: GENESIS });
  state = await v2.acquireMutationController({ controllerIdentityDigest: CONTROLLER, expectedStoreRevision: state.revision });
  state = await v2.prepareRun({
    expectedStoreRevision: state.revision,
    qualificationRunId: 'old-provider-run',
    runGeneration: 1,
    controllerIdentityDigest: CONTROLLER,
    targetKind: QUALIFICATION_TARGET_KIND_PROVIDER_DEPLOYMENT_INTENT,
    target: deploymentIntent(),
    stableMutationIdentityDigest: digest('5'),
    intendedOperation: QUALIFICATION_PROVIDER_DEPLOY_OPERATION,
    authoritativeRereadDigest: REREAD,
    claims: mutationClaims('cloudflare_worker', 'account-one:tdev-d0039-r6-qualification'),
  });
  state = await transitionV2(v2, 'old-provider-run', 'DISPATCHED');
  state = await transitionV2(v2, 'old-provider-run', 'RECONCILING', { reconciliationOutcome: 'STILL_AMBIGUOUS' });
  state = await transitionV2(v2, 'old-provider-run', 'TERMINAL_APPLIED', { reconciliationOutcome: 'POSITIVE_APPLIED' });
  state = await transitionV2(v2, 'old-provider-run', 'CLEANUP_PENDING');
  state = await transitionV2(v2, 'old-provider-run', 'CLEAN', { cleanupEvidenceDigest: digest('6') });
  state = await v2.releaseMutationController({ controllerIdentityDigest: CONTROLLER, expectedStoreRevision: state.revision });
  const old = await v2.read();
  assert.equal(Object.keys(old.runs).length, 0);
  assert.equal(Object.keys(old.claims).length, 0);
  assert.equal(old.mutationController, null);

  const v3 = new FileQualificationJournalV3(root);
  await assert.rejects(v3.read(), (error) => error?.code === 'qualification_store_migration_required');
  const migrated = await v3.migrateQuiescentV2({ expectedStoreRevision: old.revision });
  assert.equal(LEGACY_QUALIFICATION_STORE_PROFILE, 'tdev.installable-agent-qualification-store.v2');
  assert.equal(migrated.profile, QUALIFICATION_STORE_PROFILE);
  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migrated.genesisEvidenceDigest, old.genesisEvidenceDigest);
  assert.equal(migrated.controllerHighWater, old.controllerHighWater);
  assert.deepEqual(migrated.claimHighWater, old.claimHighWater);
  assert.deepEqual(migrated.tombstones, old.tombstones);
  assert.deepEqual(await v3.read(), migrated);
});

test('Revision-6 stale admission helper rejects identity-changing Q7-Q9 mutations', () => {
  const admitted = finalTarget();
  assert.equal(assertQualificationAdmissionCurrent({ admittedDeployment: admitted, observedDeployment: { ...admitted } }).digest, qualificationDeploymentIdentityDigest(admitted));
  assert.throws(
    () => assertQualificationAdmissionCurrent({ admittedDeployment: admitted, observedDeployment: finalTarget({ routeGeneration: 8, routeCurrentTupleDigest: digest('8') }) }),
    (error) => error?.code === 'qualification_admission_stale',
  );
});

test('Revision-6 Q10 compatibility rejects divergent sibling as canonical current evidence', () => {
  const canonical = finalTarget();
  const canonicalDigest = qualificationDeploymentIdentityDigest(canonical);
  const siblingDigest = qualificationDeploymentIdentityDigest(finalTarget({ routeGeneration: 8, routeCurrentTupleDigest: digest('8') }));
  const compatible = assertQualificationCompositionCompatible({
    canonicalDeployment: canonical,
    evidenceBindings: [
      { deploymentIdentityDigest: canonicalDigest, scenarioOnly: false },
      { deploymentIdentityDigest: siblingDigest, scenarioOnly: true },
    ],
  });
  assert.equal(compatible.canonicalDeploymentIdentityDigest, canonicalDigest);
  assert.throws(
    () => assertQualificationCompositionCompatible({ canonicalDeployment: canonical, evidenceBindings: [{ deploymentIdentityDigest: siblingDigest, scenarioOnly: false }] }),
    (error) => error?.code === 'qualification_composition_incompatible',
  );
});

test('Revision-6 v3 store remains canonical JSON', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdev-d0039-r6-canonical-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const journal = new FileQualificationJournalV3(root);
  const state = await journal.createGenesis({ genesisEvidenceDigest: GENESIS });
  assert.equal(await fs.readFile(path.join(root, 'state.json'), 'utf8'), `${canonicalJson(state)}\n`);
  assert.match(resourceClaimKey('agent_route', 'agent-one:7'), /^sha256:[0-9a-f]{64}$/);
});

import {
  INSTALLABLE_AGENT_QUALIFICATION_DAG,
  qualificationGateExecutionPolicy,
} from '../qualification/installable-agent-deployment-realization.mjs';
import { terminalizeAppliedR5ProviderRun } from '../qualification/installable-agent-qualification-r6-reconciliation.mjs';

test('Revision-6 gate policy exposes DAG/invalidation semantics without making Q numbers a serial scheduler', () => {
  assert.equal(INSTALLABLE_AGENT_QUALIFICATION_DAG.q3_physical_android_termux.terminalEvidenceRequiresAdmittedDeployment, true);
  assert.equal(INSTALLABLE_AGENT_QUALIFICATION_DAG.q3_physical_android_termux.preAdmissionPhase, 'isolated_physical_prequalification');
  assert.equal(INSTALLABLE_AGENT_QUALIFICATION_DAG.q4_fresh_bootstrap.terminalEvidenceRequiresAdmittedDeployment, true);
  assert.equal(INSTALLABLE_AGENT_QUALIFICATION_DAG.q4_fresh_bootstrap.preAdmissionPhase, 'isolated_fresh_bootstrap_prequalification');
  assert.equal(INSTALLABLE_AGENT_QUALIFICATION_DAG.q5_live_provider_iam.preAdmissionPhase, 'provider_substrate');
  assert.equal(INSTALLABLE_AGENT_QUALIFICATION_DAG.q6_live_migration.preAdmissionPhase, 'fresh_route_bootstrap');
  assert.equal(INSTALLABLE_AGENT_QUALIFICATION_DAG.q7_management_loss_compromise.isolatedScenarioEligible, true);
  assert.equal(qualificationGateExecutionPolicy('q7_management_loss_compromise').requiresFreshReadmissionBeforeDependentMutation, true);
  assert.equal(qualificationGateExecutionPolicy('q8_release_lifecycle').invalidatesAdmission, true);
  assert.equal(qualificationGateExecutionPolicy('q9_rollback_provider_loss_retention').compositionRole, 'canonical_or_sibling_scenario');
  assert.equal(qualificationGateExecutionPolicy('q10_deployed_composition').compositionRole, 'latest_surviving_exact_lane');
});

function providerEffectObservation(overrides = {}) {
  const intent = deploymentIntent();
  return {
    profile: 'tdev.installable-agent-qualification-r5-provider-effect-observation.v1',
    sourceSha: intent.sourceSha,
    artifactDigest: intent.artifactDigest,
    artifactManifestDigest: intent.artifactManifestDigest,
    accountId: intent.accountId,
    serviceName: intent.serviceName,
    deployment: intent.deployment,
    environment: intent.environment,
    deploymentEpoch: intent.deploymentEpoch,
    qualificationEndpointOrigin: intent.qualificationEndpointOrigin,
    ingressKind: intent.ingressKind,
    workersDevAccountSubdomain: intent.workersDevAccountSubdomain,
    workersDevHostname: intent.workersDevHostname,
    workersDevEnabled: intent.workersDevEnabled,
    workersDevPreviewsEnabled: intent.workersDevPreviewsEnabled,
    workerScript: intent.workerScript,
    namespaceId: intent.namespaceId,
    namespace: intent.namespace,
    className: intent.className,
    jurisdiction: intent.jurisdiction,
    deploymentBindingDigest: intent.deploymentBindingDigest,
    authoritativeRereadDigest: REREAD,
    activeVersionId: 'provider-generated-v5',
    activeDeploymentId: 'provider-generated-deployment-v5',
    activeTrafficPercentage: 100,
    ...overrides,
  };
}

test('Revision-6 R5 provider reconciliation terminalizes the exact applied operation without replay or Q5 closure', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdev-d0039-r6-r5-reconcile-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const journal = new FileQualificationJournalV2(root);
  let state = await journal.createGenesis({ genesisEvidenceDigest: GENESIS });
  state = await journal.acquireMutationController({ controllerIdentityDigest: CONTROLLER, expectedStoreRevision: state.revision });
  state = await journal.prepareRun({
    expectedStoreRevision: state.revision,
    qualificationRunId: 'r5-provider',
    runGeneration: 1,
    controllerIdentityDigest: CONTROLLER,
    targetKind: QUALIFICATION_TARGET_KIND_PROVIDER_DEPLOYMENT_INTENT,
    target: deploymentIntent(),
    stableMutationIdentityDigest: digest('7'),
    intendedOperation: QUALIFICATION_PROVIDER_DEPLOY_OPERATION,
    authoritativeRereadDigest: REREAD,
    claims: mutationClaims('cloudflare_worker', 'account-one:tdev-d0039-r6-qualification'),
  });
  state = await transitionV2(journal, 'r5-provider', 'DISPATCHED');
  state = await transitionV2(journal, 'r5-provider', 'RECONCILING', { reconciliationOutcome: 'STILL_AMBIGUOUS' });
  const result = await terminalizeAppliedR5ProviderRun({
    journal,
    qualificationRunId: 'r5-provider',
    runGeneration: 1,
    controllerIdentityDigest: CONTROLLER,
    authoritativeProviderEffect: providerEffectObservation(),
    cleanupEvidenceDigest: digest('9'),
  });
  assert.equal(result.providerEffectTerminalized, true);
  assert.equal(result.providerReplayAllowed, false);
  assert.equal(result.qualificationGateClosed, false);
  const finalState = await journal.read();
  assert.equal(Object.keys(finalState.runs).length, 0);
  assert.equal(Object.keys(finalState.claims).length, 0);
  assert.equal(finalState.mutationController, null);
});

test('Revision-6 R5 provider reconciliation rejects mismatched authoritative observation without mutating RECONCILING state', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdev-d0039-r6-r5-reconcile-mismatch-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const journal = new FileQualificationJournalV2(root);
  let state = await journal.createGenesis({ genesisEvidenceDigest: GENESIS });
  state = await journal.acquireMutationController({ controllerIdentityDigest: CONTROLLER, expectedStoreRevision: state.revision });
  state = await journal.prepareRun({
    expectedStoreRevision: state.revision,
    qualificationRunId: 'r5-provider',
    runGeneration: 1,
    controllerIdentityDigest: CONTROLLER,
    targetKind: QUALIFICATION_TARGET_KIND_PROVIDER_DEPLOYMENT_INTENT,
    target: deploymentIntent(),
    stableMutationIdentityDigest: digest('7'),
    intendedOperation: QUALIFICATION_PROVIDER_DEPLOY_OPERATION,
    authoritativeRereadDigest: REREAD,
    claims: mutationClaims('cloudflare_worker', 'account-one:tdev-d0039-r6-qualification'),
  });
  state = await transitionV2(journal, 'r5-provider', 'DISPATCHED');
  state = await transitionV2(journal, 'r5-provider', 'RECONCILING', { reconciliationOutcome: 'STILL_AMBIGUOUS' });
  const before = await journal.read();
  await assert.rejects(
    terminalizeAppliedR5ProviderRun({
      journal,
      qualificationRunId: 'r5-provider',
      runGeneration: 1,
      controllerIdentityDigest: CONTROLLER,
      authoritativeProviderEffect: providerEffectObservation({ sourceSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }),
      cleanupEvidenceDigest: digest('9'),
    }),
    (error) => error?.code === 'qualification_provider_effect_observation_mismatch',
  );
  assert.deepEqual(await journal.read(), before);
  await assert.rejects(
    terminalizeAppliedR5ProviderRun({
      journal,
      qualificationRunId: 'r5-provider',
      runGeneration: 1,
      controllerIdentityDigest: CONTROLLER,
      authoritativeProviderEffect: providerEffectObservation({ environment: 'unexpected-environment' }),
      cleanupEvidenceDigest: digest('9'),
    }),
    (error) => error?.code === 'qualification_provider_effect_observation_mismatch',
  );
  assert.deepEqual(await journal.read(), before);
  await assert.rejects(
    terminalizeAppliedR5ProviderRun({
      journal,
      qualificationRunId: 'r5-provider',
      runGeneration: 1,
      controllerIdentityDigest: CONTROLLER,
      authoritativeProviderEffect: providerEffectObservation({ ingressKind: 'custom_domain' }),
      cleanupEvidenceDigest: digest('9'),
    }),
    (error) => error?.code === 'invalid_qualification_provider_effect_observation',
  );
  assert.deepEqual(await journal.read(), before);
});

test('Revision-6 R5 provider reconciliation refuses pre-dispatch or multi-run scope before mutation', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdev-d0039-r6-r5-reconcile-deny-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const journal = new FileQualificationJournalV2(root);
  let state = await journal.createGenesis({ genesisEvidenceDigest: GENESIS });
  state = await journal.acquireMutationController({ controllerIdentityDigest: CONTROLLER, expectedStoreRevision: state.revision });
  state = await journal.prepareRun({
    expectedStoreRevision: state.revision,
    qualificationRunId: 'r5-provider',
    runGeneration: 1,
    controllerIdentityDigest: CONTROLLER,
    targetKind: QUALIFICATION_TARGET_KIND_PROVIDER_DEPLOYMENT_INTENT,
    target: deploymentIntent(),
    stableMutationIdentityDigest: digest('7'),
    intendedOperation: QUALIFICATION_PROVIDER_DEPLOY_OPERATION,
    authoritativeRereadDigest: REREAD,
    claims: mutationClaims('cloudflare_worker', 'account-one:tdev-d0039-r6-qualification'),
  });
  await assert.rejects(
    terminalizeAppliedR5ProviderRun({ journal, qualificationRunId: 'r5-provider', runGeneration: 1, controllerIdentityDigest: CONTROLLER, authoritativeProviderEffect: providerEffectObservation(), cleanupEvidenceDigest: digest('9') }),
    (error) => error?.code === 'qualification_reconciliation_state_invalid',
  );
  assert.equal((await journal.read()).runs['r5-provider:1'].state, 'PREPARED');
});
