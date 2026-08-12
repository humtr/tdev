#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const GUARD_MS = 5_000;
const sleepTurn = () => new Promise((resolve) => setImmediate(resolve));

function sourceRootFromArgs() {
  const index = process.argv.indexOf('--source-root');
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error('usage: node bench/d0018-adversarial-convergence-falsifier.mjs --source-root <repository>');
  }
  return path.resolve(process.argv[index + 1]);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function withGuard(promise, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} did not settle`)), GUARD_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function git(repositoryRoot, args) {
  const result = spawnSync('git', ['-C', repositoryRoot, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    throw error;
  }
}

async function exitedOrZombie(pid) {
  if (!isAlive(pid)) return true;
  if (process.platform === 'linux') {
    try {
      const stat = await fs.readFile(`/proc/${pid}/stat`, 'utf8');
      const closeParen = stat.lastIndexOf(')');
      if (stat.slice(closeParen + 2).split(' ', 1)[0] === 'Z') return true;
    } catch (error) {
      if (error?.code === 'ENOENT') return true;
      throw error;
    }
  }
  return false;
}

async function waitForExit(pid) {
  const started = performance.now();
  while (performance.now() - started < GUARD_MS) {
    if (await exitedOrZombie(pid)) return true;
    await sleepTurn();
  }
  return false;
}

function killGroup(pid) {
  if (process.platform !== 'win32') {
    try {
      process.kill(-pid, 'SIGKILL');
      return;
    } catch (error) {
      if (error?.code !== 'ESRCH') throw error;
    }
  }
  try { process.kill(pid, 'SIGKILL'); } catch (error) { if (error?.code !== 'ESRCH') throw error; }
}

async function waitForJson(filePath) {
  const started = performance.now();
  while (performance.now() - started < GUARD_MS) {
    try { return JSON.parse(await fs.readFile(filePath, 'utf8')); } catch (error) {
      if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    }
    await sleepTurn();
  }
  throw new Error('pid barrier did not publish');
}

function makePlan(definePlan, revisionId = 'd0018-adversarial-current-source') {
  return definePlan({
    revisionId,
    baseTree: {},
    tasks: [
      { id: 'model', kind: 'work', dependencies: [], claims: [], input: {} },
      {
        id: 'promote', kind: 'promotion', dependencies: ['model'],
        claims: [{ mode: 'write', resource: 'canonical:tree' }], input: {},
      },
    ],
  });
}

async function currentSourceFalsifiers(sourceRoot, CaseEngine, definePlan, runCase) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tdev-d0018-converge-'));
  try {
    const plan = makePlan(definePlan, 'd0018-current-inflight');
    const engine = new CaseEngine({ caseId: 'd0018-current-inflight', plan });
    const pidFile = path.join(temporary, 'inflight-pids.json');
    const entered = deferred();
    let signal = null;
    let child = null;
    const parentCode = [
      "const {spawn}=require('node:child_process');",
      "const fs=require('node:fs');",
      "const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',detached:false});",
      "fs.writeFileSync(process.argv[1],JSON.stringify({parentPid:process.pid,descendantPid:c.pid}));",
      "setInterval(()=>{},1000);",
    ].join('');
    const running = runCase(engine, async ({ baseDigest, signal: invocationSignal, task }) => {
      signal = invocationSignal;
      child = spawn(process.execPath, ['-e', parentCode, pidFile], {
        stdio: ['ignore', 'ignore', 'ignore'], shell: false, detached: process.platform !== 'win32',
      });
      const onAbort = () => killGroup(child.pid);
      signal.addEventListener('abort', onAbort, { once: true });
      const close = once(child, 'close');
      const pids = await waitForJson(pidFile);
      entered.resolve(pids);
      await close;
      signal.removeEventListener('abort', onAbort);
      return { kind: 'changeset', baseDigest, writes: [{ path: `${task.id}.txt`, content: 'late' }] };
    });
    const pids = await withGuard(entered.promise, 'current in-flight barrier');
    assert.equal(engine.cancelTask('model', 'adversarial cancellation'), true);
    await Promise.resolve();
    const immediate = {
      taskState: engine.taskStates.model.state,
      attemptState: engine.attempts['model.1'].state,
      signalAborted: signal.aborted,
      childAlive: isAlive(pids.parentPid),
      descendantAlive: isAlive(pids.descendantPid),
    };
    assert.deepEqual(immediate, {
      taskState: 'cancelled', attemptState: 'cancelled', signalAborted: false,
      childAlive: true, descendantAlive: true,
    });
    killGroup(pids.parentPid);
    const final = await withGuard(running, 'current in-flight cleanup');
    assert.equal(final.caseState, 'cancelled');
    assert.equal(Object.hasOwn(final.snapshot.canonicalTree, 'model.txt'), false);

    const prePlan = makePlan(definePlan, 'd0018-current-pre-register');
    const preEngine = new CaseEngine({ caseId: 'd0018-current-pre-register', plan: prePlan });
    const checkpointEntered = deferred();
    const releaseCheckpoint = deferred();
    const checkpoints = [];
    let invocations = 0;
    let abortedAtEntry = null;
    const preRun = runCase(preEngine, async ({ baseDigest, signal: invocationSignal }) => {
      invocations += 1;
      abortedAtEntry = invocationSignal.aborted;
      return { kind: 'changeset', baseDigest, writes: [{ path: 'model.txt', content: 'fenced' }] };
    }, {
      checkpoint: async (snapshot, metadata) => {
        checkpoints.push({
          reason: metadata.reason,
          revision: snapshot.caseRevision,
          taskState: snapshot.taskStates.model?.state ?? null,
          attemptState: snapshot.attempts['model.1']?.state ?? null,
        });
        if (metadata.reason === 'attempt_started') {
          checkpointEntered.resolve();
          await releaseCheckpoint.promise;
        }
      },
    });
    await withGuard(checkpointEntered.promise, 'current attempt_started checkpoint');
    const beforeCancelRevision = preEngine.caseRevision;
    assert.equal(preEngine.cancelTask('model', 'cancel while checkpoint blocked'), true);
    const cancelledRevision = preEngine.caseRevision;
    releaseCheckpoint.resolve();
    const preFinal = await withGuard(preRun, 'current pre-register run');
    const cancelledRevisionCheckpointed = checkpoints.some((entry) => (
      entry.revision >= cancelledRevision && entry.taskState === 'cancelled'
    ));
    assert.equal(invocations, 1);
    assert.equal(abortedAtEntry, false);
    assert.equal(cancelledRevisionCheckpointed, false);
    assert.equal(Object.hasOwn(preFinal.snapshot.canonicalTree, 'model.txt'), false);

    return {
      inFlightCancellation: {
        expectedOwner: 'CaseEngine semantic cancellation; runner execution liveness',
        expectedOutcome: 'semantic cancellation remains authoritative and late result is fenced; current source is expected to fail prompt liveness cleanup',
        observed: immediate,
        afterSettlement: {
          finalCaseState: final.caseState,
          signalAborted: signal.aborted,
          childExited: await waitForExit(pids.parentPid),
          descendantExited: await waitForExit(pids.descendantPid),
          lateResultAccepted: Object.hasOwn(final.snapshot.canonicalTree, 'model.txt'),
        },
        currentSourceFalsified: immediate.signalAborted === false && immediate.childAlive && immediate.descendantAlive,
      },
      cancelBeforeControllerRegistration: {
        expectedOwner: 'CaseEngine semantic cancellation; runner admission/launch control; checkpoint owner persists exact snapshot revision',
        expectedOutcome: 'a terminal Attempt must not invoke executor, and cancellation revision must not be acknowledged unless persisted',
        observed: {
          beforeCancelRevision,
          cancelledRevision,
          invocationsAfterCancellation: invocations,
          signalAbortedAtExecutorEntry: abortedAtEntry,
          checkpoints,
          cancelledRevisionCheckpointed,
          lateResultAccepted: Object.hasOwn(preFinal.snapshot.canonicalTree, 'model.txt'),
        },
        currentSourceFalsified: invocations === 1 && abortedAtEntry === false && cancelledRevisionCheckpointed === false,
      },
    };
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

function controllerKey(overrides = {}) {
  return {
    caseId: 'case-a', taskId: 'model', attemptId: 'model.1', fencingToken: 11,
    executorId: 'exec-a', executorEpoch: 1, ...overrides,
  };
}

function keyText(key) {
  return [key.caseId, key.taskId, key.attemptId, key.fencingToken, key.executorId, key.executorEpoch].join('\0');
}

class AuthorityModel {
  revision = 0;
  attempts = new Map();
  accepted = [];
  start(key) {
    const existing = this.attempts.get(key.attemptId);
    if (existing && existing.state === 'running') throw new Error('nonterminal predecessor');
    this.revision += 1;
    this.attempts.set(key.attemptId, { key: { ...key }, state: 'running', revision: this.revision });
  }
  terminal(key, state = 'cancelled') {
    const attempt = this.attempts.get(key.attemptId);
    if (!attempt || keyText(attempt.key) !== keyText(key)) return false;
    if (attempt.state !== 'running') return false;
    this.revision += 1;
    attempt.state = state;
    attempt.revision = this.revision;
    return true;
  }
  isTerminal(key) {
    const attempt = this.attempts.get(key.attemptId);
    return !attempt || keyText(attempt.key) !== keyText(key) || attempt.state !== 'running';
  }
  accept(key, value) {
    if (this.isTerminal(key)) return false;
    this.revision += 1;
    this.attempts.get(key.attemptId).state = 'succeeded';
    this.accepted.push({ key: keyText(key), value });
    return true;
  }
}

class Registry {
  constructor(authority) { this.authority = authority; this.entries = new Map(); this.events = []; }
  register(key, controller) {
    if (this.authority.isTerminal(key)) {
      controller.abort('terminal-before-register');
      this.events.push('register-precheck-terminal');
      return false;
    }
    const text = keyText(key);
    this.entries.set(text, { key: { ...key }, controller });
    if (this.authority.isTerminal(key)) {
      controller.abort('terminal-after-register');
      if (this.entries.get(text)?.controller === controller) this.entries.delete(text);
      this.events.push('register-postcheck-terminal');
      return false;
    }
    this.events.push('registered');
    return true;
  }
  notify(key) {
    const entry = this.entries.get(keyText(key));
    if (!entry) { this.events.push('notification-no-entry'); return false; }
    if (!this.authority.isTerminal(entry.key)) { this.events.push('notification-nonterminal'); return false; }
    entry.controller.abort('authoritative-terminal');
    this.events.push('notification-aborted');
    return true;
  }
  reconcile() {
    let aborted = 0;
    for (const entry of this.entries.values()) {
      if (this.authority.isTerminal(entry.key) && !entry.controller.signal.aborted) {
        entry.controller.abort('reconciled-terminal');
        aborted += 1;
      }
    }
    return aborted;
  }
  unregister(key, controller) {
    const text = keyText(key);
    const current = this.entries.get(text);
    if (!current || current.controller !== controller) return false;
    this.entries.delete(text);
    return true;
  }
  shutdown() {
    for (const entry of this.entries.values()) entry.controller.abort('runtime-shutdown');
  }
}

class PhysicalCache {
  constructor(typedDigest, authProfile, refProfile) {
    this.typedDigest = typedDigest;
    this.authProfile = authProfile;
    this.refProfile = refProfile;
    this.entries = new Map();
    this.reads = 0;
    this.materializations = 0;
  }
  reference({ repositoryCommitOid, semanticBaseDigest, contextDigest, caseId, planDigest, caseContractDigest }) {
    const scope = { caseId, planDigest, caseContractDigest };
    const authorizationScopeDigest = this.typedDigest(this.authProfile, scope);
    const identity = { repositoryCommitOid, semanticBaseDigest, contextDigest, authorizationScopeDigest };
    return { ...identity, referenceId: this.typedDigest(this.refProfile, identity) };
  }
  put(contextDigest, bytes) { this.entries.set(contextDigest, Buffer.from(bytes)); this.materializations += 1; }
  read(reference, admitted, expectedBytes = null) {
    const expected = this.reference({
      repositoryCommitOid: admitted.repositoryCommitOid,
      semanticBaseDigest: admitted.semanticBaseDigest,
      contextDigest: reference.contextDigest,
      caseId: admitted.caseId,
      planDigest: admitted.planDigest,
      caseContractDigest: admitted.caseContractDigest,
    });
    if (expected.authorizationScopeDigest !== reference.authorizationScopeDigest) throw Object.assign(new Error('unauthorized'), { code: 'context_reference_unauthorized' });
    if (reference.repositoryCommitOid !== admitted.repositoryCommitOid || reference.semanticBaseDigest !== admitted.semanticBaseDigest) throw Object.assign(new Error('stale'), { code: 'context_reference_stale' });
    if (expected.referenceId !== reference.referenceId) throw Object.assign(new Error('corrupt reference'), { code: 'context_reference_corrupt' });
    this.reads += 1;
    const bytes = this.entries.get(reference.contextDigest);
    if (!bytes) throw Object.assign(new Error('missing'), { code: 'context_reference_missing' });
    if (expectedBytes && !bytes.equals(expectedBytes)) {
      this.entries.delete(reference.contextDigest);
      throw Object.assign(new Error('corrupt cache'), { code: 'context_reference_corrupt' });
    }
    return bytes;
  }
}

class CheckpointModel {
  constructor() { this.revision = 0; this.state = 'running'; this.persisted = []; this.checkpointedRevision = 0; }
  mutate(state) { this.revision += 1; this.state = state; }
  snapshot() { return { revision: this.revision, state: this.state }; }
  async checkpointOnce(blocker = null) {
    const snapshot = this.snapshot();
    if (blocker) await blocker;
    this.persisted.push(snapshot);
    this.checkpointedRevision = snapshot.revision;
    return snapshot.revision;
  }
  async drain() {
    while (this.checkpointedRevision < this.revision) await this.checkpointOnce();
  }
}

async function referenceProtocolCases({ typedDigest, authProfile, refProfile, runModelSubprocess }) {
  const results = [];
  const record = async (id, expectedOwner, expectedOutcome, fn) => {
    const observed = await fn();
    results.push({ id, expectedOwner, expectedOutcome, observed, passed: true });
  };

  await record(1, 'CaseEngine cancellation; runner controller registration', 'cancel before registration yields zero process/executor starts', async () => {
    const authority = new AuthorityModel(); const registry = new Registry(authority); const key = controllerKey(); const controller = new AbortController();
    authority.start(key); authority.terminal(key); const registered = registry.register(key, controller);
    assert.equal(registered, false); assert.equal(controller.signal.aborted, true);
    return { registered, aborted: controller.signal.aborted, processStarts: 0, executorInvocations: 0 };
  });

  await record(2, 'CaseEngine cancellation; runner live controller', 'cancel after registration but before executor invocation aborts exact controller and invokes nothing', async () => {
    const authority = new AuthorityModel(); const registry = new Registry(authority); const key = controllerKey(); const controller = new AbortController();
    authority.start(key); assert.equal(registry.register(key, controller), true); authority.terminal(key); registry.notify(key);
    assert.equal(controller.signal.aborted, true); return { aborted: true, executorInvocations: 0 };
  });

  await record(3, 'Runner admission plus transport pre-spawn abort check', 'cancellation after executor entry but before spawn yields zero process starts', async () => {
    const authority = new AuthorityModel(); const registry = new Registry(authority); const key = controllerKey(); const controller = new AbortController();
    authority.start(key); registry.register(key, controller); const executorInvocations = 1; authority.terminal(key); registry.notify(key);
    const processStarts = controller.signal.aborted ? 0 : 1; assert.equal(processStarts, 0); return { executorInvocations, processStarts, aborted: controller.signal.aborted };
  });

  await record(4, 'Runner liveness plus D0017 preparation respecting AbortSignal', 'cancel during preparation stops before model invocation', async () => {
    const authority = new AuthorityModel(); const registry = new Registry(authority); const key = controllerKey(); const controller = new AbortController();
    authority.start(key); registry.register(key, controller); const preparationEntered = true; authority.terminal(key); registry.notify(key);
    const modelInvocations = controller.signal.aborted ? 0 : 1; assert.equal(modelInvocations, 0); return { preparationEntered, aborted: true, modelInvocations };
  });

  const baseAuth = { repositoryCommitOid: 'a'.repeat(40), semanticBaseDigest: 'sha256:base', contextDigest: 'sha256:ctx', caseId: 'case-a', planDigest: 'sha256:plan', caseContractDigest: 'sha256:contract' };

  await record(5, 'D0017 logical authorization before physical carrier/cache access', 'cancel/unauthorized state before carrier access performs zero physical reads', async () => {
    const cache = new PhysicalCache(typedDigest, authProfile, refProfile); cache.put(baseAuth.contextDigest, Buffer.from('context'));
    const ref = cache.reference(baseAuth); const authority = new AuthorityModel(); const key = controllerKey(); authority.start(key); authority.terminal(key);
    const readsBefore = cache.reads; if (!authority.isTerminal(key)) cache.read(ref, baseAuth);
    assert.equal(cache.reads, readsBefore); return { physicalReads: cache.reads - readsBefore, modelInvocations: 0 };
  });

  await record(6, 'D0017 resolution plus runner cancellation', 'cancel during pack/reference resolution prevents model invocation', async () => {
    const authority = new AuthorityModel(); const registry = new Registry(authority); const key = controllerKey(); const controller = new AbortController();
    authority.start(key); registry.register(key, controller); const resolutionEntered = true; authority.terminal(key); registry.notify(key);
    const modelInvocations = controller.signal.aborted ? 0 : 1; assert.equal(modelInvocations, 0); return { resolutionEntered, aborted: true, modelInvocations };
  });

  await record(7, 'CaseEngine result acceptance/fencing', 'child output produced before cancellation is still rejected if cancellation commits before acceptance', async () => {
    const authority = new AuthorityModel(); const key = controllerKey(); authority.start(key); const childOutputComplete = true; authority.terminal(key); const accepted = authority.accept(key, 'late');
    assert.equal(accepted, false); return { childOutputComplete, finalState: authority.attempts.get(key.attemptId).state, accepted };
  });

  await record(8, 'CaseEngine Attempt lifecycle/retry admission', 'retry is inadmissible while predecessor nonterminal and admissible only after predecessor terminal', async () => {
    const authority = new AuthorityModel(); const first = controllerKey(); authority.start(first); let rejected = false;
    try { authority.start(first); } catch { rejected = true; }
    authority.terminal(first, 'failed'); const second = controllerKey({ attemptId: 'model.2', fencingToken: 12 }); authority.start(second);
    assert.equal(rejected, true); return { predecessorNonterminalRejected: rejected, predecessorState: authority.attempts.get(first.attemptId).state, retryState: authority.attempts.get(second.attemptId).state };
  });

  await record(9, 'CaseEngine Attempt/fence acceptance', 'previous Attempt late response cannot bind to admitted retry', async () => {
    const authority = new AuthorityModel(); const first = controllerKey(); authority.start(first); authority.terminal(first, 'failed'); const second = controllerKey({ attemptId: 'model.2', fencingToken: 12 }); authority.start(second);
    const oldAccepted = authority.accept(first, 'old'); const newAccepted = authority.accept(second, 'new'); assert.equal(oldAccepted, false); assert.equal(newAccepted, true);
    return { oldAccepted, newAccepted };
  });

  await record(10, 'Runner exact live-control identity', 'stale cancellation notification for predecessor does not abort retry controller', async () => {
    const authority = new AuthorityModel(); const registry = new Registry(authority); const first = controllerKey(); authority.start(first); const c1 = new AbortController(); registry.register(first, c1); authority.terminal(first); registry.notify(first); registry.unregister(first, c1);
    const second = controllerKey({ attemptId: 'model.2', fencingToken: 12 }); authority.start(second); const c2 = new AbortController(); registry.register(second, c2); registry.notify(first); assert.equal(c2.signal.aborted, false); return { retryControllerAborted: c2.signal.aborted };
  });

  await record(11, 'Runner compare-and-delete unregister', 'stale unregister cannot delete a newer controller binding', async () => {
    const authority = new AuthorityModel(); const registry = new Registry(authority); const key = controllerKey(); authority.start(key); const oldController = new AbortController(); registry.register(key, oldController);
    const newController = new AbortController(); registry.entries.set(keyText(key), { key, controller: newController }); const removed = registry.unregister(key, oldController); assert.equal(removed, false); assert.equal(registry.entries.get(keyText(key)).controller, newController);
    return { staleUnregisterRemovedNew: removed, newStillRegistered: registry.entries.has(keyText(key)) };
  });

  await record(12, 'Runner capacity N admission; CaseEngine retry owner', 'semantic retry eligibility begins at predecessor terminal, but runtime admission waits for predecessor execution-handle cleanup so live bindings never exceed N', async () => {
    const authority = new AuthorityModel(); const registry = new Registry(authority); const keys = [1,2,3].map((n) => controllerKey({ caseId: `case-${n}`, attemptId: `model-${n}.1`, fencingToken: n })); const controllers = [];
    for (const key of keys) { authority.start(key); const c = new AbortController(); registry.register(key, c); controllers.push(c); }
    const capacity = 3;
    authority.terminal(keys[1]); registry.notify(keys[1]);
    const retry = controllerKey({ caseId: 'case-2', attemptId: 'model-2.2', fencingToken: 22 }); authority.start(retry);
    const retrySemanticallyEligible = authority.attempts.get(retry.attemptId).state === 'running';
    const retryAdmittedBeforeCleanup = registry.entries.size < capacity;
    assert.equal(retryAdmittedBeforeCleanup, false);
    assert.equal(registry.unregister(keys[1], controllers[1]), true);
    const retryController = new AbortController(); const retryRegistered = registry.register(retry, retryController);
    assert.equal(retryRegistered, true); assert.equal(registry.entries.size, capacity);
    assert.deepEqual(controllers.map((c) => c.signal.aborted), [false,true,false]);
    return { capacity, predecessorAborted: controllers.map((c) => c.signal.aborted), retrySemanticallyEligible, retryAdmittedBeforeCleanup, retryAdmittedAfterCleanup: retryRegistered, retryAborted: retryController.signal.aborted, liveBindings: registry.entries.size };
  });

  await record(13, 'D0017 logical authorization and derived physical cache', 'same physical context may dedupe across scopes while logical reference IDs differ', async () => {
    const cache = new PhysicalCache(typedDigest, authProfile, refProfile); cache.put(baseAuth.contextDigest, Buffer.from('context')); const other = { ...baseAuth, caseId: 'case-b' }; const a = cache.reference(baseAuth); const b = cache.reference(other);
    assert.notEqual(a.referenceId, b.referenceId); cache.read(a, baseAuth); cache.read(b, other); return { sameContextDigest: a.contextDigest === b.contextDigest, referenceIdEqual: a.referenceId === b.referenceId, physicalEntries: cache.entries.size, reads: cache.reads };
  });

  await record(14, 'D0017 authorization scope', 'copied logical reference across Case fails before physical read', async () => {
    const cache = new PhysicalCache(typedDigest, authProfile, refProfile); cache.put(baseAuth.contextDigest, Buffer.from('context')); const ref = cache.reference(baseAuth); const copied = { ...baseAuth, caseId: 'case-b' }; const before = cache.reads; let code = null; try { cache.read(ref, copied); } catch (error) { code = error.code; }
    assert.equal(code, 'context_reference_unauthorized'); assert.equal(cache.reads, before); return { code, physicalReads: cache.reads - before };
  });

  await record(15, 'D0017 authorization/stale binding', 'stale authorization scope is rejected even when physical bytes are valid', async () => {
    const cache = new PhysicalCache(typedDigest, authProfile, refProfile); cache.put(baseAuth.contextDigest, Buffer.from('context')); const ref = cache.reference(baseAuth); const stale = { ...baseAuth, planDigest: 'sha256:new-plan' }; const before = cache.reads; let code = null; try { cache.read(ref, stale); } catch (error) { code = error.code; }
    assert.equal(code, 'context_reference_unauthorized'); assert.equal(cache.reads, before); return { code, physicalReads: cache.reads - before, validPhysicalEntryStillPresent: cache.entries.has(baseAuth.contextDigest) };
  });

  await record(16, 'Derived cache integrity; authoritative source rebuild', 'corrupt cache is rejected/evicted and a later valid rebuild succeeds', async () => {
    const cache = new PhysicalCache(typedDigest, authProfile, refProfile); const good = Buffer.from('context'); cache.put(baseAuth.contextDigest, Buffer.from('corrupt')); const ref = cache.reference(baseAuth); let corruptCode = null; try { cache.read(ref, baseAuth, good); } catch (error) { corruptCode = error.code; }
    assert.equal(corruptCode, 'context_reference_corrupt'); cache.put(baseAuth.contextDigest, good); const value = cache.read(ref, baseAuth, good); return { corruptCode, validAfterRebuild: value.equals(good), materializations: cache.materializations };
  });

  await record(17, 'CaseEngine retry plus derived cache', 'cache loss between retries rebuilds bytes without changing logical reference when D0017 facts are unchanged', async () => {
    const cache = new PhysicalCache(typedDigest, authProfile, refProfile); const ref1 = cache.reference(baseAuth); cache.put(baseAuth.contextDigest, Buffer.from('context')); cache.entries.clear(); const ref2 = cache.reference(baseAuth); cache.put(baseAuth.contextDigest, Buffer.from('context')); assert.equal(ref1.referenceId, ref2.referenceId); return { referenceStable: true, materializations: cache.materializations };
  });

  await record(18, 'D0017 derived carrier/cache; authoritative Git source', 'cold restart with authoritative source available reconstructs same logical identity', async () => {
    const first = new PhysicalCache(typedDigest, authProfile, refProfile); const ref1 = first.reference(baseAuth); first.put(baseAuth.contextDigest, Buffer.from('context')); const restarted = new PhysicalCache(typedDigest, authProfile, refProfile); const ref2 = restarted.reference(baseAuth); restarted.put(baseAuth.contextDigest, Buffer.from('context')); assert.equal(ref1.referenceId, ref2.referenceId); return { referenceStable: true, rebuilt: true };
  });

  await record(19, 'Authoritative source availability boundary; no hidden fallback', 'cold restart without authoritative source fails typed-missing and performs no model invocation', async () => {
    const cache = new PhysicalCache(typedDigest, authProfile, refProfile); const ref = cache.reference(baseAuth); let code = null; try { cache.read(ref, baseAuth); } catch (error) { code = error.code; } assert.equal(code, 'context_reference_missing'); return { code, modelInvocations: 0, hiddenFallback: false };
  });

  await record(20, 'CaseEngine semantic state; transport deadline liveness', 'timeout cannot overwrite already-committed cancellation and transport timeout itself selects no semantic state', async () => {
    const authority = new AuthorityModel(); const key = controllerKey(); authority.start(key); authority.terminal(key, 'cancelled'); const timeoutOverwrote = authority.terminal(key, 'failed'); assert.equal(timeoutOverwrote, false);
    const secondAuthority = new AuthorityModel(); const second = controllerKey({ attemptId: 'model.2', fencingToken: 12 }); secondAuthority.start(second); const stateBeforeOwner = secondAuthority.attempts.get(second.attemptId).state; return { cancellationFirstFinal: authority.attempts.get(key.attemptId).state, timeoutOverwroteCancellation: timeoutOverwrote, timeoutFirstStateBeforeOwnerTransition: stateBeforeOwner };
  });

  await record(21, 'Runtime shutdown liveness; CaseEngine semantic cancellation', 'shutdown aborts transport but does not invent semantic terminal state; concurrent Task cancellation remains authoritative', async () => {
    const authority = new AuthorityModel(); const registry = new Registry(authority); const key = controllerKey(); authority.start(key); const controller = new AbortController(); registry.register(key, controller); registry.shutdown(); const stateAfterShutdown = authority.attempts.get(key.attemptId).state; authority.terminal(key, 'cancelled'); assert.equal(stateAfterShutdown, 'running'); return { transportAborted: controller.signal.aborted, stateAfterShutdownBeforeOwnerTransition: stateAfterShutdown, finalState: authority.attempts.get(key.attemptId).state };
  });

  await record(22, 'Transport descendant cleanup', 'direct child exit with descendant-held inherited pipe is bounded by process-group cleanup', async () => {
    if (process.platform === 'win32') return { skipped: true, reason: 'POSIX process-group semantics required' };
    const parentCode = [
      "const {spawn}=require('node:child_process');",
      "const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:['ignore','inherit','inherit'],detached:false});",
      "process.stdout.write(String(c.pid)); c.unref(); process.exit(0);",
    ].join('');
    const result = await withGuard(runModelSubprocess({ executable: process.execPath, args: ['-e', parentCode], input: Buffer.alloc(0), environment: process.env, workingDirectory: undefined, timeoutMs: 3_000, signal: new AbortController().signal, maxStdoutBytes: 4096, maxStderrBytes: 4096 }), 'descendant pipe cleanup');
    const descendantPid = Number(result.stdout.toString('utf8')); const descendantExited = await waitForExit(descendantPid); assert.equal(descendantExited, true); return { directChildCode: result.code, descendantPid, descendantExited, durationMs: result.durationMs };
  });

  const emitObservation = (callback, value) => { try { Promise.resolve(callback(value)).catch(() => {}); } catch {} };
  await record(23, 'Observation is non-authoritative/non-blocking', 'hanging observation callback cannot block runtime completion', async () => {
    let invoked = false; emitObservation(() => { invoked = true; return new Promise(() => {}); }, {}); await Promise.resolve(); assert.equal(invoked, true); return { invoked, awaited: false, blockedCompletion: false };
  });
  await record(24, 'Observation is non-authoritative/non-blocking', 'throwing observation callback cannot change runtime outcome', async () => {
    let invoked = false; emitObservation(() => { invoked = true; throw new Error('observer'); }, {}); assert.equal(invoked, true); return { invoked, throwEscaped: false, semanticMutation: false };
  });

  await record(25, 'Checkpoint owner persists exact snapshot revision; CaseEngine owns semantic revision', 'blocked checkpoint may persist old snapshot but must not acknowledge newer revision', async () => {
    const model = new CheckpointModel(); model.mutate('running'); const gate = deferred(); const saving = model.checkpointOnce(gate.promise); await Promise.resolve(); model.mutate('cancelled'); const newerRevision = model.revision; gate.resolve(); const persisted = await saving; assert.ok(persisted < newerRevision); assert.equal(model.checkpointedRevision, persisted); return { persistedRevision: persisted, semanticRevision: newerRevision, falselyAcknowledgedNewer: model.checkpointedRevision === newerRevision };
  });

  await record(26, 'Checkpoint reconciliation loop', 'after old snapshot persistence resumes, newer semantic revision is persisted before dependent dispatch/terminal return', async () => {
    const model = new CheckpointModel(); model.mutate('running'); const gate = deferred(); const saving = model.checkpointOnce(gate.promise); await Promise.resolve(); model.mutate('cancelled'); gate.resolve(); await saving; await model.drain(); assert.equal(model.checkpointedRevision, model.revision); return { persisted: model.persisted, finalCheckpointedRevision: model.checkpointedRevision, semanticRevision: model.revision };
  });

  await record(27, 'Checkpoint reconciliation loop', 'multiple rapid semantic transitions during one outstanding checkpoint are coalesced only by persisting a snapshot at the latest revision, never by false acknowledgement', async () => {
    const model = new CheckpointModel(); model.mutate('running'); const gate = deferred(); const saving = model.checkpointOnce(gate.promise); await Promise.resolve(); model.mutate('cancelled'); model.mutate('reconciling'); model.mutate('cancelled-final'); const latest = model.revision; gate.resolve(); await saving; await model.drain(); assert.equal(model.checkpointedRevision, latest); assert.equal(model.persisted.at(-1).revision, latest); return { persistedRevisions: model.persisted.map((entry) => entry.revision), latestSemanticRevision: latest, finalState: model.persisted.at(-1).state };
  });

  return results;
}

async function main() {
  const sourceRoot = sourceRootFromArgs();
  const engineModule = await import(pathToFileURL(path.join(sourceRoot, 'src/engine.mjs')));
  const runnerModule = await import(pathToFileURL(path.join(sourceRoot, 'src/runner.mjs')));
  const canonicalModule = await import(pathToFileURL(path.join(sourceRoot, 'src/canonical.mjs')));
  const selectedModule = await import(pathToFileURL(path.join(sourceRoot, 'src/selected-context-delivery.mjs')));
  const transportModule = await import(pathToFileURL(path.join(sourceRoot, 'src/repository-model-transport.mjs')));

  const currentSource = await currentSourceFalsifiers(
    sourceRoot, engineModule.CaseEngine, engineModule.definePlan, runnerModule.runCase,
  );
  const cases = await referenceProtocolCases({
    typedDigest: canonicalModule.typedDigest,
    authProfile: selectedModule.SELECTED_CONTEXT_AUTH_SCOPE_PROFILE,
    refProfile: selectedModule.SELECTED_CONTEXT_REFERENCE_PROFILE,
    runModelSubprocess: transportModule.runModelSubprocess,
  });

  const result = {
    schemaVersion: 1,
    evidenceKind: 'd0018-adversarial-convergence-falsifier',
    source: {
      root: sourceRoot,
      head: git(sourceRoot, ['rev-parse', 'HEAD']),
      engineBlob: git(sourceRoot, ['hash-object', 'src/engine.mjs']),
      runnerBlob: git(sourceRoot, ['hash-object', 'src/runner.mjs']),
      selectedContextBlob: git(sourceRoot, ['hash-object', 'src/selected-context-delivery.mjs']),
      repositoryModelTransportBlob: git(sourceRoot, ['hash-object', 'src/repository-model-transport.mjs']),
    },
    currentSource,
    referenceProtocol: {
      status: 'non-production executable design falsifier; passing cases do not claim source implementation',
      cases,
      passed: cases.every((entry) => entry.passed),
      count: cases.length,
    },
  };
  assert.equal(result.referenceProtocol.count, 27);
  assert.equal(result.referenceProtocol.passed, true);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
