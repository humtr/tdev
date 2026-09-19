import {lstat,readFile,realpath,mkdir} from 'node:fs/promises';
import {resolve,join,dirname,isAbsolute} from 'node:path';
import {createRemoteJWKSet} from 'jose';
import {bytesDigest,canonicalJson,parseRecord,recordDigest} from '../contracts/canonical.mjs';
import {requireThat,TdevError} from '../contracts/errors.mjs';
import {failure} from '../contracts/envelopes.mjs';
import {capacity,oid,digest,id,revision} from '../contracts/identity.mjs';
import {GitRepository} from '../repository/git.mjs';
import {ContextService} from '../repository/context.mjs';
import {runtimeBindings} from '../repository/bindings.mjs';
import {mergeInstallationBindingRegistry} from '../repository/installation-binding-registry.mjs';
import {ScopedAuthorization} from '../security/authorization.mjs';
import {accessApplicationVerifier} from '../security/access-application.mjs';
import {c22PrincipalObservationPath,isC22PrincipalObservationRequest,recordVerifiedC22PrincipalObservation} from '../security/c2-2-principal-observation.mjs';
import {Ledger} from '../storage/ledger.mjs';
import {ObjectStore} from '../storage/objects.mjs';
import {AdoptedPolicy} from '../validation/policy.mjs';
import {ResultPreparer} from '../integration/prepare.mjs';
import {GitRefTransport} from '../integration/git-ref.mjs';
import {DurableGitSender} from '../integration/sender.mjs';
import {GitHubCanonicalBoundary} from '../integration/github-boundary.mjs';
import {DevelopmentEngine} from './engine.mjs';
import {DevelopmentApplication} from './application.mjs';
import {BindingRouterApplication} from './binding-router.mjs';
import {InstallationExecutionArbiter} from './execution-arbiter.mjs';
import {ManagedTargets} from '../execution/managed-targets.mjs';
import {createManagedControl} from './managed.mjs';
import {NativeReleaseControl} from '../release/native-control.mjs';
import {NativeReleaseRuntime} from './release.mjs';
import {privateDirectory} from '../release/private-files.mjs';
import {DeviceConnection} from '../transport/device.mjs';
import {SCHEMA_DIGEST} from '../mcp/outputs.mjs';
import {workersDevOrigin,selectExecutionVariant} from './environment.mjs';
/** @typedef {import('../contracts/ports.js').Json} Json */
/** @typedef {{[key:string]:Json}} RecordValue */
/** @typedef {{repositoryId:string,githubTokenFile:string,gitAskpassFile:string,repositoryOwnerId?:string,canonicalRuleset?:{rulesetId:number,createdAt:string,updatedAt:string},gitSender?:{configurationFile:string,pythonExecutable:string,helperFile:string}}} BindingProvider */
/** @typedef {{schemaVersion:1,edge:import('../edge/types.js').EdgeConfig,stateDirectory:string,gitExecutable:string,githubTokenFile:string|null,gitAskpassFile:string|null,deviceKeyFile:string,cursorKeyFile:string,capacity:number,actor:string,runtime:{bundleDigest:string,schemaDigest:string,sourceCommitOid:string,sourceTreeOid:string},toolchain:{executionVariants:import('./environment.mjs').ExecutionVariant[]},policy:ConstructorParameters<typeof AdoptedPolicy>[0],managedEnrollmentFile?:string|null,productionEnrollmentFile?:string|null,releaseControl?:import('../release/device-configs.mjs').ReleaseControl,releaseArtifactDirectory?:string,gitSender?:{configurationFile:string,pythonExecutable:string,helperFile:string},bindingProviders?:readonly BindingProvider[],c2HumanObservationRecovery?:boolean}} NativeConfig */
/** Private installation inputs are outside source/candidates. No alias, mutable
 * symlink, permissive mode or hardlink may act as a credential/enrollment file.
 * @param {string} filename @param {number} [maximum] */
export async function privateFile(filename,maximum=1048576){
 requireThat(isAbsolute(filename),'INVALID_ARGUMENT');const path=resolve(filename),before=await lstat(path);
 requireThat(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&(before.mode&0o077)===0&&before.size<=maximum&&await realpath(path)===path,'FORBIDDEN','Unsafe installation file');
 const bytes=await readFile(path),after=await lstat(path);requireThat(before.ino===after.ino&&before.dev===after.dev&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&bytes.length===before.size,'INTEGRITY_FAILURE');return bytes;
}
/** @param {string} filename */
export async function readNativeConfig(filename){return /** @type {NativeConfig} */(parseRecord(await privateFile(filename),1048576));}
/** Unenrolled installations retain source preparation, never untrusted execution.
 * @type {import('../contracts/ports.js').ValidationPort} */
const unavailableValidation={async validate(){throw new TdevError('EXECUTION_UNAVAILABLE','Managed execution and receipt attestation are not sealed');},async eligible(){return false;}};
/** @param {NativeConfig} config @param {{log?:(event:string)=>void,commissioningIntent?:import('./production-enrollment.mjs').ProductionIntent,terminalStageRecovery?:boolean}} [options] */
export async function createNativeInstallation(config,options={}){
 requireThat(config.schemaVersion===1&&config.runtime.schemaDigest===SCHEMA_DIGEST,'INTEGRITY_FAILURE','Installation/schema mismatch');
 requireThat(isAbsolute(config.stateDirectory),'INVALID_ARGUMENT');const registryFile=join(resolve(config.stateDirectory),'binding-registry-v1.json');
 try{config=mergeInstallationBindingRegistry(config,parseRecord(await privateFile(registryFile),1048576));}catch(error){if(/** @type {{code?:string}} */(error)?.code!=='ENOENT')throw error;}
 const edge=config.edge,{binding,bindings,projectPolicyDigest}=runtimeBindings(edge);workersDevOrigin(edge.origin);capacity(config.capacity);id(edge.installationId);id(edge.deviceId);
 requireThat(!config.productionEnrollmentFile||config.managedEnrollmentFile,'EXECUTION_UNAVAILABLE','Production enrollment requires historical managed enrollment');
 requireThat(!!config.releaseControl===!!config.releaseArtifactDirectory,'EXECUTION_UNAVAILABLE','Incomplete installed release configuration');
 if(config.releaseArtifactDirectory)await privateDirectory(config.releaseArtifactDirectory);
 const control=config.releaseControl?await new NativeReleaseControl({config:config.releaseControl,...binding,runtime:config.runtime}).init():null;
 const admission=control?await control.startupAdmission():null;
 /** @type {NativeReleaseRuntime|null} */let release=null;
 oid(config.runtime.sourceCommitOid);oid(config.runtime.sourceTreeOid);digest(config.runtime.bundleDigest);
 /** @type {Map<string,string>} */const repositoryNames=new Map();
 for(const installed of bindings){requireThat(installed.provider==='github'&&/^[1-9][0-9]*$/.test(installed.providerRepositoryId),'FORBIDDEN');const remote=new URL(installed.remote);requireThat(remote.protocol==='https:'&&remote.hostname==='github.com'&&!remote.username&&!remote.password&&!remote.search&&!remote.hash&&/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.git$/.test(remote.pathname),'FORBIDDEN');repositoryNames.set(installed.repositoryId,remote.pathname.slice(1,-4));}
 const repositoryName=/** @type {string} */(repositoryNames.get(binding.repositoryId)),initialPolicy=new AdoptedPolicy(config.policy);
 requireThat(initialPolicy.policy.digest===binding.policyDigest&&initialPolicy.policy.execution.environmentClass==='github-hosted-unsealed','INTEGRITY_FAILURE');
 requireThat(bindings.every(installed=>installed.policyDigest===initialPolicy.policy.digest),'EXECUTION_UNAVAILABLE','All installed C2-1 bindings must select the installed managed policy');
 selectExecutionVariant(config.toolchain,{platform:process.platform,arch:process.arch,node:process.versions.node,sqlite:process.versions.sqlite??null});
 requireThat(isAbsolute(config.stateDirectory)&&isAbsolute(config.gitExecutable),'INVALID_ARGUMENT');
 await mkdir(config.stateDirectory,{recursive:true,mode:0o700});requireThat(await realpath(config.stateDirectory)===resolve(config.stateDirectory)&&(await lstat(config.stateDirectory)).isDirectory(),'INTEGRITY_FAILURE');
 const primaryToken=config.githubTokenFile?(await privateFile(config.githubTokenFile,8192)).toString().trim():null,token=primaryToken;
 const deviceKey=(await privateFile(config.deviceKeyFile,1024)).toString().trim(),cursorKey=await privateFile(config.cursorKeyFile,1024);
 requireThat(bytesDigest(Buffer.from(deviceKey))===edge.deviceCredentialDigest&&cursorKey.length>=32,'INTEGRITY_FAILURE');
 const state=resolve(config.stateDirectory);await mkdir(join(state,'home'),{recursive:true,mode:0o700});await mkdir(join(state,'tmp'),{recursive:true,mode:0o700});
 /** @type {Record<string,string>} */const gitEnvironment={PATH:dirname(config.gitExecutable),HOME:join(state,'home'),TMPDIR:join(state,'tmp'),LANG:'C.UTF-8'};
 if(config.gitAskpassFile)await privateFile(config.gitAskpassFile,16384);
 /** @type {Map<string,any>} */const bindingProviders=new Map([[binding.repositoryId,{repositoryId:binding.repositoryId,token:primaryToken,githubTokenFile:config.githubTokenFile,gitAskpassFile:config.gitAskpassFile,repositoryOwnerId:null,canonicalRuleset:null,gitSender:config.gitSender??null}]]);
 const additional=config.bindingProviders??[];requireThat(additional.length===bindings.length-1,'EXECUTION_UNAVAILABLE','Every secondary binding requires an explicit provider credential association');
 for(const configured of additional){id(configured.repositoryId);const installed=bindings.find(candidate=>candidate.repositoryId===configured.repositoryId);requireThat(installed&&installed.repositoryId!==binding.repositoryId&&!bindingProviders.has(installed.repositoryId),'INTEGRITY_FAILURE','Secondary provider binding differs');
  const secondaryToken=(await privateFile(configured.githubTokenFile,8192)).toString().trim();await privateFile(configured.gitAskpassFile,16384);requireThat(secondaryToken.length>20,'UNAUTHORIZED','Secondary provider credential is empty');
  const writerParts=[configured.repositoryOwnerId,configured.canonicalRuleset,configured.gitSender].filter(value=>value!==undefined);requireThat(writerParts.length===0||writerParts.length===3,'EXECUTION_UNAVAILABLE','Secondary canonical writer configuration is incomplete');
  if(writerParts.length){requireThat(revision(String(configured.repositoryOwnerId))!=='0'&&Number.isSafeInteger(configured.canonicalRuleset?.rulesetId)&&Number(configured.canonicalRuleset?.rulesetId)>0,'INTEGRITY_FAILURE','Secondary canonical writer identity is invalid');}
  bindingProviders.set(installed.repositoryId,{...configured,token:secondaryToken});
 }
 requireThat(bindingProviders.size===bindings.length,'INTEGRITY_FAILURE','Provider credential registry differs from installed bindings');
 const bindingEnvironment=(/** @type {import('../contracts/ports.js').Binding} */ selected)=>{const provider=bindingProviders.get(selected.repositoryId);requireThat(provider,'FORBIDDEN','No credential association for binding');const environment={...gitEnvironment};if(provider.githubTokenFile&&provider.gitAskpassFile){environment.GIT_ASKPASS=provider.gitAskpassFile;environment.TDEV_GITHUB_TOKEN_FILE=provider.githubTokenFile;}return environment;};
 /** @type {Map<string,number>} */const providerVerifiedAt=new Map();
 const repository=new GitRepository({directory:join(state,'repository.git'),executable:config.gitExecutable,environment:gitEnvironment,bindingEnvironment,bindings:()=>bindings,verifyRemote:async selected=>{
  if(Date.now()-(providerVerifiedAt.get(selected.repositoryId)??0)<60000)return;const selectedName=repositoryNames.get(selected.repositoryId),provider=bindingProviders.get(selected.repositoryId);requireThat(selectedName&&provider,'FORBIDDEN');
  /** @type {Record<string,string>} */const headers={accept:'application/vnd.github+json','user-agent':'tdev-native-control'};if(provider.token)headers.authorization='Bearer '+provider.token;
  let response;try{response=await fetch('https://api.github.com/repos/'+selectedName,{headers,redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw new TdevError('EXECUTION_UNAVAILABLE','Repository identity provider unavailable');}
  requireThat(response.ok,'EXECUTION_UNAVAILABLE','Repository identity provider unavailable');const metadata=/** @type {{id?:number,full_name?:string}} */(await response.json());
  requireThat(String(metadata.id)===selected.providerRepositoryId&&metadata.full_name===selectedName,'FORBIDDEN','Repository provider identity changed');providerVerifiedAt.set(selected.repositoryId,Date.now());
 }});await repository.init();
 const objects=new ObjectStore(join(state,'objects'));await objects.init();
 const authorization=new ScopedAuthorization({issuer:edge.issuer,audience:edge.origin,bindings:()=>bindings,grants:()=>edge.grants});
 const verify=accessApplicationVerifier({profile:'access-application',issuer:edge.issuer,applicationAudience:edge.applicationAudience,resourceOrigin:edge.origin,applicationCapabilities:edge.applicationCapabilities},createRemoteJWKSet(new URL(edge.issuer+'/cdn-cgi/access/certs')));
 await mkdir(join(state,'binding-ledgers'),{recursive:true,mode:0o700});
 /** @type {Map<string,Ledger>} */const ledgers=new Map();const ledger=new Ledger(join(state,'work.sqlite'),binding);ledgers.set(binding.repositoryId,ledger);
 for(const installed of bindings)if(installed.repositoryId!==binding.repositoryId){const directory=join(state,'binding-ledgers'),filename=join(directory,recordDigest('tdev.binding-ledger.v1',installed).slice(7)+'.sqlite');ledgers.set(installed.repositoryId,new Ledger(filename,installed));}
 const targets=new ManagedTargets(binding,ledger);for(const installed of bindings)if(installed.repositoryId!==binding.repositoryId)targets.register(installed,/** @type {Ledger} */(ledgers.get(installed.repositoryId)));
 const context=new ContextService({repository,objects,authorization,tokenKey:cursorKey}),arbiter=new InstallationExecutionArbiter(config.capacity);
 /** @type {Awaited<ReturnType<typeof createManagedControl>>|null} */let managed=null;
 /** @type {Map<string,DevelopmentEngine>} */const engines=new Map();
 /** @type {DevelopmentEngine|null} */let currentEngine=null;
 /** @type {Map<string,DurableGitSender>} */const senders=new Map();
 /** @type {Map<string,GitHubCanonicalBoundary>} */const guards=new Map();
 /** @type {DurableGitSender|null} */let sender=null;
 /** @type {GitHubCanonicalBoundary|null} */let guard=null;
 /** @type {Awaited<ReturnType<NativeReleaseControl['serve']>>|null} */let nativeControl=null;
 try{
 /** @type {Map<string,GitRefTransport>} */const transports=new Map(bindings.map(installed=>[installed.repositoryId,new GitRefTransport(repository,installed)]));
 const lineageFor=(/** @type {import('../contracts/ports.js').Binding} */ installed)=>(/** @type {string} */ head)=>installed.repositoryId===binding.repositoryId?repository.isAncestor(installed,config.runtime.sourceCommitOid,head):repository.readCommit(installed,head).then(()=>true);
 const integrationLineageFor=(/** @type {import('../contracts/ports.js').Binding} */ installed)=>async(/** @type {string} */ head)=>{const selected=guards.get(installed.repositoryId);requireThat(selected,'EXECUTION_UNAVAILABLE','Canonical monotonic boundary is not enrolled');await selected.verify();return lineageFor(installed)(head);};
 const remoteFor=(/** @type {import('../contracts/ports.js').Binding} */ installed)=>{const transport=/** @type {GitRefTransport} */(transports.get(installed.repositoryId));return {resolve:()=>transport.resolve(),fetch:(/** @type {string} */ head)=>transport.fetch(head),compareUpdate:async(/** @type {import('../contracts/ports.js').Effect} */ effect)=>{const selectedSender=senders.get(installed.repositoryId),selectedGuard=guards.get(installed.repositoryId);requireThat(selectedSender&&selectedGuard,'EXECUTION_UNAVAILABLE','Native canonical writer is not installed');await selectedGuard.verify();return selectedSender.compareUpdate(effect);},prepareCompareUpdate:async(/** @type {import('../contracts/ports.js').Effect} */ effect)=>{const selectedSender=senders.get(installed.repositoryId),selectedGuard=guards.get(installed.repositoryId);requireThat(selectedSender&&selectedGuard,'EXECUTION_UNAVAILABLE','Native canonical writer is not installed');await selectedGuard.verify();return (/** @type {(tx:import('../storage/ledger.mjs').Transaction)=>void} */ fence)=>selectedSender.compareUpdate(effect,fence);},observeSender:async(/** @type {import('../contracts/ports.js').Effect} */ effect)=>{const selectedSender=senders.get(installed.repositoryId);requireThat(selectedSender,'EXECUTION_UNAVAILABLE','Native canonical writer is not installed');return selectedSender.observe(effect);}};};
 const transport=/** @type {GitRefTransport} */(transports.get(binding.repositoryId)),verifyLineage=lineageFor(binding),integrationLineage=integrationLineageFor(binding),remoteTransport=remoteFor(binding);
 if(config.managedEnrollmentFile){
  requireThat(token&&config.gitSender&&config.githubTokenFile&&config.gitAskpassFile,'EXECUTION_UNAVAILABLE','Private managed/native writer configuration is incomplete');
  const enrollment=/** @type {import('./enrollment.mjs').Enrollment} */(parseRecord(await privateFile(config.managedEnrollmentFile,4194304),4194304));
  const productionEnrollment=config.productionEnrollmentFile?/** @type {import('./production-enrollment.mjs').ProductionEnrollment} */(parseRecord(await privateFile(config.productionEnrollmentFile,1048576),1048576)):undefined;
  const installedSource=await repository.readCommit(binding,config.runtime.sourceCommitOid);requireThat(installedSource.source.treeOid===config.runtime.sourceTreeOid,'INTEGRITY_FAILURE','Installed source identity changed');
  const helper=installedSource.source.entries.find(e=>e.path==='tools/git-sender.py');requireThat(helper&&helper.mode==='100644','INTEGRITY_FAILURE','Canonical sender helper is absent');
  const installWriter=async(/** @type {import('../contracts/ports.js').Binding} */ selected,/** @type {any} */ provider,/** @type {string} */ ownerId,/** @type {{rulesetId:number,createdAt:string,updatedAt:string}} */ ruleset)=>{const ownerLedger=/** @type {Ledger} */(ledgers.get(selected.repositoryId)),configuration=provider.gitSender;requireThat(configuration&&provider.token&&provider.githubTokenFile&&provider.gitAskpassFile,'EXECUTION_UNAVAILABLE','Binding canonical writer configuration is incomplete');const helperPath=resolve(configuration.helperFile),helperInfo=await lstat(helperPath);requireThat(helperInfo.isFile()&&!helperInfo.isSymbolicLink()&&await realpath(helperPath)===helperPath&&bytesDigest(await readFile(helperPath))===helper.contentDigest,'INTEGRITY_FAILURE','Canonical sender helper differs from installed source');
   const senderState=selected.repositoryId===binding.repositoryId?join(state,'git-senders'):join(state,'git-senders',recordDigest('tdev.binding-sender.v1',selected).slice(7)),environment=bindingEnvironment(selected),senderConfig=parseRecord(await privateFile(configuration.configurationFile,65536),65536),expectedSender={schemaVersion:1,stateDirectory:senderState,repositoryId:selected.repositoryId,bindingEpoch:selected.bindingEpoch,ref:selected.ref,provider:selected.provider,remote:selected.remote,gitExecutable:config.gitExecutable,repositoryDirectory:join(state,'repository.git'),environment,timeoutMs:30000};
   requireThat(canonicalJson(senderConfig)===canonicalJson(expectedSender),'INTEGRITY_FAILURE','Canonical sender private scope differs');const selectedSender=new DurableGitSender({ledger:ownerLedger,stateDirectory:senderState,configurationPath:configuration.configurationFile,pythonExecutable:configuration.pythonExecutable,helperPath,environment}),selectedGuard=new GitHubCanonicalBoundary({binding:selected,repositoryFullName:/** @type {string} */(repositoryNames.get(selected.repositoryId)),repositoryOwnerId:ownerId,identity:ruleset,token:provider.token});senders.set(selected.repositoryId,selectedSender);guards.set(selected.repositoryId,selectedGuard);
  };
  await installWriter(binding,/** @type {any} */(bindingProviders.get(binding.repositoryId)),enrollment.repositoryOwnerId,enrollment.canonicalRuleset);
  for(const selected of bindings)if(selected.repositoryId!==binding.repositoryId){const provider=/** @type {any} */(bindingProviders.get(selected.repositoryId));if(provider?.gitSender)await installWriter(selected,provider,String(provider.repositoryOwnerId),provider.canonicalRuleset);}
  sender=/** @type {DurableGitSender} */(senders.get(binding.repositoryId));guard=/** @type {GitHubCanonicalBoundary} */(guards.get(binding.repositoryId));
  managed=await createManagedControl({enrollment,productionEnrollment,commissioningIntent:options.commissioningIntent,admission,installationSealDigest:config.releaseControl?.installationSealDigest,runtime:config.runtime,origin:edge.origin,ledger,binding,targets,repository,objects,authorization,initialPolicy,projectPolicyDigest,remote:remoteTransport,verifyLineage:integrationLineage,token,receiptSecret:cursorKey,capacity:config.capacity,wake:()=>arbiter.wake()});
 }else requireThat(!ledger.transact(tx=>tx.get("SELECT value FROM meta WHERE key='policy.enrollment'")),'EXECUTION_UNAVAILABLE','Retained managed installation cannot silently fall back to bootstrap');
 const policy=()=>managed?.policyState.current??initialPolicy,activeManaged=managed;
 const runProfileFor=(/** @type {import('../contracts/ports.js').Binding} */ selected,/** @type {Ledger} */ ownerLedger)=>async(/** @type {import('../contracts/ports.js').Work} */ work,/** @type {import('../contracts/ports.js').Attempt} */ attempt,/** @type {import('../contracts/ports.js').Profile} */ profile)=>{
  requireThat(managed,'EXECUTION_UNAVAILABLE');const selectedTransport=/** @type {GitRefTransport} */(transports.get(selected.repositoryId)),live=await selectedTransport.resolve();await selectedTransport.fetch(live.head);requireThat(work.baseCommitOid===live.head||await repository.isAncestor(selected,work.baseCommitOid,live.head),'STALE_BASE');
  const preparer=new ResultPreparer({ledger:ownerLedger,repository,binding:selected,verifyLineage:async head=>head===work.baseCommitOid,actor:config.actor}),result=await preparer.prepare(work,work.baseCommitOid,policy().policy.execution,selected.policyDigest),selectedEngine=engines.get(selected.repositoryId);requireThat(selectedEngine,'INTEGRITY_FAILURE');selectedEngine.assertAttempt(attempt);const receipt=await managed.poolFor(result.execution).run(result,attempt,profile);return {exitCode:receipt.exitCode,signal:receipt.signal,inputDigest:receipt.inputDigest,outputDigest:receipt.outputDigest};
 };
 for(const selected of bindings){const ownerLedger=/** @type {Ledger} */(ledgers.get(selected.repositoryId)),selectedRemote=remoteFor(selected),selectedLineage=lineageFor(selected),selectedIntegrationLineage=integrationLineageFor(selected),selectedSender=senders.get(selected.repositoryId),primary=selected.repositoryId===binding.repositoryId;
  const selectedEngine=new DevelopmentEngine({binding:selected,ledger:ownerLedger,repository,context,authorization,remote:selectedRemote,validation:()=>managed?.validation()??unavailableValidation,policy,capacity:config.capacity,arbiter,objects,h2Enabled:true,h2MaxMembers:32,executionAvailable:()=>managed!==null,operationAvailable:op=>op==='integrate'?!!selectedSender:op==='policy.adopt'?primary&&managed!==null:op.startsWith('release.')?primary&&release?.available()===true:true,integrationLineage:selectedIntegrationLineage,verifyLineage:selectedLineage,actor:config.actor,
   ...(activeManaged?{runProfile:runProfileFor(selected,ownerLedger),cancelAttempt:async(/** @type {import('../contracts/ports.js').Attempt} */ a)=>{if(primary)await activeManaged.production?.builder?.cancel(a.actionId);return activeManaged.attemptPool(a).cancel(a);},attemptStopped:(/** @type {import('../contracts/ports.js').Attempt} */ a)=>activeManaged.attemptPool(a).stopped(a),senderStopped:(/** @type {import('../contracts/ports.js').Effect} */ e)=>{requireThat(selectedSender,'EXECUTION_UNAVAILABLE');return selectedSender.stopped(e);},cancelSender:(/** @type {import('../contracts/ports.js').Effect} */ e)=>{requireThat(selectedSender,'EXECUTION_UNAVAILABLE');return selectedSender.cancel(e);},...(primary?{specialRecovery:async(/** @type {import('../contracts/ports.js').Action} */ action)=>{if(action.operation==='policy.adopt')return activeManaged.policyState.recovery(action);requireThat(release&&release.available(),'EXECUTION_UNAVAILABLE','Release recovery capability is unavailable');return release.recovery(action);},special:async(/** @type {import('../contracts/ports.js').Principal} */ principal,/** @type {import('./engine.mjs').Input} */ input,/** @type {string} */ actionId)=>{if(input.op==='policy.adopt')return activeManaged.policyState.adopt(principal,{integratedCommit:input.integratedCommit??'',policyPath:input.policyPath??'',expectedPolicyDigest:input.expectedPolicyDigest??'',newPolicyDigest:input.newPolicyDigest??''},actionId);requireThat(release&&release.available(),'EXECUTION_UNAVAILABLE','Paired release capability is unavailable');return release.execute(principal,input,actionId);}}:{})}: {})});engines.set(selected.repositoryId,selectedEngine);
 }
 const engine=/** @type {DevelopmentEngine} */(engines.get(binding.repositoryId));currentEngine=engine;
 /** @type {{connected:boolean,connectionId:string|null,connectedAt:string|null,lastMessageAt:string|null}} */let connection={connected:false,connectionId:null,connectedAt:null,lastMessageAt:null};
 /** @type {import('../edge/types.js').DeviceHello['edge']|null} */let activeEdge=null;
 /** @type {Json|null} */let probeSummary=null;
 const installationLifecycle={o:{ledger},get accepting(){return [...engines.values()].every(candidate=>candidate.accepting);},get running(){const running=new Map();for(const candidate of engines.values())for(const [actionId,promise] of candidate.running)running.set(actionId,promise);return running;},drain(){for(const candidate of engines.values())candidate.drain();return {running:[...engines.values()].reduce((n,candidate)=>n+candidate.running.size,0),reservations:arbiter.held()};}};
 nativeControl=control?await control.serve({engine:installationLifecycle,connection:()=>({connected:connection.connected,edge:activeEdge})}):null;
 if(managed?.production?.builder&&control&&config.releaseArtifactDirectory){
  const p=managed.production;requireThat(p.builder,'EXECUTION_UNAVAILABLE');
  release=await new NativeReleaseRuntime({ledger,binding,objects,artifactDirectory:config.releaseArtifactDirectory,authority:managed.authority,builder:p.builder,control,authorize:(principal,paths)=>authorization.authorize(principal,binding,'runtime.activate',paths),runtime:config.runtime,enrollmentSealDigest:p.enrolled.sealDigest,trustedRunnerDigest:p.definition.identities.trustedRunnerDigest,workflowDigest:p.definition.identities.workflowDigest}).init();
 }
 const identity=async()=>{
  /** @type {{state:string,commitOid:string|null,treeOid:string|null,observedAt:string|null}} */let source={state:'unavailable',commitOid:null,treeOid:null,observedAt:null};
  try{const observed=await repository.resolve(binding),commit=await repository.readCommit(binding,observed.head);source={state:'current',commitOid:observed.head,treeOid:commit.source.treeOid,observedAt:observed.observedAt};}catch{}
  if(release){if(connection.connected)await release.refresh();else release.invalidate();}
  return {installationId:edge.installationId,phase:managed?'qualified':'bootstrap',origin:edge.origin,source,edge:activeEdge??{versionId:null,bundleDigest:null,sourceCommitOid:null,schemaDigest:SCHEMA_DIGEST,observedAt:null},device:{deviceId:edge.deviceId,bundleDigest:config.runtime.bundleDigest,sourceCommitOid:config.runtime.sourceCommitOid,schemaDigest:SCHEMA_DIGEST,ownerEpoch:ledger.ownerEpoch,nodeVersion:process.versions.node,platform:process.platform,arch:process.arch,connected:connection.connected,connectionNonce:connection.connectionId,connectedAt:connection.connectedAt,lastMessageAt:connection.lastMessageAt},managedExecution:managed?.identity()??{state:'unsealed',sealDigest:null,activeSessions:0,reservedSessions:0,reason:'Private qualified execution enrollment is absent'},activation:release?.projection()??{phase:'bootstrap',activationId:null,activeReleaseId:null,stagedReleaseId:null,expectedReleaseId:null,writerStopped:!installationLifecycle.accepting&&installationLifecycle.running.size===0,deadline:null}};
 };
 const releaseId=admission?.pair.releaseId??recordDigest('tdev.bootstrap-installed-bundle.v1',{...config.runtime}),applications=bindings.map(selected=>new DevelopmentApplication({engine:/** @type {DevelopmentEngine} */(engines.get(selected.repositoryId)),releaseId,artifacts:objects,deploymentSealed:()=>release?.deploymentSealed===true,currentReleaseId:()=>release?.releaseId??releaseId,runtimeIdentity:identity,sessions:()=>managed?.views()??[]})),app=new BindingRouterApplication({applications,primaryRepositoryId:binding.repositoryId});
 /** Fixed read-only diagnostics are not human OAuth or self-development proof.
  * @returns {Promise<Json>} */
 const readProbe=async()=>{
  const enrolled=edge.grants.find(g=>g.repositoryId===binding.repositoryId&&g.capabilities.includes('repository.read'));requireThat(enrolled,'FORBIDDEN');
  const principal={subject:enrolled.subject,issuer:edge.issuer,audience:edge.origin,expiresAt:Date.now()+60000,tokenCapabilities:/** @type {const} */(['repository.read'])};
  const current=/** @type {RecordValue} */(await app.invoke(principal,'dev_context',{apiVersion:1,repository:'self'}));
  let read=/** @type {Json} */(null);if(current.ok===true){const data=/** @type {RecordValue} */(current.data),snapshot=/** @type {RecordValue} */(data.snapshot);read=await app.invoke(principal,'dev_read',{apiVersion:1,target:{snapshotId:snapshot.snapshotId,freshness:'current'},queries:[{kind:'file',path:'AGENTS.md'},{kind:'file',path:'WORKBOARD.md'}],maxReturnBytes:65536});}
  const observed=await app.invoke(principal,'dev_observe',{apiVersion:1,selector:{runtime:true}}),open=await app.invoke(principal,'dev_observe',{apiVersion:1,selector:{open:true},limit:8});
  const ok=current.ok===true&&read!==null&&typeof read==='object'&&!Array.isArray(read)&&read.ok===true&&observed.ok===true&&open.ok===true;
  probeSummary={ok,observedAt:new Date().toISOString(),authenticationMode:'installation-read-probe',humanOAuth:false,repositoryId:binding.repositoryId,currentHead:current.ok===true?/** @type {RecordValue} */(/** @type {RecordValue} */(current.data).snapshot).commitOid:null,schemaDigest:SCHEMA_DIGEST};return {summary:probeSummary,context:current,read,runtime:observed,open};
 };
 const device=new DeviceConnection({origin:edge.origin,installationId:edge.installationId,secret:deviceKey,invoke:async(tool,args,assertion)=>{const principal=await verify(assertion),result=await app.invoke(principal,tool,args);if(config.c2HumanObservationRecovery===true&&tool==='dev_context'&&isC22PrincipalObservationRequest(args)&&result!==null&&typeof result==='object'&&!Array.isArray(result)&&result.ok===false&&result.error!==null&&typeof result.error==='object'&&!Array.isArray(result.error)&&result.error.code==='FORBIDDEN')await recordVerifiedC22PrincipalObservation({filename:c22PrincipalObservationPath(state),subject:principal.subject,assertion});return result;},executor:async(args,assertion)=>managed?managed.endpoint.invoke(args,assertion):failure(new TdevError('EXECUTION_UNAVAILABLE','Managed execution is not enrolled')),probe:readProbe,presence:()=>({schemaDigest:SCHEMA_DIGEST,sourceCommitOid:config.runtime.sourceCommitOid,bundleDigest:config.runtime.bundleDigest,ownerEpoch:ledger.ownerEpoch,nodeVersion:process.versions.node,platform:process.platform,arch:process.arch,connectedAt:connection.connectedAt,lastMessageAt:connection.lastMessageAt,probe:probeSummary}),onHello:hello=>{activeEdge=hello.edge;},onState:value=>{connection=value;if(!value.connected)release?.invalidate();},log:options.log});
 if(options.commissioningIntent||options.terminalStageRecovery||config.c2HumanObservationRecovery===true)installationLifecycle.drain();else arbiter.wake();return {app,engine,engines,ledger,ledgers,repository,device,managed,sender,senders,guard,guards,control,release,readProbe,identity,releaseId,async close(){installationLifecycle.drain();release?.invalidate();device.stop();await Promise.allSettled([...device.inflight.values(),...[...engines.values()].flatMap(candidate=>[...candidate.running.values()])]);await nativeControl?.close();for(const ownerLedger of ledgers.values())if(!ownerLedger.closed)ownerLedger.close();}};
 }catch(error){for(const candidate of engines.values())candidate.drain();await nativeControl?.close().catch(()=>{});for(const ownerLedger of ledgers.values())if(!ownerLedger.closed)ownerLedger.close();throw error;}
}
