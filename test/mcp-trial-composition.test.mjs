import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MCP_AUTH_PROFILE,
  MCP_TRIAL_AGENT_CLASS_NAME,
  MCP_TRIAL_AGENT_RPC_PROFILE,
  MCP_TRIAL_CASE_CLASS_NAME,
  MCP_TRIAL_COMPOSITION_PROFILE,
  MCP_TRIAL_COMPOSITION_RESOURCE,
  MCP_TRIAL_DRIVE_CLASS_NAME,
  createMcpTrialOwnerFacades,
  digest,
  normalizeMcpTrialCompositionBinding,
  normalizeMcpTrialCompositionManifest,
  agentRouteHostKey,
} from '../src/index.mjs';
import { createRepositoryBaseIdentity, scopeDigest } from '../src/lazy-plan-reference.mjs';

const COMMIT = 'a'.repeat(40);
const BASE_TREE = { 'src/base.mjs': 'export const base = 1;\n' };

function placement(workerScript, className, namespace) {
  return {
    deployment: 'qualification',
    environment: 'nonproduction',
    workerScript,
    className,
    namespace,
    jurisdiction: 'global',
  };
}

function manifest(overrides = {}) {
  const repository = {
    commitOid: COMMIT,
    baseDigest: digest(BASE_TREE),
    objectFormat: 'sha1',
    contextReference: 'ctx-trial-1',
    context: {
      revisionId: 'revision-trial-1',
      baseTree: BASE_TREE,
      repositoryCommitOid: COMMIT,
      objectFormat: 'sha1',
      contextReferenceId: 'ctx-trial-1',
    },
  };
  return {
    schemaVersion: 1,
    profile: MCP_TRIAL_COMPOSITION_PROFILE,
    resource: MCP_TRIAL_COMPOSITION_RESOURCE,
    workerScript: 'tdev-mcp-trial',
    environment: 'nonproduction',
    jurisdiction: 'global',
    caseOwner: { placement: placement('tdev-d0020-composition-case-r1', MCP_TRIAL_CASE_CLASS_NAME, 'case-ns'), d1Binding: 'TDEV_CASE_PLACEMENT' },
    driveOwner: { placement: placement('tdev-mcp-trial', MCP_TRIAL_DRIVE_CLASS_NAME, 'drive-ns') },
    agentOwner: { placement: placement('tdev-d0020-qualification-clean-a', MCP_TRIAL_AGENT_CLASS_NAME, 'agent-ns'), agentId: 'agent-trial', routeGeneration: 1 },
    repository,
    operation: {
      manifestDigest: digest({ operation: 'd0043' }),
      contextProfile: 'tdev.repository.context.prepare.v1',
      modelProfile: 'tdev.model.repository.execute.v1',
      validationProfile: 'tdev.repository.validate.v1',
    },
    identity: { principalId: 'principal-trial', tenantId: 'tenant-trial' },
    authProfile: MCP_AUTH_PROFILE,
    casePrefix: 'trial-',
    canonicalWriterEnabled: false,
    previewWritersEnabled: false,
    ...overrides,
  };
}



function lazyManifest() {
  const base = manifest();
  const scope = {
    schemaVersion: 1,
    profile: 'tdev.repository-context-scope.v1',
    paths: ['src/base.mjs'],
    prefixes: [],
    maxFiles: 8,
    maxBytes: 1024 * 1024,
    maxSearchResults: 16,
  };
  const repositoryBaseIdentity = createRepositoryBaseIdentity({
    objectFormat: 'sha1',
    commitOid: COMMIT,
    treeOid: 'b'.repeat(40),
    manifestDigest: digest({ profile: 'test.repository-manifest.v1' }),
  });
  const baseIdentity = {
    schemaVersion: 1,
    profile: 'tdev.repository-base-identity.v1',
    objectFormat: 'sha1',
    commitOid: COMMIT,
    treeOid: repositoryBaseIdentity.treeOid,
    baseDigest: base.repository.baseDigest,
    manifestDigest: repositoryBaseIdentity.manifestDigest,
  };
  return {
    ...base,
    repository: {
      ...base.repository,
      repositoryBaseIdentity,
      scope,
      scopeDigest: scopeDigest(scope),
      context: {
        ...base.repository.context,
        contextProfile: 'tdev.repository.context.prepare.lazy.v1',
        contextScope: scope,
        scopeDigest: scopeDigest(scope),
        baseIdentity,
        repositoryBaseIdentity,
      },
    },
    operation: { ...base.operation, contextProfile: 'tdev.repository.context.prepare.lazy.v1' },
  };
}

function namespace(route, calls) {
  return {
    idFromName(name) {
      calls.push(`id:${route}:${name}`);
      return { jurisdiction: 'global', toString: () => `${route}-do-${name}` };
    },
    idFromString(value) {
      calls.push(`id-string:${route}:${value}`);
      return { jurisdiction: 'global', toString: () => value };
    },
    get(id) {
      calls.push(`get:${route}:${id.toString()}`);
      return route === 'case'
        ? { qualificationInvoke: async (input) => ({ schemaVersion: 1, ok: true, result: input.operation === 'load' ? { snapshot: { caseId: input.placement.caseId, caseRevision: 1 } } : { snapshot: { caseId: input.placement.caseId, caseRevision: 1 } } }) }
        : route === 'drive'
          ? {
              initializeCaseAgentDrive: async (input) => ({ classification: 'accepted', caseId: input.caseId }),
              readCaseAgentDrive: async (input) => ({ caseId: input.caseId, revision: 0 }),
              quiesceCaseAgentDrive: async (input) => ({ classification: 'quiesced', caseId: input.caseId }),
              snapshotCaseAgentDrive: async (input) => ({ caseId: input.caseId, revision: 0 }),
            }
          : { qualificationInvoke: async (input) => ({ profile: MCP_TRIAL_AGENT_RPC_PROFILE, schemaVersion: 2, ok: true, result: { operation: input.operation } }) };
    },
  };
}

test('D0046 trial manifest binds one fixed resource, owner set and immutable base', () => {
  const normalized = normalizeMcpTrialCompositionManifest(manifest());
  assert.equal(normalizeMcpTrialCompositionManifest(normalized), normalized);
  assert.equal(normalized.resource, MCP_TRIAL_COMPOSITION_RESOURCE);
  assert.equal(normalized.repository.baseDigest, digest(BASE_TREE));
  assert.equal(normalized.agentOwner.agentId, 'agent-trial');
  assert.equal(normalized.operation.contextProfile, 'tdev.repository.context.prepare.v1');
  assert.match(normalized.manifestDigest, /^sha256:[0-9a-f]{64}$/u);
});

test('D0046 Agent owner restores an exact provider Durable Object identity when bound', async () => {
  const calls = [];
  const durableObjectId = 'b'.repeat(64);
  const input = manifest();
  input.agentOwner = {
    ...input.agentOwner,
    routeKey: agentRouteHostKey({ agentId: input.agentOwner.agentId, routeGeneration: input.agentOwner.routeGeneration }),
    durableObjectId,
  };
  const normalized = normalizeMcpTrialCompositionManifest(input);
  assert.equal(normalized.agentOwner.durableObjectId, durableObjectId);
  const owners = createMcpTrialOwnerFacades({
    manifest: normalized,
    caseNamespace: namespace('case', calls),
    driveNamespace: namespace('drive', calls),
    agentNamespace: namespace('agent', calls),
  });
  await owners.agentOwner.readRoute();
  assert.ok(calls.includes(`id-string:agent:${durableObjectId}`));
  assert.equal(calls.some((entry) => entry.startsWith('id:agent:')), false);
});



test('D0046 trial composition preserves one normalized lazy repository/context binding', () => {
  const input = lazyManifest();
  const normalized = normalizeMcpTrialCompositionManifest(input);
  assert.deepEqual(normalized.repository.scope, input.repository.scope);
  assert.equal(normalized.repository.scopeDigest, input.repository.scopeDigest);
  assert.deepEqual(normalized.repository.repositoryBaseIdentity, input.repository.repositoryBaseIdentity);
  assert.deepEqual(normalized.repository.context.contextScope, input.repository.scope);
  assert.equal(normalized.repository.context.scopeDigest, input.repository.scopeDigest);
  assert.equal(normalized.repository.context.baseIdentity.manifestDigest, input.repository.repositoryBaseIdentity.manifestDigest);
  assert.equal(normalized.operation.contextProfile, 'tdev.repository.context.prepare.lazy.v1');
  const binding = normalizeMcpTrialCompositionBinding({
    ...normalized,
    repository: {
      ...normalized.repository,
      context: { ...normalized.repository.context, baseTree: {} },
    },
  });
  assert.equal(Object.keys(binding.repository.context.baseTree).length, 0);
  assert.equal(binding.repository.scopeDigest, normalized.repository.scopeDigest);
  assert.equal(binding.repository.context.scopeDigest, normalized.repository.context.scopeDigest);
  assert.equal(binding.repository.context.baseIdentity.manifestDigest, normalized.repository.context.baseIdentity.manifestDigest);
});

test('D0046 trial composition rejects divergent lazy scope, identity, and operation bindings', () => {
  const scopeMismatch = lazyManifest();
  scopeMismatch.repository.context = {
    ...scopeMismatch.repository.context,
    contextScope: { ...scopeMismatch.repository.scope, paths: ['src/other.mjs'] },
  };
  assert.throws(() => normalizeMcpTrialCompositionManifest(scopeMismatch), (error) => error?.code === 'mcp_trial_context_mismatch');

  const identityMismatch = lazyManifest();
  identityMismatch.repository.context = {
    ...identityMismatch.repository.context,
    baseIdentity: { ...identityMismatch.repository.context.baseIdentity, treeOid: 'c'.repeat(40) },
  };
  assert.throws(() => normalizeMcpTrialCompositionManifest(identityMismatch), (error) => error?.code === 'mcp_trial_context_mismatch');

  const profileMismatch = lazyManifest();
  profileMismatch.operation = { ...profileMismatch.operation, contextProfile: 'tdev.repository.context.prepare.v1' };
  assert.throws(() => normalizeMcpTrialCompositionManifest(profileMismatch), (error) => error?.code === 'mcp_trial_manifest_invalid');
});

test('D0046 deployment binding accepts only the intentionally omitted base tree', () => {
  const full = manifest();
  const binding = normalizeMcpTrialCompositionBinding({
    ...full,
    repository: { ...full.repository, context: { ...full.repository.context, baseTree: {} } },
    manifestDigest: 'sha256:' + 'b'.repeat(64),
  });
  assert.equal(binding.repository.context.baseTree && Object.keys(binding.repository.context.baseTree).length, 0);
  assert.equal(binding.manifestDigest, 'sha256:' + 'b'.repeat(64));
  assert.throws(() => normalizeMcpTrialCompositionBinding({ ...full, manifestDigest: 'sha256:' + 'b'.repeat(64) }), (error) => error?.code === 'mcp_trial_binding_invalid');
});

test('D0046 owner facades route only fixed Case/Drive/Agent identities', async () => {
  const calls = [];
  const owners = createMcpTrialOwnerFacades({
    manifest: manifest(),
    caseNamespace: namespace('case', calls),
    driveNamespace: namespace('drive', calls),
    agentNamespace: namespace('agent', calls),
  });
  const caseId = 'trial-case-1';
  const plan = { baseTree: BASE_TREE, baseDigest: digest(BASE_TREE) };
  const created = await owners.repository.create({ caseId, plan });
  assert.equal(created.snapshot().caseId, caseId);
  assert.equal((await owners.driveOwner.initialize({ caseId, driveRequestId: 'drive-1' })).classification, 'accepted');
  assert.equal((await owners.agentOwner.readRoute()).operation, 'read');
  assert.deepEqual(owners.agentOwner.routeBinding(), {
    agentId: 'agent-trial',
    routeGeneration: 1,
    deployment: 'qualification',
    environment: 'nonproduction',
    workerScript: 'tdev-d0020-qualification-clean-a',
    className: MCP_TRIAL_AGENT_CLASS_NAME,
    namespace: 'agent-ns',
    jurisdiction: 'global',
    durableObjectId: 'agent-do-agent-trial',
  });
  await assert.rejects(() => owners.repository.load('other-case'), (error) => error?.code === 'mcp_trial_case_scope_denied');
  assert.ok(calls.some((entry) => entry === 'id:case:trial-case-1'));
  assert.ok(calls.every((entry) => !entry.includes('other-case')));
  assert.equal(MCP_TRIAL_AGENT_RPC_PROFILE, 'tdev.installable-agent-qualification-rpc.v2');
});

test('D0046 Agent data-plane calls bind the live deployment identity for old and new provider RPCs', async () => {
  const calls = [];
  const deploymentIdentityDigest = 'sha256:' + 'd'.repeat(64);
  const agentNamespace = {
    idFromName(name) { return { jurisdiction: 'global', toString: () => `agent-do-${name}` }; },
    get() {
      return {
        async qualificationInvoke(input) {
          calls.push(input);
          if (input.operation === 'runtime_probe') return { profile: MCP_TRIAL_AGENT_RPC_PROFILE, schemaVersion: 2, ok: true, result: { deploymentIdentityDigest } };
          return { profile: MCP_TRIAL_AGENT_RPC_PROFILE, schemaVersion: 2, ok: true, result: { operation: input.operation } };
        },
      };
    },
  };
  const owners = createMcpTrialOwnerFacades({
    manifest: manifest(),
    caseNamespace: namespace('case', []),
    driveNamespace: namespace('drive', []),
    agentNamespace,
  });
  assert.equal((await owners.agentOwner.invoke('reserve', { request: { id: 'r1' }, nowMs: 1 })).operation, 'reserve');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].operation, 'runtime_probe');
  assert.equal(calls[1].operation, 'reserve');
  assert.equal(calls[1].expectedDeploymentIdentityDigest, deploymentIdentityDigest);
  assert.deepEqual(calls[1].request, { id: 'r1' });
  assert.equal(calls[1].nowMs, 1);
});

test('D0046 execution host can bind the existing Drive owner locally without a recursive namespace call', async () => {
  const calls = [];
  const localDrive = new class {
    async initializeCaseAgentDrive(input) { calls.push(['initialize', input.caseId]); return { classification: 'accepted', caseId: input.caseId }; }
    async readCaseAgentDrive(input) { calls.push(['read', input.caseId]); return { caseId: input.caseId, revision: 0 }; }
    async quiesceCaseAgentDrive(input) { calls.push(['quiesce', input.caseId]); return { classification: 'quiesced', caseId: input.caseId }; }
    async snapshotCaseAgentDrive(input) { calls.push(['snapshot', input.caseId]); return { caseId: input.caseId, revision: 0 }; }
    async advanceCaseAgentDrive(input) { calls.push(['advance', input.caseId]); return { classification: 'accepted', caseId: input.caseId }; }
  }();
  const owners = createMcpTrialOwnerFacades({
    manifest: manifest(),
    caseNamespace: namespace('case', calls),
    driveNamespace: null,
    driveOwnerOverride: localDrive,
    agentNamespace: namespace('agent', calls),
  });
  assert.equal((await owners.driveOwner.initialize({ caseId: 'trial-local', driveRequestId: 'drive-local' })).classification, 'accepted');
  assert.equal((await owners.driveOwner.read('trial-local')).revision, 0);
  assert.equal((await owners.driveOwner.advance({ caseId: 'trial-local', driveRequestId: 'drive-local', caseObservation: {}, agentObservation: {} })).classification, 'accepted');
  assert.deepEqual(calls.filter((entry) => entry[0] === 'initialize' || entry[0] === 'read' || entry[0] === 'advance'), [
    ['initialize', 'trial-local'],
    ['read', 'trial-local'],
    ['advance', 'trial-local'],
  ]);
  assert.equal(calls.some((entry) => String(entry[0]).startsWith('id:drive')), false);
});

test('D0046 public context is a bounded reference and full context stays resolver-internal', async () => {
  const owners = createMcpTrialOwnerFacades({
    manifest: manifest(),
    caseNamespace: namespace('case', []),
    driveNamespace: namespace('drive', []),
    agentNamespace: namespace('agent', []),
  });
  const publicContext = await owners.contextOwner.developmentContextGet({ selector: 'ctx-trial-1' });
  assert.equal(publicContext.contextReferenceId, 'ctx-trial-1');
  assert.equal(publicContext.baseDigest, digest(BASE_TREE));
  assert.equal(Object.hasOwn(publicContext, 'baseTree'), false);
  const fullContext = await owners.contextOwner.developmentContextResolve({ selector: 'ctx-trial-1' });
  assert.deepEqual(fullContext.baseTree, BASE_TREE);
});

test('D0046 trial rejects canonical writers, resource substitution and context substitution', () => {
  assert.throws(() => normalizeMcpTrialCompositionManifest(manifest({ canonicalWriterEnabled: true })), (error) => error?.code === 'mcp_trial_writer_forbidden');
  assert.throws(() => normalizeMcpTrialCompositionManifest(manifest({ resource: 'https://other.invalid/mcp' })), (error) => error?.code === 'mcp_trial_resource_mismatch');
  const altered = manifest();
  altered.repository.context = { ...altered.repository.context, contextReferenceId: 'ctx-other' };
  assert.throws(() => normalizeMcpTrialCompositionManifest(altered), (error) => error?.code === 'mcp_trial_context_mismatch');
});

test('D0046 trial accepts bounded Cloudflare Access principal and tenant claims', () => {
  const normalized = normalizeMcpTrialCompositionManifest(manifest({
    identity: { principalId: 'user@example.com', tenantId: 'user@example.com' },
  }));
  assert.equal(normalized.identity.principalId, 'user@example.com');
  assert.equal(normalized.identity.tenantId, 'user@example.com');
});

test('D0046 elected Agent route is generation-bound when a route host key is supplied', () => {
  const agentId = 'agent-trial';
  const routeGeneration = 3;
  const routeKey = agentRouteHostKey({ agentId, routeGeneration });
  const normalized = normalizeMcpTrialCompositionManifest(manifest({
    agentOwner: {
      ...manifest().agentOwner,
      agentId,
      routeGeneration,
      routeKey,
    },
  }));
  assert.equal(normalized.agentOwner.routeKey, routeKey);
  assert.throws(() => normalizeMcpTrialCompositionManifest(manifest({
    agentOwner: { ...manifest().agentOwner, routeGeneration, routeKey: 'agent-trial' },
  })), (error) => error?.code === 'mcp_trial_agent_route_mismatch');
});
