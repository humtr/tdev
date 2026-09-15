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
  const ca=await app.invoke(p,'dev_context',{apiVersion:1});assert.equal(ca.ok,true,canonicalJson(ca));assert.equal(ca.data.repository.repositoryId,'repo-a');
  const cb=await app.invoke(p,'dev_context',{apiVersion:1,repository:'repo-b'});assert.equal(cb.ok,true,canonicalJson(cb));assert.equal(cb.data.repository.repositoryId,'repo-b');
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
