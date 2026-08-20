import {
  ContractError,
  assertIdentifier,
  assertRecordShape,
  assertSafeInteger,
  publicJsonClone,
  strictJsonParse,
} from '../src/canonical.mjs';
import {
  AGENT_DELIVERY_WEBSOCKET_PATH,
  AGENT_DELIVERY_WEBSOCKET_PROTOCOL,
  AgentDeliveryRuntimeDOHost,
  createRuntimeAgentRouteBinding,
  readAgentDeliveryRuntimeConfig,
} from '../src/cloudflare-agent-delivery-runtime.mjs';

export const D0020_QUALIFICATION_PATH = '/qualification/d0020/v1';
export const D0020_QUALIFICATION_MAX_REQUEST_BYTES = 1024 * 1024;
export const D0020_QUALIFICATION_MODE = 'enabled';

const QUALIFICATION_RPC_SCHEMA_VERSION = 1;
const MIN_TOKEN_BYTES = 32;
const MAX_TOKEN_BYTES = 512;
const textEncoder = new TextEncoder();

function byteLength(value) {
  return textEncoder.encode(value).byteLength;
}

function requiredQualificationMode(env) {
  if (env?.TDEV_D0020_QUALIFICATION_MODE !== D0020_QUALIFICATION_MODE) {
    throw new ContractError('qualification_mode_disabled', 'D0020 qualification mode is not enabled');
  }
}

function requiredQualificationToken(env) {
  const token = env?.TDEV_D0020_QUALIFICATION_TOKEN;
  const bytes = typeof token === 'string' ? byteLength(token) : 0;
  if (typeof token !== 'string' || token.includes('\0') || bytes < MIN_TOKEN_BYTES || bytes > MAX_TOKEN_BYTES) {
    throw new ContractError('invalid_qualification_config', 'D0020 qualification token binding is invalid');
  }
  return token;
}

function assertNamespace(namespace, jurisdiction) {
  if (!namespace || typeof namespace.idFromName !== 'function' || typeof namespace.get !== 'function') {
    throw new ContractError('invalid_qualification_config', 'D0020 qualification requires an Agent delivery Durable Object namespace');
  }
  if (jurisdiction === 'global') return namespace;
  if (typeof namespace.jurisdiction !== 'function') {
    throw new ContractError('invalid_qualification_config', 'D0020 qualification requires a jurisdiction-capable Agent namespace');
  }
  const scoped = namespace.jurisdiction(jurisdiction);
  if (!scoped || typeof scoped.idFromName !== 'function' || typeof scoped.get !== 'function') {
    throw new ContractError('invalid_qualification_config', 'D0020 qualification received an invalid jurisdiction subnamespace');
  }
  return scoped;
}

async function digestBytes(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', textEncoder.encode(value)));
}

async function equalSecret(left, right) {
  const [leftDigest, rightDigest] = await Promise.all([digestBytes(left), digestBytes(right)]);
  let difference = left.length ^ right.length;
  for (let index = 0; index < leftDigest.length; index += 1) difference |= leftDigest[index] ^ rightDigest[index];
  return difference === 0;
}

async function authorizeQualificationRequest(request, expectedToken) {
  const authorization = request.headers.get('authorization') ?? '';
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';
  if (!(await equalSecret(supplied, expectedToken))) {
    throw new ContractError('qualification_unauthorized', 'D0020 qualification authentication failed');
  }
}

function applicationProtocolOffered(request) {
  const protocols = (request.headers.get('sec-websocket-protocol') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return protocols.includes(AGENT_DELIVERY_WEBSOCKET_PROTOCOL);
}

async function readRequest(request) {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    throw new ContractError('qualification_invalid_request', 'D0020 qualification requires application/json');
  }
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null && (!/^[0-9]+$/.test(declaredLength) || Number(declaredLength) > D0020_QUALIFICATION_MAX_REQUEST_BYTES)) {
    throw new ContractError('qualification_request_too_large', 'D0020 qualification request exceeds its byte limit', {
      maxBytes: D0020_QUALIFICATION_MAX_REQUEST_BYTES,
    });
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > D0020_QUALIFICATION_MAX_REQUEST_BYTES) {
    throw new ContractError('qualification_request_too_large', 'D0020 qualification request exceeds its byte limit', {
      maxBytes: D0020_QUALIFICATION_MAX_REQUEST_BYTES,
    });
  }
  try {
    return strictJsonParse(bytes, { maxBytes: D0020_QUALIFICATION_MAX_REQUEST_BYTES });
  } catch (cause) {
    throw new ContractError('qualification_invalid_request', 'D0020 qualification request body is invalid', {}, { cause });
  }
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

function errorStatus(code) {
  if (code === 'qualification_unauthorized' || code === 'agent_authentication_failed') return 401;
  if (code === 'qualification_mode_disabled' || code === 'invalid_qualification_config') return 503;
  if (code.endsWith('_conflict') || code.includes('stale_')) return 409;
  return 400;
}

function publicError(error) {
  if (error instanceof ContractError) {
    return jsonResponse(errorStatus(error.code), {
      ok: false,
      error: { code: error.code, details: error.details },
    });
  }
  return jsonResponse(500, { ok: false, error: { code: 'qualification_provider_failure', details: {} } });
}

function rpcShape(input) {
  if (!input || typeof input.operation !== 'string') {
    throw new ContractError('qualification_unknown_operation', 'D0020 qualification operation is invalid');
  }
  const shapes = {
    runtime_probe: [[], []],
    initialize: [[], ['initialization']],
    read: [[], []],
    reserve: [['request', 'nowMs'], []],
    release_reservation: [['request', 'nowMs'], []],
    expire_reservation: [['request', 'nowMs'], []],
    roll_reservation_window: [['request', 'nowMs'], []],
    activate_delivery: [['request', 'nowMs'], []],
    grant_command: [['deliveryId'], ['dispatchOrdinal']],
    close_undispatched_delivery: [['deliveryId'], []],
    reacquire_delivery_admission: [['request'], []],
    send_dispatch: [['authorization', 'executableBody'], []],
    abort_instance: [[], []],
  };
  const shape = shapes[input.operation];
  if (!shape) throw new ContractError('qualification_unknown_operation', 'D0020 qualification operation is unsupported');
  assertRecordShape(
    input,
    ['operation', 'agentId', 'routeGeneration', ...shape[0]],
    shape[1],
    `D0020 qualification ${input.operation}`,
  );
  assertIdentifier(input.agentId, 'agentId');
  assertSafeInteger(input.routeGeneration, 'routeGeneration', { min: 1 });
  return input.operation;
}

function unwrapQualificationRpc(response) {
  assertRecordShape(response, ['schemaVersion', 'ok'], ['result', 'error'], 'D0020 qualification RPC response');
  if (response.schemaVersion !== QUALIFICATION_RPC_SCHEMA_VERSION || typeof response.ok !== 'boolean') {
    throw new ContractError('invalid_qualification_provider', 'D0020 qualification RPC response header is invalid');
  }
  if (response.ok) {
    assertRecordShape(response, ['schemaVersion', 'ok', 'result'], [], 'D0020 qualification RPC success');
    return response.result;
  }
  assertRecordShape(response, ['schemaVersion', 'ok', 'error'], [], 'D0020 qualification RPC failure');
  assertRecordShape(response.error, ['code'], [], 'D0020 qualification RPC error');
  throw new ContractError(response.error.code, 'D0020 qualification authority rejected the operation');
}

export class D0020QualificationService {
  constructor(env) {
    requiredQualificationMode(env);
    this.env = env;
    this.token = requiredQualificationToken(env);
    this.runtimeConfig = readAgentDeliveryRuntimeConfig(env);
    this.namespace = assertNamespace(env?.TDEV_AGENT_DELIVERY, this.runtimeConfig.placement.jurisdiction);
  }

  #route(agentId) {
    assertIdentifier(agentId, 'agentId');
    const id = this.namespace.idFromName(agentId);
    if (!id || typeof id.toString !== 'function') {
      throw new ContractError('invalid_qualification_provider', 'Agent delivery namespace returned an invalid identity');
    }
    const providerJurisdiction = id.jurisdiction ?? 'global';
    if (providerJurisdiction !== this.runtimeConfig.placement.jurisdiction) {
      throw new ContractError('invalid_qualification_provider', 'Agent delivery identity has the wrong jurisdiction');
    }
    const stub = this.namespace.get(id);
    if (!stub || (typeof stub !== 'object' && typeof stub !== 'function') ||
        typeof stub.fetch !== 'function' || typeof stub.qualificationInvoke !== 'function') {
      throw new ContractError('invalid_qualification_provider', 'Agent delivery namespace returned an invalid stub');
    }
    return { id, stub };
  }

  async fetch(request) {
    try {
      const url = new URL(request.url);
      if (url.pathname === AGENT_DELIVERY_WEBSOCKET_PATH) {
        if (request.method !== 'GET' || (request.headers.get('upgrade') ?? '').toLowerCase() !== 'websocket' || !applicationProtocolOffered(request)) {
          throw new ContractError('invalid_agent_connect_request', 'D0020 Agent WebSocket upgrade is missing the required application protocol');
        }
        const agentId = url.searchParams.get('agentId');
        assertIdentifier(agentId, 'agentId');
        return this.#route(agentId).stub.fetch(request);
      }
      if (url.pathname !== D0020_QUALIFICATION_PATH) {
        return jsonResponse(404, { ok: false, error: { code: 'qualification_not_found', details: {} } });
      }
      if (request.method !== 'POST') {
        return jsonResponse(405, { ok: false, error: { code: 'qualification_method_not_allowed', details: {} } });
      }
      await authorizeQualificationRequest(request, this.token);
      const input = await readRequest(request);
      rpcShape(input);
      const result = unwrapQualificationRpc(await this.#route(input.agentId).stub.qualificationInvoke(publicJsonClone(input)));
      return jsonResponse(200, { ok: true, result });
    } catch (error) {
      return publicError(error);
    }
  }
}

export class D0020QualificationAgentDeliveryDOHost {
  constructor(ctx, env, options = {}) {
    requiredQualificationMode(env);
    if (!ctx || typeof ctx.abort !== 'function') {
      throw new ContractError('invalid_qualification_config', 'D0020 qualification requires Durable Object abort support');
    }
    this.ctx = ctx;
    this.env = env;
    this.host = options.host ?? new AgentDeliveryRuntimeDOHost(ctx, env);
    const sourceSha = env?.TDEV_SOURCE_SHA;
    if (typeof sourceSha !== 'string' || !/^[0-9a-f]{40}$/.test(sourceSha)) {
      throw new ContractError('invalid_qualification_config', 'D0020 qualification source SHA binding is invalid');
    }
    const versionId = env?.TDEV_WORKER_VERSION?.id;
    if (versionId !== undefined && (typeof versionId !== 'string' || versionId.length === 0 || versionId.length > 256)) {
      throw new ContractError('invalid_qualification_config', 'D0020 qualification Worker version identity is invalid');
    }
    if (typeof this.host.durableObjectId !== 'string' || this.host.durableObjectId.length === 0) {
      throw new ContractError('invalid_qualification_provider', 'D0020 Agent delivery host has no durable object identity');
    }
    this.sourceSha = sourceSha;
    this.workerVersionId = versionId ?? null;
  }

  #binding(agentId, routeGeneration) {
    return createRuntimeAgentRouteBinding(this.env, {
      agentId,
      routeGeneration,
      durableObjectId: this.host.durableObjectId,
    });
  }

  #runtimeFacts(routeBinding) {
    return Object.freeze({
      workerScript: this.host.config.placement.workerScript,
      namespace: this.host.config.placement.namespace,
      jurisdiction: this.host.config.placement.jurisdiction,
      durableObjectId: this.host.durableObjectId,
      routeBinding,
      sourceSha: this.sourceSha,
      workerVersionId: this.workerVersionId,
    });
  }

  async fetch(request) {
    if (!applicationProtocolOffered(request)) {
      throw new ContractError('invalid_agent_connect_request', 'D0020 Agent WebSocket upgrade is missing the required application protocol');
    }
    const accepted = await this.host.acceptAgentWebSocket(request);
    return new Response(null, {
      status: 101,
      webSocket: accepted.webSocket,
      headers: { 'Sec-WebSocket-Protocol': AGENT_DELIVERY_WEBSOCKET_PROTOCOL },
    });
  }

  webSocketMessage(socket, message) {
    return this.host.webSocketMessage(socket, message);
  }

  webSocketClose(socket) {
    return this.host.webSocketClose(socket);
  }

  webSocketError(socket) {
    return this.host.webSocketError(socket);
  }

  async qualificationInvoke(input) {
    try {
      const operation = rpcShape(input);
      const routeBinding = this.#binding(input.agentId, input.routeGeneration);
      let result;
      if (operation === 'runtime_probe') {
        this.host.readRoute({ routeBinding });
        result = this.#runtimeFacts(routeBinding);
      } else if (operation === 'initialize') {
        result = this.host.initializeRoute({ routeBinding, ...(input.initialization === undefined ? {} : { initialization: input.initialization }) });
      } else if (operation === 'read') {
        result = this.host.readRoute({ routeBinding });
      } else if (operation === 'reserve') {
        result = this.host.reserve({ routeBinding, request: input.request, nowMs: input.nowMs });
      } else if (operation === 'release_reservation') {
        result = this.host.releaseReservation({ routeBinding, request: input.request, nowMs: input.nowMs });
      } else if (operation === 'expire_reservation') {
        result = this.host.expireReservation({ routeBinding, request: input.request, nowMs: input.nowMs });
      } else if (operation === 'roll_reservation_window') {
        result = this.host.rollReservationWindow({ routeBinding, request: input.request, nowMs: input.nowMs });
      } else if (operation === 'activate_delivery') {
        result = this.host.activateDelivery({ routeBinding, request: input.request, nowMs: input.nowMs });
      } else if (operation === 'grant_command') {
        result = this.host.grantCommand({ routeBinding, deliveryId: input.deliveryId, ...(input.dispatchOrdinal === undefined ? {} : { dispatchOrdinal: input.dispatchOrdinal }) });
      } else if (operation === 'close_undispatched_delivery') {
        result = this.host.closeUndispatchedDelivery({ routeBinding, deliveryId: input.deliveryId });
      } else if (operation === 'reacquire_delivery_admission') {
        result = this.host.reacquireDeliveryAdmission({ routeBinding, request: input.request });
      } else if (operation === 'send_dispatch') {
        result = this.host.sendAuthorizedDispatch({ routeBinding, authorization: input.authorization, executableBody: input.executableBody });
      } else {
        this.host.readRoute({ routeBinding });
        this.ctx.abort('tdev_d0020_qualification_abort_instance');
        throw new ContractError('qualification_abort_returned', 'D0020 Durable Object abort unexpectedly returned');
      }
      return publicJsonClone({ schemaVersion: QUALIFICATION_RPC_SCHEMA_VERSION, ok: true, result });
    } catch (error) {
      if (!(error instanceof ContractError)) throw error;
      return {
        schemaVersion: QUALIFICATION_RPC_SCHEMA_VERSION,
        ok: false,
        error: { code: error.code },
      };
    }
  }
}
