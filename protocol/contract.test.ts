import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { CaseContract } from "./generated/typescript/types.ts";
import { canonicalize, typedDigest } from "./runtime/typescript/canonical.ts";
import { SchemaValidator, validateContract, type SchemaDocument } from "./runtime/typescript/schema.ts";

type FixtureSet = {
  schemaCases: { name: string; definition: string; valid: boolean; value: unknown }[];
  canonicalCases: { name: string; domain: string; value: unknown; canonical: string; sha256: string }[];
  canonicalRejectCases: { name: string; value: unknown }[];
};

const schema = JSON.parse(await readFile(new URL("./schemas/tdev.v1.schema.json", import.meta.url), "utf8")) as SchemaDocument;
const fixtures = JSON.parse(await readFile(new URL("./testdata/fixtures.json", import.meta.url), "utf8")) as FixtureSet;
const validator = new SchemaValidator(schema);
const semanticDefinitions = new Set(["NewCaseContractInput", "CaseContract", "NewCaseTargetGrant", "CaseTargetGrant"]);

test("schema and semantic fixtures", () => {
  for (const fixture of fixtures.schemaCases) {
    const errors = semanticDefinitions.has(fixture.definition)
      ? validateContract(validator, fixture.definition, fixture.value)
      : validator.validateDefinition(fixture.definition, fixture.value);
    assert.equal(errors.length === 0, fixture.valid, `${fixture.name}: ${errors.join("; ")}`);
  }
  const stored = fixtures.schemaCases.find((fixture) => fixture.definition === "CaseContract" && fixture.valid)?.value as CaseContract;
  assert.equal(stored.schemaVersion, 1);
});

test("canonical JSON and typed digest golden vectors", () => {
  for (const fixture of fixtures.canonicalCases) {
    assert.equal(canonicalize(fixture.value), fixture.canonical, fixture.name);
    assert.equal(typedDigest(fixture.domain, fixture.value), fixture.sha256, fixture.name);
  }
  for (const fixture of fixtures.canonicalRejectCases) {
    assert.throws(() => canonicalize(fixture.value), undefined, fixture.name);
  }
});

test("generated artifacts are marked and strict definitions reject unknown fields", async () => {
  const generated = await readFile(new URL("./generated/typescript/types.ts", import.meta.url), "utf8");
  assert.match(generated, /Code generated/);
  const base = fixtures.schemaCases.find((fixture) => fixture.definition === "CaseState" && fixture.valid)?.value as Record<string, unknown>;
  assert.ok(validator.validateDefinition("CaseState", { ...base, extra: true }).length > 0);
});

test("schema subset fails closed and protocol numbers are safe integers", () => {
  const invalidSchemas: unknown[] = [
    { $defs: { Probe: { type: "string", unsupportedKeyword: true } } },
    { $defs: { Probe: { $ref: "#/$defs/Target", type: "string" }, Target: { type: "string" } } },
    { $defs: { Probe: { oneOf: [{ type: "string" }], type: "string" } } },
    { $defs: { Probe: { type: "string" } }, allOf: [{ $ref: "#/$defs/Probe" }] },
    { $defs: { Probe: { type: "object", properties: {}, required: "x", additionalProperties: false } } },
    { $defs: { Probe: { type: "integer", minimum: "1" } } },
    { $defs: { Probe: { enum: "x" } } },
    { $defs: { Probe: { type: "integer", pattern: "x" } } },
    { $defs: { Probe: { type: "integer", format: "date-time" } } },
    { $defs: { Probe: { type: "string", format: "email" } } },
    { $defs: { Probe: { $ref: "#/$defs/Probe" } } },
    { $defs: { A: { $ref: "#/$defs/B" }, B: { $ref: "#/$defs/A" } } },
    { $defs: { Probe: { oneOf: [{ type: "string" }, { $ref: "#/$defs/Probe" }] } } },
  ];
  invalidSchemas.forEach((candidate) => assert.throws(() => new SchemaValidator(candidate as SchemaDocument)));

  const numberValidator = new SchemaValidator({
    $defs: { NumberProbe: { type: "number", minimum: 1, maximum: 3 } },
  } as SchemaDocument);
  assert.deepEqual(numberValidator.validateDefinition("NumberProbe", 2), []);
  assert.ok(numberValidator.validateDefinition("NumberProbe", 0).length > 0);
  assert.ok(numberValidator.validateDefinition("NumberProbe", 4).length > 0);
  assert.ok(numberValidator.validateDefinition("NumberProbe", 1.5).length > 0);
  assert.ok(numberValidator.validateDefinition("NumberProbe", Number.MAX_SAFE_INTEGER + 1).length > 0);
});
