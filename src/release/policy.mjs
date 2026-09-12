import {canonicalJson,parseRecord,recordDigest} from '../contracts/canonical.mjs';
import {id,digest,oid} from '../contracts/identity.mjs';
import {requireThat,Dev2Error} from '../contracts/errors.mjs';
import {repositoryPath} from '../security/paths.mjs';
import {AdoptedPolicy} from '../validation/policy.mjs';
import {specialActionFence} from './action.mjs';
/** @typedef {ConstructorParameters<typeof AdoptedPolicy>[0]} Policy */
/** @typedef {import('../contracts/ports.js').Principal} Principal */
/** @typedef {import('../contracts/ports.js').Binding} Binding */
/** @typedef {import('../contracts/ports.js').SourceTree} SourceTree */
/** @typedef {{repositoryId:string,bindingEpoch:string,commitOid:string,source:SourceTree,policyDigest:string,validationId:string}} IntegratedSource */
/** @typedef {{schemaVersion:1,initialPolicyDigest:string,previousPolicyDigest:string,integratedCommit:string,policyPath:string,sourceBlobDigest:string,validationId:string,actionId:string,principal:string,adoptedAt:number,policy:Policy}} Adoption */
/** @typedef {{integratedCommit:string,policyPath:string,expectedPolicyDigest:string,newPolicyDigest:string}} AdoptionInput */
/** @param {unknown} value @param {readonly string[]} keys */
function closed(value,keys){requireThat(value&&typeof value==='object'&&!Array.isArray(value)&&canonicalJson(Object.keys(value).sort())===canonicalJson([...keys].sort()),'INVALID_ARGUMENT','Closed policy record');}
/** Policy definition is data: it cannot change provider credentials, grants,
 * control paths, executor launch commands or the installed containment seal.
 * Fixed profile argv is subsequently checked against installed capabilities.
 * @param {unknown} input @returns {AdoptedPolicy}
 */
export function qualifiedPolicy(input){
 const value=/** @type {Policy&{schemaVersion:1}} */(input);
 closed(value,['schemaVersion','digest','profiles','required','execution']);requireThat(value.schemaVersion===1,'INVALID_ARGUMENT');
 requireThat(Array.isArray(value.profiles)&&value.profiles.length>0&&value.profiles.length<=32&&Array.isArray(value.required)&&value.required.length<=32,'INVALID_ARGUMENT');
 closed(value.execution,['orderedProfileDigests','trustedRunnerDigest','toolchainDigest','environmentClass','dependencyLockDigest']);
 requireThat(Array.isArray(value.execution.orderedProfileDigests)&&value.execution.environmentClass==='github-hosted-rootless-oci','EXECUTION_UNAVAILABLE','Qualified managed execution required');
 for(const d of [...value.execution.orderedProfileDigests,value.execution.trustedRunnerDigest,value.execution.toolchainDigest,value.execution.dependencyLockDigest])digest(d);
 for(const item of value.profiles){
  closed(item,['profile','parameterSchema']);const p=item.profile;
  closed(p,['profileId','digest','argv','cwd','parameters','timeoutMs','killGraceMs','memoryBytes','pids','cpuMillis','diskBytes','logBytes','network','imageDigest','replaySafe']);
  id(p.profileId);digest(p.digest);digest(p.imageDigest);repositoryPath(p.cwd,true);
  requireThat(Array.isArray(p.argv)&&p.argv.length>0&&p.argv.length<=256&&p.argv.every((/** @type {unknown} */ arg)=>typeof arg==='string'&&arg.length>0&&arg.length<=4096&&!arg.includes('\0'))&&p.argv[0].startsWith('/'),'INVALID_ARGUMENT','Fixed executable profile');
  for(const n of [p.timeoutMs,p.killGraceMs,p.memoryBytes,p.pids,p.cpuMillis,p.diskBytes,p.logBytes])requireThat(Number.isSafeInteger(n)&&n>0,'INVALID_ARGUMENT','Finite resource bounds');
  requireThat(p.timeoutMs%1000===0&&p.killGraceMs%1000===0&&p.memoryBytes>=p.diskBytes&&p.diskBytes>=8192&&['none','fixture'].includes(p.network)&&typeof p.replaySafe==='boolean','INVALID_ARGUMENT');
  requireThat(Buffer.byteLength(canonicalJson(p.parameters))<=65536&&Buffer.byteLength(canonicalJson(item.parameterSchema))<=65536,'LIMIT_EXCEEDED');
  const {digest:ignored,...definition}=p;requireThat(recordDigest('dev2.profile.v1',definition)===p.digest,'INTEGRITY_FAILURE','Profile digest mismatch');
  if(value.required.includes(p.profileId))requireThat(p.network==='none','EXECUTION_UNAVAILABLE','Required profile cannot acquire a fixture/network capability');
 }
 requireThat(new Set(value.profiles.map(p=>p.profile.digest)).size===value.profiles.length,'INVALID_ARGUMENT','Profile identity alias');
 const definition={profiles:value.profiles,required:value.required,execution:value.execution};
 requireThat(recordDigest('dev2.execution-policy.v1',definition)===digest(value.digest),'INTEGRITY_FAILURE','Policy digest mismatch');
 try{return new AdoptedPolicy({digest:value.digest,...definition});}catch(error){if(error instanceof Dev2Error)throw error;throw new Dev2Error('INVALID_ARGUMENT','Policy parameter schema is not supported');}
}
/** Stored initial binding remains the installation enrollment identity. Active
 * policy is an independently durable register, restored after opening that exact
 * binding. No stale runtime config is allowed to reset an adopted policy.
 */
export class PolicyState {
 /** @param {{ledger:import('../storage/ledger.mjs').Ledger,binding:Binding,initial:AdoptedPolicy,enrollment?:{digest:string,policy:AdoptedPolicy},authorize:(principal:Principal,path:string)=>Promise<void>,verifyIntegrated:(commit:string,oldPolicyDigest:string)=>Promise<IntegratedSource>,readBlob:(blobOid:string)=>Promise<Uint8Array>,qualify:(policy:AdoptedPolicy)=>Promise<boolean>,now?:()=>number}} options */
 constructor(options){this.o=options;this.now=options.now??Date.now;this.initialDigest=options.initial.policy.digest;this.baseDigest=this.initialDigest;this.current=options.initial;}
 /** @returns {Adoption|null} */
 retained(){return this.o.ledger.transact(tx=>{const row=tx.get("SELECT value FROM meta WHERE key='policy.active'");return row?/** @type {Adoption} */(parseRecord(String(row.value))):null;});}
 /** One-time private commissioning is not policy.adopt or a validation receipt.
  * It cannot be requested by a work item or inferred from repository config. The
  * native installer supplies an independently checked immutable enrollment and
  * its qualified initial controller. The original SQLite binding stays intact.
  */
 async commissioning(){
  const retained=this.o.ledger.transact(tx=>{const row=tx.get("SELECT value FROM meta WHERE key='policy.enrollment'");return row?parseRecord(String(row.value)):null;}),enrollment=this.o.enrollment;
  if(!enrollment){requireThat(retained===null,'EXECUTION_UNAVAILABLE','Private managed enrollment is missing; refusing bootstrap-policy fallback');return this.o.initial;}
  digest(enrollment.digest);const policy=qualifiedPolicy({schemaVersion:1,...enrollment.policy.policy});
  requireThat(await this.o.qualify(policy),'EXECUTION_UNAVAILABLE','Private enrollment exceeds installed managed capability');
  const value={schemaVersion:1,initialPolicyDigest:this.initialDigest,enrollmentDigest:enrollment.digest,policy:policy.policy},text=canonicalJson(value);
  this.o.ledger.transact(tx=>{const row=tx.get("SELECT value FROM meta WHERE key='policy.enrollment'");if(row)requireThat(String(row.value)===text,'INTEGRITY_FAILURE','Private enrollment changed');else{requireThat(!tx.get("SELECT value FROM meta WHERE key='policy.active'"),'INTEGRITY_FAILURE','Cannot commission over an already adopted policy');tx.run("INSERT INTO meta VALUES('policy.enrollment',?)",text);}});
  this.baseDigest=policy.policy.digest;return policy;
 }
 /** Mandatory before opening admission on restart. Missing capability leaves the
  * installation closed; it does not silently fall back to the bootstrap policy.
  */
 async restore(){
  const commissioned=await this.commissioning(),record=this.retained();
  if(!record){requireThat([this.initialDigest,this.baseDigest].includes(this.o.binding.policyDigest),'INTEGRITY_FAILURE');this.current=commissioned;this.o.binding.policyDigest=commissioned.policy.digest;this.o.ledger.binding.policyDigest=commissioned.policy.digest;return this.current;}
  requireThat(record.schemaVersion===1&&record.initialPolicyDigest===this.initialDigest,'INTEGRITY_FAILURE','Policy enrollment mismatch');
  const restored=qualifiedPolicy({schemaVersion:1,...record.policy});
  requireThat(await this.o.qualify(restored),'EXECUTION_UNAVAILABLE','Adopted execution policy is not installed');
  const after=this.retained();requireThat(after&&canonicalJson(after)===canonicalJson(record),'STALE_RESULT');
  this.current=restored;this.o.binding.policyDigest=restored.policy.digest;this.o.ledger.binding.policyDigest=restored.policy.digest;return restored;
 }
 /** Observation only: SQL commit or absence is authoritative once the previous
  * continuation has stopped. Never manufacture a second adoption to recover a
  * missing response. Restoration replays the retained policy, not a new CAS.
  * @param {import('../contracts/ports.js').Action} action */
 async recovery(action){
  requireThat(action.operation==='policy.adopt'&&action.workId===null&&action.bindingEpoch===this.o.binding.bindingEpoch,'FORBIDDEN');
  const record=this.o.ledger.transact(tx=>{const row=tx.get('SELECT value FROM meta WHERE key=?','policy.adoption:'+action.actionId);if(!row)return null;
   const value=/** @type {Adoption} */(parseRecord(String(row.value))),input=/** @type {AdoptionInput} */(/** @type {unknown} */(tx.intent(action.actionId)));
   requireThat(value.actionId===action.actionId&&value.principal===action.principal&&value.initialPolicyDigest===this.initialDigest&&value.integratedCommit===input.integratedCommit&&value.policyPath===input.policyPath&&value.previousPolicyDigest===input.expectedPolicyDigest&&value.policy.digest===input.newPolicyDigest,'INTEGRITY_FAILURE','Retained adoption differs from the action');return value;
  });
  if(record)await this.restore();
  return {stopped:true,effectResolved:true,output:record?this.output(record):null};
 }
 /** @param {Principal} principal @param {AdoptionInput} input @param {string} actionId */
 async adopt(principal,input,actionId){
  oid(input.integratedCommit);repositoryPath(input.policyPath);digest(input.expectedPolicyDigest);digest(input.newPolicyDigest);id(actionId);
  await this.o.authorize(principal,input.policyPath);
  const fence=specialActionFence(this.o.ledger,actionId,'policy.adopt',principal.subject,this.now);
  const prior=this.o.ledger.transact(tx=>{fence.check(tx);const row=tx.get('SELECT value FROM meta WHERE key=?','policy.adoption:'+actionId);return row?/** @type {Adoption} */(parseRecord(String(row.value))):null;});
  if(prior){requireThat(prior.integratedCommit===input.integratedCommit&&prior.policyPath===input.policyPath&&prior.previousPolicyDigest===input.expectedPolicyDigest&&prior.policy.digest===input.newPolicyDigest&&prior.principal===principal.subject,'IDEMPOTENCY_MISMATCH');await this.restore();return this.output(prior);}
  requireThat(this.current.policy.digest===input.expectedPolicyDigest&&this.o.binding.policyDigest===input.expectedPolicyDigest,'STALE_RESULT');
  const integrated=await this.o.verifyIntegrated(input.integratedCommit,input.expectedPolicyDigest);fence.assert();
  requireThat(integrated.repositoryId===this.o.binding.repositoryId&&integrated.bindingEpoch===this.o.binding.bindingEpoch&&integrated.commitOid===input.integratedCommit&&integrated.policyDigest===input.expectedPolicyDigest,'STALE_RESULT');digest(integrated.validationId);
  const entry=integrated.source.entries.find(e=>e.path===input.policyPath);requireThat(entry&&entry.mode==='100644'&&entry.size<=1048576,'INVALID_ARGUMENT','Policy must be a bounded integrated regular file');
  const bytes=await this.o.readBlob(entry.blobOid);fence.assert();
  const {bytesDigest}=await import('../contracts/canonical.mjs');
  requireThat(bytes.byteLength===entry.size&&bytesDigest(bytes)===entry.contentDigest,'INTEGRITY_FAILURE');
  const next=qualifiedPolicy(parseRecord(bytes));requireThat(next.policy.digest===input.newPolicyDigest,'INTEGRITY_FAILURE');
  requireThat(await this.o.qualify(next),'EXECUTION_UNAVAILABLE','Policy exceeds sealed installation capability');fence.assert();
  await this.o.authorize(principal,input.policyPath);fence.assert();
  /** @type {Adoption} */const record={schemaVersion:1,initialPolicyDigest:this.initialDigest,previousPolicyDigest:input.expectedPolicyDigest,integratedCommit:input.integratedCommit,policyPath:input.policyPath,sourceBlobDigest:entry.contentDigest,validationId:integrated.validationId,actionId,principal:principal.subject,adoptedAt:this.now(),policy:next.policy};
  this.o.ledger.transact(tx=>{
   fence.check(tx);const row=tx.get("SELECT value FROM meta WHERE key='policy.active'");
   const active=row?/** @type {Adoption} */(parseRecord(String(row.value))).policy.digest:this.baseDigest;
   requireThat(active===input.expectedPolicyDigest&&this.o.binding.policyDigest===input.expectedPolicyDigest,'STALE_RESULT','Concurrent policy adoption');
   const text=canonicalJson(record);tx.run('INSERT INTO meta(key,value) VALUES(?,?)','policy.adoption:'+actionId,text);tx.run("INSERT INTO meta(key,value) VALUES('policy.active',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",text);
  });
  // Synchronous projection after durable commit. A crash here is repaired by restore().
  this.current=next;this.o.binding.policyDigest=next.policy.digest;this.o.ledger.binding.policyDigest=next.policy.digest;return this.output(record);
 }
 /** @param {Adoption} record */
 output(record){return {kind:/** @type {const} */('policy'),integratedCommit:record.integratedCommit,previousPolicyDigest:record.previousPolicyDigest,policyDigest:record.policy.digest};}
}
