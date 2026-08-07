# WORKBOARD

## Current baseline

- Repository: `humtr/tdev`
- Development line: completed xh-1 source integration
- Source baseline: `mvp-parallel-xh-1@837da18001aa664a5b7665cfb443759e316a4212`
- Reference baseline: `mvp-parallel@b9dea35a04a6e385d0a8ebb5e73e6f86b8027e18`
- Runtime target: Node.js 22+
- Canonical architecture owner: `docs/ARCHITECTURE.md`
- Verification owner: `docs/MVP.md`

## Verified work

- Work item: `D0002-durable-parallel-control-core`
- Status: `verified`
- Design: `docs/design/0002-durable-parallel-control-core.md`
- Evidence: 88 tests, syntax gate, memory demo, durable file demo, capacity 1/16 stress, final coverage run recorded in `docs/IMPLEMENTATION_REPORT.md`

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
- memory/file CAS plus durable checkpoint driver;
- strict input/path/topology/bounds/rollback defenses.

## Next Class 2 gates

These are intentionally not active implementation claims:

1. Cloudflare CaseDO transaction adapter and migration/rollback evidence;
2. persistent AgentDO delivery/epoch/capacity adapter;
3. durable target-claim owner and cross-owner recovery protocol;
4. authenticated Termux Agent operation catalog and reconciliation;
5. content-addressed Artifact and Git-tree Promotion adapter;
6. single fenced Git publication lane;
7. versioned MCP schemas, auth, and client qualification;
8. performance indexes and large-graph/repository qualification.

## Routing

- Change method: `SDD.md`
- Product contract: `docs/SPEC.md`
- Architecture/ownership: `docs/ARCHITECTURE.md`
- State/result/persistence protocol: `docs/PROTOCOL.md`
- Executor/effect operations: `docs/OPERATIONS.md`
- Security/trust/path boundaries: `docs/SECURITY.md`
- Deployment/migration/rollback: `docs/DEPLOYMENT.md`
- MCP projection: `docs/MCP.md`
- Comparative implementation report: `docs/IMPLEMENTATION_REPORT.md`
