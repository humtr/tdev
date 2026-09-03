import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVELOPMENT_OPERATION_PROFILE,
  developmentOperationCapabilityId,
  developmentOperationManifestDigest,
  executeDevelopmentOperation,
  normalizeDevelopmentOperationManifest,
  normalizeDevelopmentOperationRequest,
} from '../src/development-operation-profile.mjs';
import { ContractError, digest } from '../src/canonical.mjs';

const manifest = {
  schemaVersion: 1,
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
      executable: { kind: 'configured_runtime', name: 'release-bound-model-runtime' },
      argv: [],
      environment: {},
      filesystem: 'immutable_repository',
      network: 'none',
      limits: { timeoutMs: 1000, maxInputBytes: 16_384, maxOutputBytes: 65_536, maxFileBytes: 1_048_576, maxWorkspaceBytes: 2_097_152, cancelGraceMs: 0 },
      cleanupDomain: 'warden_process_group',
    },
    'validate.v1': {
      kind: 'repository_validation',
      executable: { kind: 'configured_runtime', name: 'release-bound-validation-runtime' },
      argv: [],
      environment: {},
      filesystem: 'candidate_workspace',
      network: 'none',
      limits: { timeoutMs: 1000, maxInputBytes: 16_384, maxOutputBytes: 65_536, maxFileBytes: 1_048_576, maxWorkspaceBytes: 2_097_152, cancelGraceMs: 0 },
      cleanupDomain: 'warden_process_group',
    },
  },
};

const commitOid = 'a'.repeat(40);
const baseDigest = digest({ base: 'tree' });

test('D0043 manifest is versioned, deterministic, and exposes only fixed release-bound profiles', () => {
  const normalized = normalizeDevelopmentOperationManifest(manifest);
  assert.equal(Object.keys(normalized.profiles['model.v1'].environment).length, 0);
  assert.equal(developmentOperationManifestDigest(manifest), developmentOperationManifestDigest(normalized));
  for (const profile of Object.keys(normalized.profiles)) {
    assert.match(developmentOperationCapabilityId(normalized, profile), /^sha256:[0-9a-f]{64}$/);
  }
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
