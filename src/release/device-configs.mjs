import {join} from 'node:path';
import {canonicalJson,parseRecord,bytesDigest} from '../contracts/canonical.mjs';
import {digest} from '../contracts/identity.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {releaseIdentity,runtimePair} from './manifest.mjs';
import {privateBytes,privateDirectory,immutablePrivateFile} from './private-files.mjs';
/** @typedef {import('./types.js').RuntimePair} Pair */
/** @typedef {import('./writer-fence.mjs').DevicePointer} Pointer */
/** @typedef {import('../runtime/native.mjs').NativeConfig} NativeConfig */
/** @typedef {{helperEndpointFile:string,helperKeyFile:string,nativeEndpointFile:string,nativeKeyFile:string,installationSealDigest:string,deviceReleaseId:string}} ReleaseControl */
/** Only a sealed native-config template and a native-authorized immutable build
 * are combined. Source does not supply paths, environment, credentials or hooks.
 * The resulting private config digest is retained before activation admission and
 * checked on every pointer resolution; computing a new hash of a tampered file
 * would NOT be authority to switch to it.
 */
export class DeviceReleaseConfigs {
 /** @param {{journal:import('./journal.mjs').ActivationJournal,artifacts:import('./artifacts.mjs').ReleaseArtifactStore,baseline:Pair,baselinePointer:Pointer,baseConfigFile:string,baseConfigDigest:string,nativeConfigDirectory:string,pointerFile:string,control:Omit<ReleaseControl,'deviceReleaseId'>}} options */
 constructor(options){this.o=options;this.journal=options.journal;this.epoch=this.journal.ownerEpoch;digest(options.baseConfigDigest);runtimePair(options.baseline);this.template=/** @type {(NativeConfig&{releaseControl?:ReleaseControl})|null} */(null);/** @type {Map<string,Promise<Pointer>>} */this.running=new Map();}
 assert(){requireThat(!this.journal.closed&&this.journal.ownerEpoch===this.epoch,'STALE_REVISION');}
 /** @param {Pointer} value @param {Pair} pair */
 matches(value,pair){const b=this.o.baselinePointer;return value.schemaVersion===1&&value.installationId===b.installationId&&value.repositoryId===b.repositoryId&&value.bindingEpoch===b.bindingEpoch&&value.deviceReleaseId===pair.deviceReleaseId&&value.artifactDigest===pair.deviceArtifactDigest&&value.sourceCommitOid===pair.deviceSourceCommitOid&&value.schemaDigest===pair.schemaDigest;}
 /** @param {Pointer} value */
 save(value){this.assert();this.journal.transact(()=>{const key='device.pointer:'+value.deviceReleaseId,old=this.journal.db.prepare('SELECT value FROM meta WHERE key=?').get(key);if(old)requireThat(canonicalJson(parseRecord(String(old.value)))===canonicalJson(value),'INTEGRITY_FAILURE','Previously admitted device config changed');else this.journal.db.prepare('INSERT INTO meta VALUES(?,?)').run(key,canonicalJson(value));});return value;}
 async init(){this.assert();const bytes=await privateBytes(this.o.baseConfigFile),base=/** @type {NativeConfig&{releaseControl?:ReleaseControl}} */(parseRecord(bytes,1048576)),b=this.o.baselinePointer;
  requireThat(bytesDigest(bytes)===this.o.baseConfigDigest&&this.o.baseConfigDigest===b.nativeConfigDigest&&this.matches(b,this.o.baseline)&&base.schemaVersion===1&&base.edge.installationId===b.installationId&&base.edge.binding.repositoryId===b.repositoryId&&base.edge.binding.bindingEpoch===b.bindingEpoch&&base.runtime.sourceCommitOid===b.sourceCommitOid&&base.runtime.bundleDigest===b.artifactDigest&&base.runtime.schemaDigest===b.schemaDigest,'INTEGRITY_FAILURE','Baseline config binding differs');
  this.template=structuredClone(base);await privateDirectory(this.o.nativeConfigDirectory);await immutablePrivateFile(join(this.o.nativeConfigDirectory,b.deviceReleaseId.slice(7)+'.json'),bytes);this.assert();this.save(b);await this.pointerFor(this.o.baseline);
 }
 /** @param {Pair} pair @returns {Promise<Pointer>} */
 async pointerFor(pair){runtimePair(pair);this.assert();const row=this.journal.db.prepare('SELECT value FROM meta WHERE key=?').get('device.pointer:'+pair.deviceReleaseId);requireThat(row,'FORBIDDEN','No admitted immutable device configuration');const value=/** @type {Pointer} */(parseRecord(String(row.value),16384));requireThat(this.matches(value,pair),'INTEGRITY_FAILURE','Device release pair differs from config');
  const file=join(this.o.nativeConfigDirectory,digest(value.deviceReleaseId).slice(7)+'.json'),bytes=await privateBytes(file),config=/** @type {NativeConfig} */(parseRecord(bytes,1048576));
  requireThat(bytesDigest(bytes)===value.nativeConfigDigest&&config.runtime.bundleDigest===value.artifactDigest&&config.runtime.sourceCommitOid===value.sourceCommitOid&&config.runtime.schemaDigest===value.schemaDigest,'INTEGRITY_FAILURE','Private native configuration changed');
  const bundle=await privateBytes(join(this.o.artifacts.directory(value.deviceReleaseId),'device.cjs'),16777216);requireThat(bytesDigest(bundle)===value.artifactDigest,'INTEGRITY_FAILURE','Admitted device artifact changed');this.assert();return value;
 }
 async current(){const value=/** @type {Pointer} */(parseRecord(await privateBytes(this.o.pointerFile,16384),16384));const b=this.o.baselinePointer;requireThat(value&&value.schemaVersion===1&&value.installationId===b.installationId&&value.repositoryId===b.repositoryId&&value.bindingEpoch===b.bindingEpoch,'FORBIDDEN');digest(value.deviceReleaseId);const row=this.journal.db.prepare('SELECT value FROM meta WHERE key=?').get('device.pointer:'+value.deviceReleaseId);requireThat(row&&canonicalJson(parseRecord(String(row.value)))===canonicalJson(value),'INTEGRITY_FAILURE','Current pointer was not admitted');return value;}
 /** @param {import('./backend.mjs').Build} build @param {Pair} previous @returns {Promise<Pointer>} */
 prepare(build,previous){const key=releaseIdentity(build.manifest),old=this.running.get(key);if(old)return old;const result=this.prepareOnce(build,previous).finally(()=>this.running.delete(key));this.running.set(key,result);return result;}
 /** @param {import('./backend.mjs').Build} build @param {Pair} previous @returns {Promise<Pointer>} */
 async prepareOnce(build,previous){requireThat(this.template,'EXECUTION_UNAVAILABLE');this.assert();const m=build.manifest,releaseId=releaseIdentity(m);await this.o.artifacts.verify(releaseId,m,build.refs);this.assert();
  if(m.device.artifactDigest===previous.deviceArtifactDigest&&m.device.sourceCommitOid===previous.deviceSourceCommitOid)return this.pointerFor(previous);
  requireThat(m.repositoryId===this.o.baselinePointer.repositoryId&&m.bindingEpoch===this.o.baselinePointer.bindingEpoch&&m.schemaDigest===this.o.baseline.schemaDigest&&m.device.sourceCommitOid===m.sourceCommitOid&&m.installationSealDigest===this.o.control.installationSealDigest,'FORBIDDEN','Device build source is outside the admitted runtime');
  const runtime={sourceCommitOid:m.device.sourceCommitOid,sourceTreeOid:m.sourceTreeOid,bundleDigest:m.device.artifactDigest,schemaDigest:m.schemaDigest},releaseControl={...this.o.control,deviceReleaseId:releaseId},config={...structuredClone(this.template),runtime,releaseControl};
  const bytes=Buffer.from(canonicalJson(config)),pointer={schemaVersion:/** @type {const} */(1),installationId:this.o.baselinePointer.installationId,repositoryId:m.repositoryId,bindingEpoch:m.bindingEpoch,deviceReleaseId:releaseId,artifactDigest:m.device.artifactDigest,sourceCommitOid:m.device.sourceCommitOid,schemaDigest:m.schemaDigest,nativeConfigDigest:bytesDigest(bytes)};
  await immutablePrivateFile(join(this.o.nativeConfigDirectory,releaseId.slice(7)+'.json'),bytes);this.assert();return this.save(pointer);
 }
}
