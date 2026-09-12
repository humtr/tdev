import {mkdir,mkdtemp,readFile,lstat,realpath,rm} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {parseArgs} from 'node:util';
import {requireThat} from '../src/contracts/errors.mjs';
import {parseRecord,bytesDigest} from '../src/contracts/canonical.mjs';
import {BUILD_NAMES,BUILD_DATA_BYTES,encodeBuildOutput} from '../src/release/build-output.mjs';
/** Executed only in the approved sandbox (or explicit test fixture). The two
 * source build scripts run with no inherited credentials and may write only
 * sandbox scratch. Their stdout is not the artifact protocol or a receipt.
 * @param {string} source @param {string} output */
export async function buildRelease(source,output){
 requireThat(isAbsolute(source)&&resolve(source)===source&&isAbsolute(output)&&resolve(output)===output&&await realpath(source)===source,'INVALID_ARGUMENT');
 const within=relative(source,output);requireThat(within==='..'||within.startsWith('../'),'FORBIDDEN','Build output must be outside immutable source');
 await mkdir(output,{recursive:true,mode:0o700});requireThat(await realpath(output)===output,'FORBIDDEN');
 const directory=await mkdtemp(join(output,'build-'));
 try{
  for(const name of ['build-device.mjs','build-edge.mjs']){
   const script=join(source,'tools',name),info=await lstat(script);requireThat(info.isFile()&&!info.isSymbolicLink()&&await realpath(script)===script,'FORBIDDEN');
   const child=spawnSync(process.execPath,[script,directory],{cwd:source,env:{HOME:directory,TMPDIR:directory,PATH:'/usr/local/bin:/usr/bin:/bin'},timeout:90000,killSignal:'SIGKILL',maxBuffer:65536,encoding:'utf8'});
   requireThat(!child.error&&child.status===0&&!child.signal,'VALIDATION_FAILED','Finite sandbox '+name+' failed');
  }
  /** @type {Record<string,Uint8Array>} */const files={};let total=0;
  for(const name of BUILD_NAMES){const path=join(directory,name),before=await lstat(path);requireThat(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&before.size>0&&before.size<=BUILD_DATA_BYTES&&await realpath(path)===path,'INTEGRITY_FAILURE','Bounded regular build artifact required');
   const bytes=await readFile(path),after=await lstat(path);total+=bytes.length;requireThat(total<=BUILD_DATA_BYTES&&before.ino===after.ino&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&bytes.length===before.size,'INTEGRITY_FAILURE');files[name]=bytes;
  }
  const device=/** @type {{schemaDigest:string,bundleDigest:string}} */(parseRecord(await readFile(join(directory,'device-manifest.json')),65536));
  const edge=/** @type {{schemaDigest:string,edgeBundleDigest:string}} */(parseRecord(await readFile(join(directory,'manifest.json')),65536));
  requireThat(device.schemaDigest===edge.schemaDigest&&device.bundleDigest===bytesDigest(files['device.cjs'])&&edge.edgeBundleDigest===bytesDigest(files['worker.mjs']),'INTEGRITY_FAILURE','Component build manifests differ from output bytes');
  return encodeBuildOutput(device.schemaDigest,files);
 }finally{await rm(directory,{recursive:true,force:true});}
}
/** @param {string[]} argv */
export async function main(argv){const args=parseArgs({args:argv,options:{source:{type:'string'},output:{type:'string'}},strict:true,allowPositionals:false}).values;requireThat(args.source&&args.output,'INVALID_ARGUMENT');const bytes=await buildRelease(args.source,args.output);await new Promise((done,reject)=>process.stdout.write(bytes,error=>error?reject(error):done(undefined)));}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(()=>{console.error('Finite release build failed');process.exitCode=1;});
