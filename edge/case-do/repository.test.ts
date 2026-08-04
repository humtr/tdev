import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  convertCaseStatusDomain,
  type AttemptRecord,
  type CaseContract,
  type CaseEvent,
  type CaseState,
  type MutationReceiptV1,
  type TaskRecord,
} from "../../protocol/generated/typescript/types.ts";
import { SchemaValidator } from "../../protocol/runtime/typescript/schema.ts";
import { NodeSqliteDatabase } from "./node-sqlite.test-support.ts";
import { createCaseDoRecordCodecs } from "./records.ts";
import { CaseDoRepository, type TransactionFaultPoint } from "./repository.ts";
import { StorageError, migrateEmptyToV1 } from "./schema.ts";

const schema = JSON.parse(readFileSync(new URL("../../protocol/schemas/tdev.v1.schema.json", import.meta.url), "utf8"));
const fixtures = JSON.parse(readFileSync(new URL("../../protocol/testdata/fixtures.json", import.meta.url), "utf8"));
const validator = new SchemaValidator(schema);
const release = { releaseId: "release_m1_repository_test", appliedAt: "2026-08-04T13:00:00Z" } as const;

function fixture<T>(definition: string): T {
  const item = fixtures.schemaCases.find((entry: { definition: string; valid: boolean }) => entry.definition === definition && entry.valid);
  assert.ok(item, `missing valid ${definition} fixture`);
  return structuredClone(item.value) as T;
}

function activeState(caseId: string, revision = 1, eventSequence = 1): CaseState {
  return {
    schemaVersion: 1,
    caseId,
    caseRevision: revision,
    eventSequence,
    status: { kind: "active", enteredAt: "2026-08-04T00:00:00Z" },
    updatedAt: "2026-08-04T00:00:00Z",
  };
}

function seedCase(db: NodeSqliteDatabase): { contract: CaseContract; state: CaseState } {
  const codecs = createCaseDoRecordCodecs(validator);
  const contract = fixture<CaseContract>("CaseContract");
  const contractRecord = codecs.caseContract.encode(contract);
  const state = activeState(contract.caseId);
  const stateRecord = codecs.caseState.encode(state);
  const initialEvent = fixture<CaseEvent>("CaseEvent");
  const initialEventRecord = codecs.caseEvent.encode(initialEvent);
  db.run(
    "INSERT INTO case_contract(case_id,schema_version,contract_json,contract_digest,created_at) VALUES(?,?,?,?,?)",
    contract.caseId, 1, contractRecord.bytes, contractRecord.digest, contract.createdAt,
  );
  db.run(
    "INSERT INTO case_state(case_id,status_kind,case_revision,event_sequence,state_json,state_digest,updated_at) VALUES(?,?,?,?,?,?,?)",
    contract.caseId, state.status.kind, state.caseRevision, state.eventSequence, stateRecord.bytes, stateRecord.digest, state.updatedAt,
  );
  db.run(
    `INSERT INTO events(case_id,event_sequence,event_id,entity_kind,entity_id,event_type,causation_request_id,event_json,event_digest,committed_at)
     VALUES(?,?,?,?,?,?,?,?,?,?)`,
    initialEvent.caseId, initialEvent.sequence, initialEvent.eventId, "case", initialEvent.caseId, initialEvent.eventType,
    initialEvent.causationId, initialEventRecord.bytes, initialEventRecord.digest, initialEvent.committedAt,
  );
  return { contract, state };
}

function transition(caseId: string, requestId = "request_transition1234") {
  const nextState: CaseState = {
    schemaVersion: 1,
    caseId,
    caseRevision: 2,
    eventSequence: 2,
    status: { kind: "paused", reason: "manual", pausedAt: "2026-08-04T00:01:00Z" },
    updatedAt: "2026-08-04T00:01:00Z",
  };
  const event: CaseEvent = {
    ...fixture<CaseEvent>("CaseEvent"),
    eventId: "event_transition1234",
    caseId,
    sequence: 2,
    entity: { kind: "case", caseId },
    eventType: "CasePaused",
    causationId: requestId,
    correlationId: caseId,
    committedAt: "2026-08-04T00:01:00Z",
  };
  const receipt: MutationReceiptV1 = {
    ...fixture<MutationReceiptV1>("MutationReceiptV1"),
    requestId,
    capability: "control_case",
    caseId,
    subject: { kind: "case", caseId },
    response: { caseId, caseRevision: 2, eventSequence: 2 },
    committedCaseRevision: 2,
    committedEventSequence: 2,
    createdAt: "2026-08-04T00:01:00Z",
  };
  return { expectedCaseRevision: 1, nextState, event, receipt } as const;
}

test("canonical row codec round-trips bytes, digest, schema proof, and closed union conversion", () => {
  const codecs = createCaseDoRecordCodecs(validator);
  const state = activeState("case_abcdefgh");
  const encoded = codecs.caseState.encode(state);
  const decoded = codecs.caseState.decode(encoded.bytes, encoded.digest);
  assert.deepEqual(decoded.value, state);
  assert.equal(decoded.proof.rootDefinition, "CaseState");
  const status = convertCaseStatusDomain(decoded.value, decoded.proof, "CaseState", "$.status");
  assert.equal(status.kind, "active");

  const noncanonical = new TextEncoder().encode(`${new TextDecoder().decode(encoded.bytes)}\n`);
  assert.throws(
    () => codecs.caseState.decode(noncanonical, encoded.digest),
    (error: unknown) => error instanceof StorageError && error.reason === "NON_CANONICAL_JSON",
  );
  assert.throws(
    () => codecs.caseState.decode(encoded.bytes, "f".repeat(64)),
    (error: unknown) => error instanceof StorageError && error.reason === "DIGEST_MISMATCH",
  );
});

test("Case revision, Event, and immutable receipt commit atomically", () => {
  const db = new NodeSqliteDatabase();
  try {
    migrateEmptyToV1(db, release);
    const { state } = seedCase(db);
    const repository = new CaseDoRepository(db, validator);
    repository.commitCaseStateTransition(transition(state.caseId));

    const storedState = repository.readCaseState(state.caseId);
    assert.equal(storedState?.value.caseRevision, 2);
    assert.equal(storedState?.value.status.kind, "paused");
    assert.equal(repository.readEvent(state.caseId, 2)?.value.eventType, "CasePaused");
    assert.deepEqual(repository.readMutationReceipt(state.caseId, "request_transition1234")?.response, {
      caseId: state.caseId,
      caseRevision: 2,
      eventSequence: 2,
    });
    assert.throws(() => db.run("UPDATE mutation_receipts SET capability='changed' WHERE case_id=?", state.caseId), /IMMUTABLE_ROW/);
  } finally {
    db.close();
  }
});

test("every injected transaction fault rolls back current row, Event, and receipt", () => {
  const points: readonly TransactionFaultPoint[] = [
    "after_state_update",
    "after_event_insert",
    "before_receipt_insert",
    "after_receipt_insert",
    "before_commit",
  ];
  for (const point of points) {
    const db = new NodeSqliteDatabase();
    try {
      migrateEmptyToV1(db, release);
      const { state } = seedCase(db);
      const repository = new CaseDoRepository(db, validator);
      assert.throws(
        () => repository.commitCaseStateTransition({
          ...transition(state.caseId),
          fault: (observed) => { if (observed === point) throw new Error(point); },
        }),
        (error: unknown) => error instanceof StorageError && error.reason === "SQLITE_TRANSACTION",
        point,
      );
      assert.equal(repository.readCaseState(state.caseId)?.value.caseRevision, 1, point);
      assert.equal(repository.readEvent(state.caseId, 2), undefined, point);
      assert.equal(repository.readMutationReceipt(state.caseId, "request_transition1234"), undefined, point);
    } finally {
      db.close();
    }
  }
});

test("stored selector drift is detected before domain use", () => {
  const db = new NodeSqliteDatabase();
  try {
    migrateEmptyToV1(db, release);
    const { state } = seedCase(db);
    const repository = new CaseDoRepository(db, validator);
    db.exec("DROP TRIGGER case_state_update_guard");
    db.run("UPDATE case_state SET status_kind='paused' WHERE case_id=?", state.caseId);
    assert.throws(
      () => repository.readCaseState(state.caseId),
      (error: unknown) => error instanceof StorageError && error.reason === "SELECTOR_MISMATCH",
    );
  } finally {
    db.close();
  }
});

test("exact revision and terminal guards fail closed without partial writes", () => {
  const db = new NodeSqliteDatabase();
  try {
    migrateEmptyToV1(db, release);
    const { state } = seedCase(db);
    const repository = new CaseDoRepository(db, validator);
    const stale = transition(state.caseId);
    const staleBound = {
      ...stale,
      expectedCaseRevision: 2,
      nextState: { ...stale.nextState, caseRevision: 3 },
      receipt: { ...stale.receipt, committedCaseRevision: 3 },
    };
    assert.throws(
      () => repository.commitCaseStateTransition(staleBound),
      (error: unknown) => error instanceof StorageError && error.code === "REVISION_CONFLICT",
    );
    assert.equal(repository.readCaseState(state.caseId)?.value.caseRevision, 1);
    assert.equal(repository.readEvent(state.caseId, 2), undefined);
    assert.equal(repository.readMutationReceipt(state.caseId, stale.receipt.requestId), undefined);

    const stateRecord = createCaseDoRecordCodecs(validator).caseState.encode({
      ...state,
      caseRevision: 2,
      status: {
        kind: "terminal",
        terminal: {
          outcome: "unverified",
          summary: "test terminal",
          uncertainty: { code: "TEST", message: "test", possibleEffects: [] },
          closedAt: "2026-08-04T00:02:00Z",
        },
      },
      updatedAt: "2026-08-04T00:02:00Z",
    });
    db.run(
      "UPDATE case_state SET status_kind='terminal',case_revision=2,state_json=?,state_digest=?,updated_at=? WHERE case_id=?",
      stateRecord.bytes, stateRecord.digest, "2026-08-04T00:02:00Z", state.caseId,
    );
    assert.throws(
      () => db.run("UPDATE case_state SET case_revision=3 WHERE case_id=?", state.caseId),
      /TERMINAL_IMMUTABLE/,
    );
    const terminalBound = {
      ...transition(state.caseId, "request_terminal1234"),
      expectedCaseRevision: 2,
      nextState: { ...transition(state.caseId).nextState, caseRevision: 3 },
      receipt: { ...transition(state.caseId, "request_terminal1234").receipt, committedCaseRevision: 3 },
    };
    assert.throws(
      () => repository.commitCaseStateTransition(terminalBound),
      (error: unknown) => error instanceof StorageError && error.code === "TERMINAL_IMMUTABLE",
    );
  } finally {
    db.close();
  }
});

test("one Task cannot have two nonterminal Attempts", () => {
  const db = new NodeSqliteDatabase();
  try {
    migrateEmptyToV1(db, release);
    const { state } = seedCase(db);
    const codecs = createCaseDoRecordCodecs(validator);
    const sourceTask = fixture<TaskRecord>("TaskRecord");
    const { latestAttemptId: _ignored, ...withoutLatestAttempt } = sourceTask;
    const task: TaskRecord = { ...withoutLatestAttempt, caseId: state.caseId, taskId: "task_storage1234", sequence: 1 };
    const taskRecord = codecs.taskRecord.encode(task);
    db.run(
      `INSERT INTO tasks(case_id,task_id,task_sequence,operation_id,operation_version,status_kind,task_revision,latest_attempt_id,task_json,task_digest,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      task.caseId, task.taskId, task.sequence, task.operation.id, task.operation.version, task.status.kind, task.taskRevision,
      null, taskRecord.bytes, taskRecord.digest, task.createdAt, task.updatedAt,
    );

    const sourceAttempt = fixture<AttemptRecord>("AttemptRecord");
    const first: AttemptRecord = {
      ...sourceAttempt,
      caseId: task.caseId,
      taskId: task.taskId,
      attemptId: "attempt_storage01",
      ordinal: 1,
      expectedTaskRevision: task.taskRevision,
      status: { kind: "dispatch_pending" },
    };
    const firstRecord = codecs.attemptRecord.encode(first);
    db.run(
      `INSERT INTO attempts(case_id,task_id,attempt_id,attempt_ordinal,status_kind,attempt_revision,agent_id,dispatch_id,operation_input_digest,expected_task_revision,deadline_at,attempt_json,attempt_digest,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      first.caseId, first.taskId, first.attemptId, first.ordinal, first.status.kind, first.attemptRevision, first.agentId,
      first.dispatchId, first.operationInputDigest, first.expectedTaskRevision, first.deadlineAt,
      firstRecord.bytes, firstRecord.digest, first.createdAt, first.updatedAt,
    );
    const second: AttemptRecord = { ...first, attemptId: "attempt_storage02", ordinal: 2 };
    const secondRecord = codecs.attemptRecord.encode(second);
    assert.throws(
      () => db.run(
        `INSERT INTO attempts(case_id,task_id,attempt_id,attempt_ordinal,status_kind,attempt_revision,agent_id,dispatch_id,operation_input_digest,expected_task_revision,deadline_at,attempt_json,attempt_digest,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        second.caseId, second.taskId, second.attemptId, second.ordinal, second.status.kind, second.attemptRevision, second.agentId,
        second.dispatchId, second.operationInputDigest, second.expectedTaskRevision, second.deadlineAt,
        secondRecord.bytes, secondRecord.digest, second.createdAt, second.updatedAt,
      ),
      /UNIQUE constraint failed/,
    );
  } finally {
    db.close();
  }
});
