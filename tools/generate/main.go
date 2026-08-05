package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"go/format"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	protocolruntime "github.com/humtr/tdev/protocol/runtime/go"
)

const schemaPath = "protocol/schemas/tdev.v1.schema.json"
const profilePath = "protocol/profiles/tdev.m1.release-profile.json"

var check = flag.Bool("check", false, "fail when generated files differ")

type schemaDocument struct {
	Schema string         `json:"$schema,omitempty"`
	ID     string         `json:"$id,omitempty"`
	Title  string         `json:"title,omitempty"`
	Defs   map[string]any `json:"$defs"`
}

func main() {
	flag.Parse()
	raw, err := os.ReadFile(schemaPath)
	must(err)
	if !utf8.Valid(raw) {
		panic("schema JSON is not valid UTF-8")
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	dec.DisallowUnknownFields()
	var doc schemaDocument
	must(dec.Decode(&doc))
	var trailing any
	if err := dec.Decode(&trailing); err != io.EOF {
		if err == nil {
			panic("unexpected trailing schema JSON")
		}
		panic(fmt.Errorf("invalid trailing schema JSON: %w", err))
	}
	if len(doc.Defs) == 0 {
		panic("schema has no $defs")
	}
	validateSchema(doc.Defs)
	manifest, err := loadTargetManifest(targetManifestPath)
	must(err)
	must(validateTargetManifest(manifest, doc.Defs, schemaPath))
	must(validateConsumerPaths(manifest))
	typeScriptDefs, err := definitionsForTarget(doc.Defs, manifest, "typescript")
	must(err)
	goDefs, err := definitionsForTarget(doc.Defs, manifest, "go")
	must(err)

	var docAny any
	decAny := json.NewDecoder(bytes.NewReader(raw))
	decAny.UseNumber()
	must(decAny.Decode(&docAny))
	schemaDigest, err := protocolruntime.TypedDigest("tdev.schema.v1", docAny)
	must(err)

	ts := generateTypeScript(typeScriptDefs, schemaDigest)
	goSource := generateGo(goDefs, schemaDigest)
	formatted, err := format.Source([]byte(goSource))
	must(err)

	profileRaw, err := os.ReadFile(profilePath)
	must(err)
	profileValue, err := protocolruntime.ParseRawIngress(profileRaw)
	must(err)
	profileDecoder := json.NewDecoder(bytes.NewReader(profileRaw))
	profileDecoder.DisallowUnknownFields()
	var profile protocolruntime.ReleaseProfile
	must(profileDecoder.Decode(&profile))
	if err := profileDecoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			panic("unexpected trailing release profile JSON")
		}
		panic(fmt.Errorf("invalid trailing release profile JSON: %w", err))
	}
	must(protocolruntime.ValidateReleaseProfile(profile))
	profileDigest, err := protocolruntime.TypedDigest("tdev.release-profile.v1", profileValue)
	must(err)
	profileTS := generateTypeScriptProfile(profile, profileDigest)
	profileGo := generateGoProfile(profile, profileDigest)
	formattedProfileGo, err := format.Source([]byte(profileGo))
	must(err)
	projectionTS, err := generateProjectionTypeScript(doc, manifest, profile, profileDigest)
	must(err)

	writeOrCheck("protocol/generated/typescript/types.ts", []byte(ts))
	writeOrCheck("protocol/generated/go/types.go", formatted)
	writeOrCheck("protocol/runtime/typescript/profile.generated.ts", []byte(profileTS))
	writeOrCheck("protocol/runtime/go/profile_generated.go", formattedProfileGo)
	writeOrCheck(projectionOutputPath, []byte(projectionTS))
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}

func writeOrCheck(path string, content []byte) {
	if *check {
		existing, err := os.ReadFile(path)
		if err != nil || !bytes.Equal(existing, content) {
			fmt.Fprintf(os.Stderr, "generated drift: %s\n", path)
			os.Exit(1)
		}
		return
	}
	must(os.MkdirAll(filepath.Dir(path), 0o755))
	must(os.WriteFile(path, content, 0o644))
}

var supportedSchemaKeywords = map[string]bool{
	"$ref": true, "additionalProperties": true, "const": true, "enum": true,
	"format": true, "items": true, "maxItems": true, "maxLength": true, "maximum": true,
	"minItems": true, "minLength": true, "minimum": true, "oneOf": true,
	"pattern": true, "properties": true, "required": true, "type": true,
	"uniqueItems": true,
}

var supportedSchemaTypes = map[string]bool{
	"null": true, "boolean": true, "integer": true, "number": true,
	"string": true, "array": true, "object": true,
}

const generatorMaxSafeInteger int64 = 9_007_199_254_740_991

func validateSchema(defs map[string]any) {
	var visit func(schema map[string]any, path string)
	visit = func(schema map[string]any, path string) {
		if schema == nil {
			panic("definition is not a schema at " + path)
		}
		for key := range schema {
			if !supportedSchemaKeywords[key] {
				panic("unsupported schema keyword at " + path + ": " + key)
			}
		}

		if rawRef, exists := schema["$ref"]; exists {
			if len(schema) != 1 {
				panic("$ref siblings are unsupported at " + path)
			}
			ref, ok := rawRef.(string)
			const prefix = "#/$defs/"
			if !ok || !strings.HasPrefix(ref, prefix) {
				panic(fmt.Sprintf("unsupported external $ref at %s: %v", path, rawRef))
			}
			if _, exists := defs[strings.TrimPrefix(ref, prefix)]; !exists {
				panic("unresolved $ref at " + path + ": " + ref)
			}
			return
		}

		if rawChoices, exists := schema["oneOf"]; exists {
			if len(schema) != 1 {
				panic("oneOf siblings are unsupported at " + path)
			}
			choices, ok := rawChoices.([]any)
			if !ok || len(choices) == 0 {
				panic("oneOf must contain a branch at " + path)
			}
			for index, choice := range choices {
				branch := asMap(choice)
				if branch == nil {
					panic(fmt.Sprintf("oneOf branch is not a schema at %s/%d", path, index))
				}
				visit(branch, fmt.Sprintf("%s/oneOf/%d", path, index))
			}
			return
		}

		typeName := ""
		if rawType, exists := schema["type"]; exists {
			value, ok := rawType.(string)
			if !ok || !supportedSchemaTypes[value] {
				panic(fmt.Sprintf("unsupported schema type at %s: %v", path, rawType))
			}
			typeName = value
		}
		_, hasConst := schema["const"]
		_, hasEnum := schema["enum"]
		if typeName == "" && !hasConst && !hasEnum {
			panic("schema has no executable keyword at " + path)
		}

		if value, exists := schema["const"]; exists {
			validateGeneratorProtocolValue(value, path+"/const")
		}
		if rawEnum, exists := schema["enum"]; exists {
			values, ok := rawEnum.([]any)
			if !ok || len(values) == 0 {
				panic("enum must contain a value at " + path)
			}
			seen := map[string]bool{}
			for index, value := range values {
				validateGeneratorProtocolValue(value, fmt.Sprintf("%s/enum/%d", path, index))
				raw, err := json.Marshal(value)
				must(err)
				key := string(raw)
				if seen[key] {
					panic("enum contains a duplicate value at " + path)
				}
				seen[key] = true
			}
		}

		rejectGeneratorMisplaced(schema, []string{"minLength", "maxLength", "pattern", "format"}, typeName == "string", path)
		rejectGeneratorMisplaced(schema, []string{"minimum", "maximum"}, typeName == "integer" || typeName == "number", path)
		rejectGeneratorMisplaced(schema, []string{"items", "minItems", "maxItems", "uniqueItems"}, typeName == "array", path)
		rejectGeneratorMisplaced(schema, []string{"properties", "required", "additionalProperties"}, typeName == "object", path)

		if typeName == "string" {
			minimum, hasMinimum := generatorConstraintInteger(schema, "minLength", path, true)
			maximum, hasMaximum := generatorConstraintInteger(schema, "maxLength", path, true)
			if hasMinimum && hasMaximum && minimum > maximum {
				panic("minLength exceeds maxLength at " + path)
			}
			if rawPattern, exists := schema["pattern"]; exists {
				pattern, ok := rawPattern.(string)
				if !ok {
					panic("schema pattern is not a string at " + path)
				}
				if _, err := regexp.Compile(pattern); err != nil {
					panic(fmt.Errorf("invalid schema pattern at %s: %w", path, err))
				}
			}
			if rawFormat, exists := schema["format"]; exists {
				format, ok := rawFormat.(string)
				if !ok || format != "date-time" {
					panic(fmt.Sprintf("unsupported string format at %s: %v", path, rawFormat))
				}
			}
		}

		if typeName == "integer" || typeName == "number" {
			minimum, hasMinimum := generatorConstraintInteger(schema, "minimum", path, false)
			maximum, hasMaximum := generatorConstraintInteger(schema, "maximum", path, false)
			if hasMinimum && hasMaximum && minimum > maximum {
				panic("minimum exceeds maximum at " + path)
			}
		}

		if typeName == "array" {
			minimum, hasMinimum := generatorConstraintInteger(schema, "minItems", path, true)
			maximum, hasMaximum := generatorConstraintInteger(schema, "maxItems", path, true)
			if hasMinimum && hasMaximum && minimum > maximum {
				panic("minItems exceeds maxItems at " + path)
			}
			if rawUnique, exists := schema["uniqueItems"]; exists {
				if _, ok := rawUnique.(bool); !ok {
					panic("uniqueItems is not a boolean at " + path)
				}
			}
			if rawItems, exists := schema["items"]; exists {
				items := asMap(rawItems)
				if items == nil {
					panic("items is not a schema at " + path)
				}
				visit(items, path+"/items")
			}
		}

		if typeName == "object" {
			var properties map[string]any
			if rawProperties, exists := schema["properties"]; exists {
				properties = asMap(rawProperties)
				if properties == nil {
					panic("schema properties are not an object at " + path)
				}
				for name, rawProperty := range properties {
					property := asMap(rawProperty)
					if property == nil {
						panic("property is not a schema at " + path + "/properties/" + name)
					}
					visit(property, path+"/properties/"+name)
				}
			}
			if rawRequired, exists := schema["required"]; exists {
				values, ok := rawRequired.([]any)
				if !ok {
					panic("required is not an array at " + path)
				}
				seen := map[string]bool{}
				for _, value := range values {
					property, ok := value.(string)
					if !ok {
						panic("required contains a non-string at " + path)
					}
					if seen[property] {
						panic("required contains a duplicate property at " + path + ": " + property)
					}
					if properties == nil {
						panic("required property is not declared at " + path + ": " + property)
					}
					if _, exists := properties[property]; !exists {
						panic("required property is not declared at " + path + ": " + property)
					}
					seen[property] = true
				}
			}
			if len(properties) > 0 {
				strict, ok := schema["additionalProperties"].(bool)
				if !ok || strict {
					panic("canonical object is not strict at " + path)
				}
			}
			if rawAdditional, exists := schema["additionalProperties"]; exists {
				switch additional := rawAdditional.(type) {
				case bool:
				case map[string]any:
					visit(additional, path+"/additionalProperties")
				default:
					panic("additionalProperties is not boolean or schema at " + path)
				}
			}
		}
	}

	for _, name := range sortedKeys(defs) {
		visit(asMap(defs[name]), "#/$defs/"+name)
	}
	visiting := map[string]bool{}
	visited := map[string]bool{}
	var visitDefinition func(string)
	visitDefinition = func(name string) {
		if visited[name] {
			return
		}
		if visiting[name] {
			panic("unproductive same-instance $ref cycle: " + name)
		}
		definition := asMap(defs[name])
		if definition == nil {
			panic("definition is not a schema: " + name)
		}
		visiting[name] = true
		for _, referenced := range generatorSameInstanceReferences(definition) {
			visitDefinition(referenced)
		}
		delete(visiting, name)
		visited[name] = true
	}
	for _, name := range sortedKeys(defs) {
		visitDefinition(name)
	}
}

func generatorSameInstanceReferences(schema map[string]any) []string {
	if reference, ok := schema["$ref"].(string); ok {
		return []string{strings.TrimPrefix(reference, "#/$defs/")}
	}
	choices, ok := schema["oneOf"].([]any)
	if !ok {
		return nil
	}
	var references []string
	for _, choice := range choices {
		if branch := asMap(choice); branch != nil {
			references = append(references, generatorSameInstanceReferences(branch)...)
		}
	}
	return references
}

func rejectGeneratorMisplaced(schema map[string]any, keys []string, allowed bool, path string) {
	if allowed {
		return
	}
	for _, key := range keys {
		if _, exists := schema[key]; exists {
			panic(key + " is not valid for schema type at " + path)
		}
	}
}

func generatorConstraintInteger(schema map[string]any, key, path string, nonNegative bool) (int64, bool) {
	value, exists := schema[key]
	if !exists {
		return 0, false
	}
	number, ok := value.(json.Number)
	if !ok {
		panic(key + " is not a safe integer at " + path)
	}
	integer, err := number.Int64()
	if err != nil || integer < -generatorMaxSafeInteger || integer > generatorMaxSafeInteger || nonNegative && integer < 0 {
		qualifier := ""
		if nonNegative {
			qualifier = "non-negative "
		}
		panic(key + " is not a " + qualifier + "safe integer at " + path)
	}
	return integer, true
}

func validateGeneratorProtocolValue(value any, path string) {
	switch current := value.(type) {
	case nil, bool, string:
		return
	case json.Number:
		integer, err := current.Int64()
		if err != nil || integer < -generatorMaxSafeInteger || integer > generatorMaxSafeInteger {
			panic("invalid protocol number at " + path)
		}
	case []any:
		for index, item := range current {
			validateGeneratorProtocolValue(item, fmt.Sprintf("%s/%d", path, index))
		}
	case map[string]any:
		for key, item := range current {
			validateGeneratorProtocolValue(item, path+"/"+key)
		}
	default:
		panic(fmt.Sprintf("invalid protocol value at %s: %T", path, value))
	}
}

func sortedKeys(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for key := range m {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func asMap(value any) map[string]any {
	m, _ := value.(map[string]any)
	return m
}

func asSlice(value any) []any {
	s, _ := value.([]any)
	return s
}

func refName(ref string) string {
	parts := strings.Split(ref, "/")
	return parts[len(parts)-1]
}

func jsonLiteral(value any) string {
	raw, err := json.Marshal(value)
	must(err)
	return string(raw)
}

func getBranchConsts(choice map[string]any, defs map[string]any) map[string]any {
	result := map[string]any{}
	targetSchema := choice
	if ref, ok := choice["$ref"].(string); ok {
		const prefix = "#/$defs/"
		if strings.HasPrefix(ref, prefix) {
			if refDefMap := asMap(defs[strings.TrimPrefix(ref, prefix)]); refDefMap != nil {
				targetSchema = refDefMap
			}
		}
	}
	properties := asMap(targetSchema["properties"])
	for pName, pSchemaRaw := range properties {
		pSchema := asMap(pSchemaRaw)
		if pSchema != nil {
			if constVal, hasConst := pSchema["const"]; hasConst {
				result[pName] = constVal
			}
		}
	}
	return result
}

func generateTypeScript(defs map[string]any, schemaDigest string) string {
	var out strings.Builder
	out.WriteString("// Code generated from protocol/schemas/tdev.v1.schema.json by tools/generate. DO NOT EDIT.\n\n")
	out.WriteString("import { IngressError } from \"../../runtime/typescript/ingress.ts\";\n")
	out.WriteString("import { verifyProofAndExtract, type ValidationProofV1 } from \"../../runtime/typescript/schema.ts\";\n\n")
	out.WriteString("export const CANONICAL_SCHEMA_DIGEST = " + jsonLiteral(schemaDigest) + ";\n\n")

	for _, name := range sortedKeys(defs) {
		out.WriteString("export type ")
		out.WriteString(name)
		out.WriteString(" = ")
		out.WriteString(tsType(asMap(defs[name]), 0))
		out.WriteString(";\n\n")
	}

	out.WriteString("export const UNION_BRANCH_IDENTITIES = {\n")
	for _, name := range sortedKeys(defs) {
		schema := asMap(defs[name])
		if choices := asSlice(schema["oneOf"]); len(choices) > 0 {
			out.WriteString("  ")
			out.WriteString(name)
			out.WriteString(": [\n")
			for index := range choices {
				fmt.Fprintf(&out, "    \"#/$defs/%s/oneOf/%d\",\n", name, index)
			}
			out.WriteString("  ],\n")
		}
	}
	out.WriteString("} as const;\n\n")

	for _, name := range sortedKeys(defs) {
		schema := asMap(defs[name])
		choices := asSlice(schema["oneOf"])
		if len(choices) == 0 {
			continue
		}
		fmt.Fprintf(&out, "export function convert%sDomain(\n", name)
		out.WriteString("  rootValue: unknown,\n")
		out.WriteString("  proof: ValidationProofV1,\n")
		out.WriteString("  expectedRootDefinition: string,\n")
		out.WriteString("  instancePointer: string,\n")
		fmt.Fprintf(&out, "): %s {\n", name)
		fmt.Fprintf(&out, "  const { extractedValue, match } = verifyProofAndExtract(\n")
		out.WriteString("    rootValue,\n")
		out.WriteString("    proof,\n")
		out.WriteString("    expectedRootDefinition,\n")
		out.WriteString("    instancePointer,\n")
		fmt.Fprintf(&out, "    \"#/$defs/%s/oneOf\",\n", name)
		fmt.Fprintf(&out, "    UNION_BRANCH_IDENTITIES.%s,\n", name)
		out.WriteString("    CANONICAL_SCHEMA_DIGEST,\n")
		out.WriteString("  );\n\n")
		out.WriteString("  switch (match.branchIndex) {\n")
		for i, choice := range choices {
			choiceMap := asMap(choice)
			consts := getBranchConsts(choiceMap, defs)
			fmt.Fprintf(&out, "    case %d: {\n", i)
			if len(consts) > 0 {
				out.WriteString("      if (\n")
				out.WriteString("        extractedValue === null ||\n")
				out.WriteString("        typeof extractedValue !== \"object\" ||\n")
				out.WriteString("        Array.isArray(extractedValue)\n")
				for _, pName := range sortedKeys(consts) {
					cVal := consts[pName]
					fmt.Fprintf(&out, "        || (extractedValue as Record<string, unknown>)[%s] !== %s\n", jsonLiteral(pName), jsonLiteral(cVal))
				}
				out.WriteString("      ) {\n")
				out.WriteString("        throw new IngressError(\"UNION_DISCRIMINATOR_MISMATCH\", \"UNION_DISCRIMINATOR\", \"union const discriminator does not match the proved branch\");\n")
				out.WriteString("      }\n")
			}
			fmt.Fprintf(&out, "      return extractedValue as %s;\n", name)
			out.WriteString("    }\n")
		}
		out.WriteString("    default:\n")
		out.WriteString("      throw new IngressError(\"UNION_DISCRIMINATOR_MISMATCH\", \"UNION_DISCRIMINATOR\", \"validation proof branch index is invalid\");\n")
		out.WriteString("  }\n")
		out.WriteString("}\n\n")
	}

	return strings.TrimSuffix(out.String(), "\n")
}

func tsType(schema map[string]any, depth int) string {
	if schema == nil {
		return "unknown"
	}
	if ref, ok := schema["$ref"].(string); ok {
		return refName(ref)
	}
	if value, ok := schema["const"]; ok {
		return jsonLiteral(value)
	}
	if values := asSlice(schema["enum"]); len(values) > 0 {
		parts := make([]string, 0, len(values))
		for _, value := range values {
			parts = append(parts, jsonLiteral(value))
		}
		return strings.Join(parts, " | ")
	}
	if choices := asSlice(schema["oneOf"]); len(choices) > 0 {
		parts := make([]string, 0, len(choices))
		for _, choice := range choices {
			parts = append(parts, tsType(asMap(choice), depth))
		}
		return strings.Join(parts, " | ")
	}
	typeName, _ := schema["type"].(string)
	switch typeName {
	case "null":
		return "null"
	case "boolean":
		return "boolean"
	case "integer", "number":
		return "number"
	case "string":
		return "string"
	case "array":
		return "ReadonlyArray<" + tsType(asMap(schema["items"]), depth) + ">"
	case "object":
		properties := asMap(schema["properties"])
		additional := schema["additionalProperties"]
		if len(properties) == 0 {
			if additionalSchema := asMap(additional); additionalSchema != nil {
				return "Readonly<Record<string, " + tsType(additionalSchema, depth) + ">>"
			}
			if open, ok := additional.(bool); ok && open {
				return "Readonly<Record<string, unknown>>"
			}
			return "Readonly<Record<string, never>>"
		}
		required := map[string]bool{}
		for _, item := range asSlice(schema["required"]) {
			if text, ok := item.(string); ok {
				required[text] = true
			}
		}
		indent := strings.Repeat("  ", depth)
		childIndent := strings.Repeat("  ", depth+1)
		var out strings.Builder
		out.WriteString("Readonly<{\n")
		for _, property := range sortedKeys(properties) {
			out.WriteString(childIndent)
			out.WriteString(jsonLiteral(property))
			if !required[property] {
				out.WriteString("?")
			}
			out.WriteString(": ")
			out.WriteString(tsType(asMap(properties[property]), depth+1))
			out.WriteString(";\n")
		}
		out.WriteString(indent)
		out.WriteString("}>")
		return out.String()
	default:
		return "unknown"
	}
}

func generateGo(defs map[string]any, schemaDigest string) string {
	var out strings.Builder
	out.WriteString("// Code generated from protocol/schemas/tdev.v1.schema.json by tools/generate. DO NOT EDIT.\n\n")
	out.WriteString("package protocol\n\n")
	out.WriteString("import (\n")
	out.WriteString("\t\"encoding/json\"\n")
	out.WriteString("\tprotocolruntime \"github.com/humtr/tdev/protocol/runtime/go\"\n")
	out.WriteString(")\n\n")
	out.WriteString("const CanonicalSchemaDigest = " + jsonLiteral(schemaDigest) + "\n\n")

	for _, name := range sortedKeys(defs) {
		out.WriteString(goDecl(name, asMap(defs[name])))
		out.WriteString("\n")
	}

	for _, name := range sortedKeys(defs) {
		schema := asMap(defs[name])
		if choices := asSlice(schema["oneOf"]); len(choices) > 0 {
			out.WriteString(goUnionDomainHelpers(name, choices, defs))
			out.WriteString("\n")
		}
	}

	return out.String()
}

func goUnionDomainHelpers(name string, choices []any, defs map[string]any) string {
	var out strings.Builder
	domainName := name + "Domain"

	out.WriteString("type " + domainName + " struct {\n")
	out.WriteString("\tBranchIndex int\n")
	out.WriteString("\tBranchIdentity string\n")
	for i, choice := range choices {
		branchSchema := asMap(choice)
		typeName := fmt.Sprintf("%sBranch%d", name, i)
		fieldName := goFieldName(typeName)
		out.WriteString(fmt.Sprintf("\t%s *%s\n", fieldName, goType(branchSchema, false)))
	}
	out.WriteString("}\n\n")

	out.WriteString(fmt.Sprintf("func Convert%s(rootValue any, proof *protocolruntime.ValidationProofV1, expectedRootDefinition string, instancePointer string) (*%s, error) {\n", domainName, domainName))
	out.WriteString("\textracted, match, err := protocolruntime.VerifyProofAndExtract(\n")
	out.WriteString("\t\trootValue,\n")
	out.WriteString("\t\tproof,\n")
	out.WriteString("\t\texpectedRootDefinition,\n")
	out.WriteString("\t\tinstancePointer,\n")
	out.WriteString(fmt.Sprintf("\t\t\"#/$defs/%s/oneOf\",\n", name))
	out.WriteString("\t\t[]string{\n")
	for i := range choices {
		fmt.Fprintf(&out, "\t\t\t\"#/$defs/%s/oneOf/%d\",\n", name, i)
	}
	out.WriteString("\t\t},\n")
	out.WriteString("\t\tCanonicalSchemaDigest,\n")
	out.WriteString("\t)\n")
	out.WriteString("\tif err != nil {\n")
	out.WriteString("\t\treturn nil, err\n")
	out.WriteString("\t}\n")
	out.WriteString(fmt.Sprintf("\tdomain := &%s{BranchIndex: match.BranchIndex, BranchIdentity: match.BranchIdentity}\n", domainName))
	out.WriteString("\tswitch match.BranchIndex {\n")

	for i, choice := range choices {
		choiceMap := asMap(choice)
		consts := getBranchConsts(choiceMap, defs)
		bType := goType(choiceMap, false)
		fieldName := goFieldName(fmt.Sprintf("%sBranch%d", name, i))
		out.WriteString(fmt.Sprintf("\tcase %d:\n", i))
		if len(consts) > 0 {
			out.WriteString("\t\tobjMap, ok := extracted.(map[string]any)\n")
			out.WriteString("\t\tif !ok")
			for _, pName := range sortedKeys(consts) {
				cVal := consts[pName]
				fmt.Fprintf(&out, " || objMap[%s] != %s", jsonLiteral(pName), jsonLiteral(cVal))
			}
			out.WriteString(" {\n")
			out.WriteString("\t\t\treturn nil, &protocolruntime.IngressError{Code: \"UNION_DISCRIMINATOR_MISMATCH\", Reason: protocolruntime.ReasonUnionDiscriminator, Message: \"union const discriminator does not match the proved branch\"}\n")
			out.WriteString("\t\t}\n")
		}
		out.WriteString("\t\trawBytes, err := json.Marshal(extracted)\n")
		out.WriteString("\t\tif err != nil {\n")
		out.WriteString("\t\t\treturn nil, &protocolruntime.IngressError{Code: \"UNION_DISCRIMINATOR_MISMATCH\", Reason: protocolruntime.ReasonUnionDiscriminator, Message: \"proved union value cannot be encoded for domain conversion\"}\n")
		out.WriteString("\t\t}\n")
		out.WriteString(fmt.Sprintf("\t\tvar val %s\n", bType))
		out.WriteString("\t\tif err := json.Unmarshal(rawBytes, &val); err != nil {\n")
		out.WriteString("\t\t\treturn nil, &protocolruntime.IngressError{Code: \"UNION_DISCRIMINATOR_MISMATCH\", Reason: protocolruntime.ReasonUnionDiscriminator, Message: \"proved union value cannot be decoded into its domain branch\"}\n")
		out.WriteString("\t\t}\n")
		out.WriteString(fmt.Sprintf("\t\tdomain.%s = &val\n", fieldName))
	}

	out.WriteString("\tdefault:\n")
	out.WriteString("\t\treturn nil, &protocolruntime.IngressError{Code: \"UNION_DISCRIMINATOR_MISMATCH\", Reason: protocolruntime.ReasonUnionDiscriminator, Message: \"validation proof branch index is invalid\"}\n")
	out.WriteString("\t}\n")
	out.WriteString("\treturn domain, nil\n")
	out.WriteString("}\n")

	return out.String()
}

func goDecl(name string, schema map[string]any) string {
	if name == "JsonValue" {
		return "type JsonValue = any\n"
	}
	if values := asSlice(schema["enum"]); len(values) > 0 {
		var out strings.Builder
		out.WriteString("type ")
		out.WriteString(name)
		out.WriteString(" string\n\nconst (\n")
		for _, value := range values {
			text, ok := value.(string)
			if !ok {
				continue
			}
			out.WriteString("\t")
			out.WriteString(name)
			out.WriteString(identifier(text))
			out.WriteString(" ")
			out.WriteString(name)
			out.WriteString(" = ")
			out.WriteString(jsonLiteral(text))
			out.WriteString("\n")
		}
		out.WriteString(")\n")
		return out.String()
	}
	if choices := asSlice(schema["oneOf"]); len(choices) > 0 {
		return "type " + name + " json.RawMessage\n"
	}
	if ref, ok := schema["$ref"].(string); ok {
		return "type " + name + " = " + refName(ref) + "\n"
	}
	typeName, _ := schema["type"].(string)
	if typeName != "object" {
		return "type " + name + " " + goType(schema, false) + "\n"
	}
	properties := asMap(schema["properties"])
	if len(properties) == 0 {
		if additional := asMap(schema["additionalProperties"]); additional != nil {
			return "type " + name + " map[string]" + goType(additional, false) + "\n"
		}
		if open, ok := schema["additionalProperties"].(bool); ok && open {
			return "type " + name + " map[string]any\n"
		}
		return "type " + name + " struct{}\n"
	}
	required := map[string]bool{}
	for _, item := range asSlice(schema["required"]) {
		if text, ok := item.(string); ok {
			required[text] = true
		}
	}
	var out strings.Builder
	out.WriteString("type ")
	out.WriteString(name)
	out.WriteString(" struct {\n")
	for _, property := range sortedKeys(properties) {
		optional := !required[property]
		out.WriteString("\t")
		out.WriteString(goFieldName(property))
		out.WriteString(" ")
		out.WriteString(goType(asMap(properties[property]), optional))
		out.WriteString(" `json:\"")
		out.WriteString(property)
		if optional {
			out.WriteString(",omitempty")
		}
		out.WriteString("\"`\n")
	}
	out.WriteString("}\n")
	return out.String()
}

func goType(schema map[string]any, optional bool) string {
	if schema == nil {
		return "any"
	}
	var base string
	if ref, ok := schema["$ref"].(string); ok {
		base = refName(ref)
	} else if _, ok := schema["const"]; ok {
		switch schema["const"].(type) {
		case string:
			base = "string"
		case json.Number, float64:
			base = "int64"
		case bool:
			base = "bool"
		default:
			base = "any"
		}
	} else if len(asSlice(schema["enum"])) > 0 {
		base = "string"
	} else if len(asSlice(schema["oneOf"])) > 0 {
		base = "json.RawMessage"
	} else {
		typeName, _ := schema["type"].(string)
		switch typeName {
		case "null":
			base = "any"
		case "boolean":
			base = "bool"
		case "integer":
			base = "int64"
		case "number":
			base = "float64"
		case "string":
			base = "string"
		case "array":
			base = "[]" + goType(asMap(schema["items"]), false)
		case "object":
			properties := asMap(schema["properties"])
			if len(properties) == 0 {
				if additional := asMap(schema["additionalProperties"]); additional != nil {
					base = "map[string]" + goType(additional, false)
				} else if open, ok := schema["additionalProperties"].(bool); ok && open {
					base = "map[string]any"
				} else {
					base = "struct{}"
				}
			} else {
				base = inlineGoStruct(schema)
			}
		default:
			base = "any"
		}
	}
	if optional && base != "any" && base != "json.RawMessage" && !strings.HasPrefix(base, "[]") && !strings.HasPrefix(base, "map[") {
		return "*" + base
	}
	return base
}

func inlineGoStruct(schema map[string]any) string {
	properties := asMap(schema["properties"])
	required := map[string]bool{}
	for _, item := range asSlice(schema["required"]) {
		if text, ok := item.(string); ok {
			required[text] = true
		}
	}
	var out strings.Builder
	out.WriteString("struct { ")
	for _, property := range sortedKeys(properties) {
		optional := !required[property]
		out.WriteString(goFieldName(property))
		out.WriteString(" ")
		out.WriteString(goType(asMap(properties[property]), optional))
		out.WriteString(" `json:\"")
		out.WriteString(property)
		if optional {
			out.WriteString(",omitempty")
		}
		out.WriteString("\"`; ")
	}
	out.WriteString("}")
	return out.String()
}

func goFieldName(value string) string {
	parts := splitIdentifier(value)
	var out strings.Builder
	for _, part := range parts {
		switch strings.ToLower(part) {
		case "id":
			out.WriteString("ID")
		case "sha256":
			out.WriteString("SHA256")
		default:
			runes := []rune(part)
			if len(runes) == 0 {
				continue
			}
			runes[0] = unicode.ToUpper(runes[0])
			out.WriteString(string(runes))
		}
	}
	return out.String()
}

func identifier(value string) string {
	name := goFieldName(value)
	if name == "" {
		return "Value"
	}
	if unicode.IsDigit([]rune(name)[0]) {
		return "Value" + name
	}
	return name
}

func splitIdentifier(value string) []string {
	var parts []string
	var current []rune
	for index, r := range []rune(value) {
		if r == '_' || r == '-' || r == '.' || r == ' ' {
			if len(current) > 0 {
				parts = append(parts, string(current))
				current = nil
			}
			continue
		}
		if index > 0 && unicode.IsUpper(r) && len(current) > 0 {
			parts = append(parts, string(current))
			current = nil
		}
		current = append(current, r)
	}
	if len(current) > 0 {
		parts = append(parts, string(current))
	}
	return parts
}

func generateTypeScriptProfile(profile protocolruntime.ReleaseProfile, digest string) string {
	raw, err := json.MarshalIndent(profile, "", "  ")
	must(err)
	return "// Code generated from protocol/profiles/tdev.m1.release-profile.json by tools/generate. DO NOT EDIT.\n\n" +
		"import type { ReleaseProfile } from \"./profile.ts\";\n\n" +
		"export const GENERATED_M1_RELEASE_PROFILE = " + string(raw) + " as const satisfies ReleaseProfile;\n\n" +
		"export const GENERATED_M1_RELEASE_PROFILE_DIGEST = \"" + digest + "\";\n"
}

func generateGoProfile(profile protocolruntime.ReleaseProfile, digest string) string {
	var out strings.Builder
	out.WriteString("// Code generated from protocol/profiles/tdev.m1.release-profile.json by tools/generate. DO NOT EDIT.\n\n")
	out.WriteString("package protocolruntime\n\n")
	fmt.Fprintf(&out, "const M1ReleaseProfileDigest = %s\n\n", jsonLiteral(digest))
	out.WriteString("var generatedM1ReleaseProfile = ReleaseProfile{\n")
	fmt.Fprintf(&out, "\tProfileVersion: %d,\n", profile.ProfileVersion)
	fmt.Fprintf(&out, "\tProfileID: %s,\n", jsonLiteral(profile.ProfileID))
	fmt.Fprintf(&out, "\tIngress: IngressPolicy{MaxBodyBytes: %d, MaxJSONDepth: %d, MaxJSONTokens: %d, MaxObjectMembers: %d, MaxArrayItems: %d, MaxStringCodePoints: %d, MaxNumberDigits: %d, MaxExponentMagnitude: %d},\n", profile.Ingress.MaxBodyBytes, profile.Ingress.MaxJSONDepth, profile.Ingress.MaxJSONTokens, profile.Ingress.MaxObjectMembers, profile.Ingress.MaxArrayItems, profile.Ingress.MaxStringCodePoints, profile.Ingress.MaxNumberDigits, profile.Ingress.MaxExponentMagnitude)
	fmt.Fprintf(&out, "\tOutput: OutputPolicy{MaxMutationResponseBytes: %d, MaxRenderedTextBytes: %d, MaxArtifactChunkBytes: %d},\n", profile.Output.MaxMutationResponseBytes, profile.Output.MaxRenderedTextBytes, profile.Output.MaxArtifactChunkBytes)
	fmt.Fprintf(&out, "\tPagination: PaginationPolicy{DefaultPageSize: %d, MaxPageSize: %d, CursorTTLSeconds: %d},\n", profile.Pagination.DefaultPageSize, profile.Pagination.MaxPageSize, profile.Pagination.CursorTTLSeconds)
	fmt.Fprintf(&out, "\tQuota: QuotaPolicy{MaxTasksPerCase: %d, MaxAttemptsPerTask: %d, MaxEventsPerCase: %d},\n", profile.Quota.MaxTasksPerCase, profile.Quota.MaxAttemptsPerTask, profile.Quota.MaxEventsPerCase)
	fmt.Fprintf(&out, "\tRetention: RetentionPolicy{R2OrphanGraceDays: %d, EventCompaction: %s, MutationReceiptRetention: %s, ReferencedEvidenceCleanup: %s},\n", profile.Retention.R2OrphanGraceDays, jsonLiteral(profile.Retention.EventCompaction), jsonLiteral(profile.Retention.MutationReceiptRetention), jsonLiteral(profile.Retention.ReferencedEvidenceCleanup))
	out.WriteString("}\n")
	return out.String()
}
