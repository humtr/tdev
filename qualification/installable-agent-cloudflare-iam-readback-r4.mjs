#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, strictJsonParse, typedDigest } from '../src/canonical.mjs';

const API_ROOT = 'https://api.cloudflare.com/client/v4';
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const TOKEN_KINDS = Object.freeze(new Set(['account', 'user']));
const TOKEN_PRINCIPAL_PROFILE = 'tdev.cloudflare-api-token-principal.v1';
const TOKEN_POLICY_OBSERVATION_PROFILE = 'tdev.cloudflare-api-token-policy-observation.v2';

const PERMISSIONS = Object.freeze({
  providerScriptsWrite: Object.freeze({ aliases: Object.freeze(['Workers Scripts Write', 'Workers Scripts Edit']), scope: 'com.cloudflare.api.account' }),
  accountTokensRead: Object.freeze({ aliases: Object.freeze(['Account API Tokens Read']), scope: 'com.cloudflare.api.account' }),
  userTokensRead: Object.freeze({ aliases: Object.freeze(['API Tokens Read']), scope: 'com.cloudflare.api.user' }),
});

function fail(code, message, details = undefined, options = undefined) {
  const error = new Error(message, options);
  error.code = code;
  error.details = details ?? {};
  throw error;
}

function boundedString(value, label, max = 2048) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || value.includes('\0')) fail('cloudflare_iam_readback_invalid', `${label} is invalid`);
  return value;
}

function normalizeTokenKind(value, label) {
  if (!TOKEN_KINDS.has(value)) fail('cloudflare_iam_readback_usage', `${label} must be account or user`);
  return value;
}

function compareText(left, right) { return left < right ? -1 : left > right ? 1 : 0; }

function parseArgs(argv) {
  const allowed = new Set(['--account-id', '--provider-token-id', '--provider-token-kind', '--iam-token-kind']);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(flag) || value === undefined || values.has(flag)) fail('cloudflare_iam_readback_usage', 'R4 Q5 IAM readback arguments are missing, duplicated, or unknown');
    values.set(flag, value);
  }
  if ([...allowed].some((flag) => !values.has(flag))) fail('cloudflare_iam_readback_usage', 'all R4 Q5 IAM readback arguments are required');
  return {
    accountId: boundedString(values.get('--account-id'), 'account id', 128),
    providerTokenId: boundedString(values.get('--provider-token-id'), 'provider token id', 128),
    providerTokenKind: normalizeTokenKind(values.get('--provider-token-kind'), 'provider token kind'),
    iamTokenKind: normalizeTokenKind(values.get('--iam-token-kind'), 'IAM token kind'),
  };
}

async function boundedJson(response, label) {
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^[0-9]+$/.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) fail('cloudflare_iam_readback_response_too_large', `${label} response exceeds its byte bound`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_RESPONSE_BYTES) fail('cloudflare_iam_readback_response_too_large', `${label} response exceeds its byte bound`);
  try { return strictJsonParse(bytes, { maxBytes: MAX_RESPONSE_BYTES }); }
  catch (cause) { fail('cloudflare_iam_readback_response_invalid', `${label} returned invalid bounded JSON`, {}, { cause }); }
}

async function cloudflareGet(apiToken, pathname, label) {
  const response = await fetch(`${API_ROOT}${pathname}`, { headers: { authorization: `Bearer ${apiToken}` }, redirect: 'error' });
  const body = await boundedJson(response, label);
  if (!response.ok || body?.success !== true) fail('cloudflare_iam_readback_api_failed', `${label} failed with HTTP ${response.status}`, { status: response.status });
  return body.result;
}

function namespaceFor(kind, accountId) {
  if (kind === 'account') {
    const account = encodeURIComponent(accountId);
    return Object.freeze({
      verifyPath: `/accounts/${account}/tokens/verify`,
      tokenPath: (id) => `/accounts/${account}/tokens/${encodeURIComponent(id)}`,
      permissionGroupsPath: `/accounts/${account}/tokens/permission_groups`,
      readPermission: PERMISSIONS.accountTokensRead,
      namespace: 'account_api_tokens',
    });
  }
  return Object.freeze({
    verifyPath: '/user/tokens/verify',
    tokenPath: (id) => `/user/tokens/${encodeURIComponent(id)}`,
    permissionGroupsPath: '/user/tokens/permission_groups',
    readPermission: PERMISSIONS.userTokensRead,
    namespace: 'user_api_tokens',
  });
}

function normalizePermissionGroups(groups) {
  if (!Array.isArray(groups) || groups.length === 0) fail('cloudflare_iam_permission_catalog_invalid', 'permission-group catalog is unavailable');
  return groups.map((group, index) => {
    if (!group || typeof group !== 'object' || Array.isArray(group) || !Array.isArray(group.scopes) || group.scopes.length === 0) fail('cloudflare_iam_permission_catalog_invalid', `permission group ${index} is invalid`);
    return Object.freeze({
      id: boundedString(group.id, `permission group ${index} id`, 128),
      name: boundedString(group.name, `permission group ${index} name`, 256),
      scopes: Object.freeze(group.scopes.map((scope) => boundedString(scope, `permission group ${index} scope`, 256)).sort(compareText)),
    });
  });
}

function permissionIds(groups, permission) {
  const ids = groups.filter((group) => permission.aliases.includes(group.name) && group.scopes.includes(permission.scope)).map((group) => group.id);
  if (ids.length === 0) fail('cloudflare_iam_permission_catalog_invalid', `permission catalog does not expose ${permission.aliases[0]}`);
  return new Set(ids);
}

function normalizeResources(resources, label) {
  if (!resources || typeof resources !== 'object' || Array.isArray(resources) || Object.keys(resources).length === 0) fail('cloudflare_iam_policy_invalid', `${label} resources are invalid`);
  const out = {};
  for (const key of Object.keys(resources).sort(compareText)) {
    const value = resources[key];
    if (value === '*') out[key] = '*';
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = {};
      for (const nestedKey of Object.keys(value).sort(compareText)) {
        if (value[nestedKey] !== '*') fail('cloudflare_iam_policy_invalid', `${label} nested resource is invalid`);
        nested[nestedKey] = '*';
      }
      out[key] = Object.freeze(nested);
    } else fail('cloudflare_iam_policy_invalid', `${label} resource is invalid`);
  }
  return Object.freeze(out);
}

function normalizeToken(value, expectedId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('cloudflare_iam_token_invalid', 'provider token details are invalid');
  const id = boundedString(value.id, 'provider token id', 128);
  if (id !== expectedId) fail('cloudflare_iam_token_identity_mismatch', 'provider token identity changed during readback');
  if (value.status !== 'active') fail('cloudflare_iam_token_inactive', 'provider token is not active');
  if (!Array.isArray(value.policies) || value.policies.length === 0) fail('cloudflare_iam_policy_invalid', 'provider token has no observable policies');
  const policies = value.policies.map((policy, index) => {
    if (!policy || typeof policy !== 'object' || Array.isArray(policy) || !['allow', 'deny'].includes(policy.effect) || !Array.isArray(policy.permission_groups)) fail('cloudflare_iam_policy_invalid', `provider policy ${index} is invalid`);
    return Object.freeze({
      effect: policy.effect,
      permissionGroupIds: Object.freeze(policy.permission_groups.map((group) => boundedString(group?.id, `provider policy ${index} permission id`, 128)).sort(compareText)),
      resources: normalizeResources(policy.resources, `provider policy ${index}`),
    });
  });
  return Object.freeze({ id, status: value.status, policies });
}

function accountResourceMatches(resources, accountId) {
  return resources[`com.cloudflare.api.account.${accountId}`] === '*' || resources['com.cloudflare.api.account.*'] === '*';
}

function tokenAllowsAccountPermission(token, permissionIdSet, accountId) {
  const matching = token.policies.filter((policy) => policy.permissionGroupIds.some((id) => permissionIdSet.has(id)) && accountResourceMatches(policy.resources, accountId));
  if (matching.some((policy) => policy.effect === 'deny')) return false;
  return matching.some((policy) => policy.effect === 'allow');
}

export function validateD0039R4CloudflareIamObservation({ accountId, providerTokenId, providerTokenKind, iamTokenKind, providerTokenDetails, iamTokenVerify, permissionGroups, observedReadPermission }) {
  boundedString(accountId, 'account id', 128);
  boundedString(providerTokenId, 'provider token id', 128);
  normalizeTokenKind(providerTokenKind, 'provider token kind');
  normalizeTokenKind(iamTokenKind, 'IAM token kind');
  if (!iamTokenVerify || typeof iamTokenVerify !== 'object' || Array.isArray(iamTokenVerify)) fail('cloudflare_iam_token_invalid', 'IAM token verification is invalid');
  const iamTokenId = boundedString(iamTokenVerify.id, 'IAM token id', 128);
  if (iamTokenVerify.status !== 'active') fail('cloudflare_iam_token_inactive', 'IAM token is not active');
  const provider = normalizeToken(providerTokenDetails, providerTokenId);
  if (providerTokenKind === iamTokenKind && provider.id === iamTokenId) fail('cloudflare_iam_principal_not_independent', 'provider and IAM observations must use distinct API token principals');
  const groups = normalizePermissionGroups(permissionGroups);
  const scriptsWriteIds = permissionIds(groups, PERMISSIONS.providerScriptsWrite);
  const expectedReadPermission = providerTokenKind === 'account' ? PERMISSIONS.accountTokensRead : PERMISSIONS.userTokensRead;
  permissionIds(groups, expectedReadPermission);
  if (observedReadPermission !== expectedReadPermission.aliases[0]) fail('cloudflare_iam_observer_permission_missing', 'IAM observer read authority does not match the provider token namespace');
  if (!tokenAllowsAccountPermission(provider, scriptsWriteIds, accountId)) fail('cloudflare_iam_provider_permission_missing', 'provider principal lacks effective Workers Scripts write permission on the target account');

  const policies = provider.policies.map((policy) => ({ effect: policy.effect, permissionGroupIds: policy.permissionGroupIds, resources: policy.resources }));
  const providerPolicyDigest = typedDigest(TOKEN_POLICY_OBSERVATION_PROFILE, { accountId, tokenId: provider.id, tokenKind: providerTokenKind, tokenStatus: provider.status, policies });
  const providerPrincipal = Object.freeze({ profile: TOKEN_PRINCIPAL_PROFILE, accountId, tokenKind: providerTokenKind, tokenId: provider.id, tokenStatus: provider.status, policyDigest: providerPolicyDigest, policies: Object.freeze(policies) });
  const iamPrincipal = Object.freeze({ profile: TOKEN_PRINCIPAL_PROFILE, tokenKind: iamTokenKind, tokenId: iamTokenId, tokenStatus: 'active', observedReadPermission, observedNamespace: providerTokenKind === 'account' ? 'account_api_tokens' : 'user_api_tokens' });
  const iamPrincipalDigest = typedDigest('tdev.cloudflare-iam-observer-principal.v1', iamPrincipal);
  return Object.freeze({
    classification: 'observed',
    gate: 'q5_live_provider_iam',
    proofLayer: 'live_iam_control_plane_partial',
    ingressKind: 'workers_dev',
    observerSeparation: 'distinct_api_token_principals',
    authoritySeparation: 'unverified',
    privateKeyCustody: 'unverified',
    terminalQ5: false,
    accountId,
    providerPrincipal,
    iamPrincipal,
    iamPrincipalDigest,
    observationDigest: typedDigest('tdev.cloudflare-q5-iam-observation.v2', { accountId, providerPrincipalDigest: providerPolicyDigest, iamPrincipalDigest, observedReadPermission }),
    secretValues: 'excluded',
  });
}

export async function readD0039R4CloudflareIamObservation({ accountId, providerTokenId, providerTokenKind, iamTokenKind, iamApiToken }) {
  boundedString(accountId, 'account id', 128);
  boundedString(providerTokenId, 'provider token id', 128);
  normalizeTokenKind(providerTokenKind, 'provider token kind');
  normalizeTokenKind(iamTokenKind, 'IAM token kind');
  if (typeof iamApiToken !== 'string' || iamApiToken.length < 20 || iamApiToken.includes('\0')) fail('cloudflare_iam_readback_credentials_unavailable', 'independent IAM Cloudflare API token must be supplied out of band');
  const providerNamespace = namespaceFor(providerTokenKind, accountId);
  const iamNamespace = namespaceFor(iamTokenKind, accountId);
  const iamVerify = await cloudflareGet(iamApiToken, iamNamespace.verifyPath, 'IAM token verification');
  const [providerDetails, permissionGroups] = await Promise.all([
    cloudflareGet(iamApiToken, providerNamespace.tokenPath(providerTokenId), 'provider token policy readback'),
    cloudflareGet(iamApiToken, providerNamespace.permissionGroupsPath, 'provider token permission-group catalog'),
  ]);
  return validateD0039R4CloudflareIamObservation({ accountId, providerTokenId, providerTokenKind, iamTokenKind, providerTokenDetails: providerDetails, iamTokenVerify: iamVerify, permissionGroups, observedReadPermission: providerNamespace.readPermission.aliases[0] });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const observed = await readD0039R4CloudflareIamObservation({ ...options, iamApiToken: process.env.CLOUDFLARE_IAM_API_TOKEN });
  process.stdout.write(`${canonicalJson(observed)}\n`);
}

const direct = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  try { await main(); }
  catch (error) {
    process.stderr.write(`${JSON.stringify({ error: error?.code ?? 'cloudflare_iam_readback_failed', message: error?.message ?? 'R4 Q5 Cloudflare IAM readback failed', details: error?.details ?? {} })}\n`);
    process.exitCode = 1;
  }
}
