import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectExecutionVariant, workersDevOrigin, workersDevBinding } from '../../src/runtime/environment.mjs';
const lock = JSON.parse(readFileSync('config/toolchain.lock.json', 'utf8'));
test('native Android and Linux profiles are distinct exact implementations, not a node-only fallback', () => {
    const native = selectExecutionVariant(lock, { platform: 'android', arch: 'arm64', node: '24.18.0', sqlite: '3.53.4' });
    const linux = selectExecutionVariant(lock, { platform: 'linux', arch: 'x64', node: '24.21.0', sqlite: '3.53.4' });
    assert.equal(native.role, 'native-control');
    assert.equal(linux.role, 'ci');
    assert.notEqual(native.id, linux.id);
    for (const changed of [{ platform: 'linux' }, { arch: 'x64' }, { node: '24.21.0' }, { sqlite: null }, { sqlite: '3.53.3' }])
        assert.throws(() => selectExecutionVariant(lock, { platform: 'android', arch: 'arm64', node: '24.18.0', sqlite: '3.53.4', ...changed }), { code: 'EXECUTION_UNAVAILABLE' });
    assert.throws(() => native.id = 'changed');
});
test('execution variant metadata cannot be missing, duplicate or ambiguous', () => {
    for (const variants of [[], [lock.executionVariants[0], lock.executionVariants[0]], [lock.executionVariants[0], { ...lock.executionVariants[0], id: 'alias' }], [{ ...lock.executionVariants[0], role: 'arbitrary' }]])
        assert.throws(() => selectExecutionVariant({ executionVariants: variants }, lock.executionVariants[0]), { code: 'INVALID_ARGUMENT' });
});
test('workers.dev is an exact configured public-origin constraint, not generic HTTPS or an existence proof', () => {
    const origin = 'https://unit-test.invalid-fixture.workers.dev';
    assert.equal(workersDevOrigin(origin), origin);
    for (const bad of [null, 'https://example.com', 'https://workers.dev', 'http://unit-test.invalid-fixture.workers.dev', origin + '/', origin + '/mcp', origin + ':443', origin + '?q=1', origin + '#x', 'https://u@unit-test.invalid-fixture.workers.dev', 'https://preview.unit-test.invalid-fixture.workers.dev', 'https://unit-test.invalid-fixture.workers.dev.attacker.invalid', 'https://UNIT-TEST.invalid-fixture.workers.dev'])
        assert.throws(() => workersDevOrigin(bad), { code: 'INVALID_ARGUMENT' });
});
test('public origin binding must match enabled Worker name and account subdomain exactly', () => {
    const b = { origin: 'https://unit-test.invalid-fixture.workers.dev', workerName: 'unit-test', subdomain: 'invalid-fixture', workersDevEnabled: true };
    assert.equal(workersDevBinding(b).origin, b.origin);
    for (const change of [{ workersDevEnabled: false }, { workerName: 'another' }, { subdomain: 'another' }])
        assert.throws(() => workersDevBinding({ ...b, ...change }), { code: 'INTEGRITY_FAILURE' });
});
