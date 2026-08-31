import { ContractError, canonicalJson, publicJsonClone } from '../src/canonical.mjs';
import {
  INSTALLABLE_AGENT_KEYSTORE_ALIAS_PROFILE,
  installableAgentCredentialKeyId,
} from '../src/installable-agent-security.mjs';
import {
  assertInstallableAgentPreGenesisFresh,
  deriveInstallableAgentCredentialPreparation,
  installableAgentCredentialProvisioningDigest,
  installableAgentCredentialProvisioningId,
  verifyAndProjectInstallableAgentReleaseTrust,
} from '../src/installable-agent-pre-genesis.mjs';

export const D0041_PRE_GENESIS_PREPARER_PROFILE = 'tdev.installable-agent-d0041-pre-genesis-preparer.v1';

function fail(code, message, details = undefined) {
  throw new ContractError(code, message, details);
}

function assertCredentialAdapter(credential) {
  if (credential === null || typeof credential !== 'object' ||
      typeof credential.provision !== 'function' || typeof credential.readPublicVerifier !== 'function') {
    fail('invalid_d0041_credential_adapter', 'D0041 credential adapter must expose provision and readPublicVerifier');
  }
}

function assertVerifierReadback(provisioned, verifier, credentialRef) {
  if (provisioned === null || typeof provisioned !== 'object' || verifier === null || typeof verifier !== 'object') {
    fail('d0041_credential_reconciliation_required', 'AndroidKeyStore provisioning/readback result is missing');
  }
  if (provisioned.credentialRef !== credentialRef) {
    fail('d0041_credential_reconciliation_required', 'Provisioned AndroidKeyStore credentialRef differs from the deterministic preparation');
  }
  const verifierKeyId = installableAgentCredentialKeyId(verifier.publicJwk);
  if (verifier.credentialKeyId !== verifierKeyId || provisioned.credentialKeyId !== verifierKeyId ||
      canonicalJson(provisioned.publicJwk) !== canonicalJson(verifier.publicJwk)) {
    fail('d0041_credential_reconciliation_required', 'AndroidKeyStore public verifier readback does not reconcile with the provision result');
  }
  return Object.freeze({ credentialKeyId: verifierKeyId, publicJwk: publicJsonClone(verifier.publicJwk) });
}

/**
 * Prepare D0041 material without dispatching any D0027 mutation. Local
 * credential creation remains candidate-only until a later D0027 register CAS.
 * Ambiguous or stale outcomes are deliberately retained for reconciliation.
 */
export async function prepareInstallableAgentPreGenesis({
  readAuthoritativeRoute,
  credential,
  routeBinding,
  androidSourceLineageId,
  delegation,
  delegationSignature,
  statement,
  statementSignature,
  archiveBytes,
  manifest,
  releaseManifestDigest,
}) {
  if (typeof readAuthoritativeRoute !== 'function') fail('invalid_d0041_route_reader', 'D0041 authoritative route reader must be callable');
  assertCredentialAdapter(credential);

  const initialRead = await readAuthoritativeRoute(routeBinding);
  const preparation = deriveInstallableAgentCredentialPreparation({ routeBinding, routeRead: initialRead });
  const releaseTrust = await verifyAndProjectInstallableAgentReleaseTrust({
    routeBinding,
    routeRead: initialRead,
    delegation,
    delegationSignature,
    statement,
    statementSignature,
    archiveBytes,
    manifest,
    releaseManifestDigest,
  });

  const aliasRecord = {
    profile: INSTALLABLE_AGENT_KEYSTORE_ALIAS_PROFILE,
    agentId: preparation.agentId,
    routeGeneration: preparation.routeGeneration,
    installationGeneration: preparation.installationGeneration,
    credentialGeneration: preparation.credentialGeneration,
  };
  const provisioned = await credential.provision({ aliasRecord, androidSourceLineageId });
  const verifierReadback = await credential.readPublicVerifier(preparation.credentialRef);
  const credentialIdentity = assertVerifierReadback(provisioned, verifierReadback, preparation.credentialRef);

  const confirmationRead = await readAuthoritativeRoute(routeBinding);
  assertInstallableAgentPreGenesisFresh({
    routeBinding,
    routeRead: confirmationRead,
    expectedPreparation: preparation,
    expectedReleaseRootKeyId: releaseTrust.releaseRootKeyId,
    expectedTrustPolicyGeneration: releaseTrust.trustPolicyGeneration,
  });

  const provisioningDigest = installableAgentCredentialProvisioningDigest(preparation);
  const credentialProvisioningId = installableAgentCredentialProvisioningId(preparation);
  const register = Object.freeze({
    credentialProvisioningId,
    credentialPublicKey: publicJsonClone(credentialIdentity.publicJwk),
    packageManifestDigest: releaseTrust.packageManifestDigest,
    packageTrustSubjectDigest: releaseTrust.packageTrustSubjectDigest,
    trustStateDigest: releaseTrust.trustStateDigest,
    trustSubjects: publicJsonClone(releaseTrust.trustSubjects),
  });

  return Object.freeze({
    profile: D0041_PRE_GENESIS_PREPARER_PROFILE,
    routeBinding: Object.freeze({ agentId: preparation.agentId, routeGeneration: preparation.routeGeneration }),
    preparation,
    provisioningDigest,
    credentialProvisioningId,
    credentialKeyId: credentialIdentity.credentialKeyId,
    credentialPublicKey: publicJsonClone(credentialIdentity.publicJwk),
    releaseRootKeyId: releaseTrust.releaseRootKeyId,
    trustPolicyGeneration: releaseTrust.trustPolicyGeneration,
    register,
  });
}
