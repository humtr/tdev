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
