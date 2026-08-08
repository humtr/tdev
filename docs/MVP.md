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

Observed final values and coverage are retained in `docs/evidence/mvp-1a-4-materialization-reuse-2026-08-08.json` once the full gate closes.

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
| journal fault shapes | malformed/noncanonical/truncated delta, missing base, orphan temp | fail closed or ignore only uncommitted temp |
| compaction crash shape | replacement base durable before covered-delta deletion | exact snapshot restored; covered deltas ignored |
| three-state compatibility | successful transition histories across all three states | 100 seeds / 2,600 transitions exact snapshot equality |

## 4. Test inventory

The 130 tests cover:

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

Controlled promises and barriers establish ordering where needed. Timeouts are deadlock guards, never success evidence.

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

## 7. Evidence not claimed

No source test proves:

- Durable Object transaction/storage equivalence;
- Worker deployment, bindings, routes, or class migration;
- Agent WebSocket reconnect/hibernation or Termux effects;
- D1/R2 behavior;
- current MCP client compatibility;
- Git remote publication/protected-branch behavior;
- cross-process FileSnapshotStore or Design 0004 JournalSnapshotStore CAS, and distributed/provider ImmutableJournalSnapshotStore CAS;
- atomic persistence of ClaimLedger and Case snapshots across owners;
- exactly-once external effects;
- hostile-storage authenticity;
- repository exploration/context bytes/model-token duplication;
- process/toolchain executor cold-versus-warm behavior;
- production load, SLO, cost, or incident recovery.

These are `unavailable` or `pending`, not passed.

## 8. Completion decision

Design 0007 / `mvp-1a-4` is source-verified only when:

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

D0007 exact-byte-gated materialization reuse is part of this completion decision. Durable checkpoint/head authority, history GC, transaction-provider replacement, and compiled-base Promotion remain follow-on work.
