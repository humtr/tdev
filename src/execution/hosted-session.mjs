import {mkdir,open,readFile,rename,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {canonicalJson,parseRecord,recordDigest} from '../contracts/canonical.mjs';
import {id,digest,newId} from '../contracts/identity.mjs';
import {Dev2Error,requireThat} from '../contracts/errors.mjs';
/** Exact pending assignment is retained before execution. In particular, response
 * loss after native acceptance must replay the old receipt before polling a new
 * assignment. A new sender, work, lease or provider run is never created here.
 */
export class HostedSession {
 /** @param {{client:import('./executor-client.mjs').ExecutorClient,stateDirectory:string,expected:{commit:string,runId:string,repositoryId:string,repositoryFullName:string,trustedRunnerDigest:string},createRunner:(sealDigest:string)=>import('./managed-runner.mjs').ManagedRunner,now?:()=>number,sleep?:(ms:number)=>Promise<void>,deadline:number,idleTimeoutMs:number}} options */
 constructor(options){this.o=options;this.now=options.now??Date.now;this.sleep=options.sleep??delay;this.deadline=options.deadline;this.pending=/** @type {import('./session-types.js').Assignment|null} */(null);this.seal=/** @type {string|null} */(null);this.intentDigest=/** @type {string|null} */(null);this.completed=0;this.failures=0;requireThat(Number.isSafeInteger(this.deadline)&&this.deadline>this.now()&&this.deadline<=this.now()+900000&&options.idleTimeoutMs===60000,'INVALID_ARGUMENT');}
 /** @param {import('./session-types.js').Session} session */
 verify(session){const i=session.intent,e=this.o.expected;requireThat(i.sessionId===this.o.client.sessionId&&i.launchCommit===e.commit&&i.providerRepositoryId===e.repositoryId&&i.repositoryFullName===e.repositoryFullName&&i.trustedRunnerDigest===e.trustedRunnerDigest&&i.ref==='refs/heads/dev2-exec/'+i.sessionId&&i.workflowRef===e.repositoryFullName+'/.github/workflows/dev2-executor.yml@'+i.ref&&session.intentDigest===recordDigest('dev2.managed-session.v1',i)&&session.run?.runId===e.runId&&session.run.runAttempt==='1','UNAUTHORIZED','Native session differs from approved workflow/run');requireThat(this.intentDigest===null||this.intentDigest===session.intentDigest,'INTEGRITY_FAILURE','Native launch intent changed');this.intentDigest=session.intentDigest;requireThat(Number.isSafeInteger(i.deadline)&&i.deadline>this.now()&&i.deadline-i.createdAt<=900000,'EXECUTION_UNAVAILABLE','Managed session expired');this.deadline=Math.min(this.deadline,i.deadline);}
 async load(){await mkdir(this.o.stateDirectory,{recursive:true,mode:0o700});requireThat(await realpath(this.o.stateDirectory)===this.o.stateDirectory,'FORBIDDEN');let raw;try{raw=await readFile(join(this.o.stateDirectory,'session.json'));}catch(e){if(e&&typeof e==='object'&&'code'in e&&e.code==='ENOENT')return;throw e;}
  const r=/** @type {{sessionId:string,expected:{commit:string,runId:string,repositoryId:string,repositoryFullName:string,trustedRunnerDigest:string},seal:string|null,intentDigest:string|null,pending:import('./session-types.js').Assignment|null,completed:number,deadline:number}} */(/** @type {unknown} */(parseRecord(raw,65536)));
  requireThat(r.sessionId===this.o.client.sessionId&&canonicalJson(r.expected)===canonicalJson(this.o.expected)&&Number.isSafeInteger(r.deadline)&&r.deadline>0&&Number.isSafeInteger(r.completed)&&r.completed>=0,'INTEGRITY_FAILURE');if(r.seal)digest(r.seal);this.pending=r.pending;this.seal=r.seal;this.intentDigest=r.intentDigest;this.completed=r.completed;this.deadline=Math.min(this.deadline,r.deadline);
 }
 async save(){const path=join(this.o.stateDirectory,'session.json'),temporary=path+'.'+newId(),f=await open(temporary,'wx',0o600);try{await f.writeFile(canonicalJson({sessionId:this.o.client.sessionId,expected:this.o.expected,seal:this.seal,intentDigest:this.intentDigest,pending:this.pending,completed:this.completed,deadline:this.deadline}));await f.sync();}finally{await f.close();}await rename(temporary,path);const d=await open(this.o.stateDirectory,'r');try{await d.sync();}finally{await d.close();}}
 async run(){await this.load();let idleSince=this.now();const admissionStarted=this.now();
  while(this.now()<this.deadline){
   try{
    if(this.pending){requireThat(this.seal&&this.pending.sealDigest===this.seal,'INTEGRITY_FAILURE');const runner=this.o.createRunner(this.seal);await runner.execute(this.pending);this.pending=null;this.completed++;await this.save();idleSince=this.now();continue;}
    const current=await this.o.client.poll();this.verify(current.session);if(current.cancelRequested)return {state:'cancelled',completed:this.completed};
    if(current.assignment){const a=current.assignment;id(a.assignmentId);digest(a.sealDigest);requireThat(a.sessionId===this.o.client.sessionId&&a.runId===this.o.expected.runId&&(this.seal===null||a.sealDigest===this.seal),'UNAUTHORIZED');
     // Only the enrolled native controller can authorize a seal over this TLS
     // endpoint. Exact approved runner/policy bytes are independently checked by
     // the factory; a candidate payload or printed receipt cannot choose either.
     this.seal=a.sealDigest;this.pending=a;await this.save();continue;
    }
    if(this.now()-idleSince>=this.o.idleTimeoutMs)return {state:'idle',completed:this.completed};await this.sleep(500);
   }catch(error){
    const transient=error instanceof Dev2Error&&(['EXECUTION_UNAVAILABLE','EFFECT_UNCERTAIN','CAPACITY_REJECTED'].includes(error.code)||!this.intentDigest&&!this.pending&&error.code==='UNAUTHORIZED'&&this.now()-admissionStarted<30000);
    if(!transient)throw error;this.failures++;await this.sleep(1000);
   }
  }
  return {state:'expired',completed:this.completed,pendingAssignmentId:this.pending?.assignmentId??null};
 }
}
