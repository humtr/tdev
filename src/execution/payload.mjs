import {createHash} from 'node:crypto';
import {canonicalJson,parseRecord,recordDigest,bytesDigest} from '../contracts/canonical.mjs';
import {verifySource} from '../candidate/tree.mjs';
import {legacySourceManifest} from '../repository/entries.mjs';
import {id,digest,oid} from '../contracts/identity.mjs';
import {requireThat} from '../contracts/errors.mjs';
/** @typedef {import('../contracts/ports.js').SourceTree} Source */
/** @typedef {import('../contracts/ports.js').Profile} Profile */
/** @typedef {import('../contracts/ports.js').ExecutionIdentity} Execution */
/** @typedef {{schemaVersion:1,resultId:string,source:Source,profile:Profile,execution:Execution,blobs:{oid:string,data:string}[]}} Payload */
export const PAYLOAD_BYTES=16777216;
/** @param {Execution} execution @param {'tdev'|'dev2'} [namespace] */
export function executionIdentity(execution,namespace='tdev'){requireThat(namespace==='tdev'||namespace==='dev2','INVALID_ARGUMENT','Managed identity namespace');return recordDigest(namespace+'.managed-execution.v1',execution);}
/** @param {Profile} profile @param {'tdev'|'dev2'} [namespace] */
export function profileIdentity(profile,namespace='tdev'){requireThat(namespace==='tdev'||namespace==='dev2','INVALID_ARGUMENT','Managed identity namespace');const {digest:ignored,...definition}=profile;return recordDigest(namespace+'.profile.v1',definition);}
/** Exact wire source identity. Retained pre-C2-2 managed controllers may need
 * the legacy digest for the same already-verified canonical entry set.
 * @param {Source} source @param {'tdev'|'dev2'} [namespace] @param {boolean} [legacyProjection] */
export function managedSourceManifest(source,namespace='tdev',legacyProjection=false){requireThat(namespace==='tdev'||namespace==='dev2','INVALID_ARGUMENT','Managed identity namespace');const entries=verifySource(source);requireThat(!legacyProjection||namespace==='dev2','INVALID_ARGUMENT','Legacy source projection requires retained dev2 identity');return legacyProjection?legacySourceManifest(entries):source.manifestDigest;}
/** The wire bundle is not a tar archive. Paths and object IDs come from the
 * verified source manifest; there is no extraction command, external URL or file
 * destination supplied by a candidate. Duplicate blobs are sent once.
 * @param {{repository:Pick<import('../repository/git.mjs').GitRepository,'blob'>,objects:import('../contracts/ports.js').ObjectStorePort,source:Source,resultId:string,profile:Profile,execution:Execution,namespace?:'tdev'|'dev2',legacySourceProjection?:boolean}} options */
export async function preparePayload(options){const {source,profile,execution}=options,namespace=options.namespace??'tdev';id(options.resultId);requireThat(profileIdentity(profile,namespace)===profile.digest&&execution.orderedProfileDigests.includes(profile.digest),'INTEGRITY_FAILURE','Profile is not in this execution identity');const entries=verifySource(source);requireThat(entries.length<=16384,'LIMIT_EXCEEDED');const sourceManifest=managedSourceManifest(source,namespace,options.legacySourceProjection===true),wireSource=sourceManifest===source.manifestDigest?source:{...source,manifestDigest:sourceManifest};
 const unique=[...new Set(entries.map(e=>e.blobOid))].sort(),blobs=[];let total=0;
 for(const objectId of unique){const bytes=await options.repository.blob(objectId);total+=bytes.byteLength;requireThat(total<=12000000,'LIMIT_EXCEEDED','Managed source bundle bound');blobs.push({oid:objectId,data:Buffer.from(bytes).toString('base64')});}
 /** @type {Payload} */const payload={schemaVersion:1,resultId:options.resultId,source:wireSource,profile,execution,blobs};const bytes=Buffer.from(canonicalJson(payload));requireThat(bytes.length<=PAYLOAD_BYTES,'LIMIT_EXCEEDED');const payloadDigest=bytesDigest(bytes);
 decodePayload(bytes,{resultId:options.resultId,sourceManifest,profileDigest:profile.digest,executionDigest:executionIdentity(execution,namespace),payloadDigest});
 requireThat(await options.objects.put(bytes)===payloadDigest,'INTEGRITY_FAILURE');return {payloadDigest,sourceManifest,objects:[{digest:payloadDigest,size:bytes.length}]};
}
/** Strict verification happens on the trusted outer host before any filesystem
 * materialization and before the candidate is allowed to execute in a sandbox.
 * @param {Uint8Array} bytes @param {{resultId:string,sourceManifest:string,profileDigest:string,executionDigest:string,payloadDigest:string}} expected */
export function decodePayload(bytes,expected){requireThat(bytes.byteLength<=PAYLOAD_BYTES&&bytesDigest(bytes)===expected.payloadDigest,'INTEGRITY_FAILURE','Managed payload digest');const raw=parseRecord(bytes,PAYLOAD_BYTES);requireThat(raw!==null&&typeof raw==='object'&&!Array.isArray(raw),'INTEGRITY_FAILURE');
 const payload=/** @type {Payload} */(/** @type {unknown} */(raw));requireThat(Object.keys(payload).sort().join(',')==='blobs,execution,profile,resultId,schemaVersion,source'&&payload.schemaVersion===1&&payload.resultId===expected.resultId,'INTEGRITY_FAILURE');id(payload.resultId);
 const currentExecution=executionIdentity(payload.execution,'tdev'),legacyExecution=executionIdentity(payload.execution,'dev2'),namespace=expected.executionDigest===currentExecution?'tdev':expected.executionDigest===legacyExecution?'dev2':'';
 const entries=verifySource(payload.source);requireThat(namespace!==''&&entries.length<=16384&&payload.source.manifestDigest===expected.sourceManifest&&profileIdentity(payload.profile,/** @type {'tdev'|'dev2'} */(namespace))===expected.profileDigest&&payload.profile.digest===expected.profileDigest&&payload.execution.orderedProfileDigests.includes(expected.profileDigest),'INTEGRITY_FAILURE','Managed assignment input changed');
 requireThat(Array.isArray(payload.blobs)&&payload.blobs.length<=entries.length,'INTEGRITY_FAILURE');const contents=new Map();let total=0;
 for(const b of payload.blobs){requireThat(b!==null&&typeof b==='object'&&Object.keys(b).sort().join(',')==='data,oid'&&typeof b.data==='string','INTEGRITY_FAILURE');oid(b.oid);requireThat(!contents.has(b.oid),'INTEGRITY_FAILURE');const bytes=Buffer.from(b.data,'base64');total+=bytes.length;requireThat(bytes.toString('base64')===b.data&&total<=12000000,'INTEGRITY_FAILURE');const [algorithm,value]=b.oid.split(':');requireThat(createHash(algorithm).update('blob '+bytes.length+'\0').update(bytes).digest('hex')===value,'INTEGRITY_FAILURE','Managed Git object digest');contents.set(b.oid,bytes);}
 const referenced=new Set();for(const e of entries){const bytes=contents.get(e.blobOid);requireThat(bytes&&bytes.length===e.size&&bytesDigest(bytes)===e.contentDigest,'INTEGRITY_FAILURE','Managed source content digest');referenced.add(e.blobOid);}requireThat(contents.size===referenced.size,'INTEGRITY_FAILURE','Unexpected source objects');
 for(const value of [payload.execution.trustedRunnerDigest,payload.execution.toolchainDigest,payload.execution.dependencyLockDigest])digest(value);
 return {payload,repository:{blob:async(/** @type {string} */ objectId)=>{const bytes=contents.get(objectId);requireThat(bytes,'FORBIDDEN','Object outside assigned source');return Buffer.from(bytes);}}};
}
/** Profile-specific physical identity does not replace the durable logical work,
 * action, attempt or result identity. Two required profiles never reuse a stopped
 * container with a different input.
 * @param {import('./session-types.js').Assignment} assignment */
export function physicalAttempt(assignment){const identity={attempt:assignment.input.attempt,profileDigest:assignment.input.profileDigest},current=recordDigest('tdev.managed-assignment.v1',identity).slice(7),legacy=recordDigest('dev2.managed-assignment.v1',identity).slice(7),namespace=assignment.assignmentId===current?'tdev':assignment.assignmentId===legacy?'dev2':'';requireThat(namespace!=='' ,'INTEGRITY_FAILURE','Unknown managed assignment namespace');return {...assignment.input.attempt,attemptId:recordDigest(namespace+'.managed-sandbox.v1',{attempt:assignment.input.attempt,resultId:assignment.input.resultId,profileDigest:assignment.input.profileDigest}).slice(7)};}
