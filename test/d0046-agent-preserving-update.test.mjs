import test from 'node:test';
import assert from 'node:assert/strict';

import { digest } from '../src/canonical.mjs';
import { computeInstallableAgentManagementIntentDigest } from '../src/installable-agent-admission.mjs';
import {
  assertCandidateDurableReleaseRoot,
  assertLocalQuiescence,
  assertLocalReleaseBindingState,
  assertProviderQuiescence,
  assertStableReleaseCompatibility,
  buildEvidenceProof,
  buildPackageUpdateRequest,
  buildQualificationRpcInput,
  controlConfigBase,
  createAgentManagementTransport,
  durableAgentReleaseRoot,
  nextManagementRequestId,
  reconcileAmbiguousAgentMutation,
  selectPackageUpdateIdentity,
  summarizeAgentPreparation,
} from '../qualification/d0046-agent-preserving-update.mjs';

const D = (label) => digest({ label });
const predecessorDigest = D('predecessor');
const oldPackage = D('old-package');
const candidatePackage = D('candidate-package');
const trustSubject = D('trust-subject');
const deploymentIdentity = D('deployment');

function routeBinding() {
  return {
    profile: 'tdev.agent-route-binding.v1',
    agentId: 'd0039-r12-custody-20260828-3631c5a4',
    providerId: 'cloudflare-workers',
    providerAccountScope: 'humtr',
    namespaceId: '0dad69baa7154d00949f88c8b8dbf94a',
    namespaceJurisdiction: 'global',
    className: 'AgentDeliveryRuntimeDO',
    durableObjectId: '88bd5d3c42876252317034b6031382ce8617fb54afad4f8a1a313c12e230360c',
    routeGeneration: 1,
  };
}

function installableRead({ packageDigest = oldPackage, transaction = null, highWater = 2, receipts = {} } = {}) {
  return {
    predecessorDigest,
    currentTuple: { packageManifestDigest: packageDigest, routeGeneration: 1 },
    installableAgent: {
      state: 'CURRENT',
      managementRequestSequenceHighWater: highWater,
      managementReceipts: receipts,
      current: {
        packageManifestDigest: packageDigest,
        packageTrustSubjectDigest: trustSubject,
        managementTransaction: transaction,
        packageActivationGeneration: 2,
        lifecycleGeneration: 3,
        credentialGeneration: 1,
        installationGeneration: 1,
        trustPolicyGeneration: 1,
      },
    },
  };
}

function managementIntent(packageDigest = candidatePackage) {
  return computeInstallableAgentManagementIntentDigest('package', routeBinding(), { transitionCause: 'package_update', packageManifestDigest: packageDigest, packageTrustSubjectDigest: trustSubject });
}

function localManagementCurrent({ requestId = 'm2:3', packageDigest = candidatePackage, intentDigest = null, expectedPredecessorDigest = predecessorDigest } = {}) {
  return {
    operation: 'update',
    managementRequestId: requestId,
    intentDigest: intentDigest ?? managementIntent(packageDigest),
    expectedPredecessorDigest,
    releaseManifestDigest: packageDigest,
  };
}

function committedReceipt({ requestId = 'm2:3', packageDigest = candidatePackage, intentDigest = null, predecessor = predecessorDigest } = {}) {
  return {
    managementRequestId: requestId,
    operation: 'package',
    intentDigest: intentDigest ?? managementIntent(packageDigest),
    predecessorDigest: predecessor,
    result: { phase: 'committed' },
  };
}

function packageTransaction({ requestId = 'm2:3', packageDigest = candidatePackage, intentDigest = null, readiness = {} } = {}) {
  const content = { transitionCause: 'package_update', packageManifestDigest: packageDigest, packageTrustSubjectDigest: trustSubject };
  return {
    type: 'package_update',
    managementRequestId: requestId,
    intentDigest: intentDigest ?? computeInstallableAgentManagementIntentDigest('package', routeBinding(), content),
    predecessorDigest,
    phase: 'draining',
    candidate: {
      packageManifestDigest: packageDigest,
      packageTrustSubjectDigest: trustSubject,
      packageActivationGeneration: 3,
      finalLifecycleGeneration: 5,
      drainingSecurityDigest: D('security'),
    },
    readiness,
  };
}

function localStatus({ liveOperations = 0, heldPredecessors = [], managementCurrent = null } = {}) {
  return {
    service: {
      classification: 'running',
      supervisor: { supervisor: { initialized: true, liveOperations, heldPredecessors } },
    },
    managementJournal: { current: managementCurrent },
  };
}

function stableRelease(overrides = {}) {
  return {
    schemaVersion: 1,
    profile: 'tdev.installable-agent-release.v1',
    target: { platform: 'android', arch: 'arm64' },
    stateSchemas: { package: 1 },
    protocols: { management: 'tdev.agent-management.v1' },
    capabilityProfile: 'tdev.agent.termux.pidfd.v1',
    serviceHostProfile: 'tdev.agent.termux.runit.v1',
    configurationSchemaDigest: D('config-schema'),
    developmentOperationOutputSchema: { relativePath: 'schema.json', sha256: 'a'.repeat(64) },
    helperAbi: { profile: 'helper-v1' },
    runtime: { node: 'termux' },
    toolProfiles: { git: 'v1' },
    developmentOperationProfiles: D('operations'),
    ...overrides,
  };
}

test('stable release compatibility permits implementation/profile payload evolution but preserves durable contracts', () => {
  const predecessor = stableRelease({ developmentOperationProfiles: D('old-ops') });
  const candidate = stableRelease({ developmentOperationProfiles: D('new-ops') });
  const result = assertStableReleaseCompatibility(predecessor, candidate);
  assert.match(result.digest, /^sha256:/u);
  assert.equal(Object.hasOwn(predecessor, 'packageTrustSubjectDigest'), false, 'release manifest does not own provider trust-subject identity');
  assert.throws(() => assertStableReleaseCompatibility(predecessor, { ...candidate, capabilityProfile: 'changed' }), { code: 'd0046_agent_release_contract_changed' });
  const missingRuntime = { ...candidate };
  delete missingRuntime.runtime;
  assert.throws(() => assertStableReleaseCompatibility(predecessor, missingRuntime), { code: 'd0046_agent_release_contract_changed' });
});

test('durable release root is deterministic and transient staging roots are rejected', () => {
  const sourceRevision = 'a'.repeat(40);
  const releasesRoot = '/tmp/tdev-agent-releases';
  const expected = `${releasesRoot}/${sourceRevision}`;
  assert.equal(durableAgentReleaseRoot(sourceRevision, releasesRoot), expected);
  assert.equal(assertCandidateDurableReleaseRoot({ packageRoot: expected, sourceRevision, releasesRoot }).sourceRevision, sourceRevision);
  assert.throws(() => assertCandidateDurableReleaseRoot({ packageRoot: '/tmp/staged/candidate', sourceRevision, releasesRoot }), { code: 'd0046_agent_candidate_root_not_durable' });
});

test('local release binding admits only exact predecessor or candidate according to recovery state', () => {
  const exact = { classification: 'exact' };
  const mismatch = { classification: 'mismatch' };
  assert.equal(assertLocalReleaseBindingState({ localStateManifestDigest: oldPackage, candidateManifestDigest: candidatePackage, localManagementCurrent: null, predecessorBindings: [exact], candidateBinding: mismatch }).classification, 'predecessor');
  assert.equal(assertLocalReleaseBindingState({ localStateManifestDigest: oldPackage, candidateManifestDigest: candidatePackage, localManagementCurrent: localManagementCurrent(), predecessorBindings: [mismatch], candidateBinding: exact }).classification, 'candidate');
  assert.equal(assertLocalReleaseBindingState({ localStateManifestDigest: candidatePackage, candidateManifestDigest: candidatePackage, localManagementCurrent: null, predecessorBindings: [exact], candidateBinding: exact }).classification, 'candidate');
  assert.throws(() => assertLocalReleaseBindingState({ localStateManifestDigest: oldPackage, candidateManifestDigest: candidatePackage, localManagementCurrent: null, predecessorBindings: [mismatch], candidateBinding: mismatch }), { code: 'd0046_agent_local_release_binding_unknown' });
  assert.throws(() => assertLocalReleaseBindingState({ localStateManifestDigest: oldPackage, candidateManifestDigest: candidatePackage, localManagementCurrent: localManagementCurrent(), predecessorBindings: [exact], candidateBinding: exact }), { code: 'd0046_agent_local_release_binding_unknown' });
});

test('already-current summary keeps control health separate from package currency', () => {
  const base = {
    mode: 'already_current',
    candidateManifestDigest: candidatePackage,
    candidateSourceRevision: 'a'.repeat(40),
    predecessorManifestDigest: candidatePackage,
    providerObservedStateDigest: predecessorDigest,
    managementExpectedPredecessorDigest: null,
    deploymentIdentityDigest: deploymentIdentity,
    routeBindingDigest: D('route'),
    durableRootBindingDigest: D('root'),
    compatibilityDigest: D('compatibility'),
    providerQuiescenceDigest: D('provider-quiescence'),
    localQuiescenceDigest: D('local-quiescence'),
    localReleaseBindingDigest: D('local-binding'),
    managementRequestId: null,
    preparationDigest: D('preparation'),
  };
  assert.equal(summarizeAgentPreparation({ ...base, controlRunitClassification: 'down' }).status, 'agent_package_current_control_unhealthy');
  assert.equal(summarizeAgentPreparation({ ...base, controlRunitClassification: 'running' }).status, 'agent_already_current');
});

test('provider quiescence requires actual full-route reservation and delivery state', () => {
  const read = installableRead();
  const ok = assertProviderQuiescence({ routeBinding: routeBinding(), reservationWindowGeneration: 1, reservations: {}, deliveries: {} }, read);
  assert.equal(ok.liveReservationCount, 0);
  assert.throws(() => assertProviderQuiescence({ reservations: { r1: { status: 'reserved' } }, deliveries: {} }, read), { code: 'd0046_agent_provider_not_quiescent' });
  assert.throws(() => assertProviderQuiescence({ reservations: {}, deliveries: { d1: { status: 'activated' } } }, read), { code: 'd0046_agent_provider_not_quiescent' });
});

test('local quiescence requires running service, zero live operations, no held predecessors and no competing journal transaction', () => {
  assert.equal(assertLocalQuiescence(localStatus()).liveOperations, 0);
  assert.throws(() => assertLocalQuiescence(localStatus({ liveOperations: 1 })), { code: 'd0046_agent_local_not_quiescent' });
  assert.throws(() => assertLocalQuiescence(localStatus({ heldPredecessors: ['p'] })), { code: 'd0046_agent_local_not_quiescent' });
  assert.throws(() => assertLocalQuiescence(localStatus({ managementCurrent: { managementRequestId: 'm2:9' } })), { code: 'd0046_agent_local_management_busy' });
  assert.equal(assertLocalQuiescence(localStatus({ managementCurrent: { managementRequestId: 'm2:3' } }), { allowExactManagementRequestId: 'm2:3' }).managementRequestId, 'm2:3');
});

test('fresh package update allocates exactly high-water plus one and binds owner operation package', () => {
  assert.equal(nextManagementRequestId(2), 'm2:3');
  const identity = selectPackageUpdateIdentity({ installableRead: installableRead(), routeBinding: routeBinding(), candidateManifestDigest: candidatePackage, packageTrustSubjectDigest: trustSubject });
  assert.equal(identity.mode, 'new');
  assert.equal(identity.managementRequestId, 'm2:3');
  assert.equal(identity.intentDigest, computeInstallableAgentManagementIntentDigest('package', routeBinding(), identity.content));
});

test('same-target nonterminal package transaction is resumed only with exact local recovery identity', () => {
  const tx = packageTransaction({ requestId: 'm2:3' });
  const local = localManagementCurrent({ requestId: tx.managementRequestId, intentDigest: tx.intentDigest, expectedPredecessorDigest: tx.predecessorDigest });
  const identity = selectPackageUpdateIdentity({ installableRead: installableRead({ transaction: tx, highWater: 3 }), routeBinding: routeBinding(), candidateManifestDigest: candidatePackage, packageTrustSubjectDigest: trustSubject, localManagementCurrent: local, localStateManifestDigest: oldPackage });
  assert.equal(identity.mode, 'resume');
  assert.equal(identity.managementRequestId, tx.managementRequestId);
  assert.equal(identity.intentDigest, tx.intentDigest);
  assert.equal(identity.expectedPredecessorDigest, tx.predecessorDigest);
  assert.throws(() => selectPackageUpdateIdentity({ installableRead: installableRead({ transaction: tx, highWater: 3 }), routeBinding: routeBinding(), candidateManifestDigest: candidatePackage, packageTrustSubjectDigest: trustSubject, localStateManifestDigest: oldPackage }), { code: 'd0046_agent_local_management_conflict' });
});

test('local prepared and provider-committed crashes resume the same management identity', () => {
  const local = localManagementCurrent();
  const prepared = selectPackageUpdateIdentity({ installableRead: installableRead(), routeBinding: routeBinding(), candidateManifestDigest: candidatePackage, packageTrustSubjectDigest: trustSubject, localManagementCurrent: local, localStateManifestDigest: oldPackage });
  assert.equal(prepared.mode, 'resume_local');
  assert.equal(prepared.managementRequestId, 'm2:3');

  const receipt = committedReceipt();
  const committed = selectPackageUpdateIdentity({ installableRead: installableRead({ packageDigest: candidatePackage, highWater: 3, receipts: { 'm2:3': receipt } }), routeBinding: routeBinding(), candidateManifestDigest: candidatePackage, packageTrustSubjectDigest: trustSubject, localManagementCurrent: local, localStateManifestDigest: oldPackage });
  assert.equal(committed.mode, 'resume_committed');
  assert.equal(committed.managementRequestId, 'm2:3');
  assert.throws(() => selectPackageUpdateIdentity({ installableRead: installableRead({ packageDigest: candidatePackage, highWater: 3, receipts: { 'm2:3': { ...receipt, intentDigest: D('wrong') } } }), routeBinding: routeBinding(), candidateManifestDigest: candidatePackage, packageTrustSubjectDigest: trustSubject, localManagementCurrent: local, localStateManifestDigest: oldPackage }), { code: 'd0046_agent_local_management_conflict' });
});

test('conflicting transaction fails closed and fully finalized current candidate is a no-op', () => {
  const conflict = packageTransaction({ packageDigest: D('other-package') });
  assert.throws(() => selectPackageUpdateIdentity({ installableRead: installableRead({ transaction: conflict }), routeBinding: routeBinding(), candidateManifestDigest: candidatePackage, packageTrustSubjectDigest: trustSubject }), { code: 'd0046_agent_conflicting_management_transaction' });
  const same = selectPackageUpdateIdentity({ installableRead: installableRead({ packageDigest: candidatePackage }), routeBinding: routeBinding(), candidateManifestDigest: candidatePackage, packageTrustSubjectDigest: trustSubject, localStateManifestDigest: candidatePackage });
  assert.equal(same.mode, 'already_current');
  assert.throws(() => selectPackageUpdateIdentity({ installableRead: installableRead({ packageDigest: candidatePackage }), routeBinding: routeBinding(), candidateManifestDigest: candidatePackage, packageTrustSubjectDigest: trustSubject, localStateManifestDigest: oldPackage }), { code: 'd0046_agent_local_provider_release_mismatch' });
});

test('package request signs the canonical package proof context and preserves control config base', () => {
  const identity = selectPackageUpdateIdentity({ installableRead: installableRead(), routeBinding: routeBinding(), candidateManifestDigest: candidatePackage, packageTrustSubjectDigest: trustSubject });
  const seen = [];
  const control = controlConfigBase({ agentId: routeBinding().agentId, routeGeneration: 1, executorId: 'e', executorEpoch: 1, agentDeliveryUrl: 'wss://example.test/agent/v1', credentialRef: '/secret/ref', protocolMetadataDigest: D('protocol'), reportedCapacity: 1, profile: 'materialized', installableAgentTuple: { secret: 'ignored' } });
  const request = buildPackageUpdateRequest({ identity, routeBinding: routeBinding(), controlConfig: control, managementSigner: (context) => { seen.push(context); return { profile: 'tdev.agent-management-envelope.v1', keyId: D('key'), context, signature: 'sig' }; } });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].operation, 'package');
  assert.equal(seen[0].managementRequestId, 'm2:3');
  assert.equal(request.packageManifestDigest, candidatePackage);
  assert.equal(Object.hasOwn(request.controlConfig, 'installableAgentTuple'), false);
});

test('evidence proof binds active transaction candidate, security state and exact evidence digest', () => {
  const tx = packageTransaction();
  const read = installableRead({ transaction: tx, highWater: 3 });
  let context;
  const request = buildEvidenceProof({ type: 'positive_quiescence', evidenceDigest: D('quiescence'), installableRead: read, routeBinding: routeBinding(), evidenceSigner: (value) => { context = value; return { profile: 'tdev.installable-agent-evidence-envelope.v2', keyId: D('attestor'), context: value, signature: 'sig' }; } });
  assert.equal(request.managementRequestId, tx.managementRequestId);
  assert.equal(context.type, 'positive_quiescence');
  assert.equal(context.candidate.packageManifestDigest, candidatePackage);
  assert.equal(context.evidenceDigest, D('quiescence'));
  assert.match(context.currentSecurityDigest, /^sha256:/u);
});

test('every provider mutation RPC is fenced by exact deployment identity digest', () => {
  for (const operation of ['begin_package_activation', 'record_installable_agent_transaction_evidence', 'commit_package_activation']) {
    const input = buildQualificationRpcInput(operation, { request: { x: 1 }, expectedDeploymentIdentityDigest: deploymentIdentity });
    assert.equal(input.expectedDeploymentIdentityDigest, deploymentIdentity);
  }
  const read = buildQualificationRpcInput('read');
  assert.equal(Object.hasOwn(read, 'expectedDeploymentIdentityDigest'), false);
});

test('ambiguous begin, evidence and commit reconcile only from the same durable management identity', () => {
  const tx = packageTransaction({ readiness: { positiveQuiescence: D('q') } });
  const draining = installableRead({ transaction: tx, highWater: 3 });
  assert.equal(reconcileAmbiguousAgentMutation({ method: 'beginPackageActivation', input: { managementRequestId: 'm2:3', intentDigest: tx.intentDigest, expectedPredecessorDigest: tx.predecessorDigest }, installableRead: draining, candidateManifestDigest: candidatePackage }).phase, 'draining');
  assert.throws(() => reconcileAmbiguousAgentMutation({ method: 'beginPackageActivation', input: { managementRequestId: 'm2:3', intentDigest: D('wrong-intent'), expectedPredecessorDigest: tx.predecessorDigest }, installableRead: draining, candidateManifestDigest: candidatePackage }), { code: 'd0046_agent_update_effect_unknown' });
  assert.equal(reconcileAmbiguousAgentMutation({ method: 'recordInstallableAgentTransactionEvidence', input: { managementRequestId: 'm2:3', type: 'positive_quiescence', evidenceDigest: D('q') }, installableRead: draining, candidateManifestDigest: candidatePackage }).classification, 'exact_replay');

  const receipt = committedReceipt();
  const committed = installableRead({ packageDigest: candidatePackage, highWater: 3, receipts: { 'm2:3': receipt } });
  const committedInput = { managementRequestId: 'm2:3', intentDigest: receipt.intentDigest, expectedPredecessorDigest: receipt.predecessorDigest };
  assert.equal(reconcileAmbiguousAgentMutation({ method: 'commitPackageActivation', input: committedInput, installableRead: committed, candidateManifestDigest: candidatePackage }).phase, 'committed');
  assert.throws(() => reconcileAmbiguousAgentMutation({ method: 'commitPackageActivation', input: { ...committedInput, managementRequestId: 'm2:4' }, installableRead: committed, candidateManifestDigest: candidatePackage }), { code: 'd0046_agent_update_effect_unknown' });
  assert.throws(() => reconcileAmbiguousAgentMutation({ method: 'commitPackageActivation', input: { ...committedInput, intentDigest: D('wrong') }, installableRead: committed, candidateManifestDigest: candidatePackage }), { code: 'd0046_agent_update_effect_unknown' });
});

test('management transport never blind-replays an ambiguous provider mutation', async () => {
  const tx = packageTransaction();
  let beginCalls = 0;
  let readCalls = 0;
  const calls = [];
  const rpc = async (operation, options = {}) => {
    calls.push({ operation, options });
    if (operation === 'begin_package_activation') {
      beginCalls += 1;
      const error = new Error('lost response'); error.code = 'd0046_agent_provider_response_ambiguous'; throw error;
    }
    if (operation === 'read_installable_agent') { readCalls += 1; return installableRead({ transaction: tx, highWater: 3 }); }
    throw new Error(`unexpected ${operation}`);
  };
  const transport = createAgentManagementTransport({ rpc, expectedDeploymentIdentityDigest: deploymentIdentity, routeBinding: routeBinding(), candidateManifestDigest: candidatePackage, evidenceSigner: () => ({}) });
  const result = await transport.invoke('beginPackageActivation', { managementRequestId: 'm2:3', intentDigest: tx.intentDigest, expectedPredecessorDigest: predecessorDigest, transitionCause: 'package_update', packageManifestDigest: candidatePackage, packageTrustSubjectDigest: trustSubject, managementProof: { opaque: true } });
  assert.equal(result.phase, 'draining');
  assert.equal(beginCalls, 1);
  assert.equal(readCalls, 1);
  assert.equal(calls[0].options.expectedDeploymentIdentityDigest, deploymentIdentity);
});
