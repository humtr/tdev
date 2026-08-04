import { createHash } from "node:crypto";

export type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<CanonicalJson>
  | Readonly<Record<string, CanonicalJson>>;

const maxSafeInteger = 9_007_199_254_740_991;

function assertScalarString(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new TypeError("canonical JSON rejects an unpaired high surrogate");
      }
      index += 1;
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      throw new TypeError("canonical JSON rejects an unpaired low surrogate");
    }
  }
}

function quote(value: string): string {
  assertScalarString(value);
  return JSON.stringify(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function canonicalize(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || Math.abs(value) > maxSafeInteger) {
      throw new TypeError("M0 canonical JSON accepts only safe integers");
    }
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (typeof value === "string") {
    return quote(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  if (isPlainRecord(value)) {
    const keys = Object.keys(value).sort();
    const fields: string[] = [];
    for (const key of keys) {
      const item = value[key];
      if (item === undefined) {
        throw new TypeError(`canonical JSON rejects undefined at ${key}`);
      }
      fields.push(`${quote(key)}:${canonicalize(item)}`);
    }
    return `{${fields.join(",")}}`;
  }
  throw new TypeError(`unsupported canonical JSON value: ${typeof value}`);
}

export function typedDigest(domain: string, value: unknown): string {
  if (domain.length === 0 || domain.includes("\0")) {
    throw new TypeError("digest domain must be non-empty and contain no NUL");
  }
  return createHash("sha256")
    .update(domain, "utf8")
    .update(Buffer.from([0]))
    .update(canonicalize(value), "utf8")
    .digest("hex");
}
