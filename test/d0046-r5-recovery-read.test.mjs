import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  D0046_R5_PREDECESSOR_SOURCE,
  D0046_R5_RECOVERY_TOOL,
  patchRecoveryIngressSource,
  positiveRecoveryQuiescence,
  projectRecoveryDriveState,
  validateRecoveryModuleDelta,
} from '../qualification/d0046-r5-recovery-read.mjs';

const MAIN = 'qualification/cloudflare-mcp-trial-worker.mjs';

function predecessorMain() {
  return execFileSync('git', ['show', `${D0046_R5_PREDECESSOR_SOURCE}:${MAIN}`], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
}

test('r5 recovery patch changes only the predecessor ingress main and remains syntactically valid', () => {
  const before = predecessorMain();
  const after = patchRecoveryIngressSource(before);
  assert.notEqual(after, before);
  assert.match(after, new RegExp(D0046_R5_RECOVERY_TOOL, 'u'));
  const predecessor = new Map([[MAIN, before], ['src/example.mjs', 'export const x = 1;\n']]);
  const recovery = new Map(predecessor);
  recovery.set(MAIN, after);
  assert.deepEqual(validateRecoveryModuleDelta(predecessor, recovery), { moduleCount: 2, changedModules: [MAIN] });
  const dir = mkdtempSync(path.join(os.tmpdir(), 'tdev-d0046-r5-'));
  try {
    const file = path.join(dir, 'worker.mjs');
    writeFileSync(file, after);
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('r5 recovery delta rejects any non-ingress module change', () => {
  const before = predecessorMain();
  const predecessor = new Map([[MAIN, before], ['src/example.mjs', 'export const x = 1;\n']]);
  const recovery = new Map(predecessor);
  recovery.set(MAIN, patchRecoveryIngressSource(before));
  recovery.set('src/example.mjs', 'export const x = 2;\n');
  assert.throws(() => validateRecoveryModuleDelta(predecessor, recovery), { code: 'd0046_r5_module_delta_invalid' });
});

test('r5 execution-state projection accepts bounded Drive state and requires terminal quiescence receipt', () => {
  const caseId = 'tdev-trial-m2-20260905-r3';
  const digest = `sha256:${'a'.repeat(64)}`;
  const projected = projectRecoveryDriveState(caseId, {
    caseId,
    status: 'QUIESCED',
    revision: 4,
    lastCaseRevision: 19,
    lastDriveReceiptDigest: digest,
    lastObservedDeliveryDigest: null,
  });
  assert.deepEqual(projected, {
    caseId,
    status: 'QUIESCED',
    revision: 4,
    lastCaseRevision: 19,
    lastDriveReceiptDigest: digest,
    lastObservedDeliveryDigest: null,
  });
  assert.equal(positiveRecoveryQuiescence(projected), true);
  assert.equal(positiveRecoveryQuiescence({ ...projected, status: 'ACTIVE' }), false);
  assert.equal(positiveRecoveryQuiescence({ ...projected, lastDriveReceiptDigest: null }), false);
  assert.deepEqual(projectRecoveryDriveState(caseId, null), {
    caseId,
    status: null,
    revision: null,
    lastCaseRevision: null,
    lastDriveReceiptDigest: null,
    lastObservedDeliveryDigest: null,
  });
});
