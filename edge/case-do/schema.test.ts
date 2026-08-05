import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CASE_DO_MIGRATION_CHECKSUM,
  CASE_DO_LOGICAL_MIGRATION_BYTES,
  CASE_DO_SCHEMA_DIGEST,
  CASE_DO_SCHEMA_SQL,
  StorageError,
  migrateEmptyToV1,
  verifyCaseDoSchema,
  type MigrationFaultPoint,
} from "./schema.ts";
import { NodeSqliteDatabase } from "./node-sqlite.test-support.ts";
import type { SqlRow } from "./sql.ts";
import { createSeededDatabase } from "./test-fixtures.ts";

const release = { releaseId: "release_m1_storage_test", appliedAt: "2026-08-04T13:00:00Z" } as const;

test("schema and migration digests bind exact canonical bytes", () => {
  assert.equal(createHash("sha256").update(CASE_DO_SCHEMA_SQL, "utf8").digest("hex"), CASE_DO_SCHEMA_DIGEST);
  assert.equal(createHash("sha256").update(CASE_DO_LOGICAL_MIGRATION_BYTES, "utf8").digest("hex"), CASE_DO_MIGRATION_CHECKSUM);
});

test("empty-to-v1 migration creates the exact strict schema and identity", () => {
  const db = new NodeSqliteDatabase();
  try {
    const identity = migrateEmptyToV1(db, release);
    assert.equal(identity.schemaVersion, 1);
    assert.equal(identity.schemaDigest, CASE_DO_SCHEMA_DIGEST);
    assert.equal(identity.migrationChecksum, CASE_DO_MIGRATION_CHECKSUM);
    assert.equal(identity.releaseId, release.releaseId);
    assert.equal(db.get<{ foreign_keys: number } & SqlRow>("PRAGMA foreign_keys")?.foreign_keys, 1);
  } finally {
    db.close();
  }
});

test("reopen verification rejects a same-name schema object with different SQL", () => {
  const db = new NodeSqliteDatabase();
  try {
    migrateEmptyToV1(db, release);
    db.exec("DROP INDEX tasks_by_sequence");
    db.exec("CREATE INDEX tasks_by_sequence ON tasks(case_id, task_id)");
    assert.throws(
      () => verifyCaseDoSchema(db, { releaseId: release.releaseId }),
      (error: unknown) => error instanceof StorageError && error.reason === "SCHEMA_SQL_MISMATCH",
    );
  } finally {
    db.close();
  }
});

test("migration rejects a non-empty database without changing it", () => {
  const db = new NodeSqliteDatabase();
  try {
    db.exec("CREATE TABLE unrelated (id INTEGER PRIMARY KEY) STRICT");
    assert.throws(
      () => migrateEmptyToV1(db, release),
      (error: unknown) => error instanceof StorageError && error.code === "STORAGE_NOT_EMPTY",
    );
    assert.equal(db.get<{ name: string } & SqlRow>("SELECT name FROM sqlite_schema WHERE name='unrelated'")?.name, "unrelated");
    assert.equal(db.get("SELECT name FROM sqlite_schema WHERE name='schema_meta'"), undefined);
  } finally {
    db.close();
  }
});

test("every pre-commit migration fault rolls back all schema objects", () => {
  const points: readonly MigrationFaultPoint[] = [
    "after_begin",
    "after_empty_check",
    "after_schema",
    "before_schema_meta",
    "after_schema_meta",
    "before_commit",
  ];
  for (const point of points) {
    const db = new NodeSqliteDatabase();
    try {
      assert.throws(
        () => migrateEmptyToV1(db, { ...release, fault: (observed) => { if (observed === point) throw new Error(point); } }),
        (error: unknown) => error instanceof StorageError && error.code === "MIGRATION_FAILED",
        point,
      );
      const objects = db.all("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'");
      assert.deepEqual(objects, [], point);
    } finally {
      db.close();
    }
  }
});

test("a post-commit response loss leaves a valid reopenable schema", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tdev-casedo-"));
  const path = join(directory, "case.sqlite");
  try {
    const first = new NodeSqliteDatabase(path);
    assert.throws(
      () => migrateEmptyToV1(first, { ...release, fault: (point) => { if (point === "after_commit") throw new Error("lost response"); } }),
      (error: unknown) =>
        error instanceof StorageError &&
        error.reason === "POST_COMMIT_RESPONSE_LOST" &&
        error.committed,
    );
    first.close();

    const reopened = new NodeSqliteDatabase(path);
    try {
      const identity = verifyCaseDoSchema(reopened, { releaseId: release.releaseId });
      assert.equal(identity.schemaDigest, CASE_DO_SCHEMA_DIGEST);
    } finally {
      reopened.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});


test("case_state guard permits event-only sequence advance but not same-revision lifecycle change", () => {
  const { db, repository, admission } = createSeededDatabase();
  try {
    const current = repository.readCaseState(admission.contract.caseId)!.value;
    const eventOnly = repository.codecs.caseState.encode({
      ...current,
      eventSequence: current.eventSequence + 1,
      updatedAt: "2026-08-05T00:10:00Z",
    });
    assert.equal(
      db.run(
        `UPDATE case_state SET status_kind=?, case_revision=?, event_sequence=?, state_json=?, state_digest=?, updated_at=?
         WHERE case_id=? AND case_revision=?`,
        eventOnly.value.status.kind,
        eventOnly.value.caseRevision,
        eventOnly.value.eventSequence,
        eventOnly.bytes,
        eventOnly.digest,
        eventOnly.value.updatedAt,
        current.caseId,
        current.caseRevision,
      ).changes,
      1,
    );
    const illegal = repository.codecs.caseState.encode({
      ...eventOnly.value,
      status: { kind: "paused", reason: "manual", pausedAt: "2026-08-05T00:11:00Z" },
      eventSequence: eventOnly.value.eventSequence + 1,
      updatedAt: "2026-08-05T00:11:00Z",
    });
    assert.throws(
      () => db.run(
        `UPDATE case_state SET status_kind=?, case_revision=?, event_sequence=?, state_json=?, state_digest=?, updated_at=?
         WHERE case_id=? AND case_revision=?`,
        illegal.value.status.kind,
        illegal.value.caseRevision,
        illegal.value.eventSequence,
        illegal.bytes,
        illegal.digest,
        illegal.value.updatedAt,
        current.caseId,
        current.caseRevision,
      ),
      /REVISION_STEP_INVALID/,
    );
  } finally {
    db.close();
  }
});
