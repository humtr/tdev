import test from 'node:test';
import assert from 'node:assert/strict';
import { typedDigest } from '../src/canonical.mjs';
import { qualificationDeploymentIdentityDigest } from '../qualification/installable-agent-qualification-r3.mjs';
import { createD0039CloudflareQ5TerminalEvidence } from '../qualification/installable-agent-cloudflare-q5-live.mjs';

const ACCOUNT_ID = '0123456789abcdef0123456789abcdef';
const ZONE_ID = 'fedcba9876543210fedcba9876543210';
const PROVIDER_TOKEN_ID = '11111111111111111111111111111111';
const IAM_TOKEN_ID = '22222222222222222222222222222222';
const sha = (c) => `sha256:${c.repeat(64)}`;

function target() {
  return {
    profile: 'tdev.installable-agent-qualification-deployment.v1',
    sourceSha: '1234567890abcdef1234567890abcdef12345678',
    artifactDigest: sha('1'),
    artifactManifestDigest: sha('2'),
    workerVersionId: 'worker-v1',
    accountId: ACCOUNT_ID,
    serviceName: 'tdev-d0020-qualification',
    deployment: 'qualification',
    environment: 'nonproduction',
    deploymentEpoch: 'epoch-one',
    stateChangingTrafficPercentage: 100,
    qualificationEndpointOrigin: 'https://qualification.example',
    routeId: 'route-one',
    routePattern: 'qualification.example/*',
    workerScript: 'tdev-d0020-qualification',
    namespaceId: 'namespace-one',
    namespace: 'tdev-d0020-qualification_AgentDeliveryRuntimeDO',
    className: 'AgentDeliveryRuntimeDO',
    jurisdiction: 'global',
    agentId: 'agent-one',
    routeGeneration: 7,
    durableObjectId: 'do-agent-one',
    routeCurrentTupleDigest: sha('3'),
    routeVerifierDigest: sha('4'),
  };
}

function providerReadback() {
  const deploymentIdentity = target();
  return {
    classification: 'observed',
    gate: 'q5_live_provider_iam',
    proofLayer: 'live_provider_control_plane_partial',
    accountId: ACCOUNT_ID,
    zoneId: ZONE_ID,
    providerPrincipal: { tokenKind: 'user', tokenId: PROVIDER_TOKEN_ID, tokenStatus: 'active' },
    workerScript: deploymentIdentity.serviceName,
    deploymentId: 'deployment-one',
    activeVersionId: deploymentIdentity.workerVersionId,
    activeTrafficPercentage: 100,
    activeSourceSha: deploymentIdentity.sourceSha,
    deploymentIdentity,
    deploymentIdentityDigest: qualificationDeploymentIdentityDigest(deploymentIdentity),
    durableObjectBinding: { name: 'TDEV_AGENT_DELIVERY', type: 'durable_object_namespace' },
    namespace: { id: deploymentIdentity.namespaceId, name: deploymentIdentity.namespace, class: deploymentIdentity.className, script: deploymentIdentity.workerScript },
    jurisdiction: deploymentIdentity.jurisdiction,
    route: { id: deploymentIdentity.routeId, pattern: deploymentIdentity.routePattern, script: deploymentIdentity.workerScript },
    routeBinding: { agentId: deploymentIdentity.agentId, routeGeneration: deploymentIdentity.routeGeneration, durableObjectId: deploymentIdentity.durableObjectId },
    ingress: deploymentIdentity.qualificationEndpointOrigin,
    publicVerifierFingerprints: { managementKeyId: sha('5'), releaseRootKeyId: sha('6'), currentCredentialKeyId: sha('7') },
    legacyHmac: { runtimePresent: true, bindingNamePresent: true },
    secretBindingNames: ['TDEV_AGENT_DELIVERY_AUTH_KEY', 'TDEV_D0020_QUALIFICATION_TOKEN'],
    iamSeparation: 'requires_cross_principal_token_policy_readback',
    secretValues: 'excluded',
  };
}

function iamReadback() {
  const providerPrincipal = {
    tokenKind: 'user',
    tokenId: PROVIDER_TOKEN_ID,
    tokenStatus: 'active',
    policyDigest: typedDigest('policy', { id: PROVIDER_TOKEN_ID }),
    modifiedOn: '2026-08-25T00:00:00Z',
    policies: [],
  };
  const iamPrincipal = { tokenKind: 'user', tokenId: IAM_TOKEN_ID, tokenStatus: 'active', observedReadPermission: 'API Tokens Read' };
  return {
    classification: 'observed',
    gate: 'q5_live_provider_iam',
    proofLayer: 'live_iam_control_plane',
    separation: 'distinct_api_token_principals',
    accountId: ACCOUNT_ID,
    zoneId: ZONE_ID,
    providerPrincipal,
    iamPrincipal,
    iamPrincipalDigest: typedDigest('iam-principal', iamPrincipal),
    observationDigest: typedDigest('iam-observation', { providerPrincipal, iamPrincipal }),
    secretValues: 'excluded',
  };
}

test('Q5 live join produces terminal evidence with all required direct principals', () => {
  const evidence = createD0039CloudflareQ5TerminalEvidence({
    qualificationRunId: 'q5-run-one',
    runGeneration: 1,
    providerReadback: providerReadback(),
    iamReadback: iamReadback(),
  });
  assert.equal(evidence.gate, 'q5_live_provider_iam');
  assert.equal(evidence.secretValues, 'excluded');
  assert.deepEqual(evidence.principalObservations.map((entry) => entry.principal), ['iam_control_plane', 'provider_control_plane', 'route_owner_runtime']);
  assert.equal(evidence.writeSet.length, 0);
  assert.ok(evidence.readSet.some((entry) => entry.includes(`token:user:${PROVIDER_TOKEN_ID}:policy`)));
});

test('Q5 live join rejects IAM policy evidence for a different provider token', () => {
  const iam = iamReadback();
  iam.providerPrincipal = { ...iam.providerPrincipal, tokenId: '33333333333333333333333333333333' };
  assert.throws(
    () => createD0039CloudflareQ5TerminalEvidence({ qualificationRunId: 'q5-run-two', runGeneration: 1, providerReadback: providerReadback(), iamReadback: iam }),
    (error) => error?.code === 'cloudflare_q5_principal_mismatch',
  );
});

test('Q5 live join rejects observations from different account or zone authorities', () => {
  const iam = iamReadback();
  iam.zoneId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  assert.throws(
    () => createD0039CloudflareQ5TerminalEvidence({ qualificationRunId: 'q5-run-three', runGeneration: 1, providerReadback: providerReadback(), iamReadback: iam }),
    (error) => error?.code === 'cloudflare_q5_target_mismatch',
  );
});

test('Q5 live join rejects mixed/canary writer state', () => {
  const provider = providerReadback();
  provider.activeTrafficPercentage = 50;
  assert.throws(
    () => createD0039CloudflareQ5TerminalEvidence({ qualificationRunId: 'q5-run-four', runGeneration: 1, providerReadback: provider, iamReadback: iamReadback() }),
    (error) => error?.code === 'cloudflare_q5_target_mismatch',
  );
});

test('Q5 live join rejects deployment identity substitution', () => {
  const provider = providerReadback();
  provider.deploymentIdentity = { ...provider.deploymentIdentity, workerVersionId: 'worker-v2' };
  assert.throws(
    () => createD0039CloudflareQ5TerminalEvidence({ qualificationRunId: 'q5-run-five', runGeneration: 1, providerReadback: provider, iamReadback: iamReadback() }),
    (error) => error?.code === 'cloudflare_q5_target_mismatch',
  );
});

test('Q5 live join rejects incomplete IAM authenticator digests', () => {
  const iam = iamReadback();
  delete iam.iamPrincipalDigest;
  assert.throws(
    () => createD0039CloudflareQ5TerminalEvidence({ qualificationRunId: 'q5-run-six', runGeneration: 1, providerReadback: providerReadback(), iamReadback: iam }),
    (error) => error?.code === 'cloudflare_q5_iam_invalid',
  );
});
