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

The runner and engine may use rebuildable in-memory acceleration only when the authoritative decision remains reproducible from the Plan, Task/Attempt state, and active lease records. The permitted derived set includes the validated Event frontier, Task-state counters, unsatisfied-dependency counters, engine ready/claim-holder sets, deterministic Plan-derived topological order, ClaimLedger overlap trie, runner ready candidates, and journal fingerprint/materialization metadata. None is durable truth or sufficient to authorize a transition. A terminal/reconciling Case-state candidate is confirmed from authoritative Task records, and a top-level reconcile/restore rebuilds acceleration state. Full validation remains mandatory for untrusted restore/migration. Resource capacity and future CPU/memory/API budgets remain scheduling policy and are not Claims.

## 4. Admission and dispatch

For each ready-candidate Task, the runner:

1. resolves an executor identity and capabilities;
2. obtains the engine's authority/in-Case-claim admission decision;
3. deterministically denies missing authority;
4. acquires any selected cross-Case claims for the exact next Attempt ID;
5. for external-effect work under a durable runner, proves concrete-store capacity for the proposed running Attempt and contract-bounded post-effect successors before mutating the real Case;
6. starts the Attempt with complete fencing and live lease validation;
7. checks the exact checkpoint snapshot against concrete-store capacity when supported and persists the Attempt;
8. invokes the executor only after that checkpoint succeeds.

A pre-dispatch capacity/checkpoint failure releases a newly acquired lease and propagates the error. Unknown external-effect capacity fails `store_capacity_unknown`; a known insufficient bound fails `store_snapshot_too_large`. A CAS conflict before dispatch likewise produces zero executor invocations. Result-only work has no future-effect reserve; an oversized settlement leaves its already durable running predecessor authoritative.

## 5. Settlement ordering

Executor completion is observed in arbitrary order. Settlement is:

```text
validate full identity and current claim lease
  -> normalize and validate result, or classify executor failure
  -> mutate authoritative Attempt/Task/Case state atomically
  -> durable checkpoint when configured
  -> release terminal claim lease
  -> deterministically propagate blockers and refresh derived readiness/Case accounting
```

This ordering prevents a stale lease holder from committing and prevents claim reuse before the terminal Case state is durable in the local durable runner.

The pre-dispatch path has explicit failure cleanup: if capacity admission or the Attempt-start checkpoint fails, a newly acquired lease is released and the executor is not invoked. The settlement path deliberately differs. If in-memory settlement is computed but its checkpoint throws, the invocation does **not** release the lease because the durable Case still owns the predecessor. A later owner loads through `CaseRepository.load(caseId, { reopen: true })`; any reopen/reconciliation revision is CAS-persisted before the engine is returned. If that durable reopen makes the Attempt terminal, its lease may then be released and eligible work retried under the existing effect-class/budget rules. If reopen yields `reconciling`, the lease remains current until explicit fenced reconciliation reaches a terminal Attempt and that successor is durably checkpointed. No unconditional `finally` release is legal.

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

### Semantic-v3 local operation

For the opt-in D0010 profile, open a local SQLite authority with `await openSemanticSqliteStore(path)`, wrap it in `SemanticCaseRepository`, and pass that repository to the same `runDurableCase` checkpoint driver. Native v3 creation selects the versioned semantic radix profile; legacy `CaseRepository` and all v2 stores remain separate supported paths.

A v3 checkpoint persists new immutable semantic objects, one compact schema-v3 snapshot, and the exact successor Case head in one transaction. CAS mismatch preserves the winner. If the store returns `store_commit_ambiguous`, do not rerun the repository callback or executor. Reopen the database and reconcile the current head against the intended predecessor/successor; any third state requires operator investigation.

Use `migrateV2CaseToSemantic` only after externally quiescing legacy writers and Claim ownership. The source must still be a valid pre-Promotion v2 Case and is rechecked immediately before target publication. `semanticMigrationRollbackStatus` allows only no-head or unadvanced generation-1 migration rollback; a later v3 head forbids automatic downgrade.

### Local Git projection and fenced publication

For D0011, construct `GitProjectionAdapter` with an existing trusted local Git repository path and a direct full `refs/heads/...` publication ref. Call `project({ semanticTree, expectedRefOid, commitMetadata })` after semantic Promotion. Projection may create immutable Git blobs/trees/commit objects but does not mutate the publication ref, index, or worktree. The candidate keeps the D0010 semantic root as its source binding while Git OIDs remain derived representation identities.

Call `publish(candidate)` for the only forward local-ref mutation. The adapter validates the candidate against the repository, rebuilds the semantic root from the Git tree, validates the raw commit binding, and executes one exact expected-predecessor `update-ref` CAS. Pre-update failure remains not applied; post-update response loss is reconciled by durable ref reread. A third OID is a conflict. Do not blind-retry a failed publish or rebuild a second candidate merely to resolve an unknown outcome.

`reconcilePublication(candidate)` is read-only and classifies predecessor/absence, candidate, or third-state conflict after restart. `rollback(receiptOrCandidate)` performs a separate exact CAS back to the predecessor or deletes only the exact candidate ref created from absence; an intervening publication fences stale rollback. Git object deletion and provider policy are not part of this local operation.

### Authenticated remote Git publication

For D0012, construct `GitRemotePublicationAdapter` from the existing D0011 adapter and a bounded Git remote name. First call `preparePublication(candidate)`: the candidate must already be locally elected, must have a non-null predecessor, and the existing remote branch must still name that exact predecessor. The returned immutable intent binds the candidate and a digest of the single effective push target; do not reconstruct this intent from mutable remote config after a failure.

Call `publish(intent, candidate)` for the only forward remote mutation. It revalidates the local candidate and current local election, requires the same remote identity/predecessor, and performs one explicit expected-predecessor lease update. After success **or error**, it rereads the remote ref. Candidate means applied, predecessor means not applied, third OID means conflict, and unreadable state means ambiguous. Never blind-retry an ambiguous remote push.

`reconcilePublication(intent, candidate)` is restart-safe and read-only and rejects a changed remote identity. `rollback(receipt, intent, candidate)` is a separate candidate-to-predecessor fenced update; provider rejection that keeps the candidate current is safe not-applied, and an intervening OID fences stale rollback. The first profile never creates/deletes remote branches, never stores raw credentials or clear push URLs, and never disables provider branch protection. If rollback is provider-rejected, recover by preparing a new forward semantic/Git candidate instead of weakening provider policy.

### Repository context and local model transport

For D0013, construct `GitRepositoryModelExecutor` from trusted deployment configuration: local repository path, model subprocess executable/argv/environment/cwd and a required timeout. Ordinary work Tasks select operation `tdev.model.repository` and provide only `{ repositoryCommitOid, instruction }`; do not put repository paths, commands or credentials in Task input.

Each Attempt reads the exact commit rather than the mutable worktree/index, reconstructs all supported UTF-8 `100644`/`100755` files, checks current path/tree bounds, and requires the resulting semantic text digest to equal invocation `baseDigest` before starting the subprocess. A mismatch, unsupported mode, invalid UTF-8 or bound violation is an admission failure, not a reason to send partial context.

The first profile starts a fresh subprocess for every Attempt and sends the complete context plus Plan/Attempt/fencing identity in one request-digest-bound canonical JSON request. The subprocess response is valid only when it exits successfully, stays within byte/time bounds, emits one strict response with the exact request digest, and returns the Task's declared result shape. The adapter does not apply returned ChangeSets to the repository; normal runner/engine acceptance and Promotion own canonical state changes.

Do not add a hidden transport retry. Spawn/process/timeout/abort/response failures consume only the existing Task retry policy. D0014 may reuse exact verified immutable preparation inside one executor instance, but every Attempt still sends the complete request and starts a fresh model process. Configure `contextCache: false` for the D0013 cold behavior, or use finite `maxEntries`/`maxBytes`; those values bound **retained complete cache entries**, not aggregate concurrently pending cold-preparation memory or process RSS. Different-key pending producers are live work and remain caller/admission bounded. The current `runCase` capacity limits active Attempts within one runner invocation; D0014 does not define an executor-global budget across independent Cases/direct callers. A future AgentDO/executor runtime must explicitly own aggregate live-work/queue/resource admission. Never treat cache presence, recency or observation output as lifecycle or acceptance evidence. Restart, cache loss or eviction must rebuild from the bound immutable Git commit and authoritative `baseDigest`.

D0017 runs entirely inside that finite invocation before model-process admission. The runner supplies the existing `engine.caseContract.contractDigest`; the executor builds the representation-independent logical reference, prepares an ephemeral in-memory packed/hybrid carrier, and resolves it under the same AbortSignal. Enforce 128 files / 2 MiB semantic / 3 MiB stored per pack, 512 KiB manifest, at most 790 packs and all inherited repository bounds. Treat `context_reference_unauthorized`, `context_reference_stale`, `context_reference_missing`, `context_reference_corrupt`, and `context_reference_limit_exceeded` as terminal failures for that Attempt; do not retry transport internally and do not silently rebuild an inline request after such a failure. A cancelled partial resolution is discarded naturally with function-local carrier/materialization state and cannot become semantic authority. There is no filesystem cleanup/runbook for D0017 carrier state because the selected production implementation is memory-only, non-shared and non-durable.

Monitor cache status, materialization producers/waiters, Git commands/stdout bytes, logical/unique blob bytes, selected `contextReferenceId`/authorization scope, pack count/manifest/stored bytes, context-resolution duration, request bytes, process starts, bounded batch-completion rate, comparative latency samples and RSS together. A high hit rate alone is not success if request bytes, memory or tail latency regress. Same-base cold misses must single-flight without a global lock; different bases must prepare concurrently. Producer failure must be removed, one cancelled reader must not poison peers, all-reader cancellation must remove the doomed entry before stopping Git, a fresh reader during abort handoff must start a replacement producer, and POSIX descendants must be gone after timeout, overflow, abort or a direct-child exit. Observation callbacks are non-authoritative: their exceptions and unresolved asynchronous completion must not block the transport.

The verified trusted-local full-context profile now includes D0017 selected-context resolution, but still has no deterministic ContextSlice, persistent/shared CAS, warm process, locality scheduler, tokenizer or external provider API. Provider-facing optimization must first close minimum-necessary egress, redaction/secrets, authentication, tokenizer/accounting, request limits, retry billing/failure semantics, privacy/residency and hostile-provider assumptions.

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

The in-memory materialized snapshot and delta count may avoid repeated parse/replay only after the store has re-read the exact committed base/delta files and matched a cryptographic fingerprint over file name, byte length, and bytes. A changed byte, added/removed delta, new store instance, or process restart forces strict canonical parse, checksum/revision replay, final snapshot-digest verification, and size validation. Durable bytes—not cache metadata—decide revision CAS. Do not share one journal directory between independent processes as a distributed CAS store.

## 11.2 Immutable journal-store operation

`ImmutableJournalSnapshotStore` is the opt-in Design 0005 local-filesystem journal. It implements the same `create/load/compareAndSwap` interface but uses one immutable `delta-from-<expectedRevision>.json` publication slot for each predecessor revision. Candidate bytes are written canonically to an exclusive temporary file, the file is synced, and the final slot is published with a no-replace hard link before the Case directory is synced. Competing immutable-format writers from the same expected revision therefore elect at most one winner on the tested local filesystem.

This cross-process claim has a strict admission boundary: **all legacy `JournalSnapshotStore` writers must be quiesced before the first immutable-format record is published**. Legacy and immutable writers use different slot names, so a rolling mixed-writer cutover is unsupported. Once an immutable-format record exists, unmodified `mvp-1a-2` journal code must not be used to write that Case. New-source legacy and immutable adapters share a same-process journal-family lock, but that does not replace the external cross-process cutover requirement.

Every load/CAS strictly lists the committed namespace and rereads the retained authoritative base and committed record bytes. Design 0007 may reuse an instance-local materialization only when an exact ordered fingerprint over those current names, lengths, and bytes equals a previously strictly validated history; otherwise complete D0005 canonical parse/replay/digest/size validation runs. The cache is disposable, cannot elect a CAS winner, and is not updated after an ambiguous commit. There is no durable checkpoint/head, proposal cache, compaction, or retained-history deletion. A successful final-slot publication followed by an uncertain directory-sync outcome is reported as `store_commit_ambiguous`; callers must observe durable state before retrying. The verified claim is limited to the tested local filesystem behavior and does not extend to network filesystems, object stores, Durable Objects, or distributed transactions.

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
- semantic-v3 head generation, CAS conflicts/ambiguity, root/object scrub failures, migration source-change rejections, and GC dry-run/apply counts;
- D0011 Git candidate/object-format/ref identity, local ref CAS conflicts, reconciled outcomes, rollback conflicts, and semantic-binding validation failures;
- D0012 remote intent/target digest/ref identity, exact-predecessor conflicts, reconciled/ambiguous outcomes, rollback rejection/conflicts, and remote identity-change failures;
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
| semantic SQLite commit ambiguity | reopen and compare durable head with intended predecessor/successor; do not blindly retry |
| local Git publication ambiguity | reread the exact publication ref and classify predecessor/candidate/third state; do not blindly replay `update-ref` |
| local Git stale publication/rollback | preserve the current ref winner; report conflict |
| remote Git publication ambiguity | reread the intent-bound remote ref; if unreadable remain ambiguous and do not replay |
| remote Git stale publication/rollback | preserve the remote winner; never bypass provider policy |
| future snapshot version | fail closed |
| event/receipt/bounds exhaustion | reject entire mutation atomically |

## 15. Provider adapter gate

Before a provider adapter is accepted as owning Cloudflare/Agent state, or before D0012 remote Git is promoted beyond its bounded source contract into provider-specific integration/deployment qualification, the applicable layer must prove:

- authoritative state is persisted in the provider owner's transaction before dispatch;
- delivery epoch and result fences survive reconnects;
- uncertain effects enter reconciliation rather than blind retry;
- target claims survive owner restart or are safely fenced;
- publication uses one fenced lane after Promotion;
- response loss after commit returns the same receipt/result identity;
- migration and code rollback barriers are explicitly tested.
