import {mkdir,open,readFile,rename,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {canonicalJson,parseRecord} from '../contracts/canonical.mjs';
import {id,newId} from '../contracts/identity.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {boundedCommand} from '../execution/command.mjs';
/** @typedef {import('./types.js').ActivationEffect} Effect */
/** @typedef {{effectId?:string,inputDigest?:string,step?:string,state:string,delivery:'sent'|'not_sent'|'unknown',senderStopped:boolean,service?:{pid:number,wanted:'u'|'d',state:number}|null}} ServiceReceipt */
/** A fixed FIFO sender is a private launcher operation, not a shell or another
 * work queue. ActivationController retains the external effect and exact ID.
 */
export class RunitControl {
 /** @param {{stateDirectory:string,configurationFile:string,pythonExecutable:string,helperFile:string,environment:Record<string,string>,command?:typeof boundedCommand}} options */
 constructor(options){this.o=options;this.command=options.command??boundedCommand;for(const p of [options.stateDirectory,options.configurationFile,options.pythonExecutable,options.helperFile])requireThat(resolve(p)===p,'INVALID_ARGUMENT');/** @type {Map<string,Promise<ServiceReceipt>>} */this.running=new Map();}
 /** @param {Effect} effect @param {'run'|'inspect'} mode @returns {Promise<ServiceReceipt>} */
 invoke(effect,mode){const key=effect.effectId;const old=this.running.get(key);if(old)return old;const pending=this.invokeOnce(effect,mode).finally(()=>this.running.delete(key));this.running.set(key,pending);return pending;}
 /** @param {Effect} effect @param {'run'|'inspect'} mode @returns {Promise<ServiceReceipt>} */
 async invokeOnce(effect,mode){id(effect.effectId);requireThat(['device.stop','device.start'].includes(effect.step),'FORBIDDEN');const directory=join(this.o.stateDirectory,effect.effectId);await mkdir(directory,{recursive:true,mode:0o700});requireThat(await realpath(directory)===directory,'FORBIDDEN');
  const input={effectId:effect.effectId,inputDigest:effect.inputDigest,step:effect.step,expectedDeviceReleaseId:effect.expected.deviceReleaseId,targetDeviceReleaseId:effect.target.deviceReleaseId},text=canonicalJson(input),filename=join(directory,'intent.json');
  try{requireThat(await readFile(filename,'utf8')===text,'IDEMPOTENCY_MISMATCH');}catch(e){if(!(e&&typeof e==='object'&&'code'in e&&e.code==='ENOENT'))throw e;const temporary=filename+'.'+newId(),f=await open(temporary,'wx',0o600);try{await f.writeFile(text);await f.sync();}finally{await f.close();}await rename(temporary,filename);const parent=await open(directory,'r');try{await parent.sync();}finally{await parent.close();}}
  const result=await this.command(this.o.pythonExecutable,[this.o.helperFile,mode,this.o.configurationFile,effect.effectId],{environment:this.o.environment,timeoutMs:15000,maxBytes:8192});
  if(result.exitCode!==0||result.spawnFailed||result.timedOut||result.discardedBytes)return {state:'unavailable',senderStopped:false,delivery:'unknown'};
  const receipt=/** @type {ServiceReceipt} */(parseRecord(result.stdout,8192));requireThat(receipt.effectId===effect.effectId&&receipt.inputDigest===effect.inputDigest&&receipt.step===effect.step&&typeof receipt.senderStopped==='boolean'&&['sent','not_sent','unknown'].includes(receipt.delivery),'INTEGRITY_FAILURE');return receipt;
 }
}
