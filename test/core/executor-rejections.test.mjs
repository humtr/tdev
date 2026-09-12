import test from 'node:test';import assert from 'node:assert/strict';
import {ExecutorClient} from '../../src/execution/executor-client.mjs';
import {oidcToken} from '../../src/execution/oidc-token.mjs';
const client=fetcher=>new ExecutorClient({origin:'http://127.0.0.1',sessionId:'s',token:async()=>'fixture',allowInsecureFixture:true,fetcher});
test('executor authority/stale rejection remains distinct from retryable transport loss',async()=>{
 for(const code of ['UNAUTHORIZED','FORBIDDEN','STALE_RESULT','IDEMPOTENCY_MISMATCH','VALIDATION_FAILED'])await assert.rejects(client(async()=>Response.json({apiVersion:1,ok:false,error:{code,message:'do not reflect private native details'}})).poll(),e=>e.code===code&&e.message===code);
 for(const [status,code] of [[401,'UNAUTHORIZED'],[403,'FORBIDDEN'],[429,'CAPACITY_REJECTED'],[503,'EXECUTION_UNAVAILABLE']])await assert.rejects(client(async()=>new Response('private provider body',{status})).poll(),{code});
 await assert.rejects(client(async()=>{throw Error('private transport');}).poll(),{code:'EXECUTION_UNAVAILABLE'});await assert.rejects(client(async()=>Response.json({apiVersion:1,ok:false,error:{code:'UNKNOWN'}})).poll(),{code:'INTEGRITY_FAILURE'});
});
test('OIDC credentials never follow another host, redirect or candidate-selected audience',async()=>{
 for(const url of ['http://vstoken.actions.githubusercontent.com/x','https://evil.invalid/x','https://user@vstoken.actions.githubusercontent.com/x'])assert.throws(()=>oidcToken({origin:'https://tdev.humtr.workers.dev',url,token:'abcdefghijklmnop'}));
 let calls=0,now=100;const token=oidcToken({origin:'https://tdev.humtr.workers.dev',url:'https://vstoken.actions.githubusercontent.com/x?audience=untrusted',token:'abcdefghijklmnop',now:()=>now,fetcher:async(url,init)=>{calls++;assert.equal(new URL(url).searchParams.get('audience'),'https://tdev.humtr.workers.dev/executor');assert.equal(init.redirect,'error');return Response.json({value:'a.b.c'});}});assert.equal(await token(),'a.b.c');await token();assert.equal(calls,1);now+=90001;await token();assert.equal(calls,2);
});
