#!/usr/bin/env node
import { createPrivateKey, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { canonicalClone, canonicalJson, digest } from '../src/canonical.mjs';
import {
  computeInstallableAgentManagementIntentDigest,
  evidenceProofContext,
  installableAgentSecurityStateDigest,
  managementProofContext,
} from '../src/installable-agent-admission.mjs';
import {
  INSTALLABLE_AGENT_EVIDENCE_ATTESTATION_ENVELOPE_PROFILE,
  INSTALLABLE_AGENT_EVIDENCE_ATTESTATION_SIGNATURE_DOMAIN,
  INSTALLABLE_AGENT_MANAGEMENT_ENVELOPE_PROFILE,
  encodeBase64Url,
  installableAgentEvidenceAttestorKeyId,
  installableAgentManagementKeyId,
  signedRecordBytes,
} from '../src/installable-agent-security.mjs';
import { InstallableAgentPackageManager, verifyInstallableAgentRelease } from '../src/installable-agent-package.mjs';
import { TermuxInstallableAgentServiceController } from '../src/installable-agent-termux-service.mjs';
import { qualificationDeploymentIdentityDigest, qualificationRouteVerifierDigest } from './installable-agent-qualification-r4.mjs';

export const D0046_AGENT_ID = 'd0039-r12-custody-20260828-3631c5a4';
export const D0046_AGENT_ROUTE_GENERATION = 1;
export const D0046_AGENT_ORIGIN = 'https://tdev-d0020-qualification-clean-a.humtr.workers.dev';
export const D0046_AGENT_QUALIFICATION_URL = `${D0046_AGENT_ORIGIN}/qualification/d0020/v2`;
export const D0046_AGENT_RPC_PROFILE = 'tdev.installable-agent-qualification-rpc.v2';
export const D0046_AGENT_STATE_DIRECTORY = '/data/data/com.termux/files/home/.local/state/tdev-d0039-r12-agent/route-d0039-r12-custody-20260828-3631c5a4/state';
export const D0046_AGENT_INSTALLED_PACKAGE_ROOT = '/data/data/com.termux/files/home/.local/state/tdev-d0046-agent/package';
export const D0046_AGENT_RELEASES_ROOT = '/data/data/com.termux/files/home/.local/state/tdev-d0046-agent/releases';
export const D0046_AGENT_MANAGEMENT_CUSTODY = '/data/data/com.termux/files/home/.local/state/tdev-d0039-r12-management/route-d0039-r12-custody-20260828-3631c5a4';
export const D0046_AGENT_ATTESTOR_CUSTODY = '/data/data/com.termux/files/home/.local/state/tdev-d0040-attestor/v1';

const STABLE_RELEASE_FIELDS = Object.freeze([
  'schemaVersion', 'profile', 'target', 'stateSchemas', 'protocols', 'capabilityProfile', 'serviceHostProfile', 'configurationSchemaDigest',
  'developmentOperationOutputSchema', 'helperAbi', 'runtime', 'toolProfiles',
]);
const TERMINAL_DELIVERY_STATES = new Set(['completed', 'failed', 'cancelled', 'released', 'expired']);
const STOPPED_DRAIN_RESUME_PHASES = new Set(['evidence_positive_quiescence', 'evidence_package_verified']);
const EVIDENCE_READINESS_KEYS = Object.freeze({
  positive_quiescence: 'positiveQuiescence',
  package_verified: 'packageVerified',
  local_service_ready: 'localServiceReady',
});

function fail(code, message, details = undefined, options = undefined) {
  const error = new Error(message, options);
  error.code = code;
  if (details !== undefined) error.details = details;
  throw error;
}

function assertDigest(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) fail('d0046_agent_update_input_invalid', `${label} must be a sha256 digest`);
  return value;
}

function assertRecord(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('d0046_agent_update_input_invalid', `${label} must be a record`);
  return value;
}

function validatedDeploymentProbe(probe, label = 'deployment runtime probe') {
  const value = assertRecord(probe, label);
  const identity = assertRecord(value.deploymentIdentity, `${label}.deploymentIdentity`);
  assertDigest(identity.routeCurrentTupleDigest, `${label}.deploymentIdentity.routeCurrentTupleDigest`);
  assertDigest(value.deploymentIdentityDigest, `${label}.deploymentIdentityDigest`);
  const computed = qualificationDeploymentIdentityDigest(identity);
  if (computed !== value.deploymentIdentityDigest) {
    fail('d0046_agent_deployment_identity_digest_mismatch', 'Provider deployment probe digest does not match its normalized deployment identity');
  }
  return Object.freeze({ deploymentIdentity: canonicalClone(identity), deploymentIdentityDigest: value.deploymentIdentityDigest });
}

function deploymentStaticProjection(identity) {
  const value = assertRecord(identity, 'deployment identity');
  assertDigest(value.routeCurrentTupleDigest, 'deployment identity routeCurrentTupleDigest');
  assertDigest(value.routeVerifierDigest, 'deployment identity routeVerifierDigest');
  const projection = canonicalClone(value);
  delete projection.routeCurrentTupleDigest;
  delete projection.routeVerifierDigest;
  return projection;
}

export function assertSameDeploymentStaticIdentity(baselineIdentity, observedIdentity) {
  const baseline = deploymentStaticProjection(baselineIdentity);
  const observed = deploymentStaticProjection(observedIdentity);
  if (canonicalJson(baseline) !== canonicalJson(observed)) {
    fail('d0046_agent_deployment_identity_changed', 'Agent deployment static identity changed across one package management transaction');
  }
  return Object.freeze({
    profile: 'tdev.d0046.agent-deployment-static-identity.v2',
    staticIdentityDigest: digest(baseline),
    baselineRouteCurrentTupleDigest: baselineIdentity.routeCurrentTupleDigest,
    observedRouteCurrentTupleDigest: observedIdentity.routeCurrentTupleDigest,
    baselineRouteVerifierDigest: baselineIdentity.routeVerifierDigest,
    observedRouteVerifierDigest: observedIdentity.routeVerifierDigest,
  });
}

function normalizeSecurityIdentity(value, label = 'Agent security readback') {
  const readback = assertRecord(value, label);
  const result = {};
  for (const key of ['managementKeyId', 'releaseRootKeyId', 'currentCredentialKeyId']) {
    if (!Object.hasOwn(readback, key)) fail('d0046_agent_security_identity_invalid', `${label} is missing ${key}`);
    const item = readback[key];
    if (item !== null && (typeof item !== 'string' || item.length === 0 || item.length > 512 || item.includes('\0'))) {
      fail('d0046_agent_security_identity_invalid', `${label}.${key} is invalid`);
    }
    result[key] = item;
  }
  return Object.freeze(result);
}

export function assertSameAgentSecurityIdentity(baselineSecurityIdentity, observedSecurityIdentity) {
  const baseline = normalizeSecurityIdentity(baselineSecurityIdentity, 'baseline Agent security identity');
  const observed = normalizeSecurityIdentity(observedSecurityIdentity, 'observed Agent security identity');
  if (canonicalJson(baseline) !== canonicalJson(observed)) {
    fail('d0046_agent_security_identity_changed', 'Agent management/release/credential key identity changed across one package management transaction');
  }
  return Object.freeze({ profile: 'tdev.d0046.agent-security-identity.v1', securityIdentityDigest: digest(baseline) });
}

function assertRouteVerifierMatchesSecurity(deploymentIdentity, securityIdentity) {
  const expected = qualificationRouteVerifierDigest({
    currentTupleDigest: deploymentIdentity.routeCurrentTupleDigest,
    managementKeyId: securityIdentity.managementKeyId,
    releaseRootKeyId: securityIdentity.releaseRootKeyId,
    currentCredentialKeyId: securityIdentity.currentCredentialKeyId,
  });
  if (deploymentIdentity.routeVerifierDigest !== expected) {
    fail('d0046_agent_route_verifier_mismatch', 'Agent deployment route verifier is not bound to the observed current tuple and security key identity');
  }
  return expected;
}

function validatedSecurityReadback(value, label = 'Agent security readback') {
  const probe = validatedDeploymentProbe(value, label);
  const securityIdentity = normalizeSecurityIdentity(value, label);
  assertRouteVerifierMatchesSecurity(probe.deploymentIdentity, securityIdentity);
  return Object.freeze({ ...probe, securityIdentity });
}

function assertSameDeploymentSnapshot(runtimeProbe, securityProbe) {
  if (runtimeProbe.deploymentIdentityDigest !== securityProbe.deploymentIdentityDigest || canonicalJson(runtimeProbe.deploymentIdentity) !== canonicalJson(securityProbe.deploymentIdentity)) {
    fail('d0046_agent_deployment_snapshot_inconsistent', 'Runtime and security readbacks did not observe one exact deployment identity snapshot');
  }
}

async function freshMutationDeploymentFence({ rpc, baselineDeploymentIdentity, baselineSecurityIdentity }) {
  const probe = validatedDeploymentProbe(await rpc('runtime_probe'));
  const securityProbe = validatedSecurityReadback(await rpc('d0039_security_readback'));
  assertSameDeploymentSnapshot(probe, securityProbe);
  const staticIdentity = assertSameDeploymentStaticIdentity(baselineDeploymentIdentity, probe.deploymentIdentity);
  const securityIdentity = assertSameAgentSecurityIdentity(baselineSecurityIdentity, securityProbe.securityIdentity);
  return Object.freeze({ ...probe, staticIdentityDigest: staticIdentity.staticIdentityDigest, securityIdentityDigest: securityIdentity.securityIdentityDigest });
}

function assertSourceRevision(value, label = 'source revision') {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) fail('d0046_agent_update_input_invalid', `${label} must be an exact lowercase Git SHA`);
  return value;
}

export function durableAgentReleaseRoot(sourceRevision, releasesRoot = D0046_AGENT_RELEASES_ROOT) {
  assertSourceRevision(sourceRevision);
  if (typeof releasesRoot !== 'string' || !path.isAbsolute(releasesRoot)) fail('d0046_agent_release_root_invalid', 'Agent releases root must be absolute');
  return path.join(path.resolve(releasesRoot), sourceRevision);
}

function assertLocalPackageState(value) {
  const state = assertRecord(value, 'local package state');
  assertDigest(state.releaseManifestDigest, 'local package state releaseManifestDigest');
  assertSourceRevision(state.sourceRevision, 'local package state sourceRevision');
  return state;
}

function normalizeLocalManagementCurrent(value, candidateManifestDigest) {
  if (value === null) return null;
  const current = assertRecord(value, 'local management journal current');
  if (current.operation !== 'update') fail('d0046_agent_local_management_conflict', 'Only the exact D0027 update transaction may be resumed');
  if (current.releaseManifestDigest !== candidateManifestDigest) fail('d0046_agent_local_management_conflict', 'Local management transaction targets a different package release');
  if (typeof current.managementRequestId !== 'string' || current.managementRequestId.length === 0) fail('d0046_agent_local_management_conflict', 'Local management transaction has no request identity');
  assertDigest(current.intentDigest, 'local management intentDigest');
  assertDigest(current.expectedPredecessorDigest, 'local management expectedPredecessorDigest');
  return current;
}

async function readOptionalJson(filePath) {
  try { return JSON.parse(await readFile(filePath, 'utf8')); }
  catch (cause) { if (cause?.code === 'ENOENT') return null; throw cause; }
}

async function releaseAt(packageRoot) {
  const manifest = await readOptionalJson(path.join(packageRoot, 'release-manifest.json'));
  if (manifest === null) return null;
  return verifyInstallableAgentRelease({ packageRoot });
}

async function resolveLocalStateRelease({ localState, serviceController, stateDirectory, legacyPackageRoot, releasesRoot }) {
  const state = assertLocalPackageState(localState);
  const candidates = [...new Set([
    durableAgentReleaseRoot(state.sourceRevision, releasesRoot),
    path.resolve(legacyPackageRoot),
  ])];
  const matches = [];
  for (const packageRoot of candidates) {
    const release = await releaseAt(packageRoot);
    if (release === null || release.manifestDigest !== state.releaseManifestDigest || release.manifest.sourceRevision !== state.sourceRevision) continue;
    const binding = await serviceController.inspectReleaseBinding({ packageRoot, stateDirectory, manifest: release.manifest });
    matches.push({ packageRoot, release, binding });
  }
  if (matches.length === 0) fail('d0046_agent_local_release_missing', 'No verified local package root matches the durable local package state');
  return Object.freeze({ state: canonicalClone(state), matches });
}

export function assertCandidateDurableReleaseRoot({ packageRoot, sourceRevision, releasesRoot = D0046_AGENT_RELEASES_ROOT }) {
  const expected = durableAgentReleaseRoot(sourceRevision, releasesRoot);
  if (path.resolve(packageRoot) !== expected) fail('d0046_agent_candidate_root_not_durable', 'Candidate Agent package must be materialized at its deterministic durable release root');
  return Object.freeze({ profile: 'tdev.d0046.agent-durable-release-root.v1', sourceRevision, rootBindingDigest: digest({ sourceRevision, releaseRootProfile: 'versioned-durable-root' }) });
}

export function assertLocalReleaseBindingState({ localStateManifestDigest, candidateManifestDigest, localManagementCurrent, predecessorBindings, candidateBinding }) {
  const candidateExact = candidateBinding?.classification === 'exact';
  const predecessorExactCount = predecessorBindings.filter((binding) => binding?.classification === 'exact').length;
  if (localStateManifestDigest === candidateManifestDigest) {
    if (!candidateExact) fail('d0046_agent_local_release_binding_unknown', 'Finalized local candidate state is not bound to the candidate release root');
    return Object.freeze({ profile: 'tdev.d0046.agent-local-release-binding.v1', classification: 'candidate', predecessorExactCount, candidateExact: true });
  }
  if (localManagementCurrent === null) {
    if (predecessorExactCount !== 1 || candidateExact) fail('d0046_agent_local_release_binding_unknown', 'Quiescent local predecessor is not bound to exactly one verified predecessor release root');
    return Object.freeze({ profile: 'tdev.d0046.agent-local-release-binding.v1', classification: 'predecessor', predecessorExactCount: 1, candidateExact: false });
  }
  if ((predecessorExactCount === 1) === candidateExact) fail('d0046_agent_local_release_binding_unknown', 'In-progress local update must be bound to exactly one of predecessor or candidate release roots');
  return Object.freeze({ profile: 'tdev.d0046.agent-local-release-binding.v1', classification: candidateExact ? 'candidate' : 'predecessor', predecessorExactCount, candidateExact });
}

export function assertStableReleaseCompatibility(predecessor, candidate) {
  assertRecord(predecessor, 'predecessor release');
  assertRecord(candidate, 'candidate release');
  for (const field of STABLE_RELEASE_FIELDS) {
    if (!Object.hasOwn(predecessor, field) || !Object.hasOwn(candidate, field) || canonicalJson(predecessor[field]) !== canonicalJson(candidate[field])) {
      fail('d0046_agent_release_contract_changed', 'Candidate package changes or omits a preserved Agent release contract', { field });
    }
  }
  return Object.freeze({ profile: 'tdev.d0046.agent-release-compatibility.v1', stableFields: [...STABLE_RELEASE_FIELDS], digest: digest(Object.fromEntries(STABLE_RELEASE_FIELDS.map((field) => [field, candidate[field]]))) });
}

export function assertProviderQuiescence(routeRead, installableRead) {
  assertRecord(routeRead, 'provider route read');
  assertRecord(installableRead, 'provider installable read');
  const reservations = Object.values(routeRead.reservations ?? {});
  const deliveries = Object.values(routeRead.deliveries ?? {});
  const liveReservations = reservations.filter((item) => item?.status === 'reserved');
  const liveDeliveries = deliveries.filter((item) => !TERMINAL_DELIVERY_STATES.has(item?.status));
  const installable = installableRead.installableAgent;
  if (installable?.state !== 'CURRENT' || installable?.current === null) fail('d0046_agent_not_current', 'Agent provider is not in exact CURRENT state');
  if (liveReservations.length !== 0 || liveDeliveries.length !== 0) {
    fail('d0046_agent_provider_not_quiescent', 'Agent provider has live reservations or deliveries', {
      liveReservationCount: liveReservations.length,
      liveDeliveryCount: liveDeliveries.length,
    });
  }
  return Object.freeze({
    profile: 'tdev.d0046.agent-provider-quiescence.v1',
    reservationWindowGeneration: routeRead.reservationWindowGeneration,
    liveReservationCount: 0,
    liveDeliveryCount: 0,
    installableState: 'CURRENT',
    managementTransaction: installable.current.managementTransaction === null ? null : canonicalClone(installable.current.managementTransaction),
  });
}

export function assertLocalQuiescence(status, { allowExactManagementRequestId = null } = {}) {
  assertRecord(status, 'local package status');
  const current = status.managementJournal?.current ?? null;
  if (current !== null && current.managementRequestId !== allowExactManagementRequestId) {
    fail('d0046_agent_local_management_busy', 'A different local Agent management transaction is nonterminal', { managementRequestId: current.managementRequestId ?? null });
  }
  const supervisor = status.service?.supervisor?.supervisor;
  const runningPositive = status.service?.classification === 'running' && supervisor?.initialized === true && supervisor?.liveOperations === 0 && Array.isArray(supervisor?.heldPredecessors) && supervisor.heldPredecessors.length === 0;
  const stoppedDrainReplay = current !== null && current.operation === 'update' && current.managementRequestId === allowExactManagementRequestId && STOPPED_DRAIN_RESUME_PHASES.has(current.phase) && status.service?.classification === 'not_ready' && status.service?.supervisorRunit?.classification === 'down' && status.service?.controlRunit?.classification === 'down';
  if (!runningPositive && !stoppedDrainReplay) {
    fail('d0046_agent_local_not_quiescent', 'Local Agent is neither positively running/quiescent nor an exact stopped post-drain recovery state');
  }
  return Object.freeze({
    profile: 'tdev.d0046.agent-local-quiescence.v1',
    service: runningPositive ? 'running' : 'stopped_after_recorded_positive_quiescence',
    liveOperations: 0,
    heldPredecessorCount: 0,
    managementRequestId: current?.managementRequestId ?? null,
    managementPhase: current?.phase ?? null,
  });
}

export function nextManagementRequestId(highWater) {
  if (!Number.isSafeInteger(highWater) || highWater < 0) fail('d0046_agent_management_sequence_invalid', 'Management request high-water must be a non-negative safe integer');
  return `m2:${highWater + 1}`;
}

function packageIntentContent(candidateManifestDigest, packageTrustSubjectDigest) {
  return Object.freeze({
    transitionCause: 'package_update',
    packageManifestDigest: assertDigest(candidateManifestDigest, 'candidate manifest digest'),
    packageTrustSubjectDigest: assertDigest(packageTrustSubjectDigest, 'package trust subject digest'),
  });
}

function transactionMatchesCandidate(transaction, content) {
  return transaction?.type === 'package_update' &&
    transaction.candidate?.packageManifestDigest === content.packageManifestDigest &&
    transaction.candidate?.packageTrustSubjectDigest === content.packageTrustSubjectDigest;
}

export function selectPackageUpdateIdentity({
  installableRead,
  routeBinding,
  candidateManifestDigest,
  packageTrustSubjectDigest,
  localManagementCurrent = null,
  localStateManifestDigest = null,
}) {
  const read = assertRecord(installableRead, 'installable Agent read');
  const binding = assertRecord(routeBinding, 'route binding');
  const installable = read.installableAgent;
  if (installable?.state !== 'CURRENT' || installable?.current === null) fail('d0046_agent_not_current', 'Agent provider is not CURRENT');
  const content = packageIntentContent(candidateManifestDigest, packageTrustSubjectDigest);
  const current = installable.current;
  const transaction = current.managementTransaction;
  const expectedIntentDigest = computeInstallableAgentManagementIntentDigest('package', binding, content);
  const local = localManagementCurrent === null ? null : normalizeLocalManagementCurrent(localManagementCurrent, content.packageManifestDigest);
  if (local !== null && local.intentDigest !== expectedIntentDigest) fail('d0046_agent_management_intent_mismatch', 'Local Agent package transaction has a non-canonical intent digest');
  if (localStateManifestDigest !== null && current.packageManifestDigest !== content.packageManifestDigest && current.packageManifestDigest !== localStateManifestDigest) {
    fail('d0046_agent_local_provider_release_mismatch', 'Provider CURRENT package and durable local package state disagree');
  }

  if (transaction !== null) {
    if (!transactionMatchesCandidate(transaction, content)) fail('d0046_agent_conflicting_management_transaction', 'A different Agent package transaction is already in progress');
    if (transaction.intentDigest !== expectedIntentDigest) fail('d0046_agent_management_intent_mismatch', 'Existing Agent package transaction has a non-canonical intent digest');
    if (local === null || local.managementRequestId !== transaction.managementRequestId || local.intentDigest !== transaction.intentDigest || local.expectedPredecessorDigest !== transaction.predecessorDigest) {
      fail('d0046_agent_local_management_conflict', 'Provider package transaction is not backed by the exact local recovery journal identity');
    }
    return Object.freeze({ mode: 'resume', managementRequestId: transaction.managementRequestId, intentDigest: transaction.intentDigest, expectedPredecessorDigest: transaction.predecessorDigest, content });
  }

  if (current.packageManifestDigest === content.packageManifestDigest) {
    if (local !== null) {
      const receipt = committedReceiptFor(read, local.managementRequestId);
      if (receipt === null || receipt.operation !== 'package' || receipt.intentDigest !== expectedIntentDigest || receipt.predecessorDigest !== local.expectedPredecessorDigest) {
        fail('d0046_agent_local_management_conflict', 'Provider CURRENT candidate is not backed by the exact committed receipt for the local recovery journal');
      }
      return Object.freeze({ mode: 'resume_committed', managementRequestId: local.managementRequestId, intentDigest: local.intentDigest, expectedPredecessorDigest: local.expectedPredecessorDigest, content });
    }
    if (localStateManifestDigest !== content.packageManifestDigest) fail('d0046_agent_local_provider_release_mismatch', 'Provider CURRENT candidate is not finalized in durable local package state and has no recovery journal');
    return Object.freeze({ mode: 'already_current', content });
  }

  if (current.packageTrustSubjectDigest !== content.packageTrustSubjectDigest) fail('d0046_agent_trust_subject_changed', 'Candidate package does not preserve the active package trust subject');
  if (localStateManifestDigest !== null && current.packageManifestDigest !== localStateManifestDigest) fail('d0046_agent_local_provider_release_mismatch', 'Provider CURRENT package and durable local package state disagree before package update');
  if (local !== null) {
    if (local.expectedPredecessorDigest !== read.predecessorDigest) fail('d0046_agent_local_management_conflict', 'Prepared local package transaction is fenced to a stale provider predecessor');
    return Object.freeze({ mode: 'resume_local', managementRequestId: local.managementRequestId, intentDigest: local.intentDigest, expectedPredecessorDigest: local.expectedPredecessorDigest, content });
  }
  const managementRequestId = nextManagementRequestId(installable.managementRequestSequenceHighWater);
  return Object.freeze({ mode: 'new', managementRequestId, intentDigest: expectedIntentDigest, expectedPredecessorDigest: assertDigest(read.predecessorDigest, 'provider predecessor digest'), content });
}

export function createManagementEnvelope({ context, publicJwk, privateKey }) {
  const keyId = installableAgentManagementKeyId(publicJwk);
  return Object.freeze({
    profile: INSTALLABLE_AGENT_MANAGEMENT_ENVELOPE_PROFILE,
    keyId,
    context: canonicalClone(context),
    signature: encodeBase64Url(sign(null, signedRecordBytes('tdev.agent-management.v1', context), privateKey)),
  });
}

export function createEvidenceEnvelope({ context, publicJwk, privateKey }) {
  const keyId = installableAgentEvidenceAttestorKeyId(publicJwk);
  return Object.freeze({
    profile: INSTALLABLE_AGENT_EVIDENCE_ATTESTATION_ENVELOPE_PROFILE,
    keyId,
    context: canonicalClone(context),
    signature: encodeBase64Url(sign(null, signedRecordBytes(INSTALLABLE_AGENT_EVIDENCE_ATTESTATION_SIGNATURE_DOMAIN, context), privateKey)),
  });
}

export function buildPackageUpdateRequest({ identity, routeBinding, controlConfig, managementSigner }) {
  if (identity.mode === 'already_current') return Object.freeze({ mode: 'already_current' });
  const request = {
    managementRequestId: identity.managementRequestId,
    intentDigest: identity.intentDigest,
    expectedPredecessorDigest: identity.expectedPredecessorDigest,
    ...identity.content,
    controlConfig: canonicalClone(controlConfig),
  };
  const context = managementProofContext('package', routeBinding, request, identity.expectedPredecessorDigest);
  request.managementProof = managementSigner(context);
  return Object.freeze(request);
}

export function buildEvidenceProof({ type, evidenceDigest, installableRead, routeBinding, evidenceSigner }) {
  const transaction = installableRead?.installableAgent?.current?.managementTransaction;
  if (transaction === null || transaction === undefined) fail('d0046_agent_evidence_transaction_missing', 'Evidence cannot be attested without the active package transaction');
  const context = evidenceProofContext(type, routeBinding, {
    managementRequestId: transaction.managementRequestId,
    transactionType: transaction.type,
    phase: transaction.phase,
    candidate: transaction.candidate,
    currentSecurityDigest: installableAgentSecurityStateDigest(installableRead.installableAgent),
    evidenceDigest: assertDigest(evidenceDigest, 'evidence digest'),
  });
  return Object.freeze({
    managementRequestId: transaction.managementRequestId,
    type,
    evidenceDigest,
    evidenceProof: evidenceSigner(context),
  });
}

export function buildQualificationRpcInput(operation, { request = undefined, expectedDeploymentIdentityDigest = undefined } = {}) {
  const input = {
    profile: D0046_AGENT_RPC_PROFILE,
    operation,
    agentId: D0046_AGENT_ID,
    routeGeneration: D0046_AGENT_ROUTE_GENERATION,
  };
  if (expectedDeploymentIdentityDigest !== undefined) input.expectedDeploymentIdentityDigest = assertDigest(expectedDeploymentIdentityDigest, 'deployment identity digest');
  if (request !== undefined) input.request = canonicalClone(request);
  return Object.freeze(input);
}

function committedReceiptFor(installableRead, managementRequestId) {
  const receipt = installableRead?.installableAgent?.managementReceipts?.[managementRequestId];
  if (receipt === undefined) return null;
  const phase = receipt.result?.phase ?? receipt.phase ?? null;
  return phase === 'committed' ? receipt : null;
}

function committedReceiptMatches(receipt, input) {
  return receipt !== null && receipt.operation === 'package' && receipt.intentDigest === input.intentDigest && receipt.predecessorDigest === input.expectedPredecessorDigest;
}

export function reconcileAmbiguousAgentMutation({ method, input, installableRead, candidateManifestDigest }) {
  const transaction = installableRead?.installableAgent?.current?.managementTransaction ?? null;
  const managementRequestId = input.managementRequestId;
  const receipt = committedReceiptFor(installableRead, managementRequestId);
  const candidateCurrent = installableRead?.installableAgent?.current?.packageManifestDigest === candidateManifestDigest;

  if (method === 'beginPackageActivation') {
    if (transaction?.managementRequestId === managementRequestId && transaction.intentDigest === input.intentDigest && transaction.predecessorDigest === input.expectedPredecessorDigest && transactionMatchesCandidate(transaction, packageIntentContent(candidateManifestDigest, transaction.candidate?.packageTrustSubjectDigest))) {
      return Object.freeze({ phase: 'draining', classification: 'reconciled_after_ambiguous_response' });
    }
    if (candidateCurrent && committedReceiptMatches(receipt, input)) return Object.freeze({ phase: 'committed', currentTuple: canonicalClone(installableRead.currentTuple), classification: 'reconciled_after_ambiguous_response' });
  } else if (method === 'recordInstallableAgentTransactionEvidence') {
    const readinessKey = EVIDENCE_READINESS_KEYS[input.type];
    if (transaction?.managementRequestId === managementRequestId && readinessKey !== undefined && transaction.readiness?.[readinessKey] === input.evidenceDigest) {
      return Object.freeze({ classification: 'exact_replay', evidenceDigest: input.evidenceDigest });
    }
  } else if (method === 'commitPackageActivation') {
    if (candidateCurrent && committedReceiptMatches(receipt, input)) return Object.freeze({ phase: 'committed', currentTuple: canonicalClone(installableRead.currentTuple), classification: 'reconciled_after_ambiguous_response' });
  }
  fail('d0046_agent_update_effect_unknown', 'Agent provider mutation response was ambiguous and authoritative readback did not prove the same requested effect', { method, managementRequestId });
}

export function controlConfigBase(value) {
  const keys = [
    'agentId', 'routeGeneration', 'executorId', 'executorEpoch', 'agentDeliveryUrl', 'credentialRef', 'protocolMetadataDigest', 'reportedCapacity',
    'reconnectDelayMs', 'androidSourceLineageId', 'developmentRepositoryPath', 'developmentCodexHome', 'developmentCodexExecutable', 'developmentNpmExecutable', 'developmentWorkspaceRoot',
  ];
  const result = {};
  for (const key of keys) if (Object.hasOwn(value, key)) result[key] = value[key];
  return Object.freeze(result);
}

export function createQualificationRpc({ token, fetchImpl = globalThis.fetch, url = D0046_AGENT_QUALIFICATION_URL }) {
  if (typeof token !== 'string' || token.length === 0) fail('d0046_agent_qualification_token_missing', 'D0020 qualification token is required');
  return async function rpc(operation, options = {}) {
    const input = buildQualificationRpcInput(operation, options);
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (cause) {
      const error = new Error('Agent provider request ended without a trusted response', { cause });
      error.code = 'd0046_agent_provider_response_ambiguous';
      throw error;
    }
    let body;
    try { body = await response.json(); }
    catch (cause) {
      const error = new Error('Agent provider returned an unreadable response', { cause });
      error.code = 'd0046_agent_provider_response_ambiguous';
      throw error;
    }
    if (!response.ok || body?.ok !== true) fail(body?.error?.code ?? 'd0046_agent_provider_rejected', 'Agent provider rejected qualification RPC', { operation, status: response.status });
    return body.result;
  };
}

export function createAgentManagementTransport({ rpc, baselineDeploymentIdentity, baselineSecurityIdentity, routeBinding, candidateManifestDigest, evidenceSigner }) {
  const mutationMap = Object.freeze({
    beginPackageActivation: 'begin_package_activation',
    recordInstallableAgentTransactionEvidence: 'record_installable_agent_transaction_evidence',
    commitPackageActivation: 'commit_package_activation',
  });
  return Object.freeze({
    async invoke(method, rawInput) {
      if (method === 'status') return rpc('read_installable_agent');
      const operation = mutationMap[method];
      if (operation === undefined) fail('d0046_agent_management_operation_unsupported', 'Unsupported D0046 Agent management transport operation', { method });
      let request = canonicalClone(rawInput);
      if (method === 'recordInstallableAgentTransactionEvidence') {
        const read = await rpc('read_installable_agent');
        request = buildEvidenceProof({ type: rawInput.type, evidenceDigest: rawInput.evidenceDigest, installableRead: read, routeBinding, evidenceSigner });
      }
      const fence = await freshMutationDeploymentFence({ rpc, baselineDeploymentIdentity, baselineSecurityIdentity });
      try {
        return await rpc(operation, { request, expectedDeploymentIdentityDigest: fence.deploymentIdentityDigest });
      } catch (error) {
        if (error?.code !== 'd0046_agent_provider_response_ambiguous') throw error;
        const read = await rpc('read_installable_agent');
        return reconcileAmbiguousAgentMutation({ method, input: request, installableRead: read, candidateManifestDigest });
      }
    },
  });
}

function publicKeyFromAttestorFile(value) {
  return value.publicJwk ?? value.jwk ?? value;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function prepareD0046AgentPreservingUpdate({
  packageRoot,
  installedPackageRoot = D0046_AGENT_INSTALLED_PACKAGE_ROOT,
  releasesRoot = D0046_AGENT_RELEASES_ROOT,
  stateDirectory = D0046_AGENT_STATE_DIRECTORY,
  token = process.env.TDEV_D0020_QUALIFICATION_TOKEN,
  rpc = null,
} = {}) {
  if (typeof packageRoot !== 'string' || packageRoot.length === 0) fail('d0046_agent_package_root_missing', 'Candidate durable package root is required');
  const provider = rpc ?? createQualificationRpc({ token });
  const serviceController = new TermuxInstallableAgentServiceController();
  const candidate = await verifyInstallableAgentRelease({ packageRoot });
  const durableRoot = assertCandidateDurableReleaseRoot({ packageRoot, sourceRevision: candidate.manifest.sourceRevision, releasesRoot });
  const [localStateRaw, managementJournal, service, routeRead, installableRead, runtimeProbe, securityReadback, attestorReadback, controlConfig, managementPublicJwk, attestorPublicFile] = await Promise.all([
    readJson(path.join(stateDirectory, 'package-state.json')),
    readJson(path.join(stateDirectory, 'management-journal.json')),
    serviceController.status({ stateDirectory }),
    provider('read'),
    provider('read_installable_agent'),
    provider('runtime_probe'),
    provider('d0039_security_readback'),
    provider('d0040_evidence_attestor_readback'),
    readJson(path.join(stateDirectory, 'control-config.json')),
    readJson(path.join(D0046_AGENT_MANAGEMENT_CUSTODY, 'management.public.jwk.json')),
    readJson(path.join(D0046_AGENT_ATTESTOR_CUSTODY, 'attestor-public.json')),
  ]);
  const localRelease = await resolveLocalStateRelease({ localState: localStateRaw, serviceController, stateDirectory, legacyPackageRoot: installedPackageRoot, releasesRoot });
  const localState = localRelease.state;
  const predecessorManifest = localRelease.matches[0].release.manifest;
  const compatibility = assertStableReleaseCompatibility(predecessorManifest, candidate.manifest);
  const providerQuiescence = assertProviderQuiescence(routeRead, installableRead);
  const current = installableRead.installableAgent.current;
  const routeBinding = routeRead.routeBinding;
  if (routeBinding === undefined) fail('d0046_agent_route_binding_missing', 'Provider route read did not expose the canonical route binding');
  const localManagementCurrent = managementJournal?.current ?? null;
  const identity = selectPackageUpdateIdentity({
    installableRead,
    routeBinding,
    candidateManifestDigest: candidate.manifestDigest,
    packageTrustSubjectDigest: current.packageTrustSubjectDigest,
    localManagementCurrent,
    localStateManifestDigest: localState.releaseManifestDigest,
  });
  const localStatus = { service, managementJournal: { current: localManagementCurrent === null ? null : canonicalClone(localManagementCurrent) } };
  const localQuiescence = assertLocalQuiescence(localStatus, { allowExactManagementRequestId: localManagementCurrent === null ? null : identity.managementRequestId });
  const candidateBinding = await serviceController.inspectReleaseBinding({ packageRoot, stateDirectory, manifest: candidate.manifest });
  const bindingState = assertLocalReleaseBindingState({
    localStateManifestDigest: localState.releaseManifestDigest,
    candidateManifestDigest: candidate.manifestDigest,
    localManagementCurrent,
    predecessorBindings: localRelease.matches.map((match) => match.binding),
    candidateBinding,
  });
  const deploymentProbe = validatedDeploymentProbe(runtimeProbe);
  const providerSecurity = validatedSecurityReadback(securityReadback);
  assertSameDeploymentSnapshot(deploymentProbe, providerSecurity);
  const deploymentStaticIdentity = assertSameDeploymentStaticIdentity(deploymentProbe.deploymentIdentity, deploymentProbe.deploymentIdentity);
  const securityIdentity = assertSameAgentSecurityIdentity(providerSecurity.securityIdentity, providerSecurity.securityIdentity);
  if (installableAgentManagementKeyId(managementPublicJwk) !== providerSecurity.securityIdentity.managementKeyId) fail('d0046_agent_management_key_mismatch', 'Local management custody key does not match provider CURRENT security state');
  const attestorPublicJwk = publicKeyFromAttestorFile(attestorPublicFile);
  const providerAttestorKeyId = attestorReadback.evidenceAttestationVerifier?.keyId ?? attestorReadback.keyId;
  if (installableAgentEvidenceAttestorKeyId(attestorPublicJwk) !== providerAttestorKeyId || providerAttestorKeyId !== runtimeProbe.evidenceAttestationVerifier?.keyId) fail('d0046_agent_attestor_key_mismatch', 'Local evidence attestor does not match provider deployment');
  const preparation = {
    profile: 'tdev.d0046.agent-preserving-update-preparation.v2',
    candidateManifestDigest: candidate.manifestDigest,
    candidateSourceRevision: candidate.manifest.sourceRevision,
    predecessorManifestDigest: localState.releaseManifestDigest,
    providerObservedStateDigest: installableRead.predecessorDigest,
    managementExpectedPredecessorDigest: identity.expectedPredecessorDigest ?? null,
    deploymentIdentityDigest: deploymentProbe.deploymentIdentityDigest,
    deploymentStaticIdentityDigest: deploymentStaticIdentity.staticIdentityDigest,
    securityIdentityDigest: securityIdentity.securityIdentityDigest,
    routeBindingDigest: digest(routeBinding),
    durableRootBindingDigest: durableRoot.rootBindingDigest,
    compatibilityDigest: compatibility.digest,
    providerQuiescenceDigest: digest(providerQuiescence),
    localQuiescenceDigest: digest(localQuiescence),
    localReleaseBindingDigest: digest(bindingState),
    controlRunitClassification: service.controlRunit?.classification ?? 'unknown',
    mode: identity.mode,
    managementRequestId: identity.managementRequestId ?? null,
  };
  return Object.freeze({
    ...preparation,
    preparationDigest: digest(preparation),
    packageRoot: path.resolve(packageRoot),
    stateDirectory,
    routeBinding: canonicalClone(routeBinding),
    deploymentIdentity: canonicalClone(deploymentProbe.deploymentIdentity),
    securityIdentity: canonicalClone(providerSecurity.securityIdentity),
    identity,
    candidateManifest: canonicalClone(candidate.manifest),
    controlConfig: controlConfigBase(controlConfig),
    managementPublicJwk,
    attestorPublicJwk,
    rpc: provider,
    secretValues: 'excluded',
  });
}

export function summarizeAgentPreparation(prepared) {
  const status = prepared.mode === 'already_current'
    ? prepared.controlRunitClassification === 'running' ? 'agent_already_current' : 'agent_package_current_control_unhealthy'
    : 'prepared_agent_preserving_update';
  return Object.freeze({
    status,
    candidateManifestDigest: prepared.candidateManifestDigest,
    candidateSourceRevision: prepared.candidateSourceRevision,
    predecessorManifestDigest: prepared.predecessorManifestDigest,
    providerObservedStateDigest: prepared.providerObservedStateDigest,
    managementExpectedPredecessorDigest: prepared.managementExpectedPredecessorDigest,
    deploymentIdentityDigest: prepared.deploymentIdentityDigest,
    deploymentStaticIdentityDigest: prepared.deploymentStaticIdentityDigest,
    securityIdentityDigest: prepared.securityIdentityDigest,
    routeBindingDigest: prepared.routeBindingDigest,
    durableRootBindingDigest: prepared.durableRootBindingDigest,
    compatibilityDigest: prepared.compatibilityDigest,
    providerQuiescenceDigest: prepared.providerQuiescenceDigest,
    localQuiescenceDigest: prepared.localQuiescenceDigest,
    localReleaseBindingDigest: prepared.localReleaseBindingDigest,
    controlRunitClassification: prepared.controlRunitClassification,
    mode: prepared.mode,
    managementRequestId: prepared.managementRequestId,
    preparationDigest: prepared.preparationDigest,
    providerMutation: false,
    secretValues: 'excluded',
  });
}

export async function applyD0046AgentPreservingUpdate({ prepared }) {
  if (prepared.mode === 'already_current') return Object.freeze({ ...summarizeAgentPreparation(prepared), status: 'agent_already_current', providerMutation: false });
  const managementPrivateKey = createPrivateKey(await readFile(path.join(D0046_AGENT_MANAGEMENT_CUSTODY, 'management.private.pkcs8.pem')));
  const attestorPrivateKey = createPrivateKey(await readFile(path.join(D0046_AGENT_ATTESTOR_CUSTODY, 'attestor-private.pk8.pem')));
  const managementSigner = (context) => createManagementEnvelope({ context, publicJwk: prepared.managementPublicJwk, privateKey: managementPrivateKey });
  const evidenceSigner = (context) => createEvidenceEnvelope({ context, publicJwk: prepared.attestorPublicJwk, privateKey: attestorPrivateKey });
  const request = buildPackageUpdateRequest({ identity: prepared.identity, routeBinding: prepared.routeBinding, controlConfig: prepared.controlConfig, managementSigner });
  const transport = createAgentManagementTransport({
    rpc: prepared.rpc,
    baselineDeploymentIdentity: prepared.deploymentIdentity,
    baselineSecurityIdentity: prepared.securityIdentity,
    routeBinding: prepared.routeBinding,
    candidateManifestDigest: prepared.candidateManifestDigest,
    evidenceSigner,
  });
  const serviceController = new TermuxInstallableAgentServiceController();
  const manager = new InstallableAgentPackageManager({
    packageRoot: prepared.packageRoot,
    stateDirectory: prepared.stateDirectory,
    serviceController,
    managementTransport: transport,
  });
  const result = await manager.update(request);
  const [routeRead, installableRead, localStatus, candidateBinding, finalRuntimeProbe, finalSecurityReadback] = await Promise.all([
    prepared.rpc('read'),
    prepared.rpc('read_installable_agent'),
    manager.status(),
    serviceController.inspectReleaseBinding({ packageRoot: prepared.packageRoot, stateDirectory: prepared.stateDirectory, manifest: prepared.candidateManifest }),
    prepared.rpc('runtime_probe'),
    prepared.rpc('d0039_security_readback'),
  ]);
  const providerQuiescence = assertProviderQuiescence(routeRead, installableRead);
  const finalDeploymentProbe = validatedDeploymentProbe(finalRuntimeProbe, 'final deployment runtime probe');
  const finalProviderSecurity = validatedSecurityReadback(finalSecurityReadback, 'final Agent security readback');
  assertSameDeploymentSnapshot(finalDeploymentProbe, finalProviderSecurity);
  const finalDeploymentStaticIdentity = assertSameDeploymentStaticIdentity(prepared.deploymentIdentity, finalDeploymentProbe.deploymentIdentity);
  const finalSecurityIdentity = assertSameAgentSecurityIdentity(prepared.securityIdentity, finalProviderSecurity.securityIdentity);
  const localQuiescence = assertLocalQuiescence(localStatus);
  if (installableRead.installableAgent.current?.packageManifestDigest !== prepared.candidateManifestDigest || installableRead.installableAgent.current?.managementTransaction !== null) {
    fail('d0046_agent_update_readback_mismatch', 'Provider did not read back the candidate package as exact CURRENT with no management transaction');
  }
  if (localStatus.localState?.releaseManifestDigest !== prepared.candidateManifestDigest || localStatus.localState?.sourceRevision !== prepared.candidateSourceRevision) {
    fail('d0046_agent_update_readback_mismatch', 'Local package state did not read back the candidate release');
  }
  if (localStatus.managementJournal?.current !== null || candidateBinding.classification !== 'exact') {
    fail('d0046_agent_update_readback_mismatch', 'Local recovery journal or run definitions did not finalize on the exact durable candidate release');
  }
  if (localStatus.service?.controlRunit?.classification !== 'running') {
    fail('d0046_agent_control_not_running', 'Local Agent control service is not positively running after package finalization', { classification: localStatus.service?.controlRunit?.classification ?? 'unknown' });
  }
  return Object.freeze({
    status: 'agent_preserving_update_complete',
    candidateManifestDigest: prepared.candidateManifestDigest,
    candidateSourceRevision: prepared.candidateSourceRevision,
    managementRequestId: prepared.identity.managementRequestId,
    preflightDeploymentIdentityDigest: prepared.deploymentIdentityDigest,
    deploymentIdentityDigest: finalDeploymentProbe.deploymentIdentityDigest,
    deploymentStaticIdentityDigest: finalDeploymentStaticIdentity.staticIdentityDigest,
    securityIdentityDigest: finalSecurityIdentity.securityIdentityDigest,
    providerQuiescenceDigest: digest(providerQuiescence),
    localQuiescenceDigest: digest(localQuiescence),
    localReleaseBindingDigest: digest(candidateBinding),
    controlRunitDigest: digest(localStatus.service.controlRunit),
    resultDigest: digest(result),
    providerMutation: true,
    secretValues: 'excluded',
  });
}

async function main() {
  const args = process.argv.slice(2);
  let packageRoot = null;
  let apply = false;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--apply') apply = true;
    else if (args[i] === '--package-root' && i + 1 < args.length) packageRoot = args[++i];
    else fail('d0046_agent_cli_invalid', `Unsupported argument: ${args[i]}`);
  }
  const prepared = await prepareD0046AgentPreservingUpdate({ packageRoot });
  const result = apply ? await applyD0046AgentPreservingUpdate({ prepared }) : summarizeAgentPreparation(prepared);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: 'failed', code: error?.code ?? 'd0046_agent_preserving_update_failed', message: error?.message ?? String(error), details: error?.details ?? undefined }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
