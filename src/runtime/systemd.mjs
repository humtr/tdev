import {readFile,lstat,realpath} from 'node:fs/promises';
import {isAbsolute,resolve,join} from 'node:path';
import {boundedCommand} from '../execution/command.mjs';
import {digest} from '../contracts/identity.mjs';
import {requireThat} from '../contracts/errors.mjs';
/** @typedef {import('./activation.mjs').Service} Service */
/** Fixed installed unit adapter, never public systemctl or arbitrary-unit mutation.
 * Unit installation must use KillMode=control-group, Restart=no for handoff, and
 * a fixed launcher reading the helper-owned exact active-release pointer.
 * Readiness/control callbacks use an installation-authenticated local channel.
 * @implements {Service}
 */
export class SystemdBrokerService {
 /** @param {{systemctl:string,unit:string,environment:Record<string,string>,cgroupRoot:string,controlGroup:string,
  * timeoutMs?:number,command?:typeof boundedCommand,
  * readiness:()=>Promise<{pid:number,releaseId:string,ready:boolean}>,
  * control:(op:'drain'|'enable',releaseId:string|null)=>Promise<boolean>,
  * activeRelease:()=>Promise<string>}} options */
 constructor(options){requireThat(isAbsolute(options.systemctl)&&isAbsolute(options.cgroupRoot)&&/^dev2-[A-Za-z0-9_.-]+\.service$/.test(options.unit),'INVALID_ARGUMENT');
  requireThat(options.controlGroup.startsWith('/')&&!options.controlGroup.includes('..')&&!options.controlGroup.includes('\0')&&!options.controlGroup.includes('\\'),'INVALID_ARGUMENT');
  requireThat(Number.isSafeInteger(options.timeoutMs??15000)&&(options.timeoutMs??15000)>0&&(options.timeoutMs??15000)<=60000,'INVALID_ARGUMENT');this.o=options;this.command=options.command??boundedCommand;
 }
 /** @param {string[]} args */
 async call(args){return this.command(this.o.systemctl,['--user','--no-pager',...args,'--',this.o.unit],{environment:this.o.environment,timeoutMs:this.o.timeoutMs??15000,maxBytes:16384});}
 async state(){const result=await this.call(['show','--property=LoadState,ActiveState,SubState,MainPID,ControlGroup,KillMode,Restart']);
  requireThat(result.exitCode===0&&!result.signal&&!result.timedOut&&!result.spawnFailed&&result.discardedBytes===0,'EXECUTION_UNAVAILABLE','Service manager unavailable');
  /** @type {Record<string,string>} */const data={};
  for(const line of result.stdout.toString().trim().split('\n')){const at=line.indexOf('=');requireThat(at>0&&!Object.hasOwn(data,line.slice(0,at)),'INTEGRITY_FAILURE');data[line.slice(0,at)]=line.slice(at+1);}
  requireThat(data.LoadState==='loaded'&&data.KillMode==='control-group'&&data.Restart==='no'&&/^[0-9]+$/.test(data.MainPID),'INTEGRITY_FAILURE','Unexpected service ownership configuration');
  requireThat(data.ControlGroup===''||data.ControlGroup===this.o.controlGroup,'INTEGRITY_FAILURE','Unexpected service cgroup');return data;
 }
 async empty(){
  const root=resolve(this.o.cgroupRoot);requireThat(await realpath(root)===root&&(await lstat(root)).isDirectory(),'INTEGRITY_FAILURE');const directory=join(root,this.o.controlGroup);
  try{requireThat(await realpath(directory)===directory&&(await lstat(directory)).isDirectory(),'INTEGRITY_FAILURE');}
  catch(error){if(error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT')return true;throw error;}
  const text=await readFile(join(directory,'cgroup.events'),'utf8');requireThat(text.length<=4096,'LIMIT_EXCEEDED');
  const entries=text.trim().split('\n').map(line=>line.split(' '));requireThat(entries.filter(e=>e[0]==='populated').length===1,'INTEGRITY_FAILURE');return entries.find(e=>e[0]==='populated')?.[1]==='0';
 }
 async observe(){
  try{const state=await this.state();if(['inactive','failed'].includes(state.ActiveState)&&state.MainPID==='0'&&await this.empty())return {state:/** @type {const} */('stopped'),releaseId:null,ready:false};
   if(state.ActiveState!=='active'||state.SubState!=='running'||Number(state.MainPID)<=0)return {state:/** @type {const} */('uncertain'),releaseId:null,ready:false};
   const readiness=await this.o.readiness();digest(readiness.releaseId);requireThat(readiness.pid===Number(state.MainPID)&&typeof readiness.ready==='boolean','INTEGRITY_FAILURE');
   return {state:/** @type {const} */('running'),releaseId:readiness.releaseId,ready:readiness.ready};
  }catch{return {state:/** @type {const} */('uncertain'),releaseId:null,ready:false};}
 }
 async drain(){return this.o.control('drain',null);}
 async stop(){await this.call(['stop']);return (await this.observe()).state==='stopped';}
 /** @param {string} releaseId */
 async start(releaseId){digest(releaseId);requireThat(await this.o.activeRelease()===releaseId,'STALE_RELEASE');const result=await this.call(['start']);requireThat(result.exitCode===0&&!result.signal&&!result.timedOut&&!result.spawnFailed&&result.discardedBytes===0,'EXECUTION_UNAVAILABLE','Start acknowledgement unavailable');}
 /** @param {string} releaseId */
 async enable(releaseId){const seen=await this.observe();return seen.state==='running'&&seen.releaseId===releaseId&&seen.ready&&await this.o.control('enable',releaseId);}
}
