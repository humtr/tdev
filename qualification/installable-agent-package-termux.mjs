#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import os from 'node:os';

function fail(code, message, options = undefined) {
  const error = new Error(message, options);
  error.code = code;
  throw error;
}

function digestLabel(label) {
  return `sha256:${createHash('sha256').update(label).digest('hex')}`;
}

function parseArgs(argv) {
  let archive = null;
  let expectedSourceRevision = null;
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (value === undefined || !['--archive', '--expected-source-revision'].includes(flag)) {
      fail('installable_agent_package_qualification_usage', 'usage: installable-agent-package-termux --archive <absolute-tgz> [--expected-source-revision <sha>]');
    }
    if (flag === '--archive') {
      if (archive !== null) fail('installable_agent_package_qualification_usage', 'duplicate --archive');
      archive = value;
    } else {
      if (expectedSourceRevision !== null) fail('installable_agent_package_qualification_usage', 'duplicate --expected-source-revision');
      expectedSourceRevision = value;
    }
  }
  if (archive === null || !path.isAbsolute(archive)) fail('installable_agent_package_qualification_usage', '--archive must be absolute');
  if (expectedSourceRevision !== null && !/^[0-9a-f]{40}$/.test(expectedSourceRevision)) {
    fail('installable_agent_package_qualification_usage', '--expected-source-revision must be a lowercase 40-hex Git SHA');
  }
  return { archive: path.resolve(archive), expectedSourceRevision };
}

function run(executable, args, { cwd = undefined, env = process.env } = {}) {
  const result = spawnSync(executable, args, { cwd, env, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (result.error) fail('installable_agent_package_qualification_command_failed', `${path.basename(executable)} could not execute`, { cause: result.error });
  if (result.status !== 0) fail('installable_agent_package_qualification_command_failed', `${path.basename(executable)} exited ${result.status}: ${(result.stderr ?? '').trim()}`);
  return result;
}

async function waitForService(svPath, servicePath, expected, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    const result = spawnSync(svPath, ['status', servicePath], { encoding: 'utf8', maxBuffer: 64 * 1024 });
    last = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
    const classification = /^down:/i.test(last) ? 'down' : /^(?:run|up):/i.test(last) ? 'running' : result.status === 0 ? 'unknown' : 'not_running';
    if (classification === expected || (expected === 'down' && classification === 'not_running')) return classification;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  fail('installable_agent_package_qualification_service_timeout', `service did not reach ${expected}: ${last}`);
}

async function containsSecret(root, secretBytes) {
  let rootStat;
  try { rootStat = await stat(root); } catch (cause) { if (cause?.code === 'ENOENT') return false; throw cause; }
  if (rootStat.isFile()) return (await readFile(root)).includes(secretBytes);
  if (!rootStat.isDirectory()) return false;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (await containsSecret(path.join(root, entry.name), secretBytes)) return true;
  }
  return false;
}

async function main() {
  const { archive, expectedSourceRevision } = parseArgs(process.argv.slice(2));
  if (process.platform !== 'android' || process.arch !== 'arm64') fail('installable_agent_profile_unsupported', 'Qualification requires Android/arm64 Termux');
  if (Number(process.versions.node.split('.')[0]) < 22) fail('installable_agent_profile_unsupported', 'Qualification requires Node >=22');
  const prefix = process.env.PREFIX;
  if (typeof prefix !== 'string' || !path.isAbsolute(prefix)) fail('installable_agent_profile_unsupported', 'Termux PREFIX is unavailable');
  const svPath = path.join(prefix, 'bin', 'sv');
  const root = await mkdtemp(path.join(os.tmpdir(), 'tdev-d0027-package-qualification-'));
  const packageRoot = path.join(root, 'package');
  const stateDirectory = path.join(root, 'state');
  const credentialRef = path.join(root, 'credential-ref');
  let layout = null;
  let secretBytes = null;
  try {
    await mkdir(packageRoot, { recursive: true, mode: 0o700 });
    run('tar', ['-xzf', archive, '-C', packageRoot]);
    const packageModule = await import(pathToFileURL(path.join(packageRoot, 'src', 'installable-agent-package.mjs')).href);
    const serviceModule = await import(pathToFileURL(path.join(packageRoot, 'src', 'installable-agent-supervisor-service.mjs')).href);
    const termuxModule = await import(pathToFileURL(path.join(packageRoot, 'src', 'installable-agent-termux-service.mjs')).href);
    const release = await packageModule.verifyInstallableAgentRelease({ packageRoot });
    if (expectedSourceRevision !== null && release.manifest.sourceRevision !== expectedSourceRevision) {
      fail('installable_agent_package_source_revision_mismatch', 'Extracted package source revision does not match qualification target');
    }
    if (release.manifest.target.platform !== 'android' || release.manifest.target.arch !== 'arm64') fail('installable_agent_package_target_mismatch', 'Extracted package target is not Android/arm64');

    layout = termuxModule.termuxInstallableAgentServiceLayout({ prefix, stateDirectory });
    const cliPath = path.join(packageRoot, 'src', 'installable-agent-package-cli.mjs');
    run(process.execPath, [cliPath, 'verify', '--package-root', packageRoot]);
    run(process.execPath, [cliPath, 'install', '--package-root', packageRoot, '--state-directory', stateDirectory]);

    const client = new serviceModule.InstallableAgentSupervisorServiceClient({ socketPath: layout.socketPath });
    const supervisorStatus = await client.status();
    if (supervisorStatus?.supervisor?.initialized !== true) fail('installable_agent_package_supervisor_not_ready', 'Extracted package supervisor service is not initialized');

    const qualificationTuple = {
      installationGeneration: 1,
      credentialGeneration: 1,
      packageActivationGeneration: 1,
      packageManifestDigest: release.manifestDigest,
      trustPolicyGeneration: 1,
      trustStateDigest: digestLabel('qualification-trust-state'),
      lifecycleGeneration: 1,
    };
    const operation = await client.start({
      envelope: {
        type: 'dispatch',
        deliveryId: digestLabel('qualification-delivery'),
        dispatchOrdinal: 1,
        authorizationId: digestLabel('qualification-authorization'),
        dispatchGrantId: digestLabel('qualification-dispatch-grant'),
        caseId: 'qualification-case-package',
        taskId: 'qualification-task-package',
        attemptId: 'qualification-task-package.1',
        executorId: 'qualification-executor',
        executorEpoch: 1,
        fencingToken: digestLabel('qualification-fence'),
        protocolVersion: 'd0027-package-qualification-v1',
        executableBody: { profile: 'diagnostic.node.version.v1', arguments: {} },
        installableAgentTuple: qualificationTuple,
        socketIncarnationId: 'qualification-socket-one',
        firstEmissionAdmissionId: digestLabel('qualification-first-emission'),
      },
      launch: { command: process.execPath, args: ['--version'], cwd: packageRoot, env: {}, stdin: null },
    });
    const exit = await operation.completion;
    if (exit?.code !== 0 || typeof exit.stdout !== 'string' || !exit.stdout.startsWith('v')) {
      fail('installable_agent_package_supervisor_execution_failed', 'Extracted package supervisor could not execute the bounded Node diagnostic');
    }
    const cleanup = await operation.cleanup();
    if (cleanup?.cleanupComplete !== true) fail('installable_agent_package_supervisor_cleanup_unverified', 'Extracted package supervisor did not positively prove cleanup');

    secretBytes = Buffer.from(randomBytes(32).toString('hex'));
    await writeFile(credentialRef, secretBytes, { mode: 0o600 });
    const controller = new termuxModule.TermuxInstallableAgentServiceController({ prefix });
    const controlConfig = {
      schemaVersion: 1,
      profile: 'tdev.installable-agent-control.v1',
      agentId: 'qualification-agent',
      routeGeneration: 1,
      executorId: 'qualification-executor',
      executorEpoch: 1,
      agentDeliveryUrl: 'ws://127.0.0.1:9/agent/connect',
      stateDirectory,
      credentialRef,
      installableAgentTuple: qualificationTuple,
      protocolMetadataDigest: digestLabel('qualification-protocol-metadata'),
      reportedCapacity: 1,
      reconnectDelayMs: 100,
    };
    const activated = await controller.activateControl({ stateDirectory, controlConfig });
    if (activated?.classification !== 'running') fail('installable_agent_package_control_not_running', 'Extracted package control service did not start');
    await waitForService(svPath, layout.controlServicePath, 'running');

    run(svPath, ['down', layout.controlServicePath]);
    await waitForService(svPath, layout.controlServicePath, 'down');
    run(svPath, ['up', layout.controlServicePath]);
    await waitForService(svPath, layout.controlServicePath, 'running');

    if (await containsSecret(stateDirectory, secretBytes)) fail('installable_agent_package_secret_persistence', 'Raw external credential material appeared in package-owned durable state');
    if (await containsSecret(layout.supervisorServicePath, secretBytes) || await containsSecret(layout.controlServicePath, secretBytes)) {
      fail('installable_agent_package_secret_persistence', 'Raw external credential material appeared in package-owned service definitions');
    }

    const stopped = await controller.quiesceAndStop({ stateDirectory, drainRequestId: 'qualification-final-drain' });
    if (stopped?.classification !== 'quiesced_and_stopped' || stopped?.positiveQuiescence?.liveOperations !== 0 || stopped?.positiveQuiescence?.heldPredecessors?.length !== 0) {
      fail('installable_agent_package_quiescence_unverified', 'Extracted package did not prove positive local quiescence');
    }
    process.stdout.write(`${JSON.stringify({
      classification: 'qualified',
      proofLayer: 'local_machine',
      sourceRevision: release.manifest.sourceRevision,
      releaseManifestDigest: release.manifestDigest,
      target: release.manifest.target,
      supervisor: 'pidfd_execution_cleanup_passed',
      controlRestart: 'passed_without_provider_authentication_claim',
      secretPersistence: 'absent_outside_external_reference',
    })}\n`);
  } finally {
    if (layout !== null) {
      for (const servicePath of [layout.controlServicePath, layout.supervisorServicePath]) {
        try { spawnSync(svPath, ['down', servicePath], { encoding: 'utf8', maxBuffer: 64 * 1024 }); } catch {}
        try { await waitForService(svPath, servicePath, 'down', 3_000); } catch {}
        try { await rm(servicePath, { recursive: true, force: true }); } catch {}
      }
      try { await rm(layout.socketPath, { force: true }); } catch {}
      try { await rm(layout.controlConfigPath, { force: true }); } catch {}
    }
    if (secretBytes !== null) secretBytes.fill(0);
    await rm(root, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (cause) {
  process.stderr.write(`${JSON.stringify({ error: cause?.code ?? 'installable_agent_package_qualification_failed', message: cause?.message ?? 'qualification failed' })}\n`);
  process.exitCode = 1;
}
