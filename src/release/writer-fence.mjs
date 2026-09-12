import {mkdir,open,readFile,realpath,rename} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {canonicalJson,parseRecord} from '../contracts/canonical.mjs';
import {id,digest,newId} from '../contracts/identity.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {boundedCommand} from '../execution/command.mjs';
/** @typedef {{schemaVersion:1,installationId:string,repositoryId:string,bindingEpoch:string,deviceReleaseId:string,artifactDigest:string,sourceCommitOid:string,schemaDigest:string,nativeConfigDigest:string}} DevicePointer */
/** @typedef {{state:'blocked'|'stopped'|'switched',writerStopped:boolean,effectId?:string,inputDigest?:string,ownerEpoch?:string,senderCount?:number,pointer?:DevicePointer}} FenceProof */
/** No shell or untrusted source is invoked. The installed Python helper acquires
 * real OS locks without opening a Ledger owner or advancing the work epoch. */
export class WriterFence {
 /** @param {{requestDirectory:string,configurationFile:string,pythonExecutable:string,helperFile:string,environment:Record<string,string>,command?:typeof boundedCommand}} options */
 constructor(options){this.o=options;this.command=options.command??boundedCommand;for(const path of [options.requestDirectory,options.configurationFile,options.pythonExecutable,options.helperFile])requireThat(resolve(path)===path,'INVALID_ARGUMENT');}
 /** @param {import('./types.js').ActivationEffect} effect @param {DevicePointer} expected @param {DevicePointer} target @param {'probe'|'switch'} mode @returns {Promise<FenceProof>} */
 async invoke(effect,expected,target,mode){
  id(effect.effectId);digest(effect.inputDigest);requireThat(['probe','switch'].includes(mode),'INVALID_ARGUMENT');
  const directory=join(this.o.requestDirectory,effect.effectId);await mkdir(directory,{recursive:true,mode:0o700});requireThat(await realpath(directory)===directory,'FORBIDDEN');
  const text=canonicalJson({effectId:effect.effectId,inputDigest:effect.inputDigest,expected,target}),filename=join(directory,'intent.json');
  try{const prior=await readFile(filename,'utf8');requireThat(prior===text,'IDEMPOTENCY_MISMATCH');}catch(error){if(!(error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT'))throw error;
   const temporary=filename+'.'+newId(),file=await open(temporary,'wx',0o600);try{await file.writeFile(text);await file.sync();}finally{await file.close();}await rename(temporary,filename);const parent=await open(directory,'r');try{await parent.sync();}finally{await parent.close();}
  }
  const result=await this.command(this.o.pythonExecutable,[this.o.helperFile,mode,this.o.configurationFile,effect.effectId],{environment:this.o.environment,timeoutMs:15000,maxBytes:16384});
  if(result.spawnFailed||result.timedOut||result.discardedBytes||result.exitCode!==0)return {state:'blocked',writerStopped:false};
  const proof=/** @type {FenceProof} */(/** @type {unknown} */(parseRecord(result.stdout,16384)));
  requireThat(proof.effectId===effect.effectId&&proof.inputDigest===effect.inputDigest&&proof.writerStopped===true&&(proof.state==='stopped'||proof.state==='switched')&&proof.pointer,'INTEGRITY_FAILURE','Unbound writer handoff');
  if(mode==='switch')requireThat(proof.state==='switched'&&canonicalJson(proof.pointer)===canonicalJson(target),'INTEGRITY_FAILURE');return proof;
 }
}
