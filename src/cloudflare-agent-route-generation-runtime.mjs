import {
  ContractError,
  assertIdentifier,
  canonicalClone,
  canonicalJson,
  strictJsonParse,
} from './canonical.mjs';
import {
  AgentRouteGenerationAuthority,
  normalizeAgentRouteGenerationState,
} from './agent-route-generation.mjs';

export const AGENT_ROUTE_GENERATION_STORAGE_PROFILE = 'tdev.agent-route-generation.cloudflare-sqlite.v1';
export const AGENT_ROUTE_GENERATION_STORAGE_SCHEMA_VERSION = 1;
export const AGENT_ROUTE_GENERATION_DEFAULT_MAX_SNAPSHOT_BYTES = 128 * 1024;

const textEncoder = new TextEncoder();

function fail(code, message, details = undefined) {
  throw new ContractError(code, message, details);
}

function byteLength(value) {
  return textEncoder.encode(value).byteLength;
}

function assertStorage(storage) {
  if (!storage || typeof storage.transactionSync !== 'function' || !storage.sql || typeof storage.sql.exec !== 'function') {
    fail('invalid_agent_route_generation_storage', 'Route-generation storage requires synchronous SQLite transactions');
  }
  return storage;
}

function rows(sql, statement, ...bindings) {
  const cursor = sql.exec(statement, ...bindings);
  if (!cursor || typeof cursor.toArray !== 'function') fail('invalid_agent_route_generation_storage', 'Route-generation SQLite cursor is invalid');
  return cursor.toArray();
}

function parseState(row, maxSnapshotBytes) {
  if (typeof row.state_json !== 'string' || byteLength(row.state_json) !== Number(row.state_bytes) || Number(row.state_bytes) > maxSnapshotBytes) {
    fail('agent_route_generation_store_corrupt', 'Stored route-generation state byte accounting is invalid');
  }
  let state;
  try {
    state = strictJsonParse(row.state_json, { maxBytes: maxSnapshotBytes });
  } catch (cause) {
    fail('agent_route_generation_store_corrupt', 'Stored route-generation state is not bounded JSON', {}, { cause });
  }
  if (canonicalJson(state) !== row.state_json) fail('agent_route_generation_store_corrupt', 'Stored route-generation state is not canonical JSON');
  return normalizeAgentRouteGenerationState(state);
}

export class SqliteAgentRouteGenerationStore {
  constructor(storage, { maxSnapshotBytes = AGENT_ROUTE_GENERATION_DEFAULT_MAX_SNAPSHOT_BYTES } = {}) {
    this.storage = assertStorage(storage);
    if (!Number.isSafeInteger(maxSnapshotBytes) || maxSnapshotBytes < 1024) {
      fail('invalid_agent_route_generation_storage', 'Route-generation snapshot byte limit is invalid');
    }
    this.sql = this.storage.sql;
    this.maxSnapshotBytes = maxSnapshotBytes;
    this.storage.transactionSync(() => this.sql.exec(`CREATE TABLE IF NOT EXISTS agent_route_generation_state (
      agent_id TEXT PRIMARY KEY,
      revision INTEGER NOT NULL,
      state_json TEXT NOT NULL,
      state_bytes INTEGER NOT NULL,
      storage_profile TEXT NOT NULL,
      storage_schema_version INTEGER NOT NULL
    )`));
  }

  load(agentId) {
    assertIdentifier(agentId, 'agentId');
    const result = rows(this.sql, 'SELECT * FROM agent_route_generation_state WHERE agent_id = ?', agentId);
    if (result.length === 0) return null;
    if (result.length !== 1) fail('agent_route_generation_store_corrupt', 'Route-generation store returned duplicate rows');
    const row = result[0];
    const revision = Number(row.revision);
    if (row.storage_profile !== AGENT_ROUTE_GENERATION_STORAGE_PROFILE || Number(row.storage_schema_version) !== AGENT_ROUTE_GENERATION_STORAGE_SCHEMA_VERSION || !Number.isSafeInteger(revision) || revision < 0) {
      fail('agent_route_generation_store_corrupt', 'Route-generation storage metadata is incompatible');
    }
    const state = parseState(row, this.maxSnapshotBytes);
    if (state.routeBinding.agentId !== agentId) fail('agent_route_generation_store_corrupt', 'Route-generation state crossed Agent identity');
    return { revision, state: canonicalClone(state) };
  }

  compareAndSwap(agentId, expectedRevision, nextState) {
    assertIdentifier(agentId, 'agentId');
    if (expectedRevision !== null && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)) {
      fail('agent_route_generation_revision_conflict', 'Expected route-generation revision is invalid');
    }
    const state = normalizeAgentRouteGenerationState(nextState);
    if (state.routeBinding.agentId !== agentId) fail('agent_route_generation_store_corrupt', 'Route-generation state crossed Agent identity');
    const stateJson = canonicalJson(state);
    const stateBytes = byteLength(stateJson);
    if (stateBytes > this.maxSnapshotBytes) {
      fail('agent_route_generation_storage_pressure', 'Route-generation state exceeds durable byte limit');
    }
    this.storage.transactionSync(() => {
      const current = this.load(agentId);
      const actual = current?.revision ?? null;
      if (actual !== expectedRevision) fail('agent_route_generation_revision_conflict', 'Route-generation revision changed', { expectedRevision, actualRevision: actual });
      const revision = expectedRevision === null ? 0 : expectedRevision + 1;
      if (expectedRevision === null) {
        this.sql.exec(`INSERT INTO agent_route_generation_state(
          agent_id, revision, state_json, state_bytes, storage_profile, storage_schema_version
        ) VALUES (?, ?, ?, ?, ?, ?)`, agentId, revision, stateJson, stateBytes, AGENT_ROUTE_GENERATION_STORAGE_PROFILE, AGENT_ROUTE_GENERATION_STORAGE_SCHEMA_VERSION);
      } else {
        this.sql.exec(`UPDATE agent_route_generation_state SET
          revision = ?, state_json = ?, state_bytes = ?, storage_profile = ?, storage_schema_version = ?
          WHERE agent_id = ?`, revision, stateJson, stateBytes, AGENT_ROUTE_GENERATION_STORAGE_PROFILE, AGENT_ROUTE_GENERATION_STORAGE_SCHEMA_VERSION, agentId);
      }
    });
    return true;
  }
}

export class MemoryAgentRouteGenerationStore {
  constructor() { this.records = new Map(); }
  load(agentId) {
    const record = this.records.get(agentId);
    return record === undefined ? null : canonicalClone(record);
  }
  compareAndSwap(agentId, expectedRevision, nextState) {
    const current = this.records.get(agentId);
    const actual = current?.revision ?? null;
    if (actual !== expectedRevision) fail('agent_route_generation_revision_conflict', 'Route-generation revision changed', { expectedRevision, actualRevision: actual });
    const state = normalizeAgentRouteGenerationState(nextState);
    this.records.set(agentId, { revision: expectedRevision === null ? 0 : expectedRevision + 1, state: canonicalClone(state) });
    return true;
  }
}

export class DurableAgentRouteGenerationAuthority {
  constructor({ agentId, store }) {
    assertIdentifier(agentId, 'agentId');
    if (!store || typeof store.load !== 'function' || typeof store.compareAndSwap !== 'function') fail('invalid_agent_route_generation_store', 'Route-generation store must expose load() and compareAndSwap()');
    this.agentId = agentId;
    this.store = store;
  }

  read() {
    const record = this.store.load(this.agentId);
    if (record === null) return null;
    const state = normalizeAgentRouteGenerationState(record.state);
    if (state.routeBinding.agentId !== this.agentId) fail('agent_route_generation_store_corrupt', 'Route-generation state crossed Agent identity');
    return Object.freeze(canonicalClone(state));
  }

  initialize(state) {
    const normalized = normalizeAgentRouteGenerationState(state);
    if (normalized.routeBinding.agentId !== this.agentId) fail('agent_route_generation_mismatch', 'Route-generation initialization crossed Agent identity');
    const current = this.store.load(this.agentId);
    if (current !== null) {
      const existing = normalizeAgentRouteGenerationState(current.state);
      if (canonicalJson(existing) !== canonicalJson(normalized)) fail('agent_route_generation_already_initialized', 'Route-generation state is already initialized with a different identity');
      return Object.freeze({ deduplicated: true, state: canonicalClone(existing) });
    }
    this.store.compareAndSwap(this.agentId, null, normalized);
    return Object.freeze({ deduplicated: false, state: canonicalClone(normalized) });
  }

  assertExecutable() {
    const state = this.read();
    if (state === null) fail('agent_route_generation_missing', 'Elected routing requires durable route-generation state');
    return new AgentRouteGenerationAuthority({ state }).assertExecutable();
  }

  #mutate(method, input) {
    const current = this.store.load(this.agentId);
    if (current === null) fail('agent_route_generation_missing', 'Route-generation state is not initialized');
    const authority = new AgentRouteGenerationAuthority({ state: current.state });
    const result = authority[method](input);
    this.store.compareAndSwap(this.agentId, current.revision, authority.read());
    return result;
  }

  async #mutateAsync(method, input) {
    const current = this.store.load(this.agentId);
    if (current === null) fail('agent_route_generation_missing', 'Route-generation state is not initialized');
    const authority = new AgentRouteGenerationAuthority({ state: current.state });
    const result = await authority[method](input);
    this.store.compareAndSwap(this.agentId, current.revision, authority.read());
    return result;
  }

  prepareLegacyImport(input) { return this.#mutateAsync('prepareLegacyImport', input); }
  sealLegacyImport(input) { return this.#mutate('sealLegacyImport', input); }
  beginDraining(input) { return this.#mutateAsync('beginDraining', input); }
  retire(input) { return this.#mutate('retire', input); }
  activate(input) { return this.#mutate('activate', input); }
}
