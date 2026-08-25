import test from 'node:test';
import assert from 'node:assert/strict';
import { validateD0039R4CloudflareIamObservation } from '../qualification/installable-agent-cloudflare-iam-readback-r4.mjs';

const ACCOUNT_ID = '0123456789abcdef0123456789abcdef';
const PROVIDER_TOKEN_ID = '11111111111111111111111111111111';
const IAM_TOKEN_ID = '22222222222222222222222222222222';

const ACCOUNT_GROUPS = Object.freeze([
  { id: 'scripts-write', name: 'Workers Scripts Write', scopes: ['com.cloudflare.api.account'] },
  { id: 'account-tokens-read', name: 'Account API Tokens Read', scopes: ['com.cloudflare.api.account'] },
]);

const USER_GROUPS = Object.freeze([
  { id: 'scripts-edit', name: 'Workers Scripts Edit', scopes: ['com.cloudflare.api.account'] },
  { id: 'api-tokens-read', name: 'API Tokens Read', scopes: ['com.cloudflare.api.user'] },
]);

function policy(effect, groupId, resources) {
  return { effect, permission_groups: [{ id: groupId }], resources };
}

function token(id, policies) {
  return { id, status: 'active', policies };
}

function accountFixture() {
  return {
    accountId: ACCOUNT_ID,
    providerTokenId: PROVIDER_TOKEN_ID,
    providerTokenKind: 'account',
    iamTokenKind: 'account',
    providerTokenDetails: token(PROVIDER_TOKEN_ID, [
      policy('allow', 'scripts-write', { [`com.cloudflare.api.account.${ACCOUNT_ID}`]: '*' }),
    ]),
    iamTokenVerify: { id: IAM_TOKEN_ID, status: 'active' },
    permissionGroups: ACCOUNT_GROUPS,
    observedReadPermission: 'Account API Tokens Read',
  };
}

test('R4 IAM accepts distinct account tokens with Workers Scripts Write and no Zone Routes permission', () => {
  const observed = validateD0039R4CloudflareIamObservation(accountFixture());
  assert.equal(observed.classification, 'observed');
  assert.equal(observed.ingressKind, 'workers_dev');
  assert.equal(observed.providerPrincipal.tokenId, PROVIDER_TOKEN_ID);
  assert.equal(observed.iamPrincipal.tokenId, IAM_TOKEN_ID);
  assert.equal(observed.observerSeparation, 'distinct_api_token_principals');
  assert.equal(observed.authoritySeparation, 'unverified');
  assert.equal(observed.privateKeyCustody, 'unverified');
  assert.equal(observed.terminalQ5, false);
  assert.equal(observed.secretValues, 'excluded');
});

test('R4 IAM rejects missing effective Workers Scripts Write', () => {
  const value = accountFixture();
  value.providerTokenDetails = token(PROVIDER_TOKEN_ID, [
    policy('allow', 'account-tokens-read', { [`com.cloudflare.api.account.${ACCOUNT_ID}`]: '*' }),
  ]);
  assert.throws(
    () => validateD0039R4CloudflareIamObservation(value),
    (error) => error?.code === 'cloudflare_iam_provider_permission_missing',
  );
});

test('R4 IAM honors explicit deny over an account-wide Scripts allow', () => {
  const value = accountFixture();
  value.providerTokenDetails = token(PROVIDER_TOKEN_ID, [
    policy('allow', 'scripts-write', { [`com.cloudflare.api.account.${ACCOUNT_ID}`]: '*' }),
    policy('deny', 'scripts-write', { [`com.cloudflare.api.account.${ACCOUNT_ID}`]: '*' }),
  ]);
  assert.throws(
    () => validateD0039R4CloudflareIamObservation(value),
    (error) => error?.code === 'cloudflare_iam_provider_permission_missing',
  );
});

test('R4 IAM rejects one token self-attesting provider and IAM observations', () => {
  const value = accountFixture();
  value.iamTokenVerify = { id: PROVIDER_TOKEN_ID, status: 'active' };
  assert.throws(
    () => validateD0039R4CloudflareIamObservation(value),
    (error) => error?.code === 'cloudflare_iam_principal_not_independent',
  );
});

test('R4 IAM supports user-token provider namespace and Edit alias', () => {
  const value = {
    accountId: ACCOUNT_ID,
    providerTokenId: PROVIDER_TOKEN_ID,
    providerTokenKind: 'user',
    iamTokenKind: 'user',
    providerTokenDetails: token(PROVIDER_TOKEN_ID, [
      policy('allow', 'scripts-edit', { [`com.cloudflare.api.account.${ACCOUNT_ID}`]: '*' }),
    ]),
    iamTokenVerify: { id: IAM_TOKEN_ID, status: 'active' },
    permissionGroups: USER_GROUPS,
    observedReadPermission: 'API Tokens Read',
  };
  const observed = validateD0039R4CloudflareIamObservation(value);
  assert.equal(observed.providerPrincipal.tokenKind, 'user');
  assert.equal(observed.iamPrincipal.observedReadPermission, 'API Tokens Read');
});

test('R4 IAM rejects token-read namespace mismatch', () => {
  const value = accountFixture();
  value.observedReadPermission = 'API Tokens Read';
  assert.throws(
    () => validateD0039R4CloudflareIamObservation(value),
    (error) => error?.code === 'cloudflare_iam_observer_permission_missing',
  );
});
