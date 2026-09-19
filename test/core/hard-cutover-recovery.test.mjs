import test from 'node:test';
import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';

test('consumed hard-cutover recovery implementation and operator tool are absent',async()=>{
 await assert.rejects(access(new URL('../../src/release/hard-cutover-recovery.mjs',import.meta.url)),{code:'ENOENT'});
 await assert.rejects(access(new URL('../../tools/recover-hard-cutover.mjs',import.meta.url)),{code:'ENOENT'});
});
