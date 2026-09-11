import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { bytesDigest } from '../src/contracts/canonical.mjs';
import { requireThat } from '../src/contracts/errors.mjs';
import { parseArguments, command, testsIn, inventory } from './validation-driver.mjs';
const root = fileURLToPath(new URL('../', import.meta.url)), start = performance.now();
try {
    const args = parseArguments(process.argv.slice(2)), output = resolve(args.output), rel = relative(root, output);
    requireThat(isAbsolute(rel) || rel === '..' || rel.startsWith('../') || rel === '.artifacts' || rel.startsWith('.artifacts/'), 'INVALID_ARGUMENT', 'Output must be outside source or under .artifacts');
    const toolchain = JSON.parse(await readFile(join(root, 'config/toolchain.lock.json'), 'utf8'));
    const profiles = JSON.parse(await readFile(join(root, 'config/validation-profiles.json'), 'utf8')), profile = profiles.profiles[args.profile];
    const before = await inventory(root);
    /** @type {Array<{name:string,status:string,exitCode?:number|null,reason?:string,outputDigest?:string}>} */ const checks = [];
    let code = 0;
    /** @param {string} name @param {string} reason */
    const unavailable = (name, reason) => { checks.push({ name, status: 'not_run', reason }); if (code === 0)
        code = 2; };
    if (process.versions.node !== toolchain.node.version)
        unavailable('node-pin', `Required ${toolchain.node.version}; observed ${process.versions.node}`);
    if (!toolchain.dependencyLockDigest || bytesDigest(await readFile(join(root, 'package-lock.json'))) !== toolchain.dependencyLockDigest)
        unavailable('dependency-lock', 'Lock seal absent or mismatched');
    const tests = await testsIn(join(root, profile.testDirectory));
    if (tests.length === 0)
        unavailable(`${args.profile}-tests`, 'Required layer is not implemented');
    if (args.profile === 'release' || args.profile === 'live' || args.profile === 'benchmark')
        unavailable('deployment-capabilities', 'No authorized sealed fixture adapter has been implemented');
    if (args.profile === 'integration') {
        const git = await command('git', ['--version'], root, 10000);
        if (git.exitCode !== 0 || git.stdout.trim() !== `git version ${toolchain.git.version}`)
            unavailable('git-pin', 'Required exact Git toolchain unavailable');
    }
    if (args.profile === 'core') {
        const py = await command('python3', ['-c', 'import sys; print("%d.%d" % sys.version_info[:2]); sys.exit(0 if sys.version_info >= (3,12) else 1)'], root, 10000);
        if (py.exitCode !== 0)
            unavailable('python', 'Python >=3.12 required');
    }
    await mkdir(output, { recursive: true, mode: 0o700 });
    if (code === 0) {
        /** @type {Array<[string,string,string[]]>} */ const jobs = args.profile === 'core' ? [
            ['checked-jsdoc', process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'jsconfig.json']],
            ['core-tests', process.execPath, ['--test', ...tests]],
            ['documentation', 'python3', ['docs/design/check.py']],
        ] : [[`${args.profile}-tests`, process.execPath, ['--test', ...tests]]];
        for (const [name, exe, argv] of jobs) {
            const r = await command(exe, argv, root, profile.timeoutMs), text = r.stdout + '\n' + r.stderr;
            const temp = join(output, `.${name}-${randomUUID()}.tmp`);
            await writeFile(temp, text, { flag: 'wx' });
            await rename(temp, join(output, name + '.log'));
            const status = r.signal ? 'interrupted' : r.error ? 'not_run' : r.timedOut || r.exitCode !== 0 || r.truncated ? 'failed' : 'passed';
            checks.push({ name, status, exitCode: r.exitCode, outputDigest: bytesDigest(text) });
            process.stdout.write(text);
            if (status !== 'passed')
                code = status === 'interrupted' ? 3 : status === 'not_run' ? 2 : 1;
        }
    }
    const after = await inventory(root);
    if (after.digest !== before.digest) {
        checks.push({ name: 'source-integrity', status: 'failed' });
        code = 1;
    }
    const result = { schemaVersion: 1, profile: args.profile, status: code === 0 ? 'passed' : code === 1 ? 'failed' : code === 2 ? 'not_run' : 'interrupted', exitCode: code, assurance: 'local-process-validation-report-not-a-trusted-sandbox-receipt', coverage: 'implemented checks only; not product or live acceptance', sourceInput: before, sourceOutput: after, entrypointDigest: bytesDigest(await readFile(fileURLToPath(import.meta.url))), toolchainDigest: bytesDigest(await readFile(join(root, 'config/toolchain.lock.json'))), profileDescriptorDigest: bytesDigest(await readFile(join(root, 'config/validation-profiles.json'))), environment: { node: process.versions.node, platform: process.platform, architecture: process.arch, sqlite: process.versions.sqlite ?? null }, elapsedMs: Math.round(performance.now() - start), checks };
    const temp = join(output, `.result-${randomUUID()}.tmp`);
    await writeFile(temp, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    await rename(temp, join(output, 'result.json'));
    console.log(JSON.stringify(result));
    process.exitCode = code;
}
catch (e) {
    console.error(JSON.stringify({ status: 'failed', exitCode: 1, reason: e instanceof Error ? e.message : 'Invalid invocation' }));
    process.exitCode = 1;
}
