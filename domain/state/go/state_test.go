package state

import "testing"

func TestStateMatricesAndInvariants(t *testing.T) {
	allowedCase := setOf(
		"active>paused", "paused>active", "active>cancelling", "paused>cancelling",
		"active>terminal:completed", "active>terminal:failed", "active>terminal:rolled_back", "active>terminal:unverified",
		"paused>terminal:completed", "paused>terminal:failed", "paused>terminal:rolled_back", "paused>terminal:unverified",
		"cancelling>terminal:cancelled", "cancelling>terminal:failed", "cancelling>terminal:unverified", "cancelling>terminal:rolled_back",
	)
	allowedTask := setOf(
		"waiting:approval>ready", "waiting:approval>terminal:denied",
		"waiting:input>ready", "waiting:input>terminal:cancelled", "waiting:input>terminal:failed",
		"waiting:retry_decision>ready", "waiting:retry_decision>terminal:cancelled", "waiting:retry_decision>terminal:unverified",
		"ready>active", "ready>cancelling", "ready>terminal:cancelled",
		"active>waiting:input", "active>waiting:retry_decision", "active>cancelling",
		"active>terminal:succeeded", "active>terminal:failed", "active>terminal:cancelled", "active>terminal:denied", "active>terminal:unverified",
		"cancelling>terminal:succeeded", "cancelling>terminal:cancelled", "cancelling>terminal:failed", "cancelling>terminal:unverified",
	)
	allowedAttempt := setOf(
		"dispatch_pending>queued", "dispatch_pending>reconciling", "dispatch_pending>cancel_requested",
		"queued>running", "queued>reconciling", "queued>cancel_requested",
		"running>reconciling", "running>cancel_requested",
		"reconciling>queued", "reconciling>running", "reconciling>cancel_requested",
	)
	for _, from := range []string{"dispatch_pending", "queued", "running", "reconciling", "cancel_requested"} {
		for _, outcome := range []string{"succeeded", "failed", "cancelled", "interrupted", "rejected", "input_required", "unverified"} {
			allowedAttempt[from+">terminal:"+outcome] = true
		}
	}

	t.Run("case matrix", func(t *testing.T) {
		for _, from := range CaseStates {
			for _, to := range CaseStates {
				key := string(from) + ">" + string(to)
				want := allowedCase[key]
				if got := CanCaseTransition(from, to); got != want {
					t.Fatalf("%s got=%v want=%v", key, got, want)
				}
				if err := AssertCaseTransition(from, to); (err == nil) != want {
					t.Fatalf("%s error=%v wantAllowed=%v", key, err, want)
				}
			}
		}
	})
	t.Run("task matrix", func(t *testing.T) {
		for _, from := range TaskStates {
			for _, to := range TaskStates {
				key := string(from) + ">" + string(to)
				want := allowedTask[key]
				if got := CanTaskTransition(from, to); got != want {
					t.Fatalf("%s got=%v want=%v", key, got, want)
				}
				if err := AssertTaskTransition(from, to); (err == nil) != want {
					t.Fatalf("%s error=%v wantAllowed=%v", key, err, want)
				}
			}
		}
	})
	t.Run("attempt matrix", func(t *testing.T) {
		for _, from := range AttemptStates {
			for _, to := range AttemptStates {
				key := string(from) + ">" + string(to)
				want := allowedAttempt[key]
				if got := CanAttemptTransition(from, to); got != want {
					t.Fatalf("%s got=%v want=%v", key, got, want)
				}
				if err := AssertAttemptTransition(from, to); (err == nil) != want {
					t.Fatalf("%s error=%v wantAllowed=%v", key, err, want)
				}
			}
		}
	})
	t.Run("one nonterminal Attempt", func(t *testing.T) {
		if err := AssertOneNonterminalAttempt([]AttemptStateKey{"queued", "terminal:failed"}); err != nil {
			t.Fatal(err)
		}
		if err := AssertOneNonterminalAttempt([]AttemptStateKey{"terminal:succeeded", "terminal:failed"}); err != nil {
			t.Fatal(err)
		}
		if err := AssertOneNonterminalAttempt([]AttemptStateKey{"queued", "reconciling"}); err == nil {
			t.Fatal("expected invariant failure")
		}
	})
	t.Run("request dedupe", func(t *testing.T) {
		incoming := DedupeKey{RequestID: "request_abcdefgh", SemanticDigest: repeat("a", 64)}
		if DecideRequestDedupe(nil, incoming) != DedupeNew {
			t.Fatal("nil record must be new")
		}
		if DecideRequestDedupe(&incoming, incoming) != DedupeDuplicate {
			t.Fatal("same request and digest must be duplicate")
		}
		conflict := DedupeKey{RequestID: incoming.RequestID, SemanticDigest: repeat("b", 64)}
		if DecideRequestDedupe(&conflict, incoming) != DedupeConflict {
			t.Fatal("same request with another digest must conflict")
		}
	})
	t.Run("completion evidence", func(t *testing.T) {
		required := map[string][]string{"build": {"source", "validation"}, "publish": {"remote"}}
		complete := []CompletionMapping{{CriterionID: "build", RequirementIDs: []string{"source", "validation"}, EvidenceCount: 2}, {CriterionID: "publish", RequirementIDs: []string{"remote"}, EvidenceCount: 1}}
		if errors := CompletionEvidenceErrors([]string{"build", "publish"}, required, complete); len(errors) != 0 {
			t.Fatalf("unexpected errors: %v", errors)
		}
		incomplete := []CompletionMapping{{CriterionID: "build", RequirementIDs: []string{"source"}, EvidenceCount: 0}}
		errors := CompletionEvidenceErrors([]string{"build", "publish"}, required, incomplete)
		if len(errors) != 3 {
			t.Fatalf("errors=%v", errors)
		}
	})
}

func setOf(values ...string) map[string]bool {
	result := make(map[string]bool, len(values))
	for _, value := range values {
		result[value] = true
	}
	return result
}

func repeat(value string, count int) string {
	result := ""
	for range count {
		result += value
	}
	return result
}
