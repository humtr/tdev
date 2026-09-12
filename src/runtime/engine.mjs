import {newId,nextRevision} from '../contracts/identity.mjs';
import {canonicalJson,parseRecord} from '../contracts/canonical.mjs';
import {requireThat,Dev2Error} from '../contracts/errors.mjs';
import {WorkCoordinator} from '../work/coordinator.mjs';
import {editTree} from '../candidate/tree.mjs';
import {ResultPreparer} from '../integration/prepare.mjs';
import {ExactIntegrator} from '../integration/effects.mjs';
import {validateWorkItem} from '../mcp/input-schemas.mjs';
import {ActionRecovery} from './recovery.mjs';
import {SpecialRecovery} from './special-recovery.mjs';
/** @typedef {import('../contracts/ports.js').Json} Json */
/** @typedef {import('../contracts/ports.js').Principal} Principal */
/** @typedef {import('../contracts/ports.js').Work} Work */
/** @typedef {import('../contracts/ports.js').Action} Action */
/** @typedef {import('../contracts/ports.js').Attempt} Attempt */
/** @typedef {import('../contracts/ports.js').Effect} Effect */
/** @typedef {import('../contracts/ports.js').EffectObservation} Observation */
/** @typedef {import('../contracts/ports.js').PreparedResult} Result */
/** @typedef {import('../contracts/ports.js').ValidationReceipt} Receipt */
/** @typedef {import('../contracts/ports.js').Capability} Capability */
/** @typedef {{op:string,requestId:string,workId?:string,snapshotId?:string,expectedHead?:string,objective?:string,initialEdits?:import('../contracts/ports.js').Edit[],edits?:import('../contracts/ports.js').Edit[],expectedRevision?:string,expectedGeneration?:string,generation?:string,profileId?:string,parameters?:Json,policyDigest?:string,preparedResultId?:string,actionId?:string,reason?:string,repository?:string,expectedPolicyDigest?:string,integratedCommit?:string,policyPath?:string,newPolicyDigest?:string,expectedActiveRelease?:string,stagedReleaseId?:string}} Input */
/** @typedef {{binding:import('../contracts/ports.js').Binding,ledger:import('../storage/ledger.mjs').Ledger,repository:import('../repository/git.mjs').GitRepository,context:import('../repository/context.mjs').ContextService,authorization:import('../contracts/ports.js').AuthorizationPort,remote:ConstructorParameters<typeof ExactIntegrator>[0]['remote'],policy:()=>import('../validation/policy.mjs').AdoptedPolicy,validation:()=>import('../contracts/ports.js').ValidationPort,verifyLineage:(head:string)=>Promise<boolean>,actor:string,capacity?:number,now?:()=>number,executionAvailable?:()=>boolean,operationAvailable?:(op:string)=>boolean,integrationLineage?:(head:string)=>Promise<boolean>,runProfile?:(work:Work,attempt:Attempt,profile:import('../contracts/ports.js').Profile,cancelled:()=>boolean)=>Promise<{exitCode:number|null,signal:string|null,inputDigest:string,outputDigest:string}>,cancelAttempt?:(attempt:Attempt)=>Promise<boolean>,attemptStopped?:(attempt:Attempt)=>Promise<boolean>,senderStopped?:(effect:Effect)=>Promise<boolean>,cancelSender?:(effect:Effect)=>Promise<boolean>,special?:(principal:Principal,input:Input,actionId:string)=>Promise<Json>,specialRecovery?:(action:Action)=>Promise<import('./special-recovery.mjs').SpecialObservation>}} Options */
/** @param {readonly import('../contracts/ports.js').Edit[]} edits */
const editPaths=edits=>edits.flatMap(edit=>edit.kind==='move'?[edit.from,edit.to]:[edit.path]);
/** @param {unknown} value @returns {Input} */
export function workInput(value){return /** @type {Input} */(/** @type {unknown} */(validateWorkItem(value)));}
/** @param {Input} item @returns {Capability} */
export function capability(item){if(item.op==='policy.adopt')return 'policy.write';if(item.op.startsWith('release.'))return 'runtime.activate';if(item.op==='integrate')return 'integration.write';if(item.op==='run'||item.op==='validate')return 'profile.run';return 'work.write';}
/** SQLite remains the single work/action owner. In-memory promises and recovery
 * plans only represent concurrent activity; neither grants durable effect rights.
 */
export class DevelopmentEngine {
 /** @param {Options} options */
 constructor(options){
  this.o=options;this.ledger=options.ledger;this.binding=options.binding;this.now=options.now??Date.now;
  this.coordinator=new WorkCoordinator(options.ledger,{executionCapacity:options.capacity,now:this.now});
  this.preparer=new ResultPreparer({ledger:options.ledger,repository:options.repository,binding:options.binding,verifyLineage:options.verifyLineage,actor:options.actor,now:this.now});
  /** @type {Map<string,Promise<void>>} */this.running=new Map();this.pumping=false;this.accepting=true;
  this.recovery=new ActionRecovery(this);this.specialRecovery=new SpecialRecovery(this);this.recovery.adopt();
 }
 operationDescriptors(){return ['create','edit','run','validate','integrate','cancel','resume','policy.adopt','release.stage','release.activate'].map(op=>{
  const executable=this.o.executionAvailable?.()!==false;
  const implemented=op==='run'?!!this.o.runProfile:op==='validate'||op==='integrate'?executable:op.startsWith('release.')||op==='policy.adopt'?!!this.o.special:true;
  const available=implemented&&this.o.operationAvailable?.(op)!==false;
  const partial=!available&&(op==='validate'||op==='integrate');
  return {op,available,state:available?'implemented':partial?'partial':'unavailable',reason:available?null:partial?'Exact result preparation and observation are available; hosted execution and publication eligibility are not sealed':'Installation capability is not implemented'};
 });}
 /** @param {Work} work */
 async candidate(work){const source=await this.o.repository.readTree(work.candidate.treeOid);requireThat(source.manifestDigest===work.candidate.manifestDigest,'INTEGRITY_FAILURE','Candidate manifest mismatch');return source;}
 /** @param {string} key @returns {Json|null} */
 metadata(key){return this.ledger.transact(tx=>{const row=tx.get('SELECT value FROM meta WHERE key=?',key);return row?/** @type {Json} */(parseRecord(String(row.value))):null;});}
 /** @param {string} key @param {unknown} value */
 store(key,value){this.ledger.transact(tx=>tx.run('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,canonicalJson(value)));}
 /** @param {string} actionId */
 input(actionId){return workInput(this.ledger.transact(tx=>tx.intent(actionId)));}
 /** @param {Principal} principal @param {Input} item */
 async authorize(principal,item){
  requireThat(!item.repository||(item.repository==='self'||item.repository===this.binding.repositoryId),'FORBIDDEN');
  const paths=item.edits?editPaths(item.edits):item.initialEdits?editPaths(item.initialEdits):item.policyPath?[item.policyPath]:[];
  await this.o.authorization.authorize(principal,this.binding,capability(item),paths);
  if(item.workId){
   const work=this.ledger.transact(tx=>tx.getWork(/** @type {string} */(item.workId)));requireThat(work&&work.principal===principal.subject,'FORBIDDEN');
   if(['run','validate','integrate'].includes(item.op)){
    const base=await this.o.repository.readCommit(this.binding,work.baseCommitOid),candidate=await this.candidate(work);
    requireThat(base.source.treeOid===work.baseTreeOid,'INTEGRITY_FAILURE');
    const before=new Map(base.source.entries.map(entry=>[entry.path,entry])),after=new Map(candidate.entries.map(entry=>[entry.path,entry]));
    const changed=[...new Set([...before.keys(),...after.keys()])].filter(path=>{const a=before.get(path),b=after.get(path);return a?.mode!==b?.mode||a?.contentDigest!==b?.contentDigest||a?.blobOid!==b?.blobOid;});
    // A retained candidate is not a retained grant.
    await this.o.authorization.authorize(principal,this.binding,capability(item),changed);
   }
  }
 }
 /** Budgets are installation policy, not a caller-controlled timeout. The action
  * must cover all required profiles rather than expire midway through profile 2.
  * @param {Input} item */
 deadline(item){let duration=300000;
  if(item.op==='run')duration=this.o.policy().profile(String(item.profileId),item.parameters??null).timeoutMs+30000;
  else if(['validate','integrate'].includes(item.op))duration=this.o.policy().required().reduce((sum,profile)=>sum+profile.timeoutMs,60000);
  // Finite build alone has a five-minute ceiling. Keep bounded room for its
  // managed launch/transfer and retained staging effect; this is not caller input.
  else if(item.op==='release.stage')duration=900000;
  requireThat(Number.isSafeInteger(duration)&&duration>0&&duration<=900000,'EXECUTION_UNAVAILABLE','Action budget exceeds managed session bound');return this.now()+duration;
 }
 /** Current authorization and dedup precede stale snapshot lookup or staging.
  * @param {Principal} principal @param {unknown} value */
 async admit(principal,value){
  const item=workInput(value);await this.authorize(principal,item);
  const prior=this.ledger.transact(tx=>tx.lookupRequest(principal.subject,this.binding.bindingEpoch,item.requestId));
  const authorize=()=>this.authorize(principal,item);
  if(prior){
   const exact={principal:principal.subject,requestId:item.requestId,operation:item.op,intent:item,authorize,deadline:prior.deadline,mutate:()=>{throw new Dev2Error('INTEGRITY_FAILURE','Dedup row disappeared');}};
   // Verify the original payload before any recovery observation or state change.
   const receipt=await this.coordinator.admit(exact);
   if(!prior.workId&&prior.status==='blocked'){await this.specialRecovery.observe(principal,prior.actionId,true);return this.admission(await this.coordinator.admit(exact));}
   return this.admission(receipt);
  }
  requireThat(this.accepting,'EXECUTION_UNAVAILABLE','Runtime is draining');
  let staged=/** @type {import('../contracts/ports.js').SourceTree|undefined} */(undefined),snapshot=/** @type {import('../contracts/ports.js').Snapshot|undefined} */(undefined);
  let recoveryPlan=/** @type {Awaited<ReturnType<ActionRecovery['plan']>>|null} */(null);
  if(item.op==='create'){
   snapshot=await this.o.context.snapshot(principal,this.binding,String(item.snapshotId),'current');requireThat(snapshot.commitOid===item.expectedHead,'STALE_CONTEXT');
   staged=item.initialEdits?await editTree(this.o.repository,snapshot.source,item.initialEdits):snapshot.source;
  }else if(item.op==='edit'){
   const work=this.ledger.transact(tx=>this.coordinator.fence(tx,String(item.workId),principal.subject,String(item.expectedRevision),String(item.expectedGeneration)));
   staged=await editTree(this.o.repository,await this.candidate(work),/** @type {import('../contracts/ports.js').Edit[]} */(item.edits));
  }else if(['run','validate','integrate'].includes(item.op)){
   requireThat(item.policyDigest===this.binding.policyDigest,'STALE_RESULT');
   if(item.op==='run'){requireThat(this.o.runProfile,'EXECUTION_UNAVAILABLE');this.o.policy().profile(String(item.profileId),item.parameters??null);}
   else{const observed=await this.o.remote.resolve();requireThat(observed.head===item.expectedHead,'STALE_BASE','Canonical head differs',{currentHead:observed.head});await this.o.remote.fetch(observed.head);}
  }else if(item.op==='resume'){
   const target=this.ledger.transact(tx=>tx.getAction(String(item.actionId)));requireThat(target&&target.workId===item.workId&&target.principal===principal.subject,'FORBIDDEN');
   recoveryPlan=await this.recovery.plan(principal,String(item.actionId),String(item.expectedRevision));
  }else if(item.op.startsWith('release.')||item.op==='policy.adopt')requireThat(this.o.special,'EXECUTION_UNAVAILABLE','No release/policy installation handler');
  if(item.op==='create'){const current=await this.o.remote.resolve();requireThat(current.head===item.expectedHead,'STALE_CONTEXT','Canonical head moved during staging',{currentHead:current.head});}
  const inline=['create','edit','cancel','resume'].includes(item.op);
  const result=await this.coordinator.admit({principal:principal.subject,requestId:item.requestId,operation:item.op,intent:item,authorize,deadline:this.deadline(item),inline,mutate:(tx,actionId)=>{
   tx.run('INSERT INTO meta(key,value) VALUES(?,?)','principal:'+actionId,canonicalJson(principal));
   if(item.op==='create'){
    requireThat(staged&&snapshot,'INTEGRITY_FAILURE');const work={workId:newId(),repositoryId:this.binding.repositoryId,bindingEpoch:this.binding.bindingEpoch,principal:principal.subject,baseCommitOid:snapshot.commitOid,baseTreeOid:snapshot.source.treeOid,candidate:staged,generation:'0',revision:'0',disposition:/** @type {const} */('open'),currentActionId:null};
    tx.insertWork(work);tx.run('INSERT INTO meta(key,value) VALUES(?,?)','objective:'+work.workId,canonicalJson(item.objective));return work;
   }
   if(item.op==='edit'){
    const work=this.coordinator.fence(tx,String(item.workId),principal.subject,String(item.expectedRevision),String(item.expectedGeneration));requireThat(staged,'INTEGRITY_FAILURE');
    const next={...work,candidate:staged,generation:nextRevision(work.generation),revision:nextRevision(work.revision)};requireThat(tx.compareWork(work.revision,next),'STALE_REVISION');return next;
   }
   if(item.op==='resume'){requireThat(recoveryPlan,'INTEGRITY_FAILURE');return this.recovery.apply(tx,recoveryPlan,principal);}
   if(item.op==='cancel'){
    const work=tx.getWork(String(item.workId));requireThat(work&&work.principal===principal.subject,'FORBIDDEN');requireThat(work.revision===item.expectedRevision,'STALE_REVISION');
    if(work.disposition!=='open')return work;
    if(item.actionId)requireThat(work.currentActionId===item.actionId,'STALE_REVISION');
    if(work.currentActionId){const active=tx.getAction(work.currentActionId);requireThat(active,'INTEGRITY_FAILURE');tx.run('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value','cancel:'+active.actionId,'true');
     if(active.status==='queued'){tx.updateAction({...active,status:'cancelled',step:'cancel.before.dispatch'});const next={...work,currentActionId:null,revision:nextRevision(work.revision)};requireThat(tx.compareWork(work.revision,next),'STALE_REVISION');return next;}return work;
    }
    const next={...work,disposition:/** @type {const} */('cancelled'),revision:nextRevision(work.revision)};requireThat(tx.compareWork(work.revision,next),'STALE_REVISION');return next;
   }
   if(item.workId){const work=this.coordinator.fence(tx,item.workId,principal.subject,String(item.expectedRevision),String(item.generation));const next={...work,currentActionId:actionId,revision:nextRevision(work.revision)};requireThat(tx.compareWork(work.revision,next),'STALE_REVISION');return next;}return null;
  }});
  if(item.op==='cancel'&&result.work?.currentActionId)void this.signalCancellation(result.work.currentActionId);
  return this.admission(result);
 }
 /** @param {{action:Action,work:Work|null,deduplicated:boolean}} result */
 admission(result){return {accepted:true,actionId:result.action.actionId,workId:result.action.workId,status:result.action.status,revision:result.work?.revision??null,generation:result.work?.generation??null,deduplicated:result.deduplicated};}
 /** @param {string} actionId */
 cancelled(actionId){return this.metadata('cancel:'+actionId)===true;}
 /** @param {Principal} principal @param {string} workId */
 async work(principal,workId){await this.o.authorization.authorize(principal,this.binding,'repository.read');const work=this.ledger.transact(tx=>tx.getWork(workId));requireThat(work&&work.principal===principal.subject,'FORBIDDEN');return work;}
 /** @param {Attempt} attempt */
 assertAttempt(attempt){return this.ledger.transact(tx=>{const r=tx.retainedAttempt(attempt.attemptId),a=tx.getAction(attempt.actionId);requireThat(r&&canonicalJson(r.attempt)===canonicalJson(attempt)&&r.observerEpoch===this.ledger.ownerEpoch&&a?.ownerEpoch===this.ledger.ownerEpoch&&a.attempt===attempt.attempt&&a.status==='running','STALE_REVISION','Stale execution callback');return a;});}
 /** @param {Effect} effect */
 async senderStopped(effect){try{return this.o.senderStopped?await this.o.senderStopped(effect):this.binding.provider==='fixture';}catch{return false;}}
 /** @param {Principal} principal @param {Input} item */
 integrator(principal,item){return new ExactIntegrator({binding:this.binding,ledger:this.ledger,repository:this.o.repository,remote:this.o.remote,validation:this.o.validation(),verifyLineage:this.o.integrationLineage??this.o.verifyLineage,authorize:()=>this.authorize(principal,item),senderStopped:effect=>this.senderStopped(effect),now:this.now});}
 /** Cancellation is retained first. Signalling cannot by itself release a slot or
  * turn an uncertain external effect into a terminal cancellation.
  * @param {string} actionId */
 async signalCancellation(actionId){try{
  const frame=this.ledger.transact(tx=>{const action=tx.getAction(actionId);if(!action||!['running','blocked'].includes(action.status))return null;const row=tx.get('SELECT record FROM attempt WHERE action_id=? AND json_extract(record,\'$.attempt\')=?',actionId,action.attempt);return {attempt:row?/** @type {Attempt} */(parseRecord(String(row.record))):null,effect:tx.getEffect(actionId)};});
  if(!frame)return;await Promise.allSettled([...(frame.attempt&&this.o.cancelAttempt?[this.o.cancelAttempt(frame.attempt)]:[]),...(frame.effect&&this.o.cancelSender?[this.o.cancelSender(frame.effect)]:[])]);
 }catch{/* The durable cancellation remains observable for reconciliation. */}}
 pump(){if(this.pumping||!this.accepting||this.ledger.closed)return;this.pumping=true;try{
  while(this.running.size<this.coordinator.executionCapacity){const selected=this.coordinator.takeReady();if(!selected)break;this.store('lastAttempt:'+selected.action.actionId,selected.attempt);
   const promise=this.execute(selected.action,selected.attempt).catch(error=>{if(!this.ledger.closed)try{this.store('callback-rejection:'+selected.action.actionId,{code:error instanceof Dev2Error?error.code:'INTEGRITY_FAILURE'});}catch{}}).finally(()=>{this.running.delete(selected.action.actionId);queueMicrotask(()=>this.pump());});
   this.running.set(selected.action.actionId,promise);
  }
 }finally{this.pumping=false;}}
 /** @param {Attempt} attempt @param {Effect} effect @param {Observation} outcome @param {boolean} senderStopped */
 settleEffect(attempt,effect,outcome,senderStopped){
  this.assertAttempt(attempt);this.store('effect-observation:'+attempt.actionId,outcome);
  if(!senderStopped||!['integrated','stale','retryable'].includes(outcome.kind)){this.coordinator.settle(attempt,this.ledger.ownerEpoch,'blocked',{stopped:senderStopped,effectResolved:false,resultId:effect.preparedResultId,errorCode:'EFFECT_UNCERTAIN'});return;}
  if(outcome.kind==='integrated')this.coordinator.settle(attempt,this.ledger.ownerEpoch,'succeeded',{stopped:true,effectResolved:true,resultId:effect.preparedResultId,disposition:'integrated',step:this.cancelled(attempt.actionId)?'complete.cancel_too_late':'complete'});
  else if(outcome.kind==='stale')this.coordinator.settle(attempt,this.ledger.ownerEpoch,'failed',{stopped:true,effectResolved:true,resultId:effect.preparedResultId,errorCode:'CONTENDED_REF'});
  else {
   const action=this.assertAttempt(attempt);
   if(this.cancelled(attempt.actionId)||action.deadline<=this.now())this.coordinator.settle(attempt,this.ledger.ownerEpoch,'cancelled',{stopped:true,effectResolved:true,resultId:effect.preparedResultId});
   else this.coordinator.settle(attempt,this.ledger.ownerEpoch,'blocked',{stopped:true,effectResolved:false,resultId:effect.preparedResultId,errorCode:'EFFECT_UNCERTAIN',step:'publication.retryable'});
  }
 }
 /** @param {Action} action @param {Attempt} attempt */
 async execute(action,attempt){
  const principal=/** @type {Principal} */(/** @type {unknown} */(this.metadata('principal:'+action.actionId))),item=this.input(action.actionId);
  let effect=this.ledger.transact(tx=>tx.getEffect(action.actionId));let stopped=true,effectResolved=!effect,resultId=/** @type {string|undefined} */(effect?.preparedResultId??action.resultId??undefined);
  const deadline=setTimeout(()=>{try{this.assertAttempt(attempt);this.store('cancel:'+action.actionId,true);void this.signalCancellation(action.actionId);}catch{}},Math.max(0,action.deadline-this.now()));deadline.unref();
  try{
   this.assertAttempt(attempt);await this.authorize(principal,item);
   if(!effect&&this.cancelled(action.actionId)){this.coordinator.settle(attempt,this.ledger.ownerEpoch,'cancelled',{stopped:true,effectResolved:true});return;}
   const validation=this.o.validation(),policy=this.o.policy();
   if(!action.workId){requireThat(this.o.special,'EXECUTION_UNAVAILABLE');stopped=false;const result=await this.o.special(principal,item,action.actionId);stopped=true;this.assertAttempt(attempt);this.store('action-result:'+action.actionId,result);this.coordinator.settle(attempt,this.ledger.ownerEpoch,'succeeded',{stopped:true,effectResolved:true});return;}
   const work=this.ledger.transact(tx=>tx.getWork(String(action.workId)));requireThat(work&&work.currentActionId===action.actionId,'STALE_REVISION');
   if(item.op==='run'){
    requireThat(this.o.runProfile,'EXECUTION_UNAVAILABLE');stopped=false;const result=await this.o.runProfile(work,attempt,policy.profile(String(item.profileId),item.parameters??null),()=>this.cancelled(action.actionId));stopped=true;
    this.assertAttempt(attempt);this.store('action-result:'+action.actionId,{kind:'execution',profileId:String(item.profileId),...result,artifacts:[]});const valid=result.exitCode===0&&result.signal===null&&result.inputDigest===work.candidate.manifestDigest&&result.outputDigest===work.candidate.manifestDigest;
    this.coordinator.settle(attempt,this.ledger.ownerEpoch,this.cancelled(action.actionId)?'cancelled':valid?'succeeded':'failed',{stopped:true,effectResolved:true,...(!valid?{errorCode:'VALIDATION_FAILED'}:{})});return;
   }
   const integrator=this.integrator(principal,item);let result;
   if(effect){
    const senderStopped=await this.senderStopped(effect),outcome=await integrator.reconcile(effect,senderStopped);
    if(outcome.kind!=='retryable'||this.cancelled(action.actionId)||action.deadline<=this.now()){this.settleEffect(attempt,effect,outcome,senderStopped);return;}
    requireThat(effect.policyDigest===this.binding.policyDigest,'STALE_RESULT');
    result=await this.preparer.reuse(effect.preparedResultId,work,effect.expectedHead,policy.policy.execution,this.binding.policyDigest);
   }else{
    const observed=await this.o.remote.resolve();requireThat(observed.head===item.expectedHead,'STALE_BASE','Canonical head moved',{currentHead:observed.head});await this.o.remote.fetch(observed.head);
    result=item.preparedResultId?await this.preparer.reuse(item.preparedResultId,work,observed.head,policy.policy.execution,this.binding.policyDigest):await this.preparer.prepare(work,observed.head,policy.policy.execution,this.binding.policyDigest);
   }
   resultId=result.resultId;this.assertAttempt(attempt);
   let receipt=this.ledger.transact(tx=>{const row=tx.get('SELECT record FROM validation WHERE result_id=? ORDER BY rowid DESC LIMIT 1',result.resultId);return row?/** @type {Receipt} */(parseRecord(String(row.record))):null;});
   if(!receipt||!await validation.eligible(result,receipt,this.binding.policyDigest,this.ledger.ownerEpoch)){
    requireThat(this.o.executionAvailable?.()!==false,'EXECUTION_UNAVAILABLE','Managed execution is not sealed; exact prepared result is retained');
    stopped=false;receipt=await validation.validate(result,attempt);stopped=true;this.assertAttempt(attempt);this.ledger.transact(tx=>tx.putReceipt(/** @type {Receipt} */(receipt)));
   }
   requireThat(await validation.eligible(result,receipt,this.binding.policyDigest,this.ledger.ownerEpoch),'VALIDATION_FAILED');this.assertAttempt(attempt);
   if(this.cancelled(action.actionId)||action.deadline<=this.now()){
    if(effect){const senderStopped=await this.senderStopped(effect);this.settleEffect(attempt,effect,await integrator.reconcile(effect,senderStopped),senderStopped);}
    else this.coordinator.settle(attempt,this.ledger.ownerEpoch,'cancelled',{stopped:true,effectResolved:true,resultId});return;
   }
   if(item.op==='validate'){this.coordinator.settle(attempt,this.ledger.ownerEpoch,'succeeded',{stopped:true,effectResolved:true,resultId});return;}
   requireThat(item.op==='integrate','INVALID_ARGUMENT');effect=await integrator.intent(action.actionId,result,receipt);effectResolved=false;
   const outcome=await integrator.publish(effect,result,receipt,await this.senderStopped(effect));
   this.settleEffect(attempt,effect,outcome,await this.senderStopped(effect));
  }catch(error){
   if(!action.workId&&!stopped){
    // A managed-container stop says nothing about policy, staging or an external
    // paired activation. Only that exact backend's retained effect may settle it.
    effectResolved=false;
    if(this.o.specialRecovery)try{
     const proof=await this.o.specialRecovery(action);stopped=proof.stopped;effectResolved=proof.effectResolved;this.assertAttempt(attempt);
     requireThat(proof.output===null||stopped&&effectResolved,'INTEGRITY_FAILURE','Special output lacks stopped/effect proof');
     if(proof.output!==null){this.store('action-result:'+action.actionId,proof.output);this.coordinator.settle(attempt,this.ledger.ownerEpoch,'succeeded',{stopped:true,effectResolved:true,step:'complete.recovered'});return;}
    }catch{stopped=false;effectResolved=false;}
   }else if(!stopped&&this.o.attemptStopped)try{stopped=await this.o.attemptStopped(attempt);}catch{stopped=false;}
   if(effect){stopped=stopped&&await this.senderStopped(effect);effectResolved=false;}
   this.assertAttempt(attempt);const code=error instanceof Dev2Error?error.code:'INTEGRITY_FAILURE';
   this.coordinator.settle(attempt,this.ledger.ownerEpoch,stopped&&effectResolved?(this.cancelled(action.actionId)?'cancelled':'failed'):'blocked',{stopped,effectResolved,resultId,errorCode:code});
  }finally{clearTimeout(deadline);}
 }
 drain(){this.accepting=false;return {running:this.running.size,reservations:this.ledger.transact(tx=>tx.reservations().length)};}
}
