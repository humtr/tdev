import test from 'node:test';
import assert from 'node:assert/strict';
import {Ledger} from '../../src/storage/ledger.mjs';
import {ManagedSessions} from '../../src/execution/sessions.mjs';
import {GitHubSessions} from '../../src/execution/github-sessions.mjs';
import {recordDigest,canonicalJson} from '../../src/contracts/canonical.mjs';
const D='sha256:'+'1'.repeat(64),C='1'.repeat(40),binding={installationId:'i',repositoryId:'r',providerRepositoryId:'123',bindingEpoch:'1',provider:'github',remote:'https://github.com/fixture/repo.git',ref:'refs/heads/dev-2',policyDigest:D};
const config={repositoryOwnerId:'456',repositoryFullName:'fixture/repo',approvedCommit:C,trustedRunnerDigest:D,sessionTimeoutMs:900000,sealDigest:D};
function setup(){let time=10000;const ledger=new Ledger(':memory:',binding),sessions=new ManagedSessions({ledger,config,now:()=>time});const refs=new Map(),runs=[],calls=[];let lose=false,override=null;
 const fetcher=async(url,options)=>{url=new URL(url);assert.equal(url.origin,'https://api.github.com');assert.equal(options.redirect,'error');assert.equal(options.headers.authorization,'Bearer '+'fixture-token'.padEnd(32,'x'));assert.equal(options.headers['x-github-api-version'],'2026-03-10');calls.push({method:options.method,path:url.pathname,search:url.search,body:options.body&&JSON.parse(options.body)});if(override){const response=await override(url,options);if(response)return response;}
  const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
  if(url.pathname==='/repos/fixture/repo')return json({id:123,owner:{id:456},full_name:'fixture/repo',archived:false});
  if(url.pathname.startsWith('/repos/fixture/repo/git/ref/')){const ref='refs/'+url.pathname.slice('/repos/fixture/repo/git/ref/'.length);return refs.has(ref)?json({ref,object:{type:'commit',sha:refs.get(ref)}}):json({message:'not found'},404);}
  if(url.pathname==='/repos/fixture/repo/git/refs'){const body=JSON.parse(options.body);if(refs.has(body.ref))return json({message:'already exists'},422);refs.set(body.ref,body.sha);if(lose){lose=false;throw Error('response lost after provider effect');}return json({ref:body.ref,object:{type:'commit',sha:body.sha}},201);}
  if(url.pathname==='/repos/fixture/repo/actions/runs'){const matching=runs.filter(r=>r.head_branch===url.searchParams.get('branch'));return json({total_count:matching.length,workflow_runs:matching});}
  if(/^\/repos\/fixture\/repo\/actions\/runs\/[0-9]+\/cancel$/.test(url.pathname))return new Response(null,{status:202});
  throw Error('Unexpected provider request '+url.pathname);
 };
 const provider=new GitHubSessions({sessions,token:async()=>'fixture-token'.padEnd(32,'x'),fetcher,now:()=>time});
 const addRun=(sessionId,runId=10,status='in_progress')=>{const r={id:runId,run_attempt:1,head_sha:C,head_branch:'dev2-exec/'+sessionId,event:'push',path:'.github/workflows/dev2-executor.yml',status,repository:{id:123,owner:{id:456}},head_repository:{id:123}};runs.push(r);return r;};
 return {ledger,sessions,provider,refs,runs,calls,addRun,setTime:n=>time=n,setLose:()=>lose=true,setOverride:f=>override=f,close:()=>ledger.close()};
}
function identity(session){const i=session.intent;return {kind:'github-executor',sessionId:i.sessionId,installationId:i.installationId,repositoryId:i.providerRepositoryId,runId:session.run.runId,runAttempt:'1',launchCommit:i.launchCommit,expiresAt:i.deadline,launchIdentity:recordDigest('dev2.execution-launch.v1',{installationId:i.installationId,sessionId:i.sessionId,repository_id:i.providerRepositoryId,repository_owner_id:i.repositoryOwnerId,ref:i.ref,sha:i.launchCommit,workflow_ref:i.workflowRef,workflow_sha:i.launchCommit,run_id:session.run.runId,run_attempt:'1',runner_environment:'github-hosted',event_name:'push'})};}
test('response lost after execution-ref creation reconciles exact identity without a second provider create',async()=>{const w=setup();try{w.sessions.reserve('s');w.setLose();assert.equal((await w.provider.launch('s')).state,'present');assert.equal((await w.provider.launch('s')).state,'present');assert.equal(w.calls.filter(c=>c.method==='POST').length,1);assert.equal(w.refs.get('refs/heads/dev2-exec/s'),C);assert.equal(w.sessions.open()[0].launch,'sent');}finally{w.close();}});
test('only approved exact source ref can be launched; changed ref and changed repository owner fail before mutation',async()=>{const w=setup();try{w.sessions.reserve('s');w.refs.set('refs/heads/dev2-exec/s','2'.repeat(40));await assert.rejects(w.provider.launch('s'),{code:'INTEGRITY_FAILURE'});assert.equal(w.calls.filter(c=>c.method==='POST').length,0);w.refs.clear();w.setOverride(url=>url.pathname==='/repos/fixture/repo'?new Response(JSON.stringify({id:123,owner:{id:999},full_name:'fixture/repo',archived:false})):null);await assert.rejects(w.provider.launch('s'),{code:'FORBIDDEN'});assert.equal(w.calls.filter(c=>c.method==='POST').length,0);}finally{w.close();}});
test('launch intent and uncertain POST survive transport loss without freeing capacity or inventing another identity',async()=>{const w=setup();try{w.sessions.reserve('s');w.setOverride((url,o)=>{if(o.method==='POST')throw Error('offline');return null;});await assert.rejects(w.provider.launch('s'),{code:'EFFECT_UNCERTAIN'});assert.equal(w.sessions.open()[0].launch,'sent');assert.throws(()=>w.sessions.closeUnlaunched('s'),{code:'EFFECT_UNCERTAIN'});w.setOverride(null);assert.equal((await w.provider.launch('s')).state,'present');assert.equal(w.refs.size,1);}finally{w.close();}});
test('first matching run is selected; duplicate runs cannot authenticate and only exact duplicates are cancelled',async()=>{const w=setup();try{w.sessions.reserve('s');await w.provider.launch('s');w.addRun('s',20);w.addRun('s',10);w.addRun('unrelated',30);const selected=await w.provider.refresh('s');assert.equal(selected.run.runId,'10');const who=identity(selected);assert.equal(w.sessions.current(who).session.run.runId,'10');assert.throws(()=>w.sessions.current({...who,runId:'20'}),{code:'UNAUTHORIZED'});assert.throws(()=>w.sessions.current({...who,launchIdentity:D}),{code:'UNAUTHORIZED'});assert.throws(()=>w.sessions.current({...who,expiresAt:selected.intent.deadline+1}),{code:'UNAUTHORIZED'});assert.deepEqual(await w.provider.cancelDuplicates('s'),['20']);const cancels=w.calls.filter(c=>c.path.endsWith('/cancel'));assert.equal(cancels.length,1);assert.equal(cancels[0].path,'/repos/fixture/repo/actions/runs/20/cancel');}finally{w.close();}});
test('HTTP cancellation admission is not stop proof and does not block unrelated session progress',async()=>{const w=setup();try{for(const s of ['a','b']){w.sessions.reserve(s);await w.provider.launch(s);}const a=w.addRun('a',10),b=w.addRun('b',11);await w.provider.refresh('a');await w.provider.refresh('b');assert.equal((await w.provider.cancel('a')).state,'closing');assert.equal((await w.provider.authorization('b')).active,true);assert.equal(w.sessions.open().length,2);a.status='completed';w.setTime(10001);assert.equal((await w.provider.refresh('a',true)).state,'closed');assert.equal(w.sessions.open().length,1);assert.equal((await w.provider.refresh('b',true)).state,'active');assert.equal(b.status,'in_progress');}finally{w.close();}});
test('terminal startup failure closes only an unassigned exact launch, never a selected execution',async()=>{const w=setup();try{w.sessions.reserve('s');await w.provider.launch('s');w.addRun('s',10,'completed');assert.equal((await w.provider.refresh('s')).state,'closed');assert.equal(w.sessions.launchAuthorization('s'),null);w.sessions.reserve('other');await w.provider.launch('other');w.addRun('other',11);const selected=await w.provider.refresh('other');assert.throws(()=>w.sessions.stopBeforeAssignment('other',{...selected.run,status:'completed'}),{code:'EFFECT_UNCERTAIN'});}finally{w.close();}});
test('cached provider observations are bounded and concurrent readLaunch calls do not amplify API traffic',async()=>{const w=setup();try{w.sessions.reserve('s');await w.provider.launch('s');w.addRun('s');await Promise.all(Array.from({length:8},()=>w.provider.authorization('s')));assert.equal(w.calls.filter(c=>c.path.endsWith('/actions/runs')).length,1);w.setTime(20001);await w.provider.authorization('s');assert.equal(w.calls.filter(c=>c.path.endsWith('/actions/runs')).length,2);assert.equal((await w.provider.authorization('s')).provider.observedAt,20001);}finally{w.close();}});
test('malformed or incomplete provider observations cannot identify a managed executor',async()=>{const w=setup();try{w.sessions.reserve('s');await w.provider.launch('s');const run=w.addRun('s');run.run_attempt=2;await assert.rejects(w.provider.refresh('s'),{code:'UNAUTHORIZED'});run.run_attempt=1;w.setOverride(url=>url.pathname.endsWith('/actions/runs')?new Response(JSON.stringify({total_count:101,workflow_runs:[run]})):null);await assert.rejects(w.provider.refresh('s',true),{code:'EXECUTION_UNAVAILABLE'});assert.equal(w.sessions.open()[0].run,null);}finally{w.close();}});

test('fresh provider completion rejects cached cancellation and preserves exact successful retry',async()=>{
 for(const terminal of [true,false]){const w=setup();try{
  const {ExecutorEndpoint}=await import('../../src/execution/executor-endpoint.mjs');
  const {githubExecutorVerifier}=await import('../../src/execution/github-identity.mjs');
  const {generateKeyPair,SignJWT}=await import('jose');
  w.sessions.reserve('s');await w.provider.launch('s');const run=w.addRun('s');
  const session=await w.provider.refresh('s'),who=identity(session),attempt={installationId:'i',repositoryId:'r',workId:'w',actionId:'a',attemptId:'attempt',attempt:'1',ownerEpoch:w.ledger.ownerEpoch};
  w.ledger.transact(tx=>{
   tx.insertWork({workId:'w',repositoryId:'r',bindingEpoch:'1',principal:'fixture',baseCommitOid:'sha1:'+C,baseTreeOid:'sha1:'+C,candidate:{treeOid:'sha1:'+C,manifestDigest:D},generation:'0',revision:'0',disposition:'open',currentActionId:'a'});
   tx.insertAction({actionId:'a',requestId:'request',principal:'fixture',bindingEpoch:'1',intentDigest:D,operation:'validate',workId:'w',status:'running',step:'fixture',attempt:'0',ownerEpoch:w.ledger.ownerEpoch,deadline:600000,resultId:null,errorCode:null});assert.ok(tx.reserveAttempt(attempt,8));
  });
  const a=w.sessions.offer(who,{attempt,resultId:'prepared',profileDigest:D,sourceManifest:D,payloadDigest:D,executionDigest:D,deadline:600000},[{digest:D,size:1}]);w.sessions.acknowledge(who,a.assignmentId,a.leaseId);
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const i=session.intent,assertion=await new SignJWT({repository_id:i.providerRepositoryId,repository_owner_id:i.repositoryOwnerId,ref:i.ref,sha:i.launchCommit,workflow_ref:i.workflowRef,workflow_sha:i.launchCommit,run_id:who.runId,run_attempt:'1',runner_environment:'github-hosted',event_name:'push'}).setProtectedHeader({alg:'RS256'}).setIssuer('https://token.actions.githubusercontent.com').setAudience('https://tdev.humtr.workers.dev/executor').setSubject('fixture').setIssuedAt(10).setNotBefore(10).setExpirationTime(610).sign(privateKey);
  const verify=githubExecutorVerifier({origin:'https://tdev.humtr.workers.dev',installationId:'i'},async()=>publicKey,(sid,force)=>w.provider.authorization(sid,force),()=>10001);
  const endpoint=new ExecutorEndpoint({sessions:w.sessions,transfer:{},verify});
  if(terminal){run.status='completed';run.conclusion='cancelled';}w.setTime(10001);
  const result={assignmentId:a.assignmentId,leaseId:a.leaseId,inputIdentity:a.inputIdentity,sealDigest:D,trustedRunnerDigest:D,startedAt:10000,endedAt:10001,stopped:true,exitCode:0,signal:null,deadlineExceeded:false,inputDigest:D,outputDigest:D,artifacts:[]};
  const response=await endpoint.invoke({apiVersion:1,op:'result.submit',sessionId:'s',result},assertion);
  if(terminal){
   assert.equal(response.ok,false,'fresh terminal provider observation must fence completion');
   assert.equal(w.ledger.transact(tx=>tx.get('SELECT value FROM meta WHERE key=?','managed.completion:'+a.assignmentId)),undefined,'no permanent authenticated completion may be fabricated');
   assert.equal(w.provider.retained('s').state,'closed');
  }else{
   assert.equal(response.ok,true);const prior=w.ledger.transact(tx=>tx.get('SELECT value FROM meta WHERE key=?','managed.completion:'+a.assignmentId));assert.ok(prior);
   const retry=await endpoint.invoke({apiVersion:1,op:'result.submit',sessionId:'s',result},assertion);
   assert.equal(canonicalJson(retry),canonicalJson(response));assert.deepEqual(w.ledger.transact(tx=>tx.get('SELECT value FROM meta WHERE key=?','managed.completion:'+a.assignmentId)),prior);
   assert.equal(w.calls.filter(c=>c.path.endsWith('/actions/runs')).length,3,'initial observation plus one new observation per completion request');
  }
 }finally{w.close();}}
});
test('forced completion read cannot reuse an older in-flight provider observation',async()=>{
 const w=setup();try{
  w.sessions.reserve('s');await w.provider.launch('s');const run=w.addRun('s'),entered=Promise.withResolvers(),release=Promise.withResolvers();let held=true;
  w.setOverride(async url=>{if(url.pathname.endsWith('/actions/runs')&&held){held=false;const snapshot=structuredClone(run);entered.resolve();await release.promise;return new Response(JSON.stringify({total_count:1,workflow_runs:[snapshot]}));}return null;});
  const old=w.provider.authorization('s');await entered.promise;
  run.status='completed';w.setTime(10001);const current=w.provider.authorization('s',true);release.resolve();
  await old;assert.equal((await current).active,false,'completion must observe after the pre-existing request, not join its old bytes');
  assert.equal(w.calls.filter(c=>c.path.endsWith('/actions/runs')).length,2);
 }finally{w.close();}
});
test('forced completion read fails closed on provider loss rather than using cached authority',async()=>{
 const w=setup();try{
  w.sessions.reserve('s');await w.provider.launch('s');w.addRun('s');await w.provider.authorization('s');
  w.setOverride(url=>{if(url.pathname.endsWith('/actions/runs'))throw Error('provider unavailable');return null;});
  await assert.rejects(w.provider.authorization('s',true),{code:'EXECUTION_UNAVAILABLE'});
 }finally{w.close();}
});
test('completion uses a fresh positive observation while ordinary polls retain bounded caching',async()=>{
 const w=setup();try{
  w.sessions.reserve('s');await w.provider.launch('s');w.addRun('s');await w.provider.authorization('s');w.setTime(10001);
  assert.equal((await w.provider.authorization('s')).provider.observedAt,10000);
  assert.equal((await w.provider.authorization('s',true)).provider.observedAt,10001);
  assert.equal(w.calls.filter(c=>c.path.endsWith('/actions/runs')).length,2);
 }finally{w.close();}
});
test('a selected run observed as non-running cannot leave stale in-progress completion authority',async()=>{
 const w=setup();try{
  w.sessions.reserve('s');await w.provider.launch('s');const run=w.addRun('s');await w.provider.authorization('s');run.status='queued';
  await assert.rejects(w.provider.authorization('s',true),{code:'EXECUTION_UNAVAILABLE'});
 }finally{w.close();}
});
