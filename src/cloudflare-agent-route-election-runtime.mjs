import { ContractError, assertIdentifier, canonicalClone, canonicalJson, publicJsonClone, strictJsonParse } from './canonical.mjs';
import { DurableAgentRouteElectionAuthority } from './agent-route-election.mjs';

export const AGENT_ROUTE_ELECTION_STORAGE_PROFILE = 'tdev.agent-route-election.cloudflare-sqlite.v1';
export const AGENT_ROUTE_ELECTION_STORAGE_SCHEMA_VERSION = 1;
const DEFAULT_MAX_BYTES = 256 * 1024;

function fail(code, message) { throw new ContractError(code, message); }
function rows(sql, statement, ...bindings) {
  const cursor = sql.exec(statement, ...bindings);
  if (!cursor || typeof cursor.toArray !== 'function') fail('invalid_agent_route_election_storage', 'Election SQLite cursor is invalid');
  return cursor.toArray();
}

export class SqliteAgentRouteElectionStore {
  constructor(storage, { maxSnapshotBytes = DEFAULT_MAX_BYTES } = {}) {
    if (!storage || typeof storage.transactionSync !== 'function' || !storage.sql || typeof storage.sql.exec !== 'function') fail('invalid_agent_route_election_storage', 'Election storage requires synchronous SQLite transactions');
    if (!Number.isSafeInteger(maxSnapshotBytes) || maxSnapshotBytes < 1024) fail('invalid_agent_route_election_storage', 'Election snapshot byte limit is invalid');
    this.storage = storage; this.sql = storage.sql; this.maxSnapshotBytes = maxSnapshotBytes;
    this.storage.transactionSync(() => this.sql.exec('CREATE TABLE IF NOT EXISTS agent_route_election_state (agent_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, snapshot_json TEXT NOT NULL, snapshot_bytes INTEGER NOT NULL, storage_profile TEXT NOT NULL, storage_schema_version INTEGER NOT NULL)'));
  }
  load(agentId) {
    assertIdentifier(agentId, 'agentId');
    const result = rows(this.sql, 'SELECT * FROM agent_route_election_state WHERE agent_id = ?', agentId);
    if (result.length === 0) return null;
    if (result.length !== 1) fail('agent_route_election_store_corrupt', 'Election store returned duplicate rows');
    const row = result[0];
    if (row.storage_profile !== AGENT_ROUTE_ELECTION_STORAGE_PROFILE || row.storage_schema_version !== AGENT_ROUTE_ELECTION_STORAGE_SCHEMA_VERSION || !Number.isSafeInteger(row.revision) || row.revision < 0) fail('agent_route_election_store_corrupt', 'Election storage metadata is incompatible');
    const bytes = new TextEncoder().encode(row.snapshot_json).byteLength;
    if (bytes !== row.snapshot_bytes || bytes > this.maxSnapshotBytes) fail('agent_route_election_store_corrupt', 'Election snapshot byte accounting is invalid');
    return { revision: row.revision, state: strictJsonParse(row.snapshot_json, { maxBytes: this.maxSnapshotBytes }) };
  }
  compareAndSwap(agentId, expectedRevision, state) {
    const snapshotJson = canonicalJson(state); const snapshotBytes = new TextEncoder().encode(snapshotJson).byteLength;
    if (snapshotBytes > this.maxSnapshotBytes) fail('agent_route_election_storage_pressure', 'Election snapshot exceeds durable byte limit');
    this.storage.transactionSync(() => {
      const current = this.load(agentId); const actual = current?.revision ?? null;
      if (actual !== expectedRevision) fail('agent_route_election_revision_conflict', 'Election revision changed');
      const revision = expectedRevision === null ? 0 : expectedRevision + 1;
      if (expectedRevision === null) this.sql.exec('INSERT INTO agent_route_election_state(agent_id, revision, snapshot_json, snapshot_bytes, storage_profile, storage_schema_version) VALUES (?, ?, ?, ?, ?, ?)', agentId, revision, snapshotJson, snapshotBytes, AGENT_ROUTE_ELECTION_STORAGE_PROFILE, AGENT_ROUTE_ELECTION_STORAGE_SCHEMA_VERSION);
      else this.sql.exec('UPDATE agent_route_election_state SET revision = ?, snapshot_json = ?, snapshot_bytes = ?, storage_profile = ?, storage_schema_version = ? WHERE agent_id = ?', revision, snapshotJson, snapshotBytes, AGENT_ROUTE_ELECTION_STORAGE_PROFILE, AGENT_ROUTE_ELECTION_STORAGE_SCHEMA_VERSION, agentId);
    });
  }
}

export class AgentRouteElectionRuntimeDOHost {
  constructor(ctx, env = {}) {
    this.ctx = ctx;
    this.store = new SqliteAgentRouteElectionStore(ctx?.storage, { maxSnapshotBytes: Number(env.TDEV_AGENT_ROUTE_ELECTION_MAX_SNAPSHOT_BYTES ?? DEFAULT_MAX_BYTES) });
  }
  #authority(agentId) { return new DurableAgentRouteElectionAuthority({ agentId, store: this.store }); }
  readAgentRouteElection(agentId) { return publicJsonClone(this.#authority(agentId).read()); }
  async createAgentRouteGenesis(agentId, input) { return publicJsonClone(await this.#authority(agentId).createGenesis(canonicalClone(input))); }
  async importLegacyAgentRoute(agentId, input) { return publicJsonClone(await this.#authority(agentId).importLegacy(canonicalClone(input))); }
  async prepareAgentRouteCutover(agentId, input) { return publicJsonClone(await this.#authority(agentId).prepareCutover(canonicalClone(input))); }
  async recordAgentRoutePredecessorExclusion(agentId, input) { return publicJsonClone(await this.#authority(agentId).recordPredecessorExclusion(canonicalClone(input))); }
  async recordAgentRouteSuccessorStandby(agentId, input) { return publicJsonClone(await this.#authority(agentId).recordSuccessorStandby(canonicalClone(input))); }
  async commitAgentRouteCutover(agentId, input) { return publicJsonClone(await this.#authority(agentId).commitCutover(canonicalClone(input))); }
  async commitAgentRouteCutoverResponseLoss(agentId, input) {
    const result = await this.#authority(agentId).commitCutover(canonicalClone(input));
    if (!this.ctx || typeof this.ctx.abort !== 'function') fail('invalid_agent_route_election_storage', 'Election response-loss qualification requires Durable Object abort support');
    this.ctx.abort('tdev_d0044_qualification_abort_after_commit');
    throw new ContractError('qualification_abort_returned', 'Election response-loss abort unexpectedly returned');
  }
  async d0044CommitAgentRouteCutoverReplayDiagnostic(agentId, input) {
    try {
      const result = await this.#authority(agentId).commitCutover(canonicalClone(input));
      if (result?.classification !== 'exact_replay') return { ok: false, error: { code: 'd0044_replay_not_exact', classification: result?.classification ?? null } };
      return { ok: true, result: publicJsonClone(result) };
    } catch (error) {
      return { ok: false, error: { name: typeof error?.name === 'string' ? error.name : 'Error', code: typeof error?.code === 'string' ? error.code : null, message: typeof error?.message === 'string' ? error.message.slice(0, 256) : null } };
    }
  }
}
