#!/usr/bin/env node
import { mkdtemp, mkdir, rm, truncate, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ContractError, digest, typedDigest } from '../src/canonical.mjs';
import {
  GitRepositoryModelExecutor,
  LAZY_REPOSITORY_CONTEXT_PROFILE,
} from '../src/repository-model-transport.mjs';
import { runGitCommand } from '../src/git-projection.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const LARGE_BYTES = 1024 * 1024 * 1024;

function fail(code, message, details = undefined) {
  throw new ContractError(code, message, details);
}

async function git(repositoryPath, args, input = null) {
  const result = await runGitCommand({ repositoryPath, args, input });
  if (result.code !== 0) fail('d0047_git_failed', `Git ${args[0]} failed`, { exitCode: result.code });
  return result.stdout;
}

function countedGit() {
  const metrics = { calls: [], inputBytes: 0, stdoutBytes: 0 };
  return {
    metrics,
    runner: async (input) => {
      metrics.calls.push([...input.args]);
      metrics.inputBytes += input.input?.length ?? 0;
      const result = await runGitCommand(input);
      metrics.stdoutBytes += result.stdout.length;
      return result;
    },
  };
}

function baseIdentity(commitOid, treeOid) {
  return typedDigest('tdev.repository-base-identity.v1', { schemaVersion: 1, objectFormat: 'sha1', commitOid, treeOid });
}

async function commitIdentity(repositoryPath) {
  const commitOid = (await git(repositoryPath, ['rev-parse', 'HEAD'])).toString('ascii').trim();
  const treeOid = (await git(repositoryPath, ['rev-parse', `${commitOid}^{tree}`])).toString('ascii').trim();
  return { commitOid, treeOid, baseDigest: baseIdentity(commitOid, treeOid) };
}

async function currentRepositoryQualification() {
  const repositoryPath = ROOT;
  const identity = await commitIdentity(repositoryPath);
  const counted = countedGit();
  const adapter = new GitRepositoryModelExecutor({
    repositoryPath,
    modelExecutable: process.execPath,
    timeoutMs: 30_000,
    gitRunner: counted.runner,
  });
  const scope = {
    paths: ['src/development-runtime.mjs', 'src/repository-model-transport.mjs', 'test/development-runtime.test.mjs'],
    maxFiles: 8,
    maxBytes: 4 * 1024 * 1024,
    maxSearchResults: 8,
  };
  const handle = await adapter.prepareLazyContext(identity.commitOid, identity.baseDigest, { scope });
  const beforeBlobReads = counted.metrics.calls.filter((args) => args[0] === 'cat-file' && args[1] === '--batch').length;
  if (beforeBlobReads !== 0) fail('d0047_cp2_eager_blob_read', 'Lazy preparation read blob contents before a scoped read');
  const manifestEntries = [];
  let cursor = 0;
  let manifestPage;
  do {
    manifestPage = adapter.listLazyManifest(handle, { cursor, limit: 128 });
    manifestEntries.push(...manifestPage.entries);
    cursor = manifestPage.nextCursor;
  } while (cursor !== null);
  if (manifestEntries.length !== handle.descriptor.manifestEntryCount || manifestPage.complete !== true) {
    fail('d0047_cp2_manifest_incomplete', 'Complete repository manifest was not recoverable by bounded pages');
  }
  const selected = adapter.listLazyContext(handle, { limit: 8 });
  if (!selected.complete || selected.entries.length !== scope.paths.length) fail('d0047_cp2_scope_projection_invalid', 'Owner-issued scope projection is incomplete');
  const read = await adapter.readLazyContext(handle, { path: 'src/development-runtime.mjs', maxBytes: 64 * 1024 });
  if (read.path !== 'src/development-runtime.mjs' || read.startByte !== 0 || read.endByte !== 64 * 1024 || read.complete) {
    fail('d0047_cp2_read_bound_invalid', 'Bounded lazy read did not report its range and truncation');
  }
  const search = await adapter.searchLazyContext(handle, { pattern: 'buildCodexPrompt', limit: 8 });
  if (!search.complete || !search.matches.includes('src/development-runtime.mjs')) fail('d0047_cp2_search_invalid', 'Bounded lazy search missed the selected source match');
  const afterBlobReads = counted.metrics.calls.filter((args) => args[0] === 'cat-file' && args[1] === '--batch').length;
  if (afterBlobReads < 2) fail('d0047_cp2_read_not_observed', 'Scoped reads did not issue bounded blob requests');
  return {
    profile: 'tdev.d0047.cp2-full-repository-lazy.v1',
    status: 'PASS',
    repositoryCommitOid: identity.commitOid,
    treeOid: identity.treeOid,
    baseDigest: identity.baseDigest,
    manifestDigest: handle.descriptor.manifestDigest,
    manifestEntryCount: handle.descriptor.manifestEntryCount,
    scopeDigest: handle.descriptor.scopeDigest,
    selectedEntryCount: handle.descriptor.selectedEntryCount,
    boundedRead: { path: read.path, bytes: read.endByte - read.startByte, complete: read.complete },
    search: { matches: search.matches, complete: search.complete, visitedFiles: search.visitedFiles, visitedBytes: search.visitedBytes },
    blobBatchReadsBeforeScope: beforeBlobReads,
    blobBatchReadsAfterScope: afterBlobReads,
    completeManifestPaged: true,
  };
}

async function largeRepositoryQualification() {
  const repositoryPath = await mkdtemp(path.join(os.tmpdir(), 'tdev-d0047-large-'));
  try {
    await mkdir(path.join(repositoryPath, 'src'), { recursive: true, mode: 0o700 });
    await writeFile(path.join(repositoryPath, 'src', 'small.txt'), 'small lazy file\n', { mode: 0o600 });
    const largePath = path.join(repositoryPath, 'large.bin');
    await writeFile(largePath, Buffer.alloc(0), { mode: 0o600 });
    await truncate(largePath, LARGE_BYTES);
    await git(repositoryPath, ['init', '-q']);
    await git(repositoryPath, ['config', 'user.name', 'tdev-d0047']);
    await git(repositoryPath, ['config', 'user.email', 'tdev-d0047@example.invalid']);
    await git(repositoryPath, ['add', '-A']);
    await git(repositoryPath, ['commit', '-qm', 'd0047 one-gib metadata fixture']);
    const identity = await commitIdentity(repositoryPath);
    const counted = countedGit();
    const adapter = new GitRepositoryModelExecutor({
      repositoryPath,
      modelExecutable: process.execPath,
      timeoutMs: 30_000,
      gitRunner: counted.runner,
    });
    const small = await adapter.prepareLazyContext(identity.commitOid, identity.baseDigest, {
      scope: { paths: ['src/small.txt'], maxFiles: 2, maxBytes: 1024 },
    });
    const largeEntry = small.manifest.find((entry) => entry.path === 'large.bin');
    if (!largeEntry || largeEntry.byteLength !== LARGE_BYTES) fail('d0047_cp3_manifest_size_invalid', '1 GiB entry was not preserved in the metadata manifest');
    if (counted.metrics.calls.some((args) => args[0] === 'cat-file' && args[1] === '--batch')) fail('d0047_cp3_eager_blob_read', '1 GiB lazy preparation read blob contents');
    const read = await adapter.readLazyContext(small, { path: 'src/small.txt' });
    if (read.content !== 'small lazy file\n') fail('d0047_cp3_small_read_invalid', 'Bounded small-file read failed in the 1 GiB fixture');
    const largeScope = await adapter.prepareLazyContext(identity.commitOid, identity.baseDigest, {
      scope: { paths: ['large.bin'], maxFiles: 1, maxBytes: 64 },
    });
    const search = await adapter.searchLazyContext(largeScope, { pattern: 'never-present' });
    if (search.complete !== false || search.visitedBytes !== 0) fail('d0047_cp3_incomplete_search_invalid', 'Large-file search was incorrectly reported complete');
    return {
      profile: 'tdev.d0047.cp3-one-gib-metadata.v1',
      status: 'PASS',
      repositoryCommitOid: identity.commitOid,
      treeOid: identity.treeOid,
      baseDigest: identity.baseDigest,
      manifestDigest: small.descriptor.manifestDigest,
      manifestEntryCount: small.descriptor.manifestEntryCount,
      largeEntryBytes: largeEntry.byteLength,
      smallRead: { path: read.path, bytes: Buffer.byteLength(read.content, 'utf8') },
      incompleteLargeSearch: { complete: search.complete, visitedBytes: search.visitedBytes },
      blobBatchReadsBeforeSmallRead: 0,
      fullContextStress: 'separate-not-run',
    };
  } finally {
    await rm(repositoryPath, { recursive: true, force: true });
  }
}

async function main() {
  const cp2 = await currentRepositoryQualification();
  const cp3 = await largeRepositoryQualification();
  process.stdout.write(`${JSON.stringify({ profile: 'tdev.d0047-lazy-context-qualification.v1', status: 'PASS', cp2, cp3 })}\n`);
}

main().catch((cause) => {
  process.stderr.write(`${JSON.stringify({ profile: 'tdev.d0047-lazy-context-qualification.v1', status: 'FAIL', code: cause?.code ?? 'd0047_failed', message: cause?.message ?? String(cause), details: cause?.details ?? null })}\n`);
  process.exitCode = 1;
});
