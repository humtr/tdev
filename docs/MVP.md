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

Observed in the supplied container on 2026-08-06:

- Node.js `v22.16.0`;
- npm `10.9.2`;
- syntax gate passed;
- **88/88 tests passed**;
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
| store CAS | concurrent/revision-regression writes | one winner; regression rejected |
| canonical file store | noncanonical/duplicate/malformed bytes | load rejected |
| durable dispatch | inspect store before executor call | running Attempt already persisted |
| checkpoint conflict | force CAS loss before dispatch | zero executor calls |
| durable reopen | persisted running result-only Attempt | interrupted evidence + replacement Attempt |
| stress | 64 independent work Tasks at capacity 1 and 16 | same canonical output; concurrency 16 observed |

## 4. Test inventory

The 88 tests are organized as:

- canonical JSON and canonical data safety;
- claim overlap and cross-Case ClaimLedger behavior;
- durability, fencing, reconciliation, receipts, and snapshot migration;
- durable runner checkpoint ordering;
- graph/Attempt/Promotion invariants;
- authority and path policy;
- result algebra and bounds;
- memory/file stores and repository CAS;
- capacity/determinism stress.

Tests use barriers and controlled promises where ordering matters. Timeouts are deadlock guards, not correctness evidence.

## 5. Coverage gate

Run:

```sh
node --experimental-test-coverage --test test/*.test.mjs
```

Coverage is supporting evidence, not the product contract. Exact final percentages are recorded in `IMPLEMENTATION_REPORT.md` after the release run. More important than aggregate percentage are the explicit falsifiers for stale fencing, uncertain effects, corrupted snapshots, atomic rollback, checkpoint-before-dispatch, and Promotion non-mutation.

## 6. Scale evidence

The stress test uses 64 independent work Tasks plus Promotion and runs the same Plan at capacity 1 and 16. It verifies:

- identical canonical digest;
- identical deterministic Promotion manifest;
- actual observed concurrency of 16 in the parallel run.

This proves the core semantic property for that bounded test. It does not prove throughput, memory, or latency suitability for thousands of Tasks or large repositories.

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

Design 0002 is source-verified when all of the following are true:

- the 88-test gate and both demos pass under Node 22;
- final coverage completes without test failure;
- `git diff --check` is clean;
- normative documents agree with implemented defaults and boundaries;
- the release archive excludes `.git` and transient runtime directories;
- provider layers remain explicitly unverified.
