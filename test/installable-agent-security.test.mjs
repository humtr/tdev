import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';

import {
  INSTALLABLE_AGENT_BOOTSTRAP_CAPSULE_PROFILE,
  INSTALLABLE_AGENT_CONNECT_POSSESSION_ENVELOPE_PROFILE,
  INSTALLABLE_AGENT_CONNECT_POSSESSION_PROFILE,
  INSTALLABLE_AGENT_KEYSTORE_ALIAS_PROFILE,
  INSTALLABLE_AGENT_MANAGEMENT_ENVELOPE_PROFILE,
  INSTALLABLE_AGENT_RELEASE_DELEGATION_PROFILE,
  INSTALLABLE_AGENT_RELEASE_STATEMENT_PROFILE,
  bootstrapTrustCapsuleSha256,
  canonicalJson,
  decodeBase64Url,
  digest,
  encodeBase64Url,
  installableAgentCredentialKeyId,
  installableAgentCredentialRef,
  installableAgentManagementKeyId,
  installableAgentReleaseRootKeyId,
  installableAgentReleaseSignerKeyId,
  parseInstallableAgentCredentialRef,
  rawSha256Hex,
  signedRecordBytes,
  verifyBootstrapTrustCapsule,
  verifyInstallableAgentConnectPossessionEnvelope,
  verifyInstallableAgentManagementEnvelope,
  verifyInstallableAgentReleaseStatement,
  verifyReleaseDelegation,
} from '../src/index.mjs';

function ed25519Pair() {
  const pair = generateKeyPairSync('ed25519');
  return { ...pair, publicJwk: pair.publicKey.export({ format: 'jwk' }) };
}

function rsa3072Pair() {
  const pair = generateKeyPairSync('rsa', { modulusLength: 3072, publicExponent: 0x10001 });
  return { ...pair, publicJwk: pair.publicKey.export({ format: 'jwk' }) };
}

function signEd(privateKey, domain, record) {
  return encodeBase64Url(sign(null, signedRecordBytes(domain, record), privateKey));
}

function signRsa(privateKey, domain, record) {
  return encodeBase64Url(sign('sha256', signedRecordBytes(domain, record), privateKey));
}

function expectCode(code) {
  return (error) => error?.code === code;
}

test('canonical key and base64url profiles reject alternate encodings', () => {
  assert.deepEqual([...decodeBase64Url('AQID')], [1, 2, 3]);
  assert.throws(() => decodeBase64Url('AQID='), expectCode('invalid_base64url'));
  assert.throws(() => decodeBase64Url('AQ+_'), expectCode('invalid_base64url'));

  const rsa = rsa3072Pair();
  const credentialKeyId = installableAgentCredentialKeyId(rsa.publicJwk);
  assert.match(credentialKeyId, /^sha256:[0-9a-f]{64}$/);
  assert.throws(() => installableAgentCredentialKeyId({ ...rsa.publicJwk, alg: 'RS256' }));

  const management = ed25519Pair();
  const managementKeyId = installableAgentManagementKeyId(management.publicJwk);
  assert.match(managementKeyId, /^sha256:[0-9a-f]{64}$/);
  assert.throws(() => installableAgentManagementKeyId({ ...management.publicJwk, use: 'sig' }));
});

test('Ed25519 management envelope is domain-separated and exact-context bound', async () => {
  const management = ed25519Pair();
  const context = {
    agentId: 'agent-security-one',
    routeGeneration: 7,
    operation: 'stop',
    managementRequestId: 'm2:3',
    intentDigest: digest({ intent: 'stop' }),
    expectedPredecessorDigest: digest({ predecessor: 'current' }),
  };
  const envelope = {
    profile: INSTALLABLE_AGENT_MANAGEMENT_ENVELOPE_PROFILE,
    keyId: installableAgentManagementKeyId(management.publicJwk),
    context,
    signature: signEd(management.privateKey, 'tdev.agent-management.v1', context),
  };
  await verifyInstallableAgentManagementEnvelope({ envelope, context, managementPublicJwk: management.publicJwk });
  await assert.rejects(
    verifyInstallableAgentManagementEnvelope({ envelope: { ...envelope, context: { ...context, operation: 'start' } }, context, managementPublicJwk: management.publicJwk }),
    expectCode('management_proof_mismatch'),
  );
  const wrongDomain = { ...envelope, signature: signEd(management.privateKey, 'tdev.installable-agent-release-statement.v1', context) };
  await assert.rejects(
    verifyInstallableAgentManagementEnvelope({ envelope: wrongDomain, context, managementPublicJwk: management.publicJwk }),
    expectCode('signature_verification_failed'),
  );
});

test('RSA-3072 possession envelope binds the exact live challenge and current credential key', async () => {
  const credential = rsa3072Pair();
  const context = {
    profile: INSTALLABLE_AGENT_CONNECT_POSSESSION_PROFILE,
    agentId: 'agent-security-one',
    routeGeneration: 7,
    challengeGeneration: 9,
    nonce: encodeBase64Url(Buffer.alloc(32, 7)),
    credentialGeneration: 4,
    credentialKeyId: installableAgentCredentialKeyId(credential.publicJwk),
    connectRequestDigest: digest({ connect: 'request' }),
    issuedAtMs: 1000,
    expiresAtMs: 121000,
  };
  const envelope = {
    profile: INSTALLABLE_AGENT_CONNECT_POSSESSION_ENVELOPE_PROFILE,
    keyId: context.credentialKeyId,
    context,
    signature: signRsa(credential.privateKey, INSTALLABLE_AGENT_CONNECT_POSSESSION_PROFILE, context),
  };
  await verifyInstallableAgentConnectPossessionEnvelope({ envelope, context, credentialPublicJwk: credential.publicJwk });
  assert.equal(decodeBase64Url(envelope.signature).byteLength, 384);
  await assert.rejects(
    verifyInstallableAgentConnectPossessionEnvelope({ envelope: { ...envelope, signature: encodeBase64Url(Buffer.alloc(384)) }, context, credentialPublicJwk: credential.publicJwk }),
    expectCode('signature_verification_failed'),
  );
  await assert.rejects(
    verifyInstallableAgentConnectPossessionEnvelope({ envelope, context: { ...context, challengeGeneration: 10 }, credentialPublicJwk: credential.publicJwk }),
    expectCode('agent_possession_mismatch'),
  );
});

test('offline release root delegates bounded signer authority and release statement binds archive and subject', async () => {
  const root = ed25519Pair();
  const signer = ed25519Pair();
  const subject = {
    packageProfile: 'tdev.installable-agent-package.v1',
    capabilityProfile: 'tdev.agent.termux.pidfd.v1',
    serviceHostProfile: 'tdev.installable-agent-termux-service.v1',
    targetPlatform: 'android',
    targetArch: 'arm64',
  };
  const delegation = {
    profile: INSTALLABLE_AGENT_RELEASE_DELEGATION_PROFILE,
    agentId: 'agent-security-one',
    routeGeneration: 7,
    trustPolicyGeneration: 2,
    rootKeyId: installableAgentReleaseRootKeyId(root.publicJwk),
    signers: [{
      keyId: installableAgentReleaseSignerKeyId(signer.publicJwk),
      publicKey: signer.publicJwk,
      disposition: 'active',
      subjects: [subject],
    }],
  };
  const delegationSignature = signEd(root.privateKey, INSTALLABLE_AGENT_RELEASE_DELEGATION_PROFILE, delegation);
  const verifiedDelegation = await verifyReleaseDelegation({ delegation, signature: delegationSignature, releaseRootPublicJwk: root.publicJwk });

  const manifest = {
    profile: subject.packageProfile,
    capabilityProfile: subject.capabilityProfile,
    serviceHostProfile: subject.serviceHostProfile,
    target: { platform: subject.targetPlatform, arch: subject.targetArch },
  };
  const archiveBytes = Buffer.from('signed release archive bytes');
  const releaseManifestDigest = digest({ manifest: canonicalJson(manifest) });
  const statement = {
    profile: INSTALLABLE_AGENT_RELEASE_STATEMENT_PROFILE,
    releaseManifestDigest,
    archiveSha256: await rawSha256Hex(archiveBytes),
    signerKeyId: installableAgentReleaseSignerKeyId(signer.publicJwk),
  };
  const statementSignature = signEd(signer.privateKey, INSTALLABLE_AGENT_RELEASE_STATEMENT_PROFILE, statement);
  const verified = await verifyInstallableAgentReleaseStatement({
    delegation: verifiedDelegation,
    statement,
    signature: statementSignature,
    archiveBytes,
    manifest,
    releaseManifestDigest,
  });
  assert.equal(verified.signerKeyId, statement.signerKeyId);
  await assert.rejects(
    verifyInstallableAgentReleaseStatement({
      delegation: verifiedDelegation,
      statement,
      signature: statementSignature,
      archiveBytes: Buffer.from('tampered archive'),
      manifest,
      releaseManifestDigest,
    }),
    expectCode('release_archive_mismatch'),
  );
});

test('bootstrap capsule and deterministic AndroidKeyStore reference fail closed on tamper', async () => {
  const management = ed25519Pair();
  const root = ed25519Pair();
  const verifierBytes = Buffer.from('bootstrap verifier exact bytes');
  const capsule = {
    profile: INSTALLABLE_AGENT_BOOTSTRAP_CAPSULE_PROFILE,
    routeBinding: {
      provider: 'cloudflare',
      namespace: 'agent-delivery',
      durableObjectId: 'route-object-one',
      agentId: 'agent-security-one',
      routeGeneration: 7,
      jurisdiction: 'eu',
    },
    managementKeyId: installableAgentManagementKeyId(management.publicJwk),
    managementPublicKey: management.publicJwk,
    releaseRootKeyId: installableAgentReleaseRootKeyId(root.publicJwk),
    releaseRootPublicKey: root.publicJwk,
    initialTrustPolicyGeneration: 1,
    initialDelegationDigest: digest({ delegation: 'initial' }),
    bootstrapVerifierProfile: 'tdev.agent-bootstrap-verifier.v1',
    bootstrapVerifierSha256: await rawSha256Hex(verifierBytes),
  };
  const capsuleDigest = await bootstrapTrustCapsuleSha256(capsule);
  await verifyBootstrapTrustCapsule({ capsule, expectedCapsuleSha256: capsuleDigest, bootstrapVerifierBytes: verifierBytes });
  await assert.rejects(
    verifyBootstrapTrustCapsule({ capsule: { ...capsule, routeBinding: { ...capsule.routeBinding, routeGeneration: 8 } }, expectedCapsuleSha256: capsuleDigest, bootstrapVerifierBytes: verifierBytes }),
    expectCode('bootstrap_capsule_digest_mismatch'),
  );

  const credentialRef = installableAgentCredentialRef({
    profile: INSTALLABLE_AGENT_KEYSTORE_ALIAS_PROFILE,
    agentId: 'agent-security-one',
    routeGeneration: 7,
    installationGeneration: 3,
    credentialGeneration: 4,
  });
  assert.match(credentialRef, /^androidkeystore:\/\/com\.termux\.api\/tdev\.a1\.[A-Za-z0-9_-]{43}$/);
  assert.equal(parseInstallableAgentCredentialRef(credentialRef).packageName, 'com.termux.api');
  assert.throws(() => parseInstallableAgentCredentialRef('/tmp/credential.key'), expectCode('invalid_agent_credential_ref'));
});
