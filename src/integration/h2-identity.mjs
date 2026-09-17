import {canonicalJson,parseRecord,recordDigest} from '../contracts/canonical.mjs';
import {digest,id,oid,revision} from '../contracts/identity.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {canonicalEntries,sameEntry,sourceManifest,sourceManifestMatches} from '../repository/entries.mjs';

export const H2_VERSION=1;
export const H2_MAX_TUPLE_BYTES=262144;

/** Raw unsigned UTF-8 order, independent of locale. @param {string} a @param {string} b */
export function compareH2Utf8(a,b){return Buffer.compare(Buffer.from(a,'utf8'),Buffer.from(b,'utf8'));}
/** @param {import('../contracts/ports.js').SourceTree} source */
function checked(source){const entries=canonicalEntries(source.entries);requireThat(sourceManifestMatches(entries,source.manifestDigest),'INTEGRITY_FAILURE','H2 source manifest mismatch');return entries;}
/** @param {import('../contracts/ports.js').SourceEntry|undefined} entry */
function descriptor(entry){return entry?{mode:entry.mode,blobOid:entry.blobOid,contentDigest:entry.contentDigest,size:entry.size}:null;}
/** Exact base-to-candidate delta. @param {import('../contracts/ports.js').SourceTree} base @param {import('../contracts/ports.js').SourceTree} candidate */
export function h2Delta(base,candidate){
 const before=new Map(checked(base).map(e=>[e.path,e])),after=new Map(checked(candidate).map(e=>[e.path,e]));
 const paths=[...new Set([...before.keys(),...after.keys()])].filter(path=>!sameEntry(before.get(path),after.get(path))).sort(compareH2Utf8);
 const changes=paths.map(path=>({path,before:descriptor(before.get(path)),after:descriptor(after.get(path))}));
 return {changes,changedPathDigest:recordDigest('tdev.h2-delta.v1',{changes})};
}
/** Pairwise disjoint includes exact path and file/directory ancestor collisions. @param {readonly ReturnType<typeof h2Delta>[]} deltas */
export function requireH2Disjoint(deltas){
 const changed=deltas.flatMap((delta,member)=>delta.changes.map(change=>({member,path:change.path}))).sort((a,b)=>compareH2Utf8(a.path,b.path));
 for(let i=0;i<changed.length;i++)for(let j=i+1;j<changed.length;j++){
  const a=changed[i],b=changed[j];if(a.member===b.member)continue;
  requireThat(a.path!==b.path&&!a.path.startsWith(b.path+'/')&&!b.path.startsWith(a.path+'/'),'ENTRY_CONFLICT','H2 changed paths collide');
 }
 return deltas;
}
/** Deterministic union over the exact common base. @param {import('../contracts/ports.js').SourceTree} base @param {readonly ReturnType<typeof h2Delta>[]} deltas */
export function composeH2Entries(base,deltas){
 requireH2Disjoint(deltas);const result=new Map(checked(base).map(e=>[e.path,{...e}]));
 for(const delta of deltas)for(const change of delta.changes){if(change.after)result.set(change.path,{path:change.path,...change.after});else result.delete(change.path);}
 return canonicalEntries([...result.values()]);
}
/** @typedef {{workId:string,actionId:string,principal:string,requestId:string,intentDigest:string,generation:string,reservedWorkRevision:string,candidateTreeOid:string,candidateManifestDigest:string,memberResultId:string,memberValidationId:string,memberReceiptRunId:string,memberReceiptDigest:string,changedPathDigest:string}} H2Member */
/** @param {{repositoryId:string,provider:string,providerRepositoryId:string,installationId:string,bindingEpoch:string,ref:string,expectedHead:string,baseTreeOid:string,baseManifestDigest:string,policyDigest:string,execution:import('../contracts/ports.js').ExecutionIdentity}} common @param {readonly H2Member[]} input */
export function h2MemberTuple(common,input){
 id(common.repositoryId);id(common.installationId);revision(common.bindingEpoch);oid(common.expectedHead);oid(common.baseTreeOid);digest(common.baseManifestDigest);digest(common.policyDigest);
 requireThat(typeof common.provider==='string'&&typeof common.providerRepositoryId==='string'&&typeof common.ref==='string','INVALID_ARGUMENT');
 const members=input.map(member=>({...member})).sort((a,b)=>compareH2Utf8(a.workId,b.workId)||compareH2Utf8(a.actionId,b.actionId));
 requireThat(members.length>=2&&members.length<=64,'LIMIT_EXCEEDED','H2 member count');
 const seen=new Set();for(const m of members){id(m.workId);id(m.actionId);id(m.principal);id(m.requestId);digest(m.intentDigest);revision(m.generation);revision(m.reservedWorkRevision);oid(m.candidateTreeOid);digest(m.candidateManifestDigest);id(m.memberResultId);digest(m.memberValidationId);id(m.memberReceiptRunId);digest(m.memberReceiptDigest);digest(m.changedPathDigest);requireThat(!seen.has(m.workId+'\0'+m.actionId),'INTEGRITY_FAILURE','Duplicate H2 member');seen.add(m.workId+'\0'+m.actionId);}
 requireThat(new Set(members.map(m=>m.workId)).size===members.length&&new Set(members.map(m=>m.actionId)).size===members.length,'INTEGRITY_FAILURE','Duplicate H2 member identity');
 const tuple={version:H2_VERSION,...common,members};requireThat(Buffer.byteLength(canonicalJson(tuple))<=H2_MAX_TUPLE_BYTES,'LIMIT_EXCEEDED','H2 tuple bytes');
 return {tuple,memberTupleDigest:recordDigest('tdev.h2-members.v1',tuple)};
}
/** @param {string} memberTupleDigest @param {{treeOid:string,manifestDigest:string}} tree */
export function h2Composition(memberTupleDigest,tree){digest(memberTupleDigest);oid(tree.treeOid);digest(tree.manifestDigest);return recordDigest('tdev.h2-composition.v1',{memberTupleDigest,resultTreeOid:tree.treeOid,resultTreeSha256:tree.manifestDigest});}
/** Result IDs are deterministic 64-hex identifiers, not digest strings. @param {string} compositionIdentity */
export function h2ResultId(compositionIdentity){digest(compositionIdentity);return recordDigest('tdev.h2-result.v1',{compositionIdentity}).slice(7);}
/** @param {{memberTupleDigest:string,compositionIdentity:string,repositoryId:string,bindingEpoch:string,ref:string,expectedHead:string,commitOid:string,resultTreeOid:string,resultTreeSha256:string,preparedResultId:string,validationId:string,policyDigest:string}} value @param {'tdev'|'dev2'} [namespace] */
export function h2EffectId(value,namespace='tdev'){digest(value.memberTupleDigest);digest(value.compositionIdentity);id(value.repositoryId);revision(value.bindingEpoch);oid(value.expectedHead);oid(value.commitOid);oid(value.resultTreeOid);digest(value.resultTreeSha256);id(value.preparedResultId);digest(value.validationId);digest(value.policyDigest);requireThat(namespace==='tdev'||namespace==='dev2','INTEGRITY_FAILURE');return recordDigest(namespace+'.h2-effect.v1',value).slice(7);}
/** @param {string} actor @param {readonly {metadata:{timestamp:number}}[]} memberResults */
export function h2CommitMetadata(actor,memberResults){requireThat(typeof actor==='string'&&actor.length>0&&memberResults.length>=2,'INVALID_ARGUMENT');const timestamps=memberResults.map(result=>result.metadata.timestamp);requireThat(timestamps.every(Number.isSafeInteger),'INTEGRITY_FAILURE');return {author:actor,committer:actor,timestamp:Math.max(...timestamps),message:'tdev composed source change'};}
/** @param {Uint8Array} bytes */
export function decodeH2Tuple(bytes){requireThat(bytes instanceof Uint8Array&&bytes.byteLength<=H2_MAX_TUPLE_BYTES,'LIMIT_EXCEEDED');const value=parseRecord(bytes,H2_MAX_TUPLE_BYTES);requireThat(value&&typeof value==='object'&&!Array.isArray(value),'INTEGRITY_FAILURE','Unsupported H2 tuple');const tuple=/** @type {{version?:unknown,members?:unknown}} */(value);requireThat(tuple.version===H2_VERSION&&Array.isArray(tuple.members),'INTEGRITY_FAILURE','Unsupported H2 tuple');return tuple;}
