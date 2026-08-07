# deployment, persistence, migration, and rollback

> Normative owner for runtime support, storage guarantees, schema movement, rollback barriers, and provider deployment gates.

## 1. Declared source runtime

The verified source target is:

- Node.js `>=22`;
- ECMAScript modules;
- no third-party runtime dependency;
- POSIX-like local filesystem only for `FileSnapshotStore` / `JournalSnapshotStore` tests, benchmarks, and demos.

The supplied container reports Node 22.16.0 and Go 1.23.2. The reference branch's Node/Go 26 gate is outside this environment, so mvp-1a-1's executable source contract was intentionally kept on Node 22 and made independent of the reference branch's generated Go/provider stack.

## 2. Installation and gate

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
```

The lockfile contains no external package dependency. `npm run check` is the source verification gate:

1. syntax-check every source, test, and benchmark module;
2. run the complete Node test suite;
3. run the in-memory demo;
4. run the local file-backed durable demo.

A provider deployment requires a different accepted design and additional gates.

## 3. Storage adapters

### MemorySnapshotStore

Use for deterministic tests and embedding in one process. It provides:

- create-if-absent;
- load by Case ID;
- revision compare-and-swap;
- rejection of revision regression;
- defensive canonical copies.

It survives neither process exit nor host failure.

### FileSnapshotStore

Use for single-process local persistence and crash-boundary exercises. It provides:

- strict canonical JSON reads;
- configurable maximum bytes;
- create-if-absent and revision CAS;
- same-directory temporary write;
- temporary file mode `0600`;
- file `fsync`, atomic rename, and directory `fsync`;
- in-process per-Case serialization.

It does not provide cross-process mutual exclusion or distributed consistency. Atomic rename protects replacement on a compatible local filesystem, but no claim is made for every network filesystem or platform.

### JournalSnapshotStore

Use when local single-process operation needs lower write amplification while retaining the same snapshot/CAS semantics. It provides:

- one complete canonical base snapshot;
- canonical checksummed delta records for strictly advancing Case revisions;
- same-directory temporary write, file `fsync`, atomic rename, and directory `fsync` before a delta CAS returns;
- deterministic replay that verifies revision continuity and the resulting v2 snapshot digest;
- the same `maxBytes` bound on the materialized candidate before a delta CAS and after restart replay, so an accepted commit cannot become unreadable solely because replay crosses the configured snapshot bound;
- optional deterministic compaction that durably replaces the base before deleting covered deltas;
- in-process per-Case serialization.

The journal materialization and delta-count caches are not authoritative. Normal same-process CAS uses them to avoid replay/readdir amplification; an explicit `load` or process restart re-reads the base and journal from disk and validates replay. Missing, malformed, noncanonical, discontinuous, or digest-invalid committed records fail closed. Like `FileSnapshotStore`, this adapter does not provide cross-process locking or distributed consistency. Its layout is separate from the single-file `FileSnapshotStore` format.

### CaseRepository

The repository is the semantic persistence boundary:

- creates a validated Case snapshot;
- loads and fully restores domain state;
- persists v1 migration or reopen changes through CAS;
- invokes transaction callbacks once;
- writes only when Case revision advanced;
- exposes receipt-backed commands with optional live claim validation.

A raw store validates only Case ID/revision identity and storage syntax. `CaseEngine.restore` owns semantic integrity.

## 4. Durable runner checkpoint protocol

`runDurableCase` loads with reopen enabled and tracks the persisted revision. Every checkpoint must strictly advance the revision and succeed through store CAS.

Required ordering:

```text
Case snapshot R
  -> start Attempt in memory (R+n)
  -> CAS persist R+n
  -> dispatch executor
  -> settle result/failure (R+m)
  -> CAS persist R+m
  -> release claim
```

The function rejects a final snapshot whose revision was not persisted. A checkpoint CAS conflict is terminal for that invocation and does not dispatch or replay work.

## 5. Snapshot schema

Current Case snapshot schema: `2`.

Schema v2 stores:

- normalized Case contract and digest;
- compiled Plan and digest;
- full Task/Attempt state;
- normalized accepted results and digests;
- semantic Events with hash chain;
- mutation receipts;
- canonical tree and digest;
- whole-snapshot digest.

Unknown future schema versions fail closed.

The `ClaimLedger` has its own independently versioned snapshot schema. It is not embedded in the Case snapshot because it is a separate fact owner.

## 6. v1 to v2 migration

The source migration accepts the exact Design 0001 snapshot shape only. Migration:

1. validates the legacy Plan, state collections, Attempts, Events, and canonical tree;
2. recompiles the v2 Plan and Case contract;
3. reconstructs complete Attempt fencing and stable effect keys;
4. re-normalizes successful work results;
5. recomputes successful Promotion rather than trusting the stored candidate;
6. emits `snapshot_migrated`;
7. produces a valid v2 snapshot and advanced Case revision.

`CaseRepository.load` persists the migrated v2 form via CAS even when ordinary nonterminal reopen is disabled. Direct `CaseEngine.restore` returns the migrated engine but has no store to update.

## 7. Rollback barrier

Code rollback and data rollback are separate operations.

Once a Case snapshot is persisted as v2:

- v1 code is not expected to read it;
- no automatic v2-to-v1 downgrade exists;
- deploying older code without a data plan is unsafe;
- a rollback must either retain v2-compatible code or restore a pre-migration store backup under an explicit operational decision.

The local adapters do not implement backup/restore orchestration. Journal compaction is storage maintenance, not a schema downgrade or backup. Provider point-in-time recovery, namespace migration, and class rename/delete procedures require provider-specific evidence.

## 8. Cloudflare target architecture

A production Cloudflare design should map owners as follows:

| Contract | Candidate provider owner |
| --- | --- |
| Case graph/lifecycle/results/receipts | Case Durable Object with attached transactional storage |
| Agent connection epoch/delivery/capacity | Agent Durable Object |
| cross-Case target leases | dedicated target owner selected by target identity |
| immutable Artifact bytes | R2 |
| query/locator projection | D1 |
| public ingress/projection | Worker/MCP layer |
| local OS/Git/process effects | authenticated Agent |

This mapping follows the actor-style requirement that one authoritative owner serialize mutations for a fact. It has not been deployed or load-tested in this repository.

## 9. Provider adapter requirements

A Case Durable Object adapter must:

- restore from durable storage rather than assume in-memory survival;
- perform one command/state transition and durable write in the owning transaction;
- return/replay the same mutation receipt after response loss;
- prevent dispatch until the running Attempt commit is durable;
- mark ambiguous delivery/effects for reconciliation;
- preserve full snapshot and command validation;
- version schema migrations and test a rollback barrier.

An Agent delivery adapter must:

- own connection epoch and queue/delivery receipts, not Task state;
- include complete fencing in every dispatch/result;
- distinguish delivery acknowledgement from external-effect truth;
- reconcile after disconnect rather than infer non-application;
- bound queues, payloads, and reconnect behavior.

A target-claim adapter must:

- route all conflicting target identities to one canonical lease owner;
- persist generation and active lease atomically;
- validate lease currency at result commit;
- define liveness/expiry without weakening fencing;
- avoid storing duplicate Case lifecycle state.

## 10. Publication lane

Promotion currently produces an in-memory canonical text tree. A Git adapter should preserve the same separation:

```text
accepted isolated results
  -> deterministic Promotion tree/OID candidate
  -> validations
  -> one fenced publication operation
  -> commit/reference receipt
```

Ordinary Tasks must not update the Git index, worktree, branch, or remote ref. Git object/tree construction can become content-addressed and incremental, but reference mutation remains a separate external effect with exact preconditions, idempotency/reconciliation, and rollback evidence.

## 11. Environment and configuration

No environment variable is required by the source core. Provider adapters should keep mutable deployment configuration outside Plan/result digests unless it is intentionally part of the immutable Case contract.

Secrets must not be stored in Task input, evidence, receipts, or snapshots without a separate encrypted-secret design.

## 12. Deployment evidence levels

| Level | Meaning |
| --- | --- |
| source-verified | Node source tests and demos passed locally |
| adapter-verified | provider adapter unit/contract tests passed |
| integration-verified | real provider resources exercised, including restart/response loss |
| deployment-verified | migrations, routes, bindings, observability, and rollback tested in target environment |
| production-qualified | measured SLO, load, security, and incident procedures accepted |

This repository is at **source-verified** only.

## 13. Release checklist

Before cutting a source artifact:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
node --experimental-test-coverage --test test/*.test.mjs
npm run bench
```

If Git metadata is present, also run `git diff --check` and inspect `git status --short`. The supplied source archive has no `.git` metadata, so those checks are not an executable gate here. Confirm documentation still states all provider layers as unverified and that no generated/cache/runtime directory is included in the development archive. Benchmark timing is evidence only and has no fragile pass/fail threshold.
