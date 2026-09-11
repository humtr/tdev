import { createHmac, timingSafeEqual } from 'node:crypto';
import { canonicalJson, recordDigest, bytesDigest, parseRecord } from '../contracts/canonical.mjs';
import { id, revision, oid } from '../contracts/identity.mjs';
import { requireThat, Dev2Error } from '../contracts/errors.mjs';
import { repositoryPath, withinPrefix, comparePaths } from '../security/paths.mjs';
import { verifySource } from '../candidate/tree.mjs';
import { sameEntry } from './entries.mjs';
/** @typedef {import('../contracts/ports.js').Principal} Principal */
/** @typedef {import('../contracts/ports.js').Binding} Binding */
/** @typedef {import('../contracts/ports.js').SourceTree} SourceTree */
/** @typedef {import('../contracts/ports.js').Json} Json */
/** @typedef {{[key:string]:Json}} RecordValue */
/** @typedef {{kind:'snapshot',snapshotId:string,commitOid:string}|{kind:'work',workId:string,generation:string}} ReadScope */
/** @typedef {{kind:'list',path:string,cursor?:string,limit?:number}|{kind:'file',path:string,startByte?:number,maxBytes?:number,encoding?:'utf8'|'base64'}|
 * {kind:'search',paths:readonly string[],literal:string,cursor?:string,caseSensitive?:boolean,maxHits?:number}|
 * {kind:'diff',baseSnapshotId:string,paths?:readonly string[],cursor?:string}} ReadQuery */
/** @param {unknown} value @returns {RecordValue} */
function record(value) { requireThat(value !== null && typeof value === 'object' && !Array.isArray(value), 'INTEGRITY_FAILURE', 'Retained context record'); return /** @type {RecordValue} */ (value); }
/** @param {number} value @param {number} max @param {number} [minimum] */
function bound(value, max, minimum = 0) { requireThat(Number.isSafeInteger(value) && value >= minimum && value <= max, 'LIMIT_EXCEEDED', 'Read bound'); return value; }
/** @param {Buffer} bytes */
function foldAscii(bytes) { const copy = Buffer.from(bytes); for (let i = 0; i < copy.length; i++)
    if (copy[i] >= 65 && copy[i] <= 90)
        copy[i] += 32; return copy; }
/** Stateless progressive-context service over existing immutable Git/object storage.
 * Handles are MAC-authenticated object references, never capabilities or session truth.
 * Every use rechecks the current installation grant and binding. No source path is
 * exposed merely because a client knows a blob OID, handle or a prior grant.
 */
export class ContextService {
    /** @param {{repository:import('./git.mjs').GitRepository,objects:import('../contracts/ports.js').ObjectStorePort,
     * authorization:import('../contracts/ports.js').AuthorizationPort,tokenKey:Uint8Array,now?:()=>number,ttlMs?:number,maxScanBytes?:number}} options */
    constructor(options) { requireThat(options.tokenKey.byteLength >= 32, 'INVALID_ARGUMENT', 'Context MAC key'); this.options = options; this.key = Buffer.from(options.tokenKey); this.now = options.now ?? Date.now; this.ttlMs = options.ttlMs ?? 1800000; this.maxScanBytes = options.maxScanBytes ?? 8388608; bound(this.ttlMs, 86400000, 1); bound(this.maxScanBytes, 8388608, 1024); }
    /** @param {Principal} principal @param {Binding} binding @param {string[]} [paths] */
    async authorize(principal, binding, paths = []) { await this.options.authorization.authorize(principal, binding, 'repository.read', paths); await this.options.repository.checkBinding(binding); }
    /** @param {string} prefix @param {string} hash */
    mac(prefix, hash) { return createHmac('sha256', this.key).update('dev2.context-handle.v1\0' + prefix + '\0' + hash).digest('base64url'); }
    /** @param {'s'|'c'} prefix @param {RecordValue} value */
    async retain(prefix, value) { const bytes = Buffer.from(canonicalJson(value)); const hash = await this.options.objects.put(bytes); requireThat(hash === bytesDigest(bytes), 'INTEGRITY_FAILURE', 'Context object store digest'); return prefix + '_' + hash.slice(7) + '_' + this.mac(prefix, hash); }
    /** @param {'s'|'c'} prefix @param {string} token @param {Principal} principal @param {Binding} binding */
    async retained(prefix, token, principal, binding) {
        await this.authorize(principal, binding);
        const match = typeof token === 'string' ? /^([sc])_([a-f0-9]{64})_([A-Za-z0-9_-]{43})$/.exec(token) : null;
        requireThat(match && match[1] === prefix, 'FORBIDDEN', 'Invalid context handle');
        const hash = 'sha256:' + match[2];
        requireThat(timingSafeEqual(Buffer.from(match[3]), Buffer.from(this.mac(prefix, hash))), 'FORBIDDEN', 'Context handle authentication');
        let bytes;
        try {
            bytes = await this.options.objects.get(hash);
        }
        catch (e) {
            if ( /** @type {NodeJS.ErrnoException} */(e).code === 'ENOENT')
                throw new Dev2Error('CONTEXT_EXPIRED');
            throw e;
        }
        requireThat(bytesDigest(bytes) === hash, 'INTEGRITY_FAILURE', 'Context object integrity');
        const value = record(parseRecord(bytes));
        requireThat(value.subject === principal.subject && value.bindingDigest === recordDigest('dev2.binding.v1', binding), 'FORBIDDEN', 'Context subject or binding changed');
        requireThat(typeof value.expiresAt === 'number' && Number.isSafeInteger(value.expiresAt) && value.expiresAt > this.now(), 'CONTEXT_EXPIRED');
        return value;
    }
    /** @param {Principal} principal @param {Binding} binding @returns {Promise<import('../contracts/ports.js').Snapshot>} */
    async current(principal, binding) {
        await this.authorize(principal, binding);
        const observed = await this.options.repository.resolve(binding);
        const commit = await this.options.repository.readCommit(binding, observed.head);
        verifySource(commit.source);
        await this.authorize(principal, binding);
        const expiresAt = this.now() + this.ttlMs;
        const snapshotId = await this.retain('s', { subject: principal.subject, bindingDigest: recordDigest('dev2.binding.v1', binding), commitOid: commit.commitOid, treeOid: commit.source.treeOid, manifestDigest: commit.source.manifestDigest, observedAt: observed.observedAt, expiresAt });
        return { snapshotId, binding: { ...binding }, commitOid: commit.commitOid, source: commit.source, policyDigest: binding.policyDigest, observedAt: observed.observedAt, expiresAt: new Date(expiresAt).toISOString(), freshness: 'current', notCurrent: false };
    }
    /** Pinned is historical evidence, not a claim that the remote still has this head.
     * @param {Principal} principal @param {Binding} binding @param {string} snapshotId @param {'current'|'pinned'} [freshness]
     * @returns {Promise<import('../contracts/ports.js').Snapshot>} */
    async snapshot(principal, binding, snapshotId, freshness = 'current') {
        requireThat(freshness === 'current' || freshness === 'pinned', 'INVALID_ARGUMENT');
        const value = await this.retained('s', snapshotId, principal, binding);
        requireThat(typeof value.commitOid === 'string' && typeof value.treeOid === 'string' && typeof value.manifestDigest === 'string' && typeof value.observedAt === 'string', 'INTEGRITY_FAILURE');
        let observedAt = value.observedAt;
        if (freshness === 'current') {
            const observed = await this.options.repository.resolve(binding);
            requireThat(observed.head === value.commitOid, 'STALE_CONTEXT', 'Repository head moved', { expectedHead: value.commitOid, currentHead: observed.head, observedAt: observed.observedAt });
            observedAt = observed.observedAt;
        }
        const source = await this.options.repository.readTree(value.treeOid);
        requireThat(source.manifestDigest === value.manifestDigest, 'INTEGRITY_FAILURE');
        return { snapshotId, binding: { ...binding }, commitOid: value.commitOid, source, policyDigest: binding.policyDigest, observedAt, expiresAt: new Date(/** @type {number} */ (value.expiresAt)).toISOString(), freshness, notCurrent: freshness === 'pinned' };
    }
    /** @param {Principal} principal @param {Binding} binding @param {string} snapshotId @param {'current'|'pinned'} freshness @param {readonly ReadQuery[]} queries @param {number} [maxReturnBytes] */
    async read(principal, binding, snapshotId, freshness, queries, maxReturnBytes = 262144) { const snapshot = await this.snapshot(principal, binding, snapshotId, freshness); return { snapshotId, commitOid: snapshot.commitOid, notCurrent: snapshot.notCurrent, observedAt: snapshot.observedAt, ...await this.readSource(principal, binding, snapshot.source, { kind: 'snapshot', snapshotId, commitOid: snapshot.commitOid }, queries, maxReturnBytes) }; }
    /** Work reads require the caller to authorize the durable work identity before
     * supplying its exact generation here. Query cursors are bound to tree+manifest.
     * @param {Principal} principal @param {Binding} binding @param {SourceTree} source @param {ReadScope} scope @param {readonly ReadQuery[]} queries @param {number} [maxReturnBytes] */
    async readSource(principal, binding, source, scope, queries, maxReturnBytes = 262144) {
        await this.authorize(principal, binding);
        verifySource(source);
        bound(maxReturnBytes, 262144, 1);
        requireThat(queries.length > 0 && queries.length <= 32, 'LIMIT_EXCEEDED', 'Read query count');
        /** @type {Set<string>} */ const disclosed = new Set();
        let remaining = maxReturnBytes, openedFiles = 0, scannedBytes = 0; /** @type {RecordValue[]} */
        const results = [];
        if (scope.kind === 'snapshot') {
            id(scope.snapshotId);
            oid(scope.commitOid);
        }
        else {
            requireThat(scope.kind === 'work', 'INVALID_ARGUMENT', 'Explicit read scope');
            id(scope.workId);
            revision(scope.generation);
        }
        const target = recordDigest('dev2.read-target.v1', { scope, treeOid: source.treeOid, manifestDigest: source.manifestDigest });
        /** @param {string} path */
        const allowed = async (path) => { try {
            await this.authorize(principal, binding, [path]);
            return true;
        }
        catch (e) {
            if (e instanceof Dev2Error && e.code === 'FORBIDDEN')
                return false;
            throw e;
        } };
        /** @param {RecordValue} row */
        const fits = row => Buffer.byteLength(canonicalJson(row)) <= remaining;
        /** @param {ReadQuery} query @param {RecordValue} position */
        const cursor = async (query, position) => { const descriptor = { ...query }; delete /** @type {{cursor?:string}} */ (descriptor).cursor; return this.retain('c', { subject: principal.subject, bindingDigest: recordDigest('dev2.binding.v1', binding), target, queryDigest: recordDigest('dev2.read-query.v1', descriptor), position, expiresAt: this.now() + this.ttlMs }); };
        /** @param {ReadQuery} query @returns {Promise<RecordValue>} */
        const position = async (query) => {
            if (!('cursor' in query) || !query.cursor)
                return {};
            const retained = await this.retained('c', query.cursor, principal, binding), descriptor = { ...query };
            delete /** @type {{cursor?:string}} */ (descriptor).cursor;
            requireThat(retained.target === target && retained.queryDigest === recordDigest('dev2.read-query.v1', descriptor), 'STALE_CONTEXT', 'Cursor target/query changed');
            return record(retained.position);
        };
        for (const query of queries) {
            /** @type {RecordValue} */ let result;
            if (query.kind === 'file') {
                repositoryPath(query.path);
                await this.authorize(principal, binding, [query.path]);
                const entry = source.entries.find(e => e.path === query.path);
                requireThat(entry, 'INVALID_ARGUMENT', 'Path absent from selected tree');
                requireThat(entry.mode !== '160000', 'UNSUPPORTED_REPOSITORY_FEATURE', 'Gitlink has no file bytes');
                requireThat(++openedFiles <= 64, 'LIMIT_EXCEEDED', 'File read count');
                const offset = bound(query.startByte ?? 0, entry.size), limit = bound(query.maxBytes ?? 65536, 1048576, 1), encoding = query.encoding ?? 'utf8';
                requireThat(encoding === 'utf8' || encoding === 'base64', 'INVALID_ARGUMENT');
                const bytes = await this.options.repository.blob(entry.blobOid);
                requireThat(bytesDigest(bytes) === entry.contentDigest && bytes.length === entry.size, 'INTEGRITY_FAILURE');
                let length = Math.min(limit, entry.size - offset);
                let content = '';
                for (;;) {
                    const slice = bytes.subarray(offset, offset + length);
                    if (encoding === 'base64')
                        content = slice.toString('base64');
                    else {
                        try {
                            content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(slice);
                        }
                        catch {
                            throw new Dev2Error('ENCODING_BOUNDARY', 'Use aligned byte range or base64');
                        }
                    }
                    result = { kind: 'file', entry: { ...entry }, offset, length, encoding, content, truncated: offset + length < entry.size };
                    if (fits(result))
                        break;
                    requireThat(length > 0, 'LIMIT_EXCEEDED', 'Insufficient response budget');
                    length = Math.floor(length / 2);
                    if (encoding === 'utf8')
                        while (length > 0 && offset + length < bytes.length && (bytes[offset + length] & 0xc0) === 0x80)
                            length--;
                }
                await this.authorize(principal, binding, [query.path]);
                disclosed.add(query.path);
            }
            else if (query.kind === 'list') {
                repositoryPath(query.path, true);
                const limit = bound(query.limit ?? 256, 256, 1), pos = await position(query), after = typeof pos.after === 'string' ? pos.after : '';
                /** @type {Map<string,RecordValue>} */ const children = new Map(); /** @type {Map<string,string>} */
                const guards = new Map();
                for (const entry of source.entries) {
                    if (!withinPrefix(query.path, entry.path) || entry.path === query.path || !await allowed(entry.path))
                        continue;
                    const rest = query.path ? entry.path.slice(query.path.length + 1) : entry.path, first = rest.split('/')[0], path = query.path ? query.path + '/' + first : first;
                    guards.set(path, entry.path);
                    if (rest.includes('/'))
                        children.set(path, { path, mode: '040000', kind: 'directory' });
                    else
                        children.set(path, { ...entry, kind: entry.mode === '160000' ? 'gitlink' : entry.mode === '120000' ? 'symlink' : 'file' });
                }
                const rows = [...children].sort(([a], [b]) => comparePaths(a, b)).filter(([path]) => !after || comparePaths(path, after) > 0);
                /** @type {Json[]} */ const entries = [];
                let next = null;
                let last = after;
                for (let i = 0; i < rows.length; i++) {
                    const prospective = { kind: 'list', entries: [...entries, rows[i][1]], nextCursor: 'x'.repeat(110), complete: false };
                    if (entries.length >= limit || !fits(prospective)) {
                        requireThat(entries.length > 0, 'LIMIT_EXCEEDED', 'Response cannot fit one directory entry');
                        next = await cursor(query, { after: last });
                        break;
                    }
                    entries.push(rows[i][1]);
                    disclosed.add(/** @type {string} */ (guards.get(rows[i][0])));
                    last = rows[i][0];
                }
                result = { kind: 'list', entries, nextCursor: next, complete: next === null };
            }
            else if (query.kind === 'search') {
                requireThat(query.paths.length > 0 && query.paths.length <= 64 && query.literal.length > 0 && query.literal.isWellFormed(), 'INVALID_ARGUMENT', 'Search scope/needle');
                query.paths.forEach(p => repositoryPath(p, true));
                let needle = Buffer.from(query.literal);
                requireThat(needle.length <= Math.floor(this.maxScanBytes / 2), 'LIMIT_EXCEEDED', 'Search needle bound');
                if (query.caseSensitive === false)
                    needle = foldAscii(needle);
                const limit = bound(query.maxHits ?? 128, 128, 1), pos = await position(query);
                let index = typeof pos.index === 'number' ? bound(pos.index, source.entries.length) : 0, offset = typeof pos.offset === 'number' ? bound(pos.offset, Number.MAX_SAFE_INTEGER) : 0;
                /** @type {Json[]} */ const hits = [];
                let next = null;
                let localScan = 0;
                for (; index < source.entries.length; index++, offset = 0) {
                    const entry = source.entries[index];
                    if (!query.paths.some(p => withinPrefix(p, entry.path)) || entry.mode === '160000' || !await allowed(entry.path))
                        continue;
                    requireThat(offset <= entry.size, 'INTEGRITY_FAILURE', 'Cursor byte offset');
                    if (openedFiles >= 64 || scannedBytes >= this.maxScanBytes) {
                        next = await cursor(query, { index, offset });
                        break;
                    }
                    openedFiles++;
                    let bytes = await this.options.repository.blob(entry.blobOid);
                    requireThat(bytes.length === entry.size && bytesDigest(bytes) === entry.contentDigest, 'INTEGRITY_FAILURE');
                    const end = Math.min(bytes.length, offset + this.maxScanBytes - scannedBytes), count = end - offset;
                    scannedBytes += count;
                    localScan += count;
                    const window = query.caseSensitive === false ? foldAscii(bytes.subarray(offset, end)) : bytes.subarray(offset, end);
                    let start = offset;
                    for (;;) {
                        const local = window.indexOf(needle, start - offset);
                        if (local < 0)
                            break;
                        const found = offset + local;
                        const row = { path: entry.path, blobOid: entry.blobOid, contentDigest: entry.contentDigest, byteOffset: found };
                        if (hits.length >= limit || !fits({ kind: 'search', hits: [...hits, row], nextCursor: 'x'.repeat(110), scannedBytes: localScan, complete: false })) {
                            requireThat(hits.length > 0, 'LIMIT_EXCEEDED', 'Response cannot fit a search hit');
                            next = await cursor(query, { index, offset: found });
                            break;
                        }
                        hits.push(row);
                        disclosed.add(entry.path);
                        start = found + 1;
                    }
                    await this.authorize(principal, binding, [entry.path]);
                    if (next)
                        break;
                    if (end < bytes.length) {
                        next = await cursor(query, { index, offset: Math.max(offset + 1, end - needle.length + 1) });
                        break;
                    }
                }
                result = { kind: 'search', hits, nextCursor: next, scannedBytes: localScan, complete: next === null };
            }
            else {
                requireThat(query.kind === 'diff', 'INVALID_ARGUMENT', 'Repository read kind');
                const base = await this.snapshot(principal, binding, query.baseSnapshotId, 'pinned');
                const pos = await position(query), after = typeof pos.after === 'string' ? pos.after : '';
                const prefixes = query.paths ?? [''];
                requireThat(prefixes.length <= 64, 'LIMIT_EXCEEDED');
                prefixes.forEach(p => repositoryPath(p, true));
                const before = new Map(base.source.entries.map(e => [e.path, e])), current = new Map(source.entries.map(e => [e.path, e]));
                /** @type {Json[]} */ const changes = [];
                let last = after, next = null;
                for (const path of [...new Set([...before.keys(), ...current.keys()])].sort(comparePaths)) {
                    if (after && comparePaths(path, after) <= 0 || !prefixes.some(p => withinPrefix(p, path)) || sameEntry(before.get(path), current.get(path)) || !await allowed(path))
                        continue;
                    const row = { path, before: before.get(path) ? { ...before.get(path) } : null, after: current.get(path) ? { ...current.get(path) } : null };
                    if (changes.length >= 256 || !fits({ kind: 'diff', changes: [...changes, row], nextCursor: 'x'.repeat(110), complete: false })) {
                        requireThat(changes.length > 0, 'LIMIT_EXCEEDED');
                        next = await cursor(query, { after: last });
                        break;
                    }
                    changes.push(/** @type {Json} */ (row));
                    disclosed.add(path);
                    last = path;
                }
                result = { kind: 'diff', changes, nextCursor: next, complete: next === null };
            }
            const size = Buffer.byteLength(canonicalJson(result));
            requireThat(size <= remaining, 'LIMIT_EXCEEDED', 'Response bytes');
            remaining -= size;
            results.push(result);
        }
        await this.authorize(principal, binding, [...disclosed]);
        return { treeOid: source.treeOid, manifestDigest: source.manifestDigest, results, returnedBytes: maxReturnBytes - remaining, openedFiles, scannedBytes };
    }
}
