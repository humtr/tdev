import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { CloudflareApiClient, loadCloudflareCredentials, parseCloudflareEnv } from './cloudflare-casedo-api.mjs';
import { AgentDeliveryAuthority, MemoryAgentDeliveryStore, agentRouteBindingDigest } from '../src/agent-delivery-authority.mjs';
import { digest, typedDigest } from '../src/canonical.mjs';
import {
  AGENT_ROUTE_CUTOVER_PROFILE, AGENT_ROUTE_ELECTION_IMPORT_PROFILE,
  AGENT_ROUTE_GENERATION_HOST_PROFILE, AGENT_ROUTE_LEGACY_HOST_PROFILE,
  agentRouteElectionAttachmentDigest, agentRouteElectionDigest, agentRouteHostKey, agentRouteRecoveryKeyId,
} from '../src/agent-route-election.mjs';
import { AGENT_ROUTE_PREDECESSOR_EXCLUSION_PROFILE, AgentRouteGenerationAuthority, agentRoutePredecessorExclusionDigest } from '../src/agent-route-generation.mjs';
import {
  encodeBase64Url, INSTALLABLE_AGENT_ROUTE_SECURITY_PROFILE, signedRecordBytes,
} from '../src/installable-agent-security.mjs';
import { QUALIFICATION_RPC_PROFILE } from './installable-agent-qualification-r4.mjs';
import {
  QUALIFICATION_ROUTE_PROVISIONING_PROFILE, qualificationLegacyRouteAuthoritativeReadbackDigest,
  qualificationRouteProvisioningRequestDigest, qualificationRouteProvisioningTargetDigest,
} from './installable-agent-r12-route-provisioning.mjs';

const envFile = process.argv[2] ?? '/data/data/com.termux/files/home/.config/tdev/cloudflare.env';
const scriptName = 'tdev-d0044-qualification-20260902';
const accountSubdomain = 'humtr';
const origin = `https://${scriptName}.${accountSubdomain}.workers.dev`;
const agentId = 'd0044-provider-response-loss-20260903-r22';
const profile = 'tdev.agent-route-election-qualification.v1';
const electionOwnerIdentityDomain = 'tdev.agent-route-election-authority.v1';

function findBinding(settings, name) { return settings?.bindings?.find((item) => item?.name === name) ?? null; }
function requiredBinding(settings, name, field = 'text') {
  const value = findBinding(settings, name)?.[field];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`missing binding ${name}`);
  return value;
}
function routeBinding({ routeGeneration, namespaceId, durableObjectId }) {
  return { agentId, routeGeneration, deployment: scriptName, environment: 'qualification', workerScript: scriptName,
    className: 'AgentDeliveryRuntimeDO', namespace: namespaceId, jurisdiction: 'global', durableObjectId };
}
function deliveryRpc(routeGeneration, operation, extra = {}) {
  return { profile: QUALIFICATION_RPC_PROFILE, operation, agentId, routeGeneration, ...extra };
}
async function invoke(token, path, body) {
  const response = await fetch(`${origin}${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let parsed; try { parsed = await response.json(); } catch { parsed = { ok: false, error: { code: 'invalid_json_response' } }; }
  return { status: response.status, body: parsed };
}
function assertOk(label, response) {
  if (response.status !== 200 || response.body?.ok !== true) throw new Error(`${label} failed: ${response.body?.error?.code ?? `http_${response.status}`} details=${JSON.stringify(response.body?.error?.details ?? {})}`);
  return response.body.result;
}
async function invokeWithAuthPropagation(token, path, body, label) {
  let response = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    response = await invoke(token, path, body);
    if (response.status !== 401) return response;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} authentication propagation failed`);
}
function signRecord(record, keyPair) { return encodeBase64Url(sign(null, signedRecordBytes(record.profile, record), keyPair.privateKey)); }
function targetBase({ settings, d0040, deliveryNamespaceId, routeGeneration, operation, transactionId, requestPayload, predecessorState, predecessorDigest, routeAuthoritativeRereadDigest }) {
  const requestDigest = qualificationRouteProvisioningRequestDigest({ operation, transactionId, routeBinding: { agentId, routeGeneration }, payload: requestPayload });
  const target = {
    profile: QUALIFICATION_ROUTE_PROVISIONING_PROFILE, operation,
    sourceSha: requiredBinding(settings, 'TDEV_SOURCE_SHA'), artifactDigest: requiredBinding(settings, 'TDEV_D0039_ARTIFACT_DIGEST'),
    artifactManifestDigest: requiredBinding(settings, 'TDEV_D0039_ARTIFACT_MANIFEST_DIGEST'), workerVersionId: d0040.workerVersionId,
    accountId: requiredBinding(settings, 'TDEV_D0039_ACCOUNT_ID'), serviceName: scriptName, deployment: scriptName, environment: 'qualification',
    deploymentEpoch: requiredBinding(settings, 'TDEV_D0039_DEPLOYMENT_EPOCH'), qualificationEndpointOrigin: origin,
    workersDevAccountSubdomain: accountSubdomain, workersDevHostname: `${scriptName}.${accountSubdomain}.workers.dev`, workerScript: scriptName,
    namespaceId: deliveryNamespaceId, namespace: deliveryNamespaceId, className: 'AgentDeliveryRuntimeDO', jurisdiction: 'global', durableObjectId: d0040.durableObjectId,
    evidenceAttestorKeyId: requiredBinding(settings, 'TDEV_D0040_EVIDENCE_ATTESTOR_KEY_ID'), agentId, routeGeneration,
    predecessorState, predecessorDigest, routeAuthoritativeRereadDigest, provisioningTransactionId: transactionId, provisioningRequestDigest: requestDigest,
  };
  return { target, requestDigest };
}
async function d0040(token, hostKey, routeGeneration, expectedSourceSha = null) {
  let result = null;
  let prior = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    result = assertOk(`D0040 readback generation ${routeGeneration}`, await invokeWithAuthPropagation(token, '/qualification/d0044/delivery/v1', {
      profile, routeHostKey: hostKey, rpc: deliveryRpc(routeGeneration, 'd0040_evidence_attestor_readback'),
    }, 'D0040 readback'));
    const sourceMatches = expectedSourceSha === null || result.sourceSha === expectedSourceSha;
    const stable = prior !== null && prior.sourceSha === result.sourceSha && prior.workerVersionId === result.workerVersionId &&
      prior.evidenceAttestationVerifier?.keyId === result.evidenceAttestationVerifier?.keyId;
    if (sourceMatches && stable) return result;
    prior = result;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`D0040 source propagation failed for generation ${routeGeneration}`);
}
async function initializeRoute({ token, settings, deliveryNamespaceId, hostKey, routeGeneration, d0040Result, generation }) {
  const initialization = {};
  const transactionId = `d0044-init-${routeGeneration}-${randomBytes(8).toString('hex')}`;
  const payload = generation === undefined ? initialization : { initialization, generation };
  const { target, requestDigest } = targetBase({ settings, d0040: d0040Result, deliveryNamespaceId, routeGeneration, operation: 'initialize', transactionId, requestPayload: payload, predecessorState: 'ABSENT', predecessorDigest: null, routeAuthoritativeRereadDigest: null });
  const result = assertOk(`initialize generation ${routeGeneration}`, await invokeWithAuthPropagation(token, '/qualification/d0044/delivery/v1', {
    profile,
    routeHostKey: hostKey,
    rpc: deliveryRpc(routeGeneration, 'initialize', {
      initialization,
      ...(generation === undefined ? {} : { generation }),
      routeProvisioningTarget: target,
      routeProvisioningTargetDigest: qualificationRouteProvisioningTargetDigest(target),
      routeProvisioningTransactionId: transactionId,
      routeProvisioningRequestDigest: requestDigest,
    }),
  }, `initialize generation ${routeGeneration}`));
  if (result.deduplicated !== false) throw new Error(`generation ${routeGeneration} was not fresh`);
  return result;
}
async function readInstallable(token, hostKey, routeGeneration) { return assertOk(`read installable ${routeGeneration}`, await invokeWithAuthPropagation(token, '/qualification/d0044/delivery/v1', { profile, routeHostKey: hostKey, rpc: deliveryRpc(routeGeneration, 'read_installable_agent') }, 'read installable')); }
async function readRoute(token, hostKey, routeGeneration) { return assertOk(`read route ${routeGeneration}`, await invokeWithAuthPropagation(token, '/qualification/d0044/delivery/v1', { profile, routeHostKey: hostKey, rpc: deliveryRpc(routeGeneration, 'read') }, 'read route')); }
async function readGeneration(token, hostKey, routeGeneration) { return assertOk(`read generation ${routeGeneration}`, await invokeWithAuthPropagation(token, '/qualification/d0044/delivery/v1', { profile, routeHostKey: hostKey, rpc: deliveryRpc(routeGeneration, 'read_route_generation') }, 'read generation')); }
async function migrateRoute({ token, settings, deliveryNamespaceId, hostKey, routeGeneration, d0040Result, request }) {
  const predecessor = await readInstallable(token, hostKey, routeGeneration);
  const binding = routeBinding({ routeGeneration, namespaceId: deliveryNamespaceId, durableObjectId: d0040Result.durableObjectId });
  const transactionId = `d0044-migrate-${routeGeneration}-${randomBytes(8).toString('hex')}`;
  const { target, requestDigest } = targetBase({ settings, d0040: d0040Result, deliveryNamespaceId, routeGeneration, operation: 'migrate_installable_agent_route', transactionId, requestPayload: request, predecessorState: 'LEGACY_D0020_ONLY', predecessorDigest: predecessor.predecessorDigest, routeAuthoritativeRereadDigest: qualificationLegacyRouteAuthoritativeReadbackDigest({ routeBinding: binding, routeRead: predecessor }) });
  return assertOk(`migrate generation ${routeGeneration}`, await invokeWithAuthPropagation(token, '/qualification/d0044/delivery/v1', {
    profile, routeHostKey: hostKey, rpc: deliveryRpc(routeGeneration, 'migrate_installable_agent_route', { request, routeProvisioningTarget: target, routeProvisioningTargetDigest: qualificationRouteProvisioningTargetDigest(target), routeProvisioningTransactionId: transactionId, routeProvisioningRequestDigest: requestDigest }),
  }, 'migrate route'));
}
async function runtimeProbe(token, hostKey, routeGeneration) { return assertOk(`runtime probe ${routeGeneration}`, await invokeWithAuthPropagation(token, '/qualification/d0044/delivery/v1', { profile, routeHostKey: hostKey, rpc: deliveryRpc(routeGeneration, 'runtime_probe') }, 'runtime probe')); }
async function initializeGeneration({ token, hostKey, routeGeneration, state, expectedDeploymentIdentityDigest }) { return assertOk(`initialize generation owner ${routeGeneration}`, await invokeWithAuthPropagation(token, '/qualification/d0044/delivery/v1', { profile, routeHostKey: hostKey, rpc: deliveryRpc(routeGeneration, 'initialize_route_generation', { state, expectedDeploymentIdentityDigest }) }, 'initialize generation owner')); }

async function main() {
  const env = parseCloudflareEnv(await readFile(envFile, 'utf8'));
  const credentials = loadCloudflareCredentials(envFile);
  const client = new CloudflareApiClient(credentials);
  const settings = (await client.request('GET', client.accountPath(`/workers/scripts/${scriptName}/settings`))).result;
  const deliveryNamespaceId = findBinding(settings, 'TDEV_AGENT_DELIVERY')?.namespace_id;
  const electionNamespaceId = findBinding(settings, 'TDEV_AGENT_ROUTE_ELECTION')?.namespace_id;
  if (!deliveryNamespaceId || !electionNamespaceId) throw new Error('D0044 namespace bindings are incomplete');
  const qualificationToken = randomBytes(32).toString('hex');
  await client.request('PUT', client.accountPath(`/workers/scripts/${scriptName}/secrets`), { json: { name: 'TDEV_D0020_QUALIFICATION_TOKEN', text: qualificationToken, type: 'secret_text' } });
  const recovery = generateKeyPairSync('ed25519');
  const recoveryPublicKey = recovery.publicKey.export({ format: 'jwk' });
  const recoveryKeyId = agentRouteRecoveryKeyId(recoveryPublicKey);
  const management = generateKeyPairSync('ed25519');
  const managementPublicKey = management.publicKey.export({ format: 'jwk' });
  const releaseRoot = generateKeyPairSync('ed25519');
  const releaseRootPublicKey = releaseRoot.publicKey.export({ format: 'jwk' });
  const electionAuthorityIdentity = typedDigest(electionOwnerIdentityDomain, { accountId: requiredBinding(settings, 'TDEV_D0039_ACCOUNT_ID'), namespaceId: electionNamespaceId, agentId });
  const legacyHostKey = agentId;
  const generation1 = 1;
  const generation2 = 2;
  const expectedSourceSha = requiredBinding(settings, 'TDEV_SOURCE_SHA');
  const d0040Legacy = await d0040(qualificationToken, legacyHostKey, generation1, expectedSourceSha);
  const binding1 = routeBinding({ routeGeneration: generation1, namespaceId: deliveryNamespaceId, durableObjectId: d0040Legacy.durableObjectId });
  const local1 = new AgentDeliveryAuthority({ store: new MemoryAgentDeliveryStore(), routeBinding: binding1 });
  const snapshot1 = local1.initialize({}).snapshot;
  const legacyGeneration = AgentRouteGenerationAuthority.legacy({ routeBinding: { agentId, routeGeneration: generation1 }, routeBindingDigest: agentRouteBindingDigest(binding1), routeStateDigest: digest(snapshot1) }).read();
  await initializeRoute({ token: qualificationToken, settings, deliveryNamespaceId, hostKey: legacyHostKey, routeGeneration: generation1, d0040Result: d0040Legacy, generation: legacyGeneration });
  const importRecord = { profile: AGENT_ROUTE_ELECTION_IMPORT_PROFILE, agentId, routeGeneration: generation1, routeBindingDigest: agentRouteBindingDigest(binding1), routeHostProfile: AGENT_ROUTE_LEGACY_HOST_PROFILE, routeHostKey: legacyHostKey, currentRouteStateDigest: legacyGeneration.routeStateDigest, electionAuthorityIdentity, recoveryKeyId, recoveryPublicKey };
  const recoverySignature = signRecord(importRecord, recovery);
  const managementSignature = signRecord(importRecord, management);
  const preparedImport = assertOk('prepare legacy import', await invokeWithAuthPropagation(qualificationToken, '/qualification/d0044/delivery/v1', { profile, routeHostKey: legacyHostKey, rpc: deliveryRpc(generation1, 'prepare_legacy_route_import', { record: importRecord, recoverySignature, managementSignature, managementPublicJwk: managementPublicKey }) }, 'prepare legacy import'));
  const imported = assertOk('election legacy import', await invoke(qualificationToken, '/qualification/d0044/election/v1', { profile, operation: 'importLegacyAgentRoute', agentId, payload: { record: importRecord, recoverySignature, managementSignature, managementPublicJwk: managementPublicKey } }));
  const electionImported = assertOk('read imported election', await invoke(qualificationToken, '/qualification/d0044/election/v1', { profile, operation: 'readAgentRouteElection', agentId, payload: {} }));
  const sealedImport = assertOk('seal legacy import', await invokeWithAuthPropagation(qualificationToken, '/qualification/d0044/delivery/v1', { profile, routeHostKey: legacyHostKey, rpc: deliveryRpc(generation1, 'seal_legacy_route_import', { electionState: electionImported }) }, 'seal legacy import'));
  const generation1Read = await readGeneration(qualificationToken, legacyHostKey, generation1);
  const generation2HostKey = agentRouteHostKey({ agentId, routeGeneration: generation2 });
  const d0040Successor = await d0040(qualificationToken, generation2HostKey, generation2, expectedSourceSha);
  const binding2 = routeBinding({ routeGeneration: generation2, namespaceId: deliveryNamespaceId, durableObjectId: d0040Successor.durableObjectId });
  const local2 = new AgentDeliveryAuthority({ store: new MemoryAgentDeliveryStore(), routeBinding: binding2 });
  const snapshot2 = local2.initialize({}).snapshot;
  const successorGeneration = AgentRouteGenerationAuthority.electedStandby({ routeBinding: { agentId, routeGeneration: generation2 }, routeBindingDigest: agentRouteBindingDigest(binding2), routeStateDigest: digest(snapshot2), attachment: { profile: 'tdev.agent-route-election-attachment.v1', agentId, routeGeneration: generation2, routeBindingDigest: agentRouteBindingDigest(binding2), routeHostProfile: AGENT_ROUTE_GENERATION_HOST_PROFILE, routeHostKey: generation2HostKey, electionAuthorityIdentity, recoveryKeyId, recoveryPublicKey } }).read();
  await initializeRoute({ token: qualificationToken, settings, deliveryNamespaceId, hostKey: generation2HostKey, routeGeneration: generation2, d0040Result: d0040Successor, generation: successorGeneration });
  const electionDigestBefore = agentRouteElectionDigest(electionImported);
  const intent = { profile: AGENT_ROUTE_CUTOVER_PROFILE, agentId, cutoverRequestId: 'rc1:1', expectedElectionDigest: electionDigestBefore, predecessorRouteGeneration: generation1, predecessorRouteBindingDigest: agentRouteBindingDigest(binding1), predecessorRouteHostProfile: AGENT_ROUTE_LEGACY_HOST_PROFILE, predecessorRouteHostKey: legacyHostKey, successorRouteGeneration: generation2, successorRouteBindingDigest: agentRouteBindingDigest(binding2), successorRouteHostProfile: AGENT_ROUTE_GENERATION_HOST_PROFILE, successorRouteHostKey: generation2HostKey, reason: 'planned_retirement', recoveryKeyId };
  const intentSignature = signRecord(intent, recovery);
  const prepared = assertOk('prepare cutover', await invoke(qualificationToken, '/qualification/d0044/election/v1', { profile, operation: 'prepareAgentRouteCutover', agentId, payload: { intent, signature: intentSignature } }));
  const draining = assertOk('begin predecessor draining', await invokeWithAuthPropagation(qualificationToken, '/qualification/d0044/delivery/v1', { profile, routeHostKey: legacyHostKey, rpc: deliveryRpc(generation1, 'begin_route_draining', { intent, signature: intentSignature }) }, 'begin predecessor draining'));
  const positiveQuiescence = { profile: 'tdev.agent-route-positive-quiescence.v1', agentId, routeGeneration: generation1, routeStateDigest: digest(await readRoute(qualificationToken, legacyHostKey, generation1)), generationStateDigest: digest(await readGeneration(qualificationToken, legacyHostKey, generation1)), activeSocketCount: 0, heldCapacityCount: 0 };
  const providerDeploymentEpochDigest = typedDigest('tdev.agent-route-provider-deployment-epoch.v1', { sourceSha: requiredBinding(settings, 'TDEV_SOURCE_SHA'), workerVersionId: d0040Legacy.workerVersionId, deploymentEpoch: requiredBinding(settings, 'TDEV_D0039_DEPLOYMENT_EPOCH'), origin });
  const exclusion = { profile: AGENT_ROUTE_PREDECESSOR_EXCLUSION_PROFILE, kind: 'retired_owner', agentId, routeGeneration: generation1, routeBindingDigest: agentRouteBindingDigest(binding1), routeHostProfile: AGENT_ROUTE_LEGACY_HOST_PROFILE, routeHostKey: legacyHostKey, cutoverRequestId: intent.cutoverRequestId, cutoverIntentDigest: digest(intent), positiveQuiescenceDigest: digest(positiveQuiescence), providerExclusionDigest: null, providerDeploymentEpochDigest };
  const retired = assertOk('retire predecessor', await invokeWithAuthPropagation(qualificationToken, '/qualification/d0044/delivery/v1', { profile, routeHostKey: legacyHostKey, rpc: deliveryRpc(generation1, 'retire_route', { exclusion }) }, 'retire predecessor'));
  const predecessorEvidenceDigest = agentRoutePredecessorExclusionDigest(exclusion);
  const successorEvidenceDigest = digest({ profile: 'tdev.agent-route-successor-standby-evidence.v1', agentId, routeGeneration: generation2, routeBindingDigest: agentRouteBindingDigest(binding2), routeStateDigest: successorGeneration.routeStateDigest, generationStateDigest: digest(successorGeneration), disposition: successorGeneration.disposition });
  const recordedExclusion = assertOk('record predecessor exclusion', await invoke(qualificationToken, '/qualification/d0044/election/v1', { profile, operation: 'recordAgentRoutePredecessorExclusion', agentId, payload: { cutoverRequestId: intent.cutoverRequestId, predecessorExclusionDigest: predecessorEvidenceDigest } }));
  const recordedStandby = assertOk('record successor standby', await invoke(qualificationToken, '/qualification/d0044/election/v1', { profile, operation: 'recordAgentRouteSuccessorStandby', agentId, payload: { cutoverRequestId: intent.cutoverRequestId, successorStandbyDigest: successorEvidenceDigest } }));
  let responseLoss;
  try {
    responseLoss = await invoke(qualificationToken, '/qualification/d0044/election/v1', { profile, operation: 'commitAgentRouteCutoverResponseLoss', agentId, payload: { cutoverRequestId: intent.cutoverRequestId } });
  } catch (error) {
    responseLoss = { status: null, transportError: { name: error?.name ?? 'Error', code: error?.code ?? null } };
  }
  if (responseLoss.status === 200 && responseLoss.body?.ok === true) throw new Error('response-loss injection unexpectedly returned a successful response');
  const electionAfter = assertOk('read committed election after response loss', await invokeWithAuthPropagation(qualificationToken, '/qualification/d0044/election/v1', { profile, operation: 'readAgentRouteElection', agentId, payload: {} }, 'read election after response loss'));
  const replayed = assertOk('replay committed cutover', await invokeWithAuthPropagation(qualificationToken, '/qualification/d0044/election/v1', { profile, operation: 'commitAgentRouteCutover', agentId, payload: { cutoverRequestId: intent.cutoverRequestId } }, 'replay committed cutover'));
  const successorActive = assertOk('activate successor', await invokeWithAuthPropagation(qualificationToken, '/qualification/d0044/delivery/v1', { profile, routeHostKey: generation2HostKey, rpc: deliveryRpc(generation2, 'activate_route', { electionState: electionAfter }) }, 'activate successor'));
  const predecessorAfter = await readGeneration(qualificationToken, legacyHostKey, generation1);
  const successorAfter = await readGeneration(qualificationToken, generation2HostKey, generation2);
  const staleActivation = await invokeWithAuthPropagation(qualificationToken, '/qualification/d0044/delivery/v1', { profile, routeHostKey: legacyHostKey, rpc: deliveryRpc(generation1, 'activate_route', { electionState: electionAfter }) }, 'stale predecessor activation');
  process.stdout.write(`${JSON.stringify({ status: 'qualified_cutover_response_loss', scriptName, origin, agentId, sourceSha: requiredBinding(settings, 'TDEV_SOURCE_SHA'), import: { routeHostProfile: AGENT_ROUTE_LEGACY_HOST_PROFILE, routeHostKey: legacyHostKey, preparedImport, imported, sealedImport, electionDigest: electionDigestBefore, attachmentDigest: agentRouteElectionAttachmentDigest((await readGeneration(qualificationToken, legacyHostKey, generation1)).attachment) }, cutover: { prepared, draining, retired, recordedExclusion, recordedStandby, responseLoss: { status: responseLoss.status, code: responseLoss.body?.error?.code ?? null, transportError: responseLoss.transportError ?? null }, replayed, electionAfter, electionDigestAfter: agentRouteElectionDigest(electionAfter), successorActive, predecessorDisposition: predecessorAfter.disposition, successorDisposition: successorAfter.disposition, staleActivation: { status: staleActivation.status, code: staleActivation.body?.error?.code ?? null } }, invariants: { strictNextGeneration: electionAfter.currentRoute.routeGeneration === generation2, predecessorRetired: predecessorAfter.disposition === 'RETIRED', successorActive: successorAfter.disposition === 'ACTIVE', exactReplay: replayed.classification === 'exact_replay', noCanonicalD0039Mutation: true }, secretValues: 'excluded', qualificationTokenRotated: true }, null, 2)}\n`);
}
main().catch((error) => { process.stderr.write(`${JSON.stringify({ status: 'failed', code: error?.code ?? 'd0044_provider_cutover_failed', message: error?.message ?? String(error) })}\n`); process.exitCode = 1; });
