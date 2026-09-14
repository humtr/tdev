import test from 'node:test';
import assert from 'node:assert/strict';
import {engineWorld} from '../fixtures/engine-world.mjs';

test('single-profile action preserves cold managed bootstrap headroom outside profile timeout',async()=>{
 const w=await engineWorld();try{
  const before=Date.now();
  const deadline=w.engine.deadline({op:'run',requestId:'deadline-run',profileId:'core',policyDigest:w.binding.policyDigest,parameters:{}});
  const budget=deadline-before;
  assert.ok(budget>=329000&&budget<=331000,String(budget));
 }finally{await w.close();}
});

test('required validation and integration preserve cold managed bootstrap headroom outside profile timeouts',async()=>{
 const w=await engineWorld();try{
  const expected=w.policy.required().reduce((sum,profile)=>sum+profile.timeoutMs,300000);
  for(const op of ['validate','integrate']){
   const before=Date.now();
   const budget=w.engine.deadline({op,requestId:'deadline-'+op})-before;
   assert.ok(budget>=expected-1000&&budget<=expected+1000,op+': '+budget);
  }
 }finally{await w.close();}
});
