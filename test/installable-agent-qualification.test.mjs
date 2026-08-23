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

function completeObservation(gate) {
  const specification = INSTALLABLE_AGENT_QUALIFICATION_GATES[gate];
  return {
    schemaVersion: 1,
    profile: INSTALLABLE_AGENT_QUALIFICATION_OBSERVATION_PROFILE,
    gate,
    proofLayer: specification.proofLayer,
    target: { sourceSha: 'a'.repeat(40), routeObjectId: 'qualification-route-object' },
    checks: Object.fromEntries(specification.checks.map((name) => [name, true])),
    ...(specification.events === undefined ? {} : { events: specification.events }),
    secretValues: 'excluded',
  };
}

test('Q2-Q10 driver contract rejects incomplete checks, wrong lifecycle order, and secret-bearing target fields', async () => {
  const q10 = completeObservation('q10_deployed_composition');
  assert.equal(canonicalJson(await runInstallableAgentQualificationGate({ gate: q10.gate, driver: async () => q10 })), canonicalJson(q10));

  const incomplete = completeObservation('q8_release_lifecycle');
  incomplete.checks.signerRevocation = false;
  assert.throws(
    () => validateInstallableAgentQualificationObservation(incomplete.gate, incomplete),
    (error) => error?.code === 'qualification_gate_incomplete' && error.details.failed.includes('signerRevocation'),
  );

  const reordered = completeObservation('q6_live_migration');
  [reordered.events[1], reordered.events[2]] = [reordered.events[2], reordered.events[1]];
  assert.throws(
    () => validateInstallableAgentQualificationObservation(reordered.gate, reordered),
    (error) => error?.code === 'qualification_event_order_invalid',
  );

  const leaked = completeObservation('q5_live_provider_iam');
  leaked.target.apiToken = 'must-never-appear';
  assert.throws(
    () => validateInstallableAgentQualificationObservation(leaked.gate, leaked),
    (error) => error?.code === 'qualification_observation_contains_secret_field',
  );
});
