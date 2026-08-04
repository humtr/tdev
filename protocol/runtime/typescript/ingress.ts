export type IngressErrorCode =
  | "PAYLOAD_TOO_LARGE"
  | "INVALID_UTF8"
  | "MALFORMED_JSON"
  | "DUPLICATE_JSON_MEMBER"
  | "JSON_LIMIT_EXCEEDED"
  | "UNSAFE_JSON_NUMBER";

export class IngressError extends Error {
  readonly code: IngressErrorCode;

  constructor(code: IngressErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.code = code;
    Object.setPrototypeOf(this, IngressError.prototype);
  }
}

const MAX_BODY_BYTES = 1048576;
const MAX_DEPTH = 64;
const MAX_TOKENS = 100000;
const MAX_MEMBERS = 4096;
const MAX_ITEMS = 10000;
const MIN_SAFE_INT = -9007199254740991;
const MAX_SAFE_INT = 9007199254740991;

export function parseRawIngress(rawBytes: Uint8Array): unknown {
  if (rawBytes.length > MAX_BODY_BYTES) {
    throw new IngressError("PAYLOAD_TOO_LARGE", `body length ${rawBytes.length} exceeds max ${MAX_BODY_BYTES}`);
  }

  let text: string;
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    text = decoder.decode(rawBytes);
  } catch {
    throw new IngressError("INVALID_UTF8", "raw request body is not valid UTF-8");
  }

  let pos = 0;
  let tokenCount = 0;

  function countToken(): void {
    tokenCount++;
    if (tokenCount > MAX_TOKENS) {
      throw new IngressError("JSON_LIMIT_EXCEEDED", `token count exceeds maximum ${MAX_TOKENS}`);
    }
  }

  function skipWhitespace(): void {
    while (pos < text.length) {
      const ch = text.charCodeAt(pos);
      if (ch === 0x20 || ch === 0x09 || ch === 0x0a || ch === 0x0d) {
        pos++;
      } else {
        break;
      }
    }
  }

  function parseValue(depth: number): unknown {
    if (depth > MAX_DEPTH) {
      throw new IngressError("JSON_LIMIT_EXCEEDED", `nesting depth exceeds maximum ${MAX_DEPTH}`);
    }
    skipWhitespace();
    if (pos >= text.length) {
      throw new IngressError("MALFORMED_JSON", "unexpected end of JSON input");
    }

    const ch = text.charCodeAt(pos);
    if (ch === 123 /* { */) {
      return parseObject(depth);
    } else if (ch === 91 /* [ */) {
      return parseArray(depth);
    } else if (ch === 34 /* " */) {
      return parseString();
    } else if (ch === 116 /* t */) {
      return parseLiteral("true", true);
    } else if (ch === 102 /* f */) {
      return parseLiteral("false", false);
    } else if (ch === 110 /* n */) {
      return parseLiteral("null", null);
    } else if (ch === 45 /* - */ || (ch >= 48 && ch <= 57)) {
      return parseNumber();
    } else {
      throw new IngressError("MALFORMED_JSON", "unexpected character");
    }
  }

  function parseLiteral(expected: string, value: unknown): unknown {
    countToken();
    if (text.startsWith(expected, pos)) {
      pos += expected.length;
      return value;
    }
    throw new IngressError("MALFORMED_JSON", "invalid literal");
  }

  function parseString(): string {
    countToken();
    if (text.charCodeAt(pos) !== 34) {
      throw new IngressError("MALFORMED_JSON", "expected string quote");
    }
    pos++;
    let result = "";
    while (pos < text.length) {
      const ch = text.charCodeAt(pos);
      if (ch === 34 /* " */) {
        pos++;
        return result;
      }
      if (ch === 92 /* \ */) {
        pos++;
        if (pos >= text.length) {
          throw new IngressError("MALFORMED_JSON", "unterminated escape sequence");
        }
        const esc = text.charCodeAt(pos);
        pos++;
        switch (esc) {
          case 34: result += '"'; break;
          case 92: result += '\\'; break;
          case 47: result += '/'; break;
          case 98: result += '\b'; break;
          case 102: result += '\f'; break;
          case 110: result += '\n'; break;
          case 114: result += '\r'; break;
          case 116: result += '\t'; break;
          case 117: { // \uXXXX
            if (pos + 4 > text.length) {
              throw new IngressError("MALFORMED_JSON", "invalid hex escape sequence");
            }
            const hex = text.slice(pos, pos + 4);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
              throw new IngressError("MALFORMED_JSON", "invalid hex code");
            }
            pos += 4;
            const codeUnit = parseInt(hex, 16);
            if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
              if (pos + 6 <= text.length && text.slice(pos, pos + 2) === "\\u") {
                const lowHex = text.slice(pos + 2, pos + 6);
                if (/^[0-9a-fA-F]{4}$/.test(lowHex)) {
                  const lowUnit = parseInt(lowHex, 16);
                  if (lowUnit >= 0xdc00 && lowUnit <= 0xdfff) {
                    pos += 6;
                    const cp = 0x10000 + ((codeUnit - 0xd800) << 10) + (lowUnit - 0xdc00);
                    result += String.fromCodePoint(cp);
                    break;
                  }
                }
              }
              throw new IngressError("MALFORMED_JSON", "escaped lone high surrogate");
            }
            if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
              throw new IngressError("MALFORMED_JSON", "escaped lone low surrogate");
            }
            result += String.fromCharCode(codeUnit);
            break;
          }
          default:
            throw new IngressError("MALFORMED_JSON", "invalid escape character");
        }
      } else if (ch < 0x20) {
        throw new IngressError("MALFORMED_JSON", "unescaped control character in string");
      } else {
        result += text[pos];
        pos++;
      }
    }
    throw new IngressError("MALFORMED_JSON", "unterminated string literal");
  }

  function parseNumber(): number {
    countToken();
    const start = pos;
    let isNeg = false;
    if (text.charCodeAt(pos) === 45 /* - */) {
      isNeg = true;
      pos++;
    }
    if (pos >= text.length) throw new IngressError("MALFORMED_JSON", "invalid number literal");

    const intStart = pos;
    if (text.charCodeAt(pos) === 48 /* 0 */) {
      pos++;
    } else if (text.charCodeAt(pos) >= 49 && text.charCodeAt(pos) <= 57) {
      while (pos < text.length && text.charCodeAt(pos) >= 48 && text.charCodeAt(pos) <= 57) {
        pos++;
      }
    } else {
      throw new IngressError("MALFORMED_JSON", "invalid number format");
    }
    const intDigits = text.slice(intStart, pos);

    let fracDigits = "";
    if (pos < text.length && text.charCodeAt(pos) === 46 /* . */) {
      pos++;
      const fracStart = pos;
      while (pos < text.length && text.charCodeAt(pos) >= 48 && text.charCodeAt(pos) <= 57) {
        pos++;
      }
      if (pos === fracStart) throw new IngressError("MALFORMED_JSON", "invalid number fraction");
      fracDigits = text.slice(fracStart, pos);
    }

    let expSign = 1;
    let expDigits = "";
    if (pos < text.length && (text.charCodeAt(pos) === 101 || text.charCodeAt(pos) === 69) /* e E */) {
      pos++;
      if (pos < text.length && (text.charCodeAt(pos) === 43 || text.charCodeAt(pos) === 45)) {
        if (text.charCodeAt(pos) === 45) expSign = -1;
        pos++;
      }
      const expStart = pos;
      while (pos < text.length && text.charCodeAt(pos) >= 48 && text.charCodeAt(pos) <= 57) {
        pos++;
      }
      if (pos === expStart) throw new IngressError("MALFORMED_JSON", "invalid number exponent");
      expDigits = text.slice(expStart, pos);
    }

    const expVal = expDigits === "" ? 0n : BigInt(expDigits) * BigInt(expSign);
    const digitsStr = intDigits + fracDigits;
    const effectiveExp = expVal - BigInt(fracDigits.length);

    let exactInt: bigint;
    if (effectiveExp >= 0n) {
      exactInt = BigInt(digitsStr) * (10n ** effectiveExp);
    } else {
      const k = -effectiveExp;
      const divisor = 10n ** k;
      const num = BigInt(digitsStr);
      if (num % divisor !== 0n) {
        throw new IngressError("UNSAFE_JSON_NUMBER", "number is not an integer");
      }
      exactInt = num / divisor;
    }

    if (isNeg) {
      exactInt = -exactInt;
    }

    const minSafe = BigInt(MIN_SAFE_INT);
    const maxSafe = BigInt(MAX_SAFE_INT);
    if (exactInt < minSafe || exactInt > maxSafe) {
      throw new IngressError("UNSAFE_JSON_NUMBER", "number exceeds safe integer bounds");
    }

    return Number(exactInt);
  }

  function parseObject(depth: number): Record<string, unknown> {
    countToken();
    pos++;
    const obj: Record<string, unknown> = {};
    const keys = new Set<string>();
    let memberCount = 0;

    skipWhitespace();
    if (pos < text.length && text.charCodeAt(pos) === 125 /* } */) {
      countToken();
      pos++;
      return obj;
    }

    while (pos < text.length) {
      skipWhitespace();
      if (text.charCodeAt(pos) !== 34 /* " */) {
        throw new IngressError("MALFORMED_JSON", "expected member name string");
      }
      const key = parseString();
      if (keys.has(key)) {
        throw new IngressError("DUPLICATE_JSON_MEMBER", "duplicate object member name");
      }
      keys.add(key);
      memberCount++;
      if (memberCount > MAX_MEMBERS) {
        throw new IngressError("JSON_LIMIT_EXCEEDED", `object member count exceeds maximum ${MAX_MEMBERS}`);
      }

      skipWhitespace();
      if (pos >= text.length || text.charCodeAt(pos) !== 58 /* : */) {
        throw new IngressError("MALFORMED_JSON", "expected ':' after member name");
      }
      countToken();
      pos++;

      const val = parseValue(depth + 1);
      obj[key] = val;

      skipWhitespace();
      if (pos >= text.length) {
        throw new IngressError("MALFORMED_JSON", "unexpected end of object");
      }
      const nextChar = text.charCodeAt(pos);
      if (nextChar === 125 /* } */) {
        countToken();
        pos++;
        return obj;
      }
      if (nextChar === 44 /* , */) {
        countToken();
        pos++;
      } else {
        throw new IngressError("MALFORMED_JSON", "expected ',' or '}'");
      }
    }
    throw new IngressError("MALFORMED_JSON", "unterminated object literal");
  }

  function parseArray(depth: number): unknown[] {
    countToken();
    pos++;
    const arr: unknown[] = [];

    skipWhitespace();
    if (pos < text.length && text.charCodeAt(pos) === 93 /* ] */) {
      countToken();
      pos++;
      return arr;
    }

    while (pos < text.length) {
      if (arr.length >= MAX_ITEMS) {
        throw new IngressError("JSON_LIMIT_EXCEEDED", `array item count exceeds maximum ${MAX_ITEMS}`);
      }
      const val = parseValue(depth + 1);
      arr.push(val);

      skipWhitespace();
      if (pos >= text.length) {
        throw new IngressError("MALFORMED_JSON", "unexpected end of array");
      }
      const nextChar = text.charCodeAt(pos);
      if (nextChar === 93 /* ] */) {
        countToken();
        pos++;
        return arr;
      }
      if (nextChar === 44 /* , */) {
        countToken();
        pos++;
      } else {
        throw new IngressError("MALFORMED_JSON", "expected ',' or ']'");
      }
    }
    throw new IngressError("MALFORMED_JSON", "unterminated array literal");
  }

  const rootValue = parseValue(1);
  skipWhitespace();
  if (pos < text.length) {
    throw new IngressError("MALFORMED_JSON", "unexpected trailing content");
  }
  return rootValue;
}
