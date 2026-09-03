import test from 'node:test';
import assert from 'node:assert/strict';

import { runD0039R12Q7Q9SourceComposition } from '../qualification/d0039-r12-q7-q9-source-composition.mjs';

test('D0039 Q7/Q8/Q9 source composition requires independent higher-route recovery and fresh successor state', async () => {
  const evidence = await runD0039R12Q7Q9SourceComposition();
  assert.equal(evidence.classification, 'd0039_r12_q7_q9_source_composition');
  assert.equal(evidence.proofLayer, 'source_and_local_model_only');
  assert.equal(evidence.q7.managementCompromiseDenied, true);
  assert.equal(evidence.q7.higherRouteReason, 'management_key_compromise');
  assert.equal(evidence.q7.predecessorRetired, true);
  assert.equal(evidence.q7.successorActivated, true);
  assert.equal(evidence.q7.freshD0027Current, true);
  assert.notEqual(evidence.q7.predecessorManagementKeyId, evidence.q7.successorManagementKeyId);
  assert.equal(evidence.q8.higherRouteReason, 'release_root_compromise');
  assert.equal(evidence.q8.rootReplacementDenied, true);
  assert.equal(evidence.q8.freshSuccessorReleaseRoot, true);
  assert.equal(evidence.q9.staleGenerationDenied, true);
  assert.equal(evidence.q9.staleLookupNotCalled, true);
  assert.equal(evidence.q9.currentHostSelectedOnlyAfterElection, true);
  assert.equal(evidence.q9.durableSnapshotRetained, true);
  assert.equal(evidence.invariants.strictNextGeneration, true);
  assert.equal(evidence.invariants.noDualCurrentRoutes, true);
  assert.equal(evidence.invariants.freshSuccessorD0027State, true);
  assert.deepEqual(evidence.unqualifiedProofLayers, ['provider_runtime', 'security_client', 'physical_android', 'deployed_product']);
});
