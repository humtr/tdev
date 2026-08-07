import { open, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  ContractError,
  assertIdentifier,
  assertRecordShape,
  assertSafeInteger,
  canonicalJson,
  publicJsonClone,
  strictJsonParse,
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
