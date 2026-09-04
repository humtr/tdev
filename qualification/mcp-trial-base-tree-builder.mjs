import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { runGitCommand } from '../src/git-projection.mjs';
import { canonicalJson } from '../src/canonical.mjs';
import { validateTree } from '../src/promotion.mjs';

const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
const GIT_OID = /^[0-9a-f]{40,64}$/u;
const GIT_TREE_MODE = new Set(['100644', '100755']);
const GENERATED_MODULE = 'qualification/mcp-trial-base-tree.mjs';

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

function decodeBlob(bytes, label) {
  try { return UTF8_DECODER.decode(bytes); }
  catch (cause) { fail('mcp_base_tree_non_utf8', `${label} is not UTF-8`, {}, { cause }); }
}

function parseTreeListing(bytes, commitOid) {
  const rows = [];
  for (const record of bytes.toString('utf8').split('\0').filter(Boolean)) {
    const tab = record.indexOf('\t');
    if (tab < 1) fail('mcp_base_tree_git_tree_invalid', 'Git tree listing is malformed');
    const fields = record.slice(0, tab).trim().split(/ +/u);
    const filePath = record.slice(tab + 1);
    if (fields.length !== 4 || !GIT_TREE_MODE.has(fields[0]) || fields[1] !== 'blob' ||
        !GIT_OID.test(fields[2]) || !/^[0-9]+$/u.test(fields[3]) || filePath.length === 0 || filePath.includes('\0')) {
      fail('mcp_base_tree_git_tree_invalid', 'Git tree contains an unsupported entry', { commitOid });
    }
    rows.push({ mode: fields[0], blobOid: fields[2], byteLength: Number(fields[3]), path: filePath });
  }
  rows.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index].path === rows[index - 1].path) fail('mcp_base_tree_duplicate_path', 'Git tree contains a duplicate path');
  }
  return rows;
}

function parseBatch(bytes, oids) {
  const contentByOid = new Map();
  let offset = 0;
  for (const oid of oids) {
    const headerEnd = bytes.indexOf(0x0a, offset);
    if (headerEnd < 0) fail('mcp_base_tree_git_blob_invalid', 'Git blob batch header is truncated');
    const fields = bytes.subarray(offset, headerEnd).toString('ascii').split(' ');
    if (fields.length !== 3 || fields[0] !== oid || fields[1] !== 'blob' || !/^[0-9]+$/u.test(fields[2])) {
      fail('mcp_base_tree_git_blob_invalid', 'Git blob batch identity is invalid');
    }
    const size = Number(fields[2]);
    const start = headerEnd + 1;
    const end = start + size;
    if (!Number.isSafeInteger(size) || end >= bytes.length || bytes[end] !== 0x0a) {
      fail('mcp_base_tree_git_blob_invalid', 'Git blob batch content is truncated');
    }
    contentByOid.set(oid, bytes.subarray(start, end));
    offset = end + 1;
  }
  if (offset !== bytes.length) fail('mcp_base_tree_git_blob_invalid', 'Git blob batch has trailing bytes');
  return contentByOid;
}

function generatedModule({ commitOid, baseDigest, compressed }) {
  const encoded = compressed.toString('base64');
  const chunks = [];
  for (let offset = 0; offset < encoded.length; offset += 120) {
    chunks.push(JSON.stringify(encoded.slice(offset, offset + 120)));
  }
  const payload = [
    'const MCP_TRIAL_BASE_GZIP_BASE64 = [',
    `  ${chunks.join(',\n  ')}`,
    "].join('');",
  ].join('\n');
  return [
    '// Generated at deployment from the exact published repository commit.',
    '// Do not edit or commit the compressed payload; the placeholder is replaced only in the upload graph.',
    `const MCP_TRIAL_BASE_COMMIT_OID = ${JSON.stringify(commitOid)};`,
    `const MCP_TRIAL_BASE_DIGEST = ${JSON.stringify(baseDigest)};`,
    payload,
    'let decodedTreePromise = null;',
    '',
    'function decodeBase64(value) {',
    '  const binary = atob(value);',
    '  const bytes = new Uint8Array(binary.length);',
    '  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);',
    '  return bytes;',
    '}',
    '',
    'export async function loadMcpTrialBaseTree() {',
    '  if (decodedTreePromise === null) {',
    '    decodedTreePromise = (async () => {',
    "      if (typeof DecompressionStream !== 'function') throw new Error('mcp_base_tree_decompression_unavailable');",
    "      const stream = new Response(decodeBase64(MCP_TRIAL_BASE_GZIP_BASE64)).body.pipeThrough(new DecompressionStream('gzip'));",
    '      const text = await new Response(stream).text();',
    '      const tree = JSON.parse(text);',
    "      if (tree === null || typeof tree !== 'object' || Array.isArray(tree) || Object.keys(tree).length === 0) throw new Error('mcp_base_tree_payload_invalid');",
    '      return tree;',
    '    })();',
    '  }',
    '  return decodedTreePromise;',
    '}',
    '',
    'export { MCP_TRIAL_BASE_COMMIT_OID, MCP_TRIAL_BASE_DIGEST };',
    '',
  ].join('\n');
}

/**
 * Build the generated Worker module for one exact commit. Non-UTF8 blobs are
 * accepted only when their paths are explicitly excluded by D0043.
 */
export async function buildMcpTrialBaseTreeModule({ repositoryPath, commitOid, excludedPaths = [] } = {}) {
  if (typeof repositoryPath !== 'string' || repositoryPath.length === 0) fail('mcp_base_tree_repository_invalid', 'repositoryPath is required');
  if (typeof commitOid !== 'string' || !GIT_OID.test(commitOid)) fail('mcp_base_tree_commit_invalid', 'commitOid is invalid');
  if (!Array.isArray(excludedPaths) || excludedPaths.some((value) => typeof value !== 'string' || value.length === 0)) {
    fail('mcp_base_tree_exclusion_invalid', 'excludedPaths must be an array of non-empty paths');
  }
  const excluded = new Set(excludedPaths);
  if (excluded.size !== excludedPaths.length) fail('mcp_base_tree_exclusion_invalid', 'excludedPaths contains a duplicate');
  const rows = parseTreeListing(await git(repositoryPath, ['ls-tree', '-r', '-z', '-l', commitOid]), commitOid);
  const observedPaths = new Set(rows.map((row) => row.path));
  for (const filePath of excluded) {
    if (!observedPaths.has(filePath)) fail('mcp_base_tree_exclusion_mismatch', 'An excluded path is absent from the exact commit', { path: filePath });
  }
  const oids = [...new Set(rows.map((row) => row.blobOid))];
  const contents = parseBatch(await git(repositoryPath, ['cat-file', '--batch'], Buffer.from(`${oids.join('\n')}\n`, 'ascii')), oids);
  const tree = {};
  const nonUtf8 = [];
  for (const row of rows) {
    const raw = contents.get(row.blobOid);
    if (raw === undefined || raw.byteLength !== row.byteLength) fail('mcp_base_tree_git_blob_invalid', 'Git blob size does not match tree metadata', { path: row.path });
    try { tree[row.path] = decodeBlob(raw, `Git blob ${row.blobOid}`); }
    catch (cause) {
      if (!excluded.has(row.path)) throw cause;
      nonUtf8.push(row.path);
    }
  }
  const unexpectedExcluded = excludedPaths.filter((filePath) => !nonUtf8.includes(filePath));
  if (unexpectedExcluded.length !== 0) fail('mcp_base_tree_exclusion_mismatch', 'Excluded paths do not match non-UTF8 release entries', { unexpectedExcluded });
  const normalizedTree = validateTree(tree);
  const baseJson = canonicalJson(normalizedTree);
  const baseDigest = `sha256:${createHash('sha256').update(baseJson).digest('hex')}`;
  const compressed = gzipSync(Buffer.from(baseJson, 'utf8'), { level: 9, mtime: 0 });
  const source = generatedModule({ commitOid, baseDigest, compressed });
  return Object.freeze({
    moduleName: GENERATED_MODULE,
    source,
    commitOid,
    baseDigest,
    fileCount: Object.keys(normalizedTree).length,
    semanticBytes: Buffer.byteLength(baseJson, 'utf8'),
    compressedBytes: compressed.byteLength,
    moduleBytes: Buffer.byteLength(source, 'utf8'),
    excludedPaths: Object.freeze([...nonUtf8].sort()),
    tree: normalizedTree,
  });
}

export { GENERATED_MODULE as MCP_TRIAL_BASE_TREE_MODULE };
