import {resolve} from 'node:path';
import {canonicalJson,parseRecord,bytesDigest} from '../contracts/canonical.mjs';
import {id,digest,revision,oid} from '../contracts/identity.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {runtimePair,releaseManifest,releaseIdentity,activationIntent} from './manifest.mjs';
import {privateBytes} from './private-files.mjs';
import {privateControl,servePrivateControl} from './private-rpc.mjs';
/** @typedef {import('./device-configs.mjs').ReleaseControl} Control */
/** @typedef {import('../runtime/native.mjs').NativeConfig['runtime']} Runtime */
/** @typedef {import('./types.js').ActivationRecord} Activation */
/** @typedef {{schemaVersion:1,kind:'dev2.installed-runtime-admission',installationId:string,repositoryId:string,bindingEpoch:string,installationSealDigest:string,executor:{workflowDigest:string,controllerDigest:string,sealDigest:string},deviceReleaseId:string,runtime:Runtime,pair:import('./types.js').RuntimePair,manifest:import('./types.js').ReleaseManifest|null,buildReceiptDigest:string|null,activationId:string|null,baseline:boolean}} Admission */
const authenticatedAdmissions=new WeakSet();
/** @param {unknown} value @param {readonly string[]} keys */
function closed(value,keys){requireThat(value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(','),'INVALID_ARGUMENT','Closed native/helper release operation');}
/** @param {unknown} value */
function json(value){return /** @type {import('../contracts/ports.js').Json} */(/** @type {unknown} */(parseRecord(canonicalJson(value),524288)));}
/** An ordinary source publication or caller-supplied JSON cannot override the
 * installed qualification's nativeJoin. Only this process's fresh authenticated
 * helper response for current pointer/staged bytes may authorize a new runtime.
 * Baseline admission NEVER substitutes for a missing native qualification join.
 * @param {Admission|null|undefined} admission @param {{installationId:string,repositoryId:string,bindingEpoch:string,runtime:Runtime,enrollmentSealDigest:string,trustedRunnerDigest:string,workflowDigest:string}} expected */
export function releaseRuntimeAdmitted(admission,expected){
 if(!admission||!authenticatedAdmissions.has(admission)||admission.baseline||!admission.manifest)return false;
 const m=admission.manifest;
 return admission.installationId===expected.installationId&&admission.repositoryId===expected.repositoryId&&admission.bindingEpoch===expected.bindingEpoch&&canonicalJson(admission.runtime)===canonicalJson(expected.runtime)&&admission.executor.sealDigest===expected.enrollmentSealDigest&&admission.executor.controllerDigest===expected.trustedRunnerDigest&&admission.executor.workflowDigest===expected.workflowDigest&&m.device.sourceCommitOid===expected.runtime.sourceCommitOid&&m.sourceTreeOid===expected.runtime.sourceTreeOid&&m.device.artifactDigest===expected.runtime.bundleDigest&&m.schemaDigest===expected.runtime.schemaDigest;
}
/** Private transport client + native stop-admission endpoint. All existing public
 * dev-2 operations still use the native action/work/policy ledger; this is not an
 * alternative mutation surface or release authorization engine.
 */
export class NativeReleaseControl {
 /** @param {{config:Control,installationId:string,repositoryId:string,bindingEpoch:string,runtime:Runtime,now?:()=>number}} options */
 constructor(options){this.o=options;this.now=options.now??Date.now;closed(options.config,['helperEndpointFile','helperKeyFile','nativeEndpointFile','nativeKeyFile','installationSealDigest','deviceReleaseId']);for(const key of ['helperEndpointFile','helperKeyFile','nativeEndpointFile','nativeKeyFile']){const path=options.config[/** @type {'helperEndpointFile'|'helperKeyFile'|'nativeEndpointFile'|'nativeKeyFile'} */(key)];requireThat(resolve(path)===path,'FORBIDDEN');}digest(options.config.installationSealDigest);digest(options.config.deviceReleaseId);id(options.installationId);id(options.repositoryId);revision(options.bindingEpoch);closed(options.runtime,['sourceCommitOid','sourceTreeOid','bundleDigest','schemaDigest']);oid(options.runtime.sourceCommitOid);oid(options.runtime.sourceTreeOid);digest(options.runtime.bundleDigest);digest(options.runtime.schemaDigest);this.helperKey=/** @type {Uint8Array|null} */(null);this.nativeKey=/** @type {Uint8Array|null} */(null);this.admission=/** @type {Admission|null} */(null);this.projection=/** @type {{installationId:string,repositoryId:string,bindingEpoch:string,helperOwnerEpoch:string,retainedPair:import('./types.js').RuntimePair,activation:Activation|null}|null} */(null);}
 async init(){this.helperKey=await privateBytes(this.o.config.helperKeyFile,32);this.nativeKey=await privateBytes(this.o.config.nativeKeyFile,32);requireThat(this.helperKey.length===32&&this.nativeKey.length===32&&bytesDigest(this.helperKey)!==bytesDigest(this.nativeKey),'INTEGRITY_FAILURE');return this;}
 /** @param {import('./private-rpc.mjs').Operation} operation @param {unknown} input */
 async call(operation,input){requireThat(this.helperKey,'EXECUTION_UNAVAILABLE');return privateControl({filename:this.o.config.helperEndpointFile,role:'helper',key:this.helperKey,operation,input:json(input),timeoutMs:20000});}
 async startupAdmission(){const a=/** @type {Admission} */(/** @type {unknown} */(await this.call('helper.status',{kind:'runtime',deviceReleaseId:this.o.config.deviceReleaseId,runtime:this.o.runtime})));
  closed(a,['schemaVersion','kind','installationId','repositoryId','bindingEpoch','installationSealDigest','executor','deviceReleaseId','runtime','pair','manifest','buildReceiptDigest','activationId','baseline']);closed(a.executor,['workflowDigest','controllerDigest','sealDigest']);
  requireThat(a.schemaVersion===1&&a.kind==='dev2.installed-runtime-admission'&&a.installationId===this.o.installationId&&a.repositoryId===this.o.repositoryId&&a.bindingEpoch===this.o.bindingEpoch&&a.installationSealDigest===this.o.config.installationSealDigest&&a.deviceReleaseId===this.o.config.deviceReleaseId&&canonicalJson(a.runtime)===canonicalJson(this.o.runtime)&&typeof a.baseline==='boolean','UNAUTHORIZED','Helper admitted different installed bytes');
  for(const d of Object.values(a.executor))digest(d);if(a.activationId!==null)id(a.activationId);const p=runtimePair(a.pair);requireThat(p.deviceReleaseId===a.deviceReleaseId&&p.deviceSourceCommitOid===a.runtime.sourceCommitOid&&p.deviceArtifactDigest===a.runtime.bundleDigest&&p.schemaDigest===a.runtime.schemaDigest,'INTEGRITY_FAILURE');
  if(a.baseline)requireThat(a.manifest===null&&a.buildReceiptDigest===null,'INTEGRITY_FAILURE');else{requireThat(a.manifest&&a.buildReceiptDigest,'INTEGRITY_FAILURE');digest(a.buildReceiptDigest);const m=releaseManifest(a.manifest);requireThat(releaseIdentity(m)===a.deviceReleaseId&&m.repositoryId===a.repositoryId&&m.bindingEpoch===a.bindingEpoch&&m.installationSealDigest===a.installationSealDigest&&canonicalJson(m.executor)===canonicalJson(a.executor)&&m.device.sourceCommitOid===a.runtime.sourceCommitOid&&m.sourceTreeOid===a.runtime.sourceTreeOid&&m.device.artifactDigest===a.runtime.bundleDigest&&m.schemaDigest===a.runtime.schemaDigest,'INTEGRITY_FAILURE','Release manifest differs from executing device');}
  /** @param {unknown} value @returns {void} */
  const freeze=value=>{if(value!==null&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}};
  this.admission=structuredClone(a);freeze(this.admission);authenticatedAdmissions.add(this.admission);return this.admission;
 }
 async refresh(){const value=/** @type {NonNullable<NativeReleaseControl['projection']>} */(/** @type {unknown} */(await this.call('helper.status',{kind:'projection'})));closed(value,['installationId','repositoryId','bindingEpoch','helperOwnerEpoch','retainedPair','activation']);requireThat(value.installationId===this.o.installationId&&value.repositoryId===this.o.repositoryId&&value.bindingEpoch===this.o.bindingEpoch,'UNAUTHORIZED');revision(value.helperOwnerEpoch);runtimePair(value.retainedPair);if(value.activation){activationIntent(value.activation.intent);requireThat(value.activation.intent.installationId===this.o.installationId&&value.activation.intent.repositoryId===this.o.repositoryId&&value.activation.intent.bindingEpoch===this.o.bindingEpoch,'UNAUTHORIZED');}this.projection=structuredClone(value);return this.projection;}
 async activePair(){const value=/** @type {{pair:import('./types.js').RuntimePair}} */(/** @type {unknown} */(await this.call('helper.status',{kind:'active'})));closed(value,['pair']);return runtimePair(value.pair);}
 /** @param {string} activationId */
 async observe(activationId){id(activationId);const value=/** @type {Activation|null} */(/** @type {unknown} */(await this.call('activation.observe',{activationId})));if(value){activationIntent(value.intent);requireThat(value.intent.activationId===activationId&&value.intent.installationId===this.o.installationId&&value.intent.repositoryId===this.o.repositoryId&&value.intent.bindingEpoch===this.o.bindingEpoch,'INTEGRITY_FAILURE');}return value;}
 /** @param {import('./types.js').ActivationIntent} intent @param {import('./backend.mjs').Build} build */
 async begin(intent,build){const value=/** @type {Activation} */(/** @type {unknown} */(await this.call('activation.begin',{intent,build})));requireThat(value&&canonicalJson(value.intent)===canonicalJson(intent),'INTEGRITY_FAILURE');return value;}
 /** @param {import('./backend.mjs').StageEffect} effect */
 async reconcileStage(effect){return /** @type {import('./backend.mjs').StageReceipt} */(/** @type {unknown} */(await this.call('stage.reconcile',{effect})));}
 /** @param {import('./backend.mjs').StageEffect} effect @param {import('./backend.mjs').Build} build */
 async upload(effect,build){return /** @type {import('./backend.mjs').StageReceipt} */(/** @type {unknown} */(await this.call('stage.upload',{effect,build})));}
 /** @param {{engine:import('../runtime/engine.mjs').DevelopmentEngine,connection:()=>{connected:boolean,edge:import('./device-port.mjs').NativeStatus['edge']}}} options */
 async serve(options){requireThat(this.nativeKey&&this.admission,'EXECUTION_UNAVAILABLE');const engine=options.engine,ledger=engine.o.ledger,epoch=ledger.ownerEpoch;
  /** @returns {import('./device-port.mjs').NativeStatus} */
  const status=()=>{requireThat(!ledger.closed&&ledger.ownerEpoch===epoch,'STALE_REVISION');const drain=ledger.transact(tx=>{const row=tx.get('SELECT value FROM meta WHERE key=?','release.native-drain');return row?/** @type {{activationId:string,actionId:string,ownerEpoch:string,effectId:string}} */(parseRecord(String(row.value))):null;}),current=drain?.ownerEpoch===epoch&&!engine.accepting?drain:null,connection=options.connection();return {schemaVersion:1,installationId:this.o.installationId,repositoryId:this.o.repositoryId,bindingEpoch:this.o.bindingEpoch,deviceReleaseId:this.o.config.deviceReleaseId,sourceCommitOid:this.o.runtime.sourceCommitOid,bundleDigest:this.o.runtime.bundleDigest,schemaDigest:this.o.runtime.schemaDigest,ownerEpoch:epoch,connected:connection.connected,accepting:engine.accepting,drainActivationId:current?.activationId??null,drained:!!current&&[...engine.running.keys()].every(actionId=>actionId===current.actionId),edge:connection.edge};};
  return servePrivateControl({role:'native',filename:this.o.config.nativeEndpointFile,key:this.nativeKey,handlers:{
   'native.status':async input=>{closed(input,[]);return json(status());},
   'native.drain':async input=>{closed(input,['effect']);const effect=/** @type {import('./types.js').ActivationEffect} */(/** @type {unknown} */(/** @type {Record<string,unknown>} */(input).effect));requireThat(effect&&effect.step==='device.drain','FORBIDDEN');const record=await this.observe(effect.activationId);requireThat(record&&record.pending?.state==='sent'&&canonicalJson(record.pending.effect)===canonicalJson(effect)&&!ledger.closed&&ledger.ownerEpoch===epoch,'STALE_RESULT','No current admitted drain effect');
    ledger.transact(tx=>{tx.run("INSERT INTO meta(key,value) VALUES('release.native-drain',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",canonicalJson({activationId:effect.activationId,actionId:record.intent.actionId,ownerEpoch:epoch,effectId:effect.effectId,inputDigest:effect.inputDigest}));});engine.drain();return json(status());}
  }});
 }
}
