import test from 'node:test';
import assert from 'node:assert/strict';
import {engineWorld} from '../fixtures/engine-world.mjs';
import {BindingRouterApplication} from '../../src/runtime/binding-router.mjs';
import {canonicalJson} from '../../src/contracts/canonical.mjs';

test('one four-tool router selects two binding-scoped engines without cross-binding identity leakage',async()=>{
 const a=await engineWorld({repositoryId:'repo-a',files:[{path:'only-a.txt',content:'alpha-a\n'},{path:'AGENTS.md',content:'A authority\n'}]});
 const b=await engineWorld({repositoryId:'repo-b',files:[{path:'only-b.txt',content:'beta-b\n'},{path:'AGENTS.md',content:'B authority\n'}]});
 try{
  const app=new BindingRouterApplication({applications:[a.app,b.app],primaryRepositoryId:'repo-a'}),p=a.principal;
  const ca=await app.invoke(p,'dev_context',{apiVersion:1});assert.equal(ca.ok,true,canonicalJson(ca));assert.equal(ca.data.repository.repositoryId,'repo-a');assert.equal(ca.data.primaryRepositoryId,'repo-a');assert.deepEqual(ca.data.repositories.map(r=>[r.repositoryId,r.primary]),[['repo-a',true],['repo-b',false]]);
  const cb=await app.invoke(p,'dev_context',{apiVersion:1,repository:'repo-b'});assert.equal(cb.ok,true,canonicalJson(cb));assert.equal(cb.data.repository.repositoryId,'repo-b');assert.deepEqual(cb.data.repositories,ca.data.repositories);
  const rb=await app.invoke(p,'dev_read',{apiVersion:1,repository:'repo-b',target:{snapshotId:cb.data.snapshot.snapshotId,freshness:'current'},queries:[{kind:'file',path:'only-b.txt'}]});assert.equal(rb.ok,true,canonicalJson(rb));assert.equal(rb.data.results[0].content,'beta-b\n');
  const work=await app.invoke(p,'dev_work',{apiVersion:1,items:[
   {op:'create',repository:'repo-a',requestId:'same-request',snapshotId:ca.data.snapshot.snapshotId,expectedHead:ca.data.snapshot.commitOid,objective:'A change'},
   {op:'create',repository:'repo-b',requestId:'same-request',snapshotId:cb.data.snapshot.snapshotId,expectedHead:cb.data.snapshot.commitOid,objective:'B change'}
  ]});assert.equal(work.ok,true,canonicalJson(work));assert.equal(work.data.items.every(item=>item.ok),true,canonicalJson(work));
  const wa=work.data.items[0].receipt.workId,wb=work.data.items[1].receipt.workId;assert.notEqual(wa,wb);assert.ok(a.ledger.transact(tx=>tx.getWork(wa)));assert.equal(a.ledger.transact(tx=>tx.getWork(wb)),null);assert.ok(b.ledger.transact(tx=>tx.getWork(wb)));assert.equal(b.ledger.transact(tx=>tx.getWork(wa)),null);
  const wrong=await app.invoke(p,'dev_observe',{apiVersion:1,repository:'repo-a',selector:{workIds:[wb]}});assert.equal(wrong.ok,false);assert.equal(wrong.error.code,'FORBIDDEN');
  const mixed=await app.invoke(p,'dev_work',{apiVersion:1,items:[
   {op:'create',repository:'repo-missing',requestId:'missing',snapshotId:ca.data.snapshot.snapshotId,expectedHead:ca.data.snapshot.commitOid,objective:'must fail'},
   {op:'create',repository:'repo-a',requestId:'valid-sibling',snapshotId:ca.data.snapshot.snapshotId,expectedHead:ca.data.snapshot.commitOid,objective:'must pass'}
  ]});assert.equal(mixed.ok,true,canonicalJson(mixed));assert.equal(mixed.data.items[0].ok,false);assert.equal(mixed.data.items[0].error.code,'FORBIDDEN');assert.equal(mixed.data.items[1].ok,true);
 }finally{await Promise.all([a.close(),b.close()]);}
});

test('discovery revocation, foreign handles and primary-only operations are fenced before lookup or effects',async()=>{
 const a=await engineWorld({repositoryId:'repo-a'}),b=await engineWorld({repositoryId:'repo-b'});
 try{
  const app=new BindingRouterApplication({applications:[a.app,b.app],primaryRepositoryId:'repo-a'}),p=a.principal;
  const context=await app.invoke(p,'dev_context',{apiVersion:1,repository:'repo-b'}),made=await b.create('same','new.txt','B\n');
  for(const selector of [{workIds:[made.workId]},{actionIds:[made.actionId]}]){const result=await app.invoke(p,'dev_observe',{apiVersion:1,repository:'repo-a',selector});assert.equal(result.ok,false);assert.equal(result.error.code,'FORBIDDEN');}
  const read=await app.invoke(p,'dev_read',{apiVersion:1,repository:'repo-a',target:{snapshotId:context.data.snapshot.snapshotId},queries:[{kind:'file',path:'a.txt'}]});assert.equal(read.ok,false);
  const special=await app.invoke(p,'dev_work',{apiVersion:1,items:[{op:'release.activate',repository:'repo-b',requestId:'forbidden-release',stagedReleaseId:'1'.repeat(64),expectedActiveRelease:'sha256:'+'1'.repeat(64)}]});assert.equal(special.data.items[0].error.code,'FORBIDDEN');
  b.access.allowed=false;const discover=await app.invoke(p,'dev_context',{apiVersion:1});assert.deepEqual(discover.data.repositories.map(r=>r.repositoryId),['repo-a']);assert.equal((await app.invoke(p,'dev_context',{apiVersion:1,repository:'repo-b'})).ok,false);
  const replay=await app.invoke(p,'dev_work',{apiVersion:1,items:[{op:'create',repository:'repo-b',requestId:'same',snapshotId:context.data.snapshot.snapshotId,expectedHead:b.baseHead,objective:'revoked replay'}]});assert.equal(replay.data.items[0].error.code,'FORBIDDEN');assert.equal(a.sends.length+b.sends.length,0);
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
