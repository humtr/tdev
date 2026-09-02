import test from 'node:test';
import assert from 'node:assert/strict';

import {
  D0044_DELIVERY_QUALIFICATION_PATH,
  D0044_PROVIDER_DIAGNOSTIC_PROFILE,
  D0044_ELECTION_QUALIFICATION_PATH,
  D0044_PROVIDER_QUALIFICATION_PROFILE,
  D0044ProviderQualificationService,
} from '../qualification/cloudflare-agent-route-election-qualification.mjs';
import { QUALIFICATION_RPC_PROFILE } from '../qualification/installable-agent-qualification-r4.mjs';
import { agentRouteHostKey } from '../src/agent-route-election.mjs';

const TOKEN = 'd0044-qualification-token-0123456789abcdef0123456789abcdef';

function namespaceFor(stub, calls) {
  return {
    idFromName(name) {
      calls.push(name);
      return { jurisdiction: 'global', toString: () => `do-${name}` };
    },
    get() { return stub; },
  };
}

function env(overrides = {}) {
  return {
    TDEV_D0020_QUALIFICATION_MODE: 'enabled',
    TDEV_ENVIRONMENT: 'qualification',
    TDEV_AGENT_ROUTE_MODE: 'elected_v1',
    TDEV_D0020_QUALIFICATION_TOKEN: TOKEN,
    TDEV_AGENT_ROUTE_ELECTION: namespaceFor({}, []),
    TDEV_AGENT_DELIVERY: namespaceFor({}, []),
    ...overrides,
  };
}

function request(path, body, token = TOKEN) {
  return new Request(`https://lane.example${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('D0044 election qualification authenticates before routing and invokes only the allowlisted operation', async () => {
  const calls = [];
  const invocations = [];
  const stub = {
    async readAgentRouteElection(agentId) {
      invocations.push({ operation: 'readAgentRouteElection', agentId });
      return null;
    },
  };
  const service = new D0044ProviderQualificationService(env({ TDEV_AGENT_ROUTE_ELECTION: namespaceFor(stub, calls) }));
  const denied = await service.fetch(request(D0044_ELECTION_QUALIFICATION_PATH, {
    profile: D0044_PROVIDER_QUALIFICATION_PROFILE,
    operation: 'readAgentRouteElection',
    agentId: 'agent-one',
    payload: {},
  }, 'wrong-token-0123456789abcdef0123456789abcdef'));
  assert.equal(denied.status, 401);
  assert.deepEqual(calls, []);
  assert.deepEqual(invocations, []);

  const accepted = await service.fetch(request(D0044_ELECTION_QUALIFICATION_PATH, {
    profile: D0044_PROVIDER_QUALIFICATION_PROFILE,
    operation: 'readAgentRouteElection',
    agentId: 'agent-one',
    payload: {},
  }));
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { ok: true, result: null });
  assert.deepEqual(calls, ['agent-one']);
  assert.deepEqual(invocations, [{ operation: 'readAgentRouteElection', agentId: 'agent-one' }]);
});

test('D0044 delivery qualification routes only to the deterministic generation host key', async () => {
  const calls = [];
  const invocations = [];
  const stub = {
    async qualificationInvoke(input) {
      invocations.push(input);
      return { profile: QUALIFICATION_RPC_PROFILE, schemaVersion: 2, ok: true, result: { operation: input.operation } };
    },
  };
  const service = new D0044ProviderQualificationService(env({ TDEV_AGENT_DELIVERY: namespaceFor(stub, calls) }));
  const agentId = 'agent-generation';
  const routeGeneration = 1;
  const routeHostKey = agentRouteHostKey({ agentId, routeGeneration });
  const body = {
    profile: D0044_PROVIDER_QUALIFICATION_PROFILE,
    routeHostKey,
    rpc: { profile: QUALIFICATION_RPC_PROFILE, operation: 'read_route_generation', agentId, routeGeneration },
  };
  const accepted = await service.fetch(request(D0044_DELIVERY_QUALIFICATION_PATH, body));
  assert.equal(accepted.status, 200);
  assert.deepEqual((await accepted.json()).result, { operation: 'read_route_generation' });
  assert.deepEqual(calls, [routeHostKey]);
  assert.deepEqual(JSON.parse(JSON.stringify(invocations)), [body.rpc]);

  const denied = await service.fetch(request(D0044_DELIVERY_QUALIFICATION_PATH, { ...body, routeHostKey: 'agent-generation' }));
  assert.equal(denied.status, 400);
  assert.deepEqual(calls, [routeHostKey]);
});

test('D0044 delivery qualification unwraps structured authority failures', async () => {
  const calls = [];
  const stub = {
    async qualificationInvoke() {
      return { profile: QUALIFICATION_RPC_PROFILE, schemaVersion: 2, ok: false, error: { code: 'agent_route_generation_missing' } };
    },
  };
  const service = new D0044ProviderQualificationService(env({ TDEV_AGENT_DELIVERY: namespaceFor(stub, calls) }));
  const agentId = 'agent-generation';
  const routeGeneration = 1;
  const response = await service.fetch(request(D0044_DELIVERY_QUALIFICATION_PATH, {
    profile: D0044_PROVIDER_QUALIFICATION_PROFILE,
    routeHostKey: agentRouteHostKey({ agentId, routeGeneration }),
    rpc: { profile: QUALIFICATION_RPC_PROFILE, operation: 'read_route_generation', agentId, routeGeneration },
  }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { ok: false, error: { code: 'agent_route_generation_missing' } });
  assert.equal(calls.length, 1);
});

test('D0044 delivery qualification exposes only bounded constructor diagnostics', async () => {
  const calls = [];
  const stub = {
    d0044DiagnosticInvoke() {
      return {
        profile: D0044_PROVIDER_DIAGNOSTIC_PROFILE,
        schemaVersion: 1,
        ok: true,
        result: { constructed: false, failure: { name: 'ContractError', code: 'invalid_agent_delivery_storage' } },
      };
    },
  };
  const service = new D0044ProviderQualificationService(env({ TDEV_AGENT_DELIVERY: namespaceFor(stub, calls) }));
  const response = await service.fetch(request(D0044_DELIVERY_QUALIFICATION_PATH, {
    profile: D0044_PROVIDER_QUALIFICATION_PROFILE,
    routeHostKey: agentRouteHostKey({ agentId: 'agent-diagnostic', routeGeneration: 1 }),
    rpc: { profile: QUALIFICATION_RPC_PROFILE, operation: 'd0044_constructor_diagnostic', agentId: 'agent-diagnostic', routeGeneration: 1 },
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, result: { constructed: false, failure: { name: 'ContractError', code: 'invalid_agent_delivery_storage' } } });
  assert.equal(calls.length, 1);
});

test('D0044 qualification rejects malformed or unsupported requests before provider access', async () => {
  const calls = [];
  const service = new D0044ProviderQualificationService(env({
    TDEV_AGENT_ROUTE_ELECTION: namespaceFor({}, calls),
  }));
  const malformed = await service.fetch(request(D0044_ELECTION_QUALIFICATION_PATH, {
    profile: D0044_PROVIDER_QUALIFICATION_PROFILE,
    operation: 'readAgentRouteElection',
    agentId: 'agent-one',
    payload: {},
    extra: true,
  }));
  assert.equal(malformed.status, 400);
  const unsupported = await service.fetch(request(D0044_ELECTION_QUALIFICATION_PATH, {
    profile: D0044_PROVIDER_QUALIFICATION_PROFILE,
    operation: 'unknown',
    agentId: 'agent-one',
    payload: {},
  }));
  assert.equal(unsupported.status, 400);
  assert.deepEqual(calls, []);
});
