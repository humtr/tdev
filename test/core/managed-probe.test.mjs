import test from 'node:test';
import assert from 'node:assert/strict';
import {containmentProgram} from '../../tools/managed-probe.mjs';
import {readFile} from 'node:fs/promises';
test('managed qualification fixture tests actual boundaries and cannot grant an installation seal',async()=>{
 const text=containmentProgram('/private/control.sqlite',12345);
 for(const requirement of ['sourceReadOnly','rootReadOnly','hostFiles','credentials','procCredentials','noCapabilities','noNewPrivileges','seccomp','pidAdmission','memoryLimit','cpuLimit','diskLimit','hostLoopback','egress'])assert.ok(text.includes(requirement),requirement);
 const config=JSON.parse(await readFile(new URL('../../config/managed-execution.json',import.meta.url),'utf8'));
 assert.equal(config.productionSeal,null);assert.equal(config.state,'qualification-only');assert.ok(config.image.endsWith('@'+config.imageDigest));
});
