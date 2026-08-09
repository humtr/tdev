# Design 0010 — Semantic-Authority Migration and Transactional Head

- Status: verified
- Class: 2
- Target development identity: `mvp-1a-7`
- Direct parent: exact `mvp-1a-6@131204b782d7c7b64edceb55e335fba10c8e5aee`
- Evidence precursor: verified Design 0009 and `docs/evidence/mvp-1a-6-semantic-authority-representation-2026-08-09.json`

> Verified boundary: this record verifies only the bounded local semantic-authority v3 migration described below. It does not verify Git OID authority, provider/distributed ownership, distributed Claim migration, repository publication, ContextSlice/model transport, or a general storage rewrite.

## 1. Decision

`tdev` will introduce one opt-in **semantic-authority v3** profile whose authoritative tree representation is a deterministic compressed UTF-8 path-byte radix. The v3 repository stores immutable semantic objects, compact Case snapshots, and one small expected-predecessor Case head in one trusted local SQLite transaction domain. Existing schema-v2 repositories remain supported and unchanged.

The D0009 collision-safe path-hash trie remains a research reference rather than the production v3 profile. D0009 preferred it on measured structural hash/node counts, but the production contract also requires `validateTreeTopology`: a file path may not simultaneously be an ancestor of another file. A path-hash-only trie destroys prefix locality and therefore needs either an O(N) scan or a second synchronized prefix structure to enforce this invariant. The path-byte radix can prove exact-path and ancestor/descendant conflicts in the same authority structure. D0010 therefore prefers a single-authority radix even though the D0009 C3 microbenchmark had lower structural counts.

## 2. Authority boundary

For a v3 Case there is still exactly one semantic owner:

```text
Plan identity + Case lifecycle state
          |
          v
compact schema-v3 Case snapshot
          |
          +--> base semantic root descriptor
          +--> canonical semantic root descriptor
          |
          v
one transactional Case head
```

The head is the durable election point. Immutable semantic objects and snapshot objects do not become current merely because they exist. A root is authoritative only when referenced by the current Case head committed in the same transaction as its snapshot object.

The current schema-v2 `canonicalTree`/`canonicalDigest` representation remains authoritative for v2 Cases. v2 and v3 are never simultaneous writers for one Case.

## 3. Production semantic profile

The profile identifier is `tdev.semantic.path-byte-radix.v1`.

### 3.1 Domains

Production domains are distinct from D0009 research domains:

- value: `tdev.semantic.value.v1`;
- radix node: `tdev.semantic.radix-node.v1`;
- root descriptor: `tdev.semantic.root.v1`;
- compact Plan binding: `tdev.semantic.plan-binding.v1`;
- Case snapshot: `tdev.case-snapshot.v3`;
- transactional head: `tdev.semantic.head.v1`.

Changing any canonical payload shape, path encoding, digest algorithm/domain, or root profile requires a new profile/version and a Class 2 migration record.

### 3.2 Path and value identity

- Paths remain the current normalized relative NFC text paths admitted by the existing `pathPolicy`.
- Radix keys are the UTF-8 bytes of those already-normalized paths. No locale or filesystem normalization participates.
- Values bind the complete normalized path and UTF-8 text content. The value digest therefore cannot alias two paths with identical content.
- Radix edges are canonical non-empty byte strings. Children are serialized in unsigned byte-lexicographic edge order.
- The radix is compressed: maximal single-child nonterminal runs are represented as one edge. Because current tree topology forbids a terminal value from also having descendants, a valid terminal node has no children.
- Equal final trees must produce equal roots independently of input order, write order, batching, or history.

### 3.3 Root descriptor

A root descriptor contains exactly:

```text
profile
nodeDigest | null
entryCount
treeBytes
rootDigest
```

`rootDigest` is the typed digest of the other descriptor fields. `entryCount` must equal the number of files. `treeBytes` is the exact current canonical-JSON byte size of the materialized `path -> text` tree and is maintained incrementally. Empty-tree `treeBytes` is two bytes for `{}`. Existing `maxTreeEntries`, `maxTreeBytes`, `maxPathBytes`, and `maxFileBytes` remain the semantic bounds; v3 must not introduce a stricter hidden tree-shape limit.

## 4. Sparse Promotion contract

Work result contracts, `baseDigest`, `planDigest`, effect keys, Claims, fencing, retries, and Task lifecycle semantics remain unchanged.

For a v3 Case:

1. the immutable base radix is constructed once at native creation or forward migration;
2. Promotion applies accepted ChangeSet writes to that base radix in deterministic Task/write order;
3. exact-path lookup and prefix traversal reject write conflict and file/descendant topology conflicts without materializing the complete tree;
4. entry count and canonical tree byte size are updated from affected entries only;
5. the Promotion result contains the current base identity plus the final v3 root descriptor and deterministic accepted/applied Task identity, but not the complete final tree;
6. successful acceptance installs that radix root as canonical authority;
7. `canonicalTree` remains available only as an explicit/lazy compatibility materialization and is never part of a v3 snapshot or v3 authority digest.

The current v2 Promotion result and full-tree digest remain unchanged for v2 Cases.

## 5. Compact Plan binding

The current `planDigest` and `baseDigest` remain stable identity inputs so already-created effect keys, envelopes, receipts, and accepted work results do not change during a forward migration.

A v3 snapshot does **not** persist `plan.baseTree`. Instead it stores a compact Plan binding containing:

- revision ID;
- the existing `baseDigest` and `planDigest`;
- the Task records in deterministic Task order;
- the base semantic root descriptor;
- a typed `planBindingDigest` over those fields.

At native creation or migration the full current Plan is validated once before the binding is admitted. On later v3 restores, the v3 binding and semantic base root are authoritative together. An implementation may lazily materialize the base tree for compatibility APIs, but steady-state checkpoint digesting must not require it.

## 6. Snapshot v3

Schema v3 keeps current Case/Task/Attempt/Event/receipt semantics but replaces whole-tree authority fields.

A v3 snapshot contains:

- `schemaVersion: 3`;
- current Case identity/state/revision/event sequence;
- compact Plan binding rather than full `baseTree`;
- current Case contract;
- Events;
- `semanticAuthority` with profile, authority epoch, migration-source identity if any, base root descriptor, and canonical root descriptor;
- Task states, Attempts, and receipts;
- a `snapshotDigest` using `tdev.case-snapshot.v3`.

A v3 successful Promotion accepted result contains no complete tree. A v3 snapshot therefore does not duplicate base/canonical trees in Plan, accepted Promotion result, or canonical state.

Unknown snapshot versions fail closed. Existing v1->v2 and v2 restore behavior remains available through the legacy repository path.

## 7. Transactional local store and head

The first v3 store is an opt-in local SQLite adapter. The package-wide legacy path remains usable on the existing Node 22 contract; the SQLite semantic adapter must fail explicitly as unavailable on runtimes that do not provide the required `node:sqlite` API.

The database has three authority classes:

1. immutable semantic objects keyed by typed digest;
2. immutable compact snapshot objects keyed by v3 snapshot digest;
3. one mutable Case head row per Case.

A Case head binds at least:

```text
caseId
authorityEpoch
generation
caseRevision
snapshotDigest
baseRootDigest
canonicalRootDigest
previousHeadDigest | null
headDigest
```

`headDigest` uses `tdev.semantic.head.v1`. `generation` increments by one per successful head publication and is distinct from Case revision. `caseRevision` remains the lifecycle revision used by the existing durable runner contract.

### 7.1 Commit transaction

One transaction must:

1. begin with a write lock suitable for a single local CAS owner;
2. read and validate the current head;
3. reject if the expected predecessor Case revision/head digest does not match;
4. insert new immutable semantic objects, rejecting same-digest/different-payload corruption;
5. insert the immutable v3 snapshot object;
6. update or create the Case head to the exact new snapshot/root identities;
7. commit.

A fresh authoritative read after commit must reproduce the head, snapshot, and every reachable object digest.

### 7.2 Ambiguous outcome

- Any injected failure before the database commit boundary must leave the predecessor head authoritative.
- If the caller cannot know whether COMMIT succeeded, the operation returns `store_commit_ambiguous`; it must not retry blindly.
- Recovery reopens the database and compares the current head with the intended successor and predecessor. Intended successor => committed; predecessor => not committed; any third state => conflict/corruption requiring operator reconciliation.

## 8. Forward migration and mixed writers

D0010 authorizes only **v2 -> v3 forward migration of a quiesced pre-Promotion Case**.

Migration admission requires all of the following:

- the source v2 snapshot passes complete current restore validation;
- it is not terminal-succeeded with an accepted Promotion result;
- canonical v2 tree/digest still equal the immutable Plan base tree/base digest;
- after `reopen:true`, there are no `running`, `queued`, `dispatch_pending`, `cancel_requested`, or `reconciling` Attempts;
- no live Claim lease is required to preserve uncertain external-effect ownership;
- the exact source snapshot digest/revision is captured immediately before target commit;
- old v2 writers are quiesced and the deployment/access path is fenced from writing that Case before the first v3 head is published.

The migrator validates/builds the compact Plan binding and base radix from the source once, converts the current lifecycle state without rewriting historical Attempt/result identities, records the source v2 snapshot digest in the v3 semantic authority record, and publishes the first v3 head transactionally.

There is no rolling mixed-write mode. An old writer racing after quiescence is an unsupported deployment violation, not a merge case. The migrator must re-read/compare the captured source immediately before target publication so a pre-publication source change aborts migration.

Terminal historical v2 Cases remain readable through the legacy repository and are not automatically rewritten by D0010.

## 9. Rollback and downgrade

- Before the first v3 head commits: ordinary code/config rollback is safe; v2 remains authoritative.
- After the migration head commits but before any later v3 head: deployment activation may roll back to the protected pre-migration v2 source only by abandoning the unadvanced v3 target as a whole. This loses only the migration representation/event and must be explicit.
- After any post-migration v3 head commits: automatic downgrade to a v2 writer is forbidden. Recovery must use the v3 path or a future explicit reverse migrator.
- The pre-migration v2 snapshot/store is protected from deletion until the migration acceptance window closes. Its presence does not make it a concurrent writer.

## 10. Corruption, scrub, repair, and GC

### 10.1 Fail closed

Every reachable semantic object is revalidated against its type/domain digest and canonical shape when loaded or scrubbed. Missing objects, malformed edges, invalid path/value records, impossible counts/byte totals, cycles, or digest mismatch fail closed. A cached materialization cannot hide these failures.

### 10.2 Repair

Hashes are not repair data. Repair may insert a missing/corrupt object only from:

- another trusted copy whose canonical payload reproduces the exact expected digest; or
- a protected source snapshot that deterministically rebuilds the exact expected root.

A repair must never move the Case head. It restores only content already named by existing authority.

### 10.3 GC

There is no automatic GC in the commit path. Explicit reference-aware GC computes reachability from all current Case heads plus explicit protected migration/backup pins. Dry-run reports candidate snapshots/objects first. Apply requires an exact expected head/pin-set digest and runs transactionally; it may delete only unreachable immutable snapshots/objects. Current heads and pinned roots are never collected.

## 11. Security and trust boundary

The SQLite database is trusted local storage under the same non-adversarial-storage assumption as current self-digested snapshots. Digests detect accidental corruption/inconsistent rewrites but do not authenticate an attacker who can rewrite the database and recompute all digests. A provider or hostile-storage adapter still needs an external MAC/signature or equivalently protected authority.

The v3 format stores no Git mode/OID, filesystem inode/mtime, platform path normalization, provider ID, executor-local path, or secret. Those remain projections/transport metadata.

## 12. Implementation scope authorized by `accepted`

D0010 may implement:

- production compressed path-byte radix objects/root descriptors and sparse deterministic Promotion;
- lazy compatibility materialization;
- compact Plan binding and schema-v3 snapshot/restore;
- opt-in SQLite semantic repository/store with expected-predecessor transactional head;
- native v3 Case creation;
- quiesced pre-Promotion v2->v3 migration with source-digest race check;
- explicit commit-ambiguity reconciliation;
- scrub, exact-object repair, and reference-aware GC dry-run/apply;
- durable-runner repository checkpoint abstraction needed so v2 and v3 stores use one lifecycle path;
- focused tests, benchmarks/evidence, and affected normative/current-state documentation.

## 13. Non-goals

D0010 does not authorize:

- converting terminal succeeded v2 Cases or rewriting historical Promotion result identities;
- a reverse v3->v2 migrator after post-migration writes;
- rolling mixed v2/v3 writers;
- Git tree/commit OIDs as semantic identity;
- real repository/Git publication adapters;
- provider/distributed transactions or distributed Claims;
- ContextSlice/model transport, warm executors, scheduler locality, or token accounting;
- automatic background GC;
- weakening D0005 hard-link publication semantics for legacy adapters.

## 14. Acceptance and verification matrix

Before D0010 may become `verified`, evidence must independently close all rows:

| Boundary | Required falsifier / evidence |
| --- | --- |
| root identity | same final valid tree from rebuild, reordered input, reordered/batched writes => same production root |
| topology | exact/ancestor/descendant conflicts rejected from radix traversal without full materialization |
| bounds | create/update/delete maintain exact entry count and canonical tree byte size; limit crossing rejects atomically |
| semantic oracle | materialized v3 roots equal current v2 Promotion tree for randomized/legal cases |
| sparse Promotion | 1/8/128 writes on large trees do not visit/hash all entries; no hidden full-tree digest in Promotion/snapshot path |
| plan identity | migrated work result/effect/fence identities retain the captured v2 `planDigest`/`baseDigest` |
| snapshot v3 | no full base/canonical tree or full Promotion tree; digest/shape corruption fails closed |
| head CAS | same expected predecessor from independent repository instances => exactly one winner |
| transaction | objects + snapshot + head are observed all-or-nothing after restart |
| ambiguity | deterministic before/at/after-commit faults classify predecessor/successor/third-state without blind retry |
| migration | quiesced eligible v2 source migrates exactly; source mutation/running/reconciling/terminal-promotion sources reject |
| rollback | pre-head and one-head activation rollback rules proven; post-v3-write downgrade rejected |
| mixed writers | source-digest recheck catches a pre-publication legacy write; docs require writer quiescence/fencing |
| corruption | altered/missing reachable object and forged count/root fail closed |
| repair | only exact expected-digest content repairs; head never moves |
| GC | current/pinned reachability preserved; stale unreachable objects removable only under expected head/pin digest |
| legacy regression | existing v1/v2/Memory/File/Journal/Immutable behavior remains green |
| environment | complete Node source gate + coverage + diff review and independent compatible POSIX/SQLite run green |

## 15. Stop gates

Stop and do not publish `mvp-1a-7` if any of the following remains unresolved:

- the production radix cannot enforce current topology/bounds without a second semantic owner or O(N) scan;
- v3 checkpoint construction still serializes/materializes the complete base/canonical tree in the normal path;
- v2 migration changes existing `planDigest`, `baseDigest`, work-result identity, effect key, fencing token, or accepted historical result digest;
- snapshot and semantic-root head cannot be committed in one trusted transaction;
- unknown commit outcome cannot be reconciled from durable state;
- mixed writers require best-effort merging rather than quiescence/fencing;
- rollback/downgrade after v3 writes is ambiguous;
- reachable corruption can be hidden by a cache or GC can collect a current/pinned object;
- SQLite availability/runtime requirements cannot be isolated from legacy v2 operation;
- existing source correctness regresses.

## 16. Completion boundary

`verified` means the bounded local v3 profile, migration, transactional head, repair/GC barriers, and declared source/environment evidence are closed. It does not mean provider durability, Git publication, distributed ownership, or universal migration of all historical v2 Cases is solved.

Only after D0010 is verified may the roadmap move to the real repository/Git projection layer over the new semantic root.

## 17. Verification record

D0010 became `verified` on 2026-08-09 after the full acceptance matrix closed for the declared local profile. The independently validated source candidate is `152f88daa7775c5d545ec865cc0a8a470b45697e`. Checked structural evidence is `docs/evidence/mvp-1a-7-semantic-authority-migration-2026-08-09.json`, committed at `d62aa597f332f7bc86fcd9de209017974826a00b`, with SHA-256 `2129639870f970a10e2aaeb7e393672e4e5faec4e9c3e332361285069890f99e`.

Independent Ubuntu/POSIX GitHub Actions run `31311936616`, job `93240950927`, used Node 22 and completed the source gate with **178/178 tests**, **92.74% line / 82.56% branch / 96.26% function coverage**, the effective diff check, **67/67 focused D0010 migration/head/recovery tests**, and the full 12-sample semantic-authority matrix. All 12 runtime matrix samples preserved semantic equality. The checked evidence independently reproduced the same structural conclusions.

At 100,000 files and one touched path, the checked matrix recorded **14 semantic-node reads, 7 node writes, and 8 object deltas**. The compact v3 snapshot was **3,396 bytes** versus **6,180,415 bytes** for the corresponding schema-v2 snapshot. This is evidence that normal v3 authority construction is sparse and compact; explicit compatibility materialization still scales with the complete tree and remains outside the normal authority path rather than being relabeled as constant work.

The connected tmcp/Termux filesystem is still not qualified for the inherited ImmutableJournal hard-link publication primitive, so its full legacy suite is not counted as a green environment gate. A directly executable local v3 focused subset passed **26/26** with clean diff. The complete legacy + v3 source claim comes from the independent Ubuntu/POSIX run above.

This verification closes the local radix/root, compact snapshot, transactional-head CAS/ambiguity, quiesced migration, rollback/downgrade barrier, corruption/scrub, exact repair, reference-aware GC, legacy-regression, and environment rows. It does not widen the design beyond the non-goals and completion boundary above.
