#!/usr/bin/env node
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  CaseEngine,
  CaseRepository,
  FileSnapshotStore,
  definePlan,
  runCase,
  runDurableCase,
} from './index.mjs';

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

async function demoExecutor({ baseDigest, task }) {
  return {
    kind: 'changeset',
    baseDigest,
    writes: [{ path: task.input.path, content: task.input.content }],
    evidence: { taskId: task.id },
  };
}

function printResult(result, snapshot = result.snapshot) {
  console.log(JSON.stringify({
    caseState: result.caseState,
    maxConcurrent: result.maxConcurrent,
    persistedRevision: result.persistedRevision ?? null,
    canonicalDigest: snapshot.canonicalDigest,
    canonicalTree: snapshot.canonicalTree,
  }, null, 2));
}

async function runMemoryDemo() {
  const engine = new CaseEngine({ caseId: 'demo-case', plan: demoPlan() });
  const result = await runCase(engine, demoExecutor, { capacity: 2 });
  printResult(result);
}

async function runFileDurableDemo() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tdev-durable-demo-'));
  try {
    const repository = new CaseRepository(new FileSnapshotStore(directory));
    await repository.create({ caseId: 'durable-demo-case', plan: demoPlan() });
    const result = await runDurableCase(repository, 'durable-demo-case', demoExecutor, { capacity: 2 });
    const reloaded = await repository.load('durable-demo-case');
    printResult(result, reloaded.snapshot());
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function main() {
  const command = process.argv[2];
  if (command === 'demo') {
    await runMemoryDemo();
    return;
  }
  if (command === 'durable-demo') {
    await runFileDurableDemo();
    return;
  }
  console.error('usage: node src/cli.mjs <demo|durable-demo>');
  process.exitCode = 2;
}

await main();
