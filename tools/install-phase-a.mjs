/** Bounded operator bootstrap installer, not a public shell/activation API.
 * Input is private installation state assembled from fresh provider/repository
 * readback. It never enrolls arbitrary callers or claims a production seal.
 */
import {readFile,writeFile,mkdir,chmod,lstat,realpath,rename,open} from 'node:fs/promises';
import {join,resolve,dirname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {parseArgs} from 'node:util';
import {bytesDigest,canonicalJson,recordDigest} from '../src/contracts/canonical.mjs';
import {id,oid} from '../src/contracts/identity.mjs';
import {requireThat} from '../src/contracts/errors.mjs';
import {privateFile} from '../src/runtime/native.mjs';
import {bootstrapPolicy} from '../src/validation/bootstrap-policy.mjs';
import {SCHEMA_DIGEST} from '../src/mcp/outputs.mjs';
/** @typedef {{schemaVersion:1,installationId:string,deviceId:string,root:string,configurationRoot:string,prefix:string,gitExecutable:string,githubExecutable:string,serviceName:string,origin:string,issuer:string,applicationAudience:string,accessApplicationId:string,workerName:string,expectedVersionId:string,retireClasses:string[],repositoryId:string,providerRepositoryId:string,remote:string,ref:string,ownerSubjectDigest:string,enrollmentEvidence:{kind:string,signatureVerified:boolean,observedAt:string},capacity:number}} Plan */
/** @param {string} path @param {string|Uint8Array} value @param {number} [mode] */
async function exactFile(path,value,mode=0o600){
 const bytes=Buffer.from(value);try{const existing=await lstat(path);requireThat(existing.isFile()&&!existing.isSymbolicLink()&&Buffer.from(await readFile(path)).equals(bytes),'INTEGRITY_FAILURE','Existing installation file differs');await chmod(path,mode);return;}catch(error){if(!(error&&typeof error==='object'&&'code' in error&&error.code==='ENOENT'))throw error;}
 const handle=await open(path,'wx',mode);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
 const directory=await open(dirname(path),'r');try{await directory.sync();}finally{await directory.close();}
}
/** @param {string} value */const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
async function main(){
 process.umask(0o077);const args=parseArgs({options:{plan:{type:'string'},build:{type:'string'},output:{type:'string'}},strict:true,allowPositionals:false}).values;
 requireThat(args.plan&&args.build&&args.output,'INVALID_ARGUMENT');const plan=/** @type {Plan} */(JSON.parse((await privateFile(resolve(args.plan))).toString()));
 requireThat(plan.schemaVersion===1&&plan.enrollmentEvidence.signatureVerified===true&&/^[a-f0-9]{64}$/.test(plan.ownerSubjectDigest),'FORBIDDEN','Explicit verified owner enrollment is required');
 id(plan.installationId);id(plan.deviceId);id(plan.repositoryId);id(plan.serviceName);requireThat(/^[A-Za-z0-9_-]+$/.test(plan.workerName)&&/^\d+$/.test(plan.providerRepositoryId),'INVALID_ARGUMENT');
 for(const p of [plan.root,plan.configurationRoot,plan.prefix,plan.gitExecutable,plan.githubExecutable])requireThat(isAbsolute(p),'INVALID_ARGUMENT');
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
 const git=(/** @type {string[]} */values)=>execFileSync(plan.gitExecutable,values,{cwd:root,encoding:'utf8',maxBuffer:1048576}).trim();
 requireThat(git(['status','--porcelain']).length===0,'STALE_REVISION','Install only coherent committed clean source');
 const rawHead=git(['rev-parse','HEAD']),rawTree=git(['rev-parse','HEAD^{tree}']);const sourceCommitOid=oid('sha1:'+rawHead),sourceTreeOid=oid('sha1:'+rawTree);
 const build=resolve(args.build),deviceBytes=await readFile(join(build,'device.cjs')),edgeBytes=await readFile(join(build,'worker.mjs'));
 const deviceManifest=JSON.parse(await readFile(join(build,'device-manifest.json'),'utf8')),edgeManifest=JSON.parse(await readFile(join(build,'manifest.json'),'utf8'));
 requireThat(deviceManifest.schemaDigest===SCHEMA_DIGEST&&edgeManifest.schemaDigest===SCHEMA_DIGEST&&deviceManifest.bundleDigest===bytesDigest(deviceBytes)&&edgeManifest.edgeBundleDigest===bytesDigest(edgeBytes),'INTEGRITY_FAILURE','Built artifact digest mismatch');
 const buildId=recordDigest('dev2.bootstrap-build.v1',{sourceCommitOid,sourceTreeOid,device:deviceManifest.bundleDigest,edge:edgeManifest.edgeBundleDigest,schemaDigest:SCHEMA_DIGEST}).slice(7);
 const releaseDirectory=join(plan.root,'releases',rawHead+'-'+buildId.slice(0,16)),installationDirectory=join(plan.root,'installations',plan.installationId);
 for(const directory of [plan.root,plan.configurationRoot,releaseDirectory,installationDirectory,join(installationDirectory,'private'),join(installationDirectory,'home'),join(installationDirectory,'tmp'),join(installationDirectory,'logs')]){await mkdir(directory,{recursive:true,mode:0o700});requireThat(await realpath(directory)===resolve(directory),'FORBIDDEN','Aliased installation path');}
 await exactFile(join(releaseDirectory,'device.cjs'),deviceBytes,0o400);await exactFile(join(releaseDirectory,'worker.mjs'),edgeBytes,0o400);
 await exactFile(join(releaseDirectory,'tools.json'),await readFile(join(build,'tools.json')),0o400);
 const privateDirectory=join(installationDirectory,'private'),deviceKeyFile=join(privateDirectory,'device-key'),cursorKeyFile=join(privateDirectory,'cursor-key');
 for(const [path,bytes] of [[deviceKeyFile,Buffer.from(randomBytes(48).toString('base64url'))],[cursorKeyFile,randomBytes(32)]]){
  try{await privateFile(/** @type {string} */(path));}catch(error){if(!(error&&typeof error==='object'&&'code' in error&&error.code==='ENOENT'))throw error;await exactFile(/** @type {string} */(path),/** @type {Buffer} */(bytes));}
 }
 const deviceKey=(await privateFile(deviceKeyFile)).toString().trim();
 const githubTokenFile=join(privateDirectory,'github-token'),gitAskpassFile=join(privateDirectory,'git-askpass.cjs');
 try{await privateFile(githubTokenFile);}catch(error){if(!(error&&typeof error==='object'&&'code' in error&&error.code==='ENOENT'))throw error;
  const token=execFileSync(plan.githubExecutable,['auth','token','--hostname','github.com'],{encoding:'utf8',maxBuffer:8192,stdio:['ignore','pipe','pipe']}).trim();requireThat(token.length>20,'UNAUTHORIZED');await exactFile(githubTokenFile,token);
 }
 const askpass='#!'+process.execPath+'\n'+"'use strict';\nconst fs=require('node:fs');const prompt=process.argv[2]||'';if(/username/i.test(prompt)){process.stdout.write('x-access-token\\n');}else if(/password/i.test(prompt)){const file=process.env.DEV2_GITHUB_TOKEN_FILE;const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||(s.mode&63)!==0)process.exit(1);process.stdout.write(fs.readFileSync(file,'utf8').trim()+'\\n');}else process.exit(1);\n";
 await exactFile(gitAskpassFile,askpass,0o700);
 const toolchainBytes=await readFile(join(root,'config/toolchain.lock.json')),dependencyBytes=await readFile(join(root,'package-lock.json'));
 const policy=bootstrapPolicy({toolchainDigest:bytesDigest(toolchainBytes),dependencyLockDigest:bytesDigest(dependencyBytes)}).policy;
 const binding={repositoryId:plan.repositoryId,installationId:plan.installationId,provider:/** @type {const} */('github'),providerRepositoryId:plan.providerRepositoryId,remote:plan.remote,ref:plan.ref,bindingEpoch:'1',policyDigest:policy.digest};
 const capabilities=/** @type {import('../src/contracts/ports.js').Capability[]} */(['repository.read','work.write','profile.run','integration.write','policy.write','runtime.activate']);
 const edge={installationId:plan.installationId,deviceId:plan.deviceId,origin:plan.origin,issuer:plan.issuer,applicationAudience:plan.applicationAudience,deviceCredentialDigest:bytesDigest(Buffer.from(deviceKey)),allowedOrigins:['https://chatgpt.com'],binding,
  grants:[{subject:plan.ownerSubjectDigest,repositoryId:plan.repositoryId,ref:plan.ref,capabilities}],applicationCapabilities:capabilities,sourceCommitOid,edgeBundleDigest:edgeManifest.edgeBundleDigest};
 const runtime={bundleDigest:deviceManifest.bundleDigest,schemaDigest:SCHEMA_DIGEST,sourceCommitOid,sourceTreeOid};
 const config={schemaVersion:1,edge,stateDirectory:installationDirectory,gitExecutable:plan.gitExecutable,githubTokenFile,gitAskpassFile,deviceKeyFile,cursorKeyFile,capacity:plan.capacity,actor:'dev-2 <dev2@users.noreply.github.com>',runtime,toolchain:JSON.parse(toolchainBytes.toString()),policy};
 const configFile=join(releaseDirectory,'native-config.json');await exactFile(configFile,canonicalJson(config)+'\n');
 const serviceDirectory=join(plan.prefix,'var/service',plan.serviceName),serviceStage=join(installationDirectory,'service-prepared');
 await mkdir(join(serviceStage,'log'),{recursive:true,mode:0o700});
 await exactFile(join(serviceStage,'down'),'');
 const run='#!'+join(plan.prefix,'bin/sh')+'\nexec 2>&1\numask 077\nexec '+quote(join(plan.prefix,'bin/env'))+' -i '+['PATH='+join(plan.prefix,'bin'),'HOME='+join(installationDirectory,'home'),'TMPDIR='+join(installationDirectory,'tmp'),'LANG=C.UTF-8'].map(quote).join(' ')+' '+quote(process.execPath)+' '+quote(join(releaseDirectory,'device.cjs'))+' --config '+quote(configFile)+'\n';
 await exactFile(join(serviceStage,'run'),run,0o700);
 await exactFile(join(serviceStage,'log/run'),'#!'+join(plan.prefix,'bin/sh')+'\numask 077\nexec '+quote(join(plan.prefix,'bin/svlogd'))+' -tt '+quote(join(installationDirectory,'logs'))+'\n',0o700);
 await exactFile(join(installationDirectory,'logs/config'),'s1048576\nn4\n',0o600);
 try{await lstat(serviceDirectory);requireThat((await readFile(join(serviceDirectory,'run'),'utf8'))===run,'INTEGRITY_FAILURE','Another service already uses this name');}catch(error){if(!(error&&typeof error==='object'&&'code' in error&&error.code==='ENOENT'))throw error;await rename(serviceStage,serviceDirectory);}
 let installedAt=new Date().toISOString();try{installedAt=JSON.parse((await privateFile(join(releaseDirectory,'installation.json'))).toString()).installedAt;}catch(error){if(!(error&&typeof error==='object'&&'code' in error&&error.code==='ENOENT'))throw error;}
 const manifest={schemaVersion:1,phase:'bootstrap',installedAt,installationId:plan.installationId,deviceId:plan.deviceId,origin:plan.origin,workerName:plan.workerName,accessApplicationId:plan.accessApplicationId,expectedVersionId:plan.expectedVersionId,retireClasses:plan.retireClasses,sourceCommitOid,sourceTreeOid,schemaDigest:SCHEMA_DIGEST,deviceBundleDigest:deviceManifest.bundleDigest,edgeBundleDigest:edgeManifest.edgeBundleDigest,releaseDirectory,installationDirectory,configFile,serviceDirectory,enrollmentEvidence:plan.enrollmentEvidence};
 await exactFile(join(releaseDirectory,'installation.json'),canonicalJson(manifest)+'\n');
 await exactFile(join(plan.configurationRoot,'installation.json'),canonicalJson(manifest)+'\n');
 await exactFile(resolve(args.output),canonicalJson(manifest)+'\n');console.log(JSON.stringify({installed:true,started:false,productionSealed:false,...manifest}));
}
main().catch(error=>{console.error(JSON.stringify({event:'install_failed',code:typeof error?.code==='string'?error.code:'EXECUTION_UNAVAILABLE',message:typeof error?.message==='string'&&error.message.length<256?error.message:'Installation failed'}));process.exitCode=1;});
