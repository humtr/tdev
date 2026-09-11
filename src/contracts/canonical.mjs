import { createHash } from 'node:crypto';
import { requireThat } from './errors.mjs';
export const CODEC = 'dev2.canonical-json.v1';
/** @typedef {import('./json.js').Json} Json */
/** @param {string} value */
export function scalarString(value) {
    for (const char of value) {
        const n = /** @type {number} */ (char.codePointAt(0));
        requireThat(n < 0xd800 || n > 0xdfff, 'INVALID_ARGUMENT', 'Lone Unicode surrogate');
    }
    return value;
}
/** Reject getters, toJSON hooks, sparse arrays, cycles and lossy numeric values.
 * @param {unknown} value @returns {string} */
export function canonical(value) {
    const active = new Set();
    /** @param {unknown} v @param {number} depth @returns {string} */
    function encode(v, depth) {
        requireThat(depth <= 128, 'LIMIT_EXCEEDED', 'Canonical nesting exceeds 128');
        if (v === null)
            return 'null';
        if (typeof v === 'boolean')
            return v ? 'true' : 'false';
        if (typeof v === 'string')
            return JSON.stringify(scalarString(v));
        if (typeof v === 'number') {
            requireThat(Number.isSafeInteger(v), 'INVALID_ARGUMENT', 'Expected safe integer');
            return JSON.stringify(Object.is(v, -0) ? 0 : v);
        }
        requireThat(typeof v === 'object', 'INVALID_ARGUMENT', 'Non-JSON value');
        requireThat(!active.has(v), 'INVALID_ARGUMENT', 'Cyclic record');
        active.add(v);
        try {
            if (Array.isArray(v)) {
                requireThat(Object.getPrototypeOf(v) === Array.prototype, 'INVALID_ARGUMENT', 'Non-plain array');
                requireThat(Reflect.ownKeys(v).length === v.length + 1, 'INVALID_ARGUMENT', 'Sparse or extended array');
                const out = [];
                for (let i = 0; i < v.length; i++) {
                    const d = Object.getOwnPropertyDescriptor(v, String(i));
                    requireThat(d && 'value' in d && d.enumerable, 'INVALID_ARGUMENT', 'Sparse or accessor array');
                    out.push(encode(d.value, depth + 1));
                }
                return '[' + out.join(',') + ']';
            }
            const proto = Object.getPrototypeOf(v);
            requireThat(proto === Object.prototype || proto === null, 'INVALID_ARGUMENT', 'Expected plain record');
            const keys = Reflect.ownKeys(v);
            requireThat(keys.every(k => typeof k === 'string'), 'INVALID_ARGUMENT', 'Symbol key');
            return '{' + /** @type {string[]} */ (keys).sort().map(k => { scalarString(k); const d = Object.getOwnPropertyDescriptor(v, k); requireThat(d && 'value' in d && d.enumerable, 'INVALID_ARGUMENT', 'Non-data record property'); return JSON.stringify(k) + ':' + encode(d.value, depth + 1); }).join(',') + '}';
        }
        finally {
            active.delete(v);
        }
    }
    return encode(value, 0);
}
/** @param {Uint8Array|string} bytes @returns {`sha256:${string}`} */
export function bytesDigest(bytes) { return `sha256:${createHash('sha256').update(bytes).digest('hex')}`; }
/** @param {string} domain @param {unknown} value @returns {`sha256:${string}`} */
export function recordDigest(domain, value) { requireThat(/^dev2\.[a-z0-9-]+\.v[1-9][0-9]*$/.test(domain), 'INVALID_ARGUMENT', 'Expected versioned digest domain'); return bytesDigest(Buffer.concat([Buffer.from(domain), Buffer.from([0]), Buffer.from(canonical(value))])); }
/** Duplicate-aware parser. Exact decimal arithmetic prevents rounded fractional values becoming identities.
 * @param {string} text @param {number} [maxBytes] @returns {Json} */
export function parseRecord(text, maxBytes = 1048576) {
    requireThat(typeof text === 'string', 'INVALID_ARGUMENT', 'JSON text required');
    requireThat(Buffer.byteLength(text) <= maxBytes, 'LIMIT_EXCEEDED', 'JSON body exceeds limit');
    let at = 0;
    const ws = () => { while (at < text.length && /[\x20\t\r\n]/.test(text[at]))
        at++; };
    /** @returns {never} */
    const bad = () => { throw Object.assign(new SyntaxError('Invalid JSON at character ' + at), { code: 'INVALID_ARGUMENT' }); };
    /** @returns {string} */
    function string() { const start = at++; while (at < text.length) {
        if (text[at] === '\\') {
            at += 2;
            continue;
        }
        if (text[at++] === '"') {
            try {
                return scalarString(JSON.parse(text.slice(start, at)));
            }
            catch {
                return bad();
            }
        }
    } return bad(); }
    /** @param {number} depth @returns {Json} */
    function value(depth) {
        requireThat(depth <= 128, 'LIMIT_EXCEEDED', 'JSON nesting exceeds 128');
        ws();
        const c = text[at];
        if (c === '"')
            return string();
        if (c === '{') {
            at++;
            const o = Object.create(null);
            const keys = new Set();
            ws();
            if (text[at] === '}') {
                at++;
                return o;
            }
            while (true) {
                ws();
                if (text[at] !== '"')
                    return bad();
                const k = string();
                if (keys.has(k))
                    return bad();
                keys.add(k);
                ws();
                if (text[at++] !== ':')
                    return bad();
                o[k] = value(depth + 1);
                ws();
                const end = text[at++];
                if (end === '}')
                    return o;
                if (end !== ',')
                    return bad();
            }
        }
        if (c === '[') {
            at++;
            /** @type {Json[]} */
            const out = [];
            ws();
            if (text[at] === ']') {
                at++;
                return out;
            }
            while (true) {
                out.push(value(depth + 1));
                ws();
                const end = text[at++];
                if (end === ']')
                    return out;
                if (end !== ',')
                    return bad();
            }
        }
        for (const [word, v] of /** @type {const} */ ([['true', true], ['false', false], ['null', null]])) {
            if (text.startsWith(word, at)) {
                at += word.length;
                return v;
            }
        }
        const m = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(at));
        if (!m)
            return bad();
        const token = m[0];
        requireThat(token.length <= 128, 'LIMIT_EXCEEDED', 'Numeric token too long');
        at += token.length;
        const n = Number(token);
        if (!Number.isSafeInteger(n))
            return bad();
        const parts = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
        if (!parts)
            return bad();
        const fraction = parts[3] ?? '';
        let integer = BigInt(parts[2] + fraction);
        const scale = Number(parts[4] ?? 0) - fraction.length;
        if (integer !== 0n) {
            if (Math.abs(scale) > 128)
                return bad();
            if (scale >= 0)
                integer *= 10n ** BigInt(scale);
            else {
                const divisor = 10n ** BigInt(-scale);
                if (integer % divisor !== 0n)
                    return bad();
                integer /= divisor;
            }
        }
        if (parts[1] === '-')
            integer = -integer;
        if (integer !== BigInt(n))
            return bad();
        return Object.is(n, -0) ? 0 : n;
    }
    const result = value(0);
    ws();
    if (at !== text.length)
        return bad();
    return result;
}
/** @template T @param {T} value @returns {T} */
export function frozen(value) {
    const clone = parseRecord(canonical(value));
    /** @param {Json} v */
    function deep(v) { if (v && typeof v === 'object') {
        for (const child of Object.values(v))
            deep(child);
        Object.freeze(v);
    } }
    deep(clone);
    return /** @type {T} */ ( /** @type {unknown} */(clone));
}
