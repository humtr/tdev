import assert from "node:assert/strict";
import test from "node:test";
import type {
  AttemptRecord,
  CaseEvent,
  CaseState,
  EvidenceSet,
  TaskRecord,
} from "../../protocol/generated/typescript/types.ts";
import { CaseDoControlRepository } from "./control.ts";
import { CaseDoQueryRepository } from "./query.ts";
import { StorageError } from "./schema.ts";
import {
  canonicalFixture,
  caseEvent,
  createSeededDatabase,
  tableCount,
  TEST_VALIDATOR,
} from "./test-fixtures.ts";

const keys = { current: { generation: 8, key: new Uint8Array(32).fill(29) } } as const;
const principalBindingDigest = "d".repeat(64);
const sourceEvent = canonicalFixture<CaseEvent>("CaseEvent");

type Seeded = ReturnType<typeof seededControl>;
type WaitingKind = "approval" | "input" | "retry_decision";

function seededControl() {
  const seeded = createSeededDatabase(true);
  return {
    ...seeded,
    control: new CaseDoControlRepository(seeded.db, TEST_VALIDATOR),
    query: new CaseDoQueryRepository(seeded.db, TEST_VALIDATOR, keys),
  };
}

function evt(
  caseId: string,
  requestId: string,
  sequence: number,
  id: string,
  type: string,
  entity: CaseEvent["entity"],
  at: string,
  transition?: Readonly<{ from: string; to: string }>,
): CaseEvent {
  const base = caseEvent(sourceEvent, caseId, requestId, sequence, id, type, entity, at);
  return transition === undefined ? base : { ...base, transition };
}

function current(seed: Seeded) {
  const caseId = seed.admission.contract.caseId;
  const taskId = seed.admission.task.taskId;
  const state = seed.repository.readCaseState(caseId)!.value;
  const task = seed.repository.readTask(caseId, taskId)!.value;
  const attempt = seed.repository.readAttempt(caseId, taskId, task.latestAttemptId!)!.value;
  return { caseId, taskId, state, task, attempt };
}

function moveToWaiting(seed: Seeded, kind: WaitingKind, suffix: string, at: string) {
  const before = current(seed);
  const requestId = `request_wait_${suffix}`;
  const slotId = `${kind === "approval" ? "approval" : kind === "input" ? "input" : "retry"}_${suffix}_0001`;
  const terminal = kind === "input"
    ? { outcome: "input_required" as const, inputRequestId: slotId, finishedAt: at }
    : kind === "approval"
      ? { outcome: "rejected" as const, rejection: { code: "approval_required", message: "approval required", retryable: false }, finishedAt: at }
      : { outcome: "failed" as const, failure: { code: "retryable", message: "retry decision required", retryable: true }, finishedAt: at };
  const nextAttempt: AttemptRecord = {
    ...before.attempt,
    attemptRevision: before.attempt.attemptRevision + 1,
    status: { kind: "terminal", terminal },
    updatedAt: at,
  };
  const waiting = kind === "approval"
    ? { reason: "approval" as const, approvalRequestId: slotId }
    : kind === "input"
      ? { reason: "input" as const, inputRequestId: slotId }
      : { reason: "retry_decision" as const, retryDecisionId: slotId };
  const nextTask: TaskRecord = {
    ...before.task,
    taskRevision: before.task.taskRevision + 1,
    status: { kind: "waiting", waiting },
    updatedAt: at,
  };
  const nextState: CaseState = {
    ...before.state,
    eventSequence: before.state.eventSequence + 2,
    updatedAt: at,
  };
  const approvalRequest = kind === "approval" ? {
    schemaVersion: 1 as const,
    approvalRequestId: slotId,
    caseId: before.caseId,
    taskId: before.taskId,
    expectedTaskRevision: nextTask.taskRevision,
    request: { action: "approve operation" },
    createdAt: at,
  } : undefined;
  const inputRequest = kind === "input" ? {
    schemaVersion: 1 as const,
    inputRequestId: slotId,
    caseId: before.caseId,
    taskId: before.taskId,
    expectedTaskRevision: nextTask.taskRevision,
    inputSchemaDigest: "a".repeat(64),
    request: { prompt: "provide bounded input" },
    createdAt: at,
  } : undefined;
  seed.control.apply({
    kind: "attempt_result",
    requestId,
    semanticDigest: (kind === "approval" ? "a" : kind === "input" ? "b" : "c").repeat(64),
    caseId: before.caseId,
    taskId: before.taskId,
    attemptId: before.attempt.attemptId,
    nextCaseState: nextState,
    taskUpdates: [nextTask],
    attemptUpdates: [nextAttempt],
    ...(approvalRequest === undefined ? {} : { approvalRequest }),
    ...(inputRequest === undefined ? {} : { inputRequest }),
    events: [
      evt(before.caseId, requestId, before.state.eventSequence + 1, `event_wait_${suffix}_1`, "AttemptTerminal", { kind: "attempt", attemptId: before.attempt.attemptId }, at, { from: "dispatch_pending", to: `terminal:${terminal.outcome}` }),
      evt(before.caseId, requestId, before.state.eventSequence + 2, `event_wait_${suffix}_2`, "TaskTransitioned", { kind: "task", taskId: before.taskId }, at, { from: "active", to: `waiting:${kind}` }),
    ],
    value: { waiting: kind, slotId },
  });
  return { ...current(seed), slotId };
}

function newAttempt(previous: AttemptRecord, task: TaskRecord, suffix: string, at: string): AttemptRecord {
  return {
    ...previous,
    attemptId: `attempt_${suffix}_0002`,
    ordinal: previous.ordinal + 1,
    attemptRevision: 1,
    dispatchId: `dispatch_${suffix}_0002`,
    expectedTaskRevision: task.taskRevision,
    operationInputDigest: task.operation.inputDigest,
    status: { kind: "dispatch_pending" },
    createdAt: at,
    updatedAt: at,
  };
}

function terminalizeSuccess(seed: Seeded, suffix: string, at: string) {
  const before = current(seed);
  const resultDigest = "7".repeat(64);
  const nextAttempt: AttemptRecord = {
    ...before.attempt,
    attemptRevision: before.attempt.attemptRevision + 1,
    status: { kind: "terminal", terminal: { outcome: "succeeded", finishedAt: at, resultEnvelopeDigest: "8".repeat(64) } },
    updatedAt: at,
  };
  const nextTask: TaskRecord = {
    ...before.task,
    taskRevision: before.task.taskRevision + 1,
    status: { kind: "terminal", terminal: { outcome: "succeeded", finishedAt: at, result: { kind: "none", resultDigest } } },
    updatedAt: at,
  };
  const requestId = `request_success_${suffix}`;
  seed.control.apply({
    kind: "attempt_result",
    requestId,
    semanticDigest: "9".repeat(64),
    caseId: before.caseId,
    taskId: before.taskId,
    attemptId: before.attempt.attemptId,
    nextCaseState: { ...before.state, eventSequence: before.state.eventSequence + 2, updatedAt: at },
    taskUpdates: [nextTask],
    attemptUpdates: [nextAttempt],
    events: [
      evt(before.caseId, requestId, before.state.eventSequence + 1, `event_success_${suffix}_1`, "AttemptTerminal", { kind: "attempt", attemptId: before.attempt.attemptId }, at, { from: "dispatch_pending", to: "terminal:succeeded" }),
      evt(before.caseId, requestId, before.state.eventSequence + 2, `event_success_${suffix}_2`, "TaskTerminal", { kind: "task", taskId: before.taskId }, at, { from: "active", to: "terminal:succeeded" }),
    ],
    value: { resultDigest },
  });
  return { ...current(seed), resultDigest };
}

test("input_required creates an outstanding request and provide_input consumes it exactly once", () => {
  const seed = seededControl();
  try {
    const waiting = moveToWaiting(seed, "input", "input01", "2026-08-05T01:00:00Z");
    assert.equal(seed.query.getTask(waiting.caseId, waiting.taskId).outstandingInputRequestId, waiting.slotId);
    const at = "2026-08-05T01:01:00Z";
    const requestId = "request_input_response01";
    const nextTask: TaskRecord = {
      ...waiting.task,
      taskRevision: waiting.task.taskRevision + 1,
      status: { kind: "ready", readyAt: at },
      updatedAt: at,
    };
    const response = {
      schemaVersion: 1 as const,
      inputResponseId: "input_response_0001",
      inputRequestId: waiting.slotId,
      caseId: waiting.caseId,
      taskId: waiting.taskId,
      expectedTaskRevision: waiting.task.taskRevision,
      value: { answer: "bounded" },
      createdAt: at,
    };
    seed.control.apply({
      kind: "provide_input",
      requestId,
      semanticDigest: "1".repeat(64),
      caseId: waiting.caseId,
      taskId: waiting.taskId,
      nextCaseState: { ...waiting.state, eventSequence: waiting.state.eventSequence + 2, updatedAt: at },
      taskUpdates: [nextTask],
      inputResponse: response,
      events: [
        evt(waiting.caseId, requestId, waiting.state.eventSequence + 1, "event_input_response_1", "InputResponseRecorded", { kind: "task", taskId: waiting.taskId }, at),
        evt(waiting.caseId, requestId, waiting.state.eventSequence + 2, "event_input_response_2", "TaskTransitioned", { kind: "task", taskId: waiting.taskId }, at, { from: "waiting:input", to: "ready" }),
      ],
      value: { inputResponseId: response.inputResponseId },
    });
    const after = seed.query.getTask(waiting.caseId, waiting.taskId);
    assert.equal(after.task.status.kind, "ready");
    assert.equal(after.outstandingInputRequestId, undefined);
    assert.equal(tableCount(seed.db, "input_responses"), 1);
  } finally {
    seed.db.close();
  }
});

test("approve and authorize_retry can atomically activate a new Attempt", () => {
  for (const kind of ["approval", "retry_decision"] as const) {
    const seed = seededControl();
    try {
      const waiting = moveToWaiting(seed, kind, kind === "approval" ? "approve01" : "retry01", "2026-08-05T01:10:00Z");
      const at = "2026-08-05T01:11:00Z";
      const action = kind === "approval" ? "approve" as const : "authorize_retry" as const;
      const requestId = kind === "approval" ? "request_approve_0001" : "request_authorize_retry01";
      const nextTaskBase: TaskRecord = {
        ...waiting.task,
        taskRevision: waiting.task.taskRevision + 1,
        status: { kind: "ready", readyAt: at },
        updatedAt: at,
      };
      const attempt = newAttempt(waiting.attempt, nextTaskBase, kind === "approval" ? "approve" : "retry", at);
      const nextTask: TaskRecord = {
        ...nextTaskBase,
        latestAttemptId: attempt.attemptId,
        status: { kind: "active", attemptId: attempt.attemptId },
      };
      const immutable = kind === "approval" ? {
        approvalDecision: {
          schemaVersion: 1 as const,
          approvalDecisionId: "approval_decision_0001",
          approvalRequestId: waiting.slotId,
          caseId: waiting.caseId,
          taskId: waiting.taskId,
          expectedTaskRevision: waiting.task.taskRevision,
          decision: { kind: "approve" as const, evidenceDigest: "2".repeat(64) },
          createdAt: at,
        },
      } : {
        retryDecision: {
          schemaVersion: 1 as const,
          retryDecisionId: waiting.slotId,
          caseId: waiting.caseId,
          taskId: waiting.taskId,
          attemptId: waiting.attempt.attemptId,
          expectedTaskRevision: waiting.task.taskRevision,
          decision: { kind: "authorize_retry" as const },
          createdAt: at,
        },
      };
      const recordedType = kind === "approval" ? "ApprovalDecisionRecorded" : "RetryDecisionRecorded";
      seed.control.apply({
        kind: action,
        requestId,
        semanticDigest: (kind === "approval" ? "3" : "4").repeat(64),
        caseId: waiting.caseId,
        taskId: waiting.taskId,
        nextCaseState: { ...waiting.state, eventSequence: waiting.state.eventSequence + 3, updatedAt: at },
        taskUpdates: [nextTask],
        attemptInserts: [attempt],
        ...immutable,
        events: [
          evt(waiting.caseId, requestId, waiting.state.eventSequence + 1, `event_${kind}_decision_1`, recordedType, { kind: "task", taskId: waiting.taskId }, at),
          evt(waiting.caseId, requestId, waiting.state.eventSequence + 2, `event_${kind}_decision_2`, "TaskTransitioned", { kind: "task", taskId: waiting.taskId }, at, { from: `waiting:${kind}`, to: "active" }),
          evt(waiting.caseId, requestId, waiting.state.eventSequence + 3, `event_${kind}_decision_3`, "AttemptCreated", { kind: "attempt", attemptId: attempt.attemptId }, at),
        ],
        value: { attemptId: attempt.attemptId },
      });
      const after = seed.query.getTask(waiting.caseId, waiting.taskId);
      assert.equal(after.task.status.kind, "active");
      assert.equal(after.latestAttempt?.attemptId, attempt.attemptId);
      assert.equal(after.attemptCount, 2);
    } finally {
      seed.db.close();
    }
  }
});

test("deny and decline_retry terminalize the waiting Task with the immutable decision", () => {
  for (const kind of ["approval", "retry_decision"] as const) {
    const seed = seededControl();
    try {
      const waiting = moveToWaiting(seed, kind, kind === "approval" ? "deny01" : "decline01", "2026-08-05T01:20:00Z");
      const at = "2026-08-05T01:21:00Z";
      const requestId = kind === "approval" ? "request_deny_000001" : "request_decline_retry01";
      const decisionId = kind === "approval" ? "approval_decision_deny01" : waiting.slotId;
      const nextTask: TaskRecord = kind === "approval" ? {
        ...waiting.task,
        taskRevision: waiting.task.taskRevision + 1,
        status: { kind: "terminal", terminal: { outcome: "denied", approvalDecisionId: decisionId, finishedAt: at } },
        updatedAt: at,
      } : {
        ...waiting.task,
        taskRevision: waiting.task.taskRevision + 1,
        status: { kind: "terminal", terminal: { outcome: "unverified", finishedAt: at, uncertainty: { code: "retry_declined", message: "retry declined", possibleEffects: [] } } },
        updatedAt: at,
      };
      const immutable = kind === "approval" ? {
        approvalDecision: {
          schemaVersion: 1 as const,
          approvalDecisionId: decisionId,
          approvalRequestId: waiting.slotId,
          caseId: waiting.caseId,
          taskId: waiting.taskId,
          expectedTaskRevision: waiting.task.taskRevision,
          decision: { kind: "deny" as const, reason: "not authorized" },
          createdAt: at,
        },
      } : {
        retryDecision: {
          schemaVersion: 1 as const,
          retryDecisionId: waiting.slotId,
          caseId: waiting.caseId,
          taskId: waiting.taskId,
          attemptId: waiting.attempt.attemptId,
          expectedTaskRevision: waiting.task.taskRevision,
          decision: { kind: "decline_retry" as const, terminal: "unverified" as const },
          createdAt: at,
        },
      };
      const action = kind === "approval" ? "deny" as const : "decline_retry" as const;
      const recordedType = kind === "approval" ? "ApprovalDecisionRecorded" : "RetryDecisionRecorded";
      const terminalKey = kind === "approval" ? "terminal:denied" : "terminal:unverified";
      seed.control.apply({
        kind: action,
        requestId,
        semanticDigest: (kind === "approval" ? "5" : "6").repeat(64),
        caseId: waiting.caseId,
        taskId: waiting.taskId,
        nextCaseState: { ...waiting.state, eventSequence: waiting.state.eventSequence + 2, updatedAt: at },
        taskUpdates: [nextTask],
        ...immutable,
        events: [
          evt(waiting.caseId, requestId, waiting.state.eventSequence + 1, `event_${kind}_terminal_1`, recordedType, { kind: "task", taskId: waiting.taskId }, at),
          evt(waiting.caseId, requestId, waiting.state.eventSequence + 2, `event_${kind}_terminal_2`, "TaskTransitioned", { kind: "task", taskId: waiting.taskId }, at, { from: `waiting:${kind}`, to: terminalKey }),
        ],
        value: { decisionId },
      });
      const after = seed.query.getTask(waiting.caseId, waiting.taskId);
      assert.equal(after.task.status.kind, "terminal");
    } finally {
      seed.db.close();
    }
  }
});

test("cancel_case records all Task events before all Attempt events in stable order", () => {
  const seed = seededControl();
  try {
    const before = current(seed);
    const secondTaskId = before.taskId + "z";
    const secondAttemptId = before.attempt.attemptId + "z";
    const secondTask: TaskRecord = {
      ...before.task,
      taskId: secondTaskId,
      sequence: before.task.sequence + 1,
      taskRevision: 1,
      latestAttemptId: secondAttemptId,
      status: { kind: "active", attemptId: secondAttemptId },
    };
    const secondAttempt: AttemptRecord = {
      ...before.attempt,
      taskId: secondTaskId,
      attemptId: secondAttemptId,
      ordinal: 1,
      attemptRevision: 1,
      dispatchId: before.attempt.dispatchId + "z",
      expectedTaskRevision: 1,
    };
    const secondTaskRecord = seed.repository.codecs.taskRecord.encode(secondTask);
    const secondAttemptRecord = seed.repository.codecs.attemptRecord.encode(secondAttempt);
    seed.db.exec("BEGIN IMMEDIATE");
    try {
      seed.db.run(
        `INSERT INTO tasks(case_id,task_id,task_sequence,operation_id,operation_version,status_kind,task_revision,latest_attempt_id,task_json,task_digest,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        before.caseId, secondTask.taskId, secondTask.sequence, secondTask.operation.id, secondTask.operation.version,
        secondTask.status.kind, secondTask.taskRevision, secondTask.latestAttemptId, secondTaskRecord.bytes, secondTaskRecord.digest,
        secondTask.createdAt, secondTask.updatedAt,
      );
      seed.db.run(
        `INSERT INTO attempts(case_id,task_id,attempt_id,attempt_ordinal,status_kind,attempt_revision,agent_id,dispatch_id,operation_input_digest,expected_task_revision,deadline_at,attempt_json,attempt_digest,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        before.caseId, secondAttempt.taskId, secondAttempt.attemptId, secondAttempt.ordinal, secondAttempt.status.kind,
        secondAttempt.attemptRevision, secondAttempt.agentId ?? null, secondAttempt.dispatchId, secondAttempt.operationInputDigest,
        secondAttempt.expectedTaskRevision, secondAttempt.deadlineAt, secondAttemptRecord.bytes, secondAttemptRecord.digest,
        secondAttempt.createdAt, secondAttempt.updatedAt,
      );
      seed.db.exec("COMMIT");
    } catch (error) {
      seed.db.exec("ROLLBACK");
      throw error;
    }
    const at = "2026-08-05T01:30:00Z";
    const requestId = "request_cancel_case01";
    const nextTask: TaskRecord = {
      ...before.task,
      taskRevision: before.task.taskRevision + 1,
      status: { kind: "cancelling", attemptId: before.attempt.attemptId, cancellationId: "cancel_case_000001", requestedAt: at },
      updatedAt: at,
    };
    const nextSecondTask: TaskRecord = {
      ...secondTask,
      taskRevision: 2,
      status: { kind: "cancelling", attemptId: secondAttemptId, cancellationId: "cancel_case_000001", requestedAt: at },
      updatedAt: at,
    };
    const nextAttempt: AttemptRecord = {
      ...before.attempt,
      attemptRevision: before.attempt.attemptRevision + 1,
      status: { kind: "cancel_requested", previous: "dispatch_pending", requestedAt: at },
      updatedAt: at,
    };
    const nextSecondAttempt: AttemptRecord = {
      ...secondAttempt,
      attemptRevision: 2,
      status: { kind: "cancel_requested", previous: "dispatch_pending", requestedAt: at },
      updatedAt: at,
    };
    const nextState: CaseState = {
      ...before.state,
      caseRevision: before.state.caseRevision + 1,
      eventSequence: before.state.eventSequence + 5,
      status: { kind: "cancelling", cancellationId: "cancel_case_000001", reason: "user request", requestedAt: at, requestedBy: { kind: "system", component: "case_do" } },
      updatedAt: at,
    };
    seed.control.apply({
      kind: "cancel_case",
      requestId,
      semanticDigest: "a".repeat(64),
      caseId: before.caseId,
      nextCaseState: nextState,
      taskUpdates: [nextTask, nextSecondTask],
      attemptUpdates: [nextAttempt, nextSecondAttempt],
      events: [
        evt(before.caseId, requestId, before.state.eventSequence + 1, "event_cancel_case_1", "CaseCancellationRequested", { kind: "case", caseId: before.caseId }, at, { from: "active", to: "cancelling" }),
        evt(before.caseId, requestId, before.state.eventSequence + 2, "event_cancel_case_2", "TaskCancellationRequested", { kind: "task", taskId: before.taskId }, at, { from: "active", to: "cancelling" }),
        evt(before.caseId, requestId, before.state.eventSequence + 3, "event_cancel_case_3", "TaskCancellationRequested", { kind: "task", taskId: secondTaskId }, at, { from: "active", to: "cancelling" }),
        evt(before.caseId, requestId, before.state.eventSequence + 4, "event_cancel_case_4", "AttemptCancellationRequested", { kind: "attempt", attemptId: before.attempt.attemptId }, at, { from: "dispatch_pending", to: "cancel_requested" }),
        evt(before.caseId, requestId, before.state.eventSequence + 5, "event_cancel_case_5", "AttemptCancellationRequested", { kind: "attempt", attemptId: secondAttemptId }, at, { from: "dispatch_pending", to: "cancel_requested" }),
      ],
      value: { cancellationId: "cancel_case_000001" },
    });
    assert.equal(seed.repository.readCaseState(before.caseId)!.value.status.kind, "cancelling");
    assert.equal(seed.repository.readTask(before.caseId, before.taskId)!.value.status.kind, "cancelling");
    assert.equal(seed.repository.readTask(before.caseId, secondTaskId)!.value.status.kind, "cancelling");
  } finally {
    seed.db.close();
  }
});

test("evidence materialization rejects incomplete mappings, then gates completed Case termination", () => {
  const seed = seededControl();
  try {
    const terminal = terminalizeSuccess(seed, "evidence01", "2026-08-05T01:40:00Z");
    const at = "2026-08-05T01:41:00Z";
    const incomplete: EvidenceSet = {
      schemaVersion: 1,
      evidenceSetId: "evidence_incomplete01",
      caseId: terminal.caseId,
      mappings: [{ criterionId: "m0", requirementIds: ["schema"], evidenceRefs: [] }],
      evidenceSetDigest: "b".repeat(64),
      createdAt: at,
    };
    const stateBefore = terminal.state;
    const requestId = "request_evidence_incomplete1";
    const incompleteMutation = {
      kind: "evidence_set" as const,
      requestId,
      semanticDigest: "c".repeat(64),
      caseId: terminal.caseId,
      nextCaseState: { ...stateBefore, caseRevision: stateBefore.caseRevision + 1, eventSequence: stateBefore.eventSequence + 2, updatedAt: at },
      evidenceSet: incomplete,
      events: [
        evt(terminal.caseId, requestId, stateBefore.eventSequence + 1, "event_evidence_incomplete_1", "EvidenceSetCreated", { kind: "case", caseId: terminal.caseId }, at),
        evt(terminal.caseId, requestId, stateBefore.eventSequence + 2, "event_evidence_incomplete_2", "CaseProjectionChanged", { kind: "case", caseId: terminal.caseId }, at),
      ],
      value: { evidenceSetId: incomplete.evidenceSetId },
    };
    assert.throws(
      () => seed.control.apply(incompleteMutation),
      (error: unknown) => error instanceof StorageError && error.reason === "EVIDENCE_INCOMPLETE",
    );
    assert.equal(tableCount(seed.db, "evidence_sets"), 0);
    assert.deepEqual(seed.repository.readCaseState(terminal.caseId)!.value, stateBefore);

    const evidence: EvidenceSet = {
      ...incomplete,
      evidenceSetId: "evidence_complete_0001",
      mappings: [{
        criterionId: "m0",
        requirementIds: ["schema"],
        evidenceRefs: [{ kind: "task_result", taskId: terminal.taskId, resultDigest: terminal.resultDigest }],
      }],
      evidenceSetDigest: "d".repeat(64),
    };
    const evidenceRequest = "request_evidence_complete01";
    const evidenceState: CaseState = {
      ...stateBefore,
      caseRevision: stateBefore.caseRevision + 1,
      eventSequence: stateBefore.eventSequence + 2,
      updatedAt: at,
    };
    seed.control.apply({
      kind: "evidence_set",
      requestId: evidenceRequest,
      semanticDigest: "e".repeat(64),
      caseId: terminal.caseId,
      nextCaseState: evidenceState,
      evidenceSet: evidence,
      events: [
        evt(terminal.caseId, evidenceRequest, stateBefore.eventSequence + 1, "event_evidence_complete_1", "EvidenceSetCreated", { kind: "case", caseId: terminal.caseId }, at),
        evt(terminal.caseId, evidenceRequest, stateBefore.eventSequence + 2, "event_evidence_complete_2", "CaseProjectionChanged", { kind: "case", caseId: terminal.caseId }, at),
      ],
      value: { evidenceSetId: evidence.evidenceSetId },
    });
    assert.equal(tableCount(seed.db, "evidence_sets"), 1);
    assert.equal(tableCount(seed.db, "evidence_mappings"), 1);
    assert.equal(tableCount(seed.db, "evidence_refs"), 1);

    const closedAt = "2026-08-05T01:42:00Z";
    const finishRequest = "request_finish_completed01";
    const finalState: CaseState = {
      ...evidenceState,
      caseRevision: evidenceState.caseRevision + 1,
      eventSequence: evidenceState.eventSequence + 1,
      status: { kind: "terminal", terminal: { outcome: "completed", evidenceSetId: evidence.evidenceSetId, summary: "verified source completion", closedAt } },
      updatedAt: closedAt,
    };
    seed.control.apply({
      kind: "finish_case",
      requestId: finishRequest,
      semanticDigest: "f".repeat(64),
      caseId: terminal.caseId,
      nextCaseState: finalState,
      events: [evt(terminal.caseId, finishRequest, evidenceState.eventSequence + 1, "event_finish_complete_1", "CaseFinished", { kind: "case", caseId: terminal.caseId }, closedAt, { from: "active", to: "terminal:completed" })],
      value: { outcome: "completed", evidenceSetId: evidence.evidenceSetId },
    });
    assert.equal(seed.repository.readCaseState(terminal.caseId)!.value.status.kind, "terminal");
    const listed = seed.query.listResources({
      caseId: terminal.caseId,
      kinds: ["evidence_set"],
      principalBindingDigest,
      now: closedAt,
    });
    assert.equal(listed.resources[0].subjectId, evidence.evidenceSetId);
    assert.throws(
      () => seed.control.apply({
        kind: "case_pause",
        requestId: "request_after_terminal01",
        semanticDigest: "1".repeat(64),
        caseId: terminal.caseId,
        nextCaseState: {
          ...finalState,
          caseRevision: finalState.caseRevision + 1,
          eventSequence: finalState.eventSequence + 1,
          status: { kind: "paused", reason: "manual", pausedAt: closedAt, detail: "must remain terminal" },
          updatedAt: closedAt,
        },
        events: [evt(terminal.caseId, "request_after_terminal01", finalState.eventSequence + 1, "event_after_terminal_1", "CasePaused", { kind: "case", caseId: terminal.caseId }, closedAt, { from: "terminal:completed", to: "paused" })],
        value: { action: "pause" },
      }),
      (error: unknown) => error instanceof StorageError && error.reason === "TERMINAL_IMMUTABLE",
    );
  } finally {
    seed.db.close();
  }
});
