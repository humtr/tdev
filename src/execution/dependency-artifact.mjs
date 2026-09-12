import {readdir,lstat,readFile,writeFile,readlink,symlink,mkdir,rename,rm,mkdtemp,realpath,chmod} from 'node:fs/promises';
import {resolve,join,dirname,sep,isAbsolute} from 'node:path';
import {bytesDigest,canonicalJson,parseRecord,recordDigest} from '../contracts/canonical.mjs';
import {digest} from '../contracts/identity.mjs';
import {requireThat} from '../contracts/errors.mjs';
/** @typedef {{path:string,kind:'file'|'directory'|'symlink',executable?:boolean,digest?:string,target?:string,size?:number}} Entry */
/** @typedef {{schemaVersion:1,lockDigest:string,contentDigest:string,entries:Entry[]}} DependencyManifest */
/** @param {string} root */
export async function inspectDependencies(root){root=resolve(root);requireThat(await realpath(root)===root&&(await lstat(root)).isDirectory(),'FORBIDDEN','Dependency root');const entries=/** @type {Entry[]} */([]);let total=0;
 /** @param {string} path */
 const walk=async path=>{const names=(await readdir(join(root,path))).sort();for(const name of names){requireThat(name!=='.git'&&!/[\0\r\n]/.test(name),'FORBIDDEN','Reserved dependency entry');const relative=path?path+'/'+name:name,absolute=join(root,relative),stat=await lstat(absolute);requireThat(entries.length<32768,'LIMIT_EXCEEDED');
  if(stat.isDirectory()){entries.push({path:relative,kind:'directory'});await walk(relative);}
  else if(stat.isSymbolicLink()){const target=await readlink(absolute);requireThat(target.length>0&&target.length<=4096&&!isAbsolute(target)&&!target.includes('\0'),'FORBIDDEN','Dependency symlink');const resolved=await realpath(absolute);requireThat(resolved.startsWith(root+sep),'FORBIDDEN','Dependency link escapes artifact');entries.push({path:relative,kind:'symlink',target});}
  else{requireThat(stat.isFile()&&stat.nlink===1&&stat.size<=33554432,'FORBIDDEN','Dependency special file or hardlink');const bytes=await readFile(absolute);total+=bytes.length;requireThat(bytes.length===stat.size&&total<=134217728,'LIMIT_EXCEEDED');entries.push({path:relative,kind:'file',executable:!!(stat.mode&0o111),digest:bytesDigest(bytes),size:bytes.length});}
 }};await walk('');return {entries,contentDigest:recordDigest('dev2.dependency-artifact.v1',entries),totalBytes:total};
}
/** Copy only approved locked dependency bytes, never a checkout, credentials or
 * caller-selected install command. Source dependencies must already be installed
 * by the approved executor workflow with lifecycle scripts disabled. This function
 * performs no network access and never executes any dependency or candidate code.
 * The resulting artifact is immutable by digest and mounted read-only by Podman.
 * @param {{sourceDirectory:string,cacheDirectory:string,lockDigest:string}} options */
export async function prepareDependencies(options){digest(options.lockDigest);const source=resolve(options.sourceDirectory),cache=resolve(options.cacheDirectory);requireThat(isAbsolute(options.sourceDirectory)&&isAbsolute(options.cacheDirectory)&&source!==cache&&!cache.startsWith(source+sep)&&!source.startsWith(cache+sep),'FORBIDDEN');await mkdir(cache,{recursive:true,mode:0o700});requireThat(await realpath(cache)===cache,'FORBIDDEN');
 const input=await inspectDependencies(source),identity=recordDigest('dev2.locked-dependencies.v1',{lockDigest:options.lockDigest,contentDigest:input.contentDigest}),destination=join(cache,identity.slice(7)),temporary=await mkdtemp(join(cache,'.preparing-'));
 try{
  const content=join(temporary,'node_modules');await mkdir(content,{mode:0o755});
  for(const e of input.entries)if(e.kind==='directory')await mkdir(join(content,e.path),{recursive:true,mode:0o755});
  for(const e of input.entries)if(e.kind==='file'){const from=join(source,e.path),stat=await lstat(from);requireThat(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1,'INTEGRITY_FAILURE');const bytes=await readFile(from);requireThat(bytesDigest(bytes)===e.digest&&bytes.length===e.size,'INTEGRITY_FAILURE','Dependency changed during copy');await mkdir(dirname(join(content,e.path)),{recursive:true,mode:0o755});await writeFile(join(content,e.path),bytes,{flag:'wx',mode:e.executable?0o555:0o444});}
  for(const e of input.entries)if(e.kind==='symlink')await symlink(e.target??'',join(content,e.path));
  requireThat((await inspectDependencies(content)).contentDigest===input.contentDigest&&(await inspectDependencies(source)).contentDigest===input.contentDigest,'INTEGRITY_FAILURE','Dependency artifact changed');
  /** @type {DependencyManifest} */const manifest={schemaVersion:1,lockDigest:options.lockDigest,contentDigest:input.contentDigest,entries:input.entries};await writeFile(join(temporary,'manifest.json'),canonicalJson(manifest),{flag:'wx',mode:0o444});
  try{await rename(temporary,destination);}catch(error){if(!error||typeof error!=='object'||!('code'in error)||!['EEXIST','ENOTEMPTY'].includes(String(error.code)))throw error;}
  return await verifyDependencies(destination,options.lockDigest,identity);
 }finally{await rm(temporary,{recursive:true,force:true});}
}
/** @param {string} directory @param {string} lockDigest @param {string} [expectedIdentity] */
export async function verifyDependencies(directory,lockDigest,expectedIdentity){digest(lockDigest);directory=resolve(directory);requireThat(await realpath(directory)===directory,'FORBIDDEN');const raw=await readFile(join(directory,'manifest.json'));requireThat(raw.length<=8388608,'LIMIT_EXCEEDED');const manifest=/** @type {DependencyManifest} */(/** @type {unknown} */(parseRecord(raw,8388608)));requireThat(manifest.schemaVersion===1&&manifest.lockDigest===lockDigest&&Array.isArray(manifest.entries),'INTEGRITY_FAILURE','Dependency lock differs');
 const actual=await inspectDependencies(join(directory,'node_modules'));requireThat(canonicalJson(actual.entries)===canonicalJson(manifest.entries)&&actual.contentDigest===manifest.contentDigest,'INTEGRITY_FAILURE','Dependency artifact integrity');const identity=recordDigest('dev2.locked-dependencies.v1',{lockDigest,contentDigest:manifest.contentDigest});requireThat(expectedIdentity===undefined||identity===expectedIdentity,'INTEGRITY_FAILURE');
 return {identity,lockDigest,contentDigest:manifest.contentDigest,directory,nodeModules:join(directory,'node_modules'),totalBytes:actual.totalBytes};
}
