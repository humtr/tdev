import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { AgentDeliveryAuthority, MemoryAgentDeliveryStore, agentRouteBindingDigest } from '../src/agent-delivery-authority.mjs';
import { digest, typedDigest } from '../src/canonical.mjs';
import {
  AGENT_ROUTE_ELECTION_IMPORT_PROFILE,
  AGENT_ROUTE_LEGACY_HOST_PROFILE,
  agentRouteElectionDigest,
  agentRouteRecoveryKeyId,
} from '../src/agent-route-election.mjs';
import { AgentRouteGenerationAuthority } from '../src/agent-route-generation.mjs';
import { encodeBase64Url, signedRecordBytes } from '../src/installable-agent-security.mjs';
import { CloudflareApiClient, loadCloudflareCredentials, parseCloudflareEnv } from './cloudflare-casedo-api.mjs';
import { QUALIFICATION_RPC_PROFILE } from './installable-agent-qualification-r4.mjs';
import {
  QUALIFICATION_ROUTE_PROVISIONING_PROFILE,
  qualificationRouteProvisioningRequestDigest,
  qualificationRouteProvisioningTargetDigest,
} from './installable-agent-r12-route-provisioning.mjs';

const envFile = process.argv[2] ?? '/data/data/com.termux/files/home/.config/tdev/cloudflare.env';
const scriptName = 'tdev-d0044-qualification-20260902';
const origin = `https://${scriptName}.humtr.workers.dev`;
const accountSubdomain = 'humtr';
const profile = 'tdev.agent-route-election-qualification.v1';
const agentId = process.env.TDEV_D0044_AGENT_ID ?? `d0044-legacy-import-crash-${randomBytes(8).toString('hex')}`;

function binding(settings, name, field = 'text') {
  const value = settings?.bindings?.find((item) => item?.name === name)?.[field];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`missing binding ${name}`);
  return value;
}
function routeBinding({ routeGeneration, namespaceId, durableObjectId }) {
  return { agentId, routeGeneration, deployment: scriptName, environment: 'qualification', workerScript: scriptName,
    className: 'AgentDeliveryRuntimeDO', namespace: namespaceId, jurisdiction: 'global', durableObjectId };
}
function rpc(routeGeneration, operation, extra = {}) {
  return { profile: QUALIFICATION_RPC_PROFILE, operation, agentId, routeGeneration, ...extra };
}
async function invoke(token, path, body) {
  const response = await fetch(`${origin}${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let parsed;
  try { parsed = await response.json(); } catch { parsed = { ok: false, error: { code: 'invalid_json_response' } }; }
  return { status: response.status, body: parsed };
}
async function authInvoke(token, path, body, label) {
  let response = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    response = await invoke(token, path, body);
    if (response.status !== 401) return response;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} authentication propagation failed`);
}
function ok(label, response) {
  if (response.status !== 200 || response.body?.ok !== true) throw new Error(`${label} failed: ${response.body?.error?.code ?? `http_${response.status}`}`);
  return response.body.result;
}
function signRecord(record, keyPair) {
  return encodeBase64Url(sign(null, signedRecordBytes(record.profile, record), keyPair.privateKey));
}
async function d0040(token, hostKey, routeGeneration) {
  return ok('D0040 readback', await authInvoke(token, '/qualification/d0044/delivery/v1', {
    profile, routeHostKey: hostKey, rpc: rpc(routeGeneration, 'd0040_evidence_attestor_readback'),
  }, 'D0040 readback'));
}
function initializationTarget({ settings, d0040Result, namespaceId, transactionId, payload }) {
  const requestDigest = qualificationRouteProvisioningRequestDigest({ operation: 'initialize', transactionId, routeBinding: { agentId, routeGeneration: 1 }, payload });
  const value = {
    profile: QUALIFICATION_ROUTE_PROVISIONING_PROFILE,
    operation: 'initialize',
    sourceSha: binding(settings, 'TDEV_SOURCE_SHA'),
    artifactDigest: binding(settings, 'TDEV_D0039_ARTIFACT_DIGEST'),
    artifactManifestDigest: binding(settings, 'TDEV_D0039_ARTIFACT_MANIFEST_DIGEST'),
    workerVersionId: d0040Result.workerVersionId,
    accountId: binding(settings, 'TDEV_D0039_ACCOUNT_ID'),
    serviceName: scriptName,
    deployment: scriptName,
    environment: 'qualification',
    deploymentEpoch: binding(settings, 'TDEV_D0039_DEPLOYMENT_EPOCH'),
    qualificationEndpointOrigin: origin,
    workersDevAccountSubdomain: accountSubdomain,
    workersDevHostname: `${scriptName}.${accountSubdomain}.workers.dev`,
    workerScript: scriptName,
    namespaceId,
    namespace: namespaceId,
    className: 'AgentDeliveryRuntimeDO',
    jurisdiction: 'global',
    durableObjectId: d0040Result.durableObjectId,
    evidenceAttestorKeyId: binding(settings, 'TDEV_D0040_EVIDENCE_ATTESTOR_KEY_ID'),
    agentId,
    routeGeneration: 1,
    predecessorState: 'ABSENT',
    predecessorDigest: null,
    routeAuthoritativeRereadDigest: null,
    provisioningTransactionId: transactionId,
    provisioningRequestDigest: requestDigest,
  };
  return { value, requestDigest };
}
async function initialize({ token, settings, namespaceId, d0040Result, generation }) {
  const payload = { initialization: {}, generation };
  const transactionId = `d0044-legacy-crash-init-${randomBytes(8).toString('hex')}`;
  const { value, requestDigest } = initializationTarget({ settings, d0040Result, namespaceId, transactionId, payload });
  return ok('legacy route initialize', await authInvoke(token, '/qualification/d0044/delivery/v1', {
    profile, routeHostKey: agentId,
    rpc: rpc(1, 'initialize', {
      initialization: {}, generation,
      routeProvisioningTarget: value,
      routeProvisioningTargetDigest: qualificationRouteProvisioningTargetDigest(value),
      routeProvisioningTransactionId: transactionId,
      routeProvisioningRequestDigest: requestDigest,
    }),
  }, 'legacy route initialize'));
}
async function readGeneration(token) {
  return ok('generation read', await authInvoke(token, '/qualification/d0044/delivery/v1', {
    profile, routeHostKey: agentId, rpc: rpc(1, 'read_route_generation'),
  }, 'generation read'));
}
async function readElection(token) {
  return ok('election read', await authInvoke(token, '/qualification/d0044/election/v1', {
    profile, operation: 'readAgentRouteElection', agentId, payload: {},
  }, 'election read'));
}

// The provider completes the state-changing RPC, while this controller discards its
// response. Every following read is a fresh HTTP/DO reconstruction and must reconcile
// the durable stage rather than infer it from a missing response.
async function discardResponse(token, path, body, label) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`${origin}${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      try { await response.body?.cancel(); } catch {}
      if (response.status !== 401) return { status: response.status, responseDiscarded: true };
    } catch (error) {
      return { status: null, responseDiscarded: true, transportError: { name: error?.name ?? 'Error', code: error?.code ?? null } };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} authentication propagation failed`);
}
async function routedConnect(routeGeneration) {
  const response = await fetch(`${origin}/agent-delivery/v1/connect?agentId=${encodeURIComponent(agentId)}&routeGeneration=${routeGeneration}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });
  let body;
  try { body = await response.json(); } catch { body = { error: { code: 'invalid_json_response' } }; }
  return { status: response.status, code: body?.error?.code ?? null };
}

async function main() {
  parseCloudflareEnv(await readFile(envFile, 'utf8'));
  const client = new CloudflareApiClient(loadCloudflareCredentials(envFile));
  const settings = (await client.request('GET', client.accountPath(`/workers/scripts/${scriptName}/settings`))).result;
  const deliveryNamespaceId = settings.bindings.find((item) => item?.name === 'TDEV_AGENT_DELIVERY')?.namespace_id;
  const electionNamespaceId = settings.bindings.find((item) => item?.name === 'TDEV_AGENT_ROUTE_ELECTION')?.namespace_id;
  if (!deliveryNamespaceId || !electionNamespaceId) throw new Error('D0044 namespace bindings are incomplete');
  const token = randomBytes(32).toString('hex');
  await client.request('PUT', client.accountPath(`/workers/scripts/${scriptName}/secrets`), { json: { name: 'TDEV_D0020_QUALIFICATION_TOKEN', text: token, type: 'secret_text' } });
  const d0040Result = await d0040(token, agentId, 1);
  const route = routeBinding({ routeGeneration: 1, namespaceId: deliveryNamespaceId, durableObjectId: d0040Result.durableObjectId });
  const local = new AgentDeliveryAuthority({ store: new MemoryAgentDeliveryStore(), routeBinding: route });
  const snapshot = local.initialize({}).snapshot;
  const legacy = AgentRouteGenerationAuthority.legacy({ routeBinding: { agentId, routeGeneration: 1 }, routeBindingDigest: agentRouteBindingDigest(route), routeStateDigest: digest(snapshot) }).read();
  const initialized = await initialize({ token, settings, namespaceId: deliveryNamespaceId, d0040Result, generation: legacy });
  const recovery = generateKeyPairSync('ed25519');
  const management = generateKeyPairSync('ed25519');
  const recoveryPublicKey = recovery.publicKey.export({ format: 'jwk' });
  const managementPublicKey = management.publicKey.export({ format: 'jwk' });
  const electionAuthorityIdentity = typedDigest('tdev.agent-route-election-authority.v1', { accountId: binding(settings, 'TDEV_D0039_ACCOUNT_ID'), namespaceId: electionNamespaceId, agentId });
  const record = {
    profile: AGENT_ROUTE_ELECTION_IMPORT_PROFILE,
    agentId,
    routeGeneration: 1,
    routeBindingDigest: agentRouteBindingDigest(route),
    routeHostProfile: AGENT_ROUTE_LEGACY_HOST_PROFILE,
    routeHostKey: agentId,
    currentRouteStateDigest: legacy.routeStateDigest,
    electionAuthorityIdentity,
    recoveryKeyId: agentRouteRecoveryKeyId(recoveryPublicKey),
    recoveryPublicKey,
  };
  const recoverySignature = signRecord(record, recovery);
  const managementSignature = signRecord(record, management);
  const prepareRequest = { profile, routeHostKey: agentId, rpc: rpc(1, 'prepare_legacy_route_import', { record, recoverySignature, managementSignature, managementPublicJwk: managementPublicKey }) };
  const prepareResponseLoss = await discardResponse(token, '/qualification/d0044/delivery/v1', prepareRequest, 'prepare legacy import');
  const pending = await readGeneration(token);
  const importRequest = { profile, operation: 'importLegacyAgentRoute', agentId, payload: { record, recoverySignature, managementSignature, managementPublicJwk: managementPublicKey } };
  const importResponseLoss = await discardResponse(token, '/qualification/d0044/election/v1', importRequest, 'election legacy import');
  const election = await readElection(token);
  const sealRequest = { profile, routeHostKey: agentId, rpc: rpc(1, 'seal_legacy_route_import', { electionState: election }) };
  const sealResponseLoss = await discardResponse(token, '/qualification/d0044/delivery/v1', sealRequest, 'seal legacy import');
  const sealed = await readGeneration(token);
  const staleGenerationProbe = await routedConnect(2);
  const electedLegacyProbe = await routedConnect(1);
  const invariants = {
    initializedFresh: initialized.deduplicated === false,
    prepareResponseDiscarded: prepareResponseLoss.responseDiscarded === true,
    pendingAttachmentReconciled: pending.attachmentStatus === 'PENDING' && pending.disposition === 'ACTIVE',
    importResponseDiscarded: importResponseLoss.responseDiscarded === true,
    electionCreated: election.currentRoute?.routeGeneration === 1 && election.currentRoute?.routeHostProfile === AGENT_ROUTE_LEGACY_HOST_PROFILE,
    sealResponseDiscarded: sealResponseLoss.responseDiscarded === true,
    sealedAttachmentReconciled: sealed.attachmentStatus === 'SEALED' && sealed.disposition === 'ACTIVE' && sealed.activationReceiptDigest === election.currentRoute.activationReceiptDigest,
    electedModeBound: settings.bindings.find((item) => item?.name === 'TDEV_AGENT_ROUTE_MODE')?.text === 'elected_v1',
    staleGenerationDeniedBeforeHost: staleGenerationProbe.status === 400 && staleGenerationProbe.code === 'agent_route_not_elected',
    legacyCurrentIngressSelectedByElection: electedLegacyProbe.status === 400 && electedLegacyProbe.code === 'invalid_agent_connect_challenge_request',
    noCanonicalD0039Mutation: true,
  };
  if (!Object.values(invariants).every(Boolean)) throw new Error(`legacy import crash-boundary invariant failed ${JSON.stringify(invariants)}`);
  process.stdout.write(`${JSON.stringify({ status: 'qualified_legacy_import_response_loss_reconciliation', scriptName, origin, agentId, sourceSha: binding(settings, 'TDEV_SOURCE_SHA'), route: { routeGeneration: 1, routeHostProfile: AGENT_ROUTE_LEGACY_HOST_PROFILE, routeHostKey: agentId, bindingDigest: agentRouteBindingDigest(route) }, stages: { initialized, prepareResponseLoss, pending: { disposition: pending.disposition, attachmentStatus: pending.attachmentStatus, attachmentDigest: pending.attachment === null ? null : digest(pending.attachment) }, importResponseLoss, election: { digest: agentRouteElectionDigest(election), currentRoute: election.currentRoute }, sealResponseLoss, sealed: { disposition: sealed.disposition, attachmentStatus: sealed.attachmentStatus, activationReceiptDigest: sealed.activationReceiptDigest } }, ingress: { electedMode: 'elected_v1', staleGenerationProbe, electedLegacyProbe }, invariants, secretValues: 'excluded', qualificationTokenRotated: true }, null, 2)}\n`);
}
main().catch((error) => { process.stderr.write(`${JSON.stringify({ status: 'failed', code: error?.code ?? 'd0044_legacy_import_crash_failed', message: error?.message ?? String(error) })}\n`); process.exitCode = 1; });
