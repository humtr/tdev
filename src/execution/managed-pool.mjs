import {setTimeout as delay} from 'node:timers/promises';
import {canonicalJson,parseRecord,recordDigest} from '../contracts/canonical.mjs';
import {requireThat,Dev2Error} from '../contracts/errors.mjs';
import {id,newId} from '../contracts/identity.mjs';
import {preparePayload,executionIdentity} from './payload.mjs';
import {SessionReconciler} from './session-reconcile.mjs';
/** @typedef {import('../contracts/ports.js').Attempt} Attempt */
/** @typedef {import('../contracts/ports.js').PreparedResult} Prepared */
/** @typedef {import('../contracts/ports.js').Profile} Profile */
/** @typedef {import('./session-types.js').Assignment} Assignment */
/** @typedef {import('./session-types.js').AuthenticatedExecutor} Identity */
/** @typedef {{assignmentId:string,sessionId:string,input:import('./session-types.js').AssignedInput,objects:import('./session-types.js').ObjectDescriptor[],state:'pending'|'done'|'cancelled'}} Dispatch */
/** @template T @param {unknown} row @returns {T|null} */
function decode(row){return row&&typeof row==='object'&&'record'in row&&typeof row.record==='string'?/** @type {T} */(parseRecord(row.record,2097152)):null;}
/** Bridges existing work attempts to bounded managed sessions. The additive table
 * retains only assignment intent: work/attempt state remains in the same Ledger,
 * session/lease/result state remains in ManagedSessions. No request is re-admitted,
 * no second model runs, and no network or filesystem work spans a transaction.
 */
export class ManagedPool {
 /** @param {{sessions:import('./sessions.mjs').ManagedSessions,provider:import('./github-sessions.mjs').GitHubSessions,repository:import('../repository/git.mjs').GitRepository,objects:import('../contracts/ports.js').ObjectStorePort,now?:()=>number,sleep?:(ms:number)=>Promise<void>,pollMs?:number}} options */
 constructor(options){this.o=options;this.sessions=options.sessions;this.ledger=this.sessions.ledger;this.now=options.now??Date.now;this.sleep=options.sleep??delay;this.pollMs=options.pollMs??250;requireThat(Number.isSafeInteger(this.pollMs)&&this.pollMs>=10&&this.pollMs<=2000,'INVALID_ARGUMENT');
  this.ledger.transact(tx=>{tx.run("CREATE TABLE IF NOT EXISTS managed_dispatch(assignment_id TEXT PRIMARY KEY,attempt_id TEXT NOT NULL,session_id TEXT NOT NULL REFERENCES managed_session(session_id),state TEXT NOT NULL,record TEXT NOT NULL)");tx.run("CREATE UNIQUE INDEX IF NOT EXISTS managed_pending_dispatch ON managed_dispatch(session_id) WHERE state='pending'");});
  /** @type {Map<string,Promise<import('./session-types.js').ExecutionResult>>} */this.running=new Map();
  this.reconciler=new SessionReconciler({sessions:this.sessions,provider:options.provider,now:this.now});
 }
 /** @param {import('../storage/ledger.mjs').Transaction} tx @param {Attempt} attempt */
 current(tx,attempt){const held=tx.retainedAttempt(attempt.attemptId),action=tx.getAction(attempt.actionId),work=tx.getWork(attempt.workId);
  const release=action?.operation==='release.stage'&&action.workId===null&&attempt.workId===action.actionId&&action.attempt===attempt.attempt&&!tx.get('SELECT value FROM meta WHERE key=?','cancel:'+action.actionId);
  requireThat(held?.held&&held.observerEpoch===this.ledger.ownerEpoch&&canonicalJson(held.attempt)===canonicalJson(attempt)&&action&&action.ownerEpoch===this.ledger.ownerEpoch&&action.status==='running'&&(release||work?.disposition==='open'&&work.currentActionId===action.actionId),'STALE_REVISION','Managed work owner changed');return action;}
 /** @param {string} assignmentId */
 retained(assignmentId){return this.ledger.transact(tx=>/** @type {Dispatch|null} */(decode(tx.get('SELECT record FROM managed_dispatch WHERE assignment_id=?',id(assignmentId)))));}
 /** @param {string} assignmentId */
 assignment(assignmentId){return this.ledger.transact(tx=>/** @type {Assignment|null} */(decode(tx.get('SELECT record FROM managed_assignment WHERE assignment_id=?',id(assignmentId)))));}
 /** Dispatch slot retention is derived from exact terminal assignment state. A
  * completed result may be consumed again after restart without retaining a warm
  * physical slot indefinitely. No work/action outcome is modified by this method.
  */
 reconcileLocal(){this.ledger.transact(tx=>{for(const row of tx.all("SELECT record FROM managed_dispatch WHERE state='pending'")){const d=/** @type {Dispatch} */(decode(row)),a=/** @type {Assignment|null} */(decode(tx.get('SELECT record FROM managed_assignment WHERE assignment_id=?',d.assignmentId))),s=this.sessions.session(tx,d.sessionId);if(a&&['complete','stopped'].includes(a.state)||s.state==='closed'){d.state='done';tx.run("UPDATE managed_dispatch SET state='done',record=? WHERE assignment_id=?",canonicalJson(d),d.assignmentId);}}});}
 /** @param {Prepared} result @param {Attempt} attempt @param {Profile} profile */
 async prepare(result,attempt,profile){
  const assignmentId=recordDigest('dev2.managed-assignment.v1',{attempt,profileDigest:profile.digest}).slice(7),existing=this.retained(assignmentId);
  if(existing){requireThat(existing.input.resultId===result.resultId&&existing.input.sourceManifest===result.resultTreeSha256&&existing.input.executionDigest===executionIdentity(result.execution),'IDEMPOTENCY_MISMATCH');return existing;}
  requireThat(this.sessions.config.sealDigest!==null,'EXECUTION_UNAVAILABLE','Managed execution is not sealed');
  this.ledger.transact(tx=>this.current(tx,attempt));const commit=await this.o.repository.readCommit(this.ledger.binding,result.commitOid);requireThat(commit.source.treeOid===result.resultTreeOid&&commit.source.manifestDigest===result.resultTreeSha256,'INTEGRITY_FAILURE','Prepared result bytes differ');
  const payload=await preparePayload({repository:this.o.repository,objects:this.o.objects,source:commit.source,resultId:result.resultId,profile,execution:result.execution});
  this.reconcileLocal();
  // Selecting/reserving a session and inserting its dispatch are synchronous on
  // this sole ledger owner. Provider launch happens only after both are durable.
  return this.ledger.transact(tx=>{
   const prior=/** @type {Dispatch|null} */(decode(tx.get('SELECT record FROM managed_dispatch WHERE assignment_id=?',assignmentId)));if(prior)return prior;
   const action=this.current(tx,attempt),minimum=this.now()+profile.timeoutMs+profile.killGraceMs+10000;requireThat(minimum<action.deadline,'EXECUTION_UNAVAILABLE','Insufficient remaining action lifetime');
   const candidates=tx.all("SELECT record FROM managed_session WHERE state='active' ORDER BY session_id").map(row=>/** @type {import('./session-types.js').Session} */(decode(row)));
   let session=candidates.find(s=>!s.cancelRequested&&s.intent.deadline>minimum&&s.intent.launchCommit===this.sessions.config.approvedCommit&&s.intent.trustedRunnerDigest===this.sessions.config.trustedRunnerDigest&&!tx.get("SELECT assignment_id FROM managed_dispatch WHERE session_id=? AND state='pending'",s.intent.sessionId)&&!tx.get("SELECT assignment_id FROM managed_assignment WHERE session_id=? AND state IN ('offered','running')",s.intent.sessionId));
   // reserve() normally starts its own transaction. Constructing a new intent is
   // deferred outside this transaction below rather than nesting a ledger owner.
   if(!session)return {needsSession:true,actionDeadline:action.deadline,payload,assignmentId};
   const input={attempt,resultId:result.resultId,profileDigest:profile.digest,sourceManifest:result.resultTreeSha256,payloadDigest:payload.payloadDigest,executionDigest:executionIdentity(result.execution),deadline:Math.min(action.deadline,session.intent.deadline)};
   /** @type {Dispatch} */const d={assignmentId,sessionId:session.intent.sessionId,input,objects:payload.objects,state:'pending'};tx.run('INSERT INTO managed_dispatch VALUES(?,?,?,?,?)',assignmentId,attempt.attemptId,d.sessionId,d.state,canonicalJson(d));return d;
  });
 }
 /** @param {Prepared} result @param {Attempt} attempt @param {Profile} profile @returns {Promise<Dispatch>} */
 async dispatch(result,attempt,profile){const planned=await this.prepare(result,attempt,profile);if(!('needsSession'in planned))return planned;
  const prior=this.retained(planned.assignmentId);if(prior)return prior;
  await this.reconciler.whenFull();this.ledger.transact(tx=>this.current(tx,attempt));
  const s=this.sessions.reserve(newId());
  try{return this.ledger.transact(tx=>{const old=/** @type {Dispatch|null} */(decode(tx.get('SELECT record FROM managed_dispatch WHERE assignment_id=?',planned.assignmentId)));requireThat(!old,'IDEMPOTENCY_MISMATCH');const action=this.current(tx,attempt);
   const input={attempt,resultId:result.resultId,profileDigest:profile.digest,sourceManifest:result.resultTreeSha256,payloadDigest:planned.payload.payloadDigest,executionDigest:executionIdentity(result.execution),deadline:Math.min(action.deadline,s.intent.deadline)};
   /** @type {Dispatch} */const d={assignmentId:planned.assignmentId,sessionId:s.intent.sessionId,input,objects:planned.payload.objects,state:'pending'};tx.run('INSERT INTO managed_dispatch VALUES(?,?,?,?,?)',d.assignmentId,attempt.attemptId,d.sessionId,d.state,canonicalJson(d));return d;
  });}catch(error){this.sessions.closeUnlaunched(s.intent.sessionId);throw error;}
 }
 /** Invoked only after native OIDC and current provider-run verification. An
  * executor supplies no work/profile/input selection. The held exact work intent
  * is read from the ledger; stale owner callbacks cannot receive a new lease.
  * @param {Identity} identity */
 poll(identity){const current=this.sessions.current(identity);if(current.assignment||current.cancelRequested)return current;
  const d=this.ledger.transact(tx=>{this.sessions.authenticated(tx,identity);const found=/** @type {Dispatch|null} */(decode(tx.get("SELECT record FROM managed_dispatch WHERE session_id=? AND state='pending'",identity.sessionId)));if(found)this.current(tx,found.input.attempt);return found;});
  if(d)this.sessions.offer(identity,d.input,d.objects);return this.sessions.current(identity);
 }
 /** Native retirement and dispatch are synchronously ordered on the sole owner.
  * A concurrent pending dispatch is offered instead of acknowledging retirement.
  * A lost reply retries this same session, never launches another resource.
  * @param {Identity} identity */
 retire(identity){const current=this.poll(identity);if(current.assignment||current.cancelRequested)return current;this.sessions.cancelSession(identity.sessionId);return this.sessions.current(identity);}
 /** Replace only a positively stopped resource that never received an assignment.
  * The logical assignment/input/attempt remain immutable, and prior resource IDs
  * stay in this existing record. No provider effect occurs inside the transaction.
  * @param {Dispatch} dispatch @param {Attempt} attempt @param {Profile} profile */
 replaceUnassigned(dispatch,attempt,profile){
  /** @param {import('../storage/ledger.mjs').Transaction} tx */
  const eligible=tx=>{const row=tx.get('SELECT record FROM managed_dispatch WHERE assignment_id=?',dispatch.assignmentId),d=/** @type {Dispatch & {priorSessionIds?:string[]}} */(decode(row));requireThat(row&&d&&d.sessionId===dispatch.sessionId&&canonicalJson(d.input)===canonicalJson(dispatch.input),'STALE_REVISION');
   const action=this.current(tx,attempt),cancelIntent=tx.get('SELECT value FROM meta WHERE key=?','cancel:'+action.actionId),s=this.sessions.session(tx,d.sessionId);requireThat(d.state!=='cancelled'&&!cancelIntent&&s.state==='closed'&&s.launch==='sent'&&s.stoppedAt!==null&&!tx.get('SELECT assignment_id FROM managed_assignment WHERE assignment_id=?',d.assignmentId),'EXECUTION_UNAVAILABLE','Resource replacement requires stopped, never-assigned, non-cancelled execution');
   requireThat(this.now()+profile.timeoutMs+profile.killGraceMs+10000<Math.min(action.deadline,d.input.deadline),'EXECUTION_UNAVAILABLE','Insufficient unchanged assignment lifetime');const history=d.priorSessionIds??[];requireThat(Array.isArray(history)&&history.length<64,'CAPACITY_REJECTED','Managed resource replacement history limit');history.forEach(id);return {row,d,history};};
  this.ledger.transact(eligible);const s=this.sessions.reserve(newId());
  try{return this.ledger.transact(tx=>{const {row,d,history}=eligible(tx);requireThat(s.intent.deadline>=d.input.deadline,'EXECUTION_UNAVAILABLE','Replacement cannot shorten the immutable deadline');
   const next={...d,sessionId:s.intent.sessionId,priorSessionIds:[...history,d.sessionId],state:/** @type {const} */('pending')};
   const updated=tx.run("UPDATE managed_dispatch SET session_id=?,state='pending',record=? WHERE assignment_id=? AND record=?",next.sessionId,canonicalJson(next),d.assignmentId,String(row.record));requireThat(Number(updated.changes)===1,'STALE_REVISION');return next;
  });}catch(error){this.sessions.closeUnlaunched(s.intent.sessionId);throw error;}
 }
 /** RequiredValidation run port: only a matching authenticated native-retained
  * outer-controller result is returned. Candidate log content is not interpreted.
  * @param {Prepared} result @param {Attempt} attempt @param {Profile} profile */
 async run(result,attempt,profile){const key=recordDigest('dev2.managed-assignment.v1',{attempt,profileDigest:profile.digest}).slice(7),prior=this.running.get(key);if(prior)return prior;
  const operation=this.execute(result,attempt,profile);this.running.set(key,operation);try{return await operation;}finally{this.running.delete(key);}
 }
 /** @param {Prepared} result @param {Attempt} attempt @param {Profile} profile */
 async execute(result,attempt,profile){let d=await this.dispatch(result,attempt,profile),lastRefresh=0,lastLaunch=0;
  for(;;){const a=this.assignment(d.assignmentId);
   if(a?.state==='complete'){requireThat(a.result&&a.inputIdentity===recordDigest('dev2.managed-assignment-input.v1',d.input)&&a.sealDigest===this.sessions.config.sealDigest&&a.result.trustedRunnerDigest===result.execution.trustedRunnerDigest,'INTEGRITY_FAILURE');this.reconcileLocal();return a.result;}
   if(a?.state==='stopped')throw new Dev2Error('EXECUTION_UNAVAILABLE','Provider stopped without a trusted validation receipt');
   const now=this.now();if(now>=d.input.deadline){await this.cancel(attempt);throw new Dev2Error('EXECUTION_UNAVAILABLE','Managed assignment deadline');}
   const s=this.ledger.transact(tx=>this.sessions.session(tx,d.sessionId));if(s.state==='closed'){
    try{d=this.replaceUnassigned(d,attempt,profile);lastRefresh=0;lastLaunch=0;}catch(error){if(!(error instanceof Dev2Error)||error.code!=='CAPACITY_REJECTED')throw error;await this.sleep(this.pollMs);}continue;
   }
   if(now-lastLaunch>=5000&&s.state==='reserved'&&!s.cancelRequested){lastLaunch=now;try{await this.o.provider.launch(d.sessionId);}catch(error){if(!(error instanceof Dev2Error)||!['EXECUTION_UNAVAILABLE','EFFECT_UNCERTAIN'].includes(error.code))throw error;}}
   if(now-lastRefresh>=10000){lastRefresh=now;try{await this.o.provider.refresh(d.sessionId);}catch(error){if(!(error instanceof Dev2Error)||!['EXECUTION_UNAVAILABLE','EFFECT_UNCERTAIN'].includes(error.code))throw error;}}
   await this.sleep(this.pollMs);
  }
 }
 /** @param {Attempt} attempt */
 dispatches(attempt){return this.ledger.transact(tx=>tx.all('SELECT record FROM managed_dispatch WHERE attempt_id=?',attempt.attemptId).map(row=>/** @type {Dispatch} */(decode(row))));}
 /** No new sender or session is created while cancelling. A provider HTTP 202
  * never becomes stop evidence and no unrelated warm session is cancelled.
  * @param {Attempt} attempt */
 async cancel(attempt){const ds=this.dispatches(attempt);for(const d of ds){const a=this.assignment(d.assignmentId);if(a&&['complete','stopped'].includes(a.state))continue;
   if(a)this.sessions.cancelAssignment(a.assignmentId);
   else this.ledger.transact(tx=>{const current=/** @type {Dispatch} */(decode(tx.get('SELECT record FROM managed_dispatch WHERE assignment_id=?',d.assignmentId)));if(current.state==='pending'){current.state='cancelled';tx.run("UPDATE managed_dispatch SET state='cancelled',record=? WHERE assignment_id=?",canonicalJson(current),current.assignmentId);}});
   await this.o.provider.cancel(d.sessionId).catch(()=>{});
  }return this.stopped(attempt);
 }
 /** Positive physical/authorization facts only. Mere lease expiry, missing run
  * observation or a lost provider response cannot release a held work attempt.
  * @param {Attempt} attempt */
 async stopped(attempt){const ds=this.dispatches(attempt);for(const d of ds){let a=this.assignment(d.assignmentId);if(a&&['complete','stopped'].includes(a.state))continue;if(!a&&d.state==='cancelled')continue;
   try{await this.o.provider.refresh(d.sessionId,true);}catch{return false;}a=this.assignment(d.assignmentId);const s=this.ledger.transact(tx=>this.sessions.session(tx,d.sessionId));if(!(a&&['complete','stopped'].includes(a.state))&&s.state!=='closed')return false;
  }return true;
 }
}
