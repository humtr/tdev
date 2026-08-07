import path from 'node:path';
import {
  ContractError,
  assertIdentifier,
  assertRecordShape,
  assertSafeInteger,
  assertScalarString,
  canonicalClone,
  compareText,
  deepFreeze,
  typedDigest,
} from './canonical.mjs';

const encoder = new TextEncoder();

export const DEFAULT_LIMITS = deepFreeze({
  maxTasks: 10_000,
  maxDependenciesPerTask: 10_000,
  maxClaimsPerTask: 128,
  maxAttemptsPerTask: 100,
  maxTaskInputBytes: 2 * 1024 * 1024,
  maxPlanBytes: 32 * 1024 * 1024,
  maxEvents: 1_000_000,
  maxReceipts: 100_000,
  maxPathBytes: 4_096,
  maxFileBytes: 2 * 1024 * 1024,
  maxTreeEntries: 100_000,
  maxTreeBytes: 16 * 1024 * 1024,
  maxWritesPerChangeSet: 10_000,
  maxChangeSetBytes: 16 * 1024 * 1024,
  maxEvidenceBytes: 2 * 1024 * 1024,
  maxErrorMessageBytes: 64 * 1024,
  maxArtifactsPerResult: 10_000,
});

export const DEFAULT_PATH_POLICY = deepFreeze({
  requireNfc: true,
  deniedPrefixes: ['.git', '.tdev'],
});

function normalizeStringSet(values, label, { allowWildcard = true, max = 1_000 } = {}) {
  if (values === undefined) return [];
  if (!Array.isArray(values)) throw new ContractError('invalid_authority', `${label} must be an array`);
  if (values.length > max) throw new ContractError('authority_limit_exceeded', `${label} exceeds ${max} entries`);
  const normalized = values.map((value) => {
    assertScalarString(value, label);
    if (allowWildcard && value === '*') return value;
    assertIdentifier(value, label);
    return value;
  }).sort(compareText);
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index] === normalized[index - 1]) {
      throw new ContractError('duplicate_authority', `${label} contains duplicate ${normalized[index]}`);
    }
  }
  return normalized;
}

export function normalizeLimits(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ContractError('invalid_limits', 'Limits must be a record');
  }
  const result = { ...DEFAULT_LIMITS };
  for (const key of Object.keys(input)) {
    if (!Object.hasOwn(DEFAULT_LIMITS, key)) {
      throw new ContractError('unknown_limit', `Unknown limit: ${key}`);
    }
    result[key] = assertSafeInteger(input[key], key, { min: 1, max: Number.MAX_SAFE_INTEGER });
  }
  return deepFreeze(result);
}

export function normalizePathPolicy(input = {}, limits = DEFAULT_LIMITS) {
  assertRecordShape(input, [], ['requireNfc', 'deniedPrefixes'], 'pathPolicy');
  const requireNfc = input.requireNfc ?? DEFAULT_PATH_POLICY.requireNfc;
  if (typeof requireNfc !== 'boolean') throw new ContractError('invalid_path_policy', 'requireNfc must be boolean');
  const deniedPrefixes = input.deniedPrefixes ?? DEFAULT_PATH_POLICY.deniedPrefixes;
  if (!Array.isArray(deniedPrefixes)) {
    throw new ContractError('invalid_path_policy', 'deniedPrefixes must be an array');
  }
  const normalizedPrefixes = deniedPrefixes.map((prefix) => {
    const normalized = validateRelativePath(prefix, {
      requireNfc,
      deniedPrefixes: [],
      maxPathBytes: limits.maxPathBytes,
      allowReserved: true,
    });
    return normalized;
  }).sort(compareText);
  for (let index = 1; index < normalizedPrefixes.length; index += 1) {
    if (normalizedPrefixes[index] === normalizedPrefixes[index - 1]) {
      throw new ContractError('duplicate_path_policy', `Duplicate denied prefix: ${normalizedPrefixes[index]}`);
    }
  }
  return deepFreeze({ requireNfc, deniedPrefixes: normalizedPrefixes });
}

export function validateRelativePath(filePath, options = {}) {
  const requireNfc = options.requireNfc ?? DEFAULT_PATH_POLICY.requireNfc;
  const deniedPrefixes = options.deniedPrefixes ?? DEFAULT_PATH_POLICY.deniedPrefixes;
  const maxPathBytes = options.maxPathBytes ?? DEFAULT_LIMITS.maxPathBytes;
  const allowReserved = options.allowReserved ?? false;

  assertScalarString(filePath, 'path');
  if (filePath.length === 0 || filePath.includes('\\') || filePath.includes('\0')) {
    throw new ContractError('invalid_path', `Invalid relative path: ${String(filePath)}`);
  }
  for (let index = 0; index < filePath.length; index += 1) {
    const code = filePath.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) {
      throw new ContractError('invalid_path', `Control character is forbidden in path: ${filePath}`);
    }
  }
  if (encoder.encode(filePath).byteLength > maxPathBytes) {
    throw new ContractError('path_limit_exceeded', `Path exceeds ${maxPathBytes} UTF-8 bytes: ${filePath}`);
  }
  if (path.posix.isAbsolute(filePath)) {
    throw new ContractError('invalid_path', `Absolute path is forbidden: ${filePath}`);
  }
  const normalized = path.posix.normalize(filePath);
  if (normalized !== filePath || filePath === '.' || filePath.endsWith('/')) {
    throw new ContractError('invalid_path', `Non-normal file path is forbidden: ${filePath}`);
  }
  const segments = filePath.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new ContractError('invalid_path', `Path traversal or empty segment is forbidden: ${filePath}`);
  }
  if (requireNfc && filePath.normalize('NFC') !== filePath) {
    throw new ContractError('invalid_path', `Path must use NFC normalization: ${filePath}`);
  }
  if (!allowReserved) {
    const denied = deniedPrefixes.find((prefix) => filePath === prefix || filePath.startsWith(`${prefix}/`));
    if (denied) throw new ContractError('reserved_path', `Path is reserved by policy: ${filePath}`, { deniedPrefix: denied });
  }
  return filePath;
}

export function validateTreeTopology(paths) {
  const ordered = [...paths].sort(compareText);
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (current.startsWith(`${previous}/`)) {
      throw new ContractError('tree_path_collision', `A file cannot also be an ancestor path: ${previous} and ${current}`, {
        ancestor: previous,
        descendant: current,
      });
    }
  }
  return ordered;
}

export function normalizeCaseContract(input = {}) {
  assertRecordShape(input, [], ['caseGrant', 'workspacePolicy', 'pathPolicy', 'limits'], 'caseContract');
  const limits = normalizeLimits(input.limits ?? {});
  const contract = {
    caseGrant: normalizeStringSet(input.caseGrant ?? [], 'caseGrant'),
    workspacePolicy: normalizeStringSet(input.workspacePolicy ?? [], 'workspacePolicy'),
    pathPolicy: normalizePathPolicy(input.pathPolicy ?? {}, limits),
    limits,
  };
  const frozen = deepFreeze(canonicalClone(contract));
  return deepFreeze({ ...frozen, contractDigest: typedDigest('tdev.case-contract.v1', frozen) });
}

function allows(set, capability) {
  return set.includes('*') || set.includes(capability);
}

export function authorityDecision(requiredCapabilities, caseContract, executorCapabilities = []) {
  const required = normalizeStringSet(requiredCapabilities ?? [], 'requiredCapabilities', { allowWildcard: false });
  const executor = normalizeStringSet(executorCapabilities ?? [], 'executorCapabilities');
  const missing = required.filter((capability) =>
    !allows(caseContract.caseGrant, capability) ||
    !allows(caseContract.workspacePolicy, capability) ||
    !allows(executor, capability));
  return deepFreeze({ allowed: missing.length === 0, required, missing });
}

export function assertContentSize(content, filePath, limits) {
  if (typeof content !== 'string') throw new ContractError('invalid_file_content', `File content must be text: ${filePath}`);
  assertScalarString(content, `content:${filePath}`);
  const size = encoder.encode(content).byteLength;
  if (size > limits.maxFileBytes) {
    throw new ContractError('file_limit_exceeded', `File exceeds ${limits.maxFileBytes} UTF-8 bytes: ${filePath}`, { size });
  }
  return size;
}
