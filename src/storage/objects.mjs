import { mkdir,open,rename,unlink,realpath,lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve,join } from 'node:path';
import { bytesDigest } from '../contracts/canonical.mjs';
import { digest,newId } from '../contracts/identity.mjs';
import { requireThat } from '../contracts/errors.mjs';
/** Verified immutable bytes; no candidate/ledger truth is owned here. */
export class ObjectStore {
  /** @param {string} root @param {{maxBytes?:number,fault?:(point:string)=>void}} [options] */
  constructor(root,options={}) {this.root=resolve(root);this.maxBytes=options.maxBytes??16777216;this.fault=options.fault??(()=>{});}
  async init() {
    await mkdir(this.root,{recursive:true,mode:0o700});
    requireThat(await realpath(this.root)===this.root && (await lstat(this.root)).isDirectory(),'INTEGRITY_FAILURE');
  }
  /** @param {string} d @returns {Promise<Uint8Array>} */
  async get(d) {
    digest(d);const f=await open(join(this.root,d.slice(7)),constants.O_RDONLY|constants.O_NOFOLLOW);
    try {const stat=await f.stat();requireThat(stat.isFile()&&stat.size<=this.maxBytes,'INTEGRITY_FAILURE');
      const bytes=await f.readFile();requireThat(bytesDigest(bytes)===d,'INTEGRITY_FAILURE');return bytes;
    } finally {await f.close();}
  }
  /** @param {Uint8Array} bytes @returns {Promise<string>} */
  async put(bytes) {
    requireThat(bytes.byteLength<=this.maxBytes,'LIMIT_EXCEEDED');
    await this.init();const d=bytesDigest(bytes),path=join(this.root,d.slice(7)),temp=join(this.root,'.new-'+newId());
    const f=await open(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    try {await f.writeFile(bytes);await f.sync();await f.chmod(0o400);}finally{await f.close();}
    try {
      this.fault('before-publish');
      // Every publisher has already hashed and fsynced identical bytes for this name.
      // Atomic replacement avoids filesystem-specific hard-link permissions; no
      // writable materialization shares this inode. Existing corruption fails closed.
      try {await this.get(d);}catch(error){if(!(error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT'))throw error;}
      await rename(temp,path);await this.get(d);
      this.fault('after-publish');
      const dir=await open(this.root,constants.O_RDONLY|constants.O_DIRECTORY);try{await dir.sync();}finally{await dir.close();}
      return d;
    } finally {try{await unlink(temp);}catch(error){if(!(error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT'))throw error;}}
  }
}
