# Design 0004: Incremental Transition Core and Verified Journal Cache

- Class: 2
- Status: verified on 2026-08-07 in the declared source/container scope
- Development identity: `mvp-1a-2`
- Direct code parent: `mvp-1a-1`
- Knowledge inputs: `mvp-1`, `mvp-1a-1`, independent semantic differential tests, fault counterexamples, CPU/GC profiles, and repeated wide/deep benchmarks
- Supersedes: Design 0003 as the current performance/correctness design
- Runtime gate: Node.js 22 or newer; no third-party runtime dependency
- Owners affected: LINEAGE, SPEC, ARCHITECTURE, PROTOCOL, OPERATIONS, SECURITY, DEPLOYMENT, MVP, WORKBOARD
- Implementation paths: `src/engine.mjs`, `src/runner.mjs`, `src/claim-ledger.mjs`, `src/store.mjs`, `test/`, `bench/`

## One-line decision

Keep the generation-1 Work Graph and durable correctness model, but replace root-copy mutation and repeated global derivation with entry-level atomic undo plus incremental rebuildable accounting; preserve journal byte savings only behind durable-byte verification so caches cannot decide CAS or suppress corruption.

## 1. Independent audit result

Design 0003 found the correct broad area but did not fully remove the dominant cost and introduced unsafe cache behavior.

### Retained from `mvp-1a-1`

- immutable compiled Plan and reverse dependency edges;
- frozen committed Task/Attempt/Event records;
- incremental Event suffix validation;
- normalized Claim conflict fast path and overlap trie;
- rebuildable runner ready candidates;
- full-base plus checksummed per-revision journal deltas;
- snapshot schema v2, CaseRepository/store interface, and durable runner protocol;
- explicit refusal to invent Context Plane, warm executor, browser, Cloudflare, or provider substrate that does not exist.

### Disproved or corrected

1. **Root-level COW was still O(V).** Every mutation copied the `taskStates` and `attempts` roots and retained an Event-array copy path. CPU profiles and 128/256/512/1024 measurements showed renewed superlinear growth.
2. **Global derivation remained on the critical path.** Case-state derivation, readiness, claim-holder scans, invariant work, and Promotion fan-in repeatedly traversed large graph state.
3. **The journal materialization cache became de facto CAS authority.** Two `JournalSnapshotStore` instances could cache revision R, one commit R+1, and the stale instance could accept expected R without re-reading durable state. A warmed cache could also hide later base corruption.
4. **The Claim trie retained dead history.** Release removed lease IDs but did not prune empty path nodes; 50,000 acquire/release paths left approximately 50,003 nodes.
5. **Ready candidates needed an explicit repair boundary.** Local candidate loss could otherwise produce a false deadlock.
6. **Blocker propagation could exceed its Event reservation.** Cancellation/failure in particular DAG shapes revisited descendants and emitted duplicate blocker updates; lexical Task order was not guaranteed to be topological.

These are correctness and architecture findings, not merely benchmark preferences.

## 2. Lineage decision

Choose `mvp-1a-2`.

- Code origin remains the supplied `mvp-1a-1` tree.
- The Work Graph, Case/Task/Attempt ontology, public source API, result algebra, Promotion semantics, durable runner, snapshot schema, and store abstraction remain direct foundations.
- Rewriting mutation, accounting, and cache behavior is a substantial correction within the same implementation line.
- A sibling from `mvp-1` or architecture-generation restart would discard working validated code without reducing the resulting foundation or maintenance surface.

## 3. Authoritative and derived state

### Authoritative semantic state

- immutable PlanRevision and Case contract;
- Case state/revision and Event chain;
- TaskState records;
- Attempt records and complete fencing identity;
- accepted typed results and their digests;
- mutation receipts;
- canonical tree/digest after Promotion;
- durable base/delta bytes and the revision CAS observed from those bytes;
- active ClaimLedger lease records and generations.

### Disposable acceleration state

- Task-state counters;
- unsatisfied dependency counters;
- CaseEngine ready Task ID set;
- CaseEngine claim-holder Task ID set;
- deterministic topological Task order derived from the Plan;
- runner-local ready candidates;
- ClaimLedger overlap trie;
- validated Event frontier;
- journal materialized snapshot, delta count, and durable-file fingerprint cache.

Deleting or corrupting acceleration state must not authorize a transition. The implementation exposes deterministic rebuild boundaries and tests exact snapshot/readiness/claim-holder equivalence after rebuild.

## 4. Entry-level mutation transaction

A direct Case mutation uses one internal frame:

- stable internal collection roots remain in place;
- the first write to an existing TaskState or Attempt records the frozen prior entry and installs a mutable entry copy;
- a new Attempt/receipt records an absent marker;
- scalar pre-state records Case state/revision, Event length/frontier, canonical tree/digest;
- appended Events are rolled back by truncating to the prior length;
- rejection restores changed entries/scalars and deletes entries created by the failed mutation;
- commit validates the changed frontier, freezes changed entries, and advances derived indexes.

This preserves all-or-nothing rejection without serializing, parsing, or root-copying the entire Case. Public collection views are stable read-only Proxies and every committed entry remains frozen, so callers cannot mutate committed semantic records through the supported API.

## 5. Incremental validation and full oracle

Incremental commit validation performs the same local semantics for changed data:

- validate only the appended Event suffix and its hash-chain link;
- validate changed TaskState/Attempt cross-links, transitions, result digests, errors, retries, Claims, effect key, and fencing token;
- validate changed receipts and their `command_committed` Event;
- check live Claim conflicts involving changed holders;
- derive Case state from counters/ready state, but require full authoritative Task-record derivation before accepting any non-active terminal/reconciling candidate;
- validate/freeze canonical tree changes and Promotion digest binding.

Full semantic validation remains mandatory for constructor completion, untrusted restore, migration, and the randomized restore oracle. The optimization does not persist a validation verdict.

## 6. Incremental dependency and Case accounting

The engine maintains rebuildable counters from authoritative TaskState records:

- count per Task terminal/nonterminal state;
- unsatisfied direct dependency count per Task;
- ready pending Task IDs;
- claim-holding running/reconciling Task IDs.

When a Task crosses the succeeded boundary, only direct dependents receive count deltas. Changed Tasks and direct dependents refresh ready membership. Case-state candidates use counts and ready cardinality; a terminal/reconciling candidate is confirmed by the full `deriveCaseState` oracle before it changes semantic state.

This removes O(V) root work from ordinary start/settle transitions while keeping acceleration conservative: stale derived state may temporarily keep a Case active, but it cannot author a terminal outcome.

## 7. Deterministic blocker propagation

The Plan yields one deterministic topological Task order. Reconciliation after a newly terminal blocker:

1. builds the affected descendant closure;
2. visits each affected Task at most once in topological order;
3. computes the complete sorted set of direct terminal dependency blockers;
4. emits one `task_blocked` or one changed `task_blockers_updated` Event per Task;
5. derives Case state after propagation.

This removes duplicate updates, keeps Event reservation bounded by Task count, and works even when lexical Task IDs reverse dependency order.

## 8. Scheduler repair boundary

The runner still uses one scheduler for capacity 1 and capacity N. It keeps a local ready candidate set only to reduce scans. Every start still calls `CaseEngine.admissionDecision`, which rechecks:

- Case and Task state;
- actual dependency states;
- attempt budget;
- capability/authority intersection;
- current in-Case Claim conflict.

If local candidates and in-flight work are empty while the Case is nonterminal, the runner calls authoritative `engine.reconcile()`, which rebuilds all acceleration state, then rehydrates candidates before declaring deadlock. Candidate order never chooses canonical output.

## 9. Claim trie lifecycle

The ClaimLedger trie remains a candidate-narrowing index over authoritative active leases. Release now walks the inserted path and removes empty nodes bottom-up. Restore discards/rebuilds the trie from leases. Randomized/reference-oracle tests cover disjoint, exact, ancestor/descendant, deep, and pathological prefix relationships; churn tests verify that released path history does not remain resident.

Claims remain semantic exclusion. CPU/memory/API/network capacity remains ExecutionBudget policy and is not encoded as a durable Claim.

## 10. Journal correctness boundary

`JournalSnapshotStore` remains a single-process local adapter with full base plus canonical checksummed revision deltas. It does not claim distributed or cross-process CAS.

### Required behavior

- create/load/CAS read durable bytes under a process-wide lock keyed by store kind, resolved directory, and Case ID;
- revision comparison comes from the durable base/delta materialization, never an unchecked in-memory revision;
- every load/CAS reads the base and committed delta file bytes and computes a cryptographic fingerprint over exact name, length, and bytes;
- a materialized cache is reusable only when this fingerprint exactly matches a previously fully parsed/validated/replayed state or the exact files written by this store instance;
- any byte change invalidates the cache and forces strict canonical parse, delta checksum/application, revision continuity, final snapshot-digest, and materialized-size validation;
- base missing while deltas exist, malformed/truncated/noncanonical deltas, and post-warm corruption fail closed;
- compaction durably replaces the full base before removing covered deltas; covered deltas at or below the replacement base revision are ignored during recovery.

The fingerprint avoids repeated parse/canonicalization when bytes are unchanged, but it deliberately still reads and hashes all journal bytes. That cost is the price of correctness in this file-layout adapter and remains a known persistence bottleneck.

## 11. Measured outcome

Evidence is retained in:

- `docs/evidence/development-state-comparison-2026-08-07.json`;
- `docs/evidence/mvp-1a-2-control-plane-benchmark-2026-08-07.json`.

Representative independent-child observations in Node 22.16.0:

| Workload | `mvp-1` | `mvp-1a-1` | `mvp-1a-2` |
| --- | ---: | ---: | ---: |
| wide 128, capacity 16, p50 | 2450.946 ms | 144.764 ms | 79.562 ms |
| wide 256, capacity 16, p50 | 10477.996 ms | 350.103 ms | 135.283 ms |
| wide 512, capacity 16 | >15,000 ms stop gate | 1058.664 ms p50 | 253.646 ms p50 |
| wide 1024, capacity 16 | not run after stop gate | 3837.581 ms p50 | 473.166 ms p50 |
| wide 2048, capacity 16 | not run | 15,733.856 ms single observation | 970.171 ms p50 |
| chain 2048, capacity 16 | not run | 17,244.632 ms single observation | 908.019 ms p50 |

All completed graph samples produced the same empty canonical-tree digest. At wide 1024, a diagnostic `--trace-gc-nvp` spot check observed 250 GC events / 153.2 ms total pause for `mvp-1a-1` versus 72 / 59.7 ms for `mvp-1a-2`; this is one diagnostic observation, not a p50 SLO.

Component repeats show Claim and Promotion performance approximately unchanged. Journal retained base+delta bytes remain 270,883 bytes versus 6,550,735 cumulative canonical full-snapshot bytes in the 32-Task/4 KiB workload, but safe durable-byte verification makes journal wall-clock approximately comparable to or slower than full-file replacement in this local container. The byte reduction is retained; the earlier claim that the journal is simply faster is rejected.

## 12. Correctness evidence

The verified source gate covers:

- capacity 1/N canonical equivalence;
- completion-order, executor-identity, retry-interleaving, and accepted-result-order independence;
- complete Attempt fencing and stale result rejection;
- Claim reference-oracle equivalence, generations, admission race, release/replacement, and trie rebuild/prune;
- durable running Attempt before executor invocation and CAS conflict preventing dispatch;
- accepted-result/settlement durability before lease release;
- snapshot/event/result/receipt corruption and v1→v2 migration;
- journal stale independent instance, same-process concurrent CAS single winner, warm-cache corruption, malformed/noncanonical/truncated delta, missing base, orphan temp, and compaction crash shape;
- acceleration loss and deterministic rebuild;
- 100 randomized transition histories checked after every step by full snapshot restore;
- 100 successful three-state graph histories / 2,600 transitions with exact snapshots across `mvp-1`, `mvp-1a-1`, and `mvp-1a-2`;
- a cancellation/blocker counterexample where prior states exhausted Event reservation and the final state succeeds deterministically.

## 13. Complexity and risks

### Accepted complexity

- entry undo bookkeeping and incremental counters add internal code but remove root-copy asymptotics;
- a deterministic topological order is derived once per Plan and never serialized;
- durable file fingerprinting adds O(journal bytes) read/hash work but closes stale/corruption holes without introducing another authority.

### Rejected complexity

- no second serial scheduler;
- no durable ready queue;
- no generic JoinPolicy without product semantics;
- no Context Plane, warm pool, preflight framework, locality policy, browser/session layer, Cloudflare mock, or provider facade without substrate;
- no cross-process lockfile protocol whose crash/recovery lease semantics would exceed the local adapter's intended scope;
- no premature Git/Merkle dependency before a real repository adapter measures Promotion cost.

## 14. Remaining bottlenecks and next ROI

1. **Promotion whole-tree work:** candidate construction, validation, copy, and digest still scale with repository tree size; touched-path/content-addressed construction is the next source-level lever once a real repository substrate exists.
2. **Journal durable verification:** every local load/CAS reads and hashes all base/delta bytes. A transactional single owner/provider is preferable to weakening verification.
3. **Snapshot/public serialization:** durable checkpoints still materialize a complete schema-v2 snapshot at the repository boundary even when the journal stores a delta.
4. **No real executor/context substrate:** repository exploration, context bytes/tokens, process/toolchain cold start, and cache locality remain unavailable rather than estimated.

The next development step with highest expected ROI is a real repository/executor adapter that measures Promotion and context transfer. It should first preserve the existing ownership/determinism gates, then select touched-path Promotion or content-addressed ContextSlice work from observed total-system cost.
