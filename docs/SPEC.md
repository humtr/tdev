# tdev product specification

## Definition

`tdev` executes an immutable Task DAG with parallel-first semantics, isolates ordinary Task results, and produces one deterministic canonical tree through Promotion.

## Current product slice

The current MVP is a local, in-memory reference implementation of the work loop. It is intended to make concurrency semantics executable before durable or provider-specific adapters are introduced.

## Required behavior

- A Case owns one immutable PlanRevision.
- A PlanRevision owns a finite acyclic Task graph and exact base tree digest.
- A Task declares dependencies and resource claims before execution.
- Dependency-ready and claim-compatible siblings may have concurrent Attempts.
- A Task has at most one nonterminal Attempt.
- Ordinary Task success accepts an isolated ChangeSet bound to the exact plan base.
- Promotion deterministically joins accepted ChangeSets and is the only canonical tree mutation.
- Capacity one and capacity N use the same states, transitions, results, and Promotion.
- Completion order, executor identity, and wall-clock timing do not affect canonical digest.
- Conflicts fail Promotion without changing the previous canonical tree.
- Duplicate identical results are idempotent; stale or contradictory results are rejected.
- Invalid executor results fail their running Attempt and Task without escaping the orchestration loop.
- A terminal cancellation decision is not overwritten by a late executor success or failure.
- Reopening an interrupted in-memory snapshot makes result-only Tasks eligible for a new Attempt and preserves the interrupted Attempt as evidence.

## Non-goals of this slice

- Cloudflare Worker, Durable Objects, D1, R2, or provider mutation
- remote Git commit or publication from a Task
- public MCP endpoint or current-client qualification
- Termux Agent transport or operating-system effects
- durable migration or schema rollback claims
- external-effect exactly-once claims
- distributed transactions
- a general shell operation

## Acceptance

Acceptance is the executable matrix in `docs/MVP.md`. Source completion must not be expanded into deployment or durable-runtime completion.
