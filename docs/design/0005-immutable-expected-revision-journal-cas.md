# Design 0005: Immutable Expected-Revision Journal CAS

- Class: 2
- Status: verified on 2026-08-07 in the declared source/container scope
- Development identity: `mvp-1a-3`
- Direct code parent: `mvp-1a-2` at remote commit `ee02845c8947b69f810308fd957e3952a8e508b9`
- Evidence inputs: verified Design 0004 barriers, independently reproduced A/B storage counterexamples, B expected-revision commit-slot experiment, local Node/filesystem tests
- Owners affected: LINEAGE, SPEC, ARCHITECTURE, PROTOCOL, SECURITY, DEPLOYMENT, MVP, WORKBOARD, IMPLEMENTATION_REPORT
- Implementation paths: `src/store.mjs`, `src/index.mjs`, `test/immutable-journal.test.mjs`, `test/store.test.mjs`, `test/fixtures/`

## One-line decision

Add an opt-in local-filesystem `ImmutableJournalSnapshotStore` whose authoritative state is the origin plus strict full replay of retained committed records and whose cross-process CAS winner is elected by one immutable no-replace commit slot per expected revision; do not add checkpoint, proposal cache, compaction, or history deletion.

## 1. Repository facts and reproduced evidence

Facts from the current owners and Design 0004:

- stores own snapshot bytes and CAS revision, not Case semantic validity;
- Case revision equals the semantic Event frontier, and one repository transaction may append more than one Event;
- performance caches may not author CAS or suppress corruption;
- the existing `JournalSnapshotStore` deliberately re-reads/hashes all retained bytes and is only a same-process local adapter;
- self-digests detect accidental corruption/inconsistent rewrite, not a hostile actor that can rewrite a complete history and recompute every digest.

Independently reproduced comparison findings:

- B `FileSnapshotStore` instance-local locking permits two same-process independent instances to both report CAS success at one expected revision; this design does not use that locking model.
- B proposal/materialization cache can append a new commit while a fresh reader rejects the same durable history after a historical committed record is damaged; proposal cache is excluded.
- B checkpoint can suppress a historical semantic inconsistency that full replay detects when the checkpoint is removed; checkpoint is excluded.
- B expected-revision `delta-from-R` no-replace slot elects one local-filesystem process winner even when competitors propose different successor revisions; this protocol idea is retained.
- A stale/warm corruption and same-process store barriers remain regression requirements.

## 2. Current problem

The verified `JournalSnapshotStore` is safe inside one Node process because every load/CAS re-observes exact durable bytes under a process-wide lock. It does not claim cross-process CAS. Replacing that lock with an instance-local cache or lock weakens correctness. A crash-recovery lockfile/lease protocol would add a new durable lifecycle owner.

The desired narrow improvement is a cross-process local-filesystem CAS election primitive that does not require a lease owner and does not weaken retained-history integrity checks.

## 3. New adapter and authority

`ImmutableJournalSnapshotStore` is a new opt-in adapter. Existing `JournalSnapshotStore` remains the verified Design 0004 adapter and retains its current cache/compaction behavior.

For the new adapter, authoritative state is only:

```text
base.json
+ reachable retained committed journal records
+ strict semantic replay in predecessor order
```

There is no materialization cache, checkpoint, trusted head file, or mutable current-revision file.

The process-wide lock may serialize same-process calls for efficiency, but correctness does not depend on it. Cross-process election comes only from immutable commit-slot publication.

## 4. Revision continuity

A journal transition is legal when:

```text
fromRevision == current.caseRevision
toRevision > fromRevision
appendedEvents.length == toRevision - fromRevision
eventSequence == toRevision
```

`toRevision == fromRevision + 1` is **not** required. A single Case mutation/command may append multiple semantic Events before one repository CAS.

The next reachable record must start exactly at the prior materialized `toRevision`. This predecessor equality, not numeric `+1` filenames, is the journal-chain continuity rule.

## 5. Record formats

### Legacy record v1

The Design 0004 format remains readable:

```text
delta-<toRevision padded to 16 decimal digits>.json
schemaVersion = 1
```

Its target snapshot digest is validated by semantic replay.

### Immutable record v2

New writes use:

```text
delta-from-<fromRevision padded to 16 decimal digits>.json
schemaVersion = 2
```

A v2 record contains the v1 semantic delta fields plus:

```text
sourceSnapshotDigest
targetSnapshotDigest
deltaDigest
```

`deltaDigest` is domain-separated as `tdev.snapshot-journal-delta.v2` and covers every record field other than itself.

Before publication the writer applies the candidate delta to the fully replayed predecessor and verifies that the result has exactly `targetSnapshotDigest`.

On replay a v2 record must satisfy:

```text
sourceSnapshotDigest == predecessor.snapshotDigest
semantic replay result snapshotDigest == targetSnapshotDigest
```

## 6. Legacy/new coexistence and migration

Migration is one-way within a retained chain:

```text
zero or more legacy-v1 records
-> zero or more immutable-v2 records
```

Rules:

1. a legacy prefix may be continued by the new adapter with v2;
2. after the first reachable v2 record, any later reachable legacy record is corruption (`store_journal_format_order`);
3. any two committed records with the same `fromRevision` are a fork and fail closed, even if they appear to describe the same successor;
4. a legacy and v2 record for the same logical predecessor therefore never use precedence resolution;
5. unknown schema versions in recognized committed filenames fail closed;
6. malformed `base-*`/`delta-*` committed-looking filenames fail closed;
7. dot-prefixed temporary files are non-authoritative and ignored by readers.

This avoids two simultaneous authority representations **after a valid cutover**. The migration boundary is the first v2 committed record.

The filename layouts do not provide an atomic cross-format election between a live legacy writer (`delta-<toRevision>`) and a live v2 writer (`delta-from-<fromRevision>`). Therefore the first v2 publication has an explicit migration admission rule:

1. stop/quiesce every process that may still write the Case through `JournalSnapshotStore`;
2. independently load and validate the retained legacy authority with the new source;
3. admit the first v2 CAS only after that quiescence boundary;
4. after the first v2 record, use only `ImmutableJournalSnapshotStore` writers for that Case/directory.

A rolling deployment with concurrent legacy and immutable writers is unsupported. In the new source, the two adapters share the same process-local journal-family lock so an accidental same-process mixed use cannot elect two winners, but this does **not** replace the cross-process quiescence requirement. The cross-process one-winner claim applies to immutable-v2 writers after cutover.

## 7. Publication protocol

Creation and v2 commit publication use the same same-directory no-replace primitive:

```text
1. validate/materialize the complete predecessor from durable authority
2. construct and canonicalize the candidate committed record
3. create a unique dot-prefixed temporary file with exclusive create
4. write all bytes and fsync the temporary file
5. hard-link the temporary inode to the authoritative final slot without replacement
6. fsync the Case directory
7. after the commit boundary, remove the temporary name best-effort
8. return success
```

The authoritative slots are:

```text
base.json                     for expectedRevision = null
delta-from-<R>.json           for expectedRevision = R
```

A final-slot `EEXIST` means another writer already published for that expected revision. A temporary-name collision is not a CAS conflict and must be retried or reported as a write failure.

Cleanup failure after the directory sync cannot turn an already committed transition into failure because dot-temporary files are ignored.

If publication of the final slot succeeds but the required directory durability step fails, the outcome is **ambiguous**, not an ordinary failed CAS. The adapter reports `store_commit_ambiguous`; callers must re-read/reconcile before retrying. The source slice does not claim power-loss durability beyond the tested local filesystem/Node behavior.

## 8. Reader/replay rules

Every `load()` and every non-create `compareAndSwap()` performs strict full authoritative replay. No warm state may bypass historical records.

The reader must reject:

- missing `base.json` with any committed records;
- malformed committed-looking filenames;
- unsafe or out-of-range filename revisions;
- noncanonical JSON;
- unsupported record schema;
- filename/record revision mismatch;
- duplicate predecessor/fork;
- missing predecessor or unreachable record;
- legacy record after the v2 migration boundary;
- immutable Plan/Case identity change;
- v2 source snapshot digest mismatch;
- Event/revision suffix mismatch;
- delta digest mismatch;
- replayed target snapshot digest mismatch;
- materialized snapshot size overflow.

A recognized committed record that cannot be reached is corruption; it is never silently ignored.

## 9. Existing adapter downgrade barrier

New source code modifies the old `JournalSnapshotStore` only enough to fail closed if it sees immutable-v2 committed filenames. It must not silently ignore a directory that has crossed the D0005 migration boundary.

Actual rollback to unmodified `mvp-1a-2` code after a v2 record exists is unsafe: that historical code does not understand `delta-from-*`. No automatic downgrade or v2-to-v1 rewrite is provided.

## 10. Failure, recovery, and cleanup

- crash before final-slot publication: only a dot-temp may remain; it is ignored and a later writer may retry;
- crash after final-slot publication: reopening determines whether the slot exists and validates it by full replay;
- final-slot conflict: re-read authority and report CAS conflict or corruption from the winner state;
- directory-sync ambiguity after final publication: report `store_commit_ambiguous` and require reconciliation;
- temp cleanup failure after commit: success remains success; orphan temp is non-authoritative;
- no automatic callback replay occurs after any CAS or ambiguous outcome.

## 11. Security/trust boundary

This design preserves the current self-integrity model only. If a writer can maliciously rewrite the entire retained history and recompute every self-digest, this adapter does not authenticate the original history. A protected MAC/signature or trusted transactional provider remains a separate design.

## 12. Acceptance matrix

| Area | Cheapest falsifier |
| --- | --- |
| inherited baseline | complete current source gate plus existing blocker/runner/File-store/full-restore tests remain green |
| create CAS | independent processes publishing `base.json` from absence -> exactly one success |
| same-process CAS | independent immutable-store instances at one expected revision -> exactly one success |
| cross-process CAS | two independent Node processes at one expected revision -> exactly one success |
| different successor revisions | competitors from one expected revision may propose different `toRevision`; one slot/winner only |
| stale writer | committed winner followed by stale writer -> no second winner |
| revision jump | `toRevision > fromRevision + 1` with matching Event suffix replays exactly |
| source binding | v2 source digest mismatch -> fail closed |
| target binding | semantically changed/re-digested record with stale target digest -> fail closed |
| fork | two records with one predecessor -> fail closed |
| format order | legacy prefix -> v2 accepted; v2 -> later legacy rejected |
| same-process cutover | legacy/new adapters racing one expected revision -> at most one success |
| cross-process cutover | mixed legacy/new writers are explicitly unsupported; first v2 commit requires externally evidenced legacy-writer quiescence |
| unknown format | unknown schema/malformed committed filename -> fail closed |
| committed path type | recognized authoritative slot occupied by a non-regular filesystem entry -> fail closed |
| bounds | unsafe filename/revision/materialized size -> fail closed |
| orphan temp | stale dot-temp never blocks or becomes authority |
| restart | fresh instance/process materializes identical revision/snapshot digest |
| downgrade guard | old adapter in new source rejects a directory containing v2 committed records |
| oracle equivalence | equivalent transition history ends with same semantic snapshot/digest as MemorySnapshotStore |

The full randomized restore oracle remains an inherited gate even though this design changes only storage.

## 13. Non-goals

- changing `FileSnapshotStore` locking or guarantees;
- replacing the verified Design 0004 `JournalSnapshotStore`;
- checkpoint/materialization/proposal cache;
- authority-changing compaction or retained-history deletion;
- distributed/provider CAS;
- hostile-storage authentication;
- automatic data downgrade;
- Promotion optimization;
- deployment or public-client claims.

## 14. Rejected alternatives

- **Port B `store.mjs`:** rejected because it regresses FileSnapshotStore locking and includes cache/checkpoint behaviors that fail the retained-history corruption envelope.
- **Instance-local mutex:** rejected because it cannot serialize independent instances or processes.
- **Cross-process lockfile lease:** rejected because crash recovery introduces a second lifecycle owner and expiry semantics.
- **Mutable head/revision file:** rejected because atomic update and stale-head authority become a new CAS owner.
- **Checkpoint/cache in J1:** rejected because J1 must first prove the immutable commit protocol without acceleration.

## 15. Follow-on gates

After D0005 is verified, checkpoint/cache acceleration may be reconsidered only under a separate accepted Class 2 design that preserves the same legal/corrupt result with acceleration present or absent. A checkpoint may become a new trusted root only through an explicit authority-transition/history-GC design.

Compiled-base Promotion is evaluated separately because its trust/provenance and performance failure domain is unrelated to persistence.


## 16. Verification closure

Retained structured evidence: `docs/evidence/mvp-1a-3-immutable-journal-2026-08-07.json`.

Observed in Node.js 22.16.0 / npm 10.9.2 on the supplied compatible local filesystem:

- `test/immutable-journal.test.mjs`: 18/18 passed;
- immutable plus inherited store tests: 39/39 passed;
- complete source suite: 128/128 passed, including the inherited 100-history full-restore oracle, capacity 1/N equivalence, deterministic blocker propagation, runner rebuild-before-deadlock, and FileSnapshotStore single-winner regression;
- `npm ci --ignore-scripts --no-audit --no-fund`: passed;
- `npm run check`: passed, including both demos;
- coverage invocation: 128/128 passed, 91.73% lines / 81.72% branches / 96.14% functions across source and tests;
- `git diff --check`: passed.

The cross-process immutable create and update races each elected exactly one winner. Historical semantic corruption was observed identically by warm CAS and cold/reopened readers because every operation replays retained authority. Legacy-prefix to v2 continuation, reverse-format rejection, duplicate-predecessor rejection, source/target digest binding, unsafe/malformed/noncanonical/unreachable records, materialized size bounds, orphan temporary files, and the Design 0004 compaction-cleanup crash shape all passed focused falsifiers.

A separate mixed-format process falsifier demonstrated that a live legacy writer and a live immutable writer can both publish from one predecessor because the formats use different final slots. That result is retained as the reason the migration contract requires legacy-writer quiescence before the first v2 publication; it is not hidden as an implementation fallback. New-source adapters share one same-process journal-family lock, and that mixed same-process race elects at most one winner.

The branch that classifies failure of the directory durability step after a successful final hard link as `store_commit_ambiguous` was code-reviewed but was not deterministically fault-injected in this container. Power-loss durability, network filesystems, provider stores, distributed transactions, automatic downgrade, checkpoint/cache acceleration, history GC, and Promotion optimization remain outside this verification claim.
