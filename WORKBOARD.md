# WORKBOARD

## Current baseline

- Repository: `humtr/tdev`
- Legacy cumulative baseline: exact `mvp-1a-7@83e9610d79b4ad70858e4dd7fe3625052336a92c`; this ref is retained as the D0015-and-earlier checkpoint and is not the post-D0015 integration destination
- Active cumulative Capability Group: Group F — Cloudflare runtime and local Agent topology
- Active cumulative branch: `group/f-cloudflare-runtime`
- Group E creation predecessor: exact `mvp-1a-7@83e9610d79b4ad70858e4dd7fe3625052336a92c`
- Completed Group E checkpoint: exact `group/e-context-delivery@151aed9ffdb86fd3967b8ab7ecfd012e884a0e3e`, checkpoint `cp_1786580384438_9ed881e039da`; Group F was created from this exact SHA with no intervening commit
- Post-D0015 branch succession owner: `docs/development/BRANCH_LINEAGE.md`; completed Groups are retained checkpoints and each successor Group is created from the exact final head of its predecessor
- Historical direction origin / predecessor: exact `mvp-1a-6@131204b782d7c7b64edceb55e335fba10c8e5aee`
- Knowledge inputs: verified D0010 semantic-v3 authority, D0011 local real-Git projection, D0012 authenticated remote-publication source evidence, D0013 trusted-local repository/model transport baseline, D0014 bounded product-efficiency evidence, and D0015 final-MVP program rebaseline/post-verification review accumulated in the retained `mvp-1a-7` baseline
- Current source runtime target: Node.js 22+; final MVP runtime additionally requires the accepted Cloudflare/local-Agent deployment profile
- Canonical architecture owner: `docs/ARCHITECTURE.md`
- Verification owner: `docs/MVP.md`
- Final-MVP program owner: `docs/ROADMAP.md`
- Development-program register: `docs/development/PROGRAM.md`
- Current Group execution owner: no Group F-specific execution document exists at this checkpoint; use `docs/ROADMAP.md`, `docs/development/PROGRAM.md`, `docs/development/BRANCH_LINEAGE.md`, and each accepted Design owner. `docs/development/GROUP_E_CONTEXT_DELIVERY.md` is the retained completed Group E execution/exit record
- Current verified design: `docs/design/0015-deployed-mvp-program-rebaseline-and-d0014-postreview.md`
- Most recent accepted Class 2 decision: D0019 — CaseDO Authority Adapter, accepted **as amended** 2026-08-13; a durable placement generation elects one exact Cloudflare CaseDO tuple, that elected SQLite-backed CaseDO hosts/adapts the existing D0010/CaseEngine semantic authority, ordinary CaseDO reconstruction does not imply semantic reopen, exact D0010 command-receipt identity is preserved, and production implementation/qualification remains separate.
- Active Class 2 Case-authority work: D0019 is `accepted` as amended on active Group F. Candidate A survived adversarial re-review with four frozen corrections: durable placement generation prevents competing environment/namespace/jurisdiction/DO authority birth; receipt identity is `tdev.case-command.v1` over canonical command only; ordinary eviction reconstructs with semantic reopen disabled while explicit execution/delivery-owner-loss recovery is separate; and `tdev.casedo.sqlite-authority.v1` plus deployment-qualified capacity/rollout compatibility gates precede production. Fresh model plus inherited oracle tests passed 44/44. No D0019 production `src/` exists at this checkpoint.
- Active Class 2 publication work: D0030 remains `accepted` on active Group F. Acceptance evidence selected the bounded fd-relative native helper, qualified `RENAME_NOREPLACE` on the exact Termux/F2FS acceptance profile and an independent Debian/ext4 POSIX plane, and closed 100/100 mixed hard-link/rename races under the jointly-qualified validity-key rule. `src/store.mjs` remains unchanged at this checkpoint; D0030 production implementation/package qualification is still a separate Task and is not folded into D0019.
- Active Class 2 production-source state: D0017 production source is independently verified on the supported-Termux source scope at `eea429100d4bc6b6e9e6b74a29da2fbcdecc53db`. D0018 production source/runtime is independently verified on the supported-Termux trusted-local scope at `73d404bdc24eac8337019738ba074c2a1fea4861`; exact `npm run check` remains platform-unqualified for the pre-existing ImmutableJournal hard-link `link(2) EACCES`, and instrumented full coverage additionally exposes timing-guard limitations that are green in the uninstrumented 233-test supported suite. D0019 has accepted Design/model evidence only and no production CaseDO adapter. D0030 production source has not yet been implemented: `src/store.mjs` still uses the inherited hard-link publication primitive. Group E exit/checkpoint is complete; the hard-link limitation is an inherited qualification gap on the active F lineage, not a reason to reopen E.
- Validation-registry maintenance issue: tmcp profiles `portable` (`npm run verify:sandbox`) and `full` (`npm run verify:termux && npm run check`) reference package scripts that are absent from the current `package.json`. This registry drift is not a green D0030 validation result and remains a separate maintenance/alignment scope.
- D0014 execution record: GitHub issue `humtr/tdev#7`; non-authoritative provenance record

## Active work

Group F is the current mutable cumulative development checkpoint. Group E is retained at exact `151aed9ffdb86fd3967b8ab7ecfd012e884a0e3e`; `group/f-cloudflare-runtime` was created from that exact checkpoint and now receives normal post-E substantive work. Normal progression does **not** modify completed Group E or fast-forward/merge completed Group work back into `mvp-1a-7`.

D0015 has rebaselined the **final MVP** as the deployed Level-4 program in `docs/ROADMAP.md`: verified core plus CaseDO/AgentDO or equivalent Cloudflare owners, authenticated local Agent execution, deployed Git publication, secured MCP/auth/tenant boundary, provider/user setup, operations and final E2E qualification. Those capabilities are required final-MVP gaps, not claims that the current source already implements them.

D0014 remains verified after independent post-publication review. The final source was not rewritten. D0016 remeasured the remaining per-Attempt transport/executor boundary and selected an immutable full-context reference envelope. D0017 remains accepted at the Design layer: the logical identity binds exact repository commit, semantic base/context digest and admitted Case/Plan authorization scope while excluding Attempt identity and physical locators; the first receiver representation is bounded packed/hybrid. The separately scoped production implementation is now independently verified on the supported-Termux source scope at `eea429100d4bc6b6e9e6b74a29da2fbcdecc53db`, with evidence in `docs/evidence/group-e-d0017-production-verification-2026-08-12.json`; the exact all-test coverage command remains platform-unqualified only because the pre-existing ImmutableJournal hard-link tests hit `link(2) EACCES` on this Termux filesystem. ContextSlice remains unselected. D0018 accepts host/preparation warmth only and rejects the tested same-process model reuse profile; its bounded C1-C4 production repair and checkpoint-before-live-control handshake are verified at `73d404bdc24eac8337019738ba074c2a1fea4861` by `docs/evidence/group-e-d0018-production-verification-2026-08-13.json`. D0019 now freezes the amended Case semantic-authority placement model without changing those inherited contracts: a qualified new Cloudflare Case first receives one durable placement generation and exact provider tuple, then has one elected SQLite-backed CaseDO authority host; ordinary CaseDO eviction does not synthesize semantic process recovery, and existing local Cases remain with their current owner until a separately accepted migration/cutover Design exists. Persistent CAS/D0022 remains conditional.

## Accepted design work

### D0019 — accepted/amended CaseDO authority adapter

- Status: `accepted` Design, amended 2026-08-13; production implementation/provider qualification separate
- Design: `docs/design/0019-casedo-authority-adapter.md`
- Predecessor evidence: `docs/evidence/group-f-d0019-casedo-authority-adapter-acceptance-2026-08-13.json` (SHA-256 `6e196ff1cae6c9ef993bcebf112405234fccc7c682a4563811c16ab2e41e7daa`)
- Amendment evidence: `docs/evidence/group-f-d0019-authority-amendment-2026-08-13.json` (SHA-256 `79470299245e617147976b7f806c0e23dc78dfc2a47ca867cb80f984a73dd623`)
- Falsifier source: `test/d0019-casedo-authority-model.test.mjs` (SHA-256 `8e41ec7905898b1f479b4c62e8863af4b45077da250cd2ba360eb8c8df717d69`); fresh targeted model + inherited oracle run 44/44 passed
- Selected authority: Candidate A — one durable placement generation elects the exact provider tuple and that one SQLite-backed CaseDO physically hosts/adapts the existing D0010/CaseEngine semantic owner; placement is meta-authority only, while receipt/revision/head/lifecycle/result/running state share the one elected CaseDO transaction boundary
- Receipt rule: `requestId` addresses one receipt whose digest is exactly `typedDigest('tdev.case-command.v1', canonicalClone(command))`; `expectedCaseRevision` is excluded, and a valid same-request/same-command receipt replay precedes revision equality
- Response-loss/restart rule: provider/RPC loss is unknown until the same elected durable receipt/state is reread; ordinary CaseDO eviction reconstructs with semantic reopen disabled, while only an explicit durable execution/delivery-owner-loss recovery cause may invoke the existing reopen transition
- Storage/rollout rule: initial production uses `tdev.casedo.sqlite-authority.v1` / schema version 1, normalized/chunked authoritative state, a positively qualified finite Case capacity budget, and compatible old/new code+schema overlap or a fail-closed rollout barrier
- Migration rule: no existing local Case migration in initial D0019; unfenced `copy then switch` is falsified; a later move requires a separate exclusive-writer cutover Design
- Boundaries: D0020 owns Agent connection/delivery/capacity/reconnect and the distributed owner-loss crossing; D0030 remains accepted/separate; no D0019/D0020/D0030 production source was bundled into this amendment
- Exact next D0019 action: a separate bounded production implementation/qualification Root Task for durable placement election plus the elected SQLite-backed CaseDO/profile, new Cases only until a later migration Design is accepted

## Verified work

### D0015 — verified final-MVP program rebaseline and D0014 post-review

- Status: `verified` documentation/program Class 2 decision; no D0014 production-source change
- Design: `docs/design/0015-deployed-mvp-program-rebaseline-and-d0014-postreview.md`
- Program owner: `docs/ROADMAP.md`
- D0014 review: `docs/D0014_POST_VERIFICATION_REVIEW.md`
- Post-review evidence: `docs/evidence/mvp-1a-7-d0014-postreview-2026-08-10.json` (SHA-256 `469e9832affe98a52e7fa2c2c2a7908afd34f7c035c1497593294d6871c7d5fc`)
- Final-MVP requirement: Cloudflare Case/Agent runtime + authenticated local Agent + deployed Git + secured MCP + configuration/migration/rollback/operations + final deployed qualification
- D0014 disposition: remains `verified`; source/product evidence intact; no production-source correctness reopen; one timing-sensitive lifecycle test guard corrected
- Provenance correction: artifact `9048558724` current GitHub/downloaded outer ZIP SHA-256 is `7578976ee2f7695a8f7922255a5b07e486f1bb824e12c4d60dfa2f6e63ed21bf`; historical Issue value is superseded for outer-ZIP provenance only
- Resource clarification: context-cache entry/byte limits bound retained complete preparations; pending different-key live work follows caller/admission concurrency and has no D0014 executor-global memory budget
- D0016 disposition: accepted decision on 2026-08-11; immutable full-context reference envelope selected from measured evidence with no production `src/` change
- D0017 disposition: Design remains `accepted` from 2026-08-12; representation-independent authorized reference + bounded packed/hybrid receiver representation; Design evidence `docs/evidence/group-e-d0017-context-delivery-contract-2026-08-12.json` SHA-256 `a901816ada0d25858bcc78b94a2dc091376c34c004e6041027e22a5ddf9a3ca2`; production source is independently `verified` on the supported-Termux source scope at `eea429100d4bc6b6e9e6b74a29da2fbcdecc53db`, with production evidence `docs/evidence/group-e-d0017-production-verification-2026-08-12.json` SHA-256 `ea9371c467dd5b1d86ddbfb97b81109c0d1b0885186610f04b92bb753cd1b907`; exact all-test coverage is platform-unqualified only for the existing ImmutableJournal hard-link `EACCES`

### D0014 — verified repository/model transport product-efficiency slice

- Status: `verified` for bounded executor-local exact-base preparation reuse and POSIX lifecycle hardening; `mvp-1a-7` was the active development direction at verification time
- Design: `docs/design/0014-bounded-context-preparation-reuse-and-process-lifecycle.md`
- Independently validated source candidate: `bb5e665e9d6c28b130d4e25dc373e8fce2053ff0`
- Authority: D0010 Case head/semantic root and Plan `baseDigest` remain authoritative; cache/preparation/encoding/observation state is derived, bounded, optional and restart-cold
- Fix: exact-key one-producer/many-reader preparation reuse, finite LRU, early `ls-tree -l` bounds, unique-blob reads, cancellable Git, safe replacement after all-reader cancellation, request encoding reuse, POSIX process-group cleanup on direct-child exit, and non-blocking observations
- Independent Ubuntu/POSIX validation: run `31348795334`, job `93335641224`; **232/232** complete tests, **93.10% line / 82.16% branch / 96.30% function** coverage, **32/32** focused tests, 22 baseline + 22 candidate scenarios, repeated tail workloads, clean diff and exact source bundle
- Actual repository result, 8 Tasks / 1 base: wall 5,287.2 -> 1,027.2 ms (-80.6%), bounded batch completion rate 1.513 -> 7.788/s (+414.7%), Git calls 48 -> 5, Git stdout 14.421 -> 1.803 MB; request bytes remain 15,071,128 and process starts remain eight
- Retry result: preparation amplification 1/2/3/4x -> 1x for zero through three retries; full request/process amplification remains Attempt-count dependent
- Evidence: `docs/evidence/mvp-1a-7-repository-model-efficiency-2026-08-10.json` (SHA-256 `ca22551d8137eadefd5af6c1f33196dfee4971f68e65e6d42f063d656b27f610`)
- Audit report: `docs/D0014_PRODUCT_EFFICIENCY_AUDIT.md`
- Boundaries: no deterministic ContextSlice, persistent manifest/CAS, cross-worker reuse, warm process, provider/tokenizer/billing claim, locality scheduler or semantic-authority change

### D0013 — verified real repository context and trusted-local model transport

- Status: `verified` for the bounded trusted-local repository/context/subprocess profile; `mvp-1a-7` was the active development direction at verification time
- Design: `docs/design/0013-real-repository-context-and-model-transport.md`
- Independently validated source candidate: `3f7c04ad4e343af2968d082bf4ffb559e2580100`
- Profiles: `tdev.repository-context.git-full-text.v1` and `tdev.model.subprocess-json.v1`; operation `tdev.model.repository`
- Authority: exact immutable Git commit context is a derived input; D0010 Case head/semantic root remain authority and returned model results still pass existing Plan/Claim/fencing/result/Promotion acceptance
- Context boundary: read-only Git objects, fatal UTF-8 `100644`/`100755` regular blobs, exact path-to-text `baseDigest` binding, no worktree/index/ref mutation, and request-digest-bound subprocess response
- Independent Ubuntu/POSIX validation: GitHub Actions run `31331491616`, job `93290347063`; **216/216** complete source tests, **92.86% line / 81.61% branch / 96.34% function** coverage, **16/16** D0013 focused tests, actual source-candidate repository probe, and clean effective diff
- Independent repository probe: 101 files / 1,757,785 content bytes, SHA-1 tree `a3eaa014d122c6ccbfc58e9945520eb4569d588e`, context digest `sha256:aa1b3d1a9b9ee155ed73bc0d4b8250d091ef942558567af39fde8feeec6d6ec4`, executable file `src/cli.mjs`
- Measured baseline: four Attempts requested 7,031,140 context bytes for one unique 1,757,785-byte context; 5,273,355 bytes were repeated and one retry reconstructed 1,757,785 bytes. The 75% fraction is structurally predictable; the absolute values are the measured evidence
- Evidence: `docs/evidence/mvp-1a-7-repository-model-transport-2026-08-10.json` (SHA-256 `a470635bee28c5584ac61abf51340548d6df5eca3872dbd73569b0ea8a03a614`)
- Historical boundaries at D0013 verification: no external LLM/provider API, provider authentication/data-egress/billing/retry semantics, tokenizer/token accounting, Context manifest/CAS/Slice, context cache, warm executor, locality scheduling, or model/provider semantic authority; D0014 later adds only bounded process-local preparation reuse

### D0012 — verified authenticated remote Git publication source contract

- Status: `verified` for the generic existing-remote-branch source protocol plus authenticated GitHub push dry-run capability; `mvp-1a-7` was the active development direction at verification time
- Design: `docs/design/0012-authenticated-remote-git-publication.md`
- Independently validated source candidate: `28ed1912dc61b8d33277f599ada6010a30a7f357`
- Profile: `tdev.git.remote-existing-branch.v1`; D0010 semantic root/Case head remain authority and remote Git remains derived publication
- Admission: locally elected D0011 candidate, non-null exact predecessor, existing remote branch, immutable target-bound intent, and no raw credential or clear push URL in canonical data
- Publication/recovery: exact expected-predecessor remote lease, mandatory remote reread after success/error, no blind replay, restart-safe read-only reconciliation, and fenced rollback with provider rejection kept fail-safe
- Independent Ubuntu/POSIX validation: GitHub Actions run `31328662608`, job `93283174570`; **200/200** complete source tests, **92.79% line / 81.88% branch / 96.52% function** coverage, **22/22** combined D0011+D0012 focused tests, and clean effective diff
- Provider capability: current GitHub transport completed authenticated `git push --dry-run` with `GIT_TERMINAL_PROMPT=0`; the dedicated probe ref remained absent before and after
- Evidence: `docs/evidence/mvp-1a-7-remote-git-publication-2026-08-10.json` (SHA-256 `b89afba6de72a289fc6cb8574f2a07943483d1d222bd047b858bf5344479df55`)
- Boundaries: no actual D0012 provider-ref integration/restart evidence, protected-branch/ruleset qualification, provider-specific IAM/policy introspection, signing, multi-host publication owner, provider transaction coupling, hostile-provider authenticity, or Git/ref semantic authority

### D0011 — verified real local Git projection and fenced publication

- Status: `verified` for local Git object/ref projection only; `mvp-1a-7` was the active development direction at verification time
- Design: `docs/design/0011-real-git-projection-and-fenced-publication.md`
- Independently validated source candidate: `c321e9079855c87b9df806930b2cd48c61244e9b`
- Profile: `tdev.git.text-tree.v1`; semantic authority remains the D0010 semantic root/Case head and Git OIDs remain derived identities
- Projection: exact UTF-8 semantic path/text map -> `100644` blobs -> Git trees -> explicit-metadata commit, with SHA-1 and SHA-256 repository object formats independently exercised
- Publication: direct full `refs/heads/...` only, no index/worktree; one exact expected-predecessor `update-ref` CAS, durable reread for ambiguous outcomes, and separate fenced rollback
- Hardening: Git tree/blob graph is reread and rebuilt through the existing semantic-root policy; commit bytes are rebound to tree/parent/metadata; inherited `GIT_*` routing is scrubbed; replacement refs and hooks are disabled for plumbing
- Independent Ubuntu/POSIX validation: GitHub Actions run `31325628829`, job `93275404092`; **191/191** complete source tests, **92.80% line / 82.37% branch / 96.34% function** coverage, **13/13** focused real-Git tests, SHA-1/SHA-256 bare-repository capability checks, and clean effective diff
- Evidence: `docs/evidence/mvp-1a-7-git-projection-2026-08-10.json` (SHA-256 `b62bcc3c4f96b407a228a7e35c832f06936087db0ff9954e7dea538142fcfebd`)
- Connected tmcp/Termux: D0011 focused 13/13 passes, but the complete inherited source suite is still not qualified there because ImmutableJournal hard-link publication hits `EACCES`
- Boundaries: no remote fetch/push/ref CAS, provider authorization/protected branch, signed refs/commits, distributed publication owner, provider transaction coupling, Git-object GC, or Git OID semantic authority

### D0010 — verified semantic-authority migration and transactional head

- Status: `verified` for the bounded opt-in local semantic-v3 profile; existing v2 repositories remain supported and unchanged
- Design: `docs/design/0010-semantic-authority-migration-and-transactional-head.md`
- Independently validated source candidate: `152f88daa7775c5d545ec865cc0a8a470b45697e`
- Production choice: compressed UTF-8 path-byte radix profile `tdev.semantic.path-byte-radix.v1`; C3 remains research reference because path-hash-only authority loses topology prefix locality
- Persistence: compact schema-v3 snapshots plus immutable typed semantic objects and one expected-predecessor local SQLite Case head; object existence alone is not authority
- Migration: explicit writer/Claim quiescence, pre-Promotion v2 source only, exact source digest/revision recheck immediately before first v3 head; no rolling mixed-writer mode
- Recovery: ambiguous commit outcomes reconcile the durable head; exact-content repair never moves the head; reference-aware GC preserves current heads and pins under expected-state CAS
- Independent Ubuntu/POSIX validation: GitHub Actions run `31311936616`, job `93240950927`; 178/178 complete source tests, 92.74% line / 82.56% branch / 96.26% function coverage, clean effective diff, and 67/67 focused D0010 migration/head/recovery tests
- Evidence: `docs/evidence/mvp-1a-7-semantic-authority-migration-2026-08-09.json` (SHA-256 `2129639870f970a10e2aaeb7e393672e4e5faec4e9c3e332361285069890f99e`); 12/12 semantic-equality samples
- 100k / one write: 14 semantic-node reads, 7 node writes, 8 object deltas; schema-v3 snapshot 3,396 bytes versus schema-v2 6,180,415 bytes; explicit compatibility materialization remains O(N) and is not hidden in the normal v3 authority path
- Boundaries: no Git OID authority, real repository publication adapter, provider/distributed transaction owner, distributed Claim migration, hostile-storage authenticity, or universal rewrite of historical v2 Cases

### D0009 — verified semantic-authority representation comparison

- Status: `verified` for non-authoritative model/evidence scope; no production authority migration
- Design: `docs/design/0009-semantic-authority-representation-comparison.md`
- Validated candidate: `7ba03082ac94fe75242c22a7b31ca76d933aeb0c`
- Correctness: focused deterministic/create-delete/collision/batch tests green; independent Ubuntu/POSIX source gate passed 152/152 tests with 92.57% line / 83.10% branch / 95.99% function coverage
- Matrix: 144 model samples; 141 completed with exact current Promotion tree and legacy digest equality; three 100k broad samples stopped only during full compatibility materialization/digest RSS gating
- C1: rejected because a one-path update in a 100k wide directory hashed 100,000 sibling references and about 10.2 MB metadata
- C2: structural survivor; 100k one-path update wrote 16-37 nodes depending on path shape; retained for path-prefix-locality/no-path-hash comparison
- C3: preferred structural research candidate; 100k one-path update wrote six nodes; 100k wide 10k-write update wrote 21,756 nodes and used 31,757 typed hashes + 10,000 counted path-key hashes versus C2's 61,117 nodes / 71,118 typed hashes
- Evidence: `docs/evidence/mvp-1a-6-semantic-authority-representation-2026-08-09.json` (SHA-256 `f8609316970e28f311d83aecb550b7be07d0a1d53938517931f9271e09ad5db4`)
- Decision boundary: C3 preference authorizes only the next migration-design work; current full-tree semantic identity and persistence remain authoritative

### D0008 — verified authority-boundary and durability admission

- Status: `verified` in the declared source/compatible-local-filesystem scope
- Design: `docs/design/0008-authority-boundary-verification-and-durability-admission.md`
- Source candidate: `cf6b89d6bb2cff0b60ab2ca1a4521631f68c559f`
- Hardening: store-owned exact materialized capacity checks; zero-effect external-effect capacity admission; legacy committed-namespace fail-closed parity; deterministic immutable publication fault seam; settlement-checkpoint/Claim reopen liveness
- Correctness evidence: local syntax + 33/33 focused durable/store tests + clean diff check; Ubuntu/POSIX complete `npm run check`, coverage command, diff check, and 16-sample authority smoke all succeeded with hard-link tests enabled
- Authority-path evidence: 32 configured samples; 24 completed 1k/5k/20k samples with exact Promotion/cold-restore equality; all eight 100k samples retained as declared time/RSS stops, including sparse 1/8-write cases
- Evidence: `docs/evidence/mvp-1a-5-authority-boundary-2026-08-09.json` (SHA-256 `57add849efafa93fa74b830ae29001ffc06c783fb70b55c94dcc4052be6ed79c`)
- Boundaries: no semantic-root/schema/journal-format/Git-OID/provider/distributed-Claim change; connected tmcp/Termux filesystem is unqualified for ImmutableJournal publication because hard-link creation was denied

### D0007 — verified immutable-journal materialization reuse

- Status: `verified` in the declared source/container scope
- Design: `docs/design/0007-verified-immutable-journal-materialization-cache.md`
- Direct parent: exact `mvp-1a-3@52e79323f80bccd1123b7a538a6d49d5754cd1ec`
- Implementation: every load/non-create CAS strictly observes the committed namespace and rereads all retained authority bytes; exact ordered filename/length/raw-byte fingerprint equality may reuse only a previously validated instance-local materialization; mismatch/restart/cache loss performs complete D0005 replay
- Correctness evidence: 20/20 focused immutable-journal tests; 130/130 complete source tests; inherited same/cross-process one-winner, migration, corruption, restart, and stale-CAS barriers remain green
- Coverage: 91.84% lines / 81.82% branches / 96.19% functions
- Performance evidence: 32 Tasks / 4 KiB / capacity 8 / three repeats: D0005 Immutable 3397.535 ms p50 -> D0007 Immutable 1007.262 ms p50 (3.373x); candidate Journal 1014.298 ms p50; retained Immutable bytes unchanged at 277,023; fresh-instance load remains about 97 ms
- Evidence: `docs/evidence/mvp-1a-4-materialization-reuse-2026-08-08.json`
- Boundaries: no durable checkpoint/head, history deletion, SQLite authority, provider migration, or distributed-CAS claim

### D0006 — persistence hot-path measurement

- Status: `verified` research/evidence gate
- Design: `docs/design/0006-persistence-hot-path-measurement.md`
- Baseline: exact `mvp-1a-3@52e79323f80bccd1123b7a538a6d49d5754cd1ec`
- Main result: retained-byte read/fingerprint was a small fraction of immutable strict replay; exact cumulative prefix replay byte-work grew about 8x from 16 to 32 tasks in the measured wide observation workload
- Evidence: `docs/evidence/persistence-phase0-2026-08-08.json`
- Decision: D0007 V opened; authoritative checkpoint/Merkle remained deferred

### D0005 — immutable expected-revision journal CAS

- Status: `verified` inherited foundation
- Design: `docs/design/0005-immutable-expected-revision-journal-cas.md`
- Implementation: opt-in `ImmutableJournalSnapshotStore`, immutable expected-revision publication slots, source/target snapshot-digest binding, same-process journal-family serialization, and explicit quiesced legacy-to-v2 cutover
- Correctness evidence: inherited focused immutable-journal, cross-process one-winner, migration, corruption, and complete-source barriers remain mandatory for D0007
- Evidence: `docs/evidence/mvp-1a-3-immutable-journal-2026-08-07.json`
- Remaining boundary: cross-process mixed legacy/new writers remain unsupported during cutover; provider/distributed CAS remains unverified

### D0004 — incremental transition core and verified journal cache

- Status: `verified` inherited foundation
- Design: `docs/design/0004-incremental-transition-core-and-verified-journal-cache.md`
- Implementation: entry-level transaction undo, incremental Task/dependency accounting, deterministic topological blocker propagation, rebuildable scheduler indexes, Claim trie pruning, same-process store serialization, durable-byte-fingerprinted journal materialization cache
- Correctness evidence: randomized full-restore oracle; three-state successful-transition differential; capacity/order/executor/retry determinism; fencing; durable-before-dispatch; corruption/truncation/missing-base/compaction-shape recovery; acceleration loss and rebuild equivalence

### D0003 — efficient parallel control plane

- Status: `superseded and independently re-audited`
- Historical design: `docs/design/0003-efficient-parallel-control-plane.md`
- Preserved value: immutable-record direction, incremental event validation, normalized Claim conflict path, ready candidates, journal delta format, benchmark instrumentation, and explicit substrate stop gates

### D0002 — durable parallel control core

- Status: `verified historical foundation`
- Its correctness invariants remain normative where not replaced by stronger later designs.

## Resulting foundation

- one immutable PlanRevision and DAG;
- one Case lifecycle owner and one Task/Attempt transition path;
- capacity-independent scheduling semantics;
- isolated typed results and one deterministic Promotion/canonical writer;
- complete Attempt identity, fencing, retry/effect-class, Claim, and authority checks;
- durable running Attempt before external dispatch and durable settlement before lease release;
- schema-v2 canonical snapshots and deterministic restore/migration;
- entry-level atomic rollback without root collection copies;
- incremental Task-state/dependency/ready accounting with full restore as the semantic oracle;
- disposable indexes and caches that can be deleted and rebuilt without changing legal output;
- memory, full-snapshot file, Design 0004 journal, and D0005 immutable expected-revision journal adapters;
- D0007 immutable-journal materialization reuse only after strict namespace observation plus exact retained-byte fingerprint equality;
- D0008 concrete-store capacity admission, fail-closed legacy namespace, deterministic local publication-fault evidence, settlement/reopen Claim liveness, and complete authority-path measurement without semantic-authority migration;
- D0009 non-authoritative representation evidence rejecting simple directory Merkle and retaining C2/C3 structural knowledge;
- D0010 opt-in semantic-v3 authority with one compressed path-byte radix owner, sparse root Promotion, compact schema-v3 snapshots, transactional local head, quiesced v2 migration, ambiguity recovery, exact repair, and reference-aware GC while legacy v2 remains supported;
- D0011 real local Git projection over that semantic root with bare-repository SHA-1/SHA-256 support, deterministic `100644` text-tree projection, exact local branch-ref CAS/reconciliation/rollback, and no change to semantic authority;
- D0012 generic authenticated remote-publication source protocol over an existing remote branch, with immutable target intent, exact predecessor fencing, reread/restart reconciliation, fail-safe rollback, external credential ownership, and no change to semantic authority;
- D0013 read-only exact-commit full-text context plus trusted-local request-digest-bound subprocess transport, with existing result/fencing/Promotion authority unchanged and measured full-context/retry absolute cost;
- D0014 bounded exact-base preparation/canonical-encoding reuse, early bounds, unique-blob reads, Git cancellation, POSIX lifecycle cleanup and non-blocking observations, all as derived/rebuildable execution state.

## Next highest-ROI gates

These are ordered follow-on gates, not verified implementation claims.

1. in a separate D0019 production Root Task, implement and independently qualify durable placement election plus the elected SQLite-backed CaseDO authority adapter for new Cases, including exact command-only receipt replay, stale/concurrent command, pre/post-commit loss, ordinary eviction with no implicit reopen, explicit owner-loss recovery, corruption, running-before-dispatch, stale-result, storage-capacity and old/new rollout-compatibility injection; do not add an existing-Case migration path;
2. run D0020 as a separate AgentDO/equivalent owner Design for connection epoch/current connection/delivery queue/capacity/reconnect and prove the crossing from committed D0019 running state;
3. implement/qualify D0030 only in its own production Task or when an authorized verification route actually requires the Termux ImmutableJournal write path; do not mix it into D0019 source changes;
4. activate D0022 persistent/shared content storage only if a later accepted contract proves it is a correctness/availability requirement rather than a cache optimization;
5. qualify D0012 against an actual provider ref and protected/provider-policy target before promoting it beyond source verification; keep provider refs derived unless a separately accepted direction change says otherwise;
6. continue later Cloudflare/MCP/security/deployment gates under their explicit authority, migration, filesystem/provider and rollback contracts.

D0010 closes the bounded local semantic-v3 authority/head/migration/repair/GC contract, D0011 closes bounded local real-Git projection/ref-CAS, D0012 closes bounded authenticated remote-publication source semantics, D0013 establishes the trusted-local full-context/process-per-Attempt baseline, D0014 closes bounded same-base preparation reuse plus failure-path lifecycle hardening, D0017/D0018 close their declared supported-Termux production layers, and D0019 now closes the Design-level CaseDO semantic-authority placement decision. Provider deployment/production qualification, D0020 distributed delivery ownership, persistent cross-worker CAS, actual D0012 protected-provider qualification and any existing-Case authority migration remain future work where applicable.

## Routing

- Development checkpoint succession: `docs/development/BRANCH_LINEAGE.md`
- Development-plane synchronization: `docs/development/WORKFLOW.md`
- Session-access model: `docs/development/ACCESS.md`
- Development program register: `docs/development/PROGRAM.md`
- Documentation taxonomy: `docs/DOCUMENTATION.md`
- Historical lineage: `LINEAGE.md`
- Change method: `SDD.md`
- Product contract: `docs/SPEC.md`
- Architecture/ownership: `docs/ARCHITECTURE.md`
- State/result/persistence protocol: `docs/PROTOCOL.md`
- Executor/effect operations: `docs/OPERATIONS.md`
- Security/trust/path boundaries: `docs/SECURITY.md`
- Deployment/migration/rollback: `docs/DEPLOYMENT.md`
- MCP projection: `docs/MCP.md`
- Verification and acceptance: `docs/MVP.md`
- Independent audit and implementation report: `docs/IMPLEMENTATION_REPORT.md`
