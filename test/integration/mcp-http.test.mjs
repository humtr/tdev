import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {once} from 'node:events';
import {createMcpServer} from '../../src/mcp/http.mjs';
import {success,failure} from '../../src/contracts/envelopes.mjs';
import {Dev2Error} from '../../src/contracts/errors.mjs';
import {SCHEMA_DIGEST} from '../../src/mcp/outputs.mjs';
import {MODERN_VERSION as V,LEGACY_VERSION as L} from '../../src/mcp/protocol.mjs';
const digest='sha256:'+'a'.repeat(64),principal={subject:'fixture',issuer:'https://issuer.example.invalid',audience:'fixture',expiresAt:4102444800000};
async function fixture(invoke){
 const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
 const origin='http://127.0.0.1:'+port;
 const server=createMcpServer({origin,issuer:principal.issuer,allowedOrigins:['https://chatgpt.com'],serverInfo:{name:'dev-2-fixture',version:'0'},authenticate:async token=>{if(token!=='fixture-token')throw new Error('private-token');return principal;},invoke:invoke??(async()=>failure(new Dev2Error('STALE_BASE')))});
 server.listen(port,'127.0.0.1');await once(server,'listening');
 return {origin,server,close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})};
}
function message(method='tools/list',fields={}){return {jsonrpc:'2.0',id:1,method,params:{...fields,_meta:{'io.modelcontextprotocol/protocolVersion':V,'io.modelcontextprotocol/clientCapabilities':{}}}};}
async function post(world,m,override={}){
 const headers={'authorization':'Bearer fixture-token','content-type':'application/json','accept':'application/json, text/event-stream','mcp-protocol-version':V,'mcp-method':m.method};if(m.method==='tools/call')headers['mcp-name']=m.params.name;
 const r=await fetch(world.origin+'/mcp',{method:'POST',headers:{...headers,...override},body:JSON.stringify(m)});return {status:r.status,headers:r.headers,body:r.status===202?null:await r.json()};
}
test('real loopback HTTP discovers exactly four tools, supports modern/legacy and never emits a work session',async()=>{
 const w=await fixture();try{
  const listed=await post(w,message());assert.equal(listed.status,200);assert.equal(listed.body.result.tools.length,4);assert.equal(listed.body.result.resultType,'complete');assert.equal(listed.headers.get('mcp-session-id'),null);assert.ok(listed.body.result.tools.every(t=>t.outputSchema));
  const discover=await post(w,message('server/discover'));assert.equal(discover.body.result.supportedVersions.includes(V),true);
  const init={jsonrpc:'2.0',id:'legacy',method:'initialize',params:{protocolVersion:L,capabilities:{},clientInfo:{name:'fixture',version:'0'}}};const legacy=await post(w,init,{'mcp-protocol-version':L});assert.equal(legacy.body.result.protocolVersion,L);assert.equal(legacy.body.result.resultType,undefined);
  const initialized=await post(w,{jsonrpc:'2.0',method:'notifications/initialized'},{'mcp-protocol-version':L});assert.equal(initialized.status,202);assert.equal(initialized.body,null);
 }finally{await w.close();}
});
test('authentication, origin, method, content negotiation and header mismatches reject before invocation',async()=>{
 let calls=0;const w=await fixture(async()=>{calls++;throw new Error('not reached');});try{
  const unauth=await post(w,message(),{authorization:'Bearer wrong'});assert.equal(unauth.status,401);assert.ok(unauth.headers.get('www-authenticate').includes('resource_metadata='));assert.equal(JSON.stringify(unauth.body).includes('private'),false);
  assert.equal((await post(w,message(),{origin:'https://attacker.invalid'})).status,403);
  assert.equal((await post(w,message(),{accept:'application/json;q=0, text/event-stream'})).status,406);
  assert.equal((await post(w,message(),{'content-type':'text/plain'})).status,415);
  assert.equal((await post(w,message(),{'mcp-method':'wrong'})).body.error.code,-32020);
  const get=await fetch(w.origin+'/mcp',{headers:{authorization:'Bearer fixture-token'}});assert.equal(get.status,405);
  const metadata=await fetch(w.origin+'/.well-known/oauth-protected-resource/mcp');assert.equal(metadata.status,200);assert.equal((await metadata.json()).resource,w.origin+'/mcp');
  assert.equal(calls,0);
 }finally{await w.close();}
});
test('domain failure is a complete tool result and invalid domain output fails closed',async()=>{
 const w=await fixture();try{const r=await post(w,message('tools/call',{name:'dev_read',arguments:{}}));assert.equal(r.status,200);assert.equal(r.body.result.isError,true);assert.equal(r.body.result.structuredContent.error.code,'STALE_BASE');}finally{await w.close();}
 const invalid=await fixture(async()=>({apiVersion:1,ok:true,data:{private:'secret'},observedAt:'2026-09-11T00:00:00.000Z',runtime:{releaseId:digest,schemaDigest:SCHEMA_DIGEST}}));try{const r=await post(invalid,message('tools/call',{name:'dev_read',arguments:{}}));assert.equal(r.status,500);assert.equal(JSON.stringify(r.body).includes('secret'),false);}finally{await invalid.close();}
});
test('oversized and malformed requests cause no tool effect and readable IDs survive protocol errors',async()=>{
 let calls=0;const w=await fixture(async()=>{calls++;return failure(new Dev2Error('INVALID_ARGUMENT'));});try{
  const r=await post(w,message('tools/call',{name:'dev_work',arguments:{large:'x'.repeat(1048576)}}));assert.equal(r.status,413);
  const malformed=await post(w,{...message(),id:'readable',params:null});assert.equal(malformed.status,400);assert.equal(malformed.body.id,'readable');assert.equal(calls,0);
 }finally{await w.close();}
});
test('a dropped response aborts observation but not an already admitted domain effect',async()=>{
 const entered=Promise.withResolvers(),finish=Promise.withResolvers();let committed=0,aborted=false;
 const w=await fixture(async(p,name,input,signal)=>{committed++;entered.resolve();await finish.promise;aborted=signal.aborted;return failure(new Dev2Error('STALE_BASE'));});
 try{const m=message('tools/call',{name:'dev_work',arguments:{}});const call=request(w.origin+'/mcp',{method:'POST',headers:{authorization:'Bearer fixture-token','content-type':'application/json',accept:'application/json','mcp-protocol-version':V,'mcp-method':'tools/call','mcp-name':'dev_work'}});call.on('error',()=>{});call.end(JSON.stringify(m));await entered.promise;call.destroy();await new Promise(r=>setTimeout(r,20));finish.resolve();await new Promise(r=>setTimeout(r,20));assert.equal(committed,1);assert.equal(aborted,true);}finally{finish.resolve();await w.close();}
});
