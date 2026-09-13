import {id} from '../contracts/identity.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {repositoryPath} from './paths.mjs';
import {CAPABILITIES} from './authorization.mjs';
/** @typedef {import('../contracts/ports.js').Capability} Capability */
/** Explicit principal-specific installation grant. Identity is the verified Access
 * subject digest; private installation configuration supplies capabilities/scope.
 * @param {{subject:string,installationId:string,repositoryId:string,ref:string,capabilities:readonly Capability[],paths:readonly string[],deniedPaths:readonly string[]}} scope
 * @returns {import('./authorization.mjs').Grant} */
export function installationPrincipalGrant(scope){
 requireThat(/^[a-f0-9]{64}$/.test(scope.subject),'INVALID_ARGUMENT');id(scope.installationId);id(scope.repositoryId);requireThat(typeof scope.ref==='string'&&scope.ref.startsWith('refs/heads/')&&scope.ref.length<=1024,'INVALID_ARGUMENT');
 requireThat(Array.isArray(scope.capabilities)&&scope.capabilities.length>0&&scope.capabilities.length<=CAPABILITIES.length&&new Set(scope.capabilities).size===scope.capabilities.length&&scope.capabilities.every(c=>CAPABILITIES.includes(c)),'INVALID_ARGUMENT');
 requireThat(Array.isArray(scope.paths)&&scope.paths.length>0&&scope.paths.length<=64&&new Set(scope.paths).size===scope.paths.length&&Array.isArray(scope.deniedPaths)&&scope.deniedPaths.length<=64&&new Set(scope.deniedPaths).size===scope.deniedPaths.length,'INVALID_ARGUMENT');
 for(const path of [...scope.paths,...scope.deniedPaths])repositoryPath(path,true);
 return {subject:scope.subject,installationId:scope.installationId,repositoryId:scope.repositoryId,ref:scope.ref,capabilities:[...scope.capabilities],paths:[...scope.paths],deniedPaths:[...scope.deniedPaths]};
}
/** Installation ownership is distinct from an additional authorized principal.
 * The owner receives the first-release full installation grant deterministically.
 * @param {{subject:string,installationId:string,repositoryId:string,ref:string}} scope
 * @returns {import('./authorization.mjs').Grant} */
export function installationOwnerGrant(scope){
 return installationPrincipalGrant({...scope,capabilities:[...CAPABILITIES],paths:[''],deniedPaths:[]});
}
