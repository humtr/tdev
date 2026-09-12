import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {engineWorld} from '../fixtures/engine-world.mjs';
import {Ledger} from '../../src/storage/ledger.mjs';
import {DevelopmentEngine} from '../../src/runtime/engine.mjs';
const request=(w,work,op='validate',requestId='validate')=>({op,requestId,workId:work.workId,expectedRevision:work.revision,generation:work.generation,expectedHead:w.baseHead,policyDigest:w.binding.policyDigest});
async function finish(engine,actionId){engine.pump();for(let i=0;i<2000;i++){const a=engine.ledger.transact(tx=>tx.getAction(actionId));if(['succeeded','failed','cancelled','blocked'].includes(a.status)&&!engine.running.has(actionId))return a;await delay(10);}throw Error('Bounded recovery test deadline');}
async function held(w){const created=await w.create('create','recovery.mjs','export const recovered=true;\n');const work=await w.engine.work(w.principal,created.workId);const admitted=await w.engine.admit(w.principal,request(w,work));const selected=w.engine.coordinator.takeReady();assert.equal(selected.action.actionId,admitted.actionId);return {...selected,work:await w.engine.work(w.principal,work.workId)};}
const resume=(h,requestId='resume')=>({op:'resume',requestId,workId:h.work.workId,expectedRevision:h.work.revision,actionId:h.action.actionId});
test('a real SQLite close/reopen adopts observer identity and resumes the same logical action',async()=>{
 const w=await engineWorld();let ledger,engine;try{
  const h=await held(w),oldTuple=structuredClone(h.attempt);w.ledger.close();
  ledger=new Ledger(join(w.root,'ledger.sqlite'),w.binding);engine=new DevelopmentEngine({...w.engineOptions,ledger,attemptStopped:async()=>true});
  assert.notEqual(ledger.ownerEpoch,oldTuple.ownerEpoch);assert.equal(ledger.transact(tx=>tx.getAction(h.action.actionId)).status,'blocked');
  assert.deepEqual({...ledger.transact(tx=>tx.retainedAttempt(oldTuple.attemptId)).attempt},oldTuple);
  assert.throws(()=>engine.coordinator.settle(oldTuple,oldTuple.ownerEpoch,'succeeded',{stopped:true,effectResolved:true}),{code:'STALE_REVISION'});
  const intent=resume(h),admission=await engine.admit(w.principal,intent);assert.equal(admission.workId,h.work.workId);
  assert.equal((await engine.admit(w.principal,intent)).deduplicated,true);
  const action=await finish(engine,h.action.actionId);assert.equal(action.status,'succeeded');assert.equal(action.attempt,'2');
  assert.equal(ledger.transact(tx=>tx.getWork(h.work.workId)).generation,h.work.generation);
  assert.equal(w.validationRuns.length,1);assert.equal(ledger.transact(tx=>tx.reservations()).length,0);
  assert.equal((await engine.admit(w.principal,intent)).deduplicated,true);
 }finally{if(engine){engine.drain();await Promise.allSettled([...engine.running.values()]);}ledger?.close();await w.close();}
});
test('lost push response preserves its effect while unrelated work extends canonical source',async()=>{
 let lose=true,senderEnded=false;const w=await engineWorld({afterSend:async()=>{if(lose){lose=false;throw Error('Injected response loss');}}});try{
  const created=await w.create('create-a','a.mjs','export const a=1;\n');const work=await w.engine.work(w.principal,created.workId);
  const a=await w.engine.admit(w.principal,request(w,work,'integrate','integrate-a'));assert.equal((await finish(w.engine,a.actionId)).status,'blocked');
  const original=w.ledger.transact(tx=>tx.getEffect(a.actionId));assert.ok(original);w.engine.o.senderStopped=async effect=>effect.effectId!==original.effectId||senderEnded;
  const blockedWork=await w.engine.work(w.principal,work.workId);await w.engine.admit(w.principal,resume({action:{actionId:a.actionId},work:blockedWork},'resume-a-observe'));
  assert.equal(w.ledger.transact(tx=>tx.getAction(a.actionId)).status,'blocked');assert.equal(w.sends.length,1);
  const createdB=await w.create('create-b','b.mjs','export const b=2;\n'),workB=await w.engine.work(w.principal,createdB.workId);
  const b=await w.engine.admit(w.principal,{...request(w,workB,'integrate','integrate-b'),expectedHead:original.commitOid});assert.equal((await finish(w.engine,b.actionId)).status,'succeeded');
  senderEnded=true;await w.engine.admit(w.principal,resume({action:{actionId:a.actionId},work:blockedWork},'resume-a-finalize'));
  const recovered=w.ledger.transact(tx=>tx.getAction(a.actionId));assert.equal(recovered.status,'succeeded');assert.equal(recovered.attempt,'1');
  assert.deepEqual(w.ledger.transact(tx=>tx.getEffect(a.actionId)),original);assert.equal(w.sends.length,2);assert.equal(w.validationRuns.length,2);
  const observation=w.engine.metadata('effect-observation:'+a.actionId);assert.equal(observation.kind,'integrated');assert.notEqual(observation.observedHead,original.commitOid);
 }finally{await w.close();}
});
test('changed cancellation invalidates a previously inspected recovery plan',async()=>{
 const w=await engineWorld();try{
  const h=await held(w);w.engine.coordinator.settle(h.attempt,w.ledger.ownerEpoch,'blocked',{stopped:true,effectResolved:true});
  const plan=await w.engine.recovery.plan(w.principal,h.action.actionId,h.work.revision);assert.equal(plan.mode,'retry');
  w.engine.store('cancel:'+h.action.actionId,true);
  assert.throws(()=>w.ledger.transact(tx=>w.engine.recovery.apply(tx,plan,w.principal)),{code:'STALE_REVISION'});
  await w.engine.admit(w.principal,resume(h));assert.equal(w.ledger.transact(tx=>tx.getAction(h.action.actionId)).status,'cancelled');assert.equal(w.profileRuns.length,0);
 }finally{await w.close();}
});
test('expired original deadline cancels instead of manufacturing a renewed execution intent',async()=>{
 const w=await engineWorld();try{
  const h=await held(w);w.engine.coordinator.settle(h.attempt,w.ledger.ownerEpoch,'blocked',{stopped:true,effectResolved:true});
  const originalDeadline=h.action.deadline;w.engine.now=()=>originalDeadline+1;
  await w.engine.admit(w.principal,resume(h));const action=w.ledger.transact(tx=>tx.getAction(h.action.actionId));
  assert.equal(action.status,'cancelled');assert.equal(action.deadline,originalDeadline);assert.equal(action.attempt,'1');assert.equal(w.profileRuns.length,0);
 }finally{await w.close();}
});
test('resume requires the original operation grant, not only work-write permission',async()=>{
 const w=await engineWorld();try{
  const h=await held(w);w.engine.coordinator.settle(h.attempt,w.ledger.ownerEpoch,'blocked',{stopped:true,effectResolved:true});
  w.access.allowed=false;await assert.rejects(()=>w.engine.admit(w.principal,resume(h)),{code:'FORBIDDEN'});
  assert.equal(w.ledger.transact(tx=>tx.getAction(h.action.actionId)).status,'blocked');assert.equal(w.ledger.transact(tx=>tx.lookupRequest(w.principal.subject,w.binding.bindingEpoch,'resume')),null);
 }finally{await w.close();}
});
test('unproven old execution blocks only its retained work and does not increment its attempt',async()=>{
 const w=await engineWorld({capacity:2});try{
  const h=await held(w);w.engine.coordinator.settle(h.attempt,w.ledger.ownerEpoch,'blocked',{stopped:false,effectResolved:false});w.engine.o.attemptStopped=async()=>false;
  await w.engine.admit(w.principal,resume(h));assert.equal(w.ledger.transact(tx=>tx.getAction(h.action.actionId)).attempt,'1');
  const b=await w.create('independent','independent.mjs','export const independent=true;\n');const work=await w.engine.work(w.principal,b.workId),a=await w.engine.admit(w.principal,request(w,work,'validate','independent-validate'));
  assert.equal((await finish(w.engine,a.actionId)).status,'succeeded');assert.equal(w.ledger.transact(tx=>tx.reservations()).length,1);
 }finally{await w.close();}
});
