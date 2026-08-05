import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { CaseEvent, CaseState } from "../../protocol/generated/typescript/types.ts";
import { CaseDoControlRepository, type PreparedControlMutation } from "./control.ts";
import { NodeSqliteDatabase } from "./node-sqlite.test-support.ts";
import { CaseDoQueryRepository } from "./query.ts";
import { CaseDoRepository } from "./repository.ts";
import { migrateEmptyToV1, verifyCaseDoSchema } from "./schema.ts";
import {
  buildAdmission,
  canonicalFixture,
  caseEvent,
  TEST_RELEASE,
  TEST_VALIDATOR,
} from "./test-fixtures.ts";

const cursorKeys = {
  current: { generation: 31, key: new Uint8Array(32).fill(41) },
  previous: { generation: 30, key: new Uint8Array(32).fill(37) },
} as const;
const now = "2026-08-05T02:00:00Z";
const principalBindingDigest = "d".repeat(64);

function pauseMutation(repository: CaseDoRepository, caseId: string): PreparedControlMutation {
  const current = repository.readCaseState(caseId)!.value;
  const requestId = "request_reopen_pause01";
  const nextState: CaseState = {
    ...current,
    caseRevision: current.caseRevision + 1,
    eventSequence: current.eventSequence + 1,
    status: { kind: "paused", reason: "manual", pausedAt: now, detail: "local reopen proof" },
    updatedAt: now,
  };
  const source = canonicalFixture<CaseEvent>("CaseEvent");
  const base = caseEvent(
    source,
    caseId,
    requestId,
    current.eventSequence + 1,
    "event_reopen_pause01",
    "CasePaused",
    { kind: "case", caseId },
    now,
  );
  return {
    kind: "case_pause",
    requestId,
    semanticDigest: "4".repeat(64),
    caseId,
    nextCaseState: nextState,
    events: [{ ...base, transition: { from: "active", to: "paused" } }],
    value: { action: "pause", proof: "local_sqlite_reopen" },
  };
}

test("local SQLite close and reopen preserves schema, canonical rows, replay, snapshot, and cursor continuation", () => {
  const directory = mkdtempSync(join(tmpdir(), "tdev-casedo-reopen-"));
  const databasePath = join(directory, "case.sqlite");
  const admission = buildAdmission(true, { requestId: "request_reopen_admit01" });
  const mutationHolder: { value?: PreparedControlMutation } = {};
  let cursor: string | undefined;
  let firstSubjects: readonly string[] = [];
  try {
    const firstDb = new NodeSqliteDatabase(databasePath);
    try {
      migrateEmptyToV1(firstDb, TEST_RELEASE);
      const repository = new CaseDoRepository(firstDb, TEST_VALIDATOR);
      repository.admitNewCase(admission);
      const control = new CaseDoControlRepository(firstDb, TEST_VALIDATOR);
      const mutation = pauseMutation(repository, admission.contract.caseId);
      mutationHolder.value = mutation;
      const committed = control.apply(mutation);
      assert.equal(committed.deduplicated, false);
      const query = new CaseDoQueryRepository(firstDb, TEST_VALIDATOR, cursorKeys);
      const firstPage = query.listResources({
        caseId: admission.contract.caseId,
        kinds: ["case", "task", "attempt", "event"],
        page: { limit: 2 },
        principalBindingDigest,
        now,
      });
      assert.ok(firstPage.page.nextCursor);
      cursor = firstPage.page.nextCursor;
      firstSubjects = firstPage.resources.map((resource) => resource.subjectId);
      assert.equal(query.getCase(admission.contract.caseId).state.status.kind, "paused");
    } finally {
      firstDb.close();
    }

    const reopenedDb = new NodeSqliteDatabase(databasePath);
    try {
      const identity = verifyCaseDoSchema(reopenedDb, { releaseId: TEST_RELEASE.releaseId });
      assert.equal(identity.schemaVersion, 1);
      const repository = new CaseDoRepository(reopenedDb, TEST_VALIDATOR);
      const state = repository.readCaseState(admission.contract.caseId)!.value;
      assert.equal(state.status.kind, "paused");
      assert.equal(state.caseRevision, 2);
      const control = new CaseDoControlRepository(reopenedDb, TEST_VALIDATOR);
      const replay = control.apply(mutationHolder.value!);
      assert.equal(replay.deduplicated, true);
      assert.equal(replay.committedCaseRevision, 2);
      const query = new CaseDoQueryRepository(reopenedDb, TEST_VALIDATOR, cursorKeys);
      const caseResult = query.getCase(admission.contract.caseId);
      assert.equal(caseResult.state.caseRevision, 2);
      const secondPage = query.listResources({
        caseId: admission.contract.caseId,
        kinds: ["case", "task", "attempt", "event"],
        page: { limit: 2, cursor },
        principalBindingDigest,
        now,
      });
      assert.equal(secondPage.page.snapshot.caseRevision, 2);
      assert.equal(
        new Set([...firstSubjects, ...secondPage.resources.map((resource) => resource.subjectId)]).size,
        firstSubjects.length + secondPage.resources.length,
      );
    } finally {
      reopenedDb.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
