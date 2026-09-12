import {dirname,resolve} from 'node:path';
import {canonicalJson,parseRecord,bytesDigest} from '../contracts/canonical.mjs';
import {digest,id,revision} from '../contracts/identity.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {ObjectStore} from '../storage/objects.mjs';
import {SCHEMA_DIGEST} from '../mcp/outputs.mjs';
import {ActivationJournal} from './journal.mjs';
import {ActivationController} from './activation.mjs';
import {ReleaseArtifactStore} from './artifacts.mjs';
import {ProviderEffects} from './provider-effects.mjs';
import {CloudflareReleasePort} from './cloudflare.mjs';
import {WriterFence} from './writer-fence.mjs';
import {RunitControl} from './runit-control.mjs';
import {DeviceActivationPort} from './device-port.mjs';
import {DeviceReleaseConfigs} from './device-configs.mjs';
import {FixedReleaseService} from './helper-service.mjs';
import {privateBytes,privateDirectory} from './private-files.mjs';
import {privateControl,servePrivateControl} from './private-rpc.mjs';
/** @typedef {import('../contracts/ports.js').Json} Json */
/** @typedef {{schemaVersion:1,installationId:string,repositoryId:string,bindingEpoch:string,helperBundleDigest:string,installationSealDigest:string,executor:{sealDigest:string,controllerDigest:string,workflowDigest:string},baseline:import('./types.js').RuntimePair,baselinePointer:import('./writer-fence.mjs').DevicePointer,baseConfigDigest:string,paths:{journalFile:string,artifactDirectory:string,objectDirectory:string,pointerFile:string,nativeConfigDirectory:string,baseConfigFile:string,helperEndpointFile:string,helperKeyFile:string,nativeEndpointFile:string,nativeKeyFile:string,writerFenceConfigFile:string,runitConfigFile:string,pythonExecutable:string,writerFenceHelperFile:string,runitHelperFile:string,commonModuleFile:string,cloudflareTokenFile:string},fixedFiles:{writerFenceHelper:string,runitHelper:string,commonModule:string,writerFenceConfig:string,runitConfig:string},environment:Record<string,string>,cloudflare:{accountId:string,workerName:string,routerNamespaceId:string,edgeConfig:import('../edge/types.js').EdgeConfig}}} HelperConfig */
/** @param {unknown} value @param {readonly string[]} keys */
function closed(value,keys){requireThat(value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(','),'INVALID_ARGUMENT','Closed fixed helper configuration');}
/** @param {unknown} value @returns {Record<string,Json>} */
function record(value){requireThat(value!==null&&typeof value==='object'&&!Array.isArray(value),'INVALID_ARGUMENT');return /** @type {Record<string,Json>} */(value);}
/** @param {unknown} value @returns {Json} */
function json(value){return /** @type {Json} */(parseRecord(canonicalJson(value),524288));}
/** @param {string} filename */
export async function readHelperConfig(filename){return /** @type {HelperConfig} */(parseRecord(await privateBytes(filename),1048576));}
/** The helper owns an OS-locked rollout journal and fixed installed actuators;
 * no candidate command, archive, template, environment or credential is accepted
 * by its private RPC. It does not open the native work SQLite owner at all.
 * @param {HelperConfig} config @param {{fetch?:typeof fetch,log?:(event:string)=>void}} [options] */
export async function createFixedHelper(config,options={}){
 closed(config,['schemaVersion','installationId','repositoryId','bindingEpoch','helperBundleDigest','installationSealDigest','executor','baseline','baselinePointer','baseConfigDigest','paths','fixedFiles','environment','cloudflare']);requireThat(config.schemaVersion===1&&config.baseline.schemaDigest===SCHEMA_DIGEST,'INTEGRITY_FAILURE');id(config.installationId);id(config.repositoryId);revision(config.bindingEpoch);digest(config.helperBundleDigest);digest(config.installationSealDigest);digest(config.baseConfigDigest);
 const p=config.paths;closed(p,['journalFile','artifactDirectory','objectDirectory','pointerFile','nativeConfigDirectory','baseConfigFile','helperEndpointFile','helperKeyFile','nativeEndpointFile','nativeKeyFile','writerFenceConfigFile','runitConfigFile','pythonExecutable','writerFenceHelperFile','runitHelperFile','commonModuleFile','cloudflareTokenFile']);for(const path of Object.values(p))requireThat(typeof path==='string'&&resolve(path)===path,'FORBIDDEN');
 closed(config.fixedFiles,['writerFenceHelper','runitHelper','commonModule','writerFenceConfig','runitConfig']);closed(config.executor,['sealDigest','controllerDigest','workflowDigest']);closed(config.cloudflare,['accountId','workerName','routerNamespaceId','edgeConfig']);
 const allow=['HOME','PATH','TMPDIR','LANG','PREFIX','ANDROID_ROOT','ANDROID_DATA'];requireThat(Object.keys(config.environment).every(key=>allow.includes(key))&&['HOME','PATH','TMPDIR'].every(key=>typeof config.environment[key]==='string')&&Object.values(config.environment).every(value=>typeof value==='string'&&value.length<=8192&&!value.includes('\0')),'FORBIDDEN');
 for(const [name,path] of [['writerFenceHelper',p.writerFenceHelperFile],['runitHelper',p.runitHelperFile],['commonModule',p.commonModuleFile],['writerFenceConfig',p.writerFenceConfigFile],['runitConfig',p.runitConfigFile]]){const expected=digest(config.fixedFiles[/** @type {keyof HelperConfig['fixedFiles']} */(name)]);requireThat(bytesDigest(await privateBytes(path,262144))===expected,'INTEGRITY_FAILURE','Installed helper file changed');}
 requireThat(dirname(p.commonModuleFile)===dirname(p.runitHelperFile)&&p.commonModuleFile.endsWith('/release_native.py')&&config.cloudflare.edgeConfig.installationId===config.installationId&&config.cloudflare.edgeConfig.binding.repositoryId===config.repositoryId&&config.cloudflare.edgeConfig.binding.bindingEpoch===config.bindingEpoch,'FORBIDDEN');
 const fenceConfig=record(parseRecord(await privateBytes(p.writerFenceConfigFile))),runitConfig=record(parseRecord(await privateBytes(p.runitConfigFile)));
 for(const fixed of [fenceConfig,runitConfig])requireThat(fixed.installationId===config.installationId&&fixed.repositoryId===config.repositoryId&&fixed.bindingEpoch===config.bindingEpoch&&fixed.pointerFile===p.pointerFile,'INTEGRITY_FAILURE');
 requireThat(fenceConfig.artifactDirectory===p.artifactDirectory&&fenceConfig.nativeConfigDirectory===p.nativeConfigDirectory&&typeof fenceConfig.requestDirectory==='string'&&typeof runitConfig.stateDirectory==='string','INTEGRITY_FAILURE');
 await Promise.all([dirname(p.journalFile),dirname(p.helperEndpointFile),dirname(p.nativeEndpointFile),p.nativeConfigDirectory].map(privateDirectory));
 const helperKey=await privateBytes(p.helperKeyFile,32),nativeKey=await privateBytes(p.nativeKeyFile,32);requireThat(helperKey.length===32&&nativeKey.length===32&&bytesDigest(helperKey)!==bytesDigest(nativeKey),'INTEGRITY_FAILURE','Distinct role keys required');
 const journal=new ActivationJournal(p.journalFile,config.installationId);let rpc=/** @type {Awaited<ReturnType<typeof servePrivateControl>>|null} */(null),timer=/** @type {ReturnType<typeof setInterval>|null} */(null);
 try{
  const objects=new ObjectStore(p.objectDirectory);await objects.init();const artifacts=new ReleaseArtifactStore({root:p.artifactDirectory,objects,schemaDigest:SCHEMA_DIGEST});await artifacts.init();
  const configs=new DeviceReleaseConfigs({journal,artifacts,baseline:config.baseline,baselinePointer:config.baselinePointer,baseConfigFile:p.baseConfigFile,baseConfigDigest:config.baseConfigDigest,nativeConfigDirectory:p.nativeConfigDirectory,pointerFile:p.pointerFile,control:{helperEndpointFile:p.helperEndpointFile,helperKeyFile:p.helperKeyFile,nativeEndpointFile:p.nativeEndpointFile,nativeKeyFile:p.nativeKeyFile,installationSealDigest:config.installationSealDigest}});await configs.init();
  const effects=new ProviderEffects(journal),edge=new CloudflareReleasePort({...config.cloudflare,installationSealDigest:config.installationSealDigest,schemaDigest:SCHEMA_DIGEST,effects,artifacts,token:async()=>(await privateBytes(p.cloudflareTokenFile,8192)).toString().trim(),...(options.fetch?{fetch:options.fetch}:{})});
  const native={status:async()=>/** @type {import('./device-port.mjs').NativeStatus} */(/** @type {unknown} */(await privateControl({filename:p.nativeEndpointFile,role:'native',key:nativeKey,operation:'native.status',input:{},timeoutMs:10000}))),drain:async(/** @type {import('./types.js').ActivationEffect} */ effect)=>/** @type {import('./device-port.mjs').NativeStatus} */(/** @type {unknown} */(await privateControl({filename:p.nativeEndpointFile,role:'native',key:nativeKey,operation:'native.drain',input:json({effect}),timeoutMs:10000})))};
  const writerFence=new WriterFence({requestDirectory:/** @type {string} */(fenceConfig.requestDirectory),configurationFile:p.writerFenceConfigFile,pythonExecutable:p.pythonExecutable,helperFile:p.writerFenceHelperFile,environment:config.environment}),runit=new RunitControl({stateDirectory:/** @type {string} */(runitConfig.stateDirectory),configurationFile:p.runitConfigFile,pythonExecutable:p.pythonExecutable,helperFile:p.runitHelperFile,environment:config.environment});
  const device=new DeviceActivationPort({journal,installationId:config.installationId,repositoryId:config.repositoryId,bindingEpoch:config.bindingEpoch,writerFence,runit,pointer:()=>configs.current(),pointerFor:pair=>configs.pointerFor(pair),native,edge});
  const controller=new ActivationController({journal,port:{reconcile:async effect=>{device.assert(effect);return effect.step==='edge.activate'?edge.reconcileActivation(effect):device.reconcile(effect);},execute:async effect=>{device.assert(effect);return effect.step==='edge.activate'?edge.activate(effect):device.execute(effect);}}});
  const service=new FixedReleaseService({journal,controller,artifacts,configs,edge,nativeStatus:native.status,baseline:config.baseline,installationId:config.installationId,repositoryId:config.repositoryId,bindingEpoch:config.bindingEpoch,installationSealDigest:config.installationSealDigest,executor:config.executor});
  /** @type {import('./private-rpc.mjs').Handlers} */const handlers={
   'helper.status':async input=>{const value=record(input);if(value.kind==='runtime'){closed(value,['kind','deviceReleaseId','runtime']);return json(await service.runtimeAdmission(/** @type {Parameters<typeof service.runtimeAdmission>[0]} */(/** @type {unknown} */(value))));}closed(value,['kind']);if(value.kind==='active')return json({pair:await service.activePair()});requireThat(value.kind==='projection','INVALID_ARGUMENT');return json({installationId:config.installationId,repositoryId:config.repositoryId,bindingEpoch:config.bindingEpoch,helperOwnerEpoch:journal.ownerEpoch,retainedPair:service.retainedPair(),activation:journal.active()});},
   'stage.reconcile':async input=>{const value=record(input);closed(value,['effect']);return json(await service.reconcileStage(/** @type {import('./backend.mjs').StageEffect} */(/** @type {unknown} */(value.effect))));},
   'stage.upload':async input=>{const value=record(input);closed(value,['effect','build']);return json(await service.stage(/** @type {import('./backend.mjs').StageEffect} */(/** @type {unknown} */(value.effect)),/** @type {import('./backend.mjs').Build} */(/** @type {unknown} */(value.build))));},
   'activation.begin':async input=>{const value=record(input);closed(value,['intent','build']);return json(await service.begin(/** @type {import('./types.js').ActivationIntent} */(/** @type {unknown} */(value.intent)),/** @type {import('./backend.mjs').Build} */(/** @type {unknown} */(value.build))));},
   'activation.observe':async input=>{const value=record(input);closed(value,['activationId']);requireThat(typeof value.activationId==='string','INVALID_ARGUMENT');return json(service.observe(value.activationId));}
  };
  rpc=await servePrivateControl({role:'helper',filename:p.helperEndpointFile,key:helperKey,handlers});
  let closing=false;timer=setInterval(()=>{if(!closing)void service.tick().catch(()=>options.log?.('release_helper_effect_pending'));},1000);
  return {journal,service,configs,controller,edge,async close(){closing=true;if(timer)clearInterval(timer);await rpc?.close();await service.running?.catch(()=>{});journal.close();}};
 }catch(error){if(timer)clearInterval(timer);await rpc?.close().catch(()=>{});journal.close();throw error;}
}
