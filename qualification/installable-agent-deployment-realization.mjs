#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canonicalClone, canonicalJson } from '../src/canonical.mjs';
import {
  QUALIFICATION_EVIDENCE_PROFILE,
  qualificationGateRequiredPrincipals,
  validateTerminalQualificationEvidence,
} from './installable-agent-qualification-r3.mjs';

export const INSTALLABLE_AGENT_QUALIFICATION_OBSERVATION_PROFILE = QUALIFICATION_EVIDENCE_PROFILE;

const GATES = Object.freeze({
  q2_workers_crypto: Object.freeze({
    proofLayer: 'deployed_workers_runtime',
    checks: ['rsa3072PublicJwkImport', 'sha256withRsaVerify', 'ed25519ManagementVerify', 'ed25519ReleaseVerify', 'mutatedSignatureRejected', 'domainConfusionRejected'],
  }),
  q3_physical_android_termux: Object.freeze({
    proofLayer: 'physical_android_termux_service',
    checks: ['termuxLineagePinned', 'termuxApiLineagePinned', 'rsa3072Generated', 'unattendedSign', 'publicJwkInterop', 'missingApiFailsClosed', 'sourceSwitchFailsClosed', 'aliasLossFailsClosed', 'reinstallLossFailsClosed', 'deviceReplacementFailsClosed', 'cloneResistance', 'noFileKeyFallback'],
  }),
  q4_fresh_bootstrap: Object.freeze({
    proofLayer: 'fresh_machine_bootstrap',
    checks: ['noAmbientTdevTrust', 'independentCapsuleDigest', 'untrustedTransport', 'capsuleBoundVerifier', 'rootDelegationReleaseChain', 'archiveManifestFileChain', 'capsuleTamperRejected', 'verifierTamperRejected', 'delegationTamperRejected', 'releaseTamperRejected', 'archiveTamperRejected', 'manifestTamperRejected', 'fileTamperRejected', 'candidateCannotSelfAuthorize'],
  }),
  q5_live_provider_iam: Object.freeze({
    proofLayer: 'live_provider_control_plane',
    checks: ['accountBound', 'workerServiceBound', 'activeSourceBound', 'writerTraffic100Percent', 'durableObjectClassExported', 'namespaceBindingBound', 'jurisdictionBound', 'routeObjectBound', 'ingressBound', 'publicVerifierFingerprintsBound', 'legacyHmacInventory', 'deploymentManagementIamSeparated', 'releaseProviderIamSeparated', 'secretValuesExcluded'],
  }),
  q6_live_migration: Object.freeze({
    proofLayer: 'live_provider_migration',
    checks: ['d0020OnlyObserved', 'nestedV2Unregistered', 'genesisPending', 'current', 'nestedV1TerminalImport', 'requestFloorInitializedOrImported', 'invalidPredecessorRejected', 'crashRestartReconciled', 'heldSlotQuiescence', 'singleWriter', 'hmacRejectedAfterMarker', 'hmacBindingRemoved', 'firstV2WriteRollbackBarrier'],
    events: ['d0020_only', 'nested_v2_unregistered', 'genesis_pending', 'current'],
  }),
  q7_management_loss_compromise: Object.freeze({
    proofLayer: 'management_lifecycle',
    checks: ['validM2Mutation', 'exactReplay', 'staleRejected', 'gapRejected', 'alteredConflict', 'sameIdResponseLoss', 'sameKeyBackupObservedOrNotUsed', 'totalLossFailsClosed', 'compromiseRequiresHigherRoute'],
  }),
  q8_release_lifecycle: Object.freeze({
    proofLayer: 'release_lifecycle',
    checks: ['signerReplacement', 'signerRetirement', 'signerRevocation', 'boundedLifetimeSignerSet', 'boundedActiveSignerSet', 'trustGenerationMonotonic', 'rootLossFailsClosedForSetChange', 'rootCompromiseRequiresHigherRoute', 'forwardPackageRollback', 'packageCannotSelfAuthenticate', 'capsuleCannotSelfAuthenticate'],
  }),
  q9_rollback_provider_loss_retention: Object.freeze({
    proofLayer: 'provider_rollback_retention',
    checks: ['nestedV2RollbackBarrier', 'noAutomaticV2ToV1', 'noPitrAuthorityRestore', 'noSameNameAuthorityRestore', 'requestFloorsAcrossRestart', 'generationFloorsAcrossCompaction', 'storagePressureFailsClosed', 'terminalTombstonesRetained', 'providerLossRequiresHigherRoute'],
  }),
  q10_deployed_composition: Object.freeze({
    proofLayer: 'deployed_product_composition',
    checks: ['freshSupportedMachine', 'bootstrap', 'provision', 'current', 'challenge', 'androidKeystorePossession', 'connect', 'deliveryComposition', 'update', 'forwardRollback', 'restart', 'sameIdResponseLossRetry', 'uninstall', 'localTerminalCleanup', 'providerTerminalCleanup'],
    events: ['fresh_machine', 'bootstrap', 'provision', 'current', 'challenge', 'possession', 'connect', 'delivery', 'update', 'forward_rollback', 'restart', 'same_id_response_loss_retry', 'uninstall', 'local_cleanup', 'provider_cleanup'],
  }),
});

export const INSTALLABLE_AGENT_QUALIFICATION_GATES = Object.freeze(canonicalClone(GATES));

function fail(code, message, details = undefined) {
  const error = new Error(message);
  error.code = code;
  error.details = details ?? {};
  throw error;
}

export function validateInstallableAgentQualificationObservation(gate, observation) {
  if (GATES[gate] === undefined) fail('qualification_gate_unknown', 'Unknown installable Agent qualification gate', { gate });
  return validateTerminalQualificationEvidence(observation, { expectedGate: gate });
}

export async function runInstallableAgentQualificationGate({ gate, driver }) {
  if (GATES[gate] === undefined) fail('qualification_gate_unknown', 'Unknown installable Agent qualification gate', { gate });
  if (typeof driver !== 'function') fail('qualification_driver_invalid', 'Qualification driver must be callable');
  const evidence = await driver(Object.freeze({
    gate,
    specification: canonicalClone(GATES[gate]),
    evidenceProfile: QUALIFICATION_EVIDENCE_PROFILE,
    requiredPrincipals: qualificationGateRequiredPrincipals(gate),
  }));
  return validateInstallableAgentQualificationObservation(gate, evidence);
}

function parseArgs(argv) {
  if (argv.length !== 4 || argv[0] !== '--gate' || argv[2] !== '--driver' || !path.isAbsolute(argv[3])) {
    fail('qualification_driver_usage', 'usage: installable-agent-deployment-realization --gate <q2..q10> --driver <absolute-module>');
  }
  if (GATES[argv[1]] === undefined) fail('qualification_gate_unknown', 'Unknown installable Agent qualification gate', { gate: argv[1] });
  return { gate: argv[1], driverPath: path.resolve(argv[3]) };
}

async function main() {
  const { gate, driverPath } = parseArgs(process.argv.slice(2));
  const module = await import(`${pathToFileURL(driverPath).href}?qualification=${Date.now()}`);
  const driver = module.runInstallableAgentQualification ?? module.default;
  const evidence = await runInstallableAgentQualificationGate({ gate, driver });
  process.stdout.write(`${canonicalJson({ classification: 'qualified', evidence })}\n`);
}

const direct = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  try { await main(); }
  catch (error) {
    process.stderr.write(`${JSON.stringify({ error: error?.code ?? 'qualification_driver_failed', message: error?.message ?? 'installable Agent qualification driver failed', details: error?.details ?? {} })}\n`);
    process.exitCode = 1;
  }
}
