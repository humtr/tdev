import {canonicalJson,parseRecord,bytesDigest} from '../contracts/canonical.mjs';
import {digest} from '../contracts/identity.mjs';
import {requireThat} from '../contracts/errors.mjs';
/** Fixed data-only channel. No archive, path, URL, command or source import can
 * cross from the build sandbox to the credential-bearing release broker. */
export const BUILD_NAMES=Object.freeze(['device.cjs','worker.mjs','tools.json']);
export const BUILD_DATA_BYTES=8388608;
export const BUILD_OUTPUT_BYTES=12582912;
/** @typedef {{name:string,digest:string,size:number,data:string}} EncodedArtifact */
/** @typedef {{schemaVersion:1,kind:'dev2.release-build-output',schemaDigest:string,artifacts:EncodedArtifact[]}} BuildOutput */
/** @param {unknown} value @param {readonly string[]} keys */
function closed(value,keys){requireThat(value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(','),'INTEGRITY_FAILURE','Closed release build output');}
/** A sandbox output is only bytes. Eligibility comes from its authenticated
 * outer execution receipt, not these candidate-supplied digest fields.
 * @param {Uint8Array} bytes @param {string} [expectedSchema] */
export function decodeBuildOutput(bytes,expectedSchema){
 requireThat(bytes.byteLength>0&&bytes.byteLength<=BUILD_OUTPUT_BYTES,'LIMIT_EXCEEDED');
 const value=/** @type {BuildOutput} */(/** @type {unknown} */(parseRecord(bytes,BUILD_OUTPUT_BYTES)));
 closed(value,['schemaVersion','kind','schemaDigest','artifacts']);
 requireThat(value.schemaVersion===1&&value.kind==='dev2.release-build-output','INTEGRITY_FAILURE');digest(value.schemaDigest);
 if(expectedSchema!==undefined)requireThat(value.schemaDigest===digest(expectedSchema),'INTEGRITY_FAILURE','Build changes the frozen public schema');
 requireThat(Array.isArray(value.artifacts)&&value.artifacts.length===BUILD_NAMES.length,'INTEGRITY_FAILURE');
 const artifacts=value.artifacts.map((artifact,index)=>{
  closed(artifact,['name','digest','size','data']);requireThat(artifact.name===BUILD_NAMES[index]&&typeof artifact.data==='string'&&Number.isSafeInteger(artifact.size)&&artifact.size>0&&artifact.size<=BUILD_DATA_BYTES,'INTEGRITY_FAILURE','Fixed named regular build artifact required');
  const data=Buffer.from(artifact.data,'base64');requireThat(data.toString('base64')===artifact.data&&data.length===artifact.size&&bytesDigest(data)===digest(artifact.digest),'INTEGRITY_FAILURE','Build artifact bytes differ');
  return {name:artifact.name,digest:artifact.digest,size:artifact.size,bytes:data};
 });
 requireThat(artifacts.reduce((sum,a)=>sum+a.size,0)<=BUILD_DATA_BYTES,'LIMIT_EXCEEDED');
 const tools=/** @type {{name:string,annotations:{readOnlyHint:boolean,destructiveHint:boolean}}[]} */(/** @type {unknown} */(parseRecord(artifacts[2].bytes,262144)));
 requireThat(Array.isArray(tools)&&tools.length===4&&tools.map(t=>t.name).sort().join(',')==='dev_context,dev_observe,dev_read,dev_work'&&tools.every(t=>t.annotations?.readOnlyHint===true&&t.annotations.destructiveHint===false),'INTEGRITY_FAILURE','Public tool surface/annotation policy differs');
 return {schemaDigest:value.schemaDigest,artifacts,refs:{device:artifacts[0].digest,edge:artifacts[1].digest,tools:artifacts[2].digest}};
}
/** @param {string} schemaDigest @param {Readonly<Record<string,Uint8Array>>} files */
export function encodeBuildOutput(schemaDigest,files){
 requireThat(Object.keys(files).sort().join(',')===[...BUILD_NAMES].sort().join(','),'INTEGRITY_FAILURE');
 const artifacts=BUILD_NAMES.map(name=>{const bytes=files[name];return {name,digest:bytesDigest(bytes),size:bytes.byteLength,data:Buffer.from(bytes).toString('base64')};});
 const bytes=Buffer.from(canonicalJson({schemaVersion:1,kind:'dev2.release-build-output',schemaDigest,artifacts}));decodeBuildOutput(bytes,schemaDigest);return bytes;
}
