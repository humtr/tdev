import {readFile,open,rename,rm,chmod} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {bytesDigest,canonicalJson,parseRecord} from '../src/contracts/canonical.mjs';
import {requireThat} from '../src/contracts/errors.mjs';
import {privateBytes,privateDirectory} from '../src/release/private-files.mjs';
import {readHelperConfig} from '../src/release/helper-runtime.mjs';
import {releaseLauncherCommissioning} from '../src/release/launcher-commissioning.mjs';

const sourceRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');

/** @param {string} filename @param {Uint8Array} bytes @param {number} mode */
async function replacePrivate(filename,bytes,mode){
 await privateDirectory(dirname(filename));const temporary=filename+'.tmp-'+process.pid+'-'+Date.now(),file=await open(temporary,'wx',mode);
 try{try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}await chmod(temporary,mode);await rename(temporary,filename);const dir=await open(dirname(filename),'r');try{await dir.sync();}finally{await dir.close();}}finally{await rm(temporary,{force:true});}
}
/** @param {string} filename @param {Uint8Array} bytes */
async function backup(filename,bytes){await replacePrivate(filename,bytes,0o600);}
/** @param {string} statusFile */
async function requireStopped(statusFile){const status=await readFile(statusFile);requireThat(status.length===20&&status.readUInt32LE(12)===0&&status[17]===100&&status[19]===0,'EFFECT_UNCERTAIN','Release helper must be stopped before launcher commissioning');}
/** @param {string} filename */
async function optionalPrivate(filename){try{return await privateBytes(filename);}catch(error){if(error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT')return null;throw error;}}

/** @param {string} root */
export async function inspectLauncherCommissioning(root){
 requireThat(resolve(root)===root,'INVALID_ARGUMENT','Absolute release-control root required');
 const helperFile=join(root,'helper-config.json'),helper=await readHelperConfig(helperFile),runitBytes=await privateBytes(helper.paths.runitConfigFile),writerBytes=await privateBytes(helper.paths.writerFenceConfigFile);
 const runit=/** @type {any} */(parseRecord(runitBytes,262144)),writer=/** @type {any} */(parseRecord(writerBytes,262144));
 const serviceRunFile=join(runit.serviceDirectory,'run'),serviceRunBytes=await privateBytes(serviceRunFile,65536);
 requireThat(helper.fixedFiles.runitConfig===bytesDigest(runitBytes)&&runit.serviceRunDigest===bytesDigest(serviceRunBytes),'INTEGRITY_FAILURE','Current fixed runit seal differs');
 const launcherBytes=await readFile(join(sourceRoot,'tools/release-device-launcher.py')),nodeBytes=await readFile(process.execPath),target=releaseLauncherCommissioning({helper:/** @type {any} */(helper),runit,writer,launcherBytes,nodeExecutable:process.execPath,nodeDigest:bytesDigest(nodeBytes)});
 const launcher=await optionalPrivate(target.launcherFile),launcherConfig=await optionalPrivate(target.launcherConfigFile);
 const current={serviceRun:bytesDigest(serviceRunBytes),runit:bytesDigest(runitBytes),helper:bytesDigest(await privateBytes(helperFile)),launcher:launcher?bytesDigest(launcher):null,launcherConfig:launcherConfig?bytesDigest(launcherConfig):null};
 const commissioned=current.serviceRun===target.serviceRunDigest&&current.runit===target.runitConfigDigest&&current.helper===target.helperConfigDigest&&current.launcher===target.launcherDigest&&current.launcherConfig===target.launcherConfigDigest;
 return {root,helperFile,helper,runit,writer,target,current,commissioned};
}

async function main(){
 const args=parseArgs({args:process.argv.slice(2),options:{root:{type:'string'},apply:{type:'boolean'},expectedPlan:{type:'string'},output:{type:'string'}},strict:true,allowPositionals:false}).values;
 requireThat(typeof args.root==='string'&&typeof args.output==='string','INVALID_ARGUMENT','Usage: commission-release-launcher --root <absolute> --output <absolute> [--apply --expectedPlan <digest>]');
 const state=await inspectLauncherCommissioning(resolve(args.root));
 const summary=()=>({schemaVersion:1,kind:'tdev.release-launcher-commissioning',planDigest:state.target.planDigest,commissioned:state.commissioned,installationId:state.helper.installationId,repositoryId:state.helper.repositoryId,bindingEpoch:state.helper.bindingEpoch,serviceRunDigest:state.target.serviceRunDigest,runitConfigDigest:state.target.runitConfigDigest,helperConfigDigest:state.target.helperConfigDigest,launcherDigest:state.target.launcherDigest,launcherConfigDigest:state.target.launcherConfigDigest});
 if(!args.apply){await replacePrivate(resolve(args.output),Buffer.from(canonicalJson(summary())+'\n'),0o600);console.log(JSON.stringify(summary()));return;}
 requireThat(args.expectedPlan===state.target.planDigest,'STALE_REVISION','Launcher commissioning plan changed');
 if(state.commissioned){await replacePrivate(resolve(args.output),Buffer.from(canonicalJson(summary())+'\n'),0o600);console.log(JSON.stringify(summary()));return;}
 const pointer=parseRecord(await privateBytes(state.helper.paths.pointerFile),262144);requireThat(canonicalJson(pointer)===canonicalJson(state.helper.baselinePointer),'STALE_RELEASE','Launcher commissioning requires retained baseline pointer');
 const helperService=join(dirname(state.runit.serviceDirectory),'tdev-release-helper');await requireStopped(join(helperService,'supervise/status'));
 const db=new DatabaseSync(state.helper.paths.journalFile,{readOnly:true});
 try{const raw=db.prepare('SELECT count(*) AS count FROM activation WHERE active=1').get(),count=raw&&typeof raw.count==='number'?raw.count:-1;requireThat(count===0,'EFFECT_UNCERTAIN','Launcher commissioning requires no active activation');}finally{db.close();}
 const backupRoot=join(state.root,'launcher-commissioning-backup-'+state.target.planDigest.slice(7,23));await privateDirectory(backupRoot);
 const serviceRunFile=join(state.runit.serviceDirectory,'run'),currentRun=await privateBytes(serviceRunFile,65536),currentRunit=await privateBytes(state.helper.paths.runitConfigFile),currentHelper=await privateBytes(state.helperFile),currentLauncher=await optionalPrivate(state.target.launcherFile),currentLauncherConfig=await optionalPrivate(state.target.launcherConfigFile);
 await backup(join(backupRoot,'service-run'),currentRun);await backup(join(backupRoot,'runit.json'),currentRunit);await backup(join(backupRoot,'helper-config.json'),currentHelper);
 if(currentLauncher)await backup(join(backupRoot,'release-device-launcher.py'),currentLauncher);if(currentLauncherConfig)await backup(join(backupRoot,'launcher.json'),currentLauncherConfig);
 try{
  await replacePrivate(state.target.launcherFile,state.target.launcherBytes,0o600);
  await replacePrivate(state.target.launcherConfigFile,state.target.launcherConfigBytes,0o600);
  await replacePrivate(serviceRunFile,state.target.serviceRunBytes,0o700);
  await replacePrivate(state.helper.paths.runitConfigFile,state.target.runitConfigBytes,0o600);
  await replacePrivate(state.helperFile,state.target.helperConfigBytes,0o600);
  requireThat(bytesDigest(await privateBytes(serviceRunFile,65536))===state.target.serviceRunDigest&&bytesDigest(await privateBytes(state.helper.paths.runitConfigFile))===state.target.runitConfigDigest&&bytesDigest(await privateBytes(state.helperFile))===state.target.helperConfigDigest&&bytesDigest(await privateBytes(state.target.launcherFile))===state.target.launcherDigest&&bytesDigest(await privateBytes(state.target.launcherConfigFile))===state.target.launcherConfigDigest,'INTEGRITY_FAILURE','Launcher commissioning readback differs');
 }catch(error){
  await replacePrivate(serviceRunFile,currentRun,0o700);await replacePrivate(state.helper.paths.runitConfigFile,currentRunit,0o600);await replacePrivate(state.helperFile,currentHelper,0o600);
  if(currentLauncher)await replacePrivate(state.target.launcherFile,currentLauncher,0o600);else await rm(state.target.launcherFile,{force:true});
  if(currentLauncherConfig)await replacePrivate(state.target.launcherConfigFile,currentLauncherConfig,0o600);else await rm(state.target.launcherConfigFile,{force:true});
  throw error;
 }
 const result={...summary(),commissioned:true,backupRoot};await replacePrivate(resolve(args.output),Buffer.from(canonicalJson(result)+'\n'),0o600);console.log(JSON.stringify(result));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(JSON.stringify({event:'release_launcher_commissioning_failed',code:typeof error?.code==='string'?error.code:'EXECUTION_UNAVAILABLE'}));process.exitCode=1;});
