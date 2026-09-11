import { canonicalJson, parseRecord } from '../contracts/canonical.mjs';
import { newId } from '../contracts/identity.mjs';
import { requireThat, Dev2Error } from '../contracts/errors.mjs';
import { composeTrees } from '../candidate/tree.mjs';
/** @typedef {import('../contracts/ports.js').SourceTree} Tree */
/** @typedef {import('../contracts/ports.js').SourceEntry} Entry */
/** @typedef {import('../contracts/ports.js').Work} Work */
/** @typedef {import('../contracts/ports.js').PreparedResult} Result */
/** @typedef {import('../contracts/ports.js').ExecutionIdentity} Execution */
/** Frozen metadata and random result identity are recorded in the same existing
 * action owner BEFORE creating Git commit bytes; restart derives the same commit.
 */
export class ResultPreparer {
 /** @param {{repository:import('../repository/git.mjs').GitRepository,binding:import('../contracts/ports.js').Binding,ledger:import('../storage/ledger.mjs').Ledger,verifyLineage:(head:string)=>Promise<boolean>,actor:string,now?:()=>number}} options */
 constructor(options){this.o=options;this.now=options.now??Date.now;}
 /** @param {Work} work @param {string} head @param {Execution} execution @param {string} policy @returns {Promise<Result>} */
 async prepare(work,head,execution,policy){
 requireThat(work.currentActionId,'INTEGRITY_FAILURE','Preparation must belong to a durable action');const actionId=work.currentActionId;
 requireThat(await this.o.verifyLineage(head),'FORBIDDEN','Unverified managed lineage');
 const candidate=await this.o.repository.readTree(work.candidate.treeOid);requireThat(candidate.manifestDigest===work.candidate.manifestDigest,'INTEGRITY_FAILURE','Candidate manifest changed');
  const base=await this.o.repository.readCommit(this.o.binding,work.baseCommitOid);requireThat(base.source.treeOid===work.baseTreeOid,'INTEGRITY_FAILURE');
 requireThat(await this.o.repository.isAncestor(this.o.binding,work.baseCommitOid,head),'INTEGRATION_CONFLICT','Original base is not an ancestor');
 const current=await this.o.repository.readCommit(this.o.binding,head);requireThat(base.source.manifestDigest!==work.candidate.manifestDigest,'NO_CHANGE');const tree=await this.o.repository.writeTree(composeTrees(base.source,candidate,current.source));
 const key='prepare:'+actionId;
 const seed=this.o.ledger.transact(tx=>{
  const a=tx.getAction(actionId),w=tx.getWork(work.workId);requireThat(a&&w&&w.currentActionId===actionId&&w.generation===work.generation,'STALE_REVISION');
  const row=tx.get('SELECT value FROM meta WHERE key=?',key);
  if(row){requireThat(typeof row.value==='string','INTEGRITY_FAILURE');return /** @type {{resultId:string,metadata:Result['metadata']}} */(parseRecord(row.value));}
  const seed={resultId:newId(),metadata:{author:this.o.actor,committer:this.o.actor,timestamp:this.now(),message:'dev-2 source change'}};
  tx.run('INSERT INTO meta(key,value) VALUES(?,?)',key,canonicalJson(seed));return seed;
 });
 const existing=this.o.ledger.transact(tx=>tx.getPrepared(seed.resultId));if(existing)return this.reuse(seed.resultId,work,head,execution,policy);
 const commitOid=await this.o.repository.freezeCommit(head,tree,seed.metadata,seed.resultId);
 const result={resultId:seed.resultId,repositoryId:work.repositoryId,bindingEpoch:work.bindingEpoch,workId:work.workId,generation:work.generation,baseCommitOid:work.baseCommitOid,baseTreeOid:work.baseTreeOid,candidateTreeOid:work.candidate.treeOid,expectedHead:head,commitOid,resultTreeOid:tree.treeOid,resultTreeSha256:tree.manifestDigest,policyDigest:policy,metadata:seed.metadata,execution:structuredClone(execution)};
 this.o.ledger.transact(tx=>{const a=tx.getAction(actionId),w=tx.getWork(work.workId);requireThat(a&&w&&w.currentActionId===actionId&&w.generation===work.generation,'STALE_REVISION');tx.putPrepared(result);tx.updateAction({...a,resultId:result.resultId,step:'prepared'});});return result;
 }
 /** @param {string} resultId @param {Work} work @param {string} head @param {Execution} execution @param {string} policy @returns {Promise<Result>} */
 async reuse(resultId,work,head,execution,policy){
 const result=this.o.ledger.transact(tx=>tx.getPrepared(resultId));requireThat(result&&result.repositoryId===work.repositoryId&&result.bindingEpoch===work.bindingEpoch&&result.workId===work.workId&&result.generation===work.generation&&result.candidateTreeOid===work.candidate.treeOid&&result.expectedHead===head&&result.policyDigest===policy&&canonicalJson(result.execution)===canonicalJson(execution),'STALE_RESULT');
 const commit=await this.o.repository.readCommit(this.o.binding,result.commitOid);requireThat(commit.parents.length===1&&commit.parents[0]===head&&commit.source.treeOid===result.resultTreeOid&&commit.source.manifestDigest===result.resultTreeSha256,'INTEGRITY_FAILURE');return result;
 }
}
