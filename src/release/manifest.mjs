import {canonicalJson,recordDigest} from '../contracts/canonical.mjs';
import {id,digest,oid,revision} from '../contracts/identity.mjs';
import {requireThat} from '../contracts/errors.mjs';
/** @typedef {import('./types.js').ReleaseManifest} Manifest */
/** @typedef {import('./types.js').RuntimePair} Pair */
/** @typedef {import('./types.js').ActivationIntent} Intent */
/** @param {unknown} value @param {readonly string[]} keys */
function closed(value,keys){requireThat(value!==null&&typeof value==='object'&&!Array.isArray(value)&&canonicalJson(Object.keys(value).sort())===canonicalJson([...keys].sort()),'INVALID_ARGUMENT','Closed release record');}
/** @param {import('./types.js').VersionRange} value */
function range(value){closed(value,['min','max']);requireThat(Number.isSafeInteger(value.min)&&value.min>=1&&Number.isSafeInteger(value.max)&&value.max>=value.min&&value.max<=65535,'INVALID_ARGUMENT','Compatibility range');}
/** @param {Manifest} value @returns {Manifest} */
export function releaseManifest(value){
 closed(value,['schemaVersion','repositoryId','bindingEpoch','sourceCommitOid','sourceTreeOid','sourceManifestDigest','policyDigest','schemaDigest','protocol','ledger','installationSealDigest','requiredValidationId','releaseValidationId','device','edge','executor']);
 requireThat(value.schemaVersion===1,'INVALID_ARGUMENT');id(value.repositoryId);revision(value.bindingEpoch);oid(value.sourceCommitOid);oid(value.sourceTreeOid);
 for(const key of ['sourceManifestDigest','policyDigest','schemaDigest','installationSealDigest','requiredValidationId','releaseValidationId'])digest(value[/** @type {'schemaDigest'} */(key)]);
 range(value.protocol);range(value.ledger);closed(value.device,['artifactDigest','sourceCommitOid']);closed(value.edge,['artifactDigest','sourceCommitOid','compatibilityDate']);closed(value.executor,['workflowDigest','controllerDigest','sealDigest']);
 digest(value.device.artifactDigest);oid(value.device.sourceCommitOid);digest(value.edge.artifactDigest);oid(value.edge.sourceCommitOid);
 const date=Date.parse(value.edge.compatibilityDate+'T00:00:00Z');
 requireThat(/^\d{4}-\d{2}-\d{2}$/.test(value.edge.compatibilityDate)&&Number.isFinite(date)&&new Date(date).toISOString().slice(0,10)===value.edge.compatibilityDate,'INVALID_ARGUMENT','Worker compatibility date');
 for(const d of Object.values(value.executor))digest(d);
 return structuredClone(value);
}
/** Staged public activation input is the 64 hexadecimal characters of releaseId.
 * The frozen public id/digest unions need no new tool or schema variant.
 * @param {Manifest} manifest */
export function releaseIdentity(manifest){return recordDigest('dev2.release-manifest.v1',releaseManifest(manifest));}
/** @param {string} releaseId */
export function stagedReleaseId(releaseId){return digest(releaseId).slice(7);}
/** @param {string} stageId */
export function releaseIdFromStage(stageId){requireThat(/^[a-f0-9]{64}$/.test(stageId),'INVALID_ARGUMENT','Exact staged release identity');return digest('sha256:'+stageId);}
/** @param {Pair} value @returns {Pair} */
export function runtimePair(value){
 closed(value,['releaseId','schemaDigest','sourceCommitOid','deviceReleaseId','deviceArtifactDigest','deviceSourceCommitOid','edgeVersionId','edgeArtifactDigest','edgeSourceCommitOid','protocol','ledger']);
 for(const key of ['releaseId','schemaDigest','deviceReleaseId','deviceArtifactDigest','edgeArtifactDigest'])digest(value[/** @type {'releaseId'} */(key)]);
 for(const key of ['sourceCommitOid','deviceSourceCommitOid','edgeSourceCommitOid'])oid(value[/** @type {'sourceCommitOid'} */(key)]);
 id(value.edgeVersionId);range(value.protocol);range(value.ledger);return structuredClone(value);
}
/** An ordinary activation is deliberately non-destructive. Merely overlapping
 * ledger ranges does not authorize migrating a control database.
 * @param {Pair} oldPair @param {Pair} newPair @param {number} ledgerVersion */
export function compatiblePair(oldPair,newPair,ledgerVersion){
 runtimePair(oldPair);runtimePair(newPair);
 requireThat(oldPair.schemaDigest===newPair.schemaDigest,'EXECUTION_UNAVAILABLE','Public contract migration requires a separate procedure');
 requireThat(Math.max(oldPair.protocol.min,newPair.protocol.min)<=Math.min(oldPair.protocol.max,newPair.protocol.max),'EXECUTION_UNAVAILABLE','No shared channel protocol');
 requireThat(Number.isSafeInteger(ledgerVersion)&&[oldPair,newPair].every(p=>p.ledger.min<=ledgerVersion&&p.ledger.max>=ledgerVersion),'EXECUTION_UNAVAILABLE','Ledger migration is not an ordinary activation');
}
/** @param {Intent} value @param {number} [ledgerVersion] @returns {Intent} */
export function activationIntent(value,ledgerVersion=1){
 closed(value,['activationId','actionId','installationId','repositoryId','bindingEpoch','principalId','createdAt','deadline','previous','target']);
 for(const key of ['activationId','actionId','installationId','repositoryId'])id(value[/** @type {'activationId'} */(key)]);
 requireThat(typeof value.principalId==='string'&&value.principalId.length>0&&value.principalId.length<=4096,'INVALID_ARGUMENT');revision(value.bindingEpoch);
 requireThat(Number.isSafeInteger(value.createdAt)&&value.createdAt>=0&&Number.isSafeInteger(value.deadline)&&value.deadline>value.createdAt,'INVALID_ARGUMENT');
 compatiblePair(value.previous,value.target,ledgerVersion);
 requireThat(value.previous.releaseId!==value.target.releaseId,'NO_CHANGE');return structuredClone(value);
}
