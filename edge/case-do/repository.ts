import type {
  CaseEvent,
  CaseState,
  EntityRef,
  MutationReceiptV1,
} from "../../protocol/generated/typescript/types.ts";
import { M1_RELEASE_PROFILE } from "../../protocol/runtime/typescript/profile.ts";
import {
  createCaseDoRecordCodecs,
  decodeCanonicalJson,
  encodeCanonicalJson,
  type CaseDoRecordCodecs,
  type StoredCanonicalRecord,
} from "./records.ts";
import { StorageError, verifyCaseDoSchema } from "./schema.ts";
import type { SqlDatabase, SqlRow } from "./sql.ts";
import type { SchemaValidator } from "../../protocol/runtime/typescript/schema.ts";

export type TransactionFaultPoint =
  | "after_state_update"
  | "after_event_insert"
  | "before_receipt_insert"
  | "after_receipt_insert"
  | "before_commit";

export type CaseStateTransition = Readonly<{
  expectedCaseRevision: number;
  nextState: CaseState;
  event: CaseEvent;
  receipt: MutationReceiptV1;
  fault?: (point: TransactionFaultPoint) => void;
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

function nullableSubject(subject: EntityRef | undefined): { kind: string | null; id: string | null } {
  return subject === undefined ? { kind: null, id: null } : entitySelector(subject);
}

function requireSafePositive(path: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new StorageError("STORAGE_INPUT_INVALID", "REVISION", `${path} must be a positive safe integer`);
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

export class CaseDoRepository {
  readonly db: SqlDatabase;
  readonly codecs: CaseDoRecordCodecs;

  constructor(db: SqlDatabase, validator: SchemaValidator) {
    verifyCaseDoSchema(db);
    this.db = db;
    this.codecs = createCaseDoRecordCodecs(validator);
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
    const response = decodeCanonicalJson(bytesFrom(row.response_json, "mutation_receipts.response_json"));
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
      response: response as MutationReceiptV1["response"],
      responseDigest: row.response_digest,
      committedCaseRevision: row.committed_case_revision,
      ...(row.committed_task_revision === null ? {} : { committedTaskRevision: row.committed_task_revision }),
      committedEventSequence: row.committed_event_sequence,
      createdAt: row.created_at,
    };
    this.codecs.mutationReceipt.encode(receipt);
    return receipt;
  }

  commitCaseStateTransition(input: CaseStateTransition): void {
    requireSafePositive("expectedCaseRevision", input.expectedCaseRevision);
    const stateRecord = this.codecs.caseState.encode(input.nextState);
    const eventRecord = this.codecs.caseEvent.encode(input.event);
    this.codecs.mutationReceipt.encode(input.receipt);
    const responseBytes = encodeCanonicalJson(input.receipt.response);

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
    const subject = nullableSubject(input.receipt.subject);
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
      this.db.run(
        `INSERT INTO mutation_receipts (
          case_id, request_id, capability, semantic_input_digest, task_id, subject_kind, subject_id,
          response_json, response_digest, committed_case_revision, committed_task_revision,
          committed_event_sequence, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        caseId,
        input.receipt.requestId,
        input.receipt.capability,
        input.receipt.semanticDigest,
        input.receipt.taskId ?? null,
        subject.kind,
        subject.id,
        responseBytes,
        input.receipt.responseDigest,
        input.receipt.committedCaseRevision,
        input.receipt.committedTaskRevision ?? null,
        input.receipt.committedEventSequence,
        input.receipt.createdAt,
      );
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
