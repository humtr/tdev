import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {bytesDigest} from '../../src/contracts/canonical.mjs';
import {SCHEMA_DIGEST} from '../../src/mcp/outputs.mjs';
test('fixed helper bundles separately without changing the ordinary three-artifact release manifest',async()=>{const output=await mkdtemp(join(tmpdir(),'dev2-helper-build-'));try{const build=spawnSync(process.execPath,[resolve('tools/build-release-helper.mjs'),output],{cwd:resolve('.'),encoding:'utf8',timeout:60000,maxBuffer:65536});assert.equal(build.status,0,build.stderr);const manifest=JSON.parse(await readFile(join(output,'helper-manifest.json'))),bytes=await readFile(join(output,'helper.mjs'));assert.equal(manifest.bundleDigest,bytesDigest(bytes));assert.equal(manifest.schemaDigest,SCHEMA_DIGEST);assert.equal(manifest.bytes,bytes.length);const syntax=spawnSync(process.execPath,['--check',join(output,'helper.mjs')],{encoding:'utf8',timeout:15000});assert.equal(syntax.status,0,syntax.stderr);const noConfig=spawnSync(process.execPath,[join(output,'helper.mjs')],{encoding:'utf8',timeout:15000});assert.notEqual(noConfig.status,0);assert.match(noConfig.stderr,/Fixed helper requires one private installation configuration/);}finally{await rm(output,{recursive:true,force:true});}});
