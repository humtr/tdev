import { canonicalJson, parseRecord } from '../contracts/canonical.mjs';
import { newId } from '../contracts/identity.mjs';
import { requireThat } from '../contracts/errors.mjs';
import { composeTrees } from '../candidate/tree.mjs';
/** @typedef {import('../contracts/ports.js').Work} Work */
/** @typedef {import('../contracts/ports.js').PreparedResult} Result */
/** @typedef {import('../contracts/ports.js').ExecutionIdentity} Execution */
/** Frozen result metadata belongs to its durable action, never a retry's clock. */
export class ResultPreparer {
 /** @param {{repository:import('../repository/git.mjs').GitRepository,binding:import('../contracts/ports.js').Binding,ledger:import('../storage/ledger.mjs').Ledger,verifyLineage:(head:string)=>Promise<boolean>,actor:string,now?:()=>number}} options */
 constructor(options){this.o=options;this.now=options.now??Date.now;}
 /** Rechecked after every asynchronous construction boundary. This is a short
  * ledger predicate, not a lock held over Git work.
  * @param {import('../storage/ledger.mjs').Transaction} tx @param {Work} work */
 fence(tx,work){
  requireThat(work.currentActionId,'STALE_REVISION');
  const a=tx.getAction(work.currentActionId),w=tx.getWork(work.workId);
  requireThat(a&&w&&a.status==='running'&&a.ownerEpoch===this.o.ledger.ownerEpoch&&
   w.currentActionId===work.currentActionId&&w.revision===work.revision&&w.generation===work.generation&&
   w.disposition==='open'&&canonicalJson(w.candidate)===canonicalJson(work.candidate),'STALE_REVISION');
  requireThat(a.deadline>this.now()&&tx.get('SELECT value FROM meta WHERE key=?','cancel:'+a.actionId)?.value!=='true','STALE_REVISION');
  return a;
 }
 /** @param {Work} work @param {string} head @param {Execution} execution @param {string} policy @returns {Promise<Result>} */
 async prepare(work,head,execution,policy){
  requireThat(work.currentActionId,'INTEGRITY_FAILURE');const actionId=work.currentActionId;
  requireThat(policy===this.o.binding.policyDigest,'STALE_RESULT');
  this.o.ledger.transact(tx=>this.fence(tx,work));
  requireThat(await this.o.verifyLineage(head),'FORBIDDEN','Unverified managed lineage');
  const base=await this.o.repository.readCommit(this.o.binding,work.baseCommitOid);
  requireThat(base.source.treeOid===work.baseTreeOid,'INTEGRITY_FAILURE');
  requireThat(await this.o.repository.isAncestor(this.o.binding,work.baseCommitOid,head),'INTEGRATION_CONFLICT');
  const current=await this.o.repository.readCommit(this.o.binding,head),candidate=await this.o.repository.readTree(work.candidate.treeOid);
  requireThat(candidate.manifestDigest===work.candidate.manifestDigest,'INTEGRITY_FAILURE');
  requireThat(base.source.manifestDigest!==candidate.manifestDigest,'NO_CHANGE');
  const tree=await this.o.repository.writeTree(composeTrees(base.source,candidate,current.source));
  const identity={head,treeOid:tree.treeOid,manifestDigest:tree.manifestDigest,candidate:work.candidate,generation:work.generation,policy,execution};
  const key='prepare:'+actionId;
  const seed=this.o.ledger.transact(tx=>{
   this.fence(tx,work);requireThat(policy===this.o.binding.policyDigest,'STALE_RESULT');
   const row=tx.get('SELECT value FROM meta WHERE key=?',key);
   if(row){
    const value=/** @type {{resultId:string,metadata:Result['metadata'],identity?:typeof identity}} */(parseRecord(String(row.value)));
    // Old completed preparation remains reusable. An incomplete old descriptor
    // cannot authorize silently freezing a different target after interruption.
    requireThat(value.identity?canonicalJson(value.identity)===canonicalJson(identity):tx.getPrepared(value.resultId)!==null,'STALE_RESULT');return value;
   }
   const value={resultId:newId(),metadata:{author:this.o.actor,committer:this.o.actor,timestamp:this.now(),message:'dev-2 source change'},identity};
   tx.run('INSERT INTO meta(key,value) VALUES(?,?)',key,canonicalJson(value));return value;
  });
  const existing=this.o.ledger.transact(tx=>tx.getPrepared(seed.resultId));
  if(existing)return this.reuse(seed.resultId,work,head,execution,policy);
  const commitOid=await this.o.repository.freezeCommit(head,tree,seed.metadata,seed.resultId);
  const result={resultId:seed.resultId,repositoryId:work.repositoryId,bindingEpoch:work.bindingEpoch,workId:work.workId,generation:work.generation,baseCommitOid:work.baseCommitOid,baseTreeOid:work.baseTreeOid,candidateTreeOid:work.candidate.treeOid,expectedHead:head,commitOid,resultTreeOid:tree.treeOid,resultTreeSha256:tree.manifestDigest,policyDigest:policy,metadata:seed.metadata,execution:structuredClone(execution)};
  this.o.ledger.transact(tx=>{const a=this.fence(tx,work);requireThat(policy===this.o.binding.policyDigest,'STALE_RESULT');tx.putPrepared(result);tx.updateAction({...a,resultId:result.resultId,step:'prepared'});});return result;
 }
 /** @param {string} resultId @param {Work} work @param {string} head @param {Execution} execution @param {string} policy @returns {Promise<Result>} */
 async reuse(resultId,work,head,execution,policy){
  const result=this.o.ledger.transact(tx=>tx.getPrepared(resultId));
  requireThat(result&&result.repositoryId===work.repositoryId&&result.bindingEpoch===work.bindingEpoch&&result.workId===work.workId&&result.generation===work.generation&&result.baseCommitOid===work.baseCommitOid&&result.baseTreeOid===work.baseTreeOid&&result.candidateTreeOid===work.candidate.treeOid&&result.expectedHead===head&&result.policyDigest===policy&&policy===this.o.binding.policyDigest&&canonicalJson(result.execution)===canonicalJson(execution),'STALE_RESULT');
  const commit=await this.o.repository.readCommit(this.o.binding,result.commitOid);
  requireThat(commit.parents.length===1&&commit.parents[0]===head&&commit.source.treeOid===result.resultTreeOid&&commit.source.manifestDigest===result.resultTreeSha256,'INTEGRITY_FAILURE');
  if(work.currentActionId)this.o.ledger.transact(tx=>this.fence(tx,work));
  return result;
 }
}
