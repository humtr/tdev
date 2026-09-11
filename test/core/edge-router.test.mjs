import test from 'node:test';
import assert from 'node:assert/strict';
import {Dev2RendezvousDO} from '../../src/edge/router.mjs';
import {authenticateDevice} from '../../src/edge/auth.mjs';
import worker from '../../src/edge/worker.mjs';
import {bytesDigest,canonicalJson} from '../../src/contracts/canonical.mjs';
import {SCHEMA_DIGEST,TOOL_DESCRIPTORS} from '../../src/mcp/outputs.mjs';
const secret='fixture-device-secret-'.padEnd(64,'x');
function fixture(){const config={installationId:'fixture',deviceId:'fixture-device',origin:'https://fixture.test.workers.dev',issuer:'https://fixture.cloudflareaccess.com',applicationAudience:'a'.repeat(64),deviceCredentialDigest:bytesDigest(Buffer.from(secret)),allowedOrigins:['https://chatgpt.com'],binding:{installationId:'fixture',repositoryId:'fixture',ref:'refs/heads/dev-2'},grants:[{subject:'fixture',repositoryId:'fixture',capabilities:['repository.read']}],applicationCapabilities:['repository.read'],sourceCommitOid:'sha1:'+'a'.repeat(40),edgeBundleDigest:'sha256:'+'b'.repeat(64)};
 const env={DEV2_CONFIG_JSON:JSON.stringify(config),DEV2_DEVICE_SECRET:secret,DEV2_VERSION:{id:'version-fixture'},DEV2_ROUTER:{idFromName:x=>x,get:()=>({fetch:async()=>{throw Error('Unexpected routed request');}})}};
 return {config,env};}
function socket(attachment){return {readyState:1,attachment,messages:[],closed:false,send(x){this.messages.push(JSON.parse(x));},close(){this.closed=true;this.readyState=3;},serializeAttachment(x){this.attachment=x;},deserializeAttachment(){return this.attachment;}};}
test('routing DO wake rotates nonce without rejecting the old heartbeat that woke it',()=>{
 const {env,config}=fixture(),s=socket({credentialDigest:config.deviceCredentialDigest,connectionId:'old-nonce',observation:null});
 const d=new Dev2RendezvousDO({getWebSockets:()=>[s]},env);const hello=s.messages[0];assert.equal(hello.kind,'hello');assert.notEqual(hello.connectionId,'old-nonce');
 d.webSocketMessage(s,canonicalJson({v:1,kind:'presence',connectionId:'old-nonce',body:{schemaDigest:SCHEMA_DIGEST}}));assert.equal(s.closed,false);assert.equal(s.messages.length,1);
 d.webSocketMessage(s,canonicalJson({v:1,kind:'presence',connectionId:hello.connectionId,body:{schemaDigest:SCHEMA_DIGEST}}));assert.equal(s.closed,false);assert.equal(s.messages[1].kind,'ack');
 assert.equal(s.attachment.connectionId,hello.connectionId);d.webSocketClose(s);
});
test('retired device credential cannot reclaim a hibernated installation route',()=>{
 const {env}=fixture(),s=socket({credentialDigest:'sha256:'+'0'.repeat(64),connectionId:'old',observation:null});
 const d=new Dev2RendezvousDO({getWebSockets:()=>[s]},env);assert.equal(s.closed,true);assert.equal(d.socket,null);
});
test('device authentication is bound to secret digest and exact origin',()=>{
 const {env,config}=fixture();const request=(origin,key)=>new Request(origin+'/__dev2/status',{headers:{authorization:'Bearer '+key}});
 assert.doesNotThrow(()=>authenticateDevice(request(config.origin,secret),env,config));
 assert.throws(()=>authenticateDevice(request(config.origin,'x'.repeat(64)),env,config),{code:'UNAUTHORIZED'});
 assert.throws(()=>authenticateDevice(request('https://other.test.workers.dev',secret),env,config),{code:'FORBIDDEN'});
 assert.throws(()=>authenticateDevice(request(config.origin,secret),{...env,DEV2_DEVICE_SECRET:'rotated'.padEnd(64,'z')},config),{code:'UNAUTHORIZED'});
});
test('fixed installation readback is authenticated and cannot be converted to arbitrary tool execution',async()=>{
 const {env,config}=fixture(),d=new Dev2RendezvousDO({getWebSockets:()=>[]},env);
 const request=(path,method='GET',body)=>new Request(config.origin+path,{method,body,headers:{authorization:'Bearer '+secret}});
 const status=await (await d.fetch(request('/__dev2/status'))).json();assert.deepEqual(status.discovery.tools,TOOL_DESCRIPTORS);
 const attempt=await (await d.fetch(request('/__dev2/verify','POST','{"tool":"dev_work"}'))).json();assert.equal(attempt.ok,false);
 const publicDispatch=await worker.fetch(request('/__dev2/dispatch','POST','{}'),env);assert.equal(publicDispatch.status,404);
 const publicMcp=await worker.fetch(new Request(config.origin+'/mcp',{method:'POST',headers:{authorization:'Bearer '+secret,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})}),env);assert.equal(publicMcp.status,401);
});
