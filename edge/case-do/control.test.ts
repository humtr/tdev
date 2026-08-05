import assert from "node:assert/strict";
import test from "node:test";
import type {
  AttemptRecord,
  CaseEvent,
  CaseState,
  TaskRecord,
} from "../../protocol/generated/typescript/types.ts";
import {
  CaseDoControlRepository,
  type ControlFaultPoint,
  type PreparedControlMutation,
} from "./control.ts";
import { CaseDoQueryRepository } from "./query.ts";
import { StorageError } from "./schema.ts";
import {
  canonicalFixture,
  caseEvent,
  createSeededDatabase,
  tableCount,
  TEST_VALIDATOR,
} from "./test-fixtures.ts";

const cursorKeys = { current: { generation: 1, key: new Uint8Array(32).fill(17) } } as const;
const committedAt = "2026-08-05T00:30:00Z";

function event(
  source: CaseEvent,
  caseId: string,
  requestId: string,
  sequence: number,
  suffix: string,
  eventType: string,
  entity: CaseEvent["entity"],
  transition?: Readonly<{ from: string; to: string }>,
): CaseEvent {
  const base = caseEvent(
    source,
    caseId,
    requestId,
    sequence,
    `event_control_${suffix}`,
    eventType,
    entity,
    committedAt,
  );
  return transition === undefined ? base : { ...base, transition };
}

function seededControl() {
  const seeded = createSeededDatabase(true);
  return {
    ...seeded,
    control: new CaseDoControlRepository(seeded.db, TEST_VALIDATOR),
    query: new CaseDoQueryRepository(seeded.db, TEST_VALIDATOR, cursorKeys),
  };
}

function pauseMutation(
  seeded: ReturnType<typeof seededControl>,
  overrides: Partial<PreparedControlMutation> = {},
): PreparedControlMutation {
  const current = seeded.repository.readCaseState(seeded.admission.contract.caseId)!.value;
  const requestId = overrides.requestId ?? "request_control_pause1";
  const nextCaseState: CaseState = {
    ...current,
    caseRevision: current.caseRevision + 1,
    eventSequence: current.eventSequence + 1,
    status: { kind: "paused", reason: "manual", pausedAt: committedAt, detail: "bounded pause" },
    updatedAt: committedAt,
  };
  const source = canonicalFixture<CaseEvent>("CaseEvent");
  return {
    kind: "case_pause",
    requestId,
    semanticDigest: "1".repeat(64),
    caseId: current.caseId,
    nextCaseState,
    events: [event(source, current.caseId, requestId, current.eventSequence + 1, "pause1", "CasePaused", { kind: "case", caseId: current.caseId }, { from: "active", to: "paused" })],
    value: { action: "pause" },
    ...overrides,
  };
}

function assertInitialRows(seeded: ReturnType<typeof seededControl>): void {
  assert.deepEqual(seeded.repository.readCaseState(seeded.admission.contract.caseId)!.value, seeded.admission.state);
  assert.equal(tableCount(seeded.db, "events"), seeded.admission.events.length);
  assert.equal(tableCount(seeded.db, "mutation_receipts"), 1);
  assert.equal(tableCount(seeded.db, "checkpoints"), 0);
}

test("case pause commits once, replays original response, and conflicts without another transition", () => {
  const seeded = seededControl();
  try {
    const mutation = pauseMutation(seeded);
    const first = seeded.control.apply(mutation);
    assert.equal(first.deduplicated, false);
    assert.equal(first.committedCaseRevision, 2);
    assert.equal(tableCount(seeded.db, "events"), seeded.admission.events.length + 1);
    const replay = seeded.control.apply(mutation);
    assert.deepEqual({ ...replay, deduplicated: false }, first);
    assert.equal(replay.deduplicated, true);
    assert.equal(tableCount(seeded.db, "events"), seeded.admission.events.length + 1);
    assert.throws(
      () => seeded.control.apply({ ...mutation, semanticDigest: "2".repeat(64) }),
      (error: unknown) => error instanceof StorageError && error.code === "REQUEST_ID_CONFLICT",
    );
    assert.equal(tableCount(seeded.db, "events"), seeded.admission.events.length + 1);
  } finally {
    seeded.db.close();
  }
});

const PRECOMMIT_FAULTS: readonly ControlFaultPoint[] = [
  "after_receipt_check",
  "after_validation",
  "after_case_update",
  "after_task_updates",
  "after_attempt_updates",
  "after_attempt_inserts",
  "after_immutable_rows",
  "after_events",
  "before_receipt",
  "after_receipt",
  "before_commit",
];

test("every control pre-commit fault rolls back Case, Event, receipt, and immutable rows", () => {
  for (const point of PRECOMMIT_FAULTS) {
    const seeded = seededControl();
    try {
      assert.throws(
        () => seeded.control.apply(pauseMutation(seeded, {
          fault: (candidate) => {
            if (candidate === point) throw new Error(point);
          },
        })),
        new RegExp(point),
      );
      assertInitialRows(seeded);
    } finally {
      seeded.db.close();
    }
  }
});

test("post-commit response loss is recovered from the immutable control receipt", () => {
  const seeded = seededControl();
  try {
    const mutation = pauseMutation(seeded, {
      fault: (point) => {
        if (point === "after_commit") throw new Error("lost response");
      },
    });
    assert.throws(
      () => seeded.control.apply(mutation),
      (error: unknown) => error instanceof StorageError && error.code === "RESPONSE_LOST" && error.committed,
    );
    assert.equal(seeded.repository.readCaseState(seeded.admission.contract.caseId)!.value.caseRevision, 2);
    const replay = seeded.control.apply(mutation);
    assert.equal(replay.deduplicated, true);
    assert.equal(replay.committedCaseRevision, 2);
  } finally {
    seeded.db.close();
  }
});

test("checkpoint commits an immutable row with two contiguous Events and becomes the latest query snapshot", () => {
  const seeded = seededControl();
  try {
    const current = seeded.repository.readCaseState(seeded.admission.contract.caseId)!.value;
    const requestId = "request_checkpoint01";
    const nextCaseState: CaseState = {
      ...current,
      caseRevision: current.caseRevision + 1,
      eventSequence: current.eventSequence + 2,
      updatedAt: committedAt,
    };
    const checkpoint = {
      schemaVersion: 1 as const,
      checkpointId: "checkpoint_control01",
      caseId: current.caseId,
      caseRevision: nextCaseState.caseRevision,
      eventSequence: nextCaseState.eventSequence,
      summary: "control core checkpoint",
      completedTaskIds: [] as readonly string[],
      pendingDecisionIds: [] as readonly string[],
      evidenceRefs: [] as const,
      createdAt: committedAt,
    };
    const source = canonicalFixture<CaseEvent>("CaseEvent");
    const result = seeded.control.apply({
      kind: "checkpoint",
      requestId,
      semanticDigest: "3".repeat(64),
      caseId: current.caseId,
      nextCaseState,
      checkpoint,
      events: [
        event(source, current.caseId, requestId, current.eventSequence + 1, "checkpoint1", "CheckpointCreated", { kind: "case", caseId: current.caseId }),
        event(source, current.caseId, requestId, current.eventSequence + 2, "checkpoint2", "CaseProjectionChanged", { kind: "case", caseId: current.caseId }),
      ],
      value: { checkpointId: checkpoint.checkpointId },
    });
    assert.equal(result.committedEventSequence, nextCaseState.eventSequence);
    assert.equal(tableCount(seeded.db, "checkpoints"), 1);
    assert.equal(seeded.query.getCase(current.caseId).latestCheckpointId, checkpoint.checkpointId);
  } finally {
    seeded.db.close();
  }
});

test("cancel_task atomically records cooperative intent on the active Task and current Attempt", () => {
  const seeded = seededControl();
  try {
    const currentCase = seeded.repository.readCaseState(seeded.admission.contract.caseId)!.value;
    const currentTask = seeded.repository.readTask(currentCase.caseId, seeded.admission.task.taskId)!.value;
    const currentAttempt = seeded.repository.readAttempt(currentCase.caseId, currentTask.taskId, currentTask.latestAttemptId!)!.value;
    const requestId = "request_cancel_task1";
    const nextTask: TaskRecord = {
      ...currentTask,
      taskRevision: currentTask.taskRevision + 1,
      status: { kind: "cancelling", attemptId: currentAttempt.attemptId, cancellationId: "cancel_control01", requestedAt: committedAt },
      updatedAt: committedAt,
    };
    const nextAttempt: AttemptRecord = {
      ...currentAttempt,
      attemptRevision: currentAttempt.attemptRevision + 1,
      status: { kind: "cancel_requested", previous: "dispatch_pending", requestedAt: committedAt },
      updatedAt: committedAt,
    };
    const nextCaseState: CaseState = {
      ...currentCase,
      eventSequence: currentCase.eventSequence + 2,
      updatedAt: committedAt,
    };
    const source = canonicalFixture<CaseEvent>("CaseEvent");
    seeded.control.apply({
      kind: "cancel_task",
      requestId,
      semanticDigest: "4".repeat(64),
      caseId: currentCase.caseId,
      taskId: currentTask.taskId,
      nextCaseState,
      taskUpdates: [nextTask],
      attemptUpdates: [nextAttempt],
      events: [
        event(source, currentCase.caseId, requestId, currentCase.eventSequence + 1, "canceltask1", "TaskCancellationRequested", { kind: "task", taskId: currentTask.taskId }, { from: "active", to: "cancelling" }),
        event(source, currentCase.caseId, requestId, currentCase.eventSequence + 2, "canceltask2", "AttemptCancellationRequested", { kind: "attempt", attemptId: currentAttempt.attemptId }, { from: "dispatch_pending", to: "cancel_requested" }),
      ],
      value: { cancellationId: "cancel_control01" },
    });
    assert.equal(seeded.repository.readTask(currentCase.caseId, currentTask.taskId)!.value.status.kind, "cancelling");
    assert.equal(seeded.repository.readAttempt(currentCase.caseId, currentTask.taskId, currentAttempt.attemptId)!.value.status.kind, "cancel_requested");
    assert.equal(seeded.repository.readCaseState(currentCase.caseId)!.value.caseRevision, currentCase.caseRevision);
  } finally {
    seeded.db.close();
  }
});

function queueAttempt(seeded: ReturnType<typeof seededControl>): void {
  const currentCase = seeded.repository.readCaseState(seeded.admission.contract.caseId)!.value;
  const currentAttempt = seeded.repository.readAttempt(currentCase.caseId, seeded.admission.task.taskId, seeded.admission.attempt!.attemptId)!.value;
  const requestId = "request_attempt_queue1";
  const nextAttempt: AttemptRecord = {
    ...currentAttempt,
    attemptRevision: currentAttempt.attemptRevision + 1,
    status: { kind: "queued", agentEpoch: 1, fencingToken: "fence_control001", queuedAt: committedAt },
    updatedAt: committedAt,
  };
  const nextCaseState: CaseState = { ...currentCase, eventSequence: currentCase.eventSequence + 1, updatedAt: committedAt };
  const source = canonicalFixture<CaseEvent>("CaseEvent");
  seeded.control.apply({
    kind: "attempt_progress",
    requestId,
    semanticDigest: "5".repeat(64),
    caseId: currentCase.caseId,
    taskId: seeded.admission.task.taskId,
    attemptId: currentAttempt.attemptId,
    nextCaseState,
    attemptUpdates: [nextAttempt],
    events: [event(source, currentCase.caseId, requestId, currentCase.eventSequence + 1, "queue1", "AttemptTransitioned", { kind: "attempt", attemptId: currentAttempt.attemptId }, { from: "dispatch_pending", to: "queued" })],
    value: { status: "queued" },
  });
}

test("Attempt progress preserves Case revision and a valid success racing after cancellation wins", () => {
  const seeded = seededControl();
  try {
    queueAttempt(seeded);
    let currentCase = seeded.repository.readCaseState(seeded.admission.contract.caseId)!.value;
    let currentTask = seeded.repository.readTask(currentCase.caseId, seeded.admission.task.taskId)!.value;
    let currentAttempt = seeded.repository.readAttempt(currentCase.caseId, currentTask.taskId, currentTask.latestAttemptId!)!.value;
    assert.equal(currentAttempt.status.kind, "queued");
    assert.equal(currentCase.caseRevision, 1);

    const cancelAt = "2026-08-05T00:31:00Z";
    const cancelTask: TaskRecord = {
      ...currentTask,
      taskRevision: currentTask.taskRevision + 1,
      status: { kind: "cancelling", attemptId: currentAttempt.attemptId, cancellationId: "cancel_race_00001", requestedAt: cancelAt },
      updatedAt: cancelAt,
    };
    const cancelAttempt: AttemptRecord = {
      ...currentAttempt,
      attemptRevision: currentAttempt.attemptRevision + 1,
      status: { kind: "cancel_requested", previous: "queued", requestedAt: cancelAt },
      updatedAt: cancelAt,
    };
    const source = canonicalFixture<CaseEvent>("CaseEvent");
    const cancelRequest = "request_cancel_race1";
    seeded.control.apply({
      kind: "cancel_task",
      requestId: cancelRequest,
      semanticDigest: "6".repeat(64),
      caseId: currentCase.caseId,
      taskId: currentTask.taskId,
      nextCaseState: { ...currentCase, eventSequence: currentCase.eventSequence + 2, updatedAt: cancelAt },
      taskUpdates: [cancelTask],
      attemptUpdates: [cancelAttempt],
      events: [
        { ...event(source, currentCase.caseId, cancelRequest, currentCase.eventSequence + 1, "racecancel1", "TaskCancellationRequested", { kind: "task", taskId: currentTask.taskId }, { from: "active", to: "cancelling" }), committedAt: cancelAt },
        { ...event(source, currentCase.caseId, cancelRequest, currentCase.eventSequence + 2, "racecancel2", "AttemptCancellationRequested", { kind: "attempt", attemptId: currentAttempt.attemptId }, { from: "queued", to: "cancel_requested" }), committedAt: cancelAt },
      ],
      value: { cancellationId: "cancel_race_00001" },
    });

    currentCase = seeded.repository.readCaseState(currentCase.caseId)!.value;
    currentTask = seeded.repository.readTask(currentCase.caseId, currentTask.taskId)!.value;
    currentAttempt = seeded.repository.readAttempt(currentCase.caseId, currentTask.taskId, currentAttempt.attemptId)!.value;
    const successAt = "2026-08-05T00:32:00Z";
    const resultDigest = "7".repeat(64);
    const terminalAttempt: AttemptRecord = {
      ...currentAttempt,
      attemptRevision: currentAttempt.attemptRevision + 1,
      status: { kind: "terminal", terminal: { outcome: "succeeded", finishedAt: successAt, resultEnvelopeDigest: "8".repeat(64) } },
      updatedAt: successAt,
    };
    const terminalTask: TaskRecord = {
      ...currentTask,
      taskRevision: currentTask.taskRevision + 1,
      status: { kind: "terminal", terminal: { outcome: "succeeded", finishedAt: successAt, result: { kind: "none", resultDigest } } },
      updatedAt: successAt,
    };
    const successRequest = "request_success_race1";
    const successResult = seeded.control.apply({
      kind: "attempt_result",
      requestId: successRequest,
      semanticDigest: "9".repeat(64),
      caseId: currentCase.caseId,
      taskId: currentTask.taskId,
      attemptId: currentAttempt.attemptId,
      nextCaseState: { ...currentCase, eventSequence: currentCase.eventSequence + 2, updatedAt: successAt },
      taskUpdates: [terminalTask],
      attemptUpdates: [terminalAttempt],
      events: [
        { ...event(source, currentCase.caseId, successRequest, currentCase.eventSequence + 1, "racesuccess1", "AttemptTerminal", { kind: "attempt", attemptId: currentAttempt.attemptId }, { from: "cancel_requested", to: "terminal:succeeded" }), committedAt: successAt },
        { ...event(source, currentCase.caseId, successRequest, currentCase.eventSequence + 2, "racesuccess2", "TaskTerminal", { kind: "task", taskId: currentTask.taskId }, { from: "cancelling", to: "terminal:succeeded" }), committedAt: successAt },
      ],
      value: { resultDigest },
    });
    assert.equal(successResult.committedTaskRevision, terminalTask.taskRevision);
    assert.equal(seeded.repository.readTask(currentCase.caseId, currentTask.taskId)!.value.status.kind, "terminal");
    assert.equal(seeded.repository.readAttempt(currentCase.caseId, currentTask.taskId, currentAttempt.attemptId)!.value.status.kind, "terminal");
  } finally {
    seeded.db.close();
  }
});
