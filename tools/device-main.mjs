import { readFile } from 'node:fs/promises';
import { bytesDigest } from '../src/contracts/canonical.mjs';
import { requireThat } from '../src/contracts/errors.mjs';
import { readNativeConfig, createNativeInstallation } from '../src/runtime/native.mjs';
/** @param {string} event */
function log(event){process.stdout.write(JSON.stringify({event,observedAt:new Date().toISOString()})+'\n');}
async function main(){process.umask(0o077);requireThat(process.argv.length===4&&process.argv[2]==='--config','INVALID_ARGUMENT');
 const config=await readNativeConfig(process.argv[3]);requireThat(bytesDigest(await readFile(process.argv[1]))===config.runtime.bundleDigest,'INTEGRITY_FAILURE','Installed device bundle mismatch');
 const installation=await createNativeInstallation(config,{log});
 let stopping=false;const stop=async()=>{if(stopping)return;stopping=true;log('draining');const deadline=setTimeout(()=>process.exit(1),45000);try{await installation.close();clearTimeout(deadline);log('stopped');process.exitCode=0;}catch{process.exitCode=1;}};
 process.once('SIGTERM',()=>{void stop();});process.once('SIGINT',()=>{void stop();});
 installation.device.start();log('started');
 try{const probe=/** @type {{summary:{ok:boolean}}} */(await installation.readProbe());log(probe.summary.ok?'repository_probe_passed':'repository_probe_failed');}catch{log('repository_probe_failed');}
}
main().catch(error=>{process.stderr.write(JSON.stringify({event:'startup_failed',code:typeof error?.code==='string'?error.code:'EXECUTION_UNAVAILABLE'})+'\n');process.exitCode=1;});
