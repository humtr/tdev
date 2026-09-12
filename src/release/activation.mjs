import {canonicalJson,recordDigest} from '../contracts/canonical.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {runtimePair} from './manifest.mjs';
/** @typedef {import('./types.js').ActivationRecord} Record */
/** @typedef {import('./types.js').ActivationEffect} Effect */
/** @typedef {import('./types.js').ActivationReceipt} Receipt */
/** @typedef {import('./types.js').ActivationStep} Step */
/** Both directions switch the compatible edge first and require a verified
 * stopped-writer handoff before the device pointer. Unknown sends are reconciled
 * before rollback; elapsed time is never termination evidence.
 * @type {readonly Step[]} */
const STEPS=['edge.activate','device.drain','device.stop','device.switch','device.start','pair.check'];
/** @param {Record} record @returns {readonly Step[]} */
export function activationSteps(record){
 const {previous,target}=record.intent;
 return STEPS.filter(step=>step==='pair.check'||(step==='edge.activate'
  ?previous.edgeVersionId!==target.edgeVersionId
  :previous.deviceReleaseId!==target.deviceReleaseId));
}
/** @param {Record} record @param {Step} [selectedStep] @returns {Effect} */
export function activationEffect(record,selectedStep){
 const step=selectedStep??activationSteps(record)[record.cursor];requireThat(step,'INTEGRITY_FAILURE');
 const fields={activationId:record.intent.activationId,direction:record.direction,step,expected:record.direction==='forward'?record.intent.previous:record.intent.target,target:record.direction==='forward'?record.intent.target:record.intent.previous};
 const inputDigest=recordDigest('dev2.activation-effect-input.v1',fields);
 return {...fields,inputDigest,effectId:recordDigest('dev2.activation-effect.v1',{intentDigest:record.intentDigest,inputDigest}).slice(7)};
}
/** @param {Effect} effect @param {Receipt} receipt @param {number} now */
function validReceipt(effect,receipt,now){
 requireThat(receipt&&receipt.effectId===effect.effectId&&receipt.inputDigest===effect.inputDigest&&['applied','not_applied','pending','failed','conflict'].includes(receipt.kind)&&typeof receipt.senderStopped==='boolean'&&Number.isSafeInteger(receipt.observedAt)&&receipt.observedAt<=now+5000&&receipt.observedAt>=now-60000&&receipt.output&&typeof receipt.output==='object'&&!Array.isArray(receipt.output),'INTEGRITY_FAILURE','Unbound or stale activation readback');
 requireThat(Buffer.byteLength(canonicalJson(receipt))<=32768,'LIMIT_EXCEEDED');
 if(['applied','failed','not_applied'].includes(receipt.kind))requireThat(receipt.senderStopped,'EFFECT_UNCERTAIN','A sender may still change the component');
 if(receipt.kind!=='applied')return;
 if(effect.step==='edge.activate')requireThat(receipt.output.edgeVersionId===effect.target.edgeVersionId,'INTEGRITY_FAILURE');
 if(effect.step==='device.drain')requireThat(receipt.output.drained===true,'INTEGRITY_FAILURE');
 if(effect.step==='device.stop')requireThat(receipt.output.writerStopped===true,'INTEGRITY_FAILURE');
 if(effect.step==='device.switch'||effect.step==='device.start')requireThat(receipt.output.deviceReleaseId===effect.target.deviceReleaseId,'INTEGRITY_FAILURE');
 if(effect.step==='pair.check'){
  const observed=runtimePair(/** @type {import('./types.js').RuntimePair} */(/** @type {unknown} */(receipt.output.pair)));
  requireThat(receipt.output.healthy===true&&canonicalJson(observed)===canonicalJson(effect.target),'INTEGRITY_FAILURE','Partial rollout is not success');
 }
}
/** Fixed sealed activation vocabulary, not a shell or development queue. Ports
 * must provide positive response-loss/sender-stop proof for their exact effects.
 */
export class ActivationController {
 /** @param {{journal:import('./journal.mjs').ActivationJournal,port:import('./types.js').ActivationPort,now?:()=>number}} options */
 constructor(options){this.o=options;this.now=options.now??Date.now;/** @type {Map<string,Promise<Record>>} */this.running=new Map();}
 /** @param {Record} record @param {Partial<Record>} fields @param {string} epoch */
 save(record,fields,epoch){return this.o.journal.replace(record.revision,{...record,...fields},epoch);}
 /** @param {string} activationId @returns {Promise<Record>} */
 drive(activationId){const old=this.running.get(activationId);if(old)return old;const run=this.advance(activationId).finally(()=>this.running.delete(activationId));this.running.set(activationId,run);return run;}
 /** @param {string} activationId @returns {Promise<Record>} */
 async advance(activationId){
  const epoch=this.o.journal.ownerEpoch;let record=this.o.journal.read(activationId);requireThat(record,'INVALID_ARGUMENT','Unknown activation');
  for(let transitions=0;transitions<32;transitions++){
   if(['active','rolled_back'].includes(record.phase))return record;
   if(!record.pending&&record.direction==='forward'&&this.now()>=record.intent.deadline)record=this.save(record,{direction:'rollback',cursor:0,reason:'activation_deadline',phase:'checking'},epoch);
   if(!record.pending){
    const effect=activationEffect(record);
    if(effect.step==='device.switch'){
     const stopId=activationEffect(record,'device.stop').effectId;
     const stopped=record.receipts.find(r=>r.effectId===stopId);
     requireThat(stopped?.kind==='applied'&&stopped.output.writerStopped===true,'EFFECT_UNCERTAIN','No stopped-writer proof for this exact handoff');
    }
    const phase=effect.step==='pair.check'?'checking':effect.step==='device.drain'||effect.step==='device.stop'?'draining':'switching';
    record=this.save(record,{pending:{effect,state:'planned',sends:0},phase,reason:record.direction==='forward'?null:record.reason},epoch);
   }
   const pending=record.pending;requireThat(pending,'INTEGRITY_FAILURE');const effect=pending.effect;
   /** @type {Receipt} */let receipt;
   try{
    receipt=await this.o.port.reconcile(effect);validReceipt(effect,receipt,this.now());
    requireThat(this.o.journal.ownerEpoch===epoch&&!this.o.journal.closed,'STALE_REVISION');
    if(receipt.kind==='not_applied'){
     requireThat(receipt.senderStopped,'EFFECT_UNCERTAIN');
     if(record.direction==='forward'&&this.now()>=record.intent.deadline){record=this.save(record,{pending:null,direction:'rollback',cursor:0,reason:'activation_deadline',phase:'checking'},epoch);continue;}
     // The sent marker is durable before invoking any provider or launcher.
     record=this.save(record,{pending:{...pending,state:'sent',sends:pending.sends+1}},epoch);
     receipt=await this.o.port.execute(effect);validReceipt(effect,receipt,this.now());
     requireThat(this.o.journal.ownerEpoch===epoch&&!this.o.journal.closed,'STALE_REVISION');
    }
   }catch(error){
    // A thrown response may follow an applied effect. Do not start an opposite
    // effect or create a replacement ID until this exact send is reconciled.
    if(this.o.journal.closed||this.o.journal.ownerEpoch!==epoch)throw error;
    const reason=error&&typeof error==='object'&&'code'in error?String(error.code):'EFFECT_UNCERTAIN';
    return this.save(record,{phase:'blocked',reason},epoch);
   }
   if(receipt.kind==='pending'||receipt.kind==='conflict'||receipt.kind==='not_applied')return this.save(record,{phase:'blocked',reason:receipt.kind==='conflict'?'foreign_component':'external_effect_uncertain'},epoch);
   if(receipt.kind==='failed'){
    if(record.direction==='rollback')return this.save(record,{phase:'blocked',reason:'rollback_failed'},epoch);
    record=this.save(record,{direction:'rollback',cursor:0,pending:null,reason:'activation_failed',phase:'checking',receipts:[...record.receipts,receipt]},epoch);continue;
   }
   requireThat(receipt.kind==='applied','INTEGRITY_FAILURE');
   const receipts=[...record.receipts.filter(r=>r.effectId!==receipt.effectId),receipt];
   if(effect.step==='pair.check'){
    const observedPair=runtimePair(/** @type {import('./types.js').RuntimePair} */(/** @type {unknown} */(receipt.output.pair)));
    return this.save(record,{phase:record.direction==='forward'?'active':'rolled_back',pending:null,receipts,observedPair,cursor:record.cursor+1,reason:record.direction==='forward'?null:record.reason},epoch);
   }
   record=this.save(record,{cursor:record.cursor+1,pending:null,receipts},epoch);
  }
  return this.save(record,{phase:'blocked',reason:'bounded_reconciliation_yield'},epoch);
 }
}
