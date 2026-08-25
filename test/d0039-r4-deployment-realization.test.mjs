import test from 'node:test';
import assert from 'node:assert/strict';
import { INSTALLABLE_AGENT_QUALIFICATION_GATES } from '../qualification/installable-agent-deployment-realization.mjs';

test('D0039 R4 Q5 requires exact workers.dev ingress and no Zone route object proof', () => {
  const checks = INSTALLABLE_AGENT_QUALIFICATION_GATES.q5_live_provider_iam.checks;
  assert.equal(checks.includes('workersDevAccountSubdomainBound'), true);
  assert.equal(checks.includes('workersDevIngressBound'), true);
  assert.equal(checks.includes('previewIngressDisabled'), true);
  assert.equal(checks.includes('routeObjectBound'), false);
});
