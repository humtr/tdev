import {lstat,readFile,realpath,mkdir} from 'node:fs/promises';
import {resolve,join,dirname,isAbsolute} from 'node:path';
import {createRemoteJWKSet} from 'jose';
import {bytesDigest,canonicalJson,parseRecord,recordDigest} from '../contracts/canonical.mjs';
import {requireThat,Dev2Error} from '../contracts/errors.mjs';
import {failure} from '../contracts/envelopes.mjs';
import {capacity,oid,digest,id} from '../contracts/identity.mjs';
import {GitRepository} from '../repository/git.mjs';
import {ContextService} from '../repository/context.mjs';
import {ScopedAuthorization} from '../security/authorization.mjs';
import {accessApplicationVerifier} from '../security/access-application.mjs';
import {Ledger} from '../storage/ledger.mjs';
import {ObjectStore} from '../storage/objects.mjs';
import {AdoptedPolicy} from '../validation/policy.mjs';
import {ResultPreparer} from '../integration/prepare.mjs';
import {GitRefTransport} from '../integration/git-ref.mjs';
import {DurableGitSender} from '../integration/sender.mjs';
import {GitHubCanonicalBoundary} from '../integration/github-boundary.mjs';
import {DevelopmentEngine} from './engine.mjs';
import {DevelopmentApplication} from './application.mjs';
import {createManagedControl} from './managed.mjs';
import {NativeReleaseControl} from '../release/native-control.mjs';
import {NativeReleaseRuntime} from './release.mjs';
import {privateDirectory} from '../release/private-files.mjs';
import {DeviceConnection} from '../transport/device.mjs';
import {SCHEMA_DIGEST} from '../mcp/outputs.mjs';
import {workersDevOrigin,selectExecutionVariant} from './environment.mjs';
/** @typedef {import('../contracts/ports.js').Json} Json */
/** @typedef {{[key:string]:Json}} RecordValue */
/** @typedef {{schemaVersion:1,edge:import('../edge/types.js').EdgeConfig,stateDirectory:string,gitExecutable:string,githubTokenFile:string|null,gitAskpassFile:string|null,deviceKeyFile:string,cursorKeyFile:string,capacity:number,actor:string,runtime:{bundleDigest:string,schemaDigest:string,sourceCommitOid:string,sourceTreeOid:string},toolchain:{executionVariants:import('./environment.mjs').ExecutionVariant[]},policy:ConstructorParameters<typeof AdoptedPolicy>[0],managedEnrollmentFile?:string|null,productionEnrollmentFile?:string|null,releaseControl?:import('../release/device-configs.mjs').ReleaseControl,releaseArtifactDirectory?:string,gitSender?:{configurationFile:string,pythonExecutable:string,helperFile:string}}} NativeConfig */
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
const unavailableValidation={async validate(){throw new Dev2Error('EXECUTION_UNAVAILABLE','Managed execution and receipt attestation are not sealed');},async eligible(){return false;}};
/** @param {NativeConfig} config @param {{log?:(event:string)=>void,commissioningIntent?:import('./production-enrollment.mjs').ProductionIntent}} [options] */
export async function createNativeInstallation(config,options={}){
 requireThat(config.schemaVersion===1&&config.runtime.schemaDigest===SCHEMA_DIGEST,'INTEGRITY_FAILURE','Installation/schema mismatch');
 const edge=config.edge,binding=edge.binding;workersDevOrigin(edge.origin);capacity(config.capacity);id(edge.installationId);id(edge.deviceId);
 requireThat(!config.productionEnrollmentFile||config.managedEnrollmentFile,'EXECUTION_UNAVAILABLE','Production enrollment requires historical managed enrollment');
 requireThat(!!config.releaseControl===!!config.releaseArtifactDirectory,'EXECUTION_UNAVAILABLE','Incomplete installed release configuration');
 if(config.releaseArtifactDirectory)await privateDirectory(config.releaseArtifactDirectory);
 const control=config.releaseControl?await new NativeReleaseControl({config:config.releaseControl,...binding,runtime:config.runtime}).init():null;
 const admission=control?await control.startupAdmission():null;
 /** @type {NativeReleaseRuntime|null} */let release=null;
 oid(config.runtime.sourceCommitOid);oid(config.runtime.sourceTreeOid);digest(config.runtime.bundleDigest);
 requireThat(edge.installationId===binding.installationId&&binding.provider==='github'&&/^[1-9][0-9]*$/.test(binding.providerRepositoryId),'FORBIDDEN');
 const remote=new URL(binding.remote);requireThat(remote.protocol==='https:'&&remote.hostname==='github.com'&&!remote.username&&!remote.password&&!remote.search&&!remote.hash&&/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.git$/.test(remote.pathname),'FORBIDDEN');
 const repositoryName=remote.pathname.slice(1,-4),initialPolicy=new AdoptedPolicy(config.policy);
 requireThat(initialPolicy.policy.digest===binding.policyDigest&&initialPolicy.policy.execution.environmentClass==='github-hosted-unsealed','INTEGRITY_FAILURE');
 selectExecutionVariant(config.toolchain,{platform:process.platform,arch:process.arch,node:process.versions.node,sqlite:process.versions.sqlite??null});
 requireThat(isAbsolute(config.stateDirectory)&&isAbsolute(config.gitExecutable),'INVALID_ARGUMENT');
 await mkdir(config.stateDirectory,{recursive:true,mode:0o700});requireThat(await realpath(config.stateDirectory)===resolve(config.stateDirectory)&&(await lstat(config.stateDirectory)).isDirectory(),'INTEGRITY_FAILURE');
 const token=config.githubTokenFile?(await privateFile(config.githubTokenFile,8192)).toString().trim():null;
 const deviceKey=(await privateFile(config.deviceKeyFile,1024)).toString().trim(),cursorKey=await privateFile(config.cursorKeyFile,1024);
 requireThat(bytesDigest(Buffer.from(deviceKey))===edge.deviceCredentialDigest&&cursorKey.length>=32,'INTEGRITY_FAILURE');
 const state=resolve(config.stateDirectory);await mkdir(join(state,'home'),{recursive:true,mode:0o700});await mkdir(join(state,'tmp'),{recursive:true,mode:0o700});
 /** @type {Record<string,string>} */const gitEnvironment={PATH:dirname(config.gitExecutable),HOME:join(state,'home'),TMPDIR:join(state,'tmp'),LANG:'C.UTF-8'};
 if(config.githubTokenFile&&config.gitAskpassFile){await privateFile(config.gitAskpassFile,16384);gitEnvironment.GIT_ASKPASS=config.gitAskpassFile;gitEnvironment.DEV2_GITHUB_TOKEN_FILE=config.githubTokenFile;}
 let providerVerifiedAt=0;
 const repository=new GitRepository({directory:join(state,'repository.git'),executable:config.gitExecutable,environment:gitEnvironment,bindings:()=>[binding],verifyRemote:async()=>{
  if(Date.now()-providerVerifiedAt<60000)return;
  /** @type {Record<string,string>} */const headers={accept:'application/vnd.github+json','user-agent':'dev2-native-control'};if(token)headers.authorization='Bearer '+token;
  let response;try{response=await fetch('https://api.github.com/repos/'+repositoryName,{headers,redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw new Dev2Error('EXECUTION_UNAVAILABLE','Repository identity provider unavailable');}
  requireThat(response.ok,'EXECUTION_UNAVAILABLE','Repository identity provider unavailable');const metadata=/** @type {{id?:number,full_name?:string}} */(await response.json());
  requireThat(String(metadata.id)===binding.providerRepositoryId&&metadata.full_name===repositoryName,'FORBIDDEN','Repository provider identity changed');providerVerifiedAt=Date.now();
 }});await repository.init();
 const objects=new ObjectStore(join(state,'objects'));await objects.init();
 const authorization=new ScopedAuthorization({issuer:edge.issuer,audience:edge.origin,bindings:()=>[binding],grants:()=>edge.grants});
 const verify=accessApplicationVerifier({profile:'access-application',issuer:edge.issuer,applicationAudience:edge.applicationAudience,resourceOrigin:edge.origin,applicationCapabilities:edge.applicationCapabilities},createRemoteJWKSet(new URL(edge.issuer+'/cdn-cgi/access/certs')));
 const ledger=new Ledger(join(state,'work.sqlite'),binding),context=new ContextService({repository,objects,authorization,tokenKey:cursorKey});
 /** @type {Awaited<ReturnType<typeof createManagedControl>>|null} */let managed=null;
 /** @type {DevelopmentEngine|null} */let currentEngine=null;
 /** @type {DurableGitSender|null} */let sender=null;
 /** @type {GitHubCanonicalBoundary|null} */let guard=null;
 /** @type {Awaited<ReturnType<NativeReleaseControl['serve']>>|null} */let nativeControl=null;
 try{
 const transport=new GitRefTransport(repository,binding);
 const verifyLineage=(/** @type {string} */ head)=>repository.isAncestor(binding,config.runtime.sourceCommitOid,head);
 const integrationLineage=async(/** @type {string} */ head)=>{requireThat(guard,'EXECUTION_UNAVAILABLE','Canonical monotonic boundary is not enrolled');await guard.verify();return verifyLineage(head);};
 const remoteTransport={resolve:()=>transport.resolve(),fetch:(/** @type {string} */ head)=>transport.fetch(head),compareUpdate:async(/** @type {import('../contracts/ports.js').Effect} */ effect)=>{requireThat(sender&&guard,'EXECUTION_UNAVAILABLE','Native canonical writer is not installed');await guard.verify();return sender.compareUpdate(effect);}};
 if(config.managedEnrollmentFile){
  requireThat(token&&config.gitSender&&config.githubTokenFile&&config.gitAskpassFile,'EXECUTION_UNAVAILABLE','Private managed/native writer configuration is incomplete');
  const enrollment=/** @type {import('./enrollment.mjs').Enrollment} */(parseRecord(await privateFile(config.managedEnrollmentFile,4194304),4194304));
  const productionEnrollment=config.productionEnrollmentFile?/** @type {import('./production-enrollment.mjs').ProductionEnrollment} */(parseRecord(await privateFile(config.productionEnrollmentFile,1048576),1048576)):undefined;
  const installed=await repository.readCommit(binding,config.runtime.sourceCommitOid);requireThat(installed.source.treeOid===config.runtime.sourceTreeOid,'INTEGRITY_FAILURE','Installed source identity changed');
  const helper=installed.source.entries.find(e=>e.path==='tools/git-sender.py'),helperPath=resolve(config.gitSender.helperFile),helperInfo=await lstat(helperPath);
  requireThat(helper&&helper.mode==='100644'&&helperInfo.isFile()&&!helperInfo.isSymbolicLink()&&await realpath(helperPath)===helperPath&&bytesDigest(await readFile(helperPath))===helper.contentDigest,'INTEGRITY_FAILURE','Canonical sender helper differs from installed source');
  const senderConfig=parseRecord(await privateFile(config.gitSender.configurationFile,65536),65536),senderState=join(state,'git-senders');
  const expectedSender={schemaVersion:1,stateDirectory:senderState,repositoryId:binding.repositoryId,bindingEpoch:binding.bindingEpoch,ref:binding.ref,provider:binding.provider,remote:binding.remote,gitExecutable:config.gitExecutable,repositoryDirectory:join(state,'repository.git'),environment:gitEnvironment,timeoutMs:30000};
  requireThat(canonicalJson(senderConfig)===canonicalJson(expectedSender),'INTEGRITY_FAILURE','Canonical sender private scope differs');
  sender=new DurableGitSender({ledger,stateDirectory:senderState,configurationPath:config.gitSender.configurationFile,pythonExecutable:config.gitSender.pythonExecutable,helperPath,environment:gitEnvironment});
  guard=new GitHubCanonicalBoundary({binding,repositoryFullName:repositoryName,repositoryOwnerId:enrollment.repositoryOwnerId,identity:enrollment.canonicalRuleset,token});
managed=await createManagedControl({enrollment,productionEnrollment,commissioningIntent:options.commissioningIntent,admission,installationSealDigest:config.releaseControl?.installationSealDigest,runtime:config.runtime,origin:edge.origin,ledger,binding,repository,objects,authorization,initialPolicy,remote:remoteTransport,verifyLineage:integrationLineage,token,receiptSecret:cursorKey,capacity:config.capacity,wake:()=>currentEngine?.pump()});
 }else requireThat(!ledger.transact(tx=>tx.get("SELECT value FROM meta WHERE key='policy.enrollment'")),'EXECUTION_UNAVAILABLE','Retained managed installation cannot silently fall back to bootstrap');
 const policy=()=>managed?.policyState.current??initialPolicy;
 /** Run tests against the exact existing candidate, not a silently recomposed
  * latest-head tree. Verify its original base is still canonical before freezing
  * the isolated result. Required integration later prepares against a fresh HEAD.
  * @param {import('../contracts/ports.js').Work} work @param {import('../contracts/ports.js').Attempt} attempt @param {import('../contracts/ports.js').Profile} profile */
 const runProfile=async(work,attempt,profile)=>{
  requireThat(managed,'EXECUTION_UNAVAILABLE');const live=await transport.resolve();await transport.fetch(live.head);requireThat(work.baseCommitOid===live.head||await repository.isAncestor(binding,work.baseCommitOid,live.head),'STALE_BASE');
  const preparer=new ResultPreparer({ledger,repository,binding,verifyLineage:async head=>head===work.baseCommitOid,actor:config.actor}),result=await preparer.prepare(work,work.baseCommitOid,policy().policy.execution,binding.policyDigest);
  currentEngine?.assertAttempt(attempt);const receipt=await managed.poolFor(result.execution).run(result,attempt,profile);return {exitCode:receipt.exitCode,signal:receipt.signal,inputDigest:receipt.inputDigest,outputDigest:receipt.outputDigest};
 };
 const activeManaged=managed;
 const engine=new DevelopmentEngine({binding,ledger,repository,context,authorization,remote:remoteTransport,validation:()=>managed?.validation()??unavailableValidation,policy,capacity:config.capacity,executionAvailable:()=>managed!==null,operationAvailable:op=>op.startsWith('release.')?release?.available()===true:true,integrationLineage,verifyLineage,actor:config.actor,
  ...(activeManaged?{runProfile,
   cancelAttempt:async(/** @type {import('../contracts/ports.js').Attempt} */ a)=>{await activeManaged.production?.builder?.cancel(a.actionId);return activeManaged.attemptPool(a).cancel(a);},
   attemptStopped:(/** @type {import('../contracts/ports.js').Attempt} */ a)=>activeManaged.attemptPool(a).stopped(a),
   senderStopped:(/** @type {import('../contracts/ports.js').Effect} */ e)=>{requireThat(sender,'EXECUTION_UNAVAILABLE');return sender.stopped(e);},
   cancelSender:(/** @type {import('../contracts/ports.js').Effect} */ e)=>{requireThat(sender,'EXECUTION_UNAVAILABLE');return sender.cancel(e);},
   specialRecovery:async(/** @type {import('../contracts/ports.js').Action} */ action)=>{if(action.operation==='policy.adopt')return activeManaged.policyState.recovery(action);requireThat(release&&release.available(),'EXECUTION_UNAVAILABLE','Release recovery capability is unavailable');return release.recovery(action);},
   special:async(/** @type {import('../contracts/ports.js').Principal} */ principal,/** @type {import('./engine.mjs').Input} */ input,/** @type {string} */ actionId)=>{if(input.op==='policy.adopt')return activeManaged.policyState.adopt(principal,{integratedCommit:input.integratedCommit??'',policyPath:input.policyPath??'',expectedPolicyDigest:input.expectedPolicyDigest??'',newPolicyDigest:input.newPolicyDigest??''},actionId);requireThat(release&&release.available(),'EXECUTION_UNAVAILABLE','Paired release capability is unavailable');return release.execute(principal,input,actionId);}
  }:{})});currentEngine=engine;
 /** @type {{connected:boolean,connectionId:string|null,connectedAt:string|null,lastMessageAt:string|null}} */let connection={connected:false,connectionId:null,connectedAt:null,lastMessageAt:null};
 /** @type {import('../edge/types.js').DeviceHello['edge']|null} */let activeEdge=null;
 /** @type {Json|null} */let probeSummary=null;
 nativeControl=control?await control.serve({engine,connection:()=>({connected:connection.connected,edge:activeEdge})}):null;
 if(managed?.production?.builder&&control&&config.releaseArtifactDirectory){
  const p=managed.production;requireThat(p.builder,'EXECUTION_UNAVAILABLE');
  release=await new NativeReleaseRuntime({ledger,binding,objects,artifactDirectory:config.releaseArtifactDirectory,authority:managed.authority,builder:p.builder,control,authorize:(principal,paths)=>authorization.authorize(principal,binding,'runtime.activate',paths),runtime:config.runtime,enrollmentSealDigest:p.enrolled.sealDigest,trustedRunnerDigest:p.definition.identities.trustedRunnerDigest,workflowDigest:p.definition.identities.workflowDigest}).init();
 }
 const identity=async()=>{
  /** @type {{state:string,commitOid:string|null,treeOid:string|null,observedAt:string|null}} */let source={state:'unavailable',commitOid:null,treeOid:null,observedAt:null};
  try{const observed=await repository.resolve(binding),commit=await repository.readCommit(binding,observed.head);source={state:'current',commitOid:observed.head,treeOid:commit.source.treeOid,observedAt:observed.observedAt};}catch{}
  if(release){if(connection.connected)await release.refresh();else release.invalidate();}
  return {installationId:edge.installationId,phase:managed?'qualified':'bootstrap',origin:edge.origin,source,edge:activeEdge??{versionId:null,bundleDigest:null,sourceCommitOid:null,schemaDigest:SCHEMA_DIGEST,observedAt:null},device:{deviceId:edge.deviceId,bundleDigest:config.runtime.bundleDigest,sourceCommitOid:config.runtime.sourceCommitOid,schemaDigest:SCHEMA_DIGEST,ownerEpoch:ledger.ownerEpoch,nodeVersion:process.versions.node,platform:process.platform,arch:process.arch,connected:connection.connected,connectionNonce:connection.connectionId,connectedAt:connection.connectedAt,lastMessageAt:connection.lastMessageAt},managedExecution:managed?.identity()??{state:'unsealed',sealDigest:null,activeSessions:0,reservedSessions:0,reason:'Private qualified execution enrollment is absent'},activation:release?.projection()??{phase:'bootstrap',activationId:null,activeReleaseId:null,stagedReleaseId:null,expectedReleaseId:null,writerStopped:!engine.accepting&&engine.running.size===0,deadline:null}};
 };
 const releaseId=recordDigest('dev2.bootstrap-installed-bundle.v1',{...config.runtime});
 const app=new DevelopmentApplication({engine,releaseId,artifacts:objects,deploymentSealed:()=>release?.deploymentSealed===true,currentReleaseId:()=>release?.releaseId??releaseId,runtimeIdentity:identity,sessions:()=>managed?.views()??[]});
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
const device=new DeviceConnection({origin:edge.origin,installationId:edge.installationId,secret:deviceKey,invoke:async(tool,args,assertion)=>app.invoke(await verify(assertion),tool,args),executor:async(args,assertion)=>managed?managed.endpoint.invoke(args,assertion):failure(new Dev2Error('EXECUTION_UNAVAILABLE','Managed execution is not enrolled')),probe:readProbe,presence:()=>({schemaDigest:SCHEMA_DIGEST,sourceCommitOid:config.runtime.sourceCommitOid,bundleDigest:config.runtime.bundleDigest,ownerEpoch:ledger.ownerEpoch,nodeVersion:process.versions.node,platform:process.platform,arch:process.arch,connectedAt:connection.connectedAt,lastMessageAt:connection.lastMessageAt,probe:probeSummary}),onHello:hello=>{activeEdge=hello.edge;},onState:value=>{connection=value;if(!value.connected)release?.invalidate();},log:options.log});
 if(options.commissioningIntent)engine.drain();else engine.pump();return {app,engine,ledger,repository,device,managed,sender,guard,control,release,readProbe,identity,releaseId,async close(){engine.drain();release?.invalidate();device.stop();await Promise.allSettled([...device.inflight.values(),...engine.running.values()]);await nativeControl?.close();ledger.close();}};
 }catch(error){currentEngine?.drain();await nativeControl?.close().catch(()=>{});ledger.close();throw error;}
}
