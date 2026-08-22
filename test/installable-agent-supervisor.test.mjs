import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import {
  InstallableAgentSupervisor,
  MemoryInstallableAgentSupervisorJournal,
  canonicalJson,
  digest,
} from '../src/index.mjs';

function tuple() {
  return {
    installationGeneration: 1,
    credentialGeneration: 1,
    packageActivationGeneration: 1,
    packageManifestDigest: digest({ package: 'unit' }),
    trustPolicyGeneration: 1,
    trustStateDigest: digest({ trust: 'unit' }),
    lifecycleGeneration: 1,
  };
}

function envelope(tag = 'one') {
  return {
    type: 'dispatch',
    deliveryId: digest({ delivery: tag }),
    dispatchOrdinal: 1,
    authorizationId: digest({ authorization: tag }),
    dispatchGrantId: digest({ grant: tag }),
    caseId: `case-${tag}`,
    taskId: `task-${tag}`,
    attemptId: `task-${tag}.1`,
    executorId: 'executor-one',
    executorEpoch: 1,
    fencingToken: digest({ fence: tag }),
    protocolVersion: 'v1',
    executableBody: { tag },
    installableAgentTuple: tuple(),
    socketIncarnationId: `socket-${tag}`,
    firstEmissionAdmissionId: digest({ admission: tag }),
  };
}

function launch() {
  return {
    command: '/package/bin/tool',
    args: ['--bounded'],
    cwd: null,
    env: { PATH: '/package/bin' },
    stdin: '',
  };
}

function fakePidfd({ openError = null, exited = true } = {}) {
  const calls = { probe: 0, open: [], signal: [], close: [] };
  return {
    calls,
    probePidfd() { calls.probe += 1; return { supported: true }; },
    pidfdOpen(pid) {
      calls.open.push(pid);
      if (openError) throw Object.assign(new Error('pidfd open failed'), { code: openError });
      return 77;
    },
    pidfdSendSignal(fd, signal) { calls.signal.push({ fd, signal }); return true; },
    pidfdExited() { return exited; },
    closePidfd(fd) { calls.close.push(fd); return true; },
  };
}

function fakeWardenFactory({ onSpawn = null } = {}) {
  return (...args) => {
    onSpawn?.(...args);
    const child = new EventEmitter();
    child.pid = 1_500_000_001;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = {
      end(data) {
        if (data === undefined) return;
        const frame = JSON.parse(String(data));
        queueMicrotask(() => {
          child.stdout.write(`${canonicalJson({
            type: 'tool_started',
            operationId: frame.operationId,
            operationGeneration: frame.operationGeneration,
            childPid: 1_500_000_002,
          })}\n`);
          child.stdout.write(`${canonicalJson({
            type: 'tool_completed',
            operationId: frame.operationId,
            operationGeneration: frame.operationGeneration,
            exit: { code: 0, signal: null, stdout: 'ok', stderr: '', stdoutOverflow: false, stderrOverflow: false },
          })}\n`);
        });
      },
    };
    return child;
  };
}

function procIncarnation(pid) {
  return Promise.resolve({ bootId: 'boot-unit', pid, pgid: pid, starttime: '12345' });
}

test('PREPARED precedes process creation and ACTIVE/GO_ALLOWED precede GO', async () => {
  const journal = new MemoryInstallableAgentSupervisorJournal();
  const pidfdControl = fakePidfd();
  let spawnObservedTypes = null;
  const supervisor = new InstallableAgentSupervisor({
    journal,
    pidfdControl,
    spawnWarden: fakeWardenFactory({
      onSpawn() { spawnObservedTypes = journal.records.map((record) => record.type); },
    }),
    procIncarnation,
    cleanupWaitMs: 0,
  });
  await supervisor.initialize();
  const operation = await supervisor.start({ envelope: envelope('ordering'), launch: launch() });
  assert.deepEqual(spawnObservedTypes, ['SUPERVISOR_START', 'PREPARED']);
  assert.deepEqual(journal.records.slice(0, 4).map((record) => record.type), ['SUPERVISOR_START', 'PREPARED', 'ACTIVE', 'GO_ALLOWED']);
  const completed = await operation.completion;
  assert.equal(completed.stdout, 'ok');
  const cleanup = await operation.cleanup();
  assert.equal(cleanup.cleanupComplete, true);
  assert.equal(journal.records.at(-1).type, 'TERMINAL');
  assert.deepEqual(pidfdControl.calls.open, [1_500_000_001]);
  assert.deepEqual(pidfdControl.calls.close, [77]);
});

test('supervisor restart holds nonterminal predecessor and never reconstructs pidfd authority from stored PID metadata', async () => {
  const journal = new MemoryInstallableAgentSupervisorJournal();
  const firstPidfd = fakePidfd({ exited: false });
  const first = new InstallableAgentSupervisor({
    journal,
    pidfdControl: firstPidfd,
    spawnWarden: fakeWardenFactory(),
    procIncarnation,
    cleanupWaitMs: 0,
  });
  await first.initialize();
  const firstOperation = await first.start({ envelope: envelope('restart-held'), launch: launch() });
  await firstOperation.completion;
  assert.equal(first.status().liveOperations, 1);

  const secondPidfd = fakePidfd();
  let secondSpawns = 0;
  const second = new InstallableAgentSupervisor({
    journal,
    pidfdControl: secondPidfd,
    spawnWarden: fakeWardenFactory({ onSpawn() { secondSpawns += 1; } }),
    procIncarnation,
    cleanupWaitMs: 0,
  });
  await second.initialize();
  const status = second.status();
  assert.equal(status.heldPredecessors.length, 1);
  assert.equal(secondPidfd.calls.open.length, 0, 'restart must not open a pidfd from stored PID provenance');
  await assert.rejects(
    second.start({ envelope: envelope('restart-held'), launch: launch() }),
    (error) => error?.code === 'installable_agent_predecessor_held',
  );
  assert.equal(secondSpawns, 0);
});

test('post-create pidfd failure remains conservatively held and never falls back to PID signalling', async () => {
  const journal = new MemoryInstallableAgentSupervisorJournal();
  const pidfdControl = fakePidfd({ openError: 'pidfd_open_failed' });
  const supervisor = new InstallableAgentSupervisor({
    journal,
    pidfdControl,
    spawnWarden: fakeWardenFactory(),
    procIncarnation,
    cleanupWaitMs: 0,
  });
  await supervisor.initialize();
  await assert.rejects(
    supervisor.start({ envelope: envelope('pidfd-failure'), launch: launch() }),
    (error) => error?.code === 'warden_pidfd_open_failed' && error?.startFailurePhase === 'post_create' && error?.cleanupComplete === false,
  );
  assert.deepEqual(journal.records.map((record) => record.type), ['SUPERVISOR_START', 'PREPARED']);
  assert.equal(pidfdControl.calls.signal.length, 0, 'post-create ambiguity must not use PID fallback signalling');
  assert.equal(supervisor.status().heldPredecessors.length, 1);
});

test('unsupported pidfd baseline fails before any operation is prepared', async () => {
  const journal = new MemoryInstallableAgentSupervisorJournal();
  const pidfdControl = fakePidfd();
  pidfdControl.probePidfd = () => ({ supported: false });
  const supervisor = new InstallableAgentSupervisor({
    journal,
    pidfdControl,
    spawnWarden: fakeWardenFactory(),
    procIncarnation,
  });
  await assert.rejects(supervisor.initialize(), (error) => error?.code === 'installable_agent_profile_unsupported');
  assert.deepEqual(journal.records, []);
});
