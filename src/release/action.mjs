import {requireThat} from '../contracts/errors.mjs';
/** A policy/staging action has no source work fence. Its durable principal,
 * operation, attempt, owner epoch, cancellation and deadline still fence every
 * asynchronous continuation. A replacement owner must explicitly reconcile the
 * old effect; an old continuation cannot borrow a new owner epoch.
 * @param {import('../storage/ledger.mjs').Ledger} ledger
 * @param {string} actionId @param {string} operation @param {string} principal
 * @param {()=>number} [now]
 */
export function specialActionFence(ledger,actionId,operation,principal,now=Date.now){
 const ownerEpoch=ledger.ownerEpoch;
 const first=ledger.transact(tx=>tx.getAction(actionId));
 requireThat(first&&first.operation===operation&&first.principal===principal&&first.bindingEpoch===ledger.binding.bindingEpoch&&first.workId===null&&first.ownerEpoch===ownerEpoch&&first.status==='running','STALE_REVISION');
 const attempt=first.attempt;
 /** @param {import('../storage/ledger.mjs').Transaction} tx */
 const check=tx=>{
  const action=tx.getAction(actionId);
  requireThat(ledger.ownerEpoch===ownerEpoch&&action&&action.ownerEpoch===ownerEpoch&&action.attempt===attempt&&action.status==='running'&&action.operation===operation&&action.principal===principal&&action.bindingEpoch===ledger.binding.bindingEpoch&&action.deadline>now()&&tx.get('SELECT value FROM meta WHERE key=?','cancel:'+actionId)?.value!=='true','STALE_REVISION','Policy/release action was cancelled, expired or superseded');
  return action;
 };
 const assert=()=>ledger.transact(check);assert();
 return {ownerEpoch,attempt,check,assert};
}
