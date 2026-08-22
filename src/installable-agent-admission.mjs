import {
  ContractError,
  assertDigest,
  assertIdentifier,
  assertRecordShape,
  assertSafeInteger,
  canonicalClone,
  canonicalJson,
  createRecord,
  deepFreeze,
  isPlainRecord,
  typedDigest,
} from './canonical.mjs';

export const INSTALLABLE_AGENT_ADMISSION_PROFILE = 'tdev.installable-agent-admission.v1';
export const INSTALLABLE_AGENT_MANAGEMENT_PROOF_DOMAIN = 'tdev.agent-management.v1';
export const INSTALLABLE_AGENT_EVIDENCE_DOMAIN = 'tdev.installable-agent-evidence.v1';
export const INSTALLABLE_AGENT_DATA_PLANE_TUPLE_DOMAIN = 'tdev.installable-agent-data-plane-tuple.v1';

const ROUTE_STATES = new Set(['LEGACY_D0020_ONLY', 'UNREGISTERED', 'GENESIS_PENDING', 'CURRENT']);
const LIFECYCLE_DISPOSITIONS = new Set(['active', 'draining', 'revoked']);
const TRUST_DISPOSITIONS = new Set(['active', 'retired', 'revoked']);
const AUTHORITY_DISPOSITIONS = new Set(['active', 'revoked']);
const GENESIS_EVIDENCE_TYPES = new Set([
  'bootstrap_trust',
  'package_verified',
  'verifier_ready',
  'local_ready',
  'local_service_ready',
  'positive_quiescence',
  'service_stopped',
  'clone_safe_activation',
]);
const POSITIVE_QUIESCENCE_PROOF_CLASSES = new Set([
  'original_live_owner',
  'same_host_same_boot_whole_domain_absence',
  'same_host_reboot',
]);

function fail(code, message, details = undefined) {
  throw new ContractError(code, message, details);
}

function exactRecord(value, required, optional, label) {
  assertRecordShape(value, required, optional, label);
  return value;
}

function boundedIdentifier(value, label, limits) {
  assertIdentifier(value, label);
  if (new TextEncoder().encode(value).byteLength > limits.maxIdentifierBytes) {
    fail('installable_agent_limit', `${label} exceeds its byte limit`, { maxIdentifierBytes: limits.maxIdentifierBytes });
  }
  return value;
}

function positiveGeneration(value, label) {
  assertSafeInteger(value, label, { min: 1 });
  return value;
}

function nonnegativeGeneration(value, label) {
  assertSafeInteger(value, label, { min: 0 });
  return value;
}

function normalizeTrustSubjects(subjects, limits) {
  if (!isPlainRecord(subjects)) fail('invalid_installable_agent_trust', 'trustSubjects must be a record');
  const keys = Object.keys(subjects);
  if (keys.length === 0 || keys.length > limits.maxTrustSubjects) {
    fail('installable_agent_limit', 'trustSubjects is empty or exceeds its bound', { maxTrustSubjects: limits.maxTrustSubjects });
  }
  const normalized = createRecord();
  for (const key of keys.sort()) {
    assertDigest(key, 'trust subject digest');
    const disposition = subjects[key];
    if (!TRUST_DISPOSITIONS.has(disposition)) fail('invalid_installable_agent_trust', 'Unsupported trust disposition');
    normalized[key] = disposition;
  }
  return normalized;
}

export function normalizeInstallableAgentDataPlaneTuple(tuple) {
  exactRecord(tuple, [
    'installationGeneration', 'credentialGeneration', 'packageActivationGeneration', 'packageManifestDigest',
    'trustPolicyGeneration', 'trustStateDigest', 'lifecycleGeneration',
  ], [], 'installable Agent data-plane tuple');
  for (const field of ['installationGeneration', 'credentialGeneration', 'packageActivationGeneration', 'trustPolicyGeneration', 'lifecycleGeneration']) {
    positiveGeneration(tuple[field], `installableAgentTuple.${field}`);
  }
  assertDigest(tuple.packageManifestDigest, 'installableAgentTuple.packageManifestDigest');
  assertDigest(tuple.trustStateDigest, 'installableAgentTuple.trustStateDigest');
  return canonicalClone(tuple);
}

function normalizeCurrent(current, limits) {
  exactRecord(current, [
    'installationGeneration', 'installationDisposition', 'credentialGeneration', 'credentialDisposition',
    'packageActivationGeneration', 'packageDisposition', 'packageManifestDigest', 'packageTrustSubjectDigest',
    'trustPolicyGeneration', 'trustStateDigest', 'trustSubjects', 'trustContinuesCurrentPackage',
    'lifecycleGeneration', 'lifecycleDisposition', 'lifecycleCause', 'restartEligible', 'restartEligibleStopRequestId',
    'transitionReceiptDigest', 'managementTransaction',
  ], [], 'installable Agent current tuple');
  for (const field of ['installationGeneration', 'credentialGeneration', 'packageActivationGeneration', 'trustPolicyGeneration', 'lifecycleGeneration']) {
    positiveGeneration(current[field], `installableAgent.current.${field}`);
  }
  if (!AUTHORITY_DISPOSITIONS.has(current.installationDisposition) || !AUTHORITY_DISPOSITIONS.has(current.credentialDisposition) ||
      !AUTHORITY_DISPOSITIONS.has(current.packageDisposition)) {
    fail('invalid_installable_agent_state', 'Current authority disposition is invalid');
  }
  assertDigest(current.packageManifestDigest, 'installableAgent.current.packageManifestDigest');
  assertDigest(current.packageTrustSubjectDigest, 'installableAgent.current.packageTrustSubjectDigest');
  assertDigest(current.trustStateDigest, 'installableAgent.current.trustStateDigest');
  current.trustSubjects = normalizeTrustSubjects(current.trustSubjects, limits);
  if (typeof current.trustContinuesCurrentPackage !== 'boolean') fail('invalid_installable_agent_state', 'trustContinuesCurrentPackage must be boolean');
  if (!LIFECYCLE_DISPOSITIONS.has(current.lifecycleDisposition)) fail('invalid_installable_agent_state', 'Lifecycle disposition is invalid');
  boundedIdentifier(current.lifecycleCause, 'installableAgent.current.lifecycleCause', limits);
  if (typeof current.restartEligible !== 'boolean') fail('invalid_installable_agent_state', 'restartEligible must be boolean');
  if (current.restartEligibleStopRequestId !== null) boundedIdentifier(current.restartEligibleStopRequestId, 'restartEligibleStopRequestId', limits);
  assertDigest(current.transitionReceiptDigest, 'installableAgent.current.transitionReceiptDigest');
  if (current.managementTransaction !== null) {
    exactRecord(current.managementTransaction, [
      'type', 'managementRequestId', 'intentDigest', 'predecessorDigest', 'phase', 'candidate', 'readiness',
    ], [], 'installable Agent management transaction');
    boundedIdentifier(current.managementTransaction.type, 'managementTransaction.type', limits);
    boundedIdentifier(current.managementTransaction.managementRequestId, 'managementTransaction.managementRequestId', limits);
    assertDigest(current.managementTransaction.intentDigest, 'managementTransaction.intentDigest');
    assertDigest(current.managementTransaction.predecessorDigest, 'managementTransaction.predecessorDigest');
    boundedIdentifier(current.managementTransaction.phase, 'managementTransaction.phase', limits);
    if (!isPlainRecord(current.managementTransaction.candidate) || !isPlainRecord(current.managementTransaction.readiness)) {
      fail('invalid_installable_agent_state', 'Management transaction candidate/readiness must be records');
    }
  }
  return current;
}

function normalizePending(pending, limits) {
  exactRecord(pending, [
    'genesisGeneration', 'managementRequestId', 'intentDigest', 'unregisteredPredecessorDigest', 'pendingDigest',
    'candidate', 'readiness', 'legacyPredecessors',
  ], [], 'installable Agent genesis pending');
  positiveGeneration(pending.genesisGeneration, 'pending.genesisGeneration');
  boundedIdentifier(pending.managementRequestId, 'pending.managementRequestId', limits);
  assertDigest(pending.intentDigest, 'pending.intentDigest');
  assertDigest(pending.unregisteredPredecessorDigest, 'pending.unregisteredPredecessorDigest');
  assertDigest(pending.pendingDigest, 'pending.pendingDigest');
  exactRecord(pending.candidate, [
    'installationGeneration', 'credentialGeneration', 'credentialProvisioningId', 'packageActivationGeneration',
    'packageManifestDigest', 'packageTrustSubjectDigest', 'trustPolicyGeneration', 'trustStateDigest', 'trustSubjects',
    'lifecycleGeneration',
  ], [], 'installable Agent genesis candidate');
  for (const field of ['installationGeneration', 'credentialGeneration', 'packageActivationGeneration', 'trustPolicyGeneration', 'lifecycleGeneration']) {
    positiveGeneration(pending.candidate[field], `pending.candidate.${field}`);
  }
  boundedIdentifier(pending.candidate.credentialProvisioningId, 'pending.candidate.credentialProvisioningId', limits);
  assertDigest(pending.candidate.packageManifestDigest, 'pending.candidate.packageManifestDigest');
  assertDigest(pending.candidate.packageTrustSubjectDigest, 'pending.candidate.packageTrustSubjectDigest');
  assertDigest(pending.candidate.trustStateDigest, 'pending.candidate.trustStateDigest');
  pending.candidate.trustSubjects = normalizeTrustSubjects(pending.candidate.trustSubjects, limits);
  exactRecord(pending.readiness, [
    'bootstrapTrust', 'packageVerified', 'verifierReady', 'localReady', 'localServiceReady', 'predecessorQuiescence',
  ], [], 'installable Agent genesis readiness');
  for (const field of ['bootstrapTrust', 'packageVerified', 'verifierReady', 'localReady', 'localServiceReady']) {
    if (pending.readiness[field] !== null) assertDigest(pending.readiness[field], `pending.readiness.${field}`);
  }
  if (typeof pending.readiness.predecessorQuiescence !== 'boolean') {
    fail('invalid_installable_agent_state', 'predecessorQuiescence readiness must be boolean');
  }
  if (!Array.isArray(pending.legacyPredecessors) || pending.legacyPredecessors.length > limits.maxPredecessorQuiescenceReceipts) {
    fail('installable_agent_limit', 'Legacy predecessor locator set is invalid or unbounded');
  }
  for (const locator of pending.legacyPredecessors) {
    exactRecord(locator, ['deliveryId', 'executorId', 'executorEpoch', 'evidenceRevision', 'evidenceDigest', 'resolved'], [], 'legacy D0020 predecessor locator');
    assertDigest(locator.deliveryId, 'legacy predecessor deliveryId');
    boundedIdentifier(locator.executorId, 'legacy predecessor executorId', limits);
    positiveGeneration(locator.executorEpoch, 'legacy predecessor executorEpoch');
    nonnegativeGeneration(locator.evidenceRevision, 'legacy predecessor evidenceRevision');
    if (locator.evidenceDigest !== null) assertDigest(locator.evidenceDigest, 'legacy predecessor evidenceDigest');
    if (typeof locator.resolved !== 'boolean') fail('invalid_installable_agent_state', 'legacy predecessor resolved must be boolean');
  }
  return pending;
}

function normalizeManagementMaps(state, limits) {
  if (!isPlainRecord(state.managementReceipts) || Object.keys(state.managementReceipts).length > limits.maxManagementReceipts) {
    fail('installable_agent_limit', 'Management receipt state is invalid or unbounded');
  }
  for (const [requestId, receipt] of Object.entries(state.managementReceipts)) {
    boundedIdentifier(requestId, 'managementRequestId', limits);
    exactRecord(receipt, [
      'operation', 'managementRequestId', 'intentDigest', 'predecessorDigest', 'resultDigest', 'result',
    ], [], 'installable Agent management receipt');
    if (receipt.managementRequestId !== requestId) fail('invalid_installable_agent_state', 'Management receipt map identity mismatch');
    boundedIdentifier(receipt.operation, 'management receipt operation', limits);
    assertDigest(receipt.intentDigest, 'management receipt intentDigest');
    assertDigest(receipt.predecessorDigest, 'management receipt predecessorDigest');
    assertDigest(receipt.resultDigest, 'management receipt resultDigest');
    if (typedDigest('tdev.installable-agent-management-result.v1', receipt.result) !== receipt.resultDigest) {
      fail('invalid_installable_agent_state', 'Management receipt result digest mismatch');
    }
  }
  if (!isPlainRecord(state.managementTombstones) || Object.keys(state.managementTombstones).length > limits.maxManagementTombstones) {
    fail('installable_agent_limit', 'Management tombstone state is invalid or unbounded');
  }
  for (const [requestId, tombstone] of Object.entries(state.managementTombstones)) {
    boundedIdentifier(requestId, 'management tombstone request id', limits);
    exactRecord(tombstone, ['operation', 'intentDigest', 'predecessorDigest', 'resultDigest'], [], 'installable Agent management tombstone');
    boundedIdentifier(tombstone.operation, 'management tombstone operation', limits);
    for (const field of ['intentDigest', 'predecessorDigest', 'resultDigest']) assertDigest(tombstone[field], `management tombstone ${field}`);
  }
  if (!isPlainRecord(state.predecessorQuiescenceReceipts) || Object.keys(state.predecessorQuiescenceReceipts).length > limits.maxPredecessorQuiescenceReceipts) {
    fail('installable_agent_limit', 'Predecessor-quiescence receipt state is invalid or unbounded');
  }
  for (const [deliveryId, receipt] of Object.entries(state.predecessorQuiescenceReceipts)) {
    assertDigest(deliveryId, 'predecessor quiescence deliveryId');
    exactRecord(receipt, [
      'deliveryId', 'executorId', 'executorEpoch', 'evidenceRevision', 'evidenceDigest', 'proofClass', 'receiptDigest',
    ], [], 'predecessor quiescence receipt');
    if (receipt.deliveryId !== deliveryId) fail('invalid_installable_agent_state', 'Predecessor receipt map identity mismatch');
    boundedIdentifier(receipt.executorId, 'predecessor receipt executorId', limits);
    positiveGeneration(receipt.executorEpoch, 'predecessor receipt executorEpoch');
    nonnegativeGeneration(receipt.evidenceRevision, 'predecessor receipt evidenceRevision');
    if (receipt.evidenceDigest !== null) assertDigest(receipt.evidenceDigest, 'predecessor receipt evidenceDigest');
    if (!POSITIVE_QUIESCENCE_PROOF_CLASSES.has(receipt.proofClass)) fail('invalid_installable_agent_state', 'Unsupported predecessor proof class');
    assertDigest(receipt.receiptDigest, 'predecessor receipt digest');
  }
}

export function createLegacyInstallableAgentState() {
  return {
    profile: INSTALLABLE_AGENT_ADMISSION_PROFILE,
    state: 'LEGACY_D0020_ONLY',
  };
}

export function createUnregisteredInstallableAgentState() {
  return {
    profile: INSTALLABLE_AGENT_ADMISSION_PROFILE,
    state: 'UNREGISTERED',
    everCurrent: false,
    genesisGenerationHighWater: 0,
    installationGenerationHighWater: 0,
    credentialGenerationHighWater: 0,
    packageActivationGenerationHighWater: 0,
    trustPolicyGenerationHighWater: 0,
    lifecycleGenerationHighWater: 0,
    managementReceipts: createRecord(),
    managementTombstones: createRecord(),
    predecessorQuiescenceReceipts: createRecord(),
    pending: null,
    current: null,
  };
}

export function normalizeInstallableAgentState(value, limits) {
  if (!isPlainRecord(value)) fail('invalid_installable_agent_state', 'Installable Agent state must be a record');
  if (value.state === 'LEGACY_D0020_ONLY') {
    exactRecord(value, ['profile', 'state'], [], 'legacy installable Agent state');
    if (value.profile !== INSTALLABLE_AGENT_ADMISSION_PROFILE) fail('invalid_installable_agent_state', 'Installable Agent profile mismatch');
    return value;
  }
  exactRecord(value, [
    'profile', 'state', 'everCurrent', 'genesisGenerationHighWater', 'installationGenerationHighWater',
    'credentialGenerationHighWater', 'packageActivationGenerationHighWater', 'trustPolicyGenerationHighWater',
    'lifecycleGenerationHighWater', 'managementReceipts', 'managementTombstones', 'predecessorQuiescenceReceipts',
    'pending', 'current',
  ], [], 'installable Agent state');
  if (value.profile !== INSTALLABLE_AGENT_ADMISSION_PROFILE || !ROUTE_STATES.has(value.state) || value.state === 'LEGACY_D0020_ONLY') {
    fail('invalid_installable_agent_state', 'Installable Agent route state/profile is invalid');
  }
  if (typeof value.everCurrent !== 'boolean') fail('invalid_installable_agent_state', 'everCurrent must be boolean');
  for (const field of [
    'genesisGenerationHighWater', 'installationGenerationHighWater', 'credentialGenerationHighWater',
    'packageActivationGenerationHighWater', 'trustPolicyGenerationHighWater', 'lifecycleGenerationHighWater',
  ]) nonnegativeGeneration(value[field], `installableAgent.${field}`);
  normalizeManagementMaps(value, limits);
  if (value.state === 'UNREGISTERED') {
    if (value.everCurrent || value.pending !== null || value.current !== null) {
      fail('invalid_installable_agent_state', 'UNREGISTERED cannot contain current/pending authority or everCurrent');
    }
  } else if (value.state === 'GENESIS_PENDING') {
    if (value.everCurrent || value.current !== null || value.pending === null) {
      fail('invalid_installable_agent_state', 'GENESIS_PENDING shape is invalid');
    }
    normalizePending(value.pending, limits);
  } else if (value.state === 'CURRENT') {
    if (!value.everCurrent || value.pending !== null || value.current === null) {
      fail('invalid_installable_agent_state', 'CURRENT shape is invalid');
    }
    normalizeCurrent(value.current, limits);
  }
  const generations = value.state === 'GENESIS_PENDING' ? value.pending.candidate : value.state === 'CURRENT' ? value.current : null;
  if (generations !== null) {
    const pairs = [
      ['installationGeneration', 'installationGenerationHighWater'],
      ['credentialGeneration', 'credentialGenerationHighWater'],
      ['packageActivationGeneration', 'packageActivationGenerationHighWater'],
      ['trustPolicyGeneration', 'trustPolicyGenerationHighWater'],
      ['lifecycleGeneration', 'lifecycleGenerationHighWater'],
    ];
    for (const [generationField, highWaterField] of pairs) {
      if (generations[generationField] > value[highWaterField]) fail('invalid_installable_agent_state', `${generationField} exceeds its high-water`);
    }
  }
  if (value.pending !== null && value.pending.genesisGeneration > value.genesisGenerationHighWater) {
    fail('invalid_installable_agent_state', 'genesisGeneration exceeds its high-water');
  }
  return value;
}

export function installableAgentPredecessorView(value) {
  if (value.state === 'LEGACY_D0020_ONLY') return { profile: value.profile, state: value.state };
  return {
    profile: value.profile,
    state: value.state,
    everCurrent: value.everCurrent,
    genesisGenerationHighWater: value.genesisGenerationHighWater,
    installationGenerationHighWater: value.installationGenerationHighWater,
    credentialGenerationHighWater: value.credentialGenerationHighWater,
    packageActivationGenerationHighWater: value.packageActivationGenerationHighWater,
    trustPolicyGenerationHighWater: value.trustPolicyGenerationHighWater,
    lifecycleGenerationHighWater: value.lifecycleGenerationHighWater,
    pending: value.pending,
    current: value.current,
  };
}

export function installableAgentPredecessorDigest(value) {
  return typedDigest('tdev.installable-agent-predecessor.v1', installableAgentPredecessorView(value));
}

export function installableAgentPendingDigest({ routeBinding, managementRequestId, intentDigest, candidate, legacyPredecessors }) {
  return typedDigest('tdev.installable-agent-genesis-pending.v1', {
    agentId: routeBinding.agentId,
    routeGeneration: routeBinding.routeGeneration,
    managementRequestId,
    intentDigest,
    candidate,
    legacyPredecessors,
  });
}

export function installableAgentCurrentTuple(value, { executable = true } = {}) {
  if (value.state !== 'CURRENT' || value.current === null) {
    if (executable) fail('installable_agent_not_current', 'Installable Agent has no current executable tuple');
    return null;
  }
  const current = value.current;
  const packageTrustDisposition = current.trustSubjects[current.packageTrustSubjectDigest];
  const trustAllowsCurrent = packageTrustDisposition === 'active' ||
    (packageTrustDisposition === 'retired' && current.trustContinuesCurrentPackage);
  if (executable && (
    current.installationDisposition !== 'active' || current.credentialDisposition !== 'active' || current.packageDisposition !== 'active' ||
    current.lifecycleDisposition !== 'active' || !trustAllowsCurrent
  )) {
    fail('installable_agent_not_executable', 'Current installable Agent tuple is fenced from executable authority');
  }
  return deepFreeze(normalizeInstallableAgentDataPlaneTuple({
    installationGeneration: current.installationGeneration,
    credentialGeneration: current.credentialGeneration,
    packageActivationGeneration: current.packageActivationGeneration,
    packageManifestDigest: current.packageManifestDigest,
    trustPolicyGeneration: current.trustPolicyGeneration,
    trustStateDigest: current.trustStateDigest,
    lifecycleGeneration: current.lifecycleGeneration,
  }));
}

export function assertInstallableAgentDataPlaneTuple(value, supplied, { allowLegacy = true } = {}) {
  if (value.state === 'LEGACY_D0020_ONLY') {
    if (!allowLegacy) fail('installable_agent_migration_required', 'Route remains D0020-only and is not D0027 current');
    if (supplied !== undefined && supplied !== null) fail('installable_agent_tuple_conflict', 'Legacy D0020 route cannot accept a D0027 tuple');
    return null;
  }
  const expected = installableAgentCurrentTuple(value, { executable: true });
  if (supplied === undefined || supplied === null) fail('installable_agent_tuple_required', 'D0027-aware route requires its exact current tuple');
  const actual = normalizeInstallableAgentDataPlaneTuple(supplied);
  if (canonicalJson(actual) !== canonicalJson(expected)) fail('stale_installable_agent_fence', 'Installable Agent data-plane tuple is stale');
  return expected;
}

export function managementRequestReplay(value, input, operation, limits) {
  boundedIdentifier(input.managementRequestId, 'managementRequestId', limits);
  assertDigest(input.intentDigest, 'intentDigest');
  assertDigest(input.expectedPredecessorDigest, 'expectedPredecessorDigest');
  const receipt = value.managementReceipts[input.managementRequestId];
  if (receipt !== undefined) {
    if (receipt.operation !== operation || receipt.intentDigest !== input.intentDigest || receipt.predecessorDigest !== input.expectedPredecessorDigest) {
      fail('management_request_conflict', 'Management request identity was reused with changed operation, intent or predecessor');
    }
    return deepFreeze({ classification: 'exact_replay', result: canonicalClone(receipt.result) });
  }
  const tombstone = value.managementTombstones[input.managementRequestId];
  if (tombstone !== undefined) {
    if (tombstone.operation !== operation || tombstone.intentDigest !== input.intentDigest || tombstone.predecessorDigest !== input.expectedPredecessorDigest) {
      fail('management_request_conflict', 'Retired management request identity was reused with changed operation, intent or predecessor');
    }
    fail('management_request_retired', 'Management request detail was safely compacted and cannot create new authority');
  }
  if (installableAgentPredecessorDigest(value) !== input.expectedPredecessorDigest) {
    fail('management_predecessor_conflict', 'Management request predecessor is stale');
  }
  if (Object.keys(value.managementReceipts).length >= limits.maxManagementReceipts) {
    fail('management_replay_capacity', 'Management receipt bound is full; compact safely before accepting new authority');
  }
  return null;
}

export function recordManagementResult(value, input, operation, result) {
  const resultDigest = typedDigest('tdev.installable-agent-management-result.v1', result);
  value.managementReceipts[input.managementRequestId] = {
    operation,
    managementRequestId: input.managementRequestId,
    intentDigest: input.intentDigest,
    predecessorDigest: input.expectedPredecessorDigest,
    resultDigest,
    result: canonicalClone(result),
  };
  return resultDigest;
}

export function updateManagementResult(value, managementRequestId, result) {
  const receipt = value.managementReceipts[managementRequestId];
  if (!receipt) fail('unknown_management_request', 'Management request receipt is missing');
  receipt.result = canonicalClone(result);
  receipt.resultDigest = typedDigest('tdev.installable-agent-management-result.v1', result);
  return receipt.resultDigest;
}

export function compactManagementReceipts(value, requestIds, limits) {
  if (!Array.isArray(requestIds) || requestIds.length === 0) fail('invalid_management_compaction', 'requestIds must be a non-empty array');
  const unique = [...new Set(requestIds)];
  if (Object.keys(value.managementTombstones).length + unique.length > limits.maxManagementTombstones) {
    fail('management_replay_capacity', 'Management tombstone bound cannot preserve non-reuse; compaction fails closed');
  }
  for (const requestId of unique) {
    boundedIdentifier(requestId, 'management compaction request id', limits);
    const receipt = value.managementReceipts[requestId];
    if (!receipt) fail('unknown_management_request', 'Cannot compact an unknown management request');
    value.managementTombstones[requestId] = {
      operation: receipt.operation,
      intentDigest: receipt.intentDigest,
      predecessorDigest: receipt.predecessorDigest,
      resultDigest: receipt.resultDigest,
    };
    delete value.managementReceipts[requestId];
  }
}

export function normalizeGenesisEvidenceType(type) {
  if (!GENESIS_EVIDENCE_TYPES.has(type)) fail('invalid_genesis_evidence', 'Unsupported genesis evidence type');
  return type;
}

export function normalizePositiveQuiescenceProofClass(proofClass) {
  if (!POSITIVE_QUIESCENCE_PROOF_CLASSES.has(proofClass)) fail('invalid_predecessor_quiescence_proof', 'Unsupported positive quiescence proof class');
  return proofClass;
}

export function computeInstallableAgentManagementIntentDigest(operation, routeBinding, content) {
  assertIdentifier(operation, 'management operation');
  return typedDigest('tdev.agent-management-intent.v1', {
    operation,
    agentId: routeBinding.agentId,
    routeGeneration: routeBinding.routeGeneration,
    content: canonicalClone(content),
  });
}

export function managementProofContext(operation, routeBinding, input, predecessorDigest) {
  return deepFreeze({
    domain: INSTALLABLE_AGENT_MANAGEMENT_PROOF_DOMAIN,
    operation,
    agentId: routeBinding.agentId,
    routeGeneration: routeBinding.routeGeneration,
    managementRequestId: input.managementRequestId,
    intentDigest: input.intentDigest,
    expectedPredecessorDigest: predecessorDigest,
  });
}

export function evidenceProofContext(type, routeBinding, details) {
  return deepFreeze({
    domain: INSTALLABLE_AGENT_EVIDENCE_DOMAIN,
    type,
    agentId: routeBinding.agentId,
    routeGeneration: routeBinding.routeGeneration,
    ...canonicalClone(details),
  });
}

export function currentTupleDigest(value) {
  const tuple = installableAgentCurrentTuple(value, { executable: false });
  return tuple === null ? null : typedDigest(INSTALLABLE_AGENT_DATA_PLANE_TUPLE_DOMAIN, tuple);
}

export function installableAgentSecurityStateDigest(value) {
  if (value.state !== 'CURRENT' || value.current === null) return null;
  const current = canonicalClone(value.current);
  current.managementTransaction = null;
  return typedDigest('tdev.installable-agent-current-security-state.v1', current);
}
