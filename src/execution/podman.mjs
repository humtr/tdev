import { isAbsolute, resolve, sep } from 'node:path';
import { readFile, realpath, lstat } from 'node:fs/promises';
import { recordDigest, bytesDigest } from '../contracts/canonical.mjs';
import { boundedProviderJson as parseRecord } from './provider-json.mjs';
import { requireThat, Dev2Error } from '../contracts/errors.mjs';
import { id, revision, digest } from '../contracts/identity.mjs';
import { repositoryPath } from '../security/paths.mjs';
import { boundedCommand } from './command.mjs';
/** @typedef {import('../contracts/ports.js').Attempt} Attempt */
/** @typedef {import('../contracts/ports.js').SandboxPort} SandboxPort */
/** @typedef {import('../contracts/ports.js').Profile} Profile */
/** @typedef {import('../contracts/ports.js').SourceTree} SourceTree */
/** @typedef {import('../contracts/ports.js').SandboxObservation} Observation */
/** @typedef {import('./command.mjs').CommandResult} CommandResult */
/** @param {Attempt} attempt */
export function attemptName(attempt) {
  for(const k of ['installationId','repositoryId','workId','actionId','attemptId']) id(attempt[/** @type {'workId'} */(k)]);
  revision(attempt.attempt);revision(attempt.ownerEpoch);
  return 'dev2-'+recordDigest('dev2.sandbox-attempt.v1',attempt).slice(7);
}
/** @param {Attempt} attempt @param {Observation['state']} state @returns {Observation} */
const observation=(attempt,state)=>({state,attempt,exitCode:null,signal:null,artifacts:[]});

/** All installation fields are trusted sealed configuration, never MCP arguments.
 * @typedef {{executable:string,environment:Record<string,string>,attemptRoot:string,seccompPath:string,seccompDigest:string,
 * images:Readonly<Record<string,string>>,productionSeal:boolean,
 * materialize:(attempt:Attempt,source:SourceTree)=>Promise<string>,
 * command?:(executable:string,argv:readonly string[],options:{environment:Record<string,string>,timeoutMs:number,maxBytes:number,killGraceMs?:number})=>Promise<CommandResult>}} Options
 */

/** @param {Attempt} attempt @param {Profile} profile @param {string} sourceRoot @param {Options} options @param {string} [sourceManifest] */
export function createArguments(attempt,profile,sourceRoot,options,sourceManifest) {
  requireThat(options.productionSeal,'EXECUTION_UNAVAILABLE','Unsealed sandbox');
  const name=attemptName(attempt);
  const root=resolve(options.attemptRoot), source=resolve(sourceRoot);
  requireThat(isAbsolute(sourceRoot) && source.startsWith(root+sep) && source===resolve(root,name,'source') &&
    !/[,:\n\r]/.test(source), 'FORBIDDEN','Attempt materialization');
  requireThat(isAbsolute(options.seccompPath)&&!options.seccompPath.includes('\0'), 'INVALID_ARGUMENT');
  const image=options.images[digest(profile.imageDigest)];
  requireThat(typeof image==='string'&&image.endsWith('@'+profile.imageDigest)&&!image.startsWith('-')&&!/\s/.test(image),'EXECUTION_UNAVAILABLE','Unapproved image');
  repositoryPath(profile.cwd,true);
  requireThat(profile.network==='none','EXECUTION_UNAVAILABLE','Fixture network broker not installed');
  for(const n of [profile.timeoutMs,profile.killGraceMs,profile.memoryBytes,profile.pids,profile.cpuMillis,profile.diskBytes,profile.logBytes])
    requireThat(Number.isSafeInteger(n)&&n>0,'INVALID_ARGUMENT','Resource bound');
  requireThat(profile.argv.length>0 && profile.argv.length<=256 && profile.argv.every(a=>typeof a==='string'&&a.length<=4096&&!a.includes('\0')) &&
    profile.argv[0].startsWith('/'),'INVALID_ARGUMENT','Fixed profile argv');
  requireThat(profile.diskBytes>=8192 && profile.memoryBytes>=profile.diskBytes,'INVALID_ARGUMENT','tmpfs quota');
  requireThat(profile.timeoutMs%1000===0&&profile.killGraceMs%1000===0,'INVALID_ARGUMENT','Whole-second Podman deadline/grace');
  digest(profile.digest);
  const tmp=Math.floor(profile.diskBytes/2),work=profile.diskBytes-tmp;
  return ['run','--detach','--name',name,'--label','dev2.attempt='+name,'--label','dev2.profile='+profile.digest,
    ...(sourceManifest?['--label','dev2.source='+digest(sourceManifest)]:[]),
    '--http-proxy=false','--image-volume=ignore','--health-cmd=none','--restart=no','--systemd=false',
    '--unsetenv-all','--timeout='+profile.timeoutMs/1000,'--stop-timeout='+profile.killGraceMs/1000,
    '--entrypoint=/usr/bin/env','--pull=never','--read-only','--read-only-tmpfs=false','--cap-drop=ALL','--security-opt=no-new-privileges',
    '--security-opt=seccomp='+options.seccompPath,'--network=none','--pid=private','--ipc=private','--cgroupns=private','--uts=private','--userns=keep-id','--cgroups=enabled',
    '--pids-limit='+profile.pids,'--memory='+profile.memoryBytes,'--memory-swap='+profile.memoryBytes,'--cpus='+(profile.cpuMillis/1000),
    '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size='+tmp,'--tmpfs=/work:rw,nosuid,nodev,size='+work,
    '--mount=type=bind,src='+source+',dst=/source,ro=true','--workdir=/source'+(profile.cwd?'/'+profile.cwd:''),
    '--env=HOME=/work','--env=TMPDIR=/tmp','--env=PATH=/usr/local/bin:/usr/bin:/bin','--log-driver=k8s-file','--log-opt=max-size='+profile.logBytes,
    // Podman 4.9.3 injects HOSTNAME after --unsetenv-all. A fixed executable
    // from the sealed image clears all late defaults before candidate startup.
    image,'-i','--','HOME=/work','TMPDIR=/tmp','PATH=/usr/local/bin:/usr/bin:/bin',...profile.argv];
}

/** Rootless container adapter. Missing engine/seal never invokes a host fallback.
 * @implements {SandboxPort}
 */
export class PodmanSandbox {
  /** @param {Options} options */
  constructor(options) {this.options=options;this.command=options.command??boundedCommand;}
  /** @param {readonly string[]} args @param {number} [maxBytes] */
  call(args,maxBytes=1048576) {return this.command(this.options.executable,args,{environment:this.options.environment,timeoutMs:15000,maxBytes});}
  async preflight() {
    requireThat(this.options.productionSeal,'EXECUTION_UNAVAILABLE');
    const seccompBytes=await readFile(this.options.seccompPath);
    requireThat(bytesDigest(seccompBytes)===this.options.seccompDigest,'INTEGRITY_FAILURE');
    /** @type {{defaultAction?:string}} */
    const seccomp=/** @type {{defaultAction?:string}} */(parseRecord(seccompBytes));
    requireThat(['SCMP_ACT_ERRNO','SCMP_ACT_KILL','SCMP_ACT_KILL_PROCESS'].includes(seccomp.defaultAction??''),'EXECUTION_UNAVAILABLE');
    const r=await this.call(['info','--format=json']);
    requireThat(r.exitCode===0&&!r.timedOut&&!r.spawnFailed&&r.discardedBytes===0,'EXECUTION_UNAVAILABLE');
    const info=/** @type {{host?:{security?:{rootless?:boolean,seccompEnabled?:boolean},cgroupVersion?:string,cgroupControllers?:string[]}}} */(parseRecord(r.stdout));
    requireThat(info.host?.security?.rootless===true&&info.host.security.seccompEnabled===true&&info.host.cgroupVersion==='v2'&&
      ['cpu','memory','pids'].every(c=>info.host?.cgroupControllers?.includes(c)),'EXECUTION_UNAVAILABLE');
  }
  /** @param {Attempt} attempt @param {{profileDigest:string,sourceManifest:string}} [expected] @returns {Promise<Observation>} */
  async inspect(attempt,expected) {
    const name=attemptName(attempt),exists=await this.call(['container','exists',name]);
    if(exists.spawnFailed||exists.timedOut||exists.discardedBytes>0)return observation(attempt,'uncertain');
    if(exists.exitCode===1)return observation(attempt,'absent');
    if(exists.exitCode!==0)return observation(attempt,'uncertain');
    const r=await this.call(['inspect','--format=json',name]);
    if(r.exitCode!==0||r.timedOut||r.discardedBytes>0)return observation(attempt,'uncertain');
    try {
      const list=/** @type {{Config:{Labels:Record<string,string>},State:{Status:string,Running:boolean,ExitCode:number}}[]} */(parseRecord(r.stdout));
      requireThat(list.length===1&&list[0].Config.Labels['dev2.attempt']===name,'INTEGRITY_FAILURE');
      if(expected)requireThat(list[0].Config.Labels['dev2.profile']===expected.profileDigest&&list[0].Config.Labels['dev2.source']===expected.sourceManifest,'INTEGRITY_FAILURE','Attempt input identity changed');
      const state=list[0].State;
      if(state.Running===true)return observation(attempt,'running');
      if(['exited','stopped'].includes(state.Status)&&state.Running===false&&Number.isSafeInteger(state.ExitCode)&&state.ExitCode>=0&&state.ExitCode<=255)return {...observation(attempt,'exited'),exitCode:state.ExitCode};
      // Real hosted Podman 4.9.3/conmon returns -1 after its enforced timeout.
      // Terminal state + no live PID + ordered timestamps prove stop, not PASS.
      // Retain unknown exitCode as null; required validation still rejects it.
      const terminal=/** @type {typeof state & {Pid?:number,StartedAt?:string,FinishedAt?:string}} */(state);
      if(state.Status==='exited'&&state.Running===false&&state.ExitCode===-1&&terminal.Pid===0){
        const started=Date.parse(terminal.StartedAt??''),finished=Date.parse(terminal.FinishedAt??'');
        if(Number.isFinite(started)&&started>0&&Number.isFinite(finished)&&finished>=started)return observation(attempt,'exited');
      }
      if(state.Status==='created')return observation(attempt,'uncertain');
      return observation(attempt,'uncertain');
    } catch(error) {if(error instanceof Dev2Error&&error.code==='INTEGRITY_FAILURE')throw error;return observation(attempt,'uncertain');}
  }
  /** @param {Attempt} attempt @param {Profile} profile @param {SourceTree} source @returns {Promise<Observation>} */
  async launch(attempt,profile,source) {
    await this.preflight();
    const expected={profileDigest:digest(profile.digest),sourceManifest:digest(source.manifestDigest)};
    const existing=await this.inspect(attempt,expected);
    if(existing.state!=='absent')return existing;
    const path=await this.options.materialize(attempt,source);
    const args=createArguments(attempt,profile,path,this.options,source.manifestDigest);
    requireThat((await lstat(path)).isDirectory() && await realpath(path)===resolve(path),'FORBIDDEN');
    // No mutable checkout or queue ownership is delegated to the Podman client.
    // Name collision and lost responses are reconciled; never replace or start twice.
    await this.call(args);
    return this.inspect(attempt,expected);
  }
  /** @param {Attempt} attempt @returns {Promise<Observation>} */
  async cancel(attempt) {
    const current=await this.inspect(attempt);
    if(['absent','exited','uncertain'].includes(current.state))return current;
    await this.call(['kill','--signal=KILL',attemptName(attempt)]);
    return this.inspect(attempt);
  }
}
