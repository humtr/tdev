import {
  ContractError,
  assertDigest,
  assertIdentifier,
  assertRecordShape,
  assertSafeInteger,
  canonicalClone,
  canonicalJson,
  digest,
  typedDigest,
} from './canonical.mjs';
import {
  normalizeEd25519PublicJwk,
  verifyEd25519SignedRecord,
} from './installable-agent-security.mjs';

export const AGENT_ROUTE_ELECTION_PROFILE = 'tdev.agent-route-election.v1';
export const AGENT_ROUTE_RECOVERY_KEY_DOMAIN = 'tdev.agent-route-recovery-public-key.v1';
export const AGENT_ROUTE_ELECTION_ATTACHMENT_PROFILE = 'tdev.agent-route-election-attachment.v1';
export const AGENT_ROUTE_HOST_PROFILE = 'tdev.agent-route-host.v1';
export const AGENT_ROUTE_ELECTION_GENESIS_PROFILE = 'tdev.agent-route-election-genesis.v1';
export const AGENT_ROUTE_ELECTION_IMPORT_PROFILE = 'tdev.agent-route-election-import.v1';
export const AGENT_ROUTE_CUTOVER_PROFILE = 'tdev.agent-route-cutover.v1';
export const AGENT_ROUTE_ACTIVATION_RECEIPT_PROFILE = 'tdev.agent-route-activation-receipt.v1';
export const AGENT_ROUTE_LEGACY_HOST_PROFILE = 'legacy_agent_id_v1';
export const AGENT_ROUTE_GENERATION_HOST_PROFILE = 'generation_key_v1';

const CUTOVER_REASONS = new Set([
  'planned_retirement',
  'management_key_loss',
  'management_key_compromise',
  'release_root_compromise',
  'route_object_loss_or_corruption',
]);
const ACTIVE_CUTOVER_PHASES = new Set(['PREPARED', 'PREDECESSOR_EXCLUDED', 'SUCCESSOR_STANDBY', 'READY_TO_COMMIT']);
const RECEIPT_KINDS = new Set(['genesis', 'import', 'cutover']);
const DEFAULT_MAX_RECENT_RECEIPTS = 32;

function fail(code, message, details = undefined) {
  throw new ContractError(code, message, details);
}

function exactRecord(value, required, optional, label) {
  assertRecordShape(value, required, optional, label);
  return value;
}

function normalizedRecoveryPublicKey(publicJwk) {
  return normalizeEd25519PublicJwk(publicJwk, 'route-recovery public JWK');
}

export function agentRouteRecoveryKeyId(publicJwk) {
  return typedDigest(AGENT_ROUTE_RECOVERY_KEY_DOMAIN, normalizedRecoveryPublicKey(publicJwk));
}

function normalizeRouteHostFields({ agentId, routeGeneration, routeHostProfile, routeHostKey }, label) {
  assertIdentifier(agentId, `${label}.agentId`);
  assertSafeInteger(routeGeneration, `${label}.routeGeneration`, { min: 1 });
  if (![AGENT_ROUTE_LEGACY_HOST_PROFILE, AGENT_ROUTE_GENERATION_HOST_PROFILE].includes(routeHostProfile)) {
    fail('invalid_agent_route_host_profile', `${label}.routeHostProfile is unsupported`);
  }
  if (typeof routeHostKey !== 'string' || routeHostKey.length === 0 || routeHostKey.includes('\0')) {
    fail('invalid_agent_route_host_key', `${label}.routeHostKey is invalid`);
  }
  if (routeHostProfile === AGENT_ROUTE_LEGACY_HOST_PROFILE) {
    if (routeGeneration !== 1 || routeHostKey !== agentId) {
      fail('agent_route_legacy_host_mismatch', 'Legacy route hosting is allowed only for exact imported generation 1 under host key agentId');
    }
  } else if (routeHostKey !== agentRouteHostKey({ agentId, routeGeneration })) {
    fail('agent_route_generation_host_mismatch', 'Generation-bound route host key does not match agentId + routeGeneration');
  }
  return Object.freeze({ agentId, routeGeneration, routeHostProfile, routeHostKey });
}

export function normalizeAgentRouteHostIdentity(input) {
  exactRecord(input, ['profile', 'agentId', 'routeGeneration'], [], 'agent route host identity');
  if (input.profile !== AGENT_ROUTE_HOST_PROFILE) fail('invalid_agent_route_host_profile', 'Agent route host identity profile is unsupported');
  assertIdentifier(input.agentId, 'routeHost.agentId');
  assertSafeInteger(input.routeGeneration, 'routeHost.routeGeneration', { min: 1 });
  return Object.freeze(canonicalClone(input));
}

export function agentRouteHostKey(input) {
  const normalized = normalizeAgentRouteHostIdentity({ profile: AGENT_ROUTE_HOST_PROFILE, ...input });
  const suffix = typedDigest(AGENT_ROUTE_HOST_PROFILE, {
    agentId: normalized.agentId,
    routeGeneration: normalized.routeGeneration,
  }).slice('sha256:'.length);
  return `rh1.${suffix}`;
}

export function normalizeAgentRouteElectionAttachment(input) {
  exactRecord(input, [
    'profile', 'agentId', 'routeGeneration', 'routeBindingDigest', 'routeHostProfile', 'routeHostKey',
    'electionAuthorityIdentity', 'recoveryKeyId', 'recoveryPublicKey',
  ], [], 'agent route election attachment');
  if (input.profile !== AGENT_ROUTE_ELECTION_ATTACHMENT_PROFILE) fail('invalid_agent_route_election_attachment', 'Agent route election attachment profile is unsupported');
  const host = normalizeRouteHostFields(input, 'attachment');
  assertDigest(input.routeBindingDigest, 'attachment.routeBindingDigest');
  assertDigest(input.electionAuthorityIdentity, 'attachment.electionAuthorityIdentity');
  const recoveryPublicKey = normalizedRecoveryPublicKey(input.recoveryPublicKey);
  const recoveryKeyId = agentRouteRecoveryKeyId(recoveryPublicKey);
  if (input.recoveryKeyId !== recoveryKeyId) fail('agent_route_recovery_key_mismatch', 'Election attachment recovery key ID does not match its public key');
  return Object.freeze(canonicalClone({
    profile: AGENT_ROUTE_ELECTION_ATTACHMENT_PROFILE,
    ...host,
    routeBindingDigest: input.routeBindingDigest,
    electionAuthorityIdentity: input.electionAuthorityIdentity,
    recoveryKeyId,
    recoveryPublicKey,
  }));
}

export function agentRouteElectionAttachmentDigest(input) {
  return digest(normalizeAgentRouteElectionAttachment(input));
}

export function parseAgentRouteCutoverRequestId(value) {
  if (typeof value !== 'string' || !/^rc1:[1-9][0-9]*$/.test(value)) {
    fail('invalid_agent_route_cutover_request_id', 'Cutover request ID must use canonical rc1:<positive sequence>');
  }
  const sequence = Number(value.slice('rc1:'.length));
  if (!Number.isSafeInteger(sequence) || sequence < 1 || `rc1:${sequence}` !== value) {
    fail('invalid_agent_route_cutover_request_id', 'Cutover request sequence is outside the canonical safe-integer range');
  }
  return sequence;
}

function normalizeRecoveryFields(input, label) {
  const recoveryPublicKey = normalizedRecoveryPublicKey(input.recoveryPublicKey);
  const recoveryKeyId = agentRouteRecoveryKeyId(recoveryPublicKey);
  if (input.recoveryKeyId !== recoveryKeyId) fail('agent_route_recovery_key_mismatch', `${label} recovery key ID does not match its public key`);
  return { recoveryKeyId, recoveryPublicKey };
}

export function normalizeAgentRouteElectionGenesis(input) {
  exactRecord(input, [
    'profile', 'agentId', 'routeGeneration', 'routeBindingDigest', 'routeHostProfile', 'routeHostKey',
    'electionAuthorityIdentity', 'recoveryKeyId', 'recoveryPublicKey', 'standbyRouteDigest', 'genesisNonce',
  ], [], 'agent route election genesis');
  if (input.profile !== AGENT_ROUTE_ELECTION_GENESIS_PROFILE) fail('invalid_agent_route_election_genesis', 'Agent route election genesis profile is unsupported');
  if (input.routeGeneration !== 1 || input.routeHostProfile !== AGENT_ROUTE_GENERATION_HOST_PROFILE) {
    fail('agent_route_election_genesis_generation', 'Fresh elected-route genesis must use generation 1 with generation-bound hosting');
  }
  const host = normalizeRouteHostFields(input, 'genesis');
  assertDigest(input.routeBindingDigest, 'genesis.routeBindingDigest');
  assertDigest(input.electionAuthorityIdentity, 'genesis.electionAuthorityIdentity');
  assertDigest(input.standbyRouteDigest, 'genesis.standbyRouteDigest');
  assertDigest(input.genesisNonce, 'genesis.genesisNonce');
  const recovery = normalizeRecoveryFields(input, 'genesis');
  return Object.freeze(canonicalClone({
    profile: AGENT_ROUTE_ELECTION_GENESIS_PROFILE,
    ...host,
    routeBindingDigest: input.routeBindingDigest,
    electionAuthorityIdentity: input.electionAuthorityIdentity,
    ...recovery,
    standbyRouteDigest: input.standbyRouteDigest,
    genesisNonce: input.genesisNonce,
  }));
}

export function normalizeAgentRouteElectionImport(input) {
  exactRecord(input, [
    'profile', 'agentId', 'routeGeneration', 'routeBindingDigest', 'routeHostProfile', 'routeHostKey',
    'currentRouteStateDigest', 'electionAuthorityIdentity', 'recoveryKeyId', 'recoveryPublicKey',
  ], [], 'agent route election import');
  if (input.profile !== AGENT_ROUTE_ELECTION_IMPORT_PROFILE) fail('invalid_agent_route_election_import', 'Agent route election import profile is unsupported');
  if (input.routeGeneration !== 1 || input.routeHostProfile !== AGENT_ROUTE_LEGACY_HOST_PROFILE) {
    fail('agent_route_election_import_generation', 'Legacy import is limited to exact generation 1 legacy hosting');
  }
  const host = normalizeRouteHostFields(input, 'import');
  assertDigest(input.routeBindingDigest, 'import.routeBindingDigest');
  assertDigest(input.currentRouteStateDigest, 'import.currentRouteStateDigest');
  assertDigest(input.electionAuthorityIdentity, 'import.electionAuthorityIdentity');
  const recovery = normalizeRecoveryFields(input, 'import');
  return Object.freeze(canonicalClone({
    profile: AGENT_ROUTE_ELECTION_IMPORT_PROFILE,
    ...host,
    routeBindingDigest: input.routeBindingDigest,
    currentRouteStateDigest: input.currentRouteStateDigest,
    electionAuthorityIdentity: input.electionAuthorityIdentity,
    ...recovery,
  }));
}

function normalizeCutoverRoute(input, prefix, agentId) {
  const routeGeneration = input[`${prefix}RouteGeneration`];
  const routeBindingDigest = input[`${prefix}RouteBindingDigest`];
  const routeHostProfile = input[`${prefix}RouteHostProfile`];
  const routeHostKey = input[`${prefix}RouteHostKey`];
  const host = normalizeRouteHostFields({ agentId, routeGeneration, routeHostProfile, routeHostKey }, `cutover.${prefix}`);
  assertDigest(routeBindingDigest, `cutover.${prefix}RouteBindingDigest`);
  return { ...host, routeBindingDigest };
}

export function normalizeAgentRouteCutoverIntent(input) {
  exactRecord(input, [
    'profile', 'agentId', 'cutoverRequestId', 'expectedElectionDigest',
    'predecessorRouteGeneration', 'predecessorRouteBindingDigest', 'predecessorRouteHostProfile', 'predecessorRouteHostKey',
    'successorRouteGeneration', 'successorRouteBindingDigest', 'successorRouteHostProfile', 'successorRouteHostKey',
    'reason', 'recoveryKeyId',
  ], [], 'agent route cutover intent');
  if (input.profile !== AGENT_ROUTE_CUTOVER_PROFILE) fail('invalid_agent_route_cutover', 'Agent route cutover profile is unsupported');
  assertIdentifier(input.agentId, 'cutover.agentId');
  parseAgentRouteCutoverRequestId(input.cutoverRequestId);
  assertDigest(input.expectedElectionDigest, 'cutover.expectedElectionDigest');
  assertDigest(input.recoveryKeyId, 'cutover.recoveryKeyId');
  if (!CUTOVER_REASONS.has(input.reason)) fail('invalid_agent_route_cutover_reason', 'Cutover reason is unsupported');
  const predecessor = normalizeCutoverRoute(input, 'predecessor', input.agentId);
  const successor = normalizeCutoverRoute(input, 'successor', input.agentId);
  if (successor.routeGeneration !== predecessor.routeGeneration + 1 || successor.routeHostProfile !== AGENT_ROUTE_GENERATION_HOST_PROFILE) {
    fail('agent_route_cutover_successor_mismatch', 'Cutover successor must be exactly the next route generation using generation-bound hosting');
  }
  if (predecessor.routeBindingDigest === successor.routeBindingDigest || predecessor.routeHostKey === successor.routeHostKey) {
    fail('agent_route_cutover_successor_mismatch', 'Cutover successor must have a distinct route binding and physical host');
  }
  return Object.freeze(canonicalClone(input));
}

export async function verifyAgentRouteRecoverySignedRecord({ record, signature, publicJwk }) {
  const normalizedPublicKey = normalizedRecoveryPublicKey(publicJwk);
  await verifyEd25519SignedRecord({ domain: record.profile, record, signature, publicJwk: normalizedPublicKey });
  return Object.freeze({ recoveryKeyId: agentRouteRecoveryKeyId(normalizedPublicKey) });
}

export async function verifyAgentRouteElectionImportSignatures({ record, recoverySignature, managementSignature, managementPublicJwk }) {
  const normalized = normalizeAgentRouteElectionImport(record);
  const managementPublicKey = normalizeEd25519PublicJwk(managementPublicJwk, 'legacy route management public JWK');
  if (canonicalJson(managementPublicKey) === canonicalJson(normalized.recoveryPublicKey)) {
    fail('agent_route_recovery_key_not_independent', 'Route recovery root must be independent from the legacy route management key');
  }
  await verifyEd25519SignedRecord({
    domain: AGENT_ROUTE_ELECTION_IMPORT_PROFILE,
    record: normalized,
    signature: recoverySignature,
    publicJwk: normalized.recoveryPublicKey,
  });
  await verifyEd25519SignedRecord({
    domain: AGENT_ROUTE_ELECTION_IMPORT_PROFILE,
    record: normalized,
    signature: managementSignature,
    publicJwk: managementPublicKey,
  });
  return normalized;
}

function normalizeCurrentRoute(input, label = 'current route') {
  exactRecord(input, ['routeGeneration', 'routeBindingDigest', 'routeHostProfile', 'routeHostKey', 'activationReceiptDigest'], [], label);
  assertSafeInteger(input.routeGeneration, `${label}.routeGeneration`, { min: 1 });
  assertDigest(input.routeBindingDigest, `${label}.routeBindingDigest`);
  assertDigest(input.activationReceiptDigest, `${label}.activationReceiptDigest`);
  return canonicalClone(input);
}

function normalizeReceiptResult(input, label) {
  exactRecord(input, ['classification', 'currentRoute', 'activationReceiptDigest'], [], label);
  if (input.classification !== 'applied') fail('invalid_agent_route_election_receipt', `${label}.classification must be applied`);
  const currentRoute = normalizeCurrentRoute(input.currentRoute, `${label}.currentRoute`);
  assertDigest(input.activationReceiptDigest, `${label}.activationReceiptDigest`);
  if (input.activationReceiptDigest !== currentRoute.activationReceiptDigest) {
    fail('invalid_agent_route_election_receipt', `${label} activation receipt mismatch`);
  }
  return { classification: 'applied', currentRoute, activationReceiptDigest: input.activationReceiptDigest };
}

function normalizeReceipt(input, index, { agentId, routeGenerationHighWater, cutoverRequestSequenceHighWater }) {
  const label = `recentReceipts[${index}]`;
  if (input === null || typeof input !== 'object' || Array.isArray(input) || !RECEIPT_KINDS.has(input.kind)) {
    fail('invalid_agent_route_election_receipt', `${label} kind is unsupported`);
  }
  const isCutover = input.kind === 'cutover';
  exactRecord(
    input,
    isCutover
      ? ['kind', 'requestId', 'intentDigest', 'predecessorExclusionDigest', 'successorStandbyDigest', 'result']
      : ['kind', 'requestId', 'intentDigest', 'result'],
    [],
    label,
  );
  assertDigest(input.intentDigest, `${label}.intentDigest`);
  const result = normalizeReceiptResult(input.result, `${label}.result`);
  const currentRoute = result.currentRoute;
  normalizeRouteHostFields({
    agentId,
    routeGeneration: currentRoute.routeGeneration,
    routeHostProfile: currentRoute.routeHostProfile,
    routeHostKey: currentRoute.routeHostKey,
  }, `${label}.result.currentRoute`);
  if (currentRoute.routeGeneration > routeGenerationHighWater) {
    fail('invalid_agent_route_election_receipt', `${label} route generation exceeds the permanent high-water`);
  }

  let expectedActivationReceiptDigest;
  if (isCutover) {
    const sequence = parseAgentRouteCutoverRequestId(input.requestId);
    if (sequence > cutoverRequestSequenceHighWater || currentRoute.routeGeneration !== sequence + 1) {
      fail('invalid_agent_route_election_receipt', `${label} cutover sequence/route generation is inconsistent with permanent floors`);
    }
    assertDigest(input.predecessorExclusionDigest, `${label}.predecessorExclusionDigest`);
    assertDigest(input.successorStandbyDigest, `${label}.successorStandbyDigest`);
    expectedActivationReceiptDigest = typedDigest(AGENT_ROUTE_ACTIVATION_RECEIPT_PROFILE, {
      kind: 'cutover',
      agentId,
      cutoverRequestId: input.requestId,
      intentDigest: input.intentDigest,
      predecessorExclusionDigest: input.predecessorExclusionDigest,
      successorStandbyDigest: input.successorStandbyDigest,
      successorRouteGeneration: currentRoute.routeGeneration,
      successorRouteBindingDigest: currentRoute.routeBindingDigest,
      successorRouteHostProfile: currentRoute.routeHostProfile,
      successorRouteHostKey: currentRoute.routeHostKey,
    });
  } else {
    assertDigest(input.requestId, `${label}.requestId`);
    if (input.requestId !== input.intentDigest || currentRoute.routeGeneration !== 1) {
      fail('invalid_agent_route_election_receipt', `${label} genesis/import replay identity is inconsistent`);
    }
    expectedActivationReceiptDigest = activationReceiptDigest({
      kind: input.kind,
      agentId,
      routeGeneration: currentRoute.routeGeneration,
      routeBindingDigest: currentRoute.routeBindingDigest,
      routeHostProfile: currentRoute.routeHostProfile,
      routeHostKey: currentRoute.routeHostKey,
      intentDigest: input.intentDigest,
    });
  }
  if (result.activationReceiptDigest !== expectedActivationReceiptDigest) {
    fail('invalid_agent_route_election_receipt', `${label} activation receipt is not derivable from the retained replay record`);
  }
  return canonicalClone({
    kind: input.kind,
    requestId: input.requestId,
    intentDigest: input.intentDigest,
    ...(isCutover ? {
      predecessorExclusionDigest: input.predecessorExclusionDigest,
      successorStandbyDigest: input.successorStandbyDigest,
    } : {}),
    result,
  });
}

function normalizeActiveCutover(input, stateAgentId, routeGenerationHighWater, recoveryKeyId) {
  exactRecord(input, ['intent', 'intentDigest', 'phase', 'predecessorExclusionDigest', 'successorStandbyDigest'], [], 'activeCutover');
  const intent = normalizeAgentRouteCutoverIntent(input.intent);
  if (intent.agentId !== stateAgentId || intent.predecessorRouteGeneration !== routeGenerationHighWater || intent.successorRouteGeneration !== routeGenerationHighWater + 1 || intent.recoveryKeyId !== recoveryKeyId) {
    fail('invalid_agent_route_election_state', 'Active cutover identity does not match election state');
  }
  const intentDigest = digest(intent);
  if (input.intentDigest !== intentDigest) fail('invalid_agent_route_election_state', 'Active cutover digest does not match its intent');
  if (!ACTIVE_CUTOVER_PHASES.has(input.phase)) fail('invalid_agent_route_election_state', 'Active cutover phase is invalid');
  if (input.predecessorExclusionDigest !== null) assertDigest(input.predecessorExclusionDigest, 'activeCutover.predecessorExclusionDigest');
  if (input.successorStandbyDigest !== null) assertDigest(input.successorStandbyDigest, 'activeCutover.successorStandbyDigest');
  const expectedPhase = input.predecessorExclusionDigest !== null && input.successorStandbyDigest !== null ? 'READY_TO_COMMIT'
    : input.predecessorExclusionDigest !== null ? 'PREDECESSOR_EXCLUDED'
      : input.successorStandbyDigest !== null ? 'SUCCESSOR_STANDBY' : 'PREPARED';
  if (input.phase !== expectedPhase) fail('invalid_agent_route_election_state', 'Active cutover phase does not match its evidence fields');
  return canonicalClone({ ...input, intent, intentDigest });
}

export function normalizeAgentRouteElectionState(input, { maxRecentReceipts = DEFAULT_MAX_RECENT_RECEIPTS } = {}) {
  exactRecord(input, [
    'profile', 'agentId', 'routeGenerationHighWater', 'cutoverRequestSequenceHighWater', 'recoveryKeyId', 'recoveryPublicKey',
    'currentRoute', 'activeCutover', 'recentReceipts',
  ], [], 'agent route election state');
  if (input.profile !== AGENT_ROUTE_ELECTION_PROFILE) fail('invalid_agent_route_election_state', 'Election state profile is unsupported');
  assertIdentifier(input.agentId, 'election.agentId');
  assertSafeInteger(input.routeGenerationHighWater, 'election.routeGenerationHighWater', { min: 1 });
  assertSafeInteger(input.cutoverRequestSequenceHighWater, 'election.cutoverRequestSequenceHighWater', { min: 0 });
  assertSafeInteger(maxRecentReceipts, 'maxRecentReceipts', { min: 1, max: 1024 });
  const recoveryPublicKey = normalizedRecoveryPublicKey(input.recoveryPublicKey);
  const recoveryKeyId = agentRouteRecoveryKeyId(recoveryPublicKey);
  if (input.recoveryKeyId !== recoveryKeyId) fail('invalid_agent_route_election_state', 'Election recovery key identity mismatch');
  const currentRoute = normalizeCurrentRoute(input.currentRoute);
  normalizeRouteHostFields({
    agentId: input.agentId,
    routeGeneration: currentRoute.routeGeneration,
    routeHostProfile: currentRoute.routeHostProfile,
    routeHostKey: currentRoute.routeHostKey,
  }, 'election.currentRoute');
  if (currentRoute.routeGeneration !== input.routeGenerationHighWater) fail('invalid_agent_route_election_state', 'Current route must equal the route generation high-water');
  if (input.routeGenerationHighWater !== input.cutoverRequestSequenceHighWater + 1) {
    fail('invalid_agent_route_election_state', 'Route generation and cutover request permanent floors must advance together from generation 1');
  }
  if (!Array.isArray(input.recentReceipts) || input.recentReceipts.length < 1 || input.recentReceipts.length > maxRecentReceipts) {
    fail('invalid_agent_route_election_state', 'Election recent receipts are invalid, empty, or unbounded');
  }
  const recentReceipts = input.recentReceipts.map((receipt, index) => normalizeReceipt(receipt, index, {
    agentId: input.agentId,
    routeGenerationHighWater: input.routeGenerationHighWater,
    cutoverRequestSequenceHighWater: input.cutoverRequestSequenceHighWater,
  }));
  const receiptKeys = new Set();
  let baseReceiptSeen = false;
  let priorCutoverSequence = 0;
  for (const [index, receipt] of recentReceipts.entries()) {
    const key = `${receipt.kind}\0${receipt.requestId}`;
    if (receiptKeys.has(key)) fail('invalid_agent_route_election_state', 'Election recent receipt identity is duplicated');
    receiptKeys.add(key);
    if (receipt.kind === 'genesis' || receipt.kind === 'import') {
      if (baseReceiptSeen || index !== 0) fail('invalid_agent_route_election_state', 'Genesis/import receipt may appear at most once and only at the retained replay prefix');
      baseReceiptSeen = true;
    } else {
      const sequence = parseAgentRouteCutoverRequestId(receipt.requestId);
      if (sequence <= priorCutoverSequence) fail('invalid_agent_route_election_state', 'Retained cutover receipts must be strictly sequence-ordered');
      priorCutoverSequence = sequence;
    }
  }
  const latestReceiptRoute = recentReceipts.at(-1).result.currentRoute;
  if (canonicalJson(latestReceiptRoute) !== canonicalJson(currentRoute)) {
    fail('invalid_agent_route_election_state', 'Latest retained receipt must reproduce the exact current elected route');
  }
  const activeCutover = input.activeCutover === null ? null : normalizeActiveCutover(input.activeCutover, input.agentId, input.routeGenerationHighWater, recoveryKeyId);
  if (activeCutover !== null) {
    const sequence = parseAgentRouteCutoverRequestId(activeCutover.intent.cutoverRequestId);
    if (sequence !== input.cutoverRequestSequenceHighWater + 1) fail('invalid_agent_route_election_state', 'Active cutover sequence must be exactly the next uncommitted sequence');
    if (activeCutover.intent.predecessorRouteBindingDigest !== currentRoute.routeBindingDigest ||
        activeCutover.intent.predecessorRouteHostProfile !== currentRoute.routeHostProfile ||
        activeCutover.intent.predecessorRouteHostKey !== currentRoute.routeHostKey) {
      fail('invalid_agent_route_election_state', 'Active cutover predecessor does not match current route');
    }
  }
  return Object.freeze(canonicalClone({
    profile: AGENT_ROUTE_ELECTION_PROFILE,
    agentId: input.agentId,
    routeGenerationHighWater: input.routeGenerationHighWater,
    cutoverRequestSequenceHighWater: input.cutoverRequestSequenceHighWater,
    recoveryKeyId,
    recoveryPublicKey,
    currentRoute,
    activeCutover,
    recentReceipts,
  }));
}

export function agentRouteElectionDigest(input) {
  return digest(normalizeAgentRouteElectionState(input));
}

function activationReceiptDigest({ kind, agentId, routeGeneration, routeBindingDigest, routeHostProfile, routeHostKey, intentDigest }) {
  return typedDigest(AGENT_ROUTE_ACTIVATION_RECEIPT_PROFILE, {
    kind,
    agentId,
    routeGeneration,
    routeBindingDigest,
    routeHostProfile,
    routeHostKey,
    intentDigest,
  });
}

function appliedRouteResult(kind, record, intentDigest) {
  const activationReceiptDigestValue = activationReceiptDigest({
    kind,
    agentId: record.agentId,
    routeGeneration: record.routeGeneration,
    routeBindingDigest: record.routeBindingDigest,
    routeHostProfile: record.routeHostProfile,
    routeHostKey: record.routeHostKey,
    intentDigest,
  });
  const currentRoute = {
    routeGeneration: record.routeGeneration,
    routeBindingDigest: record.routeBindingDigest,
    routeHostProfile: record.routeHostProfile,
    routeHostKey: record.routeHostKey,
    activationReceiptDigest: activationReceiptDigestValue,
  };
  return Object.freeze(canonicalClone({ classification: 'applied', currentRoute, activationReceiptDigest: activationReceiptDigestValue }));
}

function replayResult(receipt) {
  return Object.freeze(canonicalClone({ classification: 'exact_replay', result: receipt.result }));
}

export class AgentRouteElectionAuthority {
  constructor({ state = null, maxRecentReceipts = DEFAULT_MAX_RECENT_RECEIPTS } = {}) {
    assertSafeInteger(maxRecentReceipts, 'maxRecentReceipts', { min: 1, max: 1024 });
    this.maxRecentReceipts = maxRecentReceipts;
    this.state = state === null ? null : canonicalClone(normalizeAgentRouteElectionState(state, { maxRecentReceipts }));
  }

  read() {
    return this.state === null ? null : Object.freeze(canonicalClone(this.state));
  }

  #receipt(kind, requestId) {
    return this.state?.recentReceipts.find((receipt) => receipt.kind === kind && receipt.requestId === requestId) ?? null;
  }

  #appendReceipt(receipt) {
    this.state.recentReceipts.push(canonicalClone(receipt));
    while (this.state.recentReceipts.length > this.maxRecentReceipts) this.state.recentReceipts.shift();
  }

  async createGenesis({ genesis, signature }) {
    const normalized = normalizeAgentRouteElectionGenesis(genesis);
    const intentDigest = digest(normalized);
    await verifyAgentRouteRecoverySignedRecord({ record: normalized, signature, publicJwk: normalized.recoveryPublicKey });
    if (this.state !== null) {
      const retained = this.#receipt('genesis', intentDigest);
      if (retained !== null && retained.intentDigest === intentDigest) return replayResult(retained);
      fail('agent_route_election_already_exists', 'Election genesis cannot recreate or replace an existing route election');
    }
    const result = appliedRouteResult('genesis', normalized, intentDigest);
    this.state = {
      profile: AGENT_ROUTE_ELECTION_PROFILE,
      agentId: normalized.agentId,
      routeGenerationHighWater: 1,
      cutoverRequestSequenceHighWater: 0,
      recoveryKeyId: normalized.recoveryKeyId,
      recoveryPublicKey: canonicalClone(normalized.recoveryPublicKey),
      currentRoute: canonicalClone(result.currentRoute),
      activeCutover: null,
      recentReceipts: [],
    };
    this.#appendReceipt({ kind: 'genesis', requestId: intentDigest, intentDigest, result });
    this.state = canonicalClone(normalizeAgentRouteElectionState(this.state, { maxRecentReceipts: this.maxRecentReceipts }));
    return result;
  }

  async importLegacy({ record, recoverySignature, managementSignature, managementPublicJwk }) {
    const normalized = await verifyAgentRouteElectionImportSignatures({ record, recoverySignature, managementSignature, managementPublicJwk });
    const intentDigest = digest(normalized);
    if (this.state !== null) {
      const retained = this.#receipt('import', intentDigest);
      if (retained !== null && retained.intentDigest === intentDigest) return replayResult(retained);
      fail('agent_route_election_already_exists', 'Legacy import cannot recreate or replace an existing route election');
    }
    const result = appliedRouteResult('import', normalized, intentDigest);
    this.state = {
      profile: AGENT_ROUTE_ELECTION_PROFILE,
      agentId: normalized.agentId,
      routeGenerationHighWater: 1,
      cutoverRequestSequenceHighWater: 0,
      recoveryKeyId: normalized.recoveryKeyId,
      recoveryPublicKey: canonicalClone(normalized.recoveryPublicKey),
      currentRoute: canonicalClone(result.currentRoute),
      activeCutover: null,
      recentReceipts: [],
    };
    this.#appendReceipt({ kind: 'import', requestId: intentDigest, intentDigest, result });
    this.state = canonicalClone(normalizeAgentRouteElectionState(this.state, { maxRecentReceipts: this.maxRecentReceipts }));
    return result;
  }

  async prepareCutover({ intent, signature }) {
    if (this.state === null) fail('agent_route_election_uninitialized', 'Cutover requires an existing route election');
    const normalized = normalizeAgentRouteCutoverIntent(intent);
    const intentDigest = digest(normalized);
    const sequence = parseAgentRouteCutoverRequestId(normalized.cutoverRequestId);
    if (normalized.agentId !== this.state.agentId || normalized.recoveryKeyId !== this.state.recoveryKeyId) {
      fail('agent_route_cutover_authority_mismatch', 'Cutover agent/recovery identity does not match election authority');
    }
    await verifyAgentRouteRecoverySignedRecord({ record: normalized, signature, publicJwk: this.state.recoveryPublicKey });
    const retained = this.#receipt('cutover', normalized.cutoverRequestId);
    if (retained !== null) {
      if (retained.intentDigest !== intentDigest) fail('agent_route_cutover_request_conflict', 'Completed cutover request ID was reused with changed intent');
      return replayResult(retained);
    }
    if (this.state.activeCutover !== null) {
      if (this.state.activeCutover.intent.cutoverRequestId === normalized.cutoverRequestId) {
        if (this.state.activeCutover.intentDigest !== intentDigest) fail('agent_route_cutover_request_conflict', 'Active cutover request ID was reused with changed intent');
        return Object.freeze(canonicalClone({ classification: 'exact_replay', activeCutover: this.state.activeCutover }));
      }
      fail('agent_route_cutover_in_progress', 'A different cutover is already nonterminal');
    }
    if (sequence <= this.state.cutoverRequestSequenceHighWater) fail('agent_route_cutover_request_stale', 'Cutover request sequence is at or below the permanent floor');
    if (sequence !== this.state.cutoverRequestSequenceHighWater + 1) fail('agent_route_cutover_request_gap', 'Cutover request sequence must be exactly the next sequence');
    if (normalized.expectedElectionDigest !== agentRouteElectionDigest(this.state)) fail('agent_route_cutover_election_mismatch', 'Cutover expected election digest is stale or substituted');
    const current = this.state.currentRoute;
    if (normalized.predecessorRouteGeneration !== current.routeGeneration ||
        normalized.predecessorRouteBindingDigest !== current.routeBindingDigest ||
        normalized.predecessorRouteHostProfile !== current.routeHostProfile ||
        normalized.predecessorRouteHostKey !== current.routeHostKey) {
      fail('agent_route_cutover_predecessor_mismatch', 'Cutover predecessor is not the exact current elected route');
    }
    if (normalized.successorRouteGeneration !== this.state.routeGenerationHighWater + 1) {
      fail('agent_route_cutover_successor_mismatch', 'Cutover successor generation is not exactly the next non-reused generation');
    }
    this.state.activeCutover = {
      intent: canonicalClone(normalized),
      intentDigest,
      phase: 'PREPARED',
      predecessorExclusionDigest: null,
      successorStandbyDigest: null,
    };
    this.state = canonicalClone(normalizeAgentRouteElectionState(this.state, { maxRecentReceipts: this.maxRecentReceipts }));
    return Object.freeze(canonicalClone({ classification: 'prepared', activeCutover: this.state.activeCutover }));
  }

  recordPredecessorExclusion({ cutoverRequestId, predecessorExclusionDigest }) {
    assertDigest(predecessorExclusionDigest, 'predecessorExclusionDigest');
    const active = this.#requireActiveCutover(cutoverRequestId);
    if (active.predecessorExclusionDigest !== null) {
      if (active.predecessorExclusionDigest !== predecessorExclusionDigest) fail('agent_route_cutover_evidence_conflict', 'Predecessor exclusion evidence changed for the active cutover');
      return Object.freeze(canonicalClone({ classification: 'exact_replay', activeCutover: active }));
    }
    active.predecessorExclusionDigest = predecessorExclusionDigest;
    active.phase = active.successorStandbyDigest === null ? 'PREDECESSOR_EXCLUDED' : 'READY_TO_COMMIT';
    this.state = canonicalClone(normalizeAgentRouteElectionState(this.state, { maxRecentReceipts: this.maxRecentReceipts }));
    return Object.freeze(canonicalClone({ classification: 'recorded', activeCutover: this.state.activeCutover }));
  }

  recordSuccessorStandby({ cutoverRequestId, successorStandbyDigest }) {
    assertDigest(successorStandbyDigest, 'successorStandbyDigest');
    const active = this.#requireActiveCutover(cutoverRequestId);
    if (active.successorStandbyDigest !== null) {
      if (active.successorStandbyDigest !== successorStandbyDigest) fail('agent_route_cutover_evidence_conflict', 'Successor standby evidence changed for the active cutover');
      return Object.freeze(canonicalClone({ classification: 'exact_replay', activeCutover: active }));
    }
    active.successorStandbyDigest = successorStandbyDigest;
    active.phase = active.predecessorExclusionDigest === null ? 'SUCCESSOR_STANDBY' : 'READY_TO_COMMIT';
    this.state = canonicalClone(normalizeAgentRouteElectionState(this.state, { maxRecentReceipts: this.maxRecentReceipts }));
    return Object.freeze(canonicalClone({ classification: 'recorded', activeCutover: this.state.activeCutover }));
  }

  commitCutover({ cutoverRequestId }) {
    const active = this.#requireActiveCutover(cutoverRequestId);
    if (active.phase !== 'READY_TO_COMMIT' || active.predecessorExclusionDigest === null || active.successorStandbyDigest === null) {
      fail('agent_route_cutover_not_ready', 'Cutover requires both predecessor exclusion/quiescence and exact successor standby evidence before election');
    }
    const intent = active.intent;
    const activationReceiptDigestValue = typedDigest(AGENT_ROUTE_ACTIVATION_RECEIPT_PROFILE, {
      kind: 'cutover',
      agentId: intent.agentId,
      cutoverRequestId: intent.cutoverRequestId,
      intentDigest: active.intentDigest,
      predecessorExclusionDigest: active.predecessorExclusionDigest,
      successorStandbyDigest: active.successorStandbyDigest,
      successorRouteGeneration: intent.successorRouteGeneration,
      successorRouteBindingDigest: intent.successorRouteBindingDigest,
      successorRouteHostProfile: intent.successorRouteHostProfile,
      successorRouteHostKey: intent.successorRouteHostKey,
    });
    const currentRoute = {
      routeGeneration: intent.successorRouteGeneration,
      routeBindingDigest: intent.successorRouteBindingDigest,
      routeHostProfile: intent.successorRouteHostProfile,
      routeHostKey: intent.successorRouteHostKey,
      activationReceiptDigest: activationReceiptDigestValue,
    };
    const result = Object.freeze(canonicalClone({ classification: 'applied', currentRoute, activationReceiptDigest: activationReceiptDigestValue }));
    this.state.routeGenerationHighWater = intent.successorRouteGeneration;
    this.state.cutoverRequestSequenceHighWater = parseAgentRouteCutoverRequestId(intent.cutoverRequestId);
    this.state.currentRoute = canonicalClone(currentRoute);
    this.state.activeCutover = null;
    this.#appendReceipt({
      kind: 'cutover',
      requestId: intent.cutoverRequestId,
      intentDigest: active.intentDigest,
      predecessorExclusionDigest: active.predecessorExclusionDigest,
      successorStandbyDigest: active.successorStandbyDigest,
      result,
    });
    this.state = canonicalClone(normalizeAgentRouteElectionState(this.state, { maxRecentReceipts: this.maxRecentReceipts }));
    return result;
  }

  #requireActiveCutover(cutoverRequestId) {
    parseAgentRouteCutoverRequestId(cutoverRequestId);
    if (this.state === null || this.state.activeCutover === null) fail('agent_route_cutover_not_active', 'No cutover is active');
    if (this.state.activeCutover.intent.cutoverRequestId !== cutoverRequestId) fail('agent_route_cutover_request_conflict', 'Cutover request ID does not match the active transaction');
    return this.state.activeCutover;
  }
}

export class MemoryAgentRouteElectionStore {
  constructor() { this.records = new Map(); }
  load(agentId) {
    const record = this.records.get(agentId);
    return record === undefined ? null : canonicalClone(record);
  }
  compareAndSwap(agentId, expectedRevision, state) {
    const current = this.records.get(agentId);
    const actualRevision = current === undefined ? null : current.revision;
    if (actualRevision !== expectedRevision) fail('agent_route_election_revision_conflict', 'Election state revision changed');
    this.records.set(agentId, { revision: expectedRevision === null ? 0 : expectedRevision + 1, state: canonicalClone(state) });
  }
}

export class DurableAgentRouteElectionAuthority {
  constructor({ agentId, store, maxRecentReceipts = DEFAULT_MAX_RECENT_RECEIPTS }) {
    assertIdentifier(agentId, 'agentId');
    if (!store || typeof store.load !== 'function' || typeof store.compareAndSwap !== 'function') fail('invalid_agent_route_election_store', 'Election store must expose load and compareAndSwap');
    this.agentId = agentId;
    this.store = store;
    this.maxRecentReceipts = maxRecentReceipts;
  }
  read() {
    const record = this.store.load(this.agentId);
    if (record === null) return null;
    assertSafeInteger(record.revision, 'election store revision', { min: 0 });
    const state = normalizeAgentRouteElectionState(record.state, { maxRecentReceipts: this.maxRecentReceipts });
    if (state.agentId !== this.agentId) fail('agent_route_election_store_corrupt', 'Election store key and state agent identity disagree');
    return Object.freeze(canonicalClone(state));
  }
  async #mutate(method, input) {
    const record = this.store.load(this.agentId);
    const expectedRevision = record === null ? null : record.revision;
    const priorState = record === null ? null : normalizeAgentRouteElectionState(record.state, { maxRecentReceipts: this.maxRecentReceipts });
    const authority = new AgentRouteElectionAuthority({ state: priorState, maxRecentReceipts: this.maxRecentReceipts });
    const result = await authority[method](input);
    const nextState = authority.read();
    if (nextState?.agentId !== this.agentId) fail('agent_route_election_store_key_mismatch', 'Mutation targets a different Agent election owner');
    if (canonicalJson(priorState) !== canonicalJson(nextState)) this.store.compareAndSwap(this.agentId, expectedRevision, nextState);
    return result;
  }
  createGenesis(input) { return this.#mutate('createGenesis', input); }
  importLegacy(input) { return this.#mutate('importLegacy', input); }
  prepareCutover(input) { return this.#mutate('prepareCutover', input); }
  recordPredecessorExclusion(input) { return this.#mutate('recordPredecessorExclusion', input); }
  recordSuccessorStandby(input) { return this.#mutate('recordSuccessorStandby', input); }
  commitCutover(input) { return this.#mutate('commitCutover', input); }
}
