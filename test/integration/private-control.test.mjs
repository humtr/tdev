import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomBytes,createHmac} from 'node:crypto';
import {servePrivateControl,privateControl,readPrivateEndpoint} from '../../src/release/private-rpc.mjs';
import {canonicalJson} from '../../src/contracts/canonical.mjs';import {Dev2Error} from '../../src/contracts/errors.mjs';
async function world(){const root=await mkdtemp(join(tmpdir(),'dev2-private-control-')),filename=join(root,'endpoint.json'),key=randomBytes(32);let calls=0;const handlers={'helper.status':async input=>{calls++;return {echo:input};},'activation.begin':async()=>{throw new Dev2Error('STALE_RELEASE','sensitive private message');}};const server=await servePrivateControl({role:'helper',filename,key,handlers});return {root,filename,key,server,get calls(){return calls;},async close(){await server.close();await rm(root,{recursive:true,force:true});}};}
test('private helper control authenticates both directions, fixed role and exact payload without public ingress',async()=>{const w=await world();try{const r=await privateControl({filename:w.filename,role:'helper',key:w.key,operation:'helper.status',input:{activationId:'exact'}});assert.equal(canonicalJson(r),canonicalJson({echo:{activationId:'exact'}}));assert.equal(w.server.binding.host,'127.0.0.1');assert.equal(w.calls,1);await assert.rejects(()=>privateControl({filename:w.filename,role:'helper',key:randomBytes(32),operation:'helper.status',input:null}),{code:'UNAUTHORIZED'});assert.equal(w.calls,1);await assert.rejects(()=>privateControl({filename:w.filename,role:'native',key:w.key,operation:'native.status',input:null}),{code:'INTEGRITY_FAILURE'});await assert.rejects(()=>privateControl({filename:w.filename,role:'helper',key:w.key,operation:'activation.begin',input:null}),e=>e.code==='STALE_RELEASE'&&!e.message.includes('sensitive'));}finally{await w.close();}});
test('stale server nonce, expired call and arbitrary private operation cannot reach a handler',async()=>{const w=await world();try{const e=w.server.binding;for(const override of [{serverNonce:'0'.repeat(64)},{issuedAt:Date.now()-30000,expiresAt:Date.now()-1000},{operation:'shell.run'}]){const text=canonicalJson({schemaVersion:1,role:'helper',serverNonce:e.nonce,requestId:'1'.repeat(32),issuedAt:Date.now(),expiresAt:Date.now()+10000,operation:'helper.status',input:null,...override});const signature=createHmac('sha256',w.key).update('dev2.private-rpc.v1\0helper\0request\0').update(text).digest('hex');const r=await fetch('http://127.0.0.1:'+e.port+'/',{method:'POST',headers:{'content-type':'application/json','x-dev2-private-mac':signature},body:text});assert.equal(r.status,403);}assert.equal(w.calls,0);}finally{await w.close();}});
test('endpoint role, private mode and fixed loopback address are enforced rather than followed as URLs',async()=>{const w=await world();try{await chmod(w.filename,0o644);await assert.rejects(()=>readPrivateEndpoint(w.filename,'helper'),{code:'FORBIDDEN'});await chmod(w.filename,0o600);await writeFile(w.filename,canonicalJson({...w.server.binding,host:'example.invalid'}));await assert.rejects(()=>readPrivateEndpoint(w.filename,'helper'),{code:'INTEGRITY_FAILURE'});}finally{await w.close();}});
test('transport response loss does not retry a mutating handler or fabricate completion',async t=>{
 const root=await mkdtemp(join(tmpdir(),'dev2-private-loss-')),filename=join(root,'endpoint.json'),key=randomBytes(32);
 let sends=0;const entered=Promise.withResolvers(),release=Promise.withResolvers(),finished=Promise.withResolvers();
 const server=await servePrivateControl({role:'helper',filename,key,handlers:{'activation.begin':async()=>{sends++;entered.resolve();await release.promise;finished.resolve();return {retained:true};}}});
 const originalFetch=globalThis.fetch,loss=new AbortController();
 // Lose the actual loopback response only AFTER authenticated handler entry.
 // A 20ms scheduling race could time out before delivery and tested the wrong case.
 const mocked=t.mock.method(globalThis,'fetch',async(input,options)=>{
  const pending=originalFetch(input,{...options,signal:AbortSignal.any([options.signal,loss.signal])});
  entered.promise.then(()=>loss.abort());return pending;
 });
 try{
  await assert.rejects(()=>privateControl({filename,role:'helper',key,operation:'activation.begin',input:{actionId:'retained'}}),e=>e.code==='EXECUTION_UNAVAILABLE'&&e.facts.delivery==='unknown');
  assert.equal(sends,1);release.resolve();await finished.promise;assert.equal(sends,1);
 }finally{mocked.mock.restore();release.resolve();await server.close();await rm(root,{recursive:true,force:true});}
});
test('response body loss after authenticated headers preserves delivery uncertainty and never resends',async t=>{
 const root=await mkdtemp(join(tmpdir(),'dev2-private-body-loss-')),filename=join(root,'endpoint.json'),key=randomBytes(32);let sends=0;
 const server=await servePrivateControl({role:'helper',filename,key,handlers:{'activation.begin':async()=>{sends++;return {retained:true};}}});
 const originalFetch=globalThis.fetch;
 const mocked=t.mock.method(globalThis,'fetch',async(...args)=>{
  const response=await originalFetch(...args),bytes=new Uint8Array(await response.arrayBuffer());
  const interrupted=new ReadableStream({start(controller){controller.enqueue(bytes.slice(0,16));controller.error(new TypeError('simulated response disconnect'));}});
  return new Response(interrupted,{status:response.status,headers:response.headers});
 });
 try{
  await assert.rejects(()=>privateControl({filename,role:'helper',key,operation:'activation.begin',input:{actionId:'retained-body-loss'}}),e=>e.code==='EXECUTION_UNAVAILABLE'&&e.facts.delivery==='unknown');
  assert.equal(sends,1);
 }finally{mocked.mock.restore();await server.close();await rm(root,{recursive:true,force:true});}
});
