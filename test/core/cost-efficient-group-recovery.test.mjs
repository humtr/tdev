import test from 'node:test';
import assert from 'node:assert/strict';
import {freezePublicationGroup,publicationFenceHolds,reconcilePublicationGroup,settlePublicationGroup} from '../../bench/cost-efficient-group-recovery.mjs';
const head='sha1:'+'a'.repeat(40),commit='sha1:'+'b'.repeat(40),policy='sha256:'+'c'.repeat(64),composedValidationId='sha256:'+'d'.repeat(64);
function member(i){const h=((i%8)+1).toString(16);return {workId:'w'+i,actionId:'a'+i,requestId:'r'+i,generation:'0',revision:'1',preparedResultId:'p'+i,candidateValidationId:'sha256:'+h.repeat(64),candidateTreeOid:'sha1:'+h.repeat(40),candidateManifestDigest:'sha256:'+h.repeat(64),expectedHead:head,policyDigest:policy,validated:true,cancelRequested:false,disposition:'open',currentActionId:'a'+i};}
function input(members=Array.from({length:8},(_,i)=>member(i))){return {repositoryId:'repo',bindingEpoch:'1',ref:'refs/heads/dev-2',currentHead:head,expectedHead:head,commitOid:commit,composedResultId:'composed',composedValidationId,policyDigest:policy,members};}

test('same-batch explicit integrate intents freeze one deterministic immutable publication identity without a new owner',()=>{
 const forward=freezePublicationGroup(input()),reverse=freezePublicationGroup(input([...input().members].reverse()));assert.equal(forward.kind,'frozen');assert.equal(reverse.kind,'frozen');assert.equal(forward.publicationIdentity,reverse.publicationIdentity);assert.equal(forward.leaderActionId,'a0');assert.equal(forward.members.length,8);assert.equal(new Set(forward.members.map(m=>m.workId)).size,8);
});

test('late head, cancellation, missing validation and duplicate identities fail closed before any shared effect',()=>{
 assert.deepEqual(freezePublicationGroup({...input(),currentHead:'sha1:'+'f'.repeat(40)}),{kind:'fallback',reason:'late_head_movement',fallback:'d0003_per_work'});
 const cancelled=member(0);cancelled.cancelRequested=true;assert.deepEqual(freezePublicationGroup(input([cancelled,member(1)])),{kind:'fallback',reason:'cancelled_before_freeze',fallback:'d0003_per_work'});
 const unvalidated=member(0);unvalidated.validated=false;assert.deepEqual(freezePublicationGroup(input([unvalidated,member(1)])),{kind:'fallback',reason:'unvalidated_member',fallback:'d0003_per_work'});
 const duplicate=member(1);duplicate.workId='w0';assert.deepEqual(freezePublicationGroup(input([member(0),duplicate])),{kind:'fallback',reason:'duplicate_member_identity',fallback:'d0003_per_work'});
});

test('member revision or candidate evidence drift invalidates the group before publication intent',()=>{
 const group=freezePublicationGroup(input());assert.equal(group.kind,'frozen');const current=input().members.map(m=>({...m}));assert.equal(publicationFenceHolds(group,current),true);current[3].revision='2';assert.equal(publicationFenceHolds(group,current),false);assert.throws(()=>settlePublicationGroup(group,{kind:'retryable'},current),{code:'STALE_REVISION'});
});

test('lost response reconciles one exact effect and atomically projects integrated success to all original works',()=>{
 const group=freezePublicationGroup(input());assert.equal(group.kind,'frozen');const current=input().members.map(m=>({...m}));current[5].cancelRequested=true;
 const outcome=reconcilePublicationGroup(group,{head:commit,relation:'commit_or_descendant',senderStopped:false});assert.equal(outcome.kind,'integrated');const settled=settlePublicationGroup(group,outcome,current);
 assert.equal(settled.length,8);assert.ok(settled.every(x=>x.actionStatus==='succeeded'&&x.workDisposition==='integrated'&&x.currentActionId===null));assert.equal(settled[5].cancellationTooLate,true);assert.equal(new Set(settled.map(x=>x.publicationIdentity)).size,1);
 const replay=settlePublicationGroup(group,outcome,current);assert.deepEqual(replay,settled);
});

test('retry/stale/uncertain outcomes preserve one publication identity and do not invent partial integration',()=>{
 const group=freezePublicationGroup(input());assert.equal(group.kind,'frozen');const current=input().members;
 const retry=reconcilePublicationGroup(group,{head,relation:'expected_head',senderStopped:true});assert.equal(retry.kind,'retryable');assert.ok(settlePublicationGroup(group,retry,current).every(x=>x.actionStatus==='blocked'&&x.workDisposition==='open'));
 const uncertain=reconcilePublicationGroup(group,{head,relation:'expected_head',senderStopped:false});assert.equal(uncertain.kind,'uncertain');assert.ok(settlePublicationGroup(group,uncertain,current).every(x=>x.errorCode==='EFFECT_UNCERTAIN'));
 const newer='sha1:'+'e'.repeat(40),stale=reconcilePublicationGroup(group,{head:newer,relation:'other_expected_descendant',senderStopped:true});assert.equal(stale.kind,'stale');const failed=settlePublicationGroup(group,stale,current);assert.ok(failed.every(x=>x.actionStatus==='failed'&&x.workDisposition==='open'&&x.errorCode==='CONTENDED_REF'&&x.currentActionId===null));
});
