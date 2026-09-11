import test from 'node:test';
import assert from 'node:assert/strict';
import {OUTPUT_SCHEMAS,TOOL_DESCRIPTORS,SCHEMA_DIGEST,validateOutput} from '../../src/mcp/outputs.mjs';
import {INPUT_SCHEMAS} from '../../src/mcp/input-schemas.mjs';
import {success,failure} from '../../src/contracts/envelopes.mjs';
import {Dev2Error} from '../../src/contracts/errors.mjs';
import {canonicalJson} from '../../src/contracts/canonical.mjs';
const digest='sha256:'+'a'.repeat(64),head='sha1:'+'b'.repeat(40),time='2026-09-11T00:00:00.000Z';
const runtime={releaseId:digest,schemaDigest:SCHEMA_DIGEST};
const admission={accepted:true,actionId:'a',workId:'w',status:'queued',revision:'1',generation:'0',deduplicated:false};
test('all public tool schemas have closed output contracts and truthful tool identity',()=>{
 assert.equal(TOOL_DESCRIPTORS.length,4);for(const tool of TOOL_DESCRIPTORS){assert.ok(tool.outputSchema);assert.equal(tool.inputSchema,INPUT_SCHEMAS[tool.name]);assert.equal(tool.annotations.readOnlyHint,tool.name!=='dev_work');}
 assert.throws(()=>TOOL_DESCRIPTORS.push({}));assert.match(SCHEMA_DIGEST,/^sha256:[a-f0-9]{64}$/);
});
test('every tool accepts bounded domain failure including fresh stale-head observations but never a raw error',()=>{
 for(const name of Object.keys(OUTPUT_SCHEMAS)){
 const e=failure(new Dev2Error('STALE_CONTEXT','Stale',{currentHead:head,expectedHead:head,observedAt:time}));assert.equal(canonicalJson(validateOutput(name,e)),canonicalJson(e));
 assert.throws(()=>validateOutput(name,{...e,debug:'token'}),{code:'INTEGRITY_FAILURE'});
 assert.throws(()=>validateOutput(name,{...e,error:{...e.error,stack:'private'}}),{code:'INTEGRITY_FAILURE'});
 }
});
test('admission output is not confused with authoritative execution completion and unknown receipt fields fail',()=>{
 const v=success({items:[{requestId:'r',ok:true,receipt:admission}]},runtime,time);assert.equal(validateOutput('dev_work',v).data.items[0].receipt.status,'queued');
 const invalid=structuredClone(v);invalid.data.items[0].receipt.processId=123;assert.throws(()=>validateOutput('dev_work',invalid),{code:'INTEGRITY_FAILURE'});
 const overflow=structuredClone(v);overflow.data.items[0].receipt.revision='18446744073709551616';assert.throws(()=>validateOutput('dev_work',overflow),{code:'INTEGRITY_FAILURE'});
});
test('observation schema refuses raw source manifests, credential fields and unbounded rows',()=>{
 const data={works:[],actions:[],results:[],runtime:null,complete:true,cursor:null,missingRequestIds:[]};assert.ok(validateOutput('dev_observe',success(data,runtime,time)));
 for(const extra of [{source:{entries:[]}},{credential:'secret'},{events:[]}])assert.throws(()=>validateOutput('dev_observe',success({...data,...extra},runtime,time)));
 assert.throws(()=>validateOutput('dev_observe',success({...data,missingRequestIds:Array(65).fill('r')},runtime,time)));
});
