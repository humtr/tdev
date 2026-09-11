import { randomBytes } from 'node:crypto';
import { requireThat } from './errors.mjs';
/** @typedef {`sha1:${string}` | `sha256:${string}`} GitOid */
/** @typedef {`sha256:${string}`} Digest */
/** Canonical uint64 decimal string. @typedef {string} Revision */
export const DEFAULT_EXECUTION_CAPACITY = 8;
/** @param {unknown} value @returns {Revision} */
export function revision(value) { requireThat(typeof value === 'string' && /^(0|[1-9][0-9]{0,19})$/.test(value), 'INVALID_ARGUMENT', 'Expected decimal revision'); requireThat(BigInt(value) <= 18446744073709551615n, 'LIMIT_EXCEEDED', 'Revision exceeds uint64'); return value; }
/** @param {Revision} value */
export function nextRevision(value) { return revision((BigInt(revision(value)) + 1n).toString()); }
/** @param {unknown} value @returns {string} */
export function identifier(value) { requireThat(typeof value === 'string' && /^[A-Za-z0-9_.-]{1,128}$/.test(value), 'INVALID_ARGUMENT', 'Expected opaque identifier'); return value; }
/** @param {unknown} value @returns {GitOid} */
export function gitOid(value) { requireThat(typeof value === 'string' && /^(sha1:[0-9a-f]{40}|sha256:[0-9a-f]{64})$/.test(value), 'INVALID_ARGUMENT', 'Expected algorithm-tagged Git OID'); return /** @type {GitOid} */ (value); }
/** @param {unknown} value @returns {Digest} */
export function digest(value) { requireThat(typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value), 'INVALID_ARGUMENT', 'Expected SHA-256 digest'); return /** @type {Digest} */ (value); }
/** @param {number} [value] */
export function capacity(value = DEFAULT_EXECUTION_CAPACITY) { requireThat(Number.isSafeInteger(value) && value > 0, 'INVALID_ARGUMENT', 'Capacity must be a positive integer'); return value; }
/** @param {'work'|'action'|'result'|'attempt'|'snapshot'|'activation'} kind */
export function newId(kind) { return `${kind}-${randomBytes(16).toString('hex')}`; }
