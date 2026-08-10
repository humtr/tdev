# Development lineage

This repository uses development-lineage identities, not product-style semantic versions.

## Current development identity

- **Development identity:** `mvp-1a-7` — active mutable development-direction branch; D0010 through D0015 are verified on this line
- **Architecture generation:** MVP generation 1
- **Current direction origin from historical revision:** exact `mvp-1a-6@131204b782d7c7b64edceb55e335fba10c8e5aee`
- **Baseline knowledge input:** verified D0010 semantic-v3 authority, D0011 local real-Git projection, D0012 authenticated remote-publication source evidence, D0013 trusted-local repository/model transport baseline, D0014 bounded product-efficiency evidence, and D0015 deployed-MVP program rebaseline/post-review on the same development direction
- **Latest verified design:** Design 0015 — Deployed MVP Program Rebaseline and D0014 Post-Verification Review
- **Active design:** none; the next gate is a decision-neutral per-Attempt context-delivery/model-execution comparison under the post-D0014 profile
- **Historical predecessor revision ref:** `mvp-1a-6` (named under the pre-`3048286a88c2687a2206cc3bcb4faab924be88d9` revision/checkpoint policy)

`mvp-1a-7` is the current development **direction**, not a frozen D0010 checkpoint. D0011, later designs, implementation commits, evidence, and verification continue to fast-forward this same branch while the product/development direction remains unchanged. A new `mvp-*` branch is created only after an explicit user/owner decision that the direction itself diverges; design-number changes, verification success, milestones, or ordinary source revisions are not sufficient reasons.

`mvp-1a-7` directly succeeds `mvp-1a-6` and now contains the five D0010-D0014 verified implementation layers plus D0015's verified product-program rebaseline without removing the legacy v2 path. D0010 owns the opt-in local semantic-v3 authority: compressed UTF-8 path-byte radix plus compact schema-v3 Case snapshot elected by one expected-predecessor SQLite Case head. D0011 adds a real **local Git derived projection** over that authority. D0012 adds a generic authenticated **remote derived-publication source layer** over an already elected D0011 candidate. D0013 adds a read-only exact-commit full-text repository context and trusted-local result-only subprocess transport while leaving result acceptance and Promotion with the existing owners. D0014 adds bounded executor-local exact-base preparation reuse, early bounds, duplicate-blob coalescing, cancellable Git plumbing, POSIX process-group cleanup, and non-blocking observations while retaining the D0013 full-context/process-per-Attempt contract. Git OIDs, remote refs, repository context, cache entries, request encodings and model/process state remain derived identities/inputs; deterministic context-delivery selection, external model/provider transport, actual provider-ref/protected-branch qualification, Cloudflare/provider ownership and secured MCP remain open final-MVP boundaries, while persistent cross-worker CAS and broader scale mechanisms remain evidence-gated as classified by `docs/ROADMAP.md`.

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
- D0011 evidence that the same semantic root can project deterministically into real SHA-1 or SHA-256 bare Git repositories, that exact local ref CAS/reconciliation/rollback can be fenced without index/worktree authority, and that Git representation identity can remain separate from semantic authority;
- D0012 evidence that an already elected local candidate can be bound to one existing remote branch through an immutable target intent, exact expected-predecessor fencing, reread/restart reconciliation, and external deployment credentials without promoting provider state to semantic authority;
- D0013 evidence that one exact immutable Git commit can be reconstructed as bounded UTF-8 full context, bound to the authoritative Plan base and Attempt identity, carried through a real trusted-local subprocess, and measured for absolute repository/context/process cost without promoting repository/model/process state to semantic authority;
- D0014 evidence that exact-base preparation can be single-flighted and retained within finite executor-local bounds, reducing same-base Git/decode/hash/encoding work without changing full request bytes, process count, retry ownership, result isolation or D0010 authority;
- D0014 failure evidence that inherited descendant pipes can turn a valid direct-child result into a false timeout, unresolved asynchronous observations can stall transport completion, and an all-reader-cancelled producer can poison a fresh reader during abort handoff; all three are now bounded without making cache or instrumentation authoritative.

## Verified D0015 program rebaseline gate

D0015 changes no production source or semantic authority. It records the owner decision that the final MVP is the deployed Cloudflare/local-Agent/Git/MCP product described in `docs/ROADMAP.md`, not merely the current Node source slice. Cloudflare CaseDO/AgentDO or equivalent owners, authenticated local Agent execution, deployed Git integration, secured MCP/auth/tenant boundaries, user/provider configuration, migration/rollback/operations and final deployed qualification are therefore explicit final-MVP gaps. Provisional D0016+ roadmap labels are planning identities only and do not authorize Class 2 implementation.

D0015 also retains D0014 `verified` after post-publication review. Artifact `9048558724`'s current GitHub API and re-downloaded outer ZIP agree on SHA-256 `7578976ee2f7695a8f7922255a5b07e486f1bb824e12c4d60dfa2f6e63ed21bf`; the old Issue #7 outer-ZIP value is superseded while internal manifest/product evidence remain intact. Bounded probes confirm the cache entry/byte bounds apply to retained complete preparations rather than all pending live work and that capacity+1 LRU churn preserves semantic identity while falling back to repeated cold preparation. No D0014 production-source correctness defect was found. A post-review fresh-checkout repetition did expose a test-only 200 ms inherited-pipe timeout as a timing-sensitive startup assertion; the test/fixture guard is corrected without changing `src/repository-model-transport.mjs`.

## Verified D0014 gate

D0014 is verified on the same mutable `mvp-1a-7` development direction. Exact source candidate `bb5e665e9d6c28b130d4e25dc373e8fce2053ff0` passed independent Ubuntu/POSIX GitHub Actions run `31348795334` / job `93335641224`: **232/232** complete source tests, **93.10% line / 82.16% branch / 96.30% function coverage**, clean effective diff, **32/32** focused repository/transport/cache/process tests, 22 baseline plus 22 candidate benchmark scenarios, and repeated same-base/multi-base tail workloads. Checked evidence is `docs/evidence/mvp-1a-7-repository-model-efficiency-2026-08-10.json`, SHA-256 `ca22551d8137eadefd5af6c1f33196dfee4971f68e65e6d42f063d656b27f610`; the full decision report is `docs/D0014_PRODUCT_EFFICIENCY_AUDIT.md`.

The selected optimization is an optional finite executor-local exact-key preparation cache with one producer/many readers. Its identity binds repository instance, Git object format, immutable commit OID, repository profile and authoritative `baseDigest`. Cold preparation preflights tree/file bytes, reads each unique blob OID once, validates and freezes the exact full context, and retains canonical immutable repository encodings within entry/byte bounds. Cache miss, disablement, eviction, restart or process loss rebuilds from Git; different-base producers remain concurrent; producer failure is not retained; one reader cancellation cannot poison peers, and all-reader cancellation removes the doomed entry before abort so a fresh reader starts a replacement producer. Every Attempt still constructs/sends the complete request and starts one model process, so provider/token, network-egress and ContextSlice savings are not claimed.

On the actual 102-file / 1,788,423-byte audit repository, eight same-base Tasks improved from 5,287.2 to 1,027.2 ms wall time, 1.513 to 7.788 useful results/s, 48 to 5 Git commands and 14.421 to 1.803 MB Git stdout; the 15,071,128 model-input bytes and eight process starts were unchanged. Retry preparation amplification changed from 1/2/3/4 times to one exact-base preparation for zero through three retries, while full request/process amplification remained Attempt-count dependent. Repeated same-base-8 p50/p95 changed from 5,422.2/5,521.3 to 1,047.2/1,062.3 ms. Multi-base-8 over eight bases retained a smaller locality-dependent benefit and no material wall regression.

D0014 also closes three newly discovered lifecycle hazards: cancelled-producer handoff cannot poison a fresh reader; cleanup begins at direct-child `exit` so inherited descendant pipes cannot convert a valid response into a timeout, and transport completion never awaits an asynchronous observation sink. D0010 Case head/semantic root and Plan `baseDigest` remain authoritative; D0011/D0012 publication remains derived; cache, encodings, process state and metrics remain disposable execution state. No semantic/durable migration exists and rollback is `contextCache: false`, restart/cache loss, or source revert.

## Verified D0013 gate

D0013 is verified on the same mutable `mvp-1a-7` development direction for repository profile `tdev.repository-context.git-full-text.v1`, model profile `tdev.model.subprocess-json.v1`, and operation `tdev.model.repository`. Source candidate `3f7c04ad4e343af2968d082bf4ffb559e2580100` passed independent Ubuntu/POSIX GitHub Actions run `31331491616` / job `93290347063`: **216/216** complete source tests, **92.86% line / 81.61% branch / 96.34% function coverage**, clean effective diff, and **16/16** focused D0013 tests. Checked evidence is `docs/evidence/mvp-1a-7-repository-model-transport-2026-08-10.json`, SHA-256 `a470635bee28c5584ac61abf51340548d6df5eca3872dbd73569b0ea8a03a614`.

The independent real-repository probe bound the exact source candidate to SHA-1 tree `a3eaa014d122c6ccbfc58e9945520eb4569d588e`: 101 supported files, 1,757,785 content bytes, context digest `sha256:aa1b3d1a9b9ee155ed73bc0d4b8250d091ef942558567af39fde8feeec6d6ec4`, and `src/cli.mjs` as the retained `100755` file. The adapter reads that immutable commit rather than the mutable index/worktree, requires its path-to-text digest to equal the Attempt `baseDigest`, and transports one request-digest-bound full context to a fresh trusted local subprocess. The response remains only an input to existing result/Claim/fencing/Promotion validation.

The measured baseline reconstructed that same 1,757,785-byte context across four Attempts: 7,031,140 requested context bytes, 5,273,355 repeated bytes, a full 1,757,785-byte reconstruction on the retry, four process starts and zero reuse. The 75% fraction follows structurally from `(4 - 1) / 4`; D0013's measured contribution is the absolute size and real Git/serialization/process/retry cost. D0014 later selected bounded exact-base preparation reuse from broader absolute and failure-path evidence. D0013 itself does **not** prove token savings, external-model latency, provider authentication/data-egress/billing semantics, tokenizer accounting, warm-executor benefit, locality scheduling, or model/provider authority.

## Verified D0012 gate

D0012 is verified on the same mutable `mvp-1a-7` development direction for profile `tdev.git.remote-existing-branch.v1`. Source candidate `28ed1912dc61b8d33277f599ada6010a30a7f357` passed independent Ubuntu/POSIX GitHub Actions run `31328662608` / job `93283174570`: **200/200** complete source tests, **92.79% line / 81.88% branch / 96.52% function coverage**, clean effective diff, and **22/22** combined D0011+D0012 focused tests. Checked evidence is `docs/evidence/mvp-1a-7-remote-git-publication-2026-08-10.json`, SHA-256 `b89afba6de72a289fc6cb8574f2a07943483d1d222bd047b858bf5344479df55`.

The verified source contract requires a locally elected D0011 candidate with a non-null predecessor and one existing remote branch. An immutable intent binds the candidate and digest of the single effective push target without retaining the clear URL or raw credentials. Forward publication is exact-predecessor fenced and every accepted forward candidate remains topologically fast-forward; push outcomes are authoritative only after remote reread. Restart reconciliation is read-only and target-bound. Rollback is separately fenced, and provider rejection is not bypassed.

The current deployment additionally completed an authenticated GitHub `push --dry-run` with interactive prompting disabled while the dedicated probe ref remained absent. This is capability evidence only: no D0012 remote ref mutation was used as integration evidence, and protected-branch/ruleset behavior, provider-specific IAM/policy, signing, multi-host ownership, provider transactions, or hostile-provider authenticity remain unverified. D0010 semantic root/Case head remain tdev authority.

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
