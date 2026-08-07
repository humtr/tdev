# tdev mvp-1a-1

`tdev` is a **parallel-first, durable-ready Work Graph control core**. The current development identity is `mvp-1a-1`; lineage rules are defined in `LINEAGE.md`. It executes one immutable Task DAG, isolates ordinary work results, and admits exactly one deterministic Promotion that can replace the canonical tree.

```text
immutable PlanRevision
  -> derived dependency readiness
  -> authority + resource-claim admission
  -> fenced Attempt
  -> isolated bounded result
  -> deterministic Promotion
  -> canonical tree
```

`capacity = 1` and `capacity > 1` are the same protocol. There is no serial compatibility scheduler and no second lifecycle owner.

## Verified source slice

The repository currently provides:

- immutable PlanRevision compilation, cycle rejection, reverse-edge indexes, and exactly one full-join Promotion Task;
- per-Case derived readiness and claim-compatible parallel admission;
- a closed result algebra: `changeset`, `observation`, `validation`, `artifact-set`, and `effect-receipt`;
- effect-aware recovery for `result-only`, `idempotent-external`, and `reconcilable-external` work;
- complete result fencing over Case, Plan, Task, Attempt, executor epoch, fencing token, and optional claim-set-bound lease;
- a narrow cross-Case `ClaimLedger` that owns leases only, not Task lifecycle;
- authority as the intersection of Case grant, Workspace policy, and executor capability;
- deterministic Promotion that records every accepted result while allowing only ChangeSets to mutate the candidate tree;
- snapshot schema v2 with semantic restore validation, restored-bound enforcement, complete blocker evidence, event hash chaining, command receipts, and v1-to-v2 migration;
- in-memory, atomic full-snapshot local-file, and append-delta journal compare-and-swap stores;
- a `CaseRepository` transaction boundary and `runDurableCase` checkpoint-before-dispatch protocol;
- strict JSON, safe-integer canonical data, path/topology defenses, explicit size/count limits, and copy-on-write rollback of rejected in-memory mutations;
- incremental validation over frozen committed history, rebuildable Claim/ready indexes, and a checked-in control-plane benchmark without making those caches semantic truth.

This is a correctness-oriented reference core. Cloudflare Durable Objects, Agent transport, Termux execution, Git publication, D1/R2, and MCP endpoints are deliberately **not** claimed as implemented.

## Development lineage

Active naming is intentionally independent of product semantic versions. See `LINEAGE.md`. The next audited development may become `mvp-1a-2`, `mvp-1b-1`, or `mvp-2a-1` depending on whether it continues this implementation, restarts from `mvp-1`, or starts a new architecture generation from accumulated insight.

## Runtime and verification

The supplied container is the executable compatibility target:

- Node.js 22 or newer;
- no third-party runtime dependency;
- Go is not required for this source slice.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
```

`npm run check` performs syntax checks, the full Node test suite, an in-memory demo, and a file-backed durable demo.

Useful individual commands:

```sh
npm test
npm run demo
npm run durable-demo
npm run bench
node --experimental-test-coverage --test test/*.test.mjs
```

`npm run bench` reports container-local scheduler, ClaimLedger, Promotion, and persistence evidence. It explicitly reports context/token and executor cold/warm metrics as unavailable because this kernel has no repository/context/model/process adapter to measure them.

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

console.log(outcome.caseState);             // succeeded
console.log(outcome.snapshot.canonicalTree); // deterministic promoted tree
```

For durable local execution, construct a `MemorySnapshotStore`, `FileSnapshotStore`, or `JournalSnapshotStore`, wrap it in `CaseRepository`, create the Case, and call `runDurableCase`. A running Attempt is persisted successfully before its executor is invoked.

## Repository map

| Path | Responsibility |
| --- | --- |
| `src/plan.mjs` | PlanRevision compilation and immutable graph contract |
| `src/engine.mjs` | sole Case/Task/Attempt/result/event/receipt lifecycle owner |
| `src/runner.mjs` | capacity-bound orchestration plus rebuildable ready-candidate acceleration |
| `src/durable-runner.mjs` | checkpoint-before-dispatch durable orchestration |
| `src/results.mjs` | closed isolated-result algebra |
| `src/promotion.mjs` | deterministic join and canonical-tree candidate construction |
| `src/claim-ledger.mjs` | cross-Case claim lease owner, fencing generation, and rebuildable overlap index |
| `src/store.mjs` | memory, full-snapshot local-file, and append-delta journal CAS adapters |
| `src/repository.mjs` | load, migration persistence, transaction, and command boundary |
| `src/canonical.mjs` | strict JSON, canonical encoding, hashing, safe records |
| `src/policy.mjs` | authority, path policy, tree topology, and resource limits |
| `docs/` | normative contracts, architecture, protocol, operations, security, deployment, and evidence |

## Exact boundaries

The local file stores serialize access only inside one Node process. It is not a distributed lock or a Durable Object transaction. Snapshot self-digests detect accidental corruption and inconsistent rewrites; they do not authenticate a record against an attacker who can rewrite the entire snapshot and recompute all hashes. External effects are never advertised as exactly once: they require either a stable idempotency key or authoritative reconciliation.

Start with [`docs/SPEC.md`](docs/SPEC.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), and [`docs/IMPLEMENTATION_REPORT.md`](docs/IMPLEMENTATION_REPORT.md).
