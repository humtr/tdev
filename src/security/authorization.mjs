import { jwtVerify } from 'jose';
import { recordDigest } from '../contracts/canonical.mjs';
import { requireThat, TdevError } from '../contracts/errors.mjs';
import { repositoryPath, withinPrefix } from './paths.mjs';
import {attachLegacySubject,principalSubjects} from './principal.mjs';
/** @typedef {import('../contracts/ports.js').Principal} Principal */
/** @typedef {import('../contracts/ports.js').AuthorizationPort} AuthorizationPort */
/** @typedef {import('../contracts/ports.js').Binding} Binding */
/** @typedef {import('../contracts/ports.js').Capability} Capability */
/** @typedef {{subject:string,installationId:string,repositoryId:string,ref:string,capabilities:readonly Capability[],paths:readonly string[],deniedPaths:readonly string[]}} Grant */

/** @type {readonly Capability[]} */
export const CAPABILITIES=Object.freeze(['repository.read','work.write','profile.run','integration.write','policy.write','runtime.activate']);

/** This configured resource server never trusts a proxy's token acceptance.
 * @param {{issuer:string,audience:string,algorithms:readonly string[]}} config
 * @param {import('jose').JWTVerifyGetKey} keyResolver
 * @param {()=>number} [now]
 */
export function bearerVerifier(config,keyResolver,now=Date.now) {
  config={...config,algorithms:[...config.algorithms]};
  requireThat(new URL(config.issuer).protocol==='https:' && new URL(config.audience).protocol==='https:', 'INVALID_ARGUMENT');
  requireThat(config.algorithms.length>0 && config.algorithms.every(a=>['RS256','PS256','ES256','EdDSA'].includes(a)), 'INVALID_ARGUMENT');
  /** @param {unknown} header @returns {Promise<Principal>} */
  return async header => {
    requireThat(typeof header==='string' && header.length<=16384 && /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(header), 'UNAUTHORIZED');
    try {
      const {payload}=await jwtVerify(header.slice(7),keyResolver,{issuer:config.issuer,audience:config.audience,
        algorithms:[...config.algorithms],requiredClaims:['sub','exp','scope'],clockTolerance:0,currentDate:new Date(now())});
      requireThat(typeof payload.sub==='string' && payload.sub.length>0 && payload.sub.length<=1024 &&
        typeof payload.exp==='number' && Number.isSafeInteger(payload.exp) && Number.isSafeInteger(payload.exp*1000), 'UNAUTHORIZED');
      requireThat(typeof payload.scope==='string' && payload.scope.length<=4096 && /^[\x21-\x7e]+(?: [\x21-\x7e]+)*$/.test(payload.scope), 'UNAUTHORIZED');
      const scopes=new Set(payload.scope.split(' '));
      const tokenCapabilities=CAPABILITIES.filter(capability=>scopes.has(capability));
      const identity={issuer:config.issuer,subject:payload.sub};
      return attachLegacySubject({tokenCapabilities,subject:recordDigest('tdev.oauth-subject.v1',identity).slice(7),
        issuer:config.issuer,audience:config.audience,expiresAt:payload.exp*1000},recordDigest('dev2.oauth-subject.v1',identity).slice(7));
    } catch { throw new TdevError('UNAUTHORIZED'); }
  };
}

/** Grant lookup is live at each call and effect dispatch. Only trusted installation code provides it.
 * @implements {AuthorizationPort}
 */
export class ScopedAuthorization {
  /** @param {{issuer:string,audience:string,bindings:()=>readonly Binding[],grants:()=>readonly Grant[],now?:()=>number}} options */
  constructor(options) { this.options=options; }
  /** Synchronous trusted authority stamp used only after any asynchronous lookup has completed.
   * @param {Principal} principal @param {Binding} binding @param {Capability} capability @param {readonly string[]} [paths] */
  snapshot(principal,binding,capability,paths=[]) {
    const o=this.options;
    requireThat(principal.issuer===o.issuer && principal.audience===o.audience && principal.expiresAt>(o.now??Date.now)(), 'UNAUTHORIZED');
    requireThat(Array.isArray(principal.tokenCapabilities)&&principal.tokenCapabilities.includes(capability),'FORBIDDEN');
    const current=o.bindings().find(b=>b.repositoryId===binding.repositoryId);
    requireThat(current && recordDigest('tdev.binding.v1',current)===recordDigest('tdev.binding.v1',binding), 'FORBIDDEN');
    const subjects=principalSubjects(principal),all=o.grants();
    /** @param {string} subject @returns {Grant[]} */
    const matches=subject=>all.filter(g=>g.subject===subject&&g.installationId===binding.installationId&&g.repositoryId===binding.repositoryId&&g.ref===binding.ref&&g.capabilities.includes(capability));
    const grants=subjects.flatMap(matches);requireThat(grants.length>0,'FORBIDDEN');
    /** @param {readonly Grant[]} list @param {string} path */
    const allows=(list,path)=>list.some(g=>g.paths.some(p=>withinPrefix(repositoryPath(p,true),path))&&!g.deniedPaths.some(p=>withinPrefix(repositoryPath(p,true),path)));
    const checked=[...paths].sort((a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b)));
    for(const path of checked){repositoryPath(path,true);requireThat(allows(grants,path),'FORBIDDEN');}
    /** @param {readonly Grant[]} list */
    const normalize=list=>list.map(g=>({subject:g.subject,installationId:g.installationId,repositoryId:g.repositoryId,ref:g.ref,capabilities:[...g.capabilities].sort(),paths:[...g.paths].sort(),deniedPaths:[...g.deniedPaths].sort()})).sort((a,b)=>Buffer.compare(Buffer.from(JSON.stringify(a)),Buffer.from(JSON.stringify(b))));
    /** @param {string} subject */
    const principalRecord=subject=>({subject,issuer:principal.issuer,audience:principal.audience,expiresAt:principal.expiresAt,tokenCapabilities:[...(principal.tokenCapabilities??[])].sort()});
    /** @param {string} subject @param {readonly Grant[]} list */
    const record=(subject,list)=>({principal:principalRecord(subject),binding:current,capability,paths:checked,grants:normalize(list)});
    const result={stamp:recordDigest('tdev.authorization-snapshot.v1',record(principal.subject,grants)),expiresAt:principal.expiresAt};
    if(principal.legacySubject!==undefined){const legacy=matches(principal.legacySubject);if(legacy.length>0&&checked.every(path=>allows(legacy,path)))Object.defineProperty(result,'__legacyStamp',{value:recordDigest('dev2.authorization-snapshot.v1',record(principal.legacySubject,legacy)),enumerable:false});}
    return result;
  }
  /** @param {{stamp:string,expiresAt:number}} retained @param {Principal} principal @param {Binding} binding @param {Capability} capability @param {readonly string[]} [paths] */
  assertSnapshot(retained,principal,binding,capability,paths=[]){const current=this.snapshot(principal,binding,capability,paths),legacy=/** @type {{__legacyStamp?:string}} */(current).__legacyStamp;requireThat((current.stamp===retained.stamp||legacy===retained.stamp)&&current.expiresAt===retained.expiresAt,'STALE_REVISION','Authorization authority changed');return current;}
  /** @param {Principal} principal @param {Binding} binding @param {Capability} capability @param {readonly string[]} [paths] */
  async authorize(principal,binding,capability,paths=[]) { this.snapshot(principal,binding,capability,paths); }
}
