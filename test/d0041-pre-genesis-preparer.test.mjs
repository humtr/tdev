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
  installableAgentCredentialKeyId,
  installableAgentCredentialRef,
  installableAgentPredecessorDigest,
  installableAgentReleaseRootKeyId,
  installableAgentReleaseSignerKeyId,
  rawSha256Hex,
  signedRecordBytes,
} from '../src/index.mjs';
import { prepareInstallableAgentPreGenesis } from '../qualification/installable-agent-d0041-pre-genesis-preparer.mjs';

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

function expectCode(code) {
  return (error) => error?.code === code;
}

function routeRead(state) {
  return {
    installableAgent: state,
    predecessorDigest: installableAgentPredecessorDigest(state),
    currentTuple: null,
    currentTupleDigest: null,
  };
}

async function fixture() {
  const root = ed25519Pair();
  const signer = ed25519Pair();
  const credentialPair = rsa3072Pair();
  const routeBinding = { agentId: 'agent-d0041-preparer', routeGeneration: 9 };
  const state = {
    ...createUnregisteredInstallableAgentState(),
    installationGenerationHighWater: 1,
    credentialGenerationHighWater: 2,
    trustPolicyGenerationHighWater: 3,
    managementRequestSequenceHighWater: 4,
    releaseRootKeyId: installableAgentReleaseRootKeyId(root.publicJwk),
    releaseRootPublicKey: root.publicJwk,
  };
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
    trustPolicyGeneration: 4,
    rootKeyId: state.releaseRootKeyId,
    signers: [{ keyId: installableAgentReleaseSignerKeyId(signer.publicJwk), publicKey: signer.publicJwk, disposition: 'active', subjects: [subject] }],
  };
  const delegationSignature = signEd(root.privateKey, INSTALLABLE_AGENT_RELEASE_DELEGATION_PROFILE, delegation);
  const manifest = {
    profile: subject.packageProfile,
    capabilityProfile: subject.capabilityProfile,
    serviceHostProfile: subject.serviceHostProfile,
    target: { platform: subject.targetPlatform, arch: subject.targetArch },
  };
  const archiveBytes = Buffer.from('d0041 preparer archive bytes');
  const releaseManifestDigest = digest({ manifest: canonicalJson(manifest) });
  const statement = {
    profile: INSTALLABLE_AGENT_RELEASE_STATEMENT_PROFILE,
    releaseManifestDigest,
    archiveSha256: await rawSha256Hex(archiveBytes),
    signerKeyId: installableAgentReleaseSignerKeyId(signer.publicJwk),
  };
  const statementSignature = signEd(signer.privateKey, INSTALLABLE_AGENT_RELEASE_STATEMENT_PROFILE, statement);
  const credentialKeyId = installableAgentCredentialKeyId(credentialPair.publicJwk);
  let deleteCalls = 0;
  const credential = {
    async provision({ aliasRecord }) {
      return {
        credentialRef: installableAgentCredentialRef(aliasRecord),
        credentialKeyId,
        publicJwk: credentialPair.publicJwk,
      };
    },
    async readPublicVerifier() {
      return { credentialKeyId, publicJwk: credentialPair.publicJwk };
    },
    async delete() { deleteCalls += 1; },
  };
  return {
    root, routeBinding, state, delegation, delegationSignature, statement, statementSignature,
    archiveBytes, manifest, releaseManifestDigest, credential, getDeleteCalls: () => deleteCalls,
  };
}

test('D0041 preparer returns reconciled register material without dispatch authority', async () => {
  const value = await fixture();
  let reads = 0;
  const output = await prepareInstallableAgentPreGenesis({
    ...value,
    androidSourceLineageId: 'd0041-lineage-one',
    readAuthoritativeRoute: async () => { reads += 1; return routeRead(value.state); },
  });

  assert.equal(reads, 2);
  assert.equal(output.preparation.managementRequestId, 'm2:5');
  assert.match(output.credentialProvisioningId, /^cp1\.[0-9a-f]{64}$/);
  assert.equal(output.register.credentialProvisioningId, output.credentialProvisioningId);
  assert.equal(output.register.packageTrustSubjectDigest, value.statement.signerKeyId);
  assert.equal(output.register.trustSubjects[value.statement.signerKeyId], 'active');
  assert.equal('dispatch' in output, false);
  assert.equal(value.getDeleteCalls(), 0);
});

test('D0041 preparer fails reconciliation after local provisioning if authoritative predecessor changes and does not clean up blindly', async () => {
  const value = await fixture();
  let reads = 0;
  await assert.rejects(
    prepareInstallableAgentPreGenesis({
      ...value,
      androidSourceLineageId: 'd0041-lineage-one',
      readAuthoritativeRoute: async () => {
        reads += 1;
        if (reads === 1) return routeRead(value.state);
        return routeRead({ ...value.state, managementRequestSequenceHighWater: value.state.managementRequestSequenceHighWater + 1 });
      },
    }),
    expectCode('pre_genesis_reconciliation_required'),
  );
  assert.equal(reads, 2);
  assert.equal(value.getDeleteCalls(), 0);
});
