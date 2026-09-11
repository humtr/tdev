import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {engineWorld} from '../fixtures/engine-world.mjs';
/** Real disposable Git and full-source profile executions. This is an internal
 * contention observation, not a tdev/tmcp comparative performance gate. */
test('default eight-way same-ref workload measures all failed speculation and finishes exact validated commits', {timeout:120000},async t=>{
 let first=0;const gate=Promise.withResolvers();
 const w=await engineWorld({beforeRun:async(_result,_attempt,profile)=>{if(profile.profileId==='core'&&first<8){first++;if(first===8)gate.resolve();await gate.promise;}}});
 const begin=performance.now();try{
  const works=await Promise.all(Array.from({length:8},(_,i)=>w.create('c'+i,'independent/'+i+'.txt','change '+i+'\n')));
  let pending=works.map(x=>x.workId),round=0;const attempts=[],rounds=[];
  while(pending.length&&round<8){
   const start=performance.now(),head=(await w.remote.resolve(w.binding)).head;
   const admissions=await Promise.all(pending.map(async(workId,i)=>{const work=await w.engine.work(w.principal,workId);return w.engine.admit(w.principal,{op:'integrate',requestId:'round'+round+'_'+i,workId,expectedRevision:work.revision,generation:work.generation,expectedHead:head,policyDigest:w.binding.policyDigest});}));
   const results=await w.finish(admissions.map(a=>a.actionId));
   for(let i=0;i<results.length;i++)attempts.push({workId:pending[i],actionId:results[i].actionId,status:results[i].status,errorCode:results[i].errorCode,resultId:results[i].resultId});
   const succeeded=results.filter(r=>r.status==='succeeded').length;assert.ok(succeeded>=1,'One actual ref CAS must make progress');
   for(const r of results)assert.ok(r.status==='succeeded'||r.status==='failed'&&['CONTENDED_REF','STALE_BASE'].includes(r.errorCode),JSON.stringify(r));
   rounds.push({round,admitted:pending.length,succeeded,elapsedMs:Math.round(performance.now()-start)});
   pending=pending.filter((_,i)=>results[i].status!=='succeeded');round++;
  }
  assert.equal(pending.length,0);const head=(await w.remote.resolve(w.binding)).head;const current=await w.repository.readCommit(w.binding,head);
  for(let i=0;i<8;i++){const entry=current.source.entries.find(e=>e.path==='independent/'+i+'.txt');assert.ok(entry);assert.equal((await w.repository.blob(entry.blobOid)).toString(),'change '+i+'\n');}
  const integrated=w.ledger.transact(tx=>tx.all("SELECT record FROM work WHERE disposition='integrated'"));assert.equal(integrated.length,8);
  const runs=w.ledger.transact(tx=>tx.all('SELECT record FROM validation'));const measured={scope:'real-local-same-ref-full-validation',comparativeSuperiority:false,actualChatGPT:false,productionSandbox:false,elapsedMs:Math.round(performance.now()-begin),works:8,rounds,attempts,validationRuns:runs.length,profileProcessRuns:w.processActivity.spans.length,peakLiveProfileProcesses:w.processActivity.peak,peakReservedExecutions:w.parallel.peak,refSendAttempts:w.sends.length,validationAmplification:runs.length/8,finalHead:head,childSpans:w.processActivity.spans};
  t.diagnostic('SAME_REF_EVIDENCE '+JSON.stringify(measured));
  assert.equal(w.parallel.peak,8);assert.ok(w.processActivity.peak>=2,'Multiple real profile processes must overlap');
  assert.equal(w.processActivity.spans.every(s=>s.exitCode===0),true);assert.ok(runs.length>=8);

 }finally{gate.resolve();await w.close();}
});
