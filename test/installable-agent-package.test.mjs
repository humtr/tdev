import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  INSTALLABLE_AGENT_MANAGEMENT_PROTOCOL_PROFILE,
  INSTALLABLE_AGENT_PACKAGE_CONFIG_SCHEMA,
  INSTALLABLE_AGENT_PACKAGE_PROFILE,
  INSTALLABLE_AGENT_SUPERVISOR_SERVICE_PROTOCOL,
  INSTALLABLE_AGENT_TERMUX_SERVICE_PROFILE,
  InstallableAgentPackageManager,
  canonicalJson,
  digest,
  verifyInstallableAgentRelease,
} from '../src/index.mjs';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function createPackageFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tdev-d0027-package-test-'));
  const packageRoot = path.join(root, 'package');
  const stateDirectory = path.join(root, 'state');
  await mkdir(path.join(packageRoot, 'src'), { recursive: true });
  await mkdir(path.join(packageRoot, 'native', 'helper'), { recursive: true });
  await mkdir(path.join(packageRoot, 'config'), { recursive: true });
  const runtime = Buffer.from("export const packageRuntime = true;\n");
  const helper = Buffer.from('not-a-real-native-helper-but-manifest-bound');
  const toolProfiles = Buffer.from(`${canonicalJson({
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
  })}\n`);
  await writeFile(path.join(packageRoot, 'src', 'runtime.mjs'), runtime);
  await writeFile(path.join(packageRoot, 'native', 'helper', 'pidfd-control.node'), helper);
  await writeFile(path.join(packageRoot, 'config', 'installable-agent-tool-profiles.json'), toolProfiles);
  const developmentOperationProfiles = await readFile(new URL('../config/development-operation-profiles.json', import.meta.url));
  await writeFile(path.join(packageRoot, 'config', 'development-operation-profiles.json'), developmentOperationProfiles);
  const files = {
    'config/installable-agent-tool-profiles.json': { sha256: sha256(toolProfiles), bytes: toolProfiles.byteLength, role: 'package-tool-profiles' },
    'config/development-operation-profiles.json': { sha256: sha256(developmentOperationProfiles), bytes: developmentOperationProfiles.byteLength, role: 'package-development-operation-profiles' },
    'native/helper/pidfd-control.node': { sha256: sha256(helper), bytes: helper.byteLength, role: 'native-pidfd-helper' },
    'src/runtime.mjs': { sha256: sha256(runtime), bytes: runtime.byteLength, role: 'runtime' },
  };
  const manifest = {
    schemaVersion: 1,
    profile: INSTALLABLE_AGENT_PACKAGE_PROFILE,
    sourceRevision: 'a'.repeat(40),
    target: { platform: 'android', arch: 'arm64' },
    runtime: { nodeMajorMinimum: 22 },
    stateSchemas: { agentDeliverySnapshot: 3, supervisorJournal: 1, packageState: 1, managementJournal: 1, controlConnection: 1 },
    protocols: {
      agentWebSocket: 'tdev-agent-v1',
      management: INSTALLABLE_AGENT_MANAGEMENT_PROTOCOL_PROFILE,
      supervisorService: INSTALLABLE_AGENT_SUPERVISOR_SERVICE_PROTOCOL,
    },
    capabilityProfile: 'tdev.agent.termux.pidfd.v1',
    serviceHostProfile: INSTALLABLE_AGENT_TERMUX_SERVICE_PROFILE,
    configurationSchemaDigest: digest(INSTALLABLE_AGENT_PACKAGE_CONFIG_SCHEMA),
    toolProfiles: {
      relativePath: 'config/installable-agent-tool-profiles.json',
      sha256: sha256(toolProfiles),
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
  return { root, packageRoot, stateDirectory, manifest };
}

function stableRequest(id) {
  return {
    managementRequestId: id,
    managementProof: 'management-proof-secret',
    intentDigest: digest({ intent: id }),
    expectedPredecessorDigest: digest({ predecessor: id }),
  };
}

function controlConfigBase(fixture) {
  return {
    agentId: 'agent-package-one',
    routeGeneration: 1,
    executorId: 'executor-package-one',
    executorEpoch: 1,
    agentDeliveryUrl: 'wss://agent.example.invalid/agent/connect',
    credentialRef: path.join(fixture.root, 'credential-ref'),
    protocolMetadataDigest: digest({ protocol: 'package-test' }),
    reportedCapacity: 2,
  };
}

function currentTuple(fixture, lifecycleGeneration = 11, packageActivationGeneration = 7) {
  return {
    installationGeneration: 3,
    credentialGeneration: 5,
    packageActivationGeneration,
    packageManifestDigest: digest(fixture.manifest),
    trustPolicyGeneration: 9,
    trustStateDigest: digest({ trust: 'package-test' }),
    lifecycleGeneration,
  };
}

function fakeServiceController(events = []) {
  return {
    async install() { events.push('service.install'); return { classification: 'installed' }; },
    async status() { return { classification: 'running' }; },
    async start() { events.push('service.start'); return { classification: 'prepared', supervisor: { initialized: true } }; },
    async activateControl({ controlConfig }) { events.push('service.activateControl'); return { classification: 'running', controlConfigDigest: digest(controlConfig) }; },
    async quiesceAndStop({ drainRequestId }) {
      events.push('service.quiesceAndStop');
      return {
        classification: 'quiesced_and_stopped',
        positiveQuiescence: { liveOperations: 0, heldPredecessors: [], drainRequestId },
        serviceStopped: { supervisor: 'down', control: 'down' },
      };
    },
    async stageRelease() { events.push('service.stageRelease'); return { classification: 'staged', supervisor: { initialized: true } }; },
    async uninstall() { events.push('service.uninstall'); return { classification: 'uninstalled' }; },
  };
}

test('release verification binds every package byte and rejects tampering', async (t) => {
  const fixture = await createPackageFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const verified = await verifyInstallableAgentRelease({ packageRoot: fixture.packageRoot });
  assert.equal(verified.manifest.sourceRevision, 'a'.repeat(40));
  assert.equal(verified.verifiedFiles, 4);
  assert.equal(verified.manifest.developmentOperationProfiles.relativePath, 'config/development-operation-profiles.json');
  await writeFile(path.join(fixture.packageRoot, 'src', 'runtime.mjs'), 'tampered\n');
  await assert.rejects(
    verifyInstallableAgentRelease({ packageRoot: fixture.packageRoot }),
    (error) => error?.code === 'installable_agent_package_file_mismatch',
  );
});

test('local install state is subordinate evidence, exact-replay safe, and management fails closed without authenticated transport', async (t) => {
  const fixture = await createPackageFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const manager = new InstallableAgentPackageManager({
    packageRoot: fixture.packageRoot,
    stateDirectory: fixture.stateDirectory,
    serviceController: fakeServiceController(),
    clock: () => '2026-08-22T00:00:00.000Z',
  });
  const installed = await manager.install();
  assert.equal(installed.classification, 'accepted');
  assert.equal(installed.state.localDisposition, 'installed_not_current');
  assert.equal(installed.state.authorityClaim, 'subordinate_evidence_only');
  const replay = await manager.install();
  assert.equal(replay.classification, 'exact_replay');
  const status = await manager.status();
  assert.equal(status.authority.classification, 'unconfigured');
  assert.equal(status.authority.proofLayer, 'provider_security_unverified');
  await assert.rejects(manager.register(stableRequest('register-no-transport')), (error) => error?.code === 'installable_agent_management_transport_unconfigured');
  await assert.rejects(manager.stop(stableRequest('stop-no-transport')), (error) => error?.code === 'installable_agent_management_transport_unconfigured');
  await assert.rejects(manager.start({ ...stableRequest('start-no-transport'), controlConfig: controlConfigBase(fixture) }), (error) => error?.code === 'installable_agent_management_transport_unconfigured');
  await assert.rejects(manager.uninstall(stableRequest('uninstall-no-transport')), (error) => error?.code === 'installable_agent_management_transport_unconfigured');
  const stateText = await readFile(path.join(fixture.stateDirectory, 'package-state.json'), 'utf8');
  assert.equal(stateText.includes('management-proof-secret'), false);
});

test('management proof remains transport-owned and uninstall cannot delete local state before authoritative revocation barrier', async (t) => {
  const fixture = await createPackageFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  let uninstallRevoked = false;
  const calls = [];
  const serviceEvents = [];
  const managementTransport = {
    async invoke(operation, request) {
      calls.push({ operation, request: structuredClone(request) });
      if (operation === 'beginInstallableAgentUninstall') return { classification: 'accepted', phase: 'draining' };
      if (operation === 'recordInstallableAgentTransactionEvidence') return { classification: 'accepted', type: request.type };
      if (operation === 'completeInstallableAgentUninstall') {
        return uninstallRevoked
          ? { phase: 'revoked', deletionBarrier: 'authority_revoked_replay_fences_retained' }
          : { phase: 'draining', deletionBarrier: 'not_reached' };
      }
      return { classification: 'accepted', operation };
    },
  };
  const manager = new InstallableAgentPackageManager({
    packageRoot: fixture.packageRoot,
    stateDirectory: fixture.stateDirectory,
    managementTransport,
    serviceController: fakeServiceController(serviceEvents),
  });
  await manager.install();
  const secretRequest = stableRequest('register-one');
  assert.equal((await manager.register(secretRequest)).operation, 'register');
  assert.equal((await manager.register(secretRequest)).operation, 'register');
  assert.equal(calls.length, 1, 'completed exact replay must return the journal receipt without another transport call');
  await assert.rejects(
    manager.register({ ...secretRequest, intentDigest: digest({ intent: 2 }) }),
    (error) => error?.code === 'installable_agent_management_request_conflict',
  );
  assert.equal(calls.length, 1);
  const stateText = await readFile(path.join(fixture.stateDirectory, 'package-state.json'), 'utf8');
  const journalText = await readFile(path.join(fixture.stateDirectory, 'management-journal.json'), 'utf8');
  assert.equal(stateText.includes('management-proof-secret'), false, 'management proof must never enter local package authority evidence');
  assert.equal(journalText.includes('management-proof-secret'), false, 'management proof must never enter the lifecycle journal');
  assert.equal(calls[0].request.managementProof, 'management-proof-secret', 'opaque proof is delivered only to the injected deployment-owned transport');

  const uninstallRequest = stableRequest('uninstall-one');
  await assert.rejects(
    manager.uninstall(uninstallRequest),
    (error) => error?.code === 'installable_agent_uninstall_not_revoked',
  );
  assert.equal((await stat(path.join(fixture.stateDirectory, 'package-state.json'))).isFile(), true);
  await assert.rejects(
    manager.stop({ managementRequestId: 'stop-two', intentDigest: digest({ stop: 2 }), expectedPredecessorDigest: digest({ predecessor: 3 }), managementProof: 'management-proof-secret' }),
    (error) => error?.code === 'installable_agent_management_transaction_in_progress',
  );
  uninstallRevoked = true;
  const revoked = await manager.uninstall(uninstallRequest);
  assert.equal(revoked.phase, 'revoked');
  await assert.rejects(stat(path.join(fixture.stateDirectory, 'package-state.json')), (error) => error?.code === 'ENOENT');
  assert.equal((await stat(path.join(fixture.stateDirectory, 'management-journal.json'))).isFile(), true, 'uninstall keeps stable reconciliation receipts after payload state removal');
});

test('lost management response leaves one replayable stable transaction and never admits a competing request', async (t) => {
  const fixture = await createPackageFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  let attempts = 0;
  const managementTransport = {
    async invoke(operation) {
      if (operation === 'status') return { classification: 'observed', operation };
      attempts += 1;
      if (operation === 'register' && attempts === 1) throw Object.assign(new Error('response lost'), { code: 'response_lost' });
      return { classification: 'accepted', operation };
    },
  };
  const manager = new InstallableAgentPackageManager({
    packageRoot: fixture.packageRoot,
    stateDirectory: fixture.stateDirectory,
    managementTransport,
    serviceController: fakeServiceController(),
  });
  await manager.install();
  const request = {
    managementRequestId: 'register-response-loss',
    intentDigest: digest({ intent: 'stable' }),
    expectedPredecessorDigest: digest({ predecessor: 'stable' }),
    managementProof: 'management-proof-secret',
  };
  await assert.rejects(manager.register(request), (error) => error?.code === 'response_lost');
  const afterLoss = await manager.status();
  assert.equal(afterLoss.managementJournal.current.managementRequestId, request.managementRequestId);
  assert.equal(afterLoss.managementJournal.current.phase, 'submitted');
  await assert.rejects(
    manager.stop({ managementRequestId: 'competing-stop', intentDigest: digest({ stop: 1 }), expectedPredecessorDigest: digest({ predecessor: 'other' }), managementProof: 'management-proof-secret' }),
    (error) => error?.code === 'installable_agent_management_transaction_in_progress',
  );
  assert.equal((await manager.register(request)).classification, 'accepted');
  assert.equal(attempts, 2, 'recovery retries only the same stable transport identity');
  const journalText = await readFile(path.join(fixture.stateDirectory, 'management-journal.json'), 'utf8');
  assert.equal(journalText.includes('management-proof-secret'), false);
});

test('base start and stop serialize authority fencing before local service effects and return local evidence only through authenticated transport', async (t) => {
  const fixture = await createPackageFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const events = [];
  const tuple = currentTuple(fixture);
  const managementTransport = {
    async invoke(operation, request) {
      events.push(`transport.${operation}${request?.type ? `.${request.type}` : ''}`);
      if (operation === 'prepareBaseStart') return { classification: 'accepted', phase: 'preparing' };
      if (operation === 'commitBaseStart') return { classification: 'accepted', phase: 'committed', currentTuple: tuple };
      if (operation === 'beginBaseStop') return { classification: 'accepted', phase: 'draining' };
      if (operation === 'completeBaseStop') return { classification: 'accepted', phase: 'completed', restartEligible: true };
      if (operation === 'recordInstallableAgentTransactionEvidence') return { classification: 'accepted', type: request.type };
      if (operation === 'status') return { classification: 'observed' };
      throw new Error(`unexpected management operation ${operation}`);
    },
  };
  const serviceController = fakeServiceController(events);
  const manager = new InstallableAgentPackageManager({ packageRoot: fixture.packageRoot, stateDirectory: fixture.stateDirectory, managementTransport, serviceController });
  await manager.install();
  events.length = 0;

  const started = await manager.start({ ...stableRequest('start-one'), controlConfig: controlConfigBase(fixture) });
  assert.equal(started.phase, 'committed');
  assert.deepEqual(events, [
    'transport.prepareBaseStart',
    'service.start',
    'transport.recordInstallableAgentTransactionEvidence.local_service_ready',
    'transport.commitBaseStart',
    'service.activateControl',
  ]);

  events.length = 0;
  const stopped = await manager.stop(stableRequest('stop-one'));
  assert.equal(stopped.phase, 'completed');
  assert.deepEqual(events, [
    'transport.beginBaseStop',
    'service.quiesceAndStop',
    'transport.recordInstallableAgentTransactionEvidence.positive_quiescence',
    'transport.recordInstallableAgentTransactionEvidence.service_stopped',
    'transport.completeBaseStop',
  ]);
});

test('package update fences predecessor before quiescence, stages exact release, records readiness, then elects and activates the new tuple', async (t) => {
  const fixture = await createPackageFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const events = [];
  const tuple = currentTuple(fixture, 13, 8);
  const managementTransport = {
    async invoke(operation, request) {
      events.push(`transport.${operation}${request?.type ? `.${request.type}` : ''}`);
      if (operation === 'beginPackageActivation') {
        assert.equal(request.packageManifestDigest, digest(fixture.manifest));
        assert.equal(request.transitionCause, 'package_update');
        return { classification: 'accepted', phase: 'draining' };
      }
      if (operation === 'commitPackageActivation') return { classification: 'accepted', phase: 'committed', currentTuple: tuple };
      if (operation === 'recordInstallableAgentTransactionEvidence') return { classification: 'accepted', type: request.type };
      throw new Error(`unexpected management operation ${operation}`);
    },
  };
  const serviceController = fakeServiceController(events);
  const manager = new InstallableAgentPackageManager({ packageRoot: fixture.packageRoot, stateDirectory: fixture.stateDirectory, managementTransport, serviceController });
  await manager.install();
  events.length = 0;
  const updated = await manager.update({
    ...stableRequest('update-one'),
    transitionCause: 'package_update',
    packageTrustSubjectDigest: digest({ packageTrust: 'verified' }),
    controlConfig: controlConfigBase(fixture),
  });
  assert.equal(updated.phase, 'committed');
  assert.deepEqual(events, [
    'transport.beginPackageActivation',
    'service.quiesceAndStop',
    'transport.recordInstallableAgentTransactionEvidence.positive_quiescence',
    'transport.recordInstallableAgentTransactionEvidence.package_verified',
    'service.stageRelease',
    'transport.recordInstallableAgentTransactionEvidence.local_service_ready',
    'transport.commitPackageActivation',
    'service.activateControl',
  ]);
  const localState = JSON.parse(await readFile(path.join(fixture.stateDirectory, 'package-state.json'), 'utf8'));
  assert.equal(localState.releaseManifestDigest, digest(fixture.manifest));
  assert.equal(localState.localDisposition, 'installed_release');
});

test('release manifest rejects traversal and configuration-schema substitution before package use', async (t) => {
  const fixture = await createPackageFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const badConfig = structuredClone(fixture.manifest);
  badConfig.configurationSchemaDigest = digest({ wrong: true });
  await writeFile(path.join(fixture.packageRoot, 'release-manifest.json'), `${canonicalJson(badConfig)}\n`);
  await assert.rejects(
    verifyInstallableAgentRelease({ packageRoot: fixture.packageRoot }),
    (error) => error?.code === 'installable_agent_package_manifest_incompatible',
  );

  const traversal = structuredClone(fixture.manifest);
  traversal.files['../escape'] = { sha256: '0'.repeat(64), bytes: 0, role: 'invalid' };
  await writeFile(path.join(fixture.packageRoot, 'release-manifest.json'), `${canonicalJson(traversal)}\n`);
  await assert.rejects(
    verifyInstallableAgentRelease({ packageRoot: fixture.packageRoot }),
    (error) => error?.code === 'invalid_installable_agent_package_path',
  );
});
