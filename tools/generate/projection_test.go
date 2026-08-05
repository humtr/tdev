package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	protocolruntime "github.com/humtr/tdev/protocol/runtime/go"
)

func enterProjectionRepositoryRoot(t *testing.T) {
	t.Helper()
	if _, err := os.Stat(schemaPath); err == nil {
		return
	}
	original, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	root := filepath.Clean(filepath.Join(original, "..", ".."))
	if err := os.Chdir(root); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := os.Chdir(original); err != nil {
			t.Errorf("restore working directory: %v", err)
		}
	})
}

func loadProjectionTestInputs(t *testing.T) (schemaDocument, targetManifest, protocolruntime.ReleaseProfile, string) {
	t.Helper()
	enterProjectionRepositoryRoot(t)
	raw, err := os.ReadFile(schemaPath)
	if err != nil {
		t.Fatal(err)
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	decoder.DisallowUnknownFields()
	var doc schemaDocument
	if err := decoder.Decode(&doc); err != nil {
		t.Fatal(err)
	}
	manifest, err := loadTargetManifest(targetManifestPath)
	if err != nil {
		t.Fatal(err)
	}
	profileRaw, err := os.ReadFile(profilePath)
	if err != nil {
		t.Fatal(err)
	}
	profileValue, err := protocolruntime.ParseRawIngress(profileRaw)
	if err != nil {
		t.Fatal(err)
	}
	var profile protocolruntime.ReleaseProfile
	profileDecoder := json.NewDecoder(bytes.NewReader(profileRaw))
	profileDecoder.DisallowUnknownFields()
	if err := profileDecoder.Decode(&profile); err != nil {
		t.Fatal(err)
	}
	profileDigest, err := protocolruntime.TypedDigest("tdev.release-profile.v1", profileValue)
	if err != nil {
		t.Fatal(err)
	}
	return doc, manifest, profile, profileDigest
}

func TestProjectionGeneratesStableTwelveToolSurface(t *testing.T) {
	doc, manifest, profile, profileDigest := loadProjectionTestInputs(t)
	generated, err := generateProjectionTypeScript(doc, manifest, profile, profileDigest)
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range expectedCapabilityOrder {
		if !strings.Contains(generated, `"name": "`+name+`"`) {
			t.Fatalf("generated projection is missing %s", name)
		}
	}
	for _, root := range []string{"ListOperationsInput", "ListOperationsResult", "ReadArtifactResult", "SubmitOperationResult"} {
		if !strings.Contains(generated, root) {
			t.Fatalf("generated projection is missing root %s", root)
		}
	}
	if !strings.Contains(generated, `export const MCP_PROTOCOL_REVISION = "2026-07-28"`) {
		t.Fatal("generated projection has the wrong MCP revision")
	}
	if count := strings.Count(generated, `"maxResultBytes":`); count != len(expectedCapabilityOrder) {
		t.Fatalf("generated projection contains %d tool descriptors, want %d", count, len(expectedCapabilityOrder))
	}
}

func TestProjectionPolicyRejectsOrderDrift(t *testing.T) {
	doc, manifest, _, _ := loadProjectionTestInputs(t)
	policy, err := loadProjectionPolicy(projectionPolicyPath)
	if err != nil {
		t.Fatal(err)
	}
	policy.Capabilities[0], policy.Capabilities[1] = policy.Capabilities[1], policy.Capabilities[0]
	if err := validateProjectionPolicy(policy, doc, manifest); err == nil || !strings.Contains(err.Error(), "order mismatch") {
		t.Fatalf("expected order mismatch, got %v", err)
	}
}

func TestNewPublicRootsAreTypeScriptOnly(t *testing.T) {
	_, manifest, _, _ := loadProjectionTestInputs(t)
	rootByName := map[string]rootTarget{}
	for _, root := range manifest.Roots {
		rootByName[root.Name] = root
	}
	newPublicRoots := []string{
		"ListOperationsInput", "ListOperationsResult",
		"ListResourcesInput", "ListResourcesResult",
		"GetCaseInput", "GetCaseResult",
		"GetTaskInput", "GetTaskResult",
		"RenderTaskInput", "RenderTaskResult",
		"ReadArtifactInput", "ReadArtifactResult",
		"SubmitOperationResult", "ControlCaseResult", "FinishCaseResult", "CancelCaseResult",
		"ControlTaskResult", "CancelTaskResult",
	}
	for _, rootName := range newPublicRoots {
		root, exists := rootByName[rootName]
		if !exists {
			t.Fatalf("new public root %s is absent from target manifest", rootName)
		}
		if root.Role != "public_mcp" || len(root.Targets) != 1 || root.Targets[0] != "typescript" {
			t.Fatalf("new public root %s has role %s and targets %v, want public_mcp TypeScript only", rootName, root.Role, root.Targets)
		}
	}
}

func TestGoGenerationExcludesNewPublicRoots(t *testing.T) {
	doc, manifest, _, _ := loadProjectionTestInputs(t)
	goDefs, err := definitionsForTarget(doc.Defs, manifest, "go")
	if err != nil {
		t.Fatal(err)
	}
	generated := generateGo(goDefs, "0f"+strings.Repeat("0", 62))
	for _, root := range []string{"ListOperationsInput", "ListOperationsResult", "GetCaseResult", "ReadArtifactResult"} {
		if strings.Contains(generated, "type "+root+" ") {
			t.Fatalf("Go output unexpectedly contains public root %s", root)
		}
	}
}
