#!/usr/bin/env node
import {resolve,join,dirname} from 'node:path';
import {parseArgs} from 'node:util';
import {GitRepository} from '../src/repository/git.mjs';
import {runtimeBindings} from '../src/repository/bindings.mjs';
import {managedDefinition} from '../src/execution/controller-identity.mjs';
import {readNativeConfig,privateFile} from '../src/runtime/native.mjs';
import {privateBytes,privateDirectory,immutablePrivateFile} from '../src/release/private-files.mjs';
import {parseRecord,canonicalJson} from '../src/contracts/canonical.mjs';
import {requireThat} from '../src/contracts/errors.mjs';
import {prepareCurrentControllerRecommission} from '../src/release/controller-recommissioning.mjs';

async function main(){
 process.umask(0o077);
 const a=parseArgs({options:{config:{type:'string'},'provider-run':{type:'string'},'managed-report':{type:'string'},'containment-report':{type:'string'},'production-report':{type:'string'},'output-dir':{type:'string'}},strict:true,allowPositionals:false}).values;
 requireThat(typeof a.config==='string'&&typeof a['provider-run']==='string'&&typeof a['managed-report']==='string'&&typeof a['containment-report']==='string'&&typeof a['production-report']==='string'&&typeof a['output-dir']==='string','INVALID_ARGUMENT','Missing recommission preparation input');
 const configArg=/** @type {string} */(a.config),providerRunArg=/** @type {string} */(a['provider-run']),managedReportArg=/** @type {string} */(a['managed-report']),containmentReportArg=/** @type {string} */(a['containment-report']),productionReportArg=/** @type {string} */(a['production-report']),outputArg=/** @type {string} */(a['output-dir']);
 const configFile=resolve(configArg),out=resolve(outputArg);requireThat(configFile===configArg&&out===outputArg,'FORBIDDEN','Absolute private paths required');
 const config=await readNativeConfig(configFile);requireThat(config.managedEnrollmentFile&&config.productionEnrollmentFile,'EXECUTION_UNAVAILABLE','Installed production enrollment required');
 const priorManaged=/** @type {any} */(parseRecord(await privateFile(config.managedEnrollmentFile,4194304),4194304));
 const {binding}=runtimeBindings(config.edge),state=resolve(config.stateDirectory),environment={PATH:dirname(config.gitExecutable),HOME:join(state,'home'),TMPDIR:join(state,'tmp'),LANG:'C.UTF-8'};
 const repository=new GitRepository({directory:join(state,'repository.git'),executable:config.gitExecutable,environment,bindings:()=>[binding],verifyRemote:async()=>{}});
 await repository.init();const approved=await repository.readCommit(binding,config.runtime.sourceCommitOid);requireThat(approved.source.treeOid===config.runtime.sourceTreeOid,'INTEGRITY_FAILURE','Installed repository source differs');
 const definition=await managedDefinition(repository,approved.source),evidencePaths=[providerRunArg,managedReportArg,containmentReportArg,productionReportArg];
 const [providerRunJson,managedControllerReportJson,containmentReportJson,productionReportJson]=await Promise.all(evidencePaths.map(async p=>(await privateBytes(resolve(p),1048576)).toString()));
 await privateDirectory(out);const managedEnrollmentFile=join(out,'managed-enrollment.json'),productionEnrollmentFile=join(out,'production-enrollment.json');
 const plan=prepareCurrentControllerRecommission({config,source:approved.source,definition,priorManaged,providerRunJson,managedControllerReportJson,containmentReportJson,productionReportJson,managedEnrollmentFile,productionEnrollmentFile});
 await immutablePrivateFile(managedEnrollmentFile,plan.managedBytes);await immutablePrivateFile(join(out,'production-intent.json'),plan.intentBytes);await immutablePrivateFile(join(out,'commission-config.json'),plan.commissionConfigBytes);
 const summary={schemaVersion:1,kind:'tdev.current-controller-recommission-prepared',planDigest:plan.planDigest,installationId:binding.installationId,repositoryId:binding.repositoryId,bindingEpoch:binding.bindingEpoch,approvedCommitOid:config.runtime.sourceCommitOid,managedEnrollmentFile,managedEnrollmentSealDigest:plan.managed.sealDigest,productionIntentFile:join(out,'production-intent.json'),commissionConfigFile:join(out,'commission-config.json'),productionEnrollmentFile};
 await immutablePrivateFile(join(out,'preparation.json'),Buffer.from(canonicalJson(summary)));process.stdout.write(canonicalJson(summary)+'\n');
}
main().catch(error=>{process.stderr.write(canonicalJson({kind:'tdev.current-controller-recommission-preparation-error',code:typeof error?.code==='string'?error.code:'INTEGRITY_FAILURE'})+'\n');process.exitCode=1;});
