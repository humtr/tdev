import {resolve,join} from 'node:path';
import {canonicalJson} from '../contracts/canonical.mjs';
import {requireThat} from '../contracts/errors.mjs';
/** The installed controller owns discovery rules. Candidate configuration may be
 * tested as data, but it cannot remove required suites, compiler coverage or known
 * regression files. New tests inside the fixed suite are always included.
 * @param {string} profile @param {readonly string[]} approved @param {readonly string[]} candidate */
export function selectRequiredTests(profile,approved,candidate){
 requireThat(['core','integration'].includes(profile),'INVALID_ARGUMENT');
 const prefix='test/'+profile+'/';
 for(const list of [approved,candidate]){
  requireThat(Array.isArray(list)&&list.length>0&&list.length<=4096&&new Set(list).size===list.length,'INTEGRITY_FAILURE','Required suite is empty or duplicated');
  requireThat(list.every(p=>typeof p==='string'&&p.startsWith(prefix)&&p.endsWith('.test.mjs')&&!p.split('/').some(s=>!s||s==='.'||s==='..'||s==='.git'||s==='node_modules')&&!/[\0\\]/.test(p)),'INTEGRITY_FAILURE','Test escaped installed selector');
 }
 const present=new Set(candidate);
 requireThat(approved.every(p=>present.has(p)),'INTEGRITY_FAILURE','An installed mandatory regression file was removed; adoption cannot precede old-policy validation');
 return [...candidate].sort();
}
/** Explicit source files plus installed compiler settings avoid a candidate
 * jsconfig/extends/exclude/plugin replacing the required type check. The temporary
 * project is written only in scratch. Dependencies remain immutable mounts.
 * @param {string} sourceRoot @param {readonly string[]} candidates @param {{compilerOptions:Record<string,unknown>}} installed */
export function requiredTypecheck(sourceRoot,candidates,installed){
 requireThat(resolve(sourceRoot)===sourceRoot&&installed&&typeof installed.compilerOptions==='object'&&!Array.isArray(installed.compilerOptions),'INVALID_ARGUMENT');
 const files=candidates.filter(p=>/^(src\/|tools\/|test\/fixtures\/|bench\/)/.test(p)&&/\.(mjs|d\.ts)$/.test(p)).sort();
 requireThat(files.length>0&&files.length<=16384&&files.every(p=>!p.split('/').some(s=>!s||s==='.'||s==='..'||s==='.git'||s==='node_modules')&&!/[\0\\]/.test(p)),'INTEGRITY_FAILURE','Empty or escaping compiler coverage');
 const compilerOptions={...installed.compilerOptions,allowJs:true,checkJs:true,strict:true,noEmit:true,incremental:false,composite:false,typeRoots:[join(sourceRoot,'node_modules/@types')]};
 requireThat(!Object.hasOwn(compilerOptions,'plugins'),'EXECUTION_UNAVAILABLE','Compiler plugins are not a sealed capability');
 const value={compilerOptions,files:files.map(p=>join(sourceRoot,p))};canonicalJson(value);return value;
}
