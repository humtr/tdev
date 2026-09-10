import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContractError, canonicalClone, digest } from '../src/canonical.mjs';
import { CODEX_ARGUMENTS, parseCodexJsonl } from '../src/index.mjs';
import { CodexExecRepositoryModelExecutor, LocalDevelopmentOperationRuntime, buildCodexPrompt, caseResultEnvelopeFromDispatch, codexLauncherHome } from '../src/development-runtime.mjs';

const baseDigest = digest({ base: 'runtime-test' });
const changeset = { kind: 'changeset', baseDigest, writes: [] };
const operationManifest = JSON.parse(readFileSync(new URL('../config/development-operation-profiles.json', import.meta.url), 'utf8'));

function eventStream(...events) {
  return Buffer.from(`${events.map((event) => JSON.stringify(event)).join('\n')}\n`, 'utf8');
}

test('D0043 Termux Codex launcher keeps profile CODEX_HOME under the real Termux home', () => {
  assert.equal(codexLauncherHome('/data/data/com.termux/files/home/.codex-profiles/uvec'), '/data/data/com.termux/files/home');
  assert.equal(codexLauncherHome('/data/data/com.termux/files/home/.codex'), '/data/data/com.termux/files/home');
});

test('D0043 prompt requires result-only implementation while clone stays clean', () => {
  const prompt = buildCodexPrompt({
    repositoryCommitOid: 'a'.repeat(40),
    baseDigest,
    contextReferenceId: 'ctx-test',
    contextDigest: 'sha256:' + 'b'.repeat(64),
    contextFileCount: 2,
    instruction: 'add source change',
  });
  assert.match(prompt, /Do not mutate files directly/);
  assert.match(prompt, /MUST implement the requested source change in the returned ChangeSet/);
  assert.match(prompt, /never substitute an empty ChangeSet/);
  assert.match(prompt, /Read-only applies to shell commands only/);
  assert.match(prompt, /A no-op is invalid/);
  assert.doesNotMatch(prompt, /Do not edit files,/);
});

test('D0043 runtime rejects provider sandbox arguments', () => {
  assert.throws(() => new CodexExecRepositoryModelExecutor({ repositoryPath: '/tmp/repo', codexExecutable: '/tmp/codex', codexHome: '/tmp/codex-home', outputSchemaPath: '/tmp/schema.json', codexArguments: ['exec', '--ephemeral', '--json', '--sandbox', 'read-only', '--ignore-user-config'] }), (error) => error instanceof ContractError && error.code === 'development_runtime_arguments_invalid');
});

test('D0043 Codex JSONL accepts one strict terminal result and preserves usage separately', () => {
  assert.deepEqual(CODEX_ARGUMENTS, ['exec', '--ephemeral', '--json', '--ignore-user-config']);
  const parsed = parseCodexJsonl(eventStream(
    { type: 'thread.started', thread_id: 'thread-test' },
    { type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(changeset) } },
    { type: 'turn.completed', usage: { input_tokens: 8, output_tokens: 3 } },
  ));
  assert.deepEqual({ ...parsed.result }, changeset);
  assert.deepEqual(parsed.usage, { input_tokens: 8, output_tokens: 3 });
});

test('D0043 Codex JSONL tolerates bounded progress text when exactly one structured result exists', () => {
  const parsed = parseCodexJsonl(eventStream(
    { type: 'item.completed', item: { type: 'agent_message', text: 'I inspected the requested files.' } },
    { type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(changeset) } },
  ));
  assert.deepEqual({ ...parsed.result }, changeset);
  assert.equal(parsed.terminalMessageCount, 2);
  assert.equal(parsed.auxiliaryTerminalMessages, 1);
});

test('D0043 Codex JSONL accepts a recovered inspection-command failure when one structured result follows', () => {
  const parsed = parseCodexJsonl(eventStream(
    { type: 'item.completed', item: { type: 'command_execution', status: 'failed', exit_code: 2 } },
    { type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(changeset) } },
    { type: 'turn.completed', usage: { input_tokens: 5, output_tokens: 2 } },
  ));
  assert.deepEqual({ ...parsed.result }, changeset);
  assert.deepEqual(parsed.usage, { input_tokens: 5, output_tokens: 2 });
});

test('D0043 Codex JSONL rejects missing, duplicate, malformed and failed terminal events', () => {
  const cases = [
    [eventStream({ type: 'turn.completed', usage: {} }), 'codex_terminal_output_missing'],
    [eventStream(
      { type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(changeset) } },
      { type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(changeset) } },
    ), 'codex_terminal_output_duplicate'],
    [Buffer.from('{"type":"item.completed","item":\n', 'utf8'), 'codex_jsonl_malformed'],
    [eventStream({ type: 'item.completed', item: { type: 'command_execution', status: 'failed', exit_code: 1 } }), 'codex_command_execution_failed'],
    [eventStream({ type: 'turn.failed', error: { message: 'provider failure' } }), 'codex_provider_failed'],
  ];
  for (const [bytes, code] of cases) {
    assert.throws(() => parseCodexJsonl(bytes), (error) => error instanceof ContractError && error.code === code);
  }
});

test('D0046 Codex runtime temp files stay outside the exact-base clone and are cleaned', async (t) => {
  const parent = mkdtempSync(path.join(tmpdir(), 'tdev-development-runtime-test-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const repositoryPath = path.join(parent, 'repo');
  const workspaceRoot = path.join(parent, 'workspaces');
  mkdirSync(repositoryPath);
  mkdirSync(workspaceRoot);
  execFileSync('git', ['init', '-q'], { cwd: repositoryPath });
  writeFileSync(path.join(repositoryPath, 'source.txt'), 'base\n');
  execFileSync('git', ['add', 'source.txt'], { cwd: repositoryPath });
  execFileSync('git', ['-c', 'user.name=tdev', '-c', 'user.email=tdev@example.invalid', 'commit', '-qm', 'base'], { cwd: repositoryPath });
  const repositoryCommitOid = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryPath, encoding: 'utf8' }).trim();
  const testBaseDigest = digest({ 'source.txt': 'base\n' });
  const contextDigest = digest({ context: 'runtime-temp-isolation' });
  let observedTempPath = null;
  const executor = new CodexExecRepositoryModelExecutor({
    repositoryPath,
    codexExecutable: process.execPath,
    codexHome: parent,
    outputSchemaPath: fileURLToPath(new URL('../config/codex-changeset-output.schema.json', import.meta.url)),
    workspaceRoot,
    contextAdapter: {
      materializeContext: async () => ({ descriptor: { contextDigest, fileCount: 1 } }),
    },
    modelRunner: async ({ environment, workingDirectory }) => {
      observedTempPath = environment.TMPDIR;
      assert.notEqual(observedTempPath, workingDirectory);
      assert.equal(path.dirname(observedTempPath), workspaceRoot);
      writeFileSync(path.join(observedTempPath, 'model-cache.tmp'), 'cache\n');
      const stdout = eventStream(
        { type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify({ kind: 'changeset', baseDigest: testBaseDigest, writes: [{ path: 'source.txt', content: 'changed\n' }] }) } },
        { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } },
      );
      return { code: 0, signal: null, stdout, stdoutBytes: stdout.length, stderrBytes: 0, durationMs: 1 };
    },
  });
  const result = await executor.execute({ repositoryCommitOid, baseDigest: testBaseDigest, instruction: 'change source' });
  assert.equal(result.kind, 'changeset');
  assert.equal(result.writes.length, 1);
  assert.equal(existsSync(observedTempPath), false);
  assert.deepEqual(readdirSync(workspaceRoot), []);
});

test('D0046 non-lazy context rematerialization does not leak scoped-only options to the strict adapter', async () => {
  const controller = new AbortController();
  let observedOptions = null;
  const contextDigest = digest({ context: 'restart-rematerialization' });
  const executor = new CodexExecRepositoryModelExecutor({
    repositoryPath: '/tmp/tdev-repository',
    codexExecutable: '/tmp/codex',
    codexHome: '/tmp/codex-home',
    outputSchemaPath: '/tmp/codex-schema.json',
    contextAdapter: {
      materializeContext: async (_repositoryCommitOid, _baseDigest, options) => {
        observedOptions = options;
        assert.deepEqual(Object.keys(options).sort(), ['repositoryBaseIdentity', 'signal']);
        assert.equal(options.signal, controller.signal);
        assert.equal(options.repositoryBaseIdentity, null);
        return { descriptor: { contextDigest, fileCount: 1 } };
      },
    },
  });
  const context = await executor.materializeContext('a'.repeat(40), baseDigest, {
    signal: controller.signal,
    scope: null,
    repositoryBaseIdentity: null,
  });
  assert.ok(observedOptions);
  assert.equal(context.descriptor.contextDigest, contextDigest);
});

test('D0043 LocalDevelopmentOperationRuntime forwards the bounded observation sink', () => {
  const observation = () => {};
  const runtime = new LocalDevelopmentOperationRuntime({
    manifest: operationManifest,
    repositoryPath: '/tmp/tdev-repository',
    codexExecutable: '/tmp/codex',
    codexHome: '/tmp/codex-home',
    outputSchemaPath: '/tmp/codex-schema.json',
    npmExecutable: '/tmp/npm',
    observation,
  });
  assert.equal(runtime.codex.observation, observation);
  assert.equal(runtime.npm.observation, observation);
});

test('D0043 development result envelope binds the activated Attempt fence', () => {
  const template = {
    caseId: 'case-runtime',
    planRevisionId: 'plan-runtime',
    planDigest: digest({ plan: 'runtime' }),
    taskId: 'model',
    attemptId: 'model.1',
    executorId: 'executor-runtime',
    executorEpoch: 2,
    claimLeaseToken: null,
    claimLeaseGeneration: null,
    claimLeaseClaimsDigest: null,
  };
  const envelope = {
    caseId: 'case-runtime',
    taskId: 'model',
    attemptId: 'model.1',
    executorId: 'executor-runtime',
    executorEpoch: 2,
    fencingToken: digest({ fence: 'runtime' }),
  };
  const result = { profile: 'tdev.development-operation-profiles.v2', kind: 'model_repository', result: { kind: 'changeset' } };
  assert.deepEqual(caseResultEnvelopeFromDispatch({ template, envelope, result }), {
    ...template,
    fencingToken: envelope.fencingToken,
    result: canonicalClone(result),
  });
  assert.throws(() => caseResultEnvelopeFromDispatch({
    template,
    envelope: { ...envelope, attemptId: 'model.2' },
    result,
  }), (error) => error instanceof ContractError && error.code === 'development_runtime_result_identity_mismatch');
});
