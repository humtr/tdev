import { lstat, readFile, realpath, mkdir } from 'node:fs/promises';
import { resolve, join, dirname, isAbsolute } from 'node:path';
import { createRemoteJWKSet } from 'jose';
import { bytesDigest, canonicalJson, parseRecord, recordDigest } from '../contracts/canonical.mjs';
import { requireThat, Dev2Error } from '../contracts/errors.mjs';
import { failure } from '../contracts/envelopes.mjs';
import { capacity, oid, digest, id } from '../contracts/identity.mjs';
import { GitRepository } from '../repository/git.mjs';
import { ContextService } from '../repository/context.mjs';
import { ScopedAuthorization } from '../security/authorization.mjs';
import { accessApplicationVerifier } from '../security/access-application.mjs';
import { Ledger } from '../storage/ledger.mjs';
import { ObjectStore } from '../storage/objects.mjs';
import { AdoptedPolicy } from '../validation/policy.mjs';
import { ResultPreparer } from '../integration/prepare.mjs';
import { ExactIntegrator } from '../integration/effects.mjs';
import { GitRefTransport } from '../integration/git-ref.mjs';
import { DevelopmentEngine } from './engine.mjs';
import { DevelopmentApplication } from './application.mjs';
import { DeviceConnection } from '../transport/device.mjs';
import { SCHEMA_DIGEST } from '../mcp/outputs.mjs';
import { workersDevOrigin, selectExecutionVariant } from './environment.mjs';
/** @typedef {import('../contracts/ports.js').Json} Json */
/** @typedef {{[key:string]:Json}} RecordValue */
/** @typedef {{schemaVersion:1,edge:import('../edge/types.js').EdgeConfig,stateDirectory:string,gitExecutable:string,githubTokenFile:string|null,gitAskpassFile:string|null,deviceKeyFile:string,cursorKeyFile:string,capacity:number,actor:string,runtime:{bundleDigest:string,schemaDigest:string,sourceCommitOid:string,sourceTreeOid:string},toolchain:{executionVariants:import('./environment.mjs').ExecutionVariant[]},policy:ConstructorParameters<typeof AdoptedPolicy>[0]}} NativeConfig */
/** Private installation state is outside source/candidates and refuses aliases or
 * permissive modes. Actual credentials are never embedded in repository files.
 * @param {string} filename @param {number} [maximum] */
export async function privateFile(filename,maximum=1048576){
 requireThat(isAbsolute(filename),'INVALID_ARGUMENT');const path=resolve(filename),before=await lstat(path);
 requireThat(before.isFile()&&!before.isSymbolicLink()&&(before.mode&0o077)===0&&before.size<=maximum&&await realpath(path)===path,'FORBIDDEN','Unsafe installation file');
 const bytes=await readFile(path),after=await lstat(path);requireThat(before.size===after.size&&before.mtimeMs===after.mtimeMs&&bytes.length===before.size,'INTEGRITY_FAILURE');return bytes;
}
/** @param {string} filename */
export async function readNativeConfig(filename){return /** @type {NativeConfig} */(parseRecord(await privateFile(filename),1048576));}
/** No untrusted execution implementation is selected in Phase A. Both launch and
 * eligibility are fail-closed, independently of the engine's pre-dispatch gate.
 * @type {import('../contracts/ports.js').ValidationPort} */
const unavailableValidation={async validate(){throw new Dev2Error('EXECUTION_UNAVAILABLE','Managed execution and receipt attestation are not sealed');},async eligible(){return false;}};
/** @param {NativeConfig} config @param {{log?:(event:string)=>void}} [options] */
export async function createNativeInstallation(config,options={}){
 requireThat(config.schemaVersion===1&&config.runtime.schemaDigest===SCHEMA_DIGEST,'INTEGRITY_FAILURE','Installation/schema mismatch');
 const edge=config.edge,binding=edge.binding;workersDevOrigin(edge.origin);capacity(config.capacity);id(edge.installationId);id(edge.deviceId);
 oid(config.runtime.sourceCommitOid);oid(config.runtime.sourceTreeOid);digest(config.runtime.bundleDigest);
 requireThat(edge.installationId===binding.installationId&&binding.provider==='github'&&/^\d+$/.test(binding.providerRepositoryId),'FORBIDDEN');
 const remote=new URL(binding.remote);requireThat(remote.protocol==='https:'&&remote.hostname==='github.com'&&!remote.username&&!remote.password&&!remote.search&&!remote.hash&&/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.git$/.test(remote.pathname),'FORBIDDEN');
 const repositoryName=remote.pathname.slice(1,-4),policy=new AdoptedPolicy(config.policy);
 requireThat(policy.policy.digest===binding.policyDigest&&policy.policy.execution.environmentClass==='github-hosted-unsealed','INTEGRITY_FAILURE');
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
  /** @type {Record<string,string>} */const headers={'accept':'application/vnd.github+json','user-agent':'dev2-native-control'};if(token)headers.authorization='Bearer '+token;
  let response;try{response=await fetch('https://api.github.com/repos/'+repositoryName,{headers,redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw new Dev2Error('EXECUTION_UNAVAILABLE','Repository identity provider unavailable');}
  requireThat(response.ok,'EXECUTION_UNAVAILABLE','Repository identity provider unavailable');const metadata=/** @type {{id?:number,full_name?:string}} */(await response.json());
  requireThat(String(metadata.id)===binding.providerRepositoryId&&metadata.full_name?.toLowerCase()===repositoryName.toLowerCase(),'FORBIDDEN','Repository provider identity changed');providerVerifiedAt=Date.now();
 }});await repository.init();
 const objects=new ObjectStore(join(state,'objects'));await objects.init();
 const authorization=new ScopedAuthorization({issuer:edge.issuer,audience:edge.origin,bindings:()=>[binding],grants:()=>edge.grants});
 const verify=accessApplicationVerifier({profile:'access-application',issuer:edge.issuer,applicationAudience:edge.applicationAudience,resourceOrigin:edge.origin,applicationCapabilities:edge.applicationCapabilities},createRemoteJWKSet(new URL(edge.issuer+'/cdn-cgi/access/certs')));
 const ledger=new Ledger(join(state,'work.sqlite'),binding);
 const context=new ContextService({repository,objects,authorization,tokenKey:cursorKey});
 const remoteTransport=new GitRefTransport(repository,binding);
 const engine=new DevelopmentEngine({binding,ledger,repository,context,authorization,remote:remoteTransport,
  validation:()=>unavailableValidation,policy:()=>policy,capacity:config.capacity,executionAvailable:()=>false,
  verifyLineage:head=>repository.isAncestor(binding,config.runtime.sourceCommitOid,head),actor:config.actor});

 /** @type {{connected:boolean,connectionId:string|null,connectedAt:string|null,lastMessageAt:string|null}} */let connection={connected:false,connectionId:null,connectedAt:null,lastMessageAt:null};
 /** @type {import('../edge/types.js').DeviceHello['edge']|null} */let activeEdge=null;
 /** @type {Json|null} */let probeSummary=null;
 const identity=async()=>{
  /** @type {{state:string,commitOid:string|null,treeOid:string|null,observedAt:string|null}} */let source={state:'unavailable',commitOid:null,treeOid:null,observedAt:null};
  try{const observed=await repository.resolve(binding),commit=await repository.readCommit(binding,observed.head);source={state:'current',commitOid:observed.head,treeOid:commit.source.treeOid,observedAt:observed.observedAt};}catch{}
  return {installationId:edge.installationId,phase:'bootstrap',origin:edge.origin,source,
   edge:activeEdge??{versionId:null,bundleDigest:null,sourceCommitOid:null,schemaDigest:SCHEMA_DIGEST,observedAt:null},
   device:{deviceId:edge.deviceId,bundleDigest:config.runtime.bundleDigest,sourceCommitOid:config.runtime.sourceCommitOid,schemaDigest:SCHEMA_DIGEST,ownerEpoch:ledger.ownerEpoch,nodeVersion:process.versions.node,platform:process.platform,arch:process.arch,connected:connection.connected,connectionNonce:connection.connectionId,connectedAt:connection.connectedAt,lastMessageAt:connection.lastMessageAt},
   managedExecution:{state:'unsealed',sealDigest:null,activeSessions:0,reservedSessions:0,reason:'Hosted execution, containment and receipt attestation are Phase B frontiers'},
   activation:{phase:'bootstrap',activationId:null,activeReleaseId:null,stagedReleaseId:null,expectedReleaseId:null,writerStopped:!engine.accepting&&engine.running.size===0,deadline:null}};
 };
 const releaseId=recordDigest('dev2.bootstrap-installed-bundle.v1',{...config.runtime});
 const app=new DevelopmentApplication({engine,releaseId,artifacts:objects,deploymentSealed:false,runtimeIdentity:identity});
 /** Installation-key diagnostics are fixed read-only local operator checks. They
  * cannot select a tool, path, subject or mutation and are not human OAuth proof.
  * @returns {Promise<Json>} */
 const readProbe=async()=>{
  const enrolled=edge.grants.find(g=>g.repositoryId===binding.repositoryId&&g.capabilities.includes('repository.read'));requireThat(enrolled,'FORBIDDEN');
  const principal={subject:enrolled.subject,issuer:edge.issuer,audience:edge.origin,expiresAt:Date.now()+60000,tokenCapabilities:/** @type {const} */(['repository.read'])};
  const current=/** @type {RecordValue} */(await app.invoke(principal,'dev_context',{apiVersion:1,repository:'self'}));
  let read=/** @type {Json} */(null);if(current.ok===true){const data=/** @type {RecordValue} */(current.data),snapshot=/** @type {RecordValue} */(data.snapshot);
   read=await app.invoke(principal,'dev_read',{apiVersion:1,target:{snapshotId:snapshot.snapshotId,freshness:'current'},queries:[{kind:'file',path:'AGENTS.md'},{kind:'file',path:'WORKBOARD.md'}],maxReturnBytes:65536});}
  const observed=await app.invoke(principal,'dev_observe',{apiVersion:1,selector:{runtime:true}});
  const open=await app.invoke(principal,'dev_observe',{apiVersion:1,selector:{open:true},limit:8});
  const ok=current.ok===true&&read!==null&&typeof read==='object'&&!Array.isArray(read)&&read.ok===true&&observed.ok===true&&open.ok===true;
  probeSummary={ok,observedAt:new Date().toISOString(),authenticationMode:'installation-read-probe',humanOAuth:false,repositoryId:binding.repositoryId,currentHead:current.ok===true?/** @type {RecordValue} */(/** @type {RecordValue} */(current.data).snapshot).commitOid:null,schemaDigest:SCHEMA_DIGEST};
  return {summary:probeSummary,context:current,read,runtime:observed,open};
 };
 const device=new DeviceConnection({origin:edge.origin,installationId:edge.installationId,secret:deviceKey,
  invoke:async(tool,args,assertion)=>app.invoke(await verify(assertion),tool,args),probe:readProbe,
  presence:()=>({schemaDigest:SCHEMA_DIGEST,sourceCommitOid:config.runtime.sourceCommitOid,bundleDigest:config.runtime.bundleDigest,ownerEpoch:ledger.ownerEpoch,nodeVersion:process.versions.node,platform:process.platform,arch:process.arch,connectedAt:connection.connectedAt,lastMessageAt:connection.lastMessageAt,probe:probeSummary}),
  onHello:hello=>{activeEdge=hello.edge;},onState:value=>{connection=value;},log:options.log});
 engine.pump();
 return {app,engine,ledger,repository,device,readProbe,identity,releaseId,async close(){engine.drain();device.stop();await Promise.allSettled([...device.inflight.values(),...engine.running.values()]);ledger.close();}};
}
