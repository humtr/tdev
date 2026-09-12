import {canonicalJson,parseRecord,bytesDigest} from '../contracts/canonical.mjs';
import {id,digest} from '../contracts/identity.mjs';
import {requireThat,Dev2Error} from '../contracts/errors.mjs';
import {executorRequest} from './protocol.mjs';
import {PAYLOAD_BYTES} from './payload.mjs';
/** @typedef {import('../contracts/ports.js').Json} Json */
/** @typedef {import('./session-types.js').Assignment} Assignment */
/** A fixed-origin OIDC executor client, never a repository/provider shell proxy.
 * Retries reuse exact ack/upload/result identity; the caller controls bounded
 * retry scheduling and retains its result until acknowledged.
 */
export class ExecutorClient {
 /** @param {{origin:string,sessionId:string,token:()=>Promise<string>,fetcher?:typeof fetch,allowInsecureFixture?:boolean}} options */
 constructor(options){const origin=new URL(options.origin);requireThat(origin.origin===options.origin&&!origin.username&&!origin.password&&(origin.protocol==='https:'&&origin.hostname.endsWith('.workers.dev')||options.allowInsecureFixture===true&&origin.protocol==='http:'&&['127.0.0.1','localhost'].includes(origin.hostname)),'INVALID_ARGUMENT','Executor origin');this.url=origin.origin+'/executor';this.sessionId=id(options.sessionId);this.token=options.token;this.fetcher=options.fetcher??fetch;this.metrics={requests:0,sentBytes:0,receivedBytes:0};}
 /** @param {unknown} value @returns {Promise<Json>} */
 async call(value){const request=executorRequest(value);requireThat(request.sessionId===this.sessionId,'FORBIDDEN');const body=canonicalJson(request),token=await this.token();requireThat(typeof token==='string'&&token.length>0&&token.length<=32768&&!/\s/.test(token),'UNAUTHORIZED');this.metrics.requests++;this.metrics.sentBytes+=Buffer.byteLength(body);
  let response;try{response=await this.fetcher(this.url,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body,redirect:'error',signal:AbortSignal.timeout(20000)});}catch{throw new Dev2Error('EXECUTION_UNAVAILABLE','Executor transport unavailable; retain the exact assignment');}
  requireThat(response.ok,'EXECUTION_UNAVAILABLE','Executor endpoint HTTP '+response.status);const length=response.headers.get('content-length');requireThat(length===null||/^(0|[1-9][0-9]*)$/.test(length)&&Number(length)<=262144,'LIMIT_EXCEEDED');let size=0;const chunks=[],reader=response.body?.getReader();requireThat(reader,'INTEGRITY_FAILURE');
  try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;requireThat(size<=262144,'LIMIT_EXCEEDED');chunks.push(Buffer.from(part.value));}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  this.metrics.receivedBytes+=size;const result=/** @type {{apiVersion?:number,ok?:boolean,data?:Json,error?:{code?:string}}} */(parseRecord(Buffer.concat(chunks),262144));requireThat(result.apiVersion===1&&result.ok===true&&result.data!==undefined,'EXECUTION_UNAVAILABLE','Executor request was not accepted');return result.data;
 }
 async poll(){return /** @type {{session:import('./session-types.js').Session,assignment:Assignment|null,cancelRequested:boolean}} */(/** @type {unknown} */(await this.call({apiVersion:1,sessionId:this.sessionId,op:'poll'})));}
 /** @param {Assignment} a */
 async acknowledge(a){return /** @type {Assignment} */(/** @type {unknown} */(await this.call({apiVersion:1,sessionId:this.sessionId,op:'ack',assignmentId:a.assignmentId,leaseId:a.leaseId})));}
 /** @param {Assignment} a @param {string} objectDigest */
 async download(a,objectDigest){digest(objectDigest);const parts=[];let offset=0,total=/** @type {number|null} */(null);
  for(;;){const r=/** @type {{digest:string,size:number,offset:number,chunkDigest:string,data:string,complete:boolean}} */(/** @type {unknown} */(await this.call({apiVersion:1,sessionId:this.sessionId,op:'object.read',assignmentId:a.assignmentId,leaseId:a.leaseId,digest:objectDigest,offset,maxBytes:65536})));
   requireThat(r.digest===objectDigest&&Number.isSafeInteger(r.size)&&r.size>=0&&r.size<=PAYLOAD_BYTES&&(total===null||r.size===total)&&r.offset===offset&&typeof r.data==='string'&&r.data.length<=87384&&typeof r.complete==='boolean','INTEGRITY_FAILURE');total=r.size;const bytes=Buffer.from(r.data,'base64');requireThat(bytes.toString('base64')===r.data&&bytesDigest(bytes)===r.chunkDigest&&bytes.length===Math.min(65536,total-offset)&&r.complete===(offset+bytes.length===total),'INTEGRITY_FAILURE');parts.push(bytes);offset+=bytes.length;if(r.complete)break;requireThat(bytes.length>0,'INTEGRITY_FAILURE');
  }
  const bytes=Buffer.concat(parts);requireThat(bytes.length===total&&bytesDigest(bytes)===objectDigest,'INTEGRITY_FAILURE','Downloaded object digest');return bytes;
 }
 /** @param {Assignment} a @param {Uint8Array} value */
 async upload(a,value){requireThat(value.byteLength<=PAYLOAD_BYTES,'LIMIT_EXCEEDED');const bytes=Buffer.from(value),objectDigest=bytesDigest(bytes);let offset=0;
  for(;;){const chunk=bytes.subarray(offset,offset+65536),r=/** @type {{digest:string,received:number,complete:boolean}} */(/** @type {unknown} */(await this.call({apiVersion:1,sessionId:this.sessionId,op:'artifact.write',assignmentId:a.assignmentId,leaseId:a.leaseId,digest:objectDigest,size:bytes.length,offset,data:chunk.toString('base64')})));
   requireThat(r.digest===objectDigest&&Number.isSafeInteger(r.received)&&r.received>=offset+chunk.length&&r.received<=bytes.length&&r.complete===(r.received===bytes.length),'INTEGRITY_FAILURE');offset=r.received;if(r.complete)return objectDigest;requireThat(offset%65536===0,'INTEGRITY_FAILURE');
  }
 }
 /** @param {import('./session-types.js').ExecutionResult} result */
 async complete(result){return /** @type {Assignment} */(/** @type {unknown} */(await this.call({apiVersion:1,sessionId:this.sessionId,op:'result.submit',result})));}
}
