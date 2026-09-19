import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {c22PrincipalObservationPath,isC22PrincipalObservationRequest,readC22PrincipalObservations,recordVerifiedC22PrincipalObservation} from '../../src/security/c2-2-principal-observation.mjs';

const subject='a'.repeat(64);

test('C2-2 principal observation accepts only exact current self context shape',()=>{
 assert.equal(isC22PrincipalObservationRequest({apiVersion:1}),true);
 assert.equal(isC22PrincipalObservationRequest({apiVersion:1,repository:'self',freshness:'current'}),true);
 assert.equal(isC22PrincipalObservationRequest({apiVersion:1,repository:'other'}),false);
 assert.equal(isC22PrincipalObservationRequest({apiVersion:1,freshness:'pinned'}),false);
 assert.equal(isC22PrincipalObservationRequest({apiVersion:1,snapshotId:'x'}),false);
 assert.equal(isC22PrincipalObservationRequest(null),false);
});

test('verified C2-2 principal observations retain digest-only evidence and never raw assertions',async()=>{
 const root=await mkdtemp(join(tmpdir(),'tdev-c2-2-principal-observation-'));try{await mkdir(join(root,'private'),{mode:0o700});const filename=c22PrincipalObservationPath(root),assertion='signed-access-assertion-fixture';
  const first=await recordVerifiedC22PrincipalObservation({filename,subject,assertion,now:()=>1789792800000});
  const duplicate=await recordVerifiedC22PrincipalObservation({filename,subject,assertion,now:()=>1789792801000});assert.equal(duplicate.observationId,first.observationId);
  const second=await recordVerifiedC22PrincipalObservation({filename,subject,assertion:'signed-access-assertion-2',now:()=>1789792802000});assert.notEqual(second.observationId,first.observationId);
  const raw=await readFile(filename,'utf8');assert.doesNotMatch(raw,/signed-access-assertion/);
  const observations=await readC22PrincipalObservations(filename);assert.equal(observations.observations.length,2);assert.ok(observations.observations.every(row=>row.subject===subject&&row.assertionDigest.startsWith('sha256:')));
  await chmod(filename,0o644);await assert.rejects(readC22PrincipalObservations(filename),{code:'FORBIDDEN'});
 }finally{await rm(root,{recursive:true,force:true});}
});
