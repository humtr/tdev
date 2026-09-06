import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { CaseEngine } from '../src/engine.mjs';
import { canonicalJson, digest } from '../src/canonical.mjs';

// Generate legacy states with the exact old writer, then compare both readers.
// This is a source compatibility corpus, not a readback of live retained Cases.
export async function qualifyCaseReaderUpgrade({ repositoryPath, predecessorSource }) {
  if (!/^[0-9a-f]{40}$/.test(predecessorSource ?? '')) throw new Error('Exact predecessor source required');
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'tdev-reader-upgrade-'));
  try {
    const archive = execFileSync('git', ['archive', predecessorSource, 'src', 'test/helpers.mjs'], { cwd: repositoryPath, maxBuffer: 16 * 1024 * 1024 });
    execFileSync('tar', ['-x', '-C', scratch], { input: archive });
    const { CaseEngine: OldEngine } = await import(pathToFileURL(path.join(scratch, 'src/engine.mjs')));
    const { SEMANTIC_PROFILE } = await import(pathToFileURL(path.join(scratch, 'src/semantic-authority.mjs')));
    const { planWithWork, resultFor } = await import(pathToFileURL(path.join(scratch, 'test/helpers.mjs')));
    const rows = [];
    for (const semantic of [false, true]) {
      for (const state of ['pending', 'running', 'accepted', 'cancelled', 'promoted']) {
        const engine = new OldEngine({
          caseId: 'legacy-reader-case', plan: planWithWork([{ id: 'a' }], { 'base.txt': 'unchanged\n' }),
          ...(semantic ? { semanticAuthority: { profile: SEMANTIC_PROFILE } } : {}),
        });
        if (state !== 'pending') {
          const attempt = engine.startAttempt('a', 'executor-a');
          if (state === 'cancelled') engine.cancelTask('a', 'qualification cancellation');
          if (state === 'accepted' || state === 'promoted') engine.completeAttempt(attempt.id, resultFor(engine.plan.baseDigest, { id: 'a' }));
          if (state === 'promoted') {
            const promotion = engine.startAttempt('promote', 'promoter');
            engine.completeAttempt(promotion.id, engine.createPromotionResult());
          }
        }
        const snapshot = JSON.parse(JSON.stringify(engine.snapshot()));
        const objects = new Map(engine.semanticObjectRecords().map((record) => [record.digest, JSON.parse(JSON.stringify(record))]));
        for (const reopen of [false, true]) {
          const options = { reopen, ...(semantic ? { semanticResolver: (id) => objects.get(id) } : {}) };
          const old = OldEngine.restore(snapshot, options);
          const current = CaseEngine.restore(snapshot, options);
          assert.equal(canonicalJson(current.snapshot()), canonicalJson(old.snapshot()), `snapshot drift: ${state}, semantic=${semantic}, reopen=${reopen}`);
          assert.equal(canonicalJson(current.canonicalTree), canonicalJson(old.canonicalTree));
          rows.push({ schemaVersion: snapshot.schemaVersion, state, reopen, snapshotDigest: digest(current.snapshot()), equal: true });
        }
      }
    }
    return { profile: 'tdev.case-reader-upgrade.v1', predecessorSource, sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryPath, encoding: 'utf8' }).trim(), rows, providerMutation: false, liveRetainedCasesRead: false };
  } finally { await rm(scratch, { recursive: true, force: true }); }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const result = await qualifyCaseReaderUpgrade({ repositoryPath: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), predecessorSource: process.argv[2] });
  console.log(JSON.stringify(result, null, 2));
}
