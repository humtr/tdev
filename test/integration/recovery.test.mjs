import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {engineWorld} from '../fixtures/engine-world.mjs';
import {Ledger} from '../../src/storage/ledger.mjs';
import {DevelopmentEngine} from '../../src/runtime/engine.mjs';
import {Dev2Error} from '../../src/contracts/errors.mjs';
const stopped=async()=>({stopped:true,senderStopped:true});
async function admitIntegration(w,request='integrate1'){
 const work=await w.create('create1','new.txt','new source\n');
 const action=await w.engine.admit(w.principal,{op:'integrate',requestId:request,workId:work.workId,expectedRevision:work.revision,generation:work.generation,expectedHead:w.baseHead,policyDigest:w.binding.policyDigest});return {work,action};
}
async function resume(w,engine,action,requestId='resume1'){
 const work=await engine.work(w.principal,action.workId);return engine.admit(w.principal,{op:'resume',requestId,workId:work.workId,actionId:action.actionId,expectedRevision:work.revision});
}
async function finish(engine,id){const until=Date.now()+30000;engine.pump();while(Date.now()<until){const action=engine.ledger.transact(tx=>tx.getAction(id));if(['succeeded','failed','cancelled','blocked'].includes(action.status)){await Promise.allSettled([...engine.running.values()]);return action;}await delay(10);}throw Error('Recovery timeout');}
test('lost send response reconciles exact integrated commit without duplicate validation or send',async()=>{
 const w=await engineWorld({afterSend:async()=>{throw Error('lost response');}});try{w.engine.o.recoverAttempt=stopped;const {action}=await admitIntegration(w);const first=await finish(w.engine,action.actionId);assert.equal(first.status,'blocked');
 const sends=w.sends.length,validations=w.validationRuns.length;const receipt=await resume(w,w.engine,action);assert.equal(receipt.status,'succeeded');
 const recovered=w.ledger.transact(tx=>tx.getAction(action.actionId));assert.equal(recovered.status,'succeeded');assert.equal((await w.engine.work(w.principal,action.workId)).disposition,'integrated');assert.equal(w.sends.length,sends);assert.equal(w.validationRuns.length,validations);
 const again=await w.engine.admit(w.principal,{op:'resume',requestId:'resume1',workId:action.workId,actionId:action.actionId,expectedRevision:'1'});assert.equal(again.deduplicated,true);assert.equal(again.actionId,receipt.actionId);
 }finally{await w.close();}
});
test('uncertain execution or sender never grants replay even when another work can proceed',async()=>{
 const w=await engineWorld();try{const {action}=await admitIntegration(w);const selected=w.engine.coordinator.takeReady();
 for(const proof of [{stopped:false,senderStopped:true},{stopped:true,senderStopped:false}]){w.engine.o.recoverAttempt=async()=>proof;await assert.rejects(()=>resume(w,w.engine,action),{code:'EFFECT_UNCERTAIN'});}
 assert.equal(w.ledger.transact(tx=>tx.getAction(action.actionId)).status,'running');assert.equal(w.ledger.transact(tx=>tx.reservations().length),1);
 const independent=await w.create('independent','other.txt','independent');assert.ok(independent.workId);
 w.engine.coordinator.settle(selected.attempt,w.ledger.ownerEpoch,'cancelled',{stopped:true,effectResolved:true});
 }finally{await w.close();}
});
test('a reopened ledger resumes the original reserved action under a new observer epoch',async()=>{
 const w=await engineWorld();let db;try{const {action}=await admitIntegration(w);const old=w.engine.coordinator.takeReady();assert.equal(old.attempt.ownerEpoch,'1');w.ledger.close();
 db=new Ledger(join(w.root,'ledger.sqlite'),w.binding);w.validator.observerEpoch=()=>db.ownerEpoch;
 const engine=new DevelopmentEngine({...w.engineOptions,ledger:db,recoverAttempt:stopped});const readback=await engine.recoverPending();assert.equal(readback.length,1);assert.equal(readback[0].error,null);
 const retained=db.transact(tx=>tx.retainedAttempt(old.attempt.attemptId));assert.equal(retained.held,false);assert.equal(retained.attempt.ownerEpoch,'1');assert.equal(retained.observerEpoch,'2');
 const done=await finish(engine,action.actionId);assert.equal(done.status,'succeeded');assert.equal(done.attempt,'2');assert.equal(done.ownerEpoch,'2');assert.equal(w.sends.length,1);
 assert.throws(()=>engine.coordinator.settle(old.attempt,'1','failed',{stopped:true,effectResolved:true}),{code:'STALE_REVISION'});
 }finally{db?.close();await w.close();}
});
test('resume requires the original operation capability, not only work.write',async()=>{
 const w=await engineWorld();try{const {action}=await admitIntegration(w);const old=w.engine.coordinator.takeReady();w.engine.o.recoverAttempt=stopped;
 const previous=w.authorization.authorize;w.authorization.authorize=async(p,b,c,paths)=>{if(c==='integration.write')throw new Dev2Error('FORBIDDEN');return previous(p,b,c,paths);};
 await assert.rejects(()=>resume(w,w.engine,action),{code:'FORBIDDEN'});assert.equal(w.ledger.transact(tx=>tx.getAction(action.actionId)).status,'running');w.engine.coordinator.settle(old.attempt,w.ledger.ownerEpoch,'cancelled',{stopped:true,effectResolved:true});
 }finally{await w.close();}
});
test('expired interrupted action is reconciled and cancelled, never given an implicit fresh deadline',async()=>{
 const w=await engineWorld();try{const {action}=await admitIntegration(w);w.engine.coordinator.takeReady();w.engine.o.recoverAttempt=stopped;
 const deadline=w.ledger.transact(tx=>tx.getAction(action.actionId)).deadline;w.engine.now=()=>deadline+1;w.engine.coordinator.now=()=>deadline+1;
 await resume(w,w.engine,action);const done=w.ledger.transact(tx=>tx.getAction(action.actionId));assert.equal(done.status,'cancelled');assert.equal(done.deadline,deadline);assert.equal((await w.engine.work(w.principal,action.workId)).currentActionId,null);assert.equal(w.sends.length,0);
 }finally{await w.close();}
});
test('active local execution cannot be resumed concurrently even with an overly broad installation observer',async()=>{
 const release=Promise.withResolvers(),entered=Promise.withResolvers();const w=await engineWorld({beforeRun:async()=>{entered.resolve();await release.promise;}});
 try{const {action}=await admitIntegration(w);w.engine.o.recoverAttempt=stopped;w.engine.pump();await entered.promise;await assert.rejects(()=>resume(w,w.engine,action),{code:'EFFECT_UNCERTAIN'});release.resolve();assert.equal((await finish(w.engine,action.actionId)).status,'succeeded');}finally{release.resolve();await w.close();}
});
