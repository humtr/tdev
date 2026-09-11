import { setTimeout as delay } from 'node:timers/promises';
import { recordDigest } from '../contracts/canonical.mjs';
import { requireThat } from '../contracts/errors.mjs';
/** @typedef {import('../contracts/ports.js').PreparedResult} Result */
/** @typedef {import('../contracts/ports.js').Attempt} Attempt */
/** @typedef {import('../contracts/ports.js').Profile} Profile */
/** Isolated execution only: run does not possess Git/ref or activation capability.
 * A profile-specific deterministic child attempt is inspectable after response loss.
 */
export class PodmanValidationRunner {
 /** @param {{sandbox:import('../contracts/ports.js').SandboxPort,repository:import('../repository/git.mjs').GitRepository,verify:(attempt:Attempt,tree:import('../contracts/ports.js').SourceTree)=>Promise<string>,now?:()=>number,pollMs?:number}} options */
 constructor(options){this.o=options;this.now=options.now??Date.now;}
 /** @param {Result} result @param {Attempt} parent @param {Profile} profile */
 async run(result,parent,profile){
 const attempt={...parent,attemptId:recordDigest('dev2.profile-attempt.v1',{parent,profile:profile.digest,resultId:result.resultId}).slice(7,39)};
 const source=await this.o.repository.readTree(result.resultTreeOid);requireThat(source.manifestDigest===result.resultTreeSha256,'INTEGRITY_FAILURE');
 const startedAt=this.now();let state=await this.o.sandbox.launch(attempt,profile,source);
 const deadline=startedAt+profile.timeoutMs;let deadlineExceeded=false;
 while(state.state!=='exited'){
  requireThat(state.state==='running'||state.state==='reserved','EFFECT_UNCERTAIN','Container launch/exit uncertain');
  if(this.now()>=deadline){deadlineExceeded=true;state=await this.o.sandbox.cancel(attempt);requireThat(state.state==='exited'||state.state==='absent','EFFECT_UNCERTAIN','Termination not proven');break;}
  await delay(this.o.pollMs??50);state=await this.o.sandbox.inspect(attempt);
 }
 const outputDigest=await this.o.verify(attempt,source);
 return {startedAt,endedAt:this.now(),exitCode:state.exitCode,signal:state.signal,deadlineExceeded,inputDigest:source.manifestDigest,outputDigest};
 }
}
