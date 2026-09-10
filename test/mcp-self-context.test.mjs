import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { typedDigest } from '../src/canonical.mjs';
import { createRepositoryBaseIdentity } from '../src/lazy-plan-reference.mjs';
import {
  MCP_SELF_CONTEXT_REGISTRY_PREFIX,
  createMcpSelfContextOwner,
  normalizeMcpSelfContextScopeRequest,
} from '../src/mcp-self-context.mjs';

function gitBlobOid(text) {
  const bytes = Buffer.from(text, 'utf8');
  return createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`, 'utf8')).update(bytes).digest('hex');
}

function fixture() {
  const commitOid = 'a'.repeat(40);
  const treeOid = 'b'.repeat(40);
  const files = {
    'README.md': 'not admitted\n',
    'src/a.mjs': 'export const a = 1;\n',
    'src/nested/b.mjs': 'export const b = 2;\n',
    'test/a.test.mjs': "test('a', () => {});\n",
    'DIRECTIVE.md': '# directive\n',
  };
  const entries = Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([path, content]) => ({
    path,
    mode: '100644',
    type: 'blob',
    blobOid: gitBlobOid(content),
    byteLength: Buffer.byteLength(content),
  }));
  const manifestIdentity = {
    schemaVersion: 1,
    profile: 'tdev.repository-context.git-manifest.v1',
    objectFormat: 'sha1',
    commitOid,
    treeOid,
    entries,
  };
  const repositoryBaseIdentity = createRepositoryBaseIdentity({
    objectFormat: 'sha1',
    commitOid,
    treeOid,
    manifestDigest: typedDigest('tdev.repository-context.git-manifest.v1', manifestIdentity),
  });
  const blobs = new Map(entries.map((entry) => [entry.blobOid, Buffer.from(files[entry.path], 'utf8')]));
  const store = new Map();
  const registry = {
    async get(key) { return store.get(key); },
    async put(key, value) { store.set(key, structuredClone(value)); },
  };
  const sourceProvider = {
    async loadManifest() { return structuredClone(entries); },
    async loadBlob(oid) { return blobs.get(oid) ?? null; },
  };
  const repository = {
    commitOid,
    objectFormat: 'sha1',
    repositoryBaseIdentity,
    context: {
      contextCapabilityId: 'context-capability',
      modelCapabilityId: 'model-capability',
      validationCapabilityId: 'validation-capability',
    },
  };
  return { files, entries, blobs, store, registry, sourceProvider, repository };
}

async function rejectsCode(promise, code) {
  await assert.rejects(promise, (error) => error?.code === code);
}

test('self-context owner issues deterministic exact-release references and bounded projections', async () => {
  const f = fixture();
  const owner = createMcpSelfContextOwner(f);
  const first = await owner.issue({ paths: ['src/a.mjs'] });
  const replay = await owner.issue({ paths: ['src/a.mjs'] });
  const second = await owner.issue({ paths: ['test/a.test.mjs'] });
  assert.equal(first.contextReferenceId, replay.contextReferenceId);
  assert.notEqual(first.contextReferenceId, second.contextReferenceId);
  assert.equal([...f.store.keys()].filter((key) => key.startsWith(MCP_SELF_CONTEXT_REGISTRY_PREFIX)).length, 2);
  assert.equal(first.repositoryCommitOid, 'a'.repeat(40));
  assert.deepEqual(first.contextScope.paths, ['src/a.mjs']);

  const resolved = await owner.resolve(first.contextReferenceId);
  assert.deepEqual(Object.keys(resolved.baseTree), ['src/a.mjs']);
  assert.deepEqual(resolved.writePaths, ['src/a.mjs']);
  assert.equal(resolved.repositoryBaseIdentity.commitOid, first.repositoryCommitOid);
  assert.equal(resolved.baseIdentity.baseDigest, resolved.baseDigest);

  const listed = await owner.list({ contextReference: first.contextReferenceId, limit: 5 });
  assert.deepEqual(listed.entries.map((entry) => entry.path), ['src/a.mjs']);
  const read = await owner.read({ contextReference: first.contextReferenceId, path: 'src/a.mjs' });
  assert.equal(read.content, f.files['src/a.mjs']);
  const search = await owner.search({ contextReference: first.contextReferenceId, pattern: 'const a' });
  assert.deepEqual(search.matches, ['src/a.mjs']);
});

test('self-context scope policy rejects malformed, out-of-policy and stale selections', async () => {
  const f = fixture();
  const owner = createMcpSelfContextOwner(f);
  assert.throws(() => normalizeMcpSelfContextScopeRequest({}), (error) => error?.code === 'mcp_self_context_scope_invalid');
  assert.throws(() => normalizeMcpSelfContextScopeRequest({ paths: ['README.md'] }), (error) => error?.code === 'mcp_self_context_scope_denied');
  assert.throws(() => normalizeMcpSelfContextScopeRequest({ prefixes: ['docs'] }), (error) => error?.code === 'mcp_self_context_scope_denied');
  await rejectsCode(owner.issue({ paths: ['src/missing.mjs'] }), 'mcp_self_context_scope_stale');
  await rejectsCode(owner.issue({ prefixes: ['src/missing'] }), 'mcp_self_context_scope_stale');
});

test('self-context registry and exact blob identity fail closed on corruption', async () => {
  const f = fixture();
  const owner = createMcpSelfContextOwner(f);
  const issued = await owner.issue({ paths: ['src/a.mjs'] });
  const key = `${MCP_SELF_CONTEXT_REGISTRY_PREFIX}${issued.contextReferenceId}`;
  const descriptor = f.store.get(key);
  f.store.set(key, { ...descriptor, semanticBaseDigest: `sha256:${'0'.repeat(64)}` });
  const reloaded = createMcpSelfContextOwner(f);
  await rejectsCode(reloaded.resolve(issued.contextReferenceId), 'mcp_self_context_reference_corrupt');

  const clean = fixture();
  const cleanOwner = createMcpSelfContextOwner(clean);
  const entry = clean.entries.find((row) => row.path === 'src/a.mjs');
  clean.blobs.set(entry.blobOid, Buffer.from('same size maybe nope\n', 'utf8'));
  await assert.rejects(cleanOwner.issue({ paths: ['src/a.mjs'] }), (error) =>
    error?.code === 'mcp_self_context_blob_invalid');
});
