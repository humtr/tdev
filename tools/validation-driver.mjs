import { spawn } from 'node:child_process';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { bytesDigest, recordDigest } from '../src/contracts/canonical.mjs';
import { requireThat } from '../src/contracts/errors.mjs';
/** @typedef {'core'|'integration'|'release'|'live'|'benchmark'} Layer */
/** @param {string[]} argv @returns {{profile:Layer,output:string}} */
export function parseArguments(argv) {
    requireThat(argv.length === 4, 'INVALID_ARGUMENT', 'Use --profile <layer> --output <directory>');
    const values = new Map();
    for (let i = 0; i < argv.length; i += 2) {
        requireThat(['--profile', '--output'].includes(argv[i]) && !values.has(argv[i]) && argv[i + 1].length > 0, 'INVALID_ARGUMENT', 'Unknown, duplicate or empty argument');
        values.set(argv[i], argv[i + 1]);
    }
    const profile = values.get('--profile');
    requireThat(['core', 'integration', 'release', 'live', 'benchmark'].includes(profile), 'INVALID_ARGUMENT', 'Unknown validation profile');
    return { profile, output: values.get('--output') };
}
/** Local trusted bootstrap tests only, not the production SandboxPort.
 * @param {string} executable @param {string[]} argv @param {string} cwd @param {number} timeoutMs */
export function command(executable, argv, cwd, timeoutMs) {
    return new Promise(resolve => {
        const child = spawn(executable, argv, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
        const parts = [Buffer.alloc(0), Buffer.alloc(0)], totals = [0, 0];
        let timedOut = false;
        /** @type {string|null} */
        let failure = null;
        /** @param {number} i @param {Buffer} b */
        function capture(i, b) { totals[i] += b.length; if (parts[i].length < 1048576)
            parts[i] = Buffer.concat([parts[i], b.subarray(0, 1048576 - parts[i].length)]); }
        child.stdout.on('data', b => capture(0, b));
        child.stderr.on('data', b => capture(1, b));
        let killTimer = /** @type {NodeJS.Timeout|undefined} */ (undefined);
        const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); killTimer = setTimeout(() => child.kill('SIGKILL'), 5000); }, timeoutMs);
        child.on('error', () => { failure = 'EXECUTION_UNAVAILABLE'; });
        child.on('close', (exitCode, signal) => { clearTimeout(timer); clearTimeout(killTimer); resolve({ exitCode, signal, timedOut, error: failure, stdout: parts[0].toString(), stderr: parts[1].toString(), outputBytes: totals, truncated: totals.some((n, i) => n > parts[i].length) }); });
    });
}
/** @param {string} root @returns {Promise<string[]>} */
export async function testsIn(root) { try {
    const names = [];
    for (const e of await readdir(root, { withFileTypes: true })) {
        if (e.isDirectory())
            names.push(...await testsIn(join(root, e.name)));
        else if (e.isFile() && e.name.endsWith('.test.mjs'))
            names.push(join(root, e.name));
    }
    return names.sort();
}
catch (e) {
    if ( /** @type {NodeJS.ErrnoException} */(e).code === 'ENOENT')
        return [];
    throw e;
} }
/** Actual input inventory is not a claim about a Git commit or sandbox integrity.
 * @param {string} root */
export async function inventory(root) {
    /** @type {{path:string,digest:string,mode:number}[]} */ const entries = [];
    /** @param {string} path */
    async function walk(path) {
        let info;
        try {
            info = await lstat(path);
        }
        catch (e) {
            if ( /** @type {NodeJS.ErrnoException} */(e).code === 'ENOENT')
                return;
            throw e;
        }
        requireThat(!info.isSymbolicLink(), 'INTEGRITY_FAILURE', 'Source inventory contains a symbolic link');
        if (info.isDirectory()) {
            for (const name of (await readdir(path)).sort())
                if (name !== '__pycache__')
                    await walk(join(path, name));
        }
        else if (info.isFile())
            entries.push({ path: relative(root, path).split('\\').join('/'), digest: bytesDigest(await readFile(path)), mode: info.mode & 0o111 ? 0o755 : 0o644 });
    }
    for (const path of ['src', 'tools', 'test', 'config', 'docs', 'bench', 'deploy', '.github', 'package.json', 'package-lock.json', 'jsconfig.json', '.node-version', 'AGENTS.md', 'DIRECTIVE.md', 'RULE.md', 'WORKBOARD.md'])
        await walk(join(root, path));
    entries.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
    return { digest: recordDigest('dev2.validation-input.v1', { entries }), files: entries.length };
}
