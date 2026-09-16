import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,exportJWK,SignJWT,createLocalJWKSet} from 'jose';
import {executorRequest,executorBearer} from '../../src/execution/protocol.mjs';
import {executorAuthentication} from '../../src/edge/executor-auth.mjs';
import {canonicalJson} from '../../src/contracts/canonical.mjs';
import {ExecutorEndpoint} from '../../src/execution/executor-endpoint.mjs';
import {Dev2Error} from '../../src/contracts/errors.mjs';
import {SCHEMA_DIGEST,TOOL_DESCRIPTORS} from '../../src/mcp/outputs.mjs';
const D='sha256:'+'1'.repeat(64),C='1'.repeat(40),origin='https://tdev.fixture.workers.dev';
const base={apiVersion:1,sessionId:'s',op:'poll'},assigned={apiVersion:1,sessionId:'s',assignmentId:'a',leaseId:'l'};
const outcome={assignmentId:'a',leaseId:'l',inputIdentity:D,sealDigest:D,trustedRunnerDigest:D,startedAt:1,endedAt:2,stopped:true,exitCode:0,signal:null,deadlineExceeded:false,inputDigest:D,outputDigest:D,artifacts:[]};
test('executor channel is closed and cannot express human tools, source paths, commands or grants',()=>{
 for(const request of [base,{...assigned,op:'ack'},{...assigned,op:'object.read',digest:D,offset:0,maxBytes:65536},{...assigned,op:'artifact.write',digest:D,size:0,offset:0,data:''},{apiVersion:1,sessionId:'s',op:'result.submit',result:outcome}])assert.equal(canonicalJson(executorRequest(request)),canonicalJson(request));
 for(const extra of [{tool:'dev_work'},{path:'.config/credentials'},{argv:['sh']},{principal:'human'},{authorization:{role:'owner'}}])assert.throws(()=>executorRequest({...base,...extra}));
 for(const request of [{...base,op:'create'},{...assigned,op:'object.read',digest:D,offset:-1,maxBytes:1},{...assigned,op:'object.read',digest:D,offset:0,maxBytes:65537},{apiVersion:1,sessionId:'s',op:'result.submit',result:{...outcome,stopped:false}},{apiVersion:1,sessionId:'s',op:'result.submit',result:{...outcome,sealDigest:'bad'}},{apiVersion:1,sessionId:'s',op:'result.submit',result:{...outcome,arbitrary:'field'}}])assert.throws(()=>executorRequest(request));
 assert.equal(TOOL_DESCRIPTORS.length,4);assert.equal(SCHEMA_DIGEST,'sha256:0de1e538b40c866a3a91acfdc70eba89c09902972daf65fca0688c61ac0de25c');
});
test('executor bearer is header-only and cannot be supplied by device/human assertion headers',()=>{
 for(const headers of [{},{'cf-access-jwt-assertion':'human'},{authorization:'Basic token'},{authorization:'Bearer two words'}])assert.throws(()=>executorBearer(new Request(origin+'/executor',{headers})));
 assert.equal(executorBearer(new Request(origin+'/executor',{headers:{authorization:'Bearer signed-token'}})),'signed-token');
});
test('edge cryptographically verifies exact provider role, repository, workflow, ref and audience',async()=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256'),jwk=await exportJWK(publicKey);jwk.kid='fixture';const keys=createLocalJWKSet({keys:[jwk]});
 const config={origin,binding:{remote:'https://github.com/fixture/repo.git',providerRepositoryId:'123'}};
 const claims={repository_id:'123',repository_owner_id:'456',ref:'refs/heads/dev2-exec/s',sha:C,workflow_ref:'fixture/repo/.github/workflows/dev2-executor.yml@refs/heads/dev2-exec/s',workflow_sha:C,run_id:'19',run_attempt:'1',runner_environment:'github-hosted',event_name:'push'};
 const now=2000000,verify=executorAuthentication(config,keys,()=>now);
 const token=async patch=>new SignJWT({...claims,...patch}).setProtectedHeader({alg:'RS256',kid:'fixture'}).setIssuer('https://token.actions.githubusercontent.com').setAudience(origin+'/executor').setSubject('repo:fixture/repo:ref:refs/heads/dev2-exec/s').setIssuedAt(1900).setExpirationTime(2200).sign(privateKey);
 const request=t=>new Request(origin+'/executor',{headers:{authorization:'Bearer '+t}}),good=await token({});assert.equal(await verify(request(good),base),good);
 for(const patch of [{repository_id:'124'},{ref:'refs/heads/dev-2'},{workflow_ref:'fixture/repo/.github/workflows/untrusted.yml@refs/heads/dev2-exec/s'},{workflow_sha:'2'.repeat(40)},{run_attempt:'2'},{runner_environment:'self-hosted'},{event_name:'pull_request'}])await assert.rejects(verify(request(await token(patch)),base));
 await assert.rejects(verify(request(good.slice(0,-6)+'wrong!'),base));
 const wrongAudience=await new SignJWT(claims).setProtectedHeader({alg:'RS256',kid:'fixture'}).setIssuer('https://token.actions.githubusercontent.com').setAudience(origin+'/mcp').setSubject('repo:fixture/repo').setIssuedAt(1900).setExpirationTime(2200).sign(privateKey);await assert.rejects(verify(request(wrongAudience),base));
});
test('native endpoint authorization precedes all retained state reads and never reflects assertions',async()=>{
 let reads=0;const endpoint=new ExecutorEndpoint({sessions:{current:()=>{reads++;return {session:'fixture'};}},transfer:{},verify:async()=>{throw new Dev2Error('UNAUTHORIZED');}});
 const denied=await endpoint.invoke(base,'secret-canary');assert.equal(denied.ok,false);assert.equal(denied.error.code,'UNAUTHORIZED');assert.equal(reads,0);assert.equal(JSON.stringify(denied).includes('secret-canary'),false);
 endpoint.o.verify=async()=>({sessionId:'other'});assert.equal((await endpoint.invoke(base,'secret-canary')).ok,false);assert.equal(reads,0);
 endpoint.o.verify=async()=>({sessionId:'s'});assert.equal((await endpoint.invoke(base,'signed-fixture')).ok,true);assert.equal(reads,1);
});
