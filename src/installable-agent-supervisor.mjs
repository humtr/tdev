import { spawn as nodeSpawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { open, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  ContractError,
  assertDigest,
  assertRecordShape,
  assertSafeInteger,
  canonicalClone,
  canonicalJson,
  strictJsonParse,
  typedDigest,
} from './canonical.mjs';
import { normalizeInstallableAgentDataPlaneTuple } from './installable-agent-admission.mjs';
import { createLocalExecutionStartError } from './local-agent-runtime.mjs';

export const INSTALLABLE_AGENT_SUPERVISOR_PROFILE = 'tdev.agent.termux.pidfd.v1';
export const INSTALLABLE_AGENT_SUPERVISOR_SCHEMA_VERSION = 1;
export const INSTALLABLE_AGENT_WARDEN_PROTOCOL = 'tdev.installable-agent-warden.v1';

const DEFAULT_MAX_JOURNAL_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const DEFAULT_CLEANUP_WAIT_MS = 5_000;
const MAX_TEXT_BYTES = 4096;
const textEncoder = new TextEncoder();

function fail(code, message, details = undefined, options = undefined) {
  throw new ContractError(code, message, details, options);
}

function byteLength(value) {
  return textEncoder.encode(value).byteLength;
}

function boundedText(value, label, maxBytes = MAX_TEXT_BYTES) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || byteLength(value) > maxBytes) {
    fail('invalid_installable_agent_supervisor_text', `${label} is outside supported text bounds`, { maxBytes });
  }
  return value;
}

function normalizeLaunch(input, maxOutputBytes) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) fail('invalid_installable_agent_launch', 'Launch must be a record');
  assertRecordShape(input, ['command', 'env'], ['args', 'cwd', 'stdin'], 'installable Agent launch');
  boundedText(input.command, 'launch.command');
  const args = input.args ?? [];
  if (!Array.isArray(args) || args.length > 256 || args.some((arg) => typeof arg !== 'string' || byteLength(arg) > MAX_TEXT_BYTES || arg.includes('\0'))) {
    fail('invalid_installable_agent_launch', 'Launch args are outside supported bounds');
  }
  if (input.cwd !== undefined && input.cwd !== null) boundedText(input.cwd, 'launch.cwd', 16 * 1024);
  if (input.env === null || typeof input.env !== 'object' || Array.isArray(input.env)) {
    fail('invalid_installable_agent_launch', 'D0027 launch requires an explicit environment record');
  }
  const env = {};
  for (const [key, value] of Object.entries(input.env)) {
    boundedText(key, 'launch.env key', 512);
    if (typeof value !== 'string' || value.includes('\0') || byteLength(value) > 16 * 1024) fail('invalid_installable_agent_launch', 'Launch env value is invalid');
    env[key] = value;
  }
  let stdin = Buffer.alloc(0);
  if (input.stdin !== undefined && input.stdin !== null) {
    const raw = Buffer.isBuffer(input.stdin)
      ? input.stdin
      : Buffer.from(typeof input.stdin === 'string' ? input.stdin : canonicalJson(input.stdin));
    if (raw.byteLength > maxOutputBytes) fail('installable_agent_input_too_large', 'Launch stdin exceeds package bound');
    stdin = raw;
  }
  return {
    command: input.command,
    args: [...args],
    cwd: input.cwd ?? null,
    env,
    stdinBase64: stdin.toString('base64'),
    maxOutputBytes,
  };
}

function normalizeD0027Envelope(envelope) {
  assertRecordShape(envelope, [
    'type', 'deliveryId', 'dispatchOrdinal', 'authorizationId', 'dispatchGrantId', 'caseId', 'taskId', 'attemptId',
    'executorId', 'executorEpoch', 'fencingToken', 'protocolVersion', 'executableBody', 'installableAgentTuple',
    'socketIncarnationId', 'firstEmissionAdmissionId',
  ], [], 'D0027 supervisor dispatch envelope');
  if (envelope.type !== 'dispatch') fail('invalid_installable_agent_dispatch', 'Supervisor accepts only dispatch envelopes');
  for (const field of ['deliveryId', 'authorizationId', 'dispatchGrantId', 'fencingToken', 'firstEmissionAdmissionId']) assertDigest(envelope[field], field);
  assertSafeInteger(envelope.dispatchOrdinal, 'dispatchOrdinal', { min: 1 });
  assertSafeInteger(envelope.executorEpoch, 'executorEpoch', { min: 1 });
  boundedText(envelope.caseId, 'caseId');
  boundedText(envelope.taskId, 'taskId');
  boundedText(envelope.attemptId, 'attemptId');
  boundedText(envelope.executorId, 'executorId');
  boundedText(envelope.protocolVersion, 'protocolVersion');
  boundedText(envelope.socketIncarnationId, 'socketIncarnationId');
  envelope.installableAgentTuple = normalizeInstallableAgentDataPlaneTuple(envelope.installableAgentTuple);
  return canonicalClone(envelope);
}

function operationIdentity(envelope) {
  return typedDigest('tdev.installable-agent-operation.v1', {
    deliveryId: envelope.deliveryId,
    dispatchOrdinal: envelope.dispatchOrdinal,
    authorizationId: envelope.authorizationId,
    dispatchGrantId: envelope.dispatchGrantId,
    executorId: envelope.executorId,
    executorEpoch: envelope.executorEpoch,
    fencingToken: envelope.fencingToken,
    installableAgentTuple: envelope.installableAgentTuple,
    socketIncarnationId: envelope.socketIncarnationId,
    firstEmissionAdmissionId: envelope.firstEmissionAdmissionId,
  });
}

function journalRecord(sequence, type, fields) {
  return {
    schemaVersion: INSTALLABLE_AGENT_SUPERVISOR_SCHEMA_VERSION,
    profile: INSTALLABLE_AGENT_SUPERVISOR_PROFILE,
    sequence,
    type,
    ...canonicalClone(fields),
  };
}

function validateJournalRecord(record, expectedSequence) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) fail('installable_agent_journal_corrupt', 'Journal record must be a record');
  if (record.schemaVersion !== INSTALLABLE_AGENT_SUPERVISOR_SCHEMA_VERSION || record.profile !== INSTALLABLE_AGENT_SUPERVISOR_PROFILE) {
    fail('installable_agent_journal_incompatible', 'Journal profile/schema is incompatible');
  }
  assertSafeInteger(record.sequence, 'journal.sequence', { min: 1 });
  if (record.sequence !== expectedSequence) fail('installable_agent_journal_corrupt', 'Journal sequence is not contiguous');
  boundedText(record.type, 'journal.type', 128);
  return record;
}

export class MemoryInstallableAgentSupervisorJournal {
  constructor(records = []) {
    this.records = canonicalClone(records);
  }

  async readRecords() {
    return canonicalClone(this.records);
  }

  async append(record) {
    this.records.push(canonicalClone(record));
  }
}

export class FileInstallableAgentSupervisorJournal {
  constructor(filePath, { maxBytes = DEFAULT_MAX_JOURNAL_BYTES } = {}) {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) fail('invalid_installable_agent_journal', 'Supervisor journal path must be absolute package-owned configuration');
    assertSafeInteger(maxBytes, 'journal.maxBytes', { min: 1024 });
    this.filePath = filePath;
    this.directory = path.dirname(filePath);
    this.maxBytes = maxBytes;
    this.directorySynced = false;
  }

  async #ensureDirectory() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    if (!this.directorySynced) {
      const directoryHandle = await open(this.directory, 'r');
      try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
      this.directorySynced = true;
    }
  }

  async readRecords() {
    await this.#ensureDirectory();
    let bytes;
    try {
      bytes = await readFile(this.filePath);
    } catch (cause) {
      if (cause?.code === 'ENOENT') return [];
      throw cause;
    }
    if (bytes.byteLength > this.maxBytes) fail('installable_agent_journal_capacity', 'Supervisor journal exceeds its configured bound');
    if (bytes.byteLength === 0) return [];
    if (bytes[bytes.byteLength - 1] !== 0x0a) fail('installable_agent_journal_corrupt', 'Supervisor journal has a torn trailing record');
    const lines = bytes.toString('utf8').split('\n');
    lines.pop();
    return lines.map((line) => strictJsonParse(line, { maxBytes: this.maxBytes }));
  }

  async append(record) {
    await this.#ensureDirectory();
    const line = Buffer.from(`${canonicalJson(record)}\n`);
    let existingBytes = 0;
    try { existingBytes = (await readFile(this.filePath)).byteLength; } catch (cause) { if (cause?.code !== 'ENOENT') throw cause; }
    if (existingBytes + line.byteLength > this.maxBytes) fail('installable_agent_journal_capacity', 'Supervisor journal cannot append without exceeding its bound');
    const handle = await open(this.filePath, 'a', 0o600);
    try {
      await handle.write(line);
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (existingBytes === 0) {
      const directoryHandle = await open(this.directory, 'r');
      try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
    }
  }
}

function replayJournal(records) {
  let sequence = 0;
  let supervisorGenerationHighWater = 0;
  let operationGenerationHighWater = 0;
  const operations = new Map();
  for (const raw of records) {
    sequence += 1;
    const record = validateJournalRecord(raw, sequence);
    if (record.type === 'SUPERVISOR_START') {
      assertSafeInteger(record.supervisorGeneration, 'supervisorGeneration', { min: 1 });
      if (record.supervisorGeneration <= supervisorGenerationHighWater) fail('installable_agent_journal_corrupt', 'Supervisor generation was reused');
      supervisorGenerationHighWater = record.supervisorGeneration;
      continue;
    }
    if (record.type === 'PREPARED') {
      assertDigest(record.operationId, 'operationId');
      assertSafeInteger(record.operationGeneration, 'operationGeneration', { min: 1 });
      assertDigest(record.launchDigest, 'launchDigest');
      if (record.operationGeneration <= operationGenerationHighWater || operations.has(record.operationId)) fail('installable_agent_journal_corrupt', 'Operation identity/generation was reused');
      operationGenerationHighWater = record.operationGeneration;
      operations.set(record.operationId, { phase: 'PREPARED', terminal: false, records: [record] });
      continue;
    }
    if (!['ACTIVE', 'GO_ALLOWED', 'TERMINAL'].includes(record.type)) fail('installable_agent_journal_corrupt', 'Unknown journal record type');
    assertDigest(record.operationId, 'operationId');
    const operation = operations.get(record.operationId);
    if (!operation || operation.terminal) fail('installable_agent_journal_corrupt', 'Operation journal transition lacks a live predecessor');
    operation.records.push(record);
    if (record.type === 'ACTIVE') operation.phase = 'ACTIVE';
    if (record.type === 'GO_ALLOWED') operation.phase = 'GO_ALLOWED';
    if (record.type === 'TERMINAL') {
      operation.phase = 'TERMINAL';
      operation.terminal = true;
    }
  }
  return { sequence, supervisorGenerationHighWater, operationGenerationHighWater, operations };
}

async function defaultProcIncarnation(pid) {
  const [bootIdText, statText] = await Promise.all([
    readFile('/proc/sys/kernel/random/boot_id', 'utf8'),
    readFile(`/proc/${pid}/stat`, 'utf8'),
  ]);
  const closeParen = statText.lastIndexOf(')');
  if (closeParen < 0) fail('installable_agent_proc_identity_failed', 'Warden /proc stat is malformed');
  const fields = statText.slice(closeParen + 2).trim().split(/\s+/);
  const starttime = fields[19];
  if (!/^[0-9]+$/.test(starttime ?? '')) fail('installable_agent_proc_identity_failed', 'Warden starttime is unavailable');
  return {
    bootId: boundedText(bootIdText.trim(), 'bootId', 256),
    pid,
    pgid: pid,
    starttime,
  };
}

function processGroupAbsent(pgid) {
  try {
    process.kill(-pgid, 0);
    return false;
  } catch (cause) {
    if (cause?.code === 'ESRCH') return true;
    return false;
  }
}

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function parseWardenOutput(child, operationId, operationGeneration) {
  let buffered = '';
  let settled = false;
  let childExit = null;
  const completion = new Promise((resolve, reject) => {
    const rejectOnce = (cause) => {
      if (settled) return;
      settled = true;
      reject(cause);
    };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffered += chunk;
      for (;;) {
        const newline = buffered.indexOf('\n');
        if (newline === -1) break;
        const line = buffered.slice(0, newline);
        buffered = buffered.slice(newline + 1);
        let frame;
        try { frame = strictJsonParse(line, { maxBytes: 16 * 1024 * 1024 }); }
        catch (cause) { rejectOnce(Object.assign(new Error('warden emitted invalid frame'), { code: 'warden_invalid_frame', cause })); return; }
        if (frame.operationId !== operationId || frame.operationGeneration !== operationGeneration) {
          rejectOnce(Object.assign(new Error('warden frame identity mismatch'), { code: 'warden_identity_mismatch' }));
          return;
        }
        if (frame.type === 'warden_error') {
          rejectOnce(Object.assign(new Error(frame.message ?? 'warden error'), { code: frame.code ?? 'warden_error' }));
          return;
        }
        if (frame.type === 'tool_completed' && !settled) {
          settled = true;
          resolve(canonicalClone(frame.exit));
          return;
        }
      }
    });
    child.once('error', (cause) => rejectOnce(Object.assign(new Error('warden process error'), { code: cause?.code ?? 'warden_process_error', cause })));
    child.once('close', (code, signal) => {
      childExit = { code, signal };
      if (!settled) rejectOnce(Object.assign(new Error('warden closed before tool completion'), { code: 'warden_closed_early', childExit }));
    });
  });
  return { completion, childExit: () => childExit };
}

export class InstallableAgentSupervisor {
  constructor({
    journal,
    pidfdControl,
    spawnWarden = nodeSpawn,
    wardenPath = fileURLToPath(new URL('./installable-agent-warden.mjs', import.meta.url)),
    procIncarnation = defaultProcIncarnation,
    maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
    cleanupWaitMs = DEFAULT_CLEANUP_WAIT_MS,
    platformProfile = { platform: process.platform, arch: process.arch },
  }) {
    if (!journal || typeof journal.readRecords !== 'function' || typeof journal.append !== 'function') fail('invalid_installable_agent_supervisor', 'Supervisor requires a durable journal');
    if (!pidfdControl || !['probePidfd', 'pidfdOpen', 'pidfdSendSignal', 'pidfdExited', 'closePidfd'].every((name) => typeof pidfdControl[name] === 'function')) {
      fail('invalid_installable_agent_supervisor', 'Supervisor requires the packaged pidfd control ABI');
    }
    if (typeof spawnWarden !== 'function' || typeof procIncarnation !== 'function') fail('invalid_installable_agent_supervisor', 'Supervisor process primitives are invalid');
    assertSafeInteger(maxOutputBytes, 'maxOutputBytes', { min: 1, max: 64 * 1024 * 1024 });
    assertSafeInteger(cleanupWaitMs, 'cleanupWaitMs', { min: 0, max: 60_000 });
    this.journal = journal;
    this.pidfdControl = pidfdControl;
    this.spawnWarden = spawnWarden;
    this.wardenPath = wardenPath;
    this.procIncarnation = procIncarnation;
    this.maxOutputBytes = maxOutputBytes;
    this.cleanupWaitMs = cleanupWaitMs;
    this.platformProfile = canonicalClone(platformProfile);
    this.initialized = false;
    this.sequence = 0;
    this.supervisorGeneration = 0;
    this.operationGenerationHighWater = 0;
    this.history = new Map();
    this.live = new Map();
  }

  async initialize() {
    if (this.initialized) return this.status();
    const probe = this.pidfdControl.probePidfd();
    if (probe?.supported !== true) fail('installable_agent_profile_unsupported', 'pidfd feature probe did not positively pass');
    const replay = replayJournal(await this.journal.readRecords());
    this.sequence = replay.sequence;
    this.operationGenerationHighWater = replay.operationGenerationHighWater;
    this.history = replay.operations;
    if (replay.supervisorGenerationHighWater === Number.MAX_SAFE_INTEGER) fail('installable_agent_generation_overflow', 'supervisorGeneration cannot advance');
    this.supervisorGeneration = replay.supervisorGenerationHighWater + 1;
    await this.#append('SUPERVISOR_START', {
      supervisorGeneration: this.supervisorGeneration,
      platform: canonicalClone(this.platformProfile),
    });
    this.initialized = true;
    return this.status();
  }

  status() {
    const heldPredecessors = [];
    for (const [operationId, state] of this.history.entries()) {
      if (!state.terminal && !this.live.has(operationId)) heldPredecessors.push({ operationId, phase: state.phase });
    }
    heldPredecessors.sort((a, b) => a.operationId.localeCompare(b.operationId));
    return Object.freeze({
      profile: INSTALLABLE_AGENT_SUPERVISOR_PROFILE,
      schemaVersion: INSTALLABLE_AGENT_SUPERVISOR_SCHEMA_VERSION,
      initialized: this.initialized,
      supervisorGeneration: this.supervisorGeneration,
      operationGenerationHighWater: this.operationGenerationHighWater,
      liveOperations: this.live.size,
      heldPredecessors,
    });
  }

  async #append(type, fields) {
    if (this.sequence === Number.MAX_SAFE_INTEGER) fail('installable_agent_journal_capacity', 'Journal sequence cannot advance safely');
    const record = journalRecord(this.sequence + 1, type, fields);
    await this.journal.append(record);
    this.sequence += 1;
    return record;
  }

  async #cleanupLive(live) {
    const deadline = Date.now() + this.cleanupWaitMs;
    for (;;) {
      let exited = false;
      try { exited = this.pidfdControl.pidfdExited(live.pidfd) === true; } catch { exited = false; }
      if (exited && processGroupAbsent(live.incarnation.pgid)) {
        if (!live.terminalRecorded) {
          await this.#append('TERMINAL', {
            operationId: live.operationId,
            operationGeneration: live.operationGeneration,
            supervisorGeneration: this.supervisorGeneration,
            disposition: 'cleanup_complete',
            exit: live.exitRecord,
          });
          live.terminalRecorded = true;
          const history = this.history.get(live.operationId);
          if (history) { history.phase = 'TERMINAL'; history.terminal = true; }
        }
        try { this.pidfdControl.closePidfd(live.pidfd); } catch {}
        this.live.delete(live.operationId);
        return Object.freeze({ cleanupComplete: true, operationId: live.operationId, operationGeneration: live.operationGeneration });
      }
      if (Date.now() >= deadline) return Object.freeze({ cleanupComplete: false, operationId: live.operationId, operationGeneration: live.operationGeneration });
      await wait(10);
    }
  }

  async start({ envelope, launch }) {
    if (!this.initialized) fail('installable_agent_supervisor_not_initialized', 'Supervisor must be initialized before execution');
    const normalizedEnvelope = normalizeD0027Envelope(canonicalClone(envelope));
    const normalizedLaunch = normalizeLaunch(launch, this.maxOutputBytes);
    const operationId = operationIdentity(normalizedEnvelope);
    const historical = this.history.get(operationId);
    if (historical && !historical.terminal) fail('installable_agent_predecessor_held', 'Exact operation has nonterminal predecessor state and cannot be relaunched');
    if (historical?.terminal) fail('installable_agent_operation_replay_terminal', 'Exact operation already reached terminal local state');
    if (this.operationGenerationHighWater === Number.MAX_SAFE_INTEGER) fail('installable_agent_generation_overflow', 'operationGeneration cannot advance');
    const operationGeneration = this.operationGenerationHighWater + 1;
    const launchDigest = typedDigest('tdev.installable-agent-launch.v1', {
      operationId,
      operationGeneration,
      envelopeFence: {
        deliveryId: normalizedEnvelope.deliveryId,
        dispatchOrdinal: normalizedEnvelope.dispatchOrdinal,
        authorizationId: normalizedEnvelope.authorizationId,
        dispatchGrantId: normalizedEnvelope.dispatchGrantId,
        attemptId: normalizedEnvelope.attemptId,
        executorId: normalizedEnvelope.executorId,
        executorEpoch: normalizedEnvelope.executorEpoch,
        fencingToken: normalizedEnvelope.fencingToken,
        installableAgentTuple: normalizedEnvelope.installableAgentTuple,
        socketIncarnationId: normalizedEnvelope.socketIncarnationId,
        firstEmissionAdmissionId: normalizedEnvelope.firstEmissionAdmissionId,
      },
      launch: normalizedLaunch,
    });
    await this.#append('PREPARED', {
      operationId,
      operationGeneration,
      supervisorGeneration: this.supervisorGeneration,
      launchDigest,
      deliveryId: normalizedEnvelope.deliveryId,
      dispatchOrdinal: normalizedEnvelope.dispatchOrdinal,
      authorizationId: normalizedEnvelope.authorizationId,
      firstEmissionAdmissionId: normalizedEnvelope.firstEmissionAdmissionId,
      installableAgentTuple: normalizedEnvelope.installableAgentTuple,
    });
    this.operationGenerationHighWater = operationGeneration;
    this.history.set(operationId, { phase: 'PREPARED', terminal: false, records: [] });

    let warden;
    try {
      warden = this.spawnWarden(process.execPath, [this.wardenPath], {
        detached: true,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', TMPDIR: process.env.TMPDIR ?? '' },
      });
    } catch (cause) {
      await this.#append('TERMINAL', {
        operationId,
        operationGeneration,
        supervisorGeneration: this.supervisorGeneration,
        disposition: 'no_handle',
        causeCode: cause?.code ?? 'warden_spawn_failed',
      });
      const history = this.history.get(operationId);
      history.phase = 'TERMINAL'; history.terminal = true;
      throw createLocalExecutionStartError('warden_spawn_failed', 'WAIT_GO warden creation failed before a child handle was returned', { phase: 'pre_handle', cause });
    }
    if (!warden || !Number.isSafeInteger(warden.pid) || warden.pid <= 0 || !warden.stdin || !warden.stdout || !warden.stderr) {
      try { warden?.stdin?.end(); } catch {}
      throw createLocalExecutionStartError('warden_handle_ambiguous', 'WAIT_GO warden creation returned an incomplete handle', { phase: 'post_create', cleanupComplete: false, pid: warden?.pid ?? null });
    }

    let pidfd;
    try {
      pidfd = this.pidfdControl.pidfdOpen(warden.pid);
    } catch (cause) {
      try { warden.stdin.end(); } catch {}
      throw createLocalExecutionStartError('warden_pidfd_open_failed', 'Live pidfd acquisition failed after warden creation; no PID fallback is permitted', { phase: 'post_create', cleanupComplete: false, pid: warden.pid, cause });
    }
    const incarnation = await this.procIncarnation(warden.pid);
    const active = await this.#append('ACTIVE', {
      operationId,
      operationGeneration,
      supervisorGeneration: this.supervisorGeneration,
      launchDigest,
      incarnation,
    });
    this.history.get(operationId).phase = 'ACTIVE';
    const goAllowedDigest = typedDigest('tdev.installable-agent-go-allowed.v1', {
      operationId,
      operationGeneration,
      supervisorGeneration: this.supervisorGeneration,
      launchDigest,
      activeSequence: active.sequence,
      incarnation,
    });
    await this.#append('GO_ALLOWED', {
      operationId,
      operationGeneration,
      supervisorGeneration: this.supervisorGeneration,
      launchDigest,
      goAllowedDigest,
    });
    this.history.get(operationId).phase = 'GO_ALLOWED';
    const parser = parseWardenOutput(warden, operationId, operationGeneration);
    const live = {
      operationId,
      operationGeneration,
      pidfd,
      warden,
      incarnation,
      exitRecord: null,
      terminalRecorded: false,
    };
    this.live.set(operationId, live);
    const completion = parser.completion.then((exit) => {
      live.exitRecord = canonicalClone(exit);
      return exit;
    });
    const goToken = typedDigest('tdev.installable-agent-warden-go.v1', {
      operationId,
      operationGeneration,
      launchDigest,
      goAllowedDigest,
    });
    try {
      warden.stdin.end(`${canonicalJson({
        type: 'GO',
        operationId,
        operationGeneration,
        launchDigest,
        goAllowedDigest,
        goToken,
        launch: normalizedLaunch,
      })}\n`);
    } catch (cause) {
      let cleanupComplete = false;
      try {
        this.pidfdControl.pidfdSendSignal(pidfd, 15);
        cleanupComplete = (await this.#cleanupLive(live)).cleanupComplete;
      } catch {}
      throw createLocalExecutionStartError('warden_go_failed', 'GO delivery failed after GO_ALLOWED durability', { phase: 'post_create', cleanupComplete, pid: warden.pid, cause });
    }
    const cancel = async () => {
      if (!live.terminalRecorded) {
        try { this.pidfdControl.pidfdSendSignal(live.pidfd, 15); }
        catch (cause) { return Object.freeze({ signalled: false, exactHandle: true, causeCode: cause?.code ?? 'pidfd_signal_failed' }); }
        return Object.freeze({ signalled: true, exactHandle: true });
      }
      return Object.freeze({ signalled: false, exactHandle: true, alreadyTerminal: true });
    };
    const cleanup = async () => this.#cleanupLive(live);
    return Object.freeze({
      operationId,
      operationGeneration,
      supervisorGeneration: this.supervisorGeneration,
      pid: warden.pid,
      completion,
      cancel,
      cleanup,
    });
  }
}

function packageRoot() {
  return path.dirname(path.dirname(fileURLToPath(import.meta.url)));
}

async function loadPackagedPidfdControl({ manifestPath = path.join(packageRoot(), 'native', 'installable-agent-supervisor', 'manifest.json') } = {}) {
  let manifest;
  try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); }
  catch (cause) { fail('installable_agent_package_manifest_missing', 'Packaged pidfd helper manifest is missing or invalid', {}, { cause }); }
  if (manifest?.schemaVersion !== 1 || manifest?.abiVersion !== 1 || manifest?.profile !== INSTALLABLE_AGENT_SUPERVISOR_PROFILE || !manifest.helpers || typeof manifest.helpers !== 'object') {
    fail('installable_agent_package_manifest_mismatch', 'Packaged pidfd helper manifest is incompatible');
  }
  const key = `${process.platform}-${process.arch}`;
  const helper = manifest.helpers[key];
  if (!helper || helper.platform !== process.platform || helper.arch !== process.arch || typeof helper.relativePath !== 'string' || typeof helper.sha256 !== 'string') {
    fail('installable_agent_profile_unsupported', `No packaged pidfd helper exists for ${key}`);
  }
  const helperPath = path.join(packageRoot(), helper.relativePath);
  const bytes = await readFile(helperPath);
  const actualDigest = createHash('sha256').update(bytes).digest('hex');
  if (actualDigest !== helper.sha256) fail('installable_agent_package_manifest_mismatch', 'Packaged pidfd helper digest mismatches manifest');
  const require = createRequire(import.meta.url);
  return require(helperPath);
}

export async function createInstallableAgentSupervisor({
  journalPath,
  serviceReadyProbe,
  manifestPath,
  maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
  cleanupWaitMs = DEFAULT_CLEANUP_WAIT_MS,
} = {}) {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (!Number.isSafeInteger(nodeMajor) || nodeMajor < 22) fail('installable_agent_profile_unsupported', 'D0027 baseline requires Node.js >=22');
  if (process.platform !== 'android') fail('installable_agent_profile_unsupported', 'D0027 baseline profile requires Android/Termux');
  if (typeof serviceReadyProbe !== 'function' || (await serviceReadyProbe()) !== true) {
    fail('installable_agent_profile_unsupported', 'Package-owned long-lived service host readiness was not positively established');
  }
  const pidfdControl = await loadPackagedPidfdControl({ manifestPath });
  const supervisor = new InstallableAgentSupervisor({
    journal: new FileInstallableAgentSupervisorJournal(journalPath),
    pidfdControl,
    maxOutputBytes,
    cleanupWaitMs,
  });
  await supervisor.initialize();
  return supervisor;
}

export function createInstallableAgentSupervisorExecutionAdapter({ supervisor, resolveExecution, maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES } = {}) {
  if (!(supervisor instanceof InstallableAgentSupervisor)) fail('invalid_installable_agent_supervisor_adapter', 'Execution adapter requires InstallableAgentSupervisor');
  if (typeof resolveExecution !== 'function') fail('invalid_installable_agent_supervisor_adapter', 'Execution adapter requires resolveExecution');
  assertSafeInteger(maxOutputBytes, 'maxOutputBytes', { min: 1, max: 64 * 1024 * 1024 });
  return Object.freeze({
    async start({ envelope, signalContext }) {
      let launch;
      try {
        launch = await resolveExecution(canonicalClone(envelope.executableBody), Object.freeze({ envelope, signalContext }));
        if (launch === null || typeof launch !== 'object' || Array.isArray(launch)) fail('invalid_installable_agent_launch', 'Resolved D0027 launch must be a record');
      } catch (cause) {
        if (cause?.startFailurePhase) throw cause;
        throw createLocalExecutionStartError(cause?.code ?? 'invalid_installable_agent_launch', cause?.message ?? 'D0027 pre-launch resolution failed', { phase: 'pre_handle', cause });
      }
      const effectFromExit = launch.effectFromExit;
      const resultEnvelopeFactory = launch.resultEnvelopeFactory;
      const operation = await supervisor.start({
        envelope,
        launch: {
          command: launch.command,
          args: launch.args,
          cwd: launch.cwd,
          env: launch.env,
          stdin: launch.stdin,
        },
      });
      const completion = operation.completion.then(async (exit) => {
        let effect;
        if (typeof effectFromExit === 'function') effect = await effectFromExit(exit);
        let resultEnvelope;
        if (typeof resultEnvelopeFactory === 'function') resultEnvelope = await resultEnvelopeFactory(exit);
        return Object.freeze({
          code: exit.code,
          signal: exit.signal,
          stdout: exit.stdout,
          stderr: exit.stderr,
          stdoutOverflow: exit.stdoutOverflow,
          stderrOverflow: exit.stderrOverflow,
          effect: effect === 'applied' || effect === 'not_applied' ? effect : undefined,
          resultEnvelope,
        });
      });
      return Object.freeze({
        operationId: operation.operationId,
        operationGeneration: operation.operationGeneration,
        supervisorGeneration: operation.supervisorGeneration,
        completion,
        cancel: operation.cancel,
        cleanup: operation.cleanup,
      });
    },
  });
}
