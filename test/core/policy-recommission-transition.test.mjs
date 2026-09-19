import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Ledger} from '../../src/storage/ledger.mjs';
import {PolicyState} from '../../src/release/policy.mjs';
import {managedPolicy} from '../../src/validation/managed-policy.mjs';
import {canonicalJson,parseRecord} from '../../src/contracts/canonical.mjs';

const D=n=>'sha256:'+String(n).repeat(64);
function state(ledger,binding,policy,digest,allowEnrollmentTransition=false){
 return new PolicyState({ledger,binding,initial:policy,enrollment:{digest,policy},allowEnrollmentTransition,authorize:async()=>{},verifyIntegrated:async()=>{throw Error('unexpected integration');},readBlob:async()=>{throw Error('unexpected blob');},qualify:async candidate=>candidate.policy.digest===policy.policy.digest});
}
test('current-controller commissioning does not select a replacement enrollment before verified handoff startup',async()=>{
 const root=await mkdtemp(join(tmpdir(),'tdev-policy-recommission-'));
 const identities={trustedRunnerDigest:D(1),toolchainDigest:D(2),dependencyLockDigest:D(3),imageDigest:D(4)},policy=managedPolicy(identities),binding={installationId:'installation',repositoryId:'repository',provider:'github',providerRepositoryId:'123',remote:'https://github.com/owner/repo.git',ref:'refs/heads/dev-2',bindingEpoch:'1',policyDigest:policy.policy.digest},ledger=new Ledger(join(root,'work.sqlite'),binding);
 try{
  const previous=state(ledger,binding,policy,D(5));await previous.restore();
  const legacy=ledger.transact(tx=>String(tx.get("SELECT value FROM meta WHERE key='policy.enrollment'").value));
  const pending=state(ledger,binding,policy,D(6));await pending.commissioningOnly();
  assert.equal(ledger.transact(tx=>String(tx.get("SELECT value FROM meta WHERE key='policy.enrollment'").value)),legacy);
  assert.equal(ledger.transact(tx=>tx.get("SELECT value FROM meta WHERE key='policy.enrollment.active'")),undefined);
  await assert.rejects(state(ledger,binding,policy,D(6)).restore(),error=>error?.code==='INTEGRITY_FAILURE'&&error?.message==='Private enrollment changed');

  const admitted=state(ledger,binding,policy,D(6),true);await admitted.restore();
  const selected=ledger.transact(tx=>String(tx.get("SELECT value FROM meta WHERE key='policy.enrollment.active'").value)),parsed=parseRecord(selected);
  assert.equal(parsed.enrollmentDigest,D(6));
  assert.equal(ledger.transact(tx=>String(tx.get("SELECT value FROM meta WHERE key='policy.enrollment'").value)),legacy);
  const history=ledger.transact(tx=>tx.all("SELECT value FROM meta WHERE key LIKE 'policy.enrollment.history:%'"));
  assert.equal(history.length,1);assert.equal(String(history[0].value),legacy);

  const restarted=state(ledger,binding,policy,D(6));await restarted.restore();
  assert.equal(canonicalJson(restarted.current.policy),canonicalJson(policy.policy));
  assert.equal(ledger.transact(tx=>String(tx.get("SELECT value FROM meta WHERE key='policy.enrollment.active'").value)),selected);
 }finally{ledger.close();await rm(root,{recursive:true,force:true});}
});
