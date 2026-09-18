import {recordDigest,parseRecord,canonicalJson} from '../contracts/canonical.mjs';
import {digest} from '../contracts/identity.mjs';
import {verifySource} from '../candidate/tree.mjs';
import {controllerDefinition} from '../validation/controller.mjs';
import {managedPolicy} from '../validation/managed-policy.mjs';
import {requireThat} from '../contracts/errors.mjs';
const CURRENT_WORKFLOW='.github/workflows/tdev-executor.yml';
/** The dependency fence excludes only the duplicated root product name.
 * Every dependency-relevant lockfile-v3 field remains identity-bearing.
 * @param {unknown} value */
export function dependencyLockDigest(value){
 requireThat(value!==null&&typeof value==='object'&&!Array.isArray(value),'INTEGRITY_FAILURE','Dependency lock record');
 const lock=/** @type {Record<string,unknown>} */(structuredClone(value)),packages=lock.packages;
 requireThat(lock.lockfileVersion===3&&typeof lock.name==='string'&&lock.name.length>0&&packages!==null&&typeof packages==='object'&&!Array.isArray(packages),'INTEGRITY_FAILURE','Dependency lock shape');
 const packageMap=/** @type {Record<string,unknown>} */(packages),rawRoot=packageMap[''];
 requireThat(rawRoot!==null&&typeof rawRoot==='object'&&!Array.isArray(rawRoot),'INTEGRITY_FAILURE','Dependency lock root');
 const root=/** @type {Record<string,unknown>} */(rawRoot);
 requireThat(typeof root.name==='string'&&root.name===lock.name,'INTEGRITY_FAILURE','Dependency lock root identity');
 delete lock.name;delete root.name;return recordDigest('tdev.dependency-lock.v1',lock);
}
/** @param {Pick<import('../repository/git.mjs').GitRepository,'blob'>} repository @param {import('../contracts/ports.js').SourceTree} source */
export async function sourceDependencyLockDigest(repository,source){
 const entry=source.entries.find(e=>e.path==='package-lock.json');
 requireThat(entry?.mode==='100644'&&entry.size<=1048576,'INTEGRITY_FAILURE','Dependency lock source');
 return dependencyLockDigest(parseRecord(await repository.blob(entry.blobOid),1048576));
}
/** Content identity, not a self-enrolling seal or a candidate source identity.
 * All approved controller code/config/workflow inputs and the mandatory-test
 * selector floor participate; ordinary candidate source never replaces them.
 * @param {import('../contracts/ports.js').SourceTree} source @param {string} workflowPath */
export function executionControllerIdentity(source,workflowPath){
 requireThat(workflowPath===CURRENT_WORKFLOW,'INTEGRITY_FAILURE','Unknown managed workflow identity');
 const entries=verifySource(source),inner=controllerDefinition(source,'tdev');
 const files=entries.filter(e=>/^(src\/|tools\/|config\/|\.github\/)/.test(e.path)||['package.json','package-lock.json','jsconfig.json'].includes(e.path)).map(e=>{requireThat(e.mode==='100644'||e.mode==='100755','INTEGRITY_FAILURE','Controller input must be regular');return {path:e.path,mode:e.mode,digest:e.contentDigest};}).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 for(const path of ['tools/managed-executor.mjs','src/execution/hosted.mjs',workflowPath,'config/managed-execution.json'])requireThat(files.some(e=>e.path===path),'INTEGRITY_FAILURE','Approved executor is incomplete');
 const definition={schemaVersion:1,controllerDigest:inner.digest,files};return {definition,digest:recordDigest('tdev.execution-controller.v1',definition),controllerDigest:inner.digest};
}
/** @param {Pick<import('../repository/git.mjs').GitRepository,'blob'>} repository @param {import('../contracts/ports.js').SourceTree} source */
export async function managedDefinition(repository,source){
 const entries=new Map(source.entries.map(e=>[e.path,e]));
 const read=async(/** @type {string} */ path)=>{const e=entries.get(path);requireThat(e?.mode==='100644','INTEGRITY_FAILURE');return parseRecord(await repository.blob(e.blobOid),1048576);};
 const config=/** @type {{origin:string,image:string,seccompDigest:string,sessionLifetimeMs:number,idleTimeoutMs:number,workflowPath:string,executionShape?:'production-outer-v1'}} */(/** @type {unknown} */(await read('config/managed-execution.json')));
 requireThat(config.workflowPath===CURRENT_WORKFLOW,'INTEGRITY_FAILURE','Unknown managed workflow identity');
 const controller=executionControllerIdentity(source,config.workflowPath),lock=/** @type {{managedImage:{imageDigest:string}}} */(/** @type {unknown} */(await read('config/toolchain.lock.json')));
 requireThat(config.image==='docker.io/library/node@'+lock.managedImage.imageDigest,'INTEGRITY_FAILURE','Managed image differs from toolchain lock');digest(config.seccompDigest);
 requireThat(config.sessionLifetimeMs===900000&&config.idleTimeoutMs===60000,'EXECUTION_UNAVAILABLE','Unapproved session lifetime');
 requireThat(config.executionShape===undefined||config.executionShape==='production-outer-v1','EXECUTION_UNAVAILABLE','Unknown execution shape');
 if(config.executionShape==='production-outer-v1')for(const path of ['src/execution/production-runner.mjs','src/execution/production-sandbox.mjs','src/execution/outer-receipt.mjs','src/release/build-output.mjs','src/release/build-profile.mjs','tools/build-release.mjs'])requireThat(entries.get(path)?.mode==='100644','INTEGRITY_FAILURE','Production controller is incomplete');
 const value={trustedRunnerDigest:controller.digest,controllerDigest:controller.controllerDigest,toolchainDigest:entries.get('config/toolchain.lock.json')?.contentDigest??'',dependencyLockDigest:await sourceDependencyLockDigest(repository,source),workflowDigest:entries.get(config.workflowPath)?.contentDigest??'',imageDigest:lock.managedImage.imageDigest,seccompDigest:config.seccompDigest};
 for(const d of Object.values(value))digest(d);
 const policy=managedPolicy({trustedRunnerDigest:value.trustedRunnerDigest,toolchainDigest:value.toolchainDigest,dependencyLockDigest:value.dependencyLockDigest,imageDigest:value.imageDigest},'tdev');
 canonicalJson(value);return {identities:value,config,policy,controller};
}
