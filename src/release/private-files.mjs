import {lstat,readFile,realpath,mkdir,open,rename,rm} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {randomBytes} from 'node:crypto';
import {bytesDigest} from '../contracts/canonical.mjs';
import {requireThat} from '../contracts/errors.mjs';
/** Fixed installed locators only. No caller path or candidate selected archive.
 * @param {string} filename @param {number} [maximum] */
export async function privateBytes(filename,maximum=1048576){
 requireThat(resolve(filename)===filename,'FORBIDDEN');const before=await lstat(filename);
 requireThat(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&before.uid===process.getuid?.()&&(before.mode&0o077)===0&&before.size<=maximum&&await realpath(filename)===filename,'FORBIDDEN','Unsafe release installation file');
 const bytes=await readFile(filename),after=await lstat(filename);requireThat(before.ino===after.ino&&before.dev===after.dev&&before.mtimeMs===after.mtimeMs&&before.size===after.size&&bytes.length===before.size,'INTEGRITY_FAILURE');return bytes;
}
/** @param {string} path */
export async function privateDirectory(path){requireThat(resolve(path)===path,'FORBIDDEN');await mkdir(path,{recursive:true,mode:0o700});const stat=await lstat(path);requireThat(stat.isDirectory()&&!stat.isSymbolicLink()&&stat.uid===process.getuid?.()&&(stat.mode&0o077)===0&&await realpath(path)===path,'FORBIDDEN');}
/** Invoked under the fixed helper's exclusive journal owner and per-release
 * serialization. A crash exposes either the previous exact file or all new bytes,
 * never an accepted partially written config. Existing differing bytes fail closed.
 * @param {string} filename @param {Uint8Array} bytes */
export async function immutablePrivateFile(filename,bytes){
 requireThat(bytes.length<=1048576&&resolve(filename)===filename,'LIMIT_EXCEEDED');await privateDirectory(dirname(filename));
 try{const old=await privateBytes(filename);requireThat(bytesDigest(old)===bytesDigest(bytes),'INTEGRITY_FAILURE','Immutable private release config changed');return;}catch(error){if(!(error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT'))throw error;}
 const temporary=filename+'.tmp-'+randomBytes(16).toString('hex'),file=await open(temporary,'wx',0o600);
 try{try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}await rename(temporary,filename);const directory=await open(dirname(filename),'r');try{await directory.sync();}finally{await directory.close();}requireThat(bytesDigest(await privateBytes(filename))===bytesDigest(bytes),'INTEGRITY_FAILURE');}finally{await rm(temporary,{force:true});}
}
