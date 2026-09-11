import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, mkdir, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArguments, command, testsIn } from '../../tools/validation-driver.mjs';
test('canonical invocation is closed', () => { assert.deepEqual(parseArguments(['--output', 'x', '--profile', 'core']), { profile: 'core', output: 'x' }); for (const args of [[], ['--profile', 'core'], ['--profile', 'core', '--profile', 'core'], ['--profile', 'shell', '--output', 'x'], ['--profile', 'core', '--output', ''], ['--profile', 'core', '--output', 'x', '--skip', '1']])
    assert.throws(() => parseArguments(args)); });
test('missing tests are not an empty passing suite', async () => { const root = await mkdtemp(join(tmpdir(), 'dev2-f0-')); try {
    assert.deepEqual(await testsIn(root), []);
}
finally {
    await rm(root, { recursive: true, force: true });
} });
test('process failure, absent executable and truncation are explicit', async () => { assert.equal((await command(process.execPath, ['-e', 'process.exit(7)'], process.cwd(), 3000)).exitCode, 7); assert.equal((await command('dev2-missing-executable-f0', [], process.cwd(), 3000)).error, 'EXECUTION_UNAVAILABLE'); const r = await command(process.execPath, ['-e', 'process.stdout.write("x".repeat(1100000))'], process.cwd(), 3000); assert.equal(r.truncated, true); assert.equal(r.outputBytes[0], 1100000); assert.equal(r.stdout.length, 1048576); });
test('a missing required integration fixture emits NOT RUN with exit 2', async () => { const root = await mkdtemp(join(tmpdir(), 'dev2-f0-result-')); try {
    await mkdir(join(root, 'fixture'));
    for (const path of ['src/contracts', 'tools', 'config', 'package-lock.json'])
        await cp(path, join(root, 'fixture', path), { recursive: true });
    const r = await command(process.execPath, [join(root, 'fixture', 'tools', 'validate.mjs'), '--profile', 'integration', '--output', join(root, 'result')], root, 5000);
    assert.equal(r.exitCode, 2);
    assert.equal(JSON.parse(await readFile(join(root, 'result', 'result.json'), 'utf8')).status, 'not_run');
}
finally {
    await rm(root, { recursive: true, force: true });
} });
