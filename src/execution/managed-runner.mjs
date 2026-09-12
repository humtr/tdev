import {mkdir,readFile,open,rename,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {canonicalJson,parseRecord,recordDigest,bytesDigest} from '../contracts/canonical.mjs';
import {id,digest,newId} from '../contracts/identity.mjs';
import {requireThat,Dev2Error} from '../contracts/errors.mjs';
import {decodePayload,physicalAttempt} from './payload.mjs';
import {inspectMaterialization} from '../candidate/materialize.mjs';
import {attemptName} from './podman.mjs';
/** @typedef {import('./session-types.js').Assignment} Assignment */
/** @typedef {import('./session-types.js').ExecutionResult} Result */
/** @typedef {{assignmentId:string,inputIdentity:string,leaseId:string,phase:'accepted'|'launched'|'stopped'|'uploaded'|'complete',startedAt:number,result:Result|null,logs:string|null}} Journal */
/** Trusted outer controller. The candidate supplies neither a receipt nor any
 * host command. It executes only through the sealed sandbox port. This local
 * journal retains the same physical name and exact result after response loss;
 * native SQLite remains the authority for work, leases and accepted completion.
 */
export class ManagedRunner {
 /** @param {{client:import('./executor-client.mjs').ExecutorClient,stateDirectory:string,runId:string,sealDigest:string,trustedRunnerDigest:string,now?:()=>number,sleep?:(ms:number)=>Promise<void>,pollMs?:number,createSandbox:(assignment:Assignment,decoded:ReturnType<typeof decodePayload>)=>Promise<{sandbox:import('./podman.mjs').PodmanSandbox,sourceRoot:string}>}} options */
 constructor(options){this.o=options;this.now=options.now??Date.now;this.sleep=options.sleep??delay;this.pollMs=options.pollMs??500;this.root=resolve(options.stateDirectory);requireThat(options.stateDirectory===this.root&&Number.isSafeInteger(this.pollMs)&&this.pollMs>=10&&this.pollMs<=2000,'INVALID_ARGUMENT');digest(options.sealDigest);digest(options.trustedRunnerDigest);}
 /** @param {Assignment} a */
 verifyAssignment(a){id(a.assignmentId);id(a.leaseId);requireThat(a.sessionId===this.o.client.sessionId&&a.runId===this.o.runId&&a.sealDigest===this.o.sealDigest&&a.inputIdentity===recordDigest('dev2.managed-assignment-input.v1',a.input)&&a.assignmentId===recordDigest('dev2.managed-assignment.v1',{attempt:a.input.attempt,profileDigest:a.input.profileDigest}).slice(7),'UNAUTHORIZED','Assignment identity');requireThat(Number.isSafeInteger(a.input.deadline)&&a.input.deadline>0,'INTEGRITY_FAILURE');}
 /** @param {Assignment} a @returns {Promise<Journal|null>} */
 async read(a){await mkdir(this.root,{recursive:true,mode:0o700});requireThat(await realpath(this.root)===this.root,'FORBIDDEN');let bytes;try{bytes=await readFile(join(this.root,a.assignmentId+'.json'));}catch(error){if(error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT')return null;throw error;}const value=/** @type {Journal} */(/** @type {unknown} */(parseRecord(bytes,16777216)));requireThat(value.assignmentId===a.assignmentId&&value.leaseId===a.leaseId&&value.inputIdentity===a.inputIdentity,'INTEGRITY_FAILURE','Retained assignment changed');return value;}
 /** @param {Journal} value */
 async write(value){id(value.assignmentId);const path=join(this.root,value.assignmentId+'.json'),temporary=path+'.'+newId();const file=await open(temporary,'wx',0o600);try{await file.writeFile(canonicalJson(value));await file.sync();}finally{await file.close();}await rename(temporary,path);const directory=await open(this.root,'r');try{await directory.sync();}finally{await directory.close();}}
 /** @param {Assignment} assignment */
 async execute(assignment){const a=structuredClone(assignment);this.verifyAssignment(a);let journal=await this.read(a);
  if(journal?.phase==='complete')return journal.result;
  if(journal?.result){await this.deliver(a,journal);return journal.result;}
  requireThat(['offered','running'].includes(a.state),'STALE_RESULT');
  const bytes=await this.o.client.download(a,a.input.payloadDigest),decoded=decodePayload(bytes,a.input),{profile,execution,source}=decoded.payload;
  requireThat(execution.trustedRunnerDigest===this.o.trustedRunnerDigest&&profile.timeoutMs<=300000&&profile.memoryBytes<=1073741824&&profile.pids<=256&&profile.cpuMillis<=2000&&profile.diskBytes<=536870912&&profile.logBytes<=4194304,'EXECUTION_UNAVAILABLE','Approved execution/resource bound');
  const {sandbox,sourceRoot}=await this.o.createSandbox(a,decoded),physical=physicalAttempt(a),expected={profileDigest:a.input.profileDigest,sourceManifest:a.input.sourceManifest};
  requireThat(await inspectMaterialization(source,sourceRoot)===source.manifestDigest,'INTEGRITY_FAILURE');
  if(!journal){journal={assignmentId:a.assignmentId,inputIdentity:a.inputIdentity,leaseId:a.leaseId,phase:'accepted',startedAt:this.now(),result:null,logs:null};await this.write(journal);}
  const acknowledged=await this.o.client.acknowledge(a);requireThat(acknowledged.assignmentId===a.assignmentId&&acknowledged.leaseId===a.leaseId,'INTEGRITY_FAILURE');
  let state=await sandbox.inspect(physical,expected),cancelled=false,deadlineExceeded=false,lastPoll=0;
  if(state.state==='absent'){
   requireThat(journal.phase==='accepted','EFFECT_UNCERTAIN','A retained launch cannot be replayed from container absence');
   requireThat(this.now()+profile.timeoutMs+profile.killGraceMs<=a.input.deadline,'EXECUTION_UNAVAILABLE','Insufficient remaining assignment lifetime');
   journal.phase='launched';journal.startedAt=this.now();await this.write(journal);
   state=await sandbox.launch(physical,profile,source);
  }
  // A missing response or an uncertain inspect is never permission to remove,
  // restart or replace the retained container. Its autonomous timeout still holds.
  for(;;){
   if(state.state==='exited')break;
   requireThat(state.state!=='absent','EFFECT_UNCERTAIN','Launched container absence is not a completion receipt');
   const now=this.now();deadlineExceeded=deadlineExceeded||now>=Math.min(a.input.deadline,journal.startedAt+profile.timeoutMs);
   if(deadlineExceeded){await sandbox.cancel(physical);cancelled=true;}
   if(now-lastPoll>=2000){lastPoll=now;try{const current=await this.o.client.poll();if(current.cancelRequested||current.assignment?.cancelRequested){cancelled=true;await sandbox.cancel(physical);}else requireThat(current.assignment?.assignmentId===a.assignmentId&&current.assignment.leaseId===a.leaseId,'STALE_RESULT');}catch(error){if(error instanceof Dev2Error&&error.code!=='EXECUTION_UNAVAILABLE'){await sandbox.cancel(physical);throw error;}}}
   requireThat(now<=a.input.deadline+15000,'EFFECT_UNCERTAIN','Stop remains unverified after assignment deadline');
   await this.sleep(this.pollMs);state=await sandbox.inspect(physical,expected);
  }
  const endedAt=this.now();deadlineExceeded=deadlineExceeded||endedAt>journal.startedAt+profile.timeoutMs||endedAt>a.input.deadline;
  let outputDigest;try{outputDigest=await inspectMaterialization(source,sourceRoot);}catch{outputDigest=bytesDigest(Buffer.from('managed source integrity failure'));}
  const logs=await sandbox.call(['logs',attemptName(physical)],Math.min(profile.logBytes,4194304));
  requireThat(!logs.spawnFailed&&!logs.timedOut&&logs.exitCode===0,'EXECUTION_UNAVAILABLE','Container log receipt unavailable');
  journal.logs=Buffer.from(canonicalJson({stdout:logs.stdout.toString('base64'),stderr:logs.stderr.toString('base64'),discardedBytes:logs.discardedBytes})).toString('base64');
  journal.result={assignmentId:a.assignmentId,leaseId:a.leaseId,inputIdentity:a.inputIdentity,sealDigest:a.sealDigest,trustedRunnerDigest:this.o.trustedRunnerDigest,startedAt:journal.startedAt,endedAt,stopped:true,exitCode:state.exitCode,signal:cancelled?'SIGTERM':state.signal,deadlineExceeded,inputDigest:source.manifestDigest,outputDigest,artifacts:[]};
  journal.phase='stopped';await this.write(journal);await this.deliver(a,journal);return journal.result;
 }
 /** Retryable exact result transfer does not execute a candidate a second time.
  * Cancellation can disallow artifact writes; the already verified stop result
  * is still retained and submitted without pretending an artifact was uploaded.
  * @param {Assignment} a @param {Journal} journal */
 async deliver(a,journal){requireThat(journal.result,'INTEGRITY_FAILURE');
  if(journal.phase==='stopped'&&journal.logs&&!journal.result.signal&&!journal.result.deadlineExceeded){const artifact=await this.o.client.upload(a,Buffer.from(journal.logs,'base64'));journal.result.artifacts=[artifact];}
  journal.phase='uploaded';await this.write(journal);const accepted=await this.o.client.complete(journal.result);requireThat(accepted.assignmentId===a.assignmentId&&accepted.inputIdentity===a.inputIdentity&&accepted.state==='complete','INTEGRITY_FAILURE');journal.phase='complete';await this.write(journal);
 }
}
