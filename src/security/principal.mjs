/** @typedef {import('../contracts/ports.js').Principal} Principal */
/** @param {Principal} principal @returns {readonly string[]} */
export function principalSubjects(principal){return Object.freeze([principal.subject]);}
/** @param {Principal} principal @param {string} stored */
export function principalOwns(principal,stored){return principal.subject===stored;}
