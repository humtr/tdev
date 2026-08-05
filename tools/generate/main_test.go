package main

import (
	"reflect"
	"strings"
	"testing"
)

func manifestForTests(roots ...rootTarget) targetManifest {
	return targetManifest{SchemaVersion: 1, Schema: schemaPath, Roots: roots}
}

func selectedRoot(name string, targets ...string) rootTarget {
	consumers := map[string][]string{}
	for _, target := range targets {
		consumers[target] = []string{"consumer"}
	}
	return rootTarget{Name: name, Role: "canonical_wire", Targets: targets, Consumers: consumers, Proof: "none"}
}

func TestDefinitionsForTargetComputesReachableClosure(t *testing.T) {
	defs := map[string]any{
		"Root":       map[string]any{"type": "object", "properties": map[string]any{"child": map[string]any{"$ref": "#/$defs/Child"}}, "required": []any{"child"}, "additionalProperties": false},
		"Child":      map[string]any{"type": "array", "items": map[string]any{"$ref": "#/$defs/Leaf"}},
		"Leaf":       map[string]any{"type": "string"},
		"Unselected": map[string]any{"type": "boolean"},
	}
	manifest := manifestForTests(selectedRoot("Root", "typescript"))
	if err := validateTargetManifest(manifest, defs, schemaPath); err != nil {
		t.Fatal(err)
	}
	selected, err := definitionsForTarget(defs, manifest, "typescript")
	if err != nil {
		t.Fatal(err)
	}
	got := sortedKeys(selected)
	want := []string{"Child", "Leaf", "Root"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("closure=%v want=%v", got, want)
	}
}

func TestTargetManifestRejectsMissingRoot(t *testing.T) {
	manifest := manifestForTests(selectedRoot("Missing", "typescript"))
	if err := validateTargetManifest(manifest, map[string]any{"Root": map[string]any{"type": "string"}}, schemaPath); err == nil || !strings.Contains(err.Error(), "missing") {
		t.Fatalf("expected missing root error, got %v", err)
	}
}

func TestDefinitionsForTargetRejectsDanglingReference(t *testing.T) {
	defs := map[string]any{"Root": map[string]any{"$ref": "#/$defs/Missing"}}
	manifest := manifestForTests(selectedRoot("Root", "typescript"))
	_, err := definitionsForTarget(defs, manifest, "typescript")
	if err == nil || !strings.Contains(err.Error(), "dangling") {
		t.Fatalf("expected dangling ref error, got %v", err)
	}
}

func TestStrictEmptyAndOpenObjectGeneration(t *testing.T) {
	strict := map[string]any{"type": "object", "properties": map[string]any{}, "additionalProperties": false}
	open := map[string]any{"type": "object", "properties": map[string]any{}, "additionalProperties": true}
	typed := map[string]any{"type": "object", "properties": map[string]any{}, "additionalProperties": map[string]any{"type": "string"}}
	if got := goDecl("StrictEmpty", strict); got != "type StrictEmpty struct{}\n" {
		t.Fatalf("strict Go=%q", got)
	}
	if got := goDecl("OpenObject", open); got != "type OpenObject map[string]any\n" {
		t.Fatalf("open Go=%q", got)
	}
	if got := goDecl("StringMap", typed); got != "type StringMap map[string]string\n" {
		t.Fatalf("typed Go=%q", got)
	}
	if got := tsType(strict, 0); got != "Readonly<Record<string, never>>" {
		t.Fatalf("strict TS=%q", got)
	}
	if got := tsType(open, 0); got != "Readonly<Record<string, unknown>>" {
		t.Fatalf("open TS=%q", got)
	}
	if got := tsType(typed, 0); got != "Readonly<Record<string, string>>" {
		t.Fatalf("typed TS=%q", got)
	}
}

func TestGenerationIsDeterministicForSelectedDefinitions(t *testing.T) {
	defs := map[string]any{
		"B": map[string]any{"type": "string"},
		"A": map[string]any{"type": "object", "properties": map[string]any{"b": map[string]any{"$ref": "#/$defs/B"}}, "required": []any{"b"}, "additionalProperties": false},
	}
	firstTS := generateTypeScript(defs, "digest")
	secondTS := generateTypeScript(defs, "digest")
	firstGo := generateGo(defs, "digest")
	secondGo := generateGo(defs, "digest")
	if firstTS != secondTS || firstGo != secondGo {
		t.Fatal("generation is not deterministic")
	}
}
