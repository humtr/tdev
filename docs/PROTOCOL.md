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

Digest-bearing JSON values use:

```text
RFC 8785 JSON Canonicalization Scheme
+ a domain separator
+ SHA-256
```

Example:

```text
SHA256("tdev.case-contract.v1\0" + JCS(contract_without_digest))
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

All public timestamps use RFC 3339 UTC with a `Z` suffix.

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

## 9. Public MCP surface

The fixed public tools are:

| Tool | Creates Native Task | Purpose |
| --- | ---: | --- |
| `list_operations` | no | versioned Operation catalog and availability |
| `list_resources` | no | bounded Agent, Workspace, Project, and Case locators |
| `submit_operation` | yes | create a Case plus first Task, or add a Task to an existing Case |
| `get_case` | no | canonical Case snapshot and bounded summaries |
| `get_task` | no | canonical Task and selected Attempt/Event data |
| `control_case` | no | pause, resume, checkpoint |
| `finish_case` | no | completed, failed, rolled_back, unverified terminal transition |
| `cancel_case` | no | enter cancelling and propagate cancellation intent |
| `control_task` | no | approve, deny, provide input, authorize or decline retry |
| `cancel_task` | no | request Task cancellation |
| `render_task` | no | bounded read-only presentation envelope |
| `read_artifact` | no | authorized bounded Artifact byte range |

Case and Task control actions are canonical state transitions, not Agent Operations.

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

The Case revision is not required for ordinary Task admission. CaseDO checks the current Case status, immutable contract, grants, policy, Operation schema, and request dedupe. Control transitions use exact Case or Task revisions.

### 10.2 New Case atomicity

A new Case request commits in one CaseDO transaction:

- CaseContract;
- CaseTargetGrant records;
- active CaseState;
- request dedupe record;
- first Task;
- initial Attempt when no approval or input is required;
- matching Events.

No partially created Case is externally visible.

### 10.3 Result

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

## 12. Request deduplication

```ts
type RequestDedupeRecord = {
  requestId: RequestId;
  semanticDigest: Sha256;
  caseId: CaseId;
  taskId?: TaskId;
  responseDigest: Sha256;
  createdAt: Timestamp;
};
```

Rules:

```text
same requestId + same semanticDigest -> return original result
same requestId + different semanticDigest -> REQUEST_ID_CONFLICT
```

The semantic digest includes Case selector or new contract input, Operation identity and schema digest, targets, and validated canonical arguments.

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

Case completion verifies existence, ownership, digest, required layer, and unresolved uncertainty.

## 19. Error model

### 19.1 Transport errors

Transport errors occur before a canonical domain transition can be determined:

- invalid JSON;
- authentication failure;
- payload too large;
- unsupported HTTP or MCP transport;
- route unavailable.

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

## 21. Protocol version negotiation

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

## 22. Schema evolution

- Stored schemas and public schemas have independent version numbers where their compatibility differs.
- A breaking stored-state change requires a forward migration and a rollback-compatible predecessor or explicit rollback barrier.
- A field is not considered optional merely because an old client omits it; defaults must be normative and versioned.
- Renaming a state, effect, outcome, or owner is a breaking change.
- Profile parameter schemas and Operation schemas are identified by digest.
- Generated TypeScript and Go decoders must reject unknown fields for canonical records.

## 23. Mandatory protocol tests

The protocol implementation must include table-driven tests for:

- every allowed and forbidden Case transition;
- every allowed and forbidden Task transition;
- every allowed and forbidden Attempt transition;
- terminal immutability;
- one nonterminal Attempt per Task;
- request dedupe and request-ID conflict;
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
