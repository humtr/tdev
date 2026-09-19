import {lstat,readFile,realpath,open,rename,rm} from 'node:fs/promises';
import {resolve,join,isAbsolute,dirname} from 'node:path';
import {randomBytes} from 'node:crypto';
import {bytesDigest,canonicalJson,parseRecord,recordDigest} from '../contracts/canonical.mjs';
import {requireThat} from '../contracts/errors.mjs';

/** @typedef {{observationId:string,subject:string,assertionDigest:string,observedAt:string}} Observation */
/** @typedef {{schemaVersion:1,observations:Observation[]}} ObservationFile */
const MAX_OBSERVATIONS=8;
let writer=Promise.resolve();

/** @param {unknown} value @param {readonly string[]} keys */
function closed(value,keys){requireThat(value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(','),'INVALID_ARGUMENT','Closed C2-2 principal observation record required');}

/** @param {unknown} input @returns {ObservationFile} */
export function c22PrincipalObservations(input){
 const value=/** @type {Record<string,unknown>} */(input);closed(value,['schemaVersion','observations']);requireThat(value.schemaVersion===1&&Array.isArray(value.observations)&&value.observations.length<=MAX_OBSERVATIONS,'INVALID_ARGUMENT');
 const ids=new Set();/** @type {Observation[]} */const observations=[];
 for(const raw of value.observations){const row=/** @type {Record<string,unknown>} */(raw);closed(row,['observationId','subject','assertionDigest','observedAt']);
  requireThat(typeof row.subject==='string'&&/^[a-f0-9]{64}$/.test(row.subject)&&typeof row.assertionDigest==='string'&&/^sha256:[a-f0-9]{64}$/.test(row.assertionDigest)&&typeof row.observationId==='string'&&/^[a-f0-9]{64}$/.test(row.observationId)&&typeof row.observedAt==='string'&&Number.isFinite(Date.parse(row.observedAt))&&new Date(row.observedAt).toISOString()===row.observedAt,'INVALID_ARGUMENT');
  requireThat(row.observationId===recordDigest('tdev.c2-2-access-principal-observation.v1',{subject:row.subject,assertionDigest:row.assertionDigest}).slice(7)&&!ids.has(row.observationId),'INTEGRITY_FAILURE','Invalid or duplicate C2-2 principal observation');ids.add(row.observationId);
  observations.push({observationId:row.observationId,subject:row.subject,assertionDigest:row.assertionDigest,observedAt:row.observedAt});
 }
 observations.sort((a,b)=>a.observationId.localeCompare(b.observationId));return /** @type {ObservationFile} */(parseRecord(canonicalJson({schemaVersion:1,observations}),65536));
}

/** @param {string} stateDirectory */
export function c22PrincipalObservationPath(stateDirectory){requireThat(typeof stateDirectory==='string'&&isAbsolute(stateDirectory),'INVALID_ARGUMENT');return resolve(join(stateDirectory,'private','c2-2-principal-observations.json'));}

/** @param {unknown} args */
export function isC22PrincipalObservationRequest(args){
 if(args===null||typeof args!=='object'||Array.isArray(args))return false;
 const value=/** @type {Record<string,unknown>} */(args),keys=Object.keys(value);
 return keys.every(key=>['apiVersion','repository','freshness'].includes(key))&&value.apiVersion===1&&(value.repository===undefined||value.repository==='self')&&(value.freshness===undefined||value.freshness==='current');
}

/** @param {string} filename */
async function secureBytes(filename){const path=resolve(filename),before=await lstat(path);requireThat(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&before.uid===process.getuid?.()&&(before.mode&0o077)===0&&before.size<=65536&&await realpath(path)===path,'FORBIDDEN','Unsafe C2-2 principal observation file');const bytes=await readFile(path),after=await lstat(path);requireThat(before.ino===after.ino&&before.dev===after.dev&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&bytes.length===before.size,'INTEGRITY_FAILURE');return bytes;}

/** @param {string} filename */
export async function readC22PrincipalObservations(filename){return c22PrincipalObservations(parseRecord(await secureBytes(filename),65536));}

/** @param {string} filename @param {ObservationFile} value */
async function replace(filename,value){const path=resolve(filename),directory=dirname(path),dir=await lstat(directory);requireThat(dir.isDirectory()&&!dir.isSymbolicLink()&&dir.uid===process.getuid?.()&&(dir.mode&0o077)===0&&await realpath(directory)===directory,'FORBIDDEN','Unsafe C2-2 principal observation directory');const bytes=Buffer.from(canonicalJson(value)+'\n'),temporary=path+'.tmp-'+randomBytes(12).toString('hex'),handle=await open(temporary,'wx',0o600);try{try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}await rename(temporary,path);const parent=await open(directory,'r');try{await parent.sync();}finally{await parent.close();}return await readC22PrincipalObservations(path);}finally{await rm(temporary,{force:true});}}

/** Records digest-only evidence after signed Access assertion verification.
 * It confers no capability and is consumed with C2-2 recovery.
 * @param {{filename:string,subject:string,assertion:string,now?:()=>number}} options */
export function recordVerifiedC22PrincipalObservation(options){
 const task=writer.then(async()=>{requireThat(/^[a-f0-9]{64}$/.test(options.subject)&&typeof options.assertion==='string'&&options.assertion.length>0&&options.assertion.length<=16384,'INVALID_ARGUMENT');const now=(options.now??Date.now)();requireThat(Number.isSafeInteger(now)&&now>0,'INVALID_ARGUMENT');const assertionDigest=bytesDigest(Buffer.from(options.assertion)),observationId=recordDigest('tdev.c2-2-access-principal-observation.v1',{subject:options.subject,assertionDigest}).slice(7),observedAt=new Date(now).toISOString();let current;try{current=await readC22PrincipalObservations(options.filename);}catch(error){if(!(error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT'))throw error;current=c22PrincipalObservations({schemaVersion:1,observations:[]});}
  const existing=current.observations.find(row=>row.observationId===observationId);if(existing)return existing;requireThat(current.observations.length<MAX_OBSERVATIONS,'CAPACITY_REJECTED','C2-2 principal observation capacity');const installed=await replace(options.filename,c22PrincipalObservations({schemaVersion:1,observations:[...current.observations,{observationId,subject:options.subject,assertionDigest,observedAt}]}));return /** @type {Observation} */(installed.observations.find(row=>row.observationId===observationId));});writer=task.then(()=>{},()=>{});return task;
}
