import type {
  ArtifactRef,
  AttemptRecord,
  CaseContract,
  CaseEvent,
  CaseState,
  EvidenceRef,
  EvidenceSet,
  JsonValue,
  MutationReceiptV1,
  Sha256,
  TaskRecord,
} from "../../protocol/generated/typescript/types.ts";
import { M1_RELEASE_PROFILE } from "../../protocol/runtime/typescript/profile.ts";
import { SchemaValidator } from "../../protocol/runtime/typescript/schema.ts";
import {
  assertAttemptTransition,
  assertCaseTransition,
  assertOneNonterminalAttempt,
  assertTaskTransition,
  completionEvidenceErrors,
  type AttemptStateKey,
  type CaseStateKey,
  type TaskStateKey,
} from "../../domain/state/typescript/state.ts";
import {
  InternalRecordCodecs,
  type ApprovalDecisionRecordV1,
  type ApprovalRequestRecordV1,
  type CheckpointRecordV1,
  type InputRequestRecordV1,
  type InputResponseRecordV1,
  type RetryDecisionRecordV1,
} from "./internal-records.ts";
import {
  canonicalJsonDigest,
  encodeCanonicalJson,
  StoredRecordCodec,
} from "./records.ts";
import { CaseDoRepository } from "./repository.ts";
import { StorageError } from "./schema.ts";
import type { SqlDatabase, SqlRow } from "./sql.ts";

export type ControlMutationKind =
  | "case_pause"
  | "case_resume"
  | "checkpoint"
  | "finish_case"
  | "cancel_case"
  | "approve"
  | "deny"
  | "provide_input"
  | "authorize_retry"
  | "decline_retry"
  | "cancel_task"
  | "attempt_progress"
  | "attempt_result"
  | "evidence_set";

export type ControlFaultPoint =
  | "after_receipt_check"
  | "after_validation"
  | "after_case_update"
  | "after_task_updates"
  | "after_attempt_updates"
  | "after_attempt_inserts"
  | "after_immutable_rows"
  | "after_events"
  | "before_receipt"
  | "after_receipt"
  | "before_commit"
  | "after_commit";

export type PreparedControlMutation = Readonly<{
  kind: ControlMutationKind;
  requestId: string;
  semanticDigest: Sha256;
  caseId: string;
  taskId?: string;
  attemptId?: string;
  nextCaseState: CaseState;
  taskUpdates?: readonly TaskRecord[];
  attemptUpdates?: readonly AttemptRecord[];
  attemptInserts?: readonly AttemptRecord[];
  events: readonly CaseEvent[];
  value: JsonValue;
  checkpoint?: CheckpointRecordV1;
  approvalRequest?: ApprovalRequestRecordV1;
  approvalDecision?: ApprovalDecisionRecordV1;
  inputRequest?: InputRequestRecordV1;
  inputResponse?: InputResponseRecordV1;
  retryDecision?: RetryDecisionRecordV1;
  evidenceSet?: EvidenceSet;
  fault?: (point: ControlFaultPoint) => void;
}>;

export type ControlMutationResultV1 = Readonly<{
  accepted: true;
  deduplicated: boolean;
  requestId: string;
  caseId: string;
  taskId?: string;
  committedCaseRevision: number;
  committedTaskRevision?: number;
  committedEventSequence: number;
  value: JsonValue;
}>;

type Blob = Uint8Array | ArrayBuffer;
type EventSpec = Readonly<{
  eventType: string;
  entity: CaseEvent["entity"];
  transition?: Readonly<{ from: string; to: string }>;
}>;

type EvidenceSetRow = SqlRow & {
  case_id: string;
  evidence_set_id: string;
  case_revision: number;
  event_sequence: number;
  evidence_set_json: Blob;
  evidence_set_digest: string;
  record_digest: string;
  created_at: string;
};

type ArtifactRow = SqlRow & {
  case_id: string;
  artifact_id: string;
  task_id: string | null;
  media_type: string;
  byte_length: number;
  sha256: string;
  retention_class: string;
  r2_generation: number;
  artifact_json: Blob;
  artifact_digest: string;
  created_at: string;
};

const DIGEST = /^[0-9a-f]{64}$/;
const TERMINAL_TASK = "terminal:";
const TERMINAL_ATTEMPT = "terminal:";

function bytes(value: Blob, label: string): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new StorageError("STORAGE_CORRUPT", "ROW_TYPE", `${label} is not a byte sequence`);
}

function inputInvalid(reason: string, message: string): never {
  throw new StorageError("STORAGE_INPUT_INVALID", reason, message);
}

function capabilityFor(kind: ControlMutationKind): string {
  switch (kind) {
    case "case_pause":
    case "case_resume":
    case "checkpoint":
      return "control_case";
    case "finish_case":
      return "finish_case";
    case "cancel_case":
      return "cancel_case";
    case "approve":
    case "deny":
    case "provide_input":
    case "authorize_retry":
    case "decline_retry":
      return "control_task";
    case "cancel_task":
      return "cancel_task";
    case "attempt_progress":
      return "attempt_progress";
    case "attempt_result":
      return "accept_attempt_result";
    case "evidence_set":
      return "materialize_evidence";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): void {
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(value, key)) || Object.keys(value).some((key) => !allowed.has(key))) {
    throw new StorageError("STORAGE_CORRUPT", "CONTROL_RESPONSE_SHAPE", "stored control response has unexpected fields");
  }
}

function positive(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function caseKey(state: CaseState): CaseStateKey {
  return state.status.kind === "terminal" ? `terminal:${state.status.terminal.outcome}` : state.status.kind;
}

function taskKey(task: TaskRecord): TaskStateKey {
  if (task.status.kind === "waiting") return `waiting:${task.status.waiting.reason}`;
  if (task.status.kind === "terminal") return `terminal:${task.status.terminal.outcome}`;
  return task.status.kind;
}

function attemptKey(attempt: AttemptRecord): AttemptStateKey {
  return attempt.status.kind === "terminal" ? `terminal:${attempt.status.terminal.outcome}` : attempt.status.kind;
}

function terminalTask(task: TaskRecord): boolean {
  return taskKey(task).startsWith(TERMINAL_TASK);
}

function terminalAttempt(attempt: AttemptRecord): boolean {
  return attemptKey(attempt).startsWith(TERMINAL_ATTEMPT);
}

function canonicalEqual(left: unknown, right: unknown): boolean {
  const a = encodeCanonicalJson(left as JsonValue);
  const b = encodeCanonicalJson(right as JsonValue);
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

function entityEqual(left: CaseEvent["entity"], right: CaseEvent["entity"]): boolean {
  return canonicalEqual(left, right);
}

function optionalCanonicalEqual(left: unknown, right: unknown): boolean {
  if (left === undefined || right === undefined) return left === right;
  return canonicalEqual(left, right);
}

function resultJson(result: ControlMutationResultV1): JsonValue {
  return result as unknown as JsonValue;
}

function parseControlResult(value: JsonValue): ControlMutationResultV1 {
  if (!isRecord(value)) {
    throw new StorageError("STORAGE_CORRUPT", "CONTROL_RESPONSE_SHAPE", "stored control response must be an object");
  }
  exactKeys(
    value,
    ["accepted", "deduplicated", "requestId", "caseId", "committedCaseRevision", "committedEventSequence", "value"],
    ["taskId", "committedTaskRevision"],
  );
  if (
    value.accepted !== true ||
    value.deduplicated !== false ||
    typeof value.requestId !== "string" || value.requestId.length === 0 ||
    typeof value.caseId !== "string" || value.caseId.length === 0 ||
    (value.taskId !== undefined && (typeof value.taskId !== "string" || value.taskId.length === 0)) ||
    !positive(value.committedCaseRevision) ||
    (value.committedTaskRevision !== undefined && !positive(value.committedTaskRevision)) ||
    !Number.isSafeInteger(value.committedEventSequence) || (value.committedEventSequence as number) < 0
  ) {
    throw new StorageError("STORAGE_CORRUPT", "CONTROL_RESPONSE_SHAPE", "stored control response fields are invalid");
  }
  return value as unknown as ControlMutationResultV1;
}

function replayResult(original: ControlMutationResultV1): ControlMutationResultV1 {
  return Object.freeze({ ...original, deduplicated: true });
}

function eventSpec(eventType: string, entity: CaseEvent["entity"], transition?: Readonly<{ from: string; to: string }>): EventSpec {
  return Object.freeze({ eventType, entity, ...(transition === undefined ? {} : { transition }) });
}

function sortedUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) inputInvalid("DUPLICATE_MUTATION_ROW", `${label} contains duplicates`);
}

function taskImmutableEqual(current: TaskRecord, next: TaskRecord): boolean {
  return (
    current.schemaVersion === next.schemaVersion &&
    current.caseId === next.caseId &&
    current.taskId === next.taskId &&
    current.sequence === next.sequence &&
    canonicalEqual(current.operation, next.operation) &&
    canonicalEqual(current.admission, next.admission) &&
    current.createdAt === next.createdAt
  );
}

function attemptImmutableEqual(current: AttemptRecord, next: AttemptRecord): boolean {
  return (
    current.schemaVersion === next.schemaVersion &&
    current.caseId === next.caseId &&
    current.taskId === next.taskId &&
    current.attemptId === next.attemptId &&
    current.ordinal === next.ordinal &&
    current.agentId === next.agentId &&
    current.dispatchId === next.dispatchId &&
    current.operationInputDigest === next.operationInputDigest &&
    current.expectedTaskRevision === next.expectedTaskRevision &&
    current.deadlineAt === next.deadlineAt &&
    current.createdAt === next.createdAt
  );
}

function expectedSubject(input: PreparedControlMutation): MutationReceiptV1["subject"] {
  if (input.attemptId !== undefined) return { kind: "attempt", attemptId: input.attemptId };
  if (input.taskId !== undefined) return { kind: "task", taskId: input.taskId };
  return { kind: "case", caseId: input.caseId };
}

function requireDigest(value: string, label: string): void {
  if (!DIGEST.test(value)) inputInvalid("DIGEST_INVALID", `${label} must be a lowercase SHA-256 digest`);
}

export class CaseDoControlRepository {
  readonly db: SqlDatabase;
  readonly repository: CaseDoRepository;
  readonly internal: InternalRecordCodecs;
  readonly artifactCodec: StoredRecordCodec<ArtifactRef>;

  constructor(db: SqlDatabase, validator: SchemaValidator) {
    this.db = db;
    this.repository = new CaseDoRepository(db, validator);
    this.internal = new InternalRecordCodecs(validator);
    this.artifactCodec = new StoredRecordCodec<ArtifactRef>(validator, "ArtifactRef");
  }

  apply(input: PreparedControlMutation): ControlMutationResultV1 {
    requireDigest(input.semanticDigest, "semanticDigest");
    if (input.requestId.length === 0 || input.caseId.length === 0 || input.events.length === 0) {
      inputInvalid("CONTROL_BINDING", "control mutation identity and Events are required");
    }
    let committed = false;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const capability = capabilityFor(input.kind);
      const existing = this.repository.readMutationReceipt(input.caseId, input.requestId);
      if (existing !== undefined) {
        if (existing.capability !== capability || existing.semanticDigest !== input.semanticDigest) {
          throw new StorageError("REQUEST_ID_CONFLICT", "SEMANTIC_MISMATCH", "request ID is already committed with another capability or semantic digest");
        }
        const parsed = parseControlResult(existing.response);
        if (parsed.requestId !== input.requestId || parsed.caseId !== input.caseId || parsed.taskId !== input.taskId) {
          throw new StorageError("STORAGE_CORRUPT", "RECEIPT_SELECTOR_MISMATCH", "stored control response selectors do not match the receipt");
        }
        this.db.exec("COMMIT");
        committed = true;
        return replayResult(parsed);
      }
      input.fault?.("after_receipt_check");

      const contract = this.repository.readCaseContract(input.caseId)?.value;
      const currentCase = this.repository.readCaseState(input.caseId)?.value;
      if (contract === undefined || currentCase === undefined) {
        inputInvalid("CASE_NOT_FOUND", "Case was not found");
      }
      const committedAt = input.events[0].committedAt;
      const taskUpdates = [...(input.taskUpdates ?? [])];
      const attemptUpdates = [...(input.attemptUpdates ?? [])];
      const attemptInserts = [...(input.attemptInserts ?? [])];
      sortedUnique(taskUpdates.map((task) => task.taskId), "taskUpdates");
      sortedUnique(attemptUpdates.map((attempt) => attempt.attemptId), "attemptUpdates");
      sortedUnique(attemptInserts.map((attempt) => attempt.attemptId), "attemptInserts");

      const currentTasks = new Map<string, TaskRecord>();
      for (const task of taskUpdates) {
        const current = this.repository.readTask(input.caseId, task.taskId)?.value;
        if (current === undefined) inputInvalid("TASK_NOT_FOUND", `Task ${task.taskId} was not found`);
        currentTasks.set(task.taskId, current);
      }
      const currentAttempts = new Map<string, AttemptRecord>();
      for (const attempt of attemptUpdates) {
        const current = this.repository.readAttempt(input.caseId, attempt.taskId, attempt.attemptId)?.value;
        if (current === undefined) inputInvalid("ATTEMPT_NOT_FOUND", `Attempt ${attempt.attemptId} was not found`);
        currentAttempts.set(attempt.attemptId, current);
      }

      const specs = this.validateMutation(
        input,
        contract,
        currentCase,
        taskUpdates,
        attemptUpdates,
        attemptInserts,
        currentTasks,
        currentAttempts,
        committedAt,
      );
      this.validateEvents(input, currentCase.eventSequence, committedAt, specs);
      input.fault?.("after_validation");

      const caseRecord = this.repository.codecs.caseState.encode(input.nextCaseState);
      const taskRecords = taskUpdates.map((task) => ({ task, record: this.repository.codecs.taskRecord.encode(task), current: currentTasks.get(task.taskId)! }));
      const attemptRecords = attemptUpdates.map((attempt) => ({ attempt, record: this.repository.codecs.attemptRecord.encode(attempt), current: currentAttempts.get(attempt.attemptId)! }));
      const attemptInsertRecords = attemptInserts.map((attempt) => ({ attempt, record: this.repository.codecs.attemptRecord.encode(attempt) }));
      const eventRecords = input.events.map((event) => ({ event, record: this.repository.codecs.caseEvent.encode(event) }));

      const committedTaskRevision = input.taskId === undefined
        ? undefined
        : taskUpdates.find((task) => task.taskId === input.taskId)?.taskRevision;
      const originalResult: ControlMutationResultV1 = Object.freeze({
        accepted: true,
        deduplicated: false,
        requestId: input.requestId,
        caseId: input.caseId,
        ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
        committedCaseRevision: input.nextCaseState.caseRevision,
        ...(committedTaskRevision === undefined ? {} : { committedTaskRevision }),
        committedEventSequence: input.nextCaseState.eventSequence,
        value: input.value,
      });
      const response = resultJson(originalResult);
      const responseBytes = encodeCanonicalJson(response);
      if (responseBytes.byteLength > M1_RELEASE_PROFILE.output.maxMutationResponseBytes) {
        throw new StorageError("QUOTA_EXCEEDED", "MUTATION_RESPONSE_BYTES", "mutation response exceeds the release-profile byte bound");
      }
      const receipt: MutationReceiptV1 = {
        schemaVersion: 1,
        requestId: input.requestId,
        capability,
        semanticDigest: input.semanticDigest,
        caseId: input.caseId,
        ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
        subject: expectedSubject(input),
        response,
        responseDigest: canonicalJsonDigest(responseBytes),
        committedCaseRevision: input.nextCaseState.caseRevision,
        ...(committedTaskRevision === undefined ? {} : { committedTaskRevision }),
        committedEventSequence: input.nextCaseState.eventSequence,
        createdAt: committedAt,
      };
      const receiptRecord = this.repository.codecs.mutationReceipt.encode(receipt);

      const caseUpdate = this.db.run(
        `UPDATE case_state
         SET status_kind=?, case_revision=?, event_sequence=?, state_json=?, state_digest=?, updated_at=?
         WHERE case_id=? AND case_revision=? AND event_sequence=?`,
        input.nextCaseState.status.kind,
        input.nextCaseState.caseRevision,
        input.nextCaseState.eventSequence,
        caseRecord.bytes,
        caseRecord.digest,
        input.nextCaseState.updatedAt,
        input.caseId,
        currentCase.caseRevision,
        currentCase.eventSequence,
      );
      if (caseUpdate.changes !== 1) this.classifyCaseWrite(input.caseId, currentCase);
      input.fault?.("after_case_update");

      for (const { attempt, record, current } of attemptRecords) {
        const update = this.db.run(
          `UPDATE attempts
           SET status_kind=?, attempt_revision=?, attempt_json=?, attempt_digest=?, updated_at=?
           WHERE case_id=? AND task_id=? AND attempt_id=? AND attempt_revision=?`,
          attempt.status.kind,
          attempt.attemptRevision,
          record.bytes,
          record.digest,
          attempt.updatedAt,
          input.caseId,
          attempt.taskId,
          attempt.attemptId,
          current.attemptRevision,
        );
        if (update.changes !== 1) this.classifyAttemptWrite(input.caseId, attempt.taskId, attempt.attemptId, current.attemptRevision);
      }
      input.fault?.("after_attempt_updates");

      for (const { attempt, record } of attemptInsertRecords) {
        this.db.run(
          `INSERT INTO attempts(case_id,task_id,attempt_id,attempt_ordinal,status_kind,attempt_revision,agent_id,dispatch_id,operation_input_digest,expected_task_revision,deadline_at,attempt_json,attempt_digest,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          input.caseId,
          attempt.taskId,
          attempt.attemptId,
          attempt.ordinal,
          attempt.status.kind,
          attempt.attemptRevision,
          attempt.agentId ?? null,
          attempt.dispatchId,
          attempt.operationInputDigest,
          attempt.expectedTaskRevision,
          attempt.deadlineAt,
          record.bytes,
          record.digest,
          attempt.createdAt,
          attempt.updatedAt,
        );
      }
      input.fault?.("after_attempt_inserts");

      for (const { task, record, current } of taskRecords) {
        const update = this.db.run(
          `UPDATE tasks
           SET status_kind=?, task_revision=?, latest_attempt_id=?, task_json=?, task_digest=?, updated_at=?
           WHERE case_id=? AND task_id=? AND task_revision=?`,
          task.status.kind,
          task.taskRevision,
          task.latestAttemptId ?? null,
          record.bytes,
          record.digest,
          task.updatedAt,
          input.caseId,
          task.taskId,
          current.taskRevision,
        );
        if (update.changes !== 1) this.classifyTaskWrite(input.caseId, task.taskId, current.taskRevision);
      }
      input.fault?.("after_task_updates");

      this.insertImmutableRows(input, committedAt);
      input.fault?.("after_immutable_rows");

      for (const { event, record } of eventRecords) {
        const selector = event.entity.kind === "case"
          ? ["case", event.entity.caseId]
          : event.entity.kind === "task"
            ? ["task", event.entity.taskId]
            : ["attempt", event.entity.attemptId];
        this.db.run(
          `INSERT INTO events(case_id,event_sequence,event_id,entity_kind,entity_id,event_type,causation_request_id,event_json,event_digest,committed_at)
           VALUES(?,?,?,?,?,?,?,?,?,?)`,
          input.caseId,
          event.sequence,
          event.eventId,
          selector[0],
          selector[1],
          event.eventType,
          event.causationId,
          record.bytes,
          record.digest,
          event.committedAt,
        );
      }
      input.fault?.("after_events");
      input.fault?.("before_receipt");
      this.db.run(
        `INSERT INTO mutation_receipts(
          case_id,request_id,capability,semantic_input_digest,task_id,subject_kind,subject_id,
          response_json,response_digest,committed_case_revision,committed_task_revision,
          committed_event_sequence,created_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        input.caseId,
        input.requestId,
        capability,
        input.semanticDigest,
        receipt.taskId ?? null,
        receipt.subject?.kind ?? null,
        receipt.subject === undefined
          ? null
          : receipt.subject.kind === "case"
            ? receipt.subject.caseId
            : receipt.subject.kind === "task"
              ? receipt.subject.taskId
              : receipt.subject.attemptId,
        responseBytes,
        receipt.responseDigest,
        receipt.committedCaseRevision,
        receipt.committedTaskRevision ?? null,
        receipt.committedEventSequence,
        receipt.createdAt,
      );
      input.fault?.("after_receipt");
      input.fault?.("before_commit");
      this.db.exec("COMMIT");
      committed = true;
      try {
        input.fault?.("after_commit");
      } catch (error) {
        throw new StorageError("RESPONSE_LOST", "POST_COMMIT_RESPONSE_LOST", "control mutation committed but the response was lost", { committed: true, cause: error });
      }
      return originalResult;
    } catch (error) {
      if (!committed) {
        try {
          this.db.exec("ROLLBACK");
        } catch {
          // Preserve the original failure.
        }
      }
      throw error;
    }
  }

  private validateMutation(
    input: PreparedControlMutation,
    contract: CaseContract,
    currentCase: CaseState,
    taskUpdates: readonly TaskRecord[],
    attemptUpdates: readonly AttemptRecord[],
    attemptInserts: readonly AttemptRecord[],
    currentTasks: ReadonlyMap<string, TaskRecord>,
    currentAttempts: ReadonlyMap<string, AttemptRecord>,
    committedAt: string,
  ): readonly EventSpec[] {
    if (input.nextCaseState.caseId !== input.caseId || currentCase.caseId !== input.caseId) inputInvalid("CASE_BINDING", "Case state is bound to another Case");
    if (input.nextCaseState.eventSequence !== currentCase.eventSequence + input.events.length) inputInvalid("EVENT_SEQUENCE", "next Case event sequence must include every Event exactly once");
    if (input.nextCaseState.updatedAt !== committedAt) inputInvalid("COMMIT_TIME", "Case updatedAt must equal Event committedAt");
    if (currentCase.status.kind === "terminal") inputInvalid("TERMINAL_IMMUTABLE", "terminal Case is immutable");
    if (input.events.length > M1_RELEASE_PROFILE.quota.maxEventsPerCase - currentCase.eventSequence) {
      throw new StorageError("QUOTA_EXCEEDED", "EVENTS_PER_CASE", "Case Event quota would be exceeded");
    }

    for (const task of taskUpdates) {
      const current = currentTasks.get(task.taskId)!;
      if (!taskImmutableEqual(current, task) || task.caseId !== input.caseId) inputInvalid("TASK_IMMUTABLE", `Task ${task.taskId} immutable fields changed`);
      if (task.taskRevision !== current.taskRevision + 1 || task.updatedAt !== committedAt) inputInvalid("TASK_REVISION", `Task ${task.taskId} revision or updatedAt is invalid`);
      if (terminalTask(current)) inputInvalid("TERMINAL_IMMUTABLE", `Task ${task.taskId} is terminal`);
      if (taskKey(current) !== taskKey(task)) {
        try { assertTaskTransition(taskKey(current), taskKey(task)); } catch { inputInvalid("TASK_TRANSITION", `Task transition ${taskKey(current)} -> ${taskKey(task)} is invalid`); }
      }
    }
    for (const attempt of attemptUpdates) {
      const current = currentAttempts.get(attempt.attemptId)!;
      if (!attemptImmutableEqual(current, attempt) || attempt.caseId !== input.caseId) inputInvalid("ATTEMPT_IMMUTABLE", `Attempt ${attempt.attemptId} immutable fields changed`);
      if (attempt.attemptRevision !== current.attemptRevision + 1 || attempt.updatedAt !== committedAt) inputInvalid("ATTEMPT_REVISION", `Attempt ${attempt.attemptId} revision or updatedAt is invalid`);
      if (terminalAttempt(current)) inputInvalid("TERMINAL_IMMUTABLE", `Attempt ${attempt.attemptId} is terminal`);
      try { assertAttemptTransition(attemptKey(current), attemptKey(attempt)); } catch { inputInvalid("ATTEMPT_TRANSITION", `Attempt transition ${attemptKey(current)} -> ${attemptKey(attempt)} is invalid`); }
    }
    for (const attempt of attemptInserts) this.validateAttemptInsert(input, attempt, taskUpdates, committedAt);
    this.validateOneNonterminalAttempt(input.caseId, taskUpdates, attemptUpdates, attemptInserts);

    switch (input.kind) {
      case "case_pause":
        this.requireOnlyCase(input, taskUpdates, attemptUpdates, attemptInserts);
        this.requireNoImmutable(input);
        this.requireCaseRevision(currentCase, input.nextCaseState, true, false);
        if (caseKey(currentCase) !== "active" || caseKey(input.nextCaseState) !== "paused") inputInvalid("CASE_TRANSITION", "case_pause requires active -> paused");
        assertCaseTransition("active", "paused");
        return [eventSpec("CasePaused", { kind: "case", caseId: input.caseId }, { from: "active", to: "paused" })];
      case "case_resume":
        this.requireOnlyCase(input, taskUpdates, attemptUpdates, attemptInserts);
        this.requireNoImmutable(input);
        this.requireCaseRevision(currentCase, input.nextCaseState, true, false);
        if (caseKey(currentCase) !== "paused" || caseKey(input.nextCaseState) !== "active") inputInvalid("CASE_TRANSITION", "case_resume requires paused -> active");
        assertCaseTransition("paused", "active");
        return [eventSpec("CaseResumed", { kind: "case", caseId: input.caseId }, { from: "paused", to: "active" })];
      case "checkpoint":
        this.requireOnlyCase(input, taskUpdates, attemptUpdates, attemptInserts);
        this.requireOnlyCheckpoint(input);
        this.requireCaseRevision(currentCase, input.nextCaseState, true, true);
        this.validateCheckpoint(input, committedAt);
        return [eventSpec("CheckpointCreated", { kind: "case", caseId: input.caseId }), eventSpec("CaseProjectionChanged", { kind: "case", caseId: input.caseId })];
      case "finish_case":
        this.requireOnlyCase(input, taskUpdates, attemptUpdates, attemptInserts);
        this.requireNoImmutable(input);
        this.requireCaseRevision(currentCase, input.nextCaseState, true, false);
        try { assertCaseTransition(caseKey(currentCase), caseKey(input.nextCaseState)); } catch { inputInvalid("CASE_TRANSITION", "finish_case terminal transition is invalid"); }
        if (input.nextCaseState.status.kind !== "terminal") inputInvalid("CASE_TERMINAL", "finish_case requires a terminal Case state");
        this.validateAllTerminal(input.caseId);
        this.validateFinishEvidence(contract, input.nextCaseState);
        return [eventSpec("CaseFinished", { kind: "case", caseId: input.caseId }, { from: caseKey(currentCase), to: caseKey(input.nextCaseState) })];
      case "cancel_case":
        this.requireNoImmutable(input);
        this.requireCaseRevision(currentCase, input.nextCaseState, true, false);
        try { assertCaseTransition(caseKey(currentCase), caseKey(input.nextCaseState)); } catch { inputInvalid("CASE_TRANSITION", "cancel_case transition is invalid"); }
        if (caseKey(input.nextCaseState) !== "cancelling") inputInvalid("CASE_TRANSITION", "cancel_case must enter cancelling");
        return this.validateCancelCase(input, taskUpdates, attemptUpdates, attemptInserts, currentTasks, currentAttempts);
      case "approve":
      case "deny":
        this.requireNoExtraImmutable(input, ["approvalDecision"]);
        this.requireCaseRevision(currentCase, input.nextCaseState, false, true);
        return this.validateApproval(input, taskUpdates, attemptUpdates, attemptInserts, currentTasks, committedAt);
      case "provide_input":
        this.requireNoExtraImmutable(input, ["inputResponse"]);
        this.requireCaseRevision(currentCase, input.nextCaseState, false, true);
        return this.validateInputResponse(input, taskUpdates, attemptUpdates, attemptInserts, currentTasks, committedAt);
      case "authorize_retry":
      case "decline_retry":
        this.requireNoExtraImmutable(input, ["retryDecision"]);
        this.requireCaseRevision(currentCase, input.nextCaseState, false, true);
        return this.validateRetry(input, taskUpdates, attemptUpdates, attemptInserts, currentTasks, committedAt);
      case "cancel_task":
        this.requireNoImmutable(input);
        return this.validateCancelTask(input, currentCase, taskUpdates, attemptUpdates, attemptInserts, currentTasks, currentAttempts);
      case "attempt_progress":
        this.requireNoImmutable(input);
        this.requireCaseRevision(currentCase, input.nextCaseState, false, true);
        return this.validateAttemptProgress(input, taskUpdates, attemptUpdates, attemptInserts, currentTasks, currentAttempts);
      case "attempt_result":
        this.requireNoExtraImmutable(input, ["approvalRequest", "inputRequest"]);
        return this.validateAttemptResult(input, currentCase, taskUpdates, attemptUpdates, attemptInserts, currentTasks, currentAttempts, committedAt);
      case "evidence_set":
        this.requireOnlyCase(input, taskUpdates, attemptUpdates, attemptInserts);
        this.requireOnlyEvidenceSet(input);
        this.requireCaseRevision(currentCase, input.nextCaseState, true, true);
        this.validateEvidenceSet(input, contract);
        return [eventSpec("EvidenceSetCreated", { kind: "case", caseId: input.caseId }), eventSpec("CaseProjectionChanged", { kind: "case", caseId: input.caseId })];
    }
  }

  private requireCaseRevision(current: CaseState, next: CaseState, increment: boolean, sameStatus: boolean): void {
    const expected = current.caseRevision + (increment ? 1 : 0);
    if (next.caseRevision !== expected) inputInvalid("CASE_REVISION", `expected Case revision ${expected}`);
    if (sameStatus && !canonicalEqual(current.status, next.status)) inputInvalid("CASE_PROJECTION", "Case projection update must preserve lifecycle status");
  }

  private requireOnlyCase(input: PreparedControlMutation, tasks: readonly TaskRecord[], attempts: readonly AttemptRecord[], inserts: readonly AttemptRecord[]): void {
    if (tasks.length !== 0 || attempts.length !== 0 || inserts.length !== 0) inputInvalid("MUTATION_SCOPE", `${input.kind} cannot update Task or Attempt rows`);
  }

  private requireNoImmutable(input: PreparedControlMutation): void {
    if (input.checkpoint !== undefined || input.approvalRequest !== undefined || input.approvalDecision !== undefined || input.inputRequest !== undefined || input.inputResponse !== undefined || input.retryDecision !== undefined || input.evidenceSet !== undefined) {
      inputInvalid("MUTATION_SCOPE", `${input.kind} cannot insert immutable control rows`);
    }
  }

  private requireOnlyCheckpoint(input: PreparedControlMutation): void {
    if (input.checkpoint === undefined || input.approvalRequest !== undefined || input.approvalDecision !== undefined || input.inputRequest !== undefined || input.inputResponse !== undefined || input.retryDecision !== undefined || input.evidenceSet !== undefined) {
      inputInvalid("MUTATION_SCOPE", "checkpoint must insert exactly one checkpoint row");
    }
  }

  private requireOnlyEvidenceSet(input: PreparedControlMutation): void {
    if (input.evidenceSet === undefined || input.checkpoint !== undefined || input.approvalRequest !== undefined || input.approvalDecision !== undefined || input.inputRequest !== undefined || input.inputResponse !== undefined || input.retryDecision !== undefined) {
      inputInvalid("MUTATION_SCOPE", "evidence_set must insert exactly one EvidenceSet");
    }
  }

  private requireNoExtraImmutable(input: PreparedControlMutation, allowed: readonly (keyof PreparedControlMutation)[]): void {
    const permitted = new Set(allowed);
    const fields: readonly (keyof PreparedControlMutation)[] = ["checkpoint", "approvalRequest", "approvalDecision", "inputRequest", "inputResponse", "retryDecision", "evidenceSet"];
    if (fields.some((field) => input[field] !== undefined && !permitted.has(field))) {
      inputInvalid("MUTATION_SCOPE", `${input.kind} contains an unrelated immutable row`);
    }
  }

  private validateAttemptInsert(input: PreparedControlMutation, attempt: AttemptRecord, taskUpdates: readonly TaskRecord[], committedAt: string): void {
    if (attempt.caseId !== input.caseId || attempt.attemptRevision !== 1 || attempt.createdAt !== committedAt || attempt.updatedAt !== committedAt || attempt.status.kind !== "dispatch_pending") {
      inputInvalid("ATTEMPT_INSERT", `new Attempt ${attempt.attemptId} is not a revision-1 dispatch_pending row`);
    }
    const task = taskUpdates.find((candidate) => candidate.taskId === attempt.taskId);
    if (task === undefined || task.latestAttemptId !== attempt.attemptId || task.status.kind !== "active" || task.status.attemptId !== attempt.attemptId || attempt.expectedTaskRevision !== task.taskRevision || attempt.operationInputDigest !== task.operation.inputDigest) {
      inputInvalid("ATTEMPT_BINDING", `new Attempt ${attempt.attemptId} is not bound to the updated active Task`);
    }
    const count = this.db.get<{ count: number; max_ordinal: number | null }>(
      "SELECT COUNT(*) AS count, MAX(attempt_ordinal) AS max_ordinal FROM attempts WHERE case_id=? AND task_id=?",
      input.caseId,
      attempt.taskId,
    );
    if (count === undefined || !Number.isSafeInteger(count.count) || count.count >= M1_RELEASE_PROFILE.quota.maxAttemptsPerTask || attempt.ordinal !== (count.max_ordinal ?? 0) + 1) {
      throw new StorageError("QUOTA_EXCEEDED", "ATTEMPTS_PER_TASK", "new Attempt ordinal or quota is invalid");
    }
  }

  private validateOneNonterminalAttempt(caseId: string, taskUpdates: readonly TaskRecord[], updates: readonly AttemptRecord[], inserts: readonly AttemptRecord[]): void {
    const taskIds = new Set([...taskUpdates.map((task) => task.taskId), ...updates.map((attempt) => attempt.taskId), ...inserts.map((attempt) => attempt.taskId)]);
    for (const taskId of taskIds) {
      const rows = this.db.all<{ attempt_id: string; status_kind: string }>("SELECT attempt_id,status_kind FROM attempts WHERE case_id=? AND task_id=? ORDER BY attempt_ordinal", caseId, taskId);
      const keys: AttemptStateKey[] = rows.map((row) => {
        const replacement = updates.find((attempt) => attempt.attemptId === row.attempt_id);
        return replacement === undefined ? (row.status_kind === "terminal" ? "terminal:failed" : row.status_kind as AttemptStateKey) : attemptKey(replacement);
      });
      keys.push(...inserts.filter((attempt) => attempt.taskId === taskId).map(attemptKey));
      try { assertOneNonterminalAttempt(keys); } catch { inputInvalid("NONTERMINAL_ATTEMPT", `Task ${taskId} would have more than one nonterminal Attempt`); }
    }
  }

  private validateCheckpoint(input: PreparedControlMutation, committedAt: string): void {
    const checkpoint = input.checkpoint;
    if (checkpoint === undefined || checkpoint.caseId !== input.caseId || checkpoint.caseRevision !== input.nextCaseState.caseRevision || checkpoint.eventSequence !== input.nextCaseState.eventSequence || checkpoint.createdAt !== committedAt) {
      inputInvalid("CHECKPOINT_BINDING", "checkpoint is not bound to the committed Case snapshot");
    }
    if (this.db.get("SELECT checkpoint_id FROM checkpoints WHERE case_id=? AND checkpoint_id=?", input.caseId, checkpoint.checkpointId) !== undefined) {
      inputInvalid("CHECKPOINT_EXISTS", "checkpoint already exists");
    }
  }

  private validateAllTerminal(caseId: string): void {
    const task = this.db.get<{ count: number }>("SELECT COUNT(*) AS count FROM tasks WHERE case_id=? AND status_kind <> 'terminal'", caseId);
    const attempt = this.db.get<{ count: number }>("SELECT COUNT(*) AS count FROM attempts WHERE case_id=? AND status_kind <> 'terminal'", caseId);
    if ((task?.count ?? -1) !== 0 || (attempt?.count ?? -1) !== 0) inputInvalid("NONTERMINAL_WORK", "Case cannot finish while a Task or Attempt is nonterminal");
  }

  private validateFinishEvidence(contract: CaseContract, next: CaseState): void {
    if (next.status.kind !== "terminal") return;
    const terminal = next.status.terminal;
    if (terminal.outcome === "completed") this.validateExistingCompletionEvidence(contract, next.caseId, terminal.evidenceSetId);
    if (terminal.outcome === "rolled_back") this.validateExistingCompletionEvidence(contract, next.caseId, terminal.rollbackEvidenceSetId);
  }

  private validateCancelCase(
    input: PreparedControlMutation,
    tasks: readonly TaskRecord[],
    attempts: readonly AttemptRecord[],
    inserts: readonly AttemptRecord[],
    currentTasks: ReadonlyMap<string, TaskRecord>,
    currentAttempts: ReadonlyMap<string, AttemptRecord>,
  ): readonly EventSpec[] {
    if (inserts.length !== 0) inputInvalid("MUTATION_SCOPE", "cancel_case cannot create an Attempt");
    const expectedTasks = this.db.all<{ task_id: string }>("SELECT task_id FROM tasks WHERE case_id=? AND status_kind <> 'terminal' ORDER BY task_sequence,task_id", input.caseId).map((row) => row.task_id);
    if (!canonicalEqual(tasks.map((task) => task.taskId), expectedTasks)) inputInvalid("CANCEL_SET", "cancel_case must update every nonterminal Task in stable order");
    const expectedAttempts = this.db.all<{ attempt_id: string }>(
      `SELECT a.attempt_id FROM attempts a JOIN tasks t ON t.case_id=a.case_id AND t.task_id=a.task_id
       WHERE a.case_id=? AND a.status_kind <> 'terminal' ORDER BY t.task_sequence,a.attempt_ordinal,a.attempt_id`,
      input.caseId,
    ).map((row) => row.attempt_id);
    if (!canonicalEqual(attempts.map((attempt) => attempt.attemptId), expectedAttempts)) inputInvalid("CANCEL_SET", "cancel_case must update every nonterminal Attempt in stable order");
    for (const task of tasks) {
      const current = currentTasks.get(task.taskId)!;
      const next = taskKey(task);
      if (next !== "cancelling" && next !== "terminal:cancelled") inputInvalid("TASK_TRANSITION", "cancel_case Task must enter cancelling or cancelled");
      if (current.status.kind === "active" && !attempts.some((attempt) => attempt.taskId === task.taskId)) inputInvalid("CANCEL_SET", "active Task cancellation requires its nonterminal Attempt");
      if (taskKey(current).startsWith("waiting:") && next !== "terminal:cancelled") inputInvalid("TASK_TRANSITION", "waiting Task cancellation must become terminal cancelled");
    }
    for (const attempt of attempts) {
      if (attemptKey(attempt) !== "cancel_requested") inputInvalid("ATTEMPT_TRANSITION", "cancel_case Attempt must enter cancel_requested");
      if (!currentAttempts.has(attempt.attemptId)) inputInvalid("ATTEMPT_BINDING", "cancel_case Attempt is missing its current row");
    }
    const specs: EventSpec[] = [eventSpec("CaseCancellationRequested", { kind: "case", caseId: input.caseId }, { from: caseKey(this.repository.readCaseState(input.caseId)!.value), to: "cancelling" })];
    for (const task of tasks) {
      const current = currentTasks.get(task.taskId)!;
      specs.push(eventSpec("TaskCancellationRequested", { kind: "task", taskId: task.taskId }, { from: taskKey(current), to: taskKey(task) }));
    }
    for (const attempt of attempts) {
      const currentAttempt = currentAttempts.get(attempt.attemptId)!;
      specs.push(eventSpec("AttemptCancellationRequested", { kind: "attempt", attemptId: attempt.attemptId }, { from: attemptKey(currentAttempt), to: "cancel_requested" }));
    }
    return specs;
  }

  private validateApproval(
    input: PreparedControlMutation,
    tasks: readonly TaskRecord[],
    attempts: readonly AttemptRecord[],
    inserts: readonly AttemptRecord[],
    currentTasks: ReadonlyMap<string, TaskRecord>,
    committedAt: string,
  ): readonly EventSpec[] {
    if (tasks.length !== 1 || attempts.length !== 0 || inserts.length > 1 || input.taskId !== tasks[0].taskId || input.approvalDecision === undefined) inputInvalid("MUTATION_SCOPE", "approval decision must update one Task and optionally create one Attempt");
    const current = currentTasks.get(tasks[0].taskId)!;
    if (current.status.kind !== "waiting" || current.status.waiting.reason !== "approval" || input.approvalDecision.approvalRequestId !== current.status.waiting.approvalRequestId) inputInvalid("OUTSTANDING_REQUEST", "approval decision does not match the outstanding request");
    this.requireOutstandingApproval(current, current.status.waiting.approvalRequestId);
    if (input.approvalDecision.caseId !== input.caseId || input.approvalDecision.taskId !== current.taskId || input.approvalDecision.expectedTaskRevision !== current.taskRevision || input.approvalDecision.createdAt !== committedAt) inputInvalid("DECISION_BINDING", "approval decision selectors are invalid");
    if ((input.kind === "approve") !== (input.approvalDecision.decision.kind === "approve")) inputInvalid("DECISION_BINDING", "approval action and decision kind differ");
    if (input.kind === "deny") {
      if (taskKey(tasks[0]) !== "terminal:denied" || tasks[0].status.kind !== "terminal" || tasks[0].status.terminal.outcome !== "denied" || tasks[0].status.terminal.approvalDecisionId !== input.approvalDecision.approvalDecisionId) {
        inputInvalid("TASK_TRANSITION", "deny must terminalize the Task with the matching approval decision");
      }
    }
    if (input.kind === "approve" && !["ready", "active"].includes(taskKey(tasks[0]))) inputInvalid("TASK_TRANSITION", "approve must move the Task to ready or active");
    if (input.kind === "approve") this.validateOptionalAttempt(tasks[0], inserts);
    else if (inserts.length !== 0) inputInvalid("ATTEMPT_BINDING", "deny cannot create an Attempt");
    return [
      eventSpec("ApprovalDecisionRecorded", { kind: "task", taskId: current.taskId }),
      eventSpec("TaskTransitioned", { kind: "task", taskId: current.taskId }, { from: taskKey(current), to: taskKey(tasks[0]) }),
      ...inserts.map((attempt) => eventSpec("AttemptCreated", { kind: "attempt", attemptId: attempt.attemptId })),
    ];
  }

  private validateInputResponse(
    input: PreparedControlMutation,
    tasks: readonly TaskRecord[],
    attempts: readonly AttemptRecord[],
    inserts: readonly AttemptRecord[],
    currentTasks: ReadonlyMap<string, TaskRecord>,
    committedAt: string,
  ): readonly EventSpec[] {
    if (tasks.length !== 1 || attempts.length !== 0 || inserts.length > 1 || input.taskId !== tasks[0].taskId || input.inputResponse === undefined) inputInvalid("MUTATION_SCOPE", "input response must update one Task and optionally create one Attempt");
    const current = currentTasks.get(tasks[0].taskId)!;
    if (current.status.kind !== "waiting" || current.status.waiting.reason !== "input" || input.inputResponse.inputRequestId !== current.status.waiting.inputRequestId) inputInvalid("OUTSTANDING_REQUEST", "input response does not match the outstanding request");
    this.requireOutstandingInput(current, current.status.waiting.inputRequestId);
    if (input.inputResponse.caseId !== input.caseId || input.inputResponse.taskId !== current.taskId || input.inputResponse.expectedTaskRevision !== current.taskRevision || input.inputResponse.createdAt !== committedAt) inputInvalid("RESPONSE_BINDING", "input response selectors are invalid");
    if (!["ready", "active"].includes(taskKey(tasks[0]))) inputInvalid("TASK_TRANSITION", "provide_input must move the Task to ready or active");
    this.validateOptionalAttempt(tasks[0], inserts);
    return [
      eventSpec("InputResponseRecorded", { kind: "task", taskId: current.taskId }),
      eventSpec("TaskTransitioned", { kind: "task", taskId: current.taskId }, { from: taskKey(current), to: taskKey(tasks[0]) }),
      ...inserts.map((attempt) => eventSpec("AttemptCreated", { kind: "attempt", attemptId: attempt.attemptId })),
    ];
  }

  private validateRetry(
    input: PreparedControlMutation,
    tasks: readonly TaskRecord[],
    attempts: readonly AttemptRecord[],
    inserts: readonly AttemptRecord[],
    currentTasks: ReadonlyMap<string, TaskRecord>,
    committedAt: string,
  ): readonly EventSpec[] {
    if (tasks.length !== 1 || attempts.length !== 0 || inserts.length > 1 || input.taskId !== tasks[0].taskId || input.retryDecision === undefined) inputInvalid("MUTATION_SCOPE", "retry decision must update one Task and optionally create one Attempt");
    const current = currentTasks.get(tasks[0].taskId)!;
    if (current.status.kind !== "waiting" || current.status.waiting.reason !== "retry_decision" || input.retryDecision.retryDecisionId !== current.status.waiting.retryDecisionId) inputInvalid("OUTSTANDING_REQUEST", "retry decision does not match the outstanding slot");
    this.requireOutstandingRetry(current, current.status.waiting.retryDecisionId);
    if (input.retryDecision.caseId !== input.caseId || input.retryDecision.taskId !== current.taskId || input.retryDecision.expectedTaskRevision !== current.taskRevision || input.retryDecision.createdAt !== committedAt || input.retryDecision.attemptId !== current.latestAttemptId) inputInvalid("DECISION_BINDING", "retry decision selectors are invalid");
    if ((input.kind === "authorize_retry") !== (input.retryDecision.decision.kind === "authorize_retry")) inputInvalid("DECISION_BINDING", "retry action and decision kind differ");
    if (input.kind === "authorize_retry" && !["ready", "active"].includes(taskKey(tasks[0]))) inputInvalid("TASK_TRANSITION", "authorize_retry must move the Task to ready or active");
    if (input.kind === "decline_retry" && !["terminal:cancelled", "terminal:unverified"].includes(taskKey(tasks[0]))) inputInvalid("TASK_TRANSITION", "decline_retry must terminalize the Task");
    if (input.kind === "authorize_retry") this.validateOptionalAttempt(tasks[0], inserts);
    else if (inserts.length !== 0) inputInvalid("ATTEMPT_BINDING", "decline_retry cannot create an Attempt");
    return [
      eventSpec("RetryDecisionRecorded", { kind: "task", taskId: current.taskId }),
      eventSpec("TaskTransitioned", { kind: "task", taskId: current.taskId }, { from: taskKey(current), to: taskKey(tasks[0]) }),
      ...inserts.map((attempt) => eventSpec("AttemptCreated", { kind: "attempt", attemptId: attempt.attemptId })),
    ];
  }

  private requireOutstandingApproval(task: TaskRecord, approvalRequestId: string): void {
    const row = this.db.get<SqlRow & { case_id:string; approval_request_id:string; task_id:string; expected_task_revision:number; request_json:Blob; request_digest:string; created_at:string }>(
      "SELECT * FROM approval_requests WHERE case_id=? AND approval_request_id=?", task.caseId, approvalRequestId,
    );
    if (row === undefined) inputInvalid("OUTSTANDING_REQUEST", "approval request row is missing");
    const value = this.internal.decodeApprovalRequest(bytes(row.request_json, "approval_requests.request_json"), row.request_digest).value;
    if (value.caseId !== row.case_id || value.approvalRequestId !== row.approval_request_id || value.taskId !== row.task_id || value.expectedTaskRevision !== row.expected_task_revision || value.createdAt !== row.created_at || value.taskId !== task.taskId || value.expectedTaskRevision !== task.taskRevision) inputInvalid("OUTSTANDING_REQUEST", "approval request selectors do not match the waiting Task");
    if (this.db.get("SELECT approval_decision_id FROM approval_decisions WHERE case_id=? AND approval_request_id=?", task.caseId, approvalRequestId) !== undefined) inputInvalid("OUTSTANDING_REQUEST", "approval request is already decided");
  }

  private requireOutstandingInput(task: TaskRecord, inputRequestId: string): void {
    const row = this.db.get<SqlRow & { case_id:string; input_request_id:string; task_id:string; expected_task_revision:number; input_schema_digest:string; request_json:Blob; request_digest:string; created_at:string }>(
      "SELECT * FROM input_requests WHERE case_id=? AND input_request_id=?", task.caseId, inputRequestId,
    );
    if (row === undefined) inputInvalid("OUTSTANDING_REQUEST", "input request row is missing");
    const value = this.internal.decodeInputRequest(bytes(row.request_json, "input_requests.request_json"), row.request_digest).value;
    if (value.caseId !== row.case_id || value.inputRequestId !== row.input_request_id || value.taskId !== row.task_id || value.expectedTaskRevision !== row.expected_task_revision || value.inputSchemaDigest !== row.input_schema_digest || value.createdAt !== row.created_at || value.taskId !== task.taskId || value.expectedTaskRevision !== task.taskRevision) inputInvalid("OUTSTANDING_REQUEST", "input request selectors do not match the waiting Task");
    if (this.db.get("SELECT input_response_id FROM input_responses WHERE case_id=? AND input_request_id=?", task.caseId, inputRequestId) !== undefined) inputInvalid("OUTSTANDING_REQUEST", "input request is already answered");
  }

  private requireOutstandingRetry(task: TaskRecord, retryDecisionId: string): void {
    if (task.latestAttemptId === undefined) inputInvalid("OUTSTANDING_REQUEST", "retry decision requires a latest Attempt");
    if (this.db.get("SELECT retry_decision_id FROM retry_decisions WHERE case_id=? AND retry_decision_id=?", task.caseId, retryDecisionId) !== undefined) inputInvalid("OUTSTANDING_REQUEST", "retry decision slot is already decided");
  }

  private validateOptionalAttempt(task: TaskRecord, inserts: readonly AttemptRecord[]): void {
    if (inserts.length === 0 && taskKey(task) !== "ready") inputInvalid("ATTEMPT_BINDING", "active Task transition requires a new Attempt");
    if (inserts.length === 1 && (taskKey(task) !== "active" || inserts[0].taskId !== task.taskId)) inputInvalid("ATTEMPT_BINDING", "new Attempt must activate the same Task");
  }

  private validateCancelTask(
    input: PreparedControlMutation,
    currentCase: CaseState,
    tasks: readonly TaskRecord[],
    attempts: readonly AttemptRecord[],
    inserts: readonly AttemptRecord[],
    currentTasks: ReadonlyMap<string, TaskRecord>,
    currentAttempts: ReadonlyMap<string, AttemptRecord>,
  ): readonly EventSpec[] {
    if (tasks.length !== 1 || attempts.length > 1 || inserts.length !== 0 || input.taskId !== tasks[0].taskId) inputInvalid("MUTATION_SCOPE", "cancel_task must update one Task and at most one current Attempt");
    const current = currentTasks.get(tasks[0].taskId)!;
    if (!["cancelling", "terminal:cancelled"].includes(taskKey(tasks[0]))) inputInvalid("TASK_TRANSITION", "cancel_task must enter cancelling or cancelled");
    if (attempts.length === 1) {
      if (attempts[0].attemptId !== current.latestAttemptId || attemptKey(attempts[0]) !== "cancel_requested" || !currentAttempts.has(attempts[0].attemptId)) inputInvalid("ATTEMPT_BINDING", "cancel_task Attempt must be the current latest Attempt entering cancel_requested");
    } else if (current.status.kind === "active") {
      inputInvalid("ATTEMPT_BINDING", "active Task cancellation requires its latest Attempt");
    }
    const projected = input.nextCaseState.caseRevision === currentCase.caseRevision + 1;
    this.requireCaseRevision(currentCase, input.nextCaseState, projected, true);
    const specs: EventSpec[] = [eventSpec("TaskCancellationRequested", { kind: "task", taskId: current.taskId }, { from: taskKey(current), to: taskKey(tasks[0]) })];
    if (attempts.length === 1) {
      const currentAttempt = currentAttempts.get(attempts[0].attemptId)!;
      specs.push(eventSpec("AttemptCancellationRequested", { kind: "attempt", attemptId: attempts[0].attemptId }, { from: attemptKey(currentAttempt), to: "cancel_requested" }));
    }
    if (projected) specs.push(eventSpec("CaseProjectionChanged", { kind: "case", caseId: input.caseId }));
    return specs;
  }

  private validateAttemptProgress(
    input: PreparedControlMutation,
    tasks: readonly TaskRecord[],
    attempts: readonly AttemptRecord[],
    inserts: readonly AttemptRecord[],
    currentTasks: ReadonlyMap<string, TaskRecord>,
    currentAttempts: ReadonlyMap<string, AttemptRecord>,
  ): readonly EventSpec[] {
    if (attempts.length !== 1 || attempts[0].attemptId !== input.attemptId || inserts.length !== 0 || tasks.length > 1 || terminalAttempt(attempts[0])) inputInvalid("MUTATION_SCOPE", "attempt_progress must update one nonterminal Attempt and at most one Task projection");
    if (tasks.length === 1 && tasks[0].taskId !== attempts[0].taskId) inputInvalid("TASK_BINDING", "Attempt progress Task projection is bound to another Task");
    const currentAttempt = currentAttempts.get(attempts[0].attemptId)!;
    const specs: EventSpec[] = [eventSpec("AttemptTransitioned", { kind: "attempt", attemptId: attempts[0].attemptId }, { from: attemptKey(currentAttempt), to: attemptKey(attempts[0]) })];
    if (tasks.length === 1) {
      const currentTask = currentTasks.get(tasks[0].taskId)!;
      specs.push(eventSpec("TaskProjectionChanged", { kind: "task", taskId: tasks[0].taskId }, taskKey(currentTask) === taskKey(tasks[0]) ? undefined : { from: taskKey(currentTask), to: taskKey(tasks[0]) }));
    }
    return specs;
  }

  private validateAttemptResult(
    input: PreparedControlMutation,
    currentCase: CaseState,
    tasks: readonly TaskRecord[],
    attempts: readonly AttemptRecord[],
    inserts: readonly AttemptRecord[],
    currentTasks: ReadonlyMap<string, TaskRecord>,
    currentAttempts: ReadonlyMap<string, AttemptRecord>,
    committedAt: string,
  ): readonly EventSpec[] {
    if (attempts.length !== 1 || tasks.length !== 1 || inserts.length !== 0 || attempts[0].attemptId !== input.attemptId || tasks[0].taskId !== input.taskId || attempts[0].taskId !== tasks[0].taskId || !terminalAttempt(attempts[0])) inputInvalid("MUTATION_SCOPE", "attempt_result must terminalize one Attempt and update its Task");
    const currentAttempt = currentAttempts.get(attempts[0].attemptId)!;
    const currentTask = currentTasks.get(tasks[0].taskId)!;
    if (currentTask.latestAttemptId !== attempts[0].attemptId) inputInvalid("ATTEMPT_BINDING", "attempt_result must target the Task latest Attempt");
    if (attempts[0].status.kind !== "terminal") inputInvalid("ATTEMPT_TRANSITION", "attempt_result requires a terminal Attempt");
    if (attempts[0].status.terminal.outcome === "input_required") {
      if (taskKey(tasks[0]) !== "waiting:input" || input.inputRequest === undefined) inputInvalid("OUTSTANDING_REQUEST", "input_required must create an input request and waiting Task");
    }
    if (taskKey(tasks[0]) === "waiting:input") {
      if (input.inputRequest === undefined || tasks[0].status.kind !== "waiting" || tasks[0].status.waiting.reason !== "input" || input.inputRequest.caseId !== input.caseId || input.inputRequest.taskId !== tasks[0].taskId || input.inputRequest.expectedTaskRevision !== tasks[0].taskRevision || input.inputRequest.inputRequestId !== tasks[0].status.waiting.inputRequestId || input.inputRequest.createdAt !== committedAt) inputInvalid("OUTSTANDING_REQUEST", "input request is not bound to the updated Task");
    } else if (input.inputRequest !== undefined) {
      inputInvalid("OUTSTANDING_REQUEST", "input request requires a waiting input Task");
    }
    if (taskKey(tasks[0]) === "waiting:approval") {
      if (input.approvalRequest === undefined || tasks[0].status.kind !== "waiting" || tasks[0].status.waiting.reason !== "approval" || input.approvalRequest.caseId !== input.caseId || input.approvalRequest.taskId !== tasks[0].taskId || input.approvalRequest.expectedTaskRevision !== tasks[0].taskRevision || input.approvalRequest.approvalRequestId !== tasks[0].status.waiting.approvalRequestId || input.approvalRequest.createdAt !== committedAt) inputInvalid("OUTSTANDING_REQUEST", "approval request is not bound to the updated Task");
    } else if (input.approvalRequest !== undefined) {
      inputInvalid("OUTSTANDING_REQUEST", "approval request requires a waiting approval Task");
    }
    if (taskKey(tasks[0]) === "waiting:retry_decision" && input.retryDecision !== undefined) {
      inputInvalid("OUTSTANDING_REQUEST", "retry decision row must not exist before the decision is made");
    }
    const projected = input.nextCaseState.caseRevision === currentCase.caseRevision + 1;
    this.requireCaseRevision(currentCase, input.nextCaseState, projected, true);
    const taskEvent = terminalTask(tasks[0]) ? "TaskTerminal" : "TaskTransitioned";
    const specs: EventSpec[] = [
      eventSpec("AttemptTerminal", { kind: "attempt", attemptId: attempts[0].attemptId }, { from: attemptKey(currentAttempt), to: attemptKey(attempts[0]) }),
      eventSpec(taskEvent, { kind: "task", taskId: tasks[0].taskId }, { from: taskKey(currentTask), to: taskKey(tasks[0]) }),
    ];
    if (projected) specs.push(eventSpec("CaseProjectionChanged", { kind: "case", caseId: input.caseId }));
    return specs;
  }

  private validateEvidenceSet(input: PreparedControlMutation, contract: CaseContract): void {
    const evidence = input.evidenceSet;
    if (evidence === undefined || evidence.caseId !== input.caseId || evidence.createdAt !== input.events[0].committedAt) inputInvalid("EVIDENCE_BINDING", "EvidenceSet is not bound to the committed Case");
    requireDigest(evidence.evidenceSetDigest, "evidenceSetDigest");
    if (this.db.get("SELECT evidence_set_id FROM evidence_sets WHERE case_id=? AND evidence_set_id=?", input.caseId, evidence.evidenceSetId) !== undefined) inputInvalid("EVIDENCE_EXISTS", "EvidenceSet already exists");
    this.validateEvidenceMappings(contract, evidence);
  }

  private validateEvidenceMappings(contract: CaseContract, evidence: EvidenceSet): void {
    const criteria = new Map(contract.acceptanceCriteria.map((criterion) => [criterion.criterionId, criterion]));
    const requirements = new Map(contract.verificationRequirements.map((requirement) => [requirement.requirementId, requirement]));
    for (const mapping of evidence.mappings) {
      const criterion = criteria.get(mapping.criterionId);
      if (criterion === undefined) inputInvalid("EVIDENCE_CRITERION", `unknown criterion ${mapping.criterionId}`);
      if (new Set(mapping.requirementIds).size !== mapping.requirementIds.length) inputInvalid("EVIDENCE_REQUIREMENT", `duplicate requirement in ${mapping.criterionId}`);
      for (const requirementId of mapping.requirementIds) {
        const requirement = requirements.get(requirementId);
        if (requirement === undefined || !requirement.criterionIds.includes(mapping.criterionId)) inputInvalid("EVIDENCE_REQUIREMENT", `requirement ${requirementId} is not owned by ${mapping.criterionId}`);
      }
      for (const reference of mapping.evidenceRefs) this.validateEvidenceRef(inputCaseId(evidence), mapping.requirementIds, requirements, reference);
    }
    const requiredByCriterion: Record<string, readonly string[]> = {};
    for (const requirement of contract.verificationRequirements) {
      for (const criterionId of requirement.criterionIds) {
        requiredByCriterion[criterionId] = [...(requiredByCriterion[criterionId] ?? []), requirement.requirementId];
      }
    }
    const errors = completionEvidenceErrors(
      contract.acceptanceCriteria.filter((criterion) => criterion.mandatory).map((criterion) => criterion.criterionId),
      requiredByCriterion,
      evidence.mappings.map((mapping) => ({ criterionId: mapping.criterionId, requirementIds: mapping.requirementIds, evidenceCount: mapping.evidenceRefs.length })),
    );
    if (errors.length !== 0) inputInvalid("EVIDENCE_INCOMPLETE", errors.join("; "));
  }

  private validateEvidenceRef(caseId: string, requirementIds: readonly string[], requirements: ReadonlyMap<string, CaseContract["verificationRequirements"][number]>, reference: EvidenceRef): void {
    if (reference.kind === "task_result") {
      const task = this.repository.readTask(caseId, reference.taskId)?.value;
      if (task === undefined || task.status.kind !== "terminal" || task.status.terminal.outcome !== "succeeded" || task.status.terminal.result.resultDigest !== reference.resultDigest) inputInvalid("EVIDENCE_TASK_RESULT", "task_result evidence is not owned by a succeeded Task result");
      return;
    }
    if (reference.kind === "artifact") {
      const row = this.db.get<ArtifactRow>("SELECT * FROM artifact_refs WHERE case_id=? AND artifact_id=?", caseId, reference.artifactId);
      if (row === undefined) inputInvalid("EVIDENCE_ARTIFACT", "artifact evidence metadata does not exist");
      const artifact = this.artifactCodec.decode(bytes(row.artifact_json, "artifact_refs.artifact_json"), row.artifact_digest).value;
      if (artifact.caseId !== row.case_id || artifact.artifactId !== row.artifact_id || (artifact.taskId ?? null) !== row.task_id || artifact.mediaType !== row.media_type || artifact.bytes !== row.byte_length || artifact.sha256 !== row.sha256 || artifact.createdAt !== row.created_at || artifact.sha256 !== reference.sha256 || row.r2_generation < 1 || row.retention_class.length === 0) inputInvalid("EVIDENCE_ARTIFACT", "artifact evidence selectors are invalid");
      return;
    }
    const allowedLayers = new Set(requirementIds.map((id) => requirements.get(id)?.layer).filter((layer): layer is string => layer !== undefined));
    if (allowedLayers.size > 0 && !allowedLayers.has(reference.layer)) inputInvalid("EVIDENCE_LAYER", `observation layer ${reference.layer} is not required by the mapping`);
  }

  private validateExistingCompletionEvidence(contract: CaseContract, caseId: string, evidenceSetId: string): void {
    const row = this.db.get<EvidenceSetRow>("SELECT * FROM evidence_sets WHERE case_id=? AND evidence_set_id=?", caseId, evidenceSetId);
    if (row === undefined) inputInvalid("EVIDENCE_MISSING", "terminal completion evidence set is missing");
    const evidence = this.repository.codecs.evidenceSet.decode(bytes(row.evidence_set_json, "evidence_sets.evidence_set_json"), row.record_digest).value;
    if (evidence.caseId !== row.case_id || evidence.evidenceSetId !== row.evidence_set_id || evidence.evidenceSetDigest !== row.evidence_set_digest || evidence.createdAt !== row.created_at) throw new StorageError("STORAGE_CORRUPT", "SELECTOR_MISMATCH", "EvidenceSet selectors are invalid");
    this.validateEvidenceMappings(contract, evidence);
  }

  private validateEvents(input: PreparedControlMutation, currentSequence: number, committedAt: string, specs: readonly EventSpec[]): void {
    if (input.events.length !== specs.length) inputInvalid("EVENT_MATRIX", `expected ${specs.length} Events for ${input.kind}`);
    for (let index = 0; index < specs.length; index += 1) {
      const event = input.events[index];
      const spec = specs[index];
      if (
        event.caseId !== input.caseId ||
        event.sequence !== currentSequence + index + 1 ||
        event.eventType !== spec.eventType ||
        event.causationId !== input.requestId ||
        event.correlationId !== input.caseId ||
        event.committedAt !== committedAt ||
        event.actor.kind !== "system" || event.actor.component !== "case_do" ||
        !entityEqual(event.entity, spec.entity) ||
        !optionalCanonicalEqual(event.transition, spec.transition)
      ) inputInvalid("EVENT_BINDING", `Event ${index + 1} is not exactly bound to ${input.kind}`);
    }
  }

  private insertImmutableRows(input: PreparedControlMutation, committedAt: string): void {
    if (input.checkpoint !== undefined) {
      const record = this.internal.encode(input.checkpoint as unknown as JsonValue);
      this.db.run(
        `INSERT INTO checkpoints(case_id,checkpoint_id,case_revision,event_sequence,checkpoint_json,checkpoint_digest,created_at)
         VALUES(?,?,?,?,?,?,?)`,
        input.caseId,
        input.checkpoint.checkpointId,
        input.checkpoint.caseRevision,
        input.checkpoint.eventSequence,
        record.bytes,
        record.digest,
        input.checkpoint.createdAt,
      );
    }
    if (input.approvalRequest !== undefined) {
      const record = this.internal.encode(input.approvalRequest as unknown as JsonValue);
      this.db.run(
        `INSERT INTO approval_requests(case_id,approval_request_id,task_id,expected_task_revision,request_json,request_digest,created_at)
         VALUES(?,?,?,?,?,?,?)`,
        input.caseId,
        input.approvalRequest.approvalRequestId,
        input.approvalRequest.taskId,
        input.approvalRequest.expectedTaskRevision,
        record.bytes,
        record.digest,
        input.approvalRequest.createdAt,
      );
    }
    if (input.approvalDecision !== undefined) {
      const record = this.internal.encode(input.approvalDecision as unknown as JsonValue);
      this.db.run(
        `INSERT INTO approval_decisions(case_id,approval_decision_id,approval_request_id,expected_task_revision,decision_json,decision_digest,created_at)
         VALUES(?,?,?,?,?,?,?)`,
        input.caseId,
        input.approvalDecision.approvalDecisionId,
        input.approvalDecision.approvalRequestId,
        input.approvalDecision.expectedTaskRevision,
        record.bytes,
        record.digest,
        input.approvalDecision.createdAt,
      );
    }
    if (input.inputRequest !== undefined) {
      const record = this.internal.encode(input.inputRequest as unknown as JsonValue);
      this.db.run(
        `INSERT INTO input_requests(case_id,input_request_id,task_id,expected_task_revision,input_schema_digest,request_json,request_digest,created_at)
         VALUES(?,?,?,?,?,?,?,?)`,
        input.caseId,
        input.inputRequest.inputRequestId,
        input.inputRequest.taskId,
        input.inputRequest.expectedTaskRevision,
        input.inputRequest.inputSchemaDigest,
        record.bytes,
        record.digest,
        input.inputRequest.createdAt,
      );
    }
    if (input.inputResponse !== undefined) {
      const record = this.internal.encode(input.inputResponse as unknown as JsonValue);
      this.db.run(
        `INSERT INTO input_responses(case_id,input_response_id,input_request_id,expected_task_revision,response_json,response_digest,created_at)
         VALUES(?,?,?,?,?,?,?)`,
        input.caseId,
        input.inputResponse.inputResponseId,
        input.inputResponse.inputRequestId,
        input.inputResponse.expectedTaskRevision,
        record.bytes,
        record.digest,
        input.inputResponse.createdAt,
      );
    }
    if (input.retryDecision !== undefined) {
      const record = this.internal.encode(input.retryDecision as unknown as JsonValue);
      this.db.run(
        `INSERT INTO retry_decisions(case_id,retry_decision_id,task_id,attempt_id,expected_task_revision,decision_json,decision_digest,created_at)
         VALUES(?,?,?,?,?,?,?,?)`,
        input.caseId,
        input.retryDecision.retryDecisionId,
        input.retryDecision.taskId,
        input.retryDecision.attemptId,
        input.retryDecision.expectedTaskRevision,
        record.bytes,
        record.digest,
        input.retryDecision.createdAt,
      );
    }
    if (input.evidenceSet !== undefined) {
      const evidenceRecord = this.repository.codecs.evidenceSet.encode(input.evidenceSet);
      this.db.run(
        `INSERT INTO evidence_sets(case_id,evidence_set_id,case_revision,event_sequence,evidence_set_json,evidence_set_digest,record_digest,created_at)
         VALUES(?,?,?,?,?,?,?,?)`,
        input.caseId,
        input.evidenceSet.evidenceSetId,
        input.nextCaseState.caseRevision,
        input.nextCaseState.eventSequence,
        evidenceRecord.bytes,
        input.evidenceSet.evidenceSetDigest,
        evidenceRecord.digest,
        input.evidenceSet.createdAt,
      );
      for (const mapping of input.evidenceSet.mappings) {
        const mappingRecord = this.internal.encode(mapping as unknown as JsonValue);
        this.db.run(
          `INSERT INTO evidence_mappings(case_id,evidence_set_id,criterion_id,mapping_json,mapping_digest)
           VALUES(?,?,?,?,?)`,
          input.caseId,
          input.evidenceSet.evidenceSetId,
          mapping.criterionId,
          mappingRecord.bytes,
          mappingRecord.digest,
        );
        for (let index = 0; index < mapping.evidenceRefs.length; index += 1) {
          const reference = mapping.evidenceRefs[index];
          const referenceRecord = this.internal.encode(reference as unknown as JsonValue);
          const referenceId = `eref_${canonicalJsonDigest(encodeCanonicalJson([mapping.criterionId, index, reference] as unknown as JsonValue)).slice(0, 32)}`;
          const subjectKind = reference.kind === "task_result" ? "task" : reference.kind === "artifact" ? "artifact" : "case";
          const subjectId = reference.kind === "task_result" ? reference.taskId : reference.kind === "artifact" ? reference.artifactId : input.caseId;
          this.db.run(
            `INSERT INTO evidence_refs(case_id,evidence_set_id,criterion_id,evidence_ref_id,reference_kind,subject_kind,subject_id,artifact_id,event_sequence,evidence_json,evidence_digest)
             VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
            input.caseId,
            input.evidenceSet.evidenceSetId,
            mapping.criterionId,
            referenceId,
            reference.kind,
            subjectKind,
            subjectId,
            reference.kind === "artifact" ? reference.artifactId : null,
            null,
            referenceRecord.bytes,
            referenceRecord.digest,
          );
        }
      }
    }
    void committedAt;
  }

  private classifyCaseWrite(caseId: string, expected: CaseState): never {
    const current = this.repository.readCaseState(caseId)?.value;
    if (current === undefined) throw new StorageError("STORAGE_CORRUPT", "CASE_MISSING", "Case state disappeared during mutation");
    if (current.status.kind === "terminal") inputInvalid("TERMINAL_IMMUTABLE", "Case became terminal");
    if (current.caseRevision !== expected.caseRevision || current.eventSequence !== expected.eventSequence) inputInvalid("REVISION_CONFLICT", "Case revision or Event sequence changed");
    throw new StorageError("STORAGE_CORRUPT", "CASE_UPDATE_FAILED", "Case update matched no row");
  }

  private classifyTaskWrite(caseId: string, taskId: string, expectedRevision: number): never {
    const current = this.repository.readTask(caseId, taskId)?.value;
    if (current === undefined) throw new StorageError("STORAGE_CORRUPT", "TASK_MISSING", "Task disappeared during mutation");
    if (terminalTask(current)) inputInvalid("TERMINAL_IMMUTABLE", "Task became terminal");
    if (current.taskRevision !== expectedRevision) inputInvalid("REVISION_CONFLICT", "Task revision changed");
    throw new StorageError("STORAGE_CORRUPT", "TASK_UPDATE_FAILED", "Task update matched no row");
  }

  private classifyAttemptWrite(caseId: string, taskId: string, attemptId: string, expectedRevision: number): never {
    const current = this.repository.readAttempt(caseId, taskId, attemptId)?.value;
    if (current === undefined) throw new StorageError("STORAGE_CORRUPT", "ATTEMPT_MISSING", "Attempt disappeared during mutation");
    if (terminalAttempt(current)) inputInvalid("TERMINAL_IMMUTABLE", "Attempt became terminal");
    if (current.attemptRevision !== expectedRevision) inputInvalid("REVISION_CONFLICT", "Attempt revision changed");
    throw new StorageError("STORAGE_CORRUPT", "ATTEMPT_UPDATE_FAILED", "Attempt update matched no row");
  }
}

function inputCaseId(evidence: EvidenceSet): string {
  return evidence.caseId;
}
