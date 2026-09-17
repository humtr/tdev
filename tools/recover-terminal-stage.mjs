#!/usr/bin/env node
import {parseArgs} from 'node:util';
import {canonicalJson,parseRecord} from '../src/contracts/canonical.mjs';
import {digest,oid} from '../src/contracts/identity.mjs';
import {requireThat} from '../src/contracts/errors.mjs';
import {readNativeConfig,createNativeInstallation} from '../src/runtime/native.mjs';

async function main(){process.umask(0o077);
 const {values}=parseArgs({options:{config:{type:'string'},mode:{type:'string'},'expected-integrated-commit':{type:'string'},'expected-active-release':{type:'string'},'expected-plan-digest':{type:'string'}},strict:true,allowPositionals:false});
 const configFile=values.config,mode=values.mode,integratedCommit=values['expected-integrated-commit'],activeRelease=values['expected-active-release'],expectedPlan=values['expected-plan-digest']??null;
 requireThat(configFile&&integratedCommit&&activeRelease&&(mode==='inspect'||mode==='apply'),'INVALID_ARGUMENT');oid(integratedCommit);digest(activeRelease);requireThat((mode==='inspect'&&expectedPlan===null)||(mode==='apply'&&typeof expectedPlan==='string'),'INVALID_ARGUMENT','Apply requires one exact inspected plan digest');if(expectedPlan!==null)digest(expectedPlan);
 requireThat(process.platform==='android','FORBIDDEN','Terminal-stage bootstrap recovery is device-local only');const config=await readNativeConfig(configFile),installation=await createNativeInstallation(config,{terminalStageRecovery:true});
 try{requireThat(installation.release&&installation.managed?.production?.builder,'EXECUTION_UNAVAILABLE','Installed production release owner is unavailable');const binding=installation.ledger.binding;
  const subjects=installation.ledger.transact(tx=>{const found=new Set();for(const row of tx.all("SELECT value FROM meta WHERE key LIKE 'release.stage:%' ORDER BY rowid")){const stage=/** @type {{actionId?:string,sourceCommitOid?:string,expectedActiveRelease?:string,policyDigest?:string,state?:string}} */(parseRecord(String(row.value),2097152));if(stage.sourceCommitOid!==integratedCommit||stage.expectedActiveRelease!==activeRelease||stage.policyDigest!==binding.policyDigest||stage.state!=='uploading'||typeof stage.actionId!=='string')continue;const action=tx.getAction(stage.actionId);if(action&&action.operation==='release.stage'&&action.status==='failed'&&action.errorCode==='EFFECT_UNCERTAIN'&&action.workId===null)found.add(action.principal);}return [...found];});
  requireThat(subjects.length===1&&typeof subjects[0]==='string','FORBIDDEN','Terminal stages do not resolve to one retained principal');const subject=subjects[0],grants=config.edge.grants.filter(grant=>grant.subject===subject&&grant.installationId===binding.installationId&&grant.repositoryId===binding.repositoryId&&grant.ref===binding.ref&&grant.capabilities.includes('runtime.activate'));
  requireThat(grants.length===1,'FORBIDDEN','Retained principal lacks one exact installed runtime.activate grant');const principal={subject,issuer:config.edge.issuer,audience:config.edge.origin,expiresAt:Date.now()+60000,tokenCapabilities:/** @type {const} */(['runtime.activate'])};
  const result=await installation.release.recoverTerminalStage(principal,integratedCommit,activeRelease,mode==='apply'?expectedPlan:null);requireThat(result&&typeof result==='object'&&!Array.isArray(result)&&(mode==='inspect'?result.kind==='tdev.release-terminal-stage-recovery-plan':result.kind==='tdev.release-terminal-stage-recovered'),'INTEGRITY_FAILURE');process.stdout.write(canonicalJson(result)+'\n');
 }finally{await installation.close();}
}
main().catch(error=>{process.stderr.write(canonicalJson({kind:'tdev.release-terminal-stage-recovery-error',code:typeof error?.code==='string'?error.code:'INTEGRITY_FAILURE'})+'\n');process.exitCode=1;});
