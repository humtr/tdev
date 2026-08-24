import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  INSTALLABLE_AGENT_CONNECT_POSSESSION_PROFILE,
  canonicalJson,
  digest,
  encodeBase64Url,
  installableAgentCredentialKeyId,
  signedRecordBytes,
} from '../src/index.mjs';
import { runInstallableAgentWorkersCryptoProbe } from '../qualification/cloudflare-agent-delivery-runtime.mjs';
import {
  INSTALLABLE_AGENT_QUALIFICATION_GATES,
  INSTALLABLE_AGENT_QUALIFICATION_OBSERVATION_PROFILE,
  runInstallableAgentQualificationGate,
  validateInstallableAgentQualificationObservation,
} from '../qualification/installable-agent-deployment-realization.mjs';
import {
  QUALIFICATION_DEPLOYMENT_PROFILE,
  qualificationDeploymentIdentityDigest,
  qualificationGateRequiredPrincipals,
} from '../qualification/installable-agent-qualification-r3.mjs';

function qualificationVectors() {
  const rsa = generateKeyPairSync('rsa', { modulusLength: 3072, publicExponent: 0x10001 });
  const management = generateKeyPairSync('ed25519');
  const release = generateKeyPairSync('ed25519');
  const publicJwk = rsa.publicKey.export({ format: 'jwk' });
  const context = {
    profile: INSTALLABLE_AGENT_CONNECT_POSSESSION_PROFILE,
    agentId: 'qualification-agent',
    routeGeneration: 1,
    challengeGeneration: 1,
    nonce: encodeBase64Url(Buffer.alloc(32, 1)),
    credentialGeneration: 1,
    credentialKeyId: installableAgentCredentialKeyId(publicJwk),
    connectRequestDigest: digest({ request: 'qualification' }),
    issuedAtMs: 1,
    expiresAtMs: 120001,
  };
  const managementRecord = { operation: 'stop', route: 'qualification', sequence: 1 };
  const releaseRecord = { manifestDigest: digest({ package: 'qualification' }), signer: 'qualification' };
  return {
    rsaPossession: {
      publicJwk,
      context,
      signature: encodeBase64Url(sign('sha256', signedRecordBytes(INSTALLABLE_AGENT_CONNECT_POSSESSION_PROFILE, context), rsa.privateKey)),
    },
    management: {
      publicJwk: management.publicKey.export({ format: 'jwk' }),
      record: managementRecord,
      signature: encodeBase64Url(sign(null, signedRecordBytes('tdev.agent-management.v1', managementRecord), management.privateKey)),
    },
    release: {
      publicJwk: release.publicKey.export({ format: 'jwk' }),
      record: releaseRecord,
      signature: encodeBase64Url(sign(null, signedRecordBytes('tdev.installable-agent-release-statement.v1', releaseRecord), release.privateKey)),
    },
  };
}

test('Workers crypto probe verifies RSA-3072 and Ed25519 positive, mutation, and domain-confusion vectors', async () => {
  const result = await runInstallableAgentWorkersCryptoProbe(qualificationVectors());
  assert.equal(result.proofLayer, 'deployed_workers_runtime');
  assert.deepEqual(result.negativeVectors, { mutation: true, domainConfusion: true });
  assert.match(result.keyIds.credential, /^sha256:[0-9a-f]{64}$/);
  assert.match(result.keyIds.management, /^sha256:[0-9a-f]{64}$/);
  assert.match(result.keyIds.release, /^sha256:[0-9a-f]{64}$/);
});

const evidenceDigest = (character) => `sha256:${character.repeat(64)}`;

function exactTarget() {
  return {
    profile: QUALIFICATION_DEPLOYMENT_PROFILE,
    sourceSha: 'a'.repeat(40),
    artifactDigest: evidenceDigest('1'),
    artifactManifestDigest: evidenceDigest('2'),
    workerVersionId: 'worker-v1',
    accountId: 'account-one',
    serviceName: 'qualification-service',
    deployment: 'qualification',
    environment: 'nonproduction',
    deploymentEpoch: 'epoch-one',
    stateChangingTrafficPercentage: 100,
    qualificationEndpointOrigin: 'https://qualification.example',
    routeId: 'route-one',
    routePattern: 'qualification.example/*',
    workerScript: 'qualification-service',
    namespaceId: 'namespace-one',
    namespace: 'qualification_AgentDeliveryRuntimeDO',
    className: 'AgentDeliveryRuntimeDO',
    jurisdiction: 'global',
    agentId: 'qualification-agent',
    routeGeneration: 1,
    durableObjectId: 'qualification-do',
    routeCurrentTupleDigest: evidenceDigest('3'),
    routeVerifierDigest: evidenceDigest('4'),
  };
}

function completeObservation(gate) {
  const target = exactTarget();
  const targetDigest = qualificationDeploymentIdentityDigest(target);
  return {
    schemaVersion: 2,
    profile: INSTALLABLE_AGENT_QUALIFICATION_OBSERVATION_PROFILE,
    qualificationRunId: `run-${gate}`,
    runGeneration: 1,
    gate,
    target,
    targetDigest,
    deploymentIdentityDigest: targetDigest,
    principalObservations: qualificationGateRequiredPrincipals(gate).map((principal, index) => ({
      principal,
      identityDigest: evidenceDigest(String((index + 5) % 10)),
      freshnessDigest: evidenceDigest(String((index + 6) % 10)),
      evidenceDigest: evidenceDigest(String((index + 7) % 10)),
    })),
    readSet: ['deployment-identity', 'direct-principal-observations'],
    writeSet: [],
    invalidationSet: [],
    secretValues: 'excluded',
  };
}

test('Q2-Q10 driver contract requires strict evidence-v2 target identity and direct independent principals', async () => {
  const q10 = completeObservation('q10_deployed_composition');
  assert.equal(canonicalJson(await runInstallableAgentQualificationGate({ gate: q10.gate, driver: async () => q10 })), canonicalJson(q10));

  const missingPrincipal = completeObservation('q8_release_lifecycle');
  missingPrincipal.principalObservations = missingPrincipal.principalObservations.slice(1);
  assert.throws(
    () => validateInstallableAgentQualificationObservation(missingPrincipal.gate, missingPrincipal),
    (error) => error?.code === 'qualification_evidence_authenticator_missing',
  );

  const wrongTarget = completeObservation('q6_live_migration');
  wrongTarget.target = { ...wrongTarget.target, routeGeneration: 2 };
  assert.throws(
    () => validateInstallableAgentQualificationObservation(wrongTarget.gate, wrongTarget),
    (error) => error?.code === 'qualification_evidence_target_mismatch',
  );

  const legacyAllTrue = {
    schemaVersion: 1,
    profile: 'tdev.installable-agent-qualification-observation.v1',
    gate: 'q5_live_provider_iam',
    proofLayer: INSTALLABLE_AGENT_QUALIFICATION_GATES.q5_live_provider_iam.proofLayer,
    target: { sourceSha: 'a'.repeat(40) },
    checks: Object.fromEntries(INSTALLABLE_AGENT_QUALIFICATION_GATES.q5_live_provider_iam.checks.map((name) => [name, true])),
    secretValues: 'excluded',
  };
  assert.throws(
    () => validateInstallableAgentQualificationObservation(legacyAllTrue.gate, legacyAllTrue),
    (error) => error?.code === 'missing_keys' || error?.code === 'unexpected_keys' || error?.code === 'invalid_qualification_evidence',
  );
});
