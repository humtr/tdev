import { setTimeout as delay } from 'node:timers/promises';
import { canonicalJson, parseRecord, bytesDigest, recordDigest } from '../contracts/canonical.mjs';
import { success, failure } from '../contracts/envelopes.mjs';
import { requireThat } from '../contracts/errors.mjs';
import { newId, digest } from '../contracts/identity.mjs';
import { validateInput, admitWorkBatch } from '../mcp/input-schemas.mjs';
import { SCHEMA_DIGEST, validateOutput, TOOL_DESCRIPTORS } from '../mcp/outputs.mjs';
import { workInput } from './engine.mjs';
import { retainedExecutionView, retainedArtifactDigest } from './execution-view.mjs';
/** @typedef {import('../contracts/ports.js').Json} Json */
/** @typedef {{[key:string]:Json}} RecordValue */
/** @typedef {import('../contracts/ports.js').Principal} Principal */
/** @typedef {import('../contracts/ports.js').Work} Work */
/** @typedef {import('../contracts/ports.js').Action} Action */
/** @typedef {import('../contracts/ports.js').ValidationReceipt} Receipt */
/** @param {unknown} value @returns {RecordValue} */
function record(value){requireThat(value!==null&&typeof value==='object'&&!Array.isArray(value),'INVALID_ARGUMENT');return /** @type {RecordValue} */(value);}
/** @param {unknown} value @returns {Json} */
function json(value){return /** @type {Json} */(parseRecord(canonicalJson(value),2097152));}
export class DevelopmentApplication {
 /** @param {{engine:import('./engine.mjs').DevelopmentEngine,releaseId:string,artifacts:import('../contracts/ports.js').ObjectStorePort,now?:()=>number,pollMs?:number,deploymentSealed?:boolean|(()=>boolean),currentReleaseId?:()=>string,runtimeIdentity?:()=>Promise<Json>,sessions?:()=>Json[]}} options */
 constructor(options){digest(options.releaseId);this.o=options;this.engine=options.engine;this.now=options.now??Date.now;this.runtime={releaseId:options.releaseId,schemaDigest:SCHEMA_DIGEST};
 /** @type {Map<string,{subject:string,key:string,after:number,expires:number}>} */this.cursors=new Map();}
 /** @param {Principal} principal @param {string} name @param {unknown} input @param {AbortSignal} [signal] */
 async invoke(principal,name,input,signal){
 requireThat(TOOL_DESCRIPTORS.some(tool=>tool.name===name),'INVALID_ARGUMENT','Unknown tool');
 try{
  let data;
  if(name==='dev_work'){
   const items=await admitWorkBatch(principal,input,(p,item)=>this.engine.authorize(p,workInput(item)),async(p,item)=>json(await this.engine.admit(p,item)));
   this.engine.pump();const waitMs=Number(record(input).waitMs??0);
   if(waitMs>0){const ids=items.filter(i=>i.ok).map(i=>String(record(i.receipt).actionId));await this.wait(principal,ids,waitMs,signal);}
   data={items};
  }else{
   const value=validateInput(/** @type {'dev_context'|'dev_read'|'dev_observe'} */(name),input);
   if(value.repository!==undefined)requireThat((value.repository==='self'||value.repository===this.engine.binding.repositoryId),'FORBIDDEN');
   if(name==='dev_context')data=await this.context(principal,value);
   else if(name==='dev_read')data=await this.read(principal,value);
   else data=await this.observe(principal,value,signal);
  }
  return validateOutput(name,success(data,{...this.runtime,releaseId:this.o.currentReleaseId?.()??this.runtime.releaseId},new Date(this.now()).toISOString()));
 }catch(error){return validateOutput(name,failure(error));}
 }
 /** @param {Principal} principal @param {RecordValue} input */
 async context(principal,input){
 const b=this.engine.binding,context=this.engine.o.context;
 const snapshot=input.freshness==='pinned'?await context.snapshot(principal,b,String(input.snapshotId),'pinned'):await context.current(principal,b);
 const policy=this.engine.o.policy();const root=await context.readSource(principal,b,snapshot.source,{kind:'snapshot',snapshotId:snapshot.snapshotId,commitOid:snapshot.commitOid},[{kind:'list',path:'',limit:256}],16384);
 const operations=this.engine.operationDescriptors();
 const bootstrapPaths=[];for(const path of ['AGENTS.md','DIRECTIVE.md','RULE.md','WORKBOARD.md','docs/design/README.md','docs/design/INDEX.md'])if(snapshot.source.entries.some(e=>e.path===path)){
  try{await context.authorize(principal,b,[path]);bootstrapPaths.push(path);}catch{}
 }
 return {repository:{repositoryId:b.repositoryId,provider:b.provider,providerRepositoryId:b.providerRepositoryId,ref:b.ref,bindingEpoch:b.bindingEpoch,policyDigest:b.policyDigest},snapshot:{snapshotId:snapshot.snapshotId,commitOid:snapshot.commitOid,treeOid:snapshot.source.treeOid,manifestDigest:snapshot.source.manifestDigest,observedAt:snapshot.observedAt,expiresAt:snapshot.expiresAt,freshness:snapshot.freshness,notCurrent:snapshot.notCurrent},limits:{directoryEntries:256,files:64,returnBytes:262144,blobBytes:1048576,searchHits:128,scanBytes:8388608,defaultParallelism:8,executionCapacity:this.engine.coordinator.executionCapacity},profiles:[...policy.profiles.values()].map(({profile})=>({profileId:profile.profileId,digest:profile.digest,required:policy.policy.required.includes(profile.profileId),parameterSchemaJson:canonicalJson(policy.policy.profiles.find(p=>p.profile.profileId===profile.profileId)?.parameterSchema??{}),replaySafe:profile.replaySafe,network:profile.network,timeoutMs:profile.timeoutMs})),operations,recovery:{requestIdentity:'principal_binding_epoch_request_id',observeRequestIds:true,sameRequestRetry:true,annotationsAuthorizeEffects:false},root:root.results[0],bootstrapPaths};
 }
 /** @param {Principal} principal @param {RecordValue} input */
 async read(principal,input){
 const target=record(input.target),queries=/** @type {RecordValue[]} */(input.queries),budget=Number(input.maxReturnBytes);
 if(target.snapshotId||target.workId){
  let source,scope,notCurrent;
  if(target.snapshotId){const snapshot=await this.engine.o.context.snapshot(principal,this.engine.binding,String(target.snapshotId),/** @type {'current'|'pinned'} */(target.freshness));source=snapshot.source;notCurrent=snapshot.notCurrent;scope={kind:/** @type {const} */('snapshot'),snapshotId:snapshot.snapshotId,commitOid:snapshot.commitOid};}
  else{const work=await this.engine.work(principal,String(target.workId));requireThat(work.generation===target.generation,'STALE_BASE');source=await this.engine.candidate(work);notCurrent=true;scope={kind:/** @type {const} */('work'),workId:work.workId,generation:work.generation};}
  const data=await this.engine.o.context.readSource(principal,this.engine.binding,source,scope,/** @type {import('../repository/context.mjs').ReadQuery[]} */(/** @type {unknown} */(queries)),budget);
  return {notCurrent,...data};
 }
 const action=await this.action(principal,String(target.actionId));const stored=this.engine.metadata('artifact:'+String(target.actionId)+':'+String(target.artifactId))??retainedArtifactDigest(this.engine.ledger,action,String(target.artifactId));requireThat(typeof stored==='string','FORBIDDEN','Artifact is not attached to this authorized action');
 const bytes=await this.o.artifacts.get(stored);requireThat(bytesDigest(bytes)===stored,'INTEGRITY_FAILURE');let remaining=budget;
 const results=queries.map(query=>{
  const start=Number(query.startByte);let length=Math.min(Number(query.maxBytes),bytes.byteLength-start);requireThat(start<=bytes.byteLength,'LIMIT_EXCEEDED');
  for(;;){const chunk=bytes.subarray(start,start+length),complete=start+length===bytes.byteLength;const row={kind:'artifact',artifactId:String(target.artifactId),contentDigest:stored,startByte:start,bytes:length,encoding:'base64',content:Buffer.from(chunk).toString('base64'),complete,nextByte:complete?null:start+length};const size=Buffer.byteLength(canonicalJson(row));if(size<=remaining){remaining-=size;return row;}requireThat(length>0,'LIMIT_EXCEEDED');length=Math.floor(length/2);}
 });
 await this.action(principal,String(target.actionId));
 return {treeOid:null,manifestDigest:null,notCurrent:true,results,returnedBytes:budget-remaining,openedFiles:0,scannedBytes:0};
 }
 /** @param {Principal} principal @param {string} actionId */
 async action(principal,actionId){await this.engine.o.authorization.authorize(principal,this.engine.binding,'repository.read');const action=this.engine.ledger.transact(tx=>tx.getAction(actionId));requireThat(action&&action.principal===principal.subject,'FORBIDDEN');return action;}
 /** @param {Work} w */
 projectWork(w){return {workId:w.workId,repositoryId:w.repositoryId,bindingEpoch:w.bindingEpoch,baseCommitOid:w.baseCommitOid,baseTreeOid:w.baseTreeOid,candidateTreeOid:w.candidate.treeOid,candidateDigest:w.candidate.manifestDigest,generation:w.generation,revision:w.revision,disposition:w.disposition,currentActionId:w.currentActionId,objective:String(this.engine.metadata('objective:'+w.workId)??'')};}
 /** @param {Action} a */
 projectAction(a){let output=this.engine.metadata('action-result:'+a.actionId)??null;const managed=retainedExecutionView(this.engine.ledger,a);if(managed){if(output===null)output=managed;else if(typeof output==='object'&&!Array.isArray(output)&&output.kind==='execution')output={...output,artifacts:managed.artifacts};}return {actionId:a.actionId,requestId:a.requestId,workId:a.workId,operation:a.operation,status:a.status,step:a.step,attempt:a.attempt,revision:String(this.engine.ledger.transact(tx=>tx.get('SELECT value FROM meta WHERE key=?','actionRevision:'+a.actionId)?.value??'0')),deadline:a.deadline,resultId:a.resultId,errorCode:a.errorCode,cancelRequested:this.engine.cancelled(a.actionId),output};}
 /** @param {Principal} principal @param {string[]} ids @param {number} waitMs @param {AbortSignal} [signal] @param {string} [afterRevision] */
 async wait(principal,ids,waitMs,signal,afterRevision){
 requireThat(Number.isSafeInteger(waitMs)&&waitMs>=0&&waitMs<=20000,'LIMIT_EXCEEDED');const deadline=performance.now()+waitMs;
 while(performance.now()<deadline&&!signal?.aborted){
  await this.engine.o.authorization.authorize(principal,this.engine.binding,'repository.read');
  const done=this.engine.ledger.transact(tx=>ids.every(id=>{const a=tx.getAction(id);if(!a||a.principal!==principal.subject)return true;return afterRevision!==undefined?BigInt(String(tx.get('SELECT value FROM meta WHERE key=?','actionRevision:'+id)?.value??'0'))>BigInt(afterRevision):['succeeded','failed','cancelled','blocked'].includes(a.status);}));
  if(done)return;await delay(Math.min(this.o.pollMs??25,Math.max(1,deadline-performance.now())),undefined,{signal}).catch(()=>{});
 }
 }
 /** @param {Principal} principal @param {RecordValue} input @param {AbortSignal} [signal] */
 async observe(principal,input,signal){
 await this.engine.o.authorization.authorize(principal,this.engine.binding,'repository.read');
 const selector=record(input.selector);let workIds=[.../** @type {string[]} */(selector.workIds??[])],actionIds=[.../** @type {string[]} */(selector.actionIds??[])];
 /** @type {string[]} */const missingRequestIds=[];
 if(selector.requestIds)for(const id of /** @type {string[]} */(selector.requestIds)){const a=this.engine.ledger.transact(tx=>tx.lookupRequest(principal.subject,this.engine.binding.bindingEpoch,id));if(a)actionIds.push(a.actionId);else missingRequestIds.push(id);}
 let cursor=/** @type {string|null} */(null),complete=true;
 if(selector.open){
  const key=recordDigest('dev2.observe-cursor.v1',{subject:principal.subject,bindingEpoch:this.engine.binding.bindingEpoch,selector});let after=0;
  if(input.cursor){const c=this.cursors.get(String(input.cursor));requireThat(c&&c.key===key&&c.subject===principal.subject&&c.expires>this.now(),'CONTEXT_EXPIRED');after=c.after;}
  const limit=Math.min(Number(input.limit),64),rows=this.engine.ledger.transact(tx=>tx.listOpen(principal.subject,after,limit));workIds=rows.map(r=>r.work.workId);
  if(rows.length===limit){complete=false;cursor=newId();for(const [key,value] of this.cursors)if(value.expires<=this.now())this.cursors.delete(key);requireThat(this.cursors.size<4096,'CAPACITY_REJECTED');this.cursors.set(cursor,{subject:principal.subject,key,after:rows[rows.length-1].sequence,expires:this.now()+1800000});}
 }
 for(const id of workIds){const w=await this.engine.work(principal,id);if(w.currentActionId)actionIds.push(w.currentActionId);
  const latest=this.engine.ledger.transact(tx=>tx.all('SELECT record FROM action WHERE work_id=? AND principal=? ORDER BY rowid DESC LIMIT 1',id,principal.subject));
  const result=this.engine.ledger.transact(tx=>tx.all('SELECT record FROM action WHERE work_id=? AND principal=? AND json_extract(record,\'$.resultId\') IS NOT NULL ORDER BY rowid DESC LIMIT 1',id,principal.subject));
  for(const row of [...latest,...result])actionIds.push((/** @type {Action} */(parseRecord(String(row.record)))).actionId);
 }
 actionIds=[...new Set(actionIds)];requireThat(actionIds.length<=128,'LIMIT_EXCEEDED');for(const id of actionIds){await this.action(principal,id);await this.engine.specialRecovery.observe(principal,id,false);}
 if(Number(input.waitMs)>0&&actionIds.length)await this.wait(principal,actionIds,Number(input.waitMs),signal,/** @type {string|undefined} */(selector.afterRevision));
 let actions=await Promise.all(actionIds.map(id=>this.action(principal,id)));
 for(const a of actions)if(a.workId)workIds.push(a.workId);
 let works=await Promise.all([...new Set(workIds)].map(id=>this.engine.work(principal,id)));
 if(selector.afterRevision!==undefined){const after=BigInt(String(selector.afterRevision));works=works.filter(w=>BigInt(w.revision)>after);actions=actions.filter(a=>BigInt(this.projectAction(a).revision)>after);}
 const results=[];
 for(const resultId of new Set(actions.map(a=>a.resultId).filter(Boolean))){
  const result=this.engine.ledger.transact(tx=>tx.getPrepared(/** @type {string} */(resultId)));if(!result)continue;await this.engine.work(principal,result.workId);
  const receipt=this.engine.ledger.transact(tx=>{const row=tx.get('SELECT record FROM validation WHERE result_id=? ORDER BY rowid DESC LIMIT 1',result.resultId);return row?/** @type {Receipt} */(parseRecord(String(row.record))):null;});
  const effectAction=actions.find(a=>a.resultId===result.resultId&&a.operation==='integrate'),observation=effectAction?this.engine.metadata('effect-observation:'+effectAction.actionId):null;
  let validation=null;if(receipt)validation={validationId:receipt.validationId,runId:receipt.runId,startedAt:receipt.startedAt,endedAt:receipt.endedAt,exitCode:receipt.exitCode,signal:receipt.signal,deadlineExceeded:receipt.deadlineExceeded,inputDigest:receipt.inputDigest,outputDigest:receipt.outputDigest,outcomes:receipt.outcomes,eligible:await this.engine.o.validation().eligible(result,receipt,this.engine.binding.policyDigest,this.engine.ledger.ownerEpoch)};
  results.push({resultId:result.resultId,workId:result.workId,generation:result.generation,baseCommitOid:result.baseCommitOid,baseTreeOid:result.baseTreeOid,candidateTreeOid:result.candidateTreeOid,execution:result.execution,expectedHead:result.expectedHead,commitOid:result.commitOid,resultTreeOid:result.resultTreeOid,resultTreeSha256:result.resultTreeSha256,policyDigest:result.policyDigest,validation,integration:observation});
 }
 const identity=selector.runtime&&this.o.runtimeIdentity?await this.o.runtimeIdentity():null;
 const runtime=selector.runtime?{...this.runtime,releaseId:this.o.currentReleaseId?.()??this.runtime.releaseId,accepting:this.engine.accepting,capacity:this.engine.coordinator.executionCapacity,reservedAttempts:this.engine.ledger.transact(tx=>tx.reservations().length),executingActions:this.engine.running.size,environmentClass:this.engine.o.policy().policy.execution.environmentClass,deploymentSealed:typeof this.o.deploymentSealed==='function'?this.o.deploymentSealed():this.o.deploymentSealed===true,identity,operations:this.engine.operationDescriptors(),sessions:this.o.sessions?.()??[]}:null;
 const effects=actions.map(a=>this.engine.ledger.transact(tx=>tx.getEffect(a.actionId))).filter(e=>e!==null).map(e=>({effectId:e.effectId,actionId:e.actionId,workId:e.workId,ref:e.ref,expectedHead:e.expectedHead,commitOid:e.commitOid,preparedResultId:e.preparedResultId,validationId:e.validationId,policyDigest:e.policyDigest}));
 return {effects,works:works.map(w=>this.projectWork(w)),actions:actions.map(a=>this.projectAction(a)),results,runtime,complete,cursor,missingRequestIds};
 }
}
