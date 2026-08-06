# Design 0001: Parallel-First Work Graph, Claims, Isolated Results, and Promotion

- Class: 2
- Status: accepted for implementation by the maintainer request of 2026-08-06
- Base: `main@b86287b84375e2aeb833cf775371a7808a1239cf`
- Target branch: `mvp-parallel-xh-1`

## Problem

The prior experimental line expanded contracts before closing an executable development loop. This design starts from the empty `main` base and proves the smallest production-shaped concurrency semantics first.

## Decision

Use one immutable PlanRevision and one CaseEngine state owner. Derive readiness from dependency states. Admit Tasks only when their resource claims are compatible with running Attempts. Execute ordinary Tasks against immutable inputs and accept only isolated ChangeSets bound to the exact base. Use one Promotion Task as the sole canonical writer. Treat capacity one as the same scheduler with a smaller capacity.

The MVP is platform-neutral ECMAScript with no runtime dependency. Provider and durable adapters are deferred until this loop is falsifiable and stable.

## Rejected alternatives

- serial scheduler plus a separate parallel Task type
- executor-specific lifecycle state machines
- concurrent writes to a canonical worktree
- Case-wide or Workspace-wide execution mutex
- a second scheduler-owned readiness cache
- general shell fallback
- Cloudflare storage or deployment before state semantics are executable
- copying the incomplete reference branch wholesale

## Ownership

`docs/SPEC.md` owns required product behavior. `docs/ARCHITECTURE.md` owns the CaseEngine boundary. `docs/PROTOCOL.md` owns records and transitions. `docs/OPERATIONS.md` owns executor behavior. `docs/SECURITY.md` owns effect limits. `docs/DEPLOYMENT.md` owns deferred provider gates.

## Failure and recovery

An executor error fails its Attempt and Task. A blocked graph cannot silently succeed. Duplicate identical results are idempotent; contradictory or stale results fail acceptance. Snapshot reopen marks running Attempts interrupted and returns only result-only Tasks to pending. External-effect recovery is not authorized by this design.

Promotion constructs a new tree copy and commits it to Case state only after all validation and conflict checks succeed. Failure preserves the previous canonical tree.

## Migration and rollback

There is no prior state or schema on `main`, so source migration is not applicable. This design does not claim durable migration or provider rollback. Git rollback is ordinary commit ancestry on the new branch; no existing branch is modified.

## Acceptance

The executable acceptance matrix is `docs/MVP.md#acceptance-matrix`. The complete source gate is `docs/MVP.md#verification`.

## Non-goals

Cloudflare, D1, R2, Durable Objects, public MCP, Termux Agent, remote publication, external-effect exactly-once, and production persistence.
