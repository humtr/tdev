import { id,newId,nextRevision,capacity } from '../contracts/identity.mjs';
import { recordDigest,canonicalJson } from '../contracts/canonical.mjs';
import { requireThat } from '../contracts/errors.mjs';
/** @typedef {import('../storage/ledger.mjs').Ledger} Ledger */
/** @typedef {import('../storage/ledger.mjs').Transaction} Transaction */
/** @typedef {import('../contracts/ports.js').Work} Work */
/** @typedef {import('../contracts/ports.js').Action} Action */
/** @typedef {import('../contracts/ports.js').Attempt} Attempt */

/** Authentication and immutable byte preparation occur outside this short synchronous owner. */
export class WorkCoordinator {
  /** @param {Ledger} ledger @param {{executionCapacity?:number,maxPending?:number,now?:()=>number,ids?:()=>string}} [options] */
  constructor(ledger,options={}){this.ledger=ledger;this.executionCapacity=capacity(options.executionCapacity);this.maxPending=options.maxPending??1024;this.now=options.now??Date.now;this.ids=options.ids??newId;requireThat(Number.isSafeInteger(this.maxPending)&&this.maxPending>0&&this.maxPending<=100000,'INVALID_ARGUMENT');}
  /** Auth is always checked before dedup. Callback must only mutate ledger rows.
   * @param {{principal:string,requestId:string,operation:string,intent:unknown,authorize:()=>Promise<void>,deadline:number,inline?:boolean,mutate:(tx:Transaction,actionId:string)=>Work|null}} request
   */
  async admit(request){await request.authorize();id(request.requestId);
    const intentDigest=recordDigest('dev2.mutation-intent.v1',{repositoryId:this.ledger.binding.repositoryId,bindingEpoch:this.ledger.binding.bindingEpoch,operation:request.operation,intent:request.intent});
    return this.ledger.transact(tx=>{
      const duplicate=tx.lookupRequest(request.principal,this.ledger.binding.bindingEpoch,request.requestId);
      if(duplicate){requireThat(duplicate.intentDigest===intentDigest,'IDEMPOTENCY_MISMATCH');return {action:duplicate,work:duplicate.workId?tx.getWork(duplicate.workId):null,deduplicated:true};}
    requireThat(Number.isSafeInteger(request.deadline)&&request.deadline>this.now(),'INVALID_ARGUMENT');

      requireThat(Number(tx.get("SELECT count(*) n FROM action WHERE status IN ('queued','running','blocked')")?.n)<this.maxPending,'CAPACITY_REJECTED');
      const actionId=this.ids();const work=request.mutate(tx,actionId);
      /** @type {Action} */
      const action={actionId,requestId:request.requestId,principal:request.principal,bindingEpoch:this.ledger.binding.bindingEpoch,intentDigest,operation:request.operation,
        workId:work?.workId??null,status:request.inline?'succeeded':'queued',step:request.inline?'complete':'admitted',attempt:'0',ownerEpoch:this.ledger.ownerEpoch,deadline:request.deadline,resultId:null,errorCode:null};
      tx.insertAction(action,request.intent);return {action,work,deduplicated:false};
    });
  }
  /** @param {Transaction} tx @param {string} workId @param {string} principal @param {string} expectedRevision @param {string} generation @returns {Work} */
  fence(tx,workId,principal,expectedRevision,generation){const work=tx.getWork(workId);requireThat(work&&work.principal===principal,'FORBIDDEN');
    requireThat(work.revision===expectedRevision,'STALE_REVISION');requireThat(work.generation===generation,'STALE_BASE');
    requireThat(work.disposition==='open'&&!work.currentActionId,'STALE_REVISION','Work is fenced');return work;}
  /** One ready row per principal, then rotate the durable principal cursor; blocked rows are not candidates.
   * @returns {{action:Action,attempt:Attempt}|null}
   */
  takeReady(){return this.ledger.transact(tx=>{
    if(tx.reservations().length>=this.executionCapacity)return null;
    for(let scan=0;scan<64;scan++){
    const previous=String(tx.get("SELECT value FROM meta WHERE key='dispatchPrincipal'")?.value??'');
    const row=tx.get(`SELECT record FROM (SELECT record,principal,seq,ROW_NUMBER() OVER(PARTITION BY principal ORDER BY seq) rn FROM action WHERE status='queued') WHERE rn=1 ORDER BY CASE WHEN principal>? THEN 0 ELSE 1 END,principal LIMIT 1`,previous);
    if(!row)return null;
    const action=/** @type {Action} */(JSON.parse(String(row.record)));
    if(action.deadline<=this.now()){tx.updateAction({...action,status:'cancelled',step:'deadline.before.dispatch',errorCode:null});this.clearFence(tx,action);continue;}
    /** @type {Attempt} */
    const attempt={installationId:this.ledger.binding.installationId,repositoryId:this.ledger.binding.repositoryId,workId:action.workId??action.actionId,actionId:action.actionId,
      attemptId:this.ids(),attempt:nextRevision(action.attempt),ownerEpoch:this.ledger.ownerEpoch};
    requireThat(tx.reserveAttempt(attempt,this.executionCapacity),'INTEGRITY_FAILURE');
    const running={...action,status:/** @type {const} */('running'),step:'launch.reserved',attempt:attempt.attempt,ownerEpoch:this.ledger.ownerEpoch};tx.updateAction(running);
    tx.run("INSERT INTO meta(key,value) VALUES('dispatchPrincipal',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",action.principal);
    return {action:running,attempt};
    }
    return null;
  });}
  /** Callback fencing is independent of immutable container attempt identity.
   * @param {Attempt} attempt @param {string} observerEpoch @param {'succeeded'|'failed'|'cancelled'|'blocked'} status
   * @param {{stopped:boolean,effectResolved:boolean,resultId?:string,errorCode?:string,disposition?:'integrated'|'cancelled'}} proof
   */
  settle(attempt,observerEpoch,status,proof){return this.ledger.transact(tx=>{
    const reservation=tx.retainedAttempt(attempt.attemptId);
    requireThat(reservation&&canonicalJson(reservation.attempt)===canonicalJson(attempt)&&reservation.observerEpoch===observerEpoch&&observerEpoch===this.ledger.ownerEpoch,'STALE_REVISION','Old callback');
    const action=tx.getAction(attempt.actionId);requireThat(action&&action.attempt===attempt.attempt,'STALE_REVISION');
    const terminal=status!=='blocked';requireThat(!terminal||(proof.stopped&&proof.effectResolved),'EFFECT_UNCERTAIN');
    tx.updateAction({...action,status,step:terminal?'complete':'reconcile',resultId:proof.resultId??null,errorCode:proof.errorCode??null,ownerEpoch:observerEpoch});
    if(proof.stopped)tx.releaseAttempt(attempt.attemptId);
    if(terminal)this.clearFence(tx,action,proof.disposition);
  });}
  /** @param {Transaction} tx @param {Action} action @param {'integrated'|'cancelled'} [disposition] */
  clearFence(tx,action,disposition){if(!action.workId)return;const work=tx.getWork(action.workId);requireThat(work,'INTEGRITY_FAILURE');
    if(work.currentActionId===action.actionId)requireThat(tx.compareWork(work.revision,{...work,currentActionId:null,revision:nextRevision(work.revision),...(disposition?{disposition}:{})}),'STALE_REVISION');
  }
  /** A durable cancellation intent does not pretend the process/effect is already stopped.
   * @param {string} actionId @param {string} principal
   */
  requestCancel(actionId,principal){return this.ledger.transact(tx=>{const a=tx.getAction(actionId);requireThat(a&&a.principal===principal,'FORBIDDEN');
    if(['succeeded','failed','cancelled'].includes(a.status))return a;
    const next={...a,status:/** @type {'cancelled'|'blocked'} */(a.status==='queued'?'cancelled':'blocked'),step:'cancel.requested'};tx.updateAction(next);if(next.status==='cancelled')this.clearFence(tx,a);return next;});}
  /** Resume only after the owning effect reconciler proves safe execution; never a timeout-based retry.
   * @param {string} actionId @param {string} principal @param {boolean} reconciledSafe
   */
  resume(actionId,principal,reconciledSafe){return this.ledger.transact(tx=>{const a=tx.getAction(actionId);requireThat(a&&a.principal===principal,'FORBIDDEN');
    requireThat(a.status==='blocked'&&reconciledSafe&&!tx.reservations().some(r=>r.attempt.actionId===actionId),'EFFECT_UNCERTAIN');
    const next={...a,status:/** @type {const} */('queued'),step:'reconciled.retry',ownerEpoch:this.ledger.ownerEpoch};tx.updateAction(next);return next;});}
}
