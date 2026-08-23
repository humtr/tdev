#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { normalizeInstallableAgentDataPlaneTuple } from './installable-agent-admission.mjs';
import {
  normalizeAndroidSourceLineageId,
  normalizeConnectPossessionContext,
  parseInstallableAgentConnectRequestId,
  parseInstallableAgentCredentialRef,
} from './installable-agent-security.mjs';
import {
  LocalAgentRuntime,
  LocalAgentWebSocketTransport,
  createLocalExecutionStartError,
} from './local-agent-runtime.mjs';
import {
  InstallableAgentSupervisorServiceClient,
  createInstallableAgentSupervisorServiceExecutionAdapter,
} from './installable-agent-supervisor-service.mjs';
import { termuxInstallableAgentServiceLayout } from './installable-agent-termux-service.mjs';
import { verifyInstallableAgentRelease } from './installable-agent-package.mjs';

export const INSTALLABLE_AGENT_CONTROL_PROFILE = 'tdev.installable-agent-control.v1';
export const INSTALLABLE_AGENT_CONTROL_CONNECTION_SCHEMA_VERSION = 2;
export const INSTALLABLE_AGENT_CONTROL_CONNECTION_PROFILE = 'tdev.installable-agent-control-connection.v1';
export const INSTALLABLE_AGENT_TOOL_PROFILES_PROFILE = 'tdev.installable-agent-tool-profiles.v1';
export const INSTALLABLE_AGENT_TOOL_PROFILES_SCHEMA_VERSION = 1;
export const INSTALLABLE_AGENT_TOOL_PROFILES_RELATIVE_PATH = 'config/installable-agent-tool-profiles.json';

const MAX_CONFIG_BYTES = 1024 * 1024;
const MAX_CREDENTIAL_BYTES = 16 * 1024;
const MAX_TOOL_PROFILE_BYTES = 1024 * 1024;
const MAX_ARGUMENT_BYTES = 64 * 1024;
const DEFAULT_RECONNECT_DELAY_MS = 1000;

function fail(code, message, details = undefined, options = undefined) {
  throw new ContractError(code, message, details, options);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function boundedText(value, label, maxBytes = MAX_ARGUMENT_BYTES) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || Buffer.byteLength(value) > maxBytes) {
    fail('invalid_installable_agent_control_config', `${label} is invalid or outside its byte bound`);
  }
  return value;
}

function absolutePath(value, label) {
  boundedText(value, label, 4096);
  if (!path.isAbsolute(value)) fail('invalid_installable_agent_control_config', `${label} must be an absolute path`);
  return path.resolve(value);
}

export function normalizeInstallableAgentControlConfig(input) {
  assertRecordShape(input, [
    'schemaVersion', 'profile', 'agentId', 'routeGeneration', 'executorId', 'executorEpoch', 'agentDeliveryUrl',
    'stateDirectory', 'credentialRef', 'installableAgentTuple', 'protocolMetadataDigest', 'reportedCapacity',
  ], ['reconnectDelayMs', 'androidSourceLineageId'], 'installable Agent control config');
  if (input.schemaVersion !== 1 || input.profile !== INSTALLABLE_AGENT_CONTROL_PROFILE) {
    fail('installable_agent_control_config_incompatible', 'Installable Agent control config profile/schema is unsupported');
  }
  assertIdentifier(input.agentId, 'agentId');
  assertSafeInteger(input.routeGeneration, 'routeGeneration', { min: 1 });
  assertIdentifier(input.executorId, 'executorId');
  assertSafeInteger(input.executorEpoch, 'executorEpoch', { min: 1 });
  const endpoint = new URL(input.agentDeliveryUrl);
  if (!['ws:', 'wss:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.hash) {
    fail('invalid_installable_agent_control_config', 'agentDeliveryUrl must be ws/wss without embedded credentials or fragment');
  }
  const stateDirectory = absolutePath(input.stateDirectory, 'stateDirectory');
  let credentialRef;
  let androidSourceLineageId = null;
  if (typeof input.credentialRef === 'string' && input.credentialRef.startsWith('androidkeystore://')) {
    parseInstallableAgentCredentialRef(input.credentialRef);
    credentialRef = input.credentialRef;
    if (input.androidSourceLineageId === undefined) fail('invalid_installable_agent_control_config', 'AndroidKeyStore control config requires pinned androidSourceLineageId');
    androidSourceLineageId = normalizeAndroidSourceLineageId(input.androidSourceLineageId);
  } else {
    credentialRef = absolutePath(input.credentialRef, 'credentialRef');
    if (input.androidSourceLineageId !== undefined) fail('invalid_installable_agent_control_config', 'Legacy file credential cannot carry Android source-lineage authority');
  }
  const installableAgentTuple = normalizeInstallableAgentDataPlaneTuple(input.installableAgentTuple);
  assertDigest(input.protocolMetadataDigest, 'protocolMetadataDigest');
  assertSafeInteger(input.reportedCapacity, 'reportedCapacity', { min: 0, max: 1024 });
  const reconnectDelayMs = input.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;
  assertSafeInteger(reconnectDelayMs, 'reconnectDelayMs', { min: 100, max: 60_000 });
  return Object.freeze({
    schemaVersion: 1,
    profile: INSTALLABLE_AGENT_CONTROL_PROFILE,
    agentId: input.agentId,
    routeGeneration: input.routeGeneration,
    executorId: input.executorId,
    executorEpoch: input.executorEpoch,
    agentDeliveryUrl: endpoint.toString(),
    stateDirectory,
    credentialRef,
    ...(androidSourceLineageId === null ? {} : { androidSourceLineageId }),
    installableAgentTuple,
    protocolMetadataDigest: input.protocolMetadataDigest,
    reportedCapacity: input.reportedCapacity,
    reconnectDelayMs,
  });
}

export async function readInstallableAgentControlConfig(configPath) {
  const resolved = absolutePath(configPath, 'configPath');
  const bytes = await readFile(resolved);
  if (bytes.byteLength > MAX_CONFIG_BYTES) fail('installable_agent_control_config_too_large', 'Installable Agent control config exceeds its bound');
  let parsed;
  try { parsed = strictJsonParse(bytes.toString('utf8'), { maxBytes: MAX_CONFIG_BYTES }); }
  catch (cause) { fail('installable_agent_control_config_invalid', 'Installable Agent control config is not bounded JSON', {}, { cause }); }
  return normalizeInstallableAgentControlConfig(parsed);
}

async function readCredentialFile(credentialRef) {
  const fileStat = await stat(credentialRef);
  if (!fileStat.isFile()) fail('installable_agent_credential_unavailable', 'Credential reference is not a regular file');
  if ((fileStat.mode & 0o077) !== 0) fail('installable_agent_credential_permissions', 'Credential file must not grant group/other permissions');
  const bytes = await readFile(credentialRef);
  if (bytes.byteLength < 32 || bytes.byteLength > MAX_CREDENTIAL_BYTES) fail('installable_agent_credential_unavailable', 'Credential material is outside the supported byte bound');
  let value = bytes.toString('utf8');
  if (value.endsWith('\n')) value = value.slice(0, -1);
  if (value.endsWith('\r')) value = value.slice(0, -1);
  if (value.length < 32 || value.includes('\0')) fail('installable_agent_credential_unavailable', 'Credential material is invalid');
  return value;
}

function normalizeToolProfiles(input) {
  assertRecordShape(input, ['schemaVersion', 'profile', 'profiles'], [], 'installable Agent tool-profile manifest');
  if (input.schemaVersion !== INSTALLABLE_AGENT_TOOL_PROFILES_SCHEMA_VERSION || input.profile !== INSTALLABLE_AGENT_TOOL_PROFILES_PROFILE) {
    fail('installable_agent_tool_profiles_incompatible', 'Tool-profile manifest profile/schema is unsupported');
  }
  if (input.profiles === null || typeof input.profiles !== 'object' || Array.isArray(input.profiles) || Object.keys(input.profiles).length === 0) {
    fail('installable_agent_tool_profiles_invalid', 'At least one package-owned tool profile is required');
  }
  const profiles = {};
  for (const name of Object.keys(input.profiles).sort()) {
    assertIdentifier(name, 'tool profile name');
    const profile = input.profiles[name];
    assertRecordShape(profile, ['executable', 'argv', 'stdin', 'environment', 'limits', 'network', 'filesystem', 'cleanupDomain'], [], `tool profile ${name}`);
    assertRecordShape(profile.executable, ['kind'], [], `tool profile ${name}.executable`);
    if (profile.executable.kind !== 'node_runtime') fail('installable_agent_tool_profile_unsupported', 'Revision-1 baseline supports only the package-declared Node runtime executable identity');
    if (!Array.isArray(profile.argv) || profile.argv.length > 64) fail('installable_agent_tool_profiles_invalid', `tool profile ${name}.argv is invalid`);
    const argv = profile.argv.map((entry, index) => {
      assertRecordShape(entry, ['kind', 'value'], [], `tool profile ${name}.argv[${index}]`);
      if (entry.kind !== 'literal') fail('installable_agent_tool_profile_unsupported', 'Revision-1 baseline tool profile arguments must be package-fixed literals');
      return Object.freeze({ kind: 'literal', value: boundedText(entry.value, `tool profile ${name}.argv[${index}].value`) });
    });
    assertRecordShape(profile.stdin, ['kind'], [], `tool profile ${name}.stdin`);
    if (profile.stdin.kind !== 'none') fail('installable_agent_tool_profile_unsupported', 'Revision-1 baseline tool profile stdin must be package-fixed none');
    if (profile.environment === null || typeof profile.environment !== 'object' || Array.isArray(profile.environment) || Object.keys(profile.environment).length !== 0) {
      fail('installable_agent_tool_profile_unsupported', 'Revision-1 baseline tool profile environment must be empty');
    }
    assertRecordShape(profile.limits, ['timeoutMs', 'maxOutputBytes'], [], `tool profile ${name}.limits`);
    assertSafeInteger(profile.limits.timeoutMs, `tool profile ${name}.limits.timeoutMs`, { min: 100, max: 60_000 });
    assertSafeInteger(profile.limits.maxOutputBytes, `tool profile ${name}.limits.maxOutputBytes`, { min: 1, max: 4 * 1024 * 1024 });
    if (profile.network !== 'none' || profile.filesystem !== 'none' || profile.cleanupDomain !== 'warden_process_group') {
      fail('installable_agent_tool_profile_unsupported', 'Revision-1 baseline diagnostic profile must expose no Task-selected network/filesystem authority and remain warden-contained');
    }
    profiles[name] = Object.freeze({
      executable: Object.freeze({ kind: 'node_runtime' }),
      argv: Object.freeze(argv),
      stdin: Object.freeze({ kind: 'none' }),
      environment: Object.freeze({}),
      limits: Object.freeze({ timeoutMs: profile.limits.timeoutMs, maxOutputBytes: profile.limits.maxOutputBytes }),
      network: 'none',
      filesystem: 'none',
      cleanupDomain: 'warden_process_group',
    });
  }
  return Object.freeze({ schemaVersion: input.schemaVersion, profile: input.profile, profiles: Object.freeze(profiles) });
}

async function loadReleaseToolProfiles(packageRoot, release) {
  const binding = release.manifest.toolProfiles;
  const relativePath = binding.relativePath;
  const bytes = await readFile(path.join(packageRoot, ...relativePath.split('/')));
  if (bytes.byteLength > MAX_TOOL_PROFILE_BYTES || sha256(bytes) !== binding.sha256) {
    fail('installable_agent_tool_profiles_mismatch', 'Package-owned tool-profile manifest does not match release binding');
  }
  let parsed;
  try { parsed = strictJsonParse(bytes.toString('utf8'), { maxBytes: MAX_TOOL_PROFILE_BYTES }); }
  catch (cause) { fail('installable_agent_tool_profiles_invalid', 'Tool-profile manifest is not bounded JSON', {}, { cause }); }
  return normalizeToolProfiles(parsed);
}

function resolveToolProfile(toolProfiles, executableBody) {
  assertRecordShape(executableBody, ['profile', 'arguments'], [], 'installable Agent executableBody');
  assertIdentifier(executableBody.profile, 'executableBody.profile');
  if (executableBody.arguments === null || typeof executableBody.arguments !== 'object' || Array.isArray(executableBody.arguments) || Object.keys(executableBody.arguments).length !== 0) {
    fail('installable_agent_tool_arguments_denied', 'Revision-1 baseline package profiles do not admit Task-selected executable arguments');
  }
  const selected = toolProfiles.profiles[executableBody.profile];
  if (!selected) fail('installable_agent_tool_profile_unknown', 'Task selected a tool profile that is not bound by this release');
  return Object.freeze({
    command: process.execPath,
    args: selected.argv.map((entry) => entry.value),
    cwd: null,
    env: {},
    stdin: null,
    timeoutMs: selected.limits.timeoutMs,
    maxOutputBytes: selected.limits.maxOutputBytes,
  });
}

function initialConnectionState() {
  return {
    schemaVersion: INSTALLABLE_AGENT_CONTROL_CONNECTION_SCHEMA_VERSION,
    profile: INSTALLABLE_AGENT_CONTROL_CONNECTION_PROFILE,
    authorityClaim: 'subordinate_transport_recovery_only',
    revision: 0,
    lastConnectionEpoch: 0,
    lastConnectRequestSequence: 0,
    pending: null,
  };
}

async function atomicWriteJson(filePath, value) {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await handle.write(`${canonicalJson(value)}\n`);
    await handle.sync();
  } finally { await handle.close(); }
  await rename(temporary, filePath);
  const directoryHandle = await open(directory, 'r');
  try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
}

async function readConnectionState(filePath) {
  let bytes;
  try { bytes = await readFile(filePath); }
  catch (cause) { if (cause?.code === 'ENOENT') return initialConnectionState(); throw cause; }
  if (bytes.byteLength > MAX_CONFIG_BYTES) fail('installable_agent_control_state_corrupt', 'Control connection state exceeds its bound');
  let value;
  try { value = strictJsonParse(bytes.toString('utf8').trimEnd(), { maxBytes: MAX_CONFIG_BYTES }); }
  catch (cause) { fail('installable_agent_control_state_corrupt', 'Control connection state is not bounded JSON', {}, { cause }); }
  if (value?.schemaVersion === 1) {
    assertRecordShape(value, ['schemaVersion', 'profile', 'authorityClaim', 'revision', 'lastConnectionEpoch', 'pending'], [], 'legacy installable Agent control connection state');
    if (value.profile !== INSTALLABLE_AGENT_CONTROL_CONNECTION_PROFILE || value.authorityClaim !== 'subordinate_transport_recovery_only' ||
        !Number.isSafeInteger(value.revision) || value.revision < 0 || !Number.isSafeInteger(value.lastConnectionEpoch) || value.lastConnectionEpoch < 0 ||
        value.pending !== null) {
      fail('installable_agent_control_state_corrupt', 'Legacy control state can migrate only from a terminal no-pending point');
    }
    return {
      schemaVersion: INSTALLABLE_AGENT_CONTROL_CONNECTION_SCHEMA_VERSION,
      profile: INSTALLABLE_AGENT_CONTROL_CONNECTION_PROFILE,
      authorityClaim: 'subordinate_transport_recovery_only',
      revision: value.revision,
      lastConnectionEpoch: value.lastConnectionEpoch,
      lastConnectRequestSequence: 0,
      pending: null,
    };
  }
  assertRecordShape(value, ['schemaVersion', 'profile', 'authorityClaim', 'revision', 'lastConnectionEpoch', 'lastConnectRequestSequence', 'pending'], [], 'installable Agent control connection state');
  if (value.schemaVersion !== INSTALLABLE_AGENT_CONTROL_CONNECTION_SCHEMA_VERSION || value.profile !== INSTALLABLE_AGENT_CONTROL_CONNECTION_PROFILE ||
      value.authorityClaim !== 'subordinate_transport_recovery_only' || !Number.isSafeInteger(value.revision) || value.revision < 0 ||
      !Number.isSafeInteger(value.lastConnectionEpoch) || value.lastConnectionEpoch < 0 ||
      !Number.isSafeInteger(value.lastConnectRequestSequence) || value.lastConnectRequestSequence < 0) {
    fail('installable_agent_control_state_corrupt', 'Control connection state identity is invalid');
  }
  if (value.pending !== null) {
    assertRecordShape(value.pending, ['expectedConnectionEpoch', 'connectRequestId', 'connectionId'], [], 'pending control connection');
    assertSafeInteger(value.pending.expectedConnectionEpoch, 'pending expectedConnectionEpoch', { min: 0 });
    if (value.pending.connectRequestId.startsWith('c1:')) {
      const sequence = parseInstallableAgentConnectRequestId(value.pending.connectRequestId);
      if (sequence !== value.lastConnectRequestSequence) fail('installable_agent_control_state_corrupt', 'Pending c1 sequence must equal the local durable request high-water');
    } else {
      assertIdentifier(value.pending.connectRequestId, 'pending connectRequestId');
    }
    assertIdentifier(value.pending.connectionId, 'pending connectionId');
    if (value.pending.expectedConnectionEpoch !== value.lastConnectionEpoch) fail('installable_agent_control_state_corrupt', 'Pending connection predecessor mismatches last connected epoch');
  }
  return value;
}

function identifierFromDigest(value) {
  const valueDigest = digest(value);
  return valueDigest.slice('sha256:'.length);
}

function newPendingConnection(config, state) {
  const d0039 = config.credentialRef.startsWith('androidkeystore://');
  const seed = {
    agentId: config.agentId,
    routeGeneration: config.routeGeneration,
    executorId: config.executorId,
    executorEpoch: config.executorEpoch,
    installableAgentTuple: config.installableAgentTuple,
    expectedConnectionEpoch: state.lastConnectionEpoch,
    localRevision: state.revision + 1,
  };
  let connectRequestId;
  if (d0039) {
    if (state.lastConnectRequestSequence === Number.MAX_SAFE_INTEGER) fail('installable_agent_connect_sequence_exhausted', 'Local c1 connect request sequence is exhausted');
    connectRequestId = `c1:${state.lastConnectRequestSequence + 1}`;
  } else {
    connectRequestId = identifierFromDigest({ kind: 'installable-agent-connect-request', ...seed });
  }
  return Object.freeze({
    expectedConnectionEpoch: state.lastConnectionEpoch,
    connectRequestId,
    connectionId: identifierFromDigest({ kind: 'installable-agent-connection', ...seed }),
  });
}

function resolveToolProfileBeforeHandle(toolProfiles, executableBody) {
  try {
    return resolveToolProfile(toolProfiles, executableBody);
  } catch (cause) {
    throw createLocalExecutionStartError(
      cause?.code ?? 'installable_agent_tool_profile_rejected',
      cause?.message ?? 'Package-owned tool profile rejected the executable body',
      { phase: 'pre_handle', cause },
    );
  }
}

export async function createInstallableAgentControlProcess({
  packageRoot,
  config,
  prefix = process.env.PREFIX,
  webSocketFactory = undefined,
  supervisorClient = undefined,
  credentialLoader = readCredentialFile,
  credentialAdapter = null,
  challengeClient = null,
} = {}) {
  const resolvedPackageRoot = absolutePath(packageRoot, 'packageRoot');
  const normalizedConfig = normalizeInstallableAgentControlConfig(config);
  const release = await verifyInstallableAgentRelease({ packageRoot: resolvedPackageRoot });
  if (normalizedConfig.installableAgentTuple.packageManifestDigest !== release.manifestDigest) {
    fail('installable_agent_control_package_fence', 'Configured D0027 packageManifestDigest does not identify the package release executing this control process');
  }
  if (release.manifest.target.platform !== process.platform || release.manifest.target.arch !== process.arch) {
    fail('installable_agent_profile_unsupported', 'Installed package target does not match this control process');
  }
  const toolProfiles = await loadReleaseToolProfiles(resolvedPackageRoot, release);
  const d0039Credential = normalizedConfig.credentialRef.startsWith('androidkeystore://');
  let authKey = null;
  if (d0039Credential) {
    if (credentialAdapter === null || typeof credentialAdapter.verifySourceLineage !== 'function' ||
        typeof credentialAdapter.readPublicVerifier !== 'function' || typeof credentialAdapter.signPossession !== 'function') {
      fail('installable_agent_keystore_adapter_unconfigured', 'D0039 control requires the package-owned AndroidKeyStore credential adapter');
    }
    if (challengeClient === null || typeof challengeClient.issue !== 'function') {
      fail('installable_agent_challenge_client_unconfigured', 'D0039 control requires the deployment-owned possession challenge client');
    }
    await credentialAdapter.verifySourceLineage(normalizedConfig.androidSourceLineageId);
    await credentialAdapter.readPublicVerifier(normalizedConfig.credentialRef);
  } else {
    authKey = await credentialLoader(normalizedConfig.credentialRef);
  }
  const layout = termuxInstallableAgentServiceLayout({ prefix, stateDirectory: normalizedConfig.stateDirectory });
  const serviceClient = supervisorClient ?? new InstallableAgentSupervisorServiceClient({ socketPath: layout.socketPath });
  const baseExecutionAdapter = createInstallableAgentSupervisorServiceExecutionAdapter({
    client: serviceClient,
    resolveExecution: async (executableBody) => resolveToolProfileBeforeHandle(toolProfiles, executableBody),
  });
  const executionAdapter = Object.freeze({
    async start(input) {
      const launch = resolveToolProfileBeforeHandle(toolProfiles, input.envelope.executableBody);
      const operation = await baseExecutionAdapter.start(input);
      let timer = setTimeout(() => { void operation.cancel().catch(() => {}); }, launch.timeoutMs);
      const completion = operation.completion.finally(() => { if (timer !== null) clearTimeout(timer); timer = null; });
      return Object.freeze({ ...operation, completion });
    },
  });
  let transport = null;
  const runtime = new LocalAgentRuntime({
    agentId: normalizedConfig.agentId,
    routeGeneration: normalizedConfig.routeGeneration,
    executor: { id: normalizedConfig.executorId, epoch: normalizedConfig.executorEpoch },
    installableAgentTuple: normalizedConfig.installableAgentTuple,
    executionAdapter,
    emit: async (frame) => {
      if (transport === null) fail('local_connection_unavailable', 'Control process transport is not connected');
      await transport.emit(frame);
    },
  });
  transport = new LocalAgentWebSocketTransport({
    runtime,
    endpoint: normalizedConfig.agentDeliveryUrl,
    authKey,
    ...(webSocketFactory === undefined ? {} : { webSocketFactory }),
  });
  const connectionStatePath = path.join(normalizedConfig.stateDirectory, 'control-connection.json');
  let stopped = false;

  const connectOnce = async () => {
    let state = await readConnectionState(connectionStatePath);
    if (state.pending === null) {
      state.pending = newPendingConnection(normalizedConfig, state);
      if (d0039Credential) state.lastConnectRequestSequence = parseInstallableAgentConnectRequestId(state.pending.connectRequestId);
      state.revision += 1;
      await atomicWriteJson(connectionStatePath, state);
    }
    const pending = state.pending;
    let possessionEnvelope = null;
    if (d0039Credential) {
      const challengeRequest = {
        agentId: normalizedConfig.agentId,
        routeGeneration: normalizedConfig.routeGeneration,
        expectedConnectionEpoch: pending.expectedConnectionEpoch,
        connectRequestId: pending.connectRequestId,
        connectionId: pending.connectionId,
        executorId: normalizedConfig.executorId,
        executorEpoch: normalizedConfig.executorEpoch,
        protocolMetadataDigest: normalizedConfig.protocolMetadataDigest,
        installableAgentTuple: canonicalClone(normalizedConfig.installableAgentTuple),
      };
      const challengeResponse = await challengeClient.issue(canonicalClone(challengeRequest));
      const challenge = normalizeConnectPossessionContext(challengeResponse?.challenge ?? challengeResponse);
      possessionEnvelope = await credentialAdapter.signPossession({
        credentialRef: normalizedConfig.credentialRef,
        context: challenge,
        expectedCredentialKeyId: challenge.credentialKeyId,
        androidSourceLineageId: normalizedConfig.androidSourceLineageId,
      });
    }
    const identity = await transport.connect({
      expectedConnectionEpoch: pending.expectedConnectionEpoch,
      connectRequestId: pending.connectRequestId,
      connectionId: pending.connectionId,
      protocolMetadataDigest: normalizedConfig.protocolMetadataDigest,
      possessionEnvelope,
    });
    state = await readConnectionState(connectionStatePath);
    if (state.pending === null || canonicalJson(state.pending) !== canonicalJson(pending)) {
      transport.close(1008, 'control_state_conflict');
      fail('installable_agent_control_state_conflict', 'Control connection journal changed while connect was in flight');
    }
    state.lastConnectionEpoch = pending.expectedConnectionEpoch + 1;
    state.pending = null;
    state.revision += 1;
    await atomicWriteJson(connectionStatePath, state);
    await runtime.reportCapacity(normalizedConfig.reportedCapacity);
    return Object.freeze({ identity, connectionState: canonicalClone(state) });
  };

  const run = async () => {
    while (!stopped) {
      try {
        await connectOnce();
        await transport.waitForClose();
      } catch (cause) {
        if (stopped) break;
        transport.close(1011, 'control_reconnect');
        await new Promise((resolve) => setTimeout(resolve, normalizedConfig.reconnectDelayMs));
      }
    }
  };

  return Object.freeze({
    profile: INSTALLABLE_AGENT_CONTROL_PROFILE,
    releaseManifestDigest: release.manifestDigest,
    toolProfilesDigest: digest(toolProfiles),
    runtime,
    connectOnce,
    run,
    stop() { stopped = true; transport.close(1000, 'control_stop'); },
    async status() {
      const state = await readConnectionState(connectionStatePath);
      return Object.freeze({
        profile: INSTALLABLE_AGENT_CONTROL_PROFILE,
        connected: transport.socket !== null,
        lastConnectionEpoch: state.lastConnectionEpoch,
        lastConnectRequestSequence: state.lastConnectRequestSequence,
        pendingConnect: state.pending === null ? null : canonicalClone(state.pending),
        executorId: normalizedConfig.executorId,
        executorEpoch: normalizedConfig.executorEpoch,
        installationGeneration: normalizedConfig.installableAgentTuple.installationGeneration,
      });
    },
  });
}

function parseArgs(argv) {
  let configPath = null;
  for (let index = 0; index < argv.length; index += 2) {
    if (argv[index] !== '--config' || argv[index + 1] === undefined || configPath !== null) {
      fail('installable_agent_control_usage', 'usage: tdev-agent-control --config <absolute-json-path>');
    }
    configPath = argv[index + 1];
  }
  if (configPath === null) fail('installable_agent_control_usage', '--config is required');
  return { configPath };
}

const isDirect = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  try {
    const { configPath } = parseArgs(process.argv.slice(2));
    const config = await readInstallableAgentControlConfig(configPath);
    const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
    const control = await createInstallableAgentControlProcess({ packageRoot, config });
    const stop = () => control.stop();
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    await control.run();
  } catch (cause) {
    process.stderr.write(`${canonicalJson({ error: cause?.code ?? 'installable_agent_control_failed', message: cause?.message ?? 'Installable Agent control process failed' })}\n`);
    process.exitCode = 1;
  }
}
