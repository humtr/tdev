import test from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet } from 'jose';
import { mkdtemp, cp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { accessApplicationVerifier } from '../../src/security/access-application.mjs';
import { DeliveryUnavailable } from '../../src/transport/rendezvous.mjs';
import { Dev2Error } from '../../src/contracts/errors.mjs';
import { failure } from '../../src/contracts/envelopes.mjs';
const now = 1700000000000, config = { profile: 'access-application', issuer: 'https://fixture.cloudflareaccess.com', applicationAudience: 'a'.repeat(64), resourceOrigin: 'https://fixture.fixture-account.workers.dev', applicationCapabilities: ['repository.read'] };
async function jwtFixture() { const { privateKey, publicKey } = await generateKeyPair('RS256'), jwk = await exportJWK(publicKey); jwk.kid = 'test'; const keys = createLocalJWKSet({ keys: [jwk] }); const token = async (extra = {}) => new SignJWT({ iss: config.issuer, aud: [config.applicationAudience], sub: 'user', email: 'user@example.invalid', type: 'app', iat: now / 1000, exp: now / 1000 + 60, ...extra }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).sign(privateKey); return { keys, token }; }
test('delivery uncertainty survives the actual closed MCP error encoder', () => {
    for (const delivery of ['not_sent', 'unknown']) {
        const transport = new DeliveryUnavailable(delivery), out = failure(transport);
        assert.equal(out.error.code, 'EXECUTION_UNAVAILABLE');
        assert.equal(out.error.retry.sameRequest, true);
        assert.deepEqual(out.error.facts, { delivery });
        assert.equal(transport.sameRequest, true);
    }
    assert.equal(failure(new Dev2Error('EXECUTION_UNAVAILABLE')).error.retry.sameRequest, false);
    assert.equal(failure(new Error('secret')).error.code, 'INTEGRITY_FAILURE');
    assert.throws(() => new Dev2Error('EXECUTION_UNAVAILABLE', 'Unavailable', { delivery: 'success' }));
    assert.throws(() => new Dev2Error('EXECUTION_UNAVAILABLE', 'Unavailable', { workStatus: 'failed' }));
});
test('missing/malformed application ceiling fails as a bounded configuration error', () => {
    const key = async () => { throw Error('not invoked'); };
    for (const applicationCapabilities of [undefined, null, {}, 'repository.read'])
        assert.throws(() => accessApplicationVerifier({ ...config, applicationCapabilities }, key), { code: 'INVALID_ARGUMENT' });
});
test('Access expiry is rechecked after an asynchronous key lookup', async () => {
    const f = await jwtFixture();
    let time = now;
    const key = async (header, token) => { const result = await f.keys(header, token); time = now + 60000; return result; };
    const verify = accessApplicationVerifier(config, key, () => time);
    await assert.rejects(() => f.token().then(verify), { code: 'UNAUTHORIZED' });
});
test('optional Access not-before is checked as an exact integer when present', async () => {
    const f = await jwtFixture(), verify = accessApplicationVerifier(config, f.keys, () => now);
    await verify(await f.token());
    await verify(await f.token({ nbf: now / 1000 }));
    for (const nbf of [-1, 1.5, now / 1000 + 1, null, '0'])
        await assert.rejects(() => f.token({ nbf }).then(verify), { code: 'UNAUTHORIZED' });
});
test('workflow, deploy, architecture and toolchain input bytes all change the canonical report seal', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dev2-correction-input-'));
    try {
        const source = join(root, 'source');
        await mkdir(source);
        for (const path of ['src/contracts', 'src/runtime', 'src/validation', 'tools', 'config', 'AGENTS.md', 'DIRECTIVE.md', 'RULE.md', 'WORKBOARD.md', 'package.json', 'package-lock.json', 'jsconfig.json', '.node-version', 'docs/ARCHITECTURE.md'])
            await cp(path, join(source, path), { recursive: true });
        let count = 0;
        // Only input hashing is under test; the still-unimplemented release layer
        // must report NOT RUN, rather than executing a deliberately absent suite.
        async function report() { const out = join(root, 'report-' + count++); const r = spawnSync(process.execPath, [join(source, 'tools/validate.mjs'), '--profile', 'release', '--output', out], { encoding: 'utf8', timeout: 5000 }); assert.equal(r.status, 2, r.stderr || r.stdout); return JSON.parse(await readFile(join(out, 'result.json'), 'utf8')).inputDigest; }
        let before = await report();
        for (const path of ['deploy/fixture.json', '.github/workflows/fixture.yml', '.node-version', 'docs/ARCHITECTURE.md']) {
            const target = join(source, path);
            await mkdir(join(target, '..'), { recursive: true });
            await writeFile(target, 'changed fixture bytes\n');
            const after = await report();
            assert.notEqual(after, before, path);
            before = after;
        }
        const r = spawnSync(process.execPath, [join(source, 'tools/validate.mjs'), '--profile', 'integration', '--output', join(source, 'config')], { encoding: 'utf8', timeout: 5000 });
        assert.equal(r.status, 1);
        assert.match(r.stderr, /Output must/);
    }
    finally {
        await rm(root, { recursive: true, force: true });
    }
});
