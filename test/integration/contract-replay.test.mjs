import test from 'node:test';
import assert from 'node:assert/strict';
import {engineWorld} from '../fixtures/engine-world.mjs';
import {DevelopmentEngine} from '../../src/runtime/engine.mjs';
import {canonicalJson} from '../../src/contracts/canonical.mjs';
test('pre-selector durable request replays across runtime replacement without digest rewriting',async()=>{
 const w=await engineWorld({repositoryId:'primary'});try{
  const intent={op:'create',requestId:'before-c2',snapshotId:'expired-old-token',expectedHead:w.baseHead,objective:'old accepted request'};
  const old=await w.engine.coordinator.admit({principal:w.principal.subject,requestId:intent.requestId,operation:'create',intent,authorize:async()=>{},deadline:Date.now()+60000,inline:true,mutate:()=>null});
  const engine=new DevelopmentEngine(w.engineOptions);
  for(const input of [intent,{...intent,repository:'self'},{...intent,repository:'primary'}])assert.equal((await engine.admit(w.principal,input)).actionId,old.action.actionId);
  assert.equal(w.ledger.transact(tx=>tx.getAction(old.action.actionId)).intentDigest,old.action.intentDigest);
  assert.equal(canonicalJson(w.ledger.transact(tx=>tx.intent(old.action.actionId))),canonicalJson(intent));
  await assert.rejects(engine.admit(w.principal,{...intent,objective:'changed'}),{code:'IDEMPOTENCY_MISMATCH'});
  await assert.rejects(engine.admit(w.principal,{...intent,repository:'foreign'}),{code:'FORBIDDEN'});
  w.access.allowed=false;await assert.rejects(engine.admit(w.principal,intent),{code:'FORBIDDEN'});
 }finally{await w.close();}
});
