import test from 'node:test';
import assert from 'node:assert/strict';
import legacy from '../fixtures/public-contract-before-c2.json' with {type:'json'};
import {TOOL_DESCRIPTORS,SCHEMA_DIGEST} from '../../src/mcp/outputs.mjs';
import {publicContractTransition,publicDescriptor} from '../../src/release/contract-migration.mjs';
import {recordDigest,canonicalJson} from '../../src/contracts/canonical.mjs';
test('exact pre-C2 descriptor accepts additive C2 migration with stable valid-domain identity',()=>{
 const t=publicContractTransition(legacy.tools,TOOL_DESCRIPTORS);assert.equal(t.compatible,true,canonicalJson(t));assert.equal(t.previousSchemaDigest,legacy.schemaDigest);assert.equal(t.targetSchemaDigest,SCHEMA_DIGEST);
 const {transitionDigest,...record}=t;assert.equal(transitionDigest,recordDigest('tdev.public-contract-transition.v1',record));assert.deepEqual(publicContractTransition(JSON.parse(JSON.stringify(legacy.tools)),TOOL_DESCRIPTORS),t);
 const reverse=publicContractTransition(TOOL_DESCRIPTORS,legacy.tools);assert.equal(reverse.compatible,false);assert.notEqual(reverse.transitionDigest,t.transitionDigest);assert.deepEqual(publicContractTransition(TOOL_DESCRIPTORS,legacy.tools),reverse);
 assert.throws(()=>recordDigest('public-contract-v1',record),{code:'INVALID_ARGUMENT'});
});
const shape=()=>({type:'object',properties:{text:{type:'string',minLength:1,maxLength:10},count:{type:'integer',minimum:0,maximum:10},choice:{enum:['a','b']},optional:{type:'string'}},required:['text'],additionalProperties:false});
const descriptors=()=>TOOL_DESCRIPTORS.map(t=>({...structuredClone(t),inputSchema:shape(),outputSchema:shape()}));
for(const [name,mutate] of Object.entries({
 removal:s=>delete s.properties.optional,
 rename:s=>{s.properties.renamed=s.properties.optional;delete s.properties.optional;},
 type:s=>s.properties.optional.type='integer',
 enum:s=>s.properties.choice.enum=['a'],
 minimum:s=>s.properties.count.minimum=1,
 maximum:s=>s.properties.count.maximum=9,
 minLength:s=>s.properties.text.minLength=2,
 maxLength:s=>s.properties.text.maxLength=9,
 required:s=>s.required.push('optional'),
 default:s=>s.properties.optional.default='changed',
 constraint:s=>s.properties.text.pattern='a',
 outputRemoval:s=>delete s.properties.optional
}))test('structural checker rejects '+name,()=>{const old=descriptors(),next=structuredClone(old);mutate(next[0][name==='outputRemoval'?'outputSchema':'inputSchema']);assert.equal(publicContractTransition(old,next).compatible,false);});
test('optional input, required-set reduction and additive required output are accepted',()=>{const old=descriptors(),next=structuredClone(old);next[0].inputSchema.properties.extra={type:'string'};next[0].inputSchema.required=[];next[0].outputSchema.properties.extra={type:'string'};next[0].outputSchema.required.push('extra');assert.equal(publicContractTransition(old,next).compatible,true);});
test('tool count names descriptions and all annotations are preserved',()=>{for(const mutate of [x=>x.pop(),x=>x[0].name='shell',x=>x[0].annotations.readOnlyHint=false,x=>x[0].annotations.destructiveHint=true,x=>x[0].annotations.idempotentHint=true,x=>x[0].annotations.openWorldHint=true]){const next=descriptors();mutate(next);assert.throws(()=>publicDescriptor(next));}const old=descriptors(),next=structuredClone(old);next[0].description+=' changed';assert.equal(publicContractTransition(old,next).compatible,false);});
