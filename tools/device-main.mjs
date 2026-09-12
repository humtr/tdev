import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { resolve,dirname } from 'node:path';
import { bytesDigest,canonicalJson,parseRecord } from '../src/contracts/canonical.mjs';
import { requireThat } from '../src/contracts/errors.mjs';
import { readNativeConfig, createNativeInstallation } from '../src/runtime/native.mjs';
import { privateBytes,privateDirectory,immutablePrivateFile } from '../src/release/private-files.mjs';
/** @param {string} event */
function log(event){process.stdout.write(JSON.stringify({event,observedAt:new Date().toISOString()})+'\n');}
async function main(){process.umask(0o077);
 const {values}=parseArgs({options:{config:{type:'string'},'commission-intent':{type:'string'},'commission-output':{type:'string'}},strict:true,allowPositionals:false});
 requireThat(values.config&&!!values['commission-intent']===!!values['commission-output'],'INVALID_ARGUMENT');
 const config=await readNativeConfig(values.config);requireThat(bytesDigest(await readFile(process.argv[1]))===config.runtime.bundleDigest,'INTEGRITY_FAILURE','Installed device bundle mismatch');
 const intentFile=values['commission-intent'],outputFile=values['commission-output'];
 if(intentFile&&outputFile){
  requireThat(process.platform==='android'&&!config.productionEnrollmentFile,'FORBIDDEN','Private commissioning cannot replace installed production authority');
  requireThat(resolve(outputFile)===outputFile,'FORBIDDEN');await privateDirectory(dirname(outputFile));
  const commissioningIntent=/** @type {import('../src/runtime/production-enrollment.mjs').ProductionIntent} */(parseRecord(await privateBytes(intentFile)));
  const installation=await createNativeInstallation(config,{log,commissioningIntent});
  try{requireThat(installation.managed?.commissioning,'EXECUTION_UNAVAILABLE');installation.device.start();const record=await installation.managed.commissioning.run();await immutablePrivateFile(outputFile,Buffer.from(canonicalJson(record)));process.stdout.write(canonicalJson({kind:'dev2.production-commissioning-retained',sealDigest:record.sealDigest,installationId:commissioningIntent.installationId,commissioningId:commissioningIntent.commissioningId,releaseActivated:false})+'\n');}finally{await installation.close();}
  return;
 }
 const installation=await createNativeInstallation(config,{log});
 let stopping=false;const stop=async()=>{if(stopping)return;stopping=true;log('draining');const deadline=setTimeout(()=>process.exit(1),45000);try{await installation.close();clearTimeout(deadline);log('stopped');process.exitCode=0;}catch{process.exitCode=1;}};
 process.once('SIGTERM',()=>{void stop();});process.once('SIGINT',()=>{void stop();});
 installation.device.start();log('started');
 try{const probe=/** @type {{summary:{ok:boolean}}} */(await installation.readProbe());log(probe.summary.ok?'repository_probe_passed':'repository_probe_failed');}catch{log('repository_probe_failed');}
}
main().catch(error=>{process.stderr.write(JSON.stringify({event:'startup_failed',code:typeof error?.code==='string'?error.code:'EXECUTION_UNAVAILABLE'})+'\n');process.exitCode=1;});
