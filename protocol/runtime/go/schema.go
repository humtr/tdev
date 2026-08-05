package protocolruntime

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
)

type SchemaDocument struct {
	Schema string                    `json:"$schema,omitempty"`
	ID     string                    `json:"$id,omitempty"`
	Title  string                    `json:"title,omitempty"`
	Defs   map[string]map[string]any `json:"$defs"`
}

type UnionProofBranchV1 struct {
	InstancePointer string `json:"instancePointer"`
	SchemaPointer   string `json:"schemaPointer"`
	BranchIndex     int    `json:"branchIndex"`
	BranchIdentity  string `json:"branchIdentity"`
}

type ValidationProofV1 struct {
	SchemaDigest    string               `json:"schemaDigest"`
	RootDefinition  string               `json:"rootDefinition"`
	CanonicalDigest string               `json:"canonicalDigest"`
	Unions          []UnionProofBranchV1 `json:"unions"`
}

type Validator struct {
	root         SchemaDocument
	schemaDigest string
}

func ParseSchema(raw []byte) (*Validator, error) {
	if !utf8.Valid(raw) {
		return nil, fmt.Errorf("schema JSON is not valid UTF-8")
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	decoder.DisallowUnknownFields()
	var document SchemaDocument
	if err := decoder.Decode(&document); err != nil {
		return nil, err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return nil, fmt.Errorf("unexpected trailing schema JSON")
		}
		return nil, fmt.Errorf("invalid trailing schema JSON: %w", err)
	}
	if err := validateSchemaDocument(document); err != nil {
		return nil, err
	}
	var documentAny any
	decoderAny := json.NewDecoder(bytes.NewReader(raw))
	decoderAny.UseNumber()
	if err := decoderAny.Decode(&documentAny); err != nil {
		return nil, fmt.Errorf("failed to decode schema JSON for digest: %w", err)
	}
	digest, err := TypedDigest("tdev.schema.v1", documentAny)
	if err != nil {
		return nil, fmt.Errorf("failed to compute schema digest: %w", err)
	}
	return &Validator{root: document, schemaDigest: digest}, nil
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

func (validator *Validator) SchemaDigest() string {
	return validator.schemaDigest
}

func (validator *Validator) ValidateDefinition(name string, value any) []string {
	_, errors := validator.ValidateDefinitionWithProof(name, value)
	return errors
}

func schemaErrorDetail(message string) ProtocolErrorDetail {
	if strings.Contains(message, ": ONE_OF_NO_MATCH:") {
		return ProtocolErrorDetail{Code: "ONE_OF_NO_MATCH", Reason: ReasonOneOfNoMatch, InstancePointer: "$"}
	}
	if strings.Contains(message, ": ONE_OF_MULTIPLE_MATCH:") {
		return ProtocolErrorDetail{Code: "ONE_OF_MULTIPLE_MATCH", Reason: ReasonOneOfMultipleMatch, InstancePointer: "$"}
	}
	return ProtocolErrorDetail{Code: "INPUT_SCHEMA_INVALID", Reason: ReasonSchema, InstancePointer: "$"}
}

func (validator *Validator) ValidateDefinitionWithProofDetails(name string, value any) (*ValidationProofV1, []ProtocolErrorDetail) {
	proof, messages := validator.validateDefinitionWithProofStrings(name, value)
	details := make([]ProtocolErrorDetail, 0, len(messages))
	for _, message := range messages {
		details = append(details, schemaErrorDetail(message))
	}
	return proof, details
}

func (validator *Validator) ValidateDefinitionWithProof(name string, value any) (*ValidationProofV1, []string) {
	return validator.validateDefinitionWithProofStrings(name, value)
}

func (validator *Validator) validateDefinitionWithProofStrings(name string, value any) (*ValidationProofV1, []string) {
	definition, found := validator.root.Defs[name]
	if !found {
		return nil, []string{"unknown definition: " + name}
	}
	var unions []UnionProofBranchV1
	errors := validator.validateWithProof(definition, value, "$", "#/$defs/"+name, map[string]bool{}, &unions)
	if len(errors) > 0 {
		return nil, errors
	}
	semanticErrs := SemanticErrors(name, value)
	if len(semanticErrs) > 0 {
		return nil, semanticErrs
	}
	canonicalDigest, err := TypedDigest("tdev.validation-proof.v1", value)
	if err != nil {
		return nil, []string{"failed to compute canonical digest for proof: " + err.Error()}
	}
	proof := &ValidationProofV1{
		SchemaDigest:    validator.schemaDigest,
		RootDefinition:  name,
		CanonicalDigest: canonicalDigest,
		Unions:          unions,
	}
	return proof, nil
}

func validateSchemaDocument(document SchemaDocument) error {
	if len(document.Defs) == 0 {
		return fmt.Errorf("schema has no $defs")
	}
	for name, definition := range document.Defs {
		if definition == nil {
			return fmt.Errorf("definition is not a schema: %s", name)
		}
		if err := validateSchemaNode(document.Defs, definition, "#/$defs/"+name); err != nil {
			return err
		}
	}
	visiting := map[string]bool{}
	visited := map[string]bool{}
	var visitDefinition func(string) error
	visitDefinition = func(name string) error {
		if visited[name] {
			return nil
		}
		if visiting[name] {
			return fmt.Errorf("unproductive same-instance $ref cycle: %s", name)
		}
		definition, found := document.Defs[name]
		if !found || definition == nil {
			return fmt.Errorf("definition is not a schema: %s", name)
		}
		visiting[name] = true
		for _, referenced := range sameInstanceSchemaReferences(definition) {
			if err := visitDefinition(referenced); err != nil {
				return err
			}
		}
		delete(visiting, name)
		visited[name] = true
		return nil
	}
	for name := range document.Defs {
		if err := visitDefinition(name); err != nil {
			return err
		}
	}
	return nil
}

func sameInstanceSchemaReferences(schema map[string]any) []string {
	if reference, ok := schema["$ref"].(string); ok {
		return []string{strings.TrimPrefix(reference, "#/$defs/")}
	}
	choices, ok := schema["oneOf"].([]any)
	if !ok {
		return nil
	}
	var references []string
	for _, choice := range choices {
		if branch, ok := choice.(map[string]any); ok {
			references = append(references, sameInstanceSchemaReferences(branch)...)
		}
	}
	return references
}

func validateSchemaNode(defs map[string]map[string]any, schema map[string]any, path string) error {
	for key := range schema {
		if !supportedSchemaKeywords[key] {
			return fmt.Errorf("unsupported schema keyword at %s: %s", path, key)
		}
	}

	if rawReference, exists := schema["$ref"]; exists {
		if len(schema) != 1 {
			return fmt.Errorf("$ref siblings are unsupported at %s", path)
		}
		reference, ok := rawReference.(string)
		const prefix = "#/$defs/"
		if !ok || !strings.HasPrefix(reference, prefix) {
			return fmt.Errorf("unsupported external $ref at %s: %v", path, rawReference)
		}
		if _, found := defs[strings.TrimPrefix(reference, prefix)]; !found {
			return fmt.Errorf("unresolved $ref at %s: %s", path, reference)
		}
		return nil
	}

	if rawChoices, exists := schema["oneOf"]; exists {
		if len(schema) != 1 {
			return fmt.Errorf("oneOf siblings are unsupported at %s", path)
		}
		choices, ok := rawChoices.([]any)
		if !ok || len(choices) == 0 {
			return fmt.Errorf("oneOf must contain a branch at %s", path)
		}
		for index, choice := range choices {
			branch, ok := choice.(map[string]any)
			if !ok {
				return fmt.Errorf("oneOf branch is not a schema at %s/%d", path, index)
			}
			if err := validateSchemaNode(defs, branch, fmt.Sprintf("%s/oneOf/%d", path, index)); err != nil {
				return err
			}
		}
		return nil
	}

	typeName := ""
	if rawType, exists := schema["type"]; exists {
		value, ok := rawType.(string)
		if !ok || !supportedSchemaTypes[value] {
			return fmt.Errorf("unsupported schema type at %s: %v", path, rawType)
		}
		typeName = value
	}
	_, hasConst := schema["const"]
	_, hasEnum := schema["enum"]
	if typeName == "" && !hasConst && !hasEnum {
		return fmt.Errorf("schema has no executable keyword at %s", path)
	}

	if value, exists := schema["const"]; exists {
		if _, err := Canonicalize(value); err != nil {
			return fmt.Errorf("invalid protocol value at %s/const: %w", path, err)
		}
	}
	if rawEnum, exists := schema["enum"]; exists {
		values, ok := rawEnum.([]any)
		if !ok || len(values) == 0 {
			return fmt.Errorf("enum must contain a value at %s", path)
		}
		seen := map[string]bool{}
		for index, value := range values {
			canonical, err := Canonicalize(value)
			if err != nil {
				return fmt.Errorf("invalid protocol value at %s/enum/%d: %w", path, index, err)
			}
			key := string(canonical)
			if seen[key] {
				return fmt.Errorf("enum contains a duplicate value at %s", path)
			}
			seen[key] = true
		}
	}

	if err := rejectMisplacedSchemaKeywords(schema, []string{"minLength", "maxLength", "pattern", "format"}, typeName == "string", path); err != nil {
		return err
	}
	if err := rejectMisplacedSchemaKeywords(schema, []string{"minimum", "maximum"}, typeName == "integer" || typeName == "number", path); err != nil {
		return err
	}
	if err := rejectMisplacedSchemaKeywords(schema, []string{"items", "minItems", "maxItems", "uniqueItems"}, typeName == "array", path); err != nil {
		return err
	}
	if err := rejectMisplacedSchemaKeywords(schema, []string{"properties", "required", "additionalProperties"}, typeName == "object", path); err != nil {
		return err
	}

	if typeName == "string" {
		minimum, hasMinimum, err := schemaConstraintInteger(schema, "minLength", path, true)
		if err != nil {
			return err
		}
		maximum, hasMaximum, err := schemaConstraintInteger(schema, "maxLength", path, true)
		if err != nil {
			return err
		}
		if hasMinimum && hasMaximum && minimum > maximum {
			return fmt.Errorf("minLength exceeds maxLength at %s", path)
		}
		if rawPattern, exists := schema["pattern"]; exists {
			pattern, ok := rawPattern.(string)
			if !ok {
				return fmt.Errorf("schema pattern is not a string at %s", path)
			}
			if _, err := regexp.Compile(pattern); err != nil {
				return fmt.Errorf("invalid schema pattern at %s: %w", path, err)
			}
		}
		if rawFormat, exists := schema["format"]; exists {
			format, ok := rawFormat.(string)
			if !ok || format != "date-time" {
				return fmt.Errorf("unsupported string format at %s: %v", path, rawFormat)
			}
		}
	}

	if typeName == "integer" || typeName == "number" {
		minimum, hasMinimum, err := schemaConstraintInteger(schema, "minimum", path, false)
		if err != nil {
			return err
		}
		maximum, hasMaximum, err := schemaConstraintInteger(schema, "maximum", path, false)
		if err != nil {
			return err
		}
		if hasMinimum && hasMaximum && minimum > maximum {
			return fmt.Errorf("minimum exceeds maximum at %s", path)
		}
	}

	if typeName == "array" {
		minimum, hasMinimum, err := schemaConstraintInteger(schema, "minItems", path, true)
		if err != nil {
			return err
		}
		maximum, hasMaximum, err := schemaConstraintInteger(schema, "maxItems", path, true)
		if err != nil {
			return err
		}
		if hasMinimum && hasMaximum && minimum > maximum {
			return fmt.Errorf("minItems exceeds maxItems at %s", path)
		}
		if rawUnique, exists := schema["uniqueItems"]; exists {
			if _, ok := rawUnique.(bool); !ok {
				return fmt.Errorf("uniqueItems is not a boolean at %s", path)
			}
		}
		if rawItems, exists := schema["items"]; exists {
			items, ok := rawItems.(map[string]any)
			if !ok {
				return fmt.Errorf("items is not a schema at %s", path)
			}
			if err := validateSchemaNode(defs, items, path+"/items"); err != nil {
				return err
			}
		}
	}

	if typeName == "object" {
		var properties map[string]any
		if rawProperties, exists := schema["properties"]; exists {
			var ok bool
			properties, ok = rawProperties.(map[string]any)
			if !ok {
				return fmt.Errorf("schema properties are not an object at %s", path)
			}
			for name, rawProperty := range properties {
				property, ok := rawProperty.(map[string]any)
				if !ok {
					return fmt.Errorf("property is not a schema at %s/properties/%s", path, name)
				}
				if err := validateSchemaNode(defs, property, path+"/properties/"+name); err != nil {
					return err
				}
			}
		}
		if rawRequired, exists := schema["required"]; exists {
			values, ok := rawRequired.([]any)
			if !ok {
				return fmt.Errorf("required is not an array at %s", path)
			}
			seen := map[string]bool{}
			for _, value := range values {
				property, ok := value.(string)
				if !ok {
					return fmt.Errorf("required contains a non-string at %s", path)
				}
				if seen[property] {
					return fmt.Errorf("required contains a duplicate property at %s: %s", path, property)
				}
				if properties == nil {
					return fmt.Errorf("required property is not declared at %s: %s", path, property)
				}
				if _, found := properties[property]; !found {
					return fmt.Errorf("required property is not declared at %s: %s", path, property)
				}
				seen[property] = true
			}
		}
		if len(properties) > 0 {
			strict, ok := schema["additionalProperties"].(bool)
			if !ok || strict {
				return fmt.Errorf("canonical object is not strict at %s", path)
			}
		}
		if rawAdditional, exists := schema["additionalProperties"]; exists {
			switch additional := rawAdditional.(type) {
			case bool:
			case map[string]any:
				if err := validateSchemaNode(defs, additional, path+"/additionalProperties"); err != nil {
					return err
				}
			default:
				return fmt.Errorf("additionalProperties is not boolean or schema at %s", path)
			}
		}
	}
	return nil
}

func rejectMisplacedSchemaKeywords(schema map[string]any, keys []string, allowed bool, path string) error {
	if allowed {
		return nil
	}
	for _, key := range keys {
		if _, exists := schema[key]; exists {
			return fmt.Errorf("%s is not valid for schema type at %s", key, path)
		}
	}
	return nil
}

func schemaConstraintInteger(schema map[string]any, key, path string, nonNegative bool) (int64, bool, error) {
	value, exists := schema[key]
	if !exists {
		return 0, false, nil
	}
	integer, ok := schemaNumber(value)
	if !ok || nonNegative && integer < 0 {
		qualifier := ""
		if nonNegative {
			qualifier = "non-negative "
		}
		return 0, false, fmt.Errorf("%s is not a %ssafe integer at %s", key, qualifier, path)
	}
	return integer, true, nil
}

var tdevDateTimePattern = regexp.MustCompile(`^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(\.[0-9]{1,9})?Z$`)

func isTdevDateTime(value string) bool {
	matches := tdevDateTimePattern.FindStringSubmatch(value)
	if matches == nil {
		return false
	}
	parts := make([]int, 6)
	for index := range parts {
		parsed, err := strconv.Atoi(matches[index+1])
		if err != nil {
			return false
		}
		parts[index] = parsed
	}
	year, month, day := parts[0], parts[1], parts[2]
	hour, minute, second := parts[3], parts[4], parts[5]
	if month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59 {
		return false
	}
	leap := year%4 == 0 && (year%100 != 0 || year%400 == 0)
	days := [...]int{31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31}
	if leap {
		days[1] = 29
	}
	return day >= 1 && day <= days[month-1]
}

func ParseJSON(raw []byte) (any, error) {
	if !utf8.Valid(raw) {
		return nil, fmt.Errorf("protocol JSON is not valid UTF-8")
	}
	if err := validateJSONUnicodeEscapes(raw); err != nil {
		return nil, err
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return nil, err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return nil, fmt.Errorf("unexpected trailing JSON")
		}
		return nil, fmt.Errorf("invalid trailing JSON: %w", err)
	}
	return value, nil
}

func validateJSONUnicodeEscapes(raw []byte) error {
	inString := false
	for index := 0; index < len(raw); index++ {
		current := raw[index]
		if !inString {
			if current == '"' {
				inString = true
			}
			continue
		}
		if current == '"' {
			inString = false
			continue
		}
		if current != '\\' {
			continue
		}
		if index+1 >= len(raw) {
			return fmt.Errorf("incomplete JSON escape")
		}
		if raw[index+1] != 'u' {
			index++
			continue
		}
		unit, err := parseHexCodeUnit(raw, index+2)
		if err != nil {
			return err
		}
		if unit >= 0xd800 && unit <= 0xdbff {
			if index+12 > len(raw) || raw[index+6] != '\\' || raw[index+7] != 'u' {
				return fmt.Errorf("unpaired high surrogate in JSON string")
			}
			low, err := parseHexCodeUnit(raw, index+8)
			if err != nil || low < 0xdc00 || low > 0xdfff {
				return fmt.Errorf("unpaired high surrogate in JSON string")
			}
			index += 11
			continue
		}
		if unit >= 0xdc00 && unit <= 0xdfff {
			return fmt.Errorf("unpaired low surrogate in JSON string")
		}
		index += 5
	}
	return nil
}

func parseHexCodeUnit(raw []byte, start int) (uint16, error) {
	if start+4 > len(raw) {
		return 0, fmt.Errorf("incomplete JSON unicode escape")
	}
	var value uint16
	for _, current := range raw[start : start+4] {
		value <<= 4
		switch {
		case current >= '0' && current <= '9':
			value += uint16(current - '0')
		case current >= 'a' && current <= 'f':
			value += uint16(current-'a') + 10
		case current >= 'A' && current <= 'F':
			value += uint16(current-'A') + 10
		default:
			return 0, fmt.Errorf("invalid JSON unicode escape")
		}
	}
	return value, nil
}

func (validator *Validator) resolve(reference string) (map[string]any, bool) {
	const prefix = "#/$defs/"
	if !strings.HasPrefix(reference, prefix) {
		return nil, false
	}
	definition, ok := validator.root.Defs[strings.TrimPrefix(reference, prefix)]
	return definition, ok
}

func (validator *Validator) validateWithProof(schema map[string]any, value any, instancePointer, schemaPointer string, stack map[string]bool, unions *[]UnionProofBranchV1) []string {
	if reference, ok := schema["$ref"].(string); ok {
		resolved, found := validator.resolve(reference)
		if !found {
			return []string{instancePointer + ": unresolved reference " + reference}
		}
		key := reference + ":" + instancePointer
		if stack[key] {
			return nil
		}
		next := cloneSet(stack)
		next[key] = true
		return validator.validateWithProof(resolved, value, instancePointer, reference, next, unions)
	}

	if constant, ok := schema["const"]; ok && !equalJSON(constant, value) {
		return []string{instancePointer + ": value does not equal const"}
	}
	if enumValues := asSlice(schema["enum"]); len(enumValues) > 0 {
		matched := false
		for _, candidate := range enumValues {
			if equalJSON(candidate, value) {
				matched = true
				break
			}
		}
		if !matched {
			return []string{instancePointer + ": value is not in enum"}
		}
	}
	if choices := asSlice(schema["oneOf"]); len(choices) > 0 {
		oneOfPointer := schemaPointer + "/oneOf"
		var matchingIndices []int
		var branchUnionsList [][]UnionProofBranchV1

		for index, choice := range choices {
			if candidate, ok := choice.(map[string]any); ok {
				var branchUnions []UnionProofBranchV1
				errs := validator.validateWithProof(candidate, value, instancePointer, fmt.Sprintf("%s/%d", oneOfPointer, index), cloneSet(stack), &branchUnions)
				if len(errs) == 0 {
					matchingIndices = append(matchingIndices, index)
					branchUnionsList = append(branchUnionsList, branchUnions)
				}
			}
		}

		if len(matchingIndices) == 0 {
			return []string{fmt.Sprintf("%s: ONE_OF_NO_MATCH: no oneOf branch matched at %s", instancePointer, instancePointer)}
		}
		if len(matchingIndices) > 1 {
			return []string{fmt.Sprintf("%s: ONE_OF_MULTIPLE_MATCH: %d oneOf branches matched at %s", instancePointer, len(matchingIndices), instancePointer)}
		}

		matchIndex := matchingIndices[0]
		branchIdentity := fmt.Sprintf("%s/%d", oneOfPointer, matchIndex)
		*unions = append(*unions, UnionProofBranchV1{
			InstancePointer: instancePointer,
			SchemaPointer:   oneOfPointer,
			BranchIndex:     matchIndex,
			BranchIdentity:  branchIdentity,
		})
		*unions = append(*unions, branchUnionsList[0]...)
		return nil
	}

	typeName, _ := schema["type"].(string)
	switch typeName {
	case "null":
		if value == nil {
			return nil
		}
		return []string{instancePointer + ": expected null"}
	case "boolean":
		if _, ok := value.(bool); ok {
			return nil
		}
		return []string{instancePointer + ": expected boolean"}
	case "integer":
		integer, ok := safeInteger(value)
		if !ok {
			return []string{instancePointer + ": expected safe integer"}
		}
		if minimum, ok := schemaNumber(schema["minimum"]); ok && integer < minimum {
			return []string{instancePointer + ": below minimum"}
		}
		if maximum, ok := schemaNumber(schema["maximum"]); ok && integer > maximum {
			return []string{instancePointer + ": above maximum"}
		}
		return nil
	case "number":
		integer, ok := safeInteger(value)
		if !ok {
			return []string{instancePointer + ": expected finite protocol number"}
		}
		if minimum, ok := schemaNumber(schema["minimum"]); ok && integer < minimum {
			return []string{instancePointer + ": below minimum"}
		}
		if maximum, ok := schemaNumber(schema["maximum"]); ok && integer > maximum {
			return []string{instancePointer + ": above maximum"}
		}
		return nil
	case "string":
		text, ok := value.(string)
		if !ok {
			return []string{instancePointer + ": expected string"}
		}
		if minimum, ok := schemaInt(schema["minLength"]); ok && len([]rune(text)) < minimum {
			return []string{instancePointer + ": shorter than minLength"}
		}
		if maximum, ok := schemaInt(schema["maxLength"]); ok && len([]rune(text)) > maximum {
			return []string{instancePointer + ": longer than maxLength"}
		}
		if pattern, ok := schema["pattern"].(string); ok {
			compiled, err := regexp.Compile(pattern)
			if err != nil {
				return []string{instancePointer + ": invalid schema pattern: " + err.Error()}
			}
			if !compiled.MatchString(text) {
				return []string{instancePointer + ": pattern mismatch"}
			}
		}
		if format, _ := schema["format"].(string); format == "date-time" && !isTdevDateTime(text) {
			return []string{instancePointer + ": invalid date-time"}
		}
		return nil
	case "array":
		items, ok := value.([]any)
		if !ok {
			return []string{instancePointer + ": expected array"}
		}
		var errors []string
		if minimum, ok := schemaInt(schema["minItems"]); ok && len(items) < minimum {
			errors = append(errors, instancePointer+": fewer than minItems")
		}
		if maximum, ok := schemaInt(schema["maxItems"]); ok && len(items) > maximum {
			errors = append(errors, instancePointer+": more than maxItems")
		}
		if unique, _ := schema["uniqueItems"].(bool); unique {
			seen := map[string]bool{}
			for _, item := range items {
				canonical, err := Canonicalize(item)
				if err != nil {
					errors = append(errors, instancePointer+": invalid unique item")
					break
				}
				key := string(canonical)
				if seen[key] {
					errors = append(errors, instancePointer+": duplicate array item")
					break
				}
				seen[key] = true
			}
		}
		if itemSchema, ok := schema["items"].(map[string]any); ok {
			itemSchemaPointer := schemaPointer + "/items"
			for index, item := range items {
				errors = append(errors, validator.validateWithProof(itemSchema, item, fmt.Sprintf("%s[%d]", instancePointer, index), itemSchemaPointer, cloneSet(stack), unions)...)
			}
		}
		return errors
	case "object":
		object, ok := value.(map[string]any)
		if !ok {
			return []string{instancePointer + ": expected object"}
		}
		var errors []string
		properties, _ := schema["properties"].(map[string]any)
		required := map[string]bool{}
		for _, item := range asSlice(schema["required"]) {
			if property, ok := item.(string); ok {
				required[property] = true
			}
		}
		for property := range required {
			if _, exists := object[property]; !exists {
				errors = append(errors, instancePointer+"."+property+": required property missing")
			}
		}
		for property, item := range object {
			if propertySchema, ok := properties[property].(map[string]any); ok {
				errors = append(errors, validator.validateWithProof(propertySchema, item, instancePointer+"."+property, schemaPointer+"/properties/"+property, cloneSet(stack), unions)...)
				continue
			}
			if additional, ok := schema["additionalProperties"].(bool); ok && !additional {
				errors = append(errors, instancePointer+"."+property+": additional property rejected")
				continue
			}
			if additionalSchema, ok := schema["additionalProperties"].(map[string]any); ok {
				errors = append(errors, validator.validateWithProof(additionalSchema, item, instancePointer+"."+property, schemaPointer+"/additionalProperties", cloneSet(stack), unions)...)
			}
		}
		sort.Strings(errors)
		return errors
	case "":
		return nil
	default:
		return []string{instancePointer + ": unsupported schema type " + typeName}
	}
}

func ValidateContract(validator *Validator, definition string, value any) []string {
	return validator.ValidateDefinition(definition, value)
}

func SemanticErrors(definition string, value any) []string {
	object, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	if definition == "NewCaseTargetGrant" {
		return semanticGrantErrors(object, "$")
	}
	if definition == "CaseTargetGrant" {
		errors := semanticGrantErrors(object, "$")
		errors = append(errors, storedDigestErrors(object, "grantDigest", "tdev.case-target-grant.v1", "$")...)
		sort.Strings(errors)
		return errors
	}
	if definition != "NewCaseContractInput" && definition != "CaseContract" {
		return nil
	}
	var errors []string
	criteria := recordSlice(object["acceptanceCriteria"])
	requirements := recordSlice(object["verificationRequirements"])
	clauses := append(recordSlice(object["nonGoals"]), recordSlice(object["constraints"])...)
	grants := recordSlice(object["targetGrants"])

	for _, duplicate := range duplicateValues(fieldValues(criteria, "criterionId")) {
		errors = append(errors, "$.acceptanceCriteria: duplicate criterionId "+duplicate)
	}
	for _, duplicate := range duplicateValues(fieldValues(requirements, "requirementId")) {
		errors = append(errors, "$.verificationRequirements: duplicate requirementId "+duplicate)
	}
	for _, duplicate := range duplicateValues(fieldValues(clauses, "clauseId")) {
		errors = append(errors, "$.clauses: duplicate clauseId "+duplicate)
	}
	criteriaSet := map[string]bool{}
	for _, criterion := range criteria {
		if identifier, ok := criterion["criterionId"].(string); ok {
			criteriaSet[identifier] = true
		}
	}
	for index, requirement := range requirements {
		for _, identifier := range asSlice(requirement["criterionIds"]) {
			if text, ok := identifier.(string); ok && !criteriaSet[text] {
				errors = append(errors, fmt.Sprintf("$.verificationRequirements[%d]: unknown criterionId %s", index, text))
			}
		}
	}
	if definition == "CaseContract" {
		for _, duplicate := range duplicateValues(fieldValues(grants, "grantId")) {
			errors = append(errors, "$.targetGrants: duplicate grantId "+duplicate)
		}
	} else {
		canonicalGrants := make([]string, 0, len(grants))
		for _, grant := range grants {
			canonical, err := Canonicalize(grant)
			if err == nil {
				canonicalGrants = append(canonicalGrants, string(canonical))
			}
		}
		for _, duplicate := range duplicateValues(canonicalGrants) {
			errors = append(errors, "$.targetGrants: duplicate grant "+duplicate)
		}
	}
	for index, grant := range grants {
		path := fmt.Sprintf("$.targetGrants[%d]", index)
		errors = append(errors, semanticGrantErrors(grant, path)...)
		if definition == "CaseContract" {
			errors = append(errors, storedDigestErrors(grant, "grantDigest", "tdev.case-target-grant.v1", path)...)
		}
	}
	if definition == "CaseContract" {
		errors = append(errors, storedDigestErrors(object, "contractDigest", "tdev.case-contract.v1", "$")...)
	}
	sort.Strings(errors)
	return errors
}

func storedDigestErrors(value map[string]any, field, domain, path string) []string {
	actual, ok := value[field].(string)
	if !ok {
		return nil
	}
	unsigned := make(map[string]any, len(value)-1)
	for key, item := range value {
		if key != field {
			unsigned[key] = item
		}
	}
	expected, err := TypedDigest(domain, unsigned)
	if err != nil {
		return []string{path + "." + field + ": digest input invalid: " + err.Error()}
	}
	if actual != expected {
		return []string{path + "." + field + ": digest mismatch"}
	}
	return nil
}

func semanticGrantErrors(value map[string]any, path string) []string {
	var errors []string
	target, _ := value["target"].(map[string]any)
	grantedAgainst, _ := value["grantedAgainst"].(map[string]any)
	for _, item := range asSlice(value["allowedSubpaths"]) {
		subpath, ok := item.(string)
		if !ok {
			continue
		}
		for _, segment := range strings.Split(subpath, "/") {
			if segment == "" || segment == "." || segment == ".." {
				errors = append(errors, path+".allowedSubpaths: unsafe relative path "+subpath)
				break
			}
		}
	}
	projectOnly := map[string]bool{"git.read": true, "git.write": true, "remote.read": true, "remote.write": true, "validation.execute": true}
	if target["kind"] == "workspace" {
		for _, item := range asSlice(value["allowedEffects"]) {
			if effect, ok := item.(string); ok && projectOnly[effect] {
				errors = append(errors, path+".allowedEffects: project effect granted to workspace target")
				break
			}
		}
		if _, exists := grantedAgainst["projectRevision"]; exists {
			errors = append(errors, path+".grantedAgainst.projectRevision: forbidden for workspace target")
		}
	}
	if target["kind"] == "project" {
		if _, exists := grantedAgainst["projectRevision"]; !exists {
			errors = append(errors, path+".grantedAgainst.projectRevision: required for project target")
		}
	}
	return errors
}

func equalJSON(left, right any) bool {
	leftCanonical, leftErr := Canonicalize(left)
	rightCanonical, rightErr := Canonicalize(right)
	return leftErr == nil && rightErr == nil && bytes.Equal(leftCanonical, rightCanonical)
}

func safeInteger(value any) (int64, bool) {
	switch current := value.(type) {
	case json.Number:
		integer, err := current.Int64()
		return integer, err == nil && integer >= -maxSafeInteger && integer <= maxSafeInteger
	case int:
		return safeInteger(int64(current))
	case int64:
		return current, current >= -maxSafeInteger && current <= maxSafeInteger
	case float64:
		if current != float64(int64(current)) {
			return 0, false
		}
		return safeInteger(int64(current))
	default:
		return 0, false
	}
}

func schemaInt(value any) (int, bool) {
	integer, ok := safeInteger(value)
	return int(integer), ok
}

func schemaNumber(value any) (int64, bool) {
	return safeInteger(value)
}

func asSlice(value any) []any {
	items, _ := value.([]any)
	return items
}

func cloneSet(source map[string]bool) map[string]bool {
	result := make(map[string]bool, len(source))
	for key, value := range source {
		result[key] = value
	}
	return result
}

func recordSlice(value any) []map[string]any {
	items := asSlice(value)
	result := make([]map[string]any, 0, len(items))
	for _, item := range items {
		if record, ok := item.(map[string]any); ok {
			result = append(result, record)
		}
	}
	return result
}

func fieldValues(records []map[string]any, field string) []string {
	values := make([]string, 0, len(records))
	for _, record := range records {
		if value, ok := record[field].(string); ok {
			values = append(values, value)
		}
	}
	return values
}

func duplicateValues(values []string) []string {
	seen := map[string]bool{}
	duplicates := map[string]bool{}
	for _, value := range values {
		if seen[value] {
			duplicates[value] = true
		}
		seen[value] = true
	}
	result := make([]string, 0, len(duplicates))
	for value := range duplicates {
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}

func ExtractValueByPointer(rootValue any, instancePointer string) (any, error) {
	if instancePointer == "$" || instancePointer == "" || instancePointer == "/" {
		return rootValue, nil
	}
	p := instancePointer
	if strings.HasPrefix(p, "$") {
		p = p[1:]
	}
	current := rootValue
	pos := 0
	for pos < len(p) {
		if p[pos] == '.' {
			pos++
			nextDot := strings.IndexByte(p[pos:], '.')
			nextBracket := strings.IndexByte(p[pos:], '[')
			end := len(p[pos:])
			if nextDot != -1 && (nextBracket == -1 || nextDot < nextBracket) {
				end = nextDot
			} else if nextBracket != -1 {
				end = nextBracket
			}
			key := p[pos : pos+end]
			pos += end

			objMap, ok := current.(map[string]any)
			if !ok {
				return nil, ingressError("UNION_DISCRIMINATOR_MISMATCH", ReasonUnionDiscriminator, "proof pointer path is not present in the root value")
			}
			val, found := objMap[key]
			if !found {
				return nil, ingressError("UNION_DISCRIMINATOR_MISMATCH", ReasonUnionDiscriminator, "proof pointer property is not present in the root value")
			}
			current = val
		} else if p[pos] == '[' {
			closeBracket := strings.IndexByte(p[pos:], ']')
			if closeBracket == -1 {
				return nil, ingressError("UNION_DISCRIMINATOR_MISMATCH", ReasonUnionDiscriminator, "proof pointer bracket is malformed")
			}
			idxStr := p[pos+1 : pos+closeBracket]
			idx, err := strconv.Atoi(idxStr)
			if err != nil {
				return nil, ingressError("UNION_DISCRIMINATOR_MISMATCH", ReasonUnionDiscriminator, "proof pointer array index is malformed")
			}
			pos += closeBracket + 1

			arrSlice, ok := current.([]any)
			if !ok || idx < 0 || idx >= len(arrSlice) {
				return nil, ingressError("UNION_DISCRIMINATOR_MISMATCH", ReasonUnionDiscriminator, "proof pointer array index is out of bounds")
			}
			current = arrSlice[idx]
		} else {
			return nil, ingressError("UNION_DISCRIMINATOR_MISMATCH", ReasonUnionDiscriminator, "proof pointer contains an unexpected character")
		}
	}
	return current, nil
}

func VerifyProofAndExtract(
	rootValue any,
	proof *ValidationProofV1,
	expectedRootDefinition string,
	instancePointer string,
	targetSchemaPointer string,
	targetBranchIdentities []string,
	canonicalSchemaDigest string,
) (any, *UnionProofBranchV1, error) {
	if proof == nil {
		return nil, nil, ingressError("UNION_DISCRIMINATOR_MISMATCH", ReasonUnionDiscriminator, "validation proof is missing")
	}
	if proof.RootDefinition != expectedRootDefinition {
		return nil, nil, ingressError("ROOT_DEFINITION_MISMATCH", ReasonRootDefinition, "validation proof root definition mismatch")
	}
	if proof.SchemaDigest != canonicalSchemaDigest {
		return nil, nil, ingressError("UNION_DISCRIMINATOR_MISMATCH", ReasonUnionDiscriminator, "validation proof schema digest mismatch")
	}
	recomputedDigest, err := TypedDigest("tdev.validation-proof.v1", rootValue)
	if err != nil || proof.CanonicalDigest != recomputedDigest {
		return nil, nil, ingressError("UNION_DISCRIMINATOR_MISMATCH", ReasonUnionDiscriminator, "validation proof canonical digest mismatch")
	}
	var matches []UnionProofBranchV1
	for _, u := range proof.Unions {
		if u.InstancePointer == instancePointer {
			matches = append(matches, u)
		}
	}
	if len(matches) == 0 {
		return nil, nil, ingressError("UNION_DISCRIMINATOR_MISMATCH", ReasonUnionDiscriminator, "union path is not present in the validation proof")
	}
	if len(matches) > 1 {
		return nil, nil, ingressError("UNION_DISCRIMINATOR_MISMATCH", ReasonUnionDiscriminator, "validation proof contains duplicate union entries")
	}
	match := &matches[0]
	if match.SchemaPointer != targetSchemaPointer {
		return nil, nil, ingressError("UNION_DISCRIMINATOR_MISMATCH", ReasonUnionDiscriminator, "validation proof schema pointer mismatch")
	}
	if match.BranchIndex < 0 || match.BranchIndex >= len(targetBranchIdentities) {
		return nil, nil, ingressError("UNION_DISCRIMINATOR_MISMATCH", ReasonUnionDiscriminator, "validation proof branch index is invalid")
	}
	if match.BranchIdentity != targetBranchIdentities[match.BranchIndex] {
		return nil, nil, ingressError("UNION_DISCRIMINATOR_MISMATCH", ReasonUnionDiscriminator, "validation proof branch identity mismatch")
	}
	extracted, err := ExtractValueByPointer(rootValue, instancePointer)
	if err != nil {
		return nil, nil, ingressError("UNION_DISCRIMINATOR_MISMATCH", ReasonUnionDiscriminator, "proof pointer cannot be resolved in the root value")
	}
	return extracted, match, nil
}
