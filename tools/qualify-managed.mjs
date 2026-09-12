import {mkdir,realpath,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {hostedExecution} from '../src/execution/hosted.mjs';
import {ManagedRunner} from '../src/execution/managed-runner.mjs';
import {ObjectStore} from '../src/storage/objects.mjs';
import {preparePayload,executionIdentity} from '../src/execution/payload.mjs';
import {recordDigest,canonicalJson} from '../src/contracts/canonical.mjs';
import {requireThat,Dev2Error} from '../src/contracts/errors.mjs';
/** Actual OCI execution of the approved controller against exact Git objects.
 * The transport below is explicitly a qualification fixture. It never connects
 * to native SQLite, mints a production receipt, creates a provider ref, or enrolls
 * a runtime. Native OIDC/lease/receipt eligibility must be proved separately.
 */
export async function main(){
 const e=process.env;requireThat(e.GITHUB_ACTIONS==='true'&&e.GITHUB_EVENT_NAME==='push'&&e.GITHUB_RUN_ATTEMPT==='1'&&e.RUNNER_ENVIRONMENT==='github-hosted'&&process.platform==='linux'&&process.arch==='x64'&&typeof process.getuid==='function'&&process.getuid()!==0,'EXECUTION_UNAVAILABLE');
 const match=/^refs\/heads\/dev2-containment\/([A-Za-z0-9_-]{1,128})$/.exec(e.GITHUB_REF??'');requireThat(match&&/^[a-f0-9]{40}$/.test(e.GITHUB_SHA??'')&&/^[1-9][0-9]*$/.test(e.GITHUB_RUN_ID??''),'UNAUTHORIZED');
 const sessionId=match[1],workspace=await realpath(e.GITHUB_WORKSPACE??''),root=join(await realpath(e.RUNNER_TEMP??''),'dev2-managed-qualification-'+sessionId);await mkdir(root,{recursive:true,mode:0o700});
 const environment={PATH:e.PATH??'',HOME:e.HOME??'',XDG_RUNTIME_DIR:e.XDG_RUNTIME_DIR??'/run/user/'+process.getuid(),LANG:'C.UTF-8'};
 const hosted=await hostedExecution({workspace,stateDirectory:root,commitOid:'sha1:'+e.GITHUB_SHA,repositoryId:e.GITHUB_REPOSITORY_ID??'',repositoryFullName:e.GITHUB_REPOSITORY??'',sessionId,environment,gitExecutable:'/usr/bin/git',podmanExecutable:'/usr/bin/podman'});
 const objects=new ObjectStore(join(root,'qualification-objects'));await objects.init();
 const qualificationIdentity=recordDigest('dev2.qualification-only-assignment.v1',{sourceCommit:e.GITHUB_SHA,controller:hosted.definition.identities.trustedRunnerDigest,runId:e.GITHUB_RUN_ID});
 const report={kind:'real-managed-controller-qualification',schemaVersion:1,status:'failed',sourceCommit:e.GITHUB_SHA,sourceTree:hosted.source.treeOid,sourceManifest:hosted.source.manifestDigest,runId:e.GITHUB_RUN_ID,runAttempt:e.GITHUB_RUN_ATTEMPT,productionValidation:false,productionSeal:false,nativeAssignmentVerified:false,identities:hosted.definition.identities,dependencyArtifactIdentity:hosted.dependencies.identity,qualificationIdentity,profiles:/** @type {Array<Record<string,unknown>>} */([]),startedAt:new Date().toISOString()};
 const output=join(workspace,'.artifacts/managed-controller');await mkdir(output,{recursive:true});
 try{
  for(const profile of hosted.definition.policy.required()){
   const prepared=await preparePayload({repository:hosted.repository,objects,source:hosted.source,resultId:'qualification-'+profile.profileId,profile,execution:hosted.definition.policy.policy.execution});
   const attempt={installationId:'qualification-only',repositoryId:'github-'+e.GITHUB_REPOSITORY_ID,workId:'qualification-'+profile.profileId,actionId:'qualification-'+profile.profileId,attemptId:'qualification-'+profile.profileId,attempt:'1',ownerEpoch:'1'};
   const input={attempt,resultId:'qualification-'+profile.profileId,profileDigest:profile.digest,sourceManifest:hosted.source.manifestDigest,payloadDigest:prepared.payloadDigest,executionDigest:executionIdentity(hosted.definition.policy.policy.execution),deadline:Date.now()+profile.timeoutMs+120000};
   /** @type {import('../src/execution/session-types.js').Assignment} */const assignment={assignmentId:recordDigest('dev2.managed-assignment.v1',{attempt,profileDigest:profile.digest}).slice(7),sessionId,runId:e.GITHUB_RUN_ID??'',leaseId:'qualification-lease-'+profile.profileId,input,inputIdentity:recordDigest('dev2.managed-assignment-input.v1',input),sealDigest:qualificationIdentity,revision:'0',state:'offered',cancelRequested:false,result:null};
   let lost=false,deliveries=0,factories=0,launches=0;const submitted=/** @type {string[]} */([]);
   const fixtureClient=/** @type {import('../src/execution/executor-client.mjs').ExecutorClient} */(/** @type {unknown} */({sessionId,download:async(/** @type {unknown} */ _a,/** @type {string} */ d)=>objects.get(d),acknowledge:async()=>({...assignment,state:'running'}),poll:async()=>({assignment,cancelRequested:false}),upload:async(/** @type {unknown} */ _a,/** @type {Uint8Array} */ b)=>objects.put(b),complete:async(/** @type {import('../src/execution/session-types.js').ExecutionResult} */ result)=>{deliveries++;submitted.push(canonicalJson(result));if(!lost){lost=true;throw new Dev2Error('EXECUTION_UNAVAILABLE','Qualification: lost reply after retained receipt');}return {...assignment,state:'complete',result};}}));
   const options={client:fixtureClient,stateDirectory:join(root,'qualification-journals'),runId:e.GITHUB_RUN_ID??'',sealDigest:qualificationIdentity,trustedRunnerDigest:hosted.definition.identities.trustedRunnerDigest,createSandbox:async(/** @type {import('../src/execution/session-types.js').Assignment} */ a,/** @type {ReturnType<import('../src/execution/payload.mjs').decodePayload>} */ decoded)=>{factories++;const built=await hosted.createSandbox(a,decoded),launch=built.sandbox.launch.bind(built.sandbox);built.sandbox.launch=async(...args)=>{launches++;return launch(...args);};return built;}};
   const started=performance.now();try{await new ManagedRunner(options).execute(assignment);throw Error('Expected bounded response-loss falsifier');}catch(error){requireThat(error instanceof Dev2Error&&error.code==='EXECUTION_UNAVAILABLE'&&lost,'INTEGRITY_FAILURE','Qualification failed before exact result delivery');}
   const result=await new ManagedRunner(options).execute(assignment);requireThat(result&&factories===1&&launches===1&&deliveries===2&&submitted[0]===submitted[1],'INTEGRITY_FAILURE','Response loss repeated physical execution or changed the receipt');
   report.profiles.push({profileId:profile.profileId,assignmentId:assignment.assignmentId,profileDigest:profile.digest,durationMs:Math.ceil(performance.now()-started),factories,launches,deliveries,exactResponseLossReplay:true,result});
   for(const artifact of result.artifacts){const logs=JSON.parse(Buffer.from(await objects.get(artifact)).toString());for(const stream of ['stdout','stderr']){const text=Buffer.from(logs[stream],'base64').toString();console.log(JSON.stringify({kind:'managed-controller-log',profileId:profile.profileId,stream,text:text.slice(-16000)}));}}
   requireThat(result.exitCode===0&&result.signal===null&&!result.deadlineExceeded&&result.stopped&&result.inputDigest===hosted.source.manifestDigest&&result.outputDigest===result.inputDigest,'VALIDATION_FAILED','Actual managed required profile failed');
  }
  report.status='passed';
 }finally{await writeFile(join(output,'report.json'),JSON.stringify({...report,finishedAt:new Date().toISOString()}));console.log(JSON.stringify({...report,finishedAt:new Date().toISOString()}));}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(JSON.stringify({kind:'managed-controller-qualification-failure',code:typeof error?.code==='string'?error.code:'EXECUTION_UNAVAILABLE',message:error instanceof Error?error.message:'Qualification failed'}));process.exitCode=1;});
