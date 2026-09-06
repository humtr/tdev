import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  CaseEngine,
  ContractError,
  GitRepositoryModelExecutor,
  createRepositoryBaseIdentity,
  defineDevelopmentUnitPlan,
  digest,
} from '../src/index.mjs';
import { runGitCommand } from '../src/git-projection.mjs';

function git(repositoryPath, args) {
  const result = spawnSync('git', ['-C', repositoryPath, ...args], {
    input: null,
    encoding: null,
    env: process.env,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr.toString('utf8')}`);
  return result.stdout.toString('utf8').trim();
}

function repositoryFixture(t, files) {
  const repositoryPath = mkdtempSync(path.join(tmpdir(), 'tdev-lazy-reference-'));
  t.after(() => rmSync(repositoryPath, { recursive: true, force: true }));
  git(repositoryPath, ['init', '-q']);
  git(repositoryPath, ['config', 'user.name', 'tdev-test']);
  git(repositoryPath, ['config', 'user.email', 'tdev-test@example.invalid']);
  for (const [filePath, content] of Object.entries(files)) {
    const target = path.join(repositoryPath, ...filePath.split('/'));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
    if (filePath.endsWith('.sh')) chmodSync(target, 0o755);
  }
  git(repositoryPath, ['add', '-A']);
  git(repositoryPath, ['commit', '-qm', 'lazy reference fixture']);
  return {
    repositoryPath,
    commitOid: git(repositoryPath, ['rev-parse', 'HEAD']),
  };
}

test('scoped materialization keeps binary entries in the complete manifest without hydrating them', async (t) => {
  const fixture = repositoryFixture(t, {
    'selected.mjs': 'export const value = 1;\n',
    'native.bin': Buffer.from([0xff, 0x00, 0xfe, 0x01]),
    'run.sh': '#!/bin/sh\nexit 0\n',
  });
  const calls = [];
  const adapter = new GitRepositoryModelExecutor({
    repositoryPath: fixture.repositoryPath,
    modelExecutable: process.execPath,
    gitRunner: async (input) => {
      calls.push([...input.args]);
      return runGitCommand(input);
    },
    timeoutMs: 5_000,
  });
  const scope = { paths: ['selected.mjs'], maxFiles: 2, maxBytes: 4 * 1024, maxSearchResults: 2 };
  const probe = await adapter.prepareLazyContext(fixture.commitOid, digest({ profile: 'probe' }), { scope });
  assert.equal(probe.descriptor.manifestEntryCount, 3);
  assert.deepEqual(adapter.listLazyManifest(probe, { limit: 8 }).entries.map((entry) => entry.path), [
    'native.bin',
    'run.sh',
    'selected.mjs',
  ]);
  assert.equal(calls.some((args) => args[0] === 'cat-file' && args[1] === '--batch'), false);

  const scoped = await adapter.materializeScopedContext(fixture.commitOid, digest({ profile: 'probe' }), {
    scope,
    repositoryBaseIdentity: probe.descriptor.repositoryBaseIdentity,
  });
  assert.deepEqual(scoped.files.map((entry) => entry.path), ['selected.mjs']);
  assert.equal(scoped.files[0].content, 'export const value = 1;\n');
  assert.equal(scoped.manifest.find((entry) => entry.path === 'native.bin').byteLength, 4);
  assert.equal(scoped.descriptor.repositoryBaseIdentity.manifestDigest, probe.descriptor.repositoryBaseIdentity.manifestDigest);
  assert.equal(scoped.descriptor.repositoryBaseIdentity.baseDigest, probe.descriptor.repositoryBaseIdentity.baseDigest);
  assert.equal(scoped.descriptor.baseDigest, digest({ 'selected.mjs': 'export const value = 1;\n' }));
});

test('scoped materialization rejects an unsupported entry when the owner selects it', async (t) => {
  const fixture = repositoryFixture(t, {
    'selected.mjs': 'export const value = 1;\n',
    'native.bin': Buffer.from([0xff, 0x00, 0xfe, 0x01]),
  });
  const adapter = new GitRepositoryModelExecutor({
    repositoryPath: fixture.repositoryPath,
    modelExecutable: process.execPath,
    timeoutMs: 5_000,
  });
  const scope = { paths: ['native.bin'], maxFiles: 1, maxBytes: 4 * 1024, maxSearchResults: 1 };
  const probe = await adapter.prepareLazyContext(fixture.commitOid, digest({ profile: 'probe' }), { scope });
  await assert.rejects(
    adapter.materializeScopedContext(fixture.commitOid, digest({ profile: 'probe' }), {
      scope,
      repositoryBaseIdentity: probe.descriptor.repositoryBaseIdentity,
    }),
    (error) => error instanceof ContractError && error.code === 'lazy_read_range_not_utf8',
  );
});

function scopedPlanInput() {
  const repositoryCommitOid = 'a'.repeat(40);
  const treeOid = 'b'.repeat(40);
  const baseTree = { 'src/selected.mjs': 'export const value = 1;\n' };
  const semanticBaseDigest = digest(baseTree);
  const manifestDigest = digest({
    entries: [
      { path: 'native.bin', mode: '100644', type: 'blob', byteLength: 4 },
      { path: 'src/selected.mjs', mode: '100644', type: 'blob', byteLength: 25 },
    ],
  });
  const repositoryBaseIdentity = createRepositoryBaseIdentity({
    objectFormat: 'sha1',
    commitOid: repositoryCommitOid,
    treeOid,
    manifestDigest,
  });
  const baseIdentity = {
    schemaVersion: 1,
    profile: 'tdev.repository-base-identity.v1',
    objectFormat: 'sha1',
    commitOid: repositoryCommitOid,
    treeOid,
    baseDigest: semanticBaseDigest,
    manifestDigest,
  };
  const contextScope = { paths: ['src/selected.mjs'], maxFiles: 2, maxBytes: 4 * 1024, maxSearchResults: 2 };
  return { repositoryCommitOid, treeOid, baseTree, semanticBaseDigest, manifestDigest, repositoryBaseIdentity, baseIdentity, contextScope };
}

test('owner-issued scoped Plan reference survives Case snapshot restore', () => {
  const input = scopedPlanInput();
  const plan = defineDevelopmentUnitPlan({
    revisionId: 'lazy-reference-plan',
    baseTree: input.baseTree,
    repositoryCommitOid: input.repositoryCommitOid,
    objectFormat: 'sha1',
    contextProfile: 'tdev.repository.context.prepare.lazy.v1',
    contextScope: input.contextScope,
    baseIdentity: input.baseIdentity,
    repositoryBaseIdentity: input.repositoryBaseIdentity,
    instruction: 'change the selected source file',
  });
  assert.equal(plan.baseReference.profile, 'tdev.plan.lazy-scoped-reference.v1');
  assert.equal(plan.baseReference.repositoryBaseIdentity.baseDigest, input.repositoryBaseIdentity.baseDigest);
  assert.equal(plan.baseReference.semanticBaseDigest, input.semanticBaseDigest);
  assert.deepEqual(plan.tasksById.context.input.repositoryBaseIdentity, input.repositoryBaseIdentity);
  assert.deepEqual(plan.tasksById.model.input.repositoryBaseIdentity, input.repositoryBaseIdentity);
  const engine = new CaseEngine({ caseId: 'lazy-reference-case', plan });
  const restored = CaseEngine.restore(engine.snapshot(), { reopen: false });
  assert.deepEqual(restored.plan.baseReference, plan.baseReference);
  assert.equal(restored.plan.planDigest, plan.planDigest);
});

test('scoped Plan rejects a full identity that does not bind the exact commit', () => {
  const input = scopedPlanInput();
  const mismatched = { ...input.repositoryBaseIdentity, commitOid: 'c'.repeat(40) };
  assert.throws(
    () => defineDevelopmentUnitPlan({
      revisionId: 'lazy-reference-mismatch',
      baseTree: input.baseTree,
      repositoryCommitOid: input.repositoryCommitOid,
      objectFormat: 'sha1',
      contextProfile: 'tdev.repository.context.prepare.lazy.v1',
      contextScope: input.contextScope,
      baseIdentity: input.baseIdentity,
      repositoryBaseIdentity: mismatched,
      instruction: 'change the selected source file',
    }),
    (error) => error instanceof ContractError && error.code === 'lazy_reference_identity_mismatch',
  );
});
