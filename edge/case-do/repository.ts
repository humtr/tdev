import type {
  AttemptRecord,
  CaseContract,
  CaseEvent,
  CaseState,
  CaseTargetGrant,
  EntityRef,
  JsonValue,
  MutationReceiptV1,
  TaskRecord,
} from "../../protocol/generated/typescript/types.ts";
import { M1_RELEASE_PROFILE } from "../../protocol/runtime/typescript/profile.ts";
import type { SchemaValidator } from "../../protocol/runtime/typescript/schema.ts";
import {
  admissionResultJson,
  buildSubmitOperationResult,
  parseStoredSubmitOperationResult,
  type SubmitOperationResultV1,
} from "./admission.ts";
import {
  canonicalJsonDigest,
  createCaseDoRecordCodecs,
  decodeCanonicalJson,
  encodeCanonicalJson,
  type CaseDoRecordCodecs,
  type StoredCanonicalRecord,
} from "./records.ts";
import { StorageError, verifyCaseDoSchema } from "./schema.ts";
import type { SqlDatabase, SqlRow } from "./sql.ts";

export type TransactionFaultPoint =
  | "after_state_update"
  | "after_event_insert"
  | "before_receipt_insert"
  | "after_receipt_insert"
  | "before_commit";

export type AdmissionFaultPoint =
  | "after_receipt_check"
  | "after_contract_insert"
  | "after_grants_insert"
  | "after_state_insert"
  | "after_task_insert"
  | "after_attempt_insert"
  | "after_events_insert"
  | "before_receipt_insert"
  | "after_receipt_insert"
  | "before_commit"
  | "after_commit";

export type CaseStateTransition = Readonly<{
  expectedCaseRevision: number;
  nextState: CaseState;
  event: CaseEvent;
  receipt: MutationReceiptV1;
  fault?: (point: TransactionFaultPoint) => void;
}>;

export type NewCaseAdmission = Readonly<{
  routedCaseId: string;
  requestId: string;
  semanticDigest: string;
  contract: CaseContract;
  state: CaseState;
  task: TaskRecord;
  attempt?: AttemptRecord;
  events: readonly CaseEvent[];
  fault?: (point: AdmissionFaultPoint) => void;
}>;

export type NewCaseAdmissionResult = Readonly<{
  result: SubmitOperationResultV1;
  receipt: MutationReceiptV1;
  replayed: boolean;
}>;

type CaseContractRow = SqlRow & Readonly<{
  case_id: string;
  schema_version: number;
  contract_json: Uint8Array;
  contract_digest: string;
  created_at: string;
}>;

type CaseStateRow = SqlRow & Readonly<{
  case_id: string;
  status_kind: string;
  case_revision: number;
  event_sequence: number;
  state_json: Uint8Array;
  state_digest: string;
  updated_at: string;
}>;

type TaskRow = SqlRow & Readonly<{
  case_id: string;
  task_id: string;
  task_sequence: number;
  operation_id: string;
  operation_version: number;
  status_kind: string;
  task_revision: number;
  latest_attempt_id: string | null;
  task_json: Uint8Array;
  task_digest: string;
  created_at: string;
  updated_at: string;
}>;

type AttemptRow = SqlRow & Readonly<{
  case_id: string;
  task_id: string;
  attempt_id: string;
  attempt_ordinal: number;
  status_kind: string;
  attempt_revision: number;
  agent_id: string | null;
  dispatch_id: string;
  operation_input_digest: string;
  expected_task_revision: number;
  deadline_at: string;
  attempt_json: Uint8Array;
  attempt_digest: string;
  created_at: string;
  updated_at: string;
}>;

type EventRow = SqlRow & Readonly<{
  case_id: string;
  event_sequence: number;
  event_id: string;
  entity_kind: string;
  entity_id: string;
  event_type: string;
  causation_request_id: string | null;
  event_json: Uint8Array;
  event_digest: string;
  committed_at: string;
}>;

type ReceiptRow = SqlRow & Readonly<{
  case_id: string;
  request_id: string;
  capability: string;
  semantic_input_digest: string;
  task_id: string | null;
  subject_kind: string | null;
  subject_id: string | null;
  response_json: Uint8Array;
  response_digest: string;
  committed_case_revision: number;
  committed_task_revision: number | null;
  committed_event_sequence: number;
  created_at: string;
}>;

function entitySelector(entity: EntityRef): { kind: string; id: string } {
  switch (entity.kind) {
    case "case":
      return { kind: "case", id: entity.caseId };
    case "task":
      return { kind: "task", id: entity.taskId };
    case "attempt":
      return { kind: "attempt", id: entity.attemptId };
  }
}

function targetSelector(grant: CaseTargetGrant): { kind: string; id: string } {
  switch (grant.target.kind) {
    case "workspace":
      return { kind: "workspace", id: grant.target.workspaceId };
    case "project":
      return { kind: "project", id: grant.target.projectId };
  }
}

function nullableSubject(subject: EntityRef | undefined): { kind: string | null; id: string | null } {
  return subject === undefined ? { kind: null, id: null } : entitySelector(subject);
}

function requireSafePositive(path: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new StorageError("STORAGE_INPUT_INVALID", "REVISION", `${path} must be a positive safe integer`);
  }
}

function requireDigest(path: string, value: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new StorageError("STORAGE_INPUT_INVALID", "DIGEST", `${path} must be a lowercase SHA-256 digest`);
  }
}

function bytesFrom(value: Uint8Array | string | number | bigint | null, column: string): Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw new StorageError("STORAGE_CORRUPT", "COLUMN_TYPE", `${column} is not a SQLite BLOB`);
  }
  return value;
}

function stringFrom(value: Uint8Array | string | number | bigint | null, column: string): string {
  if (typeof value !== "string") {
    throw new StorageError("STORAGE_CORRUPT", "COLUMN_TYPE", `${column} is not SQLite TEXT`);
  }
  return value;
}

function equalCanonical(left: unknown, right: unknown): boolean {
  return canonicalJsonDigest(encodeCanonicalJson(left)) === canonicalJsonDigest(encodeCanonicalJson(right));
}

function insertReceipt(db: SqlDatabase, receipt: MutationReceiptV1, responseBytes: Uint8Array): void {
  const subject = nullableSubject(receipt.subject);
  db.run(
    `INSERT INTO mutation_receipts (
      case_id, request_id, capability, semantic_input_digest, task_id, subject_kind, subject_id,
      response_json, response_digest, committed_case_revision, committed_task_revision,
      committed_event_sequence, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    receipt.caseId,
    receipt.requestId,
    receipt.capability,
    receipt.semanticDigest,
    receipt.taskId ?? null,
    subject.kind,
    subject.id,
    responseBytes,
    receipt.responseDigest,
    receipt.committedCaseRevision,
    receipt.committedTaskRevision ?? null,
    receipt.committedEventSequence,
    receipt.createdAt,
  );
}

export class CaseDoRepository {
  readonly db: SqlDatabase;
  readonly codecs: CaseDoRecordCodecs;

  constructor(db: SqlDatabase, validator: SchemaValidator) {
    verifyCaseDoSchema(db);
    this.db = db;
    this.codecs = createCaseDoRecordCodecs(validator);
  }

  readCaseContract(caseId: string): StoredCanonicalRecord<CaseContract> | undefined {
    const row = this.db.get<CaseContractRow>("SELECT * FROM case_contract WHERE case_id = ?", caseId);
    if (row === undefined) return undefined;
    const record = this.codecs.caseContract.decode(
      bytesFrom(row.contract_json, "case_contract.contract_json"),
      stringFrom(row.contract_digest, "case_contract.contract_digest"),
    );
    if (
      record.value.caseId !== row.case_id ||
      record.value.schemaVersion !== row.schema_version ||
      record.value.createdAt !== row.created_at
    ) {
      throw new StorageError("STORAGE_CORRUPT", "SELECTOR_MISMATCH", "case contract selectors do not match canonical JSON");
    }
    return record;
  }

  readCaseState(caseId: string): StoredCanonicalRecord<CaseState> | undefined {
    const row = this.db.get<CaseStateRow>("SELECT * FROM case_state WHERE case_id = ?", caseId);
    if (row === undefined) return undefined;
    const record = this.codecs.caseState.decode(
      bytesFrom(row.state_json, "case_state.state_json"),
      stringFrom(row.state_digest, "case_state.state_digest"),
    );
    const value = record.value;
    if (
      value.caseId !== row.case_id ||
      value.caseRevision !== row.case_revision ||
      value.eventSequence !== row.event_sequence ||
      value.status.kind !== row.status_kind ||
      value.updatedAt !== row.updated_at
    ) {
      throw new StorageError("STORAGE_CORRUPT", "SELECTOR_MISMATCH", "case_state selectors do not match canonical state JSON");
    }
    return record;
  }

  readTask(caseId: string, taskId: string): StoredCanonicalRecord<TaskRecord> | undefined {
    const row = this.db.get<TaskRow>("SELECT * FROM tasks WHERE case_id = ? AND task_id = ?", caseId, taskId);
    if (row === undefined) return undefined;
    const record = this.codecs.taskRecord.decode(
      bytesFrom(row.task_json, "tasks.task_json"),
      stringFrom(row.task_digest, "tasks.task_digest"),
    );
    const value = record.value;
    if (
      value.caseId !== row.case_id ||
      value.taskId !== row.task_id ||
      value.sequence !== row.task_sequence ||
      value.operation.id !== row.operation_id ||
      value.operation.version !== row.operation_version ||
      value.status.kind !== row.status_kind ||
      value.taskRevision !== row.task_revision ||
      (value.latestAttemptId ?? null) !== row.latest_attempt_id ||
      value.createdAt !== row.created_at ||
      value.updatedAt !== row.updated_at
    ) {
      throw new StorageError("STORAGE_CORRUPT", "SELECTOR_MISMATCH", "Task selectors do not match canonical Task JSON");
    }
    return record;
  }

  readAttempt(caseId: string, taskId: string, attemptId: string): StoredCanonicalRecord<AttemptRecord> | undefined {
    const row = this.db.get<AttemptRow>(
      "SELECT * FROM attempts WHERE case_id = ? AND task_id = ? AND attempt_id = ?",
      caseId,
      taskId,
      attemptId,
    );
    if (row === undefined) return undefined;
    const record = this.codecs.attemptRecord.decode(
      bytesFrom(row.attempt_json, "attempts.attempt_json"),
      stringFrom(row.attempt_digest, "attempts.attempt_digest"),
    );
    const value = record.value;
    if (
      value.caseId !== row.case_id ||
      value.taskId !== row.task_id ||
      value.attemptId !== row.attempt_id ||
      value.ordinal !== row.attempt_ordinal ||
      value.status.kind !== row.status_kind ||
      value.attemptRevision !== row.attempt_revision ||
      (value.agentId ?? null) !== row.agent_id ||
      value.dispatchId !== row.dispatch_id ||
      value.operationInputDigest !== row.operation_input_digest ||
      value.expectedTaskRevision !== row.expected_task_revision ||
      value.deadlineAt !== row.deadline_at ||
      value.createdAt !== row.created_at ||
      value.updatedAt !== row.updated_at
    ) {
      throw new StorageError("STORAGE_CORRUPT", "SELECTOR_MISMATCH", "Attempt selectors do not match canonical Attempt JSON");
    }
    return record;
  }

  readEvent(caseId: string, sequence: number): StoredCanonicalRecord<CaseEvent> | undefined {
    const row = this.db.get<EventRow>("SELECT * FROM events WHERE case_id = ? AND event_sequence = ?", caseId, sequence);
    if (row === undefined) return undefined;
    const record = this.codecs.caseEvent.decode(
      bytesFrom(row.event_json, "events.event_json"),
      stringFrom(row.event_digest, "events.event_digest"),
    );
    const value = record.value;
    const entity = entitySelector(value.entity);
    if (
      value.caseId !== row.case_id ||
      value.sequence !== row.event_sequence ||
      value.eventId !== row.event_id ||
      value.eventType !== row.event_type ||
      value.committedAt !== row.committed_at ||
      value.causationId !== row.causation_request_id ||
      entity.kind !== row.entity_kind ||
      entity.id !== row.entity_id
    ) {
      throw new StorageError("STORAGE_CORRUPT", "SELECTOR_MISMATCH", "event selectors do not match canonical event JSON");
    }
    return record;
  }

  readMutationReceipt(caseId: string, requestId: string): MutationReceiptV1 | undefined {
    const row = this.db.get<ReceiptRow>("SELECT * FROM mutation_receipts WHERE case_id = ? AND request_id = ?", caseId, requestId);
    if (row === undefined) return undefined;
    const responseBytes = bytesFrom(row.response_json, "mutation_receipts.response_json");
    const responseDigest = canonicalJsonDigest(responseBytes);
    if (responseDigest !== row.response_digest) {
      throw new StorageError("STORAGE_CORRUPT", "DIGEST_MISMATCH", "receipt response digest does not match canonical response bytes");
    }
    const response = decodeCanonicalJson(responseBytes);
    const subject = row.subject_kind === null
      ? undefined
      : row.subject_kind === "case"
        ? { kind: "case" as const, caseId: stringFrom(row.subject_id, "mutation_receipts.subject_id") }
        : row.subject_kind === "task"
          ? { kind: "task" as const, taskId: stringFrom(row.subject_id, "mutation_receipts.subject_id") }
          : row.subject_kind === "attempt"
            ? { kind: "attempt" as const, attemptId: stringFrom(row.subject_id, "mutation_receipts.subject_id") }
            : (() => { throw new StorageError("STORAGE_CORRUPT", "SUBJECT_KIND", "receipt subject kind is invalid"); })();
    const receipt: MutationReceiptV1 = {
      schemaVersion: 1,
      requestId: row.request_id,
      capability: row.capability,
      semanticDigest: row.semantic_input_digest,
      caseId: row.case_id,
      ...(row.task_id === null ? {} : { taskId: row.task_id }),
      ...(subject === undefined ? {} : { subject }),
      response: response as JsonValue,
      responseDigest: row.response_digest,
      committedCaseRevision: row.committed_case_revision,
      ...(row.committed_task_revision === null ? {} : { committedTaskRevision: row.committed_task_revision }),
      committedEventSequence: row.committed_event_sequence,
      createdAt: row.created_at,
    };
    this.codecs.mutationReceipt.encode(receipt);
    return receipt;
  }

  admitNewCase(input: NewCaseAdmission): NewCaseAdmissionResult {
    requireDigest("semanticDigest", input.semanticDigest);
    const caseId = input.routedCaseId;
    if (caseId.length === 0 || input.requestId.length === 0 || input.contract.caseId !== caseId) {
      throw new StorageError("STORAGE_INPUT_INVALID", "ROUTE_BINDING", "routed Case ID, request ID, and contract Case ID are not exactly bound");
    }

    let transactionOpen = false;
    try {
      this.db.exec("BEGIN IMMEDIATE");
      transactionOpen = true;
      const existing = this.readMutationReceipt(caseId, input.requestId);
      input.fault?.("after_receipt_check");
      if (existing !== undefined) {
        if (existing.capability !== "submit_operation" || existing.semanticDigest !== input.semanticDigest) {
          throw new StorageError("REQUEST_ID_CONFLICT", "SEMANTIC_MISMATCH", "request ID was already committed with a different capability or semantic digest");
        }
        const stored = parseStoredSubmitOperationResult(existing.response);
        this.codecs.taskRecord.encode(stored.task);
        const persistedContract = this.readCaseContract(caseId);
        this.codecs.caseState.encode({
          schemaVersion: 1,
          caseId: stored.case.caseId,
          caseRevision: stored.case.caseRevision,
          eventSequence: stored.case.eventSequence,
          status: stored.case.status,
          updatedAt: existing.createdAt,
        });
        if (
          persistedContract === undefined ||
          persistedContract.value.contractDigest !== stored.case.contractDigest ||
          stored.case.caseId !== caseId ||
          stored.task.caseId !== caseId ||
          existing.caseId !== caseId ||
          existing.taskId !== stored.task.taskId ||
          existing.subject?.kind !== "task" ||
          existing.subject.taskId !== stored.task.taskId ||
          existing.committedCaseRevision !== stored.case.caseRevision ||
          existing.committedTaskRevision !== stored.task.taskRevision ||
          existing.committedEventSequence !== stored.case.eventSequence
        ) {
          throw new StorageError("STORAGE_CORRUPT", "REPLAY_BINDING", "stored admission response and receipt selectors do not match");
        }
        this.db.exec("COMMIT");
        transactionOpen = false;
        return Object.freeze({
          result: Object.freeze({ ...stored, deduplicated: true }),
          receipt: existing,
          replayed: true,
        });
      }

      if (this.db.get("SELECT case_id FROM case_contract WHERE case_id = ?", caseId) !== undefined) {
        throw new StorageError("REQUEST_ID_CONFLICT", "CASE_ID_COLLISION", "routed Case ID already exists without the matching receipt");
      }

      const contractRecord = this.codecs.caseContract.encode(input.contract);
      const stateRecord = this.codecs.caseState.encode(input.state);
      const taskRecord = this.codecs.taskRecord.encode(input.task);
      const attemptRecord = input.attempt === undefined ? undefined : this.codecs.attemptRecord.encode(input.attempt);
      const grantRecords = input.contract.targetGrants.map((grant) => ({ grant, record: this.codecs.caseTargetGrant.encode(grant) }));
      const eventRecords = input.events.map((event) => ({ event, record: this.codecs.caseEvent.encode(event) }));
      const expectedEventTypes = input.attempt === undefined
        ? ["CaseCreated", "TaskAdmitted"] as const
        : ["CaseCreated", "TaskAdmitted", "AttemptCreated"] as const;
      const expectedEntities: readonly EntityRef[] = input.attempt === undefined
        ? [{ kind: "case", caseId }, { kind: "task", taskId: input.task.taskId }]
        : [{ kind: "case", caseId }, { kind: "task", taskId: input.task.taskId }, { kind: "attempt", attemptId: input.attempt.attemptId }];
      const committedAt = input.contract.createdAt;

      if (
        input.state.caseId !== caseId ||
        input.state.caseRevision !== 1 ||
        input.state.status.kind !== "active" ||
        input.state.status.enteredAt !== committedAt ||
        input.state.updatedAt !== committedAt ||
        input.state.eventSequence !== expectedEventTypes.length ||
        input.task.caseId !== caseId ||
        input.task.sequence !== 1 ||
        input.task.taskRevision !== 1 ||
        input.task.admission.requestId !== input.requestId ||
        input.task.admission.contractDigest !== input.contract.contractDigest ||
        input.task.admission.inputDigest !== input.task.operation.inputDigest ||
        input.task.admission.operationSchemaDigest !== input.task.operation.expectedSchemaDigest ||
        input.task.admission.admittedAt !== committedAt ||
        input.task.createdAt !== committedAt ||
        input.task.updatedAt !== committedAt ||
        input.events.length !== expectedEventTypes.length
      ) {
        throw new StorageError("STORAGE_INPUT_INVALID", "ADMISSION_BINDING", "Case, Task, Event count, request, contract, and initial revisions are not exactly bound");
      }

      if (input.attempt === undefined) {
        if (
          input.task.latestAttemptId !== undefined ||
          (input.task.status.kind !== "ready" && input.task.status.kind !== "waiting")
        ) {
          throw new StorageError("STORAGE_INPUT_INVALID", "ATTEMPT_BINDING", "Task without an initial Attempt must be ready or waiting and cannot reference a latest Attempt");
        }
      } else if (
        input.attempt.caseId !== caseId ||
        input.attempt.taskId !== input.task.taskId ||
        input.attempt.ordinal !== 1 ||
        input.attempt.attemptRevision !== 1 ||
        input.attempt.expectedTaskRevision !== 1 ||
        input.attempt.operationInputDigest !== input.task.operation.inputDigest ||
        input.attempt.status.kind !== "dispatch_pending" ||
        input.attempt.createdAt !== committedAt ||
        input.attempt.updatedAt !== committedAt ||
        input.task.latestAttemptId !== input.attempt.attemptId ||
        input.task.status.kind !== "active" ||
        input.task.status.attemptId !== input.attempt.attemptId
      ) {
        throw new StorageError("STORAGE_INPUT_INVALID", "ATTEMPT_BINDING", "initial Attempt and active Task are not exactly bound");
      }

      const grants = new Map(input.contract.targetGrants.map((grant) => [grant.grantId, grant] as const));
      for (const target of input.task.operation.targets) {
        const grant = grants.get(target.grantId);
        if (grant === undefined || !equalCanonical(target.resource, grant.target)) {
          throw new StorageError("STORAGE_INPUT_INVALID", "GRANT_BINDING", "Task target is not bound to an immutable Case target grant");
        }
      }
      for (let index = 0; index < input.events.length; index += 1) {
        const event = input.events[index];
        const expectedEntity = entitySelector(expectedEntities[index]);
        const actualEntity = entitySelector(event.entity);
        if (
          event.caseId !== caseId ||
          event.sequence !== index + 1 ||
          event.eventType !== expectedEventTypes[index] ||
          event.causationId !== input.requestId ||
          event.correlationId !== caseId ||
          event.committedAt !== committedAt ||
          event.actor.kind !== "system" ||
          event.actor.component !== "case_do" ||
          actualEntity.kind !== expectedEntity.kind ||
          actualEntity.id !== expectedEntity.id
        ) {
          throw new StorageError("STORAGE_INPUT_INVALID", "EVENT_BINDING", `initial Event ${index + 1} is not exactly bound`);
        }
      }

      if (input.events.length > M1_RELEASE_PROFILE.quota.maxEventsPerCase) {
        throw new StorageError("QUOTA_EXCEEDED", "EVENTS_PER_CASE", "Case Event quota would be exceeded");
      }
      if (1 > M1_RELEASE_PROFILE.quota.maxTasksPerCase) {
        throw new StorageError("QUOTA_EXCEEDED", "TASKS_PER_CASE", "Case Task quota would be exceeded");
      }
      if (input.attempt !== undefined && 1 > M1_RELEASE_PROFILE.quota.maxAttemptsPerTask) {
        throw new StorageError("QUOTA_EXCEEDED", "ATTEMPTS_PER_TASK", "Task Attempt quota would be exceeded");
      }

      const originalResult = buildSubmitOperationResult(input.contract, input.state, input.task, false);
      const response = admissionResultJson(originalResult);
      const responseBytes = encodeCanonicalJson(response);
      if (responseBytes.byteLength > M1_RELEASE_PROFILE.output.maxMutationResponseBytes) {
        throw new StorageError("QUOTA_EXCEEDED", "MUTATION_RESPONSE_BYTES", "mutation response exceeds the release-profile byte bound");
      }
      const receipt: MutationReceiptV1 = {
        schemaVersion: 1,
        requestId: input.requestId,
        capability: "submit_operation",
        semanticDigest: input.semanticDigest,
        caseId,
        taskId: input.task.taskId,
        subject: { kind: "task", taskId: input.task.taskId },
        response,
        responseDigest: canonicalJsonDigest(responseBytes),
        committedCaseRevision: 1,
        committedTaskRevision: 1,
        committedEventSequence: input.state.eventSequence,
        createdAt: committedAt,
      };
      this.codecs.mutationReceipt.encode(receipt);

      this.db.run(
        "INSERT INTO case_contract(case_id,schema_version,contract_json,contract_digest,created_at) VALUES(?,?,?,?,?)",
        caseId,
        input.contract.schemaVersion,
        contractRecord.bytes,
        contractRecord.digest,
        input.contract.createdAt,
      );
      input.fault?.("after_contract_insert");
      for (const { grant, record } of grantRecords) {
        const target = targetSelector(grant);
        this.db.run(
          `INSERT INTO case_target_grants(case_id,grant_id,agent_id,target_kind,target_id,grant_json,grant_digest,created_at)
           VALUES(?,?,?,?,?,?,?,?)`,
          caseId,
          grant.grantId,
          grant.agentId,
          target.kind,
          target.id,
          record.bytes,
          record.digest,
          committedAt,
        );
      }
      input.fault?.("after_grants_insert");
      this.db.run(
        `INSERT INTO case_state(case_id,status_kind,case_revision,event_sequence,state_json,state_digest,updated_at)
         VALUES(?,?,?,?,?,?,?)`,
        caseId,
        input.state.status.kind,
        input.state.caseRevision,
        input.state.eventSequence,
        stateRecord.bytes,
        stateRecord.digest,
        input.state.updatedAt,
      );
      input.fault?.("after_state_insert");
      this.db.run(
        `INSERT INTO tasks(case_id,task_id,task_sequence,operation_id,operation_version,status_kind,task_revision,latest_attempt_id,task_json,task_digest,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        caseId,
        input.task.taskId,
        input.task.sequence,
        input.task.operation.id,
        input.task.operation.version,
        input.task.status.kind,
        input.task.taskRevision,
        input.task.latestAttemptId ?? null,
        taskRecord.bytes,
        taskRecord.digest,
        input.task.createdAt,
        input.task.updatedAt,
      );
      input.fault?.("after_task_insert");
      if (input.attempt !== undefined && attemptRecord !== undefined) {
        this.db.run(
          `INSERT INTO attempts(case_id,task_id,attempt_id,attempt_ordinal,status_kind,attempt_revision,agent_id,dispatch_id,operation_input_digest,expected_task_revision,deadline_at,attempt_json,attempt_digest,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          caseId,
          input.task.taskId,
          input.attempt.attemptId,
          input.attempt.ordinal,
          input.attempt.status.kind,
          input.attempt.attemptRevision,
          input.attempt.agentId ?? null,
          input.attempt.dispatchId,
          input.attempt.operationInputDigest,
          input.attempt.expectedTaskRevision,
          input.attempt.deadlineAt,
          attemptRecord.bytes,
          attemptRecord.digest,
          input.attempt.createdAt,
          input.attempt.updatedAt,
        );
      }
      input.fault?.("after_attempt_insert");
      for (const { event, record } of eventRecords) {
        const entity = entitySelector(event.entity);
        this.db.run(
          `INSERT INTO events(case_id,event_sequence,event_id,entity_kind,entity_id,event_type,causation_request_id,event_json,event_digest,committed_at)
           VALUES(?,?,?,?,?,?,?,?,?,?)`,
          caseId,
          event.sequence,
          event.eventId,
          entity.kind,
          entity.id,
          event.eventType,
          event.causationId,
          record.bytes,
          record.digest,
          event.committedAt,
        );
      }
      input.fault?.("after_events_insert");
      input.fault?.("before_receipt_insert");
      insertReceipt(this.db, receipt, responseBytes);
      input.fault?.("after_receipt_insert");
      input.fault?.("before_commit");
      this.db.exec("COMMIT");
      transactionOpen = false;
      try {
        input.fault?.("after_commit");
      } catch (error) {
        throw new StorageError("RESPONSE_LOST", "POST_COMMIT_RESPONSE_LOST", "admission committed but the response was lost", { cause: error, committed: true });
      }
      return Object.freeze({ result: originalResult, receipt, replayed: false });
    } catch (error) {
      if (transactionOpen) {
        try {
          this.db.exec("ROLLBACK");
        } catch (rollbackError) {
          throw new StorageError("STORAGE_CORRUPT", "ROLLBACK_FAILED", "CaseDO admission failed and rollback failed", { cause: rollbackError });
        }
      }
      if (error instanceof StorageError) throw error;
      throw new StorageError("STORAGE_CORRUPT", "SQLITE_ADMISSION", "CaseDO admission transaction failed", { cause: error });
    }
  }

  commitCaseStateTransition(input: CaseStateTransition): void {
    requireSafePositive("expectedCaseRevision", input.expectedCaseRevision);
    const stateRecord = this.codecs.caseState.encode(input.nextState);
    const eventRecord = this.codecs.caseEvent.encode(input.event);
    this.codecs.mutationReceipt.encode(input.receipt);
    const responseBytes = encodeCanonicalJson(input.receipt.response);
    if (canonicalJsonDigest(responseBytes) !== input.receipt.responseDigest) {
      throw new StorageError("STORAGE_INPUT_INVALID", "RECEIPT_RESPONSE_DIGEST", "receipt response digest does not match the canonical response bytes");
    }

    const caseId = input.nextState.caseId;
    if (
      input.nextState.caseRevision !== input.expectedCaseRevision + 1 ||
      input.nextState.eventSequence !== input.event.sequence ||
      input.event.caseId !== caseId ||
      input.receipt.caseId !== caseId ||
      input.receipt.committedCaseRevision !== input.nextState.caseRevision ||
      input.receipt.committedEventSequence !== input.event.sequence ||
      input.event.causationId !== input.receipt.requestId ||
      input.event.entity.kind !== "case" ||
      input.event.entity.caseId !== caseId ||
      input.receipt.taskId !== undefined ||
      input.receipt.subject?.kind !== "case" ||
      input.receipt.subject.caseId !== caseId
    ) {
      throw new StorageError("STORAGE_INPUT_INVALID", "TRANSITION_BINDING", "state, Event, receipt, and expected revision are not exactly bound");
    }
    if (input.event.sequence > M1_RELEASE_PROFILE.quota.maxEventsPerCase) {
      throw new StorageError("QUOTA_EXCEEDED", "EVENTS_PER_CASE", "Case Event quota would be exceeded");
    }
    if (responseBytes.byteLength > M1_RELEASE_PROFILE.output.maxMutationResponseBytes) {
      throw new StorageError("QUOTA_EXCEEDED", "MUTATION_RESPONSE_BYTES", "mutation response exceeds the release-profile byte bound");
    }

    const entity = entitySelector(input.event.entity);
    let transactionOpen = false;
    try {
      this.db.exec("BEGIN IMMEDIATE");
      transactionOpen = true;
      const existing = this.db.get("SELECT request_id FROM mutation_receipts WHERE case_id = ? AND request_id = ?", caseId, input.receipt.requestId);
      if (existing !== undefined) {
        throw new StorageError("REQUEST_ID_CONFLICT", "RECEIPT_EXISTS", "mutation receipt already exists; replay resolution belongs to the semantic layer");
      }
      const update = this.db.run(
        `UPDATE case_state SET
          status_kind = ?, case_revision = ?, event_sequence = ?, state_json = ?, state_digest = ?, updated_at = ?
         WHERE case_id = ? AND case_revision = ? AND status_kind <> 'terminal'`,
        input.nextState.status.kind,
        input.nextState.caseRevision,
        input.nextState.eventSequence,
        stateRecord.bytes,
        stateRecord.digest,
        input.nextState.updatedAt,
        caseId,
        input.expectedCaseRevision,
      );
      if (update.changes !== 1) {
        const current = this.db.get<SqlRow & { case_revision: number; status_kind: string }>(
          "SELECT case_revision, status_kind FROM case_state WHERE case_id = ?",
          caseId,
        );
        if (current === undefined) {
          throw new StorageError("STORAGE_CORRUPT", "CASE_STATE_MISSING", "Case current state is missing");
        }
        if (current.status_kind === "terminal") {
          throw new StorageError("TERMINAL_IMMUTABLE", "CASE_TERMINAL", "terminal Case state cannot transition");
        }
        throw new StorageError("REVISION_CONFLICT", "CASE_REVISION", `expected Case revision ${input.expectedCaseRevision}, observed ${current.case_revision}`);
      }
      input.fault?.("after_state_update");
      this.db.run(
        `INSERT INTO events (
          case_id, event_sequence, event_id, entity_kind, entity_id, event_type,
          causation_request_id, event_json, event_digest, committed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        caseId,
        input.event.sequence,
        input.event.eventId,
        entity.kind,
        entity.id,
        input.event.eventType,
        input.event.causationId,
        eventRecord.bytes,
        eventRecord.digest,
        input.event.committedAt,
      );
      input.fault?.("after_event_insert");
      input.fault?.("before_receipt_insert");
      insertReceipt(this.db, input.receipt, responseBytes);
      input.fault?.("after_receipt_insert");
      input.fault?.("before_commit");
      this.db.exec("COMMIT");
      transactionOpen = false;
    } catch (error) {
      if (transactionOpen) {
        try {
          this.db.exec("ROLLBACK");
        } catch (rollbackError) {
          throw new StorageError("STORAGE_CORRUPT", "ROLLBACK_FAILED", "CaseDO transaction failed and rollback failed", { cause: rollbackError });
        }
      }
      if (error instanceof StorageError) throw error;
      throw new StorageError("STORAGE_CORRUPT", "SQLITE_TRANSACTION", "CaseDO transition transaction failed", { cause: error });
    }
  }
}
