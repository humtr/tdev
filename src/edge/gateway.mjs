import { canonicalJson } from '../contracts/canonical.mjs';
import { failure } from '../contracts/envelopes.mjs';
import { Dev2Error } from '../contracts/errors.mjs';
import { MAX_REQUEST_BYTES } from '../mcp/limits.mjs';
import { checkEndpoint, decodeMessage, completeMessage, discovery, initialization,
 toolPayload, errorResponse, ProtocolError } from '../mcp/protocol.mjs';
import { TOOL_DESCRIPTORS, SCHEMA_DIGEST, validateOutput } from './contract.mjs';
/** @typedef {import('../contracts/ports.js').Json} Json */
/** @typedef {{[key:string]:Json}} RecordValue */
/** @param {unknown} body @param {number} [status] @param {Record<string,string>} [headers] */
export function jsonResponse(body,status=200,headers={}){
 return new Response(canonicalJson(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','dev2-schema-digest':SCHEMA_DIGEST,...headers}});
}
/** Bounded incremental collection, including bodies without Content-Length.
 * @param {Pick<Request,'headers'|'body'>} request @param {number} [max] */
export async function readBody(request,max=MAX_REQUEST_BYTES){
 const length=request.headers.get('content-length');
 if(length!==null&&(!/^(?:0|[1-9][0-9]*)$/.test(length)||Number(length)>max))throw new ProtocolError(-32600,413,'Request body exceeds limit');
 if(!request.body)return new Uint8Array();
 const reader=request.body.getReader(),chunks=[];let bytes=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;
  if(bytes>max){await reader.cancel().catch(()=>{});throw new ProtocolError(-32600,413,'Request body exceeds limit');}chunks.push(value);
 }}finally{reader.releaseLock();}
 const result=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.byteLength;}return result;
}
/** Every public request authenticates first; transport/device credentials never
 * substitute for a signed human Access assertion here. Cancellation notifications
 * do not cancel durable work. Stateless HTTP returns complete JSON results.
 * @param {{origin:string,allowedOrigins:readonly string[],serverInfo:{name:string,version:string},authenticate:(request:Request)=>Promise<string>,deliver:(request:{tool:string,arguments:Json,assertion:string})=>Promise<Json>}} options
 */
export function createMcpGateway(options){
 /** @param {Request} request */
 return async function fetchMcp(request){
  /** @type {import('../mcp/protocol.mjs').Message|undefined} */let message;
  try{
   checkEndpoint(request.url,request.headers,options);
   const assertion=await options.authenticate(request);
   if(request.method!=='POST')return new Response(null,{status:405,headers:{Allow:'POST','cache-control':'no-store'}});
   if(!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get('content-type')??''))throw new ProtocolError(-32600,415,'Expected application/json');
   const accept=request.headers.get('accept');if(accept&&!accept.split(',').some(v=>/^\s*(?:application\/json|\*\/\*)(?:\s*;.*)?\s*$/i.test(v)))throw new ProtocolError(-32600,406,'JSON response is required');
   message=decodeMessage(await readBody(request),request.headers);
   if(message.notification)return new Response(null,{status:202,headers:{'cache-control':'no-store'}});
   /** @type {RecordValue} */let payload;
   switch(message.method){
    case 'server/discover':payload=discovery(options.serverInfo);break;
    case 'initialize':payload=initialization(options.serverInfo);break;
    case 'tools/list':
     if(message.params.cursor!==undefined)throw new ProtocolError(-32602,400,'The complete tool list has no cursor');
     payload={tools:/** @type {Json} */(/** @type {unknown} */(TOOL_DESCRIPTORS))};break;
    case 'ping':payload={};break;
    case 'tools/call':{
     const name=String(message.params.name);
     if(!TOOL_DESCRIPTORS.some(t=>t.name===name))throw new ProtocolError(-32602,400,'Unknown tool');
     let envelope;
     try{envelope=validateOutput(name,await options.deliver({tool:name,arguments:message.params.arguments??{},assertion}));}
     catch(error){envelope=validateOutput(name,failure(error));}
     payload=toolPayload(envelope);break;
    }
    default:throw new ProtocolError(-32601,404,'Method not found');
   }
   return jsonResponse(completeMessage(message,payload,options.serverInfo),200,{'mcp-protocol-version':message.version});
  }catch(error){
   if(error instanceof Dev2Error&&(error.code==='UNAUTHORIZED'||error.code==='FORBIDDEN')){
    return jsonResponse(failure(error),error.code==='UNAUTHORIZED'?401:403,{'www-authenticate':'Bearer resource_metadata="'+options.origin+'/.well-known/oauth-protected-resource/mcp"'});
   }
   const result=errorResponse(error,message?.id??null,message?.era);return jsonResponse(result.body,result.status);
  }
 };
}
