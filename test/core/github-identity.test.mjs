import test from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet } from 'jose';
import { githubExecutorVerifier } from '../../src/execution/github-identity.mjs';
const time = 1700000000000, origin = 'https://fixture.fixture-account.workers.dev', sessionId = 'session_fixture', sha = 'a'.repeat(40), ref = 'refs/heads/dev2-exec/' + sessionId;
const expected = () => ({ sessionId, installationId: 'install', repositoryId: '100', repositoryOwnerId: '200', repositoryFullName: 'fixture/repo', ref, workflowRef: 'fixture/repo/.github/workflows/dev2-executor.yml@' + ref, launchCommit: sha, runId: '300', runAttempt: '1', active: true, expiresAt: time + 120000, provider: { runId: '300', runAttempt: '1', headSha: sha, headBranch: ref.slice(11), event: 'push', workflowPath: '.github/workflows/dev2-executor.yml', status: 'in_progress' } });
async function setup() {
    const { privateKey, publicKey } = await generateKeyPair('RS256'), jwk = await exportJWK(publicKey);
    jwk.kid = 'test';
    let launch = expected(), reads = 0;
    const read = async () => { reads++; return launch; };
    const config = { origin, installationId: 'install' };
    const verify = githubExecutorVerifier(config, createLocalJWKSet({ keys: [jwk] }), read, () => time);
    const token = async (extra = {}) => new SignJWT({ iss: 'https://token.actions.githubusercontent.com', aud: origin + '/executor', sub: 'repo:fixture/repo:ref:' + ref, iat: time / 1000, nbf: time / 1000, exp: time / 1000 + 60, repository_id: '100', repository_owner_id: '200', ref, sha, workflow_ref: launch.workflowRef, workflow_sha: sha, run_id: '300', run_attempt: '1', runner_environment: 'github-hosted', event_name: 'push', ...extra }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).sign(privateKey);
    return { verify, token, set: v => { launch = v; }, reads: () => reads };
}
test('verified managed job identity is not a user principal or canonical mutation grant', async () => { const f = await setup(), identity = await f.verify(await f.token(), sessionId); assert.equal(identity.kind, 'github-executor'); assert.equal(identity.runId, '300'); assert.equal(identity.expiresAt, time + 60000); assert.equal('tokenCapabilities' in identity, false); assert.equal('subject' in identity, false); assert.match(identity.launchIdentity, /^sha256:[a-f0-9]{64}$/); });
test('every immutable provider claim is compared; reruns, forks and self-hosted jobs cannot enroll', async () => {
    const f = await setup();
    for (const extra of [{ repository_id: 'other' }, { repository_owner_id: 'other' }, { ref: 'refs/pull/1/merge' }, { sha: 'b'.repeat(40) }, { workflow_ref: 'other' }, { workflow_sha: 'b'.repeat(40) }, { run_id: '301' }, { run_attempt: '2' }, { runner_environment: 'self-hosted' }, { event_name: 'pull_request' }, { aud: origin + '/mcp' }, { iss: 'https://other.example' }, { exp: time / 1000 }, { nbf: time / 1000 + 1 }, { iat: time / 1000 + 1 }, { sub: '' }])
        await assert.rejects(() => f.token(extra).then(t => f.verify(t, sessionId)), { code: 'UNAUTHORIZED' });
});
test('current launch row and authenticated provider readback are both mandatory', async () => {
    const f = await setup(), token = await f.token();
    for (const extra of [{ active: false }, { sessionId: 'other' }, { installationId: 'other' }, { expiresAt: time }, { runAttempt: '2' }, { launchCommit: 'b'.repeat(40) }, { ref: 'refs/heads/dev-2' }]) {
        f.set({ ...expected(), ...extra });
        await assert.rejects(() => f.verify(token, sessionId), { code: 'UNAUTHORIZED' });
    }
    for (const extra of [{ runId: 'other' }, { runAttempt: '2' }, { headSha: 'b'.repeat(40) }, { headBranch: 'dev-2' }, { event: 'workflow_dispatch' }, { workflowPath: 'candidate.yml' }, { status: 'completed' }]) {
        f.set({ ...expected(), provider: { ...expected().provider, ...extra } });
        await assert.rejects(() => f.verify(token, sessionId), { code: 'UNAUTHORIZED' });
    }
    f.set(null);
    await assert.rejects(() => f.verify(token, sessionId), { code: 'UNAUTHORIZED' });
});
test('bad signature/opaque credential never triggers launch lookup and errors do not expose provider details', async () => {
    const f = await setup();
    const token = await f.token();
    for (const value of ['oauth:opaque', 'Bearer ' + token, token.slice(0, -30) + 'A'.repeat(30)])
        await assert.rejects(() => f.verify(value, sessionId), e => e.code === 'UNAUTHORIZED' && !e.message.includes('token'));
    assert.equal(f.reads(), 0);
});
test('revoked launch cannot reuse a prior authentication decision', async () => { const f = await setup(), token = await f.token(); await f.verify(token, sessionId); f.set({ ...expected(), active: false }); await assert.rejects(() => f.verify(token, sessionId), { code: 'UNAUTHORIZED' }); assert.equal(f.reads(), 2); });
test('a token expiring during authenticated provider lookup cannot start a new connection', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256'), jwk = await exportJWK(publicKey);
    jwk.kid = 'delayed';
    let clock = time;
    const verify = githubExecutorVerifier({ origin, installationId: 'install' }, createLocalJWKSet({ keys: [jwk] }), async () => { clock = time + 60000; return expected(); }, () => clock);
    const token = await new SignJWT({ iss: 'https://token.actions.githubusercontent.com', aud: origin + '/executor', sub: 'fixture', iat: time / 1000, nbf: time / 1000, exp: time / 1000 + 60, repository_id: '100', repository_owner_id: '200', ref, sha, workflow_ref: expected().workflowRef, workflow_sha: sha, run_id: '300', run_attempt: '1', runner_environment: 'github-hosted', event_name: 'push' }).setProtectedHeader({ alg: 'RS256', kid: 'delayed' }).sign(privateKey);
    await assert.rejects(() => verify(token, sessionId), { code: 'UNAUTHORIZED' });
});
