import {execFile} from 'node:child_process';
import {request} from 'node:http';
import {isAbsolute} from 'node:path';
import {requireThat} from '../contracts/errors.mjs';
import {parseRecord} from '../contracts/canonical.mjs';
/** @typedef {{releaseId:string,ready:boolean,accepting:boolean,drained:boolean}} ControlState */
/** Trusted installation-only transport, never a public development shell.
 * @param {string} socket @param {'probe'|'drain'|'enable'} op @param {string|null} releaseId @param {number} deadline */
export function controlRequest(socket,op,releaseId,deadline){
 requireThat(isAbsolute(socket),'INVALID_ARGUMENT');const body=JSON.stringify({op,releaseId});
 return new Promise((resolve,reject)=>{
  const req=request({socketPath:socket,path:'/control',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},timeout:Math.max(1,Math.min(5000,deadline-Date.now()))},response=>{
   /** @type {Buffer[]} */
   const chunks=[];let size=0;response.on('data',chunk=>{size+=chunk.length;if(size>65536){req.destroy(new Error('Control response limit'));return;}chunks.push(chunk);});
   response.on('end',()=>{try{requireThat(response.statusCode===200,'EXECUTION_UNAVAILABLE');resolve(/** @type {ControlState} */(parseRecord(Buffer.concat(chunks),65536)));}catch(e){reject(e);}});
  });req.on('timeout',()=>req.destroy(new Error('Control deadline')));req.on('error',reject);req.end(body);
 });
}
/** @param {string} binary @param {string[]} args @param {number} deadline @returns {Promise<{ok:boolean,stdout:string}>} */
function command(binary,args,deadline){return new Promise(resolve=>{execFile(binary,args,{encoding:'utf8',timeout:Math.max(1,Math.min(30000,deadline-Date.now())),maxBuffer:65536,env:{PATH:process.env.PATH,LANG:'C',...(process.env.XDG_RUNTIME_DIR?{XDG_RUNTIME_DIR:process.env.XDG_RUNTIME_DIR}:{}),...(process.env.DBUS_SESSION_BUS_ADDRESS?{DBUS_SESSION_BUS_ADDRESS:process.env.DBUS_SESSION_BUS_ADDRESS}:{})}},(error,stdout)=>resolve({ok:!error,stdout}));});}
export class SystemdServices {
 /** @param {{unit:string,socket:string,store:import('./release-store.mjs').ReleaseStore,systemctl?:string,user?:boolean}} options */
 constructor(options){requireThat(/^[a-zA-Z0-9_.@-]{1,128}\.service$/.test(options.unit)&&isAbsolute(options.socket),'INVALID_ARGUMENT');this.o=options;this.binary=options.systemctl??'systemctl';}
 /** @param {string[]} args @param {number} deadline */
 cmd(args,deadline){return command(this.binary,[...(this.o.user===false?[]:['--user']),...args,this.o.unit],deadline);}
 /** @param {number} deadline */
 async drain(deadline){try{const state=await controlRequest(this.o.socket,'drain',null,deadline);return state.drained&&!state.accepting;}catch{return false;}}
 /** @param {number} deadline */
 async stop(deadline){const mode=await this.cmd(['show','--property=KillMode','--value'],deadline);if(!mode.ok||mode.stdout.trim()!=='control-group')return false;
  const stop=await this.cmd(['stop'],deadline);if(!stop.ok)return false;const state=await this.cmd(['show','--property=ActiveState','--property=MainPID'],deadline);
  return state.ok&&/^MainPID=0$/m.test(state.stdout)&&/^ActiveState=(inactive|failed)$/m.test(state.stdout);
 }
 /** @param {string} release @param {number} deadline */
 async start(release,deadline){if(await this.o.store.active()!==release||!await this.o.store.read(release))return false;return (await this.cmd(['start'],deadline)).ok;}
 /** @param {string} release @param {number} deadline */
 async ready(release,deadline){while(Date.now()<deadline){try{const state=await controlRequest(this.o.socket,'probe',release,deadline);if(state.releaseId===release&&state.ready)return true;}catch{}await new Promise(r=>setTimeout(r,100));}return false;}
 /** @param {string} release */
 async enable(release){try{const state=await controlRequest(this.o.socket,'enable',release,Date.now()+5000);return state.releaseId===release&&state.ready&&state.accepting;}catch{return false;}}
}
/** Fixed transient service survives replacement of the MCP broker. systemd owns
 * its process; success here is dispatch only, never successful activation.
 * @param {{installationPath:string,helperPath:string,activationId:string,nodePath:string,systemdRun?:string,user?:boolean}} args */
export async function dispatchActivation(args){requireThat(isAbsolute(args.installationPath)&&isAbsolute(args.helperPath)&&isAbsolute(args.nodePath)&&/^[A-Za-z0-9_-]{1,128}$/.test(args.activationId),'INVALID_ARGUMENT');
 const unit='dev2-activate-'+args.activationId;
 return command(args.systemdRun??'systemd-run',[...(args.user===false?[]:['--user']),'--quiet','--collect','--property=Type=exec','--unit='+unit,args.nodePath,args.helperPath,'--installation',args.installationPath,'--activation',args.activationId],Date.now()+10000);
}
