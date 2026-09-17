import {recordDigest,canonicalJson} from '../contracts/canonical.mjs';
import {digest} from '../contracts/identity.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {BUILD_OUTPUT_BYTES} from './build-output.mjs';
/** Separate finite build, not the unimplemented release/live acceptance aggregate.
 * Its command and empty parameter language are owned by the installed controller.
 * @param {string} imageDigest @param {'tdev'|'dev2'} [namespace] @returns {import('../contracts/ports.js').Profile} */
export function releaseBuildProfile(imageDigest,namespace='tdev'){
 digest(imageDigest);requireThat(namespace==='tdev'||namespace==='dev2','INVALID_ARGUMENT','Build profile namespace');
 const definition={profileId:'release-build',argv:['/usr/local/bin/node','/controller/tools/build-release.mjs','--source','/source','--output','/work/release'],cwd:'',parameters:{},timeoutMs:300000,killGraceMs:2000,memoryBytes:1073741824,pids:256,cpuMillis:2000,diskBytes:268435456,logBytes:BUILD_OUTPUT_BYTES,network:/** @type {const} */('none'),imageDigest,replaySafe:true};
 return {...definition,digest:recordDigest(namespace+'.profile.v1',definition)};
}
/** @param {import('../contracts/ports.js').Profile} profile @param {string} imageDigest @param {'tdev'|'dev2'} [namespace] */
export function approvedReleaseBuildProfile(profile,imageDigest,namespace='tdev'){const expected=releaseBuildProfile(imageDigest,namespace);requireThat(canonicalJson(profile)===canonicalJson(expected),'FORBIDDEN','Build exceeds the installed finite capability');return expected;}
/** @param {import('../contracts/ports.js').ExecutionIdentity} execution @param {string} imageDigest @param {'tdev'|'dev2'} [namespace] */
export function releaseBuildExecution(execution,imageDigest,namespace='tdev'){return {...execution,orderedProfileDigests:[releaseBuildProfile(imageDigest,namespace).digest]};}
