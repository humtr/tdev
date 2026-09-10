import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVELOPMENT_OPERATION_PROFILE,
  LAZY_CONTEXT_OPERATION_PROFILE,
  developmentOperationCapabilityId,
  developmentOperationManifestDigest,
  executeDevelopmentOperation,
  normalizeDevelopmentOperationManifest,
  normalizeDevelopmentOperationRequest,
} from '../src/development-operation-profile.mjs';
import { ContractError, digest } from '../src/canonical.mjs';

const manifest = {
  schemaVersion: 2,
  profile: DEVELOPMENT_OPERATION_PROFILE,
  profiles: {
    'context.v1': {
      kind: 'repository_context',
      executable: { kind: 'built_in', name: 'git-immutable-context' },
      argv: [],
      environment: {},
      filesystem: 'immutable_repository',
      network: 'none',
      limits: { timeoutMs: 1000, maxInputBytes: 16_384, maxOutputBytes: 65_536, maxFileBytes: 1_048_576, maxWorkspaceBytes: 2_097_152, cancelGraceMs: 0 },
      cleanupDomain: 'warden_process_group',
    },
    'model.v1': {
      kind: 'model_repository',
      executable: { kind: 'configured_runtime', name: 'codex' },
      argv: ['exec', '--ephemeral', '--json', '--ignore-user-config'],
      environment: {},
      filesystem: 'immutable_repository',
      network: 'openai-codex-trusted-local',
      limits: { timeoutMs: 1000, maxInputBytes: 16_384, maxOutputBytes: 65_536, maxFileBytes: 1_048_576, maxWorkspaceBytes: 2_097_152, cancelGraceMs: 0 },
      cleanupDomain: 'warden_process_group',
      credentialMode: 'codex_saved_cli_auth',
      disclosureProfile: 'tdev.openai-codex-full-context.trusted-local.v1',
      binding: { profile: 'tdev.model.codex-exec-no-bwrap.v1', executionBoundary: 'tdev.disposable-exact-base-no-bwrap.v1', outputSchemaPath: 'config/codex-changeset-output.schema.json' },
    },
    'validate.v1': {
      kind: 'repository_validation',
      executable: { kind: 'configured_runtime', name: 'npm' },
      argv: ['run', 'check'],
      environment: {},
      filesystem: 'candidate_workspace',
      network: 'none',
      limits: { timeoutMs: 1000, maxInputBytes: 16_384, maxOutputBytes: 65_536, maxFileBytes: 1_048_576, maxWorkspaceBytes: 2_097_152, cancelGraceMs: 0 },
      cleanupDomain: 'warden_process_group',
      credentialMode: 'none',
      binding: { profile: 'tdev.validation.npm-check.v1', validationCommand: 'npm run check' },
    },
  },
};

const commitOid = 'a'.repeat(40);
const baseDigest = digest({ base: 'tree' });

test('D0043 manifest is versioned, deterministic, and exposes only fixed release-bound profiles', () => {
  const normalized = normalizeDevelopmentOperationManifest(manifest);
  assert.equal(normalizeDevelopmentOperationManifest(normalized), normalized);
  assert.equal(Object.keys(normalized.profiles['model.v1'].environment).length, 0);
  assert.equal(normalized.profiles['model.v1'].binding.executionBoundary, 'tdev.disposable-exact-base-no-bwrap.v1');
  assert.equal(developmentOperationManifestDigest(manifest), developmentOperationManifestDigest(normalized));
  for (const profile of Object.keys(normalized.profiles)) {
    assert.match(developmentOperationCapabilityId(normalized, profile), /^sha256:[0-9a-f]{64}$/);
  }
});

test('D0043 rejects the predecessor sandbox argument template and missing execution boundary', () => {
  const legacy = structuredClone(manifest);
  legacy.profiles['model.v1'].argv = ['exec', '--ephemeral', '--json', '--sandbox', 'read-only', '--ignore-user-config'];
  assert.throws(() => normalizeDevelopmentOperationManifest(legacy), (error) => error instanceof ContractError && error.code === 'development_operation_model_arguments_invalid');
  const missingBoundary = structuredClone(manifest);
  delete missingBoundary.profiles['model.v1'].binding.executionBoundary;
  assert.throws(() => normalizeDevelopmentOperationManifest(missingBoundary), (error) => error instanceof ContractError && error.code === 'development_operation_model_binding_invalid');
});

test('D0043 requests select typed inputs and reject caller executable authority', () => {
  const model = normalizeDevelopmentOperationRequest(manifest, {
    profile: 'model.v1',
    input: { repositoryCommitOid: commitOid, baseDigest, instruction: 'change one source file' },
  });
  assert.equal(model.input.repositoryCommitOid, commitOid);
  assert.throws(
    () => normalizeDevelopmentOperationRequest(manifest, {
      profile: 'model.v1',
      input: { repositoryCommitOid: commitOid, baseDigest, instruction: 'x', argv: ['sh'] },
    }),
    (error) => error instanceof ContractError && error.code === 'development_operation_input_forbidden',
  );
  assert.throws(
    () => normalizeDevelopmentOperationRequest(manifest, {
      profile: 'validate.v1',
      input: { candidateTreeDigest: baseDigest, validationProfile: 'npm-check.v1', repositoryPath: '/tmp/repo' },
    }),
    (error) => error instanceof ContractError && error.code === 'development_operation_input_forbidden',
  );
});

test('D0047 lazy context and model requests require the owner-issued full-base identity', () => {
  const scope = { paths: ['src/a.mjs'], maxFiles: 1, maxBytes: 1024 };
  const lazyManifest = structuredClone(manifest);
  lazyManifest.profiles[LAZY_CONTEXT_OPERATION_PROFILE] = structuredClone(lazyManifest.profiles['context.v1']);
  assert.throws(() => normalizeDevelopmentOperationRequest(lazyManifest, {
    profile: LAZY_CONTEXT_OPERATION_PROFILE,
    input: { repositoryCommitOid: commitOid, baseDigest, objectFormat: 'sha1', scope },
  }), (error) => error instanceof ContractError && error.code === 'development_operation_request_invalid');
  assert.throws(() => normalizeDevelopmentOperationRequest(manifest, {
    profile: 'model.v1',
    input: {
      repositoryCommitOid: commitOid,
      baseDigest,
      instruction: 'change',
      contextProfile: LAZY_CONTEXT_OPERATION_PROFILE,
      contextScope: scope,
      contextScopeDigest: baseDigest,
    },
  }), (error) => error instanceof ContractError);
});

test('D0043 owner-issued write scope is normalized and cannot be widened by model input', () => {
  const model = normalizeDevelopmentOperationRequest(manifest, {
    profile: 'model.v1',
    input: { repositoryCommitOid: commitOid, baseDigest, instruction: 'change one source file', writePaths: ['test/b.mjs', 'src/a.mjs'] },
  });
  assert.deepEqual(model.input.writePaths, ['src/a.mjs', 'test/b.mjs']);
  assert.throws(() => normalizeDevelopmentOperationRequest(manifest, {
    profile: 'model.v1',
    input: { repositoryCommitOid: commitOid, baseDigest, instruction: 'x', writePaths: ['src/a.mjs', 'src/a.mjs'] },
  }), (error) => error instanceof ContractError && error.code === 'development_operation_write_scope_invalid');
});

test('D0047 rejects exclusion bindings that would silently redefine the base scope', () => {
  const legacy = structuredClone(manifest);
  legacy.profiles['model.v1'].binding.contextExcludedPaths = ['native/blob'];
  assert.throws(
    () => normalizeDevelopmentOperationManifest(legacy),
    (error) => error instanceof ContractError && error.code === 'development_operation_binding_invalid',
  );
});

test('D0043 capability intersection and typed dispatch select exactly one operation owner', async () => {
  const capabilityId = developmentOperationCapabilityId(manifest, 'model.v1');
  let called = 0;
  const output = await executeDevelopmentOperation({
    manifest,
    request: { profile: 'model.v1', input: { repositoryCommitOid: commitOid, baseDigest, instruction: 'bounded' } },
    capabilities: [capabilityId],
    modelExecutor: async (request) => {
      called += 1;
      assert.equal(request.kind, 'model_repository');
      assert.equal(request.input.instruction, 'bounded');
      return { kind: 'changeset', writes: [] };
    },
  });
  assert.equal(called, 1);
  assert.equal(output.capabilityId, capabilityId);
  assert.equal(output.result.kind, 'changeset');
  assert.deepEqual(output.result.writes, []);
  await assert.rejects(
    () => executeDevelopmentOperation({
      manifest,
      request: { profile: 'model.v1', input: { repositoryCommitOid: commitOid, baseDigest, instruction: 'bounded' } },
      capabilities: [],
      modelExecutor: async () => ({ kind: 'changeset', writes: [] }),
    }),
    (error) => error instanceof ContractError && error.code === 'development_operation_capability_denied',
  );
});

test('D0043 validation dispatch preserves a false result and cancellation stops before callback', async () => {
  const capabilityId = developmentOperationCapabilityId(manifest, 'validate.v1');
  let called = 0;
  const result = await executeDevelopmentOperation({
    manifest,
    request: { profile: 'validate.v1', input: { candidateTreeDigest: baseDigest, validationProfile: 'npm-check.v1' } },
    capabilities: [capabilityId],
    validationExecutor: async ({ input }) => {
      called += 1;
      return { kind: 'validation', passed: false, checks: [{ id: input.validationProfile, passed: false }] };
    },
  });
  assert.equal(called, 1);
  assert.equal(result.result.passed, false);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => executeDevelopmentOperation({
      manifest,
      request: { profile: 'context.v1', input: { repositoryCommitOid: commitOid, baseDigest, objectFormat: 'sha1' } },
      capabilities: [developmentOperationCapabilityId(manifest, 'context.v1')],
      signal: controller.signal,
      contextExecutor: async () => { throw new Error('must not execute'); },
    }),
    (error) => error instanceof ContractError && error.code === 'development_operation_aborted',
  );
});

test('D0043 rejects profile widening and unsupported network/environment before execution', () => {
  const network = structuredClone(manifest);
  network.profiles['model.v1'].network = 'internet';
  assert.throws(
    () => normalizeDevelopmentOperationManifest(network),
    (error) => error instanceof ContractError && error.code === 'development_operation_network_denied',
  );
  const environment = structuredClone(manifest);
  environment.profiles['model.v1'].environment = { NODE_ENV: 'production' };
  assert.throws(
    () => normalizeDevelopmentOperationManifest(environment),
    (error) => error instanceof ContractError && error.code === 'development_operation_environment_denied',
  );
});
