import {digest} from './identity.mjs';
import {requireThat} from './errors.mjs';
/** @template T @param {T} data @param {{releaseId:import('./identity.mjs').Digest,schemaDigest:import('./identity.mjs').Digest}} runtime @param {number} observedAt */
export function success(data,runtime,observedAt){
 digest(runtime.releaseId);digest(runtime.schemaDigest);
 requireThat(Number.isSafeInteger(observedAt)&&observedAt>=0,'INVALID_ARGUMENT','Expected observation timestamp');
 return {apiVersion:1,ok:true,data,observedAt,runtime:{...runtime}};
}
