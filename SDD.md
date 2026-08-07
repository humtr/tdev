# tdev specification-driven development

> Authority: this file owns how a repository change is classified, designed, sliced, verified, reopened, and closed. Product and subsystem behavior remain in their named normative owners.

## 1. Principle

A change is complete only when its owner contract, implementation, observable acceptance, failure behavior, migration effect, and remaining unknowns agree. Passing code does not silently redefine a contract, and prose does not claim a layer that was not executed.

## 2. Change classes

### Class 0 — editorial

Wording, links, formatting, or examples change without changing behavior, schema, commands, support, or acceptance.

Required: identify the owner, explain why meaning is unchanged, and run relevant documentation checks.

### Class 1 — bounded implementation

A local defect or internal refactor changes no public/durable contract, ownership, state meaning, security boundary, compatibility, deployment, dependency, or verification requirement.

Required temporary contract:

- one-line end state;
- current owner;
- scope and non-goals;
- acceptance and focused regression tests;
- remaining unknowns.

### Class 2 — designed change

A design record is mandatory before implementation when any of these may change:

- product scope, terminology, support, or non-goal;
- plan, Task, Attempt, result, event, receipt, state, identifier, digest, or public schema;
- owner, dependency direction, concurrency, claim, queue, retry, cancellation, reconciliation, or canonical commit;
- authority, path, secret, identity, fencing, approval, or trust boundary;
- persistence, migration, rollback, deployment, external dependency, or release asset;
- acceptance evidence or verification method;
- a workaround that would survive the current slice.

When uncertain, classify upward.

## 3. Design record

Class 2 work lives in `docs/design/` and must contain:

1. metadata and affected owners;
2. one-line definition;
3. repository facts, measured evidence, external engineering evidence, inference, and unknowns separated;
4. current contract and concrete problem;
5. decision with ownership and state transitions;
6. rejected alternatives and tradeoffs;
7. failure, cancellation, recovery, and cleanup;
8. compatibility, migration, rollback barrier, and deployment impact;
9. acceptance matrix and cheapest falsifiers;
10. non-goals and follow-on gates.

Status vocabulary:

```text
draft -> accepted -> implementing -> verified
                    \-> blocked
verified or accepted -> superseded
```

Only accepted or implementing records authorize Class 2 code.

## 4. Owner impact order

For a designed change:

1. freeze the design record;
2. update normative owner contracts that the design changes;
3. implement the smallest production-shaped vertical slice;
4. test pure invariants first, then state transitions, persistence/reopen, adapter behavior, and full source gate;
5. review the effective diff, generated or derived forms, failure paths, and unsupported layers;
6. mark verified only from observed evidence.

A failed falsifier reopens the design or owner. Do not hide the mismatch in a fallback, flag, cache, or second owner.

## 5. Evidence rules

- Tests use barriers, controlled promises, deterministic identities, and public outcomes. Timeouts are deadlock guards only.
- A source test proves source behavior, not deployment, provider state, current-client behavior, rollback, or external effect count.
- A performance claim must name the measured workload and environment, compare equivalent semantics, and separate operation/byte-count evidence from noisy wall-clock observations. No microbenchmark becomes a production SLO by implication.
- A performance cache/index must be rebuildable from an authoritative owner or be explicitly promoted into a designed durable contract; never let an optimization silently become semantic truth.
- Skipped, unsupported, unavailable, and unexecuted layers remain `unknown`.
- An uncertain external effect remains `unverified` or `reconciling`; it is not rewritten as failed or cancelled.
- Security denials and corruption failures must be tested as no-effect decisions.
- Every durable format has a version, predecessor rule, validation, migration owner, and rollback barrier.

## 6. Completion review

Before closing work, verify:

- one canonical owner per fact;
- no duplicated readiness or lifecycle state;
- no direct canonical mutation outside Promotion;
- retries match the effect class;
- identity and fencing cover stale delivery;
- bounds and malformed/corrupt inputs fail closed;
- migrations are explicit and downgrade assumptions are not hidden;
- commands in the documented source gate run in the declared minimum runtime;
- remaining product/provider unknowns are stated without inflating source completion;
- performance-only state can be dropped/rebuilt without changing a legal result, and benchmark evidence covers the hot path the change claims to improve.
