import { createServer } from 'node:http';
import { canonicalJson } from '../contracts/canonical.mjs';
import { requireThat, Dev2Error } from '../contracts/errors.mjs';
import { TOOL_DESCRIPTORS, validateOutput } from './outputs.mjs';
import { MAX_REQUEST_BYTES } from './input-schemas.mjs';
import { checkEndpoint, decodeMessage, completeMessage, errorResponse, discovery, initialization, toolPayload, ProtocolError } from './protocol.mjs';
/** @typedef {import('../contracts/ports.js').Json} Json */
/** @typedef {import('../contracts/ports.js').Principal} Principal */
/** @typedef {{origin:string,issuer:string,allowedOrigins:readonly string[],serverInfo:{name:string,version:string},authenticate:(bearer:string)=>Promise<Principal>,invoke:(principal:Principal,name:string,input:unknown,signal:AbortSignal)=>Promise<{[key:string]:Json}>,maxInflight?:number,bodyTimeoutMs?:number,requestTimeoutMs?:number}} Options */
/** @param {import('node:http').IncomingMessage} req */
function headersFor(req){
 const headers=new Headers();const seen=new Set();
 for(let i=0;i<req.rawHeaders.length;i+=2){const name=req.rawHeaders[i].toLowerCase(),value=req.rawHeaders[i+1];
  if(['authorization','host','content-length','content-type','mcp-protocol-version','mcp-method','mcp-name','origin'].includes(name)){if(seen.has(name))throw new ProtocolError(-32600,400,'Duplicate security header');seen.add(name);}
  headers.append(name,value);
 }
 return headers;
}
/** @param {import('node:http').IncomingMessage} req @param {number} timeoutMs */
async function body(req,timeoutMs){
 const parts=[];let size=0;const declared=req.headers['content-length'];
 if(declared!==undefined){const value=Number(declared);if(!Number.isSafeInteger(value)||value<0||value>MAX_REQUEST_BYTES)throw new ProtocolError(-32600,413,'Request body exceeds limit');}
 const timer=setTimeout(()=>req.destroy(),timeoutMs);
 try{for await(const raw of req){const chunk=Buffer.from(raw);size+=chunk.length;if(size>MAX_REQUEST_BYTES)throw new ProtocolError(-32600,413,'Request body exceeds limit');parts.push(chunk);}return Buffer.concat(parts);}
 finally{clearTimeout(timer);}
}
/** @param {import('node:http').ServerResponse} res @param {number} status @param {unknown} value */
function send(res,status,value){
 if(res.destroyed||res.writableEnded)return;
 const encoded=canonicalJson(value);requireThat(Buffer.byteLength(encoded)<=2097152,'LIMIT_EXCEEDED','Encoded HTTP response budget');
 res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(encoded);
}
/** Installation-supplied trusted configuration; no credential or host path is
 * accepted from tool arguments. Connections and authentication are never sessions
 * owning work. Client disconnect only aborts observation, not durable admission.
 * @param {Options} options
 */
export function createMcpServer(options){
 const configured=new URL(options.origin),issuer=new URL(options.issuer);
 requireThat(configured.origin===options.origin&&issuer.protocol==='https:'&&!issuer.username&&!issuer.password&&!issuer.hash&&!issuer.search,'INVALID_ARGUMENT','Exact OAuth resource/issuer configuration');
 requireThat(configured.protocol==='https:'||(configured.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(configured.hostname)),'FORBIDDEN','Cleartext MCP is loopback only');
 const maxInflight=options.maxInflight??128;requireThat(Number.isSafeInteger(maxInflight)&&maxInflight>0,'INVALID_ARGUMENT');
 const metadataUrl=options.origin+'/.well-known/oauth-protected-resource/mcp';let inflight=0;
 const server=createServer({maxHeaderSize:16384,requireHostHeader:true},async(req,res)=>{
  const controller=new AbortController();const disconnect=()=>controller.abort();req.once('aborted',disconnect);res.once('close',disconnect);
  let admitted=false;/** @type {ReturnType<typeof decodeMessage>|null} */let message=null;
  const deadline=setTimeout(()=>{controller.abort();if(!res.writableEnded)res.destroy();},options.requestTimeoutMs??60000);
  try{
   const headers=headersFor(req);const requestPath=req.url??'/';
   if(!requestPath.startsWith('/')||requestPath.startsWith('//'))throw new ProtocolError(-32600,403,'Invalid request target');
   const url=new URL(requestPath,options.origin);
   // Well-known resource metadata is public, but never reflects untrusted host/proxy headers.
   if(req.method==='GET'&&['/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp'].includes(url.pathname)){
    checkEndpoint(options.origin+'/mcp',headers,options);if(url.search||url.hash)throw new ProtocolError(-32600,400,'Invalid metadata request');
    send(res,200,{resource:options.origin+'/mcp',authorization_servers:[options.issuer],bearer_methods_supported:['header']});return;
   }
   checkEndpoint(url.href,headers,options);
   const authorization=headers.get('authorization');const match=authorization?/^Bearer ([A-Za-z0-9._~+\/-]+=*)$/i.exec(authorization):null;
   let principal;
   try{if(!match)throw new Dev2Error('UNAUTHORIZED');principal=await options.authenticate(match[1]);if(!principal||principal.expiresAt<=Date.now())throw new Dev2Error('UNAUTHORIZED');}
   catch{res.setHeader('www-authenticate','Bearer resource_metadata="'+metadataUrl+'", error="invalid_token"');send(res,401,{error:'unauthorized'});return;}
   if(req.method!=='POST'){res.setHeader('allow','POST');send(res,405,{error:'method_not_allowed'});return;}
   if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(headers.get('content-type')??'')||!['identity',''].includes(headers.get('content-encoding')??''))throw new ProtocolError(-32600,415,'JSON request body required');
   const accept=headers.get('accept')??'';if(!accept.split(',').some(v=>/^(application\/json|\*\/\*)(?:\s*;|\s*$)/i.test(v.trim())))throw new ProtocolError(-32600,406,'JSON response is not accepted');
   if(inflight>=maxInflight){res.setHeader('retry-after','1');send(res,429,{error:'capacity_rejected'});return;}inflight++;admitted=true;
   message=decodeMessage(await body(req,options.bodyTimeoutMs??30000),headers);
   if(message.notification){res.writeHead(202,{'cache-control':'no-store'});res.end();return;}
   /** @type {{[key:string]:Json}} */let payload;
   switch(message.method){
    case 'server/discover':payload=discovery(options.serverInfo);break;
    case 'initialize':payload=initialization(options.serverInfo);break;
    case 'ping':payload={};break;
    case 'tools/list':
     if(message.params.cursor!==undefined)throw new ProtocolError(-32602,400,'Tool list is not paginated');
     payload={tools:TOOL_DESCRIPTORS};break;
    case 'tools/call':{
     const name=String(message.params.name);if(!TOOL_DESCRIPTORS.some(t=>t.name===name))throw new ProtocolError(-32602,400,'Unknown tool');
     const output=await options.invoke(principal,name,message.params.arguments??{},controller.signal);
     payload=toolPayload(validateOutput(name,output));break;
    }
    default:throw new ProtocolError(-32601,404,'Method not found');
   }
   if(!controller.signal.aborted)send(res,200,completeMessage(message,payload,options.serverInfo));
  }catch(error){const response=errorResponse(error,message?.id??null,message?.era);if(!controller.signal.aborted)try{send(res,response.status,response.body);}catch{res.destroy();}}
  finally{clearTimeout(deadline);if(admitted)inflight--;req.removeListener('aborted',disconnect);res.removeListener('close',disconnect);}
 });
 server.headersTimeout=10000;server.requestTimeout=options.bodyTimeoutMs??30000;server.keepAliveTimeout=5000;server.maxHeadersCount=64;server.maxConnections=256;
 return server;
}
