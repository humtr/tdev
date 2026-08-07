# WORKBOARD

## Current baseline

- Repository: `humtr/tdev`
- Development identity / publication ref: `mvp-1a-3`
- Direct code parent: GitHub `mvp-1a-2` commit `ee02845c8947b69f810308fd957e3952a8e508b9`
- Knowledge inputs: verified `mvp-1a-2` plus independently reproduced A/B comparison tests and counterexamples
- Runtime target: Node.js 22+
- Canonical architecture owner: `docs/ARCHITECTURE.md`
- Verification owner: `docs/MVP.md`
- Current design: `docs/design/0005-immutable-expected-revision-journal-cas.md`

## Active work

No Class 2 implementation item remains active in this source state. Checkpoint/cache acceleration and compiled-base Promotion remain follow-on hypotheses rather than implementation claims.

## Verified work

### D0005 — immutable expected-revision journal CAS

- Status: `verified` in the declared source/container scope
- Design: `docs/design/0005-immutable-expected-revision-journal-cas.md`
- Implementation: opt-in `ImmutableJournalSnapshotStore`, full retained-history replay, immutable expected-revision publication slots, source/target snapshot-digest binding, same-process journal-family serialization, and explicit quiesced legacy-to-v2 cutover
- Correctness evidence: 18 focused immutable-journal tests; cross-process base/update one-winner races; 128/128 complete source tests; inherited 100-history full-restore oracle and A regression barriers remain green
- Coverage: 91.73% lines / 81.72% branches / 96.14% functions over source and tests
- Evidence: `docs/evidence/mvp-1a-3-immutable-journal-2026-08-07.json`
- Remaining boundary: cross-process mixed legacy/new writers are unsupported during cutover; directory-sync-after-link ambiguity is classified in source but was not deterministically fault-injected

### D0004 — incremental transition core and verified journal cache

- Status: `verified` in the current container
- Design: `docs/design/0004-incremental-transition-core-and-verified-journal-cache.md`
- Implementation: entry-level transaction undo, incremental Task/dependency accounting, deterministic topological blocker propagation, rebuildable scheduler indexes, Claim trie pruning, same-process store serialization, durable-byte-fingerprinted journal materialization cache
- Correctness evidence: 110 tests; randomized full-restore oracle; three-state successful-transition differential; capacity/order/executor/retry determinism; stale/concurrent same-process CAS; fencing; durable-before-dispatch; corruption/truncation/missing-base/compaction-shape recovery; acceleration loss and rebuild equivalence
- Performance evidence: `docs/evidence/development-state-comparison-2026-08-07.json` and `docs/evidence/mvp-1a-2-control-plane-benchmark-2026-08-07.json`
- Final clean archive verification is recorded in `docs/IMPLEMENTATION_REPORT.md` after export.

### D0003 — efficient parallel control plane

- Status: `superseded and independently re-audited`
- Historical design: `docs/design/0003-efficient-parallel-control-plane.md`
- Preserved value: immutable-record direction, incremental event validation, normalized Claim conflict path, ready candidates, journal delta format, benchmark instrumentation, and explicit substrate stop gates
- Disproved or corrected claims: root collection copying remained O(V); large graphs remained superlinear; materialized journal cache could accept stale CAS and hide corruption; Claim trie retained released path history; blocker propagation could exhaust reserved Events
- Historical evidence: `docs/evidence/mvp-1a-1-control-plane-benchmark-2026-08-07.json`

### D0002 — durable parallel control core

- Status: `verified historical foundation`
- Its correctness invariants remain normative where not replaced by the stronger D0004 transition/rebuild rules.

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
- disposable indexes that can be deleted and rebuilt without changing legal output;
- memory, full-snapshot file, and Design 0004 append-delta journal adapters under an explicit single-process local boundary;
- opt-in immutable expected-revision journal CAS with full replay and tested cross-process local-filesystem winner election after quiesced migration cutover.

## Next highest-ROI gates

These are not active implementation claims:

1. profile and implement touched-path/content-addressed Promotion only in the first real repository adapter; current in-memory Promotion still copies/hashes the full tree;
2. profile whether an authenticated checkpoint manifest can save meaningful parse/replay cost while still re-reading/hashing retained authority, or move to a transaction-capable provider; do not add a cache that hides historical corruption;
3. add a real repository/context/model transport before implementing ContextSlice/CAS, token deduplication, warm executors, or locality scheduling;
4. add Cloudflare CaseDO/AgentDO/D1/R2 adapters with migration, rollback, and provider fault evidence;
5. add a durable cross-owner Claim service if Cases may execute through multiple processes/owners;
6. add authenticated Termux/Git operation adapters and one fenced publication lane;
7. qualify versioned MCP schemas, authorization, pagination, reconnect, and current-client behavior.

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
