import {mkdir,lstat,realpath,readdir,readFile} from 'node:fs/promises';
import {resolve,join,isAbsolute,sep} from 'node:path';
import {PodmanSandbox,attemptName} from './podman.mjs';
import {verifyDependencies} from './dependency-artifact.mjs';
import {verifyController} from '../validation/controller.mjs';
import {boundedProviderJson} from './provider-json.mjs';
import {requireThat} from '../contracts/errors.mjs';
/** Fixed additional mounts, never a caller-controlled mount array or checkout.
 * @param {string} controller @param {string} dependencies @param {string} source */
export function artifactMountArguments(controller,dependencies,source){
 for(const p of [controller,dependencies,source])requireThat(isAbsolute(p)&&resolve(p)===p&&p!=='/'&&!/[,:\r\n\0]/.test(p),'FORBIDDEN','Exact artifact mount path');
 requireThat(controller!==source&&dependencies!==source&&!controller.startsWith(source+sep)&&!dependencies.startsWith(source+sep)&&!source.startsWith(controller+sep)&&!source.startsWith(dependencies+sep),'FORBIDDEN','Candidate and trusted artifacts must be separate');
 return ['--mount=type=bind,src='+controller+',dst=/controller,ro=true','--mount=type=bind,src='+dependencies+',dst=/controller/node_modules,ro=true','--mount=type=bind,src='+dependencies+',dst=/source/node_modules,ro=true'];
}
/** Same qualified Podman boundary with two verified immutable artifacts. The
 * provider checkout and its ambient credentials are not mounted. Candidate
 * node_modules/lock aliasing is refused before a physical attempt can launch.
 */
export class ManagedSandbox extends PodmanSandbox {
 /** @param {ConstructorParameters<typeof PodmanSandbox>[0]&{controller:{directory:string,digest:string},dependencies:{directory:string,identity:string,lockDigest:string}}} options */
 constructor(options){
  super({...options,materialize:async(attempt,source)=>{
   requireThat(!source.entries.some(e=>e.path==='node_modules'||e.path.startsWith('node_modules/')),'FORBIDDEN','Candidate may not shadow the approved dependency mount');
   const lock=source.entries.find(e=>e.path==='package-lock.json');requireThat(lock?.mode==='100644'&&lock.contentDigest===options.dependencies.lockDigest,'INTEGRITY_FAILURE','Candidate dependency lock was not approved');
   const path=await options.materialize(attempt,source),mount=join(path,'node_modules');
   try{await mkdir(mount,{mode:0o755});}catch(error){if(!error||typeof error!=='object'||!('code'in error)||error.code!=='EEXIST')throw error;}
   requireThat((await lstat(mount)).isDirectory()&&await realpath(mount)===mount&&(await readdir(mount)).length===0,'FORBIDDEN','Dependency mount point is not an empty private directory');
   return path;
  }});this.artifacts=options;
 }
 async preflight(){
  await super.preflight();
  await verifyController(this.artifacts.controller.directory,this.artifacts.controller.digest);
  await verifyDependencies(this.artifacts.dependencies.directory,this.artifacts.dependencies.lockDigest,this.artifacts.dependencies.identity);
 }
 /** @param {readonly string[]} args @param {number} [maxBytes] */
 call(args,maxBytes=1048576){
  if(args[0]!=='run')return super.call(args,maxBytes);
  const images=new Set(Object.values(this.options.images)),positions=args.flatMap((arg,i)=>images.has(arg)?[i]:[]);requireThat(positions.length===1,'INTEGRITY_FAILURE','One approved image required');
  const sourceArg=args.find(arg=>arg.startsWith('--mount=type=bind,src=')&&arg.endsWith(',dst=/source,ro=true'));requireThat(sourceArg,'INTEGRITY_FAILURE');
  const source=sourceArg.slice('--mount=type=bind,src='.length,-',dst=/source,ro=true'.length),mounts=artifactMountArguments(this.artifacts.controller.directory,join(this.artifacts.dependencies.directory,'node_modules'),source),at=positions[0];
  return super.call([...args.slice(0,at),...mounts,...args.slice(at)],maxBytes);
 }
 /** Kernel counters are sampled from the exact live container cgroup, not from
  * its exit code, a host-global counter or Podman's unreliable OOMKilled flag.
  * A stopped container returns null: missing evidence is not a zero counter.
  * @param {import('../contracts/ports.js').Attempt} attempt */
 async kernelEvidence(attempt){
  const name=attemptName(attempt),raw=await this.call(['inspect','--format={{json .State}}',name],32768);
  requireThat(raw.exitCode===0&&!raw.timedOut&&!raw.spawnFailed&&!raw.discardedBytes,'EXECUTION_UNAVAILABLE','Exact container kernel observation unavailable');
  const state=/** @type {{Running:boolean,Pid:number}} */(boundedProviderJson(raw.stdout));
  if(!state.Running)return null;
  requireThat(Number.isSafeInteger(state.Pid)&&state.Pid>0,'INTEGRITY_FAILURE');
  const text=await readFile('/proc/'+state.Pid+'/cgroup','utf8');requireThat(text.length<=8192,'LIMIT_EXCEEDED');const line=text.split('\n').find(v=>v.startsWith('0::'));requireThat(line,'INTEGRITY_FAILURE','Missing cgroup-v2 membership');const cgroup=line.slice(3);
  requireThat(cgroup.startsWith('/')&&!cgroup.split('/').includes('..')&&!/[\0\r]/.test(cgroup),'INTEGRITY_FAILURE');
  const root='/sys/fs/cgroup'+cgroup;
  const values=await Promise.all(['memory.events','memory.max','pids.max','cpu.max'].map(async name=>{const data=await readFile(root+'/'+name,'utf8');requireThat(data.length<=4096,'LIMIT_EXCEEDED');return data.trim();}));
  const events=Object.fromEntries(values[0].split('\n').map(row=>{const [key,value]=row.split(' ');requireThat(/^[a-z_]+$/.test(key)&&/^(0|[1-9][0-9]*)$/.test(value)&&Number.isSafeInteger(Number(value)),'INTEGRITY_FAILURE');return [key,Number(value)];}));
  const cpu=values[3].split(' ');for(const v of [values[1],values[2],...cpu])requireThat(/^[1-9][0-9]*$/.test(v)&&Number.isSafeInteger(Number(v)),'INTEGRITY_FAILURE','Missing finite resource controller');
  requireThat(cpu.length===2,'INTEGRITY_FAILURE');
  // A PID can be reused after exit. Do not attach a different process's counters.
  requireThat(await readFile('/proc/'+state.Pid+'/cgroup','utf8')===text,'EFFECT_UNCERTAIN','Container cgroup changed during observation');
  return {container:name,pid:state.Pid,cgroup,observedAt:Date.now(),memoryEvents:events,limits:{memoryBytes:Number(values[1]),pids:Number(values[2]),cpuQuota:Number(cpu[0]),cpuPeriod:Number(cpu[1])}};
 }
}
