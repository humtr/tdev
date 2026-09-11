import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, lstat, realpath } from 'node:fs/promises';
import { resolve, isAbsolute } from 'node:path';
import { bytesDigest, canonicalJson } from '../contracts/canonical.mjs';
import { oid, id } from '../contracts/identity.mjs';
import { requireThat, Dev2Error } from '../contracts/errors.mjs';
import { canonicalEntries, sourceManifest, gitlinkDigest } from './entries.mjs';
import { repositoryPath } from '../security/paths.mjs';
/** @typedef {import('../contracts/ports.js').Binding} Binding */
/** @typedef {import('../contracts/ports.js').RepositoryPort} RepositoryPort */
/** @typedef {import('../contracts/ports.js').SourceEntry} Entry */
/** @typedef {import('../contracts/ports.js').SourceTree} SourceTree */
/** @typedef {{type:string,bytes:Buffer}} GitObject */
/** @typedef {{directory:string,executable:string,environment:Record<string,string>,bindings:()=>readonly Binding[],
 * verifyRemote:(binding:Binding)=>Promise<void>,objectFormat?:'sha1'|'sha256',allowLocalFixture?:boolean,
 * maxBlobBytes?:number,maxSourceBytes?:number,timeoutMs?:number}} Options */
/** Trusted Git object/remote adapter. No shared writable checkout/index or candidate code execution.
 * Fixture file transport is explicit construction-time test capability, never a public field.
 * @implements {RepositoryPort}
 */
export class GitRepository {
    /** @param {Options} options */
    constructor(options) {
        requireThat(isAbsolute(options.directory) && isAbsolute(options.executable), 'INVALID_ARGUMENT', 'Absolute installation paths required');
        this.directory = resolve(options.directory);
        this.options = options;
        this.format = options.objectFormat ?? 'sha1';
        this.maxBlobBytes = options.maxBlobBytes ?? 16777216;
        this.maxSourceBytes = options.maxSourceBytes ?? 67108864;
        requireThat(Number.isSafeInteger(this.maxBlobBytes) && this.maxBlobBytes > 0 && Number.isSafeInteger(this.maxSourceBytes) && this.maxSourceBytes >= this.maxBlobBytes, 'INVALID_ARGUMENT', 'Object budgets');
        requireThat(Number.isSafeInteger(options.timeoutMs ?? 30000) && (options.timeoutMs ?? 30000) > 0, 'INVALID_ARGUMENT', 'Git timeout');
        this.environment = { ...options.environment, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_NO_REPLACE_OBJECTS: '1', GIT_ATTR_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' };
        for (const name of Object.keys(this.environment))
            if (/^GIT_(?:DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG_COUNT|CONFIG_PARAMETERS|CONFIG_KEY_|CONFIG_VALUE_|REPLACE_REF_BASE)/.test(name))
                delete /** @type {Record<string,string>} */ (this.environment)[name];
        /** @type {Map<string,SourceTree>} */ this.trees = new Map();
        /** @type {Map<string,GitObject>} */ this.objects = new Map();
        this.cacheBytes = 0;
        this.commandCount = 0;
        /** @type {Promise<void>|null} */ this.initialization = null;
    }
    /** @param {readonly string[]} args @param {Uint8Array} [input] @param {number} [maxBytes] */
    async command(args, input, maxBytes = this.maxSourceBytes) {
        requireThat(args.every(a => typeof a === 'string' && !a.includes('\0')), 'INVALID_ARGUMENT');
        this.commandCount++;
        const settings = ['-c', 'core.hooksPath=/dev/null', '-c', 'credential.helper=', '-c', 'protocol.allow=never', '-c', 'protocol.https.allow=always', '-c', 'protocol.ssh.allow=always', '-c', 'http.followRedirects=false', '-c', 'fetch.fsckObjects=true', '-c', 'transfer.fsckObjects=true', '-c', 'core.fsync=objects,pack-metadata,reference', '-c', 'core.fsyncMethod=fsync'];
        if (this.options.allowLocalFixture)
            settings.push('-c', 'protocol.file.allow=always');
        return new Promise(/** @param {(value:{code:number|null,stdout:Buffer})=>void} done @param {(reason:unknown)=>void} reject */ (done, reject) => {
            const child = spawn(this.options.executable, [...settings, '--git-dir=' + this.directory, ...args], { env: this.environment, shell: false, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
            /** @type {Buffer[]} */ const chunks = [];
            let size = 0, failed = false, exceeded = false;
            const kill = () => { if (child.pid) {
                try {
                    process.kill(-child.pid, 'SIGKILL');
                }
                catch { }
            } };
            const timer = setTimeout(() => { failed = true; kill(); }, this.options.timeoutMs ?? 30000);
            child.stdout.on('data', /** @param {Buffer} b */ /** @param {Buffer} b */ b => { size += b.length; if (size > maxBytes) {
                exceeded = true;
                kill();
            }
            else
                chunks.push(b); });
            let errorBytes = 0;
            child.stderr.on('data', /** @param {Buffer} b */ /** @param {Buffer} b */ b => { errorBytes += b.length; if (errorBytes > 65536) {
                exceeded = true;
                kill();
            } });
            child.stdin.on('error', () => { });
            child.on('error', () => { failed = true; });
            child.once('close', code => { clearTimeout(timer); if (exceeded)
                reject(new Dev2Error('LIMIT_EXCEEDED', 'Git output bound'));
            else if (failed)
                reject(new Dev2Error('EXECUTION_UNAVAILABLE', 'Git process unavailable'));
            else
                done({ code, stdout: Buffer.concat(chunks) }); });
            child.stdin.end(input);
        });
    }
    async init() {
        if (!this.initialization)
            this.initialization = (async () => {
                await mkdir(this.directory, { recursive: true, mode: 0o700 });
                requireThat((await lstat(this.directory)).isDirectory() && await realpath(this.directory) === this.directory, 'INTEGRITY_FAILURE', 'Repository root alias');
                let existing = true;
                try {
                    await lstat(this.directory + '/HEAD');
                }
                catch (e) {
                    if ( /** @type {NodeJS.ErrnoException} */(e).code === 'ENOENT')
                        existing = false;
                    else
                        throw e;
                }
                if (!existing) {
                    const r = await this.command(['init', '--bare', '--object-format=' + this.format, this.directory]);
                    requireThat(r.code === 0, 'EXECUTION_UNAVAILABLE', 'Git initialization');
                }
                const bare = await this.command(['rev-parse', '--is-bare-repository']);
                requireThat(bare.code === 0 && bare.stdout.toString().trim() === 'true', 'FORBIDDEN', 'Expected broker-owned bare repository');
                const format = await this.command(['rev-parse', '--show-object-format']);
                requireThat(format.code === 0 && format.stdout.toString().trim() === this.format, 'INTEGRITY_FAILURE', 'Object format mismatch');
            })();
        await this.initialization;
    }
    /** @param {string} value */
    raw(value) { oid(value); requireThat(value.startsWith(this.format + ':'), 'INTEGRITY_FAILURE', 'Object format mismatch'); return value.slice(this.format.length + 1); }
    /** @param {string} raw */
    tagged(raw) { return oid(this.format + ':' + raw); }
    /** @param {Binding} binding @param {boolean} [external] */
    async checkBinding(binding, external = false) {
        const current = this.options.bindings().find(b => b.repositoryId === binding.repositoryId);
        requireThat(current && canonicalJson(current) === canonicalJson(binding), 'FORBIDDEN', 'Unapproved binding');
        requireThat(/^refs\/heads\/(?!.*\.\.)(?!.*@\{)[A-Za-z0-9_./-]+$/.test(binding.ref) && !binding.ref.endsWith('/') && !binding.ref.endsWith('.lock'), 'INVALID_ARGUMENT', 'Full canonical ref required');
        if (this.options.allowLocalFixture && binding.provider === 'fixture')
            requireThat(isAbsolute(binding.remote), 'FORBIDDEN', 'Explicit local fixture required');
        else {
            let remote;
            try {
                remote = new URL(binding.remote);
            }
            catch {
                throw new Dev2Error('FORBIDDEN', 'Invalid remote');
            }
            requireThat(['https:', 'ssh:'].includes(remote.protocol) && !remote.password && !remote.search && !remote.hash, 'FORBIDDEN', 'Unapproved transport');
        }
        if (external)
            await this.options.verifyRemote(binding);
    }
    /** @param {Binding} binding */
    async resolve(binding) {
        await this.checkBinding(binding, true);
        await this.init();
        const r = await this.command(['ls-remote', '--exit-code', '--refs', '--', binding.remote, binding.ref], undefined, 8192);
        requireThat(r.code === 0, 'EXECUTION_UNAVAILABLE', 'Authoritative ref unavailable');
        const lines = r.stdout.toString().trim().split('\n');
        requireThat(lines.length === 1, 'INTEGRITY_FAILURE', 'Ambiguous ref');
        const [raw, ref] = lines[0].split('\t');
        requireThat(ref === binding.ref, 'INTEGRITY_FAILURE');
        return { head: this.tagged(raw), bindingEpoch: binding.bindingEpoch, observedAt: new Date().toISOString() };
    }
    /** @param {Binding} binding @param {string} commit */
    async fetch(binding, commit) { await this.checkBinding(binding, true); await this.init(); const r = await this.command(['fetch', '--no-tags', '--no-write-fetch-head', '--no-auto-maintenance', '--', binding.remote, this.raw(commit)], undefined, 8192); requireThat(r.code === 0, 'EXECUTION_UNAVAILABLE', 'Exact object fetch failed'); }
    /** @param {string} type @param {Uint8Array} bytes */
    objectOid(type, bytes) { return this.tagged(createHash(this.format).update(`${type} ${bytes.byteLength}\0`).update(bytes).digest('hex')); }
    /** @param {string} objectOid @param {GitObject} object */
    cache(objectOid, object) { if (this.objects.has(objectOid))
        return; while (this.cacheBytes + object.bytes.length > this.maxSourceBytes && this.objects.size) {
        const key = /** @type {string} */ (this.objects.keys().next().value);
        this.cacheBytes -= /** @type {GitObject} */ (this.objects.get(key)).bytes.length;
        this.objects.delete(key);
    } if (object.bytes.length <= this.maxSourceBytes) {
        this.objects.set(objectOid, object);
        this.cacheBytes += object.bytes.length;
    } }
    /** @param {readonly string[]} names @returns {Promise<GitObject[]>} */
    async readObjects(names) {
        await this.init();
        // Cache eviction by independent work must not invalidate this request.
        /** @type {Map<string,GitObject>} */ const retained = new Map();
        for (const name of names) {
            this.raw(name);
            const value = this.objects.get(name);
            if (value) retained.set(name, value);
        }
        const missing = [...new Set(names.filter(name => !retained.has(name)))];
        if (missing.length) {
            const r = await this.command(['cat-file', '--batch'], Buffer.from(missing.map(name => this.raw(name)).join('\n') + '\n'));
            requireThat(r.code === 0, 'INTEGRITY_FAILURE', 'Git objects unavailable');
            let offset = 0;
            for (const name of missing) {
                const end = r.stdout.indexOf(10, offset);
                requireThat(end >= offset, 'INTEGRITY_FAILURE');
                const header = r.stdout.subarray(offset, end).toString('ascii').split(' ');
                requireThat(header.length === 3 && this.tagged(header[0]) === name && ['blob', 'tree', 'commit', 'tag'].includes(header[1]), 'INTEGRITY_FAILURE', 'Object is missing or wrong type');
                const size = Number(header[2]);
                requireThat(Number.isSafeInteger(size) && size >= 0 && size <= this.maxBlobBytes, 'LIMIT_EXCEEDED', 'Object size');
                offset = end + 1;
                requireThat(offset + size < r.stdout.length && r.stdout[offset + size] === 10, 'INTEGRITY_FAILURE', 'Object length');
                const bytes = Buffer.from(r.stdout.subarray(offset, offset + size));
                offset += size + 1;
                requireThat(this.objectOid(header[1], bytes) === name, 'INTEGRITY_FAILURE', 'Git object bytes mismatch');
                const value = {type:header[1],bytes};
                this.cache(name, value);
                retained.set(name, value);
            }
            requireThat(offset === r.stdout.length, 'INTEGRITY_FAILURE', 'Trailing object response');
        }
        requireThat([...retained.values()].reduce((total,value)=>total+value.bytes.length,0)<=this.maxSourceBytes,'LIMIT_EXCEEDED','Object request byte budget');
        return names.map(name => {
            const value=retained.get(name);
            requireThat(value,'INTEGRITY_FAILURE','Missing requested object');
            return {type:value.type,bytes:Buffer.from(value.bytes)};
        });
    }
    /** @param {Binding} binding @param {string} blob */
    async readBlob(binding, blob) { await this.checkBinding(binding); return this.blob(blob); }
    /** Broker-internal object read. Public callers must go through authorized path discovery. @param {string} blob */
    async blob(blob) { const [value] = await this.readObjects([blob]); requireThat(value.type === 'blob', 'UNSUPPORTED_REPOSITORY_FEATURE', 'Expected file blob'); return value.bytes; }
    /** @param {Binding} binding @param {string} commit */
    async readCommit(binding, commit) {
        await this.checkBinding(binding);
        try {
            await this.readObjects([commit]);
        }
        catch (e) {
            if (e instanceof Dev2Error && e.code === 'INTEGRITY_FAILURE')
                await this.fetch(binding, commit);
            else
                throw e;
        }
        const [object] = await this.readObjects([commit]);
        requireThat(object.type === 'commit', 'INTEGRITY_FAILURE');
        const headers = object.bytes.toString('utf8').split('\n\n')[0].split('\n');
        const tree = headers.filter(l => l.startsWith('tree ')), parents = headers.filter(l => l.startsWith('parent '));
        requireThat(tree.length === 1, 'INTEGRITY_FAILURE');
        return { commitOid: commit, parents: parents.map(p => this.tagged(p.slice(7))), source: await this.readTree(this.tagged(tree[0].slice(5))) };
    }
    /** @param {Binding} binding @param {string} ancestor @param {string} descendant */
    async isAncestor(binding, ancestor, descendant) { await this.checkBinding(binding); await this.init(); const r = await this.command(['merge-base', '--is-ancestor', this.raw(ancestor), this.raw(descendant)], undefined, 1024); requireThat(r.code === 0 || r.code === 1, 'INTEGRITY_FAILURE', 'Incomplete ancestry'); return r.code === 0; }
    /** @param {Uint8Array} bytes */
    async putBlob(bytes) { requireThat(bytes.byteLength <= this.maxBlobBytes, 'LIMIT_EXCEEDED'); const blobOid = await this.putObject('blob', bytes); return { blobOid, contentDigest: bytesDigest(bytes), size: bytes.byteLength }; }
    /** @param {'blob'|'tree'|'commit'} type @param {Uint8Array} bytes */
    async putObject(type, bytes) {
        await this.init();
        const expected = this.objectOid(type, bytes);
        if (this.objects.has(expected))
            return expected;
        const r = await this.command(['hash-object', '-w', '-t', type, '--stdin'], bytes, 1024);
        requireThat(r.code === 0 && this.tagged(r.stdout.toString().trim()) === expected, 'INTEGRITY_FAILURE', 'Object publication');
        this.cache(expected, { type, bytes: Buffer.from(bytes) });
        return expected;
    }
    /** @param {string} treeOid @returns {Promise<SourceTree>} */
    async readTree(treeOid) {
        await this.init();
        this.raw(treeOid);
        const cached = this.trees.get(treeOid);
        if (cached)
            return structuredClone(cached);
        const [treeObject] = await this.readObjects([treeOid]);
        requireThat(treeObject.type === 'tree', 'INTEGRITY_FAILURE', 'Expected tree object');
        const r = await this.command(['ls-tree', '-r', '-t', '-z', '--full-tree', this.raw(treeOid)], undefined, 16777216);
        requireThat(r.code === 0, 'INTEGRITY_FAILURE', 'Tree read');
        /** @type {{path:string,mode:string,blobOid:string}[]} */ const listing = []; /** @type {string[]} */
        const subtrees = [];
        let offset = 0;
        while (offset < r.stdout.length) {
            const end = r.stdout.indexOf(0, offset);
            requireThat(end >= 0, 'INTEGRITY_FAILURE');
            const row = r.stdout.subarray(offset, end);
            offset = end + 1;
            const tab = row.indexOf(9);
            requireThat(tab > 0, 'INTEGRITY_FAILURE');
            const [mode, type, raw] = row.subarray(0, tab).toString().split(' ');
            requireThat(type === 'blob' || mode === '160000' && type === 'commit' || mode === '040000' && type === 'tree', 'INTEGRITY_FAILURE');
            let path;
            try {
                path = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(row.subarray(tab + 1));
            }
            catch {
                throw new Dev2Error('UNSUPPORTED_REPOSITORY_FEATURE', 'Non UTF-8 path');
            }
            repositoryPath(path);
            if (type === 'tree')
                subtrees.push(this.tagged(raw));
            else
                listing.push({ path, mode, blobOid: this.tagged(raw) });
            requireThat(listing.length + subtrees.length <= 100000, 'LIMIT_EXCEEDED');
        }
        // Verify every nested tree hash; verifying only the root and leaves misses a corrupted intermediate tree.
        for (let at = 0; at < subtrees.length; at += 128) {
            const checked = await this.readObjects(subtrees.slice(at, at + 128));
            requireThat(checked.every(value => value.type === 'tree'), 'INTEGRITY_FAILURE', 'Nested tree type');
        }
        /** @type {Entry[]} */ const entries = [];
        let total = 0;
        for (let at = 0; at < listing.length; at += 128) {
            const chunk = listing.slice(at, at + 128);
            const blobs = await this.readObjects(chunk.filter(e => e.mode !== '160000').map(e => e.blobOid));
            let i = 0;
            for (const e of chunk) {
                if (e.mode === '160000') {
                    entries.push({ ...e, contentDigest: gitlinkDigest(e.blobOid), size: 0 });
                    continue;
                }
                const blob = blobs[i++];
                requireThat(blob.type === 'blob', 'INTEGRITY_FAILURE');
                total += blob.bytes.length;
                requireThat(total <= this.maxSourceBytes, 'LIMIT_EXCEEDED', 'Repository source budget');
                entries.push({ ...e, contentDigest: bytesDigest(blob.bytes), size: blob.bytes.length });
            }
        }
        const source = { treeOid, entries: canonicalEntries(entries), manifestDigest: sourceManifest(entries) };
        this.trees.set(treeOid, source);
        while (this.trees.size > 64)
            this.trees.delete(/** @type {string} */ (this.trees.keys().next().value));
        return structuredClone(source);
    }
    /** @param {readonly Entry[]} input @returns {Promise<SourceTree>} */
    async writeTree(input) {
        const entries = canonicalEntries(input);
        /** @typedef {{files:Map<string,Entry>,dirs:Map<string,Directory>}} Directory */
        /** @type {Directory} */ const root = { files: new Map(), dirs: new Map() };
        for (const e of entries) {
            this.raw(e.blobOid);
            if (e.mode !== '160000') {
                const b = await this.blob(e.blobOid);
                requireThat(b.length === e.size && bytesDigest(b) === e.contentDigest, 'INTEGRITY_FAILURE', 'Entry digest mismatch');
            }
            const parts = e.path.split('/'), name = /** @type {string} */ (parts.pop());
            let at = root;
            for (const part of parts) {
                if (!at.dirs.has(part))
                    at.dirs.set(part, { files: new Map(), dirs: new Map() });
                at = /** @type {Directory} */ (at.dirs.get(part));
            }
            at.files.set(name, e);
        }
        /** @param {Directory} directory @returns {Promise<string>} */
        const build = async (directory) => {
            const children = [...directory.files].map(([name, e]) => ({ name, mode: e.mode, oid: e.blobOid, sort: name }));
            for (const [name, dir] of directory.dirs)
                children.push({ name, mode: '40000', oid: await build(dir), sort: name + '/' });
            children.sort((a, b) => Buffer.compare(Buffer.from(a.sort), Buffer.from(b.sort)));
            return this.putObject('tree', Buffer.concat(children.map(c => Buffer.concat([Buffer.from(c.mode + ' ' + c.name + '\0'), Buffer.from(this.raw(c.oid), 'hex')]))));
        };
        const treeOid = await build(root), source = { treeOid, entries, manifestDigest: sourceManifest(entries) };
        this.trees.set(treeOid, structuredClone(source));
        while (this.trees.size > 64)
            this.trees.delete(/** @type {string} */ (this.trees.keys().next().value));
        return source;
    }
    /** Metadata uses Git actor lines without caller-controlled environment or a mutable index.
     * @param {string} parent @param {string|SourceTree} tree @param {{author:string,committer:string,timestamp:number,message:string}} metadata @param {string} resultId */
    async freezeCommit(parent, tree, metadata, resultId) {
        id(resultId);
        const treeOid = typeof tree === 'string' ? tree : tree.treeOid;
        this.raw(parent);
        this.raw(treeOid);
        requireThat(Number.isSafeInteger(metadata.timestamp) && metadata.timestamp >= 0 && metadata.message.isWellFormed() && Buffer.byteLength(metadata.message) <= 65536 && !metadata.message.includes('\0'), 'INVALID_ARGUMENT', 'Commit metadata');
        for (const actor of [metadata.author, metadata.committer])
            requireThat(/^[^<>\r\n\0]+ <[^<>\r\n\0]+>$/.test(actor), 'INVALID_ARGUMENT', 'Commit actor');
        const [parentObject, treeObject] = await this.readObjects([parent, treeOid]);
        requireThat(parentObject.type === 'commit' && treeObject.type === 'tree', 'INTEGRITY_FAILURE', 'Commit parent/tree types');
        requireThat(!/^Dev2-Result:/m.test(metadata.message), 'INVALID_ARGUMENT', 'Result trailer is broker-owned');
        const seconds = Math.floor(metadata.timestamp / 1000);
        const bytes = Buffer.from(`tree ${this.raw(treeOid)}\nparent ${this.raw(parent)}\nauthor ${metadata.author} ${seconds} +0000\ncommitter ${metadata.committer} ${seconds} +0000\n\n${metadata.message.replace(/\n+$/, '')}\n\nDev2-Result: ${resultId}\n`);
        return this.putObject('commit', bytes);
    }
}
