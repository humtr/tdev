package protocolruntime

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"sort"
	"strings"
)

type SchemaDocument struct {
	Defs map[string]map[string]any `json:"$defs"`
}

type Validator struct {
	root SchemaDocument
}

func ParseSchema(raw []byte) (*Validator, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var document SchemaDocument
	if err := decoder.Decode(&document); err != nil {
		return nil, err
	}
	if len(document.Defs) == 0 {
		return nil, fmt.Errorf("schema has no $defs")
	}
	return &Validator{root: document}, nil
}

func ParseJSON(raw []byte) (any, error) {
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

func (validator *Validator) ValidateDefinition(name string, value any) []string {
	definition, ok := validator.root.Defs[name]
	if !ok {
		return []string{"unknown definition: " + name}
	}
	return validator.validate(definition, value, "$", map[string]bool{})
}

func (validator *Validator) resolve(reference string) (map[string]any, bool) {
	const prefix = "#/$defs/"
	if !strings.HasPrefix(reference, prefix) {
		return nil, false
	}
	definition, ok := validator.root.Defs[strings.TrimPrefix(reference, prefix)]
	return definition, ok
}

func (validator *Validator) validate(schema map[string]any, value any, path string, stack map[string]bool) []string {
	if reference, ok := schema["$ref"].(string); ok {
		resolved, found := validator.resolve(reference)
		if !found {
			return []string{path + ": unresolved reference " + reference}
		}
		key := reference + ":" + path
		if stack[key] {
			return nil
		}
		next := cloneSet(stack)
		next[key] = true
		return validator.validate(resolved, value, path, next)
	}

	if constant, ok := schema["const"]; ok && !equalJSON(constant, value) {
		return []string{path + ": value does not equal const"}
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
			return []string{path + ": value is not in enum"}
		}
	}
	if choices := asSlice(schema["oneOf"]); len(choices) > 0 {
		matches := 0
		for _, choice := range choices {
			if candidate, ok := choice.(map[string]any); ok && len(validator.validate(candidate, value, path, cloneSet(stack))) == 0 {
				matches++
			}
		}
		if matches == 1 {
			return nil
		}
		return []string{fmt.Sprintf("%s: oneOf matched %d branches", path, matches)}
	}

	typeName, _ := schema["type"].(string)
	switch typeName {
	case "null":
		if value == nil {
			return nil
		}
		return []string{path + ": expected null"}
	case "boolean":
		if _, ok := value.(bool); ok {
			return nil
		}
		return []string{path + ": expected boolean"}
	case "integer":
		integer, ok := safeInteger(value)
		if !ok {
			return []string{path + ": expected safe integer"}
		}
		if minimum, ok := schemaNumber(schema["minimum"]); ok && integer < minimum {
			return []string{path + ": below minimum"}
		}
		if maximum, ok := schemaNumber(schema["maximum"]); ok && integer > maximum {
			return []string{path + ": above maximum"}
		}
		return nil
	case "number":
		if _, ok := safeInteger(value); ok {
			return nil
		}
		return []string{path + ": expected finite protocol number"}
	case "string":
		text, ok := value.(string)
		if !ok {
			return []string{path + ": expected string"}
		}
		if minimum, ok := schemaInt(schema["minLength"]); ok && len([]rune(text)) < minimum {
			return []string{path + ": shorter than minLength"}
		}
		if maximum, ok := schemaInt(schema["maxLength"]); ok && len([]rune(text)) > maximum {
			return []string{path + ": longer than maxLength"}
		}
		if pattern, ok := schema["pattern"].(string); ok {
			// The checked-in schema intentionally uses a regexp subset shared by
			// ECMAScript and Go. Compile failure is a contract error.
			compiled, err := regexp.Compile(pattern)
			if err != nil {
				return []string{path + ": invalid schema pattern: " + err.Error()}
			}
			if !compiled.MatchString(text) {
				return []string{path + ": pattern mismatch"}
			}
		}
		return nil
	case "array":
		items, ok := value.([]any)
		if !ok {
			return []string{path + ": expected array"}
		}
		var errors []string
		if minimum, ok := schemaInt(schema["minItems"]); ok && len(items) < minimum {
			errors = append(errors, path+": fewer than minItems")
		}
		if maximum, ok := schemaInt(schema["maxItems"]); ok && len(items) > maximum {
			errors = append(errors, path+": more than maxItems")
		}
		if unique, _ := schema["uniqueItems"].(bool); unique {
			seen := map[string]bool{}
			for _, item := range items {
				canonical, err := Canonicalize(item)
				if err != nil {
					errors = append(errors, path+": invalid unique item")
					break
				}
				key := string(canonical)
				if seen[key] {
					errors = append(errors, path+": duplicate array item")
					break
				}
				seen[key] = true
			}
		}
		if itemSchema, ok := schema["items"].(map[string]any); ok {
			for index, item := range items {
				errors = append(errors, validator.validate(itemSchema, item, fmt.Sprintf("%s[%d]", path, index), cloneSet(stack))...)
			}
		}
		return errors
	case "object":
		object, ok := value.(map[string]any)
		if !ok {
			return []string{path + ": expected object"}
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
				errors = append(errors, path+"."+property+": required property missing")
			}
		}
		for property, item := range object {
			if propertySchema, ok := properties[property].(map[string]any); ok {
				errors = append(errors, validator.validate(propertySchema, item, path+"."+property, cloneSet(stack))...)
				continue
			}
			if additional, ok := schema["additionalProperties"].(bool); ok && !additional {
				errors = append(errors, path+"."+property+": additional property rejected")
				continue
			}
			if additionalSchema, ok := schema["additionalProperties"].(map[string]any); ok {
				errors = append(errors, validator.validate(additionalSchema, item, path+"."+property, cloneSet(stack))...)
			}
		}
		sort.Strings(errors)
		return errors
	case "":
		return nil
	default:
		return []string{path + ": unsupported schema type " + typeName}
	}
}

func ValidateContract(validator *Validator, definition string, value any) []string {
	errors := validator.ValidateDefinition(definition, value)
	errors = append(errors, SemanticErrors(definition, value)...)
	sort.Strings(errors)
	return errors
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
