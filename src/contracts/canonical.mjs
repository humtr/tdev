import { createHash } from 'node:crypto';
import { requireThat } from './errors.mjs';

/** @param {string} value @returns {string} */
export function scalarString(value) {
  requireThat(value.isWellFormed(), 'INVALID_ARGUMENT', 'Lone surrogate');
  return value;
}

/** D0001 canonical-record encoding. Does not invoke user getters or toJSON.
 * @param {unknown} value @returns {string}
 */
export function canonicalJson(value) {
  const active = new Set();
  /** @param {unknown} v @param {number} depth @returns {string} */
  function encode(v, depth) {
    requireThat(depth <= 128, 'LIMIT_EXCEEDED', 'JSON nesting');
    if (v === null) return 'null';
    if (typeof v === 'string') return JSON.stringify(scalarString(v));
    if (typeof v === 'boolean') return JSON.stringify(v);
    if (typeof v === 'number') {
      requireThat(Number.isSafeInteger(v), 'INVALID_ARGUMENT', 'Not a safe integer');
      return JSON.stringify(Object.is(v, -0) ? 0 : v);
    }
    requireThat(typeof v === 'object', 'INVALID_ARGUMENT', 'Not a JSON value');
    requireThat(!active.has(v), 'INVALID_ARGUMENT', 'Cyclic JSON');
    active.add(v);
    try {
      requireThat(Object.getOwnPropertySymbols(v).length === 0, 'INVALID_ARGUMENT', 'Symbol key');
      const props = Object.getOwnPropertyDescriptors(v);
      if (Array.isArray(v)) {
        requireThat(Object.keys(props).length === v.length + 1, 'INVALID_ARGUMENT', 'Sparse or extended array');
        const result = [];
        for (let i = 0; i < v.length; i++) {
          const p = props[String(i)];
          requireThat(p && 'value' in p && p.enumerable, 'INVALID_ARGUMENT', 'Sparse/accessor array');
          result.push(encode(p.value, depth + 1));
        }
        return '[' + result.join(',') + ']';
      }
      requireThat(Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null,
        'INVALID_ARGUMENT', 'Not a plain record');
      const result = [];
      for (const key of Object.keys(props).sort()) {
        const p = props[key];
        requireThat('value' in p && p.enumerable, 'INVALID_ARGUMENT', 'Accessor/hidden property');
        result.push(JSON.stringify(scalarString(key)) + ':' + encode(p.value, depth + 1));
      }
      return '{' + result.join(',') + '}';
    } finally { active.delete(v); }
  }
  return encode(value, 0);
}

/** @param {Uint8Array} bytes @returns {string} */
export function bytesDigest(bytes) {
  return 'sha256:' + createHash('sha256').update(bytes).digest('hex');
}
/** @param {string} domain @param {unknown} value @returns {string} */
export function recordDigest(domain, value) {
  requireThat(/^dev2\.[a-z0-9.-]+\.v[1-9][0-9]*$/.test(domain), 'INVALID_ARGUMENT', 'Digest domain');
  return bytesDigest(Buffer.concat([Buffer.from(domain + '\0'), Buffer.from(canonicalJson(value))]));
}

/** Duplicate-aware parser for untrusted wire and retained records. Validate limits before recursion.
 * @param {string|Uint8Array} input @param {number} [maxBytes] @returns {unknown}
 */
export function parseRecord(input, maxBytes = 1048576) {
  requireThat(Number.isSafeInteger(maxBytes) && maxBytes > 0, 'INVALID_ARGUMENT');
  const bytes = typeof input === 'string' ? Buffer.from(scalarString(input)) : input;
  requireThat(bytes.byteLength <= maxBytes, 'LIMIT_EXCEEDED', 'JSON bytes');
  let text = "";
  try { text = new TextDecoder('utf-8', { fatal:true, ignoreBOM:true }).decode(bytes); }
  catch { requireThat(false, 'INVALID_ARGUMENT', 'Malformed UTF-8'); }
  let pos = 0;
  const ws = () => { while (/[\x20\x09\x0a\x0d]/.test(text[pos] ?? 'x')) pos++; };
  /** @returns {string} */
  function string() {
    const start = pos++;
    while (pos < text.length) {
      const c = text[pos++];
      if (c === '\\') { pos++; continue; }
      if (c === '"') {
        try { return scalarString(JSON.parse(text.slice(start, pos))); }
        catch { requireThat(false, 'INVALID_ARGUMENT', 'Malformed string'); }
      }
    }
    requireThat(false, 'INVALID_ARGUMENT', 'Unterminated string');
  }
  /** @param {number} depth @returns {unknown} */
  function value(depth) {
    requireThat(depth <= 128, 'LIMIT_EXCEEDED', 'JSON nesting'); ws();
    const c = text[pos];
    if (c === '"') return string();
    if (c === '{') {
      pos++; ws(); const result = Object.create(null); const seen = new Set();
      if (text[pos] === '}') { pos++; return result; }
      while (true) {
        requireThat(text[pos] === '"', 'INVALID_ARGUMENT', 'Expected key');
        const key = string(); requireThat(!seen.has(key), 'INVALID_ARGUMENT', 'Duplicate key'); seen.add(key);
        ws(); requireThat(text[pos++] === ':', 'INVALID_ARGUMENT', 'Expected colon');
        result[key] = value(depth + 1); ws();
        if (text[pos] === '}') { pos++; return result; }
        requireThat(text[pos++] === ',', 'INVALID_ARGUMENT', 'Expected comma'); ws();
      }
    }
    if (c === '[') {
      pos++; ws();
      /** @type {unknown[]} */
      const result = [];
      if (text[pos] === ']') { pos++; return result; }
      while (true) {
        result.push(value(depth + 1)); ws();
        if (text[pos] === ']') { pos++; return result; }
        requireThat(text[pos++] === ',', 'INVALID_ARGUMENT', 'Expected comma'); ws();
      }
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(text.slice(pos));
    requireThat(token, 'INVALID_ARGUMENT', 'Expected value'); pos += token[0].length;
    const raw=token[0];
    if (raw==='true' || raw==='false' || raw==='null') return JSON.parse(raw);
    const parts=/^(-?)([0-9]+)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(raw);
    requireThat(parts, 'INVALID_ARGUMENT');
    let digits=(parts[2]+(parts[3]??'')).replace(/^0+/, '');
    if (!digits) return 0;
    const scale=Number(parts[4]??0)-(parts[3]?.length??0);
    requireThat(Number.isSafeInteger(scale), 'INVALID_ARGUMENT', 'Number exponent');
    if (scale<0) {
      requireThat(-scale<digits.length && /^0+$/.test(digits.slice(scale)), 'INVALID_ARGUMENT', 'Fractional number');
      digits=digits.slice(0,scale);
    } else {
      requireThat(scale<=16 && digits.length+scale<=16, 'INVALID_ARGUMENT', 'Number overflow');
      digits+='0'.repeat(scale);
    }
    requireThat(digits.length<=16, 'INVALID_ARGUMENT', 'Number overflow');
    const exact=BigInt(parts[1]+digits);
    requireThat(exact>=-9007199254740991n && exact<=9007199254740991n, 'INVALID_ARGUMENT', 'Not a safe integer');
    return Number(exact);
  }
  const result = value(0); ws(); requireThat(pos === text.length, 'INVALID_ARGUMENT', 'Trailing JSON');
  return result;
}
