import { M1_RELEASE_PROFILE, type ReleaseProfile } from "./profile.ts";

export type IngressErrorCode =
  | "PAYLOAD_TOO_LARGE"
  | "INVALID_UTF8"
  | "MALFORMED_JSON"
  | "DUPLICATE_JSON_MEMBER"
  | "JSON_LIMIT_EXCEEDED"
  | "UNSAFE_JSON_NUMBER"
  | "INPUT_SCHEMA_INVALID"
  | "ONE_OF_NO_MATCH"
  | "ONE_OF_MULTIPLE_MATCH"
  | "ROOT_DEFINITION_MISMATCH"
  | "UNION_DISCRIMINATOR_MISMATCH";

export type ProtocolErrorReason =
  | "BODY_BYTES"
  | "UTF8"
  | "JSON_GRAMMAR"
  | "TRAILING_VALUE"
  | "DUPLICATE_MEMBER"
  | "DEPTH"
  | "TOKEN_COUNT"
  | "OBJECT_MEMBERS"
  | "ARRAY_ITEMS"
  | "STRING_LENGTH"
  | "NUMBER_DIGITS"
  | "EXPONENT_MAGNITUDE"
  | "SAFE_INTEGER"
  | "SCHEMA"
  | "ONE_OF_NO_MATCH"
  | "ONE_OF_MULTIPLE_MATCH"
  | "ROOT_DEFINITION"
  | "UNION_DISCRIMINATOR";


export type ProtocolErrorDetail = Readonly<{
  code: IngressErrorCode;
  reason: ProtocolErrorReason;
  instancePointer?: string;
  limit?: number;
}>;

export class IngressError extends Error {
  readonly code: IngressErrorCode;
  readonly reason: ProtocolErrorReason;

  constructor(code: IngressErrorCode, reason: ProtocolErrorReason, message: string) {
    super(`${code}/${reason}: ${message}`);
    this.code = code;
    this.reason = reason;
    Object.setPrototypeOf(this, IngressError.prototype);
  }
}

const MIN_SAFE_INT = -9007199254740991;
const MAX_SAFE_INT = 9007199254740991;

function parseWithProfile(rawBytes: Uint8Array, profile: ReleaseProfile): unknown {
  const limits = profile.ingress;
  if (rawBytes.length > limits.maxBodyBytes) {
    throw new IngressError("PAYLOAD_TOO_LARGE", "BODY_BYTES", "request body exceeds the configured release limit");
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(rawBytes);
  } catch {
    throw new IngressError("INVALID_UTF8", "UTF8", "raw request body is not valid UTF-8");
  }

  let pos = 0;
  let tokenCount = 0;

  function failure(code: IngressErrorCode, reason: ProtocolErrorReason, message: string): never {
    throw new IngressError(code, reason, message);
  }

  function countToken(): void {
    tokenCount++;
    if (tokenCount > limits.maxJsonTokens) {
      failure("JSON_LIMIT_EXCEEDED", "TOKEN_COUNT", "JSON token count exceeds the configured release limit");
    }
  }

  function skipWhitespace(): void {
    while (pos < text.length) {
      const ch = text.charCodeAt(pos);
      if (ch === 0x20 || ch === 0x09 || ch === 0x0a || ch === 0x0d) pos++;
      else break;
    }
  }

  function parseValue(depth: number): unknown {
    if (depth > limits.maxJsonDepth) {
      failure("JSON_LIMIT_EXCEEDED", "DEPTH", "JSON nesting depth exceeds the configured release limit");
    }
    skipWhitespace();
    if (pos >= text.length) failure("MALFORMED_JSON", "JSON_GRAMMAR", "unexpected end of JSON input");
    const ch = text.charCodeAt(pos);
    if (ch === 123) return parseObject(depth);
    if (ch === 91) return parseArray(depth);
    if (ch === 34) return parseString();
    if (ch === 116) return parseLiteral("true", true);
    if (ch === 102) return parseLiteral("false", false);
    if (ch === 110) return parseLiteral("null", null);
    if (ch === 45 || (ch >= 48 && ch <= 57)) return parseNumber();
    return failure("MALFORMED_JSON", "JSON_GRAMMAR", "unexpected JSON character");
  }

  function parseLiteral(expected: string, value: unknown): unknown {
    countToken();
    if (!text.startsWith(expected, pos)) failure("MALFORMED_JSON", "JSON_GRAMMAR", "invalid JSON literal");
    pos += expected.length;
    return value;
  }

  function parseString(): string {
    countToken();
    if (text.charCodeAt(pos) !== 34) failure("MALFORMED_JSON", "JSON_GRAMMAR", "expected string quote");
    pos++;
    let result = "";
    let codePoints = 0;
    const append = (chunk: string): void => {
      codePoints++;
      if (codePoints > limits.maxStringCodePoints) {
        failure("JSON_LIMIT_EXCEEDED", "STRING_LENGTH", "decoded string length exceeds the configured release limit");
      }
      result += chunk;
    };

    while (pos < text.length) {
      const ch = text.charCodeAt(pos);
      if (ch === 34) {
        pos++;
        return result;
      }
      if (ch === 92) {
        pos++;
        if (pos >= text.length) failure("MALFORMED_JSON", "JSON_GRAMMAR", "unterminated escape sequence");
        const esc = text.charCodeAt(pos++);
        switch (esc) {
          case 34: append('"'); break;
          case 92: append('\\'); break;
          case 47: append('/'); break;
          case 98: append('\b'); break;
          case 102: append('\f'); break;
          case 110: append('\n'); break;
          case 114: append('\r'); break;
          case 116: append('\t'); break;
          case 117: {
            if (pos + 4 > text.length) failure("MALFORMED_JSON", "JSON_GRAMMAR", "invalid Unicode escape");
            const hex = text.slice(pos, pos + 4);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) failure("MALFORMED_JSON", "JSON_GRAMMAR", "invalid Unicode escape");
            pos += 4;
            const codeUnit = parseInt(hex, 16);
            if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
              if (pos + 6 <= text.length && text.slice(pos, pos + 2) === "\\u") {
                const lowHex = text.slice(pos + 2, pos + 6);
                if (/^[0-9a-fA-F]{4}$/.test(lowHex)) {
                  const lowUnit = parseInt(lowHex, 16);
                  if (lowUnit >= 0xdc00 && lowUnit <= 0xdfff) {
                    pos += 6;
                    append(String.fromCodePoint(0x10000 + ((codeUnit - 0xd800) << 10) + (lowUnit - 0xdc00)));
                    break;
                  }
                }
              }
              failure("MALFORMED_JSON", "JSON_GRAMMAR", "escaped lone high surrogate");
            }
            if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
              failure("MALFORMED_JSON", "JSON_GRAMMAR", "escaped lone low surrogate");
            }
            append(String.fromCharCode(codeUnit));
            break;
          }
          default: failure("MALFORMED_JSON", "JSON_GRAMMAR", "invalid escape character");
        }
      } else if (ch < 0x20) {
        failure("MALFORMED_JSON", "JSON_GRAMMAR", "unescaped control character in string");
      } else if (ch >= 0xd800 && ch <= 0xdbff) {
        const low = text.charCodeAt(pos + 1);
        if (!(low >= 0xdc00 && low <= 0xdfff)) failure("MALFORMED_JSON", "JSON_GRAMMAR", "lone high surrogate");
        append(text.slice(pos, pos + 2));
        pos += 2;
      } else if (ch >= 0xdc00 && ch <= 0xdfff) {
        failure("MALFORMED_JSON", "JSON_GRAMMAR", "lone low surrogate");
      } else {
        append(text[pos]);
        pos++;
      }
    }
    return failure("MALFORMED_JSON", "JSON_GRAMMAR", "unterminated string literal");
  }

  function parseNumber(): number {
    countToken();
    let isNeg = false;
    if (text.charCodeAt(pos) === 45) {
      isNeg = true;
      pos++;
    }
    if (pos >= text.length) failure("MALFORMED_JSON", "JSON_GRAMMAR", "invalid number literal");

    const intStart = pos;
    if (text.charCodeAt(pos) === 48) pos++;
    else if (text.charCodeAt(pos) >= 49 && text.charCodeAt(pos) <= 57) {
      while (pos < text.length && text.charCodeAt(pos) >= 48 && text.charCodeAt(pos) <= 57) pos++;
    } else failure("MALFORMED_JSON", "JSON_GRAMMAR", "invalid number format");
    const intDigits = text.slice(intStart, pos);

    let fracDigits = "";
    if (pos < text.length && text.charCodeAt(pos) === 46) {
      pos++;
      const fracStart = pos;
      while (pos < text.length && text.charCodeAt(pos) >= 48 && text.charCodeAt(pos) <= 57) pos++;
      if (pos === fracStart) failure("MALFORMED_JSON", "JSON_GRAMMAR", "invalid number fraction");
      fracDigits = text.slice(fracStart, pos);
    }

    let expSign = 1;
    let expDigits = "";
    if (pos < text.length && (text.charCodeAt(pos) === 101 || text.charCodeAt(pos) === 69)) {
      pos++;
      if (pos < text.length && (text.charCodeAt(pos) === 43 || text.charCodeAt(pos) === 45)) {
        if (text.charCodeAt(pos) === 45) expSign = -1;
        pos++;
      }
      const expStart = pos;
      while (pos < text.length && text.charCodeAt(pos) >= 48 && text.charCodeAt(pos) <= 57) pos++;
      if (pos === expStart) failure("MALFORMED_JSON", "JSON_GRAMMAR", "invalid number exponent");
      expDigits = text.slice(expStart, pos);
    }

    const digitsStr = intDigits + fracDigits;
    if (digitsStr.length > limits.maxNumberDigits) {
      failure("JSON_LIMIT_EXCEEDED", "NUMBER_DIGITS", "number digit count exceeds the configured release limit");
    }

    let expMagnitude = 0;
    if (expDigits !== "") {
      const significant = expDigits.replace(/^0+/, "") || "0";
      const maxText = String(limits.maxExponentMagnitude);
      if (significant.length > maxText.length || (significant.length === maxText.length && significant > maxText)) {
        failure("JSON_LIMIT_EXCEEDED", "EXPONENT_MAGNITUDE", "number exponent exceeds the configured release limit");
      }
      expMagnitude = Number(significant);
    }
    const expVal = expMagnitude * expSign;
    const effectiveExp = expVal - fracDigits.length;
    if (Math.abs(effectiveExp) > limits.maxExponentMagnitude) {
      failure("JSON_LIMIT_EXCEEDED", "EXPONENT_MAGNITUDE", "effective number exponent exceeds the configured release limit");
    }

    const digits = BigInt(digitsStr);
    let exactInt: bigint;
    if (effectiveExp >= 0) exactInt = digits * (10n ** BigInt(effectiveExp));
    else {
      const divisor = 10n ** BigInt(-effectiveExp);
      if (digits % divisor !== 0n) failure("UNSAFE_JSON_NUMBER", "SAFE_INTEGER", "number is not an integer");
      exactInt = digits / divisor;
    }
    if (isNeg) exactInt = -exactInt;
    if (exactInt < BigInt(MIN_SAFE_INT) || exactInt > BigInt(MAX_SAFE_INT)) {
      failure("UNSAFE_JSON_NUMBER", "SAFE_INTEGER", "number exceeds the protocol safe-integer range");
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
    if (pos < text.length && text.charCodeAt(pos) === 125) {
      countToken();
      pos++;
      return obj;
    }
    while (pos < text.length) {
      skipWhitespace();
      if (pos >= text.length || text.charCodeAt(pos) !== 34) failure("MALFORMED_JSON", "JSON_GRAMMAR", "expected member name string");
      const key = parseString();
      if (keys.has(key)) failure("DUPLICATE_JSON_MEMBER", "DUPLICATE_MEMBER", "duplicate object member name");
      keys.add(key);
      memberCount++;
      if (memberCount > limits.maxObjectMembers) failure("JSON_LIMIT_EXCEEDED", "OBJECT_MEMBERS", "object member count exceeds the configured release limit");
      skipWhitespace();
      if (pos >= text.length || text.charCodeAt(pos) !== 58) failure("MALFORMED_JSON", "JSON_GRAMMAR", "expected colon after member name");
      countToken();
      pos++;
      obj[key] = parseValue(depth + 1);
      skipWhitespace();
      if (pos >= text.length) failure("MALFORMED_JSON", "JSON_GRAMMAR", "unexpected end of object");
      const next = text.charCodeAt(pos);
      if (next === 125) {
        countToken();
        pos++;
        return obj;
      }
      if (next !== 44) failure("MALFORMED_JSON", "JSON_GRAMMAR", "expected object delimiter");
      countToken();
      pos++;
    }
    return failure("MALFORMED_JSON", "JSON_GRAMMAR", "unterminated object literal");
  }

  function parseArray(depth: number): unknown[] {
    countToken();
    pos++;
    const arr: unknown[] = [];
    skipWhitespace();
    if (pos < text.length && text.charCodeAt(pos) === 93) {
      countToken();
      pos++;
      return arr;
    }
    while (pos < text.length) {
      if (arr.length >= limits.maxArrayItems) failure("JSON_LIMIT_EXCEEDED", "ARRAY_ITEMS", "array item count exceeds the configured release limit");
      arr.push(parseValue(depth + 1));
      skipWhitespace();
      if (pos >= text.length) failure("MALFORMED_JSON", "JSON_GRAMMAR", "unexpected end of array");
      const next = text.charCodeAt(pos);
      if (next === 93) {
        countToken();
        pos++;
        return arr;
      }
      if (next !== 44) failure("MALFORMED_JSON", "JSON_GRAMMAR", "expected array delimiter");
      countToken();
      pos++;
    }
    return failure("MALFORMED_JSON", "JSON_GRAMMAR", "unterminated array literal");
  }

  const rootValue = parseValue(1);
  skipWhitespace();
  if (pos < text.length) failure("MALFORMED_JSON", "TRAILING_VALUE", "unexpected trailing JSON content");
  return rootValue;
}

export function parseRawIngress(rawBytes: Uint8Array): unknown {
  return parseWithProfile(rawBytes, M1_RELEASE_PROFILE);
}
