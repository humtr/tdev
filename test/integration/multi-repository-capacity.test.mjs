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
