import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SOURCE = path.join(ROOT, 'native', 'd0030', 'rename_noreplace_helper.c');
const MANIFEST = path.join(ROOT, 'native', 'd0030', 'manifest.json');
const key = `${process.platform}-${process.arch}`;
const declared = {
  'android-arm64': path.join('native', 'd0030', 'android-arm64', 'rename-noreplace-helper'),
  'linux-x64': path.join('native', 'd0030', 'linux-x64', 'rename-noreplace-helper'),
};
const relativePath = declared[key];
if (!relativePath) {
  throw new Error(`D0030 has no declared packaged helper target for ${key}`);
}
const output = path.join(ROOT, relativePath);
await mkdir(path.dirname(output), { recursive: true });
const cc = process.env.CC || 'cc';
const args = ['-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', SOURCE, '-o', output];
const built = spawnSync(cc, args, { cwd: ROOT, encoding: 'utf8', env: process.env });
if (built.status !== 0) {
  throw new Error(`D0030 helper build failed (${built.status})\n${built.stdout}\n${built.stderr}`);
}
await chmod(output, 0o755);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sourceBytes = await readFile(SOURCE);
const binaryBytes = await readFile(output);
const compiler = spawnSync(cc, ['--version'], { encoding: 'utf8', env: process.env });
let existing = { schemaVersion: 1, protocolVersion: 1, helpers: {} };
try {
  const parsed = JSON.parse(await readFile(MANIFEST, 'utf8'));
  if (parsed?.schemaVersion === 1 && parsed?.protocolVersion === 1 && parsed.helpers && typeof parsed.helpers === 'object') existing = parsed;
} catch {}
const manifest = {
  schemaVersion: 1,
  protocolVersion: 1,
  helpers: {
    ...existing.helpers,
    [key]: {
      platform: process.platform,
      arch: process.arch,
      relativePath: relativePath.split(path.sep).join('/'),
      sha256: digest(binaryBytes),
      sourceSha256: digest(sourceBytes),
      bytes: binaryBytes.byteLength,
      compiler: String(compiler.stdout || compiler.stderr || '').split('\n')[0].trim(),
    },
  },
};
await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(manifest)}\n`);
