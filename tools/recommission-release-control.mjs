#!/usr/bin/env node
import {readFile,lstat,realpath,mkdir,open,rename,rm,readdir,chmod} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {canonicalJson,parseRecord,bytesDigest} from '../src/contracts/canonical.mjs';
import {requireThat} from '../src/contracts/errors.mjs';
import {digest} from '../src/contracts/identity.mjs';
import {readHelperConfig} from '../src/release/helper-runtime.mjs';
import {readNativeConfig} from '../src/runtime/native.mjs';
import {privateBytes,privateDirectory} from '../src/release/private-files.mjs';
import {privateControl} from '../src/release/private-rpc.mjs';
import {currentControllerReleaseControlPlan,retainedControllerRecommissionPair} from '../src/release/controller-recommissioning.mjs';

const sourceRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
/** @param {string} filename @param {number} [maximum] */
async function secure(filename,maximum=33554432){const p=resolve(filename),s=await lstat(p);requireThat(p===filename&&s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&(s.mode&0o077)===0&&s.size<=maximum&&await realpath(p)===p,'FORBIDDEN','Unsafe recommission source file');const b=await readFile(p),a=await lstat(p);requireThat(a.ino===s.ino&&a.dev===s.dev&&a.size===s.size&&a.mtimeMs===s.mtimeMs,'INTEGRITY_FAILURE','Recommission source changed');return b;}
/** @param {string} filename @param {Uint8Array} bytes @param {number} [mode] */
async function writeExact(filename,bytes,mode=0o600){await mkdir(dirname(filename),{recursive:true,mode:0o700});const f=await open(filename,'wx',mode);try{await f.writeFile(bytes);await f.sync();}finally{await f.close();}await chmod(filename,mode);}
/** @param {string} filename @param {Uint8Array} bytes @param {number} mode */
async function replaceExact(filename,bytes,mode){const temporary=filename+'.tmp-'+process.pid+'-'+Date.now(),f=await open(temporary,'wx',mode);try{await f.writeFile(bytes);await f.sync();}finally{await f.close();}await chmod(temporary,mode);await rename(temporary,filename);const d=await open(dirname(filename),'r');try{await d.sync();}finally{await d.close();}}
/** @param {string} service */
async function stopped(service){const status=await readFile(join(service,'supervise/status'));return status.length===20&&status.readUInt32LE(12)===0&&status[17]===100&&status[19]===0;}
/** @param {string} root @param {string} path */
function rel(root,path){requireThat(path===root||path.startsWith(root+'/'),'INTEGRITY_FAILURE','Planned path escaped recommission root');return path.slice(root.length+1);}
/** @param {any} helper */
function retainedPair(helper){
 const db=new DatabaseSync(helper.paths.journalFile,{readOnly:true});try{
  const active=Number(db.prepare('SELECT count(*) n FROM activation WHERE active=1').get()?.n??-1);requireThat(active===0,'EXECUTION_UNAVAILABLE','Release activation is not quiescent');
  const row=db.prepare('SELECT record FROM activation WHERE active=0 ORDER BY rowid DESC LIMIT 1').get();
  return retainedControllerRecommissionPair(helper.baseline,row?parseRecord(String(row.record),1048576):null);
 }finally{db.close();}
}
/** @param {string} oldRoot @param {string} newRoot @param {string} managedFile @param {string} productionFile @param {boolean} livePair */
async function snapshot(oldRoot,newRoot,managedFile,productionFile,livePair){
 const helperFile=join(oldRoot,'helper-config.json'),helper=await readHelperConfig(helperFile),runit=/** @type {any} */(parseRecord(await privateBytes(helper.paths.runitConfigFile),262144)),writer=/** @type {any} */(parseRecord(await privateBytes(helper.paths.writerFenceConfigFile),262144)),installationSeal=/** @type {any} */(parseRecord(await privateBytes(join(oldRoot,'installation-seal.json')),262144));
 const pointer=/** @type {any} */(parseRecord(await privateBytes(helper.paths.pointerFile),16384)),nativeFile=join(helper.paths.nativeConfigDirectory,digest(pointer.deviceReleaseId).slice(7)+'.json'),activeConfig=await readNativeConfig(nativeFile),helperServiceDirectory=join(dirname(runit.serviceDirectory),'tdev-release-helper');
 const key=await privateBytes(helper.paths.helperKeyFile,32);let activePair;
 if(livePair){requireThat(!await stopped(helperServiceDirectory),'EXECUTION_UNAVAILABLE','Release helper must be running for recommission inspection');const active=/** @type {any} */(await privateControl({filename:helper.paths.helperEndpointFile,role:'helper',key,operation:'helper.status',input:{kind:'active'},timeoutMs:10000}));activePair=active.pair;}
 else activePair=retainedPair(helper);
 const managedEnrollment=/** @type {any} */(parseRecord(await privateBytes(managedFile,4194304),4194304)),productionEnrollment=/** @type {any} */(parseRecord(await privateBytes(productionFile,4194304),4194304));
 const helperBundleBytes=await secure(join(oldRoot,'helper.mjs'),16777216),writerFenceHelperBytes=await secure(helper.paths.writerFenceHelperFile),runitHelperBytes=await secure(helper.paths.runitHelperFile),commonModuleBytes=await secure(helper.paths.commonModuleFile),launcherBytes=await readFile(join(sourceRoot,'tools/release-device-launcher.py')),nodeBytes=await readFile(process.execPath);
 let previousLauncherCommissioningSealDigest=null;try{const oldSeal=/** @type {any} */(parseRecord(await privateBytes(join(dirname(helper.paths.runitConfigFile),'launcher-commissioning-seal.json')),262144));previousLauncherCommissioningSealDigest=oldSeal.commissioningSealDigest??null;}catch(error){if(!(error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT'))throw error;}
 const plan=currentControllerReleaseControlPlan({newRoot,managedEnrollmentFile:managedFile,productionEnrollmentFile:productionFile,oldHelper:helper,oldRunit:runit,oldWriter:writer,installationSeal,activePair,activePointer:pointer,activeConfig,managedEnrollment,productionEnrollment,helperBundleBytes,writerFenceHelperBytes,runitHelperBytes,commonModuleBytes,launcherBytes,nodeExecutable:process.execPath,nodeDigest:bytesDigest(nodeBytes),helperServiceDirectory,previousLauncherCommissioningSealDigest});
 return {plan,helper,runit,writer,pointer,activeConfig,helperFile,nativeFile,helperBundleBytes,writerFenceHelperBytes,runitHelperBytes,commonModuleBytes,keyBytes:key,nativeKeyBytes:await privateBytes(helper.paths.nativeKeyFile,32),cloudflareTokenBytes:await privateBytes(helper.paths.cloudflareTokenFile,8192),helperServiceDirectory,oldTdevRun:await secure(join(runit.serviceDirectory,'run'),65536),oldHelperRun:await secure(join(helperServiceDirectory,'run'),65536)};
}
/** @param {any} config @param {any} helper */
function assertQuiescent(config,helper){
 const db=new DatabaseSync(join(resolve(config.stateDirectory),'work.sqlite'),{readOnly:true});try{
  const held=Number(db.prepare('SELECT count(*) n FROM attempt WHERE held=1').get()?.n??-1),activeAssignments=Number(db.prepare("SELECT count(*) n FROM managed_assignment WHERE state IN ('offered','running')").get()?.n??-1);
  requireThat(held===0&&activeAssignments===0,'EXECUTION_UNAVAILABLE','Native work/managed execution is not quiescent');
 }finally{db.close();}
 const j=new DatabaseSync(helper.paths.journalFile,{readOnly:true});try{const n=Number(j.prepare('SELECT count(*) n FROM activation WHERE active=1').get()?.n??-1);requireThat(n===0,'EXECUTION_UNAVAILABLE','Release activation is not quiescent');}finally{j.close();}
}
/** @param {string} oldRoot @param {string} newStage @param {string} releaseId */
async function copyArtifact(oldRoot,newStage,releaseId){const src=join(oldRoot,'artifacts',digest(releaseId).slice(7)),dst=join(newStage,'artifacts',digest(releaseId).slice(7));await mkdir(dst,{recursive:true,mode:0o700});const names=(await readdir(src)).sort();requireThat(names.join(',')==='artifacts.json,device.cjs,manifest.json,tools.json,worker.mjs','INTEGRITY_FAILURE','Active artifact set differs');for(const name of names)await writeExact(join(dst,name),await secure(join(src,name),33554432),0o400);}
async function main(){process.umask(0o077);const a=parseArgs({options:{'old-root':{type:'string'},'new-root':{type:'string'},'managed-enrollment':{type:'string'},'production-enrollment':{type:'string'},mode:{type:'string'},'expected-plan':{type:'string'},output:{type:'string'}},strict:true,allowPositionals:false}).values;
 requireThat(typeof a['old-root']==='string'&&typeof a['new-root']==='string'&&typeof a['managed-enrollment']==='string'&&typeof a['production-enrollment']==='string'&&typeof a.mode==='string'&&typeof a.output==='string','INVALID_ARGUMENT','Missing controller recommission input');
 const oldRootArg=/** @type {string} */(a['old-root']),newRootArg=/** @type {string} */(a['new-root']),managedArg=/** @type {string} */(a['managed-enrollment']),productionArg=/** @type {string} */(a['production-enrollment']),mode=/** @type {string} */(a.mode),outputArg=/** @type {string} */(a.output);
 const oldRoot=resolve(oldRootArg),newRoot=resolve(newRootArg),managedFile=resolve(managedArg),productionFile=resolve(productionArg),output=resolve(outputArg);requireThat(oldRoot===oldRootArg&&newRoot===newRootArg&&managedFile===managedArg&&productionFile===productionArg&&output===outputArg&&oldRoot!==newRoot,'FORBIDDEN','Absolute distinct recommission paths required');requireThat(['inspect','apply'].includes(mode),'INVALID_ARGUMENT');
 const state=await snapshot(oldRoot,newRoot,managedFile,productionFile,mode==='inspect'),p=state.plan,summary={schemaVersion:1,kind:'tdev.current-controller-release-control-recommission',planDigest:p.planDigest,newRoot,installationId:p.helper.installationId,repositoryId:p.helper.repositoryId,bindingEpoch:p.helper.bindingEpoch,baselineReleaseId:p.baselinePointer.deviceReleaseId,baselineSourceCommitOid:p.baselinePointer.sourceCommitOid,managedEnrollmentSealDigest:p.recommissionSeal.managedEnrollmentSealDigest,productionEnrollmentSealDigest:p.recommissionSeal.productionEnrollmentSealDigest,recommissionSealDigest:p.recommissionSealDigest};
 if(mode==='inspect'){await replaceExact(output,Buffer.from(canonicalJson(summary)+'\n'),0o600);process.stdout.write(canonicalJson(summary)+'\n');return;}
 const expectedPlan=/** @type {string|undefined} */(a['expected-plan']);requireThat(typeof expectedPlan==='string'&&expectedPlan===p.planDigest,'STALE_REVISION','Recommission plan changed');requireThat(await stopped(state.runit.serviceDirectory)&&await stopped(state.helperServiceDirectory),'EXECUTION_UNAVAILABLE','Device and release helper must be stopped');assertQuiescent(state.activeConfig,state.helper);
 try{await lstat(newRoot);throw Object.assign(new Error('Target root already exists'),{code:'STALE_REVISION'});}catch(error){if(!(error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT'))throw error;}
 const stage=newRoot+'.stage-'+process.pid+'-'+Date.now();await privateDirectory(stage);
 try{
  for(const d of ['home','tmp','fixed','rpc','native-configs','artifacts'])await mkdir(join(stage,d),{recursive:true,mode:0o700});
  await writeExact(join(stage,'helper.mjs'),state.helperBundleBytes);await writeExact(join(stage,'cloudflare-token'),state.cloudflareTokenBytes);await writeExact(join(stage,'rpc/helper.key'),state.keyBytes);await writeExact(join(stage,'rpc/native.key'),state.nativeKeyBytes);
  await writeExact(join(stage,rel(newRoot,p.paths.writerFenceHelperFile)),state.writerFenceHelperBytes);await writeExact(join(stage,rel(newRoot,p.paths.runitHelperFile)),state.runitHelperBytes);await writeExact(join(stage,rel(newRoot,p.paths.commonModuleFile)),state.commonModuleBytes);
  await writeExact(join(stage,rel(newRoot,p.paths.writerFenceConfigFile)),p.writerBytes);await writeExact(join(stage,rel(newRoot,p.paths.runitConfigFile)),p.runitBytes);await writeExact(join(stage,'fixed/release-device-launcher.py'),p.launcher.launcherBytes);await writeExact(join(stage,'fixed/launcher.json'),p.launcher.launcherConfigBytes);await writeExact(join(stage,'fixed/launcher-commissioning-seal.json'),p.launcher.commissioningSealBytes);await writeExact(join(stage,'fixed/controller-recommission-seal.json'),p.recommissionSealBytes);
  await writeExact(join(stage,'helper-config.json'),p.helperBytes);await writeExact(join(stage,'native-base.json'),p.baseConfigBytes);await writeExact(join(stage,'native-configs',digest(p.baselinePointer.deviceReleaseId).slice(7)+'.json'),p.baseConfigBytes);await writeExact(join(stage,'device-pointer.json'),Buffer.from(canonicalJson(p.baselinePointer)));
  await copyArtifact(oldRoot,stage,p.baselinePointer.deviceReleaseId);await writeExact(join(stage,'helper-service-run'),p.helperServiceRunBytes,0o700);await writeExact(join(stage,'previous-tdev-run'),state.oldTdevRun,0o700);await writeExact(join(stage,'previous-helper-run'),state.oldHelperRun,0o700);
  await rename(stage,newRoot);
  try{await replaceExact(join(state.runit.serviceDirectory,'run'),p.launcher.serviceRunBytes,0o700);await replaceExact(join(state.helperServiceDirectory,'run'),p.helperServiceRunBytes,0o700);}
  catch(error){await replaceExact(join(state.runit.serviceDirectory,'run'),state.oldTdevRun,0o700);await replaceExact(join(state.helperServiceDirectory,'run'),state.oldHelperRun,0o700);throw error;}
  requireThat(bytesDigest(await secure(join(state.runit.serviceDirectory,'run'),65536))===p.launcher.serviceRunDigest&&bytesDigest(await secure(join(state.helperServiceDirectory,'run'),65536))===p.helperServiceRunDigest,'INTEGRITY_FAILURE','Global service-run recommission readback differs');
  const result={...summary,applied:true};await replaceExact(output,Buffer.from(canonicalJson(result)+'\n'),0o600);process.stdout.write(canonicalJson(result)+'\n');
 }finally{await rm(stage,{recursive:true,force:true});}
}
main().catch(error=>{process.stderr.write(canonicalJson({kind:'tdev.current-controller-release-control-recommission-error',code:typeof error?.code==='string'?error.code:'INTEGRITY_FAILURE'})+'\n');process.exitCode=1;});
