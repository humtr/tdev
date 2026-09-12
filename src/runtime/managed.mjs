import {createHmac} from 'node:crypto';
import {createRemoteJWKSet} from 'jose';
import {canonicalJson,parseRecord,recordDigest} from '../contracts/canonical.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {ManagedSessions} from '../execution/sessions.mjs';
import {GitHubSessions} from '../execution/github-sessions.mjs';
import {ManagedPool} from '../execution/managed-pool.mjs';
import {AssignmentTransfer} from '../execution/session-transfer.mjs';
import {ExecutorEndpoint} from '../execution/executor-endpoint.mjs';
import {githubExecutorVerifier} from '../execution/github-identity.mjs';
import {managedDefinition} from '../execution/controller-identity.mjs';
import {supportsManagedPolicy} from '../validation/managed-policy.mjs';
import {RequiredValidation} from '../validation/receipts.mjs';
import {qualifiedPolicy,PolicyState} from '../release/policy.mjs';
import {IntegratedSourceAuthority} from '../release/authority.mjs';
import {verifyEnrollment} from './enrollment.mjs';
import {createProductionControl} from './production.mjs';
import {createProductionCommissioning} from './production-commissioning.mjs';
import {executorRequest} from '../execution/protocol.mjs';
/** @typedef {import('../contracts/ports.js').PreparedResult} Result */
/** @typedef {import('../contracts/ports.js').Json} Json */
/** Pure durable view: this does not observe or launch any provider operation.
 * Public output keeps the frozen schema and omits payload/credentials/leases.
 * @param {ManagedSessions} sessions */
export function managedSessionViews(sessions){return sessions.ledger.transact(tx=>tx.all('SELECT record FROM managed_session ORDER BY rowid DESC LIMIT 128').map(row=>{
 const s=/** @type {import('../execution/session-types.js').Session} */(parseRecord(String(row.record))),aRow=tx.get("SELECT record FROM managed_assignment WHERE session_id=? AND state IN ('offered','running') LIMIT 1",s.intent.sessionId),a=aRow?/** @type {import('../execution/session-types.js').Assignment} */(parseRecord(String(aRow.record))):null;
 return {sessionId:s.intent.sessionId,runId:s.run?.runId??null,runAttempt:s.run?Number(s.run.runAttempt):null,state:s.state==='closed'?'stopped':s.cancelRequested?'cancelling':a?'busy':s.state==='active'?'ready':s.launch==='sent'?'waiting':'reserved',ownerEpoch:s.observerEpoch,sourceCommitOid:'sha1:'+s.intent.launchCommit,actionId:a?.input.attempt.actionId??null,createdAt:new Date(s.intent.createdAt).toISOString(),deadline:s.intent.deadline};
}));}
/** Installation composition only. All candidate bytes cross the managed immutable
 * object channel, never a same-UID shell. HMAC keys and canonical credentials stay
 * on native control. GitHub OIDC is authenticated independently of human OAuth.
* @param {{enrollment:import('./enrollment.mjs').Enrollment,runtime:import('./native.mjs').NativeConfig['runtime'],productionEnrollment?:import('./production-enrollment.mjs').ProductionEnrollment,commissioningIntent?:import('./production-enrollment.mjs').ProductionIntent,admission?:import('../release/native-control.mjs').Admission|null,installationSealDigest?:string,origin:string,ledger:import('../storage/ledger.mjs').Ledger,binding:import('../contracts/ports.js').Binding,repository:import('../repository/git.mjs').GitRepository,objects:import('../contracts/ports.js').ObjectStorePort,authorization:import('../contracts/ports.js').AuthorizationPort,initialPolicy:import('../validation/policy.mjs').AdoptedPolicy,remote:ConstructorParameters<typeof IntegratedSourceAuthority>[0]['remote'],verifyLineage:(head:string)=>Promise<boolean>,token:string,receiptSecret:Uint8Array,capacity:number,wake:()=>void}} options */
export async function createManagedControl(options){
 const o=options,e=o.enrollment;requireThat(o.token.length>=16&&o.receiptSecret.byteLength>=32,'UNAUTHORIZED');
 const production=o.productionEnrollment?await createProductionControl({...o,enrollment:o.productionEnrollment,qualificationSealDigest:e.sealDigest}):null;
 const approved=await o.repository.readCommit(o.binding,e.approvedCommitOid),definition=await managedDefinition(o.repository,approved.source);
 const enrolled=verifyEnrollment(e,{binding:o.binding,definition,source:approved.source,runtime:o.runtime,origin:o.origin,...(production?{releaseAdmission:{admission:o.admission??null,expected:{...o.binding,runtime:o.runtime,enrollmentSealDigest:production.enrolled.sealDigest,trustedRunnerDigest:production.definition.identities.trustedRunnerDigest,workflowDigest:production.definition.identities.workflowDigest}}}:{})});
 const sessions=new ManagedSessions({ledger:o.ledger,config:{repositoryOwnerId:e.repositoryOwnerId,repositoryFullName:e.repositoryFullName,approvedCommit:e.approvedCommitOid.slice(5),trustedRunnerDigest:definition.identities.trustedRunnerDigest,sessionTimeoutMs:definition.config.sessionLifetimeMs,capacity:o.capacity,sealDigest:enrolled.sealDigest}});
 requireThat(!o.commissioningIntent||!production,'FORBIDDEN','Commissioning cannot replace an installed production capability');
 const commissioning=o.commissioningIntent?await createProductionCommissioning({...o,intent:o.commissioningIntent,qualificationSealDigest:enrolled.sealDigest}):null;
 const provider=new GitHubSessions({sessions,token:async()=>o.token}),pool=new ManagedPool({sessions,provider,repository:o.repository,objects:o.objects}),transfer=new AssignmentTransfer({sessions,objects:o.objects});pool.reconcileLocal();
 const verifier=githubExecutorVerifier({origin:o.origin,installationId:o.binding.installationId},createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks')),sessionId=>provider.authorization(sessionId));
 const qualifiedEndpoint=new ExecutorEndpoint({sessions,transfer,verify:verifier,poll:identity=>pool.poll(identity),retire:identity=>pool.retire(identity),wake:o.wake});
 const endpoint={invoke:async(/** @type {unknown} */ value,/** @type {string} */ assertion)=>{const request=executorRequest(value),session=o.ledger.transact(tx=>sessions.session(tx,request.sessionId)),extra=production??commissioning;return (extra&&session.intent.trustedRunnerDigest===extra.definition.identities.trustedRunnerDigest?extra.endpoint:qualifiedEndpoint).invoke(value,assertion);}};
 const key=createHmac('sha256',o.receiptSecret).update('dev2.native-managed-receipt-key.v1\0'+o.binding.installationId+'\0'+o.binding.repositoryId).digest();
 /** @type {Map<string,import('../validation/policy.mjs').AdoptedPolicy>} */const policies=new Map([[enrolled.policy.policy.digest,enrolled.policy]]);
 /** @type {Map<string,RequiredValidation>} */const validators=new Map();
 const capable=(/** @type {import('../validation/policy.mjs').AdoptedPolicy} */ policy)=>supportsManagedPolicy(policy,definition.identities)||!!production&&supportsManagedPolicy(policy,production.definition.identities);
 const validator=(/** @type {import('../validation/policy.mjs').AdoptedPolicy} */ policy)=>{
  requireThat(capable(policy),'EXECUTION_UNAVAILABLE','Policy exceeds the installed managed controller');let v=validators.get(policy.policy.digest);if(!v){const prod=production&&supportsManagedPolicy(policy,production.definition.identities)?production:null;v=new RequiredValidation({key,profiles:policy.required(),execution:policy.policy.execution,...(prod?{productionEnrollment:prod.enrolled.sealDigest}:{}),run:async(r,a,p)=>{if(!prod)return pool.run(r,a,p);const execution=await prod.pool.run(r,a,p),{proof}=await prod.enrolled.receipts.verify(r,a,p,execution);return {...execution,productionProof:proof};}});validators.set(policy.policy.digest,v);policies.set(policy.policy.digest,policy);}return v;
 };
 /** Historical policy capability is retained and MAC checked, not replaced by the
  * current policy when evaluating an exact older receipt. No arbitrary policy is
  * read from the candidate merely because it supplies a matching digest.
  * @param {Result} result */
 const validationFor=result=>{
  let p=policies.get(result.policyDigest);if(!p){const rows=o.ledger.transact(tx=>tx.all("SELECT value FROM meta WHERE key LIKE 'policy.adoption:%' AND json_extract(value,'$.policy.digest')=?",result.policyDigest));requireThat(rows.length===1,'VALIDATION_FAILED','Unknown retained validation policy');const record=/** @type {{policy:ConstructorParameters<typeof import('../validation/policy.mjs').AdoptedPolicy>[0]}} */(parseRecord(String(rows[0].value)));p=qualifiedPolicy({schemaVersion:1,...record.policy});policies.set(p.policy.digest,p);}
  requireThat(canonicalJson(p.policy.execution)===canonicalJson(result.execution),'VALIDATION_FAILED','Receipt execution identity changed');return validator(p);
 };
 const authority=new IntegratedSourceAuthority({ledger:o.ledger,binding:o.binding,repository:o.repository,remote:o.remote,validation:validationFor,verifyLineage:o.verifyLineage});
 // Commissioning identity remains stable when a later validated native release
 // changes its private nativeJoin evidence, while executor identity stays fixed.
 // The full per-install seal still binds that exact native join and assignments.
 const {nativeJoin:ignored,sealDigest:ignoredSeal,...controllerEnrollment}=e;
 const commissioningDigest=recordDigest('dev2.controller-commissioning.v1',controllerEnrollment);
 const policyState=new PolicyState({ledger:o.ledger,binding:o.binding,initial:o.initialPolicy,enrollment:{digest:commissioningDigest,policy:enrolled.policy},authorize:(principal,path)=>o.authorization.authorize(principal,o.binding,'policy.write',[path]),verifyIntegrated:(commit,policy)=>authority.verify(commit,policy),readBlob:blob=>o.repository.blob(blob),qualify:async policy=>capable(policy)});
 await policyState.restore();validator(policyState.current);
 const views=()=>managedSessionViews(sessions);
 const identity=()=>{const rows=views();return {state:'ready',sealDigest:production&&supportsManagedPolicy(policyState.current,production.definition.identities)?production.enrolled.sealDigest:enrolled.sealDigest,activeSessions:rows.filter(s=>s.state==='ready'||s.state==='busy').length,reservedSessions:rows.filter(s=>s.state==='waiting'||s.state==='reserved').length,reason:null};};
 const poolFor=(/** @type {import('../contracts/ports.js').ExecutionIdentity} */ execution)=>production&&execution.trustedRunnerDigest===production.definition.identities.trustedRunnerDigest?production.pool:pool;
 const attemptPool=(/** @type {import('../contracts/ports.js').Attempt} */ attempt)=>{const ds=pool.dispatches(attempt);if(!ds.length)return pool;const s=o.ledger.transact(tx=>sessions.session(tx,ds[0].sessionId));return production&&s.intent.trustedRunnerDigest===production.definition.identities.trustedRunnerDigest?production.pool:pool;};
 return {enrolled,production,commissioning,sessions,provider,pool,poolFor,attemptPool,transfer,endpoint,policyState,authority,validationFor,validation:()=>validator(policyState.current),views,identity};
}
