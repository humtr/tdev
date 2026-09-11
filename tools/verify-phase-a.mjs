/** Read-only installation acceptance, not human OAuth or production release proof.
 * No arbitrary tool/path/principal/mutation may be selected by this operator CLI.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {parseArgs} from 'node:util';
import {bytesDigest,canonicalJson} from '../src/contracts/canonical.mjs';
import {privateFile,readNativeConfig} from '../src/runtime/native.mjs';
import {SCHEMA_DIGEST,TOOL_DESCRIPTORS,validateOutput} from '../src/mcp/outputs.mjs';
import {installationOwnerGrant} from '../src/security/installation-grant.mjs';
/** @typedef {{installationId:string,origin:string,releaseDirectory:string,configFile:string,sourceCommitOid:string,schemaDigest:string,deviceBundleDigest:string,edgeBundleDigest:string,serviceDirectory:string}} Manifest */
/** @typedef {Record<string,any>} Row */
async function main(){
 process.umask(0o077);
 const args=parseArgs({options:{installation:{type:'string'},'provider-readback':{type:'string'},output:{type:'string'}},strict:true,allowPositionals:false}).values;
 assert.ok(args.installation&&args['provider-readback']&&args.output);
 const manifest=/** @type {Manifest} */(JSON.parse((await privateFile(resolve(args.installation))).toString()));
 const config=await readNativeConfig(manifest.configFile);
 const provider=/** @type {Row} */(JSON.parse(await readFile(resolve(args['provider-readback']),'utf8')));
 assert.equal(provider.origin,manifest.origin);
 assert.equal(provider.route.enabled,true);assert.equal(provider.route.previews_enabled,false);
 assert.equal(provider.configurationReadback.matchesInstalled,true);
 assert.equal(provider.configurationReadback.sourceCommitOid,manifest.sourceCommitOid);
 assert.equal(provider.configurationReadback.edgeBundleDigest,manifest.edgeBundleDigest);
 assert.equal(provider.configurationReadback.installationId,manifest.installationId);
 assert.equal(provider.deployment.versions.length,1);assert.equal(provider.deployment.versions[0].percentage,100);
 assert.ok(Date.now()-Date.parse(provider.observedAt)<300000&&Date.parse(provider.observedAt)<=Date.now()+60000,'Fresh provider readback is required');
 assert.equal(manifest.schemaDigest,SCHEMA_DIGEST);assert.equal(config.runtime.schemaDigest,SCHEMA_DIGEST);
 assert.equal(config.edge.origin,manifest.origin);assert.equal(config.edge.installationId,manifest.installationId);
 assert.equal(bytesDigest(await privateFile(join(manifest.releaseDirectory,'worker.mjs'),4194304)),manifest.edgeBundleDigest);
 assert.equal(bytesDigest(await privateFile(join(manifest.releaseDirectory,'device.cjs'),4194304)),manifest.deviceBundleDigest);
 assert.deepEqual(JSON.parse((await privateFile(join(manifest.releaseDirectory,'tools.json'),2097152)).toString()),TOOL_DESCRIPTORS);
 for(const grant of config.edge.grants){assert.equal(canonicalJson(grant),canonicalJson(installationOwnerGrant({subject:grant.subject,installationId:config.edge.installationId,repositoryId:config.edge.binding.repositoryId,ref:config.edge.binding.ref}))); }
 assert.ok(config.edge.grants.length>0);
 const secret=(await privateFile(config.deviceKeyFile,1024)).toString().trim();
 assert.equal(bytesDigest(Buffer.from(secret)),config.edge.deviceCredentialDigest);
 const auth={authorization:'Bearer '+secret};
 /** @param {string} path @param {string} [method] @param {Record<string,string>} [headers] @param {string} [body] */
 async function get(path,method='GET',headers={},body){
  const response=await fetch(manifest.origin+path,{method,headers,body,redirect:'manual',signal:AbortSignal.timeout(45000)});
  const reader=response.body?.getReader();let size=0;const chunks=[];
  if(reader)try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;assert.ok(size<=2097152,'Bounded installation response exceeded');chunks.push(part.value);}}finally{await reader.cancel().catch(()=>{});}
  let value=/** @type {Row|null} */(null);try{value=JSON.parse(Buffer.concat(chunks).toString());}catch{}
  return {status:response.status,body:value,bytes:size};
 }
 const status=await get('/__dev2/status','GET',auth);assert.equal(status.status,200);assert.ok(status.body);
 const live=status.body;assert.equal(live.installationId,manifest.installationId);
 assert.equal(live.edgeVersionId,provider.deployment.versions[0].version_id);assert.equal(live.schemaDigest,SCHEMA_DIGEST);
 assert.deepEqual(live.discovery.tools,TOOL_DESCRIPTORS);assert.equal(live.route.connected,true);
 assert.equal(live.device.sourceCommitOid,manifest.sourceCommitOid);assert.equal(live.device.bundleDigest,manifest.deviceBundleDigest);
 assert.equal(live.device.schemaDigest,SCHEMA_DIGEST);
 const response=await get('/__dev2/verify','POST',auth);assert.equal(response.status,200);assert.ok(response.body);
 const probe=response.body.probe;assert.equal(probe.summary.ok,true);assert.equal(probe.summary.humanOAuth,false);
 assert.deepEqual(response.body.discovery.tools,TOOL_DESCRIPTORS);
 for(const [name,tool] of [['context','dev_context'],['read','dev_read'],['runtime','dev_observe'],['open','dev_observe']]){
  assert.equal(validateOutput(tool,probe[name]).ok,true);
 }
 const negative=/** @type {Record<string,{status:number}>} */({});
 for(const [name,headers] of /** @type {[string,Record<string,string>][]} */([['none',{}],['deviceCredential',auth],['forgedAssertion',{'cf-access-jwt-assertion':'invalid.invalid.invalid'}]])){
  const rejected=await get('/mcp','POST',{'content-type':'application/json',...headers},JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}}));
  assert.ok([401,403].includes(rejected.status));negative[name]={status:rejected.status};
 }
 const denied=await get('/__dev2/status');assert.equal(denied.status,401);negative.installationWithoutCredential={status:denied.status};
 const metadata=await get('/.well-known/oauth-protected-resource/mcp');assert.equal(metadata.status,200);assert.equal(metadata.body?.resource,manifest.origin+'/mcp');
 const evidence={observedAt:new Date().toISOString(),status:'PASS',layer:'phase-a-installation-readback',origin:manifest.origin,
  sourceCommitOid:manifest.sourceCommitOid,schemaDigest:SCHEMA_DIGEST,edgeVersionId:live.edgeVersionId,edgeBundleDigest:manifest.edgeBundleDigest,
  installationId:manifest.installationId,device:live.device,route:live.route,probe:probe.summary,
  currentHead:probe.context.data.snapshot.commitOid,repository:probe.context.data.repository,runtime:probe.runtime.data.runtime,
  openWorkCount:probe.open.data.works.length,openWorkComplete:probe.open.data.complete,
  publishedTools:TOOL_DESCRIPTORS.map(t=>({name:t.name,annotations:t.annotations})),publishedInputOutputSchemasExact:true,
  immutableInstalledArtifactDigestsMatch:true,installedGrantMatchesPublishedConstructor:true,negativeAuthentication:negative,
  protectedResourceMetadata:metadata.body,humanOAuthInvocation:'NOT RUN: first refreshed ChatGPT request must verify actual human OAuth; this fixed installation probe cannot authorize mutations',
  publicMutationInvocation:'NOT RUN before Refresh; native fixture mutation/preparation tests are reported separately'};
 await writeFile(resolve(args.output),canonicalJson(evidence)+'\n',{mode:0o600});
 console.log(JSON.stringify({status:evidence.status,origin:evidence.origin,currentHead:evidence.currentHead,edgeVersionId:evidence.edgeVersionId,deviceOwnerEpoch:live.device.ownerEpoch,openWorkCount:evidence.openWorkCount,schemaDigest:SCHEMA_DIGEST,output:args.output}));
}
main().catch(error=>{console.error(JSON.stringify({event:'phase_a_acceptance_failed',status:'FAIL',location:String(error?.stack??'').split('\n').filter(line=>line.trim().startsWith('at ')).slice(0,3),reason:'Installation, provider or live contract assertion failed; no credential or raw response is logged'}));process.exitCode=1;});
