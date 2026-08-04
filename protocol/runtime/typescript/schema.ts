import { canonicalize, typedDigest } from "./canonical.ts";

export type SchemaDocument = Readonly<{
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

export class SchemaValidator {
  readonly #root: SchemaDocument;

  constructor(root: SchemaDocument) {
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
      case "number":
        return typeof value === "number" && Number.isFinite(value) ? [] : [`${path}: expected finite number`];
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
