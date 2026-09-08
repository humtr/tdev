import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertCapacityPreflight,
  measureFreshCaseAuthoritativeBytes,
} from '../qualification/d0046-m1-capacity-preflight.mjs';

test('D0046 M1 capacity preflight mirrors semantic Case admission and reports headroom', () => {
  const measurement = measureFreshCaseAuthoritativeBytes({
    caseId: 'tdev-trial-small',
    revisionId: 'tdev-context-small',
    baseTree: { 'src/file.txt': 'small\n' },
    repositoryCommitOid: '42b0912e279908f2fdd72040020408f163a2cd2e',
    instruction: 'small objective',
  });
  assert.equal(measurement.baseDigest.startsWith('sha256:'), true);
  assert.equal(measurement.semanticObjectCount > 0, true);
  assert.equal(measurement.requiredAuthoritativeBytes > measurement.semanticObjectBytesIncludingRowOverhead, true);
  assert.equal(assertCapacityPreflight({ requiredAuthoritativeBytes: 11_419_628, configuredBytes: 16_777_216 }).headroomBytes, 5_357_588);
});

test('D0046 M1 capacity preflight fails closed for undersized or ambiguous values', () => {
  assert.throws(() => assertCapacityPreflight({ requiredAuthoritativeBytes: 11_419_628, configuredBytes: 8 * 1024 * 1024 }), { code: 'd0046_preflight_capacity_insufficient' });
  assert.throws(() => assertCapacityPreflight({ requiredAuthoritativeBytes: 11_419_627, configuredBytes: 16 * 1024 * 1024 }), { code: 'd0046_preflight_requirement_invalid' });
  assert.throws(() => assertCapacityPreflight({ requiredAuthoritativeBytes: 11_419_628, configuredBytes: null }), { code: 'd0046_preflight_capacity_insufficient' });
});
