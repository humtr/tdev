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

func TestParseJSONRejectsTrailingValues(t *testing.T) {
	if _, err := ParseJSON([]byte(`{} {}`)); err == nil {
		t.Fatal("expected trailing JSON to be rejected")
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
