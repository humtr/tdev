import {FrameAssembler,sendFrames} from '../transport/framing.mjs';
import { RequestRendezvous } from '../transport/rendezvous.mjs';
import { parseRecord, canonicalJson } from '../contracts/canonical.mjs';
import { requireThat } from '../contracts/errors.mjs';
import { failure } from '../contracts/envelopes.mjs';
import { edgeConfig, authenticateDevice } from './auth.mjs';
import { jsonResponse, readBody } from './gateway.mjs';
import { TOOL_DESCRIPTORS, SCHEMA_DIGEST, validateOutput } from './contract.mjs';
/** @typedef {import('./types.js').EdgeSocket} Socket */
/** @typedef {import('./types.js').EdgeEnvironment} Env */
/** @typedef {import('../contracts/ports.js').Json} Json */
/** @typedef {{[key:string]:Json}} RecordValue */
/** @typedef {{credentialDigest:string,connectionId:string,observation:Json|null}} Attachment */
/** Routing-only Durable Object. No SQLite storage, work queue, candidate state,
 * receipt or provider credentials. Hibernation loses only correlations: a resumed
 * socket receives a fresh nonce and the caller recovers through native request IDs.
 */
export class Dev2RendezvousDO {
 /** @param {import('./types.js').DurableContext} ctx @param {Env} env */
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.config=edgeConfig(env);this.rendezvous=new RequestRendezvous();this.assembler=new FrameAssembler({maxMessageBytes:262656});
 /** @type {Socket|null} */this.socket=null;this.connectionId='';
 /** @type {Json|null} */this.observation=null;
 const sockets=ctx.getWebSockets('device');for(const socket of sockets){
  const attachment=/** @type {Attachment|null} */(socket.deserializeAttachment());
  if(!this.socket&&socket.readyState===1&&attachment?.credentialDigest===this.config.deviceCredentialDigest){this.attach(socket,attachment.observation);}
  else{try{socket.close(1008,'Superseded installation connection');}catch{}}
 }
 }
 /** @param {Socket} socket @param {Json|null} [observation] */
 attach(socket,observation=null){
  const old=this.socket;if(old&&old!==socket){try{old.close(1000,'Replaced device connection');}catch{}}
  this.socket=socket;this.observation=observation;this.assembler.dispose();
  this.connectionId=this.rendezvous.attach(message=>{requireThat(socket.readyState===1,'EXECUTION_UNAVAILABLE');sendFrames(message,frame=>socket.send(frame),1049600);});
  socket.serializeAttachment({credentialDigest:this.config.deviceCredentialDigest,connectionId:this.connectionId,observation});
  socket.send(canonicalJson({v:1,kind:'hello',connectionId:this.connectionId,installationId:this.config.installationId,schemaDigest:SCHEMA_DIGEST,
   edge:{versionId:this.env.DEV2_VERSION?.id??null,sourceCommitOid:this.config.sourceCommitOid,bundleDigest:this.config.edgeBundleDigest,schemaDigest:SCHEMA_DIGEST,observedAt:new Date().toISOString()}}));
 }
 /** @param {Request} request */
 async fetch(request){try{
  const path=new URL(request.url).pathname;
  if(path==='/__dev2/device'){
   authenticateDevice(request,this.env,this.config);requireThat(request.method==='GET'&&request.headers.get('upgrade')?.toLowerCase()==='websocket','INVALID_ARGUMENT');
   const host=/** @type {unknown} */(globalThis);
   const Pair=/** @type {{WebSocketPair:new()=>{0:Socket,1:Socket}}} */(host).WebSocketPair;
   const pair=new Pair();this.ctx.acceptWebSocket(pair[1],['device']);this.attach(pair[1]);
   return new Response(null,/** @type {ResponseInit} */(/** @type {unknown} */({status:101,webSocket:pair[0]})));
  }
  if(path==='/__dev2/verify'){
   authenticateDevice(request,this.env,this.config);requireThat(request.method==='POST'&&(await readBody(request,1)).byteLength===0,'INVALID_ARGUMENT');
   const probe=await this.rendezvous.probe();
   return jsonResponse({discovery:{tools:TOOL_DESCRIPTORS},schemaDigest:SCHEMA_DIGEST,edgeVersionId:this.env.DEV2_VERSION?.id??null,probe});
  }
  if(path==='/__dev2/status'){
   authenticateDevice(request,this.env,this.config);requireThat(request.method==='GET','INVALID_ARGUMENT');
   return jsonResponse({installationId:this.config.installationId,deviceId:this.config.deviceId,sourceCommitOid:this.config.sourceCommitOid,
    edgeVersionId:this.env.DEV2_VERSION?.id??null,edgeBundleDigest:this.config.edgeBundleDigest,schemaDigest:SCHEMA_DIGEST,
    route:this.rendezvous.snapshot(),connectionId:this.socket?this.connectionId:null,device:this.observation,
    discovery:{tools:TOOL_DESCRIPTORS}});
  }
  // Fixed human grant preflight is reachable only through the Worker binding after
  // edge assertion verification. It carries no tool/path/grant selector.
  if(path==='/__dev2/authorize'){
   requireThat(request.method==='POST','FORBIDDEN');
   const body=/** @type {RecordValue} */(parseRecord(await readBody(request,17000),17000));
   requireThat(Object.keys(body).length===1&&typeof body.assertion==='string','INVALID_ARGUMENT');
   return jsonResponse(await this.rendezvous.authorize({assertion:body.assertion}));
  }
  // Executor ingress is reachable only through the Worker binding after signed
  // provider-role authentication. It cannot call a human tool or installation probe.
  if(path==='/__dev2/executor'){
   requireThat(request.method==='POST','FORBIDDEN');
   const body=/** @type {RecordValue} */(parseRecord(await readBody(request,164352),164352));
   requireThat(Object.keys(body).length===2&&typeof body.assertion==='string'&&body.arguments!==undefined,'INVALID_ARGUMENT');
   return jsonResponse(await this.rendezvous.executor({arguments:body.arguments,assertion:body.assertion}));
  }
  // Only the Worker binding can reach this named DO. Public paths never proxy here.
  requireThat(path==='/__dev2/dispatch'&&request.method==='POST','FORBIDDEN');
  const body=/** @type {RecordValue} */(parseRecord(await readBody(request),1048576));
  requireThat(Object.keys(body).length===3&&typeof body.tool==='string'&&typeof body.assertion==='string'&&body.arguments!==undefined,'INVALID_ARGUMENT');
  const envelope=await this.rendezvous.request({tool:body.tool,arguments:body.arguments,assertion:body.assertion});
  return jsonResponse(validateOutput(body.tool,envelope));
 }catch(error){return jsonResponse(failure(error));}}
 /** @param {Socket} socket @param {string|ArrayBuffer} message */
 webSocketMessage(socket,message){try{
  if(socket!==this.socket)return;
  requireThat(typeof message==='string','INVALID_ARGUMENT');
  const assembled=this.assembler.feed(message);if(assembled===null)return;message=assembled;
  const frame=/** @type {RecordValue} */(parseRecord(message,262656));
  if(frame.kind==='presence'){
   requireThat(frame.v===1&&Object.keys(frame).length===4,'INVALID_ARGUMENT');
   if(frame.connectionId!==this.connectionId)return; // Hibernation wake may be triggered by an old-nonce heartbeat.
   const body=/** @type {RecordValue} */(frame.body);
   requireThat(body!==null&&typeof body==='object'&&!Array.isArray(body)&&body.schemaDigest===SCHEMA_DIGEST&&Buffer.byteLength(canonicalJson(body))<=32768,'INTEGRITY_FAILURE');
   this.observation=body;socket.serializeAttachment({credentialDigest:this.config.deviceCredentialDigest,connectionId:this.connectionId,observation:body});
   socket.send(canonicalJson({v:1,kind:'ack',connectionId:this.connectionId}));return;
  }
  this.rendezvous.receive(this.connectionId,message);
 }catch{try{socket.close(1008,'Invalid device frame');}catch{}this.webSocketClose(socket);}}
 /** @param {Socket} socket */
 webSocketClose(socket){if(socket===this.socket){this.rendezvous.disconnect(this.connectionId);this.socket=null;this.observation=null;this.assembler.dispose();}}
 /** @param {Socket} socket */
 webSocketError(socket){this.webSocketClose(socket);}
}
