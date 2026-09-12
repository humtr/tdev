import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('private exact-source commissioning retains three actual assignment joins and survives duplicate/restart before capability exposure',()=>{const result=spawnSync(process.execPath,['--experimental-test-module-mocks',fileURLToPath(new URL('./production-commissioning-fixture.mjs',import.meta.url))],{encoding:'utf8',timeout:20000,maxBuffer:1048576});assert.equal(result.status,0,result.stdout+result.stderr);});
