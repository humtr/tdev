import { spawn } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { requireThat } from '../contracts/errors.mjs';
/** @typedef {{exitCode:number|null,signal:string|null,stdout:Buffer,stderr:Buffer,discardedBytes:number,timedOut:boolean,spawnFailed:boolean}} CommandResult */
/** Trusted broker executable only. Never exposed as a public shell or used for repository scripts.
 * @param {string} executable @param {readonly string[]} argv
 * @param {{environment:Record<string,string>,timeoutMs:number,maxBytes:number,killGraceMs?:number,input?:Uint8Array}} options
 * @returns {Promise<CommandResult>}
 */
export async function boundedCommand(executable,argv,options) {
  requireThat(isAbsolute(executable) && !executable.includes('\0') && argv.every(a=>typeof a==='string'&&!a.includes('\0')), 'INVALID_ARGUMENT');
  requireThat(Number.isSafeInteger(options.timeoutMs)&&options.timeoutMs>0&&Number.isSafeInteger(options.maxBytes)&&options.maxBytes>0,'INVALID_ARGUMENT');
  return new Promise(resolve=>{
    const child=spawn(executable,[...argv],{env:{...options.environment},shell:false,detached:true,stdio:['pipe','pipe','pipe']});
    /** @type {Buffer[]} */ const out=[];
    /** @type {Buffer[]} */ const err=[];
    let captured=0,discarded=0,timedOut=false,spawnFailed=false,stopping=false;
    /** @type {NodeJS.Timeout|undefined} */ let force;
    /** @param {NodeJS.Signals} signal */
    const signal=signal=>{ if(child.pid) {try {process.kill(-child.pid,signal);} catch {} } };
    const stop=()=>{ if(stopping)return; stopping=true;signal('SIGTERM');force=setTimeout(()=>signal('SIGKILL'),options.killGraceMs??1000); };
    /** @param {Buffer[]} sink @param {Buffer} bytes */
    const capture=(sink,bytes)=>{const take=Math.min(bytes.length,options.maxBytes-captured);if(take>0)sink.push(bytes.subarray(0,take));captured+=take;discarded+=bytes.length-take;if(discarded>0)stop();};
    child.stdin.on('error',()=>{});child.stdin.end(options.input);
    child.stdout.on('data',b=>capture(out,b));child.stderr.on('data',b=>capture(err,b));
    child.on('error',()=>{spawnFailed=true;});
    const deadline=setTimeout(()=>{timedOut=true;stop();},options.timeoutMs);
    child.once('close',(exitCode,signal)=>{clearTimeout(deadline);if(force)clearTimeout(force);
      resolve({exitCode,signal,stdout:Buffer.concat(out),stderr:Buffer.concat(err),discardedBytes:discarded,timedOut,spawnFailed});});
  });
}
