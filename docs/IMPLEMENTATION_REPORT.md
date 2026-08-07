# mvp-1a-2 independent audit, implementation, and verification report

- Date: 2026-08-07
- Final development identity: `mvp-1a-2`
- Direct code parent: `mvp-1a-1`
- Knowledge inputs: `mvp-1`, `mvp-1a-1`, their tests, benchmarks, failures, counterexamples, and normative documents
- Audited source archives:
  - `tdev-mvp-1.zip`: `e51c8fe2addbd9b289847c22e5643188d632a1408de339ab2bd66403f82fabf5`
  - `tdev-mvp-1a-1.zip`: `8ddd7b461d73e965e8645e1bf3a0442187f67d678df2d3b2c5d9dec948135ae2`
- Verified runtime: Node.js 22.16.0 / npm 10.9.2 / Linux x64
- Normative implementation decision: `docs/design/0004-incremental-transition-core-and-verified-journal-cache.md`
- Reproducible evidence:
  - `docs/evidence/development-state-comparison-2026-08-07.json`
  - `docs/evidence/mvp-1a-1-control-plane-benchmark-2026-08-07.json`
  - `docs/evidence/mvp-1a-2-control-plane-benchmark-2026-08-07.json`
  - `docs/evidence/correctness-audit-2026-08-07.json`

This report treats the supplied documents and benchmark files as hypotheses and evidence, not as authority over the source. The audit order was source, tests, runtime paths, persistence/recovery, semantic diff, fresh measurement, and only then reconciliation with the existing documents.

## Executive conclusion

`mvp-1a-1` was materially better than `mvp-1`, but it was not a finished performance or durability result. It removed several obvious whole-Case operations, yet ordinary transitions still copied root records and repeatedly derived global state. Its journal cache could become a stale CAS authority and could hide later corruption. Its Claim trie retained released path history, its runner could false-deadlock after disposable ready-state loss, and a cancellation/blocker graph could exceed the reserved Event budget.

The final implementation keeps the `mvp-1a-1` Work Graph, lifecycle, fencing, Claim, persistence schema, Promotion, and repository boundaries. It rewrites the transition transaction, dependency/Case accounting, blocker propagation, Claim-index cleanup, scheduler rebuild boundary, and journal cache verification. That makes the technically correct lineage `mvp-1a-2`: a direct architectural successor with major subsystem replacement, not a sibling from `mvp-1` and not a new generation.

The highest measured source-level gain is removal of per-transition O(V) root work. In fresh child processes, 2,048-wide execution fell from a `mvp-1a-1` single observation of 15,733.856 ms to a `mvp-1a-2` p50 of 970.171 ms. The corresponding 2,048-chain result fell from 17,244.632 ms to 908.019 ms. All completed comparison samples produced the same canonical digest. These are local kernel microbenchmarks with an immediate deterministic executor, not provider or production SLO claims.

---

# A. Independent evaluation of `mvp-1 -> mvp-1a-1`

## A.1 Changes that were genuinely good

### Copy-on-write direction

`mvp-1a-1` correctly identified whole-Case rollback cloning as a dominant cost. Moving mutation work toward changed records was the right design direction and explains a large part of the improvement over `mvp-1`.

Evidence:

- 128-wide, capacity 16: `mvp-1` p50 2,450.946 ms; `mvp-1a-1` p50 144.764 ms.
- 256-wide, capacity 16: `mvp-1` p50 10,477.996 ms; `mvp-1a-1` p50 350.103 ms.
- exact canonical digests matched for completed samples.

### Incremental Event validation frontier

Validating only newly appended Event-chain suffixes is compatible with the immutable prefix contract. `mvp-1a-1` correctly recognized that revalidating the entire immutable Event history on every transition is redundant.

### Claim overlap index

The trie-based candidate index preserved the pure Claim conflict oracle and changed disjoint admission from an active-lease scan to path-local lookup. This was a real asymptotic improvement for large active lease sets.

### Scheduler ready candidates and reverse edges

A disposable ready candidate set and precomputed reverse dependencies are appropriate acceleration state. They reduce repeated graph scans while keeping admission in `CaseEngine` authoritative.

### Journal/delta representation

The journal layout substantially reduced serialized full-snapshot bytes. In the measured 32-Task, 4 KiB observation workload, 67 successful writes represented 6,550,735 cumulative canonical full-snapshot bytes, while retained journal base+delta bytes were 270,883 bytes without compaction, approximately 95.9% less.

### Plan algorithm and instrumentation

Kahn-style graph compilation, wider benchmark scenarios, persistence byte accounting, and explicit stop gates were useful engineering improvements. The candidate also correctly refused to invent Context Plane, warm executor, browser, provider, or Cloudflare substrates that do not exist in this source slice.

## A.2 Changes that were wrong or correctness-incomplete

### Materialized journal cache as CAS authority

A cached `JournalSnapshotStore` instance could compare `expectedRevision` against its stale materialization after another store instance had committed a newer revision. That allowed a stale writer to pass the intended compare-and-swap boundary. A warm cache could also conceal later base-file corruption.

This was a correctness failure, not merely a cache invalidation inefficiency.

### Incomplete copy-on-write transaction

The candidate still copied root `taskStates`, `attempts`, receipts, and Event-array state around transitions. It reduced the constant factor but retained O(V) root work. Wide and deep scaling therefore became superlinear again:

- 128-wide p50 144.764 ms;
- 512-wide p50 1,058.664 ms;
- 1,024-wide p50 3,837.581 ms;
- 2,048-wide single observation 15,733.856 ms.

### Claim trie lifetime leak

Release removed tokens but not empty path nodes. Repeated unique acquire/release churn therefore retained dead path history. A 50,000-path diagnostic left approximately 50,003 nodes. The index was semantically disposable, but its memory behavior contradicted the intended active-lease scaling model.

### Disposable scheduler state without a repair boundary

The candidate treated the ready candidate set as non-authoritative in design, but the runner could declare deadlock after candidate loss without first rebuilding from authoritative Task states. A disposable cache is only safely disposable if there is an explicit reconstruction path at the decision boundary.

### Blocker propagation exceeded its reservation model

Some cancellation/failure DAGs revisited descendants and emitted more blocker-update Events than reserved. The observed result was `event_reservation_exhausted` rather than a deterministic terminal Case. This revealed a mismatch between mutation atomicity, graph traversal, and bounded Event accounting.

## A.3 Changes that moved cost instead of removing it

### Journal writes to journal reads/replay/canonicalization

The journal reduced retained bytes and full-snapshot serialization, but it moved work into:

- directory enumeration;
- base and delta reads;
- strict parsing;
- delta replay;
- revision/digest checking;
- materialized snapshot construction;
- repeated canonicalization and allocation.

The candidate's local wall-clock advantage depended partly on trusting its materialized cache. Once stale-writer and corruption detection were restored, final journal p50 became 1,025.905 ms versus candidate 623.460 ms in the repeated component workload. The byte reduction remains real; a general “journal is faster” conclusion is rejected.

### Ready lookup versus complete scheduling work

A sub-millisecond `readyTaskIds()` or candidate lookup does not prove that a Case transition is cheap. The candidate still paid global root-copy, reconciliation, invariant, and state-derivation costs around that lookup.

## A.4 Benchmark effects that were overstated

- The candidate's fast readiness query was valid micro-evidence, but it did not represent total scheduler work.
- The journal byte reduction was valid, but the earlier wall-clock conclusion did not survive durable-byte revalidation.
- Single microbenchmark values were not production SLOs and did not include repository exploration, model context, process startup, provider latency, or actual external effects.
- The candidate benchmark did identify 512-wide residual growth, but its architecture report understated how directly that growth came from remaining root copies and global derivation.

## A.5 Unnecessary or underpriced complexity

The candidate accumulated multiple acceleration structures without fully pricing their rebuild and failure behavior. The trie, ready set, active lease count, materialization cache, validation frontier, and reverse edges were individually reasonable, but their authority boundaries were not uniformly enforced. The final design retains only acceleration that has:

1. an authoritative source;
2. a deterministic rebuild path;
3. a test proving discard/rebuild equivalence;
4. a decision boundary that does not trust it as semantic truth.

## A.6 New regressions introduced by the candidate

- stale journal CAS acceptance;
- post-warm corruption concealment;
- Claim-index dead path retention;
- false scheduler deadlock after ready-candidate loss;
- Event reservation exhaustion during blocker propagation;
- superlinear large-DAG transition growth despite the COW label.

## A.7 Knowledge retained from the candidate

The following insights remain valuable and are directly retained:

- immutable Plan and one Work Graph for capacity 1 and N;
- isolated result followed by deterministic full-join Promotion;
- Claim as semantic exclusion, separate from ExecutionBudget;
- reverse-edge and ready-candidate acceleration;
- incremental immutable-prefix validation;
- journal bytes as a separate metric from wall-clock;
- stop gates for absent provider/context/executor substrates;
- source-level benchmark harnesses that distinguish wide and deep DAGs;
- explicit complexity and recovery accounting.

---

# B. Newly discovered insights

| Insight | Root cause | Evidence | Gain or consequence | Complexity / semantic risk | Decision |
| --- | --- | --- | --- | --- | --- |
| Per-transition root copying remained the dominant large-DAG cost | Candidate COW copied collection roots and Event-array state | 2,048-wide 15,733.856 ms single observation; profiles and source path showed repeated root work | Entry undo + incremental counters produced 970.171 ms p50 | Moderate internal bookkeeping; rollback bugs would be high risk | **Adopted**, with randomized full-restore oracle |
| Case-state derivation must be incremental but terminal decisions need a full oracle | Global state scans were costly; counters alone could become stale authority | Wide and chain superlinear scaling; acceleration discard tests | O(1)/local updates on ordinary transitions while full authoritative derivation confirms non-active candidates | Counters add derived mutable state | **Adopted conservatively**; counters are rebuildable and cannot author terminal truth alone |
| Blocker propagation should be topological and visit each affected Task once | Descendants were revisited before all direct blockers stabilized | Reproduced `event_reservation_exhausted` on cancellation/blocker graph | Bounded Events and deterministic complete blocker sets | Requires one derived topological order | **Adopted** |
| Disposable scheduler state requires an explicit repair boundary | Runner interpreted empty candidates as semantic deadlock | Candidate-loss regression test | Cache/index loss no longer changes completion | Small extra reconciliation path | **Adopted** |
| Journal cache validation requires exact durable-byte identity, not revision memory | Independent writers and later corruption invalidate cached materialization | stale-cache CAS and warm-corruption counterexamples | Restores same-process CAS and fail-closed corruption behavior | O(total journal bytes) read/hash on load/CAS; higher wall-clock | **Adopted** for correctness; remaining cost documented |
| Claim trie memory must scale with active paths, not historical paths | Release removed tokens but not empty nodes | 50k diagnostic and 2k regression/rebuild test | Eliminates dead-history retention | Low complexity; pruning mistakes could lose conflict candidates | **Adopted** with pure-oracle equivalence |
| Promotion, not Claim, is the next represented source-level subsystem lever | Claim p50 stayed approximately unchanged while Promotion remained whole-tree | Claim 10k: 263.936 -> 253.138 ms; Promotion 172.562 -> 159.153 ms | No claim rewrite justified; whole-tree Promotion remains visible | A premature Merkle/Git abstraction would be high complexity | **Promotion change deferred** until a real repository adapter supplies workload evidence |
| Context/token and warm-executor optimization cannot be measured in this kernel | No repository scanner, model transport, or process/toolchain lifecycle | Source inspection and benchmark capability matrix | Prevents fabricated metrics and mock architecture | Implementing abstractions now would create unowned state | **Not implemented**; stop gate and required future metrics retained |

---

# C. Final Architecture Decision

## C.1 Selected identity: `mvp-1a-2`

The final state is a direct successor of `mvp-1a-1`.

### Code origin

The implementation directly retains and modifies the candidate's source tree, public modules, schema-v2 snapshot, CaseRepository, durable runner, ClaimLedger, result algebra, fencing identities, and benchmark structure.

### Architecture foundation

The foundation remains:

```text
immutable PlanRevision
  -> one finite Work Graph
  -> CaseEngine as sole Task/Attempt/Event/result authority
  -> optional cross-Case ClaimLedger
  -> isolated executor results
  -> exactly one deterministic full-join Promotion
  -> snapshot-schema-v2 durable boundary
```

The work rewrites important internal subsystems but does not replace this ontology or ownership model.

### Ownership model

- `CaseEngine`: Task/Attempt/Case lifecycle, accepted results, Events, receipts, canonical tree, canonical digest.
- `CaseRepository`: load/migrate/transaction/command and snapshot CAS coordination.
- `FileSnapshotStore` / `JournalSnapshotStore`: local durable bytes and same-process CAS serialization.
- `ClaimLedger`: cross-Case semantic exclusion leases only.
- runner: capacity and dispatch orchestration, never lifecycle truth.
- Promotion: sole canonical integration path.
- indexes/caches/counters/candidate sets: non-authoritative, rebuildable acceleration.

### Execution model

Capacity 1 and capacity N use the same runner, admission, Task lifecycle, Claim checks, fencing, result acceptance, and Promotion semantics. Capacity changes scheduling opportunity only.

### Why not `mvp-1b-1`

The final code does not branch from `mvp-1`. It keeps substantial candidate code and candidate architecture as its direct base. Returning to `mvp-1` would discard useful, already integrated correctness and product boundaries without simplifying the final implementation.

### Why not `mvp-2a-1`

No new ontology or state-ownership generation was required. The highest-ROI corrections fit inside the existing Case/Work Graph/Promotion architecture. A new generation would add migration and maintenance cost without evidence of a simpler replacement foundation in the represented source slice.

### Supersession

`mvp-1a-2` supersedes `mvp-1a-1` as the active development identity. `mvp-1` and `legacy/mvp-parallel` remain historical/knowledge inputs, not active naming.

---

# D. Actual implementation

## D.1 Entry-level atomic transition transaction

**Previous problem:** candidate mutation frames still copied collection roots and Event-array state for rollback, creating O(V) work and allocation on ordinary transitions.

**New implementation:**

- stable internal collection roots;
- stable read-only public Proxy views;
- deep-frozen committed records;
- entry-level before-images for changed Task, Attempt, and receipt records;
- absent-entry markers for newly inserted records;
- Event rollback by length truncation;
- scalar and canonical-tree before-images only when changed.

**Correctness impact:** rejected mutations restore all authoritative fields. The public API cannot mutate collection roots or frozen committed records.

**Performance impact:** removes root O(V) copying and most associated allocation/GC pressure.

**Complexity trade-off:** transaction bookkeeping is more detailed. The risk is controlled by direct rollback tests, 100 randomized transition histories, and full snapshot restore after every randomized step.

## D.2 Incremental validation with a full restore oracle

**Previous problem:** full immutable history and unchanged records were repeatedly validated.

**New implementation:**

- validate appended Event suffix from the last validated sequence;
- validate only changed Task/Attempt/receipt records and their cross-links;
- preserve full `_assertInvariants` behavior for construction, untrusted restore, migration, and explicit full-oracle checks;
- freeze records only after successful validation.

**Correctness impact:** no durable validation verdict is persisted. Untrusted bytes always take the complete validation path.

**Performance impact:** ordinary transition validation scales with changed records/Event suffix rather than whole Case history.

**Complexity trade-off:** local invariant functions duplicate some full-oracle rules. Randomized restore equivalence guards divergence.

## D.3 Rebuildable dependency and Case accounting

**Previous problem:** readiness, Task-state counts, Claim holders, and Case state were repeatedly derived by full scans.

**New implementation:**

- Task-state counts;
- unsatisfied direct dependency counts;
- ready pending Task set;
- Claim-holding Task set;
- direct-dependent updates when a Task crosses the succeeded boundary;
- deterministic full rebuild from authoritative Task records;
- full `deriveCaseState` confirmation before accepting a terminal/reconciling candidate.

**Correctness impact:** derived state may conservatively keep a Case active if lost or stale, but cannot independently author a terminal outcome. `reconcile()` rebuilds it from semantic state.

**Performance impact:** ordinary readiness and Case accounting become local to the changed Task and direct dependents.

**Complexity trade-off:** additional mutable acceleration exists in memory, but it is absent from the durable schema and has discard/rebuild equivalence tests.

## D.4 Deterministic topological blocker propagation

**Previous problem:** repeated descendant visits could emit duplicate/intermediate blocker Events and exceed the mutation Event reservation.

**New implementation:** build a deterministic topological order once per Plan, compute the affected descendant closure, and visit each affected Task once. Each Task receives one complete sorted blocker set for that propagation.

**Correctness impact:** blocker evidence is complete, deterministic, and bounded by affected Task count.

**Performance impact:** removes repeated propagation work in failure/cancellation DAGs.

**Complexity trade-off:** one derived topological array is retained and rebuilt with the Plan.

## D.5 Scheduler repair before deadlock

**Previous problem:** loss of local ready candidates could be misread as graph deadlock.

**New implementation:** when candidates and in-flight work are both empty while the Case is nonterminal, the runner invokes authoritative engine reconciliation/rebuild, rehydrates candidates, and only then evaluates deadlock.

**Correctness impact:** disposable candidate loss cannot change Case completion.

**Performance impact:** no normal-path penalty beyond a bounded repair when local state is missing.

**Complexity trade-off:** one explicit repair branch.

## D.6 Claim trie pruning

**Previous problem:** inactive path history accumulated indefinitely.

**New implementation:** release walks the indexed path and deletes empty nodes bottom-up. Restore still rebuilds the entire index from authoritative active leases.

**Correctness impact:** conflict semantics are unchanged and remain checked against the pure Claim oracle.

**Performance impact:** memory now follows active indexed paths rather than historical churn.

**Complexity trade-off:** small pruning logic; randomized/reference and churn tests protect candidate completeness.

## D.7 Verified journal materialization cache

**Previous problem:** cached revision/materialization could override durable CAS truth and hide modified/corrupted files.

**New implementation:**

- process-wide same-process lock keyed by store kind, resolved directory, and Case ID;
- every load/CAS reads base and committed delta bytes;
- cryptographic fingerprint over exact file names, lengths, and bytes;
- cache reuse only when the durable fingerprint exactly matches a previously fully validated materialization or exact bytes written by the current operation;
- byte change forces strict parse, canonical-form checks, delta checksum/application, revision continuity, final snapshot digest, and size validation;
- missing base with deltas, malformed/truncated/noncanonical delta, and post-warm corruption fail closed;
- compaction writes/replaces the durable base before covered-delta cleanup.

**Correctness impact:** stale same-process writers are rejected, one same-process concurrent CAS wins, and cache warmth cannot mask later corruption.

**Performance impact:** byte amplification remains low, but verified load/CAS pays O(total journal bytes) read/hash work. The final local journal is not claimed faster than full-file replacement.

**Complexity trade-off:** fingerprinting and shared lock management add code. Cross-process CAS remains intentionally outside this local adapter contract.

## D.8 Reproducible benchmark and evidence tooling

Added:

- `bench/graph-sample.mjs`: one fresh-process graph sample;
- `bench/compare-development-states.mjs`: bounded multi-state comparison with explicit timeout and p50/range output;
- expanded `bench/control-plane.mjs`: wide/deep scheduler, Claim, Promotion, and persistence accounting;
- checked-in JSON evidence with source archive hashes and unavailable-substrate declarations.

No benchmark invents context bytes, model-token duplication, process cold start, or provider latency because those substrates are absent.

---

# E. Verification

## E.1 Source gate

`npm run check` passed in the implementation checkout:

- syntax checks for all `src/*.mjs`, `test/*.mjs`, and `bench/*.mjs`;
- 110 tests passed, 0 failed;
- in-memory demo passed;
- durable demo passed and restored revision 7.

Coverage command:

```text
node --experimental-test-coverage --test test/*.test.mjs
```

Result:

- 110/110 tests passed;
- line coverage 91.59%;
- branch coverage 81.31%;
- function coverage 96.36%.

## E.2 New regression and equivalence tests

The final suite includes new tests for:

- stable read-only collection views and frozen entries;
- incremental live state round-trip through full restore validation;
- acceleration-index discard and deterministic rebuild;
- topological blocker propagation and Event reservation;
- runner ready-candidate repair;
- executor-identity independence;
- retry-interleaving independence;
- Claim trie pruning and restore rebuild equivalence;
- independent File store same-process CAS;
- journal stale independent store, concurrent same-process CAS, warm-cache corruption, truncated/noncanonical delta, missing base, compaction cleanup crash shape, and materialized-size limit.

## E.3 Randomized and differential evidence

- 100 randomized transition histories were serialized and restored through the full untrusted-state validator after every step; all matched.
- 100 successful histories, 2,600 transitions, were compared across `mvp-1`, `mvp-1a-1`, and `mvp-1a-2`; exact snapshots matched.
- the cancellation/blocker counterexample intentionally differs: prior states could throw `event_reservation_exhausted`; final state reaches the deterministic bounded result. This is a correctness repair, not an accepted semantic divergence.

## E.4 Determinism and concurrency gates

Verified in current tests:

- capacity 1/N canonical equivalence;
- scheduling/completion-order independence;
- executor-identity independence;
- retry-interleaving independence;
- deterministic Promotion independent of accepted-result order;
- Claim pure-oracle equivalence;
- same-process Claim admission race and fencing;
- durable running Attempt before executor dispatch;
- checkpoint CAS conflict prevents dispatch;
- settlement persistence before lease release;
- stale result and stale lease rejection;
- restart and cache/index loss reconstruction.

## E.5 Persistence and fault-oriented gates

Covered:

- snapshot digest/Event/result/receipt corruption;
- strict malformed and duplicate-member JSON rejection;
- v1-to-v2 migration and CAS persistence;
- orphan temporary file;
- corrupted base;
- malformed, noncanonical, and truncated delta;
- missing base with deltas;
- warm-cache corruption;
- stale and concurrent same-process writer;
- compaction base durable before covered-delta cleanup;
- materialized maximum-size rejection;
- total in-memory materialization cache loss and replay.

Not claimed:

- cross-process CAS or lock recovery;
- distributed provider transactionality;
- device/block-level physical write amplification;
- hostile-storage authenticity;
- provider/environment behavior absent from the source slice.

## E.6 Three-state graph benchmark

Fresh Node child per sample, immediate deterministic observation executor, no provider/repository/model/process-start cost:

| Workload | `mvp-1` | `mvp-1a-1` | `mvp-1a-2` |
| --- | ---: | ---: | ---: |
| wide 128, capacity 1, p50 | 2,466.573 ms | 134.664 ms | 72.870 ms |
| wide 128, capacity 16, p50 | 2,450.946 ms | 144.764 ms | 79.562 ms |
| chain 128, capacity 16, p50 | 2,524.766 ms | 138.666 ms | 78.199 ms |
| wide 256, capacity 16, p50 | 10,477.996 ms | 350.103 ms | 135.283 ms |
| wide 512, capacity 16 | >15,000 ms stop gate | 1,058.664 ms p50 | 253.646 ms p50 |
| chain 512, capacity 16 | >15,000 ms stop gate | 1,163.964 ms p50 | 255.857 ms p50 |
| wide 1,024, capacity 16 | unavailable after stop gate | 3,837.581 ms p50 | 473.166 ms p50 |
| chain 1,024, capacity 16 | unavailable after stop gate | 4,210.743 ms p50 | 462.453 ms p50 |
| wide 2,048, capacity 16 | unavailable | 15,733.856 ms single observation | 970.171 ms p50 |
| chain 2,048, capacity 16 | unavailable | 17,244.632 ms single observation | 908.019 ms p50 |

Every completed graph sample produced canonical digest:

```text
sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a
```

A single GC diagnostic at wide 1,024 observed:

- `mvp-1a-1`: 250 GC events, 153.2 ms total pause;
- `mvp-1a-2`: 72 GC events, 59.7 ms total pause.

This GC observation is diagnostic only, not a p50 or SLO.

## E.7 Repeated component benchmark

| Component | `mvp-1a-1` p50 | `mvp-1a-2` p50 | Interpretation |
| --- | ---: | ---: | --- |
| scheduler wide 512, capacity 16 | 1,008.588 ms | 210.864 ms | transition-core gain |
| Claim 10,000 disjoint acquisitions | 263.936 ms | 253.138 ms | no material architecture change |
| disjoint Claim query at 10,000 | 0.035 ms | 0.033 ms | same indexed behavior |
| Promotion, 20,000-file base / one touched path | 172.562 ms | 159.153 ms | whole-tree work remains |
| FileSnapshotStore workload | 926.373 ms | 850.732 ms | approximately same class |
| JournalSnapshotStore workload | 623.460 ms | 1,025.905 ms | correctness verification cost restored |

The persistence workload made 67 successful writes. Full-snapshot cumulative canonical bytes were 6,550,735; retained journal base+delta bytes were 270,883. Byte reduction and wall-clock are reported separately.

## E.8 Clean archive verification

The exact final export is packaged with one top-level `tdev-mvp-1a-2/` directory and excludes `.git`, `node_modules`, coverage output, and caches. Archive entry names are checked for absolute paths and `..` traversal, and the export contains no symbolic links. The final ZIP is extracted into an empty directory, then verified with:

```text
npm ci --ignore-scripts --no-audit --no-fund
npm run check
```

The extracted package passes all 110 tests, the in-memory demo, and the durable demo. The generated `.sha256` sidecar is verified against the final ZIP. GitHub branch creation/push is not claimed because no repository remote publication target was provided in this container.

---

# F. Final state classification

## F.1 Implemented and verified in the current container

- `mvp-1a-2` repository identity and synchronized normative documents;
- entry-level atomic mutation with rollback;
- incremental Event/record validation with full restore oracle;
- rebuildable ready/dependency/Task-state/Claim-holder acceleration;
- deterministic topological blocker propagation;
- scheduler repair before deadlock;
- Claim trie pruning and oracle equivalence;
- verified journal cache, same-process stale/concurrent CAS behavior, corruption handling, restart/replay, and compaction crash shape;
- capacity 1/N, scheduling/completion/executor/retry determinism gates;
- 110-test source gate, coverage gate, benchmark harness, and checked-in evidence;
- final clean archive install/check and SHA-256 sidecar verification.

## F.2 Source/design implemented but provider or environment verification remains

None of the implemented source paths require a provider to pass their local contract. The following broader claims remain environment-dependent and are therefore not made:

- cross-process or distributed CAS;
- a provider-backed transactional persistence owner;
- GitHub branch creation/push/publication;
- real external-effect provider reconciliation;
- device-level fsync/physical write behavior across different filesystems.

## F.3 Intentionally not implemented

### Content-addressed Context Plane

Not represented: no repository scanner, context manifest/slice transport, model request adapter, or token accounting exists. Only the stop gate and required future metrics are documented.

### Warm executor pool and locality scheduling

Not represented: executor calls are injected functions; there is no process/toolchain/client lifecycle to reuse. A mock pool would add unowned mutable state without measurable cold-start cost.

### Generic JoinPolicy

No product use case exists beyond the current full-join deterministic Promotion. Generic `allowPartial` or completion-order winner semantics were rejected.

### Preflight/materialization framework

No measured expensive executor failures from missing context/capability/toolchain substrate exist in this kernel.

### Touched-path/Merkle/Git-tree Promotion

Promotion cost is visible, but there is no real repository adapter establishing tree/file count, ChangeSet, validation, and conflict workloads. A premature content-addressed tree would add migration and schema complexity before the workload owner exists.

### Cross-process journal lock protocol

The local file adapters explicitly promise same-process serialization. Crash-safe cross-process leasing/locking would be a new durable protocol and is not justified as a patch to this adapter.

### Browser, DOM, cookie, Cloudflare, Agent, or provider mock architecture

No substrate and no product authority support such layers.

## F.4 Largest current performance bottleneck

Within the represented source slice, the largest remaining architectural bottlenecks are:

1. **Promotion whole-tree construction, validation, copy, and digest** as repository tree size grows;
2. **Journal durable-byte verification** that reads and hashes the complete base/delta set on every load/CAS;
3. **complete schema-v2 snapshot materialization/serialization** at repository checkpoints even when the storage representation is delta-based.

Across the intended product, the potentially larger unmeasured costs are repository exploration, duplicate context/model input, actual executor/process cold start, provider latency, and validation/toolchain work. They remain `unavailable`, not estimated.

## F.5 Highest-ROI next development step

Introduce one real repository/executor adapter with measured ownership boundaries rather than another generic abstraction. Instrument:

- base/tree file count and touched paths;
- candidate construction, conflict detection, copy, hash, validation, and final integration;
- context bytes requested, unique, duplicate, and retry reconstruction;
- executor/process/toolchain startup and reuse;
- validation critical path and reusable evidence.

Use that evidence to choose between touched-path/content-addressed Promotion and ContextSlice/executor reuse. Preserve the current deterministic Promotion, Claim separation, fencing, durable Attempt, CAS, and rebuildable-acceleration invariants while doing so.
