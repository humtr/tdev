import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {generateKeyPair,SignJWT} from 'jose';
import {engineWorld} from '../fixtures/engine-world.mjs';
import {bearerVerifier,ScopedAuthorization} from '../../src/security/authorization.mjs';
import {createMcpServer} from '../../src/mcp/http.mjs';
import {MODERN_VERSION,LEGACY_VERSION} from '../../src/mcp/protocol.mjs';
const issuer='https://issuer.invalid',origin='https://dev2.invalid';
async function setup(options={}){
 const w=await engineWorld(options);const {privateKey,publicKey}=await generateKeyPair('ES256');
 const issue=async(audience=origin+'/mcp',subject='controller')=>new SignJWT({scope:'repository.read work.write profile.run integration.write policy.write runtime.activate'}).setProtectedHeader({alg:'ES256'}).setIssuer(issuer).setAudience(audience).setSubject(subject).setIssuedAt().setExpirationTime('10m').sign(privateKey);
 const token=await issue();const verify=bearerVerifier({issuer,audience:origin+'/mcp',algorithms:['ES256']},async()=>publicKey);
 const authenticated=await verify('Bearer '+token);Object.assign(w.principal,authenticated);
 const grant={subject:authenticated.subject,installationId:w.binding.installationId,repositoryId:'self',ref:w.binding.ref,capabilities:['repository.read','work.write','profile.run','integration.write','policy.write','runtime.activate'],paths:[''],deniedPaths:['secret']};
 const grants=[grant];const auth=new ScopedAuthorization({issuer,audience:origin+'/mcp',bindings:()=>[w.binding],grants:()=>grants});
 w.authorization.authorize=auth.authorize.bind(auth);
 const config={origin,issuer,allowedOrigins:['https://chatgpt.com'],serverInfo:{name:'dev-2-fixture',version:'fixture'},authenticate:bearer=>verify('Bearer '+bearer),invoke:(p,name,args,signal)=>w.app.invoke(p,name,args,signal)};
 const server=createMcpServer(config);server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;let id=0;
 function start({method='POST',body='',headers={}}={}){
  let req;const response=new Promise((resolve,reject)=>{
   req=http.request({hostname:'127.0.0.1',port,path:'/mcp',method,headers:{host:'dev2.invalid',authorization:'Bearer '+token,'content-type':'application/json',accept:'application/json, text/event-stream',...headers}},res=>{let text='';res.on('data',b=>{text+=b.toString();});res.on('end',()=>{let json=null;try{json=JSON.parse(text);}catch{}resolve({status:res.statusCode,headers:res.headers,text,json});});});req.once('error',reject);req.end(body);
  });return {response,abort:()=>req.destroy()};
 }
 function request(method,params={},extra={}){
  const envelope={jsonrpc:'2.0',id:++id,method,params:{...params,_meta:{'io.modelcontextprotocol/protocolVersion':MODERN_VERSION,'io.modelcontextprotocol/clientCapabilities':{}}}};
  return start({body:JSON.stringify(envelope),headers:{'mcp-protocol-version':MODERN_VERSION,'mcp-method':method,...(method==='tools/call'?{'mcp-name':params.name}:{}),...extra}}).response;
 }
 const call=(name,args)=>request('tools/call',{name,arguments:args});
 async function close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await w.close();}
 return {...w,config,server,port,token,issue,grants,start,request,call,close};
}
function result(response){assert.equal(response.status,200,response.text);assert.equal(response.json.result.resultType,'complete');return response.json.result.structuredContent;}
test('authenticated real HTTP four-tool loop performs progressive edit, required validation and exact integration',async()=>{
 const w=await setup();try{
  const tools=await w.request('tools/list');assert.equal(tools.status,200);assert.equal(tools.json.result.tools.length,4);assert.ok(tools.json.result.tools.every(t=>t.inputSchema&&t.outputSchema));
  const context=result(await w.call('dev_context',{apiVersion:1}));assert.equal(context.ok,true);assert.equal(context.data.snapshot.commitOid,w.baseHead);
  const snapshot=context.data.snapshot.snapshotId;
  const read=result(await w.call('dev_read',{apiVersion:1,target:{snapshotId:snapshot,freshness:'current'},queries:[{kind:'list',path:''},{kind:'file',path:'a.txt'}]}));assert.equal(read.ok,true);assert.equal(read.data.results[1].content,'alpha\n');
  const create={op:'create',requestId:'http_create',snapshotId:snapshot,expectedHead:w.baseHead,objective:'HTTP-native exact source change',initialEdits:[{kind:'put',path:'new/unknown-context.txt',mode:'100644',expectedEntry:'absent',content:'actual source bytes',encoding:'utf8'}]};
  const batch=result(await w.call('dev_work',{apiVersion:1,items:[{...create,requestId:'bad',shell:'not allowed'},create]}));assert.equal(batch.ok,true);assert.equal(batch.data.items[0].error.code,'INVALID_ARGUMENT');assert.equal(batch.data.items[1].ok,true);
  const created=batch.data.items[1].receipt;let observed=result(await w.call('dev_observe',{apiVersion:1,selector:{workIds:[created.workId]}}));let work=observed.data.works[0];
  const validate={op:'validate',requestId:'http_validate',workId:work.workId,expectedRevision:work.revision,generation:work.generation,expectedHead:w.baseHead,policyDigest:w.binding.policyDigest};
  const accepted=result(await w.call('dev_work',{apiVersion:1,items:[validate],waitMs:20000}));const actionId=accepted.data.items[0].receipt.actionId;
  await w.finish([actionId]);observed=result(await w.call('dev_observe',{apiVersion:1,selector:{actionIds:[actionId]}}));assert.equal(observed.data.actions[0].status,'succeeded');assert.equal(observed.data.results[0].validation.eligible,true);work=observed.data.works[0];
  const integrate={op:'integrate',requestId:'http_integrate',workId:work.workId,expectedRevision:work.revision,generation:work.generation,expectedHead:w.baseHead,policyDigest:w.binding.policyDigest,preparedResultId:observed.data.results[0].resultId};
  const integrated=result(await w.call('dev_work',{apiVersion:1,items:[integrate],waitMs:20000}));const integrateId=integrated.data.items[0].receipt.actionId;await w.finish([integrateId]);
  const terminal=result(await w.call('dev_observe',{apiVersion:1,selector:{requestIds:['http_integrate']}}));assert.equal(terminal.data.actions[0].status,'succeeded');assert.equal(terminal.data.works[0].disposition,'integrated');assert.equal(terminal.data.results[0].integration.kind,'integrated');
  const head=terminal.data.results[0].commitOid;const current=result(await w.call('dev_context',{apiVersion:1}));assert.equal(current.data.snapshot.commitOid,head);
  const content=result(await w.call('dev_read',{apiVersion:1,target:{snapshotId:current.data.snapshot.snapshotId,freshness:'current'},queries:[{kind:'file',path:'new/unknown-context.txt'}]}));assert.equal(content.data.results[0].content,'actual source bytes');
  assert.equal(w.validationRuns.length,1);assert.equal(w.profileRuns.length,2);assert.equal(w.sends.length,1);
  const replay=result(await w.call('dev_work',{apiVersion:1,items:[integrate]}));assert.equal(replay.data.items[0].receipt.actionId,integrateId);assert.equal(replay.data.items[0].receipt.deduplicated,true);assert.equal(w.sends.length,1);
 }finally{await w.close();}
});
test('authentication, origin, method, body and protocol boundaries fail before effects',async()=>{
 const w=await setup();try{
  assert.equal((await w.start({headers:{authorization:''}}).response).status,401);
  const wrong=await w.issue('https://other.invalid/mcp');assert.equal((await w.request('tools/list',{}, {authorization:'Bearer '+wrong})).status,401);
  assert.equal((await w.request('tools/list',{}, {origin:'https://attacker.invalid'})).status,403);
  assert.equal((await w.request('tools/list',{}, {host:'attacker.invalid'})).status,403);
  for(const method of ['GET','DELETE'])assert.equal((await w.start({method}).response).status,405);
  assert.equal((await w.start({body:'{}',headers:{'content-type':'text/plain'}}).response).status,415);
  assert.equal((await w.start({body:'x'.repeat(1048577)}).response).status,413);
  const unknown=await w.request('unknown/method');assert.equal(unknown.status,404);assert.equal(unknown.json.error.code,-32601);
  const mismatch=await w.request('tools/list',{}, {'mcp-method':'tools/call'});assert.equal(mismatch.status,400);assert.equal(mismatch.json.error.code,-32020);
  assert.equal(w.ledger.transact(tx=>tx.all('SELECT * FROM action').length),0);
  const legacy=await w.start({body:JSON.stringify({jsonrpc:'2.0',id:'legacy',method:'initialize',params:{protocolVersion:LEGACY_VERSION,capabilities:{},clientInfo:{name:'fixture',version:'1'}}})}).response;
  assert.equal(legacy.status,200);assert.equal(legacy.json.result.protocolVersion,LEGACY_VERSION);assert.equal(legacy.json.result.resultType,undefined);
  const ready=await w.start({body:JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'}),headers:{'mcp-protocol-version':LEGACY_VERSION}}).response;assert.equal(ready.status,202);assert.equal(ready.text,'');
  const list=await w.start({body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list'}),headers:{'mcp-protocol-version':LEGACY_VERSION}}).response;assert.equal(list.json.result.tools.length,4);
 }finally{await w.close();}
});
test('read-only grants and closed output checks are enforced by actual HTTP composition',async()=>{
 const w=await setup();try{
  const context=result(await w.call('dev_context',{apiVersion:1}));w.grants[0].capabilities=['repository.read'];
  const denied=result(await w.call('dev_work',{apiVersion:1,items:[{op:'create',requestId:'denied',snapshotId:context.data.snapshot.snapshotId,expectedHead:w.baseHead,objective:'not authorized'}]}));assert.equal(denied.data.items[0].error.code,'FORBIDDEN');assert.equal(w.ledger.transact(tx=>tx.all('SELECT * FROM work').length),0);
  const prior=w.config.invoke;w.config.invoke=async()=>({apiVersion:1,ok:false,error:{code:'FORBIDDEN',message:'FORBIDDEN',retry:{sameRequest:false,afterMs:null},facts:{}},secret:'never expose'});
  const invalid=await w.call('dev_context',{apiVersion:1});assert.equal(invalid.status,500);assert.equal(invalid.text.includes('never expose'),false);w.config.invoke=prior;
 }finally{await w.close();}
});
test('HTTP disconnect aborts waiting, not the admitted durable work or its retry identity',async()=>{
 const gate=Promise.withResolvers(),entered=Promise.withResolvers();let block=true;
 const w=await setup({beforeRun:async()=>{if(block){entered.resolve();await gate.promise;}}});
 try{
  const created=await w.create('create','disconnect.txt','continue after transport loss');const work=await w.engine.work(w.principal,created.workId);
  const item={op:'integrate',requestId:'disconnect_integrate',workId:work.workId,expectedRevision:work.revision,generation:work.generation,expectedHead:w.baseHead,policyDigest:w.binding.policyDigest};
  const envelope={jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'dev_work',arguments:{apiVersion:1,items:[item],waitMs:20000},_meta:{'io.modelcontextprotocol/protocolVersion':MODERN_VERSION,'io.modelcontextprotocol/clientCapabilities':{}}}};
  const request=w.start({body:JSON.stringify(envelope),headers:{'mcp-protocol-version':MODERN_VERSION,'mcp-method':'tools/call','mcp-name':'dev_work'}});request.response.catch(()=>{});
  await entered.promise;request.abort();block=false;gate.resolve();
  const action=w.ledger.transact(tx=>tx.lookupRequest(w.principal.subject,w.binding.bindingEpoch,item.requestId));const [terminal]=await w.finish([action.actionId]);assert.equal(terminal.status,'succeeded');assert.equal(w.engine.cancelled(action.actionId),false);
  const replay=result(await w.call('dev_work',{apiVersion:1,items:[item]}));assert.equal(replay.data.items[0].receipt.actionId,action.actionId);assert.equal(w.sends.length,1);
 }finally{block=false;gate.resolve();await w.close();}
});
