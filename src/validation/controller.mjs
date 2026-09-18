import {mkdir,readFile,writeFile,rename,rm,mkdtemp,lstat,realpath} from 'node:fs/promises';
import {resolve,join,dirname,isAbsolute} from 'node:path';
import {bytesDigest,recordDigest,canonicalJson,parseRecord} from '../contracts/canonical.mjs';
import {digest} from '../contracts/identity.mjs';
import {requireThat} from '../contracts/errors.mjs';
import {verifySource} from '../candidate/tree.mjs';
/** Current controller artifact format. The immutable selected digest authorizes
 * only the exact installed controller bytes and finite command surface.
 */
export const CONTROLLER_FILES=Object.freeze(['tools/validate.mjs','src/validation/selection.mjs','src/contracts/canonical.mjs','src/contracts/errors.mjs','src/contracts/identity.mjs','src/runtime/environment.mjs','config/toolchain.lock.json','config/validation-profiles.json','jsconfig.json','package.json','package-lock.json','docs/design/check.py'].sort());
export const PRODUCTION_CONTROLLER_FILES=Object.freeze([...CONTROLLER_FILES,'tools/build-release.mjs','src/release/build-output.mjs'].sort());
/** The immutable approved source selects a controller artifact format. Actual
 * execution authorization separately requires the exact private enrollment.
 * @param {import('../contracts/ports.js').SourceTree} source @param {'tdev'} [namespace] */
export function controllerDefinition(source,namespace='tdev'){requireThat(namespace==='tdev','INVALID_ARGUMENT','Controller namespace');const entries=verifySource(source),byPath=new Map(entries.map(e=>[e.path,e])),paths=byPath.has('src/execution/production-runner.mjs')?PRODUCTION_CONTROLLER_FILES:CONTROLLER_FILES;
 const files=paths.map(path=>{const e=byPath.get(path);requireThat(e&&e.mode==='100644'&&e.size<=1048576,'INTEGRITY_FAILURE','Approved controller file is missing or not regular: '+path);return {path,contentDigest:e.contentDigest,size:e.size};});
 const tests=Object.fromEntries(['core','integration'].map(profile=>{const paths=entries.filter(e=>e.path.startsWith('test/'+profile+'/')&&e.path.endsWith('.test.mjs')).map(e=>{requireThat(e.mode==='100644','INTEGRITY_FAILURE','Required test must be regular');return e.path;}).sort();requireThat(paths.length>0&&paths.length<=4096,'INTEGRITY_FAILURE','Approved mandatory suite is empty');return [profile,paths];}));const definition={schemaVersion:1,files,tests};return {definition,digest:recordDigest(namespace+'.trusted-controller.v1',definition)};
}
/** @param {{repository:Pick<import('../repository/git.mjs').GitRepository,'blob'>,source:import('../contracts/ports.js').SourceTree,cacheDirectory:string,expectedDigest:string}} options */
export async function prepareController(options){digest(options.expectedDigest);requireThat(isAbsolute(options.cacheDirectory),'INVALID_ARGUMENT');const cache=resolve(options.cacheDirectory);await mkdir(cache,{recursive:true,mode:0o700});requireThat(await realpath(cache)===cache,'FORBIDDEN');const current=controllerDefinition(options.source,'tdev'),definition=options.expectedDigest===current.digest?current:null;requireThat(definition,'INTEGRITY_FAILURE','Approved controller identity differs');const destination=join(cache,definition.digest.slice(7)),temporary=await mkdtemp(join(cache,'.controller-'));
 try{const byPath=new Map(options.source.entries.map(e=>[e.path,e]));for(const e of definition.definition.files){const original=byPath.get(e.path);requireThat(original,'INTEGRITY_FAILURE');const bytes=await options.repository.blob(original.blobOid);requireThat(bytes.byteLength===e.size&&bytesDigest(bytes)===e.contentDigest,'INTEGRITY_FAILURE');const path=join(temporary,e.path);await mkdir(dirname(path),{recursive:true,mode:0o755});await writeFile(path,bytes,{flag:'wx',mode:0o444});}await mkdir(join(temporary,'node_modules'),{mode:0o755});await writeFile(join(temporary,'validation-selection.json'),canonicalJson(definition.definition),{flag:'wx',mode:0o444});try{await rename(temporary,destination);}catch(error){if(!error||typeof error!=='object'||!('code'in error)||!['EEXIST','ENOTEMPTY'].includes(String(error.code)))throw error;}return await verifyController(destination,definition.digest);}finally{await rm(temporary,{recursive:true,force:true});}
}
/** Only an exact previously selected artifact digest authorizes its bytes. The
 * current format remains closed; adding a host hook or dropping a mandatory file fails.
 * @param {string} directory @param {string} expected */
export async function verifyController(directory,expected){digest(expected);requireThat(isAbsolute(directory)&&resolve(directory)===directory&&await realpath(directory)===directory,'FORBIDDEN');const definition=/** @type {ReturnType<typeof controllerDefinition>['definition']} */(/** @type {unknown} */(parseRecord(await readFile(join(directory,'validation-selection.json')),1048576))),paths=canonicalJson(definition.files.map(e=>e.path)),current=recordDigest('tdev.trusted-controller.v1',definition);requireThat(definition.schemaVersion===1&&expected===current&&(paths===canonicalJson(CONTROLLER_FILES)||paths===canonicalJson(PRODUCTION_CONTROLLER_FILES)),'INTEGRITY_FAILURE');
 for(const e of definition.files){const path=join(directory,e.path),stat=await lstat(path);requireThat(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1&&await realpath(path)===path&&stat.size===e.size,'INTEGRITY_FAILURE');requireThat(bytesDigest(await readFile(path))===e.contentDigest,'INTEGRITY_FAILURE','Controller artifact changed');}return {directory,digest:expected,definition};
}
