import { recordDigest } from './canonical.mjs';
import { digest, gitOid, identifier, revision } from './identity.mjs';
import { requireThat } from './errors.mjs';
/** @param {import('./types.mjs').PreparedResult} result @param {import('./types.mjs').ValidationRequirements} required */
export function validationIdentity(result, required) {
    identifier(result.resultId);
    identifier(result.repositoryId);
    identifier(result.bindingEpoch);
    identifier(result.workId);
    revision(result.generation);
    gitOid(result.baseHead);
    gitOid(result.commitOid);
    gitOid(result.resultTreeOid);
    digest(result.resultTreeSha256);
    digest(result.policyDigest);
    requireThat(result.policyDigest === required.policyDigest, 'STALE_RESULT', 'Result policy differs from adopted policy');
    requireThat(required.profileDigests.length > 0 && new Set(required.profileDigests).size === required.profileDigests.length, 'INVALID_ARGUMENT', 'Required profiles must be nonempty and unique');
    for (const d of [...required.profileDigests, required.trustedRunnerDigest, required.toolchainDigest, required.dependencyLockDigest])
        digest(d);
    return recordDigest('dev2.validation-identity.v1', { repositoryId: result.repositoryId, bindingEpoch: result.bindingEpoch, resultId: result.resultId, baseHead: result.baseHead, commitOid: result.commitOid, resultTreeOid: result.resultTreeOid, resultTreeSha256: result.resultTreeSha256, policyDigest: required.policyDigest, orderedProfileDigests: [...required.profileDigests], trustedRunnerDigest: required.trustedRunnerDigest, toolchainDigest: required.toolchainDigest, environmentClass: required.environmentClass, dependencyLockDigest: required.dependencyLockDigest });
}
/** @param {import('./types.mjs').PreparedResult} result @param {{workId:string,generation:string,baseHead:import('./identity.mjs').GitOid,policyDigest:import('./identity.mjs').Digest}} expected */
export function assertResultReusable(result, expected) { for (const key of /** @type {const} */ (['workId', 'generation', 'baseHead', 'policyDigest']))
    requireThat(result[key] === expected[key], 'STALE_RESULT', 'Prepared result precondition changed', { field: key }); }
