import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceManifest} from '../../src/repository/entries.mjs';
import {validationIdentity} from '../../src/validation/receipts.mjs';
import {COST_METRICS,accountDevelopmentCost,composeValidatedCandidates,runCompositionFalsifier} from '../../bench/cost-efficient-composition.mjs';
const baseCommitOid='sha1:'+'a'.repeat(40);
/** @param {import('../../src/contracts/ports.js').SourceEntry[]} entries */
function tree(entries){const manifestDigest=sourceManifest(entries);return {treeOid:'sha1:'+manifestDigest.slice(7,47),manifestDigest,entries};}
const base=tree([]);
/** @param {number} i @param {string} [path] */
function member(i,path='research-fixture/lane-'+i+'.txt'){const hex=((i%8)+1).toString(16);const source=tree([{path,mode:'100644',blobOid:'sha1:'+hex.repeat(40),contentDigest:'sha256:'+hex.repeat(64),size:1}]);return {candidateId:'w'+i,validationId:'sha256:'+hex.repeat(64),baseCommitOid,baseTreeOid:base.treeOid,validated:true,source};}
function input(candidates=Array.from({length:8},(_,i)=>member(i))){return {repositoryId:'r',bindingEpoch:'1',baseCommitOid,baseTreeOid:base.treeOid,currentHead:baseCommitOid,base,candidates};}

test('eight disjoint same-base candidates preserve the exact final tree while removing structural validation amplification',()=>{
 const result=runCompositionFalsifier(input());assert.equal(result.kind,'composable');assert.equal(result.candidateCount,8);assert.equal(result.exactFinalTreeEquality,true);assert.deepEqual(result.safetyViolations,[]);
 assert.equal(result.current.metrics.fullValidationExecutions,36);assert.equal(result.experimental.metrics.fullValidationExecutions,9);assert.equal(result.current.metrics.staleRecompositions,28);assert.equal(result.experimental.metrics.staleRecompositions,0);
 assert.equal(result.current.metrics.gitPublications,8);assert.equal(result.experimental.metrics.gitPublications,1);assert.equal(result.current.metrics.casAttempts,8);assert.equal(result.experimental.metrics.casAttempts,1);
 assert.deepEqual(result.reductionsBps,{fullValidationExecutions:7500,staleRecompositions:10000,gitPublications:8750,casAttempts:8750});
 assert.equal(result.current.metrics.managedSessions,null);assert.ok(result.current.unmeasured.includes('wallMs'));
});

test('composition is input-order independent and binds stable candidate provenance',()=>{
 const forward=composeValidatedCandidates(input()),reverse=composeValidatedCandidates(input([...input().candidates].reverse()));assert.equal(forward.kind,'composable');assert.equal(reverse.kind,'composable');assert.equal(forward.compositionIdentity,reverse.compositionIdentity);assert.deepEqual(forward.composed,reverse.composed);
});

test('conflict, late head, wrong base and missing validation fail closed to D0003 fallback',()=>{
 const conflicting=[member(0,'same.txt'),member(1,'same.txt')];assert.deepEqual(composeValidatedCandidates(input(conflicting)),{kind:'fallback',reason:'candidate_conflict',fallback:'d0003_full_validation'});
 assert.deepEqual(composeValidatedCandidates({...input(),currentHead:'sha1:'+'b'.repeat(40)}),{kind:'fallback',reason:'late_head_movement',fallback:'d0003_full_validation'});
 const wrong=member(0);wrong.baseCommitOid='sha1:'+'b'.repeat(40);assert.deepEqual(composeValidatedCandidates(input([wrong])),{kind:'fallback',reason:'wrong_base',fallback:'d0003_full_validation'});
 const unvalidated=member(0);unvalidated.validated=false;assert.deepEqual(composeValidatedCandidates(input([unvalidated])),{kind:'fallback',reason:'unvalidated_candidate',fallback:'d0003_full_validation'});
});

test('R1 accounting distinguishes unmeasured physical cost from measured zero',()=>{
 const result=accountDevelopmentCost({completedTasks:8,fullValidationExecutions:36,gitPublications:8,casAttempts:8,staleRecompositions:28});assert.equal(Object.keys(result.metrics).length,COST_METRICS.length);assert.equal(result.metrics.failedCas,null);assert.deepEqual(result.perCompletedTask.fullValidationExecutions,{numerator:36,denominator:8});assert.ok(result.unmeasured.includes('workersRequests'));assert.ok(!result.measured.includes('workersRequests'));
});

test('current validation identity remains exact-tree sensitive; candidate evidence cannot authorize a composition',()=>{
 const d='sha256:'+'1'.repeat(64),oid='sha1:'+'2'.repeat(40),execution={orderedProfileDigests:[d],trustedRunnerDigest:d,toolchainDigest:d,environmentClass:'fixture',dependencyLockDigest:d};
 const result={resultId:'r',repositoryId:'repo',bindingEpoch:'1',expectedHead:oid,commitOid:oid,resultTreeOid:oid,resultTreeSha256:d,policyDigest:d,execution};
 const changed={...result,resultTreeOid:'sha1:'+'3'.repeat(40),resultTreeSha256:'sha256:'+'4'.repeat(64)};assert.notEqual(validationIdentity(result),validationIdentity(changed));
});
