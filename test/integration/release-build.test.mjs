import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {buildRelease} from '../../tools/build-release.mjs';
import {decodeBuildOutput} from '../../src/release/build-output.mjs';
import {SCHEMA_DIGEST,TOOL_DESCRIPTORS} from '../../src/mcp/outputs.mjs';
test('actual finite device/edge build emits only bounded exact bytes outside immutable source',async()=>{const output=await mkdtemp(join(tmpdir(),'dev2-release-build-'));try{const bytes=await buildRelease(resolve('.'),output),result=decodeBuildOutput(bytes,SCHEMA_DIGEST);assert.deepEqual(result.artifacts.map(a=>a.name),['device.cjs','worker.mjs','tools.json']);assert.deepEqual(JSON.parse(Buffer.from(result.artifacts[2].bytes).toString()),TOOL_DESCRIPTORS);assert.ok(result.artifacts[0].size>1000);assert.ok(result.artifacts[1].size>1000);await assert.rejects(buildRelease(resolve('.'),resolve('.artifacts/forbidden-managed-output')),{code:'FORBIDDEN'});}finally{await rm(output,{recursive:true,force:true});}});
