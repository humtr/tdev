import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PRIMARY_DIR = 'immutable-journal-publication';
const COMPAT_DIR = 'd0030';
const SOURCE = path.join(ROOT, 'native', PRIMARY_DIR, 'rename_noreplace_helper.c');
const MANIFEST = path.join(ROOT, 'native', PRIMARY_DIR, 'manifest.json');
const COMPAT_SOURCE = path.join(ROOT, 'native', COMPAT_DIR, 'rename_noreplace_helper.c');
const COMPAT_MANIFEST = path.join(ROOT, 'native', COMPAT_DIR, 'manifest.json');
const key = `${process.platform}-${process.arch}`;
const declared = {
  'android-arm64': path.join('native', PRIMARY_DIR, 'android-arm64', 'rename-noreplace-helper'),
  'linux-x64': path.join('native', PRIMARY_DIR, 'linux-x64', 'rename-noreplace-helper'),
};
const compatibilityDeclared = {
  'android-arm64': path.join('native', COMPAT_DIR, 'android-arm64', 'rename-noreplace-helper'),
  'linux-x64': path.join('native', COMPAT_DIR, 'linux-x64', 'rename-noreplace-helper'),
};
const relativePath = declared[key];
if (!relativePath) throw new Error(`immutable-journal publication has no declared packaged helper target for ${key}`);
const output = path.join(ROOT, relativePath);
const compatibilityOutput = path.join(ROOT, compatibilityDeclared[key]);
await mkdir(path.dirname(output), { recursive: true });
await mkdir(path.dirname(compatibilityOutput), { recursive: true });
const cc = process.env.CC || 'cc';
const built = spawnSync(cc, ['-std=c11','-O2','-Wall','-Wextra','-Werror',SOURCE,'-o',output], { cwd: ROOT, encoding: 'utf8', env: process.env });
if (built.status !== 0) throw new Error(`immutable-journal helper build failed (${built.status})\n${built.stdout}\n${built.stderr}`);
await chmod(output, 0o755);
await copyFile(output, compatibilityOutput); await chmod(compatibilityOutput, 0o755); await copyFile(SOURCE, COMPAT_SOURCE);
const digest=(bytes)=>createHash('sha256').update(bytes).digest('hex');
const sourceBytes=await readFile(SOURCE); const binaryBytes=await readFile(output); const compiler=spawnSync(cc,['--version'],{encoding:'utf8',env:process.env});
let existing={schemaVersion:1,protocolVersion:1,helpers:{}};
try { const p=JSON.parse(await readFile(MANIFEST,'utf8')); if(p?.schemaVersion===1&&p?.protocolVersion===1&&p.helpers&&typeof p.helpers==='object') existing=p; } catch {}
const manifest={schemaVersion:1,protocolVersion:1,helpers:{...existing.helpers,[key]:{platform:process.platform,arch:process.arch,relativePath:relativePath.split(path.sep).join('/'),sha256:digest(binaryBytes),sourceSha256:digest(sourceBytes),bytes:binaryBytes.byteLength,compiler:String(compiler.stdout||compiler.stderr||'').split('\n')[0].trim()}}};
await writeFile(MANIFEST,JSON.stringify(manifest,null,2)+'\n');
const compat={...manifest,helpers:Object.fromEntries(Object.entries(manifest.helpers).map(([k,h])=>[k,{...h,relativePath:(compatibilityDeclared[k]??h.relativePath).split(path.sep).join('/')}]))};
await writeFile(COMPAT_MANIFEST,JSON.stringify(compat,null,2)+'\n');
process.stdout.write(JSON.stringify(manifest)+'\n');
