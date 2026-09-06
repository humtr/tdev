import test from 'node:test';
import assert from 'node:assert/strict';
import { ContractError, digest } from '../src/canonical.mjs';
import { CODEX_ARGUMENTS, parseCodexJsonl } from '../src/index.mjs';
import { CodexExecRepositoryModelExecutor, codexLauncherHome } from '../src/development-runtime.mjs';

const baseDigest = digest({ base: 'runtime-test' });
const changeset = { kind: 'changeset', baseDigest, writes: [] };

function eventStream(...events) {
  return Buffer.from(`${events.map((event) => JSON.stringify(event)).join('\n')}\n`, 'utf8');
}

test('D0043 Termux Codex launcher keeps profile CODEX_HOME under the real Termux home', () => {
  assert.equal(codexLauncherHome('/data/data/com.termux/files/home/.codex-profiles/uvec'), '/data/data/com.termux/files/home');
  assert.equal(codexLauncherHome('/data/data/com.termux/files/home/.codex'), '/data/data/com.termux/files/home');
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
