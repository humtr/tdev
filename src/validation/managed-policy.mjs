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
  const definition={profileId,argv:['/usr/local/bin/node','/controller/tools/validate.mjs','--source','/source','--environment','managed-image','--profile',profileId,'--output','/work/validation/'+profileId],cwd:'',parameters:{},timeoutMs:300000,killGraceMs:2000,memoryBytes:1073741824,pids:256,cpuMillis:2000,diskBytes:268435456,logBytes:1048576,network:/** @type {const} */('none'),imageDigest:identities.imageDigest,replaySafe:true};
  return {profile:{...definition,digest:recordDigest('dev2.profile.v1',definition)},parameterSchema:{type:'object',additionalProperties:false,maxProperties:0}};
 });
 const execution={orderedProfileDigests:profiles.map(p=>p.profile.digest),trustedRunnerDigest:identities.trustedRunnerDigest,toolchainDigest:identities.toolchainDigest,dependencyLockDigest:identities.dependencyLockDigest,environmentClass:'github-hosted-rootless-oci'};
 const definition={profiles,required,execution};return new AdoptedPolicy({digest:recordDigest('dev2.execution-policy.v1',definition),...definition});
}
/** This first-release capability is deliberately finite. Policy adoption cannot
 * introduce arbitrary host commands, optional fixture networks or new tools.
 * @param {AdoptedPolicy} candidate @param {Parameters<typeof managedPolicy>[0]} identities */
export function supportsManagedPolicy(candidate,identities){try{
 const installed=managedPolicy(identities),policy=candidate.policy;
 requireThat(canonicalJson(policy.required)===canonicalJson(installed.policy.required)&&policy.profiles.length===2,'FORBIDDEN');
 const profiles=policy.profiles.map((item,i)=>{const expected=installed.policy.profiles[i];requireThat(item.profile.profileId===expected.profile.profileId&&canonicalJson(item.parameterSchema)===canonicalJson(expected.parameterSchema),'FORBIDDEN');return {profile:approvedManagedProfile(item.profile,installed),parameterSchema:expected.parameterSchema};});
 const execution={...installed.policy.execution,orderedProfileDigests:profiles.map(p=>p.profile.digest)},definition={profiles,required:installed.policy.required,execution};
 return canonicalJson(policy)===canonicalJson({digest:recordDigest('dev2.execution-policy.v1',definition),...definition});
 }catch{return false;}}
/** A policy may tighten a deadline, not change a command, test selector, image,
 * network, resource ceiling, or required suite. Shorter timeouts fail closed;
 * they never omit checks or make partial validation eligible.
 * @param {import('../contracts/ports.js').Profile} profile @param {ReturnType<managedPolicy> } installed */
export function approvedManagedProfile(profile,installed){
 const expected=installed.profile(profile.profileId,profile.parameters);
 requireThat(Number.isSafeInteger(profile.timeoutMs)&&profile.timeoutMs>=60000&&profile.timeoutMs<=expected.timeoutMs&&profile.timeoutMs%1000===0,'FORBIDDEN','Deadline exceeds installed capability');
 const {digest:ignored,...base}=expected,definition={...base,timeoutMs:profile.timeoutMs},approved={...definition,digest:recordDigest('dev2.profile.v1',definition)};
 requireThat(canonicalJson(profile)===canonicalJson(approved),'FORBIDDEN','Profile differs from the installed fixed controller');return approved;
}
