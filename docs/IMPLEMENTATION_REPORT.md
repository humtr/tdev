# mvp-1a-7 D0011 real Git projection and fenced-publication report

- Date: 2026-08-10
- Development branch: `mvp-1a-7` — same mutable development direction; no new `mvp-*` branch is created for D0011
- Direct source predecessor for D0011 design: `mvp-1a-7@3048286a88c2687a2206cc3bcb4faab924be88d9`
- Design: `docs/design/0011-real-git-projection-and-fenced-publication.md`
- Status: `verified` for the bounded local real-Git projection/ref-CAS profile
- Independently validated source candidate: `c321e9079855c87b9df806930b2cd48c61244e9b`
- Checked evidence: `docs/evidence/mvp-1a-7-git-projection-2026-08-10.json`
- Evidence SHA-256: `b62bcc3c4f96b407a228a7e35c832f06936087db0ff9954e7dea538142fcfebd`
- Independent validation: GitHub Actions run `31325628829`, job `93275404092`
- Projection profile: `tdev.git.text-tree.v1`

D0011 implements the next gate after D0010 without changing development direction or semantic authority. A validated D0010 `SemanticRadixTree` is projected into real Git blob/tree/commit objects while the D0010 semantic root and transactional Case head remain tdev authority. Git object format, file mode, commit metadata, and predecessor can change Git OIDs without changing the tdev semantic root, so Git OIDs are recorded only as derived projection identities.

The local adapter is intentionally plumbing-only. It writes exact UTF-8 file contents as `100644` blobs, constructs Git trees and an explicit-metadata commit, and operates successfully in bare SHA-1 and SHA-256 repositories without an index or worktree. `project` may create immutable candidate objects but cannot move the publication ref. Only `publish` may advance one direct full `refs/heads/...` ref, and it uses one exact expected-predecessor `update-ref` CAS.

Publication ambiguity is explicit rather than guessed. A pre-update failure leaves the predecessor or absence current; a lost response after a successful ref update is recovered by rereading the durable ref; a third OID is a conflict. Reconciliation is read-only and does not recreate candidate objects. Rollback is a separate exact ref CAS back to the predecessor, or an exact conditional delete for a ref created from absence. Any intervening publication fences a stale rollback.

The implementation also hardens the trust boundary around a local Git process. It strips inherited `GIT_*` routing/configuration variables, disables replacement refs and repository hooks for its plumbing calls, requires a direct `refs/heads/...` ref, validates predecessor commit type and explicit commit metadata, and rereads candidate Git tree/blob bytes before publication. Those bytes are passed back through the existing tdev semantic-tree policy and must reproduce the candidate semantic root. Raw commit bytes must also match the bound tree, parent, and metadata, so recomputing a typed candidate digest cannot hide a different projection.

Independent Ubuntu/POSIX validation on Ubuntu 24.04.4 LTS / Node `v22.23.1` / Git `2.54.0` passed **191/191 complete source tests**, **92.80% line / 82.37% branch / 96.34% function coverage**, **13/13 focused D0011 real-Git tests**, SHA-1/SHA-256 bare-repository capability checks, and the effective diff gate. The connected tmcp/Termux runtime independently passes the focused D0011 13/13 gate under Git 2.55.0, but its inherited complete source suite is still not promoted as green because the existing ImmutableJournal hard-link publication primitive returns `EACCES` in the job-private filesystem.

The D0011 completion boundary is therefore narrow: **real local Git projection plus one fenced local branch-ref publication/reconciliation/rollback lane**. It does not verify remote fetch/push or remote ref CAS, GitHub/GitLab authorization or protected-branch rules, signed commits/refs, multi-host publication ownership, provider transaction coupling, Git-object GC, or hostile repository authenticity. If remote publication remains the chosen direction, that becomes a separate Class 2 provider-facing design on the same `mvp-1a-7` branch unless the user explicitly changes development direction.

---

# mvp-1a-7 D0010 semantic-authority migration and transactional-head report

- Date: 2026-08-09
- Direct code parent: exact `mvp-1a-6@131204b782d7c7b64edceb55e335fba10c8e5aee`
- Design: `docs/design/0010-semantic-authority-migration-and-transactional-head.md`
- Status: `verified` for the bounded opt-in local semantic-v3 profile
- Independently validated source candidate: `152f88daa7775c5d545ec865cc0a8a470b45697e`
- Checked evidence: `docs/evidence/mvp-1a-7-semantic-authority-migration-2026-08-09.json`
- Evidence SHA-256: `2129639870f970a10e2aaeb7e393672e4e5faec4e9c3e332361285069890f99e`
- Independent validation: GitHub Actions run `31311936616`, job `93240950927`
- Production semantic profile: `tdev.semantic.path-byte-radix.v1`

D0010 closes the separate Class 2 migration/transactional-head gate opened by D0009. It does not retroactively make D0009 wrong: D0009 measured C3 as the lower structural-count research candidate, while D0010 adds a production requirement that the same semantic authority enforce exact/ancestor/descendant file topology without a full scan or second synchronized prefix owner. That requirement promotes the compressed UTF-8 path-byte radix for the opt-in v3 profile. C3 remains a research reference.

The v3 vertical slice keeps existing Task/Attempt/Event/result/Claim semantics and legacy v2 repositories. It replaces full-tree authority packaging only for explicitly selected v3 Cases: typed immutable semantic values/radix nodes produce versioned root descriptors; successful Promotion persists a semantic root instead of a complete final tree; schema-v3 snapshots bind a compact Plan identity and base/canonical roots without full `plan.baseTree`, `canonicalTree`, or Promotion tree copies. Compatibility materialization remains explicit and may be O(N).

Durable election is one expected-predecessor Case head in a trusted local SQLite transaction. Immutable objects and snapshots are not current merely because they exist. One transaction checks the predecessor, inserts immutable objects/snapshot, and advances the head. A possibly committed transaction returns `store_commit_ambiguous`; recovery reopens and classifies the durable head as intended successor, unchanged predecessor, or a conflicting third state rather than blindly retrying a callback or external effect.

Forward v2->v3 migration is deliberately not rolling. It accepts only a fully valid pre-Promotion v2 Case, requires explicit writer and Claim quiescence, captures the source snapshot digest/revision, and rereads that source immediately before publishing the first v3 head. A source race aborts. Before the first head, v2 remains authoritative; an unadvanced generation-1 migration target may be abandoned explicitly; after any later v3 write, automatic downgrade is forbidden. The protected source v2 store remains a rollback source through the migration acceptance window.

Corruption handling is fail closed. Scrub revalidates every reachable typed object/root/snapshot. Repair may restore only canonical bytes that reproduce an exact digest already named by authority and never moves the Case head. GC is explicit and reference-aware: reachability starts from all current heads plus protected pins, dry-run reports candidates, and apply requires the exact expected head/pin-set state before deleting only unreachable immutable objects/snapshots.

Independent Ubuntu/POSIX validation passed **178/178 complete source tests** with **92.74% line / 82.56% branch / 96.26% function coverage**, clean effective diff, and **67/67 focused D0010 migration/head/recovery tests**. The 12-sample authority matrix preserved semantic equality in every sample. The checked evidence reproduced the structural result: at 100,000 files and one touched path the v3 update uses **14 semantic-node reads, 7 node writes, and 8 object deltas**; the v3 snapshot is **3,396 bytes** versus **6,180,415 bytes** for v2. Compatibility materialization is still total-tree work and is reported separately.

The connected tmcp/Termux environment still denies the hard-link primitive required by the inherited ImmutableJournal adapter, so a full local legacy gate there is not promoted as green. The directly executable local semantic-v3 subset passed 26/26; the complete legacy + v3 source claim comes from the independent Ubuntu/POSIX run. This preserves the earlier filesystem qualification boundary rather than weakening it to make a local test pass.

D0010 therefore verifies exactly this boundary: **opt-in local semantic-v3 authority, compact snapshot, transactional head, quiesced forward migration, explicit ambiguity recovery, rollback/downgrade barrier, scrub/exact repair, and reference-aware GC**. It does not verify a real Git repository/publication adapter, Git OID authority, provider/distributed transaction ownership, distributed Claims, hostile-storage authenticity, ContextSlice/model transport, or universal rewriting of historical v2 Cases. The next highest-ROI gate is the real repository/Git projection and fenced publication layer over the verified semantic root.

---

# mvp-1a-6 D0009 semantic-authority representation comparison report

- Date: 2026-08-09
- Direct code parent: exact `mvp-1a-5@aaf7ec9258fb776443dd70345a1acea33ed22d78`
- Design: `docs/design/0009-semantic-authority-representation-comparison.md`
- Status: `verified` for non-authoritative representation comparison only
- Final path-key-aware source candidate: `7ba03082ac94fe75242c22a7b31ca76d933aeb0c`
- Checked raw evidence: `docs/evidence/mvp-1a-6-semantic-authority-representation-2026-08-09.json`
- Evidence SHA-256: `f8609316970e28f311d83aecb550b7be07d0a1d53938517931f9271e09ad5db4`
- Independent validation: GitHub Actions run `31306276819`, job `93227063683`
- Production authority change: none

D0009 was opened only after D0008 verified that the current whole-Case authority path remains total-size dependent. The new code is confined to `bench/` comparison models/harnesses, one focused test file, the `bench:semantic` package command, checked evidence, and documentation. No `src/` production authority path, current `treeDigest`, snapshot v2, journal format, migration/rollback rule, Git-OID status, provider/distributed owner, or publication behavior changes in this stage.

The comparison deliberately separates candidate-root structural work from the current compatibility tax. Every completed model must materialize the exact current normalized text map and reproduce the current Promotion `treeDigest`. The final matrix contains 12 tree cases (three shapes × four sizes), four write batches, and three candidate families for 144 model samples. 141 completed with exact Promotion-tree and legacy-digest equality. Three 100k broad samples completed candidate-root update and then stopped only during full compatibility materialization/digest at the declared 768 MiB RSS gate; they are retained as stopped evidence rather than extrapolated.

The simple directory-Merkle model is rejected. On a 100k-entry wide-flat tree, one write hashes 100,000 sibling references and about 10.2 MB of directory metadata. A balanced directory shape reduces that fanout, but a semantic representation cannot rely on repositories avoiding wide directories.

Both bounded candidates survive structurally. The path-byte radix model keeps normalized path-prefix locality and avoids path-key hashing. At 100k entries its one-write update rewrites 16 nodes in wide-flat, 32 in deep-path, and 37 in balanced-directory. The collision-safe path-hash Patricia/trie model rewrites six nodes for a one-write 100k update in every checked shape and keeps deterministic complete-path collision buckets. In the 100k wide-flat 10k-write sample, the hash trie rewrites 21,756 nodes, performs 31,757 typed node/value hashes plus 10,000 explicitly counted path-key SHA-256 operations, and hashes about 8.59 MB typed payload plus 0.50 MB path-key input. The radix model rewrites 61,117 nodes, performs 71,118 typed hashes, and hashes about 15.42 MB. The hash-trie family is therefore the preferred **research candidate for the next migration design**; radix remains a required fallback/reference if prefix locality, path-key policy, proof/repair behavior, or persistent-store/GC properties overturn the measured advantage.

A small transactional root/head remains orthogonal to the structural choice. Hypothetical research heads stayed about 306-313 bytes, but D0009 implements no authoritative head. A future migration needs one trusted expected-predecessor CAS/transaction owner and must define root/profile identity, path-key/collision rules, mapping from the current text tree, migration epoch/quiescence, mixed-writer exclusion, legacy-digest cutover, rollback/downgrade, ambiguous publication recovery, corruption/scrub/repair, reference-aware GC, security bounds, provider-independent identity, and old-snapshot behavior.

Independent Ubuntu/POSIX validation passed 152/152 source tests. Coverage completed at 92.57% line, 83.10% branch, and 95.99% function coverage; the effective diff check and full D0009 matrix also passed. Focused tests additionally prove final-root history independence, write-order determinism, create/update/delete semantics, injected same-key collision preservation, the directory-Merkle wide-fanout falsifier, bounded sparse candidate work, and batch shared-ancestor reuse.

The architectural decision is therefore precise: **reject simple directory Merkle; retain C2 radix and C3 hash trie as structural survivors; prefer C3 for the next Class 2 migration/transactional-head design; keep current full-tree authority until that later design is accepted and verified.** Git remains a derived projection rather than semantic identity.

---

# mvp-1a-5 D0008 verification report

- Date: 2026-08-09
- Direct code parent: exact `mvp-1a-4@1ff7c5d321958df725497d4e3a2649e210b029db`
- Design: `docs/design/0008-authority-boundary-verification-and-durability-admission.md`
- Status: `verified` in the declared Node 22 source and compatible local/POSIX filesystem scope
- Independently validated source/evidence candidate: `cf6b89d6bb2cff0b60ab2ca1a4521631f68c559f`
- Authority evidence: `docs/evidence/mvp-1a-5-authority-boundary-2026-08-09.json`, SHA-256 `57add849efafa93fa74b830ae29001ffc06c783fb70b55c94dcc4052be6ed79c`
- Historical evidence policy: Designs 0001-0007 and their existing evidence retain their original claims

D0008 closes the bounded authority/durability gate without changing canonical tree identity, snapshot schema, immutable-journal record format, migration/downgrade barriers, Git OID semantics, or provider/distributed ownership. The implementation was deliberately split into small commits: `9b54599d3e60759e845477edef3e58ff9fc6816c` (store capacity/namespace/fault seam), `7be537275f823d415dc9072995be08ebb43b1baa` (durable effect capacity admission), `a5eac9842662a0a84af7aa6d449ceda46ae0473f` (authority-path harness), `1b16ffd47030a0e3a4637078a298c4f471b29f2c` (failure-boundary tests), and `cf6b89d6bb2cff0b60ab2ca1a4521631f68c559f` (raw authority evidence).

The six accepted decisions are now executable: SnapshotStore owns materialized capacity; every durable checkpoint uses exact capacity assertion when available; external-effect work proves bounded running/success/failure/reconciliation fit before the real Attempt/executor boundary; legacy committed-looking namespace shapes fail closed; immutable publication has deterministic pre-publication/ambiguity/cleanup fault evidence; and failed settlement checkpoints preserve the durable predecessor and Claim lease until `reopen:true` recovery is durably persisted.

Verification evidence is layered. Locally executable syntax and durable/store focused tests passed 33/33 with clean `git diff --check`. The same source candidate was published only to `research/d0008-posix-validation` for independent Ubuntu/POSIX validation. GitHub Actions run `31302061543`, job `93216333090`, completed install, `npm run check`, `node --experimental-test-coverage --test test/*.test.mjs`, `git diff --check`, and the 16-sample authority-harness smoke successfully with ImmutableJournal hard-link tests enabled. The connected tmcp/Termux filesystem itself denied hard-link creation on every writable mount probed, so it is not qualified for `ImmutableJournalSnapshotStore` publication; this environment limitation did not justify weakening the D0005 hard-link no-replace CAS primitive.

The checked full authority matrix configured 32 samples: 1k/5k/20k/100k trees, 1/8/128/broad writes, and wide-flat/deep-path shapes. All 24 completed 1k/5k/20k samples matched the current Promotion oracle and cold restore exactly. All eight 100k samples hit the declared 30 s or 768 MiB stop gate and are retained as stopped evidence; sparse 1/8-write samples include stops in Promotion oracle/result acceptance. The observed conclusion is therefore stronger than “Git candidate construction is sparse”: current semantic Promotion/snapshot authority remains total-size dependent even when writes are sparse.

The next highest-ROI step is not to smuggle a Git tree OID, Merkle root, HAMT, or transactional head into authority. It is to open a separate Class 2 semantic-authority representation comparison with exact identity/domain separation, migration, rollback/downgrade, mixed-writer exclusion, corruption/repair, GC, security, and recovery rules. Git remains a derived repository/publication projection unless such a design explicitly changes semantic authority.

---

# Historical precursor — 2026-08-09 post-freeze authority-boundary re-audit addendum

- Audited baseline: exact `mvp-1a-4@1ff7c5d321958df725497d4e3a2649e210b029db`
- New planning record: `docs/design/0008-authority-boundary-verification-and-durability-admission.md`
- Historical D0008 status at the time of this precursor: `draft`; this paragraph is superseded by the verified report above
- Historical evidence policy: Designs 0001-0007 and existing `docs/evidence/*.json` retain their original claims and are not rewritten by this addendum

The D0007 source/container evidence remains valid for its declared scope. A later full-lineage/source re-audit changes the **immediate next-work conclusion**, not the recorded D0007 benchmark result. The previous sentence that the next highest-ROI gate should directly implement touched-path/content-addressed Promotion in the first real repository adapter is therefore superseded as current planning guidance.

The re-audit found that the represented bottleneck and correctness boundary are broader than `promotion.mjs` whole-tree copy/hash. The schema-v2 authority path packages the compiled Plan (including full `baseTree`), complete accepted-result state, the canonical tree, Attempts, Events, receipts, and a whole-snapshot digest. A successful Promotion accepted result also retains the complete final tree while `canonicalTree` holds the same semantic result. Storage delta/materialization caches can reduce retained bytes or replay work without eliminating that upstream authority packaging.

The same audit isolated four hardening gaps that must precede semantic-representation migration claims:

| Boundary | Current observation | Planning consequence |
| --- | --- | --- |
| aggregate durable admission | component limits and store `maxBytes` are separate; no compositional proof shows every component-valid Case transition fits the configured durable snapshot bound | D0008 must freeze an owner and pre-commit falsifier before code claims durable closure |
| legacy journal namespace | recognized legacy contents are validated, but malformed committed-looking `delta-*` names and recognized-name non-regular entries are not all rejected by legacy enumeration | raise implementation/tests to the existing fail-closed protocol; do not weaken the protocol |
| immutable publication ambiguity | source deliberately returns `store_commit_ambiguous` after possible final-slot publication when directory durability fails | add deterministic fault injection and re-read reconciliation evidence; do not infer failure or retry safety |
| settlement checkpoint / Claim liveness | settlement mutates in-memory terminal state, awaits durable checkpoint, then releases the terminal lease | define and test the checkpoint-exception recovery path without unsafe unconditional release |

Real-Git research remains useful but is demoted from architecture authority to evidence. Sparse Git candidate construction can avoid unchanged blob reads, yet full current semantic materialization/validation/digest and complete Case snapshot work remain size-dependent. Git tree OIDs also depend on representation facts absent from the current tdev semantic tree, including file mode and repository object format. The current tdev semantic tree digest therefore remains distinct from derived Git object identity.

The revised sequence is:

```text
Historical D0008 draft questions
-> accepted authority-boundary measurement + durability hardening gate
-> verified full-path evidence
-> separate semantic-authority representation decision if justified
-> real repository/Git projection and fenced publication
-> real context/model/provider layers
```

At the time of this precursor, D0008 authorized no source behavior change while draft. The verified report above supersedes that historical gate state. The second boundary remains current: until a later separate Class 2 migration design is accepted, no Merkle/HAMT/content-addressed root, trusted transactional head, or Git OID becomes semantic authority by implication.

---

# mvp-1a-4 D0007 promotion report

- Date: 2026-08-08
- Current development identity: `mvp-1a-4`
- Direct code parent: `humtr/tdev` `mvp-1a-3` at `52e79323f80bccd1123b7a538a6d49d5754cd1ec`
- Current design: `docs/design/0007-verified-immutable-journal-materialization-cache.md`
- Measurement precursor: `docs/design/0006-persistence-hot-path-measurement.md`
- Structured evidence: `docs/evidence/mvp-1a-4-materialization-reuse-2026-08-08.json`
- Verified runtime: Node.js 22.16.0 / npm 10.9.2 / Linux x64

## Independent decision

The D0006 profiling gate reproduced the D0005 immutable-journal performance gap and separated retained-byte observation from strict replay. At 32 Tasks / 4 KiB observations, retained-byte read plus exact fingerprint was small relative to repeated prefix replay/materialization. Cumulative prefix replay byte-work rose from 17,743,078 bytes at 16 Tasks to 144,222,942 bytes at 32 Tasks. This evidence opened D0007 V and did not justify an authority-changing checkpoint/Merkle design.

D0007 therefore keeps D0005 durable authority, durable bytes, migration boundary, and hard-link no-replace publication unchanged. `ImmutableJournalSnapshotStore` still strictly lists the committed namespace and rereads every retained authoritative file byte on every load and non-create CAS. It may reuse an instance-local materialized snapshot only when an ordered SHA-256 fingerprint over filename, length, and raw bytes exactly matches a materialization previously established by strict validation or by an unambiguously durable local commit from such a predecessor. Mismatch, restart, or cache loss performs the complete D0005 strict parse/validation/replay path.

The cache is disposable and non-authoritative. It cannot elect a CAS winner, replace retained history, skip namespace validation, survive as a durable head, or hide a changed retained byte. Publication conflict and `store_commit_ambiguous` do not promote cache state.

## Implementation and owner alignment

The source change is deliberately limited to the immutable-journal read/materialization path. The D0005 delta format and publication slots are unchanged. The promotion also corrects all affected owner text that previously described Immutable as having no materialized cache at all: `SPEC`, `ARCHITECTURE`, `OPERATIONS`, `SECURITY`, `DEPLOYMENT`, `MVP`, `LINEAGE`, and `WORKBOARD` now agree on exact-byte-gated process-local reuse while retaining full retained-byte observation.

Two focused regression barriers supplement the inherited D0005 suite: a warm instance must reject a malformed committed-looking namespace entry before reuse, and it must reject a non-regular `base.json` authority slot before reuse. Existing warm historical corruption, restart, migration, fork/gap, stale-CAS, and same/cross-process one-winner tests remain unchanged.

## Verification evidence

Before archive publication the promotion source passed:

- focused immutable-journal suite: 20/20;
- complete source suite: 130/130;
- `npm ci --ignore-scripts --no-audit --no-fund`;
- `npm run check`, including syntax checks and both demos;
- coverage run: 91.84% lines, 81.82% branches, 96.19% functions;
- `git diff --check`.

The checked-in `bench/persistence-hot-path.mjs` harness then compared the exact parent source and promotion candidate with identical Case IDs, 32 Tasks, 4 KiB observations, capacity 8, three rotated-order repeats. D0005 Immutable measured 3397.535 ms p50; D0007 Immutable measured 1007.262 ms p50, a 3.373x improvement. Candidate Journal measured 1014.298 ms p50, so D0007 Immutable was effectively at Journal cost. Immutable retained bytes were identical at 277,023 bytes, and fresh-instance load remained about 97 ms in both states, preserving strict replay on cache loss/restart.

These performance values are evidence for the design decision, not a production SLO.

The final source-freeze `tdev-mvp-1a-4` export excludes `.git`, `node_modules`, coverage/cache output, and transient state. Its archive entries are checked for absolute/traversal paths and symbolic-link entries, then it is extracted into an empty directory, freshly installed, and required to pass 130/130 `npm run check` before delivery.

## Boundaries and next work

D0007 does not claim distributed/provider CAS, hostile-storage authenticity, Cloudflare Durable Object or D1/R2 behavior, cross-owner Claim durability, repository/context/model transport, or production SLOs. It also does not introduce an authoritative checkpoint/head, history GC, compaction, SQLite authority, or migration to a transaction provider.

With the persistence replay bottleneck removed without changing authority, the next highest-ROI gate returns to the first real repository adapter: measure and implement touched-path/content-addressed Promotion so canonical integration no longer copies and hashes the full tree unnecessarily.

---

# Retained mvp-1a-3 report

The remainder of this file is the prior `mvp-1a-3` implementation report retained unchanged as historical evidence.

# mvp-1a-3 independent review, implementation, and verification report

- Date: 2026-08-07
- Current development identity: `mvp-1a-3`
- Remote source parent: `humtr/tdev` `mvp-1a-2` at `ee02845c8947b69f810308fd957e3952a8e508b9`
- Current design: `docs/design/0005-immutable-expected-revision-journal-cas.md`
- Structured evidence: `docs/evidence/mvp-1a-3-immutable-journal-2026-08-07.json`
- Verified runtime: Node.js 22.16.0 / npm 10.9.2

## Current conclusion

The comparison did not justify merging B or replacing any A subsystem wholesale. The independently reproduced evidence supports one narrow improvement: an expected-revision immutable publication protocol can add cross-process local-filesystem winner election without weakening the parent corruption envelope **if** every load/CAS still performs strict retained-history replay and the legacy-to-v2 writer cutover is explicit.

Design 0005 therefore adds a separate opt-in `ImmutableJournalSnapshotStore`. It does not replace Design 0004 `JournalSnapshotStore`, does not add checkpoint/cache/compaction/history deletion, and does not claim distributed/provider semantics. The final source suite preserves the parent blocker, scheduler repair, FileSnapshotStore, restore-oracle, and capacity-independent execution barriers.

Compiled-base Promotion remains a follow-on hypothesis. B demonstrated that redundant base validation has measurable local cost, but B's `Object.isFrozen()` trust mechanism is not a provenance proof and the current repository priority remains a real repository adapter before adding a new in-memory Promotion trust capability. No D0006 implementation is claimed here.

## A. Comparison findings

| Finding | Result | Consequence |
| --- | --- | --- |
| B independent `FileSnapshotStore` instances at one expected revision | reproduced: 50/50 runs allowed both writers to report success; A was 0/50 both-success | B locking rejected; A process-wide File-store serialization preserved |
| B warm Journal after retained historical corruption | reproduced: warm writer appended a new commit while a fresh reader rejected the same durable state | proposal/materialization cache rejected for this slice |
| B compiled-base trust | reproduced: arbitrary frozen base plus inconsistent digest was accepted by the fast path while the public path rejected it | B trust implementation rejected; optimization idea only retained |
| B checkpoint present/absent semantic corruption | reproduced: checkpoint-present load succeeded while checkpoint-absent replay failed | B checkpoint implementation rejected |

The A/B ZIP SHA-256 values and falsifier-result digests are retained in the structured evidence file. The comparison artifacts were reused only after their source identities were confirmed unchanged.

## B. Preserved correctness barriers

The current source still proves:

- deterministic topological blocker propagation independent of lexical Task ID order;
- complete blocker evidence after failure/cancellation;
- authoritative reconcile/rebuild before scheduler deadlock after disposable candidate loss;
- one same-process `FileSnapshotStore` CAS winner across independent instances;
- one execution model for capacity 1 and capacity N;
- canonical output independence from completion order, executor identity, accepted-result order, and retry interleaving within the declared acceptance scope;
- 100 seeded randomized transition histories checked by full untrusted restore after every transition;
- Design 0004 warm/cold corruption visibility for its existing journal adapter.

These remain regression evidence, not a declaration that A source is itself normative authority.

## C. J1 aggressive review and resulting contract

### Revision continuity

A Case mutation may emit more than one Event before a repository CAS. Therefore the correct storage invariant is not `toRevision = fromRevision + 1`.

A v2 delta requires:

```text
toRevision > fromRevision
appendedEvents.length == toRevision - fromRevision
eventSequence == toRevision
sourceSnapshotDigest == predecessor.snapshotDigest
semantic replay snapshotDigest == targetSnapshotDigest
```

A focused multi-Event test proves a revision jump greater than one replays exactly.

### Legacy/new coexistence

The accepted ordering is a legacy-v1 prefix followed by an immutable-v2 suffix. A legacy record after the first reachable v2 record fails closed. Two records with one predecessor are a fork even when their formats differ; no precedence rule silently chooses one.

A separate mixed-process falsifier found an important migration boundary: a live legacy writer and a live immutable writer can both publish from one predecessor because their final filenames differ. Consequently the first v2 publication is not a rolling-format transition. The migration owner must quiesce all legacy writers before the first v2 CAS. New-source legacy and immutable adapters share one same-process lock, but this does not substitute for cross-process cutover evidence.

### Publication

For v2 writes the authoritative identity is `delta-from-<expectedRevision>.json`. The writer canonicalizes to a unique dot-temp, fsyncs the file, hard-links it to the final no-replace slot, fsyncs the Case directory, then removes the temporary name best-effort.

The independent-process base-create race and update race each elect exactly one winner on the tested compatible local filesystem. Orphan dot-temporary files do not poison future CAS. A recognized final slot occupied by a non-regular filesystem entry fails closed rather than being ignored.

If final publication may already have happened but directory fsync fails, source code returns `store_commit_ambiguous` and preserves the possible success for reconciliation. That branch was code-reviewed but was not deterministically fault-injected in this container, so power-loss durability is not claimed beyond the observed environment.

### Replay and corruption

Every immutable-journal load/CAS fully re-reads, parses, validates, and semantically replays retained authority. There is no warm proposal state, checkpoint, materialization cache, or authority-changing compaction. Tests cover stale writers, source/target digest binding, semantically modified/re-digested history, noncanonical and unknown records, malformed and unsafe filenames, missing base/predecessor, fork/gap/unreachable records, materialized bounds, restart, and legacy compaction-cleanup crash shape.

## D. Checkpoint/cache authority model

The current recommendation is **hold**.

A correctness-neutral non-authoritative checkpoint is possible in principle only if retained history remains independently verifiable. One conservative model would store a checkpoint snapshot plus an exact content-hash manifest for every covered authoritative record, then still re-read and hash those retained bytes before using the checkpoint. That can skip repeated parse/semantic replay when hashes match, but it cannot eliminate retained-history I/O under the current corruption envelope. Its value therefore needs measurement before adding another optimization state.

Avoiding the retained-byte verification itself requires a stronger authority model: for example a trusted transactional owner, protected authenticated root, or explicitly designed history-GC/root-transition protocol. None exists in the current local adapter contract. B's head/predecessor-only cache is therefore not an acceptable substitute.

## E. Promotion provenance decision

B's fast path showed that initial full-base validation has measurable local cost, but the current implementation's trust boundary is invalid: `Object.isFrozen(baseTree)` proves immutability, not compiler provenance, PlanRevision identity, or digest binding.

If Promotion is reopened later, the simplest credible direction is an exact Plan-produced, process-local, non-serializable proof keyed by object identity, such as a module-private `WeakSet`/`WeakMap` brand on compiled Plan objects. The internal fast path should accept the exact compiled Plan/capability rather than a caller-supplied tree plus claimed digest. It must still perform accepted-result validation, path/conflict checks, final tree validation, and final digesting.

D0006 is not opened in this source state because the current WORKBOARD places real repository/substrate measurement ahead of Promotion specialization and the observed in-memory saving does not yet justify the added trust mechanism at total-system scope.

## F. Design split

Separating Journal and Promotion is correct under `SDD.md` Class 2 rules. Journal changes persistence, migration, rollback, filesystem publication, and CAS ownership. Promotion changes validation elision, provenance/trust, and canonical-tree construction. They have independent rollback and verification boundaries and should not share one acceptance closure.

D0005 is verified. D0006 remains unopened/held.

## G. Final classification

| Candidate | Decision |
| --- | --- |
| expected-revision immutable Journal CAS | **modified then adopted** as Design 0005 / `ImmutableJournalSnapshotStore` |
| checkpoint idea | **hold**; safe form may only skip parse/replay while retained bytes are still verified, unless a new authority transition is designed |
| B checkpoint implementation | **discard** |
| proposal/materialization cache | **hold** as a concept; B implementation **discarded** |
| compiled-base Promotion | **hold**; idea remains plausible, B trust mechanism discarded |
| B `FileSnapshotStore` locking | **discard** |
| B blocker changes | **discard** |
| B runner changes | **discard** |

## Implementation evidence

Implemented paths:

- `src/store.mjs`: `ImmutableJournalSnapshotStore`, v2 record validation/replay/publication, old-adapter downgrade guard, common same-process journal-family serialization;
- `src/index.mjs`: package export;
- `test/immutable-journal.test.mjs` and its process-writer fixture: 18 focused tests;
- Design 0005, affected persistence/architecture/protocol/MVP owners, lineage/workboard, and structured evidence.

Observed gates:

- focused immutable journal: 18/18 passed;
- immutable plus existing store tests: 39/39 passed;
- `npm ci --ignore-scripts --no-audit --no-fund`: passed;
- `npm run check`: passed;
- complete tests: 128/128 passed;
- inherited 100-history full-restore oracle: passed after every transition;
- final coverage invocation: 128/128 passed, 91.73% lines / 81.72% branches / 96.14% functions;
- `git diff --check`: passed.

No performance acceptance is claimed for D0005. It deliberately trades full retained-history read/replay cost for a stronger local cross-process CAS option. No checkpoint/cache benchmark was run because those features were not implemented.

Remaining unknowns and non-claims:

- cross-process mixed legacy/new writer operation is unsupported during cutover;
- directory-fsync-after-link failure classification was not deterministically fault-injected;
- power-loss durability beyond the observed compatible local filesystem is unverified;
- network filesystems, distributed/provider storage, Durable Objects, deployment, public MCP/client behavior, and provider rollback remain unverified;
- no automatic v2-to-v1 data downgrade exists, and unmodified `mvp-1a-2` is unsafe after a v2 record is written;
- checkpoint/cache acceleration and Promotion optimization are not part of this implementation.

---

## Historical `mvp-1a-2` report retained as evidence

The remainder of this document is the prior `mvp-1a-2` report. Its historical identity, measurements, and export statements are retained as evidence and do not override the current `mvp-1a-3` section above.


- Date: 2026-08-07
- Final development identity: `mvp-1a-2`
- Direct code parent: `mvp-1a-1`
- Knowledge inputs: `mvp-1`, `mvp-1a-1`, their tests, benchmarks, failures, counterexamples, and normative documents
- Audited source archives:
  - `tdev-mvp-1.zip`: `e51c8fe2addbd9b289847c22e5643188d632a1408de339ab2bd66403f82fabf5`
  - `tdev-mvp-1a-1.zip`: `8ddd7b461d73e965e8645e1bf3a0442187f67d678df2d3b2c5d9dec948135ae2`
- Verified runtime: Node.js 22.16.0 / npm 10.9.2 / Linux x64
- Normative implementation decision: `docs/design/0004-incremental-transition-core-and-verified-journal-cache.md`
- Reproducible evidence:
  - `docs/evidence/development-state-comparison-2026-08-07.json`
  - `docs/evidence/mvp-1a-1-control-plane-benchmark-2026-08-07.json`
  - `docs/evidence/mvp-1a-2-control-plane-benchmark-2026-08-07.json`
  - `docs/evidence/correctness-audit-2026-08-07.json`

This report treats the supplied documents and benchmark files as hypotheses and evidence, not as authority over the source. The audit order was source, tests, runtime paths, persistence/recovery, semantic diff, fresh measurement, and only then reconciliation with the existing documents.

## Executive conclusion

`mvp-1a-1` was materially better than `mvp-1`, but it was not a finished performance or durability result. It removed several obvious whole-Case operations, yet ordinary transitions still copied root records and repeatedly derived global state. Its journal cache could become a stale CAS authority and could hide later corruption. Its Claim trie retained released path history, its runner could false-deadlock after disposable ready-state loss, and a cancellation/blocker graph could exceed the reserved Event budget.

The final implementation keeps the `mvp-1a-1` Work Graph, lifecycle, fencing, Claim, persistence schema, Promotion, and repository boundaries. It rewrites the transition transaction, dependency/Case accounting, blocker propagation, Claim-index cleanup, scheduler rebuild boundary, and journal cache verification. That makes the technically correct lineage `mvp-1a-2`: a direct architectural successor with major subsystem replacement, not a sibling from `mvp-1` and not a new generation.

The highest measured source-level gain is removal of per-transition O(V) root work. In fresh child processes, 2,048-wide execution fell from a `mvp-1a-1` single observation of 15,733.856 ms to a `mvp-1a-2` p50 of 970.171 ms. The corresponding 2,048-chain result fell from 17,244.632 ms to 908.019 ms. All completed comparison samples produced the same canonical digest. These are local kernel microbenchmarks with an immediate deterministic executor, not provider or production SLO claims.

---

# A. Independent evaluation of `mvp-1 -> mvp-1a-1`

## A.1 Changes that were genuinely good

### Copy-on-write direction

`mvp-1a-1` correctly identified whole-Case rollback cloning as a dominant cost. Moving mutation work toward changed records was the right design direction and explains a large part of the improvement over `mvp-1`.

Evidence:

- 128-wide, capacity 16: `mvp-1` p50 2,450.946 ms; `mvp-1a-1` p50 144.764 ms.
- 256-wide, capacity 16: `mvp-1` p50 10,477.996 ms; `mvp-1a-1` p50 350.103 ms.
- exact canonical digests matched for completed samples.

### Incremental Event validation frontier

Validating only newly appended Event-chain suffixes is compatible with the immutable prefix contract. `mvp-1a-1` correctly recognized that revalidating the entire immutable Event history on every transition is redundant.

### Claim overlap index

The trie-based candidate index preserved the pure Claim conflict oracle and changed disjoint admission from an active-lease scan to path-local lookup. This was a real asymptotic improvement for large active lease sets.

### Scheduler ready candidates and reverse edges

A disposable ready candidate set and precomputed reverse dependencies are appropriate acceleration state. They reduce repeated graph scans while keeping admission in `CaseEngine` authoritative.

### Journal/delta representation

The journal layout substantially reduced serialized full-snapshot bytes. In the measured 32-Task, 4 KiB observation workload, 67 successful writes represented 6,550,735 cumulative canonical full-snapshot bytes, while retained journal base+delta bytes were 270,883 bytes without compaction, approximately 95.9% less.

### Plan algorithm and instrumentation

Kahn-style graph compilation, wider benchmark scenarios, persistence byte accounting, and explicit stop gates were useful engineering improvements. The candidate also correctly refused to invent Context Plane, warm executor, browser, provider, or Cloudflare substrates that do not exist in this source slice.

## A.2 Changes that were wrong or correctness-incomplete

### Materialized journal cache as CAS authority

A cached `JournalSnapshotStore` instance could compare `expectedRevision` against its stale materialization after another store instance had committed a newer revision. That allowed a stale writer to pass the intended compare-and-swap boundary. A warm cache could also conceal later base-file corruption.

This was a correctness failure, not merely a cache invalidation inefficiency.

### Incomplete copy-on-write transaction

The candidate still copied root `taskStates`, `attempts`, receipts, and Event-array state around transitions. It reduced the constant factor but retained O(V) root work. Wide and deep scaling therefore became superlinear again:

- 128-wide p50 144.764 ms;
- 512-wide p50 1,058.664 ms;
- 1,024-wide p50 3,837.581 ms;
- 2,048-wide single observation 15,733.856 ms.

### Claim trie lifetime leak

Release removed tokens but not empty path nodes. Repeated unique acquire/release churn therefore retained dead path history. A 50,000-path diagnostic left approximately 50,003 nodes. The index was semantically disposable, but its memory behavior contradicted the intended active-lease scaling model.

### Disposable scheduler state without a repair boundary

The candidate treated the ready candidate set as non-authoritative in design, but the runner could declare deadlock after candidate loss without first rebuilding from authoritative Task states. A disposable cache is only safely disposable if there is an explicit reconstruction path at the decision boundary.

### Blocker propagation exceeded its reservation model

Some cancellation/failure DAGs revisited descendants and emitted more blocker-update Events than reserved. The observed result was `event_reservation_exhausted` rather than a deterministic terminal Case. This revealed a mismatch between mutation atomicity, graph traversal, and bounded Event accounting.

## A.3 Changes that moved cost instead of removing it

### Journal writes to journal reads/replay/canonicalization

The journal reduced retained bytes and full-snapshot serialization, but it moved work into:

- directory enumeration;
- base and delta reads;
- strict parsing;
- delta replay;
- revision/digest checking;
- materialized snapshot construction;
- repeated canonicalization and allocation.

The candidate's local wall-clock advantage depended partly on trusting its materialized cache. Once stale-writer and corruption detection were restored, final journal p50 became 1,025.905 ms versus candidate 623.460 ms in the repeated component workload. The byte reduction remains real; a general “journal is faster” conclusion is rejected.

### Ready lookup versus complete scheduling work

A sub-millisecond `readyTaskIds()` or candidate lookup does not prove that a Case transition is cheap. The candidate still paid global root-copy, reconciliation, invariant, and state-derivation costs around that lookup.

## A.4 Benchmark effects that were overstated

- The candidate's fast readiness query was valid micro-evidence, but it did not represent total scheduler work.
- The journal byte reduction was valid, but the earlier wall-clock conclusion did not survive durable-byte revalidation.
- Single microbenchmark values were not production SLOs and did not include repository exploration, model context, process startup, provider latency, or actual external effects.
- The candidate benchmark did identify 512-wide residual growth, but its architecture report understated how directly that growth came from remaining root copies and global derivation.

## A.5 Unnecessary or underpriced complexity

The candidate accumulated multiple acceleration structures without fully pricing their rebuild and failure behavior. The trie, ready set, active lease count, materialization cache, validation frontier, and reverse edges were individually reasonable, but their authority boundaries were not uniformly enforced. The final design retains only acceleration that has:

1. an authoritative source;
2. a deterministic rebuild path;
3. a test proving discard/rebuild equivalence;
4. a decision boundary that does not trust it as semantic truth.

## A.6 New regressions introduced by the candidate

- stale journal CAS acceptance;
- post-warm corruption concealment;
- Claim-index dead path retention;
- false scheduler deadlock after ready-candidate loss;
- Event reservation exhaustion during blocker propagation;
- superlinear large-DAG transition growth despite the COW label.

## A.7 Knowledge retained from the candidate

The following insights remain valuable and are directly retained:

- immutable Plan and one Work Graph for capacity 1 and N;
- isolated result followed by deterministic full-join Promotion;
- Claim as semantic exclusion, separate from ExecutionBudget;
- reverse-edge and ready-candidate acceleration;
- incremental immutable-prefix validation;
- journal bytes as a separate metric from wall-clock;
- stop gates for absent provider/context/executor substrates;
- source-level benchmark harnesses that distinguish wide and deep DAGs;
- explicit complexity and recovery accounting.

---

# B. Newly discovered insights

| Insight | Root cause | Evidence | Gain or consequence | Complexity / semantic risk | Decision |
| --- | --- | --- | --- | --- | --- |
| Per-transition root copying remained the dominant large-DAG cost | Candidate COW copied collection roots and Event-array state | 2,048-wide 15,733.856 ms single observation; profiles and source path showed repeated root work | Entry undo + incremental counters produced 970.171 ms p50 | Moderate internal bookkeeping; rollback bugs would be high risk | **Adopted**, with randomized full-restore oracle |
| Case-state derivation must be incremental but terminal decisions need a full oracle | Global state scans were costly; counters alone could become stale authority | Wide and chain superlinear scaling; acceleration discard tests | O(1)/local updates on ordinary transitions while full authoritative derivation confirms non-active candidates | Counters add derived mutable state | **Adopted conservatively**; counters are rebuildable and cannot author terminal truth alone |
| Blocker propagation should be topological and visit each affected Task once | Descendants were revisited before all direct blockers stabilized | Reproduced `event_reservation_exhausted` on cancellation/blocker graph | Bounded Events and deterministic complete blocker sets | Requires one derived topological order | **Adopted** |
| Disposable scheduler state requires an explicit repair boundary | Runner interpreted empty candidates as semantic deadlock | Candidate-loss regression test | Cache/index loss no longer changes completion | Small extra reconciliation path | **Adopted** |
| Journal cache validation requires exact durable-byte identity, not revision memory | Independent writers and later corruption invalidate cached materialization | stale-cache CAS and warm-corruption counterexamples | Restores same-process CAS and fail-closed corruption behavior | O(total journal bytes) read/hash on load/CAS; higher wall-clock | **Adopted** for correctness; remaining cost documented |
| Claim trie memory must scale with active paths, not historical paths | Release removed tokens but not empty nodes | 50k diagnostic and 2k regression/rebuild test | Eliminates dead-history retention | Low complexity; pruning mistakes could lose conflict candidates | **Adopted** with pure-oracle equivalence |
| Promotion, not Claim, is the next represented source-level subsystem lever | Claim p50 stayed approximately unchanged while Promotion remained whole-tree | Claim 10k: 263.936 -> 253.138 ms; Promotion 172.562 -> 159.153 ms | No claim rewrite justified; whole-tree Promotion remains visible | A premature Merkle/Git abstraction would be high complexity | **Promotion change deferred** until a real repository adapter supplies workload evidence |
| Context/token and warm-executor optimization cannot be measured in this kernel | No repository scanner, model transport, or process/toolchain lifecycle | Source inspection and benchmark capability matrix | Prevents fabricated metrics and mock architecture | Implementing abstractions now would create unowned state | **Not implemented**; stop gate and required future metrics retained |

---

# C. Final Architecture Decision

## C.1 Selected identity: `mvp-1a-2`

The final state is a direct successor of `mvp-1a-1`.

### Code origin

The implementation directly retains and modifies the candidate's source tree, public modules, schema-v2 snapshot, CaseRepository, durable runner, ClaimLedger, result algebra, fencing identities, and benchmark structure.

### Architecture foundation

The foundation remains:

```text
immutable PlanRevision
  -> one finite Work Graph
  -> CaseEngine as sole Task/Attempt/Event/result authority
  -> optional cross-Case ClaimLedger
  -> isolated executor results
  -> exactly one deterministic full-join Promotion
  -> snapshot-schema-v2 durable boundary
```

The work rewrites important internal subsystems but does not replace this ontology or ownership model.

### Ownership model

- `CaseEngine`: Task/Attempt/Case lifecycle, accepted results, Events, receipts, canonical tree, canonical digest.
- `CaseRepository`: load/migrate/transaction/command and snapshot CAS coordination.
- `FileSnapshotStore` / `JournalSnapshotStore`: local durable bytes and same-process CAS serialization.
- `ClaimLedger`: cross-Case semantic exclusion leases only.
- runner: capacity and dispatch orchestration, never lifecycle truth.
- Promotion: sole canonical integration path.
- indexes/caches/counters/candidate sets: non-authoritative, rebuildable acceleration.

### Execution model

Capacity 1 and capacity N use the same runner, admission, Task lifecycle, Claim checks, fencing, result acceptance, and Promotion semantics. Capacity changes scheduling opportunity only.

### Why not `mvp-1b-1`

The final code does not branch from `mvp-1`. It keeps substantial candidate code and candidate architecture as its direct base. Returning to `mvp-1` would discard useful, already integrated correctness and product boundaries without simplifying the final implementation.

### Why not `mvp-2a-1`

No new ontology or state-ownership generation was required. The highest-ROI corrections fit inside the existing Case/Work Graph/Promotion architecture. A new generation would add migration and maintenance cost without evidence of a simpler replacement foundation in the represented source slice.

### Supersession

`mvp-1a-2` supersedes `mvp-1a-1` as the active development identity. `mvp-1` and `legacy/mvp-parallel` remain historical/knowledge inputs, not active naming.

---

# D. Actual implementation

## D.1 Entry-level atomic transition transaction

**Previous problem:** candidate mutation frames still copied collection roots and Event-array state for rollback, creating O(V) work and allocation on ordinary transitions.

**New implementation:**

- stable internal collection roots;
- stable read-only public Proxy views;
- deep-frozen committed records;
- entry-level before-images for changed Task, Attempt, and receipt records;
- absent-entry markers for newly inserted records;
- Event rollback by length truncation;
- scalar and canonical-tree before-images only when changed.

**Correctness impact:** rejected mutations restore all authoritative fields. The public API cannot mutate collection roots or frozen committed records.

**Performance impact:** removes root O(V) copying and most associated allocation/GC pressure.

**Complexity trade-off:** transaction bookkeeping is more detailed. The risk is controlled by direct rollback tests, 100 randomized transition histories, and full snapshot restore after every randomized step.

## D.2 Incremental validation with a full restore oracle

**Previous problem:** full immutable history and unchanged records were repeatedly validated.

**New implementation:**

- validate appended Event suffix from the last validated sequence;
- validate only changed Task/Attempt/receipt records and their cross-links;
- preserve full `_assertInvariants` behavior for construction, untrusted restore, migration, and explicit full-oracle checks;
- freeze records only after successful validation.

**Correctness impact:** no durable validation verdict is persisted. Untrusted bytes always take the complete validation path.

**Performance impact:** ordinary transition validation scales with changed records/Event suffix rather than whole Case history.

**Complexity trade-off:** local invariant functions duplicate some full-oracle rules. Randomized restore equivalence guards divergence.

## D.3 Rebuildable dependency and Case accounting

**Previous problem:** readiness, Task-state counts, Claim holders, and Case state were repeatedly derived by full scans.

**New implementation:**

- Task-state counts;
- unsatisfied direct dependency counts;
- ready pending Task set;
- Claim-holding Task set;
- direct-dependent updates when a Task crosses the succeeded boundary;
- deterministic full rebuild from authoritative Task records;
- full `deriveCaseState` confirmation before accepting a terminal/reconciling candidate.

**Correctness impact:** derived state may conservatively keep a Case active if lost or stale, but cannot independently author a terminal outcome. `reconcile()` rebuilds it from semantic state.

**Performance impact:** ordinary readiness and Case accounting become local to the changed Task and direct dependents.

**Complexity trade-off:** additional mutable acceleration exists in memory, but it is absent from the durable schema and has discard/rebuild equivalence tests.

## D.4 Deterministic topological blocker propagation

**Previous problem:** repeated descendant visits could emit duplicate/intermediate blocker Events and exceed the mutation Event reservation.

**New implementation:** build a deterministic topological order once per Plan, compute the affected descendant closure, and visit each affected Task once. Each Task receives one complete sorted blocker set for that propagation.

**Correctness impact:** blocker evidence is complete, deterministic, and bounded by affected Task count.

**Performance impact:** removes repeated propagation work in failure/cancellation DAGs.

**Complexity trade-off:** one derived topological array is retained and rebuilt with the Plan.

## D.5 Scheduler repair before deadlock

**Previous problem:** loss of local ready candidates could be misread as graph deadlock.

**New implementation:** when candidates and in-flight work are both empty while the Case is nonterminal, the runner invokes authoritative engine reconciliation/rebuild, rehydrates candidates, and only then evaluates deadlock.

**Correctness impact:** disposable candidate loss cannot change Case completion.

**Performance impact:** no normal-path penalty beyond a bounded repair when local state is missing.

**Complexity trade-off:** one explicit repair branch.

## D.6 Claim trie pruning

**Previous problem:** inactive path history accumulated indefinitely.

**New implementation:** release walks the indexed path and deletes empty nodes bottom-up. Restore still rebuilds the entire index from authoritative active leases.

**Correctness impact:** conflict semantics are unchanged and remain checked against the pure Claim oracle.

**Performance impact:** memory now follows active indexed paths rather than historical churn.

**Complexity trade-off:** small pruning logic; randomized/reference and churn tests protect candidate completeness.

## D.7 Verified journal materialization cache

**Previous problem:** cached revision/materialization could override durable CAS truth and hide modified/corrupted files.

**New implementation:**

- process-wide same-process lock keyed by store kind, resolved directory, and Case ID;
- every load/CAS reads base and committed delta bytes;
- cryptographic fingerprint over exact file names, lengths, and bytes;
- cache reuse only when the durable fingerprint exactly matches a previously fully validated materialization or exact bytes written by the current operation;
- byte change forces strict parse, canonical-form checks, delta checksum/application, revision continuity, final snapshot digest, and size validation;
- missing base with deltas, malformed/truncated/noncanonical delta, and post-warm corruption fail closed;
- compaction writes/replaces the durable base before covered-delta cleanup.

**Correctness impact:** stale same-process writers are rejected, one same-process concurrent CAS wins, and cache warmth cannot mask later corruption.

**Performance impact:** byte amplification remains low, but verified load/CAS pays O(total journal bytes) read/hash work. The final local journal is not claimed faster than full-file replacement.

**Complexity trade-off:** fingerprinting and shared lock management add code. Cross-process CAS remains intentionally outside this local adapter contract.

## D.8 Reproducible benchmark and evidence tooling

Added:

- `bench/graph-sample.mjs`: one fresh-process graph sample;
- `bench/compare-development-states.mjs`: bounded multi-state comparison with explicit timeout and p50/range output;
- expanded `bench/control-plane.mjs`: wide/deep scheduler, Claim, Promotion, and persistence accounting;
- checked-in JSON evidence with source archive hashes and unavailable-substrate declarations.

No benchmark invents context bytes, model-token duplication, process cold start, or provider latency because those substrates are absent.

---

# E. Verification

## E.1 Source gate

`npm run check` passed in the implementation checkout:

- syntax checks for all `src/*.mjs`, `test/*.mjs`, and `bench/*.mjs`;
- 110 tests passed, 0 failed;
- in-memory demo passed;
- durable demo passed and restored revision 7.

Coverage command:

```text
node --experimental-test-coverage --test test/*.test.mjs
```

Result:

- 110/110 tests passed;
- line coverage 91.59%;
- branch coverage 81.31%;
- function coverage 96.36%.

## E.2 New regression and equivalence tests

The final suite includes new tests for:

- stable read-only collection views and frozen entries;
- incremental live state round-trip through full restore validation;
- acceleration-index discard and deterministic rebuild;
- topological blocker propagation and Event reservation;
- runner ready-candidate repair;
- executor-identity independence;
- retry-interleaving independence;
- Claim trie pruning and restore rebuild equivalence;
- independent File store same-process CAS;
- journal stale independent store, concurrent same-process CAS, warm-cache corruption, truncated/noncanonical delta, missing base, compaction cleanup crash shape, and materialized-size limit.

## E.3 Randomized and differential evidence

- 100 randomized transition histories were serialized and restored through the full untrusted-state validator after every step; all matched.
- 100 successful histories, 2,600 transitions, were compared across `mvp-1`, `mvp-1a-1`, and `mvp-1a-2`; exact snapshots matched.
- the cancellation/blocker counterexample intentionally differs: prior states could throw `event_reservation_exhausted`; final state reaches the deterministic bounded result. This is a correctness repair, not an accepted semantic divergence.

## E.4 Determinism and concurrency gates

Verified in current tests:

- capacity 1/N canonical equivalence;
- scheduling/completion-order independence;
- executor-identity independence;
- retry-interleaving independence;
- deterministic Promotion independent of accepted-result order;
- Claim pure-oracle equivalence;
- same-process Claim admission race and fencing;
- durable running Attempt before executor dispatch;
- checkpoint CAS conflict prevents dispatch;
- settlement persistence before lease release;
- stale result and stale lease rejection;
- restart and cache/index loss reconstruction.

## E.5 Persistence and fault-oriented gates

Covered:

- snapshot digest/Event/result/receipt corruption;
- strict malformed and duplicate-member JSON rejection;
- v1-to-v2 migration and CAS persistence;
- orphan temporary file;
- corrupted base;
- malformed, noncanonical, and truncated delta;
- missing base with deltas;
- warm-cache corruption;
- stale and concurrent same-process writer;
- compaction base durable before covered-delta cleanup;
- materialized maximum-size rejection;
- total in-memory materialization cache loss and replay.

Not claimed:

- cross-process CAS or lock recovery;
- distributed provider transactionality;
- device/block-level physical write amplification;
- hostile-storage authenticity;
- provider/environment behavior absent from the source slice.

## E.6 Three-state graph benchmark

Fresh Node child per sample, immediate deterministic observation executor, no provider/repository/model/process-start cost:

| Workload | `mvp-1` | `mvp-1a-1` | `mvp-1a-2` |
| --- | ---: | ---: | ---: |
| wide 128, capacity 1, p50 | 2,466.573 ms | 134.664 ms | 72.870 ms |
| wide 128, capacity 16, p50 | 2,450.946 ms | 144.764 ms | 79.562 ms |
| chain 128, capacity 16, p50 | 2,524.766 ms | 138.666 ms | 78.199 ms |
| wide 256, capacity 16, p50 | 10,477.996 ms | 350.103 ms | 135.283 ms |
| wide 512, capacity 16 | >15,000 ms stop gate | 1,058.664 ms p50 | 253.646 ms p50 |
| chain 512, capacity 16 | >15,000 ms stop gate | 1,163.964 ms p50 | 255.857 ms p50 |
| wide 1,024, capacity 16 | unavailable after stop gate | 3,837.581 ms p50 | 473.166 ms p50 |
| chain 1,024, capacity 16 | unavailable after stop gate | 4,210.743 ms p50 | 462.453 ms p50 |
| wide 2,048, capacity 16 | unavailable | 15,733.856 ms single observation | 970.171 ms p50 |
| chain 2,048, capacity 16 | unavailable | 17,244.632 ms single observation | 908.019 ms p50 |

Every completed graph sample produced canonical digest:

```text
sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a
```

A single GC diagnostic at wide 1,024 observed:

- `mvp-1a-1`: 250 GC events, 153.2 ms total pause;
- `mvp-1a-2`: 72 GC events, 59.7 ms total pause.

This GC observation is diagnostic only, not a p50 or SLO.

## E.7 Repeated component benchmark

| Component | `mvp-1a-1` p50 | `mvp-1a-2` p50 | Interpretation |
| --- | ---: | ---: | --- |
| scheduler wide 512, capacity 16 | 1,008.588 ms | 210.864 ms | transition-core gain |
| Claim 10,000 disjoint acquisitions | 263.936 ms | 253.138 ms | no material architecture change |
| disjoint Claim query at 10,000 | 0.035 ms | 0.033 ms | same indexed behavior |
| Promotion, 20,000-file base / one touched path | 172.562 ms | 159.153 ms | whole-tree work remains |
| FileSnapshotStore workload | 926.373 ms | 850.732 ms | approximately same class |
| JournalSnapshotStore workload | 623.460 ms | 1,025.905 ms | correctness verification cost restored |

The persistence workload made 67 successful writes. Full-snapshot cumulative canonical bytes were 6,550,735; retained journal base+delta bytes were 270,883. Byte reduction and wall-clock are reported separately.

## E.8 Clean archive verification

The exact final export is packaged with one top-level `tdev-mvp-1a-2/` directory and excludes `.git`, `node_modules`, coverage output, and caches. Archive entry names are checked for absolute paths and `..` traversal, and the export contains no symbolic links. The final ZIP is extracted into an empty directory, then verified with:

```text
npm ci --ignore-scripts --no-audit --no-fund
npm run check
```

The extracted package passes all 110 tests, the in-memory demo, and the durable demo. The generated `.sha256` sidecar is verified against the final ZIP. GitHub branch creation/push is not claimed because no repository remote publication target was provided in this container.

---

# F. Final state classification

## F.1 Implemented and verified in the current container

- `mvp-1a-2` repository identity and synchronized normative documents;
- entry-level atomic mutation with rollback;
- incremental Event/record validation with full restore oracle;
- rebuildable ready/dependency/Task-state/Claim-holder acceleration;
- deterministic topological blocker propagation;
- scheduler repair before deadlock;
- Claim trie pruning and oracle equivalence;
- verified journal cache, same-process stale/concurrent CAS behavior, corruption handling, restart/replay, and compaction crash shape;
- capacity 1/N, scheduling/completion/executor/retry determinism gates;
- 110-test source gate, coverage gate, benchmark harness, and checked-in evidence;
- final clean archive install/check and SHA-256 sidecar verification.

## F.2 Source/design implemented but provider or environment verification remains

None of the implemented source paths require a provider to pass their local contract. The following broader claims remain environment-dependent and are therefore not made:

- cross-process or distributed CAS;
- a provider-backed transactional persistence owner;
- GitHub branch creation/push/publication;
- real external-effect provider reconciliation;
- device-level fsync/physical write behavior across different filesystems.

## F.3 Intentionally not implemented

### Content-addressed Context Plane

Not represented: no repository scanner, context manifest/slice transport, model request adapter, or token accounting exists. Only the stop gate and required future metrics are documented.

### Warm executor pool and locality scheduling

Not represented: executor calls are injected functions; there is no process/toolchain/client lifecycle to reuse. A mock pool would add unowned mutable state without measurable cold-start cost.

### Generic JoinPolicy

No product use case exists beyond the current full-join deterministic Promotion. Generic `allowPartial` or completion-order winner semantics were rejected.

### Preflight/materialization framework

No measured expensive executor failures from missing context/capability/toolchain substrate exist in this kernel.

### Touched-path/Merkle/Git-tree Promotion

Promotion cost is visible, but there is no real repository adapter establishing tree/file count, ChangeSet, validation, and conflict workloads. A premature content-addressed tree would add migration and schema complexity before the workload owner exists.

### Cross-process journal lock protocol

The local file adapters explicitly promise same-process serialization. Crash-safe cross-process leasing/locking would be a new durable protocol and is not justified as a patch to this adapter.

### Browser, DOM, cookie, Cloudflare, Agent, or provider mock architecture

No substrate and no product authority support such layers.

## F.4 Largest current performance bottleneck

Within the represented source slice, the largest remaining architectural bottlenecks are:

1. **Promotion whole-tree construction, validation, copy, and digest** as repository tree size grows;
2. **Journal durable-byte verification** that reads and hashes the complete base/delta set on every load/CAS;
3. **complete schema-v2 snapshot materialization/serialization** at repository checkpoints even when the storage representation is delta-based.

Across the intended product, the potentially larger unmeasured costs are repository exploration, duplicate context/model input, actual executor/process cold start, provider latency, and validation/toolchain work. They remain `unavailable`, not estimated.

## F.5 Highest-ROI next development step

Introduce one real repository/executor adapter with measured ownership boundaries rather than another generic abstraction. Instrument:

- base/tree file count and touched paths;
- candidate construction, conflict detection, copy, hash, validation, and final integration;
- context bytes requested, unique, duplicate, and retry reconstruction;
- executor/process/toolchain startup and reuse;
- validation critical path and reusable evidence.

Use that evidence to choose between touched-path/content-addressed Promotion and ContextSlice/executor reuse. Preserve the current deterministic Promotion, Claim separation, fencing, durable Attempt, CAS, and rebuildable-acceleration invariants while doing so.
