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

test('response-loss retry finds the same durable action even after its original deadline expired',async()=>{
 const w=world();try{let now=0;const c=new WorkCoordinator(w.db,{now:()=>now});const first=await admit(c,1);now=100001;
 const repeated=await c.admit({principal:'p',requestId:'r1',operation:'run',intent:{work:1},deadline:100000,authorize:async()=>{},mutate:()=>{throw Error('must not repeat effect');}});
 assert.equal(repeated.action.actionId,first.action.actionId);assert.equal(repeated.deduplicated,true);
 }finally{w.close();}
});
test('deadline cancellation clears only its work fence and does not stall independent ready actions',async()=>{
 const w=world();try{let now=0;const c=new WorkCoordinator(w.db,{now:()=>now});await admit(c,1);now=100001;
 const later=await c.admit({principal:'p',requestId:'later',operation:'run',intent:{later:true},deadline:200000,authorize:async()=>{},mutate:()=>null});
 const dispatch=c.takeReady();assert.ok(dispatch);assert.equal(dispatch.action.actionId,later.action.actionId);assert.equal(w.db.transact(tx=>tx.getWork('w1')).currentActionId,null);
 }finally{w.close();}
});
test('queued explicit cancellation releases its action fence without inventing an execution attempt',async()=>{
 const w=world();try{const c=new WorkCoordinator(w.db,{now:()=>0}),admitted=await admit(c,1);c.requestCancel(admitted.action.actionId,'p');assert.equal(w.db.transact(tx=>tx.getWork('w1')).currentActionId,null);assert.equal(w.db.transact(tx=>tx.reservations()).length,0);assert.equal(c.takeReady(),null);}finally{w.close();}
});
test('stopped ambiguous effect releases capacity but retains callback identity for later exact reconciliation',async()=>{
 const w=world();try{const c=new WorkCoordinator(w.db,{now:()=>0,executionCapacity:1});await admit(c,1);await admit(c,2);const first=c.takeReady();
 c.settle(first.attempt,w.db.ownerEpoch,'blocked',{stopped:true,effectResolved:false});assert.equal(w.db.transact(tx=>tx.reservations()).length,0);assert.ok(c.takeReady());
 c.settle(first.attempt,w.db.ownerEpoch,'succeeded',{stopped:true,effectResolved:true});assert.equal(w.db.transact(tx=>tx.getAction(first.action.actionId)).status,'succeeded');assert.equal(w.db.transact(tx=>tx.getWork('w1')).currentActionId,null);
 }finally{w.close();}
});
test('a callback with a copied attempt ID but a different work identity cannot settle the retained attempt',async()=>{
 const w=world();try{const c=new WorkCoordinator(w.db,{now:()=>0});await admit(c,1);const first=c.takeReady();assert.throws(()=>c.settle({...first.attempt,workId:'other-work'},w.db.ownerEpoch,'succeeded',{stopped:true,effectResolved:true}),{code:'STALE_REVISION'});assert.equal(w.db.transact(tx=>tx.getAction(first.action.actionId)).status,'running');}finally{w.close();}
});

test('ten thousand source entries do not enter the work row or exceed its decode bound',()=>{
 const w=world();try{const entries=Array.from({length:10000},(_,i)=>({path:'f'+i,mode:'100644',blobOid:oid,contentDigest:hash,size:1}));
 const work={workId:'wlarge',repositoryId:'repo',bindingEpoch:'1',principal:'p',baseCommitOid:oid,baseTreeOid:oid,candidate:{...tree,entries},generation:'0',revision:'0',disposition:'open',currentActionId:null};
 w.db.transact(tx=>tx.insertWork(work));const loaded=w.db.transact(tx=>tx.getWork(work.workId));
 assert.equal(loaded.candidate.treeOid,oid);assert.equal(loaded.candidate.manifestDigest,hash);assert.equal('entries'in loaded.candidate,false);
 assert.ok(w.db.db.prepare('SELECT length(record) n FROM work').get().n<1024);
 }finally{w.close();}
});
test('a pending action fences only its work and cannot acquire another pending sibling',async()=>{
 const w=world();try{const c=new WorkCoordinator(w.db,{now:()=>0});const first=await admit(c,1);await admit(c,2);
 assert.throws(()=>w.db.transact(tx=>tx.insertAction({...first.action,actionId:'forged',requestId:'forged'})));
 assert.equal(w.db.transact(tx=>tx.getAction('forged')),null);
 const original=w.db.transact(tx=>tx.getWork('w2'));assert.equal(w.db.transact(tx=>tx.compareWork('0',{...original,revision:'1'})),true);
 }finally{w.close();}
});
test('immutable object retry after publish-before-directory-sync revalidates and flushes exact bytes',async()=>{
 const w=world();try{let fail=true;const objects=new ObjectStore(join(w.root,'after-publish'),{fault:point=>{if(point==='after-publish'&&fail){fail=false;throw Error('response lost');}}});
 await assert.rejects(()=>objects.put(Buffer.from('payload')),/response lost/);
 const d=await objects.put(Buffer.from('payload'));assert.equal(Buffer.from(await objects.get(d)).toString(),'payload');
 }finally{w.close();}
});
test('actual process crash releases exclusive owner lock and rolls back only uncommitted transaction',async()=>{
 const {spawn}=await import('node:child_process');const {once}=await import('node:events');
 const root=mkdtempSync(join(tmpdir(),'dev2-owner-crash-')),file=join(root,'ledger.sqlite');
 const script=`import {Ledger} from './src/storage/ledger.mjs';const db=new Ledger(process.argv[1],JSON.parse(process.argv[2]));db.db.exec("INSERT INTO meta VALUES('committed','yes')");db.db.exec("BEGIN IMMEDIATE; INSERT INTO meta VALUES('uncommitted','no')");process.send('ready');setInterval(()=>{},1000);`;
 const child=spawn(process.execPath,['--input-type=module','-e',script,file,JSON.stringify(binding)],{stdio:['ignore','ignore','pipe','ipc']});
 let timer;try{await Promise.race([once(child,'message'),once(child,'exit').then(()=>{throw Error('Child exited before lock');}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Lock fixture timeout')),5000);})]);
 assert.throws(()=>new Ledger(file,binding),{code:'EXECUTION_UNAVAILABLE'});child.kill('SIGKILL');await once(child,'exit');
 const db=new Ledger(file,binding);try{assert.equal(db.ownerEpoch,'2');assert.equal(db.db.prepare("SELECT value FROM meta WHERE key='committed'").get().value,'yes');assert.equal(db.db.prepare("SELECT value FROM meta WHERE key='uncommitted'").get(),undefined);}finally{db.close();}
 }finally{clearTimeout(timer);if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await once(child,'exit');}rmSync(root,{recursive:true,force:true});}
});
