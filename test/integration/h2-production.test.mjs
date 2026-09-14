import test from 'node:test';
import assert from 'node:assert/strict';
import {engineWorld} from '../fixtures/engine-world.mjs';

function validateRequest(w,work,id){return {op:'validate',requestId:id,workId:work.workId,expectedRevision:work.revision,generation:work.generation,expectedHead:w.baseHead,policyDigest:w.binding.policyDigest};}
function integrateRequest(w,work,id,preparedResultId){return {op:'integrate',requestId:id,workId:work.workId,expectedRevision:work.revision,generation:work.generation,expectedHead:w.baseHead,policyDigest:w.binding.policyDigest,...(preparedResultId?{preparedResultId}:{})};}
async function prepareMembers(w,n,prefix='h2'){
 const ids=[];
 for(let i=0;i<n;i++){const created=await w.create(prefix+'-create-'+i,prefix+'-'+i+'.txt','member '+i+'\n');ids.push(created.workId);}
 const validations=[];
 for(let i=0;i<n;i++){const work=await w.engine.work(w.principal,ids[i]);validations.push(await w.engine.admit(w.principal,validateRequest(w,work,prefix+'-validate-'+i)));}
 const actions=await w.finish(validations.map(row=>row.actionId));assert.ok(actions.every(action=>action.status==='succeeded'));
 return Promise.all(ids.map(id=>w.engine.work(w.principal,id)));
}
async function admitJoined(w,works,prefix='h2-integrate'){
 const input={apiVersion:1,items:works.map((work,i)=>integrateRequest(w,work,prefix+'-'+i)),waitMs:0};const response=await w.app.invoke(w.principal,'dev_work',input);assert.equal(response.ok,true);const items=response.data.items;assert.ok(items.every(item=>item.ok===true));return {input,items,actionIds:items.map(item=>item.receipt.actionId)};
}
function terminalCount(actions){return actions.filter(action=>['succeeded','failed','cancelled'].includes(action.status)).length;}

test('N=8 H2 selects one leader, performs one composed validation/effect/CAS, settles all members and follower observes the common effect',async()=>{
 const w=await engineWorld({h2Enabled:true,capacity:8});try{
  const works=await prepareMembers(w,8,'joined8'),before=w.validationRuns.length,joined=await admitJoined(w,works,'joined8-integrate');
  const actions=await w.finish(joined.actionIds);assert.ok(actions.every(action=>action.status==='succeeded'));assert.equal(new Set(actions.map(action=>action.resultId)).size,1);assert.equal(w.validationRuns.length,before+1);assert.equal(w.sends.length,1);
  assert.equal(w.ledger.transact(tx=>tx.all('SELECT * FROM effect').length),1);assert.equal(w.ledger.transact(tx=>tx.all('SELECT * FROM h2_member').length),8);assert.equal(w.ledger.transact(tx=>tx.reservations().length),0);
  for(const work of works){const current=await w.engine.work(w.principal,work.workId);assert.equal(current.disposition,'integrated');assert.equal(current.currentActionId,null);}
  const leader=actions.find(action=>action.h2?.role==='leader'),follower=actions.find(action=>action.h2?.role==='follower');assert.ok(leader&&follower);assert.ok(actions.every(action=>action.h2?.leaderActionId===leader.actionId&&action.h2?.effectId===leader.h2.effectId));
  const effect=w.ledger.transact(tx=>tx.getEffect(follower.actionId));assert.equal(effect.actionId,leader.actionId);const result=w.ledger.transact(tx=>tx.getPrepared(actions[0].resultId));assert.ok(result?.h2);const remote=await w.remote.resolve();assert.equal(remote.head,result.commitOid);const commit=await w.repository.readCommit(w.binding,result.commitOid);assert.deepEqual(commit.parents,[w.baseHead]);for(let i=0;i<8;i++)assert.ok(commit.source.entries.some(entry=>entry.path==='joined8-'+i+'.txt'));
  const observed=await w.app.invoke(w.principal,'dev_observe',{apiVersion:1,selector:{actionIds:[follower.actionId]},waitMs:0});assert.equal(observed.ok,true);assert.equal(observed.data.effects.length,1);assert.equal(observed.data.effects[0].effectId,effect.effectId);assert.equal(observed.data.results[0].integration.kind,'integrated');
  const repeated=await w.app.invoke(w.principal,'dev_work',joined.input);assert.equal(repeated.ok,true);assert.ok(repeated.data.items.every(item=>item.ok&&item.receipt.deduplicated===true));assert.equal(w.sends.length,1);
 }finally{await w.close();}
});

test('exact member predicates fall back: explicit result, N=1, overlap, and missing member validation never persist H2 selection',async()=>{
 const explicit=await engineWorld({h2Enabled:true,capacity:4});try{
  const works=await prepareMembers(explicit,2,'explicit');const result=explicit.ledger.transact(tx=>tx.all('SELECT record FROM prepared WHERE work_id=? ORDER BY rowid DESC LIMIT 1',works[0].workId)[0]);assert.ok(result);const prepared=JSON.parse(String(result.record)).resultId;
  const input={apiVersion:1,items:[integrateRequest(explicit,works[0],'explicit-i0',prepared),integrateRequest(explicit,works[1],'explicit-i1')],waitMs:0};const response=await explicit.app.invoke(explicit.principal,'dev_work',input);assert.equal(response.ok,true);assert.equal(explicit.ledger.transact(tx=>tx.all('SELECT * FROM h2_member').length),0);await explicit.finish(response.data.items.filter(x=>x.ok).map(x=>x.receipt.actionId));
 }finally{await explicit.close();}
 const single=await engineWorld({h2Enabled:true});try{const [work]=await prepareMembers(single,1,'single');const response=await single.app.invoke(single.principal,'dev_work',{apiVersion:1,items:[integrateRequest(single,work,'single-i')],waitMs:0});assert.equal(response.ok,true);assert.equal(single.ledger.transact(tx=>tx.all('SELECT * FROM h2_member').length),0);await single.finish([response.data.items[0].receipt.actionId]);}finally{await single.close();}
 const overlap=await engineWorld({h2Enabled:true,capacity:4});try{
  const c0=await overlap.create('overlap-c0','shared.txt','a\n'),c1=await overlap.create('overlap-c1','shared.txt','b\n'),ids=[c0.workId,c1.workId],validations=[];for(let i=0;i<2;i++){const work=await overlap.engine.work(overlap.principal,ids[i]);validations.push(await overlap.engine.admit(overlap.principal,validateRequest(overlap,work,'overlap-v'+i)));}await overlap.finish(validations.map(v=>v.actionId));const works=await Promise.all(ids.map(id=>overlap.engine.work(overlap.principal,id))),joined=await admitJoined(overlap,works,'overlap-i');assert.equal(overlap.ledger.transact(tx=>tx.all('SELECT * FROM h2_member').length),0);await overlap.finish(joined.actionIds);
 }finally{await overlap.close();}
 const missing=await engineWorld({h2Enabled:true,capacity:4});try{
  const a=await missing.create('missing-c0','missing-0.txt','a\n'),b=await missing.create('missing-c1','missing-1.txt','b\n');let wa=await missing.engine.work(missing.principal,a.workId),wb=await missing.engine.work(missing.principal,b.workId);const v=await missing.engine.admit(missing.principal,validateRequest(missing,wa,'missing-v0'));await missing.finish([v.actionId]);wa=await missing.engine.work(missing.principal,a.workId);const joined=await admitJoined(missing,[wa,wb],'missing-i');assert.equal(missing.ledger.transact(tx=>tx.all('SELECT * FROM h2_member').length),0);await missing.finish(joined.actionIds);
 }finally{await missing.close();}
});

test('authorization revoked after async checks is fenced inside sender reservation: no provider effect and frozen H2 effect is durably disarmed before ordinary fallback',async()=>{
 let world;let revoked=false;world=await engineWorld({h2Enabled:true,capacity:4,beforeSenderReserve:async()=>{if(!revoked){revoked=true;world.access.allowed=false;world.access.revision++;}}});try{
  const works=await prepareMembers(world,2,'revoke'),joined=await admitJoined(world,works,'revoke-i');const actions=await world.finish(joined.actionIds);assert.ok(actions.every(action=>action.status==='failed'||action.status==='cancelled'||action.status==='blocked'));assert.equal(world.sends.length,0);assert.equal(world.ledger.transact(tx=>tx.all('SELECT * FROM effect').length),0);assert.equal(world.ledger.transact(tx=>tx.all("SELECT key FROM meta WHERE key LIKE 'h2-disarmed:%'").length),1);assert.equal((await world.remote.resolve()).head,world.baseHead);
 }finally{await world.close();}
});

test('lost provider response reconciles the same effect without a second physical send',async()=>{
 let lost=true;const w=await engineWorld({h2Enabled:true,capacity:4,afterSend:async()=>{if(lost){lost=false;throw Error('lost response');}}});try{
  const works=await prepareMembers(w,2,'loss'),joined=await admitJoined(w,works,'loss-i');const actions=await w.finish(joined.actionIds);assert.ok(actions.every(action=>action.status==='succeeded'));assert.equal(w.sends.length,1);assert.equal(w.ledger.transact(tx=>tx.all('SELECT * FROM effect').length),1);
 }finally{await w.close();}
});

test('sender unknown blocks the whole tuple at 0/N; unrelated same-ref work extends C; later follower resume accepts the managed descendant and settles N/N without duplicate send',async()=>{
 let unknown=true;const w=await engineWorld({h2Enabled:true,capacity:4,senderObservation:(effect,sends)=>sends.some(row=>row.effectId===effect.effectId)?(unknown?{stopped:false,delivery:'unknown',state:'unknown'}:{stopped:true,delivery:'sent',state:'stopped'}):{stopped:true,delivery:'not_sent',state:'absent'}});try{
  const works=await prepareMembers(w,2,'unknown'),joined=await admitJoined(w,works,'unknown-i');let actions=await w.finish(joined.actionIds);assert.equal(terminalCount(actions),0);assert.ok(actions.every(action=>action.status==='blocked'));assert.equal(w.sends.length,1);const h2Head=(await w.remote.resolve()).head;assert.notEqual(h2Head,w.baseHead);
  const unrelated=await w.create('unrelated-c','unrelated.txt','later\n');let uw=await w.engine.work(w.principal,unrelated.workId),uv=await w.engine.admit(w.principal,validateRequest({...w,baseHead:h2Head},uw,'unrelated-v'));await w.finish([uv.actionId]);uw=await w.engine.work(w.principal,unrelated.workId);const ui=await w.engine.admit(w.principal,{...integrateRequest({...w,baseHead:h2Head},uw,'unrelated-i'),expectedHead:h2Head});const [ua]=await w.finish([ui.actionId]);assert.equal(ua.status,'succeeded');const descendant=(await w.remote.resolve()).head;assert.notEqual(descendant,h2Head);assert.equal(w.sends.length,2);
  unknown=false;const follower=actions.find(action=>action.h2?.role==='follower');const fw=await w.engine.work(w.principal,follower.workId);const resume=await w.engine.admit(w.principal,{op:'resume',requestId:'unknown-resume',workId:fw.workId,expectedRevision:fw.revision,actionId:follower.actionId});assert.equal(resume.status,'succeeded');actions=joined.actionIds.map(id=>w.ledger.transact(tx=>tx.getAction(id)));assert.ok(actions.every(action=>action.status==='succeeded'));assert.equal(w.sends.length,2);assert.equal((await w.remote.resolve()).head,descendant);
 }finally{await w.close();}
});

test('settlement write fault rolls back to durable 0/N; exact tuple recovery later settles N/N',async()=>{
 let world,unknown=false,faulted=false;world=await engineWorld({h2Enabled:true,capacity:4,senderObservation:(effect,sends)=>sends.some(row=>row.effectId===effect.effectId)?(unknown?{stopped:false,delivery:'unknown',state:'unknown'}:{stopped:true,delivery:'sent',state:'stopped'}):{stopped:true,delivery:'not_sent',state:'absent'},h2Fault:point=>{if(!faulted&&point.startsWith('settlement.after-action-')){faulted=true;unknown=true;throw Error('settlement crash injection');}}});try{
  const works=await prepareMembers(world,2,'settle'),joined=await admitJoined(world,works,'settle-i');let actions=await world.finish(joined.actionIds);assert.equal(faulted,true);assert.equal(terminalCount(actions),0);assert.ok(actions.every(action=>action.status==='blocked'));assert.equal(world.ledger.transact(tx=>tx.all("SELECT record FROM work WHERE disposition='integrated'").length),0);
  unknown=false;const follower=actions.find(action=>action.h2?.role==='follower');const fw=await world.engine.work(world.principal,follower.workId);await world.engine.admit(world.principal,{op:'resume',requestId:'settle-resume',workId:fw.workId,expectedRevision:fw.revision,actionId:follower.actionId});actions=joined.actionIds.map(id=>world.ledger.transact(tx=>tx.getAction(id)));assert.equal(terminalCount(actions),2);assert.ok(actions.every(action=>action.status==='succeeded'));assert.equal(world.sends.length,1);
 }finally{await world.close();}
});

test('unrelated work wins H CAS before H2 sender: all H2 members get the same CONTENDED_REF and remain open',async()=>{
 let world,rivalWork,rivalTriggered=false;world=await engineWorld({h2Enabled:true,capacity:8,beforeSenderReserve:async()=>{if(rivalTriggered)return;rivalTriggered=true;const current=await world.engine.work(world.principal,rivalWork.workId);const admission=await world.engine.admit(world.principal,integrateRequest(world,current,'rival-i'));const [action]=await world.finish([admission.actionId]);assert.equal(action.status,'succeeded');}});try{
  const h2=await prepareMembers(world,2,'stale');const [rival]=await prepareMembers(world,1,'rival');rivalWork=rival;const joined=await admitJoined(world,h2,'stale-i');const actions=await world.finish(joined.actionIds);assert.ok(actions.every(action=>action.status==='failed'&&action.errorCode==='CONTENDED_REF'));for(const work of h2){const current=await world.engine.work(world.principal,work.workId);assert.equal(current.disposition,'open');assert.equal(current.currentActionId,null);}assert.equal(world.sends.length,2);
 }finally{await world.close();}
});
