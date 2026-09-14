import {canonicalJson,recordDigest} from '../src/contracts/canonical.mjs';
import {requireThat} from '../src/contracts/errors.mjs';
import {composeTrees,verifySource} from '../src/candidate/tree.mjs';
import {canonicalEntries,sameEntry,sourceManifest} from '../src/repository/entries.mjs';
/** @typedef {import('../src/contracts/ports.js').SourceTree} SourceTree */
/** @typedef {import('../src/contracts/ports.js').SourceEntry} SourceEntry */
/** @typedef {{candidateId:string,validationId:string,baseCommitOid:string,baseTreeOid:string,validated:boolean,source:SourceTree}} ResearchCandidate */
/** @typedef {{repositoryId:string,bindingEpoch:string,baseCommitOid:string,baseTreeOid:string,currentHead:string,base:SourceTree,candidates:readonly ResearchCandidate[]}} CompositionInput */
/** @typedef {{candidateId:string,validationId:string,candidateTreeOid:string,candidateManifestDigest:string,changedPaths:string[]}} CompositionMember */
/** @typedef {{kind:'fallback',reason:string,fallback:'d0003_full_validation'}} CompositionFallback */
/** @typedef {{kind:'composable',compositionIdentity:string,members:CompositionMember[],composed:SourceTree}} CompositionSuccess */

export const COST_METRICS=Object.freeze([
 'fullValidationExecutions','validationCpuMs','managedSessions','coldStarts','gitPublications','casAttempts','failedCas','staleRecompositions','githubApiOperations','workersRequests','durableObjectOperations','requestResponseBytes','repositorySourceBytes','wallMs','usefulSlotMs','wastedSlotMs'
]);

/** A bounded R1 accounting surface. Null means not measured, never zero.
 * @param {{completedTasks:number,[key:string]:number|null|undefined}} sample */
export function accountDevelopmentCost(sample){
 requireThat(sample&&Number.isSafeInteger(sample.completedTasks)&&sample.completedTasks>0,'INVALID_ARGUMENT','Completed task count');
 /** @type {Record<string,number|null>} */ const metrics={};
 /** @type {string[]} */ const measured=[];
 /** @type {string[]} */ const unmeasured=[];
 /** @type {Record<string,{numerator:number,denominator:number}>} */ const perCompletedTask={};
 for(const name of COST_METRICS){const raw=sample[name],value=raw===undefined?null:raw;requireThat(value===null||Number.isSafeInteger(value)&&value>=0,'INVALID_ARGUMENT','Cost metric: '+name);metrics[name]=value;if(value===null)unmeasured.push(name);else{measured.push(name);perCompletedTask[name]={numerator:value,denominator:sample.completedTasks};}}
 return {completedTasks:sample.completedTasks,metrics,measured,unmeasured,perCompletedTask};
}

/** @param {readonly SourceEntry[]} entries @returns {SourceTree} */
function sourceTree(entries){const value=canonicalEntries(entries);const manifestDigest=sourceManifest(value);return {treeOid:'sha1:'+manifestDigest.slice(7,47),manifestDigest,entries:value};}
/** @param {SourceTree} base @param {SourceTree} candidate @returns {string[]} */
export function changedPaths(base,candidate){
 const b=new Map(verifySource(base).map(e=>[e.path,e])),c=new Map(verifySource(candidate).map(e=>[e.path,e])),paths=new Set([...b.keys(),...c.keys()]);
 return [...paths].filter(path=>!sameEntry(b.get(path),c.get(path))).sort();
}
/** @param {SourceTree} base @param {readonly ResearchCandidate[]} candidates @returns {SourceTree} */
function sequentialTree(base,candidates){let current=base;for(const member of candidates)current=sourceTree(composeTrees(base,member.source,current));return current;}
/** @param {number} before @param {number} after */
function reductionBps(before,after){return before===0?0:Math.floor((before-after)*10000/before);}
/** @param {string} reason @returns {CompositionFallback} */
function fallback(reason){return {kind:'fallback',reason,fallback:'d0003_full_validation'};}

/** Pure research-only deterministic composition. It grants no validation or publication authority.
 * @param {CompositionInput} input @returns {CompositionFallback|CompositionSuccess} */
export function composeValidatedCandidates(input){
 requireThat(input&&Array.isArray(input.candidates)&&input.candidates.length>0&&input.candidates.length<=64,'INVALID_ARGUMENT','Candidate set');
 verifySource(input.base);if(input.currentHead!==input.baseCommitOid)return fallback('late_head_movement');
 /** @type {Set<string>} */ const ids=new Set();
 /** @type {Map<string,string>} */ const pathOwner=new Map();
 /** @type {{member:ResearchCandidate,paths:string[]}[]} */ const prepared=[];
 for(const member of input.candidates){
  requireThat(/^[A-Za-z0-9_-]{1,128}$/.test(member.candidateId)&&/^sha256:[0-9a-f]{64}$/.test(member.validationId),'INVALID_ARGUMENT','Candidate evidence identity');
  if(ids.has(member.candidateId))return fallback('duplicate_candidate');ids.add(member.candidateId);
  if(!member.validated)return fallback('unvalidated_candidate');
  if(member.baseCommitOid!==input.baseCommitOid||member.baseTreeOid!==input.baseTreeOid)return fallback('wrong_base');
  const paths=changedPaths(input.base,member.source);if(paths.length===0)return fallback('no_change');
  for(const path of paths){if(pathOwner.has(path))return fallback('candidate_conflict');pathOwner.set(path,member.candidateId);}
  prepared.push({member,paths});
 }
 prepared.sort((a,b)=>a.member.candidateId.localeCompare(b.member.candidateId));
 const after=new Map(verifySource(input.base).map(e=>[e.path,{...e}]));
 const baseByPath=new Map(verifySource(input.base).map(e=>[e.path,e]));
 for(const {member,paths} of prepared){const candidateByPath=new Map(verifySource(member.source).map(e=>[e.path,e]));for(const path of paths){requireThat(!sameEntry(baseByPath.get(path),candidateByPath.get(path)),'INTEGRITY_FAILURE');const entry=candidateByPath.get(path);if(entry)after.set(path,{...entry});else after.delete(path);}}
 const composed=sourceTree([...after.values()]);
 const members=prepared.map(({member,paths})=>({candidateId:member.candidateId,validationId:member.validationId,candidateTreeOid:member.source.treeOid,candidateManifestDigest:member.source.manifestDigest,changedPaths:paths}));
 const compositionIdentity=recordDigest('dev2.research-composition.v1',{repositoryId:input.repositoryId,bindingEpoch:input.bindingEpoch,baseCommitOid:input.baseCommitOid,baseTreeOid:input.baseTreeOid,members,composedManifestDigest:composed.manifestDigest});
 return {kind:'composable',compositionIdentity,members,composed};
}

/** Deterministic cheap falsifier for the N-way same-base structural amplification claim.
 * Physical CPU/session/provider values remain null until a live trace measures them.
 * @param {CompositionInput} input */
export function runCompositionFalsifier(input){
 const experimental=composeValidatedCandidates(input);if(experimental.kind!=='composable')return experimental;
 const ordered=[...input.candidates].sort((a,b)=>a.candidateId.localeCompare(b.candidateId));const currentFinal=sequentialTree(input.base,ordered);
 const exactFinalTreeEquality=canonicalJson(currentFinal.entries)===canonicalJson(experimental.composed.entries)&&currentFinal.manifestDigest===experimental.composed.manifestDigest;
 const n=ordered.length,stale=n*(n-1)/2,currentFull=n+stale,experimentalFull=n+1;
 const physical={validationCpuMs:null,managedSessions:null,coldStarts:null,failedCas:null,githubApiOperations:null,workersRequests:null,durableObjectOperations:null,requestResponseBytes:null,repositorySourceBytes:null,wallMs:null,usefulSlotMs:null,wastedSlotMs:null};
 const current=accountDevelopmentCost({completedTasks:n,fullValidationExecutions:currentFull,gitPublications:n,casAttempts:n,staleRecompositions:stale,...physical});
 const proposed=accountDevelopmentCost({completedTasks:n,fullValidationExecutions:experimentalFull,gitPublications:1,casAttempts:1,staleRecompositions:0,...physical});
 const safetyViolations=exactFinalTreeEquality?[]:['final_tree_mismatch'];
 return {kind:'composable',compositionIdentity:experimental.compositionIdentity,candidateCount:n,exactFinalTreeEquality,current,experimental:proposed,reductionsBps:{fullValidationExecutions:reductionBps(currentFull,experimentalFull),staleRecompositions:reductionBps(stale,0),gitPublications:reductionBps(n,1),casAttempts:reductionBps(n,1)},safetyViolations};
}
