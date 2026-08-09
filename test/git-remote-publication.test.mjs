import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import { ContractError } from '../src/canonical.mjs';
import { GitProjectionAdapter } from '../src/git-projection.mjs';
import {
  GIT_REMOTE_PUBLICATION_PROFILE,
  GitRemotePublicationAdapter,
  runRemoteGitCommand,
} from '../src/git-remote-publication.mjs';
import { buildSemanticTree } from '../src/semantic-authority.mjs';

const execFileAsync = promisify(execFile);
const REF = 'refs/heads/projection';
const METADATA = Object.freeze({
  authorName: 'tdev',
  authorEmail: 'tdev@example.invalid',
  timestampSeconds: 1_700_100_000,
  timezoneOffset: '+0000',
  message: 'remote projection',
});

async function git(repositoryPath, args) {
  const { stdout } = await execFileAsync('git', ['-C', repositoryPath, ...args], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  return stdout;
}

async function initBare(t, prefix = 'tdev-remote-git-') {
  const path = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(path, { recursive: true, force: true }));
  await execFileAsync('git', ['init', '--bare', '-q', path]);
  return path;
}

function semantic(contents) {
  return buildSemanticTree(contents);
}

function projection(repositoryPath) {
  return new GitProjectionAdapter({ repositoryPath, publicationRef: REF });
}

function remote(projectionAdapter, options = {}) {
  return new GitRemotePublicationAdapter({ projectionAdapter, remoteName: 'origin', ...options });
}

function errorCode(code) {
  return (error) => error instanceof ContractError && error.code === code;
}

async function refOid(repositoryPath) {
  try {
    return (await git(repositoryPath, ['show-ref', '--verify', '--hash', REF])).trim();
  } catch (error) {
    if (error.code === 1 || error.code === 128) return null;
    throw error;
  }
}

async function fixture(t, { remotePath = null, seedRemote = true, publishChild = true, childName = 'child.txt' } = {}) {
  const localPath = await initBare(t, 'tdev-local-git-');
  const targetPath = remotePath ?? await initBare(t, 'tdev-remote-git-');
  await git(localPath, ['remote', 'add', 'origin', targetPath]);
  const local = projection(localPath);
  const seed = await local.project({ semanticTree: semantic({ 'seed.txt': 'seed\n' }), commitMetadata: METADATA });
  await local.publish(seed);
  if (seedRemote) await git(localPath, ['push', 'origin', `${seed.commitOid}:${REF}`]);
  const child = await local.project({
    semanticTree: semantic({ 'seed.txt': 'seed\n', [childName]: `${childName}\n` }),
    expectedRefOid: seed.commitOid,
    commitMetadata: METADATA,
  });
  if (publishChild) await local.publish(child);
  return { localPath, remotePath: targetPath, local, seed, child };
}

test('existing remote branch publishes exact D0011 candidate and receipts persist no clear target', async (t) => {
  const fx = await fixture(t);
  const adapter = remote(fx.local);
  const intent = await adapter.preparePublication(fx.child);
  assert.equal(intent.profile, GIT_REMOTE_PUBLICATION_PROFILE);
  assert.equal(intent.predecessorOid, fx.seed.commitOid);
  assert.equal(JSON.stringify(intent).includes(fx.remotePath), false);

  const receipt = await adapter.publish(intent, fx.child);
  assert.equal(receipt.outcome, 'observed');
  assert.equal(receipt.commitOid, fx.child.commitOid);
  assert.equal(JSON.stringify(receipt).includes(fx.remotePath), false);
  assert.equal(await refOid(fx.remotePath), fx.child.commitOid);
  const reconciliation = await adapter.reconcilePublication(intent, fx.child);
  assert.equal(reconciliation.status, 'applied');
  assert.equal(reconciliation.observedRefOid, fx.child.commitOid);
});

test('missing remote branch and unelected local candidate fail before remote mutation', async (t) => {
  const absent = await fixture(t, { seedRemote: false });
  await assert.rejects(remote(absent.local).preparePublication(absent.child), errorCode('remote_git_branch_absent'));
  assert.equal(await refOid(absent.remotePath), null);

  const stale = await fixture(t, { publishChild: false });
  await assert.rejects(remote(stale.local).preparePublication(stale.child), errorCode('remote_git_local_candidate_not_current'));
  assert.equal(await refOid(stale.remotePath), stale.seed.commitOid);
});

test('two independently elected siblings targeting one predecessor have at most one remote winner', async (t) => {
  const shared = await initBare(t, 'tdev-shared-remote-');
  const left = await fixture(t, { remotePath: shared, seedRemote: true, childName: 'left.txt' });
  const right = await fixture(t, { remotePath: shared, seedRemote: false, childName: 'right.txt' });
  assert.equal(left.seed.commitOid, right.seed.commitOid);

  const leftRemote = remote(left.local);
  const rightRemote = remote(right.local);
  const [leftIntent, rightIntent] = await Promise.all([
    leftRemote.preparePublication(left.child),
    rightRemote.preparePublication(right.child),
  ]);
  const results = await Promise.allSettled([
    leftRemote.publish(leftIntent, left.child),
    rightRemote.publish(rightIntent, right.child),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected' && result.reason?.code === 'remote_git_publication_conflict').length, 1);
  const winner = results[0].status === 'fulfilled' ? left.child : right.child;
  assert.equal(await refOid(shared), winner.commitOid);
});

test('lost push response reconciles from durable remote ref without blind replay', async (t) => {
  const fx = await fixture(t);
  const adapter = remote(fx.local, {
    faultInjector(stage) {
      if (stage === 'after_remote_push') throw new Error('lost response');
    },
  });
  const intent = await adapter.preparePublication(fx.child);
  const receipt = await adapter.publish(intent, fx.child);
  assert.equal(receipt.outcome, 'reconciled');
  assert.equal(await refOid(fx.remotePath), fx.child.commitOid);
});

test('known push rejection remains not_applied and unreadable recovery is ambiguous', async (t) => {
  const fx = await fixture(t);
  const rejectRunner = async (options) => {
    if (options.args[0] === 'push') return { code: 1, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.from('secret diagnostic') };
    return runRemoteGitCommand(options);
  };
  const rejected = remote(fx.local, { runner: rejectRunner });
  const intent = await rejected.preparePublication(fx.child);
  await assert.rejects(rejected.publish(intent, fx.child), errorCode('remote_git_publication_not_applied'));
  assert.equal(await refOid(fx.remotePath), fx.seed.commitOid);

  let pushFailed = false;
  const ambiguousRunner = async (options) => {
    if (options.args[0] === 'push') {
      pushFailed = true;
      return { code: 1, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
    }
    if (pushFailed && options.args[0] === 'ls-remote') {
      return { code: 128, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
    }
    return runRemoteGitCommand(options);
  };
  const ambiguous = remote(fx.local, { runner: ambiguousRunner });
  const ambiguousIntent = await ambiguous.preparePublication(fx.child);
  await assert.rejects(ambiguous.publish(ambiguousIntent, fx.child), errorCode('remote_git_publication_ambiguous'));
  assert.equal(await refOid(fx.remotePath), fx.seed.commitOid);
});

test('restart reconciliation is read-only and intent rejects changed remote target', async (t) => {
  const fx = await fixture(t);
  const first = remote(fx.local);
  const intent = await first.preparePublication(fx.child);
  await first.publish(intent, fx.child);

  const reopened = remote(projection(fx.localPath));
  const beforeRemote = await refOid(fx.remotePath);
  const beforeLocal = await refOid(fx.localPath);
  const status = await reopened.reconcilePublication(intent, fx.child);
  assert.equal(status.status, 'applied');
  assert.equal(await refOid(fx.remotePath), beforeRemote);
  assert.equal(await refOid(fx.localPath), beforeLocal);

  const other = await initBare(t, 'tdev-other-remote-');
  await git(fx.localPath, ['remote', 'set-url', '--push', 'origin', other]);
  await assert.rejects(reopened.reconcilePublication(intent, fx.child), errorCode('remote_git_identity_mismatch'));
  assert.equal(await refOid(other), null);
});

test('fenced rollback restores predecessor while stale rollback preserves an intervening publication', async (t) => {
  const fx = await fixture(t);
  const adapter = remote(fx.local);
  const intent = await adapter.preparePublication(fx.child);
  const receipt = await adapter.publish(intent, fx.child);
  const rollback = await adapter.rollback(receipt, intent, fx.child);
  assert.equal(rollback.status, 'applied');
  assert.equal(await refOid(fx.remotePath), fx.seed.commitOid);

  const intentAgain = await adapter.preparePublication(fx.child);
  const receiptAgain = await adapter.publish(intentAgain, fx.child);
  const next = await fx.local.project({
    semanticTree: semantic({ 'seed.txt': 'seed\n', 'child.txt': 'child.txt\n', 'next.txt': 'next\n' }),
    expectedRefOid: fx.child.commitOid,
    commitMetadata: { ...METADATA, timestampSeconds: METADATA.timestampSeconds + 1 },
  });
  await fx.local.publish(next);
  const nextIntent = await adapter.preparePublication(next);
  await adapter.publish(nextIntent, next);
  await assert.rejects(adapter.rollback(receiptAgain, intentAgain, fx.child), errorCode('remote_git_rollback_conflict'));
  assert.equal(await refOid(fx.remotePath), next.commitOid);
});

test('provider rollback rejection is safe not_applied and keeps the candidate current', async (t) => {
  const fx = await fixture(t);
  const normal = remote(fx.local);
  const intent = await normal.preparePublication(fx.child);
  const receipt = await normal.publish(intent, fx.child);
  const rejectRunner = async (options) => {
    if (options.args[0] === 'push') return { code: 1, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.from('protected branch secret diagnostic') };
    return runRemoteGitCommand(options);
  };
  const protectedAdapter = remote(fx.local, { runner: rejectRunner });
  let rejection;
  try {
    await protectedAdapter.rollback(receipt, intent, fx.child);
  } catch (error) {
    rejection = error;
  }
  assert.equal(rejection instanceof ContractError, true);
  assert.equal(rejection.code, 'remote_git_rollback_not_applied');
  assert.equal(rejection.message.includes('secret diagnostic'), false);
  assert.equal(await refOid(fx.remotePath), fx.child.commitOid);
});

test('inherited Git routing cannot redirect remote publication and embedded HTTP credentials are rejected', async (t) => {
  const fx = await fixture(t);
  const decoy = await initBare(t, 'tdev-decoy-');
  const previous = process.env.GIT_DIR;
  process.env.GIT_DIR = decoy;
  try {
    const adapter = remote(fx.local);
    const intent = await adapter.preparePublication(fx.child);
    await adapter.publish(intent, fx.child);
  } finally {
    if (previous === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = previous;
  }
  assert.equal(await refOid(fx.remotePath), fx.child.commitOid);
  assert.equal(await refOid(decoy), null);

  await git(fx.localPath, ['remote', 'set-url', '--push', 'origin', 'https://user:secret@example.invalid/repo.git']);
  await assert.rejects(remote(fx.local).reconcilePublication({ bad: true }, fx.child), errorCode('invalid_remote_git_intent'));
  const adapter = remote(fx.local);
  await assert.rejects(adapter.preparePublication(fx.child), errorCode('remote_git_embedded_credentials'));
});
