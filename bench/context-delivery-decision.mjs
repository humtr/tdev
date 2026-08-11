#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import {
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

import { canonicalJson, digest, strictJsonParse } from '../src/canonical.mjs';
import { DEFAULT_LIMITS } from '../src/policy.mjs';
import { GitRepositoryModelExecutor } from '../src/repository-model-transport.mjs';

const SELF = fileURLToPath(import.meta.url);
const MAX_JSON_BYTES = 64 * 1024 * 1024;
const STREAM_CHUNK_BYTES = 64 * 1024;
const fatalDecoder = new TextDecoder('utf-8', { fatal: true });

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

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
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
  return { commitOid, baseTree, baseDigest: digest(baseTree) };
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
  const started = performance.now();
  const prepared = await executor.materializeContext(parsed.commitOid, parsed.baseDigest);
  return {
    commitOid: parsed.commitOid,
    baseDigest: parsed.baseDigest,
    descriptor: prepared.descriptor,
    files: prepared.files,
    preparation: {
      wallMs: performance.now() - started,
      gitCommandCount: prepared.gitCommandCount,
      gitInputBytes: prepared.gitInputBytes,
      gitStdoutBytes: prepared.gitStdoutBytes,
      scanDurationMs: prepared.scanDurationMs,
      contextMaterializations: prepared.contextMaterializations,
    },
  };
}

function makeRepository(specification) {
  const repositoryPath = mkdtempSync(path.join(tmpdir(), 'tdev-d0016-repo-'));
  runGit(repositoryPath, ['init', '-q']);
  runGit(repositoryPath, ['config', 'user.name', 'tdev']);
  runGit(repositoryPath, ['config', 'user.email', 'tdev@example.invalid']);
  const commits = [];
  for (let revision = 0; revision < specification.revisions; revision += 1) {
    const files = specification.files(revision);
    for (const [filePath, content] of Object.entries(files)) {
      const absolute = path.join(repositoryPath, filePath);
      mkdirSync(path.dirname(absolute), { recursive: true });
      writeFileSync(absolute, content);
    }
    runGit(repositoryPath, ['add', '-A']);
    runGit(repositoryPath, ['commit', '-qm', `revision-${revision}`]);
    commits.push(runGit(repositoryPath, ['rev-parse', 'HEAD']).toString('utf8').trim());
  }
  return { repositoryPath, commits, cleanup: () => rmSync(repositoryPath, { recursive: true, force: true }) };
}

function indexedContent(index, bytes, fill) {
  const prefix = `${index}:`;
  return `${prefix}${fill.repeat(bytes - prefix.length)}`;
}

function referenceStore(root, context, label) {
  const storeRoot = path.join(root, label);
  mkdirSync(storeRoot, { recursive: true });
  const bundleBytes = Buffer.from(canonicalJson({
    schemaVersion: 1,
    descriptor: context.descriptor,
    files: context.files,
  }), 'utf8');
  const bundleDigest = sha256(bundleBytes);
  const bundlePath = path.join(storeRoot, `bundle-${bundleDigest.slice(7)}.json`);
  writeFileSync(bundlePath, bundleBytes);

  const blobRoot = path.join(storeRoot, 'blobs');
  mkdirSync(blobRoot, { recursive: true });
  const contentRefs = [];
  const written = new Set();
  for (const file of context.files) {
    const bytes = Buffer.from(file.content, 'utf8');
    const contentDigest = sha256(bytes);
    const blobPath = path.join(blobRoot, contentDigest.slice(7));
    if (!written.has(contentDigest)) {
      writeFileSync(blobPath, bytes);
      written.add(contentDigest);
    }
    contentRefs.push({
      path: file.path,
      mode: file.mode,
      blobOid: file.blobOid,
      byteLength: file.byteLength,
      contentDigest,
      blobPath,
    });
  }
  const manifestBytes = Buffer.from(canonicalJson({
    schemaVersion: 1,
    descriptor: context.descriptor,
    contentRefs,
  }), 'utf8');
  const manifestDigest = sha256(manifestBytes);
  const manifestPath = path.join(storeRoot, `manifest-${manifestDigest.slice(7)}.json`);
  writeFileSync(manifestPath, manifestBytes);
  return {
    bundlePath,
    bundleDigest,
    bundleBytes: bundleBytes.length,
    manifestPath,
    manifestDigest,
    manifestBytes: manifestBytes.length,
    uniqueBlobCount: written.size,
  };
}

function invocation(context, attemptIndex) {
  return {
    schemaVersion: 1,
    attemptIndex,
    commitOid: context.commitOid,
    baseDigest: context.baseDigest,
    instruction: `d0016-attempt-${attemptIndex}`,
  };
}

function inlineRequest(context, attemptIndex, mode = 'inline-full') {
  return Buffer.from(canonicalJson({
    schemaVersion: 1,
    mode,
    invocation: invocation(context, attemptIndex),
    repositoryContext: context.descriptor,
    repositoryFiles: context.files,
  }), 'utf8');
}

function bundleRequest(context, store, attemptIndex, mode = 'bundle-ref') {
  return Buffer.from(canonicalJson({
    schemaVersion: 1,
    mode,
    invocation: invocation(context, attemptIndex),
    reference: {
      kind: 'bundle',
      path: store.bundlePath,
      digest: store.bundleDigest,
      contextDigest: context.descriptor.contextDigest,
    },
  }), 'utf8');
}

function manifestRequest(context, store, attemptIndex) {
  return Buffer.from(canonicalJson({
    schemaVersion: 1,
    mode: 'manifest-content-ref',
    invocation: invocation(context, attemptIndex),
    reference: {
      kind: 'manifest',
      path: store.manifestPath,
      digest: store.manifestDigest,
      contextDigest: context.descriptor.contextDigest,
    },
  }), 'utf8');
}

function requestLimits() {
  return {
    maxTreeEntries: DEFAULT_LIMITS.maxTreeEntries,
    maxFileBytes: DEFAULT_LIMITS.maxFileBytes,
    maxTreeBytes: DEFAULT_LIMITS.maxTreeBytes,
  };
}

function verifyFiles(descriptor, files, expectedBaseDigest) {
  if (!descriptor || descriptor.semanticBaseDigest !== expectedBaseDigest) throw Object.assign(new Error('stale base'), { code: 'stale_base_identity' });
  if (!Array.isArray(files) || files.length !== descriptor.fileCount || files.length > DEFAULT_LIMITS.maxTreeEntries) {
    throw Object.assign(new Error('file count mismatch'), { code: 'reference_file_count_mismatch' });
  }
  const tree = Object.create(null);
  let contentBytes = 0;
  for (const file of files) {
    const bytes = Buffer.byteLength(file.content, 'utf8');
    if (bytes !== file.byteLength || bytes > DEFAULT_LIMITS.maxFileBytes) throw Object.assign(new Error('file size mismatch'), { code: 'reference_file_size_mismatch' });
    contentBytes += bytes;
    if (contentBytes > DEFAULT_LIMITS.maxTreeBytes) throw Object.assign(new Error('tree too large'), { code: 'reference_tree_limit_exceeded' });
    tree[file.path] = file.content;
  }
  if (contentBytes !== descriptor.contentBytes) throw Object.assign(new Error('content size mismatch'), { code: 'reference_content_size_mismatch' });
  const observed = digest(tree);
  if (observed !== expectedBaseDigest) throw Object.assign(new Error('semantic mismatch'), { code: 'reference_semantic_mismatch' });
  return observed;
}

function resolveRequest(request, cache = null) {
  const started = performance.now();
  let storageBytes = 0;
  let cacheStatus = 'none';
  let descriptor;
  let files;
  if (request.mode === 'inline-full' || request.mode === 'streaming-inline' || request.mode === 'warm-inline') {
    descriptor = request.repositoryContext;
    files = request.repositoryFiles;
  } else if (request.mode === 'bundle-ref' || request.mode === 'warm-bundle-ref') {
    const cacheKey = request.reference.digest;
    const cached = cache?.get(cacheKey);
    if (cached !== undefined) {
      ({ descriptor, files } = cached);
      cacheStatus = 'hit';
    } else {
      const bytes = readFileSync(request.reference.path);
      storageBytes += bytes.length;
      if (sha256(bytes) !== request.reference.digest) throw Object.assign(new Error('bundle digest mismatch'), { code: 'reference_digest_mismatch' });
      const bundle = strictJsonParse(bytes, { maxBytes: MAX_JSON_BYTES, maxStringCodePoints: MAX_JSON_BYTES });
      descriptor = bundle.descriptor;
      files = bundle.files;
      if (descriptor.contextDigest !== request.reference.contextDigest) throw Object.assign(new Error('context digest mismatch'), { code: 'reference_context_mismatch' });
      if (cache !== null) {
        cache.set(cacheKey, { descriptor, files });
        cacheStatus = 'miss';
      }
    }
  } else if (request.mode === 'manifest-content-ref') {
    const bytes = readFileSync(request.reference.path);
    storageBytes += bytes.length;
    if (sha256(bytes) !== request.reference.digest) throw Object.assign(new Error('manifest digest mismatch'), { code: 'reference_digest_mismatch' });
    const manifest = strictJsonParse(bytes, { maxBytes: MAX_JSON_BYTES, maxStringCodePoints: MAX_JSON_BYTES });
    descriptor = manifest.descriptor;
    if (descriptor.contextDigest !== request.reference.contextDigest) throw Object.assign(new Error('context digest mismatch'), { code: 'reference_context_mismatch' });
    files = manifest.contentRefs.map((entry) => {
      const contentBytes = readFileSync(entry.blobPath);
      storageBytes += contentBytes.length;
      if (sha256(contentBytes) !== entry.contentDigest || contentBytes.length !== entry.byteLength) {
        throw Object.assign(new Error('content digest mismatch'), { code: 'content_reference_mismatch' });
      }
      return {
        path: entry.path,
        mode: entry.mode,
        blobOid: entry.blobOid,
        byteLength: entry.byteLength,
        content: fatalDecoder.decode(contentBytes),
      };
    });
  } else {
    throw Object.assign(new Error('unsupported candidate mode'), { code: 'unsupported_candidate_mode' });
  }
  const baseDigest = verifyFiles(descriptor, files, request.invocation.baseDigest);
  return {
    baseDigest,
    contextDigest: descriptor.contextDigest,
    storageBytes,
    cacheStatus,
    resolveMs: performance.now() - started,
  };
}

function receiverResult(raw, cache = null) {
  const cpuBefore = process.cpuUsage();
  const parseStarted = performance.now();
  try {
    const request = strictJsonParse(raw, { maxBytes: MAX_JSON_BYTES, maxStringCodePoints: MAX_JSON_BYTES });
    const requestParseMs = performance.now() - parseStarted;
    const resolved = resolveRequest(request, cache);
    const cpu = process.cpuUsage(cpuBefore);
    const memory = process.memoryUsage();
    return {
      ok: true,
      requestParseMs,
      ...resolved,
      cpuUserMs: cpu.user / 1000,
      cpuSystemMs: cpu.system / 1000,
      rssBytes: memory.rss,
      heapBytes: memory.heapUsed,
    };
  } catch (error) {
    return {
      ok: false,
      code: error?.code ?? 'receiver_failed',
      message: String(error?.message ?? error),
    };
  }
}

async function receiverSingle() {
  const delay = Number(process.env.TDEV_D0016_RECEIVER_DELAY_MS ?? 0);
  if (Number.isFinite(delay) && delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  process.stdout.write(`${JSON.stringify(receiverResult(Buffer.concat(chunks)))}\n`);
}

async function receiverWarm() {
  const cache = new Map();
  process.stdout.write(`${JSON.stringify({ ready: true })}\n`);
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    process.stdout.write(`${JSON.stringify(receiverResult(Buffer.from(line, 'utf8'), cache))}\n`);
  }
}

function parseOneResponse(stdout) {
  const lines = stdout.toString('utf8').trim().split('\n').filter(Boolean);
  if (lines.length !== 1) throw new Error(`unexpected receiver output lines: ${lines.length}`);
  return JSON.parse(lines[0]);
}

async function writeChunks(stream, buffer, chunkBytes) {
  for (let offset = 0; offset < buffer.length; offset += chunkBytes) {
    const chunk = buffer.subarray(offset, Math.min(buffer.length, offset + chunkBytes));
    if (!stream.write(chunk)) await new Promise((resolve) => stream.once('drain', resolve));
  }
  stream.end();
}

function runFresh(request, { stream = false, delayMs = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const child = spawn(process.execPath, [SELF, '--receiver-single'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, TDEV_D0016_RECEIVER_DELAY_MS: String(delayMs) },
      shell: false,
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code !== 0) {
        reject(new Error(`receiver exited ${code}/${signal}: ${Buffer.concat(stderr).toString('utf8')}`));
        return;
      }
      resolve({ response: parseOneResponse(Buffer.concat(stdout)), wallMs: performance.now() - started });
    });
    if (stream) void writeChunks(child.stdin, request, STREAM_CHUNK_BYTES).catch(reject);
    else child.stdin.end(request);
  });
}

class WarmReceiver {
  #child;
  #lines;
  #pending = [];
  #ready;

  constructor() {
    this.#child = spawn(process.execPath, [SELF, '--receiver-warm'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
      shell: false,
    });
    this.#lines = createInterface({ input: this.#child.stdout, crlfDelay: Infinity });
    this.#ready = new Promise((resolve, reject) => {
      const onLine = (line) => {
        const parsed = JSON.parse(line);
        this.#lines.off('line', onLine);
        if (parsed.ready === true) resolve();
        else reject(new Error('warm receiver did not become ready'));
      };
      this.#lines.on('line', onLine);
      this.#child.once('error', reject);
    }).then(() => {
      this.#lines.on('line', (line) => {
        const next = this.#pending.shift();
        if (next === undefined) return;
        next.resolve(JSON.parse(line));
      });
    });
  }

  async request(bytes) {
    await this.#ready;
    return new Promise((resolve, reject) => {
      this.#pending.push({ resolve, reject });
      this.#child.stdin.write(bytes);
      this.#child.stdin.write('\n');
    });
  }

  async close() {
    await this.#ready;
    this.#child.stdin.end();
    await new Promise((resolve) => this.#child.once('close', resolve));
    this.#lines.close();
  }
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

function latencySummary(values) {
  return {
    count: values.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    max: values.length === 0 ? 0 : Math.max(...values),
  };
}

async function measureCandidate(name, attempts) {
  global.gc?.();
  const parentBefore = process.memoryUsage();
  let peakRss = parentBefore.rss;
  let peakHeap = parentBefore.heapUsed;
  const sampler = setInterval(() => {
    const memory = process.memoryUsage();
    peakRss = Math.max(peakRss, memory.rss);
    peakHeap = Math.max(peakHeap, memory.heapUsed);
  }, 1);
  const requestBuildStarted = performance.now();
  const requests = attempts.map(({ context, store, index }) => {
    if (name === 'inline-full' || name === 'warm-inline') return inlineRequest(context, index, name);
    if (name === 'streaming-inline') return inlineRequest(context, index, name);
    if (name === 'bundle-ref' || name === 'warm-bundle-ref') return bundleRequest(context, store, index, name);
    if (name === 'manifest-content-ref') return manifestRequest(context, store, index);
    throw new Error(`unknown candidate: ${name}`);
  });
  const requestBuildMs = performance.now() - requestBuildStarted;
  const started = performance.now();
  let results;
  if (name.startsWith('warm-')) {
    const receiver = new WarmReceiver();
    try {
      const starts = requests.map(() => performance.now());
      results = await Promise.all(requests.map((request, index) => receiver.request(request).then((response) => ({
        response,
        wallMs: performance.now() - starts[index],
      }))));
    } finally {
      await receiver.close();
    }
  } else {
    results = await Promise.all(requests.map((request) => runFresh(request, { stream: name === 'streaming-inline' })));
  }
  const wallMs = performance.now() - started;
  clearInterval(sampler);
  const parentAfter = process.memoryUsage();
  const responses = results.map((entry) => entry.response);
  const failures = responses.filter((entry) => entry.ok !== true);
  if (failures.length > 0) throw new Error(`${name} receiver failures: ${JSON.stringify(failures)}`);
  return {
    candidate: name,
    attempts: attempts.length,
    processStarts: name.startsWith('warm-') ? 1 : attempts.length,
    requestBytes: requests.reduce((sum, request) => sum + request.length, 0),
    requestBuildMs,
    wallMs,
    throughputPerSecond: attempts.length / (wallMs / 1000),
    latency: latencySummary(results.map((entry) => entry.wallMs)),
    receiverRequestParseMs: responses.reduce((sum, response) => sum + response.requestParseMs, 0),
    receiverResolveMs: responses.reduce((sum, response) => sum + response.resolveMs, 0),
    receiverStorageBytes: responses.reduce((sum, response) => sum + response.storageBytes, 0),
    receiverCpuUserMs: responses.reduce((sum, response) => sum + response.cpuUserMs, 0),
    receiverCpuSystemMs: responses.reduce((sum, response) => sum + response.cpuSystemMs, 0),
    receiverMaxRssBytes: Math.max(...responses.map((response) => response.rssBytes)),
    receiverMaxHeapBytes: Math.max(...responses.map((response) => response.heapBytes)),
    receiverCacheStatuses: responses.reduce((map, response) => {
      map[response.cacheStatus] = (map[response.cacheStatus] ?? 0) + 1;
      return map;
    }, Object.create(null)),
    semanticEquivalent: responses.every((response, index) => response.baseDigest === attempts[index].context.baseDigest),
    modelVisibleContextBytes: attempts.reduce((sum, attempt) => sum + attempt.context.descriptor.contentBytes, 0),
    parentMemory: {
      beforeRss: parentBefore.rss,
      afterRss: parentAfter.rss,
      sampledPeakRss: peakRss,
      sampledRssDelta: Math.max(0, peakRss - parentBefore.rss),
      beforeHeap: parentBefore.heapUsed,
      afterHeap: parentAfter.heapUsed,
      sampledPeakHeap: peakHeap,
      sampledHeapDelta: Math.max(0, peakHeap - parentBefore.heapUsed),
    },
  };
}

async function prepareWithStore(repositoryPath, commit, root, label) {
  const context = await prepareContext(repositoryPath, commit);
  return { context, store: referenceStore(root, context, label) };
}

async function sameBaseMatrix(repositoryPath, commit, root) {
  const prepared = await prepareWithStore(repositoryPath, commit, root, 'actual');
  const results = [];
  for (const count of [1, 2, 4, 8]) {
    const attempts = Array.from({ length: count }, (_, index) => ({ ...prepared, index }));
    const candidates = ['inline-full', 'bundle-ref', 'manifest-content-ref', 'warm-inline'];
    for (const candidate of candidates) results.push({ workload: `same-base-${count}`, result: await measureCandidate(candidate, attempts) });
    if (count === 8) {
      results.push({ workload: 'same-base-8', result: await measureCandidate('streaming-inline', attempts) });
      results.push({ workload: 'same-base-8', result: await measureCandidate('warm-bundle-ref', attempts) });
    }
  }
  return { context: {
    commitOid: prepared.context.commitOid,
    baseDigest: prepared.context.baseDigest,
    contextDigest: prepared.context.descriptor.contextDigest,
    fileCount: prepared.context.descriptor.fileCount,
    contentBytes: prepared.context.descriptor.contentBytes,
    preparation: prepared.context.preparation,
    bundleBytes: prepared.store.bundleBytes,
    manifestBytes: prepared.store.manifestBytes,
    uniqueBlobCount: prepared.store.uniqueBlobCount,
  }, results };
}

async function retryMatrix(repositoryPath, commit, root) {
  const prepared = await prepareWithStore(repositoryPath, commit, root, 'retry');
  const results = [];
  for (const retries of [0, 1, 2, 3]) {
    const count = retries + 1;
    const attempts = Array.from({ length: count }, (_, index) => ({ ...prepared, index }));
    for (const candidate of ['inline-full', 'bundle-ref', 'manifest-content-ref', 'warm-inline']) {
      results.push({ workload: `retry-${retries}`, result: await measureCandidate(candidate, attempts) });
    }
    if (retries === 3) results.push({ workload: 'retry-3', result: await measureCandidate('warm-bundle-ref', attempts) });
  }
  return results;
}

async function multiBaseMatrix(root) {
  const fixture = makeRepository({
    revisions: 8,
    files: (revision) => Object.fromEntries(Array.from({ length: 32 }, (_, index) => [
      `files/f-${String(index).padStart(3, '0')}.txt`,
      index === 0 ? `revision-${revision}\n` : indexedContent(index, 4096, 'm'),
    ])),
  });
  try {
    const prepared = [];
    for (let index = 0; index < 8; index += 1) prepared.push(await prepareWithStore(fixture.repositoryPath, fixture.commits[index], root, `multi-${index}`));
    const results = [];
    for (const baseCount of [2, 4, 8]) {
      const attempts = Array.from({ length: 8 }, (_, index) => ({ ...prepared[index % baseCount], index }));
      for (const candidate of ['inline-full', 'bundle-ref', 'manifest-content-ref', 'warm-inline']) {
        results.push({ workload: `multi-base-${baseCount}`, result: await measureCandidate(candidate, attempts) });
      }
    }
    return results;
  } finally {
    fixture.cleanup();
  }
}

function shapeSpecification(kind) {
  if (kind === 'many-small') return { files: 2000, bytes: 256, pathFor: (index) => `small/d${index % 20}/f-${index}.txt`, fill: 's' };
  if (kind === 'few-large') return { files: 4, bytes: 256 * 1024, pathFor: (index) => `large/f-${index}.txt`, fill: 'l' };
  if (kind === 'deep') {
    const prefix = Array.from({ length: 40 }, (_, index) => `d${index}`).join('/');
    return { files: 128, bytes: 4096, pathFor: (index) => `${prefix}/f-${index}.txt`, fill: 'd' };
  }
  if (kind === 'wide') return { files: 2000, bytes: 256, pathFor: (index) => `wide-${String(index).padStart(5, '0')}.txt`, fill: 'w' };
  throw new Error(`unknown shape: ${kind}`);
}

async function shapeMatrix(root) {
  const results = [];
  for (const kind of ['many-small', 'few-large', 'deep', 'wide']) {
    const specification = shapeSpecification(kind);
    const fixture = makeRepository({
      revisions: 1,
      files: () => Object.fromEntries(Array.from({ length: specification.files }, (_, index) => [
        specification.pathFor(index),
        indexedContent(index, specification.bytes, specification.fill),
      ])),
    });
    try {
      const prepared = await prepareWithStore(fixture.repositoryPath, fixture.commits[0], root, `shape-${kind}`);
      const attempts = Array.from({ length: 4 }, (_, index) => ({ ...prepared, index }));
      for (const candidate of ['inline-full', 'bundle-ref', 'manifest-content-ref']) {
        results.push({ workload: `shape-${kind}-4`, result: await measureCandidate(candidate, attempts) });
      }
    } finally {
      fixture.cleanup();
    }
  }
  return results;
}

async function failureMatrix(repositoryPath, commit, root) {
  const prepared = await prepareWithStore(repositoryPath, commit, root, 'failures');
  const good = bundleRequest(prepared.context, prepared.store, 0);
  const restartFirst = await runFresh(good);
  const restartSecond = await runFresh(good);

  const stale = strictJsonParse(good);
  stale.invocation.baseDigest = `sha256:${'0'.repeat(64)}`;
  const staleResponse = await runFresh(Buffer.from(canonicalJson(stale), 'utf8'));

  const corruptPath = path.join(root, 'corrupt-bundle.json');
  const originalBundle = readFileSync(prepared.store.bundlePath);
  writeFileSync(corruptPath, Buffer.concat([originalBundle, Buffer.from('x')]));
  const corrupt = strictJsonParse(good);
  corrupt.reference.path = corruptPath;
  const corruptResponse = await runFresh(Buffer.from(canonicalJson(corrupt), 'utf8'));

  const missing = strictJsonParse(good);
  missing.reference.path = path.join(root, 'does-not-exist.json');
  const missingResponse = await runFresh(Buffer.from(canonicalJson(missing), 'utf8'));

  const cancelStarted = performance.now();
  const child = spawn(process.execPath, [SELF, '--receiver-single'], {
    stdio: ['pipe', 'pipe', 'ignore'],
    env: { ...process.env, TDEV_D0016_RECEIVER_DELAY_MS: '200' },
    shell: false,
  });
  child.stdin.end(good);
  await new Promise((resolve) => setTimeout(resolve, 20));
  child.kill('SIGKILL');
  const cancel = await new Promise((resolve) => child.once('close', (code, signal) => resolve({
    code,
    signal,
    wallMs: performance.now() - cancelStarted,
  })));

  return {
    restart: {
      first: restartFirst.response,
      second: restartSecond.response,
      equal: restartFirst.response.ok === true && restartSecond.response.ok === true && restartFirst.response.baseDigest === restartSecond.response.baseDigest,
    },
    staleIdentity: staleResponse.response,
    corruptReference: corruptResponse.response,
    missingReference: missingResponse.response,
    cancellation: cancel,
  };
}

function summarizeDecision(evidence) {
  const same8 = evidence.sameBase.results.filter((entry) => entry.workload === 'same-base-8');
  const byCandidate = Object.fromEntries(same8.map((entry) => [entry.result.candidate, entry.result]));
  const inline = byCandidate['inline-full'];
  const relative = Object.fromEntries(Object.entries(byCandidate).map(([candidate, result]) => [candidate, {
    requestByteChangePercent: 100 * ((result.requestBytes / inline.requestBytes) - 1),
    wallChangePercent: 100 * ((result.wallMs / inline.wallMs) - 1),
    processStarts: result.processStarts,
    receiverStorageBytes: result.receiverStorageBytes,
    semanticEquivalent: result.semanticEquivalent,
    modelVisibleContextBytes: result.modelVisibleContextBytes,
  }]));
  return {
    exactBaseline: {
      inlineRequestBytesSameBase8: inline.requestBytes,
      inlineProcessStartsSameBase8: inline.processStarts,
      contextBytesPerAttempt: evidence.sameBase.context.contentBytes,
    },
    sameBase8Relative: relative,
    semanticGate: {
      fullContextCandidatesEquivalent: same8.every((entry) => entry.result.semanticEquivalent === true),
      contextSlice: 'not-selected: deterministic dependency/completeness/quality contract and representative full-context comparison are absent',
    },
    interpretation: {
      bundleReference: 'reduces parent-to-receiver request bytes while preserving full receiver-visible context; fresh receivers still pay full reference resolution/storage reads and process starts',
      manifestContentReference: 'reduces request bytes but adds per-file reference-resolution work; file-count-sensitive complexity must earn its value over a single immutable bundle',
      warmInline: 'reduces process starts but retains full request bytes and full-context disclosure; one warm receiver is also a capacity/queue owner rather than a free optimization',
      streamingInline: 'preserves request bytes and full receiver parse in this bounded model; it may reduce peak copies only after a source-shaped streaming builder exists, so no product memory claim is made here',
      warmBundleReference: 'combines low request bytes with receiver-side exact-digest cache reuse after the first resolution; restart is cold and must re-resolve the immutable bundle',
    },
  };
}

async function main() {
  if (process.argv[2] === '--receiver-single') {
    await receiverSingle();
    return;
  }
  if (process.argv[2] === '--receiver-warm') {
    await receiverWarm();
    return;
  }
  const repositoryPath = path.resolve(process.cwd());
  const commit = process.argv[2] ?? 'HEAD';
  const root = mkdtempSync(path.join(tmpdir(), 'tdev-d0016-context-'));
  try {
    const sameBase = await sameBaseMatrix(repositoryPath, commit, root);
    const retry = await retryMatrix(repositoryPath, commit, root);
    const multiBase = await multiBaseMatrix(root);
    const shapes = await shapeMatrix(root);
    const failures = await failureMatrix(repositoryPath, commit, root);
    const evidence = {
      schemaVersion: 1,
      profile: 'tdev.context-delivery-decision-benchmark.v1',
      sourceSha: runGit(repositoryPath, ['rev-parse', 'HEAD']).toString('utf8').trim(),
      benchmarkCommit: runGit(repositoryPath, ['rev-parse', `${commit}^{commit}`]).toString('utf8').trim(),
      environment: {
        node: process.version,
        platform: `${process.platform}/${process.arch}`,
        git: runGit(repositoryPath, ['--version']).toString('utf8').trim(),
      },
      limits: requestLimits(),
      sameBase,
      retry,
      multiBase,
      shapes,
      failures,
      candidateBoundaries: {
        contextSlice: {
          executed: false,
          reason: 'D0016 requires deterministic selection/dependency/fallback and representative correctness/quality evidence before a model-visible semantic reduction can be selected.',
        },
        persistentCas: {
          executed: false,
          reason: 'No cross-worker reuse requirement is established; persistent publication/corruption/GC/migration contracts remain evidence-gated.',
        },
        externalProvider: {
          executed: false,
          reason: 'D0018 owns provider authentication, egress, tokenizer/billing/retry/privacy behavior; local fixture evidence cannot qualify those claims.',
        },
      },
    };
    evidence.decisionSummary = summarizeDecision(evidence);
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

await main();
