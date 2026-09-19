import test from 'node:test';
import assert from 'node:assert/strict';
import {recordDigest} from '../../src/contracts/canonical.mjs';
import {HARD_CUTOVER,classifyHardCutoverActivation,validateHardCutoverDeployments,validateLegacyTargetVersion,hardCutoverPlanDigest} from '../../src/release/hard-cutover-recovery.mjs';

function pair(releaseId,edgeVersionId){
 return {releaseId,schemaDigest:'sha256:'+'1'.repeat(64),sourceCommitOid:'sha1:'+'2'.repeat(40),deviceReleaseId:'sha256:'+'3'.repeat(64),deviceArtifactDigest:'sha256:'+'4'.repeat(64),deviceSourceCommitOid:'sha1:'+'5'.repeat(40),edgeVersionId,edgeArtifactDigest:'sha256:'+'6'.repeat(64),edgeSourceCommitOid:'sha1:'+'7'.repeat(40),protocol:{min:1,max:1},ledger:{min:1,max:2}};
}
function activation(){
 const previous=pair('sha256:'+'8'.repeat(64),HARD_CUTOVER.previousVersion),target=pair(HARD_CUTOVER.releaseId,HARD_CUTOVER.targetVersion);
 return {intent:{identityNamespace:'tdev',activationId:HARD_CUTOVER.activationId,actionId:HARD_CUTOVER.actionId,installationId:'inst',repositoryId:'repo',bindingEpoch:'1',principalId:'principal',createdAt:1,deadline:2,previous,target},intentDigest:HARD_CUTOVER.intentDigest,revision:'3',direction:'forward',cursor:0,phase:'blocked',pending:{effect:{identityNamespace:'tdev',effectId:HARD_CUTOVER.effectId,activationId:HARD_CUTOVER.activationId,direction:'forward',step:'edge.activate',inputDigest:HARD_CUTOVER.inputDigest,expected:previous,target},state:'sent',sends:1},receipts:[],reason:'external_effect_uncertain',observedPair:null};
}

test('hard-cutover activation accepts only exact retained blocked identity',()=>{
 assert.equal(classifyHardCutoverActivation(activation()).phase,'blocked');
 const changed=structuredClone(activation());changed.pending.effect.target.edgeVersionId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
 assert.throws(()=>classifyHardCutoverActivation(changed));
});

test('hard-cutover deployment fence requires exact previous-only active deployment',()=>{
 const deployments=[{id:HARD_CUTOVER.activeDeployment,strategy:'percentage',versions:[{version_id:HARD_CUTOVER.previousVersion,percentage:100}],annotations:{}}];
 assert.equal(validateHardCutoverDeployments(deployments).versionId,HARD_CUTOVER.previousVersion);
 assert.throws(()=>validateHardCutoverDeployments([{...deployments[0],versions:[{version_id:HARD_CUTOVER.targetVersion,percentage:100}]}]));
});

test('abandoned target must retain exact legacy provider identity before deletion',()=>{
 const version={id:HARD_CUTOVER.targetVersion,resources:{bindings:[
  {name:'DEV2_CONFIG_JSON',type:'plain_text'},{name:'DEV2_DEVICE_SECRET',type:'secret_text'},
  {name:'DEV2_ROUTER',type:'durable_object_namespace',class_name:'Dev2RendezvousDO'},{name:'DEV2_VERSION',type:'version_metadata'}
 ]}};
 assert.equal(validateLegacyTargetVersion(version).id,HARD_CUTOVER.targetVersion);
 const changed=structuredClone(version);changed.resources.bindings.find(v=>v.name==='DEV2_ROUTER').class_name='TdevRendezvousDO';
 assert.throws(()=>validateLegacyTargetVersion(changed));
});

test('recovery plan digest is stable over exact immutable fence and backups',()=>{
 const input={installationId:'installation',repositoryId:'repository',bindingEpoch:'1',workerName:'tdev',backups:{'work.sqlite':'sha256:'+'a'.repeat(64),'activation.sqlite':'sha256:'+'b'.repeat(64)}};
 const first=hardCutoverPlanDigest(input),second=hardCutoverPlanDigest(structuredClone(input));
 assert.equal(first,second);
 assert.notEqual(first,recordDigest('tdev.c2-2-hard-cutover-recovery-plan.v1',{other:true}));
});
