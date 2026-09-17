#!/usr/bin/env node
import {parseArgs} from 'node:util';
import {resolve} from 'node:path';
import {canonicalJson} from '../src/contracts/canonical.mjs';
import {digest} from '../src/contracts/identity.mjs';
import {requireThat} from '../src/contracts/errors.mjs';
import {readHelperConfig,createFixedHelper} from '../src/release/helper-runtime.mjs';

async function main(){process.umask(0o077);
 const {values}=parseArgs({options:{config:{type:'string'},mode:{type:'string'},'expected-retained-release':{type:'string'},'expected-plan-digest':{type:'string'}},strict:true,allowPositionals:false});
 const configFile=values.config,mode=values.mode,releaseId=values['expected-retained-release'],expectedPlan=values['expected-plan-digest']??null;
 requireThat(configFile&&releaseId&&(mode==='inspect'||mode==='apply'),'INVALID_ARGUMENT');digest(releaseId);requireThat((mode==='inspect'&&expectedPlan===null)||(mode==='apply'&&typeof expectedPlan==='string'),'INVALID_ARGUMENT','Apply requires one exact inspected plan digest');if(expectedPlan!==null)digest(expectedPlan);
 requireThat(process.platform==='android','FORBIDDEN','Edge-drift bootstrap recovery is device-local only');const config=await readHelperConfig(resolve(configFile)),helper=await createFixedHelper(config);
 try{const result=await helper.service.recoverEdgeDrift(releaseId,mode==='apply'?expectedPlan:null);requireThat(result&&typeof result==='object'&&!Array.isArray(result)&&(mode==='inspect'?result.kind==='tdev.release-edge-drift-recovery-plan':result.kind==='tdev.release-edge-drift-recovered'),'INTEGRITY_FAILURE');process.stdout.write(canonicalJson(result)+'\n');}
 finally{await helper.close();}
}
main().catch(error=>{process.stderr.write(canonicalJson({kind:'tdev.release-edge-drift-recovery-error',code:typeof error?.code==='string'?error.code:'INTEGRITY_FAILURE'})+'\n');process.exitCode=1;});
