import {
  canonicalJson,
  digest,
  isPlainRecord,
  strictJsonParse,
} from '../src/canonical.mjs';
import {
  createCloudflareAccessAssertionVerifier,
} from '../src/mcp-auth-jwt.mjs';
import {
  MCP_AUTH_RESOURCE_METADATA_PATHS,
  MCP_AUTH_SERVER_METADATA_PATH,
  createMcpAccessAuthenticator,
  normalizeMcpAuthManifest,
} from '../src/mcp-auth.mjs';
import {
  cloudflareAccessAuthorizationServerMetadata,
  mcpDiscoveryResponse,
} from '../src/mcp-discovery.mjs';
import {
  createMcpSurfaceManifest,
  createTdevMcpWorker,
} from '../src/mcp-surface.mjs';
import {
  createMcpTrialOwnerFacades,
  normalizeMcpTrialCompositionManifest,
} from '../src/mcp-trial-composition.mjs';
import {
  createMcpTrialDevelopmentUnitRunner,
} from '../src/mcp-trial-runner.mjs';
import {
  normalizeDevelopmentOperationManifest,
} from '../src/development-operation-profile.mjs';
import { CaseAgentDriveRuntimeDO } from './cloudflare-case-agent-drive-worker.mjs';
import { loadMcpTrialBaseTree } from './mcp-trial-base-tree.mjs';

const TRIAL_MANIFEST_BINDING = 'TDEV_MCP_TRIAL_MANIFEST_JSON';
const AUTH_MANIFEST_BINDING = 'TDEV_MCP_AUTH_MANIFEST_JSON';
const OPERATION_MANIFEST_BINDING = 'TDEV_MCP_OPERATION_MANIFEST_JSON';
const MAX_CONFIG_BYTES = 8 * 1024 * 1024;

function configError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function readJsonBinding(env, name, maxBytes = MAX_CONFIG_BYTES) {
  const value = env?.[name];
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw configError('mcp_config_unavailable', `${name} is not configured`);
  }
  const bytes = new TextEncoder().encode(value);
  if (bytes.byteLength > maxBytes) throw configError('mcp_config_unavailable', `${name} exceeds its configuration bound`);
  try {
    const parsed = strictJsonParse(bytes, { maxBytes, maxDepth: 64, maxTokens: 500_000 });
    if (!isPlainRecord(parsed)) throw new Error('configuration must be an object');
    if (canonicalJson(parsed) !== value) throw new Error('configuration must use canonical JSON');
    return parsed;
  } catch (cause) {
    throw configError('mcp_config_unavailable', `${name} is not canonical bounded JSON`);
  }
}

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
  return typeof error?.code === 'string' && /^[a-z][a-z0-9_]{0,127}$/.test(error.code)
    ? error.code
    : 'mcp_config_unavailable';
}

function metadataFastPath(request, env) {
  const url = new URL(request.url);
  const protectedResource = MCP_AUTH_RESOURCE_METADATA_PATHS.includes(url.pathname);
  const authorizationServer = url.pathname === MCP_AUTH_SERVER_METADATA_PATH;
  if (!protectedResource && !authorizationServer) return null;
  if (request.method !== 'GET') return jsonResponse(405, { error: { code: 'mcp_method_not_allowed' } });
  try {
    // Discovery must remain cheap and independently readable. It cannot force
    // construction of the immutable repository tree or any Durable Object.
    const authManifest = normalizeMcpAuthManifest(readJsonBinding(env, AUTH_MANIFEST_BINDING, 64 * 1024));
    return mcpDiscoveryResponse(request, authManifest);
  } catch (error) {
    return jsonResponse(503, { error: { code: diagnosticCode(error) } });
  }
}

async function createTrialApplication(env) {
  const configuredComposition = readJsonBinding(env, TRIAL_MANIFEST_BINDING);
  const baseTree = await loadMcpTrialBaseTree();
  if (!isPlainRecord(configuredComposition.repository) || !isPlainRecord(configuredComposition.repository.context)) {
    throw configError('mcp_config_unavailable', 'Trial composition repository context is not configured');
  }
  // The large immutable tree is a deployment-bound module, not a caller or
  // Worker secret. The small environment manifest still binds its commit and
  // digest, which the normalizer verifies against this injected tree.
  const composition = normalizeMcpTrialCompositionManifest({
    ...configuredComposition,
    repository: {
      ...configuredComposition.repository,
      context: { ...configuredComposition.repository.context, baseTree },
    },
  });
  const authManifest = normalizeMcpAuthManifest(readJsonBinding(env, AUTH_MANIFEST_BINDING, 64 * 1024));
  const operationManifest = normalizeDevelopmentOperationManifest(readJsonBinding(env, OPERATION_MANIFEST_BINDING, 256 * 1024));
  if (authManifest.mcpResource !== composition.resource) {
    throw configError('mcp_config_unavailable', 'MCP auth resource does not match the fixed trial resource');
  }
  if (composition.operation.manifestDigest !== digest(operationManifest)) {
    throw configError('mcp_config_unavailable', 'Trial operation binding does not match the operation manifest');
  }

  const facades = createMcpTrialOwnerFacades({
    manifest: composition,
    caseNamespace: env.TDEV_CASE_AUTHORITY,
    driveNamespace: env.TDEV_CASE_AGENT_DRIVE,
    agentNamespace: env.TDEV_AGENT_DELIVERY,
    casePlacementDatabase: env.TDEV_CASE_PLACEMENT,
  });
  const runner = createMcpTrialDevelopmentUnitRunner({
    repository: facades.repository,
    driveOwner: facades.driveOwner,
    agentOwner: facades.agentOwner,
    manifest: composition,
    operationManifest,
  });
  const surfaceManifest = createMcpSurfaceManifest({
    buildDigest: digest({
      profile: 'tdev.mcp.trial.build.v1',
      compositionDigest: composition.manifestDigest,
      authProfileDigest: authManifest.profileDigest,
      operationManifestDigest: digest(operationManifest),
    }),
  });
  const verifier = createCloudflareAccessAssertionVerifier();
  const authorizationServerMetadata = cloudflareAccessAuthorizationServerMetadata(authManifest);
  const auth = createMcpAccessAuthenticator({
    manifest: authManifest,
    verifyAssertion: verifier,
    authorizationServerMetadata,
  });
  return createTdevMcpWorker({
    manifest: surfaceManifest,
    auth,
    authorizationServerMetadata,
    owners: {
      repository: facades.repository,
      driveRunner: runner,
      developmentUnitRunner: runner,
      developmentContextGet: facades.contextOwner.developmentContextGet,
      authorize: facades.authorize,
    },
  });
}

let applicationPromise = null;

async function application(env) {
  if (applicationPromise === null) {
    applicationPromise = Promise.resolve().then(() => createTrialApplication(env));
  }
  return applicationPromise;
}

export default {
  async fetch(request, env) {
    const fastMetadata = metadataFastPath(request, env);
    if (fastMetadata !== null) return fastMetadata;
    try {
      const worker = await application(env);
      return worker.fetch(request);
    } catch (error) {
      return jsonResponse(503, { error: { code: diagnosticCode(error) } });
    }
  },
};

export { CaseAgentDriveRuntimeDO, metadataFastPath };
