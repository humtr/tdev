import test from 'node:test';
import assert from 'node:assert/strict';
import {engineWorld} from '../fixtures/engine-world.mjs';
import {BindingRouterApplication} from '../../src/runtime/binding-router.mjs';
import legacy from '../fixtures/public-contract-before-c2.json' with {type:'json'};
import {TOOL_DESCRIPTORS,SCHEMA_DIGEST} from '../../src/mcp/outputs.mjs';
test('bridge exposes exact old descriptors and primary-only old output with all four old call shapes',async()=>{
 assert.deepEqual(TOOL_DESCRIPTORS,legacy.tools);assert.equal(SCHEMA_DIGEST,legacy.schemaDigest);
 const a=await engineWorld({repositoryId:'repo-a'}),b=await engineWorld({repositoryId:'repo-b'});try{
  const app=new BindingRouterApplication({applications:[a.app,b.app],primaryRepositoryId:'repo-a'}),p=a.principal;
  const c=await app.invoke(p,'dev_context',{apiVersion:1});assert.equal(c.ok,true);assert.equal(c.data.repository.repositoryId,'repo-a');assert.equal(Object.hasOwn(c.data,'repositories'),false);assert.equal(Object.hasOwn(c.data,'primaryRepositoryId'),false);
  assert.equal((await app.invoke(p,'dev_context',{apiVersion:1,repository:'repo-b'})).ok,false);
  const read=await app.invoke(p,'dev_read',{apiVersion:1,target:{snapshotId:c.data.snapshot.snapshotId,freshness:'current'},queries:[{kind:'file',path:'a.txt'}]});assert.equal(read.ok,true);
  const request={apiVersion:1,items:[{op:'create',requestId:'bridge-old',snapshotId:c.data.snapshot.snapshotId,expectedHead:c.data.snapshot.commitOid,objective:'old request'}]};
  const made=await app.invoke(p,'dev_work',request);assert.equal(made.data.items[0].ok,true);const retry=await app.invoke(p,'dev_work',request);assert.equal(retry.data.items[0].receipt.actionId,made.data.items[0].receipt.actionId);
  const observed=await app.invoke(p,'dev_observe',{apiVersion:1,selector:{requestIds:['bridge-old']}});assert.equal(observed.ok,true);assert.equal(observed.data.actions.length,1);
  const rejected=await app.invoke(p,'dev_work',{...request,items:[{...request.items[0],repository:'repo-b'}]});assert.equal(rejected.data.items[0].ok,false);assert.equal(rejected.data.items[0].error.code,'INVALID_ARGUMENT');
 }finally{await a.close();await b.close();}
});
test('two bindings integrate distinct durable effects and reject foreign prepared-result reuse',async()=>{
 const a=await engineWorld({repositoryId:'repo-a'}),b=await engineWorld({repositoryId:'repo-b'});
 try{
  async function integrate(w){const made=await w.create('shared-request','new.txt',w.binding.repositoryId+'\n'),work=await w.engine.work(w.principal,made.workId);const request={op:'integrate',requestId:'integrate',workId:work.workId,expectedRevision:work.revision,generation:work.generation,expectedHead:w.baseHead,policyDigest:w.binding.policyDigest};const action=await w.engine.admit(w.principal,request);const [done]=await w.finish([action.actionId]);assert.equal(done.status,'succeeded');const retry=await w.engine.admit(w.principal,request);assert.equal(retry.actionId,action.actionId);return done;}
  const [aa,bb]=await Promise.all([integrate(a),integrate(b)]);assert.equal(a.sends.length,1);assert.equal(b.sends.length,1);assert.notEqual(a.sends[0].effectId,b.sends[0].effectId);assert.equal(a.sends[0].repositoryId,'repo-a');assert.equal(b.sends[0].repositoryId,'repo-b');
  const made=await b.create('another','other.txt','x\n'),work=await b.engine.work(b.principal,made.workId);
  const foreign=await b.engine.admit(b.principal,{op:'integrate',requestId:'foreign-result',workId:work.workId,expectedRevision:work.revision,generation:work.generation,expectedHead:(await b.remote.resolve()).head,policyDigest:b.binding.policyDigest,preparedResultId:aa.resultId});const [rejected]=await b.finish([foreign.actionId]);assert.equal(rejected.status,'failed');assert.equal(b.sends.length,1);assert.notEqual(aa.resultId,bb.resultId);
 }finally{await a.close();await b.close();}
});
