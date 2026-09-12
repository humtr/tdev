// Test-only module seams; no GitHub request, signed live OIDC or kernel claim.
import {mock} from 'node:test';
import assert from 'node:assert/strict';
import {productionFixture,D} from './production-fixture.mjs';
import {parseRecord,canonicalJson} from '../../src/contracts/canonical.mjs';
import {managedPolicy} from '../../src/validation/managed-policy.mjs';
import {AdoptedPolicy} from '../../src/validation/policy.mjs';
const f=await productionFixture();let providerLaunches=0;const completions=[],executing=new Set();
const legacySource={...f.source,treeOid:'sha1:'+'9'.repeat(40)},legacyIdentities={...f.definition.identities,trustedRunnerDigest:D(0)},legacyDefinition={...f.definition,identities:legacyIdentities,policy:managedPolicy(legacyIdentities),config:{...f.definition.config,executionShape:undefined}};
const pump=setInterval(()=>{for(const row of f.ledger.transact(tx=>tx.all("SELECT session_id FROM managed_dispatch WHERE state='pending'"))){const run=(async()=>{const sid=row.session_id,s=f.ledger.transact(tx=>f.sessions.session(tx,sid));if(!s.run)return;const a=f.pool.poll(f.activate(sid)).assignment;if(!a||executing.has(a.assignmentId))return;executing.add(a.assignmentId);const payload=parseRecord(await f.objects.get(a.input.payloadDigest),16777216);await f.complete(a,payload.profile);})();completions.push(run);run.catch(()=>{});}},10);
mock.module('../../src/execution/controller-identity.mjs',{namedExports:{managedDefinition:async(repository,source)=>source===legacySource?legacyDefinition:f.definition}});
mock.module('../../src/execution/github-sessions.mjs',{namedExports:{GitHubSessions:class{
 constructor(o){this.sessions=o.sessions;}
 async launch(sid){providerLaunches++;f.activate(sid);}
 async refresh(sid){return this.sessions.ledger.transact(tx=>this.sessions.session(tx,sid));}
 async authorization(){throw Error('Fixture must not perform live authentication');}
}}});
try{
 const {createProductionCommissioning}=await import('../../src/runtime/production-commissioning.mjs');
 const repository={readCommit:async(b,commit)=>({commitOid:commit,source:commit==='sha1:'+'9'.repeat(40)?legacySource:f.source,parents:[]}),blob:async()=>{throw Error('unexpected blob');}};
 const options=()=>({intent:f.intent,qualificationSealDigest:D(0),runtime:f.runtime,repository,binding:f.binding,ledger:f.ledger,objects:f.objects,token:'fixture-token-only',origin:f.definition.config.origin,capacity:8,wake:()=>{}});
 const c=await createProductionCommissioning(options());assert.equal(c.builder,undefined);assert.equal(c.validation,undefined);
 const p=c.run();assert.equal(c.run(),p);const enrollment=await p;assert.equal(enrollment.proofs.length,3);const count=providerLaunches;assert.equal(executing.size,3);assert.equal(canonicalJson(await c.run()),canonicalJson(enrollment));assert.equal(providerLaunches,count);
 f.restart();const restarted=await createProductionCommissioning(options());assert.equal(canonicalJson(await restarted.run()),canonicalJson(enrollment));assert.equal(providerLaunches,count);await Promise.all(completions);
 const {createProductionControl}=await import('../../src/runtime/production.mjs');
 const installed=await createProductionControl({...options(),enrollment,installationSealDigest:D(5)});assert.ok(installed.builder);assert.equal(installed.enrolled.sealDigest,enrollment.sealDigest);assert.equal(providerLaunches,count,'verification does not launch evidence');
 // Only the historical qualification verification is a seam here; its complete
 // positive/negative contract is exercised independently by native-enrollment.
 // Production verification, receipt joins, capability and managed composition
 // remain real, so a forged production record cannot reach legacy restoration.
 let legacyChecks=0;
 mock.module('../../src/runtime/enrollment.mjs',{namedExports:{verifyEnrollment:e=>{legacyChecks++;return {enrollment:e,policy:legacyDefinition.policy,definition:legacyDefinition,sealDigest:D(0)};}}});
 const {createManagedControl}=await import('../../src/runtime/managed.mjs');
 const legacy={approvedCommitOid:'sha1:'+'9'.repeat(40),repositoryOwnerId:'456',repositoryFullName:'owner/repo',nativeJoin:{fixtureOnly:true},sealDigest:D(0)};
 const initialPolicy=new AdoptedPolicy({...legacyDefinition.policy.policy,digest:f.binding.policyDigest,execution:{...legacyDefinition.policy.policy.execution,environmentClass:'github-hosted-unsealed'}});
 const managedOptions={...options(),intent:undefined,enrollment:legacy,productionEnrollment:enrollment,installationSealDigest:D(5),initialPolicy,authorization:{authorize:async()=>{}},remote:{resolve:async()=>{throw Error('No canonical fixture effect');}},verifyLineage:async()=>true,receiptSecret:Buffer.alloc(32,1)};
 const managed=await createManagedControl(managedOptions);assert.ok(managed.production.builder);assert.equal(managed.production.enrolled.sealDigest,enrollment.sealDigest);assert.equal(managed.validation().productionEnrollment,null,'historical source policy is not promoted');assert.throws(()=>managed.validationFor(f.integrated.result),{code:'VALIDATION_FAILED'},'enrollment alone does not adopt a new validation policy');assert.equal(managed.poolFor(f.definition.policy.policy.execution),managed.production.pool);assert.equal(managed.poolFor(legacyDefinition.policy.policy.execution),managed.pool);
 // PolicyState adoption/CAS has independent tests. Inject its current selection
 // only to exercise the composed validator port, never to install an enrollment.
 managed.policyState.current=f.definition.policy;assert.equal(managed.validation().productionEnrollment,enrollment.sealDigest);assert.equal(managed.identity().sealDigest,enrollment.sealDigest);managed.policyState.current=legacyDefinition.policy;
 const checks=legacyChecks;await assert.rejects(createManagedControl({...managedOptions,productionEnrollment:{...enrollment,sealDigest:D(0)}}));assert.equal(legacyChecks,checks,'production failure precedes legacy restore');
 const qualified=await createManagedControl({...managedOptions,productionEnrollment:undefined});assert.equal(qualified.production,null);assert.equal(qualified.validation().productionEnrollment,null);assert.equal(providerLaunches,count);
}finally{clearInterval(pump);await Promise.allSettled(completions);await f.close();mock.restoreAll();}
