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
/** @typedef {{expectedHead?:string,currentHead?:string,observedAt?:string,delivery?:'not_sent'|'unknown'}} DomainFacts */
export class Dev2Error extends Error {
  /** @param {string} code @param {string} [message] @param {DomainFacts} [facts] */
  constructor(code, message = code, facts = {}) {
    if (!ERROR_CODES.includes(code)) throw new TypeError('Unknown domain error code');
    super(message); this.name = 'Dev2Error'; this.code = code;
    if (!facts || Object.getPrototypeOf(facts)!==Object.prototype || Reflect.ownKeys(facts).some(key=>typeof key!=='string'||!['expectedHead','currentHead','observedAt','delivery'].includes(key))) throw new TypeError('Invalid domain facts');
    for (const key of Reflect.ownKeys(facts)) {
      const property=Object.getOwnPropertyDescriptor(facts,key);
      if (!property || !('value' in property) || !property.enumerable) throw new TypeError('Invalid domain fact property');
      const value=property.value;
      if(key==='delivery') {if(!['not_sent','unknown'].includes(value))throw new TypeError('Invalid delivery fact');continue;}
      if (typeof value!=='string' || (key==='observedAt' ? !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value)) : !/^(?:sha1:[0-9a-f]{40}|sha256:[0-9a-f]{64})$/.test(value))) throw new TypeError('Invalid domain fact value');
    }
    this.facts=Object.freeze({...facts});
    Object.defineProperty(this,'facts',{writable:false,configurable:false});
  }
}
/** @param {unknown} condition @param {string} code @param {string} [message] @param {DomainFacts} [facts] @returns {asserts condition} */
export function requireThat(condition, code, message, facts) {
  if (!condition) throw new Dev2Error(code, message, facts);
}
