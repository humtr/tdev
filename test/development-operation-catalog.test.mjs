import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  DEVELOPMENT_CANDIDATE_VALIDATE_OPERATION,
  DEVELOPMENT_CHANGESET_COMPOSE_BINDING,
  DEVELOPMENT_CHANGESET_COMPOSE_OPERATION,
  DEVELOPMENT_CHANGE_GENERATE_OPERATION,
  DEVELOPMENT_CODEX_BINDING,
  DEVELOPMENT_OPERATION_CATALOG_PROFILE,
  developmentOperationCapabilityId,
  developmentOperationCatalogDigest,
  developmentOperationDescriptor,
  listDevelopmentOperations,
  normalizeDevelopmentOperationCatalog,
  normalizeDevelopmentOperationSelection,
  operationBindingFor,
  requiredDevelopmentValidation,
} from '../src/development-operation-catalog.mjs';
import { digest } from '../src/canonical.mjs';

const manifest = JSON.parse(await readFile(new URL('../config/development-operation-catalog.json', import.meta.url), 'utf8'));

function catalog() {
  return normalizeDevelopmentOperationCatalog(structuredClone(manifest));
}

test('semantic operation catalog separates immutable contracts from concrete bindings and owner validation policy', () => {
  const value = catalog();
  assert.equal(value.profile, DEVELOPMENT_OPERATION_CATALOG_PROFILE);
  assert.match(developmentOperationCatalogDigest(value), /^sha256:[0-9a-f]{64}$/);
  const compose = developmentOperationDescriptor(value, DEVELOPMENT_CHANGESET_COMPOSE_OPERATION, 1);
  assert.equal(compose.callerSelectable, true);
  assert.equal(compose.resultKind, 'changeset');
  assert.equal(compose.effectClass, 'result-only');
  assert.match(compose.contractDigest, /^sha256:[0-9a-f]{64}$/);
  assert.match(compose.inputSchemaDigest, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(compose).includes('bindingId'), false);
  const binding = operationBindingFor(value, DEVELOPMENT_CHANGESET_COMPOSE_OPERATION, 1);
  assert.equal(binding.bindingId, DEVELOPMENT_CHANGESET_COMPOSE_BINDING);
  assert.equal(binding.kind, 'builtin');
  const validation = requiredDevelopmentValidation(value);
  assert.equal(validation.operationId, DEVELOPMENT_CANDIDATE_VALIDATE_OPERATION);
  assert.equal(validation.bindingId, 'tdev.binding.npm.repository-check.v1');
  assert.equal(value.bindings[DEVELOPMENT_CODEX_BINDING].optional, true);
  assert.match(developmentOperationCapabilityId(value, DEVELOPMENT_CHANGESET_COMPOSE_OPERATION, 1), /^sha256:[0-9a-f]{64}$/);
});

test('operation discovery is deterministic, bounded, and separates exact schema reads from summaries', () => {
  const value = catalog();
  const first = listDevelopmentOperations(value, { pageSize: 2 });
  assert.equal(first.items.length, 2);
  assert.equal(typeof first.nextCursor, 'string');
  assert.equal(Object.hasOwn(first.items[0], 'inputSchema'), false);
  assert.match(first.items[0].inputSchemaDigest, /^sha256:[0-9a-f]{64}$/);
  const second = listDevelopmentOperations(value, { cursor: first.nextCursor, pageSize: 10 });
  assert.ok(second.items.length >= 1);
  const exact = developmentOperationDescriptor(value, DEVELOPMENT_CHANGESET_COMPOSE_OPERATION, 1, {
    available: false,
    reason: 'host binding unavailable',
  });
  assert.equal(exact.availability.available, false);
  assert.equal(exact.availability.reason, 'host binding unavailable');
  assert.equal(exact.inputSchema.type, 'object');
  assert.throws(() => developmentOperationDescriptor(value, DEVELOPMENT_CHANGESET_COMPOSE_OPERATION, 2), (error) => error?.code === 'development_operation_unknown');
});

test('changeset.compose strictly normalizes the existing ChangeSet algebra and owner write scope', () => {
  const value = catalog();
  const descriptor = developmentOperationDescriptor(value, DEVELOPMENT_CHANGESET_COMPOSE_OPERATION, 1);
  const baseDigest = digest({ base: 'catalog-test' });
  const normalized = normalizeDevelopmentOperationSelection(value, {
    id: DEVELOPMENT_CHANGESET_COMPOSE_OPERATION,
    version: 1,
    contractDigest: descriptor.contractDigest,
    input: {
      baseDigest,
      writes: [
        { path: 'src/z.mjs', content: null },
        { path: 'src/a.mjs', content: 'export const a = 1;\n' },
      ],
    },
  }, { baseDigest, writePaths: ['src/a.mjs', 'src/z.mjs'] });
  assert.deepEqual(normalized.input.writes.map(({ path }) => path), ['src/a.mjs', 'src/z.mjs']);
  assert.equal(normalized.input.writes[1].content, null);
  assert.throws(() => normalizeDevelopmentOperationSelection(value, {
    id: DEVELOPMENT_CHANGESET_COMPOSE_OPERATION,
    version: 1,
    contractDigest: descriptor.contractDigest,
    input: { baseDigest, writes: [{ path: '../escape', content: 'x' }] },
  }, { baseDigest }), (error) => error?.code === 'invalid_path');
  assert.throws(() => normalizeDevelopmentOperationSelection(value, {
    id: DEVELOPMENT_CHANGESET_COMPOSE_OPERATION,
    version: 1,
    contractDigest: descriptor.contractDigest,
    input: { baseDigest, writes: [{ path: 'src/a.mjs', content: 'x' }, { path: 'src/a.mjs', content: 'y' }] },
  }, { baseDigest }), (error) => error?.code === 'duplicate_write');
  assert.throws(() => normalizeDevelopmentOperationSelection(value, {
    id: DEVELOPMENT_CHANGESET_COMPOSE_OPERATION,
    version: 1,
    contractDigest: descriptor.contractDigest,
    input: { baseDigest, writes: [{ path: 'src/not-admitted.mjs', content: 'x' }] },
  }, { baseDigest, writePaths: ['src/a.mjs'] }), (error) => error?.code === 'development_operation_scope_denied');
});

test('semantic contract mismatch, unknown fields, internal selection and Codex absence fail independently', () => {
  const value = catalog();
  const compose = developmentOperationDescriptor(value, DEVELOPMENT_CHANGESET_COMPOSE_OPERATION, 1);
  const baseDigest = digest({ base: 'strict' });
  assert.throws(() => normalizeDevelopmentOperationSelection(value, {
    id: DEVELOPMENT_CHANGESET_COMPOSE_OPERATION,
    version: 1,
    contractDigest: digest({ stale: true }),
    input: { baseDigest, writes: [] },
  }, { baseDigest }), (error) => error?.code === 'development_operation_contract_mismatch');
  assert.throws(() => normalizeDevelopmentOperationSelection(value, {
    id: DEVELOPMENT_CHANGESET_COMPOSE_OPERATION,
    version: 1,
    contractDigest: compose.contractDigest,
    input: { baseDigest, writes: [], executable: '/bin/sh' },
  }, { baseDigest }), (error) => error?.code === 'unexpected_keys');
  const validation = developmentOperationDescriptor(value, DEVELOPMENT_CANDIDATE_VALIDATE_OPERATION, 1);
  assert.throws(() => normalizeDevelopmentOperationSelection(value, {
    id: DEVELOPMENT_CANDIDATE_VALIDATE_OPERATION,
    version: 1,
    contractDigest: validation.contractDigest,
    input: { candidateDigest: digest({ candidate: 1 }) },
  }, { baseDigest }), (error) => error?.code === 'development_operation_not_selectable');
  const generated = developmentOperationDescriptor(value, DEVELOPMENT_CHANGE_GENERATE_OPERATION, 1, {
    available: false,
    reason: 'Codex not configured',
  });
  assert.equal(generated.availability.available, false);
  assert.equal(developmentOperationDescriptor(value, DEVELOPMENT_CHANGESET_COMPOSE_OPERATION, 1).availability.available, true);
});

test('catalog rejects semantic/binding substitution instead of changing an operation in place', () => {
  const changed = structuredClone(manifest);
  changed.bindings[DEVELOPMENT_CHANGESET_COMPOSE_BINDING].operationId = DEVELOPMENT_CHANGE_GENERATE_OPERATION;
  assert.throws(() => normalizeDevelopmentOperationCatalog(changed), (error) => error?.code === 'development_operation_catalog_incompatible');
  const optionalValidation = structuredClone(manifest);
  optionalValidation.bindings['tdev.binding.npm.repository-check.v1'].optional = true;
  assert.throws(() => normalizeDevelopmentOperationCatalog(optionalValidation), (error) => error?.code === 'invalid_development_operation_catalog');
});
