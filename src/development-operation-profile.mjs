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
import { validateRelativePath } from './policy.mjs';
import { normalizeRepositoryBaseIdentity } from './lazy-plan-reference.mjs';

export const DEVELOPMENT_OPERATION_PROFILE = 'tdev.development-operation-profiles.v2';
export const DEVELOPMENT_OPERATION_SCHEMA_VERSION = 2;
export const DEVELOPMENT_OPERATION_REQUEST_DOMAIN = 'tdev.development-operation-request.v1';
export const DEVELOPMENT_OPERATION_CAPABILITY_DOMAIN = 'tdev.development-operation-capability.v1';
export const DEVELOPMENT_OPERATION_MAX_MANIFEST_BYTES = 256 * 1024;
export const DEVELOPMENT_OPERATION_MAX_REQUEST_BYTES = 256 * 1024;
export const CODEX_MODEL_BINDING_PROFILE = 'tdev.model.codex-exec-no-bwrap.v1';
export const CODEX_EXECUTION_BOUNDARY = 'tdev.disposable-exact-base-no-bwrap.v1';
export const CODEX_OPERATION_ARGUMENTS = Object.freeze(['exec', '--ephemeral', '--json', '--ignore-user-config']);
export const LAZY_CONTEXT_OPERATION_PROFILE = 'tdev.repository.context.prepare.lazy.v1';

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
    if (argv.length !== CODEX_OPERATION_ARGUMENTS.length || canonicalJson(argv) !== canonicalJson(CODEX_OPERATION_ARGUMENTS)) {
      fail('development_operation_model_arguments_invalid', `Operation profile ${name} must use the fixed Codex exec argument template`);
    }
  } else if (input.network !== 'none' || credentialMode !== 'none' || disclosureProfile !== null) {
    fail('development_operation_non_model_binding_invalid', `Operation profile ${name} cannot admit model network or credentials`);
  }
  let binding = null;
  if (input.binding !== undefined && input.binding !== null) {
    assertRecordShape(input.binding, ['profile'], ['outputSchemaPath', 'outputSchemaSha256', 'model', 'reasoningEffort', 'validationCommand', 'contextExcludedPaths', 'contextIncludedPathPrefixes', 'executionBoundary'], `operation profile ${name}.binding`);
    assertIdentifier(input.binding.profile, `operation profile ${name}.binding.profile`);
    for (const field of ['outputSchemaPath', 'model', 'reasoningEffort', 'validationCommand']) {
      if (input.binding[field] !== undefined && input.binding[field] !== null) boundedText(input.binding[field], `operation profile ${name}.binding.${field}`, 4096);
    }
    if (input.binding.outputSchemaSha256 !== undefined && input.binding.outputSchemaSha256 !== null) {
      assertDigest(input.binding.outputSchemaSha256, `operation profile ${name}.binding.outputSchemaSha256`);
    }
    binding = canonicalClone(input.binding);
    if (input.binding.contextExcludedPaths !== undefined) {
      if (!Array.isArray(input.binding.contextExcludedPaths) || input.binding.contextExcludedPaths.length > 128) {
        fail('development_operation_binding_invalid', `Operation profile ${name}.binding.contextExcludedPaths is invalid`);
      }
      const excludedPaths = input.binding.contextExcludedPaths.map((value) => validateRelativePath(boundedText(value, `operation profile ${name}.binding.contextExcludedPaths`, 4096))).sort(compareText);
      for (let index = 1; index < excludedPaths.length; index += 1) {
        if (excludedPaths[index] === excludedPaths[index - 1]) fail('development_operation_binding_invalid', `Operation profile ${name}.binding.contextExcludedPaths contains a duplicate`);
      }
      binding.contextExcludedPaths = excludedPaths;
    }
    if (input.binding.contextIncludedPathPrefixes !== undefined) {
      if (!Array.isArray(input.binding.contextIncludedPathPrefixes) || input.binding.contextIncludedPathPrefixes.length === 0 || input.binding.contextIncludedPathPrefixes.length > 128) {
        fail('development_operation_binding_invalid', `Operation profile ${name}.binding.contextIncludedPathPrefixes is invalid`);
      }
      const includedPathPrefixes = input.binding.contextIncludedPathPrefixes.map((value) => {
        const text = boundedText(value, `operation profile ${name}.binding.contextIncludedPathPrefixes`, 4096);
        const directoryPrefix = text.endsWith('/');
        const normalized = validateRelativePath(directoryPrefix ? text.slice(0, -1) : text);
        return directoryPrefix ? `${normalized}/` : normalized;
      }).sort(compareText);
      for (let index = 1; index < includedPathPrefixes.length; index += 1) {
        if (includedPathPrefixes[index] === includedPathPrefixes[index - 1]) fail('development_operation_binding_invalid', `Operation profile ${name}.binding.contextIncludedPathPrefixes contains a duplicate`);
      }
      binding.contextIncludedPathPrefixes = includedPathPrefixes;
    }
    if (Array.isArray(binding.contextExcludedPaths) && binding.contextExcludedPaths.length > 0) {
      if (!Array.isArray(binding.contextIncludedPathPrefixes) || binding.contextIncludedPathPrefixes.length === 0) {
        fail('development_operation_binding_invalid', `Operation profile ${name}.binding.contextExcludedPaths cannot reduce an unscoped repository context`);
      }
      for (const excludedPath of binding.contextExcludedPaths) {
        const overlapsIncludedScope = binding.contextIncludedPathPrefixes.some((prefix) => prefix.endsWith('/') ? excludedPath.startsWith(prefix) : excludedPath === prefix);
        if (overlapsIncludedScope) fail('development_operation_binding_invalid', `Operation profile ${name}.binding.contextExcludedPaths overlaps the admitted context scope`);
      }
    }
  }
  if (input.kind === 'model_repository' && (binding === null || binding.profile !== CODEX_MODEL_BINDING_PROFILE || binding.executionBoundary !== CODEX_EXECUTION_BOUNDARY || typeof binding.outputSchemaPath !== 'string')) {
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

const NORMALIZED_DEVELOPMENT_OPERATION_MANIFESTS = new WeakSet();

export function normalizeDevelopmentOperationManifest(input) {
  if (input !== null && typeof input === 'object' && NORMALIZED_DEVELOPMENT_OPERATION_MANIFESTS.has(input)) return input;
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
  const normalized = deepFreeze(canonicalClone(manifest));
  NORMALIZED_DEVELOPMENT_OPERATION_MANIFESTS.add(normalized);
  return normalized;
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

function normalizeWritePaths(input, label = 'writePaths') {
  if (input === undefined || input === null) return null;
  if (!Array.isArray(input) || input.length === 0 || input.length > 256) {
    fail('development_operation_write_scope_invalid', `${label} must be a bounded non-empty array`);
  }
  const paths = input.map((value, index) => validateRelativePath(boundedText(value, `${label}[${index}]`, 4_096))).sort(compareText);
  for (let index = 1; index < paths.length; index += 1) {
    if (paths[index] === paths[index - 1]) fail('development_operation_write_scope_invalid', `${label} contains a duplicate path`);
  }
  return paths;
}

function normalizeBaseIdentity(input, { repositoryCommitOid, baseDigest, objectFormat = null, label = 'baseIdentity' } = {}) {
  if (input === undefined || input === null) return null;
  if (!isPlainRecord(input)) fail('development_operation_request_invalid', `${label} must be a record`);
  assertRecordShape(input, ['schemaVersion', 'profile', 'objectFormat', 'commitOid', 'treeOid', 'baseDigest', 'manifestDigest'], [], label);
  if (input.schemaVersion !== 1 || input.profile !== 'tdev.repository-base-identity.v1' ||
      !['sha1', 'sha256'].includes(input.objectFormat) ||
      (objectFormat !== null && input.objectFormat !== objectFormat) ||
      input.commitOid !== repositoryCommitOid || input.baseDigest !== baseDigest) {
    fail('development_operation_request_invalid', `${label} does not bind the repository context request`);
  }
  assertDigest(input.manifestDigest, `${label}.manifestDigest`);
  assertScalarString(input.treeOid, `${label}.treeOid`);
  const oidLength = input.objectFormat === 'sha1' ? 40 : 64;
  if (!new RegExp(`^[0-9a-f]{${oidLength}}$`, 'u').test(input.commitOid) ||
      !new RegExp(`^[0-9a-f]{${oidLength}}$`, 'u').test(input.treeOid)) {
    fail('development_operation_request_invalid', `${label} contains an invalid Git object identity`);
  }
  return canonicalClone(input);
}

function normalizeRequestInput(kind, input, profileName) {
  if (!isPlainRecord(input)) fail('development_operation_request_invalid', 'Development operation input must be a record');
  if (kind === 'repository_context') {
    const lazy = profileName === LAZY_CONTEXT_OPERATION_PROFILE;
    assertRecordShape(input, ['repositoryCommitOid', 'baseDigest', 'objectFormat'], lazy ? ['scope', 'baseIdentity', 'repositoryBaseIdentity'] : ['baseIdentity', 'repositoryBaseIdentity'], 'repository context operation input');
    assertScalarString(input.repositoryCommitOid, 'repositoryCommitOid');
    assertDigest(input.baseDigest, 'baseDigest');
    if (!['sha1', 'sha256'].includes(input.objectFormat)) fail('development_operation_request_invalid', 'objectFormat is unsupported');
    const normalized = canonicalClone(input);
    if (input.baseIdentity !== undefined) normalized.baseIdentity = normalizeBaseIdentity(input.baseIdentity, { repositoryCommitOid: input.repositoryCommitOid, baseDigest: input.baseDigest, objectFormat: input.objectFormat, label: 'repository context baseIdentity' });
    if (input.repositoryBaseIdentity !== undefined) normalized.repositoryBaseIdentity = normalizeRepositoryBaseIdentity(input.repositoryBaseIdentity, { repositoryCommitOid: input.repositoryCommitOid, objectFormat: input.objectFormat });
    if (lazy && (!isPlainRecord(input.scope) || Object.keys(input.scope).length === 0 || input.baseIdentity === undefined || input.baseIdentity === null)) fail('development_operation_request_invalid', 'Lazy context scope and full-base identity are required');
    return deepFreeze(normalized);
  }
  if (kind === 'model_repository') {
    assertRecordShape(input, ['repositoryCommitOid', 'baseDigest', 'instruction'], ['contextReferenceId', 'writePaths', 'objectFormat', 'contextProfile', 'contextScope', 'contextScopeDigest', 'baseIdentity', 'repositoryBaseIdentity'], 'model operation input');
    assertScalarString(input.repositoryCommitOid, 'repositoryCommitOid');
    assertDigest(input.baseDigest, 'baseDigest');
    boundedText(input.instruction, 'instruction', 64 * 1024);
    if (Object.hasOwn(input, 'contextReferenceId')) assertIdentifier(input.contextReferenceId, 'contextReferenceId');
    const normalized = canonicalClone(input);
    if (input.objectFormat !== undefined && !['sha1', 'sha256'].includes(input.objectFormat)) fail('development_operation_request_invalid', 'model operation objectFormat is unsupported');
    if (input.contextProfile !== undefined) {
      assertIdentifier(input.contextProfile, 'contextProfile');
      if (!["tdev.repository.context.prepare.v1", LAZY_CONTEXT_OPERATION_PROFILE].includes(input.contextProfile)) fail('development_operation_request_invalid', 'model contextProfile is unsupported');
      if (input.contextProfile === LAZY_CONTEXT_OPERATION_PROFILE && (!isPlainRecord(input.contextScope) || Object.keys(input.contextScope).length === 0 || input.baseIdentity === undefined || input.baseIdentity === null)) {
        fail('development_operation_request_invalid', 'lazy model contextProfile requires an owner-issued contextScope and full-base identity');
      }
    }
    if (input.contextScope !== undefined) {
      if (input.contextProfile !== LAZY_CONTEXT_OPERATION_PROFILE || !isPlainRecord(input.contextScope) || Object.keys(input.contextScope).length === 0) fail('development_operation_request_invalid', 'model contextScope requires the lazy context profile');
      normalized.contextScope = canonicalClone(input.contextScope);
    }
    if (input.contextScopeDigest !== undefined) assertDigest(input.contextScopeDigest, 'model contextScopeDigest');
    if (input.baseIdentity !== undefined) normalized.baseIdentity = normalizeBaseIdentity(input.baseIdentity, { repositoryCommitOid: input.repositoryCommitOid, baseDigest: input.baseDigest, objectFormat: input.objectFormat ?? null, label: 'model baseIdentity' });
    if (input.repositoryBaseIdentity !== undefined) normalized.repositoryBaseIdentity = normalizeRepositoryBaseIdentity(input.repositoryBaseIdentity, { repositoryCommitOid: input.repositoryCommitOid, objectFormat: input.objectFormat ?? undefined });
    if (Object.hasOwn(input, 'writePaths')) normalized.writePaths = normalizeWritePaths(input.writePaths);
    return deepFreeze(normalized);
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
  const operationInput = normalizeRequestInput(selected.kind, input.input, input.profile);
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
