# WORKBOARD

## Current baseline

- Repository: `humtr/tdev`
- Development identity / publication ref: `mvp-1a-7`
- Branch meaning: active mutable development direction; keep fast-forwarding `mvp-1a-7` while direction is unchanged, and do not create a new `mvp-*` ref merely for a Design/verification/milestone transition
- Direction origin / historical predecessor: exact `mvp-1a-6@131204b782d7c7b64edceb55e335fba10c8e5aee`
- Knowledge inputs: verified D0010 semantic-v3 authority, D0011 local real-Git projection, and D0012 authenticated remote-publication source evidence on the same `mvp-1a-7` development direction
- Runtime target: Node.js 22+
- Canonical architecture owner: `docs/ARCHITECTURE.md`
- Verification owner: `docs/MVP.md`
- Current verified design: `docs/design/0012-authenticated-remote-git-publication.md`
- Active Class 2 design: none; the next highest-ROI design gate is real repository/context/model transport before ContextSlice/CAS work

## Active work

No Class 2 design is active. D0012 is verified on the existing `mvp-1a-7` development direction for its bounded generic authenticated remote-publication source contract plus current GitHub non-interactive push-negotiation capability. Actual provider-ref integration/restart and protected-branch/provider-policy semantics remain qualification work, not semantic authority. The next highest-ROI design gate returns to real repository/context/model transport before ContextSlice/CAS, token deduplication, warm executors, or locality scheduling.

## Verified work

### D0012 — verified authenticated remote Git publication source contract

- Status: `verified` for the generic existing-remote-branch source protocol plus authenticated GitHub push dry-run capability; `mvp-1a-7` remains the same active development direction
- Design: `docs/design/0012-authenticated-remote-git-publication.md`
- Independently validated source candidate: `28ed1912dc61b8d33277f599ada6010a30a7f357`
- Profile: `tdev.git.remote-existing-branch.v1`; D0010 semantic root/Case head remain authority and remote Git remains derived publication
- Admission: locally elected D0011 candidate, non-null exact predecessor, existing remote branch, immutable target-bound intent, and no raw credential or clear push URL in canonical data
- Publication/recovery: exact expected-predecessor remote lease, mandatory remote reread after success/error, no blind replay, restart-safe read-only reconciliation, and fenced rollback with provider rejection kept fail-safe
- Independent Ubuntu/POSIX validation: GitHub Actions run `31328662608`, job `93283174570`; **200/200** complete source tests, **92.79% line / 81.88% branch / 96.52% function** coverage, **22/22** combined D0011+D0012 focused tests, and clean effective diff
- Provider capability: current GitHub transport completed authenticated `git push --dry-run` with `GIT_TERMINAL_PROMPT=0`; the dedicated probe ref remained absent before and after
- Evidence: `docs/evidence/mvp-1a-7-remote-git-publication-2026-08-10.json` (SHA-256 `b89afba6de72a289fc6cb8574f2a07943483d1d222bd047b858bf5344479df55`)
- Boundaries: no actual D0012 provider-ref integration/restart evidence, protected-branch/ruleset qualification, provider-specific IAM/policy introspection, signing, multi-host publication owner, provider transaction coupling, hostile-provider authenticity, or Git/ref semantic authority

### D0011 — verified real local Git projection and fenced publication

- Status: `verified` for local Git object/ref projection only; `mvp-1a-7` remains the same active development direction
- Design: `docs/design/0011-real-git-projection-and-fenced-publication.md`
- Independently validated source candidate: `c321e9079855c87b9df806930b2cd48c61244e9b`
- Profile: `tdev.git.text-tree.v1`; semantic authority remains the D0010 semantic root/Case head and Git OIDs remain derived identities
- Projection: exact UTF-8 semantic path/text map -> `100644` blobs -> Git trees -> explicit-metadata commit, with SHA-1 and SHA-256 repository object formats independently exercised
- Publication: direct full `refs/heads/...` only, no index/worktree; one exact expected-predecessor `update-ref` CAS, durable reread for ambiguous outcomes, and separate fenced rollback
- Hardening: Git tree/blob graph is reread and rebuilt through the existing semantic-root policy; commit bytes are rebound to tree/parent/metadata; inherited `GIT_*` routing is scrubbed; replacement refs and hooks are disabled for plumbing
- Independent Ubuntu/POSIX validation: GitHub Actions run `31325628829`, job `93275404092`; **191/191** complete source tests, **92.80% line / 82.37% branch / 96.34% function** coverage, **13/13** focused real-Git tests, SHA-1/SHA-256 bare-repository capability checks, and clean effective diff
- Evidence: `docs/evidence/mvp-1a-7-git-projection-2026-08-10.json` (SHA-256 `b62bcc3c4f96b407a228a7e35c832f06936087db0ff9954e7dea538142fcfebd`)
- Connected tmcp/Termux: D0011 focused 13/13 passes, but the complete inherited source suite is still not qualified there because ImmutableJournal hard-link publication hits `EACCES`
- Boundaries: no remote fetch/push/ref CAS, provider authorization/protected branch, signed refs/commits, distributed publication owner, provider transaction coupling, Git-object GC, or Git OID semantic authority

### D0010 — verified semantic-authority migration and transactional head

- Status: `verified` for the bounded opt-in local semantic-v3 profile; existing v2 repositories remain supported and unchanged
- Design: `docs/design/0010-semantic-authority-migration-and-transactional-head.md`
- Independently validated source candidate: `152f88daa7775c5d545ec865cc0a8a470b45697e`
- Production choice: compressed UTF-8 path-byte radix profile `tdev.semantic.path-byte-radix.v1`; C3 remains research reference because path-hash-only authority loses topology prefix locality
- Persistence: compact schema-v3 snapshots plus immutable typed semantic objects and one expected-predecessor local SQLite Case head; object existence alone is not authority
- Migration: explicit writer/Claim quiescence, pre-Promotion v2 source only, exact source digest/revision recheck immediately before first v3 head; no rolling mixed-writer mode
- Recovery: ambiguous commit outcomes reconcile the durable head; exact-content repair never moves the head; reference-aware GC preserves current heads and pins under expected-state CAS
- Independent Ubuntu/POSIX validation: GitHub Actions run `31311936616`, job `93240950927`; 178/178 complete source tests, 92.74% line / 82.56% branch / 96.26% function coverage, clean effective diff, and 67/67 focused D0010 migration/head/recovery tests
- Evidence: `docs/evidence/mvp-1a-7-semantic-authority-migration-2026-08-09.json` (SHA-256 `2129639870f970a10e2aaeb7e393672e4e5faec4e9c3e332361285069890f99e`); 12/12 semantic-equality samples
- 100k / one write: 14 semantic-node reads, 7 node writes, 8 object deltas; schema-v3 snapshot 3,396 bytes versus schema-v2 6,180,415 bytes; explicit compatibility materialization remains O(N) and is not hidden in the normal v3 authority path
- Boundaries: no Git OID authority, real repository publication adapter, provider/distributed transaction owner, distributed Claim migration, hostile-storage authenticity, or universal rewrite of historical v2 Cases

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
- D0009 non-authoritative representation evidence rejecting simple directory Merkle and retaining C2/C3 structural knowledge;
- D0010 opt-in semantic-v3 authority with one compressed path-byte radix owner, sparse root Promotion, compact schema-v3 snapshots, transactional local head, quiesced v2 migration, ambiguity recovery, exact repair, and reference-aware GC while legacy v2 remains supported;
- D0011 real local Git projection over that semantic root with bare-repository SHA-1/SHA-256 support, deterministic `100644` text-tree projection, exact local branch-ref CAS/reconciliation/rollback, and no change to semantic authority;
- D0012 generic authenticated remote-publication source protocol over an existing remote branch, with immutable target intent, exact predecessor fencing, reread/restart reconciliation, fail-safe rollback, external credential ownership, and no change to semantic authority.

## Next highest-ROI gates

These are ordered follow-on gates, not verified implementation claims.

1. add real repository/context/model transport before implementing ContextSlice/CAS, token deduplication, warm executors, or locality scheduling;
2. add Cloudflare CaseDO/AgentDO/D1/R2 adapters plus a durable cross-owner Claim service with explicit migration, rollback, provider transaction, restart, and fault evidence;
3. qualify D0012 against an actual provider ref and protected/provider-policy target before promoting it beyond source verification; keep provider refs derived unless a separately accepted direction change says otherwise;
4. qualify authenticated Termux/Git operation adapters on a filesystem that satisfies their selected persistence primitives, then add versioned MCP/client qualification.

D0010 closes the bounded local semantic-v3 authority/head/migration/repair/GC contract, D0011 closes the bounded local real-Git projection/ref-CAS contract, and D0012 closes the bounded generic authenticated remote-publication **source** contract plus current GitHub dry-run authentication capability. Provider transaction ownership, distributed Claims, actual D0012 provider-ref integration/protected-branch qualification, hostile-storage/provider authenticity, and global migration of historical v2 repositories remain future work where applicable.

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
