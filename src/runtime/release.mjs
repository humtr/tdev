import {canonicalJson,parseRecord,recordDigest} from '../contracts/canonical.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {digest} from '../contracts/identity.mjs';
import {SCHEMA_DIGEST} from '../mcp/outputs.mjs';
import {ReleaseBackend} from '../release/backend.mjs';
import {ReleaseArtifactStore} from '../release/artifacts.mjs';
/** @typedef {import('../contracts/ports.js').Json} Json */
/** @typedef {import('../contracts/ports.js').Principal} Principal */
/** @typedef {import('../release/types.js').RuntimePair} Pair */
/** @typedef {import('../release/backend.mjs').Stage} Stage */
/** Native composition only: the fixed installed managed producer supplies Builder
 * after verifying its production enrollment. This object never infers a production
 * seal from qualification, a schema name, a source commit or a candidate receipt.
 * Helper/private-control owns rollout effects; the existing native ledger owns
 * public admission, required validation and canonical source publication.
 */
export class NativeReleaseRuntime {
 /** @param {{ledger:import('../storage/ledger.mjs').Ledger,binding:import('../contracts/ports.js').Binding,objects:import('../contracts/ports.js').ObjectStorePort,artifactDirectory:string,authority:Pick<import('../release/authority.mjs').IntegratedSourceAuthority,'verify'>,builder:import('../release/backend.mjs').Builder,control:import('../release/native-control.mjs').NativeReleaseControl,authorize:(principal:Principal,paths:readonly string[])=>Promise<void>,runtime:{sourceCommitOid:string,sourceTreeOid:string,bundleDigest:string,schemaDigest:string},enrollmentSealDigest:string,trustedRunnerDigest:string,workflowDigest:string,now?:()=>number}} options */
 constructor(options){this.o=options;this.ledger=options.ledger;this.epoch=this.ledger.ownerEpoch;this.now=options.now??Date.now;this.control=options.control;
  const a=this.control.admission;requireThat(a&&a.installationId===options.binding.installationId&&a.repositoryId===options.binding.repositoryId&&a.bindingEpoch===options.binding.bindingEpoch&&canonicalJson(a.runtime)===canonicalJson(options.runtime)&&a.executor.sealDigest===options.enrollmentSealDigest&&a.executor.controllerDigest===options.trustedRunnerDigest&&a.executor.workflowDigest===options.workflowDigest,'EXECUTION_UNAVAILABLE','Production producer and installed helper admission differ');
  for(const value of [options.enrollmentSealDigest,options.trustedRunnerDigest,options.workflowDigest])digest(value);
  this.bootstrapReleaseId=recordDigest('dev2.bootstrap-installed-bundle.v1',options.runtime);this.artifacts=new ReleaseArtifactStore({root:options.artifactDirectory,objects:options.objects,schemaDigest:SCHEMA_DIGEST});
  this.backend=new ReleaseBackend({ledger:this.ledger,binding:options.binding,authority:options.authority,artifacts:this.artifacts,builder:options.builder,authorize:options.authorize,now:this.now,edge:{reconcile:effect=>this.control.reconcileStage(effect),execute:(effect,build)=>this.control.upload(effect,build)},helper:{activePair:()=>this.control.activePair(),observe:id=>this.control.observe(id),begin:async intent=>{
   this.assert();const stage=/** @type {Stage|null} */(this.backend.record('release.ready:'+intent.target.releaseId));requireThat(stage?.state==='staged'&&stage.build&&canonicalJson(stage.target)===canonicalJson(intent.target)&&canonicalJson(stage.previous)===canonicalJson(intent.previous),'INTEGRITY_FAILURE','Activation has no retained native-verified build');
   return this.control.begin(intent,stage.build);
  }}});
  this.actual=/** @type {Pair|null} */(null);this.checkedAt=0;this.refreshing=/** @type {Promise<void>|null} */(null);this.initialized=false;
 }
 assert(){requireThat(!this.ledger.closed&&this.ledger.ownerEpoch===this.epoch,'STALE_REVISION','Native release owner changed');}
 async init(){this.assert();await this.artifacts.init();this.assert();this.initialized=true;return this;}
 available(){return this.initialized&&!this.ledger.closed&&this.ledger.ownerEpoch===this.epoch;}
 invalidate(){this.actual=null;this.checkedAt=0;}
 /** No cached retained pair is promoted to actual healthy runtime. A failed or
  * interrupted fresh pair observation clears active/sealed projection, without
  * disabling source work or manufacturing a different rollout effect.
  * @returns {Promise<void>} */
 refresh(){if(this.refreshing)return this.refreshing;const pending=(async()=>{this.assert();this.invalidate();try{const projection=await this.control.refresh();this.assert();if(projection.activation)return;const pair=await this.control.activePair();this.assert();requireThat(canonicalJson(pair)===canonicalJson(projection.retainedPair),'EFFECT_UNCERTAIN','Helper pair changed during observation');this.actual=pair;this.checkedAt=this.now();}catch{this.invalidate();}})().finally(()=>{this.refreshing=null;});this.refreshing=pending;return pending;}
 verifiedPair(){return this.actual&&this.now()-this.checkedAt<=5000?this.actual:null;}
 get releaseId(){return this.verifiedPair()?.releaseId??this.bootstrapReleaseId;}
 get deploymentSealed(){return this.available()&&this.verifiedPair()!==null;}
 /** @param {Principal} principal @param {import('./engine.mjs').Input} input @param {string} actionId @returns {Promise<Json>} */
 async execute(principal,input,actionId){this.assert();requireThat(this.available(),'EXECUTION_UNAVAILABLE');
  if(input.op==='release.stage'){requireThat(typeof input.integratedCommit==='string'&&typeof input.policyDigest==='string'&&typeof input.expectedActiveRelease==='string','INVALID_ARGUMENT');return this.backend.stage(principal,{integratedCommit:input.integratedCommit,policyDigest:input.policyDigest,expectedActiveRelease:input.expectedActiveRelease},actionId);}
  requireThat(input.op==='release.activate'&&typeof input.stagedReleaseId==='string'&&typeof input.expectedActiveRelease==='string','INVALID_ARGUMENT');this.invalidate();return this.backend.activate(principal,{stagedReleaseId:input.stagedReleaseId,expectedActiveRelease:input.expectedActiveRelease},actionId);
 }
 /** @param {import('../contracts/ports.js').Action} action */
 async recovery(action){this.assert();requireThat(action.operation==='release.stage'||action.operation==='release.activate','INVALID_ARGUMENT');return this.backend.recovery(action.actionId);}
 /** Read only projection, not a second release state owner. The retained stage
  * and helper activation records remain authoritative across process restarts.
  */
 projection(){this.assert();const current=this.control.projection?.activation??null,pair=this.verifiedPair();
  const rows=this.ledger.transact(tx=>tx.all("SELECT value FROM meta WHERE key LIKE 'release.ready:%' ORDER BY rowid DESC LIMIT 16"));let staged=/** @type {Stage|null} */(null);
  for(const row of rows){const value=/** @type {Stage} */(parseRecord(String(row.value),2097152));if(value.state==='staged'&&value.target&&(!pair||value.target.releaseId!==pair.releaseId)){staged=value;break;}}
  const phase=current?current.phase:pair?'active':'unverified';return {phase,activationId:current?.intent.activationId??null,activeReleaseId:pair?.releaseId??null,stagedReleaseId:staged?.target?.releaseId??null,expectedReleaseId:current?.intent.target.releaseId??null,writerStopped:current?.pending?.effect.step==='device.switch'&&current.receipts.at(-1)?.output.writerStopped===true,deadline:current?.intent.deadline??null};
 }
}
