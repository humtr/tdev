import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';

import {
  INSTALLABLE_AGENT_RELEASE_DELEGATION_PROFILE,
  INSTALLABLE_AGENT_RELEASE_STATEMENT_PROFILE,
  canonicalJson,
  createUnregisteredInstallableAgentState,
  digest,
  encodeBase64Url,
  installableAgentPredecessorDigest,
  installableAgentReleaseRootKeyId,
  installableAgentReleaseSignerKeyId,
  rawSha256Hex,
  signedRecordBytes,
} from '../src/index.mjs';
import {
  deriveInstallableAgentCredentialPreparation,
  installableAgentCredentialProvisioningDigest,
  installableAgentCredentialProvisioningId,
  normalizeInstallableAgentCredentialPreparation,
  verifyAndProjectInstallableAgentReleaseTrust,
} from '../src/installable-agent-pre-genesis.mjs';

function ed25519Pair() {
  const pair = generateKeyPairSync('ed25519');
  return { ...pair, publicJwk: pair.publicKey.export({ format: 'jwk' }) };
}

function signEd(privateKey, domain, record) {
  return encodeBase64Url(sign(null, signedRecordBytes(domain, record), privateKey));
}

function expectCode(code) {
  return (error) => error?.code === code;
}

function routeState(overrides = {}) {
  return {
    ...createUnregisteredInstallableAgentState(),
    installationGenerationHighWater: 2,
    credentialGenerationHighWater: 4,
    trustPolicyGenerationHighWater: 6,
    managementRequestSequenceHighWater: 8,
    ...overrides,
  };
}

function routeRead(state) {
  return {
    installableAgent: state,
    predecessorDigest: installableAgentPredecessorDigest(state),
    currentTuple: null,
    currentTupleDigest: null,
  };
}

test('D0041 credential preparation is predecessor-bound and deterministically identified', () => {
  const state = routeState();
  const routeBinding = { agentId: 'agent-d0041-one', routeGeneration: 3 };
  const preparation = deriveInstallableAgentCredentialPreparation({ routeBinding, routeRead: routeRead(state) });

  assert.equal(preparation.profile, 'tdev.agent-credential-provisioning.v1');
  assert.equal(preparation.managementRequestId, 'm2:9');
  assert.equal(preparation.installationGeneration, 3);
  assert.equal(preparation.credentialGeneration, 5);
  assert.match(preparation.credentialRef, /^androidkeystore:\/\/com\.termux\.api\/tdev\.a1\.[A-Za-z0-9_-]{43}$/);
  assert.match(installableAgentCredentialProvisioningDigest(preparation), /^sha256:[0-9a-f]{64}$/);
  assert.match(installableAgentCredentialProvisioningId(preparation), /^cp1\.[0-9a-f]{64}$/);
  assert.equal(installableAgentCredentialProvisioningId(preparation), installableAgentCredentialProvisioningId({ ...preparation }));

  assert.throws(
    () => normalizeInstallableAgentCredentialPreparation({ ...preparation, credentialRef: `${preparation.credentialRef}-substitution` }),
    expectCode('pre_genesis_credential_ref_mismatch'),
  );
  assert.throws(
    () => deriveInstallableAgentCredentialPreparation({
      routeBinding,
      routeRead: { ...routeRead(state), predecessorDigest: digest({ stale: true }) },
    }),
    expectCode('pre_genesis_predecessor_mismatch'),
  );
  assert.throws(
    () => deriveInstallableAgentCredentialPreparation({ routeBinding, routeRead: routeRead({ ...state, state: 'CURRENT' }) }),
    expectCode('pre_genesis_route_not_unregistered'),
  );
});

test('D0041 release projection is root-verified, next-generation bound, and complete over signer dispositions', async () => {
  const root = ed25519Pair();
  const signer = ed25519Pair();
  const retired = ed25519Pair();
  const routeBinding = { agentId: 'agent-d0041-release', routeGeneration: 7 };
  const state = routeState({
    trustPolicyGenerationHighWater: 2,
    releaseRootKeyId: installableAgentReleaseRootKeyId(root.publicJwk),
    releaseRootPublicKey: root.publicJwk,
  });
  const subject = {
    packageProfile: 'tdev.installable-agent-package.v1',
    capabilityProfile: 'tdev.agent.termux.pidfd.v1',
    serviceHostProfile: 'tdev.installable-agent-termux-service.v1',
    targetPlatform: 'android',
    targetArch: 'arm64',
  };
  const delegation = {
    profile: INSTALLABLE_AGENT_RELEASE_DELEGATION_PROFILE,
    agentId: routeBinding.agentId,
    routeGeneration: routeBinding.routeGeneration,
    trustPolicyGeneration: 3,
    rootKeyId: state.releaseRootKeyId,
    signers: [
      { keyId: installableAgentReleaseSignerKeyId(signer.publicJwk), publicKey: signer.publicJwk, disposition: 'active', subjects: [subject] },
      { keyId: installableAgentReleaseSignerKeyId(retired.publicJwk), publicKey: retired.publicJwk, disposition: 'retired', subjects: [subject] },
    ].sort((left, right) => left.keyId < right.keyId ? -1 : left.keyId > right.keyId ? 1 : 0),
  };
  const delegationSignature = signEd(root.privateKey, INSTALLABLE_AGENT_RELEASE_DELEGATION_PROFILE, delegation);
  const manifest = {
    profile: subject.packageProfile,
    capabilityProfile: subject.capabilityProfile,
    serviceHostProfile: subject.serviceHostProfile,
    target: { platform: subject.targetPlatform, arch: subject.targetArch },
  };
  const archiveBytes = Buffer.from('d0041 signed archive bytes');
  const releaseManifestDigest = digest({ manifest: canonicalJson(manifest) });
  const statement = {
    profile: INSTALLABLE_AGENT_RELEASE_STATEMENT_PROFILE,
    releaseManifestDigest,
    archiveSha256: await rawSha256Hex(archiveBytes),
    signerKeyId: installableAgentReleaseSignerKeyId(signer.publicJwk),
  };
  const statementSignature = signEd(signer.privateKey, INSTALLABLE_AGENT_RELEASE_STATEMENT_PROFILE, statement);
  const projection = await verifyAndProjectInstallableAgentReleaseTrust({
    routeBinding,
    routeRead: routeRead(state),
    delegation,
    delegationSignature,
    statement,
    statementSignature,
    archiveBytes,
    manifest,
    releaseManifestDigest,
  });

  assert.equal(projection.releaseRootKeyId, state.releaseRootKeyId);
  assert.equal(projection.trustPolicyGeneration, 3);
  assert.equal(projection.packageManifestDigest, releaseManifestDigest);
  assert.equal(projection.packageTrustSubjectDigest, statement.signerKeyId);
  assert.equal(projection.trustSubjects[statement.signerKeyId], 'active');
  assert.equal(projection.trustSubjects[installableAgentReleaseSignerKeyId(retired.publicJwk)], 'retired');
  assert.match(projection.trustStateDigest, /^sha256:[0-9a-f]{64}$/);

  const wrongGeneration = { ...delegation, trustPolicyGeneration: 4 };
  await assert.rejects(
    verifyAndProjectInstallableAgentReleaseTrust({
      routeBinding,
      routeRead: routeRead(state),
      delegation: wrongGeneration,
      delegationSignature: signEd(root.privateKey, INSTALLABLE_AGENT_RELEASE_DELEGATION_PROFILE, wrongGeneration),
      statement,
      statementSignature,
      archiveBytes,
      manifest,
      releaseManifestDigest,
    }),
    expectCode('pre_genesis_trust_generation_mismatch'),
  );
});
