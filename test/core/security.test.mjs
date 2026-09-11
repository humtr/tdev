import test from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT,generateKeyPair,exportJWK,createLocalJWKSet } from 'jose';
import { bearerVerifier,ScopedAuthorization } from '../../src/security/authorization.mjs';
import { repositoryPath,comparePaths } from '../../src/security/paths.mjs';
import { createArguments,attemptName,PodmanSandbox } from '../../src/execution/podman.mjs';
import { boundedCommand } from '../../src/execution/command.mjs';
const hash='sha256:'+'1'.repeat(64);
const attempt={installationId:'installation',repositoryId:'repo',workId:'work',actionId:'action',attemptId:'attempt',attempt:'1',ownerEpoch:'1'};
const profile={profileId:'core',digest:hash,argv:['/usr/local/bin/node','--test'],cwd:'',parameters:{},timeoutMs:10000,killGraceMs:1000,memoryBytes:67108864,pids:64,cpuMillis:1000,diskBytes:16777216,logBytes:1048576,network:'none',imageDigest:hash,replaySafe:true};
const options={executable:'/usr/bin/podman',environment:{},attemptRoot:'/attempts',seccompPath:'/sealed/seccomp.json',seccompDigest:hash,images:{[hash]:'registry.example/node@'+hash},productionSeal:true,materialize:async()=>''};
test('paths deny traversal, normalization aliases and metadata without case-folding ordinary files',()=>{
  for(const p of ['', '/', '../x','a/../x','a//b','a/./b','a/','a\\b','C:x','.git/config','a/.GIT/x','e\u0301']) assert.throws(()=>repositoryPath(p));
});
test('canonical paths preserve valid exact identity',()=>{
  assert.equal(repositoryPath('',true),'');assert.equal(repositoryPath('src/A.mjs'),'src/A.mjs');
  assert.notEqual(repositoryPath('src/A.mjs'),repositoryPath('src/a.mjs'));
  assert.deepEqual(['z','\ud83d\ude00','\ue000'].sort(comparePaths),['z','\ue000','\ud83d\ude00']);
});
test('real JWT signature, issuer, expiry, audience and algorithm checks',async()=>{
  const {privateKey,publicKey}=await generateKeyPair('RS256');const jwk=await exportJWK(publicKey);jwk.kid='fixture';
  const now=1700000000000;
  const config={issuer:'https://issuer.example',audience:'https://dev2.example',algorithms:['RS256']};
  const verify=bearerVerifier(config,createLocalJWKSet({keys:[jwk]}),()=>now);
  const token=await new SignJWT({}).setProtectedHeader({alg:'RS256',kid:'fixture'}).setSubject('fixture-subject').setIssuer(config.issuer).setAudience(config.audience).setExpirationTime(now/1000+60).sign(privateKey);
  const p=await verify('Bearer '+token);assert.equal(p.expiresAt,now+60000);assert.equal(p.subject.length,64);
  await assert.rejects(()=>verify('Bearer '+token.slice(0,-10)+'AAAAAAAAAA'),{code:'UNAUTHORIZED'});
  await assert.rejects(()=>bearerVerifier({...config,audience:'https://other.example'},createLocalJWKSet({keys:[jwk]}),()=>now)('Bearer '+token),{code:'UNAUTHORIZED'});
  await assert.rejects(()=>bearerVerifier(config,createLocalJWKSet({keys:[jwk]}),()=>now+61000)('Bearer '+token),{code:'UNAUTHORIZED'});
  await assert.rejects(()=>verify('proxy accepted this'),{code:'UNAUTHORIZED'});
});
test('revocation and exact binding checked again at effect dispatch',async()=>{
  const binding={repositoryId:'repo',installationId:'i',provider:'fixture',providerRepositoryId:'p',remote:'https://git.example/repo',ref:'refs/heads/dev-2',bindingEpoch:'1',policyDigest:hash};
  const p={subject:'subject',issuer:'https://issuer.example',audience:'https://dev2.example',expiresAt:100};
  let grants=[{subject:p.subject,installationId:'i',repositoryId:'repo',ref:binding.ref,capabilities:['repository.read','integration.write'],paths:['src'],deniedPaths:['src/secret']}];
  const auth=new ScopedAuthorization({issuer:p.issuer,audience:p.audience,now:()=>1,bindings:()=>[binding],grants:()=>grants});
  await auth.authorize(p,binding,'repository.read',['src/ok']);
  for(const path of ['src2/file','src/secret/token','.git/config'])await assert.rejects(()=>auth.authorize(p,binding,'repository.read',[path]));
  await assert.rejects(()=>auth.authorize(p,{...binding,bindingEpoch:'2'},'integration.write'));
  grants=[];await assert.rejects(()=>auth.authorize(p,binding,'integration.write'),{code:'FORBIDDEN'});
});
test('sandbox arguments are fixed, credential-free, attempt-specific and resource bounded',()=>{
  const a=createArguments(attempt,profile,'/attempts/'+attemptName(attempt)+'/source',options);
  for(const flag of ['--network=none','--read-only','--read-only-tmpfs=false','--cap-drop=ALL','--security-opt=no-new-privileges','--pid=private','--ipc=private','--cgroupns=private'])assert.ok(a.includes(flag));
  assert.ok(!a.includes('--privileged'));assert.ok(a.includes('--pull=never'));
  assert.throws(()=>createArguments(attempt,profile,'/attempts/other/source',options));
  assert.throws(()=>createArguments(attempt,{...profile,network:'fixture'},'/attempts/'+attemptName(attempt)+'/source',options),{code:'EXECUTION_UNAVAILABLE'});
  assert.notEqual(attemptName(attempt),attemptName({...attempt,ownerEpoch:'2'}));
});
test('missing production seal fails closed before any engine or host execution',async()=>{
  let calls=0;const sandbox=new PodmanSandbox({...options,productionSeal:false,command:async()=>{calls++;throw Error('must not execute');}});
  await assert.rejects(()=>sandbox.launch(attempt,profile,{}),{code:'EXECUTION_UNAVAILABLE'});assert.equal(calls,0);
});
test('inspecting and cancelling never terminate another attempt',async()=>{
  const calls=[];const sandbox=new PodmanSandbox({...options,command:async(_exe,args)=>{
    calls.push(args);return {exitCode:0,signal:null,stdout:Buffer.from(args[0]==='inspect'?JSON.stringify([{Config:{Labels:{'dev2.attempt':'foreign'}},State:{Status:'running',Running:true,ExitCode:0}}]):''),stderr:Buffer.alloc(0),discardedBytes:0,timedOut:false,spawnFailed:false};
  }});
  await assert.rejects(()=>sandbox.cancel(attempt),{code:'INTEGRITY_FAILURE'});assert.equal(calls.some(a=>a[0]==='kill'),false);
});
test('bounded trusted-command primitive does not interpolate argv and terminates overflow/deadline',async()=>{
  const fixed={environment:{},timeoutMs:3000,maxBytes:1000,killGraceMs:100};
  const r=await boundedCommand(process.execPath,['-e','process.stdout.write(process.argv[1])','; not-a-shell-command'],fixed);
  assert.equal(r.stdout.toString(),'; not-a-shell-command');assert.equal(r.exitCode,0);
  const overflow=await boundedCommand(process.execPath,['-e','process.stdout.write("x".repeat(100000));setInterval(()=>{},1000)'],fixed);
  assert.ok(overflow.discardedBytes>0);assert.ok(overflow.stdout.length<=1000);
  const timeout=await boundedCommand(process.execPath,['-e','setInterval(()=>{},1000)'],{...fixed,timeoutMs:100});assert.equal(timeout.timedOut,true);
});
