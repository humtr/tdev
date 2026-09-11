import {open,mkdir,readdir,lstat,realpath,rename,rm,readFile} from 'node:fs/promises';
import {openSync,closeSync,constants} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join,resolve,isAbsolute} from 'node:path';
import {randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
import {canonicalJson,parseRecord,recordDigest,bytesDigest} from '../contracts/canonical.mjs';
import {digest,oid} from '../contracts/identity.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {repositoryPath} from '../security/paths.mjs';
/** @typedef {{path:string,mode:number,size:number,digest:string}} ArtifactFile */
/** @typedef {{sourceCommit:string,sourceManifest:string,toolchainDigest:string,schemaDigest:string,ledgerMinimum:number,ledgerMaximum:number,receiptDigests:string[]}} ReleaseMetadata */
/** @typedef {{releaseId:string,metadata:ReleaseMetadata,files:ArtifactFile[],artifactDigest:string,signature:string}} Release */
/** @param {string} directory */
export async function syncDirectory(directory){const fd=await open(directory,constants.O_RDONLY|constants.O_DIRECTORY);try{await fd.sync();}finally{await fd.close();}}
/** Atomic durable record replacement; caller must own the appropriate effect lock.
 * @param {string} path @param {unknown} value */
export async function durableRecord(path,value){const temp=path+'.'+randomBytes(16).toString('hex')+'.tmp';const text=canonicalJson(value);requireThat(Buffer.byteLength(text)<=16777216,'LIMIT_EXCEEDED');
 const fd=await open(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{await fd.writeFile(text);await fd.sync();}finally{await fd.close();}
 await rename(temp,path);await syncDirectory(resolve(path,'..'));
}
/** Linux flock belongs to the inherited open-file description, not the short-lived
 * flock executable. Retain the parent fd for the entire handoff; a crash releases it.
 * @param {string} path @param {string} [executable] */
export function exclusiveReleaseLock(path,executable='flock'){
 requireThat(isAbsolute(path),'INVALID_ARGUMENT');const fd=openSync(path,constants.O_RDWR|constants.O_CREAT|constants.O_NOFOLLOW,0o600);
 try{const result=spawnSync(executable,['--exclusive','--nonblock','3'],{stdio:['ignore','pipe','pipe',fd],encoding:'utf8',timeout:2000,maxBuffer:4096});requireThat(result.status===0&&!result.error,'EXECUTION_UNAVAILABLE','Activation ownership unavailable');}
 catch(e){closeSync(fd);throw e;}
 let closed=false;return ()=>{if(!closed){closed=true;closeSync(fd);}};
}
/** @param {string} path @returns {Promise<unknown|null>} */
export async function readRecord(path){let fd;try{fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);const stat=await fd.stat();requireThat(stat.isFile()&&stat.size<=16777216,'INTEGRITY_FAILURE');return parseRecord(await fd.readFile(),16777216);}catch(e){if(/** @type {NodeJS.ErrnoException} */(e).code==='ENOENT')return null;throw e;}finally{await fd?.close();}}
/** Only regular immutable artifacts; no symlinks, hard links, device files or scripts
 * fetched/interpreted by the helper. Source-declared scripts run only in P1 sandbox.
 * @param {string} directory @param {number} [maxBytes] @returns {Promise<ArtifactFile[]>} */
export async function artifactManifest(directory,maxBytes=536870912){
 requireThat(isAbsolute(directory)&&await realpath(directory)===resolve(directory),'FORBIDDEN');
 /** @type {ArtifactFile[]} */const files=[];let total=0;
 /** @param {string} prefix */
 async function scan(prefix){const entries=await readdir(join(directory,prefix),{withFileTypes:true});for(const e of entries.sort((a,b)=>Buffer.compare(Buffer.from(a.name),Buffer.from(b.name)))){
  const path=prefix?prefix+'/'+e.name:e.name;repositoryPath(path);const full=join(directory,path),stat=await lstat(full);
  requireThat(!stat.isSymbolicLink(),'FORBIDDEN','Release artifact symlink');
  if(stat.isDirectory()){await scan(path);continue;}
  requireThat(stat.isFile()&&stat.nlink===1&&stat.size<=67108864,'FORBIDDEN','Release artifacts must be isolated regular files');total+=stat.size;requireThat(Number.isSafeInteger(total)&&total<=maxBytes&&files.length<100000,'LIMIT_EXCEEDED');
  const fd=await open(full,constants.O_RDONLY|constants.O_NOFOLLOW);try{const before=await fd.stat();requireThat(before.dev===stat.dev&&before.ino===stat.ino&&before.size===stat.size,'INTEGRITY_FAILURE');const bytes=await fd.readFile();const after=await fd.stat();requireThat(after.size===before.size&&after.mtimeMs===before.mtimeMs&&after.ctimeMs===before.ctimeMs,'INTEGRITY_FAILURE');files.push({path,mode:stat.mode&0o111?0o755:0o644,size:bytes.length,digest:bytesDigest(bytes)});}finally{await fd.close();}
 }}await scan('');requireThat(files.length>0,'INVALID_ARGUMENT','Empty release artifact');return files;
}
/** A release verifier has no Git/provider mutation capability. Its signing key is
 * installation-only and is never mounted in a build sandbox or read by repository code. */
export class ReleaseStore {
 /** @param {string} root @param {Uint8Array} key */
 constructor(root,key){requireThat(isAbsolute(root)&&key.byteLength>=32,'INVALID_ARGUMENT');this.root=resolve(root);this.key=Uint8Array.from(key);}
 async init(){await mkdir(this.root,{recursive:true,mode:0o700});requireThat(await realpath(this.root)===this.root,'FORBIDDEN');const stat=await lstat(this.root);requireThat((stat.mode&0o022)===0,'FORBIDDEN','Release storage is writable outside its owner');await mkdir(join(this.root,'releases'),{recursive:true,mode:0o700});}
 /** @param {unknown} value */
 mac(value){return 'sha256:'+createHmac('sha256',this.key).update('dev2.release-attestation.v1\0'+canonicalJson(value)).digest('hex');}
 /** @param {ReleaseMetadata} metadata */
 checkMetadata(metadata){oid(metadata.sourceCommit);for(const d of [metadata.sourceManifest,metadata.toolchainDigest,metadata.schemaDigest,...metadata.receiptDigests])digest(d);requireThat(metadata.receiptDigests.length>0&&metadata.receiptDigests.length<=64&&new Set(metadata.receiptDigests).size===metadata.receiptDigests.length,'INVALID_ARGUMENT');requireThat(Number.isSafeInteger(metadata.ledgerMinimum)&&Number.isSafeInteger(metadata.ledgerMaximum)&&metadata.ledgerMinimum>=1&&metadata.ledgerMaximum>=metadata.ledgerMinimum,'INVALID_ARGUMENT');}
 /** Build output was produced by a trusted exact integrated-source sandbox. certify
 * verifies its receipt/input identity and startup-on-copied-state checks; it cannot be
 * supplied by MCP or candidate code. This method never executes the artifact.
 * @param {string} directory @param {ReleaseMetadata} metadata
 * @param {(metadata:ReleaseMetadata,files:readonly ArtifactFile[])=>Promise<void>} certify
 * @returns {Promise<Release>} */
 async stage(directory,metadata,certify){
 this.checkMetadata(metadata);const files=await artifactManifest(directory);await certify(metadata,files);
 const artifactDigest=recordDigest('dev2.release-artifact.v1',files),body={metadata:structuredClone(metadata),files,artifactDigest};const releaseId=recordDigest('dev2.release.v1',body);
 const retained=await this.read(releaseId);if(retained)return retained;
 const temp=join(this.root,'releases','.stage-'+randomBytes(16).toString('hex'));await mkdir(temp,{mode:0o700});await mkdir(join(temp,'artifact'),{mode:0o700});
 try{
  for(const file of files){const destination=join(temp,'artifact',file.path);await mkdir(resolve(destination,'..'),{recursive:true,mode:0o700});const bytes=await readFile(join(directory,file.path));requireThat(bytesDigest(bytes)===file.digest,'INTEGRITY_FAILURE','Build output changed while staging');const fd=await open(destination,'wx',file.mode&0o111?0o555:0o444);try{await fd.writeFile(bytes);await fd.sync();}finally{await fd.close();}}
  const copied=await artifactManifest(join(temp,'artifact'));requireThat(canonicalJson(copied)===canonicalJson(files),'INTEGRITY_FAILURE');
  for(const file of files)await syncDirectory(resolve(temp,'artifact',file.path,'..'));
  const release={releaseId,...body,signature:this.mac({releaseId,...body})};await durableRecord(join(temp,'release.json'),release);await syncDirectory(join(temp,'artifact'));await syncDirectory(temp);
  const target=join(this.root,'releases',releaseId.slice(7));try{await rename(temp,target);}catch(e){if(!['EEXIST','ENOTEMPTY'].includes(/** @type {NodeJS.ErrnoException} */(e).code??''))throw e;await rm(temp,{recursive:true,force:true});}
  await syncDirectory(join(this.root,'releases'));const verified=await this.read(releaseId);requireThat(verified,'INTEGRITY_FAILURE');return verified;
 }catch(e){await rm(temp,{recursive:true,force:true});throw e;}
 }
 /** @param {string} releaseId @returns {Promise<Release|null>} */
 async read(releaseId){digest(releaseId);const record=/** @type {Release|null} */(await readRecord(join(this.root,'releases',releaseId.slice(7),'release.json')));if(!record)return null;
 const {signature,...body}=record;digest(signature);requireThat(record.releaseId===releaseId&&this.mac(body).length===signature.length&&timingSafeEqual(Buffer.from(this.mac(body)),Buffer.from(signature)),'INTEGRITY_FAILURE','Release attestation');this.checkMetadata(record.metadata);
 const expected=recordDigest('dev2.release.v1',{metadata:record.metadata,files:record.files,artifactDigest:record.artifactDigest});requireThat(expected===releaseId,'INTEGRITY_FAILURE');
 const files=await artifactManifest(join(this.root,'releases',releaseId.slice(7),'artifact'));requireThat(canonicalJson(files)===canonicalJson(record.files)&&recordDigest('dev2.release-artifact.v1',files)===record.artifactDigest,'INTEGRITY_FAILURE','Staged release bytes changed');return record;
 }
 async active(){const value=/** @type {{releaseId:string}|null} */(await readRecord(join(this.root,'active.json')));if(!value)return null;digest(value.releaseId);requireThat(Object.keys(value).length===1,'INTEGRITY_FAILURE');return value.releaseId;}
 /** Caller owns the installation activation lock. @param {string|null} expected @param {string} next */
 async switch(expected,next){requireThat(await this.active()===expected,'STALE_RELEASE');requireThat(await this.read(next),'INTEGRITY_FAILURE','Unverified release');await durableRecord(join(this.root,'active.json'),{releaseId:next});}
}
