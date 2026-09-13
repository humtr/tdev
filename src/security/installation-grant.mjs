import {id} from '../contracts/identity.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {CAPABILITIES} from './authorization.mjs';
/** Explicit owner-authorized installation grant. The public hints are irrelevant
 * to this exact installation/repository/ref/path capability intersection.
 * @param {{subject:string,installationId:string,repositoryId:string,ref:string}} scope
 * @returns {import('./authorization.mjs').Grant} */
export function installationOwnerGrant(scope){
 requireThat(/^[a-f0-9]{64}$/.test(scope.subject),'INVALID_ARGUMENT');id(scope.installationId);id(scope.repositoryId);requireThat(typeof scope.ref==='string'&&scope.ref.startsWith('refs/heads/')&&scope.ref.length<=1024,'INVALID_ARGUMENT');
 return {...scope,capabilities:[...CAPABILITIES],paths:[''],deniedPaths:[]};
}
