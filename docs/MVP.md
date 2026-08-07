# MVP verification and evidence

> Normative owner for executable acceptance. This document distinguishes observed source evidence from unexecuted provider claims.

## 1. Accepted vertical slice

The verified MVP is the smallest production-shaped control core that closes:

```text
immutable PlanRevision
  -> derived DAG readiness
  -> authority and claim admission
  -> fenced Attempt
  -> isolated typed result
  -> effect-aware recovery
  -> deterministic Promotion
  -> canonical tree
  -> self-validating snapshot
  -> compare-and-swap durable checkpoint
```

It is not a Cloudflare/Agent/Git/MCP deployment MVP.

## 2. Source gate

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
```

Observed in the supplied container for lineage `mvp-1a-1` on 2026-08-07:

- Node.js `v22.16.0`;
- npm `10.9.2`;
- syntax gate passed;
- **96/96 tests passed**;
- in-memory demo succeeded;
- file-backed durable demo succeeded;
- no third-party runtime packages were required.

The durable demo reloaded the persisted Case at revision 7 and reproduced the same canonical digest as the in-memory demo.

## 3. Acceptance matrix

| Area | Cheapest falsifier | Observed evidence |
| --- | --- | --- |
| immutable graph | mutate Plan / duplicate Task / unknown dependency / cycle | rejected; Plan deep-frozen |
| one Promotion | zero/multiple Promotion or incomplete dependencies | rejected |
| capacity degeneration | same graph at capacity 1 and N | equal canonical digest and manifest |
| parallel admission | disjoint claims with barriers | overlap observed |
| claim exclusion | overlapping write/execute | serialized |
| read compatibility | overlapping read/read | concurrent |
| deterministic order | inverse executor completion order / locale-sensitive IDs | same tree digest |
| Promotion safety | conflicting writes or invalid topology | stable error; base tree preserved |
| closed result algebra | all five work result kinds | normalized and recorded; only ChangeSet applied |
| required validation | failed required check | deterministic no-Promotion failure |
| complete fencing | stale epoch/token/identity/lease or claim-scope substitution | rejected with no state change |
| result idempotency | exact duplicate vs contradictory duplicate | deduplicated vs conflict |
| effect recovery | reopen each effect class, invalid external result, exhausted idempotent budget | class-specific retry/reconcile behavior |
| cancellation race | cancel before late success | cancellation/intent preserved; late result rejected |
| reconciliation | success/not-applied/failed/cancelled/unverified | state matrix preserved |
| authority | missing one set in intersection | Task denied |
| strict JSON | duplicate key, unsafe number, malformed UTF-8, bound overflow | rejected |
| path safety | traversal/reserved/non-normal/topology collision | rejected |
| bounded results | evidence/validation/Artifact aggregate overflow | rejected |
| mutation atomicity | fail after first Event | entire mutation rolled back |
| snapshot integrity | whole digest/event/result/index/state/bounds/blocker corruption | restore rejected |
| legacy migration | Design 0001 succeeded fixture | v2 recomputed and accepted |
| migration persistence | load v1 through repository | v2 CAS-persisted |
| command receipts | replay/conflict/revision mismatch | exact response/no effect semantics |
| store CAS | concurrent/revision-regression/oversize writes | one winner; regression and pre-commit materialized oversize rejected |
| canonical file store | noncanonical/duplicate/malformed bytes | load rejected |
| durable dispatch | inspect store before executor call | running Attempt already persisted |
| checkpoint conflict | force CAS loss before dispatch | zero executor calls |
| durable reopen | persisted running result-only Attempt | interrupted evidence + replacement Attempt |
| stress | 64 independent work Tasks at capacity 1 and 16 | same canonical output; concurrency 16 observed |

## 4. Test inventory

The 96 tests are organized as:

- canonical JSON and canonical data safety;
- claim overlap and cross-Case ClaimLedger behavior;
- durability, fencing, reconciliation, receipts, and snapshot migration;
- durable runner checkpoint ordering;
- graph/Attempt/Promotion invariants;
- authority and path policy;
- result algebra and bounds;
- memory/file/journal stores and repository CAS;
- capacity/determinism stress.

Tests use barriers and controlled promises where ordering matters. Timeouts are deadlock guards, not correctness evidence.

## 5. Coverage gate

Run:

```sh
node --experimental-test-coverage --test test/*.test.mjs
```

Coverage is supporting evidence, not the product contract. The mvp-1a-1 verification run completed at 91.12% lines, 80.25% branches, and 96.40% functions; exact evidence is recorded in `IMPLEMENTATION_REPORT.md`. More important than aggregate percentage are the explicit falsifiers for stale fencing, uncertain effects, corrupted snapshots, atomic rollback, checkpoint-before-dispatch, and Promotion non-mutation.

## 6. Scale and performance evidence

The semantic stress test uses 64 independent work Tasks plus Promotion and runs the same Plan at capacity 1 and 16. It verifies:

- identical canonical digest;
- identical deterministic Promotion manifest;
- actual observed concurrency of 16 in the parallel run.

The checked-in `npm run bench` harness separately measures container-local overhead without imposing wall-clock pass/fail thresholds. On the 2026-08-07 retained run:

- 128 independent observation Tasks: 156.004 ms at capacity 1 and 111.990 ms at capacity 16, with identical canonical digest;
- 512 independent observation Tasks at capacity 16: 984.466 ms, exposing the remaining large-DAG control-plane growth;
- one 2,000-Task readiness scan: 0.488 ms;
- 2,000 disjoint ClaimLedger acquisitions: 59.577 ms (about 106x faster than the retained ~6.319 s pre-change baseline); 10,000 acquisitions: 309.348 ms; one disjoint query at 10,000 active leases: 0.036 ms;
- Promotion over a 20,000-file base with one touched path: 172.604 ms;
- 32-Task durable 4 KiB observation workload: 67 writes for both stores, 6,550,735 logical bytes for full snapshots vs 270,883 bytes in the non-compacted journal layout, a 95.86% logical-byte reduction; observed wall-clock 918.167 ms vs 648.343 ms.

The pre-change audit measured the 128-wide observation workload at approximately 2.42 s / 2.64 s and 2,000 disjoint Claim acquisitions at approximately 6.32 s. These comparisons identify fast-path changes, not production SLOs. Context/token duplication and executor cold/warm-start are not measured because no such adapter exists in this source slice. Exact JSON is in `docs/evidence/control-plane-benchmark-2026-08-07.json`.

## 7. Evidence not claimed

No source test proves:

- Durable Object storage/transaction equivalence;
- Worker deployment, bindings, routes, or class migration;
- Agent WebSocket reconnect/hibernation behavior;
- Termux filesystem/Git/process/network effects;
- D1/R2 access or consistency;
- current MCP client compatibility;
- Git remote publication or protected-branch enforcement;
- cross-process FileSnapshotStore safety;
- atomic persistence of ClaimLedger and Case snapshots;
- exactly-once external effects;
- hostile-storage authenticity;
- production load, SLO, cost, or incident recovery.

These remain `unknown`, not `passed`.

## 8. Completion decision

Design 0003 / lineage `mvp-1a-1` is source-verified when all of the following are true:

- the 96-test gate and both demos pass under Node 22;
- final coverage completes without test failure;
- source syntax is clean; if Git metadata is present, `git diff --check` is clean;
- normative documents agree with implemented defaults and boundaries;
- the development archive excludes `.git`, `node_modules`, coverage output, and transient runtime directories;
- provider layers remain explicitly unverified.
