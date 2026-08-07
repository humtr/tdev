import { open, mkdir, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  ContractError,
  assertDigest,
  assertIdentifier,
  assertRecordShape,
  assertSafeInteger,
  canonicalJson,
  createRecord,
  exactKeys,
  isPlainRecord,
  publicJsonClone,
  strictJsonParse,
  typedDigest,
} from './canonical.mjs';

function validateSnapshotIdentity(snapshot, expectedCaseId = undefined) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new ContractError('invalid_store_snapshot', 'Stored Case snapshot must be a record');
  }
  assertIdentifier(snapshot.caseId, 'snapshot.caseId');
  assertSafeInteger(snapshot.caseRevision, 'snapshot.caseRevision', { min: 1 });
  if (expectedCaseId !== undefined && snapshot.caseId !== expectedCaseId) {
    throw new ContractError('store_case_mismatch', `Snapshot Case ${snapshot.caseId} does not match ${expectedCaseId}`);
  }
  return snapshot;
}

function casConflict(caseId, expectedRevision, actualRevision) {
  return new ContractError('store_revision_conflict', `Case ${caseId} revision changed`, {
    caseId,
    expectedRevision,
    actualRevision,
  });
}

export class MemorySnapshotStore {
  constructor() {
    this.snapshots = new Map();
  }

  async create(snapshot) {
    validateSnapshotIdentity(snapshot);
    return this.compareAndSwap(snapshot.caseId, null, snapshot);
  }

  async load(caseId) {
    assertIdentifier(caseId, 'caseId');
    const snapshot = this.snapshots.get(caseId);
    return snapshot === undefined ? null : publicJsonClone(snapshot);
  }

  async compareAndSwap(caseId, expectedRevision, snapshot) {
    assertIdentifier(caseId, 'caseId');
    validateSnapshotIdentity(snapshot, caseId);
    if (expectedRevision !== null) assertSafeInteger(expectedRevision, 'expectedRevision', { min: 1 });
    const current = this.snapshots.get(caseId);
    const actualRevision = current?.caseRevision ?? null;
    if (actualRevision !== expectedRevision) throw casConflict(caseId, expectedRevision, actualRevision);
    if (expectedRevision !== null && snapshot.caseRevision <= expectedRevision) {
      throw new ContractError('store_revision_regression', 'Replacement snapshot must advance the Case revision', {
        caseId,
        expectedRevision,
        replacementRevision: snapshot.caseRevision,
      });
    }
    const stored = publicJsonClone(snapshot);
    this.snapshots.set(caseId, stored);
    return publicJsonClone(stored);
  }
}

export class FileSnapshotStore {
  constructor(directory, options = {}) {
    assertRecordShape(options, [], ['maxBytes'], 'FileSnapshotStore options');
    if (typeof directory !== 'string' || directory.length === 0) {
      throw new ContractError('invalid_store_directory', 'FileSnapshotStore directory must be a non-empty string');
    }
    this.directory = path.resolve(directory);
    this.maxBytes = options.maxBytes ?? 64 * 1024 * 1024;
    assertSafeInteger(this.maxBytes, 'FileSnapshotStore.maxBytes', { min: 1 });
    this.locks = new Map();
    this.tempSequence = 0;
  }

  async create(snapshot) {
    validateSnapshotIdentity(snapshot);
    return this.compareAndSwap(snapshot.caseId, null, snapshot);
  }

  async load(caseId) {
    assertIdentifier(caseId, 'caseId');
    return this.#withLock(caseId, async () => this.#readUnlocked(caseId));
  }

  async compareAndSwap(caseId, expectedRevision, snapshot) {
    assertIdentifier(caseId, 'caseId');
    validateSnapshotIdentity(snapshot, caseId);
    if (expectedRevision !== null) assertSafeInteger(expectedRevision, 'expectedRevision', { min: 1 });
    return this.#withLock(caseId, async () => {
      await mkdir(this.directory, { recursive: true });
      const current = await this.#readUnlocked(caseId);
      const actualRevision = current?.caseRevision ?? null;
      if (actualRevision !== expectedRevision) throw casConflict(caseId, expectedRevision, actualRevision);
      if (expectedRevision !== null && snapshot.caseRevision <= expectedRevision) {
        throw new ContractError('store_revision_regression', 'Replacement snapshot must advance the Case revision', {
          caseId,
          expectedRevision,
          replacementRevision: snapshot.caseRevision,
        });
      }
      await this.#writeAtomic(caseId, snapshot);
      return publicJsonClone(snapshot);
    });
  }

  #filePath(caseId) {
    return path.join(this.directory, `${caseId}.json`);
  }

  async #readUnlocked(caseId) {
    const filePath = this.#filePath(caseId);
    let handle;
    let bytes;
    try {
      handle = await open(filePath, 'r');
      const metadata = await handle.stat();
      if (metadata.size > this.maxBytes) {
        throw new ContractError('store_snapshot_too_large', `Stored Case ${caseId} exceeds the store byte limit`, {
          size: metadata.size,
          limit: this.maxBytes,
        });
      }
      bytes = await handle.readFile();
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      if (error instanceof ContractError) throw error;
      throw new ContractError('store_read_failed', `Failed to read Case ${caseId}`, { caseId }, { cause: error });
    } finally {
      if (handle) await handle.close().catch(() => {});
    }
    try {
      const snapshot = strictJsonParse(bytes, { maxBytes: this.maxBytes });
      validateSnapshotIdentity(snapshot, caseId);
      const encoded = Buffer.from(canonicalJson(snapshot), 'utf8');
      if (!bytes.equals(encoded)) {
        throw new ContractError('store_noncanonical', `Stored Case ${caseId} is not canonical JSON`);
      }
      return publicJsonClone(snapshot);
    } catch (error) {
      if (error instanceof ContractError && error.code.startsWith('store_')) throw error;
      throw new ContractError('store_corrupt', `Stored Case ${caseId} is corrupt`, {
        caseId,
        causeCode: error?.code ?? null,
      }, { cause: error });
    }
  }

  async #writeAtomic(caseId, snapshot) {
    const finalPath = this.#filePath(caseId);
    this.tempSequence += 1;
    const tempPath = path.join(
      this.directory,
      `.${caseId}.${process.pid}.${this.tempSequence}.tmp`,
    );
    const payload = Buffer.from(canonicalJson(snapshot), 'utf8');
    if (payload.byteLength > this.maxBytes) {
      throw new ContractError('store_snapshot_too_large', `Case ${caseId} exceeds the store byte limit`, {
        size: payload.byteLength,
        limit: this.maxBytes,
      });
    }
    let handle;
    try {
      handle = await open(tempPath, 'wx', 0o600);
      await handle.writeFile(payload);
      await handle.sync();
      await handle.close();
      handle = null;
      await rename(tempPath, finalPath);
      const directoryHandle = await open(this.directory, 'r');
      try {
        await directoryHandle.sync();
      } finally {
        await directoryHandle.close();
      }
    } catch (error) {
      if (handle) await handle.close().catch(() => {});
      await rm(tempPath, { force: true }).catch(() => {});
      if (error instanceof ContractError) throw error;
      throw new ContractError('store_write_failed', `Failed to atomically write Case ${caseId}`, { caseId }, { cause: error });
    }
  }

  async #withLock(caseId, operation) {
    const previous = this.locks.get(caseId) ?? Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    const queued = previous.then(() => current);
    this.locks.set(caseId, queued);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.locks.get(caseId) === queued) this.locks.delete(caseId);
    }
  }
}

const JOURNAL_DELTA_SCHEMA_VERSION = 1;
const JOURNAL_DELTA_FILE = /^delta-(\d{16})\.json$/;

function caseSnapshotDigest(snapshot) {
  const { snapshotDigest: ignored, ...withoutDigest } = snapshot;
  return typedDigest('tdev.case-snapshot.v2', withoutDigest);
}

function validateJournalSnapshot(snapshot, expectedCaseId = undefined, { verifyDigest = true } = {}) {
  validateSnapshotIdentity(snapshot, expectedCaseId);
  if (snapshot.schemaVersion !== 2) {
    throw new ContractError('store_journal_snapshot_version', 'JournalSnapshotStore requires Case snapshot schema version 2');
  }
  if (!isPlainRecord(snapshot.plan) || !isPlainRecord(snapshot.caseContract) ||
      !Array.isArray(snapshot.events) || !isPlainRecord(snapshot.taskStates) ||
      !isPlainRecord(snapshot.attempts) || !isPlainRecord(snapshot.receipts) ||
      !isPlainRecord(snapshot.canonicalTree)) {
    throw new ContractError('store_journal_snapshot_shape', 'JournalSnapshotStore requires a complete Case snapshot');
  }
  assertDigest(snapshot.plan.planDigest, 'snapshot.plan.planDigest');
  assertDigest(snapshot.caseContract.contractDigest, 'snapshot.caseContract.contractDigest');
  assertDigest(snapshot.canonicalDigest, 'snapshot.canonicalDigest');
  assertDigest(snapshot.snapshotDigest, 'snapshot.snapshotDigest');
  if (verifyDigest && caseSnapshotDigest(snapshot) !== snapshot.snapshotDigest) {
    throw new ContractError('store_journal_snapshot_digest', 'Case snapshot digest is invalid');
  }
  return snapshot;
}

function taskStateFingerprint(taskState) {
  return canonicalJson({
    state: taskState.state,
    attemptIds: taskState.attemptIds,
    acceptedResultDigest: taskState.acceptedResultDigest,
    error: taskState.error,
    blockedBy: taskState.blockedBy,
  });
}

function attemptFingerprint(attempt) {
  return canonicalJson({
    state: attempt.state,
    resultDigest: attempt.resultDigest,
    error: attempt.error,
    reconciliation: attempt.reconciliation,
  });
}

function assertNoRemovedKeys(previous, next, label) {
  for (const key of Object.keys(previous)) {
    if (!Object.hasOwn(next, key)) {
      throw new ContractError('store_journal_nonmonotonic', `${label} cannot remove ${key}`);
    }
  }
}

function journalDeltaDigest(deltaWithoutDigest) {
  return typedDigest('tdev.snapshot-journal-delta.v1', deltaWithoutDigest);
}

function makeJournalDelta(previous, next) {
  if (next.caseRevision <= previous.caseRevision) {
    throw new ContractError('store_revision_regression', 'Replacement snapshot must advance the Case revision', {
      caseId: next.caseId,
      expectedRevision: previous.caseRevision,
      replacementRevision: next.caseRevision,
    });
  }
  if (next.plan.planDigest !== previous.plan.planDigest ||
      next.caseContract.contractDigest !== previous.caseContract.contractDigest) {
    throw new ContractError('store_journal_identity_change', 'Plan and Case contract are immutable within a Case journal');
  }
  if (next.events.length < previous.events.length) {
    throw new ContractError('store_journal_nonmonotonic', 'Case Events cannot be removed from a journal');
  }
  assertNoRemovedKeys(previous.taskStates, next.taskStates, 'Task states');
  assertNoRemovedKeys(previous.attempts, next.attempts, 'Attempts');
  assertNoRemovedKeys(previous.receipts, next.receipts, 'Receipts');

  const taskStates = createRecord();
  for (const [taskId, taskState] of Object.entries(next.taskStates)) {
    const prior = previous.taskStates[taskId];
    if (!prior || taskStateFingerprint(prior) !== taskStateFingerprint(taskState)) taskStates[taskId] = taskState;
  }
  const attempts = createRecord();
  for (const [attemptId, attempt] of Object.entries(next.attempts)) {
    const prior = previous.attempts[attemptId];
    if (!prior || attemptFingerprint(prior) !== attemptFingerprint(attempt)) attempts[attemptId] = attempt;
  }
  const receipts = createRecord();
  for (const [requestId, receipt] of Object.entries(next.receipts)) {
    if (!Object.hasOwn(previous.receipts, requestId)) receipts[requestId] = receipt;
  }

  const base = {
    schemaVersion: JOURNAL_DELTA_SCHEMA_VERSION,
    caseId: next.caseId,
    fromRevision: previous.caseRevision,
    toRevision: next.caseRevision,
    planDigest: next.plan.planDigest,
    caseContractDigest: next.caseContract.contractDigest,
    caseState: next.caseState,
    eventSequence: next.eventSequence,
    canonicalDigest: next.canonicalDigest,
    appendedEvents: next.events.slice(previous.events.length),
    taskStates,
    attempts,
    receipts,
    canonicalTree: next.canonicalDigest === previous.canonicalDigest ? null : next.canonicalTree,
    targetSnapshotDigest: next.snapshotDigest,
  };
  const delta = { ...base, deltaDigest: journalDeltaDigest(base) };
  // Replay and validate the target digest before any bytes become durable. This proves
  // the compact delta reconstructs the already validated replacement snapshot without
  // a second whole-snapshot byte-for-byte comparison.
  applyJournalDelta(previous, delta);
  return delta;
}

function validateJournalDelta(delta, expectedCaseId) {
  if (!isPlainRecord(delta)) throw new ContractError('store_journal_corrupt', 'Journal delta must be a record');
  exactKeys(delta, [
    'schemaVersion', 'caseId', 'fromRevision', 'toRevision', 'planDigest', 'caseContractDigest',
    'caseState', 'eventSequence', 'canonicalDigest', 'appendedEvents', 'taskStates', 'attempts',
    'receipts', 'canonicalTree', 'targetSnapshotDigest', 'deltaDigest',
  ], 'journal delta');
  if (delta.schemaVersion !== JOURNAL_DELTA_SCHEMA_VERSION) {
    throw new ContractError('store_journal_delta_version', `Unsupported journal delta version ${String(delta.schemaVersion)}`);
  }
  assertIdentifier(delta.caseId, 'journal delta caseId');
  if (delta.caseId !== expectedCaseId) throw new ContractError('store_case_mismatch', 'Journal delta Case identity is invalid');
  assertSafeInteger(delta.fromRevision, 'journal delta fromRevision', { min: 1 });
  assertSafeInteger(delta.toRevision, 'journal delta toRevision', { min: 1 });
  assertSafeInteger(delta.eventSequence, 'journal delta eventSequence', { min: 1 });
  for (const [value, label] of [
    [delta.planDigest, 'journal delta planDigest'],
    [delta.caseContractDigest, 'journal delta caseContractDigest'],
    [delta.canonicalDigest, 'journal delta canonicalDigest'],
    [delta.targetSnapshotDigest, 'journal delta targetSnapshotDigest'],
    [delta.deltaDigest, 'journal delta deltaDigest'],
  ]) assertDigest(value, label);
  if (!Array.isArray(delta.appendedEvents) || !isPlainRecord(delta.taskStates) ||
      !isPlainRecord(delta.attempts) || !isPlainRecord(delta.receipts) ||
      (delta.canonicalTree !== null && !isPlainRecord(delta.canonicalTree))) {
    throw new ContractError('store_journal_delta_shape', 'Journal delta collections are invalid');
  }
  const { deltaDigest: ignored, ...withoutDigest } = delta;
  if (journalDeltaDigest(withoutDigest) !== delta.deltaDigest) {
    throw new ContractError('store_journal_delta_digest', 'Journal delta digest is invalid');
  }
  return delta;
}

function overlayRecord(previous, changed) {
  const result = createRecord(Object.entries(previous));
  for (const [key, value] of Object.entries(changed)) result[key] = value;
  return result;
}

function applyJournalDelta(previous, inputDelta) {
  const delta = validateJournalDelta(inputDelta, previous.caseId);
  if (delta.fromRevision !== previous.caseRevision || delta.toRevision <= delta.fromRevision) {
    throw new ContractError('store_journal_gap', 'Journal delta does not continue the current Case revision', {
      currentRevision: previous.caseRevision,
      fromRevision: delta.fromRevision,
      toRevision: delta.toRevision,
    });
  }
  if (delta.planDigest !== previous.plan.planDigest ||
      delta.caseContractDigest !== previous.caseContract.contractDigest) {
    throw new ContractError('store_journal_identity_change', 'Journal delta changes immutable Plan or Case contract identity');
  }
  if (delta.eventSequence !== delta.toRevision ||
      previous.events.length + delta.appendedEvents.length !== delta.eventSequence) {
    throw new ContractError('store_journal_event_gap', 'Journal delta Event suffix does not match its target revision');
  }
  const result = {
    ...previous,
    caseState: delta.caseState,
    caseRevision: delta.toRevision,
    eventSequence: delta.eventSequence,
    events: [...previous.events, ...delta.appendedEvents],
    canonicalTree: delta.canonicalTree === null ? previous.canonicalTree : delta.canonicalTree,
    canonicalDigest: delta.canonicalDigest,
    taskStates: overlayRecord(previous.taskStates, delta.taskStates),
    attempts: overlayRecord(previous.attempts, delta.attempts),
    receipts: overlayRecord(previous.receipts, delta.receipts),
    snapshotDigest: delta.targetSnapshotDigest,
  };
  validateJournalSnapshot(result, previous.caseId);
  return result;
}

export class JournalSnapshotStore {
  constructor(directory, options = {}) {
    assertRecordShape(options, [], ['maxBytes', 'compactAfterDeltas'], 'JournalSnapshotStore options');
    if (typeof directory !== 'string' || directory.length === 0) {
      throw new ContractError('invalid_store_directory', 'JournalSnapshotStore directory must be a non-empty string');
    }
    this.directory = path.resolve(directory);
    this.maxBytes = options.maxBytes ?? 64 * 1024 * 1024;
    this.compactAfterDeltas = options.compactAfterDeltas ?? 64;
    assertSafeInteger(this.maxBytes, 'JournalSnapshotStore.maxBytes', { min: 1 });
    assertSafeInteger(this.compactAfterDeltas, 'JournalSnapshotStore.compactAfterDeltas', { min: 1 });
    this.locks = new Map();
    this.materialized = new Map();
    this.deltaCounts = new Map();
    this.tempSequence = 0;
  }

  async create(snapshot) {
    validateJournalSnapshot(snapshot);
    return this.compareAndSwap(snapshot.caseId, null, snapshot);
  }

  async load(caseId) {
    assertIdentifier(caseId, 'caseId');
    return this.#withLock(caseId, async () => {
      const snapshot = await this.#readUnlocked(caseId);
      if (snapshot === null) this.materialized.delete(caseId);
      else this.materialized.set(caseId, publicJsonClone(snapshot));
      return snapshot;
    });
  }

  async compareAndSwap(caseId, expectedRevision, snapshot) {
    assertIdentifier(caseId, 'caseId');
    validateJournalSnapshot(snapshot, caseId, { verifyDigest: expectedRevision === null });
    if (expectedRevision !== null) {
      assertSafeInteger(expectedRevision, 'expectedRevision', { min: 1 });
      const materializedBytes = Buffer.byteLength(canonicalJson(snapshot), 'utf8');
      if (materializedBytes > this.maxBytes) {
        throw new ContractError('store_snapshot_too_large', `Materialized Case ${caseId} exceeds the store byte limit`, {
          size: materializedBytes,
          limit: this.maxBytes,
        });
      }
    }
    return this.#withLock(caseId, async () => {
      await mkdir(this.directory, { recursive: true });
      await mkdir(this.#caseDirectory(caseId), { recursive: true });
      const cached = this.materialized.get(caseId);
      const current = cached === undefined ? await this.#readUnlocked(caseId) : cached;
      const actualRevision = current?.caseRevision ?? null;
      if (actualRevision !== expectedRevision) throw casConflict(caseId, expectedRevision, actualRevision);
      if (expectedRevision === null) {
        await this.#writeAtomic(caseId, this.#basePath(caseId), snapshot);
        this.materialized.set(caseId, publicJsonClone(snapshot));
        this.deltaCounts.set(caseId, 0);
        return publicJsonClone(snapshot);
      }
      if (snapshot.caseRevision <= expectedRevision) {
        throw new ContractError('store_revision_regression', 'Replacement snapshot must advance the Case revision', {
          caseId,
          expectedRevision,
          replacementRevision: snapshot.caseRevision,
        });
      }
      const delta = makeJournalDelta(current, snapshot);
      await this.#writeAtomic(caseId, this.#deltaPath(caseId, snapshot.caseRevision), delta);
      const deltaCount = (this.deltaCounts.get(caseId) ?? 0) + 1;
      if (deltaCount >= this.compactAfterDeltas) {
        await this.#compact(caseId, snapshot, await this.#listDeltaFiles(caseId));
        this.deltaCounts.set(caseId, 0);
      } else {
        this.deltaCounts.set(caseId, deltaCount);
      }
      this.materialized.set(caseId, publicJsonClone(snapshot));
      return publicJsonClone(snapshot);
    });
  }

  #caseDirectory(caseId) {
    return path.join(this.directory, caseId);
  }

  #basePath(caseId) {
    return path.join(this.#caseDirectory(caseId), 'base.json');
  }

  #deltaPath(caseId, revision) {
    return path.join(this.#caseDirectory(caseId), `delta-${String(revision).padStart(16, '0')}.json`);
  }

  async #listDeltaFiles(caseId) {
    let entries;
    try {
      entries = await readdir(this.#caseDirectory(caseId), { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw new ContractError('store_read_failed', `Failed to list journal for Case ${caseId}`, { caseId }, { cause: error });
    }
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => ({ entry, match: JOURNAL_DELTA_FILE.exec(entry.name) }))
      .filter(({ match }) => match !== null)
      .map(({ entry, match }) => ({ name: entry.name, revision: Number(match[1]) }))
      .sort((left, right) => left.revision - right.revision);
  }

  async #readCanonicalFile(filePath, caseId, { missing = false } = {}) {
    let handle;
    let bytes;
    try {
      handle = await open(filePath, 'r');
      const metadata = await handle.stat();
      if (metadata.size > this.maxBytes) {
        throw new ContractError('store_snapshot_too_large', `Stored Case ${caseId} journal file exceeds the store byte limit`, {
          size: metadata.size,
          limit: this.maxBytes,
        });
      }
      bytes = await handle.readFile();
    } catch (error) {
      if (missing && error?.code === 'ENOENT') return null;
      if (error instanceof ContractError) throw error;
      throw new ContractError('store_read_failed', `Failed to read Case ${caseId} journal`, { caseId }, { cause: error });
    } finally {
      if (handle) await handle.close().catch(() => {});
    }
    try {
      const value = strictJsonParse(bytes, { maxBytes: this.maxBytes });
      if (!bytes.equals(Buffer.from(canonicalJson(value), 'utf8'))) {
        throw new ContractError('store_noncanonical', `Stored Case ${caseId} journal file is not canonical JSON`);
      }
      return value;
    } catch (error) {
      if (error instanceof ContractError && error.code.startsWith('store_')) throw error;
      throw new ContractError('store_corrupt', `Stored Case ${caseId} journal is corrupt`, {
        caseId,
        causeCode: error?.code ?? null,
      }, { cause: error });
    }
  }

  async #readUnlocked(caseId) {
    const base = await this.#readCanonicalFile(this.#basePath(caseId), caseId, { missing: true });
    const deltaFiles = await this.#listDeltaFiles(caseId);
    if (base === null) {
      if (deltaFiles.length > 0) {
        throw new ContractError('store_journal_missing_base', `Case ${caseId} has journal deltas without a durable base`);
      }
      this.deltaCounts.set(caseId, 0);
      return null;
    }
    validateJournalSnapshot(base, caseId);
    const baseRevision = base.caseRevision;
    let current = base;
    let appliedDeltaCount = 0;
    for (const item of deltaFiles) {
      if (item.revision <= baseRevision) continue;
      const delta = await this.#readCanonicalFile(path.join(this.#caseDirectory(caseId), item.name), caseId);
      current = applyJournalDelta(current, delta);
      appliedDeltaCount += 1;
      if (current.caseRevision !== item.revision) {
        throw new ContractError('store_journal_filename', 'Journal delta filename does not match its target revision');
      }
    }
    this.deltaCounts.set(caseId, appliedDeltaCount);
    const materializedBytes = Buffer.byteLength(canonicalJson(current), 'utf8');
    if (materializedBytes > this.maxBytes) {
      throw new ContractError('store_snapshot_too_large', `Materialized Case ${caseId} exceeds the store byte limit`, {
        size: materializedBytes,
        limit: this.maxBytes,
      });
    }
    return publicJsonClone(current);
  }

  async #writeAtomic(caseId, finalPath, value) {
    const payload = Buffer.from(canonicalJson(value), 'utf8');
    if (payload.byteLength > this.maxBytes) {
      throw new ContractError('store_snapshot_too_large', `Case ${caseId} journal write exceeds the store byte limit`, {
        size: payload.byteLength,
        limit: this.maxBytes,
      });
    }
    this.tempSequence += 1;
    const tempPath = path.join(
      this.#caseDirectory(caseId),
      `.${path.basename(finalPath)}.${process.pid}.${this.tempSequence}.tmp`,
    );
    let handle;
    try {
      handle = await open(tempPath, 'wx', 0o600);
      await handle.writeFile(payload);
      await handle.sync();
      await handle.close();
      handle = null;
      await rename(tempPath, finalPath);
      await this.#syncCaseDirectory(caseId);
    } catch (error) {
      if (handle) await handle.close().catch(() => {});
      await rm(tempPath, { force: true }).catch(() => {});
      if (error instanceof ContractError) throw error;
      throw new ContractError('store_write_failed', `Failed to atomically write Case ${caseId} journal`, { caseId }, { cause: error });
    }
  }

  async #compact(caseId, snapshot, deltaFiles) {
    await this.#writeAtomic(caseId, this.#basePath(caseId), snapshot);
    for (const item of deltaFiles) {
      if (item.revision <= snapshot.caseRevision) {
        await rm(path.join(this.#caseDirectory(caseId), item.name), { force: true });
      }
    }
    await this.#syncCaseDirectory(caseId);
  }

  async #syncCaseDirectory(caseId) {
    const handle = await open(this.#caseDirectory(caseId), 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  async #withLock(caseId, operation) {
    const previous = this.locks.get(caseId) ?? Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    const queued = previous.then(() => current);
    this.locks.set(caseId, queued);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.locks.get(caseId) === queued) this.locks.delete(caseId);
    }
  }
}
