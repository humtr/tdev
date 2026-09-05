import test from 'node:test';
import assert from 'node:assert/strict';

import {
  D0046_CASE_NAMESPACE,
  D0046_CASE_PLACEMENT_DATABASE,
  D0046_CASE_SCRIPT,
  D0046_QUALIFIED_CASE_AUTHORITATIVE_BYTES,
} from '../qualification/d0046-mcp-trial-deploy.mjs';
import {
  assertCaseCapacityPrecondition,
  assertCaseCapacityReadback,
  buildCaseCapacityPatchSettings,
  caseCapacity,
  redactedBindings,
} from '../qualification/d0046-case-capacity-correction.mjs';

function ownerSettings(capacity = 8 * 1024 * 1024) {
  return {
    bindings: [
      { name: 'TDEV_CASE_AUTHORITY', type: 'durable_object_namespace', class_name: 'CaseRuntimeDO', namespace_id: D0046_CASE_NAMESPACE },
      { name: 'TDEV_CASEDO_JURISDICTION', type: 'plain_text', text: 'global' },
      { name: 'TDEV_CASEDO_MAX_AUTHORITATIVE_BYTES_PER_CASE', type: 'plain_text', text: String(capacity) },
      { name: 'TDEV_CASEDO_NAMESPACE', type: 'plain_text', text: D0046_CASE_NAMESPACE },
      { name: 'TDEV_CASEDO_WRITER_COMPATIBILITY_ID', type: 'plain_text', text: 'd0020-composition-r1' },
      { name: 'TDEV_CASE_PLACEMENT', type: 'd1', database_id: D0046_CASE_PLACEMENT_DATABASE, id: D0046_CASE_PLACEMENT_DATABASE },
      { name: 'TDEV_D0019_QUALIFICATION_MODE', type: 'plain_text', text: 'enabled' },
      { name: 'TDEV_D0019_QUALIFICATION_TOKEN', type: 'secret_text' },
      { name: 'TDEV_DEPLOYMENT', type: 'plain_text', text: D0046_CASE_SCRIPT },
      { name: 'TDEV_ENVIRONMENT', type: 'plain_text', text: 'qualification' },
      { name: 'TDEV_SOURCE_SHA', type: 'plain_text', text: 'e4420cb776bf8f6a4bde4d636aef7bc4bb2b2626' },
      { name: 'TDEV_WORKER_SCRIPT', type: 'plain_text', text: D0046_CASE_SCRIPT },
      { name: 'TDEV_WORKER_VERSION', type: 'version_metadata' },
    ],
  };
}

test('D0046 capacity correction changes one binding and inherits the secret', () => {
  const before = ownerSettings();
  assert.deepEqual(assertCaseCapacityPrecondition(before), { state: 'ready', configuredBytes: 8 * 1024 * 1024 });
  const patch = buildCaseCapacityPatchSettings(before, '08b3463b-f0dd-4109-9baf-5f01b481f637');
  assert.equal(patch.bindings.find((binding) => binding.name === 'TDEV_CASEDO_MAX_AUTHORITATIVE_BYTES_PER_CASE').text, String(D0046_QUALIFIED_CASE_AUTHORITATIVE_BYTES));
  assert.deepEqual(patch.bindings.find((binding) => binding.name === 'TDEV_D0019_QUALIFICATION_TOKEN'), {
    name: 'TDEV_D0019_QUALIFICATION_TOKEN',
    type: 'inherit',
    version_id: 'latest',
  });
  assert.equal(patch.bindings.length, before.bindings.length);
});

test('D0046 capacity correction readback is exact and idempotent', () => {
  const target = ownerSettings(D0046_QUALIFIED_CASE_AUTHORITATIVE_BYTES);
  assert.equal(caseCapacity(target), D0046_QUALIFIED_CASE_AUTHORITATIVE_BYTES);
  assert.deepEqual(assertCaseCapacityPrecondition(target), {
    state: 'already-correct',
    configuredBytes: D0046_QUALIFIED_CASE_AUTHORITATIVE_BYTES,
  });
  assert.deepEqual(assertCaseCapacityReadback(target, redactedBindings(target)).configuredBytes, D0046_QUALIFIED_CASE_AUTHORITATIVE_BYTES);
});
