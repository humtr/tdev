# tdev product specification

> Normative owner for the source product contract. Architecture ownership lives in `ARCHITECTURE.md`; state and wire meaning live in `PROTOCOL.md`.

## 1. Definition

`tdev` executes one immutable Task DAG with parallel-first semantics, accepts isolated typed results, and produces one deterministic canonical tree through a single final Promotion Task.

The currently verified source slice is **durable-ready and locally execution-capable**, not yet deployed-product complete: its domain/persistence contracts, local Git projection, authenticated remote-publication source contract, and trusted-local repository/model transport are executable in the declared Node/POSIX profiles.

The **final MVP target is broader and mandatory**. It includes the Cloudflare Case/Agent runtime topology, an authenticated local Agent, deployed Git publication integration, a secured MCP command/projection surface, required provider/user configuration, migration/rollback/operations, and final deployed end-to-end qualification. `ROADMAP.md` owns that program decomposition. Cloudflare/Agent/MCP/provider layers remain unverified implementation gaps until their own accepted Designs and target-environment evidence exist.

## 2. Core invariants

1. A Case owns exactly one immutable PlanRevision.
2. A PlanRevision owns one finite acyclic Task graph and an exact base-tree digest.
3. Readiness is derived from dependency terminal states; no stored `ready` lifecycle truth exists.
4. Admission combines readiness, retry budget, authority, in-Case claim compatibility, and—when configured—a live cross-Case claim lease.
5. A Task has at most one nonterminal Attempt.
6. Every external result is bound to the complete Attempt identity and, when present, a currently valid claim lease.
7. Ordinary Tasks never mutate the canonical tree.
8. A Plan contains exactly one Promotion Task. Promotion depends on every work Task exactly once and holds the sole `write canonical:tree` claim.
9. Promotion deterministically validates and joins the complete accepted-result set before replacing canonical semantic tree authority; v2 installs a full tree/digest and opt-in v3 installs a semantic root descriptor.
10. `capacity = 1` and `capacity = N` use the same graph, Attempt, result, claim, and Promotion semantics.
11. Completion order, executor identity, executor count, locale, and wall-clock timing do not affect the promoted semantic identity: the v2 tree digest or the v3 semantic root digest.
12. Ambiguous external effects remain `reconciling` or `unverified`; uncertainty is not rewritten as failure, cancellation, or safe retry.
13. A rejected command or direct mutation has no partial in-memory effect.
14. A durable runner must persist a newly running Attempt before invoking its executor.
15. A concrete durable store owns materialized-snapshot capacity. Capacity is deployment state, not Plan/Case semantic identity, and every durable checkpoint candidate is checked against the store's declared capacity before CAS when that capability exists.
16. An external-effect Attempt may cross the executor boundary only after the durable runner can prove that the running state and contract-bounded post-effect successor states fit the concrete store; unknown or insufficient capacity fails closed before executor invocation and releases any newly acquired Claim.
17. A settlement-checkpoint failure leaves the durable predecessor authoritative and does not release the Attempt lease. Recovery reopens from durable state and persists that reopen/reconciliation before any terminal release or retry.
18. Derived counters, ready candidates, claim indexes, validation frontiers, and materialized caches may be deleted and rebuilt from authoritative records; they cannot author admission, fencing, CAS, or a terminal Case result.
19. Settlement and Promotion remain deterministic across scheduling order, completion order, executor identity, and retry interleaving.
20. Semantic-authority v3 is opt-in. Existing v2 repositories keep full-tree authority and existing store formats; a v3 Case uses profile `tdev.semantic.path-byte-radix.v1`, compact schema-v3 snapshots, and one trusted local transactional Case head.
21. D0011 local Git projection is opt-in and post-Promotion: `GitProjectionAdapter` may derive real Git blobs/trees/commits from a validated semantic root and elect one full `refs/heads/...` ref by exact expected-predecessor CAS, but Git OIDs and that ref never replace the semantic root or Case head as tdev authority.

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

`CaseEngine` is the only source owner of Case, Task, Attempt, accepted result, event, receipt, and canonical semantic tree/root state.

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

Semantic-authority v3 is a separate opt-in persistence profile. A schema-v3 snapshot keeps current Case/Task/Attempt/Event/receipt semantics but replaces persisted full base/canonical trees with a compact Plan binding and semantic root descriptors. The root profile is `tdev.semantic.path-byte-radix.v1`; a successful v3 Promotion accepted result names the final root and does not persist a complete final tree. Restore validates the v3 snapshot digest, Plan binding, root descriptors, every reachable typed semantic object, lifecycle linkage, and Promotion/result invariants. Compatibility tree materialization is explicit/lazy and is not part of normal v3 checkpoint digesting.
Design 0001 snapshots are migrated deterministically to v2. `CaseRepository.load` persists the migrated snapshot through compare-and-swap when migration advances the Case revision.

## 10. Store and runner behavior

- `MemorySnapshotStore` provides deterministic in-process CAS.
- `FileSnapshotStore` reads strict canonical JSON and performs full-snapshot same-directory temporary write, file sync, atomic rename, directory sync, and in-process per-Case serialization.
- `JournalSnapshotStore` implements the same CAS contract with one compact full base plus canonical checksummed revision deltas; replay must reconstruct the exact v2 snapshot and compaction must never remove the only durable committed state. A materialized cache is reusable only after the exact committed base/delta names, lengths, and bytes match a cryptographic fingerprint. Revision CAS is derived from re-observed durable bytes, never an unchecked cached revision.
- `ImmutableJournalSnapshotStore` is an opt-in local-filesystem CAS adapter. It reads a legacy-v1 journal prefix and writes immutable v2 `delta-from-<expectedRevision>` commit slots with source/target snapshot-digest binding. Every load/CAS strictly observes the committed namespace and rereads every retained authoritative byte. An instance-local materialized snapshot may replace parse/replay only when an exact ordered cryptographic fingerprint over current filenames, lengths, and bytes matches a prior strict validation or a successfully durable local commit from that verified predecessor. Any namespace, file-type, length, or byte change forces complete D0005 validation/replay. The cache is disposable and cannot author CAS. Cross-process winner election is claimed only among immutable-v2 writers on the tested compatible local-filesystem no-replace hard-link publication boundary after an explicit cutover that quiesces legacy writers. Rolling cross-process legacy/new writers are unsupported. It has no durable checkpoint/head, compaction, or history deletion.
- `SemanticSqliteStore` is an opt-in local v3 authority adapter. It stores immutable typed semantic objects and immutable schema-v3 snapshot objects plus one mutable expected-predecessor Case head in one SQLite transaction. A possibly committed database transaction reports `store_commit_ambiguous`; callers reconcile the durable head and do not blindly replay callbacks. The adapter fails explicitly when the required `node:sqlite` API is unavailable.
- `SemanticCaseRepository` owns native v3 create/load/checkpoint/command boundaries and the bounded quiesced pre-Promotion v2 -> v3 migration. Migration requires explicit writer and Claim quiescence and rechecks the captured source v2 snapshot digest/revision immediately before publishing the first v3 head.
- `GitProjectionAdapter` is an opt-in local post-Promotion projection adapter. It writes derived immutable Git objects without an index/worktree, validates their semantic binding, publishes only one full `refs/heads/...` ref with exact predecessor CAS, reconciles ambiguous outcomes by reread, and performs only fenced rollback. It is not a SnapshotStore, repository authority owner, or ordinary Task executor.
- `GitRemotePublicationAdapter` is the opt-in D0012 derived remote-publication adapter for profile `tdev.git.remote-existing-branch.v1`. It accepts only an already locally elected D0011 candidate with a non-null predecessor, binds one existing remote branch and deployment-owned push target into an immutable intent, uses exact expected-predecessor remote fencing, and reconciles uncertain push/rollback outcomes by remote-ref reread. It stores no raw credential or clear push URL and never becomes Case or semantic authority.
- `GitRepositoryModelExecutor` is the opt-in D0013 ordinary-Task executor for operation `tdev.model.repository`, repository profile `tdev.repository-context.git-full-text.v1`, and model profile `tdev.model.subprocess-json.v1`. It reads one exact immutable local Git commit, materializes the complete supported UTF-8 `100644`/`100755` text context, requires that text map to reproduce the invocation `baseDigest`, sends one request-digest-bound canonical request to one fresh trusted local subprocess, and returns only the declared result to the existing runner/engine acceptance boundary. Repository/model/process state and transport observations are derived inputs/evidence, never Case or semantic authority. D0014 adds optional finite executor-local exact-key preparation reuse: same-key cold misses single-flight, different keys prepare concurrently, retained values are immutable and entry/byte bounded, all-reader cancellation removes the doomed entry before abort so a fresh reader starts a replacement producer, and cache loss/disablement/restart rebuilds from the exact Git commit. Cold preparation preflights tree/file sizes, reads each unique blob OID once, propagates cancellation to Git, and reuses canonical repository encodings. D0017 adds the representation-independent `tdev.selected-context-reference.v1` contract before model-process admission: the reference binds exact repository commit, semantic base/context digests and an authorization-scope digest over admitted `caseId`/`planDigest`/`caseContractDigest`, while excluding `attemptId` and physical locators. The executor prepares an ephemeral bounded packed/hybrid carrier, independently revalidates authorization/freshness/integrity/resource bounds, reconstructs the full context, and requires canonical descriptor/file bytes to equal the authoritative D0014 preparation before the existing subprocess request is admitted. Unauthorized/stale/missing/corrupt/limit-exceeded resolution fails closed with no silent inline fallback. POSIX model process groups are still cleaned on abort, timeout, output overflow and direct-child exit; asynchronous observation completion is never awaited. The subprocess still receives the complete full-context request and starts one fresh process per Attempt; D0017 changes neither semantic authority nor D0018 process/provider lifecycle.
- D0018 accepts `warm-host-qualified-model-attempt-fresh` for the bounded trusted-local runtime: one `GitRepositoryModelExecutor` host may retain only D0014's bounded immutable exact-key preparation/cache, but every Attempt reauthorizes and resolves D0017, rebuilds its request/control/deadline state, and starts one fresh model process group. Tested same-model-process reuse is unqualified. The accepted production repair adds only transient committed-Event wake observation, exact live-controller fencing, exact checkpoint-revision drain, and runtime-slot retention through predecessor cleanup/settlement; these D0018 source changes are not implemented or verified at this Design-acceptance checkpoint.
- `CaseRepository` owns create, load, migration persistence, single-shot transaction, and command boundaries.
- `CaseEngine` may maintain rebuildable Task-state counts, unsatisfied-dependency counts, ready IDs, claim-holder IDs, and a deterministic Plan-derived topological order. Ordinary transitions update changed entries/direct dependents only; any non-active Case-state candidate is confirmed from authoritative Task records.
- `runCase` executes the graph in memory, maintains only a rebuildable ready-candidate acceleration set, and supports an injected checkpoint callback; every Task start still passes through authoritative `CaseEngine.admissionDecision`. Candidate loss invokes the engine repair boundary before deadlock is declared.
- `runDurableCase` uses repository CAS checkpoints so Attempt-start persistence succeeds before executor dispatch and settlement persistence precedes claim release. It checks each checkpoint candidate against the concrete store's materialized-snapshot capacity when available. External-effect dispatch additionally fails closed before the real Attempt/executor boundary if the store cannot prove capacity for the running state and contract-bounded post-effect successors. A settlement-checkpoint exception preserves the durable predecessor and lease; a later `reopen:true` load persists recovery before terminal release/retry.

A CAS conflict does not automatically replay a transaction callback or dispatch an executor. Store caches, journal fingerprints, validation frontiers, Task/dependency counters, CaseEngine ready/claim-holder sets, ClaimLedger overlap tries, and runner ready candidates are performance-only derived state and may never replace Case/lease authority. A top-level reconcile or restore must be able to rebuild them exactly.

## 11. Source-slice acceptance

The source slice is accepted only when the executable matrix in `MVP.md` passes in the declared runtime and documentation does not claim provider behavior that was not executed.

## 12. Current slice exclusions, final-MVP requirements, and post-MVP non-goals

The following are **not implemented or verified by the current source slice but are final-MVP requirements where selected by the accepted deployed architecture**:

- live Cloudflare Worker/CaseDO/AgentDO deployment and durable provider ownership;
- authenticated local-Agent connection, bounded delivery/capacity, reconnect and runtime effect handling;
- actual deployed D0012-derived Git publication with provider authorization/policy/restart/rollback qualification;
- a public secured MCP endpoint, current-client qualification, authentication, tenant/Case authorization, replay/reconnect and payload/rate bounds;
- external model/provider authentication, minimum-necessary repository egress, secret/redaction policy, request limits and tokenizer/billing/retry semantics when an external provider is selected;
- fresh-environment Cloudflare/GitHub/provider/MCP/Agent configuration instructions, migration/rollback/runbooks and deployed E2E qualification;
- R2/D1 or equivalent storage/projection only if a later accepted architecture requires those owners.

The following remain current or likely **post-MVP/evidence-gated** rather than automatic blockers:

- persistent/cross-worker context CAS solely for cache hit rate, locality scheduling, speculative execution, multi-provider routing, or large fleet warm pools without measured need;
- arbitrary Termux/network-filesystem semantics beyond specifically qualified local-Agent adapters;
- cross-system exactly-once transactions or effects;
- hostile-storage authenticity from self-hashes alone;
- universal large-DAG/large-repository performance completion or production SLO qualification beyond the accepted MVP workload.

D0017 selects and source-verifies the immutable full-context logical reference plus bounded packed/hybrid trusted receiver-local representation. D0018 now accepts the host-warm/model-fresh trusted-local lifecycle contract above, with no external provider selected; its C1-C4 production repair remains open. Deterministic ContextSlice remains unselected and persistent/shared context CAS remains conditional under D0022.
