import { createHash } from 'node:crypto';

export class ContractError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ContractError';
    this.code = code;
    this.details = details;
  }
}

export function clone(value) {
  return structuredClone(value);
}

export function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

function normalize(value, path) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new ContractError('non_finite_number', `Non-finite number at ${path}`);
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => normalize(item, `${path}[${index}]`));
  }
  if (typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (child === undefined) {
        throw new ContractError('undefined_value', `Undefined value at ${path}.${key}`);
      }
      result[key] = normalize(child, `${path}.${key}`);
    }
    return result;
  }
  throw new ContractError('unsupported_value', `Unsupported value at ${path}`);
}

export function canonicalJson(value) {
  return JSON.stringify(normalize(value, '$'));
}

export function digest(value) {
  const hex = createHash('sha256').update(canonicalJson(value)).digest('hex');
  return `sha256:${hex}`;
}
