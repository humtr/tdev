import { jwtVerify } from 'jose';
import { recordDigest } from '../contracts/canonical.mjs';
import { requireThat, Dev2Error } from '../contracts/errors.mjs';
import { repositoryPath, withinPrefix } from './paths.mjs';
/** @typedef {import('../contracts/ports.js').Principal} Principal */
/** @typedef {import('../contracts/ports.js').Binding} Binding */
/** @typedef {import('../contracts/ports.js').Capability} Capability */
/** @typedef {import('../contracts/ports.js').AuthorizationPort} AuthorizationPort */
/** @typedef {{subject:string,installationId:string,repositoryId:string,ref:string,capabilities:readonly Capability[],paths:readonly string[],deniedPaths:readonly string[]}} Grant */

/** This configured resource server never trusts a proxy's token acceptance.
 * @param {{issuer:string,audience:string,algorithms:readonly string[]}} config
 * @param {import('jose').JWTVerifyGetKey} keyResolver
 * @param {()=>number} [now]
 */
export function bearerVerifier(config,keyResolver,now=Date.now) {
  requireThat(new URL(config.issuer).protocol==='https:' && new URL(config.audience).protocol==='https:', 'INVALID_ARGUMENT');
  requireThat(config.algorithms.length>0 && config.algorithms.every(a=>['RS256','PS256','ES256','EdDSA'].includes(a)), 'INVALID_ARGUMENT');
  /** @param {unknown} header @returns {Promise<Principal>} */
  return async header => {
    requireThat(typeof header==='string' && header.length<=16384 && /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(header), 'UNAUTHORIZED');
    try {
      const {payload}=await jwtVerify(header.slice(7),keyResolver,{issuer:config.issuer,audience:config.audience,
        algorithms:[...config.algorithms],requiredClaims:['sub','exp'],clockTolerance:0,currentDate:new Date(now())});
      requireThat(typeof payload.sub==='string' && payload.sub.length>0 && payload.sub.length<=1024 &&
        typeof payload.exp==='number' && Number.isSafeInteger(payload.exp) && Number.isSafeInteger(payload.exp*1000), 'UNAUTHORIZED');
      return {subject:recordDigest('dev2.oauth-subject.v1',{issuer:config.issuer,subject:payload.sub}).slice(7),
        issuer:config.issuer,audience:config.audience,expiresAt:payload.exp*1000};
    } catch { throw new Dev2Error('UNAUTHORIZED'); }
  };
}

/** Grant lookup is live at each call and effect dispatch. Only trusted installation code provides it.
 * @implements {AuthorizationPort}
 */
export class ScopedAuthorization {
  /** @param {{issuer:string,audience:string,bindings:()=>readonly Binding[],grants:()=>readonly Grant[],now?:()=>number}} options */
  constructor(options) { this.options=options; }
  /** @param {Principal} principal @param {Binding} binding @param {Capability} capability @param {readonly string[]} [paths] */
  async authorize(principal,binding,capability,paths=[]) {
    const o=this.options;
    requireThat(principal.issuer===o.issuer && principal.audience===o.audience && principal.expiresAt>(o.now??Date.now)(), 'UNAUTHORIZED');
    const current=o.bindings().find(b=>b.repositoryId===binding.repositoryId);
    requireThat(current && recordDigest('dev2.binding.v1',current)===recordDigest('dev2.binding.v1',binding), 'FORBIDDEN');
    const grants=o.grants().filter(g=>g.subject===principal.subject && g.installationId===binding.installationId &&
      g.repositoryId===binding.repositoryId && g.ref===binding.ref && g.capabilities.includes(capability));
    requireThat(grants.length>0,'FORBIDDEN');
    for(const path of paths) {
      repositoryPath(path,true);
      requireThat(grants.some(g=>g.paths.some(p=>withinPrefix(repositoryPath(p,true),path)) &&
        !g.deniedPaths.some(p=>withinPrefix(repositoryPath(p,true),path))), 'FORBIDDEN');
    }
  }
}
