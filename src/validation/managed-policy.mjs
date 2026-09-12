import {recordDigest,canonicalJson} from '../contracts/canonical.mjs';
import {digest} from '../contracts/identity.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {AdoptedPolicy} from './policy.mjs';
/** A production policy defines fixed trusted commands, not a production seal.
 * Enrollment still requires separate actual containment and native join evidence.
 * Candidate configuration and output cannot synthesize this adopted identity.
 * @param {{trustedRunnerDigest:string,toolchainDigest:string,dependencyLockDigest:string,imageDigest:string}} identities */
export function managedPolicy(identities){
 for(const value of Object.values(identities))digest(value);
 const required=['core','integration'];
 const profiles=required.map(profileId=>{
  const definition={profileId,argv:['/usr/local/bin/node','/controller/tools/validate.mjs','--source','/source','--profile',profileId,'--output','/work/validation/'+profileId],cwd:'',parameters:{},timeoutMs:300000,killGraceMs:2000,memoryBytes:1073741824,pids:256,cpuMillis:2000,diskBytes:268435456,logBytes:1048576,network:/** @type {const} */('none'),imageDigest:identities.imageDigest,replaySafe:true};
  return {profile:{...definition,digest:recordDigest('dev2.profile.v1',definition)},parameterSchema:{type:'object',additionalProperties:false,maxProperties:0}};
 });
 const execution={orderedProfileDigests:profiles.map(p=>p.profile.digest),trustedRunnerDigest:identities.trustedRunnerDigest,toolchainDigest:identities.toolchainDigest,dependencyLockDigest:identities.dependencyLockDigest,environmentClass:'github-hosted-rootless-oci'};
 const definition={profiles,required,execution};return new AdoptedPolicy({digest:recordDigest('dev2.execution-policy.v1',definition),...definition});
}
/** This first-release capability is deliberately finite. Policy adoption cannot
 * introduce arbitrary host commands, optional fixture networks or new tools.
 * @param {AdoptedPolicy} candidate @param {Parameters<typeof managedPolicy>[0]} identities */
export function supportsManagedPolicy(candidate,identities){try{return canonicalJson(candidate.policy)===canonicalJson(managedPolicy(identities).policy);}catch{return false;}}
/** @param {import('../contracts/ports.js').Profile} profile @param {ReturnType<managedPolicy> } installed */
export function approvedManagedProfile(profile,installed){const expected=installed.profile(profile.profileId,profile.parameters);requireThat(canonicalJson(profile)===canonicalJson(expected),'FORBIDDEN','Profile differs from the installed fixed controller');return expected;}
