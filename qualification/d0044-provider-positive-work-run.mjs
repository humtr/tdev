import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { mkdtemp, readFile, readFile as readFileBytes, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { CaseEngine, definePlan } from '../src/engine.mjs';
import {
  AgentDeliveryAuthority,
  MemoryAgentDeliveryStore,
  agentRouteBindingDigest,
  computeAgentActivationRequestDigest,
  computeAgentCapacityRequestDigest,
  computeAgentDeliveryId,
  computeAgentReservationRequestDigest,
} from '../src/agent-delivery-authority.mjs';
import { digest, canonicalJson, typedDigest } from '../src/canonical.mjs';
import {
  AGENT_DELIVERY_AUTH_PROTOCOL_PREFIX,
  AGENT_DELIVERY_WEBSOCKET_PATH,
  AGENT_DELIVERY_WEBSOCKET_PROTOCOL,
  deriveAgentPrincipalToken,
} from '../src/cloudflare-agent-delivery-runtime.mjs';
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
  CloudflareApiClient,
  loadCloudflareCredentials,
  parseCloudflareEnv,
} from './cloudflare-casedo-api.mjs';
import { QUALIFICATION_RPC_PROFILE } from './installable-agent-qualification-r4.mjs';
import {
  QUALIFICATION_ROUTE_PROVISIONING_PROFILE,
  qualificationRouteProvisioningRequestDigest,
  qualificationRouteProvisioningTargetDigest,
} from './installable-agent-r12-route-provisioning.mjs';

const envFile = process.argv[2] ?? '/data/data/com.termux/files/home/.config/tdev/cloudflare.env';
const scriptName = 'tdev-d0044-qualification-20260902';
const accountSubdomain = 'humtr';
const origin = `https://${scriptName}.${accountSubdomain}.workers.dev`;
const profile = 'tdev.agent-route-election-qualification.v1';
const electionOwnerIdentityDomain = 'tdev.agent-route-election-authority.v1';
const textEncoder = new TextEncoder();

function findBinding(settings, name) {
  return settings?.bindings?.find((item) => item?.name === name) ?? null;
}

function requiredBinding(settings, name, field = 'text') {
  const value = findBinding(settings, name)?.[field];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`missing binding ${name}`);
  return value;
}

function routeBinding({ agentId, routeGeneration, namespaceId, durableObjectId }) {
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

function deliveryRpc({ agentId, routeGeneration, operation, extra = {} }) {
  return {
    profile: QUALIFICATION_RPC_PROFILE,
    operation,
    agentId,
    routeGeneration,
    ...extra,
  };
}

async function invoke(token, path, body) {
  const response = await fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  let parsed;
  try {
    parsed = await response.json();
  } catch {
    parsed = { ok: false, error: { code: 'invalid_json_response' } };
  }
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

function signRecord(record, keyPair) {
  return encodeBase64Url(sign(null, signedRecordBytes(record.profile, record), keyPair.privateKey));
}

function planFor(taskId) {
  return definePlan({
    revisionId: 'd0044-positive-plan-v1',
    baseTree: {},
    tasks: [
      { id: taskId, kind: 'work', dependencies: [], claims: [], input: {} },
      {
        id: 'promote',
        kind: 'promotion',
        dependencies: [taskId],
        claims: [{ mode: 'write', resource: 'canonical:tree' }],
        input: {},
      },
    ],
  });
}

function byteLength(value) {
  return textEncoder.encode(value).byteLength;
}

function routeProvisioningTarget({ settings, d0040, deliveryNamespaceId, agentId, routeGeneration, payload, transactionId }) {
  const requestDigest = qualificationRouteProvisioningRequestDigest({
    operation: 'initialize',
    transactionId,
    routeBinding: { agentId, routeGeneration },
    payload,
  });
  const target = {
    profile: QUALIFICATION_ROUTE_PROVISIONING_PROFILE,
    operation: 'initialize',
    sourceSha: requiredBinding(settings, 'TDEV_SOURCE_SHA'),
    artifactDigest: requiredBinding(settings, 'TDEV_D0039_ARTIFACT_DIGEST'),
    artifactManifestDigest: requiredBinding(settings, 'TDEV_D0039_ARTIFACT_MANIFEST_DIGEST'),
    workerVersionId: d0040.workerVersionId,
    accountId: requiredBinding(settings, 'TDEV_D0039_ACCOUNT_ID'),
    serviceName: scriptName,
    deployment: scriptName,
    environment: 'qualification',
    deploymentEpoch: requiredBinding(settings, 'TDEV_D0039_DEPLOYMENT_EPOCH'),
    qualificationEndpointOrigin: origin,
    workersDevAccountSubdomain: accountSubdomain,
    workersDevHostname: `${scriptName}.${accountSubdomain}.workers.dev`,
    workerScript: scriptName,
    namespaceId: deliveryNamespaceId,
    namespace: deliveryNamespaceId,
    className: 'AgentDeliveryRuntimeDO',
    jurisdiction: 'global',
    durableObjectId: d0040.durableObjectId,
    evidenceAttestorKeyId: requiredBinding(settings, 'TDEV_D0040_EVIDENCE_ATTESTOR_KEY_ID'),
    agentId,
    routeGeneration,
    predecessorState: 'ABSENT',
    predecessorDigest: null,
    routeAuthoritativeRereadDigest: null,
    provisioningTransactionId: transactionId,
    provisioningRequestDigest: requestDigest,
  };
  return { target, requestDigest };
}

function connectUrl({ agentId, routeGeneration, expectedConnectionEpoch, connectRequestId, connectionId, executorId, executorEpoch, protocolMetadataDigest }) {
  const url = new URL(`${origin}${AGENT_DELIVERY_WEBSOCKET_PATH}`.replace(/^https:/, 'wss:'));
  for (const [key, value] of Object.entries({
    agentId,
    routeGeneration,
    expectedConnectionEpoch,
    connectRequestId,
    connectionId,
    executorId,
    executorEpoch,
    protocolMetadataDigest,
  })) url.searchParams.set(key, String(value));
  return url;
}

function decodeSocketData(data) {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(data));
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  if (data && typeof data.arrayBuffer === 'function') return data.arrayBuffer().then((bytes) => new TextDecoder().decode(new Uint8Array(bytes)));
  throw new Error('unsupported WebSocket message data');
}

class SocketSession {
  constructor(socket) {
    this.socket = socket;
    this.waiters = [];
    this.messages = [];
    this.closed = null;
    this.error = null;
    socket.addEventListener('message', (event) => {
      Promise.resolve(decodeSocketData(event.data)).then((text) => {
        let message;
        try { message = JSON.parse(text); } catch { this.fail(new Error('WebSocket message was not JSON')); return; }
        const waiterIndex = this.waiters.findIndex((waiter) => waiter.predicate(message));
        if (waiterIndex >= 0) {
          const waiter = this.waiters.splice(waiterIndex, 1)[0];
          clearTimeout(waiter.timer);
          waiter.resolve(message);
        } else this.messages.push(message);
      }).catch((error) => this.fail(error));
    });
    socket.addEventListener('error', (event) => this.fail(event.error ?? new Error('WebSocket error')));
    socket.addEventListener('close', (event) => {
      this.closed = { code: event.code, reason: event.reason };
      for (const waiter of this.waiters.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error(`WebSocket closed while awaiting ${waiter.label}`));
      }
    });
  }

  fail(error) {
    this.error = error;
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  waitFor(predicate, label, timeoutMs = 20_000) {
    const queuedIndex = this.messages.findIndex(predicate);
    if (queuedIndex >= 0) return Promise.resolve(this.messages.splice(queuedIndex, 1)[0]);
    if (this.error) return Promise.reject(this.error);
    if (this.closed) return Promise.reject(new Error(`WebSocket already closed while awaiting ${label}`));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waiters.findIndex((waiter) => waiter.timer === timer);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error(`WebSocket timeout while awaiting ${label}`));
      }, timeoutMs);
      this.waiters.push({ predicate, label, resolve, reject, timer });
    });
  }

  send(type, payload) {
    if (this.error || this.closed) throw this.error ?? new Error('WebSocket is closed');
    this.socket.send(JSON.stringify({ type, payload }));
  }

  async sendAndWait(type, payload, responseType, label) {
    const response = this.waitFor((message) => message?.type === responseType, label);
    this.send(type, payload);
    return response;
  }
}

async function openSocket({ authKey, agentId, routeGeneration, executorId, executorEpoch, protocolMetadataDigest }) {
  const connectRequestId = `d0044-positive-connect-${randomBytes(8).toString('hex')}`;
  const connectionId = `d0044-positive-connection-${randomBytes(8).toString('hex')}`;
  const principal = await deriveAgentPrincipalToken(authKey, { agentId, routeGeneration });
  const socket = new WebSocket(
    connectUrl({
      agentId,
      routeGeneration,
      expectedConnectionEpoch: 0,
      connectRequestId,
      connectionId,
      executorId,
      executorEpoch,
      protocolMetadataDigest,
    }),
    [AGENT_DELIVERY_WEBSOCKET_PROTOCOL, `${AGENT_DELIVERY_AUTH_PROTOCOL_PREFIX}${principal}`],
  );
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket open timeout')), 30_000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', (event) => { clearTimeout(timer); reject(event.error ?? new Error('WebSocket open failed')); }, { once: true });
  });
  return { socket, session: new SocketSession(socket), connectRequestId, connectionId };
}

async function main() {
  const env = parseCloudflareEnv(await readFile(envFile, 'utf8'));
  const credentials = loadCloudflareCredentials(envFile);
  const client = new CloudflareApiClient(credentials);
  const settings = (await client.request('GET', client.accountPath(`/workers/scripts/${scriptName}/settings`))).result;
  const deliveryNamespaceId = findBinding(settings, 'TDEV_AGENT_DELIVERY')?.namespace_id;
  const electionNamespaceId = findBinding(settings, 'TDEV_AGENT_ROUTE_ELECTION')?.namespace_id;
  if (!deliveryNamespaceId || !electionNamespaceId) throw new Error('D0044 namespace bindings are incomplete');

  const suffix = randomBytes(8).toString('hex');
  const agentId = `d0044-positive-${suffix}`;
  const routeGeneration = 1;
  const routeHostKey = agentRouteHostKey({ agentId, routeGeneration });
  const executorId = `d0044-executor-${suffix}`;
  const executorEpoch = 1;
  const qualificationToken = randomBytes(32).toString('hex');
  const authKey = randomBytes(32).toString('hex');

  // These two values are scoped to the already-isolated qualification Worker. They are
  // generated per run and never enter stdout, evidence, or repository state.
  await client.request('PUT', client.accountPath(`/workers/scripts/${scriptName}/secrets`), {
    json: { name: 'TDEV_D0020_QUALIFICATION_TOKEN', text: qualificationToken, type: 'secret_text' },
  });
  await client.request('PUT', client.accountPath(`/workers/scripts/${scriptName}/secrets`), {
    json: { name: 'TDEV_AGENT_DELIVERY_AUTH_KEY', text: authKey, type: 'secret_text' },
  });

  const denied = await invoke('not-the-qualification-token', '/qualification/d0044/election/v1', {
    profile,
    operation: 'readAgentRouteElection',
    agentId,
    payload: {},
  });
  if (denied.status !== 401 || denied.body?.error?.code !== 'qualification_unauthorized') {
    throw new Error('unauthorized request was not denied before routing');
  }

  const electionBeforeResponse = await invokeWithAuthPropagation(qualificationToken, '/qualification/d0044/election/v1', {
    profile,
    operation: 'readAgentRouteElection',
    agentId,
    payload: {},
  }, 'election read before genesis');
  const electionBefore = assertOk('election read before genesis', electionBeforeResponse);
  if (electionBefore !== null) throw new Error('fresh election target was not absent before genesis');

  const d0040 = assertOk('D0040 delivery attestor readback', await invokeWithAuthPropagation(qualificationToken, '/qualification/d0044/delivery/v1', {
    profile,
    routeHostKey,
    rpc: deliveryRpc({ agentId, routeGeneration, operation: 'd0040_evidence_attestor_readback' }),
  }, 'D0040 readback'));
  const sourceSha = requiredBinding(settings, 'TDEV_SOURCE_SHA');
  if (d0040.sourceSha !== sourceSha) throw new Error('D0040 source identity disagrees with bound Worker settings');
  const durableObjectId = d0040.durableObjectId;
  const binding = routeBinding({ agentId, routeGeneration, namespaceId: deliveryNamespaceId, durableObjectId });
  const bindingDigest = agentRouteBindingDigest(binding);
  const localAuthority = new AgentDeliveryAuthority({ store: new MemoryAgentDeliveryStore(), routeBinding: binding });
  const initialRouteSnapshot = localAuthority.initialize({}).snapshot;

  const recovery = generateKeyPairSync('ed25519');
  const recoveryPublicKey = recovery.publicKey.export({ format: 'jwk' });
  const recoveryKeyId = agentRouteRecoveryKeyId(recoveryPublicKey);
  const electionAuthorityIdentity = typedDigest(electionOwnerIdentityDomain, {
    accountId: requiredBinding(settings, 'TDEV_D0039_ACCOUNT_ID'),
    namespaceId: electionNamespaceId,
    agentId,
  });
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
    routeStateDigest: digest(initialRouteSnapshot),
    attachment,
  }).read();
  const generationDigest = digest(generation);
  const initialization = {};
  const transactionId = `d0044-positive-init-${suffix}`;
  const initializationPayload = { initialization, generation };
  const { target, requestDigest } = routeProvisioningTarget({
    settings,
    d0040,
    deliveryNamespaceId,
    agentId,
    routeGeneration,
    payload: initializationPayload,
    transactionId,
  });
  const initialized = assertOk('delivery initialize', await invokeWithAuthPropagation(qualificationToken, '/qualification/d0044/delivery/v1', {
    profile,
    routeHostKey,
    rpc: deliveryRpc({
      agentId,
      routeGeneration,
      operation: 'initialize',
      extra: {
        initialization,
        generation,
        routeProvisioningTarget: target,
        routeProvisioningTargetDigest: qualificationRouteProvisioningTargetDigest(target),
        routeProvisioningTransactionId: transactionId,
        routeProvisioningRequestDigest: requestDigest,
      },
    }),
  }, 'delivery initialize'));
  if (initialized.deduplicated !== false) throw new Error('positive-work route initialization was not fresh');

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
    genesisNonce: digest({ nonce: randomBytes(32).toString('hex') }),
  };
  const genesisSignature = signRecord(genesis, recovery);
  const genesisResult = assertOk('election genesis', await invokeWithAuthPropagation(qualificationToken, '/qualification/d0044/election/v1', {
    profile,
    operation: 'createAgentRouteGenesis',
    agentId,
    payload: { genesis, signature: genesisSignature },
  }, 'election genesis'));
  const electionAfterGenesis = assertOk('election read after genesis', await invokeWithAuthPropagation(qualificationToken, '/qualification/d0044/election/v1', {
    profile,
    operation: 'readAgentRouteElection',
    agentId,
    payload: {},
  }, 'election read after genesis'));
  const activated = assertOk('activate elected generation', await invokeWithAuthPropagation(qualificationToken, '/qualification/d0044/delivery/v1', {
    profile,
    routeHostKey,
    rpc: deliveryRpc({ agentId, routeGeneration, operation: 'activate_route', extra: { electionState: electionAfterGenesis } }),
  }, 'activate elected generation'));

  const protocolMetadataDigest = digest({ profile: 'tdev.d0044-positive-work.protocol.v1', version: 1 });
  const { socket, session, connectRequestId, connectionId } = await openSocket({
    authKey,
    agentId,
    routeGeneration,
    executorId,
    executorEpoch,
    protocolMetadataDigest,
  });

  let tempWorkdir = null;
  let engine = null;
  let attempt = null;
  let deliveryId = null;
  let evidence = [];
  let dispatchFrame = null;
  let resultHandoff = null;
  let localExecution = null;
  try {
    const capacityAck = await session.sendAndWait('capacity', { capacityRevision: 1, reportedCapacity: 1 }, 'capacity_ack', 'capacity acknowledgement');
    if (capacityAck.result?.classification !== 'monotonic_refinement') throw new Error(`capacity was not freshly observed: ${JSON.stringify(capacityAck.result)}`);

    const taskId = `positive-work-${suffix}`;
    const caseId = `d0044-positive-case-${suffix}`;
    const plan = planFor(taskId);
    engine = new CaseEngine({ caseId, plan });
    const executableBody = {
      profile: 'tdev.d0044-positive-executable.v1',
      operation: 'write_and_verify_temp_sentinel',
      taskId,
      nonce: suffix,
    };
    const executableBodyText = canonicalJson(executableBody);
    const executableBodyBytes = byteLength(executableBodyText);
    const preflightDescriptor = {
      profileId: 'd0044-positive-work',
      protocolVersion: 'tdev-agent-v1',
      executableBodyDigest: digest(executableBody),
      executableBodyBytes,
      resourceDimensions: { processSlots: 1 },
      maxEnvelopeBytes: 16 * 1024,
    };
    const routeReadBeforeReservation = assertOk('delivery read before reservation', await invokeWithAuthPropagation(qualificationToken, '/qualification/d0044/delivery/v1', {
      profile,
      routeHostKey,
      rpc: deliveryRpc({ agentId, routeGeneration, operation: 'read' }),
    }, 'delivery read before reservation'));
    const nowMs = Date.now();
    const reservationContent = {
      agentId,
      routeGeneration,
      reservationWindowGeneration: routeReadBeforeReservation.reservationWindowGeneration,
      reservationRequestId: `d0044-positive-reservation-${suffix}`,
      executorId,
      executorEpoch,
      capacityRevision: routeReadBeforeReservation.capacity.revision,
      caseId,
      taskId,
      expectedCaseRevision: engine.caseRevision,
      predictedAttemptOrdinal: 1,
      requestedSlots: 1,
      expiresAtMs: nowMs + 30_000,
      preflightDescriptor,
    };
    const reservationRequest = {
      ...reservationContent,
      reservationRequestDigest: computeAgentReservationRequestDigest(reservationContent, routeReadBeforeReservation.limits),
    };
    const reservationResult = assertOk('reserve delivery', await invokeWithAuthPropagation(qualificationToken, '/qualification/d0044/delivery/v1', {
      profile,
      routeHostKey,
      rpc: deliveryRpc({ agentId, routeGeneration, operation: 'reserve', extra: { request: reservationRequest, nowMs } }),
    }, 'reserve delivery'));
    const reservation = reservationResult.reservation;
    if (reservationResult.classification !== 'accepted') throw new Error(`reservation was not accepted: ${JSON.stringify(reservationResult)}`);

    attempt = engine.startAttempt(taskId, { id: executorId, epoch: executorEpoch, capabilities: [] });
    const deliveryIdentity = {
      agentId,
      routeGeneration,
      caseId,
      taskId,
      attemptId: attempt.id,
      executorId: attempt.executorId,
      executorEpoch: attempt.executorEpoch,
      fencingToken: attempt.fencingToken,
    };
    deliveryId = computeAgentDeliveryId(deliveryIdentity);
    const activationContent = {
      agentId,
      routeGeneration,
      activationRequestId: `d0044-positive-activation-${suffix}`,
      reservationWindowGeneration: reservation.windowGeneration,
      reservationRequestId: reservation.reservationRequestId,
      reservationRequestDigest: reservation.reservationRequestDigest,
      slotToken: reservation.slotToken,
      slotGeneration: reservation.slotGeneration,
      deliveryId,
      caseId,
      taskId,
      attemptId: attempt.id,
      attemptOrdinal: attempt.ordinal,
      executorId: attempt.executorId,
      executorEpoch: attempt.executorEpoch,
      fencingToken: attempt.fencingToken,
      sourceCaseRevision: engine.caseRevision,
      executableBodyDigest: preflightDescriptor.executableBodyDigest,
      executableBodyBytes: preflightDescriptor.executableBodyBytes,
      envelopeBytes: preflightDescriptor.maxEnvelopeBytes,
      protocolVersion: preflightDescriptor.protocolVersion,
      effectKey: attempt.effectKey,
    };
    const activationRequest = {
      ...activationContent,
      activationRequestDigest: computeAgentActivationRequestDigest(activationContent),
    };
    const activationResult = assertOk('activate delivery', await invokeWithAuthPropagation(qualificationToken, '/qualification/d0044/delivery/v1', {
      profile,
      routeHostKey,
      rpc: deliveryRpc({ agentId, routeGeneration, operation: 'activate_delivery', extra: { request: activationRequest, nowMs: nowMs + 1 } }),
    }, 'activate delivery'));
    if (activationResult.classification !== 'accepted') throw new Error(`delivery activation was not accepted: ${JSON.stringify(activationResult)}`);

    const dispatchPromise = session.waitFor((message) => message?.type === 'dispatch' && message.payload?.deliveryId === deliveryId, 'dispatch frame');
    const grantCommand = assertOk('grant dispatch command', await invokeWithAuthPropagation(qualificationToken, '/qualification/d0044/delivery/v1', {
      profile,
      routeHostKey,
      rpc: deliveryRpc({ agentId, routeGeneration, operation: 'grant_command', extra: { deliveryId } }),
    }, 'grant dispatch command'));
    const grantRequestId = `d0044-positive-grant-${suffix}`;
    const grantEnvelope = { requestId: grantRequestId, expectedCaseRevision: engine.caseRevision, command: grantCommand };
    const grant = engine.applyCommand(grantEnvelope);
    const authorization = {
      grantRequestId,
      command: grantCommand,
      dispatchGrantId: grant.response.dispatchGrantId,
      committedCaseRevision: grant.response.committedCaseRevision,
      event: grant.response.event,
    };
    const dispatchResult = assertOk('send authorized dispatch', await invokeWithAuthPropagation(qualificationToken, '/qualification/d0044/delivery/v1', {
      profile,
      routeHostKey,
      rpc: deliveryRpc({ agentId, routeGeneration, operation: 'send_dispatch', extra: { authorization, executableBody } }),
    }, 'send authorized dispatch'));
    if (!['sent', 'exact_replay'].includes(dispatchResult.classification) || dispatchResult.possibleExecution !== true) {
      throw new Error(`dispatch was not physically admitted: ${JSON.stringify(dispatchResult)}`);
    }
    dispatchFrame = await dispatchPromise;
    const wire = dispatchFrame.payload;
    for (const [field, expected] of [['deliveryId', deliveryId], ['caseId', caseId], ['taskId', taskId], ['attemptId', attempt.id], ['executorId', executorId], ['executorEpoch', executorEpoch], ['fencingToken', attempt.fencingToken]]) {
      if (wire[field] !== expected) throw new Error(`dispatch wire ${field} identity mismatch`);
    }
    if (digest(wire.executableBody) !== preflightDescriptor.executableBodyDigest) throw new Error('dispatch wire executable body digest mismatch');

    const evidenceBase = {
      deliveryId,
      dispatchOrdinal: 1,
      attemptId: attempt.id,
      fencingToken: attempt.fencingToken,
    };
    const firstEvidence = { ...evidenceBase, localEvidenceRevision: 1, observation: { dispatch: 'sent_observed', transportReceipt: 'received', execution: 'started', cleanup: 'held' } };
    const firstAck = await session.sendAndWait('evidence', firstEvidence, 'evidence_ack', 'started evidence acknowledgement');
    if (firstAck.result?.classification !== 'monotonic_refinement') throw new Error(`started evidence was not accepted: ${JSON.stringify(firstAck.result)}`);
    evidence.push({ revision: 1, result: firstAck.result });

    tempWorkdir = await mkdtemp(`${tmpdir()}/tdev-d0044-positive-`);
    const sentinelPath = `${tempWorkdir}/sentinel.txt`;
    const sentinelContent = `d0044-positive-${suffix}`;
    await writeFile(sentinelPath, sentinelContent, 'utf8');
    const observedContent = await readFileBytes(sentinelPath, 'utf8');
    if (observedContent !== sentinelContent) throw new Error('positive executable work did not round-trip its sentinel');
    await rm(sentinelPath, { force: true });
    localExecution = { operation: 'write_and_verify_temp_sentinel', roundTrip: true, cleanup: true };

    const secondEvidence = { ...evidenceBase, localEvidenceRevision: 2, observation: { execution: 'completed', cleanup: 'cleanup_complete', effect: 'not_applied' } };
    const secondAck = await session.sendAndWait('evidence', secondEvidence, 'evidence_ack', 'completed evidence acknowledgement');
    if (secondAck.result?.classification !== 'monotonic_refinement' || secondAck.result?.slotReleased !== true) {
      throw new Error(`completed evidence did not release the physical slot: ${JSON.stringify(secondAck.result)}`);
    }
    evidence.push({ revision: 2, result: secondAck.result });

    const result = {
      kind: 'changeset',
      baseDigest: engine.plan.baseDigest,
      writes: [{ path: `qualification/${taskId}.txt`, content: `completed-${suffix}` }],
      evidence: { localExecution: 'temp_sentinel_round_trip', dispatchOrdinal: 1 },
    };
    const resultEnvelope = engine.resultEnvelope(attempt.id, result);
    const resultFrame = await session.sendAndWait('result', { deliveryId, resultEnvelope }, 'result_handoff', 'result handoff acknowledgement');
    resultHandoff = resultFrame.handoff;
    if (resultHandoff?.command?.type !== 'accept_result') throw new Error('result handoff did not return an accept_result command');
    engine.acceptResult(resultEnvelope);
  } finally {
    if (tempWorkdir !== null) await rm(tempWorkdir, { recursive: true, force: true });
  }

  socket.close(1000, 'positive_checkpoint_complete');
  let quiescence = null;
  for (let attemptNumber = 0; attemptNumber < 60; attemptNumber += 1) {
    const route = assertOk('delivery quiescence read', await invokeWithAuthPropagation(qualificationToken, '/qualification/d0044/delivery/v1', {
      profile,
      routeHostKey,
      rpc: deliveryRpc({ agentId, routeGeneration, operation: 'read' }),
    }, 'delivery quiescence read'));
    const reservedSlots = Object.values(route.reservations ?? {}).filter((item) => item.status === 'reserved')
      .reduce((total, item) => total + item.requestedSlots, 0);
    const heldDeliverySlots = Object.values(route.deliveries ?? {}).filter((item) => item.slotHeld === true)
      .reduce((total, item) => total + item.requestedSlots, 0);
    if (route.connection === null && reservedSlots === 0 && heldDeliverySlots === 0) {
      quiescence = {
        profile: 'tdev.agent-route-positive-quiescence.v1',
        agentId,
        routeGeneration,
        routeStateDigest: digest(route),
        activeSocketCount: 0,
        heldCapacityCount: reservedSlots + heldDeliverySlots,
        observedAfter: 'socket_close_and_delivery_cleanup',
      };
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (quiescence === null) throw new Error('positive work did not reach observed quiescence within the bounded wait');

  const generationRead = assertOk('generation read after positive work', await invokeWithAuthPropagation(qualificationToken, '/qualification/d0044/delivery/v1', {
    profile,
    routeHostKey,
    rpc: deliveryRpc({ agentId, routeGeneration, operation: 'read_route_generation' }),
  }, 'generation read after positive work'));
  const electionAfter = assertOk('election read after positive work', await invokeWithAuthPropagation(qualificationToken, '/qualification/d0044/election/v1', {
    profile,
    operation: 'readAgentRouteElection',
    agentId,
    payload: {},
  }, 'election read after positive work'));
  if (generationRead.disposition !== 'ACTIVE' || electionAfter.currentRoute.routeGeneration !== routeGeneration) {
    throw new Error('positive work did not execute on the elected ACTIVE generation');
  }
  process.stdout.write(`${JSON.stringify({
    status: 'qualified_positive_executable_work',
    scriptName,
    origin,
    agentId,
    routeGeneration,
    routeHostKey,
    deploymentIdentity: {
      sourceSha,
      workerVersionId: d0040.workerVersionId,
      deployment: d0040.deployment,
      environment: d0040.environment,
      workerScript: d0040.workerScript,
      namespace: d0040.namespace,
      className: d0040.className,
      jurisdiction: d0040.jurisdiction,
      durableObjectId,
      deploymentIdentityDigest: null,
      identityProfile: 'd0040_pre_current_readback',
      attestorKeyId: d0040.evidenceAttestationVerifier?.keyId ?? null,
    },
    election: {
      authorityIdentity: electionAuthorityIdentity,
      recoveryKeyId,
      attachmentDigest: agentRouteElectionAttachmentDigest(attachment),
      generationDigest,
      genesisResult,
      activationResult: activated,
      stateDigest: agentRouteElectionDigest(electionAfter),
      currentRoute: electionAfter.currentRoute,
    },
    execution: {
      caseId: engine.caseId,
      planRevisionId: engine.plan.revisionId,
      planDigest: engine.plan.planDigest,
      taskId: attempt.taskId,
      attemptId: attempt.id,
      executorId: attempt.executorId,
      executorEpoch: attempt.executorEpoch,
      fencingToken: attempt.fencingToken,
      dispatch: {
        received: dispatchFrame !== null,
        dispatchOrdinal: dispatchFrame?.payload?.dispatchOrdinal ?? null,
        wireBodyDigest: dispatchFrame === null ? null : digest(dispatchFrame.payload.executableBody),
      },
      evidence,
      localOperation: localExecution,
      resultHandoff: {
        acknowledged: resultHandoff !== null,
        resultDigest: resultHandoff?.resultDigest ?? null,
        commandType: resultHandoff?.command?.type ?? null,
      },
      caseResultAcceptedLocally: engine.attempts[attempt.id]?.state === 'succeeded',
      connectRequestId,
      connectionId,
    },
    quiescence: {
      ...quiescence,
      digest: digest(quiescence),
    },
    boundaryChecks: {
      unauthorizedBeforeRouting: true,
      freshElectionAbsentBeforeGenesis: true,
      canonicalD0039Mutation: false,
      secretValues: 'excluded',
      qualificationTokenRotated: true,
      agentAuthKeyRotated: true,
    },
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ status: 'failed', code: error?.code ?? 'd0044_provider_positive_work_failed', message: error?.message ?? String(error) })}\n`);
  process.exitCode = 1;
});
