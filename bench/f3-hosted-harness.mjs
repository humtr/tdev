import {chmod,mkdir,open,readFile,readdir,rename,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {canonicalJson,parseRecord,recordDigest} from '../src/contracts/canonical.mjs';
import {requireThat} from '../src/contracts/errors.mjs';
import {boundedCommand} from '../src/execution/command.mjs';
import {GitRepository} from '../src/repository/git.mjs';
import {Ledger} from '../src/storage/ledger.mjs';
import {DurableGitSender} from '../src/integration/sender.mjs';
import {readNativeConfig,privateFile} from '../src/runtime/native.mjs';
import {freezePublicationGroup,reconcilePublicationGroup,settlePublicationGroup} from './cost-efficient-group-recovery.mjs';

export const F3_SCOPE=Object.freeze({
 repositoryId:'github-1322208918',
 providerRepositoryId:'1322208918',
 remote:'https://github.com/humtr/tdev.git',
 canonicalRef:'refs/heads/dev-2',
 ref:'refs/heads/research/f3-20260914-a2',
 stateName:'research-f3-20260914-a2'
});

/** @param {string} value */
const rawOid=value=>{requireThat(/^(?:sha1:[0-9a-f]{40}|sha256:[0-9a-f]{64})$/.test(value),'INVALID_ARGUMENT','Exact object ID required');return value.split(':',2)[1];};
const fixedGitSettings=()=>['-c','core.hooksPath=/dev/null','-c','credential.helper=','-c','protocol.allow=never','-c','protocol.https.allow=always','-c','http.followRedirects=false','-c','http.lowSpeedLimit=1','-c','http.lowSpeedTime=30','-c','core.fsync=objects,pack-metadata,reference','-c','core.fsyncMethod=fsync'];

/** @param {import('../src/contracts/ports.js').Binding} binding */
export function researchBinding(binding){
 requireThat(binding.repositoryId===F3_SCOPE.repositoryId&&binding.providerRepositoryId===F3_SCOPE.providerRepositoryId&&binding.remote===F3_SCOPE.remote&&binding.ref===F3_SCOPE.canonicalRef&&binding.provider==='github','FORBIDDEN','F3 repository binding mismatch');
 return {...binding,ref:F3_SCOPE.ref};
}

/** @param {Record<string,any>} canonical @param {string} root @param {string} wrapper */
export function buildResearchSenderConfig(canonical,root,wrapper){
 requireThat(canonical.repositoryId===F3_SCOPE.repositoryId&&canonical.remote===F3_SCOPE.remote&&canonical.ref===F3_SCOPE.canonicalRef&&canonical.provider==='github','FORBIDDEN','Canonical sender scope mismatch');
 requireThat(typeof canonical.bindingEpoch==='string'&&typeof canonical.repositoryDirectory==='string'&&typeof canonical.gitExecutable==='string'&&canonical.environment&&typeof canonical.environment==='object','INTEGRITY_FAILURE');
 const barrier=join(root,'sender-entered.json'),release=join(root,'sender-release');
 return {schemaVersion:1,stateDirectory:join(root,'senders'),repositoryId:F3_SCOPE.repositoryId,bindingEpoch:canonical.bindingEpoch,ref:F3_SCOPE.ref,provider:'github',remote:F3_SCOPE.remote,gitExecutable:wrapper,repositoryDirectory:canonical.repositoryDirectory,environment:{...canonical.environment,DEV2_F3_REAL_GIT:canonical.gitExecutable,DEV2_F3_BARRIER:barrier,DEV2_F3_RELEASE:release},timeoutMs:120000};
}

/** @param {string} pythonExecutable */
export function wrapperSource(pythonExecutable){
 requireThat(pythonExecutable.startsWith('/'),'INVALID_ARGUMENT');
 return `#!${pythonExecutable}\nimport json,os,sys,time\nreal=os.environ['DEV2_F3_REAL_GIT']\nbarrier=os.environ['DEV2_F3_BARRIER']\nrelease=os.environ['DEV2_F3_RELEASE']\nargs=sys.argv[1:]\nif 'push' in args:\n    tmp=barrier+'.tmp-'+str(os.getpid())\n    with open(tmp,'w') as f:\n        json.dump({'pid':os.getpid(),'state':'held-before-provider-send'},f,separators=(',',':'),sort_keys=True)\n        f.flush(); os.fsync(f.fileno())\n    os.replace(tmp,barrier)\n    d=os.open(os.path.dirname(barrier),os.O_RDONLY|os.O_DIRECTORY); os.fsync(d); os.close(d)\n    deadline=time.monotonic()+90\n    while not os.path.exists(release):\n        if time.monotonic()>=deadline: sys.exit(74)\n        time.sleep(0.02)\nos.execv(real,[real,*args])\n`;
}

/** @param {{available:boolean,head?:string,expectedHead:string,commitOid:string,senderStopped:boolean,commitAncestor?:boolean,expectedAncestor?:boolean}} x */
export function classifyReadback(x){
 if(!x.available||!x.head)return {kind:'unknown',relation:null};
 if(x.head===x.commitOid||x.commitAncestor)return {kind:'integrated',relation:'commit_or_descendant'};
 if(x.head===x.expectedHead)return {kind:x.senderStopped?'retryable':'uncertain',relation:'expected_head'};
 if(x.expectedAncestor)return {kind:'stale',relation:'other_expected_descendant'};
 return {kind:'binding_fenced',relation:'foreign'};
}

/** @param {string} path */
async function syncDirectory(path){const fd=await open(path,'r');try{await fd.sync();}finally{await fd.close();}}
/** @param {string} path @param {any} value */
async function durableJson(path,value){const tmp=path+'.tmp-'+process.pid;const fd=await open(tmp,'wx',0o600);try{await fd.writeFile(canonicalJson(value));await fd.sync();}finally{await fd.close();}await rename(tmp,path);await syncDirectory(dirname(path));}
/** @param {string} path @param {number} [max] @returns {Promise<any>} */
async function readJson(path,max=1048576){return parseRecord(await readFile(path),max);}
/** @param {string} path @param {string} pythonExecutable */
async function writeWrapper(path,pythonExecutable){const fd=await open(path,'wx',0o700);try{await fd.writeFile(wrapperSource(pythonExecutable));await fd.sync();}finally{await fd.close();}await chmod(path,0o700);await syncDirectory(dirname(path));}

/** @param {Record<string,any>} senderConfig @param {string[]} args @param {number} [timeoutMs] */
async function runGit(senderConfig,args,timeoutMs=30000){
 const result=await boundedCommand(senderConfig.environment.DEV2_F3_REAL_GIT,[...fixedGitSettings(),'--git-dir='+senderConfig.repositoryDirectory,...args],{environment:senderConfig.environment,timeoutMs,maxBytes:16384});
 requireThat(!result.spawnFailed&&!result.timedOut&&!result.discardedBytes&&result.exitCode===0,'EXECUTION_UNAVAILABLE','F3 fixed Git operation failed');return result;
}
/** @param {Record<string,any>} senderConfig @param {string} head */
async function exactCreateRef(senderConfig,head){await runGit(senderConfig,['push','--porcelain','--no-verify','--force-with-lease='+F3_SCOPE.ref+':','--',F3_SCOPE.remote,rawOid(head)+':'+F3_SCOPE.ref]);}
/** @param {Record<string,any>} senderConfig @param {string} head */
async function exactDeleteRef(senderConfig,head){await runGit(senderConfig,['push','--porcelain','--no-verify','--force-with-lease='+F3_SCOPE.ref+':'+rawOid(head),'--',F3_SCOPE.remote,':'+F3_SCOPE.ref]);}

/** @param {any} group */
function effectFor(group){return {effectId:recordDigest('dev2.research-hosted-effect.v1',{publicationIdentity:group.publicationIdentity,ref:group.ref,expectedHead:group.expectedHead,commitOid:group.commitOid}).slice(7),workId:group.members[0].workId,actionId:group.leaderActionId,repositoryId:group.repositoryId,bindingEpoch:group.bindingEpoch,ref:group.ref,expectedHead:group.expectedHead,commitOid:group.commitOid,preparedResultId:group.composedResultId,validationId:group.composedValidationId,policyDigest:group.policyDigest};}

/** @param {string} configPath */
async function loadInstallation(configPath){
 const config=await readNativeConfig(configPath),binding=config.edge.binding,research=researchBinding(binding),gitSender=config.gitSender;
 requireThat(gitSender&&gitSender.configurationFile&&gitSender.pythonExecutable&&gitSender.helperFile,'EXECUTION_UNAVAILABLE','Installed durable sender is required');
 const canonical=/** @type {Record<string,any>} */(parseRecord(await privateFile(gitSender.configurationFile,65536),65536));
 return {config,binding,research,canonical,gitSender};
}

/** @param {string} path @param {import('../src/contracts/ports.js').Binding} binding @param {GitRepository} repository @returns {Promise<any>} */
async function loadFixture(path,binding,repository){
 const fixture=/** @type {Record<string,any>} */(parseRecord(await privateFile(path,1048576),1048576));
 requireThat(fixture.schemaVersion===1&&fixture.repositoryId===F3_SCOPE.repositoryId&&fixture.bindingEpoch===binding.bindingEpoch&&fixture.policyDigest===binding.policyDigest,'FORBIDDEN','Frozen F3 fixture scope mismatch');
 requireThat(typeof fixture.composedResultId==='string'&&/^sha256:[0-9a-f]{64}$/.test(fixture.composedValidationId)&&Array.isArray(fixture.members)&&fixture.members.length>1,'INVALID_ARGUMENT','Frozen F3 fixture identity');
 const commit=await repository.readCommit(binding,fixture.commitOid);requireThat(commit.parents.length===1&&commit.parents[0]===fixture.expectedHead&&commit.source.treeOid===fixture.resultTreeOid&&commit.source.manifestDigest===fixture.resultManifestDigest,'INTEGRITY_FAILURE','Frozen F3 commit/tree mismatch');
 return fixture;
}

/** @param {Record<string,any>} canonical @param {import('../src/contracts/ports.js').Binding} binding @param {import('../src/contracts/ports.js').Binding} research */
async function repositoryFor(canonical,binding,research){const repository=new GitRepository({directory:canonical.repositoryDirectory,executable:canonical.gitExecutable,environment:canonical.environment,bindings:()=>[binding,research],verifyRemote:async()=>{const response=await fetch('https://api.github.com/repos/humtr/tdev',{headers:{accept:'application/vnd.github+json','user-agent':'dev2-f3-research'},redirect:'error',signal:AbortSignal.timeout(15000)});requireThat(response.ok,'EXECUTION_UNAVAILABLE','F3 repository identity unavailable');const metadata=/** @type {{id?:number,full_name?:string,archived?:boolean}} */(await response.json());requireThat(String(metadata.id)===F3_SCOPE.providerRepositoryId&&metadata.full_name==='humtr/tdev'&&metadata.archived===false,'FORBIDDEN','F3 repository identity changed');}});await repository.init();return repository;}

/** @param {string} configPath @param {string} fixturePath */
async function childDispatch(configPath,fixturePath){
 const {config,binding,research,canonical,gitSender}=await loadInstallation(configPath),root=join(config.stateDirectory,F3_SCOPE.stateName),state=/** @type {any} */(await readJson(join(root,'experiment.json')));
 const repository=await repositoryFor(canonical,binding,research);await loadFixture(fixturePath,binding,repository);
 const senderConfig=/** @type {Record<string,any>} */(await readJson(join(root,'sender.json'))),ledger=new Ledger(join(root,'sender.sqlite'),research);
 try{const sender=new DurableGitSender({ledger,stateDirectory:senderConfig.stateDirectory,configurationPath:join(root,'sender.json'),pythonExecutable:gitSender.pythonExecutable,helperPath:gitSender.helperFile,environment:senderConfig.environment});const result=await sender.compareUpdate(state.effect);await durableJson(join(root,'controller-result.json'),{kind:result.kind,ownerEpoch:ledger.ownerEpoch,completedAt:new Date().toISOString()});}finally{ledger.close();}
}

/** @param {string} root @param {number} [timeoutMs] @returns {Promise<any>} */
async function pollHeld(root,timeoutMs=15000){const deadline=Date.now()+timeoutMs;for(;;){try{const held=await readJson(join(root,'sender-entered.json'),65536);if(held.state==='held-before-provider-send')return held;}catch{}if(Date.now()>deadline)throw new Error('F3 sender did not enter held provider window');await delay(20);}}
/** @param {string} root */
async function senderInvocation(root){const entries=await readdir(join(root,'senders'),{withFileTypes:true});const dirs=entries.filter(e=>e.isDirectory()).map(e=>e.name);requireThat(dirs.length===1,'INTEGRITY_FAILURE','Exactly one physical sender invocation required');return dirs[0];}

/** @param {string} configPath @param {string} fixturePath @param {string} label */
async function inspectRecovery(configPath,fixturePath,label){
 const {config,binding,research,canonical,gitSender}=await loadInstallation(configPath),root=join(config.stateDirectory,F3_SCOPE.stateName),state=/** @type {any} */(await readJson(join(root,'experiment.json')));
 const repository=await repositoryFor(canonical,binding,research);await loadFixture(fixturePath,binding,repository);const senderConfig=/** @type {Record<string,any>} */(await readJson(join(root,'sender.json'))),ledger=new Ledger(join(root,'sender.sqlite'),research);
 try{const sender=new DurableGitSender({ledger,stateDirectory:senderConfig.stateDirectory,configurationPath:join(root,'sender.json'),pythonExecutable:gitSender.pythonExecutable,helperPath:gitSender.helperFile,environment:senderConfig.environment});const before=sender.current(state.effect),stopped=await sender.stopped(state.effect),retry=await sender.compareUpdate(state.effect),after=sender.current(state.effect);requireThat(canonicalJson(before)===canonicalJson(after),'INTEGRITY_FAILURE','Unknown old sender created a replacement invocation');return {label,ownerEpoch:ledger.ownerEpoch,stopped,retry:retry.kind,invocation:after};}finally{ledger.close();}
}

/** @param {GitRepository} repository @param {import('../src/contracts/ports.js').Binding} research @param {any} effect @param {boolean} senderStopped */
async function authoritativeOutcome(repository,research,effect,senderStopped){
 try{const observed=await repository.resolve(research);await repository.fetch(research,observed.head);const commitAncestor=observed.head===effect.commitOid?true:await repository.isAncestor(research,effect.commitOid,observed.head),expectedAncestor=observed.head===effect.expectedHead?true:await repository.isAncestor(research,effect.expectedHead,observed.head);return {observed,...classifyReadback({available:true,head:observed.head,expectedHead:effect.expectedHead,commitOid:effect.commitOid,senderStopped,commitAncestor,expectedAncestor})};}catch{return {observed:null,...classifyReadback({available:false,expectedHead:effect.expectedHead,commitOid:effect.commitOid,senderStopped})};}
}

/** @param {string} configPath @param {string} fixturePath @param {number} [timeoutMs] */
async function waitStopped(configPath,fixturePath,timeoutMs=60000){const deadline=Date.now()+timeoutMs;for(;;){const {config,research,gitSender}=await loadInstallation(configPath),root=join(config.stateDirectory,F3_SCOPE.stateName),state=/** @type {any} */(await readJson(join(root,'experiment.json'))),senderConfig=/** @type {Record<string,any>} */(await readJson(join(root,'sender.json'))),ledger=new Ledger(join(root,'sender.sqlite'),research);try{const sender=new DurableGitSender({ledger,stateDirectory:senderConfig.stateDirectory,configurationPath:join(root,'sender.json'),pythonExecutable:gitSender.pythonExecutable,helperPath:gitSender.helperFile,environment:senderConfig.environment});if(await sender.stopped(state.effect))return true;}finally{ledger.close();}if(Date.now()>deadline)return false;await delay(50);}}

/** @param {string[]} args */
export async function main(args){
 requireThat(process.platform==='android','FORBIDDEN','F3 hosted harness is Termux/Android operator-only');
 const {values}=parseArgs({args,options:{config:{type:'string'},fixture:{type:'string'}},strict:true,allowPositionals:false});requireThat(values.config&&values.fixture,'INVALID_ARGUMENT','F3 harness requires --config and --fixture');
 const configPath=resolve(values.config),fixturePath=resolve(values.fixture),loaded=await loadInstallation(configPath),{config,binding,research,canonical,gitSender}=loaded,root=join(config.stateDirectory,F3_SCOPE.stateName);
 await mkdir(root,{recursive:false,mode:0o700});await mkdir(join(root,'senders'),{mode:0o700});const wrapper=join(root,'git-wrapper.py');await writeWrapper(wrapper,gitSender.pythonExecutable);
 const senderConfig=buildResearchSenderConfig(canonical,root,wrapper);await durableJson(join(root,'sender.json'),senderConfig);
 const repository=await repositoryFor(canonical,binding,research),fixture=await loadFixture(fixturePath,binding,repository);
 await exactCreateRef(senderConfig,fixture.expectedHead);const initial=await repository.resolve(research);requireThat(initial.head===fixture.expectedHead,'INTEGRITY_FAILURE','Disposable ref did not start at exact H');
 const group=freezePublicationGroup({repositoryId:F3_SCOPE.repositoryId,bindingEpoch:binding.bindingEpoch,ref:F3_SCOPE.ref,currentHead:initial.head,expectedHead:fixture.expectedHead,commitOid:fixture.commitOid,composedResultId:fixture.composedResultId,composedValidationId:fixture.composedValidationId,policyDigest:fixture.policyDigest,members:fixture.members});requireThat(group.kind==='frozen','INTEGRITY_FAILURE','F3 group could not freeze');
 const effect=effectFor(group),current=group.members.map(member=>({...member}));await durableJson(join(root,'experiment.json'),{schemaVersion:1,fixtureDigest:recordDigest('dev2.f3-hosted-fixture.v1',fixture),group,effect,current,settlement:null,startedAt:new Date().toISOString()});
 const child=spawn(process.execPath,[fileURLToPath(import.meta.url)],{env:{...process.env,DEV2_F3_INTERNAL:'dispatch',DEV2_F3_CONFIG:configPath,DEV2_F3_FIXTURE:fixturePath},stdio:'ignore'});const held=await pollHeld(root);const invocationBefore=await senderInvocation(root);
 current[1]={...current[1],cancelRequested:true};await durableJson(join(root,'experiment.json'),{schemaVersion:1,fixtureDigest:recordDigest('dev2.f3-hosted-fixture.v1',fixture),group,effect,current,settlement:null,startedAt:new Date().toISOString(),followerCancellation:{actionId:current[1].actionId,requested:true,phase:'remote_possible'}});
 child.kill('SIGKILL');await new Promise(resolveExit=>child.once('exit',resolveExit));const recovery1=await inspectRecovery(configPath,fixturePath,'restart-1'),invocationAfter1=await senderInvocation(root);requireThat(invocationAfter1===invocationBefore,'INTEGRITY_FAILURE','Second sender appeared after controller restart');const recovery2=await inspectRecovery(configPath,fixturePath,'restart-2'),invocationAfter2=await senderInvocation(root);requireThat(invocationAfter2===invocationBefore,'INTEGRITY_FAILURE','Replay created a second sender');
 await writeFile(join(root,'sender-release'),'release\n',{flag:'wx',mode:0o600});await syncDirectory(root);const stopped=await waitStopped(configPath,fixturePath),outcome=await authoritativeOutcome(repository,research,effect,stopped);requireThat(outcome.kind!=='unknown','EXECUTION_UNAVAILABLE','Authoritative provider readback unavailable after sender release');requireThat(outcome.observed,'EXECUTION_UNAVAILABLE','Authoritative provider readback missing');
 const relation=/** @type {'commit_or_descendant'|'expected_head'|'other_expected_descendant'|'foreign'} */(outcome.relation);requireThat(relation&&['commit_or_descendant','expected_head','other_expected_descendant','foreign'].includes(relation),'INTEGRITY_FAILURE');const reconciled=reconcilePublicationGroup(group,{head:outcome.observed.head,relation,senderStopped:stopped}),settlement=settlePublicationGroup(group,reconciled,current);const beforeTerminal=0,afterTerminal=settlement.filter(x=>['succeeded','failed','cancelled'].includes(x.actionStatus)).length;requireThat(afterTerminal===0||afterTerminal===group.members.length,'INTEGRITY_FAILURE','Partial terminal projection');
 await durableJson(join(root,'experiment.json'),{schemaVersion:1,fixtureDigest:recordDigest('dev2.f3-hosted-fixture.v1',fixture),group,effect,current,settlement,startedAt:new Date().toISOString(),followerCancellation:{actionId:current[1].actionId,requested:true,phase:'remote_possible'},physicalSender:{invocationId:invocationBefore,held},recoveries:[recovery1,recovery2],provider:outcome,atomicObservation:{beforeTerminal,afterTerminal,total:group.members.length},finishedAt:new Date().toISOString()});
 if(stopped&&outcome.observed.head&&outcome.kind!=='binding_fenced')await exactDeleteRef(senderConfig,outcome.observed.head);
 process.stdout.write(canonicalJson({verdict:reconciled.kind==='integrated'?'candidate-survives':'candidate-'+reconciled.kind,ref:F3_SCOPE.ref,effectId:effect.effectId,invocationId:invocationBefore,providerHead:outcome.observed.head,settled:settlement.length,evidence:join(root,'experiment.json')})+'\n');
}

if(process.env.DEV2_F3_INTERNAL==='dispatch')childDispatch(resolve(process.env.DEV2_F3_CONFIG??''),resolve(process.env.DEV2_F3_FIXTURE??'')).catch(()=>process.exit(1));
else if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(error=>{process.stderr.write(canonicalJson({kind:'f3-hosted-harness-failed',code:typeof error?.code==='string'?error.code:'EXECUTION_UNAVAILABLE',message:String(error?.message??'failed')})+'\n');process.exitCode=1;});
