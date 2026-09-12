import {executorRequest} from './protocol.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {failure} from '../contracts/envelopes.mjs';
/** @typedef {import('../contracts/ports.js').Json} Json */
/** Authenticated trusted controller endpoint. Native launch selection and OIDC
 * verification precede every ledger/object access. An executor never submits a
 * human operation, command, canonical Git effect, grant or arbitrary object path.
 */
export class ExecutorEndpoint {
 /** @param {{sessions:import('./sessions.mjs').ManagedSessions,transfer:import('./session-transfer.mjs').AssignmentTransfer,verify:(token:string,sessionId:string)=>Promise<import('./session-types.js').AuthenticatedExecutor>,wake?:()=>void}} options */
 constructor(options){this.o=options;}
 /** @param {unknown} value @param {string} assertion @returns {Promise<Json>} */
 async invoke(value,assertion){try{
  const request=executorRequest(value);requireThat(typeof assertion==='string'&&assertion.length>0&&assertion.length<=32768,'UNAUTHORIZED');
  const identity=await this.o.verify(assertion,request.sessionId);requireThat(identity.sessionId===request.sessionId,'UNAUTHORIZED');
  const sessions=this.o.sessions;
  if(request.op==='poll'){const current=sessions.current(identity);return /** @type {Json} */(/** @type {unknown} */({apiVersion:1,ok:true,data:current}));}
  const auth={identity,assignmentId:request.assignmentId??'',leaseId:request.leaseId??''};
  let data;
  if(request.op==='ack')data=sessions.acknowledge(identity,auth.assignmentId,auth.leaseId);
  else if(request.op==='object.read')data=await this.o.transfer.read(auth,{digest:request.digest??'',offset:request.offset??-1,maxBytes:request.maxBytes??0});
  else if(request.op==='artifact.write')data=await this.o.transfer.upload(auth,{digest:request.digest??'',size:request.size??-1,offset:request.offset??-1,data:request.data??''});
  else{requireThat(request.result,'INVALID_ARGUMENT');data=sessions.complete(identity,request.result);this.o.wake?.();}
  return /** @type {Json} */(/** @type {unknown} */({apiVersion:1,ok:true,data}));
 }catch(error){return failure(error);}}
}
