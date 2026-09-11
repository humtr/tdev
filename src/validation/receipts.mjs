import { createHmac, timingSafeEqual } from 'node:crypto';
import { canonicalJson, recordDigest } from '../contracts/canonical.mjs';
import { digest, newId } from '../contracts/identity.mjs';
import { requireThat } from '../contracts/errors.mjs';
/** @typedef {import('../contracts/ports.js').PreparedResult} Result */
/** @typedef {import('../contracts/ports.js').ValidationReceipt} Receipt */
/** @typedef {import('../contracts/ports.js').Profile} Profile */
/** @typedef {import('../contracts/ports.js').Attempt} Attempt */
/** @typedef {{startedAt:number,endedAt:number,exitCode:number|null,signal:string|null,deadlineExceeded:boolean,inputDigest:string,outputDigest:string}} Run */
/** Exact result identity, independent of action that later consumes this receipt.
 * @param {Result} result */
export function validationIdentity(result){return recordDigest('dev2.validation-identity.v1',{repositoryId:result.repositoryId,bindingEpoch:result.bindingEpoch,resultId:result.resultId,baseHead:result.expectedHead,commitOid:result.commitOid,resultTreeOid:result.resultTreeOid,resultTreeSha256:result.resultTreeSha256,policyDigest:result.policyDigest,...result.execution});}
/** Authentication covers every receipt field; candidate scripts never receive key.
 * @param {Uint8Array} key @param {Omit<Receipt,'signature'>} receipt */
function signature(key,receipt){return 'sha256:'+createHmac('sha256',key).update('dev2.validation-receipt.v1\0'+canonicalJson(receipt)).digest('hex');}
/** @param {Receipt} receipt */
function unsigned(receipt){const {signature:ignored,...record}=receipt;return record;}
/** Trusted runner orchestration. A successful child exit alone is not sufficient.
 * run must obtain the actual container/process exit and verify materialized bytes.
 * It is an installation-composed port, never a callback loaded from repository code.
 */
export class RequiredValidation {
 /** @param {{key:Uint8Array,profiles:readonly Profile[],execution:import('../contracts/ports.js').ExecutionIdentity,run:(result:Result,attempt:Attempt,profile:Profile)=>Promise<Run>,now?:()=>number}} options */
 constructor(options){requireThat(options.key.byteLength>=32,'INVALID_ARGUMENT','Receipt key strength');this.key=Uint8Array.from(options.key);this.profiles=structuredClone(options.profiles);this.execution=structuredClone(options.execution);this.run=options.run;this.now=options.now??Date.now;
 requireThat(this.profiles.length>0&&new Set(this.profiles.map(p=>p.digest)).size===this.profiles.length&&canonicalJson(this.profiles.map(p=>p.digest))===canonicalJson(options.execution.orderedProfileDigests),'INVALID_ARGUMENT','Complete ordered mandatory profile list');}
 /** @param {Result} result @param {Attempt} attempt @returns {Promise<Receipt>} */
 async validate(result,attempt){
 requireThat(canonicalJson(result.execution)===canonicalJson(this.execution)&&result.repositoryId===attempt.repositoryId&&result.workId===attempt.workId,'STALE_RESULT');
 const startedAt=this.now();
 /** @type {import('../contracts/ports.js').ProfileOutcome[]} */
 const outcomes=[];
 let exitCode=0,signal=/** @type {string|null} */(null),deadlineExceeded=false,inputDigest=result.resultTreeSha256,outputDigest=result.resultTreeSha256;
 for(const profile of this.profiles){
  const run=await this.run(result,attempt,profile);for(const value of [run.startedAt,run.endedAt])requireThat(Number.isSafeInteger(value)&&value>=0,'INTEGRITY_FAILURE');requireThat(run.endedAt>=run.startedAt,'INTEGRITY_FAILURE');
  const passed=run.exitCode===0&&run.signal===null&&!run.deadlineExceeded&&run.inputDigest===result.resultTreeSha256&&run.outputDigest===result.resultTreeSha256;
  outcomes.push({profileDigest:profile.digest,status:passed?'passed':run.deadlineExceeded||run.signal?'cancelled':'failed',exitCode:run.exitCode});
  if(!passed)exitCode=1;if(run.signal)signal=run.signal;deadlineExceeded||=run.deadlineExceeded;
  if(run.inputDigest!==result.resultTreeSha256)inputDigest=run.inputDigest;if(run.outputDigest!==result.resultTreeSha256)outputDigest=run.outputDigest;
 }
 const body={validationId:validationIdentity(result),resultId:result.resultId,runId:newId(),attempt:structuredClone(attempt),startedAt,endedAt:this.now(),exitCode,signal,deadlineExceeded,outcomes,inputDigest,outputDigest};return {...body,signature:signature(this.key,body)};
 }
 /** @param {Result} result @param {Receipt} receipt @param {string} currentPolicy @param {string} ownerEpoch */
 async eligible(result,receipt,currentPolicy,ownerEpoch){
 try{
  digest(receipt.signature);const expected=Buffer.from(signature(this.key,unsigned(receipt)).slice(7),'hex'),actual=Buffer.from(receipt.signature.slice(7),'hex');
  if(!timingSafeEqual(expected,actual))return false;
  return result.policyDigest===currentPolicy&&canonicalJson(result.execution)===canonicalJson(this.execution)&&receipt.validationId===validationIdentity(result)&&receipt.resultId===result.resultId&&receipt.attempt.repositoryId===result.repositoryId&&receipt.attempt.workId===result.workId&&receipt.attempt.ownerEpoch===ownerEpoch&&receipt.exitCode===0&&receipt.signal===null&&!receipt.deadlineExceeded&&receipt.inputDigest===result.resultTreeSha256&&receipt.outputDigest===result.resultTreeSha256&&Number.isSafeInteger(receipt.startedAt)&&Number.isSafeInteger(receipt.endedAt)&&receipt.endedAt>=receipt.startedAt&&receipt.outcomes.length===this.profiles.length&&receipt.outcomes.every((o,i)=>o.profileDigest===this.profiles[i].digest&&o.status==='passed'&&o.exitCode===0);
 }catch{return false;}
 }
}
