import {mkdir,open,readFile,realpath,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,isAbsolute} from 'node:path';
import {newId} from '../contracts/identity.mjs';
import {canonicalJson,parseRecord,recordDigest} from '../contracts/canonical.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {boundedCommand} from '../execution/command.mjs';
/** @typedef {import('../contracts/ports.js').Effect} Effect */
/** @typedef {{invocationId:string,effectDigest:string}} Invocation */
/** @typedef {{invocationId?:string,stopped:boolean,delivery:'sent'|'unknown'|'not_sent',state:string}} Observation */
/** File records are external sender observations, not another work owner.
 * SQLite retains the effect and selected invocation before any process spawn.
 */
export class DurableGitSender {
 /** @param {{ledger:import('../storage/ledger.mjs').Ledger,stateDirectory:string,configurationPath:string,pythonExecutable:string,helperPath:string,environment:Record<string,string>,command?:typeof boundedCommand}} options */
 constructor(options){this.o=options;this.command=options.command??boundedCommand;for(const p of [options.stateDirectory,options.configurationPath,options.pythonExecutable,options.helperPath])requireThat(isAbsolute(p),'INVALID_ARGUMENT');}
 /** @param {Effect} effect @returns {Invocation|null} */
 current(effect){return this.o.ledger.transact(tx=>{const r=tx.get('SELECT value FROM meta WHERE key=?','sender:'+effect.effectId);const value=r?/** @type {Invocation} */(parseRecord(String(r.value))):null;if(value)requireThat(value.effectDigest===recordDigest('dev2.git-effect.v1',effect),'INTEGRITY_FAILURE');return value;});}
 /** @param {'run'|'inspect'|'cancel'} op @param {Invocation} invocation @returns {Promise<Observation>} */
 async invoke(op,invocation){
  const result=await this.command(this.o.pythonExecutable,[this.o.helperPath,op,this.o.configurationPath,invocation.invocationId],{environment:this.o.environment,timeoutMs:op==='run'?135000:15000,maxBytes:8192});
  if(result.spawnFailed||result.timedOut||result.discardedBytes||result.exitCode!==0)return {stopped:false,delivery:'unknown',state:'unavailable'};
  const observation=/** @type {Observation} */(parseRecord(result.stdout,8192));
  requireThat(observation.invocationId===invocation.invocationId&&typeof observation.stopped==='boolean'&&['sent','unknown','not_sent'].includes(observation.delivery),'INTEGRITY_FAILURE');return observation;
 }
 /** An inspector may fence a reserved-but-not-started invocation, using the same
  * OS lock as launch. A heartbeat timeout is never used as this proof.
  * @param {Effect} effect */
 async stopped(effect){const invocation=this.current(effect);return invocation?(await this.invoke('inspect',invocation)).stopped:true;}
 /** @param {Effect} effect */
 async cancel(effect){const invocation=this.current(effect);return invocation?(await this.invoke('cancel',invocation)).stopped:true;}
 /** @param {Effect} effect */
 async compareUpdate(effect){
  let invocation=this.current(effect);
  if(invocation){const seen=await this.invoke('inspect',invocation);if(!seen.stopped)return {kind:/** @type {const} */('uncertain')};if(seen.delivery==='sent')return {kind:/** @type {const} */('sent')};}
  const previous=invocation,effectDigest=recordDigest('dev2.git-effect.v1',effect);
  invocation=this.o.ledger.transact(tx=>{const row=tx.get('SELECT value FROM meta WHERE key=?','sender:'+effect.effectId);requireThat((row?canonicalJson(parseRecord(String(row.value))):null)===(previous?canonicalJson(previous):null),'STALE_REVISION');const value={invocationId:newId(),effectDigest};tx.run('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value','sender:'+effect.effectId,canonicalJson(value));return value;});
  await mkdir(this.o.stateDirectory,{recursive:true,mode:0o700});requireThat(await realpath(this.o.stateDirectory)===this.o.stateDirectory,'INTEGRITY_FAILURE');
  const directory=join(this.o.stateDirectory,invocation.invocationId);await mkdir(directory,{recursive:true,mode:0o700});requireThat(await realpath(directory)===directory&&(await lstat(directory)).isDirectory(),'INTEGRITY_FAILURE');
  const file=await open(join(directory,'intent.json'),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{await file.writeFile(canonicalJson({invocationId:invocation.invocationId,effect}));await file.sync();}finally{await file.close();}
  for(const path of [directory,this.o.stateDirectory]){const fd=await open(path,constants.O_RDONLY|constants.O_DIRECTORY);try{await fd.sync();}finally{await fd.close();}}
  const observed=await this.invoke('run',invocation);return {kind:observed.stopped&&observed.delivery==='sent'?/** @type {const} */('sent'):/** @type {const} */('uncertain')};
 }
}
