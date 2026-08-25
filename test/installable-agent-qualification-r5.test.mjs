import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { canonicalJson } from '../src/canonical.mjs';
import {
  LEGACY_QUALIFICATION_STORE_PROFILE,
  QUALIFICATION_STORE_PROFILE,
  FileQualificationJournal,
  qualificationRunRecordDigest,
} from '../qualification/installable-agent-qualification-journal.mjs';
import {
  QUALIFICATION_DEPLOYMENT_INTENT_PROFILE,
  QUALIFICATION_DEPLOYMENT_PROFILE,
  QUALIFICATION_GLOBAL_MUTATION_RESOURCE,
  QUALIFICATION_GLOBAL_MUTATION_RESOURCE_TYPE,
  QUALIFICATION_RUN_PROFILE,
  QUALIFICATION_TARGET_KIND_ADMITTED_DEPLOYMENT,
  QUALIFICATION_TARGET_KIND_PROVIDER_DEPLOYMENT_INTENT,
  createQualificationDeploymentIntent,
  qualificationRunTargetDigest,
  resourceClaimKey,
} from '../qualification/installable-agent-qualification-r5.mjs';

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
    workerVersionId: 'worker-v5',
    accountId: 'account-one',
    serviceName: 'tdev-d0039-r5-qualification',
    deployment: 'qualification',
    environment: 'nonproduction',
    deploymentEpoch: 'epoch-r5',
    stateChangingTrafficPercentage: 100,
    qualificationEndpointOrigin: 'https://tdev-d0039-r5-qualification.humtr.workers.dev',
    ingressKind: 'workers_dev',
    workersDevAccountSubdomain: 'humtr',
    workersDevHostname: 'tdev-d0039-r5-qualification.humtr.workers.dev',
    workersDevEnabled: true,
    workersDevPreviewsEnabled: false,
    workerScript: 'tdev-d0039-r5-qualification',
    namespaceId: 'namespace-one',
    namespace: 'tdev-d0039-r5-qualification_AgentDeliveryRuntimeDO',
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
    serviceName: 'tdev-d0039-r5-qualification',
    deployment: 'qualification',
    environment: 'nonproduction',
    deploymentEpoch: 'epoch-r5',
    qualificationEndpointOrigin: 'https://tdev-d0039-r5-qualification.humtr.workers.dev',
    ingressKind: 'workers_dev',
    workersDevAccountSubdomain: 'humtr',
    workersDevHostname: 'tdev-d0039-r5-qualification.humtr.workers.dev',
    workersDevEnabled: true,
    workersDevPreviewsEnabled: false,
    workerScript: 'tdev-d0039-r5-qualification',
    namespaceId: 'namespace-one',
    namespace: 'tdev-d0039-r5-qualification_AgentDeliveryRuntimeDO',
    className: 'AgentDeliveryRuntimeDO',
    jurisdiction: 'global',
    deploymentBindingDigest: digest('5'),
    predecessorProviderStateDigest: digest('6'),
    authoritativeRereadDigest: REREAD,
    ...overrides,
  });
}

function mutationClaims(provider = 'account-one:tdev-d0039-r5-qualification') {
  return [
    { resourceType: QUALIFICATION_GLOBAL_MUTATION_RESOURCE_TYPE, resourceIdentity: QUALIFICATION_GLOBAL_MUTATION_RESOURCE, mode: 'exclusive_mutation' },
    { resourceType: 'cloudflare_worker', resourceIdentity: provider, mode: 'exclusive_mutation' },
  ];
}

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdev-d0039-r5-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const journal = new FileQualificationJournal(root);
  await journal.createGenesis({ genesisEvidenceDigest: GENESIS });
  return { root, journal };
}

async function transition(journal, runId, nextState, extra = {}) {
  const state = await journal.read();
  const run = state.runs[`${runId}:1`];
  return journal.transitionRun({
    expectedStoreRevision: state.revision,
    qualificationRunId: runId,
    runGeneration: 1,
    controllerIdentityDigest: CONTROLLER,
    expectedRunRecordDigest: qualificationRunRecordDigest(run),
    nextState,
    ...extra,
  });
}

test('Revision-5 deployment intent excludes provider-generated V/R and rejects unknown fields', () => {
  const intent = deploymentIntent();
  assert.equal(intent.profile, QUALIFICATION_DEPLOYMENT_INTENT_PROFILE);
  assert.equal(Object.hasOwn(intent, 'workerVersionId'), false);
  assert.equal(Object.hasOwn(intent, 'durableObjectId'), false);
  assert.match(qualificationRunTargetDigest(QUALIFICATION_TARGET_KIND_PROVIDER_DEPLOYMENT_INTENT, intent), /^sha256:[0-9a-f]{64}$/);
  assert.throws(
    () => deploymentIntent({ workerVersionId: 'invented-before-provider' }),
    (error) => error?.code === 'unexpected_keys',
  );
  assert.throws(
    () => deploymentIntent({ profile: 'tdev.installable-agent-qualification-deployment-intent.v999' }),
    (error) => error?.code === 'invalid_qualification_identity',
  );
});

test('Revision-5 journal accepts final deployment-v2 target and provider intent only for their exact operation classes', async (t) => {
  const { journal } = await fixture(t);
  let state = await journal.read();
  assert.equal(state.profile, QUALIFICATION_STORE_PROFILE);
  assert.equal(state.schemaVersion, 2);
  state = await journal.acquireMutationController({ controllerIdentityDigest: CONTROLLER, expectedStoreRevision: state.revision });

  state = await journal.prepareRun({
    expectedStoreRevision: state.revision,
    qualificationRunId: 'provider-deploy',
    runGeneration: 1,
    controllerIdentityDigest: CONTROLLER,
    targetKind: QUALIFICATION_TARGET_KIND_PROVIDER_DEPLOYMENT_INTENT,
    target: deploymentIntent(),
    stableMutationIdentityDigest: digest('7'),
    intendedOperation: 'provider_deploy',
    authoritativeRereadDigest: REREAD,
    claims: mutationClaims(),
  });
  assert.equal(state.runs['provider-deploy:1'].profile, QUALIFICATION_RUN_PROFILE);
  assert.equal(state.runs['provider-deploy:1'].targetKind, QUALIFICATION_TARGET_KIND_PROVIDER_DEPLOYMENT_INTENT);

  await assert.rejects(
    journal.prepareRun({
      expectedStoreRevision: state.revision,
      qualificationRunId: 'bad-final-provider',
      runGeneration: 1,
      controllerIdentityDigest: CONTROLLER,
      targetKind: QUALIFICATION_TARGET_KIND_ADMITTED_DEPLOYMENT,
      target: finalTarget(),
      stableMutationIdentityDigest: digest('8'),
      intendedOperation: 'provider_deploy',
      authoritativeRereadDigest: REREAD,
      claims: mutationClaims('account-one:other-worker'),
    }),
    (error) => error?.code === 'qualification_target_kind_operation_mismatch',
  );
  await assert.rejects(
    journal.prepareRun({
      expectedStoreRevision: state.revision,
      qualificationRunId: 'bad-intent-product',
      runGeneration: 1,
      controllerIdentityDigest: CONTROLLER,
      targetKind: QUALIFICATION_TARGET_KIND_PROVIDER_DEPLOYMENT_INTENT,
      target: deploymentIntent(),
      stableMutationIdentityDigest: digest('9'),
      intendedOperation: 'register_installable_agent',
      authoritativeRereadDigest: REREAD,
      claims: mutationClaims('agent-one:7'),
    }),
    (error) => error?.code === 'qualification_target_kind_operation_mismatch',
  );
});

test('ambiguous provider deployment retains claims and blocks duplicate provider effects', async (t) => {
  const { journal } = await fixture(t);
  let state = await journal.read();
  state = await journal.acquireMutationController({ controllerIdentityDigest: CONTROLLER, expectedStoreRevision: state.revision });
  state = await journal.prepareRun({
    expectedStoreRevision: state.revision,
    qualificationRunId: 'provider-ambiguous',
    runGeneration: 1,
    controllerIdentityDigest: CONTROLLER,
    targetKind: QUALIFICATION_TARGET_KIND_PROVIDER_DEPLOYMENT_INTENT,
    target: deploymentIntent(),
    stableMutationIdentityDigest: digest('d'),
    intendedOperation: 'provider_deploy',
    authoritativeRereadDigest: REREAD,
    claims: mutationClaims(),
  });
  state = await transition(journal, 'provider-ambiguous', 'DISPATCHED');
  state = await transition(journal, 'provider-ambiguous', 'RECONCILING', { reconciliationOutcome: 'STILL_AMBIGUOUS' });
  assert.equal(state.runs['provider-ambiguous:1'].state, 'RECONCILING');
  assert.equal(Object.keys(state.claims).length, 2);
  await assert.rejects(
    journal.prepareRun({
      expectedStoreRevision: state.revision,
      qualificationRunId: 'provider-duplicate',
      runGeneration: 1,
      controllerIdentityDigest: CONTROLLER,
      targetKind: QUALIFICATION_TARGET_KIND_PROVIDER_DEPLOYMENT_INTENT,
      target: deploymentIntent(),
      stableMutationIdentityDigest: digest('e'),
      intendedOperation: 'provider_deploy',
      authoritativeRereadDigest: REREAD,
      claims: mutationClaims(),
    }),
    (error) => error?.code === 'qualification_claim_conflict',
  );
});

test('Revision-5 explicit migration blocks live v1 obligations and preserves quiescent replay fences', async (t) => {
  const blockedRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tdev-d0039-r5-v1-blocked-'));
  t.after(() => fs.rm(blockedRoot, { recursive: true, force: true }));
  const blocked = new FileQualificationJournal(blockedRoot);
  const blockedLegacy = {
    profile: LEGACY_QUALIFICATION_STORE_PROFILE,
    schemaVersion: 1,
    genesisEvidenceDigest: GENESIS,
    revision: 4,
    journalSequence: 5,
    mutationController: null,
    controllerHighWater: 3,
    runs: { 'legacy-run:1': {} },
    claims: {},
    claimHighWater: {},
    tombstones: {},
  };
  await fs.mkdir(blockedRoot, { recursive: true });
  await fs.writeFile(path.join(blockedRoot, 'state.json'), `${canonicalJson(blockedLegacy)}\n`);
  await assert.rejects(blocked.read(), (error) => error?.code === 'qualification_store_migration_required');
  await assert.rejects(blocked.migrateQuiescentV1({ expectedStoreRevision: 4 }), (error) => error?.code === 'qualification_store_migration_blocked');

  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdev-d0039-r5-v1-clean-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const journal = new FileQualificationJournal(root);
  const resourceKey = resourceClaimKey('cloudflare_worker', 'account-one:tdev-d0039-r5-qualification');
  const legacy = {
    profile: LEGACY_QUALIFICATION_STORE_PROFILE,
    schemaVersion: 1,
    genesisEvidenceDigest: GENESIS,
    revision: 7,
    journalSequence: 9,
    mutationController: null,
    controllerHighWater: 4,
    runs: {},
    claims: {},
    claimHighWater: { [resourceKey]: 3 },
    tombstones: {
      'old-run:1': {
        profile: 'tdev.installable-agent-qualification-tombstone.v1',
        qualificationRunId: 'old-run',
        runGeneration: 1,
        targetDigest: digest('f'),
        stableMutationIdentityDigest: digest('0'),
        terminalOutcome: 'TERMINAL_APPLIED',
        finalRecordDigest: digest('1'),
        journalSequenceHighWater: 8,
        claimGenerations: [{ resourceKey, claimGeneration: 3 }],
      },
    },
  };
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, 'state.json'), `${canonicalJson(legacy)}\n`);
  const migrated = await journal.migrateQuiescentV1({ expectedStoreRevision: 7 });
  assert.equal(migrated.profile, QUALIFICATION_STORE_PROFILE);
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.revision, 8);
  assert.equal(migrated.journalSequence, 10);
  assert.equal(migrated.genesisEvidenceDigest, legacy.genesisEvidenceDigest);
  assert.equal(migrated.controllerHighWater, legacy.controllerHighWater);
  assert.deepEqual(migrated.claimHighWater, legacy.claimHighWater);
  assert.deepEqual(migrated.tombstones, legacy.tombstones);
  assert.deepEqual(await journal.read(), migrated);
});
