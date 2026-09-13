#!/usr/bin/env node
/** Trusted/private principal commissioning. The selected observation must have
 * been produced by the installed native verifier from a signed Access assertion.
 * This utility accepts no raw Access sub/email/token/assertion and is not an MCP tool. */
import {open,rename,unlink} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {canonicalJson,parseRecord,recordDigest} from '../src/contracts/canonical.mjs';
import {requireThat} from '../src/contracts/errors.mjs';
import {readNativeConfig,privateFile} from '../src/runtime/native.mjs';
import {installationOwnerGrant} from '../src/security/installation-grant.mjs';
import {installationAuthorization,installationAuthorizationPath} from '../src/security/installation-authorization.mjs';
import {authorizationFromObservedPrincipal,principalObservationPath,readPrincipalObservations} from '../src/security/principal-observation.mjs';
async function main(){process.umask(0o077);const args=parseArgs({options:{config:{type:'string'},observation:{type:'string'},capability:{type:'string',multiple:true},path:{type:'string',multiple:true},deny:{type:'string',multiple:true}},strict:true,allowPositionals:false}).values;requireThat(args.config&&args.observation&&Array.isArray(args.capability)&&args.capability.length>0&&Array.isArray(args.path)&&args.path.length>0,'INVALID_ARGUMENT','Explicit config, observation, capabilities and paths required');
 const config=await readNativeConfig(resolve(args.config)),binding=config.edge.binding,filename=installationAuthorizationPath(config.stateDirectory),observations=await readPrincipalObservations(principalObservationPath(config.stateDirectory));let current;
 try{current=installationAuthorization(parseRecord(await privateFile(filename,262144),262144));}catch(error){if(!(error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT'))throw error;const candidates=config.edge.grants.filter(g=>canonicalJson(g)===canonicalJson(installationOwnerGrant({subject:g.subject,installationId:binding.installationId,repositoryId:binding.repositoryId,ref:binding.ref})));requireThat(candidates.length===1,'FORBIDDEN','Legacy owner identity is not uniquely recoverable');current=installationAuthorization({schemaVersion:1,ownerSubjectDigest:candidates[0].subject,principals:[]});}
 const desired=authorizationFromObservedPrincipal({authorization:current,observations,observationId:args.observation,capabilities:/** @type {import('../src/contracts/ports.js').Capability[]} */(args.capability),paths:args.path,deniedPaths:args.deny??[]}),bytes=Buffer.from(canonicalJson(desired)+'\n');try{const installed=await privateFile(filename,262144);if(installed.equals(bytes)){console.log(canonicalJson({updated:false,authorizationDigest:recordDigest('dev2.installation-authorization.v1',desired),observationId:args.observation,principalCount:1+desired.principals.length}));return;}}catch(error){if(!(error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT'))throw error;}
 const temporary=filename+'.tmp-'+process.pid+'-'+Date.now(),handle=await open(temporary,'wx',0o600);try{try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}await rename(temporary,filename);const directory=await open(dirname(filename),'r');try{await directory.sync();}finally{await directory.close();}}catch(error){try{await handle.close();}catch{}try{await unlink(temporary);}catch{}throw error;}
 const installed=installationAuthorization(parseRecord(await privateFile(filename,262144),262144));requireThat(canonicalJson(installed)===canonicalJson(desired),'INTEGRITY_FAILURE','Installed authorization readback mismatch');console.log(canonicalJson({updated:true,authorizationDigest:recordDigest('dev2.installation-authorization.v1',installed),observationId:args.observation,principalCount:1+installed.principals.length}));
}
main().catch(error=>{console.error(canonicalJson({event:'observed_principal_grant_failed',code:typeof error?.code==='string'?error.code:'EXECUTION_UNAVAILABLE'}));process.exitCode=1;});
