import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { link, lstat, open, readFile, rm, stat, statfs } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContractError } from './canonical.mjs';

export const IMMUTABLE_JOURNAL_PUBLICATION_BACKENDS = Object.freeze({
  HARDLINK: 'hardlink',
  RENAME_NOREPLACE: 'rename-noreplace',
});

const HELPER_PROTOCOL_VERSION = 1;
const HELPER_STATUSES = ['success', 'conflict', 'unsupported', 'denied', 'error', 'invalid'];
const HELPER_DEADLINE_MS = 5_000;
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MANIFEST_PATH = path.join(ROOT, 'native', 'd0030', 'manifest.json');
const NATIVE_ROOT = path.join(ROOT, 'native', 'd0030');

function storeError(code, message, details = {}, cause = undefined) {
  return new ContractError(code, message, details, cause === undefined ? undefined : { cause });
}

function unsupported(message, details = {}, cause = undefined) {
  return storeError('store_publication_unsupported', message, details, cause);
}

function ambiguous(message, details = {}, cause = undefined) {
  return storeError('store_commit_ambiguous', message, details, cause);
}

function writeFailed(message, details = {}, cause = undefined) {
  return storeError('store_write_failed', message, details, cause);
}

function conflict(details = {}) {
  return storeError('store_publish_conflict', 'Immutable journal commit slot already exists', details);
}

function isComponent(name) {
  return typeof name === 'string' && name.length > 0 && name !== '.' && name !== '..' && !name.includes('/');
}

function assertComponent(name, label) {
  if (!isComponent(name)) throw writeFailed(`Invalid D0030 ${label} basename`, { label });
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function scalar(value) {
  return typeof value === 'bigint' ? value.toString() : String(value);
}

async function readManifest() {
  let value;
  try {
    value = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  } catch (error) {
    throw unsupported('D0030 packaged helper manifest is unavailable or invalid', {}, error);
  }
  if (value?.schemaVersion !== 1 || value?.protocolVersion !== HELPER_PROTOCOL_VERSION || !value.helpers || typeof value.helpers !== 'object') {
    throw unsupported('D0030 packaged helper manifest has an unsupported schema');
  }
  return value;
}

function containedNativePath(relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || path.isAbsolute(relativePath)) return null;
  const resolved = path.resolve(ROOT, relativePath);
  const relative = path.relative(NATIVE_ROOT, resolved);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return resolved;
}

async function packagedHelperIdentity() {
  const manifest = await readManifest();
  const key = `${process.platform}-${process.arch}`;
  const entry = manifest.helpers[key];
  if (!entry || entry.platform !== process.platform || entry.arch !== process.arch) {
    throw unsupported('D0030 has no packaged rename-noreplace helper for this runtime', {
      platform: process.platform,
      arch: process.arch,
    });
  }
  const helperPath = containedNativePath(entry.relativePath);
  if (helperPath === null || !/^[0-9a-f]{64}$/.test(entry.sha256 ?? '')) {
    throw unsupported('D0030 packaged helper manifest entry is invalid', { platform: process.platform, arch: process.arch });
  }
  try {
    const metadata = await lstat(helperPath, { bigint: true });
    if (!metadata.isFile() || (Number(metadata.mode) & 0o111) === 0) {
      throw unsupported('D0030 packaged helper is not an executable regular file', { platform: process.platform, arch: process.arch });
    }
    const bytes = await readFile(helperPath);
    const actualSha256 = sha256(bytes);
    if (actualSha256 !== entry.sha256) {
      throw unsupported('D0030 packaged helper identity does not match its release manifest', {
        platform: process.platform,
        arch: process.arch,
        expectedSha256: entry.sha256,
        actualSha256,
      });
    }
    return {
      path: helperPath,
      key,
      protocolVersion: manifest.protocolVersion,
      expectedSha256: entry.sha256,
      actualSha256,
      sourceSha256: entry.sourceSha256 ?? null,
      dev: scalar(metadata.dev),
      ino: scalar(metadata.ino),
      size: scalar(metadata.size),
      mtimeNs: scalar(metadata.mtimeNs),
    };
  } catch (error) {
    if (error instanceof ContractError) throw error;
    throw unsupported('D0030 packaged helper is unavailable', { platform: process.platform, arch: process.arch }, error);
  }
}

function parseProtocol(bytes) {
  let offset = 0;
  let began = false;
  if (bytes[offset] === 0x42) {
    began = true;
    offset += 1;
  }
  if (bytes.length !== offset + 6 || bytes[offset] !== 0x52) {
    return { began, result: null, malformed: true };
  }
  const statusCode = bytes[offset + 1];
  const status = HELPER_STATUSES[statusCode] ?? 'unknown';
  return {
    began,
    malformed: status === 'unknown',
    result: status === 'unknown' ? null : {
      status,
      statusCode,
      errno: bytes.readUInt32LE(offset + 2),
    },
  };
}

async function executeHelper(identity, caseDirectory, sourceName, finalName, { deadlineMs = HELPER_DEADLINE_MS } = {}) {
  assertComponent(sourceName, 'source');
  assertComponent(finalName, 'final');
  let directoryHandle;
  try {
    directoryHandle = await open(caseDirectory, 'r');
  } catch (error) {
    throw writeFailed('Failed to open the D0030 Case directory', {}, error);
  }
  let child;
  let spawnError = null;
  const chunks = [];
  let capturedBytes = 0;
  let overflow = false;
  let timedOut = false;
  try {
    child = spawn(identity.path, [sourceName, finalName], {
      env: {},
      stdio: ['ignore', 'ignore', 'ignore', directoryHandle.fd, 'pipe'],
    });
    child.on('error', (error) => { spawnError = error; });
    child.stdio[4]?.on('data', (chunk) => {
      capturedBytes += chunk.byteLength;
      if (capturedBytes <= 64) chunks.push(Buffer.from(chunk));
      else overflow = true;
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, deadlineMs);
    timer.unref?.();
    const closed = await new Promise((resolve) => {
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    clearTimeout(timer);
    const bytes = Buffer.concat(chunks);
    const protocol = overflow ? { began: bytes[0] === 0x42, result: null, malformed: true } : parseProtocol(bytes);
    return { ...closed, timedOut, spawnError, protocol, capturedBytes };
  } catch (error) {
    throw writeFailed('Failed to execute the D0030 packaged helper', {}, error);
  } finally {
    await directoryHandle.close().catch(() => {});
  }
}

async function ensureIdentityUnchanged(before, protocol) {
  let after;
  try {
    after = await packagedHelperIdentity();
  } catch (error) {
    if (protocol?.began) throw ambiguous('D0030 helper identity changed after publication could have begun', {}, error);
    throw error;
  }
  const same = ['key', 'expectedSha256', 'actualSha256', 'dev', 'ino', 'size', 'mtimeNs']
    .every((key) => after[key] === before[key]);
  if (!same) {
    if (protocol?.began) throw ambiguous('D0030 helper identity changed after publication could have begun');
    throw unsupported('D0030 helper identity changed before publication');
  }
}

function classifyHelperOutcome(outcome, identity = null) {
  if (outcome.spawnError?.code === 'ENOENT') {
    throw unsupported('D0030 packaged helper disappeared before execution', {}, outcome.spawnError);
  }
  const abnormalCompletion = outcome.timedOut || outcome.signal !== null || outcome.spawnError !== null || outcome.code !== 0;
  if (abnormalCompletion) {
    const details = {
      timedOut: outcome.timedOut,
      exitCode: outcome.code,
      signal: outcome.signal,
      spawnCode: outcome.spawnError?.code ?? null,
    };
    if (outcome.protocol.began) {
      throw ambiguous('D0030 helper completed abnormally after publication could have begun', details, outcome.spawnError ?? undefined);
    }
    throw writeFailed('D0030 helper completed abnormally before the publication begin marker', details, outcome.spawnError ?? undefined);
  }
  if (outcome.protocol.malformed || outcome.protocol.result === null) {
    if (outcome.protocol.began) {
      throw ambiguous('D0030 helper result was lost after publication could have begun', {
        timedOut: outcome.timedOut,
        exitCode: outcome.code,
        signal: outcome.signal,
      });
    }
    throw writeFailed('D0030 helper returned no complete result before the publication begin marker', {
      timedOut: outcome.timedOut,
      exitCode: outcome.code,
      signal: outcome.signal,
    });
  }
  const { status, errno } = outcome.protocol.result;
  if (status === 'success') return { status, errno, identity };
  if (status === 'conflict') throw conflict({ errno });
  if (status === 'unsupported' || status === 'denied') {
    throw unsupported('D0030 rename-noreplace capability is not supported by this runtime/filesystem', { status, errno });
  }
  throw writeFailed('D0030 helper returned a native publication error', { status, errno });
}

async function renameNoReplaceRaw(caseDirectory, sourceName, finalName) {
  const identity = await packagedHelperIdentity();
  const outcome = await executeHelper(identity, caseDirectory, sourceName, finalName);
  await ensureIdentityUnchanged(identity, outcome.protocol);
  return classifyHelperOutcome(outcome, identity);
}

async function hardlinkRaw(caseDirectory, sourceName, finalName) {
  const sourcePath = path.join(caseDirectory, sourceName);
  const finalPath = path.join(caseDirectory, finalName);
  try {
    await link(sourcePath, finalPath);
    return { status: 'success', errno: 0, identity: null };
  } catch (error) {
    if (error?.code === 'EEXIST') throw conflict({ nativeCode: error.code });
    if (['EACCES', 'EPERM', 'ENOSYS', 'EOPNOTSUPP', 'EINVAL', 'EXDEV'].includes(error?.code)) {
      throw unsupported('Immutable-journal hard-link publication is not qualified on this runtime/filesystem', { nativeCode: error.code }, error);
    }
    throw writeFailed('Immutable-journal hard-link publication failed', { nativeCode: error?.code ?? null }, error);
  }
}

async function syncDirectory(directory) {
  const handle = await open(directory, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function removeQuietly(filePath) {
  await rm(filePath, { force: true }).catch(() => {});
}

async function publicationValidityKey(backend, caseDirectory) {
  const directory = await stat(caseDirectory, { bigint: true });
  const filesystem = await statfs(caseDirectory, { bigint: true });
  const base = {
    backend,
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    caseDirectory: path.resolve(caseDirectory),
    directoryDev: scalar(directory.dev),
    filesystemType: scalar(filesystem.type),
    filesystemBlockSize: scalar(filesystem.bsize),
  };
  if (backend === IMMUTABLE_JOURNAL_PUBLICATION_BACKENDS.RENAME_NOREPLACE) {
    base.helper = await packagedHelperIdentity();
  }
  return JSON.stringify(base);
}

async function qualifyBackend(backend, caseDirectory) {
  const token = `${process.pid}-${randomUUID()}`;
  const sourceName = `.d0030-capability-${token}.tmp`;
  const finalName = `.d0030-capability-${token}.final`;
  const loserName = `.d0030-capability-${token}.loser`;
  const sourcePath = path.join(caseDirectory, sourceName);
  const finalPath = path.join(caseDirectory, finalName);
  const loserPath = path.join(caseDirectory, loserName);
  const payload = Buffer.from('tdev-d0030-capability-v1\n', 'utf8');
  let sourceHandle = null;
  let loserHandle = null;
  let qualificationError = null;
  try {
    sourceHandle = await open(sourcePath, 'wx', 0o600);
    await sourceHandle.writeFile(payload);
    await sourceHandle.sync();
    const before = await sourceHandle.stat({ bigint: true });
    await sourceHandle.close();
    sourceHandle = null;
    if (backend === IMMUTABLE_JOURNAL_PUBLICATION_BACKENDS.RENAME_NOREPLACE) {
      await renameNoReplaceRaw(caseDirectory, sourceName, finalName);
    } else {
      await hardlinkRaw(caseDirectory, sourceName, finalName);
    }
    const finalMetadata = await lstat(finalPath, { bigint: true });
    if (!finalMetadata.isFile()) throw new Error('capability final is not regular');
    if (!(await readFile(finalPath)).equals(payload)) throw new Error('capability final bytes differ');
    if (before.dev !== finalMetadata.dev || before.ino !== finalMetadata.ino) throw new Error('capability inode identity differs');
    if (backend === IMMUTABLE_JOURNAL_PUBLICATION_BACKENDS.RENAME_NOREPLACE) {
      try {
        await lstat(sourcePath);
        throw new Error('rename capability source remained visible');
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    loserHandle = await open(loserPath, 'wx', 0o600);
    await loserHandle.writeFile(payload);
    await loserHandle.sync();
    await loserHandle.close();
    loserHandle = null;
    let sawConflict = false;
    try {
      if (backend === IMMUTABLE_JOURNAL_PUBLICATION_BACKENDS.RENAME_NOREPLACE) {
        await renameNoReplaceRaw(caseDirectory, loserName, finalName);
      } else {
        await hardlinkRaw(caseDirectory, loserName, finalName);
      }
    } catch (error) {
      if (error?.code === 'store_publish_conflict') sawConflict = true;
      else throw error;
    }
    if (!sawConflict) throw new Error('capability probe did not observe destination conflict');
    if (!(await readFile(finalPath)).equals(payload)) throw new Error('capability winner changed after conflict');
    await lstat(loserPath);
    await syncDirectory(caseDirectory);
  } catch (error) {
    qualificationError = unsupported(`Immutable-journal ${backend} publication capability probe failed`, {
      backend,
      causeCode: error?.code ?? null,
    }, error);
  } finally {
    if (sourceHandle) await sourceHandle.close().catch(() => {});
    if (loserHandle) await loserHandle.close().catch(() => {});
    await removeQuietly(sourcePath);
    await removeQuietly(loserPath);
    await removeQuietly(finalPath);
    try {
      await syncDirectory(caseDirectory);
    } catch (error) {
      if (qualificationError === null) {
        qualificationError = unsupported(`Immutable-journal ${backend} capability cleanup directory sync failed`, { backend }, error);
      }
    }
  }
  if (qualificationError !== null) throw qualificationError;
}

function cacheQualifiedCapability(capabilities, location, beforeKey, afterKey, backend) {
  if (beforeKey !== afterKey) {
    capabilities.delete(location);
    throw unsupported(`Immutable-journal ${backend} publication validity changed during capability qualification`, { backend });
  }
  capabilities.set(location, afterKey);
  return afterKey;
}

async function withCapabilityInvalidation(capabilities, location, operation) {
  try {
    return await operation();
  } catch (error) {
    if (error?.code === 'store_publication_unsupported') capabilities.delete(location);
    throw error;
  }
}

export function defaultImmutableJournalPublicationBackend() {
  if (process.platform === 'android' && process.arch === 'arm64') {
    return IMMUTABLE_JOURNAL_PUBLICATION_BACKENDS.RENAME_NOREPLACE;
  }
  return IMMUTABLE_JOURNAL_PUBLICATION_BACKENDS.HARDLINK;
}

export function createImmutableJournalPublicationAdapter(backend = defaultImmutableJournalPublicationBackend()) {
  if (!Object.values(IMMUTABLE_JOURNAL_PUBLICATION_BACKENDS).includes(backend)) {
    throw new ContractError('invalid_store_publication_backend', `Unsupported immutable-journal publication backend ${String(backend)}`);
  }
  const capabilities = new Map();
  return Object.freeze({
    backend,
    async qualify(caseDirectory) {
      const location = path.resolve(caseDirectory);
      const key = await publicationValidityKey(backend, caseDirectory).catch((error) => {
        if (error instanceof ContractError) throw error;
        throw unsupported(`Failed to derive ${backend} publication validity key`, { backend }, error);
      });
      if (capabilities.get(location) === key) return key;
      capabilities.delete(location);
      await qualifyBackend(backend, caseDirectory);
      const verifiedKey = await publicationValidityKey(backend, caseDirectory).catch((error) => {
        if (error instanceof ContractError) throw error;
        throw unsupported(`Failed to re-derive ${backend} publication validity key after qualification`, { backend }, error);
      });
      return cacheQualifiedCapability(capabilities, location, key, verifiedKey, backend);
    },
    async publish(caseDirectory, sourceName, finalName) {
      const location = path.resolve(caseDirectory);
      return withCapabilityInvalidation(capabilities, location, async () => {
        await this.qualify(caseDirectory);
        if (backend === IMMUTABLE_JOURNAL_PUBLICATION_BACKENDS.RENAME_NOREPLACE) {
          return renameNoReplaceRaw(caseDirectory, sourceName, finalName);
        }
        return hardlinkRaw(caseDirectory, sourceName, finalName);
      });
    },
  });
}

export const D0030_INTERNAL = Object.freeze({
  helperProtocolVersion: HELPER_PROTOCOL_VERSION,
  packagedHelperIdentity,
  executeHelper,
  parseProtocol,
  classifyHelperOutcome,
  qualifyBackend,
  cacheQualifiedCapability,
  withCapabilityInvalidation,
});
