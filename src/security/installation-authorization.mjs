import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {resolve,join,isAbsolute} from 'node:path';
import {parseRecord,canonicalJson} from '../contracts/canonical.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {CAPABILITIES} from './authorization.mjs';
import {installationOwnerGrant,installationPrincipalGrant} from './installation-grant.mjs';
/** @typedef {import('../contracts/ports.js').Capability} Capability */
/** @typedef {{subject:string,capabilities:Capability[],paths:string[],deniedPaths:string[]}} PrincipalEntry */
/** @typedef {{schemaVersion:1,ownerSubjectDigest:string,principals:PrincipalEntry[]}} AuthorizationConfig */
/** @param {unknown} value @param {readonly string[]} keys */
function closed(value,keys){requireThat(value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(','),'INVALID_ARGUMENT','Closed installation authorization configuration required');}
/** @param {unknown} input @returns {AuthorizationConfig} */
export function installationAuthorization(input){
 const value=/** @type {Record<string,unknown>} */(input);closed(value,['schemaVersion','ownerSubjectDigest','principals']);requireThat(value.schemaVersion===1&&typeof value.ownerSubjectDigest==='string'&&/^[a-f0-9]{64}$/.test(value.ownerSubjectDigest)&&Array.isArray(value.principals)&&value.principals.length<=64,'INVALID_ARGUMENT');
 const seen=new Set([value.ownerSubjectDigest]);/** @type {PrincipalEntry[]} */const principals=[];
 for(const raw of value.principals){const row=/** @type {Record<string,unknown>} */(raw);closed(row,['subject','capabilities','paths','deniedPaths']);
  requireThat(typeof row.subject==='string'&&/^[a-f0-9]{64}$/.test(row.subject)&&!seen.has(row.subject),'INVALID_ARGUMENT','Duplicate or invalid principal subject');seen.add(row.subject);
  requireThat(Array.isArray(row.capabilities)&&row.capabilities.length>0&&row.capabilities.length<=CAPABILITIES.length&&new Set(row.capabilities).size===row.capabilities.length&&row.capabilities.every(c=>typeof c==='string'&&CAPABILITIES.includes(/** @type {Capability} */(c))),'INVALID_ARGUMENT');
  requireThat(Array.isArray(row.paths)&&row.paths.length>0&&row.paths.length<=64&&row.paths.every(p=>typeof p==='string')&&Array.isArray(row.deniedPaths)&&row.deniedPaths.length<=64&&row.deniedPaths.every(p=>typeof p==='string'),'INVALID_ARGUMENT');
  const grant=installationPrincipalGrant({subject:row.subject,installationId:'validation',repositoryId:'validation',ref:'refs/heads/validation',capabilities:/** @type {Capability[]} */(row.capabilities),paths:/** @type {string[]} */(row.paths),deniedPaths:/** @type {string[]} */(row.deniedPaths)});
  principals.push({subject:grant.subject,capabilities:[...grant.capabilities],paths:[...grant.paths],deniedPaths:[...grant.deniedPaths]});
 }
 return /** @type {AuthorizationConfig} */(parseRecord(canonicalJson({schemaVersion:1,ownerSubjectDigest:value.ownerSubjectDigest,principals}),262144));
}
/** @param {AuthorizationConfig} config @param {{installationId:string,repositoryId:string,ref:string}} scope */
export function installationAuthorizationGrants(config,scope){const parsed=installationAuthorization(config);return [installationOwnerGrant({subject:parsed.ownerSubjectDigest,...scope}),...parsed.principals.map(p=>installationPrincipalGrant({...p,...scope}))];}
/** One installed private authority path, stable across source releases.
 * @param {string} stateDirectory */
export function installationAuthorizationPath(stateDirectory){requireThat(typeof stateDirectory==='string'&&isAbsolute(stateDirectory),'INVALID_ARGUMENT');return resolve(join(stateDirectory,'private','authorization.json'));}
/** Secure synchronous read is intentional: ScopedAuthorization grant lookup is live
 * on every native authorization call, so grant removal takes effect on the next call.
 * Atomic rename by the private operator yields either the old or the new full record.
 * @param {string} filename */
function secureRead(filename){const path=resolve(filename),before=lstatSync(path);requireThat(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&(before.mode&0o077)===0&&before.size<=262144&&realpathSync(path)===path,'FORBIDDEN','Unsafe installation authorization file');const bytes=readFileSync(path),after=lstatSync(path);requireThat(before.ino===after.ino&&before.dev===after.dev&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&bytes.length===before.size,'INTEGRITY_FAILURE');return bytes;}
/** Legacy owner-only installations have no sidecar and retain identical behavior.
 * Once the private sidecar exists it is the only standing-grant source.
 * @param {{filename:string,fallback:readonly import('./authorization.mjs').Grant[],scope:{installationId:string,repositoryId:string,ref:string}}} options */
export function installationGrantSource(options){const fallback=/** @type {import('./authorization.mjs').Grant[]} */(parseRecord(canonicalJson(options.fallback),262144));return {current(){try{return installationAuthorizationGrants(installationAuthorization(parseRecord(secureRead(options.filename),262144)),options.scope);}catch(error){if(error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT')return fallback;throw error;}}};}
