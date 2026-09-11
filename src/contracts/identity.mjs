import { randomBytes } from 'node:crypto';
import { requireThat } from './errors.mjs';
export const DEFAULT_EXECUTION_CAPACITY = 8;
/** @returns {string} Random 128-bit identity, independent of execution capacity. */
export function newId() { return randomBytes(16).toString('hex'); }
/** @param {unknown} v @returns {string} */
export function id(v) {
  requireThat(typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v), 'INVALID_ARGUMENT', 'ID'); return v;
}
/** @param {unknown} v @returns {string} */
export function revision(v) {
  requireThat(typeof v === 'string' && /^(0|[1-9][0-9]{0,19})$/.test(v) && BigInt(v) <= 18446744073709551615n,
    'INVALID_ARGUMENT', 'Unsigned 64-bit decimal revision'); return v;
}
/** @param {string} v @returns {string} */
export function nextRevision(v) {
  const n = BigInt(revision(v)); requireThat(n < 18446744073709551615n, 'LIMIT_EXCEEDED', 'Revision exhausted');
  return String(n + 1n);
}
/** @param {unknown} v @returns {string} */
export function oid(v) {
  requireThat(typeof v === 'string' && /^(sha1:[0-9a-f]{40}|sha256:[0-9a-f]{64})$/.test(v), 'INVALID_ARGUMENT', 'Git OID'); return v;
}
/** @param {unknown} v @returns {string} */
export function digest(v) {
  requireThat(typeof v === 'string' && /^sha256:[0-9a-f]{64}$/.test(v), 'INVALID_ARGUMENT', 'SHA-256 digest'); return v;
}
/** @param {unknown} [v] @returns {number} Resource policy, not an identity-space ceiling. */
export function capacity(v = DEFAULT_EXECUTION_CAPACITY) {
  requireThat(typeof v === 'number' && Number.isSafeInteger(v) && v > 0, 'INVALID_ARGUMENT', 'Capacity'); return v;
}
