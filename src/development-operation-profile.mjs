import {
  ContractError,
  assertDigest,
  assertIdentifier,
  assertRecordShape,
  assertSafeInteger,
  assertScalarString,
  canonicalClone,
  canonicalJson,
  compareText,
  deepFreeze,
  digest,
  isPlainRecord,
  typedDigest,
} from './canonical.mjs';

export const DEVELOPMENT_OPERATION_PROFILE = 'tdev.development-operation-profiles.v2';
export const DEVELOPMENT_OPERATION_SCHEMA_VERSION = 2;
export const DEVELOPMENT_OPERATION_REQUEST_DOMAIN = 'tdev.development-operation-request.v1';
export const DEVELOPMENT_OPERATION_CAPABILITY_DOMAIN = 'tdev.development-operation-capability.v1';
export const DEVELOPMENT_OPERATION_MAX_MANIFEST_BYTES = 256 * 1024;
export const DEVELOPMENT_OPERATION_MAX_REQUEST_BYTES = 256 * 1024;

const OPERATION_KINDS = new Set(['repository_context', 'model_repository', 'repository_validation']);
const EXECUTABLE_KINDS = new Set(['built_in', 'configured_runtime']);
const FILESYSTEM_MODES = new Set(['immutable_repository', 'candidate_workspace']);
const NETWORK_MODES = new Set(['none', 'openai-codex-trusted-local']);
const CREDENTIAL_MODES = new Set(['none', 'codex_saved_cli_auth']);
const DISCLOSURE_PROFILES = new Set(['tdev.openai-codex-full-context.trusted-local.v1']);

function fail(code, message, details = undefined) {
  throw new ContractError(code, message, details);
}

function boundedText(value, label, max = 8 * 1024) {
  assertScalarString(value, label);
  if (value.length === 0 || Buffer.byteLength(value, 'utf8') > max || value.includes('\0')) {
    fail('development_operation_text_invalid', `${label} is empty or outside its byte bound`);
  }
  return value;
}

function normalizeLimits(input, label) {
  assertRecordShape(input, [
    'timeoutMs', 'maxInputBytes', 'maxOutputBytes', 'maxFileBytes', 'maxWorkspaceBytes', 'cancelGraceMs',
  ], [], label);
  return deepFreeze({
    timeoutMs: assertSafeInteger(input.timeoutMs, `${label}.timeoutMs`, { min: 100, max: 600_000 }),
    maxInputBytes: assertSafeInteger(input.maxInputBytes, `${label}.maxInputBytes`, { min: 1, max: DEVELOPMENT_OPERATION_MAX_REQUEST_BYTES }),
    maxOutputBytes: assertSafeInteger(input.maxOutputBytes, `${label}.maxOutputBytes`, { min: 1, max: 4 * 1024 * 1024 }),
    maxFileBytes: assertSafeInteger(input.maxFileBytes, `${label}.maxFileBytes`, { min: 1, max: 16 * 1024 * 1024 }),
    maxWorkspaceBytes: assertSafeInteger(input.maxWorkspaceBytes, `${label}.maxWorkspaceBytes`, { min: 1, max: 64 * 1024 * 1024 }),
    cancelGraceMs: assertSafeInteger(input.cancelGraceMs, `${label}.cancelGraceMs`, { min: 0, max: 60_000 }),
  });
}

function normalizeExecutable(input, label) {
  assertRecordShape(input, ['kind', 'name'], [], label);
  if (!EXECUTABLE_KINDS.has(input.kind)) fail('development_operation_executable_unsupported', `${label}.kind is unsupported`);
  return deepFreeze({ kind: input.kind, name: boundedText(input.name, `${label}.name`, 256) });
}

function normalizeProfile(input, name) {
  assertRecordShape(input, [
    'kind', 'executable', 'argv', 'environment', 'filesystem', 'network', 'limits', 'cleanupDomain',
  ], ['credentialMode', 'disclosureProfile', 'binding'], `operation profile ${name}`);
  if (!OPERATION_KINDS.has(input.kind)) fail('development_operation_kind_unsupported', `Operation profile ${name} kind is unsupported`);
  const executable = normalizeExecutable(input.executable, `operation profile ${name}.executable`);
  if (!Array.isArray(input.argv) || input.argv.length > 32) fail('development_operation_argv_invalid', `Operation profile ${name}.argv is invalid`);
  const argv = input.argv.map((value, index) => boundedText(value, `operation profile ${name}.argv[${index}]`, 4096));
  if (!isPlainRecord(input.environment) || Object.keys(input.environment).length !== 0) {
    fail('development_operation_environment_denied', `Operation profile ${name} must use the explicit empty release-bound environment`);
  }
  if (!FILESYSTEM_MODES.has(input.filesystem)) fail('development_operation_filesystem_unsupported', `Operation profile ${name}.filesystem is unsupported`);
  if (!NETWORK_MODES.has(input.network)) fail('development_operation_network_denied', `Operation profile ${name}.network is unsupported`);
  if (input.cleanupDomain !== 'warden_process_group') fail('development_operation_cleanup_unsupported', `Operation profile ${name}.cleanupDomain is unsupported`);
  const credentialMode = input.credentialMode ?? 'none';
  if (!CREDENTIAL_MODES.has(credentialMode)) fail('development_operation_credential_mode_unsupported', `Operation profile ${name}.credentialMode is unsupported`);
  const disclosureProfile = input.disclosureProfile ?? null;
  if (disclosureProfile !== null && !DISCLOSURE_PROFILES.has(disclosureProfile)) {
    fail('development_operation_disclosure_unsupported', `Operation profile ${name}.disclosureProfile is unsupported`);
  }
  if (input.kind === 'model_repository') {
    if (input.network !== 'openai-codex-trusted-local' || credentialMode !== 'codex_saved_cli_auth' || disclosureProfile !== 'tdev.openai-codex-full-context.trusted-local.v1') {
      fail('development_operation_model_binding_invalid', `Operation profile ${name} must use the trusted-local Codex binding`);
    }
    if (argv.length !== 6 || canonicalJson(argv) !== canonicalJson(['exec', '--ephemeral', '--json', '--sandbox', 'read-only', '--ignore-user-config'])) {
      fail('development_operation_model_arguments_invalid', `Operation profile ${name} must use the fixed Codex exec argument template`);
    }
  } else if (input.network !== 'none' || credentialMode !== 'none' || disclosureProfile !== null) {
    fail('development_operation_non_model_binding_invalid', `Operation profile ${name} cannot admit model network or credentials`);
  }
  let binding = null;
  if (input.binding !== undefined && input.binding !== null) {
    assertRecordShape(input.binding, ['profile'], ['outputSchemaPath', 'outputSchemaSha256', 'model', 'reasoningEffort', 'validationCommand'], `operation profile ${name}.binding`);
    assertIdentifier(input.binding.profile, `operation profile ${name}.binding.profile`);
    for (const field of ['outputSchemaPath', 'model', 'reasoningEffort', 'validationCommand']) {
      if (input.binding[field] !== undefined && input.binding[field] !== null) boundedText(input.binding[field], `operation profile ${name}.binding.${field}`, 4096);
    }
    if (input.binding.outputSchemaSha256 !== undefined && input.binding.outputSchemaSha256 !== null) {
      assertDigest(input.binding.outputSchemaSha256, `operation profile ${name}.binding.outputSchemaSha256`);
    }
    binding = canonicalClone(input.binding);
  }
  if (input.kind === 'model_repository' && (binding === null || binding.profile !== 'tdev.model.codex-exec.v1' || typeof binding.outputSchemaPath !== 'string')) {
    fail('development_operation_model_binding_invalid', `Operation profile ${name} must bind the release-owned Codex output schema`);
  }
  if (input.kind === 'repository_validation' && (argv.length !== 2 || canonicalJson(argv) !== canonicalJson(['run', 'check']) || binding === null || binding.profile !== 'tdev.validation.npm-check.v1' || binding.validationCommand !== 'npm run check')) {
    fail('development_operation_validation_binding_invalid', `Operation profile ${name} must bind the fixed npm check validator`);
  }
  return deepFreeze({
    kind: input.kind,
    executable,
    argv: Object.freeze(argv),
    environment: Object.freeze(canonicalClone(input.environment)),
    filesystem: input.filesystem,
    network: input.network,
    limits: normalizeLimits(input.limits, `operation profile ${name}.limits`),
    cleanupDomain: input.cleanupDomain,
    credentialMode,
    disclosureProfile,
    binding,
  });
}

export function normalizeDevelopmentOperationManifest(input) {
  assertRecordShape(input, ['schemaVersion', 'profile', 'profiles'], [], 'development operation manifest');
  if (input.schemaVersion !== DEVELOPMENT_OPERATION_SCHEMA_VERSION || input.profile !== DEVELOPMENT_OPERATION_PROFILE) {
    fail('development_operation_manifest_unsupported', 'Development operation manifest profile/schema is unsupported');
  }
  if (!isPlainRecord(input.profiles) || Object.keys(input.profiles).length === 0 || Object.keys(input.profiles).length > 32) {
    fail('development_operation_manifest_invalid', 'Development operation manifest profiles are invalid');
  }
  const profiles = {};
  for (const name of Object.keys(input.profiles).sort(compareText)) {
    assertIdentifier(name, 'development operation profile name');
    profiles[name] = normalizeProfile(input.profiles[name], name);
  }
  const manifest = {
    schemaVersion: DEVELOPMENT_OPERATION_SCHEMA_VERSION,
    profile: DEVELOPMENT_OPERATION_PROFILE,
    profiles,
  };
  if (Buffer.byteLength(canonicalJson(manifest), 'utf8') > DEVELOPMENT_OPERATION_MAX_MANIFEST_BYTES) {
    fail('development_operation_manifest_limit_exceeded', 'Development operation manifest exceeds its byte bound');
  }
  return deepFreeze(canonicalClone(manifest));
}

function rejectForbiddenInputKeys(value, path = 'request.input') {
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) rejectForbiddenInputKeys(entry, `${path}[${index}]`);
    return;
  }
  if (!isPlainRecord(value)) return;
  for (const key of Object.keys(value)) {
    if (/^(argv|args|cwd|env|environment|command|executable|credential|credentials|token|secret|network|absolutePath|repositoryPath|worktreePath)$/i.test(key)) {
      fail('development_operation_input_forbidden', `${path}.${key} is not caller authority`);
    }
    rejectForbiddenInputKeys(value[key], `${path}.${key}`);
  }
}

function normalizeRequestInput(kind, input) {
  if (!isPlainRecord(input)) fail('development_operation_request_invalid', 'Development operation input must be a record');
  if (kind === 'repository_context') {
    assertRecordShape(input, ['repositoryCommitOid', 'baseDigest', 'objectFormat'], [], 'repository context operation input');
    assertScalarString(input.repositoryCommitOid, 'repositoryCommitOid');
    assertDigest(input.baseDigest, 'baseDigest');
    if (!['sha1', 'sha256'].includes(input.objectFormat)) fail('development_operation_request_invalid', 'objectFormat is unsupported');
    return deepFreeze(canonicalClone(input));
  }
  if (kind === 'model_repository') {
    assertRecordShape(input, ['repositoryCommitOid', 'baseDigest', 'instruction'], ['contextReferenceId'], 'model operation input');
    assertScalarString(input.repositoryCommitOid, 'repositoryCommitOid');
    assertDigest(input.baseDigest, 'baseDigest');
    boundedText(input.instruction, 'instruction', 64 * 1024);
    if (Object.hasOwn(input, 'contextReferenceId')) assertIdentifier(input.contextReferenceId, 'contextReferenceId');
    return deepFreeze(canonicalClone(input));
  }
  assertRecordShape(input, ['candidateTreeDigest', 'validationProfile'], [], 'validation operation input');
  assertDigest(input.candidateTreeDigest, 'candidateTreeDigest');
  assertIdentifier(input.validationProfile, 'validationProfile');
  return deepFreeze(canonicalClone(input));
}

export function normalizeDevelopmentOperationRequest(manifest, input) {
  const normalizedManifest = normalizeDevelopmentOperationManifest(manifest);
  assertRecordShape(input, ['profile', 'input'], [], 'development operation request');
  assertIdentifier(input.profile, 'development operation request.profile');
  const selected = normalizedManifest.profiles[input.profile];
  if (!selected) fail('development_operation_profile_unknown', `Unknown development operation profile: ${input.profile}`);
  rejectForbiddenInputKeys(input.input);
  const operationInput = normalizeRequestInput(selected.kind, input.input);
  const request = {
    schemaVersion: DEVELOPMENT_OPERATION_SCHEMA_VERSION,
    profile: input.profile,
    input: operationInput,
  };
  if (Buffer.byteLength(canonicalJson(request), 'utf8') > selected.limits.maxInputBytes) {
    fail('development_operation_request_limit_exceeded', 'Development operation input exceeds its profile bound');
  }
  return deepFreeze(request);
}

export function developmentOperationManifestDigest(manifest) {
  return digest(normalizeDevelopmentOperationManifest(manifest));
}

export function developmentOperationCapabilityId(manifest, profile) {
  const normalized = normalizeDevelopmentOperationManifest(manifest);
  assertIdentifier(profile, 'profile');
  if (!normalized.profiles[profile]) fail('development_operation_profile_unknown', `Unknown development operation profile: ${profile}`);
  return typedDigest(DEVELOPMENT_OPERATION_CAPABILITY_DOMAIN, {
    manifestDigest: digest(normalized),
    profile,
    kind: normalized.profiles[profile].kind,
  });
}

function assertCapability(capabilities, capabilityId) {
  if (!Array.isArray(capabilities) || !capabilities.includes(capabilityId)) {
    fail('development_operation_capability_denied', 'Agent capability does not admit the selected development operation');
  }
}

function assertSignal(signal) {
  if (signal === undefined) return;
  if (!signal || typeof signal.aborted !== 'boolean') fail('development_operation_signal_invalid', 'Operation signal is invalid');
  if (signal.aborted) fail('development_operation_aborted', 'Development operation was aborted before dispatch');
}

export async function executeDevelopmentOperation({
  manifest,
  request,
  capabilities,
  signal,
  contextExecutor = null,
  modelExecutor = null,
  validationExecutor = null,
} = {}) {
  const normalizedManifest = normalizeDevelopmentOperationManifest(manifest);
  const normalizedRequest = normalizeDevelopmentOperationRequest(normalizedManifest, request);
  const selected = normalizedManifest.profiles[normalizedRequest.profile];
  const capabilityId = developmentOperationCapabilityId(normalizedManifest, normalizedRequest.profile);
  assertCapability(capabilities, capabilityId);
  assertSignal(signal);
  const callback = selected.kind === 'repository_context' ? contextExecutor
    : selected.kind === 'model_repository' ? modelExecutor
      : validationExecutor;
  if (typeof callback !== 'function') fail('development_operation_executor_unconfigured', `No executor is configured for ${selected.kind}`);
  const executionContext = deepFreeze({
    profile: normalizedRequest.profile,
    kind: selected.kind,
    input: normalizedRequest.input,
    limits: selected.limits,
  });
  const result = await callback({ ...executionContext, signal });
  assertSignal(signal);
  return deepFreeze({
    profile: normalizedRequest.profile,
    kind: selected.kind,
    capabilityId,
    manifestDigest: digest(normalizedManifest),
    result: canonicalClone(result),
  });
}
