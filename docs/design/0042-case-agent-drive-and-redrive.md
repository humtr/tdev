# Design 0042 — Durable Case-to-Agent Drive and Re-drive

- Status: `accepted`
- Revision: 1
- Class: 2
- Decision date: 2026-09-03
- Acceptance base: `development@62a37cca3ade0007c204de10c8bdc6b26b0ddca4`
- Trigger: P1 planning revalidation found that the repository has authoritative Case readiness and Agent delivery owners but no durable owner that reconnects them after coordinator restart, response loss or a live Agent reconnect
- Acceptance evidence: `docs/evidence/group-f-d0042-r1-case-agent-drive-acceptance-2026-09-03.json`
- Scope: one durable, level-triggered Case-to-Agent drive/re-drive owner used by a tdev development-unit run
- Affected owners: `src/`, `docs/MCP.md`, `docs/QUALIFICATION.md`, `docs/development/PROGRAM.md`, `WORKBOARD.md`, focused drive/recovery tests
- Preserved owners: D0019 remains the sole Case semantic owner; D0020/D0027 remain the sole Agent delivery/current/effect owners; D0025 remains the Git publication owner; D0043 owns the bounded operation catalog
- Explicit non-goals: no second Case scheduler or readiness cache; no Task/Attempt lifecycle or queue ownership; no Agent route election; no MCP authentication; no canonical-tree writer; no automatic retry of an ambiguous external effect

## 1. One-line definition

Add one durable Case-to-Agent drive authority that stores only a caller-intent and reconciliation cursor, rereads the Case and Agent owners before every action, and level-triggers the existing idempotent `case_run_or_resume`/delivery path after restart or response loss without creating a second semantic queue or inventing readiness.

## 2. Why this is Class 2

The current source can run a Case and can admit an Agent delivery, but no durable owner joins those facts across a controller restart. Adding such an owner changes durable identity, retry/reconciliation, dependency direction and the P1 acceptance method. `SDD.md` therefore requires an accepted Design before implementation.

This decision does not change Case state, Task/Attempt transitions, delivery receipts or Agent route state. It chooses where the drive intent and restart cursor live so those existing owners can be called safely.

## 3. Repository facts and unknowns

At acceptance:

- `CaseRepository`/`CaseEngine` own Case snapshots, readiness, receipts and canonical Promotion;
- `runDurableCase` persists Attempt transitions before invoking an executor and does not retry a transaction callback after CAS conflict;
- `AgentDeliveryAuthority` owns reservations, delivery authorization, physical send evidence, result handoff and terminal delivery retirement;
- `docs/MCP.md` requires MCP commands to remain stateless projections over those owners;
- no current durable record owns a run intent, wake generation or post-restart drive cursor.

Unknowns remain the provider placement of this record and the exact wake mechanism in a deployed Worker. They do not change the source owner decision; deployment placement is qualified separately.

## 4. Decision and owner boundary

### 4.1 Selected owner

The owner is `CaseAgentDriveAuthority`, keyed by `caseId`, with profile:

```text
tdev.case-agent-drive.v1
```

Its durable record contains exactly the bounded drive identity and reconciliation facts:

```text
schemaVersion
profile
caseId
driveRequestId
driveRequestDigest
desiredAction          // "run_or_resume"
status                 // "ACTIVE" | "QUIESCED" | "RECONCILING"
lastCaseRevision
lastDriveReceiptDigest
lastObservedDeliveryDigest
revision
```

`lastCaseRevision` and the delivery digest are observations/cursors, not readiness, lifecycle or effect truth. The authority never stores a ready-Task list, a copy of Case state, an Agent capacity value, a queue of Tasks, a process handle or a wall-clock deadline.

One `driveRequestId` is caller-generated and remains stable through response loss. Reusing it with a changed action or digest is a conflict. A new run intent is a new request identity after the prior intent is durably quiesced/terminal.

### 4.2 Level-triggered operation

`drive(caseId, requestId, exactPayload)` performs one serialized transaction:

1. load and validate the durable drive record;
2. reread the authoritative Case owner and Agent delivery owner;
3. if the Case is terminal, record `QUIESCED` with the terminal receipt/cursor and do not dispatch;
4. if the Case has no currently admissible work or the Agent has no fresh capacity, retain `ACTIVE` and return a bounded `not_ready` observation;
5. otherwise call the existing Case/Agent admission boundary with the exact request identity and payload;
6. persist only the returned owner receipt/cursors; a lost response becomes `RECONCILING` and is resolved by rereading both owners with the same request identity.

The operation is level-triggered: any later wake, reconnect or explicit `drive` call rereads current readiness and may continue work. It is not an ordered task queue and cannot bypass Case dependency/claim/capability checks.

### 4.3 Restart and response-loss rule

After reconstruction, `ACTIVE` or `RECONCILING` records are re-driven only after a fresh Case/Agent read. An unknown prior call is never treated as absent. If the authoritative receipt exists, the exact receipt is returned; if it does not, the existing owner decides whether the Case remains ready. The coordinator does not issue a second dispatch identity merely because its own response was lost.

An Agent socket reconnect changes only the D0020 connection/delivery observations. The drive owner rereads the current Agent route and lets D0020 fence stale deliveries; it never restores a socket, capacity or Attempt itself.

### 4.4 Cancellation

Cancellation is a Case command owned by D0019. The drive owner may submit that command once under its caller request identity, then observes Case state. It cannot infer physical cancellation from a client timeout and cannot release an Agent delivery without the existing D0020 terminal receipt/evidence path.

## 5. Interface and bounds

The source interface is intentionally narrow:

- `initialize({ caseId, store })` — create-once record;
- `read(caseId)` — strict durable read;
- `drive(caseId, { requestId, payload, readCase, readAgent, dispatch })` — one serialized level-triggered step;
- `reconcile(caseId, { readCase, readAgent })` — read-only response-loss recovery;
- `quiesce(caseId, { terminalReceiptDigest })` — accepts only an already terminal Case observation;
- `snapshot(caseId)` — bounded public projection with no secret or process fields.

`payload` is strict canonical JSON, bounded by the Case command limit, and may contain no credentials, absolute paths or executable shell text. The authority rejects duplicate members, unknown fields, unsafe numbers and oversized cursors before mutation.

## 6. Failure, recovery and cleanup

- CAS conflict: return a typed conflict; never replay the caller callback automatically.
- Case owner unavailable: retain the durable intent and return `reconciling`; no synthetic failure or retry budget burn.
- Agent owner unavailable or stale: retain the intent; no local process/Attempt is started.
- dispatch response loss: reread the exact Case/Agent receipts; an ambiguous external effect remains under the existing reconciliation contract.
- malformed/corrupt drive state: fail closed before any owner call.
- terminal Case: mark `QUIESCED` only from a fresh terminal receipt; no later drive may resurrect it.
- process/coordinator crash: restart reconstruction uses the durable record and fresh owner reads; no in-memory queue is recovered.

The record is compactable only after the Case owner is terminal and the exact terminal receipt/cursor is retained. Compaction cannot make an old request ID reusable.

## 7. Compatibility, migration and deployment

Revision 1 introduces one versioned non-Case record. There is no migration from an older drive schema; absence means no active drive intent and is initialized explicitly. A corrupt or unknown future schema fails closed.

The local source profile may use `FileSnapshotStore`/`MemorySnapshotStore` for qualification. A deployed Worker may place the same owner in a dedicated Durable Object or in an already accepted Case owner only after provider qualification proves one-writer CAS and reconstruction. It must not be hidden in MCP Worker memory or a second Agent queue.

Rollback before the first drive record is created is code/config rollback. After an `ACTIVE` record exists, older code that cannot validate the profile must stop and leave the record untouched; an explicit forward migration or operator quiescence is required. No automatic deletion or downgrade is authorized.

## 8. Acceptance matrix and cheapest falsifiers

| Area | Required result |
| --- | --- |
| one owner | exactly one durable drive record; no ready-list, queue or duplicate Case lifecycle |
| level trigger | repeated drive calls continue eligible work and do not depend on a one-shot wake |
| identity | same request ID/payload replays the exact owner receipt; changed payload conflicts |
| readiness | every decision rereads Case owner; cached cursor cannot create readiness |
| Agent boundary | every delivery is admitted by D0020/D0027; stale connection/capacity is denied before send |
| restart | coordinator crash at ready, reservation, Attempt-start, grant, result and terminal phases reconstructs without duplicate authority |
| response loss | lost drive/dispatch/result responses reconcile from authoritative receipts without blind retry |
| cancellation | Case cancellation remains intent until D0019/D0020 evidence says otherwise |
| corruption/bounds | malformed, unknown schema, duplicate input, oversized payload and CAS conflict are zero-effect failures |
| cleanup | terminal drive quiesces; no orphan claim, delivery, process or worktree residue |
| proof boundary | source/local proof does not claim provider, MCP client or deployed-product support |

Cheapest decisive falsifiers are a second dispatch after response loss, a ready decision made from the cursor without a Case reread, a drive record that stores a Task queue/readiness copy, or a restart that guesses an unknown external effect.

## 9. Rejected alternatives

### Put a second scheduler/queue in the MCP Worker

Rejected. It would duplicate Case readiness and create an unbounded semantic queue outside the D0019 owner.

### Store a ready Task list in the drive record

Rejected. Readiness is derived once from Case state; a list becomes stale across claims, cancellation and dependency completion.

### Let the Agent own re-drive

Rejected. D0020/D0027 own delivery/physical truth, not Case readiness or semantic Task selection.

### Retry a lost call with a new request ID

Rejected. It can duplicate a dispatch or external effect. Reconciliation must use the original identity and authoritative reads.

### Treat a coordinator timeout as cancellation/failure

Rejected. Unknown external effects remain unknown until the responsible owner reconciles them.

## 10. Follow-on gates

This Design authorizes source implementation and bounded local P1 qualification after explicit `WORKBOARD.md` routing. It does not authorize a supported MCP endpoint, Cloudflare auth, provider deployment, canonical publication or D0045 comparison. D0023/D0024 consume this owner only through a stateless command/projection surface.
