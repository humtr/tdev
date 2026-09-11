import {randomBytes} from 'node:crypto';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {gitWorld} from './git-world.mjs';
import {Ledger} from '../../src/storage/ledger.mjs';
import {ObjectStore} from '../../src/storage/objects.mjs';
import {ContextService} from '../../src/repository/context.mjs';
import {materialize,inspectMaterialization} from '../../src/candidate/materialize.mjs';
import {RequiredValidation} from '../../src/validation/receipts.mjs';
import {AdoptedPolicy} from '../../src/validation/policy.mjs';
import {GitRefTransport} from '../../src/integration/git-ref.mjs';
import {DevelopmentEngine} from '../../src/runtime/engine.mjs';
import {DevelopmentApplication} from '../../src/runtime/application.mjs';
import {recordDigest,bytesDigest} from '../../src/contracts/canonical.mjs';
import {Dev2Error} from '../../src/contracts/errors.mjs';
/** @typedef {import('../../src/contracts/ports.js').Profile} Profile */
/** @typedef {import('../../src/contracts/ports.js').PreparedResult} Result */
/** @typedef {import('../../src/contracts/ports.js').Attempt} Attempt */
/** @typedef {{capacity?:number,beforeRun?:(result:Result,attempt:Attempt,profile:Profile)=>Promise<void>,afterSend?:()=>Promise<void>,files?:import('./git-world.mjs').FixtureEntry[]}} Options */
/** @typedef {{active:number,peak:number,spans:{pid:number,startedAt:number,finishedAt:number,exitCode:number|null}[]}} ProcessActivity */
/** Actual bounded Node children; not production OS isolation.
 * @param {Profile} profile @param {string} cwd @param {ProcessActivity} activity */
function command(profile,cwd,activity){return new Promise(resolve=>{
 const child=spawn(profile.argv[0],profile.argv.slice(1),{cwd,env:{PATH:process.env.PATH??'',HOME:cwd},stdio:['ignore','pipe','pipe'],detached:true});
 let stdout='',stderr='',pid=0,startedAt=0;
 child.once('spawn',()=>{pid=child.pid??0;startedAt=Date.now();activity.active++;activity.peak=Math.max(activity.peak,activity.active);});
 child.stdout.on('data',b=>{stdout+=b.toString();});child.stderr.on('data',b=>{stderr+=b.toString();});
 const timeout=setTimeout(()=>{try{process.kill(-/** @type {number} */(child.pid),'SIGKILL');}catch{}},profile.timeoutMs);
 child.on('error',()=>{});child.on('close',(code,signal)=>{clearTimeout(timeout);if(pid){activity.active--;activity.spans.push({pid,startedAt,finishedAt:Date.now(),exitCode:code});}resolve({code,signal,stdout,stderr});});
});}
/** @param {Options} [options] */
export async function engineWorld(options={}){
 const w=await gitWorld(options.files??[{path:'a.txt',content:'alpha\n'},{path:'b.txt',content:'beta\n'},{path:'AGENTS.md',content:'Read exact repository authority.\n'}]);
 w.binding.repositoryId='self';const ledger=new Ledger(join(w.root,'ledger.sqlite'),w.binding);
 const objects=new ObjectStore(join(w.root,'immutable'));await objects.init();
 const access={allowed:true};
 /** @type {import('../../src/contracts/ports.js').Principal} */
 const principal={subject:'fixture-subject',issuer:'https://issuer.invalid',audience:'https://dev2.invalid/mcp',expiresAt:Date.now()+3600000};
 /** @type {import('../../src/contracts/ports.js').AuthorizationPort} */
 const authorization={authorize:async(p,b,c,paths=[])=>{if(!access.allowed||p.subject!==principal.subject||p.expiresAt<=Date.now()||b.repositoryId!==w.binding.repositoryId||paths.some(path=>path.startsWith('secret')))throw new Dev2Error('FORBIDDEN');}};
 const context=new ContextService({repository:w.repository,objects,authorization,tokenKey:randomBytes(32)});
 const scanner=fileURLToPath(new URL('./full-scan.mjs',import.meta.url));
 const seal=bytesDigest(Buffer.from('fixture-only-not-production'));
 const profiles=['core','integration'].map(profileId=>{
  const fields={profileId,argv:[process.execPath,scanner,profileId],cwd:'',parameters:{},timeoutMs:30000,killGraceMs:100,memoryBytes:268435456,pids:32,cpuMillis:1000,diskBytes:67108864,logBytes:65536,network:/** @type {const} */('none'),imageDigest:seal,replaySafe:true};return {...fields,digest:recordDigest('dev2.profile.v1',fields)};
 });
 const execution={orderedProfileDigests:profiles.map(p=>p.digest),trustedRunnerDigest:seal,toolchainDigest:seal,environmentClass:'trusted-fixture-process-not-os-sandbox',dependencyLockDigest:seal};
 const policy=new AdoptedPolicy({digest:w.binding.policyDigest,profiles:profiles.map(profile=>({profile,parameterSchema:{type:'object',properties:{},additionalProperties:false}})),required:['core','integration'],execution});
 const key=randomBytes(32);
 /** @type {Array<{resultId:string,workId:string,profile:string,startedAt:number,endedAt:number,exitCode:number|null}>} */const profileRuns=[];
 /** @type {Array<{resultId:string,workId:string,startedAt:number,endedAt:number}>} */const validationRuns=[];
 const parallel={active:0,peak:0};/** @type {ProcessActivity} */const processActivity={active:0,peak:0,spans:[]};await mkdir(join(w.root,'attempts'));
 /** @param {Result} result @param {Attempt} attempt @param {Profile} profile */
 async function run(result,attempt,profile){
  const startedAt=Date.now();parallel.active++;parallel.peak=Math.max(parallel.peak,parallel.active);
  try{
   await options.beforeRun?.(result,attempt,profile);
   const tree=await w.repository.readTree(result.resultTreeOid);const destination=join(w.root,'attempts',attempt.attemptId+'-'+profile.profileId);
   await materialize(w.repository,tree,destination);const before=await inspectMaterialization(tree,destination);const executed=await command(profile,destination,processActivity);
   const after=await inspectMaterialization(tree,destination);const endedAt=Date.now();profileRuns.push({resultId:result.resultId,workId:result.workId,profile:profile.profileId,startedAt,endedAt,exitCode:executed.code});
   return {startedAt,endedAt,exitCode:executed.code,signal:executed.signal,deadlineExceeded:executed.signal==='SIGKILL',inputDigest:before,outputDigest:after};
  }finally{parallel.active--;}
 }
 const validator=new RequiredValidation({key,profiles,execution,run,observerEpoch:()=>ledger.ownerEpoch});
 /** @type {import('../../src/contracts/ports.js').ValidationPort} */
 const validation={eligible:validator.eligible.bind(validator),validate:async(result,attempt)=>{const startedAt=Date.now();const receipt=await validator.validate(result,attempt);validationRuns.push({resultId:result.resultId,workId:result.workId,startedAt,endedAt:Date.now()});return receipt;}};
 const transport=new GitRefTransport(w.repository,w.binding);
 /** @type {import('../../src/contracts/ports.js').Effect[]} */const sends=[];
 const remote={resolve:()=>transport.resolve(),fetch:(/** @type {string} */head)=>transport.fetch(head),compareUpdate:async(/** @type {import('../../src/contracts/ports.js').Effect} */effect)=>{sends.push(effect);const sent=await transport.compareUpdate(effect);await options.afterSend?.();return sent;}};
 const engineOptions={binding:w.binding,ledger,repository:w.repository,context,authorization,remote,policy:()=>policy,validation:()=>validation,verifyLineage:(/** @type {string} */head)=>w.repository.isAncestor(w.binding,w.baseHead,head),actor:'Fixture <fixture@example.invalid>',capacity:options.capacity,attemptStopped:async()=>parallel.active===0};
 const engine=new DevelopmentEngine(engineOptions),app=new DevelopmentApplication({engine,releaseId:seal,artifacts:objects,pollMs:10});
 /** @param {string[]} ids */
 async function finish(ids){const deadline=Date.now()+90000;engine.pump();
  while(Date.now()<deadline){const actions=ids.map(id=>ledger.transact(tx=>tx.getAction(id)));if(actions.every(a=>a&&['succeeded','failed','cancelled','blocked'].includes(a.status)))return actions;await delay(10);}
  throw Error('Fixture execution deadline exceeded');
 }
 /** @param {string} requestId @param {string} path @param {string} content */
 async function create(requestId,path,content){const snapshot=await context.current(principal,w.binding);return engine.admit(principal,{op:'create',requestId,snapshotId:snapshot.snapshotId,expectedHead:snapshot.commitOid,objective:'Fixture source change',initialEdits:[{kind:'put',path,mode:'100644',expectedEntry:'absent',content,encoding:'utf8'}]});}
 return {...w,processActivity,ledger,objects,principal,access,authorization,context,policy,validator,validation,engineOptions,engine,app,remote,sends,profileRuns,validationRuns,parallel,finish,create,close:async()=>{await Promise.allSettled([...engine.running.values()]);ledger.close();await w.close();}};
}
