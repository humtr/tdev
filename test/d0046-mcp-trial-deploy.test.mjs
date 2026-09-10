import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  D0046_ACCESS_APP_NAME,
  D0046_MIN_CASE_AUTHORITATIVE_BYTES,
  D0046_QUALIFIED_CASE_AUTHORITATIVE_BYTES,
  D0046_MCP_TRIAL_DOMAIN,
  D0046_MCP_TRIAL_RESOURCE,
  D0046_MCP_RUNTIME_DOMAIN,
  D0046_MCP_RUNTIME_RESOURCE,
  D0046_MCP_RUNTIME_SCRIPT,
  D0046_MCP_CONTEXT_SCOPE,
  D0046_CASE_SOURCE_SHAS,
  accessApplicationPayload,
  assertCaseOwnerCapacity,
  accessPolicyPayload,
  buildCanonicalRuntimeMetadata,
  buildLegacyTransferMetadata,
  buildTrialManifests,
  buildWorkerMetadata,
  existingTrialIdentity,
} from '../qualification/d0046-mcp-trial-deploy.mjs';
import { mcpDiscoveryResponse } from '../src/mcp-discovery.mjs';
import { digest } from '../src/canonical.mjs';
import { createRepositoryBaseIdentity, scopeDigest } from '../src/lazy-plan-reference.mjs';
import { developmentOperationCatalogDigest } from '../src/development-operation-catalog.mjs';
import { agentRouteHostKey } from '../src/agent-route-election.mjs';
import { MCP_RUNTIME_COMPOSITION_PROFILE } from '../src/mcp-trial-composition.mjs';

const SOURCE_SHA = 'a'.repeat(40);
const BASE_TREE = { 'src/example.mjs': 'export const example = 1;\n' };

test('D0046 self-development context is bounded to the eight Directive-r4 canonical-runtime files', () => {
  assert.equal(D0046_MCP_CONTEXT_SCOPE.maxFiles, 8);
  assert.equal(D0046_MCP_CONTEXT_SCOPE.paths.length, 8);
  assert.deepEqual(D0046_MCP_CONTEXT_SCOPE.prefixes, []);
  for (const path of [
    'DIRECTIVE.md',
    'WORKBOARD.md',
    'docs/design/0046-minimum-viable-tdev-mcp-experiential-path.md',
    'qualification/d0046-mcp-trial-deploy.mjs',
    'qualification/d0046-agent-preserving-update.mjs',
    'qualification/cloudflare-mcp-trial-worker.mjs',
    'test/d0046-mcp-trial-deploy.test.mjs',
    'src/mcp-trial-composition.mjs',
  ]) assert.ok(D0046_MCP_CONTEXT_SCOPE.paths.includes(path));
});

test('D0046 light Case snapshot projection imports its clone helper', async () => {
  const source = await readFile(new URL('../qualification/cloudflare-mcp-trial-worker.mjs', import.meta.url), 'utf8');
  assert.match(source, /import \{[\s\S]*?canonicalClone,[\s\S]*?\} from '\.\.\/src\/canonical\.mjs';/u);
  assert.match(source, /snapshot: \(\) => canonicalClone\(snapshot\)/u);
});

test('D0046 light ingress owns the semantic catalog and delegates development_start to the execution DO', async () => {
  const source = await readFile(new URL('../qualification/cloudflare-mcp-trial-worker.mjs', import.meta.url), 'utf8');
  const driveSource = await readFile(new URL('../qualification/cloudflare-case-agent-drive-worker.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes("const DEVELOPMENT_OPERATION_CATALOG_BINDING = 'TDEV_MCP_DEVELOPMENT_OPERATION_CATALOG_JSON';"));
  assert.ok(source.includes("return invokeExecution(input.caseId, 'developmentStart', {"));
  assert.ok(driveSource.includes("'developmentStart',"));
  assert.ok(driveSource.includes("case 'developmentStart': result = await worker.surface.owners.developmentStart(request.input); break;"));
});

test('D0046 full development application binds its build profile from the materialized composition', async () => {
  const source = await readFile(new URL('../qualification/cloudflare-mcp-trial-worker.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('export async function createTrialApplication');
  const end = source.indexOf('/**\n * Construct the MCP surface', start);
  const applicationSource = source.slice(start, end);
  assert.ok(applicationSource.includes("profile: composition.profile === 'tdev.mcp.runtime-composition.v1'"));
  assert.equal(applicationSource.includes('configuredComposition.profile'), false);
});

test('D0047 bounded context tools stay light at ingress and execute through the fixed heavy-operation DO route', async () => {
  const source = await readFile(new URL('../qualification/cloudflare-mcp-trial-worker.mjs', import.meta.url), 'utf8');
  const driveSource = await readFile(new URL('../qualification/cloudflare-case-agent-drive-worker.mjs', import.meta.url), 'utf8');
  const placeholderSource = await readFile(new URL('../qualification/mcp-trial-base-tree.mjs', import.meta.url), 'utf8');
  const lightStart = source.indexOf('async function createTrialLightApplication');
  const lightEnd = source.indexOf('let lightApplicationPromise');
  const lightSource = source.slice(lightStart, lightEnd);

  assert.ok(source.includes('lazyContextProvider: loadMcpTrialLazyContext'));
  assert.ok(source.includes('const contextExecutionRouteKey = `context:${configuredComposition.repository.contextReference}`'));
  assert.ok(source.includes("developmentContextList: async (input = {}) => invokeContextExecution('developmentContextList', input)"));
  assert.ok(source.includes("developmentContextSearch: async (input = {}) => invokeContextExecution('developmentContextSearch', input)"));
  assert.ok(source.includes("developmentContextRead: async (input = {}) => invokeContextExecution('developmentContextRead', input)"));
  assert.equal(lightSource.includes('loadMcpTrialBaseTree()'), false);
  assert.equal(lightSource.includes('loadMcpTrialLazyContext()'), false);
  assert.ok(placeholderSource.includes('export async function loadMcpTrialLazyContext()'));
  for (const operation of ['developmentContextList', 'developmentContextSearch', 'developmentContextRead']) {
    assert.ok(driveSource.includes(`'${operation}',`));
    assert.ok(driveSource.includes(`case '${operation}': result = await execution.facades.contextOwner.${operation}(request.input); break;`));
  }
});

test('D0046 historical Drive worker named import remains compatible during canonical cutover', async () => {
  const workerSource = await readFile(new URL('../qualification/cloudflare-mcp-trial-worker.mjs', import.meta.url), 'utf8');
  const driveSource = await readFile(new URL('../qualification/cloudflare-case-agent-drive-worker.mjs', import.meta.url), 'utf8');
  assert.match(workerSource, /export \{ createRuntimeExecutionApplication as createTrialExecutionApplication \};/u);
  assert.match(driveSource, /import \{[^}]*createTrialExecutionApplication[^}]*\} from '\.\/cloudflare-mcp-trial-worker\.mjs';/u);
});

test('D0046 execution DO keeps runner drive off full tree construction under the 10 ms request budget', async () => {
  const source = await readFile(new URL('../qualification/cloudflare-mcp-trial-worker.mjs', import.meta.url), 'utf8');
  const driveSource = await readFile(new URL('../qualification/cloudflare-case-agent-drive-worker.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes('export async function createTrialDriveApplication'));
  assert.ok(source.includes('allowBindingManifest: true'));
  assert.ok(source.includes('skipCommandReload: true'));
  assert.ok(source.includes('const materializeManifest = () =>'));
  assert.ok(driveSource.includes('createTrialApplication, createTrialDriveApplication, createTrialExecutionApplication'));
  assert.ok(driveSource.includes("request.operation === 'runner.drive'"));
  assert.ok(driveSource.includes('createTrialDriveApplication(this.env, { driveOwnerOverride: this.host, resolveContext: contextResolver(this.env) })'));
  assert.ok(driveSource.includes('developmentContextResolveOverride: contextResolver(this.env)'));
  assert.ok(driveSource.includes('return async ({ selector = null, contextReference = null } = {}) => {'));
  assert.ok(driveSource.includes('selector: contextReference ?? selector'));
  assert.ok(driveSource.includes("fail('mcp_trial_context_scope_denied', 'Context resolver selector and contextReference disagree')"));
  assert.ok(driveSource.includes("request.operation === 'developmentUnitStart' || request.operation === 'developmentStart'"));
});



test('D0046 fixed Case source allowlist includes the lazy Plan compatible reader baselines', () => {
  assert.ok(D0046_CASE_SOURCE_SHAS.includes('746a09d4643bf268d9f4204304217e3309763422'));
  assert.ok(D0046_CASE_SOURCE_SHAS.includes('e5977a1abd95d90a7fc2039ab990d3550e1386f0'));
  assert.equal(new Set(D0046_CASE_SOURCE_SHAS).size, D0046_CASE_SOURCE_SHAS.length);
});

test('D0046 deployer composes a digest-bound trial and keeps the large tree out of env JSON', async () => {
  const operation = JSON.parse(await readFile(new URL('../config/development-operation-profiles.json', import.meta.url), 'utf8'));
  const manifests = buildTrialManifests({
    sourceSha: SOURCE_SHA,
    baseDigest: digest(BASE_TREE),
    baseTree: BASE_TREE,
    operationManifest: operation,
    driveNamespace: 'drive-namespace',
    accessAudience: 'access-audience',
    identity: { principalId: 'user@example.com', tenantId: 'user@example.com' },
    includeBaseTree: true,
  });
  assert.equal(Object.keys(manifests.composition.repository.context.baseTree).length, 1);
  assert.equal(manifests.composition.repository.context.repositoryCommitOid, SOURCE_SHA);
  assert.match(manifests.composition.manifestDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.match(manifests.auth.profileDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(manifests.auth.mcpResource, D0046_MCP_TRIAL_RESOURCE);
  const metadata = buildWorkerMetadata({
    manifests,
    sourceSha: SOURCE_SHA,
    artifact: { moduleDigest: 'sha256:' + 'c'.repeat(64), artifactManifestDigest: 'sha256:' + 'd'.repeat(64) },
    driveNamespace: 'drive-namespace',
  });
  const compositionBinding = metadata.bindings.find((binding) => binding.name === 'TDEV_MCP_TRIAL_MANIFEST_JSON');
  assert.equal(compositionBinding.type, 'plain_text');
  const boundComposition = JSON.parse(compositionBinding.text);
  assert.deepEqual(boundComposition.repository.context.baseTree, {});
  const catalogBinding = metadata.bindings.find((binding) => binding.name === 'TDEV_MCP_DEVELOPMENT_OPERATION_CATALOG_JSON');
  assert.equal(catalogBinding.type, 'plain_text');
  const boundCatalog = JSON.parse(catalogBinding.text);
  assert.equal(developmentOperationCatalogDigest(boundCatalog), manifests.operationCatalogDigest);
  assert.ok(boundCatalog.operations['tdev.operation.repository.change.generate.v1']);
  assert.equal(
    boundComposition.agentOwner.routeKey,
    agentRouteHostKey({ agentId: boundComposition.agentOwner.agentId, routeGeneration: boundComposition.agentOwner.routeGeneration }),
  );
  assert.equal(metadata.bindings.find((binding) => binding.name === 'TDEV_CASE_AGENT_DRIVE').namespace_id, 'drive-namespace');
  assert.equal(Object.hasOwn(metadata, 'limits'), false);
  assert.equal(metadata.exports.CaseAgentDriveRuntimeDO.storage, 'sqlite');
});





test('D0046 scoped Trial manifest preserves lazy scope and complete repository identity through strict normalization', async () => {
  const operation = JSON.parse(await readFile(new URL('../config/development-operation-profiles.json', import.meta.url), 'utf8'));
  const scope = {
    schemaVersion: 1,
    profile: 'tdev.repository-context-scope.v1',
    paths: ['src/example.mjs'],
    prefixes: [],
    maxFiles: 8,
    maxBytes: 1024 * 1024,
    maxSearchResults: 16,
  };
  const repositoryBaseIdentity = createRepositoryBaseIdentity({
    objectFormat: 'sha1',
    commitOid: SOURCE_SHA,
    treeOid: 'b'.repeat(40),
    manifestDigest: digest({ profile: 'test.repository-manifest.v1' }),
  });
  const manifests = buildTrialManifests({
    sourceSha: SOURCE_SHA,
    baseDigest: digest(BASE_TREE),
    baseTree: BASE_TREE,
    repositoryBaseIdentity,
    scope,
    scopeDigest: scopeDigest(scope),
    operationManifest: operation,
    driveNamespace: 'drive-namespace',
    accessAudience: 'access-audience',
    identity: { principalId: 'user@example.com', tenantId: 'user@example.com' },
    includeBaseTree: true,
  });
  assert.equal(manifests.composition.operation.contextProfile, 'tdev.repository.context.prepare.lazy.v1');
  assert.deepEqual(manifests.composition.repository.scope, scope);
  assert.equal(manifests.composition.repository.scopeDigest, scopeDigest(scope));
  assert.deepEqual(manifests.composition.repository.repositoryBaseIdentity, repositoryBaseIdentity);
  assert.equal(manifests.composition.repository.context.contextProfile, 'tdev.repository.context.prepare.lazy.v1');
  assert.deepEqual(manifests.composition.repository.context.contextScope, scope);
  assert.equal(manifests.composition.repository.context.scopeDigest, scopeDigest(scope));
  assert.equal(manifests.composition.repository.context.baseIdentity.manifestDigest, repositoryBaseIdentity.manifestDigest);
  assert.deepEqual(manifests.composition.repository.context.repositoryBaseIdentity, repositoryBaseIdentity);

  const metadata = buildWorkerMetadata({
    manifests,
    sourceSha: SOURCE_SHA,
    artifact: { moduleDigest: 'sha256:' + 'c'.repeat(64), artifactManifestDigest: 'sha256:' + 'd'.repeat(64) },
    driveNamespace: 'drive-namespace',
  });
  const bound = JSON.parse(metadata.bindings.find((binding) => binding.name === 'TDEV_MCP_TRIAL_MANIFEST_JSON').text);
  assert.deepEqual(bound.repository.context.baseTree, {});
  assert.deepEqual(bound.repository.scope, scope);
  assert.deepEqual(bound.repository.repositoryBaseIdentity, { ...repositoryBaseIdentity });
  assert.deepEqual(bound.repository.context.contextScope, scope);
  assert.deepEqual(bound.repository.context.repositoryBaseIdentity, { ...repositoryBaseIdentity });
});

test('D0046 deploy and resume preserve scoped base identity in every generated Trial manifest', async () => {
  const source = await readFile(new URL('../qualification/d0046-mcp-trial-deploy.mjs', import.meta.url), 'utf8');
  const callSites = source.split('buildTrialManifests({').slice(1)
    .map((body) => body.split('});', 1)[0])
    .filter((body) => body.includes('baseDigest: base.baseDigest'));
  assert.ok(callSites.length >= 3);
  for (const body of callSites) {
    assert.match(body, /repositoryBaseIdentity: base\.repositoryBaseIdentity/u);
    assert.match(body, /scope: base\.scope/u);
    assert.match(body, /scopeDigest: base\.scopeDigest/u);
  }
});

test('D0046 canonical metadata stages one existing Drive namespace transfer without a second product owner', async () => {
  const operation = JSON.parse(await readFile(new URL('../config/development-operation-profiles.json', import.meta.url), 'utf8'));
  const identity = { principalId: 'existing@example.test', tenantId: 'existing@example.test' };
  const manifests = buildTrialManifests({
    sourceSha: SOURCE_SHA,
    baseDigest: digest(BASE_TREE),
    baseTree: BASE_TREE,
    operationManifest: operation,
    driveNamespace: 'drive-namespace',
    accessAudience: 'canonical-audience',
    identity,
    includeBaseTree: true,
    compositionProfile: MCP_RUNTIME_COMPOSITION_PROFILE,
    resource: D0046_MCP_RUNTIME_RESOURCE,
    workerScript: D0046_MCP_RUNTIME_SCRIPT,
    environment: 'development',
    casePrefix: 'tdev-',
    driveWorkerScript: D0046_MCP_RUNTIME_SCRIPT,
  });
  assert.equal(manifests.composition.profile, MCP_RUNTIME_COMPOSITION_PROFILE);
  assert.equal(manifests.composition.resource, D0046_MCP_RUNTIME_RESOURCE);
  assert.equal(manifests.composition.workerScript, D0046_MCP_RUNTIME_SCRIPT);
  assert.equal(manifests.composition.driveOwner.placement.workerScript, D0046_MCP_RUNTIME_SCRIPT);
  assert.equal(manifests.auth.mcpResource, D0046_MCP_RUNTIME_RESOURCE);
  assert.equal(D0046_MCP_RUNTIME_DOMAIN, 'tdev.humtr.workers.dev/mcp');

  const baseMetadata = buildWorkerMetadata({
    manifests,
    sourceSha: SOURCE_SHA,
    artifact: { moduleDigest: 'sha256:' + 'c'.repeat(64), artifactManifestDigest: 'sha256:' + 'd'.repeat(64) },
    driveNamespace: 'drive-namespace',
  });
  const pending = buildCanonicalRuntimeMetadata(baseMetadata, { manifests, phase: 'expecting-transfer' });
  assert.equal(pending.bindings.some((binding) => binding.name === 'TDEV_CASE_AGENT_DRIVE'), false);
  assert.equal(pending.bindings.some((binding) => binding.name === 'TDEV_MCP_TRIAL_MANIFEST_JSON'), false);
  assert.equal(pending.bindings.find((binding) => binding.name === 'TDEV_MCP_RESOURCE')?.text, D0046_MCP_RUNTIME_RESOURCE);
  assert.deepEqual(pending.exports.CaseAgentDriveRuntimeDO, {
    type: 'durable-object', state: 'expecting-transfer', storage: 'sqlite', transfer_from: 'tdev-mcp-trial',
  });

  const live = buildCanonicalRuntimeMetadata(baseMetadata, { manifests, phase: 'live' });
  const liveDrive = live.bindings.find((binding) => binding.name === 'TDEV_CASE_AGENT_DRIVE');
  assert.equal(liveDrive?.namespace_id, 'drive-namespace');
  assert.equal(liveDrive?.script_name, undefined);
  assert.deepEqual(live.exports.CaseAgentDriveRuntimeDO, { type: 'durable-object', storage: 'sqlite' });

  const transferred = buildLegacyTransferMetadata(baseMetadata, { externalDrive: false });
  assert.equal(transferred.bindings.some((binding) => binding.name === 'TDEV_CASE_AGENT_DRIVE'), false);
  assert.deepEqual(transferred.exports.CaseAgentDriveRuntimeDO, {
    type: 'durable-object', state: 'transferred', transferred_to: D0046_MCP_RUNTIME_SCRIPT,
  });
  const fallback = buildLegacyTransferMetadata(baseMetadata, { externalDrive: true });
  assert.equal(fallback.bindings.find((binding) => binding.name === 'TDEV_CASE_AGENT_DRIVE')?.script_name, D0046_MCP_RUNTIME_SCRIPT);
});

test('D0046 resume identity is recovered from the existing Trial binding', async () => {
  const operation = JSON.parse(await readFile(new URL('../config/development-operation-profiles.json', import.meta.url), 'utf8'));
  const identity = { principalId: 'existing@example.test', tenantId: 'existing@example.test' };
  const manifests = buildTrialManifests({
    sourceSha: SOURCE_SHA,
    baseDigest: digest(BASE_TREE),
    baseTree: BASE_TREE,
    operationManifest: operation,
    driveNamespace: 'drive-namespace',
    accessAudience: 'access-audience',
    identity,
    includeBaseTree: true,
  });
  const metadata = buildWorkerMetadata({
    manifests,
    sourceSha: SOURCE_SHA,
    artifact: { moduleDigest: 'sha256:' + 'c'.repeat(64), artifactManifestDigest: 'sha256:' + 'd'.repeat(64) },
    driveNamespace: 'drive-namespace',
  });
  assert.deepEqual({ ...existingTrialIdentity(metadata) }, identity);
  assert.throws(() => existingTrialIdentity({ bindings: [] }), { code: 'd0046_update_binding_invalid' });
});

test('D0046 Access payload is the fixed ChatGPT managed-OAuth profile', () => {
  const app = accessApplicationPayload();
  assert.equal(app.name, D0046_ACCESS_APP_NAME);
  assert.equal(app.domain, D0046_MCP_TRIAL_DOMAIN);
  assert.equal(app.type, 'self_hosted');
  assert.equal(app.oauth_configuration.dynamic_client_registration.enabled, true);
  assert.deepEqual(app.oauth_configuration.dynamic_client_registration.allowed_uris, ['https://chatgpt.com/connector/oauth/*']);
  assert.equal(app.oauth_configuration.dynamic_client_registration.allow_any_on_localhost, false);
  assert.equal(app.oauth_configuration.dynamic_client_registration.allow_any_on_loopback, false);
  assert.deepEqual(accessPolicyPayload('11efca097a2e54ea53b457dcf9f36454').include, [{ cloudflare_account_member: { account_id: '11efca097a2e54ea53b457dcf9f36454' } }]);
});

test('D0046 Case admission rejects an undersized or malformed owner budget', () => {
  const settings = {
    bindings: [{ name: 'TDEV_CASEDO_MAX_AUTHORITATIVE_BYTES_PER_CASE', type: 'plain_text', text: String(8 * 1024 * 1024) }],
  };
  assert.throws(() => assertCaseOwnerCapacity(settings, D0046_MIN_CASE_AUTHORITATIVE_BYTES), { code: 'd0046_owner_capacity_mismatch' });
  assert.throws(() => assertCaseOwnerCapacity({ bindings: [{ name: 'TDEV_CASEDO_MAX_AUTHORITATIVE_BYTES_PER_CASE', type: 'plain_text', text: '016777216' }] }, D0046_MIN_CASE_AUTHORITATIVE_BYTES), { code: 'd0046_owner_capacity_mismatch' });
  assert.equal(assertCaseOwnerCapacity({ bindings: [{ name: 'TDEV_CASEDO_MAX_AUTHORITATIVE_BYTES_PER_CASE', type: 'plain_text', text: String(D0046_QUALIFIED_CASE_AUTHORITATIVE_BYTES) }] }, D0046_MIN_CASE_AUTHORITATIVE_BYTES), D0046_QUALIFIED_CASE_AUTHORITATIVE_BYTES);
});

test('D0046 discovery metadata bypasses large repository initialization', async () => {
  const operation = JSON.parse(await readFile(new URL('../config/development-operation-profiles.json', import.meta.url), 'utf8'));
  const manifests = buildTrialManifests({
    sourceSha: SOURCE_SHA,
    baseDigest: digest(BASE_TREE),
    baseTree: BASE_TREE,
    operationManifest: operation,
    driveNamespace: 'drive-namespace',
    accessAudience: 'access-audience',
    identity: { principalId: 'user@example.com', tenantId: 'user@example.com' },
    includeBaseTree: true,
  });
  const resource = mcpDiscoveryResponse(new Request(`${D0046_MCP_TRIAL_RESOURCE}`), manifests.auth);
  assert.equal(resource, null, 'the MCP endpoint itself must continue through the normal application path');
  const protectedMetadata = mcpDiscoveryResponse(new Request('https://tdev-mcp-trial.humtr.workers.dev/.well-known/oauth-protected-resource'), manifests.auth);
  assert.equal(protectedMetadata.status, 200);
  assert.deepEqual(await protectedMetadata.json(), {
    resource: D0046_MCP_TRIAL_RESOURCE,
    authorization_servers: ['https://humtr.cloudflareaccess.com'],
  });
  const pathProtectedMetadata = mcpDiscoveryResponse(new Request('https://tdev-mcp-trial.humtr.workers.dev/.well-known/oauth-protected-resource/mcp'), manifests.auth);
  assert.equal(pathProtectedMetadata.status, 200);
  assert.deepEqual(await pathProtectedMetadata.json(), {
    resource: D0046_MCP_TRIAL_RESOURCE,
    authorization_servers: ['https://humtr.cloudflareaccess.com'],
  });
  const authorizationMetadata = mcpDiscoveryResponse(new Request('https://tdev-mcp-trial.humtr.workers.dev/.well-known/oauth-authorization-server'), manifests.auth);
  assert.equal(authorizationMetadata.status, 200);
  const authorization = await authorizationMetadata.json();
  assert.equal(authorization.issuer, 'https://humtr.cloudflareaccess.com');
  assert.deepEqual(authorization.response_types_supported, ['code']);
  assert.deepEqual(authorization.response_modes_supported, ['query']);
  assert.deepEqual(authorization.grant_types_supported, ['authorization_code', 'refresh_token']);
  assert.deepEqual(authorization.token_endpoint_auth_methods_supported, ['client_secret_basic', 'client_secret_post', 'none']);
  assert.equal(authorization.revocation_endpoint, 'https://humtr.cloudflareaccess.com/cdn-cgi/access/oauth/revoke');
  assert.equal(authorization.registration_endpoint, 'https://humtr.cloudflareaccess.com/cdn-cgi/access/oauth/registration');
  assert.deepEqual(authorization.code_challenge_methods_supported, ['S256']);
});
