// Code generated from protocol/schemas/tdev.v1.schema.json by tools/generate. DO NOT EDIT.

export type AcceptanceCriterion = Readonly<{
  "criterionId": string;
  "mandatory": boolean;
  "statement": string;
}>;

export type ActorRef = Readonly<{
  "kind": "mcp_client";
  "subjectId": string;
}> | Readonly<{
  "kind": "user";
  "subjectId": string;
}> | Readonly<{
  "component": "worker" | "case_do" | "agent_do" | "agent";
  "kind": "system";
}>;

export type AgentId = string;

export type ApprovalDecisionId = string;

export type ApprovalRequestId = string;

export type ArtifactId = string;

export type ArtifactRef = Readonly<{
  "artifactId": ArtifactId;
  "bytes": number;
  "caseId": CaseId;
  "createdAt": Timestamp;
  "mediaType": string;
  "sha256": Sha256;
  "taskId": TaskId;
}>;

export type AttemptId = string;

export type AttemptRecord = Readonly<{
  "agentId": AgentId;
  "attemptId": AttemptId;
  "attemptRevision": number;
  "caseId": CaseId;
  "createdAt": Timestamp;
  "deadlineAt": Timestamp;
  "dispatchId": DispatchId;
  "expectedTaskRevision": number;
  "operationInputDigest": Sha256;
  "ordinal": number;
  "schemaVersion": 1;
  "status": AttemptStatus;
  "taskId": TaskId;
  "updatedAt": Timestamp;
}>;

export type AttemptStatus = Readonly<{
  "kind": "dispatch_pending";
}> | Readonly<{
  "agentEpoch": number;
  "fencingToken": string;
  "kind": "queued";
  "queuedAt": Timestamp;
}> | Readonly<{
  "agentEpoch": number;
  "fencingToken": string;
  "kind": "running";
  "startedAt": Timestamp;
}> | Readonly<{
  "kind": "reconciling";
  "reason": "dispatch_response_lost" | "agent_disconnected" | "result_response_lost" | "deadline_exceeded";
  "since": Timestamp;
}> | Readonly<{
  "kind": "cancel_requested";
  "previous": "dispatch_pending" | "queued" | "running" | "reconciling";
  "requestedAt": Timestamp;
}> | Readonly<{
  "kind": "terminal";
  "terminal": AttemptTerminal;
}>;

export type AttemptTerminal = Readonly<{
  "finishedAt": Timestamp;
  "outcome": "succeeded";
  "resultEnvelopeDigest": Sha256;
}> | Readonly<{
  "failure": ExecutionFailure;
  "finishedAt": Timestamp;
  "outcome": "failed";
}> | Readonly<{
  "cancellationReceiptId": string;
  "finishedAt": Timestamp;
  "outcome": "cancelled";
}> | Readonly<{
  "finishedAt": Timestamp;
  "interruption": InterruptionRecord;
  "outcome": "interrupted";
  "retrySafety": "safe" | "unsafe" | "requires_reconciliation";
}> | Readonly<{
  "finishedAt": Timestamp;
  "outcome": "rejected";
  "rejection": ExecutionRejection;
}> | Readonly<{
  "finishedAt": Timestamp;
  "inputRequestId": InputRequestId;
  "outcome": "input_required";
}> | Readonly<{
  "finishedAt": Timestamp;
  "outcome": "unverified";
  "uncertainty": UncertaintyRecord;
}>;

export type BaseReference = Readonly<{
  "kind": "git_commit";
  "objectId": GitObjectId;
}> | Readonly<{
  "digest": Sha256;
  "kind": "observation";
}>;

export type CancellationId = string;

export type CancellationSummary = Readonly<{
  "cancellationId": CancellationId;
  "effectsObserved": ReadonlyArray<TargetEffect>;
  "reason": string;
}>;

export type CaseContract = Readonly<{
  "acceptanceCriteria": ReadonlyArray<AcceptanceCriterion>;
  "caseId": CaseId;
  "constraints": ReadonlyArray<ContractClause>;
  "contractDigest": Sha256;
  "createdAt": Timestamp;
  "createdBy": ActorRef;
  "nonGoals": ReadonlyArray<ContractClause>;
  "objective": string;
  "policyRef": PolicyRef;
  "predecessor"?: PredecessorRef;
  "schemaVersion": 1;
  "targetGrants": ReadonlyArray<CaseTargetGrant>;
  "verificationRequirements": ReadonlyArray<VerificationRequirement>;
}>;

export type CaseEvent = Readonly<{
  "actor": ActorRef;
  "caseId": CaseId;
  "causationId": string;
  "committedAt": Timestamp;
  "correlationId": string;
  "entity": EntityRef;
  "eventId": EventId;
  "eventType": string;
  "sequence": number;
  "transition"?: Readonly<{
    "from": string;
    "to": string;
  }>;
}>;

export type CaseId = string;

export type CaseState = Readonly<{
  "caseId": CaseId;
  "caseRevision": number;
  "eventSequence": number;
  "schemaVersion": 1;
  "status": CaseStatus;
  "updatedAt": Timestamp;
}>;

export type CaseStatus = Readonly<{
  "enteredAt": Timestamp;
  "kind": "active";
}> | Readonly<{
  "detail"?: string;
  "kind": "paused";
  "pausedAt": Timestamp;
  "reason": "manual" | "authority_invalidated" | "external_blocker";
}> | Readonly<{
  "cancellationId": CancellationId;
  "kind": "cancelling";
  "reason": string;
  "requestedAt": Timestamp;
  "requestedBy": ActorRef;
}> | Readonly<{
  "kind": "terminal";
  "terminal": CaseTerminal;
}>;

export type CaseTargetGrant = Readonly<{
  "agentId": AgentId;
  "allowedEffects": ReadonlyArray<TargetEffect>;
  "allowedSubpaths": ReadonlyArray<RelativePath>;
  "grantDigest": Sha256;
  "grantId": GrantId;
  "grantedAgainst": GrantedAgainst;
  "rootIdentityDigest": Sha256;
  "schemaVersion": 1;
  "target": Target;
}>;

export type CaseTerminal = Readonly<{
  "closedAt": Timestamp;
  "evidenceSetId": EvidenceSetId;
  "outcome": "completed";
  "summary": string;
}> | Readonly<{
  "closedAt": Timestamp;
  "failure": FailureRecord;
  "outcome": "failed";
  "summary": string;
}> | Readonly<{
  "cancellation": CancellationSummary;
  "closedAt": Timestamp;
  "outcome": "cancelled";
  "summary": string;
}> | Readonly<{
  "closedAt": Timestamp;
  "outcome": "rolled_back";
  "rollbackEvidenceSetId": EvidenceSetId;
  "summary": string;
}> | Readonly<{
  "closedAt": Timestamp;
  "outcome": "unverified";
  "summary": string;
  "uncertainty": UncertaintyRecord;
}>;

export type CheckpointId = string;

export type ContractClause = Readonly<{
  "clauseId": string;
  "statement": string;
}>;

export type ControlError = Readonly<{
  "category": "validation" | "authorization" | "conflict" | "lifecycle" | "availability" | "transport" | "storage" | "internal";
  "code": string;
  "details"?: TypedErrorDetails;
  "message": string;
  "retryable": boolean;
  "subject"?: EntityRef;
}>;

export type DispatchId = string;

export type EntityRef = Readonly<{
  "caseId": CaseId;
  "kind": "case";
}> | Readonly<{
  "kind": "task";
  "taskId": TaskId;
}> | Readonly<{
  "attemptId": AttemptId;
  "kind": "attempt";
}>;

export type EventId = string;

export type EvidenceMapping = Readonly<{
  "criterionId": string;
  "evidenceRefs": ReadonlyArray<EvidenceRef>;
  "requirementIds": ReadonlyArray<string>;
}>;

export type EvidenceRef = Readonly<{
  "kind": "task_result";
  "resultDigest": Sha256;
  "taskId": TaskId;
}> | Readonly<{
  "artifactId": ArtifactId;
  "kind": "artifact";
  "sha256": Sha256;
}> | Readonly<{
  "digest": Sha256;
  "kind": "observation";
  "layer": VerificationLayer;
}>;

export type EvidenceSet = Readonly<{
  "caseId": CaseId;
  "createdAt": Timestamp;
  "evidenceSetDigest": Sha256;
  "evidenceSetId": EvidenceSetId;
  "mappings": ReadonlyArray<EvidenceMapping>;
  "schemaVersion": 1;
}>;

export type EvidenceSetId = string;

export type ExecutionFailure = FailureRecord;

export type ExecutionRejection = FailureRecord;

export type FailureRecord = Readonly<{
  "code": string;
  "message": string;
  "retryable": boolean;
}>;

export type GitObjectId = string;

export type GrantId = string;

export type GrantedAgainst = Readonly<{
  "baseReference"?: BaseReference;
  "projectRevision"?: number;
  "workspacePolicyDigest": Sha256;
  "workspaceRevision": number;
}>;

export type InputRequestId = string;

export type InterruptionRecord = Readonly<{
  "code": string;
  "message": string;
}>;

export type JsonValue = null | boolean | number | string | ReadonlyArray<JsonValue> | Readonly<Record<string, JsonValue>>;

export type MissingEffectDetails = Readonly<{
  "grantId": GrantId;
  "kind": "missing_effect";
  "requiredEffect": TargetEffect;
}>;

export type NewCaseContractInput = Readonly<{
  "acceptanceCriteria": ReadonlyArray<AcceptanceCriterion>;
  "constraints": ReadonlyArray<ContractClause>;
  "nonGoals": ReadonlyArray<ContractClause>;
  "objective": string;
  "policyRef": PolicyRef;
  "predecessor"?: PredecessorRef;
  "targetGrants": ReadonlyArray<NewCaseTargetGrant>;
  "verificationRequirements": ReadonlyArray<VerificationRequirement>;
}>;

export type NewCaseTargetGrant = Readonly<{
  "agentId": AgentId;
  "allowedEffects": ReadonlyArray<TargetEffect>;
  "allowedSubpaths": ReadonlyArray<RelativePath>;
  "grantedAgainst": GrantedAgainst;
  "rootIdentityDigest": Sha256;
  "target": Target;
}>;

export type OperationFailure = FailureRecord;

export type OperationInvocation = Readonly<{
  "arguments": JsonValue;
  "expectedSchemaDigest": Sha256;
  "id": string;
  "inputDigest": Sha256;
  "targets": ReadonlyArray<TargetBinding>;
  "version": number;
}>;

export type OperationResult = Readonly<{
  "kind": "inline";
  "resultDigest": Sha256;
  "value": JsonValue;
}> | Readonly<{
  "artifacts": ReadonlyArray<ArtifactRef>;
  "kind": "artifacts";
  "resultDigest": Sha256;
}> | Readonly<{
  "artifacts": ReadonlyArray<ArtifactRef>;
  "kind": "mixed";
  "resultDigest": Sha256;
  "value": JsonValue;
}> | Readonly<{
  "kind": "none";
  "resultDigest": Sha256;
}>;

export type PolicyRef = Readonly<{
  "digest": Sha256;
  "version": number;
}>;

export type PredecessorRef = Readonly<{
  "caseId": CaseId;
  "checkpointDigest": Sha256;
  "checkpointId": CheckpointId;
  "reason": "objective_changed" | "target_scope_changed" | "authority_changed" | "policy_changed";
}>;

export type ProjectId = string;

export type RelativePath = string;

export type RequestDedupeRecord = Readonly<{
  "caseId": CaseId;
  "createdAt": Timestamp;
  "requestId": RequestId;
  "responseDigest": Sha256;
  "semanticDigest": Sha256;
  "taskId"?: TaskId;
}>;

export type RequestId = string;

export type RetryDecisionId = string;

export type RevisionConflictDetails = Readonly<{
  "actual": number;
  "expected": number;
  "kind": "revision_conflict";
}>;

export type SchemaMismatchDetails = Readonly<{
  "actualDigest": Sha256;
  "expectedDigest": Sha256;
  "kind": "schema_mismatch";
}>;

export type Sha256 = string;

export type Target = Readonly<{
  "kind": "workspace";
  "workspaceId": WorkspaceId;
}> | Readonly<{
  "kind": "project";
  "projectId": ProjectId;
  "workspaceId": WorkspaceId;
}>;

export type TargetBinding = Readonly<{
  "grantId": GrantId;
  "resource": Target;
  "role": string;
}>;

export type TargetEffect = "fs.read" | "fs.write" | "fs.delete" | "git.read" | "git.write" | "remote.read" | "remote.write" | "validation.execute" | "process.execute" | "network.use" | "package.manage" | "service.manage" | "runtime.manage";

export type TaskId = string;

export type TaskRecord = Readonly<{
  "admission": Readonly<{
    "admittedAt": Timestamp;
    "contractDigest": Sha256;
    "inputDigest": Sha256;
    "operationSchemaDigest": Sha256;
    "requestId": RequestId;
  }>;
  "caseId": CaseId;
  "createdAt": Timestamp;
  "latestAttemptId"?: AttemptId;
  "operation": OperationInvocation;
  "schemaVersion": 1;
  "sequence": number;
  "status": TaskStatus;
  "taskId": TaskId;
  "taskRevision": number;
  "updatedAt": Timestamp;
}>;

export type TaskStatus = Readonly<{
  "kind": "waiting";
  "waiting": TaskWaiting;
}> | Readonly<{
  "kind": "ready";
  "readyAt": Timestamp;
}> | Readonly<{
  "attemptId": AttemptId;
  "kind": "active";
}> | Readonly<{
  "attemptId"?: AttemptId;
  "cancellationId": CancellationId;
  "kind": "cancelling";
  "requestedAt": Timestamp;
}> | Readonly<{
  "kind": "terminal";
  "terminal": TaskTerminal;
}>;

export type TaskTerminal = Readonly<{
  "finishedAt": Timestamp;
  "outcome": "succeeded";
  "result": OperationResult;
}> | Readonly<{
  "failure": OperationFailure;
  "finishedAt": Timestamp;
  "outcome": "failed";
}> | Readonly<{
  "cancellation": CancellationSummary;
  "finishedAt": Timestamp;
  "outcome": "cancelled";
}> | Readonly<{
  "approvalDecisionId": ApprovalDecisionId;
  "finishedAt": Timestamp;
  "outcome": "denied";
}> | Readonly<{
  "finishedAt": Timestamp;
  "outcome": "unverified";
  "uncertainty": UncertaintyRecord;
}>;

export type TaskWaiting = Readonly<{
  "approvalRequestId": ApprovalRequestId;
  "reason": "approval";
}> | Readonly<{
  "inputRequestId": InputRequestId;
  "reason": "input";
}> | Readonly<{
  "reason": "retry_decision";
  "retryDecisionId": RetryDecisionId;
}>;

export type Timestamp = string;

export type TypedErrorDetails = RevisionConflictDetails | SchemaMismatchDetails | MissingEffectDetails;

export type UncertaintyRecord = Readonly<{
  "code": string;
  "message": string;
  "possibleEffects": ReadonlyArray<TargetEffect>;
}>;

export type VerificationLayer = "source" | "validation" | "package" | "installation" | "runtime" | "ingress" | "public_mcp" | "client" | "rollback";

export type VerificationRequirement = Readonly<{
  "criterionIds": ReadonlyArray<string>;
  "layer": VerificationLayer;
  "requirementId": string;
  "statement": string;
}>;

export type WorkspaceId = string;
