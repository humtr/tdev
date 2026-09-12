import {canonicalJson,parseRecord,recordDigest} from '../contracts/canonical.mjs';
import {capacity,id,revision,digest,newId,nextRevision} from '../contracts/identity.mjs';
import {requireThat} from '../contracts/errors.mjs';
/** @typedef {import('./session-types.js').Session} Session */
/** @typedef {import('./session-types.js').SessionIntent} Intent */
/** @typedef {import('./session-types.js').ProviderRun} ProviderRun */
/** @typedef {import('./session-types.js').Assignment} Assignment */
/** @typedef {import('./session-types.js').AssignedInput} AssignedInput */
/** @typedef {import('./session-types.js').ExecutionResult} ExecutionResult */
/** @typedef {import('./session-types.js').AuthenticatedExecutor} Identity */
/** @typedef {import('../storage/ledger.mjs').Transaction} Transaction */
/** @template T @param {unknown} row @returns {T|null} */
function decode(row){return row&&typeof row==='object'&&'record' in row&&typeof row.record==='string'?/** @type {T} */(parseRecord(row.record,2097152)):null;}
/** @param {number} value */
function timestamp(value){requireThat(Number.isSafeInteger(value)&&value>=0,'INVALID_ARGUMENT','Managed timestamp');return value;}
/** @param {unknown} value */
function encoded(value){const text=canonicalJson(value);requireThat(Buffer.byteLength(text)<=2097152,'LIMIT_EXCEEDED');return text;}
/** The existing repository ledger owns these additive tables. Session and
 * assignment records do not admit work, replace an Attempt, or own canonical Git.
 * Every method is synchronous; no transaction spans a provider or object transfer.
 */
export class ManagedSessions {
 /** @param {{ledger:import('../storage/ledger.mjs').Ledger,config:import('./session-types.js').ManagedConfig,now?:()=>number}} options */
 constructor(options){
  this.ledger=options.ledger;this.config=structuredClone(options.config);this.now=options.now??Date.now;this.limit=capacity(options.config.capacity);
  revision(this.ledger.binding.providerRepositoryId);revision(this.config.repositoryOwnerId);
  requireThat(this.ledger.binding.providerRepositoryId!=='0'&&this.config.repositoryOwnerId!=='0'&&/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(this.config.repositoryFullName)&&/^[0-9a-f]{40}$/.test(this.config.approvedCommit),'INVALID_ARGUMENT');
  digest(this.config.trustedRunnerDigest);if(this.config.sealDigest!==null)digest(this.config.sealDigest);
  requireThat(Number.isSafeInteger(this.config.sessionTimeoutMs)&&this.config.sessionTimeoutMs>0&&this.config.sessionTimeoutMs<=900000,'INVALID_ARGUMENT');
  this.ledger.transact(tx=>{
   tx.run("CREATE TABLE IF NOT EXISTS managed_session(session_id TEXT PRIMARY KEY,state TEXT NOT NULL,record TEXT NOT NULL)");
   tx.run("CREATE TABLE IF NOT EXISTS managed_assignment(assignment_id TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES managed_session(session_id),state TEXT NOT NULL,record TEXT NOT NULL)");
   tx.run("CREATE UNIQUE INDEX IF NOT EXISTS managed_session_assignment ON managed_assignment(session_id) WHERE state IN ('offered','running')");
   tx.run("CREATE TABLE IF NOT EXISTS managed_object(assignment_id TEXT NOT NULL REFERENCES managed_assignment(assignment_id),digest TEXT NOT NULL,size INTEGER NOT NULL,PRIMARY KEY(assignment_id,digest))");
  });
 }
 /** @param {Transaction} tx @param {string} sessionId @returns {Session} */
 session(tx,sessionId){const s=/** @type {Session|null} */(decode(tx.get('SELECT record FROM managed_session WHERE session_id=?',id(sessionId))));requireThat(s,'FORBIDDEN','Unknown managed session');return s;}
 /** @param {Transaction} tx @param {string} assignmentId @returns {Assignment} */
 assignment(tx,assignmentId){const a=/** @type {Assignment|null} */(decode(tx.get('SELECT record FROM managed_assignment WHERE assignment_id=?',id(assignmentId))));requireThat(a,'FORBIDDEN','Unknown managed assignment');return a;}
 /** @param {Transaction} tx @param {Session} before @param {Session} after */
 saveSession(tx,before,after){requireThat(before.intentDigest===after.intentDigest&&encoded(before.intent)===encoded(after.intent)&&before.state!=='closed','INTEGRITY_FAILURE');after={...after,revision:nextRevision(before.revision),observerEpoch:this.ledger.ownerEpoch};requireThat(tx.run('UPDATE managed_session SET state=?,record=? WHERE session_id=? AND record=?',after.state,encoded(after),before.intent.sessionId,encoded(before)).changes===1,'STALE_REVISION');return after;}
 /** @param {Transaction} tx @param {Assignment} before @param {Assignment} after */
 saveAssignment(tx,before,after){requireThat(before.inputIdentity===after.inputIdentity&&before.leaseId===after.leaseId&&before.sessionId===after.sessionId&&before.runId===after.runId&&before.assignmentId===after.assignmentId&&encoded(before.input)===encoded(after.input),'INTEGRITY_FAILURE');requireThat(!['complete','stopped'].includes(before.state),'STALE_RESULT');after={...after,revision:nextRevision(before.revision)};requireThat(tx.run('UPDATE managed_assignment SET state=?,record=? WHERE assignment_id=? AND record=?',after.state,encoded(after),before.assignmentId,encoded(before)).changes===1,'STALE_REVISION');return after;}
 /** Caller retains sessionId before provider launch. A retry cannot allocate a
  * second session or silently change approved runtime, expiry or capacity identity.
  * @param {string} sessionId */
 reserve(sessionId){id(sessionId);return this.ledger.transact(tx=>{
  const prior=/** @type {Session|null} */(decode(tx.get('SELECT record FROM managed_session WHERE session_id=?',sessionId)));
  if(prior){requireThat(prior.intent.launchCommit===this.config.approvedCommit&&prior.intent.trustedRunnerDigest===this.config.trustedRunnerDigest,'STALE_RESULT');return prior;}
  requireThat(Number(tx.get("SELECT count(*) AS n FROM managed_session WHERE state<>'closed'")?.n)<this.limit,'CAPACITY_REJECTED');
  const b=this.ledger.binding,createdAt=timestamp(this.now()),deadline=timestamp(createdAt+this.config.sessionTimeoutMs),ref='refs/heads/dev2-exec/'+sessionId;
  const intent={sessionId,installationId:b.installationId,repositoryId:b.repositoryId,bindingEpoch:b.bindingEpoch,providerRepositoryId:b.providerRepositoryId,repositoryOwnerId:this.config.repositoryOwnerId,repositoryFullName:this.config.repositoryFullName,ref,workflowRef:this.config.repositoryFullName+'/.github/workflows/dev2-executor.yml@'+ref,launchCommit:this.config.approvedCommit,trustedRunnerDigest:this.config.trustedRunnerDigest,createdAt,deadline};
  /** @type {Session} */const s={intent,intentDigest:recordDigest('dev2.managed-session.v1',intent),revision:'0',observerEpoch:this.ledger.ownerEpoch,launch:'reserved',state:'reserved',run:null,cancelRequested:false,stoppedAt:null};
  tx.run('INSERT INTO managed_session VALUES(?,?,?)',sessionId,s.state,encoded(s));return s;
 });}
 /** Persist before the only approved-ref provider launch. 'sent' is uncertainty,
  * not confirmation. It never reverts merely because no run was listed yet.
  * @param {string} sessionId */
 markLaunchSent(sessionId){return this.ledger.transact(tx=>{const s=this.session(tx,sessionId);if(s.launch==='sent')return s;requireThat(s.state==='reserved'&&!s.cancelRequested&&this.now()<s.intent.deadline,'STALE_RESULT');return this.saveSession(tx,s,{...s,launch:'sent'});});}
 /** @param {Session} s @param {ProviderRun} p */
 matchingRun(s,p){const i=s.intent;revision(p.runId);requireThat(p.runId!=='0'&&p.runAttempt==='1'&&p.repositoryId===i.providerRepositoryId&&p.repositoryOwnerId===i.repositoryOwnerId&&p.headSha===i.launchCommit&&p.headBranch===i.ref.slice(11)&&p.event==='push'&&p.workflowPath==='.github/workflows/dev2-executor.yml','UNAUTHORIZED');const now=timestamp(this.now());requireThat(timestamp(p.observedAt)<=now&&now-p.observedAt<=60000,'UNAUTHORIZED','Stale provider observation');}
 /** Only current authenticated provider observations enter this port. First
  * verified run wins a ledger CAS; duplicate launches never acquire assignments.
  * @param {string} sessionId @param {ProviderRun} provider */
 selectRun(sessionId,provider){return this.ledger.transact(tx=>{const s=this.session(tx,sessionId);this.matchingRun(s,provider);requireThat(s.launch==='sent'&&s.state!=='closed'&&!s.cancelRequested&&this.now()<s.intent.deadline&&provider.status==='in_progress','UNAUTHORIZED');if(s.run){requireThat(s.run.runId===provider.runId,'UNAUTHORIZED','Duplicate provider run');return this.saveSession(tx,s,{...s,run:structuredClone(provider)});}return this.saveSession(tx,s,{...s,state:'active',run:structuredClone(provider)});});}
 /** @param {Transaction} tx @param {Identity} identity */
 authenticated(tx,identity){const s=this.session(tx,identity.sessionId);const i=s.intent;requireThat(identity.kind==='github-executor'&&s.run&&s.state!=='closed'&&identity.installationId===i.installationId&&identity.repositoryId===i.providerRepositoryId&&identity.runId===s.run.runId&&identity.runAttempt==='1'&&identity.launchCommit===i.launchCommit&&Number.isSafeInteger(identity.expiresAt)&&identity.expiresAt>this.now(),'UNAUTHORIZED');digest(identity.launchIdentity);return s;}
 /** Expiry stops new execution, not observation of an already-started effect.
  * @param {Identity} identity */
 current(identity){return this.ledger.transact(tx=>{const s=this.authenticated(tx,identity);const row=tx.get("SELECT record FROM managed_assignment WHERE session_id=? AND state IN ('offered','running')",s.intent.sessionId);return {session:s,assignment:/** @type {Assignment|null} */(decode(row)),cancelRequested:s.cancelRequested||this.now()>=s.intent.deadline};});}
 /** @param {Identity} identity @param {AssignedInput} input @param {import('./session-types.js').ObjectDescriptor[]} objects */
 offer(identity,input,objects){
  const a=input.attempt;for(const k of ['installationId','repositoryId','workId','actionId','attemptId'])id(a[/** @type {'workId'} */(k)]);revision(a.attempt);revision(a.ownerEpoch);id(input.resultId);for(const d of [input.profileDigest,input.sourceManifest,input.payloadDigest,input.executionDigest])digest(d);timestamp(input.deadline);
  requireThat(objects.length>0&&objects.length<=16384,'LIMIT_EXCEEDED');let total=0;const descriptors=new Map();
  for(const o of objects){digest(o.digest);requireThat(Number.isSafeInteger(o.size)&&o.size>=0&&o.size<=16777216&&!descriptors.has(o.digest),'INVALID_ARGUMENT');descriptors.set(o.digest,o.size);total+=o.size;}requireThat(total<=268435456&&descriptors.has(input.payloadDigest),'LIMIT_EXCEEDED');
  const inputIdentity=recordDigest('dev2.managed-assignment-input.v1',input),assignmentId=recordDigest('dev2.managed-assignment.v1',{attempt:a,profileDigest:input.profileDigest}).slice(7);
  return this.ledger.transact(tx=>{
   const s=this.authenticated(tx,identity),prior=/** @type {Assignment|null} */(decode(tx.get('SELECT record FROM managed_assignment WHERE assignment_id=?',assignmentId)));
   if(prior){requireThat(prior.inputIdentity===inputIdentity&&prior.sessionId===s.intent.sessionId&&prior.runId===identity.runId,'IDEMPOTENCY_MISMATCH');const retained=tx.all('SELECT digest,size FROM managed_object WHERE assignment_id=? ORDER BY digest',assignmentId);requireThat(retained.length===descriptors.size&&retained.every(r=>descriptors.get(String(r.digest))===Number(r.size)),'IDEMPOTENCY_MISMATCH');return prior;}
   requireThat(this.config.sealDigest!==null,'EXECUTION_UNAVAILABLE','Managed containment seal is absent');
   requireThat(s.state==='active'&&!s.cancelRequested&&this.now()<input.deadline&&input.deadline<=s.intent.deadline,'STALE_RESULT');
   requireThat(a.installationId===s.intent.installationId&&a.repositoryId===s.intent.repositoryId,'FORBIDDEN');
   const reservation=tx.retainedAttempt(a.attemptId);requireThat(reservation?.held&&reservation.observerEpoch===this.ledger.ownerEpoch&&encoded(reservation.attempt)===encoded(a),'STALE_REVISION');
   requireThat(!tx.get("SELECT assignment_id FROM managed_assignment WHERE session_id=? AND state IN ('offered','running')",identity.sessionId),'CAPACITY_REJECTED');
   /** @type {Assignment} */const assigned={assignmentId,sessionId:identity.sessionId,runId:identity.runId,leaseId:newId(),input:structuredClone(input),inputIdentity,sealDigest:this.config.sealDigest,revision:'0',state:'offered',cancelRequested:false,result:null};
   tx.run('INSERT INTO managed_assignment VALUES(?,?,?,?)',assignmentId,identity.sessionId,assigned.state,encoded(assigned));
   for(const o of objects)tx.run('INSERT INTO managed_object VALUES(?,?,?)',assignmentId,o.digest,o.size);return assigned;
  });
 }
 /** @param {Transaction} tx @param {Identity} identity @param {string} assignmentId @param {string} leaseId */
 authorizeAssignment(tx,identity,assignmentId,leaseId){const s=this.authenticated(tx,identity),a=this.assignment(tx,assignmentId);requireThat(a.sessionId===s.intent.sessionId&&a.runId===identity.runId&&a.leaseId===leaseId,'UNAUTHORIZED');return a;}
 /** ACK does not change the launch/lease identity on retry or reconnect.
  * @param {Identity} identity @param {string} assignmentId @param {string} leaseId */
 acknowledge(identity,assignmentId,leaseId){return this.ledger.transact(tx=>{const a=this.authorizeAssignment(tx,identity,assignmentId,leaseId);if(a.state!=='offered')return a;const s=this.session(tx,a.sessionId);requireThat(!a.cancelRequested&&!s.cancelRequested&&this.now()<a.input.deadline,'STALE_RESULT');return this.saveAssignment(tx,a,{...a,state:'running'});});}
 /** Accepted only from the OIDC-authenticated trusted outer controller. Candidate
  * stdout is never a completion receipt. Input/runner/seal and lease all bind it.
  * @param {Identity} identity @param {ExecutionResult} result */
 complete(identity,result){return this.ledger.transact(tx=>{
  const a=this.authorizeAssignment(tx,identity,result.assignmentId,result.leaseId),s=this.session(tx,a.sessionId);
  requireThat(result.stopped===true&&result.inputIdentity===a.inputIdentity&&result.sealDigest===a.sealDigest&&result.trustedRunnerDigest===s.intent.trustedRunnerDigest,'INTEGRITY_FAILURE');
  timestamp(result.startedAt);timestamp(result.endedAt);requireThat(result.startedAt>=s.intent.createdAt&&result.endedAt>=result.startedAt&&result.endedAt<=this.now()+5000,'INTEGRITY_FAILURE');
  requireThat(result.exitCode===null||Number.isSafeInteger(result.exitCode)&&result.exitCode>=0&&result.exitCode<=255,'INTEGRITY_FAILURE');requireThat(result.signal===null||typeof result.signal==='string'&&/^SIG[A-Z0-9]{1,16}$/.test(result.signal),'INTEGRITY_FAILURE');requireThat(typeof result.deadlineExceeded==='boolean'&&Array.isArray(result.artifacts)&&result.artifacts.length<=32,'INTEGRITY_FAILURE');for(const d of [result.inputDigest,result.outputDigest,...result.artifacts])digest(d);
  const bounded={...result,deadlineExceeded:result.deadlineExceeded||result.endedAt>a.input.deadline};
  // A late or cancelled result remains observable but cannot be successful.
  if(a.cancelRequested||s.cancelRequested)bounded.signal=bounded.signal??'SIGTERM';
  if(a.state==='complete'){requireThat(encoded(a.result)===encoded(bounded),'IDEMPOTENCY_MISMATCH');return a;}
  requireThat(a.state==='running','STALE_RESULT','Completion requires the retained acknowledged assignment');
  for(const artifact of result.artifacts){const row=tx.get("SELECT state FROM managed_artifact WHERE assignment_id=? AND digest=?",a.assignmentId,artifact);requireThat(row?.state==='ready','INTEGRITY_FAILURE','Uncommitted assignment artifact');}
  return this.saveAssignment(tx,a,{...a,state:'complete',result:structuredClone(bounded)});
 });}
 /** @param {string} assignmentId */
 cancelAssignment(assignmentId){return this.ledger.transact(tx=>{const a=this.assignment(tx,assignmentId);if(['complete','stopped'].includes(a.state)||a.cancelRequested)return a;return this.saveAssignment(tx,a,{...a,cancelRequested:true});});}
 /** @param {string} sessionId */
 cancelSession(sessionId){return this.ledger.transact(tx=>{const s=this.session(tx,sessionId);if(s.state==='closed'||s.cancelRequested)return s;const row=tx.get("SELECT record FROM managed_assignment WHERE session_id=? AND state IN ('offered','running')",sessionId),a=/** @type {Assignment|null} */(decode(row));if(a&&!a.cancelRequested)this.saveAssignment(tx,a,{...a,cancelRequested:true});return this.saveSession(tx,s,{...s,state:'closing',cancelRequested:true});});}
 /** A current authenticated terminal observation for the selected exact run
  * proves stop, never validation success. No receipt is fabricated on interruption.
  * @param {string} sessionId @param {ProviderRun} provider */
 providerStopped(sessionId,provider){return this.ledger.transact(tx=>{const s=this.session(tx,sessionId);this.matchingRun(s,provider);requireThat(s.run?.runId===provider.runId&&provider.status==='completed','EFFECT_UNCERTAIN');if(s.state==='closed')return s;const row=tx.get("SELECT record FROM managed_assignment WHERE session_id=? AND state IN ('offered','running')",sessionId),a=/** @type {Assignment|null} */(decode(row));if(a)this.saveAssignment(tx,a,{...a,state:'stopped',cancelRequested:true});return this.saveSession(tx,s,{...s,state:'closed',run:structuredClone(provider),stoppedAt:provider.observedAt});});}
 /** Only a durably never-sent launch can close without a provider terminal. Once
  * markLaunchSent commits, absence/timeouts alone cannot free a physical slot.
  * @param {string} sessionId */
 closeUnlaunched(sessionId){return this.ledger.transact(tx=>{const s=this.session(tx,sessionId);requireThat(s.launch==='reserved'&&!s.run,'EFFECT_UNCERTAIN');if(s.state==='closed')return s;return this.saveSession(tx,s,{...s,state:'closed',stoppedAt:timestamp(this.now())});});}
 /** @param {number} [limit] */
 open(limit=128){requireThat(Number.isSafeInteger(limit)&&limit>0&&limit<=128,'INVALID_ARGUMENT');return this.ledger.transact(tx=>tx.all("SELECT record FROM managed_session WHERE state<>'closed' ORDER BY session_id LIMIT ?",limit).map(row=>/** @type {Session} */(decode(row))));}
 /** OIDC readLaunch projection uses provider IDs, never internal repository IDs.
  * @param {string} sessionId */
 launchAuthorization(sessionId){return this.ledger.transact(tx=>{const s=this.session(tx,sessionId),i=s.intent;if(!s.run)return null;return {sessionId,installationId:i.installationId,repositoryId:i.providerRepositoryId,repositoryOwnerId:i.repositoryOwnerId,repositoryFullName:i.repositoryFullName,ref:i.ref,workflowRef:i.workflowRef,launchCommit:i.launchCommit,runId:s.run.runId,runAttempt:'1',active:s.state==='active'||s.state==='closing',expiresAt:i.deadline,provider:s.run};});}
}
