import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type {
  AttemptRecord,
  CaseContract,
  CaseEvent,
  CaseState,
  TaskRecord,
} from "../../protocol/generated/typescript/types.ts";
import { SchemaValidator } from "../../protocol/runtime/typescript/schema.ts";
import { NodeSqliteDatabase } from "./node-sqlite.test-support.ts";
import { CaseDoRepository, type NewCaseAdmission } from "./repository.ts";
import { migrateEmptyToV1 } from "./schema.ts";

const schema = JSON.parse(readFileSync(new URL("../../protocol/schemas/tdev.v1.schema.json", import.meta.url), "utf8"));
const fixtures = JSON.parse(readFileSync(new URL("../../protocol/testdata/fixtures.json", import.meta.url), "utf8"));

export const TEST_VALIDATOR = new SchemaValidator(schema);
export const TEST_RELEASE = {
  releaseId: "release_m1_control_query_test",
  appliedAt: "2026-08-05T00:00:00Z",
} as const;

export function canonicalFixture<T>(definition: string): T {
  const item = fixtures.schemaCases.find(
    (entry: { definition: string; valid: boolean }) => entry.definition === definition && entry.valid,
  );
  assert.ok(item, `missing valid ${definition} fixture`);
  return structuredClone(item.value) as T;
}

export function caseEvent(
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

export function buildAdmission(includeAttempt = true, overrides: {
  requestId?: string;
  semanticDigest?: string;
  committedAt?: string;
} = {}): NewCaseAdmission {
  const contractSource = canonicalFixture<CaseContract>("CaseContract");
  const committedAt = overrides.committedAt ?? contractSource.createdAt;
  const contract: CaseContract = { ...contractSource, createdAt: committedAt };
  const caseId = contract.caseId;
  const requestId = overrides.requestId ?? "request_controlquery1";
  const taskSource = canonicalFixture<TaskRecord>("TaskRecord");
  const attemptSource = canonicalFixture<AttemptRecord>("AttemptRecord");
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
  const eventSource = canonicalFixture<CaseEvent>("CaseEvent");
  const events = [
    caseEvent(eventSource, caseId, requestId, 1, "event_controlquery01", "CaseCreated", { kind: "case", caseId }, committedAt),
    caseEvent(eventSource, caseId, requestId, 2, "event_controlquery02", "TaskAdmitted", { kind: "task", taskId }, committedAt),
    ...(attempt === undefined
      ? []
      : [caseEvent(eventSource, caseId, requestId, 3, "event_controlquery03", "AttemptCreated", { kind: "attempt", attemptId }, committedAt)]),
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
    semanticDigest: overrides.semanticDigest ?? "b".repeat(64),
    contract,
    state,
    task,
    ...(attempt === undefined ? {} : { attempt }),
    events,
  };
}

export function createSeededDatabase(includeAttempt = true): {
  db: NodeSqliteDatabase;
  repository: CaseDoRepository;
  admission: NewCaseAdmission;
} {
  const db = new NodeSqliteDatabase();
  migrateEmptyToV1(db, TEST_RELEASE);
  const repository = new CaseDoRepository(db, TEST_VALIDATOR);
  const admission = buildAdmission(includeAttempt);
  repository.admitNewCase(admission);
  return { db, repository, admission };
}

export function tableCount(db: NodeSqliteDatabase, table: string): number {
  const row = db.get<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`);
  assert.ok(row);
  return row.count;
}
