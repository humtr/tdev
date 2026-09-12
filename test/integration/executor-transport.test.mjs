import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {WebSocketServer} from 'ws';
import {DeviceConnection} from '../../src/transport/device.mjs';
import {RequestRendezvous} from '../../src/transport/rendezvous.mjs';
import {FrameAssembler,sendFrames} from '../../src/transport/framing.mjs';
import {canonicalJson} from '../../src/contracts/canonical.mjs';
import {SCHEMA_DIGEST} from '../../src/mcp/outputs.mjs';
import {executorRequest} from '../../src/execution/protocol.mjs';
import {Dev2Error} from '../../src/contracts/errors.mjs';
async function until(check){const end=Date.now()+5000;while(!check()){assert.ok(Date.now()<end,'connection deadline');await delay(10);}}
test('real outbound socket routes bounded executor operations separately and recovers the same assignment after reconnect',async()=>{
 const key='fixture-device-key'.padEnd(64,'x'),server=new WebSocketServer({host:'127.0.0.1',port:0,maxPayload:65536,verifyClient:({req})=>req.headers.authorization==='Bearer '+key});await once(server,'listening');
 const rendezvous=new RequestRendezvous({deadlineMs:2000});let current=null,connections=0,humanCalls=0,executorCalls=0,lose=false;const retained=new Map();
 server.on('connection',socket=>{current=socket;connections++;const assembler=new FrameAssembler({maxMessageBytes:262656}),nonce=rendezvous.attach(message=>sendFrames(message,frame=>socket.send(frame),1049600));socket.send(canonicalJson({v:1,kind:'hello',connectionId:nonce,installationId:'i',schemaDigest:SCHEMA_DIGEST}));socket.on('message',bytes=>{const message=assembler.feed(bytes.toString());if(message===null)return;const frame=JSON.parse(message);if(frame.kind==='presence'){socket.send(canonicalJson({v:1,kind:'ack',connectionId:nonce}));return;}if(lose){lose=false;socket.terminate();return;}rendezvous.receive(nonce,message);});socket.on('close',()=>rendezvous.disconnect(nonce));});
 const device=new DeviceConnection({origin:'http://127.0.0.1:'+server.address().port,installationId:'i',secret:key,allowInsecureFixture:true,reconnectMs:10,heartbeatMs:500,presence:()=>({schemaDigest:SCHEMA_DIGEST}),invoke:async()=>{humanCalls++;throw new Dev2Error('UNAUTHORIZED');},executor:async(args,assertion)=>{executorCalls++;assert.equal(assertion,'signed-executor-fixture');const request=executorRequest(args),id=request.assignmentId??'none';if(!retained.has(id))retained.set(id,{apiVersion:1,ok:true,data:{assignmentId:id,leaseId:request.leaseId??'none',received:request.data?.length??0}});return retained.get(id);}});
 try{
  device.start();await until(()=>!!device.connectionId);
  const body={apiVersion:1,sessionId:'s',op:'artifact.write',assignmentId:'a',leaseId:'lease',digest:'sha256:'+'1'.repeat(64),offset:0,size:65536,data:Buffer.alloc(65536,42).toString('base64')};
  const call=()=>rendezvous.executor({arguments:body,assertion:'signed-executor-fixture'});
  lose=true;await assert.rejects(call(),{code:'EXECUTION_UNAVAILABLE'});await until(()=>connections>=2&&!!device.connectionId);const recovered=await call();assert.equal(recovered.data.assignmentId,'a');assert.equal(recovered.data.received,body.data.length);assert.equal(retained.size,1);assert.equal(executorCalls,2);assert.equal(humanCalls,0);
  delete device.o.executor;const unavailable=await call();assert.equal(unavailable.ok,false);assert.equal(unavailable.error.code,'EXECUTION_UNAVAILABLE');assert.equal(humanCalls,0);assert.ok(device.connectionId);
  await assert.rejects(rendezvous.request({tool:'executor',arguments:body,assertion:'signed-executor-fixture'}),{code:'INVALID_ARGUMENT'});
 }finally{device.stop();rendezvous.dispose();for(const socket of server.clients)socket.terminate();await new Promise(resolve=>server.close(resolve));}
});
