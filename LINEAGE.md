# Development lineage

This repository uses development-lineage identities, not product-style semantic versions.

## Current development identity

- **Development identity:** `mvp-1a-7` — active mutable development-direction branch; D0010 and D0011 are verified on this line
- **Architecture generation:** MVP generation 1
- **Current direction origin from historical revision:** exact `mvp-1a-6@131204b782d7c7b64edceb55e335fba10c8e5aee`
- **Baseline knowledge input:** verified Design 0010 semantic-v3 authority plus verified Design 0011 local real-Git projection evidence on the same development direction
- **Latest verified design:** Design 0011 — Real Git Projection and Fenced Publication
- **Active design:** none; the next provider-facing gate is authenticated remote Git publication/protected-branch ownership if pursued
- **Historical predecessor revision ref:** `mvp-1a-6` (named under the pre-`3048286a88c2687a2206cc3bcb4faab924be88d9` revision/checkpoint policy)

`mvp-1a-7` is the current development **direction**, not a frozen D0010 checkpoint. D0011, later designs, implementation commits, evidence, and verification continue to fast-forward this same branch while the product/development direction remains unchanged. A new `mvp-*` branch is created only after an explicit user/owner decision that the direction itself diverges; design-number changes, verification success, milestones, or ordinary source revisions are not sufficient reasons.

`mvp-1a-7` directly succeeds `mvp-1a-6` and now contains two verified additive layers without removing the legacy v2 path. D0010 owns the opt-in local semantic-v3 authority: compressed UTF-8 path-byte radix plus compact schema-v3 Case snapshot elected by one expected-predecessor SQLite Case head. D0011 adds a real **local Git derived projection** over that authority: exact UTF-8 `100644` Git tree/commit construction plus one fenced local `refs/heads/...` CAS/reconciliation/rollback lane. Git OIDs remain derived identities; authenticated remote/provider publication, provider/distributed ownership, distributed Claims, and hostile-storage authenticity remain future boundaries.

`mvp-1a-4` directly retains the verified `mvp-1a-3` Work Graph, lifecycle, Promotion, snapshot schema, immutable journal record format, no-replace expected-revision publication, migration boundary, and cross-process local-filesystem winner semantics. Its narrow designed change adds a disposable instance-local materialization cache that is usable only after the current committed namespace is strictly checked and every retained authoritative byte has been reread and matched by an exact ordered fingerprint.

## Historical rationale — why `mvp-1a-4` stayed on lineage 1a

The deciding fact is architecture and durable-code origin, not benchmark size.

- The implementation starts from the exact GitHub `mvp-1a-3` source state and preserves all D0005 durable bytes and publication slots.
- No new durable head, checkpoint, schema, compaction, history deletion, migration path, or canonical owner is added.
- The optimization is performance-only state. A cache miss, process restart, namespace change, file-type change, or byte change returns to complete D0005 strict validation/replay.
- Design 0006 measured repeated prefix replay as the dominant local immutable-journal cost; Design 0007 removes only that redundant replay when exact current bytes prove the predecessor is unchanged.

That historical decision stayed on lineage `1a` rather than creating a sibling lineage or architecture-generation restart. Under the current branch rule, source/design revision advancement alone no longer implies a new `mvp-*` branch; exact commit ancestry carries ordinary revision history.

## Relationship to prior and legacy lineages

- `mvp-1` is the current MVP generation's baseline source state.
- `mvp-1a-2` remains the verified incremental-transition and verified-journal-cache foundation.
- `mvp-1a-3` is the direct parent that introduced D0005 immutable expected-revision journal CAS and remains the durable-format regression baseline.
- `legacy/mvp-parallel` names the earlier TMCP-to-parallel experimental lineage. It is research history only and is not an active naming or implementation parent of `mvp-1a-4`.
- Historical `xh-*`, `parallel-*`, research branch names, and similar strings retained inside evidence do not define the current identity.

## Knowledge lineage and code lineage

Code revisions remain narrow while validated knowledge accumulates. Current accumulated knowledge includes:

- capacity 1 and capacity N as one execution model;
- isolated ordinary results and one deterministic Promotion/canonical mutation lane;
- complete Attempt fencing, CAS, durable-before-dispatch, and accepted-result durability;
- rebuildable derived state that cannot become semantic authority;
- counterexamples for root-level COW amplification, stale journal caches, Claim trie path retention, candidate-set loss, duplicate blocker propagation, journal corruption after cache warm-up, and unsafe mixed-format cross-process cutover;
- D0005 no-replace commit-slot winner semantics with strict retained-history validation;
- D0006 evidence that repeated prefix replay, not retained-byte observation itself, dominated the measured immutable-journal hot path;
- D0007 evidence that exact-byte-gated materialization reuse removes that replay cost without changing durable authority;
- D0008 evidence that aggregate durable admission, legacy committed-namespace fail-closed parity, deterministic local publication-fault classification, and settlement-checkpoint/Claim reopen behavior can be closed without changing snapshot schema or semantic tree identity;
- D0008 authority-path evidence that 24 completed 1k/5k/20k samples preserve Promotion/cold-restore equality while all eight 100k samples hit declared time/RSS stop gates, including sparse writes;
- D0009 evidence that simple directory Merkle retains O(N) sibling-metadata work in wide directories, while bounded path-byte radix and collision-safe path-hash trie models can derive sparse roots without changing current semantic output;
- D0009 evidence preferring the C3 path-hash trie as a research candidate on checked operation/byte counts, with C2 radix retained as fallback/reference;
- D0010 production evidence selecting C2-like compressed path-byte radix because one authority must enforce exact/ancestor/descendant topology without an O(N) scan or second synchronized prefix owner;
- D0010 evidence that normal v3 root Promotion/checkpoint work is sparse while explicit compatibility materialization remains an acknowledged O(N) path, and that transactional-head ambiguity/migration/repair/GC boundaries can close locally without changing Git/provider ownership;
- D0011 evidence that the same semantic root can project deterministically into real SHA-1 or SHA-256 bare Git repositories, that exact local ref CAS/reconciliation/rollback can be fenced without index/worktree authority, and that Git representation identity can remain separate from semantic authority.

## Verified D0011 gate

D0011 is verified on the existing mutable `mvp-1a-7` development direction; no new `mvp-*` branch was created for the Design/verification transition. Source candidate `c321e9079855c87b9df806930b2cd48c61244e9b` passed independent Ubuntu/POSIX run `31325628829` / job `93275404092`: **191/191** complete source tests, **92.80% line / 82.37% branch / 96.34% function coverage**, clean effective diff, **13/13** focused real-Git tests, and SHA-1/SHA-256 bare-repository capability checks. Checked evidence is `docs/evidence/mvp-1a-7-git-projection-2026-08-10.json` with SHA-256 `b62bcc3c4f96b407a228a7e35c832f06936087db0ff9954e7dea538142fcfebd`.

The verified profile is `tdev.git.text-tree.v1`. A validated D0010 semantic tree is materialized into exact UTF-8 `100644` blobs and Git trees/commits under explicit metadata; immutable objects are candidates only. A direct full `refs/heads/...` ref elects the visible local projection through exact expected-predecessor CAS. Lost responses are reconciled by durable ref reread; rollback is another fenced ref mutation. Candidate validation rereads Git bytes and rebuilds the tdev semantic root, so a recomputed typed candidate digest cannot hide a different tree/commit. Inherited `GIT_*` routing is scrubbed and replacement refs/hooks are disabled for the adapter plumbing.

Verification does **not** make Git OIDs semantic authority and does not prove remote fetch/push, GitHub/GitLab authorization or protected-branch semantics, signed refs/commits, multi-host ownership, provider transactions, Git-object GC, or hostile repository authenticity. The connected tmcp/Termux environment passes the D0011 focused gate but remains unqualified for the complete inherited source suite because the ImmutableJournal hard-link primitive still returns `EACCES` there.

## Verified D0010 gate

D0010 is verified on the `mvp-1a-7` lineage for the bounded opt-in local semantic-v3 profile. Source candidate `152f88daa7775c5d545ec865cc0a8a470b45697e` passed independent Ubuntu/POSIX run `31311936616` / job `93240950927`: 178/178 complete source tests, 92.74% line / 82.56% branch / 96.26% function coverage, clean effective diff, and 67/67 focused D0010 migration/head/recovery tests. Checked evidence is `docs/evidence/mvp-1a-7-semantic-authority-migration-2026-08-09.json` with SHA-256 `2129639870f970a10e2aaeb7e393672e4e5faec4e9c3e332361285069890f99e`; all 12 configured size/touch samples preserve semantic equality.

The production v3 profile is `tdev.semantic.path-byte-radix.v1`. This intentionally promotes D0009's radix fallback rather than its lower-count C3 research preference because radix prefix locality lets the same semantic authority enforce current file/descendant topology. The v3 store uses immutable typed objects/snapshots plus one transactional expected-predecessor Case head. Forward migration requires explicit legacy-writer and Claim quiescence plus source recheck; post-migration writes forbid automatic downgrade. Commit ambiguity, corruption/scrub, exact-content repair, and reference-aware GC have explicit fail-closed contracts.

D0010 itself did **not** make Git tree/commit OIDs semantic authority or prove a Git projection adapter. D0011 later verifies the bounded local Git projection/ref-CAS layer while preserving that authority separation. Provider/distributed transactions, authenticated remote Git publication, distributed Claim ownership, hostile-storage authenticity, and universal migration of historical v2 Cases remain outside the combined verified boundary. Existing v2 repositories remain supported.

## Verified D0008 gate

D0008 is verified on the `mvp-1a-5` lineage in the declared Node 22 source and compatible POSIX-local-filesystem scope. Source candidate `cf6b89d6bb2cff0b60ab2ca1a4521631f68c559f` passed the complete Ubuntu/POSIX source gate, coverage command, diff check, and authority-harness smoke; focused local durable/store tests also passed. The checked matrix is `docs/evidence/mvp-1a-5-authority-boundary-2026-08-09.json`.

Verification does **not** promote Git OIDs, provider storage, distributed Claims, current tmcp/Termux hard-link support, or a new semantic root to authority. The connected Termux filesystem failed the required hard-link primitive and remains unqualified for ImmutableJournal publication. D0009 subsequently performs the separate representation comparison without altering those boundaries.

## Verified D0009 comparison gate

D0009 is verified on the `mvp-1a-6` lineage as a non-authoritative comparison. Final comparison candidate `7ba03082ac94fe75242c22a7b31ca76d933aeb0c` passed independent Ubuntu/POSIX run `31306276819` / job `93227063683`: 152/152 source tests, 92.57% line / 83.10% branch / 95.99% function coverage, clean effective diff, and the full 144-model matrix. Raw checked evidence is `docs/evidence/mvp-1a-6-semantic-authority-representation-2026-08-09.json` with SHA-256 `f8609316970e28f311d83aecb550b7be07d0a1d53938517931f9271e09ad5db4`.

C1 directory Merkle is rejected by its 100k-wide sparse-update sibling fanout. C2 radix and C3 collision-safe hash trie survive structurally; C3 is preferred for the next migration design because the checked broad-update operation/byte work is materially lower even after path-key hashing is explicitly counted. The three stopped model samples stopped only during current full-tree compatibility materialization/digest after their candidate-root update completed. Consequently `mvp-1a-6` still uses the existing full text-tree semantic identity and persistence.

The managed `tmcp/` scratch branch used by tooling remains transport bookkeeping and does not define tdev development-lineage naming.

## Naming and branch rule

This branch-lifecycle rule is **prospective from commit `3048286a88c2687a2206cc3bcb4faab924be88d9`**. Before that commit, contemporaneous repository documents used the numeric `mvp-1a-N` suffix as a development revision/checkpoint inside lineage `1a`, including `mvp-1a-1` through `mvp-1a-6`. The policy transition does not retroactively rename those historical refs as separate development directions; it changes how the active ref is advanced from that point forward.

Current development-direction refs use names such as:

```text
mvp-<generation><lineage>-<direction-id>
```

The full `mvp-*` name identifies a development direction. Its suffix is an opaque direction label, **not** a counter that advances for every Design, verification checkpoint, release-like milestone, or ordinary commit. Exact source revision belongs to Git commit ancestry.

While direction is unchanged, the active ref named by `WORKBOARD.md` is fast-forwarded in place. A new `mvp-*` ref requires an explicit user/owner direction-change decision and a recorded divergence rationale here, including the retained predecessor. Generation changes remain reserved for an intentional architecture-foundation restart; lineage letters distinguish explicit sibling directions in one generation. Tool-owned `tmcp/*` branches remain scratch transport and never establish development-lineage identity.
