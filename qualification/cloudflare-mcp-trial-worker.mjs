import {
  canonicalClone,
  canonicalJson,
  digest,
  isPlainRecord,
  strictJsonParse,
  typedDigest,
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
  loadMcpTrialLazyContext,
  MCP_TRIAL_BASE_COMMIT_OID,
  MCP_TRIAL_BASE_TREE_OID,
  MCP_TRIAL_BASE_OBJECT_FORMAT,
  MCP_TRIAL_BASE_DIGEST,
  MCP_TRIAL_REPOSITORY_BASE_IDENTITY,
  MCP_TRIAL_SCOPE,
  MCP_TRIAL_SCOPE_DIGEST,
  MCP_TRIAL_MANIFEST_DIGEST,
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
  if (MCP_TRIAL_BASE_TREE_OID !== null && MCP_TRIAL_BASE_TREE_OID !== composition.repository.repositoryBaseIdentity?.treeOid) {
    throw configError('mcp_config_unavailable', 'Generated base-tree module tree identity does not match the trial composition');
  }
  if (MCP_TRIAL_BASE_OBJECT_FORMAT !== null && MCP_TRIAL_BASE_OBJECT_FORMAT !== composition.repository.objectFormat) {
    throw configError('mcp_config_unavailable', 'Generated base-tree module object format does not match the trial composition');
  }
  if (MCP_TRIAL_REPOSITORY_BASE_IDENTITY !== null && canonicalJson(MCP_TRIAL_REPOSITORY_BASE_IDENTITY) !== canonicalJson(composition.repository.repositoryBaseIdentity)) {
    throw configError('mcp_config_unavailable', 'Generated module complete repository identity does not match the trial composition');
  }
  if (MCP_TRIAL_SCOPE_DIGEST !== null && MCP_TRIAL_SCOPE_DIGEST !== composition.repository.scopeDigest) {
    throw configError('mcp_config_unavailable', 'Generated module scope digest does not match the trial composition');
  }
  if (MCP_TRIAL_MANIFEST_DIGEST !== null && MCP_TRIAL_MANIFEST_DIGEST !== composition.repository.repositoryBaseIdentity?.manifestDigest) {
    throw configError('mcp_config_unavailable', 'Generated module manifest digest does not match the trial composition');
  }
  if (MCP_TRIAL_SCOPE !== null && canonicalJson(MCP_TRIAL_SCOPE) !== canonicalJson(composition.repository.scope)) {
    throw configError('mcp_config_unavailable', 'Generated module scope does not match the trial composition');
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
    ...(context.contextProfile === undefined ? {} : { contextProfile: context.contextProfile }),
    ...(context.contextScope === undefined ? {} : { contextScope: context.contextScope }),
    ...(context.scopeDigest === undefined ? {} : { scopeDigest: context.scopeDigest }),
    ...(context.baseIdentity === undefined ? {} : { baseIdentity: context.baseIdentity }),
    ...(context.repositoryBaseIdentity === undefined ? {} : { repositoryBaseIdentity: context.repositoryBaseIdentity }),
    ...(context.contextCapabilityId === undefined ? {} : { contextCapabilityId: context.contextCapabilityId }),
    ...(context.modelCapabilityId === undefined ? {} : { modelCapabilityId: context.modelCapabilityId }),
    ...(context.validationCapabilityId === undefined ? {} : { validationCapabilityId: context.validationCapabilityId }),
  });
}

function generatedContextOwner(composition, lazyContext) {
  if (!isPlainRecord(lazyContext) || !isPlainRecord(lazyContext.tree) || !Array.isArray(lazyContext.manifest)) {
    throw configError('mcp_config_unavailable', 'Generated lazy context payload is invalid');
  }
  const repository = composition.repository;
  const identity = repository.repositoryBaseIdentity;
  const expectedManifest = typedDigest('tdev.repository-context.git-manifest.v1', {
    schemaVersion: 1,
    profile: 'tdev.repository-context.git-manifest.v1',
    objectFormat: repository.objectFormat,
    commitOid: repository.commitOid,
    treeOid: identity.treeOid,
    entries: lazyContext.manifest.map(({ path, mode, type, blobOid, byteLength }) => ({ path, mode, type, blobOid, byteLength })),
  });
  if (expectedManifest !== identity.manifestDigest || lazyContext.manifestDigest !== identity.manifestDigest) {
    throw configError('mcp_config_unavailable', 'Generated lazy context manifest digest is invalid');
  }
  if (lazyContext.commitOid !== repository.commitOid || lazyContext.treeOid !== identity.treeOid ||
      lazyContext.objectFormat !== repository.objectFormat || lazyContext.semanticBaseDigest !== repository.baseDigest ||
      lazyContext.scopeDigest !== repository.scopeDigest || canonicalJson(lazyContext.scope) !== canonicalJson(repository.scope)) {
    throw configError('mcp_config_unavailable', 'Generated lazy context identity does not match the trial composition');
  }
  const selectedEntries = lazyContext.manifest.filter((entry) => Object.hasOwn(lazyContext.tree, entry.path));
  const selectedPaths = selectedEntries.map((entry) => entry.path).sort();
  const treePaths = Object.keys(lazyContext.tree).sort();
  const selectedByScope = (filePath) => repository.scope.paths.includes(filePath) || repository.scope.prefixes.some((prefix) => filePath === prefix || filePath.startsWith(`${prefix}/`));
  if (canonicalJson(selectedPaths) !== canonicalJson(treePaths) || selectedEntries.length === 0 ||
      selectedEntries.some((entry) => !selectedByScope(entry.path)) || digest(lazyContext.tree) !== repository.baseDigest) {
    throw configError('mcp_config_unavailable', 'Generated lazy context selected tree does not match its manifest');
  }
  const context = composition.repository.context;
  const selector = (value) => {
    if (value !== null && value !== repository.contextReference) throw configError('mcp_trial_context_scope_denied', 'Context selector is outside the fixed trial reference');
  };
  const selected = () => selectedEntries.map((entry) => canonicalClone(entry));
  return Object.freeze({
    async developmentContextGet({ selector: selectedReference = null } = {}) {
      selector(selectedReference);
      return compactContext(composition);
    },
    async developmentContextResolve({ selector: selectedReference = null } = {}) {
      selector(selectedReference);
      return canonicalClone({
        ...context,
        baseTree: lazyContext.tree,
        manifest: lazyContext.manifest,
        repositoryBaseIdentity: identity,
        contextScope: repository.scope,
        scopeDigest: repository.scopeDigest,
      });
    },
    async developmentContextList({ contextReference: selectedReference, cursor = 0, limit = 128 } = {}) {
      selector(selectedReference);
      if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 128) throw configError('mcp_context_limit_invalid', 'Context list bounds are invalid');
      const entries = selected().slice(cursor, cursor + limit);
      const nextCursor = cursor + entries.length < selectedEntries.length ? cursor + entries.length : null;
      return { profile: 'tdev.repository-context.git-scoped-lazy.v1', manifestDigest: identity.manifestDigest, scopeDigest: repository.scopeDigest, entries, nextCursor, complete: nextCursor === null };
    },
    async developmentContextSearch({ contextReference: selectedReference, pattern, cursor = 0, limit = 64 } = {}) {
      selector(selectedReference);
      if (typeof pattern !== 'string' || pattern.length === 0 || pattern.length > 4096 || !Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > repository.scope.maxSearchResults) throw configError('mcp_context_limit_invalid', 'Context search bounds are invalid');
      const matches = [];
      let visitedFiles = 0;
      let visitedBytes = 0;
      let index = cursor;
      let complete = true;
      while (index < selectedEntries.length) {
        if (matches.length >= limit) { complete = false; break; }
        const entry = selectedEntries[index++];
        const content = lazyContext.tree[entry.path];
        const size = new TextEncoder().encode(content).byteLength;
        if (visitedBytes + size > repository.scope.maxBytes) { complete = false; break; }
        visitedFiles += 1;
        visitedBytes += size;
        if (content.includes(pattern)) matches.push(entry.path);
      }
      return { profile: 'tdev.repository-context.git-scoped-lazy.v1', manifestDigest: identity.manifestDigest, scopeDigest: repository.scopeDigest, matches, nextCursor: complete ? null : index, complete, visitedFiles, visitedBytes };
    },
    async developmentContextRead({ contextReference: selectedReference, path: filePath, startByte = 0, maxBytes = repository.scope.maxBytes } = {}) {
      selector(selectedReference);
      const entry = selectedEntries.find((item) => item.path === filePath);
      if (entry === undefined) throw configError('lazy_scope_denied', 'Path is outside the owner-issued lazy scope');
      if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode) || entry.byteLength === null) throw configError('lazy_entry_read_unsupported', 'Selected repository entry cannot be decoded');
      if (!Number.isSafeInteger(startByte) || startByte < 0 || startByte > entry.byteLength || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > repository.scope.maxBytes) throw configError('lazy_read_limit_exceeded', 'Lazy read range is outside its bound');
      const bytes = new TextEncoder().encode(lazyContext.tree[filePath]);
      const endByte = Math.min(entry.byteLength, startByte + maxBytes);
      let content;
      try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(startByte, endByte)); }
      catch { throw configError('lazy_read_range_not_utf8', 'Lazy read range is not a complete UTF-8 sequence'); }
      return { profile: 'tdev.repository-context.git-scoped-lazy.v1', path: filePath, mode: entry.mode, type: entry.type, blobOid: entry.blobOid, byteLength: entry.byteLength, startByte, endByte, complete: endByte === entry.byteLength, content };
    },
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
  const lazyContext = await loadMcpTrialLazyContext();
  const baseTree = lazyContext.tree;
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
    contextOwnerOverride: generatedContextOwner(composition, lazyContext),
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
      developmentContextList: facades.contextOwner.developmentContextList,
      developmentContextSearch: facades.contextOwner.developmentContextSearch,
      developmentContextRead: facades.contextOwner.developmentContextRead,
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
  let contextOwnerPromise = null;
  const lazyContextOwner = async () => {
    if (contextOwnerPromise === null) {
      contextOwnerPromise = Promise.resolve().then(async () => generatedContextOwner(
        configuredComposition,
        await loadMcpTrialLazyContext(),
      ));
    }
    return contextOwnerPromise;
  };
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
    developmentContextList: async (input = {}) => (await lazyContextOwner()).developmentContextList(input),
    developmentContextSearch: async (input = {}) => (await lazyContextOwner()).developmentContextSearch(input),
    developmentContextRead: async (input = {}) => (await lazyContextOwner()).developmentContextRead(input),
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
