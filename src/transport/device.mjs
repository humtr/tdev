import WebSocket from 'ws';
import { canonicalJson, parseRecord } from '../contracts/canonical.mjs';
import { failure } from '../contracts/envelopes.mjs';
import { requireThat, Dev2Error } from '../contracts/errors.mjs';
import { workersDevOrigin } from '../runtime/environment.mjs';
import { SCHEMA_DIGEST, validateOutput } from '../mcp/outputs.mjs';
import { FrameAssembler, MAX_FRAME_BYTES, sendFrames } from './framing.mjs';
/** @typedef {import('../contracts/ports.js').Json} Json */
/** @typedef {{[key:string]:Json}} RecordValue */
/** @typedef {import('../edge/types.js').DeviceHello} Hello */
/** Authenticated outbound-only device channel. Every routed human assertion is
 * independently verified by invoke. No URL tokens, inbound listener or shell API.
 */
export class DeviceConnection {
 /** @param {{origin:string,installationId:string,secret:string,invoke:(tool:string,args:Json,assertion:string)=>Promise<Json>,authorize?:(assertion:string)=>Promise<Json>,presence:()=>Json,probe?:()=>Promise<Json>,executor?:(args:Json,assertion:string)=>Promise<Json>,onHello?:(hello:Hello)=>void,onState?:(state:{connected:boolean,connectionId:string|null,connectedAt:string|null,lastMessageAt:string|null})=>void,log?:(event:string)=>void,allowInsecureFixture?:boolean,reconnectMs?:number,heartbeatMs?:number}} options */
 constructor(options){this.o=options;if(!options.allowInsecureFixture)workersDevOrigin(options.origin);
  requireThat(options.secret.length>=43,'INVALID_ARGUMENT');this.stopped=true;
  /** @type {WebSocket|null} */this.socket=null;
  /** @type {ReturnType<typeof setTimeout>|null} */this.retry=null;
  /** @type {ReturnType<typeof setInterval>|null} */this.heartbeat=null;
  this.failures=0;this.connectionId='';this.lastMessageAt=0;this.connectedAt=0;
  /** @type {Map<string,Promise<void>>} */this.inflight=new Map();
  this.assembler=new FrameAssembler({maxMessageBytes:1049600});
 }
 start(){if(!this.stopped)return;this.stopped=false;this.connect();}
 state(){this.o.onState?.({connected:!!this.connectionId,connectionId:this.connectionId||null,connectedAt:this.connectedAt?new Date(this.connectedAt).toISOString():null,lastMessageAt:this.lastMessageAt?new Date(this.lastMessageAt).toISOString():null});}
 connect(){if(this.stopped)return;const url=new URL('/__dev2/device',this.o.origin);url.protocol=url.protocol==='https:'?'wss:':'ws:';
  const socket=new WebSocket(url,{headers:{Authorization:'Bearer '+this.o.secret},handshakeTimeout:10000,maxPayload:MAX_FRAME_BYTES,perMessageDeflate:false,followRedirects:false});
  this.socket=socket;this.connectionId='';this.assembler.dispose();
  socket.on('message',(data,isBinary)=>{if(socket!==this.socket)return;try{
   requireThat(!isBinary,'INVALID_ARGUMENT');const encoded=this.assembler.feed(data.toString());if(encoded!==null)this.receive(socket,encoded);
  }catch{socket.close(1008,'Invalid server frame');}});
  socket.on('error',()=>this.o.log?.('connection_error'));
  socket.on('close',()=>{if(socket!==this.socket)return;this.clearConnection();this.o.log?.('disconnected');this.schedule();});
  this.heartbeat=setInterval(()=>{if(socket!==this.socket)return;
   if(!this.connectionId){if(Date.now()-this.lastMessageAt>15000)socket.terminate();return;}
   if(Date.now()-this.lastMessageAt>60000){socket.terminate();return;}
   try{this.presence(socket);}catch{socket.terminate();}
  },this.o.heartbeatMs??20000);
  this.lastMessageAt=Date.now();
 }
 /** @param {WebSocket} socket */
 presence(socket){if(socket.readyState===WebSocket.OPEN&&this.connectionId){requireThat(socket.bufferedAmount<=8388608,'CAPACITY_REJECTED');
  const message=canonicalJson({v:1,kind:'presence',connectionId:this.connectionId,body:this.o.presence()});requireThat(Buffer.byteLength(message)<=32768,'LIMIT_EXCEEDED');socket.send(message);}}
 /** @param {WebSocket} socket @param {string} encoded */
 receive(socket,encoded){const frame=/** @type {RecordValue} */(parseRecord(encoded,1049600));
  requireThat(frame!==null&&typeof frame==='object'&&!Array.isArray(frame)&&frame.v===1,'INVALID_ARGUMENT');
  this.lastMessageAt=Date.now();
  if(frame.kind==='hello'){
   requireThat(frame.installationId===this.o.installationId&&frame.schemaDigest===SCHEMA_DIGEST&&typeof frame.connectionId==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(frame.connectionId),'INTEGRITY_FAILURE');
   this.connectionId=frame.connectionId;this.connectedAt=Date.now();this.failures=0;this.assembler.dispose();this.o.onHello?.(/** @type {Hello} */(/** @type {unknown} */(frame)));this.state();this.presence(socket);this.o.log?.('connected');return;
  }
  requireThat(frame.connectionId===this.connectionId&&this.connectionId.length>0,'FORBIDDEN');
  if(frame.kind==='ack'){requireThat(Object.keys(frame).length===3,'INVALID_ARGUMENT');this.state();return;}
  requireThat(Object.keys(frame).length===4&&typeof frame.correlationId==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(frame.correlationId),'INVALID_ARGUMENT');
  const body=/** @type {RecordValue} */(frame.body);
  requireThat(body!==null&&typeof body==='object'&&!Array.isArray(body),'INVALID_ARGUMENT');
  const probe=body.kind==='installation_read_probe'&&Object.keys(body).length===1,executor=body.kind==='executor',authorization=body.kind==='authorization';
  requireThat(probe?!!this.o.probe:authorization?!!this.o.authorize&&Object.keys(body).length===2&&typeof body.assertion==='string'&&body.assertion.length>0&&body.assertion.length<=16384:Object.keys(body).length===3&&typeof body.assertion==='string'&&body.assertion.length<=(executor?32768:16384)&&body.arguments!==undefined&&(executor||typeof body.tool==='string'),'INVALID_ARGUMENT');
  const connectionId=this.connectionId,correlationId=frame.correlationId,key=connectionId+':'+correlationId;
  if(this.inflight.has(key))return;
  const operation=(async()=>{
   let result;try{
    requireThat(this.inflight.size<32,'CAPACITY_REJECTED','Native request capacity');
    if(executor){requireThat(this.o.executor,'EXECUTION_UNAVAILABLE','Managed endpoint is not installed');result=await this.o.executor(body.arguments,/** @type {string} */(body.assertion));}
    else if(authorization){result=await /** @type {(assertion:string)=>Promise<Json>} */(this.o.authorize)(/** @type {string} */(body.assertion));}
    else result=probe?await /** @type {()=>Promise<Json>} */(this.o.probe)():await this.o.invoke(/** @type {string} */(body.tool),body.arguments,/** @type {string} */(body.assertion));
   }
   catch(error){result=failure(error);}
   try{if(!probe&&!executor&&!authorization)result=validateOutput(/** @type {string} */(body.tool),result);requireThat(Buffer.byteLength(canonicalJson(result))<=262144,'LIMIT_EXCEEDED','Reply bound');}
   catch(error){result=failure(error);}
   if(socket===this.socket&&socket.readyState===WebSocket.OPEN&&connectionId===this.connectionId){
    try{requireThat(socket.bufferedAmount<=8388608,'CAPACITY_REJECTED');sendFrames(canonicalJson({v:1,connectionId,correlationId,body:result}),chunk=>socket.send(chunk),262656);}
    catch{socket.terminate();}
   }
  })();this.inflight.set(key,operation);void operation.finally(()=>this.inflight.delete(key));this.state();
 }
 clearConnection(){if(this.heartbeat)clearInterval(this.heartbeat);this.heartbeat=null;this.assembler.dispose();this.socket=null;this.connectionId='';this.connectedAt=0;this.state();}
 schedule(){if(this.stopped)return;const base=this.o.reconnectMs??500,delay=Math.min(10000,base*2**Math.min(this.failures++,5));
  this.retry=setTimeout(()=>{this.retry=null;this.connect();},Math.floor(delay*(0.75+Math.random()*0.5)));}
 stop(){this.stopped=true;if(this.retry)clearTimeout(this.retry);this.retry=null;const socket=this.socket;this.clearConnection();if(socket)socket.terminate();}
}
