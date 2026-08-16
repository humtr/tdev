import { access, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { ImmutableJournalSnapshotStore } from '../../src/store.mjs';

const [directory, caseId, expectedRevisionText, snapshotPath, readyPath, gatePath] = process.argv.slice(2);
const expectedRevision = expectedRevisionText === 'null' ? null : Number(expectedRevisionText);
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
await writeFile(readyPath, 'ready');
while (true) {
  try {
    await access(gatePath);
    break;
  } catch {
    await delay(2);
  }
}

try {
  const publicationBackend = process.env.TDEV_TEST_IMMUTABLE_JOURNAL_PUBLICATION_BACKEND ?? undefined;
  const stored = await new ImmutableJournalSnapshotStore(directory, publicationBackend === undefined ? {} : { publicationBackend })
    .compareAndSwap(caseId, expectedRevision, snapshot);
  process.stdout.write(JSON.stringify({ ok: true, revision: stored.caseRevision }));
} catch (error) {
  process.stdout.write(JSON.stringify({
    ok: false,
    code: error?.code ?? null,
    actualRevision: error?.details?.actualRevision ?? null,
  }));
}
