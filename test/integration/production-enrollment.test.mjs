import test from 'node:test';
import assert from 'node:assert/strict';
import {productionFixture,D,O} from './production-fixture.mjs';
import {canonicalJson,recordDigest,parseRecord} from '../../src/contracts/canonical.mjs';
import {verifyProductionEnrollment,assertProductionEnrollment} from '../../src/runtime/production-enrollment.mjs';
test('separate production enrollment requires native authenticated retained completions for every fixed profile',async()=>{const f=await productionFixture();try{const p=await f.enrolled();assert.equal(p.sealDigest,f.enrollment.sealDigest);assertProductionEnrollment(p);assert.throws(()=>assertProductionEnrollment(structuredClone({...p,receipts:null,definition:null})));assert.ok(Object.isFrozen(p.enrollment.intent.identities));for(const ref of f.enrollment.proofs)f.sessions.cancelSession(ref.sessionId);assert.equal((await f.enrolled()).sealDigest,p.sealDigest,'normal retirement preserves earlier completed proof');f.restart();assert.equal((await f.enrolled()).sealDigest,p.sealDigest,'new native owner verifies the same retained proof');}finally{await f.close();}});
test('wrong installation/repository/epoch/provider/source/controller and self-rehashed records cannot enroll',async()=>{const f=await productionFixture();try{for(const [name,mutate] of Object.entries({installation:e=>e.intent.installationId='other',repository:e=>e.intent.repositoryId='other',epoch:e=>e.intent.bindingEpoch='2',provider:e=>e.intent.providerRepositoryId='999',owner:e=>e.intent.repositoryOwnerId='999',commit:e=>e.intent.approvedCommitOid=O(3),tree:e=>e.intent.approvedSourceTreeOid=O(3),manifest:e=>e.intent.approvedSourceManifestDigest=D(3),runner:e=>e.intent.identities.trustedRunnerDigest=D(3),controller:e=>e.intent.identities.controllerDigest=D(3),workflow:e=>e.intent.identities.workflowDigest=D(3),engine:e=>e.intent.engineDigest=D(3),dependency:e=>e.intent.dependencyArtifactDigest=D(3),seccomp:e=>e.intent.identities.seccompDigest=D(3),runtime:e=>e.intent.runtime.bundleDigest=D(3),qualification:e=>e.intent.qualificationSealDigest=D(3)})){const e=structuredClone(f.enrollment);mutate(e);const {sealDigest,...body}=e;e.sealDigest=recordDigest('dev2.production-enrollment.v1',body);await assert.rejects(verifyProductionEnrollment(e,f.expected()),undefined,name);}}finally{await f.close();}});
test('assignment/lease/session/result/profile/run/attempt/outer/context substitution fails closed',async()=>{const f=await productionFixture();try{for(const field of ['assignmentId','leaseId','sessionId','resultId','profileDigest','runId','runAttempt','outerReceiptDigest','contextDigest']){const e=structuredClone(f.enrollment);e.proofs[0][field]=field.endsWith('Digest')?D(0):'wrong';const {sealDigest,...body}=e;e.sealDigest=recordDigest('dev2.production-enrollment.v1',body);await assert.rejects(verifyProductionEnrollment(e,f.expected()),undefined,field);}const e=structuredClone(f.enrollment);e.proofs[1]=e.proofs[0];const {sealDigest,...body}=e;e.sealDigest=recordDigest('dev2.production-enrollment.v1',body);await assert.rejects(verifyProductionEnrollment(e,f.expected()));}finally{await f.close();}});
test('qualification-only or fixture-only JSON cannot substitute for authenticated native completion',async()=>{const f=await productionFixture();try{for(const fake of [{kind:'dev2-managed-enrollment',productionValidation:false},{...f.enrollment,fixture:true},{...f.enrollment,productionValidation:true}])await assert.rejects(verifyProductionEnrollment(fake,f.expected()));const ref=f.enrollment.proofs[0];f.ledger.transact(tx=>tx.run('DELETE FROM meta WHERE key=?','managed.completion:'+ref.assignmentId));await assert.rejects(f.enrolled(),{code:'VALIDATION_FAILED'});}finally{await f.close();}});
test('changed output bytes and partial upload never grant production capability',async()=>{const f=await productionFixture();try{const expected=f.expected(),get=expected.objects.get.bind(expected.objects);expected.objects={...expected.objects,get:async d=>{const bytes=await get(d);return d===f.enrollment.proofs[2].outerReceiptDigest?Buffer.from('{}'):bytes;}};await assert.rejects(verifyProductionEnrollment(f.enrollment,expected));const ref=f.enrollment.proofs[2];f.ledger.transact(tx=>tx.run("UPDATE managed_artifact SET state='uploading' WHERE assignment_id=?",ref.assignmentId));await assert.rejects(f.enrolled(),{code:'INTEGRITY_FAILURE'});}finally{await f.close();}});
test('cancelled/failed/stale provenance and modified provider workflow cannot be restored from snapshots',async()=>{for(const mutate of [c=>c.assignment.cancelRequested=true,c=>c.session.cancelRequested=true,c=>c.session.state='closed',c=>c.session.run.status='completed',c=>c.session.run.workflowPath='fixture.yml',c=>c.session.run.repositoryId='999',c=>c.session.run.headSha='9'.repeat(40),c=>c.launchIdentity=D(0),c=>c.assignment.result.exitCode=1]){const f=await productionFixture();try{const ref=f.enrollment.proofs[0];f.ledger.transact(tx=>{const row=tx.get('SELECT value FROM meta WHERE key=?','managed.completion:'+ref.assignmentId),c=parseRecord(row.value);mutate(c);tx.run('UPDATE meta SET value=? WHERE key=?',canonicalJson(c),'managed.completion:'+ref.assignmentId);});await assert.rejects(f.enrolled());}finally{await f.close();}}});

test('valid old provider completions cannot enroll a newly retained private commissioning intent',async()=>{
 const f=await productionFixture();try{
  await f.enrolled();const e=structuredClone(f.enrollment);e.intent.commissioningId='new-private-commissioning';
  f.ledger.transact(tx=>tx.run('INSERT INTO meta VALUES(?,?)','production.commissioning:'+e.intent.commissioningId,canonicalJson(e.intent)));
  const {sealDigest,...body}=e;e.sealDigest=recordDigest('dev2.production-enrollment.v1',body);
  await assert.rejects(verifyProductionEnrollment(e,f.expected()));
  assert.equal((await f.enrolled()).sealDigest,f.enrollment.sealDigest,'immutable original completion remains valid only for its original intent');
 }finally{await f.close();}
});
test('a valid receipt from another retained fixture assignment cannot be paired with the original prepared result',async()=>{
 const f=await productionFixture();try{
  const {executionIdentity}=await import('../../src/execution/payload.mjs');
  const profile=f.definition.policy.required()[0],created=f.create('independent-core-result',profile),sid=f.enrollment.proofs[0].sessionId;
  const identity=f.activate(sid),payload=Buffer.from('separate test assignment'),payloadDigest=await f.objects.put(payload);
  const input={attempt:created.attempt,resultId:created.result.resultId,profileDigest:profile.digest,sourceManifest:f.source.manifestDigest,payloadDigest,executionDigest:executionIdentity(created.result.execution),deadline:Date.now()+600000};
  const assignment=f.sessions.offer(identity,input,[{digest:payloadDigest,size:payload.length}]);
  const {execution}=await f.complete(assignment,profile),{proof}=await f.receiptPort().verify(created.result,created.attempt,profile,execution);
  const e=structuredClone(f.enrollment),originalResult=e.proofs[0].resultId;
  e.proofs[0]={resultId:originalResult,assignmentId:assignment.assignmentId,sessionId:sid,runId:assignment.runId,runAttempt:'1',leaseId:assignment.leaseId,profileDigest:profile.digest,contextDigest:proof.contextDigest,outerReceiptDigest:proof.outerReceiptDigest};
  const {sealDigest,...body}=e;e.sealDigest=recordDigest('dev2.production-enrollment.v1',body);
  await assert.rejects(verifyProductionEnrollment(e,f.expected()));
  assert.equal((await f.enrolled()).sealDigest,f.enrollment.sealDigest);
 }finally{await f.close();}
});
test('unchanged valid outer receipt does not authorize substituted finite build artifact bytes',async()=>{
 const f=await productionFixture();try{
  await f.enrolled();const outer=parseRecord(await f.objects.get(f.enrollment.proofs[2].outerReceiptDigest));
  const artifact=outer.outputs.find(value=>value.name==='device.cjs');assert.ok(artifact);
  const expected=f.expected(),get=f.objects.get.bind(f.objects);let substituted=false;
  expected.objects={...f.objects,get:async d=>{if(d===artifact.digest){substituted=true;return Buffer.from('changed stored device bytes');}return get(d);}};
  await assert.rejects(verifyProductionEnrollment(f.enrollment,expected));assert.equal(substituted,true);
 }finally{await f.close();}
});
