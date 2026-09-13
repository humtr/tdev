import test from 'node:test';
import assert from 'node:assert/strict';
import {productionFixture} from './production-fixture.mjs';
import {verifyProductionEnrollment} from '../../src/runtime/production-enrollment.mjs';
import {recordDigest} from '../../src/contracts/canonical.mjs';

function reseal(e){const {sealDigest,...body}=e;return {...body,sealDigest:recordDigest('dev2.production-enrollment.v1',body)};}

test('review: valid existing cross-assignment identities cannot be spliced into a different proof',async()=>{
 const f=await productionFixture();try{
  for(const field of ['assignmentId','leaseId','sessionId','resultId','runId','outerReceiptDigest','contextDigest']){
   const e=structuredClone(f.enrollment);e.proofs[0][field]=e.proofs[1][field];
   await assert.rejects(verifyProductionEnrollment(reseal(e),f.expected()),undefined,field);
  }
  const e=structuredClone(f.enrollment);e.proofs[0]={...e.proofs[1],profileDigest:e.proofs[0].profileDigest};
  await assert.rejects(verifyProductionEnrollment(reseal(e),f.expected()));
 }finally{await f.close();}
});

test('review: unchanged valid proof cannot bless different installed bytes or copied helper admission',async()=>{
 const f=await productionFixture();try{
  const expected=f.expected(),runtime={...f.runtime,bundleDigest:'sha256:'+'a'.repeat(64)};
  await assert.rejects(verifyProductionEnrollment(f.enrollment,{...expected,runtime}));
  await assert.rejects(verifyProductionEnrollment(f.enrollment,{...expected,runtime,admission:{...f.intent,runtime,baseline:false}}));
 }finally{await f.close();}
});

test('review: owner turnover during asynchronous artifact verification cannot return old-owner capability',async()=>{
 const f=await productionFixture();try{
  const expected=f.expected(),get=f.objects.get.bind(f.objects);let turned=false;
  expected.objects={get:async digest=>{const bytes=await get(digest);if(!turned){turned=true;f.restart();}return bytes;}};
  await assert.rejects(verifyProductionEnrollment(f.enrollment,expected));assert.equal(turned,true);
  assert.equal((await f.enrolled()).sealDigest,f.enrollment.sealDigest,'fresh owner can independently reverify retained completion');
 }finally{await f.close();}
});

test('review: native commissioning intent deletion prevents self-rehashed enrollment restoration',async()=>{
 const f=await productionFixture();try{
  f.ledger.transact(tx=>tx.run('DELETE FROM meta WHERE key=?','production.commissioning:'+f.intent.commissioningId));
  const e=structuredClone(f.enrollment);e.intent.commissioningId='source-controlled-replacement';
  await assert.rejects(verifyProductionEnrollment(reseal(e),f.expected()));
  await assert.rejects(f.enrolled());
 }finally{await f.close();}
});

test('review: substituted actual release artifact bytes fail enrollment even with unchanged native receipt',async()=>{
 const f=await productionFixture();try{
  const expected=f.expected(),get=f.objects.get.bind(f.objects),ref=f.enrollment.proofs[2];
  const assignment=f.ledger.transact(tx=>tx.get('SELECT record FROM managed_assignment WHERE assignment_id=?',ref.assignmentId));
  const artifact=JSON.parse(assignment.record).result.artifacts.find(d=>d!==ref.outerReceiptDigest);
  expected.objects={get:async digest=>digest===artifact?Buffer.from('altered stored bytes'):get(digest)};
  await assert.rejects(verifyProductionEnrollment(f.enrollment,expected));
  assert.equal((await f.enrolled()).sealDigest,f.enrollment.sealDigest,'unaltered object store remains independently verifiable');
 }finally{await f.close();}
});

test('review: production enrollment cannot reuse a still-warm commissioning-sealed provider session',async()=>{
 const f=await productionFixture();try{
  const probeSessions=new Set(f.enrollment.proofs.map(p=>p.sessionId));f.useProductionSeal();
  const profile=f.definition.policy.required()[0],work=f.create('production-after-probes',profile);
  const d=await f.pool.dispatch(work.result,work.attempt,profile);
  assert.equal(probeSessions.has(d.sessionId),false,'HostedSession pins its first seal, so same-source commissioning sessions are incompatible');
  const identity=f.activate(d.sessionId),a=f.pool.poll(identity).assignment;
  assert.equal(a.sealDigest,f.enrollment.sealDigest);await f.complete(a,profile);
  assert.deepEqual(await f.pool.dispatch(work.result,work.attempt,profile),f.pool.retained(d.assignmentId));
  f.ledger.transact(tx=>tx.releaseAttempt(work.attempt.attemptId));
  const next=f.create('production-warm-reuse',profile),nextDispatch=await f.pool.dispatch(next.result,next.attempt,profile);
  assert.equal(nextDispatch.sessionId,d.sessionId,'same-seal completed production session remains reusable');
  assert.equal((await f.enrolled()).sealDigest,f.enrollment.sealDigest,'probe completion evidence remains intact');
 }finally{await f.close();}
});

test('review: direct authenticated offer cannot change a physical session seal after commissioning',async()=>{
 const f=await productionFixture();try{
  f.useProductionSeal();const profile=f.definition.policy.required()[0],work=f.create('mixed-seal-offer',profile);
  const d=await f.pool.dispatch(work.result,work.attempt,profile);
  const identity=f.activate(f.enrollment.proofs[0].sessionId);
  assert.throws(()=>f.sessions.offer(identity,d.input,d.objects),e=>e.code==='EXECUTION_UNAVAILABLE');
  assert.equal(f.pool.assignment(d.assignmentId),null);
 }finally{await f.close();}
});
