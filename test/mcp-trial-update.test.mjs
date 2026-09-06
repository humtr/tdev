import test from 'node:test';
import { digest } from '../src/canonical.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  activeTrialDeployment, workerReadback, preparePreservingTrialManifests,
  buildTrialManifests, buildWorkerMetadata, accessApplicationPayload, accessPolicyPayload,
} from '../qualification/d0046-mcp-trial-deploy.mjs';

const active = { id: 'deployment-active', versions: [{ version_id: 'version-active', percentage: 100 }] };
const historical = { id: 'deployment-old', versions: [{ version_id: 'newest-upload', percentage: 100 }] };

test('trial readback follows active traffic, never a newer upload in historical deployments', async () => {
  const calls = [];
  const client = {
    accountPath: (p) => p,
    async request(method, p) {
      calls.push([method, p]);
      if (p.endsWith('/deployments')) return { result: { deployments: [active, historical] } };
      if (p.endsWith('/settings')) return { result: { bindings: [] } };
      if (p.endsWith('/versions/version-active')) return { result: { id: 'version-active' } };
      throw new Error(`unexpected request ${p}`);
    },
  };
  const result = await workerReadback(client);
  assert.equal(result.version.id, 'version-active');
  assert.ok(calls.every(([method]) => method === 'GET'));
  assert.equal(calls.filter(([, p]) => p.endsWith('/deployments')).length, 2);
  assert.throws(() => activeTrialDeployment([{ ...active, versions: [{ version_id: 'a', percentage: 50 }, { version_id: 'b', percentage: 50 }] }, historical]), { code: 'd0046_worker_traffic_mismatch' });
});

test('trial readback rejects a deployment change between its two observations', async () => {
  let reads = 0;
  const client = {
    accountPath: (p) => p,
    async request(method, p) {
      if (p.endsWith('/deployments')) return { result: { deployments: [++reads === 1 ? active : historical] } };
      if (p.endsWith('/settings')) return { result: { bindings: [] } };
      return { result: { id: 'version-active' } };
    },
  };
  await assert.rejects(workerReadback(client), { code: 'd0046_worker_predecessor_changed' });
});

async function fixture() {
  const operationManifest = JSON.parse(await readFile(new URL('../config/development-operation-profiles.json', import.meta.url), 'utf8'));
  const candidate = { sourceSha: 'a'.repeat(40), baseDigest: digest({ 'a.txt': 'base\n' }), baseTree: { 'a.txt': 'base\n' }, operationManifest };
  const prior = buildTrialManifests({ ...candidate, driveNamespace: '1'.repeat(32), accessAudience: '2'.repeat(64), identity: { principalId: 'owner@example.test', tenantId: 'owner@example.test' } });
  const settings = buildWorkerMetadata({ manifests: prior, sourceSha: candidate.sourceSha, artifact: { moduleDigest: 'artifact', artifactManifestDigest: 'manifest' }, driveNamespace: '1'.repeat(32) });
  const accountId = '3'.repeat(32);
  const accessApplication = { ...accessApplicationPayload(), aud: '2'.repeat(64), policies: [accessPolicyPayload(accountId)] };
  return { ...candidate, sourceSha: 'c'.repeat(40), settings, accessApplication, accountId };
}

test('preserving preparation reuses provider identity without principal environment input', async () => {
  const input = await fixture();
  const manifests = preparePreservingTrialManifests(input);
  assert.deepEqual({ ...manifests.composition.identity }, { principalId: 'owner@example.test', tenantId: 'owner@example.test' });
  assert.equal(manifests.composition.driveOwner.placement.namespace, '1'.repeat(32));
  assert.equal(manifests.auth.accessApplicationAudience, '2'.repeat(64));
  assert.equal(manifests.composition.repository.commitOid, 'c'.repeat(40));
});

test('preserving preparation rejects mismatched Access audience and owner binding', async () => {
  const input = await fixture();
  assert.throws(() => preparePreservingTrialManifests({ ...input, accessApplication: { ...input.accessApplication, aud: '4'.repeat(64) } }), { code: 'd0046_update_auth_changed' });
  input.settings.bindings.find((item) => item.name === 'TDEV_CASE_AUTHORITY').namespace_id = '5'.repeat(32);
  assert.throws(() => preparePreservingTrialManifests(input), { code: 'd0046_owner_binding_mismatch' });
});
