import test from 'node:test';
import assert from 'node:assert/strict';
import {recordDigest} from '../../src/contracts/canonical.mjs';
import {HARD_CUTOVER,HARD_CUTOVER_RESIDUE,classifyHardCutoverActivation,validateHardCutoverDeployments,validateLegacyTargetVersion,validateHardCutoverHistoricalActivation,validateHardCutoverProviderEffects,hardCutoverPlanDigest,validateHardCutoverStaleSession,validateHardCutoverResidueDispatchState,validateHardCutoverHeldPreparedResult,hardCutoverPendingResidueIds,validateHardCutoverPredecessorVersion,classifyHardCutoverVersionList,validateHardCutoverExportsReconciliation,validateHardCutoverSentinelVersion,hardCutoverSentinelMetadata} from '../../src/release/hard-cutover-recovery.mjs';

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


test('historical hard-cutover activations are immutable terminal residue',()=>{
 const expected=HARD_CUTOVER_RESIDUE.historicalBlockedActions[0],value={intent:{activationId:expected.activationId},intentDigest:expected.intentDigest,phase:'active',direction:'forward',pending:null,reason:null,receipts:Array.from({length:6},()=>({kind:'applied'}))};
 assert.equal(validateHardCutoverHistoricalActivation(value,0,expected).intentDigest,expected.intentDigest);
 assert.throws(()=>validateHardCutoverHistoricalActivation({...value,pending:{}},0,expected));
});

test('provider effect residue permits only the exact sent hard-cutover target',()=>{
 const confirmed={effectId:'a'.repeat(64),inputDigest:'sha256:'+'b'.repeat(64),operation:'version.upload',state:'confirmed',response:{versionId:'x'}};
 const target={effectId:HARD_CUTOVER.effectId,inputDigest:HARD_CUTOVER.inputDigest,operation:'deployment.activate',state:'sent',response:null};
 assert.equal(validateHardCutoverProviderEffects([confirmed,target]),2);
 assert.throws(()=>validateHardCutoverProviderEffects([{...confirmed,state:'sent'},target]));
 assert.throws(()=>validateHardCutoverProviderEffects([confirmed]));
});

test('stale-session recovery projection accepts only exact retained dev2-exec identity',()=>{
 const binding={installationId:'installation',repositoryId:'repository',bindingEpoch:'1',providerRepositoryId:'1322208918'};
 const sessionId='a'.repeat(32),ref='refs/heads/dev2-exec/'+sessionId,launchCommit='b'.repeat(40);
 const intent={sessionId,installationId:binding.installationId,repositoryId:binding.repositoryId,bindingEpoch:'1',providerRepositoryId:binding.providerRepositoryId,repositoryOwnerId:'272709831',repositoryFullName:'humtr/tdev',ref,workflowRef:'humtr/tdev/.github/workflows/dev2-executor.yml@'+ref,launchCommit,trustedRunnerDigest:'sha256:'+'c'.repeat(64),createdAt:1,deadline:2};
 const run={repositoryId:binding.providerRepositoryId,repositoryOwnerId:intent.repositoryOwnerId,runId:'35417842867',runAttempt:'1',headSha:launchCommit,headBranch:'dev2-exec/'+sessionId,event:'push',workflowPath:'.github/workflows/dev2-executor.yml',status:'in_progress',observedAt:1};
 const session={intent,intentDigest:'sha256:'+'d'.repeat(64),revision:'1',observerEpoch:'1',launch:'sent',state:'active',run,cancelRequested:false,stoppedAt:null};
 assert.equal(validateHardCutoverStaleSession(session,binding).intent.ref,ref);
 const current=structuredClone(session);current.intent.ref='refs/heads/tdev-exec/'+sessionId;current.intent.workflowRef='humtr/tdev/.github/workflows/tdev-executor.yml@'+current.intent.ref;
 assert.throws(()=>validateHardCutoverStaleSession(current,binding));
});

test('hard-cutover named residue accepts only pending or ordinary done dispatch projection',()=>{
 assert.equal(validateHardCutoverResidueDispatchState('pending'),'pending');
 assert.equal(validateHardCutoverResidueDispatchState('done'),'done');
 assert.throws(()=>validateHardCutoverResidueDispatchState('cancelled'));
 assert.throws(()=>validateHardCutoverResidueDispatchState('running'));
});

test('held Design prepared residue requires the exact retained no-evidence shape',()=>{
 const expected=HARD_CUTOVER_RESIDUE.heldDesign;
 const prepared={resultId:expected.resultId,workId:expected.workId,expectedHead:expected.baseCommitOid,generation:'0',candidateTreeOid:expected.candidateTreeOid,resultTreeOid:expected.candidateTreeOid,resultTreeSha256:expected.candidateDigest,commitOid:expected.commitOid};
 assert.equal(validateHardCutoverHeldPreparedResult(prepared).resultId,expected.resultId);
 assert.throws(()=>validateHardCutoverHeldPreparedResult({...prepared,validation:null}));
 assert.throws(()=>validateHardCutoverHeldPreparedResult({...prepared,integration:null}));
});

test('pending residue projection follows exact named dispatch state after ordinary reconciliation',()=>{
 const historical={assignmentId:HARD_CUTOVER_RESIDUE.historicalDispatch.assignmentId,state:'done'};
 const held={assignmentId:HARD_CUTOVER_RESIDUE.heldDesign.dispatchId,state:'done'};
 assert.deepEqual(hardCutoverPendingResidueIds([historical,held]),[]);
 assert.deepEqual(hardCutoverPendingResidueIds([{...historical,state:'pending'},held]),[historical.assignmentId]);
 assert.throws(()=>hardCutoverPendingResidueIds([historical,{...held,state:'running'}]));
});

function predecessor(){
 return {id:HARD_CUTOVER.previousVersion,resources:{bindings:[
  {name:'DEV2_CONFIG_JSON',type:'plain_text'},{name:'DEV2_DEVICE_SECRET',type:'secret_text'},
  {name:'DEV2_ROUTER',type:'durable_object_namespace',class_name:'Dev2RendezvousDO'},{name:'DEV2_VERSION',type:'version_metadata'}
 ],script_runtime:{compatibility_date:'2026-08-15',compatibility_flags:['nodejs_compat'],exports:{Dev2RendezvousDO:{type:'durable-object',storage:'sqlite'}}},script:{etag:'a'.repeat(64)}}};
}

test('hard-cutover predecessor sentinel metadata is exact and inheritance-bound',()=>{
 const previous=predecessor();assert.equal(validateHardCutoverPredecessorVersion(previous).id,HARD_CUTOVER.previousVersion);
 const metadata=hardCutoverSentinelMetadata(previous);
 assert.deepEqual(metadata.bindings.map(x=>[x.name,x.type,x.version_id]),[
  ['DEV2_CONFIG_JSON','inherit',HARD_CUTOVER.previousVersion],['DEV2_DEVICE_SECRET','inherit',HARD_CUTOVER.previousVersion],
  ['DEV2_ROUTER','inherit',HARD_CUTOVER.previousVersion],['DEV2_VERSION','inherit',HARD_CUTOVER.previousVersion]
 ]);
 assert.deepEqual(metadata.exports,{Dev2RendezvousDO:{type:'durable-object',storage:'sqlite'}});
 assert.equal(metadata.annotations['workers/message'],HARD_CUTOVER.sentinelMessage);
});

test('hard-cutover version list permits only target-latest or one exact sentinel-latest',()=>{
 const target={id:HARD_CUTOVER.targetVersion,annotations:{}},previous={id:HARD_CUTOVER.previousVersion,annotations:{}};
 assert.equal(classifyHardCutoverVersionList([target,previous],true).state,'target-latest');
 const sentinel={id:'11111111-2222-4333-8444-555555555555',annotations:{'workers/message':HARD_CUTOVER.sentinelMessage}};
 const classified=classifyHardCutoverVersionList([sentinel,target,previous],true);
 assert.equal(classified.state,'sentinel-latest');assert.equal(classified.sentinelId,sentinel.id);
 assert.throws(()=>classifyHardCutoverVersionList([{id:'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',annotations:{}},target,previous],true));
 assert.throws(()=>classifyHardCutoverVersionList([sentinel,{...sentinel,id:'22222222-3333-4444-8555-666666666666'},previous],true));
});

test('sentinel must preserve predecessor legacy resources and perform no export reconciliation',()=>{
 const previous=predecessor(),sentinel=structuredClone(previous);sentinel.id='11111111-2222-4333-8444-555555555555';
 assert.equal(validateHardCutoverSentinelVersion(sentinel,previous).id,sentinel.id);
 const noop={created:[],deleted:[],updated:[],renamed:[],transferred:[],transfer_pending:[],warnings:[],info:[]};
 assert.equal(validateHardCutoverExportsReconciliation(noop),noop);
 assert.throws(()=>validateHardCutoverExportsReconciliation({...noop,deleted:['Dev2RendezvousDO']}));
 const changed=structuredClone(sentinel);changed.resources.script.etag='b'.repeat(64);assert.throws(()=>validateHardCutoverSentinelVersion(changed,previous));
});
