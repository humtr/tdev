import { recordDigest } from '../contracts/canonical.mjs';
import { oid, digest } from '../contracts/identity.mjs';
import { requireThat } from '../contracts/errors.mjs';
import { repositoryPath, comparePaths } from '../security/paths.mjs';
/** @typedef {import('../contracts/ports.js').SourceEntry} Entry */
export const SOURCE_MODES = Object.freeze(['100644', '100755', '120000', '160000']);
/** Gitlinks contain commit identity, not pretend file bytes. @param {string} commitOid */
export function gitlinkDigest(commitOid) { return recordDigest('dev2.gitlink.v1', { commitOid: oid(commitOid) }); }
/** @param {readonly Entry[]} entries @returns {Entry[]} */
export function canonicalEntries(entries) {
    requireThat(Array.isArray(entries) && entries.length <= 100000, 'LIMIT_EXCEEDED', 'Source entry count');
    const result = entries.map(entry => {
        repositoryPath(entry.path);
        oid(entry.blobOid);
        digest(entry.contentDigest);
        requireThat(SOURCE_MODES.includes(entry.mode) && Number.isSafeInteger(entry.size) && entry.size >= 0, 'INTEGRITY_FAILURE', 'Source entry');
        if (entry.mode === '160000')
            requireThat(entry.size === 0 && entry.contentDigest === gitlinkDigest(entry.blobOid), 'INTEGRITY_FAILURE', 'Gitlink descriptor');
        return { ...entry };
    }).sort((a, b) => comparePaths(a.path, b.path));
    const paths = new Set(result.map(e => e.path));
    requireThat(paths.size === result.length, 'ENTRY_CONFLICT', 'Duplicate path');
    for (const entry of result) {
        const parts = entry.path.split('/');
        parts.pop();
        while (parts.length) {
            requireThat(!paths.has(parts.join('/')), 'ENTRY_CONFLICT', 'File/directory collision');
            parts.pop();
        }
    }
    return result;
}
/** @param {readonly Entry[]} entries */
export function sourceManifest(entries) { return recordDigest('dev2.source-manifest.v1', { entries: canonicalEntries(entries).map(({ path, mode, contentDigest }) => ({ path, mode, contentDigest })) }); }
/** @param {Entry|undefined} left @param {Entry|undefined} right */
export function sameEntry(left, right) { return !left && !right || Boolean(left && right && left.mode === right.mode && left.blobOid === right.blobOid && left.contentDigest === right.contentDigest && left.size === right.size); }
