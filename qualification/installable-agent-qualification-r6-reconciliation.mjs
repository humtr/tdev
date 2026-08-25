import {
  ContractError,
  assertDigest,
  assertIdentifier,
  assertRecordShape,
  assertSafeInteger,
  publicJsonClone,
  typedDigest,
} from '../src/canonical.mjs';
import {
  QUALIFICATION_PROVIDER_DEPLOY_OPERATION,
  QUALIFICATION_RUN_PROFILE,
  QUALIFICATION_TARGET_KIND_PROVIDER_DEPLOYMENT_INTENT,
} from './installable-agent-qualification-r5.mjs';
import { qualificationRunRecordDigest } from './installable-agent-qualification-journal.mjs';

export const R5_PROVIDER_EFFECT_OBSERVATION_PROFILE = 'tdev.installable-agent-qualification-r5-provider-effect-observation.v1';
export const R5_PROVIDER_EFFECT_RECONCILIATION_PROFILE = 'tdev.installable-agent-qualification-r5-provider-effect-reconciliation.v1';

function exactRun(state, qualificationRunId, runGeneration) {
  const key = `${qualificationRunId}:${runGeneration}`;
  const run = state.runs?.[key];
  if (run === undefined) throw new ContractError('qualification_run_missing', 'Exact R5 provider run is not live');
  if (run.profile !== QUALIFICATION_RUN_PROFILE || run.targetKind !== QUALIFICATION_TARGET_KIND_PROVIDER_DEPLOYMENT_INTENT || run.intendedOperation !== QUALIFICATION_PROVIDER_DEPLOY_OPERATION) {
    throw new ContractError('qualification_reconciliation_scope_invalid', 'R5 provider reconciliation accepts only the exact provider-deploy intent run');
  }
  return run;
}

function assertSoleLiveMutationScope(state, run, qualificationRunId, runGeneration, controllerIdentityDigest) {
  if (run.controllerIdentityDigest !== controllerIdentityDigest || state.mutationController?.controllerIdentityDigest !== controllerIdentityDigest) {
    throw new ContractError('qualification_controller_conflict', 'Exact R5 provider reconciliation controller does not own the run');
  }
  const keys = Object.keys(state.runs ?? {});
  if (keys.length !== 1 || keys[0] !== `${qualificationRunId}:${runGeneration}`) {
    throw new ContractError('qualification_reconciliation_scope_ambiguous', 'R5 provider cleanup requires the exact provider run to be the sole live qualification run');
  }
  for (const bucket of Object.values(state.claims ?? {})) {
    if (!Array.isArray(bucket?.holders) || bucket.holders.some((holder) => holder.qualificationRunId !== qualificationRunId || holder.runGeneration !== runGeneration || holder.controllerIdentityDigest !== controllerIdentityDigest)) {
      throw new ContractError('qualification_reconciliation_scope_ambiguous', 'R5 provider cleanup found a claim outside the exact provider run scope');
    }
  }
}

function boundedString(value, label, max = 512) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || value.includes('\0')) {
    throw new ContractError('invalid_qualification_provider_effect_observation', `${label} is invalid`);
  }
  return value;
}

function assertSha40(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/.test(value)) {
    throw new ContractError('invalid_qualification_provider_effect_observation', `${label} must be a lowercase 40-hex Git SHA`);
  }
  return value;
}

export function normalizeR5ProviderEffectObservation(value) {
  assertRecordShape(value, [
    'profile', 'sourceSha', 'artifactDigest', 'artifactManifestDigest', 'accountId', 'serviceName', 'deployment', 'environment', 'deploymentEpoch',
    'qualificationEndpointOrigin', 'ingressKind', 'workersDevAccountSubdomain', 'workersDevHostname', 'workersDevEnabled',
    'workersDevPreviewsEnabled', 'workerScript', 'namespaceId', 'namespace', 'className', 'jurisdiction',
    'deploymentBindingDigest', 'authoritativeRereadDigest', 'activeVersionId', 'activeDeploymentId',
    'activeTrafficPercentage',
  ], [], 'R5 provider effect observation');
  if (value.profile !== R5_PROVIDER_EFFECT_OBSERVATION_PROFILE) {
    throw new ContractError('invalid_qualification_provider_effect_observation', 'Unsupported R5 provider effect observation profile');
  }
  assertSha40(value.sourceSha, 'sourceSha');
  assertDigest(value.artifactDigest, 'artifactDigest');
  assertDigest(value.artifactManifestDigest, 'artifactManifestDigest');
  boundedString(value.accountId, 'accountId');
  boundedString(value.serviceName, 'serviceName');
  boundedString(value.deployment, 'deployment');
  boundedString(value.environment, 'environment');
  boundedString(value.deploymentEpoch, 'deploymentEpoch');
  boundedString(value.qualificationEndpointOrigin, 'qualificationEndpointOrigin', 2048);
  if (value.ingressKind !== 'workers_dev') {
    throw new ContractError('invalid_qualification_provider_effect_observation', 'R5 provider effect observation requires workers_dev ingress');
  }
  boundedString(value.workersDevAccountSubdomain, 'workersDevAccountSubdomain');
  boundedString(value.workersDevHostname, 'workersDevHostname');
  if (value.workersDevEnabled !== true || value.workersDevPreviewsEnabled !== false) {
    throw new ContractError('invalid_qualification_provider_effect_observation', 'R5 provider effect observation requires enabled workers.dev and disabled previews');
  }
  boundedString(value.workerScript, 'workerScript');
  boundedString(value.namespaceId, 'namespaceId');
  boundedString(value.namespace, 'namespace');
  boundedString(value.className, 'className');
  boundedString(value.jurisdiction, 'jurisdiction');
  assertDigest(value.deploymentBindingDigest, 'deploymentBindingDigest');
  assertDigest(value.authoritativeRereadDigest, 'authoritativeRereadDigest');
  boundedString(value.activeVersionId, 'activeVersionId');
  boundedString(value.activeDeploymentId, 'activeDeploymentId');
  if (value.activeTrafficPercentage !== 100) {
    throw new ContractError('invalid_qualification_provider_effect_observation', 'R5 provider effect observation requires exactly one 100-percent active writer');
  }
  return Object.freeze(publicJsonClone(value));
}

function assertObservationMatchesIntent(run, observation) {
  const target = run.target;
  const comparisons = [
    ['sourceSha', target.sourceSha],
    ['artifactDigest', target.artifactDigest],
    ['artifactManifestDigest', target.artifactManifestDigest],
    ['accountId', target.accountId],
    ['serviceName', target.serviceName],
    ['deployment', target.deployment],
    ['environment', target.environment],
    ['deploymentEpoch', target.deploymentEpoch],
    ['qualificationEndpointOrigin', target.qualificationEndpointOrigin],
    ['ingressKind', target.ingressKind],
    ['workersDevAccountSubdomain', target.workersDevAccountSubdomain],
    ['workersDevHostname', target.workersDevHostname],
    ['workersDevEnabled', target.workersDevEnabled],
    ['workersDevPreviewsEnabled', target.workersDevPreviewsEnabled],
    ['workerScript', target.workerScript],
    ['namespaceId', target.namespaceId],
    ['namespace', target.namespace],
    ['className', target.className],
    ['jurisdiction', target.jurisdiction],
    ['deploymentBindingDigest', target.deploymentBindingDigest],
    ['authoritativeRereadDigest', run.authoritativeRereadDigest],
  ];
  for (const [field, expected] of comparisons) {
    if (observation[field] !== expected) {
      throw new ContractError('qualification_provider_effect_observation_mismatch', 'Authoritative provider effect observation does not match the exact stored R5 deployment intent', {
        field,
        expected,
        observed: observation[field],
      });
    }
  }
  return observation;
}

export async function terminalizeAppliedR5ProviderRun({
  journal,
  qualificationRunId,
  runGeneration,
  controllerIdentityDigest,
  authoritativeProviderEffect,
  cleanupEvidenceDigest,
}) {
  if (journal === null || typeof journal !== 'object' || typeof journal.read !== 'function' || typeof journal.transitionRun !== 'function' || typeof journal.releaseMutationController !== 'function') {
    throw new ContractError('invalid_qualification_journal', 'R5 provider reconciliation requires a v2-capable journal');
  }
  assertIdentifier(qualificationRunId, 'qualificationRunId');
  assertSafeInteger(runGeneration, 'runGeneration', { min: 1 });
  assertDigest(controllerIdentityDigest, 'controllerIdentityDigest');
  assertDigest(cleanupEvidenceDigest, 'cleanupEvidenceDigest');

  let state = await journal.read();
  let run = exactRun(state, qualificationRunId, runGeneration);
  assertSoleLiveMutationScope(state, run, qualificationRunId, runGeneration, controllerIdentityDigest);
  if (run.state !== 'RECONCILING') {
    throw new ContractError('qualification_reconciliation_state_invalid', 'R5 provider effect may terminalize only from RECONCILING after authoritative reread');
  }
  const observation = assertObservationMatchesIntent(run, normalizeR5ProviderEffectObservation(authoritativeProviderEffect));
  const authoritativeProviderEffectEvidenceDigest = typedDigest(R5_PROVIDER_EFFECT_OBSERVATION_PROFILE, observation);
  const reconciliationEvidenceDigest = typedDigest(R5_PROVIDER_EFFECT_RECONCILIATION_PROFILE, {
    qualificationRunId,
    runGeneration,
    targetDigest: run.targetDigest,
    stableMutationIdentityDigest: run.stableMutationIdentityDigest,
    authoritativeRereadDigest: run.authoritativeRereadDigest,
    authoritativeProviderEffectEvidenceDigest,
    activeVersionId: observation.activeVersionId,
    activeDeploymentId: observation.activeDeploymentId,
    providerReplayAllowed: false,
    qualificationGateClosed: false,
  });

  state = await journal.transitionRun({
    expectedStoreRevision: state.revision,
    qualificationRunId,
    runGeneration,
    controllerIdentityDigest,
    expectedRunRecordDigest: qualificationRunRecordDigest(run),
    nextState: 'TERMINAL_APPLIED',
    reconciliationOutcome: 'POSITIVE_APPLIED',
  });
  run = exactRun(state, qualificationRunId, runGeneration);
  state = await journal.transitionRun({
    expectedStoreRevision: state.revision,
    qualificationRunId,
    runGeneration,
    controllerIdentityDigest,
    expectedRunRecordDigest: qualificationRunRecordDigest(run),
    nextState: 'CLEANUP_PENDING',
  });
  run = exactRun(state, qualificationRunId, runGeneration);
  state = await journal.transitionRun({
    expectedStoreRevision: state.revision,
    qualificationRunId,
    runGeneration,
    controllerIdentityDigest,
    expectedRunRecordDigest: qualificationRunRecordDigest(run),
    nextState: 'CLEAN',
    cleanupEvidenceDigest,
  });
  state = await journal.releaseMutationController({ controllerIdentityDigest, expectedStoreRevision: state.revision });
  if (Object.keys(state.runs).length !== 0 || Object.keys(state.claims).length !== 0 || state.mutationController !== null) {
    throw new ContractError('qualification_cleanup_unproven', 'R5 provider operation did not reach quiescent v2 coordination state');
  }
  return Object.freeze({
    profile: R5_PROVIDER_EFFECT_RECONCILIATION_PROFILE,
    qualificationRunId,
    runGeneration,
    targetDigest: run.targetDigest,
    stableMutationIdentityDigest: run.stableMutationIdentityDigest,
    authoritativeProviderEffect: observation,
    authoritativeProviderEffectEvidenceDigest,
    reconciliationEvidenceDigest,
    cleanupEvidenceDigest,
    finalStoreRevision: state.revision,
    providerEffectTerminalized: true,
    providerReplayAllowed: false,
    qualificationGateClosed: false,
    secretValues: 'excluded',
  });
}
