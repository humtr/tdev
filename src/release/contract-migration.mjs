import {canonicalJson,bytesDigest,recordDigest,parseRecord} from '../contracts/canonical.mjs';
import {requireThat} from '../contracts/errors.mjs';
/** @typedef {import('../contracts/ports.js').Json} Json */
/** Validate release-owned descriptors, never a compiled runtime schema.
 * @param {unknown} value */
export function publicDescriptor(value){
 const tools=/** @type {Array<Record<string,Json>>} */(value);
 requireThat(Array.isArray(tools)&&tools.length===4&&tools.map(t=>t?.name).sort().join(',')==='dev_context,dev_observe,dev_read,dev_work','INTEGRITY_FAILURE','Four public tool identities required');
 for(const t of tools){const a=/** @type {Record<string,Json>} */(t.annotations);requireThat(a&&a.readOnlyHint===true&&a.destructiveHint===false&&a.idempotentHint===false&&a.openWorldHint===false&&typeof t.description==='string'&&t.inputSchema&&t.outputSchema,'INTEGRITY_FAILURE','Public descriptor metadata');}
 return {tools,schemaDigest:bytesDigest(Buffer.from(canonicalJson(tools)))};
}
/** Conservative structural subset: unknown constraints must remain identical.
 * This intentionally rejects even unproved widenings rather than guessing schema
 * implication. Defaults cannot be added to existing optional properties.
 * @param {Json} old @param {Json} next @param {boolean} output @param {string} path @param {string[]} errors */
function compare(old,next,output,path,errors){
 if(canonicalJson(old)===canonicalJson(next))return;
 if(!old||!next||typeof old!=='object'||typeof next!=='object'||Array.isArray(old)!==Array.isArray(next)){errors.push(path);return;}
 if(Array.isArray(old)){if(!Array.isArray(next)||old.length!==next.length){errors.push(path);return;}old.forEach((v,i)=>compare(v,next[i],output,path+'/'+i,errors));return;}
 const a=/** @type {Record<string,Json>} */(old),b=/** @type {Record<string,Json>} */(next);
 for(const key of new Set([...Object.keys(a),...Object.keys(b)])){
  if(key==='properties'||key==='$defs'){
   const x=/** @type {Record<string,Json>} */(a[key]??{}),y=/** @type {Record<string,Json>} */(b[key]??{});
   for(const name of Object.keys(x)){if(!Object.hasOwn(y,name))errors.push(path+'/'+key+'/'+name);else {
    let candidate=y[name];
    // A formerly required input has no old-valid omission to reinterpret.
    if(!output&&key==='properties'&&Array.isArray(a.required)&&a.required.includes(name)&&x[name]&&candidate&&typeof x[name]==='object'&&typeof candidate==='object'&&!Array.isArray(candidate)&&!Object.hasOwn(x[name],'default')){candidate={...candidate};delete candidate.default;}
    compare(x[name],candidate,output,path+'/'+key+'/'+name,errors);
   }}
   continue;
  }
  if(key==='required'){
   const x=/** @type {string[]} */(a[key]??[]),y=/** @type {string[]} */(b[key]??[]);
   if(!Array.isArray(x)||!Array.isArray(y)||(!output&&y.some(k=>!x.includes(k)))||(output&&x.some(k=>!y.includes(k))))errors.push(path+'/required');
   continue;
  }
  if(!Object.hasOwn(a,key)||!Object.hasOwn(b,key)){errors.push(path+'/'+key);continue;}
  if(key==='oneOf'&&canonicalJson(a[key])!==canonicalJson(b[key])){
   const branches=/** @type {Array<Record<string,Json>>} */(a[key]);
   // Optional additions must not make two formerly disjoint alternatives match.
   const first=/** @type {Record<string,Json>} */(branches[0]?.properties??{});
   const tagged=Object.keys(first).some(k=>{const values=branches.map(s=>{const p=/** @type {Record<string,Record<string,Json>>} */(s.properties??{});return Array.isArray(s.required)&&s.required.includes(k)&&p[k]&&Object.hasOwn(p[k],'const')?canonicalJson(p[k].const):undefined;});return values.every(v=>v!==undefined)&&new Set(values).size===branches.length;});
   if(!tagged){errors.push(path+'/oneOf');continue;}
  }
  if(['oneOf','anyOf','allOf','items'].includes(key))compare(a[key],b[key],output,path+'/'+key,errors);
  else if(canonicalJson(a[key])!==canonicalJson(b[key]))errors.push(path+'/'+key);
 }
}
/** @param {unknown} previous @param {unknown} target */
export function publicContractTransition(previous,target){
 const a=publicDescriptor(previous),b=publicDescriptor(target),errors=/** @type {string[]} */([]);
 for(const old of a.tools){const next=b.tools.find(t=>t.name===old.name);requireThat(next,'INTEGRITY_FAILURE');
  for(const key of new Set([...Object.keys(old),...Object.keys(next)])){
   if(key==='inputSchema'||key==='outputSchema')compare(old[key],next[key],key==='outputSchema',String(old.name)+'/'+key,errors);
   else if(!Object.hasOwn(old,key)||!Object.hasOwn(next,key)||canonicalJson(old[key])!==canonicalJson(next[key]))errors.push(String(old.name)+'/'+key);
  }
 }
 const record={protocol:'public-contract-v1',previousSchemaDigest:a.schemaDigest,targetSchemaDigest:b.schemaDigest,compatible:errors.length===0,violations:[...new Set(errors)].sort()};
 return {...record,transitionDigest:recordDigest('dev2.public-contract-transition.v1',record)};
}
/** Independently load and verify exact immutable artifacts at each trust boundary.
 * @param {import('./artifacts.mjs').ReleaseArtifactStore} artifacts
 * @param {import('./types.js').RuntimePair} previous @param {import('./types.js').RuntimePair} target */
export async function releaseTransition(artifacts,previous,target){
 const a=await artifacts.verify(previous.releaseId),b=await artifacts.verify(target.releaseId);
 for(const [artifact,pair] of [[a,previous],[b,target]]){
  const m=/** @type {typeof a} */(artifact).manifest,p=/** @type {typeof previous} */(pair);
  requireThat(m.device.artifactDigest===p.deviceArtifactDigest&&m.device.sourceCommitOid===p.deviceSourceCommitOid&&m.edge.artifactDigest===p.edgeArtifactDigest&&m.edge.sourceCommitOid===p.edgeSourceCommitOid&&canonicalJson(m.protocol)===canonicalJson(p.protocol)&&canonicalJson(m.ledger)===canonicalJson(p.ledger),'INTEGRITY_FAILURE','Transition artifact pair differs');
 }
 requireThat(a.manifest.schemaDigest===previous.schemaDigest&&b.manifest.schemaDigest===target.schemaDigest&&a.manifest.sourceCommitOid===previous.sourceCommitOid&&b.manifest.sourceCommitOid===target.sourceCommitOid,'INTEGRITY_FAILURE','Transition release binding');
 const transition=publicContractTransition(parseRecord(await artifacts.o.objects.get(a.refs.tools),262144),parseRecord(await artifacts.o.objects.get(b.refs.tools),262144));
 requireThat(transition.compatible&&transition.previousSchemaDigest===previous.schemaDigest&&transition.targetSchemaDigest===target.schemaDigest,'EXECUTION_UNAVAILABLE','Incompatible public contract transition');
 return {protocol:/** @type {const} */('public-contract-v1'),previousSchemaDigest:transition.previousSchemaDigest,targetSchemaDigest:transition.targetSchemaDigest,transitionDigest:transition.transitionDigest};
}
