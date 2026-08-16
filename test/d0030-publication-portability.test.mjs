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
  const current = manifest.helpers[`${process.platform}-${process.arch}`];
  assert.deepEqual(production, accepted);
  assert.equal(current.sourceSha256, sha256(production));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.protocolVersion, 1);
});

test('D0030 packaged helper identity is exact and actual-directory capability leaves no probe authority', async (t) => {
  const directory = await tempDirectory(t);
  const identity = await D0030_INTERNAL.packagedHelperIdentity();
  assert.equal(identity.expectedSha256, identity.actualSha256);
  assert.equal(identity.key, `${process.platform}-${process.arch}`);
  const adapter = createImmutableJournalPublicationAdapter(IMMUTABLE_JOURNAL_PUBLICATION_BACKENDS.RENAME_NOREPLACE);
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
});

test('D0030 helper protocol maps conflict and unsupported outcomes without fallback', () => {
  assert.throws(
    () => D0030_INTERNAL.classifyHelperOutcome({
      code: 4, signal: null, timedOut: false, spawnError: null,
      protocol: { began: true, malformed: false, result: { status: 'conflict', statusCode: 1, errno: 17 } },
    }),
    (error) => error?.code === 'store_publish_conflict',
  );
  assert.throws(
    () => D0030_INTERNAL.classifyHelperOutcome({
      code: 5, signal: null, timedOut: false, spawnError: null,
      protocol: { began: true, malformed: false, result: { status: 'unsupported', statusCode: 2, errno: 22 } },
    }),
    (error) => error?.code === 'store_publication_unsupported',
  );
});
