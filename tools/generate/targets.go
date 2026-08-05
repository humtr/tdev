package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sort"
	"strings"
	"unicode/utf8"
)

const targetManifestPath = "protocol/schemas/tdev.v1.targets.json"

type targetManifest struct {
	SchemaVersion int          `json:"schemaVersion"`
	Schema        string       `json:"schema"`
	Roots         []rootTarget `json:"roots"`
}

type rootTarget struct {
	Name                    string                            `json:"name"`
	Role                    string                            `json:"role"`
	Targets                 []string                          `json:"targets"`
	Consumers               map[string][]string               `json:"consumers"`
	CompatibilityExemptions map[string]compatibilityExemption `json:"compatibilityExemptions"`
	Proof                   string                            `json:"proof"`
}

type compatibilityExemption struct {
	Reason      string `json:"reason"`
	RemovalGate string `json:"removalGate"`
}

var supportedRootRoles = map[string]bool{
	"public_mcp":         true,
	"canonical_wire":     true,
	"persisted_external": true,
	"internal_only":      true,
}

var supportedTargets = map[string]bool{
	"typescript": true,
	"go":         true,
}

var supportedProofRequirements = map[string]bool{
	"none":         true,
	"closed_union": true,
}

func loadTargetManifest(path string) (targetManifest, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return targetManifest{}, err
	}
	if !utf8.Valid(raw) {
		return targetManifest{}, fmt.Errorf("target manifest is not valid UTF-8")
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	var manifest targetManifest
	if err := decoder.Decode(&manifest); err != nil {
		return targetManifest{}, fmt.Errorf("decode target manifest: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return targetManifest{}, fmt.Errorf("unexpected trailing target manifest JSON")
		}
		return targetManifest{}, fmt.Errorf("invalid trailing target manifest JSON: %w", err)
	}
	return manifest, nil
}

func validateTargetManifest(manifest targetManifest, defs map[string]any, expectedSchema string) error {
	if manifest.SchemaVersion != 1 {
		return fmt.Errorf("unsupported target manifest version: %d", manifest.SchemaVersion)
	}
	if manifest.Schema != expectedSchema {
		return fmt.Errorf("target manifest schema mismatch: %q", manifest.Schema)
	}
	if len(manifest.Roots) == 0 {
		return fmt.Errorf("target manifest has no roots")
	}
	seenRoots := map[string]bool{}
	for index, root := range manifest.Roots {
		path := fmt.Sprintf("roots[%d]", index)
		if root.Name == "" {
			return fmt.Errorf("%s has no name", path)
		}
		if seenRoots[root.Name] {
			return fmt.Errorf("duplicate target root: %s", root.Name)
		}
		seenRoots[root.Name] = true
		definition, exists := defs[root.Name]
		if !exists {
			return fmt.Errorf("declared target root is missing from schema: %s", root.Name)
		}
		if !supportedRootRoles[root.Role] {
			return fmt.Errorf("unsupported role for %s: %s", root.Name, root.Role)
		}
		if !supportedProofRequirements[root.Proof] {
			return fmt.Errorf("unsupported proof requirement for %s: %s", root.Name, root.Proof)
		}
		definitionMap := asMap(definition)
		_, topLevelUnion := definitionMap["oneOf"]
		if topLevelUnion != (root.Proof == "closed_union") {
			return fmt.Errorf("proof requirement does not match top-level union for %s", root.Name)
		}
		if len(root.Targets) == 0 {
			return fmt.Errorf("target root has no language targets: %s", root.Name)
		}
		seenTargets := map[string]bool{}
		for _, target := range root.Targets {
			if !supportedTargets[target] {
				return fmt.Errorf("unsupported target for %s: %s", root.Name, target)
			}
			if seenTargets[target] {
				return fmt.Errorf("duplicate target for %s: %s", root.Name, target)
			}
			seenTargets[target] = true
			consumers := root.Consumers[target]
			exemption, exempt := root.CompatibilityExemptions[target]
			if len(consumers) == 0 && !exempt {
				return fmt.Errorf("target %s for %s has no consumer or compatibility exemption", target, root.Name)
			}
			for _, consumer := range consumers {
				if strings.TrimSpace(consumer) == "" {
					return fmt.Errorf("target %s for %s has an empty consumer", target, root.Name)
				}
			}
			if exempt && (strings.TrimSpace(exemption.Reason) == "" || strings.TrimSpace(exemption.RemovalGate) == "") {
				return fmt.Errorf("target %s for %s has an incomplete compatibility exemption", target, root.Name)
			}
		}
		for target := range root.Consumers {
			if !seenTargets[target] {
				return fmt.Errorf("consumer declared for unselected target %s on %s", target, root.Name)
			}
		}
		for target := range root.CompatibilityExemptions {
			if !seenTargets[target] {
				return fmt.Errorf("compatibility exemption declared for unselected target %s on %s", target, root.Name)
			}
		}
	}
	return nil
}

func validateConsumerPaths(manifest targetManifest) error {
	seen := map[string]bool{}
	for _, root := range manifest.Roots {
		for _, consumers := range root.Consumers {
			for _, consumer := range consumers {
				if seen[consumer] {
					continue
				}
				seen[consumer] = true
				info, err := os.Stat(consumer)
				if err != nil {
					return fmt.Errorf("manifest consumer %q is unavailable: %w", consumer, err)
				}
				if info.IsDir() {
					return fmt.Errorf("manifest consumer %q is a directory", consumer)
				}
			}
		}
	}
	return nil
}

func definitionsForTarget(defs map[string]any, manifest targetManifest, target string) (map[string]any, error) {
	if !supportedTargets[target] {
		return nil, fmt.Errorf("unsupported generation target: %s", target)
	}
	selected := map[string]bool{}
	for _, root := range manifest.Roots {
		for _, current := range root.Targets {
			if current == target {
				selected[root.Name] = true
			}
		}
	}
	if len(selected) == 0 {
		return nil, fmt.Errorf("target %s has no selected roots", target)
	}

	closure := map[string]bool{}
	visiting := map[string]bool{}
	var visitDefinition func(string) error
	visitDefinition = func(name string) error {
		if closure[name] {
			return nil
		}
		if visiting[name] {
			return nil
		}
		definition, exists := defs[name]
		if !exists {
			return fmt.Errorf("selected or referenced definition is missing: %s", name)
		}
		visiting[name] = true
		for _, reference := range allLocalReferences(definition) {
			if _, exists := defs[reference]; !exists {
				return fmt.Errorf("dangling local reference from %s to %s", name, reference)
			}
			if err := visitDefinition(reference); err != nil {
				return err
			}
		}
		delete(visiting, name)
		closure[name] = true
		return nil
	}
	for _, name := range sortedBoolKeys(selected) {
		if err := visitDefinition(name); err != nil {
			return nil, err
		}
	}
	result := make(map[string]any, len(closure))
	for name := range closure {
		result[name] = defs[name]
	}
	return result, nil
}

func allLocalReferences(value any) []string {
	set := map[string]bool{}
	var visit func(any)
	visit = func(current any) {
		switch typed := current.(type) {
		case map[string]any:
			if rawRef, exists := typed["$ref"]; exists {
				ref, ok := rawRef.(string)
				const prefix = "#/$defs/"
				if ok && strings.HasPrefix(ref, prefix) {
					set[strings.TrimPrefix(ref, prefix)] = true
				}
			}
			for _, child := range typed {
				visit(child)
			}
		case []any:
			for _, child := range typed {
				visit(child)
			}
		}
	}
	visit(value)
	return sortedBoolKeys(set)
}

func sortedBoolKeys(values map[string]bool) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}
