import {selectExecutionVariant,executionToolVersions} from '../src/runtime/environment.mjs';
import {selectRequiredTests,requiredTypecheck} from '../src/validation/selection.mjs';
import {readFileSync,readdirSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,relative,join,dirname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {parseArgs} from 'node:util';
import {bytesDigest,recordDigest} from '../src/contracts/canonical.mjs';
const controller=resolve(dirname(fileURLToPath(import.meta.url)),'..');
/** @param {string} directory @returns {string[]} */
function files(directory){if(!existsSync(directory))return [];return readdirSync(directory,{withFileTypes:true}).flatMap(e=>{const p=join(directory,e.name);if(e.isSymbolicLink())throw Error('Symlink in validation inputs');if(!e.isDirectory()&&!e.isFile())throw Error('Special validation input');return e.isDirectory()?files(p):[p];}).sort();}
/** @param {string} root */
function inputIdentity(root){const paths=[...['src','tools','test','config','bench','deploy','.github'].flatMap(p=>files(join(root,p))),...['AGENTS.md','DIRECTIVE.md','RULE.md','WORKBOARD.md','package.json','package-lock.json','jsconfig.json','.node-version','docs/ARCHITECTURE.md'].map(p=>join(root,p)),...files(join(root,'docs/design'))].filter(p=>!p.includes('__pycache__')&&!p.endsWith('.pyc'));return recordDigest('dev2.validation-inputs.v1',paths.sort().map(p=>({path:relative(root,p),digest:bytesDigest(readFileSync(p))})));}
/** The trusted controller remains alive while children run. It reads the kernel
 * cgroup counters after their exit, before Podman can remove the cgroup. Child
 * stdout, exit137 and Podman's OOMKilled flag are never used to infer an OOM. */
function managedKernel(){
 const raw=readFileSync('/sys/fs/cgroup/memory.events','utf8');if(raw.length>4096)throw Error('Memory events bound');
 const events=Object.fromEntries(raw.trim().split('\n').map(line=>{const [key,value]=line.split(' ');if(!/^[a-z_]+$/.test(key)||!/^(0|[1-9][0-9]*)$/.test(value)||!Number.isSafeInteger(Number(value)))throw Error('Kernel event format');return [key,Number(value)];}));
 for(const key of ['oom','oom_kill'])if(!Number.isSafeInteger(events[key]))throw Error('Kernel OOM evidence missing');
 const memory=readFileSync('/sys/fs/cgroup/memory.max','utf8').trim(),pids=readFileSync('/sys/fs/cgroup/pids.max','utf8').trim(),cpu=readFileSync('/sys/fs/cgroup/cpu.max','utf8').trim().split(' ');
 if(![memory,pids,...cpu].every(v=>/^[1-9][0-9]*$/.test(v)&&Number.isSafeInteger(Number(v)))||cpu.length!==2)throw Error('Finite kernel limits unavailable');
 return {events,memoryBytes:Number(memory),pids:Number(pids),cpuQuota:Number(cpu[0]),cpuPeriod:Number(cpu[1])};
}
/** Canonical trusted entrypoint; source cannot select policy/commands/config.
 * --environment is a fixed installation argv, not a public profile parameter.
 * @param {string[]} argv @returns {number} */
export function main(argv){
 let args;try{args=parseArgs({args:argv,options:{profile:{type:'string'},output:{type:'string'},source:{type:'string'},environment:{type:'string'}},strict:true,allowPositionals:false}).values;if(!args.profile||!args.output||args.source!==undefined&&!isAbsolute(args.source)||args.environment!==undefined&&(args.environment!=='managed-image'||!args.source))throw Error();}catch{console.error('Usage: node tools/validate.mjs --profile <core|integration|release|live|benchmark> --output <directory> [--source <absolute candidate root> --environment managed-image]');return 1;}
 const root=args.source?resolve(args.source):controller,profile=args.profile,output=resolve(args.output),isolated=root!==controller,environment=args.environment??'native';
 if(environment==='managed-image'&&!isolated)throw Error('Managed controller must be separate from source');
 const within=relative(root,output);if(!(within==='..'||within.startsWith('../')||!isolated&&(within==='.artifacts'||within.startsWith('.artifacts/')))){console.error('Output must be outside managed source or under local .artifacts');return 1;}
 /** @type {{schemaVersion:number,profiles:Record<string,{implemented:boolean,testDirectory:string,timeoutMs:number,network:string,requires:string[]}>}} */const config=JSON.parse(readFileSync(join(controller,'config/validation-profiles.json'),'utf8'));
 if(!Object.hasOwn(config.profiles,profile)){console.error('Unknown profile');return 1;}const descriptor=config.profiles[profile],lockBytes=readFileSync(join(controller,'config/toolchain.lock.json'));
 /** @type {{executionVariants:import('../src/runtime/environment.mjs').ExecutionVariant[],node:{version:string},git:{version:string},managedImage?:{imageDigest:string,executionVariant:string,gitVersion:string,pythonVersion:string}}} */const lock=JSON.parse(lockBytes.toString());
 mkdirSync(output,{recursive:true});const started=performance.now(),startedAt=new Date().toISOString(),inputDigest=inputIdentity(root),kernelBefore=environment==='managed-image'?managedKernel():null;
 /** @type {Array<{name:string,status:string,exitCode:number|null,signal:string|null,durationMs:number,logDigest:string|null}>} */const checks=[];let code=0,interrupted=false;
 /** @param {string} name @param {string} executable @param {string[]} arguments_ @param {number} timeout @param {((stdout:string)=>boolean)|undefined} [accept] */
 function check(name,executable,arguments_,timeout,accept){const t=performance.now(),r=spawnSync(executable,arguments_,{cwd:root,encoding:'utf8',timeout,maxBuffer:16*1024*1024,killSignal:'SIGKILL',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',NO_COLOR:'1'}});const log=Buffer.from((r.stdout??'')+(r.stderr??''));writeFileSync(join(output,name+'.log'),log);const missing=r.error&&'code'in r.error&&r.error.code==='ENOENT',timed=r.error&&'code'in r.error&&r.error.code==='ETIMEDOUT';const status=missing?'not_run':timed?'cancelled':r.status===0&&(!accept||accept(r.stdout??''))?'passed':'failed';checks.push({name,status,exitCode:r.status,signal:r.signal,durationMs:Math.ceil(performance.now()-t),logDigest:bytesDigest(log)});if(timed){code=3;interrupted=true;}else if(status==='failed')code=1;else if(missing&&code===0)code=2;}
 /** @param {string} name @param {'not_run'|'failed'} status */
 function absent(name,status){checks.push({name,status,exitCode:status==='failed'?1:null,signal:null,durationMs:0,logDigest:null});code=status==='failed'?1:2;}
 /** @type {Readonly<import('../src/runtime/environment.mjs').ExecutionVariant>|null} */let variant=null;
 try{variant=selectExecutionVariant(lock,{node:process.versions.node,platform:process.platform,arch:process.arch,sqlite:process.versions.sqlite??null});}catch(error){if(!(error&&typeof error==='object'&&'code'in error&&error.code==='EXECUTION_UNAVAILABLE'))throw error;}
 const versions=variant?executionToolVersions(lock,variant,environment):null,approvedLock=bytesDigest(readFileSync(join(controller,'package-lock.json'))),candidateLock=bytesDigest(readFileSync(join(root,'package-lock.json')));
 if(variant===null)absent('node.pin','not_run');
 else if(candidateLock!==approvedLock)absent('npm.approved-lock','failed');
 else if(profile==='core'&&!existsSync(join(controller,'node_modules/typescript/bin/tsc')))absent('npm.lock','not_run');
 else if(!descriptor.implemented)absent('implementation','not_run');
 else{
  if(profile==='core'){
   if(versions?.python)check('python.pin','python3',['--version'],10000,text=>text.trim()==='Python '+versions.python);else check('python.minimum','python3',['-c','import sys;sys.exit(0 if sys.version_info >= (3,12) else 2)'],10000);
   if(code===0){const paths=['src','tools','test/fixtures','bench'].flatMap(p=>files(join(root,p))).map(p=>relative(root,p));const plan=requiredTypecheck(root,paths,JSON.parse(readFileSync(join(controller,'jsconfig.json'),'utf8')));const project=join(output,'required-tsconfig.json');writeFileSync(project,JSON.stringify(plan));check('jsdoc',process.execPath,[join(controller,'node_modules/typescript/bin/tsc'),'--project',project,'--noEmit'],60000);}
   if(code===0)check('designs','python3',[join(controller,'docs/design/check.py'),'--root',root],30000);
  }
  if(profile==='integration'&&code===0)check('git.pin','git',['--version'],10000,text=>text.trim()==='git version '+versions?.git);
  const candidate=files(join(root,descriptor.testDirectory)).filter(p=>p.endsWith('.test.mjs')).map(p=>relative(root,p));let tests=candidate;
  if(code===0&&['core','integration'].includes(profile)){
   const selection=join(controller,'validation-selection.json'),approved=existsSync(selection)?JSON.parse(readFileSync(selection,'utf8')).tests[profile]:files(join(controller,descriptor.testDirectory)).filter(p=>p.endsWith('.test.mjs')).map(p=>relative(controller,p));tests=selectRequiredTests(profile,approved,candidate);
  }
  if(code===0&&tests.length)check('tests',process.execPath,['--test','--test-concurrency=4','--test-reporter=tap',...tests.map(p=>join(root,p))],descriptor.timeoutMs);else if(code===0)absent('tests','not_run');
 }
 const outputInputDigest=inputIdentity(root);if(inputDigest!==outputInputDigest)absent('input.integrity','failed');
 const kernelAfter=kernelBefore?managedKernel():null;
 if(kernelBefore&&kernelAfter&&(kernelAfter.events.oom_kill!==kernelBefore.events.oom_kill||kernelAfter.events.oom!==kernelBefore.events.oom||kernelAfter.memoryBytes!==kernelBefore.memoryBytes||kernelAfter.pids!==kernelBefore.pids||kernelAfter.cpuQuota!==kernelBefore.cpuQuota||kernelAfter.cpuPeriod!==kernelBefore.cpuPeriod))absent('kernel.resources','failed');
 const result={schemaVersion:1,layer:profile,status:code===0?'passed':code===2?'not_run':interrupted?'cancelled':'failed',exitCode:code,scope:'implemented-profile-only',installationEligibility:false,controllerMode:isolated?'installed-exact-source':'local-reviewed',startedAt,finishedAt:new Date().toISOString(),durationMs:Math.ceil(performance.now()-started),entrypointDigest:bytesDigest(readFileSync(fileURLToPath(import.meta.url))),inputDigest,outputInputDigest,profileDigest:recordDigest('dev2.validation-profile.v1',descriptor),toolchainLockDigest:bytesDigest(lockBytes),dependencyLockDigest:candidateLock,approvedDependencyLockDigest:approvedLock,execution:{environment,variantId:variant?.id??null,role:variant?.role??null,node:process.versions.node,nodeBinaryDigest:bytesDigest(readFileSync(process.execPath)),platform:process.platform,arch:process.arch,sqlite:process.versions.sqlite??null},kernelBefore,kernelAfter,checks};
 writeFileSync(join(output,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));return code;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{process.exitCode=main(process.argv.slice(2));}catch(error){console.error(error instanceof Error?error.message:'Validation failed');process.exitCode=1;}}
