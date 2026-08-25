import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function exactHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const sourceRevision = result.stdout.trim();
  assert.match(sourceRevision, /^[0-9a-f]{40}$/);
  return sourceRevision;
}

function build(sourceRevision, outputDirectory) {
  const result = spawnSync(process.execPath, [
    'tools/build-installable-agent-package.mjs',
    '--source-revision', sourceRevision,
    '--output-directory', outputDirectory,
  ], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test('installable-agent package builder is byte deterministic for one exact source revision', async (t) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'tdev-package-determinism-'));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const sourceRevision = exactHead();
  const first = path.join(temporaryRoot, 'first');
  const second = path.join(temporaryRoot, 'second');

  build(sourceRevision, first);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  build(sourceRevision, second);

  const firstArtifact = JSON.parse(await readFile(path.join(first, 'artifact.json'), 'utf8'));
  const secondArtifact = JSON.parse(await readFile(path.join(second, 'artifact.json'), 'utf8'));
  assert.deepEqual(secondArtifact, firstArtifact);
  assert.deepEqual(
    await readFile(path.join(second, 'release-manifest.json')),
    await readFile(path.join(first, 'release-manifest.json')),
  );
  assert.deepEqual(
    await readFile(path.join(second, secondArtifact.archive.file)),
    await readFile(path.join(first, firstArtifact.archive.file)),
  );
});
