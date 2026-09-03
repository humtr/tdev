import test from 'node:test';
import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import {
  McpAccessAuthenticator,
  createCloudflareAccessAssertionVerifier,
  createMcpAuthManifest,
} from '../src/index.mjs';
import { canonicalJson } from '../src/canonical.mjs';

function b64(value) {
  return Buffer.from(typeof value === 'string' ? value : canonicalJson(value)).toString('base64url');
}

test('Cloudflare Access RS256 verifier uses strict JWT/JWKS parsing and refreshes an unknown key once', async () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicJwk = publicKey.export({ format: 'jwk' });
  const jwk = { kty: 'RSA', kid: 'key-1', alg: 'RS256', use: 'sig', n: publicJwk.n, e: publicJwk.e };
  const manifest = createMcpAuthManifest({
    mcpResource: 'https://mcp.example.test/mcp',
    authorizationServerIssuer: 'https://auth.example.test',
    accessApplicationAudience: 'audience',
    jwksUri: 'https://auth.example.test/certs',
  });
  const header = b64({ alg: 'RS256', kid: 'key-1', typ: 'JWT' });
  const payload = b64({ iss: manifest.authorizationServerIssuer, aud: manifest.accessApplicationAudience, exp: 1_700_000_600, sub: 'user-a', account_id: 'tenant-a' });
  const input = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(input);
  signer.end();
  const token = `${input}.${signer.sign(privateKey).toString('base64url')}`;
  let fetches = 0;
  const verify = createCloudflareAccessAssertionVerifier({
    fetchImpl: async () => { fetches += 1; return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 }); },
  });
  const auth = new McpAccessAuthenticator({ manifest, now: () => 1_700_000_000, verifyAssertion: verify });
  const request = new Request('https://mcp.example.test/mcp', { headers: { 'cf-access-jwt-assertion': token } });
  const first = await auth.authenticate(request);
  const second = await auth.authenticate(request);
  assert.equal(first.tenantId, 'tenant-a');
  assert.equal(second.principalId, 'user-a');
  assert.equal(fetches, 1);
  const signature = token.split(".").at(-1);
  const tampered = input + "." + ((signature[0] === "A" ? "B" : "A") + signature.slice(1));
  await assert.rejects(() => auth.authenticate(new Request(request.url, { headers: { 'cf-access-jwt-assertion': tampered } })), (error) => error.code === 'mcp_authentication_failed');
});
