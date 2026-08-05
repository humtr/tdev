import type {
  EvidenceRef,
  JsonValue,
  Sha256,
} from "../../protocol/generated/typescript/types.ts";
import { SchemaValidator } from "../../protocol/runtime/typescript/schema.ts";
import { StoredRecordCodec, type StoredCanonicalRecord } from "./records.ts";
import { StorageError } from "./schema.ts";

export type ApprovalRequestRecordV1 = Readonly<{
  schemaVersion: 1;
  approvalRequestId: string;
  caseId: string;
  taskId: string;
  expectedTaskRevision: number;
  request: JsonValue;
  createdAt: string;
}>;

export type ApprovalDecisionRecordV1 = Readonly<{
  schemaVersion: 1;
  approvalDecisionId: string;
  approvalRequestId: string;
  caseId: string;
  taskId: string;
  expectedTaskRevision: number;
  decision: Readonly<{
    kind: "approve";
    evidenceDigest: Sha256;
  }> | Readonly<{
    kind: "deny";
    reason: string;
  }>;
  createdAt: string;
}>;

export type InputRequestRecordV1 = Readonly<{
  schemaVersion: 1;
  inputRequestId: string;
  caseId: string;
  taskId: string;
  expectedTaskRevision: number;
  inputSchemaDigest: Sha256;
  request: JsonValue;
  createdAt: string;
}>;

export type InputResponseRecordV1 = Readonly<{
  schemaVersion: 1;
  inputResponseId: string;
  inputRequestId: string;
  caseId: string;
  taskId: string;
  expectedTaskRevision: number;
  value: JsonValue;
  createdAt: string;
}>;

export type RetryDecisionRecordV1 = Readonly<{
  schemaVersion: 1;
  retryDecisionId: string;
  caseId: string;
  taskId: string;
  attemptId: string;
  expectedTaskRevision: number;
  decision: Readonly<{ kind: "authorize_retry" }> | Readonly<{
    kind: "decline_retry";
    terminal: "cancelled" | "unverified";
  }>;
  createdAt: string;
}>;

export type CheckpointRecordV1 = Readonly<{
  schemaVersion: 1;
  checkpointId: string;
  caseId: string;
  caseRevision: number;
  eventSequence: number;
  summary: string;
  completedTaskIds: readonly string[];
  pendingDecisionIds: readonly string[];
  evidenceRefs: readonly EvidenceRef[];
  createdAt: string;
}>;

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new StorageError("STORAGE_CORRUPT", "INTERNAL_RECORD_SHAPE", `${label} must be an exact object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new StorageError("STORAGE_CORRUPT", "INTERNAL_RECORD_SHAPE", `${label} has unexpected fields`);
  }
}

function nonempty(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new StorageError("STORAGE_CORRUPT", "INTERNAL_RECORD_SHAPE", `${label} must be a nonempty string`);
  }
  return value;
}

function positive(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new StorageError("STORAGE_CORRUPT", "INTERNAL_RECORD_SHAPE", `${label} must be a positive safe integer`);
  }
  return value as number;
}

function nonnegative(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new StorageError("STORAGE_CORRUPT", "INTERNAL_RECORD_SHAPE", `${label} must be a nonnegative safe integer`);
  }
  return value as number;
}

function digest(value: unknown, label: string): string {
  const text = nonempty(value, label);
  if (!/^[0-9a-f]{64}$/.test(text)) {
    throw new StorageError("STORAGE_CORRUPT", "INTERNAL_RECORD_SHAPE", `${label} must be a lowercase SHA-256 digest`);
  }
  return text;
}

function timestamp(value: unknown, label: string): string {
  const text = nonempty(value, label);
  const millis = Date.parse(text);
  const canonical = Number.isFinite(millis) ? new Date(millis).toISOString() : "";
  const exact = canonical === text || (canonical.endsWith(".000Z") && canonical.slice(0, -5) + "Z" === text);
  if (!exact) {
    throw new StorageError("STORAGE_CORRUPT", "INTERNAL_RECORD_SHAPE", `${label} must be a canonical timestamp`);
  }
  return text;
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new StorageError("STORAGE_CORRUPT", "INTERNAL_RECORD_SHAPE", `${label} must be an array of nonempty strings`);
  }
  if (new Set(value).size !== value.length) {
    throw new StorageError("STORAGE_CORRUPT", "INTERNAL_RECORD_SHAPE", `${label} must not contain duplicates`);
  }
  return value as readonly string[];
}

function schemaVersion(value: unknown, label: string): void {
  if (value !== 1) {
    throw new StorageError("STORAGE_CORRUPT", "INTERNAL_RECORD_SHAPE", `${label}.schemaVersion must be 1`);
  }
}

export class InternalRecordCodecs {
  readonly jsonValue: StoredRecordCodec<JsonValue>;

  constructor(validator: SchemaValidator) {
    this.jsonValue = new StoredRecordCodec<JsonValue>(validator, "JsonValue");
  }

  encode<T extends JsonValue>(value: T): StoredCanonicalRecord<JsonValue> {
    return this.jsonValue.encode(value);
  }

  decodeApprovalRequest(bytes: Uint8Array, expectedDigest: string): StoredCanonicalRecord<JsonValue> & { value: ApprovalRequestRecordV1 } {
    const decoded = this.jsonValue.decode(bytes, expectedDigest);
    const value = record(decoded.value, "approval request");
    exactKeys(value, ["schemaVersion", "approvalRequestId", "caseId", "taskId", "expectedTaskRevision", "request", "createdAt"], "approval request");
    schemaVersion(value.schemaVersion, "approval request");
    nonempty(value.approvalRequestId, "approvalRequestId");
    nonempty(value.caseId, "caseId");
    nonempty(value.taskId, "taskId");
    positive(value.expectedTaskRevision, "expectedTaskRevision");
    timestamp(value.createdAt, "createdAt");
    return { ...decoded, value: value as unknown as ApprovalRequestRecordV1 };
  }

  decodeApprovalDecision(bytes: Uint8Array, expectedDigest: string): StoredCanonicalRecord<JsonValue> & { value: ApprovalDecisionRecordV1 } {
    const decoded = this.jsonValue.decode(bytes, expectedDigest);
    const value = record(decoded.value, "approval decision");
    exactKeys(value, ["schemaVersion", "approvalDecisionId", "approvalRequestId", "caseId", "taskId", "expectedTaskRevision", "decision", "createdAt"], "approval decision");
    schemaVersion(value.schemaVersion, "approval decision");
    nonempty(value.approvalDecisionId, "approvalDecisionId");
    nonempty(value.approvalRequestId, "approvalRequestId");
    nonempty(value.caseId, "caseId");
    nonempty(value.taskId, "taskId");
    positive(value.expectedTaskRevision, "expectedTaskRevision");
    timestamp(value.createdAt, "createdAt");
    const decision = record(value.decision, "approval decision value");
    if (decision.kind === "approve") {
      exactKeys(decision, ["kind", "evidenceDigest"], "approval decision value");
      digest(decision.evidenceDigest, "evidenceDigest");
    } else if (decision.kind === "deny") {
      exactKeys(decision, ["kind", "reason"], "approval decision value");
      nonempty(decision.reason, "reason");
    } else {
      throw new StorageError("STORAGE_CORRUPT", "INTERNAL_RECORD_SHAPE", "approval decision kind is invalid");
    }
    return { ...decoded, value: value as unknown as ApprovalDecisionRecordV1 };
  }

  decodeInputRequest(bytes: Uint8Array, expectedDigest: string): StoredCanonicalRecord<JsonValue> & { value: InputRequestRecordV1 } {
    const decoded = this.jsonValue.decode(bytes, expectedDigest);
    const value = record(decoded.value, "input request");
    exactKeys(value, ["schemaVersion", "inputRequestId", "caseId", "taskId", "expectedTaskRevision", "inputSchemaDigest", "request", "createdAt"], "input request");
    schemaVersion(value.schemaVersion, "input request");
    nonempty(value.inputRequestId, "inputRequestId");
    nonempty(value.caseId, "caseId");
    nonempty(value.taskId, "taskId");
    positive(value.expectedTaskRevision, "expectedTaskRevision");
    digest(value.inputSchemaDigest, "inputSchemaDigest");
    timestamp(value.createdAt, "createdAt");
    return { ...decoded, value: value as unknown as InputRequestRecordV1 };
  }

  decodeInputResponse(bytes: Uint8Array, expectedDigest: string): StoredCanonicalRecord<JsonValue> & { value: InputResponseRecordV1 } {
    const decoded = this.jsonValue.decode(bytes, expectedDigest);
    const value = record(decoded.value, "input response");
    exactKeys(value, ["schemaVersion", "inputResponseId", "inputRequestId", "caseId", "taskId", "expectedTaskRevision", "value", "createdAt"], "input response");
    schemaVersion(value.schemaVersion, "input response");
    nonempty(value.inputResponseId, "inputResponseId");
    nonempty(value.inputRequestId, "inputRequestId");
    nonempty(value.caseId, "caseId");
    nonempty(value.taskId, "taskId");
    positive(value.expectedTaskRevision, "expectedTaskRevision");
    timestamp(value.createdAt, "createdAt");
    return { ...decoded, value: value as unknown as InputResponseRecordV1 };
  }

  decodeRetryDecision(bytes: Uint8Array, expectedDigest: string): StoredCanonicalRecord<JsonValue> & { value: RetryDecisionRecordV1 } {
    const decoded = this.jsonValue.decode(bytes, expectedDigest);
    const value = record(decoded.value, "retry decision");
    exactKeys(value, ["schemaVersion", "retryDecisionId", "caseId", "taskId", "attemptId", "expectedTaskRevision", "decision", "createdAt"], "retry decision");
    schemaVersion(value.schemaVersion, "retry decision");
    nonempty(value.retryDecisionId, "retryDecisionId");
    nonempty(value.caseId, "caseId");
    nonempty(value.taskId, "taskId");
    nonempty(value.attemptId, "attemptId");
    positive(value.expectedTaskRevision, "expectedTaskRevision");
    timestamp(value.createdAt, "createdAt");
    const decision = record(value.decision, "retry decision value");
    if (decision.kind === "authorize_retry") {
      exactKeys(decision, ["kind"], "retry decision value");
    } else if (decision.kind === "decline_retry") {
      exactKeys(decision, ["kind", "terminal"], "retry decision value");
      if (decision.terminal !== "cancelled" && decision.terminal !== "unverified") {
        throw new StorageError("STORAGE_CORRUPT", "INTERNAL_RECORD_SHAPE", "retry terminal decision is invalid");
      }
    } else {
      throw new StorageError("STORAGE_CORRUPT", "INTERNAL_RECORD_SHAPE", "retry decision kind is invalid");
    }
    return { ...decoded, value: value as unknown as RetryDecisionRecordV1 };
  }

  decodeCheckpoint(bytes: Uint8Array, expectedDigest: string): StoredCanonicalRecord<JsonValue> & { value: CheckpointRecordV1 } {
    const decoded = this.jsonValue.decode(bytes, expectedDigest);
    const value = record(decoded.value, "checkpoint");
    exactKeys(value, ["schemaVersion", "checkpointId", "caseId", "caseRevision", "eventSequence", "summary", "completedTaskIds", "pendingDecisionIds", "evidenceRefs", "createdAt"], "checkpoint");
    schemaVersion(value.schemaVersion, "checkpoint");
    nonempty(value.checkpointId, "checkpointId");
    nonempty(value.caseId, "caseId");
    positive(value.caseRevision, "caseRevision");
    nonnegative(value.eventSequence, "eventSequence");
    nonempty(value.summary, "summary");
    stringArray(value.completedTaskIds, "completedTaskIds");
    stringArray(value.pendingDecisionIds, "pendingDecisionIds");
    if (!Array.isArray(value.evidenceRefs)) {
      throw new StorageError("STORAGE_CORRUPT", "INTERNAL_RECORD_SHAPE", "evidenceRefs must be an array");
    }
    timestamp(value.createdAt, "createdAt");
    return { ...decoded, value: value as unknown as CheckpointRecordV1 };
  }
}
