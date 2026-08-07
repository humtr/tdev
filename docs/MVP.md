# MVP verification and evidence

> Normative owner for executable acceptance. Observed source evidence is separated from unexecuted provider or distributed-system claims.

## 1. Accepted vertical slice

The verified parent `mvp-1a-2` slice closes:

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

Design 0005 is verified for the `mvp-1a-3` source/container slice. It adds an opt-in immutable expected-revision local journal while preserving the verified parent barriers. Cross-process local-filesystem winner evidence applies only to immutable writers after the explicit quiesced migration cutover and does not imply distributed/provider storage.

## 2. Source gate

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
```

Parent baseline `mvp-1a-2` retained its recorded 110/110 source evidence. Final `mvp-1a-3` verification on 2026-08-07 observed:

- Node.js `v22.16.0`;
- npm `10.9.2`;
- `npm ci --ignore-scripts --no-audit --no-fund` passed;
- syntax gate passed;
- **128/128 tests passed**;
- in-memory demo succeeded;
- file-backed durable demo succeeded;
- no third-party runtime packages were required.

The final coverage invocation also passed all 128 tests and reported 91.73% lines, 81.72% branches, and 96.14% functions over source and tests. Coverage is supporting evidence, not the semantic contract. Structured D0005 evidence is retained in `docs/evidence/mvp-1a-3-immutable-journal-2026-08-07.json`.

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
| warm-cache corruption | mutate durable base after load | next load/CAS fails `store_corrupt` |
| journal fault shapes | malformed/noncanonical/truncated delta, missing base, orphan temp | fail closed or ignore only uncommitted temp |
| compaction crash shape | replacement base durable before covered-delta deletion | exact snapshot restored; covered deltas ignored |
| three-state compatibility | successful transition histories across all three states | 100 seeds / 2,600 transitions exact snapshot equality |

## 4. Test inventory

The 128 tests cover:

- strict JSON, canonical data, and hash behavior;
- Claim overlap, generations, fencing, randomized oracle equivalence, and trie lifecycle;
- Case/Task/Attempt transitions, entry-level rollback, blocker evidence, receipts, and restore/migration;
- effect-class retry/reconciliation/cancellation and stale result handling;
- durable runner checkpoint-before-dispatch and settlement ordering;
- runner capacity/determinism and candidate rebuild;
- result algebra, authority, path/tree policy, bounds, and Promotion;
- memory/full-file/Design 0004 journal CAS, corruption, stale/concurrent writer behavior, compaction, and repository transactions;
- immutable-journal cross-process create/update races, strict replay/digest continuity, migration order/cutover, malformed/fork/gap/path-type rejection, legacy compaction crash recovery, and Memory-store equivalence;
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

Design 0005 / `mvp-1a-3` is source-verified only when:

- all 128 tests, syntax checks, and both demos pass under Node 22;
- coverage completes without test failure;
- inherited `mvp-1a-2` blocker/runner/File-store/full-restore barriers remain green;
- immutable journal create/update races elect one winner among v2 writers on the tested compatible local filesystem;
- legacy-prefix migration, reverse-format/fork rejection, full historical replay, source/target digest binding, restart, bounds, orphan-temp, and downgrade-guard falsifiers pass;
- `git diff --check` is clean;
- normative documents agree with the explicit quiesced cutover and rollback barrier;
- the exported repository/archive are named `tdev-mvp-1a-3`;
- the archive excludes `.git`, `node_modules`, coverage output, caches, and transient runtime state;
- a clean extraction installs and passes `npm run check`;
- provider/distributed layers and unexecuted directory-fsync fault injection remain explicitly unverified.

Checkpoint/cache acceleration and compiled-base Promotion are not part of this completion decision.
