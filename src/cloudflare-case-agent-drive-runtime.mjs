import {
  ContractError,
  assertIdentifier,
  assertSafeInteger,
  canonicalClone,
  canonicalJson,
  strictJsonParse,
} from './canonical.mjs';
import {
  CASE_AGENT_DRIVE_PROFILE,
  CASE_AGENT_DRIVE_SCHEMA_VERSION,
  CaseAgentDriveAuthority,
  caseAgentDriveRecordDigest,
} from './case-agent-drive.mjs';

export const CASE_AGENT_DRIVE_STORAGE_PROFILE = 'tdev.case-agent-drive.cloudflare-sqlite.v1';
export const CASE_AGENT_DRIVE_STORAGE_SCHEMA_VERSION = 1;
export const CASE_AGENT_DRIVE_DO_CLASS_NAME = 'CaseAgentDriveRuntimeDO';
export const CASE_AGENT_DRIVE_DEFAULT_MAX_SNAPSHOT_BYTES = 256 * 1024;

const textEncoder = new TextEncoder();

function fail(code, message, details = undefined, options = undefined) {
  throw new ContractError(code, message, details, options);
}

function byteLength(value) {
  return textEncoder.encode(value).byteLength;
}

function assertStorage(storage) {
  if (!storage || typeof storage.transactionSync !== 'function' || !storage.sql || typeof storage.sql.exec !== 'function') {
    fail('invalid_case_agent_drive_storage', 'Case-Agent drive storage requires transactionSync and SQLite exec');
  }
  return storage;
}

function rows(sql, statement, ...bindings) {
  const cursor = sql.exec(statement, ...bindings);
  if (!cursor || typeof cursor.toArray !== 'function') {
    fail('invalid_case_agent_drive_storage', 'Case-Agent drive SQLite cursor is invalid');
  }
  return cursor.toArray();
}

function oneOrNull(sql, statement, ...bindings) {
  const result = rows(sql, statement, ...bindings);
  if (result.length === 0) return null;
  if (result.length !== 1) fail('case_agent_drive_store_corrupt', 'Case-Agent drive store returned duplicate rows');
  return result[0];
}

function parseSnapshot(row, maxSnapshotBytes) {
  if (typeof row.snapshot_json !== 'string') {
    fail('case_agent_drive_store_corrupt', 'Stored Case-Agent drive snapshot is not text');
  }
  const snapshotBytes = Number(row.snapshot_bytes);
  if (!Number.isSafeInteger(snapshotBytes) || snapshotBytes <= 0 ||
      byteLength(row.snapshot_json) !== snapshotBytes || snapshotBytes > maxSnapshotBytes) {
    fail('case_agent_drive_store_corrupt', 'Stored Case-Agent drive snapshot byte accounting is invalid');
  }
  let snapshot;
  try {
    snapshot = strictJsonParse(row.snapshot_json, { maxBytes: maxSnapshotBytes });
  } catch (cause) {
    fail('case_agent_drive_store_corrupt', 'Stored Case-Agent drive snapshot is not bounded JSON', {}, { cause });
  }
  if (canonicalJson(snapshot) !== row.snapshot_json) {
    fail('case_agent_drive_store_corrupt', 'Stored Case-Agent drive snapshot is not canonical JSON');
  }
  try {
    // The authority's normalizer is intentionally the single record contract.
    caseAgentDriveRecordDigest(snapshot);
  } catch (cause) {
    fail('case_agent_drive_store_corrupt', 'Stored Case-Agent drive snapshot is outside the accepted profile', {}, { cause });
  }
  const revision = Number(row.revision);
  if (!Number.isSafeInteger(revision) || revision < 0 || snapshot.revision !== revision) {
    fail('case_agent_drive_store_corrupt', 'Stored Case-Agent drive revision is inconsistent');
  }
  if (row.storage_profile !== CASE_AGENT_DRIVE_STORAGE_PROFILE ||
      Number(row.storage_schema_version) !== CASE_AGENT_DRIVE_STORAGE_SCHEMA_VERSION) {
    fail('incompatible_case_agent_drive_schema', 'Stored Case-Agent drive profile/schema is incompatible');
  }
  if (snapshot.profile !== CASE_AGENT_DRIVE_PROFILE || snapshot.schemaVersion !== CASE_AGENT_DRIVE_SCHEMA_VERSION) {
    fail('incompatible_case_agent_drive_schema', 'Stored Case-Agent drive authority profile/schema is incompatible');
  }
  if (row.case_id !== snapshot.caseId) {
    fail('case_agent_drive_store_corrupt', 'Stored Case-Agent drive crossed Case identity');
  }
  return canonicalClone(snapshot);
}

function normalizedSnapshot(snapshot, maxSnapshotBytes) {
  const copy = canonicalClone(snapshot);
  // Validates all fields and prevents a storage adapter from becoming a second
  // schema owner. The digest function delegates to case-agent-drive's private
  // normalizer and therefore rejects unknown/future fields before persistence.
  caseAgentDriveRecordDigest(copy);
  const text = canonicalJson(copy);
  const snapshotBytes = byteLength(text);
  if (snapshotBytes > maxSnapshotBytes) {
    fail('case_agent_drive_storage_pressure', 'Case-Agent drive snapshot exceeds durable byte limit', {
      requiredBytes: snapshotBytes,
      maxSnapshotBytes,
    });
  }
  return { snapshot: copy, text, snapshotBytes };
}

export class SqliteCaseAgentDriveStore {
  constructor(storage, { maxSnapshotBytes = CASE_AGENT_DRIVE_DEFAULT_MAX_SNAPSHOT_BYTES } = {}) {
    this.storage = assertStorage(storage);
    if (!Number.isSafeInteger(maxSnapshotBytes) || maxSnapshotBytes < 1024) {
      fail('invalid_case_agent_drive_storage', 'Case-Agent drive snapshot byte limit is invalid');
    }
    this.sql = this.storage.sql;
    this.maxSnapshotBytes = maxSnapshotBytes;
    this.initialize();
  }

  initialize() {
    this.storage.transactionSync(() => this.sql.exec(`CREATE TABLE IF NOT EXISTS case_agent_drive_state (
      case_id TEXT PRIMARY KEY,
      revision INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      snapshot_bytes INTEGER NOT NULL,
      storage_profile TEXT NOT NULL,
      storage_schema_version INTEGER NOT NULL
    )`));
  }

  #row(caseId) {
    assertIdentifier(caseId, 'caseId');
    return oneOrNull(this.sql, 'SELECT * FROM case_agent_drive_state WHERE case_id = ?', caseId);
  }

  load(caseId) {
    const row = this.#row(caseId);
    return row === null ? null : parseSnapshot(row, this.maxSnapshotBytes);
  }

  create(snapshot) {
    const normalized = normalizedSnapshot(snapshot, this.maxSnapshotBytes);
    const caseId = normalized.snapshot.caseId;
    return this.storage.transactionSync(() => {
      if (this.#row(caseId) !== null) {
        fail('case_agent_drive_exists', `Drive record for ${caseId} already exists`);
      }
      this.sql.exec(`INSERT INTO case_agent_drive_state(
        case_id, revision, snapshot_json, snapshot_bytes, storage_profile, storage_schema_version
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      caseId,
      normalized.snapshot.revision,
      normalized.text,
      normalized.snapshotBytes,
      CASE_AGENT_DRIVE_STORAGE_PROFILE,
      CASE_AGENT_DRIVE_STORAGE_SCHEMA_VERSION);
      return true;
    });
  }

  compareAndSwap(caseId, expectedRevision, nextSnapshot) {
    assertIdentifier(caseId, 'caseId');
    if (expectedRevision !== null) assertSafeInteger(expectedRevision, 'expectedRevision', { min: 0 });
    const normalized = normalizedSnapshot(nextSnapshot, this.maxSnapshotBytes);
    if (normalized.snapshot.caseId !== caseId) {
      fail('case_agent_drive_store_corrupt', 'Case-Agent drive snapshot cannot cross Case identity');
    }
    if (expectedRevision !== null && normalized.snapshot.revision !== expectedRevision + 1) {
      fail('case_agent_drive_revision_invalid', 'Case-Agent drive CAS successor revision is invalid');
    }
    return this.storage.transactionSync(() => {
      const current = this.#row(caseId);
      const actualRevision = current === null ? null : Number(current.revision);
      if (actualRevision !== expectedRevision) {
        fail('case_agent_drive_revision_conflict', 'Case-Agent drive store revision changed', {
          caseId,
          expectedRevision,
          actualRevision,
        });
      }
      if (expectedRevision === null) {
        this.sql.exec(`INSERT INTO case_agent_drive_state(
          case_id, revision, snapshot_json, snapshot_bytes, storage_profile, storage_schema_version
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        caseId,
        normalized.snapshot.revision,
        normalized.text,
        normalized.snapshotBytes,
        CASE_AGENT_DRIVE_STORAGE_PROFILE,
        CASE_AGENT_DRIVE_STORAGE_SCHEMA_VERSION);
      } else {
        this.sql.exec(`UPDATE case_agent_drive_state SET
          revision = ?, snapshot_json = ?, snapshot_bytes = ?, storage_profile = ?, storage_schema_version = ?
          WHERE case_id = ?`,
        normalized.snapshot.revision,
        normalized.text,
        normalized.snapshotBytes,
        CASE_AGENT_DRIVE_STORAGE_PROFILE,
        CASE_AGENT_DRIVE_STORAGE_SCHEMA_VERSION,
        caseId);
      }
      return true;
    });
  }
}

function requiredDriveCaseId(input, label = 'Case-Agent drive request') {
  if (!input || typeof input !== 'object') fail('invalid_case_agent_drive_provider', `${label} must be a record`);
  assertIdentifier(input.caseId, `${label}.caseId`);
  return input.caseId;
}

export class CaseAgentDriveRuntimeDOHost {
  constructor(ctx, env = {}, options = {}) {
    if (!ctx?.id || typeof ctx.id.toString !== 'function' || !ctx.storage || typeof ctx.blockConcurrencyWhile !== 'function') {
      fail('invalid_case_agent_drive_provider', 'Case-Agent drive Durable Object context is incomplete');
    }
    this.ctx = ctx;
    this.env = env;
    const configuredMax = env.TDEV_CASE_AGENT_DRIVE_MAX_SNAPSHOT_BYTES === undefined
      ? CASE_AGENT_DRIVE_DEFAULT_MAX_SNAPSHOT_BYTES
      : Number(env.TDEV_CASE_AGENT_DRIVE_MAX_SNAPSHOT_BYTES);
    this.store = options.store ?? new SqliteCaseAgentDriveStore(ctx.storage, { maxSnapshotBytes: configuredMax });
    this.authority = options.authority ?? new CaseAgentDriveAuthority({ store: this.store });
    ctx.blockConcurrencyWhile(async () => {
      if (typeof this.store.initialize === 'function') this.store.initialize();
    });
  }

  initializeCaseAgentDrive(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      fail('invalid_case_agent_drive_provider', 'Case-Agent drive initialize input must be a record');
    }
    assertIdentifier(input.caseId, 'Case-Agent drive initialize.caseId');
    assertIdentifier(input.driveRequestId, 'Case-Agent drive initialize.driveRequestId');
    return this.authority.initialize(input);
  }

  readCaseAgentDrive(input) {
    return this.authority.read(requiredDriveCaseId(input));
  }

  quiesceCaseAgentDrive(input) {
    const caseId = requiredDriveCaseId(input, 'Case-Agent drive quiesce');
    return this.authority.quiesce(caseId, input);
  }

  /**
   * Commit one already-observed owner step to the durable D0042 cursor.  The
   * composition Worker performs the cross-DO Case/Agent dispatch, then sends
   * the exact bounded observations/outcome here.  The authority still owns all
   * status/revision transitions; this method never accepts a caller-selected
   * readiness or Task state.
   */
  advanceCaseAgentDrive(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      fail('invalid_case_agent_drive_provider', 'Case-Agent drive advance input must be a record');
    }
    assertIdentifier(input.caseId, 'Case-Agent drive advance.caseId');
    assertIdentifier(input.driveRequestId, 'Case-Agent drive advance.driveRequestId');
    if (!input.caseObservation || !input.agentObservation) {
      fail('invalid_case_agent_drive_provider', 'Case-Agent drive advance requires both owner observations');
    }
    if (input.dispatchResult === undefined && input.caseObservation.terminal !== true &&
        input.caseObservation.ready === true && input.agentObservation.available === true) {
      fail('case_agent_drive_dispatch_required', 'Ready Case/Agent observations require one precomputed dispatch outcome');
    }
    return this.authority.drive(input.caseId, {
      driveRequestId: input.driveRequestId,
      payload: input.payload ?? {},
      readCase: async () => input.caseObservation,
      readAgent: async () => input.agentObservation,
      ...(input.dispatchResult === undefined ? {} : { dispatch: async () => input.dispatchResult }),
    });
  }

  snapshotCaseAgentDrive(input) {
    return this.authority.snapshot(requiredDriveCaseId(input));
  }
}
