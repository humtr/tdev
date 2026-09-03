import {
  ContractError,
  assertRecordShape,
  assertScalarString,
  deepFreeze,
  isPlainRecord,
  strictJsonParse,
} from './canonical.mjs';

export const MCP_ACCESS_JWT_PROFILE = 'tdev.mcp.auth.cloudflare-access-jwt-rs256.v1';
export const MCP_ACCESS_JWT_MAX_BYTES = 16 * 1024;
export const MCP_ACCESS_JWKS_MAX_BYTES = 256 * 1024;

function fail(code, message, details = undefined, options = undefined) {
  throw new ContractError(code, message, details, options);
}

function decodeBase64Url(value, label) {
  if (typeof value !== 'string' || value.length === 0 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    fail('mcp_auth_assertion_invalid', `${label} is not valid base64url`);
  }
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  let raw;
  try { raw = atob(padded); }
  catch (cause) { fail('mcp_auth_assertion_invalid', `${label} is not valid base64url`, {}, { cause }); }
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function encodeText(value) {
  return new TextEncoder().encode(value);
}

function constantTimeEqual(left, right) {
  if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array)) return false;
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}

function parseJsonSegment(value, label) {
  const bytes = decodeBase64Url(value, label);
  try { return strictJsonParse(bytes, { maxBytes: 32 * 1024, maxDepth: 32, maxTokens: 10_000 }); }
  catch (cause) { fail('mcp_auth_assertion_invalid', `${label} is not strict JSON`, {}, { cause }); }
}

function normalizeJwk(input) {
  if (!isPlainRecord(input)) fail('mcp_auth_jwks_invalid', 'JWKS key must be a record');
  assertRecordShape(input, ['kty', 'kid', 'alg', 'use', 'n', 'e'], [], 'Access JWKS RSA key');
  if (input.kty !== 'RSA' || input.alg !== 'RS256' || input.use !== 'sig' || typeof input.kid !== 'string' ||
      !/^[A-Za-z0-9._-]{1,256}$/.test(input.kid) || typeof input.n !== 'string' || typeof input.e !== 'string') {
    fail('mcp_auth_jwks_invalid', 'Access JWKS contains an unsupported key');
  }
  return input;
}

async function readBoundedJson(response, maxBytes, label) {
  if (!response || response.ok !== true || response.body === null || typeof response.body.getReader !== 'function') {
    fail('mcp_auth_jwks_unavailable', `${label} could not be read`);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const bytes = new Uint8Array(value);
      total += bytes.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        fail('mcp_auth_jwks_too_large', `${label} exceeds its byte bound`);
      }
      chunks.push(bytes);
    }
  } finally { reader.releaseLock?.(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return strictJsonParse(bytes, { maxBytes }); }
  catch (cause) { fail('mcp_auth_jwks_invalid', `${label} is not strict JSON`, {}, { cause }); }
}

function normalizeJwks(input) {
  if (!isPlainRecord(input)) fail('mcp_auth_jwks_invalid', 'Access JWKS must be a record');
  assertRecordShape(input, ['keys'], [], 'Access JWKS');
  if (!Array.isArray(input.keys) || input.keys.length === 0 || input.keys.length > 32) fail('mcp_auth_jwks_invalid', 'Access JWKS keys are invalid');
  const keys = input.keys.map(normalizeJwk);
  if (new Set(keys.map((key) => key.kid)).size !== keys.length) fail('mcp_auth_jwks_invalid', 'Access JWKS contains duplicate key IDs');
  return deepFreeze({ keys });
}

async function importRsaKey(jwk) {
  try {
    return await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  } catch (cause) { fail('mcp_auth_jwks_invalid', 'Access JWKS RSA key could not be imported', {}, { cause }); }
}

export function createCloudflareAccessAssertionVerifier({ fetchImpl = globalThis.fetch, cacheTtlMs = 300_000 } = {}) {
  if (typeof fetchImpl !== 'function') fail('mcp_auth_verifier_unavailable', 'A fetch implementation is required for Access JWKS verification');
  if (!Number.isSafeInteger(cacheTtlMs) || cacheTtlMs < 0 || cacheTtlMs > 3_600_000) fail('mcp_auth_verifier_config_invalid', 'JWKS cache TTL is out of bounds');
  let cached = null;
  let cachedAt = 0;

  async function keysFor(manifest, force = false) {
    const now = Date.now();
    if (!force && cached !== null && now - cachedAt <= cacheTtlMs && cached.uri === manifest.jwksUri) return cached.keys;
    let response;
    try { response = await fetchImpl(manifest.jwksUri, { method: 'GET', headers: { accept: 'application/json' } }); }
    catch (cause) { fail('mcp_auth_jwks_unavailable', 'Access JWKS fetch failed', {}, { cause }); }
    const document = normalizeJwks(await readBoundedJson(response, MCP_ACCESS_JWKS_MAX_BYTES, 'Access JWKS'));
    const imported = new Map();
    for (const jwk of document.keys) imported.set(jwk.kid, await importRsaKey(jwk));
    cached = { uri: manifest.jwksUri, keys: imported };
    cachedAt = now;
    return imported;
  }

  return async function verifyAccessAssertion(assertion, manifest) {
    assertScalarString(assertion, 'Access assertion');
    if (assertion.length === 0 || assertion.length > MCP_ACCESS_JWT_MAX_BYTES) fail('mcp_auth_assertion_invalid', 'Access assertion exceeds its byte bound');
    const parts = assertion.split('.');
    if (parts.length !== 3 || parts.some((part) => part.length === 0)) fail('mcp_auth_assertion_invalid', 'Access assertion must be a compact JWT');
    const header = parseJsonSegment(parts[0], 'Access JWT header');
    const claims = parseJsonSegment(parts[1], 'Access JWT claims');
    if (!isPlainRecord(header) || !isPlainRecord(claims)) fail('mcp_auth_assertion_invalid', 'Access JWT header/claims must be records');
    assertRecordShape(header, ['alg', 'kid'], ['typ'], 'Access JWT header');
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') fail('mcp_auth_assertion_invalid', 'Only RS256 Access assertions are supported');
    const signature = decodeBase64Url(parts[2], 'Access JWT signature');
    let keys = await keysFor(manifest);
    let key = keys.get(header.kid);
    if (!key) {
      keys = await keysFor(manifest, true);
      key = keys.get(header.kid);
    }
    if (!key) fail('mcp_auth_assertion_invalid', 'Access assertion key ID is not published by the issuer');
    let valid;
    try { valid = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, signature, encodeText(`${parts[0]}.${parts[1]}`)); }
    catch (cause) { fail('mcp_authentication_failed', 'Access assertion signature verification failed', {}, { cause }); }
    if (!constantTimeEqual(Uint8Array.of(valid ? 1 : 0), Uint8Array.of(1))) fail('mcp_authentication_failed', 'Access assertion signature verification failed');
    return deepFreeze({ claims: canonicalClaims(claims), header: canonicalClaims(header) });
  };
}

function canonicalClaims(value) {
  return value;
}
