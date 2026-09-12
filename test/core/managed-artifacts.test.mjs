import test from 'node:test';
import assert from 'node:assert/strict';
import {artifactMountArguments,ManagedSandbox} from '../../src/execution/managed-sandbox.mjs';
import {managedPolicy,supportsManagedPolicy,approvedManagedProfile} from '../../src/validation/managed-policy.mjs';
import {qualifiedPolicy} from '../../src/release/policy.mjs';
const D='sha256:'+'1'.repeat(64),identities={trustedRunnerDigest:D,toolchainDigest:D,dependencyLockDigest:D,imageDigest:D};
test('managed artifact mounts are only read-only controller and reserved locked dependency overlays',()=>{
 const args=artifactMountArguments('/sealed/controller','/sealed/dependencies/node_modules','/attempts/a/source');assert.equal(args.length,3);assert.ok(args.every(arg=>arg.endsWith(',ro=true')));assert.deepEqual(args.map(a=>a.split(',dst=')[1].split(',')[0]),['/controller','/controller/node_modules','/source/node_modules']);
 for(const paths of [['/attempts/a/source','/deps','/attempts/a/source'],['/c,ro=false','/deps','/source'],['/controller','/source/node_modules','/source'],['relative','/deps','/source']])assert.throws(()=>artifactMountArguments(...paths));
});
test('managed policy has two mandatory trusted entrypoints and cannot adopt candidate-selected argv',()=>{
 const policy=managedPolicy(identities);assert.deepEqual(policy.policy.required,['core','integration']);assert.equal(qualifiedPolicy({schemaVersion:1,...policy.policy}).policy.digest,policy.policy.digest);assert.equal(supportsManagedPolicy(policy,identities),true);
 for(const p of policy.required()){assert.equal(p.argv[1],'/controller/tools/validate.mjs');assert.equal(p.argv.includes('/source/tools/validate.mjs'),false);assert.equal(p.network,'none');assert.deepEqual(approvedManagedProfile(p,policy),p);assert.throws(()=>approvedManagedProfile({...p,argv:['/bin/sh','-c','true']},policy));}
 const changed={policy:structuredClone(policy.policy)};changed.policy.execution.trustedRunnerDigest='sha256:'+'2'.repeat(64);assert.equal(supportsManagedPolicy(changed,identities),false);
});
test('candidate-controlled node_modules or an unapproved lock is rejected before materialization',async()=>{
 let materializations=0;const sandbox=new ManagedSandbox({executable:'/podman',environment:{},attemptRoot:'/attempts',seccompPath:'/seccomp',seccompDigest:D,images:{[D]:'registry/image@'+D},productionSeal:true,controller:{directory:'/controller',digest:D},dependencies:{directory:'/deps',identity:D,lockDigest:D},materialize:async()=>{materializations++;return '/never';}});
 const attempt={installationId:'i',repositoryId:'r',workId:'w',actionId:'a',attemptId:'t',attempt:'1',ownerEpoch:'1'},lock={path:'package-lock.json',mode:'100644',contentDigest:D,blobOid:'sha1:'+'1'.repeat(40),size:1};
 for(const entries of [[lock,{...lock,path:'node_modules/x'}],[{...lock,contentDigest:'sha256:'+'2'.repeat(64)}]])await assert.rejects(sandbox.options.materialize(attempt,{entries,treeOid:'sha1:'+'1'.repeat(40),manifestDigest:D}));assert.equal(materializations,0);
});
