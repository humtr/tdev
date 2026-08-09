import {
  ContractError,
  canonicalJson,
  strictJsonParse,
} from './canonical.mjs';
import {
  hydrateSemanticTree,
  validateSemanticObjectRecord,
} from './semantic-authority.mjs';
import {
  createSemanticHead,
  validateSemanticHead,
  validateSemanticSnapshot,
} from './semantic-snapshot.mjs';

const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;

function parseCanonical(text, label, maxBytes) {
  if (typeof text !== 'string') throw new ContractError('store_corrupt', `${label} is not text`);
  const value = strictJsonParse(text, { maxBytes });
  if (canonicalJson(value) !== text) throw new ContractError('store_noncanonical', `${label} is not canonical JSON`);
  return value;
}

function failStore(code, message, details = {}, cause = undefined) {
  return new ContractError(code, message, details, cause ? { cause } : undefined);
}

function assertExpectedHead(current, expectedHeadDigest, expectedCaseRevision) {
  if (current === null) {
    if (expectedHeadDigest !== null || expectedCaseRevision !== null) {
      throw failStore('store_cas_mismatch', 'Semantic head does not exist for the expected predecessor');
    }
    return;
  }
  if (expectedHeadDigest === null || expectedCaseRevision === null) {
    throw failStore('store_cas_mismatch', 'Semantic head already exists');
  }
  if (current.headDigest !== expectedHeadDigest || current.caseRevision !== expectedCaseRevision) {
    throw failStore('store_cas_mismatch', 'Semantic head predecessor does not match', {
      expectedHeadDigest,
      actualHeadDigest: current.headDigest,
      expectedCaseRevision,
      actualCaseRevision: current.caseRevision,
    });
  }
}

export async function openSemanticSqliteStore(path, options = {}) {
  let sqlite;
  try {
    sqlite = await import('node:sqlite');
  } catch (cause) {
    throw failStore('semantic_sqlite_unavailable', 'The semantic SQLite adapter requires node:sqlite', {}, cause);
  }
  const db = new sqlite.DatabaseSync(path);
  return new SemanticSqliteStore(db, options);
}

export class SemanticSqliteStore {
  #db;
  #faultInjector;
  #maxBytes;

  constructor(db, { faultInjector = null, maxBytes = DEFAULT_MAX_BYTES } = {}) {
    if (!db || typeof db.exec !== 'function' || typeof db.prepare !== 'function') {
      throw new ContractError('invalid_semantic_database', 'Semantic SQLite store requires a DatabaseSync-compatible handle');
    }
    if (faultInjector !== null && typeof faultInjector !== 'function') {
      throw new ContractError('invalid_fault_injector', 'faultInjector must be a function or null');
    }
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new ContractError('invalid_store_limit', 'maxBytes must be a positive safe integer');
    this.#db = db;
    this.#faultInjector = faultInjector;
    this.#maxBytes = maxBytes;
    this.#initialize();
  }

  #initialize() {
    this.#db.exec('PRAGMA foreign_keys = ON');
    this.#db.exec('PRAGMA synchronous = FULL');
    this.#db.exec('PRAGMA busy_timeout = 5000');
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS semantic_objects (
        digest TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS semantic_snapshots (
        digest TEXT PRIMARY KEY,
        case_id TEXT NOT NULL,
        case_revision INTEGER NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS semantic_heads (
        case_id TEXT PRIMARY KEY,
        generation INTEGER NOT NULL,
        case_revision INTEGER NOT NULL,
        head_digest TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS semantic_pins (
        pin_id TEXT PRIMARY KEY,
        target_kind TEXT NOT NULL,
        digest TEXT NOT NULL
      );
    `);
  }

  close() {
    this.#db.close();
  }

  #inject(stage, details = {}) {
    if (this.#faultInjector) this.#faultInjector(stage, details);
  }

  #parseHeadRow(row) {
    if (!row) return null;
    const head = validateSemanticHead(parseCanonical(row.payload, 'semantic head', this.#maxBytes));
    if (head.headDigest !== row.head_digest || head.caseRevision !== row.case_revision || head.generation !== row.generation) {
      throw failStore('store_corrupt', 'Semantic head columns disagree with canonical payload');
    }
    return head;
  }

  loadHead(caseId) {
    const row = this.#db.prepare('SELECT generation, case_revision, head_digest, payload FROM semantic_heads WHERE case_id = ?').get(caseId);
    const head = this.#parseHeadRow(row);
    if (head !== null && head.caseId !== caseId) throw failStore('store_corrupt', 'Semantic head caseId is inconsistent');
    return head;
  }

  getObject(digest) {
    const row = this.#db.prepare('SELECT kind, payload FROM semantic_objects WHERE digest = ?').get(digest);
    if (!row) return null;
    const record = validateSemanticObjectRecord(parseCanonical(row.payload, `semantic object ${digest}`, this.#maxBytes));
    if (record.digest !== digest || record.kind !== row.kind) {
      throw failStore('store_corrupt', `Semantic object ${digest} columns disagree with payload`);
    }
    return record;
  }

  getSnapshot(digest) {
    const row = this.#db.prepare('SELECT case_id, case_revision, payload FROM semantic_snapshots WHERE digest = ?').get(digest);
    if (!row) return null;
    const snapshot = validateSemanticSnapshot(parseCanonical(row.payload, `semantic snapshot ${digest}`, this.#maxBytes));
    if (snapshot.snapshotDigest !== digest || snapshot.caseId !== row.case_id || snapshot.caseRevision !== row.case_revision) {
      throw failStore('store_corrupt', `Semantic snapshot ${digest} columns disagree with payload`);
    }
    return snapshot;
  }

  load(caseId, { hydrate = true } = {}) {
    const head = this.loadHead(caseId);
    if (head === null) return null;
    const snapshot = this.getSnapshot(head.snapshotDigest);
    if (snapshot === null) throw failStore('store_corrupt', `Semantic head references missing snapshot ${head.snapshotDigest}`);
    if (snapshot.caseId !== caseId || snapshot.caseRevision !== head.caseRevision) {
      throw failStore('store_corrupt', 'Semantic head and snapshot identity disagree');
    }
    const { semanticAuthority } = snapshot;
    if (
      semanticAuthority.baseRoot.rootDigest !== head.baseRootDigest ||
      semanticAuthority.canonicalRoot.rootDigest !== head.canonicalRootDigest ||
      semanticAuthority.authorityEpoch !== head.authorityEpoch
    ) {
      throw failStore('store_corrupt', 'Semantic head and snapshot root authority disagree');
    }
    if (!hydrate) return { head, snapshot };
    const resolver = (digest) => this.getObject(digest);
    const baseTree = hydrateSemanticTree(semanticAuthority.baseRoot, resolver);
    const canonicalTree = semanticAuthority.canonicalRoot.rootDigest === semanticAuthority.baseRoot.rootDigest
      ? baseTree
      : hydrateSemanticTree(semanticAuthority.canonicalRoot, resolver);
    return { head, snapshot, baseTree, canonicalTree };
  }

  #insertObject(record) {
    const validated = validateSemanticObjectRecord(record);
    const payload = canonicalJson(validated);
    const current = this.#db.prepare('SELECT kind, payload FROM semantic_objects WHERE digest = ?').get(validated.digest);
    if (current) {
      if (current.kind !== validated.kind || current.payload !== payload) {
        throw failStore('store_corrupt', `Semantic object digest ${validated.digest} maps to conflicting payloads`);
      }
      return;
    }
    this.#db.prepare('INSERT INTO semantic_objects(digest, kind, payload) VALUES (?, ?, ?)').run(validated.digest, validated.kind, payload);
  }

  #insertSnapshot(snapshot) {
    const validated = validateSemanticSnapshot(snapshot);
    const payload = canonicalJson(validated);
    const current = this.#db.prepare('SELECT case_id, case_revision, payload FROM semantic_snapshots WHERE digest = ?').get(validated.snapshotDigest);
    if (current) {
      if (current.case_id !== validated.caseId || current.case_revision !== validated.caseRevision || current.payload !== payload) {
        throw failStore('store_corrupt', `Semantic snapshot digest ${validated.snapshotDigest} maps to conflicting payloads`);
      }
      return validated;
    }
    this.#db.prepare('INSERT INTO semantic_snapshots(digest, case_id, case_revision, payload) VALUES (?, ?, ?, ?)')
      .run(validated.snapshotDigest, validated.caseId, validated.caseRevision, payload);
    return validated;
  }

  commit({
    snapshot,
    semanticObjects = [],
    expectedHeadDigest = null,
    expectedCaseRevision = null,
  }) {
    const validatedSnapshot = validateSemanticSnapshot(snapshot);
    const { semanticAuthority } = validatedSnapshot;
    let committed = false;
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const current = this.loadHead(validatedSnapshot.caseId);
      assertExpectedHead(current, expectedHeadDigest, expectedCaseRevision);
      this.#inject('before_objects', { caseId: validatedSnapshot.caseId, current });
      for (const record of semanticObjects) this.#insertObject(record);
      this.#inject('before_snapshot', { caseId: validatedSnapshot.caseId, current });
      this.#insertSnapshot(validatedSnapshot);
      const head = createSemanticHead({
        caseId: validatedSnapshot.caseId,
        authorityEpoch: semanticAuthority.authorityEpoch,
        generation: (current?.generation ?? 0) + 1,
        caseRevision: validatedSnapshot.caseRevision,
        snapshotDigest: validatedSnapshot.snapshotDigest,
        baseRootDigest: semanticAuthority.baseRoot.rootDigest,
        canonicalRootDigest: semanticAuthority.canonicalRoot.rootDigest,
        previousHeadDigest: current?.headDigest ?? null,
      });
      this.#inject('before_head', { caseId: validatedSnapshot.caseId, current, head });
      const headPayload = canonicalJson(head);
      this.#db.prepare(`
        INSERT INTO semantic_heads(case_id, generation, case_revision, head_digest, payload)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(case_id) DO UPDATE SET
          generation = excluded.generation,
          case_revision = excluded.case_revision,
          head_digest = excluded.head_digest,
          payload = excluded.payload
      `).run(head.caseId, head.generation, head.caseRevision, head.headDigest, headPayload);
      this.#inject('before_commit', { caseId: validatedSnapshot.caseId, current, head });
      this.#db.exec('COMMIT');
      committed = true;
      try {
        this.#inject('after_commit', { caseId: validatedSnapshot.caseId, current, head });
      } catch (cause) {
        throw failStore('store_commit_ambiguous', 'Semantic transaction committed but caller outcome is ambiguous', {
          caseId: head.caseId,
          predecessorHeadDigest: current?.headDigest ?? null,
          successorHeadDigest: head.headDigest,
        }, cause);
      }
      return head;
    } catch (error) {
      if (!committed) {
        try { this.#db.exec('ROLLBACK'); } catch {}
      }
      throw error;
    }
  }

  reconcileCommit({ caseId, predecessorHeadDigest = null, successorHeadDigest }) {
    const current = this.loadHead(caseId);
    if (current?.headDigest === successorHeadDigest) return 'committed';
    if ((current?.headDigest ?? null) === predecessorHeadDigest) return 'not_committed';
    return 'conflict';
  }

  scrub(caseId) {
    const loaded = this.load(caseId, { hydrate: true });
    if (loaded === null) return null;
    return loaded.head;
  }

  repairObject(record) {
    const validated = validateSemanticObjectRecord(record);
    const payload = canonicalJson(validated);
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      this.#db.prepare(`
        INSERT INTO semantic_objects(digest, kind, payload) VALUES (?, ?, ?)
        ON CONFLICT(digest) DO UPDATE SET kind = excluded.kind, payload = excluded.payload
      `).run(validated.digest, validated.kind, payload);
      this.#db.exec('COMMIT');
    } catch (error) {
      try { this.#db.exec('ROLLBACK'); } catch {}
      throw error;
    }
    return validated.digest;
  }

  pin(pinId, targetKind, digest) {
    if (typeof pinId !== 'string' || pinId.length === 0) throw new ContractError('invalid_semantic_pin', 'pinId is required');
    if (!['snapshot', 'object'].includes(targetKind)) throw new ContractError('invalid_semantic_pin', 'targetKind must be snapshot or object');
    if (typeof digest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(digest)) throw new ContractError('invalid_semantic_pin', 'pin digest is invalid');
    this.#db.prepare('INSERT OR REPLACE INTO semantic_pins(pin_id, target_kind, digest) VALUES (?, ?, ?)').run(pinId, targetKind, digest);
  }

  unpin(pinId) {
    this.#db.prepare('DELETE FROM semantic_pins WHERE pin_id = ?').run(pinId);
  }
}
