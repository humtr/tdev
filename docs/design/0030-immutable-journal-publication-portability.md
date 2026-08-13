# Design 0030 — Immutable Journal Publication Portability

- Status: `draft`
- Class: 2
- Capability Groups: B/F — semantic authority and persistence / active runtime portability
- Active cumulative lineage: `group/f-cloudflare-runtime`
- Authority anchor reviewed: `151aed9ffdb86fd3967b8ab7ecfd012e884a0e3e`
- Completed predecessor checkpoint: Group E `cp_1786580384438_9ed881e039da` at the same exact SHA
- Prior evidence Task: `task_6ni_625838d8a0`
- Prior evidence checkpoint: `cp_1786581036451_bed7284b8070`
- Inherited Designs: D0005 immutable expected-revision journal CAS, D0007 verified materialization reuse, D0008 durability admission; D0010 v3 SQLite authority remains a separate opt-in profile
- Affected normative owners after acceptance: `docs/PROTOCOL.md`, `docs/ARCHITECTURE.md`, `docs/OPERATIONS.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/MVP.md`; `docs/SPEC.md` only if accepted support scope changes
- Planning owner: `docs/development/PROGRAM.md`
- Research evidence: `docs/evidence/group-f-d0030-immutable-publication-portability-research-2026-08-13.json`

> This draft records a surviving semantic decision but does **not** authorize production source changes. In particular it does not authorize replacing `fs.link`, adding a native dependency/helper, changing the journal format, or weakening the existing immutable-journal test matrix. Acceptance remains blocked on the integration and independent-qualification gates in section 15.

## 1. One-line definition

Preserve the D0005 immutable-journal durable format and commit meaning behind a backend-neutral **prewritten regular file -> file fsync -> atomic no-replace regular-file publication -> Case-directory fsync** contract, retain the existing hard-link backend where it is independently qualified, and prefer same-directory `renameat2(..., RENAME_NOREPLACE)` as the second backend only after the exact runtime/filesystem/integration route is positively qualified; otherwise fail closed.

## 2. Evidence classification

### 2.1 Current repository facts

At the reviewed F anchor, `ImmutableJournalSnapshotStore` creates a unique dot-prefixed temporary regular file exclusively, writes canonical bytes, fsyncs the file, hard-links that already-written inode into the authoritative final pathname without replacement, fsyncs the Case directory, and only then returns success. `EEXIST` is publication conflict. Failure after final publication but before successful Case-directory sync is `store_commit_ambiguous`. Temporary cleanup after the commit boundary is best-effort.

Committed journal authority remains ordinary regular files: `base.json`, legacy `delta-<to>.json` where admitted by the migration rules, and immutable-v2 `delta-from-<from>.json`. Dot-prefixed temporary files are not authority. The reader rejects recognized committed names that are non-regular, malformed names, noncanonical bytes, gaps, forks, source/target digest mismatch, unsupported schema, invalid migration order, and missing base authority. D0007 cache reuse still begins with strict committed-namespace and exact-byte observation and cannot hide those failures.

The repository minimum runtime is Node `>=22`. There is no current native-addon/helper build or runtime dependency in `package.json`. Public Node `fs.rename` is not used as the D0005 no-replace primitive because its replacement semantics differ from D0005.

Group E was independently checkpointed at `151aed9ffdb86fd3967b8ab7ecfd012e884a0e3e`; `group/f-cloudflare-runtime` was then created from that exact SHA with no intervening commit. Group E is provenance only for this Design and is not reopened.

### 2.2 Measured connected-device evidence

The prior evidence Task measured Node `v26.4.0`, Android/Linux kernel `6.1.145-android14-11-33419968-abS928NKSS6DZG1` on aarch64, F2FS for the Job-private probe directory, and SELinux process domain `u:r:untrusted_app_27:s0:c123,c257,c512,c768`.

Direct `linkat(2)` returned `EACCES`. This independently falsifies the theory that only Node's `fs.link` wrapper is failing on that device.

For a same-directory prewritten/fsynced regular temporary file, direct `renameat2(..., RENAME_NOREPLACE)` to an absent final name succeeded. The successful final file had the same device and inode as the pre-publication temporary file, the temporary pathname disappeared, the bytes remained exactly the prewritten payload, and a subsequent Case-directory fsync succeeded. A second contender targeting the existing final name returned `EEXIST`, left the contender present, and did not change winner bytes.

A 25-round independent contender race produced `25/25` exact-one-winner outcomes with no bad final value. A preexisting final symlink also produced `EEXIST`; neither the symlink nor contender was overwritten.

Plain Node rename overwrote a preexisting destination. Direct exclusive creation of an authoritative final name made that final pathname visible at size zero before payload write/fsync. `O_TMPFILE` creation did not solve publication on this Android profile: publication through `/proc/self/fd/<fd>` plus `linkat(..., AT_SYMLINK_FOLLOW)` returned `EACCES` and created no final name.

Naive symlink publication changed the authoritative slot from a regular file into an indirection: ordinary read followed the target, target mutation changed bytes observed through the already-published slot, target deletion left a dangling authoritative name, and an unconstrained `../` target escaped the intended object namespace.

A stronger content-addressed-object/symlink prototype showed that a new protocol can fail closed on object digest mutation, target grammar escape, missing object, and symlink object traversal. That is technical feasibility evidence for a different durable format, not equivalence to D0005.

### 2.3 External primary-source engineering facts

Linux `renameat2` defines `RENAME_NOREPLACE` as refusing to overwrite an existing destination and returning `EEXIST` when that flag encounters an existing new path. The flag requires support from the underlying filesystem; an unsupported flag/filesystem can return `EINVAL`. `renameat2` is Linux-specific, so syscall presence alone is not filesystem qualification.

Linux `fsync(2)` documents that syncing a file does not necessarily make the containing directory entry durable; an explicit fsync on the containing directory is required for that layer.

Current Android AOSP sepolicy contains a `neverallow` prohibiting all untrusted apps from hard-linking files and explains the hard-link security rationale. Current bionic headers expose `RENAME_NOREPLACE` and `renameat2`, with the libc wrapper introduced at Android API 30. Neither fact proves one arbitrary Android filesystem/security profile supports the requested rename flag.

Current public Node `fs.rename` overwrites an existing destination. Current public libuv `uv_fs_rename` is equivalent to `rename(2)` and exposes no `RENAME_NOREPLACE` flag parameter.

Node-API is a stable public native-addon ABI. Node `child_process.spawn` can run without a shell, supports bounded process control, and can share a positive parent file descriptor with the child. Node 26.1 added public `node:ffi`, but that API is Stability 1 Experimental, requires an FFI-enabled Node build and `--experimental-ffi`, and the current FFI documentation exposes no direct stable errno helper. The repository minimum remains Node 22, so `node:ffi` cannot be the baseline D0030 integration route without a separate runtime/support decision.

F2FS documents multiple `fsync_mode` policies (`posix`, `strict`, `nobarrier`). Therefore one Samsung/F2FS result is not a universal F2FS or Android durability qualification.

### 2.4 Inferences and draft decisions

The store's required semantic primitive is not “hard link” itself. It is atomic no-replace publication of a complete, already-fsynced regular-file inode into an authoritative slot, followed by directory durability, with conflict and ambiguous-outcome handling that force reread rather than replay.

On the measured local profile, same-directory `RENAME_NOREPLACE` preserves that semantic boundary more closely than every tested alternative while preserving the existing final regular-file format. Its success-path housekeeping differs from hard-link publication because successful rename removes the temporary pathname instead of leaving a second link to unlink, but that difference is outside authoritative format and outcome.

`RENAME_NOREPLACE` is therefore the preferred second backend candidate. This does **not** imply universal Linux, Android, F2FS, or Node qualification.

The Node/native integration mechanism is not yet selected. A narrowly owned native helper is the leading next falsifier because it can isolate native faults and use an already-open Case-directory fd plus generated basenames, while a Node-API addon is the stable in-process comparator. Public Node/libuv rename is semantically insufficient. Experimental Node FFI is not selected as product authority for this Node-22-minimum repository.

### 2.5 Unknown / unverified

- production-shaped native helper versus Node-API addon selection;
- fresh-install/build/package availability for the selected native route on supported Termux/Android and independent POSIX environments;
- exact helper deadline/status-loss behavior and the resulting ambiguity mapping;
- mixed concurrent hard-link and rename-backend winner election on an independently qualified POSIX plane;
- independent Ubuntu/POSIX `RENAME_NOREPLACE` backend qualification against the repository oracle;
- current-device F2FS mount-option identity for a durability claim;
- sudden power-loss durability on the target Android/storage profile;
- universal support outside explicitly qualified runtime/filesystem profiles.

## 3. Current contract and concrete portability problem

The inherited D0005 contract is:

```text
unique same-directory dot temp regular file
  -> complete canonical bytes
  -> file fsync
  -> atomic no-replace authoritative final publication
  -> Case-directory fsync
  -> success
```

Outcome classes are:

```text
known failure before final publication
  -> no successor / write failure

existing final name
  -> publication conflict
  -> reread authoritative state
  -> normal CAS conflict or fail-closed corruption/type error

publication may have succeeded but durability/result is uncertain
  -> store_commit_ambiguous
  -> mandatory reread/reconciliation
  -> never blind replay

successful final publication + successful directory fsync
  -> committed successor
  -> later temp cleanup cannot reverse success
```

The connected Android/Termux security domain denies hard links. The current production primitive therefore cannot satisfy the store contract on that platform even though the rest of the supported-Termux source/runtime profile is qualified. Replacing the hard link with an operation that overwrites, exposes an incomplete final file, creates a symlink authority slot, or hides a check-then-act race would make the platform green by changing the contract and is rejected.

## 4. Backend-neutral publication contract

Every accepted D0005-compatible publication backend must satisfy all of the following:

1. The contender is one unique dot-prefixed regular file created exclusively inside the same Case directory as the final slot.
2. Complete canonical payload bytes are written before authority publication.
3. The contender file is fsynced before authority publication.
4. Publication is one kernel/filesystem operation that atomically makes the contender's already-written regular-file bytes reachable at the final authoritative pathname **only if that pathname does not already exist**.
5. A preexisting destination of any type is not overwritten, truncated, removed, followed, or exchanged.
6. Successful publication cannot expose a zero-length or partially written authoritative file produced by this writer.
7. The final authoritative pathname is a regular file under the unchanged committed-namespace grammar.
8. A Case-directory fsync follows successful publication. Publication returns success only after that sync succeeds.
9. An existing destination is a publication conflict. The caller rereads the authoritative namespace/state; it does not infer that the existing object is a valid winner.
10. A failure known to occur before publication means this contender did not create a successor.
11. If publication may have occurred but its result or the subsequent directory durability is uncertain, return `store_commit_ambiguous` and require reread/reconciliation.
12. Cleanup after the commit boundary is housekeeping only. A hard-link backend may remove the now-nonauthoritative temporary alias; successful rename already removes its temporary source pathname. Loser/orphan dot-temp cleanup remains best-effort and cannot elect authority.
13. Full committed-namespace, file-type, canonical-byte, replay, fork/gap, digest, migration/downgrade, size-bound, and D0007 cache rules remain unchanged.

A backend that cannot prove these properties for the selected environment is unavailable, not “mostly supported”.

## 5. Backend selection and mixed-writer rule

D0030 does not authorize “try one primitive and silently fall back to another” inside a publication attempt.

Backend selection occurs before an authoritative write and is fixed for the store/deployment writer profile. The existing hard-link backend remains valid only on profiles where it is independently qualified. A rename backend is eligible only after its exact integration route and the actual writable Case filesystem pass the capability gate in section 6.

The implementation is expected to expose an explicit writer backend selection rather than per-write opportunistic fallback. The exact API spelling is deferred until the integration route is selected, but the semantic values are at least `hardlink` and `rename-noreplace`; unsupported or unqualified selection fails closed.

Until the mixed-backend race row is independently closed, one writable journal namespace must not have concurrent hard-link and rename-backend writers. Deployment must use a homogeneous selected writer backend or a quiesced/fenced switch. Readers remain backend-neutral because durable committed files do not encode the publication primitive.

## 6. Rename capability qualification and cache semantics

Kernel syscall existence, libc wrapper existence, filesystem support, security policy, and the exact integration route are separate facts. A positive capability result must therefore be obtained on the actual writable Case filesystem used by the store.

A rename-backend capability probe uses only unique non-authoritative dot names in the target Case directory and performs:

1. exclusive creation of a regular probe contender;
2. fixed complete payload write and file fsync;
3. same-directory `RENAME_NOREPLACE` to an absent dot final;
4. verification that the final is regular and contains the exact payload;
5. verification that the source name disappeared and, where the platform exposes stable stat identity, that source-before and final-after refer to the same device/inode;
6. creation/fsync of a second contender and attempted publication to the existing dot final;
7. exact conflict observation with unchanged winner bytes and an unconsumed loser contender;
8. Case-directory fsync;
9. best-effort probe cleanup followed by directory sync of the cleanup where supported.

Any unexpected result is an unqualified backend. `ENOSYS`, unsupported-flag/filesystem behavior such as `EINVAL`, policy denial such as `EACCES`/`EPERM`, integration-component absence, wrong final type/bytes, overwrite, or failed directory sync must not trigger another publication primitive.

A positive probe may be cached only as disposable process/store-instance state bound to the exact backend/integration identity and Case-directory/filesystem validity key. It is not persisted as semantic state. Restart, integration-component replacement, or a detected capability-invalidating error drops the cache and requires requalification before a later authoritative write.

The read/reconciliation path does not require a writable publication capability; existing regular-file journals remain readable on a host that cannot currently publish.

The accepted implementation must use one stable typed fail-closed outcome for an explicitly selected but unqualified backend. Proposed code: `store_publication_unsupported`. This name remains draft until the integration route is frozen; it must not be silently rewritten as a normal CAS conflict.

## 7. Semantic equivalence requirements

### Exactly-one-winner election

Both backends must map two writers targeting the same predecessor slot to at most one successful final publication. Rename evidence already demonstrates 25/25 exact-one-winner races on the measured Termux/F2FS profile; full repository process-level races remain an acceptance row.

### Stale writer behavior

The slot remains keyed by predecessor revision. A stale writer reaching a slot already elected by another writer must conflict and reread; it cannot append after the winner merely because its local materialization was stale.

### Prewritten-byte visibility

A final name produced by the writer becomes visible only from an already-complete/fsynced regular contender. The measured same-inode rename result supports this on the current device. Direct-final `O_EXCL` fails this property.

### Namespace validation and adversarial destinations

`RENAME_NOREPLACE` must not overwrite a preexisting file, symlink, directory, or other destination. Conflict does not certify the destination as valid. The existing reader then validates the committed namespace and regular-file requirement and fails closed on an adversarial object.

### Ambiguity and directory durability

Successful publication precedes Case-directory fsync. Any failure or lost result after publication may have occurred is ambiguous, not a safe retry. This includes a subprocess/native boundary whose controller loses a definitive result after the publication syscall could have started.

### Cleanup and restart

Dot-temp cleanup is non-authoritative. Restart/cache loss must strictly reobserve the committed namespace and reproduce the same materialized state; orphan dot temps remain ignorable.

### Retention, migration, and downgrade

Switching hard-link versus rename publication changes neither final filename grammar nor committed bytes, schema, replay order, retention, legacy/v2 migration boundary, nor downgrade barrier. No data migration is introduced solely by changing the publication backend.

## 8. Node/native integration candidates

### 8.1 Public Node `fs.rename` — rejected

It has replacement semantics when the destination exists and no public no-replace flag parameter. The measured device probe also overwrote a preexisting winner. Check-then-rename is not an acceptable repair because another process can win between the check and rename.

### 8.2 Public libuv rename — rejected

`uv_fs_rename` is documented as equivalent to `rename(2)` and exposes no `RENAME_NOREPLACE` flag. An unstable internal Node/libuv binding is not product authority.

### 8.3 Node `node:ffi` — deferred/rejected for the baseline

The public FFI API is new in Node 26.1, Stability 1 Experimental, gated by `--experimental-ffi`, and available only in Node builds configured with FFI support. D0030 inherits Node `>=22`. The current FFI documentation exposes native symbol calls but no direct stable errno helper, while rename conflict/error classification requires an exact native result. Raising the minimum runtime or adding an experimental runtime flag merely to avoid owning a native boundary would be a separate support/deployment decision. D0030 therefore does not select FFI as the first product route. It may be re-evaluated only if the repository minimum-runtime/support policy changes and exact Termux/build/errno behavior is independently qualified.

### 8.4 Narrow Node-API addon — viable secondary candidate

Node-API is stable and ABI-oriented across Node versions. A minimal addon can issue `renameat2`, capture errno in the same native frame, and return a typed result without a second process. Costs are addon build/prebuild packaging, architecture/Android toolchain ownership, addon lifecycle, in-process native crash blast radius, and the need to prove that the call path does not create an unsupported event-loop or shutdown behavior. No such addon packaging path exists in the current repository.

### 8.5 Bounded packaged native helper — leading next falsifier, not yet selected

A narrowly owned executable can have one purpose: publish one contender basename to one final basename with `RENAME_NOREPLACE`. The preferred confinement shape is fd-relative: the JS owner opens the Case directory, passes that directory fd to the child through a dedicated inherited fd, and supplies only generated single-component basenames. The helper rejects empty names, slash-containing names, `.` and `..`; performs no network, config, secret, directory traversal, copy, fallback, or semantic read; and does not become a second store authority.

The subprocess uses no shell and stdout/stderr are diagnostics only, never the result protocol. Normal helper exit uses a small fixed helper-status contract for success, destination conflict, unsupported capability/policy denial, and known syscall failure. If the helper fails, times out, is cancelled, or loses its status **after the publication syscall could have started**, the parent must conservatively return `store_commit_ambiguous` and reread rather than infer a pre-publication failure.

This route still needs packaging/fresh-install, deadline, abnormal termination, fd/path confinement, independent testing, rollback/removal, and performance/operational-burden evidence. Therefore D0030 remains draft instead of selecting it by convenience.

## 9. Failure, cancellation, recovery, and cleanup

A publication attempt is split around one commit-sensitive native operation.

- Before native publication begins: cancellation/failure can close/remove the contender and returns a known no-successor write failure.
- Native operation returns explicit destination conflict: contender did not publish; reread the destination/current journal and map through existing CAS or corruption/type rules.
- Native operation returns explicit unsupported/policy denial before publication: invalidate capability state and fail closed; do not try another backend.
- Native operation returns success: final publication happened; proceed to Case-directory fsync.
- Native result is lost after the operation could have started, or the helper/addon boundary terminates without a definitive typed result: `store_commit_ambiguous`; reread/reconcile.
- Directory fsync fails after successful publication: `store_commit_ambiguous`; reread/reconcile.
- Directory fsync succeeds: commit succeeded. Cleanup failure cannot retroactively fail it.

The store currently has no semantic cancellation owner at this boundary. D0030 does not introduce one. A future bounded helper deadline is liveness control only; once publication could have begun, timeout/cancellation changes the result to ambiguous rather than safe failure.

## 10. Crash durability and qualification boundary

The required ordering remains:

```text
complete write
-> contender file fsync
-> atomic no-replace publication
-> Case-directory fsync
```

Minimum process/crash qualification must independently exercise:

- crash/kill before publication: no final successor; orphan dot temp may remain;
- crash/kill after publication but before directory fsync: restart produces only predecessor or complete successor, never a writer-created partial final; caller-level outcome is ambiguous until reread;
- injected directory-sync failure: ambiguous and reconcilable;
- crash/restart after successful directory fsync: committed final and replay survive cache loss;
- conflict loser restart: winner unchanged; loser temp is non-authoritative;
- cleanup failure/crash after commit: committed outcome unchanged.

These tests prove software/process boundaries, not sudden power-loss durability. Before claiming power-loss qualification for a concrete Android/F2FS deployment, evidence must identify the exact kernel/filesystem/storage/mount profile and execute a destructive crash/power-loss test or another repository-accepted equivalent. If that layer is not executed it remains `unverified`; it is not inferred from syscall success or ordinary process termination.

## 11. Compatibility, migration, rollback, and deployment

### Durable compatibility

The committed journal format is unchanged. Final authoritative names remain regular files containing the same canonical bytes. Existing readers do not need to know which qualified publication backend created them.

### Data migration

No data migration is required solely for hard-link -> rename backend activation. Existing legacy-prefix/immutable-v2 migration and downgrade barriers are unchanged. D0010's separate opt-in SQLite v3 authority is not modified.

### Writer rollout

Until mixed-backend concurrency is qualified, switch writer backend only under homogeneous deployment or writer quiescence/fencing for a journal namespace. Read-only processes need no switch.

### Rollback

Rollback to hard-link publication is data-compatible only on an environment where hard-link publication is still qualified. On a rename-only environment such as the measured Termux profile, removing or disabling the selected rename integration makes new writes unavailable; the correct behavior is fail closed while existing journal reads/reconciliation remain possible. Plain rename or another primitive is never a rollback fallback.

### Deployment dependency

Selecting either a helper or Node-API addon introduces a native deployment asset/build concern that the current package does not have. Fresh-install availability, executable/addon integrity, architecture/ABI coverage, Node-minimum compatibility, upgrade/removal, and rollback must be owned by `docs/DEPLOYMENT.md` before production verification.

## 12. Acceptance matrix and cheapest falsifiers

| Boundary | Required evidence before production qualification |
| --- | --- |
| inherited semantics | complete existing `ImmutableJournalSnapshotStore` corruption/fork/gap/noncanonical/migration/ambiguity/cleanup matrix remains green on every qualified backend |
| base create election | two independent processes with expected `null` -> exactly one success, one conflict |
| successor election | two independent processes from same predecessor -> exactly one success, one conflict |
| different successor revisions | one slot winner, loser cannot create a parallel continuation |
| stale writer | after winner advances, stale expected predecessor cannot append |
| prewritten visibility | final never exposes writer-created zero/partial bytes; final after rename matches fsynced contender identity/bytes |
| adversarial destination | preexisting file/symlink/directory/recognized non-regular name is never overwritten; existing invalid authority fails closed on reread |
| pre-publication faults | temp write/file fsync/pre-native failures leave no successor |
| native result loss | helper/addon abnormal result after possible syscall -> ambiguous; reread elects predecessor/successor/invalid third state without blind retry |
| directory sync | injected failure after publication -> `store_commit_ambiguous`; reread observes complete candidate when present |
| cleanup | cleanup failure cannot retroactively fail a committed successor |
| restart/cache loss | fresh instance strictly replays exact committed bytes and ignores orphan dot temps |
| capability supported | actual Case directory absent-final + conflict probe passes, then repository process races pass |
| capability unsupported | `ENOSYS`/unsupported flag or filesystem/policy denial/integration absence fails closed with zero fallback publication |
| Termux/F2FS | exact supported Android/Termux profile passes capability probe, repository immutable-journal backend matrix, restart, native-boundary and deployment gates |
| independent POSIX | Ubuntu or repository's independent POSIX plane passes rename backend matrix plus existing hard-link regression where hard links are qualified |
| mixed backends | hard-link writer versus rename writer from same predecessor yields exactly one winner across repeated independent-process races, or deployment remains explicitly quiesced/homogeneous |
| package/runtime | fresh supported install provides only the declared helper/addon route with exact version/ABI identity; removal/rollback fails closed as designed |
| power loss | exact target storage/filesystem/mount profile destructive evidence before any power-loss-qualified claim |

The cheapest new falsifiers are, in order:

1. production-shaped helper and Node-API micro-prototypes outside production `src/`, each operating fd-relative on a Job-private directory and returning typed conflict/unsupported/error results;
2. helper abnormal-exit/timeout injection before versus after possible syscall with mandatory reread;
3. hard-link-versus-rename mixed race on an independent POSIX filesystem;
4. exact repository immutable-journal process race and fault matrix through the selected integration route;
5. fresh-install/package check on Termux/aarch64 plus one independent Ubuntu/POSIX plane.

If the selected integration cannot preserve the backend-neutral contract without a second authority, unsafe hidden path, unsupported deployment dependency, or ambiguity loss, the Design stays draft/reopens rather than falling back to a weaker primitive.

## 13. Rejected and deferred alternatives

### Plain rename / check-then-rename

Rejected. Plain rename replaces an existing destination. A prior existence check does not fix the race between check and rename.

### Direct final `O_EXCL` write

Rejected as a drop-in. It elects a name before the payload is complete and fsynced, exposing an authoritative pathname with partial/zero bytes during the write.

### Copy or reflink-to-final

Rejected as the D0005 commit primitive. It either exposes a destination during data transfer or requires another no-replace publication primitive after the copy, returning to the original problem.

### `O_TMPFILE` + hard-link publication

Rejected for the measured Android profile. Unnamed-file creation does not bypass the hard-link security boundary required to publish that inode into the namespace.

### Naive symlink publication

Rejected. It changes the authoritative slot type, follows mutable/deletable targets, adds path-containment hazards, and violates the current strict regular-file journal contract.

### Content-addressed object + constrained symlink pointer

Deferred as a real secondary **new durable protocol**, not a fallback. The measured prototype shows a defensible reader can validate target grammar/containment, reject symlink objects, and verify object digest. Selecting it would also create object namespace ownership, retention/GC, object/pointer crash ordering, authorization/path-security, migration, downgrade and rollback contracts. Reconsider only if regular-file no-replace publication is independently falsified on a required target or a new accepted requirement demands durable object indirection/shared immutable objects.

### Experimental Node FFI

Deferred/rejected for the current baseline for the reasons in section 8.3. Public does not mean stable or compatible with the repository's Node 22 minimum.

## 14. Non-goals and owner boundaries

D0030 does not authorize:

- changes to Case/Task/Attempt/result/Promotion semantic authority;
- a new durable journal format or content-addressed object store;
- D0022 activation, ContextSlice, Cloudflare CaseDO/AgentDO topology, MCP, provider selection, or final MVP prototype work;
- weakening strict namespace/replay/digest/migration/downgrade checks;
- treating cache, capability probes, helper state, inode numbers, filesystem type, Node version, or native component presence as semantic authority;
- automatic fallback among publication primitives after an authoritative write attempt begins;
- universal Android/Linux/F2FS qualification from one connected device;
- claiming power-loss evidence that was not executed.

After acceptance, `docs/PROTOCOL.md` should own the backend-neutral publication/reconciliation meaning; `docs/OPERATIONS.md` the runtime/error mapping; `docs/ARCHITECTURE.md` the publication adapter/native-boundary placement; `docs/SECURITY.md` path/fd/native trust and fail-closed rules; `docs/DEPLOYMENT.md` package/platform qualification; and `docs/MVP.md` the end-to-end qualification matrix. `docs/SPEC.md` changes only if the accepted support surface itself changes.

## 15. Draft status and acceptance blockers

The semantic primitive decision is strong enough to keep `RENAME_NOREPLACE` as the preferred second backend candidate, but this record remains `draft` because a Class 2 implementation route is not yet frozen and independent qualification is incomplete.

Before D0030 may become `accepted`, all of these must close:

1. select the integration route from a measured production-shaped native helper versus Node-API addon comparison; do not select experimental FFI or an internal Node binding by convenience;
2. freeze the selected route's package/build/ABI/minimum-Node lifecycle, fd/path confinement, typed result protocol, finite deadline behavior, abnormal termination mapping, removal and rollback;
3. prove the selected route on the connected Termux/F2FS profile with the actual directory-local capability probe and repository-shaped process race/fault harness;
4. independently qualify `RENAME_NOREPLACE` on Ubuntu/POSIX or the repository's current independent POSIX plane and regress the existing hard-link backend where it remains qualified;
5. either pass mixed hard-link-versus-rename independent-process races or freeze a quiesced/homogeneous writer-switch rule as the only supported deployment transition;
6. show that unsupported syscall/filesystem/policy/integration states fail closed and never trigger plain rename, copy, check-then-rename, direct-final write, `O_TMPFILE`+link, or symlink fallback.

Power-loss testing remains a required **production qualification layer for any power-loss-qualified deployment claim**, but its absence need not block Design acceptance if the accepted Design explicitly keeps that layer unverified until deployment qualification.

Only after D0030 is accepted may production `src/` implementation begin. Acceptance authorizes only the frozen integration/backend scope; it does not itself verify Termux, POSIX, deployment, or power-loss layers.

## 16. Exact next authorized work

The next Task may create only bounded, non-production integration falsifiers for:

- fd-relative `RENAME_NOREPLACE` native helper;
- stable Node-API addon comparator;
- abnormal helper/addon result and ambiguity reconciliation;
- mixed hard-link/rename winner election on an independent POSIX plane;
- exact Termux and independent POSIX capability/package observations.

It may update this Design/evidence from those results. It may **not** replace `fs.link` in `src/store.mjs` or add a production native dependency until D0030 becomes `accepted` under `SDD.md`.
