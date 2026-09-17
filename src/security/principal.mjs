import {requireThat} from '../contracts/errors.mjs';
/** @typedef {import('../contracts/ports.js').Principal} Principal */
/** @param {Principal} principal @returns {readonly string[]} */
export function principalSubjects(principal){
 const values=[principal.subject];
 if(principal.legacySubject!==undefined){requireThat(typeof principal.legacySubject==='string'&&principal.legacySubject.length>0&&principal.legacySubject!==principal.subject,'INTEGRITY_FAILURE','Invalid legacy principal alias');values.push(principal.legacySubject);}
 return Object.freeze(values);
}
/** @param {Principal} principal @param {string} stored */
export function principalOwns(principal,stored){return principalSubjects(principal).includes(stored);}
/** @param {Principal} principal */
export function retainedPrincipalSubject(principal){return principal.legacySubject??principal.subject;}
/** Trusted authentication adapters alone attach the non-public legacy alias. @param {Principal} principal @param {string} legacySubject @returns {Principal} */
export function attachLegacySubject(principal,legacySubject){requireThat(typeof legacySubject==='string'&&legacySubject.length>0&&legacySubject!==principal.subject,'INTEGRITY_FAILURE','Invalid legacy principal alias');Object.defineProperty(principal,'legacySubject',{value:legacySubject,enumerable:false,writable:false,configurable:false});return principal;}
