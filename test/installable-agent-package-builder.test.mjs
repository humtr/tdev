import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, ...options });
  assert.equal(result.error, undefined, result.error?.message);
  return result;
}

test('installable Agent builder materializes a statically importable control closure', async (t) => {
  const revisionResult = run('git', ['rev-parse', 'HEAD']);
  assert.equal(revisionResult.status, 0, revisionResult.stderr);
  const sourceRevision = revisionResult.stdout.trim();
  assert.match(sourceRevision, /^[0-9a-f]{40}$/u);

  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'tdev-agent-builder-test-'));
  t.after(() => rm(outputDirectory, { recursive: true, force: true }));
  const builder = path.join(root, 'tools', 'build-installable-agent-package.mjs');
  const built = run(process.execPath, [builder, '--source-revision', sourceRevision, '--output-directory', outputDirectory]);
  assert.equal(built.status, 0, built.stderr);

  const manifest = JSON.parse(await readFile(path.join(outputDirectory, 'release-manifest.json'), 'utf8'));
  assert.equal(manifest.sourceRevision, sourceRevision);
  assert.equal(manifest.files['src/lazy-plan-reference.mjs']?.role, 'development-runtime');
  assert.equal(manifest.files['src/installable-agent-control.mjs']?.role, 'agent-control');
});
