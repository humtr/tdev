import {resolve,join,dirname} from 'node:path';
import {canonicalJson,parseRecord,recordDigest,bytesDigest} from '../contracts/canonical.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {digest} from '../contracts/identity.mjs';
import {runtimeBindings} from '../repository/bindings.mjs';
import {enrollmentRecord,verifyEnrollment} from '../runtime/enrollment.mjs';
import {productionIntentDigest} from '../runtime/production-enrollment.mjs';
import {verifyProductionQualification} from '../execution/production-qualification.mjs';
import {releaseLauncherCommissioning} from './launcher-commissioning.mjs';
import {runtimePair} from './manifest.mjs';

/** @param {string} value */
function absolute(value){requireThat(typeof value==='string'&&resolve(value)===value&&value.length<=4096,'INVALID_ARGUMENT','Absolute recommissioning path required');return value;}
/** @param {string} value */
function quote(value){return "'" + value.replaceAll("'","'\\''") + "'";}

/**
 * Join fresh provider qualification to the exact currently executing controller.
 * Historical enrollment contributes only stable installation/provider/ruleset identity.
 * @param {{config:any,source:any,definition:any,priorManaged:any,providerRunJson:string,managedControllerReportJson:string,containmentReportJson:string,productionReportJson:string,managedEnrollmentFile:string,productionEnrollmentFile:string}} input
 */
export function prepareCurrentControllerRecommission(input){
 const {config,source,definition,priorManaged}=input,{binding}=runtimeBindings(config.edge);
 absolute(input.managedEnrollmentFile);absolute(input.productionEnrollmentFile);
 requireThat(config.runtime.sourceTreeOid===source.treeOid&&definition.config.workflowPath==='.github/workflows/tdev-executor.yml','INTEGRITY_FAILURE','Current controller definition required');
 const provider=/** @type {any} */(parseRecord(input.providerRunJson,1048576)),runId=String(provider.id??'');
 requireThat(/^[1-9][0-9]*$/.test(runId),'INTEGRITY_FAILURE','Selected provider run id required');
 const body={schemaVersion:1,kind:'tdev-managed-enrollment',installationId:binding.installationId,repositoryId:binding.repositoryId,bindingEpoch:binding.bindingEpoch,repositoryOwnerId:String(priorManaged.repositoryOwnerId),repositoryFullName:String(priorManaged.repositoryFullName),approvedCommitOid:config.runtime.sourceCommitOid,approvedSourceManifestDigest:source.manifestDigest,identities:structuredClone(definition.identities),qualification:{providerRunJson:input.providerRunJson,controllerReportJson:input.managedControllerReportJson,containmentReportJson:input.containmentReportJson},nativeJoin:{sourceCommitOid:config.runtime.sourceCommitOid,sourceTreeOid:config.runtime.sourceTreeOid,inputDigest:source.manifestDigest,coreStatus:'passed',integrationStatus:'passed',productionValidation:false},canonicalRuleset:structuredClone(priorManaged.canonicalRuleset)};
 const managed=enrollmentRecord(/** @type {any} */(body));
 verifyEnrollment(managed,{binding,definition,source,runtime:config.runtime,origin:config.edge.origin});
 const productionQualification=verifyProductionQualification(input.productionReportJson,{sourceCommit:config.runtime.sourceCommitOid.slice(5),source,definition,providerRunId:runId});
 const commissioningId=recordDigest('tdev.controller-recommissioning.v1',{installationId:binding.installationId,repositoryId:binding.repositoryId,bindingEpoch:binding.bindingEpoch,approvedCommitOid:config.runtime.sourceCommitOid,managedEnrollmentSeal:managed.sealDigest,productionQualification:productionQualification.reportDigest}).slice(7);
 const intent={schemaVersion:1,kind:'tdev.production-commissioning',commissioningId,installationId:binding.installationId,repositoryId:binding.repositoryId,bindingEpoch:binding.bindingEpoch,providerRepositoryId:binding.providerRepositoryId,repositoryOwnerId:String(priorManaged.repositoryOwnerId),repositoryFullName:String(priorManaged.repositoryFullName),approvedCommitOid:config.runtime.sourceCommitOid,approvedSourceTreeOid:source.treeOid,approvedSourceManifestDigest:source.manifestDigest,identities:structuredClone(definition.identities),engineDigest:productionQualification.engineDigest,dependencyArtifactDigest:productionQualification.dependencyArtifactDigest,qualificationSealDigest:managed.sealDigest,runtime:structuredClone(config.runtime)};
 productionIntentDigest(/** @type {any} */(intent));
 const commissionConfig={...structuredClone(config),managedEnrollmentFile:input.managedEnrollmentFile,productionEnrollmentFile:null};
 const managedBytes=Buffer.from(canonicalJson(managed)),intentBytes=Buffer.from(canonicalJson(intent)),commissionConfigBytes=Buffer.from(canonicalJson(commissionConfig));
 const planDigest=recordDigest('tdev.current-controller-recommission-preparation.v1',{installationId:binding.installationId,repositoryId:binding.repositoryId,bindingEpoch:binding.bindingEpoch,approvedCommitOid:config.runtime.sourceCommitOid,managedEnrollmentDigest:bytesDigest(managedBytes),productionIntentDigest:productionIntentDigest(/** @type {any} */(intent)),commissionConfigDigest:bytesDigest(commissionConfigBytes),productionEnrollmentFile:input.productionEnrollmentFile});
 return Object.freeze({planDigest,managed,managedBytes,intent,intentBytes,commissionConfig,commissionConfigBytes,productionEnrollmentFile:input.productionEnrollmentFile});
}

/**
 * Rebind the exact durable pair after the fixed helper has stopped. Only a
 * terminal activation record may supersede the sealed helper baseline.
 * @param {any} baseline
 * @param {any|null} terminal
 */
export function retainedControllerRecommissionPair(baseline,terminal){
 if(terminal===null)return runtimePair(baseline);
 requireThat(terminal&&typeof terminal==='object'&&!Array.isArray(terminal)&&['active','rolled_back'].includes(terminal.phase)&&terminal.observedPair,'INTEGRITY_FAILURE','Retained release pair unavailable');
 const expected=terminal.phase==='active'?terminal.intent?.target:terminal.intent?.previous;
 requireThat(expected&&canonicalJson(terminal.observedPair)===canonicalJson(expected),'INTEGRITY_FAILURE','Retained release pair differs from terminal activation');
 return runtimePair(terminal.observedPair);
}

/**
 * Deterministically compose a fresh release-control subroot around an already
 * verified current managed/production enrollment and exact active pair.
 * @param {{newRoot:string,managedEnrollmentFile:string,productionEnrollmentFile:string,oldHelper:any,oldRunit:any,oldWriter:any,installationSeal:Record<string,unknown>,activePair:any,activePointer:any,activeConfig:any,managedEnrollment:any,productionEnrollment:any,helperBundleBytes:Uint8Array,writerFenceHelperBytes:Uint8Array,runitHelperBytes:Uint8Array,commonModuleBytes:Uint8Array,launcherBytes:Uint8Array,nodeExecutable:string,nodeDigest:string,helperServiceDirectory:string,previousLauncherCommissioningSealDigest:string|null}} input
 */
export function currentControllerReleaseControlPlan(input){
 const root=absolute(input.newRoot),h=input.oldHelper,r=input.oldRunit,w=input.oldWriter,p=input.activePointer,c=input.activeConfig,m=input.managedEnrollment,prod=input.productionEnrollment,pair=input.activePair;
 for(const v of [input.managedEnrollmentFile,input.productionEnrollmentFile,input.nodeExecutable,input.helperServiceDirectory])absolute(v);
 requireThat(h.installationId===p.installationId&&h.repositoryId===p.repositoryId&&h.bindingEpoch===p.bindingEpoch,'INTEGRITY_FAILURE','Active pointer installation identity differs');
 requireThat(c.runtime.sourceCommitOid===p.sourceCommitOid&&c.runtime.bundleDigest===p.artifactDigest&&c.runtime.schemaDigest===p.schemaDigest,'INTEGRITY_FAILURE','Active native config differs from pointer');
 requireThat(pair.deviceReleaseId===p.deviceReleaseId&&pair.deviceSourceCommitOid===p.sourceCommitOid&&pair.deviceArtifactDigest===p.artifactDigest&&pair.schemaDigest===p.schemaDigest,'INTEGRITY_FAILURE','Active pair differs from pointer');
 requireThat(pair.sourceCommitOid===pair.deviceSourceCommitOid&&pair.edgeSourceCommitOid===pair.sourceCommitOid,'INTEGRITY_FAILURE','Recommission baseline must be one exact source pair');
 requireThat(m.approvedCommitOid===c.runtime.sourceCommitOid&&prod.intent?.approvedCommitOid===c.runtime.sourceCommitOid&&prod.intent?.qualificationSealDigest===m.sealDigest&&canonicalJson(prod.intent?.runtime)===canonicalJson(c.runtime),'INTEGRITY_FAILURE','Current enrollment/runtime join differs');
 digest(m.sealDigest);digest(prod.sealDigest);digest(h.installationSealDigest);digest(input.nodeDigest);
 requireThat(bytesDigest(input.helperBundleBytes)===h.helperBundleDigest&&bytesDigest(input.writerFenceHelperBytes)===h.fixedFiles.writerFenceHelper&&bytesDigest(input.runitHelperBytes)===h.fixedFiles.runitHelper&&bytesDigest(input.commonModuleBytes)===h.fixedFiles.commonModule,'INTEGRITY_FAILURE','Retained fixed helper bytes differ');
 const paths={...structuredClone(h.paths),journalFile:join(root,'activation.json'),artifactDirectory:join(root,'artifacts'),pointerFile:join(root,'device-pointer.json'),nativeConfigDirectory:join(root,'native-configs'),baseConfigFile:join(root,'native-base.json'),helperEndpointFile:join(root,'rpc/helper-endpoint.json'),helperKeyFile:join(root,'rpc/helper.key'),nativeEndpointFile:join(root,'rpc/native-endpoint.json'),nativeKeyFile:join(root,'rpc/native.key'),writerFenceConfigFile:join(root,'fixed/writer-fence.json'),runitConfigFile:join(root,'fixed/runit.json'),writerFenceHelperFile:join(root,'fixed/release-writer-fence.py'),runitHelperFile:join(root,'fixed/release-runit-control.py'),commonModuleFile:join(root,'fixed/release_native.py'),cloudflareTokenFile:join(root,'cloudflare-token')};
 const releaseControl={helperEndpointFile:paths.helperEndpointFile,helperKeyFile:paths.helperKeyFile,nativeEndpointFile:paths.nativeEndpointFile,nativeKeyFile:paths.nativeKeyFile,installationSealDigest:h.installationSealDigest,deviceReleaseId:p.deviceReleaseId};
 const baseConfig={...structuredClone(c),managedEnrollmentFile:input.managedEnrollmentFile,productionEnrollmentFile:input.productionEnrollmentFile,releaseControl,releaseArtifactDirectory:paths.artifactDirectory};
 const baseConfigBytes=Buffer.from(canonicalJson(baseConfig)),baseConfigDigest=bytesDigest(baseConfigBytes),baselinePointer={...structuredClone(p),nativeConfigDigest:baseConfigDigest};
 const writer={...structuredClone(w),pointerFile:paths.pointerFile,launcherLockFile:join(root,'launcher.lock'),artifactDirectory:paths.artifactDirectory,nativeConfigDirectory:paths.nativeConfigDirectory,requestDirectory:join(root,'writer-effects')};
 const writerBytes=Buffer.from(canonicalJson(writer)),writerDigest=bytesDigest(writerBytes);
 const runit={...structuredClone(r),pointerFile:paths.pointerFile,stateDirectory:join(root,'runit-effects')};
 const environment={...structuredClone(h.environment),HOME:join(root,'home'),TMPDIR:join(root,'tmp')};
 const executor={sealDigest:prod.sealDigest,controllerDigest:prod.intent.identities.trustedRunnerDigest,workflowDigest:prod.intent.identities.workflowDigest};
 const helper0={...structuredClone(h),executor,baseline:structuredClone(pair),baselinePointer,baseConfigDigest,paths,fixedFiles:{writerFenceHelper:bytesDigest(input.writerFenceHelperBytes),runitHelper:bytesDigest(input.runitHelperBytes),commonModule:bytesDigest(input.commonModuleBytes),writerFenceConfig:writerDigest,runitConfig:h.fixedFiles.runitConfig},environment,cloudflare:{...structuredClone(h.cloudflare),edgeConfig:structuredClone(c.edge)}};
 const launcher=releaseLauncherCommissioning({helper:helper0,runit,writer,installationSeal:input.installationSeal,launcherBytes:input.launcherBytes,nodeExecutable:input.nodeExecutable,nodeDigest:input.nodeDigest});
 const prefix=dirname(dirname(h.paths.pythonExecutable)),shell=join(prefix,'bin/sh'),env=join(prefix,'bin/env');
 const helperServiceRun='#!'+shell+'\nexec 2>&1\numask 077\nexec '+quote(env)+' -i '+['PATH='+environment.PATH,'HOME='+environment.HOME,'TMPDIR='+environment.TMPDIR,'LANG='+environment.LANG].map(quote).join(' ')+' '+quote(input.nodeExecutable)+' '+quote(join(root,'helper.mjs'))+' --config '+quote(join(root,'helper-config.json'))+'\n';
 const helperServiceRunBytes=Buffer.from(helperServiceRun),helperServiceRunDigest=bytesDigest(helperServiceRunBytes);
 const previousSeal=input.previousLauncherCommissioningSealDigest===null?null:digest(input.previousLauncherCommissioningSealDigest);
 const sealBody={schemaVersion:1,kind:'tdev.controller-recommission-seal',baseInstallationSealDigest:h.installationSealDigest,previousLauncherCommissioningSealDigest:previousSeal,installationId:h.installationId,repositoryId:h.repositoryId,bindingEpoch:h.bindingEpoch,baselineReleaseId:p.deviceReleaseId,baselineSourceCommitOid:p.sourceCommitOid,managedEnrollmentSealDigest:m.sealDigest,productionEnrollmentSealDigest:prod.sealDigest,baseConfigDigest,writerFenceConfigDigest:writerDigest,launcherCommissioningSealDigest:launcher.commissioningSealDigest,helperServiceRunDigest,helperBundleDigest:h.helperBundleDigest};
 const recommissionSealDigest=recordDigest('tdev.controller-recommission-seal.v1',sealBody),recommissionSeal={...sealBody,recommissionSealDigest},recommissionSealBytes=Buffer.from(canonicalJson(recommissionSeal));
 const planDigest=recordDigest('tdev.controller-recommission-plan.v1',{newRoot:root,installationId:h.installationId,repositoryId:h.repositoryId,bindingEpoch:h.bindingEpoch,baselinePointer,managedEnrollmentSealDigest:m.sealDigest,productionEnrollmentSealDigest:prod.sealDigest,baseConfigDigest,writerFenceConfigDigest:writerDigest,runitConfigDigest:launcher.runitConfigDigest,helperConfigDigest:launcher.helperConfigDigest,launcherCommissioningSealDigest:launcher.commissioningSealDigest,helperServiceRunDigest,recommissionSealDigest});
 return Object.freeze({planDigest,root,paths,releaseControl,baseConfig,baseConfigBytes,baseConfigDigest,baselinePointer,writer,writerBytes,writerDigest,runit:launcher.runitConfig,runitBytes:launcher.runitConfigBytes,runitDigest:launcher.runitConfigDigest,helper:launcher.helperConfig,helperBytes:launcher.helperConfigBytes,helperDigest:launcher.helperConfigDigest,launcher,helperServiceRun,helperServiceRunBytes,helperServiceRunDigest,recommissionSeal,recommissionSealBytes,recommissionSealDigest});
}
