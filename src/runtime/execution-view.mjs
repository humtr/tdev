import {parseRecord,recordDigest} from '../contracts/canonical.mjs';
import {digest} from '../contracts/identity.mjs';
import {requireThat} from '../contracts/errors.mjs';
/** @typedef {import('../contracts/ports.js').Action} Action */
/** @typedef {import('../contracts/ports.js').Json} Json */
/** Read-only projection of receipts already accepted by the native authenticated
 * assignment owner. It neither trusts stdout as a receipt nor manufactures an
 * artifact capability from a caller-supplied digest. Authorization of the action
 * itself remains at the public application boundary.
 * @param {import('../storage/ledger.mjs').Ledger} ledger @param {Action} action */
export function retainedExecutionView(ledger,action){
 return ledger.transact(tx=>{
  if(!['run','validate','integrate'].includes(action.operation)||!action.workId)return null;
  if(!tx.get("SELECT name FROM sqlite_master WHERE type='table' AND name='managed_artifact'"))return null;
  const rows=tx.all("SELECT record FROM managed_assignment WHERE state='complete' AND json_extract(record,'$.input.attempt.actionId')=? ORDER BY rowid LIMIT 129",action.actionId);
  requireThat(rows.length<=128,'LIMIT_EXCEEDED','Retained execution diagnostic bound');
  /** @type {Map<string,{artifactId:string,actionId:string,contentDigest:string,mediaType:string,size:number,kind:'log'}>} */const artifacts=new Map();
  /** @type {import('../execution/session-types.js').ExecutionResult[]} */const results=[];
  for(const row of rows){const a=/** @type {import('../execution/session-types.js').Assignment} */(parseRecord(String(row.record),2097152)),r=a.result;
   requireThat(a.state==='complete'&&r&&r.stopped===true&&a.input.attempt.actionId===action.actionId&&a.input.attempt.workId===action.workId&&a.input.attempt.repositoryId===ledger.binding.repositoryId&&a.input.attempt.installationId===ledger.binding.installationId&&r.assignmentId===a.assignmentId&&r.leaseId===a.leaseId&&r.inputIdentity===a.inputIdentity&&a.inputIdentity===recordDigest('dev2.managed-assignment-input.v1',a.input)&&r.sealDigest===a.sealDigest,'INTEGRITY_FAILURE','Retained execution diagnostic identity mismatch');
   if(action.resultId!==null&&a.input.resultId!==action.resultId)continue;
   results.push(r);
   for(const contentDigest of r.artifacts){digest(contentDigest);const saved=tx.get("SELECT size FROM managed_artifact WHERE assignment_id=? AND digest=? AND state='ready'",a.assignmentId,contentDigest);requireThat(saved&&Number.isSafeInteger(Number(saved.size))&&Number(saved.size)>=0&&Number(saved.size)<=16777216,'INTEGRITY_FAILURE','Incomplete execution artifact');
    const artifactId=contentDigest.slice(7),size=Number(saved.size),prior=artifacts.get(artifactId);if(prior)requireThat(prior.size===size,'INTEGRITY_FAILURE');
    artifacts.set(artifactId,{artifactId,actionId:action.actionId,contentDigest,mediaType:'application/json',size,kind:'log'});
   }
  }
  requireThat(artifacts.size<=128,'LIMIT_EXCEEDED');if(results.length===0)return null;
  const result=results.find(r=>r.exitCode!==0||r.signal!==null||r.deadlineExceeded)??results[results.length-1];
  const terminal=['succeeded','failed','cancelled'].includes(action.status);
  return {kind:'execution',profileId:action.operation==='run'?'configured-profile':'required-validation',exitCode:terminal?result.exitCode:null,signal:terminal?result.signal:null,inputDigest:result.inputDigest,outputDigest:result.outputDigest,artifacts:[...artifacts.values()]};
 });
}
/** @param {import('../storage/ledger.mjs').Ledger} ledger @param {Action} action @param {string} artifactId */
export function retainedArtifactDigest(ledger,action,artifactId){return retainedExecutionView(ledger,action)?.artifacts.find(a=>a.artifactId===artifactId)?.contentDigest??null;}
