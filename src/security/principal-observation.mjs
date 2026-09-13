import {lstat,readFile,realpath,open,rename,unlink} from 'node:fs/promises';
import {resolve,join,isAbsolute,dirname} from 'node:path';
import {randomBytes} from 'node:crypto';
import {bytesDigest,canonicalJson,parseRecord,recordDigest} from '../contracts/canonical.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {installationAuthorization} from './installation-authorization.mjs';
/** @typedef {import('../contracts/ports.js').Capability} Capability */
/** @typedef {{observationId:string,subject:string,assertionDigest:string,observedAt:string}} Observation */
/** @typedef {{schemaVersion:1,observations:Observation[]}} ObservationFile */
const MAX_OBSERVATIONS=64;
let writer=Promise.resolve();
/** @param {unknown} value @param {readonly string[]} keys */
function closed(value,keys){requireThat(value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(','),'INVALID_ARGUMENT','Closed principal observation record required');}
/** @param {unknown} input @returns {ObservationFile} */
export function principalObservations(input){
 const value=/** @type {Record<string,unknown>} */(input);closed(value,['schemaVersion','observations']);requireThat(value.schemaVersion===1&&Array.isArray(value.observations)&&value.observations.length<=MAX_OBSERVATIONS,'INVALID_ARGUMENT');
 const ids=new Set();/** @type {Observation[]} */const observations=[];
 for(const raw of value.observations){const row=/** @type {Record<string,unknown>} */(raw);closed(row,['observationId','subject','assertionDigest','observedAt']);
  requireThat(typeof row.subject==='string'&&/^[a-f0-9]{64}$/.test(row.subject)&&typeof row.assertionDigest==='string'&&/^sha256:[a-f0-9]{64}$/.test(row.assertionDigest)&&typeof row.observationId==='string'&&/^[a-f0-9]{64}$/.test(row.observationId)&&typeof row.observedAt==='string'&&Number.isFinite(Date.parse(row.observedAt))&&new Date(row.observedAt).toISOString()===row.observedAt,'INVALID_ARGUMENT');
  requireThat(row.observationId===recordDigest('dev2.access-principal-observation.v1',{subject:row.subject,assertionDigest:row.assertionDigest}).slice(7)&&!ids.has(row.observationId),'INTEGRITY_FAILURE','Invalid or duplicate principal observation');ids.add(row.observationId);
  observations.push({observationId:row.observationId,subject:row.subject,assertionDigest:row.assertionDigest,observedAt:row.observedAt});
 }
 observations.sort((a,b)=>a.observationId.localeCompare(b.observationId));return /** @type {ObservationFile} */(parseRecord(canonicalJson({schemaVersion:1,observations}),262144));
}
/** Installation-private evidence path. It is not a standing-grant source.
 * @param {string} stateDirectory */
export function principalObservationPath(stateDirectory){requireThat(typeof stateDirectory==='string'&&isAbsolute(stateDirectory),'INVALID_ARGUMENT');return resolve(join(stateDirectory,'private','principal-observations.json'));}
/** @param {string} filename */
async function secureBytes(filename){const path=resolve(filename),before=await lstat(path);requireThat(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&(before.mode&0o077)===0&&before.size<=262144&&await realpath(path)===path,'FORBIDDEN','Unsafe principal observation file');const bytes=await readFile(path),after=await lstat(path);requireThat(before.ino===after.ino&&before.dev===after.dev&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&bytes.length===before.size,'INTEGRITY_FAILURE');return bytes;}
/** @param {string} filename */
export async function readPrincipalObservations(filename){return principalObservations(parseRecord(await secureBytes(filename),262144));}
/** @param {string} filename @param {ObservationFile} value */
async function replace(filename,value){const path=resolve(filename),directory=dirname(path),dir=await lstat(directory);requireThat(dir.isDirectory()&&!dir.isSymbolicLink()&&(dir.mode&0o077)===0&&await realpath(directory)===directory,'FORBIDDEN','Unsafe principal observation directory');const bytes=Buffer.from(canonicalJson(value)+'\n'),temporary=path+'.tmp-'+randomBytes(12).toString('hex'),handle=await open(temporary,'wx',0o600);try{try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}await rename(temporary,path);const parent=await open(directory,'r');try{await parent.sync();}finally{await parent.close();}}catch(error){try{await handle.close();}catch{}try{await unlink(temporary);}catch{}throw error;}return readPrincipalObservations(path);}
/** Called only after exact Access assertion verification. It stores an assertion
 * digest and verified subject digest, never raw sub/email/token/assertion, and does
 * not grant authority. Repeated delivery of the same assertion is idempotent.
 * @param {{filename:string,subject:string,assertion:string,now?:()=>number}} options */
export function recordVerifiedPrincipalObservation(options){
 const task=writer.then(async()=>{requireThat(/^[a-f0-9]{64}$/.test(options.subject)&&typeof options.assertion==='string'&&options.assertion.length>0&&options.assertion.length<=16384,'INVALID_ARGUMENT');const now=(options.now??Date.now)();requireThat(Number.isSafeInteger(now)&&now>0,'INVALID_ARGUMENT');const assertionDigest=bytesDigest(Buffer.from(options.assertion)),observationId=recordDigest('dev2.access-principal-observation.v1',{subject:options.subject,assertionDigest}).slice(7),observedAt=new Date(now).toISOString();let current;try{current=await readPrincipalObservations(options.filename);}catch(error){if(!(error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT'))throw error;current=principalObservations({schemaVersion:1,observations:[]});}
  const existing=current.observations.find(row=>row.observationId===observationId);if(existing)return existing;requireThat(current.observations.length<MAX_OBSERVATIONS,'CAPACITY_REJECTED','Principal observation capacity');const installed=await replace(options.filename,principalObservations({schemaVersion:1,observations:[...current.observations,{observationId,subject:options.subject,assertionDigest,observedAt}]}));return /** @type {Observation} */(installed.observations.find(row=>row.observationId===observationId));});writer=task.then(()=>{},()=>{});return task;
}
/** Compile one explicitly selected verified observation into an authorization
 * record. This pure function has no installation authority; only the private
 * operator may persist its result. Capabilities and paths remain explicit.
 * @param {{authorization:unknown,observations:unknown,observationId:string,capabilities:Capability[],paths:string[],deniedPaths:string[]}} options */
export function authorizationFromObservedPrincipal(options){
 const authorization=installationAuthorization(options.authorization),observations=principalObservations(options.observations);requireThat(/^[a-f0-9]{64}$/.test(options.observationId),'INVALID_ARGUMENT');const observed=observations.observations.filter(row=>row.observationId===options.observationId);requireThat(observed.length===1,'FORBIDDEN','Selected verified principal observation is unavailable');const subject=observed[0].subject;requireThat(subject!==authorization.ownerSubjectDigest,'FORBIDDEN','Installation owner is not an additional principal');const principals=authorization.principals.filter(row=>row.subject!==subject);principals.push({subject,capabilities:options.capabilities,paths:options.paths,deniedPaths:options.deniedPaths});principals.sort((a,b)=>a.subject.localeCompare(b.subject));return installationAuthorization({schemaVersion:1,ownerSubjectDigest:authorization.ownerSubjectDigest,principals});
}
