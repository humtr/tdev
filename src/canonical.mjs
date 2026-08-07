import { createHash } from 'node:crypto';

export const DEFAULT_JSON_LIMITS = deepFreeze({
  maxBytes: 8 * 1024 * 1024,
  maxDepth: 128,
  maxTokens: 1_000_000,
  maxObjectMembers: 100_000,
  maxArrayItems: 100_000,
  maxStringCodePoints: 4 * 1024 * 1024,
  maxNumberDigits: 128,
  maxExponentMagnitude: 1_000,
});

export class ContractError extends Error {
  constructor(code, message, details = {}, options = undefined) {
    super(message, options);
    this.name = 'ContractError';
    this.code = code;
    this.details = details;
  }
}

export function clone(value) {
  return structuredClone(value);
}

export function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function createRecord(entries = []) {
  const record = Object.create(null);
  for (const [key, value] of entries) record[key] = value;
  return record;
}

export function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  if (seen.has(value)) throw new ContractError('cyclic_value', 'Cyclic values are not supported');
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        throw new ContractError('sparse_array', `Sparse array item at index ${index}`);
      }
      deepFreeze(value[index], seen);
    }
  } else {
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') {
        throw new ContractError('symbol_key', 'Symbol-keyed values are not supported');
      }
      deepFreeze(value[key], seen);
    }
  }
  seen.delete(value);
  return Object.freeze(value);
}

export function assertScalarString(value, path = '$') {
  if (typeof value !== 'string') {
    throw new ContractError('invalid_string', `Expected string at ${path}`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new ContractError('unpaired_surrogate', `Unpaired high surrogate at ${path}`);
      }
      index += 1;
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      throw new ContractError('unpaired_surrogate', `Unpaired low surrogate at ${path}`);
    }
  }
  return value;
}

function quote(value, path) {
  assertScalarString(value, path);
  return JSON.stringify(value);
}

function canonicalize(value, path, ancestors) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new ContractError('unsafe_number', `Only safe integers are supported at ${path}`);
    }
    return Object.is(value, -0) ? '0' : String(value);
  }
  if (typeof value === 'string') return quote(value, path);
  if (typeof value !== 'object') {
    throw new ContractError('unsupported_value', `Unsupported ${typeof value} value at ${path}`);
  }
  if (ancestors.has(value)) {
    throw new ContractError('cyclic_value', `Cyclic value at ${path}`);
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const items = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          throw new ContractError('sparse_array', `Sparse array item at ${path}[${index}]`);
        }
        items.push(canonicalize(value[index], `${path}[${index}]`, ancestors));
      }
      return `[${items.join(',')}]`;
    }
    if (!isPlainRecord(value)) {
      throw new ContractError('unsupported_object', `Only plain records are supported at ${path}`);
    }
    const symbols = Object.getOwnPropertySymbols(value);
    if (symbols.length > 0) {
      throw new ContractError('symbol_key', `Symbol-keyed values are not supported at ${path}`);
    }
    const fields = [];
    for (const key of Object.keys(value).sort(compareText)) {
      const item = value[key];
      if (item === undefined) {
        throw new ContractError('undefined_value', `Undefined value at ${path}.${key}`);
      }
      fields.push(`${quote(key, `${path}.<key>`)}:${canonicalize(item, `${path}.${key}`, ancestors)}`);
    }
    return `{${fields.join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalJson(value) {
  return canonicalize(value, '$', new Set());
}

export function digest(value) {
  const hex = createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
  return `sha256:${hex}`;
}

export function typedDigest(domain, value) {
  if (typeof domain !== 'string' || domain.length === 0 || domain.includes('\0')) {
    throw new ContractError('invalid_digest_domain', 'Digest domain must be non-empty and contain no NUL');
  }
  const hex = createHash('sha256')
    .update(domain, 'utf8')
    .update(Buffer.from([0]))
    .update(canonicalJson(value), 'utf8')
    .digest('hex');
  return `sha256:${hex}`;
}

export function canonicalClone(value) {
  const encoded = Buffer.from(canonicalJson(value), 'utf8');
  return strictJsonParse(encoded, {
    maxBytes: Math.max(DEFAULT_JSON_LIMITS.maxBytes, encoded.byteLength),
    maxDepth: Number.MAX_SAFE_INTEGER,
    maxTokens: Number.MAX_SAFE_INTEGER,
    maxObjectMembers: Number.MAX_SAFE_INTEGER,
    maxArrayItems: Number.MAX_SAFE_INTEGER,
    maxStringCodePoints: Number.MAX_SAFE_INTEGER,
    maxNumberDigits: DEFAULT_JSON_LIMITS.maxNumberDigits,
    maxExponentMagnitude: DEFAULT_JSON_LIMITS.maxExponentMagnitude,
  });
}

export function publicJsonClone(value) {
  return JSON.parse(canonicalJson(value));
}

export function exactKeys(value, expected, path = '$') {
  if (!isPlainRecord(value)) {
    throw new ContractError('invalid_record', `${path} must be a plain record`);
  }
  const actual = Object.keys(value).sort(compareText);
  const wanted = [...expected].sort(compareText);
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new ContractError('unexpected_keys', `${path} has unexpected or missing keys`, { actual, expected: wanted });
  }
}

export function assertRecordShape(value, required = [], optional = [], path = '$') {
  if (!isPlainRecord(value)) {
    throw new ContractError('invalid_record', `${path} must be a plain record`);
  }
  const allowed = new Set([...required, ...optional]);
  const actual = Object.keys(value).sort(compareText);
  const missing = required.filter((key) => !Object.hasOwn(value, key)).sort(compareText);
  const unknown = actual.filter((key) => !allowed.has(key));
  if (missing.length > 0 || unknown.length > 0) {
    throw new ContractError('unexpected_keys', `${path} has unexpected or missing keys`, {
      actual,
      required: [...required].sort(compareText),
      optional: [...optional].sort(compareText),
      missing,
      unknown,
    });
  }
  return value;
}

export function strictJsonParse(input, options = {}) {
  assertRecordShape(options, [], Object.keys(DEFAULT_JSON_LIMITS), 'strict JSON options');
  const limits = { ...DEFAULT_JSON_LIMITS };
  for (const [key, value] of Object.entries(options)) {
    limits[key] = assertSafeInteger(value, `strict JSON option ${key}`, {
      min: key === 'maxExponentMagnitude' ? 0 : 1,
    });
  }
  let bytes;
  if (typeof input === 'string') {
    assertScalarString(input, 'JSON input');
    bytes = Buffer.from(input, 'utf8');
  }
  else if (input instanceof Uint8Array) bytes = input;
  else throw new ContractError('invalid_json_input', 'Strict JSON input must be a string or Uint8Array');

  if (bytes.byteLength > limits.maxBytes) {
    throw new ContractError('json_limit_exceeded', 'JSON body exceeds the byte limit', {
      reason: 'bytes',
      limit: limits.maxBytes,
    });
  }

  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new ContractError('invalid_utf8', 'JSON input is not valid UTF-8', {}, { cause });
  }

  let pos = 0;
  let tokenCount = 0;

  function fail(code, message, details = {}) {
    throw new ContractError(code, message, { offset: pos, ...details });
  }

  function countToken() {
    tokenCount += 1;
    if (tokenCount > limits.maxTokens) {
      fail('json_limit_exceeded', 'JSON token count exceeds the limit', {
        reason: 'tokens',
        limit: limits.maxTokens,
      });
    }
  }

  function skipWhitespace() {
    while (pos < text.length) {
      const ch = text.charCodeAt(pos);
      if (ch === 0x20 || ch === 0x09 || ch === 0x0a || ch === 0x0d) pos += 1;
      else break;
    }
  }

  function parseValue(depth) {
    if (depth > limits.maxDepth) {
      fail('json_limit_exceeded', 'JSON depth exceeds the limit', {
        reason: 'depth',
        limit: limits.maxDepth,
      });
    }
    skipWhitespace();
    if (pos >= text.length) fail('malformed_json', 'Unexpected end of JSON input');
    const ch = text.charCodeAt(pos);
    if (ch === 123) return parseObject(depth);
    if (ch === 91) return parseArray(depth);
    if (ch === 34) return parseString();
    if (ch === 116) return parseLiteral('true', true);
    if (ch === 102) return parseLiteral('false', false);
    if (ch === 110) return parseLiteral('null', null);
    if (ch === 45 || (ch >= 48 && ch <= 57)) return parseNumber();
    return fail('malformed_json', 'Unexpected JSON character');
  }

  function parseLiteral(expected, value) {
    countToken();
    if (!text.startsWith(expected, pos)) fail('malformed_json', 'Invalid JSON literal');
    pos += expected.length;
    return value;
  }

  function parseString() {
    countToken();
    if (text.charCodeAt(pos) !== 34) fail('malformed_json', 'Expected string quote');
    pos += 1;
    let result = '';
    let codePoints = 0;
    function append(chunk) {
      codePoints += 1;
      if (codePoints > limits.maxStringCodePoints) {
        fail('json_limit_exceeded', 'Decoded string length exceeds the limit', {
          reason: 'string_code_points',
          limit: limits.maxStringCodePoints,
        });
      }
      result += chunk;
    }

    while (pos < text.length) {
      const ch = text.charCodeAt(pos);
      if (ch === 34) {
        pos += 1;
        return result;
      }
      if (ch === 92) {
        pos += 1;
        if (pos >= text.length) fail('malformed_json', 'Unterminated escape sequence');
        const escaped = text.charCodeAt(pos);
        pos += 1;
        switch (escaped) {
          case 34: append('"'); break;
          case 92: append('\\'); break;
          case 47: append('/'); break;
          case 98: append('\b'); break;
          case 102: append('\f'); break;
          case 110: append('\n'); break;
          case 114: append('\r'); break;
          case 116: append('\t'); break;
          case 117: {
            if (pos + 4 > text.length) fail('malformed_json', 'Invalid Unicode escape');
            const hex = text.slice(pos, pos + 4);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('malformed_json', 'Invalid Unicode escape');
            pos += 4;
            const codeUnit = Number.parseInt(hex, 16);
            if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
              if (pos + 6 <= text.length && text.slice(pos, pos + 2) === '\\u') {
                const lowHex = text.slice(pos + 2, pos + 6);
                if (/^[0-9a-fA-F]{4}$/.test(lowHex)) {
                  const low = Number.parseInt(lowHex, 16);
                  if (low >= 0xdc00 && low <= 0xdfff) {
                    pos += 6;
                    append(String.fromCodePoint(0x10000 + ((codeUnit - 0xd800) << 10) + (low - 0xdc00)));
                    break;
                  }
                }
              }
              fail('malformed_json', 'Escaped lone high surrogate');
            }
            if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
              fail('malformed_json', 'Escaped lone low surrogate');
            }
            append(String.fromCharCode(codeUnit));
            break;
          }
          default:
            fail('malformed_json', 'Invalid escape character');
        }
      } else if (ch < 0x20) {
        fail('malformed_json', 'Unescaped control character in string');
      } else if (ch >= 0xd800 && ch <= 0xdbff) {
        const low = text.charCodeAt(pos + 1);
        if (!(low >= 0xdc00 && low <= 0xdfff)) fail('malformed_json', 'Lone high surrogate');
        append(text.slice(pos, pos + 2));
        pos += 2;
      } else if (ch >= 0xdc00 && ch <= 0xdfff) {
        fail('malformed_json', 'Lone low surrogate');
      } else {
        append(text[pos]);
        pos += 1;
      }
    }
    return fail('malformed_json', 'Unterminated string literal');
  }

  function parseNumber() {
    countToken();
    let negative = false;
    if (text.charCodeAt(pos) === 45) {
      negative = true;
      pos += 1;
    }
    if (pos >= text.length) fail('malformed_json', 'Invalid number literal');

    const integerStart = pos;
    if (text.charCodeAt(pos) === 48) {
      pos += 1;
      if (pos < text.length && text.charCodeAt(pos) >= 48 && text.charCodeAt(pos) <= 57) {
        fail('malformed_json', 'Leading zero in number');
      }
    } else if (text.charCodeAt(pos) >= 49 && text.charCodeAt(pos) <= 57) {
      while (pos < text.length && text.charCodeAt(pos) >= 48 && text.charCodeAt(pos) <= 57) pos += 1;
    } else {
      fail('malformed_json', 'Invalid number format');
    }
    const integerDigits = text.slice(integerStart, pos);

    let fractionDigits = '';
    if (pos < text.length && text.charCodeAt(pos) === 46) {
      pos += 1;
      const fractionStart = pos;
      while (pos < text.length && text.charCodeAt(pos) >= 48 && text.charCodeAt(pos) <= 57) pos += 1;
      if (pos === fractionStart) fail('malformed_json', 'Invalid number fraction');
      fractionDigits = text.slice(fractionStart, pos);
    }

    let exponentSign = 1;
    let exponentDigits = '';
    if (pos < text.length && (text.charCodeAt(pos) === 101 || text.charCodeAt(pos) === 69)) {
      pos += 1;
      if (pos < text.length && (text.charCodeAt(pos) === 43 || text.charCodeAt(pos) === 45)) {
        if (text.charCodeAt(pos) === 45) exponentSign = -1;
        pos += 1;
      }
      const exponentStart = pos;
      while (pos < text.length && text.charCodeAt(pos) >= 48 && text.charCodeAt(pos) <= 57) pos += 1;
      if (pos === exponentStart) fail('malformed_json', 'Invalid number exponent');
      exponentDigits = text.slice(exponentStart, pos);
    }

    const allDigits = integerDigits + fractionDigits;
    if (allDigits.length > limits.maxNumberDigits) {
      fail('json_limit_exceeded', 'Number digit count exceeds the limit', {
        reason: 'number_digits',
        limit: limits.maxNumberDigits,
      });
    }

    let exponentMagnitude = 0;
    if (exponentDigits !== '') {
      const significant = exponentDigits.replace(/^0+/, '') || '0';
      const limitText = String(limits.maxExponentMagnitude);
      if (significant.length > limitText.length ||
          (significant.length === limitText.length && significant > limitText)) {
        fail('json_limit_exceeded', 'Number exponent exceeds the limit', {
          reason: 'exponent',
          limit: limits.maxExponentMagnitude,
        });
      }
      exponentMagnitude = Number(significant);
    }

    const effectiveExponent = exponentMagnitude * exponentSign - fractionDigits.length;
    if (Math.abs(effectiveExponent) > limits.maxExponentMagnitude) {
      fail('json_limit_exceeded', 'Effective number exponent exceeds the limit', {
        reason: 'exponent',
        limit: limits.maxExponentMagnitude,
      });
    }

    let exactInteger = BigInt(allDigits);
    if (effectiveExponent >= 0) {
      exactInteger *= 10n ** BigInt(effectiveExponent);
    } else {
      const divisor = 10n ** BigInt(-effectiveExponent);
      if (exactInteger % divisor !== 0n) {
        fail('unsafe_json_number', 'Only exact integer JSON numbers are supported');
      }
      exactInteger /= divisor;
    }
    if (negative) exactInteger = -exactInteger;
    if (exactInteger < BigInt(Number.MIN_SAFE_INTEGER) || exactInteger > BigInt(Number.MAX_SAFE_INTEGER)) {
      fail('unsafe_json_number', 'JSON number exceeds the safe-integer range');
    }
    return Number(exactInteger);
  }

  function parseObject(depth) {
    countToken();
    pos += 1;
    const object = createRecord();
    const keys = new Set();
    let memberCount = 0;
    skipWhitespace();
    if (pos < text.length && text.charCodeAt(pos) === 125) {
      countToken();
      pos += 1;
      return object;
    }
    while (pos < text.length) {
      skipWhitespace();
      if (pos >= text.length || text.charCodeAt(pos) !== 34) {
        fail('malformed_json', 'Expected object member name');
      }
      const key = parseString();
      if (keys.has(key)) {
        fail('duplicate_json_member', 'Duplicate object member name', { member: key });
      }
      keys.add(key);
      memberCount += 1;
      if (memberCount > limits.maxObjectMembers) {
        fail('json_limit_exceeded', 'Object member count exceeds the limit', {
          reason: 'object_members',
          limit: limits.maxObjectMembers,
        });
      }
      skipWhitespace();
      if (pos >= text.length || text.charCodeAt(pos) !== 58) {
        fail('malformed_json', 'Expected colon after object member name');
      }
      countToken();
      pos += 1;
      object[key] = parseValue(depth + 1);
      skipWhitespace();
      if (pos >= text.length) fail('malformed_json', 'Unexpected end of object');
      const next = text.charCodeAt(pos);
      if (next === 125) {
        countToken();
        pos += 1;
        return object;
      }
      if (next !== 44) fail('malformed_json', 'Expected object delimiter');
      countToken();
      pos += 1;
    }
    return fail('malformed_json', 'Unterminated object literal');
  }

  function parseArray(depth) {
    countToken();
    pos += 1;
    const array = [];
    skipWhitespace();
    if (pos < text.length && text.charCodeAt(pos) === 93) {
      countToken();
      pos += 1;
      return array;
    }
    while (pos < text.length) {
      if (array.length >= limits.maxArrayItems) {
        fail('json_limit_exceeded', 'Array item count exceeds the limit', {
          reason: 'array_items',
          limit: limits.maxArrayItems,
        });
      }
      array.push(parseValue(depth + 1));
      skipWhitespace();
      if (pos >= text.length) fail('malformed_json', 'Unexpected end of array');
      const next = text.charCodeAt(pos);
      if (next === 93) {
        countToken();
        pos += 1;
        return array;
      }
      if (next !== 44) fail('malformed_json', 'Expected array delimiter');
      countToken();
      pos += 1;
    }
    return fail('malformed_json', 'Unterminated array literal');
  }

  const value = parseValue(1);
  skipWhitespace();
  if (pos !== text.length) fail('malformed_json', 'Unexpected trailing JSON content');
  return value;
}

export function assertDigest(value, label = 'digest') {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new ContractError('invalid_digest', `${label} must be a sha256 digest`);
  }
  return value;
}

export function assertIdentifier(value, label = 'identifier') {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    throw new ContractError('invalid_identifier', `${label} is invalid: ${String(value)}`);
  }
  return value;
}

export function assertSafeInteger(value, label, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ContractError('invalid_integer', `${label} must be a safe integer between ${min} and ${max}`);
  }
  return value;
}
