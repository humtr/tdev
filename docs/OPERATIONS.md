# execution and recovery operations

> Normative owner for runner behavior, executor obligations, effect handling, cancellation, checkpoints, and operator procedures.

## 1. Operating modes

The repository exposes two drivers over the same `CaseEngine` protocol:

- `runCase(engine, executor, options)`: in-memory orchestration, optionally with an injected checkpoint callback;
- `runDurableCase(repository, caseId, executor, options)`: repository-backed orchestration with mandatory compare-and-swap checkpoints.

Neither driver owns Task lifecycle. `runCase` may cache rebuildable ready candidates from Plan reverse edges, but every start still uses `CaseEngine` state and `admissionDecision`; only authoritative engine transitions can change lifecycle truth.

## 2. Runner options

| Option | Meaning |
| --- | --- |
| `capacity` | positive safe integer; default `1` |
| `claimLedger` | optional cross-Case lease owner |
| `waitForClaims` | wait for ledger revision when blocked; default `true` |
| `globalClaimPredicate` | selects claims requiring the global owner |
| `executorCapabilities` | default observed capabilities |
| `executorIdentity` | fixed identity or factory returning ID/epoch/capabilities |
| `signal` | aborts a ClaimLedger wait; see limitation below |
| `checkpoint` | `runCase`-only callback invoked after state revisions |

The default global-claim predicate excludes `candidate:` and `canonical:` namespaces and treats other namespaces as target-global.

## 3. Executor contract

An executor must:

1. treat `task.input`, dependency results, effect key, and fencing values as immutable;
2. return exactly the declared result kind;
3. avoid direct canonical-tree mutation;
4. use the provided stable effect key for an idempotent external operation;
5. retain sufficient provider evidence to reconcile ambiguous effects;
6. stop or compensate only according to its operation contract when its per-Attempt AbortSignal fires;
7. never assume that a lost response means the effect did not occur.

The executor receives dependency outputs as accepted immutable results. It does not receive mutable CaseEngine access.


## 3.1 Control-plane acceleration boundary

The runner and engine may use rebuildable in-memory acceleration only when the authoritative decision remains reproducible from the Plan, Task/Attempt state, and active lease records. A validation frontier may reuse already validated frozen history; a CaseEngine claim-holder set and ClaimLedger overlap index may narrow conflict candidates; the runner may maintain a ready-candidate set refreshed from reverse edges. None is durable truth or sufficient to authorize a transition. Full validation remains mandatory for untrusted restore/migration. Resource capacity and future CPU/memory/API budgets remain scheduling policy and are not Claims.

## 4. Admission and dispatch

For each ready-candidate Task, the runner:

1. resolves an executor identity and capabilities;
2. obtains the engine's authority/in-Case-claim admission decision;
3. deterministically denies missing authority;
4. acquires any selected cross-Case claims for the exact next Attempt ID;
5. starts the Attempt with complete fencing and live lease validation;
6. persists the Attempt first when a checkpoint is configured;
7. invokes the executor only after that checkpoint succeeds.

A checkpoint failure releases an acquired lease and propagates the error. A CAS conflict before dispatch therefore produces zero executor invocations.

## 5. Settlement ordering

Executor completion is observed in arbitrary order. Settlement is:

```text
validate full identity and current claim lease
  -> normalize and validate result, or classify executor failure
  -> mutate authoritative Attempt/Task/Case state atomically
  -> durable checkpoint when configured
  -> release terminal claim lease
  -> derive newly blocked/ready/terminal state
```

This ordering prevents a stale lease holder from committing and prevents claim reuse before the terminal Case state is durable in the local durable runner.

## 6. Effect recovery matrix

| Event | result-only | idempotent-external | reconcilable-external |
| --- | --- | --- | --- |
| executor throws known not-applied error | retry within budget when marked retryable | retry with same effect key within budget | policy may still require reconciliation if adapter cannot prove absence |
| response lost / process reopens nonterminal Attempt | mark interrupted; retry within budget | retry with the same effect key only while budget remains; otherwise enter/stay reconciling | enter/stay reconciling; no retry |
| invalid executor result after possible effect | ordinary result rejection/failure | preserve unknown outcome and require reconciliation | preserve unknown outcome and require reconciliation |
| cancellation while running | terminal cancellation; late result rejected | cancellation becomes intent until effect classified | cancellation becomes intent until effect classified |
| reconciliation proves success | not normally needed | accept matching effect receipt | accept matching effect receipt |
| reconciliation proves not applied | pending/cancelled/failed by intent and budget | pending/cancelled/failed by intent and budget | pending/cancelled/failed by intent and budget |
| reconciliation cannot decide | unverified when externally applicable | unverified | unverified |

There is no exactly-once claim. The safe property is **at-most-one accepted result per Task plus effect-class-specific handling of uncertain execution**.

## 7. Reopen behavior

`CaseEngine.restore(snapshot, { reopen: true })` validates the entire snapshot before reopening nonterminal work.

- result-only nonterminal Attempts become historical `interrupted` evidence and the Task may return to `pending` within budget;
- idempotent external work may become retryable with the unchanged Task effect key only while its Attempt budget remains; otherwise it stays `reconciling`;
- reconcilable external work remains `reconciling` or `cancel_requested` until an explicit decision;
- terminal Cases are not reopened.

`CaseRepository.load(caseId, { reopen: true })` additionally persists any migration/reopen revision through CAS.

## 8. Cancellation

Cancellation is a semantic command, not a JavaScript promise cancellation shortcut.

- A pending or running result-only Task can become terminally cancelled; a later executor result is stale.
- For external-effect Tasks, cancellation records `cancel_requested` and Case/Task reconciliation state because the effect may already have happened.
- Descendants become `blocked` through normal dependency reconciliation.

The runner's `options.signal` currently applies to waiting for a cross-Case claim revision. It is **not** a general external cancellation API for a running executor. Each executor receives a separate per-Attempt signal, but this reference driver only aborts it after observing that the Attempt is already terminal. A production transport must wire command-driven cancellation to active delivery explicitly.

## 9. Waiting for claims

When all ready work is blocked by global leases and no Attempts are running:

- with `waitForClaims: true`, the runner waits for the observed ClaimLedger revision to change;
- with `waitForClaims: false`, it returns `status: waiting_for_claims` with the conflict evidence and current snapshot;
- an AbortSignal can cancel only the wait;
- a ledger without `waitForChange` cannot support waiting mode.

Time is not used to infer lease validity. A production owner may add expiry for liveness, but fencing generation remains the safety mechanism.

## 10. Durable local operation

### Create and execute

```js
import {
  CaseRepository,
  FileSnapshotStore,
  runDurableCase,
} from './src/index.mjs';

const repository = new CaseRepository(new FileSnapshotStore('./state'));
await repository.create({ caseId, plan, caseContract });
const result = await runDurableCase(repository, caseId, executor, { capacity: 4 });
```

The final `result.persistedRevision` must equal `result.snapshot.caseRevision`.

### Command mutation

Use `repository.command(caseId, envelope, { claimValidator })` for receipt-backed state commands. Any command that starts an Attempt with a lease, accepts its result, or resolves a successful reconciliation must have access to the live claim owner.

### Single-shot transactions

`repository.transact` invokes the callback once. On CAS conflict, it fails and does not automatically replay the callback. The callback return value is canonicalized before snapshot CAS, so an unserializable public response cannot commit hidden state. Callers may manually reload and retry only when they can prove the callback had no external effect.

## 11. File-store operation

`FileSnapshotStore`:

- uses `<caseId>.json` in a configured directory;
- accepts only canonical strict JSON on read;
- checks file size before loading bytes and caps snapshot bytes;
- writes mode `0600` temporary files;
- syncs file data, atomically renames in the same directory, then syncs the directory;
- serializes one Case only within the current Node process.

It does not provide cross-process exclusion. Do not run multiple independent processes against the same directory as though it were a distributed CAS database.

## 11.1 Journal-store operation

`JournalSnapshotStore` is the lower-write-amplification local option and implements the same `create/load/compareAndSwap` interface. It stores one full `base.json` plus revision-addressed canonical delta files. A successful delta CAS is fsynced and renamed before returning. Compaction first makes the replacement base durable, then removes covered deltas.

The in-memory materialized snapshot and delta count exist only to avoid replaying/relisting the journal on every same-process CAS. An explicit `load` and any process restart reconstruct from durable files and verify every applicable delta. Do not share one journal directory between independent processes as a distributed CAS store.

## 12. Claim owner operation

A local `ClaimLedger` can be snapshotted and restored, but `runDurableCase` does not atomically persist that ledger with the Case snapshot. This is adequate for deterministic source testing, not for process-loss-safe cross-Case exclusion.

A production target owner must:

- durably own lease generation and active leases;
- bind normalized claim scope/digest into every lease and validate lease currency at Attempt start and first state-changing result commit;
- fence stale generations after reconnect/restart;
- define release/reconciliation behavior after holder loss;
- avoid owning Task lifecycle or readiness.

## 13. Observability

Semantic snapshots and Events provide deterministic evidence. Operational adapters should add separate, non-semantic observations such as wall-clock time, latency, queue depth, host identity, and provider request IDs. Those observations must not alter Plan/result/Promotion digests.

Recommended operator signals:

- Case and Task state counts;
- oldest reconciling Attempt;
- claim conflicts, generations, active lease count, and indexed-query latency;
- scheduler candidate/admission counts and idle-capacity episodes;
- checkpoint CAS conflicts;
- duplicate/stale result rejection counts;
- migration count and source schema version;
- Promotion conflict/topology failure details;
- store corruption and noncanonical-read failures;
- full-snapshot vs delta bytes written, delta count, compaction count, and replay latency;
- Promotion base-tree size, touched-path count, and validation time.

## 14. Failure handling

| Failure | Required response |
| --- | --- |
| malformed input/result | fail closed without partial state |
| executor throws | normalize by effect class and certainty |
| stale identity or lease | reject with no state change |
| invalid claimed reconciliation success | preserve prior uncertainty |
| Promotion conflict | fail Promotion; preserve old canonical tree |
| store corruption | refuse restore; do not rewrite automatically |
| CAS conflict | preserve winner; do not replay external work |
| future snapshot version | fail closed |
| event/receipt/bounds exhaustion | reject entire mutation atomically |

## 15. Provider adapter gate

Before a Cloudflare/Agent/Git adapter is accepted, it must prove:

- authoritative state is persisted in the provider owner's transaction before dispatch;
- delivery epoch and result fences survive reconnects;
- uncertain effects enter reconciliation rather than blind retry;
- target claims survive owner restart or are safely fenced;
- publication uses one fenced lane after Promotion;
- response loss after commit returns the same receipt/result identity;
- migration and code rollback barriers are explicitly tested.
