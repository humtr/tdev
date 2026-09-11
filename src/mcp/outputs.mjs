import { Ajv2020 } from 'ajv/dist/2020.js';
import { canonicalJson, parseRecord, bytesDigest } from '../contracts/canonical.mjs';
import { ERROR_CODES, requireThat } from '../contracts/errors.mjs';
import { TOOL_INPUT_DESCRIPTORS, INPUT_SCHEMAS } from './input-schemas.mjs';
/** @typedef {import('../contracts/ports.js').Json} Json */
/** @typedef {{[key:string]:Json}} Schema */
/** @param {Record<string,Schema>} properties @param {string[]} [required] @returns {Schema} */
const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
/** @param {Schema} value @returns {Schema} */const nullable=value=>({anyOf:[value,{type:'null'}]});
/** @param {string} name @returns {Schema} */const ref=name=>({$ref:'#/$defs/'+name});
/** @param {Schema} items @param {number} [maxItems] @returns {Schema} */const array=(items,maxItems=128)=>({type:'array',items,maxItems});
const string={type:'string',maxLength:4096},number={type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER},boolean={type:'boolean'};
/** @type {Record<string,Schema>} */
const defs={
 id:{type:'string',pattern:'^[A-Za-z0-9_-]{1,128}$'},
 revision:/** @type {Schema} */(/** @type {{revision:Schema}} */(INPUT_SCHEMAS.dev_work.$defs).revision),
 digest:{type:'string',pattern:'^sha256:[0-9a-f]{64}$'},
 oid:{type:'string',pattern:'^(?:sha1:[0-9a-f]{40}|sha256:[0-9a-f]{64})$'},
 timestamp:{type:'string',pattern:'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$'},
 runtime:object({releaseId:ref('digest'),schemaDigest:ref('digest')}),
 status:{enum:['queued','running','blocked','succeeded','failed','cancelled']},
};
defs.error=object({code:{enum:[...ERROR_CODES]},message:string,retry:object({sameRequest:boolean,afterMs:nullable(number)}),facts:object({currentHead:ref('oid'),expectedHead:ref('oid'),observedAt:ref('timestamp'),path:string,startByte:number,maxBytes:number},[])});
defs.entry=object({path:string,mode:{enum:['100644','100755','120000','160000']},blobOid:ref('oid'),contentDigest:ref('digest'),size:number});
defs.listEntry={oneOf:[object({path:string,mode:{const:'040000'},kind:{const:'directory'}}),object({path:string,mode:{enum:['100644','100755','120000','160000']},blobOid:ref('oid'),contentDigest:ref('digest'),size:number,kind:{enum:['file','symlink','gitlink']}})]};
defs.admission=object({accepted:{const:true},actionId:ref('id'),workId:nullable(ref('id')),status:ref('status'),revision:nullable(ref('revision')),generation:nullable(ref('revision')),deduplicated:boolean});
defs.itemOutcome={oneOf:[object({requestId:nullable(ref('id')),ok:{const:true},receipt:ref('admission')}),object({requestId:nullable(ref('id')),ok:{const:false},error:ref('error')})]};
defs.work=object({workId:ref('id'),repositoryId:ref('id'),bindingEpoch:ref('id'),baseCommitOid:ref('oid'),baseTreeOid:ref('oid'),candidateTreeOid:ref('oid'),candidateDigest:ref('digest'),generation:ref('revision'),revision:ref('revision'),disposition:{enum:['open','integrated','cancelled']},currentActionId:nullable(ref('id')),objective:string});
defs.action=object({actionId:ref('id'),requestId:ref('id'),workId:nullable(ref('id')),operation:string,status:ref('status'),step:string,attempt:ref('revision'),revision:ref('revision'),deadline:number,resultId:nullable(ref('id')),errorCode:nullable({enum:[...ERROR_CODES]}),cancelRequested:boolean});
defs.validation=object({validationId:ref('digest'),runId:ref('id'),startedAt:number,endedAt:number,exitCode:nullable({type:'integer'}),signal:nullable(string),deadlineExceeded:boolean,inputDigest:ref('digest'),outputDigest:ref('digest'),outcomes:array(object({profileDigest:ref('digest'),status:{enum:['passed','failed','cancelled','not_run']},exitCode:nullable({type:'integer'})})),eligible:boolean});
defs.result=object({resultId:ref('id'),workId:ref('id'),generation:ref('revision'),expectedHead:ref('oid'),commitOid:ref('oid'),resultTreeOid:ref('oid'),resultTreeSha256:ref('digest'),policyDigest:ref('digest'),validation:nullable(ref('validation')),integration:nullable({oneOf:[object({kind:{const:'integrated'},observedHead:ref('oid'),observedAt:ref('timestamp')}),object({kind:{const:'stale'},observedHead:ref('oid')}),object({kind:{enum:['uncertain','retryable','binding_fenced']}})]})});
defs.runtimeState=object({releaseId:ref('digest'),schemaDigest:ref('digest'),accepting:boolean,capacity:{type:'integer',minimum:1},reservedAttempts:number,executingActions:number,environmentClass:string,deploymentSealed:boolean});
defs.queryResult={oneOf:[
 object({kind:{const:'list'},entries:array(ref('listEntry'),256),complete:boolean,nextCursor:nullable(ref('id'))}),
 object({kind:{const:'file'},entry:ref('entry'),offset:number,length:number,encoding:{enum:['utf8','base64']},content:{type:'string',maxLength:1398104},truncated:boolean}),
 object({kind:{const:'search'},hits:array(object({path:string,blobOid:ref('oid'),contentDigest:ref('digest'),byteOffset:number}),128),scannedBytes:number,complete:boolean,nextCursor:nullable(ref('id'))}),
 object({kind:{const:'diff'},changes:array(object({path:string,before:nullable(ref('entry')),after:nullable(ref('entry'))}),256),complete:boolean,nextCursor:nullable(ref('id'))}),
 object({kind:{const:'artifact'},artifactId:ref('id'),contentDigest:ref('digest'),startByte:number,bytes:number,encoding:{const:'base64'},content:{type:'string',maxLength:1398104},complete:boolean,nextByte:nullable(number)})
]};
const snapshot=object({snapshotId:ref('id'),commitOid:ref('oid'),treeOid:ref('oid'),manifestDigest:ref('digest'),observedAt:ref('timestamp'),expiresAt:ref('timestamp'),freshness:{enum:['current','pinned']},notCurrent:boolean});
/** @type {Record<string,Schema>} */
const data={
 dev_context:object({repository:object({repositoryId:ref('id'),provider:string,providerRepositoryId:string,ref:string,bindingEpoch:ref('id'),policyDigest:ref('digest')}),snapshot,
  limits:object({directoryEntries:number,files:number,returnBytes:number,blobBytes:number,searchHits:number,scanBytes:number,defaultParallelism:{const:8},executionCapacity:{type:'integer',minimum:1}}),
  profiles:array(object({profileId:string,digest:ref('digest'),required:boolean})),operations:array(object({op:string,available:boolean,reason:nullable(string)})),root:ref('queryResult'),bootstrapPaths:array(string,16)}),
 dev_read:object({treeOid:nullable(ref('oid')),manifestDigest:nullable(ref('digest')),notCurrent:boolean,results:array(ref('queryResult'),32),returnedBytes:number,openedFiles:number,scannedBytes:number}),
 dev_work:object({items:array(ref('itemOutcome'),64)}),
 dev_observe:object({works:array(ref('work')),actions:array(ref('action')),results:array(ref('result')),runtime:nullable(ref('runtimeState')),complete:boolean,cursor:nullable(ref('id')),missingRequestIds:array(ref('id'),64)})
};
/** @param {Schema} root */
function bundled(root){
 /** @type {Record<string,Schema>} */const used={};
 /** @param {Json} value */function visit(value){if(value===null||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(visit);return;}if(typeof value.$ref==='string'){const name=value.$ref.slice(8);requireThat(name in defs,'INTEGRITY_FAILURE');if(!(name in used)){used[name]=defs[name];visit(defs[name]);}}Object.values(value).forEach(visit);}
 visit(root);return {$schema:'https://json-schema.org/draft/2020-12/schema',...root,$defs:used};}
/** @template T @param {T} value @returns {T} */function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
export const OUTPUT_SCHEMAS=freeze(Object.fromEntries(Object.entries(data).map(([name,shape])=>[name,bundled({type:'object',oneOf:[object({apiVersion:{const:1},ok:{const:true},data:shape,observedAt:ref('timestamp'),runtime:ref('runtime')}),object({apiVersion:{const:1},ok:{const:false},error:ref('error')})]})])));
export const TOOL_DESCRIPTORS=freeze(TOOL_INPUT_DESCRIPTORS.map(tool=>({...tool,outputSchema:OUTPUT_SCHEMAS[tool.name]})));
export const SCHEMA_DIGEST=bytesDigest(Buffer.from(canonicalJson(TOOL_DESCRIPTORS)));
const ajv=new Ajv2020({strict:true,strictRequired:false,allErrors:false,coerceTypes:false,removeAdditional:false,useDefaults:false});
const validators=Object.fromEntries(Object.entries(OUTPUT_SCHEMAS).map(([name,schema])=>[name,ajv.compile(schema)]));
/** Closed projection is checked before serialization, never strips an unexpected field.
 * @param {string} name @param {unknown} value @returns {{[key:string]:Json}} */
export function validateOutput(name,value){const checked=parseRecord(canonicalJson(value),2097152);requireThat(Object.hasOwn(validators,name)&&validators[name](checked),'INTEGRITY_FAILURE','Tool output violates its published contract');return /** @type {{[key:string]:Json}} */(checked);}
