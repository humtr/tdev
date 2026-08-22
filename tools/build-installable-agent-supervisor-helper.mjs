#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const nativeRoot = path.join(root, 'native', 'installable-agent-supervisor');
const sourceRelativePath = 'native/installable-agent-supervisor/pidfd_control.c';
const sourcePath = path.join(root, sourceRelativePath);
const targetKey = `${process.platform}-${process.arch}`;
const outputRelativePath = `native/installable-agent-supervisor/${targetKey}/pidfd-control.node`;
const outputPath = path.join(root, outputRelativePath);
const tmpPath = `${outputPath}.tmp-${process.pid}`;
const manifestPath = path.join(nativeRoot, 'manifest.json');
const compiler = process.env.CC || 'cc';
const prefix = path.dirname(path.dirname(process.execPath));
const nodeInclude = path.join(prefix, 'include', 'node');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

await mkdir(path.dirname(outputPath), { recursive: true });
await rm(tmpPath, { force: true });
const result = spawnSync(compiler, [
  '-shared',
  '-fPIC',
  '-O2',
  '-Wall',
  '-Wextra',
  '-Werror',
  '-I', nodeInclude,
  sourcePath,
  '-o', tmpPath,
], { cwd: root, encoding: 'utf8' });
if (result.error || result.status !== 0) {
  process.stderr.write(result.stderr ?? '');
  throw result.error ?? new Error(`pidfd helper build failed with status ${result.status}`);
}
await chmod(tmpPath, 0o755);
await rename(tmpPath, outputPath);
const sourceBytes = await readFile(sourcePath);
const outputBytes = await readFile(outputPath);
let prior = null;
try { prior = JSON.parse(await readFile(manifestPath, 'utf8')); } catch {}
const helpers = prior?.schemaVersion === 1 && prior?.abiVersion === 1 && prior?.profile === 'tdev.agent.termux.pidfd.v1' && prior.helpers && typeof prior.helpers === 'object'
  ? { ...prior.helpers }
  : {};
helpers[targetKey] = {
  platform: process.platform,
  arch: process.arch,
  relativePath: outputRelativePath,
  sha256: sha256(outputBytes),
};
const manifest = {
  schemaVersion: 1,
  abiVersion: 1,
  profile: 'tdev.agent.termux.pidfd.v1',
  sourceRelativePath,
  sourceSha256: sha256(sourceBytes),
  helpers,
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
process.stdout.write(`${targetKey} ${helpers[targetKey].sha256}\n`);
