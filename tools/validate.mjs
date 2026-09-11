import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, relative, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { bytesDigest, recordDigest } from '../src/contracts/canonical.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** @param {string} directory @returns {string[]} */
function files(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, {withFileTypes:true}).flatMap(e => {
    const p=join(directory,e.name);
    if (e.isSymbolicLink()) throw new Error('Symlink in validation inputs');
    return e.isDirectory() ? files(p) : [p];
  }).sort();
}
/** Exact relevant bytes, including uncommitted implementation inputs; no Git required by core. */
function inputIdentity() {
  const paths=[...['src','tools','test','config','bench'].flatMap(p=>files(join(root,p))),
    ...['AGENTS.md','DIRECTIVE.md','RULE.md','WORKBOARD.md','package.json','package-lock.json','jsconfig.json'].map(p=>join(root,p)),
    ...files(join(root,'docs/design'))].filter(p=>!p.includes('__pycache__')&&!p.endsWith('.pyc'));
  return recordDigest('dev2.validation-inputs.v1',paths.sort().map(p=>({path:relative(root,p),digest:bytesDigest(readFileSync(p))})));
}
/** @param {string[]} argv @returns {number} */
export function main(argv) {
  let args;
  try {
    args=parseArgs({args:argv,options:{profile:{type:'string'},output:{type:'string'}},strict:true,allowPositionals:false}).values;
    if (!args.profile || !args.output) throw new Error('profile and output required');
  } catch { console.error('Usage: node tools/validate.mjs --profile <core|integration|release|live|benchmark> --output <directory>'); return 1; }
  const profile=args.profile, output=resolve(args.output);
  const outputRelative=relative(root,output);
  if(!(outputRelative==='..'||outputRelative.startsWith('../')||outputRelative==='.artifacts'||outputRelative.startsWith('.artifacts/'))) {console.error('Validation output must be outside source or under .artifacts');return 1;}
  /** @type {{schemaVersion:number,profiles:Record<string,{implemented:boolean,testDirectory:string,timeoutMs:number,network:string,requires:string[]}>}} */
  const config=JSON.parse(readFileSync(join(root,'config/validation-profiles.json'),'utf8'));
  if (!Object.hasOwn(config.profiles,profile)) { console.error('Unknown profile'); return 1; }
  const descriptor=config.profiles[profile];
  const lockBytes=readFileSync(join(root,'config/toolchain.lock.json'));
  /** @type {{node:{version:string},git:{version:string}}} */
  const lock=JSON.parse(lockBytes.toString());
  mkdirSync(output,{recursive:true});
  const started=performance.now(); const startedAt=new Date().toISOString();
  const inputDigest=inputIdentity();
  /** @type {Array<{name:string,status:string,exitCode:number|null,signal:string|null,durationMs:number,logDigest:string|null}>} */
  const checks=[];
  let code=0; let interrupted=false;
  /** @param {string} name @param {string} executable @param {string[]} arguments_ @param {number} timeout */
  function check(name,executable,arguments_,timeout) {
    const t=performance.now();
    const r=spawnSync(executable,arguments_,{cwd:root,encoding:'utf8',timeout,maxBuffer:16*1024*1024,
      killSignal:'SIGKILL',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',NO_COLOR:'1'}});
    const log=Buffer.from((r.stdout??'')+(r.stderr??''));
    writeFileSync(join(output,name+'.log'),log);
    const missing=r.error && 'code' in r.error && r.error.code==='ENOENT';
    const timed=r.error && 'code' in r.error && r.error.code==='ETIMEDOUT';
    const status=missing?'not_run':timed?'cancelled':r.status===0?'passed':'failed';
    checks.push({name,status,exitCode:r.status,signal:r.signal,durationMs:Math.ceil(performance.now()-t),logDigest:bytesDigest(log)});
    if (timed) {code=3;interrupted=true;} else if (status==='failed') code=1; else if(missing && code===0) code=2;
  }
  if(process.versions.node!==lock.node.version) {
    checks.push({name:'node.pin',status:'not_run',exitCode:null,signal:null,durationMs:0,logDigest:null}); code=2;
  } else if(profile==='core' && !existsSync(join(root,'node_modules/typescript/bin/tsc'))) {
    checks.push({name:'npm.lock',status:'not_run',exitCode:null,signal:null,durationMs:0,logDigest:null}); code=2;
  } else if(!descriptor.implemented) {
    checks.push({name:'implementation',status:'not_run',exitCode:null,signal:null,durationMs:0,logDigest:null}); code=2;
  } else {
    if(profile==='integration') {
      const git=spawnSync('git',['--version'],{encoding:'utf8',timeout:10000,maxBuffer:4096});
      if(git.status!==0||git.stdout.trim()!=='git version '+lock.git.version){checks.push({name:'git.pin',status:'not_run',exitCode:git.status,signal:git.signal,durationMs:0,logDigest:null});code=2;}
      const fixture=spawnSync(process.execPath,['--input-type=module','-e',"import {DatabaseSync} from 'node:sqlite';const db=new DatabaseSync(':memory:');db.prepare('SELECT 1').get();db.close();"],{encoding:'utf8',timeout:10000,maxBuffer:4096});
      const flock=spawnSync('flock',['--version'],{encoding:'utf8',timeout:10000,maxBuffer:4096});
      if(fixture.status!==0||flock.status!==0){checks.push({name:'sqlite.flock',status:'not_run',exitCode:null,signal:null,durationMs:0,logDigest:null});code=2;}
    }
    if (profile==='core') {
      check('python.minimum','python3',['-c','import sys;sys.exit(0 if sys.version_info >= (3,12) else 2)'],10000);
      if(code===0) check('jsdoc',process.execPath,['node_modules/typescript/bin/tsc','--project','jsconfig.json','--noEmit'],60000);
      if(code===0) check('designs','python3',['docs/design/check.py'],30000);
    }
    const tests=files(join(root,descriptor.testDirectory)).filter(p=>p.endsWith('.test.mjs'));
    if(code===0 && tests.length) check('tests',process.execPath,['--test','--test-reporter=tap',...tests],descriptor.timeoutMs);
    else if(code===0) { checks.push({name:'tests',status:'not_run',exitCode:null,signal:null,durationMs:0,logDigest:null}); code=2; }
  }
  const outputInputDigest=inputIdentity();
  if(inputDigest!==outputInputDigest) {checks.push({name:'input.integrity',status:'failed',exitCode:1,signal:null,durationMs:0,logDigest:null});code=1;}
  const result={schemaVersion:1,layer:profile,status:code===0?'passed':code===2?'not_run':interrupted?'cancelled':'failed',exitCode:code,
    scope:'implemented-profile-only',installationEligibility:false,startedAt,finishedAt:new Date().toISOString(),durationMs:Math.ceil(performance.now()-started),
    entrypointDigest:bytesDigest(readFileSync(fileURLToPath(import.meta.url))),inputDigest,outputInputDigest,
    profileDigest:recordDigest('dev2.validation-profile.v1',descriptor),toolchainLockDigest:bytesDigest(lockBytes),
    dependencyLockDigest:bytesDigest(readFileSync(join(root,'package-lock.json'))),
    execution:{node:process.versions.node,nodeBinaryDigest:bytesDigest(readFileSync(process.execPath)),platform:process.platform,arch:process.arch,sqlite:process.versions.sqlite??null},checks};
  writeFileSync(join(output,'result.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result)); return code;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {process.exitCode=main(process.argv.slice(2));} catch(error) {console.error(error instanceof Error?error.message:'Validation failed');process.exitCode=1;}
}
