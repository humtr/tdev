import {readFile,writeFile,mkdir,mkdtemp,rm,realpath} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {PodmanSandbox,attemptName} from '../src/execution/podman.mjs';
import {boundedCommand} from '../src/execution/command.mjs';
import {materialize,inspectMaterialization} from '../src/candidate/materialize.mjs';
import {sourceManifest} from '../src/repository/entries.mjs';
import {bytesDigest,recordDigest} from '../src/contracts/canonical.mjs';
import {newId} from '../src/contracts/identity.mjs';
import {requireThat} from '../src/contracts/errors.mjs';
/** @typedef {import('../src/contracts/ports.js').Attempt} Attempt */
/** @typedef {import('../src/contracts/ports.js').Profile} Profile */
/** @typedef {import('../src/contracts/ports.js').SourceTree} SourceTree */
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');

/** This is an operator-reviewed qualification fixture on a disposable hosted VM,
 * not an installation seal and not an ordinary candidate execution fallback.
 * Every probe container uses the production adapter/arguments. Synthetic host
 * canaries never contain device, canonical writer or Cloudflare credentials.
 * @param {string} controlPath @param {number} port */
export function containmentProgram(controlPath,port){return `
import fs from 'node:fs';import net from 'node:net';import {spawn} from 'node:child_process';
const checks={};const evidence={node:process.version,uid:process.getuid()};
const denied=(path)=>{try{fs.readFileSync(path);return false;}catch(e){return ['ENOENT','EACCES','EPERM'].includes(e.code);}};
checks.hostFiles=[${JSON.stringify(controlPath)},'/home/runner/.gitconfig','/data/data/com.termux/files/home/.config/dev2/installation.json','/run/podman/podman.sock','/var/run/docker.sock'].every(denied);
checks.credentials=['GITHUB_TOKEN','GH_TOKEN','CLOUDFLARE_API_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN','DEV2_PROBE_CONTROL_CANARY'].every(k=>process.env[k]===undefined);
checks.procCredentials=!/DEV2_PROBE_CONTROL_CANARY=|ACTIONS_ID_TOKEN_REQUEST_TOKEN=|GITHUB_TOKEN=/.test(fs.readFileSync('/proc/1/environ','utf8'));
checks.nonRoot=process.getuid()!==0;
const status=fs.readFileSync('/proc/self/status','utf8');checks.noNewPrivileges=/^NoNewPrivs:\\s+1$/m.test(status);checks.noCapabilities=/^CapEff:\\s+0+$/m.test(status);checks.seccomp=/^Seccomp:\\s+2$/m.test(status);
try{fs.writeFileSync('/source/immutable.txt','changed');checks.sourceReadOnly=false;}catch(e){checks.sourceReadOnly=['EROFS','EACCES','EPERM'].includes(e.code);}
try{fs.writeFileSync('/etc/dev2-write-probe','changed');checks.rootReadOnly=false;}catch(e){checks.rootReadOnly=['EROFS','EACCES','EPERM'].includes(e.code);}
const limits={memory:fs.readFileSync('/sys/fs/cgroup/memory.max','utf8').trim(),pids:fs.readFileSync('/sys/fs/cgroup/pids.max','utf8').trim(),cpu:fs.readFileSync('/sys/fs/cgroup/cpu.max','utf8').trim()};evidence.limits=limits;
checks.memoryLimit=Number(limits.memory)>0&&Number(limits.memory)<=268435456;checks.pidLimit=Number(limits.pids)>0&&Number(limits.pids)<=48;const cpu=limits.cpu.split(' ').map(Number);checks.cpuLimit=cpu[0]>0&&cpu[0]/cpu[1]<=1;
const cannotConnect=(host,port)=>new Promise(resolve=>{const s=net.connect({host,port});let done=false;const end=value=>{if(done)return;done=true;s.destroy();resolve(value);};s.on('connect',()=>end(false));s.on('error',()=>end(true));s.setTimeout(600,()=>end(true));});
checks.hostLoopback=await cannotConnect('127.0.0.1',${port});checks.egress=await cannotConnect('1.1.1.1',443);
let full=false;try{const fd=fs.openSync('/work/quota','w');try{const b=Buffer.alloc(1048576,65);for(let n=0;n<40;n++)fs.writeSync(fd,b);}finally{fs.closeSync(fd);}}catch(e){full=e.code==='ENOSPC';}finally{try{fs.unlinkSync('/work/quota');}catch{}}checks.diskLimit=full;
const children=[];let pidDenied=false;for(let n=0;n<56;n++){const c=spawn('/usr/bin/sleep',['15'],{stdio:'ignore'});c.on('error',e=>{if(e.code==='EAGAIN')pidDenied=true;});children.push(c);}await new Promise(r=>setTimeout(r,250));for(const c of children){try{c.kill('SIGKILL');}catch{}}await Promise.all(children.map(c=>c.exitCode!==null||c.signalCode!==null||!c.pid?Promise.resolve():new Promise(r=>c.once('close',r))));checks.pidAdmission=pidDenied;
console.log(JSON.stringify({checks,evidence}));process.exitCode=Object.values(checks).every(v=>v===true)?0:1;
`;}

/** @param {string} origin */
async function oidcEvidence(origin){
 const endpoint=process.env.ACTIONS_ID_TOKEN_REQUEST_URL,credential=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
 requireThat(endpoint&&credential,'EXECUTION_UNAVAILABLE','Hosted OIDC is unavailable');
 const url=new URL(endpoint);requireThat(url.protocol==='https:'&&url.hostname.endsWith('.actions.githubusercontent.com'),'FORBIDDEN');
 const audience=origin+'/executor';url.searchParams.set('audience',audience);
 const response=await fetch(url,{headers:{authorization:'Bearer '+credential},redirect:'error',signal:AbortSignal.timeout(15000)});
 requireThat(response.ok,'EXECUTION_UNAVAILABLE','OIDC issuance failed');
 const body=/** @type {{value?:string}} */(await response.json());requireThat(typeof body.value==='string'&&body.value.length<32768,'INTEGRITY_FAILURE');
 const {payload}=await jwtVerify(body.value,createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks')),{issuer:'https://token.actions.githubusercontent.com',audience,algorithms:['RS256']});
 requireThat(payload.repository_id===process.env.GITHUB_REPOSITORY_ID&&payload.sha===process.env.GITHUB_SHA&&payload.run_id===process.env.GITHUB_RUN_ID&&payload.run_attempt===process.env.GITHUB_RUN_ATTEMPT&&payload.event_name==='push'&&payload.runner_environment==='github-hosted','FORBIDDEN');
 return {signatureVerified:true,audience,repositoryId:payload.repository_id,ownerId:payload.repository_owner_id,ref:payload.ref,sha:payload.sha,workflowRef:payload.workflow_ref,workflowSha:payload.workflow_sha,runId:payload.run_id,runAttempt:payload.run_attempt,tokenDigest:bytesDigest(Buffer.from(body.value)),nativeAssignmentVerified:false};
}

export async function runManagedProbe(){
 requireThat(process.platform==='linux'&&process.env.GITHUB_ACTIONS==='true','EXECUTION_UNAVAILABLE','Run only on the selected disposable hosted environment');
 const config=/** @type {{image:string,imageDigest:string,origin:string}} */(JSON.parse(await readFile(join(root,'config/managed-execution.json'),'utf8')));
 requireThat(config.image.endsWith('@'+config.imageDigest),'INTEGRITY_FAILURE');
 const output=join(root,'.artifacts/managed-probe');await mkdir(output,{recursive:true});
 const scratch=await mkdtemp(join(process.env.RUNNER_TEMP??tmpdir(),'dev2-containment-'));
 /** @type {Record<string,unknown>} */const report={schemaVersion:1,kind:'real-hosted-containment-qualification',productionSeal:false,status:'running',sourceCommit:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,startedAt:new Date().toISOString(),image:config.image};
 /** @type {Attempt[]} */const attempts=[];
 /** @type {PodmanSandbox|undefined} */let sandbox;
 const server=createServer((_q,r)=>{r.end('host-only-canary');});
 try{
  report.oidc=await oidcEvidence(config.origin);
  const executable=await realpath('/usr/bin/podman'),seccompPath=await realpath('/usr/share/containers/seccomp.json');
  // Private commissioning must select the observed engine bytes, not guess from
  // a package/version label. This qualification observation grants no authority.
  report.engineDigest=bytesDigest(await readFile(executable));
  const seccompDigest=bytesDigest(await readFile(seccompPath));report.seccompDigest=seccompDigest;
  /** @type {Record<string,string>} */const environment={PATH:process.env.PATH??'/usr/bin:/bin',HOME:process.env.HOME??scratch,LANG:'C.UTF-8'};
  for(const key of ['XDG_RUNTIME_DIR','DBUS_SESSION_BUS_ADDRESS'])if(process.env[key])environment[key]=/** @type {string} */(process.env[key]);
  const canary=randomBytes(32).toString('hex');for(const key of ['DEV2_PROBE_CONTROL_CANARY','GITHUB_TOKEN','CLOUDFLARE_API_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN'])environment[key]=canary;
  const controlPath=join(scratch,'control.sqlite');await writeFile(controlPath,canary,{mode:0o600});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(undefined));});const address=server.address();requireThat(address&&typeof address==='object','INTEGRITY_FAILURE');
  const attemptRoot=join(scratch,'attempts');await mkdir(attemptRoot);
  const program=containmentProgram(controlPath,address.port);
  const files=new Map([['probe.mjs',Buffer.from(program)],['immutable.txt',Buffer.from('immutable source\n')]]);
  const entries=[...files].map(([path,bytes])=>({path,mode:'100644',blobOid:'sha1:'+createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),contentDigest:bytesDigest(bytes),size:bytes.length}));
  const blobs=new Map(entries.map(e=>[e.blobOid,/** @type {Buffer} */(files.get(e.path))]));
  /** @type {SourceTree} */const source={treeOid:'sha1:'+'1'.repeat(40),manifestDigest:sourceManifest(entries),entries};
  let materializations=0;
  sandbox=new PodmanSandbox({executable,environment,attemptRoot,seccompPath,seccompDigest,images:{[config.imageDigest]:config.image},productionSeal:true,
   command:async(exe,args,options)=>{const result=await boundedCommand(exe,args,options);if(args[0]==='run'){
    const launches=/** @type {unknown[]} */(report.launches??=[]);launches.push({exitCode:result.exitCode,signal:result.signal,timedOut:result.timedOut,discardedBytes:result.discardedBytes,stdout:result.stdout.toString(),stderr:result.stderr.toString()});
    requireThat(result.exitCode===0&&!result.timedOut&&!result.spawnFailed,'EXECUTION_UNAVAILABLE','Managed probe launch was not acknowledged; inspect retained launch diagnostics');
   }return result;},
   materialize:async(attempt,tree)=>{materializations++;return materialize({blob:async oid=>{const b=blobs.get(oid);requireThat(b,'INTEGRITY_FAILURE');return b;}},tree,join(attemptRoot,attemptName(attempt),'source'));}});
  await sandbox.preflight();
  const info=await sandbox.call(['info','--format=json']);report.podman=JSON.parse(info.stdout.toString()).version;report.host=JSON.parse(info.stdout.toString()).host;
  const pull=await boundedCommand(executable,['pull',config.image],{environment,timeoutMs:240000,maxBytes:262144});
  requireThat(pull.exitCode===0&&!pull.timedOut&&!pull.spawnFailed,'EXECUTION_UNAVAILABLE','Pinned image pull failed');
  /** @param {string} name @param {readonly string[]} argv @param {number} timeoutMs @param {number} [memoryBytes] @returns {Profile} */
  const profile=(name,argv,timeoutMs,memoryBytes=268435456)=>{const p={profileId:name,argv,cwd:'',parameters:{},timeoutMs,killGraceMs:1000,memoryBytes,pids:48,cpuMillis:1000,diskBytes:33554432,logBytes:65536,network:/** @type {const} */('none'),imageDigest:config.imageDigest,replaySafe:true};return {...p,digest:recordDigest('dev2.profile.v1',p)};};
  const attempt=()=>{const a={installationId:'qualification',repositoryId:'github-'+process.env.GITHUB_REPOSITORY_ID,workId:newId(),actionId:newId(),attemptId:newId(),attempt:'1',ownerEpoch:'1'};attempts.push(a);return a;};
  /** Polling an uncertain physical transition is read-only. It is not permission
   * to restart the container or release its attempt. Keep bounded raw state
   * evidence when Podman moves through a state outside running/exited.
   * @param {Attempt} a */
  const finished=async a=>{const deadline=Date.now()+45000;let last='';for(;;){
   const state=await /** @type {PodmanSandbox} */(sandbox).inspect(a);
   if(state.state==='exited')return state;
   if(state.state!=='running'&&state.state!==last){
    const raw=await /** @type {PodmanSandbox} */(sandbox).call(['inspect','--format={{json .State}}',attemptName(a)],16384);
    const diagnostics=/** @type {unknown[]} */(report.transitions??=[]);diagnostics.push({attemptId:a.attemptId,observedAt:new Date().toISOString(),state:state.state,inspectExit:raw.exitCode,rawState:raw.stdout.toString(),stderr:raw.stderr.toString()});last=state.state;
   }
   requireThat(Date.now()<deadline,'EXECUTION_UNAVAILABLE','Container did not reach a verified terminal state within the bounded observation deadline');await delay(100);
  }};
  const a=attempt(),p=profile('containment',['/usr/local/bin/node','/source/probe.mjs'],30000);
  await sandbox.launch(a,p,source);const first=await sandbox.call(['inspect','--format={{.Id}}',attemptName(a)]);
  await sandbox.launch(a,p,source);const second=await sandbox.call(['inspect','--format={{.Id}}',attemptName(a)]);
  requireThat(first.exitCode===0&&second.exitCode===0&&first.stdout.equals(second.stdout)&&materializations===1,'INTEGRITY_FAILURE','Duplicate launch changed identity');
  const done=await finished(a),logs=await sandbox.call(['logs',attemptName(a)],65536);report.containmentExit=done.exitCode;report.containment=logs.stdout.toString().trim();
  requireThat(done.exitCode===0,'INTEGRITY_FAILURE','Containment falsifier failed');
  requireThat(await inspectMaterialization(source,join(attemptRoot,attemptName(a),'source'))===source.manifestDigest,'INTEGRITY_FAILURE');
  report.duplicateLaunch={sameContainer:true,materializations};
  const timed=attempt(),timeProfile=profile('deadline',['/usr/local/bin/node','-e','setTimeout(()=>{},60000)'],2000);const started=Date.now();await sandbox.launch(timed,timeProfile,source);const expired=await finished(timed);report.deadline={exitCode:expired.exitCode,elapsedMs:Date.now()-started};requireThat(expired.exitCode!==0&&Date.now()-started<12000,'INTEGRITY_FAILURE','Deadline not enforced');
  const cancelled=attempt();await sandbox.launch(cancelled,profile('cancel',['/usr/local/bin/node','-e','setTimeout(()=>{},60000)'],30000),source);let stopped=await sandbox.cancel(cancelled);if(stopped.state==='running')stopped=await finished(cancelled);requireThat(stopped.state==='exited','INTEGRITY_FAILURE');const repeated=await sandbox.cancel(cancelled);requireThat(repeated.state==='exited','INTEGRITY_FAILURE');report.cancellation={state:stopped.state,exitCode:stopped.exitCode,repeatedState:repeated.state};
  // Podman's OOMKilled flag is not the kernel's memory.events counter. Keep a
  // small parent alive after the allocating child exits so the trusted outer
  // controller can read the exact container cgroup rather than a global counter.
  // Linux cgroup-v2 documentation defines oom_kill as a killed-process count.
  const memory=attempt(),memoryProgram=`const {spawn}=require('node:child_process');setTimeout(()=>{const child=spawn(process.execPath,['-e',"require('node:fs').writeFileSync('/proc/self/oom_score_adj','500');const held=[];for(let i=0;i<64;i++)held.push(Buffer.alloc(8*1024*1024,65));"],{stdio:'ignore'});child.once('exit',(code,signal)=>{console.log(JSON.stringify({childCode:code,childSignal:signal}));setTimeout(()=>process.exit(signal==='SIGKILL'?42:43),5000);});},3000);`;
  await sandbox.launch(memory,profile('memory',['/usr/local/bin/node','-e',memoryProgram],20000,100663296),source);
  const initialDetails=await sandbox.call(['inspect','--format=json',attemptName(memory)]),initialState=JSON.parse(initialDetails.stdout.toString())[0].State;
  requireThat(initialState.Running===true&&Number.isSafeInteger(initialState.Pid)&&initialState.Pid>0,'EXECUTION_UNAVAILABLE','Memory observer requires a live exact container');
  const membership=await readFile('/proc/'+initialState.Pid+'/cgroup','utf8'),line=membership.split('\n').find(v=>v.startsWith('0::'));
  requireThat(line,'INTEGRITY_FAILURE','Missing cgroup-v2 membership');const cgroup=line.slice(3);
  requireThat(cgroup.startsWith('/')&&!cgroup.split('/').includes('..'),'INTEGRITY_FAILURE');
  const eventsPath='/sys/fs/cgroup'+cgroup+'/memory.events';
  const readEvents=async()=>{const text=await readFile(eventsPath,'utf8');requireThat(text.length<=4096,'LIMIT_EXCEEDED');return Object.fromEntries(text.trim().split('\n').map(v=>{const [key,value]=v.split(' ');requireThat(/^[0-9]+$/.test(value),'INTEGRITY_FAILURE');return [key,Number(value)];}));};
  const beforeEvents=await readEvents();let lastEvents=beforeEvents;const memoryDeadline=Date.now()+25000;
  for(;;){try{lastEvents=await readEvents();}catch{}const observed=await sandbox.inspect(memory);if(observed.state==='exited')break;requireThat(Date.now()<memoryDeadline,'EXECUTION_UNAVAILABLE','Memory fixture did not stop');await delay(100);}
  const oom=await finished(memory),details=await sandbox.call(['inspect','--format=json',attemptName(memory)]),state=JSON.parse(details.stdout.toString())[0].State;
  report.memory={exitCode:oom.exitCode,oomKilled:state.OOMKilled,cgroup,beforeEvents,lastEvents,state};
  requireThat(oom.exitCode!==0&&Number.isSafeInteger(beforeEvents.oom_kill)&&Number.isSafeInteger(lastEvents.oom_kill)&&lastEvents.oom_kill>beforeEvents.oom_kill,'INTEGRITY_FAILURE','Memory limit did not produce a verified kernel OOM kill');
  const tools=await boundedCommand(executable,['run','--rm','--network=none','--entrypoint=/bin/sh',config.image,'-c','node --version; git --version; python3 --version'],{environment,timeoutMs:30000,maxBytes:4096});report.imageToolchain={exitCode:tools.exitCode,versions:tools.stdout.toString().trim()};
  report.status='passed';
 }catch(error){report.status='failed';report.error=error instanceof Error?{name:error.name,code:'code'in error?String(error.code):null,message:error.message}:String(error);process.exitCode=1;}
 finally{
  if(sandbox)for(const a of attempts){await sandbox.call(['rm','--force',attemptName(a)],8192).catch(()=>{});}
  server.close();await rm(scratch,{recursive:true,force:true});report.finishedAt=new Date().toISOString();
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({kind:report.kind,status:report.status,productionSeal:false,reportDigest:bytesDigest(Buffer.from(JSON.stringify(report)))}));
 }
 return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await runManagedProbe();
