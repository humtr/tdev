import {
  ContractError,
  assertDigest,
  assertIdentifier,
  assertRecordShape,
  assertSafeInteger,
  canonicalClone,
  canonicalJson,
  deepFreeze,
  digest,
  isPlainRecord,
  typedDigest,
} from './canonical.mjs';
import {
  normalizeLazyPlanScope,
  normalizeRepositoryBaseIdentity,
  scopeDigest,
} from './lazy-plan-reference.mjs';
import { validateRelativePath } from './policy.mjs';
import { validateTree } from './promotion.mjs';

export const MCP_SELF_CONTEXT_POLICY_PROFILE = 'tdev.mcp.self-context-policy.v1';
export const MCP_SELF_CONTEXT_DESCRIPTOR_PROFILE = 'tdev.mcp.self-context-descriptor.v1';
export const MCP_SELF_CONTEXT_REFERENCE_DOMAIN = 'tdev.mcp.self-context-reference.v1';
export const MCP_SELF_CONTEXT_REGISTRY_PREFIX = 'mcp:self-context:v1:';
export const MCP_SELF_CONTEXT_SOURCE_PREFIXES = Object.freeze(['config', 'docs/design', 'qualification', 'src', 'test']);
export const MCP_SELF_CONTEXT_SOURCE_PATHS = Object.freeze([
  'DIRECTIVE.md', 'RULE.md', 'SDD.md', 'WORKBOARD.md', 'package-lock.json', 'package.json',
]);
export const MCP_SELF_CONTEXT_POLICY = deepFreeze({
  schemaVersion: 1,
  profile: MCP_SELF_CONTEXT_POLICY_PROFILE,
  sourcePrefixes: [...MCP_SELF_CONTEXT_SOURCE_PREFIXES],
  sourcePaths: [...MCP_SELF_CONTEXT_SOURCE_PATHS],
  maxRequestEntries: 64,
  maxFiles: 128,
  maxBytes: 2 * 1024 * 1024,
  maxSearchResults: 128,
});
export const MCP_SELF_CONTEXT_POLICY_DIGEST = typedDigest(MCP_SELF_CONTEXT_POLICY_PROFILE, MCP_SELF_CONTEXT_POLICY);

const MANIFEST_PROFILE = 'tdev.repository-context.git-manifest.v1';
const CONTEXT_PROFILE = 'tdev.repository-context.git-scoped-lazy.v1';
const PREPARE_PROFILE = 'tdev.repository.context.prepare.lazy.v1';
const REGULAR_TEXT_MODES = new Set(['100644', '100755']);
const ENCODER = new TextEncoder();
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

function fail(code, message, details = undefined, options = undefined) {
  throw new ContractError(code, message, details, options);
}

function byteLength(value) {
  return ENCODER.encode(value).byteLength;
}

export function isMcpSelfContextSourcePath(value) {
  let filePath;
  try { filePath = validateRelativePath(value); }
  catch { return false; }
  return MCP_SELF_CONTEXT_SOURCE_PATHS.includes(filePath) ||
    MCP_SELF_CONTEXT_SOURCE_PREFIXES.some((prefix) => filePath === prefix || filePath.startsWith(`${prefix}/`));
}

function isMcpSelfContextSourcePrefix(value) {
  const prefix = validateRelativePath(value);
  return MCP_SELF_CONTEXT_SOURCE_PREFIXES.some((root) => prefix === root || prefix.startsWith(`${root}/`));
}

function boundedRequestArray(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MCP_SELF_CONTEXT_POLICY.maxRequestEntries) {
    fail('mcp_self_context_scope_invalid', `${label} must be a bounded array`);
  }
  const normalized = value.map((entry) => {
    if (typeof entry !== 'string' || entry.length === 0 || entry.includes('\0') || byteLength(entry) > 4096) {
      fail('mcp_self_context_scope_invalid', `${label} contains an invalid path`);
    }
    return validateRelativePath(entry);
  }).sort();
  if (new Set(normalized).size !== normalized.length) fail('mcp_self_context_scope_invalid', `${label} contains a duplicate path`);
  return normalized;
}

export function normalizeMcpSelfContextScopeRequest(value) {
  if (!isPlainRecord(value)) fail('mcp_self_context_scope_invalid', 'Self-context scope request must be an object');
  assertRecordShape(value, [], ['paths', 'prefixes'], 'self-context scope request');
  const paths = boundedRequestArray(value.paths, 'self-context paths');
  const prefixes = boundedRequestArray(value.prefixes, 'self-context prefixes');
  if (paths.length + prefixes.length === 0 || paths.length + prefixes.length > MCP_SELF_CONTEXT_POLICY.maxRequestEntries) {
    fail('mcp_self_context_scope_invalid', 'Self-context scope request must contain a bounded non-empty selection');
  }
  for (const filePath of paths) {
    if (!isMcpSelfContextSourcePath(filePath)) fail('mcp_self_context_scope_denied', `Path is outside the self-context policy: ${filePath}`);
  }
  for (const prefix of prefixes) {
    if (!isMcpSelfContextSourcePrefix(prefix)) fail('mcp_self_context_scope_denied', `Prefix is outside the self-context policy: ${prefix}`);
  }
  return normalizeLazyPlanScope({
    paths,
    prefixes,
    maxFiles: MCP_SELF_CONTEXT_POLICY.maxFiles,
    maxBytes: MCP_SELF_CONTEXT_POLICY.maxBytes,
    maxSearchResults: MCP_SELF_CONTEXT_POLICY.maxSearchResults,
  });
}

function manifestRows(raw, repositoryBaseIdentity) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 100_000) fail('mcp_self_context_manifest_invalid', 'Self-context manifest is invalid');
  const rows = raw.map((entry) => {
    if (!isPlainRecord(entry)) fail('mcp_self_context_manifest_invalid', 'Self-context manifest entry is invalid');
    assertRecordShape(entry, ['path', 'mode', 'type', 'blobOid', 'byteLength'], [], 'self-context manifest entry');
    const filePath = validateRelativePath(entry.path);
    const oidLength = repositoryBaseIdentity.objectFormat === 'sha1' ? 40 : 64;
    if (!new RegExp(`^[0-9a-f]{${oidLength}}$`, 'u').test(entry.blobOid) || !/^[0-7]{6}$/u.test(entry.mode) || !['blob', 'commit'].includes(entry.type)) {
      fail('mcp_self_context_manifest_invalid', `Manifest identity is invalid for ${filePath}`);
    }
    if (entry.byteLength !== null) assertSafeInteger(entry.byteLength, 'self-context manifest byteLength', { min: 0 });
    return { path: filePath, mode: entry.mode, type: entry.type, blobOid: entry.blobOid, byteLength: entry.byteLength };
  });
  rows.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index - 1].path === rows[index].path) fail('mcp_self_context_manifest_invalid', 'Self-context manifest contains a duplicate path');
  }
  const identity = {
    schemaVersion: 1,
    profile: MANIFEST_PROFILE,
    objectFormat: repositoryBaseIdentity.objectFormat,
    commitOid: repositoryBaseIdentity.commitOid,
    treeOid: repositoryBaseIdentity.treeOid,
    entries: rows,
  };
  if (typedDigest(MANIFEST_PROFILE, identity) !== repositoryBaseIdentity.manifestDigest) {
    fail('mcp_self_context_manifest_invalid', 'Self-context manifest does not match the exact repository identity');
  }
  return rows;
}

function selectedRowsForScope(rows, scope) {
  for (const path of scope.paths) {
    if (!rows.some((entry) => entry.path === path)) fail('mcp_self_context_scope_stale', `Requested path does not exist in the exact release: ${path}`);
  }
  for (const prefix of scope.prefixes) {
    if (!rows.some((entry) => entry.path === prefix || entry.path.startsWith(`${prefix}/`))) {
      fail('mcp_self_context_scope_stale', `Requested prefix selects no exact-release path: ${prefix}`);
    }
  }
  const selected = rows.filter((entry) => scope.paths.includes(entry.path) || scope.prefixes.some((prefix) => entry.path === prefix || entry.path.startsWith(`${prefix}/`)));
  if (selected.length === 0 || selected.length > scope.maxFiles) fail('mcp_self_context_scope_limit', 'Self-context selection is outside its file bound');
  const selectedBytes = selected.reduce((sum, entry) => sum + (entry.byteLength ?? 0), 0);
  if (selectedBytes > scope.maxBytes) fail('mcp_self_context_scope_limit', 'Self-context selection is outside its byte bound', { selectedBytes });
  return selected;
}

async function gitBlobOid(bytes, objectFormat) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof subtle.digest !== 'function') fail('mcp_self_context_crypto_unavailable', 'WebCrypto digest is unavailable');
  const header = ENCODER.encode(`blob ${bytes.byteLength}\0`);
  const input = new Uint8Array(header.byteLength + bytes.byteLength);
  input.set(header, 0);
  input.set(bytes, header.byteLength);
  const algorithm = objectFormat === 'sha1' ? 'SHA-1' : 'SHA-256';
  const value = new Uint8Array(await subtle.digest(algorithm, input));
  return [...value].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function bytesFrom(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return null;
}

function registryKey(referenceId) {
  assertIdentifier(referenceId, 'self-context referenceId');
  return `${MCP_SELF_CONTEXT_REGISTRY_PREFIX}${referenceId}`;
}

function publicProjection(context) {
  return deepFreeze({
    revisionId: context.revisionId,
    repositoryCommitOid: context.repositoryCommitOid,
    objectFormat: context.objectFormat,
    contextReferenceId: context.contextReferenceId,
    baseDigest: context.baseDigest,
    contextProfile: context.contextProfile,
    contextScope: canonicalClone(context.contextScope),
    scopeDigest: context.scopeDigest,
  });
}

export function createMcpSelfContextOwner({ repository, registry, sourceProvider } = {}) {
  if (!isPlainRecord(repository) || !isPlainRecord(repository.context) || !isPlainRecord(repository.repositoryBaseIdentity)) {
    fail('mcp_self_context_owner_invalid', 'Self-context owner requires the exact repository composition');
  }
  const repositoryBaseIdentity = normalizeRepositoryBaseIdentity(repository.repositoryBaseIdentity, {
    objectFormat: repository.objectFormat,
    commitOid: repository.commitOid,
  });
  if (repositoryBaseIdentity.commitOid !== repository.commitOid || repositoryBaseIdentity.objectFormat !== repository.objectFormat) {
    fail('mcp_self_context_owner_invalid', 'Self-context repository identity does not match the canonical composition');
  }
  if (!sourceProvider || typeof sourceProvider.loadManifest !== 'function' || typeof sourceProvider.loadBlob !== 'function') {
    fail('mcp_self_context_owner_invalid', 'Self-context source provider is unavailable');
  }
  if (!registry || typeof registry.get !== 'function') fail('mcp_self_context_owner_invalid', 'Self-context registry reader is unavailable');
  let manifestPromise = null;
  const contextPromises = new Map();

  async function manifest() {
    if (manifestPromise === null) manifestPromise = Promise.resolve(sourceProvider.loadManifest()).then((value) => manifestRows(value, repositoryBaseIdentity));
    return manifestPromise;
  }

  async function materialize(scope) {
    const rows = await manifest();
    const selectedRows = selectedRowsForScope(rows, scope);
    const tree = {};
    for (const row of selectedRows) {
      if (!isMcpSelfContextSourcePath(row.path) || row.type !== 'blob' || !REGULAR_TEXT_MODES.has(row.mode) || row.byteLength === null) {
        fail('mcp_self_context_unsupported', `Self-context selected unsupported entry ${row.path}`);
      }
      const raw = bytesFrom(await sourceProvider.loadBlob(row.blobOid));
      if (raw === null || raw.byteLength !== row.byteLength) fail('mcp_self_context_blob_invalid', `Self-context blob is unavailable or has wrong size: ${row.path}`);
      if (await gitBlobOid(raw, repository.objectFormat) !== row.blobOid) fail('mcp_self_context_blob_invalid', `Self-context blob identity changed: ${row.path}`);
      try { tree[row.path] = UTF8_DECODER.decode(raw); }
      catch (cause) { fail('mcp_self_context_non_utf8', `Self-context selected blob is not UTF-8: ${row.path}`, {}, { cause }); }
    }
    const normalizedTree = validateTree(tree, repository.context.caseContract);
    return deepFreeze({ selectedRows, tree: normalizedTree, baseDigest: digest(normalizedTree) });
  }

  function descriptorFor(scope, materialized) {
    const normalizedScopeDigest = scopeDigest(scope);
    const identity = {
      schemaVersion: 1,
      profile: MCP_SELF_CONTEXT_DESCRIPTOR_PROFILE,
      policyDigest: MCP_SELF_CONTEXT_POLICY_DIGEST,
      repositoryBaseIdentity,
      scope,
      scopeDigest: normalizedScopeDigest,
      semanticBaseDigest: materialized.baseDigest,
    };
    const referenceDigest = typedDigest(MCP_SELF_CONTEXT_REFERENCE_DOMAIN, identity);
    const referenceId = `tdev-context-${repository.commitOid.slice(0, 12)}-${referenceDigest.slice('sha256:'.length, 'sha256:'.length + 24)}`;
    const revisionId = `tdev-mcp-${repository.commitOid.slice(0, 12)}-${normalizedScopeDigest.slice('sha256:'.length, 'sha256:'.length + 16)}`;
    return deepFreeze({ ...identity, referenceId, revisionId, descriptorDigest: digest(identity) });
  }

  function normalizeDescriptor(value, expectedReference = null) {
    if (!isPlainRecord(value)) fail('mcp_self_context_reference_unknown', 'Self-context reference is unknown');
    assertRecordShape(value, ['schemaVersion', 'profile', 'policyDigest', 'repositoryBaseIdentity', 'scope', 'scopeDigest', 'semanticBaseDigest', 'referenceId', 'revisionId', 'descriptorDigest'], [], 'self-context descriptor');
    if (value.schemaVersion !== 1 || value.profile !== MCP_SELF_CONTEXT_DESCRIPTOR_PROFILE || value.policyDigest !== MCP_SELF_CONTEXT_POLICY_DIGEST) {
      fail('mcp_self_context_reference_stale', 'Self-context descriptor policy is stale');
    }
    assertIdentifier(value.referenceId, 'self-context descriptor referenceId');
    assertIdentifier(value.revisionId, 'self-context descriptor revisionId');
    assertDigest(value.scopeDigest, 'self-context descriptor scopeDigest');
    assertDigest(value.semanticBaseDigest, 'self-context descriptor semanticBaseDigest');
    assertDigest(value.descriptorDigest, 'self-context descriptor descriptorDigest');
    if (expectedReference !== null && value.referenceId !== expectedReference) fail('mcp_self_context_reference_corrupt', 'Self-context descriptor reference changed');
    const normalizedRepository = normalizeRepositoryBaseIdentity(value.repositoryBaseIdentity, { objectFormat: repository.objectFormat, commitOid: repository.commitOid });
    if (canonicalJson(normalizedRepository) !== canonicalJson(repositoryBaseIdentity)) fail('mcp_self_context_reference_stale', 'Self-context descriptor repository base is stale');
    const scope = normalizeLazyPlanScope(value.scope);
    if (value.scopeDigest !== scopeDigest(scope)) fail('mcp_self_context_reference_corrupt', 'Self-context descriptor scope digest changed');
    const identity = {
      schemaVersion: 1,
      profile: MCP_SELF_CONTEXT_DESCRIPTOR_PROFILE,
      policyDigest: value.policyDigest,
      repositoryBaseIdentity: normalizedRepository,
      scope,
      scopeDigest: value.scopeDigest,
      semanticBaseDigest: value.semanticBaseDigest,
    };
    if (value.descriptorDigest !== digest(identity)) fail('mcp_self_context_reference_corrupt', 'Self-context descriptor digest changed');
    const referenceDigest = typedDigest(MCP_SELF_CONTEXT_REFERENCE_DOMAIN, identity);
    const referenceId = `tdev-context-${repository.commitOid.slice(0, 12)}-${referenceDigest.slice('sha256:'.length, 'sha256:'.length + 24)}`;
    if (referenceId !== value.referenceId) fail('mcp_self_context_reference_corrupt', 'Self-context descriptor reference digest changed');
    return deepFreeze({ ...identity, referenceId, revisionId: value.revisionId, descriptorDigest: value.descriptorDigest });
  }

  async function contextFromDescriptor(descriptor) {
    if (!contextPromises.has(descriptor.referenceId)) {
      contextPromises.set(descriptor.referenceId, (async () => {
        const materialized = await materialize(descriptor.scope);
        if (materialized.baseDigest !== descriptor.semanticBaseDigest) fail('mcp_self_context_reference_stale', 'Self-context semantic base changed');
        const baseIdentity = {
          schemaVersion: 1,
          profile: 'tdev.repository-base-identity.v1',
          objectFormat: repository.objectFormat,
          commitOid: repository.commitOid,
          treeOid: repositoryBaseIdentity.treeOid,
          baseDigest: materialized.baseDigest,
          manifestDigest: repositoryBaseIdentity.manifestDigest,
        };
        const fixed = repository.context;
        return deepFreeze({
          revisionId: descriptor.revisionId,
          baseTree: materialized.tree,
          repositoryCommitOid: repository.commitOid,
          objectFormat: repository.objectFormat,
          contextReferenceId: descriptor.referenceId,
          ...(fixed.contextCapabilityId === undefined ? {} : { contextCapabilityId: fixed.contextCapabilityId }),
          ...(fixed.modelCapabilityId === undefined ? {} : { modelCapabilityId: fixed.modelCapabilityId }),
          ...(fixed.validationCapabilityId === undefined ? {} : { validationCapabilityId: fixed.validationCapabilityId }),
          writePaths: materialized.selectedRows.map((entry) => entry.path),
          ...(fixed.caseContract === undefined ? {} : { caseContract: canonicalClone(fixed.caseContract) }),
          ...(fixed.payload === undefined ? {} : { payload: canonicalClone(fixed.payload) }),
          contextProfile: PREPARE_PROFILE,
          contextScope: descriptor.scope,
          scopeDigest: descriptor.scopeDigest,
          baseIdentity,
          repositoryBaseIdentity,
          baseDigest: materialized.baseDigest,
        });
      })());
    }
    return contextPromises.get(descriptor.referenceId);
  }

  async function loadDescriptor(referenceId) {
    assertIdentifier(referenceId, 'self-context referenceId');
    return normalizeDescriptor(await registry.get(registryKey(referenceId)), referenceId);
  }

  async function issue(scopeRequest) {
    if (typeof registry.put !== 'function') fail('mcp_self_context_registry_read_only', 'Self-context registry cannot issue a reference here');
    const scope = normalizeMcpSelfContextScopeRequest(scopeRequest);
    const materialized = await materialize(scope);
    const descriptor = descriptorFor(scope, materialized);
    const key = registryKey(descriptor.referenceId);
    const existing = await registry.get(key);
    if (existing === undefined || existing === null) await registry.put(key, canonicalClone(descriptor));
    else if (canonicalJson(normalizeDescriptor(existing, descriptor.referenceId)) !== canonicalJson(descriptor)) {
      fail('mcp_self_context_reference_corrupt', 'Existing self-context descriptor does not match deterministic issuance');
    }
    const context = await contextFromDescriptor(descriptor);
    return publicProjection(context);
  }

  async function resolve(referenceId) {
    return contextFromDescriptor(await loadDescriptor(referenceId));
  }

  async function get(referenceId) {
    return publicProjection(await resolve(referenceId));
  }

  async function list({ contextReference, cursor = 0, limit } = {}) {
    const descriptor = await loadDescriptor(contextReference);
    const context = await contextFromDescriptor(descriptor);
    const rows = selectedRowsForScope(await manifest(), descriptor.scope);
    const offset = assertSafeInteger(cursor, 'self-context list cursor', { min: 0, max: rows.length });
    const pageLimit = limit === undefined ? Math.min(128, descriptor.scope.maxFiles) : assertSafeInteger(limit, 'self-context list limit', { min: 1, max: 128 });
    const entries = rows.slice(offset, offset + pageLimit).map((entry) => canonicalClone(entry));
    const nextCursor = offset + entries.length < rows.length ? offset + entries.length : null;
    return deepFreeze({ profile: CONTEXT_PROFILE, manifestDigest: repositoryBaseIdentity.manifestDigest, scopeDigest: context.scopeDigest, entries, nextCursor, complete: nextCursor === null });
  }

  async function read({ contextReference, path, startByte = 0, maxBytes } = {}) {
    const descriptor = await loadDescriptor(contextReference);
    const context = await contextFromDescriptor(descriptor);
    const filePath = validateRelativePath(path);
    if (!Object.hasOwn(context.baseTree, filePath)) fail('lazy_scope_denied', `Path is outside the owner-issued lazy scope: ${filePath}`);
    const row = selectedRowsForScope(await manifest(), descriptor.scope).find((entry) => entry.path === filePath);
    const offset = assertSafeInteger(startByte, 'self-context read startByte', { min: 0, max: row.byteLength });
    const readLimit = maxBytes === undefined ? descriptor.scope.maxBytes : assertSafeInteger(maxBytes, 'self-context read maxBytes', { min: 1, max: descriptor.scope.maxBytes });
    const endByte = Math.min(row.byteLength, offset + readLimit);
    const bytes = ENCODER.encode(context.baseTree[filePath]).slice(offset, endByte);
    let content;
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch (cause) { fail('lazy_read_range_not_utf8', 'Lazy read range is not a complete UTF-8 sequence', {}, { cause }); }
    return deepFreeze({ profile: CONTEXT_PROFILE, path: filePath, mode: row.mode, type: row.type, blobOid: row.blobOid, byteLength: row.byteLength, startByte: offset, endByte, complete: endByte === row.byteLength, content });
  }

  async function search({ contextReference, pattern, cursor = 0, limit } = {}) {
    const descriptor = await loadDescriptor(contextReference);
    const context = await contextFromDescriptor(descriptor);
    if (typeof pattern !== 'string' || pattern.length === 0 || pattern.includes('\0') || byteLength(pattern) > 4096) fail('mcp_self_context_search_invalid', 'Self-context search pattern is invalid');
    const rows = selectedRowsForScope(await manifest(), descriptor.scope);
    const offset = assertSafeInteger(cursor, 'self-context search cursor', { min: 0, max: rows.length });
    const resultLimit = limit === undefined ? Math.min(64, descriptor.scope.maxSearchResults) : assertSafeInteger(limit, 'self-context search limit', { min: 1, max: descriptor.scope.maxSearchResults });
    const matches = [];
    let visitedFiles = 0;
    let visitedBytes = 0;
    let index = offset;
    let complete = true;
    while (index < rows.length) {
      if (matches.length >= resultLimit) { complete = false; break; }
      const row = rows[index++];
      if (visitedBytes + row.byteLength > descriptor.scope.maxBytes) { complete = false; break; }
      visitedFiles += 1;
      visitedBytes += row.byteLength;
      if (context.baseTree[row.path].includes(pattern)) matches.push(row.path);
    }
    return deepFreeze({ profile: CONTEXT_PROFILE, manifestDigest: repositoryBaseIdentity.manifestDigest, scopeDigest: context.scopeDigest, matches, nextCursor: complete ? null : index, complete, visitedFiles, visitedBytes });
  }

  return Object.freeze({ issue, get, resolve, list, read, search });
}
