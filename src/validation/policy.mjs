import { Ajv2020 } from 'ajv/dist/2020.js';
import { canonicalJson, recordDigest } from '../contracts/canonical.mjs';
import { requireThat } from '../contracts/errors.mjs';
import { digest } from '../contracts/identity.mjs';
/** @typedef {import('../contracts/ports.js').Profile} Profile */
/** @typedef {import('../contracts/ports.js').Json} Json */
/** Policy is adopted by trusted installation state, never automatically by a candidate.
 * Profile parameter schemas validate values but cannot select host argv/environment.
 */
export class AdoptedPolicy {
 /** @param {{digest:string,profiles:readonly {profile:Profile,parameterSchema:Json}[],required:readonly string[],execution:import('../contracts/ports.js').ExecutionIdentity}} policy */
 constructor(policy){digest(policy.digest);this.policy=structuredClone(policy);const ajv=new Ajv2020({strict:true,coerceTypes:false,removeAdditional:false,useDefaults:false});
 requireThat(policy.required.includes('core')&&policy.required.includes('integration')&&new Set(policy.required).size===policy.required.length,'INVALID_ARGUMENT','Core and integration are mandatory');
 this.profiles=new Map(policy.profiles.map(({profile,parameterSchema})=>[profile.profileId,{profile:structuredClone(profile),validate:ajv.compile(/** @type {object} */(parameterSchema))}]));
 requireThat(this.profiles.size===policy.profiles.length&&policy.required.every(id=>this.profiles.has(id)),'INVALID_ARGUMENT');
 requireThat(canonicalJson(policy.required.map(id=>this.profiles.get(id)?.profile.digest))===canonicalJson(policy.execution.orderedProfileDigests),'INTEGRITY_FAILURE');
 }
 /** @param {string} id @param {Json} parameters @returns {Profile} */
 profile(id,parameters){canonicalJson(parameters);const selected=this.profiles.get(id);requireThat(selected&&selected.validate(parameters),'INVALID_ARGUMENT','Unknown profile or invalid parameters');
 // Initial fixed-argv profiles cannot silently ignore caller parameters.
 requireThat(canonicalJson(parameters)===canonicalJson(selected.profile.parameters),'INVALID_ARGUMENT','Profile arguments differ from adopted fixed parameters');return structuredClone(selected.profile);}
 required(){return this.policy.required.map(id=>structuredClone(/** @type {{profile:Profile}} */(this.profiles.get(id)).profile));}
}
