import {canonicalJson} from '../contracts/canonical.mjs';
import {newId} from '../contracts/identity.mjs';
import {requireThat} from '../contracts/errors.mjs';
/** @typedef {import('../contracts/ports.js').Effect} Effect */
/** @typedef {import('../contracts/ports.js').EffectObservation} Observation */
/** @typedef {import('../contracts/ports.js').PreparedResult} Result */
/** @typedef {import('../contracts/ports.js').ValidationReceipt} Receipt */
/** Ref linearization, not a branch-wide workflow lock. A lost response retains
 * the same frozen effect while independent work continues on the same ref.
 */
export class ExactIntegrator {
 /** @param {{binding:import('../contracts/ports.js').Binding,ledger:import('../storage/ledger.mjs').Ledger,repository:import('../repository/git.mjs').GitRepository,remote:{resolve:()=>Promise<import('../contracts/ports.js').RefObservation>,fetch:(head:string)=>Promise<void>,compareUpdate:(effect:Effect)=>Promise<{kind:'sent'|'rejected'|'uncertain'}>},validation:import('../contracts/ports.js').ValidationPort,verifyLineage:(head:string)=>Promise<boolean>,authorize:()=>Promise<void>,senderStopped?:(effect:Effect)=>Promise<boolean>,now?:()=>number,fault?:(point:string,effect:Effect)=>Promise<void>}} options */
 constructor(options){this.o=options;this.active=new Set();this.now=options.now??Date.now;this.fault=options.fault??(async()=>{});}
 /** @param {Effect} effect @param {boolean} senderStopped @returns {Promise<Observation>} */
 async reconcile(effect,senderStopped){
  const b=this.o.binding;requireThat(effect.repositoryId===b.repositoryId&&effect.bindingEpoch===b.bindingEpoch&&effect.ref===b.ref,'FORBIDDEN');
  try{const observed=await this.o.remote.resolve();await this.o.remote.fetch(observed.head);
   if(!await this.o.verifyLineage(observed.head))return {kind:'binding_fenced'};
   if(observed.head===effect.commitOid||await this.o.repository.isAncestor(b,effect.commitOid,observed.head))return {kind:'integrated',observedHead:observed.head,observedAt:observed.observedAt};
   if(observed.head===effect.expectedHead)return {kind:senderStopped&&!this.active.has(effect.effectId)?'retryable':'uncertain'};
   if(await this.o.repository.isAncestor(b,effect.expectedHead,observed.head))return {kind:'stale',observedHead:observed.head};return {kind:'binding_fenced'};
  }catch{return {kind:'uncertain'};}
 }
 /** @param {import('../storage/ledger.mjs').Transaction} tx @param {string} actionId @param {Result} result */
 fence(tx,actionId,result){
  const w=tx.getWork(result.workId),a=tx.getAction(actionId);
  requireThat(w&&a&&a.status==='running'&&a.ownerEpoch===this.o.ledger.ownerEpoch&&a.deadline>this.now()&&w.currentActionId===actionId&&w.disposition==='open'&&w.generation===result.generation&&w.candidate.treeOid===result.candidateTreeOid&&w.baseCommitOid===result.baseCommitOid&&w.baseTreeOid===result.baseTreeOid&&tx.get('SELECT value FROM meta WHERE key=?','cancel:'+actionId)?.value!=='true','STALE_REVISION');return a;
 }
 /** @param {string} actionId @param {Result} result @param {Receipt} receipt */
 async intent(actionId,result,receipt){
  await this.o.authorize();const b=this.o.binding;requireThat(await this.o.validation.eligible(result,receipt,b.policyDigest,this.o.ledger.ownerEpoch),'VALIDATION_FAILED');
  const c=await this.o.repository.readCommit(b,result.commitOid);requireThat(c.parents.length===1&&c.parents[0]===result.expectedHead&&c.source.treeOid===result.resultTreeOid&&c.source.manifestDigest===result.resultTreeSha256,'INTEGRITY_FAILURE');
  return this.o.ledger.transact(tx=>{const action=this.fence(tx,actionId,result),old=tx.getEffect(actionId);
   if(old){requireThat(old.preparedResultId===result.resultId&&old.validationId===receipt.validationId&&old.policyDigest===b.policyDigest&&old.commitOid===result.commitOid,'IDEMPOTENCY_MISMATCH');return old;}
   const effect={effectId:newId(),workId:result.workId,actionId,repositoryId:b.repositoryId,bindingEpoch:b.bindingEpoch,ref:b.ref,expectedHead:result.expectedHead,commitOid:result.commitOid,preparedResultId:result.resultId,validationId:receipt.validationId,policyDigest:result.policyDigest};
   tx.putReceipt(receipt);tx.putEffect(effect);tx.updateAction({...action,resultId:result.resultId,step:'publication.intent'});return effect;
  });
 }
 /** Stop evidence comes from the installation's durable sender, never a public
  * argument or a missing JavaScript promise. Fixture callers may provide it.
  * @param {Effect} effect @param {Result} result @param {Receipt} receipt @param {boolean} senderStopped @returns {Promise<Observation>} */
 async publish(effect,result,receipt,senderStopped){
  const stopped=this.o.senderStopped?await this.o.senderStopped(effect):senderStopped;
  const observed=await this.reconcile(effect,stopped);if(observed.kind!=='retryable')return observed;
  requireThat(!this.active.has(effect.effectId),'EFFECT_UNCERTAIN');this.active.add(effect.effectId);
  try{
   await this.fault('before-send',effect);
   await this.o.authorize();requireThat(await this.o.validation.eligible(result,receipt,this.o.binding.policyDigest,this.o.ledger.ownerEpoch),'VALIDATION_FAILED');
   this.o.ledger.transact(tx=>{this.fence(tx,effect.actionId,result);requireThat(canonicalJson(tx.getEffect(effect.actionId))===canonicalJson(effect),'STALE_REVISION');});
   await this.o.remote.compareUpdate(effect);await this.fault('after-send',effect);
  }catch(error){
   // Provider faults retain unknown delivery. Authorization/fence failures must
   // remain explicit rather than being mislabeled as a successful send.
   if(error&&typeof error==='object'&&'code'in error&&['FORBIDDEN','UNAUTHORIZED','VALIDATION_FAILED','STALE_REVISION'].includes(String(error.code)))throw error;
   return {kind:'uncertain'};
  }finally{this.active.delete(effect.effectId);}
  return this.reconcile(effect,this.o.senderStopped?await this.o.senderStopped(effect):true);
 }
}
