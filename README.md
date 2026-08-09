# tdev mvp-1a-5

`tdev` is a **parallel-first, durable-ready Work Graph control core**. The active verified development identity is `mvp-1a-5`, descended directly from exact `mvp-1a-4@1ff7c5d321958df725497d4e3a2649e210b029db`. Design 0008 closes its bounded authority-path/durability gate without changing semantic-tree identity, snapshot schema, or journal format. Exact lineage is in `LINEAGE.md`.

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
- memory, atomic full-snapshot local-file, verified single-process journal, and opt-in immutable expected-revision journal compare-and-swap stores;
- a `CaseRepository` transaction boundary and `runDurableCase` durable-before-dispatch protocol, including concrete-store capacity checks, fail-closed pre-dispatch external-effect admission, and durable-predecessor reopen recovery after settlement-checkpoint failure;
- entry-level atomic mutation rollback, incremental Task/dependency accounting, deterministic topological blocker propagation, and rebuildable indexes;
- Claim overlap indexing with release-time path pruning and reference-oracle equivalence tests;
- a Design 0004 journal materialization cache usable only after the exact durable base/delta bytes match a cryptographic fingerprint;
- an opt-in `ImmutableJournalSnapshotStore` with expected-revision no-replace slots, source/target digest binding, tested local-filesystem cross-process winner election after an explicit legacy-writer cutover, and Design 0007 exact-byte-gated disposable materialization reuse that still rereads every retained authoritative byte on each load/CAS;
- strict JSON, safe integers, path/topology defenses, and explicit count/byte limits.

This is a correctness-oriented source core. Cloudflare Durable Objects, Agent transport, Termux execution, Git publication, D1/R2, repository/context/model transport, warm executor processes, and MCP endpoints are deliberately **not** claimed as implemented.

## Development lineage

`mvp-1a-5` is a direct continuation of exact `mvp-1a-4`. Design 0007 still preserves D0005 durable authority/publication and exact-byte-gated disposable materialization reuse. Verified Design 0008 adds only bounded authority-path instrumentation and safety hardening: concrete-store durable admission, legacy committed-namespace fail-closed parity, deterministic immutable-publication fault evidence, and settlement-checkpoint/Claim reopen liveness. Design 0004/0005 correctness barriers remain regression requirements.

The D0008 matrix reproduces total-size-dependent authority work under sparse writes: 24 completed 1k/5k/20k samples preserve Promotion and cold-restore equality, while all eight 100k samples hit declared time/RSS stop gates. This evidence opens a **separate** Class 2 semantic-authority representation decision; D0008 does not select a Merkle/HAMT/transactional root or make Git OIDs semantic authority.

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
npm run bench:authority
npm run bench:persistence -- --source . --label mvp-1a-5 --tasks 32 --payload-bytes 4096 --repeats 3
node --experimental-test-coverage --test test/*.test.mjs
```

`npm run bench` is a single-process component observation. Repeat it externally for p50/range. The checked-in three-state comparison was produced by isolated child samples; the reusable harness is:

```sh
npm run bench:compare -- \
  --state mvp-1=/path/to/tdev-mvp-1 \
  --state mvp-1a-1=/path/to/tdev-mvp-1a-1 \
  --state mvp-1a-2=/path/to/tdev-mvp-1a-2 \
  --state mvp-1a-3=/path/to/tdev-mvp-1a-3 \
  --state mvp-1a-4=. \
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

For durable local execution, construct a `MemorySnapshotStore`, `FileSnapshotStore`, `JournalSnapshotStore`, or opt-in `ImmutableJournalSnapshotStore`, wrap it in `CaseRepository`, create the Case, and call `runDurableCase`. A running Attempt is persisted successfully before its executor is invoked. Every checkpoint uses the concrete store's materialized-capacity assertion when available; external-effect dispatch additionally proves bounded successor fit before the real Attempt/executor boundary. Settlement is persisted before terminal lease release, and a failed settlement checkpoint is recovered from the durable predecessor via `reopen:true` rather than by prematurely releasing the lease.

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

`FileSnapshotStore` and the Design 0004 `JournalSnapshotStore` serialize a Case only among store instances in the **same Node process** and do not claim cross-process CAS. The opt-in Design 0005/0007 `ImmutableJournalSnapshotStore` instead uses one immutable expected-revision publication slot and has tested local-filesystem cross-process single-winner CAS **only after an explicit quiesced cutover from legacy writers**. Every load/CAS still strictly observes the committed namespace and rereads every retained authoritative byte. If the exact ordered filename/length/byte fingerprint matches prior strict validation, the instance may reuse that materialization; otherwise it performs complete D0005 replay. It does not use a durable checkpoint/head, proposal cache, compaction, or history deletion shortcut.

Snapshot self-digests detect accidental corruption and inconsistent rewrites; they do not authenticate against an attacker who can rewrite the complete record and recompute every digest. External effects are not advertised as exactly once: they require stable idempotency or authoritative reconciliation.

Promotion still copies, validates, and hashes the complete in-memory text tree. The current Case snapshot also packages the compiled Plan with its full base tree, complete accepted-result state, the canonical tree, Attempts, Events, and receipts; a successful Promotion accepted result retains the complete final tree as well. Verified D0008 measures this complete authority-packaging path and retains stopped 100k samples rather than extrapolating them. Context bytes/tokens and executor cold/warm behavior remain unavailable because this source slice contains no repository scanner, model transport, or process/toolchain executor lifecycle.

`ImmutableJournalSnapshotStore` remains conditional on compatible local hard-link/fsync behavior. The connected tmcp/Termux filesystem denied hard-link creation and is not qualified for that adapter; the D0008 candidate passed the complete source/coverage gate on Ubuntu/POSIX with hard-link tests enabled.

Start with `docs/SPEC.md`, `docs/ARCHITECTURE.md`, verified Designs 0007 and 0008, `docs/MVP.md`, and `docs/IMPLEMENTATION_REPORT.md`. Designs 0004 and 0005 remain inherited verified correctness foundations. The next semantic-authority representation choice requires its own accepted Class 2 design under `SDD.md`.
