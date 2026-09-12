import {canonicalJson,parseRecord} from '../contracts/canonical.mjs';
import {requireThat} from '../contracts/errors.mjs';
/** @typedef {{stopped:boolean,effectResolved:boolean,output:import('../contracts/ports.js').Json|null}} SpecialObservation */
/** Recovery is over the retained special action, not a fabricated source work,
 * new provider sender, renewed deadline or replacement activation. Read-only
 * observation may settle a proven result; only an exact authenticated request
 * retry may requeue a proved-not-applied/stopped action.
 */
export class SpecialRecovery {
 /** @param {import('./engine.mjs').DevelopmentEngine} engine */
 constructor(engine){this.e=engine;}
 /** @param {import('../contracts/ports.js').Principal} principal @param {string} actionId @param {boolean} retry */
 async observe(principal,actionId,retry){
  const e=this.e;if(!e.o.specialRecovery||e.running.has(actionId))return;
  await e.o.authorization.authorize(principal,e.binding,'repository.read');
  const frame=e.ledger.transact(tx=>{const action=tx.getAction(actionId);requireThat(action&&action.principal===principal.subject,'FORBIDDEN');if(action.workId||action.status!=='blocked')return null;
   const row=tx.get('SELECT record FROM attempt WHERE action_id=? AND json_extract(record,\'$.attempt\')=?',actionId,action.attempt);requireThat(row&&action.ownerEpoch===e.ledger.ownerEpoch,'EFFECT_UNCERTAIN');const attempt=/** @type {import('../contracts/ports.js').Attempt} */(parseRecord(String(row.record))),retained=tx.retainedAttempt(attempt.attemptId);requireThat(retained?.observerEpoch===e.ledger.ownerEpoch,'STALE_REVISION');return {action,attempt,stamp:canonicalJson(action)};
  });if(!frame)return;
  const input=e.input(actionId);if(retry){requireThat(e.accepting,'EXECUTION_UNAVAILABLE','Runtime is draining');await e.authorize(principal,input);}
  const observed=await e.o.specialRecovery(frame.action);
  requireThat(typeof observed.stopped==='boolean'&&typeof observed.effectResolved==='boolean'&&(observed.output===null||observed.stopped&&observed.effectResolved),'INTEGRITY_FAILURE','Special result lacks stopped/effect evidence');
  if(retry)await e.authorize(principal,input);
  e.ledger.transact(tx=>{
   const action=tx.getAction(actionId);requireThat(action&&canonicalJson(action)===frame.stamp&&!e.running.has(actionId)&&action.ownerEpoch===e.ledger.ownerEpoch,'STALE_REVISION');
   const proof={stopped:observed.stopped,effectResolved:observed.effectResolved};
   if(observed.output!==null){tx.run('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value','action-result:'+actionId,canonicalJson(observed.output));e.coordinator.settleIn(tx,frame.attempt,e.ledger.ownerEpoch,'succeeded',{...proof,step:'complete.recovered'});return;}
   const cancelled=tx.get('SELECT value FROM meta WHERE key=?','cancel:'+actionId)?.value==='true';
   if(observed.stopped&&observed.effectResolved){
    if(cancelled||action.deadline<=e.now()){e.coordinator.settleIn(tx,frame.attempt,e.ledger.ownerEpoch,'cancelled',{...proof,step:'special.stopped'});return;}
    if(retry){tx.releaseAttempt(frame.attempt.attemptId);tx.run('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value','principal:'+actionId,canonicalJson(principal));tx.updateAction({...action,status:'queued',step:'special.reconciled.retry',errorCode:null});return;}
   }
   e.coordinator.settleIn(tx,frame.attempt,e.ledger.ownerEpoch,'blocked',{...proof,errorCode:observed.effectResolved?'EXECUTION_UNAVAILABLE':'EFFECT_UNCERTAIN',step:observed.stopped&&observed.effectResolved?'special.retryable':'special.reconcile'});
  });
 }
}
