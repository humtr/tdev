import {canonicalJson,parseRecord,recordDigest} from '../contracts/canonical.mjs';
import {id,digest,oid} from '../contracts/identity.mjs';
import {requireThat,Dev2Error} from '../contracts/errors.mjs';
import {specialActionFence} from './action.mjs';
import {releaseManifest,releaseIdentity,runtimePair,compatiblePair,releaseIdFromStage,activationIntent} from './manifest.mjs';
/** @typedef {import('../contracts/ports.js').Principal} Principal */
/** @typedef {import('../contracts/ports.js').Json} Json */
/** @typedef {import('./authority.mjs').IntegratedSource} Source */
/** @typedef {import('./types.js').ReleaseManifest} Manifest */
/** @typedef {import('./types.js').RuntimePair} Pair */
/** @typedef {import('./types.js').ActivationIntent} Intent */
/** @typedef {{manifest:Manifest,refs:import('./artifacts.mjs').ArtifactRefs,receipt:Json}} Build */
/** @typedef {{effectId:string,releaseId:string,inputDigest:string,artifactDigest:string,sourceCommitOid:string,expectedVersionId:string}} StageEffect */
/** @typedef {{effectId:string,inputDigest:string,kind:'ready'|'absent'|'pending'|'failed',senderStopped:boolean,versionId:string|null,artifactDigest:string|null,observedAt:number}} StageReceipt */
/** @typedef {{schemaVersion:1,actionId:string,principal:string,inputDigest:string,sourceCommitOid:string,policyDigest:string,expectedActiveRelease:string,previous:Pair,build:Build|null,effect:StageEffect|null,receipt:StageReceipt|null,target:Pair|null,state:'building'|'uploading'|'staged'}} Stage */
/** @typedef {{build:(actionId:string,source:Source,previous:Pair)=>Promise<Build>,verify:(build:Build,source:Source,previous:Pair)=>Promise<boolean>,stopped:(actionId:string)=>Promise<boolean>,cancel?:(actionId:string)=>Promise<void>}} Builder */
/** @typedef {{reconcile:(effect:StageEffect)=>Promise<StageReceipt>,execute:(effect:StageEffect,build:Build)=>Promise<StageReceipt>}} EdgeStager */
/** @typedef {{activePair:()=>Promise<Pair>,begin:(intent:Intent)=>Promise<import('./types.js').ActivationRecord>,observe:(activationId:string)=>Promise<import('./types.js').ActivationRecord|null>}} Helper */
/** Native special operations reuse the work ledger only for admission/receipts.
 * The fixed helper owns its independent activation journal through broker stop.
 * Builders/stagers are sealed installation ports; no source-selected code is
 * imported or command executed by this broker.
 */
export class ReleaseBackend {
 /** @param {{ledger:import('../storage/ledger.mjs').Ledger,binding:import('../contracts/ports.js').Binding,authority:Pick<import('./authority.mjs').IntegratedSourceAuthority,'verify'>,artifacts:import('./artifacts.mjs').ReleaseArtifactStore,builder:Builder,edge:EdgeStager,helper:Helper,authorize:(principal:Principal,paths:readonly string[])=>Promise<void>,now?:()=>number}} options */
 constructor(options){this.o=options;this.now=options.now??Date.now;/** @type {Map<string,Promise<Json>>} */this.running=new Map();}
 /** @template T @param {string} key @returns {T|null} */
 record(key){return this.o.ledger.transact(tx=>{const row=tx.get('SELECT value FROM meta WHERE key=?',key);return row?/** @type {T} */(parseRecord(String(row.value),2097152)):null;});}
 /** @param {Stage} value @param {ReturnType<typeof specialActionFence>} fence */
 saveStage(value,fence){this.o.ledger.transact(tx=>{fence.check(tx);const key='release.stage:'+value.actionId,old=tx.get('SELECT value FROM meta WHERE key=?',key);if(old){const prior=/** @type {Stage} */(parseRecord(String(old.value)));requireThat(prior.inputDigest===value.inputDigest&&prior.principal===value.principal&&canonicalJson(prior.previous)===canonicalJson(value.previous),'IDEMPOTENCY_MISMATCH');if(prior.state==='staged')requireThat(canonicalJson(prior)===canonicalJson(value),'INTEGRITY_FAILURE');}
  tx.run('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,canonicalJson(value));
  if(value.state==='staged'){requireThat(value.build&&value.target,'INTEGRITY_FAILURE');const readyKey='release.ready:'+releaseIdentity(value.build.manifest),ready=tx.get('SELECT value FROM meta WHERE key=?',readyKey);if(ready){const retained=/** @type {Stage} */(parseRecord(String(ready.value)));requireThat(retained.build&&canonicalJson(retained.build.manifest)===canonicalJson(value.build.manifest)&&canonicalJson(retained.target)===canonicalJson(value.target),'INTEGRITY_FAILURE','Release identity collision');}else tx.run('INSERT INTO meta VALUES(?,?)',readyKey,canonicalJson(value));}
 });return value;}
 /** @param {StageEffect} effect @param {StageReceipt} value */
 checkReceipt(effect,value){requireThat(value&&value.effectId===effect.effectId&&value.inputDigest===effect.inputDigest&&['ready','absent','pending','failed'].includes(value.kind)&&typeof value.senderStopped==='boolean'&&Number.isSafeInteger(value.observedAt)&&value.observedAt<=this.now()+5000&&value.observedAt>=this.now()-60000,'INTEGRITY_FAILURE','Unbound staging readback');if(value.kind==='ready')requireThat(value.senderStopped&&value.versionId&&value.artifactDigest===effect.artifactDigest,'EFFECT_UNCERTAIN');if(value.kind==='absent'||value.kind==='failed')requireThat(value.senderStopped,'EFFECT_UNCERTAIN');if(value.versionId)id(value.versionId);return value;}
 /** @param {Principal} principal @param {{integratedCommit:string,policyDigest:string,expectedActiveRelease:string}} input @param {string} actionId @returns {Promise<Json>} */
 stage(principal,input,actionId){return this.once(actionId,()=>this.stageOnce(principal,input,actionId));}
 /** @param {string} actionId @param {()=>Promise<Json>} callback */
 once(actionId,callback){id(actionId);const prior=this.running.get(actionId);if(prior)return prior;const run=callback().finally(()=>this.running.delete(actionId));this.running.set(actionId,run);return run;}
 /** @param {Principal} principal @param {{integratedCommit:string,policyDigest:string,expectedActiveRelease:string}} input @param {string} actionId @returns {Promise<Json>} */
 async stageOnce(principal,input,actionId){
  oid(input.integratedCommit);digest(input.policyDigest);digest(input.expectedActiveRelease);await this.o.authorize(principal,[]);
  const fence=specialActionFence(this.o.ledger,actionId,'release.stage',principal.subject,this.now),inputDigest=recordDigest('dev2.release-stage-input.v1',input);
  let stage=/** @type {Stage|null} */(this.record('release.stage:'+actionId));
  if(stage)requireThat(stage.inputDigest===inputDigest&&stage.principal===principal.subject,'IDEMPOTENCY_MISMATCH');
  const source=await this.o.authority.verify(input.integratedCommit,input.policyDigest);fence.assert();
  await this.o.authorize(principal,source.source.entries.map(entry=>entry.path));fence.assert();
  const previous=runtimePair(await this.o.helper.activePair());fence.assert();requireThat(previous.releaseId===input.expectedActiveRelease,'STALE_RESULT','Active release changed before staging');
  if(stage)requireThat(canonicalJson(stage.previous)===canonicalJson(previous),'STALE_RESULT');
  else stage=this.saveStage({schemaVersion:1,actionId,principal:principal.subject,inputDigest,sourceCommitOid:input.integratedCommit,policyDigest:input.policyDigest,expectedActiveRelease:input.expectedActiveRelease,previous,build:null,effect:null,receipt:null,target:null,state:'building'},fence);
  let build=stage.build;
  if(!build){build=await this.o.builder.build(actionId,source,previous);fence.assert();releaseManifest(build.manifest);
   requireThat(await this.o.builder.verify(build,source,previous),'VALIDATION_FAILED','Release build has no eligible managed receipt');fence.assert();
   const m=build.manifest;requireThat(m.repositoryId===source.repositoryId&&m.bindingEpoch===source.bindingEpoch&&m.sourceCommitOid===source.commitOid&&m.sourceTreeOid===source.source.treeOid&&m.sourceManifestDigest===source.source.manifestDigest&&m.policyDigest===source.policyDigest&&m.requiredValidationId===source.validationId,'INTEGRITY_FAILURE','Release build differs from exact validated integration');
   stage=this.saveStage({...stage,build},fence);
  }else{requireThat(await this.o.builder.verify(build,source,previous),'VALIDATION_FAILED');fence.assert();}
  if(stage.state==='staged'){requireThat(stage.target,'INTEGRITY_FAILURE');await this.o.artifacts.verify(stage.target.releaseId,build.manifest,build.refs);fence.assert();return this.output(stage.target,'staged',null);}
  const artifact=await this.o.artifacts.stage(build.manifest,build.refs);fence.assert();
  const m=build.manifest,deviceUnchanged=m.device.artifactDigest===previous.deviceArtifactDigest&&m.device.sourceCommitOid===previous.deviceSourceCommitOid;
  const edgeUnchanged=m.edge.artifactDigest===previous.edgeArtifactDigest&&m.edge.sourceCommitOid===previous.edgeSourceCommitOid;
  let edgeVersionId=previous.edgeVersionId;
  if(!edgeUnchanged){
   const fields={installationId:this.o.binding.installationId,repositoryId:this.o.binding.repositoryId,bindingEpoch:this.o.binding.bindingEpoch,releaseId:artifact.releaseId,artifactDigest:m.edge.artifactDigest,sourceCommitOid:m.edge.sourceCommitOid,expectedVersionId:previous.edgeVersionId};
   const effect={effectId:recordDigest('dev2.release-stage-effect.v1',fields).slice(7),releaseId:artifact.releaseId,inputDigest:recordDigest('dev2.release-stage-effect-input.v1',fields),artifactDigest:m.edge.artifactDigest,sourceCommitOid:m.edge.sourceCommitOid,expectedVersionId:previous.edgeVersionId};
   if(stage.effect)requireThat(canonicalJson(stage.effect)===canonicalJson(effect),'INTEGRITY_FAILURE');
   else stage=this.saveStage({...stage,effect,state:'uploading'},fence);
   let receipt=this.checkReceipt(effect,await this.o.edge.reconcile(effect));fence.assert();
   if(receipt.kind==='absent'){
    // The exact upload identity is durable before the first provider call. The
    // stager itself fences sent/uncertain invocations; absence is never inferred
    // merely from a temporarily empty provider list.
    receipt=this.checkReceipt(effect,await this.o.edge.execute(effect,build));fence.assert();
   }
   stage=this.saveStage({...stage,receipt},fence);
   requireThat(receipt.kind==='ready'&&receipt.versionId,'EFFECT_UNCERTAIN','Exact Worker version upload is unresolved');edgeVersionId=receipt.versionId;
  }
  const target=runtimePair({releaseId:artifact.releaseId,schemaDigest:m.schemaDigest,sourceCommitOid:m.sourceCommitOid,deviceReleaseId:deviceUnchanged?previous.deviceReleaseId:artifact.releaseId,deviceArtifactDigest:m.device.artifactDigest,deviceSourceCommitOid:m.device.sourceCommitOid,edgeVersionId,edgeArtifactDigest:m.edge.artifactDigest,edgeSourceCommitOid:m.edge.sourceCommitOid,protocol:m.protocol,ledger:m.ledger});
  compatiblePair(previous,target,1);await this.o.authorize(principal,source.source.entries.map(entry=>entry.path));fence.assert();
  requireThat(this.o.binding.policyDigest===input.policyDigest&&canonicalJson(runtimePair(await this.o.helper.activePair()))===canonicalJson(previous),'STALE_RESULT');fence.assert();
  this.saveStage({...stage,build,target,state:'staged'},fence);return this.output(target,'staged',null);
 }
 /** @param {Principal} principal @param {{stagedReleaseId:string,expectedActiveRelease:string}} input @param {string} actionId @returns {Promise<Json>} */
 activate(principal,input,actionId){return this.once(actionId,()=>this.activateOnce(principal,input,actionId));}
 /** @param {Principal} principal @param {{stagedReleaseId:string,expectedActiveRelease:string}} input @param {string} actionId @returns {Promise<Json>} */
 async activateOnce(principal,input,actionId){
  const releaseId=releaseIdFromStage(input.stagedReleaseId);digest(input.expectedActiveRelease);await this.o.authorize(principal,[]);
  const fence=specialActionFence(this.o.ledger,actionId,'release.activate',principal.subject,this.now),inputDigest=recordDigest('dev2.release-activate-input.v1',input);
  const retained=/** @type {{inputDigest:string,intent:Intent}|null} */(this.record('release.activation:'+actionId));
  if(retained){
   requireThat(retained.inputDigest===inputDigest&&retained.intent.principalId===principal.subject,'IDEMPOTENCY_MISMATCH');
   const observed=await this.o.helper.observe(retained.intent.activationId);fence.assert();
   // An admitted fixed-helper transaction owns bounded completion/rollback even
   // while its replaceable broker is stopped. Reading it never launches again.
   if(observed)return this.finishActivation(retained.intent,observed);
   // Native intent durability alone does not prove helper admission. A crash in
   // that gap must recheck current source/path/policy/runtime authority before
   // delivering the same immutable intent, never borrowing an old grant.
  }
  const stage=/** @type {Stage|null} */(this.record('release.ready:'+releaseId));requireThat(stage&&stage.state==='staged'&&stage.build&&stage.target&&stage.target.releaseId===releaseId,'INVALID_ARGUMENT','Unknown immutable staged release');
  requireThat(stage.previous.releaseId===input.expectedActiveRelease&&this.o.binding.policyDigest===stage.policyDigest,'STALE_RESULT');
  const source=await this.o.authority.verify(stage.sourceCommitOid,stage.policyDigest);fence.assert();
  requireThat(await this.o.builder.verify(stage.build,source,stage.previous),'VALIDATION_FAILED');fence.assert();
  await this.o.artifacts.verify(releaseId,stage.build.manifest,stage.build.refs);fence.assert();
  const previous=runtimePair(await this.o.helper.activePair());fence.assert();requireThat(canonicalJson(previous)===canonicalJson(stage.previous),'STALE_RESULT','Actual runtime pair differs from staged base');
  await this.o.authorize(principal,source.source.entries.map(entry=>entry.path));fence.assert();
  const action=fence.assert(),intent=retained?.intent??activationIntent({activationId:recordDigest('dev2.release-activation.v1',{installationId:this.o.binding.installationId,actionId,inputDigest}).slice(7),actionId,installationId:this.o.binding.installationId,repositoryId:this.o.binding.repositoryId,bindingEpoch:this.o.binding.bindingEpoch,principalId:principal.subject,createdAt:this.now(),deadline:action.deadline,previous,target:stage.target});
  if(retained)requireThat(intent.deadline===action.deadline&&canonicalJson(intent.previous)===canonicalJson(previous)&&canonicalJson(intent.target)===canonicalJson(stage.target),'STALE_RESULT');
  else this.o.ledger.transact(tx=>{fence.check(tx);requireThat(!tx.get('SELECT value FROM meta WHERE key=?','release.activation:'+actionId),'STALE_REVISION');tx.run('INSERT INTO meta VALUES(?,?)','release.activation:'+actionId,canonicalJson({inputDigest,intent}));});
  // Beginning the fixed helper journal is itself idempotent. If its response is
  // lost, observation recovers this same activationId after the broker restarts.
  return this.finishActivation(intent,await this.o.helper.begin(intent));
 }
 /** @param {Intent} intent @param {import('./types.js').ActivationRecord} record @returns {Json} */
 finishActivation(intent,record){requireThat(canonicalJson(record.intent)===canonicalJson(intent)&&record.intentDigest===recordDigest('dev2.activation-intent.v1',intent),'INTEGRITY_FAILURE');
  if(record.phase==='active'){requireThat(record.observedPair&&canonicalJson(record.observedPair)===canonicalJson(intent.target),'INTEGRITY_FAILURE');return this.output(record.observedPair,'active',intent.activationId);}
  if(record.phase==='rolled_back'){requireThat(record.observedPair&&canonicalJson(record.observedPair)===canonicalJson(intent.previous),'INTEGRITY_FAILURE');return this.output(record.observedPair,'rolled_back',intent.activationId);}
  throw new Dev2Error('EFFECT_UNCERTAIN','Activation retains an unresolved exact helper effect');
 }
 /** Observation only. This method never starts a missing helper or build effect.
  * Native recovery may settle the existing action from this bound result.
  * @param {string} actionId */
 async recovery(actionId){
  const retained=/** @type {{inputDigest:string,intent:Intent}|null} */(this.record('release.activation:'+actionId));
  if(retained){const record=await this.o.helper.observe(retained.intent.activationId);if(!record)return {stopped:true,effectResolved:false,output:null};
   requireThat(canonicalJson(record.intent)===canonicalJson(retained.intent),'INTEGRITY_FAILURE');
   const terminal=['active','rolled_back'].includes(record.phase);return {stopped:true,effectResolved:terminal,output:terminal?this.finishActivation(retained.intent,record):null};
  }
  const stage=/** @type {Stage|null} */(this.record('release.stage:'+actionId));
  if(stage?.state==='staged'&&stage.target&&stage.build){await this.o.artifacts.verify(stage.target.releaseId,stage.build.manifest,stage.build.refs);return {stopped:true,effectResolved:true,output:this.output(stage.target,'staged',null)};}
  const stopped=await this.o.builder.stopped(actionId);
  if(stage?.effect){const receipt=this.checkReceipt(stage.effect,await this.o.edge.reconcile(stage.effect));return {stopped:stopped&&receipt.senderStopped,effectResolved:false,output:null};}
  return {stopped,effectResolved:stopped,output:null};
 }
 /** @param {Pair} pair @param {'staged'|'active'|'rolled_back'|'blocked'} state @param {string|null} activationId @returns {Json} */
 output(pair,state,activationId){return {kind:'release',releaseId:pair.releaseId,schemaDigest:pair.schemaDigest,sourceCommitOid:pair.sourceCommitOid,state,activationId};}
}
