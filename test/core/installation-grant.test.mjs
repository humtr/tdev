import test from 'node:test';
import assert from 'node:assert/strict';
import {installationOwnerGrant,installationPrincipalGrant} from '../../src/security/installation-grant.mjs';
import {ScopedAuthorization,CAPABILITIES} from '../../src/security/authorization.mjs';
const binding={installationId:'installation',repositoryId:'repository',provider:'github',providerRepositoryId:'1',remote:'https://github.com/fixture/repository.git',ref:'refs/heads/dev-2',bindingEpoch:'1',policyDigest:'sha256:'+'a'.repeat(64)};
const principal=(subject,capabilities=CAPABILITIES)=>({subject,issuer:'https://fixture.cloudflareaccess.com',audience:'https://fixture.test.workers.dev',expiresAt:Date.now()+60000,tokenCapabilities:capabilities});
test('installed owner grant supports exact repository source access without losing installation/path scope',async()=>{
 const subject='b'.repeat(64),grant=installationOwnerGrant({subject,installationId:binding.installationId,repositoryId:binding.repositoryId,ref:binding.ref});
 const authorization=new ScopedAuthorization({issuer:principal(subject).issuer,audience:principal(subject).audience,bindings:()=>[binding],grants:()=>[grant]});
 await authorization.authorize(principal(subject),binding,'repository.read',['','AGENTS.md','src/runtime/native.mjs']);
 await authorization.authorize(principal(subject),binding,'work.write',['src/example.mjs']);
 await assert.rejects(authorization.authorize(principal('c'.repeat(64)),binding,'repository.read'),{code:'FORBIDDEN'});
 await assert.rejects(authorization.authorize(principal(subject),{...binding,installationId:'other'},'repository.read'),{code:'FORBIDDEN'});
 await assert.rejects(authorization.authorize(principal(subject,['repository.read']),binding,'work.write'),{code:'FORBIDDEN'});
});
test('additional principal grant is explicit, scoped, narrowable and independent of owner',async()=>{
 const owner='b'.repeat(64),second='c'.repeat(64),grants=[installationOwnerGrant({subject:owner,installationId:binding.installationId,repositoryId:binding.repositoryId,ref:binding.ref}),installationPrincipalGrant({subject:second,installationId:binding.installationId,repositoryId:binding.repositoryId,ref:binding.ref,capabilities:['repository.read','work.write'],paths:['src'],deniedPaths:['src/private']})];
 const authorization=new ScopedAuthorization({issuer:principal(owner).issuer,audience:principal(owner).audience,bindings:()=>[binding],grants:()=>grants});
 await authorization.authorize(principal(owner),binding,'runtime.activate');
 await authorization.authorize(principal(second),binding,'repository.read',['src/runtime/native.mjs']);
 await authorization.authorize(principal(second),binding,'work.write',['src/edge/auth.mjs']);
 await assert.rejects(authorization.authorize(principal(second),binding,'runtime.activate'),{code:'FORBIDDEN'});
 await assert.rejects(authorization.authorize(principal(second),binding,'repository.read',['docs/design/D0005-security-execution-boundaries.md']),{code:'FORBIDDEN'});
 await assert.rejects(authorization.authorize(principal(second),binding,'repository.read',['src/private/secret']),{code:'FORBIDDEN'});
 await assert.rejects(authorization.authorize({...principal(second),issuer:'https://wrong.cloudflareaccess.com'},binding,'repository.read'),{code:'UNAUTHORIZED'});
 await assert.rejects(authorization.authorize({...principal(second),audience:'https://wrong.test.workers.dev'},binding,'repository.read'),{code:'UNAUTHORIZED'});
});
test('principal grant rejects malformed subject, duplicate capabilities and invalid paths',()=>{
 const base={subject:'c'.repeat(64),installationId:binding.installationId,repositoryId:binding.repositoryId,ref:binding.ref,capabilities:['repository.read'],paths:['src'],deniedPaths:[]};
 assert.throws(()=>installationPrincipalGrant({...base,subject:'not-a-digest'}),{code:'INVALID_ARGUMENT'});
 assert.throws(()=>installationPrincipalGrant({...base,capabilities:['repository.read','repository.read']}),{code:'INVALID_ARGUMENT'});
 assert.throws(()=>installationPrincipalGrant({...base,paths:['../escape']}),{code:'INVALID_ARGUMENT'});
});
