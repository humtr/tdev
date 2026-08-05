package state

import (
	"fmt"
	"sort"
	"strings"
)

type CaseStateKey string
type TaskStateKey string
type AttemptStateKey string

var CaseStates = []CaseStateKey{
	"active", "paused", "cancelling", "terminal:completed", "terminal:failed",
	"terminal:cancelled", "terminal:rolled_back", "terminal:unverified",
}

var TaskStates = []TaskStateKey{
	"waiting:approval", "waiting:input", "waiting:retry_decision", "ready", "active",
	"cancelling", "terminal:succeeded", "terminal:failed", "terminal:cancelled",
	"terminal:denied", "terminal:unverified",
}

var AttemptStates = []AttemptStateKey{
	"dispatch_pending", "queued", "running", "reconciling", "cancel_requested",
	"terminal:succeeded", "terminal:failed", "terminal:cancelled", "terminal:interrupted",
	"terminal:rejected", "terminal:input_required", "terminal:unverified",
}

var caseTransitions = transitionSet([][2]string{
	{"active", "paused"}, {"paused", "active"}, {"active", "cancelling"}, {"paused", "cancelling"},
	{"active", "terminal:completed"}, {"active", "terminal:failed"}, {"active", "terminal:rolled_back"}, {"active", "terminal:unverified"},
	{"paused", "terminal:completed"}, {"paused", "terminal:failed"}, {"paused", "terminal:rolled_back"}, {"paused", "terminal:unverified"},
	{"cancelling", "terminal:cancelled"}, {"cancelling", "terminal:failed"}, {"cancelling", "terminal:unverified"}, {"cancelling", "terminal:rolled_back"},
})

var taskTransitions = transitionSet([][2]string{
	{"waiting:approval", "ready"}, {"waiting:approval", "active"}, {"waiting:approval", "terminal:cancelled"}, {"waiting:approval", "terminal:denied"},
	{"waiting:input", "ready"}, {"waiting:input", "active"}, {"waiting:input", "terminal:cancelled"}, {"waiting:input", "terminal:failed"},
	{"waiting:retry_decision", "ready"}, {"waiting:retry_decision", "active"}, {"waiting:retry_decision", "terminal:cancelled"}, {"waiting:retry_decision", "terminal:unverified"},
	{"ready", "active"}, {"ready", "cancelling"}, {"ready", "terminal:cancelled"},
	{"active", "waiting:approval"}, {"active", "waiting:input"}, {"active", "waiting:retry_decision"}, {"active", "cancelling"},
	{"active", "terminal:succeeded"}, {"active", "terminal:failed"}, {"active", "terminal:cancelled"}, {"active", "terminal:denied"}, {"active", "terminal:unverified"},
	{"cancelling", "terminal:succeeded"}, {"cancelling", "terminal:cancelled"}, {"cancelling", "terminal:failed"}, {"cancelling", "terminal:unverified"},
})

var attemptTransitions = func() map[string]bool {
	pairs := [][2]string{
		{"dispatch_pending", "queued"}, {"dispatch_pending", "reconciling"}, {"dispatch_pending", "cancel_requested"},
		{"queued", "running"}, {"queued", "reconciling"}, {"queued", "cancel_requested"},
		{"running", "reconciling"}, {"running", "cancel_requested"},
		{"reconciling", "queued"}, {"reconciling", "running"}, {"reconciling", "cancel_requested"},
	}
	outcomes := []string{"succeeded", "failed", "cancelled", "interrupted", "rejected", "input_required", "unverified"}
	for _, from := range []string{"dispatch_pending", "queued", "running", "reconciling", "cancel_requested"} {
		for _, outcome := range outcomes {
			pairs = append(pairs, [2]string{from, "terminal:" + outcome})
		}
	}
	return transitionSet(pairs)
}()

func transitionSet(pairs [][2]string) map[string]bool {
	result := make(map[string]bool, len(pairs))
	for _, pair := range pairs {
		result[pair[0]+">"+pair[1]] = true
	}
	return result
}

func CanCaseTransition(from, to CaseStateKey) bool {
	return caseTransitions[string(from)+">"+string(to)]
}

func CanTaskTransition(from, to TaskStateKey) bool {
	return taskTransitions[string(from)+">"+string(to)]
}

func CanAttemptTransition(from, to AttemptStateKey) bool {
	return attemptTransitions[string(from)+">"+string(to)]
}

func AssertCaseTransition(from, to CaseStateKey) error {
	if !CanCaseTransition(from, to) {
		return fmt.Errorf("case transition rejected: %s -> %s", from, to)
	}
	return nil
}

func AssertTaskTransition(from, to TaskStateKey) error {
	if !CanTaskTransition(from, to) {
		return fmt.Errorf("task transition rejected: %s -> %s", from, to)
	}
	return nil
}

func AssertAttemptTransition(from, to AttemptStateKey) error {
	if !CanAttemptTransition(from, to) {
		return fmt.Errorf("attempt transition rejected: %s -> %s", from, to)
	}
	return nil
}

func AssertOneNonterminalAttempt(states []AttemptStateKey) error {
	count := 0
	for _, current := range states {
		if !strings.HasPrefix(string(current), "terminal:") {
			count++
		}
	}
	if count > 1 {
		return fmt.Errorf("task has %d nonterminal Attempts", count)
	}
	return nil
}

type DedupeDecision string

const (
	DedupeNew       DedupeDecision = "new"
	DedupeDuplicate DedupeDecision = "duplicate"
	DedupeConflict  DedupeDecision = "conflict"
)

type DedupeKey struct {
	RequestID      string
	SemanticDigest string
}

func DecideRequestDedupe(existing *DedupeKey, incoming DedupeKey) DedupeDecision {
	if existing == nil || existing.RequestID != incoming.RequestID {
		return DedupeNew
	}
	if existing.SemanticDigest == incoming.SemanticDigest {
		return DedupeDuplicate
	}
	return DedupeConflict
}

type CompletionMapping struct {
	CriterionID    string
	RequirementIDs []string
	EvidenceCount  int
}

func CompletionEvidenceErrors(mandatoryCriterionIDs []string, requiredRequirementIDs map[string][]string, mappings []CompletionMapping) []string {
	byCriterion := make(map[string]CompletionMapping, len(mappings))
	var errors []string
	for _, mapping := range mappings {
		if _, exists := byCriterion[mapping.CriterionID]; exists {
			errors = append(errors, "duplicate criterion mapping: "+mapping.CriterionID)
			continue
		}
		byCriterion[mapping.CriterionID] = mapping
	}
	for _, criterionID := range mandatoryCriterionIDs {
		mapping, ok := byCriterion[criterionID]
		if !ok {
			errors = append(errors, "missing criterion evidence: "+criterionID)
			continue
		}
		if mapping.EvidenceCount < 1 {
			errors = append(errors, "empty criterion evidence: "+criterionID)
		}
		actual := make(map[string]bool, len(mapping.RequirementIDs))
		for _, requirementID := range mapping.RequirementIDs {
			actual[requirementID] = true
		}
		for _, requirementID := range requiredRequirementIDs[criterionID] {
			if !actual[requirementID] {
				errors = append(errors, "missing requirement evidence: "+criterionID+"/"+requirementID)
			}
		}
	}
	sort.Strings(errors)
	return errors
}
