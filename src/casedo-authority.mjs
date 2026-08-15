import {
  ContractError,
  assertIdentifier,
  assertRecordShape,
  canonicalClone,
  canonicalJson,
  strictJsonParse,
  typedDigest,
} from './canonical.mjs';
import { CaseEngine, inspectCaseCommandEnvelope } from './engine.mjs';
import { SEMANTIC_PROFILE, validateSemanticObjectRecord } from './semantic-authority.mjs';
import {
  SEMANTIC_SNAPSHOT_SCHEMA_VERSION,
  createSemanticHead,
  validateSemanticHead,
  validateSemanticSnapshot,
} from './semantic-snapshot.mjs';

export const CASEDO_STORAGE_PROFILE = 'tdev.casedo.sqlite-authority.v1';
export const CASEDO_STORAGE_SCHEMA_VERSION = 1;
export const CASEDO_WRITER_PROTOCOL = 'tdev.casedo.writer.v1';
export const CASEDO_DEFAULT_CHUNK_BYTES = 256 * 1024;
export const CASEDO_MAX_RECOVERY_CAUSE_BYTES = 32 * 1024;

const PLACEMENT_DOMAIN = 'tdev.casedo.placement.v1';
const RECOVERY_CAUSE_DOMAIN = 'tdev.casedo.execution-owner-loss.v1';
const ROW_OVERHEAD_BYTES = 256;
const META_OVERHEAD_BYTES = 4096;
const MAX_PLACEMENT_FIELD_BYTES = 2048;
const MAX_WRITER_COMPATIBILITY_BYTES = 1024;
const textEncoder = new TextEncoder();

function utf8Bytes(value) {
  return textEncoder.encode(value).byteLength;
}

function assertPositiveSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ContractError('invalid_casedo_integer', `${label} must be a positive safe integer`);
  }
  return value;
}

function storedNonNegativeInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new ContractError('casedo_store_corrupt', `${label} is not a non-negative safe integer`);
  }
  return parsed;
}

function addStoredBytes(total, value, label) {
  const next = total + value;
  if (!Number.isSafeInteger(next) || next < 0) {
    throw new ContractError('casedo_store_corrupt', `${label} exceeds safe integer accounting`);
  }
  return next;
}

function assertBoundedString(value, label, maxBytes = MAX_PLACEMENT_FIELD_BYTES) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new ContractError('invalid_casedo_string', `${label} must be a non-empty string without NUL`);
  }
  if (utf8Bytes(value) > maxBytes) {
    throw new ContractError('casedo_string_too_large', `${label} exceeds its byte limit`, { maxBytes });
  }
  return value;
}

function assertStorage(storage) {
  if (!storage || typeof storage.transactionSync !== 'function' || !storage.sql || typeof storage.sql.exec !== 'function') {
    throw new ContractError('invalid_casedo_storage', 'CaseDO authority requires storage.transactionSync and storage.sql.exec');
  }
  return storage;
}

function sqlRows(sql, statement, ...bindings) {
  const cursor = sql.exec(statement, ...bindings);
  if (!cursor || typeof cursor.toArray !== 'function') {
    throw new ContractError('invalid_casedo_sql_cursor', 'SQLite exec must return a cursor with toArray()');
  }
  return cursor.toArray();
}

function sqlOneOrNull(sql, statement, ...bindings) {
  const rows = sqlRows(sql, statement, ...bindings);
  if (rows.length === 0) return null;
  if (rows.length !== 1) throw new ContractError('casedo_store_corrupt', 'Expected at most one SQLite row');
  return rows[0];
}

function sqlExec(sql, statement, ...bindings) {
  sql.exec(statement, ...bindings);
}

function chunkText(text, maxBytes) {
  const chunks = [];
  let parts = [];
  let bytes = 0;
  for (const character of text) {
    const characterBytes = utf8Bytes(character);
    if (characterBytes > maxBytes) {
      throw new ContractError('casedo_chunk_too_small', 'Configured chunk size cannot hold one Unicode scalar');
    }
    if (bytes + characterBytes > maxBytes && parts.length > 0) {
      chunks.push(parts.join(''));
      parts = [];
      bytes = 0;
    }
    parts.push(character);
    bytes += characterBytes;
  }
  if (parts.length > 0 || text.length === 0) chunks.push(parts.join(''));
  return chunks;
}

function parseCanonicalJson(text, maxBytes, label) {
  let value;
  try {
    value = strictJsonParse(text, { maxBytes });
  } catch (cause) {
    throw new ContractError('casedo_store_corrupt', `${label} is not valid bounded JSON`, {}, { cause });
  }
  if (canonicalJson(value) !== text) {
    throw new ContractError('casedo_store_corrupt', `${label} is not canonical JSON`);
  }
  return value;
}

function validatePlacementFields(input) {
  assertRecordShape(
    input,
    ['caseId', 'placementGeneration', 'deployment', 'environment', 'workerScript', 'className', 'namespace', 'jurisdiction', 'durableObjectId'],
    [],
    'CaseDO placement',
  );
  assertIdentifier(input.caseId, 'placement.caseId');
  assertPositiveSafeInteger(input.placementGeneration, 'placement.placementGeneration');
  for (const key of ['deployment', 'environment', 'workerScript', 'className', 'namespace', 'jurisdiction', 'durableObjectId']) {
    assertBoundedString(input[key], `placement.${key}`);
  }
  return {
    caseId: input.caseId,
    placementGeneration: input.placementGeneration,
    deployment: input.deployment,
    environment: input.environment,
    workerScript: input.workerScript,
    className: input.className,
    namespace: input.namespace,
    jurisdiction: input.jurisdiction,
    durableObjectId: input.durableObjectId,
  };
}

export function createCasePlacement(input) {
  const identity = canonicalClone(validatePlacementFields(input));
  return Object.freeze({ ...identity, placementDigest: typedDigest(PLACEMENT_DOMAIN, identity) });
}

export function validateCasePlacement(input) {
  assertRecordShape(
    input,
    ['caseId', 'placementGeneration', 'deployment', 'environment', 'workerScript', 'className', 'namespace', 'jurisdiction', 'durableObjectId', 'placementDigest'],
    [],
    'CaseDO placement record',
  );
  const recreated = createCasePlacement({
    caseId: input.caseId,
    placementGeneration: input.placementGeneration,
    deployment: input.deployment,
    environment: input.environment,
    workerScript: input.workerScript,
    className: input.className,
    namespace: input.namespace,
    jurisdiction: input.jurisdiction,
    durableObjectId: input.durableObjectId,
  });
  if (input.placementDigest !== recreated.placementDigest) {
    throw new ContractError('placement_digest_mismatch', 'CaseDO placement digest is invalid');
  }
  return recreated;
}

function createHead(snapshot, previousHead = null) {
  const previous = previousHead === null ? null : validateSemanticHead(previousHead);
  const authority = snapshot.semanticAuthority;
  return createSemanticHead({
    caseId: snapshot.caseId,
    authorityEpoch: authority.authorityEpoch,
    generation: previous === null ? 1 : previous.generation + 1,
    caseRevision: snapshot.caseRevision,
    snapshotDigest: snapshot.snapshotDigest,
    baseRootDigest: authority.baseRoot.rootDigest,
    canonicalRootDigest: authority.canonicalRoot.rootDigest,
    previousHeadDigest: previous?.headDigest ?? null,
  });
}

function normalizeMetaRow(row) {
  if (row === null) return null;
  const integerFields = ['placement_generation', 'storage_schema_version', 'semantic_snapshot_schema_version', 'snapshot_chunk_count', 'snapshot_bytes', 'authoritative_bytes'];
  for (const field of integerFields) {
    if (!Number.isSafeInteger(Number(row[field])) || Number(row[field]) < 0) {
      throw new ContractError('casedo_store_corrupt', `CaseDO metadata ${field} is invalid`);
    }
  }
  return {
    ...row,
    placement_generation: Number(row.placement_generation),
    storage_schema_version: Number(row.storage_schema_version),
    semantic_snapshot_schema_version: Number(row.semantic_snapshot_schema_version),
    snapshot_chunk_count: Number(row.snapshot_chunk_count),
    snapshot_bytes: Number(row.snapshot_bytes),
    authoritative_bytes: Number(row.authoritative_bytes),
  };
}

export class CaseDOAuthority {
  constructor(storage, options = {}) {
    assertRecordShape(options, ['maxAuthoritativeBytesPerCase', 'writerCompatibilityId'], ['chunkBytes', 'faultInjector'], 'CaseDO authority options');
    this.storage = assertStorage(storage);
    this.maxAuthoritativeBytesPerCase = assertPositiveSafeInteger(options.maxAuthoritativeBytesPerCase, 'maxAuthoritativeBytesPerCase');
    this.writerCompatibilityId = assertBoundedString(options.writerCompatibilityId, 'writerCompatibilityId', MAX_WRITER_COMPATIBILITY_BYTES);
    this.chunkBytes = options.chunkBytes ?? CASEDO_DEFAULT_CHUNK_BYTES;
    assertPositiveSafeInteger(this.chunkBytes, 'chunkBytes');
    if (this.chunkBytes > 512 * 1024) throw new ContractError('casedo_chunk_too_large', 'CaseDO chunkBytes must be at most 512 KiB');
    if (options.faultInjector !== undefined && typeof options.faultInjector !== 'function') {
      throw new ContractError('invalid_casedo_fault_injector', 'faultInjector must be a function');
    }
    this.faultInjector = options.faultInjector ?? null;
  }

  initialize() {
    const sql = this.storage.sql;
    sqlExec(sql, `CREATE TABLE IF NOT EXISTS casedo_meta (
      singleton INTEGER PRIMARY KEY CHECK(singleton = 1), case_id TEXT NOT NULL,
      placement_generation INTEGER NOT NULL, placement_digest TEXT NOT NULL,
      storage_profile TEXT NOT NULL, storage_schema_version INTEGER NOT NULL,
      semantic_profile TEXT NOT NULL, semantic_snapshot_schema_version INTEGER NOT NULL,
      head_json TEXT NOT NULL, writer_protocol TEXT NOT NULL, writer_compatibility_id TEXT NOT NULL,
      snapshot_chunk_count INTEGER NOT NULL, snapshot_bytes INTEGER NOT NULL, authoritative_bytes INTEGER NOT NULL
    )`);
    sqlExec(sql, `CREATE TABLE IF NOT EXISTS casedo_snapshot_chunks (
      chunk_index INTEGER PRIMARY KEY, payload TEXT NOT NULL
    )`);
    sqlExec(sql, `CREATE TABLE IF NOT EXISTS casedo_objects (
      digest TEXT PRIMARY KEY, kind TEXT NOT NULL, chunk_count INTEGER NOT NULL, byte_length INTEGER NOT NULL
    )`);
    sqlExec(sql, `CREATE TABLE IF NOT EXISTS casedo_object_chunks (
      digest TEXT NOT NULL, chunk_index INTEGER NOT NULL, payload TEXT NOT NULL,
      PRIMARY KEY(digest, chunk_index)
    )`);
    sqlExec(sql, `CREATE TABLE IF NOT EXISTS casedo_recoveries (
      recovery_id TEXT PRIMARY KEY, cause_digest TEXT NOT NULL, committed_revision INTEGER NOT NULL,
      head_digest TEXT NOT NULL, byte_length INTEGER NOT NULL
    )`);
  }

  #fault(stage, details = {}) {
    if (this.faultInjector) this.faultInjector(stage, details);
  }

  #readMeta() {
    return normalizeMetaRow(sqlOneOrNull(this.storage.sql, 'SELECT * FROM casedo_meta WHERE singleton = 1'));
  }

  #validateMeta(meta, placement) {
    if (meta === null) throw new ContractError('case_not_found', `Case ${placement.caseId} does not exist in this CaseDO`);
    if (meta.case_id !== placement.caseId || meta.placement_generation !== placement.placementGeneration || meta.placement_digest !== placement.placementDigest) {
      throw new ContractError('placement_conflict', 'CaseDO durable placement identity does not match the elected route');
    }
    if (meta.storage_profile !== CASEDO_STORAGE_PROFILE || meta.storage_schema_version !== CASEDO_STORAGE_SCHEMA_VERSION) {
      throw new ContractError('incompatible_casedo_schema', 'CaseDO storage profile/schema is incompatible');
    }
    if (meta.semantic_profile !== SEMANTIC_PROFILE || meta.semantic_snapshot_schema_version !== SEMANTIC_SNAPSHOT_SCHEMA_VERSION) {
      throw new ContractError('incompatible_semantic_schema', 'CaseDO semantic profile/schema is incompatible');
    }
    if (meta.writer_protocol !== CASEDO_WRITER_PROTOCOL || meta.writer_compatibility_id !== this.writerCompatibilityId) {
      throw new ContractError('incompatible_casedo_writer', 'CaseDO writer compatibility barrier rejected this code');
    }
    const head = validateSemanticHead(parseCanonicalJson(meta.head_json, 32 * 1024, 'CaseDO head'));
    if (head.caseId !== placement.caseId) throw new ContractError('casedo_store_corrupt', 'CaseDO head CaseId is inconsistent');
    return head;
  }

  #loadSnapshot(meta, head) {
    const rows = sqlRows(this.storage.sql, 'SELECT chunk_index, payload FROM casedo_snapshot_chunks ORDER BY chunk_index ASC');
    if (rows.length !== meta.snapshot_chunk_count) throw new ContractError('casedo_store_corrupt', 'CaseDO snapshot chunk count is inconsistent');
    for (let index = 0; index < rows.length; index += 1) {
      if (Number(rows[index].chunk_index) !== index || utf8Bytes(rows[index].payload) > this.chunkBytes) {
        throw new ContractError('casedo_store_corrupt', 'CaseDO snapshot chunks are invalid');
      }
    }
    const text = rows.map((row) => row.payload).join('');
    if (utf8Bytes(text) !== meta.snapshot_bytes) throw new ContractError('casedo_store_corrupt', 'CaseDO snapshot byte count is inconsistent');
    const snapshot = validateSemanticSnapshot(parseCanonicalJson(text, this.maxAuthoritativeBytesPerCase, 'CaseDO semantic snapshot'));
    if (snapshot.caseId !== meta.case_id || snapshot.schemaVersion !== SEMANTIC_SNAPSHOT_SCHEMA_VERSION ||
        snapshot.snapshotDigest !== head.snapshotDigest || snapshot.caseRevision !== head.caseRevision) {
      throw new ContractError('casedo_store_corrupt', 'CaseDO snapshot does not match its durable head');
    }
    return snapshot;
  }

  #loadObject(digest) {
    const meta = sqlOneOrNull(this.storage.sql, 'SELECT digest, kind, chunk_count, byte_length FROM casedo_objects WHERE digest = ?', digest);
    if (meta === null) return null;
    const chunkCount = Number(meta.chunk_count);
    const byteLength = Number(meta.byte_length);
    if (!Number.isSafeInteger(chunkCount) || chunkCount <= 0 || !Number.isSafeInteger(byteLength) || byteLength <= 0) {
      throw new ContractError('casedo_store_corrupt', `Semantic object ${digest} metadata is invalid`);
    }
    const rows = sqlRows(this.storage.sql, 'SELECT chunk_index, payload FROM casedo_object_chunks WHERE digest = ? ORDER BY chunk_index ASC', digest);
    if (rows.length !== chunkCount) throw new ContractError('casedo_store_corrupt', `Semantic object ${digest} chunk count is inconsistent`);
    for (let index = 0; index < rows.length; index += 1) {
      if (Number(rows[index].chunk_index) !== index || utf8Bytes(rows[index].payload) > this.chunkBytes) {
        throw new ContractError('casedo_store_corrupt', `Semantic object ${digest} chunks are invalid`);
      }
    }
    const text = rows.map((row) => row.payload).join('');
    if (utf8Bytes(text) !== byteLength) throw new ContractError('casedo_store_corrupt', `Semantic object ${digest} byte count is inconsistent`);
    const record = validateSemanticObjectRecord(parseCanonicalJson(text, this.maxAuthoritativeBytesPerCase, `semantic object ${digest}`));
    if (record.digest !== digest || record.kind !== meta.kind) throw new ContractError('casedo_store_corrupt', `Semantic object ${digest} identity is inconsistent`);
    return record;
  }

  #loadState(placement) {
    const meta = this.#readMeta();
    const head = this.#validateMeta(meta, placement);
    const snapshot = this.#loadSnapshot(meta, head);
    const measuredAuthoritativeBytes = addStoredBytes(
      META_OVERHEAD_BYTES + meta.snapshot_bytes + meta.snapshot_chunk_count * ROW_OVERHEAD_BYTES,
      this.#existingUsage(),
      'CaseDO authoritative byte total',
    );
    if (measuredAuthoritativeBytes !== meta.authoritative_bytes) {
      throw new ContractError('casedo_store_corrupt', 'CaseDO authoritative byte accounting is inconsistent', {
        recordedBytes: meta.authoritative_bytes,
        measuredBytes: measuredAuthoritativeBytes,
      });
    }
    if (measuredAuthoritativeBytes > this.maxAuthoritativeBytesPerCase) {
      throw new ContractError('casedo_capacity_exceeded', 'CaseDO authoritative state exceeds the configured Case budget', {
        requiredBytes: measuredAuthoritativeBytes,
        maxAuthoritativeBytesPerCase: this.maxAuthoritativeBytesPerCase,
      });
    }
    return { meta, head, snapshot };
  }

  #existingUsage() {
    let total = 0;
    const objects = sqlRows(this.storage.sql, `SELECT
      objects.digest, objects.chunk_count, objects.byte_length,
      COUNT(chunks.chunk_index) AS measured_chunk_count,
      COALESCE(SUM(LENGTH(CAST(chunks.payload AS BLOB))), 0) AS measured_byte_length,
      COALESCE(MAX(LENGTH(CAST(chunks.payload AS BLOB))), 0) AS largest_chunk_bytes
      FROM casedo_objects AS objects
      LEFT JOIN casedo_object_chunks AS chunks ON chunks.digest = objects.digest
      GROUP BY objects.digest, objects.chunk_count, objects.byte_length
      ORDER BY objects.digest ASC`);
    for (const object of objects) {
      const chunkCount = storedNonNegativeInteger(object.chunk_count, 'CaseDO semantic object chunk count');
      const byteLength = storedNonNegativeInteger(object.byte_length, 'CaseDO semantic object byte length');
      const measuredChunkCount = storedNonNegativeInteger(object.measured_chunk_count, 'CaseDO measured semantic object chunk count');
      const measuredByteLength = storedNonNegativeInteger(object.measured_byte_length, 'CaseDO measured semantic object byte length');
      const largestChunkBytes = storedNonNegativeInteger(object.largest_chunk_bytes, 'CaseDO measured semantic object chunk size');
      if (chunkCount <= 0 || byteLength <= 0 || chunkCount !== measuredChunkCount || byteLength !== measuredByteLength || largestChunkBytes > this.chunkBytes) {
        throw new ContractError('casedo_store_corrupt', 'CaseDO semantic object byte accounting is inconsistent');
      }
      total = addStoredBytes(total, byteLength, 'CaseDO semantic object bytes');
      total = addStoredBytes(total, (chunkCount + 1) * ROW_OVERHEAD_BYTES, 'CaseDO semantic object row overhead');
    }

    const orphanChunks = sqlOneOrNull(this.storage.sql, `SELECT COUNT(*) AS count
      FROM casedo_object_chunks AS chunks
      LEFT JOIN casedo_objects AS objects ON objects.digest = chunks.digest
      WHERE objects.digest IS NULL`);
    if (storedNonNegativeInteger(orphanChunks?.count ?? 0, 'CaseDO orphan semantic object chunk count') !== 0) {
      throw new ContractError('casedo_store_corrupt', 'CaseDO contains orphan semantic object chunks');
    }

    const recoveries = sqlRows(this.storage.sql, `SELECT
      recovery_id, cause_digest, committed_revision, head_digest, byte_length
      FROM casedo_recoveries ORDER BY recovery_id ASC`);
    for (const recovery of recoveries) {
      try {
        assertIdentifier(recovery.recovery_id, 'stored recoveryId');
      } catch (cause) {
        throw new ContractError('casedo_store_corrupt', 'CaseDO recovery identifier is invalid', {}, { cause });
      }
      if (typeof recovery.cause_digest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(recovery.cause_digest) ||
          typeof recovery.head_digest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(recovery.head_digest)) {
        throw new ContractError('casedo_store_corrupt', 'CaseDO recovery digest is invalid');
      }
      storedNonNegativeInteger(recovery.committed_revision, 'CaseDO recovery committed revision');
      const byteLength = storedNonNegativeInteger(recovery.byte_length, 'CaseDO recovery byte length');
      const measuredByteLength = utf8Bytes(recovery.recovery_id) + utf8Bytes(recovery.cause_digest) + 256;
      if (byteLength !== measuredByteLength) {
        throw new ContractError('casedo_store_corrupt', 'CaseDO recovery byte accounting is inconsistent');
      }
      total = addStoredBytes(total, byteLength + ROW_OVERHEAD_BYTES, 'CaseDO recovery bytes');
    }
    return total;
  }

  #prepareObjects(records) {
    const prepared = [];
    for (const raw of records) {
      const record = validateSemanticObjectRecord(raw);
      const text = canonicalJson(record);
      const chunks = chunkText(text, this.chunkBytes);
      const current = sqlOneOrNull(this.storage.sql, 'SELECT digest FROM casedo_objects WHERE digest = ?', record.digest);
      if (current !== null) {
        const existing = this.#loadObject(record.digest);
        if (canonicalJson(existing) !== text) throw new ContractError('casedo_store_corrupt', `Semantic object ${record.digest} changed under one digest`);
        continue;
      }
      prepared.push({ record, chunks, byteLength: utf8Bytes(text) });
    }
    return prepared;
  }

  #prepareState(snapshotInput, semanticObjects, previousHead, recoveryExtraBytes = 0) {
    const snapshot = validateSemanticSnapshot(snapshotInput);
    const head = createHead(snapshot, previousHead);
    const snapshotText = canonicalJson(snapshot);
    const snapshotChunks = chunkText(snapshotText, this.chunkBytes);
    const snapshotBytes = utf8Bytes(snapshotText);
    const objects = this.#prepareObjects(semanticObjects);
    const objectBytes = objects.reduce((total, item) => total + item.byteLength + (item.chunks.length + 1) * ROW_OVERHEAD_BYTES, 0);
    const authoritativeBytes = META_OVERHEAD_BYTES + snapshotBytes + snapshotChunks.length * ROW_OVERHEAD_BYTES + this.#existingUsage() + objectBytes + recoveryExtraBytes;
    if (!Number.isSafeInteger(authoritativeBytes) || authoritativeBytes > this.maxAuthoritativeBytesPerCase) {
      throw new ContractError('casedo_capacity_exceeded', 'CaseDO authoritative state would exceed the qualified Case budget', {
        requiredBytes: authoritativeBytes,
        maxAuthoritativeBytesPerCase: this.maxAuthoritativeBytesPerCase,
      });
    }
    return { snapshot, head, snapshotChunks, snapshotBytes, objects, authoritativeBytes };
  }

  #writePrepared(prepared, placement, { create = false } = {}) {
    const sql = this.storage.sql;
    for (const item of prepared.objects) {
      sqlExec(sql, 'INSERT INTO casedo_objects(digest, kind, chunk_count, byte_length) VALUES (?, ?, ?, ?)', item.record.digest, item.record.kind, item.chunks.length, item.byteLength);
      item.chunks.forEach((chunk, index) => {
        sqlExec(sql, 'INSERT INTO casedo_object_chunks(digest, chunk_index, payload) VALUES (?, ?, ?)', item.record.digest, index, chunk);
      });
    }
    sqlExec(sql, 'DELETE FROM casedo_snapshot_chunks');
    prepared.snapshotChunks.forEach((chunk, index) => {
      sqlExec(sql, 'INSERT INTO casedo_snapshot_chunks(chunk_index, payload) VALUES (?, ?)', index, chunk);
    });
    const values = [
      placement.caseId, placement.placementGeneration, placement.placementDigest,
      CASEDO_STORAGE_PROFILE, CASEDO_STORAGE_SCHEMA_VERSION, SEMANTIC_PROFILE, SEMANTIC_SNAPSHOT_SCHEMA_VERSION,
      canonicalJson(prepared.head), CASEDO_WRITER_PROTOCOL, this.writerCompatibilityId,
      prepared.snapshotChunks.length, prepared.snapshotBytes, prepared.authoritativeBytes,
    ];
    if (create) {
      sqlExec(sql, `INSERT INTO casedo_meta(
        singleton, case_id, placement_generation, placement_digest, storage_profile, storage_schema_version,
        semantic_profile, semantic_snapshot_schema_version, head_json, writer_protocol, writer_compatibility_id,
        snapshot_chunk_count, snapshot_bytes, authoritative_bytes
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, ...values);
    } else {
      sqlExec(sql, `UPDATE casedo_meta SET
        case_id = ?, placement_generation = ?, placement_digest = ?, storage_profile = ?, storage_schema_version = ?,
        semantic_profile = ?, semantic_snapshot_schema_version = ?, head_json = ?, writer_protocol = ?, writer_compatibility_id = ?,
        snapshot_chunk_count = ?, snapshot_bytes = ?, authoritative_bytes = ? WHERE singleton = 1`, ...values);
    }
  }

  initializeElectedCase(input) {
    // The separately owned durable placement election must already have selected this exact
    // record. This adapter intentionally does not choose, synthesize, or persist that owner.
    assertRecordShape(input, ['placement', 'plan'], ['caseContract'], 'CaseDO elected initialization');
    const placement = validateCasePlacement(input.placement);
    const caseContract = input.caseContract ?? {};
    const committed = this.storage.transactionSync(() => {
      if (this.#readMeta() !== null) throw new ContractError('case_exists', `CaseDO already hosts Case ${placement.caseId}`);
      const engine = new CaseEngine({ caseId: placement.caseId, plan: input.plan, caseContract, semanticAuthority: { profile: SEMANTIC_PROFILE } });
      const prepared = this.#prepareState(engine.snapshot(), engine.semanticObjectRecords(), null);
      this.#writePrepared(prepared, placement, { create: true });
      this.#fault('before_commit', { operation: 'create', caseId: placement.caseId });
      engine.markSemanticObjectsPersisted();
      return { caseRevision: prepared.snapshot.caseRevision, head: prepared.head, snapshot: prepared.snapshot, authoritativeBytes: prepared.authoritativeBytes };
    });
    this.#fault('after_commit', { operation: 'create', caseId: placement.caseId, headDigest: committed.head.headDigest });
    return Object.freeze(canonicalClone(committed));
  }

  loadCase(input) {
    assertRecordShape(input, ['placement'], [], 'CaseDO load');
    const placement = validateCasePlacement(input.placement);
    const state = this.#loadState(placement);
    return Object.freeze(canonicalClone({ placement, head: state.head, snapshot: state.snapshot, authoritativeBytes: state.meta.authoritative_bytes }));
  }

  command(input) {
    assertRecordShape(input, ['placement', 'envelope'], [], 'CaseDO command');
    const placement = validateCasePlacement(input.placement);
    const inspected = inspectCaseCommandEnvelope(input.envelope);
    const committed = this.storage.transactionSync(() => {
      const state = this.#loadState(placement);
      const existing = state.snapshot.receipts[inspected.requestId];
      if (existing) {
        if (existing.commandDigest !== inspected.commandDigest) {
          throw new ContractError('request_conflict', `Request ${inspected.requestId} was already used for a different command`);
        }
        return { deduplicated: true, response: canonicalClone(existing.response), caseRevision: state.snapshot.caseRevision, head: state.head, authoritativeBytes: state.meta.authoritative_bytes };
      }
      if (inspected.expectedCaseRevision !== null && inspected.expectedCaseRevision !== state.snapshot.caseRevision) {
        throw new ContractError('revision_conflict', `Expected Case revision ${inspected.expectedCaseRevision}, found ${state.snapshot.caseRevision}`, {
          expectedCaseRevision: inspected.expectedCaseRevision,
          actualCaseRevision: state.snapshot.caseRevision,
        });
      }
      const engine = CaseEngine.restore(state.snapshot, { reopen: false, semanticResolver: (digest) => this.#loadObject(digest) });
      const result = engine.applyCommand(input.envelope);
      if (result.deduplicated === true) throw new ContractError('casedo_store_corrupt', 'Receipt appeared after authoritative preflight in one SQLite transaction');
      const prepared = this.#prepareState(engine.snapshot(), engine.semanticObjectRecords(), state.head);
      this.#writePrepared(prepared, placement);
      this.#fault('before_commit', { operation: 'command', caseId: placement.caseId, requestId: inspected.requestId });
      engine.markSemanticObjectsPersisted();
      return { deduplicated: false, response: canonicalClone(result.response), caseRevision: prepared.snapshot.caseRevision, head: prepared.head, authoritativeBytes: prepared.authoritativeBytes };
    });
    this.#fault('after_commit', { operation: 'command', caseId: placement.caseId, requestId: inspected.requestId, headDigest: committed.head.headDigest });
    return Object.freeze(canonicalClone(committed));
  }

  recoverExecutionOwnerLoss(input) {
    assertRecordShape(input, ['placement', 'recoveryId', 'cause'], [], 'CaseDO explicit recovery');
    const placement = validateCasePlacement(input.placement);
    assertIdentifier(input.recoveryId, 'recoveryId');
    const causeText = canonicalJson(input.cause);
    const causeBytes = utf8Bytes(causeText);
    if (causeBytes > CASEDO_MAX_RECOVERY_CAUSE_BYTES) {
      throw new ContractError('casedo_recovery_cause_too_large', 'CaseDO recovery cause exceeds its byte limit', {
        maxBytes: CASEDO_MAX_RECOVERY_CAUSE_BYTES,
      });
    }
    const cause = parseCanonicalJson(causeText, CASEDO_MAX_RECOVERY_CAUSE_BYTES, 'CaseDO recovery cause');
    const causeDigest = typedDigest(RECOVERY_CAUSE_DOMAIN, cause);
    const recoveryBytes = utf8Bytes(input.recoveryId) + utf8Bytes(causeDigest) + 256 + ROW_OVERHEAD_BYTES;
    const committed = this.storage.transactionSync(() => {
      const state = this.#loadState(placement);
      const existing = sqlOneOrNull(this.storage.sql, 'SELECT recovery_id, cause_digest, committed_revision, head_digest FROM casedo_recoveries WHERE recovery_id = ?', input.recoveryId);
      if (existing !== null) {
        if (existing.cause_digest !== causeDigest) throw new ContractError('recovery_conflict', `Recovery ${input.recoveryId} was already used for a different cause`);
        return { deduplicated: true, caseRevision: Number(existing.committed_revision), headDigest: existing.head_digest };
      }
      const engine = CaseEngine.restore(state.snapshot, { reopen: true, semanticResolver: (digest) => this.#loadObject(digest) });
      const successor = engine.snapshot();
      let head = state.head;
      let authoritativeBytes = state.meta.authoritative_bytes;
      if (successor.caseRevision !== state.snapshot.caseRevision) {
        const prepared = this.#prepareState(successor, engine.semanticObjectRecords(), state.head, recoveryBytes);
        head = prepared.head;
        authoritativeBytes = prepared.authoritativeBytes;
        this.#writePrepared(prepared, placement);
        engine.markSemanticObjectsPersisted();
      } else {
        const candidate = META_OVERHEAD_BYTES + state.meta.snapshot_bytes + state.meta.snapshot_chunk_count * ROW_OVERHEAD_BYTES + this.#existingUsage() + recoveryBytes;
        if (candidate > this.maxAuthoritativeBytesPerCase) {
          throw new ContractError('casedo_capacity_exceeded', 'Recovery receipt would exceed the qualified Case budget', {
            requiredBytes: candidate,
            maxAuthoritativeBytesPerCase: this.maxAuthoritativeBytesPerCase,
          });
        }
        authoritativeBytes = candidate;
        sqlExec(this.storage.sql, 'UPDATE casedo_meta SET authoritative_bytes = ? WHERE singleton = 1', candidate);
      }
      this.#fault('before_commit', { operation: 'recovery', caseId: placement.caseId, recoveryId: input.recoveryId });
      sqlExec(this.storage.sql, 'INSERT INTO casedo_recoveries(recovery_id, cause_digest, committed_revision, head_digest, byte_length) VALUES (?, ?, ?, ?, ?)', input.recoveryId, causeDigest, successor.caseRevision, head.headDigest, recoveryBytes - ROW_OVERHEAD_BYTES);
      return { deduplicated: false, caseRevision: successor.caseRevision, headDigest: head.headDigest, authoritativeBytes };
    });
    this.#fault('after_commit', { operation: 'recovery', caseId: placement.caseId, recoveryId: input.recoveryId, headDigest: committed.headDigest });
    return Object.freeze(canonicalClone(committed));
  }
}
