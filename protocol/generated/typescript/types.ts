// Code generated from protocol/schemas/tdev.v1.schema.json by tools/generate. DO NOT EDIT.

import { IngressError } from "../../runtime/typescript/ingress.ts";
import { verifyProofAndExtract, type ValidationProofV1 } from "../../runtime/typescript/schema.ts";

export const CANONICAL_SCHEMA_DIGEST = "1d9fa43ed48002c8ada1c089132d86e500e2cfbd4646103dd74e033342eea29e";

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

export type CancelCaseInput = Readonly<{
  "caseId": CaseId;
  "expectedCaseRevision": number;
  "reason": string;
  "requestId": RequestId;
}>;

export type CancelTaskInput = Readonly<{
  "caseId": CaseId;
  "expectedTaskRevision": number;
  "reason": string;
  "requestId": RequestId;
  "taskId": TaskId;
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

export type ControlCaseInput = Readonly<{
  "action": Readonly<{
    "detail"?: string;
    "kind": "pause";
    "reason": "manual";
  }> | Readonly<{
    "kind": "resume";
  }> | Readonly<{
    "completedTaskIds": ReadonlyArray<TaskId>;
    "evidenceRefs": ReadonlyArray<EvidenceRef>;
    "kind": "checkpoint";
    "pendingDecisionIds": ReadonlyArray<string>;
    "summary": string;
  }>;
  "caseId": CaseId;
  "expectedCaseRevision": number;
  "requestId": RequestId;
}>;

export type ControlError = Readonly<{
  "category": "validation" | "authorization" | "conflict" | "lifecycle" | "availability" | "transport" | "storage" | "internal";
  "code": string;
  "details"?: TypedErrorDetails;
  "message": string;
  "retryable": boolean;
  "subject"?: EntityRef;
}>;

export type ControlTaskInput = Readonly<{
  "action": Readonly<{
    "approvalRequestId": ApprovalRequestId;
    "evidenceDigest": Sha256;
    "kind": "approve";
  }> | Readonly<{
    "approvalRequestId": ApprovalRequestId;
    "kind": "deny";
    "reason": string;
  }> | Readonly<{
    "inputRequestId": InputRequestId;
    "kind": "provide_input";
    "value": JsonValue;
  }> | Readonly<{
    "kind": "authorize_retry";
    "retryDecisionId": RetryDecisionId;
  }> | Readonly<{
    "kind": "decline_retry";
    "retryDecisionId": RetryDecisionId;
    "terminal": "cancelled" | "unverified";
  }>;
  "caseId": CaseId;
  "expectedTaskRevision": number;
  "requestId": RequestId;
  "taskId": TaskId;
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

export type FinishCaseInput = Readonly<{
  "caseId": CaseId;
  "expectedCaseRevision": number;
  "requestId": RequestId;
  "terminal": Readonly<{
    "evidenceSetId": EvidenceSetId;
    "outcome": "completed";
    "summary": string;
  }> | Readonly<{
    "failure": FailureRecord;
    "outcome": "failed";
    "summary": string;
  }> | Readonly<{
    "outcome": "rolled_back";
    "rollbackEvidenceSetId": EvidenceSetId;
    "summary": string;
  }> | Readonly<{
    "outcome": "unverified";
    "summary": string;
    "uncertainty": UncertaintyRecord;
  }>;
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

export type MutationReceiptV1 = Readonly<{
  "capability": string;
  "caseId": CaseId;
  "committedCaseRevision": number;
  "committedEventSequence": number;
  "committedTaskRevision"?: number;
  "createdAt": Timestamp;
  "requestId": RequestId;
  "response": JsonValue;
  "responseDigest": Sha256;
  "schemaVersion": 1;
  "semanticDigest": Sha256;
  "subject"?: EntityRef;
  "taskId"?: TaskId;
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

export type SubmitOperationInput = Readonly<{
  "case": Readonly<{
    "contract": NewCaseContractInput;
    "kind": "new";
  }> | Readonly<{
    "caseId": CaseId;
    "expectedContractDigest": Sha256;
    "kind": "existing";
  }>;
  "operation": Readonly<{
    "arguments": JsonValue;
    "expectedSchemaDigest": Sha256;
    "id": string;
    "targets": ReadonlyArray<TargetBinding>;
    "version": number;
  }>;
  "requestId": RequestId;
  "wait": Readonly<{
    "mode": "none";
  }> | Readonly<{
    "mode": "bounded";
    "timeoutMs": number;
  }>;
}>;

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

export const UNION_BRANCH_IDENTITIES = {
  ActorRef: [
    "#/$defs/ActorRef/oneOf/0",
    "#/$defs/ActorRef/oneOf/1",
    "#/$defs/ActorRef/oneOf/2",
  ],
  AttemptStatus: [
    "#/$defs/AttemptStatus/oneOf/0",
    "#/$defs/AttemptStatus/oneOf/1",
    "#/$defs/AttemptStatus/oneOf/2",
    "#/$defs/AttemptStatus/oneOf/3",
    "#/$defs/AttemptStatus/oneOf/4",
    "#/$defs/AttemptStatus/oneOf/5",
  ],
  AttemptTerminal: [
    "#/$defs/AttemptTerminal/oneOf/0",
    "#/$defs/AttemptTerminal/oneOf/1",
    "#/$defs/AttemptTerminal/oneOf/2",
    "#/$defs/AttemptTerminal/oneOf/3",
    "#/$defs/AttemptTerminal/oneOf/4",
    "#/$defs/AttemptTerminal/oneOf/5",
    "#/$defs/AttemptTerminal/oneOf/6",
  ],
  BaseReference: [
    "#/$defs/BaseReference/oneOf/0",
    "#/$defs/BaseReference/oneOf/1",
  ],
  CaseStatus: [
    "#/$defs/CaseStatus/oneOf/0",
    "#/$defs/CaseStatus/oneOf/1",
    "#/$defs/CaseStatus/oneOf/2",
    "#/$defs/CaseStatus/oneOf/3",
  ],
  CaseTerminal: [
    "#/$defs/CaseTerminal/oneOf/0",
    "#/$defs/CaseTerminal/oneOf/1",
    "#/$defs/CaseTerminal/oneOf/2",
    "#/$defs/CaseTerminal/oneOf/3",
    "#/$defs/CaseTerminal/oneOf/4",
  ],
  EntityRef: [
    "#/$defs/EntityRef/oneOf/0",
    "#/$defs/EntityRef/oneOf/1",
    "#/$defs/EntityRef/oneOf/2",
  ],
  EvidenceRef: [
    "#/$defs/EvidenceRef/oneOf/0",
    "#/$defs/EvidenceRef/oneOf/1",
    "#/$defs/EvidenceRef/oneOf/2",
  ],
  JsonValue: [
    "#/$defs/JsonValue/oneOf/0",
    "#/$defs/JsonValue/oneOf/1",
    "#/$defs/JsonValue/oneOf/2",
    "#/$defs/JsonValue/oneOf/3",
    "#/$defs/JsonValue/oneOf/4",
    "#/$defs/JsonValue/oneOf/5",
  ],
  OperationResult: [
    "#/$defs/OperationResult/oneOf/0",
    "#/$defs/OperationResult/oneOf/1",
    "#/$defs/OperationResult/oneOf/2",
    "#/$defs/OperationResult/oneOf/3",
  ],
  Target: [
    "#/$defs/Target/oneOf/0",
    "#/$defs/Target/oneOf/1",
  ],
  TaskStatus: [
    "#/$defs/TaskStatus/oneOf/0",
    "#/$defs/TaskStatus/oneOf/1",
    "#/$defs/TaskStatus/oneOf/2",
    "#/$defs/TaskStatus/oneOf/3",
    "#/$defs/TaskStatus/oneOf/4",
  ],
  TaskTerminal: [
    "#/$defs/TaskTerminal/oneOf/0",
    "#/$defs/TaskTerminal/oneOf/1",
    "#/$defs/TaskTerminal/oneOf/2",
    "#/$defs/TaskTerminal/oneOf/3",
    "#/$defs/TaskTerminal/oneOf/4",
  ],
  TaskWaiting: [
    "#/$defs/TaskWaiting/oneOf/0",
    "#/$defs/TaskWaiting/oneOf/1",
    "#/$defs/TaskWaiting/oneOf/2",
  ],
  TypedErrorDetails: [
    "#/$defs/TypedErrorDetails/oneOf/0",
    "#/$defs/TypedErrorDetails/oneOf/1",
    "#/$defs/TypedErrorDetails/oneOf/2",
  ],
} as const;

export function convertActorRefDomain(
  rootValue: unknown,
  proof: ValidationProofV1,
  expectedRootDefinition: string,
  instancePointer: string,
): ActorRef {
  const { extractedValue, match } = verifyProofAndExtract(
    rootValue,
    proof,
    expectedRootDefinition,
    instancePointer,
    "#/$defs/ActorRef/oneOf",
    UNION_BRANCH_IDENTITIES.ActorRef,
    CANONICAL_SCHEMA_DIGEST,
  );

  switch (match.branchIndex) {
    case 0: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "mcp_client"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as ActorRef;
    }
    case 1: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "user"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as ActorRef;
    }
    case 2: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "system"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as ActorRef;
    }
    default:
      throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "validation proof branch index is invalid");
  }
}

export function convertAttemptStatusDomain(
  rootValue: unknown,
  proof: ValidationProofV1,
  expectedRootDefinition: string,
  instancePointer: string,
): AttemptStatus {
  const { extractedValue, match } = verifyProofAndExtract(
    rootValue,
    proof,
    expectedRootDefinition,
    instancePointer,
    "#/$defs/AttemptStatus/oneOf",
    UNION_BRANCH_IDENTITIES.AttemptStatus,
    CANONICAL_SCHEMA_DIGEST,
  );

  switch (match.branchIndex) {
    case 0: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "dispatch_pending"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as AttemptStatus;
    }
    case 1: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "queued"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as AttemptStatus;
    }
    case 2: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "running"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as AttemptStatus;
    }
    case 3: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "reconciling"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as AttemptStatus;
    }
    case 4: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "cancel_requested"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as AttemptStatus;
    }
    case 5: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "terminal"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as AttemptStatus;
    }
    default:
      throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "validation proof branch index is invalid");
  }
}

export function convertAttemptTerminalDomain(
  rootValue: unknown,
  proof: ValidationProofV1,
  expectedRootDefinition: string,
  instancePointer: string,
): AttemptTerminal {
  const { extractedValue, match } = verifyProofAndExtract(
    rootValue,
    proof,
    expectedRootDefinition,
    instancePointer,
    "#/$defs/AttemptTerminal/oneOf",
    UNION_BRANCH_IDENTITIES.AttemptTerminal,
    CANONICAL_SCHEMA_DIGEST,
  );

  switch (match.branchIndex) {
    case 0: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["outcome"] !== "succeeded"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as AttemptTerminal;
    }
    case 1: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["outcome"] !== "failed"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as AttemptTerminal;
    }
    case 2: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["outcome"] !== "cancelled"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as AttemptTerminal;
    }
    case 3: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["outcome"] !== "interrupted"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as AttemptTerminal;
    }
    case 4: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["outcome"] !== "rejected"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as AttemptTerminal;
    }
    case 5: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["outcome"] !== "input_required"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as AttemptTerminal;
    }
    case 6: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["outcome"] !== "unverified"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as AttemptTerminal;
    }
    default:
      throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "validation proof branch index is invalid");
  }
}

export function convertBaseReferenceDomain(
  rootValue: unknown,
  proof: ValidationProofV1,
  expectedRootDefinition: string,
  instancePointer: string,
): BaseReference {
  const { extractedValue, match } = verifyProofAndExtract(
    rootValue,
    proof,
    expectedRootDefinition,
    instancePointer,
    "#/$defs/BaseReference/oneOf",
    UNION_BRANCH_IDENTITIES.BaseReference,
    CANONICAL_SCHEMA_DIGEST,
  );

  switch (match.branchIndex) {
    case 0: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "git_commit"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as BaseReference;
    }
    case 1: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "observation"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as BaseReference;
    }
    default:
      throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "validation proof branch index is invalid");
  }
}

export function convertCaseStatusDomain(
  rootValue: unknown,
  proof: ValidationProofV1,
  expectedRootDefinition: string,
  instancePointer: string,
): CaseStatus {
  const { extractedValue, match } = verifyProofAndExtract(
    rootValue,
    proof,
    expectedRootDefinition,
    instancePointer,
    "#/$defs/CaseStatus/oneOf",
    UNION_BRANCH_IDENTITIES.CaseStatus,
    CANONICAL_SCHEMA_DIGEST,
  );

  switch (match.branchIndex) {
    case 0: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "active"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as CaseStatus;
    }
    case 1: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "paused"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as CaseStatus;
    }
    case 2: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "cancelling"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as CaseStatus;
    }
    case 3: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "terminal"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as CaseStatus;
    }
    default:
      throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "validation proof branch index is invalid");
  }
}

export function convertCaseTerminalDomain(
  rootValue: unknown,
  proof: ValidationProofV1,
  expectedRootDefinition: string,
  instancePointer: string,
): CaseTerminal {
  const { extractedValue, match } = verifyProofAndExtract(
    rootValue,
    proof,
    expectedRootDefinition,
    instancePointer,
    "#/$defs/CaseTerminal/oneOf",
    UNION_BRANCH_IDENTITIES.CaseTerminal,
    CANONICAL_SCHEMA_DIGEST,
  );

  switch (match.branchIndex) {
    case 0: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["outcome"] !== "completed"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as CaseTerminal;
    }
    case 1: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["outcome"] !== "failed"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as CaseTerminal;
    }
    case 2: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["outcome"] !== "cancelled"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as CaseTerminal;
    }
    case 3: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["outcome"] !== "rolled_back"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as CaseTerminal;
    }
    case 4: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["outcome"] !== "unverified"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as CaseTerminal;
    }
    default:
      throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "validation proof branch index is invalid");
  }
}

export function convertEntityRefDomain(
  rootValue: unknown,
  proof: ValidationProofV1,
  expectedRootDefinition: string,
  instancePointer: string,
): EntityRef {
  const { extractedValue, match } = verifyProofAndExtract(
    rootValue,
    proof,
    expectedRootDefinition,
    instancePointer,
    "#/$defs/EntityRef/oneOf",
    UNION_BRANCH_IDENTITIES.EntityRef,
    CANONICAL_SCHEMA_DIGEST,
  );

  switch (match.branchIndex) {
    case 0: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "case"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as EntityRef;
    }
    case 1: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "task"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as EntityRef;
    }
    case 2: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "attempt"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as EntityRef;
    }
    default:
      throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "validation proof branch index is invalid");
  }
}

export function convertEvidenceRefDomain(
  rootValue: unknown,
  proof: ValidationProofV1,
  expectedRootDefinition: string,
  instancePointer: string,
): EvidenceRef {
  const { extractedValue, match } = verifyProofAndExtract(
    rootValue,
    proof,
    expectedRootDefinition,
    instancePointer,
    "#/$defs/EvidenceRef/oneOf",
    UNION_BRANCH_IDENTITIES.EvidenceRef,
    CANONICAL_SCHEMA_DIGEST,
  );

  switch (match.branchIndex) {
    case 0: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "task_result"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as EvidenceRef;
    }
    case 1: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "artifact"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as EvidenceRef;
    }
    case 2: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "observation"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as EvidenceRef;
    }
    default:
      throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "validation proof branch index is invalid");
  }
}

export function convertJsonValueDomain(
  rootValue: unknown,
  proof: ValidationProofV1,
  expectedRootDefinition: string,
  instancePointer: string,
): JsonValue {
  const { extractedValue, match } = verifyProofAndExtract(
    rootValue,
    proof,
    expectedRootDefinition,
    instancePointer,
    "#/$defs/JsonValue/oneOf",
    UNION_BRANCH_IDENTITIES.JsonValue,
    CANONICAL_SCHEMA_DIGEST,
  );

  switch (match.branchIndex) {
    case 0: {
      return extractedValue as JsonValue;
    }
    case 1: {
      return extractedValue as JsonValue;
    }
    case 2: {
      return extractedValue as JsonValue;
    }
    case 3: {
      return extractedValue as JsonValue;
    }
    case 4: {
      return extractedValue as JsonValue;
    }
    case 5: {
      return extractedValue as JsonValue;
    }
    default:
      throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "validation proof branch index is invalid");
  }
}

export function convertOperationResultDomain(
  rootValue: unknown,
  proof: ValidationProofV1,
  expectedRootDefinition: string,
  instancePointer: string,
): OperationResult {
  const { extractedValue, match } = verifyProofAndExtract(
    rootValue,
    proof,
    expectedRootDefinition,
    instancePointer,
    "#/$defs/OperationResult/oneOf",
    UNION_BRANCH_IDENTITIES.OperationResult,
    CANONICAL_SCHEMA_DIGEST,
  );

  switch (match.branchIndex) {
    case 0: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "inline"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as OperationResult;
    }
    case 1: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "artifacts"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as OperationResult;
    }
    case 2: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "mixed"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as OperationResult;
    }
    case 3: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "none"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as OperationResult;
    }
    default:
      throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "validation proof branch index is invalid");
  }
}

export function convertTargetDomain(
  rootValue: unknown,
  proof: ValidationProofV1,
  expectedRootDefinition: string,
  instancePointer: string,
): Target {
  const { extractedValue, match } = verifyProofAndExtract(
    rootValue,
    proof,
    expectedRootDefinition,
    instancePointer,
    "#/$defs/Target/oneOf",
    UNION_BRANCH_IDENTITIES.Target,
    CANONICAL_SCHEMA_DIGEST,
  );

  switch (match.branchIndex) {
    case 0: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "workspace"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as Target;
    }
    case 1: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "project"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as Target;
    }
    default:
      throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "validation proof branch index is invalid");
  }
}

export function convertTaskStatusDomain(
  rootValue: unknown,
  proof: ValidationProofV1,
  expectedRootDefinition: string,
  instancePointer: string,
): TaskStatus {
  const { extractedValue, match } = verifyProofAndExtract(
    rootValue,
    proof,
    expectedRootDefinition,
    instancePointer,
    "#/$defs/TaskStatus/oneOf",
    UNION_BRANCH_IDENTITIES.TaskStatus,
    CANONICAL_SCHEMA_DIGEST,
  );

  switch (match.branchIndex) {
    case 0: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "waiting"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as TaskStatus;
    }
    case 1: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "ready"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as TaskStatus;
    }
    case 2: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "active"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as TaskStatus;
    }
    case 3: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "cancelling"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as TaskStatus;
    }
    case 4: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "terminal"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as TaskStatus;
    }
    default:
      throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "validation proof branch index is invalid");
  }
}

export function convertTaskTerminalDomain(
  rootValue: unknown,
  proof: ValidationProofV1,
  expectedRootDefinition: string,
  instancePointer: string,
): TaskTerminal {
  const { extractedValue, match } = verifyProofAndExtract(
    rootValue,
    proof,
    expectedRootDefinition,
    instancePointer,
    "#/$defs/TaskTerminal/oneOf",
    UNION_BRANCH_IDENTITIES.TaskTerminal,
    CANONICAL_SCHEMA_DIGEST,
  );

  switch (match.branchIndex) {
    case 0: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["outcome"] !== "succeeded"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as TaskTerminal;
    }
    case 1: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["outcome"] !== "failed"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as TaskTerminal;
    }
    case 2: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["outcome"] !== "cancelled"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as TaskTerminal;
    }
    case 3: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["outcome"] !== "denied"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as TaskTerminal;
    }
    case 4: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["outcome"] !== "unverified"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as TaskTerminal;
    }
    default:
      throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "validation proof branch index is invalid");
  }
}

export function convertTaskWaitingDomain(
  rootValue: unknown,
  proof: ValidationProofV1,
  expectedRootDefinition: string,
  instancePointer: string,
): TaskWaiting {
  const { extractedValue, match } = verifyProofAndExtract(
    rootValue,
    proof,
    expectedRootDefinition,
    instancePointer,
    "#/$defs/TaskWaiting/oneOf",
    UNION_BRANCH_IDENTITIES.TaskWaiting,
    CANONICAL_SCHEMA_DIGEST,
  );

  switch (match.branchIndex) {
    case 0: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["reason"] !== "approval"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as TaskWaiting;
    }
    case 1: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["reason"] !== "input"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as TaskWaiting;
    }
    case 2: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["reason"] !== "retry_decision"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as TaskWaiting;
    }
    default:
      throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "validation proof branch index is invalid");
  }
}

export function convertTypedErrorDetailsDomain(
  rootValue: unknown,
  proof: ValidationProofV1,
  expectedRootDefinition: string,
  instancePointer: string,
): TypedErrorDetails {
  const { extractedValue, match } = verifyProofAndExtract(
    rootValue,
    proof,
    expectedRootDefinition,
    instancePointer,
    "#/$defs/TypedErrorDetails/oneOf",
    UNION_BRANCH_IDENTITIES.TypedErrorDetails,
    CANONICAL_SCHEMA_DIGEST,
  );

  switch (match.branchIndex) {
    case 0: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "revision_conflict"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as TypedErrorDetails;
    }
    case 1: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "schema_mismatch"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as TypedErrorDetails;
    }
    case 2: {
      if (
        extractedValue === null ||
        typeof extractedValue !== "object" ||
        Array.isArray(extractedValue)
        || (extractedValue as Record<string, unknown>)["kind"] !== "missing_effect"
      ) {
        throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "union const discriminator does not match the proved branch");
      }
      return extractedValue as TypedErrorDetails;
    }
    default:
      throw new IngressError("UNION_DISCRIMINATOR_MISMATCH", "UNION_DISCRIMINATOR", "validation proof branch index is invalid");
  }
}
