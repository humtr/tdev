import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  D0046_ACCESS_APP_NAME,
  D0046_MCP_TRIAL_DOMAIN,
  D0046_MCP_TRIAL_RESOURCE,
  accessApplicationPayload,
  accessPolicyPayload,
  buildTrialManifests,
  buildWorkerMetadata,
} from '../qualification/d0046-mcp-trial-deploy.mjs';
import { mcpDiscoveryResponse } from '../src/mcp-discovery.mjs';
import { digest } from '../src/canonical.mjs';

const SOURCE_SHA = 'a'.repeat(40);
const BASE_TREE = { 'src/example.mjs': 'export const example = 1;\n' };

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
  assert.equal(metadata.bindings.find((binding) => binding.name === 'TDEV_CASE_AGENT_DRIVE').namespace_id, 'drive-namespace');
  assert.equal(Object.hasOwn(metadata, 'limits'), false);
  assert.equal(metadata.exports.CaseAgentDriveRuntimeDO.storage, 'sqlite');
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
