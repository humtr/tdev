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
  normalizeMcpTrialCompositionBinding,
  normalizeMcpTrialCompositionManifest,
} from '../src/mcp-trial-composition.mjs';
import {
  createMcpTrialDevelopmentUnitRunner,
} from '../src/mcp-trial-runner.mjs';
import {
  normalizeDevelopmentOperationManifest,
} from '../src/development-operation-profile.mjs';
import { CaseAgentDriveRuntimeDO } from './cloudflare-case-agent-drive-worker.mjs';
import {
  loadMcpTrialBaseTree,
  MCP_TRIAL_BASE_COMMIT_OID,
  MCP_TRIAL_BASE_DIGEST,
} from './mcp-trial-base-tree.mjs';

const TRIAL_MANIFEST_BINDING = 'TDEV_MCP_TRIAL_MANIFEST_JSON';
const AUTH_MANIFEST_BINDING = 'TDEV_MCP_AUTH_MANIFEST_JSON';
const OPERATION_MANIFEST_BINDING = 'TDEV_MCP_OPERATION_MANIFEST_JSON';
const SURFACE_DIGEST_BINDING = 'TDEV_MCP_SURFACE_DIGEST';
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

function readDigestBinding(env, name) {
  const value = env?.[name];
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw configError('mcp_config_unavailable', `${name} is not a valid digest binding`);
  }
  return value;
}

function assertGeneratedBaseBinding(composition) {
  if (MCP_TRIAL_BASE_COMMIT_OID !== null && MCP_TRIAL_BASE_COMMIT_OID !== composition.repository.commitOid) {
    throw configError('mcp_config_unavailable', 'Generated base-tree module commit does not match the trial composition');
  }
  if (MCP_TRIAL_BASE_DIGEST !== null && MCP_TRIAL_BASE_DIGEST !== composition.repository.baseDigest) {
    throw configError('mcp_config_unavailable', 'Generated base-tree module digest does not match the trial composition');
  }
}

function compactContext(composition) {
  const context = composition.repository.context;
  return Object.freeze({
    revisionId: context.revisionId,
    repositoryCommitOid: context.repositoryCommitOid,
    objectFormat: context.objectFormat,
    contextReferenceId: composition.repository.contextReference,
    baseDigest: composition.repository.baseDigest,
    ...(context.contextCapabilityId === undefined ? {} : { contextCapabilityId: context.contextCapabilityId }),
    ...(context.modelCapabilityId === undefined ? {} : { modelCapabilityId: context.modelCapabilityId }),
    ...(context.validationCapabilityId === undefined ? {} : { validationCapabilityId: context.validationCapabilityId }),
  });
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

function requestDiagnostic(request) {
  const headers = request.headers;
  const protocol = headers.get('mcp-protocol-version');
  const method = headers.get('mcp-method');
  const contentType = headers.get('content-type');
  return {
    path: new URL(request.url).pathname,
    method: request.method,
    cfRay: (headers.get('cf-ray') ?? '').slice(0, 64) || null,
    hasAuthorization: headers.get('authorization') !== null,
    hasAccessAssertion: headers.get('cf-access-jwt-assertion') !== null,
    mcpProtocol: protocol === null ? null : protocol.slice(0, 64),
    mcpMethod: method === null ? null : method.slice(0, 128),
    mcpNamePresent: headers.get('mcp-name') !== null,
    contentType: contentType === null ? null : contentType.split(';', 1)[0].trim().slice(0, 128),
    acceptPresent: headers.get('accept') !== null,
    originPresent: headers.get('origin') !== null,
  };
}

function emitRequestDiagnostic(stage, request, fields = {}) {
  if (typeof console?.log !== 'function') return;
  try {
    console.log(JSON.stringify({
      profile: 'tdev.mcp.trial.request-diagnostic.v1',
      stage,
      ...requestDiagnostic(request),
      ...fields,
    }));
  } catch {
    // Diagnostics must never change the Worker response path.
  }
}

async function responseDiagnosticFields(response) {
  if (!(response instanceof Response) || response.status < 400) return {};
  try {
    const clone = response.clone();
    const text = await clone.text();
    if (text.length === 0 || text.length > 16 * 1024) return {};
    const body = JSON.parse(text);
    const error = body?.error;
    const data = error?.data;
    return {
      ...(typeof data?.code === 'string' ? { code: data.code.slice(0, 128) } : {}),
      ...(typeof data?.field === 'string' ? { field: data.field.slice(0, 128) } : {}),
    };
  } catch {
    return {};
  }
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
  assertGeneratedBaseBinding(composition);
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
      developmentContextResolve: facades.contextOwner.developmentContextResolve,
      authorize: facades.authorize,
    },
  });
}

/**
 * Construct the MCP surface from only the bounded environment manifests.  The
 * generated repository tree is intentionally not decoded here: ChatGPT's
 * modern discovery/list requests must be able to complete within the Worker
 * CPU budget.  Owner methods are single-flight lazy delegates to the full
 * application, so a real mutation still crosses the same strict composition
 * and owner validation boundary before it can run.
 */
async function createTrialLightApplication(env) {
  const configuredComposition = normalizeMcpTrialCompositionBinding(
    readJsonBinding(env, TRIAL_MANIFEST_BINDING),
  );
  assertGeneratedBaseBinding(configuredComposition);
  const authManifest = normalizeMcpAuthManifest(readJsonBinding(env, AUTH_MANIFEST_BINDING, 64 * 1024));
  const operationManifest = normalizeDevelopmentOperationManifest(
    readJsonBinding(env, OPERATION_MANIFEST_BINDING, 256 * 1024),
  );
  if (authManifest.mcpResource !== configuredComposition.resource) {
    throw configError('mcp_config_unavailable', 'MCP auth resource does not match the fixed trial resource');
  }
  if (configuredComposition.operation.manifestDigest !== digest(operationManifest)) {
    throw configError('mcp_config_unavailable', 'Trial operation binding does not match the operation manifest');
  }
  const buildDigest = digest({
    profile: 'tdev.mcp.trial.build.v1',
    compositionDigest: configuredComposition.manifestDigest,
    authProfileDigest: authManifest.profileDigest,
    operationManifestDigest: digest(operationManifest),
  });
  const surfaceManifest = createMcpSurfaceManifest({ buildDigest });
  if (surfaceManifest.surfaceDigest !== readDigestBinding(env, SURFACE_DIGEST_BINDING)) {
    throw configError('mcp_config_unavailable', 'MCP surface digest does not match the fixed deployment binding');
  }
  const verifier = createCloudflareAccessAssertionVerifier();
  const authorizationServerMetadata = cloudflareAccessAuthorizationServerMetadata(authManifest);
  const auth = createMcpAccessAuthenticator({
    manifest: authManifest,
    verifyAssertion: verifier,
    authorizationServerMetadata,
  });

  let fullWorkerPromise = null;
  const fullWorker = async () => {
    if (fullWorkerPromise === null) fullWorkerPromise = application(env);
    return fullWorkerPromise;
  };
  const invokeFull = async (property, method, args) => {
    const worker = await fullWorker();
    const owner = worker.surface[property];
    if (!owner || typeof owner[method] !== 'function') {
      throw configError('mcp_owner_unavailable', `Full trial owner ${property}.${method} is unavailable`);
    }
    return owner[method](...args);
  };
  const repository = Object.freeze({
    create: (...args) => invokeFull('repository', 'create', args),
    load: (...args) => invokeFull('repository', 'load', args),
    command: (...args) => invokeFull('repository', 'command', args),
  });
  const runner = Object.freeze({
    create: (...args) => invokeFull('developmentUnitRunner', 'create', args),
    drive: (...args) => invokeFull('developmentUnitRunner', 'drive', args),
    candidate: (...args) => invokeFull('developmentUnitRunner', 'candidate', args),
  });
  const context = compactContext(configuredComposition);
  const assertContextSelector = (selector) => {
    if (selector !== null && selector !== configuredComposition.repository.contextReference) {
      const error = new Error('Context selector is outside the fixed trial reference');
      error.code = 'mcp_trial_context_scope_denied';
      throw error;
    }
  };
  const owners = {
    repository,
    driveRunner: runner,
    developmentUnitRunner: runner,
    developmentContextGet: async ({ selector = null } = {}) => {
      assertContextSelector(selector);
      return context;
    },
    developmentContextResolve: async ({ selector = null, identity } = {}) => {
      assertContextSelector(selector);
      // Resolve the full tree only for development_unit_start.  The full
      // application repeats all manifest and generated-module checks before
      // returning the internal resolver result.
      const worker = await fullWorker();
      const resolver = worker.surface.owners.developmentContextResolve
        ?? worker.surface.owners.developmentContextGet;
      if (typeof resolver !== 'function') throw configError('mcp_owner_unavailable', 'Full development context resolver is unavailable');
      return resolver({ selector, identity });
    },
    authorize: async ({ identity } = {}) => Boolean(
      identity?.principalId === configuredComposition.identity.principalId &&
      identity?.tenantId === configuredComposition.identity.tenantId,
    ),
  };
  return createTdevMcpWorker({
    manifest: surfaceManifest,
    auth,
    authorizationServerMetadata,
    owners,
  });
}

let applicationPromise = null;
let lightApplicationPromise = null;

async function application(env) {
  if (applicationPromise === null) {
    applicationPromise = Promise.resolve().then(() => createTrialApplication(env));
  }
  return applicationPromise;
}

async function lightApplication(env) {
  if (lightApplicationPromise === null) {
    lightApplicationPromise = Promise.resolve().then(() => createTrialLightApplication(env));
  }
  return lightApplicationPromise;
}

export default {
  async fetch(request, env) {
    emitRequestDiagnostic('received', request);
    const fastMetadata = metadataFastPath(request, env);
    if (fastMetadata !== null) {
      emitRequestDiagnostic('metadata', request, { status: fastMetadata.status });
      return fastMetadata;
    }
    try {
      const worker = await lightApplication(env);
      const response = await worker.fetch(request);
      emitRequestDiagnostic('mcp', request, { status: response.status, ...(await responseDiagnosticFields(response)) });
      return response;
    } catch (error) {
      const code = diagnosticCode(error);
      emitRequestDiagnostic('error', request, { status: 503, code });
      return jsonResponse(503, { error: { code } });
    }
  },
};

export { CaseAgentDriveRuntimeDO, metadataFastPath };
