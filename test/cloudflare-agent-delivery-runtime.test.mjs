import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AgentDeliveryAuthority,
  MemoryAgentDeliveryStore,
  computeAgentActivationRequestDigest,
  computeAgentConnectRequestDigest,
  computeAgentDeliveryId,
  computeAgentReservationRequestDigest,
  digest,
} from '../src/index.mjs';
import {
  AGENT_DELIVERY_AUTH_PROTOCOL_PREFIX,
  AGENT_DELIVERY_SOCKET_TAG,
  AGENT_DELIVERY_WEBSOCKET_PROTOCOL,
  CLOUDFLARE_WEBSOCKET_RECEIVE_MAX_BYTES,
  AgentDeliveryRuntimeDOHost,
  SqliteAgentDeliveryStore,
  createRuntimeAgentRouteBinding,
  deriveAgentPrincipalToken,
  readAgentDeliveryRuntimeConfig,
} from '../src/cloudflare-agent-delivery-runtime.mjs';

function expectCode(fn, code) {
  assert.throws(fn, (error) => error?.code === code);
}

async function expectCodeAsync(fn, code) {
  await assert.rejects(fn, (error) => error?.code === code);
}

function env(overrides = {}) {
  return {
    TDEV_AGENT_DELIVERY_MAX_SNAPSHOT_BYTES: String(1024 * 1024),
    TDEV_AGENT_DELIVERY_MAX_FRAME_BYTES: String(8 * 1024),
    TDEV_DEPLOYMENT: 'qualification',
    TDEV_ENVIRONMENT: 'nonproduction',
    TDEV_WORKER_SCRIPT: 'tdev-d0020-qualification',
    TDEV_AGENT_DELIVERY_NAMESPACE: 'tdev-d0020-qualification_AgentDeliveryRuntimeDO',
    TDEV_AGENT_DELIVERY_JURISDICTION: 'global',
    TDEV_AGENT_DELIVERY_AUTH_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef',
    ...overrides,
  };
}

function route(runtimeEnv = env(), agentId = 'agent-one', routeGeneration = 1, durableObjectId = 'do-agent-one') {
  return createRuntimeAgentRouteBinding(runtimeEnv, { agentId, routeGeneration, durableObjectId });
}

class FakeSqliteStorage {
  constructor() {
    this.row = null;
    this.sql = {
      exec: (statement, ...bindings) => this.#exec(statement, bindings),
    };
  }

  transactionSync(operation) {
    return operation();
  }

  #exec(statement, bindings) {
    const sql = statement.replace(/\s+/g, ' ').trim();
    let rows = [];
    if (sql.startsWith('CREATE TABLE IF NOT EXISTS agent_delivery_state')) {
      rows = [];
    } else if (sql === 'SELECT * FROM agent_delivery_state WHERE agent_id = ?') {
      rows = this.row !== null && this.row.agent_id === bindings[0] ? [{ ...this.row }] : [];
    } else if (sql.startsWith('INSERT INTO agent_delivery_state(')) {
      const [agentId, revision, snapshotJson, snapshotBytes, storageProfile, storageSchemaVersion] = bindings;
      if (this.row !== null) throw new Error('duplicate fake sqlite row');
      this.row = {
        agent_id: agentId,
        revision,
        snapshot_json: snapshotJson,
        snapshot_bytes: snapshotBytes,
        storage_profile: storageProfile,
        storage_schema_version: storageSchemaVersion,
      };
    } else if (sql.startsWith('UPDATE agent_delivery_state SET')) {
      const [revision, snapshotJson, snapshotBytes, storageProfile, storageSchemaVersion, agentId] = bindings;
      if (this.row === null || this.row.agent_id !== agentId) throw new Error('missing fake sqlite row');
      this.row = {
        agent_id: agentId,
        revision,
        snapshot_json: snapshotJson,
        snapshot_bytes: snapshotBytes,
        storage_profile: storageProfile,
        storage_schema_version: storageSchemaVersion,
      };
    } else {
      throw new Error(`unsupported fake sqlite statement: ${sql}`);
    }
    return { toArray: () => rows };
  }
}

class FakeSocket {
  constructor(name) {
    this.name = name;
    this.attachment = null;
    this.sent = [];
    this.closed = null;
    this.tags = [];
  }

  serializeAttachment(value) {
    this.attachment = structuredClone(value);
  }

  deserializeAttachment() {
    return structuredClone(this.attachment);
  }

  send(value) {
    if (this.closed !== null) throw new Error('fake socket is closed');
    this.sent.push(value);
  }

  close(code, reason) {
    this.closed = { code, reason };
  }
}

class FakeDurableObjectContext {
  constructor({ storage = new FakeSqliteStorage(), durableObjectId = 'do-agent-one', jurisdiction = 'global' } = {}) {
    this.storage = storage;
    this.id = {
      jurisdiction,
      toString() { return durableObjectId; },
    };
    this.sockets = [];
    this.blocked = Promise.resolve();
  }

  blockConcurrencyWhile(operation) {
    this.blocked = Promise.resolve().then(operation);
    return this.blocked;
  }

  acceptWebSocket(socket, tags) {
    socket.tags = [...tags];
    this.sockets.push(socket);
  }

  getWebSockets(tag) {
    return this.sockets.filter((socket) => socket.closed === null && socket.tags.includes(tag));
  }
}

function pairFactory() {
  let ordinal = 0;
  return () => {
    ordinal += 1;
    return [new FakeSocket(`client-${ordinal}`), new FakeSocket(`server-${ordinal}`)];
  };
}

function connectContent(authority, overrides = {}) {
  const snapshot = authority.read();
  return {
    agentId: snapshot.routeBinding.agentId,
    routeGeneration: snapshot.routeBinding.routeGeneration,
    expectedConnectionEpoch: snapshot.lastConnectionEpoch,
    connectRequestId: `connect-${snapshot.lastConnectionEpoch + 1}`,
    connectionId: `connection-${snapshot.lastConnectionEpoch + 1}`,
    executorId: 'executor-one',
    executorEpoch: 1,
    protocolMetadataDigest: digest({ protocol: 'test-v1' }),
    ...overrides,
  };
}

function connectAuthority(authority, overrides = {}) {
  const content = connectContent(authority, overrides);
  return authority.connect({ ...content, requestDigest: computeAgentConnectRequestDigest(content) });
}

async function upgradeRequest(runtimeEnv, {
  agentId = 'agent-one',
  routeGeneration = 1,
  expectedConnectionEpoch = 0,
  connectRequestId = `connect-${expectedConnectionEpoch + 1}`,
  connectionId = `connection-${expectedConnectionEpoch + 1}`,
  executorId = 'executor-one',
  executorEpoch = 1,
  token = null,
} = {}) {
  const protocolMetadataDigest = digest({ protocol: 'test-v1' });
  const url = new URL('https://qualification.example/agent-delivery/v1/connect');
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
  const bearer = token ?? await deriveAgentPrincipalToken(runtimeEnv.TDEV_AGENT_DELIVERY_AUTH_KEY, { agentId, routeGeneration });
  return new Request(url, {
    method: 'GET',
    headers: {
      upgrade: 'websocket',
      authorization: `Bearer ${bearer}`,
    },
  });
}

test('Cloudflare Agent delivery deployment config fails closed at provider receive ceiling', () => {
  assert.equal(readAgentDeliveryRuntimeConfig(env()).maxFrameBytes, 8 * 1024);
  expectCode(
    () => readAgentDeliveryRuntimeConfig(env({ TDEV_AGENT_DELIVERY_MAX_FRAME_BYTES: String(CLOUDFLARE_WEBSOCKET_RECEIVE_MAX_BYTES) })),
    'invalid_agent_delivery_deployment_config',
  );
  expectCode(
    () => readAgentDeliveryRuntimeConfig(env({ TDEV_AGENT_DELIVERY_JURISDICTION: 'moon' })),
    'invalid_agent_delivery_deployment_config',
  );
});

test('Agent principal token is deterministic, route-bound, and rejects undersized keys', async () => {
  const runtimeEnv = env();
  const first = await deriveAgentPrincipalToken(runtimeEnv.TDEV_AGENT_DELIVERY_AUTH_KEY, { agentId: 'agent-one', routeGeneration: 1 });
  const replay = await deriveAgentPrincipalToken(runtimeEnv.TDEV_AGENT_DELIVERY_AUTH_KEY, { agentId: 'agent-one', routeGeneration: 1 });
  const otherRoute = await deriveAgentPrincipalToken(runtimeEnv.TDEV_AGENT_DELIVERY_AUTH_KEY, { agentId: 'agent-one', routeGeneration: 2 });
  assert.equal(first, replay);
  assert.notEqual(first, otherRoute);
  await expectCodeAsync(
    () => deriveAgentPrincipalToken('too-short', { agentId: 'agent-one', routeGeneration: 1 }),
    'invalid_agent_delivery_auth_key',
  );
});

test('SQLite Agent delivery store persists exact snapshot and fails closed on incompatible schema', () => {
  const runtimeEnv = env();
  const storage = new FakeSqliteStorage();
  const store = new SqliteAgentDeliveryStore(storage, { maxSnapshotBytes: 1024 * 1024 });
  store.initialize();
  const binding = route(runtimeEnv);
  const authority = new AgentDeliveryAuthority({ store, routeBinding: binding });
  authority.initialize();
  connectAuthority(authority);

  const reconstructed = new AgentDeliveryAuthority({
    store: new SqliteAgentDeliveryStore(storage, { maxSnapshotBytes: 1024 * 1024 }),
    routeBinding: binding,
  });
  assert.equal(reconstructed.read().lastConnectionEpoch, 1);
  assert.equal(reconstructed.read().connection.id, 'connection-1');

  storage.row.storage_schema_version = 999;
  expectCode(() => reconstructed.read(), 'incompatible_agent_delivery_schema');
});

test('SQLite Agent delivery store rejects durable byte/accounting corruption', () => {
  const runtimeEnv = env();
  const storage = new FakeSqliteStorage();
  const store = new SqliteAgentDeliveryStore(storage, { maxSnapshotBytes: 1024 * 1024 });
  store.initialize();
  new AgentDeliveryAuthority({ store, routeBinding: route(runtimeEnv) }).initialize();
  storage.row.snapshot_bytes += 1;
  expectCode(() => store.load('agent-one'), 'agent_delivery_store_corrupt');
});

test('Hibernation reconstruction reattaches current socket without synthetic epoch change', async () => {
  const runtimeEnv = env();
  const store = new MemoryAgentDeliveryStore();
  const ctx = new FakeDurableObjectContext();
  const factory = pairFactory();
  const host = new AgentDeliveryRuntimeDOHost(ctx, runtimeEnv, { store, webSocketPairFactory: factory });
  await ctx.blocked;
  const binding = route(runtimeEnv);
  host.initializeRoute({ routeBinding: binding });
  const accepted = await host.acceptAgentWebSocket(await upgradeRequest(runtimeEnv));
  assert.equal(accepted.result.receipt.connectionEpoch, 1);
  assert.equal(ctx.getWebSockets(AGENT_DELIVERY_SOCKET_TAG).length, 1);
  const firstIncarnation = accepted.result.socketIncarnationId;
  assert.equal(ctx.sockets[0].deserializeAttachment().socketIncarnationId, firstIncarnation);

  const reconstructed = new AgentDeliveryRuntimeDOHost(ctx, runtimeEnv, { store, webSocketPairFactory: factory });
  await ctx.blocked;
  const snapshot = reconstructed.readRoute({ routeBinding: binding });
  assert.equal(snapshot.lastConnectionEpoch, 1);
  assert.equal(snapshot.connection.id, 'connection-1');
  assert.equal(snapshot.connection.socketIncarnationId, firstIncarnation);
  assert.equal(ctx.getWebSockets(AGENT_DELIVERY_SOCKET_TAG)[0].closed, null);
});

test('exact lost connect response replay keeps logical receipt but replaces physical incarnation and stale close cannot disconnect it', async () => {
  const runtimeEnv = env();
  const store = new MemoryAgentDeliveryStore();
  const ctx = new FakeDurableObjectContext();
  const host = new AgentDeliveryRuntimeDOHost(ctx, runtimeEnv, { store, webSocketPairFactory: pairFactory() });
  await ctx.blocked;
  const binding = route(runtimeEnv);
  host.initializeRoute({ routeBinding: binding });
  const request = await upgradeRequest(runtimeEnv);
  const first = await host.acceptAgentWebSocket(request);
  const predecessor = ctx.sockets[0];
  const firstAttachment = predecessor.deserializeAttachment();

  const replay = await host.acceptAgentWebSocket(request);
  const replacement = ctx.sockets[1];
  const secondAttachment = replacement.deserializeAttachment();
  assert.equal(replay.result.classification, 'exact_replay');
  assert.deepEqual(replay.result.receipt, first.result.receipt);
  assert.equal(replay.result.receipt.connectionEpoch, 1);
  assert.notEqual(secondAttachment.socketIncarnationId, firstAttachment.socketIncarnationId);
  assert.equal(predecessor.closed?.reason, 'superseded_connection');
  assert.equal(host.readRoute({ routeBinding: binding }).connection.socketIncarnationId, secondAttachment.socketIncarnationId);

  const closeResult = host.webSocketClose(predecessor);
  assert.equal(closeResult.classification, 'stale');
  assert.equal(host.readRoute({ routeBinding: binding }).connection.socketIncarnationId, secondAttachment.socketIncarnationId);
  await expectCodeAsync(
    () => host.webSocketMessage(predecessor, JSON.stringify({
      type: 'capacity',
      payload: { capacityRevision: 99, reportedCapacity: 64 },
    })),
    'stale_connection_fence',
  );
  assert.equal(host.readRoute({ routeBinding: binding }).capacity, null);
});

test('one unambiguous Revision-1 hibernation socket is upgraded in place without a logical epoch change', async () => {
  const runtimeEnv = env();
  const store = new MemoryAgentDeliveryStore();
  const ctx = new FakeDurableObjectContext();
  const factory = pairFactory();
  const host = new AgentDeliveryRuntimeDOHost(ctx, runtimeEnv, { store, webSocketPairFactory: factory });
  await ctx.blocked;
  const binding = route(runtimeEnv);
  host.initializeRoute({ routeBinding: binding });
  await host.acceptAgentWebSocket(await upgradeRequest(runtimeEnv));
  const socket = ctx.sockets[0];

  const legacySnapshot = structuredClone(store.snapshots.get('agent-one'));
  legacySnapshot.schemaVersion = 1;
  delete legacySnapshot.deliveryTombstones;
  delete legacySnapshot.connection.socketIncarnationId;
  delete legacySnapshot.limits.maxDeliveryTombstones;
  delete legacySnapshot.limits.deliveryReplayGraceMs;
  store.snapshots.set('agent-one', legacySnapshot);
  const legacyAttachment = socket.deserializeAttachment();
  legacyAttachment.schemaVersion = 1;
  delete legacyAttachment.socketIncarnationId;
  socket.serializeAttachment(legacyAttachment);

  const reconstructed = new AgentDeliveryRuntimeDOHost(ctx, runtimeEnv, { store, webSocketPairFactory: factory });
  await ctx.blocked;
  const migrated = reconstructed.readRoute({ routeBinding: binding });
  const upgradedAttachment = socket.deserializeAttachment();
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.lastConnectionEpoch, 1);
  assert.equal(migrated.connection.id, 'connection-1');
  assert.equal(typeof migrated.connection.socketIncarnationId, 'string');
  assert.equal(upgradedAttachment.schemaVersion, 2);
  assert.equal(upgradedAttachment.socketIncarnationId, migrated.connection.socketIncarnationId);
  assert.equal(socket.closed, null);
  assert.equal(store.snapshots.get('agent-one').schemaVersion, 2, 'migration must become durable on incarnation adoption');
});

test('ambiguous Revision-1 hibernation sockets disconnect fail closed without minting a logical epoch', async () => {
  const runtimeEnv = env();
  const store = new MemoryAgentDeliveryStore();
  const ctx = new FakeDurableObjectContext();
  const factory = pairFactory();
  const host = new AgentDeliveryRuntimeDOHost(ctx, runtimeEnv, { store, webSocketPairFactory: factory });
  await ctx.blocked;
  const binding = route(runtimeEnv);
  host.initializeRoute({ routeBinding: binding });
  await host.acceptAgentWebSocket(await upgradeRequest(runtimeEnv));
  const first = ctx.sockets[0];

  const legacySnapshot = structuredClone(store.snapshots.get('agent-one'));
  legacySnapshot.schemaVersion = 1;
  delete legacySnapshot.deliveryTombstones;
  delete legacySnapshot.connection.socketIncarnationId;
  delete legacySnapshot.limits.maxDeliveryTombstones;
  delete legacySnapshot.limits.deliveryReplayGraceMs;
  store.snapshots.set('agent-one', legacySnapshot);
  const legacyAttachment = first.deserializeAttachment();
  legacyAttachment.schemaVersion = 1;
  delete legacyAttachment.socketIncarnationId;
  first.serializeAttachment(legacyAttachment);
  const duplicate = new FakeSocket('legacy-duplicate');
  duplicate.serializeAttachment(legacyAttachment);
  duplicate.tags = [...first.tags];
  ctx.sockets.push(duplicate);

  const reconstructed = new AgentDeliveryRuntimeDOHost(ctx, runtimeEnv, { store, webSocketPairFactory: factory });
  await ctx.blocked;
  const state = reconstructed.readRoute({ routeBinding: binding });
  assert.equal(state.lastConnectionEpoch, 1);
  assert.equal(state.connection, null);
  assert.equal(first.closed?.reason, 'ambiguous_legacy_hibernation_socket');
  assert.equal(duplicate.closed?.reason, 'ambiguous_legacy_hibernation_socket');
});

test('wrong Agent principal is rejected before connection state or socket acceptance', async () => {
  const runtimeEnv = env();
  const store = new MemoryAgentDeliveryStore();
  const ctx = new FakeDurableObjectContext();
  const host = new AgentDeliveryRuntimeDOHost(ctx, runtimeEnv, { store, webSocketPairFactory: pairFactory() });
  await ctx.blocked;
  const binding = route(runtimeEnv);
  host.initializeRoute({ routeBinding: binding });
  const unauthorizedRequest = await upgradeRequest(runtimeEnv, { token: 'definitely-wrong' });
  await expectCodeAsync(
    () => host.acceptAgentWebSocket(unauthorizedRequest),
    'agent_authentication_failed',
  );
  assert.equal(host.readRoute({ routeBinding: binding }).lastConnectionEpoch, 0);
  assert.equal(ctx.getWebSockets(AGENT_DELIVERY_SOCKET_TAG).length, 0);
});

test('route-bound WebSocket subprotocol authenticates the local Agent without putting credentials in the URL', async () => {
  const runtimeEnv = env();
  const store = new MemoryAgentDeliveryStore();
  const ctx = new FakeDurableObjectContext();
  const host = new AgentDeliveryRuntimeDOHost(ctx, runtimeEnv, { store, webSocketPairFactory: pairFactory() });
  await ctx.blocked;
  const binding = route(runtimeEnv);
  host.initializeRoute({ routeBinding: binding });
  const base = await upgradeRequest(runtimeEnv);
  const token = await deriveAgentPrincipalToken(runtimeEnv.TDEV_AGENT_DELIVERY_AUTH_KEY, { agentId: 'agent-one', routeGeneration: 1 });
  const request = new Request(base.url, {
    method: 'GET',
    headers: {
      upgrade: 'websocket',
      'sec-websocket-protocol': `${AGENT_DELIVERY_WEBSOCKET_PROTOCOL}, ${AGENT_DELIVERY_AUTH_PROTOCOL_PREFIX}${token}`,
    },
  });
  assert.equal(new URL(request.url).search.includes('tdev-auth'), false);
  const accepted = await host.acceptAgentWebSocket(request);
  assert.equal(accepted.result.receipt.connectionEpoch, 1);
  assert.equal(ctx.getWebSockets(AGENT_DELIVERY_SOCKET_TAG).length, 1);
});

test('conflicting bearer and WebSocket subprotocol credentials fail before connection mutation', async () => {
  const runtimeEnv = env();
  const store = new MemoryAgentDeliveryStore();
  const ctx = new FakeDurableObjectContext();
  const host = new AgentDeliveryRuntimeDOHost(ctx, runtimeEnv, { store, webSocketPairFactory: pairFactory() });
  await ctx.blocked;
  const binding = route(runtimeEnv);
  host.initializeRoute({ routeBinding: binding });
  const base = await upgradeRequest(runtimeEnv, { token: 'wrong-bearer' });
  const token = await deriveAgentPrincipalToken(runtimeEnv.TDEV_AGENT_DELIVERY_AUTH_KEY, { agentId: 'agent-one', routeGeneration: 1 });
  const request = new Request(base.url, {
    method: 'GET',
    headers: {
      upgrade: 'websocket',
      authorization: 'Bearer wrong-bearer',
      'sec-websocket-protocol': `${AGENT_DELIVERY_WEBSOCKET_PROTOCOL}, ${AGENT_DELIVERY_AUTH_PROTOCOL_PREFIX}${token}`,
    },
  });
  await expectCodeAsync(() => host.acceptAgentWebSocket(request), 'agent_authentication_failed');
  assert.equal(host.readRoute({ routeBinding: binding }).lastConnectionEpoch, 0);
  assert.equal(ctx.getWebSockets(AGENT_DELIVERY_SOCKET_TAG).length, 0);
});

test('real reconnect advances epoch, closes predecessor socket, and restores capacity freshness barrier', async () => {
  const runtimeEnv = env();
  const store = new MemoryAgentDeliveryStore();
  const ctx = new FakeDurableObjectContext();
  const host = new AgentDeliveryRuntimeDOHost(ctx, runtimeEnv, { store, webSocketPairFactory: pairFactory() });
  await ctx.blocked;
  const binding = route(runtimeEnv);
  host.initializeRoute({ routeBinding: binding });
  await host.acceptAgentWebSocket(await upgradeRequest(runtimeEnv));
  const firstSocket = ctx.sockets[0];

  await host.webSocketMessage(firstSocket, JSON.stringify({
    type: 'capacity',
    payload: { capacityRevision: 7, reportedCapacity: 2 },
  }));
  assert.equal(host.readRoute({ routeBinding: binding }).capacity.revision, 7);

  const second = await host.acceptAgentWebSocket(await upgradeRequest(runtimeEnv, {
    expectedConnectionEpoch: 1,
    connectRequestId: 'connect-2',
    connectionId: 'connection-2',
  }));
  assert.equal(second.result.receipt.connectionEpoch, 2);
  assert.equal(firstSocket.closed?.reason, 'superseded_connection');
  const snapshot = host.readRoute({ routeBinding: binding });
  assert.equal(snapshot.lastConnectionEpoch, 2);
  assert.equal(snapshot.capacity, null, 'reconnect must require fresh capacity evidence');
});

test('predecessor socket message is stale-fenced and cannot mutate successor state', async () => {
  const runtimeEnv = env();
  const store = new MemoryAgentDeliveryStore();
  const ctx = new FakeDurableObjectContext();
  const host = new AgentDeliveryRuntimeDOHost(ctx, runtimeEnv, { store, webSocketPairFactory: pairFactory() });
  await ctx.blocked;
  const binding = route(runtimeEnv);
  host.initializeRoute({ routeBinding: binding });
  await host.acceptAgentWebSocket(await upgradeRequest(runtimeEnv));
  const predecessor = ctx.sockets[0];
  await host.acceptAgentWebSocket(await upgradeRequest(runtimeEnv, {
    expectedConnectionEpoch: 1,
    connectRequestId: 'connect-2',
    connectionId: 'connection-2',
  }));

  await expectCodeAsync(
    () => host.webSocketMessage(predecessor, JSON.stringify({
      type: 'capacity',
      payload: { capacityRevision: 99, reportedCapacity: 64 },
    })),
    'stale_connection_fence',
  );
  assert.equal(host.readRoute({ routeBinding: binding }).capacity, null);
});

test('provider reconstruction preserves terminal delivery tombstones, GC fences ancient replay, and fresh admission continues', async () => {
  const runtimeEnv = env();
  const store = new MemoryAgentDeliveryStore();
  const ctx = new FakeDurableObjectContext();
  const factory = pairFactory();
  let host = new AgentDeliveryRuntimeDOHost(ctx, runtimeEnv, { store, webSocketPairFactory: factory });
  await ctx.blocked;
  const binding = route(runtimeEnv);
  host.initializeRoute({
    routeBinding: binding,
    initialization: {
      limits: {
        maxDeliveries: 1,
        maxDeliveryTombstones: 1,
        reservationReplayGraceMs: 5,
        deliveryReplayGraceMs: 5,
      },
    },
  });
  await host.acceptAgentWebSocket(await upgradeRequest(runtimeEnv));
  const socket = ctx.sockets[0];
  await host.webSocketMessage(socket, JSON.stringify({
    type: 'capacity',
    payload: { capacityRevision: 1, reportedCapacity: 1 },
  }));

  const activateClosed = (label, generation, nowMs) => {
    const snapshot = host.readRoute({ routeBinding: binding });
    const preflightDescriptor = {
      profileId: 'provider-b5',
      protocolVersion: 'v1',
      executableBodyDigest: digest({ body: label }),
      executableBodyBytes: 64,
      resourceDimensions: { processSlots: 1 },
      maxEnvelopeBytes: 128,
    };
    const reservationContent = {
      agentId: binding.agentId,
      routeGeneration: binding.routeGeneration,
      reservationWindowGeneration: generation,
      reservationRequestId: `reservation-${label}`,
      executorId: snapshot.executor.id,
      executorEpoch: snapshot.executor.epoch,
      capacityRevision: snapshot.capacity.revision,
      caseId: `case-${label}`,
      taskId: 'task',
      expectedCaseRevision: 0,
      predictedAttemptOrdinal: 1,
      requestedSlots: 1,
      expiresAtMs: nowMs + 50,
      preflightDescriptor,
    };
    const reservationRequest = {
      ...reservationContent,
      reservationRequestDigest: computeAgentReservationRequestDigest(reservationContent, snapshot.limits),
    };
    const reservation = host.reserve({ routeBinding: binding, request: reservationRequest, nowMs }).reservation;
    const deliveryIdentity = {
      agentId: binding.agentId,
      routeGeneration: binding.routeGeneration,
      caseId: reservation.caseId,
      taskId: reservation.taskId,
      attemptId: 'task.1',
      executorId: snapshot.executor.id,
      executorEpoch: snapshot.executor.epoch,
      fencingToken: digest({ fence: label }),
    };
    const activationContent = {
      agentId: binding.agentId,
      routeGeneration: binding.routeGeneration,
      activationRequestId: `activate-${label}`,
      reservationWindowGeneration: reservation.windowGeneration,
      reservationRequestId: reservation.reservationRequestId,
      reservationRequestDigest: reservation.reservationRequestDigest,
      slotToken: reservation.slotToken,
      slotGeneration: reservation.slotGeneration,
      deliveryId: computeAgentDeliveryId(deliveryIdentity),
      caseId: reservation.caseId,
      taskId: reservation.taskId,
      attemptId: 'task.1',
      attemptOrdinal: 1,
      executorId: snapshot.executor.id,
      executorEpoch: snapshot.executor.epoch,
      fencingToken: deliveryIdentity.fencingToken,
      sourceCaseRevision: 1,
      executableBodyDigest: preflightDescriptor.executableBodyDigest,
      executableBodyBytes: preflightDescriptor.executableBodyBytes,
      envelopeBytes: 96,
      protocolVersion: preflightDescriptor.protocolVersion,
      effectKey: null,
    };
    const activationRequest = {
      ...activationContent,
      activationRequestDigest: computeAgentActivationRequestDigest(activationContent),
    };
    const delivery = host.activateDelivery({ routeBinding: binding, request: activationRequest, nowMs: nowMs + 1 }).delivery;
    host.closeUndispatchedDelivery({ routeBinding: binding, deliveryId: delivery.deliveryId, nowMs: nowMs + 2 });
    return { activationRequest, delivery };
  };

  const first = activateClosed('provider-retire-a', 1, 1_000);
  assert.equal(Object.keys(host.readRoute({ routeBinding: binding }).deliveryTombstones).length, 1);
  assert.equal(Object.keys(host.readRoute({ routeBinding: binding }).deliveries).length, 0);

  host = new AgentDeliveryRuntimeDOHost(ctx, runtimeEnv, { store, webSocketPairFactory: factory });
  await ctx.blocked;
  const reconstructed = host.readRoute({ routeBinding: binding });
  assert.equal(Object.keys(reconstructed.deliveryTombstones).length, 1);
  assert.equal(reconstructed.deliveryTombstones[first.delivery.deliveryId].retirementReason, 'closed_undispatched');
  assert.equal(host.activateDelivery({ routeBinding: binding, request: first.activationRequest, nowMs: 1_003 }).classification, 'exact_replay');

  host.rollReservationWindow({ routeBinding: binding, request: { expectedGeneration: 1 }, nowMs: 1_008 });
  expectCode(
    () => host.activateDelivery({ routeBinding: binding, request: first.activationRequest, nowMs: 1_009 }),
    'reservation_stale',
  );
  assert.equal(Object.keys(host.readRoute({ routeBinding: binding }).deliveryTombstones).length, 0);

  const fresh = activateClosed('provider-retire-fresh', 2, 1_010);
  assert.equal(fresh.delivery.reservationWindowGeneration, 2);
  assert.equal(Object.keys(host.readRoute({ routeBinding: binding }).deliveries).length, 0);
  assert.equal(Object.keys(host.readRoute({ routeBinding: binding }).deliveryTombstones).length, 1);
});

test('oversized WebSocket frame fails closed at the application limit', async () => {
  const runtimeEnv = env({ TDEV_AGENT_DELIVERY_MAX_FRAME_BYTES: '1024' });
  const store = new MemoryAgentDeliveryStore();
  const ctx = new FakeDurableObjectContext();
  const host = new AgentDeliveryRuntimeDOHost(ctx, runtimeEnv, { store, webSocketPairFactory: pairFactory() });
  await ctx.blocked;
  host.initializeRoute({ routeBinding: route(runtimeEnv) });
  await host.acceptAgentWebSocket(await upgradeRequest(runtimeEnv));
  const socket = ctx.sockets[0];
  await expectCodeAsync(
    () => host.webSocketMessage(socket, 'x'.repeat(1025)),
    'agent_frame_too_large',
  );
  assert.equal(socket.closed?.code, 1008);
});

test('stale predecessor close cannot disconnect the current replacement connection', async () => {
  const runtimeEnv = env();
  const store = new MemoryAgentDeliveryStore();
  const ctx = new FakeDurableObjectContext();
  const host = new AgentDeliveryRuntimeDOHost(ctx, runtimeEnv, { store, webSocketPairFactory: pairFactory() });
  await ctx.blocked;
  const binding = route(runtimeEnv);
  host.initializeRoute({ routeBinding: binding });
  await host.acceptAgentWebSocket(await upgradeRequest(runtimeEnv));
  const predecessor = ctx.sockets[0];
  await host.acceptAgentWebSocket(await upgradeRequest(runtimeEnv, {
    expectedConnectionEpoch: 1,
    connectRequestId: 'connect-2',
    connectionId: 'connection-2',
  }));
  const result = host.webSocketClose(predecessor);
  assert.equal(result.classification, 'stale');
  assert.equal(host.readRoute({ routeBinding: binding }).connection.id, 'connection-2');
});
