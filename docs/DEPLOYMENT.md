# deployment, persistence, migration, and rollback

> Normative owner for runtime support, storage guarantees, schema movement, rollback barriers, and provider deployment gates.

## 1. Declared source runtime

The verified source target is:

- Node.js `>=22`;
- ECMAScript modules;
- no third-party runtime dependency;
- POSIX-like local filesystem only for `FileSnapshotStore`, `JournalSnapshotStore`, and `ImmutableJournalSnapshotStore` tests, benchmarks, and demos.

The `mvp-1a-7` executable source contract remains Node 22+ and has no generated Go/provider runtime dependency. Filesystem-specific publication claims remain conditional on the adapter requirements below. The opt-in semantic-v3 SQLite adapter additionally requires the runtime `node:sqlite` API and fails explicitly when it is unavailable; legacy v2 operation does not depend on that API. D0011 local Git projection additionally requires a trusted local Git executable/repository providing the tested plumbing and SHA-1 or SHA-256 object format; it does not require or imply a Git remote.

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

The journal materialization and delta-count caches are not authoritative. Every load/CAS re-reads the base and committed delta bytes and fingerprints exact file names, lengths, and contents. Cache reuse is allowed only when that fingerprint matches a previously validated materialization; otherwise strict parse/replay/digest/size validation runs. Recognized legacy journal records fail closed on missing base, malformed/truncated/noncanonical contents, revision discontinuity, digest failure, and corruption introduced after a warm load. D0008 also makes the committed namespace fail closed: an exact legacy delta name on a non-regular entry fails `store_journal_file_type`, any other non-temporary committed-looking `delta-*` name fails `store_journal_filename`, `delta-from-*` remains an explicit format-upgrade failure, and dot-temporary files remain non-authoritative. Like `FileSnapshotStore`, this adapter does not provide cross-process locking or distributed consistency. Its layout is separate from the single-file `FileSnapshotStore` format.

### ImmutableJournalSnapshotStore

Use only when a local filesystem supports the tested same-directory exclusive-create, hard-link no-replace publication, file `fsync`, and directory `fsync` behavior. This adapter is opt-in and does not replace `JournalSnapshotStore`.

It provides:

- strict committed-namespace validation and reread of `base.json` plus every retained committed record byte on every load/CAS;
- one immutable `delta-from-<expectedRevision>.json` publication slot per non-create CAS;
- source/target snapshot-digest binding for new schema-v2 delta records;
- legacy-v1 prefix read followed by one-way v2 continuation;
- process-wide same-process serialization plus cross-process winner election that does not depend on that mutex;
- exact-byte-fingerprint-gated instance-local materialization reuse; any namespace/file-type/length/byte change or cache loss forces complete D0005 replay;
- no durable checkpoint/head, proposal cache, compaction, or history deletion.

A dot-prefixed temporary file is never authority. Publication returns success only after the authoritative final slot has been linked and the Case directory durability step succeeds. If the final link may have succeeded but the directory durability step fails, the adapter reports `store_commit_ambiguous`; callers must re-read/reconcile and must not blindly replay a transaction callback. Temporary cleanup after the commit boundary is best-effort and cannot change success into failure.

Once a directory contains a v2 `delta-from-*` record, unmodified `mvp-1a-2` `JournalSnapshotStore` code is an unsafe downgrade because it does not understand that format. The current legacy adapter fails closed on such a directory. D0007 changes no durable bytes, so rolling back only the materialization optimization to D0005-compatible source is data-compatible; no v2-to-v1 data downgrade is implemented.

The first v2 write is an explicit cutover, not a rolling mixed-writer migration. Before that write, the operator must stop every process that can still write the affected Case/directory with the legacy `JournalSnapshotStore` and independently validate the retained legacy chain using the new source. Only then may the first immutable CAS be admitted. Afterward, only `ImmutableJournalSnapshotStore` writers are supported for that Case/directory. The new-source legacy and immutable adapters share a process-local serialization key, but separate processes running mixed formats can otherwise publish different filename slots from the same predecessor; cross-process mixed-format operation is therefore unsupported rather than silently treated as safe.

The cross-process evidence is limited to tested compatible local filesystems. On 2026-08-09 the connected tmcp/Termux environment denied hard-link creation on every writable mount probed and is therefore not qualified for `ImmutableJournalSnapshotStore` publication. The D0008 candidate passed the complete source, coverage, diff, and authority-smoke gates on Ubuntu/POSIX with the hard-link suite enabled. Network filesystems, provider object stores, Durable Objects, and distributed transactions remain unverified.

### SemanticSqliteStore and SemanticCaseRepository

Use this opt-in local profile only on a Node 22+ runtime that provides `node:sqlite`. `openSemanticSqliteStore(path)` opens the SQLite authority database; `SemanticCaseRepository` uses it for native v3 creation, load/checkpoint/commands, and the bounded v2 -> v3 migration. The database stores immutable typed semantic objects, immutable schema-v3 snapshots, and one mutable per-Case transactional head.

A commit transaction checks the exact predecessor head/revision, inserts objects and snapshot, and updates the head atomically. A possibly committed transaction reports `store_commit_ambiguous`; reopen/reconciliation decides successor versus predecessor versus third-state conflict. The adapter is local source infrastructure, not evidence for network filesystems, Durable Objects, multi-host SQLite, or provider transactions.

### GitProjectionAdapter

D0011's opt-in local profile `tdev.git.text-tree.v1` targets an existing local Git repository and one direct full `refs/heads/...` ref. It is verified with real bare SHA-1 and SHA-256 repositories. The adapter uses plumbing commands only, requires no index/worktree, writes exact UTF-8 `100644` content derived from a validated semantic tree, and supplies explicit commit identity/time/message instead of inheriting user Git identity/configuration.

`project` may leave unreachable immutable candidate objects but does not move the ref. `publish` performs one exact predecessor `update-ref` CAS and reconciles an uncertain response by durable reread. `rollback` is another exact CAS and is fenced by any intervening ref move. These are local source guarantees only: no remote fetch/push, credentials, protected branches, server hooks, multi-host locking, provider transaction, or Git-object GC is claimed.

### CaseRepository

The repository is the semantic persistence boundary:

- creates a validated Case snapshot;
- loads and fully restores domain state;
- persists v1 migration or reopen changes through CAS;
- invokes transaction callbacks once;
- writes only when Case revision advanced;
- exposes receipt-backed commands with optional live claim validation.

A raw store validates only Case ID/revision identity and storage syntax. `CaseEngine.restore` owns semantic integrity.

Case-contract limits bound individual domain structures while the concrete store separately owns complete materialized-snapshot capacity. D0008 keeps those concerns separate: built-in stores expose exact capacity assertions over their canonical materialized snapshot, each durable checkpoint is checked before CAS, and external-effect dispatch additionally fails closed before executor invocation unless the store can prove capacity for the proposed running state and contract-bounded post-effect successors. This does not claim that every component-valid Case fits every arbitrary deployment bound; it defines the safe admission behavior when it does not.

## 4. Durable runner checkpoint protocol

`runDurableCase` loads with reopen enabled and tracks the persisted revision. Every checkpoint must strictly advance the revision and succeed through store CAS.

Required ordering:

```text
Case snapshot R
  -> acquire authority / selected Claim
  -> for external effects: prove running + bounded successor capacity
  -> start Attempt in memory (R+n)
  -> exact capacity check + CAS persist R+n
  -> dispatch executor
  -> settle result/failure (R+m)
  -> exact capacity check + CAS persist R+m
  -> release terminal claim
```

A pre-dispatch capacity/checkpoint failure releases a newly acquired Claim and produces zero executor calls. If settlement is computed in memory but its checkpoint fails, the lease remains held and snapshot R+n remains durable authority. A later `reopen:true` repository load CAS-persists the recovery transition before terminal release/retry; reconciling external work retains the lease until fenced reconciliation becomes durably terminal. The function rejects a final snapshot whose revision was not persisted.

## 5. Snapshot schema

The legacy/default Case snapshot schema remains `2`. An explicitly selected semantic-authority repository uses compact schema `3`.

Schema v2 stores:

- normalized Case contract and digest;
- compiled Plan and digest;
- full Task/Attempt state;
- normalized accepted results and digests;
- semantic Events with hash chain;
- mutation receipts;
- canonical tree and digest;
- whole-snapshot digest.

Schema v3 stores compact Plan/root authority rather than full base/canonical trees and requires its semantic object graph plus transactional head. Unknown future schema versions fail closed.

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

## 6.1 v2 to semantic-v3 migration

D0010 migration is not a rolling format upgrade. It accepts only a fully valid schema-v2 Case before successful Promotion whose canonical tree still equals the immutable Plan base. Admission requires explicit `writersQuiesced: true` and `claimsQuiesced: true`; after reopen there may be no running, queued, dispatch-pending, cancel-requested, or reconciling Attempt that would preserve uncertain ownership.

The migrator captures the exact source v2 snapshot digest/revision, builds the compact Plan binding and base radix, and rereads the source immediately before the first v3 head transaction. Any source change aborts with `migration_source_changed`. Operators must fence old v2 writers before that transaction; mixed v2/v3 writers for one Case are unsupported.

Rollback has three states. Before the first v3 head commits, ordinary code/config rollback leaves v2 authoritative. If only the generation-1 migration head exists and no later v3 write committed, activation may explicitly abandon the unadvanced v3 target and return to the protected source v2 snapshot. After any post-migration v3 head commits, automatic downgrade is forbidden; recovery must use v3 or a future explicit reverse migrator. The protected v2 source is retained until the migration acceptance window closes.
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

D0011's local Git adapter implements the publication separation after semantic Promotion:

```text
accepted isolated results
  -> deterministic tdev semantic Promotion tree/digest
  -> derived Git tree/commit OID candidate under an explicit repository profile
  -> validations
  -> one fenced publication operation
  -> commit/reference receipt
```

Ordinary Tasks must not update the Git index, worktree, branch, or remote ref. D0011 verifies local object/tree/commit construction and one local branch-ref CAS/reconciliation/rollback lane; D0012 adds the separate `tdev.git.remote-existing-branch.v1` external-effect adapter for an already locally elected candidate and existing remote branch. Git OIDs and remote refs remain derived publication identities. D0012 binds one effective push target into an immutable intent, uses exact predecessor remote fencing, rereads uncertain outcomes, and never creates/deletes a remote branch or bypasses provider policy.

## 11. Environment and configuration

No environment variable is required by the source core. D0011 and D0012 strip inherited `GIT_*` routing before invoking Git. D0012 sets `GIT_TERMINAL_PROMPT=0`, accepts no credential argument, and relies on an already configured deployment credential helper or SSH agent when authentication is required. Mutable deployment configuration remains outside Plan/result/semantic digests; the D0012 intent persists only a digest of the effective push target, not its clear URL.

Secrets must not be stored in Task input, evidence, receipts, snapshots, remote intents, or clear embedded Git URLs without a separate encrypted-secret design.

## 12. Deployment evidence levels

| Level | Meaning |
| --- | --- |
| source-verified | Node source tests and demos passed locally |
| adapter-verified | provider adapter unit/contract tests passed |
| integration-verified | real provider resources exercised, including restart/response loss |
| deployment-verified | migrations, routes, bindings, observability, and rollback tested in target environment |
| production-qualified | measured SLO, load, security, and incident procedures accepted |

This repository remains **source-verified** for D0011 local Git and the D0012 generic authenticated remote-publication contract. An authenticated GitHub `push --dry-run` additionally confirms non-interactive transport negotiation in the current deployment context. No D0012 remote ref has been mutated as integration evidence, and no remote/provider resource has been promoted to integration-verified or deployment-verified; protected-branch behavior remains unverified.

## 13. Release checklist

Before cutting a source artifact:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
node --experimental-test-coverage --test test/*.test.mjs
npm run bench
```

When validating a Git checkout, also run `git diff --check` and inspect `git status --short`. Archive-only validation may omit `.git`, but that does not waive checkout diff/status gates for publication. Confirm documentation distinguishes D0012 source verification/authenticated dry-run capability from still-unverified actual provider-ref integration, protected-branch behavior, and provider-specific policy; also confirm no generated/cache/runtime directory is included in any development archive. Benchmark timing is evidence only and has no fragile pass/fail threshold.
