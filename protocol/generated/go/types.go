// Code generated from protocol/schemas/tdev.v1.schema.json by tools/generate. DO NOT EDIT.

package protocol

import "encoding/json"

type AcceptanceCriterion struct {
	CriterionID string `json:"criterionId"`
	Mandatory   bool   `json:"mandatory"`
	Statement   string `json:"statement"`
}

type ActorRef json.RawMessage

type AgentId string

type ApprovalDecisionId string

type ApprovalRequestId string

type ArtifactId string

type ArtifactRef struct {
	ArtifactID ArtifactId `json:"artifactId"`
	Bytes      int64      `json:"bytes"`
	CaseID     CaseId     `json:"caseId"`
	CreatedAt  Timestamp  `json:"createdAt"`
	MediaType  string     `json:"mediaType"`
	SHA256     Sha256     `json:"sha256"`
	TaskID     TaskId     `json:"taskId"`
}

type AttemptId string

type AttemptRecord struct {
	AgentID              AgentId       `json:"agentId"`
	AttemptID            AttemptId     `json:"attemptId"`
	AttemptRevision      int64         `json:"attemptRevision"`
	CaseID               CaseId        `json:"caseId"`
	CreatedAt            Timestamp     `json:"createdAt"`
	DeadlineAt           Timestamp     `json:"deadlineAt"`
	DispatchID           DispatchId    `json:"dispatchId"`
	ExpectedTaskRevision int64         `json:"expectedTaskRevision"`
	OperationInputDigest Sha256        `json:"operationInputDigest"`
	Ordinal              int64         `json:"ordinal"`
	SchemaVersion        int64         `json:"schemaVersion"`
	Status               AttemptStatus `json:"status"`
	TaskID               TaskId        `json:"taskId"`
	UpdatedAt            Timestamp     `json:"updatedAt"`
}

type AttemptStatus json.RawMessage

type AttemptTerminal json.RawMessage

type BaseReference json.RawMessage

type CancellationId string

type CancellationSummary struct {
	CancellationID  CancellationId `json:"cancellationId"`
	EffectsObserved []TargetEffect `json:"effectsObserved"`
	Reason          string         `json:"reason"`
}

type CaseContract struct {
	AcceptanceCriteria       []AcceptanceCriterion     `json:"acceptanceCriteria"`
	CaseID                   CaseId                    `json:"caseId"`
	Constraints              []ContractClause          `json:"constraints"`
	ContractDigest           Sha256                    `json:"contractDigest"`
	CreatedAt                Timestamp                 `json:"createdAt"`
	CreatedBy                ActorRef                  `json:"createdBy"`
	NonGoals                 []ContractClause          `json:"nonGoals"`
	Objective                string                    `json:"objective"`
	PolicyRef                PolicyRef                 `json:"policyRef"`
	Predecessor              *PredecessorRef           `json:"predecessor,omitempty"`
	SchemaVersion            int64                     `json:"schemaVersion"`
	TargetGrants             []CaseTargetGrant         `json:"targetGrants"`
	VerificationRequirements []VerificationRequirement `json:"verificationRequirements"`
}

type CaseEvent struct {
	Actor         ActorRef  `json:"actor"`
	CaseID        CaseId    `json:"caseId"`
	CausationID   string    `json:"causationId"`
	CommittedAt   Timestamp `json:"committedAt"`
	CorrelationID string    `json:"correlationId"`
	Entity        EntityRef `json:"entity"`
	EventID       EventId   `json:"eventId"`
	EventType     string    `json:"eventType"`
	Sequence      int64     `json:"sequence"`
	Transition    *struct {
		From string `json:"from"`
		To   string `json:"to"`
	} `json:"transition,omitempty"`
}

type CaseId string

type CaseState struct {
	CaseID        CaseId     `json:"caseId"`
	CaseRevision  int64      `json:"caseRevision"`
	EventSequence int64      `json:"eventSequence"`
	SchemaVersion int64      `json:"schemaVersion"`
	Status        CaseStatus `json:"status"`
	UpdatedAt     Timestamp  `json:"updatedAt"`
}

type CaseStatus json.RawMessage

type CaseTargetGrant struct {
	AgentID            AgentId        `json:"agentId"`
	AllowedEffects     []TargetEffect `json:"allowedEffects"`
	AllowedSubpaths    []RelativePath `json:"allowedSubpaths"`
	GrantDigest        Sha256         `json:"grantDigest"`
	GrantID            GrantId        `json:"grantId"`
	GrantedAgainst     GrantedAgainst `json:"grantedAgainst"`
	RootIdentityDigest Sha256         `json:"rootIdentityDigest"`
	SchemaVersion      int64          `json:"schemaVersion"`
	Target             Target         `json:"target"`
}

type CaseTerminal json.RawMessage

type CheckpointId string

type ContractClause struct {
	ClauseID  string `json:"clauseId"`
	Statement string `json:"statement"`
}

type ControlError struct {
	Category  string             `json:"category"`
	Code      string             `json:"code"`
	Details   *TypedErrorDetails `json:"details,omitempty"`
	Message   string             `json:"message"`
	Retryable bool               `json:"retryable"`
	Subject   *EntityRef         `json:"subject,omitempty"`
}

type DispatchId string

type EntityRef json.RawMessage

type EventId string

type EvidenceMapping struct {
	CriterionID    string        `json:"criterionId"`
	EvidenceRefs   []EvidenceRef `json:"evidenceRefs"`
	RequirementIds []string      `json:"requirementIds"`
}

type EvidenceRef json.RawMessage

type EvidenceSet struct {
	CaseID            CaseId            `json:"caseId"`
	CreatedAt         Timestamp         `json:"createdAt"`
	EvidenceSetDigest Sha256            `json:"evidenceSetDigest"`
	EvidenceSetID     EvidenceSetId     `json:"evidenceSetId"`
	Mappings          []EvidenceMapping `json:"mappings"`
	SchemaVersion     int64             `json:"schemaVersion"`
}

type EvidenceSetId string

type ExecutionFailure = FailureRecord

type ExecutionRejection = FailureRecord

type FailureRecord struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	Retryable bool   `json:"retryable"`
}

type GitObjectId string

type GrantId string

type GrantedAgainst struct {
	BaseReference         *BaseReference `json:"baseReference,omitempty"`
	ProjectRevision       *int64         `json:"projectRevision,omitempty"`
	WorkspacePolicyDigest Sha256         `json:"workspacePolicyDigest"`
	WorkspaceRevision     int64          `json:"workspaceRevision"`
}

type InputRequestId string

type InterruptionRecord struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type JsonValue = any

type MissingEffectDetails struct {
	GrantID        GrantId      `json:"grantId"`
	Kind           string       `json:"kind"`
	RequiredEffect TargetEffect `json:"requiredEffect"`
}

type NewCaseContractInput struct {
	AcceptanceCriteria       []AcceptanceCriterion     `json:"acceptanceCriteria"`
	Constraints              []ContractClause          `json:"constraints"`
	NonGoals                 []ContractClause          `json:"nonGoals"`
	Objective                string                    `json:"objective"`
	PolicyRef                PolicyRef                 `json:"policyRef"`
	Predecessor              *PredecessorRef           `json:"predecessor,omitempty"`
	TargetGrants             []NewCaseTargetGrant      `json:"targetGrants"`
	VerificationRequirements []VerificationRequirement `json:"verificationRequirements"`
}

type NewCaseTargetGrant struct {
	AgentID            AgentId        `json:"agentId"`
	AllowedEffects     []TargetEffect `json:"allowedEffects"`
	AllowedSubpaths    []RelativePath `json:"allowedSubpaths"`
	GrantedAgainst     GrantedAgainst `json:"grantedAgainst"`
	RootIdentityDigest Sha256         `json:"rootIdentityDigest"`
	Target             Target         `json:"target"`
}

type OperationFailure = FailureRecord

type OperationInvocation struct {
	Arguments            JsonValue       `json:"arguments"`
	ExpectedSchemaDigest Sha256          `json:"expectedSchemaDigest"`
	ID                   string          `json:"id"`
	InputDigest          Sha256          `json:"inputDigest"`
	Targets              []TargetBinding `json:"targets"`
	Version              int64           `json:"version"`
}

type OperationResult json.RawMessage

type PolicyRef struct {
	Digest  Sha256 `json:"digest"`
	Version int64  `json:"version"`
}

type PredecessorRef struct {
	CaseID           CaseId       `json:"caseId"`
	CheckpointDigest Sha256       `json:"checkpointDigest"`
	CheckpointID     CheckpointId `json:"checkpointId"`
	Reason           string       `json:"reason"`
}

type ProjectId string

type RelativePath string

type RequestDedupeRecord struct {
	CaseID         CaseId    `json:"caseId"`
	CreatedAt      Timestamp `json:"createdAt"`
	RequestID      RequestId `json:"requestId"`
	ResponseDigest Sha256    `json:"responseDigest"`
	SemanticDigest Sha256    `json:"semanticDigest"`
	TaskID         *TaskId   `json:"taskId,omitempty"`
}

type RequestId string

type RetryDecisionId string

type RevisionConflictDetails struct {
	Actual   int64  `json:"actual"`
	Expected int64  `json:"expected"`
	Kind     string `json:"kind"`
}

type SchemaMismatchDetails struct {
	ActualDigest   Sha256 `json:"actualDigest"`
	ExpectedDigest Sha256 `json:"expectedDigest"`
	Kind           string `json:"kind"`
}

type Sha256 string

type Target json.RawMessage

type TargetBinding struct {
	GrantID  GrantId `json:"grantId"`
	Resource Target  `json:"resource"`
	Role     string  `json:"role"`
}

type TargetEffect string

const (
	TargetEffectFsRead            TargetEffect = "fs.read"
	TargetEffectFsWrite           TargetEffect = "fs.write"
	TargetEffectFsDelete          TargetEffect = "fs.delete"
	TargetEffectGitRead           TargetEffect = "git.read"
	TargetEffectGitWrite          TargetEffect = "git.write"
	TargetEffectRemoteRead        TargetEffect = "remote.read"
	TargetEffectRemoteWrite       TargetEffect = "remote.write"
	TargetEffectValidationExecute TargetEffect = "validation.execute"
	TargetEffectProcessExecute    TargetEffect = "process.execute"
	TargetEffectNetworkUse        TargetEffect = "network.use"
	TargetEffectPackageManage     TargetEffect = "package.manage"
	TargetEffectServiceManage     TargetEffect = "service.manage"
	TargetEffectRuntimeManage     TargetEffect = "runtime.manage"
)

type TaskId string

type TaskRecord struct {
	Admission struct {
		AdmittedAt            Timestamp `json:"admittedAt"`
		ContractDigest        Sha256    `json:"contractDigest"`
		InputDigest           Sha256    `json:"inputDigest"`
		OperationSchemaDigest Sha256    `json:"operationSchemaDigest"`
		RequestID             RequestId `json:"requestId"`
	} `json:"admission"`
	CaseID          CaseId              `json:"caseId"`
	CreatedAt       Timestamp           `json:"createdAt"`
	LatestAttemptID *AttemptId          `json:"latestAttemptId,omitempty"`
	Operation       OperationInvocation `json:"operation"`
	SchemaVersion   int64               `json:"schemaVersion"`
	Sequence        int64               `json:"sequence"`
	Status          TaskStatus          `json:"status"`
	TaskID          TaskId              `json:"taskId"`
	TaskRevision    int64               `json:"taskRevision"`
	UpdatedAt       Timestamp           `json:"updatedAt"`
}

type TaskStatus json.RawMessage

type TaskTerminal json.RawMessage

type TaskWaiting json.RawMessage

type Timestamp string

type TypedErrorDetails json.RawMessage

type UncertaintyRecord struct {
	Code            string         `json:"code"`
	Message         string         `json:"message"`
	PossibleEffects []TargetEffect `json:"possibleEffects"`
}

type VerificationLayer string

const (
	VerificationLayerSource       VerificationLayer = "source"
	VerificationLayerValidation   VerificationLayer = "validation"
	VerificationLayerPackage      VerificationLayer = "package"
	VerificationLayerInstallation VerificationLayer = "installation"
	VerificationLayerRuntime      VerificationLayer = "runtime"
	VerificationLayerIngress      VerificationLayer = "ingress"
	VerificationLayerPublicMcp    VerificationLayer = "public_mcp"
	VerificationLayerClient       VerificationLayer = "client"
	VerificationLayerRollback     VerificationLayer = "rollback"
)

type VerificationRequirement struct {
	CriterionIds  []string          `json:"criterionIds"`
	Layer         VerificationLayer `json:"layer"`
	RequirementID string            `json:"requirementId"`
	Statement     string            `json:"statement"`
}

type WorkspaceId string
