import {
  ContractError,
  assertDigest,
  assertRecordShape,
  assertSafeInteger,
  assertScalarString,
  canonicalClone,
  compareText,
  deepFreeze,
  typedDigest,
  isPlainRecord,
} from './canonical.mjs';
import { validateRelativePath } from './policy.mjs';

export const REPOSITORY_BASE_IDENTITY_PROFILE = 'tdev.repository-base-identity.v2';
export const REPOSITORY_BASE_DIGEST_DOMAIN = 'tdev.repository-base.v2';
export const LAZY_PLAN_REFERENCE_PROFILE = 'tdev.plan.lazy-scoped-reference.v1';
export const LAZY_PLAN_REFERENCE_SCHEMA_VERSION = 1;
export const LAZY_PLAN_REFERENCE_SCOPE_PROFILE = 'tdev.repository-context-scope.v1';
export const LAZY_PLAN_REFERENCE_MAX_SCOPE_FILES = 4_096;
export const LAZY_PLAN_REFERENCE_MAX_SCOPE_BYTES = 16 * 1024 * 1024;

function fail(code, message, details = undefined) {
  throw new ContractError(code, message, details);
}

function oid(value, objectFormat, label) {
  assertScalarString(value, label);
  const length = objectFormat === 'sha1' ? 40 : objectFormat === 'sha256' ? 64 : 0;
  if (length === 0 || value.length !== length || !new RegExp(`^[0-9a-f]{${length}}$`, 'u').test(value)) {
    fail('lazy_reference_identity_invalid', `${label} is not a valid ${objectFormat} object ID`);
  }
  return value;
}

function normalizeScope(input) {
  if (!isPlainRecord(input)) fail('lazy_reference_scope_invalid', 'Scoped Plan reference scope must be a record');
  assertRecordShape(input, [], ['schemaVersion', 'profile', 'paths', 'prefixes', 'maxFiles', 'maxBytes', 'maxSearchResults'], 'scoped Plan reference scope');
  if (input.schemaVersion !== undefined && input.schemaVersion !== 1) fail('lazy_reference_scope_invalid', 'scope.schemaVersion is unsupported');
  if (input.profile !== undefined && input.profile !== LAZY_PLAN_REFERENCE_SCOPE_PROFILE) fail('lazy_reference_scope_invalid', 'scope.profile is unsupported');
  const paths = (values, label) => {
    if (values === undefined) return [];
    if (!Array.isArray(values) || values.length > LAZY_PLAN_REFERENCE_MAX_SCOPE_FILES) {
      fail('lazy_reference_scope_invalid', `${label} exceeds its bound`);
    }
    const normalized = values.map((value, index) => validateRelativePath(value, {
      requireNfc: true,
      deniedPrefixes: ['.git', '.tdev'],
      maxPathBytes: 4_096,
    })).sort(compareText);
    for (let index = 1; index < normalized.length; index += 1) {
      if (normalized[index] === normalized[index - 1]) fail('lazy_reference_scope_invalid', `${label} contains a duplicate`);
    }
    return normalized;
  };
  const normalizedPaths = paths(input.paths, 'scope.paths');
  const normalizedPrefixes = paths(input.prefixes, 'scope.prefixes');
  if (normalizedPaths.length === 0 && normalizedPrefixes.length === 0) {
    fail('lazy_reference_scope_invalid', 'Scoped Plan reference scope must select a path or prefix');
  }
  const maxFiles = input.maxFiles === undefined
    ? LAZY_PLAN_REFERENCE_MAX_SCOPE_FILES
    : assertSafeInteger(input.maxFiles, 'scope.maxFiles', { min: 1, max: LAZY_PLAN_REFERENCE_MAX_SCOPE_FILES });
  const maxBytes = input.maxBytes === undefined
    ? LAZY_PLAN_REFERENCE_MAX_SCOPE_BYTES
    : assertSafeInteger(input.maxBytes, 'scope.maxBytes', { min: 1, max: LAZY_PLAN_REFERENCE_MAX_SCOPE_BYTES });
  const maxSearchResults = input.maxSearchResults === undefined
    ? 256
    : assertSafeInteger(input.maxSearchResults, 'scope.maxSearchResults', { min: 1, max: 4_096 });
  return {
    schemaVersion: 1,
    profile: LAZY_PLAN_REFERENCE_SCOPE_PROFILE,
    paths: normalizedPaths,
    prefixes: normalizedPrefixes,
    maxFiles,
    maxBytes,
    maxSearchResults,
  };
}

export function normalizeRepositoryBaseIdentity(input, expected = {}) {
  if (!isPlainRecord(input)) fail('lazy_reference_identity_invalid', 'repositoryBaseIdentity must be a record');
  assertRecordShape(input, ['schemaVersion', 'profile', 'objectFormat', 'commitOid', 'treeOid', 'baseDigest', 'manifestDigest'], [], 'repositoryBaseIdentity');
  if (input.schemaVersion !== 1 || input.profile !== REPOSITORY_BASE_IDENTITY_PROFILE ||
      !['sha1', 'sha256'].includes(input.objectFormat)) {
    fail('lazy_reference_identity_invalid', 'repositoryBaseIdentity profile or schema is unsupported');
  }
  oid(input.commitOid, input.objectFormat, 'repositoryBaseIdentity.commitOid');
  oid(input.treeOid, input.objectFormat, 'repositoryBaseIdentity.treeOid');
  assertDigest(input.baseDigest, 'repositoryBaseIdentity.baseDigest');
  assertDigest(input.manifestDigest, 'repositoryBaseIdentity.manifestDigest');
  for (const field of ['objectFormat', 'commitOid', 'treeOid', 'baseDigest', 'manifestDigest']) {
    if (expected[field] !== undefined && input[field] !== expected[field]) {
      fail('lazy_reference_identity_mismatch', `repositoryBaseIdentity.${field} does not match the expected repository identity`, {
        expected: expected[field],
        actual: input[field],
      });
    }
  }
  const identityBody = {
    schemaVersion: input.schemaVersion,
    profile: input.profile,
    objectFormat: input.objectFormat,
    commitOid: input.commitOid,
    treeOid: input.treeOid,
    manifestDigest: input.manifestDigest,
  };
  const expectedDigest = typedDigest(REPOSITORY_BASE_DIGEST_DOMAIN, identityBody);
  if (input.baseDigest !== expectedDigest) fail('lazy_reference_identity_digest_mismatch', 'repositoryBaseIdentity.baseDigest is not derived from the complete manifest identity');
  return deepFreeze(canonicalClone(input));
}

export function createRepositoryBaseIdentity({ objectFormat, commitOid, treeOid, manifestDigest } = {}) {
  if (!['sha1', 'sha256'].includes(objectFormat)) fail('lazy_reference_identity_invalid', 'objectFormat is unsupported');
  oid(commitOid, objectFormat, 'commitOid');
  oid(treeOid, objectFormat, 'treeOid');
  assertDigest(manifestDigest, 'manifestDigest');
  const body = {
    schemaVersion: 1,
    profile: REPOSITORY_BASE_IDENTITY_PROFILE,
    objectFormat,
    commitOid,
    treeOid,
    manifestDigest,
  };
  return normalizeRepositoryBaseIdentity({
    ...body,
    baseDigest: typedDigest(REPOSITORY_BASE_DIGEST_DOMAIN, body),
  });
}

export function createLazyPlanReference({ repositoryBaseIdentity, scope, semanticBaseDigest } = {}) {
  const identity = normalizeRepositoryBaseIdentity(repositoryBaseIdentity);
  const normalizedScope = normalizeScope(scope);
  assertDigest(semanticBaseDigest, 'semanticBaseDigest');
  const body = {
    schemaVersion: LAZY_PLAN_REFERENCE_SCHEMA_VERSION,
    profile: LAZY_PLAN_REFERENCE_PROFILE,
    repositoryBaseIdentity: identity,
    scope: normalizedScope,
    scopeDigest: typedDigest(LAZY_PLAN_REFERENCE_SCOPE_PROFILE, normalizedScope),
    semanticBaseDigest,
  };
  return deepFreeze({
    ...body,
    referenceDigest: typedDigest(LAZY_PLAN_REFERENCE_PROFILE, body),
  });
}

export function normalizeLazyPlanReference(input, expected = {}) {
  if (!isPlainRecord(input)) fail('lazy_reference_invalid', 'baseReference must be a record');
  assertRecordShape(input, ['schemaVersion', 'profile', 'repositoryBaseIdentity', 'scope', 'scopeDigest', 'semanticBaseDigest', 'referenceDigest'], [], 'baseReference');
  if (input.schemaVersion !== LAZY_PLAN_REFERENCE_SCHEMA_VERSION || input.profile !== LAZY_PLAN_REFERENCE_PROFILE) {
    fail('lazy_reference_invalid', 'baseReference profile or schema is unsupported');
  }
  const identity = normalizeRepositoryBaseIdentity(input.repositoryBaseIdentity, expected);
  const scope = normalizeScope(input.scope);
  assertDigest(input.scopeDigest, 'baseReference.scopeDigest');
  const expectedScopeDigest = typedDigest(LAZY_PLAN_REFERENCE_SCOPE_PROFILE, scope);
  if (input.scopeDigest !== expectedScopeDigest) fail('lazy_reference_scope_digest_mismatch', 'baseReference.scopeDigest is invalid');
  assertDigest(input.semanticBaseDigest, 'baseReference.semanticBaseDigest');
  assertDigest(input.referenceDigest, 'baseReference.referenceDigest');
  if (input.referenceDigest !== typedDigest(LAZY_PLAN_REFERENCE_PROFILE, {
    schemaVersion: input.schemaVersion,
    profile: input.profile,
    repositoryBaseIdentity: identity,
    scope,
    scopeDigest: input.scopeDigest,
    semanticBaseDigest: input.semanticBaseDigest,
  })) fail('lazy_reference_digest_mismatch', 'baseReference.referenceDigest is invalid');
  if (expected.semanticBaseDigest !== undefined && input.semanticBaseDigest !== expected.semanticBaseDigest) {
    fail('lazy_reference_semantic_digest_mismatch', 'baseReference semantic digest does not match the selected Plan tree');
  }
  return deepFreeze(canonicalClone({ ...input, repositoryBaseIdentity: identity, scope }));
}

export function scopeDigest(scope) {
  return typedDigest(LAZY_PLAN_REFERENCE_SCOPE_PROFILE, normalizeScope(scope));
}

export { normalizeScope as normalizeLazyPlanScope };
