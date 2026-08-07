# tdev product specification

> Normative owner for the source product contract. Architecture ownership lives in `ARCHITECTURE.md`; state and wire meaning live in `PROTOCOL.md`.

## 1. Definition

`tdev` executes one immutable Task DAG with parallel-first semantics, accepts isolated typed results, and produces one deterministic canonical tree through a single final Promotion Task.

The source slice is **durable-ready**, not provider-complete: its domain and persistence contracts are executable in Node 22, while Cloudflare, Agent, Git, MCP, D1, and R2 adapters remain separate product work.

## 2. Core invariants

1. A Case owns exactly one immutable PlanRevision.
2. A PlanRevision owns one finite acyclic Task graph and an exact base-tree digest.
3. Readiness is derived from dependency terminal states; no stored `ready` lifecycle truth exists.
4. Admission combines readiness, retry budget, authority, in-Case claim compatibility, and—when configured—a live cross-Case claim lease.
5. A Task has at most one nonterminal Attempt.
6. Every external result is bound to the complete Attempt identity and, when present, a currently valid claim lease.
7. Ordinary Tasks never mutate the canonical tree.
8. A Plan contains exactly one Promotion Task. Promotion depends on every work Task exactly once and holds the sole `write canonical:tree` claim.
9. Promotion deterministically validates and joins the complete accepted-result set before replacing the canonical tree.
10. `capacity = 1` and `capacity = N` use the same graph, Attempt, result, claim, and Promotion semantics.
11. Completion order, executor identity, executor count, locale, and wall-clock timing do not affect the promoted tree digest.
12. Ambiguous external effects remain `reconciling` or `unverified`; uncertainty is not rewritten as failure, cancellation, or safe retry.
13. A rejected command or direct mutation has no partial in-memory effect.
14. A durable runner must persist a newly running Attempt before invoking its executor.
15. Derived counters, ready candidates, claim indexes, validation frontiers, and materialized caches may be deleted and rebuilt from authoritative records; they cannot author admission, fencing, CAS, or a terminal Case result.
16. Settlement and Promotion remain deterministic across scheduling order, completion order, executor identity, and retry interleaving.

## 3. PlanRevision contract

A Plan input contains:

- `revisionId`: stable identifier;
- `baseTree`: optional canonical text tree, default `{}`;
- `tasks`: non-empty Task list.

Compilation derives and freezes:

- `baseDigest`;
- stable code-unit `taskOrder`;
- `tasksById`;
- `reverseDependenciesById`;
- `promotionTaskId`;
- domain-separated `planDigest`.

Compilation rejects duplicate IDs, unknown dependencies, self-dependencies, cycles, excess bounds, more or fewer than one Promotion, a Promotion that is not a full join, or an invalid canonical claim.

## 4. Task contract

A work Task declares:

| Field | Meaning |
| --- | --- |
| `id` | stable Task identifier |
| `kind` | `work`; omitted values default to `work` |
| `dependencies` | Task IDs that must all succeed |
| `claims` | declared resource access modes and scopes |
| `input` | immutable canonical input |
| `requiredCapabilities` | capabilities required at admission |
| `execution.operation` | typed operation identifier |
| `execution.resultKind` | expected closed result variant |
| `execution.effectClass` | recovery class |
| `execution.retry.maxAttempts` | total Attempt budget, default `3`, range `1..caseContract.limits.maxAttemptsPerTask` (default ceiling `100`) |
| `execution.requirePassed` | for validation results only |

The default work execution is:

```json
{
  "operation": "tdev.work.changeset",
  "resultKind": "changeset",
  "effectClass": "result-only",
  "retry": { "maxAttempts": 3 },
  "requirePassed": false
}
```

An external-effect Task must use `resultKind: effect-receipt`. A result-only Task cannot claim a `remote:` resource. No work Task can claim a `canonical:` resource.

The Promotion execution contract is fixed internally to `tdev.promotion`, `promotion`, `result-only`, one Attempt, and no required capability.

## 5. Claims and authority

Claims express concurrency exclusion, never permission. Claim compatibility is defined by resource overlap and access mode: overlapping reads are compatible; an overlapping write or execute conflicts.

Authority for a work Task is the exact intersection of:

```text
Task required capabilities
  ⊆ Case grant
  ∩ Workspace policy
  ∩ observed executor capabilities
```

Missing authority deterministically denies the Task and prevents Promotion.

Cross-Case claims are optional in the local runner. When a Task has a global claim and a `ClaimLedger` is configured, the Attempt carries a lease bound to its holder, normalized claim set, claim-set digest, generation, and token. The lease must be current when the Attempt starts and for the first state-changing result commit. An exact replay of an already accepted result may deduplicate after release because it cannot change state.

## 6. Closed result algebra

A work Task accepts exactly the result variant declared by its execution contract:

| Kind | Purpose | Canonical-tree mutation |
| --- | --- | --- |
| `changeset` | bounded sorted text writes/deletes against the exact base digest | yes, only during Promotion |
| `observation` | structured finding or analysis output | no |
| `validation` | deterministic checks and pass/fail summary | no |
| `artifact-set` | immutable metadata references to externally stored bytes | no |
| `effect-receipt` | proof that a typed external effect was applied under the stable effect key | no |

All variants are normalized, bounded, canonically encoded, and digested. Promotion includes every accepted result identity in its deterministic manifest but applies only ChangeSets.

## 7. Effect classes and retry

| Effect class | Interrupted/ambiguous recovery |
| --- | --- |
| `result-only` | may start a new Attempt within the Task budget |
| `idempotent-external` | may retry only under the same Task-level effect key |
| `reconcilable-external` | must reconcile before any retry; ambiguity cannot be guessed away |

Reconciliation outcomes are `succeeded`, `not_applied`, `failed`, `cancelled`, or `unverified`. A `not_applied` or explicitly retryable reconciled failure may return eligible work to `pending` when budget remains. A proven success must still pass normal result validation and fencing.

## 8. Case, events, and commands

`CaseEngine` is the only source owner of Case, Task, Attempt, accepted result, event, receipt, and canonical-tree state.

State-changing command envelopes contain:

- `requestId`;
- `command`;
- optional `expectedCaseRevision`.

The first accepted command records a canonical command digest, response, response digest, and committed revision. An exact replay returns the original response without events; reuse of the request ID for a different command conflicts; a revision mismatch has no effect.

Events are semantic and ordered. They intentionally contain no wall-clock timestamp. Provider projections may add observation time outside the hashed semantic event.

## 9. Persistence contract

Snapshot schema v2 contains the compiled Plan, normalized Case contract, complete lifecycle state, accepted results, events, receipts, canonical tree and digest, event hash chain, and a whole-snapshot digest.

Restore must:

1. reject unknown or missing fields;
2. verify the whole-snapshot digest;
3. re-normalize the Case contract;
4. recompile and compare the Plan and indexes;
5. validate event sequence, revisions, and hash continuity;
6. validate Task/Attempt/result/receipt linkage, complete derived blocker evidence, restored bounds, and state invariants;
7. re-normalize accepted results;
8. recompute Promotion for a succeeded Case;
9. reopen nonterminal work according to effect class when requested.

Design 0001 snapshots are migrated deterministically to v2. `CaseRepository.load` persists the migrated snapshot through compare-and-swap when migration advances the Case revision.

## 10. Store and runner behavior

- `MemorySnapshotStore` provides deterministic in-process CAS.
- `FileSnapshotStore` reads strict canonical JSON and performs full-snapshot same-directory temporary write, file sync, atomic rename, directory sync, and in-process per-Case serialization.
- `JournalSnapshotStore` implements the same CAS contract with one compact full base plus canonical checksummed revision deltas; replay must reconstruct the exact v2 snapshot and compaction must never remove the only durable committed state. A materialized cache is reusable only after the exact committed base/delta names, lengths, and bytes match a cryptographic fingerprint. Revision CAS is derived from re-observed durable bytes, never an unchecked cached revision.
- `CaseRepository` owns create, load, migration persistence, single-shot transaction, and command boundaries.
- `CaseEngine` may maintain rebuildable Task-state counts, unsatisfied-dependency counts, ready IDs, claim-holder IDs, and a deterministic Plan-derived topological order. Ordinary transitions update changed entries/direct dependents only; any non-active Case-state candidate is confirmed from authoritative Task records.
- `runCase` executes the graph in memory, maintains only a rebuildable ready-candidate acceleration set, and supports an injected checkpoint callback; every Task start still passes through authoritative `CaseEngine.admissionDecision`. Candidate loss invokes the engine repair boundary before deadlock is declared.
- `runDurableCase` uses repository CAS checkpoints so Attempt-start persistence succeeds before executor dispatch and settlement persistence precedes claim release.

A CAS conflict does not automatically replay a transaction callback or dispatch an executor. Store caches, journal fingerprints, validation frontiers, Task/dependency counters, CaseEngine ready/claim-holder sets, ClaimLedger overlap tries, and runner ready candidates are performance-only derived state and may never replace Case/lease authority. A top-level reconcile or restore must be able to rebuild them exactly.

## 11. Source-slice acceptance

The source slice is accepted only when the executable matrix in `MVP.md` passes in the declared runtime and documentation does not claim provider behavior that was not executed.

## 12. Explicit non-goals

- live Cloudflare Worker or Durable Object deployment;
- persistent AgentDO delivery queue, WebSocket transport, or hibernation;
- Termux filesystem, Git, process, or network executor;
- Git commit/reference publication and rollback automation;
- D1 projection or R2 Artifact byte storage;
- public MCP endpoint or current-client qualification;
- cross-system distributed transaction;
- exactly-once external effects;
- hostile-storage authenticity from self-hashes alone;
- large-DAG or large-repository performance completion.
