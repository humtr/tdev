import {gitOid} from '../../src/contracts/identity.mjs';
import {bytesDigest} from '../../src/contracts/canonical.mjs';
export const D=bytesDigest('fixture');
/** @type {import('../../src/contracts/identity.mjs').GitOid} */
export const H=gitOid('sha1:'+ '1'.repeat(40));
/** @type {import('../../src/contracts/identity.mjs').GitOid} */
export const T=gitOid('sha1:'+ '2'.repeat(40));
/** @param {Partial<import('../../src/contracts/types.mjs').Work>} [extra] @returns {import('../../src/contracts/types.mjs').Work} */
export function work(extra={}){return {workId:'work-1',repositoryId:'self',bindingEpoch:'epoch-1',subject:'subject-1',objective:'Fixture change',baseHead:H,baseTree:T,candidateTree:T,candidateManifest:D,generation:'0',revision:'0',disposition:'open',currentActionId:null,blocker:null,createdSequence:'1',...extra};}
/** @param {Partial<import('../../src/contracts/types.mjs').Action>} [extra] @returns {import('../../src/contracts/types.mjs').Action} */
export function action(extra={}){return {actionId:'action-1',requestId:'request-1',principal:'subject-1',bindingEpoch:'epoch-1',requestDigest:D,workId:'work-1',op:'validate',input:{workId:'work-1'},status:'queued',step:'admitted',attempt:'0',ownerEpoch:'1',deadline:10000,cancelRequested:false,reservation:false,result:null,blocker:null,readySequence:'1',...extra};}
/** @param {Partial<import('../../src/contracts/types.mjs').PreparedResult>} [extra] @returns {import('../../src/contracts/types.mjs').PreparedResult} */
export function prepared(extra={}){return {resultId:'result-1',repositoryId:'self',bindingEpoch:'epoch-1',workId:'work-1',generation:'0',originalBaseHead:H,originalBaseTree:T,candidateTree:T,baseHead:H,commitOid:gitOid('sha1:'+'3'.repeat(40)),resultTreeOid:T,resultTreeSha256:D,policyDigest:D,metadata:{name:'fixture',email:'fixture@example.invalid',timestamp:1,message:'Change'},...extra};}
/** @param {Partial<import('../../src/contracts/types.mjs').ValidationRequirements>} [extra] @returns {import('../../src/contracts/types.mjs').ValidationRequirements} */
export function requirements(extra={}){return {policyDigest:D,profileDigests:[D],trustedRunnerDigest:D,toolchainDigest:D,environmentClass:'fixture-only',dependencyLockDigest:D,...extra};}
