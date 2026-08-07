# Design 0002: Durable-Ready Parallel Control Core

- Class: 2
- Status: verified on 2026-08-06
- Supersedes: Design 0001 where this record changes the source slice
- Source base: `mvp-parallel-xh-1@837da18001aa664a5b7665cfb443759e316a4212`
- Reference line: `mvp-parallel@b9dea35a04a6e385d0a8ebb5e73e6f86b8027e18`
- Runtime gate: Node.js 22 or newer; no third-party runtime dependency
- Owners affected: SDD, SPEC, ARCHITECTURE, PROTOCOL, OPERATIONS, SECURITY, DEPLOYMENT, MVP, MCP
- Implementation paths: `src/`, `test/`

## One-line definition

Keep xh-1's parallel-first Work Graph and single deterministic Promotion, while adding typed result/effect contracts, full fencing, cross-Case lease ownership, authority intersection, self-validating durable state, receipt-backed commands, and checkpoint-before-dispatch persistence without creating a serial fallback, second scheduler, or second canonical writer.

## 1. Evidence classification

### Repository facts

- xh-1 already owned immutable PlanRevision, DAG readiness, in-Case claims, isolated ChangeSets, capacity degeneration, and deterministic Promotion.
- The reference branch already documented stronger Case/Agent ownership, delivery and effect uncertainty, typed operations, authority intersection, schema discipline, migration/rollback, and provider boundaries.
- The branches diverged from a common line; they were not a safe mechanical merge.

### Measured baseline

- xh-1 baseline passed 23 tests under Node 22.16.0.
- The supplied container exposes Node 22.16.0 and Go 1.23.2.
- The reference branch declared a Node/Go 26 source gate, so its full generated/provider stack could not be adopted as the executable container gate.

### General engineering evidence

- Persistent coordinators must write authoritative state to durable storage rather than rely on in-memory survival.
- Retrying an unknown external effect is safe only when the operation is idempotent under a stable key or is reconciled first.
- Deterministic hashing requires constrained canonical data and duplicate-member-safe ingress.
- A lease needs a monotonic fencing generation; expiry alone cannot stop a stale resumed holder.
- A content-addressed tree model is a natural future optimization for deterministic repository Promotion, while branch/reference movement remains a separate effect.

### Inference

The strongest path is not to merge branch files. It is to retain xh-1's ontology and re-own selected reference-branch safety semantics inside one new source design, leaving provider adapters outside the kernel.

### Unknowns retained

Cloudflare resources, Durable Object class/storage migrations, Agent transport, Termux host effects, public MCP compatibility, D1/R2, Git publication, production auth, and provider rollback are unexecuted and therefore unverified.

## 2. Problems in Design 0001

1. Restored state trusted too many stored/derived fields.
2. Attempt identity lacked executor epoch and claim-generation fencing.
3. Every result was a ChangeSet, forcing evidence and effects into the mutation path.
4. Interrupted work was treated as safely retryable regardless of external effects.
5. Claims coordinated only Tasks in one Case.
6. Claim ownership and authorization were not separated.
7. JSON, path, topology, result, evidence, and snapshot bounds were incomplete.
8. Commands had no request receipt or optimistic revision contract.
9. Persistence and v1 migration were not executable in the container.
10. Executor invocation had no durable checkpoint-before-dispatch boundary.
11. Rejected multi-step in-memory mutations could theoretically leave partial state.
12. The public module boundary and durable demo were incomplete.

## 3. Decision

### 3.1 Preserve the ontology

- One Case owns one immutable PlanRevision and finite DAG.
- Readiness remains derived from Task states.
- Capacity one and N use the same runner semantics.
- CaseEngine is the sole owner of graph/lifecycle/result/event/receipt/canonical state.
- Exactly one final Promotion depends on every work Task.
- Ordinary Tasks never write canonical state.

### 3.2 Compile an immutable execution contract

Each work Task declares or defaults:

- `operation`: default `tdev.work.changeset`;
- `resultKind`: one of five closed work variants, default `changeset`;
- `effectClass`: `result-only`, `idempotent-external`, or `reconcilable-external`, default `result-only`;
- `retry.maxAttempts`: default **3**, range 1 through the Case contract's `maxAttemptsPerTask` ceiling (default 100);
- `requirePassed`: validation-only gate;
- required capabilities.

External-effect Tasks return only `effect-receipt` in this source slice. Promotion has a fixed internal one-Attempt contract.

### 3.3 Use a closed result algebra

Accepted work results are:

- ChangeSet;
- Observation;
- Validation;
- ArtifactSet;
- EffectReceipt.

All are immutable, canonical, bounded, and digested. Promotion records every result identity and applies only ChangeSets.

### 3.4 Separate recovery by effect class

- Result-only interruption may become a new Attempt within budget.
- Idempotent external retry reuses the same Task effect key.
- Reconcilable external ambiguity remains reconciling until explicit authoritative outcome.
- `unverified` is a terminal uncertainty state, not an alias for failure.
- Cancellation of an external effect is intent until reconciliation.

### 3.5 Fence complete delivery identity

Each Attempt binds Case, Plan, Task, Attempt, executor ID/epoch, attempt fence, optional claim lease token/generation/normalized claim-set digest, and stable Task effect key. Result acceptance verifies the full tuple and requires the current claim owner for the first state-changing commit; an exact already-accepted replay remains deduplicable after release.

### 3.6 Add a narrow ClaimLedger

The ClaimLedger owns only active cross-Case leases, normalized claim scope/digest, monotonic generation, fencing token, holder identity, release, snapshot, and revision notification. It does not own readiness, retry, cancellation, results, or Case outcome.

### 3.7 Separate authority from exclusion

Admission requires Task capabilities to be present in Case grant, Workspace policy, and executor capability. Claims control concurrency only.

### 3.8 Make snapshots self-validating

Schema v2 stores exact normalized and derived state plus a whole-snapshot digest and event hash chain. Restore recompiles Plan/contract, validates exact shapes and lifecycle invariants, re-normalizes accepted results, verifies receipts, and recomputes successful Promotion.

Self-hashes provide corruption/inconsistency detection, not authenticity against a fully rewriting adversary.

### 3.9 Add command receipts and atomic mutation rollback

Commands use `requestId`, canonical command digest, optional expected Case revision, stored response, response digest, and committed revision. Exact replay is idempotent; contradictory replay and stale revision have no effect.

Every direct state mutation snapshots authoritative mutable fields and restores them on any error, including failures after one or more Events were emitted.

### 3.10 Add portable persistence boundaries

- MemorySnapshotStore proves CAS behavior.
- FileSnapshotStore proves strict canonical reads and atomic local replacement in one process.
- CaseRepository owns semantic restore, v1 migration persistence, and single-shot CAS transactions.
- `runDurableCase` persists a running Attempt before executor invocation and persists settlement before claim release.

Repository transactions are not automatically replayed after CAS conflict.

### 3.11 Harden inputs and resource bounds

Strict JSON, canonical safe-integer data, null-prototype dictionaries, exact public shapes, path normalization/reserved-prefix policy, tree topology, and explicit counts/byte bounds apply across Plan, results, evidence, Events, receipts, Attempts, snapshots, and files.

### 3.12 Keep optimization behind unchanged semantics

Reverse dependencies and stable Task order are compiled. Future dependency counters, claim indexes, content-addressed results, and Merkle/Git tree construction may replace scans/copies only when derived from the same authoritative state and without a new scheduler owner.

## 4. Rejected alternatives

- merge the reference branch wholesale;
- retain a serial scheduler beside a parallel scheduler;
- treat device capacity 1 as lifecycle ontology;
- let ordinary work mutate a canonical worktree;
- store canonical `ready` state;
- let AgentDO/MCP/ClaimLedger own Task lifecycle;
- treat disconnect as proof an effect was not applied;
- use lease timeout without fencing generation;
- put cross-Case lease truth in every Case snapshot;
- claim distributed durability from a process-local JSON store;
- require an unavailable Node/Go 26 gate for this kernel;
- auto-retry repository callbacks after CAS conflict.

## 5. Failure, cancellation, and cleanup

- Malformed input/result fails closed.
- Result validation occurs before accepted state.
- A claimed reconciled success is validated before reconciliation evidence is committed.
- Stale identity or lease has no effect.
- Promotion validates a full candidate before canonical replacement.
- A store CAS conflict preserves the winner and prevents automatic replay.
- Claim release is idempotent and identity checked.
- External cancellation remains intent while effect truth is unknown.
- Event/receipt/bound failure rolls back the entire in-memory mutation.

## 6. Compatibility, migration, and rollback

- Exact Design 0001 snapshots migrate deterministically to schema v2.
- `CaseRepository.load` CAS-persists the migrated snapshot whenever migration advances revision, even when ordinary reopen is disabled.
- Direct restore has no persistence side effect.
- Unknown future versions fail closed.
- There is no automatic downgrade; persisted v2 is a rollback barrier for v1 code.
- Code rollback and stored-data rollback remain separate procedures.
- ClaimLedger persistence is independently versioned and not atomically coupled to Case storage in this source slice.

## 7. Verification

Observed release gate:

- syntax check passed under Node 22.16.0;
- 88/88 tests passed;
- memory and file-durable demos passed;
- 64-wide graph produced identical Promotion output at capacity 1 and 16, with concurrency 16 observed;
- v1 fixture migrated and was CAS-persisted as v2;
- stale identity/epoch/fence/lease tests had no state effect;
- checkpoint CAS conflict produced zero executor calls;
- partial-Event failure rolled back the whole mutation.

The detailed matrix is `docs/MVP.md`; implementation deltas and final coverage are in `docs/IMPLEMENTATION_REPORT.md`.

## 8. Non-goals and follow-on gates

Still outside this verified design:

- live Cloudflare/DO/D1/R2 deployment;
- persistent Agent delivery and WebSocket lifecycle;
- Termux filesystem/Git/process/network executor;
- public MCP schemas/client qualification;
- real Git object/ref publication;
- tenant authentication, secrets, encryption, and Agent trust;
- atomically durable cross-Case claim ownership;
- exactly-once external effects;
- large-graph/repository performance qualification.

Each requires a new accepted Class 2 record before implementation.
