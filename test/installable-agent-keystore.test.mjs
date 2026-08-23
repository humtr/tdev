import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INSTALLABLE_AGENT_CONNECT_POSSESSION_PROFILE,
  INSTALLABLE_AGENT_KEYSTORE_ALIAS_PROFILE,
  INSTALLABLE_AGENT_TERMUX_KEYSTORE_SIGN_ALGORITHM,
  TermuxAndroidKeyStoreCredential,
  digest,
  encodeBase64Url,
  installableAgentCredentialRef,
  signedRecordBytes,
} from '../src/index.mjs';

const LINEAGE = 'ab'.repeat(32);

function detailed(alias, overrides = {}) {
  return {
    alias,
    algorithm: 'RSA',
    size: 3072,
    modulus: `8${'1'.repeat(767)}`,
    exponent: '10001',
    inside_secure_hardware: false,
    user_authentication: { required: false, enforced_by_secure_hardware: false },
    ...overrides,
  };
}

function fakeRunner({ initial = [] } = {}) {
  const calls = [];
  const entries = [...initial];
  const runner = async ({ args, stdin = null }) => {
    calls.push({ args: [...args], stdin: stdin === null ? null : Buffer.from(stdin) });
    if (args[0] === 'list') return { exitCode: 0, signal: null, stdout: Buffer.from(JSON.stringify(entries)), stderr: Buffer.alloc(0) };
    if (args[0] === 'generate') {
      entries.push(detailed(args[1]));
      return { exitCode: 0, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
    }
    if (args[0] === 'sign') return { exitCode: 0, signal: null, stdout: Buffer.alloc(384, 7), stderr: Buffer.alloc(0) };
    if (args[0] === 'delete') {
      const index = entries.findIndex((entry) => entry.alias === args[1]);
      if (index >= 0) entries.splice(index, 1);
      return { exitCode: 0, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
    }
    throw new Error(`unexpected argv ${args.join(' ')}`);
  };
  return { runner, calls, entries };
}

function lineageReader(values = { 'com.termux': LINEAGE, 'com.termux.api': LINEAGE }) {
  return async ({ packages }) => {
    assert.deepEqual(packages, ['com.termux', 'com.termux.api']);
    return values;
  };
}

test('Termux AndroidKeyStore provisioning uses exact RSA-3072 CLI and returns only public verifier identity', async () => {
  const fake = fakeRunner();
  const adapter = new TermuxAndroidKeyStoreCredential({ commandRunner: fake.runner, sourceLineageReader: lineageReader() });
  const aliasRecord = {
    profile: INSTALLABLE_AGENT_KEYSTORE_ALIAS_PROFILE,
    agentId: 'agent-keystore-one',
    routeGeneration: 2,
    installationGeneration: 3,
    credentialGeneration: 4,
  };
  const result = await adapter.provision({ aliasRecord, androidSourceLineageId: LINEAGE });
  assert.equal(result.credentialRef, installableAgentCredentialRef(aliasRecord));
  assert.match(result.credentialKeyId, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(fake.calls.map((call) => call.args), [
    ['list', '-d'],
    ['generate', result.credentialRef.split('/').at(-1), '-a', 'RSA', '-s', '3072'],
    ['list', '-d'],
  ]);
  assert.equal('privateKey' in result, false);
  assert.equal('secret' in result, false);
});

test('Termux AndroidKeyStore rejects source-family mismatch and malformed verifier readback', async () => {
  const ref = installableAgentCredentialRef({
    profile: INSTALLABLE_AGENT_KEYSTORE_ALIAS_PROFILE,
    agentId: 'agent-keystore-one', routeGeneration: 2, installationGeneration: 3, credentialGeneration: 4,
  });
  const alias = ref.split('/').at(-1);
  const mismatch = new TermuxAndroidKeyStoreCredential({
    commandRunner: fakeRunner({ initial: [detailed(alias)] }).runner,
    sourceLineageReader: lineageReader({ 'com.termux': LINEAGE, 'com.termux.api': 'cd'.repeat(32) }),
  });
  await assert.rejects(mismatch.verifySourceLineage(LINEAGE), (error) => error?.code === 'android_source_lineage_mismatch');

  const malformed = new TermuxAndroidKeyStoreCredential({
    commandRunner: fakeRunner({ initial: [detailed(alias, { size: 2048 })] }).runner,
    sourceLineageReader: lineageReader(),
  });
  await assert.rejects(malformed.readPublicVerifier(ref), (error) => error?.code === 'invalid_termux_keystore_key');
});

test('Termux AndroidKeyStore possession signing uses exact SHA256withRSA bytes and fixed 384-byte output', async () => {
  const ref = installableAgentCredentialRef({
    profile: INSTALLABLE_AGENT_KEYSTORE_ALIAS_PROFILE,
    agentId: 'agent-keystore-one', routeGeneration: 2, installationGeneration: 3, credentialGeneration: 4,
  });
  const alias = ref.split('/').at(-1);
  const fake = fakeRunner({ initial: [detailed(alias)] });
  const adapter = new TermuxAndroidKeyStoreCredential({ commandRunner: fake.runner, sourceLineageReader: lineageReader() });
  const verifier = await adapter.readPublicVerifier(ref);
  const context = {
    profile: INSTALLABLE_AGENT_CONNECT_POSSESSION_PROFILE,
    agentId: 'agent-keystore-one',
    routeGeneration: 2,
    challengeGeneration: 1,
    nonce: encodeBase64Url(Buffer.alloc(32, 9)),
    credentialGeneration: 4,
    credentialKeyId: verifier.credentialKeyId,
    connectRequestDigest: digest({ connect: 'one' }),
    issuedAtMs: 100,
    expiresAtMs: 120100,
  };
  const envelope = await adapter.signPossession({
    credentialRef: ref,
    context,
    expectedCredentialKeyId: verifier.credentialKeyId,
    androidSourceLineageId: LINEAGE,
  });
  assert.equal(envelope.keyId, verifier.credentialKeyId);
  assert.equal(envelope.signature.length, 512);
  const signCall = fake.calls.find((call) => call.args[0] === 'sign');
  assert.deepEqual(signCall.args, ['sign', alias, INSTALLABLE_AGENT_TERMUX_KEYSTORE_SIGN_ALGORITHM]);
  assert.deepEqual(signCall.stdin, Buffer.from(signedRecordBytes(INSTALLABLE_AGENT_CONNECT_POSSESSION_PROFILE, context)));
});
