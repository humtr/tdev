import test from 'node:test';
import assert from 'node:assert/strict';
import {installationBindings,runtimeBindings,selectInstalledBinding} from '../../src/repository/bindings.mjs';
const D='sha256:'+'1'.repeat(64);
const primary={installationId:'i',repositoryId:'repo-a',provider:'github',providerRepositoryId:'1',remote:'https://github.com/o/a.git',ref:'refs/heads/main',bindingEpoch:'1',policyDigest:D};
const secondary={...primary,repositoryId:'repo-b',providerRepositoryId:'2',remote:'https://github.com/o/b.git',ref:'refs/heads/dev'};
test('installed binding registry keeps exact primary identity and explicit selectors',()=>{
 const bindings=installationBindings({installationId:'i',binding:primary,bindings:[primary,secondary]});assert.equal(bindings.length,2);assert.equal(selectInstalledBinding(bindings,primary,'self').repositoryId,'repo-a');assert.equal(selectInstalledBinding(bindings,primary,'repo-b').repositoryId,'repo-b');assert.throws(()=>selectInstalledBinding(bindings,primary,'repo-c'),{code:'FORBIDDEN'});
});
test('runtime bindings share only the active policy projection while identity stays immutable plain data',()=>{
 const next='sha256:'+'2'.repeat(64),runtime=runtimeBindings({installationId:'i',binding:primary,bindings:[primary,secondary]}),{binding,bindings}=runtime;
 assert.equal(Object.isSealed(binding),true);assert.equal(Object.isSealed(bindings[1]),true);assert.equal(bindings[1].policyDigest,D);
 runtime.projectPolicyDigest(next);assert.equal(binding.policyDigest,next);assert.equal(bindings[1].policyDigest,next);assert.equal(binding.ref,primary.ref);assert.equal(bindings[1].ref,secondary.ref);
 assert.throws(()=>{bindings[1].ref='refs/heads/other';},TypeError);assert.equal(installationBindings({installationId:'i',binding:primary,bindings:[primary,secondary]})[0].policyDigest,D);
});
test('installed binding registry rejects duplicate, foreign and substituted primary bindings',()=>{
 assert.throws(()=>installationBindings({installationId:'i',binding:primary,bindings:[primary,{...secondary,repositoryId:'repo-a'}]}),{code:'INTEGRITY_FAILURE'});
 assert.throws(()=>installationBindings({installationId:'i',binding:primary,bindings:[primary,{...secondary,installationId:'other'}]}),{code:'INTEGRITY_FAILURE'});
 assert.throws(()=>installationBindings({installationId:'i',binding:primary,bindings:[secondary]}),{code:'INTEGRITY_FAILURE'});
 assert.throws(()=>installationBindings({installationId:'i',binding:primary,bindings:[primary,{...secondary,ref:'refs/heads/../escape'}]}),{code:'INTEGRITY_FAILURE'});
});
test('same provider repository may have distinct exact ref bindings; aliases and noncanonical refs cannot collide',()=>{
 const other={...primary,repositoryId:'same-repo-other-ref',ref:'refs/heads/feature'};
 const rows=installationBindings({installationId:'i',binding:primary,bindings:[primary,other]});assert.equal(rows[1].providerRepositoryId,rows[0].providerRepositoryId);assert.notEqual(rows[1].ref,rows[0].ref);assert.ok(Object.isFrozen(rows[1]));
 for(const ref of ['main','refs/heads/a//b','refs/heads/.hidden','refs/heads/a.','refs/heads/a.lock/b'])assert.throws(()=>installationBindings({installationId:'i',binding:primary,bindings:[primary,{...other,ref}]}));
 assert.throws(()=>installationBindings({installationId:'i',binding:primary,bindings:[primary,{...other,repositoryId:'self'}]}));
});
