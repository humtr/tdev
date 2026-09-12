import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {bytesDigest} from '../../src/contracts/canonical.mjs';
import {SCHEMA_DIGEST,TOOL_DESCRIPTORS} from '../../src/mcp/outputs.mjs';
test('AOT Worker build is repeatable across private output locations, publishes exact schemas and imports without runtime eval',async()=>{
 // Candidate inputs are immutable in required managed execution. Only bounded
 // per-test scratch receives output. Independent paths catch accidental module
 // lookup through output ancestors and temporary paths leaking into artifacts.
 const out=await mkdtemp(join(tmpdir(),'dev2-edge-build-'));
 const other=await mkdtemp(join(tmpdir(),'dev2-edge-build-other-'));
 try{
  const build=directory=>execFileSync(process.execPath,['tools/build-edge.mjs',directory],{encoding:'utf8',timeout:60000});
  build(out);const first=await readFile(join(out,'worker.mjs'));build(out);const second=await readFile(join(out,'worker.mjs'));build(other);const third=await readFile(join(other,'worker.mjs'));
  assert.equal(bytesDigest(first),bytesDigest(second));assert.equal(bytesDigest(first),bytesDigest(third));
  const manifest=JSON.parse(await readFile(join(out,'manifest.json'),'utf8'));assert.equal(manifest.edgeBundleDigest,bytesDigest(first));assert.equal(manifest.schemaDigest,SCHEMA_DIGEST);
  assert.deepEqual(JSON.parse(await readFile(join(out,'tools.json'),'utf8')),TOOL_DESCRIPTORS);assert.equal(/new Function\(|eval\(/.test(first.toString()),false);
  const deployed=await import(pathToFileURL(join(out,'worker.mjs')).href);assert.equal(typeof deployed.default.fetch,'function');assert.equal(typeof deployed.Dev2RendezvousDO,'function');
 }finally{await Promise.all([out,other].map(directory=>rm(directory,{recursive:true,force:true})));}
});
