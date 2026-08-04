package protocolruntime

import (
	"encoding/json"
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
