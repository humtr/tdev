import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  D0030_INTERNAL,
  IMMUTABLE_JOURNAL_PUBLICATION_BACKENDS,
  createImmutableJournalPublicationAdapter,
  defaultImmutableJournalPublicationBackend,
} from '../src/immutable-journal-publication.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function tempDirectory(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tdev-d0030-'));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('D0030 production helper source is byte-identical to the accepted falsifier helper', async () => {
  const accepted = await readFile(new URL('../bench/d0030-native/rename_noreplace_helper.c', import.meta.url));
  const production = await readFile(new URL('../native/d0030/rename_noreplace_helper.c', import.meta.url));
  const manifest = JSON.parse(await readFile(new URL('../native/d0030/manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(production, accepted);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.protocolVersion, 1);
  for (const entry of Object.values(manifest.helpers)) {
    assert.equal(entry.sourceSha256, sha256(production));
  }
});

test('D0030 packaged helper identity is exact when declared and clean-source absence fails closed without probe authority', async (t) => {
  const directory = await tempDirectory(t);
  const manifest = JSON.parse(await readFile(new URL('../native/d0030/manifest.json', import.meta.url), 'utf8'));
  const current = manifest.helpers[`${process.platform}-${process.arch}`];
  const adapter = createImmutableJournalPublicationAdapter(IMMUTABLE_JOURNAL_PUBLICATION_BACKENDS.RENAME_NOREPLACE);
  if (current === undefined) {
    await assert.rejects(
      D0030_INTERNAL.packagedHelperIdentity(),
      (error) => error?.code === 'store_publication_unsupported',
    );
    await assert.rejects(
      adapter.qualify(directory),
      (error) => error?.code === 'store_publication_unsupported',
    );
    assert.deepEqual((await readdir(directory)).filter((name) => name.startsWith('.d0030-capability-')), []);
    return;
  }
  const identity = await D0030_INTERNAL.packagedHelperIdentity();
  assert.equal(identity.expectedSha256, identity.actualSha256);
  assert.equal(identity.key, `${process.platform}-${process.arch}`);
  const first = await adapter.qualify(directory);
  const second = await adapter.qualify(directory);
  assert.equal(second, first);
  assert.deepEqual((await readdir(directory)).filter((name) => name.startsWith('.d0030-capability-')), []);
});

test('D0030 default backend only selects the packaged rename route on its declared Android target', () => {
  const expected = process.platform === 'android' && process.arch === 'arm64'
    ? IMMUTABLE_JOURNAL_PUBLICATION_BACKENDS.RENAME_NOREPLACE
    : IMMUTABLE_JOURNAL_PUBLICATION_BACKENDS.HARDLINK;
  assert.equal(defaultImmutableJournalPublicationBackend(), expected);
  assert.throws(
    () => createImmutableJournalPublicationAdapter('plain-rename'),
    (error) => error?.code === 'invalid_store_publication_backend',
  );
});

test('D0030 helper protocol distinguishes pre-BEGIN loss from post-BEGIN ambiguity', () => {
  const before = { code: 1, signal: null, timedOut: false, spawnError: null, protocol: { began: false, result: null, malformed: true } };
  const after = { code: null, signal: 'SIGKILL', timedOut: true, spawnError: null, protocol: { began: true, result: null, malformed: true } };
  assert.throws(
    () => D0030_INTERNAL.classifyHelperOutcome(before),
    (error) => error?.code === 'store_write_failed',
  );
  assert.throws(
    () => D0030_INTERNAL.classifyHelperOutcome(after),
    (error) => error?.code === 'store_commit_ambiguous',
  );
  for (const abnormal of [
    { code: 7, signal: null, timedOut: false, spawnError: null },
    { code: null, signal: 'SIGKILL', timedOut: false, spawnError: null },
    { code: null, signal: null, timedOut: true, spawnError: null },
    { code: null, signal: null, timedOut: false, spawnError: Object.assign(new Error('late spawn uncertainty'), { code: 'EIO' }) },
  ]) {
    assert.throws(
      () => D0030_INTERNAL.classifyHelperOutcome({
        ...abnormal,
        protocol: { began: true, malformed: false, result: { status: 'success', statusCode: 0, errno: 0 } },
      }),
      (error) => error?.code === 'store_commit_ambiguous',
    );
  }
  assert.throws(
    () => D0030_INTERNAL.classifyHelperOutcome({
      code: 7, signal: null, timedOut: false, spawnError: null,
      protocol: { began: false, malformed: false, result: { status: 'success', statusCode: 0, errno: 0 } },
    }),
    (error) => error?.code === 'store_write_failed',
  );
});

test('D0030 helper protocol maps conflict and unsupported outcomes without fallback', () => {
  assert.throws(
    () => D0030_INTERNAL.classifyHelperOutcome({
      code: 0, signal: null, timedOut: false, spawnError: null,
      protocol: { began: true, malformed: false, result: { status: 'conflict', statusCode: 1, errno: 17 } },
    }),
    (error) => error?.code === 'store_publish_conflict',
  );
  assert.throws(
    () => D0030_INTERNAL.classifyHelperOutcome({
      code: 0, signal: null, timedOut: false, spawnError: null,
      protocol: { began: true, malformed: false, result: { status: 'unsupported', statusCode: 2, errno: 22 } },
    }),
    (error) => error?.code === 'store_publication_unsupported',
  );
});


test('D0030 positive capability cache requires stable validity and invalidates on later unsupported publication', async () => {
  const location = '/synthetic/case';
  const capabilities = new Map([[location, 'stale']]);
  assert.throws(
    () => D0030_INTERNAL.cacheQualifiedCapability(capabilities, location, 'before', 'after', 'rename-noreplace'),
    (error) => error?.code === 'store_publication_unsupported',
  );
  assert.equal(capabilities.has(location), false);
  assert.equal(
    D0030_INTERNAL.cacheQualifiedCapability(capabilities, location, 'stable', 'stable', 'rename-noreplace'),
    'stable',
  );
  assert.equal(capabilities.get(location), 'stable');
  await assert.rejects(
    D0030_INTERNAL.withCapabilityInvalidation(capabilities, location, async () => {
      const error = new Error('capability invalidated');
      error.code = 'store_publication_unsupported';
      throw error;
    }),
    (error) => error?.code === 'store_publication_unsupported',
  );
  assert.equal(capabilities.has(location), false);
});
