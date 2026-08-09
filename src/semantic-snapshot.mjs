import {
  ContractError,
  canonicalClone,
  compareText,
  deepFreeze,
  isPlainRecord,
  typedDigest,
} from './canonical.mjs';
import {
  SEMANTIC_HEAD_DOMAIN,
  SEMANTIC_PROFILE,
  SEMANTIC_SNAPSHOT_DOMAIN,
  validateSemanticPlanBinding,
  validateSemanticRoot,
} from './semantic-authority.mjs';

export const SEMANTIC_SNAPSHOT_SCHEMA_VERSION = 3;

function exactKeys(value, keys, code, label) {
  if (!isPlainRecord(value)) throw new ContractError(code, `${label} must be a record`);
  const actual = Object.keys(value).sort(compareText);
  const expected = [...keys].sort(compareText);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new ContractError(code, `${label} fields are invalid`, { actual, expected });
  }
}

function assertDigest(value, label) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new ContractError('invalid_semantic_digest', `${label} must be a typed SHA-256 digest`);
  }
}

function assertSafeInteger(value, label, { min = 0 } = {}) {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new ContractError('invalid_semantic_integer', `${label} must be a safe integer >= ${min}`);
  }
}

function validateMigrationSource(value) {
  if (value === null) return null;
  exactKeys(value, ['schemaVersion', 'snapshotDigest', 'caseRevision'], 'invalid_migration_source', 'migrationSource');
  if (value.schemaVersion !== 2) throw new ContractError('invalid_migration_source', 'migrationSource schemaVersion must be 2');
  assertDigest(value.snapshotDigest, 'migrationSource.snapshotDigest');
  assertSafeInteger(value.caseRevision, 'migrationSource.caseRevision');
  return deepFreeze(canonicalClone(value));
}

export function validateSemanticAuthorityRecord(input) {
  exactKeys(
    input,
    ['profile', 'authorityEpoch', 'migrationSource', 'baseRoot', 'canonicalRoot'],
    'invalid_semantic_authority',
    'semanticAuthority',
  );
  if (input.profile !== SEMANTIC_PROFILE) {
    throw new ContractError('unsupported_semantic_profile', 'semanticAuthority profile is unsupported');
  }
  assertSafeInteger(input.authorityEpoch, 'semanticAuthority.authorityEpoch', { min: 1 });
  const baseRoot = validateSemanticRoot(input.baseRoot);
  const canonicalRoot = validateSemanticRoot(input.canonicalRoot);
  const migrationSource = validateMigrationSource(input.migrationSource);
  return deepFreeze({
    profile: input.profile,
    authorityEpoch: input.authorityEpoch,
    migrationSource,
    baseRoot,
    canonicalRoot,
  });
}

function snapshotIdentity(input) {
  return {
    schemaVersion: input.schemaVersion,
    caseId: input.caseId,
    caseState: canonicalClone(input.caseState),
    caseRevision: input.caseRevision,
    eventSequence: input.eventSequence,
    plan: validateSemanticPlanBinding(input.plan),
    caseContract: canonicalClone(input.caseContract),
    events: canonicalClone(input.events),
    semanticAuthority: validateSemanticAuthorityRecord(input.semanticAuthority),
    taskStates: canonicalClone(input.taskStates),
    attempts: canonicalClone(input.attempts),
    receipts: canonicalClone(input.receipts),
  };
}

export function createSemanticSnapshot(input) {
  exactKeys(
    input,
    ['schemaVersion', 'caseId', 'caseState', 'caseRevision', 'eventSequence', 'plan', 'caseContract', 'events', 'semanticAuthority', 'taskStates', 'attempts', 'receipts'],
    'invalid_semantic_snapshot',
    'semantic snapshot body',
  );
  if (input.schemaVersion !== SEMANTIC_SNAPSHOT_SCHEMA_VERSION) {
    throw new ContractError('unsupported_snapshot_version', `Semantic snapshot schemaVersion must be ${SEMANTIC_SNAPSHOT_SCHEMA_VERSION}`);
  }
  if (typeof input.caseId !== 'string' || input.caseId.length === 0) throw new ContractError('invalid_case_id', 'Semantic snapshot caseId is invalid');
  assertSafeInteger(input.caseRevision, 'semantic snapshot caseRevision');
  assertSafeInteger(input.eventSequence, 'semantic snapshot eventSequence');
  if (!Array.isArray(input.events) || !isPlainRecord(input.taskStates) || !isPlainRecord(input.attempts) || !isPlainRecord(input.receipts)) {
    throw new ContractError('invalid_semantic_snapshot', 'Semantic snapshot events must be an array and state collections must be records');
  }
  const identity = deepFreeze(snapshotIdentity(input));
  return deepFreeze({ ...identity, snapshotDigest: typedDigest(SEMANTIC_SNAPSHOT_DOMAIN, identity) });
}

export function validateSemanticSnapshot(input) {
  exactKeys(
    input,
    ['schemaVersion', 'caseId', 'caseState', 'caseRevision', 'eventSequence', 'plan', 'caseContract', 'events', 'semanticAuthority', 'taskStates', 'attempts', 'receipts', 'snapshotDigest'],
    'invalid_semantic_snapshot',
    'semantic snapshot',
  );
  assertDigest(input.snapshotDigest, 'semantic snapshot snapshotDigest');
  const recreated = createSemanticSnapshot({
    schemaVersion: input.schemaVersion,
    caseId: input.caseId,
    caseState: input.caseState,
    caseRevision: input.caseRevision,
    eventSequence: input.eventSequence,
    plan: input.plan,
    caseContract: input.caseContract,
    events: input.events,
    semanticAuthority: input.semanticAuthority,
    taskStates: input.taskStates,
    attempts: input.attempts,
    receipts: input.receipts,
  });
  if (recreated.snapshotDigest !== input.snapshotDigest) {
    throw new ContractError('snapshot_digest_mismatch', 'Semantic snapshot digest is invalid');
  }
  return recreated;
}

function headIdentity(input) {
  return {
    caseId: input.caseId,
    authorityEpoch: input.authorityEpoch,
    generation: input.generation,
    caseRevision: input.caseRevision,
    snapshotDigest: input.snapshotDigest,
    baseRootDigest: input.baseRootDigest,
    canonicalRootDigest: input.canonicalRootDigest,
    previousHeadDigest: input.previousHeadDigest,
  };
}

export function createSemanticHead(input) {
  exactKeys(
    input,
    ['caseId', 'authorityEpoch', 'generation', 'caseRevision', 'snapshotDigest', 'baseRootDigest', 'canonicalRootDigest', 'previousHeadDigest'],
    'invalid_semantic_head',
    'semantic head body',
  );
  if (typeof input.caseId !== 'string' || input.caseId.length === 0) throw new ContractError('invalid_case_id', 'Semantic head caseId is invalid');
  assertSafeInteger(input.authorityEpoch, 'semantic head authorityEpoch', { min: 1 });
  assertSafeInteger(input.generation, 'semantic head generation', { min: 1 });
  assertSafeInteger(input.caseRevision, 'semantic head caseRevision');
  assertDigest(input.snapshotDigest, 'semantic head snapshotDigest');
  assertDigest(input.baseRootDigest, 'semantic head baseRootDigest');
  assertDigest(input.canonicalRootDigest, 'semantic head canonicalRootDigest');
  if (input.previousHeadDigest !== null) assertDigest(input.previousHeadDigest, 'semantic head previousHeadDigest');
  const identity = deepFreeze(canonicalClone(headIdentity(input)));
  return deepFreeze({ ...identity, headDigest: typedDigest(SEMANTIC_HEAD_DOMAIN, identity) });
}

export function validateSemanticHead(input) {
  exactKeys(
    input,
    ['caseId', 'authorityEpoch', 'generation', 'caseRevision', 'snapshotDigest', 'baseRootDigest', 'canonicalRootDigest', 'previousHeadDigest', 'headDigest'],
    'invalid_semantic_head',
    'semantic head',
  );
  assertDigest(input.headDigest, 'semantic head headDigest');
  const recreated = createSemanticHead(headIdentity(input));
  if (recreated.headDigest !== input.headDigest) throw new ContractError('semantic_head_digest_mismatch', 'Semantic head digest is invalid');
  return recreated;
}
