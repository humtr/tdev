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
  namespaceFor,
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
      ...(typeof error?.message === 'string' ? { message: error.message.slice(0, 256) } : {}),
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

export async function createTrialApplication(env, { driveOwnerOverride = null } = {}) {
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
    driveOwnerOverride,
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
 * CPU budget. Tree-heavy owner methods are delegated through the bound Drive
 * Durable Object, so the ingress never constructs the full application.
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

  const assertTrialCaseId = (caseId) => {
    if (typeof caseId !== 'string' || caseId.length === 0 || !caseId.startsWith(configuredComposition.casePrefix)) {
      throw configError('mcp_trial_case_scope_denied', 'Case identity is outside the fixed trial prefix');
    }
    return caseId;
  };
  const driveNs = namespaceFor(env.TDEV_CASE_AGENT_DRIVE, configuredComposition.jurisdiction, 'Case-Agent drive');
  const invokeExecution = async (caseId, operation, input = {}) => {
    assertTrialCaseId(caseId);
    const id = driveNs.idFromName(caseId);
    if (!id || typeof id.toString !== 'function' || (id.jurisdiction ?? 'global') !== configuredComposition.jurisdiction) {
      throw configError('mcp_owner_unavailable', 'Trial execution Durable Object identity is invalid');
    }
    const stub = driveNs.get(id);
    if (!stub || typeof stub.executeMcpTrial !== 'function') {
      throw configError('mcp_owner_unavailable', 'Trial execution Durable Object RPC is unavailable');
    }
    return stub.executeMcpTrial({ operation, input });
  };
  const caseSnapshotOwner = (snapshot) => Object.freeze({
    snapshot: () => canonicalClone(snapshot),
  });
  const repository = Object.freeze({
    create: async (input = {}) => {
      assertTrialCaseId(input?.caseId);
      return caseSnapshotOwner(await invokeExecution(input.caseId, 'repository.create', input));
    },
    load: async (caseId) => {
      assertTrialCaseId(caseId);
      return caseSnapshotOwner(await invokeExecution(caseId, 'repository.load', { caseId }));
    },
    command: async (caseId, envelope) => {
      assertTrialCaseId(caseId);
      return invokeExecution(caseId, 'repository.command', { caseId, envelope });
    },
  });
  const runner = Object.freeze({
    create: (input = {}) => {
      assertTrialCaseId(input?.caseId);
      return invokeExecution(input.caseId, 'runner.create', input);
    },
    drive: (input = {}) => {
      assertTrialCaseId(input?.caseId);
      return invokeExecution(input.caseId, 'runner.drive', input);
    },
    candidate: (caseId) => {
      assertTrialCaseId(caseId);
      return invokeExecution(caseId, 'runner.candidate', { caseId });
    },
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
    developmentUnitStart: async (input = {}) => {
      assertTrialCaseId(input?.caseId);
      return invokeExecution(input.caseId, 'developmentUnitStart', input);
    },
    developmentContextGet: async ({ selector = null } = {}) => {
      assertContextSelector(selector);
      return context;
    },
    developmentContextResolve: async ({ selector = null, identity } = {}) => {
      assertContextSelector(selector);
      throw configError('mcp_owner_unavailable', 'Full development context resolution is available only inside the execution Durable Object');
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

let lightApplicationPromise = null;

async function lightApplication(env) {
  if (lightApplicationPromise === null) {
    lightApplicationPromise = Promise.resolve().then(() => createTrialLightApplication(env));
  }
  return lightApplicationPromise;
}

export default {
  async fetch(request, env) {
    emitRequestDiagnostic('received', request);
    const url = new URL(request.url);
    if (url.pathname === '/__tdev_rpc_probe') {
      const expected = typeof env.TDEV_RPC_PROBE_TOKEN === 'string' ? env.TDEV_RPC_PROBE_TOKEN : '';
      const authorization = request.headers.get('authorization') ?? '';
      if (expected.length < 32 || authorization !== `Bearer ${expected}`) return new Response('Not found', { status: 404 });
      const caseId = url.searchParams.get('caseId') ?? '';
      const operation = url.searchParams.get('operation') ?? 'repository.load';
      try {
        const configuredComposition = normalizeMcpTrialCompositionBinding(readJsonBinding(env, TRIAL_MANIFEST_BINDING));
        if (!caseId.startsWith(configuredComposition.casePrefix)) return jsonResponse(400, { ok: false, error: { code: 'probe_case_scope_denied' } });
        const driveNs = namespaceFor(env.TDEV_CASE_AGENT_DRIVE, configuredComposition.jurisdiction, 'Case-Agent drive');
        const id = driveNs.idFromName(caseId);
        const stub = driveNs.get(id);
        if (!stub || typeof stub.diagnoseMcpTrial !== 'function') return jsonResponse(500, { ok: false, error: { code: 'probe_drive_rpc_unavailable' } });
        const input = operation === 'repository.load' ? { caseId } : { caseId };
        const result = await stub.diagnoseMcpTrial({ operation, input });
        return jsonResponse(200, result);
      } catch (error) {
        return jsonResponse(500, { ok: false, error: {
          name: typeof error?.name === 'string' ? error.name : null,
          code: typeof error?.code === 'string' ? error.code : null,
          message: typeof error?.message === 'string' ? error.message : String(error),
        } });
      }
    }
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
