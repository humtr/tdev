import { M1_RELEASE_PROFILE, M1_RELEASE_PROFILE_DIGEST } from "../../protocol/runtime/typescript/profile.ts";
import type { SqlDatabase, SqlRow } from "./sql.ts";

export type StorageErrorCode =
  | "MIGRATION_FAILED"
  | "ROLLBACK_BLOCKED"
  | "STORAGE_CORRUPT"
  | "STORAGE_NOT_EMPTY"
  | "STORAGE_VERSION_MISMATCH"
  | "STORAGE_INPUT_INVALID"
  | "REVISION_CONFLICT"
  | "TERMINAL_IMMUTABLE"
  | "QUOTA_EXCEEDED"
  | "REQUEST_ID_CONFLICT";

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  readonly reason: string;
  readonly committed: boolean;

  constructor(code: StorageErrorCode, reason: string, message: string, options?: { cause?: unknown; committed?: boolean }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "StorageError";
    this.code = code;
    this.reason = reason;
    this.committed = options?.committed ?? false;
  }
}

export const CASE_DO_SCHEMA_VERSION = 1;
export const CASE_DO_COMPONENT = "case_do";
export const CASE_DO_MIGRATION_ID = "case_do.empty_to_v1.v1";

const digestCheck = (column: string): string =>
  `length(${column}) = 64 AND ${column} NOT GLOB '*[^0-9a-f]*'`;
const nonEmpty = (column: string): string => `length(${column}) > 0`;
const canonicalBlobCheck = (column: string): string => `typeof(${column}) = 'blob'`;

export type SchemaObject = Readonly<{ type: "table" | "index" | "trigger"; name: string; sql: string }>;

const tables: readonly SchemaObject[] = [
  {
    type: "table",
    name: "schema_meta",
    sql: `CREATE TABLE schema_meta (
      component TEXT PRIMARY KEY NOT NULL CHECK (component = 'case_do'),
      schema_version INTEGER NOT NULL CHECK (schema_version = 1),
      schema_digest TEXT NOT NULL CHECK (${digestCheck("schema_digest")}),
      migration_id TEXT NOT NULL CHECK (${nonEmpty("migration_id")}),
      migration_checksum TEXT NOT NULL CHECK (${digestCheck("migration_checksum")}),
      release_id TEXT NOT NULL CHECK (${nonEmpty("release_id")}),
      release_profile_id TEXT NOT NULL CHECK (${nonEmpty("release_profile_id")}),
      release_profile_digest TEXT NOT NULL CHECK (${digestCheck("release_profile_digest")}),
      applied_at TEXT NOT NULL CHECK (${nonEmpty("applied_at")})
    ) STRICT`,
  },
  {
    type: "table",
    name: "case_contract",
    sql: `CREATE TABLE case_contract (
      case_id TEXT PRIMARY KEY NOT NULL CHECK (${nonEmpty("case_id")}),
      schema_version INTEGER NOT NULL CHECK (schema_version = 1),
      contract_json BLOB NOT NULL CHECK (${canonicalBlobCheck("contract_json")}),
      contract_digest TEXT NOT NULL CHECK (${digestCheck("contract_digest")}),
      created_at TEXT NOT NULL CHECK (${nonEmpty("created_at")})
    ) STRICT`,
  },
  {
    type: "table",
    name: "case_state",
    sql: `CREATE TABLE case_state (
      case_id TEXT PRIMARY KEY NOT NULL,
      status_kind TEXT NOT NULL CHECK (status_kind IN ('active','paused','cancelling','terminal')),
      case_revision INTEGER NOT NULL CHECK (case_revision >= 1),
      event_sequence INTEGER NOT NULL CHECK (event_sequence >= 0),
      state_json BLOB NOT NULL CHECK (${canonicalBlobCheck("state_json")}),
      state_digest TEXT NOT NULL CHECK (${digestCheck("state_digest")}),
      updated_at TEXT NOT NULL CHECK (${nonEmpty("updated_at")}),
      FOREIGN KEY (case_id) REFERENCES case_contract(case_id) ON UPDATE RESTRICT ON DELETE RESTRICT
    ) STRICT`,
  },
  {
    type: "table",
    name: "case_target_grants",
    sql: `CREATE TABLE case_target_grants (
      case_id TEXT NOT NULL,
      grant_id TEXT NOT NULL CHECK (${nonEmpty("grant_id")}),
      agent_id TEXT NOT NULL CHECK (${nonEmpty("agent_id")}),
      target_kind TEXT NOT NULL CHECK (${nonEmpty("target_kind")}),
      target_id TEXT NOT NULL CHECK (${nonEmpty("target_id")}),
      grant_json BLOB NOT NULL CHECK (${canonicalBlobCheck("grant_json")}),
      grant_digest TEXT NOT NULL CHECK (${digestCheck("grant_digest")}),
      created_at TEXT NOT NULL CHECK (${nonEmpty("created_at")}),
      PRIMARY KEY (case_id, grant_id),
      UNIQUE (case_id, agent_id, target_kind, target_id),
      FOREIGN KEY (case_id) REFERENCES case_contract(case_id) ON UPDATE RESTRICT ON DELETE RESTRICT
    ) STRICT`,
  },
  {
    type: "table",
    name: "tasks",
    sql: `CREATE TABLE tasks (
      case_id TEXT NOT NULL,
      task_id TEXT NOT NULL CHECK (${nonEmpty("task_id")}),
      task_sequence INTEGER NOT NULL CHECK (task_sequence >= 1),
      operation_id TEXT NOT NULL CHECK (${nonEmpty("operation_id")}),
      operation_version INTEGER NOT NULL CHECK (operation_version >= 1),
      status_kind TEXT NOT NULL CHECK (status_kind IN ('waiting','ready','active','cancelling','terminal')),
      task_revision INTEGER NOT NULL CHECK (task_revision >= 1),
      latest_attempt_id TEXT,
      task_json BLOB NOT NULL CHECK (${canonicalBlobCheck("task_json")}),
      task_digest TEXT NOT NULL CHECK (${digestCheck("task_digest")}),
      created_at TEXT NOT NULL CHECK (${nonEmpty("created_at")}),
      updated_at TEXT NOT NULL CHECK (${nonEmpty("updated_at")}),
      PRIMARY KEY (case_id, task_id),
      UNIQUE (case_id, task_sequence),
      FOREIGN KEY (case_id) REFERENCES case_contract(case_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      FOREIGN KEY (case_id, latest_attempt_id) REFERENCES attempts(case_id, attempt_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
    ) STRICT`,
  },
  {
    type: "table",
    name: "attempts",
    sql: `CREATE TABLE attempts (
      case_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      attempt_id TEXT NOT NULL CHECK (${nonEmpty("attempt_id")}),
      attempt_ordinal INTEGER NOT NULL CHECK (attempt_ordinal >= 1),
      status_kind TEXT NOT NULL CHECK (status_kind IN ('dispatch_pending','queued','running','reconciling','cancel_requested','terminal')),
      attempt_revision INTEGER NOT NULL CHECK (attempt_revision >= 1),
      agent_id TEXT,
      dispatch_id TEXT NOT NULL CHECK (${nonEmpty("dispatch_id")}),
      operation_input_digest TEXT NOT NULL CHECK (${digestCheck("operation_input_digest")}),
      expected_task_revision INTEGER NOT NULL CHECK (expected_task_revision >= 1),
      deadline_at TEXT NOT NULL CHECK (${nonEmpty("deadline_at")}),
      attempt_json BLOB NOT NULL CHECK (${canonicalBlobCheck("attempt_json")}),
      attempt_digest TEXT NOT NULL CHECK (${digestCheck("attempt_digest")}),
      created_at TEXT NOT NULL CHECK (${nonEmpty("created_at")}),
      updated_at TEXT NOT NULL CHECK (${nonEmpty("updated_at")}),
      PRIMARY KEY (case_id, task_id, attempt_id),
      UNIQUE (case_id, attempt_id),
      UNIQUE (case_id, task_id, attempt_ordinal),
      FOREIGN KEY (case_id, task_id) REFERENCES tasks(case_id, task_id) ON UPDATE RESTRICT ON DELETE RESTRICT
    ) STRICT`,
  },
  {
    type: "table",
    name: "approval_requests",
    sql: `CREATE TABLE approval_requests (
      case_id TEXT NOT NULL,
      approval_request_id TEXT NOT NULL CHECK (${nonEmpty("approval_request_id")}),
      task_id TEXT NOT NULL,
      expected_task_revision INTEGER NOT NULL CHECK (expected_task_revision >= 1),
      request_json BLOB NOT NULL CHECK (${canonicalBlobCheck("request_json")}),
      request_digest TEXT NOT NULL CHECK (${digestCheck("request_digest")}),
      created_at TEXT NOT NULL CHECK (${nonEmpty("created_at")}),
      PRIMARY KEY (case_id, approval_request_id),
      FOREIGN KEY (case_id, task_id) REFERENCES tasks(case_id, task_id) ON UPDATE RESTRICT ON DELETE RESTRICT
    ) STRICT`,
  },
  {
    type: "table",
    name: "approval_decisions",
    sql: `CREATE TABLE approval_decisions (
      case_id TEXT NOT NULL,
      approval_decision_id TEXT NOT NULL CHECK (${nonEmpty("approval_decision_id")}),
      approval_request_id TEXT NOT NULL,
      expected_task_revision INTEGER NOT NULL CHECK (expected_task_revision >= 1),
      decision_json BLOB NOT NULL CHECK (${canonicalBlobCheck("decision_json")}),
      decision_digest TEXT NOT NULL CHECK (${digestCheck("decision_digest")}),
      created_at TEXT NOT NULL CHECK (${nonEmpty("created_at")}),
      PRIMARY KEY (case_id, approval_decision_id),
      UNIQUE (case_id, approval_request_id),
      FOREIGN KEY (case_id, approval_request_id) REFERENCES approval_requests(case_id, approval_request_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
    ) STRICT`,
  },
  {
    type: "table",
    name: "input_requests",
    sql: `CREATE TABLE input_requests (
      case_id TEXT NOT NULL,
      input_request_id TEXT NOT NULL CHECK (${nonEmpty("input_request_id")}),
      task_id TEXT NOT NULL,
      expected_task_revision INTEGER NOT NULL CHECK (expected_task_revision >= 1),
      input_schema_digest TEXT NOT NULL CHECK (${digestCheck("input_schema_digest")}),
      request_json BLOB NOT NULL CHECK (${canonicalBlobCheck("request_json")}),
      request_digest TEXT NOT NULL CHECK (${digestCheck("request_digest")}),
      created_at TEXT NOT NULL CHECK (${nonEmpty("created_at")}),
      PRIMARY KEY (case_id, input_request_id),
      FOREIGN KEY (case_id, task_id) REFERENCES tasks(case_id, task_id) ON UPDATE RESTRICT ON DELETE RESTRICT
    ) STRICT`,
  },
  {
    type: "table",
    name: "input_responses",
    sql: `CREATE TABLE input_responses (
      case_id TEXT NOT NULL,
      input_response_id TEXT NOT NULL CHECK (${nonEmpty("input_response_id")}),
      input_request_id TEXT NOT NULL,
      expected_task_revision INTEGER NOT NULL CHECK (expected_task_revision >= 1),
      response_json BLOB NOT NULL CHECK (${canonicalBlobCheck("response_json")}),
      response_digest TEXT NOT NULL CHECK (${digestCheck("response_digest")}),
      created_at TEXT NOT NULL CHECK (${nonEmpty("created_at")}),
      PRIMARY KEY (case_id, input_response_id),
      UNIQUE (case_id, input_request_id),
      FOREIGN KEY (case_id, input_request_id) REFERENCES input_requests(case_id, input_request_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
    ) STRICT`,
  },
  {
    type: "table",
    name: "retry_decisions",
    sql: `CREATE TABLE retry_decisions (
      case_id TEXT NOT NULL,
      retry_decision_id TEXT NOT NULL CHECK (${nonEmpty("retry_decision_id")}),
      task_id TEXT NOT NULL,
      attempt_id TEXT NOT NULL,
      expected_task_revision INTEGER NOT NULL CHECK (expected_task_revision >= 1),
      decision_json BLOB NOT NULL CHECK (${canonicalBlobCheck("decision_json")}),
      decision_digest TEXT NOT NULL CHECK (${digestCheck("decision_digest")}),
      created_at TEXT NOT NULL CHECK (${nonEmpty("created_at")}),
      PRIMARY KEY (case_id, retry_decision_id),
      UNIQUE (case_id, task_id, attempt_id),
      FOREIGN KEY (case_id, task_id) REFERENCES tasks(case_id, task_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      FOREIGN KEY (case_id, task_id, attempt_id) REFERENCES attempts(case_id, task_id, attempt_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
    ) STRICT`,
  },
  {
    type: "table",
    name: "checkpoints",
    sql: `CREATE TABLE checkpoints (
      case_id TEXT NOT NULL,
      checkpoint_id TEXT NOT NULL CHECK (${nonEmpty("checkpoint_id")}),
      case_revision INTEGER NOT NULL CHECK (case_revision >= 1),
      event_sequence INTEGER NOT NULL CHECK (event_sequence >= 0),
      checkpoint_json BLOB NOT NULL CHECK (${canonicalBlobCheck("checkpoint_json")}),
      checkpoint_digest TEXT NOT NULL CHECK (${digestCheck("checkpoint_digest")}),
      created_at TEXT NOT NULL CHECK (${nonEmpty("created_at")}),
      PRIMARY KEY (case_id, checkpoint_id),
      UNIQUE (case_id, case_revision),
      FOREIGN KEY (case_id) REFERENCES case_contract(case_id) ON UPDATE RESTRICT ON DELETE RESTRICT
    ) STRICT`,
  },
  {
    type: "table",
    name: "evidence_sets",
    sql: `CREATE TABLE evidence_sets (
      case_id TEXT NOT NULL,
      evidence_set_id TEXT NOT NULL CHECK (${nonEmpty("evidence_set_id")}),
      case_revision INTEGER NOT NULL CHECK (case_revision >= 1),
      event_sequence INTEGER NOT NULL CHECK (event_sequence >= 0),
      evidence_set_json BLOB NOT NULL CHECK (${canonicalBlobCheck("evidence_set_json")}),
      evidence_set_digest TEXT NOT NULL CHECK (${digestCheck("evidence_set_digest")}),
      created_at TEXT NOT NULL CHECK (${nonEmpty("created_at")}),
      PRIMARY KEY (case_id, evidence_set_id),
      UNIQUE (case_id, case_revision),
      FOREIGN KEY (case_id) REFERENCES case_contract(case_id) ON UPDATE RESTRICT ON DELETE RESTRICT
    ) STRICT`,
  },
  {
    type: "table",
    name: "evidence_mappings",
    sql: `CREATE TABLE evidence_mappings (
      case_id TEXT NOT NULL,
      evidence_set_id TEXT NOT NULL,
      criterion_id TEXT NOT NULL CHECK (${nonEmpty("criterion_id")}),
      mapping_json BLOB NOT NULL CHECK (${canonicalBlobCheck("mapping_json")}),
      mapping_digest TEXT NOT NULL CHECK (${digestCheck("mapping_digest")}),
      PRIMARY KEY (case_id, evidence_set_id, criterion_id),
      FOREIGN KEY (case_id, evidence_set_id) REFERENCES evidence_sets(case_id, evidence_set_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
    ) STRICT`,
  },
  {
    type: "table",
    name: "evidence_refs",
    sql: `CREATE TABLE evidence_refs (
      case_id TEXT NOT NULL,
      evidence_set_id TEXT NOT NULL,
      criterion_id TEXT NOT NULL,
      evidence_ref_id TEXT NOT NULL CHECK (${nonEmpty("evidence_ref_id")}),
      reference_kind TEXT NOT NULL CHECK (${nonEmpty("reference_kind")}),
      subject_kind TEXT NOT NULL CHECK (${nonEmpty("subject_kind")}),
      subject_id TEXT NOT NULL CHECK (${nonEmpty("subject_id")}),
      artifact_id TEXT,
      event_sequence INTEGER CHECK (event_sequence IS NULL OR event_sequence >= 1),
      evidence_json BLOB NOT NULL CHECK (${canonicalBlobCheck("evidence_json")}),
      evidence_digest TEXT NOT NULL CHECK (${digestCheck("evidence_digest")}),
      PRIMARY KEY (case_id, evidence_set_id, criterion_id, evidence_ref_id),
      CHECK (artifact_id IS NULL OR event_sequence IS NULL),
      CHECK (
        (reference_kind = 'artifact' AND artifact_id IS NOT NULL AND event_sequence IS NULL) OR
        (reference_kind = 'event' AND artifact_id IS NULL AND event_sequence IS NOT NULL) OR
        (reference_kind NOT IN ('artifact','event') AND artifact_id IS NULL AND event_sequence IS NULL)
      ),
      FOREIGN KEY (case_id, evidence_set_id, criterion_id)
        REFERENCES evidence_mappings(case_id, evidence_set_id, criterion_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      FOREIGN KEY (case_id, artifact_id) REFERENCES artifact_refs(case_id, artifact_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
      FOREIGN KEY (case_id, event_sequence) REFERENCES events(case_id, event_sequence)
        ON UPDATE RESTRICT ON DELETE RESTRICT
    ) STRICT`,
  },
  {
    type: "table",
    name: "artifact_refs",
    sql: `CREATE TABLE artifact_refs (
      case_id TEXT NOT NULL,
      artifact_id TEXT NOT NULL CHECK (${nonEmpty("artifact_id")}),
      task_id TEXT,
      media_type TEXT NOT NULL CHECK (${nonEmpty("media_type")}),
      byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
      sha256 TEXT NOT NULL CHECK (${digestCheck("sha256")}),
      retention_class TEXT NOT NULL CHECK (${nonEmpty("retention_class")}),
      r2_generation INTEGER NOT NULL CHECK (r2_generation >= 1),
      artifact_json BLOB NOT NULL CHECK (${canonicalBlobCheck("artifact_json")}),
      artifact_digest TEXT NOT NULL CHECK (${digestCheck("artifact_digest")}),
      created_at TEXT NOT NULL CHECK (${nonEmpty("created_at")}),
      PRIMARY KEY (case_id, artifact_id),
      FOREIGN KEY (case_id) REFERENCES case_contract(case_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      FOREIGN KEY (case_id, task_id) REFERENCES tasks(case_id, task_id) ON UPDATE RESTRICT ON DELETE RESTRICT
    ) STRICT`,
  },
  {
    type: "table",
    name: "mutation_receipts",
    sql: `CREATE TABLE mutation_receipts (
      case_id TEXT NOT NULL,
      request_id TEXT NOT NULL CHECK (${nonEmpty("request_id")}),
      capability TEXT NOT NULL CHECK (${nonEmpty("capability")}),
      semantic_input_digest TEXT NOT NULL CHECK (${digestCheck("semantic_input_digest")}),
      task_id TEXT,
      subject_kind TEXT,
      subject_id TEXT,
      response_json BLOB NOT NULL CHECK (${canonicalBlobCheck("response_json")}),
      response_digest TEXT NOT NULL CHECK (${digestCheck("response_digest")}),
      committed_case_revision INTEGER NOT NULL CHECK (committed_case_revision >= 1),
      committed_task_revision INTEGER CHECK (committed_task_revision IS NULL OR committed_task_revision >= 1),
      committed_event_sequence INTEGER NOT NULL CHECK (committed_event_sequence >= 0),
      created_at TEXT NOT NULL CHECK (${nonEmpty("created_at")}),
      PRIMARY KEY (case_id, request_id),
      CHECK ((subject_kind IS NULL) = (subject_id IS NULL)),
      FOREIGN KEY (case_id) REFERENCES case_contract(case_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      FOREIGN KEY (case_id, task_id) REFERENCES tasks(case_id, task_id) ON UPDATE RESTRICT ON DELETE RESTRICT
    ) STRICT`,
  },
  {
    type: "table",
    name: "events",
    sql: `CREATE TABLE events (
      case_id TEXT NOT NULL,
      event_sequence INTEGER NOT NULL CHECK (event_sequence >= 1),
      event_id TEXT NOT NULL CHECK (${nonEmpty("event_id")}),
      entity_kind TEXT NOT NULL CHECK (entity_kind IN ('case','task','attempt')),
      entity_id TEXT NOT NULL CHECK (${nonEmpty("entity_id")}),
      event_type TEXT NOT NULL CHECK (${nonEmpty("event_type")}),
      causation_request_id TEXT,
      event_json BLOB NOT NULL CHECK (${canonicalBlobCheck("event_json")}),
      event_digest TEXT NOT NULL CHECK (${digestCheck("event_digest")}),
      committed_at TEXT NOT NULL CHECK (${nonEmpty("committed_at")}),
      PRIMARY KEY (case_id, event_sequence),
      UNIQUE (case_id, event_id),
      FOREIGN KEY (case_id) REFERENCES case_contract(case_id) ON UPDATE RESTRICT ON DELETE RESTRICT
    ) STRICT`,
  },
];

const indexes: readonly SchemaObject[] = [
  { type: "index", name: "case_state_by_status", sql: "CREATE INDEX case_state_by_status ON case_state(status_kind, updated_at, case_id)" },
  { type: "index", name: "case_grants_by_agent", sql: "CREATE INDEX case_grants_by_agent ON case_target_grants(case_id, agent_id, grant_id)" },
  { type: "index", name: "case_grants_by_target", sql: "CREATE INDEX case_grants_by_target ON case_target_grants(case_id, target_kind, target_id, grant_id)" },
  { type: "index", name: "tasks_by_sequence", sql: "CREATE INDEX tasks_by_sequence ON tasks(case_id, task_sequence, task_id)" },
  { type: "index", name: "tasks_by_status", sql: "CREATE INDEX tasks_by_status ON tasks(case_id, status_kind, task_sequence, task_id)" },
  { type: "index", name: "attempts_one_nonterminal", sql: "CREATE UNIQUE INDEX attempts_one_nonterminal ON attempts(case_id, task_id) WHERE status_kind <> 'terminal'" },
  { type: "index", name: "attempts_by_ordinal", sql: "CREATE INDEX attempts_by_ordinal ON attempts(case_id, task_id, attempt_ordinal, attempt_id)" },
  { type: "index", name: "attempts_by_status", sql: "CREATE INDEX attempts_by_status ON attempts(case_id, status_kind, updated_at, attempt_id)" },
  { type: "index", name: "approval_requests_by_task", sql: "CREATE INDEX approval_requests_by_task ON approval_requests(case_id, task_id, created_at, approval_request_id)" },
  { type: "index", name: "input_requests_by_task", sql: "CREATE INDEX input_requests_by_task ON input_requests(case_id, task_id, created_at, input_request_id)" },
  { type: "index", name: "checkpoints_by_revision", sql: "CREATE INDEX checkpoints_by_revision ON checkpoints(case_id, case_revision, checkpoint_id)" },
  { type: "index", name: "evidence_refs_by_artifact", sql: "CREATE INDEX evidence_refs_by_artifact ON evidence_refs(case_id, artifact_id, evidence_ref_id)" },
  { type: "index", name: "evidence_refs_by_event", sql: "CREATE INDEX evidence_refs_by_event ON evidence_refs(case_id, event_sequence, evidence_ref_id)" },
  { type: "index", name: "artifact_refs_by_task", sql: "CREATE INDEX artifact_refs_by_task ON artifact_refs(case_id, task_id, created_at, artifact_id)" },
  { type: "index", name: "mutation_receipts_by_created", sql: "CREATE INDEX mutation_receipts_by_created ON mutation_receipts(case_id, created_at, request_id)" },
  { type: "index", name: "events_by_entity", sql: "CREATE INDEX events_by_entity ON events(case_id, entity_kind, entity_id, event_sequence)" },
  { type: "index", name: "events_by_type", sql: "CREATE INDEX events_by_type ON events(case_id, event_type, event_sequence)" },
];

function immutableTriggers(table: string): readonly SchemaObject[] {
  return [
    {
      type: "trigger",
      name: `${table}_immutable_update`,
      sql: `CREATE TRIGGER ${table}_immutable_update BEFORE UPDATE ON ${table}
        BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_ROW'); END`,
    },
    {
      type: "trigger",
      name: `${table}_immutable_delete`,
      sql: `CREATE TRIGGER ${table}_immutable_delete BEFORE DELETE ON ${table}
        BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_ROW'); END`,
    },
  ];
}

const immutableTables = [
  "schema_meta",
  "case_contract",
  "case_target_grants",
  "approval_requests",
  "approval_decisions",
  "input_requests",
  "input_responses",
  "retry_decisions",
  "checkpoints",
  "evidence_sets",
  "evidence_mappings",
  "evidence_refs",
  "artifact_refs",
  "mutation_receipts",
  "events",
] as const;

const currentRowTriggers: readonly SchemaObject[] = [
  {
    type: "trigger",
    name: "case_state_update_guard",
    sql: `CREATE TRIGGER case_state_update_guard BEFORE UPDATE ON case_state BEGIN
      SELECT CASE WHEN OLD.status_kind = 'terminal' THEN RAISE(ABORT, 'TERMINAL_IMMUTABLE') END;
      SELECT CASE WHEN NEW.case_id <> OLD.case_id THEN RAISE(ABORT, 'IDENTITY_IMMUTABLE') END;
      SELECT CASE WHEN NEW.case_revision <> OLD.case_revision + 1 THEN RAISE(ABORT, 'REVISION_STEP_INVALID') END;
      SELECT CASE WHEN NEW.event_sequence < OLD.event_sequence THEN RAISE(ABORT, 'EVENT_SEQUENCE_REGRESSION') END;
    END`,
  },
  {
    type: "trigger",
    name: "case_state_delete_guard",
    sql: "CREATE TRIGGER case_state_delete_guard BEFORE DELETE ON case_state BEGIN SELECT RAISE(ABORT, 'CANONICAL_DELETE_FORBIDDEN'); END",
  },
  {
    type: "trigger",
    name: "tasks_update_guard",
    sql: `CREATE TRIGGER tasks_update_guard BEFORE UPDATE ON tasks BEGIN
      SELECT CASE WHEN OLD.status_kind = 'terminal' THEN RAISE(ABORT, 'TERMINAL_IMMUTABLE') END;
      SELECT CASE WHEN NEW.case_id <> OLD.case_id OR NEW.task_id <> OLD.task_id THEN RAISE(ABORT, 'IDENTITY_IMMUTABLE') END;
      SELECT CASE WHEN NEW.task_sequence <> OLD.task_sequence OR NEW.operation_id <> OLD.operation_id OR NEW.operation_version <> OLD.operation_version OR NEW.created_at <> OLD.created_at THEN RAISE(ABORT, 'IMMUTABLE_FIELD') END;
      SELECT CASE WHEN NEW.task_revision <> OLD.task_revision + 1 THEN RAISE(ABORT, 'REVISION_STEP_INVALID') END;
    END`,
  },
  {
    type: "trigger",
    name: "tasks_delete_guard",
    sql: "CREATE TRIGGER tasks_delete_guard BEFORE DELETE ON tasks BEGIN SELECT RAISE(ABORT, 'CANONICAL_DELETE_FORBIDDEN'); END",
  },
  {
    type: "trigger",
    name: "attempts_update_guard",
    sql: `CREATE TRIGGER attempts_update_guard BEFORE UPDATE ON attempts BEGIN
      SELECT CASE WHEN OLD.status_kind = 'terminal' THEN RAISE(ABORT, 'TERMINAL_IMMUTABLE') END;
      SELECT CASE WHEN NEW.case_id <> OLD.case_id OR NEW.task_id <> OLD.task_id OR NEW.attempt_id <> OLD.attempt_id THEN RAISE(ABORT, 'IDENTITY_IMMUTABLE') END;
      SELECT CASE WHEN NEW.attempt_ordinal <> OLD.attempt_ordinal OR NEW.dispatch_id <> OLD.dispatch_id OR NEW.operation_input_digest <> OLD.operation_input_digest OR NEW.expected_task_revision <> OLD.expected_task_revision OR NEW.deadline_at <> OLD.deadline_at OR NEW.created_at <> OLD.created_at THEN RAISE(ABORT, 'IMMUTABLE_FIELD') END;
      SELECT CASE WHEN NEW.attempt_revision <> OLD.attempt_revision + 1 THEN RAISE(ABORT, 'REVISION_STEP_INVALID') END;
    END`,
  },
  {
    type: "trigger",
    name: "attempts_delete_guard",
    sql: "CREATE TRIGGER attempts_delete_guard BEFORE DELETE ON attempts BEGIN SELECT RAISE(ABORT, 'CANONICAL_DELETE_FORBIDDEN'); END",
  },
  {
    type: "trigger",
    name: "events_contiguous_sequence",
    sql: `CREATE TRIGGER events_contiguous_sequence BEFORE INSERT ON events BEGIN
      SELECT CASE WHEN NEW.event_sequence <> COALESCE((SELECT MAX(event_sequence) FROM events WHERE case_id = NEW.case_id), 0) + 1
        THEN RAISE(ABORT, 'EVENT_SEQUENCE_GAP') END;
    END`,
  },
];

export const CASE_DO_SCHEMA_OBJECTS: readonly SchemaObject[] = Object.freeze([
  ...tables,
  ...indexes,
  ...immutableTables.flatMap((table) => immutableTriggers(table)),
  ...currentRowTriggers,
]);

export const CASE_DO_SCHEMA_SQL = `${CASE_DO_SCHEMA_OBJECTS.map((object) => `${object.sql};`).join("\n")}\n`;

const schemaMetaInsert = `INSERT INTO schema_meta (
  component, schema_version, schema_digest, migration_id, migration_checksum,
  release_id, release_profile_id, release_profile_digest, applied_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

export const CASE_DO_MIGRATION_TEMPLATE = `PRAGMA foreign_keys = ON;\nBEGIN IMMEDIATE;\n${CASE_DO_SCHEMA_SQL}${schemaMetaInsert};\nCOMMIT;\n`;

export const CASE_DO_SCHEMA_DIGEST = "847e7a2cb1301b94c7618037a7ae196eebae8a58c3fe4b487f321975089d1c2e";
export const CASE_DO_MIGRATION_CHECKSUM = "10b497ed040ef047a0fd7345cd886bb86462420c5476833fbc7cfdba39525788";

export type MigrationFaultPoint =
  | "after_begin"
  | "after_empty_check"
  | "after_schema"
  | "before_schema_meta"
  | "after_schema_meta"
  | "before_commit"
  | "after_commit";

export type MigrationOptions = Readonly<{
  releaseId: string;
  appliedAt: string;
  fault?: (point: MigrationFaultPoint) => void;
}>;

export type SchemaIdentity = Readonly<{
  component: string;
  schemaVersion: number;
  schemaDigest: string;
  migrationId: string;
  migrationChecksum: string;
  releaseId: string;
  releaseProfileId: string;
  releaseProfileDigest: string;
  appliedAt: string;
}>;

type SchemaMetaRow = SqlRow & Readonly<{
  component: string;
  schema_version: number;
  schema_digest: string;
  migration_id: string;
  migration_checksum: string;
  release_id: string;
  release_profile_id: string;
  release_profile_digest: string;
  applied_at: string;
}>;

function assertReleaseIdentity(options: MigrationOptions): void {
  if (options.releaseId.length === 0 || options.releaseId.length > 200 || options.releaseId.includes("\0")) {
    throw new StorageError("MIGRATION_FAILED", "RELEASE_ID", "releaseId is invalid");
  }
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,9})?Z$/.test(options.appliedAt)) {
    throw new StorageError("MIGRATION_FAILED", "APPLIED_AT", "appliedAt is not a canonical UTC timestamp");
  }
}

function enableAndVerifyForeignKeys(db: SqlDatabase): void {
  db.exec("PRAGMA foreign_keys = ON");
  const row = db.get<SqlRow & { foreign_keys: number }>("PRAGMA foreign_keys");
  if (row?.foreign_keys !== 1) {
    throw new StorageError("STORAGE_CORRUPT", "FOREIGN_KEYS_DISABLED", "SQLite foreign key enforcement is not enabled");
  }
}

type ObservedSchemaObject = Readonly<{ type: string; name: string; sql: string }>;

function userObjects(db: SqlDatabase): readonly ObservedSchemaObject[] {
  return db.all<SqlRow & ObservedSchemaObject>(
    "SELECT type, name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
  );
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().replace(/;$/, "");
}

function assertEmpty(db: SqlDatabase): void {
  const observed = userObjects(db);
  if (observed.length !== 0) {
    throw new StorageError(
      "STORAGE_NOT_EMPTY",
      "NON_EMPTY_DATABASE",
      `empty-to-v1 migration requires an empty database; observed ${observed.map((row) => `${row.type}:${row.name}`).join(",")}`,
    );
  }
}

function expectedObjectKeys(): readonly string[] {
  return CASE_DO_SCHEMA_OBJECTS.map((object) => `${object.type}:${object.name}`).sort();
}

function observedObjectKeys(db: SqlDatabase): readonly string[] {
  return userObjects(db).map((row) => `${row.type}:${row.name}`).sort();
}

function assertExactObjects(db: SqlDatabase): void {
  const expected = expectedObjectKeys();
  const observed = observedObjectKeys(db);
  if (expected.length !== observed.length || expected.some((value, index) => value !== observed[index])) {
    throw new StorageError(
      "STORAGE_CORRUPT",
      "SCHEMA_OBJECT_MISMATCH",
      `CaseDO schema objects differ; expected=${expected.join(",")} observed=${observed.join(",")}`,
    );
  }
  const observedByKey = new Map(userObjects(db).map((object) => [`${object.type}:${object.name}`, object]));
  for (const object of CASE_DO_SCHEMA_OBJECTS) {
    const observedObject = observedByKey.get(`${object.type}:${object.name}`);
    if (observedObject === undefined || normalizeSql(observedObject.sql) !== normalizeSql(object.sql)) {
      throw new StorageError(
        "STORAGE_CORRUPT",
        "SCHEMA_SQL_MISMATCH",
        `CaseDO schema SQL differs for ${object.type}:${object.name}`,
      );
    }
  }

  const strictRows = db.all<SqlRow & { name: string; strict: number; type: string }>("PRAGMA table_list");
  const expectedTables = new Set(tables.map((table) => table.name));
  for (const row of strictRows) {
    if (row.type === "table" && expectedTables.has(row.name) && row.strict !== 1) {
      throw new StorageError("STORAGE_CORRUPT", "TABLE_NOT_STRICT", `table ${row.name} is not STRICT`);
    }
  }
}

function assertIntegrity(db: SqlDatabase): void {
  const integrity = db.get<SqlRow & { integrity_check: string }>("PRAGMA integrity_check");
  if (integrity?.integrity_check !== "ok") {
    throw new StorageError("STORAGE_CORRUPT", "INTEGRITY_CHECK", "SQLite integrity_check did not return ok");
  }
  const foreignKeyErrors = db.all("PRAGMA foreign_key_check");
  if (foreignKeyErrors.length !== 0) {
    throw new StorageError("STORAGE_CORRUPT", "FOREIGN_KEY_CHECK", "SQLite foreign_key_check found invalid rows");
  }
}

function readSchemaMeta(db: SqlDatabase): SchemaMetaRow {
  const rows = db.all<SchemaMetaRow>("SELECT * FROM schema_meta");
  if (rows.length !== 1) {
    throw new StorageError("STORAGE_CORRUPT", "SCHEMA_META_CARDINALITY", "schema_meta must contain exactly one row");
  }
  return rows[0];
}

export function verifyCaseDoSchema(db: SqlDatabase, expected?: { releaseId?: string }): SchemaIdentity {
  enableAndVerifyForeignKeys(db);
  assertExactObjects(db);
  assertIntegrity(db);
  const row = readSchemaMeta(db);
  const mismatches: string[] = [];
  if (row.component !== CASE_DO_COMPONENT) mismatches.push("component");
  if (row.schema_version !== CASE_DO_SCHEMA_VERSION) mismatches.push("schema_version");
  if (row.schema_digest !== CASE_DO_SCHEMA_DIGEST) mismatches.push("schema_digest");
  if (row.migration_id !== CASE_DO_MIGRATION_ID) mismatches.push("migration_id");
  if (row.migration_checksum !== CASE_DO_MIGRATION_CHECKSUM) mismatches.push("migration_checksum");
  if (row.release_profile_id !== M1_RELEASE_PROFILE.profileId) mismatches.push("release_profile_id");
  if (row.release_profile_digest !== M1_RELEASE_PROFILE_DIGEST) mismatches.push("release_profile_digest");
  if (expected?.releaseId !== undefined && row.release_id !== expected.releaseId) mismatches.push("release_id");
  if (mismatches.length > 0) {
    throw new StorageError(
      "STORAGE_VERSION_MISMATCH",
      "SCHEMA_IDENTITY_MISMATCH",
      `CaseDO schema identity mismatch: ${mismatches.join(",")}`,
    );
  }
  return {
    component: row.component,
    schemaVersion: row.schema_version,
    schemaDigest: row.schema_digest,
    migrationId: row.migration_id,
    migrationChecksum: row.migration_checksum,
    releaseId: row.release_id,
    releaseProfileId: row.release_profile_id,
    releaseProfileDigest: row.release_profile_digest,
    appliedAt: row.applied_at,
  };
}

export function migrateEmptyToV1(db: SqlDatabase, options: MigrationOptions): SchemaIdentity {
  assertReleaseIdentity(options);
  enableAndVerifyForeignKeys(db);
  let transactionOpen = false;
  try {
    db.exec("BEGIN IMMEDIATE");
    transactionOpen = true;
    options.fault?.("after_begin");
    assertEmpty(db);
    options.fault?.("after_empty_check");
    for (const object of CASE_DO_SCHEMA_OBJECTS) {
      db.exec(`${object.sql};`);
    }
    options.fault?.("after_schema");
    options.fault?.("before_schema_meta");
    db.run(
      schemaMetaInsert,
      CASE_DO_COMPONENT,
      CASE_DO_SCHEMA_VERSION,
      CASE_DO_SCHEMA_DIGEST,
      CASE_DO_MIGRATION_ID,
      CASE_DO_MIGRATION_CHECKSUM,
      options.releaseId,
      M1_RELEASE_PROFILE.profileId,
      M1_RELEASE_PROFILE_DIGEST,
      options.appliedAt,
    );
    options.fault?.("after_schema_meta");
    options.fault?.("before_commit");
    db.exec("COMMIT");
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen) {
      try {
        db.exec("ROLLBACK");
      } catch {
        throw new StorageError("MIGRATION_FAILED", "ROLLBACK_FAILED", "migration failed and rollback also failed", { cause: error });
      }
    }
    if (error instanceof StorageError) throw error;
    throw new StorageError("MIGRATION_FAILED", "SQLITE_ERROR", "empty-to-v1 migration failed", { cause: error });
  }
  try {
    options.fault?.("after_commit");
  } catch (error) {
    throw new StorageError(
      "MIGRATION_FAILED",
      "POST_COMMIT_RESPONSE_LOST",
      "migration committed but the caller did not observe the response",
      { cause: error, committed: true },
    );
  }
  return verifyCaseDoSchema(db, { releaseId: options.releaseId });
}
