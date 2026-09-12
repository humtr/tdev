import test from 'node:test';
import assert from 'node:assert/strict';
import {executionToolVersions,selectExecutionVariant} from '../../src/runtime/environment.mjs';
import {readFileSync} from 'node:fs';
const lock=JSON.parse(readFileSync('config/toolchain.lock.json','utf8'));
test('exact managed-image Git/Python pin does not change the canonical native writer or allow version fallback',()=>{
 const native=lock.executionVariants.find(v=>v.role==='native-control'),managed=lock.executionVariants.find(v=>v.id===lock.managedImage.executionVariant);
 assert.deepEqual(executionToolVersions(lock,native,'native'),{git:'2.55.0',python:null});assert.deepEqual(executionToolVersions(lock,managed,'managed-image'),{git:'2.47.3',python:'3.13.5'});
 assert.throws(()=>executionToolVersions(lock,native,'managed-image'));assert.throws(()=>executionToolVersions(lock,managed,'unknown'));
 assert.throws(()=>executionToolVersions({...lock,managedImage:undefined},managed,'managed-image'));assert.throws(()=>executionToolVersions({...lock,managedImage:{...lock.managedImage,gitVersion:'*'}},managed,'managed-image'));assert.throws(()=>selectExecutionVariant(lock,{...managed,node:'0.0.0'}));
});
