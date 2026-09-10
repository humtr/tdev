import {
  ContractError,
  assertDigest,
  assertIdentifier,
  assertRecordShape,
  assertSafeInteger,
  assertScalarString,
  canonicalClone,
  canonicalJson,
  compareText,
  deepFreeze,
  digest,
  isPlainRecord,
  typedDigest,
} from './canonical.mjs';
import { normalizeChangeSet } from './results.mjs';
import { normalizeCaseContract } from './policy.mjs';

export const DEVELOPMENT_OPERATION_CATALOG_PROFILE = 'tdev.development-operation-catalog.v1';
export const DEVELOPMENT_CONTEXT_BIND_OPERATION = 'tdev.operation.repository.context.bind.v1';
export const DEVELOPMENT_CHANGESET_COMPOSE_OPERATION = 'tdev.operation.repository.changeset.compose.v1';
export const DEVELOPMENT_CANDIDATE_VALIDATE_OPERATION = 'tdev.operation.repository.candidate.validate.v1';
export const DEVELOPMENT_CHANGE_GENERATE_OPERATION = 'tdev.operation.repository.change.generate.v1';
export const DEVELOPMENT_CHANGESET_COMPOSE_BINDING = 'tdev.binding.builtin.changeset-compose.v1';
export const DEVELOPMENT_CONTEXT_BINDING = 'tdev.binding.repository-context.git-scoped-lazy.v1';
export const DEVELOPMENT_VALIDATION_BINDING = 'tdev.binding.npm.repository-check.v1';
export const DEVELOPMENT_CODEX_BINDING = 'tdev.binding.codex.repository-change.v1';
export const DEVELOPMENT_REQUIRED_VALIDATION_POLICY = 'tdev.policy.repository.validation.required.v1';

const RESULT_KINDS = new Set(['changeset', 'observation', 'validation', 'artifact-set', 'effect-receipt']);
const EFFECT_CLASSES = new Set(['result-only', 'idempotent-effect', 'non-idempotent-effect']);
const SELECTION_SCOPES = new Set(['internal', 'development']);
const BINDING_KINDS = new Set(['builtin', 'legacy_profile']);
const MAX_OPERATIONS = 128;
const MAX_BINDINGS = 256;
const MAX_EFFECTS = 32;
const MAX_CAPABILITIES = 128;
const MAX_DESCRIPTION_BYTES = 16 * 1024;

function fail(code, message, details = undefined) {
  throw new ContractError(code, message, details);
}

function boundedText(value, label, { maxBytes = MAX_DESCRIPTION_BYTES, allowEmpty = false } = {}) {
  assertScalarString(value, label);
  if ((!allowEmpty && value.length === 0) || value.includes('\0') || Buffer.byteLength(value, 'utf8') > maxBytes) {
    fail('invalid_development_operation_catalog', `${label} is outside its text bound`);
  }
  return value;
}

function normalizeUniqueStrings(values, label, { max = MAX_CAPABILITIES, identifiers = false } = {}) {
  if (!Array.isArray(values) || values.length > max) fail('invalid_development_operation_catalog', `${label} must be a bounded array`);
  const result = values.map((value, index) => {
    boundedText(value, `${label}[${index}]`, { maxBytes: 256 });
    if (identifiers) assertIdentifier(value, `${label}[${index}]`);
    return value;
  }).sort(compareText);
  for (let index = 1; index < result.length; index += 1) {
    if (result[index] === result[index - 1]) fail('invalid_development_operation_catalog', `${label} contains a duplicate value`, { value: result[index] });
  }
  return result;
}

function normalizeSchema(schema, label) {
  if (!isPlainRecord(schema)) fail('invalid_development_operation_catalog', `${label} must be a JSON-schema record`);
  const value = canonicalClone(schema);
  if (Buffer.byteLength(canonicalJson(value), 'utf8') > 256 * 1024) fail('invalid_development_operation_catalog', `${label} exceeds its byte bound`);
  return value;
}

function contractBody(id, operation) {
  return {
    id,
    version: operation.version,
    title: operation.title,
    description: operation.description,
    inputSchema: operation.inputSchema,
    resultKind: operation.resultKind,
    effectClass: operation.effectClass,
    effects: operation.effects,
    requiredCapabilities: operation.requiredCapabilities,
    cancellable: operation.cancellable,
    selectionScope: operation.selectionScope,
    callerSelectable: operation.callerSelectable,
  };
}

function normalizeOperation(id, input) {
  assertIdentifier(id, 'development operation id');
  assertRecordShape(input, [
    'version', 'title', 'description', 'inputSchema', 'resultKind', 'effectClass', 'effects', 'requiredCapabilities',
    'cancellable', 'selectionScope', 'callerSelectable',
  ], ['inputSchemaDigest', 'contractDigest'], `development operation ${id}`);
  assertSafeInteger(input.version, `${id}.version`, { min: 1 });
  boundedText(input.title, `${id}.title`, { maxBytes: 512 });
  boundedText(input.description, `${id}.description`);
  const inputSchema = normalizeSchema(input.inputSchema, `${id}.inputSchema`);
  if (!RESULT_KINDS.has(input.resultKind)) fail('invalid_development_operation_catalog', `${id}.resultKind is unsupported`);
  if (!EFFECT_CLASSES.has(input.effectClass)) fail('invalid_development_operation_catalog', `${id}.effectClass is unsupported`);
  const effects = normalizeUniqueStrings(input.effects, `${id}.effects`, { max: MAX_EFFECTS, identifiers: true });
  const requiredCapabilities = normalizeUniqueStrings(input.requiredCapabilities, `${id}.requiredCapabilities`, { identifiers: true });
  if (typeof input.cancellable !== 'boolean' || typeof input.callerSelectable !== 'boolean') {
    fail('invalid_development_operation_catalog', `${id} boolean metadata is invalid`);
  }
  if (!SELECTION_SCOPES.has(input.selectionScope)) fail('invalid_development_operation_catalog', `${id}.selectionScope is unsupported`);
  if (input.callerSelectable && input.selectionScope !== 'development') {
    fail('invalid_development_operation_catalog', `${id} caller-selectable operation must use development selection scope`);
  }
  const semantic = canonicalClone({
    version: input.version,
    title: input.title,
    description: input.description,
    inputSchema,
    resultKind: input.resultKind,
    effectClass: input.effectClass,
    effects,
    requiredCapabilities,
    cancellable: input.cancellable,
    selectionScope: input.selectionScope,
    callerSelectable: input.callerSelectable,
  });
  const body = contractBody(id, semantic);
  const inputSchemaDigest = typedDigest('tdev.development-operation-input-schema.v1', semantic.inputSchema);
  const contractDigest = typedDigest('tdev.development-operation-contract.v1', body);
  if (input.inputSchemaDigest !== undefined && input.inputSchemaDigest !== inputSchemaDigest) {
    fail('development_operation_catalog_incompatible', `${id}.inputSchemaDigest does not match the semantic schema`);
  }
  if (input.contractDigest !== undefined && input.contractDigest !== contractDigest) {
    fail('development_operation_catalog_incompatible', `${id}.contractDigest does not match the semantic contract`);
  }
  return deepFreeze({
    ...semantic,
    inputSchemaDigest,
    contractDigest,
  });
}

function normalizeBinding(id, input, operations) {
  assertIdentifier(id, 'development binding id');
  assertRecordShape(input, ['operationId', 'operationVersion', 'kind', 'optional'], ['legacyProfile'], `development binding ${id}`);
  assertIdentifier(input.operationId, `${id}.operationId`);
  assertSafeInteger(input.operationVersion, `${id}.operationVersion`, { min: 1 });
  if (!BINDING_KINDS.has(input.kind) || typeof input.optional !== 'boolean') fail('invalid_development_operation_catalog', `${id} binding metadata is invalid`);
  const operation = operations[input.operationId];
  if (!operation || operation.version !== input.operationVersion) fail('invalid_development_operation_catalog', `${id} references an unknown semantic operation version`);
  if (input.kind === 'legacy_profile') {
    if (input.legacyProfile === undefined) fail('invalid_development_operation_catalog', `${id} legacy binding requires legacyProfile`);
    assertIdentifier(input.legacyProfile, `${id}.legacyProfile`);
  } else if (input.legacyProfile !== undefined) {
    fail('invalid_development_operation_catalog', `${id} builtin binding cannot name a legacy profile`);
  }
  return deepFreeze(canonicalClone({
    operationId: input.operationId,
    operationVersion: input.operationVersion,
    kind: input.kind,
    optional: input.optional,
    ...(input.legacyProfile === undefined ? {} : { legacyProfile: input.legacyProfile }),
  }));
}

function normalizePolicies(input, operations, bindings) {
  assertRecordShape(input, ['requiredValidation'], [], 'development operation policies');
  const policy = input.requiredValidation;
  assertRecordShape(policy, ['policyId', 'operationId', 'operationVersion', 'bindingId'], [], 'required validation policy');
  assertIdentifier(policy.policyId, 'requiredValidation.policyId');
  if (policy.policyId !== DEVELOPMENT_REQUIRED_VALIDATION_POLICY) fail('invalid_development_operation_catalog', 'required validation policy identity is unsupported');
  assertIdentifier(policy.operationId, 'requiredValidation.operationId');
  assertSafeInteger(policy.operationVersion, 'requiredValidation.operationVersion', { min: 1 });
  assertIdentifier(policy.bindingId, 'requiredValidation.bindingId');
  const operation = operations[policy.operationId];
  const binding = bindings[policy.bindingId];
  if (!operation || operation.version !== policy.operationVersion || operation.resultKind !== 'validation') {
    fail('invalid_development_operation_catalog', 'required validation policy does not identify one validation operation');
  }
  if (!binding || binding.operationId !== policy.operationId || binding.operationVersion !== policy.operationVersion || binding.optional) {
    fail('invalid_development_operation_catalog', 'required validation policy binding is missing, mismatched, or optional');
  }
  return deepFreeze({ requiredValidation: canonicalClone(policy) });
}

function requireInitialContract(catalog) {
  const required = [
    DEVELOPMENT_CONTEXT_BIND_OPERATION,
    DEVELOPMENT_CHANGESET_COMPOSE_OPERATION,
    DEVELOPMENT_CANDIDATE_VALIDATE_OPERATION,
    DEVELOPMENT_CHANGE_GENERATE_OPERATION,
  ];
  for (const id of required) if (!catalog.operations[id]) fail('development_operation_catalog_incompatible', `Catalog is missing required operation ${id}`);
  const bindingRequirements = [
    DEVELOPMENT_CHANGESET_COMPOSE_BINDING,
    DEVELOPMENT_CONTEXT_BINDING,
    DEVELOPMENT_VALIDATION_BINDING,
    DEVELOPMENT_CODEX_BINDING,
  ];
  for (const id of bindingRequirements) if (!catalog.bindings[id]) fail('development_operation_catalog_incompatible', `Catalog is missing required binding ${id}`);
  const composeBinding = catalog.bindings[DEVELOPMENT_CHANGESET_COMPOSE_BINDING];
  if (!catalog.operations[DEVELOPMENT_CHANGESET_COMPOSE_OPERATION].callerSelectable ||
      catalog.operations[DEVELOPMENT_CHANGESET_COMPOSE_OPERATION].resultKind !== 'changeset' ||
      composeBinding.operationId !== DEVELOPMENT_CHANGESET_COMPOSE_OPERATION ||
      composeBinding.operationVersion !== catalog.operations[DEVELOPMENT_CHANGESET_COMPOSE_OPERATION].version ||
      composeBinding.kind !== 'builtin' || composeBinding.optional) {
    fail('development_operation_catalog_incompatible', 'Core ChangeSet compose contract/binding is invalid');
  }
  const codexBinding = catalog.bindings[DEVELOPMENT_CODEX_BINDING];
  if (codexBinding.operationId !== DEVELOPMENT_CHANGE_GENERATE_OPERATION ||
      codexBinding.operationVersion !== catalog.operations[DEVELOPMENT_CHANGE_GENERATE_OPERATION].version ||
      !codexBinding.optional) {
    fail('development_operation_catalog_incompatible', 'Codex binding must remain an optional delegated-change binding');
  }
  return catalog;
}

const NORMALIZED_DEVELOPMENT_OPERATION_CATALOGS = new WeakSet();

export function normalizeDevelopmentOperationCatalog(input) {
  if (input !== null && typeof input === 'object' && NORMALIZED_DEVELOPMENT_OPERATION_CATALOGS.has(input)) return input;
  assertRecordShape(input, ['schemaVersion', 'profile', 'operations', 'bindings', 'policies'], [], 'development operation catalog');
  if (input.schemaVersion !== 1 || input.profile !== DEVELOPMENT_OPERATION_CATALOG_PROFILE) {
    fail('development_operation_catalog_incompatible', 'Development operation catalog profile/schema is unsupported');
  }
  if (!isPlainRecord(input.operations) || Object.keys(input.operations).length === 0 || Object.keys(input.operations).length > MAX_OPERATIONS) {
    fail('invalid_development_operation_catalog', 'Development operation catalog must contain a bounded operations map');
  }
  const operations = {};
  for (const id of Object.keys(input.operations).sort(compareText)) operations[id] = normalizeOperation(id, input.operations[id]);
  if (!isPlainRecord(input.bindings) || Object.keys(input.bindings).length === 0 || Object.keys(input.bindings).length > MAX_BINDINGS) {
    fail('invalid_development_operation_catalog', 'Development operation catalog must contain a bounded bindings map');
  }
  const bindings = {};
  for (const id of Object.keys(input.bindings).sort(compareText)) bindings[id] = normalizeBinding(id, input.bindings[id], operations);
  const policies = normalizePolicies(input.policies, operations, bindings);
  const normalized = requireInitialContract(deepFreeze({
    schemaVersion: 1,
    profile: DEVELOPMENT_OPERATION_CATALOG_PROFILE,
    operations: deepFreeze(operations),
    bindings: deepFreeze(bindings),
    policies,
  }));
  NORMALIZED_DEVELOPMENT_OPERATION_CATALOGS.add(normalized);
  return normalized;
}

export function developmentOperationCatalogDigest(catalog) {
  const normalized = normalizeDevelopmentOperationCatalog(catalog);
  return typedDigest(DEVELOPMENT_OPERATION_CATALOG_PROFILE, normalized);
}

export function developmentOperationDescriptor(catalog, id, version, { available = true, reason = null } = {}) {
  const normalized = normalizeDevelopmentOperationCatalog(catalog);
  assertIdentifier(id, 'operation id');
  assertSafeInteger(version, 'operation version', { min: 1 });
  const operation = normalized.operations[id];
  if (!operation || operation.version !== version) fail('development_operation_unknown', `Unknown development operation ${id}@${version}`);
  if (typeof available !== 'boolean') fail('invalid_development_operation_availability', 'Operation availability must be boolean');
  if (reason !== null) boundedText(reason, 'operation availability reason', { maxBytes: 2048 });
  if (available && reason !== null) fail('invalid_development_operation_availability', 'Available operation cannot carry an unavailable reason');
  return deepFreeze({
    id,
    version: operation.version,
    contractDigest: operation.contractDigest,
    title: operation.title,
    description: operation.description,
    inputSchema: canonicalClone(operation.inputSchema),
    inputSchemaDigest: operation.inputSchemaDigest,
    resultKind: operation.resultKind,
    effectClass: operation.effectClass,
    effects: [...operation.effects],
    requiredCapabilities: [...operation.requiredCapabilities],
    cancellable: operation.cancellable,
    selectionScope: operation.selectionScope,
    callerSelectable: operation.callerSelectable,
    availability: { available, reason },
  });
}

export function listDevelopmentOperations(catalog, { cursor = null, pageSize = 32, availability = {} } = {}) {
  const normalized = normalizeDevelopmentOperationCatalog(catalog);
  if (cursor !== null) assertIdentifier(cursor, 'operation cursor');
  assertSafeInteger(pageSize, 'operation pageSize', { min: 1, max: 100 });
  if (!isPlainRecord(availability)) fail('invalid_development_operation_availability', 'Operation availability projection must be a record');
  const ids = Object.keys(normalized.operations).sort(compareText);
  const start = cursor === null ? 0 : ids.findIndex((id) => id > cursor);
  if (cursor !== null && start === -1) return deepFreeze({ items: [], nextCursor: null });
  const selected = ids.slice(start, start + pageSize);
  const items = selected.map((id) => {
    const operation = normalized.operations[id];
    const state = availability[id] ?? { available: true, reason: null };
    const descriptor = developmentOperationDescriptor(normalized, id, operation.version, state);
    const { inputSchema: _schema, inputSchemaDigest, ...summary } = descriptor;
    return deepFreeze({ ...summary, inputSchemaDigest });
  });
  const nextCursor = start + selected.length < ids.length ? selected.at(-1) : null;
  return deepFreeze({ items, nextCursor });
}

export function developmentOperationCapabilityId(catalog, id, version) {
  const descriptor = developmentOperationDescriptor(catalog, id, version);
  return typedDigest('tdev.development-operation-capability.v1', {
    id: descriptor.id,
    version: descriptor.version,
    contractDigest: descriptor.contractDigest,
  });
}

function normalizeWriteScope(writePaths, caseContract) {
  if (writePaths === undefined || writePaths === null) return null;
  if (!Array.isArray(writePaths) || writePaths.length > caseContract.limits.maxWritesPerChangeSet) {
    fail('invalid_development_operation_scope', 'writePaths must be a bounded array when present');
  }
  const normalized = [];
  for (const pathValue of writePaths) {
    const result = normalizeChangeSet('development-operation-scope', {
      kind: 'changeset',
      baseDigest: 'sha256:' + '0'.repeat(64),
      writes: [{ path: pathValue, content: null }],
    }, { baseDigest: 'sha256:' + '0'.repeat(64), pathPolicy: caseContract.pathPolicy, limits: caseContract.limits });
    normalized.push(result.writes[0].path);
  }
  normalized.sort(compareText);
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index] === normalized[index - 1]) fail('invalid_development_operation_scope', 'writePaths contains duplicate paths');
  }
  return normalized;
}

export function normalizeDevelopmentOperationSelection(catalog, selection, {
  baseDigest,
  caseContract = {},
  writePaths = null,
} = {}) {
  const normalizedCatalog = normalizeDevelopmentOperationCatalog(catalog);
  assertRecordShape(selection, ['id', 'version', 'contractDigest', 'input'], [], 'development operation selection');
  assertIdentifier(selection.id, 'development operation selection id');
  assertSafeInteger(selection.version, 'development operation selection version', { min: 1 });
  assertDigest(selection.contractDigest, 'development operation selection contractDigest');
  const descriptor = developmentOperationDescriptor(normalizedCatalog, selection.id, selection.version);
  if (!descriptor.callerSelectable) fail('development_operation_not_selectable', `Operation ${selection.id} is internal-only`);
  if (selection.contractDigest !== descriptor.contractDigest) fail('development_operation_contract_mismatch', 'Selected operation contract digest is stale or mismatched');
  const contractInput = isPlainRecord(caseContract) && Object.hasOwn(caseContract, 'contractDigest')
    ? {
      caseGrant: canonicalClone(caseContract.caseGrant),
      workspacePolicy: canonicalClone(caseContract.workspacePolicy),
      pathPolicy: canonicalClone(caseContract.pathPolicy),
      limits: canonicalClone(caseContract.limits),
    }
    : caseContract;
  const contract = normalizeCaseContract(contractInput);
  let input;
  if (selection.id === DEVELOPMENT_CHANGESET_COMPOSE_OPERATION) {
    assertDigest(baseDigest, 'development operation baseDigest');
    assertRecordShape(selection.input, ['baseDigest', 'writes'], [], 'changeset compose input');
    const result = normalizeChangeSet('development-change', {
      kind: 'changeset',
      baseDigest: selection.input.baseDigest,
      writes: selection.input.writes,
    }, { baseDigest, pathPolicy: contract.pathPolicy, limits: contract.limits });
    if (result.writes.length === 0) fail('development_operation_empty_changeset', 'ChangeSet compose requires at least one write or deletion');
    const scope = normalizeWriteScope(writePaths, contract);
    if (scope !== null) {
      const allowed = new Set(scope);
      for (const write of result.writes) {
        if (!allowed.has(write.path)) fail('development_operation_scope_denied', `ChangeSet write is outside the owner-issued write scope: ${write.path}`);
      }
    }
    input = { baseDigest: result.baseDigest, writes: result.writes.map(({ path, content }) => ({ path, content })) };
  } else if (selection.id === DEVELOPMENT_CHANGE_GENERATE_OPERATION) {
    assertRecordShape(selection.input, ['instruction'], [], 'delegated change input');
    boundedText(selection.input.instruction, 'delegated change instruction', { maxBytes: 256 * 1024 });
    input = { instruction: selection.input.instruction };
  } else {
    fail('development_operation_not_selectable', `Operation ${selection.id} is not a supported public development selection`);
  }
  return deepFreeze({
    id: descriptor.id,
    version: descriptor.version,
    contractDigest: descriptor.contractDigest,
    input: canonicalClone(input),
  });
}

export function requiredDevelopmentValidation(catalog) {
  const normalized = normalizeDevelopmentOperationCatalog(catalog);
  const policy = normalized.policies.requiredValidation;
  const operation = normalized.operations[policy.operationId];
  const binding = normalized.bindings[policy.bindingId];
  return deepFreeze({
    policyId: policy.policyId,
    operationId: policy.operationId,
    operationVersion: policy.operationVersion,
    contractDigest: operation.contractDigest,
    bindingId: policy.bindingId,
    binding: canonicalClone(binding),
  });
}

export function operationBindingFor(catalog, operationId, operationVersion, { includeOptional = true } = {}) {
  const normalized = normalizeDevelopmentOperationCatalog(catalog);
  const matches = Object.entries(normalized.bindings)
    .filter(([, binding]) => binding.operationId === operationId && binding.operationVersion === operationVersion && (includeOptional || !binding.optional))
    .sort(([left], [right]) => compareText(left, right));
  if (matches.length === 0) fail('development_operation_binding_unavailable', `No binding is registered for ${operationId}@${operationVersion}`);
  if (matches.length > 1) fail('development_operation_binding_ambiguous', `Multiple bindings are registered for ${operationId}@${operationVersion}`);
  const [bindingId, binding] = matches[0];
  return deepFreeze({ bindingId, ...canonicalClone(binding) });
}

export function semanticOperationEvidence(catalog, operationId, operationVersion, bindingId) {
  const normalized = normalizeDevelopmentOperationCatalog(catalog);
  const descriptor = developmentOperationDescriptor(normalized, operationId, operationVersion);
  const binding = normalized.bindings[bindingId];
  if (!binding || binding.operationId !== operationId || binding.operationVersion !== operationVersion) {
    fail('development_operation_binding_mismatch', 'Binding does not implement the semantic operation version');
  }
  return deepFreeze({
    operationId,
    operationVersion,
    operationContractDigest: descriptor.contractDigest,
    bindingId,
    bindingDigest: digest(binding),
    catalogDigest: developmentOperationCatalogDigest(normalized),
  });
}
