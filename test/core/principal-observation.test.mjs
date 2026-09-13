import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {canonicalJson} from '../../src/contracts/canonical.mjs';
import {installationAuthorization} from '../../src/security/installation-authorization.mjs';
import {authorizationFromObservedPrincipal,principalObservationPath,readPrincipalObservations,recordVerifiedPrincipalObservation} from '../../src/security/principal-observation.mjs';
const owner='a'.repeat(64),second='b'.repeat(64);
test('verified principal observations are private digest-only evidence and never grant by themselves',async()=>{
 const root=await mkdtemp(join(tmpdir(),'dev2-principal-observation-'));try{await mkdir(join(root,'private'),{mode:0o700});const filename=principalObservationPath(root),assertion='signed-access-assertion-fixture';
  const first=await recordVerifiedPrincipalObservation({filename,subject:second,assertion,now:()=>1789272000000});const duplicate=await recordVerifiedPrincipalObservation({filename,subject:second,assertion,now:()=>1789272001000});assert.equal(duplicate.observationId,first.observationId);
  const concurrent=await Promise.all([recordVerifiedPrincipalObservation({filename,subject:second,assertion:'signed-access-assertion-2',now:()=>1789272002000}),recordVerifiedPrincipalObservation({filename,subject:second,assertion:'signed-access-assertion-3',now:()=>1789272003000})]);assert.notEqual(concurrent[0].observationId,concurrent[1].observationId);
  const raw=await readFile(filename,'utf8');assert.doesNotMatch(raw,/signed-access-assertion/);const observations=await readPrincipalObservations(filename);assert.equal(observations.observations.length,3);assert.ok(observations.observations.every(row=>row.subject===second&&row.assertionDigest.startsWith('sha256:')));
  const authorization=installationAuthorization({schemaVersion:1,ownerSubjectDigest:owner,principals:[]});const desired=authorizationFromObservedPrincipal({authorization,observations,observationId:first.observationId,capabilities:['repository.read'],paths:['src'],deniedPaths:['src/private']});assert.equal(desired.ownerSubjectDigest,owner);assert.equal(canonicalJson(desired.principals),canonicalJson([{subject:second,capabilities:['repository.read'],paths:['src'],deniedPaths:['src/private']}]));
  assert.throws(()=>authorizationFromObservedPrincipal({authorization,observations,observationId:'c'.repeat(64),capabilities:['repository.read'],paths:[''],deniedPaths:[]}),{code:'FORBIDDEN'});
  const ownerObservation=await recordVerifiedPrincipalObservation({filename,subject:owner,assertion:'owner-signed-assertion',now:()=>1789272004000}),withOwner=await readPrincipalObservations(filename);assert.throws(()=>authorizationFromObservedPrincipal({authorization,observations:withOwner,observationId:ownerObservation.observationId,capabilities:['repository.read'],paths:[''],deniedPaths:[]}),{code:'FORBIDDEN'});
  await chmod(filename,0o644);await assert.rejects(readPrincipalObservations(filename),{code:'FORBIDDEN'});
 }finally{await rm(root,{recursive:true,force:true});}
});
