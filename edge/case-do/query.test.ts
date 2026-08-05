import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type {
  CaseEvent,
  CaseState,
  JsonValue,
  MutationReceiptV1,
} from "../../protocol/generated/typescript/types.ts";
import { canonicalJsonDigest, encodeCanonicalJson } from "./records.ts";
import { CaseDoQueryRepository, utf8RenderChunk } from "./query.ts";
import { StorageError } from "./schema.ts";
import {
  canonicalFixture,
  caseEvent,
  createSeededDatabase,
  tableCount,
  TEST_VALIDATOR,
} from "./test-fixtures.ts";

const cursorKeys = {
  current: { generation: 3, key: new Uint8Array(32).fill(11) },
  previous: { generation: 2, key: new Uint8Array(32).fill(5) },
} as const;
const principalBindingDigest = "d".repeat(64);
const now = "2026-08-05T00:00:00.000Z";

function queryRepository(includeAttempt = true) {
  const seeded = createSeededDatabase(includeAttempt);
  return {
    ...seeded,
    query: new CaseDoQueryRepository(seeded.db, TEST_VALIDATOR, cursorKeys),
  };
}

function pauseCase(seeded: ReturnType<typeof queryRepository>): void {
  const current = seeded.repository.readCaseState(seeded.admission.contract.caseId)!.value;
  const nextState: CaseState = {
    ...current,
    caseRevision: current.caseRevision + 1,
    eventSequence: current.eventSequence + 1,
    status: { kind: "paused", reason: "manual", pausedAt: now, detail: "query snapshot invalidation" },
    updatedAt: now,
  };
  const source = canonicalFixture<CaseEvent>("CaseEvent");
  const event = {
    ...caseEvent(
      source,
      current.caseId,
      "request_querymutation1",
      nextState.eventSequence,
      "event_querymutation1",
      "CasePaused",
      { kind: "case", caseId: current.caseId },
      now,
    ),
    transition: { from: "active", to: "paused" },
  } satisfies CaseEvent;
  const response: JsonValue = {
    accepted: true,
    deduplicated: false,
    requestId: "request_querymutation1",
    caseId: current.caseId,
    committedCaseRevision: nextState.caseRevision,
    committedEventSequence: nextState.eventSequence,
    value: { action: "pause" },
  };
  const responseBytes = encodeCanonicalJson(response);
  const receipt: MutationReceiptV1 = {
    schemaVersion: 1,
    requestId: "request_querymutation1",
    capability: "control_case",
    semanticDigest: "e".repeat(64),
    caseId: current.caseId,
    subject: { kind: "case", caseId: current.caseId },
    response,
    responseDigest: canonicalJsonDigest(responseBytes),
    committedCaseRevision: nextState.caseRevision,
    committedEventSequence: nextState.eventSequence,
    createdAt: now,
  };
  seeded.repository.commitCaseStateTransition({
    expectedCaseRevision: current.caseRevision,
    nextState,
    event,
    receipt,
  });
}

test("get_case and get_task return canonical bounded summaries without mutation", () => {
  const seeded = queryRepository();
  const before = {
    events: tableCount(seeded.db, "events"),
    receipts: tableCount(seeded.db, "mutation_receipts"),
  };
  const caseResult = seeded.query.getCase(seeded.admission.contract.caseId);
  assert.deepEqual(caseResult.contract, seeded.admission.contract);
  assert.deepEqual(caseResult.state, seeded.admission.state);
  assert.equal(caseResult.taskCount, 1);
  assert.equal(caseResult.latestCheckpointId, undefined);
  const taskResult = seeded.query.getTask(seeded.admission.contract.caseId, seeded.admission.task.taskId);
  assert.deepEqual(taskResult.task, seeded.admission.task);
  assert.deepEqual(taskResult.latestAttempt, seeded.admission.attempt);
  assert.equal(taskResult.attemptCount, 1);
  assert.deepEqual(taskResult.snapshot, {
    caseRevision: 1,
    taskRevision: 1,
    eventSequence: seeded.admission.events.length,
  });
  assert.deepEqual({
    events: tableCount(seeded.db, "events"),
    receipts: tableCount(seeded.db, "mutation_receipts"),
  }, before);
});

test("list_resources uses stable ordering, exact event URIs, and rejects a changed snapshot", () => {
  const seeded = queryRepository();
  const first = seeded.query.listResources({
    caseId: seeded.admission.contract.caseId,
    kinds: ["case", "task", "attempt", "event"],
    page: { limit: 2 },
    principalBindingDigest,
    now,
  });
  assert.equal(first.resources.length, 2);
  assert.ok(first.page.nextCursor);
  const all = [...first.resources];
  let cursor = first.page.nextCursor;
  while (cursor !== undefined) {
    const page = seeded.query.listResources({
      caseId: seeded.admission.contract.caseId,
      kinds: ["case", "task", "attempt", "event"],
      page: { limit: 2, cursor },
      principalBindingDigest,
      now,
    });
    all.push(...page.resources);
    cursor = page.page.nextCursor;
  }
  assert.equal(all.length, 3 + seeded.admission.events.length);
  assert.equal(new Set(all.map((item) => `${item.kind}:${item.subjectId}`)).size, all.length);
  for (const event of all.filter((item) => item.kind === "event")) {
    assert.match(event.uri, new RegExp(`^tdev://events/${seeded.admission.contract.caseId}/event_`));
  }

  const stale = seeded.query.listResources({
    caseId: seeded.admission.contract.caseId,
    kinds: ["event"],
    page: { limit: 1 },
    principalBindingDigest,
    now,
  });
  assert.ok(stale.page.nextCursor);
  pauseCase(seeded);
  assert.throws(
    () => seeded.query.listResources({
      caseId: seeded.admission.contract.caseId,
      kinds: ["event"],
      page: { limit: 1, cursor: stale.page.nextCursor },
      principalBindingDigest,
      now,
    }),
    (error: unknown) => error instanceof StorageError && error.reason === "INVALID_CURSOR",
  );
});

test("render_task continuation reproduces one full snapshot digest", () => {
  const seeded = queryRepository();
  const chunks: string[] = [];
  let cursor: string | undefined;
  let renderDigest: string | undefined;
  let iterations = 0;
  do {
    const result = seeded.query.renderTask({
      caseId: seeded.admission.contract.caseId,
      taskId: seeded.admission.task.taskId,
      format: "markdown",
      maxBytes: 37,
      ...(cursor === undefined ? {} : { cursor }),
      principalBindingDigest,
      now,
    });
    chunks.push(result.text);
    renderDigest ??= result.renderDigest;
    assert.equal(result.renderDigest, renderDigest);
    cursor = result.nextCursor;
    iterations += 1;
    assert.ok(iterations < 100);
  } while (cursor !== undefined);
  const full = chunks.join("");
  assert.equal(createHash("sha256").update(new TextEncoder().encode(full)).digest("hex"), renderDigest);
  assert.match(full, /^# Task /);
  assert.match(full, /\*\*Attempt status:\*\*/);
});

test("UTF-8 render chunks never split a scalar or insert replacement text", () => {
  const bytes = new TextEncoder().encode("가나다라마");
  const first = utf8RenderChunk(bytes, 0, 4);
  const second = utf8RenderChunk(bytes, first.nextOffset, 4);
  assert.equal(first.text, "가");
  assert.equal(second.text, "나");
  assert.equal(first.nextOffset, 3);
  assert.equal(second.nextOffset, 6);
  assert.doesNotMatch(first.text + second.text, /�/);
});
