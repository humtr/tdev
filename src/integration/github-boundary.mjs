import {requireThat,Dev2Error} from '../contracts/errors.mjs';
import {canonicalJson} from '../contracts/canonical.mjs';
import {boundedProviderJson} from '../execution/provider-json.mjs';
/** @typedef {{rulesetId:number,createdAt:string,updatedAt:string}} RulesetIdentity */
/** @typedef {{id:number,full_name:string,archived:boolean,owner:{id:number}}} RepositoryIdentity */
/** @typedef {{id:number,target:string,enforcement:string,source:string,source_type:string,created_at:string,updated_at:string,bypass_actors:unknown[],conditions:{ref_name:{include:string[],exclude:string[]}},rules:{type:string}[]}} Ruleset */
/** @typedef {{type:string,ruleset_id:number,ruleset_source:string,ruleset_source_type:string}[]} Effective */
/** Semantic provider enforcement, not key-order equality, green fixture state or
 * a force-with-lease claim. An administrator changing/replacing this exact guard
 * invalidates enrollment; mere re-enabling cannot silently restore old authority.
 * @param {{repository:RepositoryIdentity,ruleset:Ruleset,effective:Effective}} facts
 * @param {{binding:import('../contracts/ports.js').Binding,repositoryFullName:string,repositoryOwnerId:string,identity:RulesetIdentity}} expected */
export function verifyCanonicalBoundary(facts,expected){
 const {repository:r,ruleset:g,effective}=facts,{binding:b,identity:i}=expected;
 requireThat(String(r.id)===b.providerRepositoryId&&String(r.owner.id)===expected.repositoryOwnerId&&r.full_name===expected.repositoryFullName&&r.archived===false,'FORBIDDEN','Canonical repository identity changed');
 requireThat(Number.isSafeInteger(i.rulesetId)&&i.rulesetId>0&&g.id===i.rulesetId&&g.source===r.full_name&&g.source_type==='Repository'&&g.target==='branch'&&g.enforcement==='active'&&g.created_at===i.createdAt&&g.updated_at===i.updatedAt,'FORBIDDEN','Canonical monotonic guard changed');
 requireThat(Array.isArray(g.bypass_actors)&&g.bypass_actors.length===0&&canonicalJson(g.conditions.ref_name.include)===canonicalJson([b.ref])&&canonicalJson(g.conditions.ref_name.exclude)===canonicalJson([]),'FORBIDDEN','Canonical guard scope or bypass changed');
 for(const type of ['deletion','non_fast_forward'])requireThat(g.rules.some(rule=>rule.type===type)&&effective.some(rule=>rule.type===type&&rule.ruleset_id===i.rulesetId&&rule.ruleset_source===r.full_name&&rule.ruleset_source_type==='Repository'),'FORBIDDEN','Canonical monotonic enforcement is absent');
 return {rulesetId:g.id,ref:b.ref,repositoryId:String(r.id),createdAt:g.created_at,updatedAt:g.updated_at};
}
/** Read-only provider qualification. Only the canonical writer and its uncertain
 * effect reconciliation need this guard; a provider outage does not block source
 * discovery/edits or unrelated managed validation.
 */
export class GitHubCanonicalBoundary {
 /** @param {{binding:import('../contracts/ports.js').Binding,repositoryFullName:string,repositoryOwnerId:string,identity:RulesetIdentity,token:string,fetcher?:typeof fetch,now?:()=>number}} options */
 constructor(options){this.o=options;this.fetcher=options.fetcher??fetch;this.now=options.now??Date.now;requireThat(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(options.repositoryFullName)&&options.token.length>0&&!/\s/.test(options.token)&&options.binding.ref.startsWith('refs/heads/'),'INVALID_ARGUMENT');this.pending=/** @type {Promise<ReturnType<typeof verifyCanonicalBoundary>>|null} */(null);}
 /** @param {string} suffix */
 async get(suffix){let response;try{response=await this.fetcher('https://api.github.com/repos/'+this.o.repositoryFullName+suffix,{headers:{accept:'application/vnd.github+json',authorization:'Bearer '+this.o.token,'user-agent':'dev2-canonical-boundary','x-github-api-version':'2026-03-10'},redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw new Dev2Error('EXECUTION_UNAVAILABLE','Canonical guard provider unavailable');}requireThat(response.ok,'EXECUTION_UNAVAILABLE','Canonical guard could not be observed');
  const reader=response.body?.getReader();requireThat(reader,'INTEGRITY_FAILURE');let total=0;const chunks=[];try{for(;;){const next=await reader.read();if(next.done)break;total+=next.value.length;requireThat(total<=262144,'LIMIT_EXCEEDED');chunks.push(Buffer.from(next.value));}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}return boundedProviderJson(Buffer.concat(chunks),262144);
 }
 /** Concurrent reads share only an in-flight observation, never stale cached
  * authority. Each later external effect or recovery forces a new provider view. */
 async verify(){if(this.pending)return this.pending;const run=(async()=>{const [repository,ruleset,effective]=await Promise.all([this.get(''),this.get('/rulesets/'+this.o.identity.rulesetId),this.get('/rules/branches/'+encodeURIComponent(this.o.binding.ref.slice('refs/heads/'.length)))]);return verifyCanonicalBoundary({repository:/** @type {RepositoryIdentity} */(repository),ruleset:/** @type {Ruleset} */(ruleset),effective:/** @type {Effective} */(effective)},this.o);})();this.pending=run;try{return await run;}finally{if(this.pending===run)this.pending=null;}}
}
