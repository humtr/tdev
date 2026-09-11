import { constants } from 'node:fs';
import { mkdir, open, lstat, realpath, readlink, symlink, rm } from 'node:fs/promises';
import { resolve, dirname, join, isAbsolute, sep } from 'node:path';
import { bytesDigest } from '../contracts/canonical.mjs';
import { requireThat, Dev2Error } from '../contracts/errors.mjs';
import { verifySource } from './tree.mjs';
import { sourceManifest } from '../repository/entries.mjs';
/** @typedef {import('../contracts/ports.js').SourceTree} SourceTree */
/** @typedef {import('../contracts/ports.js').SourceEntry} Entry */
/** @typedef {Pick<import('../repository/git.mjs').GitRepository,'blob'>} Objects */
/** No candidate-controlled symlink may occur in a destination prefix.
 * @param {string} path */
async function realDirectory(path) { requireThat((await lstat(path)).isDirectory() && await realpath(path) === resolve(path), 'FORBIDDEN', 'Destination alias'); }
/** @param {string} path */
async function syncDirectory(path) { const f = await open(path, constants.O_RDONLY | constants.O_DIRECTORY); try {
    await f.sync();
}
finally {
    await f.close();
} }
/** @param {Map<string,string>} links */
function verifyLinks(links) {
    /** @param {string[]} initial @param {string[]} input @param {Set<string>} seen @returns {string[]} */
    function expand(initial, input, seen) {
        const at = [...initial];
        for (const segment of input) {
            if (segment === '' || segment === '.')
                continue;
            if (segment === '..') {
                requireThat(at.length > 0, 'FORBIDDEN', 'Escaping symlink');
                at.pop();
                continue;
            }
            requireThat(segment.toLowerCase() !== '.git', 'FORBIDDEN', 'Symlink to Git metadata');
            at.push(segment);
            const path = at.join('/');
            if (links.has(path)) {
                requireThat(!seen.has(path) && seen.size < 40, 'FORBIDDEN', 'Cyclic symlink');
                const next = new Set(seen);
                next.add(path);
                const parent = at.slice(0, -1);
                at.splice(0, at.length, ...expand(parent, /** @type {string} */ (links.get(path)).split('/'), next));
            }
        }
        return at;
    }
    for (const [path, target] of links) {
        requireThat(target.length > 0 && target.isWellFormed() && !target.startsWith('/') && !/^[A-Za-z]:/.test(target) && !/[\0\\]/.test(target), 'FORBIDDEN', 'Invalid symlink target');
        expand(path.split('/').slice(0, -1), target.split('/'), new Set([path]));
    }
}
/** Attempt-private publication, never writable hardlinks to Git/shared objects.
 * Caller supplies an installation-authorized destination with no existing tree.
 * @param {Objects} repository @param {SourceTree} source @param {string} destination @returns {Promise<string>} */
export async function materialize(repository, source, destination) {
    const entries = verifySource(source);
    requireThat(isAbsolute(destination) && resolve(destination) === destination, 'INVALID_ARGUMENT', 'Exact absolute materialization destination');
    requireThat(!entries.some(e => e.mode === '160000'), 'UNSUPPORTED_REPOSITORY_FEATURE', 'Submodule materialization requires resolved content');
    /** @type {Map<string,Buffer>} */ const blobs = new Map(); /** @type {Map<string,string>} */
    const links = new Map();
    let total = 0;
    for (const e of entries) {
        const bytes = Buffer.from(await repository.blob(e.blobOid));
        requireThat(bytes.length === e.size && bytesDigest(bytes) === e.contentDigest, 'INTEGRITY_FAILURE', 'Materialization input');
        total += bytes.length;
        requireThat(total <= 67108864, 'LIMIT_EXCEEDED', 'Materialization bytes');
        requireThat(!/^version https:\/\/git-lfs\.github\.com\/spec\/v1\r?\n/.test(bytes.subarray(0, 80).toString()), 'UNSUPPORTED_REPOSITORY_FEATURE', 'Unresolved LFS pointer');
        blobs.set(e.path, bytes);
        if (e.mode === '120000') {
            try {
                links.set(e.path, new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
            }
            catch {
                throw new Dev2Error('FORBIDDEN', 'Invalid symlink UTF-8');
            }
        }
    }
    verifyLinks(links);
    const parent = dirname(destination);
    await mkdir(parent, { recursive: true, mode: 0o700 });
    await realDirectory(parent);
    // mkdir is the no-replace admission point, including the empty-tree case.
    try {
        await mkdir(destination, { mode: 0o700 });
    }
    catch (e) {
        if ( /** @type {NodeJS.ErrnoException} */(e).code === 'EEXIST')
            throw new Dev2Error('ENTRY_CONFLICT', 'Destination already exists');
        throw e;
    }
    const staging = destination;
    const directories = new Set([staging]);
    /** @param {string} directory */
    function remember(directory) { let current = directory; while (current.startsWith(staging + sep)) {
        directories.add(current);
        current = dirname(current);
    } directories.add(staging); }
    try {
        await syncDirectory(parent);
        // Regular files precede symlinks; no write follows a candidate symlink.
        for (const e of entries.filter(e => e.mode !== '120000')) {
            const file = join(staging, e.path), directory = dirname(file);
            await mkdir(directory, { recursive: true, mode: 0o700 });
            await realDirectory(directory);
            remember(directory);
            const f = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, e.mode === '100755' ? 0o700 : 0o600);
            try {
                await f.writeFile(/** @type {Buffer} */ (blobs.get(e.path)));
                await f.chmod(e.mode === '100755' ? 0o755 : 0o644);
                await f.sync();
            }
            finally {
                await f.close();
            }
        }
        for (const [path, target] of links) {
            const file = join(staging, path), directory = dirname(file);
            await mkdir(directory, { recursive: true, mode: 0o700 });
            await realDirectory(directory);
            remember(directory);
            await symlink(target, file);
        }
        for (const directory of [...directories].sort((a, b) => b.length - a.length))
            await syncDirectory(directory);
        requireThat(await inspectMaterialization(source, staging) === source.manifestDigest, 'INTEGRITY_FAILURE');
        await syncDirectory(parent);
        return destination;
    }
    catch (e) {
        await rm(staging, { recursive: true, force: true });
        await syncDirectory(parent);
        throw e;
    }
}
/** Verify tracked byte/type/executable-bit integrity without following symlinks.
 * Build outputs outside tracked paths are allowed only in the attempt's scratch.
 * @param {SourceTree} source @param {string} destination */
export async function inspectMaterialization(source, destination) {
    await realDirectory(destination);
    const entries = verifySource(source); /** @type {Entry[]} */
    const actual = [];
    for (const e of entries) {
        requireThat(e.mode !== '160000', 'UNSUPPORTED_REPOSITORY_FEATURE');
        const file = resolve(destination, e.path);
        requireThat(file.startsWith(resolve(destination) + sep), 'FORBIDDEN');
        await realDirectory(dirname(file));
        const stat = await lstat(file);
        let bytes, mode;
        if (e.mode === '120000') {
            requireThat(stat.isSymbolicLink(), 'INTEGRITY_FAILURE', 'Symlink changed type');
            bytes = Buffer.from(await readlink(file));
            mode = '120000';
        }
        else {
            requireThat(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 67108864, 'INTEGRITY_FAILURE', 'Tracked file changed type/size');
            const f = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
            try {
                bytes = await f.readFile();
            }
            finally {
                await f.close();
            }
            mode = stat.mode & 0o111 ? '100755' : '100644';
        }
        requireThat(mode === e.mode && bytes.length === e.size && bytesDigest(bytes) === e.contentDigest, 'INTEGRITY_FAILURE', 'Tracked source changed');
        actual.push({ ...e, mode, size: bytes.length, contentDigest: bytesDigest(bytes) });
    }
    return sourceManifest(actual);
}
