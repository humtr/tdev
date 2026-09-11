import test from 'node:test';
import assert from 'node:assert/strict';
import {engineWorld} from '../fixtures/engine-world.mjs';
import {Dev2Error} from '../../src/contracts/errors.mjs';
const request=(w,work,id='integrate')=>({op:'integrate',requestId:id,workId:work.workId,expectedRevision:work.revision,generation:work.generation,expectedHead:w.baseHead,policyDigest:w.binding.policyDigest});
test('retained candidate loses integration authority when its path grant is revoked',async()=>{
 const w=await engineWorld();try{
  const a=await w.create('create','ordinary.mjs','export const value=1;\n');const work=await w.engine.work(w.principal,a.workId);
  const original=w.authorization.authorize;w.authorization.authorize=async(p,b,c,paths=[])=>{await original(p,b,c,paths);if(c==='integration.write'&&paths.includes('ordinary.mjs'))throw new Dev2Error('FORBIDDEN');};
  await assert.rejects(()=>w.engine.admit(w.principal,request(w,work)),{code:'FORBIDDEN'});
  assert.equal(w.sends.length,0);assert.equal(w.ledger.transact(tx=>tx.lookupRequest(w.principal.subject,w.binding.bindingEpoch,'integrate')),null);
 }finally{await w.close();}
});
test('cancellation during commit construction cannot publish or retain a successful prepared result',async()=>{
 const w=await engineWorld();try{
  const a=await w.create('create','ordinary.mjs','export const value=1;\n');const work=await w.engine.work(w.principal,a.workId);
  const freeze=w.repository.freezeCommit.bind(w.repository);
  w.repository.freezeCommit=async(...args)=>{const c=await freeze(...args);const current=await w.engine.work(w.principal,work.workId);w.engine.store('cancel:'+current.currentActionId,true);return c;};
  const admission=await w.engine.admit(w.principal,request(w,work));const [action]=await w.finish([admission.actionId]);
  assert.notEqual(action.status,'succeeded');assert.equal(w.sends.length,0);assert.equal(w.validationRuns.length,0);
  assert.equal(w.ledger.transact(tx=>tx.all('SELECT * FROM prepared').length),0);
 }finally{await w.close();}
});
test('path grant is checked again after validation before the provider effect',async()=>{
 const w=await engineWorld();try{
  const a=await w.create('create','ordinary.mjs','export const value=1;\n');const work=await w.engine.work(w.principal,a.workId);
  const original=w.authorization.authorize,validate=w.validation.validate;
  let revoked=false;w.authorization.authorize=async(p,b,c,paths=[])=>{await original(p,b,c,paths);if(revoked&&c==='integration.write'&&paths.includes('ordinary.mjs'))throw new Dev2Error('FORBIDDEN');};
  w.validation.validate=async(...args)=>{const receipt=await validate(...args);revoked=true;return receipt;};
  const admission=await w.engine.admit(w.principal,request(w,work));const [action]=await w.finish([admission.actionId]);
  assert.equal(action.status,'failed');assert.equal(action.errorCode,'FORBIDDEN');assert.equal(w.sends.length,0);
 }finally{await w.close();}
});
