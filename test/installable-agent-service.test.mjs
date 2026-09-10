import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
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

test('Termux runit controller waits for runsvdir discovery before issuing service control', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tdev-d0027-runit-discovery-test-'));
  const prefix = path.join(root, 'prefix');
  const packageRoot = path.join(root, 'release');
  const stateDirectory = path.join(root, 'state');
  const nodePath = path.join(prefix, 'bin', 'node');
  await mkdir(path.join(prefix, 'var', 'service'), { recursive: true });
  await mkdir(path.join(packageRoot, 'src'), { recursive: true });
  for (const executable of ['sh', 'sv', 'runsv', 'node']) await fakeExecutable(path.join(prefix, 'bin', executable));
  t.after(() => rm(root, { recursive: true, force: true }));

  const statusChecks = new Map();
  const events = [];
  const running = new Map();
  const controller = new TermuxInstallableAgentServiceController({
    prefix,
    nodePath,
    platform: 'android',
    arch: 'arm64',
    readyWaitMs: 200,
    pollMs: 1,
    runCommand(executable, args) {
      const [command, servicePath] = args;
      if (command === 'status') {
        const count = (statusChecks.get(servicePath) ?? 0) + 1;
        statusChecks.set(servicePath, count);
        events.push(`status:${path.basename(servicePath)}:${count}`);
        if (count < 3) return { status: 1, signal: null, stdout: '', stderr: 'supervise/ok unavailable' };
        return { status: 0, signal: null, stdout: running.get(servicePath) === true ? 'run: service: (pid 1) 1s' : 'down: service: 1s, normally up', stderr: '' };
      }
      if (command === 'up') {
        events.push(`up:${path.basename(servicePath)}`);
        if ((statusChecks.get(servicePath) ?? 0) < 3) return { status: 1, signal: null, stdout: '', stderr: 'not supervised' };
        running.set(servicePath, true);
      }
      if (command === 'down') running.set(servicePath, false);
      return { status: 0, signal: null, stdout: '', stderr: '' };
    },
    clientFactory: () => ({ async status() { return { supervisor: { ...supervisorStatus(), liveOperations: 0 } }; } }),
  });
  const manifest = { target: { platform: 'android', arch: 'arm64' } };
  const installed = await controller.install({ packageRoot, stateDirectory, manifest });
  assert.equal(installed.classification, 'installed');
  const layout = termuxInstallableAgentServiceLayout({ prefix, stateDirectory });
  assert.equal(statusChecks.get(layout.supervisorServicePath) >= 3, true);
  assert.equal(statusChecks.get(layout.controlServicePath) >= 3, true);
  const firstUp = events.findIndex((event) => event === `up:${path.basename(layout.supervisorServicePath)}`);
  const thirdSupervisorStatus = events.findIndex((event) => event === `status:${path.basename(layout.supervisorServicePath)}:3`);
  assert.equal(firstUp > thirdSupervisorStatus, true, 'sv up must occur only after runsvdir supervision is positively observed');
});

test('Termux runit controller hard-stops an exact control child only after graceful down timeout and raw down intent', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tdev-d0027-control-stop-test-'));
  const prefix = path.join(root, 'prefix');
  const packageRoot = path.join(root, 'release');
  const stateDirectory = path.join(root, 'state');
  const procRoot = path.join(root, 'proc');
  const nodePath = path.join(prefix, 'bin', 'node');
  const layout = termuxInstallableAgentServiceLayout({ prefix, stateDirectory });
  const controlPid = 321;
  const controlRunsvPid = 654;
  const controlRawStatusPath = path.join(layout.controlServicePath, 'supervise', 'status');
  await mkdir(path.join(prefix, 'var', 'service'), { recursive: true });
  await mkdir(path.join(packageRoot, 'src'), { recursive: true });
  await mkdir(path.join(procRoot, String(controlPid)), { recursive: true });
  await mkdir(path.join(procRoot, String(controlRunsvPid)), { recursive: true });
  await writeFile(path.join(procRoot, String(controlPid), 'status'), `Name:\tnode\nPid:\t${controlPid}\nPPid:\t${controlRunsvPid}\n`);
  await writeFile(path.join(procRoot, String(controlRunsvPid), 'cmdline'), Buffer.from(`runsv\0${layout.controlServiceName}\0`));
  await symlink(layout.controlServicePath, path.join(procRoot, String(controlRunsvPid), 'cwd'));
  for (const executable of ['sh', 'sv', 'runsv', 'node']) await fakeExecutable(path.join(prefix, 'bin', executable));
  t.after(() => rm(root, { recursive: true, force: true }));

  let controlWant = 'u';
  const setControlWant = (want) => {
    controlWant = want;
    const bytes = Buffer.alloc(20);
    bytes[17] = want.charCodeAt(0);
    try { writeFileSync(controlRawStatusPath, bytes); }
    catch (cause) { if (cause?.code !== 'ENOENT') throw cause; }
  };
  const running = new Map();
  let controlDownRequests = 0;
  let directKills = 0;
  let drained = false;
  const controller = new TermuxInstallableAgentServiceController({
    prefix,
    nodePath,
    platform: 'android',
    arch: 'arm64',
    procRoot,
    killProcess(pid, signal) {
      assert.equal(pid, controlPid);
      assert.equal(signal, 'SIGKILL');
      directKills += 1;
      running.set(layout.controlServicePath, false);
    },
    readyWaitMs: 10,
    pollMs: 1,
    runCommand(executable, args) {
      const [command, servicePath] = args;
      const isControl = servicePath.endsWith('-control');
      if (command === 'up') {
        running.set(servicePath, true);
        if (isControl) setControlWant('u');
      }
      if (command === 'down' && isControl) {
        controlDownRequests += 1;
        if (controlDownRequests >= 2) setControlWant('d');
      }
      if (command === 'down' && !isControl) running.set(servicePath, false);
      if (command === 'status') {
        if (running.get(servicePath) === true) {
          return { status: 0, signal: null, stdout: `run: service: (pid ${isControl ? controlPid : 111}) 1s, normally down`, stderr: '' };
        }
        return { status: 0, signal: null, stdout: 'down: service: 1s, normally up', stderr: '' };
      }
      return { status: 0, signal: null, stdout: '', stderr: '' };
    },
    clientFactory: () => ({
      async status() { return { supervisor: { ...supervisorStatus(), liveOperations: 0, heldPredecessors: [] } }; },
      async drain({ requestId }) {
        drained = true;
        return { classification: 'quiesced', supervisor: { ...supervisorStatus(), liveOperations: 0, heldPredecessors: [] }, requestId };
      },
    }),
  });
  const manifest = { target: { platform: 'android', arch: 'arm64' } };
  await controller.install({ packageRoot, stateDirectory, manifest });
  await mkdir(path.dirname(controlRawStatusPath), { recursive: true });
  await writeFile(path.join(layout.controlServicePath, 'supervise', 'pid'), `${controlPid}\n`);
  setControlWant(controlWant);
  await controller.activateControl({
    stateDirectory,
    controlConfig: { credentialRef: `androidkeystore://com.termux.api/tdev.a1.${'A'.repeat(43)}`, profile: 'fixture' },
  });
  const result = await controller.quiesceAndStop({ stateDirectory, drainRequestId: 'drain-control-stop-one' });
  assert.equal(result.classification, 'quiesced_and_stopped');
  assert.equal(controlDownRequests, 2, 'timed-out control stop must reassert down intent before exact hard stop');
  assert.equal(directKills, 1);
  assert.equal(drained, true, 'supervisor drain must follow the fenced control stop');
  assert.equal(running.get(layout.controlServicePath), false);
  assert.equal(running.get(layout.supervisorServicePath), false);
});

test('Termux runit controller verifies raw down intent and guarded exact PID before direct hard-stop fallback', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tdev-d0027-force-stop-test-'));
  const prefix = path.join(root, 'prefix');
  const packageRoot = path.join(root, 'release');
  const stateDirectory = path.join(root, 'state');
  const procRoot = path.join(root, 'proc');
  const nodePath = path.join(prefix, 'bin', 'node');
  const layout = termuxInstallableAgentServiceLayout({ prefix, stateDirectory });
  const supervisorPid = 123;
  const runsvPid = 456;
  const rawStatusPath = path.join(layout.supervisorServicePath, 'supervise', 'status');
  await mkdir(path.join(prefix, 'var', 'service'), { recursive: true });
  await mkdir(path.join(packageRoot, 'src'), { recursive: true });
  await mkdir(path.join(procRoot, String(supervisorPid)), { recursive: true });
  await mkdir(path.join(procRoot, String(runsvPid)), { recursive: true });
  await writeFile(path.join(procRoot, String(supervisorPid), 'status'), `Name:\tnode\nPid:\t${supervisorPid}\nPPid:\t${runsvPid}\n`);
  await writeFile(path.join(procRoot, String(runsvPid), 'cmdline'), Buffer.from('runsv\0wrong-service\0'));
  await symlink(layout.supervisorServicePath, path.join(procRoot, String(runsvPid), 'cwd'));
  let rawWant = 'u';
  const setRawWant = (want) => {
    rawWant = want;
    const bytes = Buffer.alloc(20);
    bytes[17] = want.charCodeAt(0);
    try { writeFileSync(rawStatusPath, bytes); }
    catch (cause) { if (cause?.code !== 'ENOENT') throw cause; }
  };
  for (const executable of ['sh', 'sv', 'runsv', 'node']) await fakeExecutable(path.join(prefix, 'bin', executable));
  t.after(() => rm(root, { recursive: true, force: true }));

  const running = new Map();
  const commands = [];
  let drained = false;
  let supervisorDownRequests = 0;
  let directKills = 0;
  const controller = new TermuxInstallableAgentServiceController({
    prefix,
    nodePath,
    platform: 'android',
    arch: 'arm64',
    procRoot,
    killProcess(pid, signal) {
      assert.equal(pid, supervisorPid, 'direct fallback may target only the current runsv child');
      assert.equal(signal, 'SIGKILL');
      assert.equal(drained, true, 'direct fallback is forbidden before positive drain');
      directKills += 1;
      running.set(layout.supervisorServicePath, false);
    },
    readyWaitMs: 10,
    pollMs: 1,
    runCommand(executable, args) {
      const [command, servicePath] = args;
      commands.push({ command, servicePath });
      const isControl = servicePath.endsWith('-control');
      if (command === 'up') {
        running.set(servicePath, true);
        if (!isControl) setRawWant('u');
      }
      if (command === 'down' && isControl) running.set(servicePath, false);
      if (command === 'down' && !isControl) {
        assert.equal(drained, true, 'normal supervisor down must occur only after positive drain');
        supervisorDownRequests += 1;
        if (supervisorDownRequests >= 2) setRawWant('d');
      }
      if (command === 'force-stop') assert.fail('force-stop must not obscure the explicit down-intent fence');
      if (command === 'kill') {
        assert.equal(isControl, false, 'runit kill fallback is forbidden for the control service');
        assert.equal(drained, true, 'runit kill fallback is forbidden before positive drain');
        // Reproduce the live defect: runit accepted the signal command but the
        // old package-owned supervisor child remained running.
      }
      if (command === 'status') {
        if (running.get(servicePath) === true) {
          return { status: 0, signal: null, stdout: `run: service: (pid ${isControl ? 999 : supervisorPid}) 1s, normally down`, stderr: '' };
        }
        return { status: 0, signal: null, stdout: 'down: service: 1s, normally up', stderr: '' };
      }
      return { status: 0, signal: null, stdout: '', stderr: '' };
    },
    clientFactory: () => ({
      async status() { return { supervisor: { ...supervisorStatus(), liveOperations: 0, heldPredecessors: [] } }; },
      async drain({ requestId }) {
        drained = true;
        return { classification: 'quiesced', supervisor: { ...supervisorStatus(), liveOperations: 0, heldPredecessors: [] }, requestId };
      },
    }),
  });
  const manifest = { target: { platform: 'android', arch: 'arm64' } };
  await controller.install({ packageRoot, stateDirectory, manifest });
  await mkdir(path.dirname(rawStatusPath), { recursive: true });
  await writeFile(path.join(layout.supervisorServicePath, 'supervise', 'pid'), `${supervisorPid}\n`);
  setRawWant(rawWant);
  const credentialRef = `androidkeystore://com.termux.api/tdev.a1.${'A'.repeat(43)}`;
  await controller.activateControl({ stateDirectory, controlConfig: { credentialRef, profile: 'fixture' } });
  await assert.rejects(
    controller.activateControl({ stateDirectory, controlConfig: { credentialRef: 'androidkeystore://com.termux.api/not-canonical', profile: 'fixture' } }),
    { code: 'invalid_agent_credential_ref' },
  );
  await assert.rejects(
    controller.quiesceAndStop({ stateDirectory, drainRequestId: 'drain-guard-reject-one' }),
    { code: 'installable_agent_service_stop_unverified' },
  );
  assert.equal(directKills, 0, 'direct fallback must fail closed before signaling a mismatched runsv parent');
  assert.equal(running.get(layout.supervisorServicePath), true);
  await writeFile(path.join(procRoot, String(runsvPid), 'cmdline'), Buffer.from(`runsv\0${layout.supervisorServiceName}\0`));
  supervisorDownRequests = 0;
  setRawWant('u');
  const result = await controller.quiesceAndStop({ stateDirectory, drainRequestId: 'drain-force-stop-one' });
  assert.equal(result.classification, 'quiesced_and_stopped');
  assert.equal(result.positiveQuiescence.liveOperations, 0);
  assert.equal(running.get(layout.controlServicePath), false);
  assert.equal(running.get(layout.supervisorServicePath), false);
  assert.equal(supervisorDownRequests, 3, 'direct fallback must reassert down after runit kill did not stop the child');
  assert.equal(directKills, 1);
  assert.equal(commands.filter((entry) => entry.command === 'force-stop').length, 0);
  assert.equal(commands.filter((entry) => entry.command === 'kill' && entry.servicePath === layout.supervisorServicePath).length, 2);
  assert.equal(commands.filter((entry) => entry.command === 'kill' && entry.servicePath === layout.controlServicePath).length, 0);
});

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
  const installedBinding = await controller.inspectReleaseBinding({ packageRoot, stateDirectory, manifest });
  assert.equal(installedBinding.classification, 'exact');
  assert.equal(installedBinding.supervisor.exact, true);
  assert.equal(installedBinding.control.exact, true);
  const wrongBinding = await controller.inspectReleaseBinding({ packageRoot: otherPackageRoot, stateDirectory, manifest });
  assert.equal(wrongBinding.classification, 'mismatch');
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
  const androidKeyStoreActivated = await controller.activateControl({
    stateDirectory,
    controlConfig: { credentialRef: 'androidkeystore://com.termux.api/tdev.a1.gm6fFTftt0hx_vVWFVqa3luRI-K5_1gnbUZ_ka9vGFM', profile: 'fixture' },
  });
  assert.equal(androidKeyStoreActivated.classification, 'running');
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
  const stagedBinding = await controller.inspectReleaseBinding({ packageRoot: otherPackageRoot, stateDirectory, manifest });
  assert.equal(stagedBinding.classification, 'exact');
  assert.equal((await controller.inspectReleaseBinding({ packageRoot, stateDirectory, manifest })).classification, 'mismatch');
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
