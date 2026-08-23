import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';

import {
  INSTALLABLE_AGENT_CONNECT_POSSESSION_PROFILE,
  INSTALLABLE_AGENT_KEYSTORE_ALIAS_PROFILE,
  InstallableAgentConnectChallengeClient,
  TermuxAndroidKeyStoreCredential,
  computeAgentConnectRequestDigest,
  createTermuxAndroidSourceLineageReader,
  digest,
  installableAgentCredentialKeyId,
  installableAgentCredentialRef,
  runInstallableAgentControlCli,
} from '../src/index.mjs';

function tuple() {
  return {
    installationGeneration: 3,
    credentialGeneration: 5,
    packageActivationGeneration: 7,
    packageManifestDigest: digest({ package: 'production-composition' }),
    trustPolicyGeneration: 11,
    trustStateDigest: digest({ trust: 'production-composition' }),
    lifecycleGeneration: 13,
  };
}

function d0039Config() {
  const installableAgentTuple = tuple();
  return {
    schemaVersion: 1,
    profile: 'tdev.installable-agent-control.v1',
    agentId: 'agent-production-composition',
    routeGeneration: 17,
    executorId: 'executor-production-composition',
    executorEpoch: 19,
    agentDeliveryUrl: 'wss://agent.example.invalid/agent-delivery/v1/connect',
    stateDirectory: '/tmp/tdev-production-composition',
    credentialRef: installableAgentCredentialRef({
      profile: INSTALLABLE_AGENT_KEYSTORE_ALIAS_PROFILE,
      agentId: 'agent-production-composition',
      routeGeneration: 17,
      installationGeneration: installableAgentTuple.installationGeneration,
      credentialGeneration: installableAgentTuple.credentialGeneration,
    }),
    androidSourceLineageId: 'a'.repeat(64),
    installableAgentTuple,
    protocolMetadataDigest: digest({ protocol: 'production-composition' }),
    reportedCapacity: 1,
  };
}

function challengeRequest() {
  const config = d0039Config();
  return {
    agentId: config.agentId,
    routeGeneration: config.routeGeneration,
    expectedConnectionEpoch: 0,
    connectRequestId: 'c1:1',
    connectionId: 'connection-production-composition',
    executorId: config.executorId,
    executorEpoch: config.executorEpoch,
    protocolMetadataDigest: config.protocolMetadataDigest,
    installableAgentTuple: config.installableAgentTuple,
  };
}

test('direct production control CLI assembles AndroidKeyStore lineage and challenge transport dependencies', async () => {
  const config = d0039Config();
  let captured = null;
  const control = await runInstallableAgentControlCli({
    argv: ['--config', '/tmp/tdev-production-composition.json'],
    moduleUrl: 'file:///opt/tdev-agent/src/installable-agent-control.mjs',
    readConfig: async () => config,
    createProcess: async (input) => {
      captured = input;
      return { async run() {}, stop() {} };
    },
  });
  assert.ok(control);
  assert.equal(captured.packageRoot, '/opt/tdev-agent');
  assert.ok(captured.credentialAdapter instanceof TermuxAndroidKeyStoreCredential);
  assert.ok(captured.challengeClient instanceof InstallableAgentConnectChallengeClient);
  assert.equal(captured.credentialAdapter.sourceLineageReader.constructor.name, 'AsyncFunction');
  assert.deepEqual(Object.keys(captured).sort(), ['challengeClient', 'config', 'credentialAdapter', 'packageRoot']);
});

test('production challenge client derives POST from the sole connect route while the owner binds its recomputed digest', async () => {
  const input = challengeRequest();
  const key = generateKeyPairSync('rsa', { modulusLength: 3072, publicExponent: 0x10001 }).publicKey.export({ format: 'jwk' });
  const credentialKeyId = installableAgentCredentialKeyId(key);
  let observed = null;
  const client = new InstallableAgentConnectChallengeClient({
    endpoint: 'wss://agent.example.invalid/agent-delivery/v1/connect?discarded=1',
    fetchImpl: async (url, init) => {
      observed = { url: String(url), init, body: JSON.parse(init.body) };
      const context = {
        profile: INSTALLABLE_AGENT_CONNECT_POSSESSION_PROFILE,
        agentId: input.agentId,
        routeGeneration: input.routeGeneration,
        challengeGeneration: 1,
        nonce: 'A'.repeat(43),
        credentialGeneration: input.installableAgentTuple.credentialGeneration,
        credentialKeyId,
        connectRequestDigest: computeAgentConnectRequestDigest(input),
        issuedAtMs: 1,
        expiresAtMs: 120001,
      };
      return new Response(JSON.stringify({ classification: 'accepted', challenge: context }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  const response = await client.issue(input);
  const url = new URL(observed.url);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.pathname, '/agent-delivery/v1/connect');
  assert.deepEqual([...url.searchParams.keys()].sort(), ['agentId', 'routeGeneration']);
  assert.equal(observed.init.method, 'POST');
  assert.equal('authorization' in observed.init.headers, false);
  assert.equal(Object.hasOwn(observed.body, 'requestDigest'), false);
  assert.equal(response.challenge.connectRequestDigest, computeAgentConnectRequestDigest(input));
});

test('independent Android source-lineage reader fails closed on missing package and source-family switch', async () => {
  const matching = createTermuxAndroidSourceLineageReader({
    packagePathRunner: async (packageName) => ({ exitCode: 0, signal: null, stdout: `package:/data/app/${packageName}/base.apk\n`, stderr: '' }),
    signingCertificateReader: async () => ({ androidSourceLineageId: 'b'.repeat(64) }),
  });
  assert.deepEqual(await matching({ packages: ['com.termux', 'com.termux.api'] }), {
    'com.termux': 'b'.repeat(64),
    'com.termux.api': 'b'.repeat(64),
  });

  const missing = createTermuxAndroidSourceLineageReader({
    packagePathRunner: async () => ({ exitCode: 1, signal: null, stdout: '', stderr: '' }),
    signingCertificateReader: async () => ({ androidSourceLineageId: 'b'.repeat(64) }),
  });
  await assert.rejects(missing({ packages: ['com.termux', 'com.termux.api'] }), (error) => error?.code === 'android_package_unavailable');

  const switched = createTermuxAndroidSourceLineageReader({
    packagePathRunner: async (packageName) => ({ exitCode: 0, signal: null, stdout: `package:/data/app/${packageName}/base.apk\n`, stderr: '' }),
    signingCertificateReader: async (apkPath) => ({ androidSourceLineageId: apkPath.includes('com.termux.api') ? 'c'.repeat(64) : 'b'.repeat(64) }),
  });
  const readback = await switched({ packages: ['com.termux', 'com.termux.api'] });
  const adapter = new TermuxAndroidKeyStoreCredential({ commandRunner: async () => { throw new Error('must not reach keystore'); }, sourceLineageReader: async () => readback });
  await assert.rejects(adapter.verifySourceLineage('b'.repeat(64)), (error) => error?.code === 'android_source_lineage_mismatch');
});
