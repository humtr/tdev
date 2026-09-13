import test from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet } from 'jose';
import { accessApplicationVerifier } from '../../src/security/access-application.mjs';
import { bearerVerifier, ScopedAuthorization } from '../../src/security/authorization.mjs';
const now = 1700000000000;
const config = { profile: 'access-application', issuer: 'https://unit-test.cloudflareaccess.com', applicationAudience: 'a'.repeat(64), resourceOrigin: 'https://unit-test.invalid-fixture.workers.dev', applicationCapabilities: ['repository.read'] };
const key = await generateKeyPair('RS256'), jwk = await exportJWK(key.publicKey);
jwk.kid = 'fixture';
const keys = createLocalJWKSet({ keys: [jwk] });
async function token(extra = {}) { return new SignJWT({ type: 'app', sub: 'user-id', email: 'user@example.invalid', iat: now / 1000, exp: now / 1000 + 60, iss: config.issuer, aud: [config.applicationAudience], ...extra }).setProtectedHeader({ alg: 'RS256', kid: 'fixture' }).sign(key.privateKey); }
test('signed human Access identity uses an explicitly adopted app ceiling, never invented token scopes', async () => {
    const verify = accessApplicationVerifier(config, keys, () => now), p = await verify(await token({ scope: 'integration.write runtime.activate' }));
    assert.deepEqual(p.tokenCapabilities, ['repository.read']);
    assert.equal(p.audience, config.resourceOrigin);
    assert.equal(p.issuer, config.issuer);
    assert.equal(p.expiresAt, now + 60000);
    assert.equal(p.subject.length, 64);
    assert.equal(JSON.stringify(p).includes('user@example.invalid'), false);
    const mutable = { ...config, applicationCapabilities: ['repository.read'] };
    const sealed = accessApplicationVerifier(mutable, keys, () => now);
    mutable.applicationCapabilities.push('integration.write');
    assert.deepEqual((await sealed(await token())).tokenCapabilities, ['repository.read']);
});
test('same email with a distinct verified Access sub remains a distinct unauthorized principal', async () => {
    const verify = accessApplicationVerifier(config, keys, () => now), a = await verify(await token({ sub: 'access-sub-a' })), b = await verify(await token({ sub: 'access-sub-b' }));
    assert.notEqual(a.subject, b.subject);
    const binding = { repositoryId: 'repo', installationId: 'i', provider: 'fixture', providerRepositoryId: 'p', remote: 'https://git.example/repo', ref: 'refs/heads/dev-2', bindingEpoch: '1', policyDigest: 'sha256:' + '1'.repeat(64) };
    const grants = [{ subject: a.subject, installationId: 'i', repositoryId: 'repo', ref: binding.ref, capabilities: ['repository.read'], paths: [''], deniedPaths: [] }];
    const auth = new ScopedAuthorization({ issuer: a.issuer, audience: a.audience, now: () => now, bindings: () => [binding], grants: () => grants });
    await auth.authorize(a, binding, 'repository.read');
    await assert.rejects(() => auth.authorize(b, binding, 'repository.read'), { code: 'FORBIDDEN' });
});
test('opaque bearer, forged header, wrong signature, application and issuer fail closed', async () => {
    const verify = accessApplicationVerifier(config, keys, () => now), good = await token();
    for (const bad of ['Bearer opaque-token', good.slice(0, -12) + 'AAAAAAAAAAAA', JSON.stringify({ sub: 'user-id' }), await token({ aud: ['b'.repeat(64)] }), await token({ iss: 'https://other.cloudflareaccess.com' }), await token({ aud: [config.applicationAudience, 'b'.repeat(64)] })])
        await assert.rejects(() => verify(bad), { code: 'UNAUTHORIZED' });
});
test('service/global identities and missing human fields never gain human capabilities', async () => {
    const verify = accessApplicationVerifier(config, keys, () => now);
    for (const changed of [{ sub: '' }, { email: '' }, { email: undefined }, { type: 'org' }, { common_name: 'service.access' }, { service_token_status: true }, { service_token_id: 'service' }])
        await assert.rejects(() => token(changed).then(verify), { code: 'UNAUTHORIZED' });
});
test('expiry, future issue/not-before and malformed time claims are rejected', async () => {
    const verify = accessApplicationVerifier(config, keys, () => now);
    for (const changed of [{ exp: now / 1000 }, { iat: now / 1000 + 1 }, { nbf: now / 1000 + 1 }, { iat: undefined }, { iat: 1.5 }, { exp: now / 1000 + 0.5 }])
        await assert.rejects(() => token(changed).then(verify), { code: 'UNAUTHORIZED' });
});
test('scope-based verifier is not relaxed or automatically substituted by Access mode', async () => {
    const old = bearerVerifier({ issuer: config.issuer, audience: config.resourceOrigin, algorithms: ['RS256'] }, keys, () => now);
    await assert.rejects(async () => old('Bearer ' + await token({ aud: config.resourceOrigin })), { code: 'UNAUTHORIZED' });
    for (const changed of [{ profile: 'oauth-jwt' }, { applicationCapabilities: [] }, { applicationCapabilities: ['arbitrary'] }, { applicationCapabilities: ['repository.read', 'repository.read'] }, { resourceOrigin: 'https://example.com' }])
        assert.throws(() => accessApplicationVerifier({ ...config, ...changed }, keys, () => now), { code: 'INVALID_ARGUMENT' });
});
test('standing grants still intersect app delegation and are re-read after revocation', async () => {
    const p = await accessApplicationVerifier(config, keys, () => now)(await token());
    const binding = { repositoryId: 'repo', installationId: 'i', provider: 'fixture', providerRepositoryId: 'p', remote: 'https://git.example/repo', ref: 'refs/heads/dev-2', bindingEpoch: '1', policyDigest: 'sha256:' + '1'.repeat(64) };
    let grants = [{ subject: p.subject, installationId: 'i', repositoryId: 'repo', ref: binding.ref, capabilities: ['repository.read', 'integration.write'], paths: ['src'], deniedPaths: [] }];
    const auth = new ScopedAuthorization({ issuer: p.issuer, audience: p.audience, now: () => now, bindings: () => [binding], grants: () => grants });
    await auth.authorize(p, binding, 'repository.read', ['src/x']);
    await assert.rejects(() => auth.authorize(p, binding, 'integration.write'), { code: 'FORBIDDEN' });
    grants = [];
    await assert.rejects(() => auth.authorize(p, binding, 'repository.read', ['src/x']), { code: 'FORBIDDEN' });
});
