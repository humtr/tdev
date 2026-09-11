import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {RequiredValidation,validationIdentity} from '../../src/validation/receipts.mjs';
import {AdoptedPolicy} from '../../src/validation/policy.mjs';
const d='sha256:'+'1'.repeat(64),other='sha256:'+'2'.repeat(64),oid='sha1:'+'3'.repeat(40);
const attempt={installationId:'i',repositoryId:'r',workId:'w',actionId:'a',attemptId:'t',attempt:'1',ownerEpoch:'1'};
const profiles=['core','integration'].map((profileId,i)=>({profileId,digest:i?other:d,argv:['/node','test'],cwd:'',parameters:{},timeoutMs:1000,killGraceMs:100,memoryBytes:1048576,pids:8,cpuMillis:1000,diskBytes:1048576,logBytes:65536,network:'none',imageDigest:d,replaySafe:true}));
const execution={orderedProfileDigests:[d,other],trustedRunnerDigest:d,toolchainDigest:d,environmentClass:'fixture',dependencyLockDigest:d};
const result={resultId:'result',repositoryId:'r',bindingEpoch:'1',workId:'w',generation:'1',baseCommitOid:oid,baseTreeOid:oid,candidateTreeOid:oid,expectedHead:oid,commitOid:oid,resultTreeOid:oid,resultTreeSha256:d,policyDigest:d,metadata:{author:'a <a@x>',committer:'a <a@x>',timestamp:1,message:'m'},execution};
const passed=()=>({startedAt:1,endedAt:2,exitCode:0,signal:null,deadlineExceeded:false,inputDigest:d,outputDigest:d});
function validator(run=async()=>passed()){let n=0;return new RequiredValidation({key:randomBytes(32),profiles,execution,run,now:()=>n++});}
test('all mandatory profiles are required and exact result is reusable across action IDs',async()=>{
 const calls=[],v=validator(async(r,a,p)=>{calls.push(p.profileId);return passed();});const receipt=await v.validate(result,attempt);
 assert.deepEqual(calls,['core','integration']);assert.equal(await v.eligible(result,receipt,d,'1'),true);assert.equal(validationIdentity({...result,actionId:'new'}),receipt.validationId);
 assert.equal(await v.eligible({...result,commitOid:'sha1:'+'4'.repeat(40)},receipt,d,'1'),false);
 for(const changed of [{policyDigest:other},{generation:'2',resultId:'different'},{execution:{...execution,toolchainDigest:other}}])assert.equal(await v.eligible({...result,...changed},receipt,d,'1'),false);
 assert.equal(await v.eligible(result,receipt,other,'1'),false);assert.equal(await v.eligible(result,receipt,d,'2'),false);
});
test('receipt MAC rejects omission, changed exit, reordered/missing profile and copied signature',async()=>{
 const v=validator(),receipt=await v.validate(result,attempt);
 for(const patch of [{exitCode:7},{outcomes:receipt.outcomes.slice(0,1)},{outcomes:[...receipt.outcomes].reverse()},{inputDigest:other},{signature:d},{runId:'changed'},{attempt:{...attempt,ownerEpoch:'2'}}])assert.equal(await v.eligible(result,{...receipt,...patch},d,'1'),false);
 assert.equal(await validator().eligible(result,receipt,d,'1'),false);
});
test('failed exit, deadline, signal and modified bytes cannot become eligible despite a signed report',async()=>{
 for(const patch of [{exitCode:1},{exitCode:null},{signal:'SIGTERM'},{deadlineExceeded:true},{inputDigest:other},{outputDigest:other}]){const v=validator(async()=>({...passed(),...patch}));const receipt=await v.validate(result,attempt);assert.equal(receipt.exitCode,1);assert.equal(await v.eligible(result,receipt,d,'1'),false);}
});
test('empty, missing or reordered required profile configurations fail closed',()=>{
 for(const list of [[],profiles.slice(0,1),[profiles[1],profiles[0]],[profiles[0],profiles[0]]])assert.throws(()=>new RequiredValidation({key:randomBytes(32),profiles:list,execution,run:async()=>passed()}));
 assert.throws(()=>new RequiredValidation({key:new Uint8Array(16),profiles,execution,run:async()=>passed()}));
});
test('adopted profile parameters cannot add shell/environment or silently change a fixed command',()=>{
 const policy={digest:d,profiles:profiles.map(profile=>({profile,parameterSchema:{type:'object',additionalProperties:false,properties:{}}})),required:['core','integration'],execution};const selected=new AdoptedPolicy(policy);
 assert.equal(selected.profile('core',{}).profileId,'core');assert.throws(()=>selected.profile('core',{shell:'echo'}));assert.throws(()=>selected.profile('unknown',{}));assert.equal(selected.required().length,2);
 assert.throws(()=>new AdoptedPolicy({...policy,required:['core']}));
});
