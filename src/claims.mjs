import { ContractError, deepFreeze } from './canonical.mjs';

const MODES = new Set(['read', 'write', 'execute']);

export function normalizeClaim(claim) {
  if (!claim || typeof claim !== 'object') {
    throw new ContractError('invalid_claim', 'Claim must be an object');
  }
  const { mode, resource } = claim;
  if (!MODES.has(mode)) {
    throw new ContractError('invalid_claim_mode', `Unsupported claim mode: ${String(mode)}`);
  }
  if (typeof resource !== 'string' || resource.length === 0 || resource.trim() !== resource) {
    throw new ContractError('invalid_claim_resource', 'Claim resource must be a non-empty trimmed string');
  }
  if (resource.includes('..')) {
    throw new ContractError('invalid_claim_resource', `Claim resource cannot contain '..': ${resource}`);
  }
  return deepFreeze({ mode, resource });
}

function prefixOf(resource) {
  return resource.endsWith('/**') ? resource.slice(0, -3) : null;
}

export function resourcesOverlap(left, right) {
  if (left === right) {
    return true;
  }
  const leftPrefix = prefixOf(left);
  const rightPrefix = prefixOf(right);
  if (leftPrefix !== null && (right === leftPrefix || right.startsWith(`${leftPrefix}/`))) {
    return true;
  }
  if (rightPrefix !== null && (left === rightPrefix || left.startsWith(`${rightPrefix}/`))) {
    return true;
  }
  if (leftPrefix !== null && rightPrefix !== null) {
    return leftPrefix.startsWith(`${rightPrefix}/`) || rightPrefix.startsWith(`${leftPrefix}/`);
  }
  return false;
}

export function claimsConflict(left, right) {
  if (!resourcesOverlap(left.resource, right.resource)) {
    return false;
  }
  return !(left.mode === 'read' && right.mode === 'read');
}

export function claimSetsConflict(leftClaims, rightClaims) {
  return leftClaims.some((left) => rightClaims.some((right) => claimsConflict(left, right)));
}
