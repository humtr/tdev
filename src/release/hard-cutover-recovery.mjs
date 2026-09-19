import {DatabaseSync} from 'node:sqlite';
import {readFile,lstat,realpath,mkdir,open} from 'node:fs/promises';
import {dirname,join,resolve,isAbsolute} from 'node:path';
import {canonicalJson,parseRecord,recordDigest,bytesDigest} from '../contracts/canonical.mjs';
import {digest,id,nextRevision,revision} from '../contracts/identity.mjs';
import {requireThat,TdevError} from '../contracts/errors.mjs';
import {boundedProviderJson} from '../execution/provider-json.mjs';
import {readHelperConfig} from './helper-runtime.mjs';
import {readNativeConfig} from '../runtime/native.mjs';

export const HARD_CUTOVER = Object.freeze({
 activationId:'210bb9a9e9ee8f578a6dc041058475a4181fe4da15a76a883278024c79b8b9f0',
 actionId:'d43f5fa19a1a064f2a127b64310fd339',
 intentDigest:'sha256:5675986d6fa58ffce2c06f94603cec2ab0ee190b95900dacc6a174e06bac4f1f',
 effectId:'5c8b62c72661e66d3c5a29f5e382899ee0333bef4c0ad90b2910c169eddf51f0',
 inputDigest:'sha256:480eafd7f038765a774de514e8582f4f2ceaf11f9a66451150c9bf74b684455e',
 previousVersion:'7dffeadd-6d27-429a-bca5-838fbe38fc62',
 targetVersion:'643ca63f-4e73-4c08-bc88-fdc565a1ad98',
 activeDeployment:'c8e326bb-ce39-406c-8532-f7a7b789d4f8',
 releaseId:'sha256:4dc5c8ef407af6dd20f78058592b58fcd2fe85db2fbe3c2f745b6815fa040e22',
 workerName:'tdev',
 reason:'hard_cutover_target_version_fenced'
});

/** @param {any} value @param {string} [message] @returns {Record<string,any>} */
function object(value,message='Expected object'){
 requireThat(value!==null&&typeof value==='object'&&!Array.isArray(value),'INTEGRITY_FAILURE',message);
 return value;
}
/** @param {any} record @returns {{record:Record<string,any>,intent:Record<string,any>}} */
function exactPairIntent(record){
 const x=object(record,'Activation record');
 const intent=object(x.intent,'Activation intent');
 requireThat(intent.identityNamespace==='tdev'&&intent.activationId===HARD_CUTOVER.activationId&&intent.actionId===HARD_CUTOVER.actionId,'INTEGRITY_FAILURE','Activation identity changed');
 requireThat(x.intentDigest===HARD_CUTOVER.intentDigest,'INTEGRITY_FAILURE','Activation intent digest changed');
 requireThat(object(intent.previous).edgeVersionId===HARD_CUTOVER.previousVersion&&object(intent.target).edgeVersionId===HARD_CUTOVER.targetVersion&&object(intent.target).releaseId===HARD_CUTOVER.releaseId,'INTEGRITY_FAILURE','Activation pair changed');
 return {record:x,intent};
}
/** @param {any} value */
export function classifyHardCutoverActivation(value){
 const {record,intent}=exactPairIntent(value);
 if(record.phase==='blocked'){
  const pending=object(record.pending,'Blocked activation lost pending effect'),effect=object(pending.effect,'Pending effect');
  requireThat(record.direction==='forward'&&record.reason==='external_effect_uncertain'&&pending.state==='sent'&&pending.sends===1,'INTEGRITY_FAILURE','Blocked activation shape changed');
  requireThat(effect.identityNamespace==='tdev'&&effect.activationId===HARD_CUTOVER.activationId&&effect.effectId===HARD_CUTOVER.effectId&&effect.inputDigest===HARD_CUTOVER.inputDigest&&effect.step==='edge.activate'&&effect.direction==='forward','INTEGRITY_FAILURE','Pending activation effect changed');
  requireThat(object(effect.expected).edgeVersionId===HARD_CUTOVER.previousVersion&&object(effect.target).edgeVersionId===HARD_CUTOVER.targetVersion,'INTEGRITY_FAILURE','Pending activation pair changed');
  requireThat(Array.isArray(record.receipts)&&record.receipts.length===0&&record.observedPair===null,'INTEGRITY_FAILURE','Unexpected activation receipt');
  return {phase:'blocked',record,intent};
 }
 requireThat(record.phase==='rolled_back'&&record.direction==='rollback'&&record.pending===null&&record.reason===HARD_CUTOVER.reason,'INTEGRITY_FAILURE','Unexpected activation terminal state');
 requireThat(canonicalJson(record.observedPair)===canonicalJson(intent.previous),'INTEGRITY_FAILURE','Rolled-back pair changed');
 return {phase:'rolled_back',record,intent};
}

/** @param {any[]} value */
export function validateHardCutoverDeployments(value){
 const deployments=Array.isArray(value)?value:[];
 requireThat(deployments.length>0&&deployments.length<=100,'EXECUTION_UNAVAILABLE','Bounded deployment list required');
 const active=object(deployments[0],'Active deployment');
 requireThat(active.id===HARD_CUTOVER.activeDeployment&&active.strategy==='percentage'&&Array.isArray(active.versions)&&active.versions.length===1&&active.versions[0].version_id===HARD_CUTOVER.previousVersion&&active.versions[0].percentage===100,'EFFECT_UNCERTAIN','Previous-only active deployment changed');
 const marker='tdev.activate '+HARD_CUTOVER.effectId+' '+HARD_CUTOVER.inputDigest;
 requireThat(!deployments.some(d=>object(d).annotations?.['workers/message']===marker),'EFFECT_UNCERTAIN','Exact pending activation marker now exists');
 requireThat(!deployments.some(d=>Array.isArray(object(d).versions)&&/** @type {any[]} */(d.versions).some(v=>object(v).version_id===HARD_CUTOVER.targetVersion)),'EFFECT_UNCERTAIN','Target version is referenced by a deployment');
 return {deploymentId:active.id,versionId:HARD_CUTOVER.previousVersion};
}

/** @param {any} value */
export function validateLegacyTargetVersion(value){
 const version=object(value,'Target version');
 requireThat(version.id===HARD_CUTOVER.targetVersion,'INTEGRITY_FAILURE','Target version identity changed');
 const bindings=/** @type {any[]} */(version.resources?.bindings);
 requireThat(Array.isArray(bindings),'INTEGRITY_FAILURE','Target version bindings unavailable');
 const names=bindings.map(v=>object(v).name).sort();
 requireThat(names.join(',')==='DEV2_CONFIG_JSON,DEV2_DEVICE_SECRET,DEV2_ROUTER,DEV2_VERSION','INTEGRITY_FAILURE','Abandoned target no longer has exact legacy bindings');
 const router=bindings.find(v=>object(v).name==='DEV2_ROUTER');
 requireThat(router?.type==='durable_object_namespace'&&router.class_name==='Dev2RendezvousDO','INTEGRITY_FAILURE','Abandoned target router identity changed');
 return version;
}

/** @param {string} filename @param {number} [maximum] */
async function secureBytes(filename,maximum=134217728){
 requireThat(isAbsolute(filename),'INVALID_ARGUMENT','Recovery file must be absolute');
 const path=resolve(filename),before=await lstat(path);
 requireThat(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&(before.mode&0o077)===0&&before.size<=maximum&&await realpath(path)===path,'FORBIDDEN','Unsafe recovery file');
 const bytes=await readFile(path),after=await lstat(path);
 requireThat(before.ino===after.ino&&before.dev===after.dev&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&bytes.length===before.size,'INTEGRITY_FAILURE','Recovery file changed while reading');
 return bytes;
}
/** @param {string} filename */
async function exists(filename){
 try{await lstat(filename);return true;}catch(error){if(error&&typeof error==='object'&&/** @type {any} */(error).code==='ENOENT')return false;throw error;}
}
/** @param {string} filename @param {Buffer} bytes */
async function exactPrivateFile(filename,bytes){
 try{
  const old=await secureBytes(filename,bytes.length+1);
  requireThat(Buffer.from(old).equals(bytes),'INTEGRITY_FAILURE','Recovery backup differs');
  return;
 }catch(error){if(!(error&&typeof error==='object'&&/** @type {any} */(error).code==='ENOENT'))throw error;}
 const handle=await open(filename,'wx',0o600);
 try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
 const directory=await open(dirname(filename),'r');
 try{await directory.sync();}finally{await directory.close();}
}
/** @param {string} filename @returns {DatabaseSync} */
function openExclusive(filename){
 const db=new DatabaseSync(filename,{allowExtension:false});
 try{db.exec('PRAGMA busy_timeout=0; PRAGMA locking_mode=EXCLUSIVE; PRAGMA foreign_keys=ON; BEGIN EXCLUSIVE');return db;}
 catch(error){try{db.close();}catch{}throw new TdevError('EXECUTION_UNAVAILABLE','Recovery database owner is still active');}
}
/** @param {DatabaseSync} db */
function releaseDb(db){
 try{db.exec('ROLLBACK');}catch{}
 try{db.close();}catch{}
}
/** @param {any} nativeConfig @param {any} helperConfig @param {DatabaseSync} workDb @param {DatabaseSync} journalDb */
async function backupLocked(nativeConfig,helperConfig,workDb,journalDb){
 const directory=join(resolve(nativeConfig.stateDirectory),'c2-2-hard-cutover-backup-'+HARD_CUTOVER.activationId.slice(0,12));
 await mkdir(directory,{recursive:true,mode:0o700});
 requireThat(await realpath(directory)===directory,'FORBIDDEN','Aliased recovery backup directory');
 const manifestFile=join(directory,'manifest.json');
 if(await exists(manifestFile)){
  const retained=/** @type {any} */(parseRecord(await secureBytes(manifestFile,65536),65536));
  requireThat(retained&&retained.schemaVersion===1&&retained.activationId===HARD_CUTOVER.activationId&&retained.kind==='tdev.c2-2-hard-cutover-backup','INTEGRITY_FAILURE','Recovery backup manifest changed');
  return retained.digests;
 }
 const work=join(resolve(nativeConfig.stateDirectory),'work.sqlite'),journal=resolve(helperConfig.paths.journalFile);
 const entries=[
  ['work.sqlite',work],['work.sqlite-wal',work+'-wal'],['work.sqlite-shm',work+'-shm'],
  ['activation.sqlite',journal],['activation.sqlite-wal',journal+'-wal'],['activation.sqlite-shm',journal+'-shm']
 ];
 /** @type {Record<string,string>} */
 const digests={};
 for(const [name,path] of entries){
  if(!(await exists(path)))continue;
  const bytes=await secureBytes(path);
  await exactPrivateFile(join(directory,name),bytes);
  digests[name]=bytesDigest(bytes);
 }
 requireThat(digests['work.sqlite']&&digests['activation.sqlite'],'INTEGRITY_FAILURE','Required recovery databases were not backed up');
 const body={schemaVersion:1,kind:'tdev.c2-2-hard-cutover-backup',activationId:HARD_CUTOVER.activationId,digests};
 await exactPrivateFile(manifestFile,Buffer.from(canonicalJson(body)+'\n'));
 void workDb;void journalDb;
 return digests;
}

/** @param {DatabaseSync} db */
function helperState(db){
 const row=db.prepare('SELECT active,revision,record FROM activation WHERE id=?').get(HARD_CUTOVER.activationId);
 requireThat(row,'INTEGRITY_FAILURE','Retained activation missing');
 const classified=classifyHardCutoverActivation(parseRecord(String(row.record),262144));
 requireThat(String(row.revision)===classified.record.revision,'INTEGRITY_FAILURE','Activation revision projection changed');
 if(classified.phase==='blocked')requireThat(Number(row.active)===1,'INTEGRITY_FAILURE','Blocked activation lost active fence');
 else requireThat(Number(row.active)===0,'INTEGRITY_FAILURE','Rolled-back activation remains active');
 const activeCount=Number(db.prepare('SELECT count(*) n FROM activation WHERE active=1').get()?.n);
 requireThat(activeCount===(classified.phase==='blocked'?1:0),'INTEGRITY_FAILURE','Another helper activation exists');
 const effectRow=db.prepare('SELECT value FROM meta WHERE key=?').get('provider.effect:'+HARD_CUTOVER.effectId);
 requireThat(effectRow,'INTEGRITY_FAILURE','Retained provider effect missing');
 const effect=object(parseRecord(String(effectRow.value),262144),'Provider effect');
 requireThat(effect.effectId===HARD_CUTOVER.effectId&&effect.inputDigest===HARD_CUTOVER.inputDigest&&effect.operation==='deployment.activate'&&effect.state==='sent'&&effect.response===null,'INTEGRITY_FAILURE','Retained provider effect changed');
 return {phase:classified.phase,record:classified.record};
}
/** @param {DatabaseSync} db @param {any} binding */
function workState(db,binding){
 const bindingRow=db.prepare('SELECT record FROM binding WHERE singleton=1').get();
 requireThat(bindingRow&&canonicalJson(parseRecord(String(bindingRow.record),262144))===canonicalJson(binding),'FORBIDDEN','Old work binding changed');
 requireThat(Number(db.prepare('SELECT count(*) n FROM attempt WHERE held=1').get()?.n)===0,'EXECUTION_UNAVAILABLE','Old work ledger still has a held attempt');
 requireThat(Number(db.prepare("SELECT count(*) n FROM action WHERE status IN ('queued','running')").get()?.n)===0,'EXECUTION_UNAVAILABLE','Old work ledger still has executing actions');
 requireThat(Number(db.prepare("SELECT count(*) n FROM action WHERE status='blocked' AND action_id<>?").get(HARD_CUTOVER.actionId)?.n)===0,'EFFECT_UNCERTAIN','Unexpected blocked Action remains');
 const actionRow=db.prepare('SELECT record FROM action WHERE action_id=?').get(HARD_CUTOVER.actionId);
 requireThat(actionRow,'INTEGRITY_FAILURE','Blocked activation Action missing');
 const action=object(parseRecord(String(actionRow.record),262144),'Blocked Action');
 requireThat(action.actionId===HARD_CUTOVER.actionId&&action.operation==='release.activate'&&action.status==='blocked'&&action.workId===null,'INTEGRITY_FAILURE','Blocked activation Action changed');
 requireThat(Number(db.prepare("SELECT count(*) n FROM managed_session WHERE state<>'closed'").get()?.n)===0,'EXECUTION_UNAVAILABLE','Old managed session is not terminal');
 requireThat(Number(db.prepare("SELECT count(*) n FROM managed_assignment WHERE state IN ('offered','running')").get()?.n)===0,'EXECUTION_UNAVAILABLE','Old managed assignment is not terminal');
 requireThat(Number(db.prepare("SELECT count(*) n FROM managed_dispatch WHERE state='pending'").get()?.n)===0,'EXECUTION_UNAVAILABLE','Old managed dispatch is pending');
 const stageRows=db.prepare("SELECT key,value FROM meta WHERE key LIKE 'release.stage:%' ORDER BY key").all();
 const matching=[];
 for(const row of stageRows){
  const stage=object(parseRecord(String(row.value),2097152),'Release stage');
  if(stage.state==='staged'&&stage.target?.releaseId===HARD_CUTOVER.releaseId&&stage.target?.edgeVersionId===HARD_CUTOVER.targetVersion&&stage.previous?.edgeVersionId===HARD_CUTOVER.previousVersion)matching.push({key:String(row.key),value:String(row.value),stage});
 }
 requireThat(matching.length===1,'INTEGRITY_FAILURE','Exact staged release history changed');
 const staged=matching[0],readyKey='release.ready:'+HARD_CUTOVER.releaseId,readyRow=db.prepare('SELECT value FROM meta WHERE key=?').get(readyKey);
 if(readyRow)requireThat(String(readyRow.value)===staged.value,'INTEGRITY_FAILURE','Ready projection differs from retained stage');
 return {ready:!!readyRow,readyKey,stageKey:staged.key,stage:staged.stage};
}
/** @param {any} nativeConfig @param {any} helperConfig */
async function localInspection(nativeConfig,helperConfig){
 const workFile=join(resolve(nativeConfig.stateDirectory),'work.sqlite'),journalFile=resolve(helperConfig.paths.journalFile);
 await Promise.all([secureBytes(workFile,134217728),secureBytes(journalFile,134217728)]);
 let workDb,journalDb;
 try{
  workDb=openExclusive(workFile);journalDb=openExclusive(journalFile);
  const backups=await backupLocked(nativeConfig,helperConfig,workDb,journalDb);
  return {backups,helper:helperState(journalDb),work:workState(workDb,nativeConfig.edge.binding)};
 }finally{if(journalDb)releaseDb(journalDb);if(workDb)releaseDb(workDb);}
}

/** @param {typeof fetch} fetcher @param {'GET'|'DELETE'} method @param {string} url @param {string} token @param {number[]} allowed */
async function providerRequest(fetcher,method,url,token,allowed){
 let response;
 try{response=await fetcher(url,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{authorization:'Bearer '+token,'user-agent':'tdev-c2-2-hard-cutover-recovery','accept':'application/json'}});}
 catch{throw new TdevError(method==='DELETE'?'EFFECT_UNCERTAIN':'EXECUTION_UNAVAILABLE','Provider response unavailable');}
 requireThat(allowed.includes(response.status),method==='DELETE'?'EFFECT_UNCERTAIN':'EXECUTION_UNAVAILABLE','Provider request rejected');
 if(response.status===404||response.status===204)return {status:response.status,result:null};
 const reader=response.body?.getReader();requireThat(reader,'EXECUTION_UNAVAILABLE','Empty provider response');const parts=[];let size=0;
 try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;requireThat(size<=2097152,'LIMIT_EXCEEDED');parts.push(Buffer.from(part.value));}}finally{await reader.cancel().catch(()=>{});}
 const envelope=object(boundedProviderJson(Buffer.concat(parts),2097152),'Provider envelope');
 requireThat(envelope.success===true,'EXECUTION_UNAVAILABLE','Unsuccessful provider envelope');
 return {status:response.status,result:envelope.result??null};
}
/** @param {any} helperConfig @param {typeof fetch} [fetcher] */
async function providerObservation(helperConfig,fetcher=fetch){
 requireThat(helperConfig.cloudflare?.workerName===HARD_CUTOVER.workerName,'FORBIDDEN','Recovery is bound to canonical tdev Worker');
 const account=helperConfig.cloudflare.accountId;requireThat(typeof account==='string'&&/^[a-f0-9]{32}$/.test(account),'FORBIDDEN','Cloudflare account identity changed');
 const token=(await secureBytes(helperConfig.paths.cloudflareTokenFile,8192)).toString().trim();requireThat(token.length>=20&&!/[\r\n\0]/.test(token),'FORBIDDEN','Provider credential unavailable');
 const script='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/'+HARD_CUTOVER.workerName;
 const beta='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/workers/'+HARD_CUTOVER.workerName;
 const deploymentsResult=await providerRequest(fetcher,'GET',script+'/deployments',token,[200]);
 const deployments=object(deploymentsResult.result,'Deployment response').deployments;
 const active=validateHardCutoverDeployments(deployments);
 const betaTarget=await providerRequest(fetcher,'GET',beta+'/versions/'+HARD_CUTOVER.targetVersion,token,[200,404]);
 const scriptTarget=await providerRequest(fetcher,'GET',script+'/versions/'+HARD_CUTOVER.targetVersion,token,[200,404]);
 requireThat((betaTarget.status===200)===(scriptTarget.status===200),'EFFECT_UNCERTAIN','Provider version surfaces disagree');
 if(betaTarget.status===200){
  requireThat(object(betaTarget.result).id===HARD_CUTOVER.targetVersion,'INTEGRITY_FAILURE','Beta target version changed');
  validateLegacyTargetVersion(scriptTarget.result);
 }
 return {account,token,script,beta,targetPresent:betaTarget.status===200,active};
}
/** @param {any} helperConfig @param {typeof fetch} [fetcher] */
async function deleteTarget(helperConfig,fetcher=fetch){
 let observation=await providerObservation(helperConfig,fetcher);
 if(observation.targetPresent){
  try{await providerRequest(fetcher,'DELETE',observation.beta+'/versions/'+HARD_CUTOVER.targetVersion,observation.token,[200,204,404]);}catch(error){if(!(error instanceof TdevError)||error.code!=='EFFECT_UNCERTAIN')throw error;}
  const after=await providerRequest(fetcher,'GET',observation.beta+'/versions/'+HARD_CUTOVER.targetVersion,observation.token,[200,404]);
  requireThat(after.status===404,'EFFECT_UNCERTAIN','Target version deletion remains unconfirmed');
 }
 observation=await providerObservation(helperConfig,fetcher);
 requireThat(!observation.targetPresent,'EFFECT_UNCERTAIN','Target version still exists');
 return observation;
}

/** @param {{installationId:string,repositoryId:string,bindingEpoch:string,workerName:string,backups:Record<string,string>}} input */
export function hardCutoverPlanDigest(input){
 id(input.installationId);id(input.repositoryId);revision(input.bindingEpoch);
 requireThat(input.workerName===HARD_CUTOVER.workerName&&input.backups&&typeof input.backups==='object','INVALID_ARGUMENT');
 for(const value of Object.values(input.backups))digest(value);
 return recordDigest('tdev.c2-2-hard-cutover-recovery-plan.v1',{
  activationId:HARD_CUTOVER.activationId,actionId:HARD_CUTOVER.actionId,intentDigest:HARD_CUTOVER.intentDigest,
  effectId:HARD_CUTOVER.effectId,inputDigest:HARD_CUTOVER.inputDigest,previousVersion:HARD_CUTOVER.previousVersion,
  targetVersion:HARD_CUTOVER.targetVersion,activeDeployment:HARD_CUTOVER.activeDeployment,releaseId:HARD_CUTOVER.releaseId,
  installationId:input.installationId,repositoryId:input.repositoryId,bindingEpoch:input.bindingEpoch,workerName:input.workerName,
  backups:input.backups
 });
}
/** @param {string} helperConfigFile @param {string} nativeConfigFile */
async function configurations(helperConfigFile,nativeConfigFile){
 const [helper,native]=await Promise.all([readHelperConfig(resolve(helperConfigFile)),readNativeConfig(resolve(nativeConfigFile))]);
 requireThat(helper.schemaVersion===1&&native.schemaVersion===1,'INTEGRITY_FAILURE');
 requireThat(helper.installationId===native.edge.installationId&&helper.repositoryId===native.edge.binding.repositoryId&&helper.bindingEpoch===native.edge.binding.bindingEpoch,'FORBIDDEN','Helper/native installation identity differs');
 requireThat(native.edge.binding.bindingEpoch==='1'&&helper.cloudflare.workerName===HARD_CUTOVER.workerName,'FORBIDDEN','Recovery is bound to pre-cutover epoch 1');
 requireThat(resolve(native.stateDirectory)!==resolve(dirname(helper.paths.journalFile))||native.edge.installationId===helper.installationId,'INTEGRITY_FAILURE');
 return {helper,native};
}

/** @param {{helperConfigFile:string,nativeConfigFile:string,fetcher?:typeof fetch}} options */
export async function inspectHardCutover(options){
 const {helper,native}=await configurations(options.helperConfigFile,options.nativeConfigFile);
 const local=await localInspection(native,helper),provider=await providerObservation(helper,options.fetcher);
 const planDigest=hardCutoverPlanDigest({installationId:helper.installationId,repositoryId:helper.repositoryId,bindingEpoch:helper.bindingEpoch,workerName:helper.cloudflare.workerName,backups:local.backups});
 return {kind:'tdev.c2-2-hard-cutover-recovery-plan',planDigest,targetVersionState:provider.targetPresent?'present':'absent',activationPhase:local.helper.phase,readyProjection:local.work.ready?'present':'absent',backupDigests:local.backups};
}
/** @param {any} helperConfig */
async function terminalizeHelper(helperConfig){
 const file=resolve(helperConfig.paths.journalFile);await secureBytes(file,134217728);const db=openExclusive(file);
 try{
  const state=helperState(db);if(state.phase==='rolled_back'){db.exec('ROLLBACK');return;}
  const old=state.record,next={...structuredClone(old),revision:nextRevision(old.revision),direction:'rollback',phase:'rolled_back',pending:null,reason:HARD_CUTOVER.reason,observedPair:structuredClone(old.intent.previous)};
  db.prepare('UPDATE activation SET revision=?,active=0,record=? WHERE id=? AND revision=? AND record=?').run(next.revision,canonicalJson(next),HARD_CUTOVER.activationId,old.revision,canonicalJson(old));
  requireThat(Number(db.prepare('SELECT changes() n').get()?.n)===1,'STALE_REVISION','Activation changed during terminalization');
  db.exec('COMMIT');
 }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}finally{try{db.close();}catch{}}
}
/** @param {any} nativeConfig */
async function removeReadyProjection(nativeConfig){
 const file=join(resolve(nativeConfig.stateDirectory),'work.sqlite');await secureBytes(file,134217728);const db=openExclusive(file);
 try{
  const state=workState(db,nativeConfig.edge.binding);
  if(state.ready){
   const row=db.prepare('SELECT value FROM meta WHERE key=?').get(state.readyKey);requireThat(row&&String(row.value)===canonicalJson(state.stage),'STALE_REVISION','Ready projection changed');
   const change=db.prepare('DELETE FROM meta WHERE key=? AND value=?').run(state.readyKey,String(row.value));
   requireThat(change.changes===1,'STALE_REVISION','Ready projection changed during deletion');
  }
  db.exec('COMMIT');
 }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}finally{try{db.close();}catch{}}
}

/** @param {{helperConfigFile:string,nativeConfigFile:string,expectedPlanDigest:string,fetcher?:typeof fetch}} options */
export async function applyHardCutover(options){
 digest(options.expectedPlanDigest);
 const {helper,native}=await configurations(options.helperConfigFile,options.nativeConfigFile);
 const before=await inspectHardCutover(options);
 requireThat(before.planDigest===options.expectedPlanDigest,'STALE_REVISION','Recovery inspection plan changed');
 await deleteTarget(helper,options.fetcher);
 await terminalizeHelper(helper);
 await removeReadyProjection(native);
 const after=await inspectHardCutover(options);
 requireThat(after.planDigest===options.expectedPlanDigest&&after.targetVersionState==='absent'&&after.activationPhase==='rolled_back'&&after.readyProjection==='absent','INTEGRITY_FAILURE','Hard-cutover recovery readback failed');
 return {kind:'tdev.c2-2-hard-cutover-recovered',planDigest:after.planDigest,targetVersion:HARD_CUTOVER.targetVersion,activeVersion:HARD_CUTOVER.previousVersion,activationPhase:after.activationPhase,readyProjection:after.readyProjection};
}
