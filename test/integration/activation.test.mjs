import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,realpath,access,symlink,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,delimiter} from 'node:path';
import {constants} from 'node:fs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {ActivationStore,ReleaseActivation} from '../../src/runtime/activation.mjs';
import {recordDigest} from '../../src/contracts/canonical.mjs';
const old=recordDigest('dev2.release.v1',{id:'old'}),next=recordDigest('dev2.release.v1',{id:'next'}),requestDigest=recordDigest('dev2.request.v1',{op:'activate'});
async function executable(name){for(const directory of (process.env.PATH??'').split(delimiter)){try{const p=join(directory,name);await access(p,constants.X_OK);return realpath(p);}catch{}}throw Error(name+' unavailable');}
async function world(){
 const root=await realpath(await mkdtemp(join(tmpdir(),'dev2-activation-'))),flock=await executable('flock'),store=new ActivationStore({root,flock,environment:{PATH:process.env.PATH??''}});
 const archive=new Map(),calls=[];let current={state:'running',releaseId:old,ready:true};
 const service={drain:async()=>{calls.push('drain');return current.state==='running';},stop:async()=>{calls.push('stop');current={state:'stopped',releaseId:null,ready:false};return true;},start:async release=>{calls.push('start:'+release);current={state:'running',releaseId:release,ready:true};},observe:async()=>({...current}),enable:async release=>{calls.push('enable:'+release);return current.state==='running'&&current.releaseId===release&&current.ready;}};
 const options={store,service,verifyRelease:async r=>assert.ok([old,next].includes(r)),authorize:async()=>{},retain:async a=>{archive.set(a.activationId,structuredClone(a));},lookup:async id=>archive.get(id)??null,readinessMs:20,pollMs:2};
 await store.locked(()=>store.write('active.json',{releaseId:old}));
 return {root,store,flock,options,calls,service,helper:new ReleaseActivation(options),setCurrent:x=>{current=x;},intent:{activationId:'activation1',requestDigest,expectedRelease:old,candidateRelease:next,deadline:Date.now()+10000},close:()=>rm(root,{recursive:true,force:true})};
}
test('real inherited-descriptor flock excludes two helpers and releases after scope exit',async()=>{
 const w=await world();try{await w.store.locked(async()=>{await assert.rejects(()=>w.store.locked(async()=>{}),{code:'EXECUTION_UNAVAILABLE'});});assert.equal(await w.store.locked(async()=>17),17);}finally{await w.close();}
});
test('helper intent and pointer survive re-instantiation; duplicate activation does not restart again',async()=>{
 const w=await world();try{const prepared=await w.helper.prepare(w.intent);assert.equal(prepared.phase,'prepared');assert.equal(w.calls.length,0);
 const done=await new ReleaseActivation(w.options).execute(w.intent.activationId);assert.equal(done.phase,'active');assert.equal((await w.store.read('active.json')).releaseId,next);
 const count=w.calls.length;assert.equal((await w.helper.prepare({...w.intent,deadline:1})).phase,'active');assert.equal((await w.helper.execute(w.intent.activationId)).phase,'active');assert.equal(w.calls.length,count);
 await assert.rejects(()=>w.helper.prepare({...w.intent,candidateRelease:old}),{code:'IDEMPOTENCY_MISMATCH'});
 }finally{await w.close();}
});
test('read-only observation never repairs or switches a prepared intent',async()=>{const w=await world();try{await w.helper.prepare(w.intent);for(let i=0;i<3;i++)assert.equal((await w.helper.observe('activation1')).phase,'prepared');assert.equal(w.calls.length,0);}finally{await w.close();}});
test('a true second activation is rejected while first is unresolved; stale expected pointer fails',async()=>{
 const w=await world();try{await assert.rejects(()=>w.helper.prepare({...w.intent,expectedRelease:next}),{code:'STALE_RELEASE'});await w.helper.prepare(w.intent);await assert.rejects(()=>w.helper.prepare({...w.intent,activationId:'activation2'}),{code:'EXECUTION_UNAVAILABLE'});}finally{await w.close();}
});
test('revoked activation authorization rejects before touching service or pointer',async()=>{
 const w=await world();try{await w.helper.prepare(w.intent);w.options.authorize=async()=>{throw Object.assign(Error('denied'),{code:'FORBIDDEN'});};await assert.rejects(()=>w.helper.execute('activation1'),{code:'FORBIDDEN'});assert.equal(w.calls.length,0);assert.equal((await w.store.read('active.json')).releaseId,old);}finally{await w.close();}
});
test('failed candidate readiness restores exact prior release and retains failed outcome',async()=>{
 const w=await world();try{const start=w.service.start;w.service.start=async r=>{await start(r);if(r===next)w.setCurrent({state:'running',releaseId:r,ready:false});};await w.helper.prepare(w.intent);
 const done=await w.helper.execute('activation1');assert.equal(done.phase,'rolled_back');assert.equal(done.observedRelease,old);assert.equal(done.outcome,'readiness.failed');assert.equal((await w.store.read('active.json')).releaseId,old);
 }finally{await w.close();}
});
test('uncertain old process termination never switches pointer or launches new writer',async()=>{
 const w=await world();try{w.service.stop=async()=>false;await w.helper.prepare(w.intent);const result=await w.helper.execute('activation1');assert.equal(result.phase,'blocked');assert.equal((await w.store.read('active.json')).releaseId,old);assert.equal(w.calls.some(c=>c.startsWith('start:')),false);}finally{await w.close();}
});
for(const point of ['persist:draining','persist:switching','pointer:candidate','persist:checking','persist:active'])test('resume exact handoff after injected crash at '+point,async()=>{
 const w=await world();try{let once=true;w.options.fault=async p=>{if(p===point&&once){once=false;throw Error('crash');}};await w.helper.prepare(w.intent);await assert.rejects(()=>w.helper.execute('activation1'),/crash/);
 w.options.fault=undefined;const done=await new ReleaseActivation(w.options).execute('activation1');assert.equal(done.phase,'active');assert.equal(done.observedRelease,next);assert.equal(w.calls.filter(c=>c==='start:'+next).length,1);
 }finally{await w.close();}
});
test('lost start acknowledgement adopts exact running candidate instead of unnecessary rollback',async()=>{
 const w=await world();try{const start=w.service.start;w.service.start=async r=>{await start(r);if(r===next)throw Error('response lost');};await w.helper.prepare(w.intent);const done=await w.helper.execute('activation1');assert.equal(done.phase,'active');assert.equal(w.calls.filter(c=>c==='start:'+old).length,0);}finally{await w.close();}
});
test('rollback direction survives response loss after restored readiness',async()=>{
 const w=await world();try{const start=w.service.start;w.service.start=async r=>{await start(r);if(r===next)w.setCurrent({state:'running',releaseId:r,ready:false});};let once=true;
 w.options.fault=async p=>{if(p==='persist:rolled_back'&&once){once=false;throw Error('crash');}};await w.helper.prepare(w.intent);await assert.rejects(()=>w.helper.execute('activation1'),/crash/);
 w.options.fault=undefined;const result=await new ReleaseActivation(w.options).execute('activation1');assert.equal(result.phase,'rolled_back');assert.equal(result.observedRelease,old);assert.equal(w.calls.filter(c=>c==='start:'+old).length,1);
 }finally{await w.close();}
});
test('real SIGKILL releases helper lock without deleting its file',async()=>{
 const w=await world();const script=`import {ActivationStore} from './src/runtime/activation.mjs';const s=new ActivationStore(JSON.parse(process.argv[1]));await s.locked(async()=>{process.send('ready');const keepAlive=setInterval(()=>{},1000);await new Promise(()=>{});clearInterval(keepAlive);});`;
 const child=spawn(process.execPath,['--input-type=module','-e',script,JSON.stringify(w.store.options)],{stdio:['ignore','ignore','pipe','ipc']});let timer;
 try{await Promise.race([once(child,'message'),once(child,'exit').then(()=>{throw Error('Early helper exit');}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Lock timeout')),5000);})]);
 await assert.rejects(()=>w.store.locked(async()=>{}),{code:'EXECUTION_UNAVAILABLE'});child.kill('SIGKILL');await once(child,'exit');assert.equal(await w.store.locked(async()=>23),23);
 }finally{clearTimeout(timer);if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await once(child,'exit');}await w.close();}
});
test('symlink lock and malformed state cannot redirect the helper to another owner',async()=>{
 const w=await world();try{await rm(join(w.root,'activation.lock'));await symlink('active.json',join(w.root,'activation.lock'));await assert.rejects(()=>w.store.locked(async()=>{}));assert.equal(JSON.parse(await readFile(join(w.root,'active.json'),'utf8')).releaseId,old);}finally{await w.close();}
});
