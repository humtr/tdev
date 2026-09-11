import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {bytesDigest} from '../../src/contracts/canonical.mjs';
import {SCHEMA_DIGEST,TOOL_DESCRIPTORS} from '../../src/mcp/outputs.mjs';
test('AOT Worker build is repeatable, publishes exact schemas and imports without runtime eval',async()=>{
 const build=()=>execFileSync(process.execPath,['tools/build-edge.mjs'],{encoding:'utf8',timeout:60000});
 build();const first=await readFile('.artifacts/build/worker.mjs');build();const second=await readFile('.artifacts/build/worker.mjs');assert.equal(bytesDigest(first),bytesDigest(second));
 const manifest=JSON.parse(await readFile('.artifacts/build/manifest.json','utf8'));assert.equal(manifest.edgeBundleDigest,bytesDigest(first));assert.equal(manifest.schemaDigest,SCHEMA_DIGEST);
 assert.deepEqual(JSON.parse(await readFile('.artifacts/build/tools.json','utf8')),TOOL_DESCRIPTORS);assert.equal(/new Function\(|eval\(/.test(first.toString()),false);
 const deployed=await import(pathToFileURL(resolve('.artifacts/build/worker.mjs')).href);assert.equal(typeof deployed.default.fetch,'function');assert.equal(typeof deployed.Dev2RendezvousDO,'function');
});
