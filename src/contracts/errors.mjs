/** Closed domain failures; transport adapters must not leak arbitrary exception text. */
export const ERROR_CODES = Object.freeze([
  'UNAUTHORIZED', 'FORBIDDEN', 'INVALID_ARGUMENT', 'LIMIT_EXCEEDED',
  'CONTEXT_EXPIRED', 'STALE_CONTEXT', 'STALE_REVISION', 'STALE_BASE',
  'ENTRY_CONFLICT', 'INTEGRATION_CONFLICT', 'NO_CHANGE', 'IDEMPOTENCY_MISMATCH',
  'CAPACITY_REJECTED', 'VALIDATION_FAILED', 'EXECUTION_UNAVAILABLE',
  'EFFECT_UNCERTAIN', 'CONTENDED_REF', 'STALE_RELEASE',
  'UNSUPPORTED_REPOSITORY_FEATURE', 'INTEGRITY_FAILURE', 'STORAGE_PRESSURE',
  'ENCODING_BOUNDARY', 'STALE_RESULT'
]);
export class Dev2Error extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message = code) {
    if (!ERROR_CODES.includes(code)) throw new TypeError('Unknown domain error code');
    super(message); this.name = 'Dev2Error'; this.code = code;
  }
}
/** @param {unknown} condition @param {string} code @param {string} [message] @returns {asserts condition} */
export function requireThat(condition, code, message) {
  if (!condition) throw new Dev2Error(code, message);
}
