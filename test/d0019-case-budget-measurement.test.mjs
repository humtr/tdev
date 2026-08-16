import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const benchmark = path.join(repositoryRoot, 'bench', 'd0019-case-budget-measurement.mjs');

function run(mode, taskCount, acceptedResults) {
  const result = spawnSync(process.execPath, [benchmark, mode, String(taskCount), String(acceptedResults)], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return {
    evidence: JSON.parse(result.stdout.trim()),
    progress: result.stderr.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)),
  };
}

test('D0019 calibrated final-state measurement matches real CaseDO round-trip byte accounting', () => {
  const roundTrip = run('growth', 8, 2);
  const finalState = run('final-state', 8, 2);
  assert.equal(finalState.evidence.measurementOnly, true);
  assert.equal(finalState.evidence.productionBudgetQualified, false);
  assert.equal(finalState.evidence.calibrationRequired, true);
  assert.equal(finalState.evidence.initialAuthoritativeBytes, roundTrip.evidence.initialAuthoritativeBytes);
  assert.equal(finalState.evidence.finalAuthoritativeBytes, roundTrip.evidence.finalAuthoritativeBytes);
  assert.equal(finalState.evidence.growthBytes, roundTrip.evidence.growthBytes);
  assert.equal(finalState.evidence.finalCaseRevision, roundTrip.evidence.finalCaseRevision);
  assert.ok(roundTrip.progress.some((entry) => entry.phase === 'initialized'));
  assert.ok(roundTrip.progress.some((entry) => entry.completedResults === 2));
  assert.ok(finalState.progress.some((entry) => entry.completedResults === 2));
});
