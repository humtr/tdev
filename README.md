# tdev mvp-1a-2

`tdev` is a **parallel-first, durable-ready Work Graph control core**. The active development identity is `mvp-1a-2`; its direct code parent is `mvp-1a-1`, and `mvp-1` plus the audited candidate's successes and failures are knowledge inputs. Exact lineage is in `LINEAGE.md`.

```text
immutable PlanRevision
  -> derived dependency readiness
  -> authority + semantic Claim admission
  -> durable fenced Attempt
  -> isolated bounded result
  -> deterministic Promotion
  -> canonical tree
```

`capacity = 1` and `capacity > 1` are the same execution protocol. There is no serial compatibility scheduler and no second lifecycle owner.

## Verified source slice

The repository provides:

- immutable PlanRevision compilation, cycle rejection, reverse edges, and exactly one full-join Promotion Task;
- one CaseEngine owner for Case, Task, Attempt, Event, receipt, accepted result, and canonical tree state;
- per-Case dependency readiness and claim-compatible parallel admission;
- a closed result algebra: `changeset`, `observation`, `validation`, `artifact-set`, and `effect-receipt`;
- effect-aware recovery for `result-only`, `idempotent-external`, and `reconcilable-external` work;
- complete result fencing over Case, Plan, Task, Attempt, executor epoch, fencing token, and optional claim-set-bound lease;
- a narrow cross-Case `ClaimLedger` that owns semantic leases only, separate from execution capacity/resource budgets;
- authority as the intersection of Case grant, Workspace policy, and executor capability;
- deterministic Promotion that records every accepted result while allowing only ChangeSets to mutate the candidate tree;
- snapshot schema v2 with canonical data, Event hash chaining, semantic restore validation, complete blocker evidence, command receipts, and v1→v2 migration;
- memory, atomic full-snapshot local-file, and append-delta journal compare-and-swap stores;
- a `CaseRepository` transaction boundary and `runDurableCase` durable-before-dispatch protocol;
- entry-level atomic mutation rollback, incremental Task/dependency accounting, deterministic topological blocker propagation, and rebuildable indexes;
- Claim overlap indexing with release-time path pruning and reference-oracle equivalence tests;
- a journal materialization cache usable only after the exact durable base/delta bytes match a cryptographic fingerprint;
- strict JSON, safe integers, path/topology defenses, and explicit count/byte limits.

This is a correctness-oriented source core. Cloudflare Durable Objects, Agent transport, Termux execution, Git publication, D1/R2, repository/context/model transport, warm executor processes, and MCP endpoints are deliberately **not** claimed as implemented.

## Development lineage

`mvp-1a-2` is a direct continuation of the `mvp-1a-1` implementation foundation, not a sibling restart or a new architecture generation. The candidate's root-copy scaling, stale journal cache, Claim trie retention, candidate-loss, and blocker-propagation failures were independently reproduced and corrected. See `LINEAGE.md`, Design 0004, and `docs/IMPLEMENTATION_REPORT.md`.

`legacy/mvp-parallel` is historical research lineage only and is not an active implementation identity.

## Runtime and verification

The executable source target is:

- Node.js 22 or newer;
- no third-party runtime dependency;
- Go is not required for this source slice.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
```

`npm run check` runs syntax checks, the full Node test suite, an in-memory demo, and a file-backed durable demo.

Additional commands:

```sh
npm test
npm run demo
npm run durable-demo
npm run bench
node --experimental-test-coverage --test test/*.test.mjs
```

`npm run bench` is a single-process component observation. Repeat it externally for p50/range. The checked-in three-state comparison was produced by isolated child samples; the reusable harness is:

```sh
npm run bench:compare -- \
  --state mvp-1=/path/to/tdev-mvp-1 \
  --state mvp-1a-1=/path/to/tdev-mvp-1a-1 \
  --state mvp-1a-2=. \
  --samples 3 --warmups 0 --timeout-ms 20000
```

The harness reports Plan compilation/validation, Case construction, wide/deep graph execution, retained post-GC memory observations, canonical digests, and explicit timeouts. It does not fabricate provider, context-token, or process cold-start metrics.

## Minimal use

```js
import { CaseEngine, definePlan, runCase } from './src/index.mjs';

const plan = definePlan({
  revisionId: 'example-v1',
  baseTree: { 'README.md': '# base\n' },
  tasks: [
    {
      id: 'write-doc',
      kind: 'work',
      dependencies: [],
      claims: [{ mode: 'write', resource: 'candidate:docs/**' }],
      input: { path: 'docs/result.txt', content: 'parallel-first\n' },
    },
    {
      id: 'promote',
      kind: 'promotion',
      dependencies: ['write-doc'],
      claims: [{ mode: 'write', resource: 'canonical:tree' }],
      input: {},
    },
  ],
});

const engine = new CaseEngine({ caseId: 'case-1', plan });
const outcome = await runCase(
  engine,
  async ({ baseDigest, task }) => ({
    kind: 'changeset',
    baseDigest,
    writes: [{ path: task.input.path, content: task.input.content }],
    evidence: { producer: task.id },
  }),
  { capacity: 4 },
);

console.log(outcome.caseState);              // succeeded
console.log(outcome.snapshot.canonicalTree); // deterministic promoted tree
```

For durable local execution, construct a `MemorySnapshotStore`, `FileSnapshotStore`, or `JournalSnapshotStore`, wrap it in `CaseRepository`, create the Case, and call `runDurableCase`. A running Attempt is persisted successfully before its executor is invoked, and settlement is persisted before its lease is released.

## Repository map

| Path | Responsibility |
| --- | --- |
| `src/plan.mjs` | immutable PlanRevision compilation and graph contract |
| `src/engine.mjs` | sole Case/Task/Attempt/result/Event/receipt/canonical owner; entry transaction and rebuildable accounting |
| `src/runner.mjs` | capacity-bound orchestration and disposable ready candidates |
| `src/durable-runner.mjs` | checkpoint-before-dispatch durable orchestration |
| `src/results.mjs` | closed isolated-result algebra |
| `src/promotion.mjs` | deterministic join and canonical-tree candidate construction |
| `src/claim-ledger.mjs` | cross-Case lease owner, generations, and rebuildable/prunable overlap index |
| `src/store.mjs` | memory, full-file, and verified append-delta local CAS adapters |
| `src/repository.mjs` | restore/migration persistence, transaction, and command boundary |
| `src/canonical.mjs` | strict JSON, canonical encoding, hashing, safe records |
| `src/policy.mjs` | authority, path policy, topology, and resource limits |
| `bench/` | component and isolated three-state benchmark harnesses |
| `docs/` | normative contracts, design, verification, audit, and evidence |

## Exact boundaries

The local file stores serialize a Case only among store instances in the **same Node process**. They are not distributed locks and do not claim cross-process CAS. Journal load/CAS re-reads and hashes the committed base/delta bytes before reusing materialized state; this closes stale-cache and hidden-corruption failures but leaves O(journal bytes) read/hash cost.

Snapshot self-digests detect accidental corruption and inconsistent rewrites; they do not authenticate against an attacker who can rewrite the complete record and recompute every digest. External effects are not advertised as exactly once: they require stable idempotency or authoritative reconciliation.

Promotion still copies, validates, and hashes the complete in-memory text tree. Context bytes/tokens and executor cold/warm behavior are unavailable because this source slice contains no repository scanner, model transport, or process/toolchain executor lifecycle.

Start with `docs/SPEC.md`, `docs/ARCHITECTURE.md`, Design 0004, `docs/MVP.md`, and `docs/IMPLEMENTATION_REPORT.md`.
