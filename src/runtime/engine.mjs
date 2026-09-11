import { newId, nextRevision } from '../contracts/identity.mjs';
import { canonicalJson, parseRecord, recordDigest } from '../contracts/canonical.mjs';
import { requireThat, Dev2Error } from '../contracts/errors.mjs';
import { WorkCoordinator } from '../work/coordinator.mjs';
import { editTree } from '../candidate/tree.mjs';
/** @param {readonly import('../contracts/ports.js').Edit[]} edits */
const editPaths=edits=>edits.flatMap(edit=>edit.kind==='move'?[edit.from,edit.to]:[edit.path]);
import { ResultPreparer } from '../integration/prepare.mjs';
import { ExactIntegrator } from '../integration/effects.mjs';
import { validateWorkItem } from '../mcp/input-schemas.mjs';
/** @typedef {import('../contracts/ports.js').Json} Json */
/** @typedef {import('../contracts/ports.js').Principal} Principal */
/** @typedef {import('../contracts/ports.js').Work} Work */
/** @typedef {import('../contracts/ports.js').Action} Action */
/** @typedef {import('../contracts/ports.js').Attempt} Attempt */
/** @typedef {import('../contracts/ports.js').PreparedResult} Result */
/** @typedef {import('../contracts/ports.js').ValidationReceipt} Receipt */
/** @typedef {import('../contracts/ports.js').Capability} Capability */
/** @typedef {{op:string,requestId:string,workId?:string,snapshotId?:string,expectedHead?:string,objective?:string,initialEdits?:import('../contracts/ports.js').Edit[],edits?:import('../contracts/ports.js').Edit[],expectedRevision?:string,expectedGeneration?:string,generation?:string,profileId?:string,parameters?:Json,policyDigest?:string,preparedResultId?:string,actionId?:string,reason?:string,repository?:string,expectedPolicyDigest?:string,integratedCommit?:string,policyPath?:string,newPolicyDigest?:string,expectedActiveRelease?:string,stagedReleaseId?:string}} Input */
/** @typedef {{binding:import('../contracts/ports.js').Binding,ledger:import('../storage/ledger.mjs').Ledger,repository:import('../repository/git.mjs').GitRepository,context:import('../repository/context.mjs').ContextService,authorization:import('../contracts/ports.js').AuthorizationPort,remote:ConstructorParameters<typeof ExactIntegrator>[0]['remote'],policy:()=>import('../validation/policy.mjs').AdoptedPolicy,validation:()=>import('../contracts/ports.js').ValidationPort,verifyLineage:(head:string)=>Promise<boolean>,actor:string,capacity?:number,now?:()=>number,runProfile?:(work:Work,attempt:Attempt,profile:import('../contracts/ports.js').Profile,cancelled:()=>boolean)=>Promise<{exitCode:number|null,signal:string|null,inputDigest:string,outputDigest:string}>,cancelAttempt?:(attempt:Attempt)=>Promise<boolean>,attemptStopped?:(attempt:Attempt)=>Promise<boolean>,recoverAttempt?:(attempt:Attempt)=>Promise<{stopped:boolean,senderStopped:boolean}>,special?:(principal:Principal,input:Input,actionId:string)=>Promise<Json>}} Options */
/** @param {unknown} value @returns {Input} */
export function workInput(value){return /** @type {Input} */(/** @type {unknown} */(validateWorkItem(value)));}
/** @param {Input} item @returns {Capability} */
export function capability(item){
 if(item.op==='policy.adopt')return 'policy.write';
 if(item.op.startsWith('release.'))return 'runtime.activate';
 if(item.op==='integrate')return 'integration.write';
 if(item.op==='run'||item.op==='validate')return 'profile.run';
 return 'work.write';
}
/** Deterministic application composition. SQLite owns work, actions and attempts;
 * this class owns no second queue or session-derived durable identity.
 */
export class DevelopmentEngine {
 /** @param {Options} options */
 constructor(options){this.o=options;this.ledger=options.ledger;this.binding=options.binding;this.now=options.now??Date.now;this.coordinator=new WorkCoordinator(options.ledger,{executionCapacity:options.capacity,now:this.now});
 this.preparer=new ResultPreparer({ledger:options.ledger,repository:options.repository,binding:options.binding,verifyLineage:options.verifyLineage,actor:options.actor,now:this.now});
 /** @type {Map<string,Promise<void>>} */this.running=new Map();this.pumping=false;this.accepting=true;}
 /** Resolve an immutable candidate reference only at an operation boundary. @param {Work} work */
 async candidate(work){const source=await this.o.repository.readTree(work.candidate.treeOid);requireThat(source.manifestDigest===work.candidate.manifestDigest,'INTEGRITY_FAILURE','Candidate manifest changed');return source;}
 /** @param {string} key @returns {Json|null} */
 metadata(key){return this.ledger.transact(tx=>{const row=tx.get('SELECT value FROM meta WHERE key=?',key);return row?/** @type {Json} */(parseRecord(String(row.value))):null;});}
 /** @param {string} key @param {unknown} value */
 store(key,value){this.ledger.transact(tx=>tx.run('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,canonicalJson(value)));}
 /** @param {Principal} principal @param {Input} item */
 async authorize(principal,item){
 requireThat(!item.repository||item.repository===this.binding.repositoryId,'FORBIDDEN');
 const paths=item.edits?editPaths(item.edits):item.initialEdits?editPaths(item.initialEdits):item.policyPath?[item.policyPath]:[];
 await this.o.authorization.authorize(principal,this.binding,capability(item),paths);
 if(item.workId){const work=this.ledger.transact(tx=>tx.getWork(/** @type {string} */(item.workId)));requireThat(work&&work.principal===principal.subject,'FORBIDDEN');}
 }
 /** Durable request observation is performed only after current auth, before any
 * stale context lookup or immutable object staging. Same request returns its receipt.
 * @param {Principal} principal @param {unknown} value */
 async admit(principal,value){
 const item=workInput(value);await this.authorize(principal,item);
 const prior=this.ledger.transact(tx=>tx.lookupRequest(principal.subject,this.binding.bindingEpoch,item.requestId));
 const authorize=()=>this.authorize(principal,item);
 const duplicate=()=>this.coordinator.admit({principal:principal.subject,requestId:item.requestId,operation:item.op,intent:item,authorize,deadline:prior?.deadline??this.now()+300000,mutate:()=>{throw new Dev2Error('INTEGRITY_FAILURE','Dedup row disappeared');}});
 if(prior)return this.admission(await duplicate());
 requireThat(this.accepting,'EXECUTION_UNAVAILABLE','Runtime is draining');
 let recovery=/** @type {Awaited<ReturnType<DevelopmentEngine['planRecovery']>>|undefined} */(undefined);
 if(item.op==='resume')recovery=await this.planRecovery(principal,item);
 let staged=/** @type {import('../contracts/ports.js').SourceTree|undefined} */(undefined);
 let snapshot=/** @type {import('../contracts/ports.js').Snapshot|undefined} */(undefined);
 if(item.op==='create'){
  snapshot=await this.o.context.snapshot(principal,this.binding,/** @type {string} */(item.snapshotId),'current');requireThat(snapshot.commitOid===item.expectedHead,'STALE_CONTEXT');
  staged=item.initialEdits?await editTree(this.o.repository,snapshot.source,item.initialEdits):snapshot.source;
 }else if(item.op==='edit'){
  const work=this.ledger.transact(tx=>this.coordinator.fence(tx,/** @type {string} */(item.workId),principal.subject,/** @type {string} */(item.expectedRevision),/** @type {string} */(item.expectedGeneration)));
  staged=await editTree(this.o.repository,await this.candidate(work),/** @type {import('../contracts/ports.js').Edit[]} */(item.edits));
 }else if(['run','validate','integrate'].includes(item.op)){
  requireThat(item.policyDigest===this.binding.policyDigest,'STALE_RESULT');
  if(item.op==='run'){requireThat(this.o.runProfile,'EXECUTION_UNAVAILABLE');this.o.policy().profile(/** @type {string} */(item.profileId),item.parameters??null);}
  else{const observed=await this.o.remote.resolve();requireThat(observed.head===item.expectedHead,'STALE_BASE','Canonical head differs',{currentHead:observed.head});await this.o.remote.fetch(observed.head);}
 }else if(item.op.startsWith('release.')||item.op==='policy.adopt')requireThat(this.o.special,'EXECUTION_UNAVAILABLE','No release/policy installation handler');
 if(item.op==='create'){const current=await this.o.remote.resolve();requireThat(current.head===item.expectedHead,'STALE_CONTEXT','Canonical head moved during staging',{currentHead:current.head});}
 // A Git ref can move after this observation; the candidate remains pinned and
 // integration must recompose against current head with full required validation.
 const inline=['create','edit','cancel','resume'].includes(item.op);
 const result=await this.coordinator.admit({principal:principal.subject,requestId:item.requestId,operation:item.op,intent:item,authorize,deadline:this.now()+300000,inline,
  mutate:(tx,actionId)=>{
   tx.run('INSERT INTO meta(key,value) VALUES(?,?)','principal:'+actionId,canonicalJson(principal));
   if(item.op==='create'){
    requireThat(staged&&snapshot,'INTEGRITY_FAILURE');
    const work={workId:newId(),repositoryId:this.binding.repositoryId,bindingEpoch:this.binding.bindingEpoch,principal:principal.subject,baseCommitOid:snapshot.commitOid,baseTreeOid:snapshot.source.treeOid,candidate:staged,generation:'0',revision:'0',disposition:/** @type {const} */('open'),currentActionId:null};
    tx.insertWork(work);tx.run('INSERT INTO meta(key,value) VALUES(?,?)','objective:'+work.workId,canonicalJson(item.objective));return work;
   }
   if(item.op==='edit'){
    const work=this.coordinator.fence(tx,/** @type {string} */(item.workId),principal.subject,/** @type {string} */(item.expectedRevision),/** @type {string} */(item.expectedGeneration));requireThat(staged,'INTEGRITY_FAILURE');
    const next={...work,candidate:staged,generation:nextRevision(work.generation),revision:nextRevision(work.revision)};requireThat(tx.compareWork(work.revision,next),'STALE_REVISION');return next;
   }
   if(item.op==='cancel'||item.op==='resume'){
    const work=tx.getWork(/** @type {string} */(item.workId));requireThat(work&&work.principal===principal.subject,'FORBIDDEN');requireThat(work.revision===item.expectedRevision,'STALE_REVISION');
    if(item.op==='resume'){
     requireThat(recovery&&recovery.work.revision===work.revision,'STALE_REVISION');
     const original=tx.getAction(recovery.action.actionId);requireThat(original&&canonicalJson(original)===canonicalJson(recovery.action),'STALE_REVISION');
     if(!recovery.attempt)return work;
     tx.adoptAttempt(recovery.attempt.attemptId);tx.releaseAttempt(recovery.attempt.attemptId);
     const status=recovery.status;
     if(original.status==='running'&&status==='queued')tx.updateAction({...original,status:'blocked',step:'recovery.stopped'});
     tx.updateAction({...original,status,ownerEpoch:this.ledger.ownerEpoch,step:status==='queued'?'recovery.queued':'recovery.complete',errorCode:recovery.errorCode,resultId:recovery.resultId});
     tx.run('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value','principal:'+original.actionId,canonicalJson(principal));
     if(recovery.outcome)tx.run('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value','effect-observation:'+original.actionId,canonicalJson(recovery.outcome));
     const next={...work,revision:nextRevision(work.revision),currentActionId:status==='queued'?original.actionId:null,disposition:recovery.integrated?/** @type {const} */('integrated'):work.disposition};
     requireThat(tx.compareWork(work.revision,next),'STALE_REVISION');return next;
    }
    if(work.disposition!=='open')return work;
    if(item.actionId)requireThat(work.currentActionId===item.actionId,'STALE_REVISION');
    if(work.currentActionId){const active=tx.getAction(work.currentActionId);requireThat(active,'INTEGRITY_FAILURE');tx.run('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value','cancel:'+active.actionId,'true');
     if(active.status==='queued'){tx.updateAction({...active,status:'cancelled',step:'cancel.before.dispatch'});const next={...work,currentActionId:null,revision:nextRevision(work.revision)};requireThat(tx.compareWork(work.revision,next),'STALE_REVISION');return next;}
     return work;
    }
    const next={...work,disposition:/** @type {const} */('cancelled'),revision:nextRevision(work.revision)};requireThat(tx.compareWork(work.revision,next),'STALE_REVISION');return next;
   }
   if(item.workId){const work=this.coordinator.fence(tx,item.workId,principal.subject,/** @type {string} */(item.expectedRevision),/** @type {string} */(item.generation));
    const next={...work,currentActionId:actionId,revision:nextRevision(work.revision)};requireThat(tx.compareWork(work.revision,next),'STALE_REVISION');return next;}
   return null;
  }});
 return this.admission(result);
 }
 /** Pure observation before a short fenced resume admission. No rerun or provider
  * mutation occurs during this plan. @param {Principal} principal @param {Input} item */
 async planRecovery(principal,item){
  const work=await this.work(principal,/** @type {string} */(item.workId));requireThat(work.revision===item.expectedRevision,'STALE_REVISION');
  const action=this.ledger.transact(tx=>tx.getAction(/** @type {string} */(item.actionId)));
  requireThat(action&&action.principal===principal.subject&&action.workId===work.workId,'FORBIDDEN');
  const original=workInput(this.ledger.transact(tx=>tx.intent(action.actionId)));await this.authorize(principal,original);
  /** @type {'queued'|'succeeded'|'failed'|'cancelled'} */let status='queued';
  /** @type {string|null} */let errorCode=null;let resultId=action.resultId,integrated=false;
  /** @type {import('../contracts/ports.js').EffectObservation|null} */let outcome=null;
  if(['succeeded','failed','cancelled'].includes(action.status))return {work,action,attempt:null,status,errorCode,resultId,integrated,outcome};
  requireThat(work.currentActionId===action.actionId&&!this.running.has(action.actionId),'EFFECT_UNCERTAIN','Action still has an execution owner');
  const attempt=this.ledger.transact(tx=>{const row=tx.get('SELECT record FROM attempt WHERE action_id=? ORDER BY rowid DESC LIMIT 1',action.actionId);return row?/** @type {Attempt} */(parseRecord(String(row.record))):null;});
  requireThat(attempt&&this.o.recoverAttempt,'EFFECT_UNCERTAIN','No authoritative attempt observer');
  const proof=await this.o.recoverAttempt(attempt);requireThat(proof.stopped&&proof.senderStopped,'EFFECT_UNCERTAIN','Execution or sender remains uncertain');
  const effect=this.ledger.transact(tx=>tx.getEffect(action.actionId));
  if(effect){
   const integrator=new ExactIntegrator({binding:this.binding,ledger:this.ledger,repository:this.o.repository,remote:this.o.remote,validation:this.o.validation(),verifyLineage:this.o.verifyLineage,authorize:()=>this.authorize(principal,original)});
   outcome=await integrator.reconcile(effect,true);resultId=effect.preparedResultId;
   requireThat(['integrated','stale','retryable'].includes(outcome.kind),'EFFECT_UNCERTAIN','Ref effect is not resolved');
   if(outcome.kind==='integrated'){status='succeeded';integrated=true;}
   else if(outcome.kind==='stale'){status='failed';errorCode='CONTENDED_REF';}
  }
  if(status==='queued'){
   if(this.cancelled(action.actionId)||this.now()>=action.deadline)status='cancelled';
   else if(original.op==='run')requireThat(this.o.policy().profile(/** @type {string} */(original.profileId),original.parameters??null).replaySafe,'EFFECT_UNCERTAIN','Profile is not replay-safe');
   else {requireThat(['validate','integrate'].includes(original.op),'EFFECT_UNCERTAIN','Use the dedicated effect owner');requireThat(this.o.policy().required().every(p=>p.replaySafe),'EFFECT_UNCERTAIN','Validation profile is not replay-safe');}
  }
  return {work,action,attempt,status,errorCode,resultId,integrated,outcome};
 }
 /** Bounded startup observation/adoption; same transition as explicit resume.
  * Expired stored tokens leave their own work blocked until fresh authorized resume.
  * @param {number} [limit] */
 async recoverPending(limit=64){
  requireThat(Number.isSafeInteger(limit)&&limit>0&&limit<=128,'INVALID_ARGUMENT');
  const actions=this.ledger.transact(tx=>tx.all("SELECT record FROM action WHERE status IN ('running','blocked') ORDER BY seq LIMIT ?",limit).map(row=>/** @type {Action} */(parseRecord(String(row.record)))));
  const results=[];
  for(const action of actions){if(!action.workId||this.running.has(action.actionId))continue;
   const principal=/** @type {Principal} */(/** @type {unknown} */(this.metadata('principal:'+action.actionId))),work=this.ledger.transact(tx=>tx.getWork(/** @type {string} */(action.workId)));
   try{requireThat(work,'INTEGRITY_FAILURE');results.push({actionId:action.actionId,admission:await this.admit(principal,{op:'resume',requestId:recordDigest('dev2.recovery-request.v1',{actionId:action.actionId,ownerEpoch:this.ledger.ownerEpoch}).slice(7),workId:work.workId,actionId:action.actionId,expectedRevision:work.revision}),error:null});}
   catch(error){results.push({actionId:action.actionId,admission:null,error:error instanceof Dev2Error?error.code:'INTEGRITY_FAILURE'});}
  }
  return results;
 }
 /** @param {{action:Action,work:Work|null,deduplicated:boolean}} result */
 admission(result){return {accepted:true,actionId:result.action.actionId,workId:result.action.workId,status:result.action.status,revision:result.work?.revision??null,generation:result.work?.generation??null,deduplicated:result.deduplicated};}
 /** @param {string} actionId */
 cancelled(actionId){return this.metadata('cancel:'+actionId)===true;}
 /** @param {Principal} principal @param {string} workId */
 async work(principal,workId){await this.o.authorization.authorize(principal,this.binding,'repository.read');const work=this.ledger.transact(tx=>tx.getWork(workId));requireThat(work&&work.principal===principal.subject,'FORBIDDEN');return work;}
 /** Pump ready durable rows; isolated promises never become durable truth. */
 pump(){if(this.pumping||!this.accepting)return;this.pumping=true;
 try{while(this.running.size<this.coordinator.executionCapacity){const selected=this.coordinator.takeReady();if(!selected)break;
   this.store('lastAttempt:'+selected.action.actionId,selected.attempt);
   const promise=this.execute(selected.action,selected.attempt).finally(()=>{this.running.delete(selected.action.actionId);queueMicrotask(()=>this.pump());});this.running.set(selected.action.actionId,promise);}
 }finally{this.pumping=false;}}
 /** @param {Action} action @param {Attempt} attempt */
 async execute(action,attempt){
 const principal=/** @type {Principal} */(/** @type {unknown} */(this.metadata('principal:'+action.actionId)));
 const item=workInput(this.ledger.transact(tx=>tx.intent(action.actionId)));
 let stopped=true,effectResolved=true,resultId=/** @type {string|undefined} */(undefined);
 try{
  await this.authorize(principal,item);if(this.cancelled(action.actionId)){this.coordinator.settle(attempt,this.ledger.ownerEpoch,'cancelled',{stopped:true,effectResolved:true});return;}
  const validation=this.o.validation(),policy=this.o.policy();
  if(!action.workId){requireThat(this.o.special,'EXECUTION_UNAVAILABLE');const result=await this.o.special(principal,item,action.actionId);this.store('action-result:'+action.actionId,result);this.coordinator.settle(attempt,this.ledger.ownerEpoch,'succeeded',{stopped:true,effectResolved:true});return;}
  const work=this.ledger.transact(tx=>tx.getWork(/** @type {string} */(action.workId)));requireThat(work&&work.currentActionId===action.actionId,'STALE_REVISION');
  if(item.op==='run'){
   requireThat(this.o.runProfile,'EXECUTION_UNAVAILABLE');stopped=false;
   const result=await this.o.runProfile(work,attempt,policy.profile(/** @type {string} */(item.profileId),item.parameters??null),()=>this.cancelled(action.actionId));stopped=true;
   this.store('action-result:'+action.actionId,result);const valid=result.exitCode===0&&result.signal===null&&result.inputDigest===work.candidate.manifestDigest&&result.outputDigest===work.candidate.manifestDigest;
   this.coordinator.settle(attempt,this.ledger.ownerEpoch,this.cancelled(action.actionId)?'cancelled':valid?'succeeded':'failed',{stopped:true,effectResolved:true,...(!valid?{errorCode:'VALIDATION_FAILED'}:{})});return;
  }
  const observed=await this.o.remote.resolve();requireThat(observed.head===item.expectedHead,'STALE_BASE','Canonical head moved',{currentHead:observed.head});await this.o.remote.fetch(observed.head);
  const result=item.preparedResultId?await this.preparer.reuse(item.preparedResultId,work,observed.head,policy.policy.execution,this.binding.policyDigest):await this.preparer.prepare(work,observed.head,policy.policy.execution,this.binding.policyDigest);resultId=result.resultId;
  let receipt=this.ledger.transact(tx=>{const row=tx.get('SELECT record FROM validation WHERE result_id=? ORDER BY rowid DESC LIMIT 1',result.resultId);return row?/** @type {Receipt} */(parseRecord(String(row.record))):null;});
  if(!receipt||!await validation.eligible(result,receipt,this.binding.policyDigest,this.ledger.ownerEpoch)){
   stopped=false;receipt=await validation.validate(result,attempt);stopped=true;this.ledger.transact(tx=>tx.putReceipt(/** @type {Receipt} */(receipt)));
  }
  requireThat(await validation.eligible(result,receipt,this.binding.policyDigest,this.ledger.ownerEpoch),'VALIDATION_FAILED');
  if(this.cancelled(action.actionId)){this.coordinator.settle(attempt,this.ledger.ownerEpoch,'cancelled',{stopped:true,effectResolved:true,resultId});return;}
  if(item.op==='validate'){this.coordinator.settle(attempt,this.ledger.ownerEpoch,'succeeded',{stopped:true,effectResolved:true,resultId});return;}
  requireThat(item.op==='integrate','INVALID_ARGUMENT');
  const integrator=new ExactIntegrator({binding:this.binding,ledger:this.ledger,repository:this.o.repository,remote:this.o.remote,validation,verifyLineage:this.o.verifyLineage,authorize:()=>this.authorize(principal,item)});
  const effect=await integrator.intent(action.actionId,result,receipt);effectResolved=false;
  const outcome=await integrator.publish(effect,result,receipt,true);this.store('effect-observation:'+action.actionId,outcome);
  if(outcome.kind==='integrated'){effectResolved=true;this.coordinator.settle(attempt,this.ledger.ownerEpoch,'succeeded',{stopped:true,effectResolved:true,resultId,disposition:'integrated'});}
  else if(outcome.kind==='stale'){effectResolved=true;this.coordinator.settle(attempt,this.ledger.ownerEpoch,'failed',{stopped:true,effectResolved:true,resultId,errorCode:'CONTENDED_REF'});}
  else this.coordinator.settle(attempt,this.ledger.ownerEpoch,'blocked',{stopped:true,effectResolved:false,resultId,errorCode:'EFFECT_UNCERTAIN'});
 }catch(error){
  if(!stopped&&this.o.attemptStopped)try{stopped=await this.o.attemptStopped(attempt);}catch{stopped=false;}
  const code=error instanceof Dev2Error?error.code:'INTEGRITY_FAILURE';
  this.coordinator.settle(attempt,this.ledger.ownerEpoch,stopped&&effectResolved?'failed':'blocked',{stopped,effectResolved,resultId,errorCode:code});
 }
 }
 /** Close admission before release drain. No forced cancellation or lost truth. */
 drain(){this.accepting=false;return {running:this.running.size,reservations:this.ledger.transact(tx=>tx.reservations().length)};}
}
