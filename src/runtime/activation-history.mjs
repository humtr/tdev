import {mkdir,open,rename,unlink,lstat,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join} from 'node:path';
import {canonicalJson,parseRecord,recordDigest} from '../contracts/canonical.mjs';
import {id,newId} from '../contracts/identity.mjs';
import {requireThat} from '../contracts/errors.mjs';
/** Compact immutable terminal objects under the existing activation owner's lock.
 * This class neither admits work nor drives activation and has no writer lease.
 * @typedef {import('./activation.mjs').Activation} Activation */
export class ActivationHistory {
 /** @param {string} root */
 constructor(root){this.root=resolve(root);}
 async init(){await mkdir(this.root,{recursive:true,mode:0o700});requireThat(await realpath(this.root)===this.root&&(await lstat(this.root)).isDirectory(),'INTEGRITY_FAILURE');}
 /** @param {string} activationId */
 path(activationId){id(activationId);return join(this.root,recordDigest('dev2.activation-key.v1',{activationId}).slice(7)+'.json');}
 /** @param {string} activationId @returns {Promise<Activation|null>} */
 async lookup(activationId){await this.init();let file;try{file=await open(this.path(activationId),constants.O_RDONLY|constants.O_NOFOLLOW);}catch(error){if(error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT')return null;throw error;}
  try{const stat=await file.stat();requireThat(stat.isFile()&&stat.size<=65536,'INTEGRITY_FAILURE');const value=/** @type {{record:Activation,digest:string}} */(parseRecord(await file.readFile(),65536));
   requireThat(value.record.activationId===activationId&&['active','rolled_back'].includes(value.record.phase)&&recordDigest('dev2.activation-terminal.v1',value.record)===value.digest,'INTEGRITY_FAILURE');return value.record;
  }finally{await file.close();}
 }
 /** The single activation owner holds its OS lock for this publication.
  * @param {Activation} value */
 async retain(value){requireThat(['active','rolled_back'].includes(value.phase),'INTEGRITY_FAILURE');await this.init();const old=await this.lookup(value.activationId);
  if(old){requireThat(canonicalJson(old)===canonicalJson(value),'IDEMPOTENCY_MISMATCH');return;}
  const bytes=Buffer.from(canonicalJson({record:value,digest:recordDigest('dev2.activation-terminal.v1',value)}));requireThat(bytes.length<=65536,'LIMIT_EXCEEDED');const temp=join(this.root,'.'+newId()+'.tmp');let moved=false;
  try{const file=await open(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{await file.writeFile(bytes);await file.chmod(0o400);await file.sync();}finally{await file.close();}
   await rename(temp,this.path(value.activationId));moved=true;const directory=await open(this.root,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{await directory.sync();}finally{await directory.close();}
  }finally{if(!moved)await unlink(temp).catch(()=>{});}
 }
}
