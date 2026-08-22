import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  InstallableAgentSupervisorServiceClient,
  TermuxInstallableAgentServiceController,
  createInstallableAgentSupervisorServiceHandler,
  runInstallableAgentSupervisorService,
  termuxInstallableAgentServiceLayout,
} from '../src/index.mjs';

function supervisorStatus() {
  return {
    initialized: true,
    supervisorGeneration: 7,
    operationGenerationHighWater: 1,
    liveOperations: 1,
    heldPredecessors: [],
  };
}

test('package-owned supervisor service preserves one start across control-client reconnect and binds binary stdin', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tdev-d0027-service-test-'));
  const socketPath = process.platform === 'android'
    ? path.join(process.env.PREFIX, 'tmp', `tdev-d0027-service-${process.pid}.sock`)
    : path.join(root, 'supervisor.sock');
  await rm(socketPath, { force: true });
  let starts = 0;
  let cancelled = 0;
  let cleaned = 0;
  let resolveCompletion;
  const completion = new Promise((resolve) => { resolveCompletion = resolve; });
  const fakeSupervisor = {
    status() {
      return { ...supervisorStatus(), liveOperations: cleaned > 0 ? 0 : starts };
    },
    async start({ launch }) {
      starts += 1;
      assert.equal(Buffer.isBuffer(launch.stdin), true);
      assert.deepEqual([...launch.stdin], [0, 255, 7, 9]);
      return {
        operationId: 'operation-one',
        operationGeneration: 1,
        supervisorGeneration: 7,
        completion,
        cancel: async () => { cancelled += 1; return { phase: 'cancel_requested' }; },
        cleanup: async () => { cleaned += 1; return { cleanupComplete: true, operationId: 'operation-one', operationGeneration: 1 }; },
      };
    },
  };
  const service = await runInstallableAgentSupervisorService({
    stateDirectory: path.join(root, 'state'),
    socketPath,
    supervisorFactory: async () => fakeSupervisor,
  });
  t.after(async () => {
    await service.close();
    await rm(socketPath, { force: true });
    await rm(root, { recursive: true, force: true });
  });

  const envelope = { deliveryId: 'delivery-one', attemptOrdinal: 1, executableBody: { kind: 'test' } };
  const launch = { command: '/system/bin/sh', args: ['-c', 'exit 0'], cwd: null, env: { A: 'B' }, stdin: Buffer.from([0, 255, 7, 9]) };
  const firstClient = new InstallableAgentSupervisorServiceClient({ socketPath, pollIntervalMs: 5 });
  const first = await firstClient.start({ envelope, launch, requestId: 'stable-start-one' });
  const reconnectClient = new InstallableAgentSupervisorServiceClient({ socketPath, pollIntervalMs: 5 });
  const replay = await reconnectClient.start({ envelope, launch, requestId: 'stable-start-one' });
  assert.equal(starts, 1, 'control-client reconnect must not relaunch the physical process');
  assert.equal(replay.operationId, first.operationId);

  await assert.rejects(
    reconnectClient.start({ envelope, launch: { ...launch, args: ['-c', 'exit 1'] }, requestId: 'stable-start-one' }),
    (error) => error?.code === 'installable_agent_supervisor_service_request_conflict',
  );
  assert.equal(starts, 1);

  const drained = await reconnectClient.drain({ requestId: 'stable-drain-one' });
  assert.equal(drained.classification, 'quiesced');
  assert.equal(drained.supervisor.liveOperations, 0);
  assert.equal(cancelled, 1);
  assert.equal(cleaned, 1);
  const drainReplay = await firstClient.drain({ requestId: 'stable-drain-one' });
  assert.equal(drainReplay.classification, 'exact_replay');
  assert.equal(cancelled, 1, 'drain response replay must not re-signal the physical process');
  assert.equal(cleaned, 1, 'drain response replay must not repeat cleanup');

  resolveCompletion({ code: 0, signal: null, stdout: 'ok', stderr: '', stdoutOverflow: false, stderrOverflow: false });
  assert.equal((await first.completion).code, 0);
  assert.equal((await replay.completion).stdout, 'ok');
});

test('supervisor drain fails closed when restart recovery has a held predecessor without a live destructive handle', async () => {
  const handler = createInstallableAgentSupervisorServiceHandler({
    supervisor: {
      status() {
        return {
          initialized: true,
          supervisorGeneration: 8,
          operationGenerationHighWater: 3,
          liveOperations: 0,
          heldPredecessors: [{ operationId: 'held-operation', phase: 'GO_ALLOWED' }],
        };
      },
      async start() { throw new Error('not used'); },
    },
  });
  await assert.rejects(
    handler({ requestId: 'held-drain-one', operation: 'drain' }),
    (error) => error?.code === 'installable_agent_supervisor_drain_held',
  );
});

async function fakeExecutable(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, '#!/bin/sh\nexit 0\n');
  await chmod(filePath, 0o755);
}

test('Termux runit controller installs a package-owned absolute service definition and rejects substitution', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tdev-d0027-runit-test-'));
  const prefix = path.join(root, 'prefix');
  const packageRoot = path.join(root, 'release-one');
  const otherPackageRoot = path.join(root, 'release-two');
  const stateDirectory = path.join(root, 'state');
  const nodePath = path.join(prefix, 'bin', 'node');
  await mkdir(path.join(prefix, 'var', 'service'), { recursive: true });
  await mkdir(path.join(packageRoot, 'src'), { recursive: true });
  await mkdir(path.join(otherPackageRoot, 'src'), { recursive: true });
  for (const executable of ['sh', 'sv', 'runsv', 'node']) await fakeExecutable(path.join(prefix, 'bin', executable));
  t.after(() => rm(root, { recursive: true, force: true }));

  const commands = [];
  const running = new Map();
  let drains = 0;
  const controller = new TermuxInstallableAgentServiceController({
    prefix,
    nodePath,
    platform: 'android',
    arch: 'arm64',
    runCommand(executable, args) {
      commands.push({ executable, args: [...args] });
      const [command, servicePath] = args;
      if (command === 'up') running.set(servicePath, true);
      if (command === 'down') running.set(servicePath, false);
      if (command === 'status') {
        return { status: 0, signal: null, stdout: running.get(servicePath) === true ? 'run: service: (pid 1) 1s' : 'down: service: 1s, normally up', stderr: '' };
      }
      return { status: 0, signal: null, stdout: running.get(servicePath) === true ? 'run: service: (pid 1) 1s' : 'down: service: 1s, normally up', stderr: '' };
    },
    clientFactory: () => ({
      async status() { return { supervisor: { ...supervisorStatus(), liveOperations: 0 } }; },
      async drain({ requestId }) {
        drains += 1;
        return { classification: 'quiesced', supervisor: { ...supervisorStatus(), liveOperations: 0, heldPredecessors: [] }, requestId };
      },
    }),
    readyWaitMs: 100,
    pollMs: 1,
  });
  const manifest = { target: { platform: 'android', arch: 'arm64' } };
  const first = await controller.install({ packageRoot, stateDirectory, manifest });
  assert.equal(first.classification, 'installed');
  const layout = termuxInstallableAgentServiceLayout({ prefix, stateDirectory });
  const runScript = await readFile(path.join(layout.supervisorServicePath, 'run'), 'utf8');
  const controlRunScript = await readFile(path.join(layout.controlServicePath, 'run'), 'utf8');
  assert.match(runScript, new RegExp(nodePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(runScript, new RegExp(path.join(packageRoot, 'src', 'installable-agent-supervisor-service.mjs').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(runScript, new RegExp(layout.socketPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(controlRunScript, new RegExp(path.join(packageRoot, 'src', 'installable-agent-control.mjs').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(controlRunScript, new RegExp(layout.controlConfigPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(runScript.includes(`export HOME='${stateDirectory}'`), true, 'run definition must bind HOME to package state rather than ambient HOME');
  assert.equal((await stat(path.join(layout.supervisorServicePath, 'run'))).isFile(), true);
  assert.equal((await stat(path.join(layout.controlServicePath, 'run'))).isFile(), true);
  assert.equal(running.get(layout.supervisorServicePath), true);
  assert.notEqual(running.get(layout.controlServicePath), true, 'control process remains disabled until authoritative current tuple is committed');

  const replay = await controller.install({ packageRoot, stateDirectory, manifest });
  assert.equal(replay.classification, 'exact_replay');
  const activated = await controller.activateControl({
    stateDirectory,
    controlConfig: { credentialRef: path.join(root, 'credential-ref'), profile: 'fixture' },
  });
  assert.equal(activated.classification, 'running');
  assert.equal(running.get(layout.controlServicePath), true);
  const quiesced = await controller.quiesceAndStop({ stateDirectory, drainRequestId: 'drain-service-one' });
  assert.equal(quiesced.classification, 'quiesced_and_stopped');
  assert.equal(quiesced.positiveQuiescence.liveOperations, 0);
  assert.equal(drains, 1);
  assert.equal(running.get(layout.controlServicePath), false);
  assert.equal(running.get(layout.supervisorServicePath), false);
  await assert.rejects(
    controller.install({ packageRoot: otherPackageRoot, stateDirectory, manifest }),
    (error) => error?.code === 'installable_agent_service_definition_conflict',
  );
  const staged = await controller.stageRelease({ packageRoot: otherPackageRoot, stateDirectory, manifest });
  assert.equal(staged.classification, 'staged');
  assert.equal(running.get(layout.supervisorServicePath), true, 'candidate supervisor starts only after quiesced run-definition replacement');
  assert.equal(running.get(layout.controlServicePath), false, 'candidate control remains fenced until final owner commit');
  assert.match(await readFile(path.join(layout.supervisorServicePath, 'run'), 'utf8'), new RegExp(otherPackageRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(await readFile(path.join(layout.controlServicePath, 'run'), 'utf8'), new RegExp(otherPackageRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const stageReplay = await controller.stageRelease({ packageRoot: otherPackageRoot, stateDirectory, manifest });
  assert.equal(stageReplay.classification, 'exact_replay');
  assert.equal(running.get(layout.controlServicePath), false);
  await assert.rejects(
    controller.uninstall({ stateDirectory, authorityResponse: { phase: 'draining' } }),
    (error) => error?.code === 'installable_agent_uninstall_not_revoked',
  );
  const removed = await controller.uninstall({
    stateDirectory,
    authorityResponse: { phase: 'revoked', deletionBarrier: 'authority_revoked_replay_fences_retained' },
  });
  assert.equal(removed.classification, 'uninstalled');
  await assert.rejects(stat(layout.supervisorServicePath), (error) => error?.code === 'ENOENT');
  await assert.rejects(stat(layout.controlServicePath), (error) => error?.code === 'ENOENT');
});
