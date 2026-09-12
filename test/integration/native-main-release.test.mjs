import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
for(const mode of ['unenrolled','qualified','production'])test('native main composition: '+mode,()=>{const result=spawnSync(process.execPath,['--experimental-test-module-mocks',fileURLToPath(new URL('./native-main-fixture.mjs',import.meta.url)),mode],{encoding:'utf8',timeout:30000,maxBuffer:1048576});assert.equal(result.status,0,result.stdout+result.stderr);});
