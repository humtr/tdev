#!/usr/bin/env node
/** Trusted/private installation authorization mutation. This is not an MCP tool,
 * profile parameter or candidate input. The desired file contains verified subject
 * digests only; no email, raw Access sub, token or assertion is accepted/stored. */
import {open,rename,unlink} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {canonicalJson,parseRecord,recordDigest} from '../src/contracts/canonical.mjs';
import {requireThat} from '../src/contracts/errors.mjs';
import {readNativeConfig,privateFile} from '../src/runtime/native.mjs';
import {installationOwnerGrant} from '../src/security/installation-grant.mjs';
import {installationAuthorization,installationAuthorizationPath} from '../src/security/installation-authorization.mjs';
async function main(){process.umask(0o077);const args=parseArgs({options:{config:{type:'string'},desired:{type:'string'}},strict:true,allowPositionals:false}).values;requireThat(args.config&&args.desired,'INVALID_ARGUMENT');
 const config=await readNativeConfig(resolve(args.config)),binding=config.edge.binding,filename=installationAuthorizationPath(config.stateDirectory),desired=installationAuthorization(parseRecord(await privateFile(resolve(args.desired),262144),262144));
 let owner=null;try{owner=installationAuthorization(parseRecord(await privateFile(filename,262144),262144)).ownerSubjectDigest;}catch(error){if(!(error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT'))throw error;const candidates=config.edge.grants.filter(g=>canonicalJson(g)===canonicalJson(installationOwnerGrant({subject:g.subject,installationId:binding.installationId,repositoryId:binding.repositoryId,ref:binding.ref})));requireThat(candidates.length===1,'FORBIDDEN','Legacy owner identity is not uniquely recoverable');owner=candidates[0].subject;}
 requireThat(desired.ownerSubjectDigest===owner,'FORBIDDEN','Private authorization update cannot replace the installation owner');
 const bytes=Buffer.from(canonicalJson(desired)+'\n');try{const current=await privateFile(filename,262144);if(current.equals(bytes)){console.log(canonicalJson({updated:false,authorizationDigest:recordDigest('dev2.installation-authorization.v1',desired),principalCount:1+desired.principals.length}));return;}}catch(error){if(!(error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT'))throw error;}
 const temporary=filename+'.tmp-'+process.pid+'-'+Date.now(),handle=await open(temporary,'wx',0o600);try{try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}await rename(temporary,filename);const directory=await open(dirname(filename),'r');try{await directory.sync();}finally{await directory.close();}}catch(error){try{await handle.close();}catch{}try{await unlink(temporary);}catch{}throw error;}
 const installed=installationAuthorization(parseRecord(await privateFile(filename,262144),262144));requireThat(canonicalJson(installed)===canonicalJson(desired),'INTEGRITY_FAILURE','Installed authorization readback mismatch');console.log(canonicalJson({updated:true,authorizationDigest:recordDigest('dev2.installation-authorization.v1',installed),principalCount:1+installed.principals.length}));
}
main().catch(error=>{console.error(canonicalJson({event:'installation_authorization_update_failed',code:typeof error?.code==='string'?error.code:'EXECUTION_UNAVAILABLE'}));process.exitCode=1;});
