import {
  ContractError,
  assertDigest,
  assertIdentifier,
  assertRecordShape,
  assertSafeInteger,
  canonicalJson,
  publicJsonClone,
  strictJsonParse,
} from '../src/canonical.mjs';
import {
  INSTALLABLE_AGENT_MANAGEMENT_PROOF_DOMAIN,
  computeInstallableAgentManagementIntentDigest,
  managementProofContext,
} from '../src/installable-agent-admission.mjs';
import {
  INSTALLABLE_AGENT_MANAGEMENT_ENVELOPE_PROFILE,
  decodeBase64Url,
  encodeBase64Url,
  normalizeRsa3072PublicJwk,
} from '../src/installable-agent-security.mjs';
import { QUALIFICATION_RPC_PROFILE } from './installable-agent-qualification-r4.mjs';
import {
  qualificationRouteAuthoritativeReadbackDigest,
  qualificationRouteBootstrapDigest,
  qualificationRouteBootstrapRequestDigest,
} from './installable-agent-qualification-r8.mjs';
import { createQualificationRouteBootstrap } from './installable-agent-qualification-r6.mjs';
import {
  assertPendingRouteRead,
  QUALIFICATION_ROUTE_BOOTSTRAP_V2_PHASE,
  QUALIFICATION_ROUTE_BOOTSTRAP_V2_PROFILE,
  qualificationRouteBootstrapV2Digest,
  qualificationRouteBootstrapV2RequestDigest,
  qualificationRoutePendingReadbackDigest,
  normalizeQualificationRouteBootstrapV2,
} from './installable-agent-qualification-r9-target.mjs';

export const R9_PHASE_DRIVER_PROFILE = 'tdev.d0039-r9-phase-driver.v1';
export const R9_QUALIFICATION_RPC_PATH = '/qualification/d0020/v2';

const R9_PHASE_OPERATIONS = new Set([
  'read_installable_agent',
  'register_installable_agent',
  'record_installable_agent_genesis_evidence',
  'accept_legacy_predecessor_quiescence',
  'initial_activate_installable_agent',
  'fail_installable_agent_genesis',
]);
const R9_MAX_RPC_RESPONSE_BYTES = 4 * 1024 * 1024;

function fail(code, message, details = undefined, options = undefined) {
  throw new ContractError(code, message, details, options);
}

function boundedText(value, label, max = 2048) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || value.includes('\0')) {
    fail('r9_phase_driver_invalid_input', `${label} is invalid`);
  }
  return value;
}

function normalizeRouteBinding(value) {
  assertRecordShape(value, ['agentId', 'routeGeneration'], [], 'R9 phase driver route binding');
  assertIdentifier(value.agentId, 'R9 phase driver agentId');
  assertSafeInteger(value.routeGeneration, 'R9 phase driver routeGeneration', { min: 1 });
  return Object.freeze({ agentId: value.agentId, routeGeneration: value.routeGeneration });
}

function normalizeSigner(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || typeof value.keyId !== 'string' || typeof value.sign !== 'function') {
    fail('r9_phase_driver_signer_invalid', `${label} must be an opaque Ed25519 signer handle`);
  }
  assertDigest(value.keyId, `${label}.keyId`);
  return value;
}

function normalizeSignature(value, label) {
  if (typeof value !== 'string') fail('r9_phase_driver_signature_invalid', `${label} did not return base64url`);
  let bytes;
  try { bytes = decodeBase64Url(value, label); }
  catch { fail('r9_phase_driver_signature_invalid', `${label} is not canonical base64url`); }
  if (bytes.byteLength !== 64) fail('r9_phase_driver_signature_invalid', `${label} is not exactly 64 bytes`);
  return encodeBase64Url(bytes);
}

/**
 * Adapt an already provisioned signer. The callback receives no private key,
 * token or secret bytes, only a public key ID, domain and canonical record.
 */
export function createOpaqueEd25519Signer(input) {
  assertRecordShape(input, ['keyId', 'sign'], [], 'R9 opaque signer');
  assertDigest(input.keyId, 'R9 opaque signer keyId');
  if (typeof input.sign !== 'function') fail('r9_phase_driver_signer_invalid', 'R9 opaque signer callback is not callable');
  return Object.freeze({
    keyId: input.keyId,
    async sign({ domain, record }) {
      boundedText(domain, 'R9 signer domain', 512);
      const request = Object.freeze({ keyId: input.keyId, domain, record: publicJsonClone(record) });
      let signature;
      try { signature = await input.sign(request); }
      catch { fail('r9_phase_driver_signer_failed', 'R9 opaque signer rejected the request'); }
      return normalizeSignature(signature, 'R9 opaque signer signature');
    },
  });
}

function normalizeQualificationOrigin(origin, workersDevHostname) {
  boundedText(origin, 'R9 qualification endpoint origin', 512);
  boundedText(workersDevHostname, 'R9 workers.dev hostname', 253);
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.workers\.dev$/.test(workersDevHostname)) {
    fail('r9_phase_driver_endpoint_invalid', 'R9 qualification endpoint hostname is not a workers.dev identity');
  }
  let endpoint;
  try { endpoint = new URL(origin); }
  catch { fail('r9_phase_driver_endpoint_invalid', 'R9 qualification endpoint origin is invalid'); }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash || endpoint.origin !== origin || endpoint.hostname !== workersDevHostname) {
    fail('r9_phase_driver_endpoint_invalid', 'R9 qualification endpoint must be the exact credential-free workers.dev origin');
  }
  endpoint.pathname = R9_QUALIFICATION_RPC_PATH;
  return endpoint;
}

function normalizeQualificationToken(value) {
  if (typeof value !== 'string' || value.includes('\0')) {
    fail('r9_phase_driver_token_invalid', 'R9 qualification token provider returned an invalid token');
  }
  const bytes = new TextEncoder().encode(value).byteLength;
  if (bytes < 32 || bytes > 512) fail('r9_phase_driver_token_invalid', 'R9 qualification token provider returned an invalid token');
  return value;
}

async function boundedRpcJson(response) {
  if (response === null || typeof response !== 'object' || typeof response.arrayBuffer !== 'function') {
    fail('r9_phase_driver_rpc_invalid', 'R9 qualification RPC returned an invalid response');
  }
  const declared = response.headers?.get?.('content-length');
  if (declared !== null && declared !== undefined && (!/^[0-9]+$/.test(declared) || Number(declared) > R9_MAX_RPC_RESPONSE_BYTES)) {
    fail('r9_phase_driver_rpc_response_too_large', 'R9 qualification RPC response exceeds its byte bound');
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > R9_MAX_RPC_RESPONSE_BYTES) fail('r9_phase_driver_rpc_response_too_large', 'R9 qualification RPC response exceeds its byte bound');
  try { return strictJsonParse(bytes, { maxBytes: R9_MAX_RPC_RESPONSE_BYTES }); }
  catch { fail('r9_phase_driver_rpc_response_invalid', 'R9 qualification RPC response is not bounded canonical JSON'); }
}

/**
 * Create the exact existing qualification-route transport used by the R9
 * phase adapter. The token provider is the only credential input and is
 * called inside the request closure; the token is never returned, cloned,
 * logged or included in an error. Only the bounded R9 operation set can be
 * sent, and this transport performs no retry.
 */
export function createR9QualificationRpc({ qualificationEndpointOrigin, workersDevHostname, tokenProvider, fetchImpl = globalThis.fetch }) {
  const endpoint = normalizeQualificationOrigin(qualificationEndpointOrigin, workersDevHostname);
  if (typeof tokenProvider !== 'function') fail('r9_phase_driver_token_invalid', 'R9 qualification token provider is not callable');
  if (typeof fetchImpl !== 'function') fail('r9_phase_driver_rpc_invalid', 'R9 qualification fetch implementation is not callable');
  return async function r9QualificationRpc(input) {
    if (input === null || typeof input !== 'object' || Array.isArray(input) || !R9_PHASE_OPERATIONS.has(input.operation)) {
      fail('r9_phase_driver_operation_forbidden', 'R9 qualification RPC operation is outside the phase driver set');
    }
    const requestBody = canonicalJson(publicJsonClone(input));
    const token = normalizeQualificationToken(await tokenProvider());
    let response;
    try {
      response = await fetchImpl(new URL(endpoint.href), {
        method: 'POST',
        redirect: 'error',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: requestBody,
      });
    } catch (cause) {
      fail('r9_phase_driver_rpc_failed', 'R9 qualification RPC transport failed', undefined, { cause });
    }
    const body = await boundedRpcJson(response);
    const successShape = body !== null && typeof body === 'object' && !Array.isArray(body) &&
      body.ok === true && Object.hasOwn(body, 'result') && Object.keys(body).length === 2;
    if (!response.ok || !successShape) {
      const code = typeof body?.error?.code === 'string' ? body.error.code : 'r9_phase_driver_rpc_failed';
      fail(code, 'R9 qualification RPC rejected the operation', { status: response.status });
    }
    return publicJsonClone(body.result);
  };
}

function rpcInput(operation, routeBinding, fields = {}) {
  return Object.freeze({
    profile: QUALIFICATION_RPC_PROFILE,
    operation,
    agentId: routeBinding.agentId,
    routeGeneration: routeBinding.routeGeneration,
    ...fields,
  });
}

function assertRouteReadShape(routeRead, label) {
  assertRecordShape(routeRead, ['installableAgent', 'predecessorDigest', 'currentTuple', 'currentTupleDigest'], [], label);
  if (routeRead.installableAgent === null || typeof routeRead.installableAgent !== 'object' || Array.isArray(routeRead.installableAgent)) {
    fail('r9_phase_driver_readback_invalid', `${label} has no installable-Agent readback`);
  }
  return routeRead;
}

function assertUnregisteredRouteRead(routeRead) {
  assertRouteReadShape(routeRead, 'R9 UNREGISTERED route readback');
  const security = routeRead.installableAgent;
  if (security.state !== 'UNREGISTERED' || routeRead.currentTuple !== null || routeRead.currentTupleDigest !== null) {
    fail('r9_phase_driver_predecessor_invalid', 'R9 phase U requires an authoritative null-current UNREGISTERED route');
  }
  assertDigest(routeRead.predecessorDigest, 'R9 UNREGISTERED predecessor digest');
  assertSafeInteger(security.managementRequestSequenceHighWater, 'R9 management request high-water', { min: 0 });
  for (const name of ['managementKeyId', 'releaseRootKeyId', 'currentCredentialKeyId']) {
    const value = security[name] ?? null;
    if (value !== null) assertDigest(value, `R9 ${name}`);
  }
  return security;
}

async function stableRead(rpc, routeBinding, state) {
  const first = assertRouteReadShape(await rpc(rpcInput('read_installable_agent', routeBinding)), 'R9 first route readback');
  const second = assertRouteReadShape(await rpc(rpcInput('read_installable_agent', routeBinding)), 'R9 second route readback');
  let firstDigest;
  let secondDigest;
  if (state === 'UNREGISTERED') {
    assertUnregisteredRouteRead(first);
    assertUnregisteredRouteRead(second);
    firstDigest = qualificationRouteAuthoritativeReadbackDigest({ routeBinding, routeRead: first });
    secondDigest = qualificationRouteAuthoritativeReadbackDigest({ routeBinding, routeRead: second });
  } else if (state === 'GENESIS_PENDING') {
    assertPendingRouteRead(first);
    assertPendingRouteRead(second);
    firstDigest = qualificationRoutePendingReadbackDigest({ routeBinding, routeRead: first });
    secondDigest = qualificationRoutePendingReadbackDigest({ routeBinding, routeRead: second });
  } else {
    fail('r9_phase_driver_invalid_input', 'R9 stable-read state is unsupported');
  }
  if (firstDigest !== secondDigest) fail('r9_phase_driver_readback_unstable', `R9 ${state} route readback changed between observations`);
  return Object.freeze({ first, second, readbackDigest: firstDigest });
}

function normalizeProviderBinding(value, phase) {
  const required = phase === 'U'
    ? ['activeDeploymentId', 'activeTrafficPercentage', 'providerConfigurationDigest', 'providerWriterObservationDigest', 'providerAuthoritativeRereadDigest']
    : ['activeDeploymentId', 'activeTrafficPercentage', 'providerConfigurationDigest', 'providerWriterObservationDigest'];
  assertRecordShape(value, required, phase === 'P' ? ['providerAuthoritativeRereadDigest'] : [], 'R9 phase provider binding');
  boundedText(value.activeDeploymentId, 'R9 activeDeploymentId');
  if (value.activeTrafficPercentage !== 100) fail('r9_phase_driver_provider_invalid', 'R9 requires one 100-percent provider writer');
  for (const name of ['providerConfigurationDigest', 'providerWriterObservationDigest', ...(phase === 'U' ? ['providerAuthoritativeRereadDigest'] : [])]) {
    assertDigest(value[name], `R9 ${name}`);
  }
  return value;
}

function normalizeRegisterContent(value) {
  assertRecordShape(value, [
    'credentialProvisioningId', 'packageManifestDigest', 'packageTrustSubjectDigest', 'trustStateDigest', 'trustSubjects',
  ], ['credentialPublicKey'], 'R9 register content');
  boundedText(value.credentialProvisioningId, 'R9 credentialProvisioningId');
  for (const name of ['packageManifestDigest', 'packageTrustSubjectDigest', 'trustStateDigest']) assertDigest(value[name], `R9 ${name}`);
  publicJsonClone(value.trustSubjects);
  return publicJsonClone({
    credentialProvisioningId: value.credentialProvisioningId,
    ...(value.credentialPublicKey === undefined ? {} : { credentialPublicKey: normalizeRsa3072PublicJwk(value.credentialPublicKey) }),
    packageManifestDigest: value.packageManifestDigest,
    packageTrustSubjectDigest: value.packageTrustSubjectDigest,
    trustStateDigest: value.trustStateDigest,
    trustSubjects: value.trustSubjects,
  });
}

function normalizeManagementEnvelopeForReplay(value, routeBinding, request) {
  assertRecordShape(value, ['profile', 'keyId', 'context', 'signature'], [], 'R9 original management envelope');
  if (value.profile !== INSTALLABLE_AGENT_MANAGEMENT_ENVELOPE_PROFILE) {
    fail('r9_phase_driver_management_envelope_invalid', 'R9 original management envelope profile is unsupported');
  }
  assertDigest(value.keyId, 'R9 original management envelope keyId');
  assertRecordShape(value.context, [
    'domain', 'operation', 'agentId', 'routeGeneration', 'managementRequestId', 'intentDigest', 'expectedPredecessorDigest',
  ], [], 'R9 original management envelope context');
  if (value.context.domain !== INSTALLABLE_AGENT_MANAGEMENT_PROOF_DOMAIN ||
      value.context.operation !== 'register' ||
      value.context.agentId !== routeBinding.agentId ||
      value.context.routeGeneration !== routeBinding.routeGeneration ||
      value.context.managementRequestId !== request.managementRequestId ||
      value.context.intentDigest !== request.intentDigest ||
      value.context.expectedPredecessorDigest !== request.expectedPredecessorDigest) {
    fail('r9_phase_driver_management_envelope_invalid', 'R9 original management envelope context is not bound to the request');
  }
  return Object.freeze({
    profile: value.profile,
    keyId: value.keyId,
    context: publicJsonClone(value.context),
    signature: normalizeSignature(value.signature, 'R9 original management signature'),
  });
}

function normalizeRegisterRequest(value, routeBinding) {
  assertRecordShape(value, [
    'managementRequestId', 'intentDigest', 'expectedPredecessorDigest', 'managementProof',
    'credentialProvisioningId', 'packageManifestDigest', 'packageTrustSubjectDigest', 'trustStateDigest', 'trustSubjects',
  ], ['credentialPublicKey'], 'R9 original register request');
  boundedText(value.managementRequestId, 'R9 original managementRequestId');
  assertDigest(value.intentDigest, 'R9 original intentDigest');
  assertDigest(value.expectedPredecessorDigest, 'R9 original expectedPredecessorDigest');
  const content = normalizeRegisterContent({
    credentialProvisioningId: value.credentialProvisioningId,
    ...(value.credentialPublicKey === undefined ? {} : { credentialPublicKey: value.credentialPublicKey }),
    packageManifestDigest: value.packageManifestDigest,
    packageTrustSubjectDigest: value.packageTrustSubjectDigest,
    trustStateDigest: value.trustStateDigest,
    trustSubjects: value.trustSubjects,
  });
  const request = {
    managementRequestId: value.managementRequestId,
    intentDigest: value.intentDigest,
    expectedPredecessorDigest: value.expectedPredecessorDigest,
    ...content,
  };
  return Object.freeze({
    ...request,
    managementProof: normalizeManagementEnvelopeForReplay(value.managementProof, routeBinding, request),
  });
}

async function makeManagementEnvelope(routeBinding, request, signer) {
  const context = managementProofContext('register', routeBinding, request, request.expectedPredecessorDigest);
  const signature = await signer.sign({ domain: INSTALLABLE_AGENT_MANAGEMENT_PROOF_DOMAIN, record: context });
  return Object.freeze({
    profile: INSTALLABLE_AGENT_MANAGEMENT_ENVELOPE_PROFILE,
    keyId: signer.keyId,
    context: publicJsonClone(context),
    signature: normalizeSignature(signature, 'R9 management signature'),
  });
}

function makePhaseUTarget({ runtimeBinding, providerBinding, routeBinding, readback, transactionId }) {
  const requestDigest = qualificationRouteBootstrapRequestDigest({ transactionId, routeBinding });
  const target = createQualificationRouteBootstrap({
    ...runtimeBinding,
    ...providerBinding,
    agentId: routeBinding.agentId,
    routeGeneration: routeBinding.routeGeneration,
    routePredecessorState: 'UNREGISTERED',
    routePredecessorStateDigest: readback.first.predecessorDigest,
    managementRequestSequenceHighWater: readback.first.installableAgent.managementRequestSequenceHighWater,
    routeBootstrapTransactionId: transactionId,
    routeBootstrapRequestDigest: requestDigest,
    providerAuthoritativeRereadDigest: providerBinding.providerAuthoritativeRereadDigest,
    routeAuthoritativeRereadDigest: readback.readbackDigest,
  });
  return Object.freeze({ target, targetDigest: qualificationRouteBootstrapDigest(target), requestDigest });
}

function makePhasePTarget({ runtimeBinding, providerBinding, routeBinding, readback, transactionId, operation, request }) {
  const requestDigest = qualificationRouteBootstrapV2RequestDigest({ operation, transactionId, routeBinding, request });
  const { security, pending } = assertPendingRouteRead(readback.first);
  const target = normalizeQualificationRouteBootstrapV2({
    profile: QUALIFICATION_ROUTE_BOOTSTRAP_V2_PROFILE,
    ...runtimeBinding,
    activeDeploymentId: providerBinding.activeDeploymentId,
    activeTrafficPercentage: providerBinding.activeTrafficPercentage,
    providerConfigurationDigest: providerBinding.providerConfigurationDigest,
    providerWriterObservationDigest: providerBinding.providerWriterObservationDigest,
    agentId: routeBinding.agentId,
    routeGeneration: routeBinding.routeGeneration,
    routePredecessorState: 'GENESIS_PENDING',
    routePredecessorStateDigest: readback.first.predecessorDigest,
    managementRequestSequenceHighWater: security.managementRequestSequenceHighWater,
    routeBootstrapPhase: QUALIFICATION_ROUTE_BOOTSTRAP_V2_PHASE,
    routeBootstrapOperation: operation,
    routeBootstrapTransactionId: transactionId,
    routeBootstrapRequestDigest: requestDigest,
    genesisPredecessorDigest: pending.unregisteredPredecessorDigest,
    pendingDigest: pending.pendingDigest,
    genesisGeneration: pending.genesisGeneration,
    pendingManagementRequestId: pending.managementRequestId,
    pendingIntentDigest: pending.intentDigest,
    pendingReadbackDigest: readback.readbackDigest,
  });
  return Object.freeze({ target, targetDigest: qualificationRouteBootstrapV2Digest(target), requestDigest });
}

function phaseInvocation(operation, routeBinding, targetInfo, transactionId, request) {
  return rpcInput(operation, routeBinding, {
    routeBootstrapTarget: targetInfo.target,
    routeBootstrapTargetDigest: targetInfo.targetDigest,
    routeBootstrapTransactionId: transactionId,
    routeBootstrapRequestDigest: targetInfo.requestDigest,
    request,
  });
}

function assertManagementSignerMatches(security, signer) {
  const normalized = normalizeSigner(signer, 'R9 management signer');
  if (security.managementKeyId === null || normalized.keyId !== security.managementKeyId) {
    fail('r9_phase_driver_signer_identity_mismatch', 'R9 management signer does not match the authoritative route');
  }
  return normalized;
}

/**
 * Build and dispatch exactly one phase-U register request. The supplied rpc
 * callback owns the already-authorized transport; this module never acquires
 * credentials or retries a state-changing call.
 */
export async function runR9PhaseU({ rpc, routeBinding, runtimeBinding, providerBinding, transactionId, register, managementSigner }) {
  if (typeof rpc !== 'function') fail('r9_phase_driver_rpc_invalid', 'R9 phase driver rpc is not callable');
  const binding = normalizeRouteBinding(routeBinding);
  boundedText(transactionId, 'R9 route bootstrap transactionId');
  const provider = normalizeProviderBinding(providerBinding, 'U');
  const readback = await stableRead(rpc, binding, 'UNREGISTERED');
  const signer = assertManagementSignerMatches(readback.first.installableAgent, managementSigner);
  const content = normalizeRegisterContent(register);
  const highWater = readback.first.installableAgent.managementRequestSequenceHighWater;
  if (highWater >= Number.MAX_SAFE_INTEGER) {
    fail('r9_phase_driver_sequence_exhausted', 'R9 management request sequence cannot advance safely');
  }
  const unsignedRequest = {
    managementRequestId: `m2:${highWater + 1}`,
    intentDigest: computeInstallableAgentManagementIntentDigest('register', binding, content),
    expectedPredecessorDigest: readback.first.predecessorDigest,
    ...content,
  };
  const request = Object.freeze({
    ...unsignedRequest,
    managementProof: await makeManagementEnvelope(binding, unsignedRequest, signer),
  });
  const target = makePhaseUTarget({ runtimeBinding, providerBinding: provider, routeBinding: binding, readback, transactionId });
  const result = await rpc(phaseInvocation('register_installable_agent', binding, target, transactionId, request));
  if (result?.state !== 'GENESIS_PENDING') fail('r9_phase_driver_unexpected_result', 'R9 phase-U register did not return GENESIS_PENDING');
  return Object.freeze({
    profile: R9_PHASE_DRIVER_PROFILE,
    phase: 'U',
    routeBinding: binding,
    transactionId,
    request: publicJsonClone(request),
    target: publicJsonClone(target.target),
    targetDigest: target.targetDigest,
    requestDigest: target.requestDigest,
    result: publicJsonClone(result),
    unregisteredReadbackDigest: readback.readbackDigest,
    registerRequestDigest: qualificationRouteBootstrapV2RequestDigest({
      operation: 'register_installable_agent',
      transactionId,
      routeBinding: binding,
      request,
    }),
  });
}

function assertPendingRequestIdentity(request, pending, security = undefined) {
  if (request.managementRequestId !== pending.managementRequestId ||
      request.intentDigest !== pending.intentDigest ||
      request.expectedPredecessorDigest !== pending.unregisteredPredecessorDigest) {
    fail('r9_phase_driver_pending_mismatch', 'R9 request does not bind the exact pending transaction');
  }
  if (security?.managementKeyId !== undefined && security.managementKeyId !== null && request.managementProof.keyId !== security.managementKeyId) {
    fail('r9_phase_driver_signer_identity_mismatch', 'R9 replay management proof does not match the authoritative route');
  }
}

function normalizeOpaqueEvidenceProof(value, label) {
  if (value === null || value === undefined) {
    fail('r9_phase_driver_evidence_proof_invalid', `${label} requires an externally produced evidence proof`);
  }
  try { return publicJsonClone(value); }
  catch { fail('r9_phase_driver_evidence_proof_invalid', `${label} evidence proof is not public JSON`); }
}

function normalizeEvidenceDescriptor(value) {
  assertRecordShape(value, ['type', 'evidenceDigest', 'evidenceProof'], [], 'R9 evidence descriptor');
  boundedText(value.type, 'R9 evidence type', 128);
  assertDigest(value.evidenceDigest, 'R9 evidenceDigest');
  return Object.freeze({
    type: value.type,
    evidenceDigest: value.evidenceDigest,
    evidenceProof: normalizeOpaqueEvidenceProof(value.evidenceProof, 'R9 evidence descriptor'),
  });
}

function normalizeQuiescenceDescriptor(value) {
  assertRecordShape(value, [
    'deliveryId', 'executorId', 'executorEpoch', 'evidenceRevision', 'evidenceDigest', 'proofClass', 'receiptDigest', 'proofEvidenceDigest', 'evidenceProof',
  ], [], 'R9 quiescence descriptor');
  assertDigest(value.deliveryId, 'R9 quiescence deliveryId');
  boundedText(value.executorId, 'R9 quiescence executorId');
  assertSafeInteger(value.executorEpoch, 'R9 quiescence executorEpoch', { min: 1 });
  assertSafeInteger(value.evidenceRevision, 'R9 quiescence evidenceRevision', { min: 0 });
  if (value.evidenceDigest !== null) assertDigest(value.evidenceDigest, 'R9 quiescence evidenceDigest');
  boundedText(value.proofClass, 'R9 quiescence proofClass', 128);
  assertDigest(value.receiptDigest, 'R9 quiescence receiptDigest');
  assertDigest(value.proofEvidenceDigest, 'R9 quiescence proofEvidenceDigest');
  return Object.freeze({
    ...publicJsonClone(value),
    evidenceProof: normalizeOpaqueEvidenceProof(value.evidenceProof, 'R9 quiescence descriptor'),
  });
}

/**
 * Continue the exact pending transaction. Reads are repeated before every
 * state-changing operation. A transport error is allowed to escape so the
 * caller can reconcile; no state-changing operation is blindly retried.
 */
export async function runR9PhaseP({ rpc, routeBinding, runtimeBinding, providerBinding, transactionId, registerRequest = null, registerRequestDigest, managementSigner, evidence = [], quiescence = [], activate = true, replayRegister = false }) {
  if (typeof rpc !== 'function') fail('r9_phase_driver_rpc_invalid', 'R9 phase driver rpc is not callable');
  const binding = normalizeRouteBinding(routeBinding);
  boundedText(transactionId, 'R9 route bootstrap transactionId');
  const provider = normalizeProviderBinding(providerBinding, 'P');
  if (typeof replayRegister !== 'boolean') fail('r9_phase_driver_invalid_input', 'R9 replayRegister must be boolean');
  const normalizedRegisterRequest = registerRequest === null ? null : normalizeRegisterRequest(registerRequest, binding);
  const computedRegisterRequestDigest = normalizedRegisterRequest === null ? null : qualificationRouteBootstrapV2RequestDigest({
    operation: 'register_installable_agent',
    transactionId,
    routeBinding: binding,
    request: normalizedRegisterRequest,
  });
  if (replayRegister) {
    if (normalizedRegisterRequest === null) fail('r9_phase_driver_invalid_input', 'R9 register replay requires the original request');
    assertDigest(registerRequestDigest, 'R9 original register request digest');
    if (registerRequestDigest !== computedRegisterRequestDigest) {
      fail('r9_phase_driver_register_replay_mismatch', 'R9 register replay is not bound to the original request digest');
    }
  }
  const events = [];

  const invokePending = async (operation, request, proofKind) => {
    const readback = await stableRead(rpc, binding, 'GENESIS_PENDING');
    const { security, pending } = assertPendingRouteRead(readback.first);
    if (operation === 'register_installable_agent' || operation === 'initial_activate_installable_agent' || operation === 'fail_installable_agent_genesis') {
      assertPendingRequestIdentity(request, pending, security);
    }
    const target = makePhasePTarget({ runtimeBinding, providerBinding: provider, routeBinding: binding, readback, transactionId, operation, request });
    const result = await rpc(phaseInvocation(operation, binding, target, transactionId, request));
    events.push({ operation, targetDigest: target.targetDigest, requestDigest: target.requestDigest, proofKind, result, pendingReadbackDigest: readback.readbackDigest });
    return result;
  };

  if (replayRegister) {
    const replayResult = await invokePending('register_installable_agent', normalizedRegisterRequest, 'management-replay');
    if (replayResult?.classification !== 'exact_replay') {
      fail('r9_phase_driver_replay_not_reconciled', 'R9 register replay did not return the authoritative exact-replay result');
    }
  }

  for (const descriptor of evidence.map(normalizeEvidenceDescriptor)) {
    const readback = await stableRead(rpc, binding, 'GENESIS_PENDING');
    const { pending } = assertPendingRouteRead(readback.first);
    const request = {
      pendingDigest: pending.pendingDigest,
      genesisGeneration: pending.genesisGeneration,
      type: descriptor.type,
      evidenceDigest: descriptor.evidenceDigest,
      evidenceProof: descriptor.evidenceProof,
    };
    await invokePending('record_installable_agent_genesis_evidence', request, 'external-evidence');
  }

  for (const descriptor of quiescence.map(normalizeQuiescenceDescriptor)) {
    const readback = await stableRead(rpc, binding, 'GENESIS_PENDING');
    const { pending } = assertPendingRouteRead(readback.first);
    const request = {
      pendingDigest: pending.pendingDigest,
      genesisGeneration: pending.genesisGeneration,
      deliveryId: descriptor.deliveryId,
      executorId: descriptor.executorId,
      executorEpoch: descriptor.executorEpoch,
      evidenceRevision: descriptor.evidenceRevision,
      evidenceDigest: descriptor.evidenceDigest,
      proofClass: descriptor.proofClass,
      receiptDigest: descriptor.receiptDigest,
      proofEvidenceDigest: descriptor.proofEvidenceDigest,
      evidenceProof: descriptor.evidenceProof,
    };
    await invokePending('accept_legacy_predecessor_quiescence', request, 'external-evidence');
  }

  if (!activate) {
    return Object.freeze({ profile: R9_PHASE_DRIVER_PROFILE, phase: 'P', routeBinding: binding, transactionId, events: publicJsonClone(events), finalState: 'GENESIS_PENDING' });
  }

  const readback = await stableRead(rpc, binding, 'GENESIS_PENDING');
  const { security, pending } = assertPendingRouteRead(readback.first);
  const signer = assertManagementSignerMatches(security, managementSigner);
  const activationBase = {
    managementRequestId: pending.managementRequestId,
    intentDigest: pending.intentDigest,
    expectedPredecessorDigest: pending.unregisteredPredecessorDigest,
    pendingDigest: pending.pendingDigest,
    genesisGeneration: pending.genesisGeneration,
  };
  const activationRequest = {
    ...activationBase,
    managementProof: await makeManagementEnvelope(binding, activationBase, signer),
  };
  await invokePending('initial_activate_installable_agent', activationRequest, 'management');
  const finalFirst = assertRouteReadShape(await rpc(rpcInput('read_installable_agent', binding)), 'R9 final route readback');
  const finalSecond = assertRouteReadShape(await rpc(rpcInput('read_installable_agent', binding)), 'R9 final route reread');
  if (finalFirst.installableAgent.state !== 'CURRENT' || finalSecond.installableAgent.state !== 'CURRENT' || canonicalJson(finalFirst) !== canonicalJson(finalSecond)) {
    fail('r9_phase_driver_final_readback_invalid', 'R9 phase-P final route readback did not prove stable CURRENT');
  }
  return Object.freeze({
    profile: R9_PHASE_DRIVER_PROFILE,
    phase: 'P',
    routeBinding: binding,
    transactionId,
    events: publicJsonClone(events),
    finalReadback: publicJsonClone({ first: finalFirst, second: finalSecond }),
    finalState: 'CURRENT',
  });
}
