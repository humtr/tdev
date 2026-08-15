import {
  ContractError,
  assertRecordShape,
  strictJsonParse,
} from './canonical.mjs';
import {
  CaseRuntimeDOHost,
  createRuntimeCasePlacement,
  readCaseRuntimeConfig,
} from './cloudflare-casedo-runtime.mjs';
import { D1CasePlacementAuthority } from './d1-case-placement.mjs';

export const D0019_QUALIFICATION_PATH = '/qualification/d0019/v1';
export const D0019_QUALIFICATION_MAX_REQUEST_BYTES = 1024 * 1024;

const textEncoder = new TextEncoder();
const QUALIFICATION_MODE = 'enabled';
const MIN_TOKEN_BYTES = 32;
const MAX_TOKEN_BYTES = 512;

function byteLength(value) {
  return textEncoder.encode(value).byteLength;
}

function requiredQualificationMode(env) {
  if (env?.TDEV_D0019_QUALIFICATION_MODE !== QUALIFICATION_MODE) {
    throw new ContractError('qualification_mode_disabled', 'D0019 qualification mode is not enabled');
  }
}

function requiredQualificationToken(env) {
  const token = env?.TDEV_D0019_QUALIFICATION_TOKEN;
  const bytes = typeof token === 'string' ? byteLength(token) : 0;
  if (typeof token !== 'string' || token.includes('\0') || bytes < MIN_TOKEN_BYTES || bytes > MAX_TOKEN_BYTES) {
    throw new ContractError('invalid_qualification_config', 'D0019 qualification token binding is invalid');
  }
  return token;
}

function assertNamespace(namespace, jurisdiction) {
  if (!namespace || typeof namespace.idFromName !== 'function' || typeof namespace.get !== 'function') {
    throw new ContractError('invalid_qualification_config', 'D0019 qualification requires a Durable Object namespace binding');
  }
  if (jurisdiction === 'global') return namespace;
  if (typeof namespace.jurisdiction !== 'function') {
    throw new ContractError('invalid_qualification_config', 'D0019 qualification requires a jurisdiction-capable Durable Object namespace');
  }
  const scoped = namespace.jurisdiction(jurisdiction);
  if (!scoped || typeof scoped.idFromName !== 'function' || typeof scoped.get !== 'function') {
    throw new ContractError('invalid_qualification_config', 'D0019 qualification received an invalid jurisdiction subnamespace');
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

async function authorize(request, expectedToken) {
  const authorization = request.headers.get('authorization') ?? '';
  const prefix = 'Bearer ';
  const supplied = authorization.startsWith(prefix) ? authorization.slice(prefix.length) : '';
  if (!(await equalSecret(supplied, expectedToken))) {
    throw new ContractError('qualification_unauthorized', 'D0019 qualification authentication failed');
  }
}

async function readRequest(input) {
  const contentType = input.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    throw new ContractError('qualification_invalid_request', 'D0019 qualification requires application/json');
  }
  const declaredLength = input.headers.get('content-length');
  if (declaredLength !== null && (!/^[0-9]+$/.test(declaredLength) || Number(declaredLength) > D0019_QUALIFICATION_MAX_REQUEST_BYTES)) {
    throw new ContractError('qualification_request_too_large', 'D0019 qualification request exceeds its byte limit', {
      maxBytes: D0019_QUALIFICATION_MAX_REQUEST_BYTES,
    });
  }
  const bytes = new Uint8Array(await input.arrayBuffer());
  if (bytes.byteLength > D0019_QUALIFICATION_MAX_REQUEST_BYTES) {
    throw new ContractError('qualification_request_too_large', 'D0019 qualification request exceeds its byte limit', {
      maxBytes: D0019_QUALIFICATION_MAX_REQUEST_BYTES,
    });
  }
  try {
    return strictJsonParse(bytes, { maxBytes: D0019_QUALIFICATION_MAX_REQUEST_BYTES });
  } catch (cause) {
    if (cause?.code === 'qualification_request_too_large') throw cause;
    throw new ContractError('qualification_invalid_request', 'D0019 qualification request body is invalid', {}, { cause });
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
  if (code === 'qualification_unauthorized') return 401;
  if (code === 'placement_conflict' || code === 'case_exists' || code === 'request_conflict' || code === 'revision_conflict') return 409;
  if (code === 'placement_store_unavailable') return 503;
  if (code === 'qualification_mode_disabled' || code === 'invalid_qualification_config') return 503;
  return 400;
}

function publicError(error) {
  if (error instanceof ContractError) {
    return jsonResponse(errorStatus(error.code), {
      ok: false,
      error: { code: error.code, details: error.details },
    });
  }
  return jsonResponse(500, {
    ok: false,
    error: { code: 'qualification_provider_failure', details: {} },
  });
}

function operationShape(input, operation) {
  const shapes = {
    elect: [[], []],
    initialize: [['plan'], ['caseContract']],
    load: [[], []],
    command: [['envelope'], []],
    recover_execution_owner_loss: [['recoveryId', 'cause'], []],
    abort_instance: [[], []],
    command_then_abort: [['envelope'], []],
    runtime_probe: [[], []],
    writer_barrier_probe: [['expectedWriterCompatibilityId', 'envelope'], []],
  };
  const shape = shapes[operation];
  if (!shape) throw new ContractError('qualification_unknown_operation', 'Unknown D0019 qualification operation');
  assertRecordShape(input, ['operation', 'caseId', ...shape[0]], shape[1], `D0019 qualification ${operation}`);
}

export class D0019QualificationService {
  constructor(env, options = {}) {
    requiredQualificationMode(env);
    this.env = env;
    this.token = requiredQualificationToken(env);
    this.runtimeConfig = readCaseRuntimeConfig(env);
    this.namespace = assertNamespace(env?.TDEV_CASE_AUTHORITY, this.runtimeConfig.placement.jurisdiction);
    this.placementAuthority = options.placementAuthority ?? new D1CasePlacementAuthority(env?.TDEV_CASE_PLACEMENT);
  }

  #route(caseId) {
    const id = this.namespace.idFromName(caseId);
    if (!id || typeof id.toString !== 'function') {
      throw new ContractError('invalid_qualification_provider', 'Durable Object namespace returned an invalid identity');
    }
    const providerJurisdiction = id.jurisdiction ?? 'global';
    if (providerJurisdiction !== this.runtimeConfig.placement.jurisdiction) {
      throw new ContractError('invalid_qualification_provider', 'Durable Object identity has the wrong jurisdiction');
    }
    const stub = this.namespace.get(id);
    if (!stub || typeof stub !== 'object') {
      throw new ContractError('invalid_qualification_provider', 'Durable Object namespace returned an invalid stub');
    }
    return {
      placement: createRuntimeCasePlacement(this.env, caseId, id.toString()),
      stub,
    };
  }

  async #dispatch(input) {
    assertRecordShape(input, ['operation', 'caseId'], ['plan', 'caseContract', 'envelope', 'recoveryId', 'cause', 'expectedWriterCompatibilityId'], 'D0019 qualification request');
    if (typeof input.operation !== 'string') throw new ContractError('qualification_unknown_operation', 'D0019 qualification operation is invalid');
    operationShape(input, input.operation);
    const { placement, stub } = this.#route(input.caseId);

    if (input.operation === 'elect') return this.placementAuthority.elect({ placement });
    if (input.operation === 'initialize') return stub.initializeElectedCase({ placement, plan: input.plan, ...(input.caseContract === undefined ? {} : { caseContract: input.caseContract }) });
    if (input.operation === 'load') return stub.loadCase({ placement });
    if (input.operation === 'command') return stub.command({ placement, envelope: input.envelope });
    if (input.operation === 'recover_execution_owner_loss') {
      return stub.recoverExecutionOwnerLoss({ placement, recoveryId: input.recoveryId, cause: input.cause });
    }
    if (input.operation === 'abort_instance') return stub.qualificationAbortInstance({ placement });
    if (input.operation === 'command_then_abort') return stub.qualificationCommandThenAbort({ placement, envelope: input.envelope });
    if (input.operation === 'runtime_probe') return stub.qualificationRuntimeProbe({ placement });
    return stub.qualificationWriterBarrierProbe({
      placement,
      expectedWriterCompatibilityId: input.expectedWriterCompatibilityId,
      envelope: input.envelope,
    });
  }

  async fetch(request) {
    try {
      const url = new URL(request.url);
      if (url.pathname !== D0019_QUALIFICATION_PATH) return jsonResponse(404, { ok: false, error: { code: 'qualification_not_found', details: {} } });
      if (request.method !== 'POST') return jsonResponse(405, { ok: false, error: { code: 'qualification_method_not_allowed', details: {} } });
      await authorize(request, this.token);
      const result = await this.#dispatch(await readRequest(request));
      return jsonResponse(200, { ok: true, result });
    } catch (error) {
      return publicError(error);
    }
  }
}

export class D0019QualificationCaseDOHost {
  constructor(ctx, env) {
    requiredQualificationMode(env);
    if (!ctx || typeof ctx.abort !== 'function') {
      throw new ContractError('invalid_qualification_config', 'D0019 qualification requires Durable Object abort support');
    }
    this.ctx = ctx;
    this.host = new CaseRuntimeDOHost(ctx, env);
    const sourceSha = env?.TDEV_SOURCE_SHA;
    if (typeof sourceSha !== 'string' || !/^[0-9a-f]{40}$/.test(sourceSha)) {
      throw new ContractError('invalid_qualification_config', 'D0019 qualification source SHA binding is invalid');
    }
    const versionId = env?.TDEV_WORKER_VERSION?.id;
    if (versionId !== undefined && (typeof versionId !== 'string' || versionId.length === 0 || versionId.length > 256)) {
      throw new ContractError('invalid_qualification_config', 'D0019 qualification Worker version identity is invalid');
    }
    this.sourceSha = sourceSha;
    this.workerVersionId = versionId ?? null;
  }

  #runtimeFacts() {
    return {
      writerCompatibilityId: this.host.config.writerCompatibilityId,
      maxAuthoritativeBytesPerCase: this.host.config.maxAuthoritativeBytesPerCase,
      workerScript: this.host.config.placement.workerScript,
      namespace: this.host.config.placement.namespace,
      jurisdiction: this.host.config.placement.jurisdiction,
      sourceSha: this.sourceSha,
      workerVersionId: this.workerVersionId,
    };
  }

  initializeElectedCase(input) {
    return this.host.initializeElectedCase(input);
  }

  loadCase(input) {
    return this.host.loadCase(input);
  }

  command(input) {
    return this.host.command(input);
  }

  recoverExecutionOwnerLoss(input) {
    return this.host.recoverExecutionOwnerLoss(input);
  }

  async qualificationAbortInstance(input) {
    assertRecordShape(input, ['placement'], [], 'D0019 qualification instance abort');
    await this.host.requireElectedPlacement(input.placement);
    this.ctx.abort('tdev_d0019_qualification_abort_instance');
    throw new ContractError('qualification_abort_returned', 'Durable Object abort unexpectedly returned');
  }

  async qualificationCommandThenAbort(input) {
    assertRecordShape(input, ['placement', 'envelope'], [], 'D0019 qualification command-then-abort');
    await this.host.command(input);
    this.ctx.abort('tdev_d0019_qualification_abort_after_commit');
    throw new ContractError('qualification_abort_returned', 'Durable Object abort unexpectedly returned');
  }

  async qualificationRuntimeProbe(input) {
    assertRecordShape(input, ['placement'], [], 'D0019 qualification runtime probe');
    await this.host.requireElectedPlacement(input.placement);
    return this.#runtimeFacts();
  }

  async qualificationWriterBarrierProbe(input) {
    assertRecordShape(input, ['placement', 'expectedWriterCompatibilityId', 'envelope'], [], 'D0019 qualification writer barrier probe');
    if (typeof input.expectedWriterCompatibilityId !== 'string' || input.expectedWriterCompatibilityId.length === 0) {
      throw new ContractError('qualification_invalid_request', 'D0019 writer barrier probe requires an expected writer identity');
    }
    await this.host.requireElectedPlacement(input.placement);
    const facts = this.#runtimeFacts();
    if (facts.writerCompatibilityId !== input.expectedWriterCompatibilityId) {
      return { ...facts, attempted: false, mutation: null };
    }
    try {
      const result = await this.host.command({ placement: input.placement, envelope: input.envelope });
      return { ...facts, attempted: true, mutation: { committed: true, result } };
    } catch (error) {
      if (!(error instanceof ContractError)) throw error;
      return { ...facts, attempted: true, mutation: { committed: false, errorCode: error.code } };
    }
  }
}
