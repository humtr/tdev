import {
  ContractError,
  assertIdentifier,
  assertRecordShape,
  assertSafeInteger,
  publicJsonClone,
  strictJsonParse,
} from '../src/canonical.mjs';
import { AGENT_ROUTE_LEGACY_HOST_PROFILE, agentRouteHostKey } from '../src/agent-route-election.mjs';
import { QUALIFICATION_RPC_PROFILE } from './installable-agent-qualification-r4.mjs';

export const D0044_PROVIDER_QUALIFICATION_PROFILE = 'tdev.agent-route-election-qualification.v1';
export const D0044_PROVIDER_DIAGNOSTIC_PROFILE = 'tdev.d0044-provider-diagnostic.v1';
export const D0044_ELECTION_QUALIFICATION_PATH = '/qualification/d0044/election/v1';
export const D0044_DELIVERY_QUALIFICATION_PATH = '/qualification/d0044/delivery/v1';
const MAX_REQUEST_BYTES = 1024 * 1024;
const MIN_TOKEN_BYTES = 32;
const MAX_TOKEN_BYTES = 512;

const ELECTION_OPERATIONS = Object.freeze(new Set([
  'readAgentRouteElection',
  'd0044_election_diagnostic',
  'createAgentRouteGenesis',
  'importLegacyAgentRoute',
  'prepareAgentRouteCutover',
  'recordAgentRoutePredecessorExclusion',
  'recordAgentRouteSuccessorStandby',
  'commitAgentRouteCutover',
  'commitAgentRouteCutoverResponseLoss',
  'd0044CommitAgentRouteCutoverReplayDiagnostic',
]));

const ELECTION_PAYLOAD_SHAPES = Object.freeze({
  d0044_election_diagnostic: [[], []],
  readAgentRouteElection: [[], []],
  createAgentRouteGenesis: [['genesis', 'signature'], []],
  importLegacyAgentRoute: [['record', 'recoverySignature', 'managementSignature', 'managementPublicJwk'], []],
  prepareAgentRouteCutover: [['intent', 'signature'], []],
  recordAgentRoutePredecessorExclusion: [['cutoverRequestId', 'predecessorExclusionDigest'], []],
  recordAgentRouteSuccessorStandby: [['cutoverRequestId', 'successorStandbyDigest'], []],
  commitAgentRouteCutover: [['cutoverRequestId'], []],
  commitAgentRouteCutoverResponseLoss: [['cutoverRequestId'], []],
  d0044CommitAgentRouteCutoverReplayDiagnostic: [['cutoverRequestId'], []],
});

const DELIVERY_OPERATIONS = new Set([
  'd0044_constructor_diagnostic',
  'd0040_evidence_attestor_readback',
  'read_installable_agent',
  'read_route_generation',
  'read',
  'runtime_probe',
  'initialize',
  'initialize_route_generation',
  'migrate_installable_agent_route',
  'prepare_legacy_route_import',
  'seal_legacy_route_import',
  'begin_route_draining',
  'retire_route',
  'activate_route',
  'd0044_pitr_get_current_bookmark',
  'd0044_pitr_clear_storage',
  'd0044_pitr_restore_next_session',
]);
const LEGACY_IMPORT_OPERATIONS = new Set([
  'd0044_constructor_diagnostic',
  'd0040_evidence_attestor_readback',
  'read_installable_agent',
  'read_route_generation',
  'read',
  'runtime_probe',
  'initialize',
  'initialize_route_generation',
  'migrate_installable_agent_route',
  'prepare_legacy_route_import',
  'seal_legacy_route_import',
  'begin_route_draining',
  'retire_route',
  'activate_route',
  'd0044_pitr_get_current_bookmark',
  'd0044_pitr_clear_storage',
  'd0044_pitr_restore_next_session',
]);

function fail(code, message) {
  throw new ContractError(code, message);
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

function publicError(error) {
  const code = error instanceof ContractError ? error.code : 'qualification_provider_failure';
  const status = code === 'qualification_unauthorized' ? 401 : code === 'qualification_method_not_allowed' ? 405 : 400;
  return jsonResponse(status, { ok: false, error: { code } });
}

function rpcJsonClone(value) {
  let encoded;
  try { encoded = JSON.stringify(value); }
  catch (cause) { throw new ContractError('invalid_qualification_provider', 'D0044 provider RPC result is not JSON-serializable', {}, { cause }); }
  if (typeof encoded !== 'string') fail('invalid_qualification_provider', 'D0044 provider RPC result is not JSON-serializable');
  return strictJsonParse(encoded, { maxBytes: MAX_REQUEST_BYTES });
}

function diagnosticFailure(error) {
  const name = typeof error?.name === 'string' && /^[A-Za-z][A-Za-z0-9_$]{0,63}$/.test(error.name) ? error.name : 'unknown';
  const code = typeof error?.code === 'string' && /^[a-z][a-z0-9_]{0,127}$/.test(error.code) ? error.code : null;
  return { name, code };
}
async function diagnoseElectionPipeline(stub, input) {
  const pipeline = { rpcReturned: false, cloneSucceeded: false };
  try {
    const raw = await stub.readAgentRouteElection(input.agentId);
    pipeline.rpcReturned = true;
    try {
      rpcJsonClone(raw);
      pipeline.cloneSucceeded = true;
    } catch (error) {
      pipeline.cloneFailure = diagnosticFailure(error);
    }
  } catch (error) {
    pipeline.rpcFailure = diagnosticFailure(error);
  }
  return pipeline;
}


async function diagnoseDeliveryPipeline(stub, input) {
  const pipeline = { rpcReturned: false, unwrapSucceeded: false, cloneSucceeded: false };
  try {
    const raw = await stub.qualificationInvoke({ ...input.rpc, operation: 'd0040_evidence_attestor_readback' });
    pipeline.rpcReturned = true;
    try {
      const result = unwrapDeliveryRpc(raw);
      pipeline.unwrapSucceeded = true;
      try {
        rpcJsonClone(result);
        pipeline.cloneSucceeded = true;
      } catch (error) {
        pipeline.cloneFailure = diagnosticFailure(error);
      }
    } catch (error) {
      pipeline.unwrapFailure = diagnosticFailure(error);
    }
  } catch (error) {
    pipeline.rpcFailure = diagnosticFailure(error);
  }
  return pipeline;
}

function tokenBytes(token) {
  return typeof token === 'string' ? new TextEncoder().encode(token).byteLength : 0;
}

async function equalSecret(left, right) {
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(left)),
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let difference = left.length ^ right.length;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
}

async function authorize(request, token) {
  const authorization = request.headers.get('authorization') ?? '';
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';
  if (!(await equalSecret(supplied, token))) fail('qualification_unauthorized', 'D0044 qualification authentication failed');
}

async function readJson(request) {
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_REQUEST_BYTES) fail('qualification_request_too_large', 'D0044 qualification request exceeds its byte bound');
  try {
    return strictJsonParse(bytes, { maxBytes: MAX_REQUEST_BYTES });
  } catch (cause) {
    if (cause instanceof ContractError) throw cause;
    throw new ContractError('qualification_invalid_json', 'D0044 qualification request is not valid JSON', {}, { cause });
  }
}

function namespaceStub(namespace, name, label) {
  if (!namespace || typeof namespace.idFromName !== 'function' || typeof namespace.get !== 'function') {
    fail('invalid_qualification_provider', `${label} namespace binding is unavailable`);
  }
  const id = namespace.idFromName(name);
  if (!id || typeof id.toString !== 'function' || (id.jurisdiction ?? 'global') !== 'global') {
    fail('invalid_qualification_provider', `${label} namespace returned an invalid identity`);
  }
  const stub = namespace.get(id);
  if (!stub || (typeof stub !== 'object' && typeof stub !== 'function')) {
    fail('invalid_qualification_provider', `${label} namespace returned an invalid stub`);
  }
  return stub;
}

function electionInput(body) {
  assertRecordShape(body, ['profile', 'operation', 'agentId', 'payload'], [], 'D0044 election qualification request');
  if (body.profile !== D0044_PROVIDER_QUALIFICATION_PROFILE) fail('invalid_qualification_rpc_profile', 'D0044 qualification profile is unsupported');
  assertIdentifier(body.agentId, 'agentId');
  if (!ELECTION_OPERATIONS.has(body.operation)) fail('qualification_unknown_operation', 'D0044 election operation is unsupported');
  const shape = ELECTION_PAYLOAD_SHAPES[body.operation];
  assertRecordShape(body.payload, shape[0], shape[1], `D0044 election ${body.operation} payload`);
  return body;
}

function deliveryInput(body) {
  assertRecordShape(body, ['profile', 'routeHostKey', 'rpc'], [], 'D0044 delivery qualification request');
  if (body.profile !== D0044_PROVIDER_QUALIFICATION_PROFILE) fail('invalid_qualification_rpc_profile', 'D0044 qualification profile is unsupported');
  if (typeof body.routeHostKey !== 'string' || body.routeHostKey.length === 0 || body.routeHostKey.includes('\0')) {
    fail('invalid_agent_route_host_key', 'D0044 routeHostKey is invalid');
  }
  assertRecordShape(body.rpc, ['profile', 'operation', 'agentId', 'routeGeneration'], [
    'expectedDeploymentIdentityDigest', 'initialization', 'generation', 'state', 'request', 'nowMs', 'electionState', 'intent', 'signature', 'exclusion', 'record', 'recoverySignature', 'managementSignature', 'managementPublicJwk', 'routeProvisioningTarget', 'routeProvisioningTargetDigest', 'routeProvisioningTransactionId', 'routeProvisioningRequestDigest', 'bookmark',
  ], 'D0044 delivery qualification RPC');
  if (body.rpc.profile !== QUALIFICATION_RPC_PROFILE) fail('invalid_qualification_rpc_profile', 'D0020 qualification profile is unsupported');
  assertIdentifier(body.rpc.agentId, 'agentId');
  assertSafeInteger(body.rpc.routeGeneration, 'routeGeneration', { min: 1 });
  if (!DELIVERY_OPERATIONS.has(body.rpc.operation)) fail('qualification_unknown_operation', 'D0044 delivery operation is unsupported');
  const expectedHostKey = agentRouteHostKey({ agentId: body.rpc.agentId, routeGeneration: body.rpc.routeGeneration });
  const legacyImportHost = body.rpc.routeGeneration === 1 &&
    body.routeHostKey === body.rpc.agentId && LEGACY_IMPORT_OPERATIONS.has(body.rpc.operation);
  if (body.routeHostKey !== expectedHostKey && !legacyImportHost) {
    fail('agent_route_host_key_mismatch', 'D0044 delivery host key is not generation-bound');
  }
  if (legacyImportHost && body.routeHostKey !== body.rpc.agentId) {
    fail('agent_route_host_key_mismatch', `${AGENT_ROUTE_LEGACY_HOST_PROFILE} host identity is invalid`);
  }
  return body;
}

async function invokeElection(stub, operation, agentId, payload) {
  switch (operation) {
    case 'readAgentRouteElection': return stub.readAgentRouteElection(agentId);
    case 'createAgentRouteGenesis': return stub.createAgentRouteGenesis(agentId, payload);
    case 'importLegacyAgentRoute': return stub.importLegacyAgentRoute(agentId, payload);
    case 'prepareAgentRouteCutover': return stub.prepareAgentRouteCutover(agentId, payload);
    case 'recordAgentRoutePredecessorExclusion': return stub.recordAgentRoutePredecessorExclusion(agentId, payload);
    case 'recordAgentRouteSuccessorStandby': return stub.recordAgentRouteSuccessorStandby(agentId, payload);
    case 'commitAgentRouteCutover': return stub.commitAgentRouteCutover(agentId, payload);
    case 'commitAgentRouteCutoverResponseLoss': return stub.commitAgentRouteCutoverResponseLoss(agentId, payload);
    case 'd0044CommitAgentRouteCutoverReplayDiagnostic': return stub.d0044CommitAgentRouteCutoverReplayDiagnostic(agentId, payload);
    default: fail('qualification_unknown_operation', 'D0044 election operation is unsupported');
  }
}

function unwrapDeliveryRpc(response) {
  assertRecordShape(response, ['profile', 'schemaVersion', 'ok'], ['result', 'error'], 'D0020 qualification RPC response');
  if (response.profile !== QUALIFICATION_RPC_PROFILE || response.schemaVersion !== 2 || typeof response.ok !== 'boolean') fail('invalid_qualification_provider', 'D0020 qualification RPC response header is invalid');
  if (response.ok) {
    assertRecordShape(response, ['profile', 'schemaVersion', 'ok', 'result'], [], 'D0020 qualification RPC success');
    return response.result;
  }
  assertRecordShape(response, ['profile', 'schemaVersion', 'ok', 'error'], [], 'D0020 qualification RPC failure');
  assertRecordShape(response.error, ['code'], [], 'D0020 qualification RPC error');
  throw new ContractError(response.error.code, 'D0020 qualification authority rejected the operation');
}


export class D0044ProviderQualificationService {
  constructor(env) {
    if (env?.TDEV_D0020_QUALIFICATION_MODE !== 'enabled' || env?.TDEV_ENVIRONMENT !== 'qualification' || env?.TDEV_AGENT_ROUTE_MODE !== 'elected_v1') {
      fail('qualification_mode_disabled', 'D0044 provider qualification requires an enabled elected qualification lane');
    }
    const token = env?.TDEV_D0020_QUALIFICATION_TOKEN;
    if (tokenBytes(token) < MIN_TOKEN_BYTES || tokenBytes(token) > MAX_TOKEN_BYTES || token.includes?.('\0')) {
      fail('invalid_qualification_config', 'D0044 qualification token binding is invalid');
    }
    this.env = env;
    this.token = token;
  }

  async fetch(request) {
    try {
      if (request.method !== 'POST') throw new ContractError('qualification_method_not_allowed', 'D0044 qualification requires POST');
      await authorize(request, this.token);
      const body = await readJson(request);
      const url = new URL(request.url);
      if (url.pathname === D0044_ELECTION_QUALIFICATION_PATH) {
        const input = electionInput(body);
        const stub = namespaceStub(this.env.TDEV_AGENT_ROUTE_ELECTION, input.agentId, 'election');
        if (input.operation === 'd0044_election_diagnostic') {
          if (typeof stub.d0044ElectionDiagnosticInvoke !== 'function') fail('invalid_qualification_provider', 'Election namespace does not expose D0044 diagnostic RPC');
          const diagnostic = await stub.d0044ElectionDiagnosticInvoke(input.agentId);
          assertRecordShape(diagnostic, ['profile', 'schemaVersion', 'ok', 'result'], [], 'D0044 election diagnostic response');
          if (diagnostic.profile !== D0044_PROVIDER_DIAGNOSTIC_PROFILE || diagnostic.schemaVersion !== 1 || diagnostic.ok !== true) fail('invalid_qualification_provider', 'D0044 election diagnostic response header is invalid');
          const pipeline = await diagnoseElectionPipeline(stub, input);
          return jsonResponse(200, { ok: true, result: publicJsonClone({ ...diagnostic.result, pipeline }) });
        }
        const result = await invokeElection(stub, input.operation, input.agentId, publicJsonClone(input.payload));
        return jsonResponse(200, { ok: true, result: rpcJsonClone(result) });
      }
      if (url.pathname === D0044_DELIVERY_QUALIFICATION_PATH) {
        const input = deliveryInput(body);
        const stub = namespaceStub(this.env.TDEV_AGENT_DELIVERY, input.routeHostKey, 'delivery');
        if (input.rpc.operation === 'd0044_constructor_diagnostic') {
          if (typeof stub.d0044DiagnosticInvoke !== 'function') fail('invalid_qualification_provider', 'Delivery namespace does not expose D0044 diagnostic RPC');
          const diagnostic = await stub.d0044DiagnosticInvoke(input.rpc.agentId, input.rpc.routeGeneration);
          assertRecordShape(diagnostic, ['profile', 'schemaVersion', 'ok', 'result'], [], 'D0044 diagnostic response');
          if (diagnostic.profile !== D0044_PROVIDER_DIAGNOSTIC_PROFILE || diagnostic.schemaVersion !== 1 || diagnostic.ok !== true) fail('invalid_qualification_provider', 'D0044 diagnostic response header is invalid');
          const pipeline = typeof stub.qualificationInvoke === 'function' ? await diagnoseDeliveryPipeline(stub, input) : null;
          return jsonResponse(200, { ok: true, result: publicJsonClone({ ...diagnostic.result, ...(pipeline === null ? {} : { pipeline }) }) });
        }
        if (typeof stub.qualificationInvoke !== 'function') fail('invalid_qualification_provider', 'Delivery namespace does not expose qualification RPC');
        const result = unwrapDeliveryRpc(await stub.qualificationInvoke(publicJsonClone(input.rpc)));
        return jsonResponse(200, { ok: true, result: rpcJsonClone(result) });
      }
      return jsonResponse(404, { ok: false, error: { code: 'qualification_not_found' } });
    } catch (error) {
      return publicError(error);
    }
  }
}
