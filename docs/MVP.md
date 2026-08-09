# MVP verification and evidence

> Normative owner for executable acceptance. Observed source evidence is separated from unexecuted provider or distributed-system claims.

## 1. Accepted vertical slice

The verified `mvp-1a-3` parent retains the complete parallel/durable vertical slice:

```text
immutable PlanRevision
  -> derived DAG readiness
  -> authority and semantic Claim admission
  -> fenced Attempt
  -> isolated typed result
  -> effect-aware recovery
  -> deterministic Promotion
  -> canonical tree
  -> self-validating snapshot
  -> compare-and-swap durable checkpoint
```

It also verifies that performance-only indexes/caches may be discarded and rebuilt without changing legal semantic output. It is not a Cloudflare/Agent/Git/MCP deployment MVP.

Design 0007 targets `mvp-1a-4`. It preserves D0005 immutable expected-revision journal authority and publication while allowing disposable materialization reuse only after strict committed-namespace observation plus exact current retained-byte fingerprint equality. Every load/CAS still rereads every retained authoritative byte; any byte, name, length, file-type, namespace, cache-loss, or restart mismatch forces complete D0005 validation/replay. Cross-process local-filesystem winner evidence still applies only to immutable writers after the explicit quiesced migration cutover and does not imply distributed/provider storage.

Design 0008 is now `verified` for its declared Node 22 source and compatible local/POSIX filesystem scope. It preserves the D0007 authority model while adding concrete-store durable admission, legacy committed-namespace fail-closed parity, deterministic immutable-publication fault evidence, settlement-checkpoint/Claim reopen recovery, and a checked complete authority-path harness. Provider/distributed layers and environments that do not satisfy the required local filesystem primitives remain outside this verification.

Design 0009 is `verified` only as a non-authoritative semantic-representation comparison targeting `mvp-1a-6`. It adds no production semantic-root authority: current `CaseEngine` state, `treeDigest = digest(full tree)`, snapshot v2, journal formats, migration/rollback rules, Git-OID status, and provider/distributed ownership remain those of `mvp-1a-5`. D0009 rejects simple directory Merkle, retains bounded path-byte radix and collision-safe path-hash trie as structural survivors, and prefers the hash-trie family only for the next separate Class 2 migration design.

Design 0010 / `mvp-1a-7` is `verified` for one opt-in **local semantic-v3** profile. It selects the compressed path-byte radix because current topology must be enforced by the same authority structure, adds sparse semantic-root Promotion, compact schema-v3 snapshots, one expected-predecessor local SQLite Case head, explicit commit-ambiguity recovery, quiesced pre-Promotion v2 migration, exact-content repair, and reference-aware GC. Legacy v2 remains supported and Git OIDs remain outside semantic authority.

Design 0011 is also `verified` on the **same mutable `mvp-1a-7` development direction**. It adds local real-Git projection profile `tdev.git.text-tree.v1`: exact UTF-8 `100644` blob/tree/commit construction from a validated semantic root, SHA-1/SHA-256 representation separation, direct full `refs/heads/...` expected-predecessor CAS, durable reread for ambiguous publication outcomes, and fenced rollback. It does not create a new `mvp-*` branch and does not promote Git OIDs/ref state to tdev semantic authority. Remote/provider Git publication remains separate work.

## 2. Source gate

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
```

Parent baseline `mvp-1a-3` retains its recorded 128/128 source evidence and D0005 structured evidence in `docs/evidence/mvp-1a-3-immutable-journal-2026-08-07.json`. Final `mvp-1a-4` verification on 2026-08-08 must observe:

- Node.js `v22.16.0` or another declared Node 22+ runtime;
- `npm ci --ignore-scripts --no-audit --no-fund` success;
- syntax gate success;
- **130/130 tests** including the two D0007 warm-cache namespace/file-type barriers;
- in-memory demo success;
- file-backed durable demo success;
- coverage completion without test failure;
- no third-party runtime packages;
- clean diff/archive verification and remote ancestry from exact `mvp-1a-3@52e79323f80bccd1123b7a538a6d49d5754cd1ec`.

Observed final D0007 values and coverage are retained in `docs/evidence/mvp-1a-4-materialization-reuse-2026-08-08.json`.

D0008 source candidate `cf6b89d6bb2cff0b60ab2ca1a4521631f68c559f` independently passed on Ubuntu/POSIX: install, `npm run check`, `node --experimental-test-coverage --test test/*.test.mjs`, `git diff --check`, and the 16-sample 1k/5k authority-harness smoke. Local executable barriers also passed syntax, 33/33 focused durable/store tests, and `git diff --check`. The current tmcp/Termux filesystem denied hard-link creation on every writable mount probed, so that environment is not qualified for `ImmutableJournalSnapshotStore` publication and is not counted as a source failure.

D0009 final path-key-aware candidate `7ba03082ac94fe75242c22a7b31ca76d933aeb0c` independently passed Ubuntu/POSIX run `31306276819`, job `93227063683`: install, `npm run check`, coverage, effective `git diff --check`, and the full semantic-representation matrix. The complete source suite passed **152/152** tests; coverage completed at **92.57% lines / 83.10% branches / 95.99% functions**. Raw checked evidence is `docs/evidence/mvp-1a-6-semantic-authority-representation-2026-08-09.json` with SHA-256 `f8609316970e28f311d83aecb550b7be07d0a1d53938517931f9271e09ad5db4`.

D0010 source candidate `152f88daa7775c5d545ec865cc0a8a470b45697e` independently passed Ubuntu/POSIX run `31311936616`, job `93240950927`: install, `npm run check`, coverage, effective diff check, 67/67 focused semantic-v3 migration/head/recovery tests, and the 12-sample v3 authority matrix. The complete source suite passed **178/178** tests; coverage completed at **92.74% lines / 82.56% branches / 96.26% functions**. Checked evidence is `docs/evidence/mvp-1a-7-semantic-authority-migration-2026-08-09.json` with SHA-256 `2129639870f970a10e2aaeb7e393672e4e5faec4e9c3e332361285069890f99e`.

D0011 source candidate `c321e9079855c87b9df806930b2cd48c61244e9b` independently passed Ubuntu/POSIX run `31325628829`, job `93275404092`: install, complete `npm run check`, complete coverage, the D0011 real-Git focused gate, SHA-1/SHA-256 bare-repository capability checks, and effective diff validation. The complete source suite passed **191/191** tests; coverage completed at **92.80% lines / 82.37% branches / 96.34% functions**; the focused real-Git gate passed **13/13**. Checked evidence is `docs/evidence/mvp-1a-7-git-projection-2026-08-10.json` with SHA-256 `b62bcc3c4f96b407a228a7e35c832f06936087db0ff9954e7dea538142fcfebd`.

## 3. Acceptance matrix

| Area | Cheapest falsifier | Observed evidence |
| --- | --- | --- |
| immutable graph | mutate Plan / duplicate Task / unknown dependency / cycle | rejected; compiled Plan frozen |
| one Promotion | zero/multiple Promotion or incomplete full join | rejected |
| capacity degeneration | same graph at capacity 1 and N | equal canonical digest and manifest |
| scheduling/completion order | inverse executor timing and accepted-result order | same canonical tree/digest |
| executor identity | different executor IDs/epochs with valid envelopes | evidence differs; canonical result equal |
| retry order | alternate retry interleavings | canonical result equal |
| parallel admission | disjoint claims with barriers | overlap observed |
| Claim correctness | exact/reference oracle over randomized prefix sets | equivalent decisions |
| Claim lifecycle | acquire/release 2,000 unique paths | overlap trie pruned back to root; restore/rebuild equal |
| authority | one missing set in the capability intersection | deterministic denial |
| complete fencing | stale epoch/token/identity/lease/scope | rejected with no state change |
| durable dispatch | inspect store before executor callback | running Attempt already durable |
| checkpoint race | forced CAS loss before dispatch | zero executor calls |
| accepted-result durability | inspect persistence and lease-release ordering | settlement durable before release |
| effect recovery | reopen each effect class / invalid external result | class-specific retry/reconcile/unverified behavior |
| cancellation race | cancel before late success | intent/terminal state preserved; late result rejected |
| blocker propagation | reverse-lexical topological chain and cancellation DAG | one deterministic topological pass; no Event overrun |
| atomic mutation | fail after first Event / invalid reconciliation | all changed entries/scalars/events restored |
| full restore oracle | snapshot after every randomized transition | 100 histories accepted exactly by full restore |
| acceleration loss | delete/corrupt counters, ready set, claim-holder set | top-level reconcile rebuilds exact snapshot/readiness/holders |
| runner candidate loss | clear local ready candidates | repair/rebuild before deadlock; graph completes |
| Promotion safety | conflict/topology/path error | stable failure; old canonical tree preserved |
| strict/canonical data | duplicate key, unsafe number, malformed UTF-8, noncanonical bytes | rejected |
| bounds | result/evidence/Event/receipt/snapshot overflow | rejected before partial commit |
| snapshot integrity | digest/Event/result/index/state/blocker corruption | restore rejected |
| v1 migration | historical succeeded fixture | deterministic v2 recomputation and CAS persistence |
| File store stale race | independent same-process instances | exactly one CAS winner |
| Journal stale race | warm stale instance after another instance commits | stale expected revision rejected |
| Journal concurrent race | independent same-process CAS calls | exactly one winner |
| Immutable journal create race | independent Node processes / absent base | exactly one base winner observed |
| Immutable journal same-process race | independent instances / one expected revision | exactly one winner observed |
| Immutable journal process race | independent Node processes / one expected revision | exactly one winner observed |
| Immutable journal format migration | legacy prefix -> v2; v2 -> legacy | forward accepted; reverse and duplicate predecessor rejected |
| Immutable journal cutover | legacy/new adapters at one predecessor | same-process mixed adapters serialize; cross-process mixed-format writers require legacy-writer quiescence before first v2 publication |
| Immutable journal full replay | historical semantic corruption / restart | warm/cold/reopen integrity result equal; corruption fails closed |
| Immutable warm namespace | warm instance then add malformed committed-looking name | fail closed before materialization reuse |
| Immutable warm base file type | warm instance then replace `base.json` with non-regular entry | fail closed before materialization reuse |
| warm-cache corruption | mutate durable base after load | next load/CAS fails `store_corrupt` |
| Legacy journal record contents | recognized delta with malformed/noncanonical/truncated contents, missing base, replay corruption | covered cases fail closed |
| Legacy committed namespace | malformed committed-looking `delta-*` name or recognized-name non-regular entry | verified fail-closed behavior, including warm materialization; malformed names use `store_journal_filename` and recognized non-regular slots use `store_journal_file_type` |
| Immutable committed namespace | malformed/unsafe committed-looking name or recognized non-regular authority slot | covered cases fail closed before materialization reuse |
| Immutable publication ambiguity | injected failure before/after the final-slot boundary | pre-publication temporary-write/file-sync/final-publish failures leave no successor; directory-sync failure preserves `store_commit_ambiguous` and authoritative re-read observes the possible successor; cleanup cannot retroactively fail a committed successor |
| aggregate durable admission | individually legal Case components whose combined snapshot exceeds configured store bound | external-effect capacity failure/unknown capacity rejects before executor invocation and releases a newly acquired Claim; result-only oversized settlement leaves the durable running predecessor authoritative |
| settlement checkpoint/Claim liveness | checkpoint exception after in-memory settlement and before terminal lease release | idempotent-external reopen durably interrupts the predecessor then retries under budget; reconcilable external work reopens as `reconciling` and retains the lease until fenced terminal reconciliation |
| D0009 semantic equivalence | research model materializes a different tree/current digest | all 141 completed model samples equal current Promotion tree and `digest(tree)` |
| D0009 root determinism | rebuild/input/write history changes research root | focused rebuild and permutation tests pass |
| D0009 hash collision | equal path-hash key aliases/losses complete paths | injected same-key collision bucket preserves deterministic complete paths |
| D0009 directory Merkle | one sparse write in a wide directory requires bounded metadata work | falsified: 100k-wide one-write sample hashes 100,000 sibling refs; C1 rejected |
| D0009 bounded sparse structures | C2/C3 1/8/128 update work scales with total tree entries | checked structural node/hash counts remain sparse; both survive |
| D0009 compatibility tax | research root removes need for current full-tree materialization/digest without migration | falsified: all models still require complete compatibility materialization/digest; three 100k broad stops occur there |
| D0010 root/topology | rebuild/order/batch history changes root or prefix conflict needs O(N) materialization | same final valid trees share root; exact/ancestor/descendant conflicts rejected by radix traversal |
| D0010 sparse authority | 1/8/128 writes or v3 checkpoint secretly materialize/hash the full tree | checked structural reads/writes scale with touched radix paths; compact snapshot excludes full base/canonical/Promotion trees |
| D0010 head/ambiguity | independent expected-predecessor writers both win or unknown commit triggers blind retry | one transactional head winner; pre/at/post-commit faults reconcile predecessor/successor/third-state explicitly |
| D0010 migration/downgrade | live/racing legacy source crosses cutover or post-v3 write downgrades automatically | explicit writer/Claim quiescence plus source digest/revision recheck; post-migration v3 write rejects automatic downgrade |
| D0010 corruption/repair/GC | corrupt reachable object hides behind cache, repair changes authority, or GC deletes live/pinned object | fail closed; repair reproduces exact expected digest without moving head; expected-state GC preserves heads/pins |
| D0011 semantic Git binding | real Git tree/blob bytes differ from candidate semantic root or commit bytes differ from tree/parent/metadata | publish/reconcile fails closed even when candidate digest is recomputed |
| D0011 deterministic/object format | same semantic root built in permuted order; project into SHA-1 and SHA-256 repos | same-format tree/commit deterministic; semantic root equal across formats while Git OIDs use correct format |
| D0011 local ref CAS | two independent creators/writers present one predecessor | exactly one ref winner; stale publication cannot overwrite |
| D0011 ambiguity/restart | inject pre/post-update loss and reopen adapter | predecessor/candidate/third state classified deterministically; no blind replay |
| D0011 rollback | rollback exact winner or after an intervening publication | exact predecessor/absence restored, or stale rollback fenced with third state preserved |
| D0011 process/ref safety | symbolic/wrong namespace, bad predecessor/metadata, inherited `GIT_DIR`, repository hook | fail closed or ignored as specified; target repo cannot be redirected and hook cannot gain publication authority |
| compaction crash shape | replacement base durable before covered-delta deletion | exact snapshot restored; covered deltas ignored |
| three-state compatibility | successful transition histories across all three states | 100 seeds / 2,600 transitions exact snapshot equality |

## 4. Test inventory

The historical D0007 130-test freeze covers:

- strict JSON, canonical data, and hash behavior;
- Claim overlap, generations, fencing, randomized oracle equivalence, and trie lifecycle;
- Case/Task/Attempt transitions, entry-level rollback, blocker evidence, receipts, and restore/migration;
- effect-class retry/reconciliation/cancellation and stale result handling;
- durable runner checkpoint-before-dispatch and settlement ordering;
- runner capacity/determinism and candidate rebuild;
- result algebra, authority, path/tree policy, bounds, and Promotion;
- memory/full-file/Design 0004 journal CAS, corruption, stale/concurrent writer behavior, compaction, and repository transactions;
- immutable-journal cross-process create/update races, digest continuity, migration order/cutover, malformed/fork/gap/path-type rejection, legacy compaction crash recovery, Memory-store equivalence, and D0007 warm namespace/file-type invalidation before materialization reuse;
- capacity stress plus 100 randomized full-restore-oracle histories.

Controlled promises and barriers establish ordering where needed. Timeouts are deadlock guards, never success evidence. D0008 adds focused capacity, namespace, publication-fault, and settlement/reopen barriers; the locally executable durable/store subset passed 33/33 and the complete Ubuntu/POSIX source and coverage gates passed with the hard-link suite enabled. D0009 adds eight focused non-authoritative model tests for semantic materialization, create/update/delete, rebuild-root equality, input/write-order determinism, injected path-key collision, directory-Merkle fanout, bounded sparse work, broad batch ancestor reuse, and small-head separation; the complete D0009 candidate is included in the 152/152 POSIX source result above. D0010 adds semantic-radix determinism/topology/bounds tests, v3 Promotion/snapshot/Engine tests, SQLite CAS/ambiguity/restart/corruption tests, migration source-race and downgrade tests, scrub/exact-repair/GC tests, and large-tree evidence; the independent focused D0010 gate passed 67/67 and the complete POSIX source gate passed 178/178. D0011 adds 13 focused tests over real bare Git repositories covering exact semantic bytes/mode, deterministic projection, SHA-1/SHA-256 separation, create/update CAS races, pre/post-update recovery, restart, rollback/stale rollback, ref/predecessor/metadata validation, read-only reconciliation, recomputed-digest tamper rejection, inherited Git-environment routing, and hook isolation; the independent complete source gate passed 191/191.

## 5. Differential and fault evidence outside the unit suite

The retained development-state audit additionally executed:

- `mvp-1` versus `mvp-1a-1` randomized engine differential over 100 seeds before final design selection;
- a three-state all-success differential over 100 seeds and 2,600 transitions with exact snapshots;
- a cancellation/blocker counterexample where both prior states could fail with `event_reservation_exhausted`, while `mvp-1a-2` completes with bounded deterministic blocker Events;
- stale journal instance and post-warm corruption reproducers before the implementation fix;
- wide/deep child-process scaling and GC diagnostic traces.

The first two source archives remain immutable evidence inputs; external helper scripts used during audit are summarized and converted into checked-in JSON evidence rather than shipped as product authority.

## 6. Scale and performance evidence

The exact three-state measurements are in `docs/evidence/development-state-comparison-2026-08-07.json`. The reusable isolated-child harness is `bench/graph-sample.mjs` plus `bench/compare-development-states.mjs`.

Representative p50 values:

| Scenario | `mvp-1` | `mvp-1a-1` | `mvp-1a-2` |
| --- | ---: | ---: | ---: |
| wide 128, capacity 1 | 2466.573 ms | 134.664 ms | 72.870 ms |
| wide 128, capacity 16 | 2450.946 ms | 144.764 ms | 79.562 ms |
| chain 128, capacity 16 | 2524.766 ms | 138.666 ms | 78.199 ms |
| wide 256, capacity 16 | 10477.996 ms | 350.103 ms | 135.283 ms |
| wide 512, capacity 16 | >15 s stop gate | 1058.664 ms | 253.646 ms |
| wide 1024, capacity 16 | not run after stop gate | 3837.581 ms | 473.166 ms |
| wide 2048, capacity 16 | not run | 15733.856 ms single observation | 970.171 ms |
| chain 2048, capacity 16 | not run | 17244.632 ms single observation | 908.019 ms |

Every completed sample produced the same canonical digest. Independent child samples separated Plan compile/validation, Case construction, run time, and retained post-GC memory. Timeouts are retained as timeouts rather than converted to estimated values.

A one-sample GC diagnostic at wide 1024 observed 250 GC events / 153.2 ms total pause for `mvp-1a-1` and 72 / 59.7 ms for `mvp-1a-2`. It supports the root-copy/object-churn diagnosis but is not a p50 SLO.

The repeated component evidence in `docs/evidence/mvp-1a-2-control-plane-benchmark-2026-08-07.json` shows:

- Claim acquisition/query performance remained approximately unchanged while released trie paths are now pruned;
- Promotion remained approximately unchanged and still exposes full-tree work;
- the 32-Task/4 KiB persistence workload supplied 6,550,735 cumulative canonical snapshot bytes to 67 CAS writes;
- the non-compacted journal retained 270,883 base+delta bytes, approximately 95.9% below cumulative full-snapshot payload bytes;
- safe durable-byte revalidation made journal wall-clock roughly comparable to or slower than full-file replacement in this container, so no blanket “journal is faster” claim remains.

Design 0006 adds the persistence-specific profiling evidence in `docs/evidence/persistence-phase0-2026-08-08.json`. At 32 tasks / 4 KiB observations / capacity 8, D0005 Immutable measured about 3.55 s p50 while retained-byte read plus exact fingerprint was a small fraction of strict replay. Exact cumulative prefix replay byte-work grew from 17,743,078 bytes at 16 tasks to 144,222,942 bytes at 32 tasks.

The `mvp-1a-4` promotion harness `bench/persistence-hot-path.mjs` compares exact source roots with identical Case IDs and rotated store order. Before final source packaging, three repeats on the same Node 22.16.0/Linux x64 container observed D0005 `mvp-1a-3` Immutable at 3397.535 ms p50 and the D0007 candidate at 1007.262 ms p50; candidate Journal was 1014.298 ms p50. Fresh-instance Immutable load remained about 97 ms in both states, showing that cache loss/restart still pays strict replay. These values are experiment evidence, not a production SLO.

These are microbenchmarks in one runtime/container, not production SLOs.

D0008 adds `docs/evidence/mvp-1a-5-authority-boundary-2026-08-09.json` (SHA-256 `57add849efafa93fa74b830ae29001ffc06c783fb70b55c94dcc4052be6ed79c`). Its 32 configured samples cover 1k/5k/20k/100k trees, 1/8/128/broad writes, and wide-flat/deep-path shapes. All 24 completed 1k/5k/20k samples matched the current Promotion oracle and cold restore exactly. All eight 100k samples hit the declared 30 s or 768 MiB stop gate, including sparse 1/8-write cases, and are retained as stopped evidence rather than extrapolated. This evidence opened D0009.

D0009 adds `docs/evidence/mvp-1a-6-semantic-authority-representation-2026-08-09.json` (SHA-256 `f8609316970e28f311d83aecb550b7be07d0a1d53938517931f9271e09ad5db4`). The matrix covers three shapes, four tree sizes, four write batches, and three structural models: 144 model samples total. 141 completed with exact current Promotion-tree and legacy-digest equality. The three stopped 100k broad samples all completed candidate-root update and stopped only during full compatibility materialization/digest under the declared RSS gate. C1 directory Merkle is rejected by 100k-wide sibling fanout. C2 radix survives. C3 collision-safe hash trie survives and was preferred as the next migration-design research candidate: at 100k wide-flat / 10k writes it wrote 21,756 structural nodes and performed 31,757 typed hashes plus 10,000 counted path-key hashes, compared with C2's 61,117 structural nodes and 71,118 typed hashes. These are D0009 research comparison facts, not production SLOs or an authority migration.

D0010 adds `docs/evidence/mvp-1a-7-semantic-authority-migration-2026-08-09.json` (SHA-256 `2129639870f970a10e2aaeb7e393672e4e5faec4e9c3e332361285069890f99e`). All 12 size/touch samples preserve semantic equality. At 100k files the v3 snapshot remains 3,396 bytes versus 6,180,415 bytes for v2; one touched path uses 14 semantic-node reads, 7 node writes, and 8 object deltas. Explicit compatibility materialization remains total-tree work and is reported separately rather than counted as sparse authority. D0010 production selection is the path-byte radix for topology-prefix ownership reasons described in the accepted/verified design, not because the D0009 C3 measurements were invalid.

## 7. Evidence not claimed

No source test proves:

- Durable Object transaction/storage equivalence;
- Worker deployment, bindings, routes, or class migration;
- Agent WebSocket reconnect/hibernation or Termux effects;
- D1/R2 behavior;
- current MCP client compatibility;
- authenticated remote Git fetch/push/ref publication, provider authorization, and protected-branch behavior;
- cross-process FileSnapshotStore or Design 0004 JournalSnapshotStore CAS, and distributed/provider ImmutableJournalSnapshotStore CAS;
- atomic persistence of ClaimLedger and Case snapshots across owners;
- exactly-once external effects;
- hostile-storage authenticity;
- repository exploration/context bytes/model-token duplication;
- process/toolchain executor cold-versus-warm behavior;
- production load, SLO, cost, or incident recovery;
- universal fit of every component-valid Case under every arbitrarily configured durable-store bound; D0008 instead verifies fail-closed admission/recovery behavior when a concrete bound cannot be satisfied;
- `ImmutableJournalSnapshotStore` publication on the connected tmcp/Termux filesystem, which does not provide the required hard-link primitive.

These are `unavailable`, `pending`, or explicitly current gaps, not passed.

## 8. Completion decision

Design 0011 is verified for its declared **bounded local real-Git projection/ref-CAS scope** on the same mutable `mvp-1a-7` development direction. Real bare SHA-1/SHA-256 projection, exact semantic binding, deterministic candidate construction, direct local branch-ref CAS, response-loss reconciliation, restart, fenced rollback, tamper/environment/hook barriers, complete source regression, and compatible POSIX rows are closed by the tests and evidence above. This verification does **not** claim Git OID semantic authority, remote fetch/push or remote ref CAS, provider authorization/protected branches, signing, multi-host publication ownership, provider transactions, Git-object GC, or hostile repository authenticity.

Design 0010 / `mvp-1a-7` remains verified for its declared **bounded opt-in local semantic-v3 scope**. The accepted root/profile, compact snapshot, transactional-head CAS and ambiguity recovery, quiesced migration, rollback/downgrade barrier, corruption/scrub, exact repair, reference-aware GC, legacy regression, and environment rows are closed by the source tests and evidence above. The production profile is path-byte radix rather than D0009 C3 because prefix topology belongs to the same semantic authority. Existing v2 operation remains supported; D0011 adds only the derived local Git layer above it.

Design 0009 / `mvp-1a-6` is verified for its declared **non-authoritative comparison scope** because the focused structural falsifiers are closed, the final path-key-aware candidate passes the full Ubuntu/POSIX source/coverage/diff gate, and the checked matrix preserves current semantic equality for every completed model sample. C1 directory Merkle is rejected; C2 path-byte radix and C3 collision-safe path-hash trie survive structurally; C3 is preferred for the next migration design on checked operation/byte evidence. This completion explicitly does **not** install a new semantic root, transactional head, snapshot/journal format, migration, Git identity, or provider owner. The current engine still uses full-tree `treeDigest` and persistence.

Design 0008 / `mvp-1a-5` remains verified historical evidence for its declared source/compatible-local-filesystem scope: its six accepted design questions were implemented, the D0008 falsifiers closed, and its complete Ubuntu/POSIX source/coverage/diff/harness gate passed. It does not claim provider/distributed durability, Git publication semantics, a new semantic root, or qualification of the connected tmcp/Termux filesystem for ImmutableJournal publication.

The following Design 0007 / `mvp-1a-4` completion record remains historical evidence:

- all 130 tests, syntax checks, and both demos pass under Node 22;
- coverage completes without test failure;
- inherited D0004/D0005 blocker/runner/File-store/full-restore/cross-process/migration/corruption barriers remain green;
- warm historical mutation, malformed committed namespace, and non-regular authority slots cannot hit a cached materialization;
- cache loss/restart returns to complete D0005 replay with identical materialized digest;
- the 32-task / 4 KiB promotion benchmark meets the D0007 continuation target without changing retained bytes or cold-load semantics;
- `git diff --check` is clean and the complete effective diff is reviewed from exact `mvp-1a-3`;
- normative documents agree that every retained authoritative byte is still reread and the cache is disposable/non-authoritative;
- the exported repository/archive are named `tdev-mvp-1a-4`;
- the archive excludes `.git`, `node_modules`, coverage output, caches, and transient runtime state;
- a clean extraction installs and passes `npm run check`;
- the remote `mvp-1a-4` publication is a non-force descendant of exact `mvp-1a-3@52e79323f80bccd1123b7a538a6d49d5754cd1ec`;
- provider/distributed layers and unexecuted deterministic directory-fsync fault injection remain explicitly unverified.

Observed source/container closure for this freeze: 20/20 focused immutable-journal tests, 130/130 complete source tests, 91.84% line / 81.82% branch / 96.19% function coverage, clean `git diff --check`, a 3.373x D0005-to-D0007 Immutable p50 improvement on the declared promotion workload, unchanged 277,023-byte Immutable retained footprint, and a clean provisional archive extraction that reinstalled and passed 130/130 `npm run check`. Remote branch publication is a separate final layer and must be independently read after push.

D0007 exact-byte-gated materialization reuse remains part of that historical/source completion decision. The later D0008 tests are not retroactively counted among the D0007 130-test freeze; they are independently verified by the D0008 focused and Ubuntu/POSIX gates described above.

D0010 verifies the bounded local semantic root/head/migration/repair/GC authority for opt-in v3 Cases, and D0011 verifies the bounded local real-Git projection/ref-CAS layer above it. Transaction-provider replacement, distributed ownership/Claims, authenticated remote Git publication/protected-branch semantics, Git OID authority, hostile-storage authentication, and any broader migration remain separate follow-on work.
