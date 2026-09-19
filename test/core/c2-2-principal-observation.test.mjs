import test from 'node:test';
import assert from 'node:assert/strict';
import {access,readFile} from 'node:fs/promises';

test('consumed C2-2 principal-observation recovery is absent from current runtime source',async()=>{
 await assert.rejects(access(new URL('../../src/security/c2-2-principal-observation.mjs',import.meta.url)),{code:'ENOENT'});
 const native=await readFile(new URL('../../src/runtime/native.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(native,/c2HumanObservationRecovery|c22PrincipalObservation|recordVerifiedC22PrincipalObservation/);
});
