import test from 'node:test';
import assert from 'node:assert/strict';
import {engineWorld} from '../fixtures/engine-world.mjs';

// Trusted disposable Git/SQLite fixtures only. This is not a hosted execution seal
// or a pre-Refresh human OAuth invocation. Match the native unavailable gate.
for (const op of ['validate', 'integrate']) {
 test(`Phase A public ${op} retains exact preparation without invoking unsealed execution or publication`, async () => {
  const w = await engineWorld();
  w.engine.o.executionAvailable = () => false;
  try {
   const context = await w.app.invoke(w.principal, 'dev_context', {apiVersion: 1});
   assert.equal(context.ok, true);
   assert.equal(context.data.operations.find(item => item.op === op).state, 'partial');
   const read = await w.app.invoke(w.principal, 'dev_read', {apiVersion: 1,
    target: {snapshotId: context.data.snapshot.snapshotId, freshness: 'current'},
    queries: [{kind: 'file', path: 'a.txt'}]});
   assert.equal(read.ok, true); assert.equal(read.data.results[0].content, 'alpha\n');
   const create = {apiVersion: 1, items: [{op: 'create', requestId: 'create-' + op,
    snapshotId: context.data.snapshot.snapshotId, expectedHead: w.baseHead,
    objective: 'Prepare an exact candidate while hosted execution is unavailable',
    initialEdits: [{kind: 'put', path: 'phase-a.txt', mode: '100644', expectedEntry: 'absent', content: 'source\n', encoding: 'utf8'}]}]};
   const admitted = await w.app.invoke(w.principal, 'dev_work', create);
   assert.equal(admitted.ok, true);
   const created = w.ledger.transact(tx => tx.lookupRequest(w.principal.subject, w.binding.bindingEpoch, 'create-' + op));
   assert.ok(created?.workId);
   const work = await w.engine.work(w.principal, created.workId);
   const request = {apiVersion: 1, items: [{op, requestId: 'prepare-' + op,
    workId: work.workId, expectedRevision: work.revision, generation: work.generation,
    expectedHead: w.baseHead, policyDigest: w.binding.policyDigest}]};
   assert.equal((await w.app.invoke(w.principal, 'dev_work', request)).ok, true);
   const action = w.ledger.transact(tx => tx.lookupRequest(w.principal.subject, w.binding.bindingEpoch, 'prepare-' + op));
   assert.ok(action);
   const [finished] = await w.finish([action.actionId]);
   assert.equal(finished.status, 'failed');
   assert.equal(finished.errorCode, 'EXECUTION_UNAVAILABLE');
   assert.ok(finished.resultId);
   const prepared = w.ledger.transact(tx => tx.getPrepared(finished.resultId));
   assert.ok(prepared);
   const commit = await w.repository.readCommit(w.binding, prepared.commitOid);
   assert.deepEqual(commit.parents, [w.baseHead]);
   assert.equal(commit.source.manifestDigest, prepared.resultTreeSha256);
   assert.equal(w.profileRuns.length, 0); assert.equal(w.validationRuns.length, 0);
   assert.equal(w.sends.length, 0); assert.equal((await w.remote.resolve()).head, w.baseHead);
   const observed = await w.app.invoke(w.principal, 'dev_observe', {apiVersion: 1, selector: {requestIds: ['prepare-' + op]}});
   assert.equal(observed.ok, true);
   assert.ok(observed.data.results.some(result => result.commitOid === prepared.commitOid));
   assert.ok(observed.data.actions.some(result => result.errorCode === 'EXECUTION_UNAVAILABLE'));
   const retained = await w.engine.work(w.principal, work.workId);
   assert.equal(retained.currentActionId, null); assert.equal(retained.disposition, 'open');
   assert.equal((await w.app.invoke(w.principal, 'dev_work', request)).ok, true);
   const retry = w.ledger.transact(tx => tx.lookupRequest(w.principal.subject, w.binding.bindingEpoch, 'prepare-' + op));
   assert.equal(retry.actionId, action.actionId); assert.equal(retry.resultId, prepared.resultId);
   assert.equal(w.ledger.transact(tx => tx.all('SELECT * FROM action').length), 2);
  } finally { await w.close(); }
 });
}

test('Phase A public create/edit/cancel and request recovery remain usable with unsealed execution', async () => {
 const w = await engineWorld(); w.engine.o.executionAvailable = () => false;
 try {
  const context = await w.app.invoke(w.principal, 'dev_context', {apiVersion: 1});
  const create = {apiVersion: 1, items: [{op: 'create', requestId: 'create', snapshotId: context.data.snapshot.snapshotId, expectedHead: w.baseHead, objective: 'Editable Phase B candidate'}]};
  assert.equal((await w.app.invoke(w.principal, 'dev_work', create)).ok, true);
  const action = w.ledger.transact(tx => tx.lookupRequest(w.principal.subject, w.binding.bindingEpoch, 'create'));
  let work = await w.engine.work(w.principal, action.workId);
  const edit = {apiVersion: 1, items: [{op: 'edit', requestId: 'edit', workId: work.workId, expectedRevision: work.revision, expectedGeneration: work.generation,
   edits: [{kind: 'put', path: 'new.txt', mode: '100644', expectedEntry: 'absent', content: 'prepared\n', encoding: 'utf8'}]}]};
  assert.equal((await w.app.invoke(w.principal, 'dev_work', edit)).ok, true);
  work = await w.engine.work(w.principal, work.workId); assert.equal(work.generation, '1');
  const read = await w.app.invoke(w.principal, 'dev_read', {apiVersion: 1, target: {workId: work.workId, generation: work.generation}, queries: [{kind: 'file', path: 'new.txt'}]});
  assert.equal(read.ok, true); assert.equal(read.data.results[0].content, 'prepared\n');
  assert.equal((await w.app.invoke(w.principal, 'dev_work', edit)).ok, true);
  assert.equal((await w.engine.work(w.principal, work.workId)).generation, '1');
  const cancel = {apiVersion: 1, items: [{op: 'cancel', requestId: 'cancel', workId: work.workId, expectedRevision: work.revision, reason: 'Fixture complete'}]};
  assert.equal((await w.app.invoke(w.principal, 'dev_work', cancel)).ok, true);
  assert.equal((await w.engine.work(w.principal, work.workId)).disposition, 'cancelled');
  assert.equal(w.sends.length, 0); assert.equal(w.validationRuns.length, 0);
  assert.equal((await w.remote.resolve()).head, w.baseHead);
 } finally { await w.close(); }
});
