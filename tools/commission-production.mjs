import {parseArgs} from 'node:util';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {bytesDigest} from '../src/contracts/canonical.mjs';
import {requireThat} from '../src/contracts/errors.mjs';
import {privateBytes} from '../src/release/private-files.mjs';
import {readNativeConfig} from '../src/runtime/native.mjs';
/** Operator-only commissioning. Stop the installed native ledger owner first.
 * Uses its actual authenticated device/executor channel, never fixture reports.
 * No provider/production operation is run by local source validation of this tool.
 * @param {string[]} args */
export async function main(args){
 const {values}=parseArgs({args,options:{device:{type:'string'},config:{type:'string'},intent:{type:'string'},output:{type:'string'}},strict:true,allowPositionals:false});
 requireThat(values.device&&values.config&&values.intent&&values.output&&process.platform==='android','INVALID_ARGUMENT','Private native commissioning requires --device --config --intent --output on Termux');
 process.umask(0o077);const config=await readNativeConfig(values.config);
 requireThat(!config.productionEnrollmentFile,'FORBIDDEN','Commissioning cannot replace production enrollment');
 requireThat(bytesDigest(await privateBytes(values.device,16777216))===config.runtime.bundleDigest,'INTEGRITY_FAILURE','Commissioning must run the exact installed device bundle');
 // The installed entrypoint rechecks its own bytes and all private input. Source
 // imports here cannot impersonate a different installed runtime identity.
 const child=spawnSync(process.execPath,[values.device,'--config',values.config,'--commission-intent',values.intent,'--commission-output',values.output],{stdio:'inherit',timeout:2745000,killSignal:'SIGTERM'});
 requireThat(child.status===0&&!child.error,'EXECUTION_UNAVAILABLE','Installed production commissioning did not complete');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(error=>{process.stderr.write(JSON.stringify({kind:'production-commissioning-failed',code:typeof error?.code==='string'?error.code:'EXECUTION_UNAVAILABLE'})+'\n');process.exitCode=1;});
