# Terminal Developer Protocol and State Model

> Authority: this document owns canonical external schema rules, identifiers, digests, Case/Task/Attempt state machines, public MCP control/query tools, dispatch/result envelopes, errors, deduplication, Events, evidence records, and protocol compatibility. Operation-specific inputs and results are owned by [OPERATIONS.md](OPERATIONS.md).

## 1. Canonical schema source

The sole owner of external data contracts is:

```text
JSON Schema 2020-12
```

The repository will maintain canonical schemas under `protocol/schemas/`. Generated TypeScript views, Go views for canonical wire records consumed by the CLI or Agent, MCP Tool schemas, TypeScript-owned projection metadata, documentation examples, and golden fixtures are derivative outputs.

A generated artifact MUST NOT be edited as an independent contract. CI MUST fail when regeneration produces a diff.

## 2. Canonical JSON and digests

Digest-bearing JSON values use the tdev protocol v1 canonical JSON profile:

```text
RFC 8785-compatible string, literal, array, object, and UTF-16 member ordering
+ the protocol v1 safe-integer numeric domain
+ a domain separator
+ SHA-256
```

The v1 value domain is `null`, booleans, strings, arrays, objects, and integers from `-9007199254740991` through `9007199254740991`. Fractional values, non-finite values, and out-of-range integers are invalid before digest computation. Raw protocol JSON must be valid UTF-8 and must not contain duplicate object member names. Both conditions are rejected before ordinary JSON decoding; byte replacement and last-member-wins parsing cannot become canonical state or digest input. Expanding the numeric domain is a protocol-version change and requires matching cross-language canonical vectors.

Example:

```text
SHA256("tdev.case-contract.v1\0" + CANONICAL_JSON_V1(contract_without_digest))
```

Required digest types include:

```text
contractDigest
grantDigest
schemaDigest
inputDigest
resultDigest
evidenceSetDigest
checkpointDigest
profileDigest
policyDigest
observationDigest
```

A digest field never signs itself. The exact excluded fields are defined by each schema.

## 3. Common schema rules

### 3.1 Strict objects

Canonical objects use:

```json
{
  "type": "object",
  "additionalProperties": false
}
```

Dynamic Operation arguments are accepted only after validation against the selected versioned Operation input schema.

### 3.2 Absence and unknown values

Use:

```text
no value               field absence
known empty collection []
known absence          { "kind": "absent" }
unknown result         { "kind": "unknown", ... }
```

Do not use empty strings, `null`, empty objects, or undocumented defaults to represent the same fact.

### 3.3 Time

All public timestamps use the tdev RFC 3339 UTC profile: a four-digit proleptic Gregorian year, valid calendar month and day, `T`, hour `00`–`23`, minute and second `00`–`59`, optional fractional seconds of one to nine digits, and an uppercase `Z` suffix. Numeric offsets, lowercase `z`, leap seconds, impossible dates, and `24:00:00` are invalid.

### 3.4 Identifiers

Identifiers are opaque, unique, never reused, and carry a type prefix:

```text
case_
task_
attempt_
grant_
event_
artifact_
evidence_
checkpoint_
approval_
input_
retry_
cancel_
agent_
workspace_
project_
deployment_
request_
dispatch_
```

Generation algorithms are implementation details. Public clients must not infer ordering or embedded data from IDs.

### 3.5 Revisions

Revisions have distinct meanings:

| Field | Owner | Increment condition |
| --- | --- | --- |
| `caseRevision` | CaseDO | one semantic Case or Case-visible projection change named by the transition matrix, including Task admission, checkpoint, evidence, control, summary, or finality; an event-only projection update may leave it unchanged |
| `taskRevision` | CaseDO | one Task state, decision, result, or public projection change |
| `attemptRevision` | CaseDO | one Attempt state or progress change |
| `eventSequence` | CaseDO | every committed canonical Event append; an aborted transaction consumes no visible sequence |
| `agentEpoch` | AgentDO | accepted live Agent connection replacement |
| `workspaceRevision` | Agent | Workspace policy or root binding change |
| `projectRevision` | Agent | registered Project metadata or identity change |

Immutable contracts use digests, not mutable revisions.

### 3.6 Protocol-v1 executable schema subset

The canonical source language is JSON Schema 2020-12. The executable subset was established in M0 and remains the only schema-node keyword subset executed by the current protocol-v1 generator and runtime validators:

```text
$ref
additionalProperties
const
enum
format
items
maxItems
maxLength
maximum
minItems
minLength
minimum
oneOf
pattern
properties
required
type
uniqueItems
```

Any other schema-node keyword fails generator and runtime admission. `$ref` and `oneOf` nodes have no siblings in this executable subset; sibling semantics must not be silently ignored. The schema root permits only `$schema`, `$id`, `title`, and `$defs`. Keyword value types, bounds, ordering, uniqueness, applicability to the declared type, and strict-object requirements are validated before value validation begins. Direct aliases and `oneOf` branches must not form a same-instance reference cycle; recursive schemas are valid only when an array item, object property, or additional-property boundary consumes instance structure before recursion.

Extending the executable subset requires an accepted protocol design, TypeScript and Go parity tests, and generator enforcement before a canonical schema may depend on the new keyword.

### 3.7 M1 release profile, lossless public ingress, and validated domain conversion

The current `protocol/schemas/tdev.v1.schema.json` is the sole canonical protocol-v1 schema source. It retains the M0 foundation and now also contains the source-implemented M1 records, proof-bound domain inputs, and six mutation input roots. A schema revision is required when compatibility meaning changes; a milestone label alone does not create another schema owner. M1 mutable non-secret limits and product-policy defaults have one canonical source at `protocol/profiles/tdev.m1.release-profile.json`; its M1 identity is `tdev.m1.default` with `profileVersion = 1`. The generator validates that source losslessly, rejects unknown, duplicate, missing, trailing, or out-of-range data, computes `TypedDigest("tdev.release-profile.v1", profile)`, and emits immutable TypeScript and Go views. The release manifest pins the exact profile identity and digest. Production paths have no environment override or hot reload.

Configuration categories are disjoint:

```text
immutable/versioned protocol invariant
  safe-integer range, canonicalization and digest domains, cursor-v1 HMAC-SHA256,
  state and error meaning, transaction atomicity, terminal immutability,
  authentication, authorization, and non-enumeration

release product policy
  request/parser/output limits, page sizes, cursor TTL, quotas, orphan grace period

deployment configuration or secret
  deployment identity, bearer token, cursor HMAC key generations, Cloudflare bindings

test-only override
  explicitly constructed invalid or narrowed profiles that no production loader can select
```

A release policy may narrow behavior only inside its immutable hard ceiling. Raising a ceiling or changing a fixed algorithm, compatibility meaning, retention meaning, or persistence/security invariant requires an accepted versioned design and the appropriate profile, schema, or migration version change.

The M1 selected release defaults are:

```text
raw request body                 1,048,576 bytes
JSON nesting depth               64 containers
JSON lexical tokens              100,000
members in one object            4,096
items in one array               10,000 unless the selected schema is stricter
decoded string length            262,144 Unicode code points
number digits                    1,024
absolute exponent magnitude      10,000
canonical mutation response      262,144 bytes
rendered text envelope            65,536 UTF-8 bytes
Artifact range chunk             262,144 bytes
query page size                  default 20, maximum 100
cursor TTL                        3,600 seconds
```

The hard compatibility ceilings are owned by profile version 1 and enforced in both generated runtimes. Missing profile identity, digest mismatch, invalid enum, or value outside its minimum/ceiling fails closed before serving requests.

Every public semantic request follows this exact order:

```text
bounded body collection
-> fatal UTF-8 validation
-> lossless JSON lexical scan and grammar validation
-> duplicate-member, depth, token, container, string, digit, exponent, and exact-number checks
-> minimal MCP/JSON-RPC envelope validation and exact protocol revision
-> authentication
-> client capability parsing
-> capability-specific canonical schema validation and canonical value digest
-> ValidationProofV1 construction and exact-root generated domain conversion
-> capability-specific semantic digest
-> authorization and deterministic owner routing
-> CaseDO transaction or bounded read
```

Authentication precedes capability-specific deep validation so unauthenticated input cannot consume owner-specific validation work. Authorization and owner routing follow exact canonical conversion so policy never authorizes an ambiguous wire value. Authentication and authorization errors do not disclose owner existence.

The lexical scanner keeps a decoded member-name set for every open object. Escape-equivalent names such as `"a"` and `"\u0061"` are duplicates. A duplicate at any nesting depth, including an unknown field, is rejected before ordinary object decoding. Number tokens are bounded by digit and exponent magnitude before any `BigInt`, `big.Int`, floating-point conversion, or exponentiation. Accepted numbers must have an exact mathematical integer value in the protocol safe-integer range. Equivalent accepted integer spellings canonicalize to the same value; non-integral, non-finite, oversized, or out-of-range values are invalid.

A successful schema validation returns an ephemeral proof that cannot be supplied by the client or persisted as authority:

```ts
type ValidationProofV1 = {
  schemaDigest: Sha256;
  rootDefinition: string;
  canonicalDigest: Sha256;
  unions: {
    instancePointer: string;
    schemaPointer: string;
    branchIndex: number;
    branchIdentity: string;
  }[];
};
```

Every generated converter declares one static expected root definition. It rejects a proof whose `rootDefinition` differs before reading a union entry. Every `oneOf` must match exactly one branch. `canonicalDigest` is `SHA256("tdev.validation-proof.v1\0" + canonical bytes of the validated root value)` and binds the proof to that exact value. Stable branch identity is derived from the canonical schema pointer and branch index. Generated TypeScript and Go converters verify root definition, schema digest, canonical digest, instance pointer, schema pointer, branch identity, branch index, and any required `const` discriminator before constructing a closed domain variant. Generated Go `json.RawMessage` union aliases remain wire containers only; CaseDO repositories and transition APIs do not accept an unproved raw union. A stored canonical value is revalidated before domain use, and an invalid stored value is `STORAGE_CORRUPT` rather than a default or empty state.

Required ingress codes and typed reasons include:

```text
PAYLOAD_TOO_LARGE          BODY_BYTES
INVALID_UTF8               UTF8
MALFORMED_JSON             JSON_GRAMMAR | TRAILING_VALUE
DUPLICATE_JSON_MEMBER      DUPLICATE_MEMBER
JSON_LIMIT_EXCEEDED        DEPTH | TOKEN_COUNT | OBJECT_MEMBERS | ARRAY_ITEMS |
                           STRING_LENGTH | NUMBER_DIGITS | EXPONENT_MAGNITUDE
UNSAFE_JSON_NUMBER         SAFE_INTEGER
INPUT_SCHEMA_INVALID       SCHEMA
ONE_OF_NO_MATCH            ONE_OF_NO_MATCH
ONE_OF_MULTIPLE_MATCH      ONE_OF_MULTIPLE_MATCH
ROOT_DEFINITION_MISMATCH   ROOT_DEFINITION
UNION_DISCRIMINATOR_MISMATCH UNION_DISCRIMINATOR
```

Typed details are bounded and do not include raw request bodies, secrets, unbounded names, or unauthorized identifiers. TypeScript and Go consume the same raw-byte and proof-tamper fixtures. A parsed-value test cannot prove duplicate-member rejection, and successful JSON unmarshalling cannot prove union discrimination or exact-root proof binding.

## 4. CaseContract

### 4.1 Creation input

The client submits `NewCaseContractInput`; CaseDO assigns identity and creation metadata.

```ts
type NewCaseContractInput = {
  objective: string;
  acceptanceCriteria: AcceptanceCriterion[];
  verificationRequirements: VerificationRequirement[];
  nonGoals: ContractClause[];
  constraints: ContractClause[];
  targetGrants: NewCaseTargetGrant[];
  policyRef: {
    version: number;
    digest: Sha256;
  };
  predecessor?: {
    caseId: CaseId;
    checkpointId: CheckpointId;
    checkpointDigest: Sha256;
    reason:
      | "objective_changed"
      | "target_scope_changed"
      | "authority_changed"
      | "policy_changed";
  };
};
```

### 4.2 Stored contract

```ts
type CaseContract = NewCaseContractInput & {
  schemaVersion: 1;
  caseId: CaseId;
  createdBy: ActorRef;
  createdAt: Timestamp;
  contractDigest: Sha256;
};
```

`CaseContract` is immutable. Objective, acceptance, target scope, allowed effects, non-goals, or security boundary changes create a successor Case.

### 4.3 Clauses and acceptance

```ts
type ContractClause = {
  clauseId: string;
  statement: string;
};

type AcceptanceCriterion = {
  criterionId: string;
  statement: string;
  mandatory: boolean;
};

type VerificationRequirement = {
  requirementId: string;
  criterionIds: string[];
  layer:
    | "source"
    | "validation"
    | "package"
    | "installation"
    | "runtime"
    | "ingress"
    | "public_mcp"
    | "client"
    | "rollback";
  statement: string;
};
```

## 5. CaseTargetGrant

```ts
type CaseTargetGrant = {
  schemaVersion: 1;
  grantId: GrantId;
  agentId: AgentId;
  target:
    | { kind: "workspace"; workspaceId: WorkspaceId }
    | {
        kind: "project";
        workspaceId: WorkspaceId;
        projectId: ProjectId;
      };
  rootIdentityDigest: Sha256;
  allowedSubpaths: RelativePath[];
  allowedEffects: TargetEffect[];
  grantedAgainst: {
    workspaceRevision: number;
    workspacePolicyDigest: Sha256;
    projectRevision?: number;
    baseReference?:
      | { kind: "git_commit"; objectId: GitObjectId }
      | { kind: "observation"; digest: Sha256 };
  };
  grantDigest: Sha256;
};
```

Target effects use a closed namespace:

```text
fs.read
fs.write
fs.delete
git.read
git.write
remote.read
remote.write
validation.execute
process.execute
network.use
package.manage
service.manage
runtime.manage
```

Actual permission is the intersection of Agent capability, current Workspace policy, immutable Case grant, Operation requirements, and exact Task preconditions.

`grantedAgainst` is an audit snapshot. It is not a permanent equality requirement for mutable source state. Each mutating Task carries current exact preconditions.

## 6. Case state machine

### 6.1 Record

```ts
type CaseState = {
  schemaVersion: 1;
  caseId: CaseId;
  caseRevision: number;
  eventSequence: number;
  status: CaseStatus;
  updatedAt: Timestamp;
};
```

### 6.2 Status union

```ts
type CaseStatus =
  | { kind: "active"; enteredAt: Timestamp }
  | {
      kind: "paused";
      reason: "manual" | "authority_invalidated" | "external_blocker";
      detail?: string;
      pausedAt: Timestamp;
    }
  | {
      kind: "cancelling";
      cancellationId: CancellationId;
      requestedBy: ActorRef;
      requestedAt: Timestamp;
      reason: string;
    }
  | { kind: "terminal"; terminal: CaseTerminal };
```

### 6.3 Terminal union

```ts
type CaseTerminal =
  | {
      outcome: "completed";
      summary: string;
      evidenceSetId: EvidenceSetId;
      closedAt: Timestamp;
    }
  | {
      outcome: "failed";
      summary: string;
      failure: FailureRecord;
      closedAt: Timestamp;
    }
  | {
      outcome: "cancelled";
      summary: string;
      cancellation: CancellationSummary;
      closedAt: Timestamp;
    }
  | {
      outcome: "rolled_back";
      summary: string;
      rollbackEvidenceSetId: EvidenceSetId;
      closedAt: Timestamp;
    }
  | {
      outcome: "unverified";
      summary: string;
      uncertainty: UncertaintyRecord;
      closedAt: Timestamp;
    };
```

### 6.4 Case transition rules

```text
active -> paused
paused -> active
active|paused -> cancelling
active|paused -> terminal(completed|failed|rolled_back|unverified)
cancelling -> terminal(cancelled|failed|unverified|rolled_back)
terminal -> no transition
```

`input_required`, approval waiting, and Agent offline are Task or Agent states and do not automatically pause the Case.

A paused Case blocks new effectful Task admission. A pause does not cancel a running Attempt.

Every terminal Case requires every Task to be terminal and no Attempt to remain nonterminal. A known failure must have no unresolved external effect; an unverified outcome must carry typed uncertainty; a rolled-back outcome must carry independent rollback evidence.

A Case can become `completed` only when:

- every Task is terminal;
- no Attempt is active or reconciling;
- every mandatory acceptance criterion has valid evidence;
- all required verification layers are mapped;
- no unresolved approval, input, retry decision, or uncertainty remains.

## 7. Task record and state machine

### 7.1 Task record

```ts
type TaskRecord = {
  schemaVersion: 1;
  caseId: CaseId;
  taskId: TaskId;
  sequence: number;
  operation: OperationInvocation;
  admission: {
    requestId: RequestId;
    admittedAt: Timestamp;
    contractDigest: Sha256;
    operationSchemaDigest: Sha256;
    inputDigest: Sha256;
  };
  taskRevision: number;
  status: TaskStatus;
  latestAttemptId?: AttemptId;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

### 7.2 Operation invocation

```ts
type OperationInvocation = {
  id: string;
  version: number;
  expectedSchemaDigest: Sha256;
  targets: TargetBinding[];
  arguments: JsonValue;
  inputDigest: Sha256;
};
```

Arguments are schema-validated and canonicalized before durable Task creation.

### 7.3 Task status

```ts
type TaskStatus =
  | { kind: "waiting"; waiting: TaskWaiting }
  | { kind: "ready"; readyAt: Timestamp }
  | { kind: "active"; attemptId: AttemptId }
  | {
      kind: "cancelling";
      cancellationId: CancellationId;
      attemptId?: AttemptId;
      requestedAt: Timestamp;
    }
  | { kind: "terminal"; terminal: TaskTerminal };
```

```ts
type TaskWaiting =
  | { reason: "approval"; approvalRequestId: ApprovalRequestId }
  | { reason: "input"; inputRequestId: InputRequestId }
  | { reason: "retry_decision"; retryDecisionId: RetryDecisionId };
```

### 7.4 Task terminal result

```ts
type TaskTerminal =
  | {
      outcome: "succeeded";
      result: OperationResult;
      finishedAt: Timestamp;
    }
  | {
      outcome: "failed";
      failure: OperationFailure;
      finishedAt: Timestamp;
    }
  | {
      outcome: "cancelled";
      cancellation: CancellationSummary;
      finishedAt: Timestamp;
    }
  | {
      outcome: "denied";
      approvalDecisionId: ApprovalDecisionId;
      finishedAt: Timestamp;
    }
  | {
      outcome: "unverified";
      uncertainty: UncertaintyRecord;
      finishedAt: Timestamp;
    };
```

Admission failures do not create a Task. A false runtime precondition after admission is a durable failed Task result.

### 7.5 Task transition rules

```text
waiting(approval) -> ready | active | terminal(cancelled|denied)
waiting(input) -> ready | active | terminal(cancelled|failed)
waiting(retry_decision) -> ready | active | terminal(cancelled|unverified)
ready -> active | cancelling | terminal(cancelled)
active -> waiting(approval|input|retry_decision) | cancelling | terminal
cancelling -> terminal(succeeded|cancelled|failed|unverified)
terminal -> no transition
```

A successful Agent result racing with cancellation remains a successful Task result when its effect and fencing are valid.

## 8. Attempt record and state machine

### 8.1 Attempt record

```ts
type AttemptRecord = {
  schemaVersion: 1;
  caseId: CaseId;
  taskId: TaskId;
  attemptId: AttemptId;
  ordinal: number;
  agentId: AgentId;
  dispatchId: DispatchId;
  operationInputDigest: Sha256;
  expectedTaskRevision: number;
  deadlineAt: Timestamp;
  attemptRevision: number;
  status: AttemptStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

### 8.2 Attempt status

```ts
type AttemptStatus =
  | { kind: "dispatch_pending" }
  | {
      kind: "queued";
      agentEpoch: number;
      fencingToken: string;
      queuedAt: Timestamp;
    }
  | {
      kind: "running";
      agentEpoch: number;
      fencingToken: string;
      startedAt: Timestamp;
    }
  | {
      kind: "reconciling";
      reason:
        | "dispatch_response_lost"
        | "agent_disconnected"
        | "result_response_lost"
        | "deadline_exceeded";
      since: Timestamp;
    }
  | {
      kind: "cancel_requested";
      previous: "dispatch_pending" | "queued" | "running" | "reconciling";
      requestedAt: Timestamp;
    }
  | { kind: "terminal"; terminal: AttemptTerminal };
```

### 8.3 Attempt terminal result

```ts
type AttemptTerminal =
  | {
      outcome: "succeeded";
      resultEnvelopeDigest: Sha256;
      finishedAt: Timestamp;
    }
  | {
      outcome: "failed";
      failure: ExecutionFailure;
      finishedAt: Timestamp;
    }
  | {
      outcome: "cancelled";
      cancellationReceiptId: string;
      finishedAt: Timestamp;
    }
  | {
      outcome: "interrupted";
      interruption: InterruptionRecord;
      retrySafety: "safe" | "unsafe" | "requires_reconciliation";
      finishedAt: Timestamp;
    }
  | {
      outcome: "rejected";
      rejection: ExecutionRejection;
      finishedAt: Timestamp;
    }
  | {
      outcome: "input_required";
      inputRequestId: InputRequestId;
      finishedAt: Timestamp;
    }
  | {
      outcome: "unverified";
      uncertainty: UncertaintyRecord;
      finishedAt: Timestamp;
    };
```

### 8.4 Attempt transition rules

```text
dispatch_pending -> queued | reconciling | cancel_requested | terminal
queued -> running | reconciling | cancel_requested | terminal
running -> reconciling | cancel_requested | terminal
reconciling -> queued | running | cancel_requested | terminal
cancel_requested -> terminal
terminal -> no transition
```

A Task has at most one Attempt whose status is not terminal.

## 9. Public semantic surface

The public adapter provides the twelve canonical semantic capabilities cataloged in [MCP.md](MCP.md). This document owns their exact tdev inputs, outputs, revisions, transitions, errors, and durable effects. [MCP.md](MCP.md) owns whether a release projects a capability as an MCP Tool, Resource, or negotiated extension method.

The first-release `tools-v1` projection exposes every capability as a Tool. Optional Resources, Tasks, and elicitation are additive projections and do not delete the baseline or create a second state owner.

Only `submit_operation` creates a Native Task. Case and Task control actions are canonical CaseDO state transitions, not Agent Operations. An MCP Task handle, when negotiated, resolves to the same canonical `TaskRecord`; it cannot own another status, retry, cancellation, or terminal decision.

The semantic contracts below remain stable across projections. A wire projection change does not implicitly change a Case or Task contract.

## 9.1 Exact tools-v1 semantic request and result contracts

The twelve canonical capabilities use closed request/result schemas. MCP Tools, Resources, Tasks, or extension envelopes project these values but cannot add authority or another lifecycle owner.

```ts
type PageRequestV1 = {
  limit?: number;       // safe integer; default/profile maximum apply
  cursor?: string;
};

type SnapshotV1 = {
  caseRevision?: number;
  taskRevision?: number;
  eventSequence: number;
};

type PageResultV1 = {
  snapshot: SnapshotV1;
  nextCursor?: string;
};

type OperationCatalogEntryV1 = {
  operationId: string;
  operationVersion: number;
  title: string;
  inputSchemaDigest: Sha256;
  resultSchemaDigest: Sha256;
  mutating: boolean;
  available: boolean;
};

type ResourceSummaryV1 = {
  kind: "case" | "task" | "attempt" | "event" | "checkpoint" | "evidence_set" | "artifact";
  uri: string;
  caseId: CaseId;
  taskId?: TaskId;
  subjectId: string;
  revision?: number;
  createdAt?: Timestamp;
  mediaType?: string;
  byteLength?: number;
  sha256?: Sha256;
};
```

Read and list requests/results are exact:

```ts
type ListOperationsInputV1 = { page?: PageRequestV1 };
type ListOperationsResultV1 = {
  operations: OperationCatalogEntryV1[];
  catalogDigest: Sha256;
  profileDigest: Sha256;
  page: PageResultV1;
};

type ListResourcesInputV1 = {
  caseId?: CaseId;
  taskId?: TaskId;
  kinds?: ResourceSummaryV1["kind"][];
  page?: PageRequestV1;
};
type ListResourcesResultV1 = { resources: ResourceSummaryV1[]; page: PageResultV1 };

type GetCaseInputV1 = { caseId: CaseId };
type GetCaseResultV1 = {
  contract: CaseContract;
  state: CaseState;
  taskCount: number;
  latestCheckpointId?: CheckpointId;
  snapshot: SnapshotV1;
};

type GetTaskInputV1 = { caseId: CaseId; taskId: TaskId };
type GetTaskResultV1 = {
  task: TaskRecord;
  latestAttempt?: AttemptRecord;
  attemptCount: number;
  outstandingApprovalRequestId?: ApprovalRequestId;
  outstandingInputRequestId?: InputRequestId;
  outstandingRetryDecisionId?: RetryDecisionId;
  snapshot: SnapshotV1;
};

type RenderTaskInputV1 = {
  caseId: CaseId;
  taskId: TaskId;
  format?: "text" | "markdown";
  cursor?: string;
  maxBytes?: number;
};
type RenderTaskResultV1 = {
  caseId: CaseId;
  taskId: TaskId;
  taskRevision: number;
  eventSequence: number;
  format: "text" | "markdown";
  text: string;
  truncated: boolean;
  renderDigest: Sha256;
  nextCursor?: string;
};

type ReadArtifactInputV1 = {
  caseId: CaseId;
  artifactId: ArtifactId;
  offset?: number;
  length?: number;
};
type ReadArtifactResultV1 = {
  artifact: ArtifactRef;
  offset: number;
  dataBase64: string;
  eof: boolean;
  rangeDigest: Sha256;
};
```

`get_case` and `get_task` deliberately return one bounded current summary, not an unbounded child collection. Related histories use `list_resources` with a fixed snapshot. A truncated `render_task` result returns `nextCursor`; continuation supplies it as `cursor`, rechecks the exact Task/Event snapshot and full-render digest, and never splits a UTF-8 scalar. `read_artifact` returns at most `output.maxArtifactChunkBytes` from the release-pinned profile; byte ownership, digest, range, and authorization are rechecked for every request.

The TypeScript contracts in this section define the semantic input and result shapes for all twelve capabilities. The checked-in executable schema is not yet complete at that public boundary: it currently has only the six mutation input roots named below. The Worker semantic boundary MUST add strict executable roots for `ListOperationsInput`, `ListResourcesInput`, `GetCaseInput`, `GetTaskInput`, `RenderTaskInput`, and `ReadArtifactInput`, plus one capability-specific result root for each of the twelve capabilities. Each root MUST declare its generation targets. TypeScript generation and TypeScript-owned stable capability mapping are required for the public Worker/MCP boundary. Go generation and shared TypeScript/Go fixtures are required only when the root is also a wire contract consumed by the Go CLI or Agent. MCP mappings, annotations, catalog metadata, and client-facing adaptation are not canonical wire records and do not require Go output. The declared-target fixtures MUST pass before MCP `inputSchema`, `outputSchema`, a projection digest, or public output validation can be derived. Prose types or internal service return values are not substitutes for those roots.

The six mutation inputs are the exact `SubmitOperationInput`, `ControlCaseInput`, `FinishCaseInput`, `CancelCaseInput`, `ControlTaskInput`, and `CancelTaskInput` defined below. Control mutation results use:

```ts
type ControlMutationResultV1<T> = {
  accepted: true;
  deduplicated: boolean;
  requestId: RequestId;
  caseId: CaseId;
  taskId?: TaskId;
  committedCaseRevision: number;
  committedTaskRevision?: number;
  committedEventSequence: number;
  value: T;
};
```

`submit_operation` keeps the more specific `SubmitOperationResult` in section 10.4. `control_case`, `finish_case`, and `cancel_case` return the committed `CaseState` as `value`; `control_task` and `cancel_task` return the committed `TaskRecord` and current `AttemptRecord` when one exists. Stored replay returns the original semantic result with `deduplicated: true` in transport metadata and creates no new revision or Event.

Capability matrix:

| Capability | Authenticated | Mutation | Owner/read source | Result bound and Event rule |
| --- | --- | --- | --- | --- |
| `list_operations` | yes | no | release-pinned catalog | fixed snapshot; no Event |
| `list_resources` | yes | no | authorized CaseDO/D1 locator projections | profile page bound; no Event |
| `submit_operation` | yes | yes | deterministic new CaseDO or explicit CaseDO | one transaction, receipt, Events |
| `get_case` | yes | no | explicit CaseDO | one bounded summary; no Event |
| `get_task` | yes | no | explicit CaseDO | one bounded summary; no Event |
| `control_case` | yes | yes | explicit CaseDO | one transaction, receipt, Events |
| `finish_case` | yes | yes | explicit CaseDO | terminal evidence check, receipt, Events |
| `cancel_case` | yes | yes | explicit CaseDO | cancellation intent, receipt, Events |
| `control_task` | yes | yes | explicit CaseDO | exact outstanding request/revision, receipt, Events |
| `cancel_task` | yes | yes | explicit CaseDO | cooperative intent, receipt, Events |
| `render_task` | yes | no | explicit CaseDO snapshot | rendered byte bound; no Event |
| `read_artifact` | yes | no | CaseDO metadata plus R2 bytes | range bound; no Event |

All twelve reject unknown fields. A missing or unauthorized subject uses the projection's non-enumerating not-found policy. List/read calls never create mutation receipts, revisions, or audit Events merely because they were observed.

## 10. submit_operation

### 10.1 Input

```ts
type SubmitOperationInput = {
  requestId: RequestId;
  case:
    | { kind: "new"; contract: NewCaseContractInput }
    | {
        kind: "existing";
        caseId: CaseId;
        expectedContractDigest: Sha256;
      };
  operation: {
    id: string;
    version: number;
    expectedSchemaDigest: Sha256;
    targets: TargetBinding[];
    arguments: JsonValue;
  };
  wait:
    | { mode: "none" }
    | { mode: "bounded"; timeoutMs: number };
};
```

The Case revision is not required for ordinary Task admission. CaseDO checks the current Case status, immutable contract, grants, policy, Operation schema, and mutation receipt. Control transitions use exact Case or Task revisions.

### 10.2 Deterministic new-Case routing

For `case.kind = "new"`, the stateless Worker derives the Case identity before routing:

```text
routeBytes =
  "tdev.new-case-route.v1" + NUL
  + deploymentId + NUL
  + requestId

caseId = "case_" + lowercase_hex(SHA256(routeBytes))
```

`deploymentId` and `requestId` use their canonical UTF-8 forms. The first release has one authenticated user per deployment. The resulting ID is opaque and is not a bearer capability. The same deployment and request ID route to the same `CaseDO` after Worker restart, response loss, or client reconnect. A different request ID selects a distinct Case even when its semantic content is equal.

No D1 lookup, global request table, RequestDO, session state, or implicit prompt continuity selects the owner. D1 may receive a bounded locator projection after the CaseDO transaction commits. Existing-Case admission still requires the explicit `caseId` and expected contract digest.

### 10.3 New Case atomicity

A new Case request commits in one CaseDO transaction:

- CaseContract;
- CaseTargetGrant records;
- active CaseState;
- mutation receipt record;
- first Task;
- initial Attempt when no approval or input is required;
- matching Events.

No partially created Case is externally visible.

### 10.4 Result

```ts
type SubmitOperationResult = {
  accepted: true;
  deduplicated: boolean;
  case: {
    caseId: CaseId;
    contractDigest: Sha256;
    caseRevision: number;
    eventSequence: number;
    status: CaseStatus;
  };
  task: TaskRecord;
  continuing: boolean;
};
```

No implicit continuity lookup creates or selects an existing Case. Continuing a Case requires an explicit `caseId`.

## 11. Case and Task control

### 11.1 control_case

```ts
type ControlCaseInput = {
  requestId: RequestId;
  caseId: CaseId;
  expectedCaseRevision: number;
  action:
    | { kind: "pause"; reason: "manual"; detail?: string }
    | { kind: "resume" }
    | {
        kind: "checkpoint";
        summary: string;
        completedTaskIds: TaskId[];
        pendingDecisionIds: string[];
        evidenceRefs: EvidenceRef[];
      };
};
```

### 11.2 finish_case

```ts
type FinishCaseInput = {
  requestId: RequestId;
  caseId: CaseId;
  expectedCaseRevision: number;
  terminal:
    | { outcome: "completed"; summary: string; evidenceSetId: EvidenceSetId }
    | { outcome: "failed"; summary: string; failure: FailureRecord }
    | {
        outcome: "rolled_back";
        summary: string;
        rollbackEvidenceSetId: EvidenceSetId;
      }
    | {
        outcome: "unverified";
        summary: string;
        uncertainty: UncertaintyRecord;
      };
};
```

CaseDO verifies terminal prerequisites; the caller cannot override them with a free-form fact object.

### 11.3 cancel_case

```ts
type CancelCaseInput = {
  caseId: CaseId;
  expectedCaseRevision: number;
  requestId: RequestId;
  reason: string;
};
```

This transitions to `cancelling`. It does not immediately assert terminal cancellation.

### 11.4 control_task

```ts
type ControlTaskInput = {
  requestId: RequestId;
  caseId: CaseId;
  taskId: TaskId;
  expectedTaskRevision: number;
  action:
    | {
        kind: "approve";
        approvalRequestId: ApprovalRequestId;
        evidenceDigest: Sha256;
      }
    | {
        kind: "deny";
        approvalRequestId: ApprovalRequestId;
        reason: string;
      }
    | {
        kind: "provide_input";
        inputRequestId: InputRequestId;
        value: JsonValue;
      }
    | {
        kind: "authorize_retry";
        retryDecisionId: RetryDecisionId;
      }
    | {
        kind: "decline_retry";
        retryDecisionId: RetryDecisionId;
        terminal: "cancelled" | "unverified";
      };
};
```

Input values are validated against the originating typed input-request schema.

### 11.5 cancel_task

```ts
type CancelTaskInput = {
  requestId: RequestId;
  caseId: CaseId;
  taskId: TaskId;
  expectedTaskRevision: number;
  reason: string;
};
```

This records cooperative Task cancellation intent and transitions the current Task or Attempt only through the canonical state machine. It does not create a control Task, create another Attempt, terminate an external effect by assertion, or force a terminal cancelled result. A valid success racing with cancellation remains valid when its identity, fencing, revision, result, and evidence are accepted.

## 12. Mutation request deduplication

Every state-changing CaseDO semantic capability carries a `requestId`:

```text
submit_operation
control_case
finish_case
cancel_case
control_task
cancel_task
```

The semantic digest covers the capability identifier and version plus every validated canonical input field other than transport-only wait preferences. For `submit_operation`, it includes the Case selector or new contract, Operation identity and schema digest, targets, and validated canonical arguments.

M1 stores the exact original committed response, not only its digest:

```ts
type MutationReceiptV1 = {
  schemaVersion: 1;
  requestId: RequestId;
  capability: string;
  semanticDigest: Sha256;
  caseId: CaseId;
  taskId?: TaskId;
  subject?: EntityRef;
  response: JsonValue;
  responseDigest: Sha256;
  committedCaseRevision: number;
  committedTaskRevision?: number;
  committedEventSequence: number;
  createdAt: Timestamp;
};
```

The response is canonical semantic data, is bounded by the M1 mutation-response limit, passes result-schema and secret-negative validation, and is immutable. It commits in the same SQLite transaction as the current-row change and matching Events.

Rules:

```text
same requestId + same capability and semanticDigest
  -> return the original stored response plus transport replay metadata

same requestId + different capability or semanticDigest
  -> REQUEST_ID_CONFLICT with no other write
```

A replay never reconstructs an admission response from current mutable rows. A Task that has advanced since admission does not alter the original response. Mutation receipts are retained at least as long as the Case and every referenced recovery state.

## 13. Target binding

```ts
type TargetBinding = {
  role: string;
  grantId: GrantId;
  resource:
    | { kind: "workspace"; workspaceId: WorkspaceId }
    | {
        kind: "project";
        workspaceId: WorkspaceId;
        projectId: ProjectId;
      };
};
```

Operation definitions constrain role names, cardinality, and allowed target kinds.

## 14. Operation definition

```ts
type OperationDefinition = {
  schemaVersion: 1;
  id: string;
  version: number;
  description: string;
  execution: { kind: "agent" };
  targetRoles: TargetRoleDefinition[];
  requiredEffects: TargetEffect[];
  cancellable: boolean;
  retryPolicy:
    | "idempotent"
    | "reconcile_before_retry"
    | "explicit_retry_only";
  approvalPolicy:
    | { kind: "none" }
    | { kind: "policy_derived" }
    | { kind: "explicit"; statement: string };
  inputSchemaDigest: Sha256;
  resultSchemaDigest: Sha256;
  failureSchemaDigest: Sha256;
};
```

Profile-backed Operations can require additional effects or approval, but never fewer than the Operation definition requires.

## 15. Dispatch envelope

```ts
type DispatchEnvelope = {
  schemaVersion: 1;
  protocolVersion: 1;
  dispatchId: DispatchId;
  caseId: CaseId;
  taskId: TaskId;
  attemptId: AttemptId;
  agentId: AgentId;
  agentEpoch: number;
  fencingToken: string;
  expectedTaskRevision: number;
  operation: {
    id: string;
    version: number;
    schemaDigest: Sha256;
    targets: TargetBinding[];
    arguments: JsonValue;
    inputDigest: Sha256;
  };
  authority: {
    grants: CaseTargetGrant[];
  };
  limits: {
    deadlineAt: Timestamp;
    stdoutBytes: number;
    stderrBytes: number;
    artifactBytes: number;
  };
  createdAt: Timestamp;
};
```

Only grants referenced by the Task are sent. The full CaseContract, deployment credentials, MCP token, and unrelated targets are not sent.

## 16. Agent result envelope

```ts
type AgentResultEnvelope = {
  schemaVersion: 1;
  protocolVersion: 1;
  dispatchId: DispatchId;
  caseId: CaseId;
  taskId: TaskId;
  attemptId: AttemptId;
  agentId: AgentId;
  agentEpoch: number;
  fencingToken: string;
  expectedTaskRevision: number;
  operationInputDigest: Sha256;
  terminal: AttemptTerminal;
  evidence: ExecutionEvidence[];
  sentAt: Timestamp;
};
```

CaseDO verifies the entire identity tuple, result schema, and evidence before accepting the result.

## 17. Results and Artifacts

```ts
type OperationResult =
  | { kind: "inline"; value: JsonValue; resultDigest: Sha256 }
  | {
      kind: "artifacts";
      artifacts: ArtifactRef[];
      resultDigest: Sha256;
    }
  | {
      kind: "mixed";
      value: JsonValue;
      artifacts: ArtifactRef[];
      resultDigest: Sha256;
    }
  | { kind: "none"; resultDigest: Sha256 };
```

Inline values are validated against the Operation result schema.

```ts
type ArtifactRef = {
  artifactId: ArtifactId;
  caseId: CaseId;
  taskId: TaskId;
  mediaType: string;
  bytes: number;
  sha256: Sha256;
  createdAt: Timestamp;
};
```

R2 object keys are internal and not public identifiers.

## 18. Evidence

```ts
type EvidenceSet = {
  schemaVersion: 1;
  evidenceSetId: EvidenceSetId;
  caseId: CaseId;
  mappings: {
    criterionId: string;
    requirementIds: string[];
    evidenceRefs: EvidenceRef[];
  }[];
  createdAt: Timestamp;
  evidenceSetDigest: Sha256;
};
```

Evidence references are typed references to Task results, Artifacts, remote observations, installation observations, runtime probes, public MCP probes, or client-schema observations.

Each `criterionId` appears at most once in an EvidenceSet mapping list. Duplicate criterion mappings are invalid rather than merged or resolved by input order. Every mandatory criterion mapping contains at least one evidence reference and covers every required `requirementId` assigned to that criterion.

Case completion verifies existence, ownership, digest, required layer, and unresolved uncertainty.

## 19. Error model

### 19.1 Transport and ingress errors

Transport or ingress errors occur before a canonical domain transition can be determined. They include bounded typed forms of:

- payload too large;
- invalid UTF-8;
- malformed or trailing JSON;
- duplicate JSON object member;
- depth, token, member, or item limit exceeded;
- unsafe or unsupported JSON number;
- no or multiple `oneOf` branch match;
- generated union discriminator mismatch;
- authentication failure;
- unsupported HTTP or MCP transport or revision;
- route unavailable.

Error details contain only bounded pointers and reasons. They do not echo raw request bodies, secrets, unauthorized identifiers, or unbounded member names.

```ts
type ProtocolErrorReason =
  | "BODY_BYTES"
  | "UTF8"
  | "JSON_GRAMMAR"
  | "TRAILING_VALUE"
  | "DUPLICATE_MEMBER"
  | "DEPTH"
  | "TOKEN_COUNT"
  | "OBJECT_MEMBERS"
  | "ARRAY_ITEMS"
  | "STRING_LENGTH"
  | "NUMBER_DIGITS"
  | "EXPONENT_MAGNITUDE"
  | "SAFE_INTEGER"
  | "SCHEMA"
  | "ONE_OF_NO_MATCH"
  | "ONE_OF_MULTIPLE_MATCH"
  | "ROOT_DEFINITION"
  | "UNION_DISCRIMINATOR";

type ProtocolErrorDetailsV1 = {
  reason: ProtocolErrorReason;
  instancePointer?: string; // bounded canonical pointer only
  limit?: number;
};
```

Consumers branch on `code` and `details.reason`, never on the human message. Public message wording may change without a protocol revision.

### 19.2 Admission errors

Admission errors create no Task:

```text
INVALID_ARGUMENT
SCHEMA_MISMATCH
REQUEST_ID_CONFLICT
CASE_NOT_FOUND
CASE_NOT_ACTIVE
CONTRACT_MISMATCH
OPERATION_NOT_FOUND
OPERATION_UNAVAILABLE
TARGET_NOT_GRANTED
POLICY_DENIED
CAPABILITY_UNAVAILABLE
REVISION_CONFLICT
LIFECYCLE_CONFLICT
OUTSTANDING_REQUEST_MISMATCH
TERMINAL_IMMUTABLE
COMPLETION_EVIDENCE_INCOMPLETE
QUOTA_EXCEEDED
INVALID_CURSOR
STORAGE_VERSION_MISMATCH
STORAGE_CORRUPT
MIGRATION_REQUIRED
ROLLBACK_BLOCKED
```

### 19.3 Durable Task failure

Failures after Task admission are canonical Task terminal failures or waiting states. Examples:

- file precondition mismatch;
- Git push rejection;
- process spawn failure;
- result schema invalid;
- execution rejected by narrowed local policy.

### 19.4 Unverified outcome

An unverified result means the system cannot establish the external effect. It is not equivalent to failure or cancellation.

### 19.5 Error envelope

```ts
type ControlError = {
  category:
    | "validation"
    | "authorization"
    | "conflict"
    | "lifecycle"
    | "availability"
    | "transport"
    | "storage"
    | "internal";
  code: string;
  message: string;
  retryable: boolean;
  subject?: EntityRef;
  details?: TypedErrorDetails;
};
```

`details` is a code-specific discriminated union, not a free-form object.

## 20. Events

```ts
type CaseEvent = {
  eventId: EventId;
  caseId: CaseId;
  sequence: number;
  entity:
    | { kind: "case"; caseId: CaseId }
    | { kind: "task"; taskId: TaskId }
    | { kind: "attempt"; attemptId: AttemptId };
  eventType: string;
  transition?: { from: string; to: string };
  causationId: string;
  correlationId: string;
  actor: ActorRef;
  committedAt: Timestamp;
};
```

Event payloads are typed by event type. Events are an audit log, not a competing current-state owner.

## 21. M1 CaseDO SQLite storage, migration, query, retention, and quota contract

### 21.1 Schema identity and common DDL rules

Each CaseDO database contains exactly one authoritative metadata row:

```text
schema_meta
  component = "case_do" PRIMARY KEY
  schema_version = 1
  schema_digest
  migration_id
  migration_checksum
  release_id
  release_profile_id
  release_profile_digest
  applied_at
```

M1 does not add a second `schema_migrations` history table. `migration_id` identifies the exact empty-to-v1 migration and `migration_checksum` is the lowercase SHA-256 of its canonical migration bytes. This row is written last in the migration transaction and is immutable. Deployment-wide stage history and receipts remain owned by [DEPLOYMENT.md](DEPLOYMENT.md).

For schema version 1, `schema_digest` is SHA-256 over the exact UTF-8 `CASE_DO_SCHEMA_SQL` bytes: every table, index, and trigger in the declared creation order, each terminated by `;` and one final newline. `migration_checksum` is SHA-256 over the exact UTF-8 `CASE_DO_MIGRATION_TEMPLATE` bytes: `PRAGMA foreign_keys = ON`, `BEGIN IMMEDIATE`, those same DDL bytes, the parameterized `schema_meta` insert, and `COMMIT`. Release ID, applied time, and release-profile identity are row values and do not change migration identity. The frozen M1 values are:

```text
schema_digest       601b9c0a2dfbc7d7cb47abb0423cb5014e2ba86a08dd169514c0ab82980f2e86
migration_id        case_do.empty_to_v1.v1
migration_checksum  dd06dd0d6666c900764ca0ba42c9fa245d39337a6ae308a13a53d8a794e96278
```

All M1 CaseDO tables are SQLite `STRICT` tables. `PRAGMA foreign_keys = ON` is verified before use. IDs and timestamps are `TEXT`; counters, revisions, ordinals, lengths, and booleans are safe-integer `INTEGER`; canonical JSON is `BLOB`; SHA-256 is lowercase 64-character `TEXT` constrained by `length(value)=64 AND value NOT GLOB '*[^0-9a-f]*'`. Canonical JSON columns are paired with a digest and revalidated before domain use. Every foreign key uses `ON UPDATE RESTRICT ON DELETE RESTRICT`. M1 has no canonical-row deletion or Event compaction path.

Tables that are immutable reject `UPDATE` and `DELETE` by trigger. Current-state tables permit only compare-and-update transitions through the repository and reject updates after terminal state. Derived selector columns are checked against the canonical JSON in the same transaction and never authorize independently.

### 21.2 Exact table contract matrix

Every column named below is `NOT NULL` unless it is explicitly marked nullable. Every canonical JSON/digest pair is checked together by the repository before use. `created_at`, `updated_at`, `applied_at`, and `committed_at` are canonical UTC timestamps. Status selector values are exactly the `kind` values declared in sections 6 through 8; terminal rows use `status_kind = 'terminal'`. Required index key order is part of this contract even when a later migration chooses a different implementation name.

| Table | Exact keys and foreign keys | Exact columns beyond the key | Mutability, checks, and required index keys |
| --- | --- | --- | --- |
| `schema_meta` | PK `component`; `CHECK(component='case_do')` | `schema_version`, `schema_digest`, `migration_id`, `migration_checksum`, `release_id`, `release_profile_id`, `release_profile_digest`, `applied_at` | `CHECK(schema_version=1)`; exactly one immutable row; update/delete forbidden |
| `case_contract` | PK `case_id` | `schema_version`, `contract_json`, `contract_digest`, `created_at` | `CHECK(schema_version=1)`; immutable; update/delete forbidden |
| `case_state` | PK/FK `case_id -> case_contract(case_id)` | `status_kind`, `case_revision`, `event_sequence`, `state_json`, `state_digest`, `updated_at` | `CHECK(case_revision>=1 AND event_sequence>=0)`; one current row; same-revision update is allowed only when status is unchanged and `event_sequence` increases; every semantic Case change increments `case_revision` exactly once; terminal update/delete forbidden; index `(status_kind,updated_at,case_id)` |
| `case_target_grants` | PK `(case_id,grant_id)`; FK `case_id -> case_contract`; UNIQUE `(case_id,agent_id,target_kind,target_id)` | `agent_id`, `target_kind`, `target_id`, `grant_json`, `grant_digest`, `created_at` | immutable; update/delete forbidden; indexes `(case_id,agent_id,grant_id)` and `(case_id,target_kind,target_id,grant_id)` |
| `tasks` | PK `(case_id,task_id)`; FK `case_id -> case_contract`; UNIQUE `(case_id,task_sequence)`; nullable composite FK `(case_id,latest_attempt_id) -> attempts(case_id,attempt_id)` deferred until both rows exist | `task_sequence`, `operation_id`, `operation_version`, `status_kind`, `task_revision`, nullable `latest_attempt_id`, `task_json`, `task_digest`, `created_at`, `updated_at` | `CHECK(task_sequence>=1 AND operation_version>=1 AND task_revision>=1)`; current row; terminal update/delete forbidden; indexes `(case_id,task_sequence,task_id)` and `(case_id,status_kind,task_sequence,task_id)` |
| `attempts` | PK `(case_id,task_id,attempt_id)`; FK `(case_id,task_id) -> tasks`; UNIQUE `(case_id,attempt_id)`; UNIQUE `(case_id,task_id,attempt_ordinal)` | `attempt_ordinal`, `status_kind`, `attempt_revision`, `agent_id`, `dispatch_id`, `operation_input_digest`, `expected_task_revision`, `deadline_at`, `attempt_json`, `attempt_digest`, `created_at`, `updated_at` | `CHECK(attempt_ordinal>=1 AND attempt_revision>=1 AND expected_task_revision>=1)`; terminal update/delete forbidden; partial UNIQUE `(case_id,task_id) WHERE status_kind<>'terminal'`; indexes `(case_id,task_id,attempt_ordinal,attempt_id)` and `(case_id,status_kind,updated_at,attempt_id)` |
| `approval_requests` | PK `(case_id,approval_request_id)`; FK `(case_id,task_id) -> tasks` | `task_id`, `expected_task_revision`, `request_json`, `request_digest`, `created_at` | `CHECK(expected_task_revision>=1)`; immutable; update/delete forbidden; index `(case_id,task_id,created_at,approval_request_id)` |
| `approval_decisions` | PK `(case_id,approval_decision_id)`; FK `(case_id,approval_request_id) -> approval_requests`; UNIQUE `(case_id,approval_request_id)` | `approval_request_id`, `expected_task_revision`, `decision_json`, `decision_digest`, `created_at` | `CHECK(expected_task_revision>=1)`; immutable terminal response; update/delete forbidden |
| `input_requests` | PK `(case_id,input_request_id)`; FK `(case_id,task_id) -> tasks` | `task_id`, `expected_task_revision`, `input_schema_digest`, `request_json`, `request_digest`, `created_at` | `CHECK(expected_task_revision>=1)`; immutable; update/delete forbidden; index `(case_id,task_id,created_at,input_request_id)` |
| `input_responses` | PK `(case_id,input_response_id)`; FK `(case_id,input_request_id) -> input_requests`; UNIQUE `(case_id,input_request_id)` | `input_request_id`, `expected_task_revision`, `response_json`, `response_digest`, `created_at` | `CHECK(expected_task_revision>=1)`; immutable terminal response; update/delete forbidden |
| `retry_decisions` | PK `(case_id,retry_decision_id)`; FK `(case_id,task_id) -> tasks`; FK `(case_id,task_id,attempt_id) -> attempts`; UNIQUE `(case_id,task_id,attempt_id)` | `task_id`, `attempt_id`, `expected_task_revision`, `decision_json`, `decision_digest`, `created_at` | `CHECK(expected_task_revision>=1)`; inserted only when decided; immutable; update/delete forbidden |
| `checkpoints` | PK `(case_id,checkpoint_id)`; FK `case_id -> case_contract`; UNIQUE `(case_id,case_revision)` | `case_revision`, `event_sequence`, `checkpoint_json`, `checkpoint_digest`, `created_at` | `CHECK(case_revision>=1 AND event_sequence>=0)`; immutable; update/delete forbidden; index `(case_id,case_revision,checkpoint_id)` |
| `evidence_sets` | PK `(case_id,evidence_set_id)`; FK `case_id -> case_contract`; UNIQUE `(case_id,case_revision)` | `case_revision`, `event_sequence`, `evidence_set_json`, semantic `evidence_set_digest`, canonical-row `record_digest`, `created_at` | `CHECK(case_revision>=1 AND event_sequence>=0)`; `record_digest` binds the exact canonical `EvidenceSet` bytes while `evidence_set_digest` remains the schema-defined semantic selector; immutable; update/delete forbidden while Case retained |
| `evidence_mappings` | PK `(case_id,evidence_set_id,criterion_id)`; FK `(case_id,evidence_set_id) -> evidence_sets` | `mapping_json`, `mapping_digest` | immutable; update/delete forbidden |
| `evidence_refs` | PK `(case_id,evidence_set_id,criterion_id,evidence_ref_id)`; FK `(case_id,evidence_set_id,criterion_id) -> evidence_mappings` | `reference_kind`, `subject_kind`, `subject_id`, nullable `artifact_id`, nullable `event_sequence`, `evidence_json`, `evidence_digest` | exactly one of `artifact_id` or `event_sequence` is present when the reference kind requires it; immutable; update/delete forbidden; referenced Event/Artifact cleanup forbidden; indexes `(case_id,artifact_id,evidence_ref_id)` and `(case_id,event_sequence,evidence_ref_id)` |
| `artifact_refs` | PK `(case_id,artifact_id)`; FK `case_id -> case_contract`; nullable FK `(case_id,task_id) -> tasks` | nullable `task_id`, `media_type`, `byte_length`, `sha256`, `retention_class`, `r2_generation`, `artifact_json`, `artifact_digest`, `created_at` | `CHECK(byte_length>=0 AND r2_generation>=1)`; inserted only after R2 bytes, length, digest, and generation are observed; immutable; update/delete forbidden while retained or referenced; index `(case_id,task_id,created_at,artifact_id)` |
| `mutation_receipts` | PK `(case_id,request_id)`; FK `case_id -> case_contract`; nullable FK `(case_id,task_id) -> tasks` | `capability`, `semantic_input_digest`, nullable `task_id`, nullable paired `subject_kind`/`subject_id`, `response_json`, `response_digest`, `committed_case_revision`, nullable `committed_task_revision`, `committed_event_sequence`, `created_at` | `CHECK((subject_kind IS NULL)=(subject_id IS NULL))`; `CHECK(committed_case_revision>=1 AND committed_event_sequence>=0 AND (committed_task_revision IS NULL OR committed_task_revision>=1))`; selectors must reconstruct the canonical optional `taskId` and `subject`; response obeys the release-profile byte bound; immutable; update/delete forbidden while Case/recovery retained; index `(case_id,created_at,request_id)` |
| `events` | PK `(case_id,event_sequence)`; FK `case_id -> case_contract`; UNIQUE `(case_id,event_id)` | `event_id`, `entity_kind`, `entity_id`, `event_type`, nullable `causation_request_id`, `event_json`, `event_digest`, `committed_at` | `CHECK(event_sequence>=1)`; immutable append-only; next sequence must equal prior maximum plus one; update/delete forbidden; indexes `(case_id,entity_kind,entity_id,event_sequence)` and `(case_id,event_type,event_sequence)` |

The repository inserts `attempts` before setting `tasks.latest_attempt_id`, and both the composite foreign key and transaction check require the Attempt to belong to the same Case and Task. A nullable foreign key is either wholly null or wholly valid; partial identifiers are invalid. Artifact metadata is never inserted as a speculative stub: an R2 object without matching committed metadata remains an orphan and cannot satisfy evidence.

The source implementation boundary is `edge/case-do/`. `sql.ts` owns only the minimal synchronous SQL adapter contract; `schema.ts` owns the exact DDL, digest identities, empty-to-v1 migration, schema re-verification, indexes, and triggers; `records.ts` owns canonical byte, digest, schema-proof, and selector validation; `admission.ts` owns the fixed `tdev.new-case-route.v1` derivation and exact internally generated submit-result/replay shape; `repository.ts` owns narrow SQLite primitives and atomic admission; `internal-records.ts` owns strict internal decision/checkpoint/evidence shapes; `control.ts` owns atomic remaining Case/Task/Attempt transitions and immutable original-response receipts; `cursor.ts` owns canonical HMAC cursor v1; and `query.ts` owns bounded summaries, stable resource pages, and UTF-8-safe render continuation. `node-sqlite.test-support.ts` is test-only and production storage files do not import `node:sqlite`.

The source boundary now proves isolated SQLite admission, remaining control transitions, exact outstanding-request decisions, cooperative cancellation and valid-success race handling, checkpoints, evidence-gated completion, replay/conflict semantics, bounded snapshots/cursors/rendering, and close/reopen recovery across repository instances. It does not prove an independently validated public output root, Worker ingress or routing, Cloudflare Durable Object transaction or hibernation behavior, deployment, public MCP, current-client behavior, Agent dispatch, R2 byte ownership, or runtime rollback.

### 21.3 Atomic mutation and revision/Event matrix

Every mutation executes in one CaseDO serialization turn and one SQLite transaction:

1. check the immutable receipt by `(case_id,request_id)`;
2. replay its original response when capability and semantic digest match;
3. reject `REQUEST_ID_CONFLICT` without another write when they differ;
4. validate canonical current rows, exact revisions, lifecycle, outstanding request, authorization, quota, and terminal prerequisites;
5. insert/update rows through compare-and-update predicates;
6. increment each affected current-row revision exactly once;
7. append contiguous typed Events in the order below;
8. insert immutable decisions, checkpoints, evidence, or Artifact metadata;
9. insert the exact bounded canonical response receipt;
10. commit before returning.

| Transition | Rows written and revisions | Event order in the same transaction |
| --- | --- | --- |
| new Case plus first Task | contract/grants immutable; Case revision 1; Task revision 1; optional immediately dispatchable Attempt revision 1; receipt | `CaseCreated`, `TaskAdmitted`, optional `AttemptCreated` |
| existing Case Task admission | Case revision +1; new Task revision 1; optional Attempt revision 1; receipt | `TaskAdmitted`, optional `AttemptCreated`, `CaseProjectionChanged` |
| Case pause/resume | Case revision +1; receipt | `CasePaused` or `CaseResumed` |
| Case checkpoint | checkpoint row; Case revision +1; receipt | `CheckpointCreated`, `CaseProjectionChanged` |
| finish Case | evidence/current rows read and verified; Case revision +1 to terminal; receipt | `CaseFinished` |
| cancel Case | Case revision +1 to cancellation intent; every affected nonterminal Task revision +1; current nonterminal Attempt revision +1; receipt | `CaseCancellationRequested`, then Task events by task sequence, then Attempt events by attempt ordinal |
| approve/deny/provide input | immutable decision/response row; Task revision +1; optional new Attempt revision 1; receipt | decision/response event, `TaskTransitioned`, optional `AttemptCreated` |
| authorize/decline retry | retry decision row; Task revision +1; optional new Attempt revision 1; receipt | `RetryDecisionRecorded`, `TaskTransitioned`, optional `AttemptCreated` |
| cancel Task | Task revision +1 to cancellation intent; current nonterminal Attempt revision +1 when present; Case revision +1 only when its public summary changes; receipt | `TaskCancellationRequested`, optional `AttemptCancellationRequested`, optional `CaseProjectionChanged` |
| Attempt progress | Attempt revision +1; Task revision +1 only if its canonical public projection changes | `AttemptTransitioned`, optional `TaskProjectionChanged` |
| accepted terminal Agent result | Attempt revision +1 terminal; Task revision +1 to a terminal state or the exact `waiting:approval`, `waiting:input`, or `waiting:retry_decision` state; insert the bound immutable approval/input request when required; Case revision +1 only if summary/evidence/finality changes | `AttemptTerminal`, then `TaskTerminal` or `TaskTransitioned`, then optional `CaseProjectionChanged` |
| evidence-set materialization | evidence set/mapping/ref rows; Case revision +1; receipt when public mutation initiated it | `EvidenceSetCreated`, `CaseProjectionChanged` |
| read/list/render/artifact range read | no writes, revisions, receipts, or Events | none |

A zero-row compare-and-update is re-read and classified as replay, `REVISION_CONFLICT`, lifecycle conflict, terminal immutability, or storage corruption. The implementation never drops a precondition and retries optimistically.

Race rules are exact:

- Task result versus `finish_case`: CaseDO serialization decides order. `finish_case` rechecks the current Task/evidence set and exact Case revision; stale or incomplete completion loses with no write.
- cancellation versus valid success: an already committed success is never overwritten. If cancellation intent commits first, a later result may become terminal success only when the Operation contract, identity, fencing, revision, result schema, and evidence still permit it; otherwise it converges to the canonical cancellation outcome.
- approval, input, or retry decision versus cancellation/terminal transition: both require the exact Task revision and outstanding request identity. One commits; the other receives `REVISION_CONFLICT`, `OUTSTANDING_REQUEST_MISMATCH`, or `TERMINAL_IMMUTABLE` with no partial decision row.
- duplicate mutation: a matching receipt replays without new revisions or Events. A conflicting semantic digest has no effect.
- quota check versus insertion: the check and insertion share one transaction. `QUOTA_EXCEEDED` creates no row, revision, Event, or receipt and never deletes canonical data.

### 21.4 Migration and rollback barrier

The only M1 initial migration is exact empty state to schema version 1. It verifies the database is empty, enables and verifies foreign keys, creates every table/index/trigger in one transaction, computes and compares the schema digest and migration checksum, writes `schema_meta` last, commits, reopens, and re-reads every identity before serving requests.

A later migration requires exact predecessor version/digest, migration ID/checksum, release and release-profile identity, preflight, deployment-owned durable stage receipt, post-migration validation, fault injection, and an explicit rollback barrier. Failed migration cannot expose a falsely applied target version. After v1 stores state, a predecessor without exact compatibility fails closed with `ROLLBACK_BLOCKED` or `STORAGE_VERSION_MISMATCH`. A local migration-history table is added only by a later accepted design that needs resumable or non-atomic local history; deployment receipts are not silently copied into CaseDO authority.

### 21.5 Cursor wire and snapshot contract

Cursor v1 wire format is:

```text
tdevc1.<keyGeneration>.<base64url(canonicalPayload)>.<base64url(mac)>
```

Base64url is unpadded and must be in its canonical encoding. `keyGeneration` is a nonzero canonical decimal integer. The canonical payload is:

```ts
type CursorPayloadV1 = {
  schemaVersion: 1;
  capability: "list_operations" | "list_resources" | "render_task";
  queryDigest: Sha256;
  principalBindingDigest: Sha256;
  releaseProfileDigest: Sha256;
  caseId?: CaseId;
  taskId?: TaskId;
  snapshot: SnapshotV1;
  lastStableKey: [string, string];
  limit: number;
  issuedAt: Timestamp;
  expiresAt: Timestamp;
};
```

`mac = HMAC-SHA256(cursorKey[keyGeneration], UTF8("tdev.cursor.v1\0" + keyGeneration + "\0") || canonicalPayloadBytes)`. Verification uses constant-time comparison. Deployment configuration provides the current generation and at most one previous generation for bounded rotation overlap; key bytes never enter Git, logs, Events, canonical input, fixtures, or the cursor. `expiresAt - issuedAt` equals the selected release-profile TTL and never exceeds its hard ceiling.

Malformed encoding, unknown generation, MAC failure, expiry, profile/query/principal/subject mismatch, invalid limit, or snapshot inconsistency returns `INVALID_CURSOR` without existence disclosure. Cursor possession grants no authority: every page reauthenticates, reauthorizes, reloads the current profile identity, and rechecks query semantics. Stable ordering is `(sequence,id)` or `(createdAt,id)` as declared by the capability. A continuation never mixes mutable snapshots: when the exact Case/Task/Event snapshot no longer matches, it fails with `INVALID_CURSOR` rather than returning current rows under an older cursor. Deleted canonical rows do not exist in M1.

### 21.6 Retention and quota policy

M1 release-policy defaults are:

```text
Tasks per Case                 10,000
Attempts per Task                 100
Events per Case              100,000
R2 orphan cleanup eligibility     30 days after last observed unowned generation
```

The hard ceilings are 100,000 Tasks per Case, 1,000 Attempts per Task, and 1,000,000 Events per Case. Ordinary release policy may select a lower value only. M1 performs no Event compaction and exposes no canonical-row deletion. Mutation receipts remain at least as long as the Case or any recovery state that may replay them. Evidence-referenced Events and Artifact metadata are never cleanup-eligible while referenced. Artifact byte retention follows its canonical retention class; removal requires both canonical eligibility and independently observed R2 deletion.

An R2 object with no matching committed `artifact_refs` row becomes cleanup-eligible only after the selected orphan grace period and an ownership recheck. Cleanup execution, scheduling, and live R2 behavior remain a later runtime gate. Unknown Cloudflare SQLite/R2 byte limits are deployment evidence constraints, not invented protocol guarantees. Reaching a product quota returns typed `QUOTA_EXCEEDED`; the service never silently compacts, evicts, truncates canonical state, or changes policy to admit a write.

## 22. Protocol version negotiation

The Worker, AgentDO, and Agent exchange:

```text
minimum supported protocol version
maximum supported protocol version
current implementation version
capability schema digest
Operation catalog digest
```

Connection succeeds only when version ranges overlap. The selected version is fixed for the connection epoch.

An incompatible Agent remains discoverable with `upgrade_required`; it cannot receive Operations.

MVP compatibility policy:

```text
Edge release N accepts Agent protocol N and N-1 only when explicitly listed.
Agent release N accepts selected Edge protocol versions listed in its manifest.
Unknown compatibility is rejection, not optimistic fallback.
```

## 23. Schema evolution

- Stored schemas and public schemas have independent version numbers where their compatibility differs.
- A breaking stored-state change requires a forward migration and a rollback-compatible predecessor or explicit rollback barrier.
- A field is not considered optional merely because an old client omits it; defaults must be normative and versioned.
- Renaming a state, effect, outcome, or owner is a breaking change.
- Profile parameter schemas and Operation schemas are identified by digest.
- Generated decoders must reject unknown fields for canonical records in every declared language target.
- A new or changed canonical root declares `typescript` or `typescript+go` generation according to actual consumers. A root consumed or persisted by the Go CLI or Agent requires `typescript+go`; an Edge-only public root may remain `typescript`.
- MCP capability mappings, Tool annotations, catalog metadata, projection digests, and client adaptation are TypeScript-owned derivatives, not Go wire contracts. Changing a root's declared targets requires owner, compatibility, generator, and migration review.

## 24. Mandatory protocol tests

The protocol implementation must include table-driven tests for:

- raw invalid UTF-8 and malformed or trailing JSON;
- duplicate members at every nesting level, including escape-equivalent names;
- JSON depth, token, member, item, string, digit, exponent, and safe-integer bounds from the selected release profile;
- release-profile lossless validation, digest drift, unknown/missing/duplicate/out-of-range data, and TS/Go generated-view parity;
- every `oneOf` no-match, multi-match, exact-root replay, and generated discriminator mismatch;
- compile/API rejection of unproved Go `json.RawMessage` at the domain and storage boundary;
- fixed deterministic new-Case routing vectors and restart behavior;
- original mutation-response replay after current Task state advances;
- every state-changing capability request conflict and response-loss boundary;
- exact empty-to-v1 migration, schema-digest mismatch, failed migration, and rollback barrier;
- stable bounded Case, Task, Event, Attempt, and rendering pagination snapshots;
- cursor canonical encoding, HMAC tamper, generation rotation, expiry, query/principal/profile binding, and non-enumerating failure;
- every DDL key, foreign-key, immutable, terminal, partial-unique, migration-metadata, retention, and quota guard;
- every allowed and forbidden Case transition;
- every allowed and forbidden Task transition;
- every allowed and forbidden Attempt transition;
- terminal immutability;
- one nonterminal Attempt per Task;
- mutation receipt and request-ID conflict;
- same dispatch redelivery;
- result redelivery;
- stale epoch and fencing rejection;
- schema digest mismatch;
- target grant mismatch;
- completion evidence coverage;
- pause versus cancel semantics;
- cancellation racing with success;
- field absence versus known absence versus unknown;
- TypeScript and Go canonical JSON and digest equality for every shared wire contract implemented or consumed in both languages.

Tests use fake clocks, controlled queues, barriers, and public state observations. Sleep is not a success condition.
