package protocol

import (
	"os"
	"path/filepath"
	"testing"

	protocolruntime "github.com/humtr/tdev/protocol/runtime/go"
)

func TestCanonicalSchemaDigestConstant(t *testing.T) {
	schemaRaw, err := os.ReadFile(filepath.Join("..", "..", "schemas", "tdev.v1.schema.json"))
	if err != nil {
		t.Fatal(err)
	}
	validator, err := protocolruntime.ParseSchema(schemaRaw)
	if err != nil {
		t.Fatal(err)
	}
	if validator.SchemaDigest() != CanonicalSchemaDigest {
		t.Fatalf("validator schema digest %s != CanonicalSchemaDigest %s", validator.SchemaDigest(), CanonicalSchemaDigest)
	}
}
