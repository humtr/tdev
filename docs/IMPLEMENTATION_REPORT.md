# mvp-1a-1 integration and efficiency report

- Date: 2026-08-07
- Completed development lineage: `mvp-1a-1`
- mvp-1 baseline: `837da18001aa664a5b7665cfb443759e316a4212`
- reference baseline: `b9dea35a04a6e385d0a8ebb5e73e6f86b8027e18`
- Verified runtime: Node.js 22.16.0 / npm 10.9.2
- Design owners: `docs/design/0002-durable-parallel-control-core.md`, `docs/design/0003-efficient-parallel-control-plane.md`

## 1. Executive decision

The initial comparative conclusion was correct in direction but incomplete in execution detail:

- mvp-1 had the stronger ontology: immutable PlanRevision, DAG readiness, claims, isolated results, capacity degeneration, and deterministic Promotion;
- the reference branch had the stronger product boundaries: durable owners, delivery/effect uncertainty, typed operations, authorization, fencing, migration, rollback, and evidence discipline.

The final solution therefore **does not merge the reference branch wholesale**. It keeps mvp-1 as the semantic kernel and re-implements only the reference branch concepts that strengthen that kernel without reintroducing a serial scheduler or direct canonical mutation.

The mvp-1a-1 work then re-audited that completed correctness core independently. The dominant measured source-level costs were repeated whole-Case rollback cloning and invariant work on wide DAGs, O(active-leases) ClaimLedger admission combined with an O(N) active-count check, and full-snapshot rewrite amplification. This development line removes those implementation costs without changing the Work Graph, fencing, durable-dispatch, or deterministic Promotion contracts.

The resulting architecture is:

```text
CaseRepository / snapshot CAS
          |
runDurableCase checkpoint driver
          |
CaseEngine: sole graph and lifecycle owner
  |          |              |
policy     results       deterministic Promotion
  |
optional ClaimLedger: cross-Case leases only
  |
injected executor: isolated result or typed effect receipt
```

## 2. What was retained from mvp-1

The following concepts remain authoritative:

- immutable PlanRevision;
- one finite Task DAG;
- readiness derived from dependency state;
- declared resource claims;
- capacity as a runner parameter, not a lifecycle mode;
- at most one nonterminal Attempt per Task;
- isolated work results;
- exactly one full-join Promotion;
- deterministic Task/path ordering;
- Promotion conflict detection before canonical replacement;
- capacity 1 and N producing the same canonical outcome.

These are the parts that make parallel execution the ontology rather than a future feature flag.

## 3. What was adopted from the reference architecture

The useful reference concepts were re-owned in mvp-1 lineage form:

- Case coordinator as the sole durable lifecycle owner;
- separation of coordinator, delivery/capacity owner, target-claim owner, and physical effect executor;
- effect uncertainty distinct from failure;
- stable idempotency key and explicit reconciliation contract;
- executor epoch and fencing identity;
- request receipts and replay safety;
- authority as policy/grant/capability intersection;
- strict schema/canonicalization discipline;
- explicit migration and rollback barriers;
- local durable evidence before provider implementation;
- D1/R2/MCP/Agent as projections/adapters, not lifecycle owners.

These were implemented as platform-neutral ECMAScript modules instead of importing the reference branch's serial Task store, generated TypeScript/Go surface, or Cloudflare-specific code.

## 4. What was removed or superseded

The completed design rejects or supersedes:

- a stored `ready` Task state;
- Task as an independent serial Operation without graph position;
- Agent single-slot capacity as semantic truth;
- separate serial and parallel schedulers;
- ordinary Task mutation of canonical worktree/Git state;
- open-ended result objects;
- retrying every interrupted Task as result-only;
- treating timeout/disconnect as proof of failure or non-application;
- using claims as authorization;
- trusting stored derived Plan/state/result fields;
- accepting result identity based only on Attempt ID;
- automatic transaction-callback replay after CAS conflict;
- claiming distributed durability from a local JSON file.

## 5. Major implementation additions

### 5.1 Immutable execution contract

`src/plan.mjs` now compiles and freezes:

- stable Task order and reverse dependencies;
- exactly one Promotion that depends on every work Task;
- five closed work result kinds;
- three effect classes;
- typed operation;
- default total Attempt budget of 3;
- validation pass requirement;
- required capabilities;
- strict work/remote/canonical claim restrictions;
- Plan and Task-input byte bounds.

### 5.2 Closed result algebra

`src/results.mjs` adds normalized bounded variants:

- ChangeSet;
- Observation;
- Validation;
- ArtifactSet;
- EffectReceipt.

Only ChangeSets affect the candidate tree. Promotion records all result kinds in a deterministic manifest.

### 5.3 Effect-aware lifecycle

`src/state.mjs` and `src/engine.mjs` add:

- dispatch, queue, run, reconciliation, cancellation-intent, interruption, rejection, and uncertainty Attempt states;
- stable Task effect keys;
- class-specific reopen/retry rules constrained by the Case-level Attempt ceiling;
- invalid external-effect results preserved as unknown/reconciling rather than misclassified as no effect;
- reconciliation outcomes `succeeded`, `not_applied`, `failed`, `cancelled`, and `unverified`;
- cancellation intent for external effects;
- Case outcome precedence that preserves uncertainty/cancellation meaning.

### 5.4 Complete fencing

Attempts and result envelopes bind:

- Case and Plan identity;
- Task and Attempt identity;
- executor ID and epoch;
- attempt fencing token;
- optional cross-Case lease token, generation, normalized claims, and claim-set digest;
- Task effect key.

Lease currency is checked at Attempt start and the first state-changing result commit. The token binds the holder and exact normalized claim set, preventing scope substitution. A released/replaced lease cannot make a new commit, while an exact already-accepted result can still deduplicate after release.

### 5.5 Cross-Case lease owner

`src/claim-ledger.mjs` provides:

- monotonic generations;
- deterministic lease tokens bound to normalized claim-set digests;
- conflict detection;
- same-holder/same-scope deduplication and different-scope rejection;
- identity-checked release;
- live validation;
- revision waiting with abort cleanup;
- self-validating snapshot/restore.

It intentionally owns no Task lifecycle.

### 5.6 Authority, path, topology, and bounds

`src/policy.mjs` adds:

- Case grant / Workspace policy / executor capability intersection;
- normalized path policy;
- reserved `.git` and `.tdev` denial by default;
- Unicode normalization and relative-path checks;
- file/descendant topology rejection;
- explicit Plan/Task/Event/receipt/path/file/tree/result/evidence/error/Artifact limits.

### 5.7 Strict canonical data

`src/canonical.mjs` now provides a duplicate-member-safe strict parser and constrained deterministic encoding. It rejects malformed UTF-8, unsafe/non-integral numbers, unsupported values, unpaired surrogates, ambiguous object shapes, and configured resource overflows. Untrusted dictionaries use null prototypes internally; public snapshots use ordinary JSON records.

The format is intentionally a safe-integer subset and does not claim complete RFC 8785 numerical compatibility.

### 5.8 Snapshot v2 and migration

`src/engine.mjs` schema v2 includes:

- exact Plan and Case contract;
- complete Task/Attempt/result state;
- semantic Events with previous/event hashes;
- canonical tree and digest;
- command receipts;
- whole-snapshot digest.

Restore recompiles/re-normalizes derived values, rechecks Event/receipt/evidence/capability bounds, and verifies that derived blocker sets are complete. A coherent but inconsistent state is rejected even when an attacker recomputes the outer digest.

The exact Design 0001 fixture migrates by reconstructing fencing/effect identities, re-normalizing results, and recomputing Promotion. `CaseRepository.load` CAS-persists the v2 result.

### 5.9 Atomic mutation and durable dispatch

All direct engine mutations now roll back every authoritative mutable field on error, including errors after an earlier Event in the same operation.

`src/durable-runner.mjs` adds:

```text
Attempt start -> CAS checkpoint -> executor call -> settlement -> CAS checkpoint -> lease release
```

A forced checkpoint conflict was verified to call the executor zero times.

### 5.10 Store and repository boundaries

`src/store.mjs` provides memory, full-snapshot local-file, and append-delta journal CAS stores. The full-file adapter preflights file size before loading bytes, performs strict canonical read, temporary mode-0600 write, file sync, atomic rename, and directory sync, with one-process per-Case serialization. `JournalSnapshotStore` keeps snapshot schema v2 unchanged while storing a full base plus checksummed revision deltas; load/restart fully replays and verifies them, and compaction durably replaces the base before deleting covered deltas. Same-process materialization and delta-count caches are explicitly non-authoritative.

`src/repository.mjs` owns create/load/migration/transaction/command semantics and never auto-retries a transaction callback. Public transaction results are canonicalized before snapshot CAS so response serialization cannot fail after hidden state commits.

### 5.11 Public and observable surface

`src/index.mjs` is the supported source barrel. `src/cli.mjs` exposes:

- `npm run demo`;
- `npm run durable-demo`.

Both run the same graph; the second persists/reloads through `FileSnapshotStore` and `CaseRepository`.

### 5.12 Efficient parallel control plane

Design 0003 changes implementation cost, not lifecycle meaning:

- direct mutations use copy-on-write frames over frozen committed collections instead of canonical-cloning the entire mutable Case for rollback;
- immutable Event/TaskState/Attempt history is validated once during live execution and guarded by a rebuildable validation frontier; every untrusted restore/migration resets the frontier and performs full validation;
- live snapshot construction reuses validated immutable values before the mandatory complete snapshot digest/public clone;
- `ClaimLedger` uses a rebuildable exact/subtree overlap trie and an O(1) active lease count while retaining the pure normalized conflict semantics as the oracle;
- `CaseEngine` maintains a rebuildable claim-holder set and `runCase` maintains a rebuildable ready-candidate set refreshed from Plan reverse edges; admission remains authoritative in `CaseEngine`;
- Plan acyclicity checking no longer repeatedly sorts/shifts Kahn's ready list;
- `JournalSnapshotStore` removes most local snapshot write amplification without weakening dispatch-before-durable or CAS semantics;
- `bench/control-plane.mjs` measures only substrate that exists and explicitly refuses to fabricate context/token/cold-start metrics.

The largest newly discovered hidden hot path was not in the initial optimization list: after Claim conflict scanning was indexed, `Object.keys(leasesByToken).length` still made every acquisition O(active leases), preserving an O(N^2) total build cost. Replacing it with a rebuildable active count was required to realize the index benefit. A second similar issue appeared in the first journal prototype: replaying all deltas and relisting the journal on each CAS erased the I/O win in wall-clock time. Non-authoritative materialization and delta-count caches removed that repeated work while explicit load/restart remains fully verified.

## 6. Container adaptation

The reference branch's declared Node/Go 26 toolchain could not be the supplied container's executable gate. The completed mvp-1a-1 therefore:

- targets Node 22+;
- uses no third-party runtime package;
- avoids Go/generated-schema coupling while the kernel semantics are still evolving;
- uses portable ESM modules and Node's built-in test runner;
- implements local durable adapters that are actually executable in the container;
- documents Cloudflare/Agent/MCP/Git mappings without pretending they were run.

This is a deliberate architecture choice rather than a product-version decision: core semantics are stabilized before multiplying them across generated/provider contracts.

## 7. Verification evidence

Final verification observations:

```text
syntax: passed
unit/integration tests: 96 passed, 0 failed
memory demo: succeeded
durable file demo: succeeded
stress graph: 64 work Tasks, identical capacity-1/capacity-16 output
observed parallel concurrency: 16
coverage command: completed with all 96 tests passing
performance benchmark: retained at docs/evidence/control-plane-benchmark-2026-08-07.json
```

Node's final all-files coverage report:

| Metric | Coverage |
| --- | ---: |
| lines | 91.12% |
| branches | 80.25% |
| functions | 96.40% |

Coverage is supporting evidence. The stronger evidence is the explicit negative matrix for stale fencing, lease replacement, uncertain effects, cancellation races, corrupt snapshots, migration, atomic rollback, Promotion non-mutation, and checkpoint-before-dispatch.


### 7.1 Measured mvp-1a-1 fast paths

The checked-in benchmark run under Node 22.16.0 reported:

| Workload | mvp-1a-1 observation | Relevant pre-change audit |
| --- | ---: | ---: |
| 128-wide observation DAG, capacity 1 | 156.004 ms | ~2.42 s |
| 128-wide observation DAG, capacity 16 | 111.990 ms | ~2.64 s |
| 512-wide observation DAG, capacity 16 | 984.466 ms | not retained pre-change |
| one 2,000-Task readiness scan | 0.488 ms | not separately retained pre-change |
| 2,000 disjoint Claim acquisitions | 59.577 ms | ~6.319 s |
| 10,000 disjoint Claim acquisitions | 309.348 ms | not retained pre-change |
| disjoint Claim query at 10,000 active leases | 0.036 ms | not retained pre-change |
| 20,000-file Promotion, 1 touched path | 172.604 ms | ~165 ms |
| 32-task full-snapshot durable bytes | 6,550,735 bytes | same persistence shape |
| 32-task journal durable bytes | 270,883 bytes | not available before mvp-1a-1 |
| 32-task full-snapshot wall clock | 918.167 ms | run-local |
| 32-task journal wall clock | 648.343 ms | run-local |

The scheduler and ClaimLedger changes are directly associated with removed repeated scans/copies. Promotion remains roughly unchanged, which is expected because this slice deliberately did not implement incremental tree construction. Journal logical bytes fell from 6,550,735 to 270,883 bytes (95.86%); filesystem wall-clock is noisy and is not an SLO. The same-size limit is enforced before journal CAS as well as during restart replay, preventing a commit that could only fail later on load.

## 8. External research basis

The architecture was cross-checked against primary/official engineering material:

- Cloudflare Durable Objects describe a globally unique single-threaded coordinator with attached persistent storage, and their guidance requires durable storage for state that must survive eviction/restart. This supports the Case-owner mapping but not a claim that the local file adapter is equivalent: [Cloudflare Durable Objects overview](https://developers.cloudflare.com/durable-objects/concepts/what-are-durable-objects/) and [storage guidance](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/).
- RFC 8785 establishes deterministic JSON representation through constrained data and deterministic property sorting. The implementation borrows that principle while intentionally accepting only safe integers: [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785.html).
- AWS's idempotent API guidance explains why retries of side-effecting calls need a stable caller intent/key to avoid duplicate effects. This supports the stable Task effect key and the refusal to blindly retry unknown effects: [Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/).
- Git's object model stores blobs/trees/commits as content-addressed objects and updates references separately. This supports a future content-addressed Promotion adapter plus a distinct fenced publication lane: [Git Objects](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects).
- Bazel remote caching separates action metadata from digest-addressed content and reuses identical immutable inputs/results. This supports a future Context/Artifact CAS only when a real repository/executor adapter exists: [Bazel Remote Caching](https://bazel.build/remote/caching).
- SQLite WAL/checkpointing is a production example of appending committed changes and periodically folding them into a base while retaining recovery semantics. It informed the journal/compaction principle, not the tdev file format: [SQLite WAL](https://sqlite.org/wal.html).

These sources support design principles. They do not substitute for provider integration tests.

## 9. Honest remaining boundaries

The following are still substantial product work:

1. Cloudflare CaseDO transaction adapter and class/storage migrations;
2. AgentDO connection epoch, durable delivery queue, receipts, and hibernation;
3. durably persisted target-claim owner and cross-owner recovery;
4. authenticated Termux Agent and typed filesystem/Git/process/network operations;
5. real Artifact byte storage and content-addressed ChangeSets;
6. Git tree/OID construction, exact preconditions, commit/ref publication, and rollback;
7. D1 locator/query projection;
8. MCP schemas, auth, pagination, replay, and current-client qualification;
9. cross-process/distributed storage tests;
10. explicit cancellation wiring to a running remote executor;
11. snapshot authenticity when storage itself is malicious;
12. repository/context/model transport with measurable ContextSlice/token reuse and warm executor lifecycle;
13. incremental Promotion/content-addressed trees if repository-scale profiling justifies it;
14. incremental Case-state/receipt global accounting if large-DAG profiling confirms the remaining O(V)-per-transition growth.

The current local ClaimLedger and Case snapshot are not atomically persisted together. The runner's top-level AbortSignal cancels a claim wait, not arbitrary running executor work. Whole-Case rollback cloning has been removed, but some global Case derivation/receipt checks still scale with graph/history size, and Promotion still validates/copies the whole candidate tree. These are the largest source-level performance boundaries now visible in this kernel.

## 10. Final assessment

The completed mvp-1a-1 now has a coherent SDD and architecture foundation rather than only a promising scheduler prototype:

- parallelism remains the ontology;
- durability is introduced at the correct checkpoint and ownership boundaries;
- external effects cannot inherit unsafe result-only retry semantics;
- cross-Case exclusion, authority, and fencing are separate and composable;
- persisted state is re-derived and checked rather than trusted;
- canonical mutation remains single-path and deterministic;
- provider layers have clear contracts and stop gates;
- performance accelerators remain rebuildable/non-authoritative and can be dropped without changing a legal result;
- local durable write amplification can be reduced without changing snapshot schema v2 or the dispatch durability boundary.

This is the maximum defensible mvp-1a-1 source-level slice in the supplied container without fabricating Cloudflare, Agent, repository-context, model-token, Git-provider, or MCP evidence.
