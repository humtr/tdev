# tdev development program register

> Engineering execution owner for mapping the final-MVP capability roadmap into provisional Design-sized gates, dependencies, falsifiers, cumulative Group lanes and exit evidence. Product scope remains owned by `docs/SPEC.md`; product fact ownership remains owned by the normative product documents; `docs/ROADMAP.md` owns the high-level capability program. Branch/checkpoint succession is owned by `LINEAGE.md`; the current routing instance is owned by `WORKBOARD.md`. Entries here are planning/execution records and do not authorize Class 2 code until an accepted Design exists under `SDD.md`.

## 1. Routing relationship

`PROGRAM.md` is the Design-sized dependency/coverage graph, not the current router. Resolve the active cumulative Group/branch, current Design gate and exact next action from `WORKBOARD.md`; resolve legal checkpoint succession from `LINEAGE.md`.

Status and lane fields below are planning/derived views. They must be repaired when their owners change, and later documentation validation may check them for drift. A stale program status cannot originate an alternate branch, reopen a completed checkpoint or authorize Class 2 implementation.

The A-H Capability Group structure remains the program decomposition inherited from `docs/ROADMAP.md`. Exact historical checkpoint identities remain available in retained Design/evidence/history records and, when they still constrain the current route, in `WORKBOARD.md`.

## 2. Capability Group register

| Group | Capability | Program status (derived) | Existing verified foundation | Cumulative checkpoint lane | Final-MVP exit |
| --- | --- | --- | --- | --- | --- |
| A | Parallel execution and durable core | foundation verified | D0001-D0008 | historical foundation retained in `mvp-1a-7` ancestry | target adapters preserve one scheduler/lifecycle meaning, durable-before-dispatch and existing acceptance oracle |
| B | Semantic authority and persistence | local verified; deployed host open | D0009-D0010 | inherited foundation; deployed closure occurs while later cumulative Groups advance | target Case runtime hosts or explicitly migrates D0010 authority with restart/response-loss equivalence |
| C | Git and publication | source verified; deployed integration open | D0011-D0012 | inherited foundation; deployed closure occurs while later cumulative Groups advance | Promotion-derived candidate reaches authenticated remote publication through one fenced/reconcilable lane |
| D | Repository and model execution | trusted-local verified | D0013-D0014 | inherited foundation; D0018 closes the remaining D/E boundary on Group E | final executor/provider preserves result-only, fencing, cancellation, retry, identity and resource contracts |
| E | Context delivery and model input | **completed checkpoint / D0016+D0017+D0018 accepted; D0017+D0018 source/runtime verified** | D0016 mechanism decision + D0017 contract/source + D0018 runtime decision | retained `group/e-context-delivery@151aed9ffdb86fd3967b8ab7ecfd012e884a0e3e` | satisfied for the declared Group E exit scope; retained checkpoint feeds F by ancestry |
| F | Cloudflare runtime and local Agent topology | **active / topology not implemented** | architecture mapping only plus inherited E checkpoint | Group F cumulative checkpoint lane; activation comes from `WORKBOARD.md` | CaseDO/AgentDO/local Agent ownership, delivery, restart, capacity, fencing and integration are deployed and verified |
| G | MCP, authentication and security | boundary documented; not implemented | `MCP.md`, `SECURITY.md` | successor `group/g-mcp-security`, created only from final Group F | real supported MCP endpoint passes schema/auth/tenant/replay/fence/limit/reconnect/current-client gates |
| H | Deployment, operations and final qualification | not implemented | deployment/operations requirements only | successor `group/h-deployment-qualification`, created only from final Group G | fresh setup, deployment, migration/rollback, recovery and full deployed qualification pass |

A Design can close more than one Group exit when the same authority decision genuinely spans them. Because branch progression is cumulative, a cross-Group Design is not implemented by merging independent Group branches; earlier accepted work is inherited by ancestry and later Groups may extend it under their own gates.

## 3. What the pre-existing roadmap already captured

Before this register, `docs/ROADMAP.md` already captured the following program facts:

- final MVP means deployed Level-4 qualification, not source-only completion;
- hierarchy `MVP Program -> Capability Group -> Design -> Verification Gate`;
- Groups A-H and their high-level status/final exit conditions;
- the post-D0014 remaining context/model cost;
- required D0016-D0029 provisional planning labels;
- topological ownership hypotheses for CaseDO, AgentDO, local Agent, R2/D1 equivalents and MCP/Worker;
- external user/provider configuration gate fields;
- a coarse dependency spine;
- a minimum final deployed E2E/failure/security matrix;
- conditional/post-MVP treatment of persistent CAS and other scale mechanisms.

Those items remain valid unless a later accepted Design or product owner changes them.

## 4. Gaps that were not fully captured before this register

The high-level roadmap did **not** fully own the following execution details:

1. separation of product-contract, self-development and evidence documentation layers;
2. Termux/GitHub/ChatGPT capability asymmetry and temporary synchronization debt;
3. exact Git commit identity versus per-location mutable ref observation;
4. cumulative `group/*` Capability Group checkpoint lifecycle and successor-creation rule;
5. current active Group/branch execution contract;
6. per-Design authority/non-owner boundary;
7. per-Design cheapest falsifier;
8. per-Design explicit exit evidence;
9. per-Design provider/user-configuration dependency;
10. per-Design active cumulative Group lane;
11. a coverage rule proving every product requirement maps to Group -> Design/gate -> evidence;
12. explicit treatment of cross-group Designs and conditional Designs;
13. a register of unresolved questions whose answers can split, combine, remove, reorder or defer a Design.

This file and the other `docs/development/*` owners close the documentation gap without pretending the provisional decisions have already been accepted.

## 5. Provisional Design register

### D0016 — Per-Attempt Context Delivery Minimization Decision

- **Group:** E
- **Status:** accepted decision — 2026-08-11
- **Purpose:** remeasure the post-D0014 cost profile and choose the next semantic/transport layer rather than preselect ContextSlice.
- **Compared:** inline full context, immutable bundle reference, manifest/content references, warm inline, streaming inline and warm+reference hybrid; ContextSlice/persistent CAS/provider work remained explicitly bounded out where their prerequisite contracts were absent.
- **Measured:** same-base 1/2/4/8, multi-base 2/4/8, retry 0..3, cold restart, capacity + 1, repository-shape sensitivity, stale/corrupt/missing references, input-limit rejection and cancellation.
- **Accepted staged strategy:** immutable full-context reference envelope. D0017 must define the authorized immutable logical reference and choose/falsify the bounded receiver representation; D0018 separately owns warm executor/provider lifetime.
- **Affected owners:** repository/model execution and future provider/context transport; no semantic-authority migration is assumed.
- **Explicit non-owners:** cache hit rate, Git OID or provider reference existence cannot authorize Case/Task/result/Promotion state.
- **Prerequisites:** D0014 verified; post-review attribution/resource bounds understood.
- **Cheapest falsifier:** equivalent full-context same-base/multibase/retry workloads that separately measure parent construction/copy, transferred bytes, receiver parse, process/provider startup and memory; any candidate that fails semantic-equivalence or does not remove the measured bottleneck is rejected.
- **Exit:** one selected staged strategy, or an explicit evidence-backed decision to retain current full-context transport; residual costs and rejected alternatives recorded.
- **User/provider action:** none required for local comparison; provider-specific candidate measurements require credentials only if/when an external provider is selected.
- **Lane:** active cumulative `group/e-context-delivery`.

### D0017 — Selected Context Delivery Contract

- **Group:** E
- **Status:** **accepted Design — 2026-08-12; production source independently verified on the supported-Termux source scope**
- **Purpose:** freeze the D0016-selected immutable full-context reference contract; the later Class 2 production implementation now demonstrates the same accepted meaning without changing Design authority.
- **Accepted logical identity:** `repositoryCommitOid` + semantic `baseDigest` + repository `contextDigest` + authorization-scope digest over `caseId`/`planDigest`/`caseContractDigest`; `attemptId` and physical locators are excluded.
- **Authorization:** reference possession is not authority; the receiver recomputes scope from the already-admitted invocation before exposing content.
- **Selected receiver representation:** bounded packed/hybrid under the same logical reference; current v1 bounds are 128 files/pack, 2 MiB semantic bytes/pack, 3 MiB stored bytes/pack, 512 KiB manifest and at most 790 packs, in addition to inherited repository semantic bounds.
- **Failure/lifecycle:** unauthorized/stale/missing/corrupt/limit-exceeded fail before model acceptance; retry/restart preserves exact identity; partial cancellation has no accepted effect; retention/eviction belongs to derived receiver-local materialization.
- **Alternatives:** single canonical bundle and fine-grained manifest/content refs remain valid comparators/possible future physical representations but are not the selected v1; ContextSlice remains unselected.
- **Durability boundary:** no persistent/shared CAS is required; D0022 remains conditional.
- **Evidence:** Design evidence `docs/evidence/group-e-d0017-context-delivery-contract-2026-08-12.json` SHA-256 `a901816ada0d25858bcc78b94a2dc091376c34c004e6041027e22a5ddf9a3ca2`; production implementation `eea429100d4bc6b6e9e6b74a29da2fbcdecc53db`; production verification `docs/evidence/group-e-d0017-production-verification-2026-08-12.json` SHA-256 `ea9371c467dd5b1d86ddbfb97b81109c0d1b0885186610f04b92bb753cd1b907`; focused D0017+transport 52/52 and supported-Termux source coverage 226/226 passed, while exact all-test coverage is platform-unqualified only for the existing ImmutableJournal hard-link `EACCES`.
- **Cheapest implementation falsifier:** exact identity equality across retry/restart plus unauthorized/stale/missing/corrupt/bound/cancel rejection before model acceptance on the real implementation path.
- **Exit:** satisfied for D0017 production source: independently `verified` without creating a second semantic owner. Group E remains active because D0018 and the later Group E exit review/checkpoint remain open.
- **User/provider action:** none for this trusted-local contract decision; external provider/storage actions belong to their later accepted owner.
- **Lane:** active cumulative `group/e-context-delivery`.

### D0018 — Model Executor / External Provider Runtime Contract

- **Groups:** D/E
- **Status:** **accepted Design — 2026-08-12; production source/runtime verified on supported-Termux trusted-local scope — 2026-08-13**
- **Purpose:** preserve the accepted trusted-local `warm-host-qualified-model-attempt-fresh` profile: reusable bounded D0014 host preparation with fresh D0017 authorization/runtime/model process per Attempt, plus the frozen C1-C4 live-control/checkpoint/capacity repair.
- **Production source:** `73d404bdc24eac8337019738ba074c2a1fea4861`.
- **Evidence:** `docs/evidence/group-e-d0018-production-verification-2026-08-13.json` SHA-256 `2a1f53043c326ada9618d54ffc8d114b1666f2c25986226637287190948216b7`; exact supported-Termux suite 233/233; adversarial reference protocol 27/27; W01-W43 warm qualification exit 0 with F/WH starts 4/4, reuse 0/0 and materializations 4/1.
- **Affected owners:** executor admission/identity, process/provider lifecycle, result-only boundary, timeout/cancellation/retry, request identity, provider errors, resource limits.
- **Must separate:** local process identity from provider identity; transport retry from Task retry; provider timeout from effect/result acceptance; provider usage/billing observation from semantic state.
- **External-provider status:** no external provider is selected by D0018; provider authentication/egress/billing/session work remains outside this verification and becomes applicable only under a later accepted owner if a provider is selected.
- **Qualification limits:** exact `npm run check` remains platform-unqualified for the pre-existing ImmutableJournal hard-link `EACCES`; instrumented full coverage additionally exposes timing guards that pass uninstrumented. Neither layer is counted green.
- **Cheapest falsifier:** same invocation/Attempt identity through the selected runtime with timeout/cancel/retry/stale-response tests and exact result acceptance parity with the existing local oracle.
- **Exit:** satisfied for D0018 production source/runtime under the declared trusted-local qualification; Group E final owner sync/publication/replica reconciliation/checkpoint remain separate cumulative-branch gates. Later Group F runtime work inherits this contract and may extend it only through a later accepted Design.
- **Lane:** active cumulative `group/e-context-delivery` for the E-facing contract; no cross-branch merge is planned.

### D0019 — CaseDO Authority Adapter

- **Groups:** B/F
- **Status:** **accepted Design revision 2 — 2026-08-13; production implementation/qualification separate**
- **Purpose:** elect exactly one Cloudflare provider placement for a new Case and host the existing D0010/CaseEngine semantic/current-state authority in that one elected SQLite-backed CaseDO, without creating a second semantic owner or rewriting the state machine.
- **Selected model:** Candidate A — one durable placement generation binds `CaseId` to the exact deployment/environment, Worker script, class/namespace, jurisdiction and Durable Object ID; that elected CaseDO is the physical host/adapter. Placement is meta-authority for physical ownership only. Durable SQLite in the elected CaseDO owns Case current revision/semantic head, command receipts, Task/Attempt lifecycle, accepted result, terminal status and running-before-dispatch state; in-memory DO state and Worker/D1/R2/Git projections are non-authoritative.
- **Command boundary:** receipt identity is exactly `typedDigest('tdev.case-command.v1', canonicalClone(command))`; `requestId` addresses the receipt and `expectedCaseRevision` is excluded from the digest. After a valid envelope, exact receipt replay precedes revision equality. With no matching receipt, expected revision fences one existing CaseEngine mutation and the successor head/revision/receipt commits atomically; external I/O is outside the transaction. A possible post-commit response loss is unknown until the same elected durable receipt/state is reread.
- **Restart/recovery:** ordinary CaseDO eviction/reconstruction rebuilds only from durable storage with semantic reopen disabled; constructor/cache/stub/deployment loss is not proof of execution-owner loss. Only a separate durable execution/delivery-owner-loss recovery cause may invoke the existing `reopen:true` transition, fenced and committed exactly once; corrupt/incompatible state fails closed.
- **Storage/rollout:** initial production uses `tdev.casedo.sqlite-authority.v1` / schema version 1, normalized/chunked authoritative state, a finite total Case budget positively qualified from the actual provider/account profile, and compatible old/new API+schema overlap or a fail-closed rollout barrier.
- **Migration decision:** no existing locally authoritative Case is migrated by initial D0019. New qualified Cases may be born only after durable placement election plus adapter/profile qualification. Any future existing-Case move requires a separate accepted cutover Design with durable placement generation, old-writer fence, source quiescence, destination activation, receipt/in-flight/restart/retry/rollback proof.
- **Rejected:** ad-hoc CaseDO-native semantic rewrite for current MVP; unfenced `copy then switch` was executably falsified because two writable copies accepted divergent same-revision commands; CaseDO eviction as an implicit semantic process-recovery signal is also rejected.
- **D0020 boundary:** Agent connection epoch/current connection/delivery owner/queue/capacity/reconnect remain D0020 facts. D0019 commits running Attempt/fencing state before crossing into delivery, and distributed execution/delivery-owner-loss evidence must come from that crossing rather than CaseDO lifecycle.
- **D0030 boundary:** D0030 remains accepted/separate; its production implementation is only a later prerequisite for a D0019 verification route that actually exercises the Termux ImmutableJournal authoritative write path.
- **Evidence:** predecessor `docs/evidence/group-f-d0019-casedo-authority-adapter-acceptance-2026-08-13.json` SHA-256 `6e196ff1cae6c9ef993bcebf112405234fccc7c682a4563811c16ab2e41e7daa`; amendment `docs/evidence/group-f-d0019-authority-amendment-2026-08-13.json` SHA-256 `79470299245e617147976b7f806c0e23dc78dfc2a47ca867cb80f984a73dd623`; fresh model + inherited oracle run 44/44 passed; amended falsifier SHA-256 `8e41ec7905898b1f479b4c62e8863af4b45077da250cd2ba360eb8c8df717d69`.
- **Provider evidence:** current Cloudflare primary docs were reverified for SQLite transactions/strong consistency, eviction/reconstruction, error/stub ambiguity, environment/jurisdiction-scoped identity, storage limits, class/storage lifecycle and old/new code rollout overlap; the accepted model does not rely on undocumented transaction-callback replay, exactly-once RPC/alarm delivery or DO memory permanence.
- **Production gate:** implement durable placement election plus one elected normalized/chunked SQLite-backed adapter/profile, inject competing placement, exact receipt replay with changed valid revision metadata, stale/concurrent/precommit/postcommit-loss, ordinary eviction/no-reopen, explicit owner-loss recovery, corruption, capacity, rollout-compatibility, running-before-dispatch and result-fence failures, then independently verify real provider/deployment layers. No D0020/D0030 implementation or existing-Case migration is bundled into this Task.
- **Lane:** Group F cumulative lane; current activation is resolved from `WORKBOARD.md`.

### D0020 — AgentDO Connection, Capacity and Delivery Owner

- **Group:** F
- **Status:** planned / required
- **Purpose:** define the durable owner of Agent connection epoch, current connection, bounded delivery queue/capacity, delivery receipts and reconnect state.
- **Explicit non-owners:** AgentDO does not own Task lifecycle, accepted result, Case terminal state, semantic root or Promotion.
- **Must close:** reconnect, duplicate delivery, stale epoch, Agent crash, late result, capacity admission, queue overflow, cancel/timeout races, in-flight resource budget ownership.
- **Cheapest falsifier:** two epochs plus disconnect/reconnect with stale delivery/result and queue/capacity saturation.
- **Exit:** one durable Agent connection/delivery owner with stale-instance fencing and bounded live-work admission.
- **Lane:** successor cumulative `group/f-cloudflare-runtime`.

### D0021 — Distributed Target Claims / Runtime Fencing

- **Group:** F
- **Status:** conditional
- **Purpose:** provide one durable cross-Case exclusion owner only if representative MVP workloads require conflicting target operations across Cases.
- **Candidate owners:** AgentDO, ProjectDO, dedicated TargetDO or equivalent; ownership must follow the target whose conflicts must serialize.
- **Must close if activated:** lease generation, concurrency, expiry/liveness, stale holder, restart, commit-time validation and failure recovery.
- **Cheapest falsifier:** two independent Cases contend for one target across owner restart and stale lease generation.
- **Exit:** distributed exclusion proven, or evidence explicitly moves this capability post-MVP because MVP workload does not need it.
- **Lane:** successor cumulative `group/f-cloudflare-runtime`.

### D0022 — Artifact/Content Storage and Query Projection

- **Groups:** F/E
- **Status:** conditional on selected context/artifact architecture
- **Purpose:** define immutable byte storage and query/locator projection only where D0016/D0017 or deployed Artifact handling requires them.
- **Candidate mapping:** R2/equivalent for immutable bytes; D1/equivalent for locator/query projection.
- **Explicit non-owner:** object existence or D1 row existence is never Case/semantic authority.
- **Must close if activated:** owner/key identity, integrity, authorization, lifecycle, delete/GC, retry, corruption, migration and reader protection.
- **Cheapest falsifier:** missing/corrupt/stale object plus duplicate publication and authorization denial without semantic-state change.
- **Exit:** selected byte/query owners are independently rebuildable or explicitly authoritative only for their narrow declared fact.
- **Lane:** whichever cumulative Group first makes the storage mandatory: E if required for context delivery, otherwise a later inherited checkpoint such as F.

### D0023 — MCP Command and Projection Surface

- **Group:** G
- **Status:** planned / required
- **Purpose:** implement a real versioned MCP server/projection/command surface over existing Case semantics.
- **Candidate operations:** Case create/get/events/run/cancel/reconcile/claims/artifact/promotion as justified by product contract; exact set requires Design.
- **Must close:** versioned strict schemas, duplicate-safe parsing, request IDs, idempotent replay, expected revision/fencing, bounds, reconnect/resume and current supported client qualification.
- **Explicit non-owner:** MCP is ingress/projection, not readiness, Task lifecycle, Claim or canonical-tree authority.
- **Cheapest falsifier:** duplicate request + stale expected revision + reconnect/resume against one deployed endpoint.
- **Exit:** real current client passes supported command/projection matrix.
- **Lane:** successor cumulative `group/g-mcp-security`, created from final Group F.

### D0024 — MCP Authentication, Authorization and Tenant Security

- **Group:** G
- **Status:** planned / required
- **Purpose:** close the security model around the real MCP surface.
- **Must distinguish:** user authentication; tenant authorization; Case access; Task capability admission; cross-Case claim/fencing; Agent registration/identity.
- **Must close:** unauthenticated denial, cross-tenant denial, stale session, least privilege, replay, Artifact authorization, payload/rate limits, audit, secret exclusion and reconnect behavior.
- **Cheapest falsifier:** authenticated tenant A attempts Case/Artifact access for tenant B while preserving zero semantic effect.
- **Exit:** supported client auth flow plus explicit tenant/Case denial matrix and credential-rotation/revocation path.
- **User action:** identity/provider configuration as selected; exact permissions documented.
- **Lane:** successor cumulative `group/g-mcp-security`.

### D0025 — Runtime Git Publication Integration

- **Groups:** C/F
- **Status:** planned / required
- **Purpose:** place D0011/D0012 publication in the deployed runtime without letting ordinary Tasks or provider state become semantic authority.
- **Placement decision:** authenticated local Agent, dedicated publication worker/lane, or another fenced owner; decide from runtime/security evidence.
- **Must close:** exact candidate/predecessor binding, credential isolation, branch policy/protection, response loss, provider rejection, reconcile/rollback, minimum permissions.
- **Cheapest falsifier:** ambiguous remote publication followed by exact remote reread, plus predecessor conflict and authorization denial.
- **Exit:** deployed Promotion -> Git candidate -> authenticated remote publication succeeds and fails safely under the selected provider policy.
- **User action:** GitHub app/token/SSH/branch rules as selected; document create/verify/revoke.
- **Lane:** cumulative Group F when runtime placement is selected; Group C source evidence is inherited through ancestry.

### D0026 — Cloudflare Deployment Package and Configuration

- **Groups:** F/H
- **Status:** planned / required
- **Purpose:** make the selected runtime deployable from a fresh supported Cloudflare project.
- **Must close:** Worker config, DO bindings/migrations, environments, R2/D1 only if selected, routes, secret names, provider/GitHub/MCP bindings and rollback-compatible deployment procedure.
- **Secret rule:** repository contains secret names/purpose/permissions/provision/apply/verify instructions, never credential values.
- **Cheapest falsifier:** fresh non-production project deploy from documented commands with one controlled rollback.
- **Exit:** reproducible configuration/deploy/rollback with expected provider state independently checked.
- **User action:** Cloudflare account/token, DNS/domain if needed, secret injection and provider approvals.
- **Lane:** first cumulative Group whose exit requires it, likely F for runnable deployment with H inheriting and qualifying it.

### D0027 — Local Agent Runtime and Secure Registration

- **Groups:** F/G/H
- **Status:** planned / required
- **Purpose:** turn the local Agent from architecture mapping into an installable, authenticated runtime owner for OS/Git/process/network truth.
- **Must close:** installation, identity, secure registration, AgentDO binding, connection auth, reconnect, repo/Git/model/tool access, bounded environment, secret filtering, version compatibility, update/restart.
- **Explicit non-owner:** local Agent does not own Case semantic authority.
- **Cheapest falsifier:** fresh machine registration, disconnect/reconnect with new epoch, stale Agent rejection and secret-exclusion check.
- **Exit:** fresh supported machine joins the deployed runtime and can execute a bounded real Task under correct fencing.
- **User action:** machine install permissions, local credentials/keys and selected model/Git access.
- **Lane:** initiated on cumulative Group F when runtime work begins; G and H inherit and may harden/qualify it without merging independent branches.

### D0028 — Operational Observability and Recovery

- **Group:** H
- **Status:** planned / required bounded operations gate
- **Purpose:** define non-authoritative operational observation and incident recovery for the deployed MVP.
- **Must separate:** semantic evidence from operational metrics/logs.
- **Must cover:** CaseDO unavailable/restart, AgentDO reconnect storm, Agent offline, provider outage, Git failure, stale deploy, migration problem, credential rotation and rollback.
- **Metrics candidates:** latency, queue, retries, Agent/provider/cache/publication observations; none becomes semantic authority.
- **Cheapest falsifier:** selected component outage with documented detection, bounded degradation and recovery/rollback.
- **Exit:** runbooks and observation prove recovery without inventing semantic success from missing telemetry.
- **Lane:** successor cumulative `group/h-deployment-qualification`, created from final Group G.

### D0029 — Full Deployed MVP Qualification

- **Group:** H
- **Status:** planned / required final gate
- **Purpose:** prove the cumulative product meets the final Level-4 definition.
- **Required flow:** MCP/client -> Worker/API -> CaseDO -> parallel Tasks -> AgentDO -> local Agent/model provider -> isolated results -> CaseDO acceptance -> Promotion -> Git projection -> authenticated GitHub publication, including conditional storage/target owners when selected.
- **Minimum matrix:** clean success; parallel same-base work; retry; cancellation; Agent disconnect/restart; CaseDO restart; duplicate command/delivery; stale Attempt; provider/model/context/wrong-base/resource failure; Git conflict/response loss/auth denial; MCP unauth/cross-tenant denial; deployment restart/migration/rollback; final published repository correctness.
- **Cheapest falsifier:** start with deterministic single-failure injections before any load/SLO experiment.
- **Exit:** all mandatory Groups meet exit criteria and representative deployed success/failure/recovery/security/rollback evidence is accepted.
- **User action:** execute or approve unavoidable provider/account/credential steps from documented procedures.
- **Lane:** cumulative `group/h-deployment-qualification`, which already inherits the accepted E+F+G checkpoints; the MVP prototype ref is created only from its exact final accepted head.

### D0030 — Immutable Journal Publication Portability

- **Groups:** B/F
- **Status:** accepted — publication contract and native integration route frozen; production implementation/verification remains separate
- **Purpose:** preserve D0005 immutable-journal durable format and commit meaning behind a backend-neutral prewritten/fsynced regular-file atomic no-replace publication contract while closing the inherited Termux hard-link portability gap without reopening Group E.
- **Selected second backend:** same-directory `renameat2(..., RENAME_NOREPLACE)` only on an exact runtime/filesystem/integration profile that is positively qualified; the existing hard-link backend remains valid where independently qualified.
- **Selected integration:** bounded fd-relative standalone native helper. JS opens the Case directory and passes only that inherited directory fd plus generated single-component basenames; the helper owns one `RENAME_NOREPLACE` syscall, uses a dedicated begin/result fd, no shell/network/config/secret access, and no fallback. Node-API remains a measured comparator because post-syscall native abort killed the host Node process.
- **Capability rule:** probe the actual writable Case filesystem with non-authoritative dot names; unsupported syscall/filesystem/policy/integration or missing/mismatched helper identity fails closed as `store_publication_unsupported` and never silently falls back to plain rename, copy, check-then-rename, direct-final write, `O_TMPFILE`+link or symlink publication. Restart/helper replacement/validity-key change requires requalification.
- **Ambiguity:** complete write -> file fsync -> no-replace publication -> Case-directory fsync. Failure known before the helper begin marker is no-successor; after begin, timeout/kill/abnormal exit/result loss or directory-sync failure is `store_commit_ambiguous` plus mandatory reread and never blind retry.
- **Compatibility and mixed writers:** committed regular-file names/bytes/schema/replay/migration/downgrade remain unchanged. Independent Debian/ext4 testing produced 100/100 exact-one-winner hard-link-versus-rename races; mixed writers are allowed only where both backends are independently qualified for the same deployment validity key, otherwise homogeneous or quiesced/fenced switching is mandatory.
- **Acceptance qualification:** exact Termux/Android/aarch64/F2FS profile passed the directory-local capability/adversarial/ambiguity matrix and unchanged 26/26 immutable-journal oracle through a scratch helper route; independent Debian 13.3/x86_64/ext4 passed the helper/addon/capability/ambiguity rows and 100 mixed races. These are scoped evidence, not universal Android/F2FS/Linux claims.
- **Evidence:** prior research `docs/evidence/group-f-d0030-immutable-publication-portability-research-2026-08-13.json` SHA-256 `370cb70792afd1e79395f7578e10502330d254e54cfdb6120d064450566a915f`; acceptance convergence `docs/evidence/group-f-d0030-publication-portability-acceptance-convergence-2026-08-13.json` SHA-256 `239aada0b6f15e75faf6c2c04b779f3d578cdf36956d6b108f67b47ee038fd7b`; Termux falsifier SHA-256 `50aa955cb547e594817e2005df5860e9c1a71eb45f2e47569c1584d33f674ae8`; independent POSIX summary SHA-256 `eeb7f266df67ad087c3695d1fbf30bd5c080946a88822da2fb5a90fab132481b`; falsifier commit `e0d7706d02827d136eada0a9484d8ef6874cb672`.
- **Production implementation:** none yet. At this acceptance checkpoint `src/store.mjs` remains unchanged on the inherited hard-link primitive. The next authorized D0030 Task is post-acceptance production helper/package implementation and independent production qualification under the frozen contract.
- **Unverified/separate:** destructive power-loss remains unverified; tmcp `portable`/`full` validation registry entries are stale because their `verify:sandbox`/`verify:termux` package scripts are absent and must be aligned separately.
- **Lane:** Group F cumulative lane; current activation is resolved from `WORKBOARD.md`; completed Group E is provenance only.

### D0031 — Self-Development Documentation Authority

- **Groups:** cross-cutting self-development; no product Capability Group ownership
- **Status:** accepted revision 2 — 2026-08-14; revision 1 verification is retained as predecessor evidence
- **Purpose:** preserve the r1 bootstrap/history/naming result while correcting its remaining router/derived-state implementation gap: WORKBOARD must support 0..N runnable Design refs, ROADMAP/PROGRAM must not duplicate mutable current routing, and Design-index/documentation validation must be generic.
- **Product scope:** unchanged; this gate changes how tdev itself is developed and verified, not runtime Case/Task/Attempt/provider semantics.
- **Evidence:** r1 inventory `docs/evidence/group-f-d0031-documentation-authority-inventory-2026-08-13.json`; r1 verification `docs/evidence/group-f-d0031-documentation-authority-verification-2026-08-13.json`; r2 falsifier `docs/evidence/group-f-d0031-r2-framework-gap-reproduction-2026-08-14.json`; r2 acceptance `docs/evidence/group-f-d0031-r2-framework-acceptance-2026-08-14.json`.
- **Cheapest falsifier:** full validation must accept a WORKBOARD-only F -> G fixture and an empty runnable frontier, reject a reopened/non-authorizing frontier Design, and compare the complete Design registry to a generic deterministic projection with no ID special cases.
- **Exit:** open for revision 2 until A2-A4 implementation and A5 independent verification close those generic routing/registry falsifiers; the inherited ImmutableJournal hard-link all-test profile remains separately unqualified.
- **Lane:** current cumulative development lineage resolved from `WORKBOARD.md`; D0031 does not own branch succession.

## 6. Completed Group E closure map

Group E reached the following closure sequence before the exact checkpoint was retained and Group F was created:

```text
D0016 accepted mechanism decision
   -> D0017 accepted contract decision
   -> D0017 production implementation + independent verification
   -> D0018 final execution/provider boundary where context delivery crosses the real executor
   -> D0022 only if the selected reference/content architecture requires durable content storage
   -> independent Group E exit review
   -> retain exact Group E checkpoint head
   -> create Group F from that exact head
```

D0022 remains conditional. A semantic-preserving reference approach that needs no durable shared content store must not introduce R2/D1 merely because the roadmap contains a planning label.

## 7. Parallelism and critical path

The Design numbers are not a serial queue, but **Capability Group checkpoint publication is linear**.

Likely Design dependency path:

```text
D0016
  -> D0017 / D0018
  -> D0019 + D0020 + D0027 runtime spine
  -> D0023 + D0024 secured product surface
  -> D0025 runtime publication
  -> D0026 deployability
  -> D0028 recovery
  -> D0029 qualification
```

Research that does not preempt an unresolved owner can proceed early, but accepted repository changes follow the active cumulative Group branch:

- Cloudflare CaseDO authority research for D0019;
- AgentDO capacity/delivery research for D0020;
- MCP threat-model/schema research for D0023/D0024;
- GitHub branch-policy/credential research for D0025.

Parallel research must not be presented as accepted implementation and must not create later Group checkpoint refs before their predecessor Group exits.

## 8. External user/provider action register

Every unavoidable external configuration step must eventually include:

| Field | Required content |
| --- | --- |
| actor | user/operator/CI/provider administrator |
| permission | minimum Cloudflare/GitHub/provider/MCP/local-machine permission |
| input | non-secret identifiers plus separately handled secret input |
| action | exact CLI/API/UI operation |
| expected result | provider-visible success state |
| verification | independent read proving the state |
| rollback/revoke | reversal or credential revocation |
| secret warning | where values must never be persisted/logged |

Known categories that must not be forgotten:

- Cloudflare authentication/token and project access;
- Durable Object/Worker/storage bindings/migrations;
- GitHub repository/app/token/SSH and branch policy;
- model-provider credentials if selected;
- MCP client/auth configuration;
- local Agent registration and machine permissions;
- DNS/domain routing if selected;
- production secret injection/rotation.

## 9. Omission-prevention process

Maintain a **coverage chain**, not only a numbered Design list.

For every newly discovered requirement/finding:

1. classify it as product contract, engineering process, evidence gap or post-MVP candidate;
2. identify the product owner, or explicitly record that no product change is needed;
3. map it to one or more Capability Groups;
4. map it to an existing provisional Design/gate, create a new planning entry, or explicitly reject/defer it;
5. give it a cheapest falsifier and exit evidence;
6. identify external user/provider actions;
7. update Group closure and dependency relationships;
8. after implementation, link exact evidence and source identity;
9. after Group closure, verify the exact checkpoint head and successor-creation base so no requirement remains only in conversation/session memory.

The absence of an implementation mechanism is not permission to omit the requirement. Record `unknown` or `conditional` until decided.

## 10. Open-question register

The following questions remain evidence-dependent and can change the provisional plan:

- After D0017 is implemented and D0018 measures the representative real executor/provider boundary, does semantic input volume/disclosure remain material enough to justify a separate ContextSlice Design?
- If ContextSlice later becomes justified, what completeness/dependency/fallback/quality evidence is sufficient without weakening the accepted full-context reference fallback/rollback boundary?
- Does the selected provider/runtime require persistent content storage, making D0022 mandatory?
- Can D0010 authority be hosted in CaseDO without semantic migration, or is an explicit migration required?
- What exact facts must AgentDO own, and which live-resource budget belongs to AgentDO versus local Agent/executor?
- Does the MVP have real cross-Case target conflicts requiring D0021?
- Where is runtime Git publication safest: local Agent, dedicated worker/lane, or another owner?
- Which MCP client/auth flow is the supported MVP target?
- Which deployment/storage components are mandatory versus conditional after actual Cloudflare constraints are measured?
- Which provisional Designs can be combined, split, reordered or removed without hiding independent authority/security/migration decisions?

These questions are not missing work; they are explicit decision gates. A future Design must resolve them from evidence rather than silently assuming an answer.

## 11. Completion reporting

A Group completion report must include:

- exact completed Group branch head;
- exact predecessor checkpoint SHA from which that Group was created;
- Designs accepted/verified and any provisional labels removed or superseded;
- product owners changed;
- source/provider/user configuration evidence;
- unresolved post-MVP items;
- exact successor branch name and proof that it was created from the completed Group head, or the final prototype-fork decision when H completes;
- Termux/GitHub/working-mirror synchronization state for the active ref and any remaining sync debt.

A Group may be engineering-complete while synchronization debt remains, as defined by `docs/development/WORKFLOW.md`. It may not be called a retained checkpoint until the exact final head is elected and recorded, and it may not be called product-qualified if required provider/deployed evidence is still unexecuted.
