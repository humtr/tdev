import test from 'node:test';
import assert from 'node:assert/strict';
import { validateD0039CloudflareIamSeparation } from '../qualification/installable-agent-cloudflare-iam-readback.mjs';

const ACCOUNT_ID = '0123456789abcdef0123456789abcdef';
const ZONE_ID = 'fedcba9876543210fedcba9876543210';
const PROVIDER_TOKEN_ID = '11111111111111111111111111111111';
const IAM_TOKEN_ID = '22222222222222222222222222222222';

const GROUPS = Object.freeze([
  { id: 'scripts-write', name: 'Workers Scripts Write', scopes: ['com.cloudflare.api.account'] },
  { id: 'routes-write', name: 'Workers Routes Write', scopes: ['com.cloudflare.api.account.zone'] },
  { id: 'account-tokens-read', name: 'Account API Tokens Read', scopes: ['com.cloudflare.api.account'] },
]);

function policy(effect, groupId, resources) {
  return {
    id: `${effect}-${groupId}`,
    effect,
    permission_groups: [{ id: groupId, name: GROUPS.find((group) => group.id === groupId)?.name ?? groupId }],
    resources,
  };
}

function token(id, policies, name) {
  return {
    id,
    status: 'active',
    name,
    issued_on: '2026-08-25T00:00:00Z',
    modified_on: '2026-08-25T00:00:00Z',
    policies,
  };
}

function fixture() {
  const providerTokenDetails = token(PROVIDER_TOKEN_ID, [
    policy('allow', 'scripts-write', { [`com.cloudflare.api.account.${ACCOUNT_ID}`]: '*' }),
    policy('allow', 'routes-write', { [`com.cloudflare.api.account.zone.${ZONE_ID}`]: '*' }),
  ], 'tdev-d0039-provider');
  const iamTokenDetails = token(IAM_TOKEN_ID, [
    policy('allow', 'account-tokens-read', { [`com.cloudflare.api.account.${ACCOUNT_ID}`]: '*' }),
  ], 'tdev-d0039-iam-observer');
  return {
    accountId: ACCOUNT_ID,
    zoneId: ZONE_ID,
    providerTokenVerify: { id: PROVIDER_TOKEN_ID, status: 'active' },
    iamTokenVerify: { id: IAM_TOKEN_ID, status: 'active' },
    providerTokenDetails,
    iamTokenDetails,
    permissionGroups: GROUPS,
  };
}

test('Q5 IAM readback proves distinct provider and IAM account-token principals with effective target permissions', () => {
  const observed = validateD0039CloudflareIamSeparation(fixture());
  assert.equal(observed.classification, 'observed');
  assert.equal(observed.proofLayer, 'live_iam_control_plane');
  assert.equal(observed.separation, 'distinct_account_api_token_principals');
  assert.equal(observed.providerPrincipal.tokenId, PROVIDER_TOKEN_ID);
  assert.equal(observed.iamPrincipal.tokenId, IAM_TOKEN_ID);
  assert.match(observed.observationDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(observed.secretValues, 'excluded');
});

test('Q5 IAM readback rejects one token self-attesting both provider and IAM observations', () => {
  const value = fixture();
  value.iamTokenVerify = { id: PROVIDER_TOKEN_ID, status: 'active' };
  value.iamTokenDetails = { ...value.iamTokenDetails, id: PROVIDER_TOKEN_ID };
  assert.throws(
    () => validateD0039CloudflareIamSeparation(value),
    (error) => error?.code === 'cloudflare_iam_principal_not_independent',
  );
});

test('Q5 IAM readback rejects provider principals without target-zone route deployment permission', () => {
  const value = fixture();
  value.providerTokenDetails = token(PROVIDER_TOKEN_ID, [
    policy('allow', 'scripts-write', { [`com.cloudflare.api.account.${ACCOUNT_ID}`]: '*' }),
  ], 'tdev-d0039-provider');
  assert.throws(
    () => validateD0039CloudflareIamSeparation(value),
    (error) => error?.code === 'cloudflare_iam_provider_permission_missing',
  );
});

test('Q5 IAM readback honors explicit deny over allow for the observed target resource', () => {
  const value = fixture();
  value.providerTokenDetails = token(PROVIDER_TOKEN_ID, [
    policy('allow', 'scripts-write', { [`com.cloudflare.api.account.${ACCOUNT_ID}`]: '*' }),
    policy('allow', 'routes-write', { 'com.cloudflare.api.account.zone.*': '*' }),
    policy('deny', 'routes-write', { [`com.cloudflare.api.account.zone.${ZONE_ID}`]: '*' }),
  ], 'tdev-d0039-provider');
  assert.throws(
    () => validateD0039CloudflareIamSeparation(value),
    (error) => error?.code === 'cloudflare_iam_provider_permission_missing',
  );
});

test('Q5 IAM readback rejects IAM observers that cannot independently inspect account-token policy', () => {
  const value = fixture();
  value.iamTokenDetails = token(IAM_TOKEN_ID, [
    policy('allow', 'scripts-write', { [`com.cloudflare.api.account.${ACCOUNT_ID}`]: '*' }),
  ], 'tdev-d0039-iam-observer');
  assert.throws(
    () => validateD0039CloudflareIamSeparation(value),
    (error) => error?.code === 'cloudflare_iam_observer_permission_missing',
  );
});
