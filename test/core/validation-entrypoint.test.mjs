import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,cp,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const entry=fileURLToPath(new URL('../../tools/validate.mjs',import.meta.url));
test('validation outputs cannot be written into owned source',()=>{
 const result=spawnSync(process.execPath,[entry,'--profile','core','--output',fileURLToPath(new URL('../../src/forbidden-output',import.meta.url))],{encoding:'utf8'});
 assert.equal(result.status,1);assert.match(result.stderr,/outside source/);
});
test('missing declared integration capability emits NOT RUN rather than empty PASS',async()=>{
 const root=await mkdtemp(join(tmpdir(),'dev2-validation-contract-'));try{
  const source=join(root,'source');await mkdir(source);
  for(const path of ['src/contracts','tools','config','AGENTS.md','DIRECTIVE.md','RULE.md','WORKBOARD.md','package.json','package-lock.json','jsconfig.json'])await cp(fileURLToPath(new URL('../../'+path,import.meta.url)),join(source,path),{recursive:true});
  const lockPath=join(source,'config/toolchain.lock.json');const lock=JSON.parse(await readFile(lockPath,'utf8'));lock.node.version=process.versions.node;lock.git.version='unavailable-fixture-version';await writeFile(lockPath,JSON.stringify(lock));
  const out=join(root,'output');const result=spawnSync(process.execPath,[join(source,'tools/validate.mjs'),'--profile','integration','--output',out],{encoding:'utf8',timeout:10000});
  assert.equal(result.status,2,result.stderr);const report=JSON.parse(await readFile(join(out,'result.json'),'utf8'));assert.equal(report.status,'not_run');assert.equal(report.installationEligibility,false);assert.equal(report.checks.some(c=>c.name==='git.pin'&&c.status==='not_run'),true);
 }finally{await rm(root,{recursive:true,force:true});}
});
