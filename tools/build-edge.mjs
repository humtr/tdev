/** Reproducible Worker build: AOT schema validation, no compiler/eval at runtime. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import standaloneModule from 'ajv/dist/standalone/index.js';
const standaloneCode=/** @type {(ajv:Ajv2020,refs:Record<string,string>)=>string} */(/** @type {unknown} */(standaloneModule));
import { build } from 'esbuild';
import { OUTPUT_SCHEMAS, TOOL_DESCRIPTORS, SCHEMA_DIGEST } from '../src/mcp/outputs.mjs';
import { canonicalJson, bytesDigest } from '../src/contracts/canonical.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=resolve(root,process.argv[2]??'.artifacts/build');await mkdir(out,{recursive:true});
const ajv=new Ajv2020({strict:true,strictRequired:false,code:{source:true,esm:true},coerceTypes:false,removeAdditional:false,useDefaults:false});
/** @type {Record<string,string>} */const exports={};
for(const [name,schema] of Object.entries(OUTPUT_SCHEMAS)){const id='urn:dev2:output:'+name;ajv.addSchema(schema,id);exports['v_'+name]=id;}
const validators=standaloneCode(ajv,exports);
const rel=/** @param {string} path */path=>JSON.stringify(join(root,path));
const contract=`import * as validators from 'dev2-generated:validators.mjs';
import {canonicalJson,parseRecord} from ${rel('src/contracts/canonical.mjs')};
import {requireThat} from ${rel('src/contracts/errors.mjs')};
export const TOOL_DESCRIPTORS=${canonicalJson(TOOL_DESCRIPTORS)};
export const SCHEMA_DIGEST=${JSON.stringify(SCHEMA_DIGEST)};
export function validateOutput(name,value){const checked=parseRecord(canonicalJson(value),2097152);const validator=validators['v_'+name];requireThat(typeof validator==='function'&&validator(checked),'INTEGRITY_FAILURE','Tool output violates its published contract');return checked;}
`;
const generated=new Map([['validators.mjs',validators],['contract.mjs',contract],['buffer.mjs',"export {Buffer} from 'node:buffer';\n"]]);
// Stable virtual module identities prevent output-directory names leaking into
// esbuild's module initialization keys. Resolution stays anchored to the locked
// source dependency set; no writable source, runtime compiler or external helper.
const result=await build({absWorkingDir:root,entryPoints:[join(root,'src/edge/worker.mjs')],outfile:join(out,'worker.mjs'),bundle:true,format:'esm',platform:'neutral',target:'es2022',conditions:['workerd','worker','browser'],mainFields:['module','main'],nodePaths:[join(root,'node_modules')],external:['node:*'],inject:['dev2-generated:buffer.mjs'],metafile:true,legalComments:'none',minifyWhitespace:true,
 plugins:[{name:'frozen-contract-aot',setup(builder){
  builder.onResolve({filter:/^\.\/contract\.mjs$/},args=>args.importer.startsWith(join(root,'src/edge/'))?{path:'contract.mjs',namespace:'dev2-generated'}:null);
  builder.onResolve({filter:/^dev2-generated:/},args=>{const name=args.path.slice('dev2-generated:'.length);if(!generated.has(name))throw Error('Unknown generated build module');return {path:name,namespace:'dev2-generated'};});
  builder.onLoad({filter:/.*/,namespace:'dev2-generated'},args=>{const contents=generated.get(args.path);if(contents===undefined)throw Error('Unknown generated build module');return {contents,loader:'js',resolveDir:root};});
 }}]});
const bytes=await readFile(join(out,'worker.mjs'));
if(/new Function\(|eval\(/.test(bytes.toString()))throw Error('Dynamic code generation in edge bundle');
for(const name of Object.keys(result.metafile.inputs))if(/(?:src\/runtime\/application|src\/storage\/ledger|src\/mcp\/input-schemas|node_modules\/ajv\/dist\/compile)/.test(name))throw Error('Forbidden edge input: '+name);
const manifest={schemaDigest:SCHEMA_DIGEST,edgeBundleDigest:bytesDigest(bytes),bytes:bytes.byteLength,tools:TOOL_DESCRIPTORS.map(t=>({name:t.name,annotations:t.annotations})),builder:'esbuild-0.28.2',aot:true};
await writeFile(join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await writeFile(join(out,'tools.json'),canonicalJson(TOOL_DESCRIPTORS)+'\n');
console.log(JSON.stringify(manifest));
