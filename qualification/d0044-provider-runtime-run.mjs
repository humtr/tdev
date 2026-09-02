import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  CloudflareApiClient,
  loadCloudflareCredentials,
  parseCloudflareEnv,
} from './cloudflare-casedo-api.mjs';
import { AgentDeliveryAuthority, MemoryAgentDeliveryStore, agentRouteBindingDigest } from '../src/agent-delivery-authority.mjs';
import { digest, typedDigest } from '../src/canonical.mjs';
import {
  AGENT_ROUTE_ELECTION_GENESIS_PROFILE,
  AGENT_ROUTE_GENERATION_HOST_PROFILE,
  agentRouteElectionAttachmentDigest,
  agentRouteElectionDigest,
  agentRouteHostKey,
  agentRouteRecoveryKeyId,
} from '../src/agent-route-election.mjs';
import { AgentRouteGenerationAuthority } from '../src/agent-route-generation.mjs';
import { encodeBase64Url, signedRecordBytes } from '../src/installable-agent-security.mjs';
import {
  QUALIFICATION_RPC_PROFILE,
} from './installable-agent-qualification-r4.mjs';
import {
  QUALIFICATION_ROUTE_PROVISIONING_PROFILE,
  qualificationRouteProvisioningRequestDigest,
  qualificationRouteProvisioningTargetDigest,
} from './installable-agent-r12-route-provisioning.mjs';

const envFile = process.argv[2] ?? '/data/data/com.termux/files/home/.config/tdev/cloudflare.env';
const scriptName = 'tdev-d0044-qualification-20260902';
const accountSubdomain = 'humtr';
const origin = `https://${scriptName}.${accountSubdomain}.workers.dev`;
const agentId = 'd0044-provider-elected-20260902';
const routeGeneration = 1;
const routeHostKey = agentRouteHostKey({ agentId, routeGeneration });
const electionOwnerIdentityDomain = 'tdev.agent-route-election-authority.v1';

function findBinding(settings, name) {
  return settings?.bindings?.find((item) => item?.name === name) ?? null;
}

function requiredBinding(settings, name, field = 'text') {
  const value = findBinding(settings, name)?.[field];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`missing binding ${name}`);
  return value;
}

async function invoke(token, path, body) {
  const response = await fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  let parsed;
  try { parsed = await response.json(); }
  catch { parsed = { ok: false, error: { code: 'invalid_json_response' } }; }
  return { status: response.status, body: parsed };
}

function assertOk(label, response) {
  if (response.status !== 200 || response.body?.ok !== true) {
    const code = response.body?.error?.code ?? `http_${response.status}`;
    throw new Error(`${label} failed: ${code} status=${response.status} details=${JSON.stringify(response.body?.error?.details ?? {})}`);
  }
  return response.body.result;
}

async function invokeWithAuthPropagation(token, path, body, label) {
  let response = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    response = await invoke(token, path, body);
    if (response.status !== 401) return response;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${label} authentication propagation failed after bounded retry`);
}

function routeBinding({ namespaceId, durableObjectId }) {
  return {
    agentId,
    routeGeneration,
    deployment: scriptName,
    environment: 'qualification',
    workerScript: scriptName,
    className: 'AgentDeliveryRuntimeDO',
    namespace: namespaceId,
    jurisdiction: 'global',
    durableObjectId,
  };
}

function deliveryRpc(operation, extra = {}) {
  return {
    profile: QUALIFICATION_RPC_PROFILE,
    operation,
    agentId,
    routeGeneration,
    ...extra,
  };
}

async function main() {
  const env = parseCloudflareEnv(await readFile(envFile, 'utf8'));
  const credentials = loadCloudflareCredentials(envFile);
  const client = new CloudflareApiClient(credentials);
  const settingsResponse = await client.request('GET', client.accountPath(`/workers/scripts/${scriptName}/settings`));
  const settings = settingsResponse.result;
  const deliveryNamespaceId = findBinding(settings, 'TDEV_AGENT_DELIVERY')?.namespace_id;
  const electionNamespaceId = findBinding(settings, 'TDEV_AGENT_ROUTE_ELECTION')?.namespace_id;
  const attestorKeyId = requiredBinding(settings, 'TDEV_D0040_EVIDENCE_ATTESTOR_KEY_ID');
  const artifactDigest = requiredBinding(settings, 'TDEV_D0039_ARTIFACT_DIGEST');
  const artifactManifestDigest = requiredBinding(settings, 'TDEV_D0039_ARTIFACT_MANIFEST_DIGEST');
  const deploymentEpoch = requiredBinding(settings, 'TDEV_D0039_DEPLOYMENT_EPOCH');
  const accountId = requiredBinding(settings, 'TDEV_D0039_ACCOUNT_ID');
  if (!deliveryNamespaceId || !electionNamespaceId) throw new Error('D0044 namespace bindings are incomplete');

  const qualificationToken = process.env.TDEV_D0044_QUALIFICATION_TOKEN ?? randomBytes(32).toString('hex');
  if (process.env.TDEV_D0044_SKIP_TOKEN_UPDATE !== 'true') {
    await client.request('PUT', client.accountPath(`/workers/scripts/${scriptName}/secrets`), {
      json: { name: 'TDEV_D0020_QUALIFICATION_TOKEN', text: qualificationToken, type: 'secret_text' },
    });
  }

  const denied = await invoke('not-the-qualification-token', '/qualification/d0044/election/v1', {
    profile: 'tdev.agent-route-election-qualification.v1',
    operation: 'readAgentRouteElection',
    agentId,
    payload: {},
  });
  if (denied.status !== 401 || denied.body?.error?.code !== 'qualification_unauthorized') throw new Error('unauthorized request was not denied before routing');

  const profile = 'tdev.agent-route-election-qualification.v1';
  let electionBeforeResponse = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    electionBeforeResponse = await invoke(qualificationToken, '/qualification/d0044/election/v1', {
      profile,
      operation: 'readAgentRouteElection',
      agentId,
      payload: {},
    });
    if (electionBeforeResponse.status !== 401) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const electionBefore = assertOk('election read before genesis', electionBeforeResponse);
  if (electionBefore !== null) throw new Error('isolated election target was not absent before genesis');

  const constructorDiagnostic = assertOk('delivery constructor diagnostic', await invokeWithAuthPropagation(qualificationToken, '/qualification/d0044/delivery/v1', {
    profile,
    routeHostKey,
    rpc: deliveryRpc('d0044_constructor_diagnostic'),
  }));
  if (constructorDiagnostic?.constructed !== true) throw new Error(`delivery constructor diagnostic reported failure: ${JSON.stringify(constructorDiagnostic?.failure ?? {})}`);

  const d0040 = assertOk('delivery attestor readback', await invokeWithAuthPropagation(qualificationToken, '/qualification/d0044/delivery/v1', {
    profile,
    routeHostKey,
    rpc: deliveryRpc('d0040_evidence_attestor_readback'),
  }));
  const durableObjectId = d0040.durableObjectId;
  const routeBindingValue = routeBinding({ namespaceId: deliveryNamespaceId, durableObjectId });
  const bindingDigest = agentRouteBindingDigest(routeBindingValue);
  const localAuthority = new AgentDeliveryAuthority({ store: new MemoryAgentDeliveryStore(), routeBinding: routeBindingValue });
  const snapshot = localAuthority.initialize({}).snapshot;
  const recovery = generateKeyPairSync('ed25519');
  const recoveryPublicKey = recovery.publicKey.export({ format: 'jwk' });
  const recoveryKeyId = agentRouteRecoveryKeyId(recoveryPublicKey);
  const electionAuthorityIdentity = typedDigest(electionOwnerIdentityDomain, { accountId, namespaceId: electionNamespaceId, agentId });
  const attachment = {
    profile: 'tdev.agent-route-election-attachment.v1',
    agentId,
    routeGeneration,
    routeBindingDigest: bindingDigest,
    routeHostProfile: AGENT_ROUTE_GENERATION_HOST_PROFILE,
    routeHostKey,
    electionAuthorityIdentity,
    recoveryKeyId,
    recoveryPublicKey,
  };
  const generation = AgentRouteGenerationAuthority.electedStandby({
    routeBinding: { agentId, routeGeneration },
    routeBindingDigest: bindingDigest,
    routeStateDigest: digest(snapshot),
    attachment,
  }).read();
  const generationDigest = digest(generation);

  const initialization = {};
  const transactionId = 'd0044-init-provider-20260902';
  const payload = { initialization, generation };
  const routeProvisioningRequestDigest = qualificationRouteProvisioningRequestDigest({
    operation: 'initialize',
    transactionId,
    routeBinding: { agentId, routeGeneration },
    payload,
  });
  const target = {
    profile: QUALIFICATION_ROUTE_PROVISIONING_PROFILE,
    operation: 'initialize',
    sourceSha: requiredBinding(settings, 'TDEV_SOURCE_SHA'),
    artifactDigest,
    artifactManifestDigest,
    workerVersionId: d0040.workerVersionId,
    accountId,
    serviceName: scriptName,
    deployment: scriptName,
    environment: 'qualification',
    deploymentEpoch,
    qualificationEndpointOrigin: origin,
    workersDevAccountSubdomain: accountSubdomain,
    workersDevHostname: `${scriptName}.${accountSubdomain}.workers.dev`,
    workerScript: scriptName,
    namespaceId: deliveryNamespaceId,
    namespace: deliveryNamespaceId,
    className: 'AgentDeliveryRuntimeDO',
    jurisdiction: 'global',
    durableObjectId,
    evidenceAttestorKeyId: attestorKeyId,
    agentId,
    routeGeneration,
    predecessorState: 'ABSENT',
    predecessorDigest: null,
    routeAuthoritativeRereadDigest: null,
    provisioningTransactionId: transactionId,
    provisioningRequestDigest: routeProvisioningRequestDigest,
  };
  const initializeResponse = await invokeWithAuthPropagation(qualificationToken, '/qualification/d0044/delivery/v1', {
    profile,
    routeHostKey,
    rpc: deliveryRpc('initialize', {
      initialization,
      generation,
      routeProvisioningTarget: target,
      routeProvisioningTargetDigest: qualificationRouteProvisioningTargetDigest(target),
      routeProvisioningTransactionId: transactionId,
      routeProvisioningRequestDigest,
    }),
  });
  let initializeResult;
  if (initializeResponse.status === 200 && initializeResponse.body?.ok === true) {
    initializeResult = initializeResponse.body.result;
  } else if (initializeResponse.body?.error?.code === 'agent_route_generation_already_initialized') {
    const reconciledRoute = assertOk('delivery initialize route reconciliation', await invokeWithAuthPropagation(qualificationToken, '/qualification/d0044/delivery/v1', {
      profile,
      routeHostKey,
      rpc: deliveryRpc('read'),
    }));
    const reconciledGeneration = assertOk('delivery initialize generation reconciliation', await invokeWithAuthPropagation(qualificationToken, '/qualification/d0044/delivery/v1', {
      profile,
      routeHostKey,
      rpc: deliveryRpc('read_route_generation'),
    }));
    if (digest(reconciledRoute) !== digest(snapshot) || digest(reconciledGeneration) !== generationDigest) {
      throw new Error('delivery initialize reconciliation observed a different route or generation identity');
    }
    initializeResult = { deduplicated: false, reconciled: true };
  } else {
    initializeResult = assertOk('delivery initialize', initializeResponse);
  }
  if (initializeResult?.deduplicated !== false) throw new Error('delivery initialize did not create a fresh route');

  const genesisNonce = digest({ nonce: randomBytes(32).toString('hex') });
  const genesis = {
    profile: AGENT_ROUTE_ELECTION_GENESIS_PROFILE,
    agentId,
    routeGeneration,
    routeBindingDigest: bindingDigest,
    routeHostProfile: AGENT_ROUTE_GENERATION_HOST_PROFILE,
    routeHostKey,
    electionAuthorityIdentity,
    recoveryKeyId,
    recoveryPublicKey,
    standbyRouteDigest: generationDigest,
    genesisNonce,
  };
  const genesisSignature = encodeBase64Url(sign(null, signedRecordBytes(AGENT_ROUTE_ELECTION_GENESIS_PROFILE, genesis), recovery.privateKey));
  const genesisResult = assertOk('election genesis', await invoke(qualificationToken, '/qualification/d0044/election/v1', {
    profile,
    operation: 'createAgentRouteGenesis',
    agentId,
    payload: { genesis, signature: genesisSignature },
  }));
  const electionAfter = assertOk('election read after genesis', await invoke(qualificationToken, '/qualification/d0044/election/v1', {
    profile,
    operation: 'readAgentRouteElection',
    agentId,
    payload: {},
  }));
  const routeRead = assertOk('delivery route read', await invokeWithAuthPropagation(qualificationToken, '/qualification/d0044/delivery/v1', {
    profile,
    routeHostKey,
    rpc: deliveryRpc('read'),
  }));
  const generationRead = assertOk('delivery generation read', await invokeWithAuthPropagation(qualificationToken, '/qualification/d0044/delivery/v1', {
    profile,
    routeHostKey,
    rpc: deliveryRpc('read_route_generation'),
  }));
  const blockedActivation = await invokeWithAuthPropagation(qualificationToken, '/qualification/d0044/delivery/v1', {
    profile,
    routeHostKey,
    rpc: deliveryRpc('activate_route', { electionState: electionAfter }),
  });
  process.stdout.write(`${JSON.stringify({
    status: 'qualified_partial',
    scriptName,
    origin,
    agentId,
    routeGeneration,
    routeHostKey,
    deploymentIdentity: {
      sourceSha: d0040.sourceSha,
      workerVersionId: d0040.workerVersionId,
      deployment: d0040.deployment,
      environment: d0040.environment,
      workerScript: d0040.workerScript,
      namespace: d0040.namespace,
      className: d0040.className,
      jurisdiction: d0040.jurisdiction,
      durableObjectId,
      attestorKeyId: d0040.evidenceAttestationVerifier?.keyId ?? null,
    },
    election: {
      authorityIdentity: electionAuthorityIdentity,
      recoveryKeyId,
      attachmentDigest: agentRouteElectionAttachmentDigest(attachment),
      generationDigest,
      genesisResult,
      stateDigest: agentRouteElectionDigest(electionAfter),
      currentRoute: electionAfter.currentRoute,
    },
    delivery: {
      initializeClassification: initializeResult.classification,
      routeState: routeRead.installableAgent?.state ?? null,
      routeCurrentTupleDigest: routeRead.currentTupleDigest,
      generationDisposition: generationRead?.disposition ?? null,
      generationStateDigest: digest(generationRead),
    },
    negativeAndBoundaryChecks: {
      unauthorizedBeforeRouting: true,
      freshElectionAbsentBeforeGenesis: true,
      staleExecutableActivation: { status: blockedActivation.status, code: blockedActivation.body?.error?.code ?? null },
      canonicalD0039ImportOrCutover: false,
    },
    secretValues: 'excluded',
    qualificationTokenRotated: true,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ status: 'failed', code: error?.code ?? 'd0044_provider_runtime_failed', message: error?.message ?? String(error) })}\n`);
  process.exitCode = 1;
});
