import {createHmac,timingSafeEqual} from 'node:crypto';
import {canonicalJson,recordDigest} from '../contracts/canonical.mjs';
import {digest,newId} from '../contracts/identity.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {checkProductionProof,productionBinding,productionBindingEligible} from './production-binding.mjs';
/** @typedef {import('../contracts/ports.js').PreparedResult} Result */
/** @typedef {import('../contracts/ports.js').ValidationReceipt} Receipt */
/** @typedef {import('../contracts/ports.js').Profile} Profile */
/** @typedef {import('../contracts/ports.js').Attempt} Attempt */
/** @typedef {{startedAt:number,endedAt:number,exitCode:number|null,signal:string|null,deadlineExceeded:boolean,inputDigest:string,outputDigest:string,productionProof?:import('./production-binding.mjs').Proof}} Run */
/** Stable legacy identity preserves historical source-integration receipts. The
 * production binding below additionally MACs the entire immutable prepared result.
 * @param {Result} result */
export function validationIdentity(result){return recordDigest('dev2.validation-identity.v1',{repositoryId:result.repositoryId,bindingEpoch:result.bindingEpoch,resultId:result.resultId,baseHead:result.expectedHead,commitOid:result.commitOid,resultTreeOid:result.resultTreeOid,resultTreeSha256:result.resultTreeSha256,policyDigest:result.policyDigest,...result.execution});}
/** @param {Uint8Array} key @param {Omit<Receipt,'signature'>} receipt */
function signature(key,receipt){return 'sha256:'+createHmac('sha256',key).update('dev2.validation-receipt.v1\0'+canonicalJson(receipt)).digest('hex');}
/** @param {Receipt} receipt */
function unsigned(receipt){const {signature:ignored,...record}=receipt;return record;}
/** A private production enrollment is a required extra gate, not a caller hint.
 * The composed run obtains and joins exact native outer execution evidence. It
 * never accepts a candidate supplied receipt or uses a child exit as a seal.
 */
export class RequiredValidation {
 /** @param {{key:Uint8Array,profiles:readonly Profile[],execution:import('../contracts/ports.js').ExecutionIdentity,run:(result:Result,attempt:Attempt,profile:Profile)=>Promise<Run>,productionEnrollment?:string,now?:()=>number}} options */
 constructor(options){requireThat(options.key.byteLength>=32,'INVALID_ARGUMENT','Receipt key strength');this.key=Uint8Array.from(options.key);this.profiles=structuredClone(options.profiles);this.execution=structuredClone(options.execution);this.run=options.run;this.now=options.now??Date.now;this.productionEnrollment=options.productionEnrollment??null;if(this.productionEnrollment)digest(this.productionEnrollment);
 requireThat(this.profiles.length>0&&new Set(this.profiles.map(p=>p.digest)).size===this.profiles.length&&canonicalJson(this.profiles.map(p=>p.digest))===canonicalJson(options.execution.orderedProfileDigests),'INVALID_ARGUMENT','Complete ordered mandatory profile list');}
 /** @param {Result} result @param {Attempt} attempt @returns {Promise<Receipt>} */
 async validate(result,attempt){
 requireThat(canonicalJson(result.execution)===canonicalJson(this.execution)&&result.repositoryId===attempt.repositoryId&&result.workId===attempt.workId,'STALE_RESULT');const startedAt=this.now();
 /** @type {import('../contracts/ports.js').ProfileOutcome[]} */const outcomes=[];
 /** @type {import('./production-binding.mjs').Proof[]} */const proofs=[];
 let exitCode=0,signal=/** @type {string|null} */(null),deadlineExceeded=false,inputDigest=result.resultTreeSha256,outputDigest=result.resultTreeSha256;
 for(const profile of this.profiles){const run=await this.run(result,attempt,profile);for(const value of [run.startedAt,run.endedAt])requireThat(Number.isSafeInteger(value)&&value>=0,'INTEGRITY_FAILURE');requireThat(run.endedAt>=run.startedAt,'INTEGRITY_FAILURE');
  let productionPassed=true;if(this.productionEnrollment){requireThat(run.productionProof,'VALIDATION_FAILED','Production execution has no joined outer receipt');const p=checkProductionProof(run.productionProof);requireThat(p.profileDigest===profile.digest&&p.sealDigest===this.productionEnrollment,'INTEGRITY_FAILURE','Unexpected production execution enrollment');proofs.push(structuredClone(p));productionPassed=p.eligible;}
  const passed=productionPassed&&run.exitCode===0&&run.signal===null&&!run.deadlineExceeded&&run.inputDigest===result.resultTreeSha256&&run.outputDigest===result.resultTreeSha256;
  outcomes.push({profileDigest:profile.digest,status:passed?'passed':run.deadlineExceeded||run.signal?'cancelled':'failed',exitCode:run.exitCode});if(!passed)exitCode=1;if(run.signal)signal=run.signal;deadlineExceeded||=run.deadlineExceeded;if(run.inputDigest!==result.resultTreeSha256)inputDigest=run.inputDigest;if(run.outputDigest!==result.resultTreeSha256)outputDigest=run.outputDigest;
 }
 const extra=this.productionEnrollment?{productionJson:productionBinding(result,attempt,this.productionEnrollment,proofs)}:{};
 const body={validationId:validationIdentity(result),resultId:result.resultId,runId:newId(),attempt:structuredClone(attempt),startedAt,endedAt:this.now(),exitCode,signal,deadlineExceeded,outcomes,inputDigest,outputDigest,...extra};return {...body,signature:signature(this.key,body)};
 }
 /** Current process owner may change after a completed validated execution; the
 * signed original attempt identity does not. Pending callbacks are separately
 * fenced by their native assignment owner before any receipt can be produced.
 * @param {Result} result @param {Receipt} receipt @param {string} currentPolicy @param {string} ownerEpoch */
 async eligible(result,receipt,currentPolicy,ownerEpoch){try{digest(receipt.signature);const expected=Buffer.from(signature(this.key,unsigned(receipt)).slice(7),'hex'),actual=Buffer.from(receipt.signature.slice(7),'hex');if(!timingSafeEqual(expected,actual))return false;
  if(this.productionEnrollment?!productionBindingEligible(result,receipt.attempt,this.productionEnrollment,receipt.productionJson):receipt.productionJson!==undefined)return false;
  return result.policyDigest===currentPolicy&&canonicalJson(result.execution)===canonicalJson(this.execution)&&receipt.validationId===validationIdentity(result)&&receipt.resultId===result.resultId&&receipt.attempt.repositoryId===result.repositoryId&&receipt.attempt.workId===result.workId&&receipt.exitCode===0&&receipt.signal===null&&!receipt.deadlineExceeded&&receipt.inputDigest===result.resultTreeSha256&&receipt.outputDigest===result.resultTreeSha256&&Number.isSafeInteger(receipt.startedAt)&&Number.isSafeInteger(receipt.endedAt)&&receipt.endedAt>=receipt.startedAt&&receipt.outcomes.length===this.profiles.length&&receipt.outcomes.every((o,i)=>o.profileDigest===this.profiles[i].digest&&o.status==='passed'&&o.exitCode===0);
 }catch{return false;}}
}
