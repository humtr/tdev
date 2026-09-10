import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { buildMcpTrialBaseTreeModule } from '../qualification/mcp-trial-base-tree-builder.mjs';
import { runGitCommand } from '../src/git-projection.mjs';

async function git(repositoryPath, args, input = null) {
  const result = await runGitCommand({ repositoryPath, args, input });
  assert.equal(result.code, 0, result.stderr.toString('utf8'));
  return result.stdout.toString('utf8').trim();
}

async function fixture() {
  const repositoryPath = await mkdtemp(path.join(os.tmpdir(), 'tdev-trial-tree-'));
  await mkdir(path.join(repositoryPath, 'src'), { recursive: true });
  await mkdir(path.join(repositoryPath, 'assets'), { recursive: true });
  await writeFile(path.join(repositoryPath, 'src', 'selected.mjs'), 'export const selected = true;\n');
  await writeFile(path.join(repositoryPath, 'assets', 'native.bin'), Buffer.from([0, 255, 1, 2]));
  await git(repositoryPath, ['init', '-q']);
  await git(repositoryPath, ['config', 'user.name', 'tdev-tree-test']);
  await git(repositoryPath, ['config', 'user.email', 'tdev-tree-test@example.invalid']);
  await git(repositoryPath, ['add', '-A']);
  await git(repositoryPath, ['commit', '-qm', 'tree fixture']);
  return { repositoryPath, commitOid: await git(repositoryPath, ['rev-parse', 'HEAD']) };
}

test('D0048 trial builder binds the complete manifest while hydrating only the owner scope', async () => {
  const { repositoryPath, commitOid } = await fixture();
  try {
    const built = await buildMcpTrialBaseTreeModule({
      repositoryPath,
      commitOid,
      scope: { paths: ['src/selected.mjs'], maxFiles: 2, maxBytes: 1024, maxSearchResults: 4 },
    });
    assert.equal(built.fileCount, 1);
    assert.deepEqual(Object.keys(built.tree), ['src/selected.mjs']);
    assert.equal(built.selectedEntries.length, 1);
    assert.equal(built.manifest.length, 2);
    assert.equal(built.manifest.find((entry) => entry.path === 'assets/native.bin').byteLength, 4);
    assert.equal(built.repositoryBaseIdentity.manifestDigest, built.manifestDigest);
    assert.match(built.source, /MCP_TRIAL_SELECTED_TREE = Object\.freeze/);
    assert.doesNotMatch(built.source, /MCP_TRIAL_SELECTED_GZIP_BASE64/);
    assert.match(built.source, /MCP_TRIAL_MANIFEST_GZIP_BASE64/);
    assert.equal(built.selfContextBlobCount, 1);
    assert.equal(built.selfContextPathCount, 1);
    const generated = await import(`data:text/javascript;base64,${Buffer.from(built.source, 'utf8').toString('base64')}`);
    const manifest = await generated.loadMcpTrialManifest();
    const selectedEntry = manifest.find((entry) => entry.path === 'src/selected.mjs');
    assert.ok(selectedEntry);
    const blob = await generated.loadMcpTrialSelfContextBlob(selectedEntry.blobOid);
    assert.equal(Buffer.from(blob).toString('utf8'), 'export const selected = true;\n');
    assert.equal(await generated.loadMcpTrialSelfContextBlob('0'.repeat(40)), null);
  } finally {
    await rm(repositoryPath, { recursive: true, force: true });
  }
});

test('D0048 trial builder rejects exclusions and selected non-text blobs', async () => {
  const { repositoryPath, commitOid } = await fixture();
  try {
    await assert.rejects(
      () => buildMcpTrialBaseTreeModule({ repositoryPath, commitOid, scope: { paths: ['src/selected.mjs'] }, excludedPaths: [] }),
      (error) => error?.code === 'mcp_base_tree_exclusion_forbidden',
    );
    await assert.rejects(
      () => buildMcpTrialBaseTreeModule({ repositoryPath, commitOid, scope: { paths: ['assets/native.bin'] } }),
      (error) => error?.code === 'mcp_base_tree_non_utf8',
    );
  } finally {
    await rm(repositoryPath, { recursive: true, force: true });
  }
});
