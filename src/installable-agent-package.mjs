import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  ContractError,
  assertDigest,
  assertIdentifier,
  assertRecordShape,
  assertSafeInteger,
  canonicalClone,
  canonicalJson,
  digest,
  strictJsonParse,
} from './canonical.mjs';
import { INSTALLABLE_AGENT_SUPERVISOR_SERVICE_PROTOCOL } from './installable-agent-supervisor-service.mjs';
import { INSTALLABLE_AGENT_TERMUX_SERVICE_PROFILE } from './installable-agent-termux-service.mjs';

export const INSTALLABLE_AGENT_PACKAGE_PROFILE = 'tdev.installable-agent-package.v1';
export const INSTALLABLE_AGENT_PACKAGE_MANIFEST_SCHEMA_VERSION = 1;
export const INSTALLABLE_AGENT_PACKAGE_STATE_SCHEMA_VERSION = 1;
export const INSTALLABLE_AGENT_MANAGEMENT_JOURNAL_SCHEMA_VERSION = 1;
export const INSTALLABLE_AGENT_MANAGEMENT_JOURNAL_PROFILE = 'tdev.installable-agent-management-journal.v1';
export const INSTALLABLE_AGENT_MANAGEMENT_PROTOCOL_PROFILE = 'tdev.agent-management.v1';
export const INSTALLABLE_AGENT_PACKAGE_CONFIG_SCHEMA = Object.freeze({
  schemaVersion: 1,
  profile: 'tdev.installable-agent-package-config.v1',
  requiredNonSecret: [
    'agentId',
    'routeGeneration',
    'executorId',
    'executorEpoch',
    'agentDeliveryUrl',
    'stateDirectory',
    'credentialRef',
    'installableAgentTuple',
    'protocolMetadataDigest',
    'reportedCapacity',
  ],
  secretMaterial: 'external-reference-only',
  authority: 'subordinate-local-evidence-only',
});

const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_STATE_BYTES = 1024 * 1024;
const MAX_MANAGEMENT_JOURNAL_BYTES = 1024 * 1024;
const MAX_MANAGEMENT_JOURNAL_COMPLETED = 128;
const NONTERMINAL_MANAGEMENT_PHASES = new Set(['pending', 'prepared', 'submitted', 'draining', 'quiescing', 'staged', 'verifying', 'activating']);
const SOURCE_REVISION_RE = /^[0-9a-f]{40}$/;
const FILE_DIGEST_RE = /^[0-9a-f]{64}$/;

function fail(code, message, details = undefined, options = undefined) {
  throw new ContractError(code, message, details, options);
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertSafeRelativePath(relativePath, label) {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || relativePath.includes('\0') || path.isAbsolute(relativePath)) {
    fail('invalid_installable_agent_package_path', `${label} must be a non-empty relative path`);
  }
  const normalized = path.posix.normalize(relativePath.replaceAll('\\', '/'));
  if (normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) {
    fail('invalid_installable_agent_package_path', `${label} escapes the package root`);
  }
  return normalized;
}

function normalizeFileEntry(relativePath, entry) {
  assertRecordShape(entry, ['sha256', 'bytes', 'role'], [], `package file ${relativePath}`);
  if (!FILE_DIGEST_RE.test(entry.sha256)) fail('invalid_installable_agent_package_manifest', `package file ${relativePath} has invalid sha256`);
  if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0) fail('invalid_installable_agent_package_manifest', `package file ${relativePath} has invalid byte size`);
  if (typeof entry.role !== 'string' || entry.role.length === 0) fail('invalid_installable_agent_package_manifest', `package file ${relativePath} has invalid role`);
  return canonicalClone(entry);
}

export function normalizeInstallableAgentReleaseManifest(manifest) {
  assertRecordShape(manifest, [
    'schemaVersion', 'profile', 'sourceRevision', 'target', 'runtime', 'stateSchemas', 'protocols', 'capabilityProfile',
    'serviceHostProfile', 'configurationSchemaDigest', 'toolProfiles', 'helperAbi', 'files',
  ], [], 'installable Agent release manifest');
  if (manifest.schemaVersion !== INSTALLABLE_AGENT_PACKAGE_MANIFEST_SCHEMA_VERSION || manifest.profile !== INSTALLABLE_AGENT_PACKAGE_PROFILE) {
    fail('installable_agent_package_manifest_incompatible', 'Installable Agent release manifest profile/schema is unsupported');
  }
  if (!SOURCE_REVISION_RE.test(manifest.sourceRevision)) fail('invalid_installable_agent_package_manifest', 'sourceRevision must be an exact lowercase Git SHA');
  assertRecordShape(manifest.target, ['platform', 'arch'], [], 'package target');
  if (typeof manifest.target.platform !== 'string' || typeof manifest.target.arch !== 'string') fail('invalid_installable_agent_package_manifest', 'package target is invalid');
  assertRecordShape(manifest.runtime, ['nodeMajorMinimum'], [], 'package runtime');
  if (!Number.isSafeInteger(manifest.runtime.nodeMajorMinimum) || manifest.runtime.nodeMajorMinimum < 22) fail('invalid_installable_agent_package_manifest', 'package Node minimum is invalid');
  assertRecordShape(manifest.stateSchemas, ['agentDeliverySnapshot', 'supervisorJournal', 'packageState', 'managementJournal', 'controlConnection'], [], 'package state schemas');
  for (const value of Object.values(manifest.stateSchemas)) if (!Number.isSafeInteger(value) || value < 1) fail('invalid_installable_agent_package_manifest', 'package state schema is invalid');
  assertRecordShape(manifest.protocols, ['agentWebSocket', 'management', 'supervisorService'], [], 'package protocols');
  if (typeof manifest.protocols.agentWebSocket !== 'string' || manifest.protocols.management !== INSTALLABLE_AGENT_MANAGEMENT_PROTOCOL_PROFILE ||
      manifest.protocols.supervisorService !== INSTALLABLE_AGENT_SUPERVISOR_SERVICE_PROTOCOL) {
    fail('invalid_installable_agent_package_manifest', 'package protocol identity is invalid');
  }
  if (typeof manifest.capabilityProfile !== 'string' || manifest.capabilityProfile.length === 0) fail('invalid_installable_agent_package_manifest', 'capabilityProfile is invalid');
  if (manifest.serviceHostProfile !== INSTALLABLE_AGENT_TERMUX_SERVICE_PROFILE) fail('invalid_installable_agent_package_manifest', 'serviceHostProfile is invalid');
  assertDigest(manifest.configurationSchemaDigest, 'configurationSchemaDigest');
  const expectedConfigDigest = digest(INSTALLABLE_AGENT_PACKAGE_CONFIG_SCHEMA);
  if (manifest.configurationSchemaDigest !== expectedConfigDigest) fail('installable_agent_package_manifest_incompatible', 'configuration schema identity mismatches package source');
  assertRecordShape(manifest.toolProfiles, ['relativePath', 'sha256'], [], 'package tool-profile binding');
  const toolProfilePath = assertSafeRelativePath(manifest.toolProfiles.relativePath, 'toolProfiles.relativePath');
  if (toolProfilePath !== manifest.toolProfiles.relativePath || !FILE_DIGEST_RE.test(manifest.toolProfiles.sha256)) {
    fail('invalid_installable_agent_package_manifest', 'tool-profile binding is invalid');
  }
  assertRecordShape(manifest.helperAbi, ['profile', 'abiVersion', 'relativePath', 'sha256'], [], 'package helper ABI');
  if (typeof manifest.helperAbi.profile !== 'string' || !Number.isSafeInteger(manifest.helperAbi.abiVersion) || manifest.helperAbi.abiVersion < 1 ||
      !FILE_DIGEST_RE.test(manifest.helperAbi.sha256)) fail('invalid_installable_agent_package_manifest', 'helper ABI binding is invalid');
  assertSafeRelativePath(manifest.helperAbi.relativePath, 'helperAbi.relativePath');
  if (manifest.files === null || typeof manifest.files !== 'object' || Array.isArray(manifest.files) || Object.keys(manifest.files).length === 0) {
    fail('invalid_installable_agent_package_manifest', 'package files map is invalid');
  }
  const files = {};
  for (const relativePath of Object.keys(manifest.files).sort()) {
    const normalizedPath = assertSafeRelativePath(relativePath, 'package file path');
    if (normalizedPath !== relativePath) fail('invalid_installable_agent_package_manifest', 'package file paths must be canonical POSIX relative paths');
    files[relativePath] = normalizeFileEntry(relativePath, manifest.files[relativePath]);
  }
  if (!files[manifest.helperAbi.relativePath] || files[manifest.helperAbi.relativePath].sha256 !== manifest.helperAbi.sha256) {
    fail('installable_agent_package_manifest_incompatible', 'helper ABI digest is not bound by package files');
  }
  if (!files[manifest.toolProfiles.relativePath] || files[manifest.toolProfiles.relativePath].sha256 !== manifest.toolProfiles.sha256) {
    fail('installable_agent_package_manifest_incompatible', 'tool-profile digest is not bound by package files');
  }
  return canonicalClone({ ...manifest, files });
}

export async function verifyInstallableAgentRelease({ packageRoot, manifestPath = 'release-manifest.json' }) {
  if (typeof packageRoot !== 'string' || !path.isAbsolute(packageRoot)) fail('invalid_installable_agent_package_root', 'packageRoot must be absolute');
  const normalizedManifestPath = assertSafeRelativePath(manifestPath, 'manifestPath');
  const manifestBytes = await readFile(path.join(packageRoot, normalizedManifestPath));
  if (manifestBytes.byteLength > MAX_MANIFEST_BYTES) fail('installable_agent_package_manifest_too_large', 'Release manifest exceeds bounded size');
  let parsed;
  try { parsed = strictJsonParse(manifestBytes.toString('utf8'), { maxBytes: MAX_MANIFEST_BYTES }); }
  catch (cause) { fail('installable_agent_package_manifest_invalid', 'Release manifest is not bounded JSON', {}, { cause }); }
  const manifest = normalizeInstallableAgentReleaseManifest(parsed);
  for (const [relativePath, entry] of Object.entries(manifest.files)) {
    const fullPath = path.join(packageRoot, ...relativePath.split('/'));
    const fileStat = await stat(fullPath);
    if (!fileStat.isFile()) fail('installable_agent_package_file_mismatch', `Package payload is not a regular file: ${relativePath}`);
    const bytes = await readFile(fullPath);
    if (bytes.byteLength !== entry.bytes || sha256Hex(bytes) !== entry.sha256) {
      fail('installable_agent_package_file_mismatch', `Package payload digest/size mismatch: ${relativePath}`);
    }
  }
  return Object.freeze({
    manifest,
    manifestDigest: digest(manifest),
    packageRoot,
    verifiedFiles: Object.keys(manifest.files).length,
  });
}

async function atomicWriteJson(filePath, value) {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const bytes = Buffer.from(`${canonicalJson(value)}\n`);
  const handle = await open(tempPath, 'wx', 0o600);
  try {
    await handle.write(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tempPath, filePath);
  const directoryHandle = await open(directory, 'r');
  try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
}

async function readPackageState(filePath) {
  let bytes;
  try { bytes = await readFile(filePath); }
  catch (cause) { if (cause?.code === 'ENOENT') return null; throw cause; }
  if (bytes.byteLength > MAX_STATE_BYTES) fail('installable_agent_package_state_corrupt', 'Package state exceeds its bound');
  let value;
  try { value = strictJsonParse(bytes.toString('utf8').trimEnd(), { maxBytes: MAX_STATE_BYTES }); }
  catch (cause) { fail('installable_agent_package_state_corrupt', 'Package state is not bounded JSON', {}, { cause }); }
  assertRecordShape(value, [
    'schemaVersion', 'profile', 'releaseManifestDigest', 'sourceRevision', 'target', 'installedAt', 'localDisposition', 'authorityClaim',
  ], [], 'installable Agent package local state');
  if (value.schemaVersion !== INSTALLABLE_AGENT_PACKAGE_STATE_SCHEMA_VERSION || value.profile !== INSTALLABLE_AGENT_PACKAGE_PROFILE ||
      value.authorityClaim !== 'subordinate_evidence_only') fail('installable_agent_package_state_corrupt', 'Package state profile/authority claim is invalid');
  assertDigest(value.releaseManifestDigest, 'package state releaseManifestDigest');
  if (!SOURCE_REVISION_RE.test(value.sourceRevision) || typeof value.installedAt !== 'string' || typeof value.localDisposition !== 'string') {
    fail('installable_agent_package_state_corrupt', 'Package state fields are invalid');
  }
  return value;
}

function initialManagementJournal() {
  return {
    schemaVersion: INSTALLABLE_AGENT_MANAGEMENT_JOURNAL_SCHEMA_VERSION,
    profile: INSTALLABLE_AGENT_MANAGEMENT_JOURNAL_PROFILE,
    authorityClaim: 'subordinate_recovery_only',
    revision: 0,
    current: null,
    completed: {},
  };
}

function assertManagementRequestId(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512 || value.includes('\0')) {
    fail('invalid_installable_agent_management_request', 'managementRequestId must be bounded non-empty text');
  }
}

function secretExcludedProjection(value, key = '') {
  if (/(?:proof|secret|token|authorization|privatekey|apikey|authkey|credentialbytes|credentialmaterial)/i.test(key)) return '<secret-excluded>';
  if (Array.isArray(value)) return value.map((item) => secretExcludedProjection(item));
  if (value !== null && typeof value === 'object') {
    const projected = {};
    for (const name of Object.keys(value).sort()) projected[name] = secretExcludedProjection(value[name], name);
    return projected;
  }
  return value;
}

function managementRequestIdentity(request) {
  if (request === null || typeof request !== 'object' || Array.isArray(request)) fail('invalid_installable_agent_management_request', 'Management request must be a record');
  assertManagementRequestId(request.managementRequestId);
  assertDigest(request.intentDigest, 'management request intentDigest');
  assertDigest(request.expectedPredecessorDigest, 'management request expectedPredecessorDigest');
  return {
    managementRequestId: request.managementRequestId,
    intentDigest: request.intentDigest,
    expectedPredecessorDigest: request.expectedPredecessorDigest,
    requestProjectionDigest: digest(secretExcludedProjection(request)),
  };
}

function assertJournalSafeResponse(value, label = 'management response') {
  if (Array.isArray(value)) {
    for (const item of value) assertJournalSafeResponse(item, label);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (/(?:proof|secret|token|authorization|privatekey|apikey|authkey|credentialbytes|credentialmaterial)/i.test(key)) {
      fail('installable_agent_management_response_contains_secret', `${label} contains a secret-bearing field that cannot enter the local journal`, { key });
    }
    assertJournalSafeResponse(child, `${label}.${key}`);
  }
}

async function readManagementJournal(filePath) {
  let bytes;
  try { bytes = await readFile(filePath); }
  catch (cause) { if (cause?.code === 'ENOENT') return initialManagementJournal(); throw cause; }
  if (bytes.byteLength > MAX_MANAGEMENT_JOURNAL_BYTES) fail('installable_agent_management_journal_corrupt', 'Management lifecycle journal exceeds its bound');
  let value;
  try { value = strictJsonParse(bytes.toString('utf8').trimEnd(), { maxBytes: MAX_MANAGEMENT_JOURNAL_BYTES }); }
  catch (cause) { fail('installable_agent_management_journal_corrupt', 'Management lifecycle journal is not bounded JSON', {}, { cause }); }
  assertRecordShape(value, ['schemaVersion', 'profile', 'authorityClaim', 'revision', 'current', 'completed'], [], 'installable Agent management lifecycle journal');
  if (value.schemaVersion !== INSTALLABLE_AGENT_MANAGEMENT_JOURNAL_SCHEMA_VERSION || value.profile !== INSTALLABLE_AGENT_MANAGEMENT_JOURNAL_PROFILE ||
      value.authorityClaim !== 'subordinate_recovery_only' || !Number.isSafeInteger(value.revision) || value.revision < 0) {
    fail('installable_agent_management_journal_corrupt', 'Management lifecycle journal identity is invalid');
  }
  if (value.completed === null || typeof value.completed !== 'object' || Array.isArray(value.completed) || Object.keys(value.completed).length > MAX_MANAGEMENT_JOURNAL_COMPLETED) {
    fail('installable_agent_management_journal_corrupt', 'Management lifecycle journal completed receipts are invalid or unbounded');
  }
  if (value.current !== null && (typeof value.current !== 'object' || Array.isArray(value.current))) {
    fail('installable_agent_management_journal_corrupt', 'Management lifecycle journal current transaction is invalid');
  }
  return value;
}

function sameManagementIdentity(entry, identity, operation) {
  return entry.operation === operation &&
    entry.managementRequestId === identity.managementRequestId &&
    entry.intentDigest === identity.intentDigest &&
    entry.expectedPredecessorDigest === identity.expectedPredecessorDigest &&
    entry.requestProjectionDigest === identity.requestProjectionDigest;
}

function managementResponseIsTerminal(response) {
  if (response.terminal === false) return false;
  if (typeof response.phase === 'string' && NONTERMINAL_MANAGEMENT_PHASES.has(response.phase)) return false;
  return true;
}

function ownerManagementRequest(request) {
  const owner = {
    managementRequestId: request.managementRequestId,
    intentDigest: request.intentDigest,
    expectedPredecessorDigest: request.expectedPredecessorDigest,
  };
  if (Object.hasOwn(request, 'managementProof')) owner.managementProof = request.managementProof;
  return owner;
}

function normalizeControlConfigBase(input) {
  assertRecordShape(input, [
    'agentId', 'routeGeneration', 'executorId', 'executorEpoch', 'agentDeliveryUrl', 'credentialRef', 'protocolMetadataDigest', 'reportedCapacity',
  ], ['reconnectDelayMs'], 'installable Agent control config base');
  assertIdentifier(input.agentId, 'controlConfig.agentId');
  assertSafeInteger(input.routeGeneration, 'controlConfig.routeGeneration', { min: 1 });
  assertIdentifier(input.executorId, 'controlConfig.executorId');
  assertSafeInteger(input.executorEpoch, 'controlConfig.executorEpoch', { min: 1 });
  let endpoint;
  try { endpoint = new URL(input.agentDeliveryUrl); }
  catch (cause) { fail('invalid_installable_agent_control_config', 'controlConfig.agentDeliveryUrl is invalid', {}, { cause }); }
  if (!['ws:', 'wss:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.hash) {
    fail('invalid_installable_agent_control_config', 'controlConfig.agentDeliveryUrl must be ws/wss without embedded credentials or fragment');
  }
  if (typeof input.credentialRef !== 'string' || !path.isAbsolute(input.credentialRef)) {
    fail('invalid_installable_agent_control_config', 'controlConfig.credentialRef must be an absolute external reference');
  }
  assertDigest(input.protocolMetadataDigest, 'controlConfig.protocolMetadataDigest');
  assertSafeInteger(input.reportedCapacity, 'controlConfig.reportedCapacity', { min: 0, max: 1024 });
  if (input.reconnectDelayMs !== undefined) assertSafeInteger(input.reconnectDelayMs, 'controlConfig.reconnectDelayMs', { min: 100, max: 60_000 });
  return canonicalClone({ ...input, agentDeliveryUrl: endpoint.toString() });
}

function materializeControlConfig(base, stateDirectory, currentTuple) {
  if (currentTuple === null || typeof currentTuple !== 'object' || Array.isArray(currentTuple)) {
    fail('installable_agent_management_response_invalid', 'Committed lifecycle response does not contain a D0027 current tuple');
  }
  return canonicalClone({
    schemaVersion: 1,
    profile: 'tdev.installable-agent-control.v1',
    ...base,
    stateDirectory,
    installableAgentTuple: currentTuple,
  });
}

function localEvidenceEnvelope(type, release, observed) {
  return canonicalClone({
    profile: 'tdev.installable-agent-local-evidence.v1',
    type,
    releaseManifestDigest: release.manifestDigest,
    sourceRevision: release.manifest.sourceRevision,
    serviceHostProfile: release.manifest.serviceHostProfile,
    observed,
  });
}

function stableDrainRequestId(operation, bindingDigest) {
  return digest({ profile: 'tdev.installable-agent-drain-request.v1', operation, bindingDigest });
}

export class InstallableAgentPackageManager {
  constructor({ packageRoot, stateDirectory, managementTransport = null, serviceController = null, clock = () => new Date().toISOString() }) {
    if (typeof packageRoot !== 'string' || !path.isAbsolute(packageRoot)) fail('invalid_installable_agent_package_root', 'packageRoot must be absolute');
    if (typeof stateDirectory !== 'string' || !path.isAbsolute(stateDirectory)) fail('invalid_installable_agent_package_state', 'stateDirectory must be absolute');
    if (managementTransport !== null && typeof managementTransport.invoke !== 'function') fail('invalid_installable_agent_management_transport', 'managementTransport must expose invoke()');
    if (serviceController !== null && (typeof serviceController.install !== 'function' || typeof serviceController.status !== 'function')) fail('invalid_installable_agent_service_controller', 'serviceController must expose install/status');
    if (typeof clock !== 'function') fail('invalid_installable_agent_package_clock', 'clock must be a function');
    this.packageRoot = packageRoot;
    this.stateDirectory = stateDirectory;
    this.statePath = path.join(stateDirectory, 'package-state.json');
    this.managementJournalPath = path.join(stateDirectory, 'management-journal.json');
    this.managementTransport = managementTransport;
    this.serviceController = serviceController;
    this.clock = clock;
  }

  async verify() {
    return verifyInstallableAgentRelease({ packageRoot: this.packageRoot });
  }

  async install() {
    const release = await this.verify();
    const prior = await readPackageState(this.statePath);
    if (prior !== null) {
      if (prior.releaseManifestDigest !== release.manifestDigest) fail('installable_agent_package_install_conflict', 'A different release is already installed in this local state directory');
      if (this.serviceController !== null) await this.serviceController.install({ packageRoot: this.packageRoot, stateDirectory: this.stateDirectory, manifest: release.manifest });
      return Object.freeze({ classification: 'exact_replay', state: canonicalClone(prior), release });
    }
    if (this.serviceController !== null) await this.serviceController.install({ packageRoot: this.packageRoot, stateDirectory: this.stateDirectory, manifest: release.manifest });
    const localState = {
      schemaVersion: INSTALLABLE_AGENT_PACKAGE_STATE_SCHEMA_VERSION,
      profile: INSTALLABLE_AGENT_PACKAGE_PROFILE,
      releaseManifestDigest: release.manifestDigest,
      sourceRevision: release.manifest.sourceRevision,
      target: canonicalClone(release.manifest.target),
      installedAt: this.clock(),
      localDisposition: 'installed_not_current',
      authorityClaim: 'subordinate_evidence_only',
    };
    await atomicWriteJson(this.statePath, localState);
    return Object.freeze({ classification: 'accepted', state: canonicalClone(localState), release });
  }

  async status() {
    const release = await this.verify();
    const localState = await readPackageState(this.statePath);
    const service = this.serviceController === null ? { classification: 'unconfigured' } : await this.serviceController.status({ stateDirectory: this.stateDirectory });
    const journal = await readManagementJournal(this.managementJournalPath);
    const managementJournal = {
      schemaVersion: journal.schemaVersion,
      profile: journal.profile,
      authorityClaim: journal.authorityClaim,
      revision: journal.revision,
      current: journal.current === null ? null : {
        operation: journal.current.operation,
        managementRequestId: journal.current.managementRequestId,
        phase: journal.current.phase,
      },
      completedCount: Object.keys(journal.completed).length,
    };
    let authority = { classification: 'unconfigured', proofLayer: 'provider_security_unverified' };
    if (this.managementTransport !== null) authority = await this.managementTransport.invoke('status', { releaseManifestDigest: release.manifestDigest });
    return Object.freeze({ release, localState: canonicalClone(localState), service: canonicalClone(service), managementJournal, authority: canonicalClone(authority) });
  }

  async #prepareManagement(operation, request) {
    if (this.managementTransport === null) fail('installable_agent_management_transport_unconfigured', `D0027 ${operation} requires deployment-owned authenticated management transport`);
    const release = await this.verify();
    const identity = managementRequestIdentity(request);
    let journal = await readManagementJournal(this.managementJournalPath);
    const completed = journal.completed[identity.managementRequestId];
    if (completed !== undefined) {
      if (!sameManagementIdentity(completed, identity, operation)) fail('installable_agent_management_request_conflict', 'Completed managementRequestId was reused with changed intent, predecessor or operation');
      return Object.freeze({ completed: canonicalClone(completed.result), release, identity });
    }

    const localState = await readPackageState(this.statePath);
    if (localState === null) fail('installable_agent_package_not_installed', 'Management mutation requires an installed local package state');
    let localElectionDigest;
    let bindingDigest;

    if (journal.current !== null) {
      if (!sameManagementIdentity(journal.current, identity, operation) || journal.current.releaseManifestDigest !== release.manifestDigest) {
        fail('installable_agent_management_transaction_in_progress', 'Another management transaction is nonterminal for this installation');
      }
      localElectionDigest = journal.current.localElectionDigest;
      bindingDigest = journal.current.bindingDigest;
    } else {
      localElectionDigest = digest({
        installedReleaseManifestDigest: localState.releaseManifestDigest,
        candidateReleaseManifestDigest: release.manifestDigest,
        candidateSourceRevision: release.manifest.sourceRevision,
        serviceHostProfile: release.manifest.serviceHostProfile,
        target: release.manifest.target,
      });
      bindingDigest = digest({ operation, ...identity, localElectionDigest });
      if (Object.keys(journal.completed).length >= MAX_MANAGEMENT_JOURNAL_COMPLETED) {
        fail('installable_agent_management_journal_capacity', 'Management journal is full; unsafe receipt compaction is not permitted');
      }
      journal.current = {
        operation,
        ...identity,
        bindingDigest,
        localElectionDigest,
        releaseManifestDigest: release.manifestDigest,
        phase: 'prepared',
        preparedAt: this.clock(),
        lastObservedResultDigest: null,
      };
      journal.revision += 1;
      await atomicWriteJson(this.managementJournalPath, journal);
    }
    return Object.freeze({ operation, request, release, identity, localState, localElectionDigest, bindingDigest, completed: null });
  }

  async #setManagementPhase(context, phase, observed = null) {
    const journal = await readManagementJournal(this.managementJournalPath);
    if (journal.current === null || journal.current.bindingDigest !== context.bindingDigest) {
      fail('installable_agent_management_journal_conflict', 'Management journal changed while lifecycle orchestration was in flight');
    }
    journal.current.phase = phase;
    journal.current.lastObservedAt = this.clock();
    if (observed !== null) journal.current.lastObservedResultDigest = digest(observed);
    journal.revision += 1;
    await atomicWriteJson(this.managementJournalPath, journal);
  }

  async #invokeTransport(operation, input) {
    const response = await this.managementTransport.invoke(operation, canonicalClone(input));
    if (response === null || typeof response !== 'object' || Array.isArray(response)) fail('installable_agent_management_response_invalid', 'Management transport returned an invalid response');
    const result = canonicalClone(response);
    assertJournalSafeResponse(result);
    return Object.freeze(result);
  }

  async #finishManagement(context, result) {
    assertJournalSafeResponse(result);
    const journal = await readManagementJournal(this.managementJournalPath);
    if (journal.current === null || journal.current.bindingDigest !== context.bindingDigest) {
      fail('installable_agent_management_journal_conflict', 'Management journal changed before terminal receipt commit');
    }
    journal.completed[context.identity.managementRequestId] = {
      operation: context.operation,
      ...context.identity,
      bindingDigest: context.bindingDigest,
      localElectionDigest: context.localElectionDigest,
      releaseManifestDigest: context.release.manifestDigest,
      resultDigest: digest(result),
      result: canonicalClone(result),
      completedAt: this.clock(),
    };
    journal.current = null;
    journal.revision += 1;
    await atomicWriteJson(this.managementJournalPath, journal);
    return Object.freeze(canonicalClone(result));
  }

  async #management(operation, request) {
    const context = await this.#prepareManagement(operation, request);
    if (context.completed !== null) return Object.freeze(context.completed);
    await this.#setManagementPhase(context, 'submitted');
    const result = await this.#invokeTransport(operation, request);
    if (!managementResponseIsTerminal(result)) {
      await this.#setManagementPhase(context, 'awaiting_terminal', result);
      return result;
    }
    return this.#finishManagement(context, result);
  }

  #requireServiceController(methods) {
    if (this.serviceController === null) fail('installable_agent_service_controller_unconfigured', 'D0027 lifecycle mutation requires the package-owned service controller');
    for (const method of methods) {
      if (typeof this.serviceController[method] !== 'function') fail('invalid_installable_agent_service_controller', `serviceController must expose ${method}()`);
    }
  }

  async #recordLocalEvidence(context, type, observed) {
    const localEvidence = localEvidenceEnvelope(type, context.release, observed);
    const evidenceDigest = digest(localEvidence);
    await this.#setManagementPhase(context, `evidence_${type}`, { evidenceDigest });
    return this.#invokeTransport('recordInstallableAgentTransactionEvidence', {
      managementRequestId: context.identity.managementRequestId,
      type,
      evidenceDigest,
      localEvidence,
    });
  }

  async register(request) {
    const response = await this.#management('register', request);
    if (response.currentTuple !== undefined && request.controlConfig !== undefined) {
      this.#requireServiceController(['start', 'activateControl']);
      const base = normalizeControlConfigBase(request.controlConfig);
      await this.serviceController.start({ stateDirectory: this.stateDirectory });
      const localControl = await this.serviceController.activateControl({
        stateDirectory: this.stateDirectory,
        controlConfig: materializeControlConfig(base, this.stateDirectory, response.currentTuple),
      });
      return Object.freeze({ ...response, localControl: canonicalClone(localControl) });
    }
    return response;
  }

  async start(request) {
    this.#requireServiceController(['start', 'activateControl']);
    const controlBase = normalizeControlConfigBase(request.controlConfig);
    const context = await this.#prepareManagement('start', request);
    if (context.completed !== null) return Object.freeze(context.completed);
    const ownerRequest = ownerManagementRequest(request);
    await this.#setManagementPhase(context, 'authority_prepare');
    let committed = await this.#invokeTransport('prepareBaseStart', ownerRequest);
    if (committed.phase !== 'committed') {
      if (committed.phase !== 'preparing') fail('installable_agent_management_response_invalid', 'prepareBaseStart did not return preparing or committed phase');
      const localService = await this.serviceController.start({ stateDirectory: this.stateDirectory });
      await this.#recordLocalEvidence(context, 'local_service_ready', localService);
      await this.#setManagementPhase(context, 'authority_commit');
      committed = await this.#invokeTransport('commitBaseStart', ownerRequest);
    } else {
      await this.serviceController.start({ stateDirectory: this.stateDirectory });
    }
    if (committed.phase !== 'committed' || committed.currentTuple === undefined) {
      fail('installable_agent_management_response_invalid', 'base start did not commit an exact current tuple');
    }
    await this.#setManagementPhase(context, 'authority_committed', committed);
    const localControl = await this.serviceController.activateControl({
      stateDirectory: this.stateDirectory,
      controlConfig: materializeControlConfig(controlBase, this.stateDirectory, committed.currentTuple),
    });
    return this.#finishManagement(context, { ...committed, localControl: canonicalClone(localControl) });
  }

  async stop(request) {
    this.#requireServiceController(['quiesceAndStop']);
    const context = await this.#prepareManagement('stop', request);
    if (context.completed !== null) return Object.freeze(context.completed);
    const ownerRequest = ownerManagementRequest(request);
    await this.#setManagementPhase(context, 'authority_fence');
    let completed = await this.#invokeTransport('beginBaseStop', ownerRequest);
    if (completed.phase !== 'completed') {
      if (completed.phase !== 'draining') fail('installable_agent_management_response_invalid', 'beginBaseStop did not return draining or completed phase');
      const local = await this.serviceController.quiesceAndStop({
        stateDirectory: this.stateDirectory,
        drainRequestId: stableDrainRequestId('base_stop', context.bindingDigest),
      });
      await this.#recordLocalEvidence(context, 'positive_quiescence', local.positiveQuiescence);
      await this.#recordLocalEvidence(context, 'service_stopped', local.serviceStopped);
      await this.#setManagementPhase(context, 'authority_complete');
      completed = await this.#invokeTransport('completeBaseStop', ownerRequest);
      if (completed.phase !== 'completed') fail('installable_agent_management_response_invalid', 'base stop did not reach completed phase');
      return this.#finishManagement(context, { ...completed, localService: canonicalClone(local) });
    }
    return this.#finishManagement(context, completed);
  }

  async update(request) {
    this.#requireServiceController(['quiesceAndStop', 'stageRelease', 'activateControl']);
    const controlBase = normalizeControlConfigBase(request.controlConfig);
    const context = await this.#prepareManagement('update', request);
    if (context.completed !== null) return Object.freeze(context.completed);
    if (!['package_update', 'package_rollback'].includes(request.transitionCause)) fail('invalid_package_transition', 'update transitionCause must be package_update or package_rollback');
    assertDigest(request.packageTrustSubjectDigest, 'packageTrustSubjectDigest');
    const ownerBase = ownerManagementRequest(request);
    const beginRequest = {
      ...ownerBase,
      transitionCause: request.transitionCause,
      packageManifestDigest: context.release.manifestDigest,
      packageTrustSubjectDigest: request.packageTrustSubjectDigest,
    };
    await this.#setManagementPhase(context, 'authority_fence');
    let committed = await this.#invokeTransport('beginPackageActivation', beginRequest);
    if (committed.phase !== 'committed') {
      if (committed.phase !== 'draining') fail('installable_agent_management_response_invalid', 'beginPackageActivation did not return draining or committed phase');
      const localQuiescence = await this.serviceController.quiesceAndStop({
        stateDirectory: this.stateDirectory,
        drainRequestId: stableDrainRequestId(request.transitionCause, context.bindingDigest),
      });
      await this.#recordLocalEvidence(context, 'positive_quiescence', localQuiescence.positiveQuiescence);
      await this.#recordLocalEvidence(context, 'package_verified', {
        manifestDigest: context.release.manifestDigest,
        verifiedFiles: context.release.verifiedFiles,
        sourceRevision: context.release.manifest.sourceRevision,
      });
      const localService = await this.serviceController.stageRelease({
        packageRoot: this.packageRoot,
        stateDirectory: this.stateDirectory,
        manifest: context.release.manifest,
      });
      await this.#recordLocalEvidence(context, 'local_service_ready', localService);
      await this.#setManagementPhase(context, 'authority_commit');
      committed = await this.#invokeTransport('commitPackageActivation', ownerBase);
    } else {
      await this.serviceController.stageRelease({ packageRoot: this.packageRoot, stateDirectory: this.stateDirectory, manifest: context.release.manifest });
    }
    if (committed.phase !== 'committed' || committed.currentTuple === undefined) fail('installable_agent_management_response_invalid', 'package activation did not commit an exact current tuple');
    await this.#setManagementPhase(context, 'authority_committed', committed);
    await atomicWriteJson(this.statePath, {
      schemaVersion: INSTALLABLE_AGENT_PACKAGE_STATE_SCHEMA_VERSION,
      profile: INSTALLABLE_AGENT_PACKAGE_PROFILE,
      releaseManifestDigest: context.release.manifestDigest,
      sourceRevision: context.release.manifest.sourceRevision,
      target: canonicalClone(context.release.manifest.target),
      installedAt: this.clock(),
      localDisposition: 'installed_release',
      authorityClaim: 'subordinate_evidence_only',
    });
    const localControl = await this.serviceController.activateControl({
      stateDirectory: this.stateDirectory,
      controlConfig: materializeControlConfig(controlBase, this.stateDirectory, committed.currentTuple),
    });
    return this.#finishManagement(context, { ...committed, localControl: canonicalClone(localControl) });
  }

  async uninstall(request) {
    this.#requireServiceController(['quiesceAndStop', 'uninstall']);
    const context = await this.#prepareManagement('uninstall', request);
    let revoked;
    if (context.completed !== null) {
      revoked = context.completed;
    } else {
      const ownerRequest = ownerManagementRequest(request);
      await this.#setManagementPhase(context, 'authority_fence');
      revoked = await this.#invokeTransport('beginInstallableAgentUninstall', ownerRequest);
      if (revoked.phase !== 'revoked') {
        if (revoked.phase !== 'draining') fail('installable_agent_management_response_invalid', 'beginInstallableAgentUninstall did not return draining or revoked phase');
        const local = await this.serviceController.quiesceAndStop({
          stateDirectory: this.stateDirectory,
          drainRequestId: stableDrainRequestId('uninstall', context.bindingDigest),
        });
        await this.#recordLocalEvidence(context, 'positive_quiescence', local.positiveQuiescence);
        await this.#recordLocalEvidence(context, 'service_stopped', local.serviceStopped);
        await this.#setManagementPhase(context, 'authority_complete');
        revoked = await this.#invokeTransport('completeInstallableAgentUninstall', ownerRequest);
      }
      if (revoked.phase !== 'revoked' || revoked.deletionBarrier !== 'authority_revoked_replay_fences_retained') {
        fail('installable_agent_uninstall_not_revoked', 'Local payload deletion is forbidden before authoritative uninstall revocation/deletion barrier');
      }
      await this.#setManagementPhase(context, 'authority_revoked', revoked);
      revoked = await this.#finishManagement(context, revoked);
    }
    if (revoked.phase !== 'revoked' || revoked.deletionBarrier !== 'authority_revoked_replay_fences_retained') {
      fail('installable_agent_uninstall_not_revoked', 'Completed uninstall receipt does not retain the authoritative deletion barrier');
    }
    await this.serviceController.uninstall({ stateDirectory: this.stateDirectory, authorityResponse: revoked });
    await rm(this.statePath, { force: true });
    return revoked;
  }
}
