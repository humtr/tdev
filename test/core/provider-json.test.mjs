import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedProviderJson} from '../../src/execution/provider-json.mjs';
import {parseRecord,canonicalJson} from '../../src/contracts/canonical.mjs';
import {PodmanSandbox} from '../../src/execution/podman.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {bytesDigest} from '../../src/contracts/canonical.mjs';
test('provider observations accept fractional metrics without weakening canonical identities',()=>{
 const text='{"host":{"loadAverage":0.125,"security":{"rootless":true}}}';
 assert.equal(boundedProviderJson(text).host.loadAverage,0.125);
 assert.throws(()=>parseRecord(text),{code:'INVALID_ARGUMENT'});
 assert.throws(()=>canonicalJson({metric:0.125}),{code:'INVALID_ARGUMENT'});
 assert.throws(()=>boundedProviderJson(text,8),{code:'LIMIT_EXCEEDED'});
 assert.throws(()=>boundedProviderJson('{"host":NaN}'),{code:'EXECUTION_UNAVAILABLE'});
 assert.throws(()=>boundedProviderJson(Buffer.from([0xff])),{code:'EXECUTION_UNAVAILABLE'});
});
test('Podman preflight projects enforcing predicates from real-shaped provider metrics',async()=>{
 const root=await mkdtemp(join(tmpdir(),'dev2-provider-json-'));try{
  const bytes=Buffer.from('{"defaultAction":"SCMP_ACT_ERRNO"}');const path=join(root,'seccomp.json');await writeFile(path,bytes);
  let rootless=true;const sandbox=new PodmanSandbox({executable:'/usr/bin/podman',environment:{},attemptRoot:root,seccompPath:path,seccompDigest:bytesDigest(bytes),images:{},productionSeal:true,materialize:async()=>'',command:async()=>({exitCode:0,signal:null,stdout:Buffer.from(JSON.stringify({host:{security:{rootless,seccompEnabled:true},cgroupVersion:'v2',cgroupControllers:['cpu','memory','pids'],freeLocks:2048,loadAverage:0.125}})),stderr:Buffer.alloc(0),discardedBytes:0,timedOut:false,spawnFailed:false})});
  await sandbox.preflight();rootless=false;await assert.rejects(()=>sandbox.preflight(),{code:'EXECUTION_UNAVAILABLE'});
 }finally{await rm(root,{recursive:true,force:true});}
});
