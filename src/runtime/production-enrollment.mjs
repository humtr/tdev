import {canonicalJson,recordDigest} from '../contracts/canonical.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {digest,id,oid,revision} from '../contracts/identity.mjs';
import {ProductionReceipts} from '../execution/outer-receipt.mjs';
import {releaseBuildProfile,releaseBuildExecution} from '../release/build-profile.mjs';
import {releaseRuntimeAdmitted} from '../release/native-control.mjs';
import {productionBuildOutput} from '../release/production-output.mjs';
/** @typedef {import('./enrollment.mjs').Definition} Definition */
/** @typedef {import('./native.mjs').NativeConfig['runtime']} Runtime */
/** @typedef {{schemaVersion:1,kind:'dev2.production-commissioning',commissioningId:string,installationId:string,repositoryId:string,bindingEpoch:string,providerRepositoryId:string,repositoryOwnerId:string,repositoryFullName:string,approvedCommitOid:string,approvedSourceTreeOid:string,approvedSourceManifestDigest:string,identities:Definition['identities'],engineDigest:string,dependencyArtifactDigest:string,qualificationSealDigest:string,runtime:Runtime}} ProductionIntent */
/** @typedef {{resultId:string,assignmentId:string,sessionId:string,runId:string,runAttempt:'1',leaseId:string,profileDigest:string,contextDigest:string,outerReceiptDigest:string}} EvidenceRef */
/** @typedef {{schemaVersion:1,kind:'dev2.production-enrollment',intent:ProductionIntent,proofs:EvidenceRef[],sealDigest:string}} ProductionEnrollment */
/** @typedef {{binding:import('../contracts/ports.js').Binding,definition:Definition,source:import('../contracts/ports.js').SourceTree,runtime:Runtime,qualificationSealDigest:string,sessions:import('../execution/sessions.mjs').ManagedSessions,objects:import('../contracts/ports.js').ObjectStorePort,admission?:import('../release/native-control.mjs').Admission|null}} Expected */
const verified=new WeakSet();
/** @param {unknown} value @param {string[]} keys */
function closed(value,keys){requireThat(value!==null&&typeof value==='object'&&!Array.isArray(value)&&canonicalJson(Object.keys(value).sort())===canonicalJson(keys.sort()),'INTEGRITY_FAILURE','Closed production enrollment required');}
/** Integrity identity only; it grants no capability. @param {ProductionIntent} intent */
export function productionIntentDigest(intent){return recordDigest('dev2.production-commissioning.v1',intent);}
/** @param {ProductionIntent} i @param {Omit<Expected,'sessions'|'objects'|'admission'>} e */
export function checkProductionIntent(i,e){
 closed(i,['schemaVersion','kind','commissioningId','installationId','repositoryId','bindingEpoch','providerRepositoryId','repositoryOwnerId','repositoryFullName','approvedCommitOid','approvedSourceTreeOid','approvedSourceManifestDigest','identities','engineDigest','dependencyArtifactDigest','qualificationSealDigest','runtime']);
 requireThat(i.schemaVersion===1&&i.kind==='dev2.production-commissioning'&&e.definition.config.executionShape==='production-outer-v1','EXECUTION_UNAVAILABLE');
 id(i.commissioningId);oid(i.approvedCommitOid);oid(i.approvedSourceTreeOid);revision(i.repositoryOwnerId);
 for(const d of [i.engineDigest,i.dependencyArtifactDigest,i.qualificationSealDigest,i.approvedSourceManifestDigest])digest(d);
 const b=e.binding;
 requireThat(b.provider==='github'&&i.installationId===b.installationId&&i.repositoryId===b.repositoryId&&i.bindingEpoch===b.bindingEpoch&&i.providerRepositoryId===b.providerRepositoryId&&i.repositoryOwnerId!=='0'&&b.remote==='https://github.com/'+i.repositoryFullName+'.git'&&i.qualificationSealDigest===e.qualificationSealDigest,'INTEGRITY_FAILURE','Production installation/provider binding differs');
 requireThat(i.approvedSourceTreeOid===e.source.treeOid&&i.approvedSourceManifestDigest===e.source.manifestDigest&&canonicalJson(i.identities)===canonicalJson(e.definition.identities),'INTEGRITY_FAILURE','Production approved controller differs');
}
/** Only installer-owned native records and OIDC-admitted completions participate.
 * This function neither creates sessions nor submits candidate/public evidence.
 * @param {ProductionEnrollment} value @param {Expected} expected */
export async function verifyProductionEnrollment(value,expected){
 closed(value,['schemaVersion','kind','intent','proofs','sealDigest']);
 const {sealDigest,...body}=value,i=value.intent,e=expected,ledger=e.sessions.ledger;
 requireThat(value.schemaVersion===1&&value.kind==='dev2.production-enrollment'&&digest(sealDigest)===recordDigest('dev2.production-enrollment.v1',body),'INTEGRITY_FAILURE','Production enrollment digest differs');
 checkProductionIntent(i,e);
 requireThat(canonicalJson(i.runtime)===canonicalJson(e.runtime)||releaseRuntimeAdmitted(e.admission,{...e.binding,runtime:e.runtime,enrollmentSealDigest:sealDigest,trustedRunnerDigest:i.identities.trustedRunnerDigest,workflowDigest:i.identities.workflowDigest}),'INTEGRITY_FAILURE','No exact installed production runtime admission');
 const intentDigest=productionIntentDigest(i),epoch=ledger.ownerEpoch;
 const retained=()=>ledger.transact(tx=>{requireThat(!ledger.closed&&ledger.ownerEpoch===epoch,'STALE_REVISION');const row=tx.get('SELECT value FROM meta WHERE key=?','production.commissioning:'+i.commissioningId);requireThat(row&&String(row.value)===canonicalJson(i),'INTEGRITY_FAILURE','No matching private native commissioning intent');});retained();
 const profiles=[...e.definition.policy.required(),releaseBuildProfile(i.identities.imageDigest)];
 requireThat(Array.isArray(value.proofs)&&value.proofs.length===profiles.length&&new Set(value.proofs.map(p=>p.assignmentId)).size===profiles.length,'INTEGRITY_FAILURE','All fixed production profiles are required');
 const receipts=new ProductionReceipts({sessions:e.sessions,objects:e.objects,seccompDigest:i.identities.seccompDigest,controllerDigest:i.identities.controllerDigest,engineDigest:i.engineDigest,dependencyArtifactDigest:i.dependencyArtifactDigest});
 for(let n=0;n<profiles.length;n++){
  const ref=value.proofs[n],profile=profiles[n];closed(ref,['resultId','assignmentId','sessionId','runId','runAttempt','leaseId','profileDigest','contextDigest','outerReceiptDigest']);
  const frame=ledger.transact(tx=>{const assignment=e.sessions.assignment(tx,ref.assignmentId),session=e.sessions.session(tx,assignment.sessionId),result=tx.getPrepared(ref.resultId);requireThat(result,'INTEGRITY_FAILURE','Missing exact retained commissioning result');return {assignment,session,result};}),{assignment:a,session:s,result:r}=frame;
  const execution=profile.profileId==='release-build'?releaseBuildExecution(e.definition.policy.policy.execution,i.identities.imageDigest):e.definition.policy.policy.execution;
  requireThat(a.sessionId===ref.sessionId&&a.runId===ref.runId&&s.run?.runAttempt===ref.runAttempt&&ref.runAttempt==='1'&&a.leaseId===ref.leaseId&&a.sealDigest===intentDigest&&ref.profileDigest===profile.digest&&s.intent.launchCommit===i.approvedCommitOid.slice(5)&&s.intent.providerRepositoryId===i.providerRepositoryId&&s.intent.repositoryOwnerId===i.repositoryOwnerId&&s.intent.repositoryFullName===i.repositoryFullName&&s.intent.trustedRunnerDigest===i.identities.trustedRunnerDigest,'INTEGRITY_FAILURE','Production commissioning assignment/provider differs');
  requireThat(r.commitOid===i.approvedCommitOid&&r.resultTreeOid===i.approvedSourceTreeOid&&r.resultTreeSha256===i.approvedSourceManifestDigest&&canonicalJson(r.execution)===canonicalJson(execution)&&a.result,'INTEGRITY_FAILURE','Production commissioning source/result differs');
  const {proof,outer}=await receipts.verify(r,a.input.attempt,profile,a.result);retained();
  requireThat(proof.eligible&&proof.contextDigest===ref.contextDigest&&proof.outerReceiptDigest===ref.outerReceiptDigest,'VALIDATION_FAILED','Production proof is ineligible or substituted');
  if(profile.profileId==='release-build')await productionBuildOutput(outer,e.objects);retained();
 }
 const result=Object.freeze({enrollment:deepFreeze(structuredClone(value)),definition:e.definition,sealDigest,receipts});verified.add(result);return result;
}
/** @template T @param {T} value @returns {T} */
function deepFreeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(deepFreeze);Object.freeze(value);}return value;}
/** Process capability, not JSON/boolean/schema authority. @param {unknown} value */
export function assertProductionEnrollment(value){requireThat(value&&typeof value==='object'&&verified.has(value),'EXECUTION_UNAVAILABLE','Verified private production capability required');}
