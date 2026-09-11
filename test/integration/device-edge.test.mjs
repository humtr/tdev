import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {WebSocketServer} from 'ws';
import {DeviceConnection} from '../../src/transport/device.mjs';
import {RequestRendezvous} from '../../src/transport/rendezvous.mjs';
import {FrameAssembler,sendFrames} from '../../src/transport/framing.mjs';
import {createMcpGateway} from '../../src/edge/gateway.mjs';
import {SCHEMA_DIGEST,TOOL_DESCRIPTORS} from '../../src/mcp/outputs.mjs';
import {Dev2Error} from '../../src/contracts/errors.mjs';
import {canonicalJson} from '../../src/contracts/canonical.mjs';
import {engineWorld} from '../fixtures/engine-world.mjs';
async function until(condition){const end=Date.now()+6000;while(Date.now()<end){if(condition())return;await delay(10);}throw Error('Connection deadline');}
async function connection(w){
 const key='fixture-device-key-'.padEnd(64,'x'),rendezvous=new RequestRendezvous({deadlineMs:4000}),server=new WebSocketServer({host:'127.0.0.1',port:0,maxPayload:65536,verifyClient:({req})=>req.headers.authorization==='Bearer '+key});await once(server,'listening');
 let latest=null,connections=0;
 server.on('connection',socket=>{connections++;latest=socket;const assembler=new FrameAssembler({maxMessageBytes:262656});
  const nonce=rendezvous.attach(message=>sendFrames(message,f=>socket.send(f),1049600));
  socket.send(canonicalJson({v:1,kind:'hello',connectionId:nonce,installationId:'fixture-installation',schemaDigest:SCHEMA_DIGEST,edge:{versionId:'fixture-version',sourceCommitOid:w.baseHead,bundleDigest:w.binding.policyDigest,schemaDigest:SCHEMA_DIGEST,observedAt:new Date().toISOString()}}));
  socket.on('message',bytes=>{const encoded=assembler.feed(bytes.toString());if(encoded===null)return;const frame=JSON.parse(encoded);
   if(frame.kind==='presence'){socket.send(canonicalJson({v:1,kind:'ack',connectionId:nonce}));return;}
   rendezvous.receive(nonce,encoded);
  });socket.on('close',()=>{assembler.dispose();rendezvous.disconnect(nonce);});
 });
 const device=new DeviceConnection({origin:'http://127.0.0.1:'+server.address().port,installationId:'fixture-installation',secret:key,allowInsecureFixture:true,reconnectMs:10,heartbeatMs:500,
  invoke:async(tool,args,assertion)=>{if(assertion!=='signed-fixture-human')throw new Dev2Error('UNAUTHORIZED');return w.app.invoke(w.principal,tool,args);},presence:()=>({schemaDigest:SCHEMA_DIGEST}),probe:async()=>({summary:{ok:true,authenticationMode:'fixture-installation-probe',humanOAuth:false}})});
 device.start();await until(()=>!!device.connectionId);
 return {device,rendezvous,get socket(){return latest;},get connections(){return connections;},async close(){device.stop();for(const socket of server.clients)socket.terminate();await new Promise(resolve=>server.close(resolve));}};
}
test('real WebSocket routes context/read/admission/candidate/preparation/observation and survives reconnect',async()=>{
 const w=await engineWorld();w.engine.o.executionAvailable=()=>false;const c=await connection(w);
 const call=(tool,args)=>c.rendezvous.request({tool,arguments:args,assertion:'signed-fixture-human'});
 try{
  const context=await call('dev_context',{apiVersion:1,repository:'self'});assert.equal(context.ok,true,canonicalJson(context));assert.equal(context.data.snapshot.commitOid,w.baseHead);
  const read=await call('dev_read',{apiVersion:1,target:{snapshotId:context.data.snapshot.snapshotId,freshness:'current'},queries:[{kind:'file',path:'AGENTS.md'}],maxReturnBytes:65536});assert.equal(read.ok,true);assert.match(read.data.results[0].content,/authority/);
  const request={apiVersion:1,items:[{op:'create',requestId:'ws-create',snapshotId:context.data.snapshot.snapshotId,expectedHead:w.baseHead,objective:'Editable after Refresh',initialEdits:[{kind:'put',path:'new.txt',mode:'100644',expectedEntry:'absent',content:'x'.repeat(90000),encoding:'utf8'}]}]};
  const admission=await call('dev_work',request);assert.equal(admission.ok,true,canonicalJson(admission));assert.equal(admission.data.items[0].ok,true,canonicalJson(admission));const receipt=admission.data.items[0].receipt;
  const nonce=c.device.connectionId;c.socket.terminate();await until(()=>c.connections===2&&c.device.connectionId&&c.device.connectionId!==nonce);
  const retry=await call('dev_work',request);assert.equal(retry.data.items[0].receipt.actionId,receipt.actionId);assert.equal(retry.data.items[0].receipt.deduplicated,true);
  const open=await call('dev_observe',{apiVersion:1,selector:{requestIds:['ws-create']}});assert.equal(open.ok,true);const work=open.data.works[0];assert.equal(work.workId,receipt.workId);
  const candidate=await call('dev_read',{apiVersion:1,target:{workId:work.workId,generation:work.generation},queries:[{kind:'file',path:'new.txt',maxBytes:100000}]});assert.equal(candidate.ok,true,canonicalJson(candidate));assert.equal(candidate.data.results[0].content.length,90000);
  const validation=await call('dev_work',{apiVersion:1,items:[{op:'validate',requestId:'ws-validate',workId:work.workId,expectedRevision:work.revision,generation:work.generation,expectedHead:w.baseHead,policyDigest:w.binding.policyDigest}],waitMs:3000});assert.equal(validation.ok,true,canonicalJson(validation));
  const observed=await call('dev_observe',{apiVersion:1,selector:{requestIds:['ws-validate']}});assert.equal(observed.ok,true,canonicalJson(observed));assert.equal(observed.data.actions[0].status,'failed');assert.equal(observed.data.actions[0].errorCode,'EXECUTION_UNAVAILABLE');assert.equal(observed.data.results.length,1);assert.equal(observed.data.effects.length,0);assert.equal(w.sends.length,0);assert.equal(w.profileRuns.length,0);
  const denied=await c.rendezvous.request({tool:'dev_work',arguments:request,assertion:'device-key-is-not-a-human'});assert.equal(denied.ok,false);assert.equal(denied.error.code,'UNAUTHORIZED');
  const probe=await c.rendezvous.probe();assert.equal(probe.summary.humanOAuth,false);
 }finally{await c.close();await w.close();}
});
test('MCP gateway publishes exact four tools, enforces human authentication and rejects old names',async()=>{
 const w=await engineWorld();let authenticated=0,delivered=0;
 const gateway=createMcpGateway({origin:'https://tdev.test.workers.dev',allowedOrigins:['https://chatgpt.com'],serverInfo:{name:'dev-2',version:'fixture'},
  authenticate:async request=>{authenticated++;if(request.headers.get('cf-access-jwt-assertion')!=='verified-fixture')throw new Dev2Error('UNAUTHORIZED');return 'verified-fixture';},
  deliver:async body=>{delivered++;return w.app.invoke(w.principal,body.tool,body.arguments);}});
 const request=(method,params={},extra={})=>new Request('https://tdev.test.workers.dev/mcp',{method:'POST',headers:{'content-type':'application/json','mcp-protocol-version':'2025-11-25','cf-access-jwt-assertion':'verified-fixture',...extra},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
 try{
  const list=await gateway(request('tools/list'));assert.equal(list.status,200);assert.deepEqual((await list.json()).result.tools,TOOL_DESCRIPTORS);assert.equal(delivered,0);
  const denied=await gateway(request('tools/list',{}, {'cf-access-jwt-assertion':'','authorization':'Bearer device-secret'}));assert.equal(denied.status,401);assert.equal(delivered,0);
  const old=await gateway(request('tools/call',{name:'submit_operation',arguments:{}}));assert.equal(old.status,400);assert.equal(delivered,0);
  const result=await gateway(request('tools/call',{name:'dev_context',arguments:{apiVersion:1}}));assert.equal(result.status,200);const body=await result.json();assert.equal(body.result.structuredContent.ok,true);assert.equal(delivered,1);
  const origin=await gateway(request('tools/list',{}, {origin:'https://attacker.invalid'}));assert.equal(origin.status,403);
  assert.ok(authenticated>=4);
 }finally{await w.close();}
});
