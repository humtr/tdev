import test from 'node:test';
import { digest } from '../src/canonical.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  activeTrialDeployment, workerReadback, preparePreservingTrialManifests,
  validatePreservingUpdateAdmission, applyPreparedMcpTrialUpdate, summarizeMcpTrialUpdatePreparation,
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
  const accessApplication = { id: 'app-1', ...accessApplicationPayload(), aud: '2'.repeat(64), policies: [accessPolicyPayload(accountId)] };
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

async function updateFixture() {
  const input = await fixture();
  const manifests = preparePreservingTrialManifests(input);
  const artifact = { moduleDigest: 'artifact-new', artifactManifestDigest: 'manifest-new' };
  const metadata = buildWorkerMetadata({ manifests, sourceSha: input.sourceSha, artifact, driveNamespace: '1'.repeat(32) });
  const predecessorDeployment = { id: 'deployment-before', versions: [{ version_id: 'version-before', percentage: 100 }] };
  const preservation = Object.freeze({
    settingsDigest: digest(input.settings),
    deploymentDigest: digest(predecessorDeployment),
    accessApplicationId: input.accessApplication.id,
    accessApplicationDigest: digest(input.accessApplication),
    driveNamespace: '1'.repeat(32),
  });
  const prepared = {
    sourceSha: input.sourceSha,
    predecessor: { settings: input.settings, deployment: predecessorDeployment },
    manifests,
    modules: new Map([['qualification/cloudflare-mcp-trial-worker.mjs', 'source']]),
    artifact,
    metadata,
    preservation,
    preservationDigest: digest(preservation),
    remainingGates: ['retained Case/drive reader compatibility', 'shared owner consumers', 'positive execution quiescence', 'installed Agent release compatibility'],
  };
  const admission = {
    profile: 'tdev.d0046.preserving-update-admission.v1',
    sourceSha: prepared.sourceSha,
    preservationDigest: prepared.preservationDigest,
    retainedStateCompatibilityDigest: digest({ gate: 'retained-state' }),
    sharedOwnerConsumersDigest: digest({ gate: 'shared-consumers' }),
    positiveExecutionQuiescenceDigest: digest({ gate: 'quiescence' }),
    installedAgentCompatibilityDigest: digest({ gate: 'installed-agent' }),
  };
  const desiredWorker = {
    settings: metadata,
    version: {
      id: 'version-after',
      resources: {
        script_runtime: {
          compatibility_date: metadata.compatibility_date,
          compatibility_flags: metadata.compatibility_flags,
          exports: metadata.exports,
        },
      },
    },
    deployment: { id: 'deployment-after', versions: [{ version_id: 'version-after', percentage: 100 }] },
  };
  const predecessorWorker = {
    settings: input.settings,
    version: { id: 'version-before' },
    deployment: predecessorDeployment,
  };
  const client = {
    accountId: input.accountId,
    accountPath: (p) => p,
    async request(method, p) {
      assert.equal(method, 'GET');
      assert.equal(p, `/access/apps/${input.accessApplication.id}`);
      return { result: input.accessApplication };
    },
  };
  return { input, prepared, admission, desiredWorker, predecessorWorker, client };
}

test('preserving update admission is exact and bound to source, predecessor and four gate receipts', async () => {
  const { prepared, admission } = await updateFixture();
  const accepted = validatePreservingUpdateAdmission(admission, prepared);
  assert.equal(accepted.admissionDigest, digest(admission));
  assert.throws(() => validatePreservingUpdateAdmission({ ...admission, extra: true }, prepared), { code: 'd0046_update_admission_invalid' });
  assert.throws(() => validatePreservingUpdateAdmission({ ...admission, preservationDigest: digest({ stale: true }) }, prepared), { code: 'd0046_update_admission_stale' });
  assert.throws(() => validatePreservingUpdateAdmission({ ...admission, positiveExecutionQuiescenceDigest: 'not-a-digest' }, prepared), { code: 'd0046_update_admission_invalid' });
});

test('preserving update summary exposes predecessor identity without authorizing provider mutation', async () => {
  const { prepared } = await updateFixture();
  const summary = summarizeMcpTrialUpdatePreparation(prepared);
  assert.equal(summary.status, 'prepared_preserving_update');
  assert.equal(summary.sourceSha, prepared.sourceSha);
  assert.equal(summary.preservationDigest, prepared.preservationDigest);
  assert.equal(summary.predecessorVersionId, 'version-before');
  assert.equal(summary.driveNamespace, '1'.repeat(32));
  assert.equal(summary.accessApplicationId, 'app-1');
  assert.equal(summary.providerMutation, false);
  assert.equal(summary.secretValues, 'excluded');
  assert.deepEqual(summary.remainingGates, prepared.remainingGates);
});

test('preserving update refuses a stale provider predecessor before upload', async () => {
  const { prepared, admission, predecessorWorker, client } = await updateFixture();
  let uploads = 0;
  const changedWorker = {
    ...predecessorWorker,
    deployment: { id: 'deployment-changed', versions: [{ version_id: 'version-changed', percentage: 100 }] },
  };
  await assert.rejects(applyPreparedMcpTrialUpdate({
    client,
    prepared,
    admission,
    readWorker: async () => changedWorker,
    upload: async () => { uploads += 1; },
  }), { code: 'd0046_worker_predecessor_changed' });
  assert.equal(uploads, 0);
});

test('ambiguous preserving upload is never replayed and reconciles only from desired authoritative readback', async () => {
  const { prepared, admission, predecessorWorker, desiredWorker, client } = await updateFixture();
  let reads = 0;
  let uploads = 0;
  const result = await applyPreparedMcpTrialUpdate({
    client,
    prepared,
    admission,
    readWorker: async () => (++reads === 1 ? predecessorWorker : desiredWorker),
    upload: async () => {
      uploads += 1;
      const error = new Error('response lost after upload');
      error.code = 'cloudflare_api_unavailable';
      throw error;
    },
  });
  assert.equal(uploads, 1);
  assert.equal(reads, 2);
  assert.equal(result.status, 'reconciled_after_ambiguous_upload');
  assert.equal(result.uploadErrorCode, 'cloudflare_api_unavailable');
  assert.equal(result.predecessorVersionId, 'version-before');
  assert.equal(result.activeVersionId, 'version-after');
  assert.equal(result.driveNamespace, '1'.repeat(32));
  assert.equal(result.providerMutation, true);
});

test('successful preserving upload requires desired authoritative readback before reporting updated', async () => {
  const { prepared, admission, predecessorWorker, desiredWorker, client } = await updateFixture();
  let reads = 0;
  let uploads = 0;
  const result = await applyPreparedMcpTrialUpdate({
    client,
    prepared,
    admission,
    readWorker: async () => (++reads === 1 ? predecessorWorker : desiredWorker),
    upload: async () => { uploads += 1; },
  });
  assert.equal(uploads, 1);
  assert.equal(reads, 2);
  assert.equal(result.status, 'updated');
  assert.equal(result.uploadErrorCode, null);
  assert.equal(result.activeVersionId, 'version-after');
});

test('trusted upload response still leaves effect unknown when authoritative readback fails', async () => {
  const { prepared, admission, predecessorWorker, client } = await updateFixture();
  let reads = 0;
  let uploads = 0;
  await assert.rejects(applyPreparedMcpTrialUpdate({
    client,
    prepared,
    admission,
    readWorker: async () => {
      reads += 1;
      if (reads === 1) return predecessorWorker;
      const error = new Error('readback unavailable');
      error.code = 'cloudflare_api_unavailable';
      throw error;
    },
    upload: async () => { uploads += 1; },
  }), (error) => {
    assert.equal(error.code, 'd0046_update_effect_unknown');
    assert.equal(error.details.uploadReturnedTrustedResult, true);
    assert.equal(error.details.uploadCode, null);
    assert.equal(error.details.readbackCode, 'cloudflare_api_unavailable');
    return true;
  });
  assert.equal(uploads, 1);
  assert.equal(reads, 2);
});

test('ambiguous preserving upload remains unknown when authoritative readback does not prove desired state', async () => {
  const { prepared, admission, predecessorWorker, client } = await updateFixture();
  let reads = 0;
  let uploads = 0;
  await assert.rejects(applyPreparedMcpTrialUpdate({
    client,
    prepared,
    admission,
    readWorker: async () => {
      reads += 1;
      return predecessorWorker;
    },
    upload: async () => {
      uploads += 1;
      const error = new Error('response lost after upload');
      error.code = 'cloudflare_api_unavailable';
      throw error;
    },
  }), { code: 'd0046_update_effect_unknown' });
  assert.equal(uploads, 1);
  assert.equal(reads, 2);
});
