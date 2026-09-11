/** Bounded domain errors; never serialize raw provider errors or credentials. */
export class Dev2Error extends Error {
    /** @param {string} code @param {string} message @param {Record<string, unknown>} [facts] @param {boolean} [sameRequest] */
    constructor(code, message, facts = {}, sameRequest = false) {
        super(message);
        this.name = 'Dev2Error';
        this.code = code;
        this.facts = facts;
        this.sameRequest = sameRequest;
    }
}
/** @param {unknown} condition @param {string} code @param {string} message @param {Record<string, unknown>} [facts] @returns {asserts condition} */
export function requireThat(condition, code, message, facts = {}) { if (!condition)
    throw new Dev2Error(code, message, facts); }
/** @param {unknown} error */
export function failure(error) {
    const known = error instanceof Dev2Error;
    return { apiVersion: 1, ok: false, error: { code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : 'An internal operation failed', retry: { sameRequest: known && error.sameRequest, afterMs: null }, facts: known ? error.facts : {} } };
}
