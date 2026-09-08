import {
  ContractError,
  assertDigest,
  assertIdentifier,
  assertRecordShape,
  assertSafeInteger,
  canonicalClone,
  canonicalJson,
  deepFreeze,
  digest,
  isPlainRecord,
  publicJsonClone,
  typedDigest,
} from './canonical.mjs';
import { MCP_AUTH_PROFILE } from './mcp-auth.mjs';
import { createCasePlacement } from './casedo-authority.mjs';
import { D1CasePlacementAuthority } from './d1-case-placement.mjs';
import { normalizeAgentRouteBinding } from './agent-delivery-authority.mjs';
import { agentRouteHostKey } from './agent-route-election.mjs';
import {
  normalizeLazyPlanScope,
  normalizeRepositoryBaseIdentity,
  scopeDigest as lazyScopeDigest,
} from './lazy-plan-reference.mjs';

/**
 * D0046's source-only composition boundary.  The Worker that imports this
 * module may route to existing Case/Agent owners, but it cannot let request
 * data select a different owner, repository or operation profile.
 */
export const MCP_TRIAL_COMPOSITION_PROFILE = 'tdev.mcp.trial-composition.v1';
export const MCP_TRIAL_COMPOSITION_SCHEMA_VERSION = 1;
export const MCP_TRIAL_COMPOSITION_MANIFEST_DOMAIN = 'tdev.mcp.trial-composition-manifest.v1';
export const MCP_TRIAL_COMPOSITION_RESOURCE = 'https://tdev-mcp-trial.humtr.workers.dev/mcp';
export const MCP_TRIAL_AGENT_RPC_PROFILE = 'tdev.installable-agent-qualification-rpc.v2';
export const MCP_TRIAL_CASE_CLASS_NAME = 'CaseRuntimeDO';
export const MCP_TRIAL_DRIVE_CLASS_NAME = 'CaseAgentDriveRuntimeDO';
export const MCP_TRIAL_AGENT_CLASS_NAME = 'AgentDeliveryRuntimeDO';

const JURISDICTIONS = new Set(['global', 'eu', 'us', 'fedramp']);
const MCP_TRIAL_AGENT_DEPLOYMENT_IDENTITY_OPERATIONS = new Set([
  'reserve',
  'release_reservation',
  'expire_reservation',
  'roll_reservation_window',
  'activate_delivery',
  'grant_command',
  'close_undispatched_delivery',
  'bind_terminal_case_receipt',
  'reacquire_delivery_admission',
  'send_dispatch',
]);
const REPOSITORY_OID = /^[0-9a-f]{40,64}$/u;
const MAX_TEXT_BYTES = 4096;
const OWNER_PLACEMENT_FIELDS = [
  'deployment', 'environment', 'workerScript', 'className', 'namespace', 'jurisdiction',
];

function fail(code, message, details = undefined, options = undefined) {
  throw new ContractError(code, message, details, options);
}

function boundedText(value, label, maxBytes = MAX_TEXT_BYTES) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') ||
      new TextEncoder().encode(value).byteLength > maxBytes) {
    fail('mcp_trial_manifest_invalid', `${label} is outside its bound`);
  }
  return value;
}

function ownerPlacement(value, label, expectedClassName) {
  assertRecordShape(value, OWNER_PLACEMENT_FIELDS, [], label);
  for (const field of OWNER_PLACEMENT_FIELDS) boundedText(value[field], `${label}.${field}`);
  if (value.className !== expectedClassName) {
    fail('mcp_trial_owner_mismatch', `${label}.className is not the accepted owner class`, {
      expected: expectedClassName,
      actual: value.className,
    });
  }
  if (!JURISDICTIONS.has(value.jurisdiction)) fail('mcp_trial_manifest_invalid', `${label}.jurisdiction is unsupported`);
  return canonicalClone(value);
}

function ownerBinding(value, label, expectedClassName) {
  assertRecordShape(value, ['placement'], ['namespaceId', 'd1Binding', 'd1DatabaseId', 'agentId', 'routeGeneration', 'routeKey'], label);
  const placement = ownerPlacement(value.placement, `${label}.placement`, expectedClassName);
  for (const field of ['namespaceId', 'd1Binding', 'd1DatabaseId']) {
    if (value[field] !== undefined) boundedText(value[field], `${label}.${field}`, 512);
  }
  if (value.routeKey !== undefined) boundedText(value.routeKey, `${label}.routeKey`, 256);
  return {
    placement,
    ...(value.namespaceId === undefined ? {} : { namespaceId: value.namespaceId }),
    ...(value.d1Binding === undefined ? {} : { d1Binding: value.d1Binding }),
    ...(value.d1DatabaseId === undefined ? {} : { d1DatabaseId: value.d1DatabaseId }),
    ...(value.routeKey === undefined ? {} : { routeKey: value.routeKey }),
  };
}

function normalizeContextBaseIdentity(input, repository, label) {
  if (!isPlainRecord(input)) fail('mcp_trial_context_invalid', `${label} must be a record`);
  assertRecordShape(input, [
    'schemaVersion', 'profile', 'objectFormat', 'commitOid', 'treeOid', 'baseDigest', 'manifestDigest',
  ], [], label);
  const oidLength = input.objectFormat === 'sha1' ? 40 : input.objectFormat === 'sha256' ? 64 : 0;
  if (input.schemaVersion !== 1 || input.profile !== 'tdev.repository-base-identity.v1' ||
      input.objectFormat !== repository.objectFormat || input.commitOid !== repository.commitOid ||
      input.baseDigest !== repository.baseDigest || oidLength === 0 ||
      !new RegExp(`^[0-9a-f]{${oidLength}}$`, 'u').test(input.commitOid) ||
      !new RegExp(`^[0-9a-f]{${oidLength}}$`, 'u').test(input.treeOid)) {
    fail('mcp_trial_context_mismatch', `${label} does not bind the fixed repository context`);
  }
  assertDigest(input.manifestDigest, `${label}.manifestDigest`);
  return canonicalClone(input);
}

function normalizeContext(context, repository, label = 'repository.context', { allowEmptyBaseTree = false } = {}) {
  if (!isPlainRecord(context)) fail('mcp_trial_context_invalid', `${label} must be a record`);
  assertRecordShape(context, ['revisionId', 'baseTree', 'repositoryCommitOid'], [
    'objectFormat', 'contextReferenceId', 'contextCapabilityId', 'modelCapabilityId',
    'validationCapabilityId', 'caseContract', 'payload', 'contextProfile', 'contextScope',
    'scopeDigest', 'baseIdentity', 'repositoryBaseIdentity',
  ], label);
  assertIdentifier(context.revisionId, `${label}.revisionId`);
  if (!isPlainRecord(context.baseTree)) fail('mcp_trial_context_invalid', `${label}.baseTree must be a record`);
  if (!REPOSITORY_OID.test(context.repositoryCommitOid)) fail('mcp_trial_context_invalid', `${label}.repositoryCommitOid is invalid`);
  const objectFormat = context.objectFormat ?? repository.objectFormat;
  if (objectFormat !== repository.objectFormat) fail('mcp_trial_context_mismatch', `${label}.objectFormat is not the fixed repository format`);
  if (context.repositoryCommitOid !== repository.commitOid) fail('mcp_trial_context_mismatch', `${label}.repositoryCommitOid is not the fixed commit`);
  const baseTree = canonicalClone(context.baseTree);
  // The deployment binding deliberately carries an empty context tree: the
  // immutable tree is compiled into the Worker module and injected only when
  // a full owner operation is actually needed.  An empty tree is accepted
  // here solely by normalizeMcpTrialCompositionBinding; the normal manifest
  // normalizer remains strict and always checks the semantic digest.
  if (!(allowEmptyBaseTree && Object.keys(baseTree).length === 0) && digest(baseTree) !== repository.baseDigest) {
    fail('mcp_trial_context_mismatch', `${label}.baseTree does not match the fixed base digest`);
  }
  if (context.contextReferenceId !== repository.contextReference) {
    fail('mcp_trial_context_mismatch', `${label}.contextReferenceId is not the fixed context reference`);
  }
  const repositoryScope = repository.scope ?? null;
  const lazy = repositoryScope !== null;
  const hasLazyContextFields = ['contextProfile', 'contextScope', 'scopeDigest', 'baseIdentity', 'repositoryBaseIdentity']
    .some((field) => context[field] !== undefined);
  if (!lazy && hasLazyContextFields) {
    fail('mcp_trial_context_mismatch', `${label} cannot carry lazy context bindings without a scoped repository`);
  }
  const normalized = {
    ...canonicalClone(context),
    objectFormat,
    contextReferenceId: repository.contextReference,
  };
  if (lazy) {
    if (context.contextProfile !== 'tdev.repository.context.prepare.lazy.v1' || !isPlainRecord(context.contextScope)) {
      fail('mcp_trial_context_mismatch', `${label} must use the fixed lazy context profile and repository scope`);
    }
    const contextScope = normalizeLazyPlanScope(context.contextScope);
    if (canonicalJson(contextScope) !== canonicalJson(repositoryScope)) {
      fail('mcp_trial_context_mismatch', `${label}.contextScope does not match the fixed repository scope`);
    }
    assertDigest(context.scopeDigest, `${label}.scopeDigest`);
    if (context.scopeDigest !== repository.scopeDigest) {
      fail('mcp_trial_context_mismatch', `${label}.scopeDigest does not match the fixed repository scope digest`);
    }
    const baseIdentity = normalizeContextBaseIdentity(context.baseIdentity, repository, `${label}.baseIdentity`);
    const repositoryBaseIdentity = normalizeRepositoryBaseIdentity(context.repositoryBaseIdentity, {
      objectFormat: repository.objectFormat,
      commitOid: repository.commitOid,
    });
    if (canonicalJson(repositoryBaseIdentity) !== canonicalJson(repository.repositoryBaseIdentity) ||
        baseIdentity.manifestDigest !== repositoryBaseIdentity.manifestDigest ||
        baseIdentity.treeOid !== repositoryBaseIdentity.treeOid) {
      fail('mcp_trial_context_mismatch', `${label} lazy identities do not bind the same complete repository manifest`);
    }
    normalized.contextProfile = context.contextProfile;
    normalized.contextScope = contextScope;
    normalized.scopeDigest = context.scopeDigest;
    normalized.baseIdentity = baseIdentity;
    normalized.repositoryBaseIdentity = repositoryBaseIdentity;
  }
  return normalized;
}

function normalizeManifestBody(input, { allowEmptyBaseTree = false } = {}) {
  assertRecordShape(input, [
    'schemaVersion', 'profile', 'resource', 'workerScript', 'environment', 'jurisdiction',
    'caseOwner', 'driveOwner', 'agentOwner', 'repository', 'operation', 'identity',
    'authProfile', 'casePrefix', 'canonicalWriterEnabled', 'previewWritersEnabled',
  ], ['manifestDigest'], 'MCP trial composition manifest');
  if (input.schemaVersion !== MCP_TRIAL_COMPOSITION_SCHEMA_VERSION || input.profile !== MCP_TRIAL_COMPOSITION_PROFILE) {
    fail('mcp_trial_manifest_unsupported', 'Unsupported MCP trial composition profile or schema');
  }
  if (input.resource !== MCP_TRIAL_COMPOSITION_RESOURCE) {
    fail('mcp_trial_resource_mismatch', 'The trial resource is fixed to the accepted D0046 endpoint');
  }
  boundedText(input.workerScript, 'workerScript', 63);
  boundedText(input.environment, 'environment');
  if (!JURISDICTIONS.has(input.jurisdiction)) fail('mcp_trial_manifest_invalid', 'Trial jurisdiction is unsupported');
  const caseOwner = ownerBinding(input.caseOwner, 'caseOwner', MCP_TRIAL_CASE_CLASS_NAME);
  const driveOwner = ownerBinding(input.driveOwner, 'driveOwner', MCP_TRIAL_DRIVE_CLASS_NAME);
  const agentOwner = ownerBinding(input.agentOwner, 'agentOwner', MCP_TRIAL_AGENT_CLASS_NAME);
  assertRecordShape(input.agentOwner, ['placement', 'agentId', 'routeGeneration'], ['namespaceId', 'routeKey'], 'agentOwner');
  assertIdentifier(input.agentOwner.agentId, 'agentOwner.agentId');
  assertSafeInteger(input.agentOwner.routeGeneration, 'agentOwner.routeGeneration', { min: 1 });
  if (input.agentOwner.routeKey !== undefined && input.agentOwner.routeKey !== agentRouteHostKey({
    agentId: input.agentOwner.agentId,
    routeGeneration: input.agentOwner.routeGeneration,
  })) {
    fail('mcp_trial_agent_route_mismatch', 'agentOwner.routeKey must be the generation-bound route host key');
  }
  const repository = input.repository;
  assertRecordShape(repository, [
    'commitOid', 'baseDigest', 'objectFormat', 'contextReference', 'context',
  ], ['repositoryBaseIdentity', 'scope', 'scopeDigest'], 'trial repository');
  if (!REPOSITORY_OID.test(repository.commitOid)) fail('mcp_trial_manifest_invalid', 'repository.commitOid is invalid');
  assertDigest(repository.baseDigest, 'repository.baseDigest');
  if (!['sha1', 'sha256'].includes(repository.objectFormat)) fail('mcp_trial_manifest_invalid', 'repository.objectFormat is unsupported');
  assertIdentifier(repository.contextReference, 'repository.contextReference');
  const hasScope = repository.scope !== undefined;
  const hasScopeDigest = repository.scopeDigest !== undefined;
  const hasRepositoryBaseIdentity = repository.repositoryBaseIdentity !== undefined;
  if (hasScope !== hasScopeDigest || hasScope !== hasRepositoryBaseIdentity) {
    fail('mcp_trial_manifest_invalid', 'Scoped trial repositories require scope, scopeDigest, and repositoryBaseIdentity together');
  }
  const normalizedScope = hasScope ? normalizeLazyPlanScope(repository.scope) : null;
  if (hasScope) {
    assertDigest(repository.scopeDigest, 'repository.scopeDigest');
    if (repository.scopeDigest !== lazyScopeDigest(normalizedScope)) {
      fail('mcp_trial_manifest_invalid', 'repository.scopeDigest does not match the fixed repository scope');
    }
  }
  const normalizedRepositoryBaseIdentity = hasRepositoryBaseIdentity
    ? normalizeRepositoryBaseIdentity(repository.repositoryBaseIdentity, {
        objectFormat: repository.objectFormat,
        commitOid: repository.commitOid,
      })
    : null;
  const normalizedRepository = {
    commitOid: repository.commitOid,
    baseDigest: repository.baseDigest,
    objectFormat: repository.objectFormat,
    contextReference: repository.contextReference,
    ...(normalizedRepositoryBaseIdentity === null ? {} : { repositoryBaseIdentity: normalizedRepositoryBaseIdentity }),
    ...(normalizedScope === null ? {} : { scope: normalizedScope, scopeDigest: repository.scopeDigest }),
  };
  normalizedRepository.context = normalizeContext(repository.context, normalizedRepository, 'repository.context', { allowEmptyBaseTree });
  const operation = input.operation;
  assertRecordShape(operation, [
    'manifestDigest', 'contextProfile', 'modelProfile', 'validationProfile',
  ], [], 'trial operation binding');
  assertDigest(operation.manifestDigest, 'operation.manifestDigest');
  for (const field of ['contextProfile', 'modelProfile', 'validationProfile']) assertIdentifier(operation[field], `operation.${field}`);
  const repositoryIsLazy = normalizedRepository.scope !== undefined;
  if (repositoryIsLazy !== (operation.contextProfile === 'tdev.repository.context.prepare.lazy.v1')) {
    fail('mcp_trial_manifest_invalid', 'Trial operation context profile does not match the fixed repository context mode');
  }
  const identity = input.identity;
  assertRecordShape(identity, ['principalId', 'tenantId'], [], 'trial identity');
  // Cloudflare Access supplies bounded email/UUID claim values; they are not
  // restricted to the repository identifier grammar used for internal IDs.
  boundedText(identity.principalId, 'identity.principalId', 256);
  boundedText(identity.tenantId, 'identity.tenantId', 256);
  boundedText(input.casePrefix, 'casePrefix', 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(input.casePrefix)) fail('mcp_trial_manifest_invalid', 'casePrefix is not an identifier prefix');
  if (input.authProfile !== MCP_AUTH_PROFILE) fail('mcp_trial_auth_profile_mismatch', 'Trial composition must use D0024 MCP auth');
  if (input.canonicalWriterEnabled !== false || input.previewWritersEnabled !== false) {
    fail('mcp_trial_writer_forbidden', 'The first trial must not expose canonical or preview writers');
  }
  const body = {
    schemaVersion: MCP_TRIAL_COMPOSITION_SCHEMA_VERSION,
    profile: MCP_TRIAL_COMPOSITION_PROFILE,
    resource: MCP_TRIAL_COMPOSITION_RESOURCE,
    workerScript: input.workerScript,
    environment: input.environment,
    jurisdiction: input.jurisdiction,
    caseOwner,
    driveOwner,
    agentOwner: {
      ...agentOwner,
      agentId: input.agentOwner.agentId,
      routeGeneration: input.agentOwner.routeGeneration,
    },
    repository: normalizedRepository,
    operation: canonicalClone(operation),
    identity: canonicalClone(identity),
    authProfile: input.authProfile,
    casePrefix: input.casePrefix,
    canonicalWriterEnabled: false,
    previewWritersEnabled: false,
  };
  if (body.caseOwner.placement.jurisdiction !== body.jurisdiction ||
      body.driveOwner.placement.jurisdiction !== body.jurisdiction ||
      body.agentOwner.placement.jurisdiction !== body.jurisdiction) {
    fail('mcp_trial_owner_mismatch', 'All trial owner placements must share the ingress jurisdiction');
  }
  return body;
}

export function normalizeMcpTrialCompositionManifest(input) {
  const body = normalizeManifestBody(input);
  const expected = typedDigest(MCP_TRIAL_COMPOSITION_MANIFEST_DOMAIN, body);
  if (input.manifestDigest !== undefined && input.manifestDigest !== expected) {
    fail('mcp_trial_manifest_digest_mismatch', 'Trial composition manifest digest does not match its fields');
  }
  return deepFreeze({ ...body, manifestDigest: expected });
}

/**
 * Normalize the small environment binding used before the generated base-tree
 * module is decoded.  The binding's manifestDigest still commits to the full
 * composition (including the omitted tree), so it is retained as an opaque
 * digest and rechecked by normalizeMcpTrialCompositionManifest once the tree
 * is injected.  This function must never be used as a substitute for the
 * full normalizer on owner operations.
 */
export function normalizeMcpTrialCompositionBinding(input) {
  const body = normalizeManifestBody(input, { allowEmptyBaseTree: true });
  assertDigest(input.manifestDigest, 'MCP trial composition manifestDigest');
  if (Object.keys(body.repository.context.baseTree).length !== 0) {
    fail('mcp_trial_binding_invalid', 'Trial composition binding must omit the immutable base tree');
  }
  return deepFreeze({ ...body, manifestDigest: input.manifestDigest });
}

export function namespaceFor(namespace, jurisdiction, label) {
  if (!namespace || typeof namespace.idFromName !== 'function' || typeof namespace.get !== 'function') {
    fail('mcp_trial_owner_unavailable', `${label} namespace binding is unavailable`);
  }
  if (jurisdiction === 'global') return namespace;
  if (typeof namespace.jurisdiction !== 'function') fail('mcp_trial_owner_unavailable', `${label} namespace has no jurisdiction selector`);
  const scoped = namespace.jurisdiction(jurisdiction);
  if (!scoped || typeof scoped.idFromName !== 'function' || typeof scoped.get !== 'function') {
    fail('mcp_trial_owner_unavailable', `${label} jurisdiction namespace is invalid`);
  }
  return scoped;
}

function routedStub(namespace, name, jurisdiction, label, { rpc = true } = {}) {
  assertIdentifier(name, `${label} route key`);
  const id = namespace.idFromName(name);
  if (!id || typeof id.toString !== 'function') fail('mcp_trial_owner_unavailable', `${label} returned an invalid Durable Object identity`);
  if ((id.jurisdiction ?? 'global') !== jurisdiction) fail('mcp_trial_owner_mismatch', `${label} identity has the wrong jurisdiction`);
  const stub = namespace.get(id);
  if (!stub || (rpc && typeof stub.qualificationInvoke !== 'function')) fail('mcp_trial_owner_unavailable', `${label} RPC stub is unavailable`);
  return { id, stub };
}

function unwrapRpc(response, label, { profile = null, schemaVersion = 1 } = {}) {
  if (!isPlainRecord(response)) fail('mcp_trial_owner_invalid_response', `${label} returned a non-record response`);
  const header = profile === null ? ['schemaVersion', 'ok'] : ['profile', 'schemaVersion', 'ok'];
  assertRecordShape(response, header, ['result', 'error'], `${label} RPC response`);
  if ((profile !== null && response.profile !== profile) || response.schemaVersion !== schemaVersion || typeof response.ok !== 'boolean') fail('mcp_trial_owner_invalid_response', `${label} RPC response header is invalid`);
  if (response.ok) {
    assertRecordShape(response, [...header, 'result'], [], `${label} RPC success`);
    return publicJsonClone(response.result);
  }
  assertRecordShape(response, [...header, 'error'], [], `${label} RPC failure`);
  assertRecordShape(response.error, ['code'], [], `${label} RPC error`);
  if (typeof response.error.code !== 'string') fail('mcp_trial_owner_invalid_response', `${label} RPC error code is invalid`);
  fail(response.error.code, `${label} owner rejected the operation`);
}

function assertCaseId(caseId, prefix) {
  assertIdentifier(caseId, 'caseId');
  if (!caseId.startsWith(prefix) || caseId.length <= prefix.length) {
    fail('mcp_trial_case_scope_denied', 'Case identity is outside the fixed trial prefix');
  }
  return caseId;
}

function caseEngineProjection(snapshot) {
  if (!isPlainRecord(snapshot)) fail('mcp_trial_owner_invalid_response', 'Case owner snapshot is invalid');
  return Object.freeze({ snapshot: () => publicJsonClone(snapshot) });
}

function makeCasePlacement(manifest, caseId, durableObjectId) {
  return createCasePlacement({ caseId, placementGeneration: 1, ...manifest.caseOwner.placement, durableObjectId });
}

function fixedPlanCheck(plan, manifest) {
  if (!isPlainRecord(plan)) fail('mcp_trial_plan_scope_denied', 'Plan must be a record');
  if (plan.baseDigest !== manifest.repository.baseDigest || !isPlainRecord(plan.baseTree) || digest(plan.baseTree) !== manifest.repository.baseDigest) {
    fail('mcp_trial_plan_scope_denied', 'Plan does not bind the fixed immutable repository base');
  }
}

/**
 * Build stateless owner adapters for the isolated trial.  The adapters expose
 * the same small interfaces used by TdevMcpSurface; durable truth remains in
 * the Case/Drive/Agent owners and is reread on every call.
 */
export function createMcpTrialOwnerFacades({ manifest, caseNamespace, driveNamespace, agentNamespace, casePlacementDatabase = null, driveRunner = null, driveOwnerOverride = null } = {}) {
  const normalized = normalizeMcpTrialCompositionManifest(manifest);
  const caseNs = namespaceFor(caseNamespace, normalized.jurisdiction, 'Case');
  const driveNs = driveOwnerOverride === null
    ? namespaceFor(driveNamespace, normalized.jurisdiction, 'Case-Agent drive')
    : null;
  const agentNs = namespaceFor(agentNamespace, normalized.jurisdiction, 'Agent');
  const placementAuthority = casePlacementDatabase === null ? null : new D1CasePlacementAuthority(casePlacementDatabase);

  if (driveOwnerOverride !== null) {
    if (typeof driveOwnerOverride !== 'object' || Array.isArray(driveOwnerOverride) ||
        typeof driveOwnerOverride.initializeCaseAgentDrive !== 'function' ||
        typeof driveOwnerOverride.readCaseAgentDrive !== 'function' ||
        typeof driveOwnerOverride.quiesceCaseAgentDrive !== 'function' ||
        typeof driveOwnerOverride.snapshotCaseAgentDrive !== 'function' ||
        typeof driveOwnerOverride.advanceCaseAgentDrive !== 'function') {
      fail('mcp_trial_owner_unavailable', 'Injected Case-Agent drive owner must expose its complete local RPC contract');
    }
  }

  function caseRoute(caseId) {
    assertCaseId(caseId, normalized.casePrefix);
    const routed = routedStub(caseNs, caseId, normalized.jurisdiction, 'Case');
    return { ...routed, placement: makeCasePlacement(normalized, caseId, routed.id.toString()) };
  }

  async function caseCall(operation, caseId, extra = {}) {
    const route = caseRoute(caseId);
    const input = { operation, placement: route.placement, ...canonicalClone(extra) };
    return unwrapRpc(await route.stub.qualificationInvoke(publicJsonClone(input)), `Case ${operation}`);
  }

  const repository = Object.freeze({
    async create({ caseId, plan, caseContract = {} } = {}) {
      assertCaseId(caseId, normalized.casePrefix);
      fixedPlanCheck(plan, normalized);
      if (placementAuthority !== null) {
        const routed = caseRoute(caseId);
        await placementAuthority.elect({ placement: routed.placement });
      }
      const result = await caseCall('initialize', caseId, { plan, caseContract });
      return caseEngineProjection(result.snapshot);
    },
    async load(caseId) {
      const result = await caseCall('load', caseId);
      return caseEngineProjection(result.snapshot);
    },
    async materializedProjection(caseId) {
      return publicJsonClone(await caseCall('materialized_projection', caseId));
    },
    async command(caseId, envelope) {
      const result = await caseCall('command', caseId, { envelope });
      return {
        engine: caseEngineProjection((await caseCall('load', caseId)).snapshot),
        result: publicJsonClone(result.response),
        persisted: result.deduplicated !== true,
      };
    },
  });

  function driveRoute(caseId) {
    if (driveOwnerOverride !== null) fail('mcp_trial_owner_unavailable', 'Drive route lookup is unavailable for a local owner adapter');
    assertCaseId(caseId, normalized.casePrefix);
    const routed = routedStub(driveNs, caseId, normalized.jurisdiction, 'Case-Agent drive', { rpc: false });
    if (routed.id.toString() === '') fail('mcp_trial_owner_unavailable', 'Case-Agent drive identity is empty');
    return routed;
  }

  const driveOwner = driveOwnerOverride === null ? Object.freeze({
    async initialize({ caseId, driveRequestId, payload = {} } = {}) {
      const route = driveRoute(caseId);
      const method = route.stub.initializeCaseAgentDrive;
      if (typeof method !== 'function') fail('mcp_trial_owner_unavailable', 'Case-Agent drive initialize RPC is unavailable');
      return publicJsonClone(await method.call(route.stub, { caseId, driveRequestId, payload }));
    },
    async read(caseId) {
      const route = driveRoute(caseId);
      const method = route.stub.readCaseAgentDrive;
      if (typeof method !== 'function') fail('mcp_trial_owner_unavailable', 'Case-Agent drive read RPC is unavailable');
      return publicJsonClone(await method.call(route.stub, { caseId }));
    },
    async quiesce({ caseId, ...input } = {}) {
      const route = driveRoute(caseId);
      const method = route.stub.quiesceCaseAgentDrive;
      if (typeof method !== 'function') fail('mcp_trial_owner_unavailable', 'Case-Agent drive quiesce RPC is unavailable');
      return publicJsonClone(await method.call(route.stub, { caseId, ...input }));
    },
    async snapshot(caseId) {
      const route = driveRoute(caseId);
      const method = route.stub.snapshotCaseAgentDrive;
      if (typeof method !== 'function') fail('mcp_trial_owner_unavailable', 'Case-Agent drive snapshot RPC is unavailable');
      return publicJsonClone(await method.call(route.stub, { caseId }));
    },
    async advance(input = {}) {
      if (!isPlainRecord(input)) fail('mcp_trial_owner_unavailable', 'Case-Agent drive advance input must be a record');
      const route = driveRoute(input.caseId);
      const method = route.stub.advanceCaseAgentDrive;
      if (typeof method !== 'function') fail('mcp_trial_owner_unavailable', 'Case-Agent drive advance RPC is unavailable');
      return publicJsonClone(await method.call(route.stub, canonicalClone(input)));
    },
  }) : Object.freeze({
    async initialize({ caseId, driveRequestId, payload = {} } = {}) {
      assertCaseId(caseId, normalized.casePrefix);
      return publicJsonClone(await driveOwnerOverride.initializeCaseAgentDrive({ caseId, driveRequestId, payload }));
    },
    async read(caseId) {
      assertCaseId(caseId, normalized.casePrefix);
      return publicJsonClone(await driveOwnerOverride.readCaseAgentDrive({ caseId }));
    },
    async quiesce({ caseId, ...input } = {}) {
      assertCaseId(caseId, normalized.casePrefix);
      return publicJsonClone(await driveOwnerOverride.quiesceCaseAgentDrive({ caseId, ...input }));
    },
    async snapshot(caseId) {
      assertCaseId(caseId, normalized.casePrefix);
      return publicJsonClone(await driveOwnerOverride.snapshotCaseAgentDrive({ caseId }));
    },
    async advance(input = {}) {
      if (!isPlainRecord(input)) fail('mcp_trial_owner_unavailable', 'Case-Agent drive advance input must be a record');
      assertCaseId(input.caseId, normalized.casePrefix);
      return publicJsonClone(await driveOwnerOverride.advanceCaseAgentDrive(canonicalClone(input)));
    },
  });

  function agentRoute() {
    const routed = routedStub(agentNs, normalized.agentOwner.routeKey ?? normalized.agentOwner.agentId, normalized.jurisdiction, 'Agent');
    const routeBinding = normalizeAgentRouteBinding({
      agentId: normalized.agentOwner.agentId,
      routeGeneration: normalized.agentOwner.routeGeneration,
      ...normalized.agentOwner.placement,
      durableObjectId: routed.id.toString(),
    });
    return { ...routed, routeBinding };
  }

  const agentOwner = Object.freeze({
    async invoke(operation, input = {}) {
      const route = agentRoute();
      assertIdentifier(operation, 'Agent operation');
      let expectedDeploymentIdentityDigest;
      if (MCP_TRIAL_AGENT_DEPLOYMENT_IDENTITY_OPERATIONS.has(operation)) {
        const probe = unwrapRpc(await route.stub.qualificationInvoke(publicJsonClone({
          profile: MCP_TRIAL_AGENT_RPC_PROFILE,
          operation: 'runtime_probe',
          agentId: normalized.agentOwner.agentId,
          routeGeneration: normalized.agentOwner.routeGeneration,
        })), 'Agent runtime_probe', { profile: MCP_TRIAL_AGENT_RPC_PROFILE, schemaVersion: 2 });
        assertDigest(probe?.deploymentIdentityDigest, 'Agent deployment identity digest');
        expectedDeploymentIdentityDigest = probe.deploymentIdentityDigest;
      }
      const rpc = {
        profile: MCP_TRIAL_AGENT_RPC_PROFILE,
        operation,
        agentId: normalized.agentOwner.agentId,
        routeGeneration: normalized.agentOwner.routeGeneration,
        ...canonicalClone(input),
        ...(expectedDeploymentIdentityDigest === undefined ? {} : { expectedDeploymentIdentityDigest }),
      };
      return unwrapRpc(await route.stub.qualificationInvoke(publicJsonClone(rpc)), `Agent ${operation}`, { profile: MCP_TRIAL_AGENT_RPC_PROFILE, schemaVersion: 2 });
    },
    async readRoute() { return this.invoke('read'); },
    async readResultHandoff(deliveryId) { return this.invoke('read_result_handoff', { deliveryId }); },
    routeBinding() { return publicJsonClone(agentRoute().routeBinding); },
  });

  const authorize = async ({ identity } = {}) => Boolean(
    identity?.principalId === normalized.identity.principalId && identity?.tenantId === normalized.identity.tenantId,
  );

  function assertContextSelector(selector) {
      if (selector !== null && selector !== normalized.repository.contextReference) {
        fail('mcp_trial_context_scope_denied', 'Context selector is outside the fixed trial reference');
      }
  }

  const contextOwner = Object.freeze({
    // Public MCP callers receive a bounded reference projection.  The full
    // tree remains an internal resolver input for development_unit_start and
    // is never copied into a discovery/context response.
    async developmentContextGet({ selector = null } = {}) {
      assertContextSelector(selector);
      const context = normalized.repository.context;
      return publicJsonClone({
        revisionId: context.revisionId,
        repositoryCommitOid: context.repositoryCommitOid,
        objectFormat: context.objectFormat,
        contextReferenceId: normalized.repository.contextReference,
        baseDigest: normalized.repository.baseDigest,
        ...(context.contextCapabilityId === undefined ? {} : { contextCapabilityId: context.contextCapabilityId }),
        ...(context.modelCapabilityId === undefined ? {} : { modelCapabilityId: context.modelCapabilityId }),
        ...(context.validationCapabilityId === undefined ? {} : { validationCapabilityId: context.validationCapabilityId }),
      });
    },
    async developmentContextResolve({ selector = null } = {}) {
      assertContextSelector(selector);
      return publicJsonClone(normalized.repository.context);
    },
  });

  if (driveRunner !== null && (!isPlainRecord(driveRunner) || typeof driveRunner.drive !== 'function')) {
    fail('mcp_trial_owner_unavailable', 'Injected drive runner must expose drive()');
  }
  return Object.freeze({
    manifest: normalized,
    repository,
    driveOwner,
    agentOwner,
    contextOwner,
    authorize,
    ...(driveRunner === null ? {} : { driveRunner }),
  });
}

export function createMcpTrialAuthorization(manifest) {
  const normalized = normalizeMcpTrialCompositionManifest(manifest);
  return async ({ identity } = {}) => identity?.principalId === normalized.identity.principalId && identity?.tenantId === normalized.identity.tenantId;
}
