import { jwtVerify } from 'jose';
import { requireThat, Dev2Error } from '../contracts/errors.mjs';
import { id, revision } from '../contracts/identity.mjs';
import { recordDigest } from '../contracts/canonical.mjs';
import { workersDevOrigin } from '../runtime/environment.mjs';
/** No provider launches or mutation live in this module. Caller supplies a current
 * persisted launch plus authenticated provider observation, never peer claims.
 * @typedef {{sessionId:string,installationId:string,repositoryId:string,repositoryOwnerId:string,repositoryFullName:string,
 * ref:string,workflowRef:string,launchCommit:string,runId:string,runAttempt:string,active:boolean,expiresAt:number,
 * provider:{runId:string,runAttempt:string,headSha:string,headBranch:string,event:string,workflowPath:string,status:string}}} LaunchAuthorization
 * @typedef {{kind:'github-executor',sessionId:string,installationId:string,repositoryId:string,runId:string,runAttempt:string,launchCommit:string,expiresAt:number,launchIdentity:string}} ExecutorIdentity
 */
/** @param {{origin:string,installationId:string}} config
 * @param {import('jose').JWTVerifyGetKey} keyResolver
 * @param {(sessionId:string)=>Promise<LaunchAuthorization|null>} readLaunch
 * @param {()=>number} [now] */
export function githubExecutorVerifier(config, keyResolver, readLaunch, now = Date.now) {
    const audience = workersDevOrigin(config.origin) + '/executor', installationId = id(config.installationId);
    const issuer = 'https://token.actions.githubusercontent.com';
    /** @param {unknown} assertion @param {string} sessionId @returns {Promise<ExecutorIdentity>} */
    return async (assertion, sessionId) => {
        requireThat(typeof assertion === 'string' && assertion.length <= 32768 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(assertion), 'UNAUTHORIZED');
        try {
            id(sessionId);
            const milliseconds = now();
            requireThat(Number.isSafeInteger(milliseconds) && milliseconds >= 0, 'UNAUTHORIZED');
            const { payload: p } = await jwtVerify(assertion, keyResolver, { issuer, audience, algorithms: ['RS256'], requiredClaims: ['sub', 'exp', 'iat', 'nbf', 'repository_id', 'repository_owner_id', 'ref', 'sha', 'workflow_ref', 'workflow_sha', 'run_id', 'run_attempt', 'runner_environment', 'event_name'], currentDate: new Date(milliseconds), clockTolerance: 0 });
            requireThat(typeof p.sub === 'string' && p.sub.length > 0 && p.sub.length <= 2048 && p.aud === audience, 'UNAUTHORIZED');
            requireThat([p.exp, p.iat, p.nbf].every(x => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 && Number.isSafeInteger(x * 1000)), 'UNAUTHORIZED');
            requireThat(/** @type {number} */ (p.iat) <= milliseconds / 1000 && /** @type {number} */ (p.iat) < /** @type {number} */ (p.exp), 'UNAUTHORIZED');
            const expected = await readLaunch(sessionId);
            requireThat(expected && expected.active && expected.sessionId === sessionId && expected.installationId === installationId && Number.isSafeInteger(expected.expiresAt) && expected.expiresAt > milliseconds, 'UNAUTHORIZED');
            for (const s of [expected.repositoryId, expected.repositoryOwnerId, expected.runId])
                requireThat(revision(s) !== '0', 'UNAUTHORIZED');
            const ref = 'refs/heads/dev2-exec/' + sessionId;
            const workflowPath = '.github/workflows/dev2-executor.yml';
            requireThat(expected.ref === ref && expected.workflowRef === expected.repositoryFullName + '/' + workflowPath + '@' + ref && /^[0-9a-f]{40}$/.test(expected.launchCommit) && expected.runAttempt === '1', 'UNAUTHORIZED');
            const claims = { repository_id: expected.repositoryId, repository_owner_id: expected.repositoryOwnerId, ref, sha: expected.launchCommit, workflow_ref: expected.workflowRef, workflow_sha: expected.launchCommit, run_id: expected.runId, run_attempt: '1', runner_environment: 'github-hosted', event_name: 'push' };
            requireThat(Object.entries(claims).every(([key, value]) => p[key] === value), 'UNAUTHORIZED');
            const observed = expected.provider;
            requireThat(observed.runId === expected.runId && observed.runAttempt === '1' && observed.headSha === expected.launchCommit && observed.headBranch === ref.slice('refs/heads/'.length) && observed.event === 'push' && observed.workflowPath === workflowPath && observed.status === 'in_progress', 'UNAUTHORIZED');
            const observedNow = now();
            requireThat(Number.isSafeInteger(observedNow) && observedNow >= milliseconds && observedNow < expected.expiresAt && observedNow < /** @type {number} */ (p.exp) * 1000, 'UNAUTHORIZED');
            return { kind: 'github-executor', sessionId, installationId, repositoryId: expected.repositoryId, runId: expected.runId, runAttempt: '1', launchCommit: expected.launchCommit, expiresAt: Math.min(/** @type {number} */ (p.exp) * 1000, expected.expiresAt), launchIdentity: recordDigest('dev2.execution-launch.v1', { installationId, sessionId, ...claims }) };
        }
        catch {
            throw new Dev2Error('UNAUTHORIZED');
        }
    };
}
