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
 reason:'hard_cutover_target_version_fenced',
 sentinelMessage:'tdev.c2-2 hard-cutover predecessor sentinel 5c8b62c72661e66d3c5a29f5e382899ee0333bef4c0ad90b2910c169eddf51f0'
});

export const HARD_CUTOVER_RESIDUE=Object.freeze({
 historicalBlockedActions:[
  {actionId:'06df336eb824813d7f4e96bcac33b8a4',attemptId:'089f0016a19f5d2b10cf29e9888a19f2',activationId:'e608e6e9be0994ee00ef299d733007367cc2dd794a7963b00449ce8a41a3e8ee',intentDigest:'sha256:f80a6966124b359269f55f1b68a460884cb4f30741fd5c19ab129c1d01ccbd70'},
  {actionId:'8d383ec0f75fc1384c605794ef11b832',attemptId:'89d1fb0434e5334a031269f17f888273',activationId:'0e0298651de9347bddad236ffdaeda128f19d0675d387d42e13def27dc8b5705',intentDigest:'sha256:8e6cb99bdecc7826dac9f7f656852371648fdbf03c785dd54af3ab66ba9f41a1'}
 ],
 historicalDispatch:{assignmentId:'8ef2b4fcc6ef24a7600e84982d8ee94b130ded759c638b23b891380c05fb7d30',actionId:'4ca8ecd1bc43cf17120a61b7b0ad2364',attemptId:'15aeb2285c8156c1f95b5e386b35a3d0',sessionId:'68b0dd097524969c45fca2074c024acc',runId:'35415636223',ref:'refs/heads/dev2-exec/68b0dd097524969c45fca2074c024acc',launchCommit:'4429139cded44451efbce1f45d7bf90b71d59d66',profileDigest:'sha256:228c3c1d07555d6b41b2200c5c2c9475d1566fdbeb0f74f496784a28e4dfdf71'},
 heldDesign:{workId:'55c9e0cf4c4f21ee5a5a5d617327b485',actionId:'c43d81ac525e42aa96bc36e02a5c8e99',resultId:'9d6c9ebec186a89ed1dce11893f97df7',attemptId:'715653343cab9923b62fe1482393e00f',baseCommitOid:'sha1:c023c66f813e86e1917f93174d0e2d514373ef3f',baseTreeOid:'sha1:4705cea77d72596881d2eb8f18e63609a60f4ac5',candidateTreeOid:'sha1:51352f83b0f8140ce6b0566bd7fa2568594c988e',candidateDigest:'sha256:00c613b4fb641a18fff8fa078aea1adcf3f7772f7f6b3d4a7c529a25489510c5',commitOid:'sha1:6bdac7afc4c8cd7ef347b2c59cfa6bd084002a7e',dispatchId:'bb8a5ec3d80edd2e3c690a01072203a52b40f1bdc2320913f9fd3034383ec0a4',sessionId:'8c26376896992ff539ef914d66a2e60a',runId:'35416307183',ref:'refs/heads/dev2-exec/8c26376896992ff539ef914d66a2e60a',launchCommit:'4429139cded44451efbce1f45d7bf90b71d59d66'}
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
 validateHardCutoverLegacyProviderShape(version,'Abandoned target');
 return version;
}
/** @param {any} version @param {string} label */
function validateHardCutoverLegacyProviderShape(version,label){
 const bindings=/** @type {any[]} */(version.resources?.bindings);
 requireThat(Array.isArray(bindings),'INTEGRITY_FAILURE',label+' bindings unavailable');
 const names=bindings.map(v=>object(v).name).sort();
 requireThat(names.join(',')==='DEV2_CONFIG_JSON,DEV2_DEVICE_SECRET,DEV2_ROUTER,DEV2_VERSION','INTEGRITY_FAILURE',label+' no longer has exact legacy bindings');
 const router=bindings.find(v=>object(v).name==='DEV2_ROUTER');
 requireThat(router?.type==='durable_object_namespace'&&router.class_name==='Dev2RendezvousDO','INTEGRITY_FAILURE',label+' router identity changed');
 return version;
}
/** @param {unknown} value */
export function validateHardCutoverPredecessorVersion(value){
 const version=object(value,'Predecessor version');
 requireThat(version.id===HARD_CUTOVER.previousVersion,'INTEGRITY_FAILURE','Predecessor version identity changed');
 validateHardCutoverLegacyProviderShape(version,'Predecessor version');
 const runtime=object(version.resources?.script_runtime,'Predecessor runtime');
 requireThat(runtime.compatibility_date==='2026-08-15'&&canonicalJson(runtime.compatibility_flags)===canonicalJson(['nodejs_compat']),'INTEGRITY_FAILURE','Predecessor compatibility settings changed');
 requireThat(canonicalJson(runtime.exports)===canonicalJson({Dev2RendezvousDO:{type:'durable-object',storage:'sqlite'}}),'INTEGRITY_FAILURE','Predecessor export identity changed');
 const script=object(version.resources?.script,'Predecessor script');
 requireThat(typeof script.etag==='string'&&/^[0-9a-f]{64}$/.test(script.etag),'INTEGRITY_FAILURE','Predecessor script etag unavailable');
 return version;
}
/** @param {unknown} value @param {boolean} targetPresent */
export function classifyHardCutoverVersionList(value,targetPresent){
 const versions=Array.isArray(value)?value:[];requireThat(versions.length>=2&&versions.length<=100,'EXECUTION_UNAVAILABLE','Bounded Worker version list required');
 const previous=versions.find(v=>object(v).id===HARD_CUTOVER.previousVersion);requireThat(previous,'INTEGRITY_FAILURE','Predecessor version disappeared');
 const sentinels=versions.filter(v=>object(v).annotations?.['workers/message']===HARD_CUTOVER.sentinelMessage);
 requireThat(sentinels.length<=1,'EFFECT_UNCERTAIN','Multiple hard-cutover sentinels exist');
 const latest=object(versions[0],'Latest Worker version');
 if(sentinels.length){
  const sentinel=object(sentinels[0],'Hard-cutover sentinel');
  requireThat(latest.id===sentinel.id&&sentinel.id!==HARD_CUTOVER.targetVersion&&sentinel.id!==HARD_CUTOVER.previousVersion&&typeof sentinel.id==='string'&&/^[0-9a-f-]{36}$/.test(sentinel.id),'EFFECT_UNCERTAIN','Hard-cutover sentinel is not the exact latest version');
  return {state:'sentinel-latest',latestId:String(latest.id),sentinelId:String(sentinel.id)};
 }
 requireThat(targetPresent&&latest.id===HARD_CUTOVER.targetVersion,'EFFECT_UNCERTAIN','Unexpected latest Worker version');
 return {state:'target-latest',latestId:HARD_CUTOVER.targetVersion,sentinelId:null};
}
/** @param {unknown} value */
export function validateHardCutoverExportsReconciliation(value){
 const reconciliation=object(value,'Sentinel exports reconciliation');
 for(const key of ['created','deleted','updated','renamed','transferred','transfer_pending']){
  const values=/** @type {any} */(reconciliation)[key];requireThat(Array.isArray(values)&&values.length===0,'INTEGRITY_FAILURE','Sentinel changed Durable Object exports');
 }
 for(const key of ['warnings','info']){
  const values=/** @type {any} */(reconciliation)[key];requireThat(Array.isArray(values)&&values.length===0,'INTEGRITY_FAILURE','Sentinel export reconciliation was not a no-op');
 }
 return reconciliation;
}
/** @param {unknown} value @param {any} predecessor @param {{expectedScriptEtags?:string[]}} [options] */
export function validateHardCutoverSentinelVersion(value,predecessor,options={}){
 const version=object(value,'Sentinel version');validateHardCutoverPredecessorVersion(predecessor);
 requireThat(typeof version.id==='string'&&/^[0-9a-f-]{36}$/.test(version.id)&&version.id!==HARD_CUTOVER.targetVersion&&version.id!==HARD_CUTOVER.previousVersion,'INTEGRITY_FAILURE','Sentinel version identity invalid');
 validateHardCutoverLegacyProviderShape(version,'Sentinel version');
 const runtime=object(version.resources?.script_runtime,'Sentinel runtime'),oldRuntime=object(predecessor.resources?.script_runtime,'Predecessor runtime');
 requireThat(runtime.compatibility_date===oldRuntime.compatibility_date&&canonicalJson(runtime.compatibility_flags)===canonicalJson(oldRuntime.compatibility_flags)&&canonicalJson(runtime.exports)===canonicalJson(oldRuntime.exports),'INTEGRITY_FAILURE','Sentinel runtime differs from predecessor');
 const script=object(version.resources?.script,'Sentinel script'),oldScript=object(predecessor.resources?.script,'Predecessor script');
 const expectedScriptEtags=Array.isArray(options.expectedScriptEtags)?options.expectedScriptEtags:[oldScript.etag];
 requireThat(expectedScriptEtags.length===0||expectedScriptEtags.includes(script.etag),'INTEGRITY_FAILURE','Sentinel code differs from the fenced predecessor/target');
 return version;
}
/** @param {any} predecessor */
export function hardCutoverSentinelMetadata(predecessor){
 validateHardCutoverPredecessorVersion(predecessor);
 const runtime=object(predecessor.resources.script_runtime);
 return {
  main_module:'worker.mjs',
  compatibility_date:runtime.compatibility_date,
  compatibility_flags:structuredClone(runtime.compatibility_flags),
  exports:structuredClone(runtime.exports),
  // Cloudflare's version-only upload API accepts only the literal `latest`
  // selector for inherited bindings.  The caller proves immediately before
  // upload that the latest version is the exact abandoned target and that
  // the active deployment remains previous-only; the returned sentinel is
  // then checked for the exact retained legacy binding family.
  bindings:['DEV2_CONFIG_JSON','DEV2_DEVICE_SECRET','DEV2_ROUTER','DEV2_VERSION'].map(name=>({name,type:'inherit',version_id:'latest'})),
  annotations:{'workers/message':HARD_CUTOVER.sentinelMessage}
 };
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

/** @param {any} value @param {number} active @param {{activationId:string,intentDigest:string}} expected */
export function validateHardCutoverHistoricalActivation(value,active,expected){
 const record=object(value,'Historical activation');
 requireThat(active===0&&record.intentDigest===expected.intentDigest&&record.intent?.activationId===expected.activationId,'INTEGRITY_FAILURE','Historical activation identity changed');
 requireThat(record.phase==='active'&&record.direction==='forward'&&record.pending===null&&record.reason===null,'INTEGRITY_FAILURE','Historical activation terminal shape changed');
 requireThat(Array.isArray(record.receipts)&&record.receipts.length===6&&record.receipts.every(receipt=>object(receipt).kind==='applied'),'INTEGRITY_FAILURE','Historical activation receipts changed');
 return record;
}
/** @param {any[]} records */
export function validateHardCutoverProviderEffects(records){
 requireThat(Array.isArray(records)&&records.length>0,'INTEGRITY_FAILURE','Provider effect history missing');
 let target=0;
 for(const value of records){
  const effect=object(value,'Provider effect');
  if(effect.effectId===HARD_CUTOVER.effectId){
   target++;
   requireThat(effect.inputDigest===HARD_CUTOVER.inputDigest&&effect.operation==='deployment.activate'&&effect.state==='sent'&&effect.response===null,'INTEGRITY_FAILURE','Retained target provider effect changed');
  }else requireThat(effect.state==='confirmed'&&effect.response!==null&&['version.upload','deployment.activate'].includes(effect.operation),'EFFECT_UNCERTAIN','Foreign provider effect is not terminal');
 }
 requireThat(target===1,'INTEGRITY_FAILURE','Retained target provider effect cardinality changed');
 return records.length;
}
/** @param {DatabaseSync} db @param {{actionId:string,attemptId:string}} expected */
function historicalBlockedAction(db,expected){
 const row=db.prepare('SELECT record FROM action WHERE action_id=?').get(expected.actionId);requireThat(row,'INTEGRITY_FAILURE','Historical blocked Action missing');
 const action=object(parseRecord(String(row.record),262144),'Historical blocked Action');
 requireThat(action.actionId===expected.actionId&&action.operation==='release.activate'&&action.status==='blocked'&&action.step==='recovery.required'&&action.errorCode==='EFFECT_UNCERTAIN'&&action.workId===null&&action.attempt==='1','INTEGRITY_FAILURE','Historical blocked Action changed');
 const attempts=db.prepare('SELECT attempt_id,held,record FROM attempt WHERE action_id=?').all(expected.actionId);requireThat(attempts.length===1,'INTEGRITY_FAILURE','Historical blocked Action attempt changed');
 const retained=attempts[0],attempt=object(parseRecord(String(retained.record),262144),'Historical Attempt');
 requireThat(String(retained.attempt_id)===expected.attemptId&&Number(retained.held)===0&&attempt.attemptId===expected.attemptId&&attempt.actionId===expected.actionId&&attempt.attempt==='1','INTEGRITY_FAILURE','Historical blocked Attempt changed');
 return action;
}
/** @param {DatabaseSync} db @param {{sessionId:string,runId:string,ref:string,launchCommit:string}} expected */
function exactRetirement(db,expected){
 const row=db.prepare('SELECT value FROM meta WHERE key=?').get('managed.ref-retired:'+expected.sessionId);requireThat(row,'INTEGRITY_FAILURE','Managed ref retirement missing');
 const retired=object(parseRecord(String(row.value),65536),'Managed ref retirement');
 requireThat(retired.kind==='dev2.managed-ref-retirement'&&retired.sessionId===expected.sessionId&&retired.ref===expected.ref&&retired.runId===expected.runId&&retired.runAttempt==='1'&&retired.launchCommit===expected.launchCommit,'INTEGRITY_FAILURE','Managed ref retirement changed');
 return retired;
}
/** @param {unknown} value */
export function validateHardCutoverResidueDispatchState(value){
 requireThat(value==='pending'||value==='done','INTEGRITY_FAILURE','Hard-cutover residue dispatch state changed');return value;
}
/** @param {DatabaseSync} db */
function historicalPendingDispatch(db){
 const expected=HARD_CUTOVER_RESIDUE.historicalDispatch,row=db.prepare('SELECT record FROM managed_dispatch WHERE assignment_id=?').get(expected.assignmentId);requireThat(row,'INTEGRITY_FAILURE','Historical managed dispatch missing');
 const dispatch=object(parseRecord(String(row.record),2097152),'Historical managed dispatch'),input=object(dispatch.input,'Historical managed input'),attempt=object(input.attempt,'Historical managed Attempt');validateHardCutoverResidueDispatchState(dispatch.state);
 requireThat(dispatch.assignmentId===expected.assignmentId&&dispatch.sessionId===expected.sessionId&&attempt.actionId===expected.actionId&&attempt.attemptId===expected.attemptId&&input.profileDigest===expected.profileDigest,'INTEGRITY_FAILURE','Historical managed dispatch changed');
 const actionRow=db.prepare('SELECT record FROM action WHERE action_id=?').get(expected.actionId);requireThat(actionRow,'INTEGRITY_FAILURE','Historical cancelled Action missing');const action=object(parseRecord(String(actionRow.record),262144));
 requireThat(action.status==='cancelled'&&action.step==='complete'&&action.errorCode==='EXECUTION_UNAVAILABLE','INTEGRITY_FAILURE','Historical cancelled Action changed');
 const attemptRow=db.prepare('SELECT held,record FROM attempt WHERE attempt_id=?').get(expected.attemptId);requireThat(attemptRow&&Number(attemptRow.held)===0,'INTEGRITY_FAILURE','Historical cancelled Attempt changed');
 const sessionRow=db.prepare('SELECT record FROM managed_session WHERE session_id=?').get(expected.sessionId);requireThat(sessionRow,'INTEGRITY_FAILURE','Historical managed session missing');const session=object(parseRecord(String(sessionRow.record),2097152));
 requireThat(session.state==='closed'&&session.launch==='sent'&&session.cancelRequested===true&&session.run?.runId===expected.runId&&session.run?.status==='completed'&&session.intent?.ref===expected.ref&&session.intent?.launchCommit===expected.launchCommit&&Number.isSafeInteger(session.stoppedAt),'INTEGRITY_FAILURE','Historical managed session changed');
 const assignmentRow=db.prepare('SELECT record FROM managed_assignment WHERE assignment_id=?').get(expected.assignmentId);requireThat(assignmentRow,'INTEGRITY_FAILURE','Historical managed assignment missing');const assignment=object(parseRecord(String(assignmentRow.record),2097152));
 requireThat(assignment.state==='stopped'&&assignment.result===null,'INTEGRITY_FAILURE','Historical managed assignment changed');
 exactRetirement(db,expected);return dispatch;
}
/** @param {DatabaseSync} db */
function heldDesignDispatch(db){
 const expected=HARD_CUTOVER_RESIDUE.heldDesign,row=db.prepare('SELECT record FROM managed_dispatch WHERE assignment_id=?').get(expected.dispatchId);requireThat(row,'INTEGRITY_FAILURE','Held Design dispatch missing');
 const dispatch=object(parseRecord(String(row.record),2097152),'Held Design dispatch'),input=object(dispatch.input,'Held Design input'),attempt=object(input.attempt,'Held Design managed Attempt');validateHardCutoverResidueDispatchState(dispatch.state);
 requireThat(dispatch.assignmentId===expected.dispatchId&&dispatch.sessionId===expected.sessionId&&attempt.actionId===expected.actionId&&attempt.attemptId===expected.attemptId,'INTEGRITY_FAILURE','Held Design dispatch changed');
 requireThat(!db.prepare('SELECT 1 FROM managed_assignment WHERE assignment_id=?').get(expected.dispatchId),'INTEGRITY_FAILURE','Held Design unexpectedly acquired an assignment');
 const sessionRow=db.prepare('SELECT record FROM managed_session WHERE session_id=?').get(expected.sessionId);requireThat(sessionRow,'INTEGRITY_FAILURE','Held Design session missing');const session=object(parseRecord(String(sessionRow.record),2097152));
 requireThat(session.state==='closed'&&session.launch==='sent'&&session.run?.runId===expected.runId&&session.run?.status==='completed'&&session.intent?.ref===expected.ref&&session.intent?.launchCommit===expected.launchCommit&&Number.isSafeInteger(session.stoppedAt),'INTEGRITY_FAILURE','Held Design session changed');
 exactRetirement(db,expected);return dispatch;
}
/** @param {unknown} value @param {typeof HARD_CUTOVER_RESIDUE.heldDesign} [expected] */
export function validateHardCutoverHeldPreparedResult(value,expected=HARD_CUTOVER_RESIDUE.heldDesign){
 const prepared=object(value,'Held Design prepared result');
 requireThat(prepared.resultId===expected.resultId&&prepared.workId===expected.workId&&prepared.expectedHead===expected.baseCommitOid&&prepared.generation==='0'&&prepared.candidateTreeOid===expected.candidateTreeOid&&prepared.resultTreeOid===expected.candidateTreeOid&&prepared.resultTreeSha256===expected.candidateDigest&&prepared.commitOid===expected.commitOid&&!Object.hasOwn(prepared,'validation')&&!Object.hasOwn(prepared,'integration'),'INTEGRITY_FAILURE','Held Design prepared result changed');
 return prepared;
}
/** @param {any[]} dispatches */
export function hardCutoverPendingResidueIds(dispatches){
 requireThat(Array.isArray(dispatches)&&dispatches.length===2,'INTEGRITY_FAILURE','Exact hard-cutover residue dispatch set changed');
 return dispatches.filter(dispatch=>validateHardCutoverResidueDispatchState(object(dispatch,'Hard-cutover residue dispatch').state)==='pending').map(dispatch=>String(dispatch.assignmentId)).sort();
}
/** @param {DatabaseSync} db @param {any} binding @param {'held'|'terminal'} mode */
function heldDesignState(db,binding,mode){
 const expected=HARD_CUTOVER_RESIDUE.heldDesign,bindingRow=db.prepare('SELECT record FROM binding WHERE singleton=1').get();requireThat(bindingRow&&canonicalJson(parseRecord(String(bindingRow.record),262144))===canonicalJson(binding),'FORBIDDEN','Old work binding changed');
 const workRow=db.prepare('SELECT record FROM work WHERE work_id=?').get(expected.workId);requireThat(workRow,'INTEGRITY_FAILURE','Held Design Work missing');const work=object(parseRecord(String(workRow.record),262144),'Held Design Work');
 requireThat(work.workId===expected.workId&&work.baseCommitOid===expected.baseCommitOid&&work.baseTreeOid===expected.baseTreeOid&&work.bindingEpoch==='1'&&work.generation==='0'&&work.disposition==='open'&&work.candidate?.treeOid===expected.candidateTreeOid&&work.candidate?.manifestDigest===expected.candidateDigest,'INTEGRITY_FAILURE','Held Design Work changed');
 requireThat(mode==='held'?work.currentActionId===expected.actionId&&work.revision==='1':work.currentActionId===null&&work.revision==='2','INTEGRITY_FAILURE','Held Design Work fence changed');
 const actionRow=db.prepare('SELECT record FROM action WHERE action_id=?').get(expected.actionId);requireThat(actionRow,'INTEGRITY_FAILURE','Held Design Action missing');const action=object(parseRecord(String(actionRow.record),262144),'Held Design Action');
 requireThat(action.operation==='validate'&&action.workId===expected.workId&&action.resultId===expected.resultId&&action.attempt==='1','INTEGRITY_FAILURE','Held Design Action identity changed');
 requireThat(mode==='held'?action.status==='blocked'&&action.step==='recovery.required'&&action.errorCode==='EFFECT_UNCERTAIN':action.status==='cancelled'&&action.step==='complete.recovered'&&action.errorCode===null,'INTEGRITY_FAILURE','Held Design Action state changed');
 const attemptRow=db.prepare('SELECT observer_epoch,held,record FROM attempt WHERE attempt_id=? AND action_id=?').get(expected.attemptId,expected.actionId);requireThat(attemptRow,'INTEGRITY_FAILURE','Held Design Attempt missing');const attempt=object(parseRecord(String(attemptRow.record),262144),'Held Design Attempt');
 requireThat(attempt.attemptId===expected.attemptId&&attempt.actionId===expected.actionId&&attempt.workId===expected.workId&&attempt.attempt==='1'&&String(attemptRow.observer_epoch)===String(action.ownerEpoch)&&Number(attemptRow.held)===(mode==='held'?1:0),'INTEGRITY_FAILURE','Held Design Attempt changed');
 const preparedRow=db.prepare('SELECT record FROM prepared WHERE result_id=?').get(expected.resultId);requireThat(preparedRow,'INTEGRITY_FAILURE','Held Design prepared result missing');validateHardCutoverHeldPreparedResult(parseRecord(String(preparedRow.record),2097152),expected);
 requireThat(Number(db.prepare('SELECT count(*) n FROM validation WHERE result_id=?').get(expected.resultId)?.n)===0&&!db.prepare('SELECT 1 FROM effect WHERE action_id=?').get(expected.actionId),'INTEGRITY_FAILURE','Held Design acquired forbidden result/effect evidence');
 const dispatch=heldDesignDispatch(db);return {work,action,attempt,dispatch};
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
 for(const expected of HARD_CUTOVER_RESIDUE.historicalBlockedActions){const historical=db.prepare('SELECT active,revision,record FROM activation WHERE id=?').get(expected.activationId);requireThat(historical,'INTEGRITY_FAILURE','Historical helper activation missing');const record=parseRecord(String(historical.record),262144);validateHardCutoverHistoricalActivation(record,Number(historical.active),expected);requireThat(String(historical.revision)===String(object(record).revision),'INTEGRITY_FAILURE','Historical helper activation revision changed');}
 const effects=db.prepare("SELECT value FROM meta WHERE key LIKE 'provider.effect:%' ORDER BY key").all().map(row=>parseRecord(String(row.value),262144));validateHardCutoverProviderEffects(effects);
 return {phase:classified.phase,record:classified.record};
}
/** @param {DatabaseSync} db @param {any} binding */
function workState(db,binding){
 const bindingRow=db.prepare('SELECT record FROM binding WHERE singleton=1').get();
 requireThat(bindingRow&&canonicalJson(parseRecord(String(bindingRow.record),262144))===canonicalJson(binding),'FORBIDDEN','Old work binding changed');
 requireThat(Number(db.prepare('SELECT count(*) n FROM attempt WHERE held=1').get()?.n)===0,'EXECUTION_UNAVAILABLE','Old work ledger still has a held attempt');
 requireThat(Number(db.prepare("SELECT count(*) n FROM action WHERE status IN ('queued','running')").get()?.n)===0,'EXECUTION_UNAVAILABLE','Old work ledger still has executing actions');
 const blocked=db.prepare("SELECT action_id FROM action WHERE status='blocked' ORDER BY action_id").all().map(row=>String(row.action_id));
 const allowedBlocked=[HARD_CUTOVER.actionId,...HARD_CUTOVER_RESIDUE.historicalBlockedActions.map(x=>x.actionId)].sort();requireThat(canonicalJson(blocked)===canonicalJson(allowedBlocked),'EFFECT_UNCERTAIN','Unexpected blocked Action remains');
 for(const expected of HARD_CUTOVER_RESIDUE.historicalBlockedActions)historicalBlockedAction(db,expected);
 const heldDesign=heldDesignState(db,binding,'terminal');
 const actionRow=db.prepare('SELECT record FROM action WHERE action_id=?').get(HARD_CUTOVER.actionId);
 requireThat(actionRow,'INTEGRITY_FAILURE','Blocked activation Action missing');
 const action=object(parseRecord(String(actionRow.record),262144),'Blocked Action');
 requireThat(action.actionId===HARD_CUTOVER.actionId&&action.operation==='release.activate'&&action.status==='blocked'&&action.workId===null,'INTEGRITY_FAILURE','Blocked activation Action changed');
 requireThat(Number(db.prepare("SELECT count(*) n FROM managed_session WHERE state<>'closed'").get()?.n)===0,'EXECUTION_UNAVAILABLE','Old managed session is not terminal');
 requireThat(Number(db.prepare("SELECT count(*) n FROM managed_assignment WHERE state IN ('offered','running')").get()?.n)===0,'EXECUTION_UNAVAILABLE','Old managed assignment is not terminal');
 const historicalDispatch=historicalPendingDispatch(db);
 const pending=db.prepare("SELECT assignment_id FROM managed_dispatch WHERE state='pending' ORDER BY assignment_id").all().map(row=>String(row.assignment_id));
 const allowedPending=hardCutoverPendingResidueIds([historicalDispatch,heldDesign.dispatch]);requireThat(canonicalJson(pending)===canonicalJson(allowedPending),'EXECUTION_UNAVAILABLE','Unexpected managed dispatch is pending');
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
/** @param {typeof fetch} fetcher @param {string} script @param {string} token */
async function activeWorkerModule(fetcher,script,token){
 let response;try{response=await fetcher(script+'/content/v2',{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{authorization:'Bearer '+token,'user-agent':'tdev-c2-2-hard-cutover-recovery'}});}
 catch{throw new TdevError('EXECUTION_UNAVAILABLE','Active Worker content unavailable');}
 requireThat(response.status===200,'EXECUTION_UNAVAILABLE','Active Worker content rejected');
 let form;try{form=await response.formData();}catch{throw new TdevError('EXECUTION_UNAVAILABLE','Active Worker content is not multipart');}
 const entries=[...form.entries()];requireThat(entries.length===1&&entries[0][0]==='worker.mjs'&&typeof entries[0][1]!=='string','INTEGRITY_FAILURE','Active Worker module shape changed');
 const file=/** @type {File} */(entries[0][1]),bytes=Buffer.from(await file.arrayBuffer());
 requireThat(bytes.length>0&&bytes.length<=2097152&&['application/javascript+module','text/javascript+module','application/javascript','text/javascript'].includes(file.type),'INTEGRITY_FAILURE','Active Worker module bytes invalid');
 return bytes;
}
/** @param {typeof fetch} fetcher @param {string} url @param {string} token @param {FormData} form */
async function uploadSentinelRequest(fetcher,url,token,form){
 let response;try{response=await fetcher(url,{method:'POST',body:form,redirect:'error',signal:AbortSignal.timeout(30000),headers:{authorization:'Bearer '+token,'user-agent':'tdev-c2-2-hard-cutover-recovery','accept':'application/json'}});}
 catch{throw new TdevError('EFFECT_UNCERTAIN','Sentinel upload response unavailable');}
 const reader=response.body?.getReader();requireThat(reader,'EFFECT_UNCERTAIN','Empty sentinel upload response');const parts=[];let size=0;
 try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;requireThat(size<=2097152,'LIMIT_EXCEEDED');parts.push(Buffer.from(part.value));}}finally{await reader.cancel().catch(()=>{});}
 let envelope;try{envelope=object(boundedProviderJson(Buffer.concat(parts),2097152),'Sentinel upload envelope');}catch{throw new TdevError('EFFECT_UNCERTAIN','Sentinel upload response unreadable');}
 requireThat(response.status===200&&envelope.success===true,'EFFECT_UNCERTAIN','Sentinel upload was not confirmed');
 return object(envelope.result,'Sentinel upload result');
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
 let target=null;
 if(betaTarget.status===200){
  requireThat(object(betaTarget.result).id===HARD_CUTOVER.targetVersion,'INTEGRITY_FAILURE','Beta target version changed');
  target=validateLegacyTargetVersion(scriptTarget.result);
 }
 const previousResult=await providerRequest(fetcher,'GET',script+'/versions/'+HARD_CUTOVER.previousVersion,token,[200]);
 const previous=validateHardCutoverPredecessorVersion(previousResult.result);
 const listResult=await providerRequest(fetcher,'GET',beta+'/versions?per_page=100',token,[200]);
 const versionState=classifyHardCutoverVersionList(listResult.result,betaTarget.status===200);
 let sentinel=null;
 if(versionState.sentinelId){
  const sentinelResult=await providerRequest(fetcher,'GET',script+'/versions/'+versionState.sentinelId,token,[200]);
  const expectedScriptEtags=target?[previous.resources.script.etag,target.resources.script.etag]:[];
  sentinel=validateHardCutoverSentinelVersion(sentinelResult.result,previous,{expectedScriptEtags});
 }
 return {account,token,script,beta,targetPresent:betaTarget.status===200,active,target,previous,versionState,sentinel};
}
/** @param {any} helperConfig @param {typeof fetch} [fetcher] */
async function ensurePredecessorSentinel(helperConfig,fetcher=fetch){
 let observation=await providerObservation(helperConfig,fetcher);
 if(!observation.targetPresent||observation.versionState.state==='sentinel-latest')return observation;
 requireThat(observation.versionState.state==='target-latest','EFFECT_UNCERTAIN','Target is not the exact latest version');
 const module=await activeWorkerModule(fetcher,observation.script,observation.token);
 const form=new FormData(),metadata=hardCutoverSentinelMetadata(observation.previous);
 form.append('metadata',canonicalJson(metadata));
 form.append('worker.mjs',new Blob([module],{type:'application/javascript+module'}),'worker.mjs');
 let uploaded=null;
 try{
  uploaded=await uploadSentinelRequest(fetcher,observation.script+'/versions?bindings_inherit=strict',observation.token,form);
  const sentinel=validateHardCutoverSentinelVersion(uploaded,observation.previous);
  validateHardCutoverExportsReconciliation(uploaded.exports_reconciliation);
  requireThat(sentinel.id===uploaded.id,'INTEGRITY_FAILURE');
 }catch(error){
  if(!(error instanceof TdevError)||error.code!=='EFFECT_UNCERTAIN')throw error;
 }
 observation=await providerObservation(helperConfig,fetcher);
 requireThat(observation.targetPresent&&observation.versionState.state==='sentinel-latest'&&observation.sentinel,'EFFECT_UNCERTAIN','Predecessor sentinel upload remains unconfirmed');
 if(uploaded)requireThat(observation.sentinel.id===uploaded.id,'EFFECT_UNCERTAIN','Sentinel upload readback changed');
 return observation;
}
/** @param {any} helperConfig @param {typeof fetch} [fetcher] */
async function deleteTarget(helperConfig,fetcher=fetch){
 let observation=await ensurePredecessorSentinel(helperConfig,fetcher);
 if(observation.targetPresent){
  requireThat(observation.versionState.state==='sentinel-latest'&&observation.sentinel,'EFFECT_UNCERTAIN','Target is still latest; deletion is forbidden');
  try{await providerRequest(fetcher,'DELETE',observation.beta+'/versions/'+HARD_CUTOVER.targetVersion,observation.token,[200,204,404]);}catch(error){if(!(error instanceof TdevError)||error.code!=='EFFECT_UNCERTAIN')throw error;}
  const after=await providerRequest(fetcher,'GET',observation.beta+'/versions/'+HARD_CUTOVER.targetVersion,observation.token,[200,404]);
  requireThat(after.status===404,'EFFECT_UNCERTAIN','Target version deletion remains unconfirmed');
 }
 observation=await providerObservation(helperConfig,fetcher);
 requireThat(!observation.targetPresent&&observation.versionState.state==='sentinel-latest'&&observation.sentinel,'EFFECT_UNCERTAIN','Target version fence is incomplete');
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
 return {kind:'tdev.c2-2-hard-cutover-recovery-plan',planDigest,targetVersionState:provider.targetPresent?'present':'absent',sentinelVersionId:provider.versionState.sentinelId,latestVersionState:provider.versionState.state,activationPhase:local.helper.phase,readyProjection:local.work.ready?'present':'absent',backupDigests:local.backups};
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
/** @param {DatabaseSync} db @param {any} binding */
function terminalizeHeldDesignIn(db,binding){
 let before;
 try{before=heldDesignState(db,binding,'terminal');return {state:'already',work:before.work,action:before.action};}catch(error){if(!(error instanceof TdevError)||!['INTEGRITY_FAILURE','EXECUTION_UNAVAILABLE'].includes(error.code))throw error;}
 before=heldDesignState(db,binding,'held');
 requireThat(Number(db.prepare('SELECT count(*) n FROM attempt WHERE held=1').get()?.n)===1,'EXECUTION_UNAVAILABLE','Another held Attempt exists');
 requireThat(Number(db.prepare("SELECT count(*) n FROM action WHERE status IN ('queued','running')").get()?.n)===0,'EXECUTION_UNAVAILABLE','Another executing Action exists');
 requireThat(Number(db.prepare("SELECT count(*) n FROM managed_session WHERE state<>'closed'").get()?.n)===0,'EXECUTION_UNAVAILABLE','Another managed session is live');
 requireThat(Number(db.prepare("SELECT count(*) n FROM managed_assignment WHERE state IN ('offered','running')").get()?.n)===0,'EXECUTION_UNAVAILABLE','Another managed assignment is live');
 historicalPendingDispatch(db);heldDesignDispatch(db);
 const action=before.action,attempt=before.attempt,work=before.work,nextAction={...structuredClone(action),status:'cancelled',step:'complete.recovered',errorCode:null};
 const actionChange=db.prepare('UPDATE action SET status=?,record=? WHERE action_id=? AND status=? AND record=?').run('cancelled',canonicalJson(nextAction),HARD_CUTOVER_RESIDUE.heldDesign.actionId,'blocked',canonicalJson(action));requireThat(actionChange.changes===1,'STALE_REVISION','Held Design Action changed during cleanup');
 const actionKey='actionRevision:'+HARD_CUTOVER_RESIDUE.heldDesign.actionId,actionRevisionRow=db.prepare('SELECT value FROM meta WHERE key=?').get(actionKey),actionRevision=String(actionRevisionRow?.value??'0');revision(actionRevision);db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(actionKey,nextRevision(actionRevision));
 const attemptChange=db.prepare('UPDATE attempt SET held=0 WHERE attempt_id=? AND action_id=? AND held=1').run(HARD_CUTOVER_RESIDUE.heldDesign.attemptId,HARD_CUTOVER_RESIDUE.heldDesign.actionId);requireThat(attemptChange.changes===1,'STALE_REVISION','Held Design Attempt changed during cleanup');
 const nextWork={...structuredClone(work),currentActionId:null,revision:nextRevision(work.revision),disposition:work.disposition},workChange=db.prepare('UPDATE work SET revision=?,disposition=?,record=? WHERE work_id=? AND revision=? AND record=?').run(nextWork.revision,nextWork.disposition,canonicalJson(nextWork),HARD_CUTOVER_RESIDUE.heldDesign.workId,work.revision,canonicalJson(work));requireThat(workChange.changes===1,'STALE_REVISION','Held Design Work changed during cleanup');
 const after=heldDesignState(db,binding,'terminal');requireThat(Number(db.prepare('SELECT count(*) n FROM attempt WHERE held=1').get()?.n)===0,'INTEGRITY_FAILURE','Held Design cleanup did not release reservation');return {state:'recovered',work:after.work,action:after.action};
}
/** @param {unknown} value */
function providerNumericId(value){requireThat(typeof value==='number'&&Number.isSafeInteger(value)&&value>0,'EXECUTION_UNAVAILABLE','Invalid provider numeric identity');return String(value);}
/** Recovery-local exact pre-cutover session projection. This never enters the normal tdev runtime.
 * @param {any} value @param {any} binding */
export function validateHardCutoverStaleSession(value,binding){
 const session=object(value,'Recovery managed session'),intent=object(session.intent,'Recovery managed intent'),run=object(session.run,'Recovery managed run');
 id(intent.sessionId);revision(session.revision);revision(run.runId);
 const ref='refs/heads/dev2-exec/'+intent.sessionId,workflow=intent.repositoryFullName+'/.github/workflows/dev2-executor.yml@'+ref;
 requireThat(session.launch==='sent'&&!session.cancelRequested&&['active','closed'].includes(session.state),'INTEGRITY_FAILURE','Recovery session lifecycle changed');
 requireThat(intent.installationId===binding.installationId&&intent.repositoryId===binding.repositoryId&&intent.bindingEpoch===binding.bindingEpoch&&intent.providerRepositoryId===binding.providerRepositoryId,'INTEGRITY_FAILURE','Recovery session binding changed');
 requireThat(binding.bindingEpoch==='1'&&typeof intent.repositoryFullName==='string'&&/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(intent.repositoryFullName),'INTEGRITY_FAILURE','Recovery repository identity changed');
 requireThat(intent.ref===ref&&intent.workflowRef===workflow&&/^[0-9a-f]{40}$/.test(intent.launchCommit)&&run.runAttempt==='1'&&run.runId!=='0','INTEGRITY_FAILURE','Recovery legacy workflow identity changed');
 requireThat(run.repositoryId===intent.providerRepositoryId&&run.repositoryOwnerId===intent.repositoryOwnerId&&run.headSha===intent.launchCommit&&run.headBranch===ref.slice(11)&&run.event==='push'&&run.workflowPath==='.github/workflows/dev2-executor.yml','INTEGRITY_FAILURE','Recovery retained provider run changed');
 if(session.state==='closed')requireThat(run.status==='completed'&&Number.isSafeInteger(session.stoppedAt),'INTEGRITY_FAILURE','Closed recovery session lacks terminal evidence');
 else requireThat(['in_progress','queued'].includes(run.status),'INTEGRITY_FAILURE','Live recovery session retained unexpected provider state');
 return session;
}
/** @param {DatabaseSync} db @param {any} binding */
function staleRecoverySession(db,binding){
 requireThat(Number(db.prepare("SELECT count(*) n FROM action WHERE status IN ('queued','running')").get()?.n)===0,'EXECUTION_UNAVAILABLE','Executing Action remains during session normalization');
 requireThat(Number(db.prepare("SELECT count(*) n FROM managed_assignment WHERE state IN ('offered','running')").get()?.n)===0,'EXECUTION_UNAVAILABLE','Live managed assignment remains during session normalization');
 const held=db.prepare('SELECT attempt_id FROM attempt WHERE held=1 ORDER BY attempt_id').all().map(row=>String(row.attempt_id));
 requireThat(canonicalJson(held)===canonicalJson([HARD_CUTOVER_RESIDUE.heldDesign.attemptId]),'EXECUTION_UNAVAILABLE','Unexpected held Attempt remains during session normalization');
 const openRows=db.prepare("SELECT record FROM managed_session WHERE state<>'closed' ORDER BY session_id").all();
 requireThat(openRows.length<=1,'EXECUTION_UNAVAILABLE','More than one managed session is nonterminal');
 let session=openRows.length?validateHardCutoverStaleSession(parseRecord(String(openRows[0].record),2097152),binding):null;
 if(!session){
  const rows=db.prepare("SELECT record FROM managed_session WHERE state='closed' ORDER BY rowid DESC LIMIT 128").all();
  const missing=[];
  for(const row of rows){
   const candidate=parseRecord(String(row.record),2097152),intent=/** @type {any} */(candidate).intent;
   if(typeof intent?.ref!=='string'||!intent.ref.startsWith('refs/heads/dev2-exec/'))continue;
   const retired=db.prepare('SELECT value FROM meta WHERE key=?').get('managed.ref-retired:'+String(intent.sessionId));
   if(!retired)missing.push(candidate);
  }
  requireThat(missing.length<=1,'INTEGRITY_FAILURE','Multiple closed legacy sessions lack retirement evidence');
  if(missing.length)session=validateHardCutoverStaleSession(missing[0],binding);
 }
 if(!session)return null;
 const sessionId=session.intent.sessionId;
 requireThat(Number(db.prepare("SELECT count(*) n FROM managed_dispatch WHERE session_id=? AND state='pending'").get(sessionId)?.n)===0,'EXECUTION_UNAVAILABLE','Recovery session still has pending dispatch');
 const assignments=db.prepare('SELECT state,record FROM managed_assignment WHERE session_id=? ORDER BY assignment_id').all(sessionId);
 for(const row of assignments){
  const assignment=object(parseRecord(String(row.record),2097152),'Recovery assignment'),result=assignment.result===null?null:object(assignment.result,'Recovery assignment result');
  requireThat(String(row.state)==='complete'&&assignment.state==='complete'&&result&&result.trustedRunnerDigest===session.intent.trustedRunnerDigest,'INTEGRITY_FAILURE','Recovery session has non-complete or untrusted assignment');
  const attemptId=assignment.input?.attempt?.attemptId;
  if(typeof attemptId==='string'){const attempt=db.prepare('SELECT held FROM attempt WHERE attempt_id=?').get(attemptId);requireThat(!attempt||Number(attempt.held)===0,'EXECUTION_UNAVAILABLE','Recovery session owns a held Attempt');}
 }
 return session;
}
/** @param {string} file @param {any} binding */
function inspectStaleRecoverySession(file,binding){
 const db=openExclusive(file);try{return staleRecoverySession(db,binding);}finally{releaseDb(db);}
}
/** @param {typeof fetch} fetcher @param {'GET'|'DELETE'} method @param {string} root @param {string} suffix @param {string} token @param {number[]} allowed */
async function recoveryGitHubRequest(fetcher,method,root,suffix,token,allowed){
 const url=new URL(root+suffix,'https://api.github.com');
 requireThat(url.origin==='https://api.github.com'&&(url.pathname===root||url.pathname.startsWith(root+'/'))&&!url.username&&!url.password&&!url.hash,'FORBIDDEN','Recovery GitHub URL escaped bound repository');
 let response;try{response=await fetcher(url,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{accept:'application/vnd.github+json',authorization:'Bearer '+token,'x-github-api-version':'2026-03-10','user-agent':'tdev-c2-2-hard-cutover-recovery'}});}
 catch{throw new TdevError(method==='DELETE'?'EFFECT_UNCERTAIN':'EXECUTION_UNAVAILABLE','Recovery GitHub response unavailable');}
 requireThat(allowed.includes(response.status),method==='DELETE'?'EFFECT_UNCERTAIN':'EXECUTION_UNAVAILABLE','Recovery GitHub request rejected');
 if(response.status===204||response.status===404)return {status:response.status,data:null};
 const reader=response.body?.getReader();requireThat(reader,'EXECUTION_UNAVAILABLE','Empty recovery GitHub response');const parts=[];let size=0;
 try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;requireThat(size<=2097152,'LIMIT_EXCEEDED');parts.push(Buffer.from(part.value));}}finally{reader.releaseLock();}
 return {status:response.status,data:parts.length?boundedProviderJson(Buffer.concat(parts),2097152):null};
}
/** @param {any} session @param {string} token @param {typeof fetch} fetcher */
async function observeRecoverySession(session,token,fetcher){
 const i=session.intent,root='/repos/'+i.repositoryFullName;
 const repository=object((await recoveryGitHubRequest(fetcher,'GET',root,'',token,[200])).data,'Recovery repository');
 requireThat(providerNumericId(repository.id)===i.providerRepositoryId&&providerNumericId(object(repository.owner).id)===i.repositoryOwnerId&&repository.full_name===i.repositoryFullName&&repository.archived===false,'FORBIDDEN','Recovery repository binding changed');
 const query=new URLSearchParams({branch:i.ref.slice(11),event:'push',head_sha:i.launchCommit,per_page:'100'});
 const envelope=object((await recoveryGitHubRequest(fetcher,'GET',root,'/actions/runs?'+query,token,[200])).data,'Recovery run envelope'),runs=Array.isArray(envelope.workflow_runs)?envelope.workflow_runs:[];
 requireThat(Number.isSafeInteger(envelope.total_count)&&envelope.total_count===runs.length&&runs.length<=100,'EXECUTION_UNAVAILABLE','Recovery run observation must be complete');
 const matching=runs.filter(value=>object(value).path==='.github/workflows/dev2-executor.yml');
 requireThat(matching.length===1,'EFFECT_UNCERTAIN','Recovery session must have exactly one provider run');
 const raw=object(matching[0],'Recovery provider run'),repo=object(raw.repository),headRepo=object(raw.head_repository);
 requireThat(providerNumericId(repo.id)===i.providerRepositoryId&&providerNumericId(headRepo.id)===i.providerRepositoryId&&providerNumericId(object(repo.owner).id)===i.repositoryOwnerId,'UNAUTHORIZED','Recovery provider run repository changed');
 requireThat(providerNumericId(raw.id)===session.run.runId&&raw.run_attempt===1&&raw.head_sha===i.launchCommit&&raw.head_branch===i.ref.slice(11)&&raw.event==='push'&&raw.path==='.github/workflows/dev2-executor.yml'&&raw.status==='completed','EFFECT_UNCERTAIN','Recovery provider run is not exact terminal');
 return {root,run:{repositoryId:i.providerRepositoryId,repositoryOwnerId:i.repositoryOwnerId,runId:providerNumericId(raw.id),runAttempt:'1',headSha:i.launchCommit,headBranch:i.ref.slice(11),event:'push',workflowPath:'.github/workflows/dev2-executor.yml',status:'completed',observedAt:Date.now()}};
}
/** @param {string} file @param {any} binding @param {any} before @param {any} terminal */
function closeRecoverySession(file,binding,before,terminal){
 const db=openExclusive(file);try{
  const current=staleRecoverySession(db,binding);requireThat(current&&canonicalJson(current)===canonicalJson(before),'STALE_REVISION','Recovery session changed before terminalization');
  if(current.state!=='closed'){
   const next={...structuredClone(current),revision:nextRevision(current.revision),state:'closed',run:structuredClone(terminal),stoppedAt:terminal.observedAt};
   const changed=db.prepare('UPDATE managed_session SET state=?,record=? WHERE session_id=? AND state=? AND record=?').run('closed',canonicalJson(next),current.intent.sessionId,current.state,canonicalJson(current));
   requireThat(changed.changes===1,'STALE_REVISION','Recovery session changed during terminalization');
  }
  db.exec('COMMIT');
 }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}finally{try{db.close();}catch{}}
}
/** @param {string} file @param {any} binding @param {any} session @param {any} terminal */
function retainRecoveryRetirement(file,binding,session,terminal){
 const db=openExclusive(file);try{
  const current=staleRecoverySession(db,binding);requireThat(current&&current.state==='closed'&&current.intent.sessionId===session.intent.sessionId,'STALE_REVISION','Closed recovery session changed before retirement evidence');
  const key='managed.ref-retired:'+session.intent.sessionId,row=db.prepare('SELECT value FROM meta WHERE key=?').get(key);
  const record={schemaVersion:1,kind:'dev2.managed-ref-retirement',sessionId:session.intent.sessionId,intentDigest:session.intentDigest,ref:session.intent.ref,launchCommit:session.intent.launchCommit,runId:terminal.runId,runAttempt:terminal.runAttempt,terminalObservedAt:terminal.observedAt,retiredAt:Date.now()};
  if(row){const retained=object(parseRecord(String(row.value),65536),'Recovery retirement');requireThat(retained.kind===record.kind&&retained.sessionId===record.sessionId&&retained.intentDigest===record.intentDigest&&retained.ref===record.ref&&retained.launchCommit===record.launchCommit&&retained.runId===record.runId,'INTEGRITY_FAILURE','Recovery retirement evidence changed');}
  else db.prepare('INSERT INTO meta VALUES(?,?)').run(key,canonicalJson(record));
  db.exec('COMMIT');
 }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}finally{try{db.close();}catch{}}
}
/** @param {{helperConfigFile:string,nativeConfigFile:string,fetcher?:typeof fetch}} options */
export async function normalizeHardCutoverStaleSession(options){
 const {native}=await configurations(options.helperConfigFile,options.nativeConfigFile),file=join(resolve(native.stateDirectory),'work.sqlite');
 requireThat(typeof native.githubTokenFile==='string','EXECUTION_UNAVAILABLE','Recovery GitHub credential is not installed');await secureBytes(file,134217728);
 let session=inspectStaleRecoverySession(file,native.edge.binding);
 if(!session)return {kind:'tdev.c2-2-hard-cutover-stale-session-normalization',state:'already'};
 const token=(await secureBytes(native.githubTokenFile,8192)).toString().trim();requireThat(token.length>=20&&!/\s/.test(token),'UNAUTHORIZED','Recovery GitHub credential unavailable');
 const observed=await observeRecoverySession(session,token,options.fetcher??fetch);
 closeRecoverySession(file,native.edge.binding,session,observed.run);
 session=inspectStaleRecoverySession(file,native.edge.binding);requireThat(session&&session.state==='closed','INTEGRITY_FAILURE','Recovery session did not close');
 const suffix='/git/ref/heads/dev2-exec/'+session.intent.sessionId;
 let reference=await recoveryGitHubRequest(options.fetcher??fetch,'GET',observed.root,suffix,token,[200,404]);
 if(reference.status===200){
  const ref=object(reference.data,'Recovery execution ref'),target=object(ref.object,'Recovery execution ref target');
  requireThat(ref.ref===session.intent.ref&&target.type==='commit'&&target.sha===session.intent.launchCommit,'INTEGRITY_FAILURE','Recovery execution ref changed');
  try{await recoveryGitHubRequest(options.fetcher??fetch,'DELETE',observed.root,'/git/refs/heads/dev2-exec/'+session.intent.sessionId,token,[204]);}catch(error){if(!(error instanceof TdevError)||error.code!=='EFFECT_UNCERTAIN')throw error;}
  reference=await recoveryGitHubRequest(options.fetcher??fetch,'GET',observed.root,suffix,token,[200,404]);
 }
 requireThat(reference.status===404,'EFFECT_UNCERTAIN','Recovery execution ref retirement remains unconfirmed');
 retainRecoveryRetirement(file,native.edge.binding,session,observed.run);
 requireThat(inspectStaleRecoverySession(file,native.edge.binding)===null,'INTEGRITY_FAILURE','Recovery session normalization did not reach terminal boundary');
 return {kind:'tdev.c2-2-hard-cutover-stale-session-normalization',state:'normalized',sessionId:session.intent.sessionId,runId:observed.run.runId};
}

/** @param {{helperConfigFile:string,nativeConfigFile:string}} options */
export async function cleanupHardCutoverHeldDesign(options){
 const {native}=await configurations(options.helperConfigFile,options.nativeConfigFile),file=join(resolve(native.stateDirectory),'work.sqlite');await secureBytes(file,134217728);const db=openExclusive(file);
 try{const result=terminalizeHeldDesignIn(db,native.edge.binding);db.exec('COMMIT');return {kind:'tdev.c2-2-hard-cutover-held-design-cleanup',state:result.state,actionId:HARD_CUTOVER_RESIDUE.heldDesign.actionId,attemptId:HARD_CUTOVER_RESIDUE.heldDesign.attemptId,workId:HARD_CUTOVER_RESIDUE.heldDesign.workId};}
 catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}finally{try{db.close();}catch{}}
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
 requireThat(after.planDigest===options.expectedPlanDigest&&after.targetVersionState==='absent'&&typeof after.sentinelVersionId==='string'&&after.latestVersionState==='sentinel-latest'&&after.activationPhase==='rolled_back'&&after.readyProjection==='absent','INTEGRITY_FAILURE','Hard-cutover recovery readback failed');
 return {kind:'tdev.c2-2-hard-cutover-recovered',planDigest:after.planDigest,targetVersion:HARD_CUTOVER.targetVersion,sentinelVersionId:after.sentinelVersionId,activeVersion:HARD_CUTOVER.previousVersion,activationPhase:after.activationPhase,readyProjection:after.readyProjection};
}

/** Delete only the exact inactive predecessor sentinel after a newer tdev version is positively deployed.
 * @param {{helperConfigFile:string,fetcher?:typeof fetch}} options */
export async function cleanupHardCutoverSentinel(options){
 const helper=await readHelperConfig(resolve(options.helperConfigFile));
 requireThat(helper.schemaVersion===1&&helper.cloudflare?.workerName===HARD_CUTOVER.workerName,'FORBIDDEN','Sentinel cleanup is bound to canonical tdev Worker');
 const account=helper.cloudflare.accountId;requireThat(typeof account==='string'&&/^[a-f0-9]{32}$/.test(account),'FORBIDDEN','Cloudflare account identity changed');
 const token=(await secureBytes(helper.paths.cloudflareTokenFile,8192)).toString().trim();requireThat(token.length>=20&&!/[\r\n\0]/.test(token),'FORBIDDEN','Provider credential unavailable');
 const script='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/'+HARD_CUTOVER.workerName,beta='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/workers/'+HARD_CUTOVER.workerName,fetcher=options.fetcher??fetch;
 const list=await providerRequest(fetcher,'GET',beta+'/versions?per_page=100',token,[200]),versions=Array.isArray(list.result)?list.result:[];
 const matches=versions.filter(v=>object(v).annotations?.['workers/message']===HARD_CUTOVER.sentinelMessage);requireThat(matches.length<=1,'EFFECT_UNCERTAIN','Multiple hard-cutover sentinels exist');
 if(!matches.length)return {kind:'tdev.c2-2-hard-cutover-sentinel-cleanup',state:'already',sentinelVersionId:null};
 const sentinelId=String(object(matches[0]).id);requireThat(sentinelId!==String(object(versions[0]).id),'EXECUTION_UNAVAILABLE','Sentinel is still the latest version');
 const previous=validateHardCutoverPredecessorVersion((await providerRequest(fetcher,'GET',script+'/versions/'+HARD_CUTOVER.previousVersion,token,[200])).result);
 validateHardCutoverSentinelVersion((await providerRequest(fetcher,'GET',script+'/versions/'+sentinelId,token,[200])).result,previous,{expectedScriptEtags:[]});
 const deployments=object((await providerRequest(fetcher,'GET',script+'/deployments',token,[200])).result,'Deployment response').deployments;
 requireThat(Array.isArray(deployments)&&!deployments.some(d=>Array.isArray(object(d).versions)&&/** @type {any[]} */(d.versions).some(v=>object(v).version_id===sentinelId)),'EXECUTION_UNAVAILABLE','Sentinel is referenced by a deployment');
 try{await providerRequest(fetcher,'DELETE',beta+'/versions/'+sentinelId,token,[200,204,404]);}catch(error){if(!(error instanceof TdevError)||error.code!=='EFFECT_UNCERTAIN')throw error;}
 const after=await providerRequest(fetcher,'GET',beta+'/versions/'+sentinelId,token,[200,404]);requireThat(after.status===404,'EFFECT_UNCERTAIN','Sentinel deletion remains unconfirmed');
 return {kind:'tdev.c2-2-hard-cutover-sentinel-cleanup',state:'deleted',sentinelVersionId:sentinelId};
}
