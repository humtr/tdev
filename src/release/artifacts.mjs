import {mkdir,mkdtemp,readFile,writeFile,open,rename,rm,readdir,lstat,realpath} from 'node:fs/promises';
import {isAbsolute,resolve,join} from 'node:path';
import {canonicalJson,parseRecord,bytesDigest} from '../contracts/canonical.mjs';
import {digest} from '../contracts/identity.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {releaseManifest,releaseIdentity} from './manifest.mjs';
/** @typedef {import('./types.js').ReleaseManifest} Manifest */
/** @typedef {{device:string,edge:string,tools:string}} ArtifactRefs */
/** @param {string} directory */
async function syncDirectory(directory){const fd=await open(directory,'r');try{await fd.sync();}finally{await fd.close();}}
/** @param {string} path @param {Uint8Array} bytes */
async function immutableFile(path,bytes){const fd=await open(path,'wx',0o400);try{await fd.writeFile(bytes);await fd.sync();}finally{await fd.close();}}
/** A release is fixed named byte artifacts, never a candidate-selected archive,
 * path, package script, symlink or host executable. Native/helper read the same
 * content-addressed directory and verify it again before activation.
 */
export class ReleaseArtifactStore {
 /** @param {{root:string,objects:import('../contracts/ports.js').ObjectStorePort,schemaDigest:string,maxArtifactBytes?:number}} options */
 constructor(options){requireThat(isAbsolute(options.root)&&resolve(options.root)===options.root,'INVALID_ARGUMENT');digest(options.schemaDigest);this.o=options;this.max=options.maxArtifactBytes??16777216;requireThat(Number.isSafeInteger(this.max)&&this.max>0&&this.max<=33554432,'INVALID_ARGUMENT');}
 async init(){await mkdir(this.o.root,{recursive:true,mode:0o700});const stat=await lstat(this.o.root);requireThat(stat.isDirectory()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0&&await realpath(this.o.root)===this.o.root,'FORBIDDEN','Release artifact directory must be private and unaliased');}
 /** @param {string} releaseId */
 directory(releaseId){return join(this.o.root,digest(releaseId).slice(7));}
 /** @param {Manifest} manifest @param {ArtifactRefs} refs */
 async stage(manifest,refs){
  const checked=releaseManifest(manifest),releaseId=releaseIdentity(checked);requireThat(checked.schemaDigest===this.o.schemaDigest&&refs.device===checked.device.artifactDigest&&refs.edge===checked.edge.artifactDigest,'INTEGRITY_FAILURE');
  for(const value of Object.values(refs))digest(value);await this.init();
  const files=new Map([['device.cjs',refs.device],['worker.mjs',refs.edge],['tools.json',refs.tools]]),temporary=await mkdtemp(join(this.o.root,'.stage-')),directory=this.directory(releaseId);
  try{
   for(const [name,expected] of files){const bytes=await this.o.objects.get(expected);requireThat(bytes.byteLength>0&&bytes.byteLength<=this.max&&bytesDigest(bytes)===expected,'INTEGRITY_FAILURE','Release object digest or bound differs');
    if(name==='tools.json'){requireThat(bytes.byteLength<=262144,'LIMIT_EXCEEDED');const tools=/** @type {{name:string,annotations:{readOnlyHint:boolean,destructiveHint:boolean}}[]} */(/** @type {unknown} */(parseRecord(bytes,262144)));requireThat(Array.isArray(tools)&&tools.length===4&&tools.map(t=>t.name).sort().join(',')==='dev_context,dev_observe,dev_read,dev_work'&&tools.every(t=>t.annotations?.readOnlyHint===true&&t.annotations.destructiveHint===false),'INTEGRITY_FAILURE','Frozen public metadata policy changed');}
    await immutableFile(join(temporary,name),bytes);
   }
   await immutableFile(join(temporary,'manifest.json'),Buffer.from(canonicalJson(checked)));
   await immutableFile(join(temporary,'artifacts.json'),Buffer.from(canonicalJson(refs)));
   await syncDirectory(temporary);
   try{await rename(temporary,directory);await syncDirectory(this.o.root);}catch(error){if(!error||typeof error!=='object'||!('code'in error)||!['EEXIST','ENOTEMPTY'].includes(String(error.code)))throw error;}
   return await this.verify(releaseId,checked,refs);
  }finally{await rm(temporary,{recursive:true,force:true});}
 }
 /** This method parses data only; staged runtime code is never imported.
  * @param {string} releaseId @param {Manifest} [expectedManifest] @param {ArtifactRefs} [expectedRefs] */
 async verify(releaseId,expectedManifest,expectedRefs){
  await this.init();const directory=this.directory(releaseId);const stat=await lstat(directory);requireThat(stat.isDirectory()&&!stat.isSymbolicLink()&&await realpath(directory)===directory&&(stat.mode&0o077)===0,'FORBIDDEN');
  requireThat((await readdir(directory)).sort().join(',')==='artifacts.json,device.cjs,manifest.json,tools.json,worker.mjs','INTEGRITY_FAILURE','Unexpected release artifact');
  /** @param {string} name @param {number} limit */
  const file=async(name,limit)=>{const path=join(directory,name),info=await lstat(path);requireThat(info.isFile()&&!info.isSymbolicLink()&&info.nlink===1&&(info.mode&0o077)===0&&info.size<=limit&&await realpath(path)===path,'FORBIDDEN');return readFile(path);};
  const manifest=releaseManifest(/** @type {Manifest} */(parseRecord(await file('manifest.json',262144),262144))),refs=/** @type {ArtifactRefs} */(parseRecord(await file('artifacts.json',4096),4096));
  requireThat(releaseIdentity(manifest)===releaseId&&manifest.schemaDigest===this.o.schemaDigest&&Object.keys(refs).sort().join(',')==='device,edge,tools'&&refs.device===manifest.device.artifactDigest&&refs.edge===manifest.edge.artifactDigest,'INTEGRITY_FAILURE');
  if(expectedManifest)requireThat(canonicalJson(expectedManifest)===canonicalJson(manifest),'INTEGRITY_FAILURE');if(expectedRefs)requireThat(canonicalJson(expectedRefs)===canonicalJson(refs),'INTEGRITY_FAILURE');
  for(const [name,expected] of [['device.cjs',refs.device],['worker.mjs',refs.edge],['tools.json',refs.tools]])requireThat(bytesDigest(await file(name,this.max))===digest(expected),'INTEGRITY_FAILURE','Immutable staged bytes changed');
  return {releaseId,directory,manifest,refs};
 }
}
