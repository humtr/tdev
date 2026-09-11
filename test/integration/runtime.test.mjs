import test from 'node:test';
import assert from 'node:assert/strict';
import {engineWorld} from '../fixtures/engine-world.mjs';
import {canonicalJson} from '../../src/contracts/canonical.mjs';
const integrate=(work,head,policyDigest,requestId)=>({op:'integrate',requestId,workId:work.workId,expectedRevision:work.revision,generation:work.generation,expectedHead:head,policyDigest});
test('real source create -> full required processes -> exact Git CAS -> terminal readback',async()=>{
 const w=await engineWorld();try{
  const created=await w.create('create','new.txt','new source\n');const work=await w.engine.work(w.principal,created.workId);
  const request=integrate(work,w.baseHead,w.binding.policyDigest,'integrate');const admission=await w.engine.admit(w.principal,request);
  const [action]=await w.finish([admission.actionId]);assert.equal(action.status,'succeeded',JSON.stringify(action));
  const current=await w.remote.resolve();const result=w.ledger.transact(tx=>tx.getPrepared(action.resultId));assert.equal(current.head,result.commitOid);
  const commit=await w.repository.readCommit(w.binding,current.head);assert.deepEqual(commit.parents,[w.baseHead]);assert.equal(commit.source.manifestDigest,result.resultTreeSha256);assert.ok(commit.source.entries.some(e=>e.path==='new.txt'));
  assert.equal(w.profileRuns.length,2);assert.equal(w.validationRuns.length,1);assert.equal(w.ledger.transact(tx=>tx.reservations().length),0);
  assert.equal((await w.engine.work(w.principal,work.workId)).disposition,'integrated');
  const retry=await w.engine.admit(w.principal,request);assert.equal(retry.actionId,admission.actionId);assert.equal(retry.deduplicated,true);assert.equal(w.sends.length,1);
  const observed=await w.app.invoke(w.principal,'dev_observe',{apiVersion:1,selector:{requestIds:['integrate']}});
  assert.equal(observed.ok,true,canonicalJson(observed));assert.equal(observed.data.results[0].commitOid,current.head);assert.equal(observed.data.results[0].integration.kind,'integrated');
 }finally{await w.close();}
});
test('explicit validate result is reused by integration without duplicate full validation or commit',async()=>{
 const w=await engineWorld();try{
  const created=await w.create('create','new','content');let work=await w.engine.work(w.principal,created.workId);
  const admitted=await w.engine.admit(w.principal,{...integrate(work,w.baseHead,w.binding.policyDigest,'validate'),op:'validate'});
  const [validated]=await w.finish([admitted.actionId]);assert.equal(validated.status,'succeeded',JSON.stringify(validated));assert.equal(w.profileRuns.length,2);
  work=await w.engine.work(w.principal,created.workId);
  const integrated=await w.engine.admit(w.principal,{...integrate(work,w.baseHead,w.binding.policyDigest,'integrate'),preparedResultId:validated.resultId});
  const [action]=await w.finish([integrated.actionId]);assert.equal(action.status,'succeeded',JSON.stringify(action));assert.equal(action.resultId,validated.resultId);assert.equal(w.profileRuns.length,2);assert.equal(w.sends.length,1);
 }finally{await w.close();}
});
test('invalid initial edit is atomic and authorization precedes dedup disclosure',async()=>{
 const w=await engineWorld();try{const snapshot=await w.context.current(w.principal,w.binding);
  await assert.rejects(()=>w.engine.admit(w.principal,{op:'create',requestId:'bad',snapshotId:snapshot.snapshotId,expectedHead:w.baseHead,objective:'bad',initialEdits:[{kind:'delete',path:'absent',expectedEntry:'absent'}]}));
  assert.equal(w.ledger.transact(tx=>tx.all('SELECT * FROM work').length),0);assert.equal(w.ledger.transact(tx=>tx.all('SELECT * FROM action').length),0);
  const request={op:'create',requestId:'ok',snapshotId:snapshot.snapshotId,expectedHead:w.baseHead,objective:'change'};
  const created=await w.engine.admit(w.principal,request);w.access.allowed=false;
  await assert.rejects(()=>w.engine.admit(w.principal,request),{code:'FORBIDDEN'});assert.ok(created.workId);
 }finally{await w.close();}
});
test('failed required profile never sends canonical mutation and keeps work editable',async()=>{
 const w=await engineWorld();try{const created=await w.create('create','bad.txt','FAIL_CORE');const work=await w.engine.work(w.principal,created.workId);
  const admitted=await w.engine.admit(w.principal,integrate(work,w.baseHead,w.binding.policyDigest,'integrate'));const [action]=await w.finish([admitted.actionId]);assert.equal(action.status,'failed');assert.equal(action.errorCode,'VALIDATION_FAILED');assert.equal(w.sends.length,0);assert.equal((await w.remote.resolve()).head,w.baseHead);
  const editable=await w.engine.work(w.principal,work.workId);assert.equal(editable.currentActionId,null);assert.equal(editable.disposition,'open');assert.equal(w.profileRuns.length,2);
 }finally{await w.close();}
});
test('four tool projections use bounded current context and same work generation without leaking the full source manifest',async()=>{
 const w=await engineWorld();try{const context=await w.app.invoke(w.principal,'dev_context',{apiVersion:1});assert.equal(context.ok,true,canonicalJson(context));assert.equal(context.data.snapshot.commitOid,w.baseHead);assert.equal(context.data.limits.defaultParallelism,8);assert.equal(context.data.snapshot.entries,undefined);
  const read=await w.app.invoke(w.principal,'dev_read',{apiVersion:1,target:{snapshotId:context.data.snapshot.snapshotId,freshness:'current'},queries:[{kind:'file',path:'a.txt'}]});assert.equal(read.ok,true,canonicalJson(read));assert.equal(read.data.results[0].content,'alpha\n');
  const observed=await w.app.invoke(w.principal,'dev_observe',{apiVersion:1,selector:{runtime:true}});assert.equal(observed.ok,true,canonicalJson(observed));assert.equal(observed.data.runtime.capacity,8);assert.equal(observed.data.runtime.deploymentSealed,false);
 }finally{await w.close();}
});
