# state, identity, result, and persistence protocol

> Normative owner for state vocabulary, transitions, envelopes, receipts, snapshots, and reconciliation meaning.

## 1. Data model

All durable protocol values are canonical data:

- `null`, booleans, strings, safe integers, arrays, and plain records only;
- no floating-point fraction, unsafe integer, `undefined`, sparse array, symbol key, custom prototype, cycle, or unpaired surrogate;
- record keys ordered by stable JavaScript code-unit comparison for encoding;
- SHA-256 digests formatted as `sha256:<64 lowercase hex>`;
- important identities use domain-separated digests.

The implementation is a deliberately narrower safe-integer canonical JSON profile. It is inspired by deterministic JSON principles but does not claim byte-for-byte RFC 8785 compatibility for the full JCS number domain.

## 2. Stable identities

| Identity | Derivation or source |
| --- | --- |
| Case | caller-provided `caseId` |
| PlanRevision | caller `revisionId` plus domain-separated `planDigest` |
| Task | immutable `task.id` inside the Plan |
| Attempt | `<taskId>.<ordinal>` within a Case |
| Task effect key | digest of Case ID, Plan digest, and Task ID; stable across retries |
| Attempt fence | digest over complete Attempt/executor/lease identity |
| claim lease | holder plus normalized claim set/digest, monotonically increasing generation, and domain-separated token |
| result | canonical result kind plus canonical result digest |
| mutation command | domain-separated digest of canonical command |
| snapshot | domain-separated digest of the complete snapshot excluding `snapshotDigest` |

An Attempt fence binds:

```text
caseId
planDigest
taskId
attemptId
executorId
executorEpoch
claimLeaseToken or null
claimLeaseGeneration or null
claimLeaseClaimsDigest or null
```

A result that matches only `attemptId` is insufficient.

## 3. Case states

| State | Meaning |
| --- | --- |
| `active` | runnable/running graph work may exist |
| `reconciling` | at least one external-effect Attempt is uncertain or cancellation is unresolved |
| `succeeded` | Promotion succeeded and canonical replacement committed |
| `failed` | a Task failed/was denied, or the graph became terminally blocked |
| `cancelled` | cancellation terminally won and no stronger uncertainty exists |
| `unverified` | an external effect cannot be authoritatively classified |

Terminal Case states are `succeeded`, `failed`, `cancelled`, and `unverified`. A terminal Case is not silently reopened.

Case outcome precedence during reconciliation is:

```text
reconciling
  > active work
  > unverified
  > failed or denied
  > cancelled
  > blocked graph failure
  > succeeded Promotion
```

This prevents a dependency-derived `blocked` state from overwriting a more specific cancellation or uncertainty outcome.

## 4. Task states

| State | Meaning |
| --- | --- |
| `pending` | not running; may become ready and admissible |
| `running` | owns one nonterminal Attempt |
| `reconciling` | external-effect Attempt requires an authoritative decision |
| `succeeded` | exactly one accepted result identity exists |
| `failed` | terminal execution/result/reconciliation failure |
| `cancelled` | terminally cancelled |
| `denied` | authority intersection rejected admission |
| `unverified` | external effect remains unknowable |
| `blocked` | a dependency terminated without success |

Terminal Task states are `succeeded`, `failed`, `cancelled`, `denied`, `unverified`, and `blocked`.

Readiness is not a Task state. A Task is ready when it is `pending` and every declared dependency is `succeeded`.

## 5. Attempt states

| State | Meaning |
| --- | --- |
| `dispatch_pending` | admitted and ready for durable dispatch handoff |
| `queued` | acknowledged by a delivery queue but not yet running |
| `running` | executor may be applying work |
| `reconciling` | outcome/effect application is uncertain |
| `cancel_requested` | cancellation intent exists, but effect outcome is uncertain |
| `succeeded` | result accepted and digested |
| `failed` | terminal known failure |
| `cancelled` | terminal known cancellation |
| `interrupted` | Attempt ended without an accepted result; retry eligibility is Task/effect dependent |
| `rejected` | reserved terminal rejection state for a delivery/admission adapter |
| `unverified` | terminal uncertainty |

A Task may have many historical Attempts but at most one nonterminal Attempt. Attempt ordinals are monotonic within the Task.

Execution-state transitions are guarded. Nonterminal states may move through dispatch/queue/run/reconcile/cancel intent and then to a terminal state. A terminal Attempt is immutable except that an exact duplicate accepted result is recognized idempotently.

## 6. Error record

A normalized error is:

```json
{
  "code": "identifier",
  "message": "bounded scalar string",
  "certainty": "not_applied | unknown",
  "retryable": false
}
```

`certainty: not_applied` means the effect is known not to have occurred. `certainty: unknown` forbids inference that retry is safe. `retryable` is advisory inside the effect-class and Attempt-budget rules; it never overrides uncertainty.

## 7. Executor invocation

For a work Task, the runner calls the injected executor with:

```text
caseId
planRevisionId
planDigest
baseDigest
effectKey
fencingToken
claimLease
signal
task
attempt
acceptedResults of dependencies
```

The executor returns only the Task's declared isolated result. Promotion is internal and is never delegated to an external executor.

## 8. Result envelope

A result commit envelope has exactly:

```json
{
  "caseId": "...",
  "planRevisionId": "...",
  "planDigest": "sha256:...",
  "taskId": "...",
  "attemptId": "...",
  "executorId": "...",
  "executorEpoch": 1,
  "fencingToken": "sha256:...",
  "claimLeaseToken": null,
  "claimLeaseGeneration": null,
  "claimLeaseClaimsDigest": null,
  "result": {}
}
```

Acceptance validates all identity fields, the expected result kind, result-specific invariants, and the claim lease bound to the Attempt. The lease must still be current for the first state-changing commit. A stale epoch, Plan, Task, fence, lease generation, or claim-set digest fails without state change.

An exact duplicate normalized result for an already succeeded Attempt returns a deduplicated response even after its lease was released; this path performs no mutation. A different duplicate is a conflict.

## 9. Result variants

### ChangeSet

```json
{
  "kind": "changeset",
  "baseDigest": "sha256:...",
  "writes": [{ "path": "relative/path", "content": "text or null" }],
  "evidence": null
}
```

Writes are path-sorted. `null` deletes a path. The result is bound to the Plan base digest and cannot contain duplicate paths.

### Observation

```json
{
  "kind": "observation",
  "subject": "bounded subject",
  "value": {},
  "evidence": null
}
```

### Validation

```json
{
  "kind": "validation",
  "passed": true,
  "checks": [{ "id": "check-id", "passed": true, "message": null }],
  "evidence": null
}
```

Checks are ID-sorted and unique. `passed` must equal the conjunction of all checks. `requirePassed` converts a failed validation into a deterministic result rejection.

### ArtifactSet

```json
{
  "kind": "artifact-set",
  "artifacts": [
    {
      "id": "artifact-id",
      "digest": "sha256:...",
      "mediaType": "application/octet-stream",
      "size": 123,
      "locator": null
    }
  ],
  "evidence": null
}
```

The source slice stores only metadata references, not Artifact bytes.

### EffectReceipt

```json
{
  "kind": "effect-receipt",
  "effectKey": "sha256:...",
  "operation": "typed.operation",
  "outcome": "applied",
  "receipt": {},
  "evidence": null
}
```

The effect key and operation must exactly match the immutable Task execution contract.

## 10. Promotion result

Promotion returns:

```json
{
  "kind": "promotion",
  "baseDigest": "sha256:...",
  "accepted": [
    { "taskId": "...", "resultKind": "changeset", "resultDigest": "sha256:..." }
  ],
  "acceptedTaskIds": ["..."],
  "appliedTaskIds": ["..."],
  "tree": {},
  "treeDigest": "sha256:..."
}
```

`accepted` is sorted by Task ID. ChangeSet ownership is evaluated in that order; identical writes coalesce; differing writes to one path produce a stable conflict report. Candidate topology and all bounds are validated before the Case canonical tree changes.

## 11. Reconciliation protocol

A reconciling Attempt accepts one of:

| Decision | Required data | Result |
| --- | --- | --- |
| `succeeded` | validated Task result, optional evidence | normal result acceptance, then reconciliation evidence |
| `not_applied` | optional evidence | interrupted Attempt; pending/cancelled/failed according to intent and budget |
| `failed` | optional error/evidence/retry flag | pending only when retry is explicit and budget remains; otherwise failed |
| `cancelled` | optional evidence | cancelled |
| `unverified` | optional evidence/reason | terminal unverified |

For `succeeded`, result validation and fencing finish before reconciliation state is written. Thus an invalid claimed success cannot partially convert uncertainty into success.

## 12. Command protocol

A command envelope contains exact fields:

```json
{
  "requestId": "stable-request-id",
  "expectedCaseRevision": 12,
  "command": { "type": "..." }
}
```

Supported commands:

- `start_attempt`;
- `mark_attempt_queued`;
- `mark_attempt_running`;
- `mark_attempt_reconciling`;
- `accept_result`;
- `fail_attempt`;
- `cancel_task`;
- `deny_task`;
- `resolve_reconciliation`.

Unknown fields and unknown command types fail closed. Successful execution writes `command_committed` and a receipt in the same in-memory mutation boundary.

## 13. Event protocol

Each Event has a monotonic semantic sequence, Case revision, type, detail, previous event hash, and event hash. Event detail is canonical and bounded. Events contain no timestamp, executor duration, locale, or other nondeterministic semantic input.

A failed mutation restores Case state, revision, event sequence, events, canonical tree, Task states, Attempts, and receipts to the pre-call value.

## 14. Snapshot schema v2

The exact top-level shape is:

```text
schemaVersion
caseId
caseState
caseRevision
eventSequence
plan
caseContract
events
canonicalTree
canonicalDigest
taskStates
attempts
receipts
snapshotDigest
```

Restore does not trust stored derived fields. It recompiles Plan indexes, re-normalizes contracts and accepted results, verifies digest/linkage/state invariants, and recomputes successful Promotion.

Schema v1 is accepted only through the deterministic migration path. Unknown future versions fail closed. No downgrade is implicit.

## 15. ClaimLedger protocol

The ledger snapshot contains schema version, monotonically increasing generation, revision, active leases ordered by generation, and snapshot digest.

A lease exposes the complete fencing record:

```text
token
generation
caseId
taskId
attemptId
claims
claimsDigest
```

The token is derived from generation, holder identity, and the normalized claim-set digest. Acquisition by the same holder and same claim set deduplicates; the same holder cannot substitute a weaker or different claim scope. Conflicting holders receive a deterministic conflict list. Release is identity-checked and idempotent. A replaced generation never becomes valid again.
