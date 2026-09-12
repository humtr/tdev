import {createServer} from 'node:http';
import {randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
import {lstat,realpath,open,rename,readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {canonicalJson,parseRecord} from '../contracts/canonical.mjs';
import {Dev2Error,ERROR_CODES,requireThat} from '../contracts/errors.mjs';
/** @typedef {import('../contracts/ports.js').Json} Json */
/** @typedef {'helper'|'native'} Role */
/** @typedef {'helper.status'|'stage.reconcile'|'stage.upload'|'activation.begin'|'activation.observe'|'native.status'|'native.drain'} Operation */
/** @typedef {{schemaVersion:1,role:Role,host:'127.0.0.1',port:number,nonce:string}} Endpoint */
/** @typedef {Partial<Record<Operation,(input:Json)=>Promise<Json>>>} Handlers */
const LIMIT=524288,TTL=20000;
/** @type {Record<Role,readonly Operation[]>} */
const OPERATIONS={helper:['helper.status','stage.reconcile','stage.upload','activation.begin','activation.observe'],native:['native.status','native.drain']};
/** @param {unknown} value @returns {Record<string,Json>} */
function object(value){requireThat(value!==null&&typeof value==='object'&&!Array.isArray(value),'INVALID_ARGUMENT');return /** @type {Record<string,Json>} */(value);}
/** @param {unknown} value @param {string[]} fields */
function closed(value,fields){const v=object(value);requireThat(Object.keys(v).sort().join(',')===[...fields].sort().join(','),'INVALID_ARGUMENT');return v;}
/** @param {Uint8Array} key @param {Role} role @param {'request'|'response'} direction @param {string} text */
function mac(key,role,direction,text){return createHmac('sha256',key).update('dev2.private-rpc.v1\0'+role+'\0'+direction+'\0').update(text).digest('hex');}
/** @param {unknown} actual @param {string} expected */
function authenticate(actual,expected){requireThat(typeof actual==='string'&&/^[0-9a-f]{64}$/.test(actual)&&timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(expected,'hex')),'UNAUTHORIZED');}
/** @param {unknown} value @param {Role} role @returns {Endpoint} */
function endpoint(value,role){const e=closed(value,['schemaVersion','role','host','port','nonce']);requireThat(e.schemaVersion===1&&e.role===role&&e.host==='127.0.0.1'&&typeof e.port==='number'&&Number.isInteger(e.port)&&e.port>0&&e.port<=65535&&typeof e.nonce==='string'&&/^[0-9a-f]{64}$/.test(e.nonce),'INTEGRITY_FAILURE');return /** @type {Endpoint} */(/** @type {unknown} */(e));}
/** Private endpoint files never contain keys. A stale file is allowed to fail;
 * the client does not scan ports, follow URLs or substitute another instance.
 * @param {string} filename @param {Role} role */
export async function readPrivateEndpoint(filename,role){requireThat(resolve(filename)===filename&&await realpath(dirname(filename))===dirname(filename),'FORBIDDEN');const before=await lstat(filename);requireThat(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&(before.mode&0o077)===0&&before.uid===process.getuid?.()&&before.size<=4096,'FORBIDDEN');const data=await readFile(filename),after=await lstat(filename);requireThat(before.ino===after.ino&&before.dev===after.dev&&before.mtimeMs===after.mtimeMs&&before.size===data.length&&after.size===data.length,'INTEGRITY_FAILURE');return endpoint(parseRecord(data,4096),role);}
/** @param {string} filename @param {Endpoint} value */
async function publishEndpoint(filename,value){requireThat(resolve(filename)===filename&&await realpath(dirname(filename))===dirname(filename),'FORBIDDEN');const temporary=filename+'.'+randomBytes(16).toString('hex');const f=await open(temporary,'wx',0o600);try{await f.writeFile(canonicalJson(value));await f.sync();}finally{await f.close();}await rename(temporary,filename);const d=await open(dirname(filename),'r');try{await d.sync();}finally{await d.close();}}
/** Role-specific fixed-vocabulary loopback transport; semantic authorization and
 * durable effect dedup live in the selected native/helper operation handlers.
 * @param {{role:Role,filename:string,key:Uint8Array,handlers:Handlers,now?:()=>number}} options */
export async function servePrivateControl(options){const {role,filename,key,handlers}=options,now=options.now??Date.now;requireThat(key.byteLength===32&&Object.hasOwn(OPERATIONS,role)&&Object.keys(handlers).every(k=>OPERATIONS[role].includes(/** @type {Operation} */(k))),'INVALID_ARGUMENT');let active=0;
 const nonce=randomBytes(32).toString('hex');
 const server=createServer(async(req,res)=>{
  if(active>=32){res.writeHead(503).end();return;}active++;
  try{
   requireThat(req.method==='POST'&&req.url==='/'&&req.headers['content-type']==='application/json','UNAUTHORIZED');
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;requireThat(size<=LIMIT,'LIMIT_EXCEEDED');chunks.push(Buffer.from(chunk));}
   const text=Buffer.concat(chunks).toString('utf8');authenticate(req.headers['x-dev2-private-mac'],mac(key,role,'request',text));
   const q=closed(parseRecord(text,LIMIT),['schemaVersion','role','serverNonce','requestId','issuedAt','expiresAt','operation','input']);
   requireThat(q.schemaVersion===1&&q.role===role&&q.serverNonce===nonce&&typeof q.requestId==='string'&&/^[0-9a-f]{32}$/.test(q.requestId)&&typeof q.issuedAt==='number'&&Number.isSafeInteger(q.issuedAt)&&typeof q.expiresAt==='number'&&Number.isSafeInteger(q.expiresAt)&&q.issuedAt<=now()+2000&&q.expiresAt>now()&&q.expiresAt-q.issuedAt>0&&q.expiresAt-q.issuedAt<=TTL,'UNAUTHORIZED');
   requireThat(typeof q.operation==='string'&&OPERATIONS[role].includes(/** @type {Operation} */(q.operation)),'FORBIDDEN');
   const handler=handlers[/** @type {Operation} */(q.operation)];requireThat(handler,'EXECUTION_UNAVAILABLE');
   let output=null,errorCode=null;try{output=await handler(q.input);}catch(error){errorCode=error instanceof Dev2Error?error.code:'EXECUTION_UNAVAILABLE';}
   const response=canonicalJson({schemaVersion:1,requestId:q.requestId,serverNonce:nonce,ok:errorCode===null,output,errorCode});requireThat(Buffer.byteLength(response)<=LIMIT,'LIMIT_EXCEEDED');
   res.writeHead(200,{'content-type':'application/json','x-dev2-private-mac':mac(key,role,'response',response)}).end(response);
  }catch(error){if(!res.headersSent)res.writeHead(error instanceof Dev2Error&&error.code==='LIMIT_EXCEEDED'?413:403,{'content-type':'application/json'});res.end('{"error":"private_control_rejected"}');}finally{active--;}
 });
 server.requestTimeout=TTL;server.headersTimeout=5000;server.keepAliveTimeout=1000;
 await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>done(undefined));});
 const address=server.address();requireThat(address&&typeof address!=='string','INTEGRITY_FAILURE');const binding=endpoint({schemaVersion:1,role,host:'127.0.0.1',port:address.port,nonce},role);
 try{await publishEndpoint(filename,binding);}catch(error){server.close();throw error;}
 return {binding,async close(){server.closeIdleConnections();await new Promise((done,reject)=>server.close(error=>error?reject(error):done(undefined)));}};
}
/** A timeout is uncertain transport delivery, never permission to invent another
 * action/effect ID. Callers reconcile via the same semantic identity.
 * @param {{filename:string,role:Role,key:Uint8Array,operation:Operation,input:Json,timeoutMs?:number,now?:()=>number}} options */
export async function privateControl(options){const {filename,role,key,operation,input}=options,timeoutMs=options.timeoutMs??15000,now=options.now??Date.now;requireThat(key.byteLength===32&&OPERATIONS[role].includes(operation)&&Number.isInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=TTL,'INVALID_ARGUMENT');
 const e=await readPrivateEndpoint(filename,role),requestId=randomBytes(16).toString('hex'),issuedAt=now(),text=canonicalJson({schemaVersion:1,role,serverNonce:e.nonce,requestId,issuedAt,expiresAt:issuedAt+timeoutMs,operation,input});requireThat(Buffer.byteLength(text)<=LIMIT,'LIMIT_EXCEEDED');
 let response;try{response=await fetch('http://127.0.0.1:'+e.port+'/',{method:'POST',redirect:'error',signal:AbortSignal.timeout(timeoutMs),headers:{'content-type':'application/json','x-dev2-private-mac':mac(key,role,'request',text)},body:text});}catch{throw new Dev2Error('EXECUTION_UNAVAILABLE','Private control response unavailable',{delivery:'unknown'});}
 requireThat(response.status===200,'UNAUTHORIZED','Private control rejected request');const reader=response.body?.getReader();requireThat(reader,'INTEGRITY_FAILURE');const chunks=[];let size=0;try{for(;;){const p=await reader.read();if(p.done)break;size+=p.value.length;requireThat(size<=LIMIT,'LIMIT_EXCEEDED');chunks.push(Buffer.from(p.value));}}finally{await reader.cancel();}
 const body=Buffer.concat(chunks).toString('utf8');authenticate(response.headers.get('x-dev2-private-mac'),mac(key,role,'response',body));const r=closed(parseRecord(body,LIMIT),['schemaVersion','requestId','serverNonce','ok','output','errorCode']);requireThat(r.schemaVersion===1&&r.requestId===requestId&&r.serverNonce===e.nonce&&typeof r.ok==='boolean','INTEGRITY_FAILURE');
 if(!r.ok){requireThat(typeof r.errorCode==='string'&&ERROR_CODES.includes(r.errorCode)&&r.output===null,'INTEGRITY_FAILURE');throw new Dev2Error(r.errorCode,'Private operation rejected');}requireThat(r.errorCode===null,'INTEGRITY_FAILURE');return r.output;
}
