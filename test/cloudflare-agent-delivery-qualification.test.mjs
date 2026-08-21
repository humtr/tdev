import test from 'node:test';
import assert from 'node:assert/strict';

import {
  D0020QualificationAgentDeliveryDOHost,
  D0020QualificationService,
  D0020_QUALIFICATION_PATH,
} from '../qualification/cloudflare-agent-delivery-runtime.mjs';
import {
  AGENT_DELIVERY_WEBSOCKET_PATH,
  AGENT_DELIVERY_WEBSOCKET_PROTOCOL,
} from '../src/cloudflare-agent-delivery-runtime.mjs';

const QUALIFICATION_TOKEN = 'qualification-token-0123456789abcdef0123456789abcdef';

function baseEnv(overrides = {}) {
  return {
    TDEV_AGENT_DELIVERY_MAX_SNAPSHOT_BYTES: String(1024 * 1024),
    TDEV_AGENT_DELIVERY_MAX_FRAME_BYTES: String(8 * 1024),
    TDEV_DEPLOYMENT: 'qualification',
    TDEV_ENVIRONMENT: 'nonproduction',
    TDEV_WORKER_SCRIPT: 'tdev-d0020-qualification',
    TDEV_AGENT_DELIVERY_NAMESPACE: 'tdev-d0020-qualification_AgentDeliveryRuntimeDO',
    TDEV_AGENT_DELIVERY_JURISDICTION: 'global',
    TDEV_AGENT_DELIVERY_AUTH_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef',
    TDEV_D0020_QUALIFICATION_MODE: 'enabled',
    TDEV_D0020_QUALIFICATION_TOKEN: QUALIFICATION_TOKEN,
    TDEV_SOURCE_SHA: '1234567890abcdef1234567890abcdef12345678',
    TDEV_WORKER_VERSION: { id: 'worker-version-one' },
    ...overrides,
  };
}

function namespaceFor(stub, routedAgents = []) {
  return {
    idFromName(agentId) {
      routedAgents.push(agentId);
      return {
        jurisdiction: 'global',
        toString() { return `do-${agentId}`; },
      };
    },
    get() { return stub; },
  };
}

function adminRequest(body, { token = QUALIFICATION_TOKEN } = {}) {
  return new Request(`https://qualification.example${D0020_QUALIFICATION_PATH}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

test('qualification admin ingress authenticates before routing and maps one Agent to one named object', async () => {
  const invocations = [];
  const routedAgents = [];
  const stub = {
    async fetch() { throw new Error('unexpected websocket fetch'); },
    async qualificationInvoke(input) {
      invocations.push(structuredClone(input));
      return { schemaVersion: 1, ok: true, result: { observed: input.operation, agentId: input.agentId } };
    },
  };
  const env = baseEnv({ TDEV_AGENT_DELIVERY: namespaceFor(stub, routedAgents) });
  const service = new D0020QualificationService(env);

  const denied = await service.fetch(adminRequest({ operation: 'read', agentId: 'agent-one', routeGeneration: 1 }, { token: 'wrong-token-0123456789abcdef0123456789abcdef' }));
  assert.equal(denied.status, 401);
  assert.equal(invocations.length, 0);
  assert.deepEqual(routedAgents, []);

  const accepted = await service.fetch(adminRequest({ operation: 'read', agentId: 'agent-one', routeGeneration: 1 }));
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { ok: true, result: { observed: 'read', agentId: 'agent-one' } });
  assert.deepEqual(routedAgents, ['agent-one']);
  assert.deepEqual(invocations, [{ operation: 'read', agentId: 'agent-one', routeGeneration: 1 }]);
});

test('WebSocket ingress requires the application protocol and routes by Agent identity without qualification bearer auth', async () => {
  const routedAgents = [];
  const fetched = [];
  const stub = {
    async fetch(request) {
      fetched.push(request.url);
      return new Response('routed', { status: 200 });
    },
    async qualificationInvoke() { throw new Error('unexpected admin RPC'); },
  };
  const service = new D0020QualificationService(baseEnv({ TDEV_AGENT_DELIVERY: namespaceFor(stub, routedAgents) }));
  const url = new URL(`https://qualification.example${AGENT_DELIVERY_WEBSOCKET_PATH}`);
  url.searchParams.set('agentId', 'agent-one');
  url.searchParams.set('routeGeneration', '1');

  const missingProtocol = await service.fetch(new Request(url, {
    method: 'GET',
    headers: { upgrade: 'websocket' },
  }));
  assert.equal(missingProtocol.status, 400);
  assert.deepEqual(routedAgents, []);

  const routed = await service.fetch(new Request(url, {
    method: 'GET',
    headers: {
      upgrade: 'websocket',
      'sec-websocket-protocol': `${AGENT_DELIVERY_WEBSOCKET_PROTOCOL}, tdev-auth.route-token`,
    },
  }));
  assert.equal(routed.status, 200);
  assert.equal(await routed.text(), 'routed');
  assert.deepEqual(routedAgents, ['agent-one']);
  assert.equal(fetched.length, 1);
});

test('qualification DO host derives route binding from the actual Durable Object identity, not caller input', async () => {
  const reads = [];
  const host = {
    durableObjectId: 'do-agent-one',
    config: {
      placement: {
        deployment: 'qualification',
        environment: 'nonproduction',
        workerScript: 'tdev-d0020-qualification',
        className: 'AgentDeliveryRuntimeDO',
        namespace: 'tdev-d0020-qualification_AgentDeliveryRuntimeDO',
        jurisdiction: 'global',
      },
    },
    readRoute(input) {
      reads.push(structuredClone(input));
      return { revision: 1 };
    },
  };
  const ctx = { abort() { throw new Error('unexpected abort'); } };
  const qualification = new D0020QualificationAgentDeliveryDOHost(ctx, baseEnv(), { host });
  const response = await qualification.qualificationInvoke({ operation: 'runtime_probe', agentId: 'agent-one', routeGeneration: 1 });
  assert.equal(response.ok, true);
  assert.equal(response.result.durableObjectId, 'do-agent-one');
  assert.equal(response.result.routeBinding.durableObjectId, 'do-agent-one');
  assert.equal(response.result.routeBinding.agentId, 'agent-one');
  assert.equal(response.result.routeBinding.routeGeneration, 1);
  assert.equal(reads[0].routeBinding.durableObjectId, 'do-agent-one');

  const injected = await qualification.qualificationInvoke({
    operation: 'runtime_probe',
    agentId: 'agent-one',
    routeGeneration: 1,
    routeBinding: { durableObjectId: 'attacker-chosen' },
  });
  assert.equal(injected.ok, false);
  assert.equal(reads.length, 1);
});

test('qualification DO host exposes bounded Revision-2 terminal-delivery transitions without caller-chosen route authority', async () => {
  const calls = [];
  const host = {
    durableObjectId: 'do-agent-one',
    config: {
      placement: {
        deployment: 'qualification',
        environment: 'nonproduction',
        workerScript: 'tdev-d0020-qualification',
        className: 'AgentDeliveryRuntimeDO',
        namespace: 'tdev-d0020-qualification_AgentDeliveryRuntimeDO',
        jurisdiction: 'global',
      },
    },
    closeUndispatchedDelivery(input) {
      calls.push({ type: 'close', input: structuredClone(input) });
      return { classification: 'monotonic_refinement', retired: true };
    },
    bindTerminalCaseReceipt(input) {
      calls.push({ type: 'terminal', input: structuredClone(input) });
      return { classification: 'accepted', retired: true };
    },
  };
  const ctx = { abort() { throw new Error('unexpected abort'); } };
  const qualification = new D0020QualificationAgentDeliveryDOHost(ctx, baseEnv(), { host });

  const closed = await qualification.qualificationInvoke({
    operation: 'close_undispatched_delivery',
    agentId: 'agent-one',
    routeGeneration: 1,
    deliveryId: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    nowMs: 1234,
  });
  assert.equal(closed.ok, true);
  assert.equal(closed.result.retired, true);
  assert.equal(calls[0].input.routeBinding.agentId, 'agent-one');
  assert.equal(calls[0].input.routeBinding.durableObjectId, 'do-agent-one');
  assert.equal(calls[0].input.nowMs, 1234);

  const terminalRequest = {
    deliveryId: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    command: { type: 'accept_result', envelope: { fixture: true } },
    caseReceipt: { fixture: true },
  };
  const terminal = await qualification.qualificationInvoke({
    operation: 'bind_terminal_case_receipt',
    agentId: 'agent-one',
    routeGeneration: 1,
    request: terminalRequest,
    nowMs: 5678,
  });
  assert.equal(terminal.ok, true);
  assert.equal(terminal.result.retired, true);
  assert.deepEqual(calls[1].input.request, terminalRequest);
  assert.equal(calls[1].input.nowMs, 5678);
  assert.equal(calls[1].input.routeBinding.durableObjectId, 'do-agent-one');

  const missingNow = await qualification.qualificationInvoke({
    operation: 'bind_terminal_case_receipt',
    agentId: 'agent-one',
    routeGeneration: 1,
    request: terminalRequest,
  });
  assert.equal(missingNow.ok, false);
  assert.equal(calls.length, 2);
});

test('qualification mode and secret bindings fail closed before a service becomes externally reachable', () => {
  const stub = { fetch() {}, qualificationInvoke() {} };
  const namespace = namespaceFor(stub);
  assert.throws(
    () => new D0020QualificationService(baseEnv({ TDEV_AGENT_DELIVERY: namespace, TDEV_D0020_QUALIFICATION_MODE: 'disabled' })),
    (error) => error?.code === 'qualification_mode_disabled',
  );
  assert.throws(
    () => new D0020QualificationService(baseEnv({ TDEV_AGENT_DELIVERY: namespace, TDEV_D0020_QUALIFICATION_TOKEN: 'short' })),
    (error) => error?.code === 'invalid_qualification_config',
  );
});
