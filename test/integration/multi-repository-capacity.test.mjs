import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {engineWorld} from '../fixtures/engine-world.mjs';
import {InstallationExecutionArbiter} from '../../src/runtime/execution-arbiter.mjs';

async function validate(w,requestId){const created=await w.create(requestId+'-create',requestId+'.txt','candidate\n'),work=await w.engine.work(w.principal,created.workId);return w.engine.admit(w.principal,{op:'validate',requestId,workId:work.workId,expectedRevision:work.revision,generation:work.generation,expectedHead:w.baseHead,policyDigest:w.binding.policyDigest});}

test('two binding-local engines share one installation execution capacity',async()=>{
 const arbiter=new InstallationExecutionArbiter(1),shared={active:0,peak:0};
 const beforeRun=async()=>{shared.active++;shared.peak=Math.max(shared.peak,shared.active);await delay(30);shared.active--;};
 const a=await engineWorld({repositoryId:'repo-a',capacity:1,arbiter,beforeRun}),b=await engineWorld({repositoryId:'repo-b',capacity:1,arbiter,beforeRun});
 try{
  const [aa,bb]=await Promise.all([validate(a,'validate-a'),validate(b,'validate-b')]);a.engine.pump();b.engine.pump();
  const [ar,br]=await Promise.all([a.finish([aa.actionId]),b.finish([bb.actionId])]);
  assert.equal(ar[0].status,'succeeded');assert.equal(br[0].status,'succeeded');assert.equal(shared.peak,1);assert.equal(arbiter.held(),0);
 }finally{await a.close();await b.close();}
});

test('H2 retry admission cannot oversubscribe another binding and exact replacement is not double-counted',async()=>{
 const arbiter=new InstallationExecutionArbiter(1),a=await engineWorld({repositoryId:'repo-a',capacity:1,arbiter}),b=await engineWorld({repositoryId:'repo-b',capacity:1,arbiter});let heldA=null;
 try{
  const blocked=await validate(b,'blocked-b'),reservedB=b.engine.coordinator.takeReady();assert.equal(reservedB.action.actionId,blocked.actionId);b.engine.coordinator.settle(reservedB.attempt,b.ledger.ownerEpoch,'blocked',{stopped:true,effectResolved:false});
  const busy=await validate(a,'busy-a');heldA=a.engine.coordinator.takeReady();assert.equal(heldA.action.actionId,busy.actionId);assert.equal(arbiter.available(),false);assert.equal(arbiter.available(heldA.attempt.attemptId),true);assert.equal(arbiter.available('foreign-attempt'),false);
  const work=await b.engine.work(b.principal,reservedB.action.workId);b.engine.h2.selected=()=>true;b.engine.h2.recoveryPlan=async()=>({h2:true,mode:'retry',selection:{fixture:true},stamp:'fixture',actionId:reservedB.action.actionId});b.engine.h2.frameIn=()=>({reservation:null});let applied=false;b.engine.h2.applyRecovery=()=>{applied=true;throw Error('capacity fence failed');};
  await assert.rejects(()=>b.engine.admit(b.principal,{op:'resume',requestId:'resume-b',workId:work.workId,expectedRevision:work.revision,actionId:reservedB.action.actionId}),{code:'CAPACITY_REJECTED'});assert.equal(applied,false);assert.equal(b.ledger.transact(tx=>tx.reservations().length),0);assert.equal(b.ledger.transact(tx=>tx.getAction(reservedB.action.actionId)).status,'blocked');
  const direct={principal:b.principal.subject,requestId:'fence-dedup',operation:'fixture',intent:{fixture:true},authorize:async()=>{},deadline:Date.now()+60000,inline:true,beforeMutate:()=>{},mutate:()=>null};await b.engine.coordinator.admit(direct);const replay=await b.engine.coordinator.admit({...direct,beforeMutate:()=>{throw Error('retained duplicate ran capacity fence');}});assert.equal(replay.deduplicated,true);
 }finally{if(heldA)try{a.engine.coordinator.settle(heldA.attempt,a.ledger.ownerEpoch,'blocked',{stopped:true,effectResolved:false});}catch{}await a.close();await b.close();}
});
