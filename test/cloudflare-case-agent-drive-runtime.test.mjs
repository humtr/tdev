import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CaseAgentDriveAuthority,
  MemoryCaseAgentDriveStore,
  SqliteCaseAgentDriveStore,
  CaseAgentDriveRuntimeDOHost,
  CASE_AGENT_DRIVE_STORAGE_PROFILE,
  CASE_AGENT_DRIVE_STORAGE_SCHEMA_VERSION,
} from '../src/index.mjs';

class FakeSqliteStorage {
  constructor() {
    this.row = null;
    this.sql = { exec: (statement, ...bindings) => this.#exec(statement, bindings) };
  }

  transactionSync(operation) { return operation(); }

  #exec(statement, bindings) {
    const sql = statement.replace(/\s+/g, ' ').trim();
    let result = [];
    if (sql.startsWith('CREATE TABLE IF NOT EXISTS case_agent_drive_state')) {
      // schema creation is intentionally a no-op in this in-memory fake
    } else if (sql === 'SELECT * FROM case_agent_drive_state WHERE case_id = ?') {
      result = this.row !== null && this.row.case_id === bindings[0] ? [{ ...this.row }] : [];
    } else if (sql.startsWith('INSERT INTO case_agent_drive_state(')) {
      const [caseId, revision, snapshotJson, snapshotBytes, storageProfile, storageSchemaVersion] = bindings;
      if (this.row !== null) throw new Error('duplicate fake drive row');
      this.row = {
        case_id: caseId,
        revision,
        snapshot_json: snapshotJson,
        snapshot_bytes: snapshotBytes,
        storage_profile: storageProfile,
        storage_schema_version: storageSchemaVersion,
      };
    } else if (sql.startsWith('UPDATE case_agent_drive_state SET')) {
      const [revision, snapshotJson, snapshotBytes, storageProfile, storageSchemaVersion, caseId] = bindings;
      if (this.row === null || this.row.case_id !== caseId) throw new Error('missing fake drive row');
      this.row = {
        case_id: caseId,
        revision,
        snapshot_json: snapshotJson,
        snapshot_bytes: snapshotBytes,
        storage_profile: storageProfile,
        storage_schema_version: storageSchemaVersion,
      };
    } else {
      throw new Error(`unsupported fake sqlite statement: ${sql}`);
    }
    return { toArray: () => result };
  }
}

function record() {
  const authority = new CaseAgentDriveAuthority({ store: new MemoryCaseAgentDriveStore() });
  return authority.initialize({
    caseId: 'case-drive-runtime',
    driveRequestId: 'drive-runtime-1',
    payload: { objective: 'source-path' },
  }).record;
}

test('D0042 SQLite store preserves canonical record identity and CAS revision', () => {
  const storage = new FakeSqliteStorage();
  const store = new SqliteCaseAgentDriveStore(storage, { maxSnapshotBytes: 64 * 1024 });
  const initial = record();
  assert.equal(store.create(initial), true);
  assert.deepEqual(store.load(initial.caseId), initial);
  assert.throws(
    () => store.create(initial),
    (error) => error?.code === 'case_agent_drive_exists',
  );
  const next = { ...initial, status: 'RECONCILING', revision: 1 };
  assert.equal(store.compareAndSwap(initial.caseId, 0, next), true);
  assert.equal(store.load(initial.caseId).revision, 1);
  assert.throws(
    () => store.compareAndSwap(initial.caseId, 0, { ...next, revision: 1 }),
    (error) => error?.code === 'case_agent_drive_revision_conflict',
  );
  assert.equal(storage.row.storage_profile, CASE_AGENT_DRIVE_STORAGE_PROFILE);
  assert.equal(storage.row.storage_schema_version, CASE_AGENT_DRIVE_STORAGE_SCHEMA_VERSION);
});

test('D0042 SQLite store fails closed on noncanonical/corrupt persisted data', () => {
  const storage = new FakeSqliteStorage();
  const store = new SqliteCaseAgentDriveStore(storage, { maxSnapshotBytes: 64 * 1024 });
  const initial = record();
  store.create(initial);
  storage.row.snapshot_json = JSON.stringify(initial, null, 2);
  storage.row.snapshot_bytes = Buffer.byteLength(storage.row.snapshot_json, 'utf8');
  assert.throws(
    () => store.load(initial.caseId),
    (error) => error?.code === 'case_agent_drive_store_corrupt',
  );
});

test('D0042 provider host exposes only intent/cursor operations over SQLite', async () => {
  const storage = new FakeSqliteStorage();
  const blocked = [];
  const ctx = {
    id: { toString: () => 'drive-do-1' },
    storage,
    blockConcurrencyWhile(operation) {
      blocked.push(Promise.resolve().then(operation));
      return blocked.at(-1);
    },
  };
  const host = new CaseAgentDriveRuntimeDOHost(ctx, { TDEV_CASE_AGENT_DRIVE_MAX_SNAPSHOT_BYTES: '65536' });
  await Promise.all(blocked);
  const initial = record();
  const accepted = host.initializeCaseAgentDrive({
    caseId: initial.caseId,
    driveRequestId: initial.driveRequestId,
    payload: { objective: 'source-path' },
  });
  assert.equal(accepted.classification, 'accepted');
  assert.deepEqual(host.readCaseAgentDrive({ caseId: initial.caseId }), initial);
  assert.deepEqual(host.snapshotCaseAgentDrive({ caseId: initial.caseId }), initial);
});

test('D0042 provider host commits bounded Case/Agent observations through the advance boundary', async () => {
  const storage = new FakeSqliteStorage();
  const ctx = {
    id: { toString: () => 'drive-do-advance' },
    storage,
    blockConcurrencyWhile(operation) { return Promise.resolve().then(operation); },
  };
  const host = new CaseAgentDriveRuntimeDOHost(ctx, { TDEV_CASE_AGENT_DRIVE_MAX_SNAPSHOT_BYTES: '65536' });
  const initial = record();
  host.initializeCaseAgentDrive({
    caseId: initial.caseId,
    driveRequestId: initial.driveRequestId,
    payload: { objective: 'source-path' },
  });
  const notReady = await host.advanceCaseAgentDrive({
    caseId: initial.caseId,
    driveRequestId: initial.driveRequestId,
    payload: { objective: 'source-path' },
    caseObservation: { caseRevision: 3, terminal: false, ready: false },
    agentObservation: { available: false },
  });
  assert.equal(notReady.classification, 'not_ready');
  assert.equal(notReady.record.lastCaseRevision, 3);
  assert.throws(
    () => host.advanceCaseAgentDrive({
      caseId: initial.caseId,
      driveRequestId: initial.driveRequestId,
      payload: { objective: 'source-path' },
      caseObservation: { caseRevision: 3, terminal: false, ready: true },
      agentObservation: { available: true },
    }),
    (error) => error?.code === 'case_agent_drive_dispatch_required',
  );
});
