import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';

import {
  AgentDeliveryAuthority,
  INSTALLABLE_AGENT_EVIDENCE_ATTESTATION_ENVELOPE_PROFILE,
  INSTALLABLE_AGENT_EVIDENCE_ATTESTATION_SIGNATURE_DOMAIN,
  MemoryAgentDeliveryStore,
  canonicalJson,
  computeInstallableAgentManagementIntentDigest,
  createInstallableAgentEvidenceAttestationVerifier,
  digest,
  encodeBase64Url,
  evidenceProofContext,
  installableAgentEvidenceAttestorKeyId,
  signedRecordBytes,
  verifyInstallableAgentEvidenceAttestationEnvelope,
} from '../src/index.mjs';
import {
  AgentDeliveryRuntimeDOHost,
} from '../src/cloudflare-agent-delivery-runtime.mjs';

function ed25519Pair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    privateKey,
    publicJwk: publicKey.export({ format: 'jwk' }),
  };
}

function evidenceEnvelope(pair, context, { domain = INSTALLABLE_AGENT_EVIDENCE_ATTESTATION_SIGNATURE_DOMAIN, profile = INSTALLABLE_AGENT_EVIDENCE_ATTESTATION_ENVELOPE_PROFILE, keyId = installableAgentEvidenceAttestorKeyId(pair.publicJwk) } = {}) {
  return {
    profile,
    keyId,
    context: structuredClone(context),
    signature: encodeBase64Url(sign(null, signedRecordBytes(domain, context), pair.privateKey)),
  };
}

function routeBinding() {
  return {
    agentId: 'd0040-agent',
    routeGeneration: 1,
    deployment: 'qualification',
    environment: 'test',
    workerScript: 'tdev-d0040-test',
    className: 'AgentDeliveryRuntimeDO',
    namespace: 'd0040-test-namespace',
    jurisdiction: 'global',
    durableObjectId: 'd0040-test-do',
  };
}

function runtimeEnv(overrides = {}) {
  return {
    TDEV_AGENT_DELIVERY_MAX_SNAPSHOT_BYTES: String(1024 * 1024),
    TDEV_AGENT_DELIVERY_MAX_FRAME_BYTES: String(8 * 1024),
    TDEV_DEPLOYMENT: 'qualification',
    TDEV_ENVIRONMENT: 'nonproduction',
    TDEV_WORKER_SCRIPT: 'tdev-d0040-test',
    TDEV_AGENT_DELIVERY_NAMESPACE: 'd0040-test-namespace',
    TDEV_AGENT_DELIVERY_JURISDICTION: 'global',
    TDEV_AGENT_ROUTE_MODE: 'legacy_v1',
    ...overrides,
  };
}

class FakeDurableObjectContext {
  constructor() {
    this.id = {
      jurisdiction: 'global',
      toString: () => 'd0040-test-do',
    };
    this.storage = {};
    this.sockets = [];
    this.blocked = Promise.resolve();
  }

  blockConcurrencyWhile(operation) {
    this.blocked = Promise.resolve().then(operation);
    return this.blocked;
  }

  acceptWebSocket(socket) {
    this.sockets.push(socket);
  }

  getWebSockets() {
    return [...this.sockets];
  }
}

function registrationContent(tag) {
  const packageTrustSubjectDigest = digest({ releaseKey: `key-${tag}` });
  const trustSubjects = { [packageTrustSubjectDigest]: 'active' };
  return {
    credentialProvisioningId: `credential-${tag}`,
    packageManifestDigest: digest({ package: tag }),
    packageTrustSubjectDigest,
    trustStateDigest: digest({ trustSubjects }),
    trustSubjects,
  };
}

function preparePending(verifier) {
  const store = new MemoryAgentDeliveryStore();
  const binding = routeBinding();
  const authority = new AgentDeliveryAuthority({
    store,
    routeBinding: binding,
    verifyManagementProof: () => true,
    verifyInstallableAgentEvidence: verifier,
  });
  authority.initialize();
  authority.migrateInstallableAgentRoute({ migrationProfile: 'tdev.d0020-only-to-d0027-unregistered.v1' });
  const content = registrationContent('attestation');
  const expectedPredecessorDigest = authority.readInstallableAgent().predecessorDigest;
  const request = {
    managementRequestId: 'm2:1',
    intentDigest: computeInstallableAgentManagementIntentDigest('register', binding, content),
    expectedPredecessorDigest,
    managementProof: 'opaque-management-proof',
    ...content,
  };
  const pending = authority.registerInstallableAgent(request);
  return { authority, binding, pending };
}

test('D0040 v2 envelope authenticates only the exact receiver-constructed evidence context', async () => {
  const attestor = ed25519Pair();
  const context = evidenceProofContext('bootstrap_trust', routeBinding(), {
    pendingDigest: digest({ pending: 'one' }),
    genesisGeneration: 1,
    evidenceDigest: digest({ evidence: 'one' }),
  });
  const envelope = evidenceEnvelope(attestor, context);
  const verified = await verifyInstallableAgentEvidenceAttestationEnvelope({
    envelope,
    context,
    attestorPublicJwk: attestor.publicJwk,
  });
  assert.equal(verified.keyId, installableAgentEvidenceAttestorKeyId(attestor.publicJwk));
  assert.equal(canonicalJson(verified.context), canonicalJson(context));

  await assert.rejects(
    () => verifyInstallableAgentEvidenceAttestationEnvelope({
      envelope: { ...envelope, profile: 'tdev.installable-agent-evidence-envelope.v1' },
      context,
      attestorPublicJwk: attestor.publicJwk,
    }),
    (error) => error?.code === 'invalid_installable_agent_evidence_attestation',
  );

  const other = ed25519Pair();
  await assert.rejects(
    () => verifyInstallableAgentEvidenceAttestationEnvelope({ envelope, context, attestorPublicJwk: other.publicJwk }),
    (error) => error?.code === 'installable_agent_evidence_attestation_mismatch',
  );

  const wrongDomain = evidenceEnvelope(attestor, context, { domain: 'tdev.agent-management.v1' });
  await assert.rejects(
    () => verifyInstallableAgentEvidenceAttestationEnvelope({ envelope: wrongDomain, context, attestorPublicJwk: attestor.publicJwk }),
    (error) => error?.code === 'signature_verification_failed',
  );

  const substituted = { ...context, type: 'package_verified' };
  const substitutedEnvelope = evidenceEnvelope(attestor, substituted);
  await assert.rejects(
    () => verifyInstallableAgentEvidenceAttestationEnvelope({ envelope: substitutedEnvelope, context, attestorPublicJwk: attestor.publicJwk }),
    (error) => error?.code === 'installable_agent_evidence_attestation_mismatch',
  );

  await assert.rejects(
    () => verifyInstallableAgentEvidenceAttestationEnvelope({
      envelope: { ...envelope, signature: 'not_base64url?' },
      context,
      attestorPublicJwk: attestor.publicJwk,
    }),
  );
});

test('D0040 verifier denial leaves D0027 pending evidence state unchanged', async () => {
  const attestor = ed25519Pair();
  const cryptographicVerifier = createInstallableAgentEvidenceAttestationVerifier({
    publicJwk: attestor.publicJwk,
    keyId: installableAgentEvidenceAttestorKeyId(attestor.publicJwk),
  });
  let observedContext = null;
  const verifier = async (proof, context) => {
    observedContext = context;
    return cryptographicVerifier(proof, context);
  };
  const { authority, pending } = preparePending(verifier);
  const evidenceDigest = digest({ type: 'bootstrap_trust', pendingDigest: pending.pendingDigest });
  const before = authority.readInstallableAgent();
  const attempt = (evidenceProof) => authority.recordInstallableAgentGenesisEvidence({
    pendingDigest: pending.pendingDigest,
    genesisGeneration: pending.genesisGeneration,
    type: 'bootstrap_trust',
    evidenceDigest,
    evidenceProof,
  });

  await assert.rejects(
    () => attempt({}),
    (error) => error?.code === 'installable_agent_evidence_authentication_failed',
  );
  assert.deepEqual(authority.readInstallableAgent(), before);
  assert.ok(observedContext);

  const receiverContext = structuredClone(observedContext);
  const invalidProof = evidenceEnvelope(attestor, receiverContext, { domain: 'tdev.agent-management.v1' });
  await assert.rejects(
    () => attempt(invalidProof),
    (error) => error?.code === 'installable_agent_evidence_authentication_failed',
  );
  assert.deepEqual(authority.readInstallableAgent(), before);

  const accepted = await attempt(evidenceEnvelope(attestor, receiverContext));
  assert.equal(accepted.classification, 'accepted');
  assert.equal(accepted.type, 'bootstrap_trust');
  assert.equal(accepted.evidenceDigest, evidenceDigest);
});

test('D0040 runtime binds only canonical public attestor configuration and builds the verifier', async () => {
  const attestor = ed25519Pair();
  const keyId = installableAgentEvidenceAttestorKeyId(attestor.publicJwk);
  const publicJwk = canonicalJson(attestor.publicJwk);
  const ctx = new FakeDurableObjectContext();
  const host = new AgentDeliveryRuntimeDOHost(ctx, runtimeEnv({
    TDEV_D0040_EVIDENCE_ATTESTOR_PUBLIC_JWK: publicJwk,
    TDEV_D0040_EVIDENCE_ATTESTOR_KEY_ID: keyId,
  }), { store: new MemoryAgentDeliveryStore() });
  await ctx.blocked;
  assert.equal(host.evidenceAttestor.keyId, keyId);
  assert.equal(canonicalJson(host.evidenceAttestor.publicJwk), canonicalJson(attestor.publicJwk));
  assert.equal(typeof host.verifyInstallableAgentEvidence, 'function');
  assert.equal(host.verifyInstallableAgentEvidence.evidenceAttestorKeyId, keyId);

  const noConfig = new FakeDurableObjectContext();
  const noConfigHost = new AgentDeliveryRuntimeDOHost(noConfig, runtimeEnv(), { store: new MemoryAgentDeliveryStore() });
  await noConfig.blocked;
  assert.equal(noConfigHost.evidenceAttestor, null);
  assert.equal(noConfigHost.verifyInstallableAgentEvidence, null);

  assert.throws(
    () => new AgentDeliveryRuntimeDOHost(new FakeDurableObjectContext(), runtimeEnv({
      TDEV_D0040_EVIDENCE_ATTESTOR_PUBLIC_JWK: publicJwk,
    }), { store: new MemoryAgentDeliveryStore() }),
    (error) => error?.code === 'invalid_agent_delivery_deployment_config',
  );
  assert.throws(
    () => new AgentDeliveryRuntimeDOHost(new FakeDurableObjectContext(), runtimeEnv({
      TDEV_D0040_EVIDENCE_ATTESTOR_PUBLIC_JWK: publicJwk,
      TDEV_D0040_EVIDENCE_ATTESTOR_KEY_ID: digest({ wrong: 'key' }),
    }), { store: new MemoryAgentDeliveryStore() }),
    (error) => error?.code === 'invalid_agent_delivery_deployment_config',
  );
});
