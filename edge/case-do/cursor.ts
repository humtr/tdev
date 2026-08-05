import { createHmac, timingSafeEqual } from "node:crypto";
import type { Sha256 } from "../../protocol/generated/typescript/types.ts";
import {
  M1_RELEASE_PROFILE,
  M1_RELEASE_PROFILE_DIGEST,
} from "../../protocol/runtime/typescript/profile.ts";
import { decodeCanonicalJson, encodeCanonicalJson } from "./records.ts";
import { StorageError } from "./schema.ts";

export type CursorCapability = "list_operations" | "list_resources" | "render_task";

export type CursorSnapshotV1 = Readonly<{
  caseRevision?: number;
  taskRevision?: number;
  eventSequence: number;
}>;

export type CursorPayloadV1 = Readonly<{
  schemaVersion: 1;
  capability: CursorCapability;
  queryDigest: Sha256;
  principalBindingDigest: Sha256;
  releaseProfileDigest: Sha256;
  caseId?: string;
  taskId?: string;
  snapshot: CursorSnapshotV1;
  lastStableKey: readonly [string, string];
  limit: number;
  issuedAt: string;
  expiresAt: string;
}>;

export type CursorKey = Readonly<{
  generation: number;
  key: Uint8Array;
}>;

export type CursorKeyRing = Readonly<{
  current: CursorKey;
  previous?: CursorKey;
}>;

export type IssueCursorInput = Readonly<{
  capability: CursorCapability;
  queryDigest: Sha256;
  principalBindingDigest: Sha256;
  caseId?: string;
  taskId?: string;
  snapshot: CursorSnapshotV1;
  lastStableKey: readonly [string, string];
  limit: number;
  issuedAt: string;
}>;

export type VerifyCursorInput = Readonly<{
  capability: CursorCapability;
  queryDigest: Sha256;
  principalBindingDigest: Sha256;
  caseId?: string;
  taskId?: string;
  snapshot?: CursorSnapshotV1;
  limit?: number;
  now: string;
}>;

const DIGEST = /^[0-9a-f]{64}$/;
const GENERATION = /^[1-9][0-9]*$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const textEncoder = new TextEncoder();

function invalid(): never {
  throw new StorageError("STORAGE_INPUT_INVALID", "INVALID_CURSOR", "cursor is invalid");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): void {
  const allowed = new Set([...required, ...optional]);
  if (Object.keys(value).some((key) => !allowed.has(key))) invalid();
  if (required.some((key) => !Object.hasOwn(value, key))) invalid();
}

function safePositive(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function safeNonnegative(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function maximumLimit(capability: CursorCapability): number {
  return capability === "render_task"
    ? M1_RELEASE_PROFILE.output.maxRenderedTextBytes
    : M1_RELEASE_PROFILE.pagination.maxPageSize;
}

function canonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) return false;
  const canonical = new Date(millis).toISOString();
  return canonical === value || (canonical.endsWith(".000Z") && canonical.slice(0, -5) + "Z" === value);
}

function validateSnapshot(value: unknown): CursorSnapshotV1 {
  if (!isRecord(value)) invalid();
  exactKeys(value, ["eventSequence"], ["caseRevision", "taskRevision"]);
  if (!safeNonnegative(value.eventSequence)) invalid();
  if (value.caseRevision !== undefined && !safePositive(value.caseRevision)) invalid();
  if (value.taskRevision !== undefined && !safePositive(value.taskRevision)) invalid();
  return value as CursorSnapshotV1;
}

function validatePayload(value: unknown): CursorPayloadV1 {
  if (!isRecord(value)) invalid();
  exactKeys(
    value,
    [
      "schemaVersion",
      "capability",
      "queryDigest",
      "principalBindingDigest",
      "releaseProfileDigest",
      "snapshot",
      "lastStableKey",
      "limit",
      "issuedAt",
      "expiresAt",
    ],
    ["caseId", "taskId"],
  );
  if (value.schemaVersion !== 1) invalid();
  if (value.capability !== "list_operations" && value.capability !== "list_resources" && value.capability !== "render_task") invalid();
  if (typeof value.queryDigest !== "string" || !DIGEST.test(value.queryDigest)) invalid();
  if (typeof value.principalBindingDigest !== "string" || !DIGEST.test(value.principalBindingDigest)) invalid();
  if (value.releaseProfileDigest !== M1_RELEASE_PROFILE_DIGEST) invalid();
  if (value.caseId !== undefined && (typeof value.caseId !== "string" || value.caseId.length === 0)) invalid();
  if (value.taskId !== undefined && (typeof value.taskId !== "string" || value.taskId.length === 0)) invalid();
  if (!Array.isArray(value.lastStableKey) || value.lastStableKey.length !== 2 || value.lastStableKey.some((part) => typeof part !== "string")) invalid();
  if (!safePositive(value.limit) || value.limit > maximumLimit(value.capability)) invalid();
  if (!canonicalTimestamp(value.issuedAt) || !canonicalTimestamp(value.expiresAt)) invalid();
  const issued = Date.parse(value.issuedAt);
  const expires = Date.parse(value.expiresAt);
  if (expires - issued !== M1_RELEASE_PROFILE.pagination.cursorTtlSeconds * 1000) invalid();
  validateSnapshot(value.snapshot);
  return value as CursorPayloadV1;
}

function validateKey(key: CursorKey): void {
  if (!safePositive(key.generation) || key.key.length === 0) {
    throw new StorageError("STORAGE_INPUT_INVALID", "INVALID_CURSOR_KEY", "cursor key configuration is invalid");
  }
}

function validateKeyRing(ring: CursorKeyRing): void {
  validateKey(ring.current);
  if (ring.previous !== undefined) {
    validateKey(ring.previous);
    if (ring.previous.generation === ring.current.generation) {
      throw new StorageError("STORAGE_INPUT_INVALID", "INVALID_CURSOR_KEY", "cursor key generations must differ");
    }
  }
}

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function decodeBase64url(value: string): Uint8Array {
  if (!BASE64URL.test(value)) invalid();
  let decoded: Buffer;
  try {
    decoded = Buffer.from(value, "base64url");
  } catch {
    invalid();
  }
  if (decoded.length === 0 || base64url(decoded) !== value) invalid();
  return decoded;
}

function macBytes(key: Uint8Array, generation: number, payloadBytes: Uint8Array): Uint8Array {
  const domain = textEncoder.encode(`tdev.cursor.v1\0${generation}\0`);
  return createHmac("sha256", key).update(domain).update(payloadBytes).digest();
}

function constantTimeMacEqual(expected: Uint8Array, actual: Uint8Array): boolean {
  if (expected.length === actual.length) return timingSafeEqual(expected, actual);
  const padded = new Uint8Array(expected.length);
  padded.set(actual.subarray(0, expected.length));
  timingSafeEqual(expected, padded);
  return false;
}

function sameSnapshot(left: CursorSnapshotV1, right: CursorSnapshotV1): boolean {
  const a = encodeCanonicalJson(left);
  const b = encodeCanonicalJson(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseNow(value: string): number {
  if (!canonicalTimestamp(value)) invalid();
  return Date.parse(value);
}

export function issueCursor(ring: CursorKeyRing, input: IssueCursorInput): string {
  validateKeyRing(ring);
  if (!DIGEST.test(input.queryDigest) || !DIGEST.test(input.principalBindingDigest)) {
    throw new StorageError("STORAGE_INPUT_INVALID", "INVALID_CURSOR_INPUT", "cursor binding digest is invalid");
  }
  if (!safePositive(input.limit) || input.limit > maximumLimit(input.capability)) {
    throw new StorageError("STORAGE_INPUT_INVALID", "INVALID_CURSOR_INPUT", "cursor capability limit is invalid");
  }
  validateSnapshot(input.snapshot);
  if (!canonicalTimestamp(input.issuedAt)) {
    throw new StorageError("STORAGE_INPUT_INVALID", "INVALID_CURSOR_INPUT", "cursor issuedAt is invalid");
  }
  const issued = Date.parse(input.issuedAt);
  const payload: CursorPayloadV1 = {
    schemaVersion: 1,
    capability: input.capability,
    queryDigest: input.queryDigest,
    principalBindingDigest: input.principalBindingDigest,
    releaseProfileDigest: M1_RELEASE_PROFILE_DIGEST,
    ...(input.caseId === undefined ? {} : { caseId: input.caseId }),
    ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
    snapshot: input.snapshot,
    lastStableKey: input.lastStableKey,
    limit: input.limit,
    issuedAt: input.issuedAt,
    expiresAt: new Date(issued + M1_RELEASE_PROFILE.pagination.cursorTtlSeconds * 1000).toISOString(),
  };
  const payloadBytes = encodeCanonicalJson(payload);
  const generation = ring.current.generation;
  return `tdevc1.${generation}.${base64url(payloadBytes)}.${base64url(macBytes(ring.current.key, generation, payloadBytes))}`;
}

export function verifyCursor(ring: CursorKeyRing, cursor: string, expected: VerifyCursorInput): CursorPayloadV1 {
  validateKeyRing(ring);
  const parts = cursor.split(".");
  if (parts.length !== 4 || parts[0] !== "tdevc1" || !GENERATION.test(parts[1])) invalid();
  const generation = Number(parts[1]);
  if (!safePositive(generation) || String(generation) !== parts[1]) invalid();
  const key = generation === ring.current.generation
    ? ring.current.key
    : ring.previous?.generation === generation
      ? ring.previous.key
      : undefined;
  const payloadBytes = decodeBase64url(parts[2]);
  const actualMac = decodeBase64url(parts[3]);
  const verificationKey = key ?? ring.current.key;
  const expectedMac = macBytes(verificationKey, generation, payloadBytes);
  const macMatches = constantTimeMacEqual(expectedMac, actualMac);
  if (key === undefined || !macMatches) invalid();
  let raw: unknown;
  try {
    raw = decodeCanonicalJson(payloadBytes);
  } catch {
    invalid();
  }
  const payload = validatePayload(raw);
  if (payload.capability !== expected.capability) invalid();
  if (payload.queryDigest !== expected.queryDigest) invalid();
  if (payload.principalBindingDigest !== expected.principalBindingDigest) invalid();
  if (payload.caseId !== expected.caseId || payload.taskId !== expected.taskId) invalid();
  if (expected.snapshot !== undefined && !sameSnapshot(payload.snapshot, expected.snapshot)) invalid();
  if (expected.limit !== undefined && payload.limit !== expected.limit) invalid();
  const now = parseNow(expected.now);
  if (now < Date.parse(payload.issuedAt) || now >= Date.parse(payload.expiresAt)) invalid();
  return payload;
}
