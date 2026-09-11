import {join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {canonicalJson,recordDigest} from '../contracts/canonical.mjs';
import {id,digest} from '../contracts/identity.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {durableRecord,readRecord,exclusiveReleaseLock} from './release-store.mjs';
/** @typedef {{activationId:string,requestDigest:string,expectedRelease:string,candidateRelease:string,deadline:number}} Intent */
/** @typedef {Intent & {phase:'prepared'|'draining'|'switching'|'checking'|'active'|'rolling_back'|'rolled_back'|'blocked',originalRelease:string,observedRelease:string|null,writerStopped:boolean,outcome:string|null}} Activation */
/** @typedef {{drain:(deadline:number)=>Promise<boolean>,stop:(deadline:number)=>Promise<boolean>,start:(release:string,deadline:number)=>Promise<boolean>,ready:(release:string,deadline:number)=>Promise<boolean>,enable:(release:string)=>Promise<boolean>}} Services */
const terminal=new Set(['active','rolled_back']);
/** Fixed helper-owned handoff state; never a second repository work owner. */
export class ActivationController {
 /** @param {{store:import('./release-store.mjs').ReleaseStore,services:Services,ledgerVersion:number,now?:()=>number,flock?:string,afterPhase?:(record:Activation)=>Promise<void>}} options */
 constructor(options){this.o=options;this.now=options.now??Date.now;this.path=join(options.store.root,'activation.json');}
 lock(){return exclusiveReleaseLock(join(this.o.store.root,'activation.lock'),this.o.flock);}
 /** @param {Activation} record */
 async save(record){if(terminal.has(record.phase)){await mkdir(join(this.o.store.root,'activation-receipts'),{recursive:true,mode:0o700});const path=join(this.o.store.root,'activation-receipts',record.activationId+'.json'),old=await readRecord(path);requireThat(!old||canonicalJson(old)===canonicalJson(record),'INTEGRITY_FAILURE','Terminal activation is immutable');if(!old)await durableRecord(path,record);}await durableRecord(this.path,record);await this.o.afterPhase?.(structuredClone(record));return record;}
 /** @param {string} activationId @returns {Promise<Activation|null>} */
 async observe(activationId){id(activationId);const current=/** @type {Activation|null} */(await readRecord(this.path));if(current?.activationId===activationId)return current;return /** @type {Activation|null} */(await readRecord(join(this.o.store.root,'activation-receipts',activationId+'.json')));}
 /** Called only by trusted typed release admission; it persists the helper intent
 * before systemd dispatch. Duplicate calls return the same record, never another job.
 * @param {Intent} intent @returns {Promise<Activation>} */
 async prepare(intent){id(intent.activationId);for(const d of [intent.requestDigest,intent.expectedRelease,intent.candidateRelease])digest(d);requireThat(Number.isSafeInteger(intent.deadline),'INVALID_ARGUMENT');
 const unlock=this.lock();try{
  const old=await this.observe(intent.activationId);if(old){const retained={activationId:old.activationId,requestDigest:old.requestDigest,expectedRelease:old.expectedRelease,candidateRelease:old.candidateRelease,deadline:old.deadline};requireThat(canonicalJson(retained)===canonicalJson(intent),'IDEMPOTENCY_MISMATCH');return old;}
  requireThat(intent.deadline>this.now(),'DEADLINE_EXCEEDED');const current=/** @type {Activation|null} */(await readRecord(this.path));requireThat(!current||terminal.has(current.phase),'EFFECT_UNCERTAIN','Another activation remains unresolved');
  const candidate=await this.o.store.read(intent.candidateRelease);requireThat(candidate,'INTEGRITY_FAILURE');requireThat(candidate.metadata.ledgerMinimum<=this.o.ledgerVersion&&candidate.metadata.ledgerMaximum>=this.o.ledgerVersion,'EXECUTION_UNAVAILABLE','Incompatible ledger release');
  requireThat(await this.o.store.active()===intent.expectedRelease,'STALE_RELEASE');requireThat(await this.o.store.read(intent.expectedRelease),'INTEGRITY_FAILURE');
  return this.save({...intent,originalRelease:intent.expectedRelease,phase:'prepared',observedRelease:intent.expectedRelease,writerStopped:false,outcome:null});
 }finally{unlock();}}
 /** May be called again after a process crash. Physical release pointer and exact
 * service readback determine recovery; a lost callback is never success evidence.
 * @param {string} activationId @returns {Promise<Activation>} */
 async run(activationId){const unlock=this.lock();try{
  let record=await this.observe(activationId);requireThat(record,'INVALID_ARGUMENT');if(terminal.has(record.phase))return record;
  const current=/** @type {Activation|null} */(await readRecord(this.path));requireThat(current?.activationId===activationId,'EFFECT_UNCERTAIN');
  const original=await this.o.store.read(record.originalRelease),candidate=await this.o.store.read(record.candidateRelease);requireThat(original&&candidate,'INTEGRITY_FAILURE');
  const pointer=await this.o.store.active();requireThat(pointer===record.originalRelease||pointer===record.candidateRelease,'EFFECT_UNCERTAIN','Unexpected active release');
  /** @param {string} reason */
  const blocked=async reason=>this.save({.../** @type {Activation} */(record),phase:'blocked',observedRelease:await this.o.store.active(),outcome:reason});
  if(record.phase==='rolling_back'||record.outcome==='restore-original')return this.rollback(record);
  if(pointer===record.candidateRelease){
   record=await this.save({...record,phase:'checking',observedRelease:pointer});
   if(this.now()<record.deadline&&await this.o.services.ready(record.candidateRelease,Math.min(record.deadline,this.now()+30000))&&await this.o.services.enable(record.candidateRelease))return this.save({...record,phase:'active',writerStopped:false,outcome:'activated'});
   return this.rollback(record);
  }
  if(this.now()>=record.deadline)return blocked('deadline-before-switch');
  record=await this.save({...record,phase:'draining',observedRelease:pointer});
  if(!await this.o.services.drain(record.deadline))return blocked('provider-or-owner-drain-uncertain');
  if(!await this.o.services.stop(record.deadline))return blocked('old-writer-termination-uncertain');
  record=await this.save({...record,phase:'switching',writerStopped:true});
  if(this.now()>=record.deadline)return this.rollback(record);
  await this.o.store.switch(record.originalRelease,record.candidateRelease);
  record=await this.save({...record,phase:'checking',observedRelease:record.candidateRelease});
  if(!await this.o.services.start(record.candidateRelease,record.deadline))return this.rollback(record);
  if(!await this.o.services.ready(record.candidateRelease,Math.min(record.deadline,this.now()+30000))||!await this.o.services.enable(record.candidateRelease))return this.rollback(record);
  return this.save({...record,phase:'active',writerStopped:false,outcome:'activated'});
 }finally{unlock();}}
 /** Restore is bounded safety work even when the original forward deadline expired.
 * No second writer is started without verified termination. @param {Activation} record */
 async rollback(record){record=await this.save({...record,phase:'rolling_back',outcome:'restore-original'});const deadline=this.now()+30000;
  if(!await this.o.services.stop(deadline))return this.save({...record,phase:'blocked',outcome:'restore-original',writerStopped:false});
  const pointer=await this.o.store.active();requireThat(pointer===record.originalRelease||pointer===record.candidateRelease,'EFFECT_UNCERTAIN');
  if(pointer!==record.originalRelease)await this.o.store.switch(record.candidateRelease,record.originalRelease);
  record=await this.save({...record,phase:'rolling_back',observedRelease:record.originalRelease,writerStopped:true});
  if(!await this.o.services.start(record.originalRelease,deadline)||!await this.o.services.ready(record.originalRelease,deadline)||!await this.o.services.enable(record.originalRelease))return this.save({...record,phase:'blocked',outcome:'restore-original'});
  return this.save({...record,phase:'rolled_back',writerStopped:false,observedRelease:record.originalRelease,outcome:'candidate-rejected-original-restored'});
 }
}
