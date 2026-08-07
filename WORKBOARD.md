# WORKBOARD

## Current baseline

- Repository: `humtr/tdev`
- Development lineage: `mvp-1a-1`
- Source baseline: `mvp-1@837da18001aa664a5b7665cfb443759e316a4212`
- Historical comparison snapshot: `b9dea35a04a6e385d0a8ebb5e73e6f86b8027e18` (not an active development lineage)
- Runtime target: Node.js 22+
- Canonical architecture owner: `docs/ARCHITECTURE.md`
- Verification owner: `docs/MVP.md`

## Active work

No Class 2 implementation item is currently active. The next performance gate requires a real repository/executor adapter so ContextSlice/token/cold-start measurements are not fabricated.

## Verified work

- Work item: `D0003-efficient-parallel-control-plane`
- Status: `verified`
- Design: `docs/design/0003-efficient-parallel-control-plane.md`
- Evidence: 96 tests, syntax gate, both demos, capacity 1/16 determinism, full-restore equivalence for incremental validation, indexed Claim oracle test, Journal CAS/crash/compaction tests, final coverage, and `docs/evidence/control-plane-benchmark-2026-08-07.json`.

- Work item: `D0002-durable-parallel-control-core`
- Status: `verified`
- Design: `docs/design/0002-durable-parallel-control-core.md`
- Evidence: earlier internal correctness gate; superseded as the current verification gate by D0003 while its correctness invariants remain normative

## Resulting foundation

- one immutable PlanRevision and DAG;
- one Case lifecycle owner;
- one deterministic Promotion/canonical writer;
- capacity-independent execution semantics;
- typed isolated result algebra;
- effect-class-specific recovery and reconciliation;
- complete Attempt fencing, claim-set-bound leases, and live first-commit validation;
- narrow cross-Case ClaimLedger;
- authority intersection;
- schema v2 restore/migration/receipts;
- memory/full-snapshot/journal CAS plus durable checkpoint driver;
- copy-on-write atomic mutation, frozen-history incremental validation, indexed claims, and rebuildable ready candidates;
- strict input/path/topology/bounds/rollback defenses.

## Next Class 2 gates

These are intentionally not active implementation claims:

1. Cloudflare CaseDO transaction adapter and migration/rollback evidence;
2. persistent AgentDO delivery/epoch/capacity adapter;
3. durable target-claim owner and cross-owner recovery protocol;
4. authenticated Termux Agent operation catalog and reconciliation;
5. repository/context CAS with deterministic Task ContextSlice and measured token/byte reuse in the first real executor adapter;
6. content-addressed Artifact and incremental Git-tree Promotion adapter after profiling the remaining full-tree cost;
7. warm executor/toolchain pool and locality scheduling only after adapter telemetry proves cold-load/transfer cost;
8. single fenced Git publication lane;
9. versioned MCP schemas, auth, and client qualification;
10. incremental Case-state/receipt invariant accounting if large-DAG profiling confirms the remaining O(V)-per-transition cost.

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
- Comparative implementation report: `docs/IMPLEMENTATION_REPORT.md`
