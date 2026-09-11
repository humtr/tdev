import { requireThat } from '../contracts/errors.mjs';
/** Canonical Git path, never a host path. No URL decoding or case folding.
 * @param {unknown} value @param {boolean} [allowRoot] @returns {string}
 */
export function repositoryPath(value, allowRoot=false) {
  requireThat(typeof value==='string' && value.isWellFormed(), 'INVALID_ARGUMENT', 'UTF-8 path');
  requireThat(Buffer.byteLength(value)<=4096, 'LIMIT_EXCEEDED', 'Path bytes');
  if (allowRoot && value==='') return value;
  requireThat(value.length>0 && !value.includes('\0') && !value.includes('\\') &&
    !value.startsWith('/') && !/^[a-zA-Z]:/.test(value) && value.normalize('NFC')===value,
    'INVALID_ARGUMENT', 'Noncanonical path');
  const parts=value.split('/');
  requireThat(parts.every(p=>p!==''&&p!=='.'&&p!=='..'), 'INVALID_ARGUMENT', 'Path traversal/alias');
  requireThat(parts.every(p=>p.toLowerCase()!=='.git'), 'FORBIDDEN', 'Git metadata');
  return value;
}
/** @param {string} prefix @param {string} path */
export function withinPrefix(prefix,path) { return prefix==='' || prefix===path || path.startsWith(prefix+'/'); }
/** Raw UTF-8 order required by source manifests and paged reads.
 * @param {string} a @param {string} b
 */
export function comparePaths(a,b) { return Buffer.compare(Buffer.from(a),Buffer.from(b)); }
