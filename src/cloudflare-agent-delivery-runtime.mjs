import {
  ContractError,
  assertDigest,
  assertIdentifier,
  assertRecordShape,
  assertSafeInteger,
  canonicalClone,
  canonicalJson,
  digest,
  strictJsonParse,
} from './canonical.mjs';
import {
  AgentDeliveryAuthority,
  computeAgentCapacityRequestDigest,
  computeAgentConnectRequestDigest,
  normalizeAgentRouteBinding,
} from './agent-delivery-authority.mjs';
import { normalizeInstallableAgentDataPlaneTuple } from './installable-agent-admission.mjs';
import { decodeBase64Url, encodeBase64Url } from './installable-agent-security.mjs';
import { INSTALLABLE_AGENT_CONNECT_CHALLENGE_MAX_BYTES } from './installable-agent-challenge.mjs';

export const AGENT_DELIVERY_STORAGE_PROFILE = 'tdev.agent-delivery.cloudflare-sqlite.v1';
export const AGENT_DELIVERY_STORAGE_SCHEMA_VERSION = 1;
export const AGENT_DELIVERY_DO_CLASS_NAME = 'AgentDeliveryRuntimeDO';
export const AGENT_DELIVERY_WEBSOCKET_PATH = '/agent-delivery/v1/connect';
export const AGENT_DELIVERY_WEBSOCKET_PROTOCOL = 'tdev-agent-v1';
export const AGENT_DELIVERY_AUTH_PROTOCOL_PREFIX = 'tdev-auth.';
export const AGENT_DELIVERY_POSSESSION_PROTOCOL_PREFIX = 'tdev-possession.';
export const AGENT_DELIVERY_SOCKET_TAG = 'tdev-d0020-agent-delivery';
export const CLOUDFLARE_WEBSOCKET_RECEIVE_MAX_BYTES = 32 * 1024 * 1024;
export const AGENT_DELIVERY_MAX_ATTACHMENT_BYTES = 1024;

const MAX_BINDING_BYTES = 2048;
const MAX_POSSESSION_ENVELOPE_BYTES = INSTALLABLE_AGENT_CONNECT_CHALLENGE_MAX_BYTES;
const MIN_AUTH_KEY_BYTES = 32;
const MAX_AUTH_KEY_BYTES = 512;
const PROVIDER_JURISDICTIONS = new Set(['global', 'eu', 'us', 'fedramp']);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

function fail(code, message, details = undefined, options = undefined) {
  throw new ContractError(code, message, details, options);
}

function byteLength(value) {
  return textEncoder.encode(value).byteLength;
}

function requiredTextBinding(env, name, maxBytes = MAX_BINDING_BYTES) {
  const value = env?.[name];
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    fail('invalid_agent_delivery_deployment_config', `${name} must be non-empty text without NUL`);
  }
  if (byteLength(value) > maxBytes) {
    fail('invalid_agent_delivery_deployment_config', `${name} exceeds its byte limit`, { maxBytes });
  }
  return value;
}

function positiveIntegerBinding(env, name) {
  const value = requiredTextBinding(env, name, 64);
  if (!/^[1-9][0-9]*$/.test(value)) {
    fail('invalid_agent_delivery_deployment_config', `${name} must be a positive base-10 integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    fail('invalid_agent_delivery_deployment_config', `${name} exceeds the supported integer range`);
  }
  return parsed;
}

function jurisdictionBinding(env) {
  const value = requiredTextBinding(env, 'TDEV_AGENT_DELIVERY_JURISDICTION');
  if (!PROVIDER_JURISDICTIONS.has(value)) {
    fail('invalid_agent_delivery_deployment_config', 'TDEV_AGENT_DELIVERY_JURISDICTION is unsupported');
  }
  return value;
}

function optionalAuthKey(env) {
  const raw = env?.TDEV_AGENT_DELIVERY_AUTH_KEY;
  if (raw === undefined || raw === null || raw === '') return null;
  const value = requiredTextBinding(env, 'TDEV_AGENT_DELIVERY_AUTH_KEY', MAX_AUTH_KEY_BYTES);
  const bytes = byteLength(value);
  if (bytes < MIN_AUTH_KEY_BYTES) {
    fail('invalid_agent_delivery_deployment_config', 'TDEV_AGENT_DELIVERY_AUTH_KEY is too short');
  }
  return value;
}

function websocketProtocols(request) {
  const header = request.headers.get('sec-websocket-protocol') ?? '';
  return header.length === 0 ? [] : header.split(',').map((value) => value.trim()).filter(Boolean);
}

function hasLegacyAgentAuth(request) {
  const authorization = request.headers.get('authorization') ?? '';
  if (authorization.startsWith('Bearer ')) return true;
  return websocketProtocols(request).some((value) => value.startsWith(AGENT_DELIVERY_AUTH_PROTOCOL_PREFIX));
}

function possessionEnvelopeFromRequest(request) {
  const matches = websocketProtocols(request).filter((value) => value.startsWith(AGENT_DELIVERY_POSSESSION_PROTOCOL_PREFIX));
  if (matches.length !== 1) fail('agent_possession_required', 'Exactly one D0039 possession envelope protocol is required');
  const encoded = matches[0].slice(AGENT_DELIVERY_POSSESSION_PROTOCOL_PREFIX.length);
  const bytes = decodeBase64Url(encoded, 'possession envelope protocol');
  if (bytes.byteLength > MAX_POSSESSION_ENVELOPE_BYTES) fail('agent_possession_envelope_too_large', 'Possession envelope exceeds its wire bound');
  let text;
  try { text = textDecoder.decode(bytes); }
  catch (cause) { fail('invalid_agent_possession_envelope', 'Possession envelope is not valid UTF-8', {}, { cause }); }
  try { return strictJsonParse(text, { maxBytes: MAX_POSSESSION_ENVELOPE_BYTES }); }
  catch (cause) { fail('invalid_agent_possession_envelope', 'Possession envelope is not strict bounded JSON', {}, { cause }); }
}

async function readBoundedChallengeRequest(request) {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') fail('invalid_agent_connect_challenge_request', 'D0039 challenge endpoint requires application/json');
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^[0-9]+$/.test(declared) || Number(declared) > INSTALLABLE_AGENT_CONNECT_CHALLENGE_MAX_BYTES)) {
    fail('agent_connect_request_too_large', 'D0039 connect challenge request exceeds 8192 bytes');
  }
  if (request.body === null || typeof request.body.getReader !== 'function') {
    fail('invalid_agent_connect_challenge_request', 'D0039 challenge endpoint requires a request body');
  }
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const bytes = new Uint8Array(value);
      total += bytes.byteLength;
      if (total > INSTALLABLE_AGENT_CONNECT_CHALLENGE_MAX_BYTES) {
        await reader.cancel();
        fail('agent_connect_request_too_large', 'D0039 connect challenge request exceeds 8192 bytes');
      }
      chunks.push(bytes);
    }
  } finally {
    reader.releaseLock?.();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try { return strictJsonParse(body, { maxBytes: INSTALLABLE_AGENT_CONNECT_CHALLENGE_MAX_BYTES }); }
  catch (cause) { fail('invalid_agent_connect_challenge_request', 'D0039 challenge request is not strict bounded JSON', {}, { cause }); }
}

function agentDeliveryJsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

function agentDeliveryErrorResponse(error) {
  if (!(error instanceof ContractError)) {
    return agentDeliveryJsonResponse(500, { error: { code: 'agent_delivery_provider_failure' } });
  }
  let status = 400;
  if (error.code === 'agent_authentication_failed') status = 401;
  else if (error.code.includes('stale') || error.code.includes('conflict')) status = 409;
  else if (error.code === 'invalid_agent_delivery_deployment_config') status = 503;
  return agentDeliveryJsonResponse(status, { error: { code: error.code } });
}

export function readAgentDeliveryRuntimeConfig(env) {
  const maxSnapshotBytes = positiveIntegerBinding(env, 'TDEV_AGENT_DELIVERY_MAX_SNAPSHOT_BYTES');
  const maxFrameBytes = positiveIntegerBinding(env, 'TDEV_AGENT_DELIVERY_MAX_FRAME_BYTES');
  if (maxFrameBytes >= CLOUDFLARE_WEBSOCKET_RECEIVE_MAX_BYTES) {
    fail('invalid_agent_delivery_deployment_config', 'Configured Agent frame limit must remain below the Cloudflare receive ceiling', {
      maxFrameBytes,
      cloudflareReceiveCeilingBytes: CLOUDFLARE_WEBSOCKET_RECEIVE_MAX_BYTES,
    });
  }
  return Object.freeze({
    maxSnapshotBytes,
    maxFrameBytes,
    placement: Object.freeze({
      deployment: requiredTextBinding(env, 'TDEV_DEPLOYMENT'),
      environment: requiredTextBinding(env, 'TDEV_ENVIRONMENT'),
      workerScript: requiredTextBinding(env, 'TDEV_WORKER_SCRIPT'),
      className: AGENT_DELIVERY_DO_CLASS_NAME,
      namespace: requiredTextBinding(env, 'TDEV_AGENT_DELIVERY_NAMESPACE'),
      jurisdiction: jurisdictionBinding(env),
    }),
  });
}

function resolveAgentDeliveryNamespace(env, jurisdiction) {
  const namespace = env?.TDEV_AGENT_DELIVERY;
  if (!namespace || typeof namespace.idFromName !== 'function' || typeof namespace.get !== 'function') {
    fail('invalid_agent_delivery_deployment_config', 'Agent delivery Worker requires a Durable Object namespace binding');
  }
  if (jurisdiction === 'global') return namespace;
  if (typeof namespace.jurisdiction !== 'function') {
    fail('invalid_agent_delivery_deployment_config', 'Agent delivery namespace does not support the configured jurisdiction');
  }
  const scoped = namespace.jurisdiction(jurisdiction);
  if (!scoped || typeof scoped.idFromName !== 'function' || typeof scoped.get !== 'function') {
    fail('invalid_agent_delivery_deployment_config', 'Agent delivery jurisdiction namespace is invalid');
  }
  return scoped;
}

export class AgentDeliveryRuntimeService {
  constructor(env) {
    this.config = readAgentDeliveryRuntimeConfig(env);
    this.namespace = resolveAgentDeliveryNamespace(env, this.config.placement.jurisdiction);
  }

  #route(agentId) {
    assertIdentifier(agentId, 'agentId');
    const id = this.namespace.idFromName(agentId);
    if (!id || typeof id.toString !== 'function') fail('invalid_agent_delivery_provider', 'Agent delivery namespace returned an invalid identity');
    const providerJurisdiction = id.jurisdiction ?? 'global';
    if (providerJurisdiction !== this.config.placement.jurisdiction) {
      fail('agent_route_binding_conflict', 'Agent delivery identity has the wrong jurisdiction');
    }
    const stub = this.namespace.get(id);
    if (!stub || typeof stub.fetch !== 'function') fail('invalid_agent_delivery_provider', 'Agent delivery namespace returned an invalid stub');
    return stub;
  }

  async fetch(request) {
    try {
      const url = new URL(request.url);
      if (url.pathname !== AGENT_DELIVERY_WEBSOCKET_PATH || !['GET', 'POST'].includes(request.method)) {
        return agentDeliveryJsonResponse(404, { error: { code: 'agent_delivery_not_found' } });
      }
      const agentId = requiredQueryText(url.searchParams, 'agentId');
      return await this.#route(agentId).fetch(request);
    } catch (error) {
      return agentDeliveryErrorResponse(error);
    }
  }
}

function assertStorage(storage) {
  if (!storage || typeof storage.transactionSync !== 'function' || !storage.sql || typeof storage.sql.exec !== 'function') {
    fail('invalid_agent_delivery_storage', 'Cloudflare Agent delivery storage requires transactionSync and SQLite exec');
  }
  return storage;
}

function sqlRows(sql, statement, ...bindings) {
  const cursor = sql.exec(statement, ...bindings);
  if (!cursor || typeof cursor.toArray !== 'function') {
    fail('invalid_agent_delivery_storage', 'SQLite exec must return a cursor exposing toArray()');
  }
  return cursor.toArray();
}

function sqlOneOrNull(sql, statement, ...bindings) {
  const rows = sqlRows(sql, statement, ...bindings);
  if (rows.length === 0) return null;
  if (rows.length !== 1) fail('agent_delivery_store_corrupt', 'Expected at most one Agent delivery SQLite row');
  return rows[0];
}

function sqlExec(sql, statement, ...bindings) {
  sql.exec(statement, ...bindings);
}

function parseSnapshotText(text, maxBytes) {
  if (typeof text !== 'string' || byteLength(text) > maxBytes) {
    fail('agent_delivery_store_corrupt', 'Stored Agent delivery snapshot exceeds the qualified byte limit');
  }
  let snapshot;
  try {
    snapshot = strictJsonParse(text, { maxBytes });
  } catch (cause) {
    fail('agent_delivery_store_corrupt', 'Stored Agent delivery snapshot is not bounded JSON', {}, { cause });
  }
  if (canonicalJson(snapshot) !== text) {
    fail('agent_delivery_store_corrupt', 'Stored Agent delivery snapshot is not canonical JSON');
  }
  return snapshot;
}

export class SqliteAgentDeliveryStore {
  constructor(storage, { maxSnapshotBytes }) {
    this.storage = assertStorage(storage);
    assertSafeInteger(maxSnapshotBytes, 'maxSnapshotBytes', { min: 1 });
    this.maxSnapshotBytes = maxSnapshotBytes;
  }

  initialize() {
    sqlExec(this.storage.sql, `CREATE TABLE IF NOT EXISTS agent_delivery_state (
      agent_id TEXT PRIMARY KEY,
      revision INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      snapshot_bytes INTEGER NOT NULL,
      storage_profile TEXT NOT NULL,
      storage_schema_version INTEGER NOT NULL
    )`);
  }

  #row(agentId) {
    assertIdentifier(agentId, 'agentId');
    return sqlOneOrNull(this.storage.sql, 'SELECT * FROM agent_delivery_state WHERE agent_id = ?', agentId);
  }

  load(agentId) {
    const row = this.#row(agentId);
    if (row === null) return null;
    const revision = Number(row.revision);
    const snapshotBytes = Number(row.snapshot_bytes);
    if (!Number.isSafeInteger(revision) || revision < 0 || !Number.isSafeInteger(snapshotBytes) || snapshotBytes <= 0) {
      fail('agent_delivery_store_corrupt', 'Stored Agent delivery metadata is invalid');
    }
    if (row.storage_profile !== AGENT_DELIVERY_STORAGE_PROFILE || Number(row.storage_schema_version) !== AGENT_DELIVERY_STORAGE_SCHEMA_VERSION) {
      fail('incompatible_agent_delivery_schema', 'Stored Agent delivery schema/profile is incompatible');
    }
    if (typeof row.snapshot_json !== 'string' || byteLength(row.snapshot_json) !== snapshotBytes || snapshotBytes > this.maxSnapshotBytes) {
      fail('agent_delivery_store_corrupt', 'Stored Agent delivery snapshot byte accounting is invalid');
    }
    const snapshot = parseSnapshotText(row.snapshot_json, this.maxSnapshotBytes);
    if (snapshot?.revision !== revision || snapshot?.routeBinding?.agentId !== agentId) {
      fail('agent_delivery_store_corrupt', 'Stored Agent delivery revision/identity is inconsistent');
    }
    return canonicalClone(snapshot);
  }

  compareAndSwap(agentId, expectedRevision, nextSnapshot) {
    assertIdentifier(agentId, 'agentId');
    if (expectedRevision !== null) assertSafeInteger(expectedRevision, 'expectedRevision', { min: 0 });
    const text = canonicalJson(nextSnapshot);
    const snapshotBytes = byteLength(text);
    if (snapshotBytes > this.maxSnapshotBytes) {
      fail('agent_delivery_snapshot_capacity', 'Agent delivery snapshot exceeds the qualified durable byte budget', {
        requiredBytes: snapshotBytes,
        maxSnapshotBytes: this.maxSnapshotBytes,
      });
    }
    return this.storage.transactionSync(() => {
      const row = this.#row(agentId);
      const actualRevision = row === null ? null : Number(row.revision);
      if (actualRevision !== expectedRevision) {
        fail('agent_delivery_revision_conflict', 'Agent delivery store revision changed', { expectedRevision, actualRevision });
      }
      if (nextSnapshot?.routeBinding?.agentId !== agentId) {
        fail('agent_delivery_store_corrupt', 'Agent delivery snapshot cannot cross Agent identity');
      }
      if (expectedRevision === null) {
        sqlExec(this.storage.sql, `INSERT INTO agent_delivery_state(
          agent_id, revision, snapshot_json, snapshot_bytes, storage_profile, storage_schema_version
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        agentId, nextSnapshot.revision, text, snapshotBytes, AGENT_DELIVERY_STORAGE_PROFILE, AGENT_DELIVERY_STORAGE_SCHEMA_VERSION);
      } else {
        sqlExec(this.storage.sql, `UPDATE agent_delivery_state SET
          revision = ?, snapshot_json = ?, snapshot_bytes = ?, storage_profile = ?, storage_schema_version = ?
          WHERE agent_id = ?`,
        nextSnapshot.revision, text, snapshotBytes, AGENT_DELIVERY_STORAGE_PROFILE, AGENT_DELIVERY_STORAGE_SCHEMA_VERSION, agentId);
      }
      return true;
    });
  }
}

export function createRuntimeAgentRouteBinding(env, { agentId, routeGeneration, durableObjectId }) {
  const config = readAgentDeliveryRuntimeConfig(env);
  return normalizeAgentRouteBinding({
    agentId,
    routeGeneration,
    ...config.placement,
    durableObjectId,
  });
}

function assertRuntimeRouteBinding(input, config, durableObjectId) {
  const binding = normalizeAgentRouteBinding(input);
  const expected = { ...config.placement, durableObjectId };
  for (const [key, value] of Object.entries(expected)) {
    if (binding[key] !== value) {
      fail('agent_route_binding_conflict', `Agent delivery provider host rejected routeBinding.${key}`, {
        expected: value,
        actual: binding[key],
      });
    }
  }
  return binding;
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = typeof btoa === 'function'
    ? btoa(binary)
    : Buffer.from(bytes).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function deriveAgentPrincipalToken(authKey, { agentId, routeGeneration }) {
  if (typeof authKey !== 'string' || byteLength(authKey) < MIN_AUTH_KEY_BYTES || byteLength(authKey) > MAX_AUTH_KEY_BYTES) {
    fail('invalid_agent_delivery_auth_key', 'Agent auth key is outside its supported bounds');
  }
  assertIdentifier(agentId, 'agentId');
  assertSafeInteger(routeGeneration, 'routeGeneration', { min: 1 });
  const principal = canonicalJson({ profile: 'tdev.agent-principal.v1', agentId, routeGeneration });
  const key = await crypto.subtle.importKey('raw', textEncoder.encode(authKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(principal));
  return base64Url(new Uint8Array(signature));
}

async function equalSecret(left, right) {
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', textEncoder.encode(left)),
    crypto.subtle.digest('SHA-256', textEncoder.encode(right)),
  ]);
  const a = new Uint8Array(leftDigest);
  const b = new Uint8Array(rightDigest);
  let difference = left.length ^ right.length;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

async function authorizeAgentRequest(request, authKey, principal) {
  const authorization = request.headers.get('authorization') ?? '';
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';
  const protocolHeader = request.headers.get('sec-websocket-protocol') ?? '';
  const authProtocols = protocolHeader.length === 0
    ? []
    : protocolHeader.split(',').map((value) => value.trim()).filter((value) => value.startsWith(AGENT_DELIVERY_AUTH_PROTOCOL_PREFIX));
  if (authProtocols.length > 1) fail('agent_authentication_failed', 'Agent principal authentication is ambiguous');
  const protocolToken = authProtocols.length === 1 ? authProtocols[0].slice(AGENT_DELIVERY_AUTH_PROTOCOL_PREFIX.length) : '';
  if (bearer !== '' && protocolToken !== '' && !(await equalSecret(bearer, protocolToken))) {
    fail('agent_authentication_failed', 'Agent principal authentication sources conflict');
  }
  const supplied = bearer || protocolToken;
  const expected = await deriveAgentPrincipalToken(authKey, principal);
  if (supplied === '' || !(await equalSecret(supplied, expected))) {
    fail('agent_authentication_failed', 'Agent principal authentication failed');
  }
}

function positiveQueryInteger(params, name, { min = 1 } = {}) {
  const raw = params.get(name);
  if (raw === null || !/^[0-9]+$/.test(raw)) fail('invalid_agent_connect_request', `${name} is missing or invalid`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min) fail('invalid_agent_connect_request', `${name} is outside its supported range`);
  return value;
}

function requiredQueryText(params, name) {
  const value = params.get(name);
  if (value === null || value.length === 0 || value.includes('\0')) fail('invalid_agent_connect_request', `${name} is missing or invalid`);
  return value;
}

function installableAgentTupleFromQuery(params) {
  const fields = [
    'installationGeneration', 'credentialGeneration', 'packageActivationGeneration', 'packageManifestDigest',
    'trustPolicyGeneration', 'trustStateDigest', 'lifecycleGeneration',
  ];
  const present = fields.filter((field) => params.has(field));
  if (present.length === 0) return null;
  if (present.length !== fields.length) fail('invalid_agent_connect_request', 'D0027 connect tuple must be wholly present or absent');
  const tuple = {
    installationGeneration: positiveQueryInteger(params, 'installationGeneration'),
    credentialGeneration: positiveQueryInteger(params, 'credentialGeneration'),
    packageActivationGeneration: positiveQueryInteger(params, 'packageActivationGeneration'),
    packageManifestDigest: requiredQueryText(params, 'packageManifestDigest'),
    trustPolicyGeneration: positiveQueryInteger(params, 'trustPolicyGeneration'),
    trustStateDigest: requiredQueryText(params, 'trustStateDigest'),
    lifecycleGeneration: positiveQueryInteger(params, 'lifecycleGeneration'),
  };
  assertDigest(tuple.packageManifestDigest, 'packageManifestDigest');
  assertDigest(tuple.trustStateDigest, 'trustStateDigest');
  return normalizeInstallableAgentDataPlaneTuple(tuple);
}

function attachmentFromSocket(socket) {
  if (!socket || typeof socket.deserializeAttachment !== 'function') {
    fail('invalid_agent_socket', 'Hibernation socket attachment API is unavailable');
  }
  const raw = socket.deserializeAttachment();
  if (raw?.schemaVersion === 1) {
    assertRecordShape(raw, [
      'schemaVersion', 'agentId', 'routeGeneration', 'connectionId', 'connectionEpoch', 'executorId', 'executorEpoch',
    ], [], 'legacy Agent socket attachment');
  } else if (raw?.schemaVersion === 2) {
    assertRecordShape(raw, [
      'schemaVersion', 'agentId', 'routeGeneration', 'connectionId', 'connectionEpoch', 'socketIncarnationId',
      'executorId', 'executorEpoch',
    ], ['installableAgentTuple'], 'Agent socket attachment');
  } else {
    fail('invalid_agent_socket', 'Agent socket attachment schema is unsupported');
  }
  const attachment = {
    schemaVersion: raw.schemaVersion,
    agentId: raw.agentId,
    routeGeneration: raw.routeGeneration,
    connectionId: raw.connectionId,
    connectionEpoch: raw.connectionEpoch,
    socketIncarnationId: raw.schemaVersion === 2 ? raw.socketIncarnationId : null,
    executorId: raw.executorId,
    executorEpoch: raw.executorEpoch,
    installableAgentTuple: raw.schemaVersion === 2 && raw.installableAgentTuple !== undefined
      ? normalizeInstallableAgentDataPlaneTuple(raw.installableAgentTuple)
      : null,
  };
  assertIdentifier(attachment.agentId, 'attachment.agentId');
  assertSafeInteger(attachment.routeGeneration, 'attachment.routeGeneration', { min: 1 });
  assertIdentifier(attachment.connectionId, 'attachment.connectionId');
  assertSafeInteger(attachment.connectionEpoch, 'attachment.connectionEpoch', { min: 1 });
  if (attachment.socketIncarnationId !== null) assertIdentifier(attachment.socketIncarnationId, 'attachment.socketIncarnationId');
  assertIdentifier(attachment.executorId, 'attachment.executorId');
  assertSafeInteger(attachment.executorEpoch, 'attachment.executorEpoch', { min: 1 });
  if (byteLength(canonicalJson(raw)) > AGENT_DELIVERY_MAX_ATTACHMENT_BYTES) {
    fail('invalid_agent_socket', 'Agent socket attachment exceeds its application limit');
  }
  return attachment;
}

function logicalConnectionIdentityFromAttachment(attachment) {
  return {
    agentId: attachment.agentId,
    routeGeneration: attachment.routeGeneration,
    connectionId: attachment.connectionId,
    connectionEpoch: attachment.connectionEpoch,
  };
}

function connectionIdentityFromAttachment(attachment) {
  if (attachment.socketIncarnationId === null) {
    fail('stale_connection_fence', 'Legacy socket has no physical incarnation fence');
  }
  const identity = {
    ...logicalConnectionIdentityFromAttachment(attachment),
    socketIncarnationId: attachment.socketIncarnationId,
  };
  if (attachment.installableAgentTuple !== undefined && attachment.installableAgentTuple !== null) {
    identity.installableAgentTuple = canonicalClone(attachment.installableAgentTuple);
  }
  return identity;
}

function currentSocketAttachment(attachment, socketIncarnationId) {
  assertIdentifier(socketIncarnationId, 'socketIncarnationId');
  const upgraded = {
    schemaVersion: 2,
    agentId: attachment.agentId,
    routeGeneration: attachment.routeGeneration,
    connectionId: attachment.connectionId,
    connectionEpoch: attachment.connectionEpoch,
    socketIncarnationId,
    executorId: attachment.executorId,
    executorEpoch: attachment.executorEpoch,
  };
  if (attachment.installableAgentTuple !== null) upgraded.installableAgentTuple = canonicalClone(attachment.installableAgentTuple);
  return upgraded;
}

function attachmentTupleKey(attachment) {
  return canonicalJson({
    agentId: attachment.agentId,
    routeGeneration: attachment.routeGeneration,
    connectionId: attachment.connectionId,
    connectionEpoch: attachment.connectionEpoch,
    executorId: attachment.executorId,
    executorEpoch: attachment.executorEpoch,
  });
}

function decodeFrame(message, maxBytes) {
  let bytes;
  if (typeof message === 'string') bytes = textEncoder.encode(message);
  else if (message instanceof ArrayBuffer) bytes = new Uint8Array(message);
  else if (ArrayBuffer.isView(message)) bytes = new Uint8Array(message.buffer, message.byteOffset, message.byteLength);
  else fail('invalid_agent_frame', 'Agent WebSocket frame must be text or binary data');
  if (bytes.byteLength > maxBytes) fail('agent_frame_too_large', 'Agent WebSocket frame exceeds the configured application limit', { maxBytes });
  let text;
  try {
    text = textDecoder.decode(bytes);
  } catch (cause) {
    fail('invalid_agent_frame', 'Agent WebSocket frame must contain UTF-8 JSON', {}, { cause });
  }
  try {
    return strictJsonParse(text, { maxBytes });
  } catch (cause) {
    fail('invalid_agent_frame', 'Agent WebSocket frame is invalid JSON', {}, { cause });
  }
}

function socketPair(factory) {
  const pair = factory();
  const client = pair?.[0] ?? pair?.client;
  const server = pair?.[1] ?? pair?.server;
  if (!client || !server || typeof server.serializeAttachment !== 'function') {
    fail('invalid_agent_socket', 'WebSocketPair factory returned an invalid pair');
  }
  return { client, server };
}

export class AgentDeliveryRuntimeDOHost {
  constructor(ctx, env, options = {}) {
    if (!ctx?.id || typeof ctx.id.toString !== 'function' || !ctx.storage ||
        typeof ctx.blockConcurrencyWhile !== 'function' || typeof ctx.acceptWebSocket !== 'function' ||
        typeof ctx.getWebSockets !== 'function') {
      fail('invalid_agent_delivery_provider', 'Agent delivery Durable Object context is incomplete');
    }
    this.ctx = ctx;
    this.env = env;
    this.config = readAgentDeliveryRuntimeConfig(env);
    this.authKey = optionalAuthKey(env);
    this.now = options.now ?? (() => Date.now());
    if (typeof this.now !== 'function') fail('invalid_agent_delivery_provider', 'Provider clock must be callable');
    const providerJurisdiction = ctx.id.jurisdiction ?? 'global';
    if (providerJurisdiction !== this.config.placement.jurisdiction) {
      fail('agent_route_binding_conflict', 'Agent delivery provider identity has the wrong jurisdiction', {
        expected: this.config.placement.jurisdiction,
        actual: providerJurisdiction,
      });
    }
    this.durableObjectId = ctx.id.toString();
    this.store = options.store ?? new SqliteAgentDeliveryStore(ctx.storage, { maxSnapshotBytes: this.config.maxSnapshotBytes });
    this.webSocketPairFactory = options.webSocketPairFactory ?? (() => new WebSocketPair());
    this.verifyManagementProof = options.verifyManagementProof ?? null;
    this.verifyInstallableAgentEvidence = options.verifyInstallableAgentEvidence ?? null;
    ctx.blockConcurrencyWhile(async () => {
      if (typeof this.store.initialize === 'function') this.store.initialize();
      const legacyGroups = new Map();
      for (const socket of ctx.getWebSockets(AGENT_DELIVERY_SOCKET_TAG)) {
        try {
          const attachment = attachmentFromSocket(socket);
          if (attachment.schemaVersion === 1) {
            const key = attachmentTupleKey(attachment);
            const group = legacyGroups.get(key) ?? [];
            group.push({ socket, attachment });
            legacyGroups.set(key, group);
            continue;
          }
          const routeBinding = createRuntimeAgentRouteBinding(this.env, {
            agentId: attachment.agentId,
            routeGeneration: attachment.routeGeneration,
            durableObjectId: this.durableObjectId,
          });
          this.#authority(routeBinding).reattachConnection(connectionIdentityFromAttachment(attachment));
        } catch {
          try { socket.close(1008, 'stale_hibernation_socket'); } catch {}
        }
      }
      for (const group of legacyGroups.values()) {
        const { attachment } = group[0];
        try {
          const routeBinding = createRuntimeAgentRouteBinding(this.env, {
            agentId: attachment.agentId,
            routeGeneration: attachment.routeGeneration,
            durableObjectId: this.durableObjectId,
          });
          const authority = this.#authority(routeBinding);
          const snapshot = authority.read();
          const logicalMatch = snapshot.connection !== null && snapshot.executor !== null &&
            snapshot.connection.id === attachment.connectionId && snapshot.connection.epoch === attachment.connectionEpoch &&
            snapshot.executor.id === attachment.executorId && snapshot.executor.epoch === attachment.executorEpoch;
          if (!logicalMatch || snapshot.connection.socketIncarnationId !== null) {
            fail('stale_connection_fence', 'Legacy hibernation socket is not the unbound durable current connection');
          }
          if (group.length !== 1) {
            authority.disconnectLegacyConnection(logicalConnectionIdentityFromAttachment(attachment));
            for (const entry of group) {
              try { entry.socket.close(1008, 'ambiguous_legacy_hibernation_socket'); } catch {}
            }
            continue;
          }
          const adopted = authority.adoptLegacySocketIncarnation(logicalConnectionIdentityFromAttachment(attachment));
          const upgraded = currentSocketAttachment(attachment, adopted.socketIncarnationId);
          group[0].socket.serializeAttachment(upgraded);
          authority.reattachConnection(connectionIdentityFromAttachment(upgraded));
        } catch {
          for (const entry of group) {
            try { entry.socket.close(1008, 'stale_hibernation_socket'); } catch {}
          }
        }
      }
    });
  }

  #authority(routeBinding) {
    const binding = assertRuntimeRouteBinding(routeBinding, this.config, this.durableObjectId);
    return new AgentDeliveryAuthority({
      store: this.store,
      routeBinding: binding,
      verifyManagementProof: this.verifyManagementProof,
      verifyInstallableAgentEvidence: this.verifyInstallableAgentEvidence,
    });
  }

  async #invokeManagement(operation, method, input) {
    const authority = this.#authority(input.routeBinding);
    const route = authority.readInstallableAgent().installableAgent;
    if (route.managementKeyId === null) return authority[method](input.request);
    const ticket = await authority.verifyInstallableAgentManagementRequest({ operation, request: input.request });
    return authority[method]({ ...input.request, managementProof: ticket });
  }

  #bindingFromAttachment(attachment) {
    return createRuntimeAgentRouteBinding(this.env, {
      agentId: attachment.agentId,
      routeGeneration: attachment.routeGeneration,
      durableObjectId: this.durableObjectId,
    });
  }

  initializeRoute(input) {
    assertRecordShape(input, ['routeBinding'], ['initialization'], 'Agent delivery route initialization');
    return this.#authority(input.routeBinding).initialize(input.initialization ?? {});
  }

  readRoute(input) {
    assertRecordShape(input, ['routeBinding'], [], 'Agent delivery route read');
    return this.#authority(input.routeBinding).read();
  }

  readInstallableAgent(input) {
    assertRecordShape(input, ['routeBinding'], [], 'D0027 installable Agent read');
    return this.#authority(input.routeBinding).readInstallableAgent();
  }

  issueInstallableAgentConnectChallenge(input) {
    assertRecordShape(input, ['routeBinding', 'request'], ['nowMs'], 'D0039 connect challenge');
    assertRecordShape(input.request, [
      'agentId', 'routeGeneration', 'expectedConnectionEpoch', 'connectRequestId', 'connectionId',
      'executorId', 'executorEpoch', 'protocolMetadataDigest', 'installableAgentTuple',
    ], [], 'D0039 connect challenge request');
    const requestBytes = byteLength(canonicalJson(input.request));
    if (requestBytes > MAX_POSSESSION_ENVELOPE_BYTES) fail('agent_connect_request_too_large', 'D0039 connect challenge request exceeds 8192 bytes');
    const request = canonicalClone(input.request);
    request.requestDigest = computeAgentConnectRequestDigest(request);
    const nonce = new Uint8Array(32);
    crypto.getRandomValues(nonce);
    const nowMs = input.nowMs ?? this.now();
    assertSafeInteger(nowMs, 'nowMs', { min: 0 });
    return this.#authority(input.routeBinding).issueInstallableAgentConnectChallenge(request, {
      nowMs,
      nonce: encodeBase64Url(nonce),
    });
  }

  async acceptInstallableAgentConnectChallenge(request) {
    const url = new URL(request.url);
    if (url.pathname !== AGENT_DELIVERY_WEBSOCKET_PATH || request.method !== 'POST') {
      fail('invalid_agent_connect_challenge_request', 'D0039 challenge endpoint request is invalid');
    }
    if ((request.headers.get('authorization') ?? '') !== '' || (request.headers.get('sec-websocket-protocol') ?? '') !== '') {
      fail('legacy_agent_auth_forbidden', 'D0039 challenge allocation does not accept legacy or WebSocket authority');
    }
    const queryNames = [...url.searchParams.keys()];
    if (queryNames.length !== 2 || new Set(queryNames).size !== 2 ||
        !queryNames.includes('agentId') || !queryNames.includes('routeGeneration')) {
      fail('invalid_agent_connect_challenge_request', 'D0039 challenge endpoint query is ambiguous or contains unknown fields');
    }
    const agentId = requiredQueryText(url.searchParams, 'agentId');
    const routeGeneration = positiveQueryInteger(url.searchParams, 'routeGeneration');
    const challengeRequest = await readBoundedChallengeRequest(request);
    if (challengeRequest?.agentId !== agentId || challengeRequest?.routeGeneration !== routeGeneration) {
      fail('invalid_agent_connect_challenge_request', 'D0039 challenge route query and request body disagree');
    }
    const routeBinding = createRuntimeAgentRouteBinding(this.env, {
      agentId,
      routeGeneration,
      durableObjectId: this.durableObjectId,
    });
    return this.issueInstallableAgentConnectChallenge({ routeBinding, request: challengeRequest });
  }

  migrateInstallableAgentRoute(input) {
    assertRecordShape(input, ['routeBinding', 'request'], [], 'D0027 route migration');
    return this.#authority(input.routeBinding).migrateInstallableAgentRoute(input.request);
  }

  async registerInstallableAgent(input) {
    assertRecordShape(input, ['routeBinding', 'request'], [], 'D0027 register');
    return this.#invokeManagement('register', 'registerInstallableAgent', input);
  }

  recordInstallableAgentGenesisEvidence(input) {
    assertRecordShape(input, ['routeBinding', 'request'], [], 'D0027 genesis evidence');
    return this.#authority(input.routeBinding).recordInstallableAgentGenesisEvidence(input.request);
  }

  acceptLegacyPredecessorQuiescence(input) {
    assertRecordShape(input, ['routeBinding', 'request'], [], 'D0027 legacy predecessor quiescence');
    return this.#authority(input.routeBinding).acceptLegacyPredecessorQuiescence(input.request);
  }

  async initialActivateInstallableAgent(input) {
    assertRecordShape(input, ['routeBinding', 'request'], [], 'D0027 initial activation');
    return this.#invokeManagement('register', 'initialActivateInstallableAgent', input);
  }

  async failInstallableAgentGenesis(input) {
    assertRecordShape(input, ['routeBinding', 'request'], [], 'D0027 failed genesis');
    return this.#invokeManagement('register', 'failInstallableAgentGenesis', input);
  }

  recordInstallableAgentTransactionEvidence(input) {
    assertRecordShape(input, ['routeBinding', 'request'], [], 'D0027 transaction evidence');
    return this.#authority(input.routeBinding).recordInstallableAgentTransactionEvidence(input.request);
  }

  async mutateInstallableAgentTrust(input) {
    assertRecordShape(input, ['routeBinding', 'request'], [], 'D0027 trust mutation');
    return this.#invokeManagement('trust', 'mutateInstallableAgentTrust', input);
  }

  async beginCredentialRotation(input) {
    assertRecordShape(input, ['routeBinding', 'request'], [], 'D0027 credential rotation begin');
    return this.#invokeManagement('credential_rotate', 'beginCredentialRotation', input);
  }

  async commitCredentialRotation(input) {
    assertRecordShape(input, ['routeBinding', 'request'], [], 'D0027 credential rotation commit');
    return this.#invokeManagement('credential_rotate', 'commitCredentialRotation', input);
  }

  async revokeInstallableAgentCredential(input) {
    assertRecordShape(input, ['routeBinding', 'request'], [], 'D0027 credential revocation');
    return this.#invokeManagement('credential_revoke', 'revokeInstallableAgentCredential', input);
  }

  async beginBaseStop(input) {
    assertRecordShape(input, ['routeBinding', 'request'], [], 'D0027 base stop begin');
    return this.#invokeManagement('stop', 'beginBaseStop', input);
  }

  async completeBaseStop(input) {
    assertRecordShape(input, ['routeBinding', 'request'], [], 'D0027 base stop complete');
    return this.#invokeManagement('stop', 'completeBaseStop', input);
  }

  async prepareBaseStart(input) {
    assertRecordShape(input, ['routeBinding', 'request'], [], 'D0027 base start prepare');
    return this.#invokeManagement('start', 'prepareBaseStart', input);
  }

  async commitBaseStart(input) {
    assertRecordShape(input, ['routeBinding', 'request'], [], 'D0027 base start commit');
    return this.#invokeManagement('start', 'commitBaseStart', input);
  }

  async beginPackageActivation(input) {
    assertRecordShape(input, ['routeBinding', 'request'], [], 'D0027 package activation begin');
    return this.#invokeManagement('package', 'beginPackageActivation', input);
  }

  async commitPackageActivation(input) {
    assertRecordShape(input, ['routeBinding', 'request'], [], 'D0027 package activation commit');
    return this.#invokeManagement('package', 'commitPackageActivation', input);
  }

  async beginInstallableAgentReplacement(input) {
    assertRecordShape(input, ['routeBinding', 'request'], [], 'D0027 replacement begin');
    return this.#invokeManagement('replace', 'beginInstallableAgentReplacement', input);
  }

  async commitInstallableAgentReplacement(input) {
    assertRecordShape(input, ['routeBinding', 'request'], [], 'D0027 replacement commit');
    return this.#invokeManagement('replace', 'commitInstallableAgentReplacement', input);
  }

  async beginInstallableAgentUninstall(input) {
    assertRecordShape(input, ['routeBinding', 'request'], [], 'D0027 uninstall begin');
    return this.#invokeManagement('uninstall', 'beginInstallableAgentUninstall', input);
  }

  async completeInstallableAgentUninstall(input) {
    assertRecordShape(input, ['routeBinding', 'request'], [], 'D0027 uninstall complete');
    return this.#invokeManagement('uninstall', 'completeInstallableAgentUninstall', input);
  }

  compactInstallableAgentManagementReceipts(input) {
    assertRecordShape(input, ['routeBinding', 'request'], [], 'D0027 management receipt compaction');
    return this.#authority(input.routeBinding).compactInstallableAgentManagementReceipts(input.request);
  }

  reserve(input) {
    assertRecordShape(input, ['routeBinding', 'request', 'nowMs'], [], 'Agent delivery provider reservation');
    return this.#authority(input.routeBinding).reserve(input.request, { nowMs: input.nowMs });
  }

  releaseReservation(input) {
    assertRecordShape(input, ['routeBinding', 'request', 'nowMs'], [], 'Agent delivery provider reservation release');
    return this.#authority(input.routeBinding).releaseReservation(input.request, { nowMs: input.nowMs });
  }

  expireReservation(input) {
    assertRecordShape(input, ['routeBinding', 'request', 'nowMs'], [], 'Agent delivery provider reservation expiry');
    return this.#authority(input.routeBinding).expireReservation(input.request, { nowMs: input.nowMs });
  }

  rollReservationWindow(input) {
    assertRecordShape(input, ['routeBinding', 'request', 'nowMs'], [], 'Agent delivery provider reservation rollover');
    return this.#authority(input.routeBinding).rollReservationWindow(input.request, { nowMs: input.nowMs });
  }

  activateDelivery(input) {
    assertRecordShape(input, ['routeBinding', 'request', 'nowMs'], [], 'Agent delivery provider activation');
    return this.#authority(input.routeBinding).activateDelivery(input.request, { nowMs: input.nowMs });
  }

  grantCommand(input) {
    assertRecordShape(input, ['routeBinding', 'deliveryId'], ['dispatchOrdinal'], 'Agent delivery provider grant command');
    return this.#authority(input.routeBinding).grantCommand(input.deliveryId, input.dispatchOrdinal ?? 1);
  }

  closeUndispatchedDelivery(input) {
    assertRecordShape(input, ['routeBinding', 'deliveryId'], ['nowMs'], 'Agent delivery provider close undispatched');
    return this.#authority(input.routeBinding).closeUndispatchedDelivery(
      input.deliveryId,
      input.nowMs === undefined ? {} : { nowMs: input.nowMs },
    );
  }

  bindTerminalCaseReceipt(input) {
    assertRecordShape(input, ['routeBinding', 'request', 'nowMs'], [], 'Agent delivery provider terminal Case receipt');
    return this.#authority(input.routeBinding).bindTerminalCaseReceipt(input.request, { nowMs: input.nowMs });
  }

  reacquireDeliveryAdmission(input) {
    assertRecordShape(input, ['routeBinding', 'request'], [], 'Agent delivery provider reacquire admission');
    return this.#authority(input.routeBinding).reacquireDeliveryAdmission(input.request);
  }

  async acceptAgentWebSocket(request) {
    const url = new URL(request.url);
    if (url.pathname !== AGENT_DELIVERY_WEBSOCKET_PATH || request.method !== 'GET' ||
        (request.headers.get('upgrade') ?? '').toLowerCase() !== 'websocket') {
      fail('invalid_agent_connect_request', 'Agent WebSocket upgrade request is invalid');
    }
    const agentId = requiredQueryText(url.searchParams, 'agentId');
    const routeGeneration = positiveQueryInteger(url.searchParams, 'routeGeneration');
    const principal = { agentId, routeGeneration };
    const routeBinding = createRuntimeAgentRouteBinding(this.env, { agentId, routeGeneration, durableObjectId: this.durableObjectId });
    const authority = this.#authority(routeBinding);
    const routeState = authority.readInstallableAgent().installableAgent;
    let possessionEnvelope = null;
    if (routeState.state === 'LEGACY_D0020_ONLY') {
      if (this.authKey === null) fail('agent_authentication_failed', 'Legacy D0020 Agent auth binding is absent');
      if (websocketProtocols(request).some((value) => value.startsWith(AGENT_DELIVERY_POSSESSION_PROTOCOL_PREFIX))) {
        fail('agent_authentication_failed', 'Legacy D0020 connection cannot present D0039 possession authority');
      }
      await authorizeAgentRequest(request, this.authKey, principal);
    } else {
      if (hasLegacyAgentAuth(request)) fail('legacy_agent_auth_forbidden', 'Legacy HMAC/Bearer authority is permanently disabled after the first D0027 marker');
      possessionEnvelope = possessionEnvelopeFromRequest(request);
    }
    const connect = {
      agentId,
      routeGeneration,
      expectedConnectionEpoch: positiveQueryInteger(url.searchParams, 'expectedConnectionEpoch', { min: 0 }),
      connectRequestId: requiredQueryText(url.searchParams, 'connectRequestId'),
      connectionId: requiredQueryText(url.searchParams, 'connectionId'),
      executorId: requiredQueryText(url.searchParams, 'executorId'),
      executorEpoch: positiveQueryInteger(url.searchParams, 'executorEpoch'),
      protocolMetadataDigest: requiredQueryText(url.searchParams, 'protocolMetadataDigest'),
    };
    const installableAgentTuple = installableAgentTupleFromQuery(url.searchParams);
    if (installableAgentTuple !== null) connect.installableAgentTuple = installableAgentTuple;
    assertDigest(connect.protocolMetadataDigest, 'protocolMetadataDigest');
    connect.requestDigest = computeAgentConnectRequestDigest(connect);
    let result;
    if (routeState.state === 'LEGACY_D0020_ONLY') {
      result = authority.connect(connect);
    } else {
      if (installableAgentTuple === null) fail('agent_possession_required', 'D0027 WebSocket requires the exact current installable-Agent tuple');
      const nowMs = this.now();
      assertSafeInteger(nowMs, 'nowMs', { min: 0 });
      const ticket = await authority.verifyInstallableAgentConnectPossession({
        connectRequest: connect,
        envelope: possessionEnvelope,
        nowMs,
      });
      result = authority.connect(connect, { possessionTicket: ticket, nowMs });
    }
    if (!['accepted', 'exact_replay'].includes(result.classification)) {
      fail('stale_connection_fence', 'Agent connection request is stale');
    }
    const receipt = result.receipt;
    const attachment = {
      schemaVersion: 2,
      agentId,
      routeGeneration,
      connectionId: receipt.connectionId,
      connectionEpoch: receipt.connectionEpoch,
      socketIncarnationId: result.socketIncarnationId,
      executorId: receipt.executorId,
      executorEpoch: receipt.executorEpoch,
    };
    if (installableAgentTuple !== null) attachment.installableAgentTuple = canonicalClone(installableAgentTuple);
    if (byteLength(canonicalJson(attachment)) > AGENT_DELIVERY_MAX_ATTACHMENT_BYTES) {
      fail('invalid_agent_socket', 'Agent socket attachment exceeds its application limit');
    }
    const { client, server } = socketPair(this.webSocketPairFactory);
    server.serializeAttachment(attachment);
    for (const oldSocket of this.ctx.getWebSockets(AGENT_DELIVERY_SOCKET_TAG)) {
      if (oldSocket === server) continue;
      try {
        const old = attachmentFromSocket(oldSocket);
        const sameRoute = old.agentId === agentId && old.routeGeneration === routeGeneration;
        const olderLogical = old.connectionEpoch < attachment.connectionEpoch;
        const supersededPhysical = old.connectionEpoch === attachment.connectionEpoch &&
          old.connectionId === attachment.connectionId && old.socketIncarnationId !== attachment.socketIncarnationId;
        if (sameRoute && (olderLogical || supersededPhysical)) oldSocket.close(1012, 'superseded_connection');
      } catch {
        try { oldSocket.close(1008, 'invalid_connection_attachment'); } catch {}
      }
    }
    this.ctx.acceptWebSocket(server, [
      AGENT_DELIVERY_SOCKET_TAG,
      `epoch-${attachment.connectionEpoch}`,
      `incarnation-${attachment.socketIncarnationId}`,
    ]);
    return Object.freeze({ webSocket: client, routeBinding, result });
  }

  #socketForAuthorization(authorization, currentConnection) {
    if (currentConnection === null || currentConnection.socketIncarnationId === null) return null;
    for (const socket of this.ctx.getWebSockets(AGENT_DELIVERY_SOCKET_TAG)) {
      try {
        const attachment = attachmentFromSocket(socket);
        const installableTupleMatch = authorization.installableAgentTuple === undefined || authorization.installableAgentTuple === null
          ? attachment.installableAgentTuple === null
          : attachment.installableAgentTuple !== null && canonicalJson(attachment.installableAgentTuple) === canonicalJson(authorization.installableAgentTuple);
        if (attachment.schemaVersion === 2 && installableTupleMatch &&
            attachment.connectionId === authorization.connectionId && attachment.connectionEpoch === authorization.connectionEpoch &&
            attachment.socketIncarnationId === currentConnection.socketIncarnationId &&
            attachment.executorId === authorization.executorId && attachment.executorEpoch === authorization.executorEpoch) {
          return socket;
        }
      } catch {}
    }
    return null;
  }

  sendAuthorizedDispatch(input) {
    assertRecordShape(input, ['routeBinding', 'authorization', 'executableBody'], [], 'Agent delivery provider dispatch send');
    const authority = this.#authority(input.routeBinding);
    const authorizationResult = authority.authorizeDispatch(input.authorization);
    const authorization = authorizationResult.authorization;
    const state = authority.read();
    const socket = this.#socketForAuthorization(authorization, state.connection);
    if (socket === null) {
      return Object.freeze({ classification: 'socket_unavailable', sent: false, possibleExecution: false, authorization });
    }
    const delivery = state.deliveries[input.authorization.command.deliveryId];
    if (!delivery) fail('unknown_delivery', 'Dispatch send targets an unknown delivery');
    const bodyText = canonicalJson(input.executableBody);
    if (digest(input.executableBody) !== delivery.executableBodyDigest || byteLength(bodyText) !== delivery.executableBodyBytes) {
      fail('activation_substitution', 'Dispatch executable body differs from the activated delivery');
    }
    const baseWireEnvelope = {
      type: 'dispatch',
      deliveryId: delivery.deliveryId,
      dispatchOrdinal: authorization.dispatchOrdinal,
      authorizationId: authorization.authorizationId,
      dispatchGrantId: authorization.dispatchGrantId,
      caseId: delivery.caseId,
      taskId: delivery.taskId,
      attemptId: delivery.attemptId,
      executorId: delivery.executorId,
      executorEpoch: delivery.executorEpoch,
      fencingToken: delivery.fencingToken,
      protocolVersion: delivery.protocolVersion,
      executableBody: canonicalClone(input.executableBody),
    };
    const d0027 = authorization.installableAgentTuple !== undefined && authorization.installableAgentTuple !== null;
    if (d0027) {
      const previewEnvelope = {
        ...baseWireEnvelope,
        installableAgentTuple: canonicalClone(authorization.installableAgentTuple),
        socketIncarnationId: authorization.socketIncarnationId,
        firstEmissionAdmissionId: `sha256:${'0'.repeat(64)}`,
      };
      const previewBytes = byteLength(canonicalJson(previewEnvelope));
      if (previewBytes > delivery.envelopeBytes || previewBytes > this.config.maxFrameBytes) {
        fail('agent_delivery_limit', 'D0027 dispatch wire envelope exceeds its activated/provider byte bound', {
          wireBytes: previewBytes,
          activatedEnvelopeBytes: delivery.envelopeBytes,
          maxFrameBytes: this.config.maxFrameBytes,
        });
      }
      const admission = authority.initiateFirstEmission({
        deliveryId: delivery.deliveryId,
        authorizationId: authorization.authorizationId,
        dispatchOrdinal: authorization.dispatchOrdinal,
        dispatchGrantId: authorization.dispatchGrantId,
      }, (accepted) => {
        const wireEnvelope = {
          ...baseWireEnvelope,
          installableAgentTuple: canonicalClone(accepted.installableAgentTuple),
          socketIncarnationId: accepted.socketIncarnationId,
          firstEmissionAdmissionId: accepted.admissionId,
        };
        socket.send(canonicalJson(wireEnvelope));
      });
      if (admission.classification === 'exact_replay') {
        return Object.freeze({ classification: 'exact_replay', sent: false, possibleExecution: true, admissionId: admission.admissionId, authorization });
      }
      if (admission.classification === 'send_initiated') {
        return Object.freeze({ classification: 'sent', sent: true, possibleExecution: true, admissionId: admission.admissionId, authorization });
      }
      return Object.freeze({
        classification: 'send_outcome_unknown',
        sent: false,
        possibleExecution: true,
        admissionId: admission.admissionId,
        authorization,
        errorCode: admission.errorCode,
      });
    }
    const claim = authority.claimFirstSend({
      deliveryId: delivery.deliveryId,
      authorizationId: authorization.authorizationId,
      dispatchOrdinal: authorization.dispatchOrdinal,
      dispatchGrantId: authorization.dispatchGrantId,
    });
    if (!claim.maySend) {
      return Object.freeze({ classification: 'exact_replay', sent: false, possibleExecution: true, claimId: claim.claimId, authorization });
    }
    const wireText = canonicalJson(baseWireEnvelope);
    const wireBytes = byteLength(wireText);
    if (wireBytes > delivery.envelopeBytes || wireBytes > this.config.maxFrameBytes) {
      fail('agent_delivery_limit', 'Dispatch wire envelope exceeds its activated/provider byte bound', {
        wireBytes,
        activatedEnvelopeBytes: delivery.envelopeBytes,
        maxFrameBytes: this.config.maxFrameBytes,
      });
    }
    try {
      socket.send(wireText);
      return Object.freeze({ classification: 'sent', sent: true, possibleExecution: true, claimId: claim.claimId, authorization });
    } catch (cause) {
      return Object.freeze({ classification: 'send_outcome_unknown', sent: false, possibleExecution: true, claimId: claim.claimId, authorization, errorCode: cause?.code ?? 'socket_send_failed' });
    }
  }

  async webSocketMessage(socket, message) {
    try {
      const attachment = attachmentFromSocket(socket);
      const routeBinding = this.#bindingFromAttachment(attachment);
      const authority = this.#authority(routeBinding);
      authority.reattachConnection(connectionIdentityFromAttachment(attachment));
      const frame = decodeFrame(message, this.config.maxFrameBytes);
      assertRecordShape(frame, ['type', 'payload'], [], 'Agent WebSocket message');
      if (frame.type === 'capacity') {
        assertRecordShape(frame.payload, ['capacityRevision', 'reportedCapacity'], [], 'Agent capacity frame');
        const request = {
          agentId: attachment.agentId,
          routeGeneration: attachment.routeGeneration,
          connectionId: attachment.connectionId,
          connectionEpoch: attachment.connectionEpoch,
          executorId: attachment.executorId,
          executorEpoch: attachment.executorEpoch,
          capacityRevision: frame.payload.capacityRevision,
          reportedCapacity: frame.payload.reportedCapacity,
        };
        request.requestDigest = computeAgentCapacityRequestDigest(request);
        const result = authority.observeCapacity(request);
        socket.send(canonicalJson({ type: 'capacity_ack', result }));
        return result;
      }
      if (frame.type === 'evidence') {
        assertRecordShape(frame.payload, [
          'deliveryId', 'dispatchOrdinal', 'attemptId', 'fencingToken', 'localEvidenceRevision', 'observation',
        ], [], 'Agent evidence frame');
        const result = authority.assimilateEvidence({
          agentId: attachment.agentId,
          routeGeneration: attachment.routeGeneration,
          connectionId: attachment.connectionId,
          connectionEpoch: attachment.connectionEpoch,
          executorId: attachment.executorId,
          executorEpoch: attachment.executorEpoch,
          ...frame.payload,
        });
        socket.send(canonicalJson({ type: 'evidence_ack', result }));
        return result;
      }
      if (frame.type === 'result') {
        assertRecordShape(frame.payload, ['deliveryId', 'resultEnvelope'], [], 'Agent result frame');
        const handoff = authority.resultHandoff({
          agentId: attachment.agentId,
          routeGeneration: attachment.routeGeneration,
          connectionId: attachment.connectionId,
          connectionEpoch: attachment.connectionEpoch,
          deliveryId: frame.payload.deliveryId,
          resultEnvelope: frame.payload.resultEnvelope,
        });
        socket.send(canonicalJson({ type: 'result_handoff', handoff }));
        return handoff;
      }
      fail('invalid_agent_frame', 'Unknown Agent WebSocket message type');
    } catch (error) {
      const code = error instanceof ContractError ? error.code : 'agent_provider_failure';
      try { socket.close(1008, code.slice(0, 120)); } catch {}
      throw error;
    }
  }

  webSocketClose(socket) {
    try {
      const attachment = attachmentFromSocket(socket);
      const authority = this.#authority(this.#bindingFromAttachment(attachment));
      return authority.disconnect(connectionIdentityFromAttachment(attachment));
    } catch (error) {
      if (error instanceof ContractError && ['stale_connection_fence', 'connection_unavailable'].includes(error.code)) {
        return Object.freeze({ classification: 'stale', disconnected: false });
      }
      throw error;
    }
  }

  webSocketError(socket) {
    return this.webSocketClose(socket);
  }
}
