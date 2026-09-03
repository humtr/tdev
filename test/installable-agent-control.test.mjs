import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  INSTALLABLE_AGENT_MANAGEMENT_PROTOCOL_PROFILE,
  INSTALLABLE_AGENT_CONNECT_POSSESSION_ENVELOPE_PROFILE,
  INSTALLABLE_AGENT_CONNECT_POSSESSION_PROFILE,
  INSTALLABLE_AGENT_KEYSTORE_ALIAS_PROFILE,
  INSTALLABLE_AGENT_PACKAGE_CONFIG_SCHEMA,
  INSTALLABLE_AGENT_PACKAGE_PROFILE,
  INSTALLABLE_AGENT_SUPERVISOR_SERVICE_PROTOCOL,
  INSTALLABLE_AGENT_TERMUX_SERVICE_PROFILE,
  LOCAL_AGENT_AUTH_PROTOCOL_PREFIX,
  LOCAL_AGENT_POSSESSION_PROTOCOL_PREFIX,
  LOCAL_AGENT_WEBSOCKET_PROTOCOL,
  InstallableAgentSupervisorServiceClient,
  canonicalJson,
  computeAgentConnectRequestDigest,
  createInstallableAgentControlProcess,
  digest,
  encodeBase64Url,
  installableAgentCredentialRef,
} from '../src/index.mjs';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function toolProfilesDocument() {
  return {
    schemaVersion: 1,
    profile: 'tdev.installable-agent-tool-profiles.v1',
    profiles: {
      'diagnostic.node.version.v1': {
        executable: { kind: 'node_runtime' },
        argv: [{ kind: 'literal', value: '--version' }],
        stdin: { kind: 'none' },
        environment: {},
        limits: { timeoutMs: 10000, maxOutputBytes: 65536 },
        network: 'none',
        filesystem: 'none',
        cleanupDomain: 'warden_process_group',
      },
    },
  };
}

async function createControlFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tdev-d0027-control-test-'));
  const packageRoot = path.join(root, 'package');
  const stateDirectory = path.join(root, 'state');
  const prefix = path.join(root, 'prefix');
  await mkdir(path.join(packageRoot, 'config'), { recursive: true });
  await mkdir(path.join(packageRoot, 'native', 'helper'), { recursive: true });
  const helper = Buffer.from('fixture-native-helper');
  const profiles = Buffer.from(`${canonicalJson(toolProfilesDocument())}\n`);
  await writeFile(path.join(packageRoot, 'native', 'helper', 'pidfd-control.node'), helper);
  await writeFile(path.join(packageRoot, 'config', 'installable-agent-tool-profiles.json'), profiles);
  const developmentOperationProfiles = await readFile(new URL('../config/development-operation-profiles.json', import.meta.url));
  await writeFile(path.join(packageRoot, 'config', 'development-operation-profiles.json'), developmentOperationProfiles);
  const files = {
    'config/installable-agent-tool-profiles.json': { sha256: sha256(profiles), bytes: profiles.byteLength, role: 'package-tool-profiles' },
    'config/development-operation-profiles.json': { sha256: sha256(developmentOperationProfiles), bytes: developmentOperationProfiles.byteLength, role: 'package-development-operation-profiles' },
    'native/helper/pidfd-control.node': { sha256: sha256(helper), bytes: helper.byteLength, role: 'native-pidfd-helper' },
  };
  const manifest = {
    schemaVersion: 1,
    profile: INSTALLABLE_AGENT_PACKAGE_PROFILE,
    sourceRevision: 'b'.repeat(40),
    target: { platform: process.platform, arch: process.arch },
    runtime: { nodeMajorMinimum: 22 },
    stateSchemas: {
      agentDeliverySnapshot: 3,
      supervisorJournal: 1,
      packageState: 1,
      managementJournal: 1,
      controlConnection: 1,
    },
    protocols: {
      agentWebSocket: LOCAL_AGENT_WEBSOCKET_PROTOCOL,
      management: INSTALLABLE_AGENT_MANAGEMENT_PROTOCOL_PROFILE,
      supervisorService: INSTALLABLE_AGENT_SUPERVISOR_SERVICE_PROTOCOL,
    },
    capabilityProfile: 'tdev.agent.termux.pidfd.v1',
    serviceHostProfile: INSTALLABLE_AGENT_TERMUX_SERVICE_PROFILE,
    configurationSchemaDigest: digest(INSTALLABLE_AGENT_PACKAGE_CONFIG_SCHEMA),
    toolProfiles: {
      relativePath: 'config/installable-agent-tool-profiles.json',
      sha256: sha256(profiles),
    },
    developmentOperationProfiles: {
      relativePath: 'config/development-operation-profiles.json',
      sha256: sha256(developmentOperationProfiles),
    },
    helperAbi: {
      profile: 'tdev.agent.termux.pidfd.v1',
      abiVersion: 1,
      relativePath: 'native/helper/pidfd-control.node',
      sha256: sha256(helper),
    },
    files,
  };
  await writeFile(path.join(packageRoot, 'release-manifest.json'), `${canonicalJson(manifest)}\n`);
  const packageManifestDigest = digest(manifest);
  const installableAgentTuple = {
    installationGeneration: 3,
    credentialGeneration: 5,
    packageActivationGeneration: 7,
    packageManifestDigest,
    trustPolicyGeneration: 11,
    trustStateDigest: digest({ trust: 'control-test' }),
    lifecycleGeneration: 13,
  };
  const credentialRef = path.join(root, 'credential-ref');
  const config = {
    schemaVersion: 1,
    profile: 'tdev.installable-agent-control.v1',
    agentId: 'agent-control-one',
    routeGeneration: 1,
    executorId: 'executor-control-one',
    executorEpoch: 1,
    agentDeliveryUrl: 'wss://agent.example.invalid/agent/connect',
    stateDirectory,
    credentialRef,
    installableAgentTuple,
    protocolMetadataDigest: digest({ protocol: 'control-test' }),
    reportedCapacity: 2,
    reconnectDelayMs: 100,
  };
  const supervisorClient = new InstallableAgentSupervisorServiceClient({ socketPath: path.join(root, 'unused-supervisor.sock') });
  return { root, packageRoot, stateDirectory, prefix, credentialRef, config, installableAgentTuple, supervisorClient };
}

class FakeSocket {
  constructor() {
    this.listeners = new Map();
    this.sent = [];
    this.closeCalls = [];
  }

  addEventListener(type, listener, options = {}) {
    const entries = this.listeners.get(type) ?? [];
    entries.push({ listener, once: options?.once === true });
    this.listeners.set(type, entries);
  }

  removeEventListener(type, listener) {
    const entries = this.listeners.get(type) ?? [];
    this.listeners.set(type, entries.filter((entry) => entry.listener !== listener));
  }

  emit(type, event = {}) {
    const entries = [...(this.listeners.get(type) ?? [])];
    for (const entry of entries) {
      entry.listener(event);
      if (entry.once) this.removeEventListener(type, entry.listener);
    }
  }

  send(text) { this.sent.push(text); }

  close(code = 1000, reason = 'normal') {
    this.closeCalls.push({ code, reason });
    this.emit('close', { code, reason });
  }
}

function scriptedWebSocketFactory(script) {
  const calls = [];
  const sockets = [];
  let index = 0;
  const factory = (url, protocols) => {
    const socket = new FakeSocket();
    const action = script[index] ?? 'open';
    index += 1;
    calls.push({ url, protocols: [...protocols] });
    sockets.push(socket);
    queueMicrotask(() => socket.emit(action, action === 'error' ? { code: 'fixture_connect_error' } : {}));
    return socket;
  };
  return { factory, calls, sockets };
}

function dispatch(tuple, ordinal, executableBody) {
  return {
    type: 'dispatch',
    deliveryId: digest({ delivery: 'control-one' }),
    dispatchOrdinal: ordinal,
    authorizationId: digest({ authorization: `control-${ordinal}` }),
    dispatchGrantId: digest({ grant: `control-${ordinal}` }),
    caseId: 'case-control-one',
    taskId: 'task-control-one',
    attemptId: 'task-control-one.1',
    executorId: 'executor-control-one',
    executorEpoch: 1,
    fencingToken: digest({ fence: 'control-one' }),
    protocolVersion: 'agent-v1',
    executableBody,
    installableAgentTuple: tuple,
    socketIncarnationId: 'socket-control-one',
    firstEmissionAdmissionId: digest({ admission: `control-${ordinal}` }),
  };
}

const OPAQUE_AUTH_MATERIAL = 'k'.repeat(64);

test('control reconnect reuses one durable connect identity after response loss and never persists raw credential material', async (t) => {
  const fixture = await createControlFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const websocket = scriptedWebSocketFactory(['error', 'open']);
  const control = await createInstallableAgentControlProcess({
    packageRoot: fixture.packageRoot,
    config: fixture.config,
    prefix: fixture.prefix,
    supervisorClient: fixture.supervisorClient,
    credentialLoader: async (credentialRef) => {
      assert.equal(credentialRef, fixture.credentialRef);
      return OPAQUE_AUTH_MATERIAL;
    },
    webSocketFactory: websocket.factory,
  });

  assert.equal(control.developmentOperationCapabilities.length, 3);
  assert.deepEqual(control.runtime.identity().capabilities, control.developmentOperationCapabilities);

  await assert.rejects(control.connectOnce(), (error) => error?.code === 'local_transport_connect_failed');
  const pendingText = await readFile(path.join(fixture.stateDirectory, 'control-connection.json'), 'utf8');
  const pending = JSON.parse(pendingText);
  assert.equal(pending.pending.expectedConnectionEpoch, 0);
  assert.equal(pendingText.includes(OPAQUE_AUTH_MATERIAL), false);

  await control.connectOnce();
  assert.equal(websocket.calls.length, 2);
  const failedUrl = new URL(websocket.calls[0].url);
  const recoveredUrl = new URL(websocket.calls[1].url);
  assert.equal(recoveredUrl.searchParams.get('connectRequestId'), failedUrl.searchParams.get('connectRequestId'));
  assert.equal(recoveredUrl.searchParams.get('connectionId'), failedUrl.searchParams.get('connectionId'));
  assert.equal(recoveredUrl.searchParams.get('packageManifestDigest'), fixture.installableAgentTuple.packageManifestDigest);
  assert.equal(websocket.calls[1].protocols[0], LOCAL_AGENT_WEBSOCKET_PROTOCOL);
  assert.equal(websocket.calls[1].protocols[1].startsWith(LOCAL_AGENT_AUTH_PROTOCOL_PREFIX), true);
  assert.equal(websocket.calls[1].protocols.join('\n').includes(OPAQUE_AUTH_MATERIAL), false);
  const capacityFrame = JSON.parse(websocket.sockets[1].sent.at(-1));
  assert.equal(capacityFrame.type, 'capacity');
  assert.equal(capacityFrame.payload.reportedCapacity, 2);
  const recoveredStateText = await readFile(path.join(fixture.stateDirectory, 'control-connection.json'), 'utf8');
  const recoveredState = JSON.parse(recoveredStateText);
  assert.equal(recoveredState.lastConnectionEpoch, 1);
  assert.equal(recoveredState.pending, null);
  assert.equal(recoveredStateText.includes(OPAQUE_AUTH_MATERIAL), false);
  control.stop();
});

test('control process refuses to claim a D0027 tuple for a different local release', async (t) => {
  const fixture = await createControlFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const staleConfig = {
    ...fixture.config,
    installableAgentTuple: {
      ...fixture.installableAgentTuple,
      packageManifestDigest: digest({ otherPackage: true }),
    },
  };
  await assert.rejects(
    createInstallableAgentControlProcess({
      packageRoot: fixture.packageRoot,
      config: staleConfig,
      prefix: fixture.prefix,
      supervisorClient: fixture.supervisorClient,
      credentialLoader: async () => OPAQUE_AUTH_MATERIAL,
    }),
    (error) => error?.code === 'installable_agent_control_package_fence',
  );
});

test('package-owned tool profiles reject unknown profiles and Task argument injection before any supervisor handle can exist', async (t) => {
  const fixture = await createControlFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const websocket = scriptedWebSocketFactory(['open']);
  const control = await createInstallableAgentControlProcess({
    packageRoot: fixture.packageRoot,
    config: fixture.config,
    prefix: fixture.prefix,
    supervisorClient: fixture.supervisorClient,
    credentialLoader: async () => OPAQUE_AUTH_MATERIAL,
    webSocketFactory: websocket.factory,
  });
  await control.connectOnce();

  const unknown = await control.runtime.handleDispatch(dispatch(
    fixture.installableAgentTuple,
    1,
    { profile: 'unknown.profile.v1', arguments: {} },
  ));
  assert.equal(unknown.classification, 'not_started');
  assert.equal(unknown.noHandle, true);

  const injected = await control.runtime.handleDispatch(dispatch(
    fixture.installableAgentTuple,
    2,
    { profile: 'diagnostic.node.version.v1', arguments: { injected: '--eval' } },
  ));
  assert.equal(injected.classification, 'not_started');
  assert.equal(injected.noHandle, true);
  control.stop();
});

function d0039ControlConfig(fixture) {
  return {
    ...fixture.config,
    credentialRef: installableAgentCredentialRef({
      profile: INSTALLABLE_AGENT_KEYSTORE_ALIAS_PROFILE,
      agentId: fixture.config.agentId,
      routeGeneration: fixture.config.routeGeneration,
      installationGeneration: fixture.installableAgentTuple.installationGeneration,
      credentialGeneration: fixture.installableAgentTuple.credentialGeneration,
    }),
    androidSourceLineageId: 'd'.repeat(64),
  };
}

function d0039ControlAdapters(config, { mismatch = null } = {}) {
  const credentialKeyId = digest({ credential: 'control-d0039' });
  const calls = { lineage: 0, readback: 0, challenges: [], signs: [] };
  const credentialAdapter = {
    async verifySourceLineage(lineage) { calls.lineage += 1; assert.equal(lineage, config.androidSourceLineageId); },
    async readPublicVerifier(credentialRef) { calls.readback += 1; assert.equal(credentialRef, config.credentialRef); return { credentialKeyId }; },
    async signPossession(input) {
      calls.signs.push(input);
      return {
        profile: INSTALLABLE_AGENT_CONNECT_POSSESSION_ENVELOPE_PROFILE,
        keyId: credentialKeyId,
        context: input.context,
        signature: encodeBase64Url(Buffer.alloc(384, 9)),
      };
    },
  };
  const challengeClient = {
    async issue(request) {
      calls.challenges.push(request);
      const challenge = {
        profile: INSTALLABLE_AGENT_CONNECT_POSSESSION_PROFILE,
        agentId: request.agentId,
        routeGeneration: request.routeGeneration,
        challengeGeneration: calls.challenges.length,
        nonce: encodeBase64Url(Buffer.alloc(32, calls.challenges.length)),
        credentialGeneration: request.installableAgentTuple.credentialGeneration,
        credentialKeyId,
        connectRequestDigest: computeAgentConnectRequestDigest(request),
        issuedAtMs: calls.challenges.length,
        expiresAtMs: 120000 + calls.challenges.length,
      };
      if (mismatch !== null) challenge[mismatch] = mismatch === 'routeGeneration' ? challenge[mismatch] + 1 : digest({ wrong: mismatch });
      return { classification: 'accepted', challenge };
    },
  };
  return { credentialAdapter, challengeClient, calls };
}

test('D0039 control composes lineage, verifier, fresh challenge, possession signature, and exact c1 retry without HMAC', async (t) => {
  const fixture = await createControlFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const config = d0039ControlConfig(fixture);
  const adapters = d0039ControlAdapters(config);
  const websocket = scriptedWebSocketFactory(['error', 'open']);
  const control = await createInstallableAgentControlProcess({
    packageRoot: fixture.packageRoot,
    config,
    prefix: fixture.prefix,
    supervisorClient: fixture.supervisorClient,
    webSocketFactory: websocket.factory,
    credentialAdapter: adapters.credentialAdapter,
    challengeClient: adapters.challengeClient,
  });
  await assert.rejects(control.connectOnce(), (error) => error?.code === 'local_transport_connect_failed');
  await control.connectOnce();
  assert.equal(adapters.calls.lineage, 1);
  assert.equal(adapters.calls.readback, 1);
  assert.equal(adapters.calls.challenges.length, 2);
  assert.equal(adapters.calls.signs.length, 2);
  assert.equal(adapters.calls.challenges[0].connectRequestId, 'c1:1');
  assert.equal(adapters.calls.challenges[1].connectRequestId, 'c1:1');
  assert.equal(adapters.calls.challenges[0].connectionId, adapters.calls.challenges[1].connectionId);
  assert.equal(websocket.calls[1].protocols[1].startsWith(LOCAL_AGENT_POSSESSION_PROTOCOL_PREFIX), true);
  assert.equal(websocket.calls[1].protocols.some((value) => value.startsWith(LOCAL_AGENT_AUTH_PROTOCOL_PREFIX)), false);
  const stateText = await readFile(path.join(fixture.stateDirectory, 'control-connection.json'), 'utf8');
  assert.equal(stateText.includes('private'), false);
  assert.equal(JSON.parse(stateText).lastConnectRequestSequence, 1);
  control.stop();
});

test('D0039 control fails closed for missing dependencies and a challenge not bound to the exact request', async (t) => {
  const fixture = await createControlFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const config = d0039ControlConfig(fixture);
  await assert.rejects(
    createInstallableAgentControlProcess({
      packageRoot: fixture.packageRoot,
      config,
      prefix: fixture.prefix,
      supervisorClient: fixture.supervisorClient,
    }),
    (error) => error?.code === 'installable_agent_keystore_adapter_unconfigured',
  );
  const adapters = d0039ControlAdapters(config, { mismatch: 'connectRequestDigest' });
  const websocket = scriptedWebSocketFactory(['open']);
  const control = await createInstallableAgentControlProcess({
    packageRoot: fixture.packageRoot,
    config,
    prefix: fixture.prefix,
    supervisorClient: fixture.supervisorClient,
    webSocketFactory: websocket.factory,
    credentialAdapter: adapters.credentialAdapter,
    challengeClient: adapters.challengeClient,
  });
  await assert.rejects(control.connectOnce(), (error) => error?.code === 'installable_agent_challenge_mismatch');
  assert.equal(adapters.calls.signs.length, 0);
  assert.equal(websocket.calls.length, 0);
  control.stop();
});
