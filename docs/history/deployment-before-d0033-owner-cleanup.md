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

The cross-process evidence is limited to tested compatible local filesystems. On 2026-08-09 the connected tmcp/Termux environment denied hard-link creation on every writable mount probed and is therefore not qualified for the current production hard-link `ImmutableJournalSnapshotStore` publication path. The D0008 candidate passed the complete source, coverage, diff, and authority-smoke gates on Ubuntu/POSIX with the hard-link suite enabled. D0030 later accepts a second backend rather than weakening this requirement. Network filesystems, provider object stores, Durable Objects, and distributed transactions remain unverified.

#### D0030 accepted publication-portability deployment contract

The accepted second backend is same-directory `renameat2(..., RENAME_NOREPLACE)` through a bounded fd-relative standalone helper. This is a Design-layer deployment contract, not a claim that the production package already ships that helper: at the D0030 acceptance checkpoint `src/store.mjs` still uses the inherited hard-link path.

A production implementation must satisfy all of the following before selecting the rename backend:

- provide a package-owned executable for each declared OS/architecture **before runtime publication**; runtime compilation, download, `PATH` lookup, or an experimental FFI/addon fallback is not an accepted installation path;
- bind helper protocol/build identity, Node/runtime identity, filesystem identity/profile, and the selected publication backend into the capability validity key; process restart, helper replacement, or validity-key change requires requalification;
- open the actual writable Case directory in JS and pass only that inherited fd plus generated single-component contender/final basenames; the helper receives no absolute Case path and has no shell, network, config, secret, semantic-read, copy, fallback, or cleanup authority;
- use a dedicated begin/result fd with a finite controller deadline. Failure known before the begin marker may be treated as no-successor; after begin, timeout, kill, abnormal exit, missing/malformed result, or result/status loss is `store_commit_ambiguous` and requires authoritative reread without blind retry;
- fail closed as `store_publication_unsupported` for `ENOSYS`, unsupported-flag/filesystem `EINVAL`, `EACCES`/`EPERM`, missing/mismatched helper identity, wrong final type/bytes, overwrite, or failed required directory durability; no plain-rename/copy/check-then-rename/direct-final/`O_TMPFILE`+link/symlink fallback is allowed;
- run the actual-directory non-authoritative dot-name qualification sequence: exclusive contender creation, complete fixed write, file `fsync`, absent-destination no-replace publication, final regular type/bytes, source disappearance, same device/inode when observable, second contender, existing-destination conflict, unchanged winner, surviving loser, Case-directory `fsync`, cleanup, and cleanup-directory sync;
- preserve committed filename/bytes/schema/replay/migration/downgrade semantics across backend changes.

Concurrent hard-link and rename writers are permitted only on a deployment validity key where both backends are independently qualified. The D0030 independent Debian 13.3/x86_64/ext4 plane produced 100/100 exact-one-winner mixed races, 100 loser conflicts and valid final bytes, with zero overwrite and zero parallel continuation; this evidence is not portable by assertion to a new profile. Without joint qualification, deploy homogeneous writers or use a quiesced/fenced backend switch. The connected Termux/Android/aarch64/F2FS acceptance plane qualified the rename helper but remains hard-link-unqualified.

Removal/rollback must also fail closed. A missing or mismatched helper cannot trigger a different publication primitive automatically. Hard-link writing may be re-enabled only where that backend is independently qualified and the homogeneous/mixed-writer rule is satisfied. Destructive power-loss testing was not performed for D0030; ordinary process-crash and directory-fsync fault evidence must not be reported as power-loss qualification. The actual production package/release/install pipeline and post-install Termux/independent-POSIX runs remain required in the separate post-acceptance implementation Task.

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

## 8. Required final-MVP Cloudflare target architecture

The final MVP must implement a Cloudflare/local-Agent topology that preserves the following ownership split, unless a later accepted Design proves and records an equivalent owner mapping:

| Contract | Candidate provider owner |
| --- | --- |
| Case graph/lifecycle/results/receipts | one SQLite-backed Case Durable Object hosting the existing D0010/CaseEngine authority — D0019 accepted Design |
| Agent connection epoch/delivery/capacity | Agent Durable Object |
| cross-Case target leases | dedicated target owner selected by target identity |
| immutable Artifact bytes | R2 |
| query/locator projection | D1 |
| public ingress/projection | Worker/MCP layer |
| local OS/Git/process effects | authenticated Agent |

This mapping follows the actor-style requirement that one authoritative owner serialize mutations for a fact. D0019 freezes the Case row at the Design layer: CaseDO hosts/adapts the existing authority rather than introducing a second or rewritten semantic owner. The adapter has not yet been implemented, deployed or load-tested, and the Agent/target/storage/projection rows remain subject to their own owners. The final-MVP requirement is therefore still open. `ROADMAP.md` owns the integration and qualification sequence.

## 9. Provider adapter requirements

The D0019 Case Durable Object adapter must:

- elect one durable placement generation before new Case authority birth, binding `CaseId` to the exact deployment/environment, Worker script, class/namespace, jurisdiction and Durable Object ID; reject competing placement tuples and never fall back to a second destination after initialization failure;
- route the elected Case to that SQLite-backed CaseDO and verify placement generation plus durable Case/profile/schema identity before mutation;
- reconstruct ordinary CaseDO eviction from durable storage with semantic reopen disabled; do not infer execution-owner loss from in-memory loss, constructor rerun, deployment or stub/RPC failure;
- invoke the existing semantic reopen path only from a separately durable execution/delivery-owner-loss recovery cause, fenced and committed exactly once;
- preserve the existing D0010/CaseEngine semantic transition meaning rather than define CaseDO-native competing semantics;
- atomically fence the expected revision and persist one command transition, the successor semantic head/current revision and the exact durable receipt in the owning transaction;
- use exactly `typedDigest('tdev.case-command.v1', canonicalClone(command))` as receipt command identity; `requestId` addresses the receipt and `expectedCaseRevision` is not part of that digest;
- replay an exact duplicate request's durable semantic response before expected-revision equality and reject conflicting command reuse;
- treat a lost/failed RPC after a possible commit as ambiguous until the same elected Case authority is reread;
- prevent D0020/Agent dispatch until the running Attempt identity/fencing commit is durable;
- keep Agent connection/capacity/reconnect state outside Case authority;
- mark ambiguous external delivery/effects for existing reconciliation rather than blind retry;
- implement `tdev.casedo.sqlite-authority.v1` / schema version 1 with a normalized/chunked SQLite representation that respects current provider row/BLOB/query limits without weakening one semantic transaction boundary;
- positively qualify a finite total authoritative Case budget from the actual provider/account configuration and fail admission before a mutation/effect can exceed it;
- preserve lossless receipts/state across old/new code and schema overlap or establish a fail-closed rollout barrier; incompatible mixed schema writers are forbidden;
- fail closed on corrupt/unknown-placement/incompatible durable state and version schema evolution explicitly;
- create no migration path for an existing locally authoritative Case unless a separate accepted cutover design first supplies a durable placement generation, old-writer fence, destination activation and rollback boundary.

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

No environment variable is required by the source core. D0011, D0012 and D0013/D0014 strip inherited `GIT_*` routing before invoking Git. D0012 sets `GIT_TERMINAL_PROMPT=0`, accepts no credential argument, and relies on an already configured deployment credential helper or SSH agent when authentication is required. D0013 takes trusted local repository path, Git executable, subprocess executable/argv/environment/cwd and timeout as constructor/deployment configuration; Task input cannot choose them, and the local subprocess environment is explicit rather than inherited. D0014 additionally accepts only bounded instance-local context-cache configuration (`false` or finite `maxEntries`/`maxBytes`). D0017 adds no environment/configuration key and no persistent content-store binding: its selected packed/hybrid carrier is executor-memory-only, while product-visible logical references exclude repository paths, temporary/worktree/cache/store locators and credentials. Mutable deployment configuration remains outside Plan/result/semantic digests; the D0012 intent persists only a digest of the effective push target, and repository/model observations persist no repository path/executable/environment/file contents.

Secrets must not be stored in Task input, evidence, receipts, snapshots, remote intents, model observations, or clear embedded Git URLs without a separate encrypted-secret design.

## 12. Deployment evidence levels

| Level | Meaning |
| --- | --- |
| source-verified | Node source tests and demos passed locally |
| adapter-verified | provider adapter unit/contract tests passed |
| integration-verified | real provider resources exercised, including restart/response loss |
| deployment-verified | migrations, routes, bindings, observability, and rollback tested in target environment |
| production-qualified | measured SLO, load, security, and incident procedures accepted |

This repository remains **source-verified/local-adapter-verified only for the currently declared D0011-D0014 and D0017 trusted-local layers**; D0018 production source/runtime is separately verified on its declared supported-Termux trusted-local scope, while D0019 is accepted only at the Design/model-falsifier layer and has no production CaseDO adapter yet. It is not yet a deployable or qualified final MVP. It is source-verified for D0011 local Git, the D0012 generic authenticated remote-publication contract, the D0013 trusted-local repository-context/subprocess transport, D0014 bounded preparation reuse, and the D0017 authorized full-context reference plus bounded packed/hybrid receiver. D0017 production implementation is verified at source level on the supported Termux test scope at `eea429100d4bc6b6e9e6b74a29da2fbcdecc53db`: focused D0017+transport tests passed 52/52 and the Termux-supported full suite excluding only the pre-existing hard-link test file passed 226/226. The exact all-test coverage command is **platform-unqualified on this Termux filesystem**, not green, because `test/immutable-journal.test.mjs` still hits the previously documented `link(2) EACCES`; no D0017/repository-model-transport failure was observed there. D0013/D0014/D0017 exercise full Git context reconstruction, selected-context resolution and a real fresh local Node subprocess; this is not an external model/provider integration claim. An authenticated GitHub `push --dry-run` additionally confirms D0012 non-interactive transport negotiation in the current deployment context. No D0012 remote ref has been mutated as integration evidence, and no external model/provider resource has been promoted to integration-verified or deployment-verified.

D0017 changes no persisted Case/Plan semantic-state schema and introduces no durable context state, so it requires no data migration. Software rollback is deployment of the pre-D0017 D0013/D0014 full-inline implementation; because Case/Plan semantic authority and persisted schema are unchanged, that rollback requires no context-data conversion. A live `context_reference_unauthorized`, stale, missing, corrupt or limit-exceeded request must **not** silently fall back to inline delivery; per-request fallback is not rollback.

D0018 is accepted only at the Design/qualification layer here, not source-verified. Its selected deployment profile is the existing trusted Node 22+ host with bounded D0014 preparation reuse and one fresh local model process group per Attempt; no external provider/session or same-model-process pool is selected. The accepted C1-C4 repair adds only transient live-control/Event-observation state and exact checkpoint/capacity ordering, with no durable schema or data migration. Software rollback is data-compatible but reintroduces the known cancellation/checkpoint/runtime-slot defects and is therefore an emergency compatibility rollback, not equivalent liveness behavior.

## 13. Release checklist

Before cutting a source artifact:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
node --experimental-test-coverage --test test/*.test.mjs
npm run bench
```

When validating a Git checkout, also run `git diff --check` and inspect `git status --short`. Archive-only validation may omit `.git`, but that does not waive checkout diff/status gates for publication. Confirm documentation distinguishes D0012 source verification/authenticated dry-run capability from still-unverified actual provider-ref integration and distinguishes D0013/D0014/D0017 trusted-local full-context verification from still-unverified external model/provider authentication, minimum-necessary data egress, redaction, tokenizer/billing semantics, deterministic ContextSlice, persistent/shared CAS and warm-process reuse. Exercise cache-disabled cold rebuild, cache hit, concurrent same-key and different-key misses, eviction/restart, producer failure, reader/all-reader cancellation, retry ownership, inherited-pipe descendants and non-blocking observations. Also confirm no generated/cache/runtime directory is included in any development archive. Benchmark timing is evidence only and has no fragile pass/fail threshold.
