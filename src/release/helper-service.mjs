import {canonicalJson,parseRecord,recordDigest} from '../contracts/canonical.mjs';
import {digest,id} from '../contracts/identity.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {releaseIdentity,releaseManifest,runtimePair,activationIntent,compatiblePair} from './manifest.mjs';
/** @typedef {import('./types.js').RuntimePair} Pair */
/** @typedef {import('./types.js').ActivationIntent} Intent */
/** @typedef {import('./types.js').ActivationRecord} Activation */
/** @typedef {import('./backend.mjs').Build} Build */
/** @typedef {import('./backend.mjs').StageEffect} StageEffect */
/** This service has no work admission or validation authority. Its only admission
 * caller is the installed native owner, authenticated by role-separated private
 * RPC. Native must verify required+production receipts before handing off a build.
 * Helper rechecks fixed artifact/config identities and owns only retained rollout.
 */
export class FixedReleaseService {
 /** @param {{journal:import('./journal.mjs').ActivationJournal,controller:import('./activation.mjs').ActivationController,artifacts:import('./artifacts.mjs').ReleaseArtifactStore,configs:import('./device-configs.mjs').DeviceReleaseConfigs,edge:Pick<import('./cloudflare.mjs').CloudflareReleasePort,'active'|'version'|'verifyVersion'|'reconcileStage'|'upload'>,nativeStatus:()=>Promise<import('./device-port.mjs').NativeStatus>,baseline:Pair,installationId:string,repositoryId:string,bindingEpoch:string,installationSealDigest:string,executor:{sealDigest:string,controllerDigest:string,workflowDigest:string},now?:()=>number}} options */
 constructor(options){this.o=options;this.journal=options.journal;this.epoch=this.journal.ownerEpoch;this.now=options.now??Date.now;this.running=/** @type {Promise<void>|null} */(null);digest(options.installationSealDigest);runtimePair(options.baseline);for(const d of Object.values(options.executor))digest(d);}
 assert(){requireThat(!this.journal.closed&&this.journal.ownerEpoch===this.epoch,'STALE_REVISION');}
 /** @template T @param {string} key @returns {T|null} */
 read(key){this.assert();const row=this.journal.db.prepare('SELECT value FROM meta WHERE key=?').get(key);return row?/** @type {T} */(parseRecord(String(row.value),1048576)):null;}
 /** @param {string} key @param {unknown} value */
 retain(key,value){this.assert();this.journal.transact(()=>{const old=this.read(key);if(old)requireThat(canonicalJson(old)===canonicalJson(value),'IDEMPOTENCY_MISMATCH');else this.journal.db.prepare('INSERT INTO meta VALUES(?,?)').run(key,canonicalJson(value));});}
 /** Last terminal pair is durable in the same activation journal. A crash before
  * any convenience projection cannot erase which exact release became active.
  * @returns {Pair} */
 retainedPair(){this.assert();const row=this.journal.db.prepare("SELECT record FROM activation WHERE active=0 ORDER BY rowid DESC LIMIT 1").get();if(!row)return runtimePair(this.o.baseline);const record=/** @type {Activation} */(parseRecord(String(row.record),1048576));requireThat(record.observedPair,'INTEGRITY_FAILURE');const expected=record.phase==='active'?record.intent.target:record.intent.previous;requireThat(canonicalJson(record.observedPair)===canonicalJson(expected),'INTEGRITY_FAILURE');return runtimePair(record.observedPair);}
 /** @returns {Promise<Pair>} */
 async activePair(){this.assert();requireThat(!this.journal.active(),'EFFECT_UNCERTAIN','Rollout has a retained incomplete effect');const pair=this.retainedPair(),[pointer,native,edge]=await Promise.all([this.o.configs.pointerFor(pair),this.o.nativeStatus(),this.o.edge.active()]);this.assert();requireThat(!this.journal.active()&&canonicalJson(this.retainedPair())===canonicalJson(pair)&&canonicalJson(await this.o.configs.current())===canonicalJson(pointer),'STALE_RESULT');
  requireThat(native.installationId===this.o.installationId&&native.repositoryId===this.o.repositoryId&&native.bindingEpoch===this.o.bindingEpoch&&native.connected&&native.accepting&&native.deviceReleaseId===pair.deviceReleaseId&&native.sourceCommitOid===pair.deviceSourceCommitOid&&native.bundleDigest===pair.deviceArtifactDigest&&native.schemaDigest===pair.schemaDigest&&edge.versionId===pair.edgeVersionId&&native.edge?.versionId===pair.edgeVersionId&&native.edge.bundleDigest===pair.edgeArtifactDigest&&native.edge.sourceCommitOid===pair.edgeSourceCommitOid&&native.edge.schemaDigest===pair.schemaDigest,'EFFECT_UNCERTAIN','Actual active pair is not the retained pair');return pair;
 }
 /** Authenticated native handoff only; candidate output cannot call this method.
  * @param {Build} build @param {Pair} previous */
 async admitBuild(build,previous){this.assert();const m=releaseManifest(build.manifest);runtimePair(previous);requireThat(m.repositoryId===this.o.repositoryId&&m.bindingEpoch===this.o.bindingEpoch&&m.schemaDigest===previous.schemaDigest&&m.installationSealDigest===this.o.installationSealDigest&&canonicalJson(m.executor)===canonicalJson(this.o.executor)&&build.receipt!==null&&typeof build.receipt==='object'&&!Array.isArray(build.receipt),'FORBIDDEN','Unenrolled native release build');
  const releaseId=releaseIdentity(m);requireThat(Buffer.byteLength(canonicalJson(build))<=262144,'LIMIT_EXCEEDED');await this.o.artifacts.verify(releaseId,m,build.refs);this.assert();
  this.retain('helper.build:'+releaseId,{build,previous});await this.o.configs.prepare(build,previous);this.assert();return releaseId;
 }
 /** @param {StageEffect} effect */
 async reconcileStage(effect){this.assert();const admitted=/** @type {{build:Build,previous:Pair}|null} */(this.read('helper.build:'+digest(effect.releaseId)));if(admitted)requireThat(admitted.build.manifest.edge.artifactDigest===effect.artifactDigest&&admitted.previous.edgeVersionId===effect.expectedVersionId,'INTEGRITY_FAILURE');return this.o.edge.reconcileStage(effect);}
 /** @param {StageEffect} effect @param {Build} build */
 async stage(effect,build){const previous=await this.activePair();requireThat(previous.edgeVersionId===effect.expectedVersionId,'STALE_RESULT');const releaseId=await this.admitBuild(build,previous);requireThat(releaseId===effect.releaseId,'INTEGRITY_FAILURE');return this.o.edge.upload(effect,build);}
 /** Same existing activation is observed without manufacturing a fresh effect.
  * Initial authorization has already been checked by native immediately before
  * this authenticated handoff and is retained even across that broker's stop.
  * @param {Intent} input @param {Build} build */
 async begin(input,build){const intent=activationIntent(input);this.assert();requireThat(intent.installationId===this.o.installationId&&intent.repositoryId===this.o.repositoryId&&intent.bindingEpoch===this.o.bindingEpoch,'FORBIDDEN');
  const old=this.journal.read(intent.activationId);if(old){requireThat(canonicalJson(old.intent)===canonicalJson(intent),'IDEMPOTENCY_MISMATCH');return old;}
  requireThat(this.now()<intent.deadline&&intent.createdAt<=this.now()+2000,'EXECUTION_UNAVAILABLE');requireThat(canonicalJson(await this.activePair())===canonicalJson(intent.previous),'STALE_RESULT');
  const releaseId=await this.admitBuild(build,intent.previous),m=build.manifest,t=intent.target,p=intent.previous;
  requireThat(releaseId===t.releaseId&&m.sourceCommitOid===t.sourceCommitOid&&m.schemaDigest===t.schemaDigest&&m.device.artifactDigest===t.deviceArtifactDigest&&m.device.sourceCommitOid===t.deviceSourceCommitOid&&m.edge.artifactDigest===t.edgeArtifactDigest&&m.edge.sourceCommitOid===t.edgeSourceCommitOid&&canonicalJson(m.protocol)===canonicalJson(t.protocol)&&canonicalJson(m.ledger)===canonicalJson(t.ledger),'INTEGRITY_FAILURE','Activation does not name staged bytes');
  const unchanged=m.device.artifactDigest===p.deviceArtifactDigest&&m.device.sourceCommitOid===p.deviceSourceCommitOid;requireThat(t.deviceReleaseId===(unchanged?p.deviceReleaseId:releaseId),'INTEGRITY_FAILURE');compatiblePair(p,t,1);await this.o.configs.pointerFor(t);
  this.o.edge.verifyVersion(await this.o.edge.version(t.edgeVersionId),t.edgeSourceCommitOid,t.edgeArtifactDigest,m.edge.compatibilityDate);this.assert();requireThat(!this.journal.active()&&canonicalJson(await this.activePair())===canonicalJson(p),'STALE_RESULT');
  return this.journal.begin(intent);
 }
 /** Does not wait for broker stop/restart. The fixed service tick, not the HTTP
  * request lifetime, drives durable active work and survives response loss.
  * @returns {Promise<void>} */
 tick(){if(this.running)return this.running;const run=(async()=>{this.assert();const current=this.journal.active();if(current)await this.o.controller.drive(current.intent.activationId);})().finally(()=>{this.running=null;});this.running=run;return run;}
 /** @param {string} activationId */
 observe(activationId){id(activationId);this.assert();return this.journal.read(activationId);}
 /** Startup admission intentionally does not query the restarting native process.
  * HMAC private transport plus actual pointer/journal/artifact identity, not mere
  * repository publication, establishes which staged device bytes may initialize.
  * @param {{deviceReleaseId:string,runtime:{sourceCommitOid:string,sourceTreeOid:string,bundleDigest:string,schemaDigest:string}}} request */
 async runtimeAdmission(request){digest(request.deviceReleaseId);this.assert();const pointer=await this.o.configs.current(),current=this.journal.active(),pairs=current?[current.intent.previous,current.intent.target]:[this.retainedPair()];
  const pair=pairs.find(p=>p.deviceReleaseId===request.deviceReleaseId&&p.deviceSourceCommitOid===request.runtime.sourceCommitOid&&p.deviceArtifactDigest===request.runtime.bundleDigest&&p.schemaDigest===request.runtime.schemaDigest);requireThat(pair&&pointer.deviceReleaseId===pair.deviceReleaseId&&canonicalJson(pointer)===canonicalJson(await this.o.configs.pointerFor(pair)),'FORBIDDEN','No current pointer/activation admission for device');
  const baseline=pair.deviceReleaseId===this.o.baseline.deviceReleaseId,admitted=baseline?null:/** @type {{build:Build,previous:Pair}|null} */(this.read('helper.build:'+pair.deviceReleaseId));
  if(!baseline){requireThat(admitted&&admitted.build.manifest.sourceTreeOid===request.runtime.sourceTreeOid&&admitted.build.manifest.device.artifactDigest===request.runtime.bundleDigest,'INTEGRITY_FAILURE');await this.o.artifacts.verify(pair.deviceReleaseId,admitted.build.manifest,admitted.build.refs);}
  else requireThat(this.o.configs.template?.runtime.sourceTreeOid===request.runtime.sourceTreeOid,'INTEGRITY_FAILURE');
  return {schemaVersion:1,kind:'dev2.installed-runtime-admission',installationId:this.o.installationId,repositoryId:this.o.repositoryId,bindingEpoch:this.o.bindingEpoch,installationSealDigest:this.o.installationSealDigest,executor:this.o.executor,deviceReleaseId:pair.deviceReleaseId,runtime:request.runtime,pair,manifest:admitted?.build.manifest??null,buildReceiptDigest:admitted?recordDigest('dev2.helper-admitted-build-receipt.v1',admitted.build.receipt):null,activationId:current?.intent.activationId??null,baseline};
 }
}
