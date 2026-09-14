import {recordDigest} from '../src/contracts/canonical.mjs';
import {requireThat} from '../src/contracts/errors.mjs';
/** @typedef {{workId:string,actionId:string,requestId:string,generation:string,revision:string,preparedResultId:string,candidateValidationId:string,candidateTreeOid:string,candidateManifestDigest:string,expectedHead:string,policyDigest:string,validated:boolean,cancelRequested:boolean,disposition:'open'|'integrated'|'cancelled',currentActionId:string|null}} GroupMember */
/** @typedef {{kind:'fallback',reason:string,fallback:'d0003_per_work'}} GroupFallback */
/** @typedef {{kind:'frozen',publicationIdentity:string,leaderActionId:string,repositoryId:string,bindingEpoch:string,ref:string,expectedHead:string,commitOid:string,composedResultId:string,composedValidationId:string,policyDigest:string,members:readonly GroupMember[]}} FrozenGroup */
/** @param {unknown} v */
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
/** @param {unknown} v */
const digest=v=>typeof v==='string'&&/^sha256:[0-9a-f]{64}$/.test(v);
/** @param {unknown} v */
const oid=v=>typeof v==='string'&&/^(?:sha1:[0-9a-f]{40}|sha256:[0-9a-f]{64})$/.test(v);
/** @param {string} reason @returns {GroupFallback} */
const fallback=reason=>({kind:'fallback',reason,fallback:'d0003_per_work'});
/** Freeze immutable evidence only. This function owns no lifecycle or provider effect.
 * @param {{repositoryId:string,bindingEpoch:string,ref:string,currentHead:string,expectedHead:string,commitOid:string,composedResultId:string,composedValidationId:string,policyDigest:string,members:readonly GroupMember[]}} input
 * @returns {GroupFallback|FrozenGroup} */
export function freezePublicationGroup(input){
 requireThat(input&&id(input.repositoryId)&&typeof input.bindingEpoch==='string'&&typeof input.ref==='string'&&oid(input.expectedHead)&&oid(input.commitOid)&&id(input.composedResultId)&&digest(input.composedValidationId)&&digest(input.policyDigest)&&Array.isArray(input.members)&&input.members.length>1&&input.members.length<=64,'INVALID_ARGUMENT','Publication group');
 if(input.currentHead!==input.expectedHead)return fallback('late_head_movement');
 /** @type {Set<string>} */ const works=new Set();/** @type {Set<string>} */ const actions=new Set();/** @type {Set<string>} */ const requests=new Set();
 /** @type {GroupMember[]} */ const members=[];
 for(const raw of input.members){const member=structuredClone(raw);requireThat(id(member.workId)&&id(member.actionId)&&id(member.requestId)&&id(member.preparedResultId)&&digest(member.candidateValidationId)&&oid(member.candidateTreeOid)&&digest(member.candidateManifestDigest),'INVALID_ARGUMENT','Member identity');
  if(works.has(member.workId)||actions.has(member.actionId)||requests.has(member.requestId))return fallback('duplicate_member_identity');
  works.add(member.workId);actions.add(member.actionId);requests.add(member.requestId);
  if(member.expectedHead!==input.expectedHead||member.policyDigest!==input.policyDigest)return fallback('incompatible_intent');
  if(!member.validated)return fallback('unvalidated_member');
  if(member.cancelRequested)return fallback('cancelled_before_freeze');
  if(member.disposition!=='open'||member.currentActionId!==member.actionId)return fallback('member_not_fenced');
  members.push(member);
 }
 members.sort((a,b)=>a.actionId.localeCompare(b.actionId));
 const evidence=members.map(({workId,actionId,requestId,generation,revision,preparedResultId,candidateValidationId,candidateTreeOid,candidateManifestDigest})=>({workId,actionId,requestId,generation,revision,preparedResultId,candidateValidationId,candidateTreeOid,candidateManifestDigest}));
 const publicationIdentity=recordDigest('dev2.research-publication-group.v1',{repositoryId:input.repositoryId,bindingEpoch:input.bindingEpoch,ref:input.ref,expectedHead:input.expectedHead,commitOid:input.commitOid,composedResultId:input.composedResultId,composedValidationId:input.composedValidationId,policyDigest:input.policyDigest,members:evidence});
 return {kind:'frozen',publicationIdentity,leaderActionId:members[0].actionId,repositoryId:input.repositoryId,bindingEpoch:input.bindingEpoch,ref:input.ref,expectedHead:input.expectedHead,commitOid:input.commitOid,composedResultId:input.composedResultId,composedValidationId:input.composedValidationId,policyDigest:input.policyDigest,members};
}
/** Reconcile exactly one frozen publication effect.
 * relation is trusted ancestry evidence produced by the repository adapter.
 * @param {FrozenGroup} group @param {{head:string,relation:'commit_or_descendant'|'expected_head'|'other_expected_descendant'|'foreign',senderStopped:boolean}} observed */
export function reconcilePublicationGroup(group,observed){
 requireThat(group.kind==='frozen'&&oid(observed.head)&&typeof observed.senderStopped==='boolean','INVALID_ARGUMENT');
 if(observed.relation==='commit_or_descendant')return {kind:'integrated',observedHead:observed.head};
 if(observed.relation==='expected_head')return {kind:observed.senderStopped?'retryable':'uncertain'};
 if(observed.relation==='other_expected_descendant')return {kind:'stale',observedHead:observed.head};
 return {kind:'binding_fenced'};
}
/** Verify every original work/action fence immediately before effect admission.
 * @param {FrozenGroup} group @param {readonly GroupMember[]} current */
export function publicationFenceHolds(group,current){
 if(current.length!==group.members.length)return false;const byAction=new Map(current.map(m=>[m.actionId,m]));
 return group.members.every(frozen=>{const now=byAction.get(frozen.actionId);return Boolean(now&&now.workId===frozen.workId&&now.requestId===frozen.requestId&&now.generation===frozen.generation&&now.revision===frozen.revision&&now.preparedResultId===frozen.preparedResultId&&now.candidateValidationId===frozen.candidateValidationId&&now.candidateTreeOid===frozen.candidateTreeOid&&now.candidateManifestDigest===frozen.candidateManifestDigest&&now.expectedHead===frozen.expectedHead&&now.policyDigest===frozen.policyDigest&&now.disposition==='open'&&now.currentActionId===frozen.actionId);});
}
/** Deterministic all-member projection. The durable implementation must commit the
 * equivalent action/work updates in one existing ledger transaction.
 * @param {FrozenGroup} group @param {{kind:string,observedHead?:string}} outcome @param {readonly GroupMember[]} current */
export function settlePublicationGroup(group,outcome,current){
 requireThat(publicationFenceHolds(group,current),'STALE_REVISION','Frozen member fence changed');const byAction=new Map(current.map(m=>[m.actionId,m]));
 if(outcome.kind==='integrated')return group.members.map(f=>{const m=/** @type {GroupMember} */(byAction.get(f.actionId));return {workId:m.workId,actionId:m.actionId,actionStatus:'succeeded',workDisposition:'integrated',currentActionId:null,errorCode:null,cancellationTooLate:m.cancelRequested,publicationIdentity:group.publicationIdentity};});
 if(outcome.kind==='stale')return group.members.map(f=>{const m=/** @type {GroupMember} */(byAction.get(f.actionId));return {workId:m.workId,actionId:m.actionId,actionStatus:'failed',workDisposition:'open',currentActionId:null,errorCode:'CONTENDED_REF',cancellationTooLate:false,publicationIdentity:group.publicationIdentity};});
 if(['uncertain','binding_fenced'].includes(outcome.kind))return group.members.map(f=>{const m=/** @type {GroupMember} */(byAction.get(f.actionId));return {workId:m.workId,actionId:m.actionId,actionStatus:'blocked',workDisposition:'open',currentActionId:m.actionId,errorCode:'EFFECT_UNCERTAIN',cancellationTooLate:false,publicationIdentity:group.publicationIdentity};});
 requireThat(outcome.kind==='retryable','INVALID_ARGUMENT','Group outcome');
 return group.members.map(f=>{const m=/** @type {GroupMember} */(byAction.get(f.actionId));return {workId:m.workId,actionId:m.actionId,actionStatus:'blocked',workDisposition:'open',currentActionId:m.actionId,errorCode:null,cancellationTooLate:false,publicationIdentity:group.publicationIdentity};});
}
