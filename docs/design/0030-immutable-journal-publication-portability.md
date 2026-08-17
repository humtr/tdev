# Design 0030 — Immutable Journal Publication Portability

- Status: `accepted`
- Revision: 2
- Revision 2 predecessor: revision 1 was verified before the 2026-08-17 falsifiers; its unaffected D0005/D0007 durable-format and normal qualified-publication meaning remains historical verified evidence.
- Revision 2 reason: fresh target-native revalidation in tmcp Job `job_8yt_7d4b39e93b` reproduces the affected capability-cache, post-BEGIN abnormal-helper and clean-source-baseline defects after D0031 correction.
- Revision 2 acceptance evidence: `docs/evidence/group-f-d0030-r2-portability-correction-acceptance-2026-08-17.json`.
- Revision 2 changed decision: (1) a typed helper result is authoritative only after normal child completion; after BEGIN, timeout, signal, spawn uncertainty or nonzero exit remains `store_commit_ambiguous` even if a complete frame was captured; (2) a positive capability cache may be installed only when the exact validity key is identical before and after the probe, and a later `store_publication_unsupported` publication result invalidates the cached qualification before rethrow; (3) the clean repository source gate must not require an undeclared current-platform helper asset—source tests prove fail-closed absence when the package has no current target, while positive Linux helper/package qualification remains owned by the explicit pre-runtime build/install workflow.
- Revision 2 preserved meaning: no backend fallback, fixed package-owned helper identity, D0005/D0007 journal format/replay/migration/downgrade, exact no-replace publication ordering on qualified paths and the destructive-sudden-power-loss exclusion remain unchanged.
- Revision 2 implementation/verification: not yet executed at acceptance. Destructive power-loss, universal Linux/Android/filesystem support and any unexecuted deployment profile remain unverified.
- Class: 2
- Capability Groups: B/F — semantic authority and persistence / active runtime portability
- Active cumulative lineage: `group/f-cloudflare-runtime`
- Acceptance starting authority: `group/f-cloudflare-runtime@0ff5f7401f932a6c99d4f1a7d3adb63b61a3ac1f`
- Completed predecessor checkpoint: Group E `cp_1786580384438_9ed881e039da` at the same exact SHA
- Prior evidence Task: `task_6ni_625838d8a0`
- Prior evidence checkpoint: `cp_1786581036451_bed7284b8070`
- Production implementation Task: `task_8nl_11ff1d8749` from exact Group F base `3f508cc5b27c9d0a666145056fe589d73b1c8651`
- Production verification source: `0e3b76d06dfd6382d7ea5acb403fa1e3e391056a`
- Production verification evidence: `docs/evidence/group-f-d0030-production-portability-verification-2026-08-16.json`
- Acceptance falsifier evidence commit: `e0d7706d02827d136eada0a9484d8ef6874cb672`
- Inherited Designs: D0005 immutable expected-revision journal CAS, D0007 verified materialization reuse, D0008 durability admission; D0010 v3 SQLite authority remains a separate opt-in profile
- Affected normative owners after acceptance: `docs/PROTOCOL.md`, `docs/ARCHITECTURE.md`, `docs/OPERATIONS.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/QUALIFICATION.md`; `docs/SPEC.md` only if accepted support scope changes
- Planning owner: `docs/development/PROGRAM.md`
- Research evidence: `docs/evidence/group-f-d0030-immutable-publication-portability-research-2026-08-13.json`
- Acceptance convergence evidence: `docs/evidence/group-f-d0030-publication-portability-acceptance-convergence-2026-08-13.json`
- Termux falsifier evidence: `docs/evidence/group-f-d0030-publication-portability-termux-falsifier-2026-08-13.json`
- Independent POSIX falsifier evidence: `docs/evidence/group-f-d0030-publication-portability-independent-posix-falsifier-2026-08-13.json`

> D0030 Revision 1 is production-verified at the source and evidence named above. The accepted backend-neutral D0005 publication semantics remain frozen: the implementation adds a qualified package-owned native publication route without changing committed journal format, replay, migration, downgrade or ambiguity meaning. Section 16 records the production verification boundary and explicit exclusions.

## 1. One-line definition

Preserve the D0005 immutable-journal durable format and commit meaning behind a backend-neutral **prewritten regular file -> file fsync -> atomic no-replace regular-file publication -> Case-directory fsync** contract, retain the existing hard-link backend where it is independently qualified, and prefer same-directory `renameat2(..., RENAME_NOREPLACE)` as the second backend only after the exact runtime/filesystem/integration route is positively qualified; otherwise fail closed.

## 2. Evidence classification

### 2.1 Acceptance-base repository facts

At the F anchor reviewed for acceptance, `ImmutableJournalSnapshotStore` created a unique dot-prefixed temporary regular file exclusively, writes canonical bytes, fsyncs the file, hard-links that already-written inode into the authoritative final pathname without replacement, fsyncs the Case directory, and only then returns success. `EEXIST` is publication conflict. Failure after final publication but before successful Case-directory sync is `store_commit_ambiguous`. Temporary cleanup after the commit boundary is best-effort.

Committed journal authority remains ordinary regular files: `base.json`, legacy `delta-<to>.json` where admitted by the migration rules, and immutable-v2 `delta-from-<from>.json`. Dot-prefixed temporary files are not authority. The reader rejects recognized committed names that are non-regular, malformed names, noncanonical bytes, gaps, forks, source/target digest mismatch, unsupported schema, invalid migration order, and missing base authority. D0007 cache reuse still begins with strict committed-namespace and exact-byte observation and cannot hide those failures.

The repository minimum runtime is Node `>=22`. At that acceptance anchor there was no native-addon/helper build or runtime dependency in `package.json`. Public Node `fs.rename` was not used as the D0005 no-replace primitive because its replacement semantics differ from D0005.

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

### 2.4 Inferences and accepted decisions

The store's required semantic primitive is not “hard link” itself. It is atomic no-replace publication of a complete, already-fsynced regular-file inode into an authoritative slot, followed by directory durability, with conflict and ambiguous-outcome handling that force reread rather than replay.

On the measured local profile, same-directory `RENAME_NOREPLACE` preserves that semantic boundary more closely than every tested alternative while preserving the existing final regular-file format. Its success-path housekeeping differs from hard-link publication because successful rename removes the temporary pathname instead of leaving a second link to unlink, but that difference is outside authoritative format and outcome.

`RENAME_NOREPLACE` is therefore the preferred second backend candidate. This does **not** imply universal Linux, Android, F2FS, or Node qualification.

The selected native integration is a narrowly owned standalone helper. The JS owner opens the Case directory, inherits that directory on a dedicated child fd, and passes only generated single-component contender/final basenames. The helper owns exactly one publication primitive: fd-relative `renameat2(..., RENAME_NOREPLACE)`. It uses no shell, network, config, secret lookup, semantic read, copy, or fallback path. A dedicated non-stdout/stderr result fd carries a fixed versioned begin/result protocol so that loss after the begin marker is conservatively ambiguous. A Node-API addon remains a comparator, not the selected route: normal errno/conflict mapping was equivalent, but an injected post-syscall abort killed the host Node process with `SIGABRT`, while the helper fault remained contained to the child and allowed parent-side mandatory reread.

### 2.5 Unknown / unverified

- destructive sudden power-loss durability on the exact target Android/storage profile;
- universal support outside explicitly qualified runtime/filesystem/integration profiles;
- network-filesystem, object-store, Durable Object, and distributed-transaction equivalence;
- repair of the separate tmcp validation-registry drift (`verify:sandbox` / `verify:termux` are registered but absent from the current package scripts).

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

Mixed hard-link and rename writers are admissible only when **both** backends are independently qualified for the same deployment validity key. The independent Debian/ext4 plane produced 100/100 exact-one-winner mixed races, 100/100 loser conflicts and valid final bytes, with zero overwrites and zero parallel continuations (50 hard-link winners, 50 rename winners). That evidence permits mixed publication primitives only on jointly qualified profiles; every other profile remains homogeneous or requires a quiesced/fenced switch. Readers remain backend-neutral because durable committed files do not encode the publication primitive.

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

The accepted implementation uses `store_publication_unsupported` as the stable typed fail-closed outcome for an explicitly selected but unqualified backend. It must not be silently rewritten as a normal CAS conflict or trigger a fallback publication primitive.

## 7. Semantic equivalence requirements

### Exactly-one-winner election

Both backends must map two writers targeting the same predecessor slot to at most one successful final publication. The prior Termux/F2FS primitive evidence produced 25/25 exact-one-winner rename races. Acceptance convergence additionally ran the selected helper through the unchanged 26-test immutable-journal repository oracle in a scratch source mirror and independently ran 100 hard-link-versus-rename races on Debian/ext4 with 100 exact-one-winner outcomes and zero parallel continuations.

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

### 8.4 Narrow Node-API addon — measured comparator, not selected

Node-API is stable and ABI-oriented across Node versions. The bounded comparator issued the same fd-relative syscall and recovered exact success/conflict errno on both Node 26/Termux-aarch64 and Node 22/independent-POSIX. It is not selected because its native code executes with host-process ambient authority, no isolated in-process deadline exists without adding another process boundary, and an injected abort immediately after the syscall killed the host Node process with `SIGABRT` after publication was observed. Moving the addon behind a process to recover those properties would converge on the selected helper shape with additional addon packaging complexity.

### 8.5 Bounded packaged native helper — selected

The accepted integration is one narrowly owned executable whose only authority-changing action is fd-relative `renameat2(..., RENAME_NOREPLACE)` from one contender basename to one final basename. JS opens the Case directory and passes it on a dedicated inherited fd; only generated single-component basenames are accepted. Empty names, slash-containing names, `.` and `..` are rejected. The helper performs no network access, configuration/secret lookup, directory discovery, copy, fallback, semantic read, or cleanup authority and never receives an absolute Case path.

The subprocess uses no shell. Stdout/stderr are diagnostics only. A dedicated result fd carries a fixed versioned protocol with a **begin marker immediately before the publication syscall** and a typed result containing success/conflict/unsupported/denied/error plus exact native errno. Failure known to precede the begin marker is a no-successor failure. After the begin marker, timeout, kill, abnormal exit, result/status loss, malformed/incomplete result, or controller uncertainty is `store_commit_ambiguous` and requires mandatory authoritative reread before any later attempt. The child has a finite controller deadline; the deadline is liveness control, never proof that publication did not occur.

Production packaging must provide a package-owned, platform-appropriate helper executable **before runtime publication**; commit-time compiler invocation or network fetch is not an accepted path. The executable is resolved from package-owned identity rather than `PATH`, and release/install metadata must bind the helper protocol/build identity for the declared OS/arch. Missing or mismatched helper identity is `store_publication_unsupported` before publication and never falls back. The helper process boundary deliberately avoids Node-addon ABI coupling; the JS product runtime remains the repository's Node `>=22` contract. Acceptance evidence compiled the same helper source on Termux/aarch64 Node 26 and Debian/x86_64 Node 22; the separate production Task must implement and verify the actual package/release pipeline.

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

Concurrent hard-link and rename writers are supported only on a deployment validity key where both publication backends have independently passed their capability gates. Otherwise switch writer backend only under a homogeneous deployment or writer quiescence/fencing for the journal namespace. The measured Termux profile is rename-only because hard-link publication is denied there. Read-only processes need no switch.

### Rollback

Rollback to hard-link publication is data-compatible only on an environment where hard-link publication is still qualified. On a rename-only environment such as the measured Termux profile, removing or disabling the selected rename integration makes new writes unavailable; the correct behavior is fail closed while existing journal reads/reconciliation remain possible. Plain rename or another primitive is never a rollback fallback.

### Deployment dependency

The selected helper introduces a native deployment asset/build concern. The accepted lifecycle is: build/package the helper before runtime for each declared OS/arch, resolve it only from package-owned identity, bind protocol/build identity into capability validity, and requalify after process restart, helper replacement, or validity-key change. Missing/mismatched assets fail closed. Removal or rollback may reactivate hard-link writes only where hard-link publication is independently qualified and the mixed/homogeneous rollout rule above is satisfied. These rules are owned by `docs/DEPLOYMENT.md`; the post-acceptance implementation Task must verify the concrete packaging mechanism.

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

If a later production implementation cannot preserve the backend-neutral contract without a second authority, unsafe hidden path, unsupported deployment dependency, or ambiguity loss, D0030 is falsified/reopened rather than falling back to a weaker primitive.

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

After acceptance, `docs/PROTOCOL.md` should own the backend-neutral publication/reconciliation meaning; `docs/OPERATIONS.md` the runtime/error mapping; `docs/ARCHITECTURE.md` the publication adapter/native-boundary placement; `docs/SECURITY.md` path/fd/native trust and fail-closed rules; `docs/DEPLOYMENT.md` package/platform qualification; and `docs/QUALIFICATION.md` the end-to-end qualification matrix. `docs/SPEC.md` changes only if the accepted support surface itself changes.

## 15. Acceptance decision and closed blockers

At the Design-acceptance boundary, D0030 was `accepted`. Acceptance freezes the backend-neutral publication contract, selects the bounded fd-relative standalone helper, and preserves `RENAME_NOREPLACE` as the qualified second backend. It does **not** claim that the production helper has been implemented or packaged.

The former acceptance blockers closed as follows:

1. **Integration comparison — closed.** The same C helper/addon comparator sources were built and executed on Termux/aarch64 Node 26 and independent Debian/x86_64 Node 22. Both recovered normal errno/conflict results; the helper contained native crashes to the child and provided an enforceable deadline/result-loss boundary, while the addon post-syscall abort killed the host Node process.
2. **Lifecycle/security/rollback freeze — closed by this accepted contract.** Package-owned pre-runtime helper identity, no runtime compilation/fetch, Node-ABI-independent process boundary, inherited Case-directory fd, basename-only grammar, no shell/network/config/secret access, dedicated begin/result fd, finite child deadline, post-begin ambiguity, fail-closed removal, requalification, and rollback/mixed-writer rules are normative.
3. **Connected Termux/F2FS — closed for Design acceptance.** The exact Node 26.4.0 / Android 6.1.145 / aarch64 / F2FS / SELinux profile passed the complete directory-local capability probe, adversarial destinations, abnormal-result injection, and the unchanged 26/26 immutable-journal repository oracle through a scratch helper substitution. This is not a universal Android/F2FS claim.
4. **Independent POSIX — closed.** Debian 13.3 / Linux 6.18.35 / x86_64 / Node 22.16.0 / ext4 passed the same helper/addon/capability/ambiguity rows; hard links were available for mixed-backend qualification.
5. **Mixed writers — closed conditionally.** 100/100 independent hard-link-versus-rename races elected exactly one winner, with 100 loser conflicts, valid final bytes, zero overwrite and zero parallel continuation. Mixed publication primitives are allowed only on jointly qualified validity keys; otherwise homogeneous or quiesced/fenced rollout remains mandatory.
6. **Fail-closed unsupported behavior — closed.** Missing helper and unsupported/error classes do not publish and do not trigger a fallback. Plain rename, copy, check-then-rename, direct-final write, `O_TMPFILE`+link and symlink publication remain rejected.

The evidence commit is `e0d7706d02827d136eada0a9484d8ef6874cb672`. The acceptance-convergence artifact is SHA-256 `239aada0b6f15e75faf6c2c04b779f3d578cdf36956d6b108f67b47ee038fd7b`; the Termux artifact is `50aa955cb547e594817e2005df5860e9c1a71eb45f2e47569c1584d33f674ae8`; the repository-preserved independent-POSIX artifact is `eeb7f266df67ad087c3695d1fbf30bd5c080946a88822da2fb5a90fab132481b` and binds the session-local raw evidence digest `5f6996fcd531a7aeca18a5537af5ebbaf08d20debd90e11eb6c84f5bd1877257`.

Destructive power-loss testing was not executed and remains explicitly `unverified`. The existing tmcp validation registry is also separately stale: registered `portable`/`full` commands reference absent `verify:sandbox`/`verify:termux` package scripts. Neither condition is represented as a green production qualification.

## 16. Production verification

D0030 Revision 1 is **verified** for the declared production qualification boundary. The package-owned C helper is byte-identical to the accepted standalone-helper source, Android/arm64 carries the exact manifest-bound helper qualified on the connected Termux/F2FS profile, runtime lookup is package-relative and identity checked, capability probing is non-authoritative and tied to the actual Case directory/filesystem validity key, and no publication fallback is introduced. The unchanged immutable-journal oracle passes through the production rename path on Termux and through both rename and hard-link on the independent POSIX row.

The connected Termux source gate is green at `371/371`, eliminating the inherited hard-link EACCES repository-gate gap without weakening tests. Fresh installed-copy qualification proves exact helper packaging, fail-closed behavior when the helper is missing or mismatched, no authority creation on those failures, and successful requalification after exact helper restoration in a fresh process.

The independent GitHub Actions POSIX run `31922270858` / job `95103971790` on exact source `0e3b76d06dfd6382d7ea5acb403fa1e3e391056a` is fully successful. It records Node 22/Linux-x64/compiler/filesystem identity, passes the D0030 focused suite `5/5`, passes the unchanged immutable-journal oracle `26/26` through rename and `26/26` through hard-link, and produces `25/25` exact-one-winner independent-process mixed races with `25/25` loser conflicts. Its bounded evidence artifact is ID `9256720007`, digest `sha256:4c95c9d36709d20f91a23331a6750ef51c58983ebad375d7e62ab8e64a4d7a00`.

This verification does **not** claim destructive sudden-power-loss durability, universal Android/Linux/filesystem support, network/distributed publication equivalence, or closure of the separate tmcp validation-registry maintenance debt. Those remain outside this verified production boundary.
