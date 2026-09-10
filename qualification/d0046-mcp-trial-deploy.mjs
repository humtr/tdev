import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  CloudflareApiClient,
  collectWorkerModules,
  createWorkerUploadForm,
  loadCloudflareCredentials,
  parseCloudflareEnv,
} from './cloudflare-casedo-api.mjs';
import { buildMcpTrialBaseTreeModule } from './mcp-trial-base-tree-builder.mjs';
import {
  MCP_AUTH_PROFILE,
  normalizeMcpAuthManifest,
  validateMcpAuthorizationServerMetadata,
  validateMcpProtectedResourceMetadata,
} from '../src/mcp-auth.mjs';
import {
  MCP_SURFACE_PROFILE,
  createMcpSurfaceManifest,
} from '../src/mcp-surface.mjs';
import {
  MCP_TRIAL_AGENT_CLASS_NAME,
  MCP_TRIAL_AGENT_RPC_PROFILE,
  MCP_TRIAL_CASE_CLASS_NAME,
  MCP_TRIAL_COMPOSITION_PROFILE,
  MCP_TRIAL_COMPOSITION_RESOURCE,
  MCP_TRIAL_DRIVE_CLASS_NAME,
  normalizeMcpTrialCompositionBinding,
  normalizeMcpTrialCompositionManifest,
} from '../src/mcp-trial-composition.mjs';
import { normalizeDevelopmentOperationManifest } from '../src/development-operation-profile.mjs';
import {
  developmentOperationCatalogDigest,
  normalizeDevelopmentOperationCatalog,
} from '../src/development-operation-catalog.mjs';
import { canonicalClone, canonicalJson, digest } from '../src/canonical.mjs';
import { agentRouteHostKey } from '../src/agent-route-election.mjs';
import { scopeDigest as lazyScopeDigest } from '../src/lazy-plan-reference.mjs';
import { createQualificationRpc } from './d0046-agent-preserving-update.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const D0046_MCP_TRIAL_SCRIPT = 'tdev-mcp-trial';
export const D0046_MCP_TRIAL_SUBDOMAIN = 'humtr';
export const D0046_MCP_TRIAL_RESOURCE = MCP_TRIAL_COMPOSITION_RESOURCE;
export const D0046_MCP_TRIAL_ORIGIN = `https://${D0046_MCP_TRIAL_SCRIPT}.${D0046_MCP_TRIAL_SUBDOMAIN}.workers.dev`;
export const D0046_MCP_TRIAL_DOMAIN = `${D0046_MCP_TRIAL_SCRIPT}.${D0046_MCP_TRIAL_SUBDOMAIN}.workers.dev/mcp`;
export const D0046_ACCESS_ISSUER = 'https://humtr.cloudflareaccess.com';
export const D0046_ACCESS_JWKS_URI = `${D0046_ACCESS_ISSUER}/cdn-cgi/access/certs`;
export const D0046_ACCESS_IDP = '8845fb76-2486-433f-892c-39398f70bfae';
export const D0046_CASE_SCRIPT = 'tdev-d0020-composition-case-r1';
export const D0046_CASE_NAMESPACE = '3b3d5808028f4e74bcbc1dc22f0757fd';
export const D0046_AGENT_SCRIPT = 'tdev-d0020-qualification-clean-a';
export const D0046_AGENT_NAMESPACE = '0dad69baa7154d00949f88c8b8dbf94a';
export const D0046_AGENT_ID = 'd0039-r12-custody-20260828-3631c5a4';
export const D0046_AGENT_ROUTE_GENERATION = 1;
export const D0046_CASE_PLACEMENT_DATABASE = 'ff868f84-4fa3-4d3d-9024-8a1eec7b0c79';
export const D0046_ACCESS_APP_NAME = 'tdev MCP trial 20260904';
export const D0046_CASE_PREFIX = 'tdev-trial-';
export const D0046_WORKER_COMPATIBILITY_DATE = '2026-08-15';
export const D0046_WORKER_MAIN_MODULE = 'qualification/cloudflare-mcp-trial-worker.mjs';
export const D0046_OPERATION_CONFIG = 'config/development-operation-profiles.json';
export const D0046_OPERATION_CATALOG_CONFIG = 'config/development-operation-catalog.json';
export const D0046_EVIDENCE_PATH = 'docs/evidence/group-f-d0046-r1-m1-provider-trial-deploy-2026-09-04.json';
export const D0046_MIN_CASE_AUTHORITATIVE_BYTES = 11_419_628;
export const D0046_QUALIFIED_CASE_AUTHORITATIVE_BYTES = 16 * 1024 * 1024;
// The owner-issued self-development context stays explicitly bounded while
// exposing the current Directive/route plus the existing D0046 release path
// needed to implement Directive r3 P1 through tdev itself. The complete
// repository manifest and base identity remain bound separately.
export const D0046_MCP_CONTEXT_SCOPE = Object.freeze({
  schemaVersion: 1,
  profile: 'tdev.repository-context-scope.v1',
  paths: Object.freeze([
    'DIRECTIVE.md',
    'WORKBOARD.md',
    'docs/design/0046-minimum-viable-tdev-mcp-experiential-path.md',
    'qualification/d0046-mcp-trial-deploy.mjs',
    'qualification/d0046-agent-preserving-update.mjs',
    'qualification/mcp-trial-base-tree-builder.mjs',
    'test/d0046-mcp-trial-deploy.test.mjs',
    'src/mcp-trial-composition.mjs',
  ]),
  prefixes: Object.freeze([]),
  maxFiles: 8,
  maxBytes: 1024 * 1024,
  maxSearchResults: 16,
});
export const D0046_CASE_SOURCE_SHAS = Object.freeze([
  '2bb20fbc099bfeeb09d4cafa05eac20f88c97729',
  '3122ca9818e5e6b742491e8076721d68da131c50',
  '746a09d4643bf268d9f4204304217e3309763422',
  'e5977a1abd95d90a7fc2039ab990d3550e1386f0',
  '672b253c8673bbb7e8bd6b40fa85a6148fda99c2',
]);

const API_ORIGIN = 'https://api.cloudflare.com/client/v4';
const MAX_PUBLIC_RESPONSE_BYTES = 1024 * 1024;

function fail(code, message, details = undefined, options = undefined) {
  const error = new Error(message, options);
  error.code = code;
  if (details !== undefined) error.details = details;
  throw error;
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function plain(name, text) {
  return { type: 'plain_text', name, text: String(text) };
}

function bindingByName(value, name) {
  const bindings = value?.version?.resources?.bindings ?? value?.resources?.bindings ?? value?.bindings ?? [];
  return Array.isArray(bindings) ? bindings.find((binding) => binding?.name === name) : undefined;
}

export function existingTrialIdentity(settings) {
  const binding = bindingByName(settings, 'TDEV_MCP_TRIAL_MANIFEST_JSON');
  if (binding?.type !== 'plain_text' || typeof binding.text !== 'string') {
    fail('d0046_update_binding_invalid', 'Existing Trial composition binding is missing or not plain text');
  }
  let parsed;
  try { parsed = JSON.parse(binding.text); }
  catch { fail('d0046_update_binding_invalid', 'Existing Trial composition binding is not JSON'); }
  return normalizeMcpTrialCompositionBinding(parsed).identity;
}

function assertText(value, label, maxBytes = 4096) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || Buffer.byteLength(value, 'utf8') > maxBytes) {
    fail('d0046_deploy_input_invalid', `${label} is outside its bound`);
  }
  return value;
}

function assertUuid(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    fail('d0046_provider_identity_invalid', `${label} is not a UUID`);
  }
  return value;
}

function assertNamespaceId(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || value.length > 256) {
    fail('d0046_provider_identity_invalid', `${label} is not a bounded namespace identifier`);
  }
  return value;
}

function assertAccessAudience(value) {
  return assertText(value, 'Access application audience', 512);
}

function assertTrackedSource(repositoryPath) {
  const status = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: repositoryPath,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const trackedChanges = status.split(/\r?\n/u).filter((line) => line.length > 0 && !line.startsWith('?? '));
  if (trackedChanges.length !== 0) {
    fail('d0046_source_worktree_dirty', 'D0046 Worker deployment requires a clean tracked source tree', { trackedChanges });
  }
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryPath,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  if (!/^[0-9a-f]{40}$/u.test(sourceSha)) fail('d0046_source_sha_invalid', 'Current source HEAD is not a full Git SHA');
  return sourceSha;
}

function artifactManifest(modules) {
  const entries = [...modules].map(([name, source]) => ({ name, sourceDigest: sha256(source) }));
  return Object.freeze({
    moduleDigest: (() => {
      const hash = createHash('sha256');
      for (const [name, source] of modules) hash.update(name).update('\0').update(source).update('\0');
      return `sha256:${hash.digest('hex')}`;
    })(),
    artifactManifestDigest: sha256(canonicalJson({ mainModule: D0046_WORKER_MAIN_MODULE, modules: entries })),
    moduleCount: entries.length,
    modules: entries,
  });
}

function normalizedOperationManifest(raw) {
  return normalizeDevelopmentOperationManifest(raw);
}

function normalizedOperationCatalog() {
  const source = readFileSync(path.join(repositoryRoot, D0046_OPERATION_CATALOG_CONFIG), 'utf8');
  return normalizeDevelopmentOperationCatalog(JSON.parse(source));
}

function accessManifest(audience) {
  return normalizeMcpAuthManifest({
    schemaVersion: 1,
    profile: MCP_AUTH_PROFILE,
    mcpResource: D0046_MCP_TRIAL_RESOURCE,
    authorizationServerIssuer: D0046_ACCESS_ISSUER,
    accessApplicationAudience: assertAccessAudience(audience),
    jwksUri: D0046_ACCESS_JWKS_URI,
    principalClaim: 'email',
    tenantClaim: 'email',
    clientRegistrationMode: 'dynamic',
    allowedRedirectUris: ['https://chatgpt.com/connector/oauth/*'],
    requiredPkceMethod: 'S256',
    tokenHeaderMode: 'access-managed-opaque-to-edge-assertion',
  });
}

function identityManifest() {
  const principalId = process.env.TDEV_D0046_ACCESS_PRINCIPAL;
  const tenantId = process.env.TDEV_D0046_ACCESS_TENANT ?? principalId;
  assertText(principalId, 'TDEV_D0046_ACCESS_PRINCIPAL', 256);
  assertText(tenantId, 'TDEV_D0046_ACCESS_TENANT', 256);
  return Object.freeze({ principalId, tenantId });
}

async function readCanonicalAgentRouteBinding(envFile) {
  const values = parseCloudflareEnv(readFileSync(envFile, 'utf8'));
  const token = values.TDEV_D0020_QUALIFICATION_TOKEN;
  assertText(token, 'TDEV_D0020_QUALIFICATION_TOKEN', 4096);
  const provider = createQualificationRpc({ token });
  const routeRead = await provider('read');
  const binding = routeRead?.routeBinding;
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
    fail('d0046_agent_route_binding_missing', 'Agent provider read did not expose the canonical route binding');
  }
  if (binding.agentId !== D0046_AGENT_ID ||
      binding.routeGeneration !== D0046_AGENT_ROUTE_GENERATION ||
      binding.workerScript !== D0046_AGENT_SCRIPT ||
      binding.deployment !== D0046_AGENT_SCRIPT ||
      binding.className !== MCP_TRIAL_AGENT_CLASS_NAME ||
      binding.namespace !== D0046_AGENT_NAMESPACE ||
      binding.jurisdiction !== 'global' ||
      typeof binding.durableObjectId !== 'string' || !/^[0-9a-f]{64}$/u.test(binding.durableObjectId)) {
    fail('d0046_agent_route_binding_mismatch', 'Agent provider route binding does not match the fixed Trial owner');
  }
  return Object.freeze({
    agentId: binding.agentId,
    routeGeneration: binding.routeGeneration,
    workerScript: binding.workerScript,
    deployment: binding.deployment,
    className: binding.className,
    namespace: binding.namespace,
    jurisdiction: binding.jurisdiction,
    durableObjectId: binding.durableObjectId,
  });
}

function trialComposition({ sourceSha, baseDigest, baseTree, repositoryBaseIdentity = null, scope = null, scopeDigest: suppliedScopeDigest = null, operationManifest, driveNamespace, identity, includeBaseTree = true, agentRouteBinding = null }) {
  const contextReference = `tdev-context-${sourceSha.slice(0, 12)}`;
  const revisionId = `tdev-mcp-${sourceSha.slice(0, 12)}`;
  const operationDigest = digest(operationManifest);
  const normalizedScopeDigest = scope === null ? null : suppliedScopeDigest ?? lazyScopeDigest(scope);
  const context = {
    revisionId,
    baseTree: includeBaseTree ? baseTree : {},
    repositoryCommitOid: sourceSha,
    objectFormat: 'sha1',
    contextReferenceId: contextReference,
    ...(scope === null ? {} : {
      contextProfile: 'tdev.repository.context.prepare.lazy.v1',
      contextScope: scope,
      scopeDigest: normalizedScopeDigest,
      ...(repositoryBaseIdentity === null ? {} : { baseIdentity: {
        schemaVersion: 1,
        profile: 'tdev.repository-base-identity.v1',
        objectFormat: repositoryBaseIdentity.objectFormat,
        commitOid: repositoryBaseIdentity.commitOid,
        treeOid: repositoryBaseIdentity.treeOid,
        baseDigest,
        manifestDigest: repositoryBaseIdentity.manifestDigest,
      } }),
      ...(repositoryBaseIdentity === null ? {} : { repositoryBaseIdentity }),
    }),
  };
  const body = {
    schemaVersion: 1,
    profile: MCP_TRIAL_COMPOSITION_PROFILE,
    resource: D0046_MCP_TRIAL_RESOURCE,
    workerScript: D0046_MCP_TRIAL_SCRIPT,
    environment: 'qualification',
    jurisdiction: 'global',
    caseOwner: {
      placement: {
        deployment: D0046_CASE_SCRIPT,
        environment: 'qualification',
        workerScript: D0046_CASE_SCRIPT,
        className: MCP_TRIAL_CASE_CLASS_NAME,
        namespace: D0046_CASE_NAMESPACE,
        jurisdiction: 'global',
      },
      d1Binding: 'TDEV_CASE_PLACEMENT',
      d1DatabaseId: D0046_CASE_PLACEMENT_DATABASE,
    },
    driveOwner: {
      placement: {
        deployment: D0046_MCP_TRIAL_SCRIPT,
        environment: 'qualification',
        workerScript: D0046_MCP_TRIAL_SCRIPT,
        className: MCP_TRIAL_DRIVE_CLASS_NAME,
        namespace: driveNamespace,
        jurisdiction: 'global',
      },
    },
    agentOwner: {
      placement: {
        deployment: D0046_AGENT_SCRIPT,
        environment: 'qualification',
        workerScript: D0046_AGENT_SCRIPT,
        className: MCP_TRIAL_AGENT_CLASS_NAME,
        namespace: D0046_AGENT_NAMESPACE,
        jurisdiction: 'global',
      },
      agentId: D0046_AGENT_ID,
      routeGeneration: D0046_AGENT_ROUTE_GENERATION,
      routeKey: agentRouteHostKey({ agentId: D0046_AGENT_ID, routeGeneration: D0046_AGENT_ROUTE_GENERATION }),
      ...(agentRouteBinding === null ? {} : { durableObjectId: agentRouteBinding.durableObjectId }),
    },
    repository: {
      commitOid: sourceSha,
      baseDigest,
      objectFormat: 'sha1',
      contextReference,
      context,
      ...(repositoryBaseIdentity === null ? {} : { repositoryBaseIdentity }),
      ...(scope === null ? {} : { scope, scopeDigest: normalizedScopeDigest }),
    },
    operation: {
      manifestDigest: operationDigest,
      contextProfile: scope === null ? 'tdev.repository.context.prepare.v1' : 'tdev.repository.context.prepare.lazy.v1',
      modelProfile: 'tdev.model.repository.execute.v1',
      validationProfile: 'tdev.repository.validate.v1',
    },
    identity,
    authProfile: MCP_AUTH_PROFILE,
    casePrefix: D0046_CASE_PREFIX,
    canonicalWriterEnabled: false,
    previewWritersEnabled: false,
  };
  return normalizeMcpTrialCompositionManifest(body);
}

export function buildTrialManifests({ sourceSha, baseDigest, baseTree, repositoryBaseIdentity = null, scope = null, scopeDigest: suppliedScopeDigest = null, operationManifest, driveNamespace = `pending-${D0046_MCP_TRIAL_SCRIPT}-drive`, accessAudience = 'pending-access-audience', identity = identityManifest(), includeBaseTree = true, agentRouteBinding = null } = {}) {
  if (!/^[0-9a-f]{40}$/u.test(sourceSha ?? '')) fail('d0046_source_sha_invalid', 'sourceSha must be a full Git SHA');
  const normalizedOperation = normalizedOperationManifest(operationManifest);
  const operationCatalog = normalizedOperationCatalog();
  const operationCatalogDigest = developmentOperationCatalogDigest(operationCatalog);
  const composition = trialComposition({ sourceSha, baseDigest, baseTree, repositoryBaseIdentity, scope, scopeDigest: suppliedScopeDigest, operationManifest: normalizedOperation, driveNamespace, identity, includeBaseTree, agentRouteBinding });
  const auth = accessManifest(accessAudience);
  const buildDigest = digest({
    profile: 'tdev.mcp.trial.build.v1',
    compositionDigest: composition.manifestDigest,
    authProfileDigest: auth.profileDigest,
    operationManifestDigest: digest(normalizedOperation),
    developmentOperationCatalogDigest: operationCatalogDigest,
  });
  const surface = createMcpSurfaceManifest({ buildDigest });
  return Object.freeze({
    composition,
    auth,
    operation: normalizedOperation,
    operationDigest: digest(normalizedOperation),
    operationCatalog,
    operationCatalogDigest,
    surface,
    surfaceDigest: surface.surfaceDigest,
    buildDigest,
  });
}

function configBindingManifests(manifests) {
  const composition = canonicalClone(manifests.composition);
  composition.repository.context = { ...composition.repository.context, baseTree: {} };
  return Object.freeze({
    composition: canonicalJson(composition),
    auth: canonicalJson(manifests.auth),
    operation: canonicalJson(manifests.operation),
    operationCatalog: canonicalJson(manifests.operationCatalog),
  });
}

export function buildWorkerMetadata({ manifests, sourceSha, artifact, driveNamespace = null, bootstrap = false } = {}) {
  if (!manifests?.composition || !manifests?.auth || !manifests?.operation || !manifests?.operationCatalog) fail('d0046_metadata_invalid', 'Worker metadata requires all trial manifests');
  const config = configBindingManifests(manifests);
  const driveText = driveNamespace ?? `pending-${D0046_MCP_TRIAL_SCRIPT}-drive`;
  const bindings = [
    {
      type: 'durable_object_namespace',
      name: 'TDEV_CASE_AUTHORITY',
      class_name: MCP_TRIAL_CASE_CLASS_NAME,
      script_name: D0046_CASE_SCRIPT,
    },
    {
      type: 'durable_object_namespace',
      name: 'TDEV_CASE_AGENT_DRIVE',
      class_name: MCP_TRIAL_DRIVE_CLASS_NAME,
      ...(driveNamespace === null ? {} : { namespace_id: driveNamespace }),
    },
    {
      type: 'durable_object_namespace',
      name: 'TDEV_AGENT_DELIVERY',
      class_name: MCP_TRIAL_AGENT_CLASS_NAME,
      script_name: D0046_AGENT_SCRIPT,
    },
    { type: 'd1', name: 'TDEV_CASE_PLACEMENT', database_id: D0046_CASE_PLACEMENT_DATABASE },
    { type: 'version_metadata', name: 'TDEV_WORKER_VERSION' },
    plain('TDEV_MCP_TRIAL_MANIFEST_JSON', config.composition),
    plain('TDEV_MCP_AUTH_MANIFEST_JSON', config.auth),
    plain('TDEV_MCP_OPERATION_MANIFEST_JSON', config.operation),
    plain('TDEV_MCP_DEVELOPMENT_OPERATION_CATALOG_JSON', config.operationCatalog),
    plain('TDEV_MCP_CANONICAL_WRITER_ENABLED', 'false'),
    plain('TDEV_MCP_PREVIEW_WRITERS_ENABLED', 'false'),
    plain('TDEV_MCP_TRIAL_RESOURCE', D0046_MCP_TRIAL_RESOURCE),
    plain('TDEV_MCP_CASE_NAMESPACE', D0046_CASE_NAMESPACE),
    plain('TDEV_MCP_DRIVE_NAMESPACE', driveText),
    plain('TDEV_MCP_AGENT_NAMESPACE', D0046_AGENT_NAMESPACE),
    plain('TDEV_MCP_AGENT_ID', manifests.composition.agentOwner.agentId),
    plain('TDEV_MCP_AGENT_ROUTE_GENERATION', manifests.composition.agentOwner.routeGeneration),
    plain('TDEV_MCP_AGENT_RPC_PROFILE', MCP_TRIAL_AGENT_RPC_PROFILE),
    plain('TDEV_MCP_REPOSITORY_COMMIT', sourceSha),
    plain('TDEV_MCP_BASE_DIGEST', manifests.composition.repository.baseDigest),
    plain('TDEV_MCP_SURFACE_DIGEST', manifests.surfaceDigest),
    plain('TDEV_D0046_DEPLOYMENT_EPOCH', 'd0046-r1-m1-20260904'),
    plain('TDEV_D0046_ARTIFACT_DIGEST', artifact.moduleDigest),
    plain('TDEV_D0046_ARTIFACT_MANIFEST_DIGEST', artifact.artifactManifestDigest),
    plain('TDEV_D0046_INGRESS_KIND', 'workers_dev'),
    plain('TDEV_D0046_QUALIFICATION_MODE', 'enabled'),
    plain('TDEV_DEPLOYMENT', D0046_MCP_TRIAL_SCRIPT),
    plain('TDEV_ENVIRONMENT', 'qualification'),
    plain('TDEV_SOURCE_SHA', sourceSha),
    plain('TDEV_WORKER_SCRIPT', D0046_MCP_TRIAL_SCRIPT),
  ];
  return {
    main_module: D0046_WORKER_MAIN_MODULE,
    compatibility_date: D0046_WORKER_COMPATIBILITY_DATE,
    compatibility_flags: ['nodejs_compat'],
    annotations: {
      'workers/message': `D0046 isolated MCP trial ${sourceSha}`,
      'workers/tag': 'tdev-d0046-r1-mcp-trial-v1',
    },
    bindings,
    exports: {
      CaseAgentDriveRuntimeDO: { type: 'durable-object', storage: 'sqlite' },
    },
  };
}

export function accessApplicationPayload() {
  return {
    type: 'self_hosted',
    name: D0046_ACCESS_APP_NAME,
    domain: D0046_MCP_TRIAL_DOMAIN,
    session_duration: '24h',
    auto_redirect_to_identity: true,
    allowed_idps: [D0046_ACCESS_IDP],
    app_launcher_visible: false,
    enable_binding_cookie: false,
    http_only_cookie_attribute: true,
    oauth_configuration: {
      enabled: true,
      dynamic_client_registration: {
        enabled: true,
        allowed_uris: ['https://chatgpt.com/connector/oauth/*'],
        allow_any_on_localhost: false,
        allow_any_on_loopback: false,
      },
      grant: { session_duration: '168h', access_token_lifetime: '15m' },
    },
  };
}

export function accessPolicyPayload(accountId) {
  assertText(accountId, 'Cloudflare account ID', 64);
  return {
    decision: 'allow',
    name: `${D0046_ACCESS_APP_NAME} - account members`,
    include: [{ cloudflare_account_member: { account_id: accountId } }],
    exclude: [],
    require: [],
    precedence: 1,
  };
}

async function listResult(client, apiPath) {
  const response = await client.request('GET', apiPath);
  if (!Array.isArray(response.result)) fail('d0046_cloudflare_list_invalid', 'Cloudflare list response is not an array', { apiPath });
  const totalPages = Number(response.resultInfo?.total_pages ?? 1);
  const totalCount = Number(response.resultInfo?.total_count ?? response.result.length);
  if (totalPages !== 1 || totalCount !== response.result.length) {
    fail('d0046_cloudflare_list_incomplete', 'Cloudflare list response was not a complete single page', { apiPath, totalPages, totalCount, returned: response.result.length });
  }
  return response.result;
}

async function listNamespaces(client) {
  return listResult(client, client.accountPath('/workers/durable_objects/namespaces?per_page=1000'));
}

async function listAccessApps(client) {
  return listResult(client, client.accountPath('/access/apps?per_page=1000'));
}

async function workerSettings(client, scriptName, allowNotFound = false) {
  return client.request('GET', client.accountPath(`/workers/scripts/${encodeURIComponent(scriptName)}/settings`), { allowNotFound });
}

async function uploadWorker(client, modules, metadata) {
  const response = await client.request('PUT', client.accountPath(`/workers/scripts/${encodeURIComponent(D0046_MCP_TRIAL_SCRIPT)}`), {
    body: createWorkerUploadForm(metadata, modules),
    timeoutMs: 120_000,
  });
  return response.result;
}

async function setSubdomain(client, enabled) {
  const response = await client.request('POST', client.accountPath(`/workers/scripts/${encodeURIComponent(D0046_MCP_TRIAL_SCRIPT)}/subdomain`), {
    json: { enabled, previews_enabled: false },
  });
  if (response.result?.enabled !== enabled || response.result?.previews_enabled !== false) {
    fail('d0046_subdomain_readback_mismatch', 'Trial Worker subdomain state did not match the requested state');
  }
  return response.result;
}

function assertSelfOwnerBinding(settings, scriptName, className, namespaceId, label) {
  const binding = bindingByName(settings, label);
  if (binding?.type !== 'durable_object_namespace' || binding.class_name !== className || binding.namespace_id !== namespaceId) {
    fail('d0046_owner_binding_mismatch', `${scriptName} ${label} binding did not match its fixed owner`, { scriptName, label });
  }
}

function assertExternalOwnerBinding(settings, ownerScriptName, className, label) {
  const binding = bindingByName(settings, label);
  if (binding?.type !== 'durable_object_namespace' || binding.class_name !== className || binding.script_name !== ownerScriptName) {
    fail('d0046_owner_binding_mismatch', `${ownerScriptName} ${label} external binding did not match its fixed owner`, { ownerScriptName, label });
  }
}

function assertOwnerMarker(settings, scriptName) {
  for (const [name, text] of [['TDEV_DEPLOYMENT', scriptName], ['TDEV_ENVIRONMENT', 'qualification'], ['TDEV_WORKER_SCRIPT', scriptName]]) {
    const binding = bindingByName(settings, name);
    if (binding?.type !== 'plain_text' || binding.text !== text) fail('d0046_owner_binding_mismatch', `${scriptName} marker ${name} did not match`);
  }
}

export function assertCaseOwnerCapacity(settings, minimumBytes = D0046_MIN_CASE_AUTHORITATIVE_BYTES) {
  if (!Number.isSafeInteger(minimumBytes) || minimumBytes <= 0) fail('d0046_owner_capacity_invalid', 'Case capacity minimum must be a positive safe integer');
  const binding = bindingByName(settings, 'TDEV_CASEDO_MAX_AUTHORITATIVE_BYTES_PER_CASE');
  const raw = binding?.type === 'plain_text' ? binding.text : undefined;
  if (typeof raw !== 'string' || !/^[1-9][0-9]*$/u.test(raw)) {
    fail('d0046_owner_capacity_mismatch', 'Existing Case owner capacity binding was absent or not a canonical positive integer', { minimumBytes });
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < minimumBytes) {
    fail('d0046_owner_capacity_mismatch', 'Existing Case owner capacity is below the source-bound admission minimum', { requiredBytes: minimumBytes, configuredBytes: Number.isSafeInteger(parsed) ? parsed : null });
  }
  return parsed;
}

async function verifyExistingOwners(client) {
  const [caseSettings, agentSettings, namespaces] = await Promise.all([
    workerSettings(client, D0046_CASE_SCRIPT),
    workerSettings(client, D0046_AGENT_SCRIPT),
    listNamespaces(client),
  ]);
  assertOwnerMarker(caseSettings.result, D0046_CASE_SCRIPT);
  assertOwnerMarker(agentSettings.result, D0046_AGENT_SCRIPT);
  assertSelfOwnerBinding(caseSettings.result, D0046_CASE_SCRIPT, MCP_TRIAL_CASE_CLASS_NAME, D0046_CASE_NAMESPACE, 'TDEV_CASE_AUTHORITY');
  assertSelfOwnerBinding(agentSettings.result, D0046_AGENT_SCRIPT, MCP_TRIAL_AGENT_CLASS_NAME, D0046_AGENT_NAMESPACE, 'TDEV_AGENT_DELIVERY');
  assertCaseOwnerCapacity(caseSettings.result, D0046_QUALIFIED_CASE_AUTHORITATIVE_BYTES);
  const caseSource = bindingByName(caseSettings.result, 'TDEV_SOURCE_SHA');
  if (caseSource?.type !== 'plain_text' || !D0046_CASE_SOURCE_SHAS.includes(caseSource.text)) {
    fail('d0046_owner_binding_mismatch', 'Existing Case owner source identity was not one of the fixed qualified composition sources');
  }
  const writer = bindingByName(caseSettings.result, 'TDEV_CASEDO_WRITER_COMPATIBILITY_ID');
  if (writer?.type !== 'plain_text' || writer.text !== 'd0020-composition-r1') {
    fail('d0046_owner_binding_mismatch', 'Existing Case owner writer compatibility identity was not exact');
  }
  const qualificationSecret = bindingByName(caseSettings.result, 'TDEV_D0019_QUALIFICATION_TOKEN');
  if (qualificationSecret?.type !== 'secret_text') {
    fail('d0046_owner_binding_mismatch', 'Existing Case owner qualification secret binding was absent');
  }
  const caseNs = namespaces.filter((item) => item?.script === D0046_CASE_SCRIPT && item?.class === MCP_TRIAL_CASE_CLASS_NAME);
  const agentNs = namespaces.filter((item) => item?.script === D0046_AGENT_SCRIPT && item?.class === MCP_TRIAL_AGENT_CLASS_NAME);
  if (caseNs.length !== 1 || agentNs.length !== 1 || caseNs[0].id !== D0046_CASE_NAMESPACE || agentNs[0].id !== D0046_AGENT_NAMESPACE || caseNs[0].use_sqlite !== true || agentNs[0].use_sqlite !== true) {
    fail('d0046_owner_namespace_mismatch', 'Existing Case/Agent owner namespaces were not the exact SQLite resources');
  }
  const placement = bindingByName(caseSettings.result, 'TDEV_CASE_PLACEMENT');
  if (placement?.type !== 'd1' || placement.database_id !== D0046_CASE_PLACEMENT_DATABASE) fail('d0046_owner_d1_mismatch', 'Existing Case owner D1 binding was not exact');
}

async function waitForTrialNamespace(client) {
  let last = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const namespaces = await listNamespaces(client);
    const matches = namespaces.filter((item) => item?.script === D0046_MCP_TRIAL_SCRIPT && item?.class === MCP_TRIAL_DRIVE_CLASS_NAME);
    if (matches.length === 1 && typeof matches[0].id === 'string' && matches[0].use_sqlite === true) return matches[0];
    if (matches.length > 1) fail('d0046_trial_namespace_ambiguous', 'Trial Worker produced multiple drive namespaces');
    last = matches.length;
    if (attempt < 19) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  fail('d0046_trial_namespace_missing', 'Trial Worker drive namespace was not visible after bounded readback', { matches: last });
}

async function latestVersion(client) {
  const versions = await client.request('GET', client.accountPath(`/workers/scripts/${encodeURIComponent(D0046_MCP_TRIAL_SCRIPT)}/versions?per_page=100`));
  const items = versions.result?.items;
  if (!Array.isArray(items) || items.length === 0) fail('d0046_worker_version_missing', 'Trial Worker has no version readback');
  const highest = Math.max(...items.map((item) => Number(item.number)));
  const matches = items.filter((item) => Number(item.number) === highest);
  if (matches.length !== 1 || typeof matches[0].id !== 'string') fail('d0046_worker_version_ambiguous', 'Trial Worker latest version is ambiguous');
  const detail = await client.request('GET', client.accountPath(`/workers/scripts/${encodeURIComponent(D0046_MCP_TRIAL_SCRIPT)}/versions/${encodeURIComponent(matches[0].id)}`));
  if (detail.result?.id !== matches[0].id || Number(detail.result?.number) !== highest) fail('d0046_worker_version_mismatch', 'Trial Worker latest version detail disagreed with list');
  return detail.result;
}

export async function workerReadback(client) {
  const settings = await workerSettings(client, D0046_MCP_TRIAL_SCRIPT);
  const version = await latestVersion(client);
  const deployments = await client.request('GET', client.accountPath(`/workers/scripts/${encodeURIComponent(D0046_MCP_TRIAL_SCRIPT)}/deployments`));
  const entries = deployments.result?.deployments;
  if (!Array.isArray(entries) || entries.length === 0) fail('d0046_worker_deployments_missing', 'Trial Worker deployment readback is empty');
  const active = entries.find((entry) => Array.isArray(entry.versions) && entry.versions.some((item) => item?.version_id === version.id));
  if (!active) fail('d0046_worker_traffic_mismatch', 'Trial Worker deployment readback did not reference the latest version');
  if (!Array.isArray(active.versions) || active.versions.length !== 1 || active.versions[0].percentage !== 100 || active.versions[0].version_id !== version.id) {
    fail('d0046_worker_traffic_mismatch', 'Trial Worker traffic is not one hundred percent on the latest version');
  }
  return { settings: settings.result, version, deployments: entries };
}

function validateTrialWorkerSettings(settings, version, manifests, sourceSha, artifact) {
  assertOwnerMarker(settings, D0046_MCP_TRIAL_SCRIPT);
  assertExternalOwnerBinding(settings, D0046_CASE_SCRIPT, MCP_TRIAL_CASE_CLASS_NAME, 'TDEV_CASE_AUTHORITY');
  assertExternalOwnerBinding(settings, D0046_AGENT_SCRIPT, MCP_TRIAL_AGENT_CLASS_NAME, 'TDEV_AGENT_DELIVERY');
  const d1 = bindingByName(settings, 'TDEV_CASE_PLACEMENT');
  if (d1?.type !== 'd1' || d1.database_id !== D0046_CASE_PLACEMENT_DATABASE) fail('d0046_worker_binding_mismatch', 'Trial Worker D1 binding was not exact');
  const drive = bindingByName(settings, 'TDEV_CASE_AGENT_DRIVE');
  if (drive?.type !== 'durable_object_namespace' || drive.class_name !== MCP_TRIAL_DRIVE_CLASS_NAME || typeof drive.namespace_id !== 'string') fail('d0046_worker_binding_mismatch', 'Trial Worker drive binding was not a stable SQLite namespace');
  const source = bindingByName(settings, 'TDEV_SOURCE_SHA');
  const base = bindingByName(settings, 'TDEV_MCP_BASE_DIGEST');
  const artifactDigest = bindingByName(settings, 'TDEV_D0046_ARTIFACT_DIGEST');
  if (source?.type !== 'plain_text' || source.text !== sourceSha || base?.text !== manifests.composition.repository.baseDigest || artifactDigest?.text !== artifact.moduleDigest) fail('d0046_worker_binding_mismatch', 'Trial Worker source/base/artifact markers did not match');
  const runtime = version?.resources?.script_runtime ?? settings?.script_runtime ?? settings;
  if (runtime?.compatibility_date !== D0046_WORKER_COMPATIBILITY_DATE || !runtime?.compatibility_flags?.includes('nodejs_compat')) fail('d0046_worker_runtime_mismatch', 'Trial Worker runtime compatibility did not match');
  if (runtime?.limits?.cpu_ms !== undefined) fail('d0046_worker_runtime_mismatch', 'Trial Worker must not declare a custom CPU limit on the Workers Free plan');
  if (runtime?.exports?.CaseAgentDriveRuntimeDO?.type !== 'durable-object' || runtime?.exports?.CaseAgentDriveRuntimeDO?.storage !== 'sqlite') fail('d0046_worker_runtime_mismatch', 'Trial Worker did not expose the expected SQLite drive export');
  return drive.namespace_id;
}

function accessPolicyMatches(policy, accountId) {
  return policy?.decision === 'allow' && Array.isArray(policy.include) && policy.include.length === 1 &&
    policy.include[0]?.cloudflare_account_member?.account_id === accountId &&
    (!Array.isArray(policy.exclude) || policy.exclude.length === 0) &&
    (!Array.isArray(policy.require) || policy.require.length === 0);
}

function validateAccessApplication(app, accountId) {
  if (app?.type !== 'self_hosted' || app?.name !== D0046_ACCESS_APP_NAME || app?.domain !== D0046_MCP_TRIAL_DOMAIN || typeof app?.aud !== 'string' || app.aud.length === 0) {
    fail('d0046_access_app_mismatch', 'Trial Access application identity or audience did not match');
  }
  if (JSON.stringify(app.allowed_idps ?? []) !== JSON.stringify([D0046_ACCESS_IDP]) || app.app_launcher_visible !== false || app.enable_binding_cookie !== false || app.http_only_cookie_attribute !== true) {
    fail('d0046_access_app_mismatch', 'Trial Access application login policy did not match');
  }
  const oauth = app.oauth_configuration;
  if (oauth?.enabled !== true || oauth.dynamic_client_registration?.enabled !== true || JSON.stringify(oauth.dynamic_client_registration.allowed_uris ?? []) !== JSON.stringify(['https://chatgpt.com/connector/oauth/*']) || oauth.dynamic_client_registration.allow_any_on_localhost !== false || oauth.dynamic_client_registration.allow_any_on_loopback !== false || oauth.grant?.session_duration !== '168h') {
    fail('d0046_access_oauth_mismatch', 'Trial Access OAuth configuration did not match D0024');
  }
  const policies = Array.isArray(app.policies) ? app.policies.filter((policy) => accessPolicyMatches(policy, accountId)) : [];
  if (policies.length !== 1 || app.policies.length !== 1) fail('d0046_access_policy_mismatch', 'Trial Access application did not have exactly one account-member allow policy');
  return app;
}

async function createAccessApplication(client, accountId) {
  const created = await client.request('POST', client.accountPath('/access/apps'), { json: accessApplicationPayload() });
  const app = created.result;
  if (typeof app?.id !== 'string' || typeof app?.aud !== 'string') fail('d0046_access_create_unverified', 'Access application creation did not return a stable ID and audience');
  let detail = (await client.request('GET', client.accountPath(`/access/apps/${encodeURIComponent(app.id)}`))).result;
  if (!Array.isArray(detail?.policies) || detail.policies.length === 0) {
    await client.request('POST', client.accountPath(`/access/apps/${encodeURIComponent(app.id)}/policies`), { json: accessPolicyPayload(accountId) });
    detail = (await client.request('GET', client.accountPath(`/access/apps/${encodeURIComponent(app.id)}`))).result;
  }
  validateAccessApplication(detail, accountId);
  return detail;
}

async function publicJson(url) {
  let response;
  try {
    response = await fetch(url, { redirect: 'manual', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
  } catch (cause) {
    fail('d0046_public_readback_unavailable', 'Public Worker readback failed before a response could be trusted', { url }, { cause });
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_PUBLIC_RESPONSE_BYTES) fail('d0046_public_readback_too_large', 'Public Worker response exceeded its bound', { url });
  let body = null;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { /* non-JSON responses are recorded by status only */ }
  return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body };
}

async function publicMetadataReadback(auth) {
  let resource = null;
  for (let attempt = 0; attempt < 15; attempt += 1) {
    resource = await publicJson(`${D0046_MCP_TRIAL_ORIGIN}/.well-known/oauth-protected-resource/mcp`);
    if (resource.status === 200) break;
    if (attempt < 14) await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  if (resource.status !== 200) fail('d0046_resource_metadata_missing', 'RFC 9728 path-specific protected-resource metadata was not public', { status: resource.status });
  const validatedResource = validateMcpProtectedResourceMetadata(resource.body, auth);
  const rootResource = await publicJson(`${D0046_MCP_TRIAL_ORIGIN}/.well-known/oauth-protected-resource`);
  if (rootResource.status !== 200) fail('d0046_resource_metadata_alias_missing', 'Origin-root protected-resource metadata compatibility alias was not public', { status: rootResource.status });
  const validatedRootResource = validateMcpProtectedResourceMetadata(rootResource.body, auth);
  const authorization = await publicJson(`${D0046_ACCESS_ISSUER}/.well-known/oauth-authorization-server`);
  if (authorization.status !== 200) fail('d0046_authorization_metadata_missing', 'Cloudflare Access authorization-server metadata was not public', { status: authorization.status });
  const validatedAuthorization = validateMcpAuthorizationServerMetadata(authorization.body, auth);
  const mcp = await publicJson(`${D0046_MCP_TRIAL_ORIGIN}/mcp`);
  if (![301, 302, 303, 307, 308, 401, 403].includes(mcp.status)) fail('d0046_mcp_edge_state_unexpected', 'Trial MCP endpoint did not show an expected Access-protected unauthenticated status', { status: mcp.status });
  return {
    resource: {
      status: resource.status,
      path: '/.well-known/oauth-protected-resource/mcp',
      resource: validatedResource.resource,
      authorizationServers: validatedResource.authorization_servers,
      rootAlias: { status: rootResource.status, resource: validatedRootResource.resource, authorizationServers: validatedRootResource.authorization_servers },
    },
    authorization: { status: authorization.status, issuer: validatedAuthorization.issuer, authorizationEndpoint: validatedAuthorization.authorization_endpoint, tokenEndpoint: validatedAuthorization.token_endpoint, registrationEndpoint: validatedAuthorization.registration_endpoint ?? null, pkce: validatedAuthorization.code_challenge_methods_supported },
    mcpUnauthenticated: { status: mcp.status },
  };
}

async function preflightAbsence(client) {
  const [settings, namespaces, apps] = await Promise.all([
    workerSettings(client, D0046_MCP_TRIAL_SCRIPT, true),
    listNamespaces(client),
    listAccessApps(client),
  ]);
  const namespaceMatches = namespaces.filter((item) => item?.script === D0046_MCP_TRIAL_SCRIPT);
  const appMatches = apps.filter((app) => app?.name === D0046_ACCESS_APP_NAME || app?.domain === D0046_MCP_TRIAL_DOMAIN);
  if (settings.found || namespaceMatches.length !== 0 || appMatches.length !== 0) {
    fail('d0046_target_conflict', 'The isolated tdev-mcp-trial target was not absent; refusing overwrite', { worker: settings.found, namespaces: namespaceMatches.length, accessApps: appMatches.length });
  }
  return { workerAbsent: true, namespaceMatches: 0, accessAppMatches: 0 };
}

function redactedIdentity(identity) {
  return {
    principalDigest: sha256(identity.principalId),
    tenantDigest: sha256(identity.tenantId),
    claimMapping: { principalClaim: 'email', tenantClaim: 'email' },
  };
}

function deploymentResult({ sourceSha, base, artifact, bootstrap = null, manifests, accessApp, provider, publicReadback, absence = null, identity, driveNamespace, subdomainEnabled }) {
  return Object.freeze({
    status: 'deployed',
    sourceSha,
    scriptName: D0046_MCP_TRIAL_SCRIPT,
    resource: D0046_MCP_TRIAL_RESOURCE,
    origin: D0046_MCP_TRIAL_ORIGIN,
    base: { commitOid: base.commitOid, baseDigest: base.baseDigest, fileCount: base.fileCount, semanticBytes: base.semanticBytes, compressedBytes: base.compressedBytes, moduleBytes: base.moduleBytes, excludedPaths: base.excludedPaths },
    artifact: { moduleCount: artifact.moduleCount, moduleDigest: artifact.moduleDigest, artifactManifestDigest: artifact.artifactManifestDigest, modules: artifact.modules },
    manifests: { compositionDigest: bootstrap?.composition?.manifestDigest ?? null, finalCompositionDigest: manifests.composition.manifestDigest, authProfileDigest: manifests.auth.profileDigest, operationDigest: manifests.operationDigest, surfaceDigest: manifests.surfaceDigest },
    ownerBindings: { caseWorker: D0046_CASE_SCRIPT, caseNamespace: D0046_CASE_NAMESPACE, driveWorker: D0046_MCP_TRIAL_SCRIPT, driveNamespace, agentWorker: D0046_AGENT_SCRIPT, agentNamespace: D0046_AGENT_NAMESPACE, casePlacementDatabase: D0046_CASE_PLACEMENT_DATABASE, agentId: manifests.composition.agentOwner.agentId, routeGeneration: manifests.composition.agentOwner.routeGeneration },
    identity: redactedIdentity(identity),
    access: { id: accessApp.id, audienceDigest: sha256(accessApp.aud), domain: accessApp.domain, policyCount: accessApp.policies.length, oauth: { issuer: D0046_ACCESS_ISSUER, jwksUri: D0046_ACCESS_JWKS_URI, dynamicRegistration: true, redirectUri: 'https://chatgpt.com/connector/oauth/*', pkce: 'S256' } },
    provider: { absence, driveNamespace, worker: provider, publicReadback },
    safety: { canonicalWriterEnabled: false, previewWritersEnabled: false, subdomainEnabled, rollback: { disableSubdomain: `POST /accounts/{account}/workers/scripts/${D0046_MCP_TRIAL_SCRIPT}/subdomain { enabled:false, previews_enabled:false }`, accessAppId: accessApp.id } },
    secretValues: 'excluded',
  });
}

export async function resumeMcpTrial({ repositoryPath = repositoryRoot, envFile = '/data/data/com.termux/files/home/.config/tdev/cloudflare.env' } = {}) {
  const sourceSha = assertTrackedSource(repositoryPath);
  const rawOperation = JSON.parse(await readFile(path.join(repositoryPath, D0046_OPERATION_CONFIG), 'utf8'));
  const operationManifest = normalizedOperationManifest(rawOperation);
  const base = await buildMcpTrialBaseTreeModule({ repositoryPath, commitOid: sourceSha, scope: D0046_MCP_CONTEXT_SCOPE });
  const modules = collectWorkerModules(repositoryPath, D0046_WORKER_MAIN_MODULE, { overrides: { [base.moduleName]: base.source } });
  const artifact = artifactManifest(modules);
  const credentials = loadCloudflareCredentials(envFile);
  const client = new CloudflareApiClient({ ...credentials, apiOrigin: API_ORIGIN });
  await verifyExistingOwners(client);
  const agentRouteBinding = await readCanonicalAgentRouteBinding(envFile);
  const existing = await workerSettings(client, D0046_MCP_TRIAL_SCRIPT);
  assertOwnerMarker(existing.result, D0046_MCP_TRIAL_SCRIPT);
  const identity = existingTrialIdentity(existing.result);
  const namespaces = await listNamespaces(client);
  const targetNamespaces = namespaces.filter((item) => item?.script === D0046_MCP_TRIAL_SCRIPT);
  if (targetNamespaces.length !== 1 || targetNamespaces[0].class !== MCP_TRIAL_DRIVE_CLASS_NAME || targetNamespaces[0].use_sqlite !== true) {
    fail('d0046_trial_namespace_ambiguous', 'Existing trial Worker does not have exactly one SQLite drive namespace', { matches: targetNamespaces.length });
  }
  const driveNamespace = assertNamespaceId(targetNamespaces[0].id, 'trial drive namespace');
  const apps = await listAccessApps(client);
  const appMatches = apps.filter((app) => app?.name === D0046_ACCESS_APP_NAME || app?.domain === D0046_MCP_TRIAL_DOMAIN);
  if (appMatches.length !== 1) fail('d0046_access_readback_missing', 'Existing trial does not have exactly one matching Access application', { matches: appMatches.length });
  const accessApp = validateAccessApplication((await client.request('GET', client.accountPath(`/access/apps/${encodeURIComponent(appMatches[0].id)}`))).result, credentials.accountId);
  const manifests = buildTrialManifests({
    sourceSha,
    baseDigest: base.baseDigest,
    baseTree: base.tree,
    repositoryBaseIdentity: base.repositoryBaseIdentity,
    scope: base.scope,
    scopeDigest: base.scopeDigest,
    operationManifest,
    identity,
    includeBaseTree: true,
    driveNamespace,
    accessAudience: accessApp.aud,
    agentRouteBinding,
  });
  let subdomainEnabled = false;
  try {
    // The existing target is owned and isolated; this forward upload only
    // rebinds it to the exact current source commit and generated base tree.
    await uploadWorker(client, modules, buildWorkerMetadata({ manifests, sourceSha, artifact, driveNamespace, bootstrap: false }));
    await setSubdomain(client, true);
    subdomainEnabled = true;
    const provider = await workerReadback(client);
    const readbackDriveNamespace = validateTrialWorkerSettings(provider.settings, provider.version, manifests, sourceSha, artifact);
    if (readbackDriveNamespace !== driveNamespace) fail('d0046_drive_namespace_mismatch', 'Trial Worker readback drive namespace disagreed with existing namespace');
    const publicReadback = await publicMetadataReadback(manifests.auth);
    return deploymentResult({ sourceSha, base, artifact, manifests, accessApp, provider, publicReadback, absence: { workerAlreadyOwned: true, namespaceMatches: 1, accessAppMatches: 1 }, identity, driveNamespace, subdomainEnabled });
  } catch (cause) {
    if (subdomainEnabled) {
      try { await setSubdomain(client, false); } catch (cleanupError) {
        cause.details = { ...(cause.details ?? {}), safetyClosure: { code: cleanupError?.code ?? 'unknown' } };
      }
    }
    throw cause;
  }
}

export async function deployMcpTrial({ repositoryPath = repositoryRoot, envFile = '/data/data/com.termux/files/home/.config/tdev/cloudflare.env' } = {}) {
  const sourceSha = assertTrackedSource(repositoryPath);
  const rawOperation = JSON.parse(await readFile(path.join(repositoryPath, D0046_OPERATION_CONFIG), 'utf8'));
  const operationManifest = normalizedOperationManifest(rawOperation);
  const base = await buildMcpTrialBaseTreeModule({
    repositoryPath,
    commitOid: sourceSha,
    scope: D0046_MCP_CONTEXT_SCOPE,
  });
  const modules = collectWorkerModules(repositoryPath, D0046_WORKER_MAIN_MODULE, {
    overrides: { [base.moduleName]: base.source },
  });
  const artifact = artifactManifest(modules);
  const identity = identityManifest();
  const credentials = loadCloudflareCredentials(envFile);
  const client = new CloudflareApiClient({ ...credentials, apiOrigin: API_ORIGIN });
  await verifyExistingOwners(client);
  const agentRouteBinding = await readCanonicalAgentRouteBinding(envFile);
  const absence = await preflightAbsence(client);
  const bootstrap = buildTrialManifests({
    sourceSha,
    baseDigest: base.baseDigest,
    baseTree: base.tree,
    repositoryBaseIdentity: base.repositoryBaseIdentity,
    scope: base.scope,
    scopeDigest: base.scopeDigest,
    operationManifest,
    identity,
    includeBaseTree: true,
    driveNamespace: `pending-${D0046_MCP_TRIAL_SCRIPT}-drive`,
    accessAudience: 'pending-access-audience',
    agentRouteBinding,
  });
  let subdomainEnabled = false;
  let accessApp = null;
  let driveNamespace = null;
  try {
    await uploadWorker(client, modules, buildWorkerMetadata({ manifests: bootstrap, sourceSha, artifact, bootstrap: true }));
    await setSubdomain(client, false);
    const namespace = await waitForTrialNamespace(client);
    driveNamespace = assertNamespaceId(namespace.id, 'trial drive namespace');
    accessApp = await createAccessApplication(client, credentials.accountId);
    const manifests = buildTrialManifests({
    sourceSha,
    baseDigest: base.baseDigest,
    baseTree: base.tree,
    repositoryBaseIdentity: base.repositoryBaseIdentity,
    scope: base.scope,
    scopeDigest: base.scopeDigest,
    operationManifest,
    identity,
    includeBaseTree: true,
    driveNamespace,
    accessAudience: accessApp.aud,
    agentRouteBinding,
  });
    await uploadWorker(client, modules, buildWorkerMetadata({ manifests, sourceSha, artifact, driveNamespace, bootstrap: false }));
    await setSubdomain(client, true);
    subdomainEnabled = true;
    const provider = await workerReadback(client);
    const readbackDriveNamespace = validateTrialWorkerSettings(provider.settings, provider.version, manifests, sourceSha, artifact);
    if (readbackDriveNamespace !== driveNamespace) fail('d0046_drive_namespace_mismatch', 'Trial Worker readback drive namespace disagreed with bootstrap');
    const apps = await listAccessApps(client);
    const matchingApps = apps.filter((app) => app?.id === accessApp.id);
    if (matchingApps.length !== 1) fail('d0046_access_readback_missing', 'Trial Access application disappeared from list readback');
    const finalAccess = validateAccessApplication((await client.request('GET', client.accountPath(`/access/apps/${encodeURIComponent(accessApp.id)}`))).result, credentials.accountId);
    const publicReadback = await publicMetadataReadback(manifests.auth);
    return deploymentResult({ sourceSha, base, artifact, bootstrap, manifests, accessApp: finalAccess, provider, publicReadback, absence, identity, driveNamespace, subdomainEnabled });
  } catch (cause) {
    if (subdomainEnabled) {
      try { await setSubdomain(client, false); } catch (cleanupError) {
        cause.details = { ...(cause.details ?? {}), safetyClosure: { code: cleanupError?.code ?? 'unknown' } };
      }
    }
    throw cause;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const allowed = new Set(['--apply', '--env-file', '--resume-existing']);
  let envFile = '/data/data/com.termux/files/home/.config/tdev/cloudflare.env';
  let envProvided = false;
  let apply = false;
  let resumeExisting = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--apply') {
      if (apply) fail('d0046_cli_invalid', '--apply was repeated');
      apply = true;
    } else if (arg === '--resume-existing') {
      if (resumeExisting) fail('d0046_cli_invalid', '--resume-existing was repeated');
      resumeExisting = true;
    } else if (arg === '--env-file') {
      if (index + 1 >= args.length || args[index + 1].startsWith('--')) fail('d0046_cli_invalid', '--env-file requires a path');
      if (envProvided) fail('d0046_cli_invalid', '--env-file was repeated');
      envProvided = true;
      envFile = args[++index];
    } else if (!allowed.has(arg)) {
      fail('d0046_cli_invalid', `Unsupported argument: ${arg}`);
    }
  }
  if (!apply) fail('d0046_mutation_not_authorized', 'D0046 provider deployment requires --apply');
  const result = resumeExisting ? await resumeMcpTrial({ envFile }) : await deployMcpTrial({ envFile });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: 'failed', code: error?.code ?? 'd0046_mcp_trial_deploy_failed', message: error?.message ?? String(error), details: error?.details ?? undefined }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
