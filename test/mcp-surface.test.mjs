import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CaseRepository,
  MemorySnapshotStore,
  McpAccessAuthenticator,
  createMcpAuthManifest,
  createMcpSurfaceManifest,
  createTdevMcpSurface,
  createDevelopmentStartAdapter,
  DEVELOPMENT_CHANGESET_COMPOSE_OPERATION,
  developmentOperationDescriptor,
} from '../src/index.mjs';
import { ClaimLedger } from '../src/claim-ledger.mjs';
import { digest } from '../src/canonical.mjs';
import { planWithWork } from './helpers.mjs';

const now = 1_700_000_000;
const authManifest = createMcpAuthManifest({
  mcpResource: 'https://mcp.example.test/mcp',
  authorizationServerIssuer: 'https://auth.example.test',
  accessApplicationAudience: 'access-audience',
  jwksUri: 'https://auth.example.test/.well-known/jwks.json',
});
const surfaceManifest = createMcpSurfaceManifest({ buildDigest: digest({ source: 'mcp-test' }) });
const operationCatalog = JSON.parse(await readFile(new URL('../config/development-operation-catalog.json', import.meta.url), 'utf8'));

function makeAuth({ tenant = 'tenant-a', issuer = authManifest.authorizationServerIssuer, audience = authManifest.accessApplicationAudience, exp = now + 600 } = {}) {
  return new McpAccessAuthenticator({
    manifest: authManifest,
    now: () => now,
    verifyAssertion: async (assertion) => ({
      claims: { iss: issuer, aud: audience, exp, sub: assertion === 'tenant-b' ? 'user-b' : 'user-a', account_id: assertion === 'tenant-b' ? 'tenant-b' : tenant },
    }),
  });
}

function callRequest(method, params, { id = 1, assertion = 'valid', protocol = null } = {}) {
  const headers = {
    'content-type': 'application/json',
    'cf-access-jwt-assertion': assertion,
  };
  if (protocol !== null) headers['mcp-protocol-version'] = protocol;
  return new Request('https://mcp.example.test/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
}

function modernRequest(method, params = {}, { id = 1, assertion = 'valid', version = '2026-07-28', methodHeader = method, nameHeader = null } = {}) {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'cf-access-jwt-assertion': assertion,
    'mcp-protocol-version': version,
    'mcp-method': methodHeader,
  };
  if (nameHeader !== null) headers['mcp-name'] = nameHeader;
  return new Request('https://mcp.example.test/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params: {
        ...params,
        _meta: {
          'io.modelcontextprotocol/protocolVersion': version,
          'io.modelcontextprotocol/clientInfo': { name: 'modern-test-client', version: '1' },
          'io.modelcontextprotocol/clientCapabilities': {},
          ...(params._meta ?? {}),
        },
      },
    }),
  });
}

async function rpc(surface, request) {
  const response = await surface.fetch(request);
  const body = response.status === 202 ? null : await response.json();
  return { response, body };
}

function createSurface({ auth = makeAuth(), authorize = async ({ identity }) => identity.tenantId === 'tenant-a', repository = new CaseRepository(new MemorySnapshotStore()), owners = {} } = {}) {
  return createTdevMcpSurface({
    manifest: surfaceManifest,
    auth,
    repository,
    authorize,
    owners,
  });
}

test('D0024 auth profile binds resource/issuer and rejects wrong or expired assertions', async () => {
  const auth = makeAuth();
  const request = new Request('https://mcp.example.test/mcp', { headers: { 'cf-access-jwt-assertion': 'valid' } });
  const identity = await auth.authenticate(request);
  assert.equal(identity.principalId, 'user-a');
  assert.equal(identity.tenantId, 'tenant-a');
  await assert.rejects(
    () => makeAuth({ issuer: 'https://other.example.test' }).authenticate(request),
    (error) => error.code === 'mcp_auth_issuer_mismatch',
  );
  await assert.rejects(
    () => makeAuth({ exp: now - 61 }).authenticate(request),
    (error) => error.code === 'mcp_auth_assertion_expired',
  );
});

test('MCP metadata and initialize/tools/list/call use the compatible versioned stateless surface', async () => {
  const surface = createSurface({ owners: { claimLedger: new ClaimLedger(), operationCatalog } });
  const metadata = await surface.fetch(new Request('https://mcp.example.test/.well-known/oauth-protected-resource'));
  assert.equal(metadata.status, 200);
  assert.deepEqual(await metadata.json(), {
    resource: authManifest.mcpResource,
    authorization_servers: [authManifest.authorizationServerIssuer],
  });
  assert.deepEqual(surfaceManifest.protocolVersions, ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26']);
  for (const protocolVersion of surfaceManifest.protocolVersions.filter((value) => value !== '2026-07-28')) {
    const initialized = await rpc(surface, callRequest('initialize', {
      protocolVersion,
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1', title: 'Test client' },
    }, { protocol: protocolVersion }));
    assert.equal(initialized.response.status, 200);
    assert.equal(initialized.body.result.protocolVersion, protocolVersion);
    assert.equal(initialized.body.result.serverInfo.name, 'tdev');
    assert.match(initialized.body.result.instructions, /development_context_get/);
  }
  const listed = await rpc(surface, callRequest('tools/list', {}, { protocol: '2025-11-25' }));
  assert.equal(listed.response.status, 200);
  const expectedTools = [
    'case_create', 'case_get', 'case_events_get', 'case_drive', 'task_cancel', 'attempt_reconcile',
    'claim_conflicts_get', 'case_promotion_get', 'development_context_get', 'development_context_list',
    'development_context_search', 'development_context_read', 'operation_list', 'operation_get',
    'development_start', 'development_get',
  ];
  assert.deepEqual(listed.body.result.tools.map((tool) => tool.name), expectedTools);
  assert.equal(listed.body.result.tools.length, 16);
  assert.equal(listed.body.result.tools.some((tool) => ['case_run_or_resume', 'promotion_get', 'development_unit_start', 'development_unit_get'].includes(tool.name)), false);
  for (const descriptor of listed.body.result.tools) {
    assert.equal(typeof descriptor.title, 'string');
    assert.deepEqual(descriptor.outputSchema, { type: 'object', additionalProperties: true });
    assert.deepEqual(descriptor.annotations, {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
  }
  const operationList = await rpc(surface, callRequest('tools/call', { name: 'operation_list', arguments: {} }, { protocol: '2025-11-25', id: 'operation-list' }));
  assert.equal(operationList.response.status, 200);
  assert.equal(operationList.body.result.structuredContent.items.some((entry) => entry.id === DEVELOPMENT_CHANGESET_COMPOSE_OPERATION), true);
  assert.equal(operationList.body.result.structuredContent.items.every((entry) => entry.inputSchema === undefined), true);
  const composeDescriptor = developmentOperationDescriptor(operationCatalog, DEVELOPMENT_CHANGESET_COMPOSE_OPERATION, 1);
  const operationGet = await rpc(surface, callRequest('tools/call', { name: 'operation_get', arguments: { id: DEVELOPMENT_CHANGESET_COMPOSE_OPERATION, version: 1 } }, { protocol: '2025-11-25', id: 'operation-get' }));
  assert.equal(operationGet.response.status, 200);
  assert.equal(operationGet.body.result.structuredContent.contractDigest, composeDescriptor.contractDigest);
  assert.equal(operationGet.body.result.structuredContent.inputSchema.type, 'object');
  const discovered = await rpc(surface, modernRequest('server/discover', {}, { id: 'discover-1' }));
  assert.equal(discovered.response.status, 200);
  assert.equal(discovered.body.result.resultType, 'complete');
  assert.deepEqual(discovered.body.result.supportedVersions, surfaceManifest.protocolVersions);
  assert.equal(discovered.body.result._meta['io.modelcontextprotocol/serverInfo'].name, 'tdev');

  const discoveredWithForwardField = await rpc(surface, modernRequest('server/discover', {
    clientTransportHint: 'chatgpt-hosted',
  }, { id: 'discover-forward-field' }));
  assert.equal(discoveredWithForwardField.response.status, 200);

  const modernListed = await rpc(surface, modernRequest('tools/list', {}, { id: 'list-1' }));
  assert.equal(modernListed.response.status, 200);
  assert.equal(modernListed.body.result.resultType, 'complete');
  assert.equal(modernListed.body.result.tools.length, surfaceManifest.tools.length);
  assert.equal(modernListed.body.result.cacheScope, 'private');

  for (const protocolVersion of surfaceManifest.protocolVersions.filter((value) => value !== '2026-07-28')) {
    const called = await rpc(surface, callRequest('tools/call', {
      name: 'claim_conflicts_get', arguments: { claims: [] },
    }, { protocol: protocolVersion, id: `call-${protocolVersion}` }));
    assert.equal(called.response.status, 200);
    assert.equal(called.body.result.isError, false);
    assert.deepEqual(called.body.result.structuredContent, { conflicts: [], revision: 0 });
  }
  const modernCalled = await rpc(surface, modernRequest('tools/call', {
    name: 'claim_conflicts_get', arguments: { claims: [] },
  }, { id: 'call-modern', nameHeader: 'claim_conflicts_get' }));
  assert.equal(modernCalled.response.status, 200);
  assert.equal(modernCalled.body.result.resultType, 'complete');
  assert.equal(modernCalled.body.result.isError, false);
  assert.deepEqual(modernCalled.body.result.structuredContent, { conflicts: [], revision: 0 });

  const legacyInitializeWithForwardField = await rpc(surface, callRequest('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'legacy-forward-field', version: '1' },
    clientTransportHint: 'chatgpt-hosted',
  }, { id: 'initialize-forward-field', protocol: '2025-03-26' }));
  assert.equal(legacyInitializeWithForwardField.response.status, 200);
});

test('modern MCP metadata and routing headers fail closed before authorization on mismatch', async () => {
  let authorizations = 0;
  const surface = createSurface({ authorize: async () => { authorizations += 1; return true; } });
  const mismatch = await rpc(surface, modernRequest('tools/list', {}, { methodHeader: 'tools/call' }));
  assert.equal(mismatch.response.status, 400);
  assert.equal(mismatch.body.error.code, -32020);
  assert.equal(mismatch.body.error.data.code, 'mcp_header_mismatch');
  assert.equal(authorizations, 0);
  const unsupported = await rpc(surface, modernRequest('tools/list', {}, { version: '2027-01-01', methodHeader: 'tools/list' }));
  assert.equal(unsupported.response.status, 400);
  assert.equal(unsupported.body.error.code, -32022);
  assert.deepEqual(unsupported.body.error.data.supported, surfaceManifest.protocolVersions);
  assert.equal(authorizations, 0);
});

test('surface manifest rejects duplicate protocol versions without changing negotiation order', () => {
  assert.throws(
    () => createMcpSurfaceManifest({
      buildDigest: digest({ source: 'mcp-duplicate-version-test' }),
      protocolVersions: ['2026-07-28', '2026-07-28'],
    }),
    (error) => error.code === 'mcp_surface_protocol_duplicate',
  );
  assert.deepEqual(surfaceManifest.protocolVersions, ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26']);
});

test('MCP case projection delegates to repository and tenant denial precedes owner access', async () => {
  const repository = new CaseRepository(new MemorySnapshotStore());
  await repository.create({ caseId: 'case-a', plan: planWithWork([{ id: 'task-a' }], { 'README.md': '# base\n' }) });
  let ownerReads = 0;
  const surface = createSurface({ repository, owners: { repository: { load: async (...args) => { ownerReads += 1; return repository.load(...args); } } } });
  const read = await rpc(surface, callRequest('tools/call', { name: 'case_get', arguments: { caseId: 'case-a' } }, { protocol: '2025-03-26' }));
  assert.equal(read.response.status, 200);
  assert.equal(read.body.result.isError, false);
  const projection = read.body.result.structuredContent;
  assert.equal(projection.caseId, 'case-a');
  assert.equal(projection.canonicalTree, undefined);
  assert.equal(ownerReads, 1);

  const legacyEngine = await repository.load('case-a');
  const legacySnapshot = legacyEngine.snapshot();
  delete legacySnapshot.canonicalDigest;
  delete legacySnapshot.plan.promotionTaskId;
  const legacySurface = createSurface({ owners: { repository: { load: async () => ({ snapshot: () => legacySnapshot }) } } });
  const legacyRead = await rpc(legacySurface, callRequest('tools/call', { name: 'case_get', arguments: { caseId: 'case-a' } }, { protocol: '2025-03-26' }));
  assert.equal(legacyRead.response.status, 200);
  assert.equal(legacyRead.body.result.isError, false);
  assert.equal(legacyRead.body.result.structuredContent.canonicalDigest, null);
  const legacyPromotion = await rpc(legacySurface, callRequest('tools/call', { name: 'case_promotion_get', arguments: { caseId: 'case-a' } }, { protocol: '2025-03-26' }));
  assert.equal(legacyPromotion.response.status, 200);
  assert.equal(legacyPromotion.body.result.isError, false);
  assert.equal(legacyPromotion.body.result.structuredContent.promotionTaskId, 'promote');
  assert.equal(legacyPromotion.body.result.structuredContent.canonicalDigest, null);

  const denied = createSurface({ repository, auth: makeAuth({ tenant: 'tenant-b' }), authorize: async () => false });
  const deniedResult = await rpc(denied, callRequest('tools/call', { name: 'case_get', arguments: { caseId: 'case-a' } }, { protocol: '2025-03-26', assertion: 'tenant-b' }));
  assert.equal(deniedResult.response.status, 403);
  assert.equal(deniedResult.body.error.data.code, 'mcp_authorization_denied');
});

test('authentication failures advertise the protected-resource metadata endpoint', async () => {
  const surface = createSurface({ auth: makeAuth() });
  const request = new Request('https://mcp.example.test/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'mcp-protocol-version': '2025-03-26',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
  const response = await surface.fetch(request);
  assert.equal(response.status, 401);
  assert.equal(
    response.headers.get('www-authenticate'),
    'Bearer error="invalid_token", resource="https://mcp.example.test/mcp", resource_metadata="https://mcp.example.test/.well-known/oauth-protected-resource/mcp"',
  );
});

test('strict parser rejects duplicate members, batches, and missing protocol before any owner call', async () => {
  let authorizations = 0;
  const surface = createSurface({ authorize: async () => { authorizations += 1; return true; } });
  const duplicate = new Request('https://mcp.example.test/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-access-jwt-assertion': 'valid' },
    body: '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{},"params":{}}',
  });
  const duplicateResult = await rpc(surface, duplicate);
  assert.equal(duplicateResult.response.status, 400);
  assert.equal(duplicateResult.body.error.data.code, 'mcp_invalid_json');
  assert.equal(authorizations, 0);
  const batch = await rpc(surface, new Request('https://mcp.example.test/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-access-jwt-assertion': 'valid' },
    body: '[{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}]',
  }));
  assert.equal(batch.response.status, 400);
  assert.equal(batch.body.error.data.code, 'mcp_invalid_rpc');
  const noProtocol = await rpc(surface, callRequest('tools/list', {}, { id: 2 }));
  assert.equal(noProtocol.response.status, 400);
  assert.equal(noProtocol.body.error.data.code, 'mcp_protocol_required');
});

test('task cancellation is receipt-backed and exact replay stays on the Case owner', async () => {
  const repository = new CaseRepository(new MemorySnapshotStore());
  await repository.create({ caseId: 'case-cancel', plan: planWithWork([{ id: 'task-cancel' }]) });
  const surface = createSurface({ repository });
  const args = { name: 'task_cancel', arguments: { requestId: 'cancel-1', caseId: 'case-cancel', taskId: 'task-cancel', reason: 'operator-request' } };
  const first = await rpc(surface, callRequest('tools/call', args, { id: 10, protocol: '2025-03-26' }));
  assert.equal(first.response.status, 200);
  assert.equal(first.body.result.structuredContent.deduplicated, false);
  const replay = await rpc(surface, callRequest('tools/call', args, { id: 11, protocol: '2025-03-26' }));
  assert.equal(replay.response.status, 200);
  assert.equal(replay.body.result.structuredContent.deduplicated, true);
  const conflict = await rpc(surface, callRequest('tools/call', { ...args, arguments: { ...args.arguments, reason: 'changed' } }, { id: 12, protocol: '2025-03-26' }));
  assert.equal(conflict.response.status, 400);
  assert.equal(conflict.body.error.data.code, 'request_conflict');
  const events = await rpc(surface, callRequest('tools/call', { name: 'case_events_get', arguments: { caseId: 'case-cancel', afterSequence: 0, limit: 10 } }, { id: 13, protocol: '2025-03-26' }));
  assert.equal(events.body.result.structuredContent.events.some((event) => event.type === 'task_cancelled'), true);
});

test('claim conflict projection is read-only and bounded', async () => {
  const ledger = new ClaimLedger();
  ledger.tryAcquire({ caseId: 'case-a', taskId: 'task-a', attemptId: 'attempt-a', claims: [{ mode: 'write', resource: 'workspace:src/**' }] });
  const surface = createSurface({ owners: { claimLedger: ledger } });
  const result = await rpc(surface, callRequest('tools/call', {
    name: 'claim_conflicts_get',
    arguments: { claims: [{ mode: 'read', resource: 'workspace:src/file.js' }] },
  }, { protocol: '2025-03-26' }));
  assert.equal(result.response.status, 200);
  assert.equal(result.body.result.structuredContent.conflicts.length, 1);
  assert.equal(ledger.activeLeases().length, 1);
});

test('development_start composes only owner-issued context plus strict semantic operation with owner-required validation', async () => {
  const calls = [];
  const runner = {
    create: async (input) => { calls.push({ kind: 'create', input }); return { classification: 'accepted' }; },
    drive: async (input) => { calls.push({ kind: 'drive', input }); return { classification: 'accepted' }; },
  };
  const baseTree = { 'README.md': '# context\n' };
  const baseDigest = digest(baseTree);
  const composeDescriptor = developmentOperationDescriptor(operationCatalog, DEVELOPMENT_CHANGESET_COMPOSE_OPERATION, 1);
  const start = createDevelopmentStartAdapter({
    runner,
    operationCatalog,
    resolveContext: async ({ contextReference }) => ({
      contextReferenceId: contextReference,
      revisionId: 'context-revision-1',
      baseTree,
      repositoryCommitOid: 'a'.repeat(40),
      objectFormat: 'sha1',
      baseDigest,
      payload: { source: 'owner' },
    }),
  });
  const result = await start({
    requestId: 'development-request-1',
    caseId: 'development-case-1',
    driveRequestId: 'development-drive-1',
    contextReference: 'context-1',
    operation: {
      id: DEVELOPMENT_CHANGESET_COMPOSE_OPERATION,
      version: 1,
      contractDigest: composeDescriptor.contractDigest,
      input: { baseDigest, writes: [{ path: 'src/value.mjs', content: 'export const value = 1;\n' }] },
    },
    identity: { principalId: 'user-a', tenantId: 'tenant-a' },
  });
  assert.match(result.planDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].input.plan.tasksById.model, undefined);
  assert.equal(calls[0].input.plan.tasksById.change.input.operation.id, DEVELOPMENT_CHANGESET_COMPOSE_OPERATION);
  assert.equal(calls[0].input.plan.tasksById.validate.execution.requirePassed, true);
  assert.equal(calls[0].input.payload.contextReference, 'context-1');
  assert.equal(Object.hasOwn(calls[0].input.payload, 'validationProfile'), false);
  assert.equal(Object.hasOwn(calls[0].input.payload, 'instruction'), false);
});
