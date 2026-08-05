// Code generated from protocol/schemas/tdev.v1.schema.json by tools/generate. DO NOT EDIT.

package protocol

import (
	"encoding/json"
	protocolruntime "github.com/humtr/tdev/protocol/runtime/go"
)

const CanonicalSchemaDigest = "c7ed47587e6a5fa1dbe22e0d43a844df7369979682f5a5271799806b8f63178a"

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

type CancelCaseInput struct {
	CaseID               CaseId    `json:"caseId"`
	ExpectedCaseRevision int64     `json:"expectedCaseRevision"`
	Reason               string    `json:"reason"`
	RequestID            RequestId `json:"requestId"`
}

type CancelTaskInput struct {
	CaseID               CaseId    `json:"caseId"`
	ExpectedTaskRevision int64     `json:"expectedTaskRevision"`
	Reason               string    `json:"reason"`
	RequestID            RequestId `json:"requestId"`
	TaskID               TaskId    `json:"taskId"`
}

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

type ControlCaseInput struct {
	Action               json.RawMessage `json:"action"`
	CaseID               CaseId          `json:"caseId"`
	ExpectedCaseRevision int64           `json:"expectedCaseRevision"`
	RequestID            RequestId       `json:"requestId"`
}

type ControlError struct {
	Category  string             `json:"category"`
	Code      string             `json:"code"`
	Details   *TypedErrorDetails `json:"details,omitempty"`
	Message   string             `json:"message"`
	Retryable bool               `json:"retryable"`
	Subject   *EntityRef         `json:"subject,omitempty"`
}

type ControlTaskInput struct {
	Action               json.RawMessage `json:"action"`
	CaseID               CaseId          `json:"caseId"`
	ExpectedTaskRevision int64           `json:"expectedTaskRevision"`
	RequestID            RequestId       `json:"requestId"`
	TaskID               TaskId          `json:"taskId"`
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

type FinishCaseInput struct {
	CaseID               CaseId          `json:"caseId"`
	ExpectedCaseRevision int64           `json:"expectedCaseRevision"`
	RequestID            RequestId       `json:"requestId"`
	Terminal             json.RawMessage `json:"terminal"`
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

type MutationReceiptV1 struct {
	Capability             string     `json:"capability"`
	CaseID                 CaseId     `json:"caseId"`
	CommittedCaseRevision  int64      `json:"committedCaseRevision"`
	CommittedEventSequence int64      `json:"committedEventSequence"`
	CommittedTaskRevision  *int64     `json:"committedTaskRevision,omitempty"`
	CreatedAt              Timestamp  `json:"createdAt"`
	RequestID              RequestId  `json:"requestId"`
	Response               JsonValue  `json:"response"`
	ResponseDigest         Sha256     `json:"responseDigest"`
	SchemaVersion          int64      `json:"schemaVersion"`
	SemanticDigest         Sha256     `json:"semanticDigest"`
	Subject                *EntityRef `json:"subject,omitempty"`
	TaskID                 *TaskId    `json:"taskId,omitempty"`
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

type SubmitOperationInput struct {
	Case      json.RawMessage `json:"case"`
	Operation struct {
		Arguments            JsonValue       `json:"arguments"`
		ExpectedSchemaDigest Sha256          `json:"expectedSchemaDigest"`
		ID                   string          `json:"id"`
		Targets              []TargetBinding `json:"targets"`
		Version              int64           `json:"version"`
	} `json:"operation"`
	RequestID RequestId       `json:"requestId"`
	Wait      json.RawMessage `json:"wait"`
}

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

type ActorRefDomain struct {
	BranchIndex     int
	BranchIdentity  string
	ActorRefBranch0 *struct {
		Kind      string `json:"kind"`
		SubjectID string `json:"subjectId"`
	}
	ActorRefBranch1 *struct {
		Kind      string `json:"kind"`
		SubjectID string `json:"subjectId"`
	}
	ActorRefBranch2 *struct {
		Component string `json:"component"`
		Kind      string `json:"kind"`
	}
}

func ConvertActorRefDomain(rootValue any, proof *protocolruntime.ValidationProofV1, expectedRootDefinition string, instancePointer string) (*ActorRefDomain, error) {
	extracted, match, err := protocolruntime.VerifyProofAndExtract(
		rootValue,
		proof,
		expectedRootDefinition,
		instancePointer,
		"#/$defs/ActorRef/oneOf",
		[]string{
			"#/$defs/ActorRef/oneOf/0",
			"#/$defs/ActorRef/oneOf/1",
			"#/$defs/ActorRef/oneOf/2",
		},
		CanonicalSchemaDigest,
	)
	if err != nil {
		return nil, err
	}
	domain := &ActorRefDomain{BranchIndex: match.BranchIndex, BranchIdentity: match.BranchIdentity}
	switch match.BranchIndex {
	case 0:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "mcp_client" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			Kind      string `json:"kind"`
			SubjectID string `json:"subjectId"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.ActorRefBranch0 = &val
	case 1:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "user" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			Kind      string `json:"kind"`
			SubjectID string `json:"subjectId"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.ActorRefBranch1 = &val
	case 2:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "system" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			Component string `json:"component"`
			Kind      string `json:"kind"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.ActorRefBranch2 = &val
	default:
		return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "validation proof branch index is invalid"}
	}
	return domain, nil
}

type AttemptStatusDomain struct {
	BranchIndex          int
	BranchIdentity       string
	AttemptStatusBranch0 *struct {
		Kind string `json:"kind"`
	}
	AttemptStatusBranch1 *struct {
		AgentEpoch   int64     `json:"agentEpoch"`
		FencingToken string    `json:"fencingToken"`
		Kind         string    `json:"kind"`
		QueuedAt     Timestamp `json:"queuedAt"`
	}
	AttemptStatusBranch2 *struct {
		AgentEpoch   int64     `json:"agentEpoch"`
		FencingToken string    `json:"fencingToken"`
		Kind         string    `json:"kind"`
		StartedAt    Timestamp `json:"startedAt"`
	}
	AttemptStatusBranch3 *struct {
		Kind   string    `json:"kind"`
		Reason string    `json:"reason"`
		Since  Timestamp `json:"since"`
	}
	AttemptStatusBranch4 *struct {
		Kind        string    `json:"kind"`
		Previous    string    `json:"previous"`
		RequestedAt Timestamp `json:"requestedAt"`
	}
	AttemptStatusBranch5 *struct {
		Kind     string          `json:"kind"`
		Terminal AttemptTerminal `json:"terminal"`
	}
}

func ConvertAttemptStatusDomain(rootValue any, proof *protocolruntime.ValidationProofV1, expectedRootDefinition string, instancePointer string) (*AttemptStatusDomain, error) {
	extracted, match, err := protocolruntime.VerifyProofAndExtract(
		rootValue,
		proof,
		expectedRootDefinition,
		instancePointer,
		"#/$defs/AttemptStatus/oneOf",
		[]string{
			"#/$defs/AttemptStatus/oneOf/0",
			"#/$defs/AttemptStatus/oneOf/1",
			"#/$defs/AttemptStatus/oneOf/2",
			"#/$defs/AttemptStatus/oneOf/3",
			"#/$defs/AttemptStatus/oneOf/4",
			"#/$defs/AttemptStatus/oneOf/5",
		},
		CanonicalSchemaDigest,
	)
	if err != nil {
		return nil, err
	}
	domain := &AttemptStatusDomain{BranchIndex: match.BranchIndex, BranchIdentity: match.BranchIdentity}
	switch match.BranchIndex {
	case 0:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "dispatch_pending" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			Kind string `json:"kind"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.AttemptStatusBranch0 = &val
	case 1:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "queued" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			AgentEpoch   int64     `json:"agentEpoch"`
			FencingToken string    `json:"fencingToken"`
			Kind         string    `json:"kind"`
			QueuedAt     Timestamp `json:"queuedAt"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.AttemptStatusBranch1 = &val
	case 2:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "running" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			AgentEpoch   int64     `json:"agentEpoch"`
			FencingToken string    `json:"fencingToken"`
			Kind         string    `json:"kind"`
			StartedAt    Timestamp `json:"startedAt"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.AttemptStatusBranch2 = &val
	case 3:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "reconciling" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			Kind   string    `json:"kind"`
			Reason string    `json:"reason"`
			Since  Timestamp `json:"since"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.AttemptStatusBranch3 = &val
	case 4:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "cancel_requested" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			Kind        string    `json:"kind"`
			Previous    string    `json:"previous"`
			RequestedAt Timestamp `json:"requestedAt"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.AttemptStatusBranch4 = &val
	case 5:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "terminal" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			Kind     string          `json:"kind"`
			Terminal AttemptTerminal `json:"terminal"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.AttemptStatusBranch5 = &val
	default:
		return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "validation proof branch index is invalid"}
	}
	return domain, nil
}

type AttemptTerminalDomain struct {
	BranchIndex            int
	BranchIdentity         string
	AttemptTerminalBranch0 *struct {
		FinishedAt           Timestamp `json:"finishedAt"`
		Outcome              string    `json:"outcome"`
		ResultEnvelopeDigest Sha256    `json:"resultEnvelopeDigest"`
	}
	AttemptTerminalBranch1 *struct {
		Failure    ExecutionFailure `json:"failure"`
		FinishedAt Timestamp        `json:"finishedAt"`
		Outcome    string           `json:"outcome"`
	}
	AttemptTerminalBranch2 *struct {
		CancellationReceiptID string    `json:"cancellationReceiptId"`
		FinishedAt            Timestamp `json:"finishedAt"`
		Outcome               string    `json:"outcome"`
	}
	AttemptTerminalBranch3 *struct {
		FinishedAt   Timestamp          `json:"finishedAt"`
		Interruption InterruptionRecord `json:"interruption"`
		Outcome      string             `json:"outcome"`
		RetrySafety  string             `json:"retrySafety"`
	}
	AttemptTerminalBranch4 *struct {
		FinishedAt Timestamp          `json:"finishedAt"`
		Outcome    string             `json:"outcome"`
		Rejection  ExecutionRejection `json:"rejection"`
	}
	AttemptTerminalBranch5 *struct {
		FinishedAt     Timestamp      `json:"finishedAt"`
		InputRequestID InputRequestId `json:"inputRequestId"`
		Outcome        string         `json:"outcome"`
	}
	AttemptTerminalBranch6 *struct {
		FinishedAt  Timestamp         `json:"finishedAt"`
		Outcome     string            `json:"outcome"`
		Uncertainty UncertaintyRecord `json:"uncertainty"`
	}
}

func ConvertAttemptTerminalDomain(rootValue any, proof *protocolruntime.ValidationProofV1, expectedRootDefinition string, instancePointer string) (*AttemptTerminalDomain, error) {
	extracted, match, err := protocolruntime.VerifyProofAndExtract(
		rootValue,
		proof,
		expectedRootDefinition,
		instancePointer,
		"#/$defs/AttemptTerminal/oneOf",
		[]string{
			"#/$defs/AttemptTerminal/oneOf/0",
			"#/$defs/AttemptTerminal/oneOf/1",
			"#/$defs/AttemptTerminal/oneOf/2",
			"#/$defs/AttemptTerminal/oneOf/3",
			"#/$defs/AttemptTerminal/oneOf/4",
			"#/$defs/AttemptTerminal/oneOf/5",
			"#/$defs/AttemptTerminal/oneOf/6",
		},
		CanonicalSchemaDigest,
	)
	if err != nil {
		return nil, err
	}
	domain := &AttemptTerminalDomain{BranchIndex: match.BranchIndex, BranchIdentity: match.BranchIdentity}
	switch match.BranchIndex {
	case 0:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["outcome"] != "succeeded" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			FinishedAt           Timestamp `json:"finishedAt"`
			Outcome              string    `json:"outcome"`
			ResultEnvelopeDigest Sha256    `json:"resultEnvelopeDigest"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.AttemptTerminalBranch0 = &val
	case 1:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["outcome"] != "failed" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			Failure    ExecutionFailure `json:"failure"`
			FinishedAt Timestamp        `json:"finishedAt"`
			Outcome    string           `json:"outcome"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.AttemptTerminalBranch1 = &val
	case 2:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["outcome"] != "cancelled" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			CancellationReceiptID string    `json:"cancellationReceiptId"`
			FinishedAt            Timestamp `json:"finishedAt"`
			Outcome               string    `json:"outcome"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.AttemptTerminalBranch2 = &val
	case 3:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["outcome"] != "interrupted" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			FinishedAt   Timestamp          `json:"finishedAt"`
			Interruption InterruptionRecord `json:"interruption"`
			Outcome      string             `json:"outcome"`
			RetrySafety  string             `json:"retrySafety"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.AttemptTerminalBranch3 = &val
	case 4:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["outcome"] != "rejected" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			FinishedAt Timestamp          `json:"finishedAt"`
			Outcome    string             `json:"outcome"`
			Rejection  ExecutionRejection `json:"rejection"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.AttemptTerminalBranch4 = &val
	case 5:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["outcome"] != "input_required" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			FinishedAt     Timestamp      `json:"finishedAt"`
			InputRequestID InputRequestId `json:"inputRequestId"`
			Outcome        string         `json:"outcome"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.AttemptTerminalBranch5 = &val
	case 6:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["outcome"] != "unverified" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			FinishedAt  Timestamp         `json:"finishedAt"`
			Outcome     string            `json:"outcome"`
			Uncertainty UncertaintyRecord `json:"uncertainty"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.AttemptTerminalBranch6 = &val
	default:
		return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "validation proof branch index is invalid"}
	}
	return domain, nil
}

type BaseReferenceDomain struct {
	BranchIndex          int
	BranchIdentity       string
	BaseReferenceBranch0 *struct {
		Kind     string      `json:"kind"`
		ObjectID GitObjectId `json:"objectId"`
	}
	BaseReferenceBranch1 *struct {
		Digest Sha256 `json:"digest"`
		Kind   string `json:"kind"`
	}
}

func ConvertBaseReferenceDomain(rootValue any, proof *protocolruntime.ValidationProofV1, expectedRootDefinition string, instancePointer string) (*BaseReferenceDomain, error) {
	extracted, match, err := protocolruntime.VerifyProofAndExtract(
		rootValue,
		proof,
		expectedRootDefinition,
		instancePointer,
		"#/$defs/BaseReference/oneOf",
		[]string{
			"#/$defs/BaseReference/oneOf/0",
			"#/$defs/BaseReference/oneOf/1",
		},
		CanonicalSchemaDigest,
	)
	if err != nil {
		return nil, err
	}
	domain := &BaseReferenceDomain{BranchIndex: match.BranchIndex, BranchIdentity: match.BranchIdentity}
	switch match.BranchIndex {
	case 0:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "git_commit" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			Kind     string      `json:"kind"`
			ObjectID GitObjectId `json:"objectId"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.BaseReferenceBranch0 = &val
	case 1:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "observation" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			Digest Sha256 `json:"digest"`
			Kind   string `json:"kind"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.BaseReferenceBranch1 = &val
	default:
		return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "validation proof branch index is invalid"}
	}
	return domain, nil
}

type CaseStatusDomain struct {
	BranchIndex       int
	BranchIdentity    string
	CaseStatusBranch0 *struct {
		EnteredAt Timestamp `json:"enteredAt"`
		Kind      string    `json:"kind"`
	}
	CaseStatusBranch1 *struct {
		Detail   *string   `json:"detail,omitempty"`
		Kind     string    `json:"kind"`
		PausedAt Timestamp `json:"pausedAt"`
		Reason   string    `json:"reason"`
	}
	CaseStatusBranch2 *struct {
		CancellationID CancellationId `json:"cancellationId"`
		Kind           string         `json:"kind"`
		Reason         string         `json:"reason"`
		RequestedAt    Timestamp      `json:"requestedAt"`
		RequestedBy    ActorRef       `json:"requestedBy"`
	}
	CaseStatusBranch3 *struct {
		Kind     string       `json:"kind"`
		Terminal CaseTerminal `json:"terminal"`
	}
}

func ConvertCaseStatusDomain(rootValue any, proof *protocolruntime.ValidationProofV1, expectedRootDefinition string, instancePointer string) (*CaseStatusDomain, error) {
	extracted, match, err := protocolruntime.VerifyProofAndExtract(
		rootValue,
		proof,
		expectedRootDefinition,
		instancePointer,
		"#/$defs/CaseStatus/oneOf",
		[]string{
			"#/$defs/CaseStatus/oneOf/0",
			"#/$defs/CaseStatus/oneOf/1",
			"#/$defs/CaseStatus/oneOf/2",
			"#/$defs/CaseStatus/oneOf/3",
		},
		CanonicalSchemaDigest,
	)
	if err != nil {
		return nil, err
	}
	domain := &CaseStatusDomain{BranchIndex: match.BranchIndex, BranchIdentity: match.BranchIdentity}
	switch match.BranchIndex {
	case 0:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "active" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			EnteredAt Timestamp `json:"enteredAt"`
			Kind      string    `json:"kind"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.CaseStatusBranch0 = &val
	case 1:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "paused" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			Detail   *string   `json:"detail,omitempty"`
			Kind     string    `json:"kind"`
			PausedAt Timestamp `json:"pausedAt"`
			Reason   string    `json:"reason"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.CaseStatusBranch1 = &val
	case 2:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "cancelling" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			CancellationID CancellationId `json:"cancellationId"`
			Kind           string         `json:"kind"`
			Reason         string         `json:"reason"`
			RequestedAt    Timestamp      `json:"requestedAt"`
			RequestedBy    ActorRef       `json:"requestedBy"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.CaseStatusBranch2 = &val
	case 3:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "terminal" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			Kind     string       `json:"kind"`
			Terminal CaseTerminal `json:"terminal"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.CaseStatusBranch3 = &val
	default:
		return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "validation proof branch index is invalid"}
	}
	return domain, nil
}

type CaseTerminalDomain struct {
	BranchIndex         int
	BranchIdentity      string
	CaseTerminalBranch0 *struct {
		ClosedAt      Timestamp     `json:"closedAt"`
		EvidenceSetID EvidenceSetId `json:"evidenceSetId"`
		Outcome       string        `json:"outcome"`
		Summary       string        `json:"summary"`
	}
	CaseTerminalBranch1 *struct {
		ClosedAt Timestamp     `json:"closedAt"`
		Failure  FailureRecord `json:"failure"`
		Outcome  string        `json:"outcome"`
		Summary  string        `json:"summary"`
	}
	CaseTerminalBranch2 *struct {
		Cancellation CancellationSummary `json:"cancellation"`
		ClosedAt     Timestamp           `json:"closedAt"`
		Outcome      string              `json:"outcome"`
		Summary      string              `json:"summary"`
	}
	CaseTerminalBranch3 *struct {
		ClosedAt              Timestamp     `json:"closedAt"`
		Outcome               string        `json:"outcome"`
		RollbackEvidenceSetID EvidenceSetId `json:"rollbackEvidenceSetId"`
		Summary               string        `json:"summary"`
	}
	CaseTerminalBranch4 *struct {
		ClosedAt    Timestamp         `json:"closedAt"`
		Outcome     string            `json:"outcome"`
		Summary     string            `json:"summary"`
		Uncertainty UncertaintyRecord `json:"uncertainty"`
	}
}

func ConvertCaseTerminalDomain(rootValue any, proof *protocolruntime.ValidationProofV1, expectedRootDefinition string, instancePointer string) (*CaseTerminalDomain, error) {
	extracted, match, err := protocolruntime.VerifyProofAndExtract(
		rootValue,
		proof,
		expectedRootDefinition,
		instancePointer,
		"#/$defs/CaseTerminal/oneOf",
		[]string{
			"#/$defs/CaseTerminal/oneOf/0",
			"#/$defs/CaseTerminal/oneOf/1",
			"#/$defs/CaseTerminal/oneOf/2",
			"#/$defs/CaseTerminal/oneOf/3",
			"#/$defs/CaseTerminal/oneOf/4",
		},
		CanonicalSchemaDigest,
	)
	if err != nil {
		return nil, err
	}
	domain := &CaseTerminalDomain{BranchIndex: match.BranchIndex, BranchIdentity: match.BranchIdentity}
	switch match.BranchIndex {
	case 0:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["outcome"] != "completed" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			ClosedAt      Timestamp     `json:"closedAt"`
			EvidenceSetID EvidenceSetId `json:"evidenceSetId"`
			Outcome       string        `json:"outcome"`
			Summary       string        `json:"summary"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.CaseTerminalBranch0 = &val
	case 1:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["outcome"] != "failed" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			ClosedAt Timestamp     `json:"closedAt"`
			Failure  FailureRecord `json:"failure"`
			Outcome  string        `json:"outcome"`
			Summary  string        `json:"summary"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.CaseTerminalBranch1 = &val
	case 2:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["outcome"] != "cancelled" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			Cancellation CancellationSummary `json:"cancellation"`
			ClosedAt     Timestamp           `json:"closedAt"`
			Outcome      string              `json:"outcome"`
			Summary      string              `json:"summary"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.CaseTerminalBranch2 = &val
	case 3:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["outcome"] != "rolled_back" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			ClosedAt              Timestamp     `json:"closedAt"`
			Outcome               string        `json:"outcome"`
			RollbackEvidenceSetID EvidenceSetId `json:"rollbackEvidenceSetId"`
			Summary               string        `json:"summary"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.CaseTerminalBranch3 = &val
	case 4:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["outcome"] != "unverified" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			ClosedAt    Timestamp         `json:"closedAt"`
			Outcome     string            `json:"outcome"`
			Summary     string            `json:"summary"`
			Uncertainty UncertaintyRecord `json:"uncertainty"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.CaseTerminalBranch4 = &val
	default:
		return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "validation proof branch index is invalid"}
	}
	return domain, nil
}

type EntityRefDomain struct {
	BranchIndex      int
	BranchIdentity   string
	EntityRefBranch0 *struct {
		CaseID CaseId `json:"caseId"`
		Kind   string `json:"kind"`
	}
	EntityRefBranch1 *struct {
		Kind   string `json:"kind"`
		TaskID TaskId `json:"taskId"`
	}
	EntityRefBranch2 *struct {
		AttemptID AttemptId `json:"attemptId"`
		Kind      string    `json:"kind"`
	}
}

func ConvertEntityRefDomain(rootValue any, proof *protocolruntime.ValidationProofV1, expectedRootDefinition string, instancePointer string) (*EntityRefDomain, error) {
	extracted, match, err := protocolruntime.VerifyProofAndExtract(
		rootValue,
		proof,
		expectedRootDefinition,
		instancePointer,
		"#/$defs/EntityRef/oneOf",
		[]string{
			"#/$defs/EntityRef/oneOf/0",
			"#/$defs/EntityRef/oneOf/1",
			"#/$defs/EntityRef/oneOf/2",
		},
		CanonicalSchemaDigest,
	)
	if err != nil {
		return nil, err
	}
	domain := &EntityRefDomain{BranchIndex: match.BranchIndex, BranchIdentity: match.BranchIdentity}
	switch match.BranchIndex {
	case 0:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "case" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			CaseID CaseId `json:"caseId"`
			Kind   string `json:"kind"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.EntityRefBranch0 = &val
	case 1:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "task" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			Kind   string `json:"kind"`
			TaskID TaskId `json:"taskId"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.EntityRefBranch1 = &val
	case 2:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "attempt" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			AttemptID AttemptId `json:"attemptId"`
			Kind      string    `json:"kind"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.EntityRefBranch2 = &val
	default:
		return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "validation proof branch index is invalid"}
	}
	return domain, nil
}

type EvidenceRefDomain struct {
	BranchIndex        int
	BranchIdentity     string
	EvidenceRefBranch0 *struct {
		Kind         string `json:"kind"`
		ResultDigest Sha256 `json:"resultDigest"`
		TaskID       TaskId `json:"taskId"`
	}
	EvidenceRefBranch1 *struct {
		ArtifactID ArtifactId `json:"artifactId"`
		Kind       string     `json:"kind"`
		SHA256     Sha256     `json:"sha256"`
	}
	EvidenceRefBranch2 *struct {
		Digest Sha256            `json:"digest"`
		Kind   string            `json:"kind"`
		Layer  VerificationLayer `json:"layer"`
	}
}

func ConvertEvidenceRefDomain(rootValue any, proof *protocolruntime.ValidationProofV1, expectedRootDefinition string, instancePointer string) (*EvidenceRefDomain, error) {
	extracted, match, err := protocolruntime.VerifyProofAndExtract(
		rootValue,
		proof,
		expectedRootDefinition,
		instancePointer,
		"#/$defs/EvidenceRef/oneOf",
		[]string{
			"#/$defs/EvidenceRef/oneOf/0",
			"#/$defs/EvidenceRef/oneOf/1",
			"#/$defs/EvidenceRef/oneOf/2",
		},
		CanonicalSchemaDigest,
	)
	if err != nil {
		return nil, err
	}
	domain := &EvidenceRefDomain{BranchIndex: match.BranchIndex, BranchIdentity: match.BranchIdentity}
	switch match.BranchIndex {
	case 0:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "task_result" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			Kind         string `json:"kind"`
			ResultDigest Sha256 `json:"resultDigest"`
			TaskID       TaskId `json:"taskId"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.EvidenceRefBranch0 = &val
	case 1:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "artifact" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			ArtifactID ArtifactId `json:"artifactId"`
			Kind       string     `json:"kind"`
			SHA256     Sha256     `json:"sha256"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.EvidenceRefBranch1 = &val
	case 2:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "observation" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			Digest Sha256            `json:"digest"`
			Kind   string            `json:"kind"`
			Layer  VerificationLayer `json:"layer"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.EvidenceRefBranch2 = &val
	default:
		return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "validation proof branch index is invalid"}
	}
	return domain, nil
}

type JsonValueDomain struct {
	BranchIndex      int
	BranchIdentity   string
	JsonValueBranch0 *any
	JsonValueBranch1 *bool
	JsonValueBranch2 *int64
	JsonValueBranch3 *string
	JsonValueBranch4 *[]JsonValue
	JsonValueBranch5 *map[string]JsonValue
}

func ConvertJsonValueDomain(rootValue any, proof *protocolruntime.ValidationProofV1, expectedRootDefinition string, instancePointer string) (*JsonValueDomain, error) {
	extracted, match, err := protocolruntime.VerifyProofAndExtract(
		rootValue,
		proof,
		expectedRootDefinition,
		instancePointer,
		"#/$defs/JsonValue/oneOf",
		[]string{
			"#/$defs/JsonValue/oneOf/0",
			"#/$defs/JsonValue/oneOf/1",
			"#/$defs/JsonValue/oneOf/2",
			"#/$defs/JsonValue/oneOf/3",
			"#/$defs/JsonValue/oneOf/4",
			"#/$defs/JsonValue/oneOf/5",
		},
		CanonicalSchemaDigest,
	)
	if err != nil {
		return nil, err
	}
	domain := &JsonValueDomain{BranchIndex: match.BranchIndex, BranchIdentity: match.BranchIdentity}
	switch match.BranchIndex {
	case 0:
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val any
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.JsonValueBranch0 = &val
	case 1:
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val bool
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.JsonValueBranch1 = &val
	case 2:
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val int64
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.JsonValueBranch2 = &val
	case 3:
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val string
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.JsonValueBranch3 = &val
	case 4:
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val []JsonValue
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.JsonValueBranch4 = &val
	case 5:
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val map[string]JsonValue
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.JsonValueBranch5 = &val
	default:
		return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "validation proof branch index is invalid"}
	}
	return domain, nil
}

type OperationResultDomain struct {
	BranchIndex            int
	BranchIdentity         string
	OperationResultBranch0 *struct {
		Kind         string    `json:"kind"`
		ResultDigest Sha256    `json:"resultDigest"`
		Value        JsonValue `json:"value"`
	}
	OperationResultBranch1 *struct {
		Artifacts    []ArtifactRef `json:"artifacts"`
		Kind         string        `json:"kind"`
		ResultDigest Sha256        `json:"resultDigest"`
	}
	OperationResultBranch2 *struct {
		Artifacts    []ArtifactRef `json:"artifacts"`
		Kind         string        `json:"kind"`
		ResultDigest Sha256        `json:"resultDigest"`
		Value        JsonValue     `json:"value"`
	}
	OperationResultBranch3 *struct {
		Kind         string `json:"kind"`
		ResultDigest Sha256 `json:"resultDigest"`
	}
}

func ConvertOperationResultDomain(rootValue any, proof *protocolruntime.ValidationProofV1, expectedRootDefinition string, instancePointer string) (*OperationResultDomain, error) {
	extracted, match, err := protocolruntime.VerifyProofAndExtract(
		rootValue,
		proof,
		expectedRootDefinition,
		instancePointer,
		"#/$defs/OperationResult/oneOf",
		[]string{
			"#/$defs/OperationResult/oneOf/0",
			"#/$defs/OperationResult/oneOf/1",
			"#/$defs/OperationResult/oneOf/2",
			"#/$defs/OperationResult/oneOf/3",
		},
		CanonicalSchemaDigest,
	)
	if err != nil {
		return nil, err
	}
	domain := &OperationResultDomain{BranchIndex: match.BranchIndex, BranchIdentity: match.BranchIdentity}
	switch match.BranchIndex {
	case 0:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "inline" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			Kind         string    `json:"kind"`
			ResultDigest Sha256    `json:"resultDigest"`
			Value        JsonValue `json:"value"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.OperationResultBranch0 = &val
	case 1:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "artifacts" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			Artifacts    []ArtifactRef `json:"artifacts"`
			Kind         string        `json:"kind"`
			ResultDigest Sha256        `json:"resultDigest"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.OperationResultBranch1 = &val
	case 2:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "mixed" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			Artifacts    []ArtifactRef `json:"artifacts"`
			Kind         string        `json:"kind"`
			ResultDigest Sha256        `json:"resultDigest"`
			Value        JsonValue     `json:"value"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.OperationResultBranch2 = &val
	case 3:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "none" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			Kind         string `json:"kind"`
			ResultDigest Sha256 `json:"resultDigest"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.OperationResultBranch3 = &val
	default:
		return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "validation proof branch index is invalid"}
	}
	return domain, nil
}

type TargetDomain struct {
	BranchIndex    int
	BranchIdentity string
	TargetBranch0  *struct {
		Kind        string      `json:"kind"`
		WorkspaceID WorkspaceId `json:"workspaceId"`
	}
	TargetBranch1 *struct {
		Kind        string      `json:"kind"`
		ProjectID   ProjectId   `json:"projectId"`
		WorkspaceID WorkspaceId `json:"workspaceId"`
	}
}

func ConvertTargetDomain(rootValue any, proof *protocolruntime.ValidationProofV1, expectedRootDefinition string, instancePointer string) (*TargetDomain, error) {
	extracted, match, err := protocolruntime.VerifyProofAndExtract(
		rootValue,
		proof,
		expectedRootDefinition,
		instancePointer,
		"#/$defs/Target/oneOf",
		[]string{
			"#/$defs/Target/oneOf/0",
			"#/$defs/Target/oneOf/1",
		},
		CanonicalSchemaDigest,
	)
	if err != nil {
		return nil, err
	}
	domain := &TargetDomain{BranchIndex: match.BranchIndex, BranchIdentity: match.BranchIdentity}
	switch match.BranchIndex {
	case 0:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "workspace" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			Kind        string      `json:"kind"`
			WorkspaceID WorkspaceId `json:"workspaceId"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.TargetBranch0 = &val
	case 1:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "project" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			Kind        string      `json:"kind"`
			ProjectID   ProjectId   `json:"projectId"`
			WorkspaceID WorkspaceId `json:"workspaceId"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.TargetBranch1 = &val
	default:
		return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "validation proof branch index is invalid"}
	}
	return domain, nil
}

type TaskStatusDomain struct {
	BranchIndex       int
	BranchIdentity    string
	TaskStatusBranch0 *struct {
		Kind    string      `json:"kind"`
		Waiting TaskWaiting `json:"waiting"`
	}
	TaskStatusBranch1 *struct {
		Kind    string    `json:"kind"`
		ReadyAt Timestamp `json:"readyAt"`
	}
	TaskStatusBranch2 *struct {
		AttemptID AttemptId `json:"attemptId"`
		Kind      string    `json:"kind"`
	}
	TaskStatusBranch3 *struct {
		AttemptID      *AttemptId     `json:"attemptId,omitempty"`
		CancellationID CancellationId `json:"cancellationId"`
		Kind           string         `json:"kind"`
		RequestedAt    Timestamp      `json:"requestedAt"`
	}
	TaskStatusBranch4 *struct {
		Kind     string       `json:"kind"`
		Terminal TaskTerminal `json:"terminal"`
	}
}

func ConvertTaskStatusDomain(rootValue any, proof *protocolruntime.ValidationProofV1, expectedRootDefinition string, instancePointer string) (*TaskStatusDomain, error) {
	extracted, match, err := protocolruntime.VerifyProofAndExtract(
		rootValue,
		proof,
		expectedRootDefinition,
		instancePointer,
		"#/$defs/TaskStatus/oneOf",
		[]string{
			"#/$defs/TaskStatus/oneOf/0",
			"#/$defs/TaskStatus/oneOf/1",
			"#/$defs/TaskStatus/oneOf/2",
			"#/$defs/TaskStatus/oneOf/3",
			"#/$defs/TaskStatus/oneOf/4",
		},
		CanonicalSchemaDigest,
	)
	if err != nil {
		return nil, err
	}
	domain := &TaskStatusDomain{BranchIndex: match.BranchIndex, BranchIdentity: match.BranchIdentity}
	switch match.BranchIndex {
	case 0:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "waiting" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			Kind    string      `json:"kind"`
			Waiting TaskWaiting `json:"waiting"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.TaskStatusBranch0 = &val
	case 1:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "ready" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			Kind    string    `json:"kind"`
			ReadyAt Timestamp `json:"readyAt"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.TaskStatusBranch1 = &val
	case 2:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "active" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			AttemptID AttemptId `json:"attemptId"`
			Kind      string    `json:"kind"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.TaskStatusBranch2 = &val
	case 3:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "cancelling" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			AttemptID      *AttemptId     `json:"attemptId,omitempty"`
			CancellationID CancellationId `json:"cancellationId"`
			Kind           string         `json:"kind"`
			RequestedAt    Timestamp      `json:"requestedAt"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.TaskStatusBranch3 = &val
	case 4:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "terminal" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			Kind     string       `json:"kind"`
			Terminal TaskTerminal `json:"terminal"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.TaskStatusBranch4 = &val
	default:
		return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "validation proof branch index is invalid"}
	}
	return domain, nil
}

type TaskTerminalDomain struct {
	BranchIndex         int
	BranchIdentity      string
	TaskTerminalBranch0 *struct {
		FinishedAt Timestamp       `json:"finishedAt"`
		Outcome    string          `json:"outcome"`
		Result     OperationResult `json:"result"`
	}
	TaskTerminalBranch1 *struct {
		Failure    OperationFailure `json:"failure"`
		FinishedAt Timestamp        `json:"finishedAt"`
		Outcome    string           `json:"outcome"`
	}
	TaskTerminalBranch2 *struct {
		Cancellation CancellationSummary `json:"cancellation"`
		FinishedAt   Timestamp           `json:"finishedAt"`
		Outcome      string              `json:"outcome"`
	}
	TaskTerminalBranch3 *struct {
		ApprovalDecisionID ApprovalDecisionId `json:"approvalDecisionId"`
		FinishedAt         Timestamp          `json:"finishedAt"`
		Outcome            string             `json:"outcome"`
	}
	TaskTerminalBranch4 *struct {
		FinishedAt  Timestamp         `json:"finishedAt"`
		Outcome     string            `json:"outcome"`
		Uncertainty UncertaintyRecord `json:"uncertainty"`
	}
}

func ConvertTaskTerminalDomain(rootValue any, proof *protocolruntime.ValidationProofV1, expectedRootDefinition string, instancePointer string) (*TaskTerminalDomain, error) {
	extracted, match, err := protocolruntime.VerifyProofAndExtract(
		rootValue,
		proof,
		expectedRootDefinition,
		instancePointer,
		"#/$defs/TaskTerminal/oneOf",
		[]string{
			"#/$defs/TaskTerminal/oneOf/0",
			"#/$defs/TaskTerminal/oneOf/1",
			"#/$defs/TaskTerminal/oneOf/2",
			"#/$defs/TaskTerminal/oneOf/3",
			"#/$defs/TaskTerminal/oneOf/4",
		},
		CanonicalSchemaDigest,
	)
	if err != nil {
		return nil, err
	}
	domain := &TaskTerminalDomain{BranchIndex: match.BranchIndex, BranchIdentity: match.BranchIdentity}
	switch match.BranchIndex {
	case 0:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["outcome"] != "succeeded" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			FinishedAt Timestamp       `json:"finishedAt"`
			Outcome    string          `json:"outcome"`
			Result     OperationResult `json:"result"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.TaskTerminalBranch0 = &val
	case 1:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["outcome"] != "failed" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			Failure    OperationFailure `json:"failure"`
			FinishedAt Timestamp        `json:"finishedAt"`
			Outcome    string           `json:"outcome"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.TaskTerminalBranch1 = &val
	case 2:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["outcome"] != "cancelled" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			Cancellation CancellationSummary `json:"cancellation"`
			FinishedAt   Timestamp           `json:"finishedAt"`
			Outcome      string              `json:"outcome"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.TaskTerminalBranch2 = &val
	case 3:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["outcome"] != "denied" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			ApprovalDecisionID ApprovalDecisionId `json:"approvalDecisionId"`
			FinishedAt         Timestamp          `json:"finishedAt"`
			Outcome            string             `json:"outcome"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.TaskTerminalBranch3 = &val
	case 4:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["outcome"] != "unverified" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			FinishedAt  Timestamp         `json:"finishedAt"`
			Outcome     string            `json:"outcome"`
			Uncertainty UncertaintyRecord `json:"uncertainty"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.TaskTerminalBranch4 = &val
	default:
		return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "validation proof branch index is invalid"}
	}
	return domain, nil
}

type TaskWaitingDomain struct {
	BranchIndex        int
	BranchIdentity     string
	TaskWaitingBranch0 *struct {
		ApprovalRequestID ApprovalRequestId `json:"approvalRequestId"`
		Reason            string            `json:"reason"`
	}
	TaskWaitingBranch1 *struct {
		InputRequestID InputRequestId `json:"inputRequestId"`
		Reason         string         `json:"reason"`
	}
	TaskWaitingBranch2 *struct {
		Reason          string          `json:"reason"`
		RetryDecisionID RetryDecisionId `json:"retryDecisionId"`
	}
}

func ConvertTaskWaitingDomain(rootValue any, proof *protocolruntime.ValidationProofV1, expectedRootDefinition string, instancePointer string) (*TaskWaitingDomain, error) {
	extracted, match, err := protocolruntime.VerifyProofAndExtract(
		rootValue,
		proof,
		expectedRootDefinition,
		instancePointer,
		"#/$defs/TaskWaiting/oneOf",
		[]string{
			"#/$defs/TaskWaiting/oneOf/0",
			"#/$defs/TaskWaiting/oneOf/1",
			"#/$defs/TaskWaiting/oneOf/2",
		},
		CanonicalSchemaDigest,
	)
	if err != nil {
		return nil, err
	}
	domain := &TaskWaitingDomain{BranchIndex: match.BranchIndex, BranchIdentity: match.BranchIdentity}
	switch match.BranchIndex {
	case 0:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["reason"] != "approval" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			ApprovalRequestID ApprovalRequestId `json:"approvalRequestId"`
			Reason            string            `json:"reason"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.TaskWaitingBranch0 = &val
	case 1:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["reason"] != "input" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			InputRequestID InputRequestId `json:"inputRequestId"`
			Reason         string         `json:"reason"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.TaskWaitingBranch1 = &val
	case 2:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["reason"] != "retry_decision" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val struct {
			Reason          string          `json:"reason"`
			RetryDecisionID RetryDecisionId `json:"retryDecisionId"`
		}
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.TaskWaitingBranch2 = &val
	default:
		return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "validation proof branch index is invalid"}
	}
	return domain, nil
}

type TypedErrorDetailsDomain struct {
	BranchIndex              int
	BranchIdentity           string
	TypedErrorDetailsBranch0 *RevisionConflictDetails
	TypedErrorDetailsBranch1 *SchemaMismatchDetails
	TypedErrorDetailsBranch2 *MissingEffectDetails
}

func ConvertTypedErrorDetailsDomain(rootValue any, proof *protocolruntime.ValidationProofV1, expectedRootDefinition string, instancePointer string) (*TypedErrorDetailsDomain, error) {
	extracted, match, err := protocolruntime.VerifyProofAndExtract(
		rootValue,
		proof,
		expectedRootDefinition,
		instancePointer,
		"#/$defs/TypedErrorDetails/oneOf",
		[]string{
			"#/$defs/TypedErrorDetails/oneOf/0",
			"#/$defs/TypedErrorDetails/oneOf/1",
			"#/$defs/TypedErrorDetails/oneOf/2",
		},
		CanonicalSchemaDigest,
	)
	if err != nil {
		return nil, err
	}
	domain := &TypedErrorDetailsDomain{BranchIndex: match.BranchIndex, BranchIdentity: match.BranchIdentity}
	switch match.BranchIndex {
	case 0:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "revision_conflict" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val RevisionConflictDetails
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.TypedErrorDetailsBranch0 = &val
	case 1:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "schema_mismatch" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val SchemaMismatchDetails
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.TypedErrorDetailsBranch1 = &val
	case 2:
		objMap, ok := extracted.(map[string]any)
		if !ok || objMap["kind"] != "missing_effect" {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "union const discriminator does not match the proved branch"}
		}
		rawBytes, err := json.Marshal(extracted)
		if err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be encoded for domain conversion"}
		}
		var val MissingEffectDetails
		if err := json.Unmarshal(rawBytes, &val); err != nil {
			return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "proved union value cannot be decoded into its domain branch"}
		}
		domain.TypedErrorDetailsBranch2 = &val
	default:
		return nil, &protocolruntime.IngressError{Code: "UNION_DISCRIMINATOR_MISMATCH", Reason: protocolruntime.ReasonUnionDiscriminator, Message: "validation proof branch index is invalid"}
	}
	return domain, nil
}
