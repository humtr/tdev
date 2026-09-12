import {canonicalJson,parseRecord,recordDigest} from '../contracts/canonical.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {assertProductionEnrollment} from '../runtime/production-enrollment.mjs';
import {releaseBuildProfile,releaseBuildExecution} from './build-profile.mjs';
import {productionBuildOutput} from './production-output.mjs';
import {SCHEMA_DIGEST} from '../mcp/outputs.mjs';
import {releaseManifest} from './manifest.mjs';
import {specialActionFence} from './action.mjs';
/** @typedef {import('./authority.mjs').IntegratedSource} Source */
/** @typedef {import('./types.js').RuntimePair} Pair */
/** @typedef {import('./backend.mjs').Build} Build */
/** @typedef {{schemaVersion:1,actionId:string,inputDigest:string,sourceDigest:string,previous:Pair,result:import('../contracts/ports.js').PreparedResult,attempt:import('../contracts/ports.js').Attempt}} BuildInput */
/** One finite managed assignment per retained release action. All executable
 * bytes stay in the existing production sandbox; native only decodes objects.
 */
export class ManagedReleaseBuilder {
 /** @param {{production:Awaited<ReturnType<typeof import('../runtime/production-enrollment.mjs').verifyProductionEnrollment>>,pool:import('../execution/managed-pool.mjs').ManagedPool,objects:import('../contracts/ports.js').ObjectStorePort,installationSealDigest:string}} options */
 constructor(options){assertProductionEnrollment(options.production);this.o=options;this.ledger=options.pool.ledger;this.epoch=this.ledger.ownerEpoch;this.profile=releaseBuildProfile(options.production.enrollment.intent.identities.imageDigest);/** @type {Map<string,Promise<Build>>} */this.running=new Map();}
 assert(){assertProductionEnrollment(this.o.production);requireThat(!this.ledger.closed&&this.ledger.ownerEpoch===this.epoch,'STALE_REVISION');}
 /** @param {Source} source */
 sourceDigest(source){const r=source.result;requireThat(r.repositoryId===source.repositoryId&&r.bindingEpoch===source.bindingEpoch&&r.commitOid===source.commitOid&&r.resultTreeOid===source.source.treeOid&&r.resultTreeSha256===source.source.manifestDigest&&r.policyDigest===source.policyDigest,'INTEGRITY_FAILURE','Build source differs from integrated result');return recordDigest('dev2.release-build-source.v1',source);}
 /** @param {string} actionId @returns {BuildInput|null} */
 retained(actionId){this.assert();return this.ledger.transact(tx=>{const row=tx.get('SELECT value FROM meta WHERE key=?','release.build:'+actionId);return row?/** @type {BuildInput} */(parseRecord(String(row.value),2097152)):null;});}
 /** @param {string} actionId @param {Source} source @param {Pair} previous */
 input(actionId,source,previous){
  this.assert();const action=this.ledger.transact(tx=>tx.getAction(actionId));requireThat(action,'STALE_REVISION');
  const fence=specialActionFence(this.ledger,actionId,'release.stage',action.principal),sourceDigest=this.sourceDigest(source),old=this.retained(actionId);
  if(old){requireThat(old.sourceDigest===sourceDigest&&canonicalJson(old.previous)===canonicalJson(previous),'IDEMPOTENCY_MISMATCH');return old;}
  const i=this.o.production.enrollment.intent;
  return this.ledger.transact(tx=>{fence.check(tx);const held=tx.reservations().find(r=>r.attempt.actionId===actionId);requireThat(held&&held.attempt.attempt===action.attempt&&held.observerEpoch===this.epoch,'STALE_REVISION');
   const result={...source.result,workId:actionId,resultId:recordDigest('dev2.release-build-result.v1',{actionId,sourceDigest,sealDigest:this.o.production.sealDigest}).slice(7),execution:releaseBuildExecution(this.o.production.definition.policy.policy.execution,i.identities.imageDigest)};
   const body={schemaVersion:/** @type {const} */(1),actionId,sourceDigest,previous:structuredClone(previous),result,attempt:held.attempt};
   const input={...body,inputDigest:recordDigest('dev2.release-build-input.v1',body)};
   tx.run('INSERT INTO meta VALUES(?,?)','release.build:'+actionId,canonicalJson(input));return input;
  });
 }
 /** @param {string} actionId @param {Source} source @param {Pair} previous */
 build(actionId,source,previous){try{this.input(actionId,source,previous);}catch(error){return Promise.reject(error);}const prior=this.running.get(actionId);if(prior)return prior;const run=this.buildOnce(actionId,source,previous).finally(()=>this.running.delete(actionId));this.running.set(actionId,run);return run;}
 /** @param {string} actionId @param {Source} source @param {Pair} previous */
 async buildOnce(actionId,source,previous){const input=this.input(actionId,source,previous),pool=this.o.pool;
  const assignmentId=recordDigest('dev2.managed-assignment.v1',{attempt:input.attempt,profileDigest:this.profile.digest}).slice(7),completed=pool.assignment(assignmentId);
  // A new action attempt may consume the retained completion, never relaunch it.
  if(completed?.state!=='complete')this.ledger.transact(tx=>pool.current(tx,input.attempt));
  const execution=await pool.run(input.result,input.attempt,this.profile);this.assert();
  return this.output(input,source,execution);
 }
 /** @param {BuildInput} input @param {Source} source @param {import('../execution/session-types.js').ExecutionResult} execution @returns {Promise<Build>} */
 async output(input,source,execution){
  this.assert();const {inputDigest,...body}=input;requireThat(inputDigest===recordDigest('dev2.release-build-input.v1',body)&&input.sourceDigest===this.sourceDigest(source),'INTEGRITY_FAILURE');
  const p=this.o.production,i=p.enrollment.intent;
  const {proof,outer}=await p.receipts.verify(input.result,input.attempt,this.profile,execution);this.assert();
  requireThat(proof.eligible&&proof.sealDigest===p.sealDigest,'VALIDATION_FAILED','Finite build has no eligible production execution');
  const decoded=await productionBuildOutput(outer,this.o.objects);
  this.assert();requireThat(canonicalJson(this.retained(input.actionId))===canonicalJson(input),'STALE_RESULT');
  const receipt={schemaVersion:1,kind:'dev2.release-production-build',actionId:input.actionId,inputDigest,proof};
  const manifest=releaseManifest({schemaVersion:1,repositoryId:source.repositoryId,bindingEpoch:source.bindingEpoch,sourceCommitOid:source.commitOid,sourceTreeOid:source.source.treeOid,sourceManifestDigest:source.source.manifestDigest,policyDigest:source.policyDigest,schemaDigest:SCHEMA_DIGEST,protocol:{min:1,max:1},ledger:{min:1,max:1},installationSealDigest:this.o.installationSealDigest,requiredValidationId:source.validationId,releaseValidationId:recordDigest('dev2.release-build-receipt.v1',receipt),device:{artifactDigest:decoded.refs.device,sourceCommitOid:source.commitOid},edge:{artifactDigest:decoded.refs.edge,sourceCommitOid:source.commitOid,compatibilityDate:'2026-08-15'},executor:{workflowDigest:i.identities.workflowDigest,controllerDigest:i.identities.trustedRunnerDigest,sealDigest:p.sealDigest}});
  return {manifest,refs:decoded.refs,receipt};
 }
 /** Reconstruct from authenticated retained execution and actual bytes; a supplied
  * manifest/receipt, even a plausible hash, cannot verify itself.
  * @param {Build} build @param {Source} source @param {Pair} previous */
 async verify(build,source,previous){try{this.assert();const receipt=/** @type {{actionId:string}} */(build.receipt),input=this.retained(receipt.actionId);requireThat(input&&input.sourceDigest===this.sourceDigest(source)&&canonicalJson(input.previous)===canonicalJson(previous),'INTEGRITY_FAILURE');
  const id=recordDigest('dev2.managed-assignment.v1',{attempt:input.attempt,profileDigest:this.profile.digest}).slice(7),a=this.o.pool.assignment(id);requireThat(a?.state==='complete'&&a.result,'VALIDATION_FAILED');return canonicalJson(await this.output(input,source,a.result))===canonicalJson(build);
 }catch{return false;}}
 /** @param {string} actionId */
 async stopped(actionId){const input=this.retained(actionId);return !input||this.o.pool.stopped(input.attempt);}
 /** @param {string} actionId */
 async cancel(actionId){const input=this.retained(actionId);if(input)await this.o.pool.cancel(input.attempt);}
}
