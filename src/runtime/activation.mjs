import {open,mkdir,realpath,lstat,rename,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve,join,isAbsolute} from 'node:path';
import {canonicalJson,parseRecord,recordDigest} from '../contracts/canonical.mjs';
import {digest,id,newId} from '../contracts/identity.mjs';
import {requireThat,Dev2Error} from '../contracts/errors.mjs';
/** @typedef {import('../contracts/ports.js').Json} Json */
/** @typedef {{activationId:string,requestDigest:string,expectedRelease:string,candidateRelease:string,originalRelease:string,
 * phase:'prepared'|'draining'|'switching'|'checking'|'active'|'rolled_back'|'blocked',deadline:number,
 * observedRelease:string|null,writerStopped:boolean,rollbackRequested:boolean,outcome:string|null}} Activation */
/** @typedef {{drain:()=>Promise<boolean>,stop:()=>Promise<boolean>,start:(release:string)=>Promise<void>,
 * observe:()=>Promise<{state:'stopped'|'running'|'uncertain',releaseId:string|null,ready:boolean}>,enable:(release:string)=>Promise<boolean>}} Service */
/** No user-selected command; the installed flock binary locks inherited fd 3. */
export class ActivationStore {
 /** @param {{root:string,flock:string,environment:Record<string,string>}} options */
 constructor(options){requireThat(isAbsolute(options.root)&&isAbsolute(options.flock),'INVALID_ARGUMENT');this.root=resolve(options.root);this.options=options;}
 async init(){await mkdir(this.root,{recursive:true,mode:0o700});requireThat(await realpath(this.root)===this.root&&(await lstat(this.root)).isDirectory(),'INTEGRITY_FAILURE');}
 /** @template T @param {()=>Promise<T>} fn @returns {Promise<T>} */
 async locked(fn){await this.init();const file=await open(join(this.root,'activation.lock'),constants.O_RDWR|constants.O_CREAT|constants.O_NOFOLLOW,0o600);
  try{requireThat((await file.stat()).isFile(),'INTEGRITY_FAILURE');const result=await new Promise(/** @param {(value:number|null)=>void} done */done=>{
   const child=spawn(this.options.flock,['--nonblock','--exclusive','3'],{stdio:['ignore','ignore','ignore',file.fd],env:this.options.environment,shell:false});
   const timer=setTimeout(()=>child.kill('SIGKILL'),5000);child.on('error',()=>{});child.on('close',code=>{clearTimeout(timer);done(code);});});
   requireThat(result===0,'EXECUTION_UNAVAILABLE','Activation owner unavailable');return await fn();
  }finally{await file.close();}
 }
 /** @param {'activation.json'|'active.json'} name @returns {Promise<Json|null>} */
 async read(name){requireThat(['activation.json','active.json'].includes(name),'INVALID_ARGUMENT');await this.init();let file;try{file=await open(join(this.root,name),constants.O_RDONLY|constants.O_NOFOLLOW);}catch(e){if(/** @type {NodeJS.ErrnoException} */(e).code==='ENOENT')return null;throw e;}
  try{const stat=await file.stat();requireThat(stat.isFile()&&stat.size<=65536,'INTEGRITY_FAILURE');return /** @type {Json} */(parseRecord(await file.readFile(),65536));}finally{await file.close();}
 }
 /** Caller holds the activation lock. @param {'activation.json'|'active.json'} name @param {unknown} value */
 async write(name,value){requireThat(['activation.json','active.json'].includes(name),'INVALID_ARGUMENT');await this.init();const bytes=Buffer.from(canonicalJson(value));requireThat(bytes.length<=65536,'LIMIT_EXCEEDED');const temp=join(this.root,'.'+newId()+'.tmp');let moved=false;
  try{const file=await open(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}
   await rename(temp,join(this.root,name));moved=true;const directory=await open(this.root,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{await directory.sync();}finally{await directory.close();}
  }finally{if(!moved)await unlink(temp).catch(()=>{});}
 }
}
/** One fixed handoff, not a background supervisor. Invoked under service-manager
 * ownership so it survives replacing the broker. Verification callbacks are
 * trusted installation capabilities, not booleans taken from MCP/source files.
 */
export class ReleaseActivation {
 /** @param {{store:ActivationStore,service:Service,verifyRelease:(release:string)=>Promise<void>,authorize:()=>Promise<void>,
  * retain:(activation:Activation)=>Promise<void>,lookup:(activationId:string)=>Promise<Activation|null>,now?:()=>number,
  * readinessMs?:number,pollMs?:number,fault?:(point:string)=>Promise<void>}} options */
 constructor(options){this.o=options;this.now=options.now??Date.now;this.readinessMs=options.readinessMs??30000;this.pollMs=options.pollMs??100;
  requireThat(Number.isSafeInteger(this.readinessMs)&&this.readinessMs>0&&this.readinessMs<=120000&&Number.isSafeInteger(this.pollMs)&&this.pollMs>0,'INVALID_ARGUMENT');}
 /** Read-only; no start/stop or inferred success. @param {string} activationId */
 async observe(activationId){id(activationId);await this.o.authorize();const current=/** @type {Activation|null} */(await this.o.store.read('activation.json'));
  return current?.activationId===activationId?current:this.o.lookup(activationId);}
 /** Auth + immutable request identity precede any effect. @param {{activationId:string,requestDigest:string,expectedRelease:string,candidateRelease:string,deadline:number}} input */
 async prepare(input){id(input.activationId);digest(input.requestDigest);digest(input.expectedRelease);digest(input.candidateRelease);
  await this.o.authorize();return this.o.store.locked(async()=>{
   const known=await this.o.lookup(input.activationId);if(known){this.sameRequest(known,input);return known;}
   const current=/** @type {Activation|null} */(await this.o.store.read('activation.json'));
   if(current?.activationId===input.activationId){this.sameRequest(current,input);return current;}
   requireThat(!current||['active','rolled_back'].includes(current.phase),'EXECUTION_UNAVAILABLE');
   requireThat(Number.isSafeInteger(input.deadline)&&input.deadline>this.now()&&input.deadline-this.now()<=120000,'INVALID_ARGUMENT');
   const pointer=await this.o.store.read('active.json');requireThat(pointer&&typeof pointer==='object'&&!Array.isArray(pointer)&&pointer.releaseId===input.expectedRelease,'STALE_RELEASE');
   await this.o.verifyRelease(input.candidateRelease);await this.o.verifyRelease(input.expectedRelease);
   if(current)await this.o.retain(current);
   /** @type {Activation} */const intent={...input,originalRelease:input.expectedRelease,phase:'prepared',observedRelease:input.expectedRelease,writerStopped:false,rollbackRequested:false,outcome:null};
   await this.o.store.write('activation.json',intent);return intent;
  });}
 /** @param {Activation} known @param {{requestDigest:string,expectedRelease:string,candidateRelease:string}} input */
 sameRequest(known,input){requireThat(known.requestDigest===input.requestDigest&&known.expectedRelease===input.expectedRelease&&known.candidateRelease===input.candidateRelease,'IDEMPOTENCY_MISMATCH');}
 /** Fixed helper's forward/recovery invocation. @param {string} activationId */
 async execute(activationId){id(activationId);await this.o.authorize();return this.o.store.locked(async()=>{
  const loaded=/** @type {Activation|null} */(await this.o.store.read('activation.json'));
  requireThat(loaded&&loaded.activationId===activationId,'STALE_RELEASE');let state=loaded;if(['active','rolled_back'].includes(state.phase))return state;
  /** Persist observation and direction BEFORE the next effect. @param {Partial<Activation>} fields */
  const save=async fields=>{state={.../** @type {Activation} */(state),...fields};await this.o.store.write('activation.json',state);await this.o.fault?.('persist:'+state.phase);return state;};
  /** @param {string} release */
  const ready=async release=>{const until=this.now()+this.readinessMs;let observations=0;
   while(this.now()<=until&&observations++<Math.ceil(this.readinessMs/this.pollMs)+1){const seen=await this.o.service.observe();
    if(seen.state==='running'&&seen.ready&&seen.releaseId===release)return true;
    if(seen.state==='running'&&seen.releaseId!==release)return false;
    await new Promise(r=>setTimeout(r,this.pollMs));}return false;};
  /** @param {string} reason */
  const rollback=async reason=>{
   await save({rollbackRequested:true,outcome:reason});
   const previous=await this.o.service.observe(),pointer=await this.o.store.read('active.json');
   if(previous.state==='running'&&previous.releaseId===state.originalRelease&&previous.ready&&pointer&&typeof pointer==='object'&&!Array.isArray(pointer)&&pointer.releaseId===state.originalRelease){
    await this.o.verifyRelease(state.originalRelease);
    if(!await this.o.service.enable(state.originalRelease))return save({phase:'blocked',outcome:'restore.admission.failed'});
    const done=await save({phase:'rolled_back',observedRelease:state.originalRelease,writerStopped:false,outcome:reason});await this.o.retain(done);return done;
   }
   if(!await this.o.service.stop())return save({phase:'blocked',writerStopped:false,outcome:'restore.termination.uncertain'});
   const stopped=await this.o.service.observe();if(stopped.state!=='stopped')return save({phase:'blocked',writerStopped:false,outcome:'restore.writer.uncertain'});
   await this.o.verifyRelease(/** @type {Activation} */(state).originalRelease);
   await save({phase:'switching',writerStopped:true});
   await this.o.store.write('active.json',{releaseId:/** @type {Activation} */(state).originalRelease});await this.o.fault?.('pointer:restore');
   try{await this.o.service.start(/** @type {Activation} */(state).originalRelease);}catch{const after=await this.o.service.observe();if(after.state!=='running'||after.releaseId!==state.originalRelease)return save({phase:'blocked',writerStopped:false,outcome:'restore.startup.uncertain'});}
   await save({phase:'checking',writerStopped:false});
   if(!await ready(/** @type {Activation} */(state).originalRelease))return save({phase:'blocked',outcome:'restore.readiness.failed'});
   if(!await this.o.service.enable(/** @type {Activation} */(state).originalRelease))return save({phase:'blocked',outcome:'restore.admission.failed'});
   const done=await save({phase:'rolled_back',observedRelease:/** @type {Activation} */(state).originalRelease,outcome:reason});await this.o.retain(done);return done;
  };
  if(state.rollbackRequested)return rollback(state.outcome??'restore.resumed');
  const seen=await this.o.service.observe();
  const pointer=await this.o.store.read('active.json');requireThat(pointer&&typeof pointer==='object'&&!Array.isArray(pointer),'INTEGRITY_FAILURE');
  if(seen.state==='running'&&seen.releaseId===state.candidateRelease&&pointer.releaseId===state.candidateRelease){
   await this.o.verifyRelease(state.candidateRelease);
   if(!seen.ready&&!await ready(state.candidateRelease))return rollback('readiness.failed');
   if(!await this.o.service.enable(state.candidateRelease))return save({phase:'blocked',outcome:'admission.failed'});
   const done=await save({phase:'active',observedRelease:state.candidateRelease,writerStopped:false,outcome:'activated'});await this.o.retain(done);return done;}
  if(this.now()>state.deadline)return rollback('deadline.expired');
  if(seen.state==='uncertain')return save({phase:'blocked',outcome:'writer.uncertain'});
  requireThat([state.originalRelease,state.candidateRelease].includes(/** @type {string} */(pointer.releaseId)),'STALE_RELEASE');
  await this.o.verifyRelease(state.candidateRelease);
  if(seen.state==='running'){
   requireThat(seen.releaseId===state.originalRelease,'STALE_RELEASE');
   await save({phase:'draining'});if(!await this.o.service.drain())return save({phase:'blocked',outcome:'effects.unresolved'});
   if(!await this.o.service.stop())return save({phase:'blocked',outcome:'termination.uncertain'});
  }
  if((await this.o.service.observe()).state!=='stopped')return save({phase:'blocked',outcome:'writer.uncertain'});
  await save({phase:'switching',writerStopped:true});if(this.now()>state.deadline)return rollback('deadline.expired');
  await this.o.store.write('active.json',{releaseId:state.candidateRelease});await this.o.fault?.('pointer:candidate');
  try{await this.o.service.start(state.candidateRelease);}catch{
   const after=await this.o.service.observe();
   if(after.state==='uncertain')return save({phase:'blocked',writerStopped:false,outcome:'startup.uncertain'});
   if(after.state!=='running'||after.releaseId!==state.candidateRelease)return rollback('startup.failed');
  }
  await save({phase:'checking',writerStopped:false});
  if(!await ready(state.candidateRelease))return rollback('readiness.failed');
  if(!await this.o.service.enable(state.candidateRelease))return rollback('admission.failed');
  const done=await save({phase:'active',observedRelease:state.candidateRelease,outcome:'activated'});await this.o.retain(done);return done;
 });}
}
