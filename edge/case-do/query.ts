import { createHash } from "node:crypto";
import type {
  ArtifactRef,
  AttemptRecord,
  CaseContract,
  CaseState,
  EvidenceSet,
  Sha256,
  TaskRecord,
} from "../../protocol/generated/typescript/types.ts";
import { M1_RELEASE_PROFILE } from "../../protocol/runtime/typescript/profile.ts";
import { SchemaValidator } from "../../protocol/runtime/typescript/schema.ts";
import {
  issueCursor,
  verifyCursor,
  type CursorKeyRing,
  type CursorSnapshotV1,
} from "./cursor.ts";
import { InternalRecordCodecs, type CheckpointRecordV1 } from "./internal-records.ts";
import {
  canonicalJsonDigest,
  encodeCanonicalJson,
  StoredRecordCodec,
} from "./records.ts";
import { CaseDoRepository } from "./repository.ts";
import { StorageError } from "./schema.ts";
import type { SqlDatabase, SqlRow } from "./sql.ts";

export type SnapshotV1 = CursorSnapshotV1;

export type GetCaseResultV1 = Readonly<{
  contract: CaseContract;
  state: CaseState;
  taskCount: number;
  latestCheckpointId?: string;
  snapshot: SnapshotV1;
}>;

export type GetTaskResultV1 = Readonly<{
  task: TaskRecord;
  latestAttempt?: AttemptRecord;
  attemptCount: number;
  outstandingApprovalRequestId?: string;
  outstandingInputRequestId?: string;
  outstandingRetryDecisionId?: string;
  snapshot: SnapshotV1;
}>;

export type ResourceKind = "case" | "task" | "attempt" | "event" | "checkpoint" | "evidence_set" | "artifact";

export type ResourceSummaryV1 = Readonly<{
  kind: ResourceKind;
  uri: string;
  caseId: string;
  taskId?: string;
  subjectId: string;
  revision?: number;
  createdAt?: string;
  mediaType?: string;
  byteLength?: number;
  sha256?: Sha256;
}>;

export type ListResourcesInputV1 = Readonly<{
  caseId: string;
  taskId?: string;
  kinds?: readonly ResourceKind[];
  page?: Readonly<{ limit?: number; cursor?: string }>;
  principalBindingDigest: Sha256;
  now: string;
}>;

export type ListResourcesResultV1 = Readonly<{
  resources: readonly ResourceSummaryV1[];
  page: Readonly<{ snapshot: SnapshotV1; nextCursor?: string }>;
}>;

export type RenderTaskInputV1 = Readonly<{
  caseId: string;
  taskId: string;
  format?: "text" | "markdown";
  maxBytes?: number;
  cursor?: string;
  principalBindingDigest: Sha256;
  now: string;
}>;

export type RenderTaskResultV1 = Readonly<{
  caseId: string;
  taskId: string;
  taskRevision: number;
  eventSequence: number;
  format: "text" | "markdown";
  text: string;
  truncated: boolean;
  renderDigest: Sha256;
  nextCursor?: string;
}>;

type Blob = Uint8Array | ArrayBuffer;

type CheckpointRow = SqlRow & {
  case_id: string;
  checkpoint_id: string;
  case_revision: number;
  event_sequence: number;
  checkpoint_json: Blob;
  checkpoint_digest: string;
  created_at: string;
};

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

type SummaryWithKey = Readonly<{
  summary: ResourceSummaryV1;
  stableKey: readonly [string, string];
}>;

const ALL_KINDS: readonly ResourceKind[] = [
  "case",
  "task",
  "attempt",
  "event",
  "checkpoint",
  "evidence_set",
  "artifact",
];
const DIGEST = /^[0-9a-f]{64}$/;

function bytes(value: Blob, label: string): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new StorageError("STORAGE_CORRUPT", "ROW_TYPE", `${label} is not a byte sequence`);
}

function requireDigest(value: string, label: string): void {
  if (!DIGEST.test(value)) {
    throw new StorageError("STORAGE_INPUT_INVALID", "QUERY_BINDING", `${label} must be a lowercase SHA-256 digest`);
  }
}

function positiveLimit(value: number | undefined): number {
  const limit = value ?? M1_RELEASE_PROFILE.pagination.defaultPageSize;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > M1_RELEASE_PROFILE.pagination.maxPageSize) {
    throw new StorageError("STORAGE_INPUT_INVALID", "PAGE_LIMIT", "page limit is outside the release profile");
  }
  return limit;
}

function renderLimit(value: number | undefined): number {
  const limit = value ?? M1_RELEASE_PROFILE.output.maxRenderedTextBytes;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > M1_RELEASE_PROFILE.output.maxRenderedTextBytes) {
    throw new StorageError("STORAGE_INPUT_INVALID", "RENDER_LIMIT", "render byte limit is outside the release profile");
  }
  return limit;
}

function encodeId(value: string): string {
  return encodeURIComponent(value);
}

function queryDigest(value: unknown): Sha256 {
  return canonicalJsonDigest(encodeCanonicalJson(value)) as Sha256;
}

function snapshotOf(state: CaseState, task?: TaskRecord): SnapshotV1 {
  return Object.freeze({
    caseRevision: state.caseRevision,
    ...(task === undefined ? {} : { taskRevision: task.taskRevision }),
    eventSequence: state.eventSequence,
  });
}

function compareKey(left: readonly [string, string], right: readonly [string, string]): number {
  const first = left[0].localeCompare(right[0]);
  return first === 0 ? left[1].localeCompare(right[1]) : first;
}

function formatStatus(value: CaseState["status"] | TaskRecord["status"] | AttemptRecord["status"]): string {
  if (value.kind !== "terminal") return value.kind;
  return `terminal:${value.terminal.outcome}`;
}

export function utf8RenderChunk(full: Uint8Array, offset: number, maxBytes: number): { text: string; nextOffset: number } {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > full.length) {
    throw new StorageError("STORAGE_INPUT_INVALID", "INVALID_CURSOR", "cursor is invalid");
  }
  let end = Math.min(full.length, offset + maxBytes);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  while (end > offset) {
    try {
      return { text: decoder.decode(full.subarray(offset, end)), nextOffset: end };
    } catch {
      end -= 1;
    }
  }
  if (offset < full.length) {
    throw new StorageError("STORAGE_INPUT_INVALID", "RENDER_LIMIT", "render byte limit cannot contain one complete UTF-8 scalar");
  }
  return { text: "", nextOffset: offset };
}

export class CaseDoQueryRepository {
  readonly db: SqlDatabase;
  readonly repository: CaseDoRepository;
  readonly internal: InternalRecordCodecs;
  readonly artifactCodec: StoredRecordCodec<ArtifactRef>;
  readonly cursorKeys: CursorKeyRing;

  constructor(db: SqlDatabase, validator: SchemaValidator, cursorKeys: CursorKeyRing) {
    this.repository = new CaseDoRepository(db, validator);
    this.db = db;
    this.internal = new InternalRecordCodecs(validator);
    this.artifactCodec = new StoredRecordCodec<ArtifactRef>(validator, "ArtifactRef");
    this.cursorKeys = cursorKeys;
  }

  getCase(caseId: string): GetCaseResultV1 {
    const contract = this.repository.readCaseContract(caseId);
    const state = this.repository.readCaseState(caseId);
    if (contract === undefined || state === undefined) {
      throw new StorageError("STORAGE_INPUT_INVALID", "CASE_NOT_FOUND", "Case was not found");
    }
    const count = this.db.get<{ count: number }>("SELECT COUNT(*) AS count FROM tasks WHERE case_id = ?", caseId);
    if (count === undefined || !Number.isSafeInteger(count.count) || count.count < 0) {
      throw new StorageError("STORAGE_CORRUPT", "COUNT_INVALID", "Task count is invalid");
    }
    const checkpointRow = this.db.get<CheckpointRow>(
      "SELECT * FROM checkpoints WHERE case_id = ? ORDER BY case_revision DESC, checkpoint_id DESC LIMIT 1",
      caseId,
    );
    let latestCheckpointId: string | undefined;
    if (checkpointRow !== undefined) {
      const checkpoint = this.decodeCheckpoint(checkpointRow);
      latestCheckpointId = checkpoint.checkpointId;
    }
    return Object.freeze({
      contract: contract.value,
      state: state.value,
      taskCount: count.count,
      ...(latestCheckpointId === undefined ? {} : { latestCheckpointId }),
      snapshot: snapshotOf(state.value),
    });
  }

  getTask(caseId: string, taskId: string): GetTaskResultV1 {
    const state = this.repository.readCaseState(caseId);
    const task = this.repository.readTask(caseId, taskId);
    if (state === undefined || task === undefined) {
      throw new StorageError("STORAGE_INPUT_INVALID", "TASK_NOT_FOUND", "Task was not found");
    }
    const count = this.db.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM attempts WHERE case_id = ? AND task_id = ?",
      caseId,
      taskId,
    );
    if (count === undefined || !Number.isSafeInteger(count.count) || count.count < 0) {
      throw new StorageError("STORAGE_CORRUPT", "COUNT_INVALID", "Attempt count is invalid");
    }
    const latestAttempt = task.value.latestAttemptId === undefined
      ? undefined
      : this.repository.readAttempt(caseId, taskId, task.value.latestAttemptId)?.value;
    if (task.value.latestAttemptId !== undefined && latestAttempt === undefined) {
      throw new StorageError("STORAGE_CORRUPT", "LATEST_ATTEMPT_MISSING", "Task latest Attempt is missing");
    }
    const outstanding = this.outstandingRequest(task.value, latestAttempt);
    return Object.freeze({
      task: task.value,
      ...(latestAttempt === undefined ? {} : { latestAttempt }),
      attemptCount: count.count,
      ...outstanding,
      snapshot: snapshotOf(state.value, task.value),
    });
  }

  listResources(input: ListResourcesInputV1): ListResourcesResultV1 {
    requireDigest(input.principalBindingDigest, "principalBindingDigest");
    const limit = positiveLimit(input.page?.limit);
    const kinds = input.kinds === undefined ? ALL_KINDS : [...input.kinds];
    if (new Set(kinds).size !== kinds.length || kinds.some((kind) => !ALL_KINDS.includes(kind))) {
      throw new StorageError("STORAGE_INPUT_INVALID", "RESOURCE_KINDS", "resource kinds are invalid or duplicated");
    }
    const state = this.repository.readCaseState(input.caseId);
    if (state === undefined) {
      throw new StorageError("STORAGE_INPUT_INVALID", "CASE_NOT_FOUND", "Case was not found");
    }
    const task = input.taskId === undefined ? undefined : this.repository.readTask(input.caseId, input.taskId)?.value;
    if (input.taskId !== undefined && task === undefined) {
      throw new StorageError("STORAGE_INPUT_INVALID", "TASK_NOT_FOUND", "Task was not found");
    }
    const snapshot = snapshotOf(state.value, task);
    const normalizedKinds = [...kinds].sort();
    const digest = queryDigest({
      capability: "list_resources",
      caseId: input.caseId,
      ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
      kinds: normalizedKinds,
      limit,
    });
    let after: readonly [string, string] | undefined;
    if (input.page?.cursor !== undefined) {
      const payload = verifyCursor(this.cursorKeys, input.page.cursor, {
        capability: "list_resources",
        queryDigest: digest,
        principalBindingDigest: input.principalBindingDigest,
        caseId: input.caseId,
        ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
        snapshot,
        limit,
        now: input.now,
      });
      after = payload.lastStableKey;
    }
    const summaries = this.collectResources(input.caseId, input.taskId, new Set(kinds), snapshot)
      .sort((left, right) => compareKey(left.stableKey, right.stableKey));
    const start = after === undefined ? 0 : summaries.findIndex((entry) => compareKey(entry.stableKey, after!) > 0);
    const offset = start < 0 ? summaries.length : start;
    const selected = summaries.slice(offset, offset + limit);
    const hasMore = offset + selected.length < summaries.length;
    const nextCursor = hasMore && selected.length > 0
      ? issueCursor(this.cursorKeys, {
          capability: "list_resources",
          queryDigest: digest,
          principalBindingDigest: input.principalBindingDigest,
          caseId: input.caseId,
          ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
          snapshot,
          lastStableKey: selected[selected.length - 1].stableKey,
          limit,
          issuedAt: input.now,
        })
      : undefined;
    return Object.freeze({
      resources: Object.freeze(selected.map((entry) => entry.summary)),
      page: Object.freeze({ snapshot, ...(nextCursor === undefined ? {} : { nextCursor }) }),
    });
  }

  renderTask(input: RenderTaskInputV1): RenderTaskResultV1 {
    requireDigest(input.principalBindingDigest, "principalBindingDigest");
    const format = input.format ?? "text";
    const maxBytes = renderLimit(input.maxBytes);
    const current = this.getTask(input.caseId, input.taskId);
    const fullText = this.renderText(current, format);
    const fullBytes = new TextEncoder().encode(fullText);
    const renderDigest = createHash("sha256").update(fullBytes).digest("hex") as Sha256;
    const digest = queryDigest({ capability: "render_task", caseId: input.caseId, taskId: input.taskId, format, maxBytes });
    let offset = 0;
    if (input.cursor !== undefined) {
      const payload = verifyCursor(this.cursorKeys, input.cursor, {
        capability: "render_task",
        queryDigest: digest,
        principalBindingDigest: input.principalBindingDigest,
        caseId: input.caseId,
        taskId: input.taskId,
        snapshot: current.snapshot,
        limit: maxBytes,
        now: input.now,
      });
      if (!/^(0|[1-9][0-9]*)$/.test(payload.lastStableKey[0]) || payload.lastStableKey[1] !== renderDigest) {
        throw new StorageError("STORAGE_INPUT_INVALID", "INVALID_CURSOR", "cursor is invalid");
      }
      offset = Number(payload.lastStableKey[0]);
    }
    const chunk = utf8RenderChunk(fullBytes, offset, maxBytes);
    const truncated = chunk.nextOffset < fullBytes.length;
    const nextCursor = truncated
      ? issueCursor(this.cursorKeys, {
          capability: "render_task",
          queryDigest: digest,
          principalBindingDigest: input.principalBindingDigest,
          caseId: input.caseId,
          taskId: input.taskId,
          snapshot: current.snapshot,
          lastStableKey: [String(chunk.nextOffset), renderDigest],
          limit: maxBytes,
          issuedAt: input.now,
        })
      : undefined;
    return Object.freeze({
      caseId: input.caseId,
      taskId: input.taskId,
      taskRevision: current.task.taskRevision,
      eventSequence: current.snapshot.eventSequence,
      format,
      text: chunk.text,
      truncated,
      renderDigest,
      ...(nextCursor === undefined ? {} : { nextCursor }),
    });
  }

  private decodeCheckpoint(row: CheckpointRow): CheckpointRecordV1 {
    const decoded = this.internal.decodeCheckpoint(
      bytes(row.checkpoint_json, "checkpoints.checkpoint_json"),
      row.checkpoint_digest,
    ).value;
    if (
      decoded.caseId !== row.case_id ||
      decoded.checkpointId !== row.checkpoint_id ||
      decoded.caseRevision !== row.case_revision ||
      decoded.eventSequence !== row.event_sequence ||
      decoded.createdAt !== row.created_at
    ) {
      throw new StorageError("STORAGE_CORRUPT", "SELECTOR_MISMATCH", "checkpoint selectors do not match canonical JSON");
    }
    return decoded;
  }

  private decodeEvidenceSet(row: EvidenceSetRow): EvidenceSet {
    const decoded = this.repository.codecs.evidenceSet.decode(
      bytes(row.evidence_set_json, "evidence_sets.evidence_set_json"),
      row.record_digest,
    ).value;
    if (
      decoded.caseId !== row.case_id ||
      decoded.evidenceSetId !== row.evidence_set_id ||
      decoded.evidenceSetDigest !== row.evidence_set_digest ||
      decoded.createdAt !== row.created_at
    ) {
      throw new StorageError("STORAGE_CORRUPT", "SELECTOR_MISMATCH", "evidence set selectors do not match canonical JSON");
    }
    return decoded;
  }

  private decodeArtifact(row: ArtifactRow): ArtifactRef {
    const decoded = this.artifactCodec.decode(
      bytes(row.artifact_json, "artifact_refs.artifact_json"),
      row.artifact_digest,
    ).value;
    if (
      decoded.caseId !== row.case_id ||
      decoded.artifactId !== row.artifact_id ||
      (decoded.taskId ?? null) !== row.task_id ||
      decoded.mediaType !== row.media_type ||
      decoded.bytes !== row.byte_length ||
      decoded.sha256 !== row.sha256 ||
      decoded.createdAt !== row.created_at ||
      row.r2_generation < 1 || row.retention_class.length === 0
    ) {
      throw new StorageError("STORAGE_CORRUPT", "SELECTOR_MISMATCH", "Artifact selectors do not match canonical JSON");
    }
    return decoded;
  }

  private outstandingRequest(task: TaskRecord, latestAttempt: AttemptRecord | undefined): Partial<GetTaskResultV1> {
    if (task.status.kind !== "waiting") return {};
    const waiting = task.status.waiting;
    if (waiting.reason === "approval") {
      const row = this.db.get<SqlRow & {
        case_id: string; approval_request_id: string; task_id: string; expected_task_revision: number;
        request_json: Blob; request_digest: string; created_at: string;
      }>("SELECT * FROM approval_requests WHERE case_id = ? AND approval_request_id = ?", task.caseId, waiting.approvalRequestId);
      if (row === undefined) throw new StorageError("STORAGE_CORRUPT", "OUTSTANDING_REQUEST_MISSING", "outstanding approval request is missing");
      const decoded = this.internal.decodeApprovalRequest(bytes(row.request_json, "approval_requests.request_json"), row.request_digest).value;
      if (decoded.caseId !== row.case_id || (decoded.taskId ?? null) !== row.task_id || decoded.approvalRequestId !== row.approval_request_id || decoded.expectedTaskRevision !== row.expected_task_revision || decoded.createdAt !== row.created_at || decoded.taskId !== task.taskId || decoded.expectedTaskRevision !== task.taskRevision) {
        throw new StorageError("STORAGE_CORRUPT", "SELECTOR_MISMATCH", "approval request selectors do not match Task waiting state");
      }
      if (this.db.get("SELECT approval_decision_id FROM approval_decisions WHERE case_id = ? AND approval_request_id = ?", task.caseId, waiting.approvalRequestId) !== undefined) {
        throw new StorageError("STORAGE_CORRUPT", "OUTSTANDING_REQUEST_DECIDED", "Task points at an already decided approval request");
      }
      return { outstandingApprovalRequestId: waiting.approvalRequestId };
    }
    if (waiting.reason === "input") {
      const row = this.db.get<SqlRow & {
        case_id: string; input_request_id: string; task_id: string; expected_task_revision: number;
        input_schema_digest: string; request_json: Blob; request_digest: string; created_at: string;
      }>("SELECT * FROM input_requests WHERE case_id = ? AND input_request_id = ?", task.caseId, waiting.inputRequestId);
      if (row === undefined) throw new StorageError("STORAGE_CORRUPT", "OUTSTANDING_REQUEST_MISSING", "outstanding input request is missing");
      const decoded = this.internal.decodeInputRequest(bytes(row.request_json, "input_requests.request_json"), row.request_digest).value;
      if (decoded.caseId !== row.case_id || (decoded.taskId ?? null) !== row.task_id || decoded.inputRequestId !== row.input_request_id || decoded.expectedTaskRevision !== row.expected_task_revision || decoded.inputSchemaDigest !== row.input_schema_digest || decoded.createdAt !== row.created_at || decoded.taskId !== task.taskId || decoded.expectedTaskRevision !== task.taskRevision) {
        throw new StorageError("STORAGE_CORRUPT", "SELECTOR_MISMATCH", "input request selectors do not match Task waiting state");
      }
      if (this.db.get("SELECT input_response_id FROM input_responses WHERE case_id = ? AND input_request_id = ?", task.caseId, waiting.inputRequestId) !== undefined) {
        throw new StorageError("STORAGE_CORRUPT", "OUTSTANDING_REQUEST_DECIDED", "Task points at an already answered input request");
      }
      return { outstandingInputRequestId: waiting.inputRequestId };
    }
    if (latestAttempt === undefined) {
      throw new StorageError("STORAGE_CORRUPT", "LATEST_ATTEMPT_MISSING", "retry decision waiting state requires a latest Attempt");
    }
    if (this.db.get("SELECT retry_decision_id FROM retry_decisions WHERE case_id = ? AND retry_decision_id = ?", task.caseId, waiting.retryDecisionId) !== undefined) {
      throw new StorageError("STORAGE_CORRUPT", "OUTSTANDING_REQUEST_DECIDED", "Task points at an already decided retry slot");
    }
    return { outstandingRetryDecisionId: waiting.retryDecisionId };
  }

  private collectResources(caseId: string, taskId: string | undefined, kinds: ReadonlySet<ResourceKind>, snapshot: SnapshotV1): SummaryWithKey[] {
    const result: SummaryWithKey[] = [];
    const contract = this.repository.readCaseContract(caseId);
    const state = this.repository.readCaseState(caseId);
    if (contract === undefined || state === undefined) throw new StorageError("STORAGE_INPUT_INVALID", "CASE_NOT_FOUND", "Case was not found");
    if (kinds.has("case") && taskId === undefined) {
      result.push({
        summary: Object.freeze({ kind: "case", uri: `tdev://cases/${encodeId(caseId)}`, caseId, subjectId: caseId, revision: state.value.caseRevision, createdAt: contract.value.createdAt }),
        stableKey: [contract.value.createdAt, `case:${caseId}`],
      });
    }
    if (kinds.has("task")) {
      const rows = this.db.all<{ task_id: string; created_at: string }>(
        taskId === undefined
          ? "SELECT task_id, created_at FROM tasks WHERE case_id = ? ORDER BY task_sequence, task_id"
          : "SELECT task_id, created_at FROM tasks WHERE case_id = ? AND task_id = ?",
        ...(taskId === undefined ? [caseId] : [caseId, taskId]),
      );
      for (const row of rows) {
        const task = this.repository.readTask(caseId, row.task_id);
        if (task === undefined || task.value.createdAt !== row.created_at) throw new StorageError("STORAGE_CORRUPT", "SELECTOR_MISMATCH", "Task summary selectors are invalid");
        result.push({ summary: Object.freeze({ kind: "task", uri: `tdev://tasks/${encodeId(row.task_id)}`, caseId, taskId: row.task_id, subjectId: row.task_id, revision: task.value.taskRevision, createdAt: task.value.createdAt }), stableKey: [task.value.createdAt, `task:${row.task_id}`] });
      }
    }
    if (kinds.has("attempt")) {
      const rows = this.db.all<{ task_id: string; attempt_id: string; created_at: string }>(
        taskId === undefined
          ? "SELECT task_id, attempt_id, created_at FROM attempts WHERE case_id = ? ORDER BY task_id, attempt_ordinal, attempt_id"
          : "SELECT task_id, attempt_id, created_at FROM attempts WHERE case_id = ? AND task_id = ? ORDER BY attempt_ordinal, attempt_id",
        ...(taskId === undefined ? [caseId] : [caseId, taskId]),
      );
      for (const row of rows) {
        const attempt = this.repository.readAttempt(caseId, row.task_id, row.attempt_id);
        if (attempt === undefined || attempt.value.createdAt !== row.created_at) throw new StorageError("STORAGE_CORRUPT", "SELECTOR_MISMATCH", "Attempt summary selectors are invalid");
        result.push({ summary: Object.freeze({ kind: "attempt", uri: `tdev://attempts/${encodeId(row.attempt_id)}`, caseId, taskId: row.task_id, subjectId: row.attempt_id, revision: attempt.value.attemptRevision, createdAt: attempt.value.createdAt }), stableKey: [attempt.value.createdAt, `attempt:${row.attempt_id}`] });
      }
    }
    if (kinds.has("event")) {
      const rows = this.db.all<{ event_sequence: number; event_id: string; entity_kind: string; entity_id: string; committed_at: string }>(
        taskId === undefined
          ? "SELECT event_sequence,event_id,entity_kind,entity_id,committed_at FROM events WHERE case_id = ? AND event_sequence <= ? ORDER BY event_sequence"
          : "SELECT event_sequence,event_id,entity_kind,entity_id,committed_at FROM events WHERE case_id = ? AND event_sequence <= ? AND ((entity_kind='task' AND entity_id=?) OR entity_kind='attempt') ORDER BY event_sequence",
        ...(taskId === undefined ? [caseId, snapshot.eventSequence] : [caseId, snapshot.eventSequence, taskId]),
      );
      for (const row of rows) {
        const event = this.repository.readEvent(caseId, row.event_sequence);
        if (event === undefined || event.value.eventId !== row.event_id || event.value.committedAt !== row.committed_at) throw new StorageError("STORAGE_CORRUPT", "SELECTOR_MISMATCH", "Event summary selectors are invalid");
        if (taskId !== undefined && event.value.entity.kind === "attempt") {
          const attempt = this.db.get<{ task_id: string }>("SELECT task_id FROM attempts WHERE case_id = ? AND attempt_id = ?", caseId, event.value.entity.attemptId);
          if (attempt?.task_id !== taskId) continue;
        }
        result.push({ summary: Object.freeze({ kind: "event", uri: `tdev://events/${encodeId(caseId)}/${encodeId(row.event_id)}`, caseId, ...(event.value.entity.kind === "task" ? { taskId: event.value.entity.taskId } : {}), subjectId: row.event_id, revision: row.event_sequence, createdAt: row.committed_at }), stableKey: [row.committed_at, `event:${row.event_id}`] });
      }
    }
    if (kinds.has("checkpoint") && taskId === undefined) {
      for (const row of this.db.all<CheckpointRow>("SELECT * FROM checkpoints WHERE case_id = ? ORDER BY case_revision, checkpoint_id", caseId)) {
        const checkpoint = this.decodeCheckpoint(row);
        result.push({ summary: Object.freeze({ kind: "checkpoint", uri: `tdev://checkpoints/${encodeId(checkpoint.checkpointId)}`, caseId, subjectId: checkpoint.checkpointId, revision: checkpoint.caseRevision, createdAt: checkpoint.createdAt, sha256: row.checkpoint_digest as Sha256 }), stableKey: [checkpoint.createdAt, `checkpoint:${checkpoint.checkpointId}`] });
      }
    }
    if (kinds.has("evidence_set") && taskId === undefined) {
      for (const row of this.db.all<EvidenceSetRow>("SELECT * FROM evidence_sets WHERE case_id = ? ORDER BY case_revision, evidence_set_id", caseId)) {
        const evidence = this.decodeEvidenceSet(row);
        result.push({ summary: Object.freeze({ kind: "evidence_set", uri: `tdev://evidence/${encodeId(evidence.evidenceSetId)}`, caseId, subjectId: evidence.evidenceSetId, revision: row.case_revision, createdAt: evidence.createdAt, sha256: evidence.evidenceSetDigest }), stableKey: [evidence.createdAt, `evidence_set:${evidence.evidenceSetId}`] });
      }
    }
    if (kinds.has("artifact")) {
      const rows = this.db.all<ArtifactRow>(
        taskId === undefined ? "SELECT * FROM artifact_refs WHERE case_id = ? ORDER BY created_at, artifact_id" : "SELECT * FROM artifact_refs WHERE case_id = ? AND task_id = ? ORDER BY created_at, artifact_id",
        ...(taskId === undefined ? [caseId] : [caseId, taskId]),
      );
      for (const row of rows) {
        const artifact = this.decodeArtifact(row);
        result.push({ summary: Object.freeze({ kind: "artifact", uri: `tdev://artifacts/${encodeId(artifact.artifactId)}`, caseId, taskId: artifact.taskId, subjectId: artifact.artifactId, createdAt: artifact.createdAt, mediaType: artifact.mediaType, byteLength: artifact.bytes, sha256: artifact.sha256 }), stableKey: [artifact.createdAt, `artifact:${artifact.artifactId}`] });
      }
    }
    return result;
  }

  private renderText(result: GetTaskResultV1, format: "text" | "markdown"): string {
    const attempt = result.latestAttempt;
    const fields = [
      ["Case", result.task.caseId],
      ["Task", result.task.taskId],
      ["Operation", `${result.task.operation.id}@${result.task.operation.version}`],
      ["Task revision", String(result.task.taskRevision)],
      ["Task status", formatStatus(result.task.status)],
      ["Event sequence", String(result.snapshot.eventSequence)],
      ["Attempt count", String(result.attemptCount)],
      ...(attempt === undefined ? [] : [
        ["Latest attempt", attempt.attemptId],
        ["Attempt revision", String(attempt.attemptRevision)],
        ["Attempt status", formatStatus(attempt.status)],
      ]),
      ...(result.outstandingApprovalRequestId === undefined ? [] : [["Outstanding approval", result.outstandingApprovalRequestId]]),
      ...(result.outstandingInputRequestId === undefined ? [] : [["Outstanding input", result.outstandingInputRequestId]]),
      ...(result.outstandingRetryDecisionId === undefined ? [] : [["Outstanding retry decision", result.outstandingRetryDecisionId]]),
    ] as readonly (readonly [string, string])[];
    if (format === "markdown") {
      return [`# Task ${result.task.taskId}`, "", ...fields.map(([key, value]) => `- **${key}:** ${value}`), ""].join("\n");
    }
    return [...fields.map(([key, value]) => `${key}: ${value}`), ""].join("\n");
  }
}
