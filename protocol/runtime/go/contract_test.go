package protocolruntime

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

type fixtureSet struct {
	SchemaCases []struct {
		Name       string          `json:"name"`
		Definition string          `json:"definition"`
		Valid      bool            `json:"valid"`
		Value      json.RawMessage `json:"value"`
	} `json:"schemaCases"`
	CanonicalCases []struct {
		Name      string          `json:"name"`
		Domain    string          `json:"domain"`
		Value     json.RawMessage `json:"value"`
		Canonical string          `json:"canonical"`
		SHA256    string          `json:"sha256"`
	} `json:"canonicalCases"`
	CanonicalRejectCases []struct {
		Name  string          `json:"name"`
		Value json.RawMessage `json:"value"`
	} `json:"canonicalRejectCases"`
	RawIngressCases []struct {
		Name        string `json:"name"`
		Raw         string `json:"raw"`
		Valid       bool   `json:"valid"`
		ErrorCode   string `json:"errorCode"`
		ErrorReason string `json:"errorReason"`
	} `json:"rawIngressCases"`
	ProofVectorCases []struct {
		Name                    string          `json:"name"`
		Definition              string          `json:"definition"`
		Value                   json.RawMessage `json:"value"`
		InstancePointer         string          `json:"instancePointer"`
		ExpectedSchemaPointer   string          `json:"expectedSchemaPointer"`
		ExpectedBranchIndex     int             `json:"expectedBranchIndex"`
		ExpectedBranchIdentity  string          `json:"expectedBranchIdentity"`
		ExpectedSchemaDigest    string          `json:"expectedSchemaDigest"`
		ExpectedCanonicalDigest string          `json:"expectedCanonicalDigest"`
	} `json:"proofVectorCases"`
}

func loadContractFixtures(t *testing.T) (*Validator, fixtureSet) {
	t.Helper()
	schemaRaw, err := os.ReadFile(filepath.Join("..", "..", "schemas", "tdev.v1.schema.json"))
	if err != nil {
		t.Fatal(err)
	}
	validator, err := ParseSchema(schemaRaw)
	if err != nil {
		t.Fatal(err)
	}
	fixtureRaw, err := os.ReadFile(filepath.Join("..", "..", "testdata", "fixtures.json"))
	if err != nil {
		t.Fatal(err)
	}
	var fixtures fixtureSet
	if err := json.Unmarshal(fixtureRaw, &fixtures); err != nil {
		t.Fatal(err)
	}
	return validator, fixtures
}

func TestRawJSONAdmissionRejectsMalformedInput(t *testing.T) {
	t.Run("trailing value", func(t *testing.T) {
		if _, err := ParseJSON([]byte(`{} {}`)); err == nil {
			t.Fatal("expected trailing JSON to be rejected")
		}
	})
	t.Run("invalid UTF-8 value", func(t *testing.T) {
		if _, err := ParseJSON([]byte{'{', '"', 'x', '"', ':', '"', 0xff, '"', '}'}); err == nil {
			t.Fatal("expected invalid UTF-8 protocol JSON to be rejected")
		}
	})
	t.Run("invalid UTF-8 schema", func(t *testing.T) {
		if _, err := ParseSchema([]byte{'{', '"', '$', 'd', 'e', 'f', 's', '"', ':', '{', '"', 0xff, '"', ':', '{', '}', '}', '}'}); err == nil {
			t.Fatal("expected invalid UTF-8 schema JSON to be rejected")
		}
	})
}

func TestSchemaSubsetFailsClosedAndSafeNumberProfile(t *testing.T) {
	invalidSchemas := map[string]string{
		"unsupported keyword": `{"$defs":{"Probe":{"type":"string","unsupportedKeyword":true}}}`,
		"ref sibling":         `{"$defs":{"Probe":{"$ref":"#/$defs/Target","type":"string"},"Target":{"type":"string"}}}`,
		"oneOf sibling":       `{"$defs":{"Probe":{"oneOf":[{"type":"string"}],"type":"string"}}}`,
		"root keyword":        `{"$defs":{"Probe":{"type":"string"}},"allOf":[{"$ref":"#/$defs/Probe"}]}`,
		"malformed required":  `{"$defs":{"Probe":{"type":"object","properties":{},"required":"x","additionalProperties":false}}}`,
		"malformed minimum":   `{"$defs":{"Probe":{"type":"integer","minimum":"1"}}}`,
		"malformed enum":      `{"$defs":{"Probe":{"enum":"x"}}}`,
		"misplaced pattern":   `{"$defs":{"Probe":{"type":"integer","pattern":"x"}}}`,
		"misplaced format":    `{"$defs":{"Probe":{"type":"integer","format":"date-time"}}}`,
		"unsupported format":  `{"$defs":{"Probe":{"type":"string","format":"email"}}}`,
		"self alias cycle":    `{"$defs":{"Probe":{"$ref":"#/$defs/Probe"}}}`,
		"mutual alias cycle":  `{"$defs":{"A":{"$ref":"#/$defs/B"},"B":{"$ref":"#/$defs/A"}}}`,
		"oneOf self cycle":    `{"$defs":{"Probe":{"oneOf":[{"type":"string"},{"$ref":"#/$defs/Probe"}]}}}`,
		"trailing schema":     `{"$defs":{"Probe":{"type":"string"}}} {}`,
	}
	for name, raw := range invalidSchemas {
		t.Run(name, func(t *testing.T) {
			if _, err := ParseSchema([]byte(raw)); err == nil {
				t.Fatal("expected invalid schema to be rejected")
			}
		})
	}

	validator, err := ParseSchema([]byte(`{"$defs":{"NumberProbe":{"type":"number","minimum":1,"maximum":3}}}`))
	if err != nil {
		t.Fatal(err)
	}
	for raw, valid := range map[string]bool{"2": true, "0": false, "4": false, "1.5": false} {
		value, err := ParseJSON([]byte(raw))
		if err != nil {
			t.Fatal(err)
		}
		if got := len(validator.ValidateDefinition("NumberProbe", value)) == 0; got != valid {
			t.Fatalf("value %s valid=%v want=%v", raw, got, valid)
		}
	}
}

func TestContractFixturesAndCanonicalVectors(t *testing.T) {
	validator, fixtures := loadContractFixtures(t)
	semantic := map[string]bool{"NewCaseContractInput": true, "CaseContract": true, "NewCaseTargetGrant": true, "CaseTargetGrant": true}
	for _, fixture := range fixtures.SchemaCases {
		t.Run("schema/"+fixture.Name, func(t *testing.T) {
			value, err := ParseJSON(fixture.Value)
			if err != nil {
				t.Fatal(err)
			}
			var errors []string
			if semantic[fixture.Definition] {
				errors = ValidateContract(validator, fixture.Definition, value)
			} else {
				errors = validator.ValidateDefinition(fixture.Definition, value)
			}
			if got := len(errors) == 0; got != fixture.Valid {
				t.Fatalf("valid=%v errors=%v", got, errors)
			}
		})
	}
	for _, fixture := range fixtures.CanonicalCases {
		t.Run("canonical/"+fixture.Name, func(t *testing.T) {
			value, err := ParseJSON(fixture.Value)
			if err != nil {
				t.Fatal(err)
			}
			canonical, err := Canonicalize(value)
			if err != nil {
				t.Fatal(err)
			}
			if string(canonical) != fixture.Canonical {
				t.Fatalf("canonical=%s want=%s", canonical, fixture.Canonical)
			}
			digest, err := TypedDigest(fixture.Domain, value)
			if err != nil {
				t.Fatal(err)
			}
			if digest != fixture.SHA256 {
				t.Fatalf("digest=%s want=%s", digest, fixture.SHA256)
			}
		})
	}
	for _, fixture := range fixtures.CanonicalRejectCases {
		t.Run("reject/"+fixture.Name, func(t *testing.T) {
			value, err := ParseJSON(fixture.Value)
			if err != nil {
				return
			}
			if _, err := Canonicalize(value); err == nil {
				t.Fatal("expected parsing or canonicalization failure")
			}
		})
	}
}

func TestRawIngressValidationAndErrorCodes(t *testing.T) {
	_, fixtures := loadContractFixtures(t)
	for _, fixture := range fixtures.RawIngressCases {
		t.Run("fixture/"+fixture.Name, func(t *testing.T) {
			_, err := ParseRawIngress([]byte(fixture.Raw))
			if fixture.Valid {
				if err != nil {
					t.Fatalf("expected valid ingress, got %v", err)
				}
				return
			}
			if err == nil {
				t.Fatalf("expected %s/%s", fixture.ErrorCode, fixture.ErrorReason)
			}
			ingressErr, ok := err.(*IngressError)
			if !ok || ingressErr.Code != fixture.ErrorCode || string(ingressErr.Reason) != fixture.ErrorReason {
				t.Fatalf("expected %s/%s, got %v", fixture.ErrorCode, fixture.ErrorReason, err)
			}
		})
	}

	t.Run("invalid utf8", func(t *testing.T) {
		raw := []byte{'{', '"', 'x', '"', ':', '"', 0xff, '"', '}'}
		_, err := ParseRawIngress(raw)
		ingressErr, ok := err.(*IngressError)
		if !ok || ingressErr.Code != "INVALID_UTF8" || ingressErr.Reason != ReasonUTF8 {
			t.Fatalf("expected INVALID_UTF8/UTF8, got %v", err)
		}
	})

	t.Run("payload too large", func(t *testing.T) {
		raw := make([]byte, DefaultM1ReleaseProfile().Ingress.MaxBodyBytes+1)
		_, err := ParseRawIngress(raw)
		ingressErr, ok := err.(*IngressError)
		if !ok || ingressErr.Code != "PAYLOAD_TOO_LARGE" || ingressErr.Reason != ReasonBodyBytes {
			t.Fatalf("expected PAYLOAD_TOO_LARGE/BODY_BYTES, got %v", err)
		}
	})
}

func TestM1ReleaseProfileValidation(t *testing.T) {
	profile := DefaultM1ReleaseProfile()
	if err := ValidateReleaseProfile(profile); err != nil {
		t.Fatalf("default profile invalid: %v", err)
	}
	if profile.Output.MaxArtifactChunkBytes != 262144 {
		t.Fatalf("unexpected artifact chunk bound %d", profile.Output.MaxArtifactChunkBytes)
	}
	if profile.Pagination.CursorTTLSeconds != 3600 {
		t.Fatalf("unexpected cursor TTL %d", profile.Pagination.CursorTTLSeconds)
	}
	if len(M1ReleaseProfileDigest) != 64 {
		t.Fatalf("unexpected profile digest %q", M1ReleaseProfileDigest)
	}
	tooLarge := profile
	tooLarge.Pagination.MaxPageSize = HardMaxPageSize + 1
	if err := ValidateReleaseProfile(tooLarge); err == nil {
		t.Fatal("expected oversized page policy to fail")
	}
	badRetention := profile
	badRetention.Retention.EventCompaction = "enabled"
	if err := ValidateReleaseProfile(badRetention); err == nil {
		t.Fatal("expected unsupported retention policy to fail")
	}
}

func TestTypedSchemaErrorDetails(t *testing.T) {
	validator, _ := loadContractFixtures(t)
	_, details := validator.ValidateDefinitionWithProofDetails("ControlCaseInput", map[string]any{
		"caseId":               "case_demo",
		"expectedCaseRevision": int64(0),
		"requestId":            "req_demo",
		"action":               map[string]any{"kind": "unknown"},
	})
	foundNoMatch := false
	for _, detail := range details {
		if detail.Code == "ONE_OF_NO_MATCH" && detail.Reason == ReasonOneOfNoMatch {
			foundNoMatch = true
		}
	}
	if !foundNoMatch {
		t.Fatalf("missing typed oneOf no-match detail: %#v", details)
	}
}

func TestValidationProofAndBranchMatching(t *testing.T) {
	validator, fixtures := loadContractFixtures(t)
	for _, fixture := range fixtures.ProofVectorCases {
		t.Run("fixture/"+fixture.Name, func(t *testing.T) {
			value, err := ParseJSON(fixture.Value)
			if err != nil {
				t.Fatal(err)
			}
			proof, errs := validator.ValidateDefinitionWithProof(fixture.Definition, value)
			if len(errs) > 0 {
				t.Fatalf("expected no errors, got %v", errs)
			}
			if proof == nil {
				t.Fatal("expected non-nil proof")
			}
			if proof.RootDefinition != fixture.Definition {
				t.Fatalf("rootDefinition=%s want=%s", proof.RootDefinition, fixture.Definition)
			}
			if proof.SchemaDigest != fixture.ExpectedSchemaDigest {
				t.Fatalf("schemaDigest=%s want=%s", proof.SchemaDigest, fixture.ExpectedSchemaDigest)
			}
			if proof.CanonicalDigest != fixture.ExpectedCanonicalDigest {
				t.Fatalf("canonicalDigest=%s want=%s", proof.CanonicalDigest, fixture.ExpectedCanonicalDigest)
			}
			var match *UnionProofBranchV1
			for i := range proof.Unions {
				if proof.Unions[i].InstancePointer == fixture.InstancePointer {
					match = &proof.Unions[i]
					break
				}
			}
			if match == nil {
				t.Fatalf("missing union match at %s", fixture.InstancePointer)
			}
			if match.SchemaPointer != fixture.ExpectedSchemaPointer {
				t.Fatalf("schemaPointer=%s want=%s", match.SchemaPointer, fixture.ExpectedSchemaPointer)
			}
			if match.BranchIndex != fixture.ExpectedBranchIndex {
				t.Fatalf("branchIndex=%d want=%d", match.BranchIndex, fixture.ExpectedBranchIndex)
			}
			if match.BranchIdentity != fixture.ExpectedBranchIdentity {
				t.Fatalf("branchIdentity=%s want=%s", match.BranchIdentity, fixture.ExpectedBranchIdentity)
			}
		})
	}

	validInput := map[string]any{
		"requestId":            "request_abcdefgh1234",
		"caseId":               "case_abcdefgh1234",
		"expectedCaseRevision": int64(1),
		"action": map[string]any{
			"kind":   "pause",
			"reason": "manual",
		},
	}

	proof, errs := validator.ValidateDefinitionWithProof("ControlCaseInput", validInput)
	if len(errs) > 0 {
		t.Fatalf("expected no errors, got %v", errs)
	}
	if proof == nil {
		t.Fatal("expected non-nil proof")
	}
	if proof.RootDefinition != "ControlCaseInput" {
		t.Fatalf("expected RootDefinition ControlCaseInput, got %s", proof.RootDefinition)
	}
	if len(proof.SchemaDigest) != 64 || len(proof.CanonicalDigest) != 64 {
		t.Fatalf("expected 64-char digests, got schema=%s canonical=%s", proof.SchemaDigest, proof.CanonicalDigest)
	}
	if len(proof.Unions) == 0 {
		t.Fatal("expected union proof branches")
	}

	// Test zero match
	zeroInput := map[string]any{
		"requestId":            "request_abcdefgh1234",
		"caseId":               "case_abcdefgh1234",
		"expectedCaseRevision": int64(1),
		"action": map[string]any{
			"kind": "unknown_kind",
		},
	}
	zeroProof, zeroErrs := validator.ValidateDefinitionWithProof("ControlCaseInput", zeroInput)
	if zeroProof != nil {
		t.Fatal("expected nil proof for zero match")
	}
	hasZeroMatchErr := false
	for _, e := range zeroErrs {
		if len(e) > 0 && (containsStr(e, "ONE_OF_NO_MATCH")) {
			hasZeroMatchErr = true
			break
		}
	}
	if !hasZeroMatchErr {
		t.Fatalf("expected ONE_OF_NO_MATCH error, got %v", zeroErrs)
	}
}

func TestProofBindingAndTamperingRejection(t *testing.T) {
	validator, _ := loadContractFixtures(t)
	validInput := map[string]any{
		"requestId":            "request_abcdefgh1234",
		"caseId":               "case_abcdefgh1234",
		"expectedCaseRevision": int64(1),
		"action": map[string]any{
			"kind":   "pause",
			"reason": "manual",
		},
	}

	proof, errs := validator.ValidateDefinitionWithProof("ControlCaseInput", validInput)
	if len(errs) > 0 || proof == nil {
		t.Fatalf("expected valid proof, got errs=%v", errs)
	}

	// Verify proof and extract succeeds
	extracted, match, err := VerifyProofAndExtract(
		validInput,
		proof,
		"ControlCaseInput",
		"$.action",
		"#/$defs/ControlCaseInput/properties/action/oneOf",
		[]string{"#/$defs/ControlCaseInput/properties/action/oneOf/0", "#/$defs/ControlCaseInput/properties/action/oneOf/1"},
		validator.schemaDigest,
	)
	if err != nil || match.BranchIndex != 0 {
		t.Fatalf("expected successful proof extraction, got err=%v", err)
	}
	extractedMap, ok := extracted.(map[string]any)
	if !ok || extractedMap["kind"] != "pause" {
		t.Fatalf("expected extracted map kind=pause, got %v", extracted)
	}

	// Tampered root value -> canonical digest mismatch
	tamperedRoot := map[string]any{
		"requestId":            "request_tampered",
		"caseId":               "case_abcdefgh1234",
		"expectedCaseRevision": int64(1),
		"action": map[string]any{
			"kind":   "pause",
			"reason": "manual",
		},
	}
	if _, _, err := VerifyProofAndExtract(tamperedRoot, proof, "ControlCaseInput", "$.action", "#/$defs/ControlCaseInput/properties/action/oneOf", []string{"#/$defs/ControlCaseInput/properties/action/oneOf/0"}, validator.schemaDigest); err == nil {
		t.Fatal("expected canonical digest mismatch for tampered root value")
	}

	// Tampered proof canonical digest
	tamperedProof := *proof
	tamperedProof.CanonicalDigest = "0000000000000000000000000000000000000000000000000000000000000000"
	if _, _, err := VerifyProofAndExtract(validInput, &tamperedProof, "ControlCaseInput", "$.action", "#/$defs/ControlCaseInput/properties/action/oneOf", []string{"#/$defs/ControlCaseInput/properties/action/oneOf/0"}, validator.schemaDigest); err == nil {
		t.Fatal("expected canonical digest mismatch")
	}

	// Tampered root definition
	tamperedRootDefinition := *proof
	tamperedRootDefinition.RootDefinition = "CaseState"
	if _, _, err := VerifyProofAndExtract(validInput, &tamperedRootDefinition, "ControlCaseInput", "$.action", "#/$defs/ControlCaseInput/properties/action/oneOf", []string{"#/$defs/ControlCaseInput/properties/action/oneOf/0"}, validator.schemaDigest); err == nil {
		t.Fatal("expected root definition mismatch")
	} else if typed, ok := err.(*IngressError); !ok || typed.Code != "ROOT_DEFINITION_MISMATCH" || typed.Reason != ReasonRootDefinition {
		t.Fatalf("unexpected typed root error: %v", err)
	}

	// Tampered schema digest
	tamperedSchema := *proof
	tamperedSchema.SchemaDigest = "1111111111111111111111111111111111111111111111111111111111111111"
	if _, _, err := VerifyProofAndExtract(validInput, &tamperedSchema, "ControlCaseInput", "$.action", "#/$defs/ControlCaseInput/properties/action/oneOf", []string{"#/$defs/ControlCaseInput/properties/action/oneOf/0"}, validator.schemaDigest); err == nil {
		t.Fatal("expected schema digest mismatch")
	}

	// Duplicate proof entries
	duplicateProof := *proof
	duplicateProof.Unions = append(duplicateProof.Unions, proof.Unions[0])
	if _, _, err := VerifyProofAndExtract(validInput, &duplicateProof, "ControlCaseInput", "$.action", "#/$defs/ControlCaseInput/properties/action/oneOf", []string{"#/$defs/ControlCaseInput/properties/action/oneOf/0"}, validator.schemaDigest); err == nil {
		t.Fatal("expected duplicate proof entries error")
	}
}

func TestIngressErrorPrivacyAndSurrogates(t *testing.T) {
	// Error privacy: DUPLICATE_JSON_MEMBER does not reveal member name
	dupRaw := []byte(`{"secret_member_key": 1, "secret_member_key": 2}`)
	if _, err := ParseRawIngress(dupRaw); err == nil {
		t.Fatal("expected duplicate member error")
	} else if containsStr(err.Error(), "secret_member_key") {
		t.Fatalf("error message leaked secret member key: %v", err)
	}

	// Error privacy: unexpected secret character/body fragment is not echoed
	secretRaw := []byte(`{"secret_api_key_xyz": @super_secret_token_123}`)
	if _, err := ParseRawIngress(secretRaw); err == nil {
		t.Fatal("expected malformed JSON error for secretRaw")
	} else if containsStr(err.Error(), "secret_api_key_xyz") || containsStr(err.Error(), "super_secret_token_123") || containsStr(err.Error(), "@") {
		t.Fatalf("error message leaked secret body fragment or character: %v", err)
	}

	// Lone high surrogate
	loneHigh := []byte(`{"a": "\uD800"}`)
	if _, err := ParseRawIngress(loneHigh); err == nil {
		t.Fatal("expected lone high surrogate error")
	}

	// Lone low surrogate
	loneLow := []byte(`{"a": "\uDC00"}`)
	if _, err := ParseRawIngress(loneLow); err == nil {
		t.Fatal("expected lone low surrogate error")
	}

	// Adversarial float rounding number
	advNum := []byte(`{"val": 90071992547409911e-1}`)
	if _, err := ParseRawIngress(advNum); err == nil {
		t.Fatal("expected UNSAFE_JSON_NUMBER for adversarial number")
	}
}

func TestIngressContainerAndTokenBoundaries(t *testing.T) {
	profile := DefaultM1ReleaseProfile()
	objectLimit := profile.Ingress.MaxObjectMembers
	arrayLimit := profile.Ingress.MaxArrayItems

	t.Run("object member limit succeeds", func(t *testing.T) {
		var buf bytes.Buffer
		buf.WriteString("{")
		for i := 0; i < objectLimit; i++ {
			if i > 0 {
				buf.WriteString(",")
			}
			buf.WriteString(fmt.Sprintf(`"k%d":0`, i))
		}
		buf.WriteString("}")
		if _, err := ParseRawIngress(buf.Bytes()); err != nil {
			t.Fatalf("expected configured object member limit to succeed, got %v", err)
		}
	})

	t.Run("object member limit plus one fails", func(t *testing.T) {
		var buf bytes.Buffer
		buf.WriteString("{")
		for i := 0; i < objectLimit+1; i++ {
			if i > 0 {
				buf.WriteString(",")
			}
			buf.WriteString(fmt.Sprintf(`"k%d":0`, i))
		}
		buf.WriteString("}")
		_, err := ParseRawIngress(buf.Bytes())
		if err == nil {
			t.Fatal("expected configured object member limit plus one to fail")
		}
		ingressErr, ok := err.(*IngressError)
		if !ok || ingressErr.Code != "JSON_LIMIT_EXCEEDED" || ingressErr.Reason != ReasonObjectMembers {
			t.Fatalf("expected JSON_LIMIT_EXCEEDED/OBJECT_MEMBERS, got %v", err)
		}
	})

	t.Run("array item limit succeeds", func(t *testing.T) {
		var buf bytes.Buffer
		buf.WriteString("[")
		for i := 0; i < arrayLimit; i++ {
			if i > 0 {
				buf.WriteString(",")
			}
			buf.WriteString("0")
		}
		buf.WriteString("]")
		if _, err := ParseRawIngress(buf.Bytes()); err != nil {
			t.Fatalf("expected configured array item limit to succeed, got %v", err)
		}
	})

	t.Run("array item limit plus one fails", func(t *testing.T) {
		var buf bytes.Buffer
		buf.WriteString("[")
		for i := 0; i < arrayLimit+1; i++ {
			if i > 0 {
				buf.WriteString(",")
			}
			buf.WriteString("0")
		}
		buf.WriteString("]")
		_, err := ParseRawIngress(buf.Bytes())
		if err == nil {
			t.Fatal("expected configured array item limit plus one to fail")
		}
		ingressErr, ok := err.(*IngressError)
		if !ok || ingressErr.Code != "JSON_LIMIT_EXCEEDED" || ingressErr.Reason != ReasonArrayItems {
			t.Fatalf("expected JSON_LIMIT_EXCEEDED/ARRAY_ITEMS, got %v", err)
		}
	})

	// Compact nested-array token limit (100000 tokens):
	// 49 inner arrays of 1000 zeros = 98100 tokens succeeds
	// 50 inner arrays of 1000 zeros = 100101 tokens exceeds limit
	makeNestedArrays := func(outerCount, innerCount int) []byte {
		var buf bytes.Buffer
		buf.WriteString("[")
		for i := 0; i < outerCount; i++ {
			if i > 0 {
				buf.WriteString(",")
			}
			buf.WriteString("[")
			for j := 0; j < innerCount; j++ {
				if j > 0 {
					buf.WriteString(",")
				}
				buf.WriteString("0")
			}
			buf.WriteString("]")
		}
		buf.WriteString("]")
		return buf.Bytes()
	}

	t.Run("nested array 49x1000 tokens succeeds", func(t *testing.T) {
		raw := makeNestedArrays(49, 1000)
		if _, err := ParseRawIngress(raw); err != nil {
			t.Fatalf("expected 49x1000 nested array to succeed, got %v", err)
		}
	})

	t.Run("nested array 50x1000 tokens exceeds limit", func(t *testing.T) {
		raw := makeNestedArrays(50, 1000)
		_, err := ParseRawIngress(raw)
		if err == nil {
			t.Fatal("expected 50x1000 nested array to fail")
		}
		ingressErr, ok := err.(*IngressError)
		if !ok || ingressErr.Code != "JSON_LIMIT_EXCEEDED" {
			t.Fatalf("expected JSON_LIMIT_EXCEEDED, got %v", err)
		}
	})
}

func containsStr(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(substr) > 0 && findSubstr(s, substr))
}

func findSubstr(s, substr string) bool {
	for i := 0; i+len(substr) <= len(s); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
