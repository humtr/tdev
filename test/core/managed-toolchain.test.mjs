import test from 'node:test';
import assert from 'node:assert/strict';
import {executionToolVersions,selectExecutionVariant} from '../../src/runtime/environment.mjs';
import {dependencyLockDigest} from '../../src/execution/controller-identity.mjs';
import {readFileSync} from 'node:fs';
const lock=JSON.parse(readFileSync('config/toolchain.lock.json','utf8')),packageLock=JSON.parse(readFileSync('package-lock.json','utf8'));
test('exact managed-image Git/Python pin does not change the canonical native writer or allow version fallback',()=>{
 const native=lock.executionVariants.find(v=>v.role==='native-control'),managed=lock.executionVariants.find(v=>v.id===lock.managedImage.executionVariant);
 assert.deepEqual(executionToolVersions(lock,native,'native'),{git:'2.55.0',python:null});assert.deepEqual(executionToolVersions(lock,managed,'managed-image'),{git:'2.47.3',python:'3.13.5'});
 assert.throws(()=>executionToolVersions(lock,native,'managed-image'));assert.throws(()=>executionToolVersions(lock,managed,'unknown'));
 assert.throws(()=>executionToolVersions({...lock,managedImage:undefined},managed,'managed-image'));assert.throws(()=>executionToolVersions({...lock,managedImage:{...lock.managedImage,gitVersion:'*'}},managed,'managed-image'));assert.throws(()=>selectExecutionVariant(lock,{...managed,node:'0.0.0'}));
});
test('dependency lock identity ignores only matching root product names',()=>{
 const base=dependencyLockDigest(packageLock),renamed=structuredClone(packageLock);renamed.name='tdev';renamed.packages[''].name='tdev';assert.equal(dependencyLockDigest(renamed),base);
 const changed=structuredClone(packageLock);changed.packages[''].dependencies={...changed.packages[''].dependencies,ajv:'0.0.0'};assert.notEqual(dependencyLockDigest(changed),base);
 const mismatched=structuredClone(packageLock);mismatched.name='other';assert.throws(()=>dependencyLockDigest(mismatched),{code:'INTEGRITY_FAILURE'});
});
