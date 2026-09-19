#!/usr/bin/env node
import {parseArgs} from 'node:util';
import {canonicalJson} from '../src/contracts/canonical.mjs';
import {digest} from '../src/contracts/identity.mjs';
import {requireThat} from '../src/contracts/errors.mjs';
import {inspectHardCutover,applyHardCutover} from '../src/release/hard-cutover-recovery.mjs';

async function main(){
 process.umask(0o077);
 const {values}=parseArgs({options:{
  'helper-config':{type:'string'},
  'native-config':{type:'string'},
  mode:{type:'string'},
  'expected-plan-digest':{type:'string'}
 },strict:true,allowPositionals:false});
 const helperConfigFile=values['helper-config'],nativeConfigFile=values['native-config'],mode=values.mode,expectedPlanDigest=values['expected-plan-digest']??null;
 requireThat(helperConfigFile&&nativeConfigFile&&(mode==='inspect'||mode==='apply'),'INVALID_ARGUMENT');
 requireThat(process.platform==='android','FORBIDDEN','C2-2 hard-cutover recovery is device-local only');
 if(mode==='inspect')requireThat(expectedPlanDigest===null,'INVALID_ARGUMENT','Inspect does not accept a plan digest');
 else{requireThat(typeof expectedPlanDigest==='string','INVALID_ARGUMENT','Apply requires one exact inspected plan digest');digest(expectedPlanDigest);}
 const result=mode==='inspect'
  ?await inspectHardCutover({helperConfigFile,nativeConfigFile})
  :await applyHardCutover({helperConfigFile,nativeConfigFile,expectedPlanDigest:/** @type {string} */(expectedPlanDigest)});
 process.stdout.write(canonicalJson(result)+'\n');
}
main().catch(error=>{
 process.stderr.write(canonicalJson({kind:'tdev.c2-2-hard-cutover-recovery-error',code:typeof error?.code==='string'?error.code:'INTEGRITY_FAILURE'})+'\n');
 process.exitCode=1;
});
