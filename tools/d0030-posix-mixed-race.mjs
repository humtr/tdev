import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import {
  IMMUTABLE_JOURNAL_PUBLICATION_BACKENDS,
  createImmutableJournalPublicationAdapter,
} from '../src/immutable-journal-publication.mjs';

const SELF = fileURLToPath(import.meta.url);
const READY_TIMEOUT_MS = 15_000;

async function syncFile(filePath, bytes) {
  const handle = await open(filePath, 'wx', 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function waitForFiles(paths) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if ((await Promise.all(paths.map(async (entry) => {
      try { await access(entry); return true; } catch { return false; }
    }))).every(Boolean)) return;
    await delay(5);
  }
  throw new Error(`D0030 mixed contender readiness timed out: ${paths.join(', ')}`);
}

function launchContender({ directory, sourceName, finalName, backend, readyPath, gatePath }) {
  const child = spawn(process.execPath, [
    SELF,
    'contender',
    directory,
    sourceName,
    finalName,
    backend,
    readyPath,
    gatePath,
  ], {
    env: {},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const completed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      try {
        const value = JSON.parse(stdout);
        resolve({ ...value, processExitCode: code, signal, stderr });
      } catch (error) {
        reject(new Error(`D0030 contender emitted invalid JSON (code=${code}, signal=${signal}): ${stdout}\n${stderr}`, { cause: error }));
      }
    });
  });
  return { child, completed };
}

async function runContender(args) {
  const [directory, sourceName, finalName, backend, readyPath, gatePath] = args;
  const adapter = createImmutableJournalPublicationAdapter(backend);
  try {
    await adapter.qualify(directory);
    await writeFile(readyPath, 'ready');
    await waitForFiles([gatePath]);
    await adapter.publish(directory, sourceName, finalName);
    process.stdout.write(JSON.stringify({ ok: true, backend }));
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, backend, code: error?.code ?? null }));
  }
}

async function runParent(rounds) {
  if (!Number.isSafeInteger(rounds) || rounds < 1 || rounds > 200) throw new Error('rounds must be an integer in [1, 200]');
  const root = await mkdtemp(path.join(os.tmpdir(), 'tdev-d0030-mixed-'));
  const results = [];
  try {
    for (let round = 0; round < rounds; round += 1) {
      const directory = path.join(root, `round-${String(round).padStart(3, '0')}`);
      await (await import('node:fs/promises')).mkdir(directory);
      const token = randomUUID();
      const finalName = `.d0030-mixed-${token}.final`;
      const hardName = `.d0030-mixed-${token}.hard.tmp`;
      const renameName = `.d0030-mixed-${token}.rename.tmp`;
      const hardBytes = Buffer.from(`hardlink:${round}:${token}\n`, 'utf8');
      const renameBytes = Buffer.from(`rename:${round}:${token}\n`, 'utf8');
      await syncFile(path.join(directory, hardName), hardBytes);
      await syncFile(path.join(directory, renameName), renameBytes);
      const hardReady = path.join(directory, '.hard.ready');
      const renameReady = path.join(directory, '.rename.ready');
      const gate = path.join(directory, '.go');
      const hard = launchContender({
        directory,
        sourceName: hardName,
        finalName,
        backend: IMMUTABLE_JOURNAL_PUBLICATION_BACKENDS.HARDLINK,
        readyPath: hardReady,
        gatePath: gate,
      });
      const rename = launchContender({
        directory,
        sourceName: renameName,
        finalName,
        backend: IMMUTABLE_JOURNAL_PUBLICATION_BACKENDS.RENAME_NOREPLACE,
        readyPath: renameReady,
        gatePath: gate,
      });
      try {
        await waitForFiles([hardReady, renameReady]);
        await writeFile(gate, 'go');
        const outcomes = await Promise.all([hard.completed, rename.completed]);
        const winners = outcomes.filter((outcome) => outcome.ok);
        const losers = outcomes.filter((outcome) => !outcome.ok);
        if (winners.length !== 1 || losers.length !== 1 || losers[0].code !== 'store_publish_conflict') {
          throw new Error(`D0030 mixed race ${round} did not elect exactly one winner: ${JSON.stringify(outcomes)}`);
        }
        const finalBytes = await readFile(path.join(directory, finalName));
        const expected = winners[0].backend === IMMUTABLE_JOURNAL_PUBLICATION_BACKENDS.HARDLINK ? hardBytes : renameBytes;
        if (!finalBytes.equals(expected)) throw new Error(`D0030 mixed race ${round} winner bytes changed`);
        results.push({ round, winner: winners[0].backend, loserCode: losers[0].code });
      } finally {
        hard.child.kill('SIGKILL');
        rename.child.kill('SIGKILL');
      }
    }
    const hardWins = results.filter((entry) => entry.winner === IMMUTABLE_JOURNAL_PUBLICATION_BACKENDS.HARDLINK).length;
    const renameWins = results.length - hardWins;
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      evidenceKind: 'd0030-production-mixed-publication-race',
      rounds,
      exactOneWinner: results.length,
      loserConflicts: results.filter((entry) => entry.loserCode === 'store_publish_conflict').length,
      hardlinkWins: hardWins,
      renameNoReplaceWins: renameWins,
    })}\n`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

if (process.argv[2] === 'contender') {
  await runContender(process.argv.slice(3));
} else {
  await runParent(Number(process.argv[2] ?? 25));
}
