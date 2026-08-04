package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"go/format"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"unicode"
)

const schemaPath = "protocol/schemas/tdev.v1.schema.json"

var check = flag.Bool("check", false, "fail when generated files differ")

type schemaDocument struct {
	Defs map[string]any `json:"$defs"`
}

func main() {
	flag.Parse()
	raw, err := os.ReadFile(schemaPath)
	must(err)
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	var doc schemaDocument
	must(dec.Decode(&doc))
	if len(doc.Defs) == 0 {
		panic("schema has no $defs")
	}
	validateSchema(doc.Defs)

	ts := generateTypeScript(doc.Defs)
	goSource := generateGo(doc.Defs)
	formatted, err := format.Source([]byte(goSource))
	must(err)

	writeOrCheck("protocol/generated/typescript/types.ts", []byte(ts))
	writeOrCheck("protocol/generated/go/types.go", formatted)
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

func validateSchema(defs map[string]any) {
	var walk func(value any, path string)
	walk = func(value any, path string) {
		switch current := value.(type) {
		case map[string]any:
			if ref, ok := current["$ref"].(string); ok {
				const prefix = "#/$defs/"
				if !strings.HasPrefix(ref, prefix) {
					panic("unsupported external $ref at " + path + ": " + ref)
				}
				if _, exists := defs[strings.TrimPrefix(ref, prefix)]; !exists {
					panic("unresolved $ref at " + path + ": " + ref)
				}
			}
			if current["type"] == "object" && len(asMap(current["properties"])) > 0 {
				strict, ok := current["additionalProperties"].(bool)
				if !ok || strict {
					panic("canonical object is not strict at " + path)
				}
			}
			for key, child := range current {
				walk(child, path+"/"+key)
			}
		case []any:
			for index, child := range current {
				walk(child, fmt.Sprintf("%s/%d", path, index))
			}
		}
	}
	for _, name := range sortedKeys(defs) {
		walk(defs[name], "#/$defs/"+name)
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

func generateTypeScript(defs map[string]any) string {
	var out strings.Builder
	out.WriteString("// Code generated from protocol/schemas/tdev.v1.schema.json by tools/generate. DO NOT EDIT.\n\n")
	for _, name := range sortedKeys(defs) {
		out.WriteString("export type ")
		out.WriteString(name)
		out.WriteString(" = ")
		out.WriteString(tsType(asMap(defs[name]), 0))
		out.WriteString(";\n\n")
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

func generateGo(defs map[string]any) string {
	var out strings.Builder
	out.WriteString("// Code generated from protocol/schemas/tdev.v1.schema.json by tools/generate. DO NOT EDIT.\n\n")
	out.WriteString("package protocol\n\n")
	out.WriteString("import \"encoding/json\"\n\n")
	for _, name := range sortedKeys(defs) {
		out.WriteString(goDecl(name, asMap(defs[name])))
		out.WriteString("\n")
	}
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
		return "type " + name + " map[string]never\n"
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
				} else {
					base = "map[string]any"
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
