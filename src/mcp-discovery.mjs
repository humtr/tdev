import {
  MCP_AUTH_RESOURCE_METADATA_PATHS,
  MCP_AUTH_SERVER_METADATA_PATH,
  mcpAuthProtectedResourceMetadata,
  normalizeMcpAuthManifest,
  validateMcpAuthorizationServerMetadata,
} from './mcp-auth.mjs';

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

function diagnosticCode(error) {
  return typeof error?.code === 'string' && /^[a-z][a-z0-9_]{0,127}$/u.test(error.code)
    ? error.code
    : 'mcp_config_unavailable';
}

export function cloudflareAccessAuthorizationServerMetadata(authManifest) {
  const issuer = authManifest.authorizationServerIssuer.replace(/\/$/u, '');
  return validateMcpAuthorizationServerMetadata({
    issuer: authManifest.authorizationServerIssuer,
    authorization_endpoint: `${issuer}/cdn-cgi/access/oauth/authorization`,
    token_endpoint: `${issuer}/cdn-cgi/access/oauth/token`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
    revocation_endpoint: `${issuer}/cdn-cgi/access/oauth/revoke`,
    registration_endpoint: `${issuer}/cdn-cgi/access/oauth/registration`,
    code_challenge_methods_supported: ['S256'],
  }, authManifest);
}

/**
 * Return a cheap discovery response for metadata paths, or null for all other
 * requests. The caller is responsible for loading/normalizing the bound auth
 * manifest before calling this function.
 */
export function mcpDiscoveryResponse(request, authManifest) {
  const url = new URL(request.url);
  const protectedResource = MCP_AUTH_RESOURCE_METADATA_PATHS.includes(url.pathname);
  const authorizationServer = url.pathname === MCP_AUTH_SERVER_METADATA_PATH;
  if (!protectedResource && !authorizationServer) return null;
  if (request.method !== 'GET') return jsonResponse(405, { error: { code: 'mcp_method_not_allowed' } });
  try {
    const normalized = normalizeMcpAuthManifest(authManifest);
    const metadata = protectedResource
      ? mcpAuthProtectedResourceMetadata(normalized)
      : cloudflareAccessAuthorizationServerMetadata(normalized);
    return jsonResponse(200, metadata);
  } catch (error) {
    return jsonResponse(503, { error: { code: diagnosticCode(error) } });
  }
}
