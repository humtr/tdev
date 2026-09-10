import { gzipSync } from 'node:zlib';

import { runGitCommand } from '../src/git-projection.mjs';
import {
  canonicalJson,
  digest,
  typedDigest,
} from '../src/canonical.mjs';
import {
  createRepositoryBaseIdentity,
  normalizeLazyPlanScope,
  scopeDigest,
} from '../src/lazy-plan-reference.mjs';
import { validateTree } from '../src/promotion.mjs';

const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
const GIT_OID = /^[0-9a-f]{40,64}$/u;
const GIT_OBJECT_FORMATS = new Set(['sha1', 'sha256']);
const REGULAR_TEXT_MODES = new Set(['100644', '100755']);
const GENERATED_MODULE = 'qualification/mcp-trial-base-tree.mjs';
const MANIFEST_PROFILE = 'tdev.repository-context.git-manifest.v1';

function fail(code, message, details = undefined, options = undefined) {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  if (options?.cause !== undefined) error.cause = options.cause;
  throw error;
}

async function git(repositoryPath, args, input = null) {
  const result = await runGitCommand({ repositoryPath, args, input });
  if (result.code !== 0) {
    fail('mcp_base_tree_git_failed', `Git ${args[0]} failed`, {
      exitCode: result.code,
      stderr: result.stderr.toString('utf8').slice(0, 4096),
    });
  }
  return result.stdout;
}

function oidLength(objectFormat) {
  return objectFormat === 'sha1' ? 40 : objectFormat === 'sha256' ? 64 : 0;
}

function assertOid(value, objectFormat, label) {
  const length = oidLength(objectFormat);
  if (length === 0 || typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${length}}$`, 'u').test(value)) {
    fail('mcp_base_tree_git_tree_invalid', `${label} is not a valid ${objectFormat} object ID`);
  }
  return value;
}

function decodeBlob(bytes, label) {
  try { return UTF8_DECODER.decode(bytes); }
  catch (cause) { fail('mcp_base_tree_non_utf8', `${label} is not UTF-8`, {}, { cause }); }
}

function parseTreeListing(bytes, commitOid, objectFormat) {
  const rows = [];
  for (const record of bytes.toString('utf8').split('\0').filter(Boolean)) {
    const tab = record.indexOf('\t');
    if (tab < 1) fail('mcp_base_tree_git_tree_invalid', 'Git tree listing is malformed');
    const fields = record.slice(0, tab).trim().split(/ +/u);
    const filePath = record.slice(tab + 1);
    if (fields.length !== 4 || !/^[0-7]{6}$/u.test(fields[0]) || !['blob', 'commit'].includes(fields[1]) ||
        !GIT_OID.test(fields[2]) || filePath.length === 0 || filePath.includes('\0')) {
      fail('mcp_base_tree_git_tree_invalid', 'Git tree contains an unsupported entry', { commitOid, filePath });
    }
    assertOid(fields[2], objectFormat, 'Git tree object ID');
    let byteLength = null;
    if (fields[3] !== '-') {
      if (!/^(0|[1-9][0-9]*)$/u.test(fields[3])) fail('mcp_base_tree_git_tree_invalid', 'Git tree entry size is malformed', { path: filePath });
      byteLength = Number(fields[3]);
      if (!Number.isSafeInteger(byteLength)) fail('mcp_base_tree_manifest_limit', 'Git tree entry size exceeds the safe integer bound', { path: filePath });
    }
    rows.push({ mode: fields[0], type: fields[1], blobOid: fields[2], byteLength, path: filePath });
  }
  rows.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index].path === rows[index - 1].path) fail('mcp_base_tree_duplicate_path', 'Git tree contains a duplicate path');
  }
  return rows;
}

function parseBatch(bytes, oids, objectFormat) {
  const contentsByOid = new Map();
  let offset = 0;
  for (const oid of oids) {
    const headerEnd = bytes.indexOf(0x0a, offset);
    if (headerEnd < 0) fail('mcp_base_tree_git_blob_invalid', 'Git blob batch header is truncated');
    const fields = bytes.subarray(offset, headerEnd).toString('ascii').split(' ');
    if (fields.length !== 3 || fields[0] !== oid || fields[1] !== 'blob' || !/^(0|[1-9][0-9]*)$/u.test(fields[2])) {
      fail('mcp_base_tree_git_blob_invalid', 'Git blob batch identity is invalid');
    }
    assertOid(fields[0], objectFormat, 'Git blob batch object ID');
    const size = Number(fields[2]);
    const start = headerEnd + 1;
    const end = start + size;
    if (!Number.isSafeInteger(size) || end >= bytes.length || bytes[end] !== 0x0a) {
      fail('mcp_base_tree_git_blob_invalid', 'Git blob batch content is truncated');
    }
    contentsByOid.set(oid, bytes.subarray(start, end));
    offset = end + 1;
  }
  if (offset !== bytes.length) fail('mcp_base_tree_git_blob_invalid', 'Git blob batch has trailing bytes');
  return contentsByOid;
}

function manifestIdentity({ objectFormat, commitOid, treeOid, entries }) {
  return {
    schemaVersion: 1,
    profile: MANIFEST_PROFILE,
    objectFormat,
    commitOid,
    treeOid,
    entries: entries.map(({ path, mode, type, blobOid, byteLength }) => ({ path, mode, type, blobOid, byteLength })),
  };
}

function selectedPath(filePath, scope) {
  return scope.paths.includes(filePath) || scope.prefixes.some((prefix) => filePath === prefix || filePath.startsWith(`${prefix}/`));
}

function generatedModule({ commitOid, treeOid, objectFormat, semanticBaseDigest, repositoryBaseIdentity, scope, manifestEntries, selectedTree }) {
  const encode = (value) => gzipSync(Buffer.from(canonicalJson(value), 'utf8'), { level: 9, mtime: 0 }).toString('base64');
  const selectedLiteral = canonicalJson(selectedTree);
  const manifestPayload = encode(manifestEntries);
  const chunks = (value) => {
    const result = [];
    for (let offset = 0; offset < value.length; offset += 120) result.push(JSON.stringify(value.slice(offset, offset + 120)));
    return result.join(',\n  ');
  };
  return [
    '// Generated at deployment from one exact commit and owner-issued scope.',
    '// The module contains selected UTF-8 content and complete manifest metadata only.',
    `const MCP_TRIAL_BASE_COMMIT_OID = ${JSON.stringify(commitOid)};`,
    `const MCP_TRIAL_BASE_TREE_OID = ${JSON.stringify(treeOid)};`,
    `const MCP_TRIAL_BASE_OBJECT_FORMAT = ${JSON.stringify(objectFormat)};`,
    `const MCP_TRIAL_BASE_DIGEST = ${JSON.stringify(semanticBaseDigest)};`,
    `const MCP_TRIAL_REPOSITORY_BASE_IDENTITY = ${JSON.stringify(repositoryBaseIdentity)};`,
    `const MCP_TRIAL_SCOPE = ${JSON.stringify(scope)};`,
    `const MCP_TRIAL_SCOPE_DIGEST = ${JSON.stringify(scopeDigest(scope))};`,
    `const MCP_TRIAL_MANIFEST_DIGEST = ${JSON.stringify(repositoryBaseIdentity.manifestDigest)};`,
    `const MCP_TRIAL_SELECTED_TREE = Object.freeze(${selectedLiteral});`,
    `const MCP_TRIAL_MANIFEST_GZIP_BASE64 = [\n  ${chunks(manifestPayload)}\n].join('');`,
    'let manifestPromise = null;',
    '',
    'function decodeBase64(value) {',
    '  const binary = atob(value);',
    '  const bytes = new Uint8Array(binary.length);',
    '  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);',
    '  return bytes;',
    '}',
    '',
    'async function decodeJson(value, errorCode) {',
    "  if (typeof DecompressionStream !== 'function') throw new Error('mcp_base_tree_decompression_unavailable');",
    "  const stream = new Response(decodeBase64(value)).body.pipeThrough(new DecompressionStream('gzip'));",
    '  const parsed = JSON.parse(await new Response(stream).text());',
    "  if (parsed === null || typeof parsed !== 'object') throw new Error(errorCode);",
    '  return parsed;',
    '}',
    '',
    'export async function loadMcpTrialBaseTree() {',
    '  return MCP_TRIAL_SELECTED_TREE;',
    '}',
    '',
    'export async function loadMcpTrialManifest() {',
    '  if (manifestPromise === null) manifestPromise = (async () => {',
    "    const value = await decodeJson(MCP_TRIAL_MANIFEST_GZIP_BASE64, 'mcp_base_manifest_payload_invalid');",
    "    if (!Array.isArray(value)) throw new Error('mcp_base_manifest_payload_invalid');",
    '    return value;',
    '  })();',
    '  return manifestPromise;',
    '}',
    '',
    'export async function loadMcpTrialLazyContext() {',
    '  return {',
    '    tree: await loadMcpTrialBaseTree(),',
    '    manifest: await loadMcpTrialManifest(),',
    '    repositoryBaseIdentity: MCP_TRIAL_REPOSITORY_BASE_IDENTITY,',
    '    scope: MCP_TRIAL_SCOPE,',
    '    scopeDigest: MCP_TRIAL_SCOPE_DIGEST,',
    '    semanticBaseDigest: MCP_TRIAL_BASE_DIGEST,',
    '    commitOid: MCP_TRIAL_BASE_COMMIT_OID,',
    '    treeOid: MCP_TRIAL_BASE_TREE_OID,',
    '    objectFormat: MCP_TRIAL_BASE_OBJECT_FORMAT,',
    '    manifestDigest: MCP_TRIAL_MANIFEST_DIGEST,',
    '  };',
    '}',
    '',
    'export { MCP_TRIAL_BASE_COMMIT_OID, MCP_TRIAL_BASE_TREE_OID, MCP_TRIAL_BASE_OBJECT_FORMAT, MCP_TRIAL_BASE_DIGEST, MCP_TRIAL_REPOSITORY_BASE_IDENTITY, MCP_TRIAL_SCOPE, MCP_TRIAL_SCOPE_DIGEST, MCP_TRIAL_MANIFEST_DIGEST };',
    '',
  ].join('\n');
}

/**
 * Build a provider module from complete Git metadata and one owner-issued
 * semantic scope. Unselected blobs are never read or decoded. `excludedPaths`
 * is intentionally rejected because it would change the complete repository
 * meaning instead of declaring a scoped context.
 */
export async function buildMcpTrialBaseTreeModule({ repositoryPath, commitOid, scope, excludedPaths = undefined } = {}) {
  if (typeof repositoryPath !== 'string' || repositoryPath.length === 0) fail('mcp_base_tree_repository_invalid', 'repositoryPath is required');
  if (typeof commitOid !== 'string' || !GIT_OID.test(commitOid)) fail('mcp_base_tree_commit_invalid', 'commitOid is invalid');
  if (excludedPaths !== undefined) fail('mcp_base_tree_exclusion_forbidden', 'Provider context must use an owner-issued scope instead of excludedPaths');
  const objectFormat = (await git(repositoryPath, ['rev-parse', '--show-object-format'])).toString('utf8').trim();
  if (!GIT_OBJECT_FORMATS.has(objectFormat)) fail('mcp_base_tree_object_format_invalid', 'Repository object format is unsupported');
  assertOid(commitOid, objectFormat, 'commitOid');
  const treeOid = (await git(repositoryPath, ['rev-parse', `${commitOid}^{tree}`])).toString('utf8').trim();
  assertOid(treeOid, objectFormat, 'treeOid');
  const normalizedScope = normalizeLazyPlanScope(scope);
  const rows = parseTreeListing(await git(repositoryPath, ['ls-tree', '-r', '-z', '-l', commitOid]), commitOid, objectFormat);
  const selectedRows = rows.filter((row) => selectedPath(row.path, normalizedScope));
  if (selectedRows.length === 0) fail('mcp_base_tree_scope_empty', 'Owner-issued scope selects no manifest entry');
  if (selectedRows.length > normalizedScope.maxFiles) fail('mcp_base_tree_scope_limit_exceeded', 'Owner-issued scope exceeds its file bound');
  const selectedBytes = selectedRows.reduce((sum, row) => sum + (row.byteLength ?? 0), 0);
  if (selectedBytes > normalizedScope.maxBytes) fail('mcp_base_tree_scope_limit_exceeded', 'Owner-issued scope exceeds its byte bound', { selectedBytes });
  const manifest = manifestIdentity({ objectFormat, commitOid, treeOid, entries: rows });
  const manifestDigest = typedDigest(MANIFEST_PROFILE, manifest);
  const repositoryBaseIdentity = createRepositoryBaseIdentity({ objectFormat, commitOid, treeOid, manifestDigest });
  const selectedOids = [...new Set(selectedRows.map((row) => row.blobOid))];
  const contents = selectedOids.length === 0
    ? new Map()
    : parseBatch(await git(repositoryPath, ['cat-file', '--batch'], Buffer.from(`${selectedOids.join('\n')}\n`, 'ascii')), selectedOids, objectFormat);
  const selectedTree = {};
  for (const row of selectedRows) {
    if (row.type !== 'blob' || !REGULAR_TEXT_MODES.has(row.mode) || row.byteLength === null) {
      fail('mcp_base_tree_selected_unsupported', `Owner-issued scope selected unsupported entry ${row.path}`, { path: row.path, mode: row.mode, type: row.type });
    }
    const raw = contents.get(row.blobOid);
    if (raw === undefined || raw.byteLength !== row.byteLength) fail('mcp_base_tree_git_blob_invalid', 'Git blob size does not match tree metadata', { path: row.path });
    selectedTree[row.path] = decodeBlob(raw, `Git blob ${row.blobOid}`);
  }
  const normalizedTree = validateTree(selectedTree);
  const semanticBaseDigest = digest(normalizedTree);
  const source = generatedModule({
    commitOid,
    treeOid,
    objectFormat,
    semanticBaseDigest,
    repositoryBaseIdentity,
    scope: normalizedScope,
    manifestEntries: rows,
    selectedTree: normalizedTree,
  });
  return Object.freeze({
    moduleName: GENERATED_MODULE,
    source,
    commitOid,
    treeOid,
    objectFormat,
    baseDigest: semanticBaseDigest,
    semanticBaseDigest,
    repositoryBaseIdentity,
    manifestDigest,
    scope: normalizedScope,
    scopeDigest: scopeDigest(normalizedScope),
    manifest: Object.freeze(rows.map((row) => Object.freeze({ ...row }))),
    selectedEntries: Object.freeze(selectedRows.map((row) => Object.freeze({ ...row }))),
    fileCount: Object.keys(normalizedTree).length,
    manifestEntryCount: rows.length,
    semanticBytes: Buffer.byteLength(canonicalJson(normalizedTree), 'utf8'),
    selectedBytes,
    compressedBytes: Buffer.byteLength(source, 'utf8'),
    moduleBytes: Buffer.byteLength(source, 'utf8'),
    tree: normalizedTree,
  });
}

export { GENERATED_MODULE as MCP_TRIAL_BASE_TREE_MODULE };
