import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import { ContractError, typedDigest } from '../src/canonical.mjs';
import {
  GIT_PROJECTION_CANDIDATE_DOMAIN,
  GIT_PROJECTION_PROFILE,
  GitProjectionAdapter,
} from '../src/git-projection.mjs';
import { buildSemanticTree } from '../src/semantic-authority.mjs';

const execFileAsync = promisify(execFile);
const REF = 'refs/heads/projection';
const METADATA = Object.freeze({
  authorName: 'tdev',
  authorEmail: 'tdev@example.invalid',
  timestampSeconds: 1_700_000_000,
  timezoneOffset: '+0000',
  message: 'project semantic root',
});

async function git(repositoryPath, args, { encoding = 'utf8' } = {}) {
  const result = await execFileAsync('git', ['-C', repositoryPath, ...args], {
    encoding,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  return result.stdout;
}

async function initBare(t, objectFormat = 'sha1') {
  const repositoryPath = await mkdtemp(join(tmpdir(), `tdev-git-${objectFormat}-`));
  t.after(() => rm(repositoryPath, { recursive: true, force: true }));
  const args = ['init', '--bare', '-q'];
  if (objectFormat !== 'sha1') args.push(`--object-format=${objectFormat}`);
  await execFileAsync('git', [...args, repositoryPath]);
  return repositoryPath;
}

function adapter(repositoryPath, options = {}) {
  return new GitProjectionAdapter({ repositoryPath, publicationRef: REF, ...options });
}

function semantic(contents = {
  'a.txt': 'alpha\n',
  'dir/b.txt': 'beta\n',
  'dir/nested/한글.txt': '가나다\n',
}) {
  return buildSemanticTree(contents);
}

async function refOid(repositoryPath, ref = REF) {
  try {
    return (await git(repositoryPath, ['show-ref', '--verify', '--hash', ref])).trim();
  } catch (error) {
    if (error.code === 1 || error.code === 128) return null;
    throw error;
  }
}

async function recursiveTree(repositoryPath, treeOid) {
  const raw = await git(repositoryPath, ['ls-tree', '-rz', '--full-tree', treeOid], { encoding: 'buffer' });
  const records = raw.toString('utf8').split('\0').filter(Boolean);
  const output = [];
  for (const record of records) {
    const tab = record.indexOf('\t');
    const header = record.slice(0, tab).split(' ');
    output.push({ mode: header[0], type: header[1], oid: header[2], path: record.slice(tab + 1) });
  }
  return output;
}

async function assertGitMatches(repositoryPath, candidate, expected) {
  const records = await recursiveTree(repositoryPath, candidate.treeOid);
  assert.deepEqual(records.map(({ mode, type, path }) => ({ mode, type, path })),
    Object.keys(expected).sort().map((path) => ({ mode: '100644', type: 'blob', path })));
  for (const record of records) {
    const bytes = await git(repositoryPath, ['cat-file', 'blob', record.oid], { encoding: 'buffer' });
    assert.deepEqual(bytes, Buffer.from(expected[record.path], 'utf8'));
  }
}

async function publishSeed(t, repositoryPath, contents = { 'seed.txt': 'seed\n' }) {
  const semanticTree = semantic(contents);
  const projection = adapter(repositoryPath);
  const candidate = await projection.project({ semanticTree, commitMetadata: METADATA });
  const receipt = await projection.publish(candidate);
  assert.equal(receipt.outcome, 'observed');
  return { semanticTree, projection, candidate, receipt };
}

function errorCode(code) {
  return (error) => error instanceof ContractError && error.code === code;
}

function forgeCandidate(candidate, overrides = {}) {
  const identity = {
    schemaVersion: candidate.schemaVersion,
    profile: candidate.profile,
    semanticRootDigest: candidate.semanticRootDigest,
    objectFormat: candidate.objectFormat,
    publicationRef: candidate.publicationRef,
    expectedRefOid: candidate.expectedRefOid,
    treeOid: candidate.treeOid,
    commitOid: candidate.commitOid,
    commitMetadata: candidate.commitMetadata,
    ...overrides,
  };
  return {
    ...identity,
    candidateDigest: typedDigest(GIT_PROJECTION_CANDIDATE_DOMAIN, identity),
  };
}

async function looseObjectCount(repositoryPath) {
  const output = await git(repositoryPath, ['count-objects', '-v']);
  const line = output.split('\n').find((value) => value.startsWith('count: '));
  return Number.parseInt(line.slice('count: '.length), 10);
}

test('real Git projection preserves exact semantic text tree, mode, determinism, and no ref side effect', async (t) => {
  const repositoryPath = await initBare(t);
  const expected = {
    'a.txt': 'alpha\n',
    'dir/b.txt': 'beta\n',
    'dir/nested/한글.txt': '가나다\n',
  };
  const semanticTree = semantic(expected);
  const beforeRoot = semanticTree.rootDescriptor;
  const projection = adapter(repositoryPath);

  const first = await projection.project({ semanticTree, commitMetadata: METADATA });
  const reversedTree = semantic(Object.fromEntries(Object.entries(expected).reverse()));
  const second = await projection.project({ semanticTree: reversedTree, commitMetadata: METADATA });

  assert.equal(first.profile, GIT_PROJECTION_PROFILE);
  assert.equal(first.semanticRootDigest, beforeRoot.rootDigest);
  assert.equal(first.treeOid, second.treeOid);
  assert.equal(first.commitOid, second.commitOid);
  assert.equal(first.candidateDigest, second.candidateDigest);
  assert.deepEqual(semanticTree.rootDescriptor, beforeRoot);
  assert.equal(await refOid(repositoryPath), null);
  await assertGitMatches(repositoryPath, first, expected);
});

test('same semantic root projects into distinct valid SHA-1 and SHA-256 Git identities', async (t) => {
  const sha1Repository = await initBare(t, 'sha1');
  const sha256Repository = await initBare(t, 'sha256');
  const semanticTree = semantic();
  const sha1Candidate = await adapter(sha1Repository).project({ semanticTree, commitMetadata: METADATA });
  const sha256Candidate = await adapter(sha256Repository).project({ semanticTree, commitMetadata: METADATA });

  assert.equal(sha1Candidate.semanticRootDigest, sha256Candidate.semanticRootDigest);
  assert.equal(sha1Candidate.objectFormat, 'sha1');
  assert.equal(sha256Candidate.objectFormat, 'sha256');
  assert.equal(sha1Candidate.treeOid.length, 40);
  assert.equal(sha1Candidate.commitOid.length, 40);
  assert.equal(sha256Candidate.treeOid.length, 64);
  assert.equal(sha256Candidate.commitOid.length, 64);
  assert.notEqual(sha1Candidate.commitOid, sha256Candidate.commitOid);
});

test('bare repository create CAS has exactly one winner across independent publishers', async (t) => {
  const repositoryPath = await initBare(t);
  const left = adapter(repositoryPath);
  const right = adapter(repositoryPath);
  const leftCandidate = await left.project({ semanticTree: semantic({ 'left.txt': 'left\n' }), commitMetadata: METADATA });
  const rightCandidate = await right.project({ semanticTree: semantic({ 'right.txt': 'right\n' }), commitMetadata: METADATA });

  const results = await Promise.allSettled([left.publish(leftCandidate), right.publish(rightCandidate)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected' && result.reason?.code === 'git_publication_conflict').length, 1);
  const winner = results[0].status === 'fulfilled' ? leftCandidate : rightCandidate;
  assert.equal(await refOid(repositoryPath), winner.commitOid);
});

test('existing predecessor CAS has one winner and candidate parent is the exact predecessor', async (t) => {
  const repositoryPath = await initBare(t);
  const seed = await publishSeed(t, repositoryPath);
  const left = adapter(repositoryPath);
  const right = adapter(repositoryPath);
  const leftCandidate = await left.project({
    semanticTree: semantic({ 'left.txt': 'left\n' }),
    expectedRefOid: seed.candidate.commitOid,
    commitMetadata: METADATA,
  });
  const rightCandidate = await right.project({
    semanticTree: semantic({ 'right.txt': 'right\n' }),
    expectedRefOid: seed.candidate.commitOid,
    commitMetadata: METADATA,
  });
  assert.equal((await git(repositoryPath, ['rev-parse', `${leftCandidate.commitOid}^`])).trim(), seed.candidate.commitOid);
  assert.equal((await git(repositoryPath, ['rev-parse', `${rightCandidate.commitOid}^`])).trim(), seed.candidate.commitOid);

  const results = await Promise.allSettled([left.publish(leftCandidate), right.publish(rightCandidate)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected' && result.reason?.code === 'git_publication_conflict').length, 1);
});

test('pre-update fault remains not applied and post-update response loss reconciles as applied', async (t) => {
  const preRepository = await initBare(t);
  const preAdapter = adapter(preRepository, {
    faultInjector(stage) {
      if (stage === 'before_ref_update') throw new Error('pre-update fault');
    },
  });
  const preCandidate = await preAdapter.project({ semanticTree: semantic(), commitMetadata: METADATA });
  await assert.rejects(() => preAdapter.publish(preCandidate), errorCode('git_publication_not_applied'));
  assert.equal(await refOid(preRepository), null);

  const postRepository = await initBare(t);
  const postAdapter = adapter(postRepository, {
    faultInjector(stage) {
      if (stage === 'after_ref_update') throw new Error('lost response');
    },
  });
  const postCandidate = await postAdapter.project({ semanticTree: semantic(), commitMetadata: METADATA });
  const receipt = await postAdapter.publish(postCandidate);
  assert.equal(receipt.outcome, 'reconciled');
  assert.equal(await refOid(postRepository), postCandidate.commitOid);
});

test('publication reconciliation distinguishes predecessor, candidate, and third state across restart', async (t) => {
  const repositoryPath = await initBare(t);
  const first = adapter(repositoryPath);
  const candidate = await first.project({ semanticTree: semantic({ 'candidate.txt': 'candidate\n' }), commitMetadata: METADATA });
  const beforePublication = await first.reconcilePublication(candidate);
  assert.equal(beforePublication.status, 'not_applied');
  assert.equal(beforePublication.observedRefOid, null);

  const third = await first.project({ semanticTree: semantic({ 'third.txt': 'third\n' }), commitMetadata: { ...METADATA, message: 'third' } });
  await first.publish(third);
  const thirdState = await first.reconcilePublication(candidate);
  assert.equal(thirdState.status, 'conflict');
  assert.equal(thirdState.observedRefOid, third.commitOid);

  const anotherRepository = await initBare(t);
  const original = adapter(anotherRepository);
  const published = await original.project({ semanticTree: semantic(), commitMetadata: METADATA });
  await original.publish(published);
  const reopened = adapter(anotherRepository);
  const afterRestart = await reopened.reconcilePublication(published);
  assert.equal(afterRestart.status, 'applied');
  assert.equal(afterRestart.observedRefOid, published.commitOid);
});

test('fenced rollback restores predecessor or absence and response loss reconciles', async (t) => {
  const repositoryPath = await initBare(t);
  const seed = await publishSeed(t, repositoryPath);
  const projection = adapter(repositoryPath, {
    faultInjector(stage) {
      if (stage === 'after_ref_rollback') throw new Error('lost rollback response');
    },
  });
  const candidate = await projection.project({
    semanticTree: semantic({ 'next.txt': 'next\n' }),
    expectedRefOid: seed.candidate.commitOid,
    commitMetadata: { ...METADATA, message: 'next' },
  });
  const receipt = await projection.publish(candidate);
  const rollback = await projection.rollback(receipt);
  assert.equal(rollback.status, 'applied');
  assert.equal(rollback.outcome, 'reconciled');
  assert.equal(await refOid(repositoryPath), seed.candidate.commitOid);

  const createdRepository = await initBare(t);
  const creator = adapter(createdRepository);
  const createdCandidate = await creator.project({ semanticTree: semantic(), commitMetadata: METADATA });
  const createdReceipt = await creator.publish(createdCandidate);
  const deleted = await creator.rollback(createdReceipt);
  assert.equal(deleted.status, 'applied');
  assert.equal(await refOid(createdRepository), null);
});

test('stale rollback is fenced by an intervening publication', async (t) => {
  const repositoryPath = await initBare(t);
  const seed = await publishSeed(t, repositoryPath);
  const projection = adapter(repositoryPath);
  const first = await projection.project({
    semanticTree: semantic({ 'first.txt': 'first\n' }),
    expectedRefOid: seed.candidate.commitOid,
    commitMetadata: { ...METADATA, message: 'first' },
  });
  const firstReceipt = await projection.publish(first);
  const second = await projection.project({
    semanticTree: semantic({ 'second.txt': 'second\n' }),
    expectedRefOid: first.commitOid,
    commitMetadata: { ...METADATA, message: 'second' },
  });
  await projection.publish(second);

  await assert.rejects(() => projection.rollback(firstReceipt), errorCode('git_rollback_conflict'));
  assert.equal(await refOid(repositoryPath), second.commitOid);
});

test('publication ref namespace, symbolic refs, predecessor type, and commit metadata fail closed', async (t) => {
  const repositoryPath = await initBare(t);
  assert.throws(() => new GitProjectionAdapter({ repositoryPath, publicationRef: 'refs/tags/projection' }), errorCode('invalid_git_publication_ref'));
  assert.throws(() => new GitProjectionAdapter({ repositoryPath, publicationRef: 'heads/projection' }), errorCode('invalid_git_publication_ref'));

  await git(repositoryPath, ['symbolic-ref', REF, 'refs/heads/target']);
  await assert.rejects(() => adapter(repositoryPath).inspect(), errorCode('git_symbolic_publication_ref'));
  await git(repositoryPath, ['symbolic-ref', '-d', REF]);

  const blobSource = join(repositoryPath, 'not-a-commit.txt');
  await writeFile(blobSource, 'not a commit');
  const blob = (await git(repositoryPath, ['hash-object', '-w', blobSource])).trim();
  await assert.rejects(() => adapter(repositoryPath).project({ semanticTree: semantic(), expectedRefOid: blob, commitMetadata: METADATA }), errorCode('invalid_git_predecessor'));

  const invalid = [
    { ...METADATA, authorName: 'bad\nname' },
    { ...METADATA, authorEmail: 'bad\0email' },
    { ...METADATA, timestampSeconds: -1 },
    { ...METADATA, timezoneOffset: '+2460' },
    { ...METADATA, message: 'x'.repeat(64 * 1024 + 1) },
  ];
  for (const commitMetadata of invalid) {
    await assert.rejects(() => adapter(repositoryPath).project({ semanticTree: semantic(), commitMetadata }), errorCode('invalid_git_commit_metadata'));
  }
});

test('reconciliation is read-only and does not create another Git object', async (t) => {
  const repositoryPath = await initBare(t);
  const projection = adapter(repositoryPath);
  const candidate = await projection.project({ semanticTree: semantic(), commitMetadata: METADATA });
  const before = await looseObjectCount(repositoryPath);
  const reconciliation = await projection.reconcilePublication(candidate);
  const after = await looseObjectCount(repositoryPath);
  assert.equal(reconciliation.status, 'not_applied');
  assert.equal(after, before);
});

test('recomputed candidate digest cannot hide semantic-root or commit-metadata tampering', async (t) => {
  const semanticRepository = await initBare(t);
  const semanticProjection = adapter(semanticRepository);
  const candidate = await semanticProjection.project({ semanticTree: semantic(), commitMetadata: METADATA });
  const unrelatedRoot = semantic({ 'other.txt': 'other\n' }).rootDescriptor.rootDigest;
  const semanticForgery = forgeCandidate(candidate, { semanticRootDigest: unrelatedRoot });
  await assert.rejects(() => semanticProjection.publish(semanticForgery), errorCode('git_projection_semantic_mismatch'));
  assert.equal(await refOid(semanticRepository), null);

  const commitRepository = await initBare(t);
  const commitProjection = adapter(commitRepository);
  const commitCandidate = await commitProjection.project({ semanticTree: semantic(), commitMetadata: METADATA });
  const metadataForgery = forgeCandidate(commitCandidate, {
    commitMetadata: { ...commitCandidate.commitMetadata, message: 'forged metadata\n' },
  });
  await assert.rejects(() => commitProjection.publish(metadataForgery), errorCode('git_projection_commit_mismatch'));
  assert.equal(await refOid(commitRepository), null);
});

test('inherited Git environment cannot redirect the adapter repository', async (t) => {
  const repositoryPath = await initBare(t, 'sha1');
  const decoyRepository = await initBare(t, 'sha256');
  const previousGitDir = process.env.GIT_DIR;
  let candidate;
  process.env.GIT_DIR = decoyRepository;
  try {
    const inspected = await adapter(repositoryPath).inspect();
    assert.equal(inspected.objectFormat, 'sha1');
    candidate = await adapter(repositoryPath).project({ semanticTree: semantic(), commitMetadata: METADATA });
    await adapter(repositoryPath).publish(candidate);
  } finally {
    if (previousGitDir === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = previousGitDir;
  }
  assert.equal(await refOid(repositoryPath), candidate.commitOid);
  assert.equal(await refOid(decoyRepository), null);
});

test('adapter plumbing overrides repository reference-transaction hooks', async (t) => {
  const repositoryPath = await initBare(t);
  const hooks = join(repositoryPath, 'd0011-hooks');
  const marker = join(repositoryPath, 'hook-ran');
  await mkdir(hooks);
  const hook = join(hooks, 'reference-transaction');
  await writeFile(hook, `#!/bin/sh\nprintf ran > ${JSON.stringify(marker)}\nexit 1\n`);
  await chmod(hook, 0o755);
  await git(repositoryPath, ['config', 'core.hooksPath', hooks]);

  const projection = adapter(repositoryPath);
  const candidate = await projection.project({ semanticTree: semantic(), commitMetadata: METADATA });
  await projection.publish(candidate);
  assert.equal(await refOid(repositoryPath), candidate.commitOid);
  await assert.rejects(() => readFile(marker), (error) => error?.code === 'ENOENT');
});
