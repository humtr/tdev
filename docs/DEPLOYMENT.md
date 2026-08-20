# deployment, persistence, migration, and rollback

> Normative owner for runtime support, storage guarantees, schema movement, rollback barriers, and provider deployment gates.

## 1. Declared source runtime

The verified source target is:

- Node.js `>=22`;
- ECMAScript modules;
- no third-party runtime dependency;
- POSIX-like local filesystem only for `FileSnapshotStore`, `JournalSnapshotStore`, and `ImmutableJournalSnapshotStore` tests, benchmarks, and demos.

The executable source contract remains Node 22+ and has no generated Go/provider runtime dependency. Development branch/checkpoint names do not own that runtime contract. Filesystem-specific publication claims remain conditional on the adapter requirements below. The opt-in semantic-v3 SQLite adapter additionally requires the runtime `node:sqlite` API and fails explicitly when it is unavailable; legacy v2 operation does not depend on that API. D0011 local Git projection additionally requires a trusted local Git executable/repository providing the tested plumbing and SHA-1 or SHA-256 object format; it does not require or imply a Git remote.

## 2. Installation and source qualification

The lockfile contains no external package dependency. Install from the repository lockfile in the declared Node runtime, then run the complete baseline source qualification owned by `QUALIFICATION.md`. This deployment owner intentionally does not duplicate that command sequence or its proof-method catalog.

A source gate proves only its declared source/adaptor layer. Provider integration, deployment, migration and rollback require the additional evidence owned by this file, the responsible Design, and the applicable qualification method.

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

Cross-process publication capability is profile-specific. The hard-link backend may be selected only on a runtime/filesystem profile that positively qualifies the required no-replace hard-link semantics; a denied or unsupported hard-link primitive fails closed rather than weakening the publication contract. Qualification on one local filesystem does not transfer by assertion to another filesystem, network storage, provider object store, Durable Object, or distributed transaction substrate. D0030 provides a separately qualified second backend without weakening this rule.

#### D0030 publication-portability deployment contract

The selected second backend is same-directory `renameat2(..., RENAME_NOREPLACE)` through a bounded fd-relative standalone helper. This is a deployment contract; maintained implementation/qualification status belongs to the D0030 Design and exact evidence.

A production implementation must satisfy all of the following before selecting the rename backend:

The repository implementation owns its native source and release build under `native/immutable-journal-publication/` and `tools/build-immutable-journal-publication-helper.mjs`; `npm run build:native:immutable-journal-publication` is the explicit pre-runtime build step for a declared target. A deployment selecting rename must package the generated executable and matching `native/immutable-journal-publication/manifest.json` entry before starting Node. `ImmutableJournalSnapshotStore` selects rename by default only for the declared Android/arm64 package profile; other profiles retain hard-link as the default unless a caller explicitly selects a separately packaged and positively qualified rename backend. The runtime never invokes the compiler.

- provide a package-owned executable for each declared OS/architecture **before runtime publication**; runtime compilation, download, `PATH` lookup, or an experimental FFI/addon fallback is not an accepted installation path;
- bind helper protocol/build identity, Node/runtime identity, filesystem identity/profile, and the selected publication backend into the capability validity key; process restart, helper replacement, or validity-key change requires requalification;
- open the actual writable Case directory in JS and pass only that inherited fd plus generated single-component contender/final basenames; the helper receives no absolute Case path and has no shell, network, config, secret, semantic-read, copy, fallback, or cleanup authority;
- use a dedicated begin/result fd with a finite controller deadline. Failure known before the begin marker may be treated as no-successor; after begin, timeout, kill, abnormal exit, missing/malformed result, or result/status loss is `store_commit_ambiguous` and requires authoritative reread without blind retry;
- fail closed as `store_publication_unsupported` for `ENOSYS`, unsupported-flag/filesystem `EINVAL`, `EACCES`/`EPERM`, missing/mismatched helper identity, wrong final type/bytes, overwrite, or failed required directory durability; no plain-rename/copy/check-then-rename/direct-final/`O_TMPFILE`+link/symlink fallback is allowed;
- run the actual-directory non-authoritative dot-name qualification sequence: exclusive contender creation, complete fixed write, file `fsync`, absent-destination no-replace publication, final regular type/bytes, source disappearance, same device/inode when observable, second contender, existing-destination conflict, unchanged winner, surviving loser, Case-directory `fsync`, cleanup, and cleanup-directory sync;
- preserve committed filename/bytes/schema/replay/migration/downgrade semantics across backend changes.

Concurrent hard-link and rename writers are permitted only on a deployment validity key where both backends are independently qualified together for the same committed bytes/names/replay contract. Qualification evidence from one runtime/filesystem profile is not portable by assertion to another. Without joint qualification, deploy homogeneous writers or use a quiesced/fenced backend switch.

Removal/rollback must also fail closed. A missing or mismatched helper cannot trigger a different publication primitive automatically. Hard-link writing may be re-enabled only where that backend is independently qualified and the homogeneous/mixed-writer rule is satisfied. Ordinary process-crash or directory-fsync fault evidence must not be reported as destructive power-loss qualification; any supported power-loss claim requires its own explicit evidence. A release that selects the rename backend must independently qualify the packaged helper, install path, actual writable filesystem and post-install runtime before claiming deployment support.

### SemanticSqliteStore and SemanticCaseRepository

Use this opt-in local profile only on a Node 22+ runtime that provides `node:sqlite`. `openSemanticSqliteStore(path)` opens the SQLite authority database; `SemanticCaseRepository` uses it for native v3 creation, load/checkpoint/commands, and the bounded v2 -> v3 migration. The database stores immutable typed semantic objects, immutable schema-v3 snapshots, and one mutable per-Case transactional head.

A commit transaction checks the exact predecessor head/revision, inserts objects and snapshot, and updates the head atomically. A possibly committed transaction reports `store_commit_ambiguous`; reopen/reconciliation decides successor versus predecessor versus third-state conflict. The adapter is local source infrastructure, not evidence for network filesystems, Durable Objects, multi-host SQLite, or provider transactions.

### GitProjectionAdapter

D0011's opt-in local profile `tdev.git.text-tree.v1` targets an existing local Git repository and one direct full `refs/heads/...` ref. Qualification of this local profile must exercise real bare SHA-1 and SHA-256 repositories. The adapter uses plumbing commands only, requires no index/worktree, writes exact UTF-8 `100644` content derived from a validated semantic tree, and supplies explicit commit identity/time/message instead of inheriting user Git identity/configuration.

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

| Contract | Selected or required owner shape |
| --- | --- |
| Case graph/lifecycle/results/receipts | one SQLite-backed Case Durable Object hosting the existing D0010/CaseEngine authority — D0019-selected |
| stable Agent route, connection generations, aggregate capacity, non-executable reservation and delivery admission | one durable `AgentDeliveryAuthority` per stable Agent route — D0020-selected; a Cloudflare Durable Object is a viable host only under the qualified immutable route binding below |
| cross-Case target leases | dedicated target owner selected by target identity |
| immutable Artifact bytes | R2 |
| query/locator projection | D1 |
| public ingress/projection | Worker/MCP layer |
| local OS/Git/process effects | authenticated Agent |

This mapping follows the actor-style requirement that one authoritative owner serialize mutations for a fact. D0019 fixes the Case row at the Design layer: CaseDO hosts/adapts the existing authority rather than introducing a second or rewritten semantic owner. Accepted D0020 fixes the Agent owner shape without claiming that a provider host, local Agent installation or deployment has already been qualified. The target/storage/projection rows remain subject to their own responsible owners and accepted Designs when selected. `ROADMAP.md` owns the stable final-MVP capability exits; `PROGRAM.md` and `WORKBOARD.md` own forward-gate coverage and current runnable scheduling.

## 9. Provider adapter requirements

### D0019 placement meta-authority binding

For the current Group F D0019 Revision 2 implementation, the deployment owner binds the already-accepted durable placement-election contract to **one dedicated D1 database** with profile `tdev.case-placement.d1.v1` / schema version `1`. This is a provider binding of the existing D0019 placement owner, not a new Case semantic owner or a new Design-level generation/migration lifecycle. `CaseId` remains the write-once key: an exact placement retry reuses the stored canonical placement record, while any competing placement digest fails closed. There is no update, delete, relocation or re-election path in this binding.

Every Worker deployment/environment context that is permitted to elect within the same Case authority domain must bind `TDEV_CASE_PLACEMENT` to the **same exact D1 database resource**. The checked migration source is `cloudflare/d1/migrations/0001-case-placement.sql`; it creates only the placement profile metadata and canonical `CaseId -> placement` rows. Runtime code does not create or upgrade this schema. The repository intentionally does not invent a Wrangler `database_id`, account, jurisdiction or migration invocation before the actual provider deployment surface is available and independently observed.

This D1 database is a narrow placement meta-authority. It is not the Case semantic head, an Agent delivery queue, or the D1 query/locator projection row described elsewhere in this document. `CaseRuntimeDO.initializeElectedCase()` must reread and match the exact D1-elected placement before invoking the existing `CaseDOAuthority.initializeElectedCase()` boundary. A future move of an existing Case, placement-generation replacement, or reuse of another physical store requires the already-declared migration/cutover authority rather than mutating this write-once row in place.

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

A D0020 Agent delivery deployment must satisfy all of the following before it can be claimed as the selected Agent-backed runtime path:

- before first connection admission, the deployment owner durably commits one immutable `AgentRouteBinding` for the stable `agentId`, with a positive non-reused `routeGeneration` and exact deployment/environment/Worker/class/namespace/jurisdiction/Durable-Object identity; competing writable bindings fail closed;
- expose exactly one writable `AgentDeliveryAuthority` for that route. Revision 1 provides no live route migration, dual-write cutover, storage recreation under a new writable identity or name-based re-election; those are unsupported/fail-closed until a separate accepted cutover contract exists;
- durably preserve the route binding, current connection generation/identity and connect receipt, executor ID/epoch, accepted capacity revision/reported/effective values and reconnect freshness barrier, bounded reservation window/floor plus current-window request details, immutable preflight descriptors, reservations, activated deliveries, Case dispatch-grant bindings, Agent dispatch authorizations/ordinals, admission/physical-slot accounting, delivery evidence high-water/conflict records and compact replay/GC fences;
- treat the local Agent/executor as the producer of physical capacity and execution/cleanup/effect evidence while `AgentDeliveryAuthority` remains the sole durable accepter/writer of effective capacity and delivery dispositions;
- on an actual reconnect, install a new connection generation and admit aggregate capacity as unknown/0 until a strictly fresher capacity revision for the retained executor tuple arrives; executor replacement also starts unknown/0. Delayed predecessor capacity or stale sockets remain fenced. Ordinary Durable Object reconstruction or WebSocket hibernation recovery of the same healthy logical connection must not synthesize a new connection generation;
- reserve one aggregate capacity unit from the immutable preflight descriptor before Case Attempt creation; saturation, freshness denial or known bounds failure creates no running Attempt, semantic retry or durable waiting Task queue;
- require the exact durable D0019 `running` Attempt/fence, exact non-executable delivery activation, exact Case `grant_attempt_dispatch` receipt and exact grant-bound Agent authorization before any first physical send. Case cancellation and grant ordering remain CaseDO semantic serialization; connection/delivery/capacity stay with `AgentDeliveryAuthority`;
- make reserve/activate/grant/authorization/evidence/result response loss idempotent under stable identities and authoritative reread. Reconnect or transport loss alone never authorizes a second semantic Attempt or blind replay; a later dispatch ordinal still needs D0020's positive no-start/no-handle or accepted effect-idempotency proof plus a fresh Case grant and Agent authorization;
- distinguish transport acknowledgement, physical start/completion, physical cleanup and external-effect evidence. Positive cleanup/no-handle may release the physical slot while bounded effect/result uncertainty remains durable for Case reconciliation; disconnect/timeout/cancellation alone never releases a live physical resource;
- use the bounded reservation-window generation/floor and the other connection/capacity/delivery high-water fences so tombstone/detail GC cannot make an ancient request new again; overflow or an undrainable bounded window fails new admission rather than retaining unbounded history;
- authenticate the Agent principal before externally reachable connection/message/evidence/result admission and bind it to the exact supported Agent route/generation; identifiers, grant IDs and fencing values are not credentials;
- preserve rollback compatibility with route/connection/capacity/evidence/grant/replay-floor state. Older code that ignores those facts cannot be activated while live reservations, admission holds, physical slots, unresolved deliveries/effects or replay fences still matter; deletion/recreation of provider storage is not rollback.

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

Ordinary Tasks must not update the Git index, worktree, branch, or remote ref. D0011 defines local object/tree/commit construction and one local branch-ref CAS/reconciliation/rollback lane; D0012 adds the separate `tdev.git.remote-existing-branch.v1` external-effect adapter for an already locally elected candidate and existing remote branch. Git OIDs and remote refs remain derived publication identities. D0012 binds one effective push target into an immutable intent, uses exact predecessor remote fencing, rereads uncertain outcomes, and never creates/deletes a remote branch or bypasses provider policy.

## 11. Environment and configuration

No environment variable is required by the source core. D0011, D0012 and D0013/D0014 strip inherited `GIT_*` routing before invoking Git. D0012 sets `GIT_TERMINAL_PROMPT=0`, accepts no credential argument, and relies on an already configured deployment credential helper or SSH agent when authentication is required. D0013 takes trusted local repository path, Git executable, subprocess executable/argv/environment/cwd and timeout as constructor/deployment configuration; Task input cannot choose them, and the local subprocess environment is explicit rather than inherited. D0014 additionally accepts only bounded instance-local context-cache configuration (`false` or finite `maxEntries`/`maxBytes`). D0017 adds no environment/configuration key and no persistent content-store binding: its selected packed/hybrid carrier is executor-memory-only, while product-visible logical references exclude repository paths, temporary/worktree/cache/store locators and credentials. Mutable deployment configuration remains outside Plan/result/semantic digests; the D0012 intent persists only a digest of the effective push target, and repository/model observations persist no repository path/executable/environment/file contents.

Secrets must not be stored in Task input, evidence, receipts, snapshots, remote intents, model observations, or clear embedded Git URLs without a separate encrypted-secret design.

## 12. Deployment qualification boundary

`QUALIFICATION.md` owns proof-layer classification and the rule that a lower-layer result cannot be promoted into a higher-layer claim. This deployment owner adds only the deployment-specific observation requirements: exercise the selected real provider resources, restart/response-loss behavior, bindings/routes, every supported migration, observability/recovery path, rollback/revocation barrier, and the target environment actually being claimed.

Resolve maintained Design lifecycle/revision from the Design owner, runnable work from `WORKBOARD.md`, stable final-MVP exits from `ROADMAP.md`, and observed source/provider/runtime results from exact evidence records.

D0017 changes no persisted Case/Plan semantic-state schema and introduces no durable context state, so it requires no data migration. Software rollback is deployment of the pre-D0017 D0013/D0014 full-inline implementation; because Case/Plan semantic authority and persisted schema are unchanged, that rollback requires no context-data conversion. A live `context_reference_unauthorized`, stale, missing, corrupt or limit-exceeded request must **not** silently fall back to inline delivery; per-request fallback is not rollback.

D0018 defines the trusted-local deployment profile as the existing Node 22+ host with bounded D0014 preparation reuse and one fresh local model process group per Attempt; no external provider/session or same-model-process pool is selected. The C1-C4 runtime contract adds only transient live-control/Event-observation state and exact checkpoint/capacity ordering, with no durable schema or data migration. Software rollback is data-compatible but reintroduces the known cancellation/checkpoint/runtime-slot defects and is therefore an emergency compatibility rollback, not equivalent liveness behavior.

## 13. Release checklist

Before cutting a source artifact, run the complete current baseline source gate from `QUALIFICATION.md` and the exact additional Design/provider/deployment gates applicable to the release. Do not copy those source commands or method rows into this checklist.

For a Git checkout, independently inspect repository cleanliness/publication preconditions required by the development workflow. Archive-only validation may omit `.git`, but that does not waive checkout publication gates when Git state is part of the release path. Confirm that no generated/cache/runtime directory or secret material is included in a development artifact.

Run `npm run bench` only when the affected release claims or investigates the corresponding performance path. Benchmark timing is observational evidence with its workload/environment identity; it has no implicit production SLO or generic pass/fail threshold.
