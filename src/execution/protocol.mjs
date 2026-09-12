import {canonicalJson,parseRecord} from '../contracts/canonical.mjs';
import {id,digest} from '../contracts/identity.mjs';
import {requireThat} from '../contracts/errors.mjs';
/** Internal executor channel only. It is not a fifth public MCP tool, a human
 * capability or a generic proxy. Every request still requires a verified OIDC
 * assertion and the selected immutable native session/assignment identity.
 */
export const EXECUTOR_BODY_BYTES=131072;
/** @typedef {import('../contracts/ports.js').Json} Json */
/** @typedef {{apiVersion:1,sessionId:string,op:'poll'|'retire'|'ack'|'object.read'|'artifact.write'|'result.submit',assignmentId?:string,leaseId?:string,digest?:string,offset?:number,maxBytes?:number,size?:number,data?:string,result?:import('./session-types.js').ExecutionResult}} ExecutorRequest */
/** @param {unknown} value @param {readonly string[]} keys @returns {{[key:string]:Json}} */
function object(value,keys){requireThat(value!==null&&typeof value==='object'&&!Array.isArray(value),'INVALID_ARGUMENT');const r=/** @type {{[key:string]:Json}} */(value);requireThat(Object.keys(r).length===keys.length&&keys.every(k=>Object.hasOwn(r,k)),'INVALID_ARGUMENT','Closed executor operation');return r;}
/** @param {unknown} value @param {number} max @param {number} [min] */
function number(value,max,min=0){requireThat(typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max,'INVALID_ARGUMENT');}
/** Canonicalize before use so prototype/accessor/float/duplicate-key behavior is
 * identical at edge and native. Payloads cannot add a tool, path, command or grant.
 * @param {unknown} value @returns {ExecutorRequest} */
export function executorRequest(value){const r=/** @type {{[key:string]:Json}} */(parseRecord(canonicalJson(value),EXECUTOR_BODY_BYTES));requireThat(r&&typeof r==='object'&&!Array.isArray(r)&&r.apiVersion===1&&typeof r.op==='string','INVALID_ARGUMENT');id(r.sessionId);
 const common=['apiVersion','sessionId','op'],assigned=[...common,'assignmentId','leaseId'];
 if(r.op==='poll'||r.op==='retire'){object(r,common);return /** @type {ExecutorRequest} */(/** @type {unknown} */(r));}
 if(r.op==='result.submit'){
  object(r,[...common,'result']);const p=object(r.result,['assignmentId','leaseId','inputIdentity','sealDigest','trustedRunnerDigest','startedAt','endedAt','stopped','exitCode','signal','deadlineExceeded','inputDigest','outputDigest','artifacts']);
  id(p.assignmentId);id(p.leaseId);for(const name of ['inputIdentity','sealDigest','trustedRunnerDigest','inputDigest','outputDigest'])digest(p[name]);
  number(p.startedAt,Number.MAX_SAFE_INTEGER);number(p.endedAt,Number.MAX_SAFE_INTEGER);requireThat(p.stopped===true&&typeof p.deadlineExceeded==='boolean','INVALID_ARGUMENT');if(p.exitCode!==null)number(p.exitCode,255);
  requireThat(p.signal===null||typeof p.signal==='string'&&/^SIG[A-Z0-9]{1,16}$/.test(p.signal),'INVALID_ARGUMENT');requireThat(Array.isArray(p.artifacts)&&p.artifacts.length<=32,'INVALID_ARGUMENT');p.artifacts.forEach(d=>digest(d));
 }else{
  id(r.assignmentId);id(r.leaseId);
  if(r.op==='ack')object(r,assigned);
  else if(r.op==='object.read'){object(r,[...assigned,'digest','offset','maxBytes']);digest(r.digest);number(r.offset,16777216);number(r.maxBytes,65536,1);}
  else if(r.op==='artifact.write'){object(r,[...assigned,'digest','size','offset','data']);digest(r.digest);number(r.offset,16777216);number(r.size,16777216);requireThat(typeof r.data==='string'&&r.data.length<=87384,'LIMIT_EXCEEDED');}
  else requireThat(false,'INVALID_ARGUMENT','Unknown executor operation');
 }
 return /** @type {ExecutorRequest} */(/** @type {unknown} */(r));
}
/** No credentials or assertion are reflected in a retained/public error.
 * @param {Request} request */
export function executorBearer(request){const header=request.headers.get('authorization');requireThat(header&&header.startsWith('Bearer ')&&header.length>7&&header.length<=32775&&!/\s/.test(header.slice(7)),'UNAUTHORIZED');return header.slice(7);}
