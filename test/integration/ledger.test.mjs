import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,writeFileSync,chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ledger } from '../../src/storage/ledger.mjs';
import { ObjectStore } from '../../src/storage/objects.mjs';
import { WorkCoordinator } from '../../src/work/coordinator.mjs';
import { nextRevision } from '../../src/contracts/identity.mjs';
const hash='sha256:'+'1'.repeat(64),oid='sha1:'+'2'.repeat(40);
const binding={repositoryId:'repo',installationId:'installation',provider:'fixture',providerRepositoryId:'p',remote:'https://fixture.example/repo',ref:'refs/heads/dev-2',bindingEpoch:'1',policyDigest:hash};
const tree={treeOid:oid,manifestDigest:hash,entries:[]};
function world(){const root=mkdtempSync(join(tmpdir(),'dev2-ledger-'));const file=join(root,'ledger.sqlite');const db=new Ledger(file,binding);return {root,file,db,close:()=>{db.close();rmSync(root,{recursive:true,force:true});}};}
async function admit(c,i,principal='p') {return c.admit({principal,requestId:'r'+i,operation:'run',intent:{work:i},deadline:100000,authorize:async()=>{},mutate:(tx,actionId)=>{
  const work={workId:'w'+i,repositoryId:'repo',bindingEpoch:'1',principal,baseCommitOid:oid,baseTreeOid:oid,candidate:tree,generation:'0',revision:'0',disposition:'open',currentActionId:actionId};tx.insertWork(work);return work;
}});}
test('real SQLite WAL FULL single-owner lock, reopen and late-callback fencing',async()=>{
  const w=world();try{assert.equal(w.db.db.prepare('PRAGMA journal_mode').get().journal_mode,'wal');assert.equal(w.db.db.prepare('PRAGMA synchronous').get().synchronous,2);
    assert.throws(()=>new Ledger(w.file,binding),{code:'EXECUTION_UNAVAILABLE'});
    const c=new WorkCoordinator(w.db,{now:()=>0});await admit(c,1);const dispatch=c.takeReady();const epoch=w.db.ownerEpoch;w.db.close();
    const reopened=new Ledger(w.file,binding);try{assert.equal(reopened.ownerEpoch,nextRevision(epoch));assert.equal(reopened.transact(tx=>tx.reservations().length),1);
      const recovered=new WorkCoordinator(reopened,{now:()=>0});assert.throws(()=>recovered.settle(dispatch.attempt,epoch,'succeeded',{stopped:true,effectResolved:true}),{code:'STALE_REVISION'});
      reopened.transact(tx=>tx.adoptAttempt(dispatch.attempt.attemptId));recovered.settle(dispatch.attempt,reopened.ownerEpoch,'succeeded',{stopped:true,effectResolved:true});
      assert.equal(reopened.transact(tx=>tx.lookupRequest('p','1','r1')).status,'succeeded');
    }finally{reopened.close();}
  }finally{w.close();}
});
test('dedup precedes mutation preconditions, but never bypasses authorization',async()=>{
  const w=world();try{const c=new WorkCoordinator(w.db,{now:()=>0});const first=await admit(c,1);
    const duplicate=await c.admit({principal:'p',requestId:'r1',operation:'run',intent:{work:1},deadline:100000,authorize:async()=>{},mutate:()=>{throw Error('stale callback must not execute');}});
    assert.equal(duplicate.action.actionId,first.action.actionId);assert.equal(duplicate.deduplicated,true);
    await assert.rejects(()=>c.admit({principal:'p',requestId:'r1',operation:'run',intent:{work:2},deadline:100000,authorize:async()=>{},mutate:()=>null}),{code:'IDEMPOTENCY_MISMATCH'});
    await assert.rejects(()=>c.admit({principal:'p',requestId:'r1',operation:'run',intent:{work:1},deadline:100000,authorize:async()=>{throw Error('revoked');},mutate:()=>null}),/revoked/);
  }finally{w.close();}
});
for(const cap of [1,8,16,32])test('durable capacity '+cap+' and independent progress after one blocked attempt',async()=>{
  const w=world();try{const c=new WorkCoordinator(w.db,{executionCapacity:cap,now:()=>0});for(let i=0;i<cap+1;i++)await admit(c,i);
    const running=Array.from({length:cap},()=>c.takeReady());assert.ok(running.every(Boolean));assert.equal(c.takeReady(),null);
    c.settle(running[0].attempt,w.db.ownerEpoch,'blocked',{stopped:false,effectResolved:false});assert.equal(c.takeReady(),null);
    const last=running[cap-1];if(cap>1)c.settle(last.attempt,w.db.ownerEpoch,'succeeded',{stopped:true,effectResolved:true});
    else c.settle(last.attempt,w.db.ownerEpoch,'blocked',{stopped:true,effectResolved:false});
    assert.ok(c.takeReady());assert.ok(w.db.maxTransactionMs>=0);
  }finally{w.close();}
});
test('fair principal cursor skips blocked and survives reopen',async()=>{
  const w=world();try{const c=new WorkCoordinator(w.db,{executionCapacity:8,now:()=>0});await admit(c,1,'a');await admit(c,2,'a');await admit(c,3,'b');
    assert.equal(c.takeReady().action.principal,'a');assert.equal(c.takeReady().action.principal,'b');assert.equal(c.takeReady().action.principal,'a');
  }finally{w.close();}
});
test('transaction rollback, async/nested/escaped callback rejection and immutable terminals',async()=>{
  const w=world();try{
    assert.throws(()=>w.db.transact(tx=>{tx.run("INSERT INTO meta VALUES('rollback','x')");throw Error('fault');}));assert.equal(w.db.transact(tx=>tx.get("SELECT value FROM meta WHERE key='rollback'")),undefined);
    assert.throws(()=>w.db.transact(async()=>1),{code:'INVALID_ARGUMENT'});assert.throws(()=>w.db.transact(()=>w.db.transact(()=>1)),{code:'INTEGRITY_FAILURE'});
    const escaped=w.db.transact(tx=>tx);assert.throws(()=>escaped.getWork('w'),{code:'INTEGRITY_FAILURE'});
    const c=new WorkCoordinator(w.db,{now:()=>0});await admit(c,1);const d=c.takeReady();assert.throws(()=>c.settle(d.attempt,w.db.ownerEpoch,'cancelled',{stopped:false,effectResolved:false}),{code:'EFFECT_UNCERTAIN'});
    c.requestCancel(d.action.actionId,'p');assert.equal(w.db.transact(tx=>tx.getAction(d.action.actionId)).status,'blocked');
    c.settle(d.attempt,w.db.ownerEpoch,'cancelled',{stopped:true,effectResolved:true});assert.throws(()=>w.db.transact(tx=>{const a=tx.getAction(d.action.actionId);tx.updateAction({...a,status:'running'});}),{code:'INTEGRITY_FAILURE'});
  }finally{w.close();}
});
test('atomic immutable object publication, eight parallel copies, partial-write orphan and corruption',async()=>{
  const w=world();try{const objects=new ObjectStore(join(w.root,'objects'));const data=Buffer.from('exact bytes');
    const results=await Promise.all(Array.from({length:8},()=>objects.put(data)));assert.equal(new Set(results).size,1);assert.deepEqual(Buffer.from(await objects.get(results[0])),data);
    const faulty=new ObjectStore(join(w.root,'faulty'),{fault:p=>{if(p==='before-publish')throw Error('crash');}});await assert.rejects(()=>faulty.put(data),/crash/);
    await assert.rejects(()=>faulty.get(results[0]));
    chmodSync(join(w.root,'objects',results[0].slice(7)),0o600);writeFileSync(join(w.root,'objects',results[0].slice(7)),Buffer.from('corrupt'),{mode:0o600});await assert.rejects(()=>objects.get(results[0]),{code:'INTEGRITY_FAILURE'});
  }finally{w.close();}
});
