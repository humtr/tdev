#!/usr/bin/env node
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ContractError, digest } from '../src/canonical.mjs';
import { GitRepositoryModelExecutor } from '../src/repository-model-transport.mjs';
import { runGitCommand } from '../src/git-projection.mjs';

const FULL_CONTEXT_PROFILE = 'tdev.d0047.full-context-stress.v1';
const FILE_LIMIT_BYTES = 2 * 1024 * 1024;
const TREE_LIMIT_BYTES = 16 * 1024 * 1024;
const OVER_FILE_LIMIT_BYTES = FILE_LIMIT_BYTES + 1;

function fail(code, message, details = undefined) {
  throw new ContractError(code, message, details);
}

async function git(repositoryPath, args) {
  const result = await runGitCommand({ repositoryPath, args });
  if (result.code !== 0) fail('d0047_stress_git_failed', `Git ${args[0]} failed`, { exitCode: result.code });
  return result.stdout.toString('utf8').trim();
}

async function commit(repositoryPath, files, message) {
  for (const [filePath, content] of Object.entries(files)) {
    const target = path.join(repositoryPath, ...filePath.split('/'));
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, content, { mode: 0o600 });
  }
  await git(repositoryPath, ['add', '-A']);
  await git(repositoryPath, ['commit', '-qm', message]);
  return git(repositoryPath, ['rev-parse', 'HEAD']);
}

async function identity(repositoryPath) {
  const commitOid = await git(repositoryPath, ['rev-parse', 'HEAD']);
  const treeOid = await git(repositoryPath, ['rev-parse', `${commitOid}^{tree}`]);
  return { commitOid, treeOid };
}

async function run() {
  const repositoryPath = await mkdtemp(path.join(os.tmpdir(), 'tdev-d0047-full-context-'));
  const smallFiles = {
    'package.json': '{"name":"d0047-full-context","private":true}\n',
    'src/value.mjs': 'export const value = 1;\n',
  };
  try {
    await git(repositoryPath, ['init', '-q']);
    await git(repositoryPath, ['config', 'user.name', 'tdev-d0047']);
    await git(repositoryPath, ['config', 'user.email', 'tdev-d0047@example.invalid']);
    await commit(repositoryPath, smallFiles, 'full context bounded fixture');
    const smallIdentity = await identity(repositoryPath);
    const adapter = new GitRepositoryModelExecutor({
      repositoryPath,
      modelExecutable: process.execPath,
      timeoutMs: 30_000,
      limits: { maxFileBytes: FILE_LIMIT_BYTES, maxTreeBytes: TREE_LIMIT_BYTES },
    });
    const started = performance.now();
    const prepared = await adapter.materializeContext(smallIdentity.commitOid, digest(smallFiles));
    const bounded = {
      status: 'PASS',
      repositoryCommitOid: smallIdentity.commitOid,
      treeOid: smallIdentity.treeOid,
      fileCount: prepared.descriptor.fileCount,
      contentBytes: prepared.descriptor.contentBytes,
      retainedBytes: prepared.retainedBytes,
      durationMs: Math.round(performance.now() - started),
    };

    const overFileContent = 'x'.repeat(OVER_FILE_LIMIT_BYTES);
    const largeFiles = { 'large.txt': overFileContent };
    await commit(repositoryPath, largeFiles, 'full context over-file-limit fixture');
    const largeIdentity = await identity(repositoryPath);
    let rejection = null;
    try {
      await adapter.materializeContext(largeIdentity.commitOid, digest({ ...smallFiles, ...largeFiles }));
    } catch (cause) {
      rejection = { code: cause?.code ?? 'unknown', message: cause?.message ?? String(cause) };
    }
    if (rejection === null) fail('d0047_stress_limit_missing', 'Full-context stress fixture did not hit its declared tree limit');
    if (!['file_limit_exceeded', 'repository_context_file_limit_exceeded'].includes(rejection.code)) {
      fail('d0047_stress_unexpected_failure', 'Full-context stress fixture failed outside its declared size boundary', rejection);
    }

    await rm(path.join(repositoryPath, 'large.txt'), { force: true });
    const treeFiles = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`tree-${index}.bin`, 'y'.repeat(FILE_LIMIT_BYTES)]));
    await commit(repositoryPath, treeFiles, 'full context over-tree-limit fixture');
    const treeIdentity = await identity(repositoryPath);
    let treeRejection = null;
    try {
      await adapter.materializeContext(treeIdentity.commitOid, digest({ ...smallFiles, ...treeFiles }));
    } catch (cause) {
      treeRejection = { code: cause?.code ?? 'unknown', message: cause?.message ?? String(cause) };
    }
    if (!['tree_limit_exceeded', 'repository_context_tree_limit_exceeded'].includes(treeRejection?.code)) {
      fail('d0047_stress_tree_limit_missing', 'Full-context stress fixture did not hit its declared aggregate tree limit', treeRejection);
    }
    process.stdout.write(`${JSON.stringify({ profile: FULL_CONTEXT_PROFILE, status: 'PASS', fullContext: bounded, overFileLimit: { status: 'PASS', repositoryCommitOid: largeIdentity.commitOid, declaredFileLimitBytes: FILE_LIMIT_BYTES, attemptedBytes: OVER_FILE_LIMIT_BYTES, failure: rejection }, overTreeLimit: { status: 'PASS', repositoryCommitOid: treeIdentity.commitOid, declaredTreeLimitBytes: TREE_LIMIT_BYTES, attemptedBytes: Object.values(treeFiles).reduce((sum, value) => sum + Buffer.byteLength(value), 0), failure: treeRejection }, qualification: 'separate-explicit-full-context-profile' })}\n`);
  } finally {
    await rm(repositoryPath, { recursive: true, force: true });
  }
}

run().catch((cause) => {
  process.stderr.write(`${JSON.stringify({ profile: FULL_CONTEXT_PROFILE, status: 'FAIL', code: cause?.code ?? 'd0047_stress_failed', message: cause?.message ?? String(cause), details: cause?.details ?? null })}\n`);
  process.exitCode = 1;
});
