import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,chmod,rename,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {canonicalJson} from '../../src/contracts/canonical.mjs';
import {ScopedAuthorization,CAPABILITIES} from '../../src/security/authorization.mjs';
import {installationOwnerGrant} from '../../src/security/installation-grant.mjs';
import {installationAuthorization,installationAuthorizationGrants,installationAuthorizationPath,installationGrantSource} from '../../src/security/installation-authorization.mjs';
const scope={installationId:'installation',repositoryId:'repository',ref:'refs/heads/dev-2'};
const binding={...scope,provider:'github',providerRepositoryId:'1',remote:'https://github.com/fixture/repository.git',bindingEpoch:'1',policyDigest:'sha256:'+'a'.repeat(64)};
const owner='b'.repeat(64),second='c'.repeat(64);
const principal=subject=>({subject,issuer:'https://fixture.cloudflareaccess.com',audience:'https://fixture.test.workers.dev',expiresAt:Date.now()+60000,tokenCapabilities:CAPABILITIES});
const record=principals=>({schemaVersion:1,ownerSubjectDigest:owner,principals});
test('private authorization record preserves owner and compiles explicit additional grants',()=>{
 const value=installationAuthorization(record([{subject:second,capabilities:['repository.read','work.write'],paths:[''],deniedPaths:['private']} ]));
 const grants=installationAuthorizationGrants(value,scope);assert.equal(grants.length,2);assert.deepEqual(grants[0],installationOwnerGrant({subject:owner,...scope}));assert.equal(grants[1].subject,second);assert.deepEqual(grants[1].capabilities,['repository.read','work.write']);
 assert.throws(()=>installationAuthorization(record([{subject:owner,capabilities:['repository.read'],paths:[''],deniedPaths:[]} ])),{code:'INVALID_ARGUMENT'});
 assert.throws(()=>installationAuthorization(record([{subject:second,capabilities:['repository.read'],paths:[''],deniedPaths:[]},{subject:second,capabilities:['work.write'],paths:[''],deniedPaths:[]} ])),{code:'INVALID_ARGUMENT'});
});
test('live private grant source is owner-compatible, additive and revocable on the next lookup',async()=>{
 const root=await mkdtemp(join(tmpdir(),'dev2-authz-'));try{await mkdir(join(root,'private'),{mode:0o700});const filename=installationAuthorizationPath(root),fallback=[installationOwnerGrant({subject:owner,...scope})],source=installationGrantSource({filename,fallback,scope});
  const auth=new ScopedAuthorization({issuer:principal(owner).issuer,audience:principal(owner).audience,bindings:()=>[binding],grants:()=>source.current()});
  await auth.authorize(principal(owner),binding,'repository.read');await assert.rejects(auth.authorize(principal(second),binding,'repository.read'),{code:'FORBIDDEN'});
  const add=canonicalJson(record([{subject:second,capabilities:['repository.read'],paths:[''],deniedPaths:[]}]))+'\n';await writeFile(filename+'.new',add,{mode:0o600});await rename(filename+'.new',filename);
  await auth.authorize(principal(second),binding,'repository.read');await assert.rejects(auth.authorize(principal(second),binding,'work.write'),{code:'FORBIDDEN'});
  const remove=canonicalJson(record([]))+'\n';await writeFile(filename+'.new',remove,{mode:0o600});await rename(filename+'.new',filename);await assert.rejects(auth.authorize(principal(second),binding,'repository.read'),{code:'FORBIDDEN'});await auth.authorize(principal(owner),binding,'runtime.activate');
  await chmod(filename,0o644);assert.throws(()=>source.current(),{code:'FORBIDDEN'});
 }finally{await rm(root,{recursive:true,force:true});}
});
