import test from 'node:test';
import assert from 'node:assert/strict';
import { validateD0039CloudflareProviderPrincipal } from '../qualification/installable-agent-cloudflare-readback.mjs';

const TOKEN_ID = '11111111111111111111111111111111';

test('Q5 provider principal accepts an active account-owned API token', () => {
  assert.deepEqual(
    validateD0039CloudflareProviderPrincipal({ tokenKind: 'account', verification: { id: TOKEN_ID, status: 'active' } }),
    { tokenKind: 'account', tokenId: TOKEN_ID, tokenStatus: 'active' },
  );
});

test('Q5 provider principal accepts an active user API token', () => {
  assert.deepEqual(
    validateD0039CloudflareProviderPrincipal({ tokenKind: 'user', verification: { id: TOKEN_ID, status: 'active' } }),
    { tokenKind: 'user', tokenId: TOKEN_ID, tokenStatus: 'active' },
  );
});

test('Q5 provider principal rejects inactive or unknown token identities', () => {
  assert.throws(
    () => validateD0039CloudflareProviderPrincipal({ tokenKind: 'user', verification: { id: TOKEN_ID, status: 'disabled' } }),
    (error) => error?.code === 'cloudflare_readback_provider_principal_invalid',
  );
  assert.throws(
    () => validateD0039CloudflareProviderPrincipal({ tokenKind: 'service', verification: { id: TOKEN_ID, status: 'active' } }),
    (error) => error?.code === 'cloudflare_readback_provider_principal_invalid',
  );
});
