import assert from "node:assert/strict";
import test from "node:test";
import { M1_RELEASE_PROFILE } from "../../protocol/runtime/typescript/profile.ts";
import { StorageError } from "./schema.ts";
import {
  issueCursor,
  verifyCursor,
  type CursorKeyRing,
  type CursorSnapshotV1,
} from "./cursor.ts";

const currentKey = new Uint8Array(32).fill(7);
const previousKey = new Uint8Array(32).fill(3);
const ring: CursorKeyRing = {
  current: { generation: 12, key: currentKey },
  previous: { generation: 11, key: previousKey },
};
const queryDigest = "a".repeat(64);
const principalBindingDigest = "b".repeat(64);
const snapshot: CursorSnapshotV1 = { caseRevision: 4, taskRevision: 9, eventSequence: 17 };
const issuedAt = "2026-08-05T00:00:00.000Z";
const insideTtl = "2026-08-05T00:30:00.000Z";

function input(overrides: Record<string, unknown> = {}) {
  return {
    capability: "list_resources" as const,
    queryDigest,
    principalBindingDigest,
    caseId: "case_cursor_test",
    taskId: "task_cursor_test",
    snapshot,
    lastStableKey: ["000017", "event_17"] as const,
    limit: 20,
    issuedAt,
    ...overrides,
  };
}

function expected(overrides: Record<string, unknown> = {}) {
  return {
    capability: "list_resources" as const,
    queryDigest,
    principalBindingDigest,
    caseId: "case_cursor_test",
    taskId: "task_cursor_test",
    snapshot,
    limit: 20,
    now: insideTtl,
    ...overrides,
  };
}

function assertInvalid(run: () => unknown): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof StorageError);
    assert.equal(error.code, "STORAGE_INPUT_INVALID");
    assert.equal(error.reason, "INVALID_CURSOR");
    assert.equal(error.message, "cursor is invalid");
    return true;
  });
}

test("cursor v1 binds canonical payload, subject, snapshot, profile, and page limit", () => {
  const cursor = issueCursor(ring, input());
  assert.match(cursor, /^tdevc1\.12\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  const payload = verifyCursor(ring, cursor, expected());
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.releaseProfileDigest.length, 64);
  assert.deepEqual(payload.lastStableKey, ["000017", "event_17"]);
  assert.equal(
    Date.parse(payload.expiresAt) - Date.parse(payload.issuedAt),
    M1_RELEASE_PROFILE.pagination.cursorTtlSeconds * 1000,
  );
});

test("cursor verification rejects tampering, noncanonical encoding, expiry, and binding drift uniformly", () => {
  const cursor = issueCursor(ring, input());
  const [prefix, generation, payload, mac] = cursor.split(".");
  assertInvalid(() => verifyCursor(ring, `${prefix}.01.${payload}.${mac}`, expected()));
  assertInvalid(() => verifyCursor(ring, `${prefix}.${generation}.${payload}=.${mac}`, expected()));
  assertInvalid(() => verifyCursor(ring, `${prefix}.${generation}.${payload.slice(0, -1)}A.${mac}`, expected()));
  assertInvalid(() => verifyCursor(ring, `${prefix}.${generation}.${payload}.${mac.slice(0, -1)}A`, expected()));
  assertInvalid(() => verifyCursor(ring, cursor, expected({ queryDigest: "c".repeat(64) })));
  assertInvalid(() => verifyCursor(ring, cursor, expected({ principalBindingDigest: "d".repeat(64) })));
  assertInvalid(() => verifyCursor(ring, cursor, expected({ caseId: "case_other" })));
  assertInvalid(() => verifyCursor(ring, cursor, expected({ taskId: undefined })));
  assertInvalid(() => verifyCursor(ring, cursor, expected({ snapshot: { ...snapshot, eventSequence: 18 } })));
  assertInvalid(() => verifyCursor(ring, cursor, expected({ limit: 21 })));
  const expiresAt = new Date(Date.parse(issuedAt) + M1_RELEASE_PROFILE.pagination.cursorTtlSeconds * 1000).toISOString();
  assertInvalid(() => verifyCursor(ring, cursor, expected({ now: expiresAt })));
  assertInvalid(() => verifyCursor(ring, cursor, expected({ now: "2026-08-04T23:59:59.999Z" })));
});

test("cursor rotation accepts only current and one previous exact generation", () => {
  const previousRing: CursorKeyRing = { current: ring.previous! };
  const previousCursor = issueCursor(previousRing, input());
  assert.equal(verifyCursor(ring, previousCursor, expected()).capability, "list_resources");
  const currentCursor = issueCursor(ring, input());
  assertInvalid(() => verifyCursor({ current: ring.current }, previousCursor, expected()));
  assertInvalid(() => verifyCursor({ current: { generation: 13, key: new Uint8Array(32).fill(9) }, previous: ring.current }, previousCursor, expected()));
  assert.equal(verifyCursor(ring, currentCursor, expected()).limit, 20);
});

test("render cursors use the rendered-byte bound independently of page size", () => {
  const renderLimit = M1_RELEASE_PROFILE.pagination.maxPageSize + 1;
  const renderInput = { ...input(), capability: "render_task" as const, limit: renderLimit };
  const renderExpected = { ...expected(), capability: "render_task" as const, limit: renderLimit };
  const cursor = issueCursor(ring, renderInput);
  assert.equal(verifyCursor(ring, cursor, renderExpected).limit, renderLimit);
  assert.throws(
    () => issueCursor(ring, input({ limit: renderLimit }) as never),
    (error: unknown) => error instanceof StorageError && error.reason === "INVALID_CURSOR_INPUT",
  );
});

test("cursor creation rejects invalid key and page configurations without emitting a cursor", () => {
  assert.throws(
    () => issueCursor({ current: { generation: 0, key: currentKey } }, input()),
    (error: unknown) => error instanceof StorageError && error.reason === "INVALID_CURSOR_KEY",
  );
  assert.throws(
    () => issueCursor({ current: ring.current, previous: { ...ring.current } }, input()),
    (error: unknown) => error instanceof StorageError && error.reason === "INVALID_CURSOR_KEY",
  );
  assert.throws(
    () => issueCursor(ring, input({ limit: M1_RELEASE_PROFILE.pagination.maxPageSize + 1 }) as never),
    (error: unknown) => error instanceof StorageError && error.reason === "INVALID_CURSOR_INPUT",
  );
});
