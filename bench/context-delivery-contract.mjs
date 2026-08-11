#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { canonicalJson, digest, strictJsonParse, typedDigest } from '../src/canonical.mjs';
import { DEFAULT_LIMITS } from '../src/policy.mjs';
import {
  GitRepositoryModelExecutor,
  REPOSITORY_CONTEXT_PROFILE,
} from '../src/repository-model-transport.mjs';

const SELF = fileURLToPath(import.meta.url);
const REFERENCE_PROFILE = 'tdev.selected-context-reference.v1';
const AUTH_SCOPE_PROFILE = 'tdev.selected-context-reference-scope.v1';
const PACK_PROFILE = 'tdev.context-pack.v1';
const BUNDLE_PROFILE = 'tdev.context-bundle.v1';
const MANIFEST_PROFILE = 'tdev.context-manifest-content.v1';
const PACK_MAGIC = Buffer.from('TD17PK1\0', 'ascii');
const MAX_JSON_BYTES = 64 * 1024 * 1024;
const MAX_PACK_FILES = 128;
const MAX_PACK_CONTENT_BYTES = DEFAULT_LIMITS.maxFileBytes;
const MAX_PACK_STORED_BYTES = 3 * 1024 * 1024;
const MAX_PACK_MANIFEST_BYTES = 512 * 1024;
const MAX_PACKS = Math.ceil(DEFAULT_LIMITS.maxTreeEntries / MAX_PACK_FILES)
  + Math.ceil(DEFAULT_LIMITS.maxTreeBytes / MAX_PACK_CONTENT_BYTES);
const RUNS = 3;
const fatalDecoder = new TextDecoder('utf-8', { fatal: true });

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function runGit(repositoryPath, args, input = null, maxBuffer = 256 * 1024 * 1024) {
  const result = spawnSync('git', ['-C', repositoryPath, ...args], {
    input,
    encoding: null,
    maxBuffer,
    env: process.env,
  });
  if (result.status !== 0) throw new Error(result.stderr.toString('utf8'));
  return result.stdout;
}

function parseCommit(repositoryPath, commitish) {
  const commitOid = runGit(repositoryPath, ['rev-parse', `${commitish}^{commit}`]).toString('utf8').trim();
  const objectFormat = runGit(repositoryPath, ['rev-parse', '--show-object-format']).toString('utf8').trim();
  const oidPattern = objectFormat === 'sha1' ? /^[0-9a-f]{40}$/u : /^[0-9a-f]{64}$/u;
  if (!oidPattern.test(commitOid)) throw new Error('invalid benchmark commit OID');
  const listing = fatalDecoder.decode(runGit(repositoryPath, ['ls-tree', '-r', '-z', '-l', commitOid]));
  const rows = listing.split('\0').filter(Boolean).map((row) => {
    const tab = row.indexOf('\t');
    if (tab < 1) throw new Error('malformed tree row');
    const [mode, type, blobOid, sizeText] = row.slice(0, tab).trim().split(/ +/u);
    const byteLength = Number(sizeText);
    if (!['100644', '100755'].includes(mode) || type !== 'blob' || !oidPattern.test(blobOid) || !Number.isSafeInteger(byteLength)) {
      throw new Error('unsupported benchmark repository entry');
    }
    return { path: row.slice(tab + 1), mode, blobOid, byteLength };
  });
  const uniqueOids = [...new Set(rows.map((row) => row.blobOid))];
  const batch = uniqueOids.length === 0
    ? Buffer.alloc(0)
    : runGit(repositoryPath, ['cat-file', '--batch'], Buffer.from(`${uniqueOids.join('\n')}\n`, 'ascii'));
  const contentByOid = new Map();
  let offset = 0;
  for (const expectedOid of uniqueOids) {
    const newline = batch.indexOf(0x0a, offset);
    if (newline < 0) throw new Error('truncated batch response');
    const [oid, type, sizeText] = batch.subarray(offset, newline).toString('ascii').split(' ');
    const size = Number(sizeText);
    if (oid !== expectedOid || type !== 'blob' || !Number.isSafeInteger(size)) throw new Error('unbound batch response');
    const start = newline + 1;
    const end = start + size;
    if (end >= batch.length || batch[end] !== 0x0a) throw new Error('truncated batch content');
    contentByOid.set(oid, fatalDecoder.decode(batch.subarray(start, end)));
    offset = end + 1;
  }
  if (offset !== batch.length) throw new Error('trailing batch response');
  const baseTree = Object.create(null);
  for (const row of rows) baseTree[row.path] = contentByOid.get(row.blobOid);
  return { commitOid, baseDigest: digest(baseTree) };
}

async function prepareContext(repositoryPath, commitish) {
  const parsed = parseCommit(repositoryPath, commitish);
  const executor = new GitRepositoryModelExecutor({
    repositoryPath,
    modelExecutable: process.execPath,
    timeoutMs: 30_000,
    contextCache: false,
    limits: { maxRequestBytes: 32 * 1024 * 1024 },
  });
  const prepared = await executor.materializeContext(parsed.commitOid, parsed.baseDigest);
  return {
    descriptor: prepared.descriptor,
    files: prepared.files,
    baseDigest: parsed.baseDigest,
  };
}

function makeRepository(label, files) {
  const repositoryPath = mkdtempSync(path.join(tmpdir(), `tdev-d0017-${label}-`));
  runGit(repositoryPath, ['init', '-q']);
  runGit(repositoryPath, ['config', 'user.name', 'tdev']);
  runGit(repositoryPath, ['config', 'user.email', 'tdev@example.invalid']);
  for (const [filePath, content] of Object.entries(files)) {
    const absolute = path.join(repositoryPath, filePath);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
  }
  runGit(repositoryPath, ['add', '-A']);
  runGit(repositoryPath, ['commit', '-qm', label]);
  return {
    repositoryPath,
    cleanup: () => rmSync(repositoryPath, { recursive: true, force: true }),
  };
}

function indexedContent(index, bytes, fill) {
  const prefix = `${index}:`;
  return `${prefix}${fill.repeat(bytes - prefix.length)}`;
}

function syntheticShapes() {
  const manySmall = Object.create(null);
  const wide = Object.create(null);
  for (let i = 0; i < 2000; i += 1) {
    manySmall[`parts/p${String(i).padStart(4, '0')}.txt`] = indexedContent(i, 256, 'm');
    wide[`w${String(i).padStart(4, '0')}.txt`] = indexedContent(i, 256, 'w');
  }
  const fewLarge = Object.create(null);
  for (let i = 0; i < 4; i += 1) fewLarge[`large-${i}.txt`] = indexedContent(i, 256 * 1024, 'L');
  const deep = Object.create(null);
  const prefix = Array.from({ length: 40 }, (_, i) => `d${String(i).padStart(2, '0')}`).join('/');
  for (let i = 0; i < 128; i += 1) deep[`${prefix}/f${String(i).padStart(3, '0')}.txt`] = indexedContent(i, 4096, 'd');
  return [
    ['many-small', manySmall],
    ['few-large', fewLarge],
    ['deep', deep],
    ['wide', wide],
  ];
}

function authorizationScope() {
  const scope = {
    caseId: 'd0017-benchmark-case',
    planDigest: typedDigest('tdev.d0017-benchmark-plan.v1', { revision: 1 }),
    caseContractDigest: typedDigest('tdev.d0017-benchmark-contract.v1', { revision: 1 }),
  };
  return {
    ...scope,
    authorizationScopeDigest: typedDigest(AUTH_SCOPE_PROFILE, scope),
  };
}

function makeReference(context, scope) {
  const identity = {
    repositoryCommitOid: context.descriptor.commitOid,
    semanticBaseDigest: context.descriptor.semanticBaseDigest,
    contextDigest: context.descriptor.contextDigest,
    authorizationScopeDigest: scope.authorizationScopeDigest,
  };
  return {
    schemaVersion: 1,
    profile: REFERENCE_PROFILE,
    ...identity,
    referenceId: typedDigest(REFERENCE_PROFILE, identity),
  };
}

function makeRequest(context, scope, attemptId = 'task.1') {
  const contextReference = makeReference(context, scope);
  return {
    schemaVersion: 1,
    invocation: {
      caseId: scope.caseId,
      planDigest: scope.planDigest,
      caseContractDigest: scope.caseContractDigest,
      baseDigest: context.baseDigest,
      attemptId,
    },
    contextReference,
  };
}

function objectPath(storeRoot, objectDigest) {
  return path.join(storeRoot, 'objects', objectDigest.slice(7));
}

function writeObject(storeRoot, bytes) {
  const objectDigest = sha256(bytes);
  const target = objectPath(storeRoot, objectDigest);
  mkdirSync(path.dirname(target), { recursive: true });
  if (!existsSync(target)) writeFileSync(target, bytes);
  return objectDigest;
}

function bindingPath(storeRoot, referenceId) {
  return path.join(storeRoot, 'bindings', `${referenceId.slice(7)}.json`);
}

function writeBinding(storeRoot, referenceId, representation, rootDigest) {
  const target = bindingPath(storeRoot, referenceId);
  mkdirSync(path.dirname(target), { recursive: true });
  const bytes = Buffer.from(canonicalJson({
    schemaVersion: 1,
    referenceId,
    representation,
    rootDigest,
  }), 'utf8');
  writeFileSync(target, bytes);
  return bytes.length;
}

function materializeBundle(storeRoot, context, reference) {
  const bytes = Buffer.from(canonicalJson({
    schemaVersion: 1,
    profile: BUNDLE_PROFILE,
    descriptor: context.descriptor,
    files: context.files,
  }), 'utf8');
  const rootDigest = writeObject(storeRoot, bytes);
  const bindingBytes = writeBinding(storeRoot, reference.referenceId, 'single-canonical-bundle', rootDigest);
  return { representation: 'single-canonical-bundle', rootDigest, objectCount: 1, storageBytes: bytes.length, bindingBytes };
}

function materializeManifest(storeRoot, context, reference) {
  const contentRefs = [];
  const written = new Set();
  let contentStorageBytes = 0;
  for (const file of context.files) {
    const bytes = Buffer.from(file.content, 'utf8');
    const contentDigest = writeObject(storeRoot, bytes);
    if (!written.has(contentDigest)) {
      written.add(contentDigest);
      contentStorageBytes += bytes.length;
    }
    contentRefs.push({
      path: file.path,
      mode: file.mode,
      blobOid: file.blobOid,
      byteLength: file.byteLength,
      contentDigest,
    });
  }
  const manifestBytes = Buffer.from(canonicalJson({
    schemaVersion: 1,
    profile: MANIFEST_PROFILE,
    descriptor: context.descriptor,
    contentRefs,
  }), 'utf8');
  const rootDigest = writeObject(storeRoot, manifestBytes);
  const bindingBytes = writeBinding(storeRoot, reference.referenceId, 'manifest-content-references', rootDigest);
  return {
    representation: 'manifest-content-references',
    rootDigest,
    objectCount: 1 + written.size,
    storageBytes: manifestBytes.length + contentStorageBytes,
    bindingBytes,
  };
}

function encodePack(files) {
  if (files.length < 1 || files.length > MAX_PACK_FILES) throw new Error('invalid pack file count');
  const chunks = [PACK_MAGIC];
  let contentBytes = 0;
  for (const file of files) {
    const content = Buffer.from(file.content, 'utf8');
    contentBytes += content.length;
    const header = Buffer.from(canonicalJson({
      path: file.path,
      mode: file.mode,
      blobOid: file.blobOid,
      byteLength: file.byteLength,
      contentDigest: sha256(content),
    }), 'utf8');
    const headerLength = Buffer.allocUnsafe(4);
    headerLength.writeUInt32BE(header.length);
    const contentLength = Buffer.allocUnsafe(4);
    contentLength.writeUInt32BE(content.length);
    chunks.push(headerLength, header, contentLength, content);
  }
  const bytes = Buffer.concat(chunks);
  if (contentBytes > MAX_PACK_CONTENT_BYTES || bytes.length > MAX_PACK_STORED_BYTES) throw new Error('pack exceeds selected bounds');
  return { bytes, contentBytes };
}

function partitionFiles(files) {
  const packs = [];
  let current = [];
  let currentBytes = 0;
  const flush = () => {
    if (current.length === 0) return;
    packs.push(current);
    current = [];
    currentBytes = 0;
  };
  for (const file of files) {
    if (current.length > 0 && (current.length >= MAX_PACK_FILES || currentBytes + file.byteLength > MAX_PACK_CONTENT_BYTES)) flush();
    current.push(file);
    currentBytes += file.byteLength;
  }
  flush();
  return packs;
}

function materializePacked(storeRoot, context, reference) {
  const packs = [];
  let storageBytes = 0;
  for (const files of partitionFiles(context.files)) {
    const encoded = encodePack(files);
    const packDigest = writeObject(storeRoot, encoded.bytes);
    storageBytes += encoded.bytes.length;
    packs.push({
      digest: packDigest,
      fileCount: files.length,
      contentBytes: encoded.contentBytes,
      storedBytes: encoded.bytes.length,
      firstPath: files[0].path,
      lastPath: files.at(-1).path,
    });
  }
  if (packs.length > MAX_PACKS) throw new Error('pack count exceeds selected bound');
  const manifestBytes = Buffer.from(canonicalJson({
    schemaVersion: 1,
    profile: PACK_PROFILE,
    descriptor: context.descriptor,
    packBounds: {
      maxPackFiles: MAX_PACK_FILES,
      maxPackContentBytes: MAX_PACK_CONTENT_BYTES,
      maxPackStoredBytes: MAX_PACK_STORED_BYTES,
      maxPackCount: MAX_PACKS,
    },
    packs,
  }), 'utf8');
  if (manifestBytes.length > MAX_PACK_MANIFEST_BYTES) throw new Error('pack manifest exceeds selected bound');
  const rootDigest = writeObject(storeRoot, manifestBytes);
  storageBytes += manifestBytes.length;
  const bindingBytes = writeBinding(storeRoot, reference.referenceId, 'bounded-packed-hybrid', rootDigest);
  return {
    representation: 'bounded-packed-hybrid',
    rootDigest,
    objectCount: 1 + packs.length,
    packCount: packs.length,
    storageBytes,
    bindingBytes,
    manifestBytes: manifestBytes.length,
  };
}

function materializeAll(root, context, reference) {
  const candidates = [];
  for (const [name, materialize] of [
    ['bundle', materializeBundle],
    ['manifest', materializeManifest],
    ['packed', materializePacked],
  ]) {
    const storeRoot = path.join(root, name);
    mkdirSync(storeRoot, { recursive: true });
    const stats = materialize(storeRoot, context, reference);
    candidates.push({ name, storeRoot, ...stats });
  }
  return candidates;
}

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}

function readBoundedJson(filePath, missingCode, maxBytes = MAX_JSON_BYTES) {
  let bytes;
  try {
    bytes = readFileSync(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') fail(missingCode, 'referenced material is unavailable');
    throw error;
  }
  if (bytes.length > maxBytes) fail('context_reference_limit_exceeded', 'referenced JSON exceeds its bound');
  return { bytes, value: strictJsonParse(bytes, { maxBytes, maxStringCodePoints: maxBytes }) };
}

function readObject(storeRoot, objectDigest, maxBytes = MAX_JSON_BYTES) {
  let bytes;
  try {
    bytes = readFileSync(objectPath(storeRoot, objectDigest));
  } catch (error) {
    if (error?.code === 'ENOENT') fail('context_reference_missing', 'referenced object is missing');
    throw error;
  }
  if (bytes.length > maxBytes) fail('context_reference_limit_exceeded', 'referenced object exceeds its bound');
  if (sha256(bytes) !== objectDigest) fail('context_reference_corrupt', 'referenced object digest does not match');
  return bytes;
}

function validateReference(request) {
  const { invocation, contextReference: reference } = request;
  if (!invocation || !reference || reference.profile !== REFERENCE_PROFILE || reference.schemaVersion !== 1) {
    fail('context_reference_corrupt', 'reference envelope is malformed');
  }
  const scope = {
    caseId: invocation.caseId,
    planDigest: invocation.planDigest,
    caseContractDigest: invocation.caseContractDigest,
  };
  const observedScopeDigest = typedDigest(AUTH_SCOPE_PROFILE, scope);
  if (observedScopeDigest !== reference.authorizationScopeDigest) {
    fail('context_reference_unauthorized', 'reference is outside the admitted Case/Plan authority scope');
  }
  if (invocation.baseDigest !== reference.semanticBaseDigest) {
    fail('context_reference_stale', 'reference semantic base is stale for the invocation');
  }
  const identity = {
    repositoryCommitOid: reference.repositoryCommitOid,
    semanticBaseDigest: reference.semanticBaseDigest,
    contextDigest: reference.contextDigest,
    authorizationScopeDigest: reference.authorizationScopeDigest,
  };
  if (typedDigest(REFERENCE_PROFILE, identity) !== reference.referenceId) {
    fail('context_reference_corrupt', 'reference identity digest does not match its envelope');
  }
  return reference;
}

function decodePack(bytes) {
  if (bytes.length > MAX_PACK_STORED_BYTES || bytes.length < PACK_MAGIC.length || !bytes.subarray(0, PACK_MAGIC.length).equals(PACK_MAGIC)) {
    fail('context_reference_corrupt', 'pack framing is invalid');
  }
  const files = [];
  let contentBytes = 0;
  let offset = PACK_MAGIC.length;
  while (offset < bytes.length) {
    if (offset + 4 > bytes.length) fail('context_reference_corrupt', 'pack header length is truncated');
    const headerBytes = bytes.readUInt32BE(offset);
    offset += 4;
    if (headerBytes < 2 || headerBytes > DEFAULT_LIMITS.maxPathBytes + 1024 || offset + headerBytes + 4 > bytes.length) {
      fail('context_reference_limit_exceeded', 'pack header exceeds its bound');
    }
    const header = strictJsonParse(bytes.subarray(offset, offset + headerBytes), {
      maxBytes: DEFAULT_LIMITS.maxPathBytes + 1024,
      maxStringCodePoints: DEFAULT_LIMITS.maxPathBytes + 1024,
    });
    offset += headerBytes;
    const length = bytes.readUInt32BE(offset);
    offset += 4;
    if (length > DEFAULT_LIMITS.maxFileBytes || offset + length > bytes.length) fail('context_reference_limit_exceeded', 'pack content exceeds its bound');
    const content = bytes.subarray(offset, offset + length);
    offset += length;
    if (length !== header.byteLength || sha256(content) !== header.contentDigest) fail('context_reference_corrupt', 'pack content digest does not match');
    contentBytes += length;
    if (contentBytes > MAX_PACK_CONTENT_BYTES) fail('context_reference_limit_exceeded', 'pack semantic bytes exceed their bound');
    files.push({
      path: header.path,
      mode: header.mode,
      blobOid: header.blobOid,
      byteLength: header.byteLength,
      content: fatalDecoder.decode(content),
    });
    if (files.length > MAX_PACK_FILES) fail('context_reference_limit_exceeded', 'pack file count exceeds its bound');
  }
  return { files, contentBytes };
}

function verifyFiles(descriptor, files, reference) {
  if (!descriptor || descriptor.commitOid !== reference.repositoryCommitOid || descriptor.semanticBaseDigest !== reference.semanticBaseDigest || descriptor.contextDigest !== reference.contextDigest) {
    fail('context_reference_stale', 'resolved descriptor does not match the reference identity');
  }
  const { contextDigest, ...contextIdentity } = descriptor;
  if (typedDigest(REPOSITORY_CONTEXT_PROFILE, contextIdentity) !== contextDigest) {
    fail('context_reference_corrupt', 'resolved repository context descriptor digest is invalid');
  }
  if (!Array.isArray(files) || files.length !== descriptor.fileCount || files.length > DEFAULT_LIMITS.maxTreeEntries) {
    fail('context_reference_limit_exceeded', 'resolved file count exceeds or violates its bound');
  }
  const tree = Object.create(null);
  let contentBytes = 0;
  for (const file of files) {
    const bytes = Buffer.byteLength(file.content, 'utf8');
    if (bytes !== file.byteLength || bytes > DEFAULT_LIMITS.maxFileBytes) fail('context_reference_limit_exceeded', 'resolved file bytes violate their bound');
    contentBytes += bytes;
    if (contentBytes > DEFAULT_LIMITS.maxTreeBytes) fail('context_reference_limit_exceeded', 'resolved tree exceeds its bound');
    tree[file.path] = file.content;
  }
  if (contentBytes !== descriptor.contentBytes || digest(tree) !== reference.semanticBaseDigest) {
    fail('context_reference_semantic_mismatch', 'resolved context is not semantically equivalent');
  }
}

async function resolveRequest(storeRoot, request) {
  const reference = validateReference(request);
  const bindingRead = readBoundedJson(bindingPath(storeRoot, reference.referenceId), 'context_reference_missing', 64 * 1024);
  const binding = bindingRead.value;
  if (binding.referenceId !== reference.referenceId || typeof binding.rootDigest !== 'string') fail('context_reference_corrupt', 'resolver binding is malformed');
  let representationObjectReads = 1;
  let representationBytes = 0;
  let descriptor;
  let files;
  const rootBytes = readObject(storeRoot, binding.rootDigest, binding.representation === 'bounded-packed-hybrid' ? MAX_PACK_MANIFEST_BYTES : MAX_JSON_BYTES);
  representationBytes += rootBytes.length;
  const root = strictJsonParse(rootBytes, { maxBytes: MAX_JSON_BYTES, maxStringCodePoints: MAX_JSON_BYTES });
  if (binding.representation === 'single-canonical-bundle') {
    if (root.profile !== BUNDLE_PROFILE) fail('context_reference_corrupt', 'bundle profile is invalid');
    descriptor = root.descriptor;
    files = root.files;
  } else if (binding.representation === 'manifest-content-references') {
    if (root.profile !== MANIFEST_PROFILE || !Array.isArray(root.contentRefs)) fail('context_reference_corrupt', 'manifest profile is invalid');
    descriptor = root.descriptor;
    files = [];
    const cache = new Map();
    for (const entry of root.contentRefs) {
      let content = cache.get(entry.contentDigest);
      if (content === undefined) {
        content = readObject(storeRoot, entry.contentDigest, DEFAULT_LIMITS.maxFileBytes);
        representationObjectReads += 1;
        representationBytes += content.length;
        cache.set(entry.contentDigest, content);
      }
      if (content.length !== entry.byteLength) fail('context_reference_corrupt', 'content reference length does not match');
      files.push({ path: entry.path, mode: entry.mode, blobOid: entry.blobOid, byteLength: entry.byteLength, content: fatalDecoder.decode(content) });
    }
  } else if (binding.representation === 'bounded-packed-hybrid') {
    if (root.profile !== PACK_PROFILE || !Array.isArray(root.packs) || root.packs.length > MAX_PACKS) fail('context_reference_limit_exceeded', 'pack manifest violates its bound');
    descriptor = root.descriptor;
    files = [];
    for (let i = 0; i < root.packs.length; i += 1) {
      const pack = root.packs[i];
      if (pack.fileCount < 1 || pack.fileCount > MAX_PACK_FILES || pack.contentBytes > MAX_PACK_CONTENT_BYTES || pack.storedBytes > MAX_PACK_STORED_BYTES) {
        fail('context_reference_limit_exceeded', 'pack declaration violates selected bounds');
      }
      const packBytes = readObject(storeRoot, pack.digest, MAX_PACK_STORED_BYTES);
      representationObjectReads += 1;
      representationBytes += packBytes.length;
      const decoded = decodePack(packBytes);
      if (decoded.files.length !== pack.fileCount || decoded.contentBytes !== pack.contentBytes || packBytes.length !== pack.storedBytes) {
        fail('context_reference_corrupt', 'pack declaration does not match content');
      }
      files.push(...decoded.files);
      if (i === 0 && process.env.TDEV_D0017_PARTIAL_MARKER) writeFileSync(process.env.TDEV_D0017_PARTIAL_MARKER, 'partial\n');
      const delayMs = Number(process.env.TDEV_D0017_READ_DELAY_MS ?? 0);
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  } else {
    fail('context_reference_corrupt', 'resolver binding representation is unsupported');
  }
  verifyFiles(descriptor, files, reference);
  if (process.env.TDEV_D0017_ACCEPTED_MARKER) writeFileSync(process.env.TDEV_D0017_ACCEPTED_MARKER, 'accepted\n');
  return {
    representation: binding.representation,
    bindingBytes: bindingRead.bytes.length,
    representationObjectReads,
    representationBytes,
    fileCount: files.length,
    contentBytes: descriptor.contentBytes,
    contextDigest: descriptor.contextDigest,
    referenceId: reference.referenceId,
  };
}

async function receiverMain(storeRoot) {
  const raw = readFileSync(0);
  const started = performance.now();
  const cpuBefore = process.cpuUsage();
  try {
    const request = strictJsonParse(raw, { maxBytes: 1024 * 1024, maxStringCodePoints: 1024 * 1024 });
    const resolved = await resolveRequest(storeRoot, request);
    const cpu = process.cpuUsage(cpuBefore);
    process.stdout.write(`${JSON.stringify({
      ok: true,
      ...resolved,
      resolveMs: performance.now() - started,
      cpuUserMs: cpu.user / 1000,
      cpuSystemMs: cpu.system / 1000,
      rssBytes: process.memoryUsage().rss,
      heapUsedBytes: process.memoryUsage().heapUsed,
    })}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      code: error?.code ?? 'benchmark_receiver_failure',
      message: error instanceof Error ? error.message : String(error),
      resolveMs: performance.now() - started,
    })}\n`);
  }
}

function runReceiver(storeRoot, request) {
  const input = Buffer.from(canonicalJson(request), 'utf8');
  const started = performance.now();
  const result = spawnSync(process.execPath, [SELF, '--receiver', storeRoot], {
    input,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr || `receiver exited ${result.status}`);
  const parsed = JSON.parse(result.stdout);
  return { ...parsed, wallMs: performance.now() - started, requestBytes: input.length };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function summarizeRuns(runs) {
  if (runs.some((run) => run.ok !== true)) throw new Error(`candidate failed: ${JSON.stringify(runs)}`);
  return {
    runs,
    wallMsMedian: median(runs.map((run) => run.wallMs)),
    resolveMsMedian: median(runs.map((run) => run.resolveMs)),
    cpuUserMsMedian: median(runs.map((run) => run.cpuUserMs)),
    rssBytesMax: Math.max(...runs.map((run) => run.rssBytes)),
    heapUsedBytesMax: Math.max(...runs.map((run) => run.heapUsedBytes)),
    representationObjectReads: runs[0].representationObjectReads,
    representationBytes: runs[0].representationBytes,
    bindingBytes: runs[0].bindingBytes,
    requestBytes: runs[0].requestBytes,
    referenceId: runs[0].referenceId,
  };
}

function parseBinding(storeRoot, referenceId) {
  return strictJsonParse(readFileSync(bindingPath(storeRoot, referenceId)), { maxBytes: 64 * 1024, maxStringCodePoints: 64 * 1024 });
}

function expectFailure(storeRoot, request, code) {
  const result = runReceiver(storeRoot, request);
  return { expectedCode: code, observedCode: result.code, passed: result.ok === false && result.code === code, result };
}

async function cancellationProbe(storeRoot, request) {
  const markerRoot = mkdtempSync(path.join(tmpdir(), 'tdev-d0017-cancel-'));
  const partialMarker = path.join(markerRoot, 'partial');
  const acceptedMarker = path.join(markerRoot, 'accepted');
  const input = Buffer.from(canonicalJson(request), 'utf8');
  const child = spawn(process.execPath, [SELF, '--receiver', storeRoot], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      TDEV_D0017_PARTIAL_MARKER: partialMarker,
      TDEV_D0017_ACCEPTED_MARKER: acceptedMarker,
      TDEV_D0017_READ_DELAY_MS: '200',
    },
  });
  child.stdin.end(input);
  const started = performance.now();
  let partialObserved = false;
  while (performance.now() - started < 5000) {
    if (existsSync(partialMarker)) {
      partialObserved = true;
      child.kill('SIGTERM');
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  if (!partialObserved) child.kill('SIGTERM');
  const outcome = await new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
  const acceptedObserved = existsSync(acceptedMarker);
  rmSync(markerRoot, { recursive: true, force: true });
  return {
    partialObserved,
    acceptedObserved,
    exitCode: outcome.code,
    signal: outcome.signal,
    passed: partialObserved && !acceptedObserved && outcome.signal === 'SIGTERM',
  };
}

async function failureMatrix(actual, actualStores, wide, wideStores, scope) {
  const packed = actualStores.find((candidate) => candidate.name === 'packed');
  const widePacked = wideStores.find((candidate) => candidate.name === 'packed');
  const baseRequest = makeRequest(actual, scope, 'task.1');
  const retryRequest = makeRequest(actual, scope, 'task.2');
  const restartOne = runReceiver(packed.storeRoot, baseRequest);
  const restartTwo = runReceiver(packed.storeRoot, retryRequest);

  const unauthorized = structuredClone(baseRequest);
  unauthorized.invocation.caseId = 'other-case';
  const stale = structuredClone(baseRequest);
  stale.invocation.baseDigest = typedDigest('tdev.d0017-stale-base.v1', { stale: true });

  const binding = bindingPath(packed.storeRoot, baseRequest.contextReference.referenceId);
  const savedBinding = readFileSync(binding);
  rmSync(binding);
  const missing = expectFailure(packed.storeRoot, baseRequest, 'context_reference_missing');
  writeFileSync(binding, savedBinding);

  const packedBinding = parseBinding(packed.storeRoot, baseRequest.contextReference.referenceId);
  const packedManifest = strictJsonParse(readObject(packed.storeRoot, packedBinding.rootDigest, MAX_PACK_MANIFEST_BYTES), {
    maxBytes: MAX_PACK_MANIFEST_BYTES,
    maxStringCodePoints: MAX_PACK_MANIFEST_BYTES,
  });
  const corruptPath = objectPath(packed.storeRoot, packedManifest.packs[0].digest);
  const savedPack = readFileSync(corruptPath);
  const corruptPack = Buffer.from(savedPack);
  corruptPack[0] ^= 0xff;
  writeFileSync(corruptPath, corruptPack);
  const corrupt = expectFailure(packed.storeRoot, baseRequest, 'context_reference_corrupt');
  writeFileSync(corruptPath, savedPack);

  const wideRequest = makeRequest(wide, scope, 'wide.1');
  const wideBindingPath = bindingPath(widePacked.storeRoot, wideRequest.contextReference.referenceId);
  const savedWideBinding = readFileSync(wideBindingPath);
  const wideBinding = parseBinding(widePacked.storeRoot, wideRequest.contextReference.referenceId);
  const wideManifestBytes = readObject(widePacked.storeRoot, wideBinding.rootDigest, MAX_PACK_MANIFEST_BYTES);
  const wideManifest = strictJsonParse(wideManifestBytes, { maxBytes: MAX_PACK_MANIFEST_BYTES, maxStringCodePoints: MAX_PACK_MANIFEST_BYTES });
  wideManifest.packs[0].fileCount = MAX_PACK_FILES + 1;
  const tamperedManifest = Buffer.from(canonicalJson(wideManifest), 'utf8');
  const tamperedRootDigest = writeObject(widePacked.storeRoot, tamperedManifest);
  writeBinding(widePacked.storeRoot, wideRequest.contextReference.referenceId, 'bounded-packed-hybrid', tamperedRootDigest);
  const limit = expectFailure(widePacked.storeRoot, wideRequest, 'context_reference_limit_exceeded');
  writeFileSync(wideBindingPath, savedWideBinding);

  const cancellation = await cancellationProbe(widePacked.storeRoot, wideRequest);
  return {
    retryRestartIdentity: {
      firstOk: restartOne.ok,
      secondOk: restartTwo.ok,
      sameReferenceId: baseRequest.contextReference.referenceId === retryRequest.contextReference.referenceId
        && restartOne.referenceId === restartTwo.referenceId,
      passed: restartOne.ok === true && restartTwo.ok === true && restartOne.referenceId === restartTwo.referenceId,
    },
    unauthorized: expectFailure(packed.storeRoot, unauthorized, 'context_reference_unauthorized'),
    stale: expectFailure(packed.storeRoot, stale, 'context_reference_stale'),
    missing,
    corrupt,
    limit,
    cancellation,
  };
}

async function main() {
  if (process.argv[2] === '--receiver') {
    await receiverMain(process.argv[3]);
    return;
  }
  const repositoryPath = process.cwd();
  const sourceSha = runGit(repositoryPath, ['rev-parse', 'HEAD']).toString('utf8').trim();
  const scope = authorizationScope();
  const contexts = [];
  const temporaryRepositories = [];
  const storesRoot = mkdtempSync(path.join(tmpdir(), 'tdev-d0017-stores-'));
  try {
    contexts.push({ label: 'actual', context: await prepareContext(repositoryPath, sourceSha) });
    for (const [label, files] of syntheticShapes()) {
      const repository = makeRepository(label, files);
      temporaryRepositories.push(repository);
      contexts.push({ label, context: await prepareContext(repository.repositoryPath, 'HEAD') });
    }

    const comparisons = [];
    const storeByLabel = new Map();
    for (const { label, context } of contexts) {
      const request = makeRequest(context, scope);
      const requestBytes = Buffer.from(canonicalJson(request), 'utf8');
      const labelRoot = path.join(storesRoot, label);
      const candidates = materializeAll(labelRoot, context, request.contextReference);
      storeByLabel.set(label, candidates);
      const candidateResults = [];
      for (const candidate of candidates) {
        const runs = [];
        for (let i = 0; i < RUNS; i += 1) runs.push(runReceiver(candidate.storeRoot, request));
        const summary = summarizeRuns(runs);
        candidateResults.push({
          candidate: candidate.representation,
          materializedObjectCount: candidate.objectCount,
          materializedStorageBytes: candidate.storageBytes,
          packCount: candidate.packCount ?? null,
          manifestBytes: candidate.manifestBytes ?? null,
          ...summary,
        });
      }
      comparisons.push({
        label,
        descriptor: {
          commitOid: context.descriptor.commitOid,
          semanticBaseDigest: context.descriptor.semanticBaseDigest,
          contextDigest: context.descriptor.contextDigest,
          fileCount: context.descriptor.fileCount,
          contentBytes: context.descriptor.contentBytes,
        },
        referenceId: request.contextReference.referenceId,
        authorizationScopeDigest: request.contextReference.authorizationScopeDigest,
        requestBytes: requestBytes.length,
        requestContainsStorePath: requestBytes.includes(Buffer.from(storesRoot, 'utf8')),
        candidates: candidateResults,
        allCandidatesSameReference: candidateResults.every((candidate) => candidate.referenceId === request.contextReference.referenceId),
      });
    }

    const actual = contexts.find((entry) => entry.label === 'actual').context;
    const wide = contexts.find((entry) => entry.label === 'wide').context;
    const failures = await failureMatrix(actual, storeByLabel.get('actual'), wide, storeByLabel.get('wide'), scope);
    const allFailureFalsifiersPassed = Object.values(failures).every((entry) => entry.passed === true);
    const result = {
      schemaVersion: 1,
      profile: 'tdev.selected-context-delivery-contract-benchmark.v1',
      sourceSha,
      environment: {
        node: process.version,
        platform: `${process.platform}/${process.arch}`,
        git: runGit(repositoryPath, ['--version']).toString('utf8').trim(),
      },
      priorEvidence: {
        d0016Path: 'docs/evidence/group-e-d0016-context-delivery-2026-08-11.json',
        sha256: 'ba4dbfe09dd05a48c741a384316f1e9755409ab1369335ebe898d2269537c495',
      },
      logicalReference: {
        profile: REFERENCE_PROFILE,
        authorizationScopeProfile: AUTH_SCOPE_PROFILE,
        scope,
        fields: ['repositoryCommitOid', 'semanticBaseDigest', 'contextDigest', 'authorizationScopeDigest'],
        attemptIdentityExcluded: true,
        rawLocatorExcluded: true,
      },
      selectedPackHypothesis: {
        profile: PACK_PROFILE,
        maxPackFiles: MAX_PACK_FILES,
        maxPackContentBytes: MAX_PACK_CONTENT_BYTES,
        maxPackStoredBytes: MAX_PACK_STORED_BYTES,
        maxPackManifestBytes: MAX_PACK_MANIFEST_BYTES,
        maxPackCount: MAX_PACKS,
        inheritedSemanticBounds: {
          maxTreeEntries: DEFAULT_LIMITS.maxTreeEntries,
          maxFileBytes: DEFAULT_LIMITS.maxFileBytes,
          maxTreeBytes: DEFAULT_LIMITS.maxTreeBytes,
        },
      },
      comparisons,
      failureMatrix: failures,
      allFailureFalsifiersPassed,
      invariants: {
        allRepresentationsPreserveLogicalReference: comparisons.every((entry) => entry.allCandidatesSameReference),
        noRequestContainsLocalStorePath: comparisons.every((entry) => entry.requestContainsStorePath === false),
        allRepresentationsSemanticallyEquivalent: comparisons.every((entry) => entry.candidates.every((candidate) => candidate.runs.every((run) => run.ok === true && run.contextDigest === entry.descriptor.contextDigest))),
      },
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    for (const repository of temporaryRepositories) repository.cleanup();
    rmSync(storesRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
