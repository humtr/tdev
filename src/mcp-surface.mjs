import {
  ContractError,
  assertDigest,
  assertIdentifier,
  assertRecordShape,
  assertSafeInteger,
  assertScalarString,
  canonicalClone,
  canonicalJson,
  deepFreeze,
  digest,
  isPlainRecord,
  strictJsonParse,
  typedDigest,
} from './canonical.mjs';
import {
  MCP_AUTH_PROFILE,
  MCP_AUTH_RESOURCE_METADATA_PATHS,
  MCP_AUTH_SERVER_METADATA_PATH,
  mcpAuthProtectedResourceMetadata,
} from './mcp-auth.mjs';
import { createDevelopmentUnitStartAdapter } from './mcp-development-adapter.mjs';

export const MCP_SURFACE_PROFILE = 'tdev.mcp.surface.v1';
export const MCP_SURFACE_SCHEMA_VERSION = 1;
export const MCP_SURFACE_MANIFEST_DOMAIN = 'tdev.mcp.surface-manifest.v1';
export const MCP_SURFACE_PATH = '/mcp';
export const MCP_SURFACE_PROTOCOL_VERSION = '2025-03-26';
export const MCP_SURFACE_SUPPORTED_PROTOCOL_VERSIONS = Object.freeze([MCP_SURFACE_PROTOCOL_VERSION]);
export const MCP_SURFACE_MAX_REQUEST_BYTES = 1024 * 1024;
export const MCP_SURFACE_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
export const MCP_SURFACE_MAX_EVENTS_PAGE = 100;

const TOOL_NAMES = Object.freeze([
  'case_create',
  'case_get',
  'case_events_get',
  'case_run_or_resume',
  'task_cancel',
  'attempt_reconcile',
  'claim_conflicts_get',
  'promotion_get',
  'development_context_get',
  'development_unit_start',
  'development_unit_get',
]);

function fail(code, message, details = undefined, options = undefined) {
  throw new ContractError(code, message, details, options);
}

function schema(properties, required = []) {
  return Object.freeze({
    type: 'object',
    properties: Object.freeze(properties),
    required: Object.freeze(required),
    additionalProperties: false,
  });
}

const stringSchema = Object.freeze({ type: 'string' });
const identifierSchema = Object.freeze({ type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$' });
const digestSchema = Object.freeze({ type: 'string', pattern: '^sha256:[0-9a-f]{64}$' });
const integerSchema = Object.freeze({ type: 'integer', minimum: 0 });

export const MCP_SURFACE_TOOL_DEFINITIONS = Object.freeze([
  { name: 'case_create', description: 'Create one immutable tdev Case from a compiled Plan.', inputSchema: schema({ requestId: identifierSchema, caseId: identifierSchema, plan: { type: 'object' }, caseContract: { type: 'object' } }, ['requestId', 'caseId', 'plan']) },
  { name: 'case_get', description: 'Read one bounded authoritative Case projection.', inputSchema: schema({ caseId: identifierSchema, includeTree: { type: 'boolean' } }, ['caseId']) },
  { name: 'case_events_get', description: 'Read a bounded committed Case Event page.', inputSchema: schema({ caseId: identifierSchema, afterSequence: integerSchema, limit: { type: 'integer', minimum: 1, maximum: MCP_SURFACE_MAX_EVENTS_PAGE } }, ['caseId']) },
  { name: 'case_run_or_resume', description: 'Drive one existing Case through the authenticated Agent owner.', inputSchema: schema({ requestId: identifierSchema, caseId: identifierSchema, driveRequestId: identifierSchema, payload: { type: 'object' }, expectedCaseRevision: integerSchema }, ['requestId', 'caseId', 'driveRequestId', 'payload']) },
  { name: 'task_cancel', description: 'Submit a receipt-backed Task cancellation to the Case owner.', inputSchema: schema({ requestId: identifierSchema, caseId: identifierSchema, taskId: identifierSchema, reason: stringSchema, expectedCaseRevision: integerSchema }, ['requestId', 'caseId', 'taskId']) },
  { name: 'attempt_reconcile', description: 'Submit an exact external Attempt reconciliation decision.', inputSchema: schema({ requestId: identifierSchema, caseId: identifierSchema, attemptId: identifierSchema, decision: { type: 'object' }, expectedCaseRevision: integerSchema }, ['requestId', 'caseId', 'attemptId', 'decision']) },
  { name: 'claim_conflicts_get', description: 'Read current ClaimLedger conflicts without acquiring a lease.', inputSchema: schema({ claims: { type: 'array', items: { type: 'object' } } }, ['claims']) },
  { name: 'promotion_get', description: 'Read the bounded Promotion/candidate projection for a Case.', inputSchema: schema({ caseId: identifierSchema, includeTree: { type: 'boolean' } }, ['caseId']) },
  { name: 'development_context_get', description: 'Read an owner-issued immutable repository context reference.', inputSchema: schema({ selector: stringSchema }, []) },
  { name: 'development_unit_start', description: 'Start one typed development unit through the existing Case, Drive and Agent owners.', inputSchema: schema({ requestId: identifierSchema, caseId: identifierSchema, driveRequestId: identifierSchema, contextReference: identifierSchema, instruction: stringSchema, validationProfile: identifierSchema }, ['requestId', 'caseId', 'driveRequestId', 'contextReference', 'instruction', 'validationProfile']) },
  { name: 'development_unit_get', description: 'Read the bounded candidate projection for a development unit.', inputSchema: schema({ caseId: identifierSchema }, ['caseId']) },
]);

function limitsBody(input) {
  assertRecordShape(input, ['maxRequestBytes', 'maxResponseBytes', 'maxEventsPage', 'maxContextBytes', 'maxCandidateBytes'], [], 'MCP surface limits');
  for (const [name, value] of Object.entries(input)) assertSafeInteger(value, `MCP surface limits.${name}`, { min: 1 });
  if (input.maxEventsPage > MCP_SURFACE_MAX_EVENTS_PAGE) fail('mcp_surface_limit_invalid', 'maxEventsPage exceeds the source bound');
  if (input.maxRequestBytes > 16 * 1024 * 1024 || input.maxResponseBytes > 32 * 1024 * 1024) {
    fail('mcp_surface_limit_invalid', 'MCP request/response limits exceed the source bound');
  }
  return {
    maxRequestBytes: input.maxRequestBytes,
    maxResponseBytes: input.maxResponseBytes,
    maxEventsPage: input.maxEventsPage,
    maxContextBytes: input.maxContextBytes,
    maxCandidateBytes: input.maxCandidateBytes,
  };
}

function manifestBody(input) {
  assertRecordShape(input, [
    'schemaVersion', 'profile', 'surfaceId', 'route', 'protocolVersions', 'tools', 'limits',
    'authProfileId', 'ownerProfiles', 'buildDigest',
  ], ['surfaceDigest'], 'MCP surface manifest');
  if (input.schemaVersion !== MCP_SURFACE_SCHEMA_VERSION || input.profile !== MCP_SURFACE_PROFILE) {
    fail('mcp_surface_schema_unsupported', 'Unsupported MCP surface profile or schema');
  }
  if (input.surfaceId !== MCP_SURFACE_PROFILE) fail('mcp_surface_identity_invalid', 'MCP surface identity is invalid');
  if (input.route !== MCP_SURFACE_PATH) fail('mcp_surface_route_invalid', 'MCP surface route is fixed at /mcp');
  if (!Array.isArray(input.protocolVersions) || input.protocolVersions.length === 0 ||
      input.protocolVersions.some((value) => typeof value !== 'string' || value.length === 0)) {
    fail('mcp_surface_protocol_invalid', 'MCP surface protocolVersions must be a non-empty string array');
  }
  const protocolVersions = [...new Set(input.protocolVersions)].sort();
  if (protocolVersions.length !== input.protocolVersions.length) fail('mcp_surface_protocol_duplicate', 'MCP surface protocolVersions contains a duplicate');
  if (!Array.isArray(input.tools) || input.tools.length !== TOOL_NAMES.length) fail('mcp_surface_tools_invalid', 'MCP surface tool set is incomplete');
  const tools = input.tools.map((tool, index) => {
    assertRecordShape(tool, ['name', 'description', 'inputSchema'], [], `MCP surface tool ${index}`);
    assertIdentifier(tool.name, `MCP surface tool ${index}.name`);
    if (typeof tool.description !== 'string' || tool.description.length === 0) fail('mcp_surface_tools_invalid', 'MCP surface tool description is invalid');
    if (!isPlainRecord(tool.inputSchema)) fail('mcp_surface_tools_invalid', 'MCP surface tool inputSchema must be a record');
    return canonicalClone(tool);
  });
  const names = tools.map((tool) => tool.name);
  if (names.join('\0') !== TOOL_NAMES.join('\0')) fail('mcp_surface_tools_invalid', 'MCP surface tool order/set does not match the accepted v1 contract');
  for (let index = 0; index < tools.length; index += 1) {
    if (canonicalJson(tools[index]) !== canonicalJson(MCP_SURFACE_TOOL_DEFINITIONS[index])) {
      fail('mcp_surface_tools_invalid', 'MCP surface tool definition does not match the accepted v1 contract');
    }
  }
  const authProfileId = input.authProfileId;
  if (authProfileId !== MCP_AUTH_PROFILE) fail('mcp_surface_auth_profile_invalid', 'MCP surface must bind the accepted D0024 auth profile');
  if (!isPlainRecord(input.ownerProfiles)) fail('mcp_surface_owner_profiles_invalid', 'MCP surface ownerProfiles must be a record');
  const ownerProfiles = canonicalClone(input.ownerProfiles);
  assertDigest(input.buildDigest, 'MCP surface buildDigest');
  return {
    schemaVersion: MCP_SURFACE_SCHEMA_VERSION,
    profile: MCP_SURFACE_PROFILE,
    surfaceId: MCP_SURFACE_PROFILE,
    route: MCP_SURFACE_PATH,
    protocolVersions,
    tools,
    limits: limitsBody(input.limits),
    authProfileId,
    ownerProfiles,
    buildDigest: input.buildDigest,
  };
}

export function normalizeMcpSurfaceManifest(input) {
  const body = manifestBody(input);
  const expected = typedDigest(MCP_SURFACE_MANIFEST_DOMAIN, body);
  if (input.surfaceDigest !== undefined && input.surfaceDigest !== expected) {
    fail('mcp_surface_manifest_digest_mismatch', 'MCP surface manifest digest does not match its fields');
  }
  return deepFreeze({ ...body, surfaceDigest: expected });
}

export function createMcpSurfaceManifest({ buildDigest = digest({ source: 'unbound-tdev-mcp' }), authProfileId = MCP_AUTH_PROFILE,
  protocolVersions = MCP_SURFACE_SUPPORTED_PROTOCOL_VERSIONS, ownerProfiles = {
    case: 'tdev.case.repository.v1',
    drive: 'tdev.case-agent-drive.v1',
    operation: 'tdev.development-operation-profiles.v1',
    developmentUnit: 'tdev.development-unit.v1',
  }, limits = {
    maxRequestBytes: MCP_SURFACE_MAX_REQUEST_BYTES,
    maxResponseBytes: MCP_SURFACE_MAX_RESPONSE_BYTES,
    maxEventsPage: MCP_SURFACE_MAX_EVENTS_PAGE,
    maxContextBytes: 256 * 1024,
    maxCandidateBytes: 4 * 1024 * 1024,
  } } = {}) {
  return normalizeMcpSurfaceManifest({
    schemaVersion: MCP_SURFACE_SCHEMA_VERSION,
    profile: MCP_SURFACE_PROFILE,
    surfaceId: MCP_SURFACE_PROFILE,
    route: MCP_SURFACE_PATH,
    protocolVersions,
    tools: MCP_SURFACE_TOOL_DEFINITIONS,
    limits,
    authProfileId,
    ownerProfiles,
    buildDigest,
  });
}

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

function bytesOf(value) {
  return new TextEncoder().encode(value).byteLength;
}

async function readBoundedBody(request, maxBytes) {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') fail('mcp_invalid_content_type', 'MCP POST requires application/json');
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^[0-9]+$/.test(declared) || Number(declared) > maxBytes)) {
    fail('mcp_request_too_large', 'MCP request exceeds the configured byte bound');
  }
  if (request.body === null || typeof request.body.getReader !== 'function') {
    fail('mcp_invalid_body', 'MCP request body is required');
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
      if (total > maxBytes) {
        await reader.cancel();
        fail('mcp_request_too_large', 'MCP request exceeds the configured byte bound');
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
  try { return strictJsonParse(body, { maxBytes }); }
  catch (cause) { fail('mcp_invalid_json', 'MCP request is not strict bounded JSON', {}, { cause }); }
}

function rpcId(value) {
  if (typeof value === 'string') {
    assertScalarString(value, 'JSON-RPC id');
    if (value.length === 0 || value.length > 128) fail('mcp_invalid_rpc', 'JSON-RPC id is out of bounds');
    return value;
  }
  if (Number.isSafeInteger(value)) return value;
  fail('mcp_invalid_rpc', 'JSON-RPC id must be a bounded string or safe integer');
}

function rpcRequest(input) {
  if (!isPlainRecord(input)) fail('mcp_invalid_rpc', 'MCP JSON-RPC request must be one object, not a batch');
  const hasId = Object.hasOwn(input, 'id');
  assertRecordShape(input, hasId ? ['jsonrpc', 'id', 'method'] : ['jsonrpc', 'method'], ['params'], 'MCP JSON-RPC request');
  if (input.jsonrpc !== '2.0' || typeof input.method !== 'string' || input.method.length === 0 || input.method.length > 128) {
    fail('mcp_invalid_rpc', 'MCP JSON-RPC request identity is invalid');
  }
  if (hasId) rpcId(input.id);
  if (Object.hasOwn(input, 'params') && !isPlainRecord(input.params)) fail('mcp_invalid_rpc', 'MCP params must be an object');
  return deepFreeze({
    jsonrpc: '2.0',
    ...(hasId ? { id: input.id } : {}),
    method: input.method,
    params: input.params === undefined ? {} : canonicalClone(input.params),
  });
}

function protocolHeader(request) {
  const value = request.headers.get('mcp-protocol-version');
  if (value === null || value === '') return null;
  if (value.includes(',')) fail('mcp_protocol_invalid', 'MCP-Protocol-Version must contain exactly one value');
  return value;
}

function safeErrorCode(error) {
  if (error instanceof ContractError && typeof error.code === 'string' && /^[a-z][a-z0-9_]{0,127}$/.test(error.code)) return error.code;
  return 'mcp_internal_error';
}

function rpcError(id, code, message, dataCode = code) {
  return { jsonrpc: '2.0', ...(id === undefined ? {} : { id }), error: { code, message, data: { code: dataCode } } };
}

function errorStatus(error) {
  const code = safeErrorCode(error);
  if (code === 'mcp_authentication_failed' || code.startsWith('mcp_auth_') && (code.includes('issuer') || code.includes('audience') || code.includes('assertion'))) return 401;
  if (code === 'mcp_authorization_denied') return 403;
  if (code.includes('config') || code.includes('verifier_unavailable')) return 503;
  if (code === 'mcp_internal_error') return 500;
  return 400;
}

function errorMessage(error) {
  const code = safeErrorCode(error);
  if (code === 'mcp_internal_error') return 'MCP server error';
  if (code === 'mcp_authentication_failed' || code.startsWith('mcp_auth_')) return 'MCP authentication failed';
  if (code === 'mcp_authorization_denied') return 'MCP authorization denied';
  return 'MCP request rejected';
}

function assertObject(value, label) {
  if (!isPlainRecord(value)) fail('mcp_tool_invalid_arguments', `${label} must be an object`);
  return value;
}

function optionalRevision(args) {
  if (args.expectedCaseRevision === undefined) return null;
  return assertSafeInteger(args.expectedCaseRevision, 'expectedCaseRevision', { min: 0 });
}

function requireText(args, name, { identifier = false } = {}) {
  if (!Object.hasOwn(args, name)) fail('mcp_tool_invalid_arguments', `${name} is required`);
  if (identifier) return assertIdentifier(args[name], name);
  assertScalarString(args[name], name);
  if (args[name].length === 0 || args[name].length > 64 * 1024) fail('mcp_tool_invalid_arguments', `${name} is out of bounds`);
  return args[name];
}

function validateToolArguments(name, input) {
  const args = assertObject(input, `${name} arguments`);
  switch (name) {
    case 'case_create':
      assertRecordShape(args, ['requestId', 'caseId', 'plan'], ['caseContract'], 'case_create arguments');
      requireText(args, 'requestId', { identifier: true }); requireText(args, 'caseId', { identifier: true });
      if (!isPlainRecord(args.plan)) fail('mcp_tool_invalid_arguments', 'plan must be a compiled Plan record');
      if (args.caseContract !== undefined && !isPlainRecord(args.caseContract)) fail('mcp_tool_invalid_arguments', 'caseContract must be a record');
      return canonicalClone(args);
    case 'case_get':
    case 'promotion_get':
      assertRecordShape(args, ['caseId'], ['includeTree'], `${name} arguments`);
      requireText(args, 'caseId', { identifier: true });
      if (args.includeTree !== undefined && typeof args.includeTree !== 'boolean') fail('mcp_tool_invalid_arguments', 'includeTree must be boolean');
      return canonicalClone(args);
    case 'case_events_get':
      assertRecordShape(args, ['caseId'], ['afterSequence', 'limit'], 'case_events_get arguments');
      requireText(args, 'caseId', { identifier: true });
      const afterSequence = args.afterSequence === undefined ? 0 : assertSafeInteger(args.afterSequence, 'afterSequence', { min: 0 });
      const limit = args.limit === undefined ? MCP_SURFACE_MAX_EVENTS_PAGE : assertSafeInteger(args.limit, 'limit', { min: 1, max: MCP_SURFACE_MAX_EVENTS_PAGE });
      return deepFreeze({ caseId: args.caseId, afterSequence, limit });
    case 'case_run_or_resume':
      assertRecordShape(args, ['requestId', 'caseId', 'driveRequestId', 'payload'], ['expectedCaseRevision'], 'case_run_or_resume arguments');
      requireText(args, 'requestId', { identifier: true }); requireText(args, 'caseId', { identifier: true });
      requireText(args, 'driveRequestId', { identifier: true });
      if (!isPlainRecord(args.payload)) fail('mcp_tool_invalid_arguments', 'payload must be a record');
      optionalRevision(args);
      return canonicalClone(args);
    case 'task_cancel':
      assertRecordShape(args, ['requestId', 'caseId', 'taskId'], ['reason', 'expectedCaseRevision'], 'task_cancel arguments');
      requireText(args, 'requestId', { identifier: true }); requireText(args, 'caseId', { identifier: true }); requireText(args, 'taskId', { identifier: true });
      if (args.reason !== undefined) requireText(args, 'reason');
      optionalRevision(args);
      return canonicalClone(args);
    case 'attempt_reconcile':
      assertRecordShape(args, ['requestId', 'caseId', 'attemptId', 'decision'], ['expectedCaseRevision'], 'attempt_reconcile arguments');
      requireText(args, 'requestId', { identifier: true }); requireText(args, 'caseId', { identifier: true }); requireText(args, 'attemptId', { identifier: true });
      if (!isPlainRecord(args.decision)) fail('mcp_tool_invalid_arguments', 'decision must be a record');
      optionalRevision(args);
      return canonicalClone(args);
    case 'claim_conflicts_get':
      assertRecordShape(args, ['claims'], [], 'claim_conflicts_get arguments');
      if (!Array.isArray(args.claims)) fail('mcp_tool_invalid_arguments', 'claims must be an array');
      return canonicalClone(args);
    case 'development_context_get':
      assertRecordShape(args, [], ['selector'], 'development_context_get arguments');
      if (args.selector !== undefined) requireText(args, 'selector');
      return canonicalClone(args);
    case 'development_unit_start':
      assertRecordShape(args, ['requestId', 'caseId', 'driveRequestId', 'contextReference', 'instruction', 'validationProfile'], [], 'development_unit_start arguments');
      requireText(args, 'requestId', { identifier: true }); requireText(args, 'caseId', { identifier: true }); requireText(args, 'driveRequestId', { identifier: true });
      requireText(args, 'contextReference', { identifier: true }); requireText(args, 'instruction'); requireText(args, 'validationProfile', { identifier: true });
      return canonicalClone(args);
    case 'development_unit_get':
      assertRecordShape(args, ['caseId'], [], 'development_unit_get arguments');
      requireText(args, 'caseId', { identifier: true });
      return canonicalClone(args);
    default: fail('mcp_tool_not_found', `Unknown MCP tool ${name}`);
  }
}

function projectedError(error) {
  if (!isPlainRecord(error)) return null;
  return {
    code: typeof error.code === 'string' ? error.code : null,
    certainty: typeof error.certainty === 'string' ? error.certainty : null,
    retryable: typeof error.retryable === 'boolean' ? error.retryable : null,
  };
}

function projectSnapshot(snapshot, { includeTree = false } = {}) {
  if (!isPlainRecord(snapshot)) fail('mcp_owner_invalid_projection', 'Case owner returned an invalid snapshot');
  const taskStates = Object.fromEntries(Object.entries(snapshot.taskStates ?? {}).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([taskId, state]) => [taskId, {
    state: state.state,
    attemptIds: Array.isArray(state.attemptIds) ? [...state.attemptIds] : [],
    acceptedResultDigest: state.acceptedResultDigest ?? null,
    error: projectedError(state.error),
    blockedBy: Array.isArray(state.blockedBy) ? [...state.blockedBy] : [],
  }]));
  const attempts = Object.fromEntries(Object.entries(snapshot.attempts ?? {}).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([attemptId, attempt]) => [attemptId, {
    id: attempt.id,
    taskId: attempt.taskId,
    ordinal: attempt.ordinal,
    state: attempt.state,
    executorId: attempt.executorId,
    executorEpoch: attempt.executorEpoch,
    fencingToken: attempt.fencingToken,
    resultDigest: attempt.resultDigest ?? null,
    error: projectedError(attempt.error),
  }]));
  const receipts = Object.fromEntries(Object.entries(snapshot.receipts ?? {}).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([requestId, receipt]) => [requestId, {
    requestId,
    commandDigest: receipt.commandDigest,
    responseDigest: receipt.responseDigest,
    committedRevision: receipt.committedRevision,
  }]));
  const result = {
    schemaVersion: snapshot.schemaVersion,
    caseId: snapshot.caseId,
    caseState: snapshot.caseState,
    caseRevision: snapshot.caseRevision,
    eventSequence: snapshot.eventSequence,
    planDigest: snapshot.plan?.planDigest ?? null,
    baseDigest: snapshot.plan?.baseDigest ?? null,
    canonicalDigest: snapshot.canonicalDigest,
    taskStates,
    attempts,
    receipts,
  };
  if (includeTree) result.canonicalTree = canonicalClone(snapshot.canonicalTree ?? {});
  return deepFreeze(canonicalClone(result));
}

function projectEvents(snapshot, afterSequence, limit) {
  const events = Array.isArray(snapshot.events) ? snapshot.events : [];
  const page = events.filter((event) => event.sequence > afterSequence).slice(0, limit).map((event) => canonicalClone(event));
  return deepFreeze({
    caseId: snapshot.caseId,
    caseRevision: snapshot.caseRevision,
    eventSequence: snapshot.eventSequence,
    afterSequence,
    limit,
    hasMore: events.some((event) => event.sequence > afterSequence + page.length),
    events: page,
  });
}

function projectDrive(result) {
  if (!isPlainRecord(result)) fail('mcp_owner_invalid_projection', 'Drive owner returned an invalid result');
  return canonicalClone(result);
}

function projectContext(result, maxBytes) {
  if (!isPlainRecord(result)) fail('mcp_owner_invalid_projection', 'Context owner returned an invalid result');
  const projected = canonicalClone(result);
  const bytes = bytesOf(canonicalJson(projected));
  if (bytes > maxBytes) fail('mcp_context_limit_exceeded', 'Context projection exceeds the MCP bound');
  return projected;
}

function projectCandidate(result, maxBytes) {
  if (!isPlainRecord(result)) fail('mcp_owner_invalid_projection', 'Development owner returned an invalid candidate');
  const projected = canonicalClone(result);
  if (bytesOf(canonicalJson(projected)) > maxBytes) fail('mcp_candidate_limit_exceeded', 'Candidate projection exceeds the MCP bound');
  return projected;
}

function projectPromotion(snapshot, { includeTree = false } = {}) {
  if (!isPlainRecord(snapshot)) fail('mcp_owner_invalid_projection', 'Case owner returned an invalid Promotion snapshot');
  const promotionTaskId = snapshot.plan?.promotionTaskId ?? null;
  const promotionState = promotionTaskId === null ? null : snapshot.taskStates?.[promotionTaskId] ?? null;
  const accepted = promotionState?.acceptedResult ?? null;
  const promotion = accepted === null ? null : {
    kind: typeof accepted.kind === 'string' ? accepted.kind : null,
    baseDigest: accepted.baseDigest ?? null,
    acceptedTaskIds: Array.isArray(accepted.acceptedTaskIds) ? [...accepted.acceptedTaskIds] : null,
    appliedTaskIds: Array.isArray(accepted.appliedTaskIds) ? [...accepted.appliedTaskIds] : null,
    treeDigest: accepted.treeDigest ?? null,
  };
  const result = {
    caseId: snapshot.caseId,
    caseState: snapshot.caseState,
    caseRevision: snapshot.caseRevision,
    promotionTaskId,
    promotionState: promotionState?.state ?? null,
    promotionResultDigest: promotionState?.acceptedResultDigest ?? null,
    promotion,
    canonicalDigest: snapshot.canonicalDigest,
  };
  if (includeTree) result.canonicalTree = canonicalClone(snapshot.canonicalTree ?? {});
  return deepFreeze(canonicalClone(result));
}

async function readCase(repository, caseId) {
  if (!repository || typeof repository.load !== 'function') fail('mcp_owner_unavailable', 'Case repository owner is unavailable');
  const engine = await repository.load(caseId, { reopen: false });
  if (engine === null) fail('case_not_found', `Case ${caseId} does not exist`);
  return engine.snapshot();
}

export class TdevMcpSurface {
  constructor({ manifest, auth, repository = null, driveRunner = null, developmentUnitRunner = null,
    claimLedger = null, authorize = null, owners = {}, authorizationServerMetadata = null } = {}) {
    this.manifest = normalizeMcpSurfaceManifest(manifest);
    this.auth = auth;
    this.repository = owners.repository ?? repository;
    this.driveRunner = owners.driveRunner ?? driveRunner;
    this.developmentUnitRunner = owners.developmentUnitRunner ?? developmentUnitRunner;
    this.claimLedger = owners.claimLedger ?? claimLedger;
    this.authorize = owners.authorize ?? authorize ?? auth?.authorize ?? null;
    this.owners = { ...owners };
    if (typeof this.owners.developmentUnitStart !== 'function' &&
        typeof this.owners.developmentContextGet === 'function' &&
        this.developmentUnitRunner !== null) {
      this.owners.developmentUnitStart = createDevelopmentUnitStartAdapter({
        runner: this.developmentUnitRunner,
        resolveContext: ({ contextReference, identity }) => this.owners.developmentContextGet({ selector: contextReference, identity }),
      });
    }
    this.authorizationServerMetadata = authorizationServerMetadata;
    if (!auth || typeof auth.authenticate !== 'function') fail('mcp_surface_config_invalid', 'A D0024 authentication adapter is required');
    if (auth.manifest?.profile !== undefined && auth.manifest.profile !== this.manifest.authProfileId) {
      fail('mcp_surface_auth_profile_invalid', 'Authentication adapter does not match the surface profile');
    }
    if (typeof this.authorize !== 'function') fail('mcp_surface_config_invalid', 'A tenant/Case authorization owner is required');
  }

  manifestProjection() {
    return deepFreeze(canonicalClone(this.manifest));
  }

  async #authorize(request, rpc, toolName, args) {
    const identity = await this.auth.authenticate(request, { requiredResource: this.manifest.authProfileId === MCP_AUTH_PROFILE
      ? this.auth.manifest?.mcpResource ?? undefined : undefined });
    let allowed;
    try { allowed = await this.authorize({ identity, toolName, arguments: canonicalClone(args), request: rpc }); }
    catch (cause) { fail('mcp_authorization_denied', 'Tenant authorization owner denied the request', {}, { cause }); }
    if (allowed !== true) fail('mcp_authorization_denied', 'Tenant authorization owner denied the request');
    return identity;
  }

  async #caseProjection(caseId, includeTree = false) {
    const snapshot = await readCase(this.repository, caseId);
    const result = projectSnapshot(snapshot, { includeTree });
    const bytes = bytesOf(canonicalJson(result));
    if (bytes > this.manifest.limits.maxResponseBytes) fail('mcp_response_too_large', 'Case projection exceeds the MCP response bound');
    return result;
  }

  async #tool(name, rawArgs, identity) {
    const args = validateToolArguments(name, rawArgs);
    switch (name) {
      case 'case_create': {
        if (!this.repository || typeof this.repository.create !== 'function') fail('mcp_owner_unavailable', 'Case repository owner is unavailable');
        const engine = await this.repository.create({ caseId: args.caseId, plan: args.plan, caseContract: args.caseContract ?? {} });
        return { classification: 'accepted', requestId: args.requestId, projection: projectSnapshot(engine.snapshot()) };
      }
      case 'case_get': return this.#caseProjection(args.caseId, args.includeTree === true);
      case 'case_events_get': return projectEvents(await readCase(this.repository, args.caseId), args.afterSequence, args.limit);
      case 'case_run_or_resume': {
        const expected = optionalRevision(args);
        if (expected !== null) {
          const snapshot = await readCase(this.repository, args.caseId);
          if (snapshot.caseRevision !== expected) fail('revision_conflict', 'Expected Case revision does not match the owner');
        }
        const runner = this.driveRunner ?? this.developmentUnitRunner;
        if (!runner || typeof runner.drive !== 'function') fail('mcp_owner_unavailable', 'Case-Agent drive owner is unavailable');
        return projectDrive(await runner.drive({
          caseId: args.caseId,
          driveRequestId: args.driveRequestId,
          payload: args.payload,
          requestId: args.requestId,
          principal: identity.principalId,
          tenant: identity.tenantId,
        }));
      }
      case 'task_cancel': {
        if (!this.repository || typeof this.repository.command !== 'function') fail('mcp_owner_unavailable', 'Case repository command owner is unavailable');
        const transaction = await this.repository.command(args.caseId, {
          requestId: args.requestId,
          expectedCaseRevision: optionalRevision(args) ?? undefined,
          command: { type: 'cancel_task', taskId: args.taskId, ...(args.reason === undefined ? {} : { reason: args.reason }) },
        }, { reopen: false });
        return { requestId: args.requestId, ...canonicalClone(transaction.result), persisted: transaction.persisted === true, projection: await this.#caseProjection(args.caseId) };
      }
      case 'attempt_reconcile': {
        if (!this.repository || typeof this.repository.command !== 'function') fail('mcp_owner_unavailable', 'Case repository command owner is unavailable');
        const transaction = await this.repository.command(args.caseId, {
          requestId: args.requestId,
          expectedCaseRevision: optionalRevision(args) ?? undefined,
          command: { type: 'resolve_reconciliation', attemptId: args.attemptId, decision: args.decision },
        }, { reopen: false });
        return { requestId: args.requestId, ...canonicalClone(transaction.result), persisted: transaction.persisted === true, projection: await this.#caseProjection(args.caseId) };
      }
      case 'claim_conflicts_get': {
        if (typeof this.owners.claimConflictsGet === 'function') return canonicalClone(await this.owners.claimConflictsGet({ claims: args.claims, identity }));
        if (!this.claimLedger || typeof this.claimLedger.conflictsForClaims !== 'function') fail('mcp_owner_unavailable', 'Claim conflict projection owner is unavailable');
        return canonicalClone(this.claimLedger.conflictsForClaims(args.claims));
      }
      case 'promotion_get': {
        const snapshot = await readCase(this.repository, args.caseId);
        return projectPromotion(snapshot, { includeTree: args.includeTree === true });
      }
      case 'development_context_get': {
        if (typeof this.owners.developmentContextGet !== 'function') fail('mcp_owner_unavailable', 'Development context owner is unavailable');
        return projectContext(await this.owners.developmentContextGet({ selector: args.selector ?? null, identity }), this.manifest.limits.maxContextBytes);
      }
      case 'development_unit_start': {
        if (typeof this.owners.developmentUnitStart !== 'function') fail('mcp_owner_unavailable', 'Development unit owner is unavailable');
        return projectDrive(await this.owners.developmentUnitStart({ ...args, identity }));
      }
      case 'development_unit_get': {
        const runner = this.developmentUnitRunner ?? this.driveRunner;
        if (!runner || typeof runner.candidate !== 'function') fail('mcp_owner_unavailable', 'Development unit candidate owner is unavailable');
        return projectCandidate(await runner.candidate(args.caseId), this.manifest.limits.maxCandidateBytes);
      }
      default: fail('mcp_tool_not_found', `Unknown MCP tool ${name}`);
    }
  }

  #initialize(rpc, request) {
    const protocol = rpc.params.protocolVersion;
    if (typeof protocol !== 'string' || !this.manifest.protocolVersions.includes(protocol)) {
      fail('mcp_protocol_unsupported', 'Requested MCP protocol version is not supported');
    }
    assertRecordShape(rpc.params, ['protocolVersion', 'capabilities', 'clientInfo'], [], 'initialize params');
    if (!isPlainRecord(rpc.params.capabilities) || !isPlainRecord(rpc.params.clientInfo)) fail('mcp_initialize_invalid', 'initialize capabilities/clientInfo must be records');
    assertRecordShape(rpc.params.clientInfo, ['name', 'version'], [], 'initialize clientInfo');
    assertScalarString(rpc.params.clientInfo.name, 'initialize clientInfo.name');
    assertScalarString(rpc.params.clientInfo.version, 'initialize clientInfo.version');
    const header = protocolHeader(request);
    if (header !== null && header !== protocol) fail('mcp_protocol_mismatch', 'MCP protocol header does not match initialize');
    return {
      protocolVersion: protocol,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'tdev', version: this.manifest.surfaceDigest.slice('sha256:'.length, 'sha256:'.length + 12) },
    };
  }

  async #rpc(request, rpc) {
    if (!Object.hasOwn(rpc, 'id')) {
      if (rpc.method !== 'notifications/initialized') fail('mcp_invalid_rpc', 'Only notifications/initialized is accepted without an id');
      await this.#authorize(request, rpc, 'notifications/initialized', rpc.params);
      return null;
    }
    if (rpc.method === 'initialize') {
      await this.#authorize(request, rpc, 'initialize', rpc.params);
      return this.#initialize(rpc, request);
    }
    const header = protocolHeader(request);
    if (header === null || !this.manifest.protocolVersions.includes(header)) fail('mcp_protocol_required', 'A supported MCP-Protocol-Version header is required after initialize');
    const identity = await this.#authorize(request, rpc, rpc.method === 'tools/call' ? rpc.params?.name ?? 'tools/call' : rpc.method, rpc.params);
    if (rpc.method === 'tools/list') {
      assertRecordShape(rpc.params, [], ['cursor'], 'tools/list params');
      if (rpc.params.cursor !== undefined) fail('mcp_cursor_unsupported', 'This stateless surface has no resumable tool cursor');
      return { tools: canonicalClone(this.manifest.tools) };
    }
    if (rpc.method === 'tools/call') {
      assertRecordShape(rpc.params, ['name'], ['arguments'], 'tools/call params');
      if (typeof rpc.params.name !== 'string' || !TOOL_NAMES.includes(rpc.params.name)) fail('mcp_tool_not_found', 'Requested MCP tool is not exposed');
      const result = await this.#tool(rpc.params.name, rpc.params.arguments ?? {}, identity);
      const structuredContent = canonicalClone(result);
      return {
        content: [{ type: 'text', text: canonicalJson(structuredContent) }],
        structuredContent,
        isError: false,
      };
    }
    fail('mcp_method_not_found', `Unknown MCP method ${rpc.method}`);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (MCP_AUTH_RESOURCE_METADATA_PATHS.includes(url.pathname)) {
      if (request.method !== 'GET') return jsonResponse(405, { error: { code: 'mcp_method_not_allowed' } }, { allow: 'GET' });
      const metadata = typeof this.auth.discovery === 'function'
        ? this.auth.discovery().protectedResource
        : mcpAuthProtectedResourceMetadata(this.auth.manifest);
      return jsonResponse(200, metadata);
    }
    if (url.pathname === MCP_AUTH_SERVER_METADATA_PATH) {
      if (request.method !== 'GET') return jsonResponse(405, { error: { code: 'mcp_method_not_allowed' } }, { allow: 'GET' });
      const metadata = this.authorizationServerMetadata ?? this.auth.discovery?.().authorizationServer;
      if (metadata === null || metadata === undefined) return jsonResponse(404, { error: { code: 'mcp_auth_metadata_unavailable' } });
      return jsonResponse(200, metadata);
    }
    if (url.pathname !== this.manifest.route) return jsonResponse(404, { error: { code: 'mcp_not_found' } });
    if (request.method !== 'POST') return jsonResponse(405, { error: { code: 'mcp_method_not_allowed' } }, { allow: 'POST' });
    let rpc;
    try {
      rpc = rpcRequest(await readBoundedBody(request, this.manifest.limits.maxRequestBytes));
      const result = await this.#rpc(request, rpc);
      if (result === null) return new Response(null, { status: 202, headers: { 'cache-control': 'no-store' } });
      const response = { jsonrpc: '2.0', id: rpc.id, result };
      const encoded = canonicalJson(response);
      if (bytesOf(encoded) > this.manifest.limits.maxResponseBytes) fail('mcp_response_too_large', 'MCP response exceeds the configured byte bound');
      return jsonResponse(200, response, { 'mcp-protocol-version': rpc.method === 'initialize' ? rpc.params.protocolVersion : protocolHeader(request) });
    } catch (error) {
      const status = errorStatus(error);
      const response = rpcError(rpc?.id, -32000, errorMessage(error), safeErrorCode(error));
      const headers = {};
      if (status === 401) headers['www-authenticate'] = `Bearer resource="${this.auth.manifest?.mcpResource ?? ''}"`;
      return jsonResponse(status, response, headers);
    }
  }
}

export function createTdevMcpSurface(options) {
  return new TdevMcpSurface(options);
}

export function createTdevMcpWorker(options) {
  const surface = options instanceof TdevMcpSurface ? options : new TdevMcpSurface(options);
  return Object.freeze({ surface, fetch: (request) => surface.fetch(request) });
}
