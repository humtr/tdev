import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { D0046_WORKER_MAIN_MODULE } from '../qualification/d0046-mcp-trial-deploy.mjs';
import { D0046_R5_PREDECESSOR_SOURCE, D0046_R5_RECOVERY_TOOL, patchRecoveryIngressSource } from '../qualification/d0046-r5-recovery-read.mjs';
import {
  D0046_R6_CASE,
  D0046_R6_SELECTOR,
  patchCachedContextRecoveryIngressSource,
  validateR6ModuleDelta,
} from '../qualification/d0046-r6-cached-context-read.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function r5Ingress() {
  const base = execFileSync('git', ['show', `${D0046_R5_PREDECESSOR_SOURCE}:${D0046_WORKER_MAIN_MODULE}`], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  return patchRecoveryIngressSource(base);
}

test('r6 cached-context patch preserves r5 tool and adds only fixed post-auth context bridge', () => {
  const r5 = r5Ingress();
  const r6 = patchCachedContextRecoveryIngressSource(r5);
  assert.notEqual(r6, r5);
  assert.match(r6, new RegExp(D0046_R5_RECOVERY_TOOL));
  assert.match(r6, new RegExp(D0046_R6_SELECTOR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(r6, new RegExp(D0046_R6_CASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(r6, /development_context_get/u);
  assert.match(r6, /mcp_trial_context_scope_denied/u);
  assert.match(r6, /readCaseAgentDrive/u);
  assert.match(r6, /d0046R6ContextHint/u);
  assert.match(r6, /d0046R6ContextCall/u);
});

test('r6 patch is fail-closed and cannot be applied twice', () => {
  const r6 = patchCachedContextRecoveryIngressSource(r5Ingress());
  assert.throws(() => patchCachedContextRecoveryIngressSource(r6), (error) => error?.code === 'd0046_r6_ingress_already_patched');
});

test('r6 provider artifact may change only the ingress main module', () => {
  const predecessor = new Map();
  for (let index = 0; index < 34; index += 1) predecessor.set(index === 0 ? D0046_WORKER_MAIN_MODULE : `m${index}.mjs`, `source-${index}`);
  const recovery = new Map(predecessor);
  recovery.set(D0046_WORKER_MAIN_MODULE, 'changed-main');
  assert.deepEqual(validateR6ModuleDelta(predecessor, recovery), { moduleCount: 34, changedModules: [D0046_WORKER_MAIN_MODULE] });
  recovery.set('m2.mjs', 'changed-other');
  assert.throws(() => validateR6ModuleDelta(predecessor, recovery), (error) => error?.code === 'd0046_r6_module_delta_invalid');
});
