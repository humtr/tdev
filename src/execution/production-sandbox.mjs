import {readFile,readlink} from 'node:fs/promises';
import {join} from 'node:path';
import {ManagedSandbox} from './managed-sandbox.mjs';
import {attemptName} from './podman.mjs';
import {bytesDigest,canonicalJson} from '../contracts/canonical.mjs';
import {boundedProviderJson} from './provider-json.mjs';
import {requireThat} from '../contracts/errors.mjs';
/** @typedef {import('../contracts/ports.js').Attempt} Attempt */
/** @typedef {import('../contracts/ports.js').Profile} Profile */
/** @typedef {import('./outer-receipt.mjs').Isolation} Isolation */
export const HOLD_ARGV=Object.freeze(['/usr/local/bin/node','-e','setInterval(()=>{},1000)']);
const ENV=Object.freeze(['HOME=/work','PATH=/usr/local/bin:/usr/bin:/bin','TMPDIR=/tmp']);
const NAMES=Object.freeze(['pid','mnt','user','net','ipc','uts','cgroup']);
/** @param {string} text */
function mounts(text){requireThat(text.length<=2097152,'LIMIT_EXCEEDED');return text.trim().split('\n').map(line=>{const [left,right]=line.split(' - '),a=left?.split(' '),b=right?.split(' ');requireThat(a?.length>=6&&b?.length>=3,'INTEGRITY_FAILURE','Malformed container mount evidence');const path=a[4].replace(/\\(040|011|012|134)/g,(_,oct)=>String.fromCharCode(parseInt(oct,8)));return {path,options:a[5].split(','),type:b[0],superOptions:b[2].split(',')};});}
/** @param {string[]} options */
function size(options){const text=options.find(v=>v.startsWith('size='))?.slice(5)??'',m=/^([1-9][0-9]*)([kmg]?)$/i.exec(text);if(!m)return null;const units=/** @type {Record<string,number>} */({k:1024,m:1048576,g:1073741824}),bytes=Number(m[1])*(units[m[2].toLowerCase()]??1);return Number.isSafeInteger(bytes)?bytes:null;}
/** Map host-observed IDs through the exact private namespace, rather than
 * mistaking a positive host ID for a non-root user inside the container.
 * @param {string} statusIds @param {string} mapping */
export function nonRootMappedUser(statusIds,mapping){if(mapping.length>8192)return false;const ids=statusIds.split(/\s+/).map(Number),ranges=mapping.trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));if(ids.length!==4||ids.some(n=>!Number.isSafeInteger(n)||n<=0)||ranges.some(r=>r.length!==3||r.some(n=>!Number.isSafeInteger(n)||n<0)||r[2]===0))return false;return ids.every(n=>{const matches=ranges.filter(r=>n>=r[1]&&n-r[1]<r[2]);return matches.length===1&&matches[0][0]+n-matches[0][1]>0;});}
/** Keep the original profile's labels, resources, timeout and immutable mounts.
 * Only init is replaced with a fixed image-resident idle process. The adopted
 * command runs once through bounded exec while its exact cgroup remains readable.
 */
export class ProductionSandbox extends ManagedSandbox {
 /** @param {readonly string[]} args @param {number} [maxBytes] */
 call(args,maxBytes=1048576){if(args[0]!=='run')return super.call(args,maxBytes);const images=new Set(Object.values(this.options.images)),positions=args.flatMap((arg,i)=>images.has(arg)?[i]:[]);requireThat(positions.length===1,'INTEGRITY_FAILURE');const at=positions[0];requireThat(canonicalJson(args.slice(at+1,at+6))===canonicalJson(['-i','--','HOME=/work','TMPDIR=/tmp','PATH=/usr/local/bin:/usr/bin:/bin']),'INTEGRITY_FAILURE','Unexpected contained entrypoint');return super.call([...args.slice(0,at+6),...HOLD_ARGV],maxBytes);}
 /** No shell or inherited container environment. Output is bounded data, never
 * a host path, hook or callback. In release-build the fixed controller emits the
 * existing three-artifact data protocol on stdout; the outer runner hashes it.
 * @param {Attempt} attempt @param {Profile} profile @param {number} timeoutMs */
 executeProfile(attempt,profile,timeoutMs){requireThat(profile.cwd===''&&profile.network==='none','FORBIDDEN');requireThat(Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=300000,'EXECUTION_UNAVAILABLE','Contained command deadline elapsed');return this.command(this.options.executable,['exec','--workdir=/source',attemptName(attempt),'/usr/bin/env','-i','--','HOME=/work','TMPDIR=/tmp','PATH=/usr/local/bin:/usr/bin:/bin',...profile.argv],{environment:this.options.environment,timeoutMs,maxBytes:profile.logBytes,killGraceMs:1000});}
 /** Actual host-side kernel and mount evidence, before any candidate command.
 * Qualification additionally exercises negative access/egress/process/storage
 * tests for this same adapter; these observations do not replace those tests.
 * @param {Attempt} attempt @param {Profile} profile @param {import('./outer-receipt.mjs').Kernel} kernel @returns {Promise<Isolation>} */
 async isolationEvidence(attempt,profile,kernel){const name=attemptName(attempt);requireThat(kernel.container===name,'INTEGRITY_FAILURE');const proc='/proc/'+kernel.pid,raw=await this.call(['inspect','--format=json',name]);requireThat(raw.exitCode===0&&!raw.timedOut&&!raw.spawnFailed&&!raw.discardedBytes,'EXECUTION_UNAVAILABLE');const list=/** @type {{State:{Running:boolean,Pid:number},HostConfig:{NetworkMode:string},Mounts:{Source:string,Destination:string,RW:boolean,Type:string}[]}[]} */(boundedProviderJson(raw.stdout));requireThat(list.length===1&&list[0].State.Running&&list[0].State.Pid===kernel.pid,'EFFECT_UNCERTAIN');const entry=list[0];
 const [status,mountText,environment,uidMap]=await Promise.all([readFile(proc+'/status','utf8'),readFile(proc+'/mountinfo','utf8'),readFile(proc+'/environ'),readFile(proc+'/uid_map','utf8')]);requireThat(status.length<=65536&&environment.length<=8192,'LIMIT_EXCEEDED');const readStatus=(/** @type {string} */ key)=>new RegExp('^'+key+':\\s*(.*)$','m').exec(status)?.[1]?.trim()??'',table=mounts(mountText),mount=(/** @type {string} */ path)=>table.find(v=>v.path===path),ro=(/** @type {string} */ path)=>mount(path)?.options.includes('ro')===true;
 const namespaceChecks=await Promise.all(NAMES.map(async n=>await readlink(proc+'/ns/'+n)!==await readlink('/proc/self/ns/'+n))),tmp=mount('/tmp'),work=mount('/work'),tmpSize=size(tmp?.superOptions??[]),workSize=size(work?.superOptions??[]),expected=new Map([['/source',join(this.options.attemptRoot,name,'source')],['/controller',this.artifacts.controller.directory],['/controller/node_modules',join(this.artifacts.dependencies.directory,'node_modules')],['/source/node_modules',join(this.artifacts.dependencies.directory,'node_modules')]]);
 const binds=entry.Mounts.filter(m=>m.Type==='bind'),exactBinds=binds.length===expected.size&&binds.every(m=>expected.get(m.Destination)===m.Source&&m.RW===false);
 const image=await this.call(['image','inspect','--format={{.Digest}}',this.options.images[profile.imageDigest]],4096);requireThat(image.exitCode===0&&!image.timedOut&&!image.spawnFailed&&!image.discardedBytes&&image.stdout.toString().trim()===profile.imageDigest,'INTEGRITY_FAILURE','Actual image differs');
 const checked=await this.kernelEvidence(attempt);requireThat(checked?.pid===kernel.pid&&checked.cgroup===kernel.cgroup,'EFFECT_UNCERTAIN','Container identity changed during preflight');
 return {rootReadOnly:ro('/'),sourceReadOnly:exactBinds&&ro('/source'),controllerReadOnly:exactBinds&&ro('/controller'),dependenciesReadOnly:exactBinds&&ro('/controller/node_modules')&&ro('/source/node_modules'),noNewPrivileges:readStatus('NoNewPrivs')==='1',noCapabilities:/^0+$/.test(readStatus('CapEff')),seccomp:readStatus('Seccomp')==='2',nonRoot:nonRootMappedUser(readStatus('Uid'),uidMap),privateNamespaces:namespaceChecks.every(Boolean),networkNone:entry.HostConfig.NetworkMode==='none',finiteStorage:tmp?.type==='tmpfs'&&work?.type==='tmpfs'&&tmpSize!==null&&workSize!==null&&tmpSize+workSize<=profile.diskBytes&&['nosuid','nodev','noexec'].every(v=>tmp.options.includes(v))&&['nosuid','nodev'].every(v=>work.options.includes(v)),cleanEnvironment:canonicalJson(environment.toString().split('\0').filter(Boolean).sort())===canonicalJson(ENV),engineDigest:bytesDigest(await readFile(this.options.executable)),seccompDigest:this.options.seccompDigest,imageDigest:profile.imageDigest,controllerDigest:this.artifacts.controller.digest,dependencyArtifactDigest:this.artifacts.dependencies.identity};
 }
}
