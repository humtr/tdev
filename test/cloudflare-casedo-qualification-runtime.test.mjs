import test from 'node:test';
import assert from 'node:assert/strict';
import { ContractError } from '../src/canonical.mjs';
import {
  D0019_QUALIFICATION_MAX_REQUEST_BYTES,
  D0019_QUALIFICATION_PATH,
  D0019QualificationCaseDOHost,
  D0019QualificationService,
} from '../qualification/cloudflare-casedo-runtime.mjs';

const qualificationToken = 'qualification-secret-token-00001';

function deploymentEnvironment({ script = 'tdev-d0019-qualification-a', stub, mode = 'enabled' } = {}) {
  const selectedStub = stub ?? {};
  return {
    TDEV_D0019_QUALIFICATION_MODE: mode,
    TDEV_D0019_QUALIFICATION_TOKEN: qualificationToken,
    TDEV_CASEDO_MAX_AUTHORITATIVE_BYTES_PER_CASE: String(8 * 1024 * 1024),
    TDEV_CASEDO_WRITER_COMPATIBILITY_ID: 'writer-v1',
    TDEV_DEPLOYMENT: script,
    TDEV_ENVIRONMENT: 'qualification',
    TDEV_WORKER_SCRIPT: script,
    TDEV_CASEDO_NAMESPACE: 'TDEV_CASE_AUTHORITY',
    TDEV_CASEDO_JURISDICTION: 'eu',
    TDEV_SOURCE_SHA: '1'.repeat(40),
    TDEV_WORKER_VERSION: { id: 'worker-version-1' },
    TDEV_CASE_PLACEMENT: {
      prepare() {
        return {};
      },
      async batch() {
        return [];
      },
    },
    TDEV_CASE_AUTHORITY: {
      jurisdiction(value) {
        assert.equal(value, 'eu');
        return this;
      },
      idFromName(caseId) {
        return { toString: () => `do:${script}:${caseId}`, jurisdiction: 'eu' };
      },
      get() {
        return selectedStub;
      },
    },
  };
}

function qualificationRequest(body, { token = qualificationToken, headers = {} } = {}) {
  return new Request(`https://qualification.example${D0019_QUALIFICATION_PATH}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function responseBody(response) {
  return JSON.parse(await response.text());
}

function assertRpcTransportRecords(value) {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) assertRpcTransportRecords(item);
    return;
  }
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  for (const item of Object.values(value)) assertRpcTransportRecords(item);
}

test('D0019 qualification Durable Object RPC normalizes successful semantic results before returning', async () => {
  const host = Object.create(D0019QualificationCaseDOHost.prototype);
  const result = Object.assign(Object.create(null), {
    snapshot: Object.assign(Object.create(null), { caseRevision: 1 }),
  });
  host.host = {
    initializeElectedCase() {
      return result;
    },
  };

  const response = await host.qualificationInvoke({
    operation: 'initialize',
    placement: {},
    plan: {},
  });
  assertRpcTransportRecords(response);
  assert.equal(response.ok, true);
  assert.equal(response.result.snapshot.caseRevision, 1);
});

test('D0019 qualification ingress derives one fixed generation placement and routes bounded operations', async () => {
  const calls = [];
  const stub = {
    async qualificationInvoke(input) {
      calls.push([input.operation, input]);
      return { schemaVersion: 1, ok: true, result: { operation: input.operation } };
    },
  };
  const elections = [];
  const service = new D0019QualificationService(deploymentEnvironment({ stub }), {
    placementAuthority: {
      async elect({ placement }) {
        elections.push(placement);
        return placement;
      },
    },
  });
  const requests = [
    { operation: 'elect', caseId: 'qualification-case' },
    { operation: 'initialize', caseId: 'qualification-case', plan: { fixture: true } },
    { operation: 'load', caseId: 'qualification-case' },
    { operation: 'command', caseId: 'qualification-case', envelope: { fixture: true } },
    { operation: 'recover_execution_owner_loss', caseId: 'qualification-case', recoveryId: 'loss-1', cause: { fixture: true } },
    { operation: 'abort_instance', caseId: 'qualification-case' },
    { operation: 'command_fail_before_commit', caseId: 'qualification-case', envelope: { fixture: true } },
    { operation: 'runtime_probe', caseId: 'qualification-case' },
    { operation: 'writer_barrier_probe', caseId: 'qualification-case', expectedWriterCompatibilityId: 'writer-v2', envelope: { fixture: true } },
  ];
  for (const body of requests) {
    const response = await service.fetch(qualificationRequest(body));
    assert.equal(response.status, 200);
    assert.equal((await responseBody(response)).ok, true);
  }

  assert.equal(elections.length, 1);
  const elected = elections[0];
  assert.equal(elected.caseId, 'qualification-case');
  assert.equal(elected.placementGeneration, 1);
  assert.equal(elected.workerScript, 'tdev-d0019-qualification-a');
  assert.equal(elected.durableObjectId, 'do:tdev-d0019-qualification-a:qualification-case');
  assert.deepEqual(calls.map(([name]) => name), [
    'initialize',
    'load',
    'command',
    'recover_execution_owner_loss',
    'abort_instance',
    'command_fail_before_commit',
    'runtime_probe',
    'writer_barrier_probe',
  ]);
  for (const [, input] of calls) assert.equal(input.placement.placementDigest, elected.placementDigest);
});

test('D0019 qualification ingress loses only the postcommit response after a successful Durable Object RPC', async () => {
  const calls = [];
  const service = new D0019QualificationService(deploymentEnvironment({
    stub: {
      async qualificationInvoke(input) {
        calls.push(input);
        return { schemaVersion: 1, ok: true, result: { caseRevision: 2 } };
      },
    },
  }), { placementAuthority: {} });

  const response = await service.fetch(qualificationRequest({
    operation: 'command_then_abort',
    caseId: 'response-loss-case',
    envelope: { fixture: true },
  }));
  assert.equal(response.status, 500);
  assert.equal((await responseBody(response)).error.code, 'qualification_provider_failure');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].operation, 'command');
});

test('D0019 qualification ingress normalizes strict JSON records before the Durable Object RPC boundary', async () => {
  const service = new D0019QualificationService(deploymentEnvironment({
    stub: {
      async qualificationInvoke(input) {
        assertRpcTransportRecords(input);
        return { schemaVersion: 1, ok: false, error: { code: 'placement_not_elected' } };
      },
    },
  }), { placementAuthority: {} });

  const response = await service.fetch(qualificationRequest({
    operation: 'initialize',
    caseId: 'rpc-transport-case',
    plan: {},
  }));
  assert.equal(response.status, 400);
  assert.equal((await responseBody(response)).error.code, 'placement_not_elected');
});

test('D0019 qualification ingress authenticates before provider access and rejects placement smuggling', async () => {
  let providerCalls = 0;
  const stub = {
    async qualificationInvoke() {
      providerCalls += 1;
      return { schemaVersion: 1, ok: true, result: null };
    },
  };
  const service = new D0019QualificationService(deploymentEnvironment({ stub }), {
    placementAuthority: {
      async elect() {
        providerCalls += 1;
      },
    },
  });

  const unauthorized = await service.fetch(qualificationRequest(
    { operation: 'load', caseId: 'qualification-case' },
    { token: 'wrong-token-that-is-still-long-enough' },
  ));
  assert.equal(unauthorized.status, 401);
  assert.equal((await responseBody(unauthorized)).error.code, 'qualification_unauthorized');

  const smuggled = await service.fetch(qualificationRequest({
    operation: 'elect',
    caseId: 'qualification-case',
    placement: { workerScript: 'attacker-selected' },
  }));
  assert.equal(smuggled.status, 400);
  assert.equal((await responseBody(smuggled)).error.code, 'unexpected_keys');
  assert.equal(providerCalls, 0);
});

test('D0019 qualification ingress restores a structured remote ContractError after the DO RPC boundary', async () => {
  const service = new D0019QualificationService(deploymentEnvironment({
    stub: {
      async qualificationInvoke() {
        return { schemaVersion: 1, ok: false, error: { code: 'placement_conflict' } };
      },
    },
  }), { placementAuthority: {} });
  const response = await service.fetch(qualificationRequest({ operation: 'load', caseId: 'rpc-conflict-case' }));
  assert.equal(response.status, 409);
  assert.deepEqual(await responseBody(response), {
    ok: false,
    error: { code: 'placement_conflict', details: {} },
  });
});

test('D0019 qualification ingress rejects oversized or non-JSON requests before provider access', async () => {
  let providerCalls = 0;
  const service = new D0019QualificationService(deploymentEnvironment(), {
    placementAuthority: { async elect() { providerCalls += 1; } },
  });

  const oversized = await service.fetch(qualificationRequest(
    { operation: 'elect', caseId: 'qualification-case' },
    { headers: { 'content-length': String(D0019_QUALIFICATION_MAX_REQUEST_BYTES + 1) } },
  ));
  assert.equal(oversized.status, 400);
  assert.equal((await responseBody(oversized)).error.code, 'qualification_request_too_large');

  const nonJson = await service.fetch(new Request(`https://qualification.example${D0019_QUALIFICATION_PATH}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${qualificationToken}`, 'content-type': 'text/plain' },
    body: 'not json',
  }));
  assert.equal(nonJson.status, 400);
  assert.equal((await responseBody(nonJson)).error.code, 'qualification_invalid_request');
  assert.equal(providerCalls, 0);
});

test('D0019 qualification ingress rejects a provider ID outside the configured jurisdiction', async () => {
  let elections = 0;
  const env = deploymentEnvironment();
  env.TDEV_CASE_AUTHORITY.idFromName = () => ({
    toString: () => 'do:wrong-jurisdiction',
    jurisdiction: 'us',
  });
  const service = new D0019QualificationService(env, {
    placementAuthority: { async elect() { elections += 1; } },
  });

  const response = await service.fetch(qualificationRequest({
    operation: 'elect',
    caseId: 'qualification-case',
  }));
  assert.equal(response.status, 400);
  assert.equal((await responseBody(response)).error.code, 'invalid_qualification_provider');
  assert.equal(elections, 0);
});

function qualificationContext(events) {
  return {
    id: { toString: () => 'do:qualification-case', jurisdiction: 'eu' },
    storage: {
      transactionSync(operation) { return operation(); },
      sql: { exec() { return { toArray: () => [] }; } },
    },
    blockConcurrencyWhile(operation) {
      this.initialization = operation;
    },
    abort(reason) {
      events.push(`abort:${reason}`);
      throw new ContractError('provider_abort', 'simulated provider abort');
    },
  };
}

test('D0019 qualification DO instance-abort hook aborts only after election', async () => {
  const events = [];
  const host = new D0019QualificationCaseDOHost(qualificationContext(events), deploymentEnvironment());
  host.host = {
    async requireElectedPlacement() {
      events.push('placement');
    },
  };

  await assert.rejects(
    host.qualificationAbortInstance({ placement: {} }),
    (error) => error?.code === 'provider_abort',
  );
  assert.deepEqual(events, ['placement', 'abort:tdev_d0019_qualification_abort_instance']);
});

test('D0019 qualification DO injects a precommit command failure only after election and restores the authority hook', async () => {
  const events = [];
  const host = new D0019QualificationCaseDOHost(qualificationContext(events), deploymentEnvironment());
  const authority = {
    faultInjector: null,
    command() {
      events.push('command');
      this.faultInjector('before_commit', { operation: 'command' });
    },
  };
  host.host = {
    authority,
    async requireElectedPlacement(placement) {
      events.push('placement');
      return placement;
    },
  };

  await assert.rejects(
    host.qualificationCommandFailBeforeCommit({ placement: {}, envelope: {} }),
    (error) => error?.code === 'qualification_injected_precommit_failure',
  );
  assert.deepEqual(events, ['placement', 'command']);
  assert.equal(authority.faultInjector, null);
});

test('D0019 qualification DO serializes ContractError codes before the provider RPC boundary', async () => {
  const host = new D0019QualificationCaseDOHost(qualificationContext([]), deploymentEnvironment());
  host.host = {
    async initializeElectedCase() {
      throw new ContractError('placement_conflict', 'simulated remote placement conflict');
    },
  };
  assert.deepEqual(await host.qualificationInvoke({
    operation: 'initialize',
    placement: {},
    plan: {},
  }), {
    schemaVersion: 1,
    ok: false,
    error: { code: 'placement_conflict' },
  });
});

test('D0019 qualification writer barrier probes only the exact running writer and reports mutation rejection', async () => {
  const events = [];
  const host = new D0019QualificationCaseDOHost(qualificationContext(events), deploymentEnvironment());
  host.host = {
    config: {
      writerCompatibilityId: 'writer-v1',
      maxAuthoritativeBytesPerCase: 8 * 1024 * 1024,
      placement: { workerScript: 'tdev-d0019-qualification-a', namespace: 'TDEV_CASE_AUTHORITY', jurisdiction: 'eu' },
    },
    async requireElectedPlacement() {
      events.push('placement');
    },
    async command() {
      events.push('command');
      throw new ContractError('casedo_writer_incompatible', 'simulated incompatible durable writer');
    },
  };
  const skipped = await host.qualificationWriterBarrierProbe({
    placement: {},
    expectedWriterCompatibilityId: 'writer-v2',
    envelope: {},
  });
  assert.equal(skipped.attempted, false);
  assert.deepEqual(events, ['placement']);

  events.length = 0;
  const rejected = await host.qualificationWriterBarrierProbe({
    placement: {},
    expectedWriterCompatibilityId: 'writer-v1',
    envelope: {},
  });
  assert.equal(rejected.attempted, true);
  assert.deepEqual(rejected.mutation, { committed: false, errorCode: 'casedo_writer_incompatible' });
  assert.equal(rejected.sourceSha, '1'.repeat(40));
  assert.equal(rejected.workerVersionId, 'worker-version-1');
  assert.deepEqual(events, ['placement', 'command']);
});

test('D0019 qualification runtime is unavailable unless the exact mode is enabled', () => {
  assert.throws(
    () => new D0019QualificationService(deploymentEnvironment({ mode: 'disabled' }), { placementAuthority: {} }),
    (error) => error?.code === 'qualification_mode_disabled',
  );
});
