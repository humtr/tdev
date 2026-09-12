import {mkdir,realpath,lstat,readFile} from 'node:fs/promises';
import {resolve,join,isAbsolute} from 'node:path';
import {GitRepository} from '../repository/git.mjs';
import {materialize,inspectMaterialization} from '../candidate/materialize.mjs';
import {canonicalJson,bytesDigest} from '../contracts/canonical.mjs';
import {oid,id} from '../contracts/identity.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {boundedCommand} from './command.mjs';
import {managedDefinition} from './controller-identity.mjs';
import {prepareController} from '../validation/controller.mjs';
import {approvedManagedProfile} from '../validation/managed-policy.mjs';
import {approvedReleaseBuildProfile} from '../release/build-profile.mjs';
import {prepareDependencies} from './dependency-artifact.mjs';
import {ManagedSandbox} from './managed-sandbox.mjs';
import {ProductionSandbox} from './production-sandbox.mjs';
import {attemptName} from './podman.mjs';
import {physicalAttempt} from './payload.mjs';
/** The immutable provider-selected workflow checkout is a trusted controller
 * input, not a candidate checkout or canonical repository writer.
 * @param {{workspace:string,stateDirectory:string,commitOid:string,repositoryId:string,repositoryFullName:string,sessionId:string,environment:Record<string,string>,gitExecutable:string,podmanExecutable:string}} options */
export async function hostedExecution(options){
 for(const p of [options.workspace,options.stateDirectory,options.gitExecutable,options.podmanExecutable])requireThat(isAbsolute(p)&&resolve(p)===p&&!/[\0\r\n,]/.test(p),'INVALID_ARGUMENT');oid(options.commitOid);id(options.sessionId);requireThat(/^sha1:[a-f0-9]{40}$/.test(options.commitOid)&&/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(options.repositoryFullName)&&/^[1-9][0-9]*$/.test(options.repositoryId),'INVALID_ARGUMENT');
 requireThat(await realpath(options.workspace)===options.workspace&&(await lstat(join(options.workspace,'.git'))).isDirectory(),'INTEGRITY_FAILURE');await mkdir(options.stateDirectory,{recursive:true,mode:0o700});requireThat(await realpath(options.stateDirectory)===options.stateDirectory&&!options.stateDirectory.startsWith(options.workspace+'/'),'FORBIDDEN');
 const binding={installationId:'approved-hosted-controller',repositoryId:'github-'+options.repositoryId,provider:'github',providerRepositoryId:options.repositoryId,remote:'https://github.com/'+options.repositoryFullName+'.git',ref:'refs/heads/dev2-exec/'+options.sessionId,bindingEpoch:'1',policyDigest:bytesDigest(Buffer.from('approved-controller-object-import'))};
 const environment={PATH:options.environment.PATH??'',HOME:options.stateDirectory,TMPDIR:options.stateDirectory};
 const repository=new GitRepository({directory:join(options.stateDirectory,'approved.git'),executable:options.gitExecutable,environment,bindings:()=>[binding],verifyRemote:async()=>{requireThat(false,'FORBIDDEN','Hosted controller has no canonical provider transport');}});await repository.init();
 const head=await boundedCommand(options.gitExecutable,['-c','core.hooksPath=/dev/null','--git-dir='+join(options.workspace,'.git'),'rev-parse','HEAD'],{environment,timeoutMs:10000,maxBytes:1024});requireThat(head.exitCode===0&&head.stdout.toString().trim()===options.commitOid.slice(5),'INTEGRITY_FAILURE','Workflow checkout is not the approved source');
 const imported=await repository.command(['-c','protocol.file.allow=always','fetch','--no-tags','--no-write-fetch-head','--no-auto-maintenance','--',join(options.workspace,'.git'),options.commitOid.slice(5)],undefined,8192);requireThat(imported.code===0,'EXECUTION_UNAVAILABLE','Approved local Git objects could not be imported');
 const approved=await repository.readCommit(binding,options.commitOid),definition=await managedDefinition(repository,approved.source);
 for(const e of definition.controller.definition.files){const path=join(options.workspace,e.path),stat=await lstat(path);requireThat(stat.isFile()&&!stat.isSymbolicLink()&&await realpath(path)===path&&stat.size<=1048576&&bytesDigest(await readFile(path))===e.digest,'INTEGRITY_FAILURE','Approved checkout code/config changed');}
 const controller=await prepareController({repository,source:approved.source,cacheDirectory:join(options.stateDirectory,'controllers'),expectedDigest:definition.identities.controllerDigest});const dependencies=await prepareDependencies({sourceDirectory:join(options.workspace,'node_modules'),cacheDirectory:join(options.stateDirectory,'dependencies'),lockDigest:definition.identities.dependencyLockDigest});
 let seccompPath='';for(const path of ['/usr/share/containers/seccomp.json','/etc/containers/seccomp.json'])try{if(bytesDigest(await readFile(path))===definition.identities.seccompDigest){seccompPath=path;break;}}catch{}requireThat(seccompPath,'EXECUTION_UNAVAILABLE','Qualified seccomp bytes unavailable');
 const pulled=await boundedCommand(options.podmanExecutable,['pull','--quiet',definition.config.image],{environment:options.environment,timeoutMs:180000,maxBytes:65536});requireThat(pulled.exitCode===0&&!pulled.spawnFailed&&!pulled.timedOut&&!pulled.discardedBytes,'EXECUTION_UNAVAILABLE','Pinned managed image unavailable');
 /** Legacy shape is retained only for explicitly labeled historical qualification.
  * Production supports required profiles plus the single finite internal build.
  * No source or public parameter may select arbitrary argv/resources/execution.
  * @param {import('./session-types.js').Assignment} assignment @param {ReturnType<import('./payload.mjs').decodePayload>} decoded @param {boolean} [production] */
 async function createSandbox(assignment,decoded,production=false){
  const payload=decoded.payload,build=payload.profile.profileId==='release-build',execution=payload.execution,ordered=execution.orderedProfileDigests;
  requireThat(!build||production,'FORBIDDEN','Release build requires production outer execution');
  const approvedProfile=build?approvedReleaseBuildProfile(payload.profile,definition.identities.imageDigest):approvedManagedProfile(payload.profile,definition.policy);
  requireThat((build?ordered.length===1&&ordered[0]===approvedProfile.digest:ordered.length===2&&new Set(ordered).size===2&&ordered[definition.policy.policy.required.indexOf(approvedProfile.profileId)]===approvedProfile.digest)&&canonicalJson(execution)===canonicalJson({...definition.policy.policy.execution,orderedProfileDigests:ordered}),'FORBIDDEN','Candidate selected another installed execution controller');
  const physical=physicalAttempt(assignment),source=payload.source,sourceRoot=join(options.stateDirectory,'attempts',attemptName(physical),'source');requireThat(!source.entries.some(e=>e.path==='node_modules'||e.path.startsWith('node_modules/'))&&source.entries.find(e=>e.path==='package-lock.json')?.contentDigest===definition.identities.dependencyLockDigest,'FORBIDDEN','Candidate dependency override');
  try{await materialize(decoded.repository,source,sourceRoot);}catch(error){if(!error||typeof error!=='object'||!('code'in error)||error.code!=='ENTRY_CONFLICT')throw error;requireThat(await inspectMaterialization(source,sourceRoot)===source.manifestDigest,'INTEGRITY_FAILURE');}
  const Sandbox=production?ProductionSandbox:ManagedSandbox,sandbox=new Sandbox({executable:options.podmanExecutable,environment:options.environment,attemptRoot:join(options.stateDirectory,'attempts'),seccompPath,seccompDigest:definition.identities.seccompDigest,images:{[definition.identities.imageDigest]:definition.config.image},productionSeal:true,controller,dependencies,materialize:async()=>sourceRoot});return {sandbox,sourceRoot};
 }
 /** @param {import('./session-types.js').Assignment} assignment @param {ReturnType<import('./payload.mjs').decodePayload>} decoded */
 async function createProductionSandbox(assignment,decoded){const result=await createSandbox(assignment,decoded,true);requireThat(result.sandbox instanceof ProductionSandbox,'INTEGRITY_FAILURE');return {sandbox:result.sandbox,sourceRoot:result.sourceRoot};}
 return {repository,binding,source:approved.source,definition,controller,dependencies,createSandbox,createProductionSandbox};
}
