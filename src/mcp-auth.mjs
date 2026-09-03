import {
  ContractError,
  assertRecordShape,
  assertSafeInteger,
  assertScalarString,
  canonicalClone,
  deepFreeze,
  digest,
  isPlainRecord,
  typedDigest,
} from './canonical.mjs';

export const MCP_AUTH_PROFILE = 'tdev.mcp.auth.cloudflare-access-managed-oauth.v1';
export const MCP_AUTH_SCHEMA_VERSION = 1;
export const MCP_AUTH_MANIFEST_DOMAIN = 'tdev.mcp.auth-profile.v1';
export const MCP_AUTH_ASSERTION_HEADER = 'cf-access-jwt-assertion';
export const MCP_AUTH_RESOURCE_METADATA_PATHS = Object.freeze([
  '/.well-known/oauth-protected-resource',
  '/mcp/.well-known/oauth-protected-resource',
  '/.well-known/cloudflare-access-protected-resource/mcp',
]);
export const MCP_AUTH_SERVER_METADATA_PATH = '/.well-known/oauth-authorization-server';

const REGISTRATION_MODES = new Set(['pre_registered', 'dynamic', 'client_metadata']);
const TOKEN_HEADER_MODE = 'access-managed-opaque-to-edge-assertion';
const MAX_URL_BYTES = 2048;
const MAX_CLAIM_BYTES = 256;

function fail(code, message, details = undefined, options = undefined) {
  throw new ContractError(code, message, details, options);
}

function boundedText(value, label, maxBytes = MAX_URL_BYTES) {
  assertScalarString(value, label);
  if (value.length === 0 || value.trim() !== value || value.includes('\0')) {
    fail('mcp_auth_invalid_manifest', `${label} must be non-empty trimmed text`);
  }
  if (new TextEncoder().encode(value).byteLength > maxBytes) {
    fail('mcp_auth_manifest_limit_exceeded', `${label} exceeds its byte limit`, { maxBytes });
  }
  return value;
}

function httpsUrl(value, label, { path = null, noTrailingSlash = false } = {}) {
  const text = boundedText(value, label);
  let parsed;
  try { parsed = new URL(text); }
  catch (cause) { fail('mcp_auth_invalid_url', `${label} must be an absolute URL`, {}, { cause }); }
  if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '' || parsed.hash !== '') {
    fail('mcp_auth_invalid_url', `${label} must be an HTTPS URL without credentials or fragments`);
  }
  if (noTrailingSlash && text.endsWith('/')) fail('mcp_auth_invalid_url', `${label} must not have a trailing slash`);
  if (path !== null && (parsed.pathname !== path || parsed.search !== '')) {
    fail('mcp_auth_invalid_resource', `${label} must identify exactly ${path}`);
  }
  return text;
}

function claimName(value, label) {
  const text = boundedText(value, label, 128);
  if (!/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(text)) {
    fail('mcp_auth_invalid_claim', `${label} has unsupported claim syntax`);
  }
  return text;
}

function redirectUris(values) {
  if (!Array.isArray(values) || values.length > 32) {
    fail('mcp_auth_invalid_manifest', 'allowedRedirectUris must be an array of at most 32 URLs');
  }
  const normalized = values.map((value, index) => httpsUrl(value, `allowedRedirectUris[${index}]`));
  if (new Set(normalized).size !== normalized.length) fail('mcp_auth_duplicate_redirect_uri', 'allowedRedirectUris contains a duplicate');
  return normalized.sort();
}

function manifestBody(input) {
  assertRecordShape(input, [
    'schemaVersion', 'profile', 'mcpResource', 'authorizationServerIssuer',
    'accessApplicationAudience', 'jwksUri', 'principalClaim', 'tenantClaim',
    'clientRegistrationMode', 'allowedRedirectUris', 'requiredPkceMethod', 'tokenHeaderMode',
  ], ['profileDigest'], 'MCP auth manifest');
  if (input.schemaVersion !== MCP_AUTH_SCHEMA_VERSION || input.profile !== MCP_AUTH_PROFILE) {
    fail('mcp_auth_schema_unsupported', 'Unsupported MCP authentication profile or schema');
  }
  const mcpResource = httpsUrl(input.mcpResource, 'mcpResource', { path: '/mcp' });
  const authorizationServerIssuer = httpsUrl(input.authorizationServerIssuer, 'authorizationServerIssuer', { noTrailingSlash: true });
  const jwksUri = httpsUrl(input.jwksUri, 'jwksUri');
  const body = {
    schemaVersion: MCP_AUTH_SCHEMA_VERSION,
    profile: MCP_AUTH_PROFILE,
    mcpResource,
    authorizationServerIssuer,
    accessApplicationAudience: boundedText(input.accessApplicationAudience, 'accessApplicationAudience', 512),
    jwksUri,
    principalClaim: claimName(input.principalClaim, 'principalClaim'),
    tenantClaim: claimName(input.tenantClaim, 'tenantClaim'),
    clientRegistrationMode: input.clientRegistrationMode,
    allowedRedirectUris: redirectUris(input.allowedRedirectUris),
    requiredPkceMethod: input.requiredPkceMethod,
    tokenHeaderMode: input.tokenHeaderMode,
  };
  if (!REGISTRATION_MODES.has(body.clientRegistrationMode)) fail('mcp_auth_registration_mode_unsupported', 'clientRegistrationMode is unsupported');
  if (body.requiredPkceMethod !== 'S256') fail('mcp_auth_pkce_required', 'Only PKCE S256 is supported');
  if (body.tokenHeaderMode !== TOKEN_HEADER_MODE) fail('mcp_auth_token_mode_unsupported', 'Unsupported token header mode');
  return body;
}

export function normalizeMcpAuthManifest(input) {
  const body = manifestBody(input);
  const expected = typedDigest(MCP_AUTH_MANIFEST_DOMAIN, body);
  if (input.profileDigest !== undefined && input.profileDigest !== expected) {
    fail('mcp_auth_manifest_digest_mismatch', 'MCP auth profile digest does not match its fields');
  }
  return deepFreeze({ ...body, profileDigest: expected });
}

export function createMcpAuthManifest(input = {}) {
  const defaults = {
    schemaVersion: MCP_AUTH_SCHEMA_VERSION,
    profile: MCP_AUTH_PROFILE,
    mcpResource: 'https://mcp.invalid/mcp',
    authorizationServerIssuer: 'https://mcp.invalid/oauth',
    accessApplicationAudience: 'unconfigured',
    jwksUri: 'https://mcp.invalid/oauth/jwks',
    principalClaim: 'sub',
    tenantClaim: 'account_id',
    clientRegistrationMode: 'pre_registered',
    allowedRedirectUris: [],
    requiredPkceMethod: 'S256',
    tokenHeaderMode: TOKEN_HEADER_MODE,
  };
  return normalizeMcpAuthManifest({ ...defaults, ...input });
}

function normalizeAudience(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return [...value];
  fail('mcp_auth_assertion_invalid', 'Access assertion audience is invalid');
}

function claimText(claims, name, label) {
  const value = claims[name];
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_CLAIM_BYTES || value.includes('\0')) {
    fail('mcp_auth_assertion_invalid', `${label} claim is missing or invalid`);
  }
  return value;
}

function normalizeVerifiedAssertion(value) {
  if (!isPlainRecord(value)) fail('mcp_auth_verifier_invalid', 'Assertion verifier must return a record');
  assertRecordShape(value, ['claims'], ['header'], 'verified Access assertion');
  if (!isPlainRecord(value.claims)) fail('mcp_auth_verifier_invalid', 'Verified assertion claims must be a record');
  return value;
}

function verifyClaimTimes(claims, now, clockSkewSeconds) {
  if (!Number.isSafeInteger(claims.exp) || claims.exp <= now - clockSkewSeconds) {
    fail('mcp_auth_assertion_expired', 'Access assertion is expired or missing exp');
  }
  if (claims.nbf !== undefined && (!Number.isSafeInteger(claims.nbf) || claims.nbf > now + clockSkewSeconds)) {
    fail('mcp_auth_assertion_not_yet_valid', 'Access assertion nbf is outside the accepted clock bound');
  }
  if (claims.iat !== undefined && (!Number.isSafeInteger(claims.iat) || claims.iat > now + clockSkewSeconds)) {
    fail('mcp_auth_assertion_invalid', 'Access assertion iat is outside the accepted clock bound');
  }
}

export function validateMcpProtectedResourceMetadata(input, manifest) {
  const normalized = normalizeMcpAuthManifest(manifest);
  if (!isPlainRecord(input)) fail('mcp_auth_discovery_invalid', 'Protected-resource metadata must be a record');
  assertRecordShape(input, ['resource'], [
    'authorization_servers', 'jwks_uri', 'scopes_supported', 'bearer_methods_supported',
    'resource_signing_alg_values_supported', 'resource_name', 'resource_documentation',
    'resource_policy_uri', 'resource_tos_uri', 'tls_client_certificate_bound_access_tokens',
    'authorization_details_types_supported', 'dpop_signing_alg_values_supported',
    'dpop_bound_access_tokens_required', 'protected', 'team_domain', 'authentication_methods',
  ], 'protected-resource metadata');
  if (input.authorization_servers !== undefined && !Array.isArray(input.authorization_servers)) {
    fail('mcp_auth_discovery_invalid', 'Protected-resource authorization_servers must be an array');
  }
  const authorizationServers = input.authorization_servers ?? [normalized.authorizationServerIssuer];
  if (input.resource !== normalized.mcpResource || authorizationServers.length !== 1 || authorizationServers[0] !== normalized.authorizationServerIssuer) {
    fail('mcp_auth_resource_binding_mismatch', 'Protected-resource metadata does not bind the configured resource and issuer');
  }
  return deepFreeze(canonicalClone(input));
}

export function validateMcpAuthorizationServerMetadata(input, manifest) {
  const normalized = normalizeMcpAuthManifest(manifest);
  if (!isPlainRecord(input)) fail('mcp_auth_discovery_invalid', 'Authorization-server metadata must be a record');
  assertRecordShape(input, ['issuer', 'authorization_endpoint', 'token_endpoint', 'code_challenge_methods_supported'], [
    'registration_endpoint', 'scopes_supported', 'response_types_supported', 'response_modes_supported',
    'grant_types_supported', 'token_endpoint_auth_methods_supported',
    'token_endpoint_auth_signing_alg_values_supported', 'revocation_endpoint',
    'revocation_endpoint_auth_methods_supported', 'introspection_endpoint',
    'introspection_endpoint_auth_methods_supported', 'client_id_metadata_document_supported',
    'authorization_response_iss_parameter_supported', 'resource',
  ], 'authorization-server metadata');
  if (input.issuer !== normalized.authorizationServerIssuer) fail('mcp_auth_issuer_mismatch', 'Authorization-server issuer does not match the configured issuer');
  for (const field of ['authorization_endpoint', 'token_endpoint', ...(input.registration_endpoint ? ['registration_endpoint'] : [])]) {
    httpsUrl(input[field], `authorization-server ${field}`);
  }
  if (!Array.isArray(input.code_challenge_methods_supported) || !input.code_challenge_methods_supported.includes('S256')) {
    fail('mcp_auth_pkce_required', 'Authorization server does not advertise PKCE S256');
  }
  if (input.resource !== undefined && input.resource !== normalized.mcpResource) {
    fail('mcp_auth_resource_binding_mismatch', 'Authorization-server metadata resource does not match the configured resource');
  }
  return deepFreeze(canonicalClone(input));
}

export function mcpAuthProtectedResourceMetadata(manifest) {
  const normalized = normalizeMcpAuthManifest(manifest);
  return deepFreeze({
    resource: normalized.mcpResource,
    authorization_servers: [normalized.authorizationServerIssuer],
  });
}

export class McpAccessAuthenticator {
  constructor({ manifest, verifyAssertion, now = () => Math.floor(Date.now() / 1000), clockSkewSeconds = 60,
    protectedResourceMetadata = null, authorizationServerMetadata = null } = {}) {
    this.manifest = normalizeMcpAuthManifest(manifest);
    if (typeof verifyAssertion !== 'function') fail('mcp_auth_verifier_unavailable', 'An issuer-bound Access assertion verifier is required');
    if (typeof now !== 'function') fail('mcp_auth_invalid_clock', 'MCP auth clock must be a function');
    assertSafeInteger(clockSkewSeconds, 'clockSkewSeconds', { min: 0, max: 600 });
    this.verifyAssertion = verifyAssertion;
    this.now = now;
    this.clockSkewSeconds = clockSkewSeconds;
    this.protectedResourceMetadata = protectedResourceMetadata === null
      ? mcpAuthProtectedResourceMetadata(this.manifest)
      : validateMcpProtectedResourceMetadata(protectedResourceMetadata, this.manifest);
    this.authorizationServerMetadata = authorizationServerMetadata === null
      ? null
      : validateMcpAuthorizationServerMetadata(authorizationServerMetadata, this.manifest);
  }

  discovery() {
    return deepFreeze({
      protectedResource: canonicalClone(this.protectedResourceMetadata),
      authorizationServer: this.authorizationServerMetadata === null ? null : canonicalClone(this.authorizationServerMetadata),
    });
  }

  async authenticate(request, { requiredResource = this.manifest.mcpResource } = {}) {
    if (requiredResource !== this.manifest.mcpResource) fail('mcp_auth_resource_binding_mismatch', 'Requested resource is not the configured MCP resource');
    const value = request?.headers?.get?.(MCP_AUTH_ASSERTION_HEADER) ?? null;
    if (value === null || value === '' || value.includes(',') || value.length > 16 * 1024) {
      fail('mcp_authentication_failed', 'Exactly one bounded Access assertion is required');
    }
    let verified;
    try { verified = normalizeVerifiedAssertion(await this.verifyAssertion(value, this.manifest)); }
    catch (cause) {
      if (cause instanceof ContractError) throw cause;
      fail('mcp_authentication_failed', 'Access assertion verification failed', {}, { cause });
    }
    const claims = verified.claims;
    if (claims.iss !== this.manifest.authorizationServerIssuer) fail('mcp_auth_issuer_mismatch', 'Access assertion issuer does not match the configured issuer');
    if (!normalizeAudience(claims.aud).includes(this.manifest.accessApplicationAudience)) {
      fail('mcp_auth_audience_mismatch', 'Access assertion audience does not match the configured application');
    }
    verifyClaimTimes(claims, this.now(), this.clockSkewSeconds);
    const principalId = claimText(claims, this.manifest.principalClaim, 'principal');
    const tenantId = claimText(claims, this.manifest.tenantClaim, 'tenant');
    return deepFreeze({
      profile: this.manifest.profile,
      principalId,
      tenantId,
      issuer: this.manifest.authorizationServerIssuer,
      audience: this.manifest.accessApplicationAudience,
      authenticationDigest: digest({
        issuer: this.manifest.authorizationServerIssuer,
        audience: this.manifest.accessApplicationAudience,
        principalId,
        tenantId,
      }),
    });
  }
}

export function createMcpAccessAuthenticator(options) {
  return new McpAccessAuthenticator(options);
}
