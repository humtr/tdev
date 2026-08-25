#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, strictJsonParse, typedDigest } from '../src/canonical.mjs';

const API_ROOT = 'https://api.cloudflare.com/client/v4';
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const TOKEN_PRINCIPAL_PROFILE = 'tdev.cloudflare-account-api-token-principal.v1';
const TOKEN_POLICY_OBSERVATION_PROFILE = 'tdev.cloudflare-account-api-token-policy-observation.v1';

const PERMISSION_ALIASES = Object.freeze({
  providerScriptsWrite: Object.freeze(['Workers Scripts Write', 'Workers Scripts Edit']),
  providerRoutesWrite: Object.freeze(['Workers Routes Write', 'Workers Routes Edit']),
  iamAccountTokensRead: Object.freeze(['Account API Tokens Read']),
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

function parseArgs(argv) {
  const allowed = new Set(['--account-id', '--zone-id', '--provider-token-id']);
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

function normalizePermissionGroups(groups) {
  if (!Array.isArray(groups) || groups.length === 0) {
    fail('cloudflare_iam_permission_catalog_invalid', 'Cloudflare account permission-group catalog is unavailable');
  }
  return groups.map((group, index) => {
    if (group === null || typeof group !== 'object' || Array.isArray(group)) {
      fail('cloudflare_iam_permission_catalog_invalid', `permission group ${index} is invalid`);
    }
    return Object.freeze({
      id: boundedString(group.id, `permission group ${index} id`, 128),
      name: boundedString(group.name, `permission group ${index} name`, 256),
      scopes: Array.isArray(group.scopes)
        ? Object.freeze(group.scopes.map((scope, scopeIndex) => boundedString(scope, `permission group ${index} scope ${scopeIndex}`, 256)).sort())
        : Object.freeze([]),
    });
  });
}

function permissionIds(groups, aliases, label) {
  const ids = groups.filter((group) => aliases.includes(group.name)).map((group) => group.id);
  if (ids.length === 0) {
    fail('cloudflare_iam_permission_catalog_invalid', `Cloudflare permission catalog does not expose ${label}`);
  }
  return new Set(ids);
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
  if (policy.resources === null || typeof policy.resources !== 'object' || Array.isArray(policy.resources)) {
    fail('cloudflare_iam_policy_invalid', `${label} policy resources are invalid`);
  }
  const permissionGroups = policy.permission_groups.map((group, index) => {
    if (group === null || typeof group !== 'object' || Array.isArray(group)) {
      fail('cloudflare_iam_policy_invalid', `${label} permission group ${index} is invalid`);
    }
    return Object.freeze({
      id: boundedString(group.id, `${label} permission group ${index} id`, 128),
      name: typeof group.name === 'string' && group.name.length > 0 ? group.name : null,
    });
  }).sort((left, right) => left.id.localeCompare(right.id));
  return Object.freeze({
    id: typeof policy.id === 'string' && policy.id.length > 0 ? policy.id : null,
    effect: policy.effect,
    permissionGroups: Object.freeze(permissionGroups),
    resources: policy.resources,
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
    name: typeof value.name === 'string' ? value.name : null,
    issuedOn: typeof value.issued_on === 'string' ? value.issued_on : null,
    modifiedOn: typeof value.modified_on === 'string' ? value.modified_on : null,
    expiresOn: typeof value.expires_on === 'string' ? value.expires_on : null,
    notBefore: typeof value.not_before === 'string' ? value.not_before : null,
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

function publicTokenPolicyObservation(token, accountId) {
  const policies = token.policies.map((policy) => ({
    effect: policy.effect,
    permissionGroups: policy.permissionGroups,
    resources: policy.resources,
  }));
  const policyDigest = typedDigest(TOKEN_POLICY_OBSERVATION_PROFILE, {
    accountId,
    tokenId: token.id,
    tokenStatus: token.status,
    policies,
  });
  return Object.freeze({
    profile: TOKEN_PRINCIPAL_PROFILE,
    accountId,
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

export function validateD0039CloudflareIamSeparation({
  accountId,
  zoneId,
  providerTokenVerify,
  iamTokenVerify,
  providerTokenDetails,
  iamTokenDetails,
  permissionGroups,
}) {
  boundedString(accountId, 'account id', 128);
  boundedString(zoneId, 'zone id', 128);
  for (const [label, value] of Object.entries({ providerTokenVerify, iamTokenVerify })) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      fail('cloudflare_iam_token_invalid', `${label} is invalid`);
    }
    boundedString(value.id, `${label} id`, 128);
    if (value.status !== 'active') fail('cloudflare_iam_token_inactive', `${label} is not active`, { status: value.status ?? null });
  }
  if (providerTokenVerify.id === iamTokenVerify.id) {
    fail('cloudflare_iam_principal_not_independent', 'provider and IAM observations must use distinct account API token principals');
  }

  const groups = normalizePermissionGroups(permissionGroups);
  const scriptsWriteIds = permissionIds(groups, PERMISSION_ALIASES.providerScriptsWrite, 'Workers Scripts write permission');
  const routesWriteIds = permissionIds(groups, PERMISSION_ALIASES.providerRoutesWrite, 'Workers Routes write permission');
  const accountTokensReadIds = permissionIds(groups, PERMISSION_ALIASES.iamAccountTokensRead, 'Account API Tokens Read permission');

  const provider = normalizeTokenDetails(providerTokenDetails, providerTokenVerify.id, 'provider');
  const iam = normalizeTokenDetails(iamTokenDetails, iamTokenVerify.id, 'IAM observer');
  if (!tokenAllows(provider, scriptsWriteIds, 'account', accountId, accountId)) {
    fail('cloudflare_iam_provider_permission_missing', 'provider principal lacks effective Workers Scripts write permission on the target account');
  }
  if (!tokenAllows(provider, routesWriteIds, 'zone', zoneId, accountId)) {
    fail('cloudflare_iam_provider_permission_missing', 'provider principal lacks effective Workers Routes write permission on the target zone');
  }
  if (!tokenAllows(iam, accountTokensReadIds, 'account', accountId, accountId)) {
    fail('cloudflare_iam_observer_permission_missing', 'IAM observer lacks effective Account API Tokens Read permission on the target account');
  }

  const providerObservation = publicTokenPolicyObservation(provider, accountId);
  const iamObservation = publicTokenPolicyObservation(iam, accountId);
  return Object.freeze({
    classification: 'observed',
    gate: 'q5_live_provider_iam',
    proofLayer: 'live_iam_control_plane',
    separation: 'distinct_account_api_token_principals',
    providerPrincipal: providerObservation,
    iamPrincipal: iamObservation,
    observationDigest: typedDigest('tdev.cloudflare-q5-iam-observation.v1', {
      accountId,
      zoneId,
      providerPrincipalDigest: providerObservation.policyDigest,
      iamPrincipalDigest: iamObservation.policyDigest,
    }),
    secretValues: 'excluded',
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const iamApiToken = process.env.CLOUDFLARE_IAM_API_TOKEN;
  if (typeof iamApiToken !== 'string' || iamApiToken.length < 20 || iamApiToken.includes('\0')) {
    fail('cloudflare_iam_readback_credentials_unavailable', 'independent IAM Cloudflare account API token must be supplied only through CLOUDFLARE_IAM_API_TOKEN');
  }
  const account = encodeURIComponent(options.accountId);
  const iamVerify = await cloudflareGet(iamApiToken, `/accounts/${account}/tokens/verify`, 'IAM account token verification');
  const [providerDetails, iamDetails, permissionGroups] = await Promise.all([
    cloudflareGet(iamApiToken, `/accounts/${account}/tokens/${encodeURIComponent(options.providerTokenId)}`, 'provider account-token policy readback'),
    cloudflareGet(iamApiToken, `/accounts/${account}/tokens/${encodeURIComponent(iamVerify.id)}`, 'IAM observer account-token policy readback'),
    cloudflareGet(iamApiToken, `/accounts/${account}/tokens/permission_groups`, 'account token permission-group catalog'),
  ]);
  const observed = validateD0039CloudflareIamSeparation({
    accountId: options.accountId,
    zoneId: options.zoneId,
    providerTokenVerify: { id: options.providerTokenId, status: providerDetails?.status },
    iamTokenVerify: iamVerify,
    providerTokenDetails: providerDetails,
    iamTokenDetails: iamDetails,
    permissionGroups,
  });
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
