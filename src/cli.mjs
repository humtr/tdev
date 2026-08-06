#!/usr/bin/env node
import { CaseEngine, definePlan } from './engine.mjs';
import { runCase } from './runner.mjs';

function demoPlan() {
  return definePlan({
    revisionId: 'demo-v1',
    baseTree: { 'README.md': '# demo\n' },
    tasks: [
      {
        id: 'docs',
        kind: 'work',
        dependencies: [],
        claims: [{ mode: 'write', resource: 'candidate:docs/**' }],
        input: { path: 'docs/summary.txt', content: 'parallel-first\n' },
      },
      {
        id: 'worker',
        kind: 'work',
        dependencies: [],
        claims: [{ mode: 'write', resource: 'candidate:src/**' }],
        input: { path: 'src/worker.txt', content: 'isolated result\n' },
      },
      {
        id: 'promote',
        kind: 'promotion',
        dependencies: ['docs', 'worker'],
        claims: [{ mode: 'write', resource: 'canonical:tree' }],
        input: {},
      },
    ],
  });
}

async function main() {
  const command = process.argv[2];
  if (command !== 'demo') {
    console.error('usage: node src/cli.mjs demo');
    process.exitCode = 2;
    return;
  }

  const engine = new CaseEngine({ caseId: 'demo-case', plan: demoPlan() });
  const result = await runCase(
    engine,
    async ({ baseDigest, task }) => ({
      kind: 'changeset',
      baseDigest,
      writes: [{ path: task.input.path, content: task.input.content }],
      evidence: { taskId: task.id },
    }),
    { capacity: 2 },
  );

  console.log(JSON.stringify({
    caseState: result.caseState,
    maxConcurrent: result.maxConcurrent,
    canonicalDigest: result.snapshot.canonicalDigest,
    canonicalTree: result.snapshot.canonicalTree,
  }, null, 2));
}

await main();
