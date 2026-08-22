import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, chmod, mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { canonicalJson } from './canonical.mjs';
import { InstallableAgentSupervisorServiceClient } from './installable-agent-supervisor-service.mjs';

export const INSTALLABLE_AGENT_TERMUX_SERVICE_PROFILE = 'tdev.agent.termux.runit.v1';
const DEFAULT_READY_WAIT_MS = 8_000;
const DEFAULT_POLL_MS = 50;
const MAX_COMMAND_OUTPUT_BYTES = 64 * 1024;

function fail(code, message, options = undefined) {
  const error = new Error(message, options);
  error.code = code;
  throw error;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function shellQuote(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || value.includes('\n') || value.includes('\r')) {
    fail('invalid_installable_agent_service_path', 'Service path contains unsupported characters');
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function fsyncDirectory(directory) {
  const handle = await open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

async function atomicWrite(filePath, bytes, mode) {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temp = path.join(directory, `.tdev-${path.basename(filePath)}-${process.pid}-${Date.now()}.tmp`);
  const handle = await open(temp, 'wx', mode);
  try {
    await handle.write(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(temp, mode);
  await rename(temp, filePath);
  await fsyncDirectory(directory);
}

function defaultRunCommand(executable, args, { prefix }) {
  const result = spawnSync(executable, args, {
    encoding: 'utf8',
    maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
    env: {
      HOME: prefix,
      PREFIX: prefix,
      PATH: `${prefix}/bin:/system/bin`,
      LANG: 'C.UTF-8',
    },
  });
  if (result.error) fail('installable_agent_service_command_failed', 'Termux service command could not execute', { cause: result.error });
  return Object.freeze({ status: result.status, signal: result.signal, stdout: result.stdout ?? '', stderr: result.stderr ?? '' });
}

function serviceIdentity(stateDirectory) {
  return sha256(Buffer.from(path.resolve(stateDirectory))).slice(0, 24);
}

export function termuxInstallableAgentServiceLayout({ prefix, stateDirectory }) {
  if (typeof prefix !== 'string' || !path.isAbsolute(prefix)) fail('invalid_installable_agent_termux_prefix', 'Termux prefix must be absolute');
  if (typeof stateDirectory !== 'string' || !path.isAbsolute(stateDirectory)) fail('invalid_installable_agent_package_state', 'stateDirectory must be absolute');
  const identity = serviceIdentity(stateDirectory);
  const supervisorServiceName = `tdev-agent-${identity}`;
  const controlServiceName = `${supervisorServiceName}-control`;
  const supervisorServicePath = path.join(prefix, 'var', 'service', supervisorServiceName);
  return Object.freeze({
    identity,
    serviceName: supervisorServiceName,
    servicePath: supervisorServicePath,
    supervisorServiceName,
    supervisorServicePath,
    controlServiceName,
    controlServicePath: path.join(prefix, 'var', 'service', controlServiceName),
    socketDirectory: path.join(prefix, 'var', 'run', 'tdev-agent'),
    socketPath: path.join(prefix, 'var', 'run', 'tdev-agent', `${identity}.sock`),
    controlConfigPath: path.join(path.resolve(stateDirectory), 'control-config.json'),
  });
}

function renderSupervisorRunScript({ prefix, nodePath, packageRoot, stateDirectory, socketPath }) {
  const shellPath = path.join(prefix, 'bin', 'sh');
  const serviceEntry = path.join(packageRoot, 'src', 'installable-agent-supervisor-service.mjs');
  const pathValue = `${prefix}/bin:/system/bin`;
  return Buffer.from([
    `#!${shellPath}`,
    'set -eu',
    `export HOME=${shellQuote(stateDirectory)}`,
    `export PREFIX=${shellQuote(prefix)}`,
    `export PATH=${shellQuote(pathValue)}`,
    'export TDEV_INSTALLABLE_AGENT_SERVICE=1',
    `exec ${shellQuote(nodePath)} ${shellQuote(serviceEntry)} --state-directory ${shellQuote(stateDirectory)} --socket-path ${shellQuote(socketPath)}`,
    '',
  ].join('\n'));
}

function renderControlRunScript({ prefix, nodePath, packageRoot, stateDirectory, controlConfigPath }) {
  const shellPath = path.join(prefix, 'bin', 'sh');
  const serviceEntry = path.join(packageRoot, 'src', 'installable-agent-control.mjs');
  const pathValue = `${prefix}/bin:/system/bin`;
  return Buffer.from([
    `#!${shellPath}`,
    'set -eu',
    `export HOME=${shellQuote(stateDirectory)}`,
    `export PREFIX=${shellQuote(prefix)}`,
    `export PATH=${shellQuote(pathValue)}`,
    `exec ${shellQuote(nodePath)} ${shellQuote(serviceEntry)} --config ${shellQuote(controlConfigPath)}`,
    '',
  ].join('\n'));
}

async function readOptional(filePath) {
  try { return await readFile(filePath); }
  catch (cause) { if (cause?.code === 'ENOENT') return null; throw cause; }
}

async function statOptional(filePath) {
  try { return await stat(filePath); }
  catch (cause) { if (cause?.code === 'ENOENT') return null; throw cause; }
}

function assertNonSecretControlConfig(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('invalid_installable_agent_control_config', 'controlConfig must be an object');
  const visit = (entry, key = '') => {
    if (/(?:managementproof|evidenceproof|secret|token|authorization|privatekey|apikey|authkey|credentialbytes|credentialmaterial)/i.test(key)) {
      fail('installable_agent_control_config_secret_forbidden', 'Control service config may contain only an external credentialRef, never credential bytes/proofs');
    }
    if (Array.isArray(entry)) { for (const item of entry) visit(item); return; }
    if (entry !== null && typeof entry === 'object') for (const [name, child] of Object.entries(entry)) visit(child, name);
  };
  visit(value);
  if (typeof value.credentialRef !== 'string' || !path.isAbsolute(value.credentialRef)) {
    fail('invalid_installable_agent_control_config', 'controlConfig.credentialRef must be an absolute external reference');
  }
  return value;
}

export class TermuxInstallableAgentServiceController {
  constructor({
    prefix = process.env.PREFIX,
    nodePath = process.execPath,
    platform = process.platform,
    arch = process.arch,
    runCommand = defaultRunCommand,
    clientFactory = ({ socketPath }) => new InstallableAgentSupervisorServiceClient({ socketPath }),
    readyWaitMs = DEFAULT_READY_WAIT_MS,
    pollMs = DEFAULT_POLL_MS,
  } = {}) {
    if (typeof prefix !== 'string' || !path.isAbsolute(prefix)) fail('invalid_installable_agent_termux_prefix', 'Termux prefix must be absolute');
    if (typeof nodePath !== 'string' || !path.isAbsolute(nodePath)) fail('invalid_installable_agent_node_path', 'Node executable must be absolute');
    if (typeof runCommand !== 'function' || typeof clientFactory !== 'function') fail('invalid_installable_agent_service_controller', 'Service controller dependencies are invalid');
    if (!Number.isSafeInteger(readyWaitMs) || readyWaitMs < 1 || readyWaitMs > 60_000 || !Number.isSafeInteger(pollMs) || pollMs < 1 || pollMs > 1000) {
      fail('invalid_installable_agent_service_controller', 'Service controller timing is invalid');
    }
    this.prefix = prefix;
    this.nodePath = nodePath;
    this.platform = platform;
    this.arch = arch;
    this.runCommand = runCommand;
    this.clientFactory = clientFactory;
    this.readyWaitMs = readyWaitMs;
    this.pollMs = pollMs;
  }

  async #assertProfile(manifest) {
    if (this.platform !== 'android' || this.arch !== 'arm64') fail('installable_agent_profile_unsupported', 'D0027 package service supports Android/arm64 Termux only');
    if (manifest?.target?.platform !== 'android' || manifest?.target?.arch !== 'arm64') fail('installable_agent_package_manifest_incompatible', 'Release target does not match the Termux service profile');
    for (const executable of [path.join(this.prefix, 'bin', 'sh'), path.join(this.prefix, 'bin', 'sv'), path.join(this.prefix, 'bin', 'runsv'), this.nodePath]) {
      try { await access(executable, fsConstants.X_OK); }
      catch (cause) { fail('installable_agent_profile_unsupported', 'Required package-owned service primitive is unavailable', { cause }); }
    }
    const serviceRoot = path.join(this.prefix, 'var', 'service');
    try {
      const serviceRootStat = await stat(serviceRoot);
      if (!serviceRootStat.isDirectory()) fail('installable_agent_profile_unsupported', 'Termux service root is not a directory');
    } catch (cause) {
      if (cause?.code === 'installable_agent_profile_unsupported') throw cause;
      fail('installable_agent_profile_unsupported', 'Termux service root is unavailable', { cause });
    }
  }

  #sv(command, servicePath) {
    const result = this.runCommand(path.join(this.prefix, 'bin', 'sv'), [command, servicePath], { prefix: this.prefix });
    if (result.status !== 0) fail('installable_agent_service_command_failed', `sv ${command} failed for the package-owned service`);
    return result;
  }

  #runitStatus(servicePath) {
    const result = this.runCommand(path.join(this.prefix, 'bin', 'sv'), ['status', servicePath], { prefix: this.prefix });
    const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
    if (result.status !== 0) return Object.freeze({ classification: 'not_running', text });
    if (/^down:/i.test(text)) return Object.freeze({ classification: 'down', text });
    if (/^(?:run|up):/i.test(text)) return Object.freeze({ classification: 'running', text });
    return Object.freeze({ classification: 'unknown', text });
  }

  async #waitSupervised(servicePath) {
    const deadline = Date.now() + this.readyWaitMs;
    while (Date.now() < deadline) {
      const result = this.runCommand(path.join(this.prefix, 'bin', 'sv'), ['status', servicePath], { prefix: this.prefix });
      if (result.status === 0) return;
      await new Promise((resolve) => setTimeout(resolve, this.pollMs));
    }
    fail('installable_agent_service_not_supervised', 'Termux runsvdir did not positively discover the package-owned service before lifecycle control');
  }

  async #waitDown(servicePath) {
    const deadline = Date.now() + this.readyWaitMs;
    while (Date.now() < deadline) {
      const status = this.#runitStatus(servicePath);
      if (status.classification === 'down') return status;
      await new Promise((resolve) => setTimeout(resolve, this.pollMs));
    }
    fail('installable_agent_service_stop_unverified', 'Package-owned service did not positively reach supervised down state');
  }

  async #waitRunning(servicePath) {
    const deadline = Date.now() + this.readyWaitMs;
    while (Date.now() < deadline) {
      const status = this.#runitStatus(servicePath);
      if (status.classification === 'running') return status;
      await new Promise((resolve) => setTimeout(resolve, this.pollMs));
    }
    fail('installable_agent_service_not_ready', 'Package-owned service did not positively reach running state');
  }

  async #waitSupervisorReady(layout) {
    const client = this.clientFactory({ socketPath: layout.socketPath });
    const deadline = Date.now() + this.readyWaitMs;
    let lastError = null;
    while (Date.now() < deadline) {
      try {
        const status = await client.status();
        if (status?.supervisor?.initialized === true) return status;
        lastError = Object.assign(new Error('Supervisor status was not initialized'), { code: 'installable_agent_supervisor_service_not_ready' });
      } catch (cause) { lastError = cause; }
      await new Promise((resolve) => setTimeout(resolve, this.pollMs));
    }
    fail('installable_agent_supervisor_service_not_ready', 'Package-owned supervisor service did not become ready', { cause: lastError });
  }

  async #ensureDefinition(servicePath, desiredRun, { enabled }) {
    const runPath = path.join(servicePath, 'run');
    const existingRun = await readOptional(runPath);
    if (existingRun !== null) {
      if (!existingRun.equals(desiredRun)) fail('installable_agent_service_definition_conflict', 'Existing package-owned service definition differs from this verified release');
      return Object.freeze({ created: false, runDefinitionDigest: sha256(desiredRun) });
    }
    const existingService = await statOptional(servicePath);
    if (existingService !== null) fail('installable_agent_service_definition_conflict', 'Package-owned service directory exists without the expected verified run definition');
    await mkdir(servicePath, { recursive: false, mode: 0o700 });
    await writeFile(path.join(servicePath, 'down'), '', { mode: 0o600 });
    await atomicWrite(runPath, desiredRun, 0o755);
    await fsyncDirectory(servicePath);
    if (enabled) {
      await rm(path.join(servicePath, 'down'), { force: true });
      await fsyncDirectory(servicePath);
    }
    await fsyncDirectory(path.dirname(servicePath));
    return Object.freeze({ created: true, runDefinitionDigest: sha256(desiredRun) });
  }

  async install({ packageRoot, stateDirectory, manifest }) {
    if (typeof packageRoot !== 'string' || !path.isAbsolute(packageRoot) || typeof stateDirectory !== 'string' || !path.isAbsolute(stateDirectory)) {
      fail('invalid_installable_agent_service_controller', 'packageRoot and stateDirectory must be absolute');
    }
    await this.#assertProfile(manifest);
    const layout = termuxInstallableAgentServiceLayout({ prefix: this.prefix, stateDirectory });
    await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
    await chmod(stateDirectory, 0o700);
    await mkdir(layout.socketDirectory, { recursive: true, mode: 0o700 });
    await chmod(layout.socketDirectory, 0o700);
    const supervisorRun = renderSupervisorRunScript({ prefix: this.prefix, nodePath: this.nodePath, packageRoot, stateDirectory, socketPath: layout.socketPath });
    const controlRun = renderControlRunScript({ prefix: this.prefix, nodePath: this.nodePath, packageRoot, stateDirectory, controlConfigPath: layout.controlConfigPath });
    const supervisorDefinition = await this.#ensureDefinition(layout.supervisorServicePath, supervisorRun, { enabled: true });
    const controlDefinition = await this.#ensureDefinition(layout.controlServicePath, controlRun, { enabled: false });
    await this.#waitSupervised(layout.supervisorServicePath);
    await this.#waitSupervised(layout.controlServicePath);
    this.#sv('up', layout.supervisorServicePath);
    const supervisor = await this.#waitSupervisorReady(layout);
    return Object.freeze({
      classification: supervisorDefinition.created || controlDefinition.created ? 'installed' : 'exact_replay',
      profile: INSTALLABLE_AGENT_TERMUX_SERVICE_PROFILE,
      serviceIdentity: layout.identity,
      supervisorRunDefinitionDigest: supervisorDefinition.runDefinitionDigest,
      controlRunDefinitionDigest: controlDefinition.runDefinitionDigest,
      supervisor,
      control: this.#runitStatus(layout.controlServicePath),
    });
  }

  async status({ stateDirectory }) {
    const layout = termuxInstallableAgentServiceLayout({ prefix: this.prefix, stateDirectory });
    const supervisorStat = await statOptional(layout.supervisorServicePath);
    const controlStat = await statOptional(layout.controlServicePath);
    if (supervisorStat === null && controlStat === null) return Object.freeze({ classification: 'not_installed', profile: INSTALLABLE_AGENT_TERMUX_SERVICE_PROFILE, serviceIdentity: layout.identity });
    if (supervisorStat === null || !supervisorStat.isDirectory() || controlStat === null || !controlStat.isDirectory()) {
      return Object.freeze({ classification: 'conflict', profile: INSTALLABLE_AGENT_TERMUX_SERVICE_PROFILE, serviceIdentity: layout.identity });
    }
    const supervisorRunit = this.#runitStatus(layout.supervisorServicePath);
    const controlRunit = this.#runitStatus(layout.controlServicePath);
    try {
      const supervisor = await this.clientFactory({ socketPath: layout.socketPath }).status();
      return Object.freeze({
        classification: supervisor?.supervisor?.initialized === true ? 'running' : 'not_ready',
        profile: INSTALLABLE_AGENT_TERMUX_SERVICE_PROFILE,
        serviceIdentity: layout.identity,
        runit: supervisorRunit.classification,
        supervisorRunit,
        controlRunit,
        supervisor,
      });
    } catch (cause) {
      return Object.freeze({
        classification: 'not_ready',
        profile: INSTALLABLE_AGENT_TERMUX_SERVICE_PROFILE,
        serviceIdentity: layout.identity,
        runit: supervisorRunit.classification,
        supervisorRunit,
        controlRunit,
        error: cause?.code ?? 'supervisor_unreachable',
      });
    }
  }

  async start({ stateDirectory }) {
    const layout = termuxInstallableAgentServiceLayout({ prefix: this.prefix, stateDirectory });
    await this.#waitSupervised(layout.supervisorServicePath);
    this.#sv('up', layout.supervisorServicePath);
    const supervisor = await this.#waitSupervisorReady(layout);
    return Object.freeze({ classification: 'prepared', profile: INSTALLABLE_AGENT_TERMUX_SERVICE_PROFILE, serviceIdentity: layout.identity, supervisor });
  }

  async stageRelease({ packageRoot, stateDirectory, manifest }) {
    if (typeof packageRoot !== 'string' || !path.isAbsolute(packageRoot) || typeof stateDirectory !== 'string' || !path.isAbsolute(stateDirectory)) {
      fail('invalid_installable_agent_service_controller', 'packageRoot and stateDirectory must be absolute');
    }
    await this.#assertProfile(manifest);
    const layout = termuxInstallableAgentServiceLayout({ prefix: this.prefix, stateDirectory });
    const supervisorRunPath = path.join(layout.supervisorServicePath, 'run');
    const controlRunPath = path.join(layout.controlServicePath, 'run');
    const existingSupervisorRun = await readOptional(supervisorRunPath);
    const existingControlRun = await readOptional(controlRunPath);
    if (existingSupervisorRun === null || existingControlRun === null) {
      fail('installable_agent_service_definition_conflict', 'Release staging requires existing package-owned supervisor and control definitions');
    }
    const desiredSupervisorRun = renderSupervisorRunScript({
      prefix: this.prefix,
      nodePath: this.nodePath,
      packageRoot,
      stateDirectory,
      socketPath: layout.socketPath,
    });
    const desiredControlRun = renderControlRunScript({
      prefix: this.prefix,
      nodePath: this.nodePath,
      packageRoot,
      stateDirectory,
      controlConfigPath: layout.controlConfigPath,
    });
    const supervisorChanged = !existingSupervisorRun.equals(desiredSupervisorRun);
    const controlChanged = !existingControlRun.equals(desiredControlRun);
    const changed = supervisorChanged || controlChanged;
    await this.#waitSupervised(layout.controlServicePath);
    await this.#waitSupervised(layout.supervisorServicePath);

    if (changed) {
      const controlStatus = this.#runitStatus(layout.controlServicePath);
      const supervisorStatus = this.#runitStatus(layout.supervisorServicePath);
      if (controlStatus.classification !== 'down' || supervisorStatus.classification !== 'down') {
        fail('installable_agent_service_update_not_quiesced', 'Release substitution requires both predecessor services to be positively supervised and down');
      }
      await writeFile(path.join(layout.controlServicePath, 'down'), '', { mode: 0o600 });
      await writeFile(path.join(layout.supervisorServicePath, 'down'), '', { mode: 0o600 });
      if (supervisorChanged) await atomicWrite(supervisorRunPath, desiredSupervisorRun, 0o755);
      if (controlChanged) await atomicWrite(controlRunPath, desiredControlRun, 0o755);
      await fsyncDirectory(layout.controlServicePath);
      await fsyncDirectory(layout.supervisorServicePath);
      await fsyncDirectory(path.dirname(layout.supervisorServicePath));
    }

    this.#sv('up', layout.supervisorServicePath);
    const supervisor = await this.#waitSupervisorReady(layout);
    return Object.freeze({
      classification: changed ? 'staged' : 'exact_replay',
      profile: INSTALLABLE_AGENT_TERMUX_SERVICE_PROFILE,
      serviceIdentity: layout.identity,
      supervisorRunDefinitionDigest: sha256(desiredSupervisorRun),
      controlRunDefinitionDigest: sha256(desiredControlRun),
      supervisor,
      control: this.#runitStatus(layout.controlServicePath),
    });
  }

  async activateControl({ stateDirectory, controlConfig }) {
    const layout = termuxInstallableAgentServiceLayout({ prefix: this.prefix, stateDirectory });
    assertNonSecretControlConfig(controlConfig);
    const bytes = Buffer.from(`${canonicalJson(controlConfig)}\n`);
    await atomicWrite(layout.controlConfigPath, bytes, 0o600);
    await this.#waitSupervised(layout.controlServicePath);
    this.#sv('up', layout.controlServicePath);
    const runit = await this.#waitRunning(layout.controlServicePath);
    return Object.freeze({
      classification: 'running',
      profile: INSTALLABLE_AGENT_TERMUX_SERVICE_PROFILE,
      serviceIdentity: layout.identity,
      controlConfigDigest: sha256(bytes),
      runit,
    });
  }

  async quiesceAndStop({ stateDirectory, drainRequestId }) {
    if (typeof drainRequestId !== 'string' || drainRequestId.length === 0) fail('invalid_installable_agent_drain_request', 'drainRequestId is required');
    const layout = termuxInstallableAgentServiceLayout({ prefix: this.prefix, stateDirectory });
    await this.#waitSupervised(layout.controlServicePath);
    await this.#waitSupervised(layout.supervisorServicePath);
    this.#sv('down', layout.controlServicePath);
    const controlStopped = await this.#waitDown(layout.controlServicePath);
    this.#sv('up', layout.supervisorServicePath);
    await this.#waitSupervisorReady(layout);
    const client = this.clientFactory({ socketPath: layout.socketPath });
    const drained = await client.drain({ requestId: drainRequestId });
    if (!['quiesced', 'exact_replay'].includes(drained?.classification) || drained?.supervisor?.liveOperations !== 0 || drained?.supervisor?.heldPredecessors?.length !== 0) {
      fail('installable_agent_supervisor_drain_incomplete', 'Supervisor drain did not provide positive quiescence');
    }
    this.#sv('down', layout.supervisorServicePath);
    const supervisorStopped = await this.#waitDown(layout.supervisorServicePath);
    return Object.freeze({
      classification: 'quiesced_and_stopped',
      profile: INSTALLABLE_AGENT_TERMUX_SERVICE_PROFILE,
      serviceIdentity: layout.identity,
      positiveQuiescence: {
        supervisorGeneration: drained.supervisor.supervisorGeneration,
        operationGenerationHighWater: drained.supervisor.operationGenerationHighWater,
        liveOperations: 0,
        heldPredecessors: [],
        drainRequestId,
      },
      serviceStopped: {
        supervisor: supervisorStopped.classification,
        control: controlStopped.classification,
      },
    });
  }

  async stop({ stateDirectory, drainRequestId = `manual-${Date.now()}` }) {
    return this.quiesceAndStop({ stateDirectory, drainRequestId });
  }

  async uninstall({ stateDirectory, authorityResponse }) {
    if (authorityResponse?.phase !== 'revoked' || authorityResponse?.deletionBarrier !== 'authority_revoked_replay_fences_retained') {
      fail('installable_agent_uninstall_not_revoked', 'Service deletion is forbidden before authoritative revocation barrier');
    }
    const layout = termuxInstallableAgentServiceLayout({ prefix: this.prefix, stateDirectory });
    const supervisorExists = await statOptional(layout.supervisorServicePath);
    const controlExists = await statOptional(layout.controlServicePath);
    if (supervisorExists === null && controlExists === null) {
      await rm(layout.controlConfigPath, { force: true });
      await rm(layout.socketPath, { force: true });
      return Object.freeze({ classification: 'exact_replay', profile: INSTALLABLE_AGENT_TERMUX_SERVICE_PROFILE, serviceIdentity: layout.identity });
    }
    if (controlExists !== null) {
      await this.#waitSupervised(layout.controlServicePath);
      this.#sv('down', layout.controlServicePath);
      await this.#waitDown(layout.controlServicePath);
    }
    if (supervisorExists !== null) {
      await this.#waitSupervised(layout.supervisorServicePath);
      this.#sv('down', layout.supervisorServicePath);
      await this.#waitDown(layout.supervisorServicePath);
    }
    await rm(layout.controlServicePath, { recursive: true, force: true });
    await rm(layout.supervisorServicePath, { recursive: true, force: true });
    await rm(layout.controlConfigPath, { force: true });
    await rm(layout.socketPath, { force: true });
    await fsyncDirectory(path.dirname(layout.supervisorServicePath));
    return Object.freeze({ classification: 'uninstalled', profile: INSTALLABLE_AGENT_TERMUX_SERVICE_PROFILE, serviceIdentity: layout.identity });
  }
}
