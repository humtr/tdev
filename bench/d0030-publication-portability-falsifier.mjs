import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  access, cp, lstat, mkdir, mkdtemp, open, readFile, rm, symlink, writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const SELF = fileURLToPath(import.meta.url);
const BENCH_DIR = path.dirname(SELF);
const ROOT = path.dirname(BENCH_DIR);
const NATIVE = path.join(BENCH_DIR, 'd0030-native');
const HELPER_C = path.join(NATIVE, 'rename_noreplace_helper.c');
const ADDON_C = path.join(NATIVE, 'rename_noreplace_addon.c');
const STATUS = ['success', 'conflict', 'unsupported', 'denied', 'error', 'invalid'];

async function exists(p) { try { await access(p); return true; } catch { return false; } }
async function sha256(p) { return createHash('sha256').update(await readFile(p)).digest('hex'); }
async function syncDir(dir) { const h = await open(dir, 'r'); try { await h.sync(); } finally { await h.close(); } }
async function contender(dir, name, bytes) {
  const h = await open(path.join(dir, name), 'wx', 0o600);
  try { await h.writeFile(bytes); await h.sync(); return await h.stat(); } finally { await h.close(); }
}
async function nodeInclude() {
  const candidates = [
    process.env.PREFIX ? path.join(process.env.PREFIX, 'include', 'node') : null,
    path.join(path.dirname(path.dirname(process.execPath)), 'include', 'node'),
    '/usr/include/node', '/usr/local/include/node',
  ].filter(Boolean);
  for (const item of candidates) if (await exists(path.join(item, 'node_api.h'))) return item;
  throw new Error(`node_api.h missing: ${candidates.join(', ')}`);
}
function compile(cc, args) {
  const r = spawnSync(cc, args, { encoding: 'utf8', env: process.env });
  if (r.status !== 0) throw new Error(`compile failed: ${cc} ${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
  return { cc, args, stderr: r.stderr.trim() };
}
async function buildNative() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tdev-d0030-native-'));
  const helper = path.join(dir, 'rename-noreplace-helper');
  const addon = path.join(dir, 'rename-noreplace-addon.node');
  const cc = process.env.CC || 'cc';
  const include = await nodeInclude();
  const helperBuild = compile(cc, ['-std=c11','-O2','-Wall','-Wextra','-Werror',HELPER_C,'-o',helper]);
  const addonBuild = compile(cc, ['-std=c11','-O2','-Wall','-Wextra','-Werror','-shared','-fPIC',`-I${include}`,ADDON_C,'-o',addon]);
  return {
    dir, helper, addon, include, helperBuild, addonBuild,
    identities: {
      runnerSourceSha256: await sha256(SELF), helperSourceSha256: await sha256(HELPER_C), addonSourceSha256: await sha256(ADDON_C),
      helperBinarySha256: await sha256(helper), addonBinarySha256: await sha256(addon),
      helperBytes: (await lstat(helper)).size, addonBytes: (await lstat(addon)).size,
    },
  };
}

class ByteQueue {
  constructor(stream) {
    this.bytes = []; this.waiters = [];
    stream.on('data', (chunk) => { for (const b of chunk) { const w = this.waiters.shift(); if (w) w.resolve(b); else this.bytes.push(b); } });
    const close = (error) => { while (this.waiters.length) this.waiters.shift().reject(error); };
    stream.on('end', () => close(new Error('phase end'))); stream.on('close', () => close(new Error('phase close'))); stream.on('error', close);
  }
  async next() { if (this.bytes.length) return this.bytes.shift(); return new Promise((resolve, reject) => this.waiters.push({ resolve, reject })); }
}
function parseProtocol(buffer) {
  let offset = 0; let began = false;
  if (buffer[offset] === 0x42) { began = true; offset += 1; }
  let result = null;
  if (buffer.length >= offset + 6 && buffer[offset] === 0x52) {
    const code = buffer[offset + 1]; result = { status: STATUS[code] ?? 'unknown', statusCode: code, errno: buffer.readUInt32LE(offset + 2) };
  }
  return { began, result, bytesHex: buffer.toString('hex') };
}
async function startHelper(helper, dir, src, dst, debug = false) {
  const dh = await open(dir, 'r');
  const stdio = debug ? ['ignore','pipe','pipe',dh.fd,'pipe','pipe','pipe'] : ['ignore','pipe','pipe',dh.fd,'pipe'];
  const child = spawn(helper, [src, dst], { stdio, env: {} });
  const chunks = []; let stdout = ''; let stderr = ''; let spawnError = null;
  child.stdout?.setEncoding('utf8'); child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', (c) => { stdout += c; }); child.stderr?.on('data', (c) => { stderr += c; });
  child.stdio[4].on('data', (c) => chunks.push(Buffer.from(c)));
  const protocolDone = new Promise((resolve) => { child.stdio[4].once('end', resolve); child.stdio[4].once('close', resolve); });
  const close = new Promise((resolve) => { child.once('error', (e) => { spawnError = e; }); child.once('close', (code, signal) => resolve({ code, signal })); });
  return { child, dh, chunks, protocolStream: child.stdio[4], protocolDone, gate: debug ? child.stdio[5] : null, phases: debug ? new ByteQueue(child.stdio[6]) : null, close, stdout: () => stdout, stderr: () => stderr, spawnError: () => spawnError };
}
async function finishHelper(s) {
  const closed = await s.close; await s.protocolDone.catch(() => {}); await s.dh.close().catch(() => {});
  const protocol = parseProtocol(Buffer.concat(s.chunks));
  return { ...closed, protocol, stdout: s.stdout(), stderr: s.stderr(), spawnError: s.spawnError() ? { code: s.spawnError().code ?? null, message: s.spawnError().message } : null };
}
function semantic(o) { if (o.protocol.result) return o.protocol.result.status; if (o.protocol.began) return 'ambiguous'; if (o.spawnError?.code === 'ENOENT') return 'unsupported'; return 'prepublication_failure'; }
async function helperCall(helper, dir, src, dst) { const s = await startHelper(helper, dir, src, dst); const o = await finishHelper(s); return { ...o, semantic: semantic(o) }; }
async function reconcile(dir, dst, expected) {
  let st; try { st = await lstat(path.join(dir, dst)); } catch (e) { if (e?.code === 'ENOENT') return { state: 'predecessor', type: 'absent' }; throw e; }
  if (!st.isFile()) return { state: 'invalid_third_state', type: st.isSymbolicLink() ? 'symlink' : st.isDirectory() ? 'directory' : 'nonregular' };
  const bytes = await readFile(path.join(dir, dst));
  return bytes.equals(expected) ? { state: 'complete_successor', type: 'regular', bytes: bytes.length } : { state: 'invalid_third_state', type: 'wrong_bytes', bytes: bytes.length };
}

async function helperBasic(helper, caseRoot) {
  const dir = await mkdtemp(path.join(caseRoot, '.d0030-helper-basic-'));
  try {
    const src = `.src-${randomUUID()}`, dst = `.dst-${randomUUID()}`, loser = `.loser-${randomUUID()}`;
    const st = await contender(dir, src, Buffer.from('winner'));
    const ok = await helperCall(helper, dir, src, dst); assert.equal(ok.semantic, 'success');
    const final = await lstat(path.join(dir, dst)); assert.equal(final.dev, st.dev); assert.equal(final.ino, st.ino);
    await contender(dir, loser, Buffer.from('loser')); const conflict = await helperCall(helper, dir, loser, dst); assert.equal(conflict.semantic, 'conflict');
    return { typedSuccess: ok.protocol.result, typedConflict: conflict.protocol.result, sameDeviceInode: true, inheritedCaseDirectoryFd: 3, dedicatedSemanticResultFd: 4, shellUsed: false, childEnvironmentKeys: [] };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

async function capabilityProbe(helper, caseRoot) {
  const dir = path.join(caseRoot, `.d0030-capability-${process.pid}-${randomUUID()}`); await mkdir(dir);
  const src = `.d0030-${randomUUID()}.tmp`, dst = `.d0030-${randomUUID()}.final`, loser = `.d0030-${randomUUID()}.tmp`;
  const bytes = Buffer.from('d0030-capability-probe-v1\n');
  try {
    const sourceStat = await contender(dir, src, bytes);
    const first = await helperCall(helper, dir, src, dst); assert.equal(first.semantic, 'success');
    const finalStat = await lstat(path.join(dir, dst)); assert.equal(finalStat.isFile(), true); assert.equal((await readFile(path.join(dir, dst))).equals(bytes), true);
    assert.equal(await exists(path.join(dir, src)), false); assert.equal(sourceStat.dev, finalStat.dev); assert.equal(sourceStat.ino, finalStat.ino);
    await contender(dir, loser, bytes); const second = await helperCall(helper, dir, loser, dst); assert.equal(second.semantic, 'conflict');
    assert.equal((await readFile(path.join(dir, dst))).equals(bytes), true); assert.equal(await exists(path.join(dir, loser)), true);
    await syncDir(dir); await rm(path.join(dir, loser)); await rm(path.join(dir, dst)); await syncDir(dir);
    return {
      qualified: true,
      exclusiveTempCreate: true, fixedCompleteWrite: bytes.length, fileFsync: true,
      absentRenameNoReplace: first.protocol.result, finalRegular: true, finalBytesVerified: true,
      sourceDisappeared: true, sameDeviceInode: true, secondContender: true,
      existingDestinationConflict: second.protocol.result, winnerUnchanged: true, loserRemains: true,
      caseDirectoryFsync: true, cleanupDirectoryFsync: true,
    };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

async function adversarial(helper, caseRoot) {
  const dir = await mkdtemp(path.join(caseRoot, '.d0030-adversarial-')); const rows = {};
  try {
    for (const kind of ['file','symlink','directory']) {
      const src = `.src-${kind}-${randomUUID()}`, dst = `.dst-${kind}-${randomUUID()}`; await contender(dir, src, Buffer.from(`contender-${kind}`));
      if (kind === 'file') await writeFile(path.join(dir, dst), 'winner');
      else if (kind === 'symlink') { const target = `.target-${randomUUID()}`; await writeFile(path.join(dir, target), 'target'); await symlink(target, path.join(dir, dst)); }
      else await mkdir(path.join(dir, dst));
      const before = await lstat(path.join(dir, dst)); const outcome = await helperCall(helper, dir, src, dst); const after = await lstat(path.join(dir, dst));
      assert.equal(outcome.semantic, 'conflict'); assert.equal(before.dev, after.dev); assert.equal(before.ino, after.ino); assert.equal(await exists(path.join(dir, src)), true);
      rows[kind] = { conflict: true, errno: outcome.protocol.result.errno, destinationIdentityPreserved: true, contenderRemains: true };
    }
    const invalid = [];
    for (const name of ['', '.', '..', 'a/b', '/absolute']) { const outcome = await helperCall(helper, dir, name, `.final-${randomUUID()}`); assert.equal(outcome.semantic, 'invalid'); invalid.push(name); }
    rows.basenameConfinement = { rejected: invalid };
    return rows;
  } finally { await rm(dir, { recursive: true, force: true }); }
}

async function faultCase(root, suffix) {
  const dir = await mkdtemp(path.join(root, `.d0030-fault-${suffix}-`)); const src = `.src-${randomUUID()}`, dst = `.dst-${randomUUID()}`, bytes = Buffer.from(`d0030-${suffix}-complete\n`); await contender(dir, src, bytes); return { dir, src, dst, bytes };
}
async function ambiguitySuite(helper, root) {
  const rows = {};
  {
    const i = await faultCase(root, 'before'); const s = await startHelper(helper, i.dir, i.src, i.dst, true); assert.equal(String.fromCharCode(await s.phases.next()), 'P'); s.child.kill('SIGKILL'); const o = await finishHelper(s);
    rows.beforeSyscall = { faultPoint: 'before_syscall', began: o.protocol.began, publicationMayHaveHappened: false, classification: 'no_successor_failure', reread: await reconcile(i.dir, i.dst, i.bytes), directoryFsyncCompleted: false, blindRetry: false }; assert.equal(rows.beforeSyscall.reread.state, 'predecessor'); await rm(i.dir, { recursive: true, force: true });
  }
  async function afterCase(label, action) {
    const i = await faultCase(root, label); const s = await startHelper(helper, i.dir, i.src, i.dst, true); assert.equal(String.fromCharCode(await s.phases.next()), 'P'); s.gate.write('G'); assert.equal(String.fromCharCode(await s.phases.next()), 'A');
    await action(s); const o = await finishHelper(s); const reread = await reconcile(i.dir, i.dst, i.bytes); assert.equal(o.protocol.began, true); assert.equal(reread.state, 'complete_successor');
    const row = { faultPoint: 'after_syscall_before_typed_result', began: true, publicationMayHaveHappened: true, classification: 'store_commit_ambiguous', nativeExit: { code: o.code, signal: o.signal }, reread, directoryFsyncCompleted: false, blindRetry: false, helperInvocations: 1 };
    await rm(i.dir, { recursive: true, force: true }); return row;
  }
  rows.helperKilled = await afterCase('killed', async (s) => s.child.kill('SIGKILL'));
  rows.helperTimeout = await afterCase('timeout', async (s) => { await delay(20); s.child.kill('SIGKILL'); });
  rows.helperAbnormalExit = await afterCase('abnormal', async (s) => s.gate.write('X'));
  rows.resultStatusLoss = await afterCase('status-loss', async (s) => { s.protocolStream.destroy(); s.gate.write('G'); });
  {
    const i = await faultCase(root, 'dir-sync'); const o = await helperCall(helper, i.dir, i.src, i.dst); assert.equal(o.semantic, 'success'); const reread = await reconcile(i.dir, i.dst, i.bytes); assert.equal(reread.state, 'complete_successor');
    rows.directorySyncFailure = { faultPoint: 'after_success_before_directory_fsync_completion', publicationMayHaveHappened: true, classification: 'store_commit_ambiguous', reread, directoryFsyncCompleted: false, blindRetry: false, helperInvocations: 1 }; await rm(i.dir, { recursive: true, force: true });
  }
  {
    const dir = await mkdtemp(path.join(root, '.d0030-reconcile-')); const expected = Buffer.from('expected'); const dst = `.dst-${randomUUID()}`;
    const predecessor = await reconcile(dir, dst, expected); await writeFile(path.join(dir, dst), expected); const successor = await reconcile(dir, dst, expected); await writeFile(path.join(dir, dst), 'third'); const invalid = await reconcile(dir, dst, expected);
    assert.equal(predecessor.state, 'predecessor'); assert.equal(successor.state, 'complete_successor'); assert.equal(invalid.state, 'invalid_third_state'); rows.reconciliation = { predecessor, successor, invalid, blindRetry: false }; await rm(dir, { recursive: true, force: true });
  }
  return rows;
}

async function addonComparison(addonPath, root) {
  const addon = require(addonPath); const dir = await mkdtemp(path.join(root, '.d0030-addon-'));
  try {
    const h = await open(dir, 'r'); const src = `.src-${randomUUID()}`, dst = `.dst-${randomUUID()}`, loser = `.loser-${randomUUID()}`;
    await contender(dir, src, Buffer.from('addon')); const ok = addon.renameNoReplace(h.fd, src, dst); assert.equal(ok.status, 'success');
    await contender(dir, loser, Buffer.from('loser')); const conflict = addon.renameNoReplace(h.fd, loser, dst); assert.equal(conflict.status, 'conflict'); const invalid = addon.renameNoReplace(h.fd, 'a/b', dst); assert.equal(invalid.status, 'invalid'); await h.close();
    const abortSrc = `.abort-${randomUUID()}`, abortDst = `.abort-final-${randomUUID()}`; await contender(dir, abortSrc, Buffer.from('abort-published'));
    const child = spawn(process.execPath, [SELF, '--addon-abort-worker', addonPath, dir, abortSrc, abortDst], { stdio: ['ignore','pipe','pipe'], env: process.env });
    const closed = await new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal }))); assert.equal(closed.signal, 'SIGABRT'); assert.equal(await exists(path.join(dir, abortDst)), true);
    return { typedSuccess: ok, typedConflict: conflict, invalid, abnormalTermination: { ...closed, publicationObserved: true, blastRadius: 'host_node_process' }, deadline: 'no isolated in-process kill/deadline boundary in comparator' };
  } finally { await rm(dir, { recursive: true, force: true }); }
}
async function addonAbortWorker([addonPath, dir, src, dst]) { const addon = require(addonPath); const h = await open(dir, 'r'); addon.renameNoReplaceThenAbort(h.fd, src, dst); }
if (process.argv[2] === '--addon-abort-worker') { await addonAbortWorker(process.argv.slice(3)); process.exit(0); }

async function removal(helper, root) {
  const dir = await mkdtemp(path.join(root, '.d0030-removal-'));
  try {
    const src = `.src-${randomUUID()}`, dst = `.dst-${randomUUID()}`; await contender(dir, src, Buffer.from('x'));
    const missing = await helperCall(`${helper}.missing`, dir, src, dst); assert.equal(missing.semantic, 'unsupported'); assert.equal(await exists(path.join(dir, dst)), false);
    return { missingHelper: { classification: 'unsupported_fail_closed', spawnError: missing.spawnError, publicationObserved: false, fallbackObserved: false } };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

function wrapper(helper) {
  return `import { spawn } from 'node:child_process';\nimport { open } from 'node:fs/promises';\nimport path from 'node:path';\nconst HELPER=${JSON.stringify(helper)}; const STATUS=['success','conflict','unsupported','denied','error','invalid'];\nfunction parse(b){let o=0, began=false;if(b[o]===0x42){began=true;o++;}if(b.length<o+6||b[o]!==0x52)return{began,result:null};return{began,result:{status:STATUS[b[o+1]]??'unknown',errno:b.readUInt32LE(o+2)}};}\nexport async function d0030PrototypeNoReplaceRename(tempPath,finalPath){if(path.dirname(tempPath)!==path.dirname(finalPath))throw new Error('same directory required');const h=await open(path.dirname(tempPath),'r');const chunks=[];let spawnError=null;const child=spawn(HELPER,[path.basename(tempPath),path.basename(finalPath)],{stdio:['ignore','ignore','ignore',h.fd,'pipe'],env:{}});child.stdio[4].on('data',c=>chunks.push(Buffer.from(c)));const close=await new Promise(resolve=>{child.once('error',e=>{spawnError=e;});child.once('close',(code,signal)=>resolve({code,signal}));});await h.close().catch(()=>{});const p=parse(Buffer.concat(chunks));if(p.result?.status==='success')return;if(p.result?.status==='conflict'){const e=new Error('destination exists');e.code='EEXIST';e.errno=p.result.errno;throw e;}if(p.began&&!p.result){const e=new Error('native result lost after possible publication');e.code='D0030_AMBIGUOUS';e.details=close;throw e;}const e=new Error('rename-noreplace prototype failed');e.code=p.result?.status==='unsupported'||p.result?.status==='denied'||spawnError?.code==='ENOENT'?'D0030_UNSUPPORTED':'D0030_NATIVE_FAILED';e.errno=p.result?.errno??null;throw e;}\n`;
}
async function repositoryOracle(helper) {
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'tdev-d0030-oracle-'));
  try {
    await cp(path.join(ROOT, 'src'), path.join(scratch, 'src'), { recursive: true }); await cp(path.join(ROOT, 'test'), path.join(scratch, 'test'), { recursive: true }); await cp(path.join(ROOT, 'package.json'), path.join(scratch, 'package.json'));
    const storePath = path.join(scratch, 'src', 'store.mjs'); let source = await readFile(storePath, 'utf8'); const needle = '        await link(tempPath, finalPath);'; const count = source.split(needle).length - 1; assert.equal(count, 1);
    source = source.replace("import path from 'node:path';", "import path from 'node:path';\nimport { d0030PrototypeNoReplaceRename } from './d0030-prototype-publication.mjs';").replace(needle, '        await d0030PrototypeNoReplaceRename(tempPath, finalPath);');
    await writeFile(storePath, source); await writeFile(path.join(scratch, 'src', 'd0030-prototype-publication.mjs'), wrapper(helper));
    const r = spawnSync(process.execPath, ['--test','test/immutable-journal.test.mjs'], { cwd: scratch, encoding: 'utf8', env: {}, timeout: 180000, maxBuffer: 16 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`repository oracle failed\n${r.stdout}\n${r.stderr}`);
    return { existingTestFileUnmodified: true, productionSourceUnmodified: true, scratchOnlyReplacement: 'fs.link -> selected fd-relative helper', replacedOccurrences: count, exitCode: r.status, pass: Number(r.stdout.match(/(?:#|ℹ) pass (\d+)/u)?.[1] ?? NaN), fail: Number(r.stdout.match(/(?:#|ℹ) fail (\d+)/u)?.[1] ?? NaN), stdoutTail: r.stdout.split('\n').slice(-30).join('\n'), stderrTail: r.stderr.split('\n').slice(-20).join('\n') };
  } finally { await rm(scratch, { recursive: true, force: true }); }
}

function parseArgs(argv) {
  const result = { plane: 'local', caseRoot: os.tmpdir(), oracle: false, output: null };
  for (let i = 0; i < argv.length; i++) { if (argv[i] === '--plane') result.plane = argv[++i]; else if (argv[i] === '--case-root') result.caseRoot = path.resolve(argv[++i]); else if (argv[i] === '--oracle') result.oracle = true; else if (argv[i] === '--output') result.output = path.resolve(argv[++i]); else throw new Error(`unknown arg ${argv[i]}`); }
  return result;
}
async function main() {
  const options = parseArgs(process.argv.slice(2)); const build = await buildNative();
  try {
    const report = {
      schemaVersion: 1, design: 'D0030', plane: options.plane, startedAt: new Date().toISOString(),
      runtime: { node: process.version, napi: process.versions.napi ?? null, platform: process.platform, arch: process.arch, kernelRelease: os.release() },
      build: { nodeInclude: build.include, helper: build.helperBuild, addon: build.addonBuild, identities: build.identities },
      helper: await helperBasic(build.helper, options.caseRoot), capability: await capabilityProbe(build.helper, options.caseRoot), adversarial: await adversarial(build.helper, options.caseRoot), ambiguity: await ambiguitySuite(build.helper, options.caseRoot), addon: await addonComparison(build.addon, options.caseRoot), removal: await removal(build.helper, options.caseRoot), repositoryOracle: options.oracle ? await repositoryOracle(build.helper) : null,
      integrationComparison: {
        helper: { exactErrnoResult: true, conflictMapping: true, unsupportedMapping: 'typed ENOSYS/EINVAL/EOPNOTSUPP and EACCES/EPERM; missing binary fail closed', abnormalTermination: 'child boundary; parent survives; post-BEGIN loss ambiguous', resultLoss: 'dedicated fd4 BEGIN/result protocol', deadline: 'child kill enforceable; post-BEGIN timeout ambiguous', crashBlastRadius: 'native helper child', nodeAbiCoupling: false, removalRollback: 'missing helper fails closed, no fallback', securityConfinement: 'fd3 Case directory + generated basenames; slash/dot/dotdot rejected; empty child environment' },
        addon: { exactErrnoResult: true, conflictMapping: true, abnormalTermination: 'SIGABRT kills host Node process after syscall', resultLoss: 'host process loss can erase typed return after syscall', deadline: 'no isolated in-process deadline boundary', crashBlastRadius: 'host Node process', nodeAbiCoupling: 'stable Node-API ABI but addon is a Node runtime native asset', removalRollback: 'missing addon fails before syscall; no fallback', securityConfinement: 'fd-relative call but native code has host-process ambient authority' },
      },
    };
    report.finishedAt = new Date().toISOString(); if (options.output) await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`); process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally { await rm(build.dir, { recursive: true, force: true }); }
}
await main();
