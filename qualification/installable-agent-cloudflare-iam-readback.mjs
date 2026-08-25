#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, strictJsonParse, typedDigest } from '../src/canonical.mjs';

const API_ROOT = 'https://api.cloudflare.com/client/v4';
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const TOKEN_PRINCIPAL_PROFILE = 'tdev.cloudflare-api-token-principal.v1';
const TOKEN_POLICY_OBSERVATION_PROFILE = 'tdev.cloudflare-api-token-policy-observation.v1';
const TOKEN_KINDS = Object.freeze(new Set(['account', 'user']));

const PERMISSIONS = Object.freeze({
  providerScriptsWrite: Object.freeze({
    aliases: Object.freeze(['Workers Scripts Write', 'Workers Scripts Edit']),
    scope: 'com.cloudflare.api.account',
    label: 'Workers Scripts write permission',
  }),
  providerRoutesWrite: Object.freeze({
    aliases: Object.freeze(['Workers Routes Write', 'Workers Routes Edit']),
    scope: 'com.cloudflare.api.account.zone',
    label: 'Workers Routes write permission',
  }),
  accountTokensRead: Object.freeze({
    aliases: Object.freeze(['Account API Tokens Read']),
    scope: 'com.cloudflare.api.account',
    label: 'Account API Tokens Read permission',
  }),
  userTokensRead: Object.freeze({
    aliases: Object.freeze(['API Tokens Read']),
    scope: 'com.cloudflare.api.user',
    label: 'API Tokens Read permission',
  }),
});

function fail(code, message, details = undefined, options = undefined) {
  const error = new Error(message, options);
  error.code = code;
  error.details = details ?? {};
  throw error;
}

function boundedString(value, label, max = 2048) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || value.includes('\0')) {
    fail('cloudflare_iam_readback_invalid', `${label} is invalid`);
  }
  return value;
}

function optionalBoundedString(value, label, max = 2048) {
  if (value === null || value === undefined) return null;
  return boundedString(value, label, max);
}

function normalizeTokenKind(value, label = 'token kind') {
  if (!TOKEN_KINDS.has(value)) fail('cloudflare_iam_readback_usage', `${label} must be account or user`);
  return value;
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseArgs(argv) {
  const allowed = new Set(['--account-id', '--zone-id', '--provider-token-id', '--provider-token-kind', '--iam-token-kind']);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(flag) || value === undefined || values.has(flag)) {
      fail('cloudflare_iam_readback_usage', 'Q5 IAM readback arguments are missing, duplicated, or unknown');
    }
    values.set(flag, value);
  }
  if ([...allowed].some((flag) => !values.has(flag))) {
    fail('cloudflare_iam_readback_usage', 'all Q5 IAM readback arguments are required');
  }
  return {
    accountId: boundedString(values.get('--account-id'), 'account id', 128),
    zoneId: boundedString(values.get('--zone-id'), 'zone id', 128),
    providerTokenId: boundedString(values.get('--provider-token-id'), 'provider token id', 128),
    providerTokenKind: normalizeTokenKind(values.get('--provider-token-kind'), 'provider token kind'),
    iamTokenKind: normalizeTokenKind(values.get('--iam-token-kind'), 'IAM token kind'),
  };
}

async function boundedJson(response, label) {
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^[0-9]+$/.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) {
    fail('cloudflare_iam_readback_response_too_large', `${label} response exceeds its byte bound`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_RESPONSE_BYTES) {
    fail('cloudflare_iam_readback_response_too_large', `${label} response exceeds its byte bound`);
  }
  try { return strictJsonParse(bytes, { maxBytes: MAX_RESPONSE_BYTES }); }
  catch (cause) { fail('cloudflare_iam_readback_response_invalid', `${label} returned invalid bounded JSON`, {}, { cause }); }
}

async function cloudflareGet(apiToken, pathname, label) {
  const response = await fetch(`${API_ROOT}${pathname}`, {
    headers: { authorization: `Bearer ${apiToken}` },
    redirect: 'error',
  });
  const body = await boundedJson(response, label);
  if (!response.ok || body?.success !== true) {
    fail('cloudflare_iam_readback_api_failed', `${label} failed with HTTP ${response.status}`, { status: response.status });
  }
  return body.result;
}

function permissionNamespace(kind, accountId) {
  if (kind === 'account') {
    const account = encodeURIComponent(accountId);
    return Object.freeze({
      verifyPath: `/accounts/${account}/tokens/verify`,
      tokenPath: (tokenId) => `/accounts/${account}/tokens/${encodeURIComponent(tokenId)}`,
      permissionGroupsPath: `/accounts/${account}/tokens/permission_groups`,
      readPermission: PERMISSIONS.accountTokensRead,
      namespace: 'account_api_tokens',
    });
  }
  return Object.freeze({
    verifyPath: '/user/tokens/verify',
    tokenPath: (tokenId) => `/user/tokens/${encodeURIComponent(tokenId)}`,
    permissionGroupsPath: '/user/tokens/permission_groups',
    readPermission: PERMISSIONS.userTokensRead,
    namespace: 'user_api_tokens',
  });
}

function normalizePermissionGroups(groups) {
  if (!Array.isArray(groups) || groups.length === 0) {
    fail('cloudflare_iam_permission_catalog_invalid', 'Cloudflare permission-group catalog is unavailable');
  }
  return groups.map((group, index) => {
    if (group === null || typeof group !== 'object' || Array.isArray(group)) {
      fail('cloudflare_iam_permission_catalog_invalid', `permission group ${index} is invalid`);
    }
    if (!Array.isArray(group.scopes) || group.scopes.length === 0) {
      fail('cloudflare_iam_permission_catalog_invalid', `permission group ${index} scopes are invalid`);
    }
    const scopes = group.scopes.map((scope, scopeIndex) => boundedString(scope, `permission group ${index} scope ${scopeIndex}`, 256)).sort(compareText);
    if (new Set(scopes).size !== scopes.length) {
      fail('cloudflare_iam_permission_catalog_invalid', `permission group ${index} scopes are duplicated`);
    }
    return Object.freeze({
      id: boundedString(group.id, `permission group ${index} id`, 128),
      name: boundedString(group.name, `permission group ${index} name`, 256),
      scopes: Object.freeze(scopes),
    });
  });
}

function permissionIds(groups, permission) {
  const ids = groups
    .filter((group) => permission.aliases.includes(group.name) && group.scopes.includes(permission.scope))
    .map((group) => group.id);
  if (ids.length === 0) {
    fail('cloudflare_iam_permission_catalog_invalid', `Cloudflare permission catalog does not expose ${permission.label} with scope ${permission.scope}`);
  }
  return new Set(ids);
}

function normalizeResources(resources, label) {
  if (resources === null || typeof resources !== 'object' || Array.isArray(resources)) {
    fail('cloudflare_iam_policy_invalid', `${label} resources are invalid`);
  }
  const normalized = {};
  const keys = Object.keys(resources).sort(compareText);
  if (keys.length === 0) fail('cloudflare_iam_policy_invalid', `${label} resources are empty`);
  for (const key of keys) {
    boundedString(key, `${label} resource key`, 512);
    const value = resources[key];
    if (value === '*') {
      normalized[key] = '*';
      continue;
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      fail('cloudflare_iam_policy_invalid', `${label} resource ${key} is invalid`);
    }
    const nested = {};
    const nestedKeys = Object.keys(value).sort(compareText);
    if (nestedKeys.length === 0) fail('cloudflare_iam_policy_invalid', `${label} nested resource ${key} is empty`);
    for (const nestedKey of nestedKeys) {
      boundedString(nestedKey, `${label} nested resource key`, 512);
      if (value[nestedKey] !== '*') fail('cloudflare_iam_policy_invalid', `${label} nested resource ${nestedKey} is invalid`);
      nested[nestedKey] = '*';
    }
    normalized[key] = Object.freeze(nested);
  }
  return Object.freeze(normalized);
}

function normalizePolicy(policy, label) {
  if (policy === null || typeof policy !== 'object' || Array.isArray(policy)) {
    fail('cloudflare_iam_policy_invalid', `${label} policy is invalid`);
  }
  if (policy.effect !== 'allow' && policy.effect !== 'deny') {
    fail('cloudflare_iam_policy_invalid', `${label} policy effect is invalid`);
  }
  if (!Array.isArray(policy.permission_groups) || policy.permission_groups.length === 0) {
    fail('cloudflare_iam_policy_invalid', `${label} policy permission groups are invalid`);
  }
  const permissionGroups = policy.permission_groups.map((group, index) => {
    if (group === null || typeof group !== 'object' || Array.isArray(group)) {
      fail('cloudflare_iam_policy_invalid', `${label} permission group ${index} is invalid`);
    }
    return Object.freeze({
      id: boundedString(group.id, `${label} permission group ${index} id`, 128),
      name: optionalBoundedString(group.name, `${label} permission group ${index} name`, 256),
    });
  }).sort((left, right) => compareText(left.id, right.id));
  if (new Set(permissionGroups.map((group) => group.id)).size !== permissionGroups.length) {
    fail('cloudflare_iam_policy_invalid', `${label} permission groups are duplicated`);
  }
  return Object.freeze({
    id: optionalBoundedString(policy.id, `${label} policy id`, 128),
    effect: policy.effect,
    permissionGroups: Object.freeze(permissionGroups),
    resources: normalizeResources(policy.resources, label),
  });
}

function normalizeTokenDetails(value, expectedTokenId, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('cloudflare_iam_token_invalid', `${label} token details are invalid`);
  }
  const id = boundedString(value.id, `${label} token id`, 128);
  if (id !== expectedTokenId) fail('cloudflare_iam_token_identity_mismatch', `${label} token identity changed during readback`);
  if (value.status !== 'active') fail('cloudflare_iam_token_inactive', `${label} token is not active`, { status: value.status ?? null });
  if (!Array.isArray(value.policies) || value.policies.length === 0) {
    fail('cloudflare_iam_policy_invalid', `${label} token has no observable policies`);
  }
  const policies = value.policies.map((policy, index) => normalizePolicy(policy, `${label} policy ${index}`));
  return Object.freeze({
    id,
    status: value.status,
    name: optionalBoundedString(value.name, `${label} token name`, 120),
    issuedOn: optionalBoundedString(value.issued_on, `${label} issued_on`, 128),
    modifiedOn: optionalBoundedString(value.modified_on, `${label} modified_on`, 128),
    expiresOn: optionalBoundedString(value.expires_on, `${label} expires_on`, 128),
    notBefore: optionalBoundedString(value.not_before, `${label} not_before`, 128),
    policies: Object.freeze(policies),
  });
}

function resourceMatches(resources, resourceType, resourceId, accountId) {
  if (resourceType === 'account') {
    return resources[`com.cloudflare.api.account.${resourceId}`] === '*' || resources['com.cloudflare.api.account.*'] === '*';
  }
  if (resourceType === 'zone') {
    if (resources[`com.cloudflare.api.account.zone.${resourceId}`] === '*' || resources['com.cloudflare.api.account.zone.*'] === '*') return true;
    for (const accountKey of [`com.cloudflare.api.account.${accountId}`, 'com.cloudflare.api.account.*']) {
      const nested = resources[accountKey];
      if (nested !== null && typeof nested === 'object' && !Array.isArray(nested) &&
          (nested[`com.cloudflare.api.account.zone.${resourceId}`] === '*' || nested['com.cloudflare.api.account.zone.*'] === '*')) return true;
    }
    return false;
  }
  fail('cloudflare_iam_policy_invalid', `unsupported policy resource type ${resourceType}`);
}

function policyHasPermission(policy, permissionIdsValue) {
  return policy.permissionGroups.some((group) => permissionIdsValue.has(group.id));
}

function tokenAllows(token, permissionIdsValue, resourceType, resourceId, accountId) {
  const matching = token.policies.filter((policy) =>
    policyHasPermission(policy, permissionIdsValue) && resourceMatches(policy.resources, resourceType, resourceId, accountId));
  if (matching.some((policy) => policy.effect === 'deny')) return false;
  return matching.some((policy) => policy.effect === 'allow');
}

function publicProviderPolicyObservation(token, tokenKind, accountId) {
  const policies = token.policies.map((policy) => ({
    effect: policy.effect,
    permissionGroups: policy.permissionGroups,
    resources: policy.resources,
  }));
  const policyDigest = typedDigest(TOKEN_POLICY_OBSERVATION_PROFILE, {
    accountId,
    tokenId: token.id,
    tokenKind,
    tokenStatus: token.status,
    policies,
  });
  return Object.freeze({
    profile: TOKEN_PRINCIPAL_PROFILE,
    accountId,
    tokenKind,
    tokenId: token.id,
    tokenStatus: token.status,
    tokenName: token.name,
    issuedOn: token.issuedOn,
    modifiedOn: token.modifiedOn,
    expiresOn: token.expiresOn,
    notBefore: token.notBefore,
    policyDigest,
    policies: Object.freeze(policies),
  });
}

export function validateD0039CloudflareIamObservation({
  accountId,
  zoneId,
  providerTokenId,
  providerTokenKind,
  iamTokenKind,
  providerTokenDetails,
  iamTokenVerify,
  permissionGroups,
  observedReadPermission,
}) {
  boundedString(accountId, 'account id', 128);
  boundedString(zoneId, 'zone id', 128);
  boundedString(providerTokenId, 'provider token id', 128);
  normalizeTokenKind(providerTokenKind, 'provider token kind');
  normalizeTokenKind(iamTokenKind, 'IAM token kind');
  if (iamTokenVerify === null || typeof iamTokenVerify !== 'object' || Array.isArray(iamTokenVerify)) {
    fail('cloudflare_iam_token_invalid', 'IAM token verification is invalid');
  }
  const iamTokenId = boundedString(iamTokenVerify.id, 'IAM token id', 128);
  if (iamTokenVerify.status !== 'active') fail('cloudflare_iam_token_inactive', 'IAM token is not active', { status: iamTokenVerify.status ?? null });

  const provider = normalizeTokenDetails(providerTokenDetails, providerTokenId, 'provider');
  if (providerTokenKind === iamTokenKind && provider.id === iamTokenId) {
    fail('cloudflare_iam_principal_not_independent', 'provider and IAM observations must use distinct API token principals');
  }

  const groups = normalizePermissionGroups(permissionGroups);
  const scriptsWriteIds = permissionIds(groups, PERMISSIONS.providerScriptsWrite);
  const routesWriteIds = permissionIds(groups, PERMISSIONS.providerRoutesWrite);
  const expectedReadPermission = providerTokenKind === 'account' ? PERMISSIONS.accountTokensRead : PERMISSIONS.userTokensRead;
  permissionIds(groups, expectedReadPermission);
  if (observedReadPermission !== expectedReadPermission.aliases[0]) {
    fail('cloudflare_iam_observer_permission_missing', 'IAM observer read authority does not match the provider token namespace');
  }

  if (!tokenAllows(provider, scriptsWriteIds, 'account', accountId, accountId)) {
    fail('cloudflare_iam_provider_permission_missing', 'provider principal lacks effective Workers Scripts write permission on the target account');
  }
  if (!tokenAllows(provider, routesWriteIds, 'zone', zoneId, accountId)) {
    fail('cloudflare_iam_provider_permission_missing', 'provider principal lacks effective Workers Routes write permission on the target zone');
  }

  const providerObservation = publicProviderPolicyObservation(provider, providerTokenKind, accountId);
  const iamPrincipal = Object.freeze({
    profile: TOKEN_PRINCIPAL_PROFILE,
    tokenKind: iamTokenKind,
    tokenId: iamTokenId,
    tokenStatus: 'active',
    observedReadPermission,
    observedNamespace: providerTokenKind === 'account' ? 'account_api_tokens' : 'user_api_tokens',
  });
  const iamPrincipalDigest = typedDigest('tdev.cloudflare-iam-observer-principal.v1', iamPrincipal);
  return Object.freeze({
    classification: 'observed',
    gate: 'q5_live_provider_iam',
    proofLayer: 'live_iam_control_plane_partial',
    observerSeparation: 'distinct_api_token_principals',
    authoritySeparation: 'unverified',
    privateKeyCustody: 'unverified',
    terminalQ5: false,
    accountId,
    zoneId,
    providerPrincipal: providerObservation,
    iamPrincipal,
    iamPrincipalDigest,
    observationDigest: typedDigest('tdev.cloudflare-q5-iam-observation.v1', {
      accountId,
      zoneId,
      providerPrincipalDigest: providerObservation.policyDigest,
      iamPrincipalDigest,
      observedReadPermission,
    }),
    secretValues: 'excluded',
  });
}

export async function readD0039CloudflareIamObservation({ accountId, zoneId, providerTokenId, providerTokenKind, iamTokenKind, iamApiToken }) {
  boundedString(accountId, 'account id', 128);
  boundedString(zoneId, 'zone id', 128);
  boundedString(providerTokenId, 'provider token id', 128);
  normalizeTokenKind(providerTokenKind, 'provider token kind');
  normalizeTokenKind(iamTokenKind, 'IAM token kind');
  if (typeof iamApiToken !== 'string' || iamApiToken.length < 20 || iamApiToken.includes('\0')) {
    fail('cloudflare_iam_readback_credentials_unavailable', 'independent IAM Cloudflare API token must be supplied out of band');
  }

  const providerNamespace = permissionNamespace(providerTokenKind, accountId);
  const iamNamespace = permissionNamespace(iamTokenKind, accountId);
  const iamVerify = await cloudflareGet(iamApiToken, iamNamespace.verifyPath, 'IAM token verification');
  const [providerDetails, permissionGroups] = await Promise.all([
    cloudflareGet(iamApiToken, providerNamespace.tokenPath(providerTokenId), 'provider token policy readback'),
    cloudflareGet(iamApiToken, providerNamespace.permissionGroupsPath, 'provider token permission-group catalog'),
  ]);
  return validateD0039CloudflareIamObservation({
    accountId,
    zoneId,
    providerTokenId,
    providerTokenKind,
    iamTokenKind,
    providerTokenDetails: providerDetails,
    iamTokenVerify: iamVerify,
    permissionGroups,
    observedReadPermission: providerNamespace.readPermission.aliases[0],
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const iamApiToken = process.env.CLOUDFLARE_IAM_API_TOKEN;
  const observed = await readD0039CloudflareIamObservation({ ...options, iamApiToken });
  process.stdout.write(`${canonicalJson(observed)}\n`);
}

const direct = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  try { await main(); }
  catch (error) {
    process.stderr.write(`${JSON.stringify({ error: error?.code ?? 'cloudflare_iam_readback_failed', message: error?.message ?? 'Q5 Cloudflare IAM readback failed', details: error?.details ?? {} })}\n`);
    process.exitCode = 1;
  }
}
