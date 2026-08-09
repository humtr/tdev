# WORKBOARD

## Current baseline

- Repository: `humtr/tdev`
- Development identity / publication ref: `mvp-1a-6`
- Direct code parent: GitHub `mvp-1a-5` commit `aaf7ec9258fb776443dd70345a1acea33ed22d78`
- Knowledge inputs: verified `mvp-1a-5` / Design 0008 plus checked D0009 semantic-representation evidence
- Runtime target: Node.js 22+
- Canonical architecture owner: `docs/ARCHITECTURE.md`
- Verification owner: `docs/MVP.md`
- Current verified design: `docs/design/0009-semantic-authority-representation-comparison.md`
- Active Class 2 design: `docs/design/0010-semantic-authority-migration-and-transactional-head.md` (`accepted`)

## Active work

D0010 is accepted as the `mvp-1a-7` implementation gate. Production v3 selects a **compressed UTF-8 path-byte radix** rather than D0009's benchmark-preferred hash trie because the current semantic contract must enforce file/descendant topology from the same authority structure without an O(N) scan or a second synchronized prefix owner. D0010 authorizes only the bounded opt-in local v3 profile: compact Plan/snapshot roots, sparse Promotion, one transactional local SQLite head, quiesced pre-Promotion v2->v3 migration, explicit ambiguity recovery, scrub/repair, and reference-aware GC. Existing v2 repositories and Git/provider/distributed ownership remain unchanged.

## Verified work

### D0009 — verified semantic-authority representation comparison

- Status: `verified` for non-authoritative model/evidence scope; no production authority migration
- Design: `docs/design/0009-semantic-authority-representation-comparison.md`
- Validated candidate: `7ba03082ac94fe75242c22a7b31ca76d933aeb0c`
- Correctness: focused deterministic/create-delete/collision/batch tests green; independent Ubuntu/POSIX source gate passed 152/152 tests with 92.57% line / 83.10% branch / 95.99% function coverage
- Matrix: 144 model samples; 141 completed with exact current Promotion tree and legacy digest equality; three 100k broad samples stopped only during full compatibility materialization/digest RSS gating
- C1: rejected because a one-path update in a 100k wide directory hashed 100,000 sibling references and about 10.2 MB metadata
- C2: structural survivor; 100k one-path update wrote 16-37 nodes depending on path shape; retained for path-prefix-locality/no-path-hash comparison
- C3: preferred structural research candidate; 100k one-path update wrote six nodes; 100k wide 10k-write update wrote 21,756 nodes and used 31,757 typed hashes + 10,000 counted path-key hashes versus C2's 61,117 nodes / 71,118 typed hashes
- Evidence: `docs/evidence/mvp-1a-6-semantic-authority-representation-2026-08-09.json` (SHA-256 `f8609316970e28f311d83aecb550b7be07d0a1d53938517931f9271e09ad5db4`)
- Decision boundary: C3 preference authorizes only the next migration-design work; current full-tree semantic identity and persistence remain authoritative

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
- D0008 concrete-store capacity admission, fail-closed legacy namespace, deterministic local publication-fault evidence, settlement/reopen Claim liveness, and complete authority-path measurement without semantic-authority migration;
- D0009 non-authoritative representation evidence rejecting simple directory Merkle, preserving C2 radix as fallback/reference, and preferring collision-safe C3 hash-trie structure for a later migration design while current full-tree authority remains unchanged.

## Next highest-ROI gates

These are ordered follow-on gates, not verified implementation claims.

1. implement and falsify accepted D0010: compressed path-byte radix authority, compact Plan/snapshot v3, transactional local head, quiesced forward migration, ambiguity recovery, corruption/repair, and reference-aware GC while preserving all legacy v2 behavior;
2. independently verify the D0010 source/migration/restart/transaction layers and publish `mvp-1a-7` only if every stop gate closes;
3. after D0010 verification, add a real repository/Git adapter as a derived projection and publication layer, preserving the separation between tdev semantic identity and Git tree/commit OIDs;
4. add real repository/context/model transport before implementing ContextSlice/CAS, token deduplication, warm executors, or locality scheduling;
5. add Cloudflare CaseDO/AgentDO/D1/R2 adapters plus a durable cross-owner Claim service with migration, rollback, provider transaction, restart, and fault evidence;
6. qualify authenticated Termux/Git operation adapters on a filesystem that satisfies the selected persistence primitives, then add one fenced publication lane and versioned MCP/client qualification.

A transactional persistence-head replacement, authoritative semantic root, history GC, or snapshot-schema migration still requires that separate migration design. D0009 supplies candidate evidence only and must not be treated as an implicit authority cutover.

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
