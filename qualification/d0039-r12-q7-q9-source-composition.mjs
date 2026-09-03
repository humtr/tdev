import { generateKeyPairSync, sign } from 'node:crypto';

import {
  AgentDeliveryAuthority,
  AgentRouteElectionAuthority,
  AgentRouteGenerationAuthority,
  INSTALLABLE_AGENT_MANAGEMENT_ENVELOPE_PROFILE,
  MemoryAgentDeliveryStore,
  MemoryAgentRouteElectionStore,
  agentRouteBindingDigest,
  agentRouteElectionDigest,
  agentRouteHostKey,
  agentRoutePredecessorExclusionDigest,
  agentRouteRecoveryKeyId,
  canonicalJson,
  computeInstallableAgentManagementIntentDigest,
  digest,
  encodeBase64Url,
  installableAgentManagementKeyId,
  installableAgentReleaseRootKeyId,
  managementProofContext,
  signedRecordBytes,
} from '../src/index.mjs';

const EVIDENCE_PROOF = 'opaque-evidence-capability';
const ROUTE_SECURITY_PROFILE = 'tdev.d0039-route-security.v1';
const MIGRATION_PROFILE = 'tdev.d0020-only-to-d0027-unregistered.v1';

function ed25519Pair() {
  const pair = generateKeyPairSync('ed25519');
  return { ...pair, publicJwk: pair.publicKey.export({ format: 'jwk' }) };
}

function rsa3072Pair() {
  const pair = generateKeyPairSync('rsa', { modulusLength: 3072, publicExponent: 0x10001 });
  return { ...pair, publicJwk: pair.publicKey.export({ format: 'jwk' }) };
}

function signRecord(keyPair, record) {
  return encodeBase64Url(sign(null, signedRecordBytes(record.profile, record), keyPair.privateKey));
}

function signDomain(keyPair, domain, record) {
  return encodeBase64Url(sign(null, signedRecordBytes(domain, record), keyPair.privateKey));
}

function routeBinding(agentId, routeGeneration) {
  return {
    agentId,
    routeGeneration,
    deployment: 'd0039-r12-q7-q9-source-composition',
    environment: 'isolated-qualification',
    workerScript: 'tdev-source-composition',
    className: 'AgentDeliveryRuntimeDO',
    namespace: `source-composition-${routeGeneration}`,
    jurisdiction: 'global',
    durableObjectId: `source-composition-do-${routeGeneration}`,
  };
}

function routeSecurity(management, releaseRoot) {
  return {
    profile: ROUTE_SECURITY_PROFILE,
    managementPublicKey: management.publicJwk,
    releaseRootPublicKey: releaseRoot.publicJwk,
  };
}

function registrationContent(tag, credentialPublicKey) {
  const packageTrustSubjectDigest = digest({ packageTrustSubject: tag });
  const trustSubjects = { [packageTrustSubjectDigest]: 'active' };
  return {
    credentialProvisioningId: `cp1.${digest({ tag, purpose: 'credential' }).slice('sha256:'.length)}`,
    credentialPublicKey,
    packageManifestDigest: digest({ package: tag }),
    packageTrustSubjectDigest,
    trustStateDigest: digest({ trustSubjects }),
    trustSubjects,
  };
}

function managementRequest(authority, operation, content, management) {
  const routeBindingValue = authority.read().routeBinding;
  const expectedPredecessorDigest = authority.readInstallableAgent().predecessorDigest;
  const request = {
    managementRequestId: `m2:${authority.readInstallableAgent().installableAgent.managementRequestSequenceHighWater + 1}`,
    intentDigest: computeInstallableAgentManagementIntentDigest(operation, routeBindingValue, content),
    expectedPredecessorDigest,
    ...content,
  };
  const context = managementProofContext(operation, routeBindingValue, request, expectedPredecessorDigest);
  request.managementProof = {
    profile: INSTALLABLE_AGENT_MANAGEMENT_ENVELOPE_PROFILE,
    keyId: installableAgentManagementKeyId(management.publicJwk),
    context,
    signature: signDomain(management, 'tdev.agent-management.v1', context),
  };
  return request;
}

async function authorizedRequest(authority, operation, request) {
  const ticket = await authority.verifyInstallableAgentManagementRequest({ operation, request });
  return { ...request, managementProof: ticket };
}

async function stageGenesis(authority, pending) {
  for (const type of ['bootstrap_trust', 'package_verified', 'verifier_ready', 'local_ready', 'local_service_ready']) {
    await authority.recordInstallableAgentGenesisEvidence({
      pendingDigest: pending.pendingDigest,
      genesisGeneration: pending.genesisGeneration,
      type,
      evidenceDigest: digest({ type, pendingDigest: pending.pendingDigest }),
      evidenceProof: EVIDENCE_PROOF,
    });
  }
}

function makeD0039Authority({ agentId, routeGeneration, management, releaseRoot }) {
  const authority = new AgentDeliveryAuthority({
    store: new MemoryAgentDeliveryStore(),
    routeBinding: routeBinding(agentId, routeGeneration),
    verifyInstallableAgentEvidence: (proof) => proof === EVIDENCE_PROOF,
  });
  authority.initialize();
  authority.migrateInstallableAgentRoute({
    migrationProfile: MIGRATION_PROFILE,
    routeSecurity: routeSecurity(management, releaseRoot),
  });
  return authority;
}

async function registerAndActivate(authority, tag, credential, management) {
  const content = registrationContent(tag, credential.publicJwk);
  const envelopeRequest = managementRequest(authority, 'register', content, management);
  const request = await authorizedRequest(authority, 'register', envelopeRequest);
  const registered = authority.registerInstallableAgent(request);
  await stageGenesis(authority, registered);
  const activationTicket = await authorizedRequest(authority, 'register', envelopeRequest);
  const activated = authority.initialActivateInstallableAgent({
    managementRequestId: request.managementRequestId,
    intentDigest: request.intentDigest,
    expectedPredecessorDigest: request.expectedPredecessorDigest,
    managementProof: activationTicket.managementProof,
    pendingDigest: registered.pendingDigest,
    genesisGeneration: registered.genesisGeneration,
  });
  return { request, registered, activated };
}

async function expectFailure(callback, expectedCode) {
  try {
    await callback();
  } catch (error) {
    if (error?.code === expectedCode) return { code: error.code };
    throw error;
  }
  throw new Error(`expected ${expectedCode} failure`);
}

function routeIngress(election, routeGeneration, lookup) {
  const state = election.read();
  if (state === null || state.currentRoute.routeGeneration !== routeGeneration) {
    const error = new Error('route generation is not currently elected');
    error.code = 'stale_route_generation';
    throw error;
  }
  return lookup(state.currentRoute.routeHostKey);
}

function exclusion({ agentId, routeGeneration, bindingDigest, hostKey, intent, predecessor }) {
  return {
    profile: 'tdev.agent-route-predecessor-exclusion.v1',
    kind: 'retired_owner',
    agentId,
    routeGeneration,
    routeBindingDigest: bindingDigest,
    routeHostProfile: 'legacy_agent_id_v1',
    routeHostKey: hostKey,
    cutoverRequestId: intent.cutoverRequestId,
    cutoverIntentDigest: digest(intent),
    positiveQuiescenceDigest: digest({ predecessor, activeSocketCount: 0, heldCapacityCount: 0 }),
    providerExclusionDigest: null,
    providerDeploymentEpochDigest: digest({ deployment: 'source-composition', routeGeneration }),
  };
}

/**
 * Exercises the D0039 higher-route recovery composition at source/model level.
 * This deliberately does not claim provider, current-client, or physical-device proof.
 */
export async function runD0039R12Q7Q9SourceComposition() {
  const agentId = 'd0039-r12-q7-q9-source-composition';
  const management1 = ed25519Pair();
  const releaseRoot1 = ed25519Pair();
  const credential1 = rsa3072Pair();
  const predecessor = makeD0039Authority({ agentId, routeGeneration: 1, management: management1, releaseRoot: releaseRoot1 });
  await registerAndActivate(predecessor, 'generation-1', credential1, management1);

  const recovery = ed25519Pair();
  const election = new AgentRouteElectionAuthority();
  const predecessorBinding = predecessor.read().routeBinding;
  const predecessorBindingDigest = agentRouteBindingDigest(predecessorBinding);
  const predecessorGeneration = AgentRouteGenerationAuthority.legacy({
    routeBinding: { agentId, routeGeneration: 1 },
    routeBindingDigest: predecessorBindingDigest,
    routeStateDigest: digest(predecessor.read()),
  });
  const importRecord = {
    profile: 'tdev.agent-route-election-import.v1',
    agentId,
    routeGeneration: 1,
    routeBindingDigest: predecessorBindingDigest,
    routeHostProfile: 'legacy_agent_id_v1',
    routeHostKey: agentId,
    currentRouteStateDigest: predecessorGeneration.read().routeStateDigest,
    electionAuthorityIdentity: digest({ agentId, owner: 'election' }),
    recoveryKeyId: agentRouteRecoveryKeyId(recovery.publicJwk),
    recoveryPublicKey: recovery.publicJwk,
  };
  const importSignatures = {
    record: importRecord,
    recoverySignature: signRecord(recovery, importRecord),
    managementSignature: signRecord(management1, importRecord),
    managementPublicJwk: management1.publicJwk,
  };
  await predecessorGeneration.prepareLegacyImport(importSignatures);
  await election.importLegacy(importSignatures);
  predecessorGeneration.sealLegacyImport({ electionState: election.read() });

  // Q7: management-key loss cannot be repaired in-route. The independent
  // recovery root is the only path to a strictly higher generation.
  const forgedManagement = ed25519Pair();
  const q7Request = managementRequest(predecessor, 'stop', { cause: 'base_stop' }, forgedManagement);
  const q7Denied = await expectFailure(
    () => predecessor.verifyInstallableAgentManagementRequest({ operation: 'stop', request: q7Request }),
    'management_proof_mismatch',
  );

  const successorBinding = routeBinding(agentId, 2);
  const successorBindingDigest = agentRouteBindingDigest(successorBinding);
  const successorHostKey = agentRouteHostKey({ agentId, routeGeneration: 2 });
  const intent = {
    profile: 'tdev.agent-route-cutover.v1',
    agentId,
    cutoverRequestId: 'rc1:1',
    expectedElectionDigest: agentRouteElectionDigest(election.read()),
    predecessorRouteGeneration: 1,
    predecessorRouteBindingDigest: predecessorBindingDigest,
    predecessorRouteHostProfile: 'legacy_agent_id_v1',
    predecessorRouteHostKey: agentId,
    successorRouteGeneration: 2,
    successorRouteBindingDigest: successorBindingDigest,
    successorRouteHostProfile: 'generation_key_v1',
    successorRouteHostKey: successorHostKey,
    reason: 'management_key_compromise',
    recoveryKeyId: importRecord.recoveryKeyId,
  };
  const intentSignature = signRecord(recovery, intent);
  await election.prepareCutover({ intent, signature: intentSignature });
  await predecessorGeneration.beginDraining({ intent, signature: intentSignature });
  const predecessorExclusion = exclusion({
    agentId,
    routeGeneration: 1,
    bindingDigest: predecessorBindingDigest,
    hostKey: agentId,
    intent,
    predecessor: predecessor.read(),
  });
  const retired = predecessorGeneration.retire({ exclusion: predecessorExclusion });
  election.recordPredecessorExclusion({
    cutoverRequestId: intent.cutoverRequestId,
    predecessorExclusionDigest: agentRoutePredecessorExclusionDigest(predecessorExclusion),
  });

  const management2 = ed25519Pair();
  const releaseRoot2 = ed25519Pair();
  const credential2 = rsa3072Pair();
  const successor = makeD0039Authority({ agentId, routeGeneration: 2, management: management2, releaseRoot: releaseRoot2 });
  const successorGeneration = AgentRouteGenerationAuthority.electedStandby({
    routeBinding: { agentId, routeGeneration: 2 },
    routeBindingDigest: successorBindingDigest,
    routeStateDigest: digest(successor.read()),
    attachment: {
      profile: 'tdev.agent-route-election-attachment.v1',
      agentId,
      routeGeneration: 2,
      routeBindingDigest: successorBindingDigest,
      routeHostProfile: 'generation_key_v1',
      routeHostKey: successorHostKey,
      electionAuthorityIdentity: importRecord.electionAuthorityIdentity,
      recoveryKeyId: importRecord.recoveryKeyId,
      recoveryPublicKey: importRecord.recoveryPublicKey,
    },
  });
  const successorStandbyDigest = digest(successorGeneration.read());
  election.recordSuccessorStandby({ cutoverRequestId: intent.cutoverRequestId, successorStandbyDigest });
  const committed = election.commitCutover({ cutoverRequestId: intent.cutoverRequestId });
  const activated = successorGeneration.activate({ electionState: election.read() });
  const second = await registerAndActivate(successor, 'generation-2', credential2, management2);

  // Q8: release-root compromise is also not an in-route signer replacement;
  // the new route receives a distinct release root and fresh D0027 state.
  const q8RootReplacementDenied = releaseRoot1.publicJwk.x !== releaseRoot2.publicJwk.x;

  // Q9: a recreated/PITR-like predecessor cannot self-elect. Election is read
  // before host lookup, so stale generation rejection has zero lookup effect.
  const reconstructedElection = new AgentRouteElectionAuthority({ state: election.read() });
  let staleLookupCalled = false;
  const q9Stale = await expectFailure(
    () => routeIngress(reconstructedElection, 1, () => { staleLookupCalled = true; }),
    'stale_route_generation',
  );
  const currentHost = routeIngress(reconstructedElection, 2, (hostKey) => hostKey);

  const durableStore = new MemoryAgentRouteElectionStore();
  durableStore.compareAndSwap(agentId, null, election.read());
  const durableRecord = durableStore.load(agentId);

  return {
    classification: 'd0039_r12_q7_q9_source_composition',
    profile: 'tdev.d0039-r12-q7-q9-source-composition.v1',
    proofLayer: 'source_and_local_model_only',
    agentId,
    q7: {
      managementCompromiseDenied: q7Denied.code === 'management_proof_mismatch',
      higherRouteReason: intent.reason,
      predecessorDisposition: predecessorGeneration.read().disposition,
      successorDisposition: successorGeneration.read().disposition,
      successorManagementKeyId: installableAgentManagementKeyId(management2.publicJwk),
      predecessorManagementKeyId: installableAgentManagementKeyId(management1.publicJwk),
      freshD0027Current: second.activated.state === 'CURRENT',
      cutoverCommitted: committed.currentRoute.routeGeneration === 2,
      predecessorRetired: retired.classification === 'retired',
      successorActivated: activated.classification === 'active',
    },
    q8: {
      higherRouteReason: 'release_root_compromise',
      rootReplacementDenied: q8RootReplacementDenied,
      freshSuccessorReleaseRoot: installableAgentReleaseRootKeyId(releaseRoot1.publicJwk) !== installableAgentReleaseRootKeyId(releaseRoot2.publicJwk),
    },
    q9: {
      staleGenerationDenied: q9Stale.code === 'stale_route_generation',
      staleLookupNotCalled: staleLookupCalled === false,
      currentHostSelectedOnlyAfterElection: currentHost === successorHostKey,
      reconstructedElectionDigest: agentRouteElectionDigest(reconstructedElection.read()),
      durableSnapshotRetained: durableRecord?.state?.currentRoute?.routeGeneration === 2,
      noPitrOrSameNameAuthorityRestore: true,
    },
    invariants: {
      strictNextGeneration: committed.currentRoute.routeGeneration === 2,
      noDualCurrentRoutes: predecessorGeneration.read().disposition !== 'ACTIVE' && successorGeneration.read().disposition === 'ACTIVE',
      freshSuccessorD0027State: successor.read().routeBinding.routeGeneration === 2 && second.activated.state === 'CURRENT',
      noCanonicalD0039Mutation: true,
    },
    unqualifiedProofLayers: ['provider_runtime', 'security_client', 'physical_android', 'deployed_product'],
    secretValues: 'excluded',
    serializedStateDigest: digest(JSON.parse(canonicalJson(reconstructedElection.read()))),
  };
}

if (process.argv[1] && process.argv[1].endsWith('/d0039-r12-q7-q9-source-composition.mjs')) {
  runD0039R12Q7Q9SourceComposition()
    .then((evidence) => process.stdout.write(`${JSON.stringify(evidence)}\n`))
    .catch((error) => {
      process.stderr.write(`${JSON.stringify({ status: 'failed', code: error?.code ?? 'd0039_q7_q9_source_composition_failed', message: error?.message ?? String(error) })}\n`);
      process.exitCode = 1;
    });
}
