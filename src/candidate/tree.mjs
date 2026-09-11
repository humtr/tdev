import { canonicalJson, bytesDigest } from '../contracts/canonical.mjs';
import { requireThat, Dev2Error } from '../contracts/errors.mjs';
import { repositoryPath } from '../security/paths.mjs';
import { canonicalEntries, sourceManifest, sameEntry } from '../repository/entries.mjs';
/** @typedef {import('../contracts/ports.js').SourceEntry} Entry */
/** @typedef {import('../contracts/ports.js').SourceTree} SourceTree */
/** @typedef {import('../contracts/ports.js').Edit} Edit */
/** @typedef {Pick<import('../repository/git.mjs').GitRepository,'putBlob'|'blob'|'writeTree'>} Objects */
/** @param {SourceTree} source */
export function verifySource(source) { requireThat(sourceManifest(source.entries) === source.manifestDigest, 'INTEGRITY_FAILURE', 'Source manifest mismatch'); return canonicalEntries(source.entries); }
/** @param {Entry|undefined} entry @param {import('../contracts/ports.js').ExpectedEntry} expected */
function expects(entry, expected) { requireThat(expected === 'absent' ? !entry : Boolean(entry && entry.mode === expected.mode && entry.contentDigest === expected.blobDigest), 'ENTRY_CONFLICT', 'Expected entry changed'); }
/** @param {string} content @param {'utf8'|'base64'} encoding */
export function contentBytes(content, encoding) {
    requireThat(typeof content === 'string' && content.isWellFormed(), 'INVALID_ARGUMENT', 'Content Unicode');
    if (encoding === 'utf8')
        return Buffer.from(content);
    requireThat(encoding === 'base64' && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content), 'INVALID_ARGUMENT', 'Canonical base64 required');
    const bytes = Buffer.from(content, 'base64');
    requireThat(bytes.toString('base64') === content, 'INVALID_ARGUMENT', 'Noncanonical base64');
    return bytes;
}
/** Every expectation addresses the original generation; duplicate touched paths
 * are rejected rather than interpreting an undocumented edit program.
 * No object write happens before all edit preconditions and topology are checked.
 * @param {Objects} repository @param {SourceTree} source @param {readonly Edit[]} edits @returns {Promise<SourceTree>} */
export async function editTree(repository, source, edits) {
    const original = verifySource(source), old = new Map(original.map(e => [e.path, e]));
    requireThat(Array.isArray(edits) && edits.length > 0 && edits.length <= 256, 'LIMIT_EXCEEDED', 'Edit count');
    requireThat(Buffer.byteLength(canonicalJson(edits)) <= 1048576, 'LIMIT_EXCEEDED', 'Edit bytes');
    const touched = new Set();
    /** @type {{path:string,mode:string,bytes:Buffer}[]} */ const puts = [];
    const after = new Map(old);
    for (const edit of edits) {
        const keys = edit.kind === 'move' ? ['kind', 'from', 'to', 'expectedEntry', 'expectedDestination'] : edit.kind === 'put' ? ['kind', 'path', 'expectedEntry', 'mode', 'content', 'encoding'] : edit.kind === 'delete' ? ['kind', 'path', 'expectedEntry'] : ['kind', 'path', 'expectedEntry', 'oldText', 'newText'];
        requireThat(Object.keys(edit).every(k => keys.includes(k)) && keys.every(k => Object.hasOwn(edit, k)), 'INVALID_ARGUMENT', 'Closed edit variant');
        const paths = edit.kind === 'move' ? [edit.from, edit.to] : [edit.path];
        for (const path of paths) {
            repositoryPath(path);
            requireThat(!touched.has(path), 'ENTRY_CONFLICT', 'Duplicate touched path');
            touched.add(path);
        }
        const path = edit.kind === 'move' ? edit.from : edit.path;
        const previous = old.get(path);
        expects(previous, edit.expectedEntry);
        if (edit.kind === 'delete') {
            requireThat(previous, 'ENTRY_CONFLICT', 'Delete absent');
            after.delete(path);
        }
        else if (edit.kind === 'move') {
            requireThat(previous && edit.expectedDestination === 'absent' && !old.has(edit.to), 'ENTRY_CONFLICT', 'Move precondition');
            after.delete(path);
            after.set(edit.to, { ...previous, path: edit.to });
        }
        else {
            /** @type {Buffer} */ let bytes; /** @type {string} */
            let mode;
            if (edit.kind === 'put') {
                requireThat(['100644', '100755', '120000'].includes(edit.mode), 'UNSUPPORTED_REPOSITORY_FEATURE', 'Use explicit gitlink metadata, not blob content');
                bytes = contentBytes(edit.content, edit.encoding);
                mode = edit.mode;
            }
            else {
                requireThat(edit.kind === 'exact_edit' && previous && ['100644', '100755'].includes(previous.mode), 'INVALID_ARGUMENT', 'Exact text edit requires a regular file');
                requireThat(edit.oldText.length > 0 && edit.oldText.isWellFormed() && edit.newText.isWellFormed(), 'INVALID_ARGUMENT', 'Exact edit text');
                const input = await repository.blob(previous.blobOid);
                requireThat(input.length === previous.size && bytesDigest(input) === previous.contentDigest, 'INTEGRITY_FAILURE');
                let text;
                try {
                    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(input);
                }
                catch {
                    throw new Dev2Error('ENCODING_BOUNDARY');
                }
                const first = text.indexOf(edit.oldText);
                requireThat(first >= 0 && text.indexOf(edit.oldText, first + 1) < 0, 'ENTRY_CONFLICT', 'Old text must match exactly once');
                bytes = Buffer.from(text.slice(0, first) + edit.newText + text.slice(first + edit.oldText.length));
                mode = previous.mode;
            }
            puts.push({ path, mode, bytes });
            after.set(path, { path, mode, blobOid: previous?.blobOid ?? source.treeOid, contentDigest: bytesDigest(bytes), size: bytes.length });
        }
    }
    canonicalEntries([...after.values()]);
    for (const put of puts) {
        const value = await repository.putBlob(put.bytes);
        after.set(put.path, { path: put.path, mode: put.mode, ...value });
    }
    return repository.writeTree([...after.values()]);
}
/** Pure path-level recomposition. Caller proves base ancestry and managed lineage.
 * Disjoint paths are not a validation waiver: P5 validates the full returned tree.
 * @param {SourceTree} base @param {SourceTree} candidate @param {SourceTree} head @returns {Entry[]} */
export function composeTrees(base, candidate, head) {
    const b = new Map(verifySource(base).map(e => [e.path, e])), c = new Map(verifySource(candidate).map(e => [e.path, e])), h = new Map(verifySource(head).map(e => [e.path, e]));
    for (const path of new Set([...b.keys(), ...c.keys()])) {
        if (sameEntry(b.get(path), c.get(path)))
            continue;
        requireThat(sameEntry(b.get(path), h.get(path)), 'INTEGRATION_CONFLICT', 'Canonical touched entry changed');
        const entry = c.get(path);
        if (entry)
            h.set(path, { ...entry });
        else
            h.delete(path);
    }
    try {
        return canonicalEntries([...h.values()]);
    }
    catch (e) {
        if (e instanceof Dev2Error && e.code === 'ENTRY_CONFLICT')
            throw new Dev2Error('INTEGRATION_CONFLICT', 'Canonical file/directory collision');
        throw e;
    }
}
