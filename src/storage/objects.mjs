import { mkdir,open,rename,unlink,realpath,lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve,join } from 'node:path';
import { bytesDigest } from '../contracts/canonical.mjs';
import { digest,newId } from '../contracts/identity.mjs';
import { requireThat } from '../contracts/errors.mjs';
/** Verified immutable bytes. Pathname may atomically acquire identical bytes;
 * callers never derive identity or authority from inode numbers. */
export class ObjectStore {
  /** @param {string} root @param {{maxBytes?:number,fault?:(point:string)=>void}} [options] */
  constructor(root,options={}){this.root=resolve(root);this.maxBytes=options.maxBytes??16777216;this.fault=options.fault??(()=>{});requireThat(Number.isSafeInteger(this.maxBytes)&&this.maxBytes>0,'INVALID_ARGUMENT');}
  async init(){await mkdir(this.root,{recursive:true,mode:0o700});await this.checkRoot();}
  async checkRoot(){requireThat(await realpath(this.root)===this.root&&(await lstat(this.root)).isDirectory(),'INTEGRITY_FAILURE');}
  /** @param {string} d @returns {Promise<Uint8Array>} */
  async get(d){digest(d);await this.checkRoot();const f=await open(join(this.root,d.slice(7)),constants.O_RDONLY|constants.O_NOFOLLOW);
    try{const before=await f.stat();requireThat(before.isFile()&&before.size<=this.maxBytes,'INTEGRITY_FAILURE');const bytes=await f.readFile();const after=await f.stat();requireThat(after.size===before.size&&after.mtimeMs===before.mtimeMs&&bytes.length===before.size&&bytesDigest(bytes)===d,'INTEGRITY_FAILURE');return bytes;}finally{await f.close();}
  }
  async sync(){const dir=await open(this.root,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{await dir.sync();}finally{await dir.close();}}
  /** @param {Uint8Array} input @returns {Promise<string>} */
  async put(input){requireThat(input instanceof Uint8Array&&input.byteLength<=this.maxBytes,'LIMIT_EXCEEDED');const bytes=Buffer.from(input);
    await this.init();const d=bytesDigest(bytes),path=join(this.root,d.slice(7)),temp=join(this.root,'.new-'+newId());
    try{await this.get(d);await this.sync();return d;}catch(e){if(!(e&&typeof e==='object'&&'code'in e&&e.code==='ENOENT'))throw e;}
    let published=false;
    try{const f=await open(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
      try{await f.writeFile(bytes);await f.chmod(0o400);await f.sync();}finally{await f.close();}
      this.fault('before-publish');await this.checkRoot();
      try{await this.get(d);}catch(e){if(!(e&&typeof e==='object'&&'code'in e&&e.code==='ENOENT'))throw e;}
      await rename(temp,path);published=true;this.fault('after-publish');await this.sync();return d;
    }finally{if(!published)try{await unlink(temp);}catch(e){if(!(e&&typeof e==='object'&&'code'in e&&e.code==='ENOENT'))throw e;}}
  }
}
