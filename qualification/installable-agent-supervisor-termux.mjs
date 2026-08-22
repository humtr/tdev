import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import {
  createInstallableAgentSupervisor,
  digest,
} from '../src/index.mjs';

function tuple() {
  return {
    installationGeneration: 41,
    credentialGeneration: 23,
    packageActivationGeneration: 17,
    packageManifestDigest: digest({ package: 'termux-qualification' }),
    trustPolicyGeneration: 29,
    trustStateDigest: digest({ trust: 'termux-qualification' }),
    lifecycleGeneration: 31,
  };
}

function envelope(tag) {
  return {
    type: 'dispatch',
    deliveryId: digest({ delivery: tag }),
    dispatchOrdinal: 1,
    authorizationId: digest({ authorization: tag }),
    dispatchGrantId: digest({ grant: tag }),
    caseId: `qualification-case-${tag}`,
    taskId: `qualification-task-${tag}`,
    attemptId: `qualification-task-${tag}.1`,
    executorId: 'termux-executor',
    executorEpoch: 7,
    fencingToken: digest({ fence: tag }),
    protocolVersion: 'd0027-qualification-v1',
    executableBody: { qualification: tag },
    installableAgentTuple: tuple(),
    socketIncarnationId: `termux-socket-${tag}`,
    firstEmissionAdmissionId: digest({ admission: tag }),
  };
}

function launch(script) {
  return {
    command: process.execPath,
    args: ['-e', script],
    cwd: null,
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      TMPDIR: process.env.TMPDIR ?? os.tmpdir(),
    },
    stdin: '',
  };
}

function journalTypes(text) {
  return text.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line).type);
}

if (process.platform !== 'android' || process.arch !== 'arm64') {
  throw Object.assign(new Error('D0027 local baseline qualification requires Android arm64 Termux'), { code: 'qualification_environment_unavailable' });
}

const tempRoot = await mkdtemp(path.join(process.env.TMPDIR ?? os.tmpdir(), 'tdev-d0027-supervisor-'));
const journalPath = path.join(tempRoot, 'supervisor', 'journal.ndjson');
const startedAt = new Date().toISOString();
try {
  const supervisor = await createInstallableAgentSupervisor({
    journalPath,
    serviceReadyProbe: async () => true,
    cleanupWaitMs: 10_000,
  });
  const simple = await supervisor.start({
    envelope: envelope('simple'),
    launch: launch("process.stdout.write('d0027-simple-ok')"),
  });
  const simpleExit = await simple.completion;
  assert.equal(simpleExit.code, 0);
  assert.equal(simpleExit.stdout, 'd0027-simple-ok');
  const simpleCleanup = await simple.cleanup();
  assert.equal(simpleCleanup.cleanupComplete, true);

  const descendant = await supervisor.start({
    envelope: envelope('descendant'),
    launch: launch("const {spawn}=require('node:child_process'); spawn(process.execPath,['-e','setTimeout(()=>{},30000)'],{stdio:'ignore'}).unref(); process.stdout.write('d0027-descendant-ok')"),
  });
  const descendantExit = await descendant.completion;
  assert.equal(descendantExit.code, 0);
  assert.equal(descendantExit.stdout, 'd0027-descendant-ok');
  const descendantCleanup = await descendant.cleanup();
  assert.equal(descendantCleanup.cleanupComplete, true, 'warden-owned descendant process group must be positively absent');

  const heldEnvelope = envelope('restart-held');
  const heldLaunch = launch("process.stdout.write('d0027-held-ok')");
  const held = await supervisor.start({ envelope: heldEnvelope, launch: heldLaunch });
  const heldExit = await held.completion;
  assert.equal(heldExit.stdout, 'd0027-held-ok');
  assert.equal(supervisor.status().liveOperations, 1, 'operation remains held until positive cleanup is durably recorded');

  const restarted = await createInstallableAgentSupervisor({
    journalPath,
    serviceReadyProbe: async () => true,
    cleanupWaitMs: 10_000,
  });
  const restartStatus = restarted.status();
  assert.ok(restartStatus.heldPredecessors.some((item) => item.operationId === held.operationId));
  await assert.rejects(
    restarted.start({ envelope: heldEnvelope, launch: heldLaunch }),
    (error) => error?.code === 'installable_agent_predecessor_held',
  );

  const text = await readFile(journalPath, 'utf8');
  const types = journalTypes(text);
  const preparedCount = types.filter((type) => type === 'PREPARED').length;
  const activeCount = types.filter((type) => type === 'ACTIVE').length;
  const goAllowedCount = types.filter((type) => type === 'GO_ALLOWED').length;
  const terminalCount = types.filter((type) => type === 'TERMINAL').length;
  assert.equal(preparedCount, 3);
  assert.equal(activeCount, 3);
  assert.equal(goAllowedCount, 3);
  assert.equal(terminalCount, 2, 'restart-held operation must not fabricate terminal cleanup');

  process.stdout.write(`${JSON.stringify({
    profile: 'tdev.agent.termux.pidfd.v1',
    platform: process.platform,
    arch: process.arch,
    node: process.versions.node,
    startedAt,
    finishedAt: new Date().toISOString(),
    simple: { operationId: simple.operationId, cleanupComplete: simpleCleanup.cleanupComplete },
    descendant: { operationId: descendant.operationId, cleanupComplete: descendantCleanup.cleanupComplete },
    restart: {
      heldOperationId: held.operationId,
      predecessorHeld: true,
      terminalFabricated: false,
      supervisorGeneration: restartStatus.supervisorGeneration,
    },
    journal: { preparedCount, activeCount, goAllowedCount, terminalCount },
  })}\n`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
