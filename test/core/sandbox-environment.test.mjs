import test from 'node:test';
import assert from 'node:assert/strict';
import {createArguments,attemptName} from '../../src/execution/podman.mjs';
import {execFileSync} from 'node:child_process';
const hash='sha256:'+'1'.repeat(64),attempt={installationId:'i',repositoryId:'r',workId:'w',actionId:'a',attemptId:'t',attempt:'1',ownerEpoch:'1'};
const profile={profileId:'environment',digest:hash,argv:['/usr/local/bin/node','-e','process.stdout.write("not a shell")'],cwd:'',parameters:{},timeoutMs:10000,killGraceMs:1000,memoryBytes:67108864,pids:32,cpuMillis:1000,diskBytes:16777216,logBytes:65536,network:'none',imageDigest:hash,replaySafe:true};
test('the image entrypoint clears engine-injected environment without changing fixed candidate argv',()=>{
 const image='registry.example/node@'+hash,options={executable:'/usr/bin/podman',environment:{},attemptRoot:'/attempts',seccompPath:'/sealed/seccomp.json',seccompDigest:hash,images:{[hash]:image},productionSeal:true,materialize:async()=>''};
 const args=createArguments(attempt,profile,'/attempts/'+attemptName(attempt)+'/source',options);
 assert.ok(args.includes('--entrypoint=/usr/bin/env'));
 assert.deepEqual(args.slice(args.indexOf(image)+1),['-i','--','HOME=/work','TMPDIR=/tmp','PATH=/usr/local/bin:/usr/bin:/bin',...profile.argv]);
 assert.equal(args.some(arg=>arg.includes('/bin/sh')),false);
});
test('real env clearing does not pass inherited hostname or credential canaries to the child',()=>{
 const executable=execFileSync('which',['env'],{encoding:'utf8'}).trim();
 const output=execFileSync(executable,['-i','--','HOME=/work','TMPDIR=/tmp','PATH=/usr/local/bin:/usr/bin:/bin',process.execPath,'-e','process.stdout.write(JSON.stringify(Object.keys(process.env).sort()))'],{encoding:'utf8',env:{...process.env,HOSTNAME:'host-secret',DEV2_CONTROL_CANARY:'must-not-cross'}});
 assert.deepEqual(JSON.parse(output),['HOME','PATH','TMPDIR']);
});
