import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CaseEngine } from '../src/engine.mjs';
import { defineDevelopmentUnitPlan } from '../src/development-unit.mjs';
import { buildMcpTrialBaseTreeModule } from './mcp-trial-base-tree-builder.mjs';

// Source compatibility only: this does not prove deployed bytes or state migration.
export async function qualifyCaseReader({ repositoryPath, readerSource, scope }) {
  if (!/^[0-9a-f]{40}$/.test(readerSource ?? '')) throw new Error('An exact reader source SHA is required');
  const commitOid = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryPath, encoding: 'utf8' }).trim();
  const base = await buildMcpTrialBaseTreeModule({ repositoryPath, commitOid, scope });
  const plan = defineDevelopmentUnitPlan({
    revisionId: 'reader-compatibility', baseTree: base.tree, repositoryCommitOid: commitOid,
    contextProfile: 'tdev.repository.context.prepare.lazy.v1', contextScope: base.scope,
    repositoryBaseIdentity: base.repositoryBaseIdentity,
    baseIdentity: { schemaVersion: 1, profile: 'tdev.repository-base-identity.v1', objectFormat: base.objectFormat, commitOid, treeOid: base.treeOid, baseDigest: base.baseDigest, manifestDigest: base.manifestDigest },
    instruction: 'Inspect the selected source; compatibility qualification creates no Attempt.',
  });
  const snapshot = new CaseEngine({ caseId: 'tdev-trial-reader-check', plan }).snapshot();
  CaseEngine.restore(snapshot);
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'tdev-reader-check-'));
  try {
    const archive = execFileSync('git', ['archive', readerSource, 'src'], { cwd: repositoryPath, maxBuffer: 16 * 1024 * 1024 });
    execFileSync('tar', ['-x', '-C', scratch], { input: archive, maxBuffer: 1024 * 1024 });
    await writeFile(path.join(scratch, 'probe.mjs'), `import {readFileSync} from 'node:fs';\nimport {CaseEngine} from './src/engine.mjs';\ntry { CaseEngine.restore(JSON.parse(readFileSync(0,'utf8'))); console.log(JSON.stringify({compatible:true})); } catch(e) { console.log(JSON.stringify({compatible:false,code:e.code??'unknown'})); }\n`);
    const observed = JSON.parse(execFileSync(process.execPath, [path.join(scratch, 'probe.mjs')], { input: JSON.stringify(snapshot), encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 }));
    return { profile: 'tdev.d0046.case-reader-compatibility.v1', sourceCommit: commitOid, readerSource, ...observed, currentReaderCompatible: true, planReferencePresent: !!plan.baseReference, layer: 'source-reader', providerMutation: false, caseCreated: false };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { D0046_MCP_CONTEXT_SCOPE: scope } = await import('./d0046-mcp-trial-deploy.mjs');
  const result = await qualifyCaseReader({ repositoryPath: path.resolve(new URL('..', import.meta.url).pathname), readerSource: process.argv[2], scope });
  console.log(JSON.stringify(result, null, 2));
  if (!result.compatible) process.exitCode = 1;
}
