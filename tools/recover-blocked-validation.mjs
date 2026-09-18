#!/usr/bin/env node
import {parseArgs} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {canonicalJson,parseRecord,recordDigest} from '../src/contracts/canonical.mjs';
import {id,digest} from '../src/contracts/identity.mjs';
import {requireThat} from '../src/contracts/errors.mjs';
import {readNativeConfig,createNativeInstallation} from '../src/runtime/native.mjs';

const EXACT={
 actionId:'471247fda53cd173fbfa24ee03827373',
 workId:'584b3107ec4102d4665426359acd42c0',
 generation:'1',
 candidateTreeOid:'sha1:bd9667e24fb4a2a1ffc5904edc38c366d2cb670d',
 resultId:'143a79a5b598dd498dabcd47fc6a7473'
};

/** @param {{state:string,actionId?:string|null,sessionId:string}} value */
const actionlessReady=value=>value.state==='ready'&&(value.actionId===null||value.actionId===undefined);

/** @param {Awaited<ReturnType<typeof createNativeInstallation>>} installation */
function exactFrame(installation){
 const ledger=installation.ledger;
 return ledger.transact(tx=>{
  const action=tx.getAction(EXACT.actionId),work=tx.getWork(EXACT.workId);
  requireThat(action&&work&&action.workId===EXACT.workId&&work.currentActionId===EXACT.actionId,'STALE_REVISION','Exact blocked validation is no longer current');
  requireThat(action.operation==='validate'&&action.status==='blocked'&&action.errorCode==='EFFECT_UNCERTAIN','STALE_REVISION','Exact validation is not blocked/uncertain');
  requireThat(work.generation===EXACT.generation&&work.candidate.treeOid===EXACT.candidateTreeOid,'STALE_REVISION','Exact candidate changed');
  const rows=tx.all("SELECT attempt_id FROM attempt WHERE action_id=? AND json_extract(record,'$.attempt')=?",EXACT.actionId,action.attempt);
  requireThat(rows.length===1,'INTEGRITY_FAILURE','Expected one retained validation reservation');
  const reservation=tx.retainedAttempt(String(rows[0].attempt_id));requireThat(reservation,'INTEGRITY_FAILURE');
  const result=tx.getPrepared(EXACT.resultId);requireThat(result&&action.resultId===EXACT.resultId&&result.workId===EXACT.workId&&result.generation===EXACT.generation&&result.candidateTreeOid===EXACT.candidateTreeOid,'INTEGRITY_FAILURE','Exact prepared result changed');
  requireThat(tx.getEffect(EXACT.actionId)===null,'EFFECT_UNCERTAIN','Validation unexpectedly owns an external effect');
  const receipt=tx.get('SELECT record FROM validation WHERE result_id=? ORDER BY rowid DESC LIMIT 1',EXACT.resultId);
  requireThat(!receipt,'STALE_RESULT','A completed validation receipt now exists');
  const reservations=tx.reservations();requireThat(reservations.length===1&&reservations[0].attempt.actionId===EXACT.actionId,'EFFECT_UNCERTAIN','Another reserved Action exists');
  return {action,work,reservation,result};
 });
}

/** @param {Awaited<ReturnType<typeof createNativeInstallation>>} installation */
function retainedPrincipal(installation){
 return installation.ledger.transact(tx=>{
  const action=tx.getAction(EXACT.actionId);requireThat(action,'INTEGRITY_FAILURE');
  const grants=installation.ledger.binding&&installation.managed?installation.managed.authority?null:null:null;
  const row=tx.get('SELECT value FROM meta WHERE key=?','principal:'+EXACT.actionId);
  if(row){const value=/** @type {Record<string,unknown>} */(parseRecord(String(row.value),65536));if(value.subject===action.principal)return {subject:action.principal};}
  return {subject:action.principal};
 });
}

/** @param {Awaited<ReturnType<typeof createNativeInstallation>>} installation @param {Awaited<ReturnType<typeof readNativeConfig>>} config */
function principalFor(installation,config){
 const retained=retainedPrincipal(installation);
 const grants=config.edge.grants.filter((/** @type {import('../src/security/authorization.mjs').Grant} */ grant)=>grant.subject===retained.subject&&grant.installationId===installation.ledger.binding.installationId&&grant.repositoryId===installation.ledger.binding.repositoryId&&grant.ref===installation.ledger.binding.ref&&grant.capabilities.includes('profile.run'));
 requireThat(grants.length===1,'FORBIDDEN','Retained principal lacks one exact profile.run grant');
 return {subject:retained.subject,issuer:config.edge.issuer,audience:config.edge.origin,expiresAt:Date.now()+60000,tokenCapabilities:/** @type {const} */(['profile.run'])};
}

/** @param {Awaited<ReturnType<typeof createNativeInstallation>>} installation */
function idlePlan(installation){
 requireThat(installation.managed,'EXECUTION_UNAVAILABLE','Managed execution owner unavailable');
 const views=installation.managed.views(),idle=views.filter(actionlessReady);
 requireThat(views.every(view=>actionlessReady(view)||view.state==='closed'||view.state==='stopped'),'EFFECT_UNCERTAIN','Non-idle managed session exists');
 return idle.map(view=>view.sessionId).sort();
}

/** @param {Awaited<ReturnType<typeof createNativeInstallation>>} installation @param {readonly string[]} sessionIds */
async function drainIdle(installation,sessionIds){
 requireThat(installation.managed,'EXECUTION_UNAVAILABLE');
 for(const sessionId of sessionIds){
  id(sessionId);
  const before=installation.managed.views().find(view=>view.sessionId===sessionId);
  requireThat(before&&actionlessReady(before),'EFFECT_UNCERTAIN','Idle session state changed');
  await installation.managed.provider.cancel(sessionId);
 }
 for(let i=0;i<30;i++){
  const open=installation.managed.views().filter(view=>sessionIds.includes(view.sessionId)&&view.state!=='closed'&&view.state!=='stopped');
  if(open.length===0)return;
  for(const view of open)await installation.managed.provider.refresh(view.sessionId,true);
  await delay(1000);
 }
 throw Object.assign(new Error('Managed session stop remains uncertain'),{code:'EFFECT_UNCERTAIN'});
}

/** @param {Awaited<ReturnType<typeof createNativeInstallation>>} installation @param {Awaited<ReturnType<typeof readNativeConfig>>} config @param {readonly string[]} sessions */
async function buildPlan(installation,config,sessions){
 const frame=exactFrame(installation),principal=principalFor(installation,config);
 const recovery=await installation.engine.recovery.plan(principal,EXACT.actionId,frame.work.revision);
 requireThat(recovery.mode==='terminal'&&recovery.status==='cancelled','EFFECT_UNCERTAIN','Exact blocked validation is not positively terminal-cancellable');
 const stable={schemaVersion:1,kind:'tdev.blocked-validation-recovery-plan',actionId:EXACT.actionId,workId:EXACT.workId,generation:EXACT.generation,candidateTreeOid:EXACT.candidateTreeOid,resultId:EXACT.resultId,attemptId:frame.reservation.attempt.attemptId,workRevision:frame.work.revision,idleSessionIds:sessions,mode:recovery.mode,status:recovery.status};
 return {stable,planDigest:recordDigest('tdev.blocked-validation-recovery-plan.v1',stable),recovery,principal};
}

async function main(){process.umask(0o077);
 const {values}=parseArgs({options:{config:{type:'string'},mode:{type:'string'},'expected-plan-digest':{type:'string'}},strict:true,allowPositionals:false});
 const configFile=values.config,mode=values.mode,expectedPlan=values['expected-plan-digest']??null;
 requireThat(configFile&&(mode==='inspect'||mode==='apply'),'INVALID_ARGUMENT');
 requireThat((mode==='inspect'&&expectedPlan===null)||(mode==='apply'&&typeof expectedPlan==='string'),'INVALID_ARGUMENT','Apply requires exact inspected plan digest');if(expectedPlan!==null)digest(expectedPlan);
 requireThat(process.platform==='android','FORBIDDEN','Blocked-validation recovery is device-local only');
 const config=await readNativeConfig(configFile),installation=await createNativeInstallation(config,{terminalStageRecovery:true});
 try{
  exactFrame(installation);const sessions=idlePlan(installation);
  const inspected=await buildPlan(installation,config,sessions);
  if(mode==='inspect'){process.stdout.write(canonicalJson({...inspected.stable,planDigest:inspected.planDigest})+'\n');return;}
  requireThat(inspected.planDigest===expectedPlan,'STALE_REVISION','Recovery plan changed before apply');
  await drainIdle(installation,sessions);
  requireThat(installation.managed?.views().every(view=>view.state==='closed'||view.state==='stopped'),'EFFECT_UNCERTAIN','Managed sessions did not terminalize');
  const afterDrain=await buildPlan(installation,config,sessions);
  requireThat(afterDrain.planDigest===expectedPlan,'STALE_REVISION','Recovery target changed while draining sessions');
  const work=installation.ledger.transact(tx=>installation.engine.recovery.apply(tx,afterDrain.recovery,afterDrain.principal));
  requireThat(work.workId===EXACT.workId,'INTEGRITY_FAILURE');
  const final=installation.ledger.transact(tx=>({action:tx.getAction(EXACT.actionId),work:tx.getWork(EXACT.workId),reservations:tx.reservations()}));
  requireThat(final.action?.status==='cancelled'&&final.work?.currentActionId===null&&!final.reservations.some(r=>r.attempt.actionId===EXACT.actionId),'INTEGRITY_FAILURE','Blocked validation did not terminalize');
  process.stdout.write(canonicalJson({schemaVersion:1,kind:'tdev.blocked-validation-recovered',planDigest:expectedPlan,actionId:EXACT.actionId,workId:EXACT.workId,status:final.action.status,workRevision:final.work.revision})+'\n');
 }finally{await installation.close();}
}
main().catch(error=>{process.stderr.write(canonicalJson({kind:'tdev.blocked-validation-recovery-error',code:typeof error?.code==='string'?error.code:'INTEGRITY_FAILURE'})+'\n');process.exitCode=1;});
