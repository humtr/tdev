import { canonicalJson } from '../contracts/canonical.mjs';
import { newId } from '../contracts/identity.mjs';
import { requireThat } from '../contracts/errors.mjs';
/** @typedef {import('../contracts/ports.js').Effect} Effect */
/** @typedef {import('../contracts/ports.js').EffectObservation} Observation */
/** @typedef {import('../contracts/ports.js').PreparedResult} Result */
/** @typedef {import('../contracts/ports.js').ValidationReceipt} Receipt */
/** Ref linearization, not a branch-wide workflow lock. Lost response leaves one
 * frozen intent. A separate independent action may advance the same ref safely.
 */
export class ExactIntegrator {
 /** @param {{binding:import('../contracts/ports.js').Binding,ledger:import('../storage/ledger.mjs').Ledger,repository:import('../repository/git.mjs').GitRepository,remote:{resolve:()=>Promise<import('../contracts/ports.js').RefObservation>,fetch:(head:string)=>Promise<void>,compareUpdate:(effect:Effect)=>Promise<{kind:'sent'|'rejected'|'uncertain'}>},validation:import('../contracts/ports.js').ValidationPort,verifyLineage:(head:string)=>Promise<boolean>,authorize:()=>Promise<void>,fault?:(point:string,effect:Effect)=>Promise<void>}} options */
 constructor(options){this.o=options;this.active=new Set();this.fault=options.fault??(async()=>{});}
 /** @param {Effect} effect @param {boolean} senderStopped @returns {Promise<Observation>} */
 async reconcile(effect,senderStopped){
 const b=this.o.binding;requireThat(effect.repositoryId===b.repositoryId&&effect.bindingEpoch===b.bindingEpoch&&effect.ref===b.ref,'FORBIDDEN');
 try{
  const observed=await this.o.remote.resolve();await this.o.remote.fetch(observed.head);
  if(!await this.o.verifyLineage(observed.head))return {kind:'binding_fenced'};
  if(observed.head===effect.commitOid||await this.o.repository.isAncestor(b,effect.commitOid,observed.head))return {kind:'integrated',observedHead:observed.head,observedAt:observed.observedAt};
  if(observed.head===effect.expectedHead)return {kind:senderStopped&&!this.active.has(effect.effectId)?'retryable':'uncertain'};
  if(await this.o.repository.isAncestor(b,effect.expectedHead,observed.head))return {kind:'stale',observedHead:observed.head};
  return {kind:'binding_fenced'};
 }catch{return {kind:'uncertain'};}
 }
 /** New effect is permitted only by the exact current successful receipt and work
 * reservation. The durable intent is committed before any provider command.
 * @param {string} actionId @param {Result} result @param {Receipt} receipt
 */
 async intent(actionId,result,receipt){
 await this.o.authorize();const b=this.o.binding;
 requireThat(await this.o.validation.eligible(result,receipt,b.policyDigest,this.o.ledger.ownerEpoch),'VALIDATION_FAILED');
 const c=await this.o.repository.readCommit(this.o.binding,result.commitOid);requireThat(c.parents.length===1&&c.parents[0]===result.expectedHead&&c.source.treeOid===result.resultTreeOid&&c.source.manifestDigest===result.resultTreeSha256,'INTEGRITY_FAILURE');
 return this.o.ledger.transact(tx=>{
  const old=tx.getEffect(actionId);if(old){requireThat(old.preparedResultId===result.resultId&&old.validationId===receipt.validationId,'IDEMPOTENCY_MISMATCH');return old;}
  const work=tx.getWork(result.workId),action=tx.getAction(actionId);requireThat(work&&action&&action.status==='running'&&work.currentActionId===actionId&&work.disposition==='open'&&work.generation===result.generation,'STALE_REVISION');
  const effect={effectId:newId(),workId:result.workId,actionId,repositoryId:b.repositoryId,bindingEpoch:b.bindingEpoch,ref:b.ref,expectedHead:result.expectedHead,commitOid:result.commitOid,preparedResultId:result.resultId,validationId:receipt.validationId,policyDigest:result.policyDigest};
  tx.putReceipt(receipt);tx.putEffect(effect);tx.updateAction({...action,resultId:result.resultId,step:'publication.intent'});return effect;
 });
 }
 /** senderStopped is evidence from the trusted dispatcher, never a public argument.
 * @param {Effect} effect @param {Result} result @param {Receipt} receipt @param {boolean} senderStopped
 * @returns {Promise<Observation>} */
 async publish(effect,result,receipt,senderStopped){
 const observed=await this.reconcile(effect,senderStopped);if(observed.kind!=='retryable')return observed;
 await this.o.authorize();requireThat(await this.o.validation.eligible(result,receipt,this.o.binding.policyDigest,this.o.ledger.ownerEpoch),'VALIDATION_FAILED');
 this.o.ledger.transact(tx=>{const action=tx.getAction(effect.actionId),w=tx.getWork(effect.workId);requireThat(action?.status==='running'&&w?.currentActionId===effect.actionId&&w.generation===result.generation&&canonicalJson(tx.getEffect(effect.actionId))===canonicalJson(effect),'STALE_REVISION');});
 requireThat(!this.active.has(effect.effectId),'EFFECT_UNCERTAIN');this.active.add(effect.effectId);
 try{await this.fault('before-send',effect);await this.o.remote.compareUpdate(effect);await this.fault('after-send',effect);}catch{return {kind:'uncertain'};}finally{this.active.delete(effect.effectId);}
 return this.reconcile(effect,true);
 }
}
