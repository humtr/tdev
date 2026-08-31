import {
  ContractError,
  assertDigest,
  assertIdentifier,
  assertRecordShape,
  assertSafeInteger,
  canonicalJson,
  publicJsonClone,
  typedDigest,
} from './canonical.mjs';
import {
  installableAgentPredecessorDigest,
  parseInstallableAgentManagementRequestId,
} from './installable-agent-admission.mjs';
import {
  INSTALLABLE_AGENT_KEYSTORE_ALIAS_PROFILE,
  INSTALLABLE_AGENT_RELEASE_DELEGATION_PROFILE,
  installableAgentCredentialRef,
  verifyInstallableAgentReleaseStatement,
  verifyReleaseDelegation,
} from './installable-agent-security.mjs';

export const INSTALLABLE_AGENT_CREDENTIAL_PROVISIONING_PROFILE = 'tdev.agent-credential-provisioning.v1';

function fail(code, message, details = undefined) {
  throw new ContractError(code, message, details);
}

function nextGeneration(value, label) {
  assertSafeInteger(value, label, { min: 0 });
  if (value === Number.MAX_SAFE_INTEGER) fail('pre_genesis_generation_exhausted', `${label} cannot advance safely`);
  return value + 1;
}

function normalizeRouteBinding(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('invalid_pre_genesis_route', 'routeBinding must be a record');
  assertIdentifier(value.agentId, 'pre-genesis agentId');
  assertSafeInteger(value.routeGeneration, 'pre-genesis routeGeneration', { min: 1 });
  return Object.freeze({ agentId: value.agentId, routeGeneration: value.routeGeneration });
}

function authoritativeUnregisteredRoute(routeBinding, routeRead) {
  const binding = normalizeRouteBinding(routeBinding);
  assertRecordShape(routeRead, ['installableAgent', 'predecessorDigest', 'currentTuple', 'currentTupleDigest'], [], 'D0041 authoritative route readback');
  const state = routeRead.installableAgent;
  if (state === null || typeof state !== 'object' || Array.isArray(state)) fail('invalid_pre_genesis_route', 'installableAgent readback must be a record');
  if (state.state !== 'UNREGISTERED') fail('pre_genesis_route_not_unregistered', 'D0041 preparation requires authoritative UNREGISTERED state');
  if (state.everCurrent !== false || state.pending !== null || state.current !== null) fail('pre_genesis_route_not_pristine', 'D0041 preparation requires never-current UNREGISTERED state');
  for (const field of ['installationGenerationHighWater', 'credentialGenerationHighWater', 'trustPolicyGenerationHighWater', 'managementRequestSequenceHighWater']) {
    assertSafeInteger(state[field], `installableAgent.${field}`, { min: 0 });
  }
  assertDigest(routeRead.predecessorDigest, 'pre-genesis predecessorDigest');
  if (routeRead.currentTuple !== null || routeRead.currentTupleDigest !== null) fail('pre_genesis_route_current_conflict', 'UNREGISTERED preparation cannot have a current tuple');
  const actualPredecessorDigest = installableAgentPredecessorDigest(state);
  if (actualPredecessorDigest !== routeRead.predecessorDigest) fail('pre_genesis_predecessor_mismatch', 'Authoritative predecessor digest does not match the readback state');
  return { binding, state, predecessorDigest: actualPredecessorDigest };
}

export function normalizeInstallableAgentCredentialPreparation(value) {
  assertRecordShape(value, [
    'profile', 'agentId', 'routeGeneration', 'managementRequestId', 'expectedPredecessorDigest',
    'installationGeneration', 'credentialGeneration', 'credentialRef',
  ], [], 'D0041 credential preparation');
  if (value.profile !== INSTALLABLE_AGENT_CREDENTIAL_PROVISIONING_PROFILE) fail('invalid_credential_provisioning_profile', 'Unsupported D0041 credential provisioning profile');
  assertIdentifier(value.agentId, 'credential preparation agentId');
  assertSafeInteger(value.routeGeneration, 'credential preparation routeGeneration', { min: 1 });
  parseInstallableAgentManagementRequestId(value.managementRequestId);
  assertDigest(value.expectedPredecessorDigest, 'credential preparation expectedPredecessorDigest');
  assertSafeInteger(value.installationGeneration, 'credential preparation installationGeneration', { min: 1 });
  assertSafeInteger(value.credentialGeneration, 'credential preparation credentialGeneration', { min: 1 });
  const credentialRef = installableAgentCredentialRef({
    profile: INSTALLABLE_AGENT_KEYSTORE_ALIAS_PROFILE,
    agentId: value.agentId,
    routeGeneration: value.routeGeneration,
    installationGeneration: value.installationGeneration,
    credentialGeneration: value.credentialGeneration,
  });
  if (value.credentialRef !== credentialRef) fail('pre_genesis_credential_ref_mismatch', 'credentialRef does not match the deterministic D0027 AndroidKeyStore alias');
  return Object.freeze(publicJsonClone(value));
}

export function deriveInstallableAgentCredentialPreparation({ routeBinding, routeRead }) {
  const { binding, state, predecessorDigest } = authoritativeUnregisteredRoute(routeBinding, routeRead);
  const preparation = {
    profile: INSTALLABLE_AGENT_CREDENTIAL_PROVISIONING_PROFILE,
    agentId: binding.agentId,
    routeGeneration: binding.routeGeneration,
    managementRequestId: `m2:${nextGeneration(state.managementRequestSequenceHighWater, 'managementRequestSequenceHighWater')}`,
    expectedPredecessorDigest: predecessorDigest,
    installationGeneration: nextGeneration(state.installationGenerationHighWater, 'installationGenerationHighWater'),
    credentialGeneration: nextGeneration(state.credentialGenerationHighWater, 'credentialGenerationHighWater'),
    credentialRef: '',
  };
  preparation.credentialRef = installableAgentCredentialRef({
    profile: INSTALLABLE_AGENT_KEYSTORE_ALIAS_PROFILE,
    agentId: preparation.agentId,
    routeGeneration: preparation.routeGeneration,
    installationGeneration: preparation.installationGeneration,
    credentialGeneration: preparation.credentialGeneration,
  });
  return normalizeInstallableAgentCredentialPreparation(preparation);
}

export function installableAgentCredentialProvisioningDigest(value) {
  return typedDigest(INSTALLABLE_AGENT_CREDENTIAL_PROVISIONING_PROFILE, normalizeInstallableAgentCredentialPreparation(value));
}

export function installableAgentCredentialProvisioningId(value) {
  const provisioningDigest = installableAgentCredentialProvisioningDigest(value);
  return `cp1.${provisioningDigest.slice('sha256:'.length)}`;
}

export async function verifyAndProjectInstallableAgentReleaseTrust({
  routeBinding, routeRead, delegation, delegationSignature, statement, statementSignature,
  archiveBytes, manifest, releaseManifestDigest,
}) {
  const { binding, state } = authoritativeUnregisteredRoute(routeBinding, routeRead);
  if (state.releaseRootKeyId === null || state.releaseRootPublicKey === null) fail('pre_genesis_release_root_unavailable', 'D0041 release projection requires the authoritative release-root verifier');
  assertDigest(releaseManifestDigest, 'pre-genesis releaseManifestDigest');
  const verifiedDelegation = await verifyReleaseDelegation({ delegation, signature: delegationSignature, releaseRootPublicJwk: state.releaseRootPublicKey });
  if (verifiedDelegation.agentId !== binding.agentId || verifiedDelegation.routeGeneration !== binding.routeGeneration) fail('pre_genesis_release_route_mismatch', 'Release delegation is not bound to the authoritative route');
  if (verifiedDelegation.rootKeyId !== state.releaseRootKeyId) fail('pre_genesis_release_root_mismatch', 'Release delegation root identity does not match the authoritative route');
  const trustPolicyGeneration = nextGeneration(state.trustPolicyGenerationHighWater, 'trustPolicyGenerationHighWater');
  if (verifiedDelegation.trustPolicyGeneration !== trustPolicyGeneration) fail('pre_genesis_trust_generation_mismatch', 'Release delegation trust generation is not the next authoritative generation');
  const verifiedRelease = await verifyInstallableAgentReleaseStatement({
    delegation: verifiedDelegation,
    statement,
    signature: statementSignature,
    archiveBytes,
    manifest,
    releaseManifestDigest,
  });
  const trustSubjects = {};
  for (const signer of verifiedDelegation.signers) trustSubjects[signer.keyId] = signer.disposition;
  if (trustSubjects[verifiedRelease.signerKeyId] !== 'active') fail('pre_genesis_package_signer_inactive', 'Verified package signer is not active in the projected trust state');
  return Object.freeze({
    releaseRootKeyId: state.releaseRootKeyId,
    trustPolicyGeneration,
    packageManifestDigest: releaseManifestDigest,
    packageTrustSubjectDigest: verifiedRelease.signerKeyId,
    trustStateDigest: typedDigest(INSTALLABLE_AGENT_RELEASE_DELEGATION_PROFILE, verifiedDelegation),
    trustSubjects: publicJsonClone(trustSubjects),
  });
}

export function assertInstallableAgentPreGenesisFresh({
  routeBinding, routeRead, expectedPreparation, expectedReleaseRootKeyId, expectedTrustPolicyGeneration,
}) {
  const expected = normalizeInstallableAgentCredentialPreparation(expectedPreparation);
  const { state } = authoritativeUnregisteredRoute(routeBinding, routeRead);
  const actual = deriveInstallableAgentCredentialPreparation({ routeBinding, routeRead });
  if (canonicalJson(actual) !== canonicalJson(expected)) fail('pre_genesis_reconciliation_required', 'Authoritative route changed after D0041 material preparation');
  if (expectedReleaseRootKeyId !== undefined && state.releaseRootKeyId !== expectedReleaseRootKeyId) fail('pre_genesis_reconciliation_required', 'Authoritative release-root identity changed after D0041 material preparation');
  if (expectedTrustPolicyGeneration !== undefined) {
    assertSafeInteger(expectedTrustPolicyGeneration, 'expectedTrustPolicyGeneration', { min: 1 });
    if (nextGeneration(state.trustPolicyGenerationHighWater, 'trustPolicyGenerationHighWater') !== expectedTrustPolicyGeneration) fail('pre_genesis_reconciliation_required', 'Authoritative trust generation changed after D0041 material preparation');
  }
  return Object.freeze({ preparation: actual, releaseRootKeyId: state.releaseRootKeyId });
}
