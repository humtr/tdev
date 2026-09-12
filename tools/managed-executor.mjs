import {realpath,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {requireThat} from '../src/contracts/errors.mjs';
import {hostedExecution} from '../src/execution/hosted.mjs';
import {ExecutorClient} from '../src/execution/executor-client.mjs';
import {ManagedRunner} from '../src/execution/managed-runner.mjs';
import {HostedSession} from '../src/execution/hosted-session.mjs';
import {oidcToken} from '../src/execution/oidc-token.mjs';
/** Approved workflow entrypoint only: no user-selected source, command, model or
 * provider effect. Native assignment is mandatory; this host cannot enroll itself. */
export async function main(){
 const e=process.env;requireThat(process.platform==='linux'&&process.arch==='x64'&&typeof process.getuid==='function'&&process.getuid()!==0&&e.GITHUB_ACTIONS==='true'&&e.GITHUB_EVENT_NAME==='push'&&e.GITHUB_RUN_ATTEMPT==='1'&&e.RUNNER_ENVIRONMENT==='github-hosted','EXECUTION_UNAVAILABLE','Approved hosted launch required');
 const ref=e.GITHUB_REF??'',match=/^refs\/heads\/dev2-exec\/([A-Za-z0-9_-]{1,128})$/.exec(ref);requireThat(match&&/^[a-f0-9]{40}$/.test(e.GITHUB_SHA??'')&&/^[1-9][0-9]*$/.test(e.GITHUB_RUN_ID??''),'UNAUTHORIZED');
 const sessionId=match[1],workspace=await realpath(e.GITHUB_WORKSPACE??''),root=join(await realpath(e.RUNNER_TEMP??''),'dev2-executor-'+sessionId);await mkdir(root,{recursive:true,mode:0o700});
 const environment={PATH:e.PATH??'',HOME:e.HOME??'',XDG_RUNTIME_DIR:e.XDG_RUNTIME_DIR??'/run/user/'+process.getuid(),LANG:'C.UTF-8'};
 const hosted=await hostedExecution({workspace,stateDirectory:root,commitOid:'sha1:'+e.GITHUB_SHA,repositoryId:e.GITHUB_REPOSITORY_ID??'',repositoryFullName:e.GITHUB_REPOSITORY??'',sessionId,environment,gitExecutable:'/usr/bin/git',podmanExecutable:'/usr/bin/podman'});
 const client=new ExecutorClient({origin:hosted.definition.config.origin,sessionId,token:oidcToken({origin:hosted.definition.config.origin,url:e.ACTIONS_ID_TOKEN_REQUEST_URL??'',token:e.ACTIONS_ID_TOKEN_REQUEST_TOKEN??''})});
 const session=new HostedSession({client,stateDirectory:join(root,'session'),expected:{commit:e.GITHUB_SHA??'',runId:e.GITHUB_RUN_ID??'',repositoryId:e.GITHUB_REPOSITORY_ID??'',repositoryFullName:e.GITHUB_REPOSITORY??'',trustedRunnerDigest:hosted.definition.identities.trustedRunnerDigest},deadline:Date.now()+hosted.definition.config.sessionLifetimeMs,idleTimeoutMs:hosted.definition.config.idleTimeoutMs,createRunner:sealDigest=>new ManagedRunner({client,stateDirectory:join(root,'receipts'),runId:e.GITHUB_RUN_ID??'',sealDigest,trustedRunnerDigest:hosted.definition.identities.trustedRunnerDigest,createSandbox:hosted.createSandbox})});
 const result=await session.run();console.log(JSON.stringify({kind:'managed-session-terminal',sessionId,runId:e.GITHUB_RUN_ID,sourceCommit:e.GITHUB_SHA,result,metrics:client.metrics}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(JSON.stringify({kind:'managed-session-failure',code:typeof error?.code==='string'?error.code:'EXECUTION_UNAVAILABLE'}));process.exitCode=1;});
