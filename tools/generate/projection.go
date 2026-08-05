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

	protocolruntime "github.com/humtr/tdev/protocol/runtime/go"
)

const (
	projectionPolicyPath = "protocol/projections/tools-v1.json"
	projectionOutputPath = "protocol/generated/typescript/capabilities.ts"
)

var expectedCapabilityOrder = []string{
	"list_operations",
	"list_resources",
	"submit_operation",
	"get_case",
	"get_task",
	"control_case",
	"finish_case",
	"cancel_case",
	"control_task",
	"cancel_task",
	"render_task",
	"read_artifact",
}

type projectionPolicy struct {
	SchemaVersion             int                    `json:"schemaVersion"`
	ProtocolRevision          string                 `json:"protocolRevision"`
	SemanticCapabilityVersion int                    `json:"semanticCapabilityVersion"`
	BaseProfile               string                 `json:"baseProfile"`
	AdditiveFeatures          []string               `json:"additiveFeatures"`
	Capabilities              []projectionCapability `json:"capabilities"`
}

type projectionCapability struct {
	Name          string                `json:"name"`
	Title         string                `json:"title"`
	InputRoot     string                `json:"inputRoot"`
	ResultRoot    string                `json:"resultRoot"`
	Description   string                `json:"description"`
	Mutation      bool                  `json:"mutation"`
	Owner         string                `json:"owner"`
	Routing       string                `json:"routing"`
	RetryClass    string                `json:"retryClass"`
	ApprovalClass string                `json:"approvalClass"`
	RiskClass     string                `json:"riskClass"`
	ResultBound   string                `json:"resultBound"`
	Annotations   projectionAnnotations `json:"annotations"`
}

type projectionAnnotations struct {
	ReadOnlyHint    bool `json:"readOnlyHint"`
	IdempotentHint  bool `json:"idempotentHint"`
	DestructiveHint bool `json:"destructiveHint"`
	OpenWorldHint   bool `json:"openWorldHint"`
}

type capabilityDescriptor struct {
	Name               string                `json:"name"`
	Title              string                `json:"title"`
	Description        string                `json:"description"`
	Version            int                   `json:"version"`
	InputRoot          string                `json:"inputRoot"`
	ResultRoot         string                `json:"resultRoot"`
	Mutation           bool                  `json:"mutation"`
	Owner              string                `json:"owner"`
	Routing            string                `json:"routing"`
	RetryClass         string                `json:"retryClass"`
	ApprovalClass      string                `json:"approvalClass"`
	RiskClass          string                `json:"riskClass"`
	ResultBound        string                `json:"resultBound"`
	Annotations        projectionAnnotations `json:"annotations"`
	InputSchema        map[string]any        `json:"inputSchema"`
	OutputSchema       map[string]any        `json:"outputSchema"`
	InputSchemaDigest  string                `json:"inputSchemaDigest"`
	ResultSchemaDigest string                `json:"resultSchemaDigest"`
	MaxResultBytes     int                   `json:"maxResultBytes"`
}

type projectionManifest struct {
	ProtocolRevision          string   `json:"protocolRevision"`
	SemanticCapabilityVersion int      `json:"semanticCapabilityVersion"`
	BaseProfile               string   `json:"baseProfile"`
	AdditiveFeatures          []string `json:"additiveFeatures"`
	ReleaseProfileDigest      string   `json:"releaseProfileDigest"`
	CatalogDigest             string   `json:"catalogDigest"`
	ToolSetDigest             string   `json:"toolSetDigest"`
}

func loadProjectionPolicy(path string) (projectionPolicy, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return projectionPolicy{}, err
	}
	if !utf8.Valid(raw) {
		return projectionPolicy{}, fmt.Errorf("projection policy is not valid UTF-8")
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	var policy projectionPolicy
	if err := decoder.Decode(&policy); err != nil {
		return projectionPolicy{}, fmt.Errorf("decode projection policy: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return projectionPolicy{}, fmt.Errorf("unexpected trailing projection policy JSON")
		}
		return projectionPolicy{}, fmt.Errorf("invalid trailing projection policy JSON: %w", err)
	}
	return policy, nil
}

func validateProjectionPolicy(policy projectionPolicy, doc schemaDocument, manifest targetManifest) error {
	if policy.SchemaVersion != 1 || policy.ProtocolRevision != "2026-07-28" || policy.SemanticCapabilityVersion != 1 || policy.BaseProfile != "tools-v1" {
		return fmt.Errorf("unsupported tools-v1 projection identity")
	}
	if len(policy.AdditiveFeatures) != 0 {
		return fmt.Errorf("tools-v1 source profile cannot silently enable additive features")
	}
	if len(policy.Capabilities) != len(expectedCapabilityOrder) {
		return fmt.Errorf("tools-v1 must contain exactly %d capabilities", len(expectedCapabilityOrder))
	}
	rootByName := map[string]rootTarget{}
	for _, root := range manifest.Roots {
		rootByName[root.Name] = root
	}
	seen := map[string]bool{}
	for index, capability := range policy.Capabilities {
		if capability.Name != expectedCapabilityOrder[index] {
			return fmt.Errorf("capability order mismatch at %d: %s", index, capability.Name)
		}
		if seen[capability.Name] {
			return fmt.Errorf("duplicate capability: %s", capability.Name)
		}
		seen[capability.Name] = true
		for label, value := range map[string]string{
			"title":         capability.Title,
			"inputRoot":     capability.InputRoot,
			"resultRoot":    capability.ResultRoot,
			"description":   capability.Description,
			"owner":         capability.Owner,
			"routing":       capability.Routing,
			"retryClass":    capability.RetryClass,
			"approvalClass": capability.ApprovalClass,
			"riskClass":     capability.RiskClass,
			"resultBound":   capability.ResultBound,
		} {
			if strings.TrimSpace(value) == "" {
				return fmt.Errorf("capability %s has empty %s", capability.Name, label)
			}
		}
		if capability.Annotations.ReadOnlyHint == capability.Mutation {
			return fmt.Errorf("capability %s readOnlyHint contradicts mutation classification", capability.Name)
		}
		for _, rootName := range []string{capability.InputRoot, capability.ResultRoot} {
			if _, exists := doc.Defs[rootName]; !exists {
				return fmt.Errorf("capability %s references missing root %s", capability.Name, rootName)
			}
			root, exists := rootByName[rootName]
			if !exists || !containsString(root.Targets, "typescript") {
				return fmt.Errorf("capability %s root %s is not selected for TypeScript", capability.Name, rootName)
			}
		}
		if _, err := projectionResultBound(capability.ResultBound, protocolruntime.DefaultM1ReleaseProfile()); err != nil {
			return fmt.Errorf("capability %s: %w", capability.Name, err)
		}
	}
	return nil
}

func containsString(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}

func projectionResultBound(class string, profile protocolruntime.ReleaseProfile) (int, error) {
	switch class {
	case "page", "mutation":
		return profile.Output.MaxMutationResponseBytes, nil
	case "render":
		return profile.Output.MaxRenderedTextBytes, nil
	case "artifact":
		return profile.Output.MaxArtifactChunkBytes, nil
	default:
		return 0, fmt.Errorf("unsupported result bound class: %s", class)
	}
}

func rootSchemaDocument(doc schemaDocument, root string) (map[string]any, error) {
	if _, exists := doc.Defs[root]; !exists {
		return nil, fmt.Errorf("missing schema root: %s", root)
	}
	closure := map[string]bool{}
	var visit func(string) error
	visit = func(name string) error {
		if closure[name] {
			return nil
		}
		definition, exists := doc.Defs[name]
		if !exists {
			return fmt.Errorf("root %s references missing definition %s", root, name)
		}
		closure[name] = true
		for _, reference := range allLocalReferences(definition) {
			if err := visit(reference); err != nil {
				return err
			}
		}
		return nil
	}
	if err := visit(root); err != nil {
		return nil, err
	}
	defs := map[string]any{}
	for _, name := range sortedBoolKeys(closure) {
		defs[name] = doc.Defs[name]
	}
	return map[string]any{
		"$schema": doc.Schema,
		"$ref":    "#/$defs/" + root,
		"$defs":   defs,
	}, nil
}

func projectionJSONValue(value any) (any, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("marshal projection value: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var decoded any
	if err := decoder.Decode(&decoded); err != nil {
		return nil, fmt.Errorf("decode projection value: %w", err)
	}
	return decoded, nil
}

func generateProjectionTypeScript(doc schemaDocument, manifest targetManifest, profile protocolruntime.ReleaseProfile, profileDigest string) (string, error) {
	policy, err := loadProjectionPolicy(projectionPolicyPath)
	if err != nil {
		return "", err
	}
	if err := validateProjectionPolicy(policy, doc, manifest); err != nil {
		return "", err
	}

	descriptors := make([]capabilityDescriptor, 0, len(policy.Capabilities))
	catalogEntries := make([]map[string]any, 0, len(policy.Capabilities))
	for _, capability := range policy.Capabilities {
		inputSchema, err := rootSchemaDocument(doc, capability.InputRoot)
		if err != nil {
			return "", err
		}
		outputSchema, err := rootSchemaDocument(doc, capability.ResultRoot)
		if err != nil {
			return "", err
		}
		inputDigest, err := protocolruntime.TypedDigest("tdev.mcp.input-schema.v1", inputSchema)
		if err != nil {
			return "", err
		}
		resultDigest, err := protocolruntime.TypedDigest("tdev.mcp.output-schema.v1", outputSchema)
		if err != nil {
			return "", err
		}
		maxResultBytes, err := projectionResultBound(capability.ResultBound, profile)
		if err != nil {
			return "", err
		}
		descriptors = append(descriptors, capabilityDescriptor{
			Name:               capability.Name,
			Title:              capability.Title,
			Description:        capability.Description,
			Version:            policy.SemanticCapabilityVersion,
			InputRoot:          capability.InputRoot,
			ResultRoot:         capability.ResultRoot,
			Mutation:           capability.Mutation,
			Owner:              capability.Owner,
			Routing:            capability.Routing,
			RetryClass:         capability.RetryClass,
			ApprovalClass:      capability.ApprovalClass,
			RiskClass:          capability.RiskClass,
			ResultBound:        capability.ResultBound,
			Annotations:        capability.Annotations,
			InputSchema:        inputSchema,
			OutputSchema:       outputSchema,
			InputSchemaDigest:  inputDigest,
			ResultSchemaDigest: resultDigest,
			MaxResultBytes:     maxResultBytes,
		})
		catalogEntries = append(catalogEntries, map[string]any{
			"operationId":        capability.Name,
			"operationVersion":   policy.SemanticCapabilityVersion,
			"title":              capability.Title,
			"inputSchemaDigest":  inputDigest,
			"resultSchemaDigest": resultDigest,
			"mutating":           capability.Mutation,
		})
	}
	catalogValue, err := projectionJSONValue(catalogEntries)
	if err != nil {
		return "", err
	}
	catalogDigest, err := protocolruntime.TypedDigest("tdev.operation-catalog.v1", catalogValue)
	if err != nil {
		return "", err
	}
	descriptorValue, err := projectionJSONValue(descriptors)
	if err != nil {
		return "", err
	}
	toolSetDigest, err := protocolruntime.TypedDigest("tdev.mcp-tool-set.v1", descriptorValue)
	if err != nil {
		return "", err
	}
	projection := projectionManifest{
		ProtocolRevision:          policy.ProtocolRevision,
		SemanticCapabilityVersion: policy.SemanticCapabilityVersion,
		BaseProfile:               policy.BaseProfile,
		AdditiveFeatures:          policy.AdditiveFeatures,
		ReleaseProfileDigest:      profileDigest,
		CatalogDigest:             catalogDigest,
		ToolSetDigest:             toolSetDigest,
	}
	projectionValue, err := projectionJSONValue(map[string]any{
		"manifest": projection,
		"tools":    descriptors,
	})
	if err != nil {
		return "", err
	}
	projectionDigest, err := protocolruntime.TypedDigest("tdev.mcp-projection.v1", projectionValue)
	if err != nil {
		return "", err
	}

	descriptorJSON, err := json.MarshalIndent(descriptors, "", "  ")
	if err != nil {
		return "", err
	}
	manifestJSON, err := json.MarshalIndent(projection, "", "  ")
	if err != nil {
		return "", err
	}

	var out strings.Builder
	out.WriteString("// Code generated from canonical schema, target manifest, projection policy, and release profile by tools/generate. DO NOT EDIT.\n\n")
	out.WriteString("export type CapabilityName =\n")
	for index, name := range expectedCapabilityOrder {
		prefix := "  | "
		if index == 0 {
			prefix = "  "
		}
		out.WriteString(prefix + jsonLiteral(name) + "\n")
	}
	out.WriteString(";\n\n")
	out.WriteString("export type CapabilityAnnotations = Readonly<{\n")
	out.WriteString("  readOnlyHint: boolean;\n  idempotentHint: boolean;\n  destructiveHint: boolean;\n  openWorldHint: boolean;\n}>;\n\n")
	out.WriteString("export type CapabilityDescriptor = Readonly<{\n")
	out.WriteString("  name: CapabilityName;\n  title: string;\n  description: string;\n  version: 1;\n")
	out.WriteString("  inputRoot: string;\n  resultRoot: string;\n  mutation: boolean;\n  owner: string;\n  routing: string;\n")
	out.WriteString("  retryClass: string;\n  approvalClass: string;\n  riskClass: string;\n  resultBound: string;\n")
	out.WriteString("  annotations: CapabilityAnnotations;\n  inputSchema: Readonly<Record<string, unknown>>;\n")
	out.WriteString("  outputSchema: Readonly<Record<string, unknown>>;\n  inputSchemaDigest: string;\n")
	out.WriteString("  resultSchemaDigest: string;\n  maxResultBytes: number;\n}>;\n\n")
	out.WriteString("export const MCP_PROTOCOL_REVISION = " + jsonLiteral(policy.ProtocolRevision) + ";\n")
	out.WriteString("export const SEMANTIC_CAPABILITY_VERSION = 1 as const;\n")
	out.WriteString("export const MCP_BASE_PROFILE = " + jsonLiteral(policy.BaseProfile) + ";\n")
	out.WriteString("export const OPERATION_CATALOG_DIGEST = " + jsonLiteral(catalogDigest) + ";\n")
	out.WriteString("export const MCP_TOOL_SET_DIGEST = " + jsonLiteral(toolSetDigest) + ";\n")
	out.WriteString("export const MCP_PROJECTION_DIGEST = " + jsonLiteral(projectionDigest) + ";\n\n")
	out.WriteString("export const MCP_PROJECTION_MANIFEST = ")
	out.Write(manifestJSON)
	out.WriteString(" as const;\n\n")
	out.WriteString("export const CAPABILITY_DESCRIPTORS = ")
	out.Write(descriptorJSON)
	out.WriteString(" as const satisfies readonly CapabilityDescriptor[];\n\n")
	out.WriteString("const CAPABILITY_BY_NAME = Object.freeze(Object.fromEntries(\n")
	out.WriteString("  CAPABILITY_DESCRIPTORS.map((descriptor) => [descriptor.name, descriptor]),\n")
	out.WriteString(") as Record<CapabilityName, CapabilityDescriptor>);\n\n")
	out.WriteString("export function capabilityDescriptor(name: CapabilityName): CapabilityDescriptor {\n")
	out.WriteString("  return CAPABILITY_BY_NAME[name];\n}\n")
	return out.String(), nil
}

func sortedProjectionRoots(policy projectionPolicy) []string {
	roots := map[string]bool{}
	for _, capability := range policy.Capabilities {
		roots[capability.InputRoot] = true
		roots[capability.ResultRoot] = true
	}
	result := sortedBoolKeys(roots)
	sort.Strings(result)
	return result
}
