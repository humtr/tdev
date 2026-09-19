import {resolve,dirname,join} from 'node:path';
import {bytesDigest,canonicalJson,recordDigest} from '../contracts/canonical.mjs';
import {requireThat} from '../contracts/errors.mjs';

/** @typedef {{installationId:string,repositoryId:string,bindingEpoch:string,installationSealDigest:string,baseline:{schemaDigest:string},baselinePointer:Record<string,unknown>,environment:Record<string,string>,fixedFiles:{runitConfig:string},paths:{pointerFile:string,artifactDirectory:string,nativeConfigDirectory:string,pythonExecutable:string,commonModuleFile:string,runitConfigFile:string,writerFenceConfigFile:string,journalFile:string}}} HelperConfig */
/** @typedef {{schemaVersion:number,installationId:string,repositoryId:string,bindingEpoch:string,pointerFile:string,serviceDirectory:string,serviceRunDigest:string,stateDirectory:string}} RunitConfig */
/** @typedef {{schemaVersion:number,installationId:string,repositoryId:string,bindingEpoch:string,pointerFile:string,launcherLockFile:string,artifactDirectory:string,nativeConfigDirectory:string}} WriterFenceConfig */

/** @param {string} value */
function absolute(value){requireThat(typeof value==='string'&&resolve(value)===value&&value.length<=4096,'INVALID_ARGUMENT','Absolute commissioning path required');return value;}
/** @param {string} value */
function quote(value){return "'"+value.replaceAll("'","'\\''")+"'";}

/** @param {{helper:HelperConfig,runit:RunitConfig,writer:WriterFenceConfig,installationSeal:Record<string,unknown>,launcherBytes:Uint8Array,nodeExecutable:string,nodeDigest:string}} input */
export function releaseLauncherCommissioning(input){
 const h=input.helper,r=input.runit,w=input.writer,seal=/** @type {any} */(structuredClone(input.installationSeal));
 requireThat(h&&r&&w&&seal&&r.schemaVersion===1&&w.schemaVersion===1,'INVALID_ARGUMENT','Release launcher commissioning inputs');
 requireThat(seal.schemaVersion===1&&seal.kind==='tdev.operator-installed-release-boundary'&&seal.installationId===h.installationId&&seal.repositoryId===h.repositoryId&&seal.bindingEpoch===h.bindingEpoch,'INTEGRITY_FAILURE','Base installation seal identity mismatch');
 requireThat(typeof h.installationSealDigest==='string'&&seal.installationSealDigest===h.installationSealDigest&&seal.fixedFiles&&typeof seal.fixedFiles==='object'&&typeof seal.fixedFiles.runitConfig==='string'&&typeof seal.serviceRunDigest==='string','INTEGRITY_FAILURE','Base installation seal shape mismatch');
 const sealBody=structuredClone(seal);delete sealBody.installationSealDigest;requireThat(recordDigest('tdev.operator-installed-release-boundary.v1',sealBody)===h.installationSealDigest,'INTEGRITY_FAILURE','Base installation seal digest mismatch');
 requireThat(h.installationId===r.installationId&&h.installationId===w.installationId&&h.repositoryId===r.repositoryId&&h.repositoryId===w.repositoryId&&h.bindingEpoch===r.bindingEpoch&&h.bindingEpoch===w.bindingEpoch,'INTEGRITY_FAILURE','Release launcher commissioning identity mismatch');
 requireThat(h.paths.pointerFile===r.pointerFile&&r.pointerFile===w.pointerFile&&h.paths.artifactDirectory===w.artifactDirectory&&h.paths.nativeConfigDirectory===w.nativeConfigDirectory,'INTEGRITY_FAILURE','Release launcher commissioning path mismatch');
 for(const value of [h.paths.pointerFile,h.paths.artifactDirectory,h.paths.nativeConfigDirectory,h.paths.pythonExecutable,h.paths.commonModuleFile,h.paths.runitConfigFile,h.paths.writerFenceConfigFile,h.paths.journalFile,r.serviceDirectory,w.launcherLockFile,input.nodeExecutable])absolute(value);
 const fixed=dirname(h.paths.runitConfigFile);requireThat(dirname(h.paths.commonModuleFile)===fixed&&dirname(h.paths.writerFenceConfigFile)===fixed,'INTEGRITY_FAILURE','Fixed release files must share one directory');
 const launcherFile=join(fixed,'release-device-launcher.py'),launcherConfigFile=join(fixed,'launcher.json');
 const launcherConfig={schemaVersion:1,installationId:h.installationId,repositoryId:h.repositoryId,bindingEpoch:h.bindingEpoch,pointerFile:h.paths.pointerFile,launcherLockFile:w.launcherLockFile,artifactDirectory:h.paths.artifactDirectory,nativeConfigDirectory:h.paths.nativeConfigDirectory,nodeExecutable:absolute(input.nodeExecutable),nodeDigest:input.nodeDigest,schemaDigest:h.baseline.schemaDigest,environment:structuredClone(h.environment)};
 const launcherConfigBytes=Buffer.from(canonicalJson(launcherConfig));
 const launcherDigest=bytesDigest(input.launcherBytes),launcherConfigDigest=bytesDigest(launcherConfigBytes);
 const python=absolute(h.paths.pythonExecutable),prefix=dirname(dirname(python));requireThat(python===join(prefix,'bin','python'),'INTEGRITY_FAILURE','Fixed Python executable is outside Termux prefix');
 for(const key of ['PATH','HOME','TMPDIR','LANG'])requireThat(typeof h.environment[key]==='string'&&h.environment[key].length>0,'INTEGRITY_FAILURE','Fixed launcher environment is incomplete');
 const verifier=[
  'import hashlib,os,stat,sys',
  'launcher,config,launcher_digest,config_digest,python=sys.argv[1:]',
  'def check(path,expected):',
  ' fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)',
  ' try:',
  '  info=os.fstat(fd)',
  '  ok=stat.S_ISREG(info.st_mode) and info.st_uid==os.getuid() and info.st_nlink==1 and info.st_mode & 0o077==0',
  '  data=b""',
  '  while True:',
  '   part=os.read(fd,1048576)',
  '   if not part: break',
  '   data+=part',
  '   if len(data)>1048576: raise SystemExit(111)',
  '  if not ok or "sha256:"+hashlib.sha256(data).hexdigest()!=expected: raise SystemExit(111)',
  ' finally: os.close(fd)',
  'check(launcher,launcher_digest);check(config,config_digest)',
  'os.execve(python,[python,launcher,config],dict(os.environ))'
 ].join('\n');
 const shell=join(prefix,'bin/sh'),env=join(prefix,'bin/env'),bootstrapEnvironment={PATH:h.environment.PATH,HOME:h.environment.HOME,TMPDIR:h.environment.TMPDIR,LANG:h.environment.LANG};
 const serviceRun='#!'+shell+'\nexec 2>&1\numask 077\nexec '+quote(env)+' -i '+Object.entries(bootstrapEnvironment).map(([k,v])=>quote(k+'='+v)).join(' ')+' '+quote(python)+' -c '+quote(verifier)+' '+[launcherFile,launcherConfigFile,launcherDigest,launcherConfigDigest,python].map(quote).join(' ')+'\n';
 const serviceRunBytes=Buffer.from(serviceRun),serviceRunDigest=bytesDigest(serviceRunBytes);
 const runitConfig={...structuredClone(r),serviceRunDigest},runitConfigBytes=Buffer.from(canonicalJson(runitConfig)),runitConfigDigest=bytesDigest(runitConfigBytes);
 const helperConfig={...structuredClone(h),fixedFiles:{...structuredClone(h.fixedFiles),runitConfig:runitConfigDigest}},helperConfigBytes=Buffer.from(canonicalJson(helperConfig)),helperConfigDigest=bytesDigest(helperConfigBytes);
 const commissioningSealFile=join(fixed,'launcher-commissioning-seal.json'),commissioningSealBody={schemaVersion:1,kind:'tdev.release-launcher-commissioning-seal',baseInstallationSealDigest:h.installationSealDigest,installationId:h.installationId,repositoryId:h.repositoryId,bindingEpoch:h.bindingEpoch,launcherDigest,launcherConfigDigest,serviceRunDigest,runitConfigDigest,helperConfigDigest};
 const commissioningSealDigest=recordDigest('tdev.release-launcher-commissioning-seal.v1',commissioningSealBody),commissioningSeal={...commissioningSealBody,commissioningSealDigest},commissioningSealBytes=Buffer.from(canonicalJson(commissioningSeal)),commissioningSealFileDigest=bytesDigest(commissioningSealBytes);
 const planDigest=recordDigest('tdev.release-launcher-commissioning.v1',{installationId:h.installationId,repositoryId:h.repositoryId,bindingEpoch:h.bindingEpoch,baseInstallationSealDigest:h.installationSealDigest,pointerFile:h.paths.pointerFile,serviceDirectory:r.serviceDirectory,launcherFile,launcherDigest,launcherConfigFile,launcherConfigDigest,serviceRunDigest,runitConfigDigest,helperConfigDigest,commissioningSealFile,commissioningSealDigest,commissioningSealFileDigest,nodeExecutable:input.nodeExecutable,nodeDigest:input.nodeDigest});
 return Object.freeze({planDigest,launcherFile,launcherBytes:Buffer.from(input.launcherBytes),launcherDigest,launcherConfigFile,launcherConfig,launcherConfigBytes,launcherConfigDigest,serviceRun,serviceRunBytes,serviceRunDigest,runitConfig,runitConfigBytes,runitConfigDigest,helperConfig,helperConfigBytes,helperConfigDigest,commissioningSealFile,commissioningSeal,commissioningSealBytes,commissioningSealDigest,commissioningSealFileDigest});
}
