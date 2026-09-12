import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {canonicalJson,parseRecord,recordDigest,bytesDigest} from '../contracts/canonical.mjs';
import {id,digest,oid} from '../contracts/identity.mjs';
import {Dev2Error,requireThat} from '../contracts/errors.mjs';
import {boundedProviderJson} from '../execution/provider-json.mjs';
import {releaseIdentity,runtimePair} from './manifest.mjs';
/** @typedef {import('./backend.mjs').Build} Build */
/** @typedef {import('./backend.mjs').StageEffect} StageEffect */
/** @typedef {import('./backend.mjs').StageReceipt} StageReceipt */
/** @typedef {import('./types.js').ActivationEffect} Effect */
/** @typedef {import('./types.js').ActivationReceipt} Receipt */
/** @typedef {{id:string,annotations?:Record<string,string>,resources?:{bindings?:Record<string,unknown>[],script?:{etag?:string},script_runtime?:{compatibility_date?:string,compatibility_flags?:string[]}}}} Version */
/** @typedef {{id:string,strategy:string,created_on:string,annotations?:Record<string,string>,versions:{version_id:string,percentage:number}[]}} Deployment */
/** @param {unknown} value */
function uuid(value){requireThat(typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value),'INTEGRITY_FAILURE','Invalid provider version/deployment identity');return value;}
/** Fixed provider client, not a generic HTTP or deployment capability. The token
 * callback, account, canonical Worker and enrolled bindings are private installed
 * configuration. Callers supply only native-authorized exact staged identities.
 *
 * Cloudflare exposes no documented deployment CAS/idempotency parameter. The
 * fixed-helper owner is the sole product writer; exact old-version preflight and
 * provider readback detect observed contenders but are not misreported as an
 * atomic provider CAS. A sent uncertain request is NEVER resent on list absence.
 */
export class CloudflareReleasePort {
 /** @param {{accountId:string,workerName:string,routerNamespaceId:string,edgeConfig:import('../edge/types.js').EdgeConfig,installationSealDigest:string,schemaDigest:string,token:()=>Promise<string>,effects:import('./provider-effects.mjs').ProviderEffects,artifacts:import('./artifacts.mjs').ReleaseArtifactStore,fetch?:typeof fetch,now?:()=>number}} options */
 constructor(options){
  requireThat(/^[a-f0-9]{32}$/.test(options.accountId)&&/^[a-z][a-z0-9-]{0,62}$/.test(options.workerName)&&/^[a-f0-9]{32}$/.test(options.routerNamespaceId),'INVALID_ARGUMENT');
  digest(options.installationSealDigest);digest(options.schemaDigest);id(options.edgeConfig.installationId);
  this.o=options;this.config=structuredClone(options.edgeConfig);this.fetch=options.fetch??fetch;this.now=options.now??Date.now;
  this.root='https://api.cloudflare.com/client/v4/accounts/'+options.accountId+'/workers/scripts/'+options.workerName;
  /** @type {Set<string>} */this.sending=new Set();
 }
 async authorization(){const token=await this.o.token();requireThat(typeof token==='string'&&token.length>=20&&token.length<=8192&&!/[\r\n\0]/.test(token),'FORBIDDEN','Provider credential unavailable');this.o.effects.assert();return 'Bearer '+token;}
 /** Provider text is bounded and never returned in an error: it can contain
  * binding values. This client never follows redirects or retries mutations.
  * @param {'GET'|'POST'} method @param {string} suffix @param {string} authorization @param {BodyInit} [body] @param {string} [contentType] */
 async call(method,suffix,authorization,body,contentType){
  requireThat(/^\/(?:versions(?:\/[a-f0-9-]{36})?(?:\?(?:page=\d+&per_page=100|bindings_inherit=strict))?|deployments(?:\/[a-f0-9-]{36})?)$/i.test(suffix),'FORBIDDEN');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{const response=await this.fetch(this.root+suffix,{method,redirect:'error',signal:controller.signal,headers:{authorization,'user-agent':'dev2-fixed-release-helper','accept':'application/json',...(contentType?{'content-type':contentType}:{})},body});
   requireThat(response.ok,'EXECUTION_UNAVAILABLE','Provider request rejected (HTTP '+response.status+')');
   const reader=response.body?.getReader();requireThat(reader,'EXECUTION_UNAVAILABLE','Empty provider response');const parts=[];let size=0;
   try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;requireThat(size<=2097152,'LIMIT_EXCEEDED','Provider response bound');parts.push(Buffer.from(part.value));}}finally{await reader.cancel().catch(()=>{});}
   const envelope=/** @type {{success?:boolean,result?:unknown}} */(boundedProviderJson(Buffer.concat(parts),2097152));
   requireThat(envelope&&envelope.success===true&&envelope.result!==undefined,'EXECUTION_UNAVAILABLE','Unsuccessful provider envelope');return envelope.result;
  }catch(error){if(error instanceof Dev2Error)throw error;throw new Dev2Error('EXECUTION_UNAVAILABLE','Provider response unavailable; retained effect requires observation');}finally{clearTimeout(timer);}
 }
 /** @param {string} suffix */
 async get(suffix){return this.call('GET',suffix,await this.authorization());}
 /** @returns {Promise<Deployment[]>} */
 async deployments(){const result=/** @type {{deployments?:Deployment[]}} */(await this.get('/deployments'));requireThat(result&&Array.isArray(result.deployments)&&result.deployments.length>0&&result.deployments.length<=100,'EXECUTION_UNAVAILABLE','Bounded deployment list required');for(const d of result.deployments){uuid(d.id);requireThat(Array.isArray(d.versions)&&typeof d.created_on==='string'&&Number.isFinite(Date.parse(d.created_on)),'INTEGRITY_FAILURE');}return result.deployments;}
 /** @returns {Promise<{deploymentId:string,versionId:string,message:string|null}>} */
 async active(){const [active]=await this.deployments();requireThat(active.strategy==='percentage'&&active.versions.length===1&&active.versions[0].percentage===100,'EFFECT_UNCERTAIN','Canonical Worker must have one fully active version');return {deploymentId:active.id,versionId:uuid(active.versions[0].version_id),message:active.annotations?.['workers/message']??null};}
 /** @param {string} versionId @returns {Promise<Version>} */
 async version(versionId){uuid(versionId);const value=/** @type {Version} */(await this.get('/versions/'+versionId));requireThat(value&&value.id===versionId,'INTEGRITY_FAILURE');return value;}
 /** @param {StageEffect} effect */
 stageInput(effect){id(effect.effectId);digest(effect.inputDigest);digest(effect.releaseId);digest(effect.artifactDigest);oid(effect.sourceCommitOid);uuid(effect.expectedVersionId);}
 /** Preserve enrolled non-source authorization fields and credential identity.
  * Source publication does not authorize a new Worker, namespace or credential.
  * @param {string} sourceCommitOid @param {string} artifactDigest */
 edgeConfig(sourceCommitOid,artifactDigest){oid(sourceCommitOid);digest(artifactDigest);return {...structuredClone(this.config),sourceCommitOid,edgeBundleDigest:artifactDigest};}
 /** @param {StageEffect} effect @param {Build} build */
 metadata(effect,build){
  this.stageInput(effect);const manifest=build.manifest;requireThat(releaseIdentity(manifest)===effect.releaseId&&manifest.installationSealDigest===this.o.installationSealDigest&&manifest.schemaDigest===this.o.schemaDigest&&manifest.repositoryId===this.config.binding.repositoryId&&manifest.bindingEpoch===this.config.binding.bindingEpoch&&manifest.edge.artifactDigest===effect.artifactDigest&&manifest.edge.sourceCommitOid===effect.sourceCommitOid,'FORBIDDEN','Unapproved release provider binding');
  return {main_module:'worker.mjs',compatibility_date:manifest.edge.compatibilityDate,compatibility_flags:['nodejs_compat'],exports:{Dev2RendezvousDO:{type:'durable-object',storage:'sqlite'}},bindings:[{name:'DEV2_CONFIG_JSON',type:'plain_text',text:canonicalJson(this.edgeConfig(effect.sourceCommitOid,effect.artifactDigest))},{name:'DEV2_DEVICE_SECRET',type:'inherit'},{name:'DEV2_VERSION',type:'inherit'},{name:'DEV2_ROUTER',type:'inherit'}],annotations:{'workers/tag':effect.effectId,'workers/message':'dev2.stage '+effect.inputDigest}};
 }
 /** Verify the exact provider resource association. ETag is recorded as opaque
  * provider evidence, never claimed to be a locally computed SHA-256 digest.
  * @param {Version} version @param {string} commit @param {string} artifact @param {string} [compatibilityDate] */
 verifyVersion(version,commit,artifact,compatibilityDate){
  uuid(version.id);const resources=version.resources,bindings=resources?.bindings;
  requireThat(Array.isArray(bindings)&&bindings.length===4&&bindings.map(b=>b.name).sort().join(',')==='DEV2_CONFIG_JSON,DEV2_DEVICE_SECRET,DEV2_ROUTER,DEV2_VERSION','INTEGRITY_FAILURE','Version has different enrolled bindings');
  const config=bindings.find(b=>b.name==='DEV2_CONFIG_JSON'),secret=bindings.find(b=>b.name==='DEV2_DEVICE_SECRET'),router=bindings.find(b=>b.name==='DEV2_ROUTER'),metadata=bindings.find(b=>b.name==='DEV2_VERSION');
  requireThat(config?.type==='plain_text'&&typeof config.text==='string'&&secret?.type==='secret_text'&&router?.type==='durable_object_namespace'&&router.namespace_id===this.o.routerNamespaceId&&router.class_name==='Dev2RendezvousDO'&&metadata?.type==='version_metadata','INTEGRITY_FAILURE','Version resource identity mismatch');
  const edge=parseRecord(config.text,262144);requireThat(canonicalJson(edge)===canonicalJson(this.edgeConfig(commit,artifact)),'INTEGRITY_FAILURE','Provider configuration differs from the exact release');
  requireThat(resources?.script_runtime&&canonicalJson(resources.script_runtime.compatibility_flags??[])===canonicalJson(['nodejs_compat'])&&(!compatibilityDate||resources.script_runtime.compatibility_date===compatibilityDate),'INTEGRITY_FAILURE','Worker execution flags changed');
  const etag=resources.script?.etag;requireThat(typeof etag==='string'&&etag.length>0&&etag.length<=256,'INTEGRITY_FAILURE','Version content identity missing');return {versionId:version.id,artifactDigest:artifact,sourceCommitOid:commit,etag,configDigest:recordDigest('dev2.edge-release-config.v1',edge)};
 }
 /** @param {StageEffect} effect @param {Version} version */
 verifyStage(effect,version){requireThat(version.annotations?.['workers/tag']===effect.effectId&&version.annotations?.['workers/message']==='dev2.stage '+effect.inputDigest,'INTEGRITY_FAILURE','Version belongs to another retained effect');return this.verifyVersion(version,effect.sourceCommitOid,effect.artifactDigest);}
 /** Bounded positive search only. Absence does not authorize re-sending a sent
  * upload, including on an empty/eventually-consistent list after a timeout.
  * @param {StageEffect} effect @returns {Promise<Version|null>} */
 async findStage(effect){
  /** @type {Map<string,Version>} */const found=new Map();
  for(let page=1;page<=3;page++){
   const result=/** @type {{items?:Version[]}} */(await this.get('/versions?page='+page+'&per_page=100'));requireThat(result&&Array.isArray(result.items)&&result.items.length<=100,'EXECUTION_UNAVAILABLE','Bounded version list required');
   for(const version of result.items){uuid(version.id);if(version.annotations?.['workers/tag']===effect.effectId){requireThat(!found.has(version.id),'INTEGRITY_FAILURE','Duplicate provider pagination identity');found.set(version.id,version);}}
   if(result.items.length<100)break;
  }
  requireThat(found.size<=1,'INTEGRITY_FAILURE','One retained upload has multiple provider versions');if(found.size===0)return null;return this.version([...found.keys()][0]);
 }
 /** @param {StageEffect} effect @param {StageReceipt['kind']} kind @param {boolean} stopped @param {string|null} [versionId] @returns {StageReceipt} */
 stageReceipt(effect,kind,stopped,versionId=null){return {effectId:effect.effectId,inputDigest:effect.inputDigest,kind,senderStopped:stopped,versionId,artifactDigest:kind==='ready'?effect.artifactDigest:null,observedAt:this.now()};}
 /** @param {StageEffect} effect @returns {Promise<StageReceipt>} */
 async reconcileStage(effect){
  this.stageInput(effect);const retained=this.o.effects.read(effect.effectId);if(!retained)return this.stageReceipt(effect,'absent',true);
  requireThat(retained.operation==='version.upload'&&retained.inputDigest===effect.inputDigest,'IDEMPOTENCY_MISMATCH');
  if(this.sending.has(effect.effectId))return this.stageReceipt(effect,'pending',false);
  if(retained.state==='planned')return this.stageReceipt(effect,'absent',true);
  const response=/** @type {{versionId?:string}|null} */(retained.response),version=response?.versionId?await this.version(response.versionId):await this.findStage(effect);this.o.effects.assert();
  if(!version)return this.stageReceipt(effect,'pending',true);
  const verified=this.verifyStage(effect,version);this.o.effects.confirm(effect.effectId,effect.inputDigest,verified);return this.stageReceipt(effect,'ready',true,version.id);
 }
 /** @param {StageEffect} effect @param {Build} build @returns {Promise<StageReceipt>} */
 upload(effect,build){return this.o.effects.once(effect.effectId,async()=>{
  const metadata=this.metadata(effect,build),artifact=await this.o.artifacts.verify(effect.releaseId,build.manifest,build.refs),bytes=await readFile(join(artifact.directory,'worker.mjs'));
  requireThat(bytesDigest(bytes)===effect.artifactDigest,'INTEGRITY_FAILURE');
  const requestDigest=recordDigest('dev2.cloudflare-version-upload.v1',{account:this.o.accountId,worker:this.o.workerName,metadata,artifactDigest:effect.artifactDigest});
  this.o.effects.plan({effectId:effect.effectId,inputDigest:effect.inputDigest,requestDigest,operation:'version.upload'});
  const observed=await this.reconcileStage(effect);if(observed.kind!=='absent')return observed;
  const active=await this.active();requireThat(active.versionId===effect.expectedVersionId,'STALE_RESULT','Active Worker changed before staging');
  const form=new FormData();form.set('metadata',new Blob([canonicalJson(metadata)],{type:'application/json'}),'metadata');form.set('worker.mjs',new Blob([new Uint8Array(bytes)],{type:'application/javascript+module'}),'worker.mjs');
  const authorization=await this.authorization();this.o.effects.assert();
  if(!this.o.effects.markSent(effect.effectId))return this.reconcileStage(effect);
  this.sending.add(effect.effectId);let responseId=/** @type {string|null} */(null);
  try{const value=/** @type {{id?:string}} */(await this.call('POST','/versions?bindings_inherit=strict',authorization,form));responseId=uuid(value.id);}catch(error){if(error instanceof Dev2Error&&error.code==='INTEGRITY_FAILURE')throw error;}finally{this.sending.delete(effect.effectId);}
  if(responseId){const version=await this.version(responseId),verified=this.verifyStage(effect,version);this.o.effects.assert();this.o.effects.confirm(effect.effectId,effect.inputDigest,verified);return this.stageReceipt(effect,'ready',true,version.id);}
  return this.reconcileStage(effect);
 });}
 /** @param {Effect} effect */
 deploymentInput(effect){requireThat(effect.step==='edge.activate','INVALID_ARGUMENT');id(effect.effectId);digest(effect.inputDigest);runtimePair(effect.expected);runtimePair(effect.target);uuid(effect.expected.edgeVersionId);uuid(effect.target.edgeVersionId);return 'dev2.activate '+effect.effectId+' '+effect.inputDigest;}
 /** @param {Effect} effect @param {Receipt['kind']} kind @param {boolean} stopped @param {Record<string,import('../contracts/ports.js').Json>} [output] @returns {Receipt} */
 activationReceipt(effect,kind,stopped,output={}){return {effectId:effect.effectId,inputDigest:effect.inputDigest,kind,senderStopped:stopped,observedAt:this.now(),output};}
 /** @param {Effect} effect @returns {Promise<Receipt>} */
 async reconcileActivation(effect){
  const marker=this.deploymentInput(effect),retained=this.o.effects.read(effect.effectId);
  if(retained)requireThat(retained.operation==='deployment.activate'&&retained.inputDigest===effect.inputDigest,'IDEMPOTENCY_MISMATCH');
  if(this.sending.has(effect.effectId))return this.activationReceipt(effect,'pending',false);
  const deployments=await this.deployments();this.o.effects.assert();const active=deployments[0];
  requireThat(active.strategy==='percentage'&&active.versions.length===1&&active.versions[0].percentage===100,'EFFECT_UNCERTAIN','Partial Worker rollout is not terminal');
  const matches=deployments.filter(d=>d.annotations?.['workers/message']===marker);requireThat(matches.length<=1,'INTEGRITY_FAILURE','Duplicate exact activation deployment');
  if(matches.length){const found=matches[0];requireThat(retained&&retained.state!=='planned'&&found.strategy==='percentage'&&found.versions.length===1&&found.versions[0].percentage===100&&found.versions[0].version_id===effect.target.edgeVersionId,'INTEGRITY_FAILURE','Misbound deployment effect');
   const verified=this.verifyVersion(await this.version(effect.target.edgeVersionId),effect.target.edgeSourceCommitOid,effect.target.edgeArtifactDigest);this.o.effects.assert();
   this.o.effects.confirm(effect.effectId,effect.inputDigest,{deploymentId:found.id,versionId:verified.versionId,artifactDigest:verified.artifactDigest});
   if(active.id!==found.id)return this.activationReceipt(effect,'conflict',true,{reason:'provider_contender'});
   return this.activationReceipt(effect,'applied',true,{edgeVersionId:verified.versionId});
  }
  if(retained&&retained.state!=='planned')return this.activationReceipt(effect,'pending',true,{reason:'sent_effect_not_observed'});
  if(active.versions[0].version_id!==effect.expected.edgeVersionId)return this.activationReceipt(effect,'conflict',true,{reason:'provider_contender'});
  return this.activationReceipt(effect,'not_applied',true);
 }
 /** Single exact version at 100%, never force=true, secret rotation or resource
  * mutation. Rollback is a distinct fixed effect from the accepted pair journal,
  * not an opposite request sent while the forward sender is uncertain.
  * @param {Effect} effect @returns {Promise<Receipt>} */
 activate(effect){return this.o.effects.once(effect.effectId,async()=>{
  const marker=this.deploymentInput(effect),body={strategy:'percentage',versions:[{version_id:effect.target.edgeVersionId,percentage:100}],annotations:{'workers/message':marker}};
  const requestDigest=recordDigest('dev2.cloudflare-deployment.v1',{account:this.o.accountId,worker:this.o.workerName,expectedVersion:effect.expected.edgeVersionId,body});this.o.effects.plan({effectId:effect.effectId,inputDigest:effect.inputDigest,requestDigest,operation:'deployment.activate'});
  const observed=await this.reconcileActivation(effect);if(observed.kind!=='not_applied')return observed;
  this.verifyVersion(await this.version(effect.target.edgeVersionId),effect.target.edgeSourceCommitOid,effect.target.edgeArtifactDigest);
  const active=await this.active();requireThat(active.versionId===effect.expected.edgeVersionId,'STALE_RESULT','Worker changed before activation send');
  const authorization=await this.authorization();if(!this.o.effects.markSent(effect.effectId))return this.reconcileActivation(effect);
  this.sending.add(effect.effectId);try{await this.call('POST','/deployments',authorization,canonicalJson(body),'application/json');}catch(error){if(error instanceof Dev2Error&&error.code==='INTEGRITY_FAILURE')throw error;}finally{this.sending.delete(effect.effectId);}
  return this.reconcileActivation(effect);
 });}
}
