# MVP verification and evidence

> Normative owner for executable acceptance. Observed source evidence is separated from unexecuted provider or distributed-system claims.

## 1. Accepted vertical slice

The verified `mvp-1a-2` slice closes:

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

## 2. Source gate

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
```

Observed in the supplied container for development identity `mvp-1a-2` on 2026-08-07:

- Node.js `v22.16.0`;
- npm `10.9.2`;
- syntax gate passed;
- **110/110 tests passed**;
- in-memory demo succeeded;
- file-backed durable demo succeeded;
- no third-party runtime packages were required.

The coverage invocation also passed all 110 tests and reported 91.59% lines, 81.31% branches, and 96.36% functions over source and tests. Coverage is supporting evidence, not the semantic contract.

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
| warm-cache corruption | mutate durable base after load | next load/CAS fails `store_corrupt` |
| journal fault shapes | malformed/noncanonical/truncated delta, missing base, orphan temp | fail closed or ignore only uncommitted temp |
| compaction crash shape | replacement base durable before covered-delta deletion | exact snapshot restored; covered deltas ignored |
| three-state compatibility | successful transition histories across all three states | 100 seeds / 2,600 transitions exact snapshot equality |

## 4. Test inventory

The 110 tests cover:

- strict JSON, canonical data, and hash behavior;
- Claim overlap, generations, fencing, randomized oracle equivalence, and trie lifecycle;
- Case/Task/Attempt transitions, entry-level rollback, blocker evidence, receipts, and restore/migration;
- effect-class retry/reconciliation/cancellation and stale result handling;
- durable runner checkpoint-before-dispatch and settlement ordering;
- runner capacity/determinism and candidate rebuild;
- result algebra, authority, path/tree policy, bounds, and Promotion;
- memory/full-file/journal CAS, corruption, stale/concurrent writer behavior, compaction, and repository transactions;
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
- cross-process or distributed File/Journal store CAS;
- atomic persistence of ClaimLedger and Case snapshots across owners;
- exactly-once external effects;
- hostile-storage authenticity;
- repository exploration/context bytes/model-token duplication;
- process/toolchain executor cold-versus-warm behavior;
- production load, SLO, cost, or incident recovery.

These are `unavailable` or `pending`, not passed.

## 8. Completion decision

Design 0004 / `mvp-1a-2` is source-verified only when:

- all 110 tests, syntax checks, and both demos pass under Node 22;
- coverage completes without test failure;
- `git diff --check` is clean;
- normative documents agree with the implementation and explicit single-process/provider boundaries;
- the exported repository/archive are named `tdev-mvp-1a-2`;
- the archive excludes `.git`, `node_modules`, coverage output, caches, and transient runtime state;
- a clean extraction installs and passes `npm run check`;
- the archive SHA-256 is generated and independently checked;
- provider/distributed layers remain explicitly unverified.
