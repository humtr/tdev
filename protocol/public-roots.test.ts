import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { CAPABILITY_DESCRIPTORS, MCP_PROTOCOL_REVISION } from "./generated/typescript/capabilities.ts";
import { SchemaValidator } from "./runtime/typescript/schema.ts";

const schema = JSON.parse(fs.readFileSync(new URL("./schemas/tdev.v1.schema.json", import.meta.url), "utf8"));
const fixtures = JSON.parse(fs.readFileSync(new URL("./testdata/fixtures.json", import.meta.url), "utf8"));
const validator = new SchemaValidator(schema);
const sha = "a".repeat(64);
const shaB = "b".repeat(64);

function fixtureValue(definition: string): Record<string, unknown> {
  const fixture = fixtures.schemaCases.find(
    (candidate: { definition?: string; valid?: boolean }) => candidate.definition === definition && candidate.valid === true,
  );
  assert.ok(fixture, `missing valid fixture for ${definition}`);
  return structuredClone(fixture.value);
}

const contract = fixtureValue("CaseContract");
const state = fixtureValue("CaseState");
const task = fixtureValue("TaskRecord");
const attempt = fixtureValue("AttemptRecord");
const caseId = state.caseId as string;
const taskId = task.taskId as string;
const requestId = "request_abcdefgh1234";
const snapshot = { caseRevision: 1, taskRevision: 1, eventSequence: 1 };
const page = { snapshot };
const catalogEntry = {
  operationId: "list_operations",
  operationVersion: 1,
  title: "List Operations",
  inputSchemaDigest: sha,
  resultSchemaDigest: shaB,
  mutating: false,
  available: true,
};
const resource = {
  kind: "case",
  uri: `tdev://cases/${caseId}`,
  caseId,
  subjectId: caseId,
  revision: 1,
  createdAt: "2026-08-04T00:00:00Z",
};
const artifact = {
  artifactId: "artifact_abcdefgh",
  bytes: 3,
  caseId,
  createdAt: "2026-08-04T00:00:00Z",
  mediaType: "text/plain",
  sha256: sha,
  taskId,
};
const caseMutation = {
  accepted: true,
  deduplicated: false,
  requestId,
  caseId,
  committedCaseRevision: 2,
  committedEventSequence: 2,
  value: state,
};
const taskMutation = {
  accepted: true,
  deduplicated: false,
  requestId,
  caseId,
  taskId,
  committedCaseRevision: 2,
  committedTaskRevision: 2,
  committedEventSequence: 2,
  value: { task, attempt },
};

const publicRootValues: Record<string, Record<string, unknown>> = {
  ListOperationsInput: { page: { limit: 20 } },
  ListOperationsResult: { operations: [catalogEntry], catalogDigest: sha, profileDigest: shaB, page },
  ListResourcesInput: { caseId, kinds: ["case"], page: { limit: 20 } },
  ListResourcesResult: { resources: [resource], page },
  GetCaseInput: { caseId },
  GetCaseResult: { contract, state, taskCount: 1, snapshot },
  GetTaskInput: { caseId, taskId },
  GetTaskResult: { task, latestAttempt: attempt, attemptCount: 1, snapshot },
  RenderTaskInput: { caseId, taskId, format: "markdown", maxBytes: 65536 },
  RenderTaskResult: {
    caseId,
    taskId,
    taskRevision: 1,
    eventSequence: 1,
    format: "markdown",
    text: "# Task",
    truncated: false,
    renderDigest: sha,
  },
  ReadArtifactInput: { caseId, artifactId: artifact.artifactId, offset: 0, length: 3 },
  ReadArtifactResult: { artifact, offset: 0, dataBase64: "YWJj", eof: true, rangeDigest: shaB },
  SubmitOperationResult: {
    accepted: true,
    deduplicated: false,
    case: {
      caseId,
      contractDigest: contract.contractDigest,
      caseRevision: 1,
      eventSequence: 1,
      status: state.status,
    },
    task,
    continuing: false,
  },
  ControlCaseResult: caseMutation,
  FinishCaseResult: caseMutation,
  CancelCaseResult: caseMutation,
  ControlTaskResult: taskMutation,
  CancelTaskResult: taskMutation,
};

test("all tools-v1 public roots are executable, strict, and projected in stable order", () => {
  assert.equal(MCP_PROTOCOL_REVISION, "2026-07-28");
  assert.equal(CAPABILITY_DESCRIPTORS.length, 12);
  const projectedRoots = new Set<string>();
  for (const descriptor of CAPABILITY_DESCRIPTORS) {
    projectedRoots.add(descriptor.inputRoot);
    projectedRoots.add(descriptor.resultRoot);
    assert.match(descriptor.inputSchemaDigest, /^[0-9a-f]{64}$/);
    assert.match(descriptor.resultSchemaDigest, /^[0-9a-f]{64}$/);
    assert.ok(descriptor.maxResultBytes > 0);
  }

  for (const [definition, value] of Object.entries(publicRootValues)) {
    assert.ok(projectedRoots.has(definition), `${definition} is absent from generated projection`);
    assert.deepEqual(validator.validateDefinition(definition, value), [], `${definition} valid value rejected`);
    const errors = validator.validateDefinition(definition, { ...value, unexpected: true });
    assert.ok(errors.length > 0, `${definition} accepted an unknown field`);
  }
});

test("tools-v1 public roots enforce page, collection, render, and artifact bounds", () => {
  assert.ok(validator.validateDefinition("ListOperationsInput", { page: { limit: 101 } }).length > 0);
  assert.ok(
    validator.validateDefinition("ListOperationsResult", {
      ...publicRootValues.ListOperationsResult,
      operations: Array.from({ length: 101 }, () => catalogEntry),
    }).length > 0,
  );
  assert.ok(
    validator.validateDefinition("RenderTaskResult", {
      ...publicRootValues.RenderTaskResult,
      text: "x".repeat(65537),
    }).length > 0,
  );
  assert.ok(
    validator.validateDefinition("ReadArtifactInput", {
      caseId,
      artifactId: artifact.artifactId,
      length: 262145,
    }).length > 0,
  );
});
