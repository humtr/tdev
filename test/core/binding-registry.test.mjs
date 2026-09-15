import test from 'node:test';
import assert from 'node:assert/strict';
import {installationBindings,selectInstalledBinding} from '../../src/repository/bindings.mjs';
const D='sha256:'+'1'.repeat(64);
const primary={installationId:'i',repositoryId:'repo-a',provider:'github',providerRepositoryId:'1',remote:'https://github.com/o/a.git',ref:'refs/heads/main',bindingEpoch:'1',policyDigest:D};
const secondary={...primary,repositoryId:'repo-b',providerRepositoryId:'2',remote:'https://github.com/o/b.git',ref:'refs/heads/dev'};
test('installed binding registry keeps exact primary identity and explicit selectors',()=>{
 const bindings=installationBindings({installationId:'i',binding:primary,bindings:[primary,secondary]});assert.equal(bindings.length,2);assert.equal(selectInstalledBinding(bindings,primary,'self').repositoryId,'repo-a');assert.equal(selectInstalledBinding(bindings,primary,'repo-b').repositoryId,'repo-b');assert.throws(()=>selectInstalledBinding(bindings,primary,'repo-c'),{code:'FORBIDDEN'});
});
test('installed binding registry rejects duplicate, foreign and substituted primary bindings',()=>{
 assert.throws(()=>installationBindings({installationId:'i',binding:primary,bindings:[primary,{...secondary,repositoryId:'repo-a'}]}),{code:'INTEGRITY_FAILURE'});
 assert.throws(()=>installationBindings({installationId:'i',binding:primary,bindings:[primary,{...secondary,installationId:'other'}]}),{code:'INTEGRITY_FAILURE'});
 assert.throws(()=>installationBindings({installationId:'i',binding:primary,bindings:[secondary]}),{code:'INTEGRITY_FAILURE'});
 assert.throws(()=>installationBindings({installationId:'i',binding:primary,bindings:[primary,{...secondary,ref:'refs/heads/../escape'}]}),{code:'INTEGRITY_FAILURE'});
});
