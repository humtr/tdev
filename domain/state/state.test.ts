import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAttemptTransition,
  assertCaseTransition,
  assertOneNonterminalAttempt,
  assertTaskTransition,
  attemptStates,
  canAttemptTransition,
  canCaseTransition,
  canTaskTransition,
  caseStates,
  completionEvidenceErrors,
  decideRequestDedupe,
  taskStates,
  type AttemptStateKey,
  type CaseStateKey,
  type TaskStateKey,
} from "./typescript/state.ts";

const allowedCase = new Set([
  "active>paused", "paused>active", "active>cancelling", "paused>cancelling",
  "active>terminal:completed", "active>terminal:failed", "active>terminal:rolled_back", "active>terminal:unverified",
  "paused>terminal:completed", "paused>terminal:failed", "paused>terminal:rolled_back", "paused>terminal:unverified",
  "cancelling>terminal:cancelled", "cancelling>terminal:failed", "cancelling>terminal:unverified", "cancelling>terminal:rolled_back",
]);

const allowedTask = new Set([
  "waiting:approval>ready", "waiting:approval>active", "waiting:approval>terminal:cancelled", "waiting:approval>terminal:denied",
  "waiting:input>ready", "waiting:input>active", "waiting:input>terminal:cancelled", "waiting:input>terminal:failed",
  "waiting:retry_decision>ready", "waiting:retry_decision>active", "waiting:retry_decision>terminal:cancelled", "waiting:retry_decision>terminal:unverified",
  "ready>active", "ready>cancelling", "ready>terminal:cancelled",
  "active>waiting:approval", "active>waiting:input", "active>waiting:retry_decision", "active>cancelling",
  "active>terminal:succeeded", "active>terminal:failed", "active>terminal:cancelled", "active>terminal:denied", "active>terminal:unverified",
  "cancelling>terminal:succeeded", "cancelling>terminal:cancelled", "cancelling>terminal:failed", "cancelling>terminal:unverified",
]);

const attemptTerminalOutcomes = ["succeeded", "failed", "cancelled", "interrupted", "rejected", "input_required", "unverified"];
const allowedAttempt = new Set([
  "dispatch_pending>queued", "dispatch_pending>reconciling", "dispatch_pending>cancel_requested",
  "queued>running", "queued>reconciling", "queued>cancel_requested",
  "running>reconciling", "running>cancel_requested",
  "reconciling>queued", "reconciling>running", "reconciling>cancel_requested",
  ...["dispatch_pending", "queued", "running", "reconciling", "cancel_requested"].flatMap((from) =>
    attemptTerminalOutcomes.map((outcome) => `${from}>terminal:${outcome}`)),
]);

function verifyMatrix<T extends string>(
  states: readonly T[],
  expected: ReadonlySet<string>,
  canTransition: (from: T, to: T) => boolean,
  assertTransition: (from: T, to: T) => void,
): void {
  for (const from of states) {
    for (const to of states) {
      const key = `${from}>${to}`;
      const allowed = expected.has(key);
      assert.equal(canTransition(from, to), allowed, key);
      if (allowed) assert.doesNotThrow(() => assertTransition(from, to), key);
      else assert.throws(() => assertTransition(from, to), undefined, key);
    }
  }
}

test("complete Case, Task, and Attempt transition matrices", () => {
  verifyMatrix<CaseStateKey>(caseStates, allowedCase, canCaseTransition, assertCaseTransition);
  verifyMatrix<TaskStateKey>(taskStates, allowedTask, canTaskTransition, assertTaskTransition);
  verifyMatrix<AttemptStateKey>(attemptStates, allowedAttempt, canAttemptTransition, assertAttemptTransition);
});

test("terminal states are immutable and a Task has at most one nonterminal Attempt", () => {
  for (const from of caseStates.filter((state) => state.startsWith("terminal:"))) {
    for (const to of caseStates) assert.equal(canCaseTransition(from, to), false, `${from}>${to}`);
  }
  for (const from of taskStates.filter((state) => state.startsWith("terminal:"))) {
    for (const to of taskStates) assert.equal(canTaskTransition(from, to), false, `${from}>${to}`);
  }
  for (const from of attemptStates.filter((state) => state.startsWith("terminal:"))) {
    for (const to of attemptStates) assert.equal(canAttemptTransition(from, to), false, `${from}>${to}`);
  }
  assert.doesNotThrow(() => assertOneNonterminalAttempt(["queued", "terminal:failed"]));
  assert.doesNotThrow(() => assertOneNonterminalAttempt(["terminal:succeeded", "terminal:failed"]));
  assert.throws(() => assertOneNonterminalAttempt(["queued", "reconciling"]));
});

test("request dedupe distinguishes new, duplicate, and conflicting requests", () => {
  const incoming = { requestId: "request_abcdefgh", semanticDigest: "a".repeat(64) };
  assert.equal(decideRequestDedupe(undefined, incoming), "new");
  assert.equal(decideRequestDedupe({ ...incoming }, incoming), "duplicate");
  assert.equal(decideRequestDedupe({ ...incoming, semanticDigest: "b".repeat(64) }, incoming), "conflict");
  assert.equal(decideRequestDedupe({ ...incoming, requestId: "request_other123" }, incoming), "new");
});

test("completion evidence covers every mandatory criterion and requirement", () => {
  const required = { build: ["source", "validation"], publish: ["remote"] };
  const complete = [
    { criterionId: "build", requirementIds: ["source", "validation"], evidenceCount: 2 },
    { criterionId: "publish", requirementIds: ["remote"], evidenceCount: 1 },
  ];
  assert.deepEqual(completionEvidenceErrors(["build", "publish"], required, complete), []);
  assert.deepEqual(
    completionEvidenceErrors(["build", "publish"], required, [
      { criterionId: "build", requirementIds: ["source"], evidenceCount: 0 },
    ]),
    ["empty criterion evidence: build", "missing criterion evidence: publish", "missing requirement evidence: build/validation"],
  );
  assert.deepEqual(
    completionEvidenceErrors(["build"], required, [
      { criterionId: "build", requirementIds: ["source", "validation"], evidenceCount: 1 },
      { criterionId: "build", requirementIds: ["source", "validation"], evidenceCount: 1 },
    ]),
    ["duplicate criterion mapping: build"],
  );
});
