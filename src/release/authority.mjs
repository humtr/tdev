import {canonicalJson,parseRecord,recordDigest} from '../contracts/canonical.mjs';
import {oid,digest} from '../contracts/identity.mjs';
import {requireThat} from '../contracts/errors.mjs';
/** @typedef {import('../contracts/ports.js').PreparedResult} Result */
/** @typedef {import('../contracts/ports.js').ValidationReceipt} Receipt */
/** @typedef {import('../contracts/ports.js').Effect} Effect */
/** @typedef {import('../contracts/ports.js').Action} Action */
/** @typedef {import('../contracts/ports.js').Work} Work */
/** @typedef {{result:Result,receipt:Receipt,effect:Effect,action:Action,work:Work,observation:import('../contracts/ports.js').EffectObservation}} Frame */
/** @typedef {{repositoryId:string,bindingEpoch:string,commitOid:string,source:import('../contracts/ports.js').SourceTree,policyDigest:string,validationId:string,result:Result,receipt:Receipt,effect:Effect}} IntegratedSource */
/** Native required-validation and exact-publication evidence, not a source SHA
 * supplied by an MCP caller or a bootstrap publication. Terminal ledger records,
 * authenticated required receipt, exact tree and current canonical ancestry all
 * participate. Old fixtures/qualification cannot acquire release authority.
 */
export class IntegratedSourceAuthority {
 /** @param {{ledger:import('../storage/ledger.mjs').Ledger,binding:import('../contracts/ports.js').Binding,repository:import('../repository/git.mjs').GitRepository,remote:{resolve:()=>Promise<import('../contracts/ports.js').RefObservation>,fetch:(head:string)=>Promise<void>},validation:(result:Result)=>import('../contracts/ports.js').ValidationPort,verifyLineage:(head:string)=>Promise<boolean>}} options */
 constructor(options){this.o=options;}
 /** @param {string} commit @param {string} policy @returns {Frame[]} */
 retained(commit,policy){return this.o.ledger.transact(tx=>{
  const rows=tx.all(`SELECT p.record prepared,v.record validation,e.record effect,a.record action,w.record work,m.value observation
   FROM prepared p JOIN effect e ON json_extract(e.record,'$.preparedResultId')=p.result_id
   JOIN action a ON a.action_id=e.action_id JOIN work w ON w.work_id=p.work_id
   JOIN validation v ON v.result_id=p.result_id AND v.validation_id=json_extract(e.record,'$.validationId')
   JOIN meta m ON m.key='effect-observation:'||a.action_id
   WHERE json_extract(p.record,'$.commitOid')=? AND json_extract(p.record,'$.policyDigest')=?
    AND a.status='succeeded' AND w.disposition='integrated'
   ORDER BY a.seq DESC,v.rowid DESC LIMIT 8`,commit,policy);
  return rows.map(row=>({result:/** @type {Result} */(parseRecord(String(row.prepared))),receipt:/** @type {Receipt} */(parseRecord(String(row.validation))),effect:/** @type {Effect} */(parseRecord(String(row.effect))),action:/** @type {Action} */(parseRecord(String(row.action))),work:/** @type {Work} */(parseRecord(String(row.work))),observation:/** @type {import('../contracts/ports.js').EffectObservation} */(parseRecord(String(row.observation)))}));
 });}
 /** @param {string} commit @param {string} policy @returns {Promise<IntegratedSource>} */
 async verify(commit,policy){
  oid(commit);digest(policy);const {binding,ledger,repository}=this.o;
  requireThat(binding.policyDigest===policy,'STALE_RESULT','Current adopted policy differs');
  const candidates=this.retained(commit,policy);requireThat(candidates.length>0,'VALIDATION_FAILED','No native validated canonical integration for this exact commit');
  let frame=/** @type {Frame|undefined} */(undefined);
  for(const candidate of candidates){const {result:r,receipt:v,effect:e,action:a,work:w,observation:o}=candidate;
   requireThat(r.commitOid===commit&&r.policyDigest===policy&&r.repositoryId===binding.repositoryId&&r.bindingEpoch===binding.bindingEpoch&&r.workId===w.workId&&w.repositoryId===binding.repositoryId&&w.bindingEpoch===binding.bindingEpoch&&w.disposition==='integrated'&&a.operation==='integrate'&&a.workId===w.workId&&a.resultId===r.resultId&&a.status==='succeeded'&&a.bindingEpoch===binding.bindingEpoch&&e.actionId===a.actionId&&e.workId===w.workId&&e.repositoryId===binding.repositoryId&&e.bindingEpoch===binding.bindingEpoch&&e.ref===binding.ref&&e.policyDigest===policy&&e.commitOid===commit&&e.expectedHead===r.expectedHead&&e.preparedResultId===r.resultId&&e.validationId===v.validationId&&v.resultId===r.resultId&&o.kind==='integrated','INTEGRITY_FAILURE','Unjoined integration evidence');
   if(await this.o.validation(r).eligible(r,v,policy,ledger.ownerEpoch)){frame=candidate;break;}
  }
  requireThat(frame,'VALIDATION_FAILED','Required receipt is not eligible');
  const stamp=recordDigest('dev2.integrated-authority.v1',frame),observed=await this.o.remote.resolve();
  requireThat(observed.bindingEpoch===binding.bindingEpoch&&await this.o.verifyLineage(observed.head),'STALE_CONTEXT');
  await this.o.remote.fetch(observed.head);
  requireThat(commit===observed.head||await repository.isAncestor(binding,commit,observed.head),'STALE_BASE','Release source is not on the authoritative canonical lineage');
  const exact=await repository.readCommit(binding,commit),r=frame.result;
  requireThat(exact.commitOid===commit&&canonicalJson(exact.parents)===canonicalJson([r.expectedHead])&&exact.source.treeOid===r.resultTreeOid&&exact.source.manifestDigest===r.resultTreeSha256,'INTEGRITY_FAILURE','Integrated bytes changed');
  requireThat(binding.policyDigest===policy&&this.retained(commit,policy).some(current=>recordDigest('dev2.integrated-authority.v1',current)===stamp),'STALE_RESULT','Integration authority changed while reading');
  return {repositoryId:binding.repositoryId,bindingEpoch:binding.bindingEpoch,commitOid:commit,source:exact.source,policyDigest:policy,validationId:frame.receipt.validationId,result:r,receipt:frame.receipt,effect:frame.effect};
 }
}
