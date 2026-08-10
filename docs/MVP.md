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

Design 0011 is also `verified` on the **same mutable `mvp-1a-7` development direction**. It adds local real-Git projection profile `tdev.git.text-tree.v1`: exact UTF-8 `100644` blob/tree/commit construction from a validated semantic root, SHA-1/SHA-256 representation separation, direct full `refs/heads/...` expected-predecessor CAS, durable reread for ambiguous publication outcomes, and fenced rollback. It does not create a new `mvp-*` branch and does not promote Git OIDs/ref state to tdev semantic authority.

Design 0012 is `verified` on that same direction for bounded profile `tdev.git.remote-existing-branch.v1`. It adds an authenticated **derived remote-publication source contract** over a locally elected D0011 candidate: existing branch only, immutable target-bound intent, no raw credential/clear target persistence, exact remote predecessor fencing, durable reread/restart reconciliation, and fail-safe fenced rollback. The current deployment also passes an authenticated GitHub push dry-run with interactive prompting disabled. This does not promote Git/provider state to semantic authority and does not claim actual provider-ref integration or protected-branch qualification.

Design 0013 is `verified` on the same direction for repository profile `tdev.repository-context.git-full-text.v1` and model profile `tdev.model.subprocess-json.v1`. It reads one exact immutable local Git commit as full supported UTF-8 text context, requires the reconstructed path-to-text digest to equal the authoritative Attempt `baseDigest`, transports that context and Attempt/Plan/fencing identity to one fresh trusted local subprocess under a request digest, and returns only an existing tdev result to the normal runner/engine acceptance path. Repository/model/process state and measurements remain derived inputs/evidence. The first profile deliberately implements no Context manifest/CAS/Slice, token accounting, warm process, locality scheduling, or external model/provider API.

Design 0014 is `verified` on the same direction for a bounded product-efficiency slice over that full-context baseline. It adds an optional finite executor-local exact-base preparation cache, one-producer/many-reader single-flight, early tree/file byte preflight, unique-blob loading, cancellable Git plumbing, reusable immutable repository encodings, POSIX process-group cleanup beginning at direct-child exit, and non-blocking non-authoritative observations. Cache state is derived, optional and restart-cold; every Attempt still sends the complete canonical request and starts one fresh model process. D0010 Case head/semantic root and Plan `baseDigest` remain authoritative. Deterministic ContextSlice, persistent manifest/CAS, cross-worker reuse, warm processes and external provider/tokenizer contracts remain unimplemented.

## 1.1 Final-MVP program status

The executable source gate below verifies the declared local source/adapters only. Design 0015 now defines the project-level completion target separately: `docs/ROADMAP.md` requires a deployed Cloudflare/local-Agent/Git/MCP product with provider/user configuration and final end-to-end failure/recovery/security/rollback qualification. The current repository is substantially at **Level 0 — Verified Core**; it is not yet Level 1 integrated runtime, Level 2 secured product surface, Level 3 deployable MVP, or Level 4 qualified MVP.

D0014 remains verified after `docs/D0014_POST_VERIFICATION_REVIEW.md`. That review corrects final artifact outer-ZIP provenance, distinguishes retained complete-cache limits from pending live-work bounds, checks capacity+1 LRU churn and tightens benchmark terminology without changing production source.

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

D0012 source candidate `28ed1912dc61b8d33277f599ada6010a30a7f357` independently passed Ubuntu/POSIX run `31328662608`, job `93283174570`: complete `npm run check`, complete coverage, combined D0011+D0012 focused real-Git tests, and effective diff validation. The complete source suite passed **200/200** tests; coverage completed at **92.79% lines / 81.88% branches / 96.52% functions**; the combined focused gate passed **22/22**. The current GitHub transport separately completed an authenticated `push --dry-run` without interactive prompting and without creating its probe ref. Checked evidence is `docs/evidence/mvp-1a-7-remote-git-publication-2026-08-10.json` with SHA-256 `b89afba6de72a289fc6cb8574f2a07943483d1d222bd047b858bf5344479df55`.

D0013 source candidate `3f7c04ad4e343af2968d082bf4ffb559e2580100` independently passed Ubuntu/POSIX run `31331491616`, job `93290347063`: complete `npm run check`, complete coverage, the D0013 real-Git/local-subprocess focused gate, a real source-candidate repository context probe, and effective diff validation. The complete source suite passed **216/216** tests; coverage completed at **92.86% lines / 81.61% branches / 96.34% functions**; `repository-model-transport.mjs` covered **88.57% lines / 65.03% branches / 95.12% functions**; the focused gate passed **16/16**. The independent probe observed 101 files / 1,757,785 bytes and context digest `sha256:aa1b3d1a9b9ee155ed73bc0d4b8250d091ef942558567af39fde8feeec6d6ec4`. Checked evidence is `docs/evidence/mvp-1a-7-repository-model-transport-2026-08-10.json` with SHA-256 `a470635bee28c5584ac61abf51340548d6df5eca3872dbd73569b0ea8a03a614`.

D0014 exact source candidate `bb5e665e9d6c28b130d4e25dc373e8fce2053ff0` independently passed Ubuntu/POSIX run `31348795334`, job `93335641224`: complete `npm run check`, complete coverage, the focused repository/cache/process failure suite, exact baseline/candidate benchmark identity checks, 22 baseline plus 22 candidate scenarios, repeated same-base/multi-base tail workloads, clean diff, and exact source bundle/archive hashing. The complete source suite passed **232/232** tests; coverage completed at **93.10% lines / 82.16% branches / 96.30% functions**; `repository-model-transport.mjs` covered **92.14% lines / 77.04% branches / 97.26% functions**; the focused gate passed **32/32**. Checked evidence is `docs/evidence/mvp-1a-7-repository-model-efficiency-2026-08-10.json` with SHA-256 `ca22551d8137eadefd5af6c1f33196dfee4971f68e65e6d42f063d656b27f610`. The independent workflow artifact digest is `sha256:cb56cc46e57dc71107361bd5ccb4111eb1f610700dbc166e9184842539ba3be0`.

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
| D0012 target/admission | local candidate is unelected, remote target changes, branch absent, or clear credential is embedded | fail before remote mutation; target intent is immutable and contains no clear URL/credential |
| D0012 exact remote fence | two locally elected siblings present one remote predecessor | at most one remote winner; stale predecessor cannot overwrite |
| D0012 ambiguity/restart | push result is lost or transport fails, then adapter restarts | remote reread classifies candidate/predecessor/third/unreadable; no blind replay and target identity must match intent |
| D0012 rollback/provider rejection | rollback current candidate, reject rewind, or advance remote first | exact rollback succeeds when permitted; provider rejection is safe not-applied; stale rollback preserves third winner |
| D0012 routing/secrets | inherited `GIT_DIR` or stderr/embedded credential attempts to redirect/leak | routing scrubbed; canonical intent/receipt/error facts exclude clear target and provider diagnostics |
| D0013 exact repository base | exact commit text map differs from Attempt `baseDigest`, or worktree changes after Plan creation | mismatch fails before subprocess; immutable commit context ignores worktree drift |
| D0013 Git/text safety | executable file, symlink, invalid UTF-8, path/tree bound failure, inherited `GIT_DIR` | `100644`/`100755` retained; unsupported/invalid input fails closed and inherited Git routing cannot redirect scan |
| D0013 request/result binding | stale/wrong request digest, malformed response, subprocess error/timeout/abort/output overflow | no accepted result; bounded failure/observation and existing Task retry owns any later Attempt |
| D0013 repository authority | model returns a ChangeSet | adapter does not mutate index/worktree/ref; result still passes existing Plan/Claim/fencing/Promotion path |
| D0013 full-context baseline | repeated Tasks/retry use same commit | four measured Attempts request 7,031,140 context bytes for one 1,757,785-byte unique context; 5,273,355 bytes repeat and retry rereads full context; the 75% fraction is structurally predictable |
| D0014 same-base preparation | 1/2/4/8 Tasks share one immutable base | exactly one producer per exact key; Git preparation is reused while every Attempt still sends a full request and starts one process |
| D0014 identity/restart/rollback | changed commit or wrong `baseDigest`, cache loss, eviction, restart or `contextCache: false` | stale reuse fails closed; cold/cache-hit request semantics are equal; authoritative Git/current state rebuilds the derived value |
| D0014 concurrency/failure | same-key stampede, different bases, producer failure, one/all reader cancellation | one producer/many readers, unrelated bases remain concurrent, failure is not retained, one cancellation does not poison peers and all-reader cancellation aborts Git |
| D0014 process lifecycle | timeout/abort/overflow/direct-child exit with a descendant holding pipes | complete POSIX process group is cleaned; a valid direct-child response cannot become a false timeout and no descendant survives |
| D0014 observations | callback throws, rejects or never settles | transport outcome is unchanged and never awaits asynchronous observation completion |
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

Controlled promises and barriers establish ordering where needed. Timeouts are deadlock guards, never success evidence. D0008 adds focused capacity, namespace, publication-fault, and settlement/reopen barriers; the locally executable durable/store subset passed 33/33 and the complete Ubuntu/POSIX source and coverage gates passed with the hard-link suite enabled. D0009 adds eight focused non-authoritative model tests for semantic materialization, create/update/delete, rebuild-root equality, input/write-order determinism, injected path-key collision, directory-Merkle fanout, bounded sparse work, broad batch ancestor reuse, and small-head separation; the complete D0009 candidate is included in the 152/152 POSIX source result above. D0010 adds semantic-radix determinism/topology/bounds tests, v3 Promotion/snapshot/Engine tests, SQLite CAS/ambiguity/restart/corruption tests, migration source-race and downgrade tests, scrub/exact-repair/GC tests, and large-tree evidence; the independent focused D0010 gate passed 67/67 and the complete POSIX source gate passed 178/178. D0011 adds 13 focused tests over real bare Git repositories covering exact semantic bytes/mode, deterministic projection, SHA-1/SHA-256 separation, create/update CAS races, pre/post-update recovery, restart, rollback/stale rollback, ref/predecessor/metadata validation, read-only reconciliation, recomputed-digest tamper rejection, inherited Git-environment routing, and hook isolation. D0012 adds nine focused remote-publication tests covering existing-branch admission, local-before-remote order, exact sibling races, lost-response reconciliation, unreadable ambiguity, restart target binding, fenced/stale/provider-rejected rollback, inherited Git routing, and credential/diagnostic non-persistence. D0013 adds 16 focused tests over real temporary Git repositories and real Node subprocesses covering immutable commit context, `100644`/`100755` modes, base binding, symlink/UTF-8 rejection, request binding, bounded failure/observations, spawn/timeout/output/AbortSignal behavior, Git/environment routing isolation, existing retry reconstruction, and repository non-mutation; the independent complete source gate passed 216/216. D0014 expands that focused suite to 32 tests covering exact-key single-flight and hits, bounded eviction/restart/no-cache equality, different-base concurrency, producer failure, reader/all-reader cancellation plus fresh-reader replacement after abort handoff, early oversize rejection, duplicate-blob coalescing, request-byte equality, POSIX descendant cleanup including inherited-pipe false-timeout prevention, and observation throws/rejections/non-settlement; the independent complete source gate passed 232/232.

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

D0013 adds `docs/evidence/mvp-1a-7-repository-model-transport-2026-08-10.json` (SHA-256 `a470635bee28c5584ac61abf51340548d6df5eca3872dbd73569b0ea8a03a614`). The independent source-candidate probe observes 101 supported files / 1,757,785 content bytes and exact context digest `sha256:aa1b3d1a9b9ee155ed73bc0d4b8250d091ef942558567af39fde8feeec6d6ec4`. A separate measured local baseline executes three Cases / four Attempts against that same context, including one transport failure followed by the existing Task retry: 7,031,140 requested context bytes, 1,757,785 unique bytes, 5,273,355 repeated bytes, 1,757,785 retry reconstruction bytes, four process starts and zero process reuse. The 75% fraction follows from `(4 - 1) / 4`; the absolute repository/Git/request/process costs are the measured facts. No token count or external provider-model latency is inferred.

D0014 adds `docs/evidence/mvp-1a-7-repository-model-efficiency-2026-08-10.json` (SHA-256 `ca22551d8137eadefd5af6c1f33196dfee4971f68e65e6d42f063d656b27f610`) and the decision report `docs/D0014_PRODUCT_EFFICIENCY_AUDIT.md`. On the actual 102-file / 1,788,423-byte audit repository, eight same-base Tasks changed from 5,287.2 to 1,027.2 ms wall time, 1.513 to 7.788/s bounded batch completion rate, 48 to 5 Git commands, 14.421 to 1.803 MB Git stdout, 411.98 to 386.92 MiB sampled peak RSS and 282.93 to 129.62 MiB sampled peak heap. Full request bytes remained 15,071,128 and process starts remained eight. Retry preparation amplification changed from 1/2/3/4x to 1x for zero through three retries, while full request/process work remained Attempt-count dependent. Repeated same-base-8 p50/p95 were 5,422.2/5,521.3 ms at baseline and 1,047.2/1,062.3 ms for the candidate; repeated multi-base-8 p50/p95 changed from 194.0/202.9 to 121.8/129.2 ms. Warm filesystem/Git cache, sequential benchmark order, fixture-model realism, sample count, parent-only CPU attribution and memory sampling limits are recorded; these values are not production SLOs.

## 7. Evidence not claimed

No source test proves:

- Durable Object transaction/storage equivalence;
- Worker deployment, bindings, routes, or class migration;
- Agent WebSocket reconnect/hibernation or Termux effects;
- D1/R2 behavior;
- current MCP client compatibility;
- actual D0012 provider-ref integration/restart behavior, provider-specific authorization/IAM or policy introspection, and protected-branch/ruleset behavior;
- cross-process FileSnapshotStore or Design 0004 JournalSnapshotStore CAS, and distributed/provider ImmutableJournalSnapshotStore CAS;
- atomic persistence of ClaimLedger and Case snapshots across owners;
- exactly-once external effects;
- hostile-storage authenticity;
- external-model/provider token duplication, tokenizer economics, network latency, billing, quality or residency savings; D0013/D0014 measure local repository/request bytes only;
- deterministic minimum-context/ContextSlice correctness, dependency expansion, persistent manifest/CAS corruption/GC, or cross-worker reuse; D0014 is only bounded process-local preparation reuse;
- warm process/toolchain reuse benefit; D0014 still starts one process per Attempt and current fixture evidence makes preparation the higher-ROI first fix;
- production load, SLO, cost, or incident recovery;
- universal fit of every component-valid Case under every arbitrarily configured durable-store bound; D0008 instead verifies fail-closed admission/recovery behavior when a concrete bound cannot be satisfied;
- `ImmutableJournalSnapshotStore` publication on the connected tmcp/Termux filesystem, which does not provide the required hard-link primitive.

These are `unavailable`, `pending`, or explicitly current gaps, not passed.

## 8. Completion decision

Design 0015 is verified as a **documentation/program Class 2 rebaseline**, not a runtime implementation. It preserves D0014 source behavior and establishes that final project completion is the Level-4 deployed qualification in `docs/ROADMAP.md`. The current source gate must therefore never be reported as complete Cloudflare/MCP/product qualification.

Design 0014 is verified for its declared **bounded executor-local repository preparation reuse and POSIX lifecycle-hardening scope** on the same mutable `mvp-1a-7` direction. Exact immutable identity binding, same-key single-flight, finite LRU admission/eviction, cache-disabled/cold/restart rebuild, different-key concurrency, early byte preflight, unique-blob loading, Git cancellation, request semantic equality, POSIX descendant cleanup including inherited-pipe success, non-blocking observations, retry ownership, result-only isolation, complete regression, coverage, focused tests, performance matrix, evidence hashing and exact independent source identity are closed by the evidence above. D0010 semantic/current-state authority is unchanged and no durable migration exists. This verification does **not** claim deterministic ContextSlice, persistent/cross-worker CAS, provider/tokenizer/billing savings, warm-process reuse, locality scheduling, Windows process-tree qualification or production SLOs.

Design 0013 remains verified for its declared **bounded trusted-local immutable-repository/full-context/subprocess baseline scope**. Exact commit/base binding, supported Git modes/text/path bounds, immutable-worktree separation, request-digest response binding, result/fencing/Promotion authority preservation, existing retry ownership, actual source-repository reconstruction and absolute full-context/process measurements are closed by its historical evidence. The 75% four-Attempt fraction is structural rather than a novel discovery. D0014 later hardens preparation reuse and process cleanup; D0013 itself does **not** claim an external LLM/provider integration, provider authentication/data-egress/billing/retry semantics, tokenizer/token accounting or token savings, deterministic ContextSlice, persistent CAS, warm executor benefit, locality scheduling or model/provider semantic authority.

Design 0012 is verified for its declared **bounded generic authenticated remote-publication source scope** on the same mutable `mvp-1a-7` direction. Existing-branch admission, immutable remote target intent, exact predecessor fencing, remote reread/restart reconciliation, fail-safe rollback including provider rejection, Git-routing/secret barriers, complete source regression, compatible POSIX validation, and authenticated non-interactive GitHub push negotiation are closed by the evidence above. This verification does **not** claim an actual D0012 provider-ref integration/restart run, provider-specific IAM/ruleset correctness, protected-branch semantics, signing, multi-host publication ownership, provider transactions, or Git/provider semantic authority.

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

D0010 verifies the bounded local semantic root/head/migration/repair/GC authority for opt-in v3 Cases, D0011 verifies the bounded local real-Git projection/ref-CAS layer, D0012 verifies the bounded generic authenticated remote-publication source layer plus current GitHub dry-run authentication capability, D0013 verifies the trusted-local immutable-repository/full-context/subprocess baseline, and D0014 verifies bounded exact-base preparation reuse plus POSIX lifecycle hardening without changing authority. D0015 retains those results and rebaselines the final deployed MVP program. The immediate next context/model gate is decision-neutral: full-context references, manifest/content references, deterministic ContextSlice, warm execution, streaming/lazy delivery and staged hybrids must be compared from the post-D0014 cost profile. Cloudflare ownership, secured MCP, actual provider/runtime Git integration, user/provider configuration and final deployed qualification are now explicit final-MVP follow-on gates rather than permanent non-goals. Persistent cross-worker CAS and broader scale optimizations remain evidence-gated.
