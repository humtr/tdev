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
| current Agent installation/credential/package activation/trust/lifecycle/genesis state and first-emission admission | D0027 security/admission substate in that same per-route `AgentDeliveryAuthority`; concrete secret/trust/package realization remains deployment-owned evidence and cannot self-elect current authority |
| cross-Case target leases | dedicated target owner selected by target identity |
| immutable Artifact bytes | R2 |
| query/locator projection | D1 |
| public ingress/projection | Worker/MCP layer |
| local OS/Git/process effects | authenticated Agent; D0027 admitted process/resource work is owned by the package execution supervisor plus per-operation warden, with live pidfd authority for destructive process control |

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
- expose exactly one writable `AgentDeliveryAuthority` for that route. D0020 provides no live route migration, dual-write cutover, storage recreation under a new writable identity or name-based re-election; those are unsupported/fail-closed until a separate accepted cutover contract exists;
- durably preserve the route binding, current logical connection generation/identity and connect receipt, current non-reused physical socket incarnation, executor ID/epoch, accepted capacity revision/reported/effective values and reconnect freshness barrier, bounded reservation window/floor plus current-window request details, immutable preflight descriptors, reservations, activated deliveries, Case dispatch-grant bindings, Agent dispatch authorizations/ordinals, admission/physical-slot accounting, delivery evidence high-water/conflict records, terminal-delivery tombstones/high-water and compact replay/GC fences; version and losslessly migrate the durable Agent-delivery snapshot rather than silently discarding Revision-1 uncertainty;
- treat the local Agent/executor as the producer of physical capacity and execution/cleanup/effect evidence while `AgentDeliveryAuthority` remains the sole durable accepter/writer of effective capacity and delivery dispositions;
- on an actual reconnect, install a new logical connection generation and admit aggregate capacity as unknown/0 until a strictly fresher capacity revision for the retained executor tuple arrives; executor replacement also starts unknown/0. Exact replay of one lost connect response instead keeps the logical receipt/epoch and atomically installs a fresh physical socket incarnation before the predecessor can be considered current. Delayed predecessor capacity or a superseded incarnation's close/message/error remains fenced. Ordinary Durable Object reconstruction or WebSocket hibernation recovery of the same healthy logical connection restores the durable incarnation and must not synthesize a new logical generation;
- reserve one aggregate capacity unit from the immutable preflight descriptor before Case Attempt creation; saturation, freshness denial or known bounds failure creates no running Attempt, semantic retry or durable waiting Task queue;
- require the exact durable D0019 `running` Attempt/fence, exact non-executable delivery activation, exact Case `grant_attempt_dispatch` receipt and exact grant-bound Agent authorization before any first physical send. Case cancellation and grant ordering remain CaseDO semantic serialization; connection/delivery/capacity stay with `AgentDeliveryAuthority`;
- make reserve/activate/grant/authorization/evidence/result response loss idempotent under stable identities and authoritative reread. Reconnect or transport loss alone never authorizes a second semantic Attempt or blind replay; a later dispatch ordinal still needs D0020's positive no-start/no-handle or accepted effect-idempotency proof plus a fresh Case grant and Agent authorization;
- distinguish transport acknowledgement, physical start/completion, physical cleanup and external-effect evidence. Historical `not_started`/`no_handle` releases a slot only from positive proof that the selected resource was never created. Once a resource exists, including a post-spawn/pre-return failure, the slot remains held until positive `cleanup_complete` establishes disappearance while bounded effect/result uncertainty remains durable for Case reconciliation; disconnect/timeout/cancellation alone never releases a live physical resource;
- treat `maxDeliveries` as a bound on detailed live/recent delivery state rather than lifetime completions. Retire only positively released delivery detail with the exact D0020 non-resurrection proof, atomically replace it by a separately bounded terminal tombstone/high-water, and GC that tombstone only after its reservation generation is permanently below `minimumAcceptedReservationWindow` and replay grace has elapsed. Tombstoned or fully GC'd delivery/evidence/result observations remain stale/non-creating; safe retirement plus window rollover must permit fresh admission beyond historical `maxDeliveries`, while an unsafe/undrainable bound fails new admission rather than deleting uncertainty or retaining unbounded history;
- authenticate the Agent principal before externally reachable connection/message/evidence/result admission and bind it to the exact supported Agent route/generation; identifiers, grant IDs and fencing values are not credentials;
- preserve rollback compatibility with route/logical-connection/physical-incarnation/capacity/evidence/grant/terminal-tombstone/replay-floor state. Older code that ignores the Revision-2 durable incarnation or terminal-retirement shape cannot be activated after such state exists unless the route is first drained/fenced into an explicitly compatible state; live reservations, admission holds, physical slots, unresolved deliveries/effects or replay fences forbid guessing. Deletion/recreation of provider storage is not rollback.

An accepted D0027 installable-Agent deployment must preserve all of the following before any corresponding source/provider/runtime claim is made:

- a supported fresh machine obtains one provenance-bound package and trust inputs without requiring a tdev checkout, tmcp Task/worktree state, ambient developer `PATH`, runtime compilation/download of an unbound helper or model-visible secrets;
- first registration is one independently authenticated stable request against the exact D0020 route and the D0027 non-executable `UNREGISTERED -> GENESIS_PENDING -> CURRENT` state machine. The existing per-route `AgentDeliveryAuthority` is the sole runtime elector; local files, package/service presence, credential readiness or trust material never self-elect current authority;
- concrete management mutation uses canonical route-generation-scoped `m2:<seq>` independent of lifecycle/package/trust/install generations. The same `AgentDeliveryAuthority` admits only `managementRequestSequenceHighWater + 1`, burns that sequence with first durable transaction admission, keeps one request/intent/original predecessor across every internal multi-phase lifecycle step, and permanently treats compacted sequences at or below the durable floor as stale/non-creating;
- one admitted genesis request fixes fresh non-reused candidate installation, trust, package activation/manifest, credential and initial lifecycle identities. Bootstrap trust, package verification, verifier-ready plus local-ready credential evidence and local service readiness remain bound to that exact pending identity until atomic `initial_activate`; ordinary base `start` is restart-only;
- concrete credential and trust material provisioning, package distribution and provider/operator wiring remain deployment-owned realization of SECURITY-owned policy. Secret bytes stay outside semantic state, repository/evidence/model-visible data and package manifests; copied predecessor credentials/package/journal state cannot become current without the accepted clone-safe election and fresh generations;
- every executable dispatch uses the D0027 one-shot first-emission admission at the same `AgentDeliveryAuthority`: the complete current D0027 plus D0020 tuple is revalidated/serialized through immediate physical-send initiation, so no transferable permit survives a later trust/lifecycle/socket/executor fence;
- admitted process/resource work uses a package-owned long-lived execution supervisor and one warden per operation. PREPARED precedes process creation, ACTIVE and GO_ALLOWED are durable before execution, the live pidfd plus live warden-owned process group is the only destructive process-control authority, and stored PID/PGID/path/name metadata is non-destructive provenance only;
- predecessor physical ambiguity is positively resolved before successor executable activation. For a D0020-only held predecessor slot, the retained D0020 route plus `deliveryId`/executor/evidence fence is the Section-9.5-equivalent cleanup-domain identity; only admitted positive proof may release that exact matching slot. If its locator/evidence cannot be safely retained or produced, capacity stays held and `initial_activate` remains blocked;
- stop, restart, credential rotation, package update/rollback, reinstall/replacement and uninstall preserve non-reused installation/credential/package/trust/lifecycle generations, stable-request replay, crash reconciliation and deletion barriers. Base stop elects draining before quiescence; base start requires that exact completed restart-eligible stop drain; uninstall owns a newer drain before final revocation and payload deletion;
- the outer Agent-delivery durable snapshot remains schema 3 while the nested installable-Agent admission state is explicitly versioned to v2 and requires `managementRequestSequenceHighWater`. Exact v1 `LEGACY_D0020_ONLY` may remain until D0027-aware cutover creates v2 `UNREGISTERED` with floor 0. A terminal v1 D0027-aware predecessor may migrate only without a nonterminal genesis/management transaction and only by preserving retained request detail while importing the maximum surviving canonical `m2` sequence; malformed/noncanonical/unknown or nonterminal predecessors fail closed. The first persisted nested-v2 D0027-aware state is the rollback barrier, and no automatic v2-to-v1 downgrade is defined;
- source/static, local-machine, provider/security, migration/rollback and deployed-product evidence remain separate. Acceptance or owner synchronization does not assert that package installation, credentials, provider resources or runtime behavior already exist.

A target-claim adapter must:

- route all conflicting target identities to one canonical lease owner;
- persist generation and active lease atomically;
- validate lease currency at result commit;
- define liveness/expiry without weakening fencing;
- avoid storing duplicate Case lifecycle state.

### D0039 Revision-3 qualification deployment contract

Accepted D0039@r3 separates repository publication from deployed qualification identity. Live qualification binds `S` (exact Q1-qualified source), `A` (exact build/release artifact and manifest from S), `V` (one immutable provider Worker version binding S/A), and `R` (the active provider route/runtime identity: account/service, deployment/config epoch, 100-percent state-changing traffic ownership, route, namespace/class/jurisdiction, Durable Object and route-current verifier bindings). Admission is `S -> A -> V -> deployment/cutover -> 100-percent writer -> provider readback -> route-owner readback -> exact S/A/V/R join`. Git publication, a source SHA, artifact digest, Worker version, route or route-owner self-report proves only its own layer.

Before any qualification credential/token is transmitted, the endpoint origin must be derived from and match the admitted provider route. Provider active-version identity, route-owner runtime version and the deployment/config epoch must agree in one stable observation; mixed/canary state-changing writers and cross-epoch joins fail closed. The deployment-admission portion of Q5 is therefore a prerequisite for Q2 and every state-changing live qualification gate.

The deployed Revision-3 mutation surface uses `tdev.installable-agent-qualification-rpc.v2` and carries the same immutable `expectedDeploymentIdentityDigest` over admitted S/A/V/R as the deployed runtime binding. Authentication and strict parsing occur first; the exact server-observable deployment identity is then checked before every product mutation. Old RPC/bootstrap profiles cannot silently downgrade into Revision-3 terminal proof.

Concrete durable storage/binding for `tdev.installable-agent-qualification-run.v1` and `tdev.installable-agent-qualification-claim.v1` is deployment-owned realization of the semantic protocol in `QUALIFICATION.md`, not a new product owner. The selected backing must durably preserve PREPARED-before-dispatch, strict predecessor-record CAS, monotonically non-reused run/claim generations, deterministic all-or-none shared-read/exclusive-mutation claims, restart enumeration, reconciliation obligations, cleanup state, retained tombstones/generation high-water and fail-closed corruption/loss behavior. Restart reconciliation precedes progress or resource release.

Deployment admits exactly one qualification mutation controller per live mutation lane and provides no automatic live-takeover mechanism. Timeout/expiry/disconnect/process disappearance/CAS failure/new generation alone cannot transfer effect rights or free resources. Positive predecessor exclusion/quiescence recorded by the QUALIFICATION-owned protocol is required before successor effects or reuse. The first durable Revision-3 run/claim v1 material is a tooling rollback barrier; tooling that does not understand that fence cannot resume the campaign or recreate its coordination state as if fresh.

The bootstrap executor/runtime plus the profile-specific primitive that proves verified bytes are the executed bytes are deployment prerequisites for Q4. If concrete realization of any of these requirements would introduce an independent public/durable effect-admission authority, a second product-current registry, a materially different owner model or an independently decidable migration/cutover, stop and return through `SDD.md` rather than adding it as deployment detail.

### D0039 Revision-4 workers.dev qualification deployment contract

Revision 4 preserves `S -> A -> V -> deployment/cutover -> 100-percent writer -> provider readback -> route-owner readback -> exact join`, but R no longer requires a Zone. R binds account/service/deployment epoch, one active Worker version at 100 percent state-changing traffic, fresh account workers.dev subdomain, exact `<worker>.<subdomain>.workers.dev` hostname, `enabled=true`, `previews_enabled=false`, Durable Object namespace/class/jurisdiction, exact route-current Durable Object identity and public verifier bindings.

Provider admission reads the account and target-Worker subdomain APIs before route-owner qualification. Missing/changed subdomain, disabled workers.dev, enabled previews, origin mismatch, redirect, mixed active versions, ambiguous namespace/class or provider/route-owner identity drift blocks admission. Revision-3 route ID/pattern bindings are absent from deployment identity v2 and cannot authorize Revision-4 mutation.

Provider/deploy requires effective `Workers Scripts Write` on the exact account; a separate IAM observer uses the appropriate API-token-read namespace. Secret values remain excluded. Every provider mutation still requires the Revision-3 PREPARED run/claim fence and exact target; ambiguous provider effects reconcile by authoritative reread, never by a guessed retry or takeover.

### D0039 Revision-5 provider-generated-version deployment fence

Revision 5 corrects only what the first provider mutation can bind before dispatch. Cloudflare creates the immutable Worker version after upload, so provider deployment uses strict `tdev.installable-agent-qualification-deployment-intent.v1` rather than pretending V/R are pre-known. The intent binds exact S/A, account/service, deployment/environment/epoch, fresh workers.dev subdomain and desired exact origin, required ingress settings, intended Worker/namespace/class/jurisdiction bindings, immutable deployment-binding digest and the digest of the exact pre-dispatch provider predecessor snapshot. It contains no invented provider-generated identity.

Durable coordination for this meaning is `tdev.installable-agent-qualification-run.v2` in `tdev.installable-agent-qualification-store.v2`; claim-v1 resource/generation meaning is preserved. Before the provider effect, the exact intent, stable mutation identity, authoritative reread identity, global mutation lane and exact provider-resource claims are PREPARED. DISPATCH precedes the network effect. Unknown outcomes remain RECONCILING and retain claims/controller ownership until authoritative provider reread proves not-admitted/applied/conflict; timeout or a new version/request never permits guessed retry or takeover.

A returned upload version is not itself admission evidence. Provider readback must establish the generated V and exact intended S/A/configuration, followed by 100-percent writer, workers.dev, namespace/class and route-owner readback. Only then is final `tdev.installable-agent-qualification-deployment.v2` formed and allowed to fence Q2 or state-changing product/device qualification.

Store v1 bytes are not reinterpreted. A v1 store with surviving nonterminal run/controller/claim blocks v2 migration. Any supported quiescent migration must preserve genesis provenance, tombstones and controller/claim high-water/replay barriers; otherwise deployment remains blocked. Tooling that understands only v1 cannot resume v2 state and there is no automatic downgrade.

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

### D0039 Revision-6 provider/bootstrap/re-admission deployment fence

Revision 6 splits deployment realization into provider substrate, bounded route bootstrap and final/repeated route-bound admission. Provider substrate is established by deployment-intent plus authoritative provider V/100-percent/IAM readback. The exact route bootstrap target contains the provider-applied S/A/V/configuration observation plus an authoritative exact UNREGISTERED route predecessor and stable bootstrap transaction identity; it authorizes only the D0027 genesis transaction family needed to reach or fail CURRENT safely. It is not a product-current identity and cannot fence ordinary Q7-Q9 mutation.

Final `tdev.installable-agent-qualification-deployment.v2` is constructed only after CURRENT exists. It is epoch-bound: any Q7/Q8/Q9 mutation that changes provider/route/package/trust/credential/lifecycle fields invalidates the prior admission and requires fresh provider + route-owner readback before the next dependent state-changing operation. R5 V is preserved as the exact provider predecessor/falsifier. The retained R5 provider-deploy run may be reconciled/cleaned as an applied provider operation only; it is never replayed and never renamed into R6 Q5. After R6 Q1, any S6/A6 provider update is a new mutation identity against a fresh predecessor snapshot.

Run/store v3 may start only after exact v2 state is positively quiescent and its migration preserves provenance, tombstones and controller/resource generation high-water. Unknown/ambiguous provider or route-bootstrap outcomes retain claims and block retry/takeover.

### D0039 Revision-7 fresh-bootstrap execution inputs

Deployment owns the concrete authenticated operator channel and independently supplied bootstrap executor/runtime locator for Q4; release/candidate transport does not. The current R7 product contract admits only capsule-v2/execution-v1. Capsule v1 is historical and has no automatic migration or terminal rollback path. The independently authenticated operator digest must be fixed before the untrusted capsule/verifier/archive transport is consulted and may not be derived from that transport, its repository object, CDN/GitHub metadata or a candidate-produced evidence file.

The bootstrap executor observes an absolute/stable Android/arm64 Node runtime identity, hashes the complete runtime executable, and uses a platform-qualified stable-handle/immutable-staging execution primitive so the bytes hashed are the bytes executed. The verifier runs with zero inherited environment, a new private empty working directory and only the exact capsule-authorized builtin closure. OS/process/filesystem/executor identity is recorded as environmental TCB evidence; it is not silently elevated into a product trust anchor. Missing independent operator authentication, unsupported stable-handle execution, cleanup ambiguity or execution-closure mismatch leaves Q4 blocked before installation/current election.

### D0039 Revision-8 route-bootstrap deployment realization

The qualification Worker must construct the route-bootstrap target from the exact provider-applied S/A/manifest/V/account/service/epoch/origin/workers.dev/namespace/class/jurisdiction binding and a fresh route-owner read. The read must prove `UNREGISTERED`, null `currentTuple` and null `currentTupleDigest`, and the target must bind predecessor/high-water/readback digests plus a stable route-bootstrap transaction identity. Exactly six D0027 genesis operations may use this pre-admission target; every ordinary state-changing RPC retains the admitted-deployment identity fence. `ingressKind` remains a deployment configuration check but is not copied into the R6 target schema.

The deployed host wires an asynchronous Ed25519 verifier for `tdev.installable-agent-evidence-envelope.v1` using the route-persisted release-root public key and `tdev.installable-agent-evidence.v1` domain. It recomputes the key ID and compares the canonical evidence context before signature verification. No callback or no release-root key is a hard fail; there is no permissive production fallback. Evidence is verified before D0027 CAS and proof/private-key bytes are not persisted as new authority.

R8 source work itself performs no provider or route mutation. A deployment attempt must be a new exact S/A/V observation with the current R7 provider version retained as rollback boundary; ambiguous publication/readback retains claims and blocks retry/takeover. A deployed route-bootstrap pass still does not close Q4: the independent operator capsule-v2 channel and executed-bootstrap observation remain required before terminal Q4, and Q5-R0/Q2-Q10 cannot run until CURRENT and final S/A/V/R admission exist.

### D0039 Revision-9 deployment boundary

R9's source and Design acceptance phase performs no provider, route, device or product mutation. Its phase-P target is constructed from a fresh authoritative D0027 `GENESIS_PENDING` read and exact provider/runtime/route binding; it is not a replacement route owner and cannot create or elect pending/CURRENT state. The target separately carries the original `UNREGISTERED` predecessor, D0027 pending identity and current pending readback digest.

Live Q6-B may use the phase-P fence only after a new exact S/A/V/provider/route admission and the required Q4/Q5 predecessor gates authorize the operation. Exact original register response-loss replay may be reconciled; changed or competing register identities remain denied. A source/test pass does not promote Q4, Q5-R0, Q6-B, later DAG, deployment, migration or rollback evidence. Existing Q4 evidence is retained only after explicit invalidation analysis of its capsule/runtime/verifier/archive identities.

The source-level adapter `qualification/installable-agent-r9-phase-driver.mjs`
provides an owner-preserving implementation seam for this boundary. It binds
only an already-authorized RPC callback and separate opaque management and
release-root Ed25519 signer handles. The adapter derives phase-U/P targets from
fresh route reads, forwards no private key or token bytes, and never supplies a
generic credential broker, a new route/effect authority or a blind retry path.
Its `createR9QualificationRpc` helper may bind the existing
`/qualification/d0020/v2` endpoint through a token-provider callback, but fixes
the exact credential-free workers.dev origin, permits only the bounded R9
operation set, and performs no retry. The adapter itself is not a live
deployment or Q6-B observation; concrete deployment wiring must remain
deployment-owned and must satisfy the existing signer-custody and
provider-admission contract.

### D0039 Revision-10 owner-corrected deployment boundary

R10 keeps the concrete D0027 deployment target and exact provider/route readback rules, but no longer requires deployment to expose the offline release-root signing capability to the live genesis-evidence path. The production route owner still receives only a proof plus an injected verifier result; proof verification completes before CAS and failure is zero-effect. The concrete proof producer/verifier is deployment-owned and must already be authorized for the evidence purpose without adding a new custody, trust, route or effect owner. R10 acceptance/source work provisions no new signer, secret, broker or provider resource.

The optional phase driver is non-product sequencing. It may bind an authorized RPC callback, the existing management-signing capability and already-produced opaque evidence proofs. It must not obtain credentials, call the offline release root to manufacture evidence, choose a signer authority, retry an ambiguous effect or own recovery. The workers.dev helper remains optional endpoint-bound transport only.

Historical qualification run/store/claim/controller and provider-intent/version machinery is not a D0027 deployment compatibility requirement under R10. Historical records remain evidence. Any future bounded qualification reuse must positively admit its exact predecessor state; a reusable durable qualification control-plane or its own migration/cutover requires a separate accepted Design. Before any future live phase-U, reread the exact published R10 S/A/provider/route and establish Q4 plus the authorized evidence-proof path; prior R9 provider/readback evidence is historical and cannot be a standing mutation ticket.

### D0040 Revision-1 evidence-attestation deployment boundary

A deployment that accepts D0027 installable-Agent evidence must configure one D0040 Ed25519 attestor public key/ID in the injected evidence verifier and bind that exact public identity into the immutable deployment/runtime configuration observed by provider admission. The key is not stored in D0027 route/current state and introduces no D0027 state-schema migration. Missing verifier configuration, missing public key, key-ID mismatch, v1/v2 profile confusion, canonical-context mismatch or signature failure must deny before D0027 CAS.

Private attestor bytes are held only by a dedicated secret-preserving deployment/operator capability. The deployment must not place them in Worker/DO bindings readable as ordinary application data, Agent package/state, repository/evidence, Task input/results, command-line arguments, logs or model-visible environment. The producer endpoint/interface is domain- and schema-restricted to D0040 evidence attestation; it is not a general-purpose Ed25519 signing broker and cannot sign a caller-provided digest without the evidence-specific authoritative observation required by the responsible qualification/deployment method.

The deployment public identity and the private producer role remain distinct. Cloudflare/provider authentication, management signing, offline release-root/delegated release signing, Agent AndroidKeyStore possession and Q4 operator authentication cannot substitute for D0040. Changing the attestor public identity is a deployment/configuration replacement that invalidates dependent S/A/V/provider/runtime admission evidence and requires fresh readback before later D0039 state-changing qualification; it is not an in-place D0027 trust mutation.

D0040 source qualification proves only envelope/key/context/denial semantics. A deployed D0040 claim additionally requires secret-preserving producer/custody evidence, evidence-specific observation provenance and provider/runtime readback of the exact public verifier identity. D0039 then composes that deployed proof with its independently required fresh Q4 and provider/route admission; D0040 alone never authorizes phase-U/P.
