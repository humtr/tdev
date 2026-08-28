import {
  ContractError,
  assertDigest,
  assertIdentifier,
  assertRecordShape,
  assertSafeInteger,
  publicJsonClone,
  strictJsonParse,
} from '../src/canonical.mjs';
import {
  INSTALLABLE_AGENT_CONNECT_POSSESSION_PROFILE,
  decodeBase64Url,
  encodeBase64Url,
  installableAgentCredentialKeyId,
  installableAgentManagementKeyId,
  installableAgentReleaseSignerKeyId,
  normalizeConnectPossessionContext,
  verifyEd25519SignedRecord,
  verifyRsa3072SignedRecord,
} from '../src/installable-agent-security.mjs';
import {
  AGENT_DELIVERY_WEBSOCKET_PATH,
  AGENT_DELIVERY_WEBSOCKET_PROTOCOL,
  AgentDeliveryRuntimeService,
  AgentDeliveryRuntimeDOHost,
  createRuntimeAgentRouteBinding,
  readAgentDeliveryRuntimeConfig,
} from '../src/cloudflare-agent-delivery-runtime.mjs';
import {
  QUALIFICATION_RPC_PROFILE,
  READ_ONLY_QUALIFICATION_OPERATIONS,
  assertExpectedDeploymentIdentity,
  createQualificationDeploymentIdentity,
  qualificationDeploymentIdentityDigest,
  qualificationRouteVerifierDigest,
} from './installable-agent-qualification-r4.mjs';
import { admitQualificationRouteBootstrap } from './installable-agent-qualification-r9.mjs';

export const D0020_QUALIFICATION_PATH = '/qualification/d0020/v2';
export const D0020_QUALIFICATION_MAX_REQUEST_BYTES = 1024 * 1024;
export const D0020_QUALIFICATION_MODE = 'enabled';

const QUALIFICATION_RPC_SCHEMA_VERSION = 2;
const MIN_TOKEN_BYTES = 32;
const MAX_TOKEN_BYTES = 512;
const textEncoder = new TextEncoder();
const ROUTE_BOOTSTRAP_OPERATIONS = new Set([
  'migrate_installable_agent_route',
  'register_installable_agent',
  'record_installable_agent_genesis_evidence',
  'accept_legacy_predecessor_quiescence',
  'initial_activate_installable_agent',
  'fail_installable_agent_genesis',
]);
function corruptedSignature(value, label) {
  const bytes = decodeBase64Url(value, label);
  bytes[0] ^= 0x01;
  return encodeBase64Url(bytes);
}

async function requireCryptographicRejection(operation, label) {
  try { await operation(); }
  catch (error) {
    if (error instanceof ContractError && error.code === 'signature_verification_failed') return;
    throw error;
  }
  throw new ContractError('qualification_crypto_negative_vector_accepted', `${label} negative vector was accepted`);
}

export async function runInstallableAgentWorkersCryptoProbe(vectors) {
  assertRecordShape(vectors, ['rsaPossession', 'management', 'release'], [], 'D0039 Workers crypto vectors');
  assertRecordShape(vectors.rsaPossession, ['publicJwk', 'context', 'signature'], [], 'D0039 RSA possession vector');
  assertRecordShape(vectors.management, ['publicJwk', 'record', 'signature'], [], 'D0039 management vector');
  assertRecordShape(vectors.release, ['publicJwk', 'record', 'signature'], [], 'D0039 release vector');
  const context = normalizeConnectPossessionContext(vectors.rsaPossession.context);
  await verifyRsa3072SignedRecord({
    domain: INSTALLABLE_AGENT_CONNECT_POSSESSION_PROFILE,
    record: context,
    signature: vectors.rsaPossession.signature,
    publicJwk: vectors.rsaPossession.publicJwk,
  });
  await requireCryptographicRejection(() => verifyRsa3072SignedRecord({
    domain: INSTALLABLE_AGENT_CONNECT_POSSESSION_PROFILE,
    record: context,
    signature: corruptedSignature(vectors.rsaPossession.signature, 'RSA qualification signature'),
    publicJwk: vectors.rsaPossession.publicJwk,
  }), 'RSA-3072 mutation');
  await requireCryptographicRejection(() => verifyRsa3072SignedRecord({
    domain: 'tdev.agent-management.v1',
    record: context,
    signature: vectors.rsaPossession.signature,
    publicJwk: vectors.rsaPossession.publicJwk,
  }), 'RSA domain confusion');

  for (const [label, vector, domain] of [
    ['management', vectors.management, 'tdev.agent-management.v1'],
    ['release', vectors.release, 'tdev.installable-agent-release-statement.v1'],
  ]) {
    await verifyEd25519SignedRecord({ domain, record: vector.record, signature: vector.signature, publicJwk: vector.publicJwk });
    await requireCryptographicRejection(() => verifyEd25519SignedRecord({
      domain,
      record: vector.record,
      signature: corruptedSignature(vector.signature, `${label} qualification signature`),
      publicJwk: vector.publicJwk,
    }), `${label} mutation`);
    await requireCryptographicRejection(() => verifyEd25519SignedRecord({
      domain: label === 'management' ? 'tdev.installable-agent-release-statement.v1' : 'tdev.agent-management.v1',
      record: vector.record,
      signature: vector.signature,
      publicJwk: vector.publicJwk,
    }), `${label} domain confusion`);
  }
  return Object.freeze({
    proofLayer: 'deployed_workers_runtime',
    algorithms: Object.freeze({ rsa: 'RSASSA-PKCS1-v1_5/SHA-256/3072', management: 'Ed25519', release: 'Ed25519' }),
    keyIds: Object.freeze({
      credential: installableAgentCredentialKeyId(vectors.rsaPossession.publicJwk),
      management: installableAgentManagementKeyId(vectors.management.publicJwk),
      release: installableAgentReleaseSignerKeyId(vectors.release.publicJwk),
    }),
    negativeVectors: Object.freeze({ mutation: true, domainConfusion: true }),
  });
}

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
    throw new ContractError('qualification_request_too_large', 'D0020 qualification request exceeds its byte limit', { maxBytes: D0020_QUALIFICATION_MAX_REQUEST_BYTES });
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > D0020_QUALIFICATION_MAX_REQUEST_BYTES) {
    throw new ContractError('qualification_request_too_large', 'D0020 qualification request exceeds its byte limit', { maxBytes: D0020_QUALIFICATION_MAX_REQUEST_BYTES });
  }
  try { return strictJsonParse(bytes, { maxBytes: D0020_QUALIFICATION_MAX_REQUEST_BYTES }); }
  catch (cause) { throw new ContractError('qualification_invalid_request', 'D0020 qualification request body is invalid', {}, { cause }); }
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
  });
}

function errorStatus(code) {
  if (code === 'qualification_unauthorized' || code === 'agent_authentication_failed') return 401;
  if (code === 'qualification_mode_disabled' || code === 'invalid_qualification_config') return 503;
  if (code.endsWith('_conflict') || code.includes('stale_')) return 409;
  return 400;
}

function publicError(error) {
  if (error instanceof ContractError) return jsonResponse(errorStatus(error.code), { ok: false, error: { code: error.code, details: error.details } });
  return jsonResponse(500, { ok: false, error: { code: 'qualification_provider_failure', details: {} } });
}

function rpcShape(input) {
  if (!input || typeof input.operation !== 'string') throw new ContractError('qualification_unknown_operation', 'D0020 qualification operation is invalid');
  const shapes = {
    runtime_probe: [[], []],
    d0040_evidence_attestor_readback: [[], []],
    d0039_workers_crypto_probe: [['vectors'], []],
    d0039_security_readback: [[], []],
    read_installable_agent: [[], []],
    issue_installable_agent_connect_challenge: [['request'], ['nowMs']],
    migrate_installable_agent_route: [['request'], []],
    register_installable_agent: [['request'], []],
    record_installable_agent_genesis_evidence: [['request'], []],
    accept_legacy_predecessor_quiescence: [['request'], []],
    initial_activate_installable_agent: [['request'], []],
    fail_installable_agent_genesis: [['request'], []],
    record_installable_agent_transaction_evidence: [['request'], []],
    mutate_installable_agent_trust: [['request'], []],
    begin_credential_rotation: [['request'], []],
    commit_credential_rotation: [['request'], []],
    revoke_installable_agent_credential: [['request'], []],
    begin_base_stop: [['request'], []],
    complete_base_stop: [['request'], []],
    prepare_base_start: [['request'], []],
    commit_base_start: [['request'], []],
    begin_package_activation: [['request'], []],
    commit_package_activation: [['request'], []],
    begin_installable_agent_replacement: [['request'], []],
    commit_installable_agent_replacement: [['request'], []],
    begin_installable_agent_uninstall: [['request'], []],
    complete_installable_agent_uninstall: [['request'], []],
    compact_installable_agent_management_receipts: [['request'], []],
    initialize: [[], ['initialization']],
    read: [[], []],
    reserve: [['request', 'nowMs'], []],
    release_reservation: [['request', 'nowMs'], []],
    expire_reservation: [['request', 'nowMs'], []],
    roll_reservation_window: [['request', 'nowMs'], []],
    activate_delivery: [['request', 'nowMs'], []],
    grant_command: [['deliveryId'], ['dispatchOrdinal']],
    close_undispatched_delivery: [['deliveryId'], ['nowMs']],
    bind_terminal_case_receipt: [['request', 'nowMs'], []],
    reacquire_delivery_admission: [['request'], []],
    send_dispatch: [['authorization', 'executableBody'], []],
    abort_instance: [[], []],
  };
  const shape = shapes[input.operation];
  if (!shape) throw new ContractError('qualification_unknown_operation', 'D0020 qualification operation is unsupported');
  const routeBootstrap = ROUTE_BOOTSTRAP_OPERATIONS.has(input.operation);
  const mutationKeys = READ_ONLY_QUALIFICATION_OPERATIONS.has(input.operation)
    ? []
    : routeBootstrap
      ? ['routeBootstrapTarget', 'routeBootstrapTargetDigest', 'routeBootstrapTransactionId', 'routeBootstrapRequestDigest']
      : ['expectedDeploymentIdentityDigest'];
  assertRecordShape(input, ['profile', 'operation', 'agentId', 'routeGeneration', ...mutationKeys, ...shape[0]], shape[1], 'D0020 qualification ' + input.operation);
  if (input.profile !== QUALIFICATION_RPC_PROFILE) throw new ContractError('invalid_qualification_rpc_profile', 'D0039 qualification requires the Revision-4 RPC profile');
  assertIdentifier(input.agentId, 'agentId');
  assertSafeInteger(input.routeGeneration, 'routeGeneration', { min: 1 });
  if (routeBootstrap) {
    assertIdentifier(input.routeBootstrapTransactionId, 'routeBootstrapTransactionId');
    assertDigest(input.routeBootstrapTargetDigest, 'routeBootstrapTargetDigest');
    assertDigest(input.routeBootstrapRequestDigest, 'routeBootstrapRequestDigest');
  } else if (!READ_ONLY_QUALIFICATION_OPERATIONS.has(input.operation)) {
    assertDigest(input.expectedDeploymentIdentityDigest, 'expectedDeploymentIdentityDigest');
  }
  return input.operation;
}

function unwrapQualificationRpc(response) {
  assertRecordShape(response, ['profile', 'schemaVersion', 'ok'], ['result', 'error'], 'D0020 qualification RPC response');
  if (response.profile !== QUALIFICATION_RPC_PROFILE || response.schemaVersion !== QUALIFICATION_RPC_SCHEMA_VERSION || typeof response.ok !== 'boolean') {
    throw new ContractError('invalid_qualification_provider', 'D0020 qualification RPC response header is invalid');
  }
  if (response.ok) {
    assertRecordShape(response, ['profile', 'schemaVersion', 'ok', 'result'], [], 'D0020 qualification RPC success');
    return response.result;
  }
  assertRecordShape(response, ['profile', 'schemaVersion', 'ok', 'error'], [], 'D0020 qualification RPC failure');
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
    this.runtimeService = new AgentDeliveryRuntimeService(env);
  }

  #route(agentId) {
    assertIdentifier(agentId, 'agentId');
    const id = this.namespace.idFromName(agentId);
    if (!id || typeof id.toString !== 'function') throw new ContractError('invalid_qualification_provider', 'Agent delivery namespace returned an invalid identity');
    const providerJurisdiction = id.jurisdiction ?? 'global';
    if (providerJurisdiction !== this.runtimeConfig.placement.jurisdiction) throw new ContractError('invalid_qualification_provider', 'Agent delivery identity has the wrong jurisdiction');
    const stub = this.namespace.get(id);
    if (!stub || (typeof stub !== 'object' && typeof stub !== 'function') || typeof stub.fetch !== 'function' || typeof stub.qualificationInvoke !== 'function') {
      throw new ContractError('invalid_qualification_provider', 'Agent delivery namespace returned an invalid stub');
    }
    return { id, stub };
  }

  async fetch(request) {
    try {
      const url = new URL(request.url);
      if (url.pathname === AGENT_DELIVERY_WEBSOCKET_PATH) return this.runtimeService.fetch(request);
      if (url.pathname !== D0020_QUALIFICATION_PATH) return jsonResponse(404, { ok: false, error: { code: 'qualification_not_found', details: {} } });
      if (request.method !== 'POST') return jsonResponse(405, { ok: false, error: { code: 'qualification_method_not_allowed', details: {} } });
      await authorizeQualificationRequest(request, this.token);
      const input = await readRequest(request);
      rpcShape(input);
      const result = unwrapQualificationRpc(await this.#route(input.agentId).stub.qualificationInvoke(publicJsonClone(input)));
      return jsonResponse(200, { ok: true, result });
    } catch (error) { return publicError(error); }
  }
}

export class D0020QualificationAgentDeliveryDOHost {
  constructor(ctx, env, options = {}) {
    requiredQualificationMode(env);
    if (!ctx || typeof ctx.abort !== 'function') throw new ContractError('invalid_qualification_config', 'D0020 qualification requires Durable Object abort support');
    this.ctx = ctx;
    this.env = env;
    this.host = options.host ?? new AgentDeliveryRuntimeDOHost(ctx, env, {
      verifyInstallableAgentEvidence: options.verifyInstallableAgentEvidence ?? null,
    });
    const sourceSha = env?.TDEV_SOURCE_SHA;
    if (typeof sourceSha !== 'string' || !/^[0-9a-f]{40}$/.test(sourceSha)) throw new ContractError('invalid_qualification_config', 'D0020 qualification source SHA binding is invalid');
    const versionId = env?.TDEV_WORKER_VERSION?.id;
    if (typeof versionId !== 'string' || versionId.length === 0 || versionId.length > 256 || versionId.includes('\0')) throw new ContractError('invalid_qualification_config', 'D0039 qualification requires the immutable Worker version identity');
    if (typeof this.host.durableObjectId !== 'string' || this.host.durableObjectId.length === 0 || this.host.durableObjectId.includes('\0')) throw new ContractError('invalid_qualification_provider', 'D0020 Agent delivery host has no durable object identity');
    const requiredText = (name, max = 2048) => {
      const value = env?.[name];
      if (typeof value !== 'string' || value.length === 0 || value.length > max || value.includes('\0')) throw new ContractError('invalid_qualification_config', `D0039 qualification binding ${name} is invalid`);
      return value;
    };
    const artifactDigest = requiredText('TDEV_D0039_ARTIFACT_DIGEST', 80);
    const artifactManifestDigest = requiredText('TDEV_D0039_ARTIFACT_MANIFEST_DIGEST', 80);
    assertDigest(artifactDigest, 'TDEV_D0039_ARTIFACT_DIGEST');
    assertDigest(artifactManifestDigest, 'TDEV_D0039_ARTIFACT_MANIFEST_DIGEST');
    const qualificationEndpointOrigin = requiredText('TDEV_D0039_QUALIFICATION_ENDPOINT_ORIGIN');
    let endpoint;
    try { endpoint = new URL(qualificationEndpointOrigin); }
    catch (cause) { throw new ContractError('invalid_qualification_config', 'D0039 qualification endpoint origin is invalid', {}, { cause }); }
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash || endpoint.origin !== qualificationEndpointOrigin) throw new ContractError('invalid_qualification_config', 'D0039 qualification endpoint must be a credential-free HTTPS origin');
    if (env?.TDEV_D0039_STATE_CHANGING_TRAFFIC_PERCENTAGE !== '100') throw new ContractError('invalid_qualification_config', 'D0039 qualification state-changing traffic binding must be exactly 100 percent');
    const serviceName = requiredText('TDEV_D0039_SERVICE_NAME');
    if (serviceName !== this.host.config.placement.workerScript) throw new ContractError('invalid_qualification_config', 'D0039 qualification service binding must equal the deployed Worker script');
    const ingressKind = requiredText('TDEV_D0039_INGRESS_KIND', 64);
    if (ingressKind !== 'workers_dev') throw new ContractError('invalid_qualification_config', 'D0039 Revision-4 ingress kind must be workers_dev');
    const workersDevAccountSubdomain = requiredText('TDEV_D0039_WORKERS_DEV_ACCOUNT_SUBDOMAIN', 63);
    const workersDevHostname = requiredText('TDEV_D0039_WORKERS_DEV_HOSTNAME', 253);
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(workersDevAccountSubdomain)) throw new ContractError('invalid_qualification_config', 'D0039 Revision-4 account workers.dev subdomain is invalid');
    if (workersDevHostname !== `${serviceName}.${workersDevAccountSubdomain}.workers.dev`) throw new ContractError('invalid_qualification_config', 'D0039 Revision-4 workers.dev hostname does not match service/account identity');
    if (env?.TDEV_D0039_WORKERS_DEV_ENABLED !== 'true' || env?.TDEV_D0039_WORKERS_DEV_PREVIEWS_ENABLED !== 'false') throw new ContractError('invalid_qualification_config', 'D0039 Revision-4 requires workers.dev enabled and preview URLs disabled');
    if (qualificationEndpointOrigin !== `https://${workersDevHostname}`) throw new ContractError('invalid_qualification_config', 'D0039 Revision-4 qualification origin must equal the exact workers.dev Worker origin');
    this.sourceSha = sourceSha;
    this.workerVersionId = versionId;
    this.deploymentBinding = Object.freeze({
      artifactDigest,
      artifactManifestDigest,
      accountId: requiredText('TDEV_D0039_ACCOUNT_ID'),
      serviceName,
      deploymentEpoch: requiredText('TDEV_D0039_DEPLOYMENT_EPOCH'),
      stateChangingTrafficPercentage: 100,
      qualificationEndpointOrigin,
      ingressKind,
      workersDevAccountSubdomain,
      workersDevHostname,
      workersDevEnabled: true,
      workersDevPreviewsEnabled: false,
      namespaceId: requiredText('TDEV_D0039_NAMESPACE_ID'),
    });
  }

  #binding(agentId, routeGeneration) {
    return createRuntimeAgentRouteBinding(this.env, { agentId, routeGeneration, durableObjectId: this.host.durableObjectId });
  }

  #routeBootstrapAdmission(operation, routeBinding, input) {
    const routeRead = this.host.readInstallableAgent({ routeBinding });
    const placement = this.host.config.placement;
    return admitQualificationRouteBootstrap({
      operation,
      routeBinding,
      runtimeBinding: {
        sourceSha: this.sourceSha,
        artifactDigest: this.deploymentBinding.artifactDigest,
        artifactManifestDigest: this.deploymentBinding.artifactManifestDigest,
        workerVersionId: this.workerVersionId,
        accountId: this.deploymentBinding.accountId,
        serviceName: this.deploymentBinding.serviceName,
        deploymentEpoch: this.deploymentBinding.deploymentEpoch,
        qualificationEndpointOrigin: this.deploymentBinding.qualificationEndpointOrigin,
        workersDevAccountSubdomain: this.deploymentBinding.workersDevAccountSubdomain,
        workersDevHostname: this.deploymentBinding.workersDevHostname,
        workerScript: placement.workerScript,
        namespaceId: this.deploymentBinding.namespaceId,
        namespace: placement.namespace,
        className: placement.className,
        jurisdiction: placement.jurisdiction,
      },
      routeRead,
      routeBootstrapTarget: input.routeBootstrapTarget,
      routeBootstrapTargetDigest: input.routeBootstrapTargetDigest,
      routeBootstrapTransactionId: input.routeBootstrapTransactionId,
      routeBootstrapRequestDigest: input.routeBootstrapRequestDigest,
      routeBootstrapRequest: input.request,
    });
  }

  #readRouteCurrent(routeBinding) {
    const routeRead = this.host.readInstallableAgent({ routeBinding });
    if (!routeRead || typeof routeRead !== 'object' || Array.isArray(routeRead) || !routeRead.installableAgent || typeof routeRead.installableAgent !== 'object' || Array.isArray(routeRead.installableAgent)) {
      throw new ContractError('invalid_qualification_provider', 'D0039 route-current readback is unavailable');
    }
    assertDigest(routeRead.currentTupleDigest, 'currentTupleDigest');
    const security = routeRead.installableAgent;
    for (const name of ['managementKeyId', 'releaseRootKeyId', 'currentCredentialKeyId']) {
      const value = security[name] ?? null;
      if (value !== null && (typeof value !== 'string' || value.length === 0 || value.length > 512 || value.includes('\0'))) throw new ContractError('invalid_qualification_provider', `D0039 route-current ${name} is invalid`);
    }
    return Object.freeze({
      routeRead,
      routeCurrentTupleDigest: routeRead.currentTupleDigest,
      routeVerifierDigest: qualificationRouteVerifierDigest({
        currentTupleDigest: routeRead.currentTupleDigest,
        managementKeyId: security.managementKeyId ?? null,
        releaseRootKeyId: security.releaseRootKeyId ?? null,
        currentCredentialKeyId: security.currentCredentialKeyId ?? null,
      }),
    });
  }

  #runtimeFacts(routeBinding, routeCurrent = this.#readRouteCurrent(routeBinding)) {
    return Object.freeze({
      sourceSha: this.sourceSha,
      artifactDigest: this.deploymentBinding.artifactDigest,
      artifactManifestDigest: this.deploymentBinding.artifactManifestDigest,
      workerVersionId: this.workerVersionId,
      accountId: this.deploymentBinding.accountId,
      serviceName: this.deploymentBinding.serviceName,
      deployment: this.host.config.placement.deployment,
      environment: this.host.config.placement.environment,
      deploymentEpoch: this.deploymentBinding.deploymentEpoch,
      stateChangingTrafficPercentage: this.deploymentBinding.stateChangingTrafficPercentage,
      qualificationEndpointOrigin: this.deploymentBinding.qualificationEndpointOrigin,
      ingressKind: this.deploymentBinding.ingressKind,
      workersDevAccountSubdomain: this.deploymentBinding.workersDevAccountSubdomain,
      workersDevHostname: this.deploymentBinding.workersDevHostname,
      workersDevEnabled: this.deploymentBinding.workersDevEnabled,
      workersDevPreviewsEnabled: this.deploymentBinding.workersDevPreviewsEnabled,
      workerScript: this.host.config.placement.workerScript,
      namespaceId: this.deploymentBinding.namespaceId,
      namespace: this.host.config.placement.namespace,
      className: this.host.config.placement.className,
      jurisdiction: this.host.config.placement.jurisdiction,
      durableObjectId: this.host.durableObjectId,
      routeCurrentTupleDigest: routeCurrent.routeCurrentTupleDigest,
      routeVerifierDigest: routeCurrent.routeVerifierDigest,
      routeBinding,
    });
  }

  #evidenceAttestationVerifierReadback() {
    const attestor = this.host.evidenceAttestor ?? null;
    if (attestor === null) {
      return Object.freeze({
        profile: 'tdev.installable-agent-evidence-attestor-runtime.v1',
        configured: false,
        keyId: null,
        publicJwk: null,
      });
    }
    return Object.freeze({
      profile: 'tdev.installable-agent-evidence-attestor-runtime.v1',
      configured: true,
      keyId: attestor.keyId,
      publicJwk: publicJsonClone(attestor.publicJwk),
    });
  }

  #deploymentIdentity(routeBinding, routeCurrent = this.#readRouteCurrent(routeBinding)) {
    const runtime = this.#runtimeFacts(routeBinding, routeCurrent);
    const identity = createQualificationDeploymentIdentity({ runtimeFacts: runtime, routeBinding });
    return Object.freeze({ runtime, identity, digest: qualificationDeploymentIdentityDigest(identity), routeCurrent });
  }

  async fetch(request) {
    try {
      if (request.method === 'POST') {
        const result = await this.host.acceptInstallableAgentConnectChallenge(request);
        return jsonResponse(200, result);
      }
      if (!applicationProtocolOffered(request)) throw new ContractError('invalid_agent_connect_request', 'D0020 Agent WebSocket upgrade is missing the required application protocol');
      const accepted = await this.host.acceptAgentWebSocket(request);
      return new Response(null, { status: 101, webSocket: accepted.webSocket, headers: { 'Sec-WebSocket-Protocol': AGENT_DELIVERY_WEBSOCKET_PROTOCOL } });
    } catch (error) { return publicError(error); }
  }

  webSocketMessage(socket, message) { return this.host.webSocketMessage(socket, message); }
  webSocketClose(socket) { return this.host.webSocketClose(socket); }
  webSocketError(socket) { return this.host.webSocketError(socket); }

  async qualificationInvoke(input) {
    try {
      const operation = rpcShape(input);
      const routeBinding = this.#binding(input.agentId, input.routeGeneration);
      let admitted = null;
      if (ROUTE_BOOTSTRAP_OPERATIONS.has(operation)) {
        admitted = this.#routeBootstrapAdmission(operation, routeBinding, input);
      } else if (!READ_ONLY_QUALIFICATION_OPERATIONS.has(operation)) {
        const routeCurrent = this.#readRouteCurrent(routeBinding);
        const runtime = this.#runtimeFacts(routeBinding, routeCurrent);
        admitted = assertExpectedDeploymentIdentity({ expectedDeploymentIdentityDigest: input.expectedDeploymentIdentityDigest, runtimeFacts: runtime, routeBinding });
      }
      let result;
      if (operation === 'd0040_evidence_attestor_readback') {
        const placement = this.host.config.placement;
        result = {
          sourceSha: this.sourceSha,
          workerVersionId: this.workerVersionId,
          deployment: placement.deployment,
          environment: placement.environment,
          workerScript: placement.workerScript,
          namespace: placement.namespace,
          className: placement.className,
          jurisdiction: placement.jurisdiction,
          durableObjectId: this.host.durableObjectId,
          evidenceAttestationVerifier: this.#evidenceAttestationVerifierReadback(),
        };
      } else if (operation === 'runtime_probe') {
        this.host.readRoute({ routeBinding });
        const observed = this.#deploymentIdentity(routeBinding);
        result = {
          ...observed.runtime,
          evidenceAttestationVerifier: this.#evidenceAttestationVerifierReadback(),
          deploymentIdentity: observed.identity,
          deploymentIdentityDigest: observed.digest,
        };
      } else if (operation === 'd0039_workers_crypto_probe') {
        this.host.readRoute({ routeBinding });
        const observed = this.#deploymentIdentity(routeBinding);
        result = { ...await runInstallableAgentWorkersCryptoProbe(input.vectors), runtime: observed.runtime, deploymentIdentity: observed.identity, deploymentIdentityDigest: observed.digest };
      } else if (operation === 'd0039_security_readback') {
        const observed = this.#deploymentIdentity(routeBinding);
        const security = observed.routeCurrent.routeRead.installableAgent;
        result = {
          runtime: observed.runtime,
          deploymentIdentity: observed.identity,
          deploymentIdentityDigest: observed.digest,
          state: security.state,
          managementKeyId: security.managementKeyId,
          releaseRootKeyId: security.releaseRootKeyId,
          currentCredentialKeyId: security.currentCredentialKeyId,
          evidenceAttestationVerifier: this.#evidenceAttestationVerifierReadback(),
          legacyHmacPresent: typeof this.env?.TDEV_AGENT_DELIVERY_AUTH_KEY === 'string',
          secretValues: 'excluded',
        };
      } else if (operation === 'read_installable_agent') {
        result = this.host.readInstallableAgent({ routeBinding });
      } else if (operation === 'issue_installable_agent_connect_challenge') {
        result = this.host.issueInstallableAgentConnectChallenge({ routeBinding, request: input.request, ...(input.nowMs === undefined ? {} : { nowMs: input.nowMs }) });
      } else if (operation === 'migrate_installable_agent_route') {
        result = this.host.migrateInstallableAgentRoute({ routeBinding, request: input.request });
      } else if (operation === 'register_installable_agent') {
        result = await this.host.registerInstallableAgent({ routeBinding, request: input.request });
      } else if (operation === 'record_installable_agent_genesis_evidence') {
        result = await this.host.recordInstallableAgentGenesisEvidence({ routeBinding, request: input.request });
      } else if (operation === 'accept_legacy_predecessor_quiescence') {
        result = await this.host.acceptLegacyPredecessorQuiescence({ routeBinding, request: input.request });
      } else if (operation === 'initial_activate_installable_agent') {
        result = await this.host.initialActivateInstallableAgent({ routeBinding, request: input.request });
      } else if (operation === 'fail_installable_agent_genesis') {
        result = await this.host.failInstallableAgentGenesis({ routeBinding, request: input.request });
      } else if (operation === 'record_installable_agent_transaction_evidence') {
        result = await this.host.recordInstallableAgentTransactionEvidence({ routeBinding, request: input.request });
      } else if (operation === 'mutate_installable_agent_trust') {
        result = await this.host.mutateInstallableAgentTrust({ routeBinding, request: input.request });
      } else if (operation === 'begin_credential_rotation') {
        result = await this.host.beginCredentialRotation({ routeBinding, request: input.request });
      } else if (operation === 'commit_credential_rotation') {
        result = await this.host.commitCredentialRotation({ routeBinding, request: input.request });
      } else if (operation === 'revoke_installable_agent_credential') {
        result = await this.host.revokeInstallableAgentCredential({ routeBinding, request: input.request });
      } else if (operation === 'begin_base_stop') {
        result = await this.host.beginBaseStop({ routeBinding, request: input.request });
      } else if (operation === 'complete_base_stop') {
        result = await this.host.completeBaseStop({ routeBinding, request: input.request });
      } else if (operation === 'prepare_base_start') {
        result = await this.host.prepareBaseStart({ routeBinding, request: input.request });
      } else if (operation === 'commit_base_start') {
        result = await this.host.commitBaseStart({ routeBinding, request: input.request });
      } else if (operation === 'begin_package_activation') {
        result = await this.host.beginPackageActivation({ routeBinding, request: input.request });
      } else if (operation === 'commit_package_activation') {
        result = await this.host.commitPackageActivation({ routeBinding, request: input.request });
      } else if (operation === 'begin_installable_agent_replacement') {
        result = await this.host.beginInstallableAgentReplacement({ routeBinding, request: input.request });
      } else if (operation === 'commit_installable_agent_replacement') {
        result = await this.host.commitInstallableAgentReplacement({ routeBinding, request: input.request });
      } else if (operation === 'begin_installable_agent_uninstall') {
        result = await this.host.beginInstallableAgentUninstall({ routeBinding, request: input.request });
      } else if (operation === 'complete_installable_agent_uninstall') {
        result = await this.host.completeInstallableAgentUninstall({ routeBinding, request: input.request });
      } else if (operation === 'compact_installable_agent_management_receipts') {
        result = this.host.compactInstallableAgentManagementReceipts({ routeBinding, request: input.request });
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
        result = this.host.closeUndispatchedDelivery({ routeBinding, deliveryId: input.deliveryId, ...(input.nowMs === undefined ? {} : { nowMs: input.nowMs }) });
      } else if (operation === 'bind_terminal_case_receipt') {
        result = this.host.bindTerminalCaseReceipt({ routeBinding, request: input.request, nowMs: input.nowMs });
      } else if (operation === 'reacquire_delivery_admission') {
        result = this.host.reacquireDeliveryAdmission({ routeBinding, request: input.request });
      } else if (operation === 'send_dispatch') {
        result = this.host.sendAuthorizedDispatch({ routeBinding, authorization: input.authorization, executableBody: input.executableBody });
      } else {
        this.host.readRoute({ routeBinding });
        this.ctx.abort('tdev_d0020_qualification_abort_instance');
        throw new ContractError('qualification_abort_returned', 'D0020 Durable Object abort unexpectedly returned');
      }
      return publicJsonClone({ profile: QUALIFICATION_RPC_PROFILE, schemaVersion: QUALIFICATION_RPC_SCHEMA_VERSION, ok: true, result });
    } catch (error) {
      if (!(error instanceof ContractError)) throw error;
      return { profile: QUALIFICATION_RPC_PROFILE, schemaVersion: QUALIFICATION_RPC_SCHEMA_VERSION, ok: false, error: { code: error.code } };
    }
  }
}
