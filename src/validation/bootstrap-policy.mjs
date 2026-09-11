import { recordDigest } from '../contracts/canonical.mjs';
import { AdoptedPolicy } from './policy.mjs';
/** A transparent unsealed policy identity, not a fabricated execution/image seal.
 * Profile definitions are frozen for observation and exact result preparation.
 * No profile executes until a separately qualified managed adapter is installed.
 * @param {{toolchainDigest:string,dependencyLockDigest:string}} identities */
export function bootstrapPolicy(identities){
 const unavailable=recordDigest('dev2.unavailable-hosted-execution.v1',{state:'unsealed',...identities});
 const profiles=['core','integration','release','live','benchmark'].map(profileId=>{
  const definition={profileId,argv:['node','tools/validate.mjs','--profile',profileId,'--output','.artifacts/validation/'+profileId],cwd:'.',parameters:{},timeoutMs:300000,killGraceMs:2000,memoryBytes:1073741824,pids:128,cpuMillis:300000,diskBytes:1073741824,logBytes:262144,network:/** @type {'none'|'fixture'} */(['core','integration'].includes(profileId)?'none':'fixture'),imageDigest:unavailable,replaySafe:true};
  return {profile:{...definition,digest:recordDigest('dev2.profile.v1',definition)},parameterSchema:{type:'object',additionalProperties:false,maxProperties:0}};
 });
 const required=['core','integration'];
 const execution={orderedProfileDigests:required.map(id=>/** @type {typeof profiles[number]} */(profiles.find(p=>p.profile.profileId===id)).profile.digest),trustedRunnerDigest:unavailable,...identities,environmentClass:'github-hosted-unsealed'};
 const value={profiles,required,execution};return new AdoptedPolicy({digest:recordDigest('dev2.bootstrap-policy.v1',value),...value});
}
