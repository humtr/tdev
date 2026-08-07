# xh-1 completion and integration report

- Date: 2026-08-06
- Completed source line: `mvp-parallel-xh-1`
- xh-1 baseline: `837da18001aa664a5b7665cfb443759e316a4212`
- reference baseline: `b9dea35a04a6e385d0a8ebb5e73e6f86b8027e18`
- Verified runtime: Node.js 22.16.0 / npm 10.9.2
- Design owner: `docs/design/0002-durable-parallel-control-core.md`

## 1. Executive decision

The initial comparative conclusion was correct in direction but incomplete in execution detail:

- xh-1 had the stronger ontology: immutable PlanRevision, DAG readiness, claims, isolated results, capacity degeneration, and deterministic Promotion;
- the reference branch had the stronger product boundaries: durable owners, delivery/effect uncertainty, typed operations, authorization, fencing, migration, rollback, and evidence discipline.

The final solution therefore **does not merge the reference branch wholesale**. It keeps xh-1 as the semantic kernel and re-implements only the reference branch concepts that strengthen that kernel without reintroducing a serial scheduler or direct canonical mutation.

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

## 2. What was retained from xh-1

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

The useful reference concepts were re-owned in xh-1 form:

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

`src/store.mjs` adds memory and local-file CAS stores. The file adapter preflights file size before loading bytes, performs strict canonical read, temporary mode-0600 write, file sync, atomic rename, and directory sync, with one-process per-Case serialization.

`src/repository.mjs` owns create/load/migration/transaction/command semantics and never auto-retries a transaction callback. Public transaction results are canonicalized before snapshot CAS so response serialization cannot fail after hidden state commits.

### 5.11 Public and observable surface

`src/index.mjs` is the supported source barrel. `src/cli.mjs` exposes:

- `npm run demo`;
- `npm run durable-demo`.

Both run the same graph; the second persists/reloads through `FileSnapshotStore` and `CaseRepository`.

## 6. Container adaptation

The reference branch's declared Node/Go 26 toolchain could not be the supplied container's executable gate. The completed xh-1 therefore:

- targets Node 22+;
- uses no third-party runtime package;
- avoids Go/generated-schema coupling while the kernel semantics are still evolving;
- uses portable ESM modules and Node's built-in test runner;
- implements local durable adapters that are actually executable in the container;
- documents Cloudflare/Agent/MCP/Git mappings without pretending they were run.

This is a deliberate architecture choice, not merely a downgraded version number: core semantics are stabilized before multiplying them across generated/provider contracts.

## 7. Verification evidence

Final release observations:

```text
syntax: passed
unit/integration tests: 88 passed, 0 failed
memory demo: succeeded
durable file demo: succeeded
stress graph: 64 work Tasks, identical capacity-1/capacity-16 output
observed parallel concurrency: 16
coverage command: completed with all tests passing
```

Node's final all-files coverage report:

| Metric | Coverage |
| --- | ---: |
| lines | 90.87% |
| branches | 79.81% |
| functions | 96.08% |

Coverage is supporting evidence. The stronger evidence is the explicit negative matrix for stale fencing, lease replacement, uncertain effects, cancellation races, corrupt snapshots, migration, atomic rollback, Promotion non-mutation, and checkpoint-before-dispatch.

## 8. External research basis

The architecture was cross-checked against primary/official engineering material:

- Cloudflare Durable Objects describe a globally unique single-threaded coordinator with attached persistent storage, and their guidance requires durable storage for state that must survive eviction/restart. This supports the Case-owner mapping but not a claim that the local file adapter is equivalent: [Cloudflare Durable Objects overview](https://developers.cloudflare.com/durable-objects/concepts/what-are-durable-objects/) and [storage guidance](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/).
- RFC 8785 establishes deterministic JSON representation through constrained data and deterministic property sorting. The implementation borrows that principle while intentionally accepting only safe integers: [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785.html).
- AWS's idempotent API guidance explains why retries of side-effecting calls need a stable caller intent/key to avoid duplicate effects. This supports the stable Task effect key and the refusal to blindly retry unknown effects: [Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/).
- Git's object model stores blobs/trees/commits as content-addressed objects and updates references separately. This supports a future content-addressed Promotion adapter plus a distinct fenced publication lane: [Git Objects](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects).

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
12. performance indexes and qualification for thousands of Tasks or large binary repositories.

The current local ClaimLedger and Case snapshot are not atomically persisted together. The runner's top-level AbortSignal cancels a claim wait, not arbitrary running executor work. Full-state cloning and invariant scans favor correctness over large-scale efficiency. These are documented constraints, not hidden completeness claims.

## 10. Final assessment

The completed xh-1 now has a coherent SDD and architecture foundation rather than only a promising scheduler prototype:

- parallelism remains the ontology;
- durability is introduced at the correct checkpoint and ownership boundaries;
- external effects cannot inherit unsafe result-only retry semantics;
- cross-Case exclusion, authority, and fencing are separate and composable;
- persisted state is re-derived and checked rather than trusted;
- canonical mutation remains single-path and deterministic;
- provider layers have clear contracts and stop gates.

This is the maximum defensible source-level skeleton in the supplied container without fabricating Cloudflare, Agent, Git, or MCP evidence.
