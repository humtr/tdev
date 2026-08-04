import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type {
  AttemptRecord,
  CaseContract,
  CaseEvent,
  CaseState,
  TaskRecord,
} from "../../protocol/generated/typescript/types.ts";
import { SchemaValidator } from "../../protocol/runtime/typescript/schema.ts";
import { deriveNewCaseId } from "./admission.ts";
import { NodeSqliteDatabase } from "./node-sqlite.test-support.ts";
import { canonicalJsonDigest, encodeCanonicalJson } from "./records.ts";
import { CaseDoRepository, type AdmissionFaultPoint, type NewCaseAdmission } from "./repository.ts";
import { StorageError, migrateEmptyToV1 } from "./schema.ts";

const schema = JSON.parse(readFileSync(new URL("../../protocol/schemas/tdev.v1.schema.json", import.meta.url), "utf8"));
const fixtures = JSON.parse(readFileSync(new URL("../../protocol/testdata/fixtures.json", import.meta.url), "utf8"));
const validator = new SchemaValidator(schema);
const release = { releaseId: "release_m1_admission_test", appliedAt: "2026-08-05T00:00:00Z" } as const;

function fixture<T>(definition: string): T {
  const item = fixtures.schemaCases.find((entry: { definition: string; valid: boolean }) => entry.definition === definition && entry.valid);
  assert.ok(item, `missing valid ${definition} fixture`);
  return structuredClone(item.value) as T;
}

function event(
  source: CaseEvent,
  caseId: string,
  requestId: string,
  sequence: number,
  eventId: string,
  eventType: string,
  entity: CaseEvent["entity"],
  committedAt: string,
): CaseEvent {
  const { transition: _ignored, ...base } = source;
  return {
    ...base,
    eventId,
    caseId,
    sequence,
    entity,
    eventType,
    actor: { kind: "system", component: "case_do" },
    causationId: requestId,
    correlationId: caseId,
    committedAt,
  };
}

function admission(includeAttempt: boolean, semanticDigest = "b".repeat(64)): NewCaseAdmission {
  const contract = fixture<CaseContract>("CaseContract");
  const caseId = contract.caseId;
  const requestId = "request_admission1234";
  const committedAt = contract.createdAt;
  const taskSource = fixture<TaskRecord>("TaskRecord");
  const attemptSource = fixture<AttemptRecord>("AttemptRecord");
  const taskId = taskSource.taskId;
  const attemptId = attemptSource.attemptId;
  const task: TaskRecord = includeAttempt
    ? {
        ...taskSource,
        caseId,
        taskId,
        sequence: 1,
        taskRevision: 1,
        status: { kind: "active", attemptId },
        latestAttemptId: attemptId,
        admission: {
          ...taskSource.admission,
          requestId,
          contractDigest: contract.contractDigest,
          inputDigest: taskSource.operation.inputDigest,
          operationSchemaDigest: taskSource.operation.expectedSchemaDigest,
          admittedAt: committedAt,
        },
        createdAt: committedAt,
        updatedAt: committedAt,
      }
    : (() => {
        const { latestAttemptId: _latest, ...withoutLatest } = taskSource;
        return {
          ...withoutLatest,
          caseId,
          taskId,
          sequence: 1,
          taskRevision: 1,
          status: { kind: "ready", readyAt: committedAt },
          admission: {
            ...taskSource.admission,
            requestId,
            contractDigest: contract.contractDigest,
            inputDigest: taskSource.operation.inputDigest,
            operationSchemaDigest: taskSource.operation.expectedSchemaDigest,
            admittedAt: committedAt,
          },
          createdAt: committedAt,
          updatedAt: committedAt,
        };
      })();
  const attempt: AttemptRecord | undefined = includeAttempt
    ? {
        ...attemptSource,
        caseId,
        taskId,
        attemptId,
        ordinal: 1,
        attemptRevision: 1,
        expectedTaskRevision: 1,
        operationInputDigest: task.operation.inputDigest,
        status: { kind: "dispatch_pending" },
        createdAt: committedAt,
        updatedAt: committedAt,
      }
    : undefined;
  const eventSource = fixture<CaseEvent>("CaseEvent");
  const events = [
    event(eventSource, caseId, requestId, 1, "event_admission01", "CaseCreated", { kind: "case", caseId }, committedAt),
    event(eventSource, caseId, requestId, 2, "event_admission02", "TaskAdmitted", { kind: "task", taskId }, committedAt),
    ...(attempt === undefined
      ? []
      : [event(eventSource, caseId, requestId, 3, "event_admission03", "AttemptCreated", { kind: "attempt", attemptId }, committedAt)]),
  ];
  const state: CaseState = {
    schemaVersion: 1,
    caseId,
    caseRevision: 1,
    eventSequence: events.length,
    status: { kind: "active", enteredAt: committedAt },
    updatedAt: committedAt,
  };
  return {
    routedCaseId: caseId,
    requestId,
    semanticDigest,
    contract,
    state,
    task,
    ...(attempt === undefined ? {} : { attempt }),
    events,
  };
}

function count(db: NodeSqliteDatabase, table: string): number {
  const row = db.get<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`);
  assert.ok(row);
  return row.count;
}

function database(): NodeSqliteDatabase {
  const db = new NodeSqliteDatabase();
  migrateEmptyToV1(db, release);
  return db;
}

test("deterministic new-Case route uses the frozen domain and deployment scope", () => {
  assert.equal(
    deriveNewCaseId("deployment_m1_test", "request_route1234"),
    "case_51a21dbc05c50f043354118858434df6723a505cc83b30d2e64bacf4bc4fda9e",
  );
  assert.notEqual(
    deriveNewCaseId("deployment_m1_test", "request_route1234"),
    deriveNewCaseId("deployment_m1_other", "request_route1234"),
  );
  assert.throws(
    () => deriveNewCaseId("", "request_route1234"),
    (error: unknown) => error instanceof StorageError && error.reason === "NEW_CASE_ROUTE_INPUT",
  );
});

test("new Case, grants, first Task, Events, and receipt commit atomically", () => {
  const db = database();
  try {
    const input = admission(false);
    const repository = new CaseDoRepository(db, validator);
    const committed = repository.admitNewCase(input);
    assert.equal(committed.replayed, false);
    assert.equal(committed.result.deduplicated, false);
    assert.equal(repository.readCaseContract(input.routedCaseId)?.value.contractDigest, input.contract.contractDigest);
    assert.equal(repository.readCaseState(input.routedCaseId)?.value.caseRevision, 1);
    assert.equal(repository.readTask(input.routedCaseId, input.task.taskId)?.value.status.kind, "ready");
    assert.equal(repository.readEvent(input.routedCaseId, 1)?.value.eventType, "CaseCreated");
    assert.equal(repository.readEvent(input.routedCaseId, 2)?.value.eventType, "TaskAdmitted");
    assert.equal(count(db, "case_target_grants"), input.contract.targetGrants.length);
    assert.equal(count(db, "attempts"), 0);
    assert.equal(count(db, "events"), 2);
    assert.equal(count(db, "mutation_receipts"), 1);
  } finally {
    db.close();
  }
});

test("optional initial Attempt is bound to the active first Task in the same transaction", () => {
  const db = database();
  try {
    const input = admission(true);
    const repository = new CaseDoRepository(db, validator);
    repository.admitNewCase(input);
    assert.ok(input.attempt);
    assert.equal(repository.readTask(input.routedCaseId, input.task.taskId)?.value.status.kind, "active");
    assert.equal(repository.readAttempt(input.routedCaseId, input.task.taskId, input.attempt.attemptId)?.value.status.kind, "dispatch_pending");
    assert.equal(repository.readEvent(input.routedCaseId, 3)?.value.eventType, "AttemptCreated");
    assert.equal(count(db, "attempts"), 1);
    assert.equal(count(db, "events"), 3);
  } finally {
    db.close();
  }
});

test("every pre-commit admission fault rolls back every row", () => {
  const points: readonly AdmissionFaultPoint[] = [
    "after_receipt_check",
    "after_contract_insert",
    "after_grants_insert",
    "after_state_insert",
    "after_task_insert",
    "after_attempt_insert",
    "after_events_insert",
    "before_receipt_insert",
    "after_receipt_insert",
    "before_commit",
  ];
  for (const point of points) {
    const db = database();
    try {
      const repository = new CaseDoRepository(db, validator);
      const input = admission(true);
      assert.throws(
        () => repository.admitNewCase({
          ...input,
          fault: (observed) => { if (observed === point) throw new Error(point); },
        }),
        (error: unknown) => error instanceof StorageError && error.reason === "SQLITE_ADMISSION",
        point,
      );
      for (const table of ["case_contract", "case_target_grants", "case_state", "tasks", "attempts", "events", "mutation_receipts"]) {
        assert.equal(count(db, table), 0, `${point}: ${table}`);
      }
    } finally {
      db.close();
    }
  }
});

test("matching request and semantic digest replay the stored response without a second transition", () => {
  const db = database();
  try {
    const repository = new CaseDoRepository(db, validator);
    const input = admission(true);
    const first = repository.admitNewCase(input);
    const second = repository.admitNewCase(input);
    assert.equal(first.result.deduplicated, false);
    assert.equal(second.result.deduplicated, true);
    assert.equal(second.replayed, true);
    assert.deepEqual(second.result.case, first.result.case);
    assert.deepEqual(second.result.task, first.result.task);
    assert.equal(count(db, "tasks"), 1);
    assert.equal(count(db, "attempts"), 1);
    assert.equal(count(db, "events"), 3);
    assert.equal(count(db, "mutation_receipts"), 1);
    assert.equal(repository.readMutationReceipt(input.routedCaseId, input.requestId)?.response["deduplicated"], false);
  } finally {
    db.close();
  }
});

test("same request ID already committed by another capability fails without mutation", () => {
  const db = database();
  try {
    const repository = new CaseDoRepository(db, validator);
    const seed = admission(false);
    const seededRequestId = "request_seedcase1234";
    repository.admitNewCase({
      ...seed,
      requestId: seededRequestId,
      task: {
        ...seed.task,
        admission: { ...seed.task.admission, requestId: seededRequestId },
      },
      events: seed.events.map((item) => ({ ...item, causationId: seededRequestId })),
    });

    const input = admission(false);
    const response = { caseId: input.routedCaseId, caseRevision: 1, eventSequence: input.state.eventSequence } as const;
    const responseBytes = encodeCanonicalJson(response);
    const receipt = {
      schemaVersion: 1 as const,
      requestId: input.requestId,
      capability: "control_case",
      semanticDigest: input.semanticDigest,
      caseId: input.routedCaseId,
      subject: { kind: "case" as const, caseId: input.routedCaseId },
      response,
      responseDigest: canonicalJsonDigest(responseBytes),
      committedCaseRevision: 1,
      committedEventSequence: input.state.eventSequence,
      createdAt: input.contract.createdAt,
    };
    repository.codecs.mutationReceipt.encode(receipt);
    db.run(
      `INSERT INTO mutation_receipts(
        case_id,request_id,capability,semantic_input_digest,task_id,subject_kind,subject_id,
        response_json,response_digest,committed_case_revision,committed_task_revision,
        committed_event_sequence,created_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      receipt.caseId,
      receipt.requestId,
      receipt.capability,
      receipt.semanticDigest,
      null,
      "case",
      receipt.caseId,
      responseBytes,
      receipt.responseDigest,
      receipt.committedCaseRevision,
      null,
      receipt.committedEventSequence,
      receipt.createdAt,
    );

    assert.throws(
      () => repository.admitNewCase(input),
      (error: unknown) => error instanceof StorageError && error.code === "REQUEST_ID_CONFLICT" && error.reason === "SEMANTIC_MISMATCH",
    );
    assert.equal(count(db, "case_contract"), 1);
    assert.equal(count(db, "tasks"), 1);
    assert.equal(count(db, "events"), 2);
    assert.equal(count(db, "mutation_receipts"), 2);
  } finally {
    db.close();
  }
});

test("same request ID with another semantic digest fails without mutation", () => {
  const db = database();
  try {
    const repository = new CaseDoRepository(db, validator);
    const input = admission(false);
    repository.admitNewCase(input);
    assert.throws(
      () => repository.admitNewCase({ ...input, semanticDigest: "c".repeat(64) }),
      (error: unknown) => error instanceof StorageError && error.code === "REQUEST_ID_CONFLICT" && error.reason === "SEMANTIC_MISMATCH",
    );
    assert.equal(count(db, "tasks"), 1);
    assert.equal(count(db, "events"), 2);
    assert.equal(count(db, "mutation_receipts"), 1);
  } finally {
    db.close();
  }
});

test("commit-then-response-loss is recovered by receipt replay", () => {
  const db = database();
  try {
    const repository = new CaseDoRepository(db, validator);
    const input = admission(true);
    assert.throws(
      () => repository.admitNewCase({
        ...input,
        fault: (point) => { if (point === "after_commit") throw new Error("response lost"); },
      }),
      (error: unknown) => error instanceof StorageError && error.code === "RESPONSE_LOST" && error.committed,
    );
    assert.equal(count(db, "tasks"), 1);
    assert.equal(count(db, "events"), 3);
    const replay = repository.admitNewCase(input);
    assert.equal(replay.replayed, true);
    assert.equal(replay.result.deduplicated, true);
    assert.equal(count(db, "events"), 3);
  } finally {
    db.close();
  }
});

test("Task target resource must match its immutable Case grant", () => {
  const db = database();
  try {
    const repository = new CaseDoRepository(db, validator);
    const input = admission(false);
    const target = input.task.operation.targets[0];
    assert.ok(target);
    const resource = target.resource.kind === "workspace"
      ? { ...target.resource, workspaceId: "workspace_other1234" }
      : { ...target.resource, projectId: "project_other1234" };
    assert.throws(
      () => repository.admitNewCase({
        ...input,
        task: {
          ...input.task,
          operation: {
            ...input.task.operation,
            targets: [{ ...target, resource }, ...input.task.operation.targets.slice(1)],
          },
        },
      }),
      (error: unknown) => error instanceof StorageError && error.reason === "GRANT_BINDING",
    );
    assert.equal(count(db, "case_contract"), 0);
    assert.equal(count(db, "tasks"), 0);
    assert.equal(count(db, "events"), 0);
    assert.equal(count(db, "mutation_receipts"), 0);
  } finally {
    db.close();
  }
});

test("invalid admission binding is rejected before any durable row survives", () => {
  const db = database();
  try {
    const repository = new CaseDoRepository(db, validator);
    const input = admission(false);
    assert.throws(
      () => repository.admitNewCase({
        ...input,
        task: {
          ...input.task,
          admission: { ...input.task.admission, contractDigest: "d".repeat(64) },
        },
      }),
      (error: unknown) => error instanceof StorageError && error.reason === "ADMISSION_BINDING",
    );
    assert.equal(count(db, "case_contract"), 0);
    assert.equal(count(db, "tasks"), 0);
    assert.equal(count(db, "events"), 0);
    assert.equal(count(db, "mutation_receipts"), 0);
  } finally {
    db.close();
  }
});

test("receipt response digest drift is detected before replay", () => {
  const db = database();
  try {
    const repository = new CaseDoRepository(db, validator);
    const input = admission(false);
    repository.admitNewCase(input);
    db.exec("DROP TRIGGER mutation_receipts_immutable_update");
    db.run(
      "UPDATE mutation_receipts SET response_digest=? WHERE case_id=? AND request_id=?",
      "f".repeat(64),
      input.routedCaseId,
      input.requestId,
    );
    assert.throws(
      () => repository.readMutationReceipt(input.routedCaseId, input.requestId),
      (error: unknown) => error instanceof StorageError && error.reason === "DIGEST_MISMATCH",
    );
  } finally {
    db.close();
  }
});
