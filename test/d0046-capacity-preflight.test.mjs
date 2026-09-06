import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCapacityPreflight } from '../qualification/d0046-m1-capacity-preflight.mjs';

test('small scoped admission does not inherit a historical full-context size floor', () => {
  assert.deepEqual(assertCapacityPreflight({ requiredAuthoritativeBytes: 64 * 1024, configuredBytes: 16 * 1024 * 1024 }), {
    requiredAuthoritativeBytes: 65536, configuredBytes: 16777216, headroomBytes: 16711680,
  });
});

test('capacity preflight retains measured overflow and invalid measurement rejection', () => {
  assert.throws(() => assertCapacityPreflight({ requiredAuthoritativeBytes: 17 * 1024 * 1024, configuredBytes: 16 * 1024 * 1024 }), { code: 'd0046_preflight_capacity_insufficient' });
  for (const requiredAuthoritativeBytes of [0, -1, NaN, 0.5]) {
    assert.throws(() => assertCapacityPreflight({ requiredAuthoritativeBytes, configuredBytes: 16777216 }), { code: 'd0046_preflight_requirement_invalid' });
  }
});

test('scoped preflight rejects a mismatched full repository identity before measurement', async () => {
  const { measureFreshCaseAuthoritativeBytes } = await import('../qualification/d0046-m1-capacity-preflight.mjs');
  const { buildMcpTrialBaseTreeModule } = await import('../qualification/mcp-trial-base-tree-builder.mjs');
  const { D0046_MCP_CONTEXT_SCOPE } = await import('../qualification/d0046-mcp-trial-deploy.mjs');
  const { execFileSync } = await import('node:child_process');
  const repositoryPath = new URL('..', import.meta.url).pathname;
  const commitOid = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryPath, encoding: 'utf8' }).trim();
  const base = await buildMcpTrialBaseTreeModule({ repositoryPath, commitOid, scope: D0046_MCP_CONTEXT_SCOPE });
  const input = {
    baseTree: base.tree, repositoryCommitOid: commitOid,
    contextProfile: 'tdev.repository.context.prepare.lazy.v1',
    contextScope: base.scope, repositoryBaseIdentity: base.repositoryBaseIdentity,
    baseIdentity: { schemaVersion: 1, profile: "tdev.repository-base-identity.v1", objectFormat: base.objectFormat, commitOid, treeOid: base.treeOid, baseDigest: base.baseDigest, manifestDigest: base.manifestDigest },
  };
  const measured = measureFreshCaseAuthoritativeBytes(input);
  assert.ok(measured.requiredAuthoritativeBytes > 0);
  assert.ok(measured.requiredAuthoritativeBytes < 11_419_628);
  assert.throws(() => measureFreshCaseAuthoritativeBytes({ ...input, repositoryCommitOid: '0'.repeat(40) }));
});
