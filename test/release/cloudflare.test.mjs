import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {bytesDigest,recordDigest,canonicalJson} from '../../src/contracts/canonical.mjs';
import {CloudflareReleasePort} from '../../src/release/cloudflare.mjs';
import {ActivationJournal} from '../../src/release/journal.mjs';
import {ProviderEffects} from '../../src/release/provider-effects.mjs';
import {activationEffect} from '../../src/release/activation.mjs';
import {releaseIdentity} from '../../src/release/manifest.mjs';
const D='sha256:'+'1'.repeat(64),C0='sha1:'+'2'.repeat(40),C1='sha1:'+'3'.repeat(40),T='sha1:'+'4'.repeat(40);
const V0='00000000-0000-4000-8000-000000000001',V1='00000000-0000-4000-8000-000000000002',P0='00000000-0000-4000-8000-000000000003',P1='00000000-0000-4000-8000-000000000004';
async function world(){
 const root=await mkdtemp(join(tmpdir(),'dev2-cloudflare-')),filename=join(root,'helper.sqlite'),bytes=Buffer.from('export default {fetch(){return new Response("qualified")}};\n'),artifact=bytesDigest(bytes);await writeFile(join(root,'worker.mjs'),bytes);
 const manifest={schemaVersion:1,repositoryId:'repository',bindingEpoch:'1',sourceCommitOid:C1,sourceTreeOid:T,sourceManifestDigest:D,policyDigest:D,schemaDigest:D,protocol:{min:1,max:1},ledger:{min:1,max:1},installationSealDigest:D,requiredValidationId:D,releaseValidationId:D,device:{artifactDigest:D,sourceCommitOid:C0},edge:{artifactDigest:artifact,sourceCommitOid:C1,compatibilityDate:'2026-09-01'},executor:{workflowDigest:D,controllerDigest:D,sealDigest:D}};
 const releaseId=releaseIdentity(manifest),build={manifest,refs:{device:D,edge:artifact,tools:D},receipt:{kind:'fixture-only'}},previous={releaseId:D,schemaDigest:D,sourceCommitOid:C0,deviceReleaseId:D,deviceArtifactDigest:D,deviceSourceCommitOid:C0,edgeVersionId:V0,edgeArtifactDigest:D,edgeSourceCommitOid:C0,protocol:{min:1,max:1},ledger:{min:1,max:1}},target={...previous,releaseId,sourceCommitOid:C1,edgeVersionId:V1,edgeArtifactDigest:artifact,edgeSourceCommitOid:C1};
 const config={installationId:'installation',origin:'https://tdev.humtr.workers.dev',binding:{repositoryId:'repository',bindingEpoch:'1'},deviceCredentialDigest:D,sourceCommitOid:C0,edgeBundleDigest:D};
 const state={uploads:0,deployments:0,loseUpload:false,loseActivation:false,hideUpload:false,unappliedUpload:false,corruptBindings:false,requests:[],versions:new Map(),active:[{id:P0,strategy:'percentage',created_on:new Date().toISOString(),versions:[{version_id:V0,percentage:100}],annotations:{}}]};
 let journal=new ActivationJournal(filename,'installation'),port;
 function version(id,commit,digest,annotations={}){return {id,annotations,resources:{script:{etag:'opaque-etag-'+id},script_runtime:{compatibility_date:'2026-09-01',compatibility_flags:['nodejs_compat']},bindings:[{name:'DEV2_CONFIG_JSON',type:'plain_text',text:canonicalJson({...config,sourceCommitOid:commit,edgeBundleDigest:digest})},{name:'DEV2_DEVICE_SECRET',type:'secret_text'},{name:'DEV2_ROUTER',type:'durable_object_namespace',namespace_id:'a'.repeat(32),class_name:'Dev2RendezvousDO'},{name:'DEV2_VERSION',type:'version_metadata'}]}};}
 state.versions.set(V0,version(V0,C0,D));
 const fetch=async(url,init)=>{
  const u=new URL(url),suffix=u.pathname.split('/scripts/tdev')[1];state.requests.push({method:init.method,suffix});assert.equal(init.redirect,'error');assert.equal(init.headers.authorization,'Bearer '+'s'.repeat(30));
  let result;
  if(init.method==='POST'&&suffix==='/versions'){
   state.uploads++;assert.equal(u.searchParams.get('bindings_inherit'),'strict');const metadata=JSON.parse(await init.body.get('metadata').text()),uploaded=Buffer.from(await init.body.get('worker.mjs').arrayBuffer());assert.equal(bytesDigest(uploaded),artifact);assert.equal(metadata.bindings.filter(b=>b.type==='inherit').length,3);assert.deepEqual(metadata.exports,{Dev2RendezvousDO:{type:'durable-object',storage:'sqlite'}});
   if(!state.unappliedUpload)state.versions.set(V1,version(V1,C1,artifact,metadata.annotations));
   if(state.loseUpload||state.unappliedUpload)throw Error('simulated response loss');result={id:V1};
  }else if(init.method==='POST'&&suffix==='/deployments'){
   state.deployments++;const body=JSON.parse(init.body);assert.equal(body.strategy,'percentage');assert.equal(Object.hasOwn(body,'force'),false);assert.equal(body.versions.length,1);assert.equal(body.versions[0].percentage,100);
   state.active.unshift({id:P1,strategy:body.strategy,created_on:new Date().toISOString(),versions:body.versions,annotations:body.annotations});if(state.loseActivation)throw Error('simulated response loss');result={id:P1};
  }else if(suffix==='/deployments')result={deployments:state.active};
  else if(suffix==='/versions')result={items:state.hideUpload?[state.versions.get(V0)]:[...state.versions.values()]};
  else if(suffix.startsWith('/versions/')){result=structuredClone(state.versions.get(suffix.slice('/versions/'.length)));if(state.corruptBindings&&result)result.resources.bindings[2].namespace_id='b'.repeat(32);}
  else throw Error('Unexpected fixed provider endpoint');
  return new Response(JSON.stringify({success:true,result}),{status:200,headers:{'content-type':'application/json'}});
 };
 const setup=()=>new CloudflareReleasePort({accountId:'c'.repeat(32),workerName:'tdev',routerNamespaceId:'a'.repeat(32),edgeConfig:config,installationSealDigest:D,schemaDigest:D,token:async()=>'s'.repeat(30),effects:new ProviderEffects(journal),artifacts:{verify:async()=>({directory:root})},fetch});port=setup();
 const effect={effectId:'stage-effect',releaseId,inputDigest:recordDigest('dev2.release-stage-effect-input.v1',{releaseId}),artifactDigest:artifact,sourceCommitOid:C1,expectedVersionId:V0};
 const activation=()=>activationEffect(journal.begin({activationId:'activation',actionId:'activate',installationId:'installation',repositoryId:'repository',bindingEpoch:'1',principalId:'owner',createdAt:Date.now(),deadline:Date.now()+60000,previous,target}));
 return {state,build,effect,previous,target,activation,get port(){return port;},restart(){const old=port;journal.close();journal=new ActivationJournal(filename,'installation');port=setup();return old;},async close(){journal.close();await rm(root,{recursive:true,force:true});}};
}
test('exact inactive version upload is single-send with inherited enrolled bindings and content readback',async()=>{const w=await world();try{const r=await w.port.upload(w.effect,w.build);assert.equal(r.kind,'ready');assert.equal(r.versionId,V1);assert.equal(r.artifactDigest,w.effect.artifactDigest);assert.equal((await w.port.active()).versionId,V0);assert.equal((await w.port.upload(w.effect,w.build)).kind,'ready');assert.equal(w.state.uploads,1);}finally{await w.close();}});
test('lost version response reconciles the exact marker and survives helper restart without upload replay',async()=>{const w=await world();try{w.state.loseUpload=true;assert.equal((await w.port.upload(w.effect,w.build)).kind,'ready');const old=w.restart();assert.equal((await w.port.reconcileStage(w.effect)).kind,'ready');assert.equal((await w.port.upload(w.effect,w.build)).kind,'ready');assert.equal(w.state.uploads,1);await assert.rejects(()=>old.reconcileStage(w.effect),{code:'STALE_REVISION'});}finally{await w.close();}});
test('absence after a sent uncertain upload never permits a replacement or retry, including restart',async()=>{const w=await world();try{w.state.unappliedUpload=true;assert.equal((await w.port.upload(w.effect,w.build)).kind,'pending');w.restart();for(let i=0;i<3;i++)assert.equal((await w.port.upload(w.effect,w.build)).kind,'pending');assert.equal(w.state.uploads,1);}finally{await w.close();}});
test('exact deployment response loss and retry retains one effect and one provider deployment',async()=>{const w=await world();try{await w.port.upload(w.effect,w.build);w.state.loseActivation=true;const effect=w.activation();assert.equal((await w.port.activate(effect)).kind,'applied');w.restart();assert.equal((await w.port.reconcileActivation(effect)).kind,'applied');assert.equal((await w.port.activate(effect)).kind,'applied');assert.equal(w.state.deployments,1);assert.equal((await w.port.active()).versionId,V1);}finally{await w.close();}});
test('partial rollout and a foreign active version are not success or permission to send',async()=>{const w=await world();try{await w.port.upload(w.effect,w.build);const effect=w.activation();w.state.active[0].versions=[{version_id:V0,percentage:50},{version_id:V1,percentage:50}];await assert.rejects(()=>w.port.activate(effect),{code:'EFFECT_UNCERTAIN'});assert.equal(w.state.deployments,0);w.state.active[0].versions=[{version_id:V1,percentage:100}];assert.equal((await w.port.activate(effect)).kind,'conflict');assert.equal(w.state.deployments,0);}finally{await w.close();}});
test('provider binding substitution and idempotency input changes are rejected',async()=>{const w=await world();try{await w.port.upload(w.effect,w.build);await assert.rejects(()=>w.port.upload({...w.effect,inputDigest:'sha256:'+'9'.repeat(64)},w.build),{code:'IDEMPOTENCY_MISMATCH'});w.state.corruptBindings=true;await assert.rejects(()=>w.port.reconcileStage(w.effect),{code:'INTEGRITY_FAILURE'});assert.equal(w.state.uploads,1);assert.equal(w.state.deployments,0);}finally{await w.close();}});
