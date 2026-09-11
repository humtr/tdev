import {Dev2Error,requireThat} from '../contracts/errors.mjs';
/** Provider observations are not dev-2 identity records. Podman info/inspect may
 * contain fractional metrics outside the fields we select. Bound and decode the
 * observation, then let each adapter validate its exact consumed predicates.
 * Never feed this permissive projection into canonical identity construction.
 * @param {string|Uint8Array} input @param {number} [maxBytes] @returns {unknown} */
export function boundedProviderJson(input,maxBytes=1048576){
 const bytes=typeof input==='string'?Buffer.from(input,'utf8'):Buffer.from(input);
 requireThat(Number.isSafeInteger(maxBytes)&&maxBytes>0&&bytes.byteLength<=maxBytes,'LIMIT_EXCEEDED','Provider JSON bound');
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
 catch{throw new Dev2Error('EXECUTION_UNAVAILABLE','Malformed provider JSON');}
}
