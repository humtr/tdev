import {canonicalJson} from '../contracts/canonical.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {digest,id,revision} from '../contracts/identity.mjs';
/** @typedef {import('../contracts/ports.js').Binding} Binding */
/** @typedef {{installationId:string,binding:Binding,bindings?:readonly Binding[]}} RegistryConfig */
/** Validate and freeze the private installation binding registry. `binding` remains
 * the primary/controller descriptor for backwards-compatible installed configs.
 * @param {RegistryConfig} config @returns {readonly Binding[]} */
export function installationBindings(config){
 id(config.installationId);const source=config.bindings??[config.binding];
 requireThat(Array.isArray(source)&&source.length>0&&source.length<=64,'INTEGRITY_FAILURE','Installed binding registry is empty or too large');
 /** @type {Binding[]} */const bindings=[];const repositories=new Set();
 for(const raw of source){
  const b=structuredClone(raw);id(b.repositoryId);id(b.installationId);revision(b.bindingEpoch);digest(b.policyDigest);
  requireThat(b.installationId===config.installationId&&typeof b.provider==='string'&&b.provider.length>0&&b.provider.length<=64&&typeof b.providerRepositoryId==='string'&&b.providerRepositoryId.length>0&&b.providerRepositoryId.length<=256,'INTEGRITY_FAILURE','Installed binding identity differs');
  requireThat(/^refs\/heads\/(?!.*\.\.)(?!.*@\{)[A-Za-z0-9_./-]+$/.test(b.ref)&&!b.ref.endsWith('/')&&!b.ref.endsWith('.lock'),'INTEGRITY_FAILURE','Installed binding ref is invalid');
  requireThat(!repositories.has(b.repositoryId),'INTEGRITY_FAILURE','Duplicate installed repository binding');repositories.add(b.repositoryId);bindings.push(Object.freeze(b));
 }
 requireThat(bindings.some(b=>canonicalJson(b)===canonicalJson(config.binding)),'INTEGRITY_FAILURE','Primary binding is absent from registry');
 return Object.freeze(bindings);
}
/** @param {readonly Binding[]} bindings @param {Binding} primary @param {unknown} selector */
export function selectInstalledBinding(bindings,primary,selector){
 const repositoryId=selector===undefined||selector==='self'?primary.repositoryId:String(selector),selected=bindings.find(b=>b.repositoryId===repositoryId);
 requireThat(selected,'FORBIDDEN','Repository binding is not authorized');return selected;
}
