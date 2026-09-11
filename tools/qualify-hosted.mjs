import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir,realpath,readlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,delimiter} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {PodmanSandbox,attemptName} from '../src/execution/podman.mjs';
import {bytesDigest,recordDigest} from '../src/contracts/canonical.mjs';
import {requireThat} from '../src/contracts/errors.mjs';
/** Trusted bounded live falsifier, not an installation seal and not a public
 * command interface. A tag is resolved only for inventory; execution uses the
 * immutable provider image digest returned by this particular pull. No candidate,
 * device key, canonical writer or Cloudflare credential is loaded here.
 */
async function main(){
 requireThat(process.platform==='linux'&&typeof process.getuid==='function'&&process.getuid()!==0,'EXECUTION_UNAVAILABLE','Rootless Linux required');
 const root=await realpath(await mkdtemp(join(tmpdir(),'dev2-hosted-probe-')));
 const executable=execFileSync('/bin/sh',['-c','command -v podman'],{encoding:'utf8',timeout:5000}).trim();
 const environment={PATH:process.env.PATH??'',HOME:process.env.HOME??'',XDG_RUNTIME_DIR:process.env.XDG_RUNTIME_DIR??'/run/user/'+process.getuid(),DEV2_HOST_CANARY:'must-not-cross-the-container-boundary'};
 /** @param {string[]} argv @param {number} [timeout] */
 const command=(argv,timeout=30000)=>execFileSync(executable,argv,{encoding:'utf8',env:environment,timeout,maxBuffer:1048576});
 const version=command(['--version']).trim();const info=JSON.parse(command(['info','--format=json']));
 let seccompPath='';for(const path of ['/usr/share/containers/seccomp.json','/etc/containers/seccomp.json']){try{await readFile(path);seccompPath=path;break;}catch{}}
 requireThat(seccompPath,'EXECUTION_UNAVAILABLE','No enforcing seccomp profile installed');
 const seccompDigest=bytesDigest(await readFile(seccompPath));
 const inventoryImage='docker.io/library/node:24-bookworm-slim';command(['pull','--quiet',inventoryImage],180000);
 const [image]=JSON.parse(command(['image','inspect',inventoryImage]));
 const imageDigest=image.Digest;requireThat(/^sha256:[a-f0-9]{64}$/.test(imageDigest),'INTEGRITY_FAILURE');
 const immutableImage='docker.io/library/node@'+imageDigest;
 const attempt={installationId:'hosted-qualification',repositoryId:'github-'+process.env.GITHUB_REPOSITORY_ID,workId:'negative-boundary',actionId:'probe',attemptId:'a'+process.env.GITHUB_RUN_ID,attempt:'1',ownerEpoch:'1'};
 const canary=join(root,'host-canary');await writeFile(canary,'not a real credential',{mode:0o600});
 const sourceRoot=join(root,attemptName(attempt),'source');await mkdir(sourceRoot,{recursive:true,mode:0o700});await writeFile(join(sourceRoot,'immutable'),'fixed source\n');
 const script=`const fs=require('node:fs');const net=require('node:net');(async()=>{const status=fs.readFileSync('/proc/self/status','utf8');const fact={environment:Object.keys(process.env).sort(),status:Object.fromEntries(['CapEff','NoNewPrivs','Seccomp'].map(k=>[k,status.match(new RegExp('^'+k+':\\\\s*(.*)$','m'))?.[1]??null])),namespaces:Object.fromEntries(['pid','mnt','user','net','ipc','uts','cgroup'].map(k=>[k,fs.readlinkSync('/proc/self/ns/'+k)])),limits:Object.fromEntries(['memory.max','pids.max','cpu.max'].map(k=>[k,fs.readFileSync('/sys/fs/cgroup/'+k,'utf8').trim()])),hostCanaryReadable:false,sourceWritable:false,networkReachable:false};try{fs.readFileSync(${JSON.stringify(canary)});fact.hostCanaryReadable=true;}catch{}try{fs.writeFileSync('/source/immutable','changed');fact.sourceWritable=true;}catch{}await new Promise(resolve=>{const socket=net.connect({host:'169.254.169.254',port:80});const end=()=>{socket.destroy();resolve();};socket.setTimeout(500,end);socket.once('error',end);socket.once('connect',()=>{fact.networkReachable=true;end();});});console.log(JSON.stringify(fact));})().catch(()=>process.exit(2));`;
 const fields={profileId:'hosted-boundary',argv:['/usr/local/bin/node','-e',script],cwd:'',parameters:{},timeoutMs:10000,killGraceMs:1000,memoryBytes:268435456,pids:32,cpuMillis:1000,diskBytes:67108864,logBytes:65536,network:/** @type {const} */('none'),imageDigest,replaySafe:true};
 const profile={...fields,digest:recordDigest('dev2.profile.v1',fields)};
 const options={executable,environment,attemptRoot:root,seccompPath,seccompDigest,images:{[imageDigest]:immutableImage},productionSeal:true,materialize:async()=>sourceRoot};
 const sandbox=new PodmanSandbox(options);const source={treeOid:'sha1:'+'1'.repeat(40),manifestDigest:bytesDigest(Buffer.from('trusted fixed qualification input')),entries:[]};
 const before=Date.now();let observed=await sandbox.launch(attempt,profile,source);
 while(observed.state==='running'&&Date.now()-before<20000){await delay(100);observed=await sandbox.inspect(attempt,{profileDigest:profile.digest,sourceManifest:source.manifestDigest});}
 const logs=command(['logs',attemptName(attempt)]);
 console.log(JSON.stringify({kind:'hosted-boundary-inventory',productionSealed:false,version,rootless:info.host?.security?.rootless,cgroupVersion:info.host?.cgroupVersion,controllers:info.host?.cgroupControllers,imageDigest,seccompDigest,observation:observed,logs}));
 requireThat(observed.state==='exited'&&observed.exitCode===0,'EXECUTION_UNAVAILABLE','Exact container invocation failed');
 const facts=JSON.parse(logs.trim());
 requireThat(facts.hostCanaryReadable===false&&facts.sourceWritable===false&&facts.networkReachable===false,'INTEGRITY_FAILURE','Credential/source/network boundary failed');
 requireThat(facts.status.CapEff==='0000000000000000'&&facts.status.NoNewPrivs==='1'&&facts.status.Seccomp==='2','INTEGRITY_FAILURE','Kernel enforcement missing');
 requireThat(JSON.stringify(facts.environment)===JSON.stringify(['HOME','PATH','TMPDIR']),'INTEGRITY_FAILURE','Unexpected container environment');
 for(const name of ['pid','mnt','user','net','ipc','uts','cgroup'])requireThat(facts.namespaces[name]!==await readlink('/proc/self/ns/'+name),'INTEGRITY_FAILURE','Shared namespace: '+name);
 requireThat(facts.limits['memory.max']==='268435456'&&facts.limits['pids.max']==='32'&&facts.limits['cpu.max'].split(' ')[0]!=='max','INTEGRITY_FAILURE','Missing cgroup limit');
 requireThat((await readFile(join(sourceRoot,'immutable'),'utf8'))==='fixed source\n','INTEGRITY_FAILURE');
 console.log(JSON.stringify({kind:'hosted-boundary-probe',status:'passed',productionSealed:false,imageDigest,seccompDigest,profileDigest:profile.digest,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,sourceCommit:process.env.GITHUB_SHA,facts}));
}
main().catch(error=>{console.error(JSON.stringify({kind:'hosted-boundary-probe',status:'failed',productionSealed:false,code:error?.code??'EXECUTION_UNAVAILABLE',message:String(error?.message??error).slice(0,1024)}));process.exitCode=1;});
