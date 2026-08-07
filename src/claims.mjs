import {
  ContractError,
  assertDigest,
  assertIdentifier,
  assertRecordShape,
  assertSafeInteger,
  assertScalarString,
  compareText,
  deepFreeze,
  typedDigest,
} from './canonical.mjs';

const MODES = new Set(['read', 'write', 'execute']);
const RESOURCE_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,63}:[A-Za-z0-9][A-Za-z0-9._/-]{0,447}(?:\/\*\*)?$/;

function validateResource(resource) {
  assertScalarString(resource, 'claim.resource');
  if (resource.length === 0 || resource.trim() !== resource || resource.length > 512) {
    throw new ContractError('invalid_claim_resource', 'Claim resource must be a trimmed string of at most 512 code units');
  }
  if (!RESOURCE_PATTERN.test(resource) || resource.includes('///') || resource.includes('//')) {
    throw new ContractError('invalid_claim_resource', `Claim resource has invalid syntax: ${resource}`);
  }
  const wildcardIndex = resource.indexOf('/**');
  if (wildcardIndex !== -1 && wildcardIndex !== resource.length - 3) {
    throw new ContractError('invalid_claim_resource', `Claim wildcard is only allowed as a /** suffix: ${resource}`);
  }
  const body = resource.slice(resource.indexOf(':') + 1, wildcardIndex === -1 ? undefined : wildcardIndex);
  const segments = body.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new ContractError('invalid_claim_resource', `Claim resource contains an invalid segment: ${resource}`);
  }
  return resource;
}

export function normalizeClaim(claim) {
  if (!claim || typeof claim !== 'object' || Array.isArray(claim)) {
    throw new ContractError('invalid_claim', 'Claim must be an object');
  }
  assertRecordShape(claim, ['mode', 'resource'], [], 'claim');
  const { mode, resource } = claim;
  if (!MODES.has(mode)) {
    throw new ContractError('invalid_claim_mode', `Unsupported claim mode: ${String(mode)}`);
  }
  return deepFreeze({ mode, resource: validateResource(resource) });
}

export function normalizeClaims(claims, { maxClaims = 128 } = {}) {
  if (!Array.isArray(claims)) throw new ContractError('invalid_claims', 'Claims must be an array');
  if (claims.length > maxClaims) {
    throw new ContractError('claim_limit_exceeded', `Task declares more than ${maxClaims} claims`);
  }
  const normalized = claims.map(normalizeClaim).sort((left, right) =>
    compareText(left.resource, right.resource) || compareText(left.mode, right.mode));
  const seen = new Set();
  for (const claim of normalized) {
    const key = `${claim.mode}\0${claim.resource}`;
    if (seen.has(key)) throw new ContractError('duplicate_claim', `Duplicate claim: ${claim.mode} ${claim.resource}`);
    seen.add(key);
  }
  return deepFreeze(normalized);
}

function claimKey(claim) {
  return `${claim.mode}\0${claim.resource}`;
}

export function claimSetDigest(claims, options = {}) {
  return typedDigest('tdev.claim-set.v1', normalizeClaims(claims, options));
}

export function claimLeaseToken(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ContractError('invalid_claim_lease', 'Claim lease identity must be a record');
  }
  assertRecordShape(
    input,
    ['generation', 'caseId', 'taskId', 'attemptId', 'claimsDigest'],
    [],
    'claim lease identity',
  );
  assertSafeInteger(input.generation, 'claim lease generation', { min: 1 });
  for (const field of ['caseId', 'taskId', 'attemptId']) {
    assertIdentifier(input[field], `claim lease ${field}`);
  }
  assertDigest(input.claimsDigest, 'claim lease claimsDigest');
  return typedDigest('tdev.claim-lease.v1', input);
}

export function requiresGlobalClaimLease(claimInput) {
  const claim = normalizeClaim(claimInput);
  const namespace = claim.resource.slice(0, claim.resource.indexOf(':'));
  return namespace !== 'candidate' && namespace !== 'canonical';
}

export function globalClaimsForTask(task, additionalPredicate = null, options = {}) {
  if (!task || typeof task !== 'object' || Array.isArray(task) || !Array.isArray(task.claims)) {
    throw new ContractError('invalid_task_claims', 'Task must expose a claims array');
  }
  if (additionalPredicate !== null && additionalPredicate !== undefined && typeof additionalPredicate !== 'function') {
    throw new ContractError('invalid_claim_predicate', 'Additional global claim predicate must be a function');
  }
  const claims = normalizeClaims(task.claims, options);
  return deepFreeze(claims.filter((claim) =>
    requiresGlobalClaimLease(claim) || additionalPredicate?.(claim, task) === true));
}

export function assertClaimLeaseScope(leaseClaimsInput, taskClaimsInput, options = {}) {
  const leaseClaims = normalizeClaims(leaseClaimsInput, options);
  const taskClaims = normalizeClaims(taskClaimsInput, options);
  const leaseKeys = new Set(leaseClaims.map(claimKey));
  const taskKeys = new Set(taskClaims.map(claimKey));
  const undeclared = leaseClaims.filter((claim) => !taskKeys.has(claimKey(claim)));
  const missing = taskClaims.filter((claim) =>
    requiresGlobalClaimLease(claim) && !leaseKeys.has(claimKey(claim)));
  if (undeclared.length > 0 || missing.length > 0) {
    throw new ContractError(
      'claim_lease_scope',
      'Claim lease scope must contain every globally coordinated Task claim and no undeclared Task claim',
      { missing, undeclared },
    );
  }
  return deepFreeze({ leaseClaims, requiredClaims: taskClaims.filter(requiresGlobalClaimLease) });
}

function prefixOf(resource) {
  return resource.endsWith('/**') ? resource.slice(0, -3) : null;
}

export function resourcesOverlap(left, right) {
  validateResource(left);
  validateResource(right);
  if (left === right) return true;
  const leftPrefix = prefixOf(left);
  const rightPrefix = prefixOf(right);
  if (leftPrefix !== null && (right === leftPrefix || right.startsWith(`${leftPrefix}/`))) return true;
  if (rightPrefix !== null && (left === rightPrefix || left.startsWith(`${rightPrefix}/`))) return true;
  if (leftPrefix !== null && rightPrefix !== null) {
    return leftPrefix === rightPrefix ||
      leftPrefix.startsWith(`${rightPrefix}/`) ||
      rightPrefix.startsWith(`${leftPrefix}/`);
  }
  return false;
}

export function claimsConflict(left, right) {
  const normalizedLeft = normalizeClaim(left);
  const normalizedRight = normalizeClaim(right);
  if (!resourcesOverlap(normalizedLeft.resource, normalizedRight.resource)) return false;
  return !(normalizedLeft.mode === 'read' && normalizedRight.mode === 'read');
}

export function claimSetsConflict(leftClaims, rightClaims) {
  return leftClaims.some((left) => rightClaims.some((right) => claimsConflict(left, right)));
}
