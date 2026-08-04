import { canonicalize, typedDigest } from "./canonical.ts";

export type SchemaDocument = Readonly<{
  $schema?: string;
  $id?: string;
  title?: string;
  $defs: Readonly<Record<string, SchemaNode>>;
}>;

type SchemaNode = Readonly<Record<string, unknown>>;

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as JsonRecord;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function equalJson(left: unknown, right: unknown): boolean {
  try {
    return canonicalize(left) === canonicalize(right);
  } catch {
    return false;
  }
}

const tdevDateTimePattern = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.[0-9]{1,9})?Z$/;

function isTdevDateTime(value: string): boolean {
  const match = tdevDateTimePattern.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

const supportedSchemaRootKeywords = new Set(["$schema", "$id", "title", "$defs"]);
const supportedSchemaKeywords = new Set([
  "$ref", "additionalProperties", "const", "enum", "format", "items", "maxItems", "maxLength", "maximum",
  "minItems", "minLength", "minimum", "oneOf", "pattern", "properties", "required", "type", "uniqueItems",
]);
const supportedSchemaTypes = new Set(["null", "boolean", "integer", "number", "string", "array", "object"]);

function assertSupportedSchemaDocument(root: SchemaDocument): void {
  const rootRecord = record(root);
  if (rootRecord === undefined) throw new Error("schema root is not an object");
  for (const key of Object.keys(rootRecord)) {
    if (!supportedSchemaRootKeywords.has(key)) throw new Error(`unsupported schema root keyword: ${key}`);
  }
  for (const key of ["$schema", "$id", "title"] as const) {
    if (Object.hasOwn(rootRecord, key) && typeof rootRecord[key] !== "string") {
      throw new Error(`schema root ${key} is not a string`);
    }
  }

  const definitions = record(rootRecord.$defs);
  if (definitions === undefined || Object.keys(definitions).length === 0) {
    throw new Error("schema has no $defs");
  }

  const canonicalKeywordValue = (value: unknown, path: string): string => {
    try {
      return canonicalize(value);
    } catch (error) {
      throw new Error(`invalid protocol value at ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const integerKeyword = (schema: SchemaNode, key: string, path: string, nonNegative: boolean): number | undefined => {
    if (!Object.hasOwn(schema, key)) return undefined;
    const value = schema[key];
    if (!Number.isSafeInteger(value) || (nonNegative && (value as number) < 0)) {
      throw new Error(`${key} is not ${nonNegative ? "a non-negative " : "a "}safe integer at ${path}`);
    }
    return value as number;
  };
  const rejectMisplaced = (schema: SchemaNode, keys: readonly string[], allowed: boolean, path: string): void => {
    if (allowed) return;
    for (const key of keys) {
      if (Object.hasOwn(schema, key)) throw new Error(`${key} is not valid for schema type at ${path}`);
    }
  };

  const visit = (schema: SchemaNode, path: string): void => {
    const keys = Object.keys(schema);
    for (const key of keys) {
      if (!supportedSchemaKeywords.has(key)) throw new Error(`unsupported schema keyword at ${path}: ${key}`);
    }

    if (Object.hasOwn(schema, "$ref")) {
      if (keys.length !== 1) throw new Error(`$ref siblings are unsupported at ${path}`);
      const reference = schema.$ref;
      const prefix = "#/$defs/";
      if (typeof reference !== "string" || !reference.startsWith(prefix)) {
        throw new Error(`unsupported external $ref at ${path}: ${String(reference)}`);
      }
      const name = reference.slice(prefix.length);
      if (!Object.hasOwn(definitions, name)) throw new Error(`unresolved $ref at ${path}: ${reference}`);
      return;
    }

    if (Object.hasOwn(schema, "oneOf")) {
      if (keys.length !== 1) throw new Error(`oneOf siblings are unsupported at ${path}`);
      if (!Array.isArray(schema.oneOf) || schema.oneOf.length === 0) {
        throw new Error(`oneOf must contain a branch at ${path}`);
      }
      schema.oneOf.forEach((choice, index) => {
        const branch = record(choice);
        if (branch === undefined) throw new Error(`oneOf branch is not a schema at ${path}/${index}`);
        visit(branch, `${path}/oneOf/${index}`);
      });
      return;
    }

    const typeName = schema.type;
    if (typeName !== undefined && (typeof typeName !== "string" || !supportedSchemaTypes.has(typeName))) {
      throw new Error(`unsupported schema type at ${path}: ${String(typeName)}`);
    }
    if (typeName === undefined && !Object.hasOwn(schema, "const") && !Object.hasOwn(schema, "enum")) {
      throw new Error(`schema has no executable keyword at ${path}`);
    }

    if (Object.hasOwn(schema, "const")) canonicalKeywordValue(schema.const, `${path}/const`);
    if (Object.hasOwn(schema, "enum")) {
      if (!Array.isArray(schema.enum) || schema.enum.length === 0) throw new Error(`enum must contain a value at ${path}`);
      const seen = new Set<string>();
      schema.enum.forEach((value, index) => {
        const canonical = canonicalKeywordValue(value, `${path}/enum/${index}`);
        if (seen.has(canonical)) throw new Error(`enum contains a duplicate value at ${path}`);
        seen.add(canonical);
      });
    }

    const stringKeys = ["minLength", "maxLength", "pattern", "format"] as const;
    const numberKeys = ["minimum", "maximum"] as const;
    const arrayKeys = ["items", "minItems", "maxItems", "uniqueItems"] as const;
    const objectKeys = ["properties", "required", "additionalProperties"] as const;
    rejectMisplaced(schema, stringKeys, typeName === "string", path);
    rejectMisplaced(schema, numberKeys, typeName === "integer" || typeName === "number", path);
    rejectMisplaced(schema, arrayKeys, typeName === "array", path);
    rejectMisplaced(schema, objectKeys, typeName === "object", path);

    if (typeName === "string") {
      const minimum = integerKeyword(schema, "minLength", path, true);
      const maximum = integerKeyword(schema, "maxLength", path, true);
      if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
        throw new Error(`minLength exceeds maxLength at ${path}`);
      }
      if (Object.hasOwn(schema, "pattern")) {
        if (typeof schema.pattern !== "string") throw new Error(`schema pattern is not a string at ${path}`);
        try {
          new RegExp(schema.pattern);
        } catch (error) {
          throw new Error(`invalid schema pattern at ${path}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (Object.hasOwn(schema, "format") && schema.format !== "date-time") {
        throw new Error(`unsupported string format at ${path}: ${String(schema.format)}`);
      }
    }

    if (typeName === "integer" || typeName === "number") {
      const minimum = integerKeyword(schema, "minimum", path, false);
      const maximum = integerKeyword(schema, "maximum", path, false);
      if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
        throw new Error(`minimum exceeds maximum at ${path}`);
      }
    }

    if (typeName === "array") {
      const minimum = integerKeyword(schema, "minItems", path, true);
      const maximum = integerKeyword(schema, "maxItems", path, true);
      if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
        throw new Error(`minItems exceeds maxItems at ${path}`);
      }
      if (Object.hasOwn(schema, "uniqueItems") && typeof schema.uniqueItems !== "boolean") {
        throw new Error(`uniqueItems is not a boolean at ${path}`);
      }
      if (Object.hasOwn(schema, "items")) {
        const items = record(schema.items);
        if (items === undefined) throw new Error(`items is not a schema at ${path}`);
        visit(items, `${path}/items`);
      }
    }

    if (typeName === "object") {
      let properties: JsonRecord | undefined;
      if (Object.hasOwn(schema, "properties")) {
        properties = record(schema.properties);
        if (properties === undefined) throw new Error(`schema properties are not an object at ${path}`);
        for (const [name, child] of Object.entries(properties)) {
          const property = record(child);
          if (property === undefined) throw new Error(`property is not a schema at ${path}/properties/${name}`);
          visit(property, `${path}/properties/${name}`);
        }
      }
      if (Object.hasOwn(schema, "required")) {
        if (!Array.isArray(schema.required)) throw new Error(`required is not an array at ${path}`);
        const seen = new Set<string>();
        for (const value of schema.required) {
          if (typeof value !== "string") throw new Error(`required contains a non-string at ${path}`);
          if (seen.has(value)) throw new Error(`required contains a duplicate property at ${path}: ${value}`);
          if (properties === undefined || !Object.hasOwn(properties, value)) {
            throw new Error(`required property is not declared at ${path}: ${value}`);
          }
          seen.add(value);
        }
      }
      if (properties !== undefined && Object.keys(properties).length > 0 && schema.additionalProperties !== false) {
        throw new Error(`canonical object is not strict at ${path}`);
      }
      if (Object.hasOwn(schema, "additionalProperties") && typeof schema.additionalProperties !== "boolean") {
        const additional = record(schema.additionalProperties);
        if (additional === undefined) throw new Error(`additionalProperties is not boolean or schema at ${path}`);
        visit(additional, `${path}/additionalProperties`);
      }
    }
  };

  for (const [name, definition] of Object.entries(definitions)) {
    const schema = record(definition);
    if (schema === undefined) throw new Error(`definition is not a schema: ${name}`);
    visit(schema, `#/$defs/${name}`);
  }

  const sameInstanceReferences = (schema: SchemaNode): string[] => {
    if (typeof schema.$ref === "string") return [schema.$ref.slice("#/$defs/".length)];
    if (!Array.isArray(schema.oneOf)) return [];
    return schema.oneOf.flatMap((choice) => {
      const branch = record(choice);
      return branch === undefined ? [] : sameInstanceReferences(branch);
    });
  };
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visitDefinition = (name: string): void => {
    if (visited.has(name)) return;
    if (visiting.has(name)) throw new Error(`unproductive same-instance $ref cycle: ${name}`);
    const definition = record(definitions[name]);
    if (definition === undefined) throw new Error(`definition is not a schema: ${name}`);
    visiting.add(name);
    for (const referenced of sameInstanceReferences(definition)) visitDefinition(referenced);
    visiting.delete(name);
    visited.add(name);
  };
  for (const name of Object.keys(definitions)) visitDefinition(name);
}

export class SchemaValidator {
  readonly #root: SchemaDocument;

  constructor(root: SchemaDocument) {
    assertSupportedSchemaDocument(root);
    this.#root = root;
  }

  validateDefinition(name: string, value: unknown): readonly string[] {
    const definition = this.#root.$defs[name];
    if (definition === undefined) {
      return [`unknown definition: ${name}`];
    }
    return this.#validate(definition, value, "$", new Set());
  }

  #resolve(reference: string): SchemaNode | undefined {
    const prefix = "#/$defs/";
    if (!reference.startsWith(prefix)) {
      return undefined;
    }
    return this.#root.$defs[reference.slice(prefix.length)];
  }

  #validate(schema: SchemaNode, value: unknown, path: string, stack: Set<string>): string[] {
    const reference = typeof schema.$ref === "string" ? schema.$ref : undefined;
    if (reference !== undefined) {
      const resolved = this.#resolve(reference);
      if (resolved === undefined) {
        return [`${path}: unresolved reference ${reference}`];
      }
      const key = `${reference}:${path}`;
      if (stack.has(key)) {
        return [];
      }
      const next = new Set(stack);
      next.add(key);
      return this.#validate(resolved, value, path, next);
    }

    if (Object.hasOwn(schema, "const") && !equalJson(value, schema.const)) {
      return [`${path}: value does not equal const`];
    }

    const enumValues = array(schema.enum);
    if (enumValues.length > 0 && !enumValues.some((item) => equalJson(item, value))) {
      return [`${path}: value is not in enum`];
    }

    const choices = array(schema.oneOf);
    if (choices.length > 0) {
      let matches = 0;
      for (const choice of choices) {
        const choiceRecord = record(choice);
        if (choiceRecord !== undefined && this.#validate(choiceRecord, value, path, new Set(stack)).length === 0) {
          matches += 1;
        }
      }
      return matches === 1 ? [] : [`${path}: oneOf matched ${matches} branches`];
    }

    const type = typeof schema.type === "string" ? schema.type : undefined;
    switch (type) {
      case "null":
        return value === null ? [] : [`${path}: expected null`];
      case "boolean":
        return typeof value === "boolean" ? [] : [`${path}: expected boolean`];
      case "integer":
        if (!Number.isSafeInteger(value)) {
          return [`${path}: expected safe integer`];
        }
        if (typeof schema.minimum === "number" && (value as number) < schema.minimum) {
          return [`${path}: below minimum`];
        }
        if (typeof schema.maximum === "number" && (value as number) > schema.maximum) {
          return [`${path}: above maximum`];
        }
        return [];
      case "number": {
        if (!Number.isSafeInteger(value)) return [`${path}: expected finite protocol number`];
        if (typeof schema.minimum === "number" && (value as number) < schema.minimum) return [`${path}: below minimum`];
        if (typeof schema.maximum === "number" && (value as number) > schema.maximum) return [`${path}: above maximum`];
        return [];
      }
      case "string": {
        if (typeof value !== "string") {
          return [`${path}: expected string`];
        }
        const codePointLength = Array.from(value).length;
        if (typeof schema.minLength === "number" && codePointLength < schema.minLength) {
          return [`${path}: shorter than minLength`];
        }
        if (typeof schema.maxLength === "number" && codePointLength > schema.maxLength) {
          return [`${path}: longer than maxLength`];
        }
        if (typeof schema.pattern === "string" && !(new RegExp(schema.pattern).test(value))) {
          return [`${path}: pattern mismatch`];
        }
        if (schema.format === "date-time" && !isTdevDateTime(value)) {
          return [`${path}: invalid date-time`];
        }
        return [];
      }
      case "array": {
        if (!Array.isArray(value)) {
          return [`${path}: expected array`];
        }
        const errors: string[] = [];
        if (typeof schema.minItems === "number" && value.length < schema.minItems) {
          errors.push(`${path}: fewer than minItems`);
        }
        if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
          errors.push(`${path}: more than maxItems`);
        }
        if (schema.uniqueItems === true) {
          const seen = new Set<string>();
          for (const item of value) {
            const key = canonicalize(item);
            if (seen.has(key)) {
              errors.push(`${path}: duplicate array item`);
              break;
            }
            seen.add(key);
          }
        }
        const itemSchema = record(schema.items);
        if (itemSchema !== undefined) {
          value.forEach((item, index) => errors.push(...this.#validate(itemSchema, item, `${path}[${index}]`, new Set(stack))));
        }
        return errors;
      }
      case "object": {
        const object = record(value);
        if (object === undefined) {
          return [`${path}: expected object`];
        }
        const errors: string[] = [];
        const properties = record(schema.properties) ?? {};
        const required = new Set(array(schema.required).filter((item): item is string => typeof item === "string"));
        for (const property of required) {
          if (!Object.hasOwn(object, property)) {
            errors.push(`${path}.${property}: required property missing`);
          }
        }
        for (const [property, item] of Object.entries(object)) {
          const propertySchema = record(properties[property]);
          if (propertySchema !== undefined) {
            errors.push(...this.#validate(propertySchema, item, `${path}.${property}`, new Set(stack)));
            continue;
          }
          if (schema.additionalProperties === false) {
            errors.push(`${path}.${property}: additional property rejected`);
            continue;
          }
          const additional = record(schema.additionalProperties);
          if (additional !== undefined) {
            errors.push(...this.#validate(additional, item, `${path}.${property}`, new Set(stack)));
          }
        }
        return errors;
      }
      case undefined:
        return [];
      default:
        return [`${path}: unsupported schema type ${type}`];
    }
  }
}

function digestErrors(value: JsonRecord, field: string, domain: string, path: string): string[] {
  const actual = value[field];
  if (typeof actual !== "string") return [];
  const unsigned = Object.fromEntries(Object.entries(value).filter(([key]) => key !== field));
  try {
    const expected = typedDigest(domain, unsigned);
    return actual === expected ? [] : [`${path}.${field}: digest mismatch`];
  } catch (error) {
    return [`${path}.${field}: digest input invalid: ${error instanceof Error ? error.message : String(error)}`];
  }
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const found = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      found.add(value);
    }
    seen.add(value);
  }
  return [...found].sort();
}

function semanticGrantErrors(value: JsonRecord, path: string): string[] {
  const errors: string[] = [];
  const target = record(value.target);
  const grantedAgainst = record(value.grantedAgainst);
  const subpaths = array(value.allowedSubpaths).filter((item): item is string => typeof item === "string");
  const effects = array(value.allowedEffects).filter((item): item is string => typeof item === "string");

  for (const subpath of subpaths) {
    const segments = subpath.split("/");
    if (segments.some((segment) => segment === "." || segment === ".." || segment.length === 0)) {
      errors.push(`${path}.allowedSubpaths: unsafe relative path ${subpath}`);
    }
  }

  const projectOnly = new Set(["git.read", "git.write", "remote.read", "remote.write", "validation.execute"]);
  if (target?.kind === "workspace" && effects.some((effect) => projectOnly.has(effect))) {
    errors.push(`${path}.allowedEffects: project effect granted to workspace target`);
  }
  if (target?.kind === "project" && typeof grantedAgainst?.projectRevision !== "number") {
    errors.push(`${path}.grantedAgainst.projectRevision: required for project target`);
  }
  if (target?.kind === "workspace" && Object.hasOwn(grantedAgainst ?? {}, "projectRevision")) {
    errors.push(`${path}.grantedAgainst.projectRevision: forbidden for workspace target`);
  }
  return errors;
}

export function semanticErrors(definition: string, value: unknown): readonly string[] {
  const object = record(value);
  if (object === undefined) {
    return [];
  }
  if (definition === "NewCaseTargetGrant") {
    return semanticGrantErrors(object, "$");
  }
  if (definition === "CaseTargetGrant") {
    return [...semanticGrantErrors(object, "$"), ...digestErrors(object, "grantDigest", "tdev.case-target-grant.v1", "$")];
  }
  if (definition !== "NewCaseContractInput" && definition !== "CaseContract") {
    return [];
  }

  const errors: string[] = [];
  const criteria = array(object.acceptanceCriteria).map((item) => record(item)).filter((item): item is JsonRecord => item !== undefined);
  const requirements = array(object.verificationRequirements).map((item) => record(item)).filter((item): item is JsonRecord => item !== undefined);
  const clauses = [...array(object.nonGoals), ...array(object.constraints)].map((item) => record(item)).filter((item): item is JsonRecord => item !== undefined);
  const grants = array(object.targetGrants).map((item) => record(item)).filter((item): item is JsonRecord => item !== undefined);

  for (const duplicate of duplicates(criteria.map((item) => String(item.criterionId)))) {
    errors.push(`$.acceptanceCriteria: duplicate criterionId ${duplicate}`);
  }
  for (const duplicate of duplicates(requirements.map((item) => String(item.requirementId)))) {
    errors.push(`$.verificationRequirements: duplicate requirementId ${duplicate}`);
  }
  for (const duplicate of duplicates(clauses.map((item) => String(item.clauseId)))) {
    errors.push(`$.clauses: duplicate clauseId ${duplicate}`);
  }
  const criterionIds = new Set(criteria.map((item) => String(item.criterionId)));
  requirements.forEach((requirement, index) => {
    for (const criterionId of array(requirement.criterionIds)) {
      if (typeof criterionId === "string" && !criterionIds.has(criterionId)) {
        errors.push(`$.verificationRequirements[${index}]: unknown criterionId ${criterionId}`);
      }
    }
  });
  if (definition === "CaseContract") {
    for (const duplicate of duplicates(grants.map((item) => String(item.grantId)))) {
      errors.push(`$.targetGrants: duplicate grantId ${duplicate}`);
    }
  } else {
    for (const duplicate of duplicates(grants.map((item) => canonicalize(item)))) {
      errors.push(`$.targetGrants: duplicate grant ${duplicate}`);
    }
  }
  grants.forEach((grant, index) => {
    const path = `$.targetGrants[${index}]`;
    errors.push(...semanticGrantErrors(grant, path));
    if (definition === "CaseContract") {
      errors.push(...digestErrors(grant, "grantDigest", "tdev.case-target-grant.v1", path));
    }
  });
  if (definition === "CaseContract") {
    errors.push(...digestErrors(object, "contractDigest", "tdev.case-contract.v1", "$"));
  }
  return errors;
}

export function validateContract(validator: SchemaValidator, definition: string, value: unknown): readonly string[] {
  return [...validator.validateDefinition(definition, value), ...semanticErrors(definition, value)];
}
