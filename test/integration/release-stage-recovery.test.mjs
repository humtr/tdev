import test from 'node:test';
import assert from 'node:assert/strict';
import {engineWorld} from '../fixtures/engine-world.mjs';
import {ReleaseBackend} from '../../src/release/backend.mjs';
import {canonicalJson,recordDigest} from '../../src/contracts/canonical.mjs';
const D='sha256:'+'2'.repeat(64),C='sha1:'+'3'.repeat(40);
async function world(){
 const w=await engineWorld();let senderStopped=true,builderStopped=true,kind='ready',mismatch=false,executions=0;
 const effect={effectId:'retained-upload',releaseId:D,inputDigest:recordDigest('dev2.fixture-upload.v1',{releaseId:D}),artifactDigest:D,sourceCommitOid:C,expectedVersionId:'version-before'};
 const record={schemaVersion:1,actionId:'stage',principal:w.principal.subject,inputDigest:D,sourceCommitOid:C,policyDigest:w.binding.policyDigest,expectedActiveRelease:D,previous:{releaseId:D},state:'uploading',build:null,effect,receipt:null,target:null};
 const forbidden=async()=>{executions++;throw Error('Observation executed an effect');};
 const backend=new ReleaseBackend({ledger:w.ledger,binding:w.binding,authorize:forbidden,authority:{verify:forbidden},artifacts:{stage:forbidden},builder:{build:forbidden,verify:forbidden,stopped:async()=>builderStopped,cancel:forbidden},edge:{execute:forbidden,reconcile:async()=>({effectId:effect.effectId,inputDigest:mismatch?'sha256:'+'9'.repeat(64):effect.inputDigest,kind,senderStopped,versionId:kind==='ready'?'version-after':null,artifactDigest:kind==='ready'?D:null,observedAt:Date.now()})},helper:{activePair:forbidden,begin:forbidden,observe:forbidden}});
 // Seed this private fixture row. Production has no generic backend put API;
 // durable stage writes require saveStage and the exact live action fence.
 w.ledger.transact(tx=>tx.run('INSERT INTO meta(key,value) VALUES(?,?)','release.stage:stage',canonicalJson(record)));
 return {...w,backend,record,effect,set(options){if('kind'in options)kind=options.kind;if('senderStopped'in options)senderStopped=options.senderStopped;if('builderStopped'in options)builderStopped=options.builderStopped;if('mismatch'in options)mismatch=options.mismatch;},get executions(){return executions;}};
}
test('required integration: positive retained stage resolution permits exact-action recovery but observation never completes or executes stage',async()=>{const w=await world();try{for(const kind of ['ready','absent','failed']){w.set({kind});assert.equal(canonicalJson(await w.backend.recovery('stage')),canonicalJson({stopped:true,effectResolved:true,output:null}));assert.equal(canonicalJson(w.backend.record('release.stage:stage')),canonicalJson(w.record));assert.equal(w.executions,0);}}finally{await w.close();}});
test('required integration: uncertain upload or live builder remains fenced even when the other component stopped',async()=>{const w=await world();try{w.set({kind:'pending',senderStopped:false});assert.equal(canonicalJson(await w.backend.recovery('stage')),canonicalJson({stopped:false,effectResolved:false,output:null}));w.set({kind:'ready',senderStopped:true,builderStopped:false});assert.equal(canonicalJson(await w.backend.recovery('stage')),canonicalJson({stopped:false,effectResolved:false,output:null}));assert.equal(w.executions,0);}finally{await w.close();}});
test('required integration: a receipt for different upload bytes cannot release the retained special action',async()=>{const w=await world();try{w.set({mismatch:true});await assert.rejects(()=>w.backend.recovery('stage'),{code:'INTEGRITY_FAILURE'});assert.equal(canonicalJson(w.backend.record('release.stage:stage')),canonicalJson(w.record));assert.equal(w.executions,0);}finally{await w.close();}});
