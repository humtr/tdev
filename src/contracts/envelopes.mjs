import { Dev2Error, requireThat } from './errors.mjs';
import { canonicalJson } from './canonical.mjs';
/** @param {unknown} data @param {{releaseId:string,schemaDigest:string}} runtime @param {string} observedAt */
export function success(data, runtime, observedAt) {
  canonicalJson(data); requireThat(Number.isFinite(Date.parse(observedAt)), 'INVALID_ARGUMENT');
  return { apiVersion:1, ok:true, data, observedAt, runtime:{...runtime} };
}
/** Redaction is by construction; arbitrary provider error messages never reach the wire.
 * @param {unknown} error @param {boolean} [sameRequest]
 */
export function failure(error, sameRequest = false) {
  const code = error instanceof Dev2Error ? error.code : 'INTEGRITY_FAILURE';
  return { apiVersion:1, ok:false, error:{code, message:code, retry:{sameRequest,afterMs:null},facts:{}} };
}
