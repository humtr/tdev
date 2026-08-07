# Design 0003: Efficient Parallel Control Plane

- Class: 2
- Status: superseded on 2026-08-07 by Design 0004
- Builds on: Design 0002
- Runtime gate: Node.js 22 or newer; no third-party runtime dependency
- Owners affected: SPEC, ARCHITECTURE, PROTOCOL, OPERATIONS, SECURITY, DEPLOYMENT, MVP, WORKBOARD
- Implementation paths: `src/`, `test/`, `bench/`


> Historical record: this document describes the `mvp-1a-1` candidate and is not the current design. Independent audit found that root collection copying remained O(V), the Claim trie retained released path nodes, the runner needed an explicit candidate-rebuild boundary, blocker propagation could exhaust reserved Events, and the journal materialization cache could accept stale CAS and hide post-warm corruption. Current corrections are normative in `0004-incremental-transition-core-and-verified-journal-cache.md`.

## One-line definition

Preserve the single authoritative Work Graph, complete fencing, isolated results, and deterministic Promotion while removing repeated whole-state canonical cloning/validation, indexing active claim overlap, and adding an optional append-delta local persistence adapter whose optimizations never become semantic truth.

## 1. Evidence classification

### Repository facts

- `CaseEngine.#withEventReservation` canonically serialized and reparsed all mutable Case state before every direct mutation solely to provide rollback.
- `_assertInvariants` revalidated the entire Event hash chain, every Task, every Attempt, accepted-result digests, receipts, claim holders, Case derivation, and canonical digest after hot-path mutations.
- `snapshot()` additionally re-normalized all successful results and canonically cloned the whole snapshot before hashing and cloning it again for output.
- runner readiness scans the full Task order and `admissionDecision` scans claim-holding Tasks; these are derived queries over the Case owner rather than durable facts.
- `ClaimLedger.tryAcquire` compared every requested claim set against every active lease. `claimSetsConflict` re-normalized already-normalized compiled/leased claims for each pair.
- the source core has no repository scanner, context compiler, model transport, process spawn lifecycle, toolchain pool, or provider executor implementation. A Context Plane or warm process pool inside this kernel would therefore be speculative architecture.

### Measured baseline in the supplied Node 22.16.0 container

Measurements are microbenchmarks, not production SLO claims.

- 128 independent successful observation Tasks: capacity 1 ~= 2.42 s; capacity 16 ~= 2.64 s.
- 64 independent successful observation Tasks: capacity 1 ~= 645 ms.
- Ablation at 128 Tasks: removing full invariant passes reduced ~= 2.41 s to ~= 1.47 s; removing canonical rollback cloning reduced it to ~= 1.02 s; removing both reduced it to ~= 101 ms. The two costs interact through allocation and GC.
- 2,000 disjoint ClaimLedger acquisitions took ~= 6.32 s; a prototype that only removed repeated claim normalization reduced this to ~= 0.74 s while retaining the same O(N^2) lease scan.
- durable 32-Task execution with 4 KiB observation values produced a final snapshot ~= 203 KiB but caused ~= 6.48 MiB of cumulative snapshot writes through the in-memory counting adapter.
- Promotion over a 20,000-file base tree with one touched path took ~= 165 ms. This is material at repository scale but smaller than the current control-plane amplification in the tested workload.

### External engineering evidence

- Content-addressed stores and explicit immutable inputs are established ways to avoid re-uploading/recomputing identical data; Bazel remote caching separates action metadata from a CAS, and Remote Execution APIs use digests for inputs. This supports a future tdev Context/Artifact plane once a real repository/executor adapter exists.
- Git's tree/blob object model confirms that immutable tree construction can be content-addressed and incremental without making mutable branch/reference state part of the object model.
- Write-ahead designs append small committed records and periodically checkpoint/compact rather than rewrite the whole durable image on every transition. tdev may use that principle only if every journal record is fenced, checksummed, replayable, and compaction preserves the existing CAS semantics.

### Inference

The highest ROI source change is not a new executor abstraction. It is to make correctness checks incremental over immutable validated state and make rollback copy-on-write. Claim indexing is the next independent control-plane lever. An append-delta store can reduce local persistence write amplification without changing the Case snapshot protocol or dispatch-before-durable boundary.

### Unknowns retained

Real LLM token duplication, repository exploration cost, Agent process cold start, toolchain cache locality, Cloudflare storage transactions, distributed claim-owner persistence, R2 CAS behavior, and Git publication latency are unmeasured because those adapters do not exist in this source slice.

## 2. Decisions

### 2.1 Copy-on-write mutation frame

A direct mutation still has atomic rejection semantics. The implementation changes *how* rollback is obtained:

- authoritative collections are frozen between mutations;
- a mutation frame shallow-copies collection roots;
- a TaskState or Attempt is copied only before the engine mutates that entry;
- immutable accepted results, errors, historical Events, receipts, and unchanged entries remain shared;
- on rejection the old frozen roots/scalars are restored;
- on commit the changed entries and collection roots are frozen again.

The frame is an implementation device, not a second state owner and not part of snapshots.

### 2.2 Incremental invariant frontier

Full validation remains mandatory for untrusted restore/migration and can be invoked by the snapshot boundary. During normal execution:

- historical frozen Events are validated once; only the appended suffix is rechecked;
- unchanged frozen TaskState and Attempt records are not re-normalized/re-hashed;
- newly changed records receive the same exact local invariant checks before they are frozen;
- global invariants whose meaning can change without modifying a record, including Case-state derivation and concurrent claim compatibility, remain checked;
- accepted results are normalized at acceptance and on untrusted restore, not re-normalized at every live checkpoint.

No validation result is persisted as authority. The frontier is discarded/rebuilt on restore.

### 2.3 Normalized claim fast path and ClaimLedger prefix index

Public claim helpers continue to validate arbitrary callers. Compiled Plan claims and stored active lease claims are already normalized immutable data and may use a private normalized conflict path.

`ClaimLedger` maintains a derived in-memory resource trie/index over active leases:

- exact and `/**` prefix semantics remain identical;
- read/read remains compatible; write or execute conflicts on overlap;
- acquire queries only overlapping resource paths instead of scanning every lease;
- release removes the lease from the index;
- restore rebuilds the index from the authoritative lease snapshot and still rejects conflicting snapshots;
- the index is not persisted and cannot authorize or fence anything by itself.

### 2.4 Scheduler ownership remains unchanged

This design does not add a serial scheduler, durable ready queue, or competing scheduler state. `runCase` maintains a rebuildable ready-candidate `Set` so it does not ask for a full-DAG readiness scan on every scheduling pass. A candidate is never authority: immediately before start, `CaseEngine.admissionDecision` rechecks current Task state, dependencies, authority, and in-Case claims. Direct dependents are refreshed from immutable Plan reverse edges after settlement. The set can be discarded and rebuilt from `CaseEngine.readyTaskIds()` without changing a legal result.

The CaseEngine also maintains a rebuildable claim-holder set to avoid repeated admission scans. Neither index is persisted. No critical-path/locality heuristic is accepted yet because the source slice has no duration/context-cache telemetry with which to validate such a policy. Runtime candidate order may vary with completion order, but canonical integration ordering and accepted-result semantics remain unchanged and are tested across capacities/completion permutations.

### 2.5 Append-delta local persistence adapter

Add an optional `JournalSnapshotStore` implementing the same `create/load/compareAndSwap` contract as current stores.

- a compacted base is a complete canonical Case snapshot;
- each successful CAS writes one canonical, checksummed delta record by same-directory temp file + fsync + atomic rename + directory fsync;
- a delta contains only changed scalar fields, appended Events, changed TaskState/Attempt/receipt entries, and canonical-tree replacement when present;
- immutable Plan and Case contract must not change across a Case journal;
- load replays deltas in revision order and verifies the final Case snapshot digest after each application;
- compaction writes a new full base first and only then removes covered deltas; stale covered deltas are ignored by revision on recovery;
- the adapter remains single-process local durability, not distributed consistency.

`FileSnapshotStore` remains available as the simplest full-snapshot adapter and compatibility reference.

### 2.6 Live snapshot construction

A live validated engine may structurally assemble snapshot data without first canonical-serializing/reparsing the whole state. The snapshot digest and public defensive clone still traverse the complete snapshot. Restore continues to treat all bytes as untrusted and performs full canonical/semantic validation.

The current schema remains version 2.

## 3. Correctness / performance boundary

Correctness owners:

- Task/Attempt/Case state, accepted result and canonical tree: `CaseEngine`;
- cross-Case lease generation/token/current holder: `ClaimLedger`;
- persisted revision CAS: store;
- deterministic candidate: Promotion.

Performance-only derived data:

- mutation-frame copy markers;
- validation frontier;
- ClaimLedger trie/index;
- the CaseEngine claim-holder index;
- the runner ready-candidate set;
- Journal store materialization and delta-count caches.

A cache/index may be dropped and rebuilt without changing a legal result. Execution capacity remains a runner resource budget and never becomes a semantic Claim.

## 4. Rejected or deferred alternatives

- **Content-addressed Context Plane now:** rejected in the kernel. There is no source/repository/context transport substrate to optimize yet. The future adapter should use immutable digest-addressed manifests/slices rather than copying one common bundle to every worker.
- **Warm executor process pool now:** rejected. `runCase` already reuses the injected executor function and owns no process/toolchain lifecycle. Pooling belongs to a concrete executor adapter.
- **Generic preflight hook now:** rejected. Authority is already checked before dispatch; inventing toolchain/context capability checks without an adapter would create mock architecture.
- **Critical-path/cache-locality scheduling now:** deferred until metrics exist for duration, cache residency, transfer cost, and starvation.
- **Snapshot schema v3 merely to save bytes:** rejected for this slice. Storage-layer deltas can reduce write amplification without a migration/rollback barrier.
- **Out-of-line results now:** deferred until an immutable object/CAS adapter exists. Replacing inline data with opaque references without a byte owner would weaken restore/self-containment.
- **Incremental Promotion now:** deferred after measurement showed the control plane dominates the current tested workloads. The content-addressed tree gate remains valid for a repository adapter.
- **JoinPolicy:** not implemented; no current Task ontology requires quorum/advisory/fallback joins.

## 5. Failure, cancellation, recovery, cleanup

- Mutation-frame rollback restores every root/scalar changed by the frame on any thrown error, including errors after emitted Events.
- A validation-frontier bug must fail closed at the next full snapshot/restore gate; regression tests intentionally corrupt untrusted snapshots to prove full validation remains complete.
- Claim index disagreement is never authoritative: restore is built from lease records, and tests compare indexed decisions with the pure claim semantics.
- Journal load rejects missing revision links, malformed/noncanonical records, record-digest failure, delta application that changes immutable Plan/contract identity, and resulting snapshot-digest mismatch.
- A partially written temp delta is not visible as committed. A committed delta is fsynced before CAS returns.
- Compaction cannot delete the only durable representation of a revision before the replacement base is durable.

## 6. Compatibility, migration, rollback, deployment

- Case snapshot schema stays at v2; no Case data migration is introduced.
- ClaimLedger snapshot schema stays at v1; the trie is reconstructed after restore.
- Public Task/result/Attempt/envelope semantics do not change.
- `FileSnapshotStore` behavior and file format remain supported.
- `JournalSnapshotStore` uses its own local storage layout; rollback can continue using `FileSnapshotStore` for Cases stored in that format, while journal directories require code that understands the journal layout or an explicit compact/export operation.
- No provider behavior is claimed.

## 7. Acceptance matrix and cheapest falsifiers

| Property | Falsifier / evidence |
| --- | --- |
| atomic direct mutation | existing rollback tests plus mutation after one Event and forced later failure |
| complete restore validation | all corruption/re-digest tests continue to fail closed |
| capacity equivalence | same canonical digest/tree at capacity 1 and N |
| completion-order independence | controlled executor completion permutations yield same Promotion |
| incremental validation equivalence | freeze committed records, snapshot live incrementally validated state, full-restore it, and compare the exact snapshot |
| ClaimLedger semantics | indexed acquisition results equal pure pairwise conflict oracle for exact/prefix/read/write/execute cases |
| ClaimLedger scaling | benchmark disjoint active leases before/after |
| journal CAS | one winner, revision regression rejected, load reconstructs exact snapshot |
| journal crash shape | orphan temp ignored; missing/corrupt committed delta fails closed |
| journal compaction | compacted and non-compacted loads produce byte-equivalent canonical snapshot |
| durable dispatch | running Attempt persists before executor call; settlement before lease release remains true |
| source gate | `npm run check`, coverage run, syntax, diff checks |

## 8. Benchmark protocol

Add a checked-in benchmark that reports JSON for:

- wide DAG at capacity 1 and N;
- chain DAG;
- ClaimLedger disjoint acquisition/query;
- Promotion over large trees;
- durable full-snapshot vs journal store: write count, bytes written, final materialized snapshot bytes;
- optional executor cold/warm hooks only after a real executor adapter exists.

Timing numbers are evidence for this container only. Tests should assert semantics/operation counts, not fragile wall-clock thresholds.

## 8.1 Implemented source result

The accepted slice is implemented in lineage `mvp-1a-1`:

- `CaseEngine` mutation rollback is copy-on-write over frozen committed records; the former whole-Case rollback clone is gone.
- normal committed transitions reuse a validation frontier for immutable history, while restore/migration always restart at frontier zero and perform full semantic validation.
- `ClaimLedger` uses a rebuildable exact/subtree overlap trie plus O(1) active lease count; public claim helpers retain arbitrary-input validation.
- `runCase` uses a rebuildable ready-candidate set and Plan reverse edges; `CaseEngine.admissionDecision` remains the authoritative start gate.
- Plan cycle checking no longer repeatedly sorts/shifts the Kahn ready list; cycle outcome/reporting semantics are unchanged.
- `JournalSnapshotStore` implements the existing snapshot CAS interface with a full base, per-revision deltas, verified replay, crash-safe compaction, pre-commit materialized-size fencing, and non-authoritative hot materialization/delta-count caches.
- `bench/control-plane.mjs` records only measurements the current source slice can actually make and labels context/token/cold-start metrics unavailable where their adapters do not exist.

On the checked-in 2026-08-07 Node 22.16.0 benchmark run, 128 independent observation Tasks completed in 156.004 ms at capacity 1 and 111.990 ms at capacity 16, versus the pre-change audit baseline of approximately 2.42 s and 2.64 s respectively. A single 2,000-Task readiness scan took 0.488 ms. Two thousand disjoint ClaimLedger acquisitions took 59.577 ms versus the pre-change baseline of approximately 6.319 s (about 106x faster); 10,000 acquisitions took 309.348 ms, and a disjoint query with 10,000 active leases took 0.036 ms. For a 32-Task durable run with 4 KiB observation payloads, both stores made 67 durable writes, but the full-snapshot adapter wrote 6,550,735 logical bytes while the journal layout occupied 270,883 bytes without compaction, a 95.86% reduction; observed wall-clock was 918.167 ms vs 648.343 ms in that run. A 512-wide capacity-16 run remained 984.466 ms, showing that per-transition O(V) Case/root work is still the largest large-DAG source-level growth term. Promotion over a 20,000-file base with one touched path remained 172.604 ms. These are container microbenchmarks, not production SLOs; the exact JSON is retained in `docs/evidence/mvp-1a-1-control-plane-benchmark-2026-08-07.json`.

## 9. Non-goals and follow-on gates

- no browser lifecycle/DOM/cookie/session concepts;
- no Cloudflare/Agent mock classes;
- no durable scheduler queue;
- no performance quota encoded as Claim;
- no provider-complete durability claim;
- no token-cost claim until an LLM/context adapter can measure exact reused and transferred bytes/tokens;
- next high-ROI gate after this source slice: repository/context CAS + Task ContextSlice in the first real executor adapter, then measured locality placement and incremental Promotion.
