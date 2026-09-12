import {canonicalJson,recordDigest,parseRecord} from '../contracts/canonical.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {digest,id} from '../contracts/identity.mjs';
/** This record is assembled only by a native-composed execution port after its
 * authenticated assignment/outer-object join. Decoding it is not authentication.
 * RequiredValidation MACs the complete canonical binding, then checks the exact
 * expected private enrollment on every eligibility decision. Legacy qualification
 * receipts have no binding and are never accepted by a production validator.
 */
/** @typedef {{schemaVersion:1,contextDigest:string,outerReceiptDigest:string,assignmentId:string,inputIdentity:string,sessionId:string,providerRunId:string,providerRunAttempt:'1',profileDigest:string,sealDigest:string,eligible:boolean}} Proof */
const KEYS=['schemaVersion','contextDigest','outerReceiptDigest','assignmentId','inputIdentity','sessionId','providerRunId','providerRunAttempt','profileDigest','sealDigest','eligible'];
/** @param {unknown} proof @returns {Proof} */
export function checkProductionProof(proof){requireThat(proof!==null&&typeof proof==='object'&&!Array.isArray(proof)&&canonicalJson(Object.keys(proof).sort())===canonicalJson([...KEYS].sort()),'INTEGRITY_FAILURE','Malformed native production proof');const p=/** @type {Proof} */(proof);requireThat(p.schemaVersion===1&&p.providerRunAttempt==='1'&&typeof p.eligible==='boolean','INTEGRITY_FAILURE');for(const v of [p.contextDigest,p.outerReceiptDigest,p.inputIdentity,p.profileDigest,p.sealDigest])digest(v);for(const v of [p.assignmentId,p.sessionId,p.providerRunId])id(v);return p;}
/** @param {import('../contracts/ports.js').PreparedResult} result @param {import('../contracts/ports.js').Attempt} attempt @param {string} enrollmentDigest @param {readonly Proof[]} proofs */
export function productionBinding(result,attempt,enrollmentDigest,proofs){digest(enrollmentDigest);requireThat(proofs.length===result.execution.orderedProfileDigests.length&&proofs.length>0&&proofs.length<=64,'INTEGRITY_FAILURE');const exact=proofs.map((p,i)=>{checkProductionProof(p);requireThat(p.profileDigest===result.execution.orderedProfileDigests[i]&&p.sealDigest===enrollmentDigest,'INTEGRITY_FAILURE','Production profile/enrollment mismatch');return p;});requireThat(new Set(exact.map(p=>p.assignmentId)).size===exact.length&&new Set(exact.map(p=>p.outerReceiptDigest)).size===exact.length,'INTEGRITY_FAILURE','Production receipt reused across profiles');return canonicalJson({schemaVersion:1,enrollmentDigest,resultDigest:recordDigest('dev2.production-result.v1',result),attemptDigest:recordDigest('dev2.production-attempt.v1',attempt),proofs:exact});}
/** MAC verification precedes this predicate. Full immutable result and attempt
 * digests prevent a valid receipt being reattached to another generation, commit,
 * policy, installation, action or owner epoch. Parsing never supplies a trust key.
 * @param {import('../contracts/ports.js').PreparedResult} result @param {import('../contracts/ports.js').Attempt} attempt @param {string} enrollmentDigest @param {unknown} text */
export function productionBindingEligible(result,attempt,enrollmentDigest,text){try{requireThat(typeof text==='string'&&Buffer.byteLength(text)<=262144,'INTEGRITY_FAILURE');const value=parseRecord(text,262144);requireThat(value!==null&&typeof value==='object'&&!Array.isArray(value),'INTEGRITY_FAILURE');const row=/** @type {Record<string,unknown>} */(value);requireThat(canonicalJson(Object.keys(row).sort())===canonicalJson(['schemaVersion','enrollmentDigest','resultDigest','attemptDigest','proofs'].sort())&&Array.isArray(row.proofs),'INTEGRITY_FAILURE');const proofs=/** @type {Proof[]} */(/** @type {unknown} */(row.proofs));return text===productionBinding(result,attempt,enrollmentDigest,proofs)&&proofs.every(p=>p.eligible);}catch{return false;}}
