import test from 'node:test';
import assert from 'node:assert/strict';
import { validateD0039CloudflareIamObservation } from '../qualification/installable-agent-cloudflare-iam-readback.mjs';
import { validateD0039CloudflareProviderPrincipal } from '../qualification/installable-agent-cloudflare-readback.mjs';

const ACCOUNT_ID = '0123456789abcdef0123456789abcdef';
const ZONE_ID = 'fedcba9876543210fedcba9876543210';
const PROVIDER_TOKEN_ID = '11111111111111111111111111111111';
const IAM_TOKEN_ID = '22222222222222222222222222222222';

const ACCOUNT_GROUPS = Object.freeze([
  { id: 'scripts-write', name: 'Workers Scripts Write', scopes: ['com.cloudflare.api.account'] },
  { id: 'routes-write', name: 'Workers Routes Write', scopes: ['com.cloudflare.api.account.zone'] },
  { id: 'account-tokens-read', name: 'Account API Tokens Read', scopes: ['com.cloudflare.api.account'] },
]);

const USER_GROUPS = Object.freeze([
  { id: 'scripts-edit', name: 'Workers Scripts Edit', scopes: ['com.cloudflare.api.account'] },
  { id: 'routes-edit', name: 'Workers Routes Edit', scopes: ['com.cloudflare.api.account.zone'] },
  { id: 'api-tokens-read', name: 'API Tokens Read', scopes: ['com.cloudflare.api.user'] },
]);

function policy(effect, groupId, resources, groups) {
  return {
    id: `${effect}-${groupId}`,
    effect,
    permission_groups: [{ id: groupId, name: groups.find((group) => group.id === groupId)?.name ?? groupId }],
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

function accountFixture() {
  return {
    accountId: ACCOUNT_ID,
    zoneId: ZONE_ID,
    providerTokenId: PROVIDER_TOKEN_ID,
    providerTokenKind: 'account',
    iamTokenKind: 'account',
    providerTokenDetails: token(PROVIDER_TOKEN_ID, [
      policy('allow', 'scripts-write', { [`com.cloudflare.api.account.${ACCOUNT_ID}`]: '*' }, ACCOUNT_GROUPS),
      policy('allow', 'routes-write', { [`com.cloudflare.api.account.${ACCOUNT_ID}`]: { 'com.cloudflare.api.account.zone.*': '*' } }, ACCOUNT_GROUPS),
    ], 'tdev-d0039-provider'),
    iamTokenVerify: { id: IAM_TOKEN_ID, status: 'active' },
    permissionGroups: ACCOUNT_GROUPS,
    observedReadPermission: 'Account API Tokens Read',
  };
}

function userFixture() {
  return {
    accountId: ACCOUNT_ID,
    zoneId: ZONE_ID,
    providerTokenId: PROVIDER_TOKEN_ID,
    providerTokenKind: 'user',
    iamTokenKind: 'user',
    providerTokenDetails: token(PROVIDER_TOKEN_ID, [
      policy('allow', 'scripts-edit', { [`com.cloudflare.api.account.${ACCOUNT_ID}`]: '*' }, USER_GROUPS),
      policy('allow', 'routes-edit', { [`com.cloudflare.api.account.zone.${ZONE_ID}`]: '*' }, USER_GROUPS),
    ], 'tdev-d0039-provider-user'),
    iamTokenVerify: { id: IAM_TOKEN_ID, status: 'active' },
    permissionGroups: USER_GROUPS,
    observedReadPermission: 'API Tokens Read',
  };
}

test('Q5 IAM readback accepts account token provider with All zones in one account resource encoding', () => {
  const observed = validateD0039CloudflareIamObservation(accountFixture());
  assert.equal(observed.classification, 'observed');
  assert.equal(observed.proofLayer, 'live_iam_control_plane_partial');
  assert.equal(observed.providerPrincipal.tokenKind, 'account');
  assert.equal(observed.iamPrincipal.tokenKind, 'account');
  assert.equal(observed.providerPrincipal.tokenId, PROVIDER_TOKEN_ID);
  assert.equal(observed.iamPrincipal.tokenId, IAM_TOKEN_ID);
  assert.match(observed.observationDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(observed.observerSeparation, 'distinct_api_token_principals');
  assert.equal(observed.authoritySeparation, 'unverified');
  assert.equal(observed.privateKeyCustody, 'unverified');
  assert.equal(observed.terminalQ5, false);
  assert.equal(observed.secretValues, 'excluded');
});

test('Q5 IAM readback supports user token providers and Cloudflare Edit permission aliases', () => {
  const observed = validateD0039CloudflareIamObservation(userFixture());
  assert.equal(observed.providerPrincipal.tokenKind, 'user');
  assert.equal(observed.iamPrincipal.observedReadPermission, 'API Tokens Read');
  assert.equal(observed.observerSeparation, 'distinct_api_token_principals');
});

test('Q5 IAM readback permits a user-token IAM observer to inspect an account-owned provider principal', () => {
  const value = accountFixture();
  value.iamTokenKind = 'user';
  const observed = validateD0039CloudflareIamObservation(value);
  assert.equal(observed.providerPrincipal.tokenKind, 'account');
  assert.equal(observed.iamPrincipal.tokenKind, 'user');
  assert.equal(observed.iamPrincipal.observedReadPermission, 'Account API Tokens Read');
});

test('Q5 IAM readback rejects one token self-attesting both provider and IAM observations', () => {
  const value = accountFixture();
  value.iamTokenVerify = { id: PROVIDER_TOKEN_ID, status: 'active' };
  assert.throws(
    () => validateD0039CloudflareIamObservation(value),
    (error) => error?.code === 'cloudflare_iam_principal_not_independent',
  );
});

test('Q5 IAM readback rejects provider principals without target-zone route deployment permission', () => {
  const value = accountFixture();
  value.providerTokenDetails = token(PROVIDER_TOKEN_ID, [
    policy('allow', 'scripts-write', { [`com.cloudflare.api.account.${ACCOUNT_ID}`]: '*' }, ACCOUNT_GROUPS),
  ], 'tdev-d0039-provider');
  assert.throws(
    () => validateD0039CloudflareIamObservation(value),
    (error) => error?.code === 'cloudflare_iam_provider_permission_missing',
  );
});

test('Q5 IAM readback honors explicit deny over allow for the observed target resource', () => {
  const value = accountFixture();
  value.providerTokenDetails = token(PROVIDER_TOKEN_ID, [
    policy('allow', 'scripts-write', { [`com.cloudflare.api.account.${ACCOUNT_ID}`]: '*' }, ACCOUNT_GROUPS),
    policy('allow', 'routes-write', { 'com.cloudflare.api.account.zone.*': '*' }, ACCOUNT_GROUPS),
    policy('deny', 'routes-write', { [`com.cloudflare.api.account.zone.${ZONE_ID}`]: '*' }, ACCOUNT_GROUPS),
  ], 'tdev-d0039-provider');
  assert.throws(
    () => validateD0039CloudflareIamObservation(value),
    (error) => error?.code === 'cloudflare_iam_provider_permission_missing',
  );
});

test('Q5 IAM readback rejects a permission name with the wrong Cloudflare resource scope', () => {
  const value = accountFixture();
  value.permissionGroups = ACCOUNT_GROUPS.map((group) => group.id === 'routes-write'
    ? { ...group, scopes: ['com.cloudflare.api.account'] }
    : group);
  assert.throws(
    () => validateD0039CloudflareIamObservation(value),
    (error) => error?.code === 'cloudflare_iam_permission_catalog_invalid',
  );
});

test('Q5 IAM readback rejects namespace-mismatched IAM read authority', () => {
  const value = userFixture();
  value.observedReadPermission = 'Account API Tokens Read';
  assert.throws(
    () => validateD0039CloudflareIamObservation(value),
    (error) => error?.code === 'cloudflare_iam_observer_permission_missing',
  );
});

test('Q5 IAM readback rejects provider detail substitution', () => {
  const value = accountFixture();
  value.providerTokenDetails = { ...value.providerTokenDetails, id: '33333333333333333333333333333333' };
  assert.throws(
    () => validateD0039CloudflareIamObservation(value),
    (error) => error?.code === 'cloudflare_iam_token_identity_mismatch',
  );
});

test('Q5 provider principal accepts an active account-owned API token', () => {
  assert.deepEqual(
    validateD0039CloudflareProviderPrincipal({ tokenKind: 'account', verification: { id: PROVIDER_TOKEN_ID, status: 'active' } }),
    { tokenKind: 'account', tokenId: PROVIDER_TOKEN_ID, tokenStatus: 'active' },
  );
});

test('Q5 provider principal accepts an active user API token', () => {
  assert.deepEqual(
    validateD0039CloudflareProviderPrincipal({ tokenKind: 'user', verification: { id: PROVIDER_TOKEN_ID, status: 'active' } }),
    { tokenKind: 'user', tokenId: PROVIDER_TOKEN_ID, tokenStatus: 'active' },
  );
});

test('Q5 provider principal rejects inactive or unknown token identities', () => {
  assert.throws(
    () => validateD0039CloudflareProviderPrincipal({ tokenKind: 'user', verification: { id: PROVIDER_TOKEN_ID, status: 'disabled' } }),
    (error) => error?.code === 'cloudflare_readback_provider_principal_invalid',
  );
  assert.throws(
    () => validateD0039CloudflareProviderPrincipal({ tokenKind: 'service', verification: { id: PROVIDER_TOKEN_ID, status: 'active' } }),
    (error) => error?.code === 'cloudflare_readback_provider_principal_invalid',
  );
});
