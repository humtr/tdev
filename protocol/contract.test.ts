import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CANONICAL_SCHEMA_DIGEST,
  convertCaseStatusDomain,
  type CaseContract,
} from "./generated/typescript/types.ts";
import { canonicalize, typedDigest } from "./runtime/typescript/canonical.ts";
import { IngressError, parseRawIngress } from "./runtime/typescript/ingress.ts";
import { M1_RELEASE_PROFILE, M1_RELEASE_PROFILE_DIGEST, validateReleaseProfile } from "./runtime/typescript/profile.ts";
import { SchemaValidator, validateContract, type SchemaDocument } from "./runtime/typescript/schema.ts";

type FixtureSet = {
  schemaCases: { name: string; definition: string; valid: boolean; value: unknown }[];
  canonicalCases: { name: string; domain: string; value: unknown; canonical: string; sha256: string }[];
  canonicalRejectCases: { name: string; value: unknown }[];
  rawIngressCases?: { name: string; raw: string; valid: boolean; errorCode?: string; errorReason?: string }[];
  proofVectorCases?: {
    name: string;
    definition: string;
    value: unknown;
    instancePointer: string;
    expectedSchemaPointer: string;
    expectedBranchIndex: number;
    expectedBranchIdentity: string;
    expectedSchemaDigest: string;
    expectedCanonicalDigest: string;
  }[];
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

test("raw ingress validation and error codes", () => {
  for (const fixture of fixtures.rawIngressCases ?? []) {
    const raw = Buffer.from(fixture.raw, "utf8");
    if (fixture.valid) {
      assert.doesNotThrow(() => parseRawIngress(raw), fixture.name);
    } else {
      assert.throws(
        () => parseRawIngress(raw),
        (err: unknown) =>
          err instanceof IngressError &&
          err.code === fixture.errorCode &&
          err.reason === fixture.errorReason,
        `${fixture.name}: expected ${fixture.errorCode}/${fixture.errorReason}`,
      );
    }
  }

  // UTF-8 failure
  const invalidUtf8 = new Uint8Array([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]);
  assert.throws(
    () => parseRawIngress(invalidUtf8),
    (err: unknown) =>
      err instanceof IngressError && err.code === "INVALID_UTF8" && err.reason === "UTF8",
  );

  // Body size failure
  const hugeBody = new Uint8Array(M1_RELEASE_PROFILE.ingress.maxBodyBytes + 1);
  assert.throws(
    () => parseRawIngress(hugeBody),
    (err: unknown) =>
      err instanceof IngressError && err.code === "PAYLOAD_TOO_LARGE" && err.reason === "BODY_BYTES",
  );
});


test("M1 release profile is generated, bounded, and fail-closed", () => {
  assert.equal(M1_RELEASE_PROFILE.profileVersion, 1);
  assert.equal(M1_RELEASE_PROFILE.output.maxArtifactChunkBytes, 262144);
  assert.equal(M1_RELEASE_PROFILE.pagination.defaultPageSize, 20);
  assert.equal(M1_RELEASE_PROFILE.pagination.maxPageSize, 100);
  assert.equal(M1_RELEASE_PROFILE.pagination.cursorTtlSeconds, 3600);
  assert.match(M1_RELEASE_PROFILE_DIGEST, /^[0-9a-f]{64}$/);
  assert.throws(() =>
    validateReleaseProfile({
      ...M1_RELEASE_PROFILE,
      pagination: { ...M1_RELEASE_PROFILE.pagination, maxPageSize: 501 },
    }),
  /INVALID_RELEASE_PROFILE/);
  assert.throws(() =>
    validateReleaseProfile({
      ...M1_RELEASE_PROFILE,
      retention: { ...M1_RELEASE_PROFILE.retention, eventCompaction: "enabled" as "disabled" },
    }),
  /INVALID_RELEASE_PROFILE/);
});

test("validation proof construction and oneOf branch matching", () => {
  for (const fixture of fixtures.proofVectorCases ?? []) {
    const { proof, errors } = validator.validateDefinitionWithProof(fixture.definition, fixture.value);
    assert.equal(errors.length, 0, `${fixture.name}: ${errors.join("; ")}`);
    assert.ok(proof !== null, `${fixture.name}: proof is null`);
    assert.equal(proof.rootDefinition, fixture.definition, `${fixture.name}: rootDefinition mismatch`);
    assert.equal(proof.schemaDigest, fixture.expectedSchemaDigest, `${fixture.name}: schemaDigest mismatch`);
    assert.equal(proof.canonicalDigest, fixture.expectedCanonicalDigest, `${fixture.name}: canonicalDigest mismatch`);
    assert.equal(proof.schemaDigest, CANONICAL_SCHEMA_DIGEST, `${fixture.name}: generated CANONICAL_SCHEMA_DIGEST mismatch`);
    const match = proof.unions.find((u) => u.instancePointer === fixture.instancePointer);
    assert.ok(match !== undefined, `${fixture.name}: missing union match at ${fixture.instancePointer}`);
    assert.equal(match.schemaPointer, fixture.expectedSchemaPointer, `${fixture.name}: schemaPointer mismatch`);
    assert.equal(match.branchIndex, fixture.expectedBranchIndex, `${fixture.name}: branchIndex mismatch`);
    assert.equal(match.branchIdentity, fixture.expectedBranchIdentity, `${fixture.name}: branchIdentity mismatch`);
  }

  const validControlInput = {
    requestId: "request_abcdefgh1234",
    caseId: "case_abcdefgh1234",
    expectedCaseRevision: 1,
    action: { kind: "pause", reason: "manual" },
  };

  const { proof, errors } = validator.validateDefinitionWithProof("ControlCaseInput", validControlInput);
  assert.equal(errors.length, 0);
  assert.ok(proof !== null);
  assert.equal(proof.rootDefinition, "ControlCaseInput");
  assert.equal(proof.schemaDigest, validator.schemaDigest);
  assert.equal(proof.schemaDigest, CANONICAL_SCHEMA_DIGEST);
  assert.ok(proof.canonicalDigest.length === 64);
  assert.ok(proof.unions.length > 0);

  const actionUnion = proof.unions.find((u) => u.instancePointer === "$.action");
  assert.ok(actionUnion !== undefined);
  assert.equal(actionUnion.branchIndex, 0);
  assert.equal(actionUnion.branchIdentity, "#/$defs/ControlCaseInput/properties/action/oneOf/0");

  // Zero match failure
  const zeroMatchInput = {
    requestId: "request_abcdefgh1234",
    caseId: "case_abcdefgh1234",
    expectedCaseRevision: 1,
    action: { kind: "unknown_kind" },
  };
  const zeroRes = validator.validateDefinitionWithProof("ControlCaseInput", zeroMatchInput);
  assert.ok(zeroRes.proof === null);
  assert.ok(zeroRes.errors.some((e) => e.includes("ONE_OF_NO_MATCH")));
  assert.deepEqual(zeroRes.errorDetails, [{ code: "ONE_OF_NO_MATCH", reason: "ONE_OF_NO_MATCH", instancePointer: "$" }]);

  // Multiple match failure
  const multiMatchValidator = new SchemaValidator({
    $defs: {
      MultiProbe: {
        oneOf: [
          { type: "object", properties: { a: { type: "integer" } }, additionalProperties: false },
          { type: "object", properties: { a: { type: "integer" } }, additionalProperties: false },
        ],
      },
    },
  } as any);
  const multiRes = multiMatchValidator.validateDefinitionWithProof("MultiProbe", { a: 1 });
  assert.ok(multiRes.proof === null);
  assert.ok(multiRes.errors.some((e) => e.includes("ONE_OF_MULTIPLE_MATCH")));
  assert.deepEqual(multiRes.errorDetails, [{ code: "ONE_OF_MULTIPLE_MATCH", reason: "ONE_OF_MULTIPLE_MATCH", instancePointer: "$" }]);
});

function isUnionDiscriminatorError(error: unknown): boolean {
  return (
    error instanceof IngressError &&
    error.code === "UNION_DISCRIMINATOR_MISMATCH" &&
    error.reason === "UNION_DISCRIMINATOR"
  );
}

test("proof binding, exact branch binding, discriminator binding, and tampering rejection", () => {
  const validCaseState = {
    schemaVersion: 1,
    caseId: "case_abcdefgh1234",
    caseRevision: 1,
    eventSequence: 1,
    status: { kind: "active", enteredAt: "2026-08-04T00:00:00Z" },
    updatedAt: "2026-08-04T00:00:00Z",
  };

  const { proof } = validator.validateDefinitionWithProof("CaseState", validCaseState);
  assert.ok(proof !== null);

  // Successful conversion using root value, proof, and instance pointer
  const statusDomain = convertCaseStatusDomain(validCaseState, proof, "CaseState", "$.status");
  assert.deepEqual(statusDomain, { kind: "active", enteredAt: "2026-08-04T00:00:00Z" });

  // Tampered root value -> canonical digest mismatch
  const tamperedRoot = JSON.parse(JSON.stringify(validCaseState));
  tamperedRoot.caseId = "case_tampered";
  assert.throws(
    () => convertCaseStatusDomain(tamperedRoot, proof, "CaseState", "$.status"),
    isUnionDiscriminatorError,
  );

  // Tampered proof canonicalDigest
  const tamperedProofDigest = { ...proof, canonicalDigest: "0".repeat(64) };
  assert.throws(
    () => convertCaseStatusDomain(validCaseState, tamperedProofDigest, "CaseState", "$.status"),
    isUnionDiscriminatorError,
  );

  // Tampered proof rootDefinition cannot be replayed through a converter for another root.
  const tamperedRootDefinition = { ...proof, rootDefinition: "ControlCaseInput" };
  assert.throws(
    () => convertCaseStatusDomain(validCaseState, tamperedRootDefinition, "CaseState", "$.status"),
    (error: unknown) =>
      error instanceof IngressError &&
      error.code === "ROOT_DEFINITION_MISMATCH" &&
      error.reason === "ROOT_DEFINITION",
  );

  // Tampered proof schemaDigest
  const tamperedSchemaDigest = { ...proof, schemaDigest: "1".repeat(64) };
  assert.throws(
    () => convertCaseStatusDomain(validCaseState, tamperedSchemaDigest, "CaseState", "$.status"),
    isUnionDiscriminatorError,
  );

  // Wire fragment substituted for root value -> canonical digest mismatch
  const wireFragment = { kind: "active", enteredAt: "2026-08-04T00:00:00Z" };
  assert.throws(
    () => convertCaseStatusDomain(wireFragment, proof, "CaseState", "$.status"),
    isUnionDiscriminatorError,
  );

  // Tampered branchIdentity
  const tamperedBranchIdentity = {
    ...proof,
    unions: proof.unions.map((u) => u.instancePointer === "$.status" ? { ...u, branchIdentity: "#/$defs/CaseStatus/oneOf/1" } : u),
  };
  assert.throws(
    () => convertCaseStatusDomain(validCaseState, tamperedBranchIdentity, "CaseState", "$.status"),
    isUnionDiscriminatorError,
  );

  // Duplicate proof entries for same instancePointer
  const duplicateProofUnions = {
    ...proof,
    unions: [...proof.unions, proof.unions[0]],
  };
  assert.throws(
    () => convertCaseStatusDomain(validCaseState, duplicateProofUnions, "CaseState", "$.status"),
    isUnionDiscriminatorError,
  );

  // Discriminator const mismatch on extracted value
  const constMismatchRoot = JSON.parse(JSON.stringify(validCaseState));
  constMismatchRoot.status = { kind: "paused", reason: "manual", pausedAt: "2026-08-04T00:00:00Z" };
  const { proof: constMismatchProof } = validator.validateDefinitionWithProof("CaseState", constMismatchRoot);
  assert.ok(constMismatchProof !== null);
  // Forge proof to point branchIndex 0 to constMismatchRoot
  const forgedProof = {
    ...constMismatchProof!,
    unions: constMismatchProof!.unions.map((u) => u.instancePointer === "$.status" ? { ...u, branchIndex: 0, branchIdentity: "#/$defs/CaseStatus/oneOf/0" } : u),
  };
  const forgedDigest = typedDigest("tdev.validation-proof.v1", constMismatchRoot);
  const forgedValidProof = { ...forgedProof, canonicalDigest: forgedDigest };
  assert.throws(
    () => convertCaseStatusDomain(constMismatchRoot, forgedValidProof, "CaseState", "$.status"),
    isUnionDiscriminatorError,
  );
});

test("boundary tests and error privacy", () => {
  // Error privacy: DUPLICATE_JSON_MEMBER does not reveal member name
  const dupRaw = Buffer.from('{"secret_key_123": 1, "secret_key_123": 2}', "utf8");
  assert.throws(
    () => parseRawIngress(dupRaw),
    (err: unknown) => err instanceof IngressError && err.code === "DUPLICATE_JSON_MEMBER" && !err.message.includes("secret_key_123"),
  );

  // Error privacy: unexpected secret character/body fragment is not echoed
  const secretRaw = Buffer.from('{"secret_api_key_xyz": @super_secret_token_123}', "utf8");
  assert.throws(
    () => parseRawIngress(secretRaw),
    (err: unknown) => {
      if (!(err instanceof IngressError)) return false;
      const msg = err.message;
      return err.code === "MALFORMED_JSON" &&
        !msg.includes("secret_api_key_xyz") &&
        !msg.includes("super_secret_token_123") &&
        !msg.includes("@");
    },
  );

  // Lone high surrogate rejected
  const loneHighRaw = Buffer.from('{"a": "\\uD800"}', "utf8");
  assert.throws(
    () => parseRawIngress(loneHighRaw),
    (err: unknown) => err instanceof IngressError && err.code === "MALFORMED_JSON",
  );

  // Lone low surrogate rejected
  const loneLowRaw = Buffer.from('{"a": "\\uDC00"}', "utf8");
  assert.throws(
    () => parseRawIngress(loneLowRaw),
    (err: unknown) => err instanceof IngressError && err.code === "MALFORMED_JSON",
  );

  // Nesting depth boundary
  let deepObj: any = 1;
  for (let i = 0; i < 63; i++) {
    deepObj = { a: deepObj };
  }
  const depth64Json = Buffer.from(JSON.stringify(deepObj), "utf8");
  assert.doesNotThrow(() => parseRawIngress(depth64Json));

  deepObj = { a: deepObj };
  const depth65Json = Buffer.from(JSON.stringify(deepObj), "utf8");
  assert.throws(
    () => parseRawIngress(depth65Json),
    (err: unknown) => err instanceof IngressError && err.code === "JSON_LIMIT_EXCEEDED",
  );

  // Object member limit: 4096 succeeds, 4097 returns JSON_LIMIT_EXCEEDED
  const obj4096: Record<string, number> = {};
  for (let i = 0; i < 4096; i++) {
    obj4096[`k${i}`] = 0;
  }
  const rawObj4096 = Buffer.from(JSON.stringify(obj4096), "utf8");
  assert.doesNotThrow(() => parseRawIngress(rawObj4096));

  const obj4097 = { ...obj4096, k4096: 0 };
  const rawObj4097 = Buffer.from(JSON.stringify(obj4097), "utf8");
  assert.throws(
    () => parseRawIngress(rawObj4097),
    (err: unknown) => err instanceof IngressError && err.code === "JSON_LIMIT_EXCEEDED",
  );

  // Array item limit: 10000 succeeds, 10001 returns JSON_LIMIT_EXCEEDED
  const arr10000 = new Array(10000).fill(0);
  const rawArr10000 = Buffer.from(JSON.stringify(arr10000), "utf8");
  assert.doesNotThrow(() => parseRawIngress(rawArr10000));

  const arr10001 = new Array(10001).fill(0);
  const rawArr10001 = Buffer.from(JSON.stringify(arr10001), "utf8");
  assert.throws(
    () => parseRawIngress(rawArr10001),
    (err: unknown) => err instanceof IngressError && err.code === "JSON_LIMIT_EXCEEDED",
  );

  // Compact nested-array token limit (100000 tokens):
  // 49 inner arrays of 1000 zeros = 98100 tokens succeeds
  const inner1000 = new Array(1000).fill(0);
  const nested49 = new Array(49).fill(inner1000);
  const rawNested49 = Buffer.from(JSON.stringify(nested49), "utf8");
  assert.doesNotThrow(() => parseRawIngress(rawNested49));

  // 50 inner arrays of 1000 zeros = 100101 tokens exceeds limit
  const nested50 = new Array(50).fill(inner1000);
  const rawNested50 = Buffer.from(JSON.stringify(nested50), "utf8");
  assert.throws(
    () => parseRawIngress(rawNested50),
    (err: unknown) => err instanceof IngressError && err.code === "JSON_LIMIT_EXCEEDED",
  );
});
