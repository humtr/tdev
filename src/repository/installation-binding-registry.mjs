import {requireThat} from '../contracts/errors.mjs';
import {installationBindings} from './bindings.mjs';
/** @typedef {import('../contracts/ports.js').Binding} Binding */
/** @typedef {{repositoryId:string,githubTokenFile:string,gitAskpassFile:string,repositoryOwnerId?:string,canonicalRuleset?:{rulesetId:number,createdAt:string,updatedAt:string},gitSender?:{configurationFile:string,pythonExecutable:string,helperFile:string}}} BindingProvider */
const CAPABILITIES=new Set(['repository.read','work.write','profile.run','integration.write','policy.write','runtime.activate']);
/** @param {unknown} value @returns {Record<string,unknown>} */
function record(value){requireThat(value!==null&&typeof value==='object'&&!Array.isArray(value),'INTEGRITY_FAILURE','Installation binding registry record required');return /** @type {Record<string,unknown>} */(value);}
/** @param {Record<string,unknown>} value @param {string[]} allowed @param {string[]} required */
function closed(value,allowed,required=allowed){requireThat(Object.keys(value).every(key=>allowed.includes(key))&&required.every(key=>Object.hasOwn(value,key)),'INTEGRITY_FAILURE','Installation binding registry shape differs');}
/** Merge one app-private operator-owned secondary binding registry with immutable
 * release configuration. The release config remains the controller/primary owner;
 * this overlay may only add secondary bindings, grants and provider associations.
 * @param {any} config @param {unknown} input */
export function mergeInstallationBindingRegistry(config,input){
 const registry=record(input);closed(registry,['schemaVersion','installationId','bindings','grants','bindingProviders']);
 requireThat(registry.schemaVersion===1&&registry.installationId===config.edge?.installationId,'INTEGRITY_FAILURE','Installation binding registry belongs to another installation');
 const base=installationBindings(config.edge);requireThat(base.length===1&&(config.bindingProviders??[]).length===0,'INTEGRITY_FAILURE','Secondary binding authority has more than one installed owner');
 requireThat(Array.isArray(registry.bindings)&&registry.bindings.length>0&&registry.bindings.length<=63,'INTEGRITY_FAILURE','Secondary binding registry is empty or too large');
 const bindings=installationBindings({...config.edge,bindings:[config.edge.binding,...registry.bindings]});const secondary=bindings.filter(binding=>binding.repositoryId!==config.edge.binding.repositoryId),byId=new Map(secondary.map(binding=>[binding.repositoryId,binding]));
 requireThat(secondary.length===registry.bindings.length,'INTEGRITY_FAILURE','Secondary binding registry differs');
 requireThat(Array.isArray(registry.grants)&&registry.grants.length>0&&registry.grants.length<=256,'INTEGRITY_FAILURE','Secondary binding grants are absent or too large');
 const grants=registry.grants.map(raw=>{const grant=record(raw);closed(grant,['subject','installationId','repositoryId','ref','capabilities','paths','deniedPaths']);const binding=byId.get(String(grant.repositoryId));
  requireThat(binding&&grant.installationId===config.edge.installationId&&grant.ref===binding.ref&&typeof grant.subject==='string'&&grant.subject.length>0&&grant.subject.length<=256,'INTEGRITY_FAILURE','Secondary grant scope differs');
  requireThat(Array.isArray(grant.capabilities)&&grant.capabilities.length>0&&grant.capabilities.length<=6&&grant.capabilities.every(value=>typeof value==='string'&&CAPABILITIES.has(value)),'INTEGRITY_FAILURE','Secondary grant capability differs');
  requireThat(Array.isArray(grant.paths)&&grant.paths.length>0&&grant.paths.length<=64&&grant.paths.every(value=>typeof value==='string')&&Array.isArray(grant.deniedPaths)&&grant.deniedPaths.length<=64&&grant.deniedPaths.every(value=>typeof value==='string'),'INTEGRITY_FAILURE','Secondary grant path scope differs');return structuredClone(grant);});
 for(const binding of secondary)requireThat(grants.some(grant=>grant.repositoryId===binding.repositoryId),'INTEGRITY_FAILURE','Secondary binding has no installation grant');
 requireThat(Array.isArray(registry.bindingProviders)&&registry.bindingProviders.length===secondary.length,'INTEGRITY_FAILURE','Secondary provider registry differs');
 const providers=registry.bindingProviders.map(raw=>{const provider=record(raw);const allowed=['repositoryId','githubTokenFile','gitAskpassFile','repositoryOwnerId','canonicalRuleset','gitSender'];closed(provider,allowed,['repositoryId','githubTokenFile','gitAskpassFile']);
  requireThat(byId.has(String(provider.repositoryId))&&typeof provider.githubTokenFile==='string'&&provider.githubTokenFile.length>0&&typeof provider.gitAskpassFile==='string'&&provider.gitAskpassFile.length>0,'INTEGRITY_FAILURE','Secondary provider association differs');const writer=[provider.repositoryOwnerId,provider.canonicalRuleset,provider.gitSender].filter(value=>value!==undefined);requireThat(writer.length===0||writer.length===3,'INTEGRITY_FAILURE','Secondary canonical writer association is incomplete');return /** @type {BindingProvider} */(structuredClone(provider));});
 requireThat(new Set(providers.map(provider=>provider.repositoryId)).size===secondary.length,'INTEGRITY_FAILURE','Duplicate secondary provider association');
 return {...config,edge:{...config.edge,bindings:[...bindings],grants:[...config.edge.grants.map((/** @type {any} */ grant)=>structuredClone(grant)),...grants]},bindingProviders:providers};
}
