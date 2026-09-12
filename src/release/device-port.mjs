import {canonicalJson,parseRecord} from '../contracts/canonical.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {runtimePair} from './manifest.mjs';
/** @typedef {import('./types.js').ActivationEffect} Effect */
/** @typedef {import('./types.js').ActivationReceipt} Receipt */
/** @typedef {import('./types.js').RuntimePair} Pair */
/** @typedef {import('./writer-fence.mjs').DevicePointer} Pointer */
/** @typedef {{schemaVersion:1,installationId:string,repositoryId:string,bindingEpoch:string,deviceReleaseId:string,sourceCommitOid:string,bundleDigest:string,schemaDigest:string,ownerEpoch:string,connected:boolean,accepting:boolean,drainActivationId:string|null,drained:boolean,edge:{versionId:string|null,sourceCommitOid:string,bundleDigest:string,schemaDigest:string}|null}} NativeStatus */
/** @typedef {{effect:Effect,createdAt:number,sent:boolean}} LocalEffect */
/** Fixed helper device port. The journal owns effect admission, runit owns the
 * designated service and the independent OS fence proves actual writer stop.
 * PID, a disconnected RPC, helper restart and elapsed time are not such proof.
 */
export class DeviceActivationPort {
 /** @param {{journal:import('./journal.mjs').ActivationJournal,installationId:string,repositoryId:string,bindingEpoch:string,writerFence:Pick<import('./writer-fence.mjs').WriterFence,'invoke'>,runit:Pick<import('./runit-control.mjs').RunitControl,'invoke'>,pointer:()=>Promise<Pointer>,pointerFor:(pair:Pair)=>Promise<Pointer>,native:{status:()=>Promise<NativeStatus>,drain:(effect:Effect)=>Promise<NativeStatus>},edge:{active:()=>Promise<{versionId:string}>},now?:()=>number,healthTimeoutMs?:number}} options */
 constructor(options){this.o=options;this.journal=options.journal;this.epoch=this.journal.ownerEpoch;this.now=options.now??Date.now;this.healthTimeoutMs=options.healthTimeoutMs??60000;requireThat(Number.isSafeInteger(this.healthTimeoutMs)&&this.healthTimeoutMs>=1000&&this.healthTimeoutMs<=120000,'INVALID_ARGUMENT');}
 /** @param {Effect} effect */
 assert(effect){requireThat(!this.journal.closed&&this.journal.ownerEpoch===this.epoch,'STALE_REVISION');const record=this.journal.read(effect.activationId);requireThat(record&&record.intent.installationId===this.o.installationId&&record.intent.repositoryId===this.o.repositoryId&&record.intent.bindingEpoch===this.o.bindingEpoch&&record.pending&&canonicalJson(record.pending.effect)===canonicalJson(effect),'FORBIDDEN','No exact current activation effect');return record;}
 /** @param {Effect} effect @returns {LocalEffect|null} */
 retained(effect){this.assert(effect);const row=this.journal.db.prepare('SELECT value FROM meta WHERE key=?').get('native.effect:'+effect.effectId);const value=row?/** @type {LocalEffect} */(parseRecord(String(row.value),65536)):null;if(value)requireThat(canonicalJson(value.effect)===canonicalJson(effect),'INTEGRITY_FAILURE');return value;}
 /** @param {Effect} effect */
 markSent(effect){return this.journal.transact(()=>{const record=this.assert(effect);requireThat(record.pending?.state==='sent','FORBIDDEN');const old=this.retained(effect);if(old)return old;const value={effect,createdAt:this.now(),sent:true};this.journal.db.prepare('INSERT INTO meta VALUES(?,?)').run('native.effect:'+effect.effectId,canonicalJson(value));return value;});}
 /** @param {Effect} e @param {Receipt['kind']} kind @param {Receipt['output']} [output] @param {boolean} [stopped] @returns {Receipt} */
 receipt(e,kind,output={},stopped=true){this.assert(e);return {effectId:e.effectId,inputDigest:e.inputDigest,kind,senderStopped:stopped,observedAt:this.now(),output};}
 /** @param {NativeStatus} value */
 status(value){requireThat(value&&value.schemaVersion===1&&value.installationId===this.o.installationId&&value.repositoryId===this.o.repositoryId&&value.bindingEpoch===this.o.bindingEpoch&&typeof value.connected==='boolean'&&typeof value.accepting==='boolean'&&typeof value.drained==='boolean'&&/^(0|[1-9][0-9]*)$/.test(value.ownerEpoch),'INTEGRITY_FAILURE','Native private status identity differs');return value;}
 /** @param {Effect} effect @param {Pointer} p @param {'expected'|'target'} which */
 matchesPointer(effect,p,which){const pair=effect[which];return p.installationId===this.o.installationId&&p.repositoryId===this.o.repositoryId&&p.bindingEpoch===this.o.bindingEpoch&&p.deviceReleaseId===pair.deviceReleaseId&&p.artifactDigest===pair.deviceArtifactDigest&&p.sourceCommitOid===pair.deviceSourceCommitOid&&p.schemaDigest===pair.schemaDigest;}
 /** @param {Effect} effect */
 expired(effect){const record=this.assert(effect),local=this.retained(effect);if(!local)return false;const deadline=effect.direction==='forward'?Math.min(record.intent.deadline,local.createdAt+this.healthTimeoutMs):local.createdAt+this.healthTimeoutMs;return this.now()>=deadline;}
 /** A status failure cannot fabricate a healthy or stopped native writer. */
 async readStatus(){try{return this.status(await this.o.native.status());}catch{return null;}}
 /** @param {Effect} effect @param {boolean} execute @returns {Promise<Receipt>} */
 async service(effect,execute){
  const observed=await this.o.runit.invoke(effect,execute?'run':'inspect');this.assert(effect);
  if(!observed.senderStopped||observed.delivery==='unknown')return this.receipt(effect,'pending',{},observed.senderStopped);
  if(observed.state==='fenced')return this.receipt(effect,'failed',{reason:'delayed_sender_fenced'});
  requireThat(observed.state==='done'&&observed.service,'INTEGRITY_FAILURE');
  const {pid,wanted,state}=observed.service;
  if(effect.step==='device.stop'){
   if(wanted!=='d')return this.receipt(effect,'conflict',{reason:'service_wanted_changed'});
   if(pid!==0||state!==0)return this.receipt(effect,this.expired(effect)?'failed':'pending',{reason:'service_still_running'});
   const expected=await this.o.pointerFor(effect.expected),target=await this.o.pointerFor(effect.target);this.assert(effect);
   const proof=await this.o.writerFence.invoke(effect,expected,target,'probe');this.assert(effect);
   return this.receipt(effect,proof.writerStopped?'applied':'pending',proof.writerStopped?{writerStopped:true,ownerEpoch:proof.ownerEpoch??null,senderCount:proof.senderCount??null}:{});
  }
  requireThat(effect.step==='device.start','INTEGRITY_FAILURE');
  if(wanted!=='u')return this.receipt(effect,'conflict',{reason:'service_wanted_changed'});
  const current=await this.o.pointer();this.assert(effect);if(!this.matchesPointer(effect,current,'target'))return this.receipt(effect,'conflict',{reason:'pointer_changed'});
  const health=await this.readStatus();this.assert(effect);
  const exact=pid>0&&state===1&&health&&health.deviceReleaseId===effect.target.deviceReleaseId&&health.sourceCommitOid===effect.target.deviceSourceCommitOid&&health.bundleDigest===effect.target.deviceArtifactDigest&&health.schemaDigest===effect.target.schemaDigest;
  return this.receipt(effect,exact?'applied':this.expired(effect)?'failed':'pending',exact?{deviceReleaseId:effect.target.deviceReleaseId,ownerEpoch:health.ownerEpoch}:{reason:'native_start_not_verified'});
 }
 /** @param {Effect} effect @returns {Promise<Receipt>} */
 async pair(effect){
  const [edge,pointer,native]=await Promise.all([this.o.edge.active(),this.o.pointer(),this.readStatus()]);this.assert(effect);
  if(!this.matchesPointer(effect,pointer,'target'))return this.receipt(effect,'conflict',{reason:'pointer_changed'});
  const p=effect.target,exact=native&&native.connected&&native.accepting&&native.deviceReleaseId===p.deviceReleaseId&&native.sourceCommitOid===p.deviceSourceCommitOid&&native.bundleDigest===p.deviceArtifactDigest&&native.schemaDigest===p.schemaDigest&&edge.versionId===p.edgeVersionId&&native.edge?.versionId===p.edgeVersionId&&native.edge.sourceCommitOid===p.edgeSourceCommitOid&&native.edge.bundleDigest===p.edgeArtifactDigest&&native.edge.schemaDigest===p.schemaDigest;
  return this.receipt(effect,exact?'applied':this.expired(effect)?'failed':'pending',exact?{healthy:true,pair:/** @type {import('../contracts/ports.js').Json} */(/** @type {unknown} */({...runtimePair(p)}))}:{reason:'paired_health_not_verified'});
 }
 /** @param {Effect} effect @returns {Promise<Receipt>} */
 async reconcile(effect){this.assert(effect);requireThat(effect.step!=='edge.activate','FORBIDDEN');const retained=this.retained(effect);if(!retained)return this.receipt(effect,'not_applied');
  if(effect.step==='pair.check')return this.pair(effect);
  if(effect.step==='device.stop'||effect.step==='device.start')return this.service(effect,false);
  if(effect.step==='device.switch')return this.switch(effect);
  const native=await this.readStatus();this.assert(effect);if(native?.drainActivationId===effect.activationId&&native.drained)return this.receipt(effect,'applied',{drained:true,ownerEpoch:native.ownerEpoch});
  return this.receipt(effect,this.expired(effect)?'failed':'pending',{reason:'native_drain_not_verified'});
 }
 /** Same retained pointer operation may reconcile after response loss; the OS
  * helper itself acquires the exclusive effect/launcher/writer/sender gates.
  * @param {Effect} effect @returns {Promise<Receipt>} */
 async switch(effect){const current=await this.o.pointer();this.assert(effect);if(!this.matchesPointer(effect,current,'expected')&&!this.matchesPointer(effect,current,'target'))return this.receipt(effect,'conflict',{reason:'foreign_device_pointer'});
  const expected=await this.o.pointerFor(effect.expected),target=await this.o.pointerFor(effect.target);this.assert(effect);const proof=await this.o.writerFence.invoke(effect,expected,target,'switch');this.assert(effect);return this.receipt(effect,proof.writerStopped&&proof.state==='switched'?'applied':'pending',proof.writerStopped&&proof.state==='switched'?{deviceReleaseId:effect.target.deviceReleaseId}:{});
 }
 /** @param {Effect} effect @returns {Promise<Receipt>} */
 async execute(effect){this.markSent(effect);if(effect.step==='device.stop'||effect.step==='device.start')return this.service(effect,true);if(effect.step==='device.switch')return this.switch(effect);if(effect.step==='pair.check')return this.pair(effect);requireThat(effect.step==='device.drain','FORBIDDEN');
  const status=this.status(await this.o.native.drain(effect));this.assert(effect);return this.receipt(effect,status.drainActivationId===effect.activationId&&status.drained?'applied':'pending',{drained:status.drainActivationId===effect.activationId&&status.drained,ownerEpoch:status.ownerEpoch});
 }
}
