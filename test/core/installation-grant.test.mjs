import test from 'node:test';
import assert from 'node:assert/strict';
import {installationOwnerGrant} from '../../src/security/installation-grant.mjs';
import {ScopedAuthorization,CAPABILITIES} from '../../src/security/authorization.mjs';
const binding={installationId:'installation',repositoryId:'repository',provider:'github',providerRepositoryId:'1',remote:'https://github.com/fixture/repository.git',ref:'refs/heads/dev-2',bindingEpoch:'1',policyDigest:'sha256:'+'a'.repeat(64)};
test('installed owner grant supports exact repository source access without losing installation/path scope',async()=>{
 const subject='b'.repeat(64),grant=installationOwnerGrant({subject,installationId:binding.installationId,repositoryId:binding.repositoryId,ref:binding.ref});
 const principal={subject,issuer:'https://fixture.cloudflareaccess.com',audience:'https://fixture.test.workers.dev',expiresAt:Date.now()+60000,tokenCapabilities:CAPABILITIES};
 const authorization=new ScopedAuthorization({issuer:principal.issuer,audience:principal.audience,bindings:()=>[binding],grants:()=>[grant]});
 await authorization.authorize(principal,binding,'repository.read',['','AGENTS.md','src/runtime/native.mjs']);
 await authorization.authorize(principal,binding,'work.write',['src/example.mjs']);
 await assert.rejects(authorization.authorize({...principal,subject:'c'.repeat(64)},binding,'repository.read'),{code:'FORBIDDEN'});
 await assert.rejects(authorization.authorize(principal,{...binding,installationId:'other'},'repository.read'),{code:'FORBIDDEN'});
 await assert.rejects(authorization.authorize({...principal,tokenCapabilities:['repository.read']},binding,'work.write'),{code:'FORBIDDEN'});
});
