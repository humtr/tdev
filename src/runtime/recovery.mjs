import {canonicalJson,parseRecord,recordDigest} from '../contracts/canonical.mjs';
import {requireThat} from '../contracts/errors.mjs';
/** @typedef {import('../contracts/ports.js').Principal} Principal */
/** @typedef {import('../contracts/ports.js').Action} Action */
/** @typedef {import('../contracts/ports.js').Attempt} Attempt */
/** @typedef {import('../contracts/ports.js').Work} Work */
/** @typedef {import('../contracts/ports.js').Effect} Effect */
/** @typedef {import('../contracts/ports.js').EffectObservation} Observation */
/** @typedef {import('../contracts/ports.js').PreparedResult} Result */
/** @typedef {import('../contracts/ports.js').ValidationReceipt} Receipt */
/** @typedef {import('../storage/ledger.mjs').Transaction} Transaction */
/** @typedef {{attempt:Attempt,observerEpoch:string,held:boolean}} Reservation */
/** @typedef {{action:Action,work:Work,reservation:Reservation|null,effect:Effect|null,result:Result|null,receipt:Receipt|null,cancelled:boolean}} Frame */
/** @typedef {{frame:Frame,stamp:string,mode:'blocked'|'retry'|'terminal'|'already',status?:'succeeded'|'failed'|'cancelled',errorCode?:string,disposition?:'integrated',observation?:Observation}} Plan */
/** Reconciliation of existing rows, not another queue or workflow owner. A plan
 * has no effect authority: its exact short-transaction stamp and current human
 * grant must still match when the resume request is admitted.
 */
export class ActionRecovery {
 /** @param {import('./engine.mjs').DevelopmentEngine} engine */
 constructor(engine){this.engine=engine;this.ledger=engine.ledger;}
 /** Acquisition of the exclusive SQLite writer permits observer adoption, not a
  * claim that an old executor or Git sender has stopped. Launch tuples remain
  * immutable. Work without a runtime component continues to be admitted.
  */
 adopt(){let after=0,changed=0;for(;;){const batch=this.ledger.transact(tx=>{
  const rows=tx.all("SELECT seq,record FROM action WHERE status IN ('running','blocked') AND seq>? ORDER BY seq LIMIT 64",after);
  for(const row of rows){const action=/** @type {Action} */(parseRecord(String(row.record)));if(action.ownerEpoch===this.ledger.ownerEpoch)continue;
   const reservations=tx.all('SELECT attempt_id FROM attempt WHERE action_id=? AND json_extract(record,\'$.attempt\')=?',action.actionId,action.attempt);
   requireThat(reservations.length<=1,'INTEGRITY_FAILURE','Ambiguous retained attempt');
   for(const reservation of reservations)tx.adoptAttempt(String(reservation.attempt_id));
   tx.updateAction({...action,status:'blocked',step:'recovery.required',ownerEpoch:this.ledger.ownerEpoch,errorCode:'EFFECT_UNCERTAIN'});changed++;
  }
  return {size:rows.length,last:rows.length?Number(rows[rows.length-1].seq):after};
 });after=batch.last;if(batch.size<64)return changed;}}
 /** @param {Transaction} tx @param {string} actionId @param {string} subject @returns {Frame} */
 snapshot(tx,actionId,subject){
  const action=tx.getAction(actionId);requireThat(action&&action.principal===subject&&action.workId,'FORBIDDEN');
  const work=tx.getWork(action.workId);requireThat(work&&work.principal===subject,'FORBIDDEN');
  const rows=tx.all('SELECT attempt_id FROM attempt WHERE action_id=? AND json_extract(record,\'$.attempt\')=?',actionId,action.attempt);requireThat(rows.length<=1,'INTEGRITY_FAILURE');
  const reservation=rows.length?tx.retainedAttempt(String(rows[0].attempt_id)):null,effect=tx.getEffect(actionId);
  const resultId=effect?.preparedResultId??action.resultId,result=resultId?tx.getPrepared(resultId):null;
  const row=result?tx.get('SELECT record FROM validation WHERE result_id=? ORDER BY rowid DESC LIMIT 1',result.resultId):null;
  const receipt=row?/** @type {Receipt} */(parseRecord(String(row.record))):null;
  return {action,work,reservation,effect,result,receipt,cancelled:tx.get('SELECT value FROM meta WHERE key=?','cancel:'+actionId)?.value==='true'};
 }
 /** @param {Frame} frame */
 stamp(frame){return recordDigest('dev2.recovery-frame.v1',frame);}
 /** Observe only; no new attempt or provider effect is created here.
  * @param {Principal} principal @param {string} actionId @param {string} expectedRevision @returns {Promise<Plan>} */
 async plan(principal,actionId,expectedRevision){
  const item=this.engine.input(actionId);await this.engine.authorize(principal,item);
  const frame=this.ledger.transact(tx=>this.snapshot(tx,actionId,principal.subject));
  requireThat(frame.work.revision===expectedRevision,'STALE_REVISION');const stamp=this.stamp(frame);
  const base={frame,stamp};
  if(['succeeded','failed','cancelled'].includes(frame.action.status))return {...base,mode:'already'};
  requireThat(frame.work.currentActionId===actionId&&frame.action.status==='blocked'&&!this.engine.running.has(actionId),'EFFECT_UNCERTAIN','Existing action is still executing');
  const reservation=frame.reservation;
  requireThat(reservation&&reservation.observerEpoch===this.ledger.ownerEpoch&&frame.action.ownerEpoch===this.ledger.ownerEpoch,'EFFECT_UNCERTAIN','Retained execution identity is not reconciled');
  let stopped=!reservation.held;
  if(!stopped&&this.engine.o.attemptStopped)try{stopped=await this.engine.o.attemptStopped(reservation.attempt);}catch{stopped=false;}
  let senderStopped=true,observation=/** @type {Observation|undefined} */(undefined);
  if(frame.effect){senderStopped=await this.engine.senderStopped(frame.effect);observation=await this.engine.integrator(principal,item).reconcile(frame.effect,senderStopped);}
  if(!stopped||!senderStopped)return {...base,mode:'blocked',errorCode:'EFFECT_UNCERTAIN',observation};
  if(observation){
   if(observation.kind==='integrated')return {...base,mode:'terminal',status:'succeeded',disposition:'integrated',observation};
   if(observation.kind==='stale')return {...base,mode:'terminal',status:'failed',errorCode:'CONTENDED_REF',observation};
   if(observation.kind!=='retryable')return {...base,mode:'blocked',errorCode:'EFFECT_UNCERTAIN',observation};
  }
  if(frame.cancelled||frame.action.deadline<=this.engine.now())return {...base,mode:'terminal',status:'cancelled',observation};
  if(item.policyDigest!==this.engine.binding.policyDigest)return {...base,mode:'terminal',status:'failed',errorCode:'STALE_RESULT',observation};
  if(frame.result&&frame.result.policyDigest!==this.engine.binding.policyDigest)return {...base,mode:'terminal',status:'failed',errorCode:'STALE_RESULT',observation};
  if(item.op==='validate'&&frame.result&&frame.receipt&&await this.engine.o.validation().eligible(frame.result,frame.receipt,this.engine.binding.policyDigest,this.ledger.ownerEpoch))return {...base,mode:'terminal',status:'succeeded'};
  if(item.op==='run'){
   const profile=this.engine.o.policy().profile(String(item.profileId),item.parameters??null);
   if(!profile.replaySafe)return {...base,mode:'terminal',status:'failed',errorCode:'EFFECT_UNCERTAIN'};
  }else if(!['validate','integrate'].includes(item.op))return {...base,mode:'blocked',errorCode:'EXECUTION_UNAVAILABLE'};
  else if(!this.engine.o.policy().required().every(profile=>profile.replaySafe))return {...base,mode:'terminal',status:'failed',errorCode:'EFFECT_UNCERTAIN'};
  return {...base,mode:'retry',observation};
 }
 /** Commit this inspected outcome with the public resume receipt. The original
  * action/effect/result and its deadline are retained, never synthesized again.
  * @param {Transaction} tx @param {Plan} plan @param {Principal} principal @returns {Work} */
 apply(tx,plan,principal){
  const current=this.snapshot(tx,plan.frame.action.actionId,principal.subject);
  requireThat(this.stamp(current)===plan.stamp,'STALE_REVISION','Recovery evidence changed');
  const {action,work,reservation}=current;
  if(plan.mode==='already')return work;
  requireThat(reservation&&reservation.observerEpoch===this.ledger.ownerEpoch&&!this.engine.running.has(action.actionId),'STALE_REVISION');
  if(plan.observation)tx.run('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value','effect-observation:'+action.actionId,canonicalJson(plan.observation));
  if(plan.mode==='blocked'){
   tx.updateAction({...action,status:'blocked',step:'recovery.external',errorCode:plan.errorCode??'EFFECT_UNCERTAIN'});return work;
  }
  if(plan.mode==='retry'){
   requireThat(action.deadline>this.engine.now()&&!current.cancelled,'STALE_REVISION');
   tx.releaseAttempt(reservation.attempt.attemptId);
   tx.run('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value','principal:'+action.actionId,canonicalJson(principal));
   tx.updateAction({...action,status:'queued',step:'reconciled.retry',ownerEpoch:this.ledger.ownerEpoch,errorCode:null});return work;
  }
  requireThat(plan.status,'INTEGRITY_FAILURE');
  this.engine.coordinator.settleIn(tx,reservation.attempt,this.ledger.ownerEpoch,plan.status,{stopped:true,effectResolved:true,resultId:current.result?.resultId,errorCode:plan.errorCode,disposition:plan.disposition,step:plan.disposition&&current.cancelled?'complete.cancel_too_late':'complete.recovered'});
  const next=tx.getWork(work.workId);requireThat(next,'INTEGRITY_FAILURE');return next;
 }
}
