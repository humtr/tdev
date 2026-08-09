# WORKBOARD

## Current baseline

- Repository: `humtr/tdev`
- Development identity / publication ref: `mvp-1a-5`
- Direct code parent: GitHub `mvp-1a-4` commit `1ff7c5d321958df725497d4e3a2649e210b029db`
- Knowledge inputs: verified `mvp-1a-3`, Design 0006 phase-zero persistence profiling, and isolated V/S research evidence
- Runtime target: Node.js 22+
- Canonical architecture owner: `docs/ARCHITECTURE.md`
- Verification owner: `docs/MVP.md`
- Current verified design: `docs/design/0008-authority-boundary-verification-and-durability-admission.md`
- Active Class 2 design: none; a semantic-authority representation design is the next gate

## Active work

D0008 is closed as `verified` for its declared Node 22 source and compatible local/POSIX filesystem scope. The next work must not extend D0008 implicitly: choose a semantic-authority representation only through a separate Class 2 design with migration, rollback/downgrade, mixed-writer exclusion, corruption/repair, GC, security, and provider-independence rules.

## Verified work

### D0008 — verified authority-boundary and durability admission

- Status: `verified` in the declared source/compatible-local-filesystem scope
- Design: `docs/design/0008-authority-boundary-verification-and-durability-admission.md`
- Source candidate: `cf6b89d6bb2cff0b60ab2ca1a4521631f68c559f`
- Hardening: store-owned exact materialized capacity checks; zero-effect external-effect capacity admission; legacy committed-namespace fail-closed parity; deterministic immutable publication fault seam; settlement-checkpoint/Claim reopen liveness
- Correctness evidence: local syntax + 33/33 focused durable/store tests + clean diff check; Ubuntu/POSIX complete `npm run check`, coverage command, diff check, and 16-sample authority smoke all succeeded with hard-link tests enabled
- Authority-path evidence: 32 configured samples; 24 completed 1k/5k/20k samples with exact Promotion/cold-restore equality; all eight 100k samples retained as declared time/RSS stops, including sparse 1/8-write cases
- Evidence: `docs/evidence/mvp-1a-5-authority-boundary-2026-08-09.json` (SHA-256 `57add849efafa93fa74b830ae29001ffc06c783fb70b55c94dcc4052be6ed79c`)
- Boundaries: no semantic-root/schema/journal-format/Git-OID/provider/distributed-Claim change; connected tmcp/Termux filesystem is unqualified for ImmutableJournal publication because hard-link creation was denied

### D0007 — verified immutable-journal materialization reuse

- Status: `verified` in the declared source/container scope
- Design: `docs/design/0007-verified-immutable-journal-materialization-cache.md`
- Direct parent: exact `mvp-1a-3@52e79323f80bccd1123b7a538a6d49d5754cd1ec`
- Implementation: every load/non-create CAS strictly observes the committed namespace and rereads all retained authority bytes; exact ordered filename/length/raw-byte fingerprint equality may reuse only a previously validated instance-local materialization; mismatch/restart/cache loss performs complete D0005 replay
- Correctness evidence: 20/20 focused immutable-journal tests; 130/130 complete source tests; inherited same/cross-process one-winner, migration, corruption, restart, and stale-CAS barriers remain green
- Coverage: 91.84% lines / 81.82% branches / 96.19% functions
- Performance evidence: 32 Tasks / 4 KiB / capacity 8 / three repeats: D0005 Immutable 3397.535 ms p50 -> D0007 Immutable 1007.262 ms p50 (3.373x); candidate Journal 1014.298 ms p50; retained Immutable bytes unchanged at 277,023; fresh-instance load remains about 97 ms
- Evidence: `docs/evidence/mvp-1a-4-materialization-reuse-2026-08-08.json`
- Boundaries: no durable checkpoint/head, history deletion, SQLite authority, provider migration, or distributed-CAS claim

### D0006 — persistence hot-path measurement

- Status: `verified` research/evidence gate
- Design: `docs/design/0006-persistence-hot-path-measurement.md`
- Baseline: exact `mvp-1a-3@52e79323f80bccd1123b7a538a6d49d5754cd1ec`
- Main result: retained-byte read/fingerprint was a small fraction of immutable strict replay; exact cumulative prefix replay byte-work grew about 8x from 16 to 32 tasks in the measured wide observation workload
- Evidence: `docs/evidence/persistence-phase0-2026-08-08.json`
- Decision: D0007 V opened; authoritative checkpoint/Merkle remained deferred

### D0005 — immutable expected-revision journal CAS

- Status: `verified` inherited foundation
- Design: `docs/design/0005-immutable-expected-revision-journal-cas.md`
- Implementation: opt-in `ImmutableJournalSnapshotStore`, immutable expected-revision publication slots, source/target snapshot-digest binding, same-process journal-family serialization, and explicit quiesced legacy-to-v2 cutover
- Correctness evidence: inherited focused immutable-journal, cross-process one-winner, migration, corruption, and complete-source barriers remain mandatory for D0007
- Evidence: `docs/evidence/mvp-1a-3-immutable-journal-2026-08-07.json`
- Remaining boundary: cross-process mixed legacy/new writers remain unsupported during cutover; provider/distributed CAS remains unverified

### D0004 — incremental transition core and verified journal cache

- Status: `verified` inherited foundation
- Design: `docs/design/0004-incremental-transition-core-and-verified-journal-cache.md`
- Implementation: entry-level transaction undo, incremental Task/dependency accounting, deterministic topological blocker propagation, rebuildable scheduler indexes, Claim trie pruning, same-process store serialization, durable-byte-fingerprinted journal materialization cache
- Correctness evidence: randomized full-restore oracle; three-state successful-transition differential; capacity/order/executor/retry determinism; fencing; durable-before-dispatch; corruption/truncation/missing-base/compaction-shape recovery; acceleration loss and rebuild equivalence

### D0003 — efficient parallel control plane

- Status: `superseded and independently re-audited`
- Historical design: `docs/design/0003-efficient-parallel-control-plane.md`
- Preserved value: immutable-record direction, incremental event validation, normalized Claim conflict path, ready candidates, journal delta format, benchmark instrumentation, and explicit substrate stop gates

### D0002 — durable parallel control core

- Status: `verified historical foundation`
- Its correctness invariants remain normative where not replaced by stronger later designs.

## Resulting foundation

- one immutable PlanRevision and DAG;
- one Case lifecycle owner and one Task/Attempt transition path;
- capacity-independent scheduling semantics;
- isolated typed results and one deterministic Promotion/canonical writer;
- complete Attempt identity, fencing, retry/effect-class, Claim, and authority checks;
- durable running Attempt before external dispatch and durable settlement before lease release;
- schema-v2 canonical snapshots and deterministic restore/migration;
- entry-level atomic rollback without root collection copies;
- incremental Task-state/dependency/ready accounting with full restore as the semantic oracle;
- disposable indexes and caches that can be deleted and rebuilt without changing legal output;
- memory, full-snapshot file, Design 0004 journal, and D0005 immutable expected-revision journal adapters;
- D0007 immutable-journal materialization reuse only after strict namespace observation plus exact retained-byte fingerprint equality;
- D0008 concrete-store capacity admission, fail-closed legacy namespace, deterministic local publication-fault evidence, settlement/reopen Claim liveness, and complete authority-path measurement without semantic-authority migration.

## Next highest-ROI gates

These are ordered follow-on gates, not verified implementation claims.

1. open a separate Class 2 semantic-authority representation design comparing the current full-tree authority with repo-independent bounded-fanout content-addressed structures, trusted transactional root/head models, and any simpler measured alternative; require exact identity/domain separation, migration, rollback/downgrade, mixed writers, corruption/repair, GC, security, and recovery rules before implementation;
2. use the accepted representation decision to measure/implement the smallest safe authority update path and prove sparse snapshot/restore behavior without making a derived cache authoritative;
3. add a real repository/Git adapter as a derived projection and publication layer, preserving the separation between tdev semantic identity and Git tree/commit OIDs;
4. add real repository/context/model transport before implementing ContextSlice/CAS, token deduplication, warm executors, or locality scheduling;
5. add Cloudflare CaseDO/AgentDO/D1/R2 adapters plus a durable cross-owner Claim service with migration, rollback, provider transaction, restart, and fault evidence;
6. qualify authenticated Termux/Git operation adapters on a filesystem that satisfies the selected persistence primitives, then add one fenced publication lane and versioned MCP/client qualification.

A transactional persistence-head replacement, authoritative semantic root, history GC, or snapshot-schema migration remains a separate authority/migration design. D0008 may produce evidence for that decision but must not smuggle it in as an optimization.

## Routing

- Development lineage: `LINEAGE.md`
- Change method: `SDD.md`
- Product contract: `docs/SPEC.md`
- Architecture/ownership: `docs/ARCHITECTURE.md`
- State/result/persistence protocol: `docs/PROTOCOL.md`
- Executor/effect operations: `docs/OPERATIONS.md`
- Security/trust/path boundaries: `docs/SECURITY.md`
- Deployment/migration/rollback: `docs/DEPLOYMENT.md`
- MCP projection: `docs/MCP.md`
- Verification and acceptance: `docs/MVP.md`
- Independent audit and implementation report: `docs/IMPLEMENTATION_REPORT.md`
