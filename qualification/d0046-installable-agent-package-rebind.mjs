#!/usr/bin/env node

/*
 * D0046 M1 local half: activate the exact D0043 package on the already
 * admitted D0039 route.  All provider credentials and signing keys are
 * external references supplied through the environment; this helper never
 * serializes their bytes into a request, result or evidence file.
 */
import { createPrivateKey, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  InstallableAgentPackageManager,
  verifyInstallableAgentRelease,
} from '../src/installable-agent-package.mjs';
import { TermuxInstallableAgentServiceController } from '../src/installable-agent-termux-service.mjs';
import {
  canonicalClone,
  canonicalJson,
  digest,
  strictJsonParse,
} from '../src/canonical.mjs';
import {
  computeInstallableAgentManagementIntentDigest,
  evidenceProofContext,
  installableAgentSecurityStateDigest,
  managementProofContext,
} from '../src/installable-agent-admission.mjs';
import {
  AGENT_DELIVERY_WEBSOCKET_PATH,
} from '../src/cloudflare-agent-delivery-runtime.mjs';
import {
  INSTALLABLE_AGENT_EVIDENCE_ATTESTATION_ENVELOPE_PROFILE,
  INSTALLABLE_AGENT_EVIDENCE_ATTESTATION_SIGNATURE_DOMAIN,
  INSTALLABLE_AGENT_MANAGEMENT_ENVELOPE_PROFILE,
  encodeBase64Url,
  installableAgentEvidenceAttestorKeyId,
  installableAgentManagementKeyId,
  signedRecordBytes,
} from '../src/installable-agent-security.mjs';
import { QUALIFICATION_RPC_PROFILE } from './installable-agent-qualification-r4.mjs';

const DEFAULT_AGENT_ID = 'd0039-r12-custody-20260828-3631c5a4';
const DEFAULT_ROUTE_GENERATION = 1;
const DEFAULT_QUALIFICATION_ORIGIN = 'https://tdev-d0020-qualification-clean-a.humtr.workers.dev';
const DEFAULT_STATE_DIRECTORY = '/data/data/com.termux/files/home/.local/state/tdev-d0039-r12-agent/route-d0039-r12-custody-20260828-3631c5a4/state';
const DEFAULT_CREDENTIAL_REF = 'androidkeystore://com.termux.api/tdev.a1.gm6fFTftt0hx_vVWFVqa3luRI-K5_1gnbUZ_ka9vGFM';
const DEFAULT_ANDROID_SOURCE_LINEAGE = '228fb2cfe90831c1499ec3ccaf61e96e8e1ce70766b9474672ce427334d41c42';
const DEFAULT_MANAGEMENT_KEY_PATH = '/data/data/com.termux/files/home/.local/state/tdev-d0039-r12-management/route-d0039-r12-custody-20260828-3631c5a4/management.private.pkcs8.pem';
const DEFAULT_ATTESTOR_KEY_PATH = '/data/data/com.termux/files/home/.local/state/tdev-d0040-attestor/v1/attestor-private.pk8.pem';
const DEFAULT_REPOSITORY_PATH = '/data/data/com.termux/files/home/prj/tdev';
const DEFAULT_CODEX_EXECUTABLE = '/data/data/com.termux/files/usr/bin/codex';
const DEFAULT_NPM_EXECUTABLE = '/data/data/com.termux/files/usr/bin/npm';
const DEFAULT_WORKSPACE_ROOT = '/data/data/com.termux/files/home/.local/state/tdev-d0039-r12-agent/route-d0039-r12-custody-20260828-3631c5a4/state/development-workspaces';

function fail(code, message, details = undefined, cause = undefined) {
  const error = new Error(message, { cause });
  error.code = code;
  error.details = details ?? {};
  throw error;
}

function envText(name, fallback = undefined) {
  const value = process.env[name] ?? fallback;
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) fail('d0046_rebind_config_invalid', `${name} is missing or invalid`);
  return value;
}

function envAbsolute(name, fallback = undefined) {
  const value = envText(name, fallback);
  if (!path.isAbsolute(value)) fail('d0046_rebind_config_invalid', `${name} must be an absolute path`);
  return path.resolve(value);
}

function routeId(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail('d0046_rebind_config_invalid', 'route generation is invalid');
  return value;
}

async function loadPrivateKey(filePath, label) {
  let bytes;
  try { bytes = await readFile(filePath); }
  catch (cause) { fail('d0046_rebind_key_unavailable', `${label} cannot be read`, {}, cause); }
  if (bytes.byteLength === 0 || bytes.byteLength > 16 * 1024) fail('d0046_rebind_key_unavailable', `${label} is outside its bound`);
  try { return createPrivateKey(bytes); }
  catch (cause) { fail('d0046_rebind_key_invalid', `${label} is not a supported private key`, {}, cause); }
}

function publicJwk(privateKey, label) {
  let jwk;
  try { jwk = privateKey.export({ format: 'jwk', public: true }); }
  catch (cause) { fail('d0046_rebind_key_invalid', `${label} public projection failed`, {}, cause); }
  if (jwk?.kty !== 'OKP' || jwk?.crv !== 'Ed25519' || typeof jwk.x !== 'string') {
    fail('d0046_rebind_key_invalid', `${label} must be Ed25519`);
  }
  const { d: _private, ...publicOnly } = jwk;
  return Object.freeze(publicOnly);
}

function signDomain(privateKey, domain, record) {
  return encodeBase64Url(sign(null, signedRecordBytes(domain, record), privateKey));
}

function requestRouteBinding(securityReadback, agentId, routeGeneration) {
  const binding = securityReadback?.runtime?.routeBinding;
  if (binding?.agentId !== agentId || binding?.routeGeneration !== routeGeneration) {
    fail('d0046_rebind_route_binding_mismatch', 'Provider route readback does not bind the requested Agent route');
  }
  return canonicalClone(binding);
}

async function readLocalManagementCurrent(stateDirectory) {
  const journalPath = path.join(stateDirectory, 'management-journal.json');
  let bytes;
  try {
    bytes = await readFile(journalPath);
  } catch (cause) {
    if (cause?.code === 'ENOENT') return null;
    fail('d0046_rebind_local_journal_unavailable', 'Local management journal cannot be read', {}, cause);
  }
  let journal;
  try {
    journal = strictJsonParse(bytes.toString('utf8').trimEnd(), { maxBytes: 1024 * 1024 });
  } catch (cause) {
    fail('d0046_rebind_local_journal_invalid', 'Local management journal is not bounded JSON', {}, cause);
  }
  if (journal === null || typeof journal !== 'object' || Array.isArray(journal) ||
      journal.profile !== 'tdev.installable-agent-management-journal.v1' ||
      journal.authorityClaim !== 'subordinate_recovery_only' ||
      (journal.current !== null && (typeof journal.current !== 'object' || Array.isArray(journal.current)))) {
    fail('d0046_rebind_local_journal_invalid', 'Local management journal identity is invalid');
  }
  return journal.current === null ? null : canonicalClone(journal.current);
}

function assertCurrentRoute(readback, agentId, routeGeneration, packageManifestDigest) {
  const current = readback?.installableAgent?.current;
  if (readback?.installableAgent?.state !== 'CURRENT' || current === null || readback.currentTuple === null || readback.currentTupleDigest === null) {
    fail('d0046_rebind_route_not_current', 'D0039 route must be CURRENT before package rebind');
  }
  const transaction = readback?.installableAgent?.current?.managementTransaction;
  if (transaction !== null) {
    if (transaction.type !== 'package_update' || transaction.candidate?.packageManifestDigest !== packageManifestDigest) {
      fail('d0046_rebind_management_in_progress', 'D0039 route has an unrelated nonterminal management transaction');
    }
  }
  if (readback.currentTuple.packageManifestDigest === undefined) {
    fail('d0046_rebind_route_tuple_invalid', 'D0039 current tuple has no package manifest identity');
  }
  if (readback.installableAgent.current.packageManifestDigest !== readback.currentTuple.packageManifestDigest) {
    fail('d0046_rebind_route_tuple_invalid', 'D0039 current tuple and security state disagree');
  }
  if (readback.installableAgent.currentCredentialKeyId === null) {
    fail('d0046_rebind_route_credential_missing', 'D0039 current credential identity is unavailable');
  }
  if (typeof readback.predecessorDigest !== 'string') fail('d0046_rebind_route_predecessor_missing', 'D0039 predecessor digest is unavailable');
  if (readback.installableAgent.managementRequestSequenceHighWater === undefined) {
    fail('d0046_rebind_request_floor_missing', 'D0039 management request high-water is unavailable');
  }
  if (agentId.length === 0 || routeGeneration < 1) fail('d0046_rebind_config_invalid', 'Agent route identity is invalid');
}

async function providerJson({ origin, token, agentId, routeGeneration, operation, request = undefined, expectedDeploymentIdentityDigest = undefined }) {
  const body = {
    profile: QUALIFICATION_RPC_PROFILE,
    operation,
    agentId,
    routeGeneration,
    ...(expectedDeploymentIdentityDigest === undefined ? {} : { expectedDeploymentIdentityDigest }),
    ...(request === undefined ? {} : { request }),
  };
  let response;
  try {
    response = await fetch(`${origin}/qualification/d0020/v2`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      redirect: 'error',
    });
  } catch (cause) {
    fail('d0046_rebind_provider_unreachable', `Provider ${operation} request failed to reach its endpoint`, { operation }, cause);
  }
  let parsed;
  try { parsed = await response.json(); }
  catch (cause) { fail('d0046_rebind_provider_response_invalid', `Provider ${operation} response was not JSON`, { status: response.status }, cause); }
  if (!response.ok || parsed?.ok !== true || !Object.hasOwn(parsed, 'result')) {
    const code = typeof parsed?.error?.code === 'string' ? parsed.error.code : `http_${response.status}`;
    fail('d0046_rebind_provider_rejected', `Provider rejected ${operation}: ${code}`, { operation, providerCode: code, status: response.status });
  }
  return parsed.result;
}

function buildManagementRequest({ routeBinding, routeRead, localManagementCurrent, packageManifestDigest, packageTrustSubjectDigest, managementPrivateKey, managementPublicJwk, controlConfig }) {
  const transaction = routeRead.installableAgent.current.managementTransaction ?? localManagementCurrent;
  const highWater = routeRead.installableAgent.managementRequestSequenceHighWater;
  const managementRequestId = transaction?.managementRequestId ?? `m2:${highWater + 1}`;
  const intentContent = {
    transitionCause: 'package_update',
    packageManifestDigest,
    packageTrustSubjectDigest,
  };
  const expectedPredecessorDigest = transaction?.predecessorDigest ?? transaction?.expectedPredecessorDigest ?? routeRead.predecessorDigest;
  const computedIntentDigest = computeInstallableAgentManagementIntentDigest('package', routeBinding, intentContent);
  const intentDigest = transaction?.intentDigest ?? computedIntentDigest;
  if (transaction !== null && intentDigest !== computedIntentDigest) {
    fail('d0046_rebind_transaction_conflict', 'Existing D0027 package transaction intent does not match the exact candidate package');
  }
  const unsigned = {
    managementRequestId,
    intentDigest,
    expectedPredecessorDigest,
    transitionCause: 'package_update',
    packageManifestDigest,
    packageTrustSubjectDigest,
    controlConfig,
  };
  const context = managementProofContext('package', routeBinding, unsigned, expectedPredecessorDigest);
  return {
    ...unsigned,
    managementProof: {
      profile: INSTALLABLE_AGENT_MANAGEMENT_ENVELOPE_PROFILE,
      keyId: installableAgentManagementKeyId(managementPublicJwk),
      context,
      signature: signDomain(managementPrivateKey, 'tdev.agent-management.v1', context),
    },
  };
}

function evidenceProof({ type, routeBinding, routeRead, evidenceDigest, attestorPrivateKey, attestorPublicJwk }) {
  const current = routeRead?.installableAgent?.current;
  const transaction = current?.managementTransaction;
  if (transaction === null || transaction === undefined) fail('d0046_rebind_transaction_missing', 'Provider transaction disappeared before local evidence attestation');
  const details = {
    managementRequestId: transaction.managementRequestId,
    transactionType: transaction.type,
    phase: transaction.phase,
    candidate: transaction.candidate,
    currentSecurityDigest: installableAgentSecurityStateDigest(routeRead.installableAgent),
  };
  const context = evidenceProofContext(type, routeBinding, { ...details, evidenceDigest });
  return {
    profile: INSTALLABLE_AGENT_EVIDENCE_ATTESTATION_ENVELOPE_PROFILE,
    keyId: installableAgentEvidenceAttestorKeyId(attestorPublicJwk),
    context,
    signature: signDomain(attestorPrivateKey, INSTALLABLE_AGENT_EVIDENCE_ATTESTATION_SIGNATURE_DOMAIN, context),
  };
}

export async function runD0046InstallableAgentPackageRebind(options = {}) {
  const packageRoot = envAbsolute('TDEV_D0046_PACKAGE_ROOT', options.packageRoot);
  const stateDirectory = envAbsolute('TDEV_D0046_STATE_DIRECTORY', options.stateDirectory ?? DEFAULT_STATE_DIRECTORY);
  const origin = envText('TDEV_D0046_QUALIFICATION_ORIGIN', options.qualificationOrigin ?? DEFAULT_QUALIFICATION_ORIGIN).replace(/\/$/, '');
  const token = envText('TDEV_D0020_QUALIFICATION_TOKEN', options.qualificationToken);
  const agentId = envText('TDEV_D0046_AGENT_ID', options.agentId ?? DEFAULT_AGENT_ID);
  const routeGeneration = routeId(Number(envText('TDEV_D0046_ROUTE_GENERATION', String(options.routeGeneration ?? DEFAULT_ROUTE_GENERATION))));
  const managementKeyPath = envAbsolute('TDEV_D0039_MANAGEMENT_KEY_PATH', options.managementKeyPath ?? DEFAULT_MANAGEMENT_KEY_PATH);
  const attestorKeyPath = envAbsolute('TDEV_D0040_ATTESTOR_KEY_PATH', options.attestorKeyPath ?? DEFAULT_ATTESTOR_KEY_PATH);
  const credentialRef = envText('TDEV_D0046_CREDENTIAL_REF', options.credentialRef ?? DEFAULT_CREDENTIAL_REF);
  const androidSourceLineageId = envText('TDEV_D0046_ANDROID_SOURCE_LINEAGE_ID', options.androidSourceLineageId ?? DEFAULT_ANDROID_SOURCE_LINEAGE);
  const repositoryPath = envAbsolute('TDEV_D0046_REPOSITORY_PATH', options.repositoryPath ?? DEFAULT_REPOSITORY_PATH);
  const codexHome = envAbsolute('TDEV_D0046_CODEX_HOME', options.codexHome ?? process.env.CODEX_HOME);
  const codexExecutable = envAbsolute('TDEV_D0046_CODEX_EXECUTABLE', options.codexExecutable ?? DEFAULT_CODEX_EXECUTABLE);
  const npmExecutable = envAbsolute('TDEV_D0046_NPM_EXECUTABLE', options.npmExecutable ?? DEFAULT_NPM_EXECUTABLE);
  const workspaceRoot = envAbsolute('TDEV_D0046_WORKSPACE_ROOT', options.workspaceRoot ?? DEFAULT_WORKSPACE_ROOT);
  const prefix = envAbsolute('PREFIX', options.prefix ?? process.env.PREFIX);
  const release = await verifyInstallableAgentRelease({ packageRoot });
  const managementPrivateKey = await loadPrivateKey(managementKeyPath, 'D0039 management key');
  const managementPublicJwk = publicJwk(managementPrivateKey, 'D0039 management key');
  const attestorPrivateKey = await loadPrivateKey(attestorKeyPath, 'D0040 evidence attestor key');
  const attestorPublicJwk = publicJwk(attestorPrivateKey, 'D0040 evidence attestor key');
  const security = await providerJson({ origin, token, agentId, routeGeneration, operation: 'd0039_security_readback' });
  const routeBinding = requestRouteBinding(security, agentId, routeGeneration);
  const routeRead = await providerJson({ origin, token, agentId, routeGeneration, operation: 'read_installable_agent' });
  assertCurrentRoute(routeRead, agentId, routeGeneration, release.manifestDigest);
  const localManagementCurrent = await readLocalManagementCurrent(stateDirectory);
  if (routeRead.installableAgent.current.managementTransaction === null && localManagementCurrent !== null) {
    if (localManagementCurrent.phase !== 'authority_committed' || localManagementCurrent.releaseManifestDigest !== release.manifestDigest) {
      fail('d0046_rebind_local_recovery_unsupported', 'A local nonterminal management journal cannot be reconciled with the provider current route');
    }
  }
  if (security.managementKeyId !== installableAgentManagementKeyId(managementPublicJwk)) {
    fail('d0046_rebind_management_key_mismatch', 'Local D0039 management key does not match provider readback');
  }
  if (security.evidenceAttestationVerifier?.keyId !== installableAgentEvidenceAttestorKeyId(attestorPublicJwk)) {
    fail('d0046_rebind_attestor_key_mismatch', 'Local D0040 attestor key does not match provider readback');
  }
  const packageTrustSubjectDigest = routeRead.installableAgent.current.packageTrustSubjectDigest;
  if (typeof packageTrustSubjectDigest !== 'string') fail('d0046_rebind_trust_subject_missing', 'Current package trust subject is unavailable');
  const controlConfig = {
    agentId,
    routeGeneration,
    executorId: `tdev-mcp-trial-${release.manifest.sourceRevision.slice(0, 12)}`,
    executorEpoch: 1,
    agentDeliveryUrl: `${origin.replace(/^https:/, 'wss:')}${AGENT_DELIVERY_WEBSOCKET_PATH}`,
    credentialRef,
    androidSourceLineageId,
    protocolMetadataDigest: digest({ profile: 'tdev.d0046-mcp-trial-agent-protocol.v1', version: 1 }),
    reportedCapacity: 1,
    developmentRepositoryPath: repositoryPath,
    developmentCodexHome: codexHome,
    developmentCodexExecutable: codexExecutable,
    developmentNpmExecutable: npmExecutable,
    developmentWorkspaceRoot: workspaceRoot,
  };
  const request = buildManagementRequest({
    routeBinding,
    routeRead,
    localManagementCurrent,
    packageManifestDigest: release.manifestDigest,
    packageTrustSubjectDigest,
    managementPrivateKey,
    managementPublicJwk,
    controlConfig,
  });
  const manager = new InstallableAgentPackageManager({
    packageRoot,
    stateDirectory,
    serviceController: new TermuxInstallableAgentServiceController({ prefix }),
    managementTransport: {
      async invoke(operation, input) {
        const providerOperation = {
          beginPackageActivation: 'begin_package_activation',
          recordInstallableAgentTransactionEvidence: 'record_installable_agent_transaction_evidence',
          commitPackageActivation: 'commit_package_activation',
        }[operation];
        if (providerOperation === undefined) fail('d0046_rebind_operation_unsupported', `D0046 transport does not support ${operation}`);
        let providerRequest = canonicalClone(input);
        if (operation === 'recordInstallableAgentTransactionEvidence') {
          const currentRead = await providerJson({ origin, token, agentId, routeGeneration, operation: 'read_installable_agent' });
          providerRequest = {
            managementRequestId: input.managementRequestId,
            type: input.type,
            evidenceDigest: input.evidenceDigest,
            evidenceProof: evidenceProof({
              type: input.type,
              routeBinding,
              routeRead: currentRead,
              evidenceDigest: input.evidenceDigest,
              attestorPrivateKey,
              attestorPublicJwk,
            }),
          };
        }
        const currentSecurity = await providerJson({ origin, token, agentId, routeGeneration, operation: 'd0039_security_readback' });
        return providerJson({
          origin,
          token,
          agentId,
          routeGeneration,
          operation: providerOperation,
          expectedDeploymentIdentityDigest: currentSecurity.deploymentIdentityDigest,
          request: providerRequest,
        });
      },
    },
  });
  const result = await manager.update(request);
  const finalRead = await providerJson({ origin, token, agentId, routeGeneration, operation: 'read_installable_agent' });
  const finalSecurity = await providerJson({ origin, token, agentId, routeGeneration, operation: 'd0039_security_readback' });
  return Object.freeze({
    classification: 'd0046_installable_agent_rebound',
    route: { agentId, routeGeneration },
    package: {
      sourceRevision: release.manifest.sourceRevision,
      releaseManifestDigest: release.manifestDigest,
      verifiedFiles: release.verifiedFiles,
    },
    managementRequestId: request.managementRequestId,
    manager: canonicalClone(result),
    currentTupleDigest: finalRead.currentTupleDigest,
    currentPackageManifestDigest: finalRead.currentTuple?.packageManifestDigest ?? null,
    providerDeploymentIdentityDigest: finalSecurity.deploymentIdentityDigest,
    developmentCapabilities: result.localControl?.developmentOperationCapabilities ?? [],
    secretValues: 'excluded',
  });
}

const direct = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  try {
    const result = await runD0046InstallableAgentPackageRebind();
    process.stdout.write(`${canonicalJson(result)}\n`);
  } catch (error) {
    process.stderr.write(`${canonicalJson({ error: error?.code ?? 'd0046_rebind_failed', message: error?.message ?? 'D0046 package rebind failed', details: error?.details ?? {} })}\n`);
    process.exitCode = 1;
  }
}
