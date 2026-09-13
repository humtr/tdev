import {createRemoteJWKSet} from 'jose';
import {canonicalJson,parseRecord,recordDigest} from '../contracts/canonical.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {managedDefinition} from '../execution/controller-identity.mjs';
import {ManagedSessions} from '../execution/sessions.mjs';
import {ManagedPool} from '../execution/managed-pool.mjs';
import {GitHubSessions} from '../execution/github-sessions.mjs';
import {AssignmentTransfer} from '../execution/session-transfer.mjs';
import {ExecutorEndpoint} from '../execution/executor-endpoint.mjs';
import {githubExecutorVerifier} from '../execution/github-identity.mjs';
import {ProductionReceipts} from '../execution/outer-receipt.mjs';
import {releaseBuildProfile,releaseBuildExecution} from '../release/build-profile.mjs';
import {checkProductionIntent,productionIntentDigest,verifyProductionEnrollment} from './production-enrollment.mjs';
/** Private installer only. This controller dispatches only the exact approved
 * source and the three fixed probe profiles. It exposes no production Builder,
 * policy, validation or integration authority before verified completion.
 * @param {Omit<Parameters<typeof import('./production.mjs').createProductionControl>[0],'enrollment'> & {intent:import('./production-enrollment.mjs').ProductionIntent}} o */
export async function createProductionCommissioning(o){
 const i=o.intent,approved=await o.repository.readCommit(o.binding,i.approvedCommitOid),definition=await managedDefinition(o.repository,approved.source);
 checkProductionIntent(i,{...o,definition,source:approved.source});
 requireThat(canonicalJson(i.runtime)===canonicalJson(o.runtime)&&definition.config.origin===o.origin,'INTEGRITY_FAILURE');
 const intentDigest=productionIntentDigest(i),ledger=o.ledger;
 ledger.transact(tx=>{const key='production.commissioning:'+i.commissioningId,row=tx.get('SELECT value FROM meta WHERE key=?',key);if(row)requireThat(String(row.value)===canonicalJson(i),'IDEMPOTENCY_MISMATCH');else tx.run('INSERT INTO meta VALUES(?,?)',key,canonicalJson(i));});
 const sessions=new ManagedSessions({ledger,config:{repositoryOwnerId:i.repositoryOwnerId,repositoryFullName:i.repositoryFullName,approvedCommit:i.approvedCommitOid.slice(5),trustedRunnerDigest:i.identities.trustedRunnerDigest,sessionTimeoutMs:definition.config.sessionLifetimeMs,capacity:o.capacity,sealDigest:intentDigest}}),provider=new GitHubSessions({sessions,token:async()=>o.token}),pool=new ManagedPool({sessions,provider,repository:o.repository,objects:o.objects}),transfer=new AssignmentTransfer({sessions,objects:o.objects});
 const verify=githubExecutorVerifier({origin:o.origin,installationId:o.binding.installationId},createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks')),(id,freshProvider)=>provider.authorization(id,freshProvider));
 const endpoint=new ExecutorEndpoint({sessions,transfer,verify,poll:i=>pool.poll(i),retire:i=>pool.retire(i)});
 const receipts=new ProductionReceipts({sessions,objects:o.objects,seccompDigest:i.identities.seccompDigest,controllerDigest:i.identities.controllerDigest,engineDigest:i.engineDigest,dependencyArtifactDigest:i.dependencyArtifactDigest});
 let running=/** @type {Promise<import('./production-enrollment.mjs').ProductionEnrollment>|null} */(null);
 async function runOnce(){
  /** @type {import('./production-enrollment.mjs').EvidenceRef[]} */const proofs=[];
  for(const profile of [...definition.policy.required(),releaseBuildProfile(i.identities.imageDigest)]){
   const key=recordDigest('dev2.production-probe.v1',{intentDigest,profileDigest:profile.digest}).slice(7);
   const retained=ledger.transact(tx=>{
    const old=tx.get('SELECT value FROM meta WHERE key=?','production.probe:'+key);
    if(old){const value=/** @type {{result:import('../contracts/ports.js').PreparedResult,attempt:import('../contracts/ports.js').Attempt}} */(parseRecord(String(old.value))),action=tx.getAction(key),held=tx.retainedAttempt(value.attempt.attemptId);requireThat(action&&held&&!tx.get('SELECT value FROM meta WHERE key=?','cancel:'+key),'STALE_REVISION');
     if(action.status==='succeeded')return value;
     requireThat(['running','blocked'].includes(action.status)&&action.deadline>Date.now()&&held.held&&held.observerEpoch===ledger.ownerEpoch,'STALE_REVISION','Probe cannot relaunch expired/cancelled execution');
     if(action.status==='blocked'){const queued={...action,status:/** @type {const} */('queued'),ownerEpoch:ledger.ownerEpoch};tx.updateAction(queued);tx.updateAction({...queued,status:'running'});}return value;}
    const attempt={installationId:i.installationId,repositoryId:i.repositoryId,workId:key,actionId:key,attemptId:key,attempt:'1',ownerEpoch:ledger.ownerEpoch};
    const work={workId:key,repositoryId:i.repositoryId,bindingEpoch:i.bindingEpoch,principal:'private-production-installer',baseCommitOid:i.approvedCommitOid,baseTreeOid:i.approvedSourceTreeOid,candidate:{treeOid:i.approvedSourceTreeOid,manifestDigest:i.approvedSourceManifestDigest},generation:'0',revision:'0',disposition:/** @type {const} */('open'),currentActionId:key};tx.insertWork(work);
tx.insertAction({actionId:key,requestId:key,principal:work.principal,bindingEpoch:i.bindingEpoch,intentDigest,operation:'production.commission',workId:key,status:'running',step:'private.exact-source.probe',attempt:'0',ownerEpoch:ledger.ownerEpoch,deadline:Date.now()+900000,resultId:key,errorCode:null});requireThat(tx.reserveAttempt(attempt,o.capacity),'CAPACITY_REJECTED');const admitted=tx.getAction(key);requireThat(admitted,'INTEGRITY_FAILURE');tx.updateAction({...admitted,attempt:'1'});
    const result={resultId:key,repositoryId:i.repositoryId,bindingEpoch:i.bindingEpoch,workId:key,generation:'0',baseCommitOid:i.approvedCommitOid,baseTreeOid:i.approvedSourceTreeOid,candidateTreeOid:i.approvedSourceTreeOid,expectedHead:i.approvedCommitOid,commitOid:i.approvedCommitOid,resultTreeOid:i.approvedSourceTreeOid,resultTreeSha256:i.approvedSourceManifestDigest,policyDigest:definition.policy.policy.digest,metadata:{author:work.principal,committer:work.principal,timestamp:0,message:'Private exact-source production probe; no canonical effect'},execution:profile.profileId==='release-build'?releaseBuildExecution(definition.policy.policy.execution,i.identities.imageDigest):definition.policy.policy.execution};
    tx.putPrepared(result);const value={result,attempt};tx.run('INSERT INTO meta VALUES(?,?)','production.probe:'+key,canonicalJson(value));return value;
   });
   const execution=await pool.run(retained.result,retained.attempt,profile),{proof}=await receipts.verify(retained.result,retained.attempt,profile,execution);requireThat(proof.eligible,'VALIDATION_FAILED','Actual production probe failed');
   const assignment=pool.assignment(proof.assignmentId);requireThat(assignment,'INTEGRITY_FAILURE');
   proofs.push({resultId:retained.result.resultId,assignmentId:proof.assignmentId,sessionId:proof.sessionId,runId:proof.providerRunId,runAttempt:'1',leaseId:assignment.leaseId,profileDigest:profile.digest,contextDigest:proof.contextDigest,outerReceiptDigest:proof.outerReceiptDigest});
   ledger.transact(tx=>{const a=tx.getAction(key),w=tx.getWork(key);requireThat(a&&w,'INTEGRITY_FAILURE');if(a.status==='succeeded')return;tx.updateAction({...a,status:'succeeded',step:'private.production-proof.retained'});tx.releaseAttempt(retained.attempt.attemptId);tx.compareWork(w.revision,{...w,revision:String(BigInt(w.revision)+1n),disposition:'cancelled',currentActionId:null});});
  }
  const body={schemaVersion:/** @type {const} */(1),kind:/** @type {const} */('dev2.production-enrollment'),intent:i,proofs},enrollment={...body,sealDigest:recordDigest('dev2.production-enrollment.v1',body)};
  await verifyProductionEnrollment(enrollment,{...o,definition,source:approved.source,sessions});return enrollment;
 }
 return {definition,sessions,pool,provider,endpoint,run(){return running??=runOnce().finally(()=>{running=null;});}};
}
