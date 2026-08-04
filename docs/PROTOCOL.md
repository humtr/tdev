# Terminal Developer Protocol and State Model

> Authority: this document owns canonical external schema rules, identifiers, digests, Case/Task/Attempt state machines, public MCP control/query tools, dispatch/result envelopes, errors, deduplication, Events, evidence records, and protocol compatibility. Operation-specific inputs and results are owned by [OPERATIONS.md](OPERATIONS.md).

## 1. Canonical schema source

The sole owner of external data contracts is:

```text
JSON Schema 2020-12
```

The repository will maintain canonical schemas under `protocol/schemas/`. Generated TypeScript types, Go types, MCP tool schemas, documentation examples, and golden fixtures are derivative outputs.

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
| `caseRevision` | CaseDO | Case state, checkpoint, evidence, or Case control change |
| `taskRevision` | CaseDO | one Task state or decision change |
| `attemptRevision` | CaseDO | one Attempt state change |
| `eventSequence` | CaseDO | every canonical CaseDO transition |
| `agentEpoch` | AgentDO | accepted live Agent connection replacement |
| `workspaceRevision` | Agent | Workspace policy or root binding change |
| `projectRevision` | Agent | registered Project metadata or identity change |

Immutable contracts use digests, not mutable revisions.

### 3.6 M0 executable schema subset

The canonical source language is JSON Schema 2020-12, but the M0 generator and runtime validators intentionally execute only this schema-node keyword subset:

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

### 3.7 M1 lossless public ingress and validated domain conversion

The current `protocol/schemas/tdev.v1.schema.json` remains the M0 source foundation until the accepted M1 implementation slice introduces a versioned M1 canonical schema and regenerates every derivative. No Worker or CaseDO implementation may consume public semantic values before that schema and its generated conversion boundary exist.

The M1 public protocol profile has these hard maxima before semantic routing:

```text
raw request body                 1,048,576 bytes
JSON nesting depth               64 containers
JSON lexical tokens              100,000
members in one object            4,096
items in one array               10,000 unless the selected schema is stricter
canonical mutation response      262,144 bytes
rendered text envelope            65,536 UTF-8 bytes
query page size                  default 20, maximum 100
```

Every public semantic request follows this order:

```text
bounded body collection
-> fatal UTF-8 validation
-> lossless JSON lexical scan
-> duplicate-member, grammar, depth, token, container, and safe-integer checks
-> generic JSON value decode
-> canonical schema validation and canonical value digest
-> validation proof construction
-> generated domain conversion
-> capability-specific semantic digest
-> authentication, authorization, and deterministic owner routing
-> CaseDO transaction or bounded read
```

The lexical scanner keeps a decoded member-name set for each open object. Escape-equivalent names such as `"a"` and `"\u0061"` are duplicates. A duplicate at any nesting depth, including an unknown field, is rejected before ordinary object decoding. Number tokens are parsed losslessly before any floating-point conversion and are accepted only when their exact mathematical value is an integer in the protocol safe-integer range. Equivalent accepted integer spellings canonicalize to the same value; non-integral, non-finite, or out-of-range values are invalid.

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

Every `oneOf` must match exactly one branch. `canonicalDigest` is `SHA256("tdev.validation-proof.v1\0" + canonical bytes of the validated root value)` and binds the proof to that exact value. Stable branch identity is derived from the canonical schema pointer and branch index. Generated TypeScript and Go converters consume the matching proof, verify any required `const` discriminator, and construct a closed domain variant. Generated Go `json.RawMessage` union aliases remain wire containers only; CaseDO repositories and transition APIs do not accept an unproved raw union. A stored canonical value is revalidated before domain use, and an invalid stored value is `STORAGE_CORRUPT` rather than a default or empty state.

Required pre-routing errors include:

```text
PAYLOAD_TOO_LARGE
INVALID_UTF8
MALFORMED_JSON
DUPLICATE_JSON_MEMBER
JSON_LIMIT_EXCEEDED
UNSAFE_JSON_NUMBER
INPUT_SCHEMA_INVALID
ONE_OF_NO_MATCH
ONE_OF_MULTIPLE_MATCH
UNION_DISCRIMINATOR_MISMATCH
```

TypeScript and Go consume the same raw-byte and union-branch fixtures. A parsed-value test cannot prove duplicate-member rejection, and successful JSON unmarshalling cannot prove union discrimination.

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
waiting(approval) -> ready | terminal(denied)
waiting(input) -> ready | terminal(cancelled|failed)
waiting(retry_decision) -> ready | terminal(cancelled|unverified)
ready -> active | cancelling | terminal(cancelled)
active -> waiting(input|retry_decision) | cancelling | terminal
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

## 21. M1 CaseDO SQLite storage, migration, and query snapshots

### 21.1 Schema identity

Each CaseDO database contains one authoritative schema metadata row:

```text
schema_meta
  component = "case_do"
  schema_version
  schema_digest
  release_id
  applied_at
```

This row owns local database compatibility only. Deployment-wide migration progress and release ordering remain owned by [DEPLOYMENT.md](DEPLOYMENT.md).

M1 CaseDO schema version 1 contains:

```text
case_contract
case_state
case_target_grants
tasks
attempts
approval_requests
approval_decisions
input_requests
input_responses
retry_decisions
checkpoints
evidence_sets
evidence_mappings
evidence_refs
artifact_refs
mutation_receipts
events
```

Canonical contracts, statuses, requests, decisions, results, failures, uncertainty, evidence references, and Event payloads are stored as validated canonical JSON bytes plus their required digests. Indexed kind, outcome, sequence, revision, and timestamp columns are derived selectors inside the same owner and cannot authorize a transition without the canonical value.

### 21.2 Required storage constraints

The schema enforces or the same transaction rechecks:

- one contract and one current Case row for the addressed Case;
- foreign keys contained to that Case;
- unique Task sequence and Attempt ordinal within their owners;
- at most one nonterminal Attempt per Task through a partial unique index or equivalent database guard;
- unique mutation request ID per Case;
- unique and gap-free committed Event sequence within one Case;
- unique decision IDs and one terminal response for each approval, input, or retry request;
- unique evidence criterion mapping and evidence reference;
- immutable contract, grant, mutation receipt, decision, checkpoint, evidence-set, Artifact-metadata, and Event rows;
- database and application guards against updates from terminal Case, Task, or Attempt state.

Current rows are lifecycle truth. Events cannot reconstruct, replay, or authorize current state.

### 21.3 Atomic mutation template

One CaseDO serialization turn and one SQLite transaction:

1. read an existing mutation receipt by request ID;
2. return its original response when the semantic digest matches;
3. reject `REQUEST_ID_CONFLICT` without another write when it differs;
4. validate canonical current rows, exact revisions, status, outstanding request identity, authorization, and terminal prerequisites;
5. insert or update current rows under compare-and-update predicates;
6. increment each affected revision exactly once;
7. insert the next contiguous typed Events;
8. insert immutable decisions, checkpoints, evidence, or Artifact metadata as required;
9. insert the exact canonical response and mutation receipt;
10. commit before returning a response.

A zero-row compare-and-update is re-read and classified as replay, revision conflict, lifecycle conflict, or storage corruption. The implementation never drops a precondition and retries optimistically.

New-Case admission atomically creates the contract, grants, active Case row, first Task, initial Attempt when immediately dispatchable, Events, and mutation receipt. No partial Case is externally visible.

### 21.4 Migration and rollback barrier

The initial migration is exact empty state to CaseDO schema version 1. It creates all tables, indexes, and guards transactionally, writes `schema_meta` last, then reopens and verifies the observed version and schema digest before serving requests.

A later migration requires an exact predecessor version and digest, release-manifest identity, preflight, a deployment-owned durable stage receipt, post-migration validation, and fault injection. A failed migration cannot expose a falsely applied target version.

After schema version 1 stores state, a predecessor that does not declare exact compatibility is not a rollback target. It fails closed with `ROLLBACK_BLOCKED` or `STORAGE_VERSION_MISMATCH`. A compensating migration or recovery import/export requires a separate accepted design.

### 21.5 Bounded reads and cursors

`get_case` and `get_task` read canonical current rows and bounded related summaries in one SQLite read transaction. Every response identifies the Case revision and snapshot Event sequence; Task responses also identify the Task revision.

A cursor is opaque, untrusted, self-contained, and bound to its schema version, semantic capability, query digest, Case and optional Task identity, snapshot upper bound, and last stable key. Every page revalidates authentication, authorization, cursor shape, query identity, and limits. A cursor owns no state and grants no authority. Pagination uses stable `(sequence, id)` or `(createdAt, id)` ordering and excludes writes after the fixed snapshot bound.

`render_task` derives a bounded presentation from the same snapshot. Truncation is explicit and returns a cursor or authorized Artifact reference when available. An Artifact metadata stub without committed byte ownership and digest cannot satisfy evidence or authorize a read.

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
- Generated TypeScript and Go decoders must reject unknown fields for canonical records.

## 24. Mandatory protocol tests

The protocol implementation must include table-driven tests for:

- raw invalid UTF-8 and malformed or trailing JSON;
- duplicate members at every nesting level, including escape-equivalent names;
- JSON depth, token, member, item, and safe-integer bounds;
- every `oneOf` no-match, multi-match, and generated discriminator mismatch;
- compile/API rejection of unproved Go `json.RawMessage` at the domain and storage boundary;
- fixed deterministic new-Case routing vectors and restart behavior;
- original mutation-response replay after current Task state advances;
- every state-changing capability request conflict and response-loss boundary;
- exact empty-to-v1 migration, schema-digest mismatch, failed migration, and rollback barrier;
- stable bounded Case, Task, Event, Attempt, and rendering pagination snapshots;
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
- TypeScript and Go canonical JSON and digest equality.

Tests use fake clocks, controlled queues, barriers, and public state observations. Sleep is not a success condition.
