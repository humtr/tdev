import { ContractError, assertDigest, assertIdentifier, assertRecordShape, canonicalClone, digest } from './canonical.mjs';
import {
  AGENT_ROUTE_LEGACY_HOST_PROFILE,
  agentRouteElectionAttachmentDigest,
  agentRouteElectionDigest,
  normalizeAgentRouteCutoverIntent,
  normalizeAgentRouteElectionAttachment,
  normalizeAgentRouteElectionState,
  verifyAgentRouteElectionImportSignatures,
  verifyAgentRouteRecoverySignedRecord,
} from './agent-route-election.mjs';

export const AGENT_ROUTE_GENERATION_PROFILE = 'tdev.agent-route-generation.v1';
export const AGENT_ROUTE_PREDECESSOR_EXCLUSION_PROFILE = 'tdev.agent-route-predecessor-exclusion.v1';
const DISPOSITIONS = new Set(['STANDBY', 'ACTIVE', 'DRAINING', 'RETIRED']);

function fail(code, message) { throw new ContractError(code, message); }
function binding(input) {
  assertRecordShape(input, ['agentId', 'routeGeneration'], [], 'route generation binding identity');
  assertIdentifier(input.agentId, 'routeBinding.agentId');
  if (!Number.isSafeInteger(input.routeGeneration) || input.routeGeneration < 1) fail('invalid_agent_route_generation', 'Route generation must be positive');
  return canonicalClone(input);
}

export function normalizeAgentRoutePredecessorExclusion(input) {
  assertRecordShape(input, ['profile', 'kind', 'agentId', 'routeGeneration', 'routeBindingDigest', 'routeHostProfile', 'routeHostKey', 'cutoverRequestId', 'cutoverIntentDigest', 'positiveQuiescenceDigest', 'providerExclusionDigest', 'providerDeploymentEpochDigest'], [], 'route predecessor exclusion');
  if (input.profile !== AGENT_ROUTE_PREDECESSOR_EXCLUSION_PROFILE || !['retired_owner', 'lost_owner'].includes(input.kind)) fail('invalid_agent_route_predecessor_exclusion', 'Predecessor exclusion profile or kind is unsupported');
  assertIdentifier(input.agentId, 'predecessorExclusion.agentId');
  if (!Number.isSafeInteger(input.routeGeneration) || input.routeGeneration < 1) fail('invalid_agent_route_predecessor_exclusion', 'Predecessor generation is invalid');
  for (const field of ['routeBindingDigest', 'cutoverIntentDigest', 'positiveQuiescenceDigest', 'providerDeploymentEpochDigest']) assertDigest(input[field], `predecessorExclusion.${field}`);
  if (input.kind === 'lost_owner') assertDigest(input.providerExclusionDigest, 'predecessorExclusion.providerExclusionDigest');
  else if (input.providerExclusionDigest !== null) fail('invalid_agent_route_predecessor_exclusion', 'Available predecessor cannot use provider-exclusion substitution');
  for (const field of ['routeHostProfile', 'routeHostKey', 'cutoverRequestId']) if (typeof input[field] !== 'string' || input[field].length === 0) fail('invalid_agent_route_predecessor_exclusion', `${field} is invalid`);
  return Object.freeze(canonicalClone(input));
}
export function agentRoutePredecessorExclusionDigest(input) { return digest(normalizeAgentRoutePredecessorExclusion(input)); }

export function normalizeAgentRouteGenerationState(input) {
  assertRecordShape(input, ['profile', 'routeBinding', 'routeBindingDigest', 'routeStateDigest', 'disposition', 'attachment', 'attachmentStatus', 'activeCutoverIntentDigest', 'retirementReceiptDigest', 'activationReceiptDigest'], [], 'route generation state');
  if (input.profile !== AGENT_ROUTE_GENERATION_PROFILE) fail('invalid_agent_route_generation_state', 'Route generation state profile is unsupported');
  const routeBinding = binding(input.routeBinding);
  assertDigest(input.routeBindingDigest, 'routeGeneration.routeBindingDigest');
  assertDigest(input.routeStateDigest, 'routeGeneration.routeStateDigest');
  if (!DISPOSITIONS.has(input.disposition)) fail('invalid_agent_route_disposition', 'Route disposition is unsupported');
  const attachment = input.attachment === null ? null : normalizeAgentRouteElectionAttachment(input.attachment);
  if (!['NONE', 'PENDING', 'SEALED'].includes(input.attachmentStatus) || ((attachment === null) !== (input.attachmentStatus === 'NONE'))) fail('invalid_agent_route_attachment_status', 'Attachment status is inconsistent');
  if (attachment !== null && (attachment.agentId !== routeBinding.agentId || attachment.routeGeneration !== routeBinding.routeGeneration || attachment.routeBindingDigest !== input.routeBindingDigest)) fail('agent_route_attachment_mismatch', 'Attachment does not bind this route');
  if (attachment === null && (routeBinding.routeGeneration !== 1 || input.disposition !== 'ACTIVE')) fail('invalid_legacy_route_generation', 'Only explicit legacy generation 1 may be unattached');
  if (input.attachmentStatus === 'PENDING' && input.disposition !== 'ACTIVE') fail('invalid_agent_route_generation_state', 'Pending attachment is limited to legacy import');
  if (input.disposition === 'STANDBY' && input.attachmentStatus !== 'SEALED') fail('invalid_agent_route_generation_state', 'Standby requires a sealed attachment');
  if (input.disposition === 'DRAINING') assertDigest(input.activeCutoverIntentDigest, 'activeCutoverIntentDigest');
  else if (input.activeCutoverIntentDigest !== null) fail('invalid_agent_route_generation_state', 'Only DRAINING retains a cutover');
  if (input.disposition === 'RETIRED') assertDigest(input.retirementReceiptDigest, 'retirementReceiptDigest');
  else if (input.retirementReceiptDigest !== null) fail('invalid_agent_route_generation_state', 'Only RETIRED retains retirement');
  if (input.disposition === 'ACTIVE' && input.attachmentStatus === 'SEALED') assertDigest(input.activationReceiptDigest, 'activationReceiptDigest');
  else if (input.activationReceiptDigest !== null) fail('invalid_agent_route_generation_state', 'Only elected ACTIVE retains activation');
  return Object.freeze(canonicalClone({ ...input, routeBinding, attachment }));
}

export class AgentRouteGenerationAuthority {
  constructor({ state }) { this.state = canonicalClone(normalizeAgentRouteGenerationState(state)); }
  static legacy({ routeBinding, routeBindingDigest, routeStateDigest }) {
    return new this({ state: { profile: AGENT_ROUTE_GENERATION_PROFILE, routeBinding, routeBindingDigest, routeStateDigest, disposition: 'ACTIVE', attachment: null, attachmentStatus: 'NONE', activeCutoverIntentDigest: null, retirementReceiptDigest: null, activationReceiptDigest: null } });
  }
  static electedStandby({ routeBinding, routeBindingDigest, routeStateDigest, attachment }) {
    return new this({ state: { profile: AGENT_ROUTE_GENERATION_PROFILE, routeBinding, routeBindingDigest, routeStateDigest, disposition: 'STANDBY', attachment, attachmentStatus: 'SEALED', activeCutoverIntentDigest: null, retirementReceiptDigest: null, activationReceiptDigest: null } });
  }
  read() { return Object.freeze(canonicalClone(this.state)); }
  assertExecutable() { if (this.state.disposition !== 'ACTIVE') fail('agent_route_not_active', `Route ${this.state.disposition} rejects executable admission`); return this.read(); }
  async prepareLegacyImport({ record, recoverySignature, managementSignature, managementPublicJwk }) {
    if (this.state.attachmentStatus !== 'NONE' || this.state.disposition !== 'ACTIVE') fail('agent_route_import_not_available', 'Legacy import requires an unattached active route');
    const normalized = await verifyAgentRouteElectionImportSignatures({ record, recoverySignature, managementSignature, managementPublicJwk });
    if (normalized.agentId !== this.state.routeBinding.agentId || normalized.routeBindingDigest !== this.state.routeBindingDigest || normalized.currentRouteStateDigest !== this.state.routeStateDigest) fail('agent_route_import_mismatch', 'Import does not bind exact route readback');
    const attachment = normalizeAgentRouteElectionAttachment({
      profile: 'tdev.agent-route-election-attachment.v1',
      agentId: normalized.agentId,
      routeGeneration: normalized.routeGeneration,
      routeBindingDigest: normalized.routeBindingDigest,
      routeHostProfile: normalized.routeHostProfile,
      routeHostKey: normalized.routeHostKey,
      electionAuthorityIdentity: normalized.electionAuthorityIdentity,
      recoveryKeyId: normalized.recoveryKeyId,
      recoveryPublicKey: normalized.recoveryPublicKey,
    });
    this.state.attachment = canonicalClone(attachment); this.state.attachmentStatus = 'PENDING';
    this.state = canonicalClone(normalizeAgentRouteGenerationState(this.state));
    return Object.freeze({ classification: 'recorded', importDigest: digest(normalized), attachmentDigest: agentRouteElectionAttachmentDigest(attachment) });
  }
  sealLegacyImport({ electionState }) {
    if (this.state.attachmentStatus !== 'PENDING') fail('agent_route_import_not_pending', 'Legacy import is not pending');
    const election = normalizeAgentRouteElectionState(electionState); const current = election.currentRoute;
    if (election.agentId !== this.state.routeBinding.agentId || current.routeGeneration !== 1 || current.routeBindingDigest !== this.state.routeBindingDigest || current.routeHostProfile !== AGENT_ROUTE_LEGACY_HOST_PROFILE || current.routeHostKey !== this.state.routeBinding.agentId || election.recoveryKeyId !== this.state.attachment.recoveryKeyId) fail('agent_route_import_election_mismatch', 'Election does not reproduce pending import');
    this.state.attachmentStatus = 'SEALED'; this.state.activationReceiptDigest = current.activationReceiptDigest;
    this.state = canonicalClone(normalizeAgentRouteGenerationState(this.state));
    return Object.freeze({ classification: 'sealed', electionDigest: agentRouteElectionDigest(election) });
  }
  async beginDraining({ intent, signature }) {
    if (this.state.disposition === 'RETIRED') fail('agent_route_retired', 'Retired route cannot drain again');
    if (this.state.attachmentStatus !== 'SEALED' || this.state.disposition !== 'ACTIVE') fail('agent_route_drain_not_available', 'Only elected ACTIVE may drain');
    const normalized = normalizeAgentRouteCutoverIntent(intent);
    await verifyAgentRouteRecoverySignedRecord({ record: normalized, signature, publicJwk: this.state.attachment.recoveryPublicKey });
    if (normalized.agentId !== this.state.routeBinding.agentId || normalized.predecessorRouteGeneration !== this.state.routeBinding.routeGeneration || normalized.predecessorRouteBindingDigest !== this.state.routeBindingDigest || normalized.predecessorRouteHostProfile !== this.state.attachment.routeHostProfile || normalized.predecessorRouteHostKey !== this.state.attachment.routeHostKey || normalized.recoveryKeyId !== this.state.attachment.recoveryKeyId) fail('agent_route_cutover_predecessor_mismatch', 'Cutover does not bind predecessor');
    this.state.disposition = 'DRAINING'; this.state.activeCutoverIntentDigest = digest(normalized); this.state.activationReceiptDigest = null;
    this.state = canonicalClone(normalizeAgentRouteGenerationState(this.state));
    return Object.freeze({ classification: 'draining', cutoverIntentDigest: this.state.activeCutoverIntentDigest });
  }
  retire({ exclusion }) {
    if (this.state.disposition !== 'DRAINING') fail('agent_route_not_draining', 'Route must drain before retirement');
    const normalized = normalizeAgentRoutePredecessorExclusion(exclusion);
    if (normalized.kind !== 'retired_owner' || normalized.agentId !== this.state.routeBinding.agentId || normalized.routeGeneration !== this.state.routeBinding.routeGeneration || normalized.routeBindingDigest !== this.state.routeBindingDigest || normalized.cutoverIntentDigest !== this.state.activeCutoverIntentDigest) fail('agent_route_retirement_mismatch', 'Retirement does not bind draining route');
    const receipt = digest(normalized); this.state.disposition = 'RETIRED'; this.state.activeCutoverIntentDigest = null; this.state.retirementReceiptDigest = receipt;
    this.state = canonicalClone(normalizeAgentRouteGenerationState(this.state));
    return Object.freeze({ classification: 'retired', predecessorExclusionDigest: receipt });
  }
  activate({ electionState }) {
    if (this.state.disposition !== 'STANDBY') fail('agent_route_not_standby', 'Only STANDBY may activate');
    const election = normalizeAgentRouteElectionState(electionState); const current = election.currentRoute;
    if (election.agentId !== this.state.routeBinding.agentId || current.routeGeneration !== this.state.routeBinding.routeGeneration || current.routeBindingDigest !== this.state.routeBindingDigest || current.routeHostProfile !== this.state.attachment.routeHostProfile || current.routeHostKey !== this.state.attachment.routeHostKey || election.recoveryKeyId !== this.state.attachment.recoveryKeyId) fail('agent_route_activation_mismatch', 'Election does not bind standby route');
    this.state.disposition = 'ACTIVE'; this.state.activationReceiptDigest = current.activationReceiptDigest;
    this.state = canonicalClone(normalizeAgentRouteGenerationState(this.state));
    return Object.freeze({ classification: 'active', activationReceiptDigest: current.activationReceiptDigest });
  }
}
