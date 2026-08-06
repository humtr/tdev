# architecture

## Ownership

The MVP has one domain owner, `CaseEngine`, for Case state, Task state, Attempt state, accepted isolated results, event sequence, and canonical tree. `runCase` is an orchestration loop and does not own readiness or lifecycle truth.

```text
PlanRevision (immutable)
    |
    v
CaseEngine ---- derived readiness / claim compatibility
    |                         |
    | start Attempt           | executor capacity
    v                         v
isolated executor result --> result acceptance
    |
    v
Promotion Task --> deterministic join --> canonical tree
```

## Components

- `src/canonical.mjs`: canonical JSON and typed digest primitive.
- `src/claims.mjs`: resource overlap and compatibility.
- `src/promotion.mjs`: ChangeSet validation, conflict detection, deterministic tree construction.
- `src/engine.mjs`: authoritative state and transitions.
- `src/runner.mjs`: capacity-bound asynchronous execution loop.
- `src/cli.mjs`: observable demo adapter.

## Dependency direction

Canonicalization, claims, and Promotion are pure. The engine depends on those pure modules. The runner depends on the engine and an injected executor. Domain code does not depend on Cloudflare, GitHub, Termux, filesystem, process execution, or network APIs.

## Parallel semantics

Readiness is derived from dependency states. Admission additionally checks currently running claims. Executor capacity limits the number of running Attempts but does not change graph meaning. Claims are released by terminal Attempt transition.

The runner may observe completions in any order and may admit newly ready work immediately. Promotion sorts Task results and writes by stable keys, so canonical output is independent of those schedules.

## Persistence boundary

The MVP snapshot is serializable and can be reopened, but no durable store is claimed. A future CaseDO/D1/R2 design must preserve the same canonical transitions and define transaction, migration, recovery, and rollback owners before implementation.
