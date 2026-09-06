import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  GitRepositoryModelExecutor,
  DevelopmentWarden,
  LocalDevelopmentOperationRuntime,
  digest,
  developmentOperationCapabilityId,
  normalizeDevelopmentOperationManifest,
} from '../src/index.mjs';
import { runGitCommand } from '../src/git-projection.mjs';
import { runModelSubprocess } from '../src/repository-model-transport.mjs';

const manifest = normalizeDevelopmentOperationManifest(JSON.parse(await readFile(new URL('../config/development-operation-profiles.json', import.meta.url), 'utf8')));
const schemaPath = path.resolve(new URL('../config/codex-changeset-output.schema.json', import.meta.url).pathname);

async function git(repositoryPath, args) {
  const result = await runGitCommand({ repositoryPath, args });
  assert.equal(result.code, 0, result.stderr.toString('utf8'));
  return result.stdout.toString('utf8').trim();
}

test('scoped context applies a ChangeSet to the exact full-base clone and warden cleans the candidate', async () => {
  const repositoryPath = await mkdtemp(path.join(os.tmpdir(), 'tdev-scoped-runtime-'));
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'tdev-scoped-workspace-'));
  const files = {
    'package.json': '{"name":"scoped-runtime","private":true}\n',
    'src/selected.mjs': 'export const value = 1;\n',
    'docs/unselected.md': 'large unselected context\n',
  };
  try {
    for (const [filePath, content] of Object.entries(files)) {
      const target = path.join(repositoryPath, ...filePath.split('/'));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
    }
    await git(repositoryPath, ['init', '-q']);
    await git(repositoryPath, ['config', 'user.name', 'tdev-test']);
    await git(repositoryPath, ['config', 'user.email', 'tdev-test@example.invalid']);
    await git(repositoryPath, ['add', '-A']);
    await git(repositoryPath, ['commit', '-qm', 'scoped base']);
    const commitOid = await git(repositoryPath, ['rev-parse', 'HEAD']);
    const baseDigest = digest(files);

    const lazy = new GitRepositoryModelExecutor({ repositoryPath, modelExecutable: '/bin/true', timeoutMs: 30_000 });
    const scope = { paths: ['src/selected.mjs'], maxFiles: 1, maxBytes: 1024, maxSearchResults: 1 };
    const handle = await lazy.prepareLazyContext(commitOid, baseDigest, { scope });
    const scoped = await lazy.materializeScopedContext(commitOid, baseDigest, { scope });
    const contextAdapter = {
      materializeContext: (boundCommit, boundDigest, options = {}) => lazy.materializeScopedContext(boundCommit, boundDigest, { ...options, scope }),
    };
    const capability = developmentOperationCapabilityId(manifest, 'tdev.model.repository.execute.v1');
    const result = {
      kind: 'changeset',
      baseDigest,
      writes: [{ path: 'src/selected.mjs', content: 'export const value = 2;\n' }],
    };
    let sparseWorkspaceChecked = false;
    const modelRunner = async ({ workingDirectory }) => {
      await assert.rejects(access(path.join(workingDirectory, 'docs', 'unselected.md')), (error) => error?.code === 'ENOENT');
      assert.equal(await readFile(path.join(workingDirectory, 'src', 'selected.mjs'), 'utf8'), files['src/selected.mjs']);
      sparseWorkspaceChecked = true;
      return {
      code: 0,
      signal: null,
      stdout: Buffer.from(`${JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(result) } })}\n`),
      stdoutBytes: 0,
      stderrBytes: 0,
      durationMs: 1,
      };
    };
    const runtime = new LocalDevelopmentOperationRuntime({
      manifest,
      repositoryPath,
      codexExecutable: '/bin/true',
      codexHome: '/tmp/tdev-codex-home',
      outputSchemaPath: schemaPath,
      npmExecutable: '/bin/true',
      workspaceRoot,
      contextAdapter,
      modelRunner,
    });
    const referenceId = `ctx-${scoped.descriptor.contextDigest.slice('sha256:'.length, 'sha256:'.length + 48)}`;
    const output = await runtime.modelExecutor({
      input: {
        repositoryCommitOid: commitOid,
        baseDigest,
        instruction: 'change the selected value',
        contextReferenceId: referenceId,
        objectFormat: 'sha1',
        contextProfile: 'tdev.repository.context.prepare.lazy.v1',
        contextScope: scoped.descriptor.scope,
        contextScopeDigest: scoped.descriptor.scopeDigest,
        baseIdentity: scoped.descriptor.baseIdentity,
        writePaths: ['src/selected.mjs'],
      },
      operationId: 'scoped-case/model/1',
      signal: new AbortController().signal,
    });
    assert.equal(output.evidence.workspaceCleanup.cleanupComplete, true);
    assert.equal(output.evidence.workspaceCleanup.absent, true);
    assert.equal(output.evidence.processCleanup.cleanupComplete, true);
    assert.equal(output.evidence.processCleanup.observedExit, true);
    assert.equal(sparseWorkspaceChecked, true);
    assert.doesNotMatch(output.evidence.workspaceCleanup.workspaceId, /\//);
    assert.equal(Object.hasOwn(output.evidence.workspaceCleanup, 'root'), false);
    assert.match(output.evidence.candidateTreeDigest, /^sha256:[0-9a-f]{64}$/);
    const candidate = runtime.candidate(output.evidence.candidateTreeDigest);
    assert.equal(candidate.writes.length, 1);
    assert.equal(candidate.writes[0].path, 'src/selected.mjs');
    assert.equal(candidate.writes[0].content, 'export const value = 2;\n');
    await access(path.join(candidate.candidateRoot, 'docs', 'unselected.md'));
    const validation = await runtime.validationExecutor({
      input: { candidateTreeDigest: output.evidence.candidateTreeDigest, validationProfile: 'tdev.validation.npm-check.v1' },
      operationId: 'scoped-case/validate/1',
      signal: new AbortController().signal,
    });
    assert.equal(validation.result?.passed ?? validation.passed, true);
    assert.equal(validation.evidence.candidateCleanup.positiveAbsence, true);
    assert.equal(validation.evidence.processCleanup.cleanupComplete, true);
    await runtime.dispose();
    assert.equal(runtime.candidate(output.evidence.candidateTreeDigest), null);
  } finally {
    await rm(repositoryPath, { recursive: true, force: true });
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test('warden cleanup is based on an observed process close', async () => {
  const warden = new DevelopmentWarden();
  const operationId = 'warden-process-test';
  const result = await runModelSubprocess({
    executable: '/bin/sh',
    args: ['-c', 'printf ready'],
    input: Buffer.alloc(0),
    environment: { PATH: '/bin:/usr/bin' },
    workingDirectory: '/tmp',
    timeoutMs: 5_000,
    signal: new AbortController().signal,
    maxStdoutBytes: 1_024,
    maxStderrBytes: 1_024,
    warden,
    operationId,
  });
  assert.equal(result.code, 0);
  const receipt = await warden.cleanupOperation(operationId);
  assert.equal(receipt.cleanupComplete, true);
  assert.equal(receipt.observedExit, true);
});
